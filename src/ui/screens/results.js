// Post-race screens: race results table, Grand Prix standings, and the podium / final screen.
import { Screen } from './screen.js';
import { h, fromHtml, clear, pop, U } from '../dom.js';
import { glyph, trophySvg } from '../icons.js';
import { portrait } from '../portraits.js';
import { photoCard, pickPhotoFor } from '../photoUi.js';
import { charName } from '../chars.js';
import { ordinalParts, formatTime, formatPoints } from '../format.js';
import { normaliseStandings, normaliseFinal, previousRanks } from '../normalise.js';
import { polaroid } from '../polaroid.js';

const moodForPlace = (place, n) => (place <= Math.min(3, Math.ceil(n / 2)) ? 'happy' : place > n - 2 && n > 3 ? 'sad' : 'neutral');
const medal = (place) => (place <= 3 ? `.m${place}` : '');
const TROPHY_COPY = {
  gold: ['Gold trophy', 'Top of the Marcoverse Cup. Certificate of excellence, issued.'],
  silver: ['Silver trophy', 'A very respectable second. The kettle is on.'],
  bronze: ['Bronze trophy', 'On the podium, which is more than most of us manage.'],
  none: ['No trophy this time', 'Have a cup of tea, review the racing line and go again.'],
};

/** A labelled action button used at the bottom of the result screens. */
function actionBtn(label, glyphName, onClick, { red = false, sfx = 'ui-confirm', center = false } = {}) {
  return h(`button.btn${red ? '.red' : ''}${center ? '.center' : ''}`, { attrs: { type: 'button' }, data: { nav: '', sfx }, on: { click: onClick } }, fromHtml(glyph(glyphName)), h('span', { text: label }), fromHtml(glyph('chev').replace('class="glyph', 'class="chev glyph')));
}

export class ResultsScreen extends Screen {
  constructor(ui) { super(ui, 'results'); }

  build() {
    this.title = h('div.hdr-title', { text: 'Race results' });
    this.sub = h('div.hdr-sub');
    this.table = h('div.panel.res-table');
    this.side = h('div.res-side');
    this.el.append(h('div.hdr.drop-in', null, h('div.hdr-l', null, this.title, this.sub)), h('div.screen-body.res-body', null, this.table, this.side));
  }

  /**
   * @param {{ results: object[], gp: boolean, trackName?: string, records?: object|null, raceIndex?: number, total?: number }} p
   */
  enter(p) {
    const rows = [...(p.results ?? [])].sort((a, b) => a.place - b.place);
    const gp = !!p.gp;
    const n = rows.length;
    this.sub.textContent = [p.trackName, p.speedName, gp && p.total ? `Race ${(p.raceIndex ?? 0) + 1} of ${p.total}` : ''].filter(Boolean).join('  ·  ');
    clear(this.table);
    this.table.append(h('div.res-row.head', null, h('span.rp', { text: 'Pos' }), h('span.rpt'), h('span.rn', { text: 'Racer' }), h('span.rt', { text: 'Best lap' }), h('span.rt', { text: 'Time' }), gp ? h('span.rpts', { text: 'Pts' }) : null));
    rows.forEach((r, i) => {
      const op = ordinalParts(r.place);
      this.table.append(h(`div.res-row.slide-r${r.isPlayer ? '.me' : ''}${r.time == null ? '.dnf' : ''}`, { style: { '--i': i } },
        h(`span.rp.disp${medal(r.place)}`, null, op.num, h('small', { text: op.suffix })),
        h('span.rpt', { html: portrait(r.charId ?? r.id) }),
        h('span.rn', null, h('span', { text: r.name || charName(r.charId) }), r.isPlayer ? h('span.tag.yellow', { text: 'YOU' }) : null),
        h('span.rt', { text: r.bestLap != null ? formatTime(r.bestLap) : '-:--.---' }),
        h('span.rt.strong', { text: r.time != null ? formatTime(r.time) : 'DNF' }),
        gp ? h('span.rpts.disp', { text: formatPoints(r.points) || '0' }) : null));
    });
    if (n === 0) this.table.append(h('div.res-empty', { text: 'No results to show.' }));
    // side card
    const me = rows.find((r) => r.isPlayer) ?? rows[0];
    clear(this.side);
    if (me) {
      const op = ordinalParts(me.place);
      const rec = p.records;
      this.side.append(h('div.panel.res-me.zoom-in', { style: { '--i': 3 } },
        h('div.res-me-pt', { html: portrait(me.charId ?? me.id, { mood: moodForPlace(me.place, n) }) }),
        h('div.res-me-t', null, h('small', { text: 'YOU FINISHED' }), h('div.res-me-p.disp', null, op.num, h('small', { text: op.suffix })),
          h('div.res-me-time', { text: me.time != null ? formatTime(me.time) : 'Did not finish' }),
          h('div.res-tags', null, rec?.newBestLap ? h('span.tag.cyan', { text: 'New best lap' }) : null, rec?.newBestRace ? h('span.tag.yellow', { text: 'New record' }) : null, gp && me.points ? h('span.tag.green', { text: `${formatPoints(me.points)} points` }) : null)),
        // top three: Marco's thumbs-up from his desk
        me.place <= 3 && (me.charId ?? me.id) === 'marco' ? polaroid('marco_desk', { caption: me.place === 1 ? 'Nailed it' : 'Thumbs up', tilt: 4, cls: 'stamp' })
          : (me.charId ?? me.id) === 'marco' && (me.place >= 6 || me.time == null) ? photoCard(pickPhotoFor('lose', me.place), { tilt: -4, cls: 'stamp' }) : null));
    }
    const btns = h('div.res-btns');
    if (gp) btns.append(actionBtn('Continue', 'play', () => this.ui.emit('ui:continue', {}), { red: true }));
    else {
      btns.append(actionBtn('Race again', 'restart', () => this.ui.emit('ui:restart', {}), { red: true }));
      btns.append(actionBtn('Main menu', 'home', () => this.ui.emit('ui:quit', {})));
    }
    this.side.append(btns);
    this.primary = btns.firstChild;
  }

