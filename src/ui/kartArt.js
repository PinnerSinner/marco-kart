// Side-view kart thumbnails for the kart select cards and title-screen fly-bys. Cel-shaded like the item icons.
import { hex, lighten, darken } from './colour.js';

const INK = '#0B1D3A';
const O = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

const wheel = (x, y, r = 11) =>
  `<g transform="translate(${x} ${y})"><circle r="${r}" fill="#1B2236" ${O}/><circle r="${r * 0.55}" fill="#DCE7F5" stroke="${INK}" stroke-width="2.2"/>` +
  `<path d="M0 ${-r * 0.5}V${r * 0.5}M${-r * 0.5} 0H${r * 0.5}" stroke="${INK}" stroke-width="1.8"/><circle r="2" fill="${INK}"/></g>`;

const ART = {
  cruiser: (c, a) =>
    `<path d="M10 46 C10 36 22 31 40 31 L64 31 C72 31 78 25 92 25 L106 25 C122 25 132 34 132 46 L132 52 L10 52Z" fill="${c}" ${O}/>` +
    `<path d="M14 38 C22 33 32 32 42 32 L64 32 C72 32 78 26 92 26 L100 26 C86 30 70 38 50 41 C36 43 24 42 14 38Z" fill="${lighten(c, 0.28)}" opacity=".85"/>` +
    `<path d="M11 46 H131" stroke="#0F2A6B" stroke-width="5"/><path d="M11 46 H131" stroke="#fff" stroke-width="1.6"/><path d="M78 40l14 12M92 40L78 52" stroke="#E63946" stroke-width="0"/>` +
    `<path d="M74 31 L84 14 L96 14 L100 27Z" fill="#9CE9FF" ${O} opacity=".95"/><path d="M78 27 L85 17" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>` +
    `<circle cx="66" cy="22" r="8" fill="#F6C7A1" ${O}/><path d="M58 21 C58 12 74 12 74 21Z" fill="${a}" ${O}/>` +
    `<rect x="126" y="38" width="8" height="7" rx="2" fill="#FFF3B0" ${O}/><rect x="8" y="38" width="6" height="7" rx="2" fill="#FF4A5A" ${O}/>` +
    `<rect x="52" y="52" width="46" height="4" rx="2" fill="${darken(c, 0.4)}"/>` + wheel(36, 54) + wheel(106, 54),
  buggy: (c, a) =>
    `<path d="M62 34 V4" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M62 34 V4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>` +
    `<path d="M32 18 Q62 -10 92 18Z" fill="#fff" ${O}/><path d="M32 18 Q40 2 62 0 L62 18Z" fill="${a}"/><path d="M92 18 Q84 2 62 0 L62 18Z" fill="${a}" opacity="0"/><path d="M48 18 Q52 4 62 0 L62 18ZM76 18 Q72 4 62 0 L62 18Z" fill="${a}"/><path d="M32 18 Q62 -10 92 18" fill="none" ${O}/>` +
    `<path d="M22 47 C22 39 32 35 48 37 L88 37 C102 37 114 41 120 50 L120 54 L22 54Z" fill="${c}" ${O}/>` +
    `<path d="M26 44 C34 39 44 39 54 40 L82 40 C70 44 52 48 26 47Z" fill="${lighten(c, 0.3)}" opacity=".85"/>` +
    `<path d="M52 37 L58 20 M84 37 L78 20" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<circle cx="66" cy="27" r="8" fill="#F6C7A1" ${O}/><path d="M58 26 C58 18 74 18 74 26Z" fill="${a}" ${O}/>` +
    `<rect x="114" y="42" width="8" height="7" rx="2" fill="#FFF3B0" ${O}/>` + wheel(34, 53, 13) + wheel(104, 55, 9.6),
  hauler: (c, a) => {
    let leds = '';
    for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) leds += `<rect x="${22 + k * 10}" y="${17 + r * 7.4}" width="6.4" height="3.6" rx="1" fill="${(r + k) % 3 === 0 ? '#3DFF7B' : (r + k) % 3 === 1 ? '#22D3EE' : '#FF4A5A'}"/>`;
    return `<rect x="12" y="10" width="86" height="40" rx="5" fill="#2A3B5C" ${O}/><rect x="16" y="13" width="78" height="34" rx="3" fill="#1A2640"/>` + leds +
      `<rect x="16" y="46" width="78" height="4" fill="${a}"/>` +
      `<path d="M98 50 V28 C98 24 102 22 106 22 L118 22 C124 22 130 30 132 38 L134 50Z" fill="${c}" ${O}/><path d="M104 27 h12 c3 0 6 4 8 8 h-20z" fill="#9CE9FF" ${O}/>` +
      `<path d="M100 24 h10" stroke="#fff" stroke-width="2" opacity=".6" stroke-linecap="round"/>` +
      `<rect x="127" y="40" width="8" height="7" rx="2" fill="#FFF3B0" ${O}/><rect x="6" y="40" width="7" height="7" rx="2" fill="#FF4A5A" ${O}/>` +
      `<rect x="10" y="50" width="122" height="6" rx="3" fill="${darken(c, 0.45)}" ${O}/>` + wheel(32, 58, 12.4) + wheel(112, 58, 12.4);
  },
  rocket: (c, a) =>
    `<path d="M4 44 L2 22 L28 36Z" fill="${a}" ${O}/><path d="M4 44 L0 34" stroke="#fff" stroke-width="0"/>` +
    `<path d="M12 48 C12 40 30 36 58 35 L96 31 C118 30 134 42 138 48 C134 54 112 56 60 56 L16 56Z" fill="${c}" ${O}/>` +
    `<path d="M20 45 C36 39 60 38 84 35 L100 33 C90 39 70 46 40 48 C30 49 24 48 20 45Z" fill="${lighten(c, 0.3)}" opacity=".85"/>` +
    `<path d="M52 42 H124" stroke="${a}" stroke-width="4"/><path d="M52 42 H124" stroke="${INK}" stroke-width="0"/>` +
    `<path d="M62 35 C64 22 84 20 92 32Z" fill="#9CE9FF" ${O}/><path d="M68 31 C70 26 78 24 84 26" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".85"/>` +
    `<circle cx="76" cy="30" r="5.4" fill="#F6C7A1" ${O}/><path d="M71 29 C71 24 81 24 81 29Z" fill="${a}" ${O}/>` +
    `<path d="M14 50 L-6 44 L2 50 L-10 52 L14 56Z" fill="#FF8A1F" ${O}/><path d="M12 51 L0 49 L12 54Z" fill="#FFE066"/>` +
    wheel(38, 56, 9) + wheel(108, 56, 9),
};

/**
 * Side-view kart thumbnail.
 * @param {string} kartId cruiser | buggy | hauler | rocket
 * @param {number|string} colour body colour (0xRRGGBB or css)
 * @param {number|string} [accent] accent colour
 * @returns {string} svg markup
 */
export function kartSvg(kartId, colour, accent = '#FFF8EC') {
  const draw = ART[kartId] ?? ART.cruiser;
  return `<svg class="kart-art" viewBox="-14 -12 168 88" aria-hidden="true" focusable="false">${draw(hex(colour), hex(accent))}</svg>`;
}
