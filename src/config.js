// Property ranges from the spec, config defaults, and validation for loaded settings.

// The 8 sides of a particle, numbered clockwise from the top. y grows downward.
export const SIDES = [
  { n: 1, name: 'N', dx: 0, dy: -1 },
  { n: 2, name: 'NE', dx: 1, dy: -1 },
  { n: 3, name: 'E', dx: 1, dy: 0 },
  { n: 4, name: 'SE', dx: 1, dy: 1 },
  { n: 5, name: 'S', dx: 0, dy: 1 },
  { n: 6, name: 'SW', dx: -1, dy: 1 },
  { n: 7, name: 'W', dx: -1, dy: 0 },
  { n: 8, name: 'NW', dx: -1, dy: -1 },
];
export const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

// A growth pattern is a list of sides, up to this long. Each generation takes the next step.
export const MAX_PATTERN = 6;

// Per-particle numbers. A class holds the defaults; each particle carries its own copy so grown children can mutate.
// The growth pattern is stored alongside these but handled separately, since it's a list.
export const TRAITS = [
  { key: 'frisk', label: 'frisk', min: 0, max: 5, step: 1, int: true,
    hint: 'Pixels it can move per tick, in any of the 8 directions. 0 never moves.' },
  { key: 'randomWalk', label: 'RandomWalk', min: 0, max: 1, step: 0.01,
    hint: 'Share of moves in a random direction. The rest follow its tendency and its last heading.' },
  { key: 'connect', label: 'Connect Amount', min: 0, max: 8, step: 1, int: true, rules: 'matrix',
    hint: 'Most neighbors allowed to touch it at once. 0 means nothing can touch it.' },
  { key: 'stayProb', label: 'ConnectRandomStayProb', min: 0, max: 1, step: 0.01,
    hint: 'Chance per tick it stays still while touching another particle.',
    energyHint: 'Chance it stays bonded when it disagrees with the rest of its molecule about where to go.' },
  { key: 'growthProb', label: 'Growth_Prob', min: 0, max: 1, step: 0.01, rules: 'matrix',
    hint: 'Chance per tick it grows once its growth condition is met.' },
  { key: 'patternMutation', label: 'Pattern_Mutation', min: 0, max: 1, step: 0.01, rules: 'matrix',
    hint: 'Chance a grown child’s pattern changes: one step turns, or a step is added or dropped.' },
  { key: 'startProb', label: 'Start_Prob', min: 0, max: 1, step: 0.01, rules: 'energy', random: false,
    hint: 'Chance it bonds with another free particle when they meet. At 0 it never starts a molecule itself, and only joins one that already exists.' },
  { key: 'deathProb', label: 'Death_Prob', min: 0, max: 1, step: 0.01,
    hint: 'Chance per tick it dies once its death condition is met.',
    energyHint: 'Chance per tick it dies while the energy on its cell is past the Kill or Burn threshold.' },
  { key: 'energy', label: 'Energy_level', min: -10, max: 10, step: 0.1, wide: 320,
    hint: 'Energy released into the grid when it dies. Also what it costs to spawn from energy.',
    energyHint: 'Its charge, which decides what it seeks and bonds with. A cell needs this much energy on top of the Spawn buffer, whichever the sign, to create one. Only this much is taken, and it gives that back when it dies. Only fusion goes past ±10.' },
  { key: 'variance', label: 'Variance', min: 0, max: 1, step: 0.01, rules: 'matrix',
    hint: 'Chance a grown child copies its parent’s numbers exactly. Otherwise they are nudged by Mutation strength. The pattern has its own Pattern_Mutation.' },
];
export const TRAIT_BY_KEY = Object.fromEntries(TRAITS.map((t) => [t.key, t]));

