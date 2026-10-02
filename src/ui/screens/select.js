// The four steps of the selection flow: character, kart, difficulty, track. All share one SelectFlow (flow.js).
import { Screen } from './screen.js';
import { h, fromHtml, clear, U } from '../dom.js';
import { glyph } from '../icons.js';
import { uid } from '../colour.js';
import { portrait } from '../portraits.js';
import { charName, charTitle, charPhoto } from '../chars.js';
import { kartSvg } from '../kartArt.js';
import { trackArt } from '../trackArt.js';
import { createStatBars } from '../statbars.js';
import { kartRatings } from '../../kart/kartTuning.js';
import { Assets } from '../../core/assets.js';
import { CHARACTERS, KARTS, TRACKS, statsFor, getCharacter, getKart, getTrackInfo } from '../../core/roster.js';
import { DIFFICULTIES } from '../../core/config.js';
import { DIFFICULTY_COPY } from '../copy.js';
import { formatTime } from '../format.js';
import { hex } from '../colour.js';
import { LAP_OPTIONS } from '../progress.js';
import { FLOW_STEPS } from '../flow.js';
import { photoCard, pickPhotoFor } from '../photoUi.js';
import { createSpeedPick } from '../speedPick.js';

const STEP_LABEL = { char: 'Racer', kart: 'Kart', difficulty: 'Level', track: 'Track' };
const MODE_LABEL = { gp: 'Grand Prix', single: 'Single Race', time: 'Time Trial' };

/** Local presentation metadata for the track cards. */
const TRACK_TAGS = {
  copacabana: [['Seaside', 'yellow'], ['Sunny', 'cyan']],
  blighty: [['City', 'cyan'], ['Drizzle', 'red']],
  datacentre: [['Indoor', 'cyan'], ['Neon', 'red']],
  marcoverse: [['Space', 'cyan'], ['No walls', 'red']],
};

/** Shared behaviour: header with step pips, footer with hints and an on-screen back button. */
class SelectBase extends Screen {
  constructor(ui, name) { super(ui, name); }

  /** Build the standard chrome and return the `.screen-body` element. */
  chrome(title) {
    this.title = h('div.hdr-title', { text: title });
    this.sub = h('div.hdr-sub');
    this.steps = h('div.steps');
    this.backBtn = h('button.btn.small', { attrs: { type: 'button' }, data: { nav: '', sfx: 'ui-back' }, on: { click: () => this.back() } }, fromHtml(glyph('back')), h('span', { text: 'Back' }));
    this.body = h('div.screen-body.sel-body');
    this.el.append(
      h('div.hdr.drop-in', null, h('div.hdr-l', null, this.title, this.sub), this.steps),
      this.body,
      h('div.ftr', null, this.ui.hintBar(this.hints ?? [['move', 'Move'], ['enter', 'Select'], ['back', 'Back']]), this.backBtn));
    return this.body;
  }

  get flow() { return this.ui.flow; }

  refreshHeader() {
    const f = this.flow;
    if (!f) return;
    this.sub.textContent = MODE_LABEL[f.mode];
    clear(this.steps);
    f.steps.forEach((s, i) => {
      const cls = i < f.index ? 'step.done' : i === f.index ? 'step.on' : 'step';
      this.steps.append(h(`div.${cls}`, null, h('b', { text: i < f.index ? '✓' : String(i + 1) }), h('span', { text: STEP_LABEL[s] })));
    });
  }

  /** Move on after a confirm. */
  advance(value) {
    if (this.flow.confirm(value) === 'next') this.ui.show(this.flow.step);
  }

  back() {
    const r = this.flow.back();
    if (r === 'exit') this.ui.showMenu(); else this.ui.show(this.flow.step);
  }

  navOptions() { return { onBack: () => this.back() }; }
}

