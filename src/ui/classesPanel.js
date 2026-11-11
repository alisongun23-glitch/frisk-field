import {
  TRAIT_BY_KEY, SIDES, ARROWS, MAX_PATTERN, MAX_SITES, MAX_SITE_RADIUS, MAX_COUNT,
  QUIET_WALK, classLimit, fractionOf, cellOf, radiusFor,
} from '../config.js';
import { RANDOM_NEUTRAL_RANGE } from '../random.js';
import { SCREEN } from '../render.js';
import { el, sliderField, toggleField, fmtInt } from './dom.js';

const TRAIT_GROUPS = {
  matrix: [
    ['Movement', ['frisk', 'randomWalk']],
    ['Contact', ['connect', 'stayProb']],
    ['Growth', ['growthProb', 'pattern', 'patternMutation']],
    ['Death', ['deathProb', 'energy']],
    ['Children', ['variance']],
  ],
  energy: [
    ['Charge', ['energy', 'spawns']],
    ['Movement', ['frisk', 'randomWalk']],
    ['Connecting', ['pattern', 'stayProb', 'startProb']],
    ['Death', ['deathProb']],
  ],
};

const SITE_ROWS = 8;

// The 3x3 picker in reading order; 0 is the particle itself.
const PICKER = [8, 1, 2, 7, 0, 3, 6, 5, 4];

// One card per class with every property from the spec. Returns an updater for the live counts.
export function buildClassesPanel(host, app, openIndex = 0) {
  const { sim } = app;
  host.replaceChildren(randomSection(app));
  const cards = sim.config.classes.map((c, k) => {
    const made = classCard(app, k, k === openIndex);
    host.append(made.card);
    return made;
  });
  const limit = classLimit(sim.config);
  const addButton = el('button', { type: 'button', class: 'btn', text: 'Add class', onclick: () => app.addClass(-1) });
  const addHint = el('p', { class: 'field-hint' });
  const showLimit = () => {
    const full = sim.config.classes.length >= limit;
    addButton.disabled = full;
    addHint.textContent = full ? `${limit} classes is the limit.` : sim.energyRules ? 'New classes appear wherever the grid can pay for them, or place them with the Seeds and Particles brushes.' : 'New classes are placed on Reset, or paint them in with the Particles brush.';
  };
  showLimit();
  const addRow = el('div', { class: 'row-actions' }, addButton, addHint);
  host.append(addRow);
  return {
    // A class a fusion just made, added at the end without disturbing the others.
    addCard(k) {
      const made = classCard(app, k, false);
      cards[k] = made;
      addRow.before(made.card);
      showLimit();
    },
    update() {
      cards.forEach(({ counter }, k) => (counter.textContent = `${fmtInt(sim.world.counts[k] ?? 0)} alive`));
    },
    // The Seeds brush changed a class's locations on the map.
    showSites(k) {
      if (!cards[k]) return;
      cards[k].card.open = true;
      cards[k].refreshSites();
    },
    // The map changed size, and locations are shown in cells.
    refreshSites() {
      cards.forEach((c) => c.refreshSites());
    },
  };
}

