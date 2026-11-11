import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPOUNDS, compoundById, compoundWorld, layoutOf } from '../src/compounds.js';
import { PROTEINS } from '../src/proteins.js';
import { Simulation } from '../src/sim.js';
import { makeSim } from './helpers.js';

// A protein in its own world, optionally with some settings changed.
function own(id, seed = 1, globals = {}, value = undefined) {
  const compound = compoundById(id);
  const config = compoundWorld(compound, compound.world, seed, value ?? compound.input?.def);
  config.globals = { ...config.globals, ...globals };
  return new Simulation(config);
}
const nameOf = (sim, p) => sim.config.classes[p.cls].name;
const named = (sim, name) => sim.world.particles.filter((p) => nameOf(sim, p) === name);
const onDock = (sim) => sim.world.particles.filter((p) => ['Parcel', 'Shot', 'Package'].includes(nameOf(sim, p))
  && p.mol !== null && p.mol.members.some((m) => nameOf(sim, m) === 'Dock')).length;
// Run until `want` are on the dock, or `ticks` pass. True if they got there.
function deliver(sim, want, ticks) {
  for (let i = 0; i < ticks && onDock(sim) < want; i++) sim.step();
  return onDock(sim) >= want;
}
const run = (sim, ticks) => {
  for (let i = 0; i < ticks; i++) sim.step();
};
// Is every carrier back to just its grip and tail?
const carriersEmpty = (sim) => named(sim, 'Grip').every((g) => g.mol !== null && g.mol.members.length === 2 && nameOf(sim, g.mol.members[1]) === 'Tail');

test('proteins come first, and each is laid out for its own world and its preview', () => {
  assert.deepEqual(COMPOUNDS.slice(0, PROTEINS.length).map((c) => c.id), PROTEINS.map((p) => p.id));
  for (const protein of PROTEINS) {
    assert.equal(protein.kind, 'protein');
    assert.ok(protein.blurb && protein.math, protein.id);
    const { parts } = layoutOf(protein);
    // All but the Replicator carry something to a dock.
    if (protein.id !== 'replicator') assert.ok(parts.some((p) => protein.classes[p.c].name === 'Dock'), `${protein.id} has a dock`);
  }
});

test('Courier: carries its parcel across to the dock, bonds it on, and leaves empty, every time', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const sim = own('courier', seed);
    const [parcel] = named(sim, 'Parcel');
    const startX = parcel.x;
    assert.ok(deliver(sim, 1, 1500), `seed ${seed}`);
    assert.ok(parcel.x - startX >= 25, `it came ${parcel.x - startX} cells`);
    run(sim, 600);
    assert.equal(onDock(sim), 1, 'and it stays there');
    assert.ok(carriersEmpty(sim), 'the carrier is whole and empty');
  }
});

test('Courier: the parcel only lets go at the dock', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const sim = own('courier', seed);
    const [parcel] = named(sim, 'Parcel');
    const dockX = Math.min(...named(sim, 'Dock').map((d) => d.x));
    let carried = false;
    for (let i = 0; i < 1500 && onDock(sim) === 0; i++) {
      sim.step();
      const now = parcel.mol !== null && parcel.mol.members.some((m) => nameOf(sim, m) === 'Grip');
      if (carried && !now) assert.ok(dockX - parcel.x <= 6, `let go ${dockX - parcel.x} cells from the dock on seed ${seed}`);
      carried = now;
    }
  }
});

test('Delivery crew: four couriers fill four sockets', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const sim = own('crew', seed);
    assert.ok(deliver(sim, 4, 2000), `seed ${seed}: ${onDock(sim)} delivered`);
    run(sim, 300);
    assert.equal(onDock(sim), 4);
    assert.ok(carriersEmpty(sim));
  }
});

test('Retriever: goes out from the dock and fetches the parcels from all three posts', () => {
  let all = 0;
  let parcels = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const sim = own('retriever', seed);
    const posts = named(sim, 'Post');
    assert.ok(posts.every((p) => p.bonds.length === 1), 'a post is full already, so it can’t bond its parcel');
    if (deliver(sim, 3, 6000)) all++;
    parcels += onDock(sim);
  }
  assert.ok(all >= 9, `${all} of 10 fetched all three`);
  assert.ok(parcels >= 29, `${parcels} of 30 parcels`);
});

test('Slingshot: the shot flies in a straight line and lands on the dock', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const sim = own('slingshot', seed);
    const [shot] = named(sim, 'Shot');
    const row = shot.y;
    for (let i = 0; i < 200 && onDock(sim) === 0; i++) {
      sim.step();
      if (onDock(sim) === 0) assert.equal(shot.y, row, 'it never strays from its row');
    }
    assert.equal(onDock(sim), 1, `seed ${seed}`);
  }
});

