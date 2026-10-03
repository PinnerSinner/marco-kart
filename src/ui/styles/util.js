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

const HUD_UNITS = [
  [/(?<![\w#.-])(-?\d*\.?\d+)i(?![\w-])/g, (n) => `calc(var(--iu)*${n})`],
  [/(?<![\w#.-])(-?\d*\.?\d+)t(?![\w-])/g, (n) => `max(11px,calc(var(--iu)*${n}))`],
  [/(?<![\w#.-])(-?\d*\.?\d+)m(?![\w-])/g, (n) => `calc(var(--mu)*${n})`],
  [/(?<![\w#.-])(-?\d*\.?\d+)k(?![\w-])/g, (n) => `max(10px,calc(var(--mu)*${n}))`],
];

/**
 * Expand the in-race HUD's own size units, which follow the viewport height but are capped by its width (so an ultrawide window is
 * not tiny): `Ni` / `Nt` scale with the held-item box (`--iu` = one unit of a 76-unit box; `t` is text, never under 11px) and
 * `Nm` / `Nk` with the minimap and the lap-time panel under it (`--mu` = one unit of a 150-unit map; `n` is text, never under 10px).
 * `--iu` and `--mu` are defined on `.hud` (see styles/hud.js). Run before `units()`.
 * @param {string} css
 * @returns {string}
 */
export function hudUnits(css) {
  let out = css;
  for (const [re, fn] of HUD_UNITS) out = out.replace(re, (_, n) => fn(n));
  return out;
}
