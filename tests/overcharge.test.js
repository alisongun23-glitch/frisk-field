import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCrowd } from '../src/crowding.js';
import { breakApart, breakIfUnsteady, burstKernel, steadiedBy } from '../src/overcharge.js';
import { sensePull } from '../src/movement.js';
import { MAX_CLASSES, normalizeConfig, makeClass } from '../src/config.js';
import { Simulation } from '../src/sim.js';
import { makeSim, place, arrive, fieldTotal } from './helpers.js';

const N = 1;
const E = 3;
const still = { frisk: 0, randomWalk: 1, stayProb: 1, deathProb: 0 };
const world = {
  neutralBand: 0.5, growthGap: 5, bondCost: 6, bondRelease: 0.25, width: 40, height: 40, layerReach: 2, fusionBurst: 10, instability: 1,
};
const CROWD_LEVEL = 1;

// Class 0 is the one under test, class 1 what it may bond with, and class 2 the crowd.
function setup(a, b = -3, globals = {}, traits = still) {
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

function surround(sim, x, y) {
  for (const o of sim.layer) {
    const c = sim.world.index(x + o.ox, y + o.oy);
    if (c >= 0 && sim.world.cells[c] === null) place(sim, 2, x + o.ox, y + o.oy);
  }
}

// Two touching free particles of class 0 deep in a crowd, about to fuse.
function fusing(level, globals = {}) {
  const sim = setup(level, -3, { fusionLayer: 8, ...globals });
  const a = place(sim, 0, 20, 20);
  const b = place(sim, 0, 21, 20);
  surround(sim, 20, 20);
  return { sim, a, b };
}

const levelsOf = (sim) => sim.world.particles.map((p) => p.energy).filter((e) => e !== CROWD_LEVEL).sort((x, y) => x - y);

test('fusion goes past the Stable limit, up to the Heaviest level', () => {
  for (const level of [6, -6, 40]) {
    const { sim, a } = fusing(level);
    assert.equal(checkCrowd(sim, a), true, `${level}`);
    assert.deepEqual(levelsOf(sim), [level * 2]);
    assert.equal(sim.world.cells[sim.world.index(20, 20)].energy, level * 2);
  }
  const past = fusing(100);
  assert.equal(checkCrowd(past.sim, past.a), false, '200 is past 160');
  assert.equal(past.sim.events.fusions, 0);
});

test('a class past the limit is named for its level, comes only from fusion, and is made once', () => {
  const { sim, a } = fusing(6);
  checkCrowd(sim, a);
  const made = sim.config.classes.find((c) => c.traits.energy === 12);
  assert.equal(made.name, '+12');
  assert.equal(made.spawns, false);
  const before = sim.config.classes.length;
  const again = place(sim, 0, 30, 30);
  place(sim, 0, 31, 30);
  surround(sim, 30, 30);
  assert.equal(checkCrowd(sim, again), true);
  assert.equal(sim.config.classes.length, before);
});

test('breaking makes two at half the level, one where it was and one on a free cell touching it', () => {
  const sim = setup(12, 6);
  const p = place(sim, 0, 20, 20);
  assert.equal(breakApart(sim, p), true);
  assert.equal(p.alive, false);
  assert.deepEqual(levelsOf(sim), [6, 6]);
  assert.equal(sim.world.cells[p.cell].energy, 6);
  assert.equal(sim.world.cells[p.cell].cls, 1, 'the class already at that level');
  const other = sim.world.particles.find((q) => q.cell !== p.cell);
  assert.ok(sim.world.adjacent(p.cell, other.cell));
  assert.equal(sim.events.breakups, 1);
});

test('a fuse and a break in the same place cancel out on the grid', () => {
  const { sim, a } = fusing(6);
  assert.equal(checkCrowd(sim, a), true);
  assert.ok(Math.abs(fieldTotal(sim.field) + 120) < 1e-9, 'the burst of a new +12');
  const fused = sim.world.cells[sim.world.index(20, 20)];
  assert.equal(breakApart(sim, fused), true);
  assert.ok(sim.field.every((e) => Math.abs(e) < 1e-9), 'all of it came back');
});

test('with no free cell within reach it waits', () => {
  const sim = setup(12, 6);
  const p = place(sim, 0, 20, 20);
  surround(sim, 20, 20);
  assert.equal(breakApart(sim, p), false);
  assert.equal(p.alive, true);
  assert.equal(sim.events.breakups, 0);
});

test('with no free cell touching it, the second piece goes to the nearest within reach', () => {
  const sim = setup(12, 6);
  const p = place(sim, 0, 20, 20);
  for (let s = 0; s < 8; s++) {
    const c = sim.world.nbr[p.cell * 8 + s];
    place(sim, 2, c % sim.world.width, Math.floor(c / sim.world.width));
  }
  assert.equal(breakApart(sim, p), true);
  const pieces = sim.world.particles.filter((q) => q.energy === 6);
  assert.equal(pieces.length, 2);
  const away = pieces.find((q) => q.cell !== p.cell);
  assert.equal(Math.max(Math.abs(away.x - 20), Math.abs(away.y - 20)), 2);
});

test('at the class limit, one that would need a new class for its pieces stays as it is', () => {
  const sim = makeSim({
    rules: 'energy',
    classes: Array.from({ length: MAX_CLASSES }, (_, k) => ({ traits: { ...still, energy: k === 0 ? 24 : 1 + (k % 9) } })),
    globals: { ...world },
  });
  const p = place(sim, 0, 20, 20);
  assert.equal(breakApart(sim, p), false);
  assert.equal(p.alive, true);
});

test('in a molecule, its bonds break first and give their energy back', () => {
  const sim = setup(12, -1);
  const p = place(sim, 0, 20, 20);
  const q = place(sim, 1, 30, 30);
  assert.ok(arrive(sim, q, 21, 20), 'they bonded');
  assert.equal(p.mol.net, 11);
  // Crushed, so that its pieces can't bond with what's next to them straight away.
  p.crushed = true;
  assert.equal(breakApart(sim, p), true);
  assert.equal(q.mol, null);
  assert.equal(q.bonds.length, 0);
  assert.equal(sim.events.breaks, 1);
  assert.ok(Math.abs(fieldTotal(sim.field) - (120 + world.bondRelease)) < 1e-9);
});

test('its pieces can bond with what they land next to', () => {
  const sim = setup(12, -1);
  const p = place(sim, 0, 20, 20);
  const q = place(sim, 1, 30, 30);
  assert.ok(arrive(sim, q, 21, 20));
  assert.equal(breakApart(sim, p), true);
  assert.equal(sim.world.cells[p.cell].mol, q.mol, 'a +6 and a −1 can hold together');
  assert.equal(q.mol.net, 5);
});

test('a molecule that adds up to within the limit steadies it, and one that doesn’t, doesn’t', () => {
  const held = setup(12, -3);
  const p = place(held, 0, 20, 20);
  const q = place(held, 1, 30, 30);
  assert.ok(arrive(held, q, 21, 20));
  assert.equal(steadiedBy(held, p), 'molecule');
  for (let i = 0; i < 50; i++) assert.equal(breakIfUnsteady(held, p), false);

  const loose = setup(12, -1);
  const r = place(loose, 0, 20, 20);
  const s = place(loose, 1, 30, 30);
  assert.ok(arrive(loose, s, 21, 20));
  assert.equal(steadiedBy(loose, r), null);
  assert.equal(breakIfUnsteady(loose, r), true);
});

test('the field steadies it only with enough of the opposite charge', () => {
  const cases = [[12, -12, 'field'], [12, -30, 'field'], [12, -11.9, null], [12, 50, null], [-12, 12, 'field'], [-12, -50, null], [-12, 11.9, null]];
  for (const [level, energy, want] of cases) {
    const sim = setup(level, 6);
    const p = place(sim, 0, 20, 20);
    sim.field[p.cell] = energy;
    assert.equal(steadiedBy(sim, p), want, `${level} on ${energy}`);
    assert.equal(breakIfUnsteady(sim, p), want === null, `${level} on ${energy}`);
  }
});

test('within the limit nothing is unstable, whatever the Instability', () => {
  const sim = setup(10, -3, { energyProb: 0 });
  const p = place(sim, 0, 20, 20);
  for (let i = 0; i < 100; i++) sim.step();
  assert.equal(p.alive, true);
  assert.equal(sim.totals.breakups, 0);
  assert.equal(steadiedBy(sim, p), null);
});

test('Instability sets how soon it breaks, and at 0 it never does', () => {
  const steady = setup(12, 6, { instability: 0 });
  const p = place(steady, 0, 20, 20);
  for (let i = 0; i < 200; i++) steady.step();
  assert.equal(p.alive, true);

  const some = setup(12, 6, { instability: 0.05 });
  for (let k = 0; k < 400; k++) place(some, 0, (k % 20) * 2, Math.floor(k / 20) * 2);
  for (let i = 0; i < 14; i++) some.step();
  const left = some.world.particles.filter((q) => q.energy === 12).length;
  assert.ok(left > 140 && left < 260, `about half left after 14 ticks: ${left}`);
});

test('a chain unwinds a step at a time, down to what’s stable', () => {
  const sim = setup(24, 6);
  place(sim, 0, 20, 20);
  sim.step();
  assert.deepEqual(levelsOf(sim).filter((e) => e === 12).length, 2, 'two +12s');
  for (let i = 0; i < 5; i++) sim.step();
  assert.deepEqual(levelsOf(sim), [6, 6, 6, 6]);
  assert.equal(sim.totals.breakups, 3);
});

test('past the limit, bonds with the same sign are refused, and those with the opposite aren’t', () => {
  const same = setup(12, 1);
  place(same, 0, 20, 20);
  const q = place(same, 1, 30, 30);
  assert.equal(arrive(same, q, 21, 20), false, '11 apart would otherwise be free');

  const opposite = setup(12, -1);
  place(opposite, 0, 20, 20);
  const r = place(opposite, 1, 30, 30);
  assert.equal(arrive(opposite, r, 21, 20), true);

  const within = setup(10, 1);
  place(within, 0, 20, 20);
  const s = place(within, 1, 30, 30);
  assert.equal(arrive(within, s, 21, 20), true, 'within the limit, far-apart levels still bond for free');
});

test('past the limit, every opposite charge pulls in full and its own sign pushes it away', () => {
  const pullOn = (level, other) => {
    const sim = setup(level, other, { senseRadius: 6 });
    const p = place(sim, 0, 20, 20);
    place(sim, 1, 23, 20);
    return sensePull(sim, p, level, false)[0];
  };
  assert.ok(pullOn(12, -1) > 0, 'toward a small opposite charge');
  assert.ok(Math.abs(pullOn(12, -1) - pullOn(12, -12)) < 1e-9, 'as hard as a matching one');
  assert.ok(pullOn(12, 1) < 0, 'away from its own sign, even far apart');
  assert.ok(pullOn(1, 12) < 0, 'and the small one is pushed away from it too');
  assert.ok(pullOn(1, 10) > 0, 'within the limit, far-apart levels still pull');
});

test('it shows as unstable or steadied', () => {
  const sim = setup(12, -3, { killThreshold: -40 });
  const p = place(sim, 0, 20, 20);
  assert.equal(sim.stateOf(p), 'unstable');
  sim.field[p.cell] = -12;
  assert.equal(sim.stateOf(p), 'steadied');
  assert.equal(sim.inspect(20, 20).steadied, 'field');
  assert.equal(sim.inspect(21, 20).steadied, null);
});

test('a burst past the limit misses the new particle and reaches further with each doubling', () => {
  const sim = setup(12, 6, { spread: 1 });
  assert.equal(burstKernel(sim, 6), sim.kernel, 'within the limit, the usual spread');
  assert.equal(burstKernel(sim, 10), sim.kernel);
  const at12 = burstKernel(sim, 12);
  const at24 = burstKernel(sim, 24);
  assert.equal(at24.reach, at12.reach + 1);
  for (const ring of [at12, at24]) assert.ok(!ring.some((k) => k.dx === 0 && k.dy === 0));

  const { sim: fused, a } = fusing(6, { spread: 1 });
  checkCrowd(fused, a);
  assert.equal(fused.field[fused.world.index(20, 20)], 0);
  assert.ok(Math.abs(fieldTotal(fused.field) + 120) < 1e-9, 'all of it still lands');
});

test('levels past ±10 survive saving under energy rules, and hand-set matrices stay within ±10', () => {
  const cls = (energy) => makeClass('A', undefined, { energy }, 0);
  const saved = (rules) => normalizeConfig({ rules, classes: [cls(24), cls(-48), cls(5000)] }).classes.map((c) => c.traits.energy);
  assert.deepEqual(saved('energy'), [24, -48, 320]);
  assert.deepEqual(saved('matrix'), [10, -10, 10]);

  const sim = new Simulation({ rules: 'energy', seed: 1, classes: [cls(24)], globals: { width: 20, height: 20 } });
  sim.setClassTrait(0, 'energy', 48);
  assert.equal(sim.config.classes[0].traits.energy, 48);
});
