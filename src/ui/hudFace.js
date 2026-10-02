// A small live portrait of the player's driver on the HUD. It reacts to what happens to the player:
// hit / spun (ouch), boost (wow), new item (happy), overtook someone (smug), got overtaken (sad), finished (happy on the podium, sad otherwise).
// Marco uses his own expression photos (marcoFaceKey); other racers get the drawn bust in a matching mood.
import { bus } from '../core/bus.js';
import { Assets } from '../core/assets.js';
import { marcoFaceKey } from '../core/photos.js';
import { h } from './dom.js';
import { portrait } from './portraits.js';
import { caricatureBadge } from './caricatureUi.js';

/** Expression to draw-mood for the cartoon busts. */
const MOOD = { neutral: 'neutral', happy: 'happy', wow: 'happy', smug: 'happy', sad: 'sad', hit: 'sad' };

/** Asset key for an expression of Marco (smug has its own photo when supplied). */
export function faceKeyFor(expression) {
  if (expression === 'smug' && Assets.has('marco_face_smug')) return 'marco_face_smug';
  return marcoFaceKey(Assets, expression === 'smug' ? 'happy' : expression);
}

export class HudFace {
  /** @param {string} [playerId] racer id of the human */
  constructor(playerId = 'player') {
    this.playerId = playerId; this.charId = 'marco'; this.expr = 'neutral'; this.until = 0; this.sticky = null;
    this.el = h('div.hud-face', { attrs: { 'aria-hidden': 'true' } });
    this.inner = h('div.hud-face-in');                      // the clipped round picture; the caricature badge sits outside the clip on the frame
    this.el.append(this.inner);
    this.badge = caricatureBadge();
    if (this.badge) this.el.append(this.badge);
    this.offs = [];
    const on = (n, fn) => this.offs.push(bus.on(n, fn));
    const me = (id) => id === this.playerId;
    on('ui:caricatureart', (v) => { if (this.badge) this.badge.hidden = v === 'off'; });
    on('race:start', () => { this.sticky = null; this.set('neutral'); });
    on('kart:spin', (d) => me(d?.id) && this.set('hit', 1.5));
    on('item:hit', (d) => me(d?.victimId) && this.set('hit', 1.6));
    on('kart:wall-hit', (d) => me(d?.id) && (d.impact ?? 1) > 0.6 && this.set('hit', 0.9));
    on('kart:boost', (d) => me(d?.id) && this.set('wow', 1.3));
    on('item:get', (d) => (d?.isPlayer || me(d?.id)) && this.set('happy', 1.2));
    on('race:overtake', (d) => { if (d?.isPlayer) this.set('smug', 1.8); else if (me(d?.passedId)) this.set('sad', 1.6); });
    on('race:finish', (d) => { if (d?.isPlayer || me(d?.id)) { this.sticky = d.place <= 3 ? 'happy' : 'sad'; this.set(this.sticky); } });
    this.timer = setInterval(() => { if (this.until && performance.now() > this.until) { this.until = 0; this.render(this.sticky ?? 'neutral'); } }, 200);
    this.render('neutral');
  }

  /** @param {string} charId roster id of the player's character */
  setChar(charId) { this.charId = charId; this.sticky = null; this.expr = ''; this.render('neutral'); }

  /** Show an expression for `secs` seconds, then fall back to the resting one. */
  set(expression, secs = 0) {
    this.until = secs ? performance.now() + secs * 1000 : 0;
    this.render(expression);
  }

  render(expr) {
    if (expr === this.expr) return;
    this.expr = expr;
    const key = this.charId === 'marco' ? faceKeyFor(expr) : null;
    this.el.dataset.expr = expr;
    this.inner.replaceChildren(key
      ? h('img', { attrs: { src: Assets.uri(key), alt: '', draggable: 'false' } })
      : h('span.hud-face-svg', { html: portrait(this.charId, { mood: MOOD[expr] ?? 'neutral' }) }));
    this.el.classList.remove('pop'); void this.el.offsetWidth; this.el.classList.add('pop');
  }

  dispose() { for (const o of this.offs) o(); clearInterval(this.timer); this.el.remove(); }
}
