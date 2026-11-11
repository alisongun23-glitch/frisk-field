import { Simulation } from './sim.js';
import { PRESETS, presetById } from './presets.js';
import {
  normalizeConfig, TRAITS, TRAIT_BY_KEY, ARROWS, MAX_CLASSES, MAX_SITES, MAX_COUNT, classLimit, clamp, fractionOf, cellOf, radiusFor,
} from './config.js';
import { createRng, randomSeed } from './rng.js';
import { randomSetup, randomSeeds, randomTraits, RANDOM_NEUTRAL_RANGE } from './random.js';
import { nextSide } from './bonds.js';
import { Renderer, STATE_COLORS, TRAIT_RAMP, ENERGY_RAMP } from './render.js';
import { Camera } from './ui/camera.js';
import { buildWorldPanel } from './ui/worldPanel.js';
import { buildClassesPanel } from './ui/classesPanel.js';
import { buildRulesPanel } from './ui/rulesPanel.js';
import { buildStatsPanel } from './ui/statsPanel.js';
import { buildCompoundsPanel } from './ui/compoundsPanel.js';
import { COMPOUNDS, compoundById, compoundWorld, layoutOf } from './compounds.js';
import { el, fmtInt, signed } from './ui/dom.js';

const STORAGE_KEY = 'frisk-field/v4';
// The world you were in before opening a compound's own world, kept apart so that the usual saving can't overwrite it.
const LEFT_WORLD_KEY = 'frisk-field/v4/left-world';
// Ticks per second, up to a last stop that means as many as it can manage.
const SPEEDS = [1, 2, 5, 10, 20, 30, 60, 120, 240, 480, 960, 2000, 5000, 1e9];
const MAX_SPEED = SPEEDS.length - 1;
const TABS = ['world', 'classes', 'compounds', 'rules', 'stats'];
const STATE_LABELS = { free: 'Free', touching: 'Touching', primed: 'Primed to grow', doomed: 'Doomed' };
const ENERGY_STATE_LABELS = {
  free: 'Free', touching: 'In a molecule', neutral: 'Neutral (about 0)', crushed: 'Crushed, can’t bond', fusing: 'Deep enough to fuse', unstable: 'Unstable, past the limit', steadied: 'Past the limit, steadied', doomed: 'On deadly energy',
};
const STEADIED_BY = { molecule: 'Steadied by its molecule', field: 'Steadied by the field' };
const LEGEND_CLASSES = 8;
// How far, in pixels, a press has to travel before it counts as dragging the map rather than a click.
const DRAG_FROM = 4;
const $ = (id) => document.getElementById(id);

// Browser storage only remembers this viewer's last setup; everything works without it.
const storage = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  },
  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage blocked or full: nothing to do.
    }
  },
  loadLeftWorld() {
    try {
      return JSON.parse(localStorage.getItem(LEFT_WORLD_KEY));
    } catch {
      return null;
    }
  },
  saveLeftWorld(config) {
    try {
      if (config) localStorage.setItem(LEFT_WORLD_KEY, JSON.stringify(config));
      else localStorage.removeItem(LEFT_WORLD_KEY);
    } catch {
      // Then it's only kept until the page closes.
    }
  },
};

const saved = storage.load();
const view = {
  overlay: true, pressure: true, colorBy: 'class', tool: 'inspect', size: 3, brushClass: 0, seedCount: 100, speed: 6, tab: 'world', compound: COMPOUNDS[0].id, compoundValues: {},
  ...(saved?.view && typeof saved.view === 'object' ? saved.view : {}),
};
view.speed = Math.min(MAX_SPEED, Math.max(0, Math.round(Number(view.speed)) || 0));
view.random = {
  count: clamp(Math.round(Number(view.random?.count)) || 12, 2, MAX_CLASSES),
  chance: clamp(Number(view.random?.chance ?? 0.3) || 0, 0, 1),
  seeds: clamp(Math.round(Number(view.random?.seeds ?? 300)) || 0, 0, MAX_SITES),
  size: clamp(Math.round(Number(view.random?.size ?? 12)) || 1, 1, 200),
  fastestGrowth: clamp(Number(view.random?.fastestGrowth ?? 0.1) || 0.1, 0.01, 1),
  ownValues: view.random?.ownValues ?? false,
};
view.seedCount = clamp(Math.round(Number(view.seedCount)) || 100, 1, MAX_COUNT);
if (!compoundById(view.compound)) view.compound = COMPOUNDS[0].id;
if (!TABS.includes(view.tab)) view.tab = 'world';
if (TABS.includes(location.hash.slice(1))) view.tab = location.hash.slice(1);

function startingConfig() {
  try {
    if (saved?.config) return normalizeConfig(saved.config);
  } catch {
    // A stored setup that no longer validates falls back to the first preset.
  }
  return PRESETS[0].build();
}

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => storage.save({ config: app.sim.config, view }), 400);
}

let classesView;
let rulesView;
let statsView;
let compoundsView;
let seedNote = '';

