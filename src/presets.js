import { makeClass, radiusFor, classColor, CLASS_COLORS } from './config.js';
import { createRng } from './rng.js';

const site = (x, y, count) => ({ x, y, count, radius: radiusFor(count) });
// Charge pairs match the energy overlay: warm for positive, cool for negative.
const [COOL, WARM] = CLASS_COLORS;

// A class's share of many small seeds, at spots that stay the same from run to run of a preset.
function scatterSeeds(key, seeds, size) {
  const rng = createRng(key);
  return Array.from({ length: seeds }, () => site(rng.next(), rng.next(), size));
}

// Energy-rule worlds share these settings. A steady trickle of energy creates particles, and they connect in the
// shapes their classes ask for. Neutral molecules creep together at large scale, and deep in the clumps they make,
// molecules are crushed and particles fuse, past the Stable limit if they can. The thresholds leave a new particle able
// to survive its own burst, and the cold those bursts leave builds pressure that pushes back against the creep.
export const FIELD = {
  energyProb: 0.5, spawnBuffer: 20, killThreshold: -30, burnThreshold: 10, spread: 1, diffusion: 0, decay: 0.002, trickleOn: true, trickle: 75,
  senseRadius: 6, neutralBand: 0.5, growthGap: 5, bondCost: 6, bondRelease: 0.25, disagreement: 1, maxMolecule: 16,
  chargePull: 1, seekFocus: 0.9, macroSpeed: 0.1, macroRange: 32, crushLayer: 28, fusionLayer: 52, layerReach: 4, fusionBurst: 10,
  heaviestLevel: 160, stableLimit: 10, instability: 0.05, pressureLine: -10, pressureSpread: 0.2, pressureFade: 0.005, pressurePush: 0.03,
};
const WALKER = { frisk: 1, randomWalk: 0.1, stayProb: 0.5, deathProb: 0.5 };
// The worlds tuned on hand-set matrices keep the map they were tuned on.
const SMALL_MAP = { width: 200, height: 150 };

