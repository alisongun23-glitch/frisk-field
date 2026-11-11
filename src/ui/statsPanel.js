import { LineChart } from './chart.js';
import { el, fmtInt, signed } from './dom.js';
import { steadiedBy } from '../overcharge.js';

const EVENT_LABELS = {
  moves: 'Moves',
  contacts: 'Contacts',
  growths: 'Growths',
  connects: 'Bonds formed',
  breaks: 'Bonds broken',
  crushes: 'Molecules crushed',
  fusions: 'Fusions',
  breakups: 'Breakups',
  divisions: 'Divisions',
  deaths: 'Deaths (condition)',
  kills: 'Deaths (field energy)',
  spawns: 'Spawns from energy',
};
const EVENTS_BY_RULES = {
  energy: ['moves', 'connects', 'breaks', 'crushes', 'fusions', 'breakups', 'divisions', 'kills', 'spawns'],
  matrix: ['moves', 'contacts', 'growths', 'deaths', 'kills', 'spawns'],
};
// Field-energy poles: warm for positive, cool for negative.
const POS = '#e66767';
const NEG = '#3987e5';
const LOOKBACK = [100, 500];
const MOLECULE_ROWS = [
  ['On their own', (size) => size === 1],
  ['In molecules of 2', (size) => size === 2],
  ['In molecules of 3', (size) => size === 3],
  ['In molecules of 4 to 8', (size) => size >= 4 && size <= 8],
  ['In molecules of 9 or more', (size) => size >= 9],
];
// A chart can tell only so many lines apart, so past this the smallest classes fold into one.
const CHART_LINES = 8;
const OTHER = '#5c6872';

function populationSeries(config, history) {
  const all = config.classes.map((c, k) => ({ name: c.name, color: c.color, k, values: history.map((h) => h.counts[k]) }));
  if (all.length <= CHART_LINES) return all;
  const biggest = [...all].sort((a, b) => b.values.at(-1) - a.values.at(-1)).slice(0, CHART_LINES).sort((a, b) => a.k - b.k);
  const shown = new Set(biggest.map((s) => s.k));
  const rest = all.length - CHART_LINES;
  const values = history.map((h) => h.counts.reduce((sum, n, k) => (shown.has(k) ? sum : sum + n), 0));
  return [...biggest, { name: `Other ${rest} classes`, color: OTHER, values }];
}

function legendItem(color, name, value) {
  return el('li', {}, el('span', { class: 'key', vars: { '--c': color } }), el('span', { text: name }),
    el('span', { class: 'legend-value', text: value }));
}

// A small "as a table" view so values never depend on hovering the chart. Rows refill only while it's open.
function lookbackTable(caption, peakLabel) {
  const body = el('tbody');
  const details = el('details', { class: 'table-view' },
    el('summary', { text: 'Show as table' }),
    el('div', { class: 'table-scroll' }, el('table', { class: 'data' },
      el('caption', { class: 'sr-only', text: caption }),
      el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: '' }), el('th', { scope: 'col', text: 'Now' }),
        LOOKBACK.map((n) => el('th', { scope: 'col', text: `${n} ticks ago` })), el('th', { scope: 'col', text: peakLabel }))),
      body)));
  let latest = [];
  const fill = () => body.replaceChildren(...latest.map((r) => el('tr', {}, el('th', { scope: 'row', text: r.name }),
    r.cells.map((v) => el('td', { text: v })))));
  details.addEventListener('toggle', () => details.open && fill());
  return {
    el: details,
    set(rows) {
      latest = rows;
      if (details.open) fill();
    },
  };
}