const app = {
  sim: new Simulation(startingConfig()),
  running: !matchMedia('(prefers-reduced-motion: reduce)').matches,
  randomOptions: view.random,
  saveSoon: scheduleSave,

  // A fresh set of random classes, placed straight away. World settings stay as they are.
  randomize() {
    const seed = randomSeed();
    const { count, chance, seeds, size, ownValues, fastestGrowth } = view.random;
    const { config } = this.sim;
    const { width, height } = config.globals;
    const classes = Math.min(count, classLimit(config));
    const setup = randomSetup(classes, createRng(seed), { conditionChance: chance, seeds, size, ownValues, fastestGrowth, energyRules: this.sim.energyRules, area: width * height });
    const globals = this.sim.energyRules ? { ...config.globals, neutralBand: Math.max(config.globals.neutralBand, RANDOM_NEUTRAL_RANGE) } : config.globals;
    resetSim({ ...config, ...setup, globals, seed, stamps: [] });
    scheduleSave();
  },

  // More seeds in the world as it is, using the current classes. Returns how many particles fit.
  scatterSeeds() {
    const placed = this.sim.plantSeeds(randomSeeds(this.sim.config.classes, createRng(randomSeed()), { ...view.random, energyRules: this.sim.energyRules }));
    classesView.refreshSites();
    this.edited();
    return placed;
  },

  setRules(rules) {
    this.sim.setRules(rules);
    rebuildPanels();
    $('rules-energy')?.focus();
    this.edited();
  },

  // Any rule edit turns the setup into a custom one.
  edited() {
    if (this.sim.config.preset !== 'custom') {
      this.sim.config.preset = 'custom';
      syncSetup();
    }
    rulesView?.update();
    scheduleSave();
  },
  classesRenamed() {
    rulesView = buildRulesPanel($('tab-rules'), app);
    fillClassSelect();
    drawLegend();
  },
  addClass(copyFrom) {
    const k = this.sim.addClass(copyFrom);
    if (k < 0) return;
    rebuildPanels(k);
    this.edited();
  },
  removeClass(k) {
    this.sim.removeClass(k);
    keepBrushClassValid();
    rebuildPanels(Math.max(0, k - 1));
    this.edited();
  },

  // Compounds.
  compoundValue: (id) => view.compoundValues[id] ?? compoundById(id).input?.def,
  setCompoundValue(id, value) {
    view.compoundValues[id] = value;
    scheduleSave();
  },
  armedCompound: () => (view.tool === 'compound' ? view.compound : null),
  // Get ready to place one, with the next click on the map.
  armCompound(id) {
    view.compound = id;
    $('brush-compound').value = id;
    setTool('compound');
    if (matchMedia('(max-width: 960px)').matches) $('screen').scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  // The world to go back to, if a compound's own world has taken its place.
  leftWorld: storage.loadLeftWorld(),
  // Replace this world with one holding only this compound, under the rules it was found with. The first time, the world
  // being left is kept. Going from one compound's world to another's doesn't change that.
  openCompound(id) {
    const compound = compoundById(id);
    if (!this.leftWorld) {
      this.leftWorld = structuredClone(this.sim.config);
      storage.saveLeftWorld(this.leftWorld);
    }
    resetSim(compoundWorld(compound, compound.world, 1, this.compoundValue(id)));
    camera.fit();
    showZoom();
    view.speed = Math.max(0, SPEEDS.findIndex((s) => s >= compound.speed));
    speed.value = view.speed;
    showSpeed();
    setRunning(true);
    if (view.tool === 'compound') setTool('inspect');
    scheduleSave();
  },
  backToLeftWorld() {
    const config = this.leftWorld;
    if (!config) return;
    this.leftWorld = null;
    storage.saveLeftWorld(null);
    resetSim(config);
    camera.fit();
    showZoom();
    scheduleSave();
  },
  // Picking another world on purpose means there's nothing left to go back to.
  letGoOfLeftWorld() {
    this.leftWorld = null;
    storage.saveLeftWorld(null);
    compoundsView?.refresh();
  },
  useCompoundRules(id) {
    for (const [key, value] of Object.entries(compoundById(id).rules)) this.sim.setGlobal(key, value);
    rebuildPanels();
    this.edited();
  },
  forgetCompounds() {
    this.sim.config.stamps = [];
    compoundsView.refresh();
    this.edited();
  },
};

const renderer = new Renderer($('chamber'));

// How many classes the panels know about. A fusion can make a new one at any time.
let shownClasses = 0;

function rebuildPanels(openClass = 0) {
  shownClasses = app.sim.config.classes.length;
  buildWorldPanel($('tab-world'), app);
  classesView = buildClassesPanel($('tab-classes'), app, openClass);
  rulesView = buildRulesPanel($('tab-rules'), app);
  statsView = buildStatsPanel($('tab-stats'), app);
  compoundsView ??= buildCompoundsPanel($('tab-compounds'), app);
  compoundsView.refresh();
  fillClassSelect();
  fillColorBy();
  syncSetup();
  drawLegend();
  $('pressure-wrap').hidden = !app.sim.energyRules;
  if (view.tab === 'stats') statsView.update();
}

let measuredTps = 0;

// ---- Tabs ----

const tabButtons = [...document.querySelectorAll('[role="tab"]')];
function showTab(name, focus = false) {
  view.tab = name;
  for (const b of tabButtons) {
    const on = b.dataset.tab === name;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    $(`tab-${b.dataset.tab}`).hidden = !on;
    if (on && focus) b.focus();
  }
  if (name === 'stats') statsView?.update();
  if (name === 'classes') classesView?.update();
  scheduleSave();
}
for (const b of tabButtons) {
  b.addEventListener('click', () => showTab(b.dataset.tab));
  b.addEventListener('keydown', (e) => {
    const i = TABS.indexOf(b.dataset.tab);
    if (e.key === 'ArrowRight') showTab(TABS[(i + 1) % TABS.length], true);
    else if (e.key === 'ArrowLeft') showTab(TABS[(i + TABS.length - 1) % TABS.length], true);
    else return;
    e.preventDefault();
  });
}

// ---- Transport and setup ----

const playBtn = $('play');
function setRunning(on) {
  app.running = on;
  playBtn.textContent = on ? 'Pause' : 'Play';
  playBtn.setAttribute('aria-pressed', String(on));
}
function stepOnce() {
  setRunning(false);
  app.sim.step();
  refreshUi();
}
function resetSim(config) {
  if (config) {
    app.sim.reset(config);
    keepBrushClassValid();
    rebuildPanels();
  } else {
    app.sim.reset();
    classesView.refreshSites();
  }
  syncCamera();
  refreshUi();
}

playBtn.addEventListener('click', () => setRunning(!app.running));
$('step').addEventListener('click', stepOnce);
$('reset').addEventListener('click', () => resetSim());

const speed = $('speed');
// Past what a point per tick can show, charts keep fewer points so they still cover about five seconds. At Max that
// depends on the speed it's really reaching.
function keepChartSpan() {
  const ticks = view.speed === MAX_SPEED ? measuredTps : SPEEDS[view.speed];
  app.sim.recordEvery = ticks <= 480 ? 1 : 2 ** Math.round(Math.log2(ticks / 240));
}
function showSpeed() {
  const ticks = SPEEDS[view.speed];
  const max = view.speed === MAX_SPEED;
  $('speed-out').textContent = max ? 'Max' : `${fmtInt(ticks)}/s`;
  speed.setAttribute('aria-valuetext', max ? 'As many ticks per second as it can manage' : `${ticks} ticks per second`);
  keepChartSpan();
}
speed.max = MAX_SPEED;
speed.value = view.speed;
speed.addEventListener('input', () => {
  view.speed = Number(speed.value);
  showSpeed();
  scheduleSave();
});

const presetSelect = $('preset');
const presetOptions = (group) => PRESETS.filter((p) => p.group === group).map((p) => el('option', { value: p.id, text: p.name }));
presetSelect.append(
  el('optgroup', { label: 'Energy rules' }, presetOptions('energy')),
  el('optgroup', { label: 'Hand-set matrices' }, presetOptions('matrix')),
  el('option', { value: 'random', text: 'Random classes', disabled: true }),
  el('option', { value: 'custom', text: 'Custom settings', disabled: true }),
);
$('randomize').addEventListener('click', () => app.randomize());
presetSelect.addEventListener('change', () => {
  const preset = presetById(presetSelect.value);
  if (!preset) return;
  app.letGoOfLeftWorld();
  resetSim(preset.build());
  scheduleSave();
});
function syncSetup() {
  const { preset } = app.sim.config;
  presetSelect.value = presetById(preset) || preset === 'random' ? preset : 'custom';
  $('seed').value = app.sim.config.seed;
}

$('seed').addEventListener('change', () => {
  const v = Math.abs(Math.round(Number($('seed').value))) % 4294967296;
  app.sim.config.seed = Number.isFinite(v) ? v : 0;
  resetSim();
  syncSetup();
  scheduleSave();
});
$('new-seed').addEventListener('click', () => {
  app.sim.config.seed = randomSeed();
  syncSetup();
  resetSim();
  scheduleSave();
});

// ---- Brush and display ----

const stage = $('stage');
const toolButtons = [...document.querySelectorAll('[data-tool]')].filter((b) => b.tagName === 'BUTTON');
function setTool(tool) {
  view.tool = tool;
  stage.dataset.tool = tool;
  for (const b of toolButtons) {
    const on = b.dataset.tool === tool;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  $('brush-class-wrap').hidden = tool !== 'particle' && tool !== 'seed';
  $('brush-size-wrap').hidden = tool === 'seed' || tool === 'compound';
  $('seed-count-wrap').hidden = tool !== 'seed';
  $('brush-compound-wrap').hidden = tool !== 'compound';
  seedNote = '';
  keepBrushClassValid();
  fillClassSelect();
  compoundsView?.refresh();
  scheduleSave();
}
$('brush-compound').replaceChildren(
  el('optgroup', { label: 'Proteins' }, COMPOUNDS.filter((c) => c.kind === 'protein').map((c) => el('option', { value: c.id, text: c.name }))),
  el('optgroup', { label: 'Processes' }, COMPOUNDS.filter((c) => c.kind === 'process').map((c) => el('option', { value: c.id, text: c.name }))),
  el('optgroup', { label: 'Compounds' }, COMPOUNDS.filter((c) => !c.kind).map((c) => el('option', { value: c.id, text: c.name }))),
);
$('brush-compound').value = view.compound;
$('brush-compound').addEventListener('change', (e) => {
  view.compound = e.target.value;
  seedNote = '';
  compoundsView?.refresh();
  scheduleSave();
});
toolButtons.forEach((b, i) => {
  b.addEventListener('click', () => setTool(b.dataset.tool));
  b.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = toolButtons[(i + d + toolButtons.length) % toolButtons.length];
    setTool(next.dataset.tool);
    next.focus();
  });
});

