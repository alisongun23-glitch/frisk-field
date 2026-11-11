import { createRng } from './rng.js';
import {
  normalizeConfig, normalizePattern, normalizeSites, clampGlobal, clampTrait, clamp, cellOf, fractionOf, makeClass, addClassTo,
  removeClassFrom, ensureMatrices, classColor, classLimit, MAX_COUNT, MAX_SITES,
} from './config.js';
import { randomTraits } from './random.js';
import { World } from './world.js';
import { buildKernel, deposit, diffuse, fade, spawnClassFor } from './energy.js';
import { senseOffsets, drift, sensePull, walk, NO_DRIFT } from './movement.js';
import { checkTriggers, tryGrow } from './lifecycle.js';
import { detach, dropBonds, tryDock } from './bonds.js';
import { moleculeTurn, DensityMap } from './molecules.js';
import { layerOffsets, checkCrowd, crowdCheckDue, surroundings, SAME_LEVEL } from './crowding.js';
import { breakIfUnsteady, steadiedBy } from './overcharge.js';
import { PressureMap } from './pressure.js';
import { compoundById, placeCompound } from './compounds.js';

const HISTORY_LENGTH = 1200;
const DROP_MARGIN = 1.02;
// Ticks between looks around: fewer when something connectable is close (at the default sense radius, within 2 cells),
// more when the map is crowded and looking is what most of a tick would go on.
const RESCAN = { close: 1, far: 4 };
const RESCAN_CROWDED = { close: 3, far: 8 };
const CROWDED = 20000;
const CLOSE = 0.5;
// Under energy rules, a map with more cells than this has its energy looked over a few ticks' worth at a time, a share of
// the cells each tick. Most of a tick on a big map would otherwise go on cells where nothing is happening.
const BIG_MAP = 100000;
const FIELD_EVERY = 4;
export const EVENT_KINDS = ['moves', 'contacts', 'growths', 'connects', 'breaks', 'crushes', 'fusions', 'breakups', 'divisions', 'deaths', 'kills', 'spawns'];
const blankEvents = () => Object.fromEntries(EVENT_KINDS.map((k) => [k, 0]));

export class Simulation {
  // Ticks between points kept for the charts. At very high speed a point every tick would cover only a moment.
  recordEvery = 1;

  constructor(config) {
    this.reset(config);
  }

  // Start over from `config` (or the current one): fresh grid, empty field, each class's particles placed.
  reset(config = this.config) {
    this.config = normalizeConfig(config);
    const { globals: g, classes } = this.config;
    this.rng = createRng(this.config.seed);
    this.world = new World(g.width, g.height, g.wrap, classes.length);
    this.energyRules = this.config.rules === 'energy';
    this.fieldEvery = this.energyRules && g.width * g.height > BIG_MAP ? FIELD_EVERY : 1;
    this.world.neutralBand = this.energyRules ? g.neutralBand : null;
    this.density = new DensityMap(this.world, g.macroRange);
    this.pressure = new PressureMap(this.world);
    this.field = new Float64Array(g.width * g.height);
    this.scratch = new Float64Array(g.width * g.height);
    this.kernel = buildKernel(g.spread);
    this.offsets = senseOffsets(g.senseRadius, g.width);
    this.layer = layerOffsets(g.layerReach, g.width);
    this.refreshTendency();
    this.trickleSaved = 0;
    this.nextDrop = 0;
    this.tick = 0;
    this.events = blankEvents();
    this.totals = blankEvents();
    this.energy = { pos: 0, neg: 0 };
    this.history = [];
    this.seedParticles();
    this.record();
  }

  // Place each class: its scattered count anywhere on the map, then its seed locations.
  seedParticles() {
    const { world, rng } = this;
    const size = world.cells.length;
    this.config.classes.forEach((c, k) => {
      let placed = 0;
      for (let tries = 0; placed < c.count && tries < c.count * 20 + 100 && !this.full; tries++) {
        if (this.placeSeed(k, rng.int(size))) placed++;
      }
      for (const site of c.sites) this.plantSite(k, site);
    });
    for (const stamp of this.config.stamps) this.replayStamp(stamp);
  }

