// World-space speech text: see-through white text over the kart of whoever is talking (no box, portrait or tail), projected from the 3D head position every frame.
// What is alive (one per speaker, at most three, the human first) is decided by dialogue/bubbleQueue.js and where it goes on screen by
// dialogue/bubbleMath.js (both pure and unit tested); this file only owns the DOM. The layer sits under the HUD, so nothing here can cover it,
// and the bubbles are clamped to a safe rectangle that keeps the HUD's corners clear.
import { h } from './dom.js';
import { hex } from './colour.js';
import { getCharacter } from '../core/roster.js';
import { BubbleSet } from '../dialogue/bubbleQueue.js';
import { BUBBLE, SAFE, projectToScreen, distanceScale, inBubbleRange, anchorInView, placeBubble } from '../dialogue/bubbleMath.js';

const _a = { x: 0, y: 0, z: 0 };          // reused per frame: no allocation in the frame loop
const _p = {};
const BOX = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];

export class WorldBubbles {
  /** @param {{now?: () => number}} [o] now = clock in ms (tests inject one) */
  constructor({ now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
    this.now = now;
    this.set = new BubbleSet({ onRemove: (e) => this._release(e) });
    this.el = null;
    this.W = 960; this.H = 540;
    this._measure = true;
    this._ro = null;
  }

  get enabled() { return this.set.enabled; }

  /**
   * Create the layer inside `root`, before `before` (the HUD), so the HUD always draws on top.
   * @param {HTMLElement} root @param {Node|null} [before]
   */
  mount(root, before = null) {
    this.el = h('div.wb-layer', { 'aria-hidden': 'true' });
    root.insertBefore(this.el, before);
    const size = () => { this.W = this.el.clientWidth || this.W; this.H = this.el.clientHeight || this.H; this._measure = true; };
    size();
    if (typeof ResizeObserver !== 'undefined') { this._ro = new ResizeObserver(size); this._ro.observe(this.el); } else window.addEventListener('resize', size);
    return this;
  }

  /** Turn the floating text on or off (Settings: 'Floating speech text'). Off = nothing is shown in a race. */
  setEnabled(on) {
    this.set.enabled = !!on;
    if (!on) this.clear();
  }

  /** A new line (a `bark` bus event). Returns true when a bubble was made for it. */
  add(bark) {
    if (!this.el) return false;
    const e = this.set.add(bark, this.now());
    if (!e) return false;
    const col = hex(getCharacter(e.charId).colour);
    e.el = h('div.wb.wb-' + e.style + (e.isPlayer ? '.me' : '') + (e.rude ? '.rude' : ''), { style: { '--pc': col } }, h('div.wb-t', { text: e.text }));
    e.shown = false; e.w = 0; e.h = 0;
    this.el.append(e.el);
    e.w = e.el.offsetWidth; e.h = e.el.offsetHeight;          // measured once, at full size (rescaled by the transform)
    return true;
  }

  _release(e) { if (e.el) { e.el.remove(); e.el = null; } }

  /** Drop every bubble (race over, UI hidden, game paused). */
  clear() { this.set.clear(); }

  /**
   * Place every live bubble. Call once per frame after the camera has been updated.
   * @param {{matrixWorld:object, projectionMatrix:object, updateMatrixWorld?:Function}|null} camera
   * @param {(id: string, out: {x:number,y:number,z:number}) => boolean} anchorOf writes the head position of a racer, false when there is none (gone, respawning)
   */
  update(camera, anchorOf) {
    const set = this.set;
    if (!set.size) return;
    const now = this.now();
    set.prune(now);
    if (!set.size) return;
    if (this._measure) { this._measure = false; for (const e of set.entries) if (e.el) { e.w = e.el.offsetWidth; e.h = e.el.offsetHeight; } }
    const W = this.W, H = this.H;
    const list = set.ordered();
    let placed = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.el) continue;
      const st = set.state(e, now);
      let ok = !!camera && st.phase !== 'done' && anchorOf(e.id, _a);
      if (ok) {
        projectToScreen(camera, _a.x, _a.y, _a.z, W, H, _p);
        ok = !_p.behind && inBubbleRange(_p.dist) && anchorInView(_p.x, _p.y, W, H);
      }
      if (!ok) { this._hide(e); continue; }
      const k = distanceScale(_p.dist) * (e.isPlayer ? BUBBLE.meScale : 1) * 0.62;
      const s = k * Math.max(0.01, st.pop);
      const w = e.w * k, hh = e.h * k;
      const pl = placeBubble(_p.x, _p.y, w, hh, W, H, SAFE);
      // two bubbles never sit on top of each other: slide the later one up
      let by = pl.y;
      for (let j = 0; j < placed; j++) {
        const b = BOX[j];
        if (Math.abs(pl.x - b.x) < (w + b.w) * 0.5 && by > b.y - b.h - 4 && by - hh < b.y + 4) by = b.y - b.h - 6;
      }
      if (by - hh < H * SAFE.top) { this._hide(e); continue; }          // no room left on screen for this one
      const box = BOX[placed++]; box.x = pl.x; box.y = by; box.w = w; box.h = hh;
      if (!e.shown) { e.shown = true; e.el.classList.add('on'); }
      e.el.style.transform = `translate3d(${(pl.x - e.w * 0.5).toFixed(1)}px,${(by - e.h).toFixed(1)}px,0) scale(${s.toFixed(3)})`;
      e.el.style.opacity = (st.alpha * 0.72).toFixed(2);
    }
  }

  _hide(e) { if (e.shown) { e.shown = false; e.el.classList.remove('on'); e.el.style.opacity = '0'; } }

  destroy() {
    this.clear();
    this._ro?.disconnect();
    this.el?.remove(); this.el = null;
  }
}
