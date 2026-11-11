import { createRng } from './rng.js';
import { FIELD } from './presets.js';
import { QUIET_WALK } from './config.js';
import { PROTEINS } from './proteins.js';
import { PROCESSES } from './processes.js';

// Compounds: small arrangements of classes, found by trying things in the simulator, that do something worth watching
// under the energy rules. Each lists its classes and where its particles, bonds and energy go, relative to where it's put.

const N = 1;
const E = 3;
const SE = 4;
const S = 5;
const W = 7;
const NW = 8;

// Energy put under a part is worked out from the world's own thresholds, so that a compound means the same in any world.
// A spark sets a part alight at once. Hot stays past the burn line for a long while. Under-burn sits just below it.
const SPARK_OVER = 5;
const HOT_OVER = 300;
export const UNDER_BURN = 0.5;

// What all their own worlds share: the usual rules, with nothing arriving from outside.
export const COMPOUND_WORLD = { ...FIELD, trickleOn: false, trickle: 0, bondRelease: 0 };

const disc = (r) => {
  const out = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (Math.hypot(x, y) <= r + 0.5) out.push([x, y]);
  return out;
};

// `n` different cells within `r` of the middle, the same ones every time.
function scatter(seed, n, r, keepOut = () => false) {
  const rng = createRng(seed);
  const taken = new Set();
  const out = [];
  for (let tries = 0; out.length < n && tries < n * 200; tries++) {
    const angle = rng.next() * Math.PI * 2;
    const dist = Math.sqrt(rng.next()) * r;
    const x = Math.round(Math.cos(angle) * dist);
    const y = Math.round(Math.sin(angle) * dist);
    const key = `${x},${y}`;
    if (taken.has(key) || keepOut(x, y)) continue;
    taken.add(key);
    out.push([x, y]);
  }
  return out;
}

// A closed square loop of neighboring cells, in order around.
function loop(r) {
  const out = [];
  for (let x = -r; x < r; x++) out.push([x, -r]);
  for (let y = -r; y < r; y++) out.push([r, y]);
  for (let x = r; x > -r; x--) out.push([x, r]);
  for (let y = r; y > -r; y--) out.push([-r, y]);
  return out;
}

// A spiral of neighboring cells, from its outer end inward.
function spiral(turns, gap) {
  const seen = new Set();
  const out = [];
  for (let t = 0; t < turns * Math.PI * 2; t += 0.02) {
    const r = 4 + (gap * t) / (Math.PI * 2);
    const x = Math.round(Math.cos(t) * r);
    const y = Math.round(Math.sin(t) * r);
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const last = out.at(-1);
    if (!last || (Math.abs(last[0] - x) <= 1 && Math.abs(last[1] - y) <= 1)) out.push([x, y]);
  }
  return out.reverse();
}

function littleSun() {
  const parts = disc(5).map(([x, y]) => ({ c: 'rock', x, y }));
  const bonds = [];
  const taken = new Set();
  for (const [x, y] of scatter(5, 170, 28, (cx, cy) => Math.hypot(cx, cy) < 9)) {
    if (taken.has(`${x},${y}`) || taken.has(`${x + 1},${y}`)) continue;
    taken.add(`${x},${y}`);
    taken.add(`${x + 1},${y}`);
    bonds.push([parts.length, parts.length + 1]);
    parts.push({ c: 'plus', x, y }, { c: 'minus', x: x + 1, y });
  }
  return { parts, bonds };
}

// One tall pile of energy, and nothing else.
const PILE = 32000;
const mandala = () => ({ parts: [], heat: [{ x: 0, y: 0, amount: PILE }] });

function wildfire() {
  const parts = [];
  const heat = [];
  for (let y = -22; y <= 22; y++) {
    for (let x = -30; x <= 30; x++) {
      parts.push({ c: 'tree', x, y });
      heat.push({ x, y, kind: 'underBurn' });
    }
  }
  heat.push({ x: 0, y: 0, kind: 'spark' });
  return { parts, heat };
}

function spiralFuse() {
  const path = spiral(3, 4);
  return {
    parts: path.map(([x, y]) => ({ c: 'cord', x, y })),
    bonds: path.slice(1).map((_, i) => [i, i + 1, 1]),
    heat: [{ x: path[0][0], y: path[0][1], kind: 'spark' }],
  };
}

