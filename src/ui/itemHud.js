// The HUD item box: TWO item slots (slot 1 large = the front item fired by the use button, slot 2 smaller = queued, swapped in with the
// swap button or a tap), a roulette that shows "???" until it lands, and a caption under the box that names the front item and says in one
// sentence what it does for as long as it is held (nothing, and no space, when empty), plus a "next: ..." line for the queued item. A
// short-lived extra line under it says when the slots are full.
// All copy comes from ITEMS (config.js), so the HUD can never drift from the Item Guide. The decision logic (`popupFor`) is pure and
// Node-testable; the DOM is only touched inside `build()` and `update()`.
import { ITEMS, ITEM_CATEGORIES } from '../core/config.js';
import { ITEM_DEFS } from '../race/itemDefs.js';
import { h, setText, setClass, anim, fromHtml } from './dom.js';
import { glyph, itemIcon } from './icons.js';

/** Seconds each kind of pop-up stays up before it fades. */
export const POP_SECONDS = Object.freeze({ gain: 2.2, front: 1.2, full: 1.2 });

/** Key labels shown on the two slots, per input device. `swap: null` means "tap the slot". */
export const SLOT_KEYS = Object.freeze({
  keyboard: { use: 'E', swap: 'Q' },
  gamepad: { use: 'X', swap: 'LB' },
  touch: { use: null, swap: 'TAP' },
});

/**
 * Display copy for an item id (name, one-sentence blurb, category).
 * @param {string} id item id
 * @returns {{name: string, blurb: string, category: string, categoryLabel: string}}
 */
export function itemCopy(id) {
  const it = ITEMS[id];
  if (!it) return { name: id || '', blurb: '', category: '', categoryLabel: '' };
  return { name: it.name, blurb: it.blurb, category: it.category, categoryLabel: ITEM_CATEGORIES[it.category]?.label ?? it.category };
}

/**
 * What should the pop-up do when the item state changes? Pure: no DOM, no timers.
 * `prev` / `cur` are { rolling: boolean, id1: string, id2: string, refused: number } (empty string = empty slot).
 * @returns {null | { kind: 'rolling'|'gain'|'front'|'full'|'clear', ids: string[], slots: number[], seconds: number }}
 *   rolling: show "???" until the box lands; gain: an item arrived in an empty slot (pickup, double box, steal) ~3 s;
 *   front: the front item changed (swap / used / promoted) ~1.7 s; full: a box was refused; clear: hide the pop-up
 */
export function popupFor(prev, cur) {
  if (cur.rolling) return prev.rolling ? null : { kind: 'rolling', ids: [], slots: [], seconds: Infinity };
  const ids = [], slots = [];
  if (cur.id1 && !prev.id1) { ids.push(cur.id1); slots.push(1); }
  if (cur.id2 && !prev.id2) { ids.push(cur.id2); slots.push(2); }
  if (ids.length) return { kind: 'gain', ids, slots, seconds: POP_SECONDS.gain };
  if (cur.id1 && cur.id1 !== prev.id1) return { kind: 'front', ids: [cur.id1], slots: [1], seconds: POP_SECONDS.front };
  if (cur.refused > prev.refused) return { kind: 'full', ids: [], slots: [], seconds: POP_SECONDS.full };
  if (prev.rolling || (prev.id1 && !cur.id1)) return { kind: 'clear', ids: [], slots: [], seconds: 0 };
  return null;
}

const CAP = ITEM_DEFS.capacitor;

export class ItemHud {
  /** @param {{ onSwap?: () => void }} [ctx] `onSwap`: called when slot 2 is tapped or clicked */
  constructor(ctx = {}) {
    this.ctx = ctx;
    this.device = 'keyboard';
    this.reset();
  }

  /** Forget everything (new race). */
  reset() {
    this._prev = { rolling: false, id1: '', id2: '', refused: 0 };
    this._cur = { rolling: false, id1: '', id2: '', refused: 0 };
    this._ttl = 0;
    this._kind = '';
    this._shown1 = null; this._shown2 = null; this._lastShown = ''; this._prevRoll = ''; this._captionKey = null;
    this._ribbon = '';
    this._fullT = 0;
    if (this.e) {
      this._render('', 1); this._render('', 2);
      this.e.pop.classList.remove('on', 'has');
    }
  }

