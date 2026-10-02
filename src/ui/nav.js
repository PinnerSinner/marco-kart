// Focus navigation for menus: keyboard (arrows / WASD, Enter, Esc), gamepad (d-pad, left stick, A, B, Start) and mouse hover.
// Scopes stack (screen, then pause, then confirm dialog); only the top scope receives input.
// Focusable elements carry `data-nav`. Elements with `data-adjust` receive left/right as a `mk-adjust` CustomEvent instead of moving.

const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const KEY_DIR = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
};

/**
 * Pick the best focus target in a direction using rectangles (beam test + distance).
 * Pure function so it can be unit tested with plain objects.
 * @param {{x:number,y:number,w:number,h:number}} from current rect
 * @param {{x:number,y:number,w:number,h:number}[]} rects candidate rects (may include `from`)
 * @param {'left'|'right'|'up'|'down'} dir
 * @returns {number} index into rects, or -1 if nothing lies that way
 */
export function pickDirectional(from, rects, dir) {
  const [dx, dy] = DIRS[dir];
  const cx = from.x + from.w / 2; const cy = from.y + from.h / 2;
  let best = -1; let bestScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r === from) continue;
    const rx = r.x + r.w / 2; const ry = r.y + r.h / 2;
    // distance along the movement axis, measured centre to centre
    const along = (rx - cx) * dx + (ry - cy) * dy;
    if (along <= 1) continue;
    // perpendicular gap between the two extents (0 when they overlap on that axis)
    const perp = dx !== 0
      ? Math.max(0, Math.max(r.y - (from.y + from.h), from.y - (r.y + r.h)))
      : Math.max(0, Math.max(r.x - (from.x + from.w), from.x - (r.x + r.w)));
    const off = dx !== 0 ? Math.abs(ry - cy) : Math.abs(rx - cx);
    const score = along + perp * 4 + off * 0.6;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}

const isShown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

export class NavManager {
  /**
   * @param {{ onSfx?: (name: string) => void }} [opts]
   */
  constructor({ onSfx = () => {} } = {}) {
    this.onSfx = onSfx;
    this.scopes = [];
    this.current = null;
    this.lockUntil = 0;
    this._raf = 0;
    this._held = {};
    this._prevButtons = {};
    this._attached = false;
    this._onKey = this._onKey.bind(this);
    this._onOver = this._onOver.bind(this);
    this._onDown = this._onDown.bind(this);
    this._onFocusIn = this._onFocusIn.bind(this);
    this._poll = this._poll.bind(this);
  }

  /** Start listening. Safe to call more than once. */
  attach() {
    if (this._attached) return;
    this._attached = true;
    window.addEventListener('keydown', this._onKey, true);
    document.addEventListener('pointerover', this._onOver, true);
    document.addEventListener('pointerdown', this._onDown, true);
    document.addEventListener('focusin', this._onFocusIn, true);
  }

  /** Stop listening and forget scopes. */
  detach() {
    if (!this._attached) return;
    this._attached = false;
    window.removeEventListener('keydown', this._onKey, true);
    document.removeEventListener('pointerover', this._onOver, true);
    document.removeEventListener('pointerdown', this._onDown, true);
    document.removeEventListener('focusin', this._onFocusIn, true);
    this._stopPoll();
    this.scopes = [];
    this.current = null;
  }

  /** @returns {{el: HTMLElement, opts: object}|null} the active scope */
  get scope() { return this.scopes[this.scopes.length - 1] ?? null; }

  /**
   * Make `el` the only scope (a full screen).
   * @param {HTMLElement|null} el container of the focusables; null deactivates navigation
   * @param {{ onBack?: Function, onStart?: Function, onAnyKey?: Function, initial?: HTMLElement|string }} [opts]
   */
  setRoot(el, opts = {}) {
    this._clearFocus();
    this.scopes = el ? [{ el, opts }] : [];
    this._afterScopeChange(opts);
  }

