// Main menu: six big buttons on the left, a context card and the player's last-picked racer on the right.
import { Screen } from './screen.js';
import { h, fromHtml, clear } from '../dom.js';
import { glyph } from '../icons.js';
import { logoSvg } from '../motifs.js';
import { portrait } from '../portraits.js';
import { charName, charTitle } from '../chars.js';
import { TRACKS } from '../../core/roster.js';
import { MENU_COPY } from '../copy.js';
import { formatTime } from '../format.js';

const ITEMS = [
  { id: 'gp', label: 'Grand Prix', glyph: 'trophy', red: true },
  { id: 'single', label: 'Single Race', glyph: 'flag' },
  { id: 'time', label: 'Time Trial', glyph: 'timer' },
  { id: 'controls', label: 'Controls', glyph: 'pad' },
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
    this.hero = h('div.menu-hero.rise', { style: { '--i': 5 } });
    this.el.append(
      h('div.menu-logo.drop-in', { html: logoSvg() }),
      h('div.screen-body.menu-body', null, this.list, h('div.menu-side', null, this.info, this.hero)),
      h('div.ftr', null, this.ui.hintBar([['move', 'Move'], ['enter', 'Select']])));
  }

  enter() {
    const picks = this.ui.progress.getPicks();
    this.hero.innerHTML = '';
    this.hero.append(
      h('div.hero-card', null,
        h('div.hero-pt', { html: portrait(picks.charId, { mood: 'happy' }) }),
        h('div', null, h('div.hero-n.disp', { text: charName(picks.charId) }), h('div.hero-t', { text: charTitle(picks.charId) }), h('div.tag.yellow', { text: 'YOUR RACER' }))));
    this.showInfo('gp');
  }

  /** @param {string} id menu item id */
  showInfo(id) {
    if (this._info === id) return;
    this._info = id;
    const c = MENU_COPY[id];
    clear(this.info);
    this.info.append(h('div.info-t.disp', { text: c.title }), h('p.info-p', { text: c.text }));
    if (id === 'gp' || id === 'single' || id === 'time') {
      const rows = TRACKS.map((t) => {
        const best = this.ui.progress.getBest(t.id, undefined, this.ui.settings.get().speedClass);
        return h('div.info-row', null, h('span', { text: t.name }), h('span.tv', { text: best.bestLap ? formatTime(best.bestLap) : 'no time yet' }));
      });
      this.info.append(h('div.info-h', { text: id === 'gp' ? 'THE MARCOVERSE CUP' : 'BEST LAPS' }), ...rows);
    }
  }

  pick(id) {
    if (id === 'gp' || id === 'single' || id === 'time') this.ui.showSelect({ mode: id });
    else this.ui.show(id, { from: 'menu' });
  }

  navOptions() { return { onBack: () => this.ui.showTitle(), initial: this.buttons[0] }; }
}
