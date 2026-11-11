import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerOffsets, surroundings, crushIfSurrounded, checkCrowd, crowdCheckDue } from '../src/crowding.js';
import { tryDock } from '../src/bonds.js';
import { MAX_CLASSES } from '../src/config.js';
import { makeSim, place, arrive, fieldTotal } from './helpers.js';

const N = 1;
const E = 3;
const still = { frisk: 0, randomWalk: 1, stayProb: 1, deathProb: 0 };
const moving = { frisk: 1, randomWalk: 1, stayProb: 1, deathProb: 0 };
const world = {
  neutralBand: 0.5, growthGap: 5, bondCost: 6, bondRelease: 0.25, width: 40, height: 40, layerReach: 2, fusionBurst: 10,
};
const CROWD_LEVEL = 1;

// Classes 0 and 1 are the ones under test, and class 2 is the crowd around them.
function crowded(a, b, globals = {}, traits = still) {
  return makeSim({
    rules: 'energy',
    classes: [
      { traits: { ...traits, energy: a, growthPattern: [E] } },
      { traits: { ...traits, energy: b, growthPattern: [N] } },
      { traits: { ...still, energy: CROWD_LEVEL, growthPattern: [N] } },
    ],
    globals: { ...world, ...globals },
  });
}

// Fill the empty cells within reach of a point, those `keep` lets through.
function surround(sim, x, y, keep = () => true) {
  for (const o of sim.layer) {
    const c = sim.world.index(x + o.ox, y + o.oy);
    if (c >= 0 && sim.world.cells[c] === null && keep(o)) place(sim, 2, x + o.ox, y + o.oy);
  }
}

// A bonded pair, a at (20, 20) and b just east of it.
function pair(sim) {
  const a = place(sim, 0, 20, 20);
  const b = place(sim, 1, 30, 30);
  assert.ok(arrive(sim, b, 21, 20), 'they bonded');
  return { a, b };
}

test('the cells within reach split into four quarters of the same size', () => {
  const layer = layerOffsets(4, 100);
  assert.equal(layer.length, 68);
  const sizes = [0, 0, 0, 0];
  for (const o of layer) sizes[o.quarter]++;
  assert.deepEqual(sizes, [17, 17, 17, 17]);
  assert.ok(layer[0].dist <= layer.at(-1).dist, 'nearest first');
});

test('a full crowd counts in full, and a free particle counts as a molecule of its own', () => {
  const sim = crowded(3, -3);
  const a = place(sim, 0, 20, 20);
  surround(sim, 20, 20);
  assert.deepEqual(surroundings(sim, a), { molecules: 20, particles: 20 });
});

test('a molecule in the crowd counts once, and its own members don’t count at all', () => {
  const sim = crowded(3, -3);
  const { a } = pair(sim);
  const other = pair2(sim, 20, 18);
  surround(sim, 20, 20);
  const around = surroundings(sim, a);
  assert.ok(other.mol !== null);
  // 20 cells: one is its own partner, and two hold the other molecule.
  assert.equal(around.particles, 16, 'the emptiest quarter is the one with its partner in it');
  assert.equal(around.molecules, 16);
});

function pair2(sim, x, y) {
  const p = place(sim, 0, x, y);
  const q = place(sim, 1, 35, 35);
  assert.ok(arrive(sim, q, x + 1, y), 'they bonded');
  return p;
}

test('a crowd on one side alone counts for nothing', () => {
  const sim = crowded(3, -3);
  const a = place(sim, 0, 20, 20);
  surround(sim, 20, 20, (o) => o.ox > 0 || o.oy > 0);
  assert.equal(surroundings(sim, a).particles, 0);
});

test('the count wraps around the edges, and stops at walls', () => {
  const wrapped = crowded(3, -3, { wrap: true });
  const a = place(wrapped, 0, 0, 0);
  surround(wrapped, 0, 0);
  assert.equal(surroundings(wrapped, a).particles, 20);

  const walled = crowded(3, -3, { wrap: false });
  const b = place(walled, 0, 0, 0);
  surround(walled, 0, 0);
  assert.equal(surroundings(walled, b).particles, 0, 'nothing can be behind a wall');
});

test('a molecule with n molecules around it breaks apart into free particles and returns its energy', () => {
  const sim = crowded(3, 3, { crushLayer: 8 });
  const a = place(sim, 0, 20, 20);
  const b = place(sim, 1, 30, 30);
  sim.field[sim.world.index(21, 20)] = 6;
  assert.ok(arrive(sim, b, 21, 20), 'a costly bond');
  assert.equal(fieldTotal(sim.field), 0, 'the bond took the 6 off the grid');
  surround(sim, 20, 20);
  assert.equal(crushIfSurrounded(sim, a.mol), true);
  assert.equal(a.mol, null);
  assert.equal(b.mol, null);
  assert.equal(a.bonds.length, 0);
  assert.ok(a.crushed && b.crushed);
  assert.equal(sim.events.crushes, 1);
  assert.ok(Math.abs(fieldTotal(sim.field) - 6.25) < 1e-9, 'what it stored and the Minimal release');
});

