// A headless bench for protein designs in Frisk Field. Run it from the project folder: it imports the app's own src/.
//
//   node <skill>/scripts/bench.mjs demo                         a Courier written as a scene, over 10 seeds
//   node <skill>/scripts/bench.mjs protein <id> [seeds] [ticks]  a shipped protein or process, in its own world
//   node <skill>/scripts/bench.mjs catalog [seeds]               every shipped protein and process
//   node <skill>/scripts/bench.mjs pictures <id> <out.png> [seed] [ticks]
//   node <skill>/scripts/bench.mjs fingerprints [before.txt]     every preset and compound; with a file, what changed
//
// Or import it from a bench file of your own (keep those in the scratchpad):
//
//   import { scene, trial, pictures, deviations, E, W } from '<skill>/scripts/bench.mjs';
//   const spec = { world: { width: 64, height: 44, wrap: false }, rules: {}, classes: { ... }, build: () => ({ parts, bonds }) };
//   console.log(trial(spec, { seeds: 20, ticks: 2000, check: (sim) => ... }));
//   console.log(deviations(scene(spec, 1), someParticle.mol));   who would leave that molecule, and by how much
//
// A spec's classes are keyed by a short name. Each gives `energy` and `pattern`, and may give `name`, `color`, `frisk`
// (default 1), `randomWalk` (0.1), `stayProb` (1), `startProb` (1) and `deathProb` (0): the same defaults as the app's
// compounds. `build(seed)` returns parts as { c, x, y } relative to the middle of the world, bonds as [host index,
// guest index], and heat as { x, y, amount } added to the field. The bond's first index is the host, and in a pair the
// guest (the second) is the one that decides whether the pair splits.
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = process.cwd();
const load = async (file) => {
  try {
    return await import(`${root}/src/${file}`);
  } catch (err) {
    throw new Error(`Couldn't load src/${file}. Run this from the project folder. (${err.message})`);
  }
};
export const { Simulation } = await load('sim.js');
const { COMPOUND_WORLD, COMPOUNDS, compoundById, compoundWorld } = await load('compounds.js');
const { QUIET_WALK } = await load('config.js');
const { PRESETS, presetById } = await load('presets.js');
const { sensePull } = await load('movement.js');

export const N = 1, NE = 2, E = 3, SE = 4, S = 5, SW = 6, W = 7, NW = 8;

const toTraits = (spec) => ({
  frisk: spec.frisk ?? 1, randomWalk: spec.randomWalk ?? QUIET_WALK, connect: 8, stayProb: spec.stayProb ?? 1,
  startProb: spec.startProb ?? 1, growthProb: 0, patternMutation: 0, deathProb: spec.deathProb ?? 0,
  energy: spec.energy, variance: 1, growthPattern: spec.pattern,
});

// A world holding just this scene, under the compound rules (no trickle, no release on breaking) plus the spec's own.
export function scene(spec, seed = 1, rules = {}) {
  const keys = Object.keys(spec.classes);
  const sim = new Simulation({
    rules: 'energy', seed,
    globals: { ...COMPOUND_WORLD, ...spec.rules, ...rules, ...spec.world },
    classes: keys.map((k) => ({
      name: spec.classes[k].name ?? k, color: spec.classes[k].color ?? '#888888', count: 0, sites: [],
      spawns: spec.classes[k].spawns ?? false, traits: toTraits(spec.classes[k]),
    })),
  });
  const { parts, bonds = [], heat = [] } = spec.build(seed);
  const { world, field } = sim;
  const cx = Math.floor(world.width / 2);
  const cy = Math.floor(world.height / 2);
  const placed = parts.map((p, i) => {
    const k = keys.indexOf(p.c);
    if (k < 0) throw new Error(`part ${i} has class "${p.c}", which the spec doesn't list`);
    const cell = world.index(cx + p.x, cy + p.y);
    if (cell < 0) throw new Error(`part ${i} (${p.c}) at ${p.x},${p.y} is off the map`);
    if (world.cells[cell]) throw new Error(`part ${i} (${p.c}) at ${p.x},${p.y} lands on another part`);
    const q = world.add(k, sim.config.classes[k].traits, cell, 0);
    q.tag = p.tag ?? p.c;
    return q;
  });
  for (const [a, b, stored = 0] of bonds) world.addBond(placed[a], placed[b], stored);
  for (const h of heat) field[world.index(cx + h.x, cy + h.y)] += h.amount;
  sim.placed = placed;
  sim.keyOf = (p) => keys[p.cls];
  return sim;
}