  // Fill a seed location with its particles, spread evenly over its radius. Returns how many fit.
  plantSite(k, site) {
    const { world, rng } = this;
    const cx = cellOf(site.x, world.width);
    const cy = cellOf(site.y, world.height);
    let placed = 0;
    for (let tries = 0; placed < site.count && tries < site.count * 20 + 100 && !this.full; tries++) {
      const angle = rng.next() * Math.PI * 2;
      const dist = Math.sqrt(rng.next()) * (site.radius + 0.5);
      const cell = world.index(cx + Math.round(Math.cos(angle) * dist), cy + Math.round(Math.sin(angle) * dist));
      if (this.placeSeed(k, cell, site.traits)) placed++;
    }
    return placed;
  }

  // Add seed locations to the running world and place their particles now. Returns how many particles fit.
  plantSeeds(seeds) {
    let placed = 0;
    for (const { k, site } of seeds) {
      const { sites } = this.config.classes[k];
      if (sites.length >= MAX_SITES) continue;
      const [clean] = normalizeSites([site], this.energyRules);
      sites.push(clean);
      placed += this.plantSite(k, clean);
    }
    return placed;
  }

  // Drop a compound on the map, centered on a cell, and remember it so that Reset brings it back. Returns how many of its
  // particles went in, or -1 if there's no room for its classes.
  placeCompound(id, x, y, value) {
    const compound = compoundById(id);
    if (!compound || !this.energyRules) return -1;
    const placed = placeCompound(this, compound, x, y, value);
    if (placed >= 0) this.config.stamps.push({ id, x: fractionOf(x, this.world.width), y: fractionOf(y, this.world.height), value });
    return placed;
  }

  replayStamp({ id, x, y, value }) {
    const compound = compoundById(id);
    if (compound && this.energyRules) placeCompound(this, compound, cellOf(x, this.world.width), cellOf(y, this.world.height), value);
  }

  // At the particle limit nothing new appears until deaths make room.
  get full() {
    return this.world.particles.length >= this.config.globals.maxParticles;
  }

  // With `individuals` on, every particle rolls its own values.
  placeSeed(k, cell, seedTraits) {
    const { world, rng } = this;
    const traits = this.config.individuals ? randomTraits(rng, { energyRules: this.energyRules }) : seedTraits ?? this.config.classes[k].traits;
    if (this.full || !world.canPlace(cell, traits)) return false;
    world.add(k, traits, cell, this.tick);
    return true;
  }

  step() {
    this.events = blankEvents();
    if (this.energyRules) {
      this.trickle();
      this.density.refresh(this.world, this.tick);
      this.pressure.refresh(this.world, this.field, this.config.globals, this.tick);
    }
    this.energyEvents();
    const order = this.rng.shuffle(this.world.particles.slice());
    for (const p of order) if (p.alive) this.updateParticle(p);
    const { diffusion, decay } = this.config.globals;
    if (diffusion === 0) {
      const { fieldEvery } = this;
      if (fieldEvery === 1) this.energy = fade(this.field, decay);
      else if (this.tick % fieldEvery === 0) this.energy = fade(this.field, 1 - (1 - decay) ** fieldEvery);
    } else {
      const out = this.scratch;
      this.energy = diffuse(this.world, this.field, out, diffusion, decay);
      this.scratch = this.field;
      this.field = out;
    }
    this.tick++;
    for (const k of EVENT_KINDS) this.totals[k] += this.events[k];
    this.record();
  }

  updateParticle(p) {
    const { rng } = this;
    if (this.energyRules) {
      if (Math.abs(p.energy) > this.config.globals.stableLimit && breakIfUnsteady(this, p)) return;
      if (p.mol !== null) {
        moleculeTurn(this, p.mol);
      } else if (!crowdCheckDue(this.tick, p) || !checkCrowd(this, p)) {
        if (p.frisk > 0 && !this.world.boxedIn(p.cell) && walk(this, p)) this.events.moves++;
      }
      return;
    }
    checkTriggers(this, p);
    if (p.doomed && rng.next() < p.deathProb) {
      this.kill(p, 'deaths');
      return;
    }
    // A primed particle holds still until it grows, and growing uses up its turn.
    if (p.primed) {
      if (rng.next() < p.growthProb) tryGrow(this, p);
      return;
    }
    if (p.doomed || p.frisk <= 0) return;
    if (p.stayProb > 0 && p.touching > 0 && rng.next() < p.stayProb) return;
    if (walk(this, p)) this.events.moves++;
  }