function bomb() {
  const r = 8;
  const up = 12;
  const parts = [];
  const bonds = [];
  const at = new Map();
  for (const [x, y] of disc(r)) {
    at.set(`${x},${y}`, parts.length);
    parts.push({ c: (x + y) & 1 ? 'shrapnel' : 'powder', x, y: y + up });
  }
  // A broken bond's energy lands on its guest. With shrapnel always the guest, it lands on all sides of the powder alike.
  for (const [x, y] of disc(r)) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const other = at.get(`${x + dx},${y + dy}`);
      if (other === undefined) continue;
      const here = at.get(`${x},${y}`);
      bonds.push((x + y) & 1 ? [other, here, 2] : [here, other, 2]);
    }
  }
  // The fuse wiggles up from the top of the body, and burns down it.
  const cord = Array.from({ length: 16 }, (_, i) => [Math.round(Math.sin(i / 2.5) * 2), -r - 1 - i + up]);
  const first = parts.length;
  for (const [x, y] of cord) parts.push({ c: 'cord', x, y });
  for (let i = cord.length - 1; i > 0; i--) bonds.push([first + i, first + i - 1, 1]);
  bonds.push([first, at.get(`0,${-r}`), 1]);
  return { parts, bonds, heat: [{ x: cord.at(-1)[0], y: cord.at(-1)[1], kind: 'spark' }] };
}

function popcorn() {
  const r = 3;
  const parts = [];
  const bonds = [];
  const heat = [];
  const shell = loop(r);
  for (let k = 0; k < 6; k++) {
    const cx = (k % 3 - 1) * 15;
    const cy = (Math.floor(k / 3) * 2 - 1) * 8;
    const base = parts.length;
    shell.forEach(([x, y], i) => parts.push({ c: i === 0 ? 'wick' : 'hull', x: cx + x, y: cy + y }));
    shell.forEach((_, i) => bonds.push([base + i, base + (i + 1) % shell.length, 1]));
    for (let y = -r + 1; y < r; y++) for (let x = -r + 1; x < r; x++) parts.push({ c: 'corn', x: cx + x, y: cy + y });
    heat.push({ x: cx + shell[0][0], y: cy + shell[0][1], kind: 'hot' });
  }
  return { parts, bonds, heat };
}

// With gaps between them so that none is touching a partner to fuse with.
function halfLife() {
  const parts = [];
  const heat = [];
  for (let y = -20; y <= 20; y += 2) {
    for (let x = -24; x <= 24; x += 2) {
      parts.push({ c: 'atom', x, y });
      heat.push({ x, y, kind: 'hot' });
    }
  }
  return { parts, heat };
}

function binaryCounter(ones) {
  const inner = 2;
  const wall = 3;
  const parts = [];
  for (let y = -inner - wall; y <= inner + wall; y++) {
    for (let x = -inner - wall; x <= inner + wall; x++) {
      if (Math.abs(x) > inner || Math.abs(y) > inner) parts.push({ c: 'wall', x, y });
    }
  }
  const cells = [];
  for (let y = -inner; y <= inner; y++) for (let x = -inner; x <= inner; x++) cells.push([x, y]);
  createRng(15).shuffle(cells);
  for (const [x, y] of cells.slice(0, ones)) parts.push({ c: 'one', x, y });
  return { parts };
}

function speedDating() {
  const w = 14;
  const h = 10;
  const parts = [];
  for (let y = -h - 1; y <= h + 1; y++) {
    for (let x = -w - 1; x <= w + 1; x++) {
      if (Math.abs(x) > w || Math.abs(y) > h) parts.push({ c: 'wall', x, y });
    }
  }
  const spots = [];
  for (let y = -h + 1; y < h; y += 2) for (let x = -w + 1; x < w; x += 2) spots.push([x, y]);
  createRng(11).shuffle(spots);
  [1, 2, 3, 4, 5, 6].forEach((L, i) => {
    parts.push({ c: `plus${L}`, x: spots[i * 2][0], y: spots[i * 2][1] }, { c: `minus${L}`, x: spots[i * 2 + 1][0], y: spots[i * 2 + 1][1] });
  });
  return { parts };
}

