// Pause menu overlay: resume, restart, controls, quick volume sliders, quit. Sits above the HUD and pushes its own nav scope.
import { h, fromHtml, clear } from '../dom.js';
import { glyph } from '../icons.js';
import { volumeRows } from './settings.js';
import { ControlsScreen } from './controls.js';
import { ItemGuide } from '../itemGuide.js';
import { photoCard, pickPhotoFor } from '../photoUi.js';
import { caricatureScatter, caricatureCorner } from '../caricatureUi.js';

const btn = (label, g, onClick, { red = false, sfx = 'ui-confirm' } = {}) =>
  h(`button.btn${red ? '.red' : ''}`, { attrs: { type: 'button' }, data: { nav: '', sfx }, on: { click: onClick } }, fromHtml(glyph(g)), h('span', { text: label }), fromHtml(glyph('chev').replace('class="glyph', 'class="chev glyph')));

export class PauseMenu {
  /** @param {import('../UI.js').UI} ui */
  constructor(ui) {
    this.ui = ui;
    this.open = false;
    this.view = 'main';
    this.el = h('div.pause', { attrs: { hidden: '' } });
    this._build();
  }

  _build() {
    const ui = this.ui;
    this.resume = btn('Resume', 'play', () => ui.resumeFromPause(), { red: true });
    this.restart = btn('Restart race', 'restart', () => this._confirm('restart'));
    this.controls = btn('Controls', 'pad', () => this._view('controls'));
    this.itemGuide = btn('Item guide', 'bolt', () => this._view('items'));
    this.quit = btn('Quit to menu', 'quit', () => this._confirm('quit'), { sfx: 'ui-back' });
    this.vols = volumeRows(ui, ['master', 'music', 'sfx']);
    this.mainView = h('div.pause-main', null,
      h('div.pause-list', null, this.resume, this.restart, this.controls, this.itemGuide, this.quit),
      h('div.panel.pause-vol', null, h('div.set-h', { text: 'Volume' }), ...this.vols.rows));
    // controls sub-view
    this.ctlTable = h('div.ctl-table.panel');
    this.ctlBack = h('button.btn.small', { attrs: { type: 'button' }, data: { nav: '', sfx: 'ui-back' }, on: { click: () => this._view('main') } }, fromHtml(glyph('back')), h('span', { text: 'Back' }));
    this.ctlView = h('div.pause-ctl', { attrs: { hidden: '' } }, this.ctlTable, h('div.ftr', null, h('span'), this.ctlBack));
    // item guide sub-view (the same grid as the main menu's Item Guide screen)
    this.guide = new ItemGuide({ compact: true });
    this.itemsBack = h('button.btn.small', { attrs: { type: 'button' }, data: { nav: '', sfx: 'ui-back' }, on: { click: () => this._view('main') } }, fromHtml(glyph('back')), h('span', { text: 'Back' }));
    this.itemsView = h('div.pause-items', { attrs: { hidden: '' } }, this.guide.el, h('div.ftr', null, h('span'), this.itemsBack));
    // confirm sub-view
    this.confirmText = h('p');
    this.confirmTitle = h('div.pause-ct.disp');
    this.yes = h('button.btn.red.center', { attrs: { type: 'button' }, data: { nav: '', sfx: 'ui-confirm' } }, h('span', { text: 'Yes' }));
    this.no = h('button.btn.center', { attrs: { type: 'button' }, data: { nav: '', sfx: 'ui-back' }, on: { click: () => this._view('main') } }, h('span', { text: 'Keep racing' }));
    this.confirmView = h('div.panel.pause-confirm', { attrs: { hidden: '' } }, this.confirmTitle, this.confirmText, h('div.pause-yn', null, this.no, this.yes));
    this.snap = h('div.pause-snap');
    this.title = h('div.pause-title.disp', { text: 'Paused' });
    this.cari = h('div.pause-cari');                       // faint caricature collage behind the menu, rebuilt on every open (new picks)
    this.cariCorner = h('div.pause-cari-corner');
    this.el.append(h('div.pause-dim'), this.cari, h('div.pause-in', null, this.title, this.mainView, this.ctlView, this.itemsView, this.confirmView), this.snap, this.cariCorner);
  }

  _confirm(kind) {
    const restart = kind === 'restart';
    this.confirmTitle.textContent = restart ? 'Restart the race?' : 'Quit to the menu?';
    this.confirmText.textContent = restart ? 'You will go back to the start line. Your current lap times are lost.' : 'This race will be abandoned and you will head back to the main menu.';
    this.yes.firstChild.textContent = restart ? 'Restart' : 'Quit';
    this.yes.onclick = () => (restart ? this.ui.restartFromPause() : this.ui.quitFromPause());
    this._view('confirm');
  }

  _view(v) {
    this.view = v;
    this.title.textContent = v === 'controls' ? 'Controls' : v === 'items' ? 'Item guide' : v === 'confirm' ? 'Are you sure?' : 'Paused';
    this.mainView.hidden = v !== 'main';
    this.ctlView.hidden = v !== 'controls';
    this.itemsView.hidden = v !== 'items';
    this.el.classList.toggle('view-items', v === 'items');
    this.confirmView.hidden = v !== 'confirm';
    if (v === 'items') this.guide.reset();
    if (v === 'controls') ControlsScreen.fillTable(this.ctlTable, ControlsScreen.bindings(this.ui.input));
    const initial = v === 'main' ? this.resume : v === 'controls' ? this.ctlBack : v === 'items' ? this.guide.firstFocus() : this.no;
    this.ui.nav.refresh(initial);
  }

  /** Open the menu and take over navigation. */
  show() {
    if (this.open) return;
    this.open = true;
    this.el.hidden = false;
    this.vols.refresh();
    this.snap.replaceChildren(...[photoCard(pickPhotoFor(['cool', 'funny', 'happy'][this._n = ((this._n ?? -1) + 1) % 3], this._n * 5 + 1), { tilt: 5 })].filter(Boolean));
    this._cn = (this._cn ?? -1) + 1;
    this.cari.replaceChildren(...[caricatureScatter(this._cn * 3 + 1, { count: 7 })].filter(Boolean));
    this.cariCorner.replaceChildren(...[caricatureCorner(this._cn)].filter(Boolean));
    this.view = 'main';
    this.mainView.hidden = false; this.ctlView.hidden = true; this.itemsView.hidden = true; this.confirmView.hidden = true; this.el.classList.remove('view-items');
    this.title.textContent = 'Paused';
    this.el.classList.remove('is-in'); void this.el.offsetWidth; this.el.classList.add('is-in');
    this.ui.nav.push(this.el, { initial: this.resume, onBack: () => (this.view === 'main' ? this.ui.resumeFromPause() : this._view('main')), onStart: () => this.ui.resumeFromPause() });
    this.ui.sfx('ui-confirm', { pitch: 0.9 });
  }

  /** Close the menu and give navigation back. */
  hide() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.ui.nav.pop();
  }
}