function randomSection(app) {
  const options = app.randomOptions;
  const count = sliderField({
    id: 'rnd-count', label: 'How many classes', min: 2, max: classLimit(app.sim.config), step: 1, value: Math.min(options.count, classLimit(app.sim.config)),
    onChange: (v) => {
      options.count = v;
      app.saveSoon();
    },
  });
  const chance = app.sim.config.rules === 'energy' ? null : sliderField({
    id: 'rnd-chance', label: 'Chance each condition is on', min: 0, max: 1, step: 0.05, value: options.chance,
    hint: 'How often a pair of classes starts with its Growth_Condition or Death_Condition cell filled.',
    onChange: (v) => {
      options.chance = v;
      app.saveSoon();
    },
  });
  const seeds = sliderField({
    id: 'rnd-seeds', label: 'Seeds on the map', min: 0, max: MAX_SITES, step: 10, value: options.seeds,
    hint: 'How many random spots things start from. 0 scatters each class evenly over the whole map instead.',
    onChange: (v) => {
      options.seeds = v;
      app.saveSoon();
    },
  });
  const size = sliderField({
    id: 'rnd-size', label: 'Particles per seed', min: 1, max: 200, step: 1, value: options.size,
    onChange: (v) => {
      options.size = v;
      app.saveSoon();
    },
  });
  const fastest = app.sim.config.rules === 'energy' ? null : sliderField({
    id: 'rnd-fastest', label: 'Fastest growth', min: 0.01, max: 1, step: 0.01, value: options.fastestGrowth,
    hint: 'Random Growth_Prob values stay below this. Lower it for seeds that take their time, raise it to fill the map within seconds.',
    onChange: (v) => {
      options.fastestGrowth = v;
      app.saveSoon();
    },
  });
  const ownValues = toggleField({
    id: 'rnd-own', label: 'Every seed rolls its own values', checked: options.ownValues,
    hint: 'On: each seed starts with its own random values, and joins the class closest to its Energy_level. Spawns from energy still use the class values. Off: seeds of a class start identical.',
    onChange: (v) => {
      options.ownValues = v;
      app.saveSoon();
    },
  });
  const individuals = toggleField({
    id: 'rnd-individuals', label: 'Every particle rolls its own values', checked: app.sim.config.individuals,
    hint: 'Each particle placed gets its own random values, even within a seed. Spawns from energy still use the class values.',
    onChange: (v) => {
      app.sim.config.individuals = v;
      app.edited();
    },
  });
  const scattered = el('p', { class: 'field-hint', role: 'status' });
  return el('section', { class: 'group random-box', 'aria-labelledby': 'rnd-title' },
    el('h3', { class: 'group-title', id: 'rnd-title', text: 'Random classes' }),
    el('p', { class: 'field-hint', text: app.sim.config.rules === 'energy'
      ? `Spawn random replaces the current classes with new ones, with random values for every property and random places to start. RandomWalk stays at ${QUIET_WALK.toFixed(2)} or less, so that charges decide where things go. Neutral range goes up to at least ${RANDOM_NEUTRAL_RANGE}, since random levels rarely add up to much closer to 0 than that. Other settings stay as they are.`
      : 'Spawn random replaces the current classes and rules with new ones, with random values for every property, random tendencies and conditions, and random places to start. World settings stay as they are.' }),
    count.el, chance?.el, seeds.el, size.el, fastest?.el, ownValues.el, individuals.el,
    el('div', { class: 'row-actions' },
      el('button', { type: 'button', class: 'btn primary', text: 'Spawn random classes', onclick: () => app.randomize() }),
      el('button', {
        type: 'button', class: 'btn', text: 'Scatter seeds now', title: 'Add this many more seeds to the world as it is, using the current classes',
        onclick: () => {
          const placed = app.scatterSeeds();
          scattered.textContent = `Scattered ${fmtInt(options.seeds)} seeds, ${fmtInt(placed)} particles placed.${app.sim.full ? ' The world is at its particle limit, so the rest wait for Reset.' : ''}`;
        },
      })),
    scattered);
}

// A class's card. Its contents are only built when it's first opened, so a long list of classes stays quick.
function classCard(app, k, open) {
  const { sim } = app;
  const c = sim.config.classes[k];
  const swatch = el('span', { class: 'swatch', vars: { '--c': c.color } });
  const title = el('span', { class: 'class-title', text: c.name });
  const counter = el('span', { class: 'alive', text: `${fmtInt(sim.world.counts[k])} alive` });
  const summary = el('summary', {}, swatch, title, counter);
  const card = el('details', { class: 'class-card', open }, summary);
  let sites = null;
  const build = () => {
    if (sites) return;
    sites = sitesEditor(app, k);
    card.append(el('div', { class: 'class-body' }, ...classBody(app, k, { swatch, title }), sites.el));
  };
  if (open) build();
  card.addEventListener('toggle', () => {
    if (card.open) build();
  });
  return { card, counter, refreshSites: () => sites?.render() };
}