// The brush paints an existing class; the Seeds brush can also start a new random one, while there is room for it.
function keepBrushClassValid() {
  const { classes } = app.sim.config;
  if (view.brushClass === 'new' && view.tool === 'seed' && classes.length < classLimit(app.sim.config)) return;
  const k = Number(view.brushClass);
  view.brushClass = Number.isInteger(k) ? clamp(k, 0, classes.length - 1) : 0;
}
function fillClassSelect() {
  const select = $('brush-class');
  const { classes } = app.sim.config;
  select.replaceChildren(...classes.map((c, k) => el('option', { value: k, text: c.name })));
  if (view.tool === 'seed' && classes.length < classLimit(app.sim.config)) select.append(el('option', { value: 'new', text: 'New random class' }));
  select.value = String(view.brushClass);
}
$('brush-class').addEventListener('change', (e) => {
  view.brushClass = e.target.value === 'new' ? 'new' : Number(e.target.value);
  scheduleSave();
});
$('seed-count').value = view.seedCount;
$('seed-count').addEventListener('change', (e) => {
  view.seedCount = clamp(Math.round(Number(e.target.value)) || 1, 1, MAX_COUNT);
  e.target.value = view.seedCount;
  scheduleSave();
});
$('brush-size').value = view.size;
$('brush-size').addEventListener('input', (e) => {
  view.size = Number(e.target.value);
  scheduleSave();
});