// A shipped protein or process in its own world, as the app runs it.
export function protein(id, seed = 1, value = undefined, globals = {}) {
  const compound = compoundById(id);
  if (!compound) throw new Error(`no compound "${id}". Try: ${COMPOUNDS.map((c) => c.id).join(', ')}`);
  const config = compoundWorld(compound, compound.world, seed, value ?? compound.input?.def);
  config.globals = { ...config.globals, ...globals };
  const sim = new Simulation(config);
  sim.keyOf = (p) => sim.config.classes[p.cls].name;
  return sim;
}

export const nameOf = (sim, p) => sim.config.classes[p.cls].name;
export const named = (sim, name) => sim.world.particles.filter((p) => nameOf(sim, p) === name);
export const together = (a, b) => a.alive && b.alive && a.mol !== null && a.mol === b.mol;
// Is this particle bonded, through its molecule, to a socket called `dock`?
export const docked = (sim, p, dock = 'Dock') => p.mol !== null && p.mol.members.some((m) => nameOf(sim, m) === dock);

// Each member's pull and how far it is from the rest, worked out the way a molecule's look-around does it: in a pair,
// the two pulls apart; in three or more, a member against the average of the others. The largest `dev` at or past
// Disagreement (1) is the one that may leave. No chance is involved, so building a loaded molecule by hand at each cell
// of its route, at tick 0, and reading this shows exactly where it will split and who goes (tricks.md, 32).
export function deviations(sim, mol) {
  const pulls = mol.members.map((m) => sensePull(sim, m, m.energy, false));
  const n = pulls.length;
  const sx = pulls.reduce((s, p) => s + p[0], 0);
  const sy = pulls.reduce((s, p) => s + p[1], 0);
  return mol.members.map((m, i) => ({
    name: nameOf(sim, m),
    x: m.x,
    y: m.y,
    pull: [+pulls[i][0].toFixed(2), +pulls[i][1].toFixed(2)],
    dev: +(n === 2
      ? Math.hypot(pulls[0][0] - pulls[1][0], pulls[0][1] - pulls[1][1])
      : Math.hypot(pulls[i][0] - (sx - pulls[i][0]) / (n - 1), pulls[i][1] - (sy - pulls[i][1]) / (n - 1))).toFixed(2),
  }));
}

// Where a free particle would head right now, steering included: [x, y, near]. A load just let go that's within 3 cells
// of something it can bond with, and senses it among its 12 nearest cells, heads straight for its docking cell.
export const headingOf = (sim, p) => sensePull(sim, p, p.energy, true);

// Run `ticks`, checking every `every` ticks. Returns the tick `check` first said yes, or null.
export function run(sim, ticks, every = 0, check = null) {
  for (let i = 0; i < ticks; i++) {
    sim.step();
    if (check && every && sim.tick % every === 0 && check(sim)) return sim.tick;
  }
  return null;
}

const summary = (times, seeds, extra = {}) => {
  times.sort((a, b) => a - b);
  return { done: times.length, seeds, median: times[Math.floor(times.length / 2)] ?? null, slowest: times.at(-1) ?? null, ...extra };
};

// Run a scene over seeds 1..n (or the given list): `check(sim)` returns true once it has done its job.
export function trial(spec, { seeds = 20, ticks = 3000, every = 10, rules = {}, check }) {
  const list = Array.isArray(seeds) ? seeds : Array.from({ length: seeds }, (_, i) => i + 1);
  const times = [];
  const failed = [];
  for (const seed of list) {
    const t = run(scene(spec, seed, rules), ticks, every, check);
    if (t === null) failed.push(seed);
    else times.push(t);
  }
  return summary(times, list.length, { failed });
}

// The names of the classes a shipped protein delivers. It's done once every one of them is docked.
const LOADS = ['Parcel', 'Package', 'Shot', 'Crate'];
export function allDelivered(sim) {
  const loads = sim.world.particles.filter((p) => LOADS.includes(nameOf(sim, p)));
  return loads.length > 0 && loads.every((p) => docked(sim, p));
}
// What "done" means for a shipped protein. The Replicator carries nothing: it's done after 29 divisions, 30 rods.
const doneFor = (id) => (id === 'replicator' ? (sim) => sim.totals.divisions >= 29 : allDelivered);

export function proteinTrial(id, { seeds = 20, ticks = 6000, every = 10, value } = {}) {
  const times = [];
  const failed = [];
  const check = doneFor(id);
  for (let seed = 1; seed <= seeds; seed++) {
    const t = run(protein(id, seed, value), ticks, every, check);
    if (t === null) failed.push(seed);
    else times.push(t);
  }
  return summary(times, seeds, { failed });
}

