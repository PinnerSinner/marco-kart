// Game speed selector ("Mbps", the cc of this game): four buttons plus a one-line caption. Shown on the last step of the select flow
// (difficulty for a Grand Prix, track for a single race or time trial). The choice is saved in the settings and rides on `ui:start { speedClass }`.
import { h } from './dom.js';
import { SPEED_CLASS_IDS, speedClassInfo } from '../core/speedClass.js';

/**
 * @param {import('./UI.js').UI} ui
 * @returns {{ el: HTMLElement, sync: () => void, set: (id: number, silent?: boolean) => void }}
 */
export function createSpeedPick(ui) {
  const btns = SPEED_CLASS_IDS.map((id) => h('button', { attrs: { type: 'button' }, data: { speed: id, nav: '', sfx: 'ui-click' }, text: String(id), on: { click: () => set(id) } }));
  const cap = h('div.sp-cap');
  const el = h('div.speed-pick', null,
    h('div.sp-row', null, h('span.lbl', { text: 'Game speed (Mbps)' }), h('div.seg', null, ...btns)),
    cap);
  let cur = null;
  const paint = () => {
    btns.forEach((b) => b.classList.toggle('on', +b.dataset.speed === cur));
    const info = speedClassInfo(cur);
    cap.replaceChildren(h('b', { text: `${info.name} · ${info.tag}` }), h('span', { text: ` ${info.blurb}` }));
    el.dataset.speed = String(cur);
  };
  function set(id, silent = false) {
    if (!SPEED_CLASS_IDS.includes(id)) return;
    const changed = id !== cur;
    cur = id;
    ui.flow?.pick('speedClass', id);
    ui.settings.set({ speedClass: id });
    paint();
    if (changed && !silent) ui.sfx('ui-hover', { pitch: 0.85 + SPEED_CLASS_IDS.indexOf(id) * 0.12 });
  }
  /** Re-read the current choice (flow picks, else the saved setting); call from the screen's enter(). */
  function sync() {
    const v = ui.flow?.picks.speedClass ?? ui.settings.get().speedClass;
    cur = SPEED_CLASS_IDS.includes(v) ? v : 100;
    ui.flow?.pick('speedClass', cur);
    paint();
  }
  return { el, sync, set };
}
