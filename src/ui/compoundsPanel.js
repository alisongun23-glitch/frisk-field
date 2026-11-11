import { COMPOUNDS, compoundWorld } from '../compounds.js';
import { Simulation } from '../sim.js';
import { Renderer } from '../render.js';
import { Camera } from './camera.js';
import { el, fmtInt } from './dom.js';

const PREVIEW_LOOK = { colorBy: 'class', overlay: true };
// Most of a frame a preview may spend on ticks, so that several can run beside the real world.
const PREVIEW_BUDGET_MS = 3;
// How long a finished preview stays up before it starts over.
const PREVIEW_HOLD_MS = 2500;
const STILL = matchMedia('(prefers-reduced-motion: reduce)').matches;

// A small world of its own, running on the card, so you can see what a compound does before using it. Each time around it
// gets a new seed.
class Preview {
  constructor(compound, canvas) {
    this.compound = compound;
    this.canvas = canvas;
    this.camera = new Camera();
    this.renderer = new Renderer(canvas);
    this.sim = null;
    this.value = compound.input?.def;
    this.seed = 1;
    this.backlog = 0;
    this.holdUntil = 0;
    this.drawn = false;
  }

  restart(value = this.value) {
    this.value = value;
    this.sim = new Simulation(compoundWorld(this.compound, this.compound.preview, this.seed, value));
    this.backlog = 0;
    this.holdUntil = 0;
    this.drawn = false;
  }

  frame(now, dt) {
    if (!this.sim) this.restart();
    const { ticks, speed, hold = PREVIEW_HOLD_MS } = this.compound.preview;
    let changed = !this.drawn;
    if (!STILL) {
      if (this.sim.tick >= ticks) {
        if (this.holdUntil === 0) this.holdUntil = now + hold;
        else if (now >= this.holdUntil) {
          this.seed++;
          this.restart();
          changed = true;
        }
      } else {
        this.backlog = Math.min(this.backlog + (dt / 1000) * speed, speed / 4);
        const end = performance.now() + PREVIEW_BUDGET_MS;
        while (this.backlog >= 1 && this.sim.tick < ticks) {
          this.sim.step();
          this.backlog--;
          changed = true;
          if (performance.now() > end) break;
        }
      }
    }
    if (changed) this.draw();
  }

  draw() {
    const { world } = this.sim;
    const { canvas, camera, renderer } = this;
    camera.setWorld(world.width, world.height);
    camera.setView(canvas.clientWidth || 300, canvas.clientHeight || 200, window.devicePixelRatio || 1);
    renderer.draw(this.sim, PREVIEW_LOOK, camera);
    renderer.drawBonds(world, camera);
    renderer.drawPressure(this.sim.pressure, world, camera);
    this.drawn = true;
  }
}

