// Small tilted photo cards for Marco's extra snaps (marco_rio, marco_desk). Every helper returns null when the asset is missing,
// so screens simply skip the card and look complete without it.
import { Assets } from '../core/assets.js';
import { h } from './dom.js';

/** Captions per photo (British, a little cheeky). */
const CAPTIONS = { marco_rio: 'Rio, obviously', marco_desk: 'Office hours' };
/** Where the square crop is centred so his face (and the thumb) stay in frame. */
const FOCUS = { marco_rio: '48% 52%', marco_desk: '78% 40%' };

/**
 * A polaroid-style photo card.
 * @param {'marco_rio'|'marco_desk'|string} key asset key of the image
 * @param {{ caption?: string, tilt?: number, cls?: string }} [o] caption text (defaults per photo), rotation in degrees, extra class
 * @returns {HTMLElement|null} null when the image was not supplied
 */
export function polaroid(key, { caption, tilt = -3, cls = '' } = {}) {
  if (!Assets.has(key)) return null;
  return h(`figure.polaroid${cls ? '.' + cls : ''}`, { style: { '--tilt': `${tilt}deg`, '--focus': FOCUS[key] ?? '50% 50%' } },
    h('img', { attrs: { src: Assets.uri(key), alt: '', draggable: 'false' } }),
    h('figcaption', { text: caption ?? CAPTIONS[key] ?? '' }));
}