test('a molecule isn’t crushed by too few around it, by a crowd on one side, or with n at 0', () => {
  const few = crowded(3, -3, { crushLayer: 40 });
  const fewPair = pair(few);
  surround(few, 20, 20);
  assert.equal(crushIfSurrounded(few, fewPair.a.mol), false);

  const lopsided = crowded(3, -3, { crushLayer: 8 });
  const sidePair = pair(lopsided);
  surround(lopsided, 20, 20, (o) => o.ox > 0 || o.oy > 0);
  assert.equal(crushIfSurrounded(lopsided, sidePair.a.mol), false);

  const off = crowded(3, -3, { crushLayer: 0 });
  const offPair = pair(off);
  surround(off, 20, 20);
  assert.equal(crushIfSurrounded(off, offPair.a.mol), false);
  assert.equal(offPair.a.bonds.length, 1);
});

test('molecules in the crowd are crushed as the world runs', () => {
  const sim = crowded(3, -3, { crushLayer: 8, energyProb: 0 });
  const { a, b } = pair(sim);
  surround(sim, 20, 20);
  for (let i = 0; i < 30 && a.mol !== null; i++) sim.step();
  assert.equal(a.mol, null);
  assert.equal(b.mol, null);
  assert.equal(sim.totals.crushes, 1);

  // It's checked again a while later, once it has had time to get any deeper.
  const later = crowded(3, -3, { crushLayer: 8, energyProb: 0 });
  const held = pair(later);
  for (let i = 0; i < 5; i++) later.step();
  surround(later, 20, 20);
  for (let i = 0; i < 40 && held.a.mol !== null; i++) later.step();
  assert.equal(held.a.mol, null);
});

test('crushed particles can’t bond until they’re out from under the layer', () => {
  const sim = crowded(3, -3, { crushLayer: 8 });
  const a = place(sim, 0, 20, 20);
  const b = place(sim, 1, 21, 20);
  surround(sim, 20, 20);
  checkCrowd(sim, a);
  checkCrowd(sim, b);
  assert.ok(a.crushed && b.crushed);
  assert.equal(tryDock(sim, b), false);
  for (const p of sim.world.particles.slice()) if (p.cls === 2) sim.world.remove(p);
  checkCrowd(sim, a);
  checkCrowd(sim, b);
  assert.ok(!a.crushed && !b.crushed);
  assert.equal(tryDock(sim, b), true);
});

function fusing(level, globals = {}) {
  const sim = crowded(level, level, { fusionLayer: 8, ...globals });
  const a = place(sim, 0, 20, 20);
  const b = place(sim, 1, 21, 20);
  surround(sim, 20, 20);
  return { sim, a, b };
}

test('two free particles of the same level, deep enough in, fuse into one with double the charge', () => {
  for (const level of [3, -3]) {
    const { sim, a, b } = fusing(level);
    const before = sim.world.particles.length;
    const cell = a.cell;
    assert.equal(checkCrowd(sim, a), true);
    assert.ok(!a.alive && !b.alive);
    assert.equal(sim.world.particles.length, before - 1);
    const made = sim.world.cells[cell];
    assert.equal(made.energy, level * 2);
    assert.equal(sim.world.cells[sim.world.index(21, 20)], null, 'its partner’s cell is left empty');
    assert.equal(sim.events.fusions, 1);
    assert.ok(Math.abs(fieldTotal(sim.field) + level * 2 * 10) < 1e-9, 'a burst of the opposite charge');
    assert.equal(sim.world.counts[made.cls], 1);
  }
});

test('only the same level fuses', () => {
  for (const [p, q] of [[3, 4], [3, -3], [3, 3.1]]) {
    const sim = crowded(p, q, { fusionLayer: 8 });
    const a = place(sim, 0, 20, 20);
    place(sim, 1, 21, 20);
    surround(sim, 20, 20);
    assert.equal(checkCrowd(sim, a), false, `${p} and ${q}`);
    assert.equal(sim.events.fusions, 0);
  }
});

test('nothing fuses without a partner touching it, without enough around it, or with n1 at 0', () => {
  const apart = crowded(3, 3, { fusionLayer: 8 });
  const a = place(apart, 0, 20, 20);
  place(apart, 1, 23, 20);
  surround(apart, 20, 20);
  assert.equal(checkCrowd(apart, a), false);

  const few = fusing(3, { fusionLayer: 40 });
  assert.equal(checkCrowd(few.sim, few.a), false);
  assert.ok(!few.a.fusing);

  const off = fusing(3, { fusionLayer: 0 });
  assert.equal(checkCrowd(off.sim, off.a), false);
});

