// Reusable interactive widgets: slider row, segmented row, toggle row. Each returns { el, set(value) } and calls onChange(value).
import { h, fromHtml, U } from './dom.js';
import { glyph } from './icons.js';

/**
 * Horizontal slider row (0..1). Keyboard/gamepad: left/right through `mk-adjust`. Pointer: drag the track.
 * @param {{ label: string, icon?: string, value: number, step?: number, onChange: (v: number) => void }} o
 * @returns {{ el: HTMLElement, set: (v: number) => void }}
 */
export function sliderRow({ label, icon = 'volume', value, step = 0.05, onChange }) {
  const fill = h('div.slider-fill'); const knob = h('div.slider-knob');
  const track = h('div.slider-track', null, fill, knob);
  const val = h('div.row-v', { text: '' });
  const el = h('div.row', { data: { nav: '', adjust: '' }, attrs: { role: 'slider', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100 } },
    h('div.row-l', null, fromHtml(glyph(icon)), h('span', { text: label })), track, val);
  let v = value;
  const paint = () => { track.style.setProperty('--v', v.toFixed(3)); val.textContent = `${Math.round(v * 100)}`; el.setAttribute('aria-valuenow', Math.round(v * 100)); };
  const apply = (nv, emit = true) => { nv = Math.min(1, Math.max(0, Math.round(nv / 0.01) * 0.01)); if (nv === v) return; v = nv; paint(); if (emit) onChange(v); };
  el.addEventListener('mk-adjust', (e) => apply(v + e.detail.dir * step));
  const fromX = (x) => { const r = track.getBoundingClientRect(); apply((x - r.left) / Math.max(1, r.width)); };
  track.addEventListener('pointerdown', (e) => { track.classList.add('drag'); track.setPointerCapture?.(e.pointerId); fromX(e.clientX); });
  track.addEventListener('pointermove', (e) => { if (track.classList.contains('drag')) fromX(e.clientX); });
  const end = () => track.classList.remove('drag');
  track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end);
  paint();
  return { el, set(nv) { v = nv; paint(); } };
}

/**
 * Segmented choice row. Left/right cycles; Enter cycles; clicking a segment picks it.
 * @param {{ label: string, icon?: string, options: {id: any, label: string}[], value: any, onChange: (id: any) => void }} o
 * @returns {{ el: HTMLElement, set: (id: any) => void }}
 */
export function segRow({ label, icon = 'gear', options, value, onChange }) {
  const btns = options.map((o) => h('button', { attrs: { type: 'button', tabindex: -1 }, data: { id: o.id }, text: o.label }));
  const seg = h('div.seg', null, ...btns);
  const el = h('div.row', { data: { nav: '', adjust: '', sfx: 'ui-click' } }, h('div.row-l', null, fromHtml(glyph(icon)), h('span', { text: label })), seg);
  let cur = value;
  const paint = () => btns.forEach((b, i) => b.classList.toggle('on', options[i].id === cur));
  const pick = (id) => { if (id === cur) return; cur = id; paint(); onChange(cur); };
  const idx = () => Math.max(0, options.findIndex((o) => o.id === cur));
  el.addEventListener('mk-adjust', (e) => pick(options[Math.min(options.length - 1, Math.max(0, idx() + e.detail.dir))].id));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { pick(options[btns.indexOf(b)].id); return; }
    pick(options[(idx() + 1) % options.length].id);
  });
  paint();
  return { el, set(id) { cur = id; paint(); } };
}

/**
 * On/off switch row.
 * @param {{ label: string, icon?: string, value: boolean, onChange: (on: boolean) => void }} o
 * @returns {{ el: HTMLElement, set: (on: boolean) => void }}
 */
export function toggleRow({ label, icon = 'pad', value, onChange }) {
  const sw = h('div.toggle');
  const stateTxt = h('span.row-v', { style: { flex: '0 0 auto', minWidth: U(34) } });
  const el = h('div.row', { data: { nav: '', adjust: '', sfx: 'ui-click' }, attrs: { role: 'switch' } }, h('div.row-l', null, fromHtml(glyph(icon)), h('span', { text: label })), stateTxt, sw);
  let on = !!value;
  const paint = () => { sw.classList.toggle('on', on); stateTxt.textContent = on ? 'ON' : 'OFF'; el.setAttribute('aria-checked', String(on)); };
  const set = (nv, emit = true) => { if (nv === on) return; on = nv; paint(); if (emit) onChange(on); };
  el.addEventListener('mk-adjust', (e) => set(e.detail.dir > 0));
  el.addEventListener('click', () => set(!on));
  paint();
  return { el, set(nv) { on = !!nv; paint(); } };
}
