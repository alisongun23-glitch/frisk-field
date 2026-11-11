import { detach } from './bonds.js';
import { deposit } from './energy.js';
import { isInside, wrappedCell } from './movement.js';
import { burstKernel } from './overcharge.js';

// Energy rules: what being deep inside a crowd does. Molecules creep together at large scale. One surrounded by enough
// others breaks apart into free particles, which can't bond while they're in there, and free particles surrounded by
// enough others fuse in pairs. What happens to those past the Stable limit is in overcharge.js.

// Ticks between a free particle checking how crowded it is, longer while it's nowhere near deep enough. Molecules check
// as often as they look around.
const CROWD_EVERY = 16;
const CROWD_RARELY = 48;
export const SAME_LEVEL = 1e-6;

// Every cell within reach of a particle, nearest first, with the quarter around it that the cell is in. The quarters
// turn like a pinwheel so that they all come out the same size.
export function layerOffsets(reach, width) {
  const out = [];
  for (let oy = -reach; oy <= reach; oy++) {
    for (let ox = -reach; ox <= reach; ox++) {
      const dist = Math.hypot(ox, oy);
      if (dist === 0 || dist > reach + 0.5) continue;
      const quarter = ox > 0 && oy >= 0 ? 0 : ox <= 0 && oy > 0 ? 1 : ox < 0 && oy <= 0 ? 2 : 3;
      out.push({ ox, oy, shift: oy * width + ox, quarter, dist });
    }
  }
  out.sort((a, b) => a.dist - b.dist);
  out.reach = reach;
  // Kept apart from the rest, since this is looked through so often.
  out.shifts = Int32Array.from(out, (o) => o.shift);
  out.quarters = Uint8Array.from(out, (o) => o.quarter);
  return out;
}

const molecules = new Int32Array(4);
const particles = new Int32Array(4);
const emptiest = (q) => Math.min(q[0], q[1], q[2], q[3]);
let stamp = 0;

export const crowdCheckDue = (tick, p) => (tick + p.id) % (p.crowded ? CROWD_EVERY : CROWD_RARELY) === 0;

// How many molecules and how many particles surround `p`, not counting its own molecule. Each number is four times what
// the emptiest quarter around it holds, so a crowd on one side alone counts for nothing. A free particle counts as a
// molecule of its own, so breaking a molecule up never makes the count go down.
export function surroundings(sim, p) {
  const { world, layer } = sim;
  const { cells } = world;
  const { shifts, quarters } = layer;
  const inside = isInside(world, p, layer.reach);
  molecules.fill(0);
  particles.fill(0);
  stamp++;
  for (let k = 0; k < shifts.length; k++) {
    const c = inside ? p.cell + shifts[k] : wrappedCell(world, p, layer[k]);
    if (c < 0) continue;
    const q = cells[c];
    if (q === null) continue;
    const { mol } = q;
    if (mol !== null && mol === p.mol) continue;
    particles[quarters[k]]++;
    if (mol === null) {
      molecules[quarters[k]]++;
    } else if (mol.seen !== stamp) {
      mol.seen = stamp;
      molecules[quarters[k]]++;
    }
  }
  return { molecules: 4 * emptiest(molecules), particles: 4 * emptiest(particles) };
}

// A molecule surrounded by enough others comes apart: all its bonds break and give their energy back. Any one member
// being that deep will do, and a different one may be checked each time. Returns true if it broke.
export function crushIfSurrounded(sim, mol) {
  const { crushLayer } = sim.config.globals;
  if (crushLayer === 0) return false;
  const { members } = mol;
  if (surroundings(sim, members[sim.rng.int(members.length)]).molecules < crushLayer) return false;
  for (const m of members.slice()) {
    m.crushed = true;
    m.crowded = true;
    detach(sim, m);
  }
  sim.events.crushes++;
  return true;
}

// A free particle's turn to see how deep it is. It can't bond while it's crushed, and fuses if it's deep enough and a
// partner is touching it. Returns true if that used it up.
export function checkCrowd(sim, p) {
  const { crushLayer, fusionLayer } = sim.config.globals;
  const around = crushLayer > 0 || fusionLayer > 0 ? surroundings(sim, p) : null;
  p.crushed = crushLayer > 0 && around.molecules >= crushLayer;
  p.fusing = fusionLayer > 0 && around.particles >= fusionLayer;
  p.crowded = (crushLayer > 0 && around.molecules * 2 >= crushLayer) || (fusionLayer > 0 && around.particles * 2 >= fusionLayer);
  return p.fusing && fuseWithNeighbor(sim, p);
}

// Only the same level fuses, and not if double that would be past the Heaviest level.
function fuseWithNeighbor(sim, p) {
  const { world, rng } = sim;
  const level = p.energy * 2;
  if (level === 0 || Math.abs(level) > sim.config.globals.heaviestLevel) return false;
  const from = rng.int(8);
  for (let s = 0; s < 8; s++) {
    const c = world.nbr[p.cell * 8 + ((from + s) & 7)];
    if (c < 0) continue;
    const q = world.cells[c];
    if (q !== null && q.mol === null && Math.abs(q.energy - p.energy) < SAME_LEVEL) return fuse(sim, p, q, level);
  }
  return false;
}

// Two particles become one with double the charge, worth what the two were, and a burst of the opposite charge goes
// into the grid around it.
function fuse(sim, p, q, level) {
  const k = sim.classAtLevel(level, p.cls);
  if (k < 0) return false;
  const { world, field, config, tick } = sim;
  const { cell, crushed } = p;
  world.remove(p);
  world.remove(q);
  const made = world.add(k, config.classes[k].traits, cell, tick);
  made.crushed = crushed;
  made.fusing = true;
  made.crowded = true;
  deposit(world, field, cell, -level * config.globals.fusionBurst, burstKernel(sim, level));
  sim.events.fusions++;
  return true;
}
