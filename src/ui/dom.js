// Small DOM helpers shared by the panels.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'vars') for (const [name, value] of Object.entries(v)) node.style.setProperty(name, value);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

export const decimals = (step) => Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));

export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');

export function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return a >= 10 || n === 0 ? `${Math.round(n)}` : n.toFixed(1);
}

export const signed = (n, digits = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;

// A labeled slider with a number box that stay in sync. `spec` marks property names from the spec,
// which are set in the data face so they read as the spec's own identifiers.
export function sliderField({ id, label, hint, min, max, step, value, spec = false, onChange }) {
  const digits = decimals(step);
  const fmt = (v) => Number(v).toFixed(digits);
  const labelEl = el('label', { for: id, id: `${id}-label`, class: spec ? 'field-label spec' : 'field-label', text: label });
  const range = el('input', {
    type: 'range', id: `${id}-range`, min, max, step, value, 'aria-labelledby': `${id}-label`,
  });
  const num = el('input', { type: 'number', id, min, max, step, value: fmt(value), class: 'num' });
  const read = (raw) => {
    const v = Math.min(max, Math.max(min, Number(raw)));
    return Number.isFinite(v) ? Number(v.toFixed(digits)) : null;
  };
  range.addEventListener('input', () => {
    const v = read(range.value);
    num.value = fmt(v);
    onChange(v);
  });
  num.addEventListener('change', () => {
    const v = read(num.value);
    if (v === null) {
      num.value = fmt(range.value);
      return;
    }
    num.value = fmt(v);
    range.value = v;
    onChange(v);
  });
  const field = el('div', { class: 'field' }, labelEl, range, num, hint ? el('p', { class: 'field-hint', text: hint }) : null);
  return {
    el: field,
    set(v) {
      range.value = v;
      num.value = fmt(v);
    },
  };
}

export function toggleField({ id, label, hint, checked, onChange }) {
  const box = el('input', { type: 'checkbox', id, checked });
  box.addEventListener('change', () => onChange(box.checked));
  const field = el('div', { class: 'field toggle' },
    el('label', { class: 'check', for: id }, box, el('span', { text: label })),
    hint ? el('p', { class: 'field-hint', text: hint }) : null);
  return { el: field, set: (v) => (box.checked = v) };
}
