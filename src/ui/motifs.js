// Brand motifs: Union flag, Copacabana wave pavement, the MARCO KART logo. All return strings; Node-safe.
import { uid } from './colour.js';

const FLAG_BLUE = '#0F2A6B';
const FLAG_RED = '#E63946';

/**
 * Union flag as an inline svg (self-contained clip path).
 * @param {string} [cls] extra class
 * @returns {string}
 */
export function unionFlag(cls = '') {
  const id = uid('uf');
  return `<svg class="flag ${cls}" viewBox="0 0 60 30" preserveAspectRatio="none" aria-hidden="true" focusable="false">` +
    `<clipPath id="${id}"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath>` +
    `<path d="M0,0 v30 h60 v-30 z" fill="${FLAG_BLUE}"/>` +
    `<path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/>` +
    `<path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#${id})" stroke="${FLAG_RED}" stroke-width="4"/>` +
    `<path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/>` +
    `<path d="M30,0 v30 M0,15 h60" stroke="${FLAG_RED}" stroke-width="6"/></svg>`;
}

/**
 * A repeating black-and-white wave pavement tile (the Copacabana Calcadao pattern) as a CSS `url(...)` value.
 * The tile is 96 x 22 units and loops seamlessly horizontally.
 * @returns {string}
 */
export function waveTileUrl() {
  const band = (cy, phase) => {
    const top = []; const bot = [];
    for (let x = 0; x <= 96; x += 2) {
      const y = cy + 3.2 * Math.sin(((x / 48) * Math.PI * 2) + phase);
      top.push(`${x},${(y - 3.4).toFixed(2)}`);
      bot.push(`${x},${(y + 3.4).toFixed(2)}`);
    }
    return `<polygon points="${top.join(' ')} ${bot.reverse().join(' ')}" fill="#111"/>`;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 22" preserveAspectRatio="none"><rect width="96" height="22" fill="#F4F0E6"/>${band(5.5, 0)}${band(16.5, Math.PI)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * The MARCO KART logo: layered, extruded, tilted. Text widths are pinned with textLength so it looks the same in any font.
 * @returns {string} svg markup (class "logo-svg")
 */
export function logoSvg() {
  const id = uid('lg');
  const font = 'font-family="Arial Black,Segoe UI Black,Helvetica Neue,Arial,Liberation Sans,sans-serif" font-weight="900" font-style="italic"';
  const line = (txt, x, y, size, len, fillId, ext, key) => {
    let out = '';
    for (let i = 14; i >= 1; i--) out += `<text x="${x + i * 0.9}" y="${y + i * 1.15}" font-size="${size}" ${font} textLength="${len}" lengthAdjust="spacingAndGlyphs" fill="${ext}" stroke="#06122A" stroke-width="11" stroke-linejoin="round">${txt}</text>`;
    out += `<text x="${x}" y="${y}" font-size="${size}" ${font} textLength="${len}" lengthAdjust="spacingAndGlyphs" fill="#FFF8EC" stroke="#FFF8EC" stroke-width="17" stroke-linejoin="round">${txt}</text>`;
    out += `<text x="${x}" y="${y}" font-size="${size}" ${font} textLength="${len}" lengthAdjust="spacingAndGlyphs" fill="#06122A" stroke="#06122A" stroke-width="9" stroke-linejoin="round">${txt}</text>`;
    out += `<text x="${x}" y="${y}" font-size="${size}" ${font} textLength="${len}" lengthAdjust="spacingAndGlyphs" fill="url(#${fillId})">${txt}</text>`;
    out += `<text x="${x}" y="${y}" font-size="${size}" ${font} textLength="${len}" lengthAdjust="spacingAndGlyphs" fill="url(#${id}h)" clip-path="url(#${id}${key})">${txt}</text>`;
    return out;
  };
  return `<svg class="logo-svg" viewBox="0 0 620 300" aria-label="Marco Kart" role="img">` +
    `<defs>` +
    `<linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF7C86"/><stop offset=".5" stop-color="#E63946"/><stop offset="1" stop-color="#A81C29"/></linearGradient>` +
    `<linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B8F6FF"/><stop offset=".5" stop-color="#22D3EE"/><stop offset="1" stop-color="#0A8FB0"/></linearGradient>` +
    `<linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".48" stop-color="#fff" stop-opacity=".12"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<clipPath id="${id}a"><rect x="0" y="0" width="620" height="118"/></clipPath><clipPath id="${id}b"><rect x="0" y="130" width="620" height="90"/></clipPath>` +
    `</defs>` +
    `<g transform="translate(10 10) rotate(-4 300 130) skewX(-8)">` +
    `<g transform="translate(-28 0)">${line('MARCO', 40, 126, 136, 530, `${id}r`, '#3B0F16', 'a')}</g>` +
    `<g transform="translate(-4 0)">${line('KART', 260, 236, 136, 340, `${id}c`, '#062B3B', 'b')}</g>` +
    `</g>` +
    `<g transform="translate(16 182) rotate(-4)"><path d="M0 0 h150 M18 17 h132 M36 34 h114 M58 51 h92" stroke="#FFF8EC" stroke-width="7" stroke-linecap="round" opacity=".9"/><path d="M9 8.5 h128 M30 25.5 h110 M48 42.5 h100" stroke="#FFD166" stroke-width="5" stroke-linecap="round" opacity=".95"/></g>` +
    `</svg>`;
}