export const GLOBALS = [
  { key: 'neutralBand', label: 'Neutral range', min: 0, max: 5, step: 0.05, def: 0.5, group: 'charge',
    hint: 'A molecule stops connecting once its overall energy (the Energy_levels of everything bonded together) is within this much of 0. It then moves by Macro speed instead of by charge.' },
  { key: 'growthGap', label: 'Free gap', min: 0.5, max: 20, step: 0.1, def: 5, group: 'charge',
    hint: 'Levels of the same sign at least this far apart bond for free, like 1 and 10, and so do all opposite charges. Closer levels cost energy.' },
  { key: 'bondCost', label: 'Bond cost', min: 0, max: 30, step: 0.1, def: 6, group: 'charge',
    hint: 'The energy a bond takes from the grid when two levels match exactly. It falls to 0 at the Free gap. The bond stores it and gives it back when it breaks.' },
  { key: 'bondRelease', label: 'Minimal release', min: 0, max: 5, step: 0.05, def: 0.25, group: 'charge',
    hint: 'Energy every broken bond adds to the grid, on top of what it stored.' },
  { key: 'disagreement', label: 'Disagreement', min: 0, max: 2, step: 0.05, def: 1, group: 'charge',
    hint: 'How far a member’s pull must differ from the rest of its molecule’s before it may break away. Random walk doesn’t count. At 0 any difference will do; at 2 it has to pull exactly the opposite way at full strength.' },
  { key: 'maxMolecule', label: 'Largest molecule', min: 2, max: 64, step: 1, int: true, def: 16, group: 'charge',
    hint: 'A bond won’t form if it would make a molecule bigger than this.' },
  { key: 'divide', label: 'Divide when full', bool: true, def: false, group: 'charge',
    hint: 'A molecule that grows to the Largest molecule splits in two: the member in its middle lets go.' },
  { key: 'chargePull', label: 'Charge pull', min: 0, max: 1, step: 0.01, def: 1, group: 'charge',
    hint: 'How strongly charge steers the moves RandomWalk leaves free. 0 turns the pull off.' },
  { key: 'seekFocus', label: 'Seeking focus', min: 0, max: 1, step: 0.01, def: 0.9, group: 'charge',
    hint: 'How much RandomWalk drops when something it can connect with is within Sense radius, more the closer it is. 0 leaves RandomWalk as it is.' },
  { key: 'macroSpeed', label: 'Macro speed', min: 0, max: 1, step: 0.01, def: 0.1, group: 'charge',
    hint: 'Chance per tick a neutral molecule takes a step toward denser groups of molecules and particles.' },
  { key: 'macroRange', label: 'Macro range', min: 8, max: 128, step: 8, int: true, def: 32, group: 'charge',
    hint: 'How far neutral molecules feel those groups, in cells. Much farther than charges reach.' },
  { key: 'crushLayer', label: 'Crush layer (n)', min: 0, max: 200, step: 4, int: true, def: 28, group: 'charge',
    hint: 'A molecule breaks apart into free particles once this many molecules surround it within Layer reach, a quarter of them on each side. A free particle counts as one molecule. Nothing can bond while this deep in. 0 turns it off.' },
  { key: 'fusionLayer', label: 'Fusion layer (n1)', min: 0, max: 400, step: 4, int: true, def: 52, group: 'charge',
    hint: 'A free particle fuses with a free one touching it at the same level once this many particles surround it within Layer reach, a quarter of them on each side. The two become one with double the charge, as long as that stays within the Heaviest level. 0 turns it off.' },
  { key: 'layerReach', label: 'Layer reach', min: 1, max: 12, step: 1, int: true, def: 4, group: 'charge',
    hint: 'How far out, in cells, those layers are counted. A reach of 4 takes in 68 cells, and 6 takes in 136.' },
  { key: 'fusionBurst', label: 'Fusion burst', min: 0, max: 100, step: 1, def: 10, group: 'charge',
    hint: 'Energy of the opposite charge a fusion puts on the grid, per point of the new particle’s level. At 10, a new +6 leaves −60 around it and a new −6 leaves +60.' },
  { key: 'heaviestLevel', label: 'Heaviest level', min: 10, max: 320, step: 1, int: true, def: 160, group: 'overcharge',
    hint: 'The furthest from 0 that fusion can take a level. At 10, nothing goes past ±10.' },
  { key: 'stableLimit', label: 'Stable limit', min: 1, max: 100, step: 0.5, def: 10, group: 'overcharge',
    hint: 'A particle further from 0 than this can break back into the two it came from, unless something has steadied it. Its molecule steadies it by adding up to within this limit. The field steadies it with at least as much opposite charge on its cell as it has.' },
  { key: 'instability', label: 'Instability', min: 0, max: 1, step: 0.005, def: 0.05, group: 'overcharge',
    hint: 'Chance per tick that a particle past the Stable limit breaks in two, if nothing has steadied it and there’s a free cell within Layer reach. The energy of the burst it left when it fused comes back to the grid. 0 means it never breaks.' },
  { key: 'pressureLine', label: 'Pressure line', min: -60, max: -0.1, step: 0.1, def: -10, group: 'pressure',
    hint: 'Pressure builds wherever the energy on a cell is below this, faster the further below it is.' },
  { key: 'pressureSpread', label: 'Pressure spread', min: 0, max: 0.25, step: 0.005, def: 0.2, group: 'pressure',
    hint: 'How fast pressure flows outward across the map.' },
  { key: 'pressureFade', label: 'Pressure fade', min: 0, max: 0.05, step: 0.0005, def: 0.005, group: 'pressure',
    hint: 'Fraction of the pressure that fades each tick. At 0.005, half of it is gone in about 140 ticks.' },
  { key: 'pressurePush', label: 'Pressure push', min: 0, max: 1, step: 0.005, def: 0.03, group: 'pressure',
    hint: 'How hard particles and molecules are pushed from high pressure toward low. A neutral molecule stops where this push matches Macro speed. 0 means pressure doesn’t move anything.' },
  { key: 'energyProb', label: 'Energy_Prob', min: 0, max: 1, step: 0.01, def: 0.5, group: 'energy',
    hint: 'Chance per tick that a cell past a threshold spawns or destroys a particle.',
    energyHint: 'Chance per tick that a cell with the energy to create a class does so, or that a cell past the Kill or Burn threshold destroys the particle on it.' },
  { key: 'spawnBuffer', label: 'Spawn buffer', min: 0, max: 100, step: 1, def: 20, group: 'energy', rules: 'energy',
    hint: 'Energy a cell has to hold before anything can appear on it. On top of this it needs the size of a class’s Energy_level, and only that much is taken, so the buffer stays on the cell and fades.' },
  { key: 'trickleOn', label: 'Steady trickle', bool: true, def: true, group: 'energy', rules: 'energy',
    hint: 'Energy keeps landing on random cells, and the population climbs until the Particle limit. Off, it only comes from what you paint, bond breaks and deaths, so the population holds about steady.' },
  { key: 'trickle', label: 'Trickle amount', min: 0, max: 1000, step: 1, def: 100, group: 'energy', rules: 'energy',
    hint: 'Energy added per tick across the whole map, in drops just big enough to clear the Spawn buffer and create a class picked at random. Every class gets the same share of the energy. Most of each drop stays on the cell as heat, so the higher the buffer, the more this takes.' },
  { key: 'spawnThreshold', label: 'Spawn threshold', min: 0.1, max: 40, step: 0.1, def: 4, group: 'energy', rules: 'matrix',
    hint: 'An empty cell at or above this spawns a particle. The excess above it picks the class.' },
  { key: 'killThreshold', label: 'Kill threshold', min: -40, max: -0.1, step: 0.1, def: -3, group: 'energy',
    hint: 'A particle on a cell at or below this turns into energy.' },
  { key: 'burnThreshold', label: 'Burn threshold', min: 0.1, max: 60, step: 0.1, def: 20, group: 'energy', rules: 'energy',
    hint: 'A particle on a cell this far above the Spawn buffer turns into energy too. It counts from the buffer so that raising the buffer can’t burn new particles where they appear.' },
  { key: 'spread', label: 'Spread radius', min: 0, max: 6, step: 1, int: true, def: 2, group: 'energy',
    hint: 'Cells a death spreads its energy over. The death cell always gets the most.',
    energyHint: 'How far a death or a broken bond spreads its energy, and how far a new bond can reach for the energy it costs. The middle cell always gets the most.' },
  { key: 'diffusion', label: 'Diffusion', min: 0, max: 0.25, step: 0.005, def: 0.05, group: 'energy',
    hint: 'How fast energy flows to neighboring cells each tick.' },
  { key: 'decay', label: 'Decay', min: 0, max: 0.05, step: 0.0005, def: 0.002, group: 'energy',
    hint: 'Fraction of every cell’s energy that fades each tick.' },
  { key: 'senseRadius', label: 'Sense radius', min: 0, max: 12, step: 1, int: true, def: 6, group: 'motion',
    hint: 'How far away (in cells) tendencies reach. Closer particles pull or push harder.',
    energyHint: 'How far away, in cells, particles feel each other’s charge. Closer particles pull or push harder.' },
  { key: 'mutation', label: 'Mutation strength', min: 0, max: 1, step: 0.01, def: 0.1, group: 'motion', rules: 'matrix',
    hint: 'How far a non-identical child’s values drift from its parent’s.' },
  { key: 'width', label: 'Width', min: 20, max: 2000, step: 10, int: true, def: 800, group: 'grid',
    hint: 'Applies on Reset. Larger maps take longer per tick.' },
  { key: 'height', label: 'Height', min: 20, max: 1500, step: 10, int: true, def: 600, group: 'grid',
    hint: 'Applies on Reset.' },
  { key: 'maxParticles', label: 'Particle limit', min: 1000, max: 400000, step: 1000, int: true, def: 40000, group: 'grid',
    hint: 'Nothing new appears once this many particles are alive, until deaths make room. It keeps a runaway world from freezing the page.' },
  { key: 'wrap', label: 'Wrap edges', bool: true, def: true, group: 'grid',
    hint: 'Particles leaving one edge come back on the opposite one. Off means solid walls.' },
];
export const GLOBAL_BY_KEY = Object.fromEntries(GLOBALS.map((g) => [g.key, g]));