  navOptions() { return { initial: this.primary, onBack: null }; }
}

export class StandingsScreen extends Screen {
  constructor(ui) { super(ui, 'standings'); }

  build() {
    this.sub = h('div.hdr-sub');
    this.list = h('div.panel.st-list');
    this.side = h('div.res-side');
    this.el.append(h('div.hdr.drop-in', null, h('div.hdr-l', null, h('div.hdr-title', { text: 'Grand Prix standings' }), this.sub)), h('div.screen-body.res-body', null, this.list, this.side));
  }

  /**
   * @param {{ rows: ReturnType<typeof normaliseStandings>, raceIndex: number, total: number }} p
   */
  enter(p) {
    const rows = p.rows;
    const max = Math.max(1, ...rows.map((r) => r.points));
    this.sub.textContent = `After race ${(p.raceIndex ?? 0) + 1} of ${p.total ?? '?'}`;
    clear(this.list);
    clearTimeout(this._t); cancelAnimationFrame(this._raf);
    const prev = previousRanks(rows);
    const ROW = 38;
    const box = h('div.st-rows', { style: { height: U(rows.length * ROW) } });
    const els = rows.map((r, i) => {
      const from = prev.get(r.id) ?? i;
      const pts = h('span.st-pts.disp', { text: String(r.points - r.gained) });
      const bar = h('i');
      const el = h(`div.st-row${r.isPlayer ? '.me' : ''}`, { style: { '--y': from, '--rowh': ROW } },
        h('span.rp.disp', { text: String(from + 1) }),
        h('span.rpt', { html: portrait(r.charId) }),
        h('span.rn', null, h('span', { text: r.name || charName(r.charId) }), r.isPlayer ? h('span.tag.yellow', { text: 'YOU' }) : null),
        h('div.st-bar', null, bar), r.gained ? h('span.st-gain.disp', { text: formatPoints(r.gained) }) : h('span.st-gain'), pts);
      bar.style.width = `${((r.points - r.gained) / max) * 100}%`;
      box.append(el);
      return { el, r, pts, bar, rank: el.firstChild };
    });
    this.list.append(box);
    // phase 2: count up the points and slide rows into their new order
    this._t = setTimeout(() => {
      const t0 = performance.now(); const dur = 900;
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const e = 1 - (1 - k) ** 3;
        for (const x of els) { x.pts.textContent = String(Math.round(x.r.points - x.r.gained + x.r.gained * e)); x.bar.style.width = `${((x.r.points - x.r.gained + x.r.gained * e) / max) * 100}%`; }
        if (k < 1) this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
      els.forEach((x, i) => { x.el.style.setProperty('--y', i); x.rank.textContent = String(i + 1); if (prev.get(x.r.id) !== i) { pop(x.rank, { from: 1.8, ms: 500 }); } });
      this.ui.sfx('overtake');
    }, 900);
    clear(this.side);
    const total = p.total ?? 0; const last = total > 0 && (p.raceIndex ?? 0) + 1 >= total;
    const btns = h('div.res-btns', null, actionBtn(last ? 'See the podium' : 'Next race', last ? 'trophy' : 'play', () => this.ui.emit('ui:continue', {}), { red: true }), actionBtn('Quit Grand Prix', 'quit', () => this.ui.emit('ui:quit', {}), { sfx: 'ui-back' }));
    const leader = rows[0];
    this.side.append(h('div.panel.res-me.zoom-in', { style: { '--i': 3 } },
      h('div.res-me-pt', { html: portrait(leader.charId, { mood: 'happy' }) }),
      h('div.res-me-t', null, h('small', { text: 'LEADING THE CUP' }), h('div.res-me-time', { text: leader.name || charName(leader.charId) }), h('div.res-tags', null, h('span.tag.yellow', { text: `${leader.points} points` })))), btns);
    this.primary = btns.firstChild;
  }

