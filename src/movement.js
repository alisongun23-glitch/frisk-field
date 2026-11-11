import { SIDES } from './config.js';
import { chargePull, bondEnergy } from './charge.js';
import { hasRoom, nextSide, energyNear, tryDock, refusesBond, startChance } from './bonds.js';

// How much a particle's last heading counts when it picks a non-random direction.
const INERTIA = 0.25;
export const UNIT = SIDES.map(({ dx, dy }) => [dx / Math.hypot(dx, dy), dy / Math.hypot(dx, dy)]);
export const NO_DRIFT = [0, 0, 0];

// The most nearby particles one particle takes into account. Past this the nearest ones have already decided it.
const MAX_SENSED = 12;
// How far away, in cells, something connectable takes over from the general pull.
const STEER_RANGE = 3;
// How strongly levels of the same sign pull when the grid around them could pay for the bond.
const SIMILAR_PULL = 0.25;

// A cell within the sense radius, with its unit vector pre-scaled by a linear falloff (closer counts more).
function senseCell(ox, oy, radius, width) {
  const d = Math.hypot(ox, oy);
  const f = (1 - d / (radius + 1)) / d;
  return { ox, oy, shift: oy * width + ox, dist: d, fx: ox * f, fy: oy * f, near: 1 - d / (radius + 1) };
}

// Every cell within the sense radius. Energy rules look through them nearest first.
export function senseOffsets(radius, width) {
  const out = [];
  for (let oy = -radius; oy <= radius; oy++) {
    for (let ox = -radius; ox <= radius; ox++) {
      const d = Math.hypot(ox, oy);
      if (d === 0 || d > radius + 0.5) continue;
      out.push(senseCell(ox, oy, radius, width));
    }
  }
  out.reach = radius;
  out.nearFirst = [...out].sort((a, b) => b.near - a.near);
  // Kept apart from the rest, since most cells looked at turn out to be empty.
  out.nearShifts = Int32Array.from(out.nearFirst, (o) => o.shift);
  return out;
}

// Net pull (positive tendency) or push (negative) on `p` from particles it can sense, capped at length 1.
export function drift(world, p, row, offsets) {
  const { width: W, height: H, wrap, cells } = world;
  let dx = 0;
  let dy = 0;
  for (const o of offsets) {
    let x = p.x + o.ox;
    let y = p.y + o.oy;
    if (x < 0 || x >= W) {
      if (!wrap) continue;
      x = x < 0 ? x + W : x - W;
    }
    if (y < 0 || y >= H) {
      if (!wrap) continue;
      y = y < 0 ? y + H : y - H;
    }
    const q = cells[y * W + x];
    if (q === null) continue;
    const t = row[q.cls];
    if (t !== 0) {
      dx += t * o.fx;
      dy += t * o.fy;
    }
  }
  const len = Math.hypot(dx, dy);
  return len > 1 ? [dx / len, dy / len] : [dx, dy];
}

// Energy rules: what a particle senses around it, taken as a particle with this level. Each pull is worked out from
// charge, and the third number returned says how close the nearest thing it could connect with is, from 0 (none in
// range) toward 1. A molecule at about 0 attracts nothing, and neither does anything too costly for the grid to bond.
// With `steer` on, something connectable close by takes over: the particle heads for the side it has to dock on.
// Past the Stable limit, every opposite charge pulls in full and its own sign pushes it away.
export function sensePull(sim, p, level, steer) {
  const { world, field, offsets, kernel } = sim;
  const { growthGap, bondCost, chargePull: strength, stableLimit } = sim.config.globals;
  const overcharged = Math.abs(level) > stableLimit;
  const { cells } = world;
  const { nearFirst, nearShifts } = offsets;
  const inside = isInside(world, p, offsets.reach);
  let dx = 0;
  let dy = 0;
  let near = 0;
  let nearest = null;
  let nearestAt = null;
  let sensed = 0;
  for (let k = 0; k < nearShifts.length; k++) {
    const i = inside ? p.cell + nearShifts[k] : wrappedCell(world, p, nearFirst[k]);
    if (i < 0) continue;
    const q = cells[i];
    if (q === null) continue;
    const o = nearFirst[k];
    if ((p.mol === null || q.mol !== p.mol) && !world.isNeutral(q)) {
      const refused = refusesBond(level, q.energy, stableLimit);
      const cost = refused ? 0 : bondEnergy(level, q.energy, bondCost, growthGap);
      const payable = !refused && (cost === 0 || energyNear(world, field, i, kernel) >= cost);
      const t = (refused ? -1 : overcharged ? 1 : cost > 0 && payable ? SIMILAR_PULL : chargePull(level, q.energy, growthGap)) * strength;
      dx += t * o.fx;
      dy += t * o.fy;
      if (payable && !p.crushed && !q.crushed && o.near > near && hasRoom(q) && startChance(p, q) > 0) {
        near = o.near;
        nearest = q;
        nearestAt = o;
      }
    }
    if (++sensed >= MAX_SENSED) break;
  }
  if (steer && nearest !== null && nearestAt.dist <= STEER_RANGE) {
    const way = wayToDock(world, p, nearest, nearestAt);
    if (way !== null) return [way[0], way[1], near];
  }
  const len = Math.hypot(dx, dy);
  return len > 1 ? [dx / len, dy / len, near] : [dx, dy, near];
}

