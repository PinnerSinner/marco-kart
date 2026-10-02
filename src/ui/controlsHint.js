// Controls reminder shown in a top-centre strip while racing, plus a small "REAR VIEW" tag while the player looks back.
// The hint adapts to the last input device (keyboard / gamepad / touch), stays bright for HINT_BRIGHT_S seconds after the
// race starts (or after the device changes), then fades to a faint but readable level. Text is British English.
// Safe to import in Node (DOM is only touched in `mount`).

/** Seconds at full opacity after showing / a device change. */
export const HINT_BRIGHT_S = 10;
/** Seconds of the fade to the resting opacity. */
export const HINT_FADE_S = 2.5;
/** Resting opacity once faded. */
export const HINT_REST_OPACITY = 0.38;

const ROWS = {
  keyboard: [['W S', 'Drive'], ['A D', 'Steer'], ['Space', 'Drift (hold)'], ['E', 'Item'], ['Q', 'Swap'], ['C', 'Look back']],
  gamepad: [['RT', 'Go'], ['Stick', 'Steer'], ['RB', 'Drift (hold)'], ['X', 'Item'], ['LB', 'Swap'], ['Y', 'Look back']],
  touch: [['Pad', 'Steer'], ['DRIFT', 'Hold to drift'], ['ITEM', 'Use item'], ['Tap slot 2', 'Swap'], ['LOOK', 'Hold to look back']],
};

/**
 * The [key, action] pairs shown for a device.
 * @param {'keyboard'|'gamepad'|'touch'} device unknown values fall back to keyboard
 * @returns {string[][]}
 */
export function hintRows(device) { return ROWS[device] || ROWS.keyboard; }

/**
 * Opacity of the hint `age` seconds after it was (re)shown.
 * @param {number} age seconds
 * @returns {number} HINT_REST_OPACITY..1
 */
export function hintOpacity(age) {
  if (!(age > HINT_BRIGHT_S)) return 1;
  const k = Math.min(1, (age - HINT_BRIGHT_S) / HINT_FADE_S);
  return 1 - (1 - HINT_REST_OPACITY) * k;
}

const CSS = `
.mk-hint{position:absolute;left:50%;top:max(env(safe-area-inset-top),10px);transform:translateX(-50%);z-index:3;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.mk-hint-keys{display:none;gap:4px 12px;flex-wrap:wrap;justify-content:center;max-width:min(92vw,720px);padding:5px 12px;border-radius:999px;background:rgba(6,18,42,.55);color:#FFF8EC;font-size:12px;font-weight:600;letter-spacing:.02em;transition:opacity .25s;white-space:nowrap}
.mk-hint.on .mk-hint-keys{display:none}
.mk-hint-keys b{display:inline-block;min-width:1.4em;padding:1px 6px;margin-right:5px;border-radius:5px;background:#FFF8EC;color:#06122A;font-size:11px;font-weight:800;text-align:center}
.mk-hint-rear{display:none;padding:3px 12px;border-radius:999px;background:rgba(34,211,238,.85);color:#06122A;font-size:12px;font-weight:900;letter-spacing:.18em}
.mk-hint.rear .mk-hint-rear{display:block}
@media (max-width:640px){.mk-hint-keys{font-size:11px;gap:2px 8px}}
`;

export class ControlsHint {
  constructor() {
    this.device = 'keyboard';
    this.age = 0;
    this.shown = false;
    this.lookBack = false;
    this._opacity = -1;
    this.root = null;
  }

  /** @param {HTMLElement} parent element to append to (the `.mk` wrapper) */
  mount(parent) {
    const doc = parent.ownerDocument;
    if (!doc.getElementById('mk-hint-style')) { const st = doc.createElement('style'); st.id = 'mk-hint-style'; st.textContent = CSS; doc.head.appendChild(st); }
    this.root = doc.createElement('div'); this.root.className = 'mk-hint'; this.root.setAttribute('aria-hidden', 'true');
    this.keys = doc.createElement('div'); this.keys.className = 'mk-hint-keys';
    this.rear = doc.createElement('div'); this.rear.className = 'mk-hint-rear'; this.rear.textContent = 'REAR VIEW';
    this.root.append(this.keys, this.rear);
    parent.appendChild(this.root);
    this._render();
  }

  /** Show or hide the hint; showing restarts the bright period. @param {boolean} on */
  setVisible(on) {
    this.shown = !!on;
    if (this.shown) this.age = 0;
    else this.lookBack = false;
    this._sync();
  }

  /** @param {'keyboard'|'gamepad'|'touch'} device latest input device; a change re-brightens the hint for a while */
  setDevice(device) {
    const d = ROWS[device] ? device : 'keyboard';
    if (d === this.device) return;
    this.device = d;
    this.age = Math.min(this.age, HINT_BRIGHT_S - 4);
    this._render();
  }

  /** @param {boolean} on true while the player is looking behind */
  setLookBack(on) {
    on = !!on && this.shown;
    if (on === this.lookBack) return;
    this.lookBack = on;
    this._sync();
  }

  /** @param {number} dt seconds */
  update(dt) {
    if (!this.shown) return;
    this.age += dt;
    const o = hintOpacity(this.age);
    if (Math.abs(o - this._opacity) > 0.01 && this.keys) { this._opacity = o; this.keys.style.opacity = o.toFixed(2); }
  }

  _render() {
    if (!this.keys) return;
    this.keys.replaceChildren();
    for (const [k, a] of hintRows(this.device)) {
      const span = this.keys.ownerDocument.createElement('span');
      const b = this.keys.ownerDocument.createElement('b'); b.textContent = k;
      span.append(b, a);
      this.keys.appendChild(span);
    }
  }

  _sync() {
    if (!this.root) return;
    this.root.classList.toggle('on', this.shown);
    this.root.classList.toggle('rear', this.lookBack);
    this._opacity = -1;
    if (this.shown) this.update(0);
  }
}