function classBody(app, k, { swatch, title }) {
  const { sim } = app;
  const c = sim.config.classes[k];
  const pattern = patternEditor(app, k);

  const name = el('input', { type: 'text', id: `c${k}-name`, value: c.name, maxlength: 24, autocomplete: 'off' });
  name.addEventListener('input', () => {
    sim.setClassMeta(k, { name: name.value });
    title.textContent = sim.config.classes[k].name;
    app.classesRenamed();
    app.edited();
  });
  const color = el('input', { type: 'color', id: `c${k}-color`, value: c.color });
  color.addEventListener('input', () => {
    sim.setClassMeta(k, { color: color.value });
    swatch.style.setProperty('--c', color.value);
    pattern.refresh();
    app.classesRenamed();
    app.edited();
  });
  const initial = el('input', { type: 'number', id: `c${k}-count`, min: 0, max: MAX_COUNT, step: 10, value: c.count });
  initial.addEventListener('change', () => {
    sim.setClassMeta(k, { count: initial.value });
    initial.value = sim.config.classes[k].count;
    app.edited();
  });

  const meta = el('div', { class: 'class-meta' },
    el('label', { class: 'mini', for: `c${k}-name` }, el('span', { text: 'Name' }), name),
    el('label', { class: 'mini', for: `c${k}-color` }, el('span', { text: 'Color' }), color),
    el('label', { class: 'mini', for: `c${k}-count` }, el('span', { text: 'Scattered on Reset' }), initial));

  const spawns = toggleField({
    id: `c${k}-spawns`, label: 'Spawns from energy', checked: c.spawns,
    hint: 'Off: it only comes from seeds, brushes and fusion. Classes a fusion makes start with this off.',
    onChange: (v) => {
      sim.setClassMeta(k, { spawns: v });
      app.edited();
    },
  });
  const special = { pattern: pattern.el, spawns: spawns.el };
  const groups = TRAIT_GROUPS[sim.config.rules].map(([heading, keys]) => el('div', { class: 'trait-group' },
    el('h4', { class: 'trait-heading', text: heading }),
    keys.map((key) => special[key] ?? traitSlider(app, k, key))));

  const actions = el('div', { class: 'row-actions' });
  const renderActions = (confirming) => {
    actions.replaceChildren();
    if (confirming) {
      actions.append(
        el('button', { type: 'button', class: 'btn danger', text: `Delete ${sim.config.classes[k].name}`, onclick: () => app.removeClass(k) }),
        el('button', { type: 'button', class: 'btn', text: 'Keep it', onclick: () => renderActions(false) }),
        el('p', { class: 'field-hint', text: 'Its particles vanish without releasing energy.' }));
      return;
    }
    actions.append(
      el('button', {
        type: 'button', class: 'btn', text: 'Duplicate', disabled: sim.config.classes.length >= classLimit(sim.config),
        onclick: () => app.addClass(k),
      }),
      el('button', {
        type: 'button', class: 'btn', text: 'Delete', disabled: sim.config.classes.length <= 1,
        onclick: () => renderActions(true),
      }));
  };
  renderActions(false);
  return [meta, ...groups, actions];
}

// A class's seed locations: where on the map its particles start, each with its own radius and count.
function sitesEditor(app, k) {
  const { sim } = app;
  const list = el('div', { class: 'site-list' });
  const add = el('button', { type: 'button', class: 'btn', text: 'Add location' });
  const clear = el('button', { type: 'button', class: 'btn', text: 'Clear all', onclick: () => commit([]) });
  const commit = (next) => {
    sim.setClassSites(k, next);
    app.edited();
    render();
  };
  const sites = () => sim.config.classes[k].sites;
  const edit = (i, patch) => commit(sites().map((s, j) => (j === i ? { ...s, ...patch } : s)));

  function number(label, value, min, max, onChange) {
    const input = el('input', { type: 'number', min, max, step: 1, value, 'aria-label': label });
    input.addEventListener('change', () => onChange(Number(input.value)));
    return input;
  }

  function render() {
    const { width: W, height: H } = sim.world;
    // A class can hold hundreds of locations; only the first few are worth a row each.
    const rows = sites().slice(0, SITE_ROWS).map((s, i) => {
      const name = `Location ${i + 1}`;
      return el('div', { class: 'site-row' },
        number(`${name} x`, cellOf(s.x, W), 0, W - 1, (v) => edit(i, { x: fractionOf(v, W) })),
        number(`${name} y`, cellOf(s.y, H), 0, H - 1, (v) => edit(i, { y: fractionOf(v, H) })),
        number(`${name} radius`, s.radius, 0, MAX_SITE_RADIUS, (v) => edit(i, { radius: v })),
        number(`${name} particles`, s.count, 0, MAX_COUNT, (v) => edit(i, { count: v })),
        el('button', {
          type: 'button', class: 'site-remove', text: '×', title: `Remove ${name.toLowerCase()}`, 'aria-label': `Remove ${name.toLowerCase()}`,
          onclick: () => commit(sites().filter((_, j) => j !== i)),
        }));
    });
    const more = sites().length - rows.length;
    list.replaceChildren(...(rows.length > 0
      ? [el('div', { class: 'site-row site-head', 'aria-hidden': 'true' },
        el('span', { text: 'X' }), el('span', { text: 'Y' }), el('span', { text: 'Radius' }), el('span', { text: 'Particles' }), el('span')), ...rows]
      : [el('p', { class: 'field-hint', text: 'No specific locations yet.' })]));
    if (more > 0) list.append(el('p', { class: 'field-hint', text: `And ${fmtInt(more)} more. The Seeds brush shows them all on the map.` }));
    add.disabled = sites().length >= MAX_SITES;
    clear.disabled = sites().length === 0;
  }

  add.addEventListener('click', () => {
    const count = 400;
    commit([...sites(), { x: 0.25 + Math.random() / 2, y: 0.25 + Math.random() / 2, radius: radiusFor(count), count }]);
  });
  render();
  return {
    render,
    el: el('div', { class: 'trait-group' },
      el('h4', { class: 'trait-heading', text: 'Seed locations' }),
      list,
      el('div', { class: 'row-actions' }, add, clear),
      el('p', { class: 'field-hint', text: 'Placed on Reset, on top of any scattered count. Or pick the Seeds brush and click the map to place one now.' })),
  };
}

