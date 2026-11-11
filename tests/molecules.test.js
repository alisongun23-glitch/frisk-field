import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DensityMap } from '../src/molecules.js';
import { fractionOf } from '../src/config.js';
import { makeSim, place, arrive, wrapDelta, distance, fieldTotal } from './helpers.js';

const N = 1;
const E = 3;
const moving = { frisk: 1, randomWalk: 0.7, stayProb: 0, deathProb: 1 };
const world = { neutralBand: 0.5, growthGap: 5, bondCost: 6, bondRelease: 0, senseRadius: 6, width: 100, height: 100 };

function sim2(a, b, globals = {}, traits = {}) {
  return makeSim({
    rules: 'energy',
    classes: [
      { traits: { ...moving, energy: a, growthPattern: [E], ...traits } },
      { traits: { ...moving, energy: b, growthPattern: [N], ...traits } },
    ],
    globals: { ...world, ...globals },
  });
}

test('with nothing else around a bond never breaks, whatever the random walk', () => {
  const sim = sim2(3, -3, {}, { randomWalk: 1 });
  const a = place(sim, 0, 50, 50);
  const b = place(sim, 1, 60, 60);
  arrive(sim, b, 51, 50);
  for (let i = 0; i < 2000; i++) sim.step();
  assert.equal(a.mol, b.mol);
  assert.equal(sim.totals.breaks, 0);
});

test('an attractive class close to one member pulls it out of its molecule', () => {
  const sim = sim2(3, -3);
  const a = place(sim, 0, 50, 50);
  const b = place(sim, 1, 60, 60);
  arrive(sim, b, 51, 50);
  assert.equal(sim.world.overallEnergy(a), 0);
  // A free -3 right next to the +3, on the far side from its partner.
  place(sim, 1, 48, 50);
  for (let i = 0; i < 30 && a.mol !== null && a.mol === b.mol; i++) sim.step();
  assert.ok(a.mol === null || a.mol !== b.mol, 'they came apart');
  assert.ok(sim.totals.breaks >= 1);
});

test('breaking needs a large difference: a weak pull from far away doesn’t do it', () => {
  const sim = sim2(3, -3, {}, { frisk: 0 });
  const a = place(sim, 0, 50, 50);
  const b = place(sim, 1, 60, 60);
  arrive(sim, b, 51, 50);
  place(sim, 1, 44, 50);
  for (let i = 0; i < 300; i++) sim.step();
  assert.equal(a.mol, b.mol);
  assert.equal(sim.totals.breaks, 0);
});

test('Disagreement sets how large a difference it takes', () => {
  const run = (disagreement) => {
    const sim = sim2(3, -3, { disagreement }, { frisk: 0 });
    const a = place(sim, 0, 50, 50);
    const b = place(sim, 1, 60, 60);
    arrive(sim, b, 51, 50);
    place(sim, 1, 47, 50);
    for (let i = 0; i < 100; i++) sim.step();
    return a.mol === null ? 'broke' : 'held';
  };
  assert.equal(run(0.2), 'broke');
  assert.equal(run(2), 'held');
});

test('ConnectRandomStayProb 1 holds a bond through any disagreement', () => {
  const sim = sim2(3, -3, {}, { stayProb: 1 });
  const a = place(sim, 0, 50, 50);
  const b = place(sim, 1, 60, 60);
  arrive(sim, b, 51, 50);
  place(sim, 1, 48, 50);
  for (let i = 0; i < 200; i++) sim.step();
  assert.equal(a.mol, b.mol);
});

test('a costly bond that breaks puts its energy into the grid', () => {
  const sim = sim2(3, 3, { bondRelease: 0.5, energyProb: 0, disagreement: 0.5 }, { frisk: 0 });
  const a = place(sim, 0, 50, 50);
  const b = place(sim, 1, 60, 60);
  sim.field[sim.world.index(51, 50)] = 6;
  assert.equal(arrive(sim, b, 51, 50), true);
  assert.equal(fieldTotal(sim.field), 0);
  // Both are +3, so they both want this -3, but it sits right above one of them, and the other is pulled at an angle.
  place(sim, 0, 50, 49, { energy: -3 });
  for (let i = 0; i < 100 && a.mol !== null; i++) sim.step();
  assert.equal(a.mol, null);
  assert.ok(Math.abs(fieldTotal(sim.field) - 6.5) < 1e-9);
});