export function buildStatsPanel(host, app) {
  host.replaceChildren();
  const popScope = el('div', { class: 'scope' });
  const popLegend = el('ul', { class: 'legend' });
  const popTable = lookbackTable('Population per class', 'Peak');
  const energyScope = el('div', { class: 'scope' });
  const energyLegend = el('ul', { class: 'legend' });
  const energyTable = lookbackTable('Field energy', 'Extreme');
  const eventsBody = el('tbody');
  const moleculesBody = el('tbody');
  const limitBody = el('tbody');

  host.append(
    el('section', { class: 'group', 'aria-labelledby': 'stats-pop' },
      el('h3', { class: 'group-title', id: 'stats-pop', text: 'Population per class' }), popScope, popLegend, popTable.el),
    el('section', { class: 'group', 'aria-labelledby': 'stats-energy' },
      el('h3', { class: 'group-title', id: 'stats-energy', text: 'Energy in the field' }),
      el('p', { class: 'field-hint', text: 'Total positive and negative energy across all cells.' }),
      energyScope, energyLegend, energyTable.el),
    app.sim.energyRules ? el('section', { class: 'group', 'aria-labelledby': 'stats-molecules' },
      el('h3', { class: 'group-title', id: 'stats-molecules', text: 'Molecules' }),
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'Particles and molecules' }), el('th', { scope: 'col', text: 'Now' }))),
        moleculesBody)) : null,
    app.sim.energyRules ? el('section', { class: 'group', 'aria-labelledby': 'stats-limit' },
      el('h3', { class: 'group-title', id: 'stats-limit', text: 'Past the limit, and pressure' }),
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'Measure' }), el('th', { scope: 'col', text: 'Now' }))),
        limitBody)) : null,
    el('section', { class: 'group', 'aria-labelledby': 'stats-events' },
      el('h3', { class: 'group-title', id: 'stats-events', text: 'Events' }),
      el('table', { class: 'data events' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'Event' }), el('th', { scope: 'col', text: 'Last tick' }),
          el('th', { scope: 'col', text: 'Since reset' }))),
        eventsBody)),
  );

  const pop = new LineChart(popScope, { height: 180, label: 'Population per class over recent ticks' });
  const energy = new LineChart(energyScope, {
    height: 140, label: 'Positive and negative field energy over recent ticks', format: (v) => signed(v, v === 0 || Math.abs(v) >= 100 ? 0 : 1),
  });

  return {
    update() {
      const { sim } = app;
      const { history, config } = sim;
      const ticks = history.map((h) => h.tick);
      // At high speed points are kept only every few ticks, so going back a number of ticks means finding the point there.
      const pointsBack = LOOKBACK.map((n) => {
        let i = history.length - 1;
        while (i > 0 && history[i].tick > sim.tick - n) i--;
        return i;
      });

      const popSeries = populationSeries(config, history);
      pop.setData(ticks, popSeries);
      popLegend.replaceChildren(...popSeries.map((s) => legendItem(s.color, s.name, fmtInt(s.values.at(-1)))));
      popTable.set(popSeries.map((s) => ({
        name: s.name,
        cells: [s.values.at(-1), ...pointsBack.map((i) => s.values[i]), Math.max(...s.values)].map(fmtInt),
      })));

      const energySeries = [
        { name: 'Positive', color: POS, values: history.map((h) => h.pos) },
        { name: 'Negative', color: NEG, values: history.map((h) => h.neg) },
      ];
      energy.setData(ticks, energySeries);
      energyLegend.replaceChildren(...energySeries.map((s) => legendItem(s.color, s.name, signed(s.values.at(-1), 1))));
      energyTable.set([
        { name: 'Positive', cells: [history.at(-1).pos, ...pointsBack.map((i) => history[i].pos), Math.max(...history.map((h) => h.pos))] },
        { name: 'Negative', cells: [history.at(-1).neg, ...pointsBack.map((i) => history[i].neg), Math.min(...history.map((h) => h.neg))] },
      ].map((r) => ({ ...r, cells: r.cells.map((v) => signed(v, 1)) })));

      if (sim.energyRules) {
        const counts = Object.entries(sim.world.census());
        let bonds = 0;
        let stored = 0;
        let neutral = 0;
        for (const mol of sim.world.molecules) {
          if (Math.abs(mol.net) <= sim.world.neutralBand) neutral++;
          for (const m of mol.members) {
            for (const b of m.bonds) {
              if (b.host !== m) continue;
              bonds++;
              stored += b.stored;
            }
          }
        }
        const row = (label, value) => el('tr', {}, el('th', { scope: 'row', text: label }), el('td', { text: value }));
        moleculesBody.replaceChildren(
          ...MOLECULE_ROWS.map(([label, matches]) => row(label, fmtInt(counts.reduce((sum, [size, n]) => sum + (matches(Number(size)) ? n : 0), 0)))),
          row('Molecules, all', fmtInt(sim.world.molecules.length)),
          row('Molecules at about 0', fmtInt(neutral)),
          row('Bonds', fmtInt(bonds)),
          row('Energy stored in bonds', fmtInt(stored)),
        );
        const { stableLimit } = config.globals;
        const held = { molecule: 0, field: 0, none: 0 };
        let heaviest = 0;
        for (const p of sim.world.particles) {
          const size = Math.abs(p.energy);
          if (size <= stableLimit) continue;
          held[steadiedBy(sim, p) ?? 'none']++;
          if (size > heaviest) heaviest = size;
        }
        limitBody.replaceChildren(
          row('Unstable', fmtInt(held.none)),
          row('Steadied by a molecule', fmtInt(held.molecule)),
          row('Steadied by the field', fmtInt(held.field)),
          row('Heaviest level', heaviest > 0 ? `±${heaviest}` : 'None'),
          row('Highest pressure', sim.pressure.highest.toFixed(1)),
        );
      }

      eventsBody.replaceChildren(...EVENTS_BY_RULES[config.rules].map((k) => el('tr', {},
        el('th', { scope: 'row', text: EVENT_LABELS[k] }),
        el('td', { text: fmtInt(sim.events[k]) }),
        el('td', { text: fmtInt(sim.totals[k]) }))));
    },
  };
}
