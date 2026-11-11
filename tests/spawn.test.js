import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOBAL_BY_KEY } from '../src/config.js';
import { makeSim, place, fieldTotal } from './helpers.js';

const still = { frisk: 0, deathProb: 1, growthPattern: [1] };
const TRICKLE = GLOBAL_BY_KEY.trickle.max;

function levels(energies, globals = {}, seed = 7) {
  return makeSim({
    rules: 'energy',
    seed,
    classes: energies.map((energy) => ({ traits: { ...still, energy } })),
    globals: { energyProb: 1, neutralBand: 0.5, killThreshold: -40, burnThreshold: 60, ...globals },
  });
}

test('a particle appears when a cell has the energy to create it, and that energy leaves the cell', () => {
  const sim = levels([2]);
  const c = sim.world.index(5, 5);
  sim.field[c] = 2;
  sim.step();
  assert.equal(sim.world.cells[c]?.cls, 0);
  assert.equal(sim.field[c], 0);
  assert.equal(sim.totals.spawns, 1);
});

test('not a moment before: too little energy creates nothing', () => {
  const sim = levels([2]);
  sim.field[sim.world.index(5, 5)] = 1.99;
  for (let i = 0; i < 20; i++) sim.step();
  assert.equal(sim.world.particles.length, 0);
});

test('negative classes are paid for by the size of their level, from positive energy', () => {
  const sim = levels([-3]);
  const c = sim.world.index(5, 5);
  sim.field[c] = 2.5;
  sim.step();
  assert.equal(sim.world.particles.length, 0, 'needs 3');
  sim.field[c] = 3.5;
  sim.step();
  assert.equal(sim.world.cells[c]?.energy, -3);
  assert.equal(sim.field[c], 0.5);
});

test('negative energy on the grid creates nothing', () => {
  const sim = levels([-3, 3]);
  sim.field[sim.world.index(5, 5)] = -10;
  for (let i = 0; i < 20; i++) sim.step();
  assert.equal(sim.world.particles.length, 0);
});

test('the biggest level the energy can pay for is chosen', () => {
  const sim = levels([2, -5, 9]);
  const c = sim.world.index(5, 5);
  sim.field[c] = 6;
  sim.step();
  assert.equal(sim.world.cells[c]?.energy, -5);
  assert.equal(sim.field[c], 1);
});

test('a positive and negative class of the same size are chosen about evenly', () => {
  const made = [0, 0];
  for (let seed = 1; seed <= 200; seed++) {
    const sim = levels([3, -3], {}, seed);
    sim.field[sim.world.index(5, 5)] = 3;
    sim.step();
    made[sim.world.cells[sim.world.index(5, 5)].cls]++;
  }
  assert.ok(made[0] > 60 && made[1] > 60, `${made}`);
});

test('a class with no energy level is never created', () => {
  const sim = levels([0]);
  sim.field[sim.world.index(5, 5)] = 50;
  for (let i = 0; i < 20; i++) sim.step();
  assert.equal(sim.world.particles.length, 0);
});

test('nothing is created on an occupied cell, or with Energy_Prob 0', () => {
  const taken = levels([2]);
  const p = place(taken, 0, 5, 5);
  taken.field[p.cell] = 5;
  for (let i = 0; i < 10; i++) taken.step();
  assert.equal(taken.world.particles.length, 1);

  const off = levels([2], { energyProb: 0 });
  off.field[off.world.index(5, 5)] = 5;
  for (let i = 0; i < 10; i++) off.step();
  assert.equal(off.world.particles.length, 0);
});

test('the Steady trickle adds the set amount over time, a whole drop at a time; switched off it adds nothing', () => {
  const on = levels([5], { trickleOn: true, trickle: 30, energyProb: 0, width: 200, height: 200 });
  const drop = 5 * 1.02;
  for (let i = 0; i < 10; i++) on.step();
  const added = fieldTotal(on.field);
  assert.ok(added > 300 - drop && added <= 300 + 1e-9, `${added}`);

  const off = levels([5], { trickleOn: false, trickle: 30, energyProb: 0 });
  off.step();
  assert.equal(fieldTotal(off.field), 0);
});

test('each trickle drop is just big enough for one class, and every class gets the same share of the energy', () => {
  const sim = levels([2, -8], { trickleOn: true, trickle: TRICKLE, energyProb: 0, width: 300, height: 300 });
  for (let i = 0; i < 40; i++) sim.step();
  let small = 0;
  let big = 0;
  for (const v of sim.field) {
    if (v === 0) continue;
    if (Math.abs(v - 2.04) < 1e-9) small++;
    else if (Math.abs(v - 8.16) < 1e-9) big++;
  }
  assert.ok(small > 100 && big > 100);
  const shares = (small * 2.04) / (big * 8.16);
  assert.ok(shares > 0.8 && shares < 1.25, `${small} small and ${big} big drops`);
});

test('the trickle creates every class in the end, more of the cheap ones', () => {
  const sim = levels([1, -3, 5], { trickleOn: true, trickle: 50, width: 100, height: 100 });
  for (let i = 0; i < 100; i++) sim.step();
  const [cheap, middle, dear] = sim.world.counts;
  assert.ok(dear > 0 && middle > dear && cheap > middle, `${sim.world.counts}`);
});

test('the Spawn buffer keeps a cell from creating anything until it holds the buffer plus the level', () => {
  for (const energy of [3, -3]) {
    const below = levels([energy], { spawnBuffer: 20 });
    below.field[below.world.index(5, 5)] = 22.9;
    for (let i = 0; i < 10; i++) below.step();
    assert.equal(below.world.particles.length, 0);

    const enough = levels([energy], { spawnBuffer: 20 });
    enough.field[enough.world.index(5, 5)] = 23;
    enough.step();
    assert.equal(enough.world.particles.length, 1);
    assert.ok(Math.abs(fieldTotal(enough.field) - 20) < 1e-9, 'only its level is paid, and the buffer stays');
  }
});