/** Big preview panel used by character and kart select. */
class Preview {
  constructor(ui, { kart = false } = {}) {
    this.ui = ui;
    this.kart = kart;                                               // the kart screen also shows the kart-type ratings and its one-line feel
    this.stats = createStatBars({ extra: kart });
    this.feel = h('div.pv-feel');
    this.name = h('div.pv-name.disp');
    this.sub = h('div.pv-sub');
    this.badge = h('div.pv-badge');
    this.host = h('div.tt');
    this.rays = h('div.pv-rays');
    this.fallback = null;
    this.drag = h('div.pv-drag', { text: 'Drag to spin' });
    this.el = h('div.pv.rise', { style: { '--i': 2 } }, this.rays, this.host,
      h('div.pv-top', null, h('div', null, this.name, this.sub, this.feel), this.badge), this.drag,
      h('div.pv-bottom', null, h('div.pv-stats', null, this.stats.el)));
  }

  /** Attach the shared turntable canvas (or a 2D fallback if WebGL is missing). */
  attach() {
    clear(this.host);
    const ok = this.ui.turntable.mount(this.host);
    this.drag.style.display = ok ? '' : 'none';
    this.hasGl = ok;
    if (ok) this.ui.turntable.start();
  }

  /**
   * @param {string} charId
   * @param {string} kartId
   * @param {{ ref?: object|null, badge?: string }} [o]
   */
  show(charId, kartId, { ref = null, badge = '' } = {}) {
    const c = getCharacter(charId);
    this.el.style.setProperty('--pc', hex(c.colour));
    this.name.textContent = charName(charId);
    this.sub.textContent = `${charTitle(charId)}  ·  ${getKart(kartId).name}`;
    this.stats.setStats(this.kart ? { ...statsFor(charId, kartId), ...kartRatings(kartId) } : statsFor(charId, kartId), ref);
    this.feel.replaceChildren(...(this.kart ? [h('span', { text: getKart(kartId).feel ?? getKart(kartId).blurb }), h('small', null, h('b', { text: getKart(kartId).trait }), h('span', { text: ` ${getKart(kartId).traitText}` }))] : []));
    if (this.hasGl) this.ui.turntable.setModel(charId, kartId);
    else this._fallback(charId, kartId);
    clear(this.badge);
    if (badge) this.badge.append(h('span.tag.yellow', { text: badge }));
    const photo = charPhoto(charId);
    if (photo) this.badge.append(h('div', { style: { width: U(54) }, html: portrait(charId) }));
  }

  _fallback(charId, kartId) {
    const c = getCharacter(charId);
    clear(this.host);
    this.host.append(h('div.tt-fallback', { html: kartSvg(kartId, c.colour, c.accent) }));
  }
}

export class CharScreen extends SelectBase {
  constructor(ui) { super(ui, 'char'); this.hints = [['move', 'Move'], ['enter', 'Choose'], ['back', 'Back']]; }

  build() {
    const body = this.chrome('Choose your racer');
    this.cards = CHARACTERS.map((c, i) => {
      const card = h('button.card.zoom-in', {
        attrs: { type: 'button', 'aria-label': charName(c.id) }, data: { nav: '', char: c.id, sfx: 'ui-confirm' }, style: { '--i': i },
        on: { click: (e) => this.ui.tapConfirm(card, e, () => this.advance(c.id)), 'mk-focus': () => this.preview(c.id) },
      }, fromHtml(portrait(c.id)), h('span.card-n', { text: charName(c.id) }));
      return card;
    });
    this.grid = h('div.char-grid', null, ...this.cards);
    this.bpName = h('div.bp-name.disp');
    this.bpTitle = h('div.bp-title');
    this.bpText = h('div.bp-text');
    this.bpHint = h('div.custom-hint');
    this.blurb = h('div.panel.blurb-panel.rise', { style: { '--i': 4 } }, this.bpName, this.bpTitle, this.bpText, this.bpHint);
    this.pv = new Preview(this.ui);
    this.snap = h('div.sel-snap');
    body.append(h('div.sel-left', null, this.grid, this.blurb), h('div.sel-right', null, this.pv.el), this.snap);
  }

