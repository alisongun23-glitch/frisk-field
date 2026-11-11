import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { Simulation } from '../src/sim.js';
import { PRESETS, presetById } from '../src/presets.js';
import { makeSim, place } from './helpers.js';

const fingerprint = (sim) =>
  sim.world.particles.map((p) => `${p.id}:${p.cls}@${p.cell}`).sort().join(',') + `|${sim.field.reduce((s, v) => s + v, 0)}`;

test('the same seed and settings replay the same run; another seed does not', () => {
  for (const preset of PRESETS) {
    const a = new Simulation(preset.build());
    const b = new Simulation(preset.build());
    const c = new Simulation({ ...preset.build(), seed: 12345 });
    for (let i = 0; i < 150; i++) {
      a.step();
      b.step();
      c.step();
    }
    assert.equal(fingerprint(a), fingerprint(b), preset.id);
    assert.notEqual(fingerprint(a), fingerprint(c), preset.id);
  }
});

test('loaded settings are clamped to the spec ranges and the matrices sized to the classes', () => {
  const config = normalizeConfig({
    classes: [
      { name: 'A', traits: { frisk: 9, randomWalk: -1, connect: -2, growthDir: 12, energy: 50, variance: 2 } },
      { name: 'B', traits: { growthPattern: [1, 2, 3, 0, 9.4, 6, 7, 8, 1] } },
    ],
    tendency: [[3]],
    growth: [[1, 1, 1], [0]],
    globals: { energyProb: 7, spread: 2.6 },
  });
  const t = config.classes[0].traits;
  assert.deepEqual([t.frisk, t.randomWalk, t.connect, t.energy, t.variance], [5, 0, 0, 10, 1]);
  assert.deepEqual(t.growthPattern, [8], 'settings saved with a single growthDir become a one-step pattern');
  assert.deepEqual(config.classes[1].traits.growthPattern, [1, 2, 3, 1, 8, 6]);
  assert.deepEqual(normalizeConfig({ classes: [{}] }).classes[0].traits.growthPattern, [3]);
  assert.deepEqual(config.tendency, [[1, 0], [0, 0]]);
  assert.deepEqual(config.growth, [[1, 1], [0, 0]]);
  assert.equal(config.globals.energyProb, 1);
  assert.equal(config.globals.spread, 3);
  assert.throws(() => normalizeConfig({ classes: [] }), /at least one class/);
});

test('editing a class value shifts its particles by the same amount', () => {
  const sim = makeSim({ classes: [{ traits: { frisk: 0, energy: 2 } }, { traits: { frisk: 0, energy: 2 } }] });
  const plain = place(sim, 0, 1, 1);
  const mutant = place(sim, 0, 5, 5, { energy: 3 });
  const other = place(sim, 1, 9, 9);
  sim.setClassTrait(0, 'energy', 4);
  assert.deepEqual([plain.energy, mutant.energy, other.energy], [4, 5, 2]);
  sim.setClassTrait(0, 'energy', 10);
  assert.equal(mutant.energy, 10);
});

test('a new class pattern is set on its particles, keeping their step in range', () => {
  const sim = makeSim({ classes: [{ traits: { frisk: 0, growthPattern: [3, 5, 7] } }, { traits: { frisk: 0 } }] });
  const a = place(sim, 0, 1, 1, { step: 2 });
  const other = place(sim, 1, 5, 5);
  sim.setClassPattern(0, [1, 2]);
  assert.deepEqual(a.pattern, [1, 2]);
  assert.equal(a.step, 0);
  assert.deepEqual(other.pattern, [3]);
  assert.deepEqual(sim.config.classes[0].traits.growthPattern, [1, 2]);
});

test('removing a class removes its particles and its matrix row and column', () => {
  const sim = makeSim({
    classes: [{ traits: { frisk: 0 }, count: 5 }, { traits: { frisk: 0 }, count: 5 }, { traits: { frisk: 0 }, count: 5 }],
    tendency: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [0.7, 0.8, 0.9]],
  });
  sim.removeClass(1);
  assert.deepEqual(sim.config.tendency, [[0.1, 0.3], [0.7, 0.9]]);
  assert.deepEqual(sim.world.counts, [5, 5]);
  assert.ok(sim.world.particles.every((p) => p.cls === 0 || p.cls === 1));
  assert.equal(sim.world.particles.length, 10);
});