// The direction to where `p` would dock with a particle at offset `o`: on its next open side, or failing that,
// so it sits on the next open side of `p`. Null if neither can be done or `p` is already there.
function wayToDock(world, p, q, o) {
  let rx;
  let ry;
  const theirs = nextSide(world, q, p);
  if (theirs > 0) {
    rx = o.ox + SIDES[theirs - 1].dx;
    ry = o.oy + SIDES[theirs - 1].dy;
  } else {
    const ours = nextSide(world, p, q);
    if (ours === 0) return null;
    rx = o.ox - SIDES[ours - 1].dx;
    ry = o.oy - SIDES[ours - 1].dy;
  }
  const len = Math.hypot(rx, ry);
  return len === 0 ? null : [rx / len, ry / len];
}

export const isInside = (world, p, reach) => p.x >= reach && p.y >= reach && p.x < world.width - reach && p.y < world.height - reach;

// The cell at an offset from a particle near an edge, or -1 past a wall.
export function wrappedCell(world, p, o) {
  const { width: W, height: H, wrap } = world;
  let x = p.x + o.ox;
  let y = p.y + o.oy;
  if (x < 0 || x >= W) {
    if (!wrap) return -1;
    x = x < 0 ? x + W : x - W;
  }
  if (y < 0 || y >= H) {
    if (!wrap) return -1;
    y = y < 0 ? y + H : y - H;
  }
  return y * W + x;
}

// The side closest to where the particle means to go: its drift plus a little of its last heading.
export function intentDir(p, d, rng) {
  let vx = d[0];
  let vy = d[1];
  if (p.lastDir >= 0) {
    vx += INERTIA * UNIT[p.lastDir][0];
    vy += INERTIA * UNIT[p.lastDir][1];
  }
  if (vx * vx + vy * vy < 1e-12) return rng.int(8);
  let best = 0;
  let bestDot = -Infinity;
  for (let s = 0; s < 8; s++) {
    const dot = vx * UNIT[s][0] + vy * UNIT[s][1];
    if (dot > bestDot) {
      bestDot = dot;
      best = s;
    }
  }
  return best;
}

// Under energy rules, the closer something it could connect with is, the less of its walk is random.
function pickDir(sim, p) {
  const { rng } = sim;
  if (!sim.energyRules) return rng.next() < p.randomWalk ? rng.int(8) : intentDir(p, sim.driftOf(p), rng);
  const d = sim.seekOf(p);
  return rng.next() < p.randomWalk * (1 - sim.config.globals.seekFocus * d[2]) ? rng.int(8) : intentDir(p, d, rng);
}

// One tick of movement: pick a direction (noise or intent) and a distance 1..frisk, then step cell by cell until blocked.
// With hand-set matrices it also stops on touching another particle, and under energy rules on bonding with one.
// Returns true if the particle moved.
export function walk(sim, p) {
  const { world, rng } = sim;
  const dir = pickDir(sim, p);
  const dist = 1 + rng.int(p.frisk);
  let moved = false;
  for (let s = 0; s < dist; s++) {
    const target = world.nbr[p.cell * 8 + dir];
    if (!world.canPlace(target, p, p)) break;
    world.move(p, target);
    moved = true;
    if (sim.energyRules) {
      if (tryDock(sim, p)) break;
    } else if (p.touching > 0) {
      sim.contact(p);
      break;
    }
  }
  if (moved) p.lastDir = dir;
  return moved;
}