  // Hand-set matrices: `p` just arrived next to others, so check both sides' conditions.
  contact(p) {
    const { world } = this;
    const { growth, death } = this.config;
    let touched = false;
    for (let s = p.cell * 8, end = s + 8; s < end; s++) {
      const c = world.nbr[s];
      if (c < 0) continue;
      const q = world.cells[c];
      if (q === null) continue;
      touched = true;
      if (growth[p.cls][q.cls]) p.primed = true;
      if (death[p.cls][q.cls]) p.doomed = true;
      if (growth[q.cls][p.cls]) q.primed = true;
      if (death[q.cls][p.cls]) q.doomed = true;
    }
    if (touched) this.events.contacts++;
  }

  // The particle turns into energy: removed, with its Energy_level spread around where it was. Under energy rules its
  // bonds break first, and it gives back what it cost to create, which is the size of its level.
  kill(p, kind) {
    if (this.energyRules) detach(this, p);
    this.world.remove(p);
    deposit(this.world, this.field, p.cell, this.energyRules ? Math.abs(p.energy) : p.energy, this.kernel);
    this.events[kind]++;
  }

  // Energy rules, with the Steady trickle on: the set amount lands on random cells, in drops just big enough to clear the
  // Spawn buffer and create a class. Whatever doesn't make a whole drop yet waits for the next tick, since a smaller
  // one would never create anything.
  trickle() {
    const { trickleOn, trickle } = this.config.globals;
    if (!trickleOn || trickle <= 0 || this.cheapestClass() === Infinity) return;
    const { rng, field } = this;
    this.trickleSaved += trickle;
    for (;;) {
      if (this.nextDrop === 0) this.nextDrop = this.pickDrop();
      if (this.trickleSaved < this.nextDrop) return;
      field[rng.int(field.length)] += this.nextDrop;
      this.trickleSaved -= this.nextDrop;
      this.nextDrop = 0;
    }
  }

  // The size of the next drop, for a class picked at random. Every class gets the same share of the energy, so a class
  // half as dear gets twice as many drops. A little over, so it still pays after fading for the few ticks it may wait
  // for Energy_Prob.
  pickDrop() {
    const { classes, globals } = this.config;
    const { rng } = this;
    const smallest = this.cheapestClass() + globals.spawnBuffer;
    for (;;) {
      const c = classes[rng.int(classes.length)];
      const cost = Math.abs(c.traits.energy);
      const drop = cost + globals.spawnBuffer;
      if (c.spawns !== false && cost > 0 && rng.next() * drop <= smallest) return drop * DROP_MARGIN;
    }
  }

  // The smallest Energy_level that could be created from energy.
  cheapestClass() {
    let cheapest = Infinity;
    for (const c of this.config.classes) {
      const cost = Math.abs(c.traits.energy);
      if (c.spawns !== false && cost > 0 && cost < cheapest) cheapest = cost;
    }
    return cheapest;
  }

  // Is this energy deadly? Under energy rules that goes for high energy as well as negative energy, counted from the
  // top of the Spawn buffer.
  deadly(e) {
    const { killThreshold, burnThreshold, spawnBuffer } = this.config.globals;
    return e <= killThreshold || (this.energyRules && e >= burnThreshold + spawnBuffer);
  }

