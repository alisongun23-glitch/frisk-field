import { buildKernel, deposit } from './energy.js';
import { detach, tryDock } from './bonds.js';
import { wrappedCell } from './movement.js';

// Energy rules: past the Stable limit a particle can't hold on to its charge unless something neutralizes it, and it tends
// to break back into the two it came from. Fusions make these, in crowding.js.

// A burst's reach doubles no further than this, however heavy the fusion.
const FURTHEST_BURST = 8;
const rings = new Map();

// What steadies this overcharged particle: its molecule, if the whole thing adds up to within the limit; or the field,
// if its cell holds at least as much opposite charge as it has. Null if neither does.
export function steadiedBy(sim, p) {
  const overall = sim.world.overallEnergy(p);
  if (Math.abs(p.energy) <= sim.config.globals.stableLimit) return null;
  if (p.mol !== null && Math.abs(overall) <= sim.config.globals.stableLimit) return 'molecule';
  const e = sim.field[p.cell];
  return overall * e < 0 && Math.abs(e) >= Math.abs(overall) ? 'field' : null;
}

// Where a fusion's burst lands. Up to the Stable limit, that's the usual Spread radius. Past it, the burst goes around the
// new particle rather than on it, where it would either kill it or steady it, and reaches one cell further with each
// doubling, so that neighbors aren't all killed outright.
export function burstKernel(sim, level) {
  const { stableLimit, spread } = sim.config.globals;
  const size = Math.abs(level);
  if (size <= stableLimit) return sim.kernel;
  const reach = Math.min(FURTHEST_BURST, spread + 1 + Math.round(Math.log2(size / stableLimit)));
  if (!rings.has(reach)) {
    const ring = buildKernel(reach).filter((k) => k.dx !== 0 || k.dy !== 0);
    ring.reach = reach;
    rings.set(reach, ring);
  }
  return rings.get(reach);
}

// A free cell for the other piece: one touching it if there is one, or else the nearest within Layer reach. -1 if not.
function roomNear(sim, p) {
  const { world, rng, layer } = sim;
  const from = rng.int(8);
  for (let s = 0; s < 8; s++) {
    const c = world.nbr[p.cell * 8 + ((from + s) & 7)];
    if (c >= 0 && world.cells[c] === null) return c;
  }
  for (const o of layer) {
    const c = wrappedCell(world, p, o);
    if (c >= 0 && world.cells[c] === null) return c;
  }
  return -1;
}

// One becomes two at half its level, its bonds break, and the burst it left when it fused comes back. It waits if there's
// nowhere for the second piece to go, or no room for another class. Returns true if it broke.
export function breakApart(sim, p) {
  const room = roomNear(sim, p);
  if (room < 0) return false;
  const k = sim.classAtLevel(p.energy / 2, p.cls);
  if (k < 0) return false;
  const { world, field, config, tick } = sim;
  const { cell, crushed, energy } = p;
  detach(sim, p);
  world.remove(p);
  const { traits } = config.classes[k];
  const pieces = [world.add(k, traits, cell, tick), world.add(k, traits, room, tick)];
  deposit(world, field, cell, energy * config.globals.fusionBurst, burstKernel(sim, energy));
  for (const piece of pieces) {
    piece.crushed = crushed;
    piece.crowded = true;
    tryDock(sim, piece);
  }
  sim.events.breakups++;
  return true;
}

// An overcharged particle's turn to see if it holds together. Returns true if that used it up.
export function breakIfUnsteady(sim, p) {
  if (sim.rng.next() >= sim.config.globals.instability || steadiedBy(sim, p) !== null) return false;
  return breakApart(sim, p);
}