test('a particle in a molecule doesn’t fuse, nor does a free one with it', () => {
  const sim = crowded(3, 3, { fusionLayer: 8 });
  const a = place(sim, 0, 20, 20);
  const bonded = place(sim, 1, 21, 20);
  sim.world.addBond(bonded, place(sim, 2, 22, 20), 0);
  surround(sim, 20, 20);
  assert.equal(checkCrowd(sim, a), false);
});

test('double a level past the Heaviest level can’t be made, so chains end', () => {
  const past = fusing(6, { heaviestLevel: 10 });
  assert.equal(checkCrowd(past.sim, past.a), false, '12 would be past it');
  const five = fusing(5, { heaviestLevel: 10 });
  assert.equal(checkCrowd(five.sim, five.a), true, '10 is as far as it goes');
  const none = fusing(0);
  assert.equal(checkCrowd(none.sim, none.a), false, 'nothing can double 0');
});

test('fusion makes a class for the new level once, then keeps using it', () => {
  const { sim, a } = fusing(3);
  const before = sim.config.classes.length;
  checkCrowd(sim, a);
  assert.equal(sim.config.classes.length, before + 1);
  const made = sim.config.classes[before];
  assert.equal(made.name, '+6');
  assert.equal(made.traits.energy, 6);
  assert.equal(made.spawns, false);
  assert.deepEqual(made.traits.growthPattern, [E], 'its other values follow the class it came from');
  assert.equal(sim.world.counts.length, before + 1);
  assert.equal(sim.history.at(-1).counts.length, before + 1);

  const c = place(sim, 0, 5, 5);
  place(sim, 0, 6, 5);
  surround(sim, 5, 5);
  checkCrowd(sim, c);
  assert.equal(sim.config.classes.length, before + 1);
  assert.equal(sim.world.counts[before], 2);
});

test('a class already at the new level is used instead', () => {
  const sim = makeSim({
    rules: 'energy',
    classes: [
      { traits: { ...still, energy: 3, growthPattern: [E] } },
      { traits: { ...still, energy: 6, growthPattern: [N] } },
      { traits: { ...still, energy: CROWD_LEVEL, growthPattern: [N] } },
    ],
    globals: { ...world, fusionLayer: 8 },
  });
  const a = place(sim, 0, 20, 20);
  place(sim, 0, 21, 20);
  surround(sim, 20, 20);
  assert.equal(checkCrowd(sim, a), true);
  assert.equal(sim.config.classes.length, 3);
  assert.equal(sim.world.counts[1], 1);
  assert.equal(sim.config.classes[1].spawns, true, 'it carries on spawning as it did');
});

test('at the class limit a fusion that needs a new class doesn’t happen', () => {
  const sim = makeSim({
    rules: 'energy',
    classes: Array.from({ length: MAX_CLASSES }, (_, k) => ({ traits: { ...still, energy: k === 0 ? 3 : CROWD_LEVEL, growthPattern: [N] } })),
    globals: { ...world, fusionLayer: 8 },
  });
  const a = place(sim, 0, 20, 20);
  const b = place(sim, 0, 21, 20);
  for (const o of sim.layer) {
    const c = sim.world.index(20 + o.ox, 20 + o.oy);
    if (sim.world.cells[c] === null) place(sim, 1, 20 + o.ox, 20 + o.oy);
  }
  assert.equal(checkCrowd(sim, a), false);
  assert.ok(a.alive && b.alive);
  assert.equal(sim.config.classes.length, MAX_CLASSES);
});

test('a class that fusion made never spawns from energy, and the trickle leaves it out', () => {
  const { sim, a } = fusing(3, { energyProb: 1, spawnBuffer: 0, killThreshold: -1000, burnThreshold: 60 });
  checkCrowd(sim, a);
  const made = sim.config.classes.length - 1;
  sim.field.fill(0);
  sim.config.classes.forEach((c, k) => {
    if (k !== made) c.spawns = false;
  });
  assert.equal(sim.cheapestClass(), Infinity);
  sim.field[sim.world.index(5, 5)] = 50;
  sim.config.globals.trickleOn = true;
  sim.config.globals.fusionLayer = 0;
  const count = sim.world.particles.length;
  for (let i = 0; i < 5; i++) sim.step();
  assert.equal(sim.world.particles.length, count);

  sim.config.classes[made].spawns = true;
  sim.config.globals.trickleOn = false;
  for (let i = 0; i < 5; i++) sim.step();
  assert.ok(sim.world.counts[made] > 1, 'its checkbox lets it');
});