  /** Build the DOM once. @returns {HTMLElement} the `.item-slot` element to place in the HUD */
  build() {
    const e = this.e = {};
    e.q = h('span.item-q', { text: '?' });
    e.ico1 = h('div.item-ico');
    e.count1 = h('span.item-count');
    e.key1 = h('span.item-key', null, e.key1cap = h('kbd.key', { text: 'E' }));
    e.meterSweet = h('i.sweet');
    e.meterFill = h('i.fill');
    e.meter = h('div.item-meter', null, e.meterSweet, e.meterFill);
    e.ribbon = h('span.item-ribbon');
    e.f1 = h('div.item-frame.s1', null, e.q, e.ico1, e.count1, e.key1, e.meter, e.ribbon);
    e.ico2 = h('div.item-ico');
    e.count2 = h('span.item-count');
    e.key2 = h('span.item-key', null, e.key2cap = h('kbd.key', { text: 'Q' }));
    e.lock2 = h('span.item-lock', { html: glyph('lock') });
    e.f2 = h('div.item-frame.s2', { attrs: { role: 'button', 'aria-label': 'Swap items' }, on: { pointerdown: (ev) => this._tap(ev) } }, e.ico2, e.count2, e.key2, e.lock2, h('span.item-hit'));
    e.stack = h('div.item-stack', null, e.f2, e.f1);
    // caption under the box: the front item's name + sentence and "then ..." while something is held (`has`), plus a short-lived
    // extra line (`on`) for the queued item or a refused box
    e.restName = h('span.ip-rname');
    e.restBlurb = h('span.ip-rblurb');
    e.restNext = h('span.ip-rnext');
    e.rest = h('div.ip-rest', null, e.restName, e.restBlurb, e.restNext);
    e.popList = h('div.ip-list');
    e.pop = h('div.item-pop', null, e.rest, e.popList);
    e.root = h('div.item-slot', null, e.stack, e.pop);
    this.setDevice(this.device);
    return e.root;
  }

  /** @param {'keyboard'|'gamepad'|'touch'} device latest input device: picks the key labels shown on the slots */
  setDevice(device) {
    const d = SLOT_KEYS[device] ? device : 'keyboard';
    this.device = d;
    if (!this.e) return;
    const k = SLOT_KEYS[d];
    setText(this.e.key1cap, k.use ?? '');
    setClass(this.e.key1, 'off', !k.use);
    setText(this.e.key2cap, k.swap ?? '');
    setClass(this.e.key2, 'off', !k.swap);
    setClass(this.e.root, 'tap', d === 'touch');
  }

  /** @param {string} label key cap shown on slot 1 (kept for the old `Hud.setItemKey` API) */
  setUseKey(label) { if (label && this.e) setText(this.e.key1cap, label); }

  _tap(ev) {
    if (typeof ev?.preventDefault === 'function') ev.preventDefault();
    this.ctx.onSwap?.();
    this._nudge = 0.25;
  }

