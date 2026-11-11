import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasRoom, nextSide, tryDock, detach, energyNear, bondPrice } from '../src/bonds.js';
import { drain } from '../src/energy.js';
import { makeSim, place, arrive, fieldTotal } from './helpers.js';

const N = 1;
const E = 3;
const S = 5;
const W = 7;
const still = { frisk: 0, randomWalk: 1, stayProb: 0, deathProb: 1 };
const world = { neutralBand: 0.5, growthGap: 5, bondCost: 6, bondRelease: 0, width: 40, height: 40 };

function classes(hostLevel, guestLevel, hostSides, guestSides = [S], globals = {}) {
  return makeSim({
    rules: 'energy',
    classes: [
      { traits: { ...still, energy: hostLevel, growthPattern: hostSides } },
      { traits: { ...still, energy: guestLevel, growthPattern: guestSides } },
    ],
    globals: { ...world, ...globals },
  });
}

test('the next side is the first in pattern order that is free, passing over taken sides and walls', () => {
  const sim = classes(6, -1, [N, W, E]);
  const host = place(sim, 0, 10, 10);
  assert.equal(nextSide(sim.world, host), N);
  place(sim, 1, 10, 9);
  assert.equal(nextSide(sim.world, host), W, 'something sits on the top side');
  place(sim, 1, 9, 10);
  assert.equal(nextSide(sim.world, host), E);
  place(sim, 1, 11, 10);
  assert.equal(nextSide(sim.world, host), 0, 'all taken');

  const walled = classes(6, -1, [N, E], [S], { wrap: false });
  const corner = place(walled, 0, 10, 0);
  assert.equal(nextSide(walled.world, corner), E, 'there is no top side at the wall');
  const guest = place(walled, 1, 10, 1);
  assert.equal(nextSide(walled.world, guest), 0 + S, 'its own bottom side');
  const blocker = place(walled, 1, 11, 0);
  assert.equal(nextSide(walled.world, corner, blocker), E, 'a guest doesn’t block its own way in');
});

test('a bond forms only on the next open side, in pattern order', () => {
  const sim = classes(6, -1, [N, W]);
  const host = place(sim, 0, 10, 10);
  const first = place(sim, 1, 15, 15);
  const second = place(sim, 1, 20, 20);
  const third = place(sim, 1, 25, 25);

  assert.equal(arrive(sim, first, 11, 10), false, 'east isn’t in the pattern');
  assert.equal(arrive(sim, first, 9, 10), false, 'west is, but the top side comes first');
  assert.equal(first.mol, null);
  assert.equal(arrive(sim, first, 10, 9), true);
  assert.equal(host.mol, first.mol);
  assert.equal(arrive(sim, second, 9, 10), true, 'now west is next');
  assert.equal(host.mol.members.length, 3);
  assert.equal(arrive(sim, third, 11, 10), false, 'a pattern of 2 holds 2');
  assert.equal(third.mol, null);
});

test('a particle can also dock by getting the other onto its own next side', () => {
  const sim = classes(3, -3, [E], [N]);
  const a = place(sim, 0, 10, 10);
  const b = place(sim, 1, 20, 20);
  // Now b is on a's east side, and a isn't on b's top side.
  assert.equal(arrive(sim, b, 11, 10), true);
  assert.equal(a.bonds[0].host, a);
});

test('touching alone connects nothing and changes nobody’s overall energy', () => {
  const sim = classes(3, -3, [N], [N]);
  const a = place(sim, 0, 10, 10);
  const b = place(sim, 1, 15, 15);
  assert.equal(arrive(sim, b, 11, 10), false);
  assert.equal(a.mol, null);
  assert.equal(sim.world.overallEnergy(a), 3);
  assert.equal(sim.world.overallEnergy(b), -3);
});

test('opposite charges and wide gaps connect for free, leaving the grid alone', () => {
  for (const [a, b] of [[3, -3], [1, 10], [-10, -1]]) {
    const sim = classes(a, b, [N]);
    place(sim, 0, 10, 10);
    const g = place(sim, 1, 20, 20);
    sim.field[g.cell] = 0;
    assert.equal(arrive(sim, g, 10, 9), true, `${a} and ${b}`);
    assert.equal(fieldTotal(sim.field), 0);
    assert.equal(g.bonds[0].stored, 0);
  }
});

test('similar levels connect only when the grid can pay, and the energy leaves the grid', () => {
  const sim = classes(3, 5, [N], [S], { spread: 1 });
  place(sim, 0, 10, 10);
  const g = place(sim, 1, 20, 20);
  const site = sim.world.index(10, 9);
  sim.field[site] = 3;
  assert.equal(arrive(sim, g, 10, 9), false, 'needs 3.6');
  assert.equal(g.mol, null);
  assert.equal(fieldTotal(sim.field), 3);

  sim.field[sim.world.index(11, 9)] = 1;
  assert.equal(energyNear(sim.world, sim.field, site, sim.kernel), 4);
  arrive(sim, g, 20, 20);
  assert.equal(arrive(sim, g, 10, 9), true, 'the nearby cells count too');
  assert.ok(Math.abs(g.bonds[0].stored - 3.6) < 1e-9);
  assert.ok(Math.abs(fieldTotal(sim.field) - 0.4) < 1e-9, 'it took the cost');
  assert.ok(sim.field.every((v) => v >= 0), 'without driving anything negative');
});

