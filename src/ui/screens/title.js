// Title screen: logo, "press any key", brand line, karts flying past, Marco hero.
import { Screen } from './screen.js';
import { h, fromHtml, U } from '../dom.js';
import { logoSvg } from '../motifs.js';
import { kartSvg } from '../kartArt.js';
import { portrait } from '../portraits.js';
import { Assets } from '../../core/assets.js';
import { CHARACTERS, KARTS } from '../../core/roster.js';
import { HERO_LINES } from '../copy.js';
import { photoCycle } from '../photoCycle.js';
import { detectTouch } from '../settings.js';

export class TitleScreen extends Screen {
  constructor(ui) { super(ui, 'title'); }

  build() {
    const touch = detectTouch();
    this.logo = h('div.logo.zoom-in', { html: logoSvg() });
    this.press = h('button.press.disp', { attrs: { type: 'button' }, data: { nav: '', sfx: 'ui-confirm' }, text: touch ? 'TAP TO START' : 'PRESS ANY KEY', on: { click: () => this._start() } });
    const brand = h('div.brand.rise', { style: { '--i': 6 } },
      Assets.has('logo_marcoverse') ? h('img.brand-logo', { attrs: { src: Assets.uri('logo_marcoverse'), alt: 'Marcoverse' } }) : h('span.brand-mark.disp', { text: 'MARCOVERSE' }),
      );
    // flyby karts
    this.fly = h('div.flyby');
    CHARACTERS.slice(0, 4).forEach((c, i) => {
      this.fly.append(h('div.fly', { style: { '--d': `${7 + i * 1.6}s`, '--dl': `${-i * 2.6}s`, '--y': U(i % 2 ? 4 : 0) }, html: kartSvg(KARTS[i % KARTS.length].id, c.colour, c.accent) }));
    });
    // chequered-flag ribbon with a framed round badge of the passport photo
    const badgeImg = Assets.has('face_passport') ? Assets.uri('face_passport') : Assets.has('photo_passport') ? Assets.uri('photo_passport') : null;
    const badge = h('div.chq-badge', null, badgeImg
      ? h('img', { attrs: { src: badgeImg, alt: '', draggable: 'false' }, on: { error: (e) => e.target.replaceWith(h('div.chq-fallback', { html: portrait('marco', { mood: 'happy' }) })) } })
      : h('div.chq-fallback', { html: portrait('marco', { mood: 'happy' }) }));
    this.ribbon = h('div.chq', null, h('span.chq-side'), badge,
      h('div.chq-plate.disp', null, h('small', { text: 'DRIVER 01' }), h('b', { text: 'MARCO' })), h('span.chq-side'));
    // hero: a photo card that cycles through a few of Marco's best photos (placeholders only for missing ones)
    let hero;
    this.cycle = photoCycle('hero-card');
    if (this.cycle.el) {
      hero = h('div.hero.photo.slide-r', null, this.cycle.el);
    } else {
      hero = h('div.hero.slide-r', null,
        h('div.hero-burst'),
        h('div.hero-portrait', { html: portrait('marco', { mood: 'happy' }) }));
    }
    this.bubble = h('div.bubble.disp', { text: HERO_LINES[0] });
    hero.append(this.bubble);
    this.hero = hero;
    this.el.append(
      h('div.title-center', null, this.logo, this.ribbon, h('div.rise', { style: { '--i': 4 } }, this.press)),
      this.fly, hero, brand);
  }

  enter() {
    this.bubble.textContent = HERO_LINES[Math.floor(Math.random() * HERO_LINES.length)];
    this.cycle.start();
  }

  leave() { this.cycle.stop(); }

  navOptions() {
    return { initial: this.press, onAnyKey: () => { this.ui.sfx('ui-confirm'); this._start(); } };
  }

  /** The first key press or tap: announce it (Marco greets you with his "welcome" recording) and go to the menu. */
  _start() {
    this.ui.showMenu();
    this.ui.emit('ui:title-key', {});            // after the screen change: moving on clears the HUD captions, and the greeting's caption must survive
  }
}
