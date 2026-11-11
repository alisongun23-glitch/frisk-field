import { el, compact, fmtInt } from './dom.js';

// Line chart on the dark scope surface: hairline grid, 2px lines, end values where they don't collide,
// and a crosshair that lists every series at the hovered tick (also reachable by keyboard).

const INK = {
  grid: '#18212a',
  axis: '#2c3843',
  label: '#7d8a95',
  value: '#c9d2d9',
  surface: '#0a0f14',
};
const FONT = '500 11px "JetBrains Mono", ui-monospace, Menlo, monospace';

function niceStep(range, count) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

export class LineChart {
  constructor(host, { height = 170, label, format = (v) => fmtInt(v) }) {
    this.host = host;
    this.height = height;
    this.format = format;
    this.canvas = el('canvas', { tabindex: 0, role: 'img', 'aria-label': label });
    this.tip = el('div', { class: 'tooltip', hidden: true });
    host.append(this.canvas, this.tip);
    this.x = [];
    this.series = [];
    this.hover = null;
    this.canvas.addEventListener('pointermove', (e) => this.pointAt(e.clientX));
    this.canvas.addEventListener('pointerleave', () => this.setHover(null));
    this.canvas.addEventListener('blur', () => this.setHover(null));
    this.canvas.addEventListener('focus', () => this.setHover(this.x.length - 1));
    this.canvas.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const last = this.x.length - 1;
      const step = e.shiftKey ? 50 : 5;
      const at = this.hover ?? last;
      this.setHover(Math.max(0, Math.min(last, at + (e.key === 'ArrowLeft' ? -step : step))));
    });
  }

  setData(x, series) {
    this.x = x;
    this.series = series;
    if (this.hover !== null) this.hover = Math.min(this.hover, x.length - 1);
    this.draw();
  }

  setHover(i) {
    this.hover = i;
    this.draw();
  }

  pointAt(clientX) {
    if (!this.layout || this.x.length < 2) return;
    const { left, plotW } = this.layout;
    const rect = this.canvas.getBoundingClientRect();
    const t = (clientX - rect.left - left) / plotW;
    this.setHover(Math.max(0, Math.min(this.x.length - 1, Math.round(t * (this.x.length - 1)))));
  }

  draw() {
    const { canvas, x, series } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = this.host.clientWidth;
    const h = this.height;
    if (w === 0) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = FONT;
    if (x.length < 2) {
      this.tip.hidden = true;
      return;
    }

    let lo = 0;
    let hi = 0;
    for (const s of series) {
      for (const v of s.values) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (hi === lo) hi = lo + 1;
    const step = niceStep(hi - lo, 4);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;

    const yTicks = [];
    for (let v = lo; v <= hi + step / 2; v += step) yTicks.push(v);
    const left = Math.max(...yTicks.map((v) => ctx.measureText(compact(v)).width)) + 14;
    const endLabels = series.length <= 4;
    const right = endLabels ? Math.max(28, ...series.map((s) => ctx.measureText(this.format(s.values.at(-1))).width + 14)) : 12;
    const top = 12;
    const bottom = 24;
    const plotW = w - left - right;
    const plotH = h - top - bottom;
    this.layout = { left, plotW };
    const x0 = x[0];
    const span = x.at(-1) - x0 || 1;
    const px = (i) => left + ((x[i] - x0) / span) * plotW;
    const py = (v) => top + (1 - (v - lo) / (hi - lo)) * plotH;

    // Grid and y labels.
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of yTicks) {
      const y = Math.round(py(v)) + 0.5;
      ctx.strokeStyle = v === 0 ? INK.axis : INK.grid;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + plotW, y);
      ctx.stroke();
      ctx.fillStyle = INK.label;
      ctx.fillText(compact(v), left - 8, y);
    }

    // x labels: tick numbers at a clean interval.
    const xStep = niceStep(span, Math.max(2, Math.floor(plotW / 90)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = INK.label;
    for (let t = Math.ceil(x0 / xStep) * xStep; t <= x.at(-1); t += xStep) {
      ctx.fillText(compact(t), left + ((t - x0) / span) * plotW, top + plotH + 8);
    }

    // Lines.
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      s.values.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
      ctx.stroke();
    }

    // End values, skipping any that would collide with one already placed.
    if (endLabels) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK.value;
      const placed = [];
      const ends = series.map((s) => ({ s, y: py(s.values.at(-1)) })).sort((a, b) => a.y - b.y);
      for (const { s, y } of ends) {
        if (placed.some((p) => Math.abs(p - y) < 13)) continue;
        placed.push(y);
        ctx.fillText(this.format(s.values.at(-1)), left + plotW + 8, Math.min(top + plotH, Math.max(top, y)));
      }
    }

    this.drawHover(ctx, px, py, top, plotH, w);
  }

  drawHover(ctx, px, py, top, plotH, w) {
    const i = this.hover;
    if (i === null || i < 0 || i >= this.x.length) {
      this.tip.hidden = true;
      return;
    }
    const cx = Math.round(px(i)) + 0.5;
    ctx.strokeStyle = INK.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx, top + plotH);
    ctx.stroke();
    for (const s of this.series) {
      const cy = py(s.values[i]);
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK.surface;
      ctx.stroke();
    }

    const tip = this.tip;
    tip.replaceChildren(
      el('div', { class: 'tip-head', text: `Tick ${fmtInt(this.x[i])}` }),
      ...this.series.map((s) => el('div', { class: 'tip-row' },
        el('span', { class: 'key', vars: { '--c': s.color } }),
        el('strong', { text: this.format(s.values[i]) }),
        el('span', { class: 'tip-name', text: s.name }))));
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const left = cx + 12 + tw > w ? cx - 12 - tw : cx + 12;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${top}px`;
  }
}