// Pictures: the energy field in the background (red hot, blue cold, violet pressure), particles in their class colors and
// bonds as white lines.
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export function frame(sim, z = 5) {
  const { world, field, config } = sim;
  const w = world.width;
  const h = world.height;
  const colors = config.classes.map((c) => hex(c.color));
  const buf = new Uint8Array(w * z * h * z * 3);
  const put = (px, py, c) => {
    if (px < 0 || py < 0 || px >= w * z || py >= h * z) return;
    const o = (py * w * z + px) * 3;
    buf[o] = c[0];
    buf[o + 1] = c[1];
    buf[o + 2] = c[2];
  };
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      const p = world.cells[i];
      const e = field[i];
      const pr = sim.pressure.at(cx, cy);
      let bg = e > 0 ? [Math.min(150, 10 + Math.sqrt(e) * 18), 15, 20] : e < 0 ? [10, 15, Math.min(170, 20 + Math.sqrt(-e) * 18)] : [10, 15, 20];
      if (pr > 0) {
        const a = Math.min(0.55, 0.55 * Math.sqrt(pr / 40));
        bg = [bg[0] + (144 - bg[0]) * a, bg[1] + (133 - bg[1]) * a, bg[2] + (233 - bg[2]) * a];
      }
      for (let j = 0; j < z; j++) for (let k = 0; k < z; k++) put(cx * z + k, cy * z + j, p && !(z >= 4 && (j === z - 1 || k === z - 1)) ? colors[p.cls] : bg);
    }
  }
  for (const mol of world.molecules) {
    for (const m of mol.members) {
      for (const b of m.bonds) {
        if (b.host !== m || Math.abs(b.guest.x - m.x) > 1 || Math.abs(b.guest.y - m.y) > 1) continue;
        for (let t = 0; t <= z; t++) put(Math.round(m.x * z + z / 2 + (b.guest.x - m.x) * t), Math.round(m.y * z + z / 2 + (b.guest.y - m.y) * t), [255, 255, 255]);
      }
    }
  }
  return { buf, w: w * z, h: h * z };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, sum]);
};
// Frames side by side in a grid, `cols` wide, written as a PNG.
export function png(frames, cols, path) {
  const fw = frames[0].w;
  const fh = frames[0].h;
  const gap = 4;
  const rows = Math.ceil(frames.length / cols);
  const w = cols * (fw + gap) + gap;
  const h = rows * (fh + gap) + gap;
  const raw = Buffer.alloc((w * 3 + 1) * h, 60);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  frames.forEach((f, n) => {
    const ox = gap + (n % cols) * (fw + gap);
    const oy = gap + Math.floor(n / cols) * (fh + gap);
    for (let y = 0; y < fh; y++) raw.set(f.buf.subarray(y * fw * 3, (y + 1) * fw * 3), (oy + y) * (w * 3 + 1) + 1 + ox * 3);
  });
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = 2;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

// `frames` pictures spread evenly over `ticks`, of a spec or (given a string) a shipped protein. `say(sim)` runs at each.
export function pictures(specOrId, path, { seed = 1, ticks = 1000, frames = 8, z = 5, rules = {}, say = null } = {}) {
  const sim = typeof specOrId === 'string' ? protein(specOrId, seed, undefined, rules) : scene(specOrId, seed, rules);
  const out = [frame(sim, z)];
  if (say) say(sim);
  for (let f = 1; f < frames; f++) {
    const until = Math.round((ticks * f) / (frames - 1));
    while (sim.tick < until) sim.step();
    out.push(frame(sim, z));
    if (say) say(sim);
  }
  png(out, Math.min(4, frames), path);
  return sim;
}

// A line that changes if anything about how this world runs changes: who is where, at what level, the field, the events.
export function fingerprint(which) {
  let cfg;
  let ticks;
  if (which.startsWith('compound:')) {
    const c = compoundById(which.slice(9));
    cfg = compoundWorld(c, c.world, 1);
    ticks = 2500;
  } else {
    const p = presetById(which);
    cfg = p.build();
    ticks = p.group === 'matrix' ? 4000 : 3000;
  }
  const sim = new Simulation(cfg);
  for (let i = 0; i < ticks; i++) sim.step();
  let h = 7;
  for (const p of sim.world.particles) h = (Math.imul(h, 31) + p.cell * 7 + p.cls + Math.round(p.energy * 10)) | 0;
  let f = 0;
  for (const e of sim.field) f += e;
  const t = sim.totals;
  return `${which.padEnd(24)} t${ticks} pop ${String(sim.world.particles.length).padStart(6)} hash ${String(h).padStart(12)} field ${f.toFixed(4).padStart(14)} connects ${t.connects} breaks ${t.breaks}`;
}
export const everyWorld = () => [...PRESETS.map((p) => p.id), ...COMPOUNDS.map((c) => `compound:${c.id}`)];

// The demo: a Courier written out as a scene. A −2 grip and −1 tail pick up a +3 parcel, the three add up to 0 and creep
// to the dense dock, and the parcel lets go there and bonds onto a −3 socket.
export const COURIER = (o = {}) => ({
  world: { width: 64, height: 44, wrap: false },
  rules: {},
  classes: {
    wall: { name: 'Dock wall', energy: 0, frisk: 0, pattern: [N] },
    socket: { name: 'Dock', energy: -3, frisk: 0, pattern: [E], stayProb: 1 },
    grip: { name: 'Grip', energy: -2, pattern: [W, E], stayProb: 1 },
    tail: { name: 'Tail', energy: -1, pattern: [E], stayProb: 1 },
    parcel: { name: 'Parcel', energy: 3, pattern: [E], stayProb: 0 },
  },
  build: () => {
    const parts = [];
    const thick = o.thick ?? 5;
    const dockX = o.dockX ?? 18;
    for (let i = 0; i < 9; i++) parts.push({ c: 'socket', x: dockX, y: i - 4 });
    for (let k = 1; k <= thick; k++) for (let i = 0; i < 9; i++) parts.push({ c: 'wall', x: dockX + k, y: i - 4 });
    const g = parts.length;
    parts.push({ c: 'grip', x: -16, y: 0 }, { c: 'tail', x: -17, y: 0 }, { c: 'parcel', x: -12, y: 1 });
    return { parts, bonds: [[g, g + 1]] };
  },
});

function table(rows) {
  const cols = Object.keys(rows[0]);
  const width = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  const line = (vals) => vals.map((v, i) => String(v).padEnd(width[i])).join('  ');
  return [line(cols), line(width.map((n) => '-'.repeat(n))), ...rows.map((r) => line(cols.map((c) => r[c])))].join('\n');
}

// Run as a command, not imported. Paths with spaces in them are escaped in a module's URL, so compare file paths.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [cmd = 'demo', ...args] = process.argv.slice(2);
  if (cmd === 'demo') {
    const check = (sim) => sim.world.particles.some((p) => sim.keyOf(p) === 'parcel' && p.mol?.members.some((m) => sim.keyOf(m) === 'socket'));
    console.log('Courier as a scene, 10 seeds:', trial(COURIER(), { seeds: 10, ticks: 2000, check }));
  } else if (cmd === 'protein') {
    const [id, seeds = 20, ticks = 6000] = args;
    console.log(id, proteinTrial(id, { seeds: Number(seeds), ticks: Number(ticks) }));
  } else if (cmd === 'catalog') {
    const seeds = Number(args[0] ?? 20);
    const rows = COMPOUNDS.filter((c) => c.kind === 'protein' || c.kind === 'process').map((c) => {
      const r = proteinTrial(c.id, { seeds });
      return { id: c.id, done: `${r.done}/${r.seeds}`, median: r.median ?? '-', slowest: r.slowest ?? '-', failed: r.failed.join(' ') || '-' };
    });
    console.log(table(rows));
  } else if (cmd === 'pictures') {
    const [id, out, seed = 1, ticks] = args;
    const c = compoundById(id);
    pictures(id, out, { seed: Number(seed), ticks: Number(ticks ?? c.preview?.ticks ?? 1000) });
    console.log('wrote', out);
  } else if (cmd === 'fingerprints') {
    const lines = everyWorld().map((w) => fingerprint(w));
    if (!args[0]) console.log(lines.join('\n'));
    else {
      const before = new Map(readFileSync(args[0], 'utf8').split('\n').filter(Boolean).map((l) => [l.split(/\s+/)[0], l]));
      let changed = 0;
      for (const l of lines) {
        const id = l.split(/\s+/)[0];
        if (!before.has(id)) console.log(`new      ${l}`);
        else if (before.get(id) !== l) {
          changed++;
          console.log(`CHANGED  ${l}\n   was   ${before.get(id)}`);
        }
      }
      console.log(changed === 0 ? 'Every world that was there before runs exactly as it did.' : `${changed} worlds changed.`);
      process.exitCode = changed === 0 ? 0 : 1;
    }
  } else {
    console.log('Commands: demo, protein <id> [seeds] [ticks], catalog [seeds], pictures <id> <out.png> [seed] [ticks], fingerprints [before.txt]');
  }
}