  enter() {
    this.refreshHeader();
    this.pv.attach();
    const picks = this.flow.picks;
    this.cards.forEach((c) => c.classList.toggle('picked', c.dataset.char === picks.charId));
    this.cards.forEach((c, i) => { const p = c.querySelector('.pt'); if (p) p.parentNode.replaceChild(fromHtml(portrait(CHARACTERS[i].id)), p); c.querySelector('.card-n').textContent = charName(CHARACTERS[i].id); });
    this.preview(picks.charId);
  }

  leave() { this.ui.turntable.stop(); }

  /** Choosing a racer: announce it (the picked character answers with a line of their own, Marco with his "pick me" recording) and move on. */
  advance(value) {
    super.advance(value);
    if (value) this.ui.emit('ui:pick', { field: 'charId', value });          // after the screen change, which clears the HUD captions
  }

  preview(charId) {
    this.flow.pick('charId', charId);
    const k = this.flow.picks.kartId;
    this.pv.show(charId, k);
    const c = getCharacter(charId);
    this.bpName.textContent = charName(charId);
    this.bpTitle.textContent = charTitle(charId);
    this.bpText.textContent = c.blurb;
    const custom = c.customSlot && Assets.has('custom_rival_name');
    this.bpHint.textContent = c.customSlot && !custom ? 'Custom slot: drop a photo and a name into assets/user to race a friend, pet or relative.' : '';
    this.bpHint.style.display = this.bpHint.textContent ? '' : 'none';
    // Marco gets a snap from his own library that changes with every look at him
    this._looks = (this._looks ?? 0) + (charId === 'marco' ? 1 : 0);
    this.snap.replaceChildren(...[charId === 'marco' ? photoCard(pickPhotoFor('any', this._looks * 3), { tilt: -4 }) : null].filter(Boolean));
  }

  navOptions() { return { onBack: () => this.back(), initial: this.cards.find((c) => c.dataset.char === this.flow.picks.charId) }; }
}

export class KartScreen extends SelectBase {
  constructor(ui) { super(ui, 'kart'); this.hints = [['move', 'Move'], ['enter', 'Choose'], ['back', 'Back']]; }

  build() {
    const body = this.chrome('Choose your kart');
    this.cards = KARTS.map((k, i) => {
      const art = h('div.kc-art');
      const mods = h('div.kc-mods');
      const card = h('button.kcard.slide-l', {
        attrs: { type: 'button', 'aria-label': k.name }, data: { nav: '', kart: k.id, sfx: 'ui-confirm' }, style: { '--i': i },
        on: { click: (e) => this.ui.tapConfirm(card, e, () => this.advance(k.id)), 'mk-focus': () => this.preview(k.id) },
      }, art, h('div.kc-body', null, h('div.kc-n', { text: k.name }), h('div.kc-b', { text: k.feel ?? k.blurb }), mods));
      card.art = art; card.mods = mods;
      return card;
    });
    this.pv = new Preview(this.ui, { kart: true });
    body.append(h('div.sel-left', null, h('div.kart-list', null, ...this.cards)), h('div.sel-right', null, this.pv.el));
  }

  enter() {
    this.refreshHeader();
    this.pv.attach();
    const picks = this.flow.picks;
    const c = getCharacter(picks.charId);
    for (const card of this.cards) {
      const k = getKart(card.dataset.kart);
      card.art.innerHTML = kartSvg(k.id, c.colour, c.accent);
      clear(card.mods);
      for (const [key, label] of [['speed', 'SPD'], ['accel', 'ACC'], ['handling', 'HND'], ['weight', 'WGT']]) {
        const m = k.mods[key];
        card.mods.append(h(`span.chip${m > 0 ? '.up' : m < 0 ? '.down' : ''}`, { text: `${label} ${m > 0 ? '+' : ''}${m}` }));
      }
      card.classList.toggle('picked', card.dataset.kart === picks.kartId);
    }
    this.preview(picks.kartId);
  }

  leave() { this.ui.turntable.stop(); }

  preview(kartId) {
    this.flow.pick('kartId', kartId);
    const picks = this.flow.picks;
    this.pv.show(picks.charId, kartId, { ref: getCharacter(picks.charId).stats });
  }