$('overlay').checked = view.overlay;
$('overlay').addEventListener('change', (e) => {
  view.overlay = e.target.checked;
  scheduleSave();
});
$('pressure-overlay').checked = view.pressure;
$('pressure-overlay').addEventListener('change', (e) => {
  view.pressure = e.target.checked;
  scheduleSave();
});

const colorBy = $('color-by');
// What there is to color by: only the values the current rules use.
function fillColorBy() {
  const { rules } = app.sim.config;
  const traits = TRAITS.filter((t) => !t.rules || t.rules === rules);
  const overall = rules === 'energy' ? ['overall'] : [];
  colorBy.replaceChildren(
    el('option', { value: 'class', text: 'Class' }),
    el('option', { value: 'state', text: 'State' }),
    ...overall.map((value) => el('option', { value, text: 'Overall energy' })),
    el('optgroup', { label: 'Each particle’s own value' }, traits.map((t) => el('option', { value: t.key, text: t.label }))),
  );
  if (!['class', 'state', ...overall, ...traits.map((t) => t.key)].includes(view.colorBy)) view.colorBy = 'class';
  colorBy.value = view.colorBy;
}
colorBy.addEventListener('change', () => {
  view.colorBy = colorBy.value;
  drawLegend();
  scheduleSave();
});

// The key under the chamber: classes with live counts, the state colors, or a trait's ramp.
let legendCounts = [];
function drawLegend() {
  const legend = $('legend');
  legendCounts = [];
  if (view.colorBy === 'class') {
    if (app.sim.config.classes.length > LEGEND_CLASSES) {
      updateLegendCounts();
      return;
    }
    legend.replaceChildren(...app.sim.config.classes.map((c) => {
      const count = el('span', { class: 'count' });
      legendCounts.push(count);
      return el('span', { class: 'item' }, el('span', { class: 'swatch', vars: { '--c': c.color } }), el('span', { text: c.name }), count);
    }));
    updateLegendCounts();
  } else if (view.colorBy === 'state') {
    legend.replaceChildren(...Object.entries(STATE_COLORS)
      .filter(([k]) => k in stateLabels())
      .map(([k, c]) => el('span', { class: 'item' }, el('span', { class: 'swatch', vars: { '--c': c } }), el('span', { text: stateLabels()[k] }))));
  } else {
    const def = view.colorBy === 'overall' ? { min: -10, max: 10, label: 'Overall energy: its whole molecule added up' } : TRAIT_BY_KEY[view.colorBy];
    const stops = view.colorBy === 'energy' || view.colorBy === 'overall' ? ENERGY_RAMP : TRAIT_RAMP;
    legend.replaceChildren(el('span', { class: 'ramp-key' },
      el('span', { text: String(def.min) }),
      el('span', { class: 'bar', vars: { '--ramp': `linear-gradient(90deg, ${stops.join(', ')})` } }),
      el('span', { text: String(def.max) })),
    el('span', { text: def.label }));
  }
}
function updateLegendCounts() {
  const { classes } = app.sim.config;
  if (view.colorBy === 'class' && classes.length > LEGEND_CLASSES) {
    // With this many classes, the legend shows the biggest ones and counts the rest.
    const { counts } = app.sim.world;
    const biggest = classes.map((c, k) => k).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0)).slice(0, LEGEND_CLASSES).sort((a, b) => a - b);
    $('legend').replaceChildren(
      ...biggest.map((k) => el('span', { class: 'item' },
        el('span', { class: 'swatch', vars: { '--c': classes[k].color } }),
        el('span', { text: classes[k].name }),
        el('span', { class: 'count', text: fmtInt(counts[k] ?? 0) }))),
      el('span', { class: 'item', text: `and ${classes.length - LEGEND_CLASSES} more` }),
    );
    return;
  }
  legendCounts.forEach((node, k) => (node.textContent = fmtInt(app.sim.world.counts[k] ?? 0)));
}
const stateLabels = () => (app.sim.energyRules ? ENERGY_STATE_LABELS : STATE_LABELS);

