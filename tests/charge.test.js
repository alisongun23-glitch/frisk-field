import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bondEnergy, chargePull } from '../src/charge.js';
import { normalizeConfig, classColor, CLASS_COLORS, MATRIX_CLASSES, MAX_CLASSES } from '../src/config.js';
import { NO_DRIFT } from '../src/movement.js';
import { PRESETS } from '../src/presets.js';
import { makeSim, place, distance } from './helpers.js';

const still = { frisk: 0, randomWalk: 1, stayProb: 0, deathProb: 1 };
const world = { neutralBand: 0.5, growthGap: 5, bondCost: 6, bondRelease: 0 };

const pair = (a, b, extra = {}, globals = {}) => makeSim({
  rules: 'energy',
  classes: [{ traits: { ...still, energy: a, growthPattern: [1], ...extra } }, { traits: { ...still, energy: b, growthPattern: [5], ...extra } }],
  globals: { ...world, ...globals },
});

test('what a bond costs: nothing for opposite charges or a wide gap, more the closer the levels', () => {
  const cost = (a, b) => bondEnergy(a, b, 6, 5);
  assert.equal(cost(3, -3), 0, 'opposite charges');
  assert.equal(cost(1, -1), 0, 'opposite charges, however close');
  assert.equal(cost(1, 10), 0, 'same sign, wide gap');
  assert.equal(cost(-10, -1), 0);
  assert.equal(cost(1, 6), 0, 'exactly the free gap');
  assert.ok(Math.abs(cost(3, 5) - 3.6) < 1e-9, 'the example in the plan');
  assert.equal(cost(3, 3), 6, 'a match costs the most');
  assert.ok(cost(3, 3.5) > cost(3, 4) && cost(3, 4) > cost(3, 6), 'climbs as the levels get closer');
  assert.equal(cost(-4, -4), 6);
});

test('charge pulls hardest toward what cancels it, and pushes hardest from its own level', () => {
  assert.equal(chargePull(3, -3, 5), 1);
  assert.equal(chargePull(-3, 3, 5), 1);
  assert.ok(chargePull(3, -1, 5) > 0 && chargePull(3, -1, 5) < 1);
  assert.equal(chargePull(1, -10, 5), chargePull(10, -1, 5));
  assert.equal(chargePull(3, 3, 5), -1);
  assert.equal(chargePull(-3, -3, 5), -1);
  assert.ok(chargePull(3, 5, 5) < 0 && chargePull(3, 5, 5) > -1);
  assert.ok(chargePull(1, 10, 5) > 0, 'past the free gap they can bond for nothing, so they pull');
  assert.equal(chargePull(0, 5, 5), 0);
});

test('drift points toward what cancels the charge and away from its own level', () => {
  const sim = pair(3, -3, {}, { senseRadius: 6 });
  const a = place(sim, 0, 10, 10);
  place(sim, 1, 16, 10);
  assert.ok(sim.driftOf(a)[0] > 0, 'toward the opposite charge to the east');
  const other = pair(3, 3, {}, { senseRadius: 6, bondCost: 6 });
  const c = place(other, 0, 10, 10);
  place(other, 1, 14, 10);
  assert.ok(other.driftOf(c)[0] < 0, 'away from its own level to the east');
  const off = pair(3, -3, {}, { senseRadius: 6, chargePull: 0 });
  const d = place(off, 0, 10, 10);
  place(off, 1, 16, 10);
  assert.deepEqual(off.driftOf(d).slice(0, 2), [0, 0]);
});

test('similar levels pull only where the grid could pay for the bond', () => {
  const sim = pair(3, 3, {}, { senseRadius: 6, spread: 1 });
  const a = place(sim, 0, 10, 10);
  const b = place(sim, 1, 15, 10);
  assert.ok(sim.driftOf(a)[0] < 0);
  assert.equal(sim.driftOf(a)[2], 0, 'not something it can connect with');
  sim.field[b.cell] = 7;
  assert.ok(sim.driftOf(a)[0] > 0, 'now the bond can be paid for');
  assert.ok(sim.driftOf(a)[2] > 0);
});

test('a neutral molecule wants nothing, and attracts nothing', () => {
  const sim = pair(3, -3, {}, { senseRadius: 6 });
  const a = place(sim, 0, 10, 10);
  const b = place(sim, 1, 11, 10);
  sim.world.addBond(a, b, 0);
  place(sim, 1, 15, 10);
  assert.equal(sim.driftOf(a), NO_DRIFT);

  const free = place(sim, 0, 20, 10);
  assert.ok(sim.driftOf(free)[0] < 0, 'pulled only by the free -3 to the west, at (15, 10)');
  sim.world.remove(sim.world.cells[sim.world.index(15, 10)]);
  assert.deepEqual(sim.driftOf(free), [0, 0, 0], 'the neutral pair behind it does nothing');
});

