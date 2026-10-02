// InputManager: keyboard, gamepad and touch overlay merged into one per-frame input snapshot (SPEC.md section 4).
//
//   const input = new InputManager(canvas);
//   const { throttle, brake, steer, drift, itemPressed, lookBack, pausePressed } = input.read();
//
// throttle / brake 0..1, steer -1..1 (+1 = RIGHT), drift = held, lookBack = held,
// itemPressed / swapPressed / pausePressed are EDGE flags: true for exactly one read() after the press (swapPressed: Q / Tab / gamepad LB).
// The keyboard reports discrete steering (-1, 0, 1): the physics smooths it, so we add no extra lag here.
// Safe to import in Node; browser globals are only touched when they exist.

const KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  accel: ['ArrowUp', 'KeyW'], brake: ['ArrowDown', 'KeyS'],
  drift: ['Space', 'ShiftLeft', 'ShiftRight'],
  item: ['KeyE', 'Enter', 'NumpadEnter', 'KeyZ'],
  swap: ['KeyQ', 'Tab'],           // exchange the two held items (front and queued)
  lookBack: ['KeyC', 'KeyB'],
  pause: ['Escape', 'KeyP'],
};
const GAME_KEYS = new Set(Object.values(KEYS).flat());
const FALLBACK_KEY_NAMES = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ' ': 'Space', Shift: 'ShiftLeft', Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', q: 'KeyQ', a: 'KeyA', d: 'KeyD', w: 'KeyW', s: 'KeyS', e: 'KeyE', z: 'KeyZ', c: 'KeyC', b: 'KeyB', p: 'KeyP' };

const PAD = { dead: 0.14, curve: 1.35, trigger: 0.06 };

/** Standard-mapping gamepad button indices. */
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Rescale a stick axis: dead zone, then an exponential response curve for fine control near the centre. */
export function stickCurve(x, dead = PAD.dead, curve = PAD.curve) {
  const a = Math.abs(x);
  if (!(a > dead)) return 0;
  const v = Math.min(1, (a - dead) / (1 - dead));
  return Math.sign(x) * Math.pow(v, curve);
}

export class InputManager {
  /**
   * @param {HTMLElement} [canvasElement] the game canvas (used only to focus it and to size the touch overlay)
   * @param {{touch?: 'auto'|boolean}} [opts] touch: 'auto' shows the overlay only when touch is detected (default)
   */
  constructor(canvasElement, opts = {}) {
    this.canvas = canvasElement ?? null;
    this.enabled = true;
    /** 'keyboard' | 'gamepad' | 'touch': the device that produced the latest input (for on-screen hints). */
    this.lastDevice = 'keyboard';
    this._down = new Set();
    this._itemEdge = false; this._pauseEdge = false; this._swapEdge = false;
    this._pad = { itemHeld: false, swapHeld: false, startHeld: false };
    this._touch = { steer: 0, drift: false, look: false, item: false, brake: false, pause: false, ui: null, wanted: opts.touch ?? 'auto', visible: true, pauseButton: true };
    this._out = { throttle: 0, brake: 0, steer: 0, drift: false, itemPressed: false, swapPressed: false, lookBack: false, pausePressed: false };
    this._listeners = [];
    this._win = typeof window !== 'undefined' ? window : null;

    if (this._win) {
      this._listen(this._win, 'keydown', (e) => this._onKey(e, true));
      this._listen(this._win, 'keyup', (e) => this._onKey(e, false));
      this._listen(this._win, 'blur', () => this._releaseAll());
      if (typeof document !== 'undefined') this._listen(document, 'visibilitychange', () => { if (document.hidden) this._releaseAll(); });
      this._listen(this._win, 'touchstart', () => this._ensureTouch(), { passive: true });
    }
    if (this._touch.wanted === true || (this._touch.wanted === 'auto' && this._touchDetected())) this._ensureTouch(true);
  }

  // ---- public -----------------------------------------------------------------------------------------------------