const shapeOf = (members, w, h) => {
  const [first] = members;
  return members.map((m) => [wrapDelta(m.x - first.x, w), wrapDelta(m.y - first.y, h)]);
};

test('a molecule keeps its exact shape as it moves, and both sorts do move', () => {
  for (const [a, b, label] of [[3, -3, 'neutral'], [5, -1, 'charged']]) {
    const sim = sim2(a, b, { macroSpeed: 1 });
    const p = place(sim, 0, 50, 50);
    const q = place(sim, 1, 60, 60);
    arrive(sim, q, 51, 50);
    // Some company, so a neutral molecule has somewhere to go.
    const r = place(sim, 0, 70, 50);
    const s = place(sim, 1, 71, 50);
    sim.world.addBond(r, s, 0);
    sim.density.refresh(sim.world, -1000);
    const before = shapeOf([p, q], 100, 100);
    const startX = p.x;
    const startY = p.y;
    for (let i = 0; i < 40; i++) {
      sim.step();
      assert.deepEqual(shapeOf([p, q], 100, 100), before, label);
      assert.equal(sim.world.cells[p.cell], p);
      assert.equal(sim.world.cells[q.cell], q);
    }
    assert.ok(p.x !== startX || p.y !== startY, `${label} should have moved`);
  }
});

test('a molecule that can’t fit where it is going stays put', () => {
  const sim = sim2(3, -3);
  const p = place(sim, 0, 50, 50);
  const q = place(sim, 1, 60, 60);
  arrive(sim, q, 51, 50);
  place(sim, 0, 52, 49);
  assert.equal(sim.world.shift(p.mol.members, 1, -1), false);
  assert.deepEqual([p.x, p.y, q.x, q.y], [50, 50, 51, 50]);
  assert.equal(sim.world.shift(p.mol.members, 1, 0), true, 'a member may move onto a cell another member is leaving');
  assert.deepEqual([p.x, p.y, q.x, q.y], [51, 50, 52, 50]);
});

test('a member that can’t move slows its molecule down, and only stops it if none of them can move', () => {
  const stepsIn = (friskA, friskB) => {
    const sim = sim2(5, -1);
    const a = place(sim, 0, 50, 50, { frisk: friskA });
    const b = place(sim, 1, 51, 50, { frisk: friskB });
    sim.world.addBond(a, b, 0);
    let moved = 0;
    for (let i = 0; i < 600; i++) {
      const was = a.cell;
      sim.step();
      if (a.cell !== was) moved++;
    }
    return moved;
  };
  assert.equal(stepsIn(0, 0), 0);
  const slowed = stepsIn(0, 1);
  const free = stepsIn(1, 1);
  assert.ok(slowed > 0, 'a frozen member gets dragged along');
  assert.ok(slowed < free * 0.75, `${slowed} steps against ${free}`);
  assert.ok(stepsIn(2, 2) > slowed);
});

test('a charged molecule goes where its members agree', () => {
  const sim = sim2(5, -1, {}, { randomWalk: 0.5 });
  const a = place(sim, 0, 50, 50);
  const b = place(sim, 1, 60, 60);
  arrive(sim, b, 51, 50);
  place(sim, 1, 56, 50, { frisk: 0, energy: -5 });
  const start = distance(a, { x: 56, y: 50 }, 100, 100);
  let closest = start;
  for (let i = 0; i < 300 && a.mol.members.length === 2; i++) {
    sim.step();
    closest = Math.min(closest, distance(a, { x: 56, y: 50 }, 100, 100));
  }
  assert.ok(closest < start, `got as close as ${closest} from ${start}`);
});

test('the density map points toward more molecules, within its range', () => {
  const sim = sim2(3, -3, { macroRange: 16 });
  const cluster = [];
  for (let i = 0; i < 6; i++) {
    const a = place(sim, 0, 60 + i * 2, 50);
    const b = place(sim, 1, 60 + i * 2, 51);
    sim.world.addBond(a, b, 0);
    cluster.push(a);
  }
  const map = new DensityMap(sim.world, 16);
  map.refresh(sim.world, 0);
  assert.equal(map.towardMore(sim.world, 50, 50), 2, 'east, side index 2');
  assert.equal(map.towardMore(sim.world, 80, 50), 6, 'west, side index 6');
  assert.equal(map.towardMore(sim.world, 10, 10), -1, 'nothing within range');
  assert.ok(cluster.length > 0);
});