  /**
   * Push a modal scope on top (pause menu, confirm dialog).
   * @param {HTMLElement} el
   * @param {{ onBack?: Function, onStart?: Function, initial?: HTMLElement|string }} [opts]
   */
  push(el, opts = {}) {
    this._clearFocus();
    this.scopes.push({ el, opts });
    this._afterScopeChange(opts);
  }

  /** Pop the top modal scope, restoring the previous one's focus. */
  pop() {
    this._clearFocus();
    this.scopes.pop();
    this._afterScopeChange(this.scope?.opts ?? {});
  }

  /** Remove every scope (racing: menus must not swallow game keys). */
  clear() {
    this._clearFocus();
    this.scopes = [];
    this._stopPoll();
  }

  _afterScopeChange(opts) {
    this.lockUntil = performance.now() + 220;
    if (this.scope) {
      this._startPoll();
      this.refresh(opts.initial);
    } else this._stopPoll();
  }

  _clearFocus() {
    if (this.current) this.current.classList.remove('is-focus');
    this.current = null;
  }

  /** @returns {HTMLElement[]} visible focusables in the active scope */
  list() {
    const s = this.scope;
    if (!s) return [];
    return [...s.el.querySelectorAll('[data-nav]')].filter((n) => !n.disabled && n.dataset.nav !== 'off' && isShown(n));
  }

  /**
   * Re-validate the current focus, choosing a default if it vanished.
   * @param {HTMLElement|string} [initial] element or selector to prefer
   */
  refresh(initial) {
    const items = this.list();
    if (!items.length) { this._clearFocus(); return; }
    let target = null;
    if (typeof initial === 'string') target = this.scope.el.querySelector(initial);
    else if (initial) target = initial;
    if (!target && this.current && items.includes(this.current)) target = this.current;
    if (!target) target = this.scope.el.querySelector('[data-nav-default]') ?? items[0];
    if (target && items.includes(target)) this.focus(target, { silent: true });
    else this.focus(items[0], { silent: true });
  }

