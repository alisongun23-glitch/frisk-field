import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PressureMap, PRESSURE_BLOCK } from '../src/pressure.js';
import { compoundById, compoundWorld } from '../src/compounds.js';
import { Simulation } from '../src/sim.js';
import { makeSim, place, arrive } from './helpers.js';

const E = 3;
const N = 1;
const WEST = 6;
const walker = { frisk: 1, randomWalk: 0, stayProb: 1, deathProb: 0 };
const rules = { pressureLine: -10, pressureSpread: 0, pressureFade: 0 };
const small = { width: 40, height: 40, wrap: true };
const CELLS_IN_BLOCK = PRESSURE_BLOCK * PRESSURE_BLOCK;

const blank = (globals = {}) => {
  const world = { ...small, ...globals };
  return { map: new PressureMap(world), world, field: new Float64Array(world.width * world.height) };
};
const total = (map) => map.level.reduce((sum, v) => sum + v, 0);

test('pressure builds only below the line, faster the further below it is', () => {
  const { map, world, field } = blank();
  field[world.width * 20 + 20] = -9.9;
  map.refresh(world, field, rules, 0);
  assert.equal(map.empty, true);

  field[world.width * 20 + 20] = -20;
  map.refresh(world, field, rules, 0);
  const once = map.at(20, 20);
  assert.ok(Math.abs(once - (10 * 4) / CELLS_IN_BLOCK) < 1e-9, `${once}`);
  assert.equal(map.empty, false);

  const deeper = blank();
  deeper.field[world.width * 20 + 20] = -30;
  deeper.map.refresh(world, deeper.field, rules, 0);
  assert.ok(Math.abs(deeper.map.at(20, 20) - once * 2) < 1e-9);
});

test('a positive cell, however hot, makes no pressure', () => {
  const { map, world, field } = blank();
  field[world.width * 20 + 20] = 1000;
  map.refresh(world, field, rules, 0);
  assert.equal(map.empty, true);
});

test('it only looks every few ticks', () => {
  const { map, world, field } = blank();
  field[0] = -50;
  map.refresh(world, field, rules, 1);
  assert.equal(map.empty, true);
  map.refresh(world, field, rules, 4);
  assert.equal(map.empty, false);
});

test('it spreads to the blocks around it without changing the total', () => {
  const { map, world, field } = blank();
  field[world.width * 20 + 20] = -50;
  map.refresh(world, field, rules, 0);
  const start = total(map);
  field.fill(0);
  map.refresh(world, field, { ...rules, pressureSpread: 0.2 }, 0);
  assert.ok(map.at(20 + PRESSURE_BLOCK, 20) > 0);
  assert.ok(map.at(20, 20 + PRESSURE_BLOCK) > 0);
  assert.equal(map.at(20 + PRESSURE_BLOCK, 20 + PRESSURE_BLOCK), 0, 'to its four neighbors at first');
  assert.ok(Math.abs(total(map) - start) < 1e-9);
});

test('it fades by the Pressure fade, and ends at nothing', () => {
  const { map, world, field } = blank();
  field[world.width * 20 + 20] = -50;
  map.refresh(world, field, rules, 0);
  const start = map.at(20, 20);
  field.fill(0);
  map.refresh(world, field, { ...rules, pressureFade: 0.01 }, 0);
  assert.ok(Math.abs(map.at(20, 20) - start * 0.99 ** 4) < 1e-9);
  for (let i = 0; i < 2000; i++) map.refresh(world, field, { ...rules, pressureFade: 0.05 }, 0);
  assert.equal(map.empty, true);
  assert.equal(map.highest, 0);
});

test('it wraps around the edges, and stops at walls with nothing lost', () => {
  const spreadFromCorner = (wrap) => {
    const { map, world, field } = blank({ wrap });
    field[0] = -50;
    map.refresh(world, field, rules, 0);
    const start = total(map);
    field.fill(0);
    map.refresh(world, field, { ...rules, pressureSpread: 0.2 }, 0);
    return { map, start };
  };
  const wrapped = spreadFromCorner(true);
  assert.ok(wrapped.map.at(39, 0) > 0, 'across the edge');
  const walled = spreadFromCorner(false);
  assert.equal(walled.map.at(39, 0), 0);
  assert.ok(Math.abs(total(walled.map) - walled.start) < 1e-9);
});