// ---- Map view and pointer ----

const screenEl = $('screen');
const camera = new Camera();

function showZoom() {
  const z = camera.zoom;
  $('zoom-level').textContent = `${z >= 10 ? Math.round(z) : z.toFixed(z < 1 ? 2 : 1)}×`;
  stage.toggleAttribute('data-zoomed', !camera.fitted);
}
function syncCamera() {
  const { width: W, height: H } = app.sim.world;
  screenEl.style.setProperty('--aspect', `${W} / ${H}`);
  camera.setWorld(W, H);
  camera.setView(stage.clientWidth, stage.clientHeight, window.devicePixelRatio || 1);
  showZoom();
}
new ResizeObserver(syncCamera).observe(stage);

$('zoom-in').addEventListener('click', () => {
  camera.zoomStep(1);
  showZoom();
});
$('zoom-out').addEventListener('click', () => {
  camera.zoomStep(-1);
  showZoom();
});
$('zoom-fit').addEventListener('click', () => {
  camera.fit();
  showZoom();
});

const viewPoint = (e) => {
  const r = stage.getBoundingClientRect();
  return { px: e.clientX - r.left, py: e.clientY - r.top };
};
function cellAt(e) {
  const { px, py } = viewPoint(e);
  const { x, y } = camera.toCell(px, py);
  const { width: W, height: H } = app.sim.world;
  return { x, y, px, py, inside: x >= 0 && y >= 0 && x < W && y < H };
}

stage.addEventListener('wheel', (e) => {
  const { px, py } = viewPoint(e);
  const lines = e.deltaMode === 1 ? 30 : 1;
  // A trackpad pinch arrives as a wheel event with Ctrl held and much smaller steps.
  if (camera.zoomAt(Math.exp(-e.deltaY * lines * (e.ctrlKey ? 0.01 : 0.0025)), px, py)) e.preventDefault();
  showZoom();
}, { passive: false });
stage.addEventListener('contextmenu', (e) => e.preventDefault());