// Class colors in a fixed order, checked for colorblind separation against the dark chamber. Past these eight, classes
// get generated hues that can't all be told apart, so Color by Energy_level and the hover readout take over.
export const MAX_CLASSES = 64;
export const CLASS_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

// Hand-set matrices keep to the eight checked colors, and their tables grow with the square of the class count.
export const MATRIX_CLASSES = 8;
export const classLimit = (config) => (config.rules === 'energy' ? MAX_CLASSES : MATRIX_CLASSES);

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const part = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${part(0)}${part(8)}${part(4)}`;
}

// The color of the k-th class. Hues beyond the checked eight step around the wheel by the golden angle, so neighbors
// in the list differ as much as they can, at lightnesses that show up on the dark chamber.
export function classColor(k) {
  if (k < CLASS_COLORS.length) return CLASS_COLORS[k];
  const i = k - CLASS_COLORS.length;
  return hsl((i * 137.508 + 20) % 360, 0.6 + (i % 3) * 0.1, 0.5 + (i % 4) * 0.05);
}

export const DEFAULT_TRAITS = {
  frisk: 1, randomWalk: 0.1, connect: 4, stayProb: 0.3, startProb: 1, growthProb: 0.1,
  patternMutation: 0, deathProb: 0.1, energy: 4, variance: 1,
};
const DEFAULT_PATTERN = [3];

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function fit(def, value, fallback) {
  let v = Number(value);
  if (value === null || value === '' || !Number.isFinite(v)) v = fallback;
  v = clamp(v, def.min, def.max);
  return def.int ? Math.round(v) : v;
}

// With `wide` on, a level may go as far as fusion can take it.
export function clampTrait(key, value, wide = false) {
  const def = TRAIT_BY_KEY[key];
  return fit(wide && def.wide ? { ...def, min: -def.wide, max: def.wide } : def, value, DEFAULT_TRAITS[key]);
}

export function clampGlobal(key, value) {
  const def = GLOBAL_BY_KEY[key];
  return def.bool ? Boolean(value) : fit(def, value, def.def);
}

// A clean pattern from anything: 1 to MAX_PATTERN sides, each 1..8. A lone number becomes a one-step pattern.
// Patterns are never changed in place, so particles of a lineage can share one array.
export function normalizePattern(raw) {
  const sides = (Array.isArray(raw) ? raw : [raw])
    .map(Number)
    .filter(Number.isFinite)
    .map((n) => clamp(Math.round(n), 1, 8))
    .slice(0, MAX_PATTERN);
  return sides.length > 0 ? sides : [...DEFAULT_PATTERN];
}

function normalizeTraits(raw, wide = false) {
  return {
    ...Object.fromEntries(TRAITS.map((t) => [t.key, clampTrait(t.key, raw?.[t.key], wide)])),
    // Settings saved before patterns existed have a single growthDir.
    growthPattern: normalizePattern(raw?.growthPattern ?? raw?.growthDir),
  };
}

export function makeClass(name, color, traits = {}, count = 0, sites = []) {
  return { name, color, count, sites, spawns: true, traits: { ...DEFAULT_TRAITS, growthPattern: [...DEFAULT_PATTERN], ...traits } };
}

// A seed location: `count` particles placed within `radius` cells of a point. The point is stored as a fraction
// of the map, so it stays in the same place on the map when the map is resized. A seed can carry its own `traits`;
// otherwise its particles start with their class's.
export const MAX_SITES = 1000;
export const MAX_SITE_RADIUS = 300;
export const MAX_COUNT = 50000;

export const fractionOf = (cell, size) => clamp((cell + 0.5) / size, 0, 1);
export const cellOf = (fraction, size) => Math.min(size - 1, Math.floor(fraction * size));

// Room for a site's particles without crowding: about one cell in ten is filled.
export function radiusFor(count) {
  return count <= 1 ? 0 : Math.min(MAX_SITE_RADIUS, Math.ceil(Math.sqrt(count / (Math.PI * 0.1))));
}

export function normalizeSites(raw, wide = false) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_SITES).map((s) => ({
    x: clamp(Number(s?.x) || 0, 0, 1),
    y: clamp(Number(s?.y) || 0, 0, 1),
    radius: clamp(Math.round(Number(s?.radius) || 0), 0, MAX_SITE_RADIUS),
    count: clamp(Math.round(Number(s?.count) || 0), 0, MAX_COUNT),
    ...(s?.traits ? { traits: normalizeTraits(s.traits, wide) } : {}),
  }));
}

export function defaultGlobals() {
  return Object.fromEntries(GLOBALS.map((g) => [g.key, g.def]));
}

// Settings from before version 5 couldn't have a RandomWalk below 0.5, however much they might have wanted to, so under
// energy rules their noise is brought down to what's usual now.
const SETTINGS_VERSION = 5;
export const QUIET_WALK = 0.1;
function quieten(traits) {
  traits.randomWalk = Math.min(traits.randomWalk, QUIET_WALK);
}

// Build a clean config from anything: fills gaps, clamps every value, and sizes the matrices to the class count.
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Settings must be a JSON object.');
  if (!Array.isArray(raw.classes) || raw.classes.length === 0) {
    throw new Error('Settings need a "classes" list with at least one class.');
  }
  const rules = raw.rules === 'energy' ? 'energy' : 'matrix';
  const classes = raw.classes.slice(0, classLimit({ rules })).map((c, i) => ({
    name: (typeof c?.name === 'string' && c.name.trim().slice(0, 24)) || `Class ${i + 1}`,
    color: /^#[0-9a-f]{6}$/i.test(c?.color) ? c.color.toLowerCase() : classColor(i),
    count: clamp(Math.round(Number(c?.count) || 0), 0, MAX_COUNT),
    sites: normalizeSites(c?.sites, rules === 'energy'),
    // Under energy rules a class can be left to seeds, brushes and fusion.
    spawns: c?.spawns !== false,
    traits: normalizeTraits(c?.traits, rules === 'energy'),
  }));
  if (rules === 'energy' && Number(raw.version) < SETTINGS_VERSION) {
    for (const c of classes) {
      quieten(c.traits);
      for (const site of c.sites) if (site.traits) quieten(site.traits);
    }
  }
  // Past what hand-set matrices can take, the matrices aren't kept at all.
  const n = classes.length > MATRIX_CLASSES ? 0 : classes.length;
  const square = (m, cell) =>
    Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => cell(m?.[a]?.[b])));
  const globals = defaultGlobals();
  for (const g of GLOBALS) {
    if (raw.globals && g.key in raw.globals) globals[g.key] = clampGlobal(g.key, raw.globals[g.key]);
  }
  const seed = Number(raw.seed);
  return {
    version: SETTINGS_VERSION,
    preset: typeof raw.preset === 'string' ? raw.preset : 'custom',
    // 'energy' derives tendency, bonds, death and creation from Energy_level; 'matrix' uses the hand-set matrices and
    // Connect Amount. Settings saved before energy rules existed have no `rules` and stay on matrices.
    rules,
    seed: Number.isFinite(seed) ? Math.abs(Math.round(seed)) % 4294967296 : 1,
    individuals: Boolean(raw.individuals),
    globals,
    classes,
    // Compounds placed on the map, which Reset brings back.
    stamps: (Array.isArray(raw.stamps) ? raw.stamps : []).slice(0, MAX_SITES).filter((s) => typeof s?.id === 'string').map((s) => ({
      id: s.id, x: clamp(Number(s.x) || 0, 0, 1), y: clamp(Number(s.y) || 0, 0, 1), ...(Number.isFinite(s.value) ? { value: s.value } : {}),
    })),
    tendency: square(raw.tendency, (v) => clamp(Number(v) || 0, -1, 1)),
    growth: square(raw.growth, (v) => (v ? 1 : 0)),
    death: square(raw.death, (v) => (v ? 1 : 0)),
  };
}

export const MATRICES = ['tendency', 'growth', 'death'];

// Blank matrices sized to the classes, if they aren't already.
export function ensureMatrices(config) {
  const n = config.classes.length;
  for (const name of MATRICES) {
    if (config[name].length !== n) config[name] = Array.from({ length: n }, () => new Array(n).fill(0));
  }
}

// Append a class; with `copyFrom` its matrix rows and columns copy that class's.
export function addClassTo(config, cls, copyFrom = -1) {
  const n = config.classes.length;
  config.classes.push(cls);
  // Past what hand-set matrices can take, the matrices are let go.
  if (config.classes.length > MATRIX_CLASSES) {
    for (const name of MATRICES) config[name] = [];
    return;
  }
  if (config.tendency.length !== n) ensureMatrices({ ...config, classes: config.classes.slice(0, n) });
  for (const name of MATRICES) {
    const m = config[name];
    for (const row of m) row.push(copyFrom >= 0 ? row[copyFrom] : 0);
    m.push(copyFrom >= 0 ? m[copyFrom].slice() : new Array(n + 1).fill(0));
  }
}

export function removeClassFrom(config, k) {
  config.classes.splice(k, 1);
  for (const name of MATRICES) {
    const m = config[name];
    if (m.length === 0) continue;
    m.splice(k, 1);
    for (const row of m) row.splice(k, 1);
  }
}