  navOptions() { return { onBack: () => this.back(), initial: this.cards.find((c) => c.dataset.kart === this.flow.picks.kartId) }; }
}

/** Hexagonal certificate badge for a difficulty tier (1 to 3 stars). */
function tierBadge(tier, colour) {
  const id = uid('tb');
  const star = (cx, cy, r) => {
    const p = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; p.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`); }
    return `<polygon points="${p.join(' ')}" fill="#FFD166" stroke="#0B1D3A" stroke-width="2.4" stroke-linejoin="round"/>`;
  };
  const xs = tier === 1 ? [46] : tier === 2 ? [36, 56] : [30, 46, 62];
  const ys = tier === 3 ? [58, 52, 58] : [55, 55];
  const rs = tier === 3 ? [8, 10, 8] : [tier === 1 ? 11 : 9, 9];
  const starMarkup = xs.map((x, i) => star(x, ys[i] ?? 55, rs[i] ?? 10)).join('');
  return `<svg viewBox="0 0 92 92" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>` +
    `<polygon points="46,4 84,25 84,67 46,88 8,67 8,25" fill="${colour}" stroke="#0B1D3A" stroke-width="4" stroke-linejoin="round"/>` +
    `<polygon points="46,12 77,29 77,63 46,80 15,63 15,29" fill="none" stroke="#FFF8EC" stroke-width="2.6" opacity=".85"/>` +
    `<polygon points="46,4 84,25 84,46 8,46 8,25" fill="url(#${id})"/>` +
    `<path d="M30 40 a9 9 0 0 1 5-15 a12 12 0 0 1 22 2 a8 8 0 0 1 1 13z" fill="#FFF8EC" stroke="#0B1D3A" stroke-width="2.6" stroke-linejoin="round"/>` +
    starMarkup + `</svg>`;
}

export class DifficultyScreen extends SelectBase {
  constructor(ui) { super(ui, 'difficulty'); this.hints = [['move', 'Move'], ['enter', 'Choose'], ['back', 'Back']]; }

  build() {
    const body = this.chrome('Pick your level');
    body.classList.add('diff-body');
    const colours = ['#22D3EE', '#FFD166', '#E63946'];
    this.cards = DIFFICULTIES.map((d, i) => {
      const cp = DIFFICULTY_COPY[d.id];
      const card = h('button.diff-card.rise', {
        attrs: { type: 'button' }, data: { nav: '', id: d.id, sfx: 'ui-confirm' }, style: { '--i': i },
        on: { click: (e) => this.ui.tapConfirm(card, e, () => this.advance(d.id)), 'mk-focus': () => this.flow.pick('difficulty', d.id) },
      },
      cp.tag ? h('span.tag' + (d.id === 'professional' ? '.yellow' : d.id === 'specialty' ? '.red' : '.cyan'), { text: cp.tag }) : null,
      h('div.diff-badge', { html: tierBadge(i + 1, colours[i]) }),
      h('div.diff-n.disp', { text: d.name }),
      h('div.diff-t', { text: cp.tagline }),
      h('div.diff-p', { text: cp.blurb }),
      h('div.diff-pips', null, h('span', { text: 'RIVALS' }), ...[0, 1, 2].map((k) => h('i' + (k < cp.skill ? '.on' : '')))));
      return card;
    });
    this.speedPick = createSpeedPick(this.ui);
    body.append(...this.cards, this.speedPick.el);
  }

  enter() {
    this.refreshHeader();
    this.speedPick.el.style.display = this.flow.mode === 'gp' ? '' : 'none';   // the game speed is picked on the last step: here for a Grand Prix, on the track screen otherwise
    this.speedPick.sync();
    const p = this.flow.picks.difficulty;
    this.cards.forEach((c) => c.classList.toggle('picked', c.dataset.id === p));
  }

  navOptions() { return { onBack: () => this.back(), initial: this.cards.find((c) => c.dataset.id === this.flow.picks.difficulty) }; }
}

export class TrackScreen extends SelectBase {
  constructor(ui) { super(ui, 'track'); this.hints = [['move', 'Move'], ['enter', 'Race'], ['back', 'Back']]; }

  build() {
    const body = this.chrome('Choose your track');
    body.classList.add('trk-body');
    this.cards = TRACKS.map((t, i) => {
      const tags = (TRACK_TAGS[t.id] ?? []).map(([txt, col]) => h(`span.tag.${col}`, { text: txt }));
      const best = h('span.tv');
      const card = h('button.tcard.rise', {
        attrs: { type: 'button' }, data: { nav: '', track: t.id, sfx: 'ui-confirm' }, style: { '--i': i },
        on: { click: (e) => this.ui.tapConfirm(card, e, () => this.confirm(t.id)), 'mk-focus': () => this.preview(t.id) },
      }, h('div.tcard-art', { html: trackArt(t.id) }), h('div.tcard-n', { text: t.name }), h('div.tcard-b', null, h('span', { text: 'Best lap' }), best), h('div.tcard-tags', null, ...tags));
      card.best = best;
      return card;
    });
    this.dName = h('div.td-n.disp');
    this.dBlurb = h('div.td-b');
    this.dLap = h('b'); this.dRace = h('b');
    this.lapsLabel = h('span.lbl', { text: 'Laps' });
    this.lapBtns = LAP_OPTIONS.map((n) => h('button', { attrs: { type: 'button' }, data: { lap: n, nav: '', sfx: 'ui-click' }, text: String(n), on: { click: () => this.setLaps(n) } }));
    this.seg = h('div.seg', null, ...this.lapBtns);
    this.lapsPick = h('div.laps-pick', null, this.lapsLabel, this.seg);
    this.speedPick = createSpeedPick(this.ui);
    this.detail = h('div.panel.trk-detail.rise', { style: { '--i': 5 } },
      h('div.td-l', null, this.dName, this.dBlurb, h('div.td-times', null, h('div', null, h('span', { text: 'Best lap' }), this.dLap), h('div', null, h('span', { text: 'Best race' }), this.dRace))),
      h('div.td-r', null, this.speedPick.el, this.lapsPick));
    body.append(h('div.trk-row', null, ...this.cards), this.detail);
  }

  enter() {
    this.refreshHeader();
    const picks = this.flow.picks;
    const single = this.flow.mode !== 'gp';
    this.lapsPick.style.display = single ? '' : 'none';
    this.speedPick.sync();
    for (const c of this.cards) {
      const id = c.dataset.track;
      const best = this.ui.progress.getBest(id, undefined, picks.speedClass);
      c.best.textContent = best.bestLap ? formatTime(best.bestLap) : '-:--.---';
      c.classList.toggle('picked', id === picks.trackId);
      const locked = this.ui.unavailableTracks.has(id);
      c.classList.toggle('locked', locked);
      c.dataset.locked = locked ? '1' : '';
    }
    this.setLaps(picks.laps, true);
    this.preview(picks.trackId);
  }

  setLaps(n, silent = false) {
    if (!this.flow.pick('laps', n)) return;
    this.lapBtns.forEach((b) => b.classList.toggle('on', +b.dataset.lap === n));
    if (!silent) this.ui.sfx('ui-hover', { pitch: 0.9 + LAP_OPTIONS.indexOf(n) * 0.1 });
    this.preview(this.flow.picks.trackId);
  }

  preview(id) {
    this.flow.pick('trackId', id);
    const t = getTrackInfo(id);
    this.dName.textContent = t.name;
    this.dBlurb.textContent = t.blurb;
    const best = this.ui.progress.getBest(id, this.flow.picks.laps, this.flow.picks.speedClass);
    this.dLap.textContent = best.bestLap ? formatTime(best.bestLap) : '-:--.---';
    this.dRace.textContent = best.bestRace ? formatTime(best.bestRace) : '-:--.---';
  }

  confirm(id) {
    if (this.ui.unavailableTracks.has(id)) { this.ui.sfx('ui-error'); return; }
    this.advance(id);
  }

  navOptions() { return { onBack: () => this.back(), initial: this.cards.find((c) => c.dataset.track === this.flow.picks.trackId) }; }
}
