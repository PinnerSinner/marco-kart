// Caricature art: the catalogue. Marco's comic-style pictures live in assets/user/ as `art_<style>_<name>.jpg|png`, made by
// tools/caricature_build.py (image processing and drawing code from his own photos: NOT a generative model, so the game always says
// "caricature art", never "AI art"). Anything else dropped into assets/user/ as `art_<anything>.png|jpg` is picked up automatically:
//   art_<style>_<name>   style is one of ART_STYLES below (it decides where the piece is used)
//   art_<name>           unknown style: a JPG/WebP is treated as a poster, a PNG as a die-cut sticker
// Everything here is pure data + string work, so it imports in Node (no canvas, no window needed at import time).
import { Assets } from '../core/assets.js';

export const ART_PREFIX = 'art_';

/**
 * Known styles. aspect = width / height of the shipped pieces (the real size of a dropped-in file is read from its header).
 * roles: where the game uses the style.
 *   board   roadside billboards, hoardings and the floating cards on Marcoverse
 *   wall    graffiti strips on track walls (wide pieces first)
 *   sticker die-cut decals: road stickers, kart stickers, HUD badge, tyre barriers
 *   ground  flat decals on the tarmac (road paint discs, stamps, pixel blocks)
 *   kerb    seamless tile patterns for kerb stripes
 *   head    256 px face textures for the 3D bobblehead statues
 *   ui      menu / loading / pause / select / podium collages
 */
export const ART_STYLES = {
  toon: { aspect: 1, alpha: false, roles: ['board', 'ui'], label: 'Cel portrait' },
  popart: { aspect: 1, alpha: false, roles: ['board', 'ui'], label: 'Pop art' },
  riso: { aspect: 1, alpha: false, roles: ['board', 'ui'], label: 'Risograph' },
  synth: { aspect: 16 / 9, alpha: false, roles: ['board', 'wall', 'ui'], label: 'Synthwave' },
  stencil: { aspect: 2, alpha: false, roles: ['wall', 'board', 'ui'], label: 'Graffiti stencil' },
  wanted: { aspect: 0.8, alpha: false, roles: ['board', 'ui'], label: 'Wanted poster' },
  constructivist: { aspect: 0.8, alpha: false, roles: ['board', 'ui'], label: 'Propaganda poster' },
  pixel: { aspect: 1, alpha: false, roles: ['board', 'sticker', 'ground', 'ui'], label: '8-bit bust' },
  card: { aspect: 384 / 544, alpha: false, roles: ['board', 'ui'], label: 'Trading card' },
  tarot: { aspect: 352 / 576, alpha: false, roles: ['board', 'ui'], label: 'Tarot card' },
  album: { aspect: 1, alpha: false, roles: ['board', 'ui'], label: 'Album cover' },
  bighead: { aspect: 1, alpha: false, roles: ['board', 'ui'], label: 'Big-head mascot' },
  mural: { aspect: 2.4, alpha: false, roles: ['board', 'wall', 'ui'], label: 'Comic mural' },
  mascot: { aspect: 1, alpha: true, roles: ['sticker', 'ui'], label: 'Mascot cut-out' },
  sticker: { aspect: 1, alpha: true, roles: ['sticker', 'ground', 'ui'], label: 'Die-cut sticker' },
  stamp: { aspect: 320 / 384, alpha: true, roles: ['sticker', 'ground', 'ui'], label: 'Postage stamp' },
  paint: { aspect: 1, alpha: true, roles: ['ground', 'sticker'], label: 'Road paint' },
  tile: { aspect: 1, alpha: false, roles: ['kerb'], label: 'Kerb tile' },
  head: { aspect: 1, alpha: false, roles: ['head'], label: 'Bobblehead face' },
};

/** Styles in the order the game prefers them when it has to pick one for a track (see PROFILES in caricatureDecorPlan.js). */
export const ART_STYLE_IDS = Object.keys(ART_STYLES);

/**
 * Split an asset key into style and name.
 * @param {string} key e.g. 'art_sticker_yoda', 'art_mycat'
 * @param {string} [uri] the data URI, only used to tell a PNG from a JPG for unknown styles
 * @returns {{key:string, style:string, name:string, known:boolean, alpha:boolean, aspect:number, roles:string[]}|null}
 */
export function parseArtKey(key, uri = '') {
  if (typeof key !== 'string' || !key.startsWith(ART_PREFIX) || key.length <= ART_PREFIX.length) return null;
  const rest = key.slice(ART_PREFIX.length);
  const cut = rest.indexOf('_');
  const head = cut > 0 ? rest.slice(0, cut) : '';
  if (head && ART_STYLES[head] && cut < rest.length - 1) {
    const st = ART_STYLES[head];
    return { key, style: head, name: rest.slice(cut + 1), known: true, alpha: st.alpha, aspect: st.aspect, roles: st.roles.slice() };
  }
  const png = /^data:image\/png/i.test(uri);
  return { key, style: 'custom', name: rest, known: false, alpha: png, aspect: 1, roles: png ? ['sticker', 'ground', 'ui'] : ['board', 'wall', 'ui'] };
}

