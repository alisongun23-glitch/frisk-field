import { detach, tryDock } from './bonds.js';
import { sensePull, UNIT } from './movement.js';
import { crushIfSurrounded } from './crowding.js';
import { SIDES } from './config.js';

// Energy rules: what a molecule does with its turn. Bonded particles keep their shape and move as one.

// Ticks between looking outside the molecule, which is most of what a molecule costs.
const LOOK_EVERY = 12;
// Ticks between checking how deep in a crowd it is. A molecule doesn't get much deeper in that time.
const CRUSH_CHECK_EVERY = 24;
// How often the density map is refreshed, in ticks.
const MAP_EVERY = 16;
// The density map's blocks to one Macro range, and how far each of its two blur passes reaches, adding up to that range.
const BLOCKS_PER_RANGE = 4;
const BLUR_REACH = BLOCKS_PER_RANGE / 2;

// Each member works out where its own level wants to go, from what it senses outside the molecule, with no random walk
// in it. The molecule heads for the average, and a member wanting something very different from the rest may leave.
// Returns true if one did.
function lookAround(sim, mol) {
  const { rng } = sim;
  const { members } = mol;
  const n = members.length;
  const pulls = members.map((m) => sensePull(sim, m, m.energy, false));
  let sumX = 0;
  let sumY = 0;
  let walk = 0;
  let frisk = 0;
  for (let i = 0; i < n; i++) {
    sumX += pulls[i][0];
    sumY += pulls[i][1];
    walk += members[i].randomWalk;
    frisk += members[i].frisk;
  }
  mol.headX = sumX / n;
  mol.headY = sumY / n;
  mol.walk = walk / n;
  mol.frisk = frisk / n;

  // The one that differs most from the rest of them is the one that may leave. The two in a pair differ from each other by
  // the same amount, so there it's always the second one, the guest of the bond that made the pair.
  const { disagreement } = sim.config.globals;
  const differs = (i) => Math.hypot(pulls[i][0] - (sumX - pulls[i][0]) / (n - 1), pulls[i][1] - (sumY - pulls[i][1]) / (n - 1));
  let worst = -1;
  if (n === 2) {
    const by = Math.hypot(pulls[0][0] - pulls[1][0], pulls[0][1] - pulls[1][1]);
    if (by > 0 && by >= disagreement) worst = 1;
  } else {
    let worstBy = disagreement;
    for (let i = 0; i < n; i++) {
      const by = differs(i);
      if (by > 0 && by >= worstBy) {
        worst = i;
        worstBy = by;
      }
    }
  }
  if (worst < 0 || rng.next() < members[worst].stayProb) return false;
  detach(sim, members[worst]);
  return true;
}

const sideFor = (vx, vy) => {
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
};

function moveBy(sim, mol, side) {
  const { world } = sim;
  if (!world.shift(mol.members, SIDES[side].dx, SIDES[side].dy)) return;
  sim.events.moves++;
  // Keep a copy: docking can merge this molecule into another.
  for (const m of mol.members.slice()) tryDock(sim, m);
}

// The member in a molecule's middle: the one whose leaving would leave the biggest remaining piece smallest. Bonds
// never close a ring, so a molecule is a tree and taking out one member splits it into the pieces around it.
export function middleOf(mol) {
  const { members } = mol;
  const n = members.length;
  const at = new Map(members.map((m, i) => [m, i]));
  const parent = new Int32Array(n).fill(-1);
  const order = [0];
  const seen = new Uint8Array(n);
  seen[0] = 1;
  for (let k = 0; k < order.length; k++) {
    const m = members[order[k]];
    for (const b of m.bonds) {
      const j = at.get(b.host === m ? b.guest : b.host);
      if (!seen[j]) {
        seen[j] = 1;
        parent[j] = order[k];
        order.push(j);
      }
    }
  }
  // How many members hang below each one, counting itself.
  const below = new Int32Array(n).fill(1);
  for (let k = n - 1; k > 0; k--) below[parent[order[k]]] += below[order[k]];
  const biggest = new Int32Array(n);
  for (let i = 0; i < n; i++) biggest[i] = n - below[i];
  for (let k = 1; k < n; k++) biggest[parent[order[k]]] = Math.max(biggest[parent[order[k]]], below[order[k]]);
  let best = 0;
  for (let i = 1; i < n; i++) if (biggest[i] < biggest[best]) best = i;
  return members[best];
}