function polymer() {
  const parts = [];
  const bonds = [];
  const taken = new Set();
  for (const [x, y] of scatter(21, 90, 26)) {
    if (parts.length >= 100 || taken.has(`${x},${y}`) || taken.has(`${x + 1},${y}`)) continue;
    taken.add(`${x},${y}`);
    taken.add(`${x + 1},${y}`);
    bonds.push([parts.length, parts.length + 1]);
    parts.push({ c: 'head', x, y }, { c: 'tail', x: x + 1, y });
  }
  return { parts, bonds };
}

function hamsterBall() {
  const ring = loop(4);
  return {
    parts: [...ring.map(([x, y]) => ({ c: 'ball', x, y })), { c: 'pet', x: 0, y: 0 }],
    bonds: ring.map((_, i) => [i, (i + 1) % ring.length]),
  };
}

function pocketStar() {
  return { parts: disc(10).map(([x, y]) => ({ c: (x + y) & 1 ? 'plus' : 'minus', x, y })) };
}

const lovers = (color) => ({ color, frisk: 1, stayProb: 0, deathProb: 0 });
const DATE_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];

const MIXTURES = [
  {
    id: 'sun',
    name: 'Little sun',
    blurb: 'Neutral pairs fall onto a heavy rock and stick where they land, growing rays.',
    math: 'Pairs arrive from outside, so the tips of the rays catch them before the gaps between do. Every bump gets bigger, and the shape branches.',
    world: { width: 90, height: 68 },
    preview: { width: 80, height: 60, ticks: 1400, speed: 120 },
    speed: 120,
    rules: { macroSpeed: 0.3, crushLayer: 0, fusionLayer: 0 },
    classes: {
      rock: { name: 'Rock', color: '#59636c', energy: 0, frisk: 0, pattern: [N] },
      plus: { name: 'Rain +', color: '#d95926', energy: 3, pattern: [E], stayProb: 1 },
      minus: { name: 'Rain −', color: '#3987e5', energy: -3, pattern: [W], stayProb: 1 },
    },
    build: littleSun,
  },
  {
    id: 'mandala',
    name: 'Sandpile mandala',
    blurb: 'One tower of energy topples outward and settles into an intricate pattern, the same one every time.',
    math: 'A cell with enough energy grows a particle, which burns and hands the energy to the cells around it, which may set them off in turn. That’s an abelian sandpile: the order things topple in can’t change the result, so no seed or speed gives a different mandala.',
    world: { width: 64, height: 48 },
    preview: { width: 56, height: 42, ticks: 60000, speed: 2400, hold: 6000 },
    speed: 5000,
    needsRules: true,
    rules: { decay: 0, diffusion: 0, spread: 1, spawnBuffer: 19, burnThreshold: 1.5, energyProb: 1, neutralBand: 5, crushLayer: 0, fusionLayer: 0 },
    classes: {
      grain: { name: 'Grain', color: '#199e70', energy: 5, frisk: 0, deathProb: 1, spawns: true, pattern: [N] },
    },
    build: mandala,
  },
  {
    id: 'wildfire',
    name: 'Wildfire',
    blurb: 'One spark, then a carpet that burns, regrows and breathes in and out, until it ends after exactly 33,136 burns, every time.',
    math: 'Each tree sits just under the burn line, and one burning next door pushes it over. Burnt ground only regrows once its neighbors have burnt and handed the energy back. It’s a sandpile as well: the route is random, but the final pattern and the number of burns never change. Turn on the Steady trickle for lightning that keeps it going.',
    world: { width: 80, height: 60 },
    preview: { width: 70, height: 52, ticks: 1500, speed: 45 },
    speed: 60,
    needsRules: true,
    rules: { decay: 0, diffusion: 0, spread: 1, spawnBuffer: 19, burnThreshold: 1.5, energyProb: 0.1, neutralBand: 5, crushLayer: 0, fusionLayer: 0 },
    classes: {
      tree: { name: 'Tree', color: '#199e70', energy: 5, frisk: 0, deathProb: 1, spawns: true, pattern: [N] },
    },
    build: wildfire,
  },
  {
    id: 'fuse',
    name: 'Spiral fuse',
    blurb: 'A flame runs along a spiral and leaves a glowing trail.',
    math: 'Each bond stores just enough energy to set the next link alight when it breaks. A link waits 1 ÷ (Energy_Prob × Death_Prob) ticks on average, so 5 here.',
    world: { width: 70, height: 52 },
    preview: { width: 56, height: 42, ticks: 1500, speed: 60 },
    speed: 60,
    classes: {
      cord: { name: 'Fuse cord', color: '#c98500', energy: 1, frisk: 0, deathProb: 0.4, pattern: [E, W] },
    },
    build: spiralFuse,
  },
  {
    id: 'bomb',
    name: 'Cartoon bomb',
    blurb: 'The fuse burns down, then the whole thing goes up and shrapnel flies out.',
    math: 'Powder and shrapnel alternate like a checkerboard. Powder burns and its bonds let go, which is what sets off the powder next to it. Shrapnel has no charge, so nothing holds it back afterward.',
    world: { width: 80, height: 60 },
    preview: { width: 70, height: 52, ticks: 700, speed: 50 },
    speed: 60,
    classes: {
      powder: { name: 'Powder', color: '#59636c', energy: 1, frisk: 0, deathProb: 1, pattern: [N, E, S, W] },
      shrapnel: { name: 'Shrapnel', color: '#c2cbd3', energy: 0, frisk: 2, pattern: [N] },
      cord: { name: 'Fuse cord', color: '#c98500', energy: 1, frisk: 0, deathProb: 0.4, pattern: [E, W] },
    },
    build: bomb,
  },
  {
    id: 'popcorn',
    name: 'Popcorn',
    blurb: 'Six kernels pop at random times, and a kernel that has waited long is no closer to popping.',
    math: 'Each wick has a fixed chance per tick of catching: 1 in 400 here. That makes waiting memoryless, so you can’t tell from looking which one goes next. The heat under a wick fades, and about 1 kernel in 20 goes cold before it catches and never pops, like the duds in a real bag.',
    world: { width: 80, height: 60 },
    preview: { width: 70, height: 52, ticks: 1300, speed: 90 },
    speed: 90,
    classes: {
      hull: { name: 'Hull', color: '#e8d9a0', energy: 1, frisk: 0, deathProb: 1, pattern: [N, S] },
      wick: { name: 'Wick', color: '#d55181', energy: 1, frisk: 0, deathProb: 0.005, pattern: [N, S] },
      corn: { name: 'Corn', color: '#c98500', energy: 0, frisk: 3, pattern: [N] },
    },
    build: popcorn,
  },
  {
    id: 'halflife',
    name: 'Half-life',
    blurb: 'Half of what’s left goes every 138 ticks, however many there are. See it on the Stats chart.',
    math: 'All of them sit past the burn line, each with the same small chance per tick of going: Energy_Prob × Death_Prob = 0.5%. Half-life = ln 2 ÷ −ln(1 − 0.005) ≈ 138 ticks.',
    world: { width: 70, height: 52 },
    preview: { width: 56, height: 42, ticks: 900, speed: 60 },
    speed: 60,
    classes: {
      atom: { name: 'Atom', color: '#199e70', energy: 6, frisk: 0, deathProb: 0.01, pattern: [N] },
    },
    build: halfLife,
  },
  {
    id: 'binary',
    name: 'Binary counter',
    blurb: 'Seal any number of +1s in a chamber and they end up as that number written in binary.',
    math: 'Only equal levels fuse, and they double. That’s carrying in binary: two 1s make a 2, two 2s make a 4. What’s left is one particle for each digit that’s on. These particles push each other away and only meet by wandering, so unlike almost everything else here they keep a RandomWalk of 1.',
    input: { label: 'How many +1s', min: 1, max: 15, def: 15, describe: (n) => `${n} = ${[8, 4, 2, 1].filter((b) => n & b).join(' + ')}` },
    world: { width: 34, height: 26 },
    preview: { width: 28, height: 21, ticks: 1100, speed: 40 },
    speed: 30,
    needsRules: true,
    rules: { layerReach: 3, crushLayer: 8, fusionLayer: 12, fusionBurst: 0, growthGap: 20, diffusion: 0, spread: 1 },
    classes: {
      wall: { name: 'Chamber wall', color: '#3a4650', energy: 0, frisk: 0, pattern: [N] },
      one: { name: 'One', color: '#c2cbd3', energy: 1, randomWalk: 1, pattern: [N] },
      two: { name: 'Two', color: '#3987e5', energy: 2, randomWalk: 1, pattern: [N] },
      four: { name: 'Four', color: '#199e70', energy: 4, randomWalk: 1, pattern: [N] },
      eight: { name: 'Eight', color: '#d95926', energy: 8, randomWalk: 1, pattern: [N] },
    },
    build: binaryCounter,
  },
  {
    id: 'dating',
    name: 'Speed dating',
    blurb: 'Six couples start out mismatched and keep splitting up until each has its exact opposite.',
    math: 'A particle’s pull toward an opposite is the smaller level ÷ the larger, so 1 only for a perfect match. A wrong couple gets pulled apart when someone better comes close. A perfect couple adds up to 0, so nothing is drawn to it any more, and in the end there’s nobody left to split them up.',
    world: { width: 50, height: 38 },
    preview: { width: 42, height: 31, ticks: 5000, speed: 240 },
    speed: 240,
    needsRules: true,
    // Only opposites may bond here: a +1 and a +6 at the usual Free gap could, and would never split up. Couples settle
    // down quickly with so little noise, so it takes less of a difference for someone better to split them.
    rules: { growthGap: 5.5, disagreement: 0.5 },
    classes: {
      wall: { name: 'Chamber wall', color: '#3a4650', energy: 0, frisk: 0, pattern: [N] },
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((L, i) => [
        [`plus${L}`, { ...lovers(DATE_COLORS[i]), name: `Date +${L}`, energy: L, pattern: [S] }],
        [`minus${L}`, { ...lovers(DATE_COLORS[i]), name: `Date −${L}`, energy: -L, pattern: [N] }],
      ])),
    },
    build: speedDating,
  },
  {
    id: 'polymer',
    name: 'Polymer',
    blurb: 'Short rods snap together head to tail into long straight lines.',
    math: 'Each rod is a +3 and a −2, so each adds +1 overall. The total can only climb and never reaches 0, so nothing tells a chain to stop until the rods run out or it hits the Largest molecule.',
    world: { width: 80, height: 60 },
    preview: { width: 70, height: 52, ticks: 1800, speed: 120 },
    speed: 120,
    rules: { maxMolecule: 64 },
    classes: {
      head: { name: 'Rod head', color: '#3987e5', energy: -2, stayProb: 1, pattern: [W, E] },
      tail: { name: 'Rod tail', color: '#d95926', energy: 3, stayProb: 1, pattern: [E, W] },
    },
    build: polymer,
  },
  {
    id: 'hamster',
    name: 'Hamster ball',
    blurb: 'A pet shut inside a rigid ring. They push each other away, and the ring wanders off with it.',
    math: 'Pet and ring are both +3, so they push apart, but the ring is one rigid molecule and the pet can’t get out. Bigger molecules move less often: a ring of 32 only gets 1 turn in 32.',
    world: { width: 56, height: 42 },
    preview: { width: 48, height: 36, ticks: 3000, speed: 120 },
    speed: 120,
    classes: {
      ball: { name: 'Ball', color: '#86b6ef', energy: 3, stayProb: 1, pattern: [N, S] },
      pet: { name: 'Pet', color: '#d95926', energy: 3, pattern: [N] },
    },
    build: hamsterBall,
  },
  {
    id: 'star',
    name: 'Pocket star',
    blurb: 'A ball of charges that pairs up, crushes its own middle and starts fusing.',
    math: 'The same chain as the Stars preset, packed tight enough to start at once: pairs, crushed particles in the middle, then fusion into ±6 with a burst of the opposite charge. Some go on to ±12, which soon break back, and the cold those bursts leave builds pressure that pushes the star outward.',
    world: { width: 70, height: 52 },
    preview: { width: 56, height: 42, ticks: 900, speed: 60 },
    speed: 60,
    classes: {
      plus: { name: 'Star +', color: '#d95926', energy: 3, stayProb: 0.5, deathProb: 0.5, pattern: [N, S] },
      minus: { name: 'Star −', color: '#3987e5', energy: -3, stayProb: 0.5, deathProb: 0.5, pattern: [E, W] },
    },
    build: pocketStar,
  },
];