test('a duplicated class copies its matrix row and column', () => {
  const sim = makeSim({
    classes: [{ traits: {} }, { traits: {} }],
    tendency: [[0.1, 0.2], [0.3, 0.4]],
    growth: [[1, 0], [0, 1]],
  });
  sim.addClass(1);
  assert.deepEqual(sim.config.tendency, [[0.1, 0.2, 0.2], [0.3, 0.4, 0.4], [0.3, 0.4, 0.4]]);
  assert.deepEqual(sim.config.growth, [[1, 0, 0], [0, 1, 1], [0, 1, 1]]);
});

test('nothing new appears past the particle limit, by seeding, growth, spawning or painting', () => {
  for (const rules of ['matrix', 'energy']) {
    const sim = makeSim({
      rules,
      classes: [
        { traits: { frisk: 1, connect: 8, stayProb: 0, growthProb: 1, deathProb: 0.05, growthPattern: [3], energy: 3 }, count: 200 },
        { traits: { frisk: 1, connect: 8, stayProb: 0, growthProb: 1, deathProb: 0.05, growthPattern: [5], energy: -3 }, count: 200 },
      ],
      growth: [[1, 1], [1, 1]],
      globals: { width: 100, height: 100, maxParticles: 1000, energyProb: 1, spawnThreshold: 0.5 },
    });
    let peak = 0;
    for (let t = 0; t < 400; t++) {
      sim.step();
      sim.paint(30, 30, 8, 'particle', 0);
      peak = Math.max(peak, sim.world.particles.length);
    }
    assert.ok(peak <= 1000 && peak >= 980, `${rules}: ${peak}`);
  }
  const capped = makeSim({
    classes: [{ traits: { frisk: 0, connect: 8 }, count: 900 }, { traits: { frisk: 0, connect: 8 }, sites: [{ x: 0.5, y: 0.5, radius: 20, count: 900 }] }],
    globals: { width: 60, height: 60, maxParticles: 1000 },
  });
  assert.equal(capped.world.particles.length, 1000);
});

test('the charts can keep a point only every few ticks, which changes nothing about the run', () => {
  const run = (recordEvery) => {
    const sim = new Simulation(presetById('predator').build());
    sim.recordEvery = recordEvery;
    for (let i = 0; i < 200; i++) sim.step();
    return sim;
  };
  const every = run(1);
  const fewer = run(8);
  assert.deepEqual(fewer.world.counts, every.world.counts);
  assert.equal(every.history.length, 201);
  assert.equal(fewer.history.length, 26);
  assert.ok(fewer.history.every((h) => h.tick % 8 === 0));
});

test('on a big map under energy rules the field is looked over in batches, and things still happen about as often', () => {
  const run = (width, height) => {
    const sim = new Simulation({
      rules: 'energy',
      seed: 3,
      globals: { width, height, energyProb: 0.3, decay: 0.01, diffusion: 0, spawnBuffer: 0, burnThreshold: 60, killThreshold: -40, trickleOn: false, crushLayer: 0, fusionLayer: 0 },
      classes: [{ name: 'A', traits: { frisk: 0, energy: 1, deathProb: 0.5, growthPattern: [1] } }],
    });
    // A deadly spot, full of particles, and hot empty spots to spawn on.
    const victims = [];
    for (let i = 0; i < 2000; i++) {
      const cell = i * 7 + 13;
      victims.push(sim.world.add(0, sim.config.classes[0].traits, cell, 0));
      sim.field[cell] = -100;
    }
    for (let i = 0; i < 2000; i++) sim.field[i * 7 + 10013] = 5;
    let deadAt = [];
    let spawnAt = [];
    for (let t = 0; t < 40; t++) {
      sim.step();
      if (t === 3) {
        deadAt = sim.totals.kills;
        spawnAt = sim.totals.spawns;
      }
    }
    return { sim, kills: deadAt, spawns: spawnAt, total: fieldTotalOf(sim) };
  };
  const fieldTotalOf = (sim) => sim.field.reduce((s, v) => s + v, 0);
  const small = run(300, 300);
  const big = run(400, 400);
  assert.equal(small.sim.fieldEvery, 1);
  assert.equal(big.sim.fieldEvery, 4);
  // After four ticks each has given every cell four ticks' worth of chances.
  const within = (a, b, by) => Math.abs(a - b) <= b * by;
  assert.ok(within(big.kills, small.kills, 0.15), `${big.kills} and ${small.kills} killed`);
  assert.ok(within(big.spawns, small.spawns, 0.15), `${big.spawns} and ${small.spawns} spawned`);
  assert.ok(within(big.sim.field[10013 + 7 * 1999], small.sim.field[10013 + 7 * 1999], 1) || big.sim.world.cells[10013 + 7 * 1999] !== null);
});

