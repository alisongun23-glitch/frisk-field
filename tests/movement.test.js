import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, place, wrapDelta, distance } from './helpers.js';

test('frisk 0 never moves', () => {
  const sim = makeSim({ classes: [{ traits: { frisk: 0, randomWalk: 1 } }] });
  const p = place(sim, 0, 10, 10);
  for (let i = 0; i < 200; i++) sim.step();
  assert.equal(p.x, 10);
  assert.equal(p.y, 10);
});

test('frisk k moves at most k cells per tick, and sometimes exactly k', () => {
  for (let k = 1; k <= 5; k++) {
    const sim = makeSim({ classes: [{ traits: { frisk: k, randomWalk: 1, connect: 8, stayProb: 0 } }], seed: k });
    const p = place(sim, 0, 15, 15);
    let longest = 0;
    for (let i = 0; i < 300; i++) {
      const { x, y } = p;
      sim.step();
      const step = Math.max(Math.abs(wrapDelta(p.x - x, 30)), Math.abs(wrapDelta(p.y - y, 30)));
      longest = Math.max(longest, step);
    }
    assert.equal(longest, k, `frisk ${k}`);
  }
});

test('ConnectRandomStayProb 1 keeps touching particles in place', () => {
  const sim = makeSim({ classes: [{ traits: { frisk: 3, randomWalk: 1, connect: 8, stayProb: 1 } }] });
  const a = place(sim, 0, 10, 10);
  const b = place(sim, 0, 11, 11);
  for (let i = 0; i < 200; i++) sim.step();
  assert.deepEqual([a.x, a.y, b.x, b.y], [10, 10, 11, 11]);
});

test('ConnectRandomStayProb 0 lets touching particles walk off', () => {
  const sim = makeSim({ classes: [{ traits: { frisk: 1, randomWalk: 1, connect: 8, stayProb: 0 } }] });
  const a = place(sim, 0, 10, 10);
  place(sim, 0, 11, 10);
  for (let i = 0; i < 50; i++) sim.step();
  assert.notDeepEqual([a.x, a.y], [10, 10]);
});

// Average distance between two same-class particles over a short run, across many seeds.
// The grid is large enough that unbiased walkers don't spread to the grid's average distance within the run.
function meanDistance(tendency, randomWalk) {
  const size = 100;
  const ticks = 60;
  const seeds = 30;
  let total = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = makeSim({
      classes: [{ traits: { frisk: 1, randomWalk, connect: 8, stayProb: 0 } }],
      tendency: [[tendency]],
      globals: { senseRadius: 10, width: size, height: size },
      seed,
    });
    const a = place(sim, 0, 45, 50);
    const b = place(sim, 0, 51, 50);
    let sum = 0;
    for (let i = 0; i < ticks; i++) {
      sim.step();
      sum += distance(a, b, size, size);
    }
    total += sum / ticks;
  }
  return total / seeds;
}

test('Same Group Tendency +1 pulls particles together and -1 pushes them apart', () => {
  const neutral = meanDistance(0, 0.5);
  const attract = meanDistance(1, 0.5);
  const repel = meanDistance(-1, 0.5);
  assert.ok(attract < neutral - 2, `attract ${attract.toFixed(2)} vs neutral ${neutral.toFixed(2)}`);
  assert.ok(repel > neutral + 2, `repel ${repel.toFixed(2)} vs neutral ${neutral.toFixed(2)}`);
});

test('RandomWalk 1 ignores tendencies entirely', () => {
  assert.equal(meanDistance(1, 1), meanDistance(-1, 1));
});

test('walls stop particles at the edge', () => {
  const sim = makeSim({
    classes: [{ traits: { frisk: 5, randomWalk: 1, connect: 8, stayProb: 0 } }],
    globals: { wrap: false },
  });
  const p = place(sim, 0, 0, 0);
  for (let i = 0; i < 500; i++) {
    sim.step();
    assert.ok(p.x >= 0 && p.x < 30 && p.y >= 0 && p.y < 30);
  }
});