// Proteins first: they're machines. Then processes, made of proteins, and the rest are things to watch.
export const COMPOUNDS = [...PROTEINS, ...PROCESSES, ...MIXTURES];
export const compoundById = (id) => COMPOUNDS.find((c) => c.id === id);

// Its parts, worked out once for each value of its input, if it has one.
const layouts = new Map();
export function layoutOf(compound, value = compound.input?.def) {
  const key = `${compound.id}/${value}`;
  if (!layouts.has(key)) {
    const { parts, bonds = [], heat = [] } = compound.build(value);
    layouts.set(key, { parts, bonds, heat, reach: Math.max(0, ...parts.map((p) => Math.ceil(Math.hypot(p.x, p.y)))) });
  }
  return layouts.get(key);
}

const toTraits = (spec) => ({
  frisk: spec.frisk ?? 1, randomWalk: spec.randomWalk ?? QUIET_WALK, connect: 8, stayProb: spec.stayProb ?? 1, startProb: spec.startProb ?? 1,
  growthProb: 0, patternMutation: 0,
  deathProb: spec.deathProb ?? 0, energy: spec.energy, variance: 1, growthPattern: spec.pattern,
});

// A world with nothing in it but this compound, in the middle, under the rules it was found with.
export function compoundWorld(compound, map = compound.world, seed = 1, value = compound.input?.def) {
  return {
    rules: 'energy',
    preset: 'custom',
    seed,
    globals: { ...COMPOUND_WORLD, ...compound.rules, ...map },
    classes: Object.values(compound.classes).map((spec) => ({
      name: spec.name, color: spec.color, count: 0, sites: [], spawns: spec.spawns ?? false, traits: toTraits(spec),
    })),
    stamps: [{ id: compound.id, x: 0.5, y: 0.5, value }],
  };
}

