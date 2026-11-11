import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPOUNDS, compoundById, compoundWorld, layoutOf } from '../src/compounds.js';
import { PROTEINS } from '../src/proteins.js';
import { PROCESSES } from '../src/processes.js';
import { Simulation } from '../src/sim.js';
import { makeSim } from './helpers.js';
import { hasRoom } from '../src/bonds.js';
import { bondEnergy } from '../src/charge.js';

const nameOf = (sim, p) => sim.config.classes[p.cls].name;
const named = (sim, name) => sim.world.particles.filter((p) => nameOf(sim, p) === name);
const docked = (sim, p) => p.mol !== null && p.mol.members.some((m) => nameOf(sim, m) === 'Dock');

function depot(seed, drivers) {
  const compound = compoundById('depot');
  return new Simulation(compoundWorld(compound, compound.world, seed, drivers));
}

// Runs the Depot loop until every load is docked or `ticks` pass. Each delivery goes to the driver that last carried that
// load: a package counts once, and so does the cargo of three crates.
function shuttle(sim, ticks) {
  const drivers = named(sim, 'Driver');
  const packages = named(sim, LOAD);
  const crates = named(sim, 'Crate');
  const loads = [...packages, ...crates];
  const carriedBy = new Map();
  const counted = new Set();
  const deliveries = drivers.map(() => 0);
  let unaided = 0;
  let done = null;
  for (let i = 0; i < ticks && done === null; i++) {
    sim.step();
    for (const load of loads) {
      if (load.mol === null) continue;
      const d = drivers.findIndex((driver) => driver.mol === load.mol);
      if (d >= 0) carriedBy.set(load, d);
      if (counted.has(load) || !docked(sim, load)) continue;
      counted.add(load);
      if (crates.includes(load) && crates.some((c) => c !== load && counted.has(c))) continue;
      if (carriedBy.has(load)) deliveries[carriedBy.get(load)]++;
      else unaided++;
    }
    if (loads.every((load) => docked(sim, load))) done = sim.tick;
  }
  return { done, deliveries, unaided, packages, crates };
}

// The depot's packages.
const LOAD = 'Package';

test('processes come after the proteins and before the other compounds, and a class named like a protein’s is that class', () => {
  assert.deepEqual(COMPOUNDS.slice(PROTEINS.length, PROTEINS.length + PROCESSES.length).map((c) => c.id), PROCESSES.map((p) => p.id));
  const byName = new Map(PROTEINS.flatMap((p) => Object.values(p.classes)).map((spec) => [spec.name, spec]));
  for (const process of PROCESSES) {
    assert.equal(process.kind, 'process');
    assert.ok(process.blurb && process.math && process.preview, process.id);
    for (const spec of Object.values(process.classes)) {
      if (byName.has(spec.name)) assert.equal(spec, byName.get(spec.name), `${process.id}: ${spec.name} is the proteins’ own`);
    }
    for (let value = process.input.min; value <= process.input.max; value++) {
      const { parts } = layoutOf(process, value);
      const cells = new Set(parts.map((p) => `${p.x},${p.y}`));
      assert.equal(cells.size, parts.length, 'no two parts on one cell');
      assert.ok(parts.every((p) => Math.abs(p.x) < process.world.width / 2 && Math.abs(p.y) < process.world.height / 2), 'every part fits its world');
    }
  }
});

test('Depot loop: two drivers deliver all five loads between them, coming back for more after each drop', () => {
  let all = 0;
  let bothTwice = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const sim = depot(seed, 2);
    const { done, deliveries, unaided, crates } = shuttle(sim, 8000);
    assert.equal(unaided, 0, `seed ${seed}: a load reached the dock without a driver`);
    if (done === null) continue;
    all++;
    assert.equal(deliveries[0] + deliveries[1], 5, `seed ${seed}: every load was brought by a driver`);
    if (deliveries.every((n) => n >= 2)) bothTwice++;
    assert.ok(crates.every((c) => c.mol === crates[0].mol), `seed ${seed}: the cargo arrived in one piece`);
    for (let i = 0; i < 500; i++) sim.step();
    assert.equal(named(sim, LOAD).filter((p) => docked(sim, p)).length, 4, `seed ${seed}: the packages stay docked`);
    assert.ok(crates.every((c) => docked(sim, c)), `seed ${seed}: and so does the cargo`);
    assert.ok(named(sim, 'Driver').every((d) => d.mol === null), `seed ${seed}: both drivers end up empty`);
  }
  assert.ok(all >= 18, `${all} of 20 delivered everything`);
  assert.ok(bothTwice >= 12, `both drivers made at least two deliveries in only ${bothTwice} of 20`);
});