test('free particles count in the density map too', () => {
  const sim = sim2(3, -3);
  for (let i = 0; i < 40; i++) place(sim, 0, 70 + (i % 8), 50 + Math.floor(i / 8));
  const map = new DensityMap(sim.world, 32);
  map.refresh(sim.world, 0);
  const side = map.towardMore(sim.world, 50, 52);
  assert.equal(side, 2, 'toward them, to the east');
});

test('neutral molecules creep toward denser groups, slowly', () => {
  const run = (withCluster) => {
    const sim = sim2(3, -3, { macroRange: 32, macroSpeed: 0.25 });
    const p = place(sim, 0, 40, 50);
    const q = place(sim, 1, 41, 50);
    sim.world.addBond(p, q, 0);
    if (withCluster) {
      for (let i = 0; i < 8; i++) {
        const a = place(sim, 0, 62 + (i % 4) * 2, 46 + Math.floor(i / 4) * 4);
        const b = place(sim, 1, 62 + (i % 4) * 2, 47 + Math.floor(i / 4) * 4);
        sim.world.addBond(a, b, 0);
      }
    }
    for (let i = 0; i < 60; i++) sim.step();
    return p.x;
  };
  assert.ok(run(true) > 43, 'moved toward the cluster to the east');
});

test('a neutral molecule at Macro speed 0 stays put', () => {
  const sim = sim2(3, -3, { macroSpeed: 0 });
  const p = place(sim, 0, 40, 50);
  const q = place(sim, 1, 41, 50);
  sim.world.addBond(p, q, 0);
  const r = place(sim, 0, 45, 50);
  const s = place(sim, 1, 46, 50);
  sim.world.addBond(r, s, 0);
  for (let i = 0; i < 100; i++) sim.step();
  assert.deepEqual([p.x, p.y], [40, 50]);
});

test('seeds still land where placed, and connect once they move', () => {
  const site = { x: fractionOf(30, 100), y: fractionOf(30, 100), radius: 0, count: 1 };
  const sim = makeSim({
    rules: 'energy',
    classes: [{ traits: { ...moving, energy: 3, growthPattern: [E] }, sites: [site] }, { traits: { ...moving, frisk: 0, energy: -3 } }],
    globals: world,
  });
  const [p] = sim.world.particles;
  assert.deepEqual([p.x, p.y], [30, 30]);
});

test('the density map has no favorite spots: the same molecules pull the same way wherever they are on the map', () => {
  const pull = (dx, dy) => {
    const sim = sim2(3, -3, { macroRange: 32, width: 400, height: 400 });
    for (let i = 0; i < 12; i++) {
      const a = place(sim, 0, 100 + dx + i * 2, 100 + dy);
      const b = place(sim, 1, 100 + dx + i * 2, 101 + dy);
      sim.world.addBond(a, b, 0);
    }
    const map = new DensityMap(sim.world, 32);
    map.refresh(sim.world, 0);
    return [map.towardMore(sim.world, 90 + dx, 100 + dy), map.towardMore(sim.world, 134 + dx, 100 + dy)];
  };
  // A whole number of blocks along, it must read exactly the same. Blocks are small enough that nothing else can be a lattice.
  for (const shift of [8, 16, 32, 40, 64, 200]) assert.deepEqual(pull(shift, 0), pull(0, 0), `shifted ${shift}`);
  assert.deepEqual(pull(0, 0), [2, 6]);
});

test('with no walls the density map wraps around the edges, and with walls it doesn’t', () => {
  const near = (wrap) => {
    const sim = sim2(3, -3, { macroRange: 16, wrap });
    for (let i = 0; i < 6; i++) {
      const a = place(sim, 0, 94, 40 + i * 2);
      const b = place(sim, 1, 95, 40 + i * 2);
      sim.world.addBond(a, b, 0);
    }
    const map = new DensityMap(sim.world, 16);
    map.refresh(sim.world, 0);
    return map.towardMore(sim.world, 2, 45);
  };
  assert.equal(near(true), 6, 'west, across the edge');
  assert.equal(near(false), -1, 'nothing in range on this side of the wall');
});
