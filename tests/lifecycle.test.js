import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIDES, TRAITS, MAX_PATTERN } from '../src/config.js';
import { inheritTraits } from '../src/lifecycle.js';
import { createRng } from '../src/rng.js';
import { tracePattern } from '../src/ui/classesPanel.js';
import { makeSim, place, fieldTotal } from './helpers.js';

const grower = { frisk: 3, randomWalk: 1, connect: 8, stayProb: 0, growthProb: 1 };
const anchor = { frisk: 0, connect: 8, energy: 0 };
const particle = {
  frisk: 2, randomWalk: 0.7, connect: 4, stayProb: 0.5, startProb: 0.4, growthProb: 0.5, patternMutation: 0,
  deathProb: 0.5, energy: 2, variance: 1, pattern: [3, 5], step: 0,
};

test('a primed particle grows its child on the side its pattern points to', () => {
  for (const side of SIDES) {
    const sim = makeSim({
      classes: [{ traits: { ...grower, growthPattern: [side.n] } }, { traits: anchor }],
      growth: [[0, 1], [0, 0]],
    });
    place(sim, 0, 10, 10);
    const opposite = SIDES[(side.n + 3) % 8];
    place(sim, 1, 10 + opposite.dx, 10 + opposite.dy);
    sim.step();
    const child = sim.world.cells[sim.world.index(10 + side.dx, 10 + side.dy)];
    assert.equal(child?.cls, 0, `side ${side.n} (${side.name})`);
    assert.equal(sim.world.counts[0], 2);
  }
});

test('growth conditions are one-way: [a][c] = 0 with [c][a] = 1', () => {
  const sim = makeSim({
    classes: [{ traits: { ...grower, frisk: 0 } }, { traits: { ...grower, frisk: 0 } }],
    growth: [[0, 0], [1, 0]],
  });
  const a = place(sim, 0, 10, 10);
  const c = place(sim, 1, 11, 10);
  sim.step();
  assert.equal(a.primed, false);
  assert.equal(sim.world.counts[0], 1);
  assert.equal(sim.world.counts[1], 2);
  assert.ok(c.alive);
});

test('a primed particle holds still, even after its trigger leaves, until it grows', () => {
  const sim = makeSim({
    classes: [{ traits: { ...grower, growthProb: 0, growthPattern: [3] } }, { traits: { ...anchor, frisk: 2 } }],
    growth: [[0, 1], [0, 0]],
  });
  const a = place(sim, 0, 10, 10);
  const b = place(sim, 1, 9, 10);
  sim.contact(b);
  let bLeft = false;
  for (let i = 0; i < 100; i++) {
    sim.step();
    bLeft ||= !sim.world.adjacent(a.cell, b.cell);
  }
  assert.ok(bLeft, 'the trigger should have wandered off at some point');
  assert.equal(a.primed, true);
  assert.deepEqual([a.x, a.y], [10, 10]);
  sim.world.remove(b);
  sim.setClassTrait(0, 'growthProb', 1);
  sim.step();
  assert.equal(sim.world.counts[0], 2);
  assert.equal(a.primed, false);
});

test('a blocked growth side means no child, and the particle stays primed', () => {
  const sim = makeSim({
    classes: [{ traits: { ...grower, growthPattern: [3] } }, { traits: anchor }],
    growth: [[0, 1], [0, 0]],
  });
  const a = place(sim, 0, 10, 10);
  place(sim, 1, 11, 10);
  for (let i = 0; i < 20; i++) sim.step();
  assert.equal(sim.world.counts[0], 1);
  assert.equal(a.primed, true);
  assert.deepEqual([a.x, a.y], [10, 10]);
});

test('a growing chain takes the next pattern step each generation', () => {
  // East then south: a staircase heading down and to the right, with no side branches.
  const sim = makeSim({
    classes: [{ traits: { ...grower, frisk: 0, growthPattern: [3, 5] } }, { traits: anchor }],
    growth: [[1, 1], [0, 0]],
  });
  place(sim, 0, 5, 5);
  place(sim, 1, 4, 5);
  for (let i = 0; i < 6; i++) sim.step();
  for (const [x, y] of [[6, 5], [6, 6], [7, 6], [7, 7], [8, 7], [8, 8]]) {
    assert.equal(sim.world.cells[sim.world.index(x, y)]?.cls, 0, `(${x}, ${y})`);
  }
  assert.equal(sim.world.counts[0], 7);
});

test('the editor preview shows exactly the cells a chain grows, including where it runs into itself', () => {
  for (const [pattern, ticks] of [[[3, 3, 2, 5], 12], [[3], 8], [[3, 5, 7, 1], 12], [[2, 2, 2, 4, 4, 4], 14]]) {
    const sim = makeSim({
      classes: [{ traits: { ...grower, frisk: 0, growthPattern: pattern } }, { traits: anchor }],
      growth: [[1, 1], [0, 0]],
      globals: { width: 60, height: 60 },
    });
    place(sim, 0, 30, 30);
    place(sim, 1, 29, 31);
    for (let i = 0; i < ticks; i++) sim.step();
    const grown = sim.world.particles.filter((p) => p.cls === 0).map((p) => `${p.x - 30},${p.y - 30}`).sort();
    const traced = tracePattern(pattern, ticks).map(([x, y]) => `${x},${y}`).sort();
    assert.deepEqual(grown, traced, `pattern ${pattern}`);
  }
});