test('a fused particle gives back what its two parents were worth when it dies', () => {
  const { sim, a } = fusing(3, { fusionBurst: 0 });
  const { cell } = a;
  checkCrowd(sim, a);
  const made = sim.world.cells[cell];
  sim.kill(made, 'kills');
  assert.ok(Math.abs(fieldTotal(sim.field) - 6) < 1e-9);
});

test('a class fusion made stays after Reset, empty, and the same seed plays out the same', () => {
  const run = (sim) => {
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) place(sim, (x + y) % 2, x, y);
    for (let i = 0; i < 40; i++) sim.step();
    return { fusions: sim.totals.fusions, counts: sim.world.counts.slice(0, 4), field: fieldTotal(sim.field) };
  };
  const sim = crowded(3, -3, { fusionLayer: 8, crushLayer: 8, energyProb: 0, trickleOn: false }, moving);
  const first = run(sim);
  assert.ok(first.fusions > 0);
  const classes = sim.config.classes.length;
  assert.ok(classes > 3);
  sim.reset();
  assert.equal(sim.config.classes.length, classes);
  assert.equal(sim.world.particles.length, 0);
  assert.equal(sim.world.counts.reduce((sum, n) => sum + n, 0), 0);
  assert.deepEqual(run(sim), first);
});

test('in a running world each fusion takes away one particle and leaves its burst, and levels stop doubling at 10', () => {
  const sim = crowded(3, -3, { fusionLayer: 8, energyProb: 0, decay: 0, diffusion: 0, bondCost: 0 }, moving);
  let placed = 0;
  for (let y = 5; y < 35; y++) {
    for (let x = 5; x < 35; x++) {
      place(sim, (x + y) % 2, x, y);
      placed++;
    }
  }
  for (let i = 0; i < 100; i++) sim.step();
  assert.ok(sim.totals.fusions > 50, `${sim.totals.fusions} fusions`);
  assert.equal(sim.world.particles.length, placed - sim.totals.fusions);
  let burst = 0;
  sim.config.classes.forEach((c, k) => {
    if (c.spawns === false) burst -= c.traits.energy * 10 * sim.world.counts[k];
    assert.ok(Math.abs(c.traits.energy) <= 10);
  });
  assert.ok(Math.abs(fieldTotal(sim.field) - burst) < 1e-6);
});

test('a free particle far from any crowd checks less often, and one near it checks often again', () => {
  const sim = crowded(3, 3, { fusionLayer: 200, crushLayer: 8 });
  const a = place(sim, 0, 20, 20);
  const dueIn = (span) => Array.from({ length: span }, (_, tick) => crowdCheckDue(tick, a)).filter(Boolean).length;
  checkCrowd(sim, a);
  assert.ok(!a.crowded);
  assert.equal(dueIn(48), 1);
  surround(sim, 20, 20);
  checkCrowd(sim, a);
  assert.ok(a.crowded);
  assert.equal(dueIn(48), 3);
});

test('a crushed particle and a newly fused one are checked often from the start', () => {
  const sim = crowded(3, -3, { crushLayer: 8 });
  const { a, b } = pair(sim);
  surround(sim, 20, 20);
  crushIfSurrounded(sim, a.mol);
  assert.ok(a.crowded && b.crowded);

  const { sim: fused, a: first } = fusing(3);
  const { cell } = first;
  checkCrowd(fused, first);
  assert.ok(fused.world.cells[cell].crowded);
});

test('the rules leave free particles’ state as they find it when both layers are off', () => {
  const sim = crowded(3, 3);
  const a = place(sim, 0, 20, 20);
  a.crushed = true;
  a.fusing = true;
  assert.equal(checkCrowd(sim, a), false);
  assert.ok(!a.crushed && !a.fusing);
  assert.equal(sim.stateOf(a), 'free');
});

test('the state and the readout show how deep a particle is', () => {
  const sim = crowded(3, 3, { crushLayer: 8, fusionLayer: 200, neutralBand: 0 });
  const a = place(sim, 0, 20, 20);
  surround(sim, 20, 20);
  checkCrowd(sim, a);
  assert.equal(sim.stateOf(a), 'crushed');
  sim.config.globals.fusionLayer = 8;
  a.fusing = true;
  assert.equal(sim.stateOf(a), 'fusing');
  const info = sim.inspect(20, 20);
  assert.deepEqual(info.around, { molecules: 20, particles: 20 });
});

test('changing the Layer reach applies straight away', () => {
  const sim = crowded(3, 3);
  assert.equal(sim.layer.length, 20);
  sim.setGlobal('layerReach', 4);
  assert.equal(sim.layer.length, 68);
  assert.equal(sim.layer.reach, 4);
});