// Every class's seed locations, in cells, ready to draw.
function siteMarks() {
  const { width: W, height: H } = app.sim.world;
  const marks = [];
  app.sim.config.classes.forEach((c, k) => c.sites.forEach((s, i) => {
    marks.push({ k, i, x: cellOf(s.x, W), y: cellOf(s.y, H), radius: s.radius, color: c.color, hot: false });
  }));
  return marks;
}
function siteAt(px, py, marks = siteMarks()) {
  let best = null;
  let bestDist = 12;
  for (const m of marks) {
    const v = camera.toView(m.x + 0.5, m.y + 0.5);
    const d = Math.hypot(v.x - px, v.y - py);
    if (d <= bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

// The Seeds brush: click an empty part of the map to add a location for the chosen class and place its particles now.
function plantSeedAt(x, y) {
  const { sim } = app;
  let k = view.brushClass;
  if (k === 'new') {
    k = sim.addClass(-1, randomTraits(createRng(randomSeed()), { fastestGrowth: view.random.fastestGrowth, energyRules: sim.energyRules }));
    if (k < 0) return;
    keepBrushClassValid();
    rebuildPanels(k);
  }
  const c = sim.config.classes[k];
  if (c.sites.length >= MAX_SITES) {
    seedNote = `${c.name} already has ${MAX_SITES} locations, the most a class can have.`;
    return;
  }
  const count = view.seedCount;
  const site = { x: fractionOf(x, sim.world.width), y: fractionOf(y, sim.world.height), radius: radiusFor(count), count };
  sim.setClassSites(k, [...c.sites, site]);
  const placed = sim.plantSite(k, site);
  seedNote = `Placed ${fmtInt(placed)} of ${c.name} at (${x}, ${y}).`;
  classesView.showSites(k);
  app.edited();
}
function pressSeeds(e) {
  const hit = siteAt(pointer.px, pointer.py);
  if (hit && e.shiftKey) {
    const { sites } = app.sim.config.classes[hit.k];
    app.sim.setClassSites(hit.k, sites.filter((_, i) => i !== hit.i));
    classesView.showSites(hit.k);
    app.edited();
  } else if (hit) {
    gesture = { kind: 'site', k: hit.k, i: hit.i };
  } else if (pointer.inside) {
    plantSeedAt(pointer.x, pointer.y);
  }
}
// The Compound brush: put the chosen compound in this world.
function placeCompoundAt(x, y) {
  const { sim } = app;
  const compound = compoundById(view.compound);
  if (!sim.energyRules) {
    seedNote = 'Compounds need energy rules. Turn them on in the Rules tab, or use Its own world on a compound’s card.';
    return;
  }
  const placed = sim.placeCompound(compound.id, x, y, app.compoundValue(compound.id));
  if (placed < 0) {
    seedNote = `There’s no room for ${compound.name}’s classes: ${classLimit(sim.config)} is the limit.`;
    return;
  }
  seedNote = `Placed ${compound.name} at (${x}, ${y}). Click again for another.`;
  showNewClasses();
  compoundsView.refresh();
  app.edited();
}
function dragSite(k, i) {
  if (!pointer.inside) return;
  const { sim } = app;
  const moved = { x: fractionOf(pointer.x, sim.world.width), y: fractionOf(pointer.y, sim.world.height) };
  sim.setClassSites(k, sim.config.classes[k].sites.map((s, j) => (j === i ? { ...s, ...moved } : s)));
  classesView.showSites(k);
  app.edited();
}

let pointer = null;
let gesture = null;
const held = new Map();

function pinchNow() {
  const [a, b] = [...held.values()];
  return { dist: Math.hypot(a.px - b.px, a.py - b.py), px: (a.px + b.px) / 2, py: (a.py + b.py) / 2 };
}
function paintAt(p) {
  if (p?.inside) app.sim.paint(p.x, p.y, view.size, view.tool, view.brushClass);
}
stage.addEventListener('pointerdown', (e) => {
  held.set(e.pointerId, viewPoint(e));
  pointer = cellAt(e);
  stage.setPointerCapture(e.pointerId);
  if (held.size === 2) {
    gesture = { kind: 'pinch', last: pinchNow() };
    return;
  }
  // The middle or right button pans with any brush, and so does a plain drag with Inspect.
  if (e.button === 1 || e.button === 2 || (e.button === 0 && view.tool === 'inspect')) {
    e.preventDefault();
    gesture = { kind: 'pan', px: pointer.px, py: pointer.py, dragging: false };
    stage.classList.add('panning');
  } else if (e.button === 0) {
    e.preventDefault();
    if (view.tool === 'seed') {
      pressSeeds(e);
    } else if (view.tool === 'compound') {
      if (pointer.inside) placeCompoundAt(pointer.x, pointer.y);
    } else {
      gesture = { kind: 'paint' };
      paintAt(pointer);
    }
  }
});
stage.addEventListener('pointermove', (e) => {
  pointer = cellAt(e);
  if (held.has(e.pointerId)) held.set(e.pointerId, viewPoint(e));
  if (gesture?.kind === 'paint') {
    paintAt(pointer);
  } else if (gesture?.kind === 'site') {
    dragSite(gesture.k, gesture.i);
  } else if (gesture?.kind === 'pan') {
    gesture.dragging ||= Math.hypot(pointer.px - gesture.px, pointer.py - gesture.py) >= DRAG_FROM;
    if (gesture.dragging) {
      camera.pan(pointer.px - gesture.px, pointer.py - gesture.py);
      gesture.px = pointer.px;
      gesture.py = pointer.py;
    }
  } else if (gesture?.kind === 'pinch' && held.size === 2) {
    const now = pinchNow();
    camera.zoomAt(now.dist / Math.max(1, gesture.last.dist), now.px, now.py);
    camera.pan(now.px - gesture.last.px, now.py - gesture.last.py);
    gesture.last = now;
    showZoom();
  }
});
stage.addEventListener('pointerleave', () => {
  if (!gesture) pointer = null;
});
const release = (e) => {
  held.delete(e.pointerId);
  gesture = null;
  stage.classList.remove('panning');
};
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);

// ---- Readouts ----

function inspectorContent() {
  if (view.tool === 'seed') {
    return [el('span', { text: seedNote || 'Click the map to add a seed location for the chosen class. Drag a dot to move it, or Shift-click it to remove it. Locations replay on Reset.' })];
  }
  if (view.tool === 'compound') {
    return [el('span', { text: seedNote || `Click the map to place ${compoundById(view.compound).name}. It clears whatever is under it, and Reset brings it back.` })];
  }
  if (!pointer?.inside) {
    return [el('span', {
      text: view.tool === 'inspect'
        ? 'Hover the chamber to read a cell, drag to move around, scroll to zoom. Pick a brush above to paint.'
        : 'Click and drag in the chamber to paint. Scroll to zoom; drag with the right button to move around.',
    })];
  }
  const info = app.sim.inspect(pointer.x, pointer.y);
  if (!info) return [];
  const parts = [el('span', { class: 'lead', text: `(${info.x}, ${info.y})` }), el('span', { text: `energy ${signed(info.energy)}` })];
  if (info.pressure) parts.push(el('span', { text: `pressure ${pressureText(info.pressure)}` }));
  const mol = info.molecule;
  const p = info.particle;
  if (!p) return [...parts, el('span', { text: 'empty' })];
  const c = app.sim.config.classes[p.cls];
  return [
    ...parts,
    mol ? el('span', { text: `overall ${signed(info.overall, 1)}` }) : null,
    mol && mol.size > 1 ? el('span', { text: `molecule of ${mol.size}` }) : null,
    mol && mol.stored > 0 ? el('span', { text: `bonds hold ${mol.stored.toFixed(1)}` }) : null,
    mol ? el('span', { text: `around: ${info.around.molecules} molecules, ${info.around.particles} particles` }) : null,
    el('span', { class: 'pill' }, el('span', { class: 'dot', vars: { '--c': c.color } }), el('span', { text: `${c.name} #${p.id}` })),
    el('span', { class: 'pill' }, el('span', { class: 'dot', vars: { '--c': STATE_COLORS[info.state] } }), el('span', { text: STEADIED_BY[info.steadied] ?? stateLabels()[info.state] })),
    el('span', { text: `frisk ${p.frisk}` }),
    el('span', { text: `RandomWalk ${p.randomWalk.toFixed(2)}` }),
    app.sim.energyRules ? null : el('span', { text: `Connect ${p.connect}` }),
    el('span', { text: `Stay ${p.stayProb.toFixed(2)}` }),
    mol
      ? el('span', { text: `Connects ${[...new Set(p.pattern)].map((s) => ARROWS[s - 1]).join('')}${nextSide(app.sim.world, p) > 0 ? ` next ${ARROWS[nextSide(app.sim.world, p) - 1]}` : ', full'}` })
      : el('span', { text: `Growth ${p.growthProb.toFixed(2)}` }),
    mol ? null : el('span', { text: `Pattern ${p.pattern.map((s) => ARROWS[s - 1]).join('')} next ${ARROWS[p.pattern[p.step] - 1]}` }),
    mol ? null : el('span', { text: `Pattern_Mutation ${p.patternMutation.toFixed(2)}` }),
    el('span', { text: `Death ${p.deathProb.toFixed(2)}` }),
    el('span', { text: `Energy_level ${signed(p.energy, 1)}` }),
    mol ? null : el('span', { text: `Variance ${p.variance.toFixed(2)}` }),
  ].filter(Boolean);
}

// Panels pick up classes a fusion has made without being rebuilt, which would close what's open in them.
function showNewClasses() {
  const { length } = app.sim.config.classes;
  if (length <= shownClasses) return;
  for (let k = shownClasses; k < length; k++) classesView.addCard(k);
  shownClasses = length;
  app.classesRenamed();
  scheduleSave();
}

// How much pressure a cell has, and which way it pushes from there.
function pressureText({ amount, pushX, pushY }) {
  if (pushX === 0 && pushY === 0) return amount.toFixed(1);
  return `${amount.toFixed(1)} ${ARROWS[(Math.round(Math.atan2(pushX, -pushY) / (Math.PI / 4)) + 8) % 8]}`;
}

function refreshUi() {
  const { sim } = app;
  showNewClasses();
  $('tick').textContent = fmtInt(sim.tick);
  $('pop').textContent = sim.full ? `${fmtInt(sim.world.particles.length)} (limit)` : fmtInt(sim.world.particles.length);
  $('tps').textContent = app.running ? fmtInt(measuredTps) : '0';
  $('inspector').replaceChildren(...inspectorContent());
  updateLegendCounts();
  if (view.tab === 'classes') classesView.update();
  if (view.tab === 'stats') statsView.update();
}

// ---- Save / load ----

const sheet = $('io-sheet');
const ioText = $('io-text');
const ioMsg = $('io-msg');
// Pretty JSON, with each innermost list of numbers kept on one line so matrices read as rows.
const prettyConfig = (config) =>
  JSON.stringify(config, null, 2).replace(/\[\s+([-\d.,\s]+?)\s+\]/g, (_, inner) => `[${inner.trim().split(/\s*,\s*/).join(', ')}]`);

function openSheet() {
  ioText.value = prettyConfig(app.sim.config);
  ioMsg.textContent = '';
  sheet.hidden = false;
  ioText.focus();
  ioText.setSelectionRange(0, 0);
  ioText.scrollTop = 0;
}
function closeSheet() {
  sheet.hidden = true;
  $('io-open').focus();
}
$('io-open').addEventListener('click', openSheet);
$('io-close').addEventListener('click', closeSheet);
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) closeSheet();
});
sheet.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
});
$('io-copy').addEventListener('click', () => {
  const fallback = () => {
    ioText.focus();
    ioText.select();
    ioMsg.textContent = 'Copying is blocked here. The text is selected, so press Ctrl+C or ⌘C.';
  };
  if (!navigator.clipboard?.writeText) return fallback();
  navigator.clipboard.writeText(ioText.value).then(() => (ioMsg.textContent = 'Copied the settings.'), fallback);
});
$('io-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    ioText.value = String(reader.result);
    ioMsg.textContent = `Opened ${file.name}. Press Load settings to start a run with it.`;
  };
  reader.onerror = () => (ioMsg.textContent = `Couldn’t read ${file.name}.`);
  reader.readAsText(file);
  e.target.value = '';
});
$('io-apply').addEventListener('click', () => {
  let config;
  try {
    config = normalizeConfig(JSON.parse(ioText.value));
  } catch (err) {
    ioMsg.textContent = err instanceof SyntaxError
      ? `That isn’t valid JSON: ${err.message}`
      : `Couldn’t load those settings: ${err.message}`;
    return;
  }
  resetSim(config);
  scheduleSave();
  closeSheet();
});