  /**
   * Move the focus highlight to `el`.
   * @param {HTMLElement} el
   * @param {{ silent?: boolean }} [opts] silent = no hover sfx
   */
  focus(el, { silent = false } = {}) {
    if (!el || el === this.current) return;
    if (this.current) this.current.classList.remove('is-focus');
    this.current = el;
    el.classList.add('is-focus');
    try { el.focus({ preventScroll: true }); } catch { /* not focusable */ }
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* old browser */ }
    el.dispatchEvent(new CustomEvent('mk-focus', { bubbles: true }));
    if (!silent) this.onSfx('ui-hover');
  }

  /**
   * Move focus in a direction.
   * @param {'left'|'right'|'up'|'down'} dir
   * @returns {boolean} whether the highlight moved or an adjust was delivered
   */
  move(dir) {
    const items = this.list();
    if (!items.length) return false;
    if (!this.current || !items.includes(this.current)) { this.focus(items[0]); return true; }
    const cur = this.current;
    if ((dir === 'left' || dir === 'right') && cur.hasAttribute('data-adjust')) {
      cur.dispatchEvent(new CustomEvent('mk-adjust', { detail: { dir: dir === 'left' ? -1 : 1 }, bubbles: true }));
      return true;
    }
    const box = (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, el: n }; };
    const from = box(cur);
    const rects = items.map(box);
    const idx = pickDirectional(from, rects.filter((r) => r.el !== cur), dir);
    const others = rects.filter((r) => r.el !== cur);
    if (idx >= 0) { this.focus(others[idx].el); return true; }
    if (dir === 'up' || dir === 'down') {
      // wrap around vertical lists
      const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
      const overlap = sorted.filter((r) => r.el !== cur && Math.min(r.x + r.w, from.x + from.w) - Math.max(r.x, from.x) > 0);
      const pool = overlap.length ? overlap : sorted.filter((r) => r.el !== cur);
      if (pool.length) { this.focus((dir === 'up' ? pool[pool.length - 1] : pool[0]).el); return true; }
    }
    return false;
  }

  /** Activate the focused element (click it). */
  activate() {
    if (performance.now() < this.lockUntil) return;
    if (this.current && this.current.isConnected) this.current.click();
  }

  /** Trigger the active scope's back handler. */
  back() {
    if (performance.now() < this.lockUntil) return;
    const fn = this.scope?.opts.onBack;
    if (!fn) return;
    this.onSfx('ui-back');
    fn();
  }

  _onKey(e) {
    const s = this.scope;
    if (!s || e.ctrlKey || e.metaKey || e.altKey) return;
    const swallow = () => { e.preventDefault(); e.stopPropagation(); };
    const dir = KEY_DIR[e.code];
    if (dir) { if (this.move(dir)) swallow(); return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      swallow();
      if (e.repeat) return;
      if (s.opts.onAnyKey) s.opts.onAnyKey(e); else this.activate();
      return;
    }
    if (e.code === 'Escape' || e.code === 'Backspace') {
      swallow();
      if (!e.repeat) this.back();
      return;
    }
    if (e.code === 'Tab') return;
    if (s.opts.onAnyKey && !e.repeat && !['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) { swallow(); s.opts.onAnyKey(e); }
  }

  _inScope(node) {
    const s = this.scope;
    return !!(s && node && node.nodeType === 1 && s.el.contains(node));
  }

  _onOver(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const t = e.target?.closest?.('[data-nav]');
    if (t && this._inScope(t) && !t.disabled && t.dataset.nav !== 'off') this.focus(t);
  }

  _onDown(e) {
    const t = e.target?.closest?.('[data-nav]');
    if (t && this._inScope(t)) this.focus(t, { silent: true });
    else if (this.scope?.opts.onAnyKey && this._inScope(e.target)) this.scope.opts.onAnyKey(e);
  }

  _onFocusIn(e) {
    const t = e.target?.closest?.('[data-nav]');
    if (t && this._inScope(t) && t !== this.current) this.focus(t, { silent: true });
  }

  // ---- gamepad ------------------------------------------------------------------------------------------------
  _startPoll() {
    if (this._raf || typeof requestAnimationFrame !== 'function') return;
    this._raf = requestAnimationFrame(this._poll);
  }

  _stopPoll() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._held = {};
  }

  _poll(now) {
    this._raf = requestAnimationFrame(this._poll);
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null;
    if (!pads) return;
    const down = { left: false, right: false, up: false, down: false };
    const btn = { a: false, b: false, start: false, any: false };
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const B = (i) => !!p.buttons[i]?.pressed;
      const ax = p.axes[0] ?? 0; const ay = p.axes[1] ?? 0;
      if (B(14) || ax < -0.55) down.left = true;
      if (B(15) || ax > 0.55) down.right = true;
      if (B(12) || ay < -0.55) down.up = true;
      if (B(13) || ay > 0.55) down.down = true;
      if (B(0)) btn.a = true;
      if (B(1)) btn.b = true;
      if (B(9)) btn.start = true;
      for (let i = 0; i < p.buttons.length; i++) if (p.buttons[i].pressed) btn.any = true;
    }
    for (const d of Object.keys(down)) {
      const h = this._held[d];
      if (down[d]) {
        if (!h) { this._held[d] = { t0: now, last: now }; this.move(d); }
        else if (now - h.t0 > 380 && now - h.last > 110) { h.last = now; this.move(d); }
      } else if (h) delete this._held[d];
    }
    const prev = this._prevButtons;
    if (btn.a && !prev.a) { const s = this.scope; if (s?.opts.onAnyKey) s.opts.onAnyKey({ code: 'PadA' }); else this.activate(); }
    else if (btn.any && !prev.any && this.scope?.opts.onAnyKey) this.scope.opts.onAnyKey({ code: 'PadAny' });
    if (btn.b && !prev.b) this.back();
    if (btn.start && !prev.start) this.scope?.opts.onStart?.();
    this._prevButtons = btn;
  }
}
