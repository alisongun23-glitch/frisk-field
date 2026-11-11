import { GLOBALS } from '../config.js';
import { el, sliderField, toggleField } from './dom.js';

const GROUPS = [
  { id: 'energy', title: 'Energy field' },
  { id: 'motion', title: 'Motion and mutation', energyTitle: 'Motion' },
  { id: 'grid', title: 'Grid' },
];

// Global settings. Everything applies live except grid size, which waits for Reset. The settings for
// energy rules live in the Rules tab, beside what they control.
export function buildWorldPanel(host, app) {
  const { sim } = app;
  const { rules } = sim.config;
  host.replaceChildren();
  for (const group of GROUPS) {
    const section = el('section', { class: 'group', 'aria-labelledby': `world-${group.id}` },
      el('h3', { class: 'group-title', id: `world-${group.id}`, text: (rules === 'energy' && group.energyTitle) || group.title }));
    for (const def of GLOBALS.filter((g) => g.group === group.id && (g.rules ?? rules) === rules)) {
      const id = `g-${def.key}`;
      const onChange = (v) => {
        sim.setGlobal(def.key, v);
        app.edited();
      };
      const value = sim.config.globals[def.key];
      const hint = (rules === 'energy' && def.energyHint) || def.hint;
      const field = def.bool
        ? toggleField({ id, label: def.label, hint, checked: value, onChange })
        : sliderField({ id, ...def, hint, value, spec: def.key === 'energyProb', onChange });
      section.append(field.el);
    }
    host.append(section);
  }
}
