import { clamp, GLOBALS, MATRIX_CLASSES } from '../config.js';
import { bondEnergy, chargePull } from '../charge.js';
import { refusesBond } from '../bonds.js';
import { el, signed, sliderField, toggleField } from './dom.js';

const BLOCKS = [
  {
    name: 'tendency',
    title: 'Tendency',
    hint: 'How the row class walks relative to the column class: +1 steps toward it, −1 steps away, 0 ignores it. '
      + 'The diagonal is each class’s Same Group Tendency; the other cells are Different Group Tendencies. '
      + 'Drag a cell up or down, or type a value.',
  },
  {
    name: 'growth',
    title: 'Growth_Condition',
    hint: 'A filled cell means the row class grows when it touches the column class. It freezes until it grows.',
  },
  {
    name: 'death',
    title: 'Death_Condition',
    hint: 'A filled cell means the row class dies when it touches the column class. It freezes until it dies.',
  },
];

// The Rules tab: either the settings for energy rules, with what they mean for each pair of classes,
// or the three n x n matrices. Returns an updater for the parts that follow other settings.
export function buildRulesPanel(host, app) {
  const energy = app.sim.config.rules === 'energy';
  const tooMany = app.sim.config.classes.length > MATRIX_CLASSES;
  const mode = toggleField({
    id: 'rules-energy',
    label: 'Energy_level decides the rules',
    checked: energy,
    hint: energy
      ? `Particles want an overall energy of 0, so creation, tendency, bonds and death all follow from energy. ${tooMany ? `The hand-set matrices take at most ${MATRIX_CLASSES} classes, so they aren’t available now.` : 'Turn this off to set things by hand with the matrices and Connect Amount.'}`
      : 'Off: the matrices below and each class’s Connect Amount decide everything. Turn this on to derive them from Energy_level instead.',
    onChange: (v) => app.setRules(v ? 'energy' : 'matrix'),
  });
  if (tooMany) mode.el.querySelector('input').disabled = true;
  const modeGroup = el('section', { class: 'group' }, mode.el);
  if (!energy) {
    host.replaceChildren(modeGroup, ...BLOCKS.map((block) => matrixBlock(app, block)));
    return { update() {} };
  }
  const pairs = pairTable(app);
  host.replaceChildren(modeGroup, ...ENERGY_GROUPS.map((group) => settingsGroup(app, group)), pairs.el);
  return { update: pairs.update };
}

const ENERGY_GROUPS = [
  {
    id: 'charge',
    title: 'Charge rules',
    intro: 'Particles appear where the grid has the energy to create them, and head for what cancels their charge. They connect on the sides a class’s pattern asks for. Bonds between similar levels cost energy and store it, and a bond breaks when one member pulls hard away from the rest. Molecules at about 0 creep toward denser crowds. Deep in a crowd, molecules are crushed into free particles, and deeper still those fuse in pairs.',
  },
  {
    id: 'overcharge',
    title: 'Past the limit',
    intro: 'Fusion can take a particle past the Stable limit, where it tends to break back into the two it came from. To hold together it needs a molecule that brings it back within the limit, or a cell holding enough opposite charge to cancel it. Until then it’s pulled hard by every opposite charge and won’t bond with its own sign.',
  },
  {
    id: 'pressure',
    title: 'Pressure',
    intro: 'A second field over the whole map. It builds where energy is very low, which is around fusions of positive charge, then spreads out and fades. It pushes particles and molecules away, the way charge draws them in.',
  },
];

function settingsGroup(app, { id, title, intro }) {
  const { sim } = app;
  const onChange = (def) => (v) => {
    sim.setGlobal(def.key, v);
    app.edited();
  };
  const fields = GLOBALS.filter((g) => g.group === id).map((def) => (def.bool
    ? toggleField({ id: `g-${def.key}`, label: def.label, hint: def.hint, checked: sim.config.globals[def.key], onChange: onChange(def) })
    : sliderField({ id: `g-${def.key}`, ...def, value: sim.config.globals[def.key], onChange: onChange(def) })).el);
  return el('section', { class: 'group', 'aria-labelledby': `rules-${id}` },
    el('h3', { class: 'group-title', id: `rules-${id}`, text: title }),
    el('p', { class: 'field-hint', text: intro }),
    fields);
}

// Past this many classes the full table of pairs stops being readable, so it shows one class at a time.
const FULL_TABLE = 12;

