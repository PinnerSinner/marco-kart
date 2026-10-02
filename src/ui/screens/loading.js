// Loading / boot screen: logo, chunky progress bar with a kart riding it, rotating tips.
import { Screen } from './screen.js';
import { h, setText } from '../dom.js';
import { logoSvg } from '../motifs.js';
import { kartSvg } from '../kartArt.js';
import { shuffledTips } from '../copy.js';
import { polaroid } from '../polaroid.js';
import { photoCard, pickPhotoFor } from '../photoUi.js';

export class LoadingScreen extends Screen {
  constructor(ui) { super(ui, 'loading'); }

  build() {
    this.logo = h('div.logo.small.float', { html: logoSvg() });
    this.status = h('div.load-status.disp', { text: 'Warming up the tyres' });
    this.fill = h('div.load-fill');
    this.pct = h('span.load-pct.disp', { text: '' });
    this.kart = h('div.load-kart', { html: kartSvg('cruiser', 0xE63946, 0xFFFFFF) });
    this.bar = h('div.load-bar', null, h('div.load-track', null, this.fill), this.kart);
    this.tipText = h('div.tip-text');
    this.tip = h('div.panel.tip', null, h('span.tag.yellow', { text: 'TIP' }), this.tipText);
    this.el.append(h('div.load-stack', null, this.logo, this.status, h('div.load-barwrap', null, this.bar, this.pct), this.tip));
    this.tips = shuffledTips();
    this.tipIndex = 0;
    // Marco's snaps take turns beside the loading bar (skipped on small screens by CSS, absent without the assets)
    this.snaps = [polaroid('marco_rio', { tilt: 5, cls: 'load-snap' }), polaroid('marco_desk', { tilt: -5, cls: 'load-snap' })].filter(Boolean);
    const off = Math.floor(Math.random() * 20);
    for (let i = 0; i < 6; i++) this.snaps.push(photoCard(pickPhotoFor('any', off + i * 3), { tilt: i % 2 ? 5 : -5, cls: 'load-snap' }));
    this.snaps = this.snaps.filter(Boolean);
    this.snapIndex = Math.floor(Math.random() * Math.max(1, this.snaps.length));
    this.snapHost = h('div.load-snaphost');
    this.el.append(this.snapHost);
  }

  enter() {
    if (this.snaps.length) { this.snapHost.replaceChildren(this.snaps[this.snapIndex++ % this.snaps.length]); }
    this._showTip();
    clearInterval(this._timer);
    this._timer = setInterval(() => this._showTip(), 3800);
  }

  leave() { clearInterval(this._timer); }

  /**
   * @param {string} [text] status line
   * @param {number} [progress] 0..1, or undefined for the indeterminate sweep
   */
  set(text, progress) {
    if (text) setText(this.status, text);
    const known = typeof progress === 'number' && Number.isFinite(progress);
    this.bar.classList.toggle('indeterminate', !known);
    if (known) {
      const p = Math.min(1, Math.max(0, progress));
      this.bar.style.setProperty('--p', p.toFixed(3));
      setText(this.pct, `${Math.round(p * 100)}%`);
    } else setText(this.pct, '');
  }

  _showTip() {
    const t = this.tips[this.tipIndex++ % this.tips.length];
    this.tipText.classList.remove('swap');
    void this.tipText.offsetWidth;
    this.tipText.textContent = t;
    this.tipText.classList.add('swap');
    if (this.snaps.length > 1 && this.tipIndex > 1) this.snapHost.replaceChildren(this.snaps[this.snapIndex++ % this.snaps.length]);
  }

  navOptions() { return {}; }
}