  // Energy past a threshold spawns on an empty cell and destroys what's on an occupied one, each with probability
  // Energy_Prob. Under energy rules a cell spawns as soon as it holds the Spawn buffer plus what a class costs, whichever
  // the sign, and only pays that cost. This is the only way to die, so Death_Prob decides if a particle gives in.
  energyEvents() {
    const { world, field, rng, config } = this;
    const { energyProb, killThreshold, burnThreshold, spawnBuffer } = config.globals;
    if (energyProb <= 0) return;
    const candidates = [];
    const roomToSpawn = !this.full;
    const spawnThreshold = this.energyRules ? spawnBuffer + this.cheapestClass() : config.globals.spawnThreshold;
    const lowestHigh = this.energyRules ? Math.min(spawnThreshold, spawnBuffer + burnThreshold) : spawnThreshold;
    // A cell looked at less often gets better odds each time, so that things happen just as often as they would.
    const { fieldEvery } = this;
    const odds = (chance) => 1 - (1 - chance) ** fieldEvery;
    const chance = fieldEvery === 1 ? energyProb : odds(energyProb);
    const givesIn = (q) => rng.next() < (fieldEvery === 1 ? q.deathProb : odds(energyProb * q.deathProb) / chance);
    for (let i = this.tick % fieldEvery; i < field.length; i += fieldEvery) {
      const e = field[i];
      if (e > killThreshold && e < lowestHigh) continue;
      if (world.cells[i] === null ? roomToSpawn && e >= spawnThreshold : this.deadly(e)) candidates.push(i);
    }
    rng.shuffle(candidates);
    for (const i of candidates) {
      if (rng.next() >= chance) continue;
      // Re-read the cell: earlier events this tick may have changed it.
      const e = field[i];
      const q = world.cells[i];
      if (q === null && e >= spawnThreshold) {
        if (this.full) continue;
        const k = this.energyRules
          ? spawnClassFor(config.classes, e - spawnBuffer, rng, true)
          : spawnClassFor(config.classes, e - spawnThreshold, rng);
        if (k < 0) continue;
        const traits = config.classes[k].traits;
        if (!world.canPlace(i, traits)) continue;
        field[i] -= Math.abs(traits.energy);
        const born = world.add(k, traits, i, this.tick);
        if (this.energyRules) tryDock(this, born);
        else this.contact(born);
        this.events.spawns++;
      } else if (q !== null && this.deadly(e) && (!this.energyRules || givesIn(q))) {
        this.kill(q, 'kills');
      }
    }
  }

  driftOf(p) {
    if (this.energyRules) {
      const pull = this.offsets.length === 0 || this.world.isNeutral(p) ? NO_DRIFT : sensePull(this, p, this.world.overallEnergy(p), true);
      const { pressure } = this;
      pressure.feel(this.world, p.x, p.y, this.config.globals.pressurePush);
      return pressure.pushX === 0 && pressure.pushY === 0 ? pull : [pull[0] + pressure.pushX, pull[1] + pressure.pushY, pull[2]];
    }
    return this.tendencyActive[p.cls] ? drift(this.world, p, this.config.tendency[p.cls], this.offsets) : NO_DRIFT;
  }

  // What a walking particle senses, kept for a few ticks when nothing it could connect with is close. Most of a
  // tick's work would otherwise go on particles looking around again at the same surroundings.
  seekOf(p) {
    if (this.tick >= p.seekAgain) {
      p.seek = this.driftOf(p);
      const wait = this.world.particles.length > CROWDED ? RESCAN_CROWDED : RESCAN;
      p.seekAgain = this.tick + (p.seek[2] > CLOSE ? wait.close : wait.far);
    }
    return p.seek;
  }

  refreshTendency() {
    this.tendencyActive = this.config.tendency.map((row) => this.offsets.length > 0 && row.some((t) => t !== 0));
  }

  record() {
    if (this.tick % this.recordEvery !== 0) return;
    const { pos, neg } = this.energy;
    this.history.push({ tick: this.tick, counts: this.world.counts.slice(), pos, neg });
    if (this.history.length > HISTORY_LENGTH) this.history.shift();
  }

  stateOf(p) {
    if (p.doomed || (this.energyRules && this.deadly(this.field[p.cell]))) return 'doomed';
    if (p.primed) return 'primed';
    if (this.energyRules) {
      if (Math.abs(p.energy) > this.config.globals.stableLimit) return steadiedBy(this, p) === null ? 'unstable' : 'steadied';
      if (p.mol === null && (p.fusing || p.crushed)) return p.fusing ? 'fusing' : 'crushed';
      if (this.world.isNeutral(p)) return 'neutral';
      return p.mol !== null ? 'touching' : 'free';
    }
    return p.touching > 0 ? 'touching' : 'free';
  }

