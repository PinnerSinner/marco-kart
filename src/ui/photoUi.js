// Marco's photo library in the 2D UI: polaroid cards, a menu photo wall, the race-intro card and mood-matched picks for results and pause.
// Every helper returns null when no photos are present, so screens simply skip the extra and look complete without it.
import { Assets } from '../core/assets.js';
import { PHOTOS, availablePhotos } from '../core/photos.js';
import { bus } from '../core/bus.js';
import { h } from './dom.js';
import { createStore } from './storage.js';

/** Options of the 'Photo props' setting (3D photo decoration density around the tracks). */
export const PHOTO_PROPS = [{ id: 'auto', label: 'Auto' }, { id: 'lots', label: 'Lots' }, { id: 'few', label: 'Few' }, { id: 'off', label: 'Off' }];
let store = null;

/** @returns {'auto'|'lots'|'few'|'off'} the saved 'Photo props' choice (auto follows the graphics quality) */
export function getPhotoProps() {
  store ??= createStore();
  const v = store.get('photoProps', 'auto');
  return PHOTO_PROPS.some((o) => o.id === v) ? v : 'auto';
}

/** Save the choice and announce it on the bus as `ui:photoprops`. */
export function setPhotoProps(v) {
  if (!PHOTO_PROPS.some((o) => o.id === v)) return;
  store ??= createStore();
  store.set('photoProps', v);
  bus.emit('ui:photoprops', v);
}

/** Tags that suit each track's intro card. */
const TRACK_TAGS = { copacabana: ['rio', 'beach'], blighty: ['uk', 'travel'], datacentre: ['setup', 'teaching'], marcoverse: ['funny', 'costume'] };

/** Where the face sits in each portrait shot, so the square crop keeps it (portraits: near the top). */
const focusOf = (p) => (p.aspect === 'portrait' ? '50% 22%' : '50% 50%');

/**
 * Deterministic pick from the photos that exist.
 * @param {'win'|'lose'|'hit'|'happy'|'funny'|'cool'|'any'|string} kind mood or tag family; 'track:<id>' suits a track
 * @param {number} [seed] different seeds give different photos of the same kind
 * @returns {object|null} entry of PHOTOS or null when no photo assets are present
 */
export function pickPhotoFor(kind, seed = 0) {
  const have = availablePhotos(Assets);
  if (!have.length) return null;
  const tagSets = { win: ['win'], hit: ['hit'], lose: ['sad'] };
  let list = [];
  if (kind.startsWith('track:')) { for (const t of TRACK_TAGS[kind.slice(6)] ?? ['travel']) { list = have.filter((p) => p.tags.includes(t)); if (list.length) break; } }   // most specific tag first
  else if (tagSets[kind]) list = have.filter((p) => p.tags.some((t) => tagSets[kind].includes(t)));
  else if (['happy', 'funny', 'cool', 'calm', 'sad'].includes(kind)) list = have.filter((p) => p.mood === kind);
  if (kind === 'lose' && !list.length) list = have.filter((p) => p.mood === 'funny');
  if (kind === 'win' && !list.length) list = have.filter((p) => p.mood === 'happy');
  if (!list.length) list = have;
  return list[Math.abs(Math.floor(seed)) % list.length];
}

/**
 * A polaroid-style card of one photo (the full frame, square-cropped around the face).
 * @param {object|string|null} photo entry of PHOTOS or a slug
 * @param {{caption?: string, tilt?: number, cls?: string}} [o]
 * @returns {HTMLElement|null}
 */
export function photoCard(photo, { caption, tilt = -3, cls = '' } = {}) {
  const p = typeof photo === 'string' ? PHOTOS.find((x) => x.slug === photo) : photo;
  if (!p || !Assets.has(`photo_${p.slug}`)) return null;
  return h(`figure.polaroid${cls ? '.' + cls.split(' ').join('.') : ''}`, { style: { '--tilt': `${tilt}deg`, '--focus': focusOf(p) } },
    h('img', { attrs: { src: Assets.uri(`photo_${p.slug}`), alt: '', draggable: 'false', loading: 'lazy' } }),
    h('figcaption', { text: caption ?? p.caption }));
}

/**
 * A wall of tilted photos for behind a screen (main menu). Purely decorative; ignores pointer events.
 * @param {number} [seed]
 * @param {number} [cols]
 * @returns {HTMLElement|null}
 */
export function photoWall(seed = 0, cols = 5) {
  const have = availablePhotos(Assets);
  if (!have.length) return null;
  const rows = 3, wall = h('div.photo-wall', { attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < cols * rows; i++) {
    const p = have[(i * 7 + seed) % have.length];
    const tilt = (((i * 37 + seed * 11) % 17) - 8) * 0.9;
    wall.append(h('div.pw-cell', { style: { '--tilt': `${tilt}deg`, '--dl': `${-((i * 1.7) % 9).toFixed(1)}s` } },
      h('img', { attrs: { src: Assets.uri(`face_${p.slug}`) ?? Assets.uri(`photo_${p.slug}`), alt: '', draggable: 'false', loading: 'lazy' } })));
  }
  return wall;
}

/**
 * The race-intro card: a polaroid that slides in from the left for a few seconds while the track name banner is up.
 * @param {HTMLElement} root element to attach to (the UI root)
 * @param {string} trackId
 * @param {number} [ms] how long it stays
 * @returns {HTMLElement|null}
 */
export function showIntroCard(root, trackId, ms = 3800) {
  const p = pickPhotoFor(`track:${trackId}`, Math.floor(Math.random() * 1000));
  const card = p && photoCard(p, { tilt: -4, cls: 'intro-snap' });
  if (!card || !root) return null;
  root.append(card);
  setTimeout(() => { card.classList.add('out'); setTimeout(() => card.remove(), 500); }, ms);
  return card;
}