test('the highest level that fits above the buffer is chosen', () => {
  const pick = (e) => {
    const sim = levels([2, 5], { spawnBuffer: 20 });
    sim.field[sim.world.index(5, 5)] = e;
    sim.step();
    return sim.world.cells[sim.world.index(5, 5)]?.energy;
  };
  assert.equal(pick(21), undefined);
  assert.equal(pick(24), 2);
  assert.equal(pick(26), 5);
});

test('a hot cell keeps creating until it is back down to the buffer', () => {
  const sim = makeSim({
    rules: 'energy',
    classes: [{ traits: { frisk: 1, randomWalk: 1, stayProb: 0, deathProb: 0, energy: 3, growthPattern: [1] } }],
    globals: { energyProb: 1, neutralBand: 0, spawnBuffer: 20, burnThreshold: 60, killThreshold: -40, width: 40, height: 40 },
  });
  sim.field[sim.world.index(20, 20)] = 29;
  for (let i = 0; i < 200; i++) sim.step();
  assert.equal(sim.totals.spawns, 3);
  assert.ok(Math.abs(fieldTotal(sim.field) - 20) < 1e-9);
});

test('the Burn threshold counts from the top of the buffer', () => {
  const on = (e) => {
    const sim = levels([3], { spawnBuffer: 20, burnThreshold: 8 });
    const p = place(sim, 0, 5, 5);
    sim.field[p.cell] = e;
    sim.step();
    return p.alive;
  };
  assert.equal(on(27.9), true);
  assert.equal(on(28), false);
});

test('a trickle smaller than a drop saves up until it can pay for one', () => {
  const sim = levels([3], { spawnBuffer: 20, trickleOn: true, trickle: 1, energyProb: 0 });
  const drop = 23 * 1.02;
  for (let i = 0; i < 23; i++) sim.step();
  assert.equal(fieldTotal(sim.field), 0);
  sim.step();
  assert.ok(Math.abs(fieldTotal(sim.field) - drop) < 1e-9);

  const spawning = levels([3], { spawnBuffer: 20, trickleOn: true, trickle: 1, width: 50, height: 50 });
  for (let i = 0; i < 100; i++) spawning.step();
  assert.ok(spawning.world.particles.length >= 3, `${spawning.world.particles.length}`);
});

test('with a high buffer drops are sized for it, and levels come out nearly even', () => {
  const sim = levels([1, 10], { spawnBuffer: 40, trickleOn: true, trickle: 1000, width: 200, height: 200 });
  for (let i = 0; i < 30; i++) sim.step();
  const [low, high] = sim.world.counts;
  assert.ok(low > 100 && high > 100 && low / high < 1.6, `${low} and ${high}`);
});

test('a world of nothing but level 0 classes doesn’t hang the trickle', () => {
  const sim = levels([0, 0], { trickleOn: true, trickle: 50 });
  sim.step();
  assert.equal(fieldTotal(sim.field), 0);
});

test('dying gives back what creating it cost, whichever the sign', () => {
  for (const energy of [3, -3]) {
    const sim = levels([energy], { burnThreshold: 8, spawnThreshold: 40, energyProb: 1 });
    const p = place(sim, 0, 5, 5);
    sim.field[p.cell] = 8;
    sim.step();
    assert.equal(p.alive, false);
    assert.ok(Math.abs(fieldTotal(sim.field) - (8 + 3)) < 1e-9, `level ${energy}`);
  }
});

test('nothing dies below the thresholds, or from what it touches', () => {
  const sim = levels([4], { burnThreshold: 8, killThreshold: -3 });
  const a = place(sim, 0, 5, 5);
  const b = place(sim, 0, 6, 5);
  sim.field[a.cell] = 3.9;
  sim.field[b.cell] = -2.9;
  for (let i = 0; i < 50; i++) sim.step();
  assert.ok(a.alive && b.alive);
});

test('a particle on energy past the Kill threshold dies too, and Death_Prob 0 never does', () => {
  const sim = levels([4], { killThreshold: -3 });
  const a = place(sim, 0, 5, 5);
  sim.field[a.cell] = -3;
  sim.step();
  assert.equal(a.alive, false);

  const tough = levels([4], { killThreshold: -3 });
  const b = place(tough, 0, 5, 5, { deathProb: 0 });
  tough.field[b.cell] = -50;
  for (let i = 0; i < 50; i++) tough.step();
  assert.ok(b.alive);
});

test('a dying member breaks its bonds, and the molecule carries on without it', () => {
  const sim = levels([6, -1], { burnThreshold: 8, bondRelease: 0.5, growthGap: 5, bondCost: 6 });
  const a = place(sim, 0, 5, 5);
  const b = place(sim, 1, 6, 5);
  const c = place(sim, 1, 7, 5);
  sim.world.addBond(a, b, 0);
  sim.world.addBond(b, c, 0);
  assert.equal(a.mol.members.length, 3);
  sim.field[c.cell] = 8;
  sim.step();
  assert.equal(c.alive, false);
  assert.equal(a.mol, b.mol);
  assert.equal(a.mol.members.length, 2);
  assert.equal(a.mol.net, 5);
  assert.equal(c.bonds.length, 0);
});

test('at the particle limit the trickle creates nothing more, and energy builds up instead', () => {
  const sim = levels([2], { trickleOn: true, trickle: 100, width: 100, height: 100, maxParticles: 1000 });
  for (let i = 0; i < 300; i++) sim.step();
  assert.equal(sim.world.particles.length, 1000);
  assert.ok(fieldTotal(sim.field) > 1000);
});