// ---- Keyboard ----

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || !sheet.hidden) return;
  if (e.target.closest?.('input, select, textarea, button, summary, [role="tab"], [tabindex]')) return;
  if (e.key === ' ') {
    e.preventDefault();
    setRunning(!app.running);
  } else if (e.key === '.') {
    stepOnce();
  } else if (e.key === 'r' || e.key === 'R') {
    resetSim();
  } else if (e.key === '+' || e.key === '=') {
    camera.zoomStep(1);
    showZoom();
  } else if (e.key === '-') {
    camera.zoomStep(-1);
    showZoom();
  } else if (e.key === '0') {
    camera.fit();
    showZoom();
  }
});

// ---- Loop ----

let last = performance.now();
let backlog = 0;
let lastUi = 0;
let windowStart = last;
let windowSteps = 0;

// Ticks run in short slices with room between them, not all at once inside a frame. Drawing and the pointer stay
// responsive at any speed, and whatever time is left over goes on more ticks. A browser may hold back the next frame for
// a long while after one that ran long, so frames themselves have to stay short.
const SLICE_MS = 8;
// If frames stop coming, as when the page isn't showing, the ticks stop too.
const FRAMES_GONE_MS = 100;
// When it can't keep up, it catches up on at most this many seconds' worth of ticks.
const MOST_BEHIND = 0.25;
const slices = new MessageChannel();
let lastFrame = last;
let sliceQueued = false;