// Starting setups, each showing off part of the rules. Tuned by running them headless (tools/run.mjs).
// Colors are left out so classes take the palette in its fixed order.
export const PRESETS = [
  {
    id: 'stars',
    name: 'Stars',
    group: 'energy',
    // A few dense patches of charge, so the whole chain shows within moments: pairs form and creep together, the middle
    // of each patch is crushed into free particles, those fuse into ±6 and ±12, with bursts on the energy overlay and
    // pressure pushing out from the middle.
    build: () => {
      const rng = createRng(61);
      const spots = Array.from({ length: 10 }, (_, i) => ({ x: (i % 5 + 0.2 + rng.next() * 0.6) / 5, y: (Math.floor(i / 5) + 0.2 + rng.next() * 0.6) / 2 }));
      const patch = (s) => ({ ...s, count: 700, radius: 27 });
      return {
        preset: 'stars',
        rules: 'energy',
        seed: 61,
        globals: { ...FIELD, trickle: 35 },
        classes: [
          makeClass('Plus', WARM, { ...WALKER, energy: 3, growthPattern: [1, 5] }, 0, spots.map(patch)),
          makeClass('Minus', COOL, { ...WALKER, energy: -3, growthPattern: [7, 3] }, 0, spots.map(patch)),
        ],
      };
    },
  },
  {
    id: 'pairs',
    name: 'Charge pairs',
    group: 'energy',
    // Plus connects above and below it, Minus to its left and right. A pair adds up to 0, so it stops connecting and
    // drifts toward other pairs, while the trickle keeps creating more of both. Two sides each leave room for a costly
    // bond between matching levels to still find its way to 0 with two more partners.
    build: () => ({
      preset: 'pairs',
      rules: 'energy',
      seed: 11,
      globals: FIELD,
      classes: [
        makeClass('Plus', WARM, { ...WALKER, energy: 3, growthPattern: [1, 5] }, 0, scatterSeeds(101, 300, 10)),
        makeClass('Minus', COOL, { ...WALKER, energy: -3, growthPattern: [7, 3] }, 0, scatterSeeds(102, 300, 10)),
      ],
    }),
  },
  {
    id: 'shapes',
    name: 'Shaped molecules',
    group: 'energy',
    // A Hub holds four Links, one on each diagonal, which is what it takes to cancel it: a small X. With a high Spawn
    // buffer every class gets about as many drops, so Hubs only come from their seeds and it's Links that keep appearing.
    // A bond between two Links costs more than the heat a spawn leaves behind, or they would use each other up.
    build: () => ({
      preset: 'shapes',
      rules: 'energy',
      seed: 23,
      globals: { ...FIELD, trickle: 25, bondCost: 30, crushLayer: 16, fusionLayer: 44 },
      classes: [
        { ...makeClass('Hub', WARM, { ...WALKER, energy: 4, growthPattern: [2, 4, 6, 8] }, 0, scatterSeeds(201, 300, 10)), spawns: false },
        makeClass('Link', COOL, { ...WALKER, energy: -1, growthPattern: [2] }, 0, scatterSeeds(202, 400, 10)),
      ],
    }),
  },
  {
    id: 'costly',
    name: 'Costly bonds',
    group: 'energy',
    // Similar levels only connect where the grid can pay, and those bonds hand a lot back when they break. 3 and 4 of
    // each sign keep the charges balanced, so chains of costly bonds can still add up to 0 and join the clumps. Long
    // molecules leave fewer of them in a layer, so the layers here are thinner.
    build: () => ({
      preset: 'costly',
      rules: 'energy',
      seed: 37,
      globals: { ...FIELD, trickle: 45, crushLayer: 20, fusionLayer: 44 },
      classes: [
        makeClass('Plus 3', WARM, { ...WALKER, energy: 3, growthPattern: [3, 7] }, 0, scatterSeeds(301, 200, 10)),
        makeClass('Plus 4', CLASS_COLORS[3], { ...WALKER, energy: 4, growthPattern: [1, 5] }, 0, scatterSeeds(302, 200, 10)),
        makeClass('Minus 3', COOL, { ...WALKER, energy: -3, growthPattern: [3, 7] }, 0, scatterSeeds(303, 200, 10)),
        makeClass('Minus 4', CLASS_COLORS[2], { ...WALKER, energy: -4, growthPattern: [1, 5] }, 0, scatterSeeds(304, 200, 10)),
      ],
    }),
  },
  {
    id: 'gap',
    name: 'Wide gap (1 and 10)',
    group: 'energy',
    // Both classes are positive, so nothing ever cancels. They bond for free only because 1 and 10 are far enough apart.
    // Ones cost a tenth as much so there are ten times as many, and a Ten holds six of them, in a star.
    build: () => ({
      preset: 'gap',
      rules: 'energy',
      seed: 41,
      globals: { ...FIELD, burnThreshold: 16, trickle: 50 },
      classes: [
        makeClass('One', COOL, { ...WALKER, energy: 1, growthPattern: [3] }, 0, scatterSeeds(401, 300, 10)),
        makeClass('Ten', WARM, { ...WALKER, energy: 10, growthPattern: [1, 2, 4, 5, 6, 8] }, 0, scatterSeeds(402, 300, 10)),
      ],
    }),
  },
  {
    id: 'many',
    name: 'Many classes',
    group: 'energy',
    // Thirty-two classes across the range of levels, each with its own shape, all from the same energy. So many levels
    // rarely add up to exactly 0, so the Neutral range is wider, and the smallest level is past it so that it can still
    // connect. Partners of the same level are rare, so few fuse.
    build: () => {
      const rng = createRng(53);
      return {
        preset: 'many',
        rules: 'energy',
        seed: 53,
        globals: { ...FIELD, burnThreshold: 16, neutralBand: 2, trickle: 60, crushLayer: 16, fusionLayer: 44 },
        classes: Array.from({ length: 32 }, (_, k) => {
          const energy = Number(((k < 16 ? 1 : -1) * (2.2 + (k % 16) * 0.52)).toFixed(1));
          const pattern = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 1 + rng.int(4));
          return makeClass(`${energy > 0 ? '+' : '−'}${Math.abs(energy)}`, classColor(k), { ...WALKER, energy, growthPattern: pattern }, 0, scatterSeeds(600 + k, 12, 8));
        }),
      };
    },
  },
  {
    id: 'blank',
    name: 'Two charges',
    group: 'energy',
    // Two classes scattered evenly rather than seeded, to start your own from.
    build: () => ({
      preset: 'blank',
      rules: 'energy',
      seed: 1,
      globals: FIELD,
      classes: [
        makeClass('Alpha', WARM, { ...WALKER, energy: 3, growthPattern: [1, 5] }, 3000),
        makeClass('Beta', COOL, { ...WALKER, energy: -3, growthPattern: [7, 3] }, 3000),
      ],
    }),
  },
  {
    id: 'predator',
    group: 'matrix',
    name: 'Predator & prey',
    // Prey multiply on contact and flee; predators chase them. Eaten prey leave energy that condenses into
    // new predators, and predators that crowd each other die and condense back into prey.
    build: () => ({
      preset: 'predator',
      seed: 20261104,
      globals: {
        ...SMALL_MAP, energyProb: 0.5, spawnThreshold: 0.5, killThreshold: -3, spread: 0,
        diffusion: 0, decay: 0.001, senseRadius: 6, mutation: 0.1,
      },
      classes: [
        makeClass('Prey', undefined, {
          frisk: 1, randomWalk: 0.7, connect: 4, stayProb: 0.2, growthProb: 0.04,
          growthPattern: [3], patternMutation: 0.05, deathProb: 0.5, energy: 1, variance: 0.9,
        }, 1200),
        makeClass('Predator', undefined, {
          frisk: 2, randomWalk: 0.55, connect: 3, stayProb: 0, growthProb: 0,
          growthPattern: [7], deathProb: 0.05, energy: 1.5, variance: 1,
        }, 150),
      ],
      tendency: [[0.3, -0.9], [0.9, -0.3]],
      growth: [[1, 0], [0, 0]],
      death: [[0, 1], [0, 1]],
    }),
  },
  {
    id: 'crystal',
    group: 'matrix',
    name: 'Crystal growth',
    // Dust that touches the crystal dies, and its energy (1.2) condenses back into crystal (cost 1.0)
    // in the same cell. Walkers freeze where they first touch, so the crystal grows branching arms.
    build: () => ({
      preset: 'crystal',
      seed: 7,
      globals: {
        ...SMALL_MAP, energyProb: 1, spawnThreshold: 0.1, killThreshold: -3, spread: 0,
        diffusion: 0, decay: 0, senseRadius: 0, mutation: 0,
      },
      classes: [
        makeClass('Crystal', undefined, {
          frisk: 0, randomWalk: 1, connect: 8, stayProb: 1, growthProb: 0,
          growthPattern: [1], deathProb: 0, energy: 1, variance: 1,
        }, 3),
        makeClass('Dust', undefined, {
          frisk: 1, randomWalk: 1, connect: 8, stayProb: 0, growthProb: 0,
          growthPattern: [1], deathProb: 1, energy: 1.2, variance: 1,
        }, 2400),
      ],
      tendency: [[0, 0], [0, 0]],
      growth: [[0, 0], [0, 0]],
      death: [[0, 0], [1, 0]],
    }),
  },
  {
    id: 'annihilation',
    group: 'matrix',
    name: 'Annihilation',
    // Matter and antimatter each grow strands among their own kind and destroy each other on contact.
    // Antimatter dies into negative energy, which turns nearby particles of either kind into energy.
    // Patterns mutate as they grow, so the strands change shape.
    build: () => ({
      preset: 'annihilation',
      seed: 99,
      globals: {
        ...SMALL_MAP, energyProb: 0.5, spawnThreshold: 0.5, killThreshold: -1, spread: 1,
        diffusion: 0.03, decay: 0.004, senseRadius: 5, mutation: 0,
      },
      classes: [
        makeClass('Matter', undefined, {
          frisk: 1, randomWalk: 0.8, connect: 4, stayProb: 0.3, growthProb: 0.05,
          growthPattern: [3, 2, 3, 4], patternMutation: 0.2, deathProb: 0.4, energy: 1.5, variance: 1,
        }, 2500),
        makeClass('Antimatter', undefined, {
          frisk: 1, randomWalk: 0.8, connect: 4, stayProb: 0.3, growthProb: 0.05,
          growthPattern: [7, 8, 7, 6], patternMutation: 0.2, deathProb: 0.4, energy: -3, variance: 1,
        }, 2500),
      ],
      tendency: [[0.2, -0.2], [-0.2, 0.2]],
      growth: [[1, 0], [0, 1]],
      death: [[0, 1], [1, 0]],
    }),
  },
  {
    id: 'vines',
    group: 'matrix',
    name: 'Pattern vines',
    // Spores of each vine wander until they touch their own kind, then grow a chain tracing their pattern.
    // Grazers eat the chains, and the energy left behind condenses into new spores and grazers.
    build: () => {
      const vine = (name, growthPattern) => makeClass(name, undefined, {
        frisk: 1, randomWalk: 1, connect: 3, stayProb: 0, growthProb: 0.5, growthPattern,
        patternMutation: 0.02, deathProb: 0.5, energy: 1, variance: 1,
      }, 350);
      return {
        preset: 'vines',
        seed: 31,
        globals: {
          ...SMALL_MAP, energyProb: 0.5, spawnThreshold: 0.5, killThreshold: -3, spread: 0,
          diffusion: 0, decay: 0.01, senseRadius: 6, mutation: 0,
        },
        classes: [
          vine('Staircase', [3, 5]),
          vine('Wave', [3, 2, 3, 3, 4, 3]),
          vine('Sawtooth', [2, 2, 2, 4, 4, 4]),
          makeClass('Grazer', undefined, {
            frisk: 2, randomWalk: 0.55, connect: 3, stayProb: 0, growthProb: 0,
            growthPattern: [1], deathProb: 0.05, energy: 1.5, variance: 1,
          }, 60),
        ],
        tendency: [[0, 0, 0, -0.5], [0, 0, 0, -0.5], [0, 0, 0, -0.5], [0.9, 0.9, 0.9, -0.3]],
        growth: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 0]],
        death: [[0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1]],
      };
    },
  },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id);
