import { TRAITS, MAX_PATTERN, clamp } from './config.js';

// Growth and death under hand-set matrices. Under energy rules nothing grows, and death comes from the field alone.

// Latch growth and death conditions from what `p` touches right now. Matrix rows are the class doing the
// growing or dying, columns the class it touches. Once set, a latch stays until the event happens.
export function checkTriggers(sim, p) {
  const { world, config } = sim;
  const grow = config.growth[p.cls];
  const doom = config.death[p.cls];
  for (let s = p.cell * 8, end = s + 8; s < end; s++) {
    const c = world.nbr[s];
    if (c < 0) continue;
    const q = world.cells[c];
    if (q === null) continue;
    if (grow[q.cls]) p.primed = true;
    if (doom[q.cls]) p.doomed = true;
  }
}

// One edit to a pattern, returned as a new array: add a step, drop a step, or turn a step by one side.
export function mutatePattern(pattern, rng) {
  const next = pattern.slice();
  const roll = rng.next();
  if (roll < 0.25 && next.length < MAX_PATTERN) {
    next.splice(rng.int(next.length + 1), 0, 1 + rng.int(8));
  } else if (roll < 0.5 && next.length > 1) {
    next.splice(rng.int(next.length), 1);
  } else {
    const i = rng.int(next.length);
    next[i] = ((next[i] - 1 + (rng.next() < 0.5 ? 7 : 1)) % 8) + 1;
  }
  return next;
}

// A grown child's values. Its numbers are an exact copy with probability Variance, otherwise each is nudged.
// Its pattern changes with probability Pattern_Mutation, and it continues from the step after its parent's.
export function inheritTraits(p, rng, strength) {
  const t = {};
  for (const def of TRAITS) t[def.key] = p[def.key];
  if (strength > 0 && rng.next() >= p.variance) {
    for (const def of TRAITS) {
      if (def.random === false) continue;
      const v = t[def.key];
      if (def.int) {
        if (rng.next() < strength) t[def.key] = clamp(v + (rng.next() < 0.5 ? -1 : 1), def.min, def.max);
      } else {
        t[def.key] = clamp(v + rng.gaussian() * strength * 0.2 * (def.max - def.min), def.min, def.max);
      }
    }
  }
  t.growthPattern = rng.next() < p.patternMutation ? mutatePattern(p.pattern, rng) : p.pattern;
  t.step = (p.step + 1) % t.growthPattern.length;
  return t;
}

// Grow a child toward the particle's current pattern step. Returns the child, or null if that side is blocked,
// in which case the particle stays primed and tries the same step again.
export function tryGrow(sim, p) {
  const { world, rng, config } = sim;
  const cell = world.nbr[p.cell * 8 + p.pattern[p.step] - 1];
  if (cell < 0 || world.cells[cell] !== null || sim.full) return null;
  const traits = inheritTraits(p, rng, config.globals.mutation);
  if (!world.canPlace(cell, traits, null)) return null;
  p.primed = false;
  const child = world.add(p.cls, traits, cell, sim.tick);
  sim.events.growths++;
  sim.contact(child);
  return child;
}
