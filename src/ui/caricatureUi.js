// Marco's caricature art in the 2D UI: collage backdrops behind the loading and results screens, the pause
// menu corner, and the small badge on the HUD portrait. The pictures are comic-style art made from his own photos (tools/caricature_build.py)
// plus anything dropped into assets/user/ as art_<name>.png|jpg. It is "caricature art": never "AI art".
// Every helper returns null when no art is present (or the player turned 'Caricature art' off), so screens simply skip the extra.
import { Assets } from '../core/assets.js';
import { bus } from '../core/bus.js';
import { h } from './dom.js';
import { createStore } from './storage.js';
import { artEntries, artFor, hashStr } from '../visuals/caricature.js';

/** Options of the 'Caricature art' setting (the 3D art around the tracks and the 2D collages). */
export const CARICATURE_ART = [{ id: 'auto', label: 'Auto' }, { id: 'lots', label: 'Lots' }, { id: 'few', label: 'Few' }, { id: 'off', label: 'Off' }];

/** How much 2D collage each setting gives (1 = the normal amount). */
export const COLLAGE_AMOUNT = { auto: 1, lots: 1.5, few: 0.5, off: 0 };

let store = null;

/** @returns {'auto'|'lots'|'few'|'off'} the saved 'Caricature art' choice (auto follows the graphics quality) */
export function getCaricatureArt() {
  store ??= createStore();
  const v = store.get('caricatureArt', 'auto');
  return CARICATURE_ART.some((o) => o.id === v) ? v : 'auto';
}

/** Save the choice and announce it on the bus as `ui:caricatureart`. */
export function setCaricatureArt(v) {
  if (!CARICATURE_ART.some((o) => o.id === v)) return;
  store ??= createStore();
  store.set('caricatureArt', v);
  bus.emit('ui:caricatureart', v);
}

/** Pieces that suit a screen, best first; empty when there is no art. */
export function uiPieces({ A = Assets, styles, entries } = {}) {
  return artFor('ui', { A, styles, entries });
}

/**
 * Deterministic pick of one piece.
 * @param {'any'|'poster'|'wide'|'sticker'|'win'|'lose'|'badge'|string} kind `poster`: portrait / square pictures; `wide`: murals and strips;
 *   `sticker`: die-cut pieces; `win` / `lose`: moods; 'track:<id>' suits a track
 * @param {number} [seed]
 * @param {{A?: typeof Assets, entries?: object[]}} [o]
 * @returns {object|null} an entry of artEntries() or null when there is no art
 */
export function pickCaricature(kind = 'any', seed = 0, { A = Assets, entries } = {}) {
  const all = entries ?? artEntries(A);
  if (!all.length) return null;
  const by = (f) => all.filter(f);
  const ui = (e) => e.roles.includes('ui');
  const TRACK_WORDS = { copacabana: ['rio', 'sugarloaf', 'flag', 'holi'], blighty: ['blighty', 'stonehenge', 'couch', 'yoda'], datacentre: ['desk', 'snake', 'laptop', 'couch'], marcoverse: ['marco', 'desert', 'hippie'] };
  let list = [];
  if (kind === 'poster') list = by((e) => ui(e) && !e.alpha && e.aspect >= 0.55 && e.aspect <= 1.1);
  else if (kind === 'wide') list = by((e) => ui(e) && !e.alpha && e.aspect >= 1.6);
  else if (kind === 'sticker') list = by((e) => e.alpha && ui(e));
  else if (kind === 'win') list = by((e) => ['popart', 'album', 'card', 'toon', 'bighead'].includes(e.style));
  else if (kind === 'lose') list = by((e) => ['wanted', 'tarot', 'pixel', 'constructivist'].includes(e.style));
  else if (kind === 'badge') list = by((e) => e.alpha && e.aspect >= 0.8 && e.aspect <= 1.25 && ['sticker', 'mascot'].includes(e.style));
  else if (kind.startsWith('track:')) { const w = TRACK_WORDS[kind.slice(6)] ?? []; list = by((e) => ui(e) && w.some((x) => e.name.includes(x))); }
  if (!list.length) list = by(ui);
  if (!list.length) list = all;
  return list[Math.abs(Math.floor(seed)) % list.length];
}