test('Depot loop: one driver makes every trip itself', () => {
  let all = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const { done, deliveries } = shuttle(depot(seed, 1), 12000);
    if (done === null) continue;
    all++;
    assert.deepEqual(deliveries, [5], `seed ${seed}: one driver, five deliveries`);
  }
  assert.ok(all >= 5, `${all} of 6 delivered everything`);
});

test('Depot loop: with no drivers nothing leaves the depot', () => {
  for (let seed = 1; seed <= 3; seed++) {
    const sim = depot(seed, 0);
    const start = named(sim, LOAD).map((p) => p.cell);
    for (let i = 0; i < 6000; i++) sim.step();
    assert.ok(sim.world.particles.every((p) => !docked(sim, p) || nameOf(sim, p) === 'Dock'), `seed ${seed}: nothing is docked`);
    assert.deepEqual(named(sim, LOAD).map((p) => p.cell), start, `seed ${seed}: the packages haven’t moved`);
  }
});

test('the Depot loop brings no classes of its own into a world that has the Garage and the Freighter', () => {
  const sim = makeSim({ rules: 'energy', classes: [{ traits: { energy: 0, frisk: 0 } }], globals: { width: 300, height: 200, neutralBand: 0.5 } });
  sim.placeCompound('garage', 60, 60);
  sim.placeCompound('freighter', 200, 60);
  const before = sim.config.classes.length;
  assert.ok(sim.placeCompound('depot', 150, 150) > 0);
  assert.equal(sim.config.classes.length, before);
});

// The Relay in its own world, and the particles it's about.
function relay(seed, payloads) {
  const compound = compoundById('relay');
  const sim = new Simulation(compoundWorld(compound, compound.world, seed, payloads));
  const [gate] = named(sim, 'Gate');
  const [b] = named(sim, 'Driver B');
  const [pkg] = named(sim, 'Package');
  const [payload] = named(sim, 'Payload');
  return { sim, gate, b, pkg, payload };
}

test('Relay: the payload goes into the gate, that lets driver B go, and B takes its package to the dock', () => {
  let all = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { sim, gate, b, pkg, payload } = relay(seed, 1);
    let opened = null;
    let left = null;
    let byB = false;
    for (let i = 0; i < 3000 && !docked(sim, pkg); i++) {
      sim.step();
      if (opened === null && payload.mol !== null && payload.mol === gate.mol) opened = sim.tick;
      if (left === null && b.mol !== gate.mol) left = sim.tick;
      if (pkg.mol !== null && pkg.mol === b.mol) byB = true;
    }
    if (!docked(sim, pkg)) continue;
    all++;
    assert.ok(opened !== null && left >= opened, `seed ${seed}: B left only once the payload was in the gate`);
    assert.ok(byB, `seed ${seed}: B carried the package`);
    for (let i = 0; i < 500; i++) sim.step();
    assert.ok(docked(sim, pkg), `seed ${seed}: the package stays docked`);
    assert.equal(payload.mol, gate.mol, `seed ${seed}: and the payload stays in the gate`);
  }
  assert.ok(all >= 19, `${all} of 20 went all the way`);
});

test('Relay: with no payload the gate stays shut and nothing is delivered', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const { sim, gate, b, pkg } = relay(seed, 0);
    for (let i = 0; i < 3000; i++) {
      sim.step();
      assert.equal(b.mol, gate.mol, `seed ${seed}: B left at tick ${sim.tick}`);
    }
    assert.ok(!docked(sim, pkg), `seed ${seed}: nothing docked`);
  }
});

test('Relay: once the payload is off, the empty messenger has no room for any bond', () => {
  const { sim, gate, payload } = relay(1, 1);
  for (let i = 0; i < 3000 && payload.mol !== gate.mol; i++) sim.step();
  assert.equal(payload.mol, gate.mol, 'the payload got into the gate');
  for (const part of [...named(sim, 'Messenger'), ...named(sim, 'Tail')]) {
    assert.equal(part.bonds.length, 1);
    assert.equal(hasRoom(part), false, `${nameOf(sim, part)} is full`);
  }
});