test('the push goes from high pressure to low, in proportion, up to a limit', () => {
  const { map, world } = blank();
  const b = (x, y) => Math.floor(y / PRESSURE_BLOCK) * map.cols + Math.floor(x / PRESSURE_BLOCK);
  map.empty = false;
  map.level[b(24, 20)] = 10;
  map.feel(world, 20, 20, 0.1);
  assert.ok(Math.abs(map.pushX + 0.5) < 1e-9, `pushed west, away from the pressure: ${map.pushX}`);
  assert.equal(map.pushY, 0);
  map.level[b(20, 16)] = 10;
  map.feel(world, 20, 20, 0.1);
  assert.ok(map.pushY > 0, 'and south, away from the pressure above');

  map.level[b(24, 20)] = 1000;
  map.level[b(20, 16)] = 0;
  map.feel(world, 20, 20, 1);
  assert.ok(Math.abs(map.pushX + 2) < 1e-9, 'no harder than this');

  map.feel(world, 20, 20, 0);
  assert.equal(map.pushX, 0, 'with no strength there is no push');
});

test('with no pressure there is no push, and against a wall it pushes straight out', () => {
  const { map, world } = blank({ wrap: false });
  map.feel(world, 20, 20, 1);
  assert.equal(map.pushX, 0);
  map.empty = false;
  map.level[0] = 10;
  map.feel(world, 0, 0, 1);
  assert.ok(map.pushX > 0 && map.pushY > 0, 'out of the corner');
  assert.ok(Math.abs(map.pushX - map.pushY) < 1e-9);
});

// A world where the pressure is held fixed, high to the east and low to the west of the middle.
function pushing(classes, globals = {}) {
  const sim = makeSim({
    rules: 'energy',
    classes,
    globals: { neutralBand: 0.5, growthGap: 5, bondCost: 0, width: 80, height: 40, wrap: false, pressurePush: 0.5, ...rules, ...globals },
  });
  const map = sim.pressure;
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) map.level[r * map.cols + c] = c;
  map.empty = false;
  return sim;
}

test('a free particle is pushed away from high pressure', () => {
  const sim = pushing([{ traits: { ...walker, energy: 3 } }]);
  const p = place(sim, 0, 60, 20);
  for (let i = 0; i < 20; i++) sim.step();
  assert.ok(p.x < 60, `${p.x}`);
  assert.equal(p.y, 20, 'straight down the slope');
});

test('strong enough, the push beats a pull toward what it could bond with', () => {
  const classes = [{ traits: { ...walker, energy: 3 } }, { traits: { ...walker, frisk: 0, energy: -3 } }];
  const sim = pushing(classes, { senseRadius: 6, pressurePush: 8 });
  const p = place(sim, 0, 40, 20);
  place(sim, 1, 44, 20);
  const [dx] = sim.driftOf(p);
  assert.ok(dx < 0, `${dx}`);
  const calm = pushing(classes, { senseRadius: 6, pressurePush: 0 });
  const q = place(calm, 0, 40, 20);
  place(calm, 1, 44, 20);
  assert.ok(calm.driftOf(q)[0] > 0, 'it would have gone the other way');
});

test('a frisk of 0 still never moves', () => {
  const sim = pushing([{ traits: { ...walker, frisk: 0, energy: 3 } }]);
  const p = place(sim, 0, 60, 20);
  for (let i = 0; i < 20; i++) sim.step();
  assert.equal(p.x, 60);
});

// A bonded pair, a at (x, y) and b just north of it. It looks at nothing around it and never breaks up.
function bondedPair(sim, x, y) {
  const a = place(sim, 0, x, y);
  const b = place(sim, 1, 70, 5);
  assert.ok(arrive(sim, b, x, y - 1), 'they bonded');
  return a;
}
const twoOf = (first, second) => [
  { traits: { ...walker, energy: first, growthPattern: [N] } },
  { traits: { ...walker, energy: second, growthPattern: [N] } },
];