  inspect(x, y) {
    const c = this.world.index(x, y);
    if (c < 0) return null;
    const p = this.world.cells[c];
    return {
      x, y, energy: this.field[c], particle: p,
      state: p ? this.stateOf(p) : null,
      overall: p && this.energyRules ? this.world.overallEnergy(p) : null,
      molecule: p && this.energyRules ? this.moleculeInfo(p) : null,
      around: p && this.energyRules ? surroundings(this, p) : null,
      steadied: p && this.energyRules ? steadiedBy(this, p) : null,
      pressure: this.energyRules ? this.pressureAt(x, y) : null,
    };
  }

  // The pressure at a cell, and the way it pushes from there: its size and direction, whatever the Pressure push.
  pressureAt(x, y) {
    const { pressure, world } = this;
    pressure.feel(world, x, y, 1);
    return { amount: pressure.at(x, y), pushX: pressure.pushX, pushY: pressure.pushY };
  }

  // The size of a particle's molecule, and the energy stored in its bonds.
  moleculeInfo(p) {
    if (p.mol === null) return { size: 1, stored: 0 };
    let stored = 0;
    for (const m of p.mol.members) for (const b of m.bonds) if (b.host === m) stored += b.stored;
    return { size: p.mol.members.length, stored };
  }

  // Live edits from the UI.

  setGlobal(key, value) {
    const g = this.config.globals;
    g[key] = clampGlobal(key, value);
    if (key === 'spread') this.kernel = buildKernel(g.spread);
    if (key === 'senseRadius') {
      this.offsets = senseOffsets(g.senseRadius, this.world.width);
      this.refreshTendency();
    }
    if (key === 'wrap') this.world.setWrap(g.wrap);
    if (key === 'neutralBand' && this.energyRules) this.world.neutralBand = g.neutralBand;
    if (key === 'macroRange') this.density = new DensityMap(this.world, g.macroRange);
    if (key === 'layerReach') this.layer = layerOffsets(g.layerReach, this.world.width);
    // Width and height take effect on the next reset.
  }

  // Switch between energy rules and the hand-set matrices. Particles stay where they are, and any bonds go, with no
  // energy released. Hand-set matrices can't take more classes than they can show, so that switch may not happen.
  setRules(rules) {
    const energy = rules === 'energy';
    if (!energy && this.config.classes.length > classLimit({ ...this.config, rules: 'matrix' })) return;
    this.config.rules = energy ? 'energy' : 'matrix';
    this.energyRules = energy;
    this.fieldEvery = energy && this.field.length > BIG_MAP ? FIELD_EVERY : 1;
    for (const p of this.world.particles) dropBonds(this.world, p);
    this.world.neutralBand = energy ? this.config.globals.neutralBand : null;
    if (!energy) {
      this.world.countTouching();
      ensureMatrices(this.config);
      this.refreshTendency();
    }
  }

  // Change a class default and carry it to the class's living particles. Numbers shift by the same amount,
  // so mutated lineages keep their differences.
  setClassTrait(k, key, value) {
    const traits = this.config.classes[k].traits;
    const next = clampTrait(key, value, this.energyRules);
    const delta = next - traits[key];
    traits[key] = next;
    if (delta === 0) return;
    for (const p of this.world.particles) {
      if (p.cls === k) p[key] = clampTrait(key, p[key] + delta, this.energyRules);
    }
    if (key === 'energy') {
      for (const mol of this.world.molecules) mol.net = mol.members.reduce((sum, m) => sum + m.energy, 0);
    }
  }

  // A new pattern is set outright on the class and all its living particles.
  setClassPattern(k, pattern) {
    const next = normalizePattern(pattern);
    this.config.classes[k].traits.growthPattern = next;
    for (const p of this.world.particles) {
      if (p.cls === k) {
        p.pattern = next;
        p.step %= next.length;
      }
    }
  }