// The Compounds tab: one card for each, with a live preview, what it does, and ways to use it.
export function buildCompoundsPanel(host, app) {
  const visible = new Set();
  const previews = new Map();
  const spawnButtons = new Map();
  const seen = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const preview = previews.get(entry.target);
      if (entry.isIntersecting) visible.add(preview);
      else visible.delete(preview);
    }
  }) : null;

  const placedNote = el('p', { class: 'field-hint', role: 'status' });
  const forget = el('button', {
    type: 'button', class: 'btn', text: 'Forget them',
    onclick: () => app.forgetCompounds(),
  });
  const placedRow = el('div', { class: 'row-actions' }, forget, placedNote);
  const back = el('button', {
    type: 'button', class: 'btn', text: 'Back to the world you left',
    title: 'It starts again from the beginning, with all its classes, settings and seeds',
    onclick: () => app.backToLeftWorld(),
  });

  const card = (compound) => {
    const canvas = el('canvas', { class: 'compound-preview', role: 'img', 'aria-label': `${compound.name}, running in a small world` });
    const preview = new Preview(compound, canvas);
    previews.set(canvas, preview);
    if (seen) seen.observe(canvas);
    else visible.add(preview);

    const spawn = el('button', {
      type: 'button', class: 'btn primary', text: 'Spawn',
      title: 'Then click the map to put it in this world',
      onclick: () => app.armCompound(compound.id),
    });
    spawnButtons.set(compound.id, spawn);
    const own = el('button', {
      type: 'button', class: 'btn', text: 'Its own world',
      title: 'Swap this world for an empty one, under the rules it was found with. You can come back to this one afterward.',
      onclick: () => app.openCompound(compound.id),
    });

    let inputRow = null;
    if (compound.input) {
      const { label, min, max, def, describe } = compound.input;
      const id = `compound-${compound.id}-input`;
      const shows = el('output', { class: 'compound-sum', for: id, text: describe(app.compoundValue(compound.id)) });
      const box = el('input', { type: 'number', id, min, max, step: 1, value: app.compoundValue(compound.id) ?? def });
      box.addEventListener('change', () => {
        // 0 is a value like any other here: only an empty or unreadable box falls back to the default.
        const typed = box.value.trim() === '' ? NaN : Math.round(Number(box.value));
        const value = Math.min(max, Math.max(min, Number.isFinite(typed) ? typed : def));
        box.value = value;
        shows.textContent = describe(value);
        app.setCompoundValue(compound.id, value);
        preview.restart(value);
      });
      preview.value = app.compoundValue(compound.id);
      inputRow = el('label', { class: 'inline compound-input', for: id }, label, box, shows);
    }

    const rulesRow = compound.needsRules ? el('p', { class: 'field-hint' },
      'Needs its own rules to do this. ',
      el('button', {
        type: 'button', class: 'link-btn', text: 'Use them in this world',
        title: 'Changes this world’s settings to the ones this compound needs',
        onclick: () => app.useCompoundRules(compound.id),
      })) : null;

    return el('article', { class: 'compound-card', 'aria-label': compound.name },
      canvas,
      el('h3', { class: 'compound-name', text: compound.name }),
      el('p', { class: 'compound-blurb', text: compound.blurb }),
      inputRow,
      el('details', { class: 'compound-why' }, el('summary', { text: compound.kind ? 'How it works' : 'Why it does this' }), el('p', { class: 'field-hint', text: compound.math })),
      rulesRow,
      el('div', { class: 'row-actions' }, spawn, own));
  };

  const proteins = COMPOUNDS.filter((c) => c.kind === 'protein');
  const processes = COMPOUNDS.filter((c) => c.kind === 'process');
  const mixtures = COMPOUNDS.filter((c) => !c.kind);
  host.replaceChildren(
    el('section', { class: 'group', 'aria-labelledby': 'compounds-proteins' },
      el('h3', { class: 'group-title', id: 'compounds-proteins', text: 'Proteins' }),
      el('p', { class: 'field-hint', text: 'Little machines found in this world, meant as building blocks. The Replicator makes copies of itself out of loose parts. Most of the others carry something from one place to another and bond it on there: one parcel, two at once, or a cargo of three crates. The Lock holds a parcel back until a key arrives, and the same key frees a driver from a garage but not from a decoy. Spawn one and click the map to put it in this world along with everything it works with, or give it a world of its own. Its classes are added if this world doesn’t have them.' }),
      back,
      placedRow),
    ...proteins.map(card),
    el('section', { class: 'group', 'aria-labelledby': 'compounds-processes' },
      el('h3', { class: 'group-title', id: 'compounds-processes', text: 'Processes' }),
      el('p', { class: 'field-hint', text: 'Proteins put together into something bigger. In the Depot loop the same drivers make every trip: each one drops its load at the dock and comes back to the depot for the next. In the Relay one delivery sets off another: a payload arriving at a gate lets a second driver go. The Relay chain does it twice: the second driver’s delivery opens a second gate, and a third driver takes over.' })),
    ...processes.map(card),
    el('section', { class: 'group', 'aria-labelledby': 'compounds-mixtures' },
      el('h3', { class: 'group-title', id: 'compounds-mixtures', text: 'Compounds' }),
      el('p', { class: 'field-hint', text: 'Small arrangements of classes that do something worth watching, found by running the simulator. They’re used the same way.' })),
    ...mixtures.map(card),
  );

  const self = {
    // Run the previews that can be seen.
    frame(now, dt) {
      for (const preview of visible) preview.frame(now, dt);
    },
    // Show which compound is armed and how many are placed.
    refresh() {
      const { sim } = app;
      const armed = app.armedCompound();
      for (const [id, button] of spawnButtons) {
        button.disabled = !sim.energyRules;
        button.classList.toggle('armed', armed === id);
        button.textContent = armed === id ? 'Click the map' : 'Spawn';
      }
      back.hidden = !app.leftWorld;
      const placed = sim.config.stamps.length;
      placedRow.hidden = placed === 0 && sim.energyRules;
      forget.hidden = placed === 0;
      placedNote.textContent = !sim.energyRules
        ? 'This world uses hand-set matrices. Compounds need energy rules, so Spawn is off until you turn them on in the Rules tab.'
        : `${fmtInt(placed)} placed in this world. Reset brings ${placed === 1 ? 'it' : 'them'} back.`;
    },
  };
  self.refresh();
  return self;
}
