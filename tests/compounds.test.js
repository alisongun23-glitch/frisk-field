import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPOUNDS, compoundById, compoundWorld, layoutOf, placeCompound } from '../src/compounds.js';
import { MAX_CLASSES, normalizeConfig } from '../src/config.js';
import { Simulation } from '../src/sim.js';
import { makeSim, place } from './helpers.js';

// A compound in its own world, optionally with some settings changed.
function own(id, { seed = 1, globals = {}, value } = {}) {
  const compound = compoundById(id);
  const config = compoundWorld(compound, compound.world, seed, value ?? compound.input?.def);
  config.globals = { ...config.globals, ...globals };
  return new Simulation(config);
}
const levelsLeft = (sim) => sim.world.particles.filter((p) => p.energy !== 0).map((p) => p.energy).sort((a, b) => b - a);
const countOf = (sim, name) => sim.world.counts[sim.config.classes.findIndex((c) => c.name === name)];
const run = (sim, ticks) => {
  for (let i = 0; i < ticks; i++) sim.step();
};

for (const compound of COMPOUNDS) {
  test(`${compound.name}: its layout is sound and it fits its worlds`, () => {
    const { parts, bonds, heat } = layoutOf(compound);
    const cells = new Set(parts.map((p) => `${p.x},${p.y}`));
    assert.equal(cells.size, parts.length, 'no two parts on one cell');
    for (const p of parts) assert.ok(p.c in compound.classes, p.c);
    for (const [a, b] of bonds) {
      assert.ok(Math.abs(parts[a].x - parts[b].x) <= 1 && Math.abs(parts[a].y - parts[b].y) <= 1, 'bonded parts touch');
    }
    for (const map of [compound.world, compound.preview]) {
      for (const p of [...parts, ...heat]) assert.ok(Math.abs(p.x) < map.width / 2 && Math.abs(p.y) < map.height / 2, `${p.x},${p.y} in ${map.width}x${map.height}`);
    }
    assert.ok(compound.blurb && compound.math);
  });

  test(`${compound.name}: its world loads and runs`, () => {
    const config = normalizeConfig(compoundWorld(compound));
    assert.equal(config.rules, 'energy');
    const sim = new Simulation(config);
    const { parts } = layoutOf(compound);
    assert.equal(sim.world.particles.length, parts.length);
    run(sim, 300);
    assert.ok(sim.field.every(Number.isFinite));
    for (const mol of sim.world.molecules) {
      assert.ok(Math.abs(mol.net - mol.members.reduce((sum, m) => sum + m.energy, 0)) < 1e-9);
      for (const m of mol.members) {
        assert.equal(m.mol, mol);
        assert.equal(sim.world.cells[m.cell], m);
        for (const b of m.bonds) assert.ok(sim.world.adjacent(b.host.cell, b.guest.cell), 'bonds stay side by side');
      }
    }
  });
}

test('placing one brings in its classes once, however many times it is placed', () => {
  const sim = makeSim({ rules: 'energy', classes: [{ traits: { energy: 3 } }], globals: { width: 200, height: 150, neutralBand: 0.5 } });
  const { parts } = layoutOf(compoundById('hamster'));
  assert.equal(sim.placeCompound('hamster', 50, 50), parts.length);
  assert.equal(sim.config.classes.length, 3);
  assert.equal(sim.placeCompound('hamster', 120, 100), parts.length);
  assert.equal(sim.config.classes.length, 3);
  assert.equal(countOf(sim, 'Pet'), 2);
  assert.equal(sim.world.counts.length, 3);
  assert.equal(sim.history.at(-1).counts.length, 3);
  assert.equal(sim.world.molecules.length, 2);
  assert.equal(sim.world.molecules[0].members.length, 32);
});

test('it clears what’s under it, and leaves everything else', () => {
  const sim = makeSim({ rules: 'energy', classes: [{ traits: { energy: 3, growthPattern: [3] } }, { traits: { energy: -3, growthPattern: [7] } }], globals: { width: 200, height: 150, neutralBand: 0.5 } });
  const under = place(sim, 0, 100, 75);
  const partner = place(sim, 1, 101, 75);
  sim.world.addBond(under, partner, 0);
  const away = place(sim, 0, 10, 10);
  sim.placeCompound('hamster', 100, 75);
  assert.ok(!under.alive, 'the pet takes its cell');
  assert.ok(partner.alive && partner.mol === null, 'its partner is left alone, and free');
  assert.ok(away.alive);
});