  /**
   * @param {object} s the HudSnapshot (`item`, `item2`, `roulette`, `swapLocked`, `boxRefused`, `itemFx`)
   * @param {number} dt seconds since the last call
   */
  update(s, dt) {
    const e = this.e;
    if (!e) return;
    const ro = s.roulette && s.roulette.active ? s.roulette : null;
    const cur = this._cur, prev = this._prev;
    cur.rolling = !!ro; cur.id1 = s.item ? s.item.id : ''; cur.id2 = s.item2 ? s.item2.id : ''; cur.refused = s.boxRefused | 0;
    const ev = popupFor(prev, cur);
    const swapped = !cur.rolling && !!cur.id1 && !!cur.id2 && prev.id1 === cur.id2 && prev.id2 === cur.id1 && cur.id1 !== cur.id2;
    // the front item was used up (or stolen) and the queued one slid forward: same little slide from the small slot into the big one
    const promoted = !cur.rolling && !!cur.id1 && !cur.id2 && !!prev.id1 && prev.id2 === cur.id1 && prev.id1 !== cur.id1;
    if (ev) this._pop(ev);
    // ---- slot icons
    let show1 = cur.id1, show2 = cur.id2;
    if (ro) {
      const shown = ro.shown || '';
      if (shown && shown !== this._lastShown) { this._prevRoll = this._lastShown || shown; this._lastShown = shown; }
      if (ro.slot === 2 && !ro.double) show2 = shown || '?';
      else { show1 = shown || '?'; if (ro.double) show2 = this._prevRoll && this._prevRoll !== shown ? this._prevRoll : shown || '?'; }
    } else this._lastShown = '';
    this._render(show1, 1, !!ro && (ro.slot === 1 || ro.double), swapped || promoted);
    this._render(show2, 2, !!ro && (ro.slot === 2 || ro.double), swapped);
    setClass(e.f1, 'has', !!cur.id1 && !(ro && (ro.slot === 1 || ro.double)));
    setClass(e.f2, 'has', !!cur.id2 && !(ro && (ro.slot === 2 || ro.double)));
    setClass(e.f2, 'locked', !!s.swapLocked && !!cur.id2);
    setClass(e.root, 'two', !!cur.id1 && !!cur.id2);
    // ---- counts
    const c1 = !ro && s.item && s.item.count > 1 ? s.item.count : 0;
    const c2 = s.item2 && s.item2.count > 1 && !(ro && ro.slot === 2) ? s.item2.count : 0;
    if (c1 !== this._c1) { setClass(e.count1, 'on', c1 > 0); if (c1) setText(e.count1, `x${c1}`); this._c1 = c1; }
    if (c2 !== this._c2) { setClass(e.count2, 'on', c2 > 0); if (c2) setText(e.count2, `x${c2}`); this._c2 = c2; }
    // ---- capacitor meter, fuse and tow ribbon
    this._status(s.itemFx);
    // ---- pop-up timer and the compact line
    if (this._ttl > 0 && this._ttl !== Infinity) {
      this._ttl -= dt;
      if (this._ttl <= 0) { this._ttl = 0; this._kind = ''; e.pop.classList.remove('on'); }
    }
    this._compact(cur, s.swapLocked);
    if (this._fullT > 0) { this._fullT -= dt; if (this._fullT <= 0) { setClass(e.f1, 'full', false); setClass(e.f2, 'full', false); } }
    if (this._nudge > 0) this._nudge -= dt;
    prev.rolling = cur.rolling; prev.id1 = cur.id1; prev.id2 = cur.id2; prev.refused = cur.refused;
  }