  setClassMeta(k, patch) {
    const c = this.config.classes[k];
    if ('name' in patch) c.name = String(patch.name).trim().slice(0, 24) || c.name;
    if ('color' in patch && /^#[0-9a-f]{6}$/i.test(patch.color)) c.color = patch.color.toLowerCase();
    if ('count' in patch) c.count = clamp(Math.round(Number(patch.count) || 0), 0, MAX_COUNT);
    if ('spawns' in patch) c.spawns = Boolean(patch.spawns);
  }

  setClassSites(k, sites) {
    this.config.classes[k].sites = normalizeSites(sites, this.energyRules);
  }

  setMatrix(name, a, b, value) {
    this.config[name][a][b] = name === 'tendency' ? clamp(Number(value) || 0, -1, 1) : value ? 1 : 0;
    if (name === 'tendency') this.refreshTendency();
  }

  // Add a class (a copy of `copyFrom`, or a new one, with `traits` if given). Returns its index, or -1 at the class limit.
  addClass(copyFrom = -1, traits = null) {
    const { classes } = this.config;
    if (classes.length >= classLimit(this.config)) return -1;
    const used = new Set(classes.map((c) => c.color));
    let free = 0;
    while (used.has(classColor(free))) free++;
    const color = classColor(free);
    const cls = copyFrom >= 0
      ? { ...structuredClone(classes[copyFrom]), name: `${classes[copyFrom].name} copy`.slice(0, 24), color }
      : makeClass(`Class ${classes.length + 1}`, color, traits ?? {}, traits ? 0 : 200);
    addClassTo(this.config, cls, copyFrom);
    this.world.counts.push(0);
    for (const h of this.history) h.counts.push(0);
    this.refreshTendency();
    return classes.length - 1;
  }

  // The class at this Energy_level, for a fusion or a breakup to make: one that's there already, or else a new one following
  // the class it came from, named for its level and made only by fusion. -1 if that would be past the class limit.
  classAtLevel(level, from) {
    const { classes } = this.config;
    const clean = Math.round(level * 10) / 10;
    const found = classes.findIndex((c) => Math.abs(c.traits.energy - level) < SAME_LEVEL || Math.abs(c.traits.energy - clean) < SAME_LEVEL);
    if (found >= 0) return found;
    const k = this.addClass(-1, { ...classes[from].traits, energy: clean });
    if (k >= 0) {
      classes[k].name = `${clean > 0 ? '+' : '−'}${Math.abs(clean)}`;
      classes[k].spawns = false;
    }
    return k;
  }

  // Delete a class and its particles (they vanish without releasing energy); later classes shift down one.
  removeClass(k) {
    if (this.config.classes.length <= 1) return;
    for (const p of this.world.particles.slice()) {
      if (p.cls !== k) continue;
      dropBonds(this.world, p);
      this.world.remove(p);
    }
    for (const p of this.world.particles) if (p.cls > k) p.cls--;
    removeClassFrom(this.config, k);
    this.world.counts.splice(k, 1);
    for (const h of this.history) h.counts.splice(k, 1);
    this.refreshTendency();
  }

  // Brush strokes. 'particle' places class `cls`, 'energy+' and 'energy-' add or remove energy,
  // 'erase' clears particles (no energy released) and zeroes the field.
  paint(x, y, radius, tool, cls = 0) {
    const { world, field } = this;
    const density = radius === 0 ? 1 : 0.3;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > radius + 0.5) continue;
        const c = world.index(x + dx, y + dy);
        if (c < 0) continue;
        const falloff = 1 - d / (radius + 1);
        if (tool === 'particle') {
          const traits = this.config.classes[cls]?.traits;
          if (traits && Math.random() < density && !this.full && world.canPlace(c, traits)) {
            const placed = world.add(cls, traits, c, this.tick);
            if (this.energyRules) tryDock(this, placed);
            else this.contact(placed);
          }
        } else if (tool === 'energy+') {
          field[c] += 0.6 * falloff;
        } else if (tool === 'energy-') {
          field[c] -= 0.6 * falloff;
        } else if (tool === 'erase') {
          const q = world.cells[c];
          if (q !== null) {
            dropBonds(world, q);
            world.remove(q);
          }
          field[c] = 0;
        }
      }
    }
  }
}