test('Reset brings placed compounds back, until they are forgotten', () => {
  const sim = makeSim({ rules: 'energy', classes: [{ traits: { energy: 3 } }], globals: { width: 200, height: 150, neutralBand: 0.5 } });
  sim.placeCompound('hamster', 100, 75);
  run(sim, 20);
  sim.reset();
  assert.equal(countOf(sim, 'Pet'), 1);
  assert.equal(sim.world.cells[sim.world.index(100, 75)].energy, 3, 'back where it was put');
  assert.equal(sim.world.molecules.length, 1);
  sim.config.stamps = [];
  sim.reset();
  assert.equal(countOf(sim, 'Pet'), 0);
});

test('placed compounds stay in saved settings', () => {
  const sim = makeSim({ rules: 'energy', classes: [{ traits: { energy: 3 } }], globals: { width: 200, height: 150, neutralBand: 0.5 } });
  sim.placeCompound('binary', 100, 75, 7);
  const again = new Simulation(JSON.parse(JSON.stringify(sim.config)));
  assert.equal(countOf(again, 'One'), 7);
  assert.equal(again.config.stamps[0].value, 7);
});

test('hand-set matrices and a full class list turn a compound down, leaving the world as it was', () => {
  const matrix = makeSim({ classes: [{ traits: {}, count: 5 }], globals: { width: 60, height: 60 } });
  assert.equal(matrix.placeCompound('hamster', 30, 30), -1);
  assert.equal(matrix.world.particles.length, 5);
  assert.equal(matrix.config.stamps.length, 0);

  const full = makeSim({ rules: 'energy', classes: Array.from({ length: MAX_CLASSES }, () => ({ traits: { energy: 3 } })), globals: { width: 60, height: 60 } });
  const here = place(full, 0, 30, 30);
  assert.equal(full.placeCompound('hamster', 30, 30), -1);
  assert.ok(here.alive);
  assert.equal(full.config.stamps.length, 0);
});

test('an unknown compound in saved settings is passed over', () => {
  const config = compoundWorld(compoundById('hamster'));
  config.stamps.push({ id: 'nonsense', x: 0.2, y: 0.2 });
  const sim = new Simulation(config);
  assert.equal(sim.world.particles.length, 33);
});

test('energy is worked out from the world’s own thresholds, so a fuse burns under other settings too', () => {
  const sim = own('fuse', { globals: { spawnBuffer: 40, burnThreshold: 5, spread: 2 } });
  run(sim, 3000);
  assert.equal(countOf(sim, 'Fuse cord'), 0);
});

test('Binary counter: any number from 1 to 15 ends up written in binary', () => {
  for (let n = 1; n <= 15; n++) {
    const want = [8, 4, 2, 1].filter((b) => n & b);
    for (const seed of [1, 2]) {
      const sim = own('binary', { seed, value: n });
      for (let t = 0; t < 40000 && levelsLeft(sim).length > want.length; t++) sim.step();
      assert.deepEqual(levelsLeft(sim), want, `${n} on seed ${seed}, at tick ${sim.tick}`);
      run(sim, 50);
      assert.deepEqual(levelsLeft(sim), want, 'and it stays that way');
    }
  }
});

test('Half-life: half are gone every 138 ticks', () => {
  const sim = own('halflife', { seed: 3 });
  const start = sim.world.particles.length;
  run(sim, 138);
  const half = sim.world.particles.length;
  assert.ok(Math.abs(half - start / 2) < 60, `${half} of ${start}`);
  run(sim, 138);
  assert.ok(Math.abs(sim.world.particles.length - start / 4) < 50, `${sim.world.particles.length} of ${start}`);
  assert.ok(compoundById('halflife').blurb.includes('138'));
});

test('Wildfire: the route is random, but the number of burns and the final pattern never change', () => {
  const finish = (seed, energyProb) => {
    const sim = own('wildfire', { seed, globals: { energyProb } });
    run(sim, 3000);
    const before = sim.totals.kills;
    run(sim, 100);
    assert.equal(sim.totals.kills, before, 'it has finished');
    return { burns: sim.totals.kills, pattern: sim.world.cells.map((p) => (p ? 1 : 0)).join(''), field: sim.field };
  };
  const first = finish(1, 0.2);
  assert.equal(first.burns, 33136);
  assert.ok(compoundById('wildfire').blurb.includes('33,136'));
  for (const [seed, chance] of [[2, 0.2], [3, 0.5], [4, 0.1]]) {
    const other = finish(seed, chance);
    assert.equal(other.burns, first.burns);
    assert.equal(other.pattern, first.pattern);
    for (let i = 0; i < first.field.length; i++) assert.ok(Math.abs(other.field[i] - first.field[i]) < 1e-9);
  }
});

test('Wildfire: with the Steady trickle on, lightning keeps it going', () => {
  const sim = own('wildfire', { globals: { energyProb: 0.2, trickleOn: true, trickle: 1 } });
  run(sim, 3000);
  const before = sim.totals.kills;
  run(sim, 300);
  assert.ok(sim.totals.kills > before);
});