  /** Poll all devices and return this frame's merged input. The returned object is reused: copy it if you keep it. */
  read() {
    const o = this._out;
    o.itemPressed = false; o.swapPressed = false; o.pausePressed = false;
    if (!this.enabled) {
      this._itemEdge = false; this._swapEdge = false; this._pauseEdge = false;
      o.throttle = 0; o.brake = 0; o.steer = 0; o.drift = false; o.lookBack = false;
      return o;
    }
    const d = this._down;
    const any = (list) => { for (let i = 0; i < list.length; i++) if (d.has(list[i])) return true; return false; };

    // keyboard
    let throttle = any(KEYS.accel) ? 1 : 0, brake = any(KEYS.brake) ? 1 : 0;
    let steer = (any(KEYS.right) ? 1 : 0) - (any(KEYS.left) ? 1 : 0);
    let drift = any(KEYS.drift), lookBack = any(KEYS.lookBack);
    let item = this._itemEdge, swap = this._swapEdge, pause = this._pauseEdge;
    this._itemEdge = false; this._swapEdge = false; this._pauseEdge = false;

    // gamepad
    const pad = this._readPad();
    if (pad) {
      throttle = Math.max(throttle, pad.throttle); brake = Math.max(brake, pad.brake);
      steer += pad.steer; drift = drift || pad.drift; lookBack = lookBack || pad.lookBack;
      if (pad.item && !this._pad.itemHeld) item = true;
      if (pad.swap && !this._pad.swapHeld) swap = true;
      if (pad.start && !this._pad.startHeld) pause = true;
      this._pad.itemHeld = pad.item; this._pad.swapHeld = pad.swap; this._pad.startHeld = pad.start;
      if (pad.active) this.lastDevice = 'gamepad';
    }

    // touch: auto-accelerate unless the brake button is held
    const t = this._touch;
    if (t.ui && t.visible) {
      throttle = Math.max(throttle, t.brake ? 0 : 1); brake = Math.max(brake, t.brake ? 1 : 0);
      steer += t.steer; drift = drift || t.drift; lookBack = lookBack || t.look;
      if (t.item) { item = true; t.item = false; }
      if (t.pause) { pause = true; t.pause = false; }
    }

    o.throttle = clamp(throttle, 0, 1); o.brake = clamp(brake, 0, 1); o.steer = clamp(steer, -1, 1);
    o.drift = drift; o.lookBack = lookBack; o.itemPressed = item; o.swapPressed = swap; o.pausePressed = pause;
    // brake wins over throttle so reversing is never fought by auto-accelerate
    if (o.brake > 0.05) o.throttle = 0;
    return o;
  }