function traitSlider(app, k, key) {
  const def = TRAIT_BY_KEY[key];
  const value = app.sim.config.classes[k].traits[key];
  // Only a class that fusion took past the end gets the wider range.
  const wide = def.wide && Math.abs(value) > def.max;
  return sliderField({
    id: `c${k}-${key}`,
    label: def.label,
    hint: (app.sim.config.rules === 'energy' && def.energyHint) || def.hint,
    min: wide ? -def.wide : def.min,
    max: wide ? def.wide : def.max,
    step: def.step,
    value,
    spec: true,
    onChange: (v) => {
      app.sim.setClassTrait(k, key, v);
      app.edited();
    },
  }).el;
}

// The cells a chain occupies as it follows the pattern, stopping where its next step lands on itself.
export function tracePattern(pattern, limit) {
  const cells = [[0, 0]];
  const used = new Set(['0,0']);
  let x = 0;
  let y = 0;
  for (let i = 0; i < limit; i++) {
    const side = SIDES[pattern[i % pattern.length] - 1];
    x += side.dx;
    y += side.dy;
    const key = `${x},${y}`;
    if (used.has(key)) break;
    used.add(key);
    cells.push([x, y]);
  }
  return cells;
}

// Energy rules: the particle in the middle with its pattern's sides numbered in the order partners dock on them.
function drawSides(ctx, size, pattern, color) {
  const cell = size / 3;
  const gap = 3;
  ctx.fillStyle = color;
  ctx.fillRect(cell + gap, cell + gap, cell - gap * 2, cell - gap * 2);
  ctx.font = '500 13px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const seen = new Set();
  pattern.forEach((side) => {
    if (seen.has(side)) return;
    const { dx, dy } = SIDES[side - 1];
    const x = cell * (dx + 1);
    const y = cell * (dy + 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + gap + 0.5, y + gap + 0.5, cell - gap * 2 - 1, cell - gap * 2 - 1);
    ctx.fillStyle = '#e5eaee';
    ctx.fillText(String(seen.size + 1), x + cell / 2, y + cell / 2 + 1);
    seen.add(side);
  });
}

function drawPreview(canvas, pattern, color, sides) {
  const size = 96;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = SCREEN;
  ctx.fillRect(0, 0, size, size);
  if (sides) {
    drawSides(ctx, size, pattern, color);
    return;
  }

  // About three cycles: enough to show the repeat while keeping the cells large enough to read.
  const cells = tracePattern(pattern, Math.max(12, pattern.length * 3));
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX + 1;
  const h = Math.max(...ys) - minY + 1;
  const cell = Math.max(2, Math.min(12, Math.floor((size - 8) / Math.max(w, h))));
  const left = (size - w * cell) / 2;
  const top = (size - h * cell) / 2;
  const gap = cell >= 5 ? 1 : 0;
  ctx.fillStyle = color;
  for (const [x, y] of cells) {
    ctx.fillRect(left + (x - minX) * cell, top + (y - minY) * cell, cell - gap, cell - gap);
  }
  // Mark where the chain starts.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(left - minX * cell, top - minY * cell, cell - gap, cell - gap);
}