test('Sandpile mandala: the same symmetric pattern on any seed', () => {
  const settle = (seed) => {
    const compound = compoundById('mandala');
    const config = compoundWorld(compound, { width: 61, height: 61 }, seed);
    config.stamps = [];
    const sim = new Simulation(config);
    sim.field[sim.world.index(30, 30)] = 3000;
    run(sim, 12000);
    const before = sim.totals.kills;
    run(sim, 100);
    assert.equal(sim.totals.kills, before, 'it has settled');
    return sim;
  };
  const first = settle(1);
  const at = (sim, x, y) => (sim.world.cells[sim.world.index(30 + x, 30 + y)] ? 1 : 0);
  for (let y = -20; y <= 20; y++) {
    for (let x = -20; x <= 20; x++) {
      const here = at(first, x, y);
      assert.equal(here, at(first, -x, y), 'mirrored left to right');
      assert.equal(here, at(first, x, -y), 'mirrored top to bottom');
      assert.equal(here, at(first, y, x), 'mirrored on the diagonal');
    }
  }
  const other = settle(9);
  assert.equal(other.world.cells.map((p) => (p ? 1 : 0)).join(''), first.world.cells.map((p) => (p ? 1 : 0)).join(''));
  assert.ok(first.world.particles.length > 20, 'something grew');
});

test('Spiral fuse: it burns strictly in order along the spiral, to the very end', () => {
  const compound = compoundById('fuse');
  const sim = own('fuse', { seed: 2 });
  const { parts } = layoutOf(compound);
  const cx = Math.floor(0.5 * sim.world.width);
  const cy = Math.floor(0.5 * sim.world.height);
  const alive = () => parts.map((p) => sim.world.cells[sim.world.index(cx + p.x, cy + p.y)] !== null);
  for (let t = 0; t < 300; t++) {
    run(sim, 10);
    const now = alive();
    const firstLeft = now.indexOf(true);
    if (firstLeft >= 0) assert.ok(now.slice(firstLeft).every(Boolean), 'nothing burns out of turn');
  }
  assert.equal(sim.world.particles.length, 0);
});

test('Cartoon bomb: the fuse burns down, the powder goes up, and the shrapnel flies out', () => {
  for (const seed of [1, 2, 3]) {
    const sim = own('bomb', { seed });
    const powder = countOf(sim, 'Powder');
    const shrapnel = countOf(sim, 'Shrapnel');
    const spread = () => {
      const pieces = sim.world.particles.filter((p) => p.energy === 0);
      const mx = pieces.reduce((s, p) => s + p.x, 0) / pieces.length;
      const my = pieces.reduce((s, p) => s + p.y, 0) / pieces.length;
      return pieces.reduce((s, p) => s + Math.hypot(p.x - mx, p.y - my), 0) / pieces.length;
    };
    const before = spread();
    run(sim, 20);
    assert.equal(countOf(sim, 'Powder'), powder, 'not yet: the fuse is still burning');
    run(sim, 480);
    assert.equal(countOf(sim, 'Fuse cord'), 0);
    assert.ok(countOf(sim, 'Powder') <= powder * 0.02, `${countOf(sim, 'Powder')} powder left on seed ${seed}`);
    assert.equal(countOf(sim, 'Shrapnel'), shrapnel);
    assert.ok(spread() > before * 2, 'it flew apart');
  }
});

test('Popcorn: half the wicks catch within about 277 ticks, and about 1 in 20 goes cold and never does', () => {
  const waits = [];
  let total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const sim = own('popcorn', { seed });
    const wick = sim.config.classes.findIndex((c) => c.name === 'Wick');
    total += sim.world.counts[wick];
    let last = sim.world.counts[wick];
    for (let t = 0; t < 1400; t++) {
      sim.step();
      const now = sim.world.counts[wick];
      for (let i = 0; i < last - now; i++) waits.push(t);
      last = now;
    }
  }
  waits.sort((a, b) => a - b);
  const median = waits[Math.floor(total / 2)];
  assert.ok(median > 200 && median < 360, `median ${median}`);
  const duds = total - waits.length;
  assert.ok(duds >= 3 && duds <= 25, `${duds} of ${total}`);
});