export function moleculeTurn(sim, mol) {
  if (mol.turnAt === sim.tick) return;
  mol.turnAt = sim.tick;
  const { rng, world } = sim;
  // Grown to the Largest molecule, it divides: the member in its middle lets go.
  if (sim.config.globals.divide && mol.members.length >= sim.config.globals.maxMolecule) {
    detach(sim, middleOf(mol));
    sim.events.divisions++;
    return;
  }
  if (sim.tick >= mol.checkAt) {
    mol.checkAt = sim.tick + LOOK_EVERY;
    if (lookAround(sim, mol)) return;
  }
  if (sim.tick >= mol.crushCheckAt) {
    mol.crushCheckAt = sim.tick + CRUSH_CHECK_EVERY;
    if (crushIfSurrounded(sim, mol)) return;
  }
  // Members that can't move on their own slow it down, and only if none of them can does it stay put.
  if (mol.frisk < 1 && rng.next() >= mol.frisk) return;

  const { macroSpeed, pressurePush } = sim.config.globals;
  const anchor = mol.members[0];
  const { pressure } = sim;
  pressure.feel(world, anchor.x, anchor.y, pressurePush);
  const { pushX, pushY } = pressure;

  // At about 0 charges no longer matter to it, and it creeps toward wherever the crowd is denser.
  if (Math.abs(mol.net) <= world.neutralBand) {
    if (pushX === 0 && pushY === 0) {
      if (rng.next() >= macroSpeed) return;
      const side = sim.density.towardMore(world, anchor.x, anchor.y);
      if (side >= 0) moveBy(sim, mol, side);
      return;
    }
    // Pressure pushes against that creep: it moves as often as the two add up to, and stays put where they cancel.
    const side = sim.density.towardMore(world, anchor.x, anchor.y);
    const vx = pushX + (side >= 0 ? UNIT[side][0] * macroSpeed : 0);
    const vy = pushY + (side >= 0 ? UNIT[side][1] * macroSpeed : 0);
    if (rng.next() < Math.hypot(vx, vy)) moveBy(sim, mol, sideFor(vx, vy));
    return;
  }

  // Otherwise it goes where its members agree it should, and where pressure sends it, less often the bigger it is.
  if (rng.next() >= 1 / mol.members.length) return;
  const vx = mol.headX + pushX;
  const vy = mol.headY + pushY;
  const wandering = rng.next() < mol.walk || (vx === 0 && vy === 0);
  moveBy(sim, mol, wandering ? rng.int(8) : sideFor(vx, vy));
}

// One pass of a sliding sum along a line of `n` values, `step` apart in the array: each value becomes the sum of those
// within `reach` of it. Past the end of the line there is nothing, unless it wraps around.
function slide(from, to, start, step, n, reach, wrap) {
  const value = (i) => {
    if (i < 0 || i >= n) {
      if (!wrap) return 0;
      i = ((i % n) + n) % n;
    }
    return from[start + i * step];
  };
  let sum = 0;
  for (let i = -reach; i <= reach; i++) sum += value(i);
  for (let i = 0; i < n; i++) {
    to[start + i * step] = sum;
    sum += value(i + reach + 1) - value(i - reach);
  }
}

// Where the crowds are, at a much coarser scale than particles sense: how many particles, in molecules or not, fall in
// each block of the map, blurred so that a block counts what's up to the Macro range away, nearer blocks more. Molecules
// climb that surface. Free particles count so that a clump keeps its pull once its middle has been crushed. Blocks are
// small next to the range so that clumps don't line up with them. Refreshed every few ticks, since it changes slowly.
export class DensityMap {
  constructor(world, range) {
    this.size = Math.max(1, Math.round(range / BLOCKS_PER_RANGE));
    this.cols = Math.ceil(world.width / this.size);
    this.rows = Math.ceil(world.height / this.size);
    const n = this.cols * this.rows;
    this.mass = new Float64Array(n);
    this.scratch = new Float64Array(n);
    this.blurred = new Float64Array(n);
    this.freshAt = -Infinity;
  }

  refresh(world, tick) {
    if (tick - this.freshAt < MAP_EVERY) return;
    this.freshAt = tick;
    const { mass, scratch, blurred, size, cols, rows } = this;
    const { wrap } = world;
    mass.fill(0);
    for (const p of world.particles) mass[Math.floor(p.y / size) * cols + Math.floor(p.x / size)]++;
    // Two sliding sums each way add up to a falloff with distance.
    const blur = (from, to) => {
      for (let r = 0; r < rows; r++) slide(from, scratch, r * cols, 1, cols, BLUR_REACH, wrap);
      for (let c = 0; c < cols; c++) slide(scratch, to, c, cols, rows, BLUR_REACH, wrap);
    };
    blur(mass, blurred);
    blur(blurred, blurred);
  }

  // The side leading toward a denser crowd from here, or -1 if it's the same all around.
  towardMore(world, x, y) {
    const { blurred, size, cols, rows } = this;
    const col = Math.floor(x / size);
    const row = Math.floor(y / size);
    const at = (c, r) => {
      if (c < 0 || c >= cols || r < 0 || r >= rows) {
        if (!world.wrap) return 0;
        c = (c + cols) % cols;
        r = (r + rows) % rows;
      }
      return blurred[r * cols + c];
    };
    const vx = at(col + 1, row) - at(col - 1, row);
    const vy = at(col, row + 1) - at(col, row - 1);
    return vx === 0 && vy === 0 ? -1 : sideFor(vx, vy);
  }
}