// What the charge rules work out to for each pair of classes.
function pairTable(app) {
  const { sim } = app;
  const { classes } = sim.config;
  const body = el('tbody');
  let chosen = 0;
  const cell = (a, b) => {
    const { neutralBand, growthGap, bondCost, stableLimit } = sim.config.globals;
    const ea = classes[a].traits.energy;
    const eb = classes[b].traits.energy;
    const refused = refusesBond(ea, eb, stableLimit);
    if (Math.abs(ea) <= neutralBand || Math.abs(eb) <= neutralBand || refused) {
      return el('td', { 'data-kind': 'off' }, el('span', { class: 'pair-kind', text: 'Won’t connect' }), refused ? el('span', { class: 'pair-pull', text: signed(-1) }) : null);
    }
    const cost = bondEnergy(ea, eb, bondCost, growthGap);
    return el('td', { 'data-kind': cost > 0 ? 'cost' : 'free' },
      el('span', { class: 'pair-kind', text: cost > 0 ? `Costs ${cost.toFixed(1)}` : 'Free' }),
      el('span', { class: 'pair-pull', text: signed(Math.abs(ea) > stableLimit ? 1 : chargePull(ea, eb, growthGap)) }));
  };
  const full = classes.length <= FULL_TABLE;
  const update = () => {
    if (full) {
      body.replaceChildren(...classes.map((rowClass, a) => el('tr', {}, classHeader(rowClass, 'row'), classes.map((_, b) => cell(a, b)))));
    } else {
      body.replaceChildren(...classes.map((other, b) => el('tr', {}, classHeader(other, 'row'), cell(chosen, b))));
    }
  };
  update();
  const picker = el('select', {
    id: 'pair-class', 'aria-label': 'Class to show',
    onchange: (e) => {
      chosen = Number(e.target.value);
      update();
    },
  }, classes.map((c, k) => el('option', { value: k, text: c.name })));
  const head = full
    ? el('tr', {}, el('th', { class: 'corner', scope: 'col' }, el('span', { class: 'axis-note', text: 'row → column' })), classes.map((c) => classHeader(c, 'col')))
    : el('tr', {}, el('th', { scope: 'col', text: 'With' }), el('th', { scope: 'col', text: 'Bond and pull' }));
  return {
    update,
    el: el('section', { class: 'group', 'aria-labelledby': 'rules-pairs' },
      el('h3', { class: 'group-title', id: 'rules-pairs', text: 'What each pair does' }),
      el('p', { class: 'field-hint', text: 'Worked out from each class’s Energy_level. The number is the pull on the first class, from −1 (pushed away) to +1 (drawn in). Costly bonds also pull when the grid can pay for them.' }),
      full ? null : el('label', { class: 'inline', for: 'pair-class' }, 'Class ', picker),
      el('div', { class: 'matrix-scroll' }, el('table', { class: 'matrix pair-table' }, el('thead', {}, head), body))),
  };
}

function classHeader(c, scope) {
  return el('th', { scope, title: c.name },
    el('span', { class: 'th-inner' }, el('span', { class: 'swatch', vars: { '--c': c.color } }), el('span', { class: 'th-name', text: c.name })));
}

function matrixBlock(app, { name, title, hint }) {
  const { classes } = app.sim.config;
  const head = el('tr', {}, el('th', { class: 'corner', scope: 'col' }, el('span', { class: 'axis-note', text: 'row → column' })),
    classes.map((c) => classHeader(c, 'col')));
  const rows = classes.map((rowClass, a) => el('tr', {}, classHeader(rowClass, 'row'),
    classes.map((colClass, b) => el('td', {}, name === 'tendency'
      ? tendencyCell(app, a, b, rowClass, colClass)
      : flagCell(app, name, a, b, rowClass, colClass)))));
  return el('section', { class: 'group', 'aria-labelledby': `rules-${name}` },
    el('h3', { class: 'group-title spec', id: `rules-${name}`, text: title }),
    el('p', { class: 'field-hint', text: hint }),
    el('div', { class: 'matrix-scroll' }, el('table', { class: 'matrix' }, el('thead', {}, head), el('tbody', {}, rows))));
}

function tint(input, v) {
  input.style.setProperty('--v', Math.abs(v).toFixed(2));
  input.dataset.sign = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
}

function tendencyCell(app, a, b, rowClass, colClass) {
  const { sim } = app;
  const value = sim.config.tendency[a][b];
  const input = el('input', {
    type: 'number', class: 'tcell', min: -1, max: 1, step: 0.05, value: value.toFixed(2),
    id: `t-${a}-${b}`,
    'aria-label': `${rowClass.name} toward ${colClass.name}`,
    'data-diag': a === b,
  });
  tint(input, value);
  const commit = (v) => {
    const next = Math.round(clamp(v, -1, 1) * 100) / 100;
    sim.setMatrix('tendency', a, b, next);
    input.value = next.toFixed(2);
    tint(input, next);
    app.edited();
  };
  input.addEventListener('change', () => commit(Number(input.value) || 0));

  // Scrub: drag up to raise, down to lower. A press without movement still focuses the box for typing.
  let start = null;
  input.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = { y: e.clientY, v: sim.config.tendency[a][b], dragging: false, id: e.pointerId };
  });
  input.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dy = start.y - e.clientY;
    if (!start.dragging && Math.abs(dy) < 4) return;
    if (!start.dragging) {
      start.dragging = true;
      input.setPointerCapture(e.pointerId);
      input.classList.add('scrubbing');
    }
    commit(Math.round((start.v + dy / 60) * 20) / 20);
  });
  const end = (e) => {
    if (start?.dragging) {
      e.preventDefault();
      input.classList.remove('scrubbing');
      input.blur();
    }
    start = null;
  };
  input.addEventListener('pointerup', end);
  input.addEventListener('pointercancel', end);
  return input;
}

function flagCell(app, name, a, b, rowClass, colClass) {
  const verb = name === 'growth' ? 'grows' : 'dies';
  const box = el('input', {
    type: 'checkbox', class: `flag ${name}`, id: `${name}-${a}-${b}`,
    checked: Boolean(app.sim.config[name][a][b]),
    'aria-label': `${rowClass.name} ${verb} when touching ${colClass.name}`,
    title: `${rowClass.name} ${verb} when touching ${colClass.name}`,
  });
  box.addEventListener('change', () => {
    app.sim.setMatrix(name, a, b, box.checked);
    app.edited();
  });
  return box;
}
