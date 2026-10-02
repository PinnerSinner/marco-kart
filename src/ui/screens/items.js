// Item Guide screen (main menu): every item in the game with its icon, name, one-sentence description, a "good against" tip and whether it is
// skill-based. Keyboard / gamepad: arrows move between the filter chips and the cards (the list scrolls to follow the focus), Esc / B goes back.
// Touch / mouse: tap a chip to filter, drag the list to scroll.
import { Screen } from './screen.js';
import { h, fromHtml } from '../dom.js';
import { glyph } from '../icons.js';
import { ItemGuide } from '../itemGuide.js';

export class ItemGuideScreen extends Screen {
  constructor(ui) { super(ui, 'items'); }

  build() {
    this.guide = new ItemGuide();
    this.backBtn = h('button.btn.small', { attrs: { type: 'button' }, data: { nav: '', sfx: 'ui-back' }, on: { click: () => this.back() } }, fromHtml(glyph('back')), h('span', { text: 'Back' }));
    this.el.append(
      h('div.hdr.drop-in', null, h('div.hdr-l', null, h('div.hdr-title', { text: 'Item guide' }), h('div.hdr-sub', { text: 'Every item, in plain English' }))),
      h('div.screen-body.ig-body-wrap', null, this.guide.el),
      h('div.ftr', null, this.ui.hintBar([['move', 'Browse'], ['back', 'Back']]), this.backBtn));
  }

  enter() { this.guide.reset(); }

  back() { this.ui.showMenu(); }

  navOptions() { return { onBack: () => this.back(), initial: this.guide.firstFocus() }; }
}