// The Relay chain in its own world, and the particles it's about. Gate 1 is built first.
function chain(seed, payloads) {
  const compound = compoundById('chain');
  const sim = new Simulation(compoundWorld(compound, compound.world, seed, payloads));
  const [gate1, gate2] = named(sim, 'Gate');
  const [b] = named(sim, 'Driver B');
  const [c] = named(sim, 'Driver C');
  const [hook] = named(sim, 'Hook');
  const [key] = named(sim, 'Key package');
  const [pkg] = named(sim, 'Package');
  const [payload] = named(sim, 'Payload');
  return { sim, gate1, gate2, b, c, hook, key, pkg, payload };
}

test('Relay chain: the payload opens gate 1, B carries the key into gate 2, and that lets C take its package to the dock', () => {
  let all = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { sim, gate1, gate2, b, c, key, pkg, payload } = chain(seed, 1);
    const t = {};
    for (let i = 0; i < 4000 && !docked(sim, pkg); i++) {
      sim.step();
      if (t.opened === undefined && payload.mol !== null && payload.mol === gate1.mol) t.opened = sim.tick;
      if (t.bLeft === undefined && b.mol !== gate1.mol) t.bLeft = sim.tick;
      if (b.mol !== null && b.mol === key.mol) t.hooked = true;
      if (t.keyIn === undefined && key.mol !== null && key.mol === gate2.mol) t.keyIn = sim.tick;
      if (t.cLeft === undefined && c.mol !== gate2.mol) t.cLeft = sim.tick;
      if (pkg.mol !== null && pkg.mol === c.mol) t.byC = true;
    }
    if (!docked(sim, pkg)) continue;
    all++;
    assert.ok(t.opened !== undefined && t.bLeft >= t.opened, `seed ${seed}: B left only once the payload was in gate 1`);
    assert.ok(t.hooked, `seed ${seed}: B took the hook with the key on it`);
    assert.ok(t.keyIn !== undefined && t.cLeft >= t.keyIn, `seed ${seed}: C left only once the key was in gate 2`);
    assert.ok(t.byC, `seed ${seed}: C carried the package`);
    for (let i = 0; i < 500; i++) sim.step();
    assert.ok(docked(sim, pkg), `seed ${seed}: the package stays docked`);
    assert.equal(key.mol, gate2.mol, `seed ${seed}: and the key stays in gate 2`);
  }
  assert.ok(all >= 19, `${all} of 20 went all the way`);
});

test('Relay chain: the key lets go right over the hole, and B and the hook can’t take it back', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const { sim, gate2, b, hook, key } = chain(seed, 1);
    let hooked = false;
    for (let i = 0; i < 3000 && !(hooked && key.mol !== hook.mol); i++) {
      sim.step();
      if (b.mol !== null && b.mol === key.mol) hooked = true;
    }
    assert.ok(hooked && key.mol !== hook.mol, `seed ${seed}: the key let go of the hook`);
    // It lets go 3 cells straight above gate 2, and may already have taken its first step down into the hole.
    assert.equal(key.x, gate2.x, `seed ${seed}: straight over gate 2`);
    assert.ok([gate2.y - 3, gate2.y - 2].includes(key.y), `seed ${seed}: over the hole, not ${gate2.y - key.y} above the gate`);
    assert.equal(b.mol, hook.mol, `seed ${seed}: B is still on the hook`);
    assert.equal(hasRoom(b), false, `seed ${seed}: B has no room for another bond`);
    const { bondCost, growthGap } = sim.config.globals;
    assert.ok(bondEnergy(hook.energy, key.energy, bondCost, growthGap) > 0, 'the hook bonding the key again would cost energy, which a protein’s world never has');
  }
});

test('Relay chain: with no payload neither gate opens and nothing is delivered', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const { sim, gate1, gate2, b, c, hook, key, pkg } = chain(seed, 0);
    const start = [hook.cell, key.cell];
    for (let i = 0; i < 3000; i++) {
      sim.step();
      assert.equal(b.mol, gate1.mol, `seed ${seed}: B left gate 1 at tick ${sim.tick}`);
      assert.equal(c.mol, gate2.mol, `seed ${seed}: C left gate 2 at tick ${sim.tick}`);
    }
    assert.deepEqual([hook.cell, key.cell], start, `seed ${seed}: the hook and its key haven’t moved`);
    assert.ok(!docked(sim, pkg), `seed ${seed}: nothing docked`);
  }
});