const src = (e, A = Assets) => (typeof e === 'string' ? A.uri(e) : A.uri(e.key));

/**
 * A single framed picture, tilted (a comic print on the wall). The art carries its own captions, so there is no caption line.
 * @param {object|string|null} piece entry of artEntries() or an asset key
 * @param {{tilt?: number, cls?: string, A?: typeof Assets}} [o]
 * @returns {HTMLElement|null}
 */
export function caricatureCard(piece, { tilt = -3, cls = '', A = Assets } = {}) {
  if (!piece) return null;
  const uri = src(piece, A);
  if (!uri) return null;
  const e = typeof piece === 'string' ? { alpha: /^data:image\/png/i.test(uri) } : piece;
  return h(`figure.cari-card${e.alpha ? '.die' : ''}${cls ? '.' + cls.split(' ').join('.') : ''}`, { style: { '--tilt': `${tilt}deg` }, attrs: { 'aria-hidden': 'true' } },
    h('img', { attrs: { src: uri, alt: '', draggable: 'false', decoding: 'async' } }));
}

/**
 * A wall of tilted pieces for behind a screen (like the menu photo wall but made of caricature art). Decorative, ignores pointer events.
 * @param {number} [seed] @param {{cols?: number, rows?: number, A?: typeof Assets, entries?: object[], amount?: number}} [o]
 * @returns {HTMLElement|null}
 */
export function caricatureWall(seed = 0, { cols = 5, rows = 3, A = Assets, entries, amount = COLLAGE_AMOUNT[getCaricatureArt()] } = {}) {
  const all = uiPieces({ A, entries });
  if (!all.length || amount <= 0) return null;
  const n = Math.max(3, Math.round(cols * rows * Math.min(1, 0.35 + amount * 0.65)));
  const wall = h('div.cari-wall', { attrs: { 'aria-hidden': 'true' }, style: { '--cols': cols } });
  for (let i = 0; i < n; i++) {
    const p = all[(i * 7 + seed) % all.length];
    const card = caricatureCard(p, { tilt: (((i * 37 + seed * 11) % 17) - 8) * 0.9, A });
    if (!card) continue;
    card.style.setProperty('--dl', `${-((i * 1.7) % 9).toFixed(1)}s`);
    wall.append(card);
  }
  return wall.children.length ? wall : null;
}

/** Anchor slots (percent of the screen, size in design units, tilt) for scattered pieces, per layout: kept clear of the logo, headers and panels. */
const SLOT_SETS = {
  podium: [[1, 76, 150, -7], [15, 80, 170, 6], [32, 84, 140, -5], [50, 84, 160, 8], [68, 80, 150, -6], [84, 82, 170, 7], [93, 62, 120, 5], [0, 54, 110, -8]],
  any: [[3, 8, 150, -9], [84, 5, 170, 7], [90, 46, 140, -6], [1, 52, 130, 8], [70, 74, 190, -5], [10, 76, 170, 6], [44, 2, 120, -4], [50, 80, 140, 5], [24, 36, 120, 9], [76, 30, 120, -8], [33, 64, 110, -7], [60, 14, 110, 6]],
};

/**
 * Pieces scattered around the screen like stickers on a laptop lid.
 * @param {number} [seed] @param {{count?: number, A?: typeof Assets, entries?: object[], amount?: number, kind?: string}} [o]
 * @returns {HTMLElement|null}
 */
