import { normalizeConfig, makeClass } from '../src/config.js';
import { Simulation } from '../src/sim.js';
import { tryDock } from '../src/bonds.js';

// A small, quiet world: no energy events, diffusion, decay, tendencies or mutation unless a test turns them on.
export function makeSim({ classes, globals = {}, tendency, growth, death, seed = 7, rules }) {
  const config = normalizeConfig({
    seed,
    rules,
    globals: {
      width: 30, height: 30, wrap: true, energyProb: 0, diffusion: 0, decay: 0,
      senseRadius: 0, mutation: 0, spread: 0, trickleOn: false, spawnBuffer: 0, crushLayer: 0, fusionLayer: 0, pressurePush: 0, ...globals,
    },
    classes: classes.map((c, i) => makeClass(`C${i}`, undefined, { randomWalk: 0.8, ...c.traits }, c.count ?? 0, c.sites ?? [])),
    tendency,
    growth,
    death,
  });
  return new Simulation(config);
}

// Put a particle of class `cls` at (x, y), optionally with trait overrides.
export function place(sim, cls, x, y, overrides = {}) {
  const traits = { ...sim.config.classes[cls].traits, ...overrides };
  return sim.world.add(cls, traits, sim.world.index(x, y), sim.tick);
}

// Move a placed particle to (x, y) the way a walk does, connecting if it can. Returns true if it bonded.
export function arrive(sim, p, x, y) {
  sim.world.move(p, sim.world.index(x, y));
  return tryDock(sim, p);
}

// Shortest signed offset between two coordinates on a wrapped axis of length `size`.
export function wrapDelta(d, size) {
  const m = ((d % size) + size) % size;
  return m > size / 2 ? m - size : m;
}

export function distance(a, b, w, h) {
  return Math.hypot(wrapDelta(b.x - a.x, w), wrapDelta(b.y - a.y, h));
}

export const fieldTotal = (field) => field.reduce((s, v) => s + v, 0);
