// About Marco: a bio card with the photo(s) if supplied, otherwise a big cartoon portrait.
import { Screen } from './screen.js';
import { h, fromHtml } from '../dom.js';
import { glyph } from '../icons.js';
import { portrait } from '../portraits.js';
import { unionFlag } from '../motifs.js';
import { polaroid } from '../polaroid.js';
import { Assets } from '../../core/assets.js';
import { ABOUT } from '../copy.js';

const BADGES = ['AWS Authorised Instructor', 'Solutions Architect Professional', 'ML Specialty'];

export class AboutScreen extends Screen {
  constructor(ui) { super(ui, 'about'); }

  build() {
    let photo;
    if (Assets.has('marco_full')) photo = h('img.ab-img', { attrs: { src: Assets.uri('marco_full'), alt: 'Marco', draggable: 'false' } });
    else if (Assets.has('marco_face_happy') || Assets.has('marco_face')) photo = h('img.ab-img', { attrs: { src: Assets.uri('marco_face_happy') ?? Assets.uri('marco_face'), alt: 'Marco', draggable: 'false' } });
    else photo = h('div.ab-toon', { html: portrait('marco', { mood: 'happy' }) });
    const facePill = Assets.has('marco_face') && Assets.has('marco_full') ? h('div.ab-face', { html: portrait('marco') }) : null;
    const strip = [polaroid('marco_rio', { tilt: -4 }), polaroid('marco_desk', { tilt: 3 })].filter(Boolean);
    this.backBtn = h('button.btn.small', { attrs: { type: 'button' }, data: { nav: '', sfx: 'ui-back' }, on: { click: () => this.back() } }, fromHtml(glyph('back')), h('span', { text: 'Back' }));
    this.link = h('a.btn.small.center', { attrs: { href: `https://${ABOUT.url}`, target: '_blank', rel: 'noopener noreferrer' }, data: { nav: '', sfx: 'ui-confirm' } }, fromHtml(glyph('cloud')), h('span', { text: ABOUT.url }));
    this.el.append(
      h('div.hdr.drop-in', null, h('div.hdr-l', null, h('div.hdr-title', { text: 'About Marco' }), h('div.hdr-sub', { text: 'The instructor behind the wheel' }))),
      h('div.screen-body.ab-body', null,
        h(`div.ab-card.slide-l${strip.length ? '.has-strip' : ''}`, null,
          h('div.ab-photo', null, h('div.ab-burst'), photo, facePill),
          h('div.ab-plate', null, h('div.ab-name.disp', { text: ABOUT.name }), h('div.ab-role', { text: ABOUT.role }), h('span.ab-flag', { html: unionFlag() })),
          strip.length ? h('div.ab-strip', null, ...strip) : null),
        h('div.panel.ab-text.rise', { style: { '--i': 2 } },
          h('div.ab-badges', null, ...BADGES.map((b, i) => h(`span.tag${i === 0 ? '.yellow' : '.cyan'}`, { text: b }))),
          ...ABOUT.paragraphs.map((p) => h('p', { text: p })),
          h('div.ab-facts', null, ...ABOUT.facts.map(([k, v]) => h('div', null, h('b', { text: k }), h('span', { text: v })))),
          h('ul.ab-quirks', null, ...ABOUT.quirks.map((q) => h('li', { text: q }))))),
      h('div.ftr', null, h('div.ftr-btns', null, this.backBtn, this.link)));
  }

  back() { this.ui.showMenu(); }

  navOptions() { return { onBack: () => this.back(), initial: this.backBtn }; }
}