test('a molecule with a charge is pushed away from high pressure', () => {
  const sim = pushing(twoOf(3, -1));
  const a = bondedPair(sim, 60, 20);
  for (let i = 0; i < 40; i++) sim.step();
  assert.ok(a.x < 60, `${a.x}`);
});

test('a neutral molecule is pushed too, and more often the stronger the push', () => {
  const movesAt = (strength) => {
    const sim = pushing(twoOf(3, -3), { macroSpeed: 0, pressurePush: strength });
    const a = bondedPair(sim, 60, 20);
    for (let i = 0; i < 100; i++) sim.step();
    return 60 - a.x;
  };
  const slow = movesAt(0.1);
  const fast = movesAt(0.5);
  assert.ok(slow > 0, `${slow}`);
  assert.ok(fast > slow * 2, `${fast} against ${slow}`);
});

test('a neutral molecule stops where the push matches its creep toward density', () => {
  const sim = pushing(twoOf(3, -3), { macroSpeed: 0.1, pressurePush: 0 });
  const a = bondedPair(sim, 40, 20);
  // Denser to the east, with a push to the west.
  const EAST = 2;
  sim.density.towardMore = () => EAST;
  sim.density.refresh = () => {};
  const feelWith = (pushX) => {
    sim.pressure.feel = function feel() {
      this.pushX = pushX;
      this.pushY = 0;
    };
  };
  feelWith(-0.1);
  for (let i = 0; i < 200; i++) sim.step();
  assert.equal(a.x, 40, 'they cancel');
  feelWith(-0.6);
  for (let i = 0; i < 100; i++) sim.step();
  assert.ok(a.x < 40, `the push wins: ${a.x}`);
  const pushedTo = a.x;
  feelWith(0);
  for (let i = 0; i < 100; i++) sim.step();
  assert.ok(a.x > pushedTo, `with none, it creeps back: ${a.x}`);
});

test('cold energy in a running world builds pressure that drives particles away', () => {
  const sim = makeSim({
    rules: 'energy',
    classes: [{ traits: { ...walker, energy: 3 } }],
    globals: { width: 60, height: 60, wrap: false, neutralBand: 0.5, pressureLine: -10, pressureSpread: 0.2, pressureFade: 0.005, pressurePush: 0.5, killThreshold: -40 },
  });
  const middle = sim.world.index(30, 30);
  sim.field[middle] = -200;
  const near = place(sim, 0, 36, 30);
  const far = place(sim, 0, 22, 30);
  for (let i = 0; i < 60; i++) sim.step();
  assert.ok(sim.pressure.at(30, 30) > 0);
  assert.ok(near.x > 36, `pushed east: ${near.x}`);
  assert.ok(far.x < 22, `pushed west: ${far.x}`);
  assert.ok(sim.inspect(30, 30).pressure.amount > 0);
});

test('hand-set matrices build no pressure, however cold the grid', () => {
  const sim = makeSim({ classes: [{ traits: { energy: 1 } }], tendency: [[0]], growth: [[0]], death: [[0]] });
  sim.field[0] = -500;
  for (let i = 0; i < 20; i++) sim.step();
  assert.equal(sim.pressure.empty, true);
  assert.equal(sim.inspect(0, 0).pressure, null);
});

test('with Heaviest level 10 and Pressure push 0, a world runs just as it did before they existed', () => {
  const c = compoundById('star');
  const config = compoundWorld(c, c.world, 1);
  config.globals = { ...config.globals, heaviestLevel: 10, pressurePush: 0 };
  const sim = new Simulation(config);
  for (let i = 0; i < 2500; i++) sim.step();
  let h = 7;
  for (const p of sim.world.particles) h = (Math.imul(h, 31) + p.cell * 7 + p.cls + Math.round(p.energy * 10)) | 0;
  assert.equal(sim.world.particles.length, 172);
  assert.equal(h, -1322105602);
  assert.equal(sim.totals.fusions, 102);
});
