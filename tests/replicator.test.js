import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, place, arrive } from './helpers.js';
import { middleOf } from '../src/molecules.js';
import { normalizeConfig } from '../src/config.js';
import { compoundById, compoundWorld } from '../src/compounds.js';
import { Simulation } from '../src/sim.js';

const E = 3;
const W = 7;

// A + that takes partners on its left and right, and a − that does the same.
function rodWorld(startProb = 1, globals = {}) {
  return makeSim({
    rules: 'energy',
    classes: [
      { traits: { energy: 3.5, frisk: 0, stayProb: 1, startProb, growthPattern: [E, W] } },
      { traits: { energy: -3, frisk: 0, stayProb: 1, startProb, growthPattern: [W, E] } },
    ],
    globals: { neutralBand: 0.5, ...globals },
  });
}

// A straight rod of `n`, + − + − ..., starting at (x, y).
function rod(sim, n, x = 5, y = 10) {
  const members = Array.from({ length: n }, (_, i) => place(sim, i % 2, x + i, y));
  for (let i = 1; i < n; i++) sim.world.addBond(members[i - 1], members[i], 0);
  return members;
}

test('Start_Prob 0: two loose particles never bond, but either one joins a molecule', () => {
  const sim = rodWorld(0);
  const plus = place(sim, 0, 20, 20);
  const minus = place(sim, 1, 22, 20);
  assert.equal(arrive(sim, minus, 21, 20), false, 'two loose ones stay apart');
  assert.equal(plus.mol, null);

  // A rod of 2 adds up to 0.5, inside the Neutral range, so a rod of 4 it is.
  const four = rod(sim, 4, 5, 5);
  const joiner = place(sim, 0, 11, 5);
  assert.equal(arrive(sim, joiner, 9, 5), true, 'a loose + joins the rod’s − end');
  assert.equal(joiner.mol, four[0].mol);
});

test('Start_Prob is the chance two loose particles start a molecule, and the less willing one decides', () => {
  let started = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const sim = makeSim({
      rules: 'energy',
      seed,
      classes: [
        { traits: { energy: 3, frisk: 0, startProb: 0.5, growthPattern: [E] } },
        { traits: { energy: -3, frisk: 0, startProb: 1, growthPattern: [W] } },
      ],
    });
    place(sim, 0, 10, 10);
    if (arrive(sim, place(sim, 1, 13, 10), 11, 10)) started++;
  }
  assert.ok(started > 110 && started < 190, `${started} of 300 started`);

  const sure = rodWorld(1);
  place(sure, 0, 10, 10);
  assert.equal(arrive(sure, place(sure, 1, 13, 10), 11, 10), true, 'at 1 they always do');
});

test('the middle of a molecule is the member whose leaving leaves the smallest biggest piece', () => {
  const sim = rodWorld(1, { width: 40 });
  const five = rod(sim, 5, 2, 2);
  assert.equal(middleOf(five[0].mol), five[2]);
  const nine = rod(sim, 9, 2, 6);
  assert.equal(middleOf(nine[0].mol), nine[4]);
  // A − with a + on each side and one more below it.
  const star = makeSim({
    rules: 'energy',
    classes: [
      { traits: { energy: -3, frisk: 0, growthPattern: [E, W, 5] } },
      { traits: { energy: 2, frisk: 0, growthPattern: [1] } },
    ],
  });
  const hub = place(star, 0, 10, 10);
  for (const [x, y] of [[11, 10], [9, 10], [10, 11]]) star.world.addBond(hub, place(star, 1, x, y), 0);
  assert.equal(middleOf(hub.mol), hub);
});

test('Divide when full: a molecule at the Largest molecule lets go of its middle member, and only then', () => {
  const sim = rodWorld(1, { width: 40, divide: true, maxMolecule: 9 });
  const nine = rod(sim, 9);
  const eight = rod(sim, 8, 5, 14);
  sim.step();
  assert.equal(nine[4].mol, null, 'the middle one is loose');
  assert.equal(nine[0].mol.members.length, 4);
  assert.equal(nine[8].mol.members.length, 4);
  assert.notEqual(nine[0].mol, nine[8].mol);
  assert.equal(eight[0].mol.members.length, 8, 'one short of full, it stays whole');
  assert.equal(sim.totals.divisions, 1);

  const off = rodWorld(1, { width: 40, maxMolecule: 9 });
  const kept = rod(off, 9);
  off.step();
  assert.equal(kept[0].mol.members.length, 9, 'with it off a full molecule just stops growing');
});

test('both are off unless a world turns them on, and older saves get Start_Prob 1', () => {
  const config = normalizeConfig({ rules: 'energy', classes: [{ name: 'Old', traits: { energy: 3 } }] });
  assert.equal(config.globals.divide, false);
  assert.equal(config.classes[0].traits.startProb, 1);
});

// The Replicator protein in its own world.
function replicator(seed, value) {
  const c = compoundById('replicator');
  return new Simulation(compoundWorld(c, c.world, seed, value));
}
// Is every molecule a straight rod alternating + and −? Returns how many there are, or -1 if one isn't.
function rods(sim) {
  for (const mol of sim.world.molecules) {
    const ms = [...mol.members].sort((a, b) => a.x - b.x);
    if (!ms.every((m, i) => m.y === ms[0].y && m.x === ms[0].x + i && (i === 0 || m.cls !== ms[i - 1].cls))) return -1;
  }
  return sim.world.molecules.length;
}

test('Replicator: one rod becomes dozens of the same rod, and nothing else ever forms', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const sim = replicator(seed);
    assert.equal(rods(sim), 1);
    for (let i = 0; i < 400; i++) {
      sim.step();
      if (i % 25 === 0) assert.notEqual(rods(sim), -1, `seed ${seed}: something other than a rod at tick ${sim.tick}`);
    }
    assert.ok(rods(sim) >= 30, `seed ${seed}: ${rods(sim)} rods`);
    assert.ok(sim.totals.divisions >= 29, `seed ${seed}: ${sim.totals.divisions} divisions`);
    const fours = sim.world.molecules.filter((m) => m.members.length === 4);
    assert.ok(fours.length > 0);
  }
});

test('Replicator: with no rod to start from, the loose parts never bond', () => {
  for (let seed = 1; seed <= 3; seed++) {
    const sim = replicator(seed, 0);
    for (let i = 0; i < 1500; i++) sim.step();
    assert.equal(sim.world.molecules.length, 0);
    assert.equal(sim.totals.connects, 0);
  }
});