test('the closer the levels, the more energy it takes', () => {
  const price = (a, b, energy) => {
    const sim = classes(a, b, [N]);
    const h = place(sim, 0, 10, 10);
    const g = place(sim, 1, 10, 9);
    sim.field[g.cell] = energy;
    return bondPrice(sim, h, g);
  };
  assert.ok(Math.abs(price(3, 5, 4) - 3.6) < 1e-9);
  assert.equal(price(3, 3, 5), -1, 'a match needs 6');
  assert.equal(price(3, 3, 6), 6);
});

test('breaking gives back what the bond stored, plus the minimal amount', () => {
  const free = classes(3, -3, [N], [S], { bondRelease: 0.25 });
  const a = place(free, 0, 10, 10);
  const b = place(free, 1, 20, 20);
  arrive(free, b, 10, 9);
  detach(free, a);
  assert.ok(Math.abs(fieldTotal(free.field) - 0.25) < 1e-9, 'a free bond gives back only a little');
  assert.equal(a.mol, null);
  assert.equal(b.mol, null);
  assert.equal(free.world.molecules.length, 0);
  assert.equal(free.events.breaks, 1);

  const costly = classes(3, 3, [N], [S], { bondRelease: 0.25 });
  const c = place(costly, 0, 10, 10);
  const d = place(costly, 1, 20, 20);
  costly.field[costly.world.index(10, 9)] = 6;
  arrive(costly, d, 10, 9);
  assert.equal(fieldTotal(costly.field), 0, 'all taken out');
  detach(costly, c);
  assert.ok(Math.abs(fieldTotal(costly.field) - 6.25) < 1e-9, 'a costly bond gives back a lot');
});

test('a molecule at about 0 stops connecting, counting all of it', () => {
  const sim = classes(3, -3, [N, E], [W]);
  const a = place(sim, 0, 10, 10);
  const b = place(sim, 1, 20, 20);
  arrive(sim, b, 10, 9);
  assert.equal(sim.world.overallEnergy(a), 0);
  const late = place(sim, 1, 25, 25);
  assert.equal(arrive(sim, late, 11, 10), false, 'the free east side stays empty');

  const near = classes(3, -2.8, [N, E], [W], { neutralBand: 0.1 });
  place(near, 0, 10, 10);
  const nb = place(near, 1, 20, 20);
  arrive(near, nb, 10, 9);
  const other = place(near, 1, 25, 25);
  assert.equal(arrive(near, other, 11, 10), true, 'only 0.2 from 0, past a Neutral range of 0.1');

  const three = makeSim({
    rules: 'energy',
    classes: [{ traits: { ...still, energy: 3, growthPattern: [E, N] } }, { traits: { ...still, energy: -1, growthPattern: [E, S] } }, { traits: { ...still, energy: -2, growthPattern: [E] } }],
    globals: world,
  });
  const c0 = place(three, 0, 10, 10);
  const c1 = place(three, 1, 20, 20);
  const c2 = place(three, 2, 25, 25);
  arrive(three, c1, 11, 10);
  arrive(three, c2, 10, 9);
  assert.equal(three.world.overallEnergy(c1), 0, 'one member counts all the others');
  const late2 = place(three, 1, 30, 30);
  assert.equal(arrive(three, late2, 12, 10), false, 'c1 has a free side, but its molecule is done');
  assert.equal(c0.mol.members.length, 3);
});

test('a particle holds as many bonds as its pattern has sides, as host or guest', () => {
  const sim = makeSim({
    rules: 'energy',
    classes: [
      { traits: { ...still, energy: 4, growthPattern: [E, W] } },
      { traits: { ...still, energy: -1, growthPattern: [N] } },
    ],
    globals: world,
  });
  const left = place(sim, 0, 10, 10);
  const right = place(sim, 0, 12, 10);
  const shared = place(sim, 1, 20, 20);
  // Between the two, it could dock on either's next side, and it holds only one bond.
  assert.equal(arrive(sim, shared, 11, 10), true);
  assert.equal(shared.bonds.length, 1);
  assert.equal(left.bonds.length + right.bonds.length, 1);
  assert.notEqual(left.mol, right.mol);
  assert.equal(nextSide(sim.world, shared), 0, 'it has no room for anyone else');
  const other = place(sim, 1, 25, 25);
  assert.equal(arrive(sim, other, 11, 9), false, 'nor does anything count on its top side');
});

test('a side listed twice still only holds one partner', () => {
  const sim = classes(4, -1, [E, E, W], [W, E]);
  const host = place(sim, 0, 10, 10);
  const first = place(sim, 1, 20, 20);
  const second = place(sim, 1, 25, 25);
  const third = place(sim, 1, 30, 30);
  assert.equal(arrive(sim, first, 11, 10), true);
  assert.equal(arrive(sim, second, 9, 10), true);
  assert.equal(hasRoom(host), false);
  assert.equal(arrive(sim, third, 10, 9), false);
});