test('hand-set matrices never look over the field in batches, whatever the map size', () => {
  const sim = makeSim({ classes: [{ traits: { frisk: 0 } }], globals: { width: 400, height: 400 } });
  assert.equal(sim.fieldEvery, 1);
});

test('a particle boxed in on every side doesn’t try to go anywhere', () => {
  const sim = makeSim({ rules: 'energy', classes: [{ traits: { frisk: 1, randomWalk: 1, energy: 3, growthPattern: [1] } }], globals: { width: 20, height: 20, neutralBand: 0, energyProb: 0 } });
  const middle = place(sim, 0, 10, 10);
  assert.equal(sim.world.boxedIn(middle.cell), false);
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
    sim.world.add(0, { ...sim.config.classes[0].traits, frisk: 0 }, sim.world.index(10 + dx, 10 + dy), 0);
  }
  assert.equal(sim.world.boxedIn(middle.cell), true);
  const { cell } = middle;
  for (let i = 0; i < 20; i++) sim.step();
  assert.equal(middle.cell, cell);
  assert.equal(sim.totals.moves, 0);
});

test('every class in an energy preset can connect, on sides that aren’t repeated, and can be paid for by the trickle', () => {
  for (const preset of PRESETS.filter((p) => p.group === 'energy')) {
    const { classes, globals } = preset.build();
    assert.ok(globals.trickleOn && globals.trickle > 0, preset.id);
    for (const c of classes) {
      assert.ok(Math.abs(c.traits.energy) > globals.neutralBand, `${preset.id} ${c.name}`);
      const drop = (Math.abs(c.traits.energy) + globals.spawnBuffer) * 1.02;
      assert.ok(drop < globals.spawnBuffer + globals.burnThreshold, `${preset.id} ${c.name}: its own drops would burn what they land on`);
      assert.ok(globals.spawnBuffer >= 10, `${preset.id}: the buffer is meant to be high`);
      assert.equal(new Set(c.traits.growthPattern).size, c.traits.growthPattern.length, `${preset.id} ${c.name}`);
    }
  }
});

test('the Stars preset shows the whole chain within moments', () => {
  const sim = new Simulation(presetById('stars').build());
  for (let i = 0; i < 150; i++) sim.step();
  assert.ok(sim.totals.crushes > 1000, `${sim.totals.crushes} crushed`);
  assert.ok(sim.totals.fusions > 50, `${sim.totals.fusions} fused`);
  const levels = sim.config.classes.map((c) => c.traits.energy);
  assert.ok(levels.includes(6) && levels.includes(-6), `${levels}`);
});

test('an energy preset runs: particles appear, bonds form and break, molecules move, and the energy stays finite', () => {
  for (const preset of PRESETS.filter((p) => p.group === 'energy')) {
    const sim = new Simulation({ ...preset.build(), globals: { ...preset.build().globals, width: 200, height: 150, maxParticles: 14000 } });
    for (let i = 0; i < 150; i++) sim.step();
    assert.ok(sim.totals.connects > 0 && sim.totals.breaks > 0 && sim.totals.spawns > 0, `${preset.id} ${JSON.stringify(sim.totals)}`);
    assert.ok(sim.world.molecules.length > 0, preset.id);
    assert.ok(sim.field.every(Number.isFinite), preset.id);
    for (const mol of sim.world.molecules) {
      assert.equal(mol.net, mol.members.reduce((sum, m) => sum + m.energy, 0), preset.id);
      assert.ok(mol.members.length <= sim.config.globals.maxMolecule, preset.id);
      for (const m of mol.members) {
        assert.equal(m.mol, mol, preset.id);
        assert.equal(sim.world.cells[m.cell], m, preset.id);
        for (const b of m.bonds) {
          assert.ok(sim.world.adjacent(b.host.cell, b.guest.cell), `${preset.id}: bonded particles stay side by side`);
        }
      }
    }
  }
});