const sizeCache = new Map();

/**
 * Pixel size of a PNG / JPEG data URI read from its header (no decoding, Node-safe). Null for anything else.
 * @param {string} uri
 * @returns {{w:number,h:number}|null}
 */
export function dataUriSize(uri) {
  if (typeof uri !== 'string') return null;
  if (sizeCache.has(uri)) return sizeCache.get(uri);
  let out = null;
  try {
    const comma = uri.indexOf(',');
    const b64 = uri.slice(comma + 1, comma + 1 + 90000);
    const bin = atob(b64.slice(0, b64.length - (b64.length % 4)));
    const u8 = (i) => bin.charCodeAt(i);
    if (u8(0) === 0x89 && bin.slice(1, 4) === 'PNG') out = { w: (u8(16) << 24) | (u8(17) << 16) | (u8(18) << 8) | u8(19), h: (u8(20) << 24) | (u8(21) << 16) | (u8(22) << 8) | u8(23) };
    else if (u8(0) === 0xff && u8(1) === 0xd8) {
      let i = 2;
      while (i + 9 < bin.length) {
        if (u8(i) !== 0xff) { i++; continue; }
        const m = u8(i + 1);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { out = { w: (u8(i + 7) << 8) | u8(i + 8), h: (u8(i + 5) << 8) | u8(i + 6) }; break; }
        i += 2 + ((u8(i + 2) << 8) | u8(i + 3));
      }
    }
  } catch { out = null; }
  if (out && !(out.w > 0 && out.h > 0)) out = null;
  sizeCache.set(uri, out);
  return out;
}

/**
 * Every piece of caricature art present, sorted by key (so layouts are deterministic).
 * Discovery is `Assets.keysWithPrefix('art_')`, so a dropped-in art_<name>.png|jpg appears without any code change.
 * @param {typeof Assets} [A]
 * @returns {Array<ReturnType<typeof parseArtKey> & {w:number,h:number}>}
 */
export function artEntries(A = Assets) {
  const out = [];
  for (const key of A.keysWithPrefix(ART_PREFIX).sort()) {
    const uri = A.uri?.(key) ?? '';
    const e = parseArtKey(key, uri);
    if (!e) continue;
    const sz = dataUriSize(uri);
    if (sz) { e.w = sz.w; e.h = sz.h; e.aspect = sz.w / sz.h; } else { e.w = 512; e.h = Math.round(512 / e.aspect); }
    out.push(e);
  }
  return out;
}

/**
 * Pieces usable for a role, optionally limited to some styles (in preference order) and to an aspect range.
 * @param {string} role 'board' | 'wall' | 'sticker' | 'ground' | 'kerb' | 'head' | 'ui'
 * @param {{A?: typeof Assets, styles?: string[], minAspect?: number, maxAspect?: number, entries?: object[]}} [o]
 */
export function artFor(role, { A = Assets, styles, minAspect = 0, maxAspect = Infinity, entries } = {}) {
  const all = (entries ?? artEntries(A)).filter((e) => e.roles.includes(role) && e.aspect >= minAspect && e.aspect <= maxAspect);
  if (!styles?.length) return all;
  const rank = (e) => { const i = styles.indexOf(e.style); return i < 0 ? (e.known ? 99 : 50) : i; };   // dropped-in art ranks above styles the track does not care about
  return all.map((e, i) => [rank(e), i, e]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
}

/** The pieces the shipped build contains, used so that layouts are identical with and without the assets (tests, art-less builds). */
export const SHIPPED_ART = [   // the best 30 (the rest was cut as muddy, ugly or repetitive: see REJECT in tools/caricature_build.py)
  'toon_yoda', 'popart_keffiyeh_car', 'riso_stonehenge', ...['snake_chair', 'desert_drive'].map((n) => `synth_${n}`),
  ...['banana_run', 'squish'].map((n) => `wanted_${n}`), 'constructivist_desk_point',
  ...['flag_rio', 'stonehenge', 'vatican'].map((n) => `stencil_${n}`), ...['desk_point', 'snake_chair'].map((n) => `card_${n}`),
  'stamp_stonehenge', 'tarot_yoda', ...['desk_point', 'flag_rio'].map((n) => `bighead_${n}`), 'mural_rio', 'mural_blighty', 'tile_couch',
  ...['couch', 'yoda', 'sugarloaf', 'desk_point'].map((n) => `sticker_${n}`),
  'paint_flag_rio', 'mascot_desk_point',
  ...['marco_face', 'flag_rio', 'desk_point', 'stonehenge'].map((n) => `head_${n}`),
].map((k) => `${ART_PREFIX}${k}`);

/** Stand-in catalogue (no data URIs) for when no art is present. */
export function shippedEntries() {
  return SHIPPED_ART.map((key) => parseArtKey(key)).map((e) => ({ ...e, w: 512, h: Math.round(512 / e.aspect) }));
}

/** Deterministic string hash (FNV-1a). */
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Deterministic pick of one entry by seed. */
export function pickArt(list, seed = 0) { return list.length ? list[Math.abs(Math.floor(seed)) % list.length] : null; }