test('something with no room left isn’t worth seeking out', () => {
  const sim = makeSim({
    rules: 'energy',
    classes: [
      { traits: { ...still, energy: 4, growthPattern: [E] } },
      { traits: { ...still, energy: -1, growthPattern: [N] } },
    ],
    globals: { ...world, senseRadius: 6 },
  });
  const full = place(sim, 0, 10, 10);
  const taken = place(sim, 1, 25, 25);
  arrive(sim, taken, 11, 10);
  assert.equal(hasRoom(full), false);
  const seeker = place(sim, 1, 7, 10);
  assert.equal(sim.driftOf(seeker)[2], 0);
  assert.notEqual(sim.driftOf(seeker)[0], 0, 'it still feels the charge');
});

test('a particle whose own level is about 0 never connects', () => {
  const sim = classes(0.2, 4, [N], [S]);
  const zero = place(sim, 0, 10, 10);
  const g = place(sim, 1, 20, 20);
  assert.equal(arrive(sim, g, 10, 9), false);
  assert.equal(zero.mol, null);
});

test('a bond won’t make a molecule bigger than the largest allowed', () => {
  const sim = classes(10, -1, [N, E, S, W], [W], { maxMolecule: 3 });
  place(sim, 0, 10, 10);
  const a = place(sim, 1, 20, 20);
  const b = place(sim, 1, 25, 25);
  const c = place(sim, 1, 30, 30);
  assert.equal(arrive(sim, a, 10, 9), true);
  assert.equal(arrive(sim, b, 11, 10), true);
  assert.equal(arrive(sim, c, 10, 11), false);
});

test('overall energy adds up the whole molecule, and splits when a bond in the middle goes', () => {
  const chain = () => {
    const sim = makeSim({
      rules: 'energy',
      classes: [6, -1, 2].map((energy) => ({ traits: { ...still, energy, growthPattern: [E, W] } })),
      globals: { ...world, neutralBand: 0.1 },
    });
    const links = [place(sim, 0, 10, 10), place(sim, 1, 20, 20), place(sim, 2, 25, 25), place(sim, 1, 30, 30)];
    links.slice(1).forEach((p, i) => arrive(sim, p, 11 + i, 10));
    return [sim, links];
  };
  const [sim, [a, b, c, d]] = chain();
  assert.equal(sim.world.overallEnergy(d), 6);
  assert.equal(a.mol, d.mol);
  detach(sim, c);
  assert.equal(sim.world.molecules.length, 1, 'a and b are still joined, and d is on its own');
  assert.equal(a.mol, b.mol);
  assert.equal(a.mol.net, 5);
  assert.equal(c.mol, null);
  assert.equal(d.mol, null);
  assert.equal(sim.world.overallEnergy(d), -1);

  const [middle, [p, q, r, s]] = chain();
  detach(middle, q);
  assert.equal(middle.world.molecules.length, 1);
  assert.equal(r.mol, s.mol);
  assert.equal(r.mol.net, 1);
  assert.equal(p.mol, null);
});

test('two molecules merge when they bond', () => {
  const sim = classes(6, -1, [E], [E], { neutralBand: 0.1 });
  const a = place(sim, 0, 10, 10);
  const b = place(sim, 1, 11, 10);
  sim.world.addBond(a, b, 0);
  const c = place(sim, 1, 20, 20);
  const d = place(sim, 1, 21, 20);
  sim.world.addBond(c, d, 0);
  assert.equal(sim.world.molecules.length, 2);
  sim.world.addBond(b, c, 0);
  assert.equal(sim.world.molecules.length, 1);
  assert.equal(a.mol, d.mol);
  assert.equal(a.mol.net, 6 - 3);
  assert.equal(a.mol.members.length, 4);
});

test('docking checks whoever just arrived, when it is created too', () => {
  const sim = makeSim({
    rules: 'energy',
    classes: [{ traits: { ...still, energy: 3, growthPattern: [E] } }, { traits: { ...still, energy: -3, growthPattern: [E] } }],
    globals: { ...world, energyProb: 1 },
  });
  place(sim, 1, 10, 10);
  sim.setClassMeta(0, { count: 0 });
  sim.field[sim.world.index(11, 10)] = 3;
  sim.step();
  assert.equal(sim.world.molecules.length, 1, 'created right on the side, so it bonds at once');
});

test('draining takes the amount from what is there, in proportion', () => {
  const sim = classes(1, 1, [N], [S], { spread: 1 });
  sim.field[sim.world.index(10, 10)] = 3;
  sim.field[sim.world.index(11, 10)] = 1;
  drain(sim.world, sim.field, sim.world.index(10, 10), 2, sim.kernel);
  assert.equal(sim.field[sim.world.index(10, 10)], 1.5);
  assert.equal(sim.field[sim.world.index(11, 10)], 0.5);
});

test('tryDock leaves a free particle alone when nothing is there', () => {
  const sim = classes(3, -3, [N]);
  const a = place(sim, 0, 10, 10);
  assert.equal(tryDock(sim, a), false);
});
