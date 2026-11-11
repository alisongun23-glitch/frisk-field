import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAITS, MAX_PATTERN, DEFAULT_TRAITS, QUIET_WALK, normalizeConfig, makeClass } from '../src/config.js';
import { PRESETS } from '../src/presets.js';
import { COMPOUNDS } from '../src/compounds.js';
import { randomSetup, randomTraits } from '../src/random.js';
import { createRng } from '../src/rng.js';
import { Simulation } from '../src/sim.js';

const smallWorld = { width: 60, height: 60 };

test('random traits stay inside every spec range and cover them', () => {
  const rng = createRng(2);
  // Start_Prob isn't rolled: a random class starts molecules like any other, and the class default fills it in.
  const rolled = TRAITS.filter((def) => def.random !== false);
  const seen = Object.fromEntries(rolled.map((def) => [def.key, new Set()]));
  const lengths = new Set();
  for (let i = 0; i < 2000; i++) {
    const t = randomTraits(rng);
    assert.equal(t.startProb, undefined);
    for (const def of rolled) {
      const v = t[def.key];
      assert.ok(v >= def.min && v <= def.max, `${def.key} = ${v}`);
      if (def.int) assert.ok(Number.isInteger(v), `${def.key} = ${v}`);
      seen[def.key].add(v);
    }
    assert.ok(t.growthPattern.every((s) => Number.isInteger(s) && s >= 1 && s <= 8));
    lengths.add(t.growthPattern.length);
  }
  for (const def of rolled) {
    if (def.int) assert.equal(seen[def.key].size, def.max - def.min + 1, def.key);
    else assert.ok(seen[def.key].size > 40, def.key);
  }
  assert.equal(lengths.size, MAX_PATTERN);
});

test('a random setup has n classes and n x n rules, and keeps every rule of the world while it runs', () => {
  const setup = randomSetup(5, createRng(5), { conditionChance: 0.5 });
  const sim = new Simulation({ ...setup, seed: 5, globals: { ...smallWorld, energyProb: 0.5, senseRadius: 4 } });
  assert.equal(sim.config.classes.length, 5);
  assert.equal(new Set(sim.config.classes.map((c) => c.color)).size, 5);
  for (const name of ['tendency', 'growth', 'death']) {
    assert.equal(sim.config[name].length, 5);
    assert.ok(sim.config[name].every((row) => row.length === 5));
  }
  assert.ok(sim.config.tendency.flat().every((v) => v >= -1 && v <= 1));
  for (let t = 0; t < 300; t++) {
    sim.step();
    for (const p of sim.world.particles) {
      assert.ok(sim.world.neighborCount(p.cell) <= p.connect, `Connect Amount ${p.connect} exceeded`);
    }
  }
});

test('the condition chance turns conditions all off or all on', () => {
  const off = randomSetup(4, createRng(1), { conditionChance: 0 });
  assert.ok([...off.growth.flat(), ...off.death.flat()].every((v) => v === 0));
  const on = randomSetup(4, createRng(1), { conditionChance: 1 });
  assert.ok([...on.growth.flat(), ...on.death.flat()].every((v) => v === 1));
});

test('the same generator seed gives the same setup, and another seed does not', () => {
  assert.deepEqual(randomSetup(3, createRng(8)), randomSetup(3, createRng(8)));
  assert.notDeepEqual(randomSetup(3, createRng(8)), randomSetup(3, createRng(9)));
});

test('with individuals on, every particle placed on Reset rolls its own values', () => {
  const setup = randomSetup(2, createRng(1));
  const walks = (sim) => new Set(sim.world.particles.filter((p) => p.cls === 0).map((p) => p.randomWalk));
  const mixed = new Simulation({ ...setup, seed: 9, individuals: true, globals: smallWorld });
  assert.ok(walks(mixed).size > 20);
  mixed.reset();
  assert.ok(walks(mixed).size > 20, 'Reset rolls them again');
  const plain = new Simulation({ ...setup, seed: 9, individuals: false, globals: smallWorld });
  assert.equal(walks(plain).size, 1);
});

test('under energy rules random levels stay away from 0, on both sides, and patterns list different sides', () => {
  const rng = createRng(12);
  const levels = new Set();
  const lengths = new Set();
  for (let i = 0; i < 2000; i++) {
    const t = randomTraits(rng, { energyRules: true });
    assert.ok(Math.abs(t.energy) >= 1 && Math.abs(t.energy) <= 10, `${t.energy}`);
    levels.add(t.energy);
    assert.equal(new Set(t.growthPattern).size, t.growthPattern.length, `${t.growthPattern}`);
    assert.ok(t.growthPattern.every((s) => Number.isInteger(s) && s >= 1 && s <= 8));
    lengths.add(t.growthPattern.length);
  }
  assert.ok(levels.size > 500);
  assert.ok([...levels].some((v) => v > 9) && [...levels].some((v) => v < -9) && [...levels].some((v) => v > 0 && v < 2) && [...levels].some((v) => v < 0 && v > -2));
  assert.equal(lengths.size, MAX_PATTERN);

  const setup = randomSetup(6, createRng(9), { seeds: 50, size: 3, ownValues: true, energyRules: true });
  for (const c of setup.classes) {
    assert.ok(Math.abs(c.traits.energy) >= 1);
    for (const s of c.sites) assert.ok(Math.abs(s.traits.energy) >= 1);
  }
});