test('Steam cannon: pressure from the cold blows the shot out of the barrel, every time', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const sim = own('steam', seed);
    const [shot] = named(sim, 'Shot');
    const x = shot.x;
    run(sim, 12);
    assert.ok(shot.x > x, `seed ${seed}: pushed forward`);
    assert.ok(deliver(sim, 1, 200), `seed ${seed}`);
    assert.ok(sim.pressure.highest > 0);
  }
  // With no push, nothing chooses its way, and it goes back into the barrel as often as out of it.
  let backward = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const sim = own('steam', seed, { pressurePush: 0 });
    const [shot] = named(sim, 'Shot');
    const x = shot.x;
    run(sim, 12);
    if (shot.x < x) backward++;
  }
  assert.ok(backward >= 4 && backward <= 16, `${backward} of 20 went backward`);
});

test('Lock and key: with no key, the parcel stays locked however long Courier B waits', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const sim = own('lock', seed, {}, 0);
    const [parcel] = named(sim, 'Parcel');
    const [lock] = named(sim, 'Lock');
    const [grip] = named(sim, 'Grip B');
    let closest = Infinity;
    for (let i = 0; i < 3000; i++) {
      sim.step();
      assert.ok(parcel.mol !== null && parcel.mol === lock.mol, `seed ${seed}: let go at tick ${sim.tick}`);
      closest = Math.min(closest, Math.hypot(grip.x - parcel.x, grip.y - parcel.y));
    }
    assert.ok(closest <= 3, `Courier B came within ${closest.toFixed(1)} cells and still couldn’t take it`);
  }
});

test('Lock and key: the key goes into the slot, the Lock lets go, and Courier B delivers the parcel', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const sim = own('lock', seed);
    const [parcel] = named(sim, 'Parcel');
    const [lock] = named(sim, 'Lock');
    const [key] = named(sim, 'Key');
    run(sim, 100);
    assert.ok(key.mol !== null && key.mol === lock.mol, `seed ${seed}: the key is in the slot`);
    assert.ok(deliver(sim, 1, 1500), `seed ${seed}: delivered`);
    assert.ok(parcel.mol.members.some((m) => nameOf(sim, m) === 'Grip B') === false);
    run(sim, 300);
    assert.equal(key.mol, lock.mol, 'the key stays in the Lock');
    assert.equal(lock.mol.members.length, 2, 'and nothing else bonds there');
  }
});

test('Garage and decoy: the same key goes into both, but only the garage lets its driver go, and the package arrives', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const sim = own('garage', seed);
    const [driverA, driverB] = named(sim, 'Driver');
    const [garage] = named(sim, 'Garage');
    const [decoy] = named(sim, 'Decoy');
    const keys = named(sim, 'Key');
    assert.equal(keys.length, 2);
    run(sim, 30);
    assert.ok(keys.some((k) => k.mol !== null && k.mol === garage.mol), `seed ${seed}: a key is in the garage`);
    assert.ok(keys.some((k) => k.mol !== null && k.mol === decoy.mol), `seed ${seed}: a key is in the decoy`);
    assert.notEqual(driverA.mol, garage.mol, `seed ${seed}: the garage let its driver go`);
    for (let i = 0; i < 1500 && onDock(sim) === 0; i++) {
      sim.step();
      assert.equal(driverB.mol, decoy.mol, `seed ${seed}: the decoy let go at tick ${sim.tick}`);
    }
    assert.equal(onDock(sim), 1, `seed ${seed}: the package was delivered`);
    run(sim, 500);
    assert.equal(driverB.mol, decoy.mol, 'and the decoy still has its driver');
  }
});

test('Garage and decoy: with no keys, both drivers stay parked', () => {
  for (let seed = 1; seed <= 3; seed++) {
    const sim = own('garage', seed, {}, 0);
    const [driverA, driverB] = named(sim, 'Driver');
    const [garage] = named(sim, 'Garage');
    const [decoy] = named(sim, 'Decoy');
    run(sim, 1500);
    assert.equal(driverA.mol, garage.mol);
    assert.equal(driverB.mol, decoy.mol);
    assert.equal(onDock(sim), 0);
  }
});

