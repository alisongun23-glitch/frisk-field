// Run a preset (or a saved settings file) without the browser and print how it evolves.
// Usage: node tools/run.mjs <preset id | settings.json> [ticks=2000] [every=200] [--map]

import { readFileSync } from 'node:fs';
import { Simulation } from '../src/sim.js';
import { presetById, PRESETS } from '../src/presets.js';

const args = process.argv.slice(2);
const showMap = args.includes('--map');
const [source = 'pairs', ticksArg = '2000', everyArg = '200'] = args.filter((a) => !a.startsWith('--'));
const ticks = Number(ticksArg);
const every = Number(everyArg);

const preset = presetById(source);
if (!preset && !source.endsWith('.json')) {
  console.error(`Unknown preset "${source}". Try: ${PRESETS.map((p) => p.id).join(', ')}, or a .json settings file.`);
  process.exit(1);
}
const sim = new Simulation(preset ? preset.build() : JSON.parse(readFileSync(source, 'utf8')));
const names = sim.config.classes.map((c) => c.name);

function line() {
  const counts = names.map((n, k) => `${n} ${String(sim.world.counts[k]).padStart(5)}`).join('  ');
  const e = sim.energy;
  const t = sim.totals;
  return `tick ${String(sim.tick).padStart(5)} | ${counts} | energy +${e.pos.toFixed(0)} ${e.neg.toFixed(0)}`
    + (sim.energyRules
      ? ` | bonds formed ${t.connects} broken ${t.breaks} crushed ${t.crushes} fused ${t.fusions} broke up ${t.breakups} kill ${t.kills} spawn ${t.spawns}`
      : ` | grow ${t.growths} die ${t.deaths} kill ${t.kills} spawn ${t.spawns}`);
}

// Coarse text map: each character covers a block of cells and shows the most common class in it.
function map(scale = 4) {
  const { world } = sim;
  const glyphs = '#o+x*%@&=~^$';
  const rows = [];
  for (let by = 0; by < world.height; by += scale * 2) {
    let row = '';
    for (let bx = 0; bx < world.width; bx += scale) {
      const tally = new Map();
      for (let y = by; y < Math.min(world.height, by + scale * 2); y++) {
        for (let x = bx; x < Math.min(world.width, bx + scale); x++) {
          const p = world.cells[y * world.width + x];
          if (p) tally.set(p.cls, (tally.get(p.cls) ?? 0) + 1);
        }
      }
      if (tally.size === 0) row += ' ';
      else row += glyphs[[...tally].sort((a, b) => b[1] - a[1])[0][0] % glyphs.length];
    }
    rows.push(row);
  }
  return rows.join('\n');
}

console.log(line());
const started = performance.now();
for (let i = 1; i <= ticks; i++) {
  sim.step();
  if (i % every === 0) console.log(line());
}
const ms = (performance.now() - started) / ticks;
console.log(`${ms.toFixed(2)} ms per tick (${sim.world.particles.length} particles on ${sim.world.width}x${sim.world.height})`);
if (showMap) console.log(`\n${map()}\n(${names.map((n, k) => `${'#o+x*%@&=~^$'[k]} ${n}`).join(', ')})`);
