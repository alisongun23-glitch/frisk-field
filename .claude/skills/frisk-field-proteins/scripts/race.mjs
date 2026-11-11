// Race design variants against each other with successive halving, then confirm the winner on many seeds.
// Run it from the project folder:
//
//   node <skill>/scripts/race.mjs demo
//   node <skill>/scripts/race.mjs <your-race.mjs> [--start 5] [--keep 2] [--max 80] [--confirm 60]
//
// Your race file (keep it in the scratchpad) exports:
//
//   export const variants = [{ name: 'thick 5', spec }, ...];   // a scene spec, as bench.mjs takes
//      or [{ name, id: 'courier', value, globals }]             // a shipped protein with some settings changed
//   export const check = (sim) => ...;                           // true once it has done its job
//   export const ticks = 3000;                                   // the longest a seed may take (optional)
//   export const every = 10;                                     // how often to check (optional)
//
// Every variant in a round runs on the same seeds, so they're compared on the same luck. Each round keeps the better
// half, ranked by how many seeds succeeded and then by median time, and doubles the seeds for the survivors. Seeds
// already run are kept, so a survivor is only ever run on new ones. That spends most runs on the designs that are
// still in it, which is the idea behind racing (irace) and successive halving (Hyperband).
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scene, protein, run, COURIER } from './bench.mjs';

function options(args) {
  const o = { start: 5, keep: 2, max: 80, confirm: 60 };
  for (let i = 0; i < args.length; i++) {
    const m = args[i].match(/^--(start|keep|max|confirm)$/);
    if (m) o[m[1]] = Number(args[++i]);
  }
  return o;
}

const simFor = (v, seed) => (v.spec ? scene(v.spec, seed, v.rules ?? {}) : protein(v.id, seed, v.value, v.globals ?? {}));

// Runs a variant on every seed up to `upTo` that it hasn't run yet. Its results are kept on it.
function runUpTo(v, upTo, race) {
  v.results ??= [];
  for (let seed = v.results.length + 1; seed <= upTo; seed++) {
    v.results.push(run(simFor(v, seed), race.ticks ?? 3000, race.every ?? 10, race.check));
  }
}

function score(v) {
  const times = v.results.filter((t) => t !== null).sort((a, b) => a - b);
  return {
    name: v.name,
    rate: times.length / v.results.length,
    done: `${times.length}/${v.results.length}`,
    median: times.length ? times[Math.floor(times.length / 2)] : Infinity,
    slowest: times.length ? times.at(-1) : Infinity,
    failed: v.results.map((t, i) => (t === null ? i + 1 : null)).filter((s) => s !== null),
  };
}
const better = (a, b) => b.rate - a.rate || a.median - b.median || a.slowest - b.slowest;
const show = (n) => (n === Infinity ? '-' : n);

export function race(spec, opts = {}) {
  const o = { ...options([]), ...opts };
  let alive = spec.variants.map((v) => ({ ...v }));
  let seeds = o.start;
  for (let round = 1; ; round++) {
    for (const v of alive) runUpTo(v, seeds, spec);
    const ranked = alive.map((v) => ({ v, s: score(v) })).sort((a, b) => better(a.s, b.s));
    console.log(`\nRound ${round}: ${alive.length} variants, ${seeds} seeds each`);
    for (const { s } of ranked) console.log(`  ${s.name.padEnd(28)} ${s.done.padStart(7)} done   median ${String(show(s.median)).padStart(6)}   slowest ${String(show(s.slowest)).padStart(6)}`);
    if (alive.length <= o.keep || seeds * 2 > o.max) {
      alive = ranked.map((r) => r.v);
      break;
    }
    alive = ranked.slice(0, Math.max(o.keep, Math.ceil(alive.length / 2))).map((r) => r.v);
    seeds *= 2;
  }
  const winner = alive[0];
  runUpTo(winner, o.confirm, spec);
  const s = score(winner);
  console.log(`\nWinner: ${s.name}, confirmed on ${winner.results.length} seeds: ${s.done} done, median ${show(s.median)}, slowest ${show(s.slowest)}${s.failed.length ? `, failed on seeds ${s.failed.join(' ')}` : ''}`);
  if (s.rate === 0) console.log('Nothing in this race works. The mechanism is wrong, and more numbers won\'t fix it: go back to Step 2.');
  return { winner: s, alive: alive.map(score) };
}

// The demo races Courier docks of different thickness. A thicker wall makes the dock the densest mass from farther off.
const demo = {
  variants: [0, 1, 2, 3, 5, 8].map((thick) => ({ name: `dock wall ${thick} thick`, spec: COURIER({ thick, dockX: 22 }) })),
  check: (sim) => sim.world.particles.some((p) => sim.keyOf(p) === 'parcel' && p.mol?.members.some((m) => sim.keyOf(m) === 'socket')),
  ticks: 2500,
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) {
    console.log('Usage: race.mjs demo | race.mjs <race file> [--start 5] [--keep 2] [--max 80] [--confirm 60]');
  } else {
    const spec = file === 'demo' ? demo : await import(pathToFileURL(resolve(file)).href);
    if (!spec.variants?.length || typeof spec.check !== 'function') throw new Error('A race file exports `variants` (a list) and `check(sim)`.');
    race(spec, options(rest));
  }
}