test('closeness to something connectable grows as it nears, and stays 0 for what it cannot connect with', () => {
  const nearness = (a, b, dist) => {
    const sim = pair(a, b, {}, { senseRadius: 6 });
    const p = place(sim, 0, 10, 10);
    place(sim, 1, 10 + dist, 10);
    return sim.driftOf(p)[2];
  };
  assert.ok(nearness(3, -3, 2) > nearness(3, -3, 5));
  assert.ok(nearness(3, -3, 5) > 0);
  assert.equal(nearness(3, -3, 9), 0, 'out of range');
  assert.equal(nearness(3, 3, 2), 0, 'its own level, with no energy around to pay');
  assert.ok(nearness(1, 10, 2) > 0, 'a wide gap counts');
});

test('close up, a particle heads for the side it has to dock on, not straight at the other particle', () => {
  const sim = makeSim({
    rules: 'energy',
    classes: [{ traits: { ...still, energy: 3, growthPattern: [1] } }, { traits: { ...still, energy: -3, growthPattern: [1] } }],
    globals: { ...world, senseRadius: 6 },
  });
  const walker = place(sim, 0, 12, 10);
  const host = place(sim, 1, 10, 10);
  const d = sim.driftOf(walker);
  assert.ok(d[1] < 0, 'up, since the host wants its partner on top');
  assert.ok(d[0] < 0, 'and across');
  assert.ok(Math.abs(Math.hypot(d[0], d[1]) - 1) < 1e-9);
  assert.ok(host.alive);
});

function ticksToMeet(focus, senseRadius = 10) {
  let total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const sim = makeSim({
      rules: 'energy',
      seed,
      classes: [
        { traits: { frisk: 1, randomWalk: 1, stayProb: 0, energy: 3, growthPattern: [1] } },
        { traits: { frisk: 0, randomWalk: 1, stayProb: 0, energy: -3, growthPattern: [1] } },
      ],
      globals: { ...world, senseRadius, width: 100, height: 100, seekFocus: focus },
    });
    const p = place(sim, 0, 45, 50);
    const q = place(sim, 1, 52, 50);
    let t = 0;
    while (p.mol === null && t < 400) {
      sim.step();
      t++;
    }
    total += t;
    assert.ok(distance(p, q, 100, 100) < 90);
  }
  return total / 40;
}

test('with focus on, particles stop walking at random once something connectable is in range', () => {
  const blind = ticksToMeet(0);
  const focused = ticksToMeet(1);
  assert.ok(focused < blind / 3, `focused ${focused.toFixed(1)} vs blind ${blind.toFixed(1)} ticks`);
});

test('RandomWalk stays in charge when nothing connectable is in range', () => {
  assert.equal(ticksToMeet(0, 0), ticksToMeet(1, 0));
});

test('settings saved before energy rules existed stay on the matrices; every preset says which it uses', () => {
  assert.equal(normalizeConfig({ classes: [{}] }).rules, 'matrix');
  assert.equal(normalizeConfig({ classes: [{}], rules: 'energy' }).rules, 'energy');
  for (const p of PRESETS) assert.equal(normalizeConfig(p.build()).rules, p.group, p.id);
});

test('energy rules take up to 64 classes, and hand-set matrices stay at 8', () => {
  const many = Array.from({ length: 70 }, () => ({}));
  assert.equal(normalizeConfig({ classes: many, rules: 'energy' }).classes.length, MAX_CLASSES);
  assert.equal(normalizeConfig({ classes: many }).classes.length, MATRIX_CLASSES);
  assert.equal(new Set(Array.from({ length: MAX_CLASSES }, (_, k) => classColor(k))).size, MAX_CLASSES);
  assert.deepEqual(Array.from({ length: 8 }, (_, k) => classColor(k)), CLASS_COLORS, 'the checked colors come first');

  const sim = makeSim({ rules: 'energy', classes: [{ traits: {} }] });
  for (let k = 1; k < MAX_CLASSES; k++) assert.equal(sim.addClass(), k);
  assert.equal(sim.addClass(), -1);
  assert.equal(new Set(sim.config.classes.map((c) => c.color)).size, MAX_CLASSES);
  sim.setRules('matrix');
  assert.equal(sim.config.rules, 'energy', 'too many classes for matrices');
  while (sim.config.classes.length > MATRIX_CLASSES) sim.removeClass(sim.config.classes.length - 1);
  sim.setRules('matrix');
  assert.equal(sim.config.rules, 'matrix');
  assert.equal(sim.config.tendency.length, MATRIX_CLASSES, 'matrices are back, blank');
  assert.equal(sim.addClass(), -1);
});

test('switching rules keeps the particles and drops the bonds', () => {
  const sim = pair(3, -3, { connect: 8 });
  const a = place(sim, 0, 10, 10);
  const b = place(sim, 1, 10, 9);
  sim.world.addBond(b, a, 0);
  assert.equal(sim.world.molecules.length, 1);
  sim.setRules('matrix');
  assert.equal(sim.world.molecules.length, 0);
  assert.equal(a.mol, null);
  assert.equal(a.touching, 1, 'touching is counted again');
  assert.ok(a.alive && b.alive);
});