// Set one step of a pattern. A growth pattern can repeat itself, but a side can only hold one partner, so under energy
// rules a side already in the list trades places with the step instead.
function withSide(pattern, step, side, energyRules) {
  return pattern.map((s, i) => {
    if (i === step) return side;
    return energyRules && s === side ? pattern[step] : s;
  });
}

// Edit a class's growth pattern: a row of up to 6 steps, a picker for the selected step, and a preview of
// the shape a growing chain traces.
function patternEditor(app, k) {
  const { sim } = app;
  const labelId = `c${k}-pattern-label`;
  const pattern = () => sim.config.classes[k].traits.growthPattern;
  let selected = 0;

  const commit = (next) => {
    sim.setClassPattern(k, next);
    app.edited();
    render();
  };

  const steps = el('div', { class: 'pattern-steps', role: 'group', 'aria-labelledby': labelId });
  const preview = el('canvas', { class: 'pattern-preview', role: 'img' });
  const core = el('span', { class: 'core', 'aria-hidden': 'true' });
  const pickerButtons = [];
  const picker = el('div', { class: 'sides', role: 'group', 'aria-label': 'Side for the selected step' },
    PICKER.map((n) => {
      if (n === 0) return core;
      const b = el('button', {
        type: 'button',
        'data-side': n,
        'aria-label': `Side ${n} (${SIDES[n - 1].name})`,
        title: `Side ${n} (${SIDES[n - 1].name})`,
        text: ARROWS[n - 1],
        onclick: () => commit(withSide(pattern(), selected, n, sim.energyRules)),
      });
      pickerButtons.push(b);
      return b;
    }));
  const remove = el('button', {
    type: 'button',
    class: 'btn',
    onclick: () => commit(pattern().filter((_, i) => i !== selected)),
  });

  function render(focusStep = false) {
    const current = pattern();
    selected = Math.min(selected, current.length - 1);
    const color = sim.config.classes[k].color;
    const stepButtons = current.map((side, i) => el('button', {
      type: 'button',
      class: 'step',
      'aria-pressed': String(i === selected),
      'aria-label': `Step ${i + 1}: side ${side} (${SIDES[side - 1].name})`,
      title: `Step ${i + 1}: side ${side} (${SIDES[side - 1].name})`,
      onclick: () => {
        selected = i;
        render(true);
      },
    }, el('span', { class: 'step-n', text: String(i + 1) }), el('span', { class: 'step-arrow', text: ARROWS[side - 1] })));
    steps.replaceChildren(...stepButtons);
    if (current.length < MAX_PATTERN) {
      steps.append(el('button', {
        type: 'button',
        class: 'step add',
        'aria-label': 'Add a step',
        title: 'Add a step',
        text: '+',
        onclick: () => {
          selected = current.length;
          commit([...current, sim.energyRules ? SIDES.find((s) => !current.includes(s.n)).n : current[current.length - 1]]);
          steps.querySelector('[aria-pressed="true"]')?.focus();
        },
      }));
    }
    if (focusStep) stepButtons[selected].focus();
    for (const b of pickerButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.side) === current[selected]));
    core.style.setProperty('--c', color);
    remove.textContent = `Remove step ${selected + 1}`;
    remove.disabled = current.length <= 1;
    const energy = sim.config.rules === 'energy';
    preview.setAttribute('aria-label', `${energy ? 'Sides partners dock on, in order' : 'Shape a growing chain traces'}: ${current.map((side) => SIDES[side - 1].name).join(', ')}`);
    drawPreview(preview, current, color, energy);
  }
  render();

  return {
    el: el('div', { class: 'field pattern-field' },
      el('span', { class: 'field-label spec', id: labelId, text: sim.config.rules === 'energy' ? 'Connection pattern' : 'Growth_Direction pattern' }),
      steps,
      el('div', { class: 'pattern-edit' }, picker, preview),
      el('div', { class: 'row-actions' }, remove),
      el('p', { class: 'field-hint', text: sim.config.rules === 'energy'
        ? `The sides others must connect on, up to ${MAX_PATTERN}, in order. Particles attracted to this class head for the next open side, so this is also the shape of what forms around it and how many partners it can hold.`
        : `Up to ${MAX_PATTERN} steps, looping. Each generation takes the next step, so a growing chain traces this shape. The preview starts at the white cell and ignores other particles. A blocked step is retried.` })),
    refresh: () => render(),
  };
}