test('sixty-four classes all get their own color and no matrices', () => {
  const setup = randomSetup(64, createRng(6), { seeds: 64, size: 2, energyRules: true });
  const sim = new Simulation({ ...setup, rules: 'energy', seed: 6, globals: { width: 100, height: 100 } });
  assert.equal(sim.config.classes.length, 64);
  assert.equal(new Set(sim.config.classes.map((c) => c.color)).size, 64);
  assert.ok(sim.config.classes.every((c) => /^#[0-9a-f]{6}$/.test(c.color)));
  assert.deepEqual(sim.config.tendency, []);
  for (let t = 0; t < 30; t++) sim.step();
  assert.ok(sim.world.particles.length > 0);
});

test('Fastest growth holds random Growth_Prob values down, and leaves everything else alone', () => {
  const rng = createRng(6);
  const slow = Array.from({ length: 500 }, () => randomTraits(rng, { fastestGrowth: 0.2 }).growthProb);
  assert.ok(slow.every((v) => v >= 0 && v <= 0.2));
  assert.ok(Math.max(...slow) > 0.15);
  const setup = randomSetup(3, createRng(6), { seeds: 60, size: 2, ownValues: true, fastestGrowth: 0.1 });
  for (const c of setup.classes) {
    assert.ok(c.traits.growthProb <= 0.1);
    for (const s of c.sites) assert.ok(s.traits.growthProb <= 0.1);
  }
});

test('RandomWalk is at most 0.10 by default: new classes, random classes under energy rules, presets and compounds', () => {
  assert.ok(DEFAULT_TRAITS.randomWalk <= QUIET_WALK);
  assert.ok(makeClass('New').traits.randomWalk <= QUIET_WALK);
  const rng = createRng(4);
  for (let i = 0; i < 300; i++) assert.ok(randomTraits(rng, { energyRules: true }).randomWalk <= QUIET_WALK);
  for (const preset of PRESETS.filter((p) => p.group === 'energy')) {
    for (const c of preset.build().classes) assert.ok(c.traits.randomWalk <= QUIET_WALK, `${preset.id} ${c.name}`);
  }
  for (const compound of COMPOUNDS) {
    if (compound.id === 'binary') continue;
    for (const spec of Object.values(compound.classes)) assert.ok((spec.randomWalk ?? QUIET_WALK) <= QUIET_WALK, `${compound.id} ${spec.name}`);
  }
});

test('hand-set matrices keep the RandomWalk they were made for', () => {
  const rng = createRng(4);
  for (let i = 0; i < 300; i++) {
    const { randomWalk } = randomTraits(rng);
    assert.ok(randomWalk >= 0.5 && randomWalk <= 1, `${randomWalk}`);
  }
  for (const preset of PRESETS.filter((p) => p.group === 'matrix')) {
    for (const c of preset.build().classes) assert.ok(c.traits.randomWalk >= 0.5, `${preset.id} ${c.name}`);
  }
});

test('energy worlds saved before RandomWalk could go below 0.5 are quietened once, and nothing else is', () => {
  const saved = (rules, version, randomWalk) => ({
    rules, version,
    classes: [{ name: 'A', traits: { energy: 3, randomWalk }, sites: [{ x: 0.5, y: 0.5, radius: 1, count: 1, traits: { energy: 3, randomWalk } }] }],
  });
  const old = normalizeConfig(saved('energy', 4, 0.7));
  assert.equal(old.classes[0].traits.randomWalk, QUIET_WALK);
  assert.equal(old.classes[0].sites[0].traits.randomWalk, QUIET_WALK);

  const again = normalizeConfig({ ...old, classes: [{ ...old.classes[0], traits: { ...old.classes[0].traits, randomWalk: 0.6 } }] });
  assert.equal(again.classes[0].traits.randomWalk, 0.6, 'turning it back up afterward sticks');

  assert.equal(normalizeConfig(saved('matrix', 4, 0.7)).classes[0].traits.randomWalk, 0.7);
  assert.equal(normalizeConfig(saved('energy', undefined, 0.7)).classes[0].traits.randomWalk, 0.7, 'a world being built, not an old save');
});