  /** Enable / disable all input (menus, cutscenes). Disabling releases everything and hides the touch overlay. */
  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this._releaseAll();
    this._syncTouch();
  }

  /** Show or hide the touch overlay (settings "touch controls"). No effect when no touch device was detected. */
  setTouchVisible(on) {
    this._touch.visible = !!on;
    if (on && this._touch.wanted === 'auto') this._ensureTouch(true);
    this._syncTouch();
  }

  /** True while the touch overlay is on screen (touch device, switched on in settings, input enabled). */
  get touchActive() { return !!(this._touch.ui && this._touch.visible && this.enabled); }

  /** Show or hide the overlay's own pause button (the game HUD has one, so the game hides this one to avoid a duplicate). */
  setPauseButton(on) {
    this._touch.pauseButton = !!on;
    this._syncPauseButton();
  }

  /** @returns {{action:string, keys:string[]}[]} for the Controls screen */
  bindingsHelp() {
    return [
      { action: 'Accelerate', keys: ['W', 'Up Arrow', 'Gamepad: RT or A', 'Touch: automatic'] },
      { action: 'Brake / reverse', keys: ['S', 'Down Arrow', 'Gamepad: LT or B', 'Touch: BRAKE button'] },
      { action: 'Steer', keys: ['A / D', 'Left / Right Arrow', 'Gamepad: left stick or D-pad', 'Touch: steer pad'] },
      { action: 'Drift (hold while steering)', keys: ['Space', 'Shift', 'Gamepad: RB', 'Touch: DRIFT button'] },
      { action: 'Use item (front slot)', keys: ['E', 'Enter', 'Z', 'Gamepad: X', 'Touch: ITEM button'] },
      { action: 'Swap the two items', keys: ['Q', 'Tab', 'Gamepad: LB', 'Touch: tap the small slot'] },
      { action: 'Look back (hold)', keys: ['C', 'B', 'Gamepad: Y or right stick click', 'Touch: LOOK button'] },
      { action: 'Pause', keys: ['Esc', 'P', 'Gamepad: Start', 'Touch: pause button'] },
    ];
  }

  /** Remove every listener and the touch overlay. */
  dispose() {
    for (const [target, type, fn, opt] of this._listeners) target.removeEventListener(type, fn, opt);
    this._listeners.length = 0;
    const ui = this._touch.ui;
    if (ui && ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
    this._touch.ui = null;
    this._down.clear();
  }

  // ---- keyboard ---------------------------------------------------------------------------------------------------

  _onKey(e, down) {
    let code = e.code;
    if (!code || code === 'Unidentified') code = FALLBACK_KEY_NAMES[e.key] ?? '';
    if (!GAME_KEYS.has(code)) return;
    const t = e.target;
    const editable = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
    if (editable) return;
    if (!this.enabled) { if (!down) this._down.delete(code); return; }
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (down) {
      if (e.repeat) return;
      this._down.add(code);
      this.lastDevice = 'keyboard';
      if (KEYS.item.includes(code)) this._itemEdge = true;
      if (KEYS.swap.includes(code)) this._swapEdge = true;
      if (KEYS.pause.includes(code)) this._pauseEdge = true;
    } else {
      this._down.delete(code);
    }
  }

  _releaseAll() {
    this._down.clear(); this._itemEdge = false; this._swapEdge = false; this._pauseEdge = false;
    const t = this._touch;
    t.steer = 0; t.drift = false; t.look = false; t.item = false; t.brake = false; t.pause = false;
    if (t.ui) t.ui.reset();
  }

  // ---- gamepad ----------------------------------------------------------------------------------------------------

  _readPad() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    let gp = null;
    try { const list = navigator.getGamepads(); for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected) { gp = list[i]; break; } } catch { return null; }
    if (!gp) return null;
    const b = gp.buttons, ax = gp.axes;
    const val = (i) => { const x = b[i]; return x ? (typeof x === 'number' ? x : x.value ?? (x.pressed ? 1 : 0)) : 0; };
    const pressed = (i) => { const x = b[i]; return !!x && (typeof x === 'number' ? x > 0.5 : x.pressed || x.value > 0.5); };
    const rt = val(B.RT), lt = val(B.LT);
    const throttle = Math.max(rt > PAD.trigger ? rt : 0, pressed(B.A) ? 1 : 0);
    const brake = Math.max(lt > PAD.trigger ? lt : 0, pressed(B.B) ? 1 : 0);
    let steer = stickCurve(ax[0] ?? 0);
    if (pressed(B.LEFT)) steer = -1; else if (pressed(B.RIGHT)) steer = 1;
    const drift = pressed(B.RB), lookBack = pressed(B.Y) || pressed(B.R3);
    const item = pressed(B.X), swap = pressed(B.LB), start = pressed(B.START);
    const active = throttle > 0 || brake > 0 || steer !== 0 || drift || item || swap || start || lookBack;
    return { throttle, brake, steer, drift, lookBack, item, swap, start, active };
  }

  // ---- touch ------------------------------------------------------------------------------------------------------

  _touchDetected() {
    if (!this._win) return false;
    try { return 'ontouchstart' in this._win || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0); } catch { return false; }
  }

  _ensureTouch(force = false) {
    const t = this._touch;
    if (t.ui || typeof document === 'undefined') return;
    if (!force && t.wanted === false) return;
    t.ui = buildTouchOverlay(t, this.canvas);
    this._syncPauseButton();
    this.lastDevice = 'touch';
    this._syncTouch();
  }

  _syncPauseButton() {
    const ui = this._touch.ui;
    if (ui && ui.root.classList && typeof ui.root.classList.toggle === 'function') ui.root.classList.toggle('mk-nopause', !this._touch.pauseButton);
  }

  _syncTouch() {
    const t = this._touch;
    if (!t.ui) return;
    t.ui.root.style.display = this.enabled && t.visible ? 'block' : 'none';
  }

  _listen(target, type, fn, opt) {
    target.addEventListener(type, fn, opt);
    this._listeners.push([target, type, fn, opt]);
  }
}

// ---- touch overlay DOM (built lazily, only on touch devices) -----------------------------------------------------

