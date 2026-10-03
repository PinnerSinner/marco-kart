// Main menu: logo and six buttons on the left, a context card (mode blurb and best laps) with the player's racer in the middle, and a photo card on the right.
import { Screen } from './screen.js';
import { h, fromHtml, clear } from '../dom.js';
import { glyph } from '../icons.js';
import { logoSvg } from '../motifs.js';
import { portrait } from '../portraits.js';
import { charName, charTitle } from '../chars.js';
import { TRACKS } from '../../core/roster.js';
import { MENU_COPY, ABOUT } from '../copy.js';
import { guideItems } from '../itemGuide.js';
import { formatTime } from '../format.js';
import { photoCycle } from '../photoCycle.js';

const ITEMS = [
  { id: 'gp', label: 'Grand Prix', glyph: 'trophy', red: true },
  { id: 'single', label: 'Single Race', glyph: 'flag' },
  { id: 'time', label: 'Time Trial', glyph: 'timer' },
  { id: 'items', label: 'Item Guide', glyph: 'bolt' },
  { id: 'settings', label: 'Settings', glyph: 'gear' },
  { id: 'about', label: 'About Marco', glyph: 'user' },
];

export class MenuScreen extends Screen {
  constructor(ui) { super(ui, 'menu'); }

  build() {
    this.buttons = ITEMS.map((it, i) => h('button.btn.slide-l' + (it.red ? '.red' : ''), {
      attrs: { type: 'button' }, data: { nav: '', id: it.id, sfx: 'ui-confirm' }, style: { '--i': i },
      on: { click: () => this.pick(it.id) },
    }, fromHtml(glyph(it.glyph)), h('span', { text: it.label }), fromHtml(glyph('chev').replace('class="glyph', 'class="chev glyph'))));
    this.buttons.forEach((b, i) => b.addEventListener('mk-focus', () => this.showInfo(ITEMS[i].id)));
    this.list = h('div.menu-list', null, ...this.buttons);
    this.info = h('div.panel.menu-info.rise', { style: { '--i': 3 } });
    this.racer = h('div.panel.menu-racer.rise', { style: { '--i': 5 } });
    this.cycle = photoCycle('mh-photo');
    this.photo = h('div.menu-photo.slide-r', { style: { '--i': 4 } }, this.cycle.el);
    this.el.append(h(`div.screen-body.menu-body${this.cycle.el ? '' : '.no-photo'}`, null,
      h('div.menu-left', null, h('div.menu-logo.drop-in', { html: logoSvg() }), this.list),
      h('div.menu-mid', null, this.info, this.racer),
      this.cycle.el ? this.photo : null));
  }

  enter() {
    const picks = this.ui.progress.getPicks();
    this.racer.replaceChildren(
      h('div.mr-pt', { html: portrait(picks.charId, { mood: 'happy' }) }),
      h('div.mr-text', null, h('div.mr-n.disp', { text: charName(picks.charId) }), h('div.mr-t', { text: charTitle(picks.charId) }), h('div.tag.yellow', { text: 'YOUR RACER' })));
    this._info = null;
    this.showInfo('gp');
    this.cycle.start();
  }

  leave() { this.cycle.stop(); }

  /** @param {string} id menu item id */
  showInfo(id) {
    if (this._info === id) return;
    this._info = id;
    const c = MENU_COPY[id];
    clear(this.info);
    this.info.append(h('div.info-t.disp', { text: c.title }), h('p.info-p', { text: c.text }));
    const { heading, rows } = this.facts(id);
    this.info.append(h('div.info-h', { text: heading }), h('div.info-rows', null, ...rows.map(([k, v]) => h('div.info-row', null, h('span', { text: k }), h('span.tv', { text: v })))));
  }

  /**
   * The short list under a menu item's blurb: best laps for the race modes, a few live facts for the rest.
   * @param {string} id menu item id
   * @returns {{ heading: string, rows: string[][] }}
   */
  facts(id) {
    const s = this.ui.settings.get();
    if (id === 'gp' || id === 'single' || id === 'time') {
      const rows = TRACKS.map((t) => {
        const best = this.ui.progress.getBest(t.id, undefined, s.speedClass);
        return [t.name, best.bestLap ? formatTime(best.bestLap) : 'no time yet'];
      });
      return { heading: id === 'gp' ? 'THE MARCOVERSE CUP' : 'BEST LAPS', rows };
    }
    if (id === 'items') {
      const all = guideItems('all');
      return { heading: 'IN THE BOX', rows: [['Items', String(all.length)], ['Skill-based', String(all.filter((c) => c.skill).length)], ['Item slots', '2']] };
    }
    if (id === 'settings') {
      const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
      return { heading: 'RIGHT NOW', rows: [['Graphics', cap(s.quality)], ['Game speed', `${s.speedClass} Mbps`], ['Speed units', s.units === 'mph' ? 'mph' : 'km/h'], ['Touch controls', s.touch ? 'On' : 'Off']] };
    }
    return { heading: 'THE INSTRUCTOR', rows: ABOUT.facts.filter(([k]) => ['Certified', 'Teaches', 'Home', 'Fuel'].includes(k)) };
  }

  pick(id) {
    if (id === 'gp' || id === 'single' || id === 'time') this.ui.showSelect({ mode: id });
    else this.ui.show(id, { from: 'menu' });
  }

  navOptions() { return { onBack: () => this.ui.showTitle(), initial: this.buttons[0] }; }
}