test('Popcorn: kernels pop at different times', () => {
  const sim = own('popcorn', { seed: 2 });
  const { parts } = layoutOf(compoundById('popcorn'));
  const hulls = parts.filter((p) => p.c === 'wick');
  const cx = Math.floor(0.5 * sim.world.width);
  const cy = Math.floor(0.5 * sim.world.height);
  const popped = new Array(hulls.length).fill(-1);
  for (let t = 0; t < 6000 && popped.includes(-1); t++) {
    sim.step();
    hulls.forEach((p, i) => {
      if (popped[i] < 0 && sim.world.cells[sim.world.index(cx + p.x, cy + p.y)]?.energy !== 1) popped[i] = t;
    });
  }
  assert.ok(!popped.includes(-1), 'all of them went');
  assert.ok(Math.max(...popped) - Math.min(...popped) > 100, `${popped}`);
  assert.equal(countOf(sim, 'Corn'), 150, 'and the corn is still there');
});

test('Speed dating: every couple ends up exact', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const sim = own('dating', { seed });
    const exact = () => sim.world.molecules.length === 6 && sim.world.molecules.every((m) => m.members.length === 2 && m.net === 0);
    for (let t = 0; t < 30000 && !exact(); t++) sim.step();
    assert.ok(exact(), `seed ${seed} at tick ${sim.tick}: ${sim.world.molecules.map((m) => m.members.map((p) => p.energy).join('/'))}`);
    assert.ok(sim.totals.breaks > 0, 'wrong couples did split up on the way');
    run(sim, 500);
    assert.ok(exact(), 'and exact couples stay together');
  }
});

test('Polymer: rods snap into straight lines, each adding +1 overall', () => {
  const sim = own('polymer', { seed: 4 });
  run(sim, 4000);
  assert.equal(sim.totals.breaks, 0);
  let longest = 0;
  for (const mol of sim.world.molecules) {
    assert.ok(mol.members.every((m) => m.y === mol.members[0].y), 'straight');
    assert.equal(mol.net, mol.members.length / 2);
    longest = Math.max(longest, mol.members.length);
  }
  assert.ok(longest >= 8, `longest ${longest}`);
  assert.ok(sim.world.molecules.length < 40, 'they did join up');
});

test('Hamster ball: the ring stays whole, the pet stays in, and off they go', () => {
  const sim = own('hamster', { seed: 5 });
  const pet = sim.world.particles.find((p) => p.mol === null);
  const ring = sim.world.molecules[0];
  const lead = ring.members[0];
  const start = [lead.x, lead.y];
  run(sim, 3000);
  assert.equal(ring.members.length, 32);
  const offsets = ring.members.map((m) => {
    let x = m.x - pet.x;
    let y = m.y - pet.y;
    if (x > sim.world.width / 2) x -= sim.world.width;
    if (x < -sim.world.width / 2) x += sim.world.width;
    if (y > sim.world.height / 2) y -= sim.world.height;
    if (y < -sim.world.height / 2) y += sim.world.height;
    return [x, y];
  });
  assert.ok(Math.max(...offsets.map((o) => o[0])) > 0 && Math.min(...offsets.map((o) => o[0])) < 0, 'ring on both sides');
  assert.ok(Math.max(...offsets.map((o) => o[1])) > 0 && Math.min(...offsets.map((o) => o[1])) < 0, 'ring above and below');
  assert.notDeepEqual([lead.x, lead.y], start, 'it moved');
});

test('Little sun: the rain falls in and stays there', () => {
  const sim = own('sun', { seed: 6 });
  const cx = Math.floor(0.5 * sim.world.width);
  const cy = Math.floor(0.5 * sim.world.height);
  const reach = () => {
    const rain = sim.world.particles.filter((p) => p.energy !== 0);
    return rain.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / rain.length;
  };
  const before = reach();
  run(sim, 1500);
  const after = reach();
  assert.ok(after < before * 0.8, `${before} to ${after}`);
  assert.equal(countOf(sim, 'Rock'), layoutOf(compoundById('sun')).parts.filter((p) => p.c === 'rock').length);
  const moves = sim.totals.moves;
  run(sim, 200);
  assert.ok(sim.totals.moves - moves < 200, 'it has settled');
});

test('Pocket star: it crushes its own middle and fuses', () => {
  const sim = own('star', { seed: 7 });
  run(sim, 400);
  assert.ok(sim.totals.crushes > 0);
  assert.ok(sim.totals.fusions > 10, `${sim.totals.fusions}`);
  const levels = sim.config.classes.map((c) => c.traits.energy);
  assert.ok(levels.includes(6) && levels.includes(-6));
});

test('placing a compound directly reports what went in, and walls cut it off', () => {
  const sim = makeSim({ rules: 'energy', classes: [{ traits: { energy: 3 } }], globals: { width: 200, height: 150, neutralBand: 0.5, wrap: false } });
  const compound = compoundById('hamster');
  const whole = layoutOf(compound).parts.length;
  assert.equal(placeCompound(sim, compound, 100, 75), whole);
  const cut = placeCompound(sim, compound, 0, 0);
  assert.ok(cut > 0 && cut < whole);
});
