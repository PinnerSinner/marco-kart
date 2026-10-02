// CSS authoring helpers. Styles are written in "design units": `12u` = 12 units of the 960x540 reference stage,
// scaled with the viewport by the --u custom property. `12f` is the same but never smaller than 10px (for text).

const F = /(?<![\w#.-])(-?\d*\.?\d+)f(?![\w-])/g;
const U = /(?<![\w#.-])(-?\d*\.?\d+)u(?![\w-])/g;

/**
 * Expand design units in a CSS string.
 * @param {string} css
 * @returns {string}
 */
export function units(css) {
  return css.replace(F, (_, n) => `max(10px,calc(var(--u)*${n}))`).replace(U, (_, n) => `calc(var(--u)*${n})`);
}

/**
 * A text-shadow that draws an outline of width `w` (design units) around glyphs, in 12 directions,
 * plus an optional hard drop shadow. Works everywhere (no -webkit-text-stroke needed).
 * @param {number} w outline width in design units
 * @param {string} col outline colour
 * @param {number} [drop] extra hard shadow offset in design units (0 = none)
 * @param {string} [dropCol] colour of the drop
 * @returns {string} a text-shadow value
 */
export function ring(w, col, drop = 0, dropCol = 'rgba(0,0,0,.35)') {
  const parts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(`${(Math.cos(a) * w).toFixed(2)}u ${(Math.sin(a) * w).toFixed(2)}u 0 ${col}`);
  }
  if (drop) for (let d = 1; d <= 3; d++) parts.push(`0 ${(w + (drop * d) / 3).toFixed(2)}u 0 ${d === 3 ? dropCol : col}`);
  return parts.join(',');
}