  leave() { clearTimeout(this._t); cancelAnimationFrame(this._raf); }

  navOptions() { return { initial: this.primary, onBack: null }; }
}

export class PodiumScreen extends Screen {
  constructor(ui) { super(ui, 'podium'); }

  build() {
    this.confetti = h('div.confetti');
    this.stage = h('div.pod-stage');
    this.left = h('div.panel.pod-list');
    this.card = h('div.panel.pod-card');
    this.btns = h('div.res-btns');
    this.el.append(this.confetti,
      h('div.hdr.drop-in', null, h('div.hdr-l', null, h('div.hdr-title', { text: 'Marcoverse Cup' }), h('div.hdr-sub', { text: 'Final results' }))),
      h('div.screen-body.pod-body', null, this.left, this.stage, h('div.pod-right', null, this.card, this.btns)));
  }

  /** @param {ReturnType<typeof normaliseFinal>} f */
  enter(f) {
    const { rows, trophy, player } = f;
    clear(this.stage); clear(this.left); clear(this.card); clear(this.btns); clear(this.confetti);
    const top = rows.slice(0, 3);
    const order = [top[1], top[0], top[2]].filter(Boolean);
    const heights = { 1: 150, 2: 112, 3: 84 };
    order.forEach((r) => {
      const you = r.isPlayer;
      const mood = you ? 'happy' : r.place === 1 ? 'happy' : 'neutral';
      this.stage.append(h(`div.pod-col.p${r.place}`, { style: { '--i': 3 - r.place } },
        h('div.pod-pt', { html: portrait(r.charId, { mood }) }),
        h('div.pod-n.disp', null, r.name || charName(r.charId), you ? h('span.tag.yellow', { text: 'YOU' }) : null),
        h('div.pod-block', { style: { height: U(heights[r.place]) } }, h('span.disp', { text: String(r.place) }), h('small', { text: `${r.points} pts` }))));
    });
    rows.slice(3).forEach((r, i) => {
      const op = ordinalParts(r.place);
      this.left.append(h(`div.pl-row${r.isPlayer ? '.me' : ''}.slide-l`, { style: { '--i': i } }, h('span.rp.disp', null, op.num, h('small', { text: op.suffix })), h('span.rpt', { html: portrait(r.charId) }), h('span.rn', { text: r.name || charName(r.charId) }), h('span.rpts.disp', { text: `${r.points}` })));
    });
    this.left.style.display = rows.length > 3 ? '' : 'none';
    const [t, sub] = TROPHY_COPY[trophy];
    const mood = trophy === 'none' ? 'sad' : 'happy';
    this.card.className = `panel pod-card zoom-in tier-${trophy}`;
    this.card.append(h('div.pod-tr', { html: trophySvg(trophy) }), h('div.pod-ct', null, h('small', { text: 'YOUR RESULT' }), h('div.pod-tt.disp', { text: t }), h('p', { text: sub }),
      player ? h('div.pod-me', null, h('span.pod-me-pt', { html: portrait(player.charId, { mood }) }), h('span', null, h('b.disp', { text: `${ordinalParts(player.place).num}${ordinalParts(player.place).suffix}` }), h('small', { text: `${player.points} points` }))) : null));
    this.btns.append(actionBtn('Continue', 'play', () => this.ui.emit('ui:continue', {}), { red: true }));
    this.primary = this.btns.firstChild;
    const snap = trophy !== 'none' && player?.charId === 'marco' ? polaroid('marco_rio', { caption: trophy === 'gold' ? 'Champion!' : 'On the podium', tilt: 5, cls: 'stamp' }) : null;
    if (snap) this.card.append(snap);
    if (player?.charId === 'marco') {
      const extra = trophy === 'gold' ? photoCard(pickPhotoFor('win', 0), { caption: 'Golden hour', tilt: -5, cls: 'stamp l' }) : trophy === 'none' ? photoCard(pickPhotoFor('lose', 1), { tilt: 4, cls: 'stamp' }) : null;
      if (extra) this.card.append(extra);
    }
    if (trophy !== 'none') this._confetti();
    this.ui.sfx(trophy === 'none' ? 'lose-sting' : 'win-fanfare');
  }

  _confetti() {
    const cols = ['#E63946', '#FFD166', '#22D3EE', '#FFF8EC', '#FF3DCB', '#3DDC84'];
    let seed = 7;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 70; i++) {
      this.confetti.append(h('i', { style: { '--x': `${(r() * 100).toFixed(1)}%`, '--d': `${(3.4 + r() * 3).toFixed(2)}s`, '--dl': `${(-r() * 6).toFixed(2)}s`, '--c': cols[i % cols.length], '--w': U((5 + r() * 7).toFixed(1)), '--rx': `${Math.floor(r() * 360)}deg`, '--sw': U((10 + r() * 50).toFixed(0)) } }));
    }
  }

  navOptions() { return { initial: this.primary, onBack: null }; }
}
