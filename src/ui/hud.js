// The race HUD: DOM + inline SVG, updated from HudSnapshot each frame with as little DOM churn as possible.
import { hex } from './colour.js';
import { h, setText, setClass, anim, pop, fromHtml, nowSec } from './dom.js';
import { glyph } from './icons.js';
import { charName } from './chars.js';
import { portrait } from './portraits.js';
import { ControlsHint } from './controlsHint.js';
import { ItemHud } from './itemHud.js';
import { fitMinimap } from './minimap.js';
import {
  ordinalParts, formatTime, formatTimeShort, displaySpeed, speedUnitLabel, gaugeFraction, lapSplitRows, currentLapTime,
} from './format.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs) => { const e = document.createElementNS(SVGNS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

const BANNER_ICON = { final: 'flag', wrong: 'up', best: 'timer', good: 'check', bad: 'bolt', lap: 'flag', info: '' };
const COUNT_COLOURS = { 3: '#FF4A5A', 2: '#FFB020', 1: '#FFE066', 0: '#5CFF8A' };

export class Hud {
  /**
   * @param {{ sfx: (name: string, extra?: object) => void, countdownSfx?: boolean }} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.units = 'kmh';
    this.visible = false;
    this.last = {};
    this.rows = new Map();
    this.dots = new Map();
    this.lapRows = [];
    this.boostMax = 0.001;
    this._fit = null;
    this._outline = null;
    this._wrongUntil = 0;
    this._lastBanner = { text: '', at: -9 };
    this._lastCount = { n: -1, at: -9 };
    this._lapKey = '';
    this._pt = { x: 0, y: 0 };
    this._nameTimer = 0;
    this._speedSmooth = 0;
  }

  /**
   * Create the DOM and attach it.
   * @param {HTMLElement} parent the `.mk` wrapper
   */
  build(parent) {
    const e = this.e = {};
    e.hud = h('div.hud');
    // ---- item + timer
    // two item slots + the name / one-sentence pop-up live in ItemHud (src/ui/itemHud.js); tapping slot 2 swaps the items
    this.itemHud = new ItemHud({ onSwap: () => this.ctx.onSwapItem?.() });
    e.itemSlot = this.itemHud.build();
    e.timeVal = h('div.tv', { text: '0:00.000' });
    e.laps = h('div.laps');
    e.timer = h('div.panel.timer', null, h('div.lbl', { text: 'TIME' }), e.timeVal, e.laps);
    e.tl = h('div.hud-tl', null, e.itemSlot, e.timer);
    // ---- standings
    e.standings = h('div.standings');
    // ---- minimap + pause
    e.mmSvg = svgEl('svg', { viewBox: '0 0 100 100' });
    e.mmRoad = [
      svgEl('path', { fill: 'none', stroke: '#06122A', 'stroke-width': 9, 'stroke-linejoin': 'round' }),
      svgEl('path', { fill: 'none', stroke: '#FFF8EC', 'stroke-width': 6.4, 'stroke-linejoin': 'round' }),
      svgEl('path', { fill: 'none', stroke: '#3B4A6B', 'stroke-width': 4.2, 'stroke-linejoin': 'round' }),
    ];
    e.mmStart = svgEl('line', { stroke: '#FFD166', 'stroke-width': 2.6, 'stroke-linecap': 'round' });
    e.mmOthers = svgEl('g', {});
    e.mmMe = svgEl('g', {});
    e.mmSvg.append(...e.mmRoad, e.mmStart, e.mmOthers, e.mmMe);
    e.minimap = h('div.minimap', null, e.mmSvg);
    e.pauseBtn = h('button.pause-btn', { attrs: { 'aria-label': 'Pause', type: 'button' }, data: { sfx: 'ui-click' }, on: { click: () => this.ctx.onPause?.() } }, h('i', null, h('b'), h('b')));
    e.tr = h('div.hud-tr', null, e.pauseBtn, e.minimap);
    // ---- lap + speedo
    e.lapNum = h('b', { text: '1' });
    e.lapTot = h('em', { text: '/3' });
    e.lapChip = h('div.panel.lapchip', null, h('small', { text: 'LAP' }), e.lapNum, e.lapTot);
    e.speedo = h('div.speedo');
    const sv = svgEl('svg', { viewBox: '0 0 146 96' });
    const arc = 'M17 74 A56 56 0 0 1 129 74';
    sv.append(svgEl('path', { d: arc, class: 'sp-track' }), svgEl('path', { d: arc, class: 'sp-back', pathLength: 100 }));
    e.spFill = svgEl('path', { d: arc, class: 'sp-fill', pathLength: 100, 'stroke-dasharray': '0 100' });
    sv.append(e.spFill);
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI - (k * Math.PI) / 8;
      sv.append(svgEl('line', { class: 'sp-tick', x1: (73 + Math.cos(a) * 42).toFixed(1), y1: (74 - Math.sin(a) * 42).toFixed(1), x2: (73 + Math.cos(a) * (k % 2 ? 46 : 49)).toFixed(1), y2: (74 - Math.sin(a) * (k % 2 ? 46 : 49)).toFixed(1) }));
    }
    e.speedNum = h('div.sp-num', { text: '0' });
    e.speedUnit = h('div.sp-unit', { text: 'KM/H' });
    e.speedClass = h('div.sp-class');                              // "150 Mbps" under the unit: the game speed class of this race
    e.speedo.append(sv, e.speedNum, e.speedUnit, e.speedClass);
    e.bl = h('div.hud-bl', null, e.lapChip, e.speedo);
    // ---- place
    e.placeNum = h('span.pn', { text: '1' });
    e.placeSuf = h('span.ps', { text: 'ST' });
    e.placeOf = h('span.po', { text: '/8' });
    e.place = h('div.place', { data: { p: '1' } }, e.placeNum, h('span.pcol', null, e.placeSuf, e.placeOf));
    e.placeDelta = h('div.place-delta');
    e.br = h('div.hud-br', null, e.place, e.placeDelta);
    // ---- drift + boost
    e.driftBar = h('div.drift-bar', null, h('i'), h('i'), h('i'));
    e.driftSegs = [...e.driftBar.children];
    e.driftLbl = h('div.drift-lbl', { text: 'DRIFT' });
    e.drift = h('div.drift', { data: { level: '0' } }, e.driftBar, e.driftLbl);
    e.boostBar = h('i');
    e.boost = h('div.boost', null, fromHtml(glyph('flame')), h('div.boost-bar', null, e.boostBar));
    e.bc = h('div.hud-bc', null, e.boost, e.drift);
    e.hud.append(e.tl, e.standings, e.tr, e.bl, e.br, e.bc);
    // ---- fx layer
    e.count = h('div.count');
    e.banners = h('div.banners');
    e.wrongText = h('span', { text: 'WRONG WAY' });
    e.wrong = h('div.wrong', null, h('div.wrong-in', null, fromHtml(glyph('down')), e.wrongText, fromHtml(glyph('down'))));
    e.finishT = h('div.finish-t', { text: 'FINISH!' });
    e.finishS = h('div.finish-s');
    e.finish = h('div.finish', null, h('div.finish-band', null, e.finishT, e.finishS));
    e.pops = h('div.pops');                                        // small pops near the kart ("PERFECT JUMP"), see pop()
    e.smear = h('div.smear');                                      // the green smear of a Steaming Gift hit (opacity = snapshot.smear)
    e.fx = h('div.fx', null, e.smear, e.count, e.banners, e.pops, e.wrong, e.finish);
    parent.append(e.hud, e.fx);
    this.hint = new ControlsHint();
    this.hint.mount(parent);
    this._buildLapRows(3);
    this.setUnits(this.units);
  }

  /** @param {'kmh'|'mph'} units */
  setUnits(units) {
    this.units = units === 'mph' ? 'mph' : 'kmh';
    setText(this.e.speedUnit, speedUnitLabel(this.units));
    this.last.speed = -1;
  }

  /** @param {string} label short name of the key that uses an item, shown on the slot */
  setItemKey(label) {
    this.itemHud?.setUseKey(label);
  }

  /** @param {boolean} on */
  setVisible(on) {
    this.visible = !!on;
    this.e.hud.classList.toggle('on', this.visible);
    this.hint?.setVisible(false);
    if (this.visible) this.reset();
    else this.clearFx();
  }

  /** @param {'keyboard'|'gamepad'|'touch'} device latest input device, so the controls reminder shows the right labels */
  setInputDevice(device) { this.hint?.setDevice(device); this.itemHud?.setDevice(device); }

  /** @param {boolean} on true while the player holds look-back (shows the REAR VIEW tag) */
  setLookBack(on) { this.hint?.setLookBack(on); }

  /** Forget per-race trackers (called when the HUD opens and when a new race starts). */
  reset() {
    // null / impossible sentinels force the next update to re-apply every piece of DOM state (nothing can leak in from the previous race)
    this.last = { place: -1, lap: -1, laps: -1, best: null, finished: false, state: '', speed: -1, gauge: -1, hot: -1, item: null, count: -1, rolling: null, wrong: null, level: -1, driftKey: -2, boostOn: null, boostKey: -1, fibre: null, cd: -1, n: -1, itemFrame: null, smear: -1 };
    this.boostMax = 0.001;
    this._lapKey = '';
    this._speedSmooth = 0;
    this.itemHud?.reset();
  }

  /** Remove transient effects (banners, countdown, wrong-way, finish). */
  clearFx() {
    const e = this.e;
    e.banners.replaceChildren(); e.count.replaceChildren(); e.pops?.replaceChildren();
    e.wrong.classList.remove('on'); e.finish.classList.remove('on');
    if (e.smear) { e.smear.style.opacity = '0'; this.last.smear = 0; }
    this._wrongUntil = 0;
  }

  // ---- per-frame update -------------------------------------------------------------------------------------------
  /**
   * Apply a HudSnapshot (SPEC section 5).
   * @param {object} s snapshot from race.getHud()
   * @param {number} dt frame time in seconds
   */
  update(s, dt) {
    if (!s || !this.visible) return;
    this.hint?.update(dt);
    const e = this.e; const L = this.last;
    if (s.state === 'countdown' && L.state !== 'countdown') this.reset();
    this._updateCountdown(s);
    // timer + laps
    const t = s.finished && Number.isFinite(s.finishTime) ? s.finishTime : s.time;
    setText(e.timeVal, formatTime(t));
    this._updateLaps(s);
    // lap counter + derived banners
    const laps = s.laps || 1;
    if (s.lap !== L.lap || laps !== L.laps) {
      const cur = Math.min(laps, Math.max(1, s.lap || 1));
      setText(e.lapNum, cur); setText(e.lapTot, `/${laps}`);
      setClass(e.lapChip, 'final', !!s.finalLap);
      if (L.lap > 0 && s.lap > L.lap && s.lap <= laps && s.state === 'racing') {
        if (s.finalLap) this.banner('FINAL LAP!', 'final', { ms: 2300 }); else this.banner(`LAP ${cur}`, 'lap', { ms: 1400 });
        pop(e.lapChip, { from: 1.35, ms: 500 });
      }
      L.lap = s.lap; L.laps = laps;
    }
    if (s.bestLap != null && L.best != null && s.bestLap < L.best - 1e-6 && s.state === 'racing') this.banner('NEW BEST LAP', 'best', { sub: formatTime(s.bestLap), ms: 2200 });
    L.best = s.bestLap ?? L.best;
    // place
    if (s.place !== L.place) {
      const parts = ordinalParts(s.place);
      setText(e.placeNum, parts.num); setText(e.placeSuf, parts.suffix);
      e.place.dataset.p = String(s.place);
      setText(e.placeOf, `/${s.racers || 8}`);
      if (L.place > 0 && s.place > 0) this._placeChanged(L.place, s.place);
      L.place = s.place;
    }
    this._updateItem(s, dt);
    this._updateSpeed(s, dt);
    this._updateDrift(s);
    this._updateBoost(s);
    this._updateStandings(s);
    this._updateMinimap(s);
    // wrong way
    const now = nowSec();
    const wrong = !!s.wrongWay || now < this._wrongUntil;
    if (wrong !== L.wrong) { setClass(e.wrong, 'on', wrong); L.wrong = wrong; }
    // green smear (poo hit)
    const sm = Math.round((s.smear || 0) * 20) / 20;
    if (sm !== L.smear) { e.smear.style.opacity = String(sm); L.smear = sm; }
    // finish
    if (s.finished && !L.finished && s.state !== 'countdown') this.showFinish(s.place, s.finishTime);
    L.finished = !!s.finished;
    L.state = s.state;
  }

  _placeChanged(from, to) {
    const e = this.e;
    pop(e.place, { from: to < from ? 1.6 : 0.7, ms: 520, rot: to < from ? -6 : 5 });
    e.placeDelta.className = `place-delta ${to < from ? 'up' : 'down'}`;
    e.placeDelta.innerHTML = glyph(to < from ? 'up' : 'down');
    anim(e.placeDelta, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 1, transform: 'translateY(0)', offset: 0.7 }, { opacity: 0, transform: `translateY(${to < from ? -10 : 10}px)` }], { duration: 1300, fill: 'forwards' });
  }

  _updateCountdown(s) {
    const L = this.last;
    if (s.state === 'countdown') {
      const n = Math.max(1, Math.min(3, Math.ceil((s.countdown ?? 0) - 1e-3)));
      if (s.countdown > 0 && n !== L.cd) { L.cd = n; this.countdown(n); }
    } else if (L.state === 'countdown' && s.state === 'racing') { L.cd = 0; this.countdown(0); }
  }

  _updateLaps(s) {
    const laps = s.laps || 1;
    const done = s.lapTimes?.length ?? 0;
    const key = `${laps}|${done}|${s.finished ? 1 : 0}|${s.bestLap}`;
    if (key !== this._lapKey) {
      this._lapKey = key;
      if (this.lapRows.length !== laps) this._buildLapRows(laps);
      const rows = lapSplitRows(s.lapTimes, s.time, laps, !!s.finished);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const el = this.lapRows[i];
        el.row.className = `lrow${r.live ? ' live' : ''}${r.best ? ' best' : ''}${r.time == null ? ' empty' : ''}`;
        setText(el.t, r.time == null ? '-:--.--' : formatTimeShort(r.time));
      }
      this._liveIndex = s.finished ? -1 : Math.min(done, laps - 1);
    }
    if (this._liveIndex >= 0 && !s.finished) setText(this.lapRows[this._liveIndex].t, formatTimeShort(currentLapTime(s.lapTimes, s.time)));
  }

  _buildLapRows(n) {
    this.e.laps.replaceChildren();
    this.lapRows = [];
    for (let i = 0; i < n; i++) {
      const t = h('span', { text: '-:--.--' });
      const row = h('div.lrow.empty', null, h('span', { text: `L${i + 1}` }), t);
      this.e.laps.append(row);
      this.lapRows.push({ row, t });
    }
  }

  _updateItem(s, dt) {
    this.itemHud.update(s, dt);
  }

  _updateSpeed(s, dt) {
    const e = this.e; const L = this.last;
    const kmh = Number.isFinite(s.speedKmh) ? Math.abs(s.speedKmh) : 0;
    this._speedSmooth += (kmh - this._speedSmooth) * Math.min(1, dt * 14);
    const shown = displaySpeed(this._speedSmooth, this.units);
    const cName = s.speedClassName || '';
    if (cName !== L.cls) { L.cls = cName; setText(e.speedClass, cName); e.speedo.dataset.cls = String(s.speedClass || 100); }
    if (shown !== L.speed) {
      L.speed = shown;
      setText(e.speedNum, shown);
      const f = Math.round(gaugeFraction(this._speedSmooth, 240 * (s.speedC || 1)) * 100);   // the dial's full scale grows with the speed class
      if (f !== L.gauge) {
        L.gauge = f;
        e.spFill.setAttribute('stroke-dasharray', `${f} 100`);
        const hot = f > 82 ? 3 : f > 62 ? 2 : f > 42 ? 1 : 0;
        if (hot !== L.hot) { L.hot = hot; e.speedo.dataset.hot = String(hot); }
      }
    }
  }

  _updateDrift(s) {
    const e = this.e; const L = this.last;
    const d = s.drift;
    const on = !!(d && d.active);
    const level = on ? (d.level | 0) : 0;
    const charge = on ? Math.min(1, Math.max(0, d.charge || 0)) : 0;
    setClass(e.drift, 'on', on);
    const key = on ? level * 100 + Math.round(charge * 60) : -1;
    if (key === L.driftKey) return;
    L.driftKey = key;
    if (level !== L.level) {
      e.drift.dataset.level = String(level);
      setText(e.driftLbl, level === 0 ? 'DRIFT' : level === 1 ? 'MINI-TURBO' : level === 2 ? 'SUPER TURBO' : 'ULTRA TURBO');
      if (L.level >= 0 && level > L.level) pop(e.driftBar, { from: 1.12, ms: 280 });
      L.level = level;
    }
    for (let i = 0; i < 3; i++) {
      const f = level > i ? 1 : level === i ? Math.min(0.96, Math.max(0, charge * 3 - i)) : 0;
      e.driftSegs[i].style.setProperty('--f', f.toFixed(2));
      setClass(e.driftSegs[i], 'lit', level > i);
    }
  }

  _updateBoost(s) {
    const e = this.e; const L = this.last;
    const t = s.boost && s.boost.time > 0 ? s.boost.time : 0;
    if (t > 0) { if (t > this.boostMax) this.boostMax = t; } else this.boostMax = 0.001;
    const on = t > 0;
    if (on !== L.boostOn) { setClass(e.boost, 'on', on); setClass(e.speedo, 'boosting', on); L.boostOn = on; }
    if (on) {
      const f = Math.min(1, t / this.boostMax);
      const key = Math.round(f * 50);
      if (key !== L.boostKey) { L.boostKey = key; e.boostBar.style.setProperty('--f', f.toFixed(2)); }
      const fibre = (s.boost.power || 1) > 1.3;
      if (fibre !== L.fibre) { setClass(e.boost, 'fibre', fibre); L.fibre = fibre; }
    }
  }

  _updateStandings(s) {
    const e = this.e;
    const list = s.standings;
    if (!list) return;
    const n = list.length;
    if (n !== this.last.n) { e.standings.style.setProperty('--n', n); this.last.n = n; }
    for (let i = 0; i < n; i++) {
      const st = list[i];
      let row = this.rows.get(st.id);
      if (!row) {
        row = this._makeRow(st);
        this.rows.set(st.id, row);
        e.standings.append(row.el);
      }
      if (row.charId !== st.charId) { row.pt.innerHTML = portrait(st.charId); row.charId = st.charId; row.name.textContent = st.name || charName(st.charId); }
      if (row.place !== st.place) { row.place = st.place; row.el.style.setProperty('--r', String(Math.max(0, (st.place || 1) - 1))); setText(row.p, st.place); }
      const lapTxt = st.finished ? '' : `L${Math.max(1, st.lap || 1)}`;
      if (row.lapTxt !== lapTxt || row.done !== !!st.finished) {
        row.lapTxt = lapTxt; row.done = !!st.finished;
        row.lap.innerHTML = st.finished ? glyph('check') : lapTxt;
        setClass(row.el, 'done', !!st.finished);
      }
      if (row.me !== !!st.isPlayer) { row.me = !!st.isPlayer; setClass(row.el, 'me', row.me); }
    }
  }

  _makeRow(st) {
    const p = h('b.sp'); const pt = h('span.spt'); const name = h('span.sn'); const lap = h('span.sl');
    const el = h('div.srow', null, p, pt, name, lap);
    return { el, p, pt, name, lap, charId: null, place: -1, lapTxt: null, done: null, me: null };
  }

  _updateMinimap(s) {
    const e = this.e; const mm = s.minimap;
    if (!mm) return;
    if (mm.outline !== this._outline) {
      this._outline = mm.outline;
      this._fit = fitMinimap(mm.outline);
      for (const p of e.mmRoad) p.setAttribute('d', this._fit.path);
      const st = this._fit.start;
      if (st) { e.mmStart.setAttribute('x1', st.x1.toFixed(1)); e.mmStart.setAttribute('y1', st.y1.toFixed(1)); e.mmStart.setAttribute('x2', st.x2.toFixed(1)); e.mmStart.setAttribute('y2', st.y2.toFixed(1)); }
    }
    if (!this._fit || !mm.karts) return;
    const pt = this._pt;
    for (let i = 0; i < mm.karts.length; i++) {
      const k = mm.karts[i];
      let d = this.dots.get(k.id);
      if (!d) {
        const c = svgEl('circle', { r: k.isPlayer ? 4.6 : 3.4, class: k.isPlayer ? 'mm-dot mm-me' : 'mm-dot', fill: hex(k.colour ?? 0xffffff) });
        d = { c, ring: null };
        if (k.isPlayer) { d.ring = svgEl('circle', { r: 4.6, class: 'mm-ring' }); e.mmMe.append(d.ring, c); } else e.mmOthers.append(c);
        this.dots.set(k.id, d);
      }
      this._fit.project(k.x, k.z, pt);
      d.c.setAttribute('cx', pt.x.toFixed(1)); d.c.setAttribute('cy', pt.y.toFixed(1));
      if (d.ring) { d.ring.setAttribute('cx', pt.x.toFixed(1)); d.ring.setAttribute('cy', pt.y.toFixed(1)); }
    }
  }

  // ---- transient effects --------------------------------------------------------------------------------------------
  /**
   * 3-2-1-GO numeral (n = 3, 2, 1, or 0 for GO).
   * @param {number} n
   */
  countdown(n) {
    const now = nowSec();
    if (n === this._lastCount.n && now - this._lastCount.at < 0.6) return;
    this._lastCount = { n, at: now };
    const e = this.e;
    const c = COUNT_COLOURS[n] ?? '#fff';
    e.count.style.setProperty('--c', c);
    e.count.replaceChildren(
      h('div.count-burst'),
      h(n === 0 ? 'div.count-num.go' : 'div.count-num', { text: n === 0 ? 'GO!' : String(n) }),
      ...(n === 0 ? [] : [h('div.lights', null, ...[0, 1, 2].map((i) => h(i < 4 - n ? 'i.red' : 'i')))]),
    );
    if (n === 0) {
      const lights = h('div.lights', null, h('i.green'), h('i.green'), h('i.green'));
      e.count.append(lights);
      setTimeout(() => { if (this.e.count.contains(lights)) this.e.count.replaceChildren(); }, 1300);
    }
    if (this.ctx.countdownSfx !== false) this.ctx.sfx(n === 0 ? 'countdown-go' : 'countdown-tick');
  }

  /**
   * Slide-in banner.
   * @param {string} text
   * @param {'final'|'wrong'|'best'|'good'|'bad'|'lap'|'info'} [kind]
   * @param {{ sub?: string, ms?: number }} [opts]
   */
  banner(text, kind = 'info', { sub = '', ms = 1900 } = {}) {
    const now = nowSec();
    if (text === this._lastBanner.text && now - this._lastBanner.at < 2.4) return;
    this._lastBanner = { text, at: now };
    if (kind === 'wrong') { this._wrongUntil = now + 2.5; return; }
    const g = BANNER_ICON[kind];
    const el = h(`div.banner.k-${kind}`, { style: { '--ms': `${ms}ms` } },
      h('div.banner-t', null, g ? fromHtml(glyph(g)) : null, h('span', { text })),
      sub ? h('div.banner-s', { text: sub }) : null);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), ms + 400);
    this.e.banners.append(el);
    while (this.e.banners.children.length > 3) this.e.banners.firstChild.remove();
  }

  /**
   * Small pop above the kart's screen position, for quick wins that should not take over the screen ("PERFECT JUMP").
   * @param {string} text
   * @param {'jump'|'good'|'info'} [kind]
   * @param {{ sub?: string, ms?: number }} [opts]
   */
  pop(text, kind = 'jump', { sub = '', ms = 1100 } = {}) {
    const now = nowSec();
    const last = this._lastPop ?? (this._lastPop = { text: '', at: -9 });
    if (text === last.text && now - last.at < 0.5) return;
    this._lastPop = { text, at: now };
    const el = h(`div.pop.k-${kind}`, { style: { '--ms': `${ms}ms` } }, h('div.pop-t', { text }), sub ? h('div.pop-s', { text: sub }) : null);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), ms + 300);
    this.e.pops.append(el);
    while (this.e.pops.children.length > 2) this.e.pops.firstChild.remove();
  }

  /**
   * Big finish banner.
   * @param {number} place
   * @param {number|null} [time]
   */
  showFinish(place, time = null) {
    const e = this.e;
    const p = ordinalParts(place);
    setText(e.finishS, `YOU FINISHED ${p.num}${p.suffix}${Number.isFinite(time) ? `  ${formatTime(time)}` : ''}`);
    e.finish.classList.remove('on');
    void e.finish.offsetWidth;
    e.finish.classList.add('on');
    clearTimeout(this._finishTimer);
    this._finishTimer = setTimeout(() => e.finish.classList.remove('on'), 4200);
  }
}