test('Bus: carries both parcels at once and drops both at the dock', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const sim = own('bus', seed);
    const [bus] = named(sim, 'Bus');
    const parcels = named(sim, 'Parcel');
    const bay = bus.x - 3;
    let loaded = false;
    for (let i = 0; i < 1000 && onDock(sim) < 2; i++) {
      sim.step();
      const held = parcels.filter((p) => p.mol !== null && p.mol === bus.mol).length;
      if (held === 2) loaded = true;
      // Until it has both, it stays by the bay.
      if (!loaded) assert.ok(bus.x <= bay + 4, `seed ${seed}: left the bay with ${held} at tick ${sim.tick}`);
      if (onDock(sim) > 0) assert.ok(loaded, `seed ${seed}: delivered before it had both`);
    }
    assert.ok(loaded, `seed ${seed}: it carried both at once`);
    assert.equal(onDock(sim), 2, `seed ${seed}: both delivered`);
    run(sim, 300);
    assert.ok(bus.mol === null || !parcels.some((p) => p.mol === bus.mol), 'and the bus leaves empty');
  }
});

test('Freighter: the cargo of three crates arrives in one piece, and the driver leaves it there', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const sim = own('freighter', seed);
    const [driver] = named(sim, 'Driver');
    const crates = named(sim, 'Crate');
    const docked = () => crates.some((c) => c.mol !== null && c.mol.members.some((m) => nameOf(sim, m) === 'Dock'));
    for (let i = 0; i < 3000 && !docked(); i++) {
      sim.step();
      assert.ok(crates.every((c) => c.mol === crates[0].mol), `seed ${seed}: the cargo came apart at tick ${sim.tick}`);
    }
    assert.ok(docked(), `seed ${seed}: delivered`);
    run(sim, 300);
    assert.ok(crates.every((c) => c.mol === crates[0].mol), 'still in one piece');
    assert.ok(driver.mol === null || driver.mol !== crates[0].mol, 'and the driver has gone');
    assert.ok(Math.abs(crates[0].mol.net) <= sim.config.globals.neutralBand, 'cargo and dock add up to about 0');
  }
});

test('in a pair, only the second member may leave', () => {
  const pairWith = (hostStay, guestStay) => {
    const sim = makeSim({
      rules: 'energy',
      classes: [
        { traits: { energy: 3, frisk: 0, stayProb: hostStay, growthPattern: [3] } },
        { traits: { energy: -3, frisk: 0, stayProb: guestStay, growthPattern: [7] } },
        { traits: { energy: -3, frisk: 0, stayProb: 1, growthPattern: [1] } },
      ],
      globals: { width: 30, height: 30, neutralBand: 0.5, senseRadius: 6, disagreement: 0.5 },
    });
    const host = sim.world.add(0, sim.config.classes[0].traits, sim.world.index(15, 15));
    const guest = sim.world.add(1, sim.config.classes[1].traits, sim.world.index(16, 15));
    sim.world.addBond(host, guest, 0);
    // Something that pulls the host one way and pushes the guest the other.
    sim.world.add(2, sim.config.classes[2].traits, sim.world.index(13, 15));
    run(sim, 300);
    return host.mol !== null;
  };
  assert.equal(pairWith(0, 1), true, 'the host would leave, but it isn’t the one that decides');
  assert.equal(pairWith(1, 0), false, 'the guest leaves');
});

test('a courier spawned into a bigger world with wrapping edges still delivers', () => {
  const sim = makeSim({ rules: 'energy', classes: [{ traits: { energy: 0, frisk: 0 } }], globals: { width: 120, height: 80, neutralBand: 0.5, wrap: true } });
  assert.ok(sim.placeCompound('courier', 60, 40) > 0);
  assert.ok(deliver(sim, 1, 2000));
});

test('proteins share the classes they have in common', () => {
  const sim = makeSim({ rules: 'energy', classes: [{ traits: { energy: 0, frisk: 0 } }], globals: { width: 200, height: 160, neutralBand: 0.5 } });
  sim.placeCompound('courier', 50, 50);
  const after = sim.config.classes.length;
  sim.placeCompound('crew', 140, 100);
  assert.equal(sim.config.classes.length, after, 'the crew uses the same five');
  sim.placeCompound('retriever', 60, 120);
  assert.equal(sim.config.classes.length, after + 1, 'and the retriever adds only its post');

  const big = makeSim({ rules: 'energy', classes: [{ traits: { energy: 0, frisk: 0 } }], globals: { width: 300, height: 200, neutralBand: 0.5 } });
  big.placeCompound('lock', 50, 50);
  const lockClasses = big.config.classes.length;
  big.placeCompound('garage', 150, 100);
  const garageOnly = ['Post', 'Driver', 'Package', 'Garage charge', 'Garage', 'Decoy'];
  assert.equal(big.config.classes.length, lockClasses + garageOnly.length, 'the garage reuses the Lock’s key and walls, and brings the rest');
  big.placeCompound('freighter', 250, 150);
  assert.equal(big.config.classes.length, lockClasses + garageOnly.length + 1, 'and the freighter uses the garage’s driver, adding only its crates');
});
