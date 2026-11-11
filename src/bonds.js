import { bondEnergy } from './charge.js';
import { deposit, drain } from './energy.js';

// Energy rules: connecting. A class's pattern lists the sides partners dock on, in order, and a bond forms when a
// particle arrives on the next open one. A particle holds as many bonds as its pattern lists sides, whichever of the two
// the pattern followed. The energy a bond costs is stored in it and released when it breaks.

// How many partners a pattern holds. A side listed twice still only holds one.
function holds(pattern) {
  let sides = 0;
  let count = 0;
  for (const side of pattern) {
    if ((sides & (1 << side)) === 0) count++;
    sides |= 1 << side;
  }
  return count;
}

export const hasRoom = (p) => p.bonds.length < holds(p.pattern);

// The next side of `host` wanting a partner, as a pattern entry from 1 to 8, or 0 if there's none. A side holding a
// partner, or blocked by some other particle or a wall, is passed over. `guest` doesn't count as blocking its own way in.
export function nextSide(world, host, guest = null) {
  if (!hasRoom(host)) return 0;
  for (const side of host.pattern) {
    const c = world.nbr[host.cell * 8 + side - 1];
    if (c < 0) continue;
    const q = world.cells[c];
    if (q === null || q === guest) return side;
  }
  return 0;
}

const bonded = (a, b) => a.bonds.some((bond) => bond.host === b || bond.guest === b);

// Past the Stable limit, a bond with the same sign would only take a particle further from 0, so it isn't one to make.
export const refusesBond = (a, b, stableLimit) => a * b > 0 && (Math.abs(a) > stableLimit || Math.abs(b) > stableLimit);

// Can this host take this guest? Returns what it would cost, or -1 if not. Neither may be crushed, both need room for
// another bond, neither molecule may already be at about 0, together they must fit the Largest molecule, and the grid
// around the guest has to be able to pay. Two free particles also have to want to start a molecule.
export function bondPrice(sim, host, guest) {
  const { world, field, kernel } = sim;
  const { bondCost, growthGap, maxMolecule, stableLimit } = sim.config.globals;
  if (host.crushed || guest.crushed || refusesBond(host.energy, guest.energy, stableLimit)) return -1;
  if (!hasRoom(host) || !hasRoom(guest) || bonded(host, guest) || world.isNeutral(host) || world.isNeutral(guest)) return -1;
  const size = (host.mol?.members.length ?? 1) + (guest.mol?.members.length ?? 1);
  if (size > maxMolecule && host.mol !== guest.mol) return -1;
  const cost = bondEnergy(host.energy, guest.energy, bondCost, growthGap);
  if (cost > 0 && energyNear(world, field, guest.cell, kernel) < cost) return -1;
  return startsMolecule(sim, host, guest) ? cost : -1;
}

// Two free particles start a molecule only as often as the less willing of them lets it. Joining one is always fine.
export const startChance = (a, b) => (a.mol === null && b.mol === null ? Math.min(a.startProb, b.startProb) : 1);
function startsMolecule(sim, a, b) {
  const chance = startChance(a, b);
  return chance >= 1 || (chance > 0 && sim.rng.next() < chance);
}

// The positive energy around a cell, as far as a bond there can reach.
export function energyNear(world, field, cell, kernel) {
  const { width: W, height: H } = world;
  const x = cell % W;
  const y = Math.floor(cell / W);
  const { reach } = kernel;
  let sum = 0;
  if (x >= reach && y >= reach && x < W - reach && y < H - reach) {
    for (let i = 0; i < kernel.length; i++) {
      const e = field[cell + kernel[i].dy * W + kernel[i].dx];
      if (e > 0) sum += e;
    }
    return sum;
  }
  for (const k of kernel) {
    const c = world.index(x + k.dx, y + k.dy);
    if (c >= 0 && field[c] > 0) sum += field[c];
  }
  return sum;
}

function connect(sim, host, guest) {
  const cost = bondPrice(sim, host, guest);
  if (cost < 0) return false;
  if (cost > 0) drain(sim.world, sim.field, guest.cell, cost, sim.kernel);
  sim.world.addBond(host, guest, cost);
  sim.events.connects++;
  return true;
}

// `p` just arrived somewhere: bond with anyone it now sits on the next open side of, or who sits on its own.
// Returns true if it bonded.
export function tryDock(sim, p) {
  const { world } = sim;
  let docked = false;
  for (let s = p.cell * 8, end = s + 8; s < end; s++) {
    const c = world.nbr[s];
    if (c < 0) continue;
    const q = world.cells[c];
    if (q === null || (p.mol !== null && q.mol === p.mol)) continue;
    const theirs = nextSide(world, q, p);
    if (theirs > 0 && world.nbr[q.cell * 8 + theirs - 1] === p.cell) {
      if (connect(sim, q, p)) docked = true;
      continue;
    }
    const ours = nextSide(world, p, q);
    if (ours > 0 && world.nbr[p.cell * 8 + ours - 1] === q.cell && connect(sim, p, q)) docked = true;
  }
  return docked;
}

// Everything a broken bond gives back: what it cost to make, plus the small amount every break adds.
function release(sim, bond) {
  const amount = bond.stored + sim.config.globals.bondRelease;
  deposit(sim.world, sim.field, bond.guest.cell, amount, sim.kernel);
  sim.events.breaks++;
}

// `p` leaves its molecule: all its bonds break and their energy goes into the grid.
export function detach(sim, p) {
  for (const bond of p.bonds.slice()) {
    release(sim, bond);
    sim.world.removeBond(bond);
  }
}

// The same with no energy released, for when a brush or a deleted class removes a particle.
export function dropBonds(world, p) {
  for (const bond of p.bonds.slice()) world.removeBond(bond);
}
