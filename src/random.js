import { TRAITS, TRAIT_BY_KEY, MAX_PATTERN, MAX_COUNT, MATRIX_CLASSES, QUIET_WALK, classColor, makeClass, radiusFor } from './config.js';

// Random values for everything: traits drawn evenly across their full spec ranges, except that Growth_Prob can be
// held below `fastestGrowth`, since it decides how soon a map full of seeds fills up. Under energy rules a pattern lists
// different sides, RandomWalk stays low so that charges are what decide where things go, and Energy_level stays away
// from 0: a level near 0 costs next to nothing to create and is too close to 0 to ever connect, so it would flood the map.
// With hand-set matrices RandomWalk keeps to the range they were made for.
const MATRIX_WALK = [0.5, 1];
const SMALLEST_LEVEL = 1;
// Random levels up to 10 rarely add up to much closer to 0 than this, and a molecule only reaches the macro movement
// by getting within Neutral range of 0. Spawning random classes under energy rules raises it this far.
export const RANDOM_NEUTRAL_RANGE = 2;
const awayFromZero = (level, max) => Number(((level < 0 ? -1 : 1) * (SMALLEST_LEVEL + (Math.abs(level) / max) * (max - SMALLEST_LEVEL))).toFixed(2));

export function randomPattern(rng, differentSides = false) {
  const length = 1 + rng.int(MAX_PATTERN);
  if (differentSides) return rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, length);
  return Array.from({ length }, () => 1 + rng.int(8));
}

export function randomTraits(rng, { fastestGrowth = 1, energyRules = false } = {}) {
  const t = {};
  for (const def of TRAITS) {
    if (def.random === false) continue;
    t[def.key] = def.int
      ? def.min + rng.int(def.max - def.min + 1)
      : Number((def.min + rng.next() * (def.max - def.min)).toFixed(2));
  }
  t.growthProb = Number((t.growthProb * fastestGrowth).toFixed(3));
  const [walkFrom, walkTo] = energyRules ? [0, QUIET_WALK] : MATRIX_WALK;
  t.randomWalk = Number((walkFrom + t.randomWalk * (walkTo - walkFrom)).toFixed(2));
  if (energyRules) t.energy = awayFromZero(t.energy, TRAIT_BY_KEY.energy.max);
  t.growthPattern = randomPattern(rng, energyRules);
  return t;
}

// `seeds` random spots on the map, each holding `size` particles of a class. With `ownValues` every seed rolls its own
// values and joins the class closest to it in Energy_level, so a class's color still says roughly what charge it is.
export function randomSeeds(classes, rng, { seeds, size, ownValues = false, fastestGrowth = 1, energyRules = false }) {
  return Array.from({ length: seeds }, () => {
    const traits = ownValues ? randomTraits(rng, { fastestGrowth, energyRules }) : null;
    const k = traits ? closestClass(classes, traits.energy) : rng.int(classes.length);
    const site = { x: rng.next(), y: rng.next(), radius: radiusFor(size), count: size };
    return { k, site: traits ? { ...site, traits } : site };
  });
}

function closestClass(classes, energy) {
  let best = 0;
  classes.forEach((c, k) => {
    if (Math.abs(c.traits.energy - energy) < Math.abs(classes[best].traits.energy - energy)) best = k;
  });
  return best;
}

// `n` classes with random values and random rules between them. World settings are left to the caller.
// `area` is the number of cells on the map. With `seeds` above 0 everything starts at that many random spots;
// at 0 each class is scattered over the whole map, filling about 6% of it between them.
export function randomSetup(n, rng, { conditionChance = 0.3, seeds = 0, size = 12, ownValues = false, fastestGrowth = 1, energyRules = false, area = 30000 } = {}) {
  const across = n > MATRIX_CLASSES ? 0 : n;
  const square = (cell) => Array.from({ length: across }, () => Array.from({ length: across }, cell));
  const classes = Array.from({ length: n }, (_, k) => makeClass(
    `Class ${k + 1}`,
    classColor(k),
    randomTraits(rng, { fastestGrowth, energyRules }),
    seeds > 0 ? 0 : Math.min(MAX_COUNT, Math.round((area * 0.06 * (0.5 + rng.next())) / n)),
  ));
  for (const { k, site } of randomSeeds(classes, rng, { seeds, size, ownValues, fastestGrowth, energyRules })) classes[k].sites.push(site);
  return {
    preset: 'random',
    classes,
    tendency: square(() => Number((rng.next() * 2 - 1).toFixed(2))),
    growth: square(() => (rng.next() < conditionChance ? 1 : 0)),
    death: square(() => (rng.next() < conditionChance ? 1 : 0)),
  };
}