  // ---- internals --------------------------------------------------------------------------------------------------
  _render(id, slot, rolling = false, swapped = false) {
    const e = this.e;
    const ico = slot === 1 ? e.ico1 : e.ico2, frame = slot === 1 ? e.f1 : e.f2;
    const key = `${id}|${rolling ? 1 : 0}`;
    const last = slot === 1 ? this._shown1 : this._shown2;
    setClass(frame, 'rolling', rolling);
    if (key === last) return;
    if (slot === 1) this._shown1 = key; else this._shown2 = key;
    if (!id) { ico.innerHTML = ''; return; }
    ico.innerHTML = id === '?' ? '<svg viewBox="0 0 64 64" aria-hidden="true"><text x="32" y="47" text-anchor="middle" font-size="42" font-weight="900" fill="#FFF8EC">?</text></svg>' : itemIcon(id);
    if (rolling) anim(ico, [{ transform: 'translateY(-46%) scale(.8)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 90, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'none' });
    else if (swapped) anim(ico, slot === 1 ? [{ transform: 'translate(46%, 6%) scale(.55)', opacity: 0.4 }, { transform: 'none', opacity: 1 }] : [{ transform: 'translate(-70%, -4%) scale(1.5)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.2,.3,1)', fill: 'none' });
    else anim(ico, [{ transform: 'scale(1.7) rotate(-14deg)' }, { transform: 'scale(.9) rotate(3deg)', offset: 0.6 }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'none' });
  }

  /** React to a state change (see `popupFor`): flash the "SLOTS FULL" line, or pop the caption line of the item that just arrived. */
  _pop(ev) {
    const e = this.e;
    if (ev.kind === 'clear') { this._ttl = 0; this._kind = ''; e.pop.classList.remove('on'); return; }
    if (ev.kind === 'rolling') { e.pop.classList.remove('on'); this._kind = 'rolling'; this._ttl = Infinity; return; }
    if (ev.kind === 'full') {
      this._fullT = POP_SECONDS.full;
      setClass(e.f1, 'full', true); setClass(e.f2, 'full', true);
      this._entries([{ name: 'SLOTS FULL', blurb: 'Use or swap an item first.' }]);
      e.pop.classList.add('on');
    } else {
      const target = ev.slots.includes(1) ? e.rest : e.restNext;
      anim(target, [{ transform: 'scale(1.18)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.2,.3,1)', fill: 'none' });
    }
    this._kind = ev.kind;
    this._ttl = ev.seconds;
  }

  _entries(list) {
    const box = this.e.popList;
    box.replaceChildren(...list.map((it) => h('div.ip-entry', null, h('div.ip-name', { text: it.name }), h('div.ip-blurb', { text: it.blurb }))));
    anim(box, [{ transform: 'translateY(-8px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,1.2,.3,1)', fill: 'none' });
  }

  /** The always-on caption while something is held: the front item's name and sentence, and "next: ..." for the queued one. */
  _compact(cur, locked) {
    const e = this.e;
    const c1 = cur.id1 && !cur.rolling ? itemCopy(cur.id1) : null;
    const n1 = cur.rolling ? '???' : c1 ? c1.name : '';
    const n2 = cur.id2 && !cur.rolling ? `next: ${itemCopy(cur.id2).name}` : '';
    const key = `${n1}|${c1 ? c1.blurb : ''}|${n2}`;
    if (key !== this._captionKey) {
      this._captionKey = key;
      setText(e.restName, n1);
      setText(e.restBlurb, c1 ? c1.blurb : '');
      setText(e.restNext, n2);
      e.rest.className = `ip-rest${c1 && c1.category ? ` cat-${c1.category}` : ''}`;
      setClass(e.pop, 'has', !!(n1 || n2));
    }
    setClass(e.restNext, 'locked', !!locked && !!n2);
  }

  /** Capacitor charge meter and the fuse / tow ribbon on slot 1. */
  _status(fx) {
    const e = this.e;
    const charging = !!(fx && fx.charging);
    setClass(e.f1, 'charging', charging);
    if (charging) {
      const over = CAP.overload;
      const t = Math.min(over, Math.max(0, fx.charge || 0));
      e.meterFill.style.width = `${((t / over) * 100).toFixed(1)}%`;
      if (!this._sweetSet) {
        e.meterSweet.style.left = `${((CAP.sweetMin / over) * 100).toFixed(1)}%`;
        e.meterSweet.style.width = `${(((CAP.sweetMax - CAP.sweetMin) / over) * 100).toFixed(1)}%`;
        this._sweetSet = true;
      }
      e.f1.dataset.zone = fx.zone || 'weak';
    }
    let text = '', kind = '';
    if (fx && fx.potato > 0) { text = `FUSE ${fx.potato.toFixed(1)}`; kind = 'fuse'; }
    else if (fx && fx.trailT > 0) { text = `TOW ${Math.ceil(fx.trailT)}`; kind = 'tow'; }
    else if (charging) { text = fx.zone === 'sweet' ? 'FIRE NOW!' : fx.zone === 'over' ? 'TOO LONG!' : 'CHARGING'; kind = `charge-${fx.zone || 'weak'}`; }
    if (text !== this._ribbon) {
      this._ribbon = text;
      setText(e.ribbon, text);
      setClass(e.ribbon, 'on', !!text);
      e.ribbon.dataset.kind = kind;
    }
  }
}

/** Icon markup for a category chip or legend (small coloured dot); exported so the Item Guide reuses the exact same palette classes. */
export const categoryDot = (cat) => fromHtml(`<i class="cat-dot cat-${cat}"></i>`);
