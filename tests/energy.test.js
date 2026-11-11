import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKernel, deposit, diffuse, fade } from '../src/energy.js';
import { createRng } from '../src/rng.js';
import { makeSim, place, fieldTotal } from './helpers.js';

const still = { frisk: 0, connect: 8 };

test('with diffusion off, fading in place comes to exactly what the full diffusion step does', () => {
  const sim = makeSim({ classes: [{ traits: {} }], globals: { width: 40, height: 30 } });
  for (const decay of [0, 0.002, 0.05]) {
    const field = new Float64Array(40 * 30);
    const rng = createRng(5);
    for (let i = 0; i < field.length; i++) if (rng.next() < 0.3) field[i] = (rng.next() - 0.4) * (rng.next() < 0.2 ? 1e-4 : 30);
    const out = new Float64Array(field.length);
    const full = diffuse(sim.world, field, out, 0, decay);
    const inPlace = field.slice();
    const faded = fade(inPlace, decay);
    assert.deepEqual(inPlace, out, `decay ${decay}`);
    assert.deepEqual(faded, full, `decay ${decay}`);
  }
});

test('the death kernel peaks at the center, falls off outward, and sums to 1', () => {
  for (const r of [0, 1, 2, 4, 6]) {
    const k = buildKernel(r);
    assert.ok(Math.abs(k.reduce((s, e) => s + e.w, 0) - 1) < 1e-12);
    const byDistance = k.map((e) => [Math.hypot(e.dx, e.dy), e.w]).sort((a, b) => a[0] - b[0]);
    assert.equal(byDistance[0][0], 0);
    for (let i = 1; i < byDistance.length; i++) assert.ok(byDistance[i][1] <= byDistance[i - 1][1] + 1e-15);
  }
});

test('a deposit in a walled corner still adds exactly the amount', () => {
  const sim = makeSim({ classes: [{ traits: still }], globals: { wrap: false } });
  deposit(sim.world, sim.field, sim.world.index(0, 0), 6, buildKernel(3));
  assert.ok(Math.abs(fieldTotal(sim.field) - 6) < 1e-9);
});

test('spawning picks the highest Energy_level the excess can pay for, and pays it', () => {
  const sim = makeSim({
    classes: [{ traits: { ...still, energy: 2 } }, { traits: { ...still, energy: 5 } }, { traits: { ...still, energy: 9 } }],
    globals: { energyProb: 1, spawnThreshold: 4 },
  });
  const c = sim.world.index(5, 5);
  sim.field[c] = 4 + 6;
  sim.step();
  assert.equal(sim.world.cells[c]?.cls, 1);
  assert.ok(Math.abs(sim.field[c] - 5) < 1e-9);
  assert.equal(sim.totals.spawns, 1);
});

test('no spawn when the excess cannot pay for any class', () => {
  const sim = makeSim({
    classes: [{ traits: { ...still, energy: 3 } }, { traits: { ...still, energy: -4 } }],
    globals: { energyProb: 1, spawnThreshold: 4 },
  });
  sim.field[sim.world.index(5, 5)] = 4 + 2.5;
  sim.step();
  assert.equal(sim.world.particles.length, 0);
});

test('a particle on a cell at or below the kill threshold turns into energy', () => {
  const sim = makeSim({ classes: [{ traits: { ...still, energy: 4 } }], globals: { energyProb: 1, killThreshold: -3 } });
  const p = place(sim, 0, 5, 5);
  sim.field[p.cell] = -10;
  sim.step();
  assert.equal(p.alive, false);
  assert.equal(sim.totals.kills, 1);
  assert.ok(Math.abs(fieldTotal(sim.field) - (-10 + 4)) < 1e-9);
});

test('Energy_Prob 0 never spawns or kills', () => {
  const sim = makeSim({ classes: [{ traits: { ...still, energy: 1 } }], globals: { energyProb: 0 } });
  const p = place(sim, 0, 5, 5);
  sim.field[p.cell] = -50;
  sim.field[sim.world.index(20, 20)] = 50;
  for (let i = 0; i < 100; i++) sim.step();
  assert.ok(p.alive);
  assert.equal(sim.world.particles.length, 1);
});

test('diffusion without decay conserves total energy, with wrap and with walls', () => {
  for (const wrap of [true, false]) {
    const sim = makeSim({ classes: [{ traits: still }], globals: { wrap, diffusion: 0.25 } });
    for (let i = 0; i < sim.field.length; i += 7) sim.field[i] = ((i * 37) % 23) - 11;
    const before = fieldTotal(sim.field);
    for (let i = 0; i < 200; i++) sim.step();
    assert.ok(Math.abs(fieldTotal(sim.field) - before) < 1e-6, `wrap ${wrap}`);
  }
});

test('decay shrinks the field by the decay fraction each tick', () => {
  const sim = makeSim({ classes: [{ traits: still }], globals: { decay: 0.01 } });
  sim.field[sim.world.index(3, 3)] = 100;
  sim.step();
  assert.ok(Math.abs(fieldTotal(sim.field) - 99) < 1e-9);
});
