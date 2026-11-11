import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, place } from './helpers.js';

test('no particle ever has more touching neighbors than its Connect Amount', () => {
  const sim = makeSim({
    classes: [
      { traits: { frisk: 2, connect: 1, stayProb: 0.5, growthProb: 0.3, growthPattern: [3], variance: 0 }, count: 150 },
      { traits: { frisk: 1, connect: 3, stayProb: 0.2, growthProb: 0.3, growthPattern: [5] }, count: 150 },
      { traits: { frisk: 3, connect: 0 }, count: 60 },
    ],
    growth: [[1, 1, 0], [1, 0, 0], [0, 0, 0]],
    globals: { width: 40, height: 40, mutation: 0.5 },
  });
  for (let t = 0; t < 400; t++) {
    sim.step();
    for (const p of sim.world.particles) {
      const n = sim.world.neighborCount(p.cell);
      assert.ok(n <= p.connect, `tick ${sim.tick}: particle with Connect Amount ${p.connect} has ${n} neighbors`);
    }
  }
  assert.ok(sim.totals.growths > 0, 'growth should have happened during the run');
});

test('Connect Amount 0: nothing ever touches it', () => {
  const sim = makeSim({
    classes: [
      { traits: { frisk: 1, connect: 0, stayProb: 0 }, count: 5 },
      { traits: { frisk: 2, connect: 8, stayProb: 0 }, count: 300 },
    ],
  });
  for (let t = 0; t < 300; t++) {
    sim.step();
    for (const p of sim.world.particles) {
      if (p.cls === 0) assert.equal(sim.world.neighborCount(p.cell), 0);
    }
  }
});

test('a move that would overload a neighbor is blocked', () => {
  // b already touches one particle and allows only one, so a cannot step in next to it.
  const sim = makeSim({ classes: [{ traits: { frisk: 1, connect: 8 } }, { traits: { frisk: 0, connect: 1 } }] });
  const a = place(sim, 0, 10, 10);
  place(sim, 1, 12, 10);
  place(sim, 1, 13, 10);
  assert.equal(sim.world.canPlace(sim.world.index(11, 10), a, a), false);
  assert.equal(sim.world.canPlace(sim.world.index(10, 11), a, a), true);
});

test('every particle’s touching count stays exact through moves, births, deaths and a change of edges', () => {
  for (const rules of ['matrix']) {
    const sim = makeSim({
      rules,
      classes: [
        { traits: { frisk: 2, connect: 4, stayProb: 0.3, growthProb: 0.5, deathProb: 0.3, growthPattern: [3, 5], energy: 3 }, count: 120 },
        { traits: { frisk: 1, connect: 4, stayProb: 0.3, growthProb: 0.5, deathProb: 0.3, growthPattern: [1], energy: -3 }, count: 120 },
      ],
      growth: [[0, 1], [1, 0]],
      death: [[1, 0], [0, 1]],
      globals: { width: 40, height: 40, energyProb: 0.5, spawnThreshold: 1, killThreshold: -1 },
    });
    const check = () => {
      for (const p of sim.world.particles) assert.equal(p.touching, sim.world.neighborCount(p.cell), `${rules} tick ${sim.tick}`);
    };
    for (let t = 0; t < 300; t++) {
      sim.step();
      check();
    }
    sim.setGlobal('wrap', false);
    check();
    for (let t = 0; t < 100; t++) sim.step();
    check();
    assert.ok(sim.totals.growths > 0, rules);
  }
});
