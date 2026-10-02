// Colour helpers for the UI. Pure, Node-safe. Colours are 0xRRGGBB numbers (as in config/roster) or "#rrggbb" strings.

/**
 * @param {number|string} c
 * @returns {string} "#rrggbb"
 */
export function hex(c) {
  if (typeof c === 'string') return c.startsWith('#') ? c : `#${c}`;
  return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** @returns {[number, number, number]} 0..255 channels */
export function rgb(c) {
  const s = hex(c).slice(1);
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/**
 * Linear mix of two colours.
 * @param {number|string} a
 * @param {number|string} b
 * @param {number} t 0 = a, 1 = b
 * @returns {string} "#rrggbb"
 */
export function mix(a, b, t) {
  const A = rgb(a); const B = rgb(b);
  const ch = (i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/** @param {number|string} c @param {number} t 0..1 @returns {string} */
export const lighten = (c, t) => mix(c, '#ffffff', t);
/** @param {number|string} c @param {number} t 0..1 @returns {string} */
export const darken = (c, t) => mix(c, '#0b1d3a', t);

let counter = 0;
/**
 * Unique id for SVG defs so every inline SVG is self-contained (no dependence on another instance staying in the DOM).
 * @param {string} [prefix]
 * @returns {string}
 */
export function uid(prefix = 'u') {
  counter = (counter + 1) % 1e9;
  return `${prefix}${counter.toString(36)}`;
}