function runSlice() {
  const sliceEnd = performance.now() + SLICE_MS;
  while (backlog >= 1 && app.running) {
    app.sim.step();
    backlog -= 1;
    windowSteps++;
    if (performance.now() > sliceEnd) break;
  }
  if (backlog >= 1 && app.running && !sliceQueued && performance.now() - lastFrame < FRAMES_GONE_MS) {
    sliceQueued = true;
    slices.port2.postMessage(0);
  }
}
slices.port1.onmessage = () => {
  sliceQueued = false;
  runSlice();
};

function frame(now) {
  const dt = Math.min(250, now - last);
  last = now;
  lastFrame = performance.now();
  if (app.running) {
    const ticks = SPEEDS[view.speed];
    backlog = Math.min(backlog + (dt / 1000) * ticks, ticks * MOST_BEHIND);
    runSlice();
  } else {
    backlog = 0;
  }
  if (gesture?.kind === 'paint' && pointer?.inside && view.tool.startsWith('energy')) paintAt(pointer);
  if (view.tab === 'compounds') compoundsView.frame(now, dt);
  renderer.draw(app.sim, view, camera);
  renderer.drawBonds(app.sim.world, camera);
  if (view.pressure && app.sim.energyRules) renderer.drawPressure(app.sim.pressure, app.sim.world, camera);
  let overSite = false;
  if (view.tool === 'seed') {
    const marks = siteMarks();
    const hover = pointer && (gesture?.kind === 'site'
      ? marks.find((m) => m.k === gesture.k && m.i === gesture.i)
      : siteAt(pointer.px, pointer.py, marks));
    if (hover) hover.hot = overSite = true;
    renderer.drawSites(marks, camera);
  }
  stage.classList.toggle('on-site', overSite);
  if (pointer?.inside && !overSite) {
    const brushRadius = {
      inspect: () => null,
      seed: () => radiusFor(view.seedCount),
      compound: () => layoutOf(compoundById(view.compound), app.compoundValue(view.compound)).reach,
    }[view.tool];
    const radius = brushRadius ? brushRadius() : view.size;
    renderer.drawCursor({ x: pointer.x, y: pointer.y, radius }, camera);
  }
  if (now - windowStart >= 1000) {
    measuredTps = (windowSteps * 1000) / (now - windowStart);
    windowSteps = 0;
    windowStart = now;
    keepChartSpan();
  }
  if (now - lastUi >= 200) {
    lastUi = now;
    refreshUi();
  }
  requestAnimationFrame(frame);
}

rebuildPanels();
showTab(view.tab);
setTool(view.tool);
setRunning(app.running);
showSpeed();
syncCamera();
refreshUi();
requestAnimationFrame(frame);
