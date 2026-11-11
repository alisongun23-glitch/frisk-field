import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, normalizeSites, radiusFor, fractionOf, cellOf, MAX_SITES, MAX_SITE_RADIUS, MAX_COUNT } from '../src/config.js';
import { randomSetup, randomSeeds, randomTraits } from '../src/random.js';
import { createRng } from '../src/rng.js';
import { Simulation } from '../src/sim.js';
import { makeSim, wrapDelta } from './helpers.js';

const quiet = { frisk: 0, energy: 3 };

test('a seed location places its particles within its radius of that spot', () => {
  const size = 200;
  const site = { x: fractionOf(120, size), y: fractionOf(40, size), radius: 15, count: 80 };
  for (const rules of ['matrix', 'energy']) {
    const sim = makeSim({ rules, classes: [{ traits: quiet, sites: [site] }], globals: { width: size, height: size } });
    assert.equal(sim.world.particles.length, 80, rules);
    for (const p of sim.world.particles) {
      assert.ok(Math.hypot(p.x - 120, p.y - 40) <= 15.5 + 1, `${rules}: (${p.x}, ${p.y})`);
    }
  }
});

test('radius 0 and one particle lands on exactly that cell', () => {
  const sim = makeSim({
    classes: [{ traits: quiet, sites: [{ x: fractionOf(7, 30), y: fractionOf(21, 30), radius: 0, count: 1 }] }],
  });
  assert.deepEqual(sim.world.particles.map((p) => [p.x, p.y]), [[7, 21]]);
});

test('scattered particles and seed locations add up, each class with its own', () => {
  const sim = makeSim({
    classes: [
      { traits: quiet, count: 30, sites: [{ x: 0.2, y: 0.2, radius: 10, count: 20 }, { x: 0.8, y: 0.8, radius: 10, count: 25 }] },
      { traits: quiet, sites: [{ x: 0.5, y: 0.5, radius: 10, count: 40 }] },
    ],
    globals: { width: 100, height: 100 },
  });
  assert.deepEqual(sim.world.counts, [75, 40]);
});

test('a location at the edge wraps with wrap on, and stops at the wall with it off', () => {
  const site = { x: fractionOf(1, 100), y: fractionOf(50, 100), radius: 8, count: 60 };
  const wrapped = makeSim({ classes: [{ traits: quiet, sites: [site] }], globals: { width: 100, height: 100 } });
  assert.ok(wrapped.world.particles.some((p) => p.x > 80), 'some wrapped round to the far side');
  assert.ok(wrapped.world.particles.every((p) => Math.abs(wrapDelta(p.x - 1, 100)) <= 9));
  const walled = makeSim({ classes: [{ traits: quiet, sites: [site] }], globals: { width: 100, height: 100, wrap: false } });
  assert.ok(walled.world.particles.every((p) => p.x <= 10));
});

test('it places what fits and no more, without hanging', () => {
  const sim = makeSim({
    rules: 'energy',
    classes: [{ traits: quiet, sites: [{ x: 0.5, y: 0.5, radius: 3, count: 5000 }] }],
    globals: { width: 100, height: 100 },
  });
  const placed = sim.world.particles.length;
  assert.ok(placed > 0 && placed < 50, `${placed}`);
});

test('Reset replays seed locations the same way, and a new seed changes only the exact spots', () => {
  const build = (seed) => makeSim({
    seed,
    classes: [{ traits: quiet, sites: [{ x: 0.5, y: 0.5, radius: 10, count: 50 }] }],
    globals: { width: 100, height: 100 },
  });
  const cells = (sim) => sim.world.particles.map((p) => p.cell).sort((a, b) => a - b);
  const a = build(1);
  assert.deepEqual(cells(a), cells(build(1)));
  const before = cells(a);
  a.reset();
  assert.deepEqual(cells(a), before);
  assert.notDeepEqual(cells(build(2)), before);
});

test('a location stays in the same place on the map when the map is resized', () => {
  assert.equal(cellOf(fractionOf(120, 800), 800), 120);
  for (let x = 0; x < 300; x += 7) assert.equal(cellOf(fractionOf(x, 300), 300), x);
  assert.equal(cellOf(1, 400), 399, 'the far edge stays on the map');
  const site = { x: 0.25, y: 0.75, radius: 0, count: 1 };
  const small = makeSim({ classes: [{ traits: quiet, sites: [site] }], globals: { width: 100, height: 100 } });
  const big = makeSim({ classes: [{ traits: quiet, sites: [site] }], globals: { width: 400, height: 400 } });
  assert.deepEqual([small.world.particles[0].x, small.world.particles[0].y], [25, 75]);
  assert.deepEqual([big.world.particles[0].x, big.world.particles[0].y], [100, 300]);
});