test('a child continues from the next step, wrapping at the end, and the parent keeps its own', () => {
  const sim = makeSim({
    classes: [{ traits: { ...grower, frisk: 0, growthPattern: [3, 5, 7] } }, { traits: anchor }],
    growth: [[0, 1], [0, 0]],
  });
  const a = place(sim, 0, 5, 5);
  place(sim, 1, 4, 5);
  sim.step();
  assert.equal(a.step, 0);
  assert.equal(sim.world.cells[sim.world.index(6, 5)].step, 1);
  assert.equal(inheritTraits({ ...particle, pattern: [3, 5, 7], step: 2 }, createRng(1), 0).step, 0);
});

test('a blocked pattern step is retried, not skipped', () => {
  const sim = makeSim({
    classes: [{ traits: { ...grower, frisk: 0, growthPattern: [3, 5] } }, { traits: anchor }],
    growth: [[0, 1], [0, 0]],
  });
  const a = place(sim, 0, 5, 5);
  place(sim, 1, 6, 5);
  for (let i = 0; i < 10; i++) sim.step();
  assert.equal(sim.world.counts[0], 1);
  assert.equal(a.step, 0);
  assert.equal(a.primed, true);
});

test('Pattern_Mutation 0 keeps the pattern; 1 always changes it, staying within 1 to 6 sides', () => {
  const rng = createRng(11);
  assert.equal(inheritTraits(particle, rng, 0).growthPattern, particle.pattern);

  let pattern = [3];
  const lengths = new Set();
  for (let i = 0; i < 500; i++) {
    const original = pattern.slice();
    const child = inheritTraits({ ...particle, patternMutation: 1, pattern, step: 0 }, rng, 0);
    assert.deepEqual(pattern, original, 'the parent’s pattern must not change');
    assert.notDeepEqual(child.growthPattern, original);
    assert.ok(child.growthPattern.length >= 1 && child.growthPattern.length <= MAX_PATTERN);
    assert.ok(child.growthPattern.every((s) => Number.isInteger(s) && s >= 1 && s <= 8));
    assert.ok(child.step < child.growthPattern.length);
    pattern = child.growthPattern;
    lengths.add(pattern.length);
  }
  assert.equal(lengths.size, MAX_PATTERN);
});

test('Variance 1 copies the numbers exactly; Variance 0 nudges them within range and leaves the pattern alone', () => {
  const rng = createRng(3);
  const parent = { ...particle };
  for (let i = 0; i < 100; i++) {
    const child = inheritTraits(parent, rng, 1);
    for (const def of TRAITS) assert.equal(child[def.key], parent[def.key], def.key);
  }

  parent.variance = 0;
  let changed = 0;
  for (let i = 0; i < 200; i++) {
    const child = inheritTraits(parent, rng, 1);
    for (const def of TRAITS) {
      const v = child[def.key];
      assert.ok(v >= def.min && v <= def.max, `${def.key} = ${v}`);
      if (def.int) assert.ok(Number.isInteger(v), `${def.key} = ${v}`);
      // Start_Prob is only for the charge rules, where nothing grows, so it's passed on as it is.
      if (def.random === false) assert.equal(v, parent[def.key], def.key);
    }
    assert.equal(child.growthPattern, parent.pattern);
    if (TRAITS.some((def) => child[def.key] !== parent[def.key])) changed++;
  }
  assert.equal(changed, 200);
});

test('a doomed particle freezes, dies with Death_Prob, and releases its Energy_level', () => {
  const sim = makeSim({
    classes: [{ traits: { ...grower, growthProb: 0, deathProb: 0, energy: 7.5 } }, { traits: anchor }],
    death: [[0, 1], [0, 0]],
    globals: { spread: 2 },
  });
  const a = place(sim, 0, 10, 10);
  place(sim, 1, 11, 10);
  for (let i = 0; i < 30; i++) sim.step();
  assert.equal(a.doomed, true);
  assert.deepEqual([a.x, a.y], [10, 10]);

  sim.setClassTrait(0, 'deathProb', 1);
  sim.step();
  assert.equal(a.alive, false);
  assert.ok(Math.abs(fieldTotal(sim.field) - 7.5) < 1e-9);
  const peak = sim.field[sim.world.index(10, 10)];
  assert.equal(Math.max(...sim.field), peak);
});

test('if a particle is both doomed and primed, death is rolled first', () => {
  const sim = makeSim({
    classes: [{ traits: { ...grower, deathProb: 1, energy: 1 } }, { traits: anchor }],
    growth: [[0, 1], [0, 0]],
    death: [[0, 1], [0, 0]],
  });
  place(sim, 0, 10, 10);
  place(sim, 1, 9, 10);
  sim.step();
  assert.equal(sim.world.counts[0], 0);
  assert.equal(sim.totals.growths, 0);
});
