// Controls screen: keyboard and gamepad bindings from input.bindingsHelp() (mock-friendly), plus a pad diagram and touch notes.
import { Screen } from './screen.js';
import { h, fromHtml, clear } from '../dom.js';
import { glyph } from '../icons.js';

/** Used when no InputManager (or an unexpected shape) is supplied. */
export const DEFAULT_BINDINGS = [
  { action: 'Accelerate', keys: ['W', 'Up', 'RT', 'A'] },
  { action: 'Brake / reverse', keys: ['S', 'Down', 'LT', 'B'] },
  { action: 'Steer', keys: ['A', 'D', 'Left', 'Right', 'Left stick', 'D-pad'] },
  { action: 'Drift (hold)', keys: ['Space', 'Shift', 'RB'] },
  { action: 'Use item (front slot)', keys: ['E', 'Enter', 'Z', 'X'] },
  { action: 'Swap the two items', keys: ['Q', 'Tab', 'LB'] },
  { action: 'Look back', keys: ['C', 'B', 'Y', 'R3'] },
  { action: 'Pause', keys: ['Esc', 'P', 'Start'] },
];

const PAD_RE = /^(RT|LT|RB|LB|R1|L1|R2|L2|Start|Select|Back button|D-?pad|(left|right)?\s?stick|pad\s.+)$/i;
const PAD_LETTER = /^[XYB]$/;
const SYMBOLS = { up: '↑', down: '↓', left: '←', right: '→', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→' };

/**
 * Split a bindings list into keyboard and gamepad tokens, normalised for display.
 * @param {string} action binding action name (used to disambiguate the letter A)
 * @param {string[]} keys raw tokens; tokens may contain " / " or " or " separators
 * @returns {{ keyboard: string[], pad: string[] }}
 */
export function splitBindings(action, keys) {
  const kb = []; const pad = [];
  for (const entry of Array.isArray(keys) ? keys : []) {
    let raw = String(entry).trim();
    if (!raw) continue;
    // real InputManager format: "Gamepad: RT or A", "Touch: BRAKE button", "Left / Right Arrow"
    if (/^touch\s*:/i.test(raw)) continue;                       // the touch panel explains the touch controls
    const forcedPad = /^gamepad\s*:/i.test(raw);
    raw = raw.replace(/^gamepad\s*:\s*/i, '');
    const arrows = /^(\w+)\s*\/\s*(\w+)\s+arrow$/i.exec(raw);
    const parts = arrows ? [`${arrows[1]} Arrow`, `${arrows[2]} Arrow`] : raw.split(/\s*(?:\/|\bor\b)\s*/i);
    for (const part of parts) {
      const tok = part.trim();
      if (!tok) continue;
      const low = tok.toLowerCase().replace(/\s*arrow$/, '');
      const label = SYMBOLS[low] ?? tok;
      const isPad = forcedPad || PAD_RE.test(tok) || PAD_LETTER.test(tok) || (tok === 'A' && !/steer|left|right/i.test(action));
      (isPad ? pad : kb).push(label);
    }
  }
  return { keyboard: kb, pad };
}

const padCap = (label) => {
  const cls = /^[ABXY]$/.test(label) ? `.pad.${label.toLowerCase()}` : '.wide';
  return h(`kbd.key${cls}`, { text: label.charAt(0).toUpperCase() + label.slice(1) });
};

const PAD_SVG = `<svg class="pad-art" viewBox="0 0 260 150" aria-hidden="true" focusable="false">
<path d="M64 34 h132 c30 0 44 22 50 62 c4 26-14 40-32 28 l-30-20 h-78 l-30 20 c-18 12-36-2-32-28 c6-40 20-62 50-62z" fill="#DCE7F5" stroke="#0B1D3A" stroke-width="5" stroke-linejoin="round"/>
<rect x="52" y="20" width="44" height="16" rx="7" fill="#22D3EE" stroke="#0B1D3A" stroke-width="4"/><rect x="164" y="20" width="44" height="16" rx="7" fill="#FFD166" stroke="#0B1D3A" stroke-width="4"/>
<circle cx="82" cy="70" r="15" fill="#2C5BB0" stroke="#0B1D3A" stroke-width="4"/><circle cx="82" cy="70" r="7" fill="#0B1D3A"/>
<path d="M112 92 h12 v-10 h10 v10 h12 v10 h-12 v10 h-10 v-10 h-12z" fill="#0B1D3A" opacity=".85"/>
<circle cx="190" cy="56" r="8" fill="#3DDC84" stroke="#0B1D3A" stroke-width="3"/><circle cx="208" cy="72" r="8" fill="#FF5B6B" stroke="#0B1D3A" stroke-width="3"/><circle cx="172" cy="72" r="8" fill="#5BA0FF" stroke="#0B1D3A" stroke-width="3"/><circle cx="190" cy="88" r="8" fill="#FFD166" stroke="#0B1D3A" stroke-width="3"/>
<rect x="124" y="64" width="12" height="6" rx="3" fill="#0B1D3A" opacity=".6"/></svg>`;

export class ControlsScreen extends Screen {
  constructor(ui) { super(ui, 'controls'); }

  build() {
    this.table = h('div.panel.ctl-table.rise', { style: { '--i': 1 } });
    this.side = h('div.ctl-side.rise', { style: { '--i': 3 } },
      h('div.panel.ctl-pad', null, h('div.set-h', { text: 'Gamepad' }), fromHtml(PAD_SVG),
        h('div.pad-legend', null,
          h('span', null, h('kbd.key.pad.a', { text: 'A' }), 'Menus: select'), h('span', null, h('kbd.key.pad.b', { text: 'B' }), 'Menus: back'),
          h('span', null, h('kbd.key.wide', { text: 'Start' }), 'Pause'))),
      h('div.panel.ctl-touch', null, h('div.set-h', { text: 'Touch' }),
        h('p', { text: 'Steer with the arrows on the left. Drift and item buttons sit on the right. The kart accelerates by itself; the small button brakes. Tap the small second item slot at the top left to swap your two items.' })));
    this.backBtn = h('button.btn.small', { attrs: { type: 'button' }, data: { nav: '', sfx: 'ui-back' }, on: { click: () => this.back() } }, fromHtml(glyph('back')), h('span', { text: 'Back' }));
    this.el.append(
      h('div.hdr.drop-in', null, h('div.hdr-l', null, h('div.hdr-title', { text: 'Controls' }), h('div.hdr-sub', { text: 'Keyboard, gamepad and touch' }))),
      h('div.screen-body.ctl-body', null, this.table, this.side),
      h('div.ftr', null, this.ui.hintBar([['back', 'Back']]), this.backBtn));
  }

  /** Fill the bindings table (also used by the pause menu). */
  static fillTable(el, rows) {
    clear(el);
    el.append(h('div.ctl-row.head', null, h('span', { text: 'Action' }), h('span', { text: 'Keyboard' }), h('span', { text: 'Gamepad' })));
    for (const r of rows) {
      const { keyboard, pad } = splitBindings(r.action, r.keys);
      el.append(h('div.ctl-row', null, h('span.ctl-a', { text: r.action }),
        h('span.ctl-k', null, ...keyboard.map((k) => h(`kbd.key${k.length > 2 ? '.wide' : ''}`, { text: k }))),
        h('span.ctl-k', null, ...pad.map(padCap))));
    }
  }

  /** @returns {{action: string, keys: string[]}[]} bindings from the InputManager or the built-in defaults */
  static bindings(input) {
    try {
      const b = input?.bindingsHelp?.();
      if (Array.isArray(b) && b.length) return b.filter((r) => r && r.action);
    } catch (e) { console.warn('[ui] bindingsHelp failed', e); }
    return DEFAULT_BINDINGS;
  }

  enter() { ControlsScreen.fillTable(this.table, ControlsScreen.bindings(this.ui.input)); }

  back() { this.ui.showMenu(); }

  navOptions() { return { onBack: () => this.back(), initial: this.backBtn }; }
}