const TOUCH_CSS = `
#mk-touch{position:fixed;inset:0;z-index:30;pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#mk-touch .mk-pad{position:absolute;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));width:min(46vw,360px);height:min(36vh,190px);border-radius:28px;background:rgba(11,29,58,.38);border:3px solid rgba(255,248,236,.55);pointer-events:auto;touch-action:none;backdrop-filter:blur(2px)}
#mk-touch .mk-pad .mk-arrow{position:absolute;top:50%;transform:translateY(-50%);font-size:clamp(34px,9vh,64px);color:rgba(255,248,236,.85);font-weight:900;line-height:1}
#mk-touch .mk-pad .mk-l{left:9%}#mk-touch .mk-pad .mk-r{right:9%}
#mk-touch .mk-pad .mk-knob{position:absolute;top:50%;left:50%;width:22%;aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%);background:rgba(34,211,238,.75);border:3px solid #FFF8EC;box-shadow:0 2px 8px rgba(0,0,0,.4);transition:none}
#mk-touch .mk-btn{position:absolute;pointer-events:auto;touch-action:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-style:italic;letter-spacing:.04em;color:#FFF8EC;border:3px solid rgba(255,248,236,.85);box-shadow:0 3px 10px rgba(0,0,0,.4);text-shadow:0 2px 0 rgba(0,0,0,.35)}
#mk-touch .mk-btn.mk-on{filter:brightness(1.35);transform:scale(.94)}
#mk-touch .mk-drift{right:max(18px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));width:clamp(86px,24vh,128px);height:clamp(86px,24vh,128px);background:rgba(230,57,70,.62);font-size:clamp(15px,3.6vh,22px)}
#mk-touch .mk-item{right:calc(max(18px,env(safe-area-inset-right)) + clamp(86px,24vh,128px) + 12px);bottom:max(30px,env(safe-area-inset-bottom));width:clamp(64px,18vh,92px);height:clamp(64px,18vh,92px);background:rgba(255,209,102,.62);color:#0B1D3A;font-size:clamp(13px,3vh,18px);text-shadow:none}
#mk-touch .mk-brake{right:max(24px,env(safe-area-inset-right));bottom:calc(max(18px,env(safe-area-inset-bottom)) + clamp(86px,24vh,128px) + 12px);width:clamp(50px,13vh,68px);height:clamp(50px,13vh,68px);background:rgba(11,29,58,.6);font-size:clamp(11px,2.4vh,15px)}
#mk-touch .mk-look{right:max(24px,env(safe-area-inset-right));bottom:calc(max(18px,env(safe-area-inset-bottom)) + clamp(86px,24vh,128px) + clamp(50px,13vh,68px) + 22px);width:clamp(42px,11vh,56px);height:clamp(42px,11vh,56px);background:rgba(34,211,238,.55);color:#06122A;font-size:clamp(9px,2vh,12px);text-shadow:none}
#mk-touch.mk-nopause .mk-pause{display:none}
#mk-touch .mk-pause{right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));width:44px;height:44px;background:rgba(11,29,58,.55);font-size:18px;font-style:normal}
`;

function buildTouchOverlay(state, canvas) {
  const doc = document;
  if (!doc.getElementById('mk-touch-style')) {
    const st = doc.createElement('style'); st.id = 'mk-touch-style'; st.textContent = TOUCH_CSS; doc.head.appendChild(st);
  }
  const root = doc.createElement('div'); root.id = 'mk-touch';
  const mk = (cls, text, parent = root) => { const el = doc.createElement('div'); el.className = cls; if (text) el.textContent = text; parent.appendChild(el); return el; };

  // steer pad: analog by horizontal position of the finger relative to the pad centre
  const pad = mk('mk-pad');
  mk('mk-arrow mk-l', '◀', pad); mk('mk-arrow mk-r', '▶', pad);
  const knob = mk('mk-knob', '', pad);
  let padPointer = null;
  const padSteer = (e) => {
    const r = pad.getBoundingClientRect();
    const x = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;      // -1..1 across the pad
    const v = Math.abs(x) < 0.08 ? 0 : clamp((x - Math.sign(x) * 0.08) / 0.62, -1, 1);
    state.steer = v;
    knob.style.left = `${50 + clamp(x, -1, 1) * 38}%`;
  };
  const padEnd = () => { padPointer = null; state.steer = 0; knob.style.left = '50%'; };
  pad.addEventListener('pointerdown', (e) => { padPointer = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch { /* not capturable */ } padSteer(e); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === padPointer) padSteer(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, (e) => { if (e.pointerId === padPointer || ev === 'lostpointercapture') padEnd(); });

  const button = (cls, label, onDown, onUp) => {
    const el = mk(`mk-btn ${cls}`, label);
    let id = null;
    el.addEventListener('pointerdown', (e) => { id = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ } el.classList.add('mk-on'); onDown(); e.preventDefault(); });
    const up = (e) => { if (id !== null && e.pointerId !== id) return; id = null; el.classList.remove('mk-on'); if (onUp) onUp(); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
    return el;
  };
  button('mk-drift', 'DRIFT', () => { state.drift = true; }, () => { state.drift = false; });
  button('mk-item', 'ITEM', () => { state.item = true; });
  button('mk-brake', 'BRAKE', () => { state.brake = true; }, () => { state.brake = false; });
  button('mk-look', 'LOOK', () => { state.look = true; }, () => { state.look = false; });
  button('mk-pause', '❙❙', () => { state.pause = true; });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  (canvas && canvas.parentElement ? canvas.parentElement : doc.body).appendChild(root);
  return { root, reset: () => { padEnd(); for (const el of root.querySelectorAll('.mk-on')) el.classList.remove('mk-on'); } };
}