test('loaded seed locations are cleaned up', () => {
  const sites = normalizeSites([{ x: 5, y: -1, radius: 9999, count: 1e9 }, { x: 'a' }, null]);
  assert.deepEqual(sites[0], { x: 1, y: 0, radius: MAX_SITE_RADIUS, count: MAX_COUNT });
  assert.deepEqual(sites[1], { x: 0, y: 0, radius: 0, count: 0 });
  assert.equal(normalizeSites(Array.from({ length: MAX_SITES + 40 }, () => ({}))).length, MAX_SITES);
  assert.deepEqual(normalizeSites('nope'), []);
  assert.deepEqual(normalizeConfig({ classes: [{}] }).classes[0].sites, [], 'older settings have none');
});

test('radiusFor leaves room, and a single particle gets an exact spot', () => {
  assert.equal(radiusFor(1), 0);
  assert.ok(radiusFor(400) < radiusFor(4000));
  assert.ok(radiusFor(1000) ** 2 * Math.PI >= 1000 * 4, 'room to spare');
});

test('hundreds of random seeds: every seed lands on the map, with no scattered count', () => {
  const setup = randomSetup(5, createRng(3), { seeds: 500, size: 12, area: 480000 });
  const all = setup.classes.flatMap((c) => c.sites);
  assert.equal(all.length, 500);
  for (const c of setup.classes) {
    assert.equal(c.count, 0);
    assert.ok(c.sites.length > 50, 'shared out between the classes');
  }
  for (const s of all) {
    assert.ok(s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1);
    assert.equal(s.count, 12);
    assert.equal(s.radius, radiusFor(12));
    assert.equal(s.traits, undefined, 'seeds of a class share its values');
  }
  const sim = new Simulation({ ...setup, rules: 'energy', seed: 3, globals: { width: 800, height: 600 } });
  assert.ok(sim.world.particles.length >= 500 * 12 * 0.95, `${sim.world.particles.length}`);
});

test('a class can hold a thousand seeds, and they all survive a round trip through the settings', () => {
  const sites = Array.from({ length: MAX_SITES + 5 }, (_, i) => ({ x: i / 2000, y: 0.5, radius: 0, count: 1 }));
  assert.equal(MAX_SITES, 1000);
  const config = normalizeConfig({ classes: [{ sites }] });
  assert.equal(config.classes[0].sites.length, MAX_SITES);
  assert.deepEqual(normalizeConfig(JSON.parse(JSON.stringify(config))).classes[0].sites, config.classes[0].sites);
});

test('with its own values on, every seed is its own species and joins the class closest to its level', () => {
  const setup = randomSetup(4, createRng(8), { seeds: 200, size: 5, ownValues: true, area: 480000 });
  const levels = setup.classes.map((c) => c.traits.energy);
  const seen = new Set();
  setup.classes.forEach((c, k) => {
    for (const s of c.sites) {
      seen.add(s.traits.energy);
      const mine = Math.abs(s.traits.energy - levels[k]);
      assert.ok(levels.every((l) => mine <= Math.abs(s.traits.energy - l) + 1e-9));
      assert.ok(s.traits.growthPattern.length >= 1);
    }
  });
  assert.ok(seen.size > 100, 'levels differ from seed to seed');
  const sim = new Simulation({ ...setup, rules: 'energy', seed: 8, globals: { width: 800, height: 600 } });
  const levelsAlive = new Set(sim.world.particles.map((p) => p.energy));
  assert.ok(levelsAlive.size > 100, 'and the particles carry them');
  const config = normalizeConfig(setup);
  assert.deepEqual(config.classes[0].sites[0].traits.growthPattern, setup.classes[0].sites[0].traits.growthPattern);
});

test('seeds can be added to a running world, and join the class list so Reset replays them', () => {
  const sim = makeSim({
    rules: 'energy',
    classes: [{ traits: { energy: 3 } }, { traits: { energy: -3 } }],
    globals: { width: 200, height: 200 },
  });
  const placed = sim.plantSeeds(randomSeeds(sim.config.classes, createRng(4), { seeds: 120, size: 3 }));
  assert.equal(sim.world.particles.length, placed);
  assert.ok(placed > 300);
  const count = sim.config.classes.reduce((t, c) => t + c.sites.length, 0);
  assert.equal(count, 120);
  sim.reset();
  assert.ok(Math.abs(sim.world.particles.length - placed) < 20);
});

test('with 0 seeds, random classes scatter; counts scale with the map', () => {
  const small = randomSetup(4, createRng(3), { seeds: 0, area: 30000 });
  const big = randomSetup(4, createRng(3), { seeds: 0, area: 480000 });
  assert.ok(small.classes.every((c) => c.sites.length === 0 && c.count > 0));
  const sum = (s) => s.classes.reduce((t, c) => t + c.count, 0);
  assert.ok(Math.abs(sum(big) / sum(small) - 16) < 0.1);
});

test('random traits include a charge of either sign', () => {
  const rng = createRng(1);
  const levels = Array.from({ length: 200 }, () => randomTraits(rng).energy);
  assert.ok(levels.some((e) => e > 5) && levels.some((e) => e < -5));
});
