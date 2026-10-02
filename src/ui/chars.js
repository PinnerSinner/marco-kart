// Display helpers that resolve roster data plus optional user assets (custom rival name).
import { Assets } from '../core/assets.js';
import { getCharacter } from '../core/roster.js';

/**
 * Name to show for a character. The custom slot (Biscuit) takes `custom_rival_name` when the user supplied one.
 * @param {string} charId
 * @returns {string}
 */
export function charName(charId) {
  const c = getCharacter(charId);
  if (c.customSlot) return Assets.text('custom_rival_name', c.name) || c.name;
  return c.name;
}

/**
 * Subtitle for a character.
 * @param {string} charId
 * @returns {string}
 */
export function charTitle(charId) {
  return getCharacter(charId).title ?? '';
}

/**
 * Asset key of the photo used for a character portrait, if the user supplied one.
 * @param {string} charId
 * @param {'neutral'|'happy'|'sad'} [mood]
 * @returns {string|null} data URI or null
 */
export function charPhoto(charId, mood = 'neutral') {
  if (charId === 'marco') {
    if (mood === 'happy' && Assets.has('marco_face_happy')) return Assets.uri('marco_face_happy');
    if (mood === 'sad' && Assets.has('marco_face_sad')) return Assets.uri('marco_face_sad');
    return Assets.has('marco_face') ? Assets.uri('marco_face') : null;
  }
  if (getCharacter(charId).customSlot && Assets.has('custom_rival_face')) return Assets.uri('custom_rival_face');
  return null;
}