// Put a compound on the map around a cell, clearing whatever is there, and bring in any classes this world doesn't have.
// Returns how many particles went in, or -1 if there isn't room for its classes.
export function placeCompound(sim, compound, cx, cy, value) {
  const { world, field, config } = sim;
  const { parts, bonds, heat } = layoutOf(compound, value);
  const needed = {};
  for (const [key, spec] of Object.entries(compound.classes)) {
    let k = config.classes.findIndex((c) => c.name === spec.name && c.traits.energy === spec.energy);
    if (k < 0) {
      k = sim.addClass(-1, toTraits(spec));
      if (k < 0) return -1;
      config.classes[k].name = spec.name;
      config.classes[k].color = spec.color;
      config.classes[k].spawns = spec.spawns ?? false;
    }
    needed[key] = k;
  }
  const cells = parts.map((p) => world.index(cx + p.x, cy + p.y));
  for (const c of cells) {
    const q = c >= 0 ? world.cells[c] : null;
    if (q !== null) {
      for (const bond of q.bonds.slice()) world.removeBond(bond);
      world.remove(q);
    }
  }
  const placed = parts.map((p, i) => {
    if (cells[i] < 0 || world.cells[cells[i]] !== null || sim.full) return null;
    return world.add(needed[p.c], config.classes[needed[p.c]].traits, cells[i], sim.tick);
  });
  const { spawnBuffer, burnThreshold } = config.globals;
  const burnLine = spawnBuffer + burnThreshold;
  // What a bond has to store for the cell it gives its energy to, when it breaks, to go past the burn line.
  const centerShare = sim.kernel.find((k) => k.dx === 0 && k.dy === 0).w;
  const toIgnite = (burnLine + SPARK_OVER) / centerShare;
  for (const [host, guest, charge = 0] of bonds) {
    if (placed[host] && placed[guest]) world.addBond(placed[host], placed[guest], charge * toIgnite);
  }
  for (const h of heat) {
    const c = world.index(cx + h.x, cy + h.y);
    if (c < 0) continue;
    if (h.amount) field[c] += h.amount;
    else if (h.kind === 'spark') field[c] = Math.max(field[c], burnLine + SPARK_OVER);
    else if (h.kind === 'hot') field[c] = Math.max(field[c], burnLine + HOT_OVER);
    else field[c] = burnLine - UNDER_BURN;
  }
  return placed.filter(Boolean).length;
}