export function caricatureScatter(seed = 0, { count = 8, A = Assets, entries, amount = COLLAGE_AMOUNT[getCaricatureArt()], kind = 'mixed', slots = 'any' } = {}) {
  const all = uiPieces({ A, entries });
  if (!all.length || amount <= 0) return null;
  const SLOTS = SLOT_SETS[slots] ?? SLOT_SETS.any;
  const n = Math.max(2, Math.min(SLOTS.length, Math.round(count * amount)));
  const stickers = all.filter((e) => e.alpha), posters = all.filter((e) => !e.alpha);
  const wrap = h('div.cari-scatter', { attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < n; i++) {
    const [x, y, w, r] = SLOTS[(i + seed) % SLOTS.length];
    const useSticker = kind === 'stickers' || (kind === 'mixed' && i % 2 === 1 && stickers.length);
    const pool = useSticker && stickers.length ? stickers : posters.length ? posters : all;
    const p = pool[(i * 5 + seed * 3) % pool.length];
    const card = caricatureCard(p, { tilt: r, A, cls: 'pc' });
    if (!card) continue;
    for (const [k, v] of [['--x', `${x}%`], ['--y', `${y}%`], ['--w', String(p.aspect > 1.4 ? Math.round(w * 1.3) : w)], ['--dl', `${-((i * 2.3) % 9).toFixed(1)}s`]]) card.style.setProperty(k, v);
    wrap.append(card);
  }
  return wrap.children.length ? wrap : null;
}

/**
 * Two stacked prints for a corner (pause menu).
 * @returns {HTMLElement|null}
 */
export function caricatureCorner(seed = 0, { A = Assets, entries, amount = COLLAGE_AMOUNT[getCaricatureArt()] } = {}) {
  if (amount <= 0) return null;
  const a = caricatureCard(pickCaricature('poster', seed, { A, entries }), { tilt: -6, A });
  const b = caricatureCard(pickCaricature('sticker', seed + 1, { A, entries }), { tilt: 7, A, cls: 'pc2' });
  if (!a && !b) return null;
  return h('div.cari-corner', { attrs: { 'aria-hidden': 'true' } }, a, b);
}

/**
 * The round badge that sits on the corner of the HUD portrait frame.
 * @returns {HTMLElement|null}
 */
export function caricatureBadge({ A = Assets, entries, seed = 0 } = {}) {
  const e = pickCaricature('badge', seed, { A, entries });
  const uri = e && src(e, A);
  if (!uri || !e.alpha) return null;
  const img = h('img.hud-badge', { attrs: { src: uri, alt: '', draggable: 'false', 'aria-hidden': 'true' } });
  img.hidden = getCaricatureArt() === 'off';
  return img;
}

/** Which collage each screen gets: screen name -> layout id. Screens not listed get none. */
// "Less slop": the select screens and the Item Guide are for reading, so they have no wall behind them any more.
export const COLLAGE_LAYOUTS = { loading: 'loading', podium: 'podium', standings: 'podium', results: 'podium' };

/** @returns {string|null} layout id for a screen name */
export const layoutFor = (screen) => COLLAGE_LAYOUTS[screen] ?? null;

function buildLayout(id, A, entries) {
  const seed = hashStr(id) % 97;
  switch (id) {
    case 'podium': return caricatureScatter(seed + 2, { count: 7, A, entries, kind: 'stickers', slots: 'podium' });
    case 'loading': return caricatureWall(seed, { cols: 5, rows: 3, A, entries });
    case 'select': return caricatureWall(seed + 4, { cols: 6, rows: 3, A, entries });
    case 'items': return caricatureWall(seed + 8, { cols: 6, rows: 3, A, entries });
    default: return null;
  }
}

/**
 * The shared backdrop: one element in the UI's background layer. Layers are built the first time a screen needs them, and CSS shows the
 * one that matches the root's data-screen. `refresh()` rebuilds after the 'Caricature art' setting changes.
 * @param {{A?: typeof Assets, entries?: object[]}} [o]
 * @returns {{el: HTMLElement, show: (screen: string) => void, refresh: () => void}}
 */
export function caricatureBackdrop({ A = Assets, entries } = {}) {
  const el = h('div.bg-cari', { attrs: { 'aria-hidden': 'true' } });
  const layers = new Map();
  const make = (id) => {
    const inner = buildLayout(id, A, entries);
    const layer = h('div.cl', { data: { k: id, for: Object.entries(COLLAGE_LAYOUTS).filter(([, v]) => v === id).map(([k]) => k).join(' ') } }, inner);
    layers.set(id, layer); el.append(layer);
    return layer;
  };
  let last = null;
  const api = {
    el,
    layers,
    show(screen) { last = screen; const id = layoutFor(screen); if (id && !layers.has(id)) make(id); },
    refresh() { for (const l of layers.values()) l.remove(); layers.clear(); if (last) api.show(last); },
    dispose() { off?.(); el.remove(); },
  };
  const off = bus.on('ui:caricatureart', () => api.refresh());      // the setting changed: amounts differ, so rebuild what is showing
  return api;
}

/** Stylesheet for the collage pieces. */
export function caricatureCss() {
  const shows = Object.keys(COLLAGE_LAYOUTS).map((n) => `.mk[data-screen="${n}"] .bg-cari .cl[data-for~="${n}"]`).join(',');
  return `
.bg-cari{position:absolute;inset:0;pointer-events:none}
.bg-cari .cl{position:absolute;inset:0;opacity:0;transition:opacity .4s}
${shows}{opacity:1}
.cari-wall{position:absolute;inset:-6% -4%;display:grid;grid-template-columns:repeat(var(--cols,5),1fr);grid-auto-rows:1fr;gap:16u;padding:10u;pointer-events:none;opacity:.2;filter:saturate(.9);transform:rotate(3deg) scale(1.08)}
.mk[data-screen="items"] .cari-wall,.mk[data-screen="char"] .cari-wall,.mk[data-screen="kart"] .cari-wall,.mk[data-screen="difficulty"] .cari-wall,.mk[data-screen="track"] .cari-wall{opacity:.12}
.cari-wall .cari-card{animation:cariFloat 10s ease-in-out infinite;animation-delay:var(--dl,0s)}
.cari-card{display:block;margin:0;transform:rotate(var(--tilt,0deg));background:#fff8ec;padding:5u;border-radius:4u;box-shadow:0 4u 12u rgba(0,0,0,.42);overflow:hidden}
.cari-card img{display:block;width:100%;height:100%;object-fit:cover;border-radius:2u}
.cari-card.die{background:transparent;padding:0;box-shadow:none;border-radius:0;filter:drop-shadow(0 4u 6u rgba(0,0,0,.45))}
.cari-card.die img{object-fit:contain;border-radius:0}
.cari-scatter{position:absolute;inset:0;pointer-events:none}
.cari-scatter .cari-card.pc{position:absolute;left:var(--x);top:var(--y);width:calc(var(--u)*var(--w));opacity:.5;animation:cariFloat 11s ease-in-out infinite;animation-delay:var(--dl,0s)}
.mk[data-screen="podium"] .cari-scatter .cari-card.pc,.mk[data-screen="results"] .cari-scatter .cari-card.pc,.mk[data-screen="standings"] .cari-scatter .cari-card.pc{opacity:.78}
@keyframes cariFloat{0%,100%{transform:rotate(var(--tilt,0deg)) translateY(0)}50%{transform:rotate(calc(var(--tilt,0deg) + 1.6deg)) translateY(-8u)}}
.pause-cari{position:absolute;inset:0;pointer-events:none;z-index:0}
.pause-cari .cari-card.pc{opacity:.3}
.cari-corner{position:absolute;left:max(20u,3.5vw);bottom:max(12u,2.5vh);width:min(120u,13vw);z-index:1;pointer-events:none}
.cari-corner .cari-card{width:100%}
.cari-corner .cari-card.pc2{position:absolute;left:55%;bottom:-6%;width:62%}
.pause.is-in .cari-corner .cari-card{animation:snapIn .6s var(--spring) both}
.hud-badge{position:absolute;right:-13u;bottom:-11u;width:26u;height:26u;object-fit:contain;transform:rotate(10deg);filter:drop-shadow(0 2u 2u rgba(0,0,0,.5));pointer-events:none}
.hud-face-in{position:absolute;inset:0;border-radius:50%;overflow:hidden}
.row-cari .row-l{flex:0 1 auto;font-size:13f}
.row-cari .seg{gap:4u}
.row-cari .seg button{min-width:0;padding:4u 9u;font-size:12f}
@media (max-width:820px),(max-height:460px){.cari-wall{opacity:.1}.cari-corner{display:none}}
@media (prefers-reduced-motion:reduce){.cari-wall .cari-card,.cari-scatter .cari-card.pc{animation:none}}
`;
}
