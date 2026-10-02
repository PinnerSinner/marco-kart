// Procedural card artwork for the four tracks (inline SVG, 240x150). Every drawing is self-contained (own gradient ids).
import { uid } from './colour.js';
import { makeRng } from '../core/util.js';

const INK = '#0B1D3A';

/** Linear gradient definition. stops = [[offset, colour], ...] */
const grad = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const rgrad = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a ?? 1}"/>`).join('')}</radialGradient>`;

const wrap = (body, defs = '') => `<svg class="track-art" viewBox="0 0 240 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs>${defs}</defs>${body}</svg>`;

/** Road in perspective from vanishing point (vx, vy) down to the bottom edge; `bands` returns per-band markup. */
function perspectiveBands(vx, vy, yBottom, halfW, n, fn) {
  let out = '';
  for (let k = 0; k < n; k++) {
    const t0 = (k / n) ** 1.8; const t1 = ((k + 1) / n) ** 1.8;
    const y0 = vy + (yBottom - vy) * t0; const y1 = vy + (yBottom - vy) * t1;
    const w0 = halfW * t0; const w1 = halfW * t1;
    out += fn(k, y0, y1, w0, w1, t0, t1);
  }
  return out;
}

function copacabana() {
  const g = uid('cp');
  const defs = grad(`${g}s`, [[0, '#3C9BFF'], [0.6, '#9ED8FF'], [1, '#FFE9C7']]) + grad(`${g}w`, [[0, '#19B9C9'], [1, '#0B7FA8']]) +
    rgrad(`${g}g`, [[0, '#FFF6B0', 1], [1, '#FFD166', 0]]);
  let road = perspectiveBands(120, 92, 150, 150, 12, (k, y0, y1, w0, w1) => {
    const dark = k % 2 === 0;
    const wv = (y, w, ph) => { const pts = []; for (let i = 0; i <= 8; i++) { const x = 120 - w + (2 * w * i) / 8; pts.push(`${x.toFixed(1)},${(y + Math.sin(i * 1.6 + ph) * (y - 90) * 0.06).toFixed(1)}`); } return pts; };
    const top = wv(y0, w0, k * 0.7); const bot = wv(y1, w1, (k + 1) * 0.7).reverse();
    return `<polygon points="${top.join(' ')} ${bot.join(' ')}" fill="${dark ? '#1B1F2A' : '#F6F1E4'}"/>`;
  });
  const palm = (x, y, s, flip = 1) => `<g transform="translate(${x} ${y}) scale(${s * flip} ${s})"><path d="M0 0 C4 -22 2 -40 8 -58" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M0 0 C4 -22 2 -40 8 -58" fill="none" stroke="#B5814A" stroke-width="4" stroke-linecap="round"/>` +
    [[-38, -10], [-24, -34], [4, -42], [30, -30], [44, -6], [-46, 8]].map(([dx, dy]) => `<path d="M8 -58 Q${8 + dx * 0.5} ${-58 + dy - 18} ${8 + dx} ${-58 + dy + 14} Q${8 + dx * 0.55} ${-58 + dy} 8 -58Z" fill="#2FBF5B" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`).join('') + `</g>`;
  return wrap(
    `<rect width="240" height="150" fill="url(#${g}s)"/>` +
    `<circle cx="196" cy="34" r="30" fill="url(#${g}g)"/><circle cx="196" cy="34" r="14" fill="#FFE066" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M0 84 C10 60 26 44 44 50 C58 54 62 66 70 84Z" fill="#3E9C6E" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M40 84 C52 40 74 26 96 36 C112 44 116 68 124 84Z" fill="#2E8A5E" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M76 32 l0-8 M68 28 l16 0" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><circle cx="76" cy="22" r="2.4" fill="#F6F1E4" stroke="${INK}" stroke-width="1.4"/><path d="M76 24l0 8" stroke="#F6F1E4" stroke-width="2"/>` +
    `<path d="M92 60 h6 v-4 h5 v4 h5 v-6 h6 v10 h-22z M60 66 h8 v-5 h6 v5 h6 v8 h-20z" fill="#FF8A5B" opacity=".9" stroke="${INK}" stroke-width="1.6"/>` +
    `<rect y="82" width="240" height="14" fill="url(#${g}w)"/><path d="M0 88 q10-4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke="#fff" stroke-width="1.6" opacity=".75"/>` +
    `<rect y="94" width="240" height="56" fill="#F3D9A0"/>` + road +
    `<path d="M0 150 L96 92 M240 150 L144 92" stroke="${INK}" stroke-width="3" opacity=".9" fill="none"/>` +
    palm(28, 150, 0.95) + palm(216, 146, 0.8, -1) +
    `<g transform="translate(176 104)"><rect x="-1" y="-22" width="2" height="24" fill="${INK}"/><path d="M-16 -18 Q0 -34 16 -18Z" fill="#E63946" stroke="${INK}" stroke-width="2.4"/><path d="M-6 -18 Q-2 -28 0 -30 Q2 -28 6 -18Z" fill="#fff"/></g>`,
    defs);
}

function blighty() {
  const g = uid('bl');
  const defs = grad(`${g}s`, [[0, '#6E7F99'], [1, '#C9D2DE']]) + grad(`${g}r`, [[0, '#2A3346'], [1, '#141A28']]);
  const rng = makeRng(7);
  let rain = '';
  for (let i = 0; i < 46; i++) { const x = rng() * 250; const y = rng() * 150; rain += `M${x.toFixed(0)} ${y.toFixed(0)} l-3 9`; }
  const house = (x, w, h, brick, roof) => `<rect x="${x}" y="${92 - h}" width="${w}" height="${h}" fill="${brick}" stroke="${INK}" stroke-width="2.6"/><path d="M${x - 2} ${92 - h} l${w / 2 + 2} -12 l${w / 2 + 2} 12z" fill="${roof}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` +
    `<rect x="${x + 5}" y="${92 - h + 8}" width="8" height="10" fill="#FFE9A8" stroke="${INK}" stroke-width="1.6"/><rect x="${x + w - 13}" y="${92 - h + 8}" width="8" height="10" fill="#FFE9A8" stroke="${INK}" stroke-width="1.6"/>` +
    (h > 30 ? `<rect x="${x + 5}" y="${92 - h + 24}" width="8" height="10" fill="#FFE9A8" stroke="${INK}" stroke-width="1.6"/><rect x="${x + w - 13}" y="${92 - h + 24}" width="8" height="10" fill="#FFE9A8" stroke="${INK}" stroke-width="1.6"/>` : '');
  let road = `<polygon points="100,90 140,90 240,150 0,150" fill="url(#${g}r)" stroke="${INK}" stroke-width="2.4"/>`;
  road += perspectiveBands(120, 90, 150, 120, 7, (k, y0, y1, w0, w1) => (k % 2 === 0 ? `<polygon points="${120 - w0 * 0.03},${y0} ${120 + w0 * 0.03},${y0} ${120 + w1 * 0.03 + 1.5},${y1} ${120 - w1 * 0.03 - 1.5},${y1}" fill="#F4F0E6"/>` : ''));
  return wrap(
    `<rect width="240" height="150" fill="url(#${g}s)"/>` +
    `<ellipse cx="60" cy="24" rx="46" ry="12" fill="#fff" opacity=".35"/><ellipse cx="186" cy="16" rx="52" ry="12" fill="#fff" opacity=".3"/>` +
    house(0, 34, 40, '#B5533C', '#5A5F73') + house(34, 30, 30, '#E8C99B', '#6B4A3A') + house(180, 30, 34, '#B5533C', '#5A5F73') + house(210, 34, 44, '#D99A6C', '#6B4A3A') +
    `<g transform="translate(120 0)"><rect x="-13" y="26" width="26" height="66" fill="#D9C79A" stroke="${INK}" stroke-width="3"/><path d="M-16 28 L0 -6 L16 28Z" fill="#6B7A5E" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
    `<circle cx="0" cy="42" r="9.6" fill="#FFF8EC" stroke="${INK}" stroke-width="3"/><path d="M0 42V35M0 42l5 3" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><rect x="-6" y="58" width="5" height="10" fill="#FFE9A8" stroke="${INK}" stroke-width="1.6"/><rect x="2" y="58" width="5" height="10" fill="#FFE9A8" stroke="${INK}" stroke-width="1.6"/><path d="M0 -6V-14" stroke="${INK}" stroke-width="2.6"/></g>` +
    `<rect y="90" width="240" height="4" fill="#8B93A3"/>` + road +
    `<ellipse cx="70" cy="128" rx="24" ry="5" fill="#5C7FA8" opacity=".85"/><ellipse cx="176" cy="112" rx="16" ry="3.4" fill="#5C7FA8" opacity=".85"/><path d="M62 126 l4 -3 l6 3" stroke="#fff" stroke-width="1.6" fill="none" opacity=".7"/>` +
    `<g transform="translate(150 96)"><rect x="0" y="0" width="48" height="24" rx="3" fill="#E63946" stroke="${INK}" stroke-width="3"/><rect x="0" y="11" width="48" height="4" fill="#B3202D"/>` +
    [4, 14, 24, 34].map((x) => `<rect x="${x}" y="3" width="8" height="7" fill="#BFE8FF" stroke="${INK}" stroke-width="1.6"/><rect x="${x}" y="16" width="8" height="6" fill="#BFE8FF" stroke="${INK}" stroke-width="1.6"/>`).join('') +
    `<circle cx="10" cy="25" r="4.6" fill="#222" stroke="${INK}" stroke-width="2"/><circle cx="38" cy="25" r="4.6" fill="#222" stroke="${INK}" stroke-width="2"/></g>` +
    `<g transform="translate(24 96)"><rect x="0" y="-26" width="3" height="52" fill="${INK}"/><rect x="-6" y="-30" width="15" height="6" rx="2" fill="#FFE9A8" stroke="${INK}" stroke-width="2"/></g>` +
    `<path d="${rain}" stroke="#fff" stroke-width="1.4" opacity=".55" stroke-linecap="round" fill="none"/>`,
    defs);
}

function datacentre() {
  const g = uid('dc');
  const rng = makeRng(11);
  const defs = grad(`${g}f`, [[0, '#0A1030'], [1, '#132A6B']]) + rgrad(`${g}m`, [[0, '#7DEBFF', 0.85], [1, '#22D3EE', 0]], 0.5, 0.5, 0.5);
  const rack = (side) => {
    let out = '';
    for (let k = 0; k < 5; k++) {
      const t0 = k / 5; const t1 = (k + 1) / 5;
      const xa = side < 0 ? 120 - (1 - t0) * 24 - t0 * 128 : 120 + (1 - t0) * 24 + t0 * 128;
      const xb = side < 0 ? 120 - (1 - t1) * 24 - t1 * 128 : 120 + (1 - t1) * 24 + t1 * 128;
      const ya0 = 70 - t0 * 70; const yb0 = 70 - t1 * 70; const ya1 = 76 + t0 * 74; const yb1 = 76 + t1 * 74;
      out += `<polygon points="${xa},${ya0} ${xb},${yb0} ${xb},${yb1} ${xa},${ya1}" fill="${k % 2 ? '#1A2A5C' : '#16224D'}" stroke="#4CC9F0" stroke-width="1.2" opacity=".95"/>`;
      for (let r = 0; r < 7; r++) {
        const u = (r + 1) / 8;
        const x = xa + (xb - xa) * 0.5; const y = ya0 + (ya1 - ya0) * u + (yb0 - ya0) * 0.5 + ((yb1 - ya1) - (yb0 - ya0)) * u * 0.5;
        const c = ['#3DFF7B', '#22D3EE', '#FF3DCB', '#FFD166'][Math.floor(rng() * 4)];
        out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.9 + t0 * 1.6).toFixed(1)}" fill="${c}"/>`;
      }
    }
    return out;
  };
  let floorLines = '';
  for (let i = -6; i <= 6; i++) floorLines += `<path d="M120 76 L${120 + i * 40} 150" stroke="${i % 2 ? '#FF3DCB' : '#22D3EE'}" stroke-width="${i % 3 === 0 ? 2.2 : 1}" opacity="${i % 3 === 0 ? 0.95 : 0.5}"/>`;
  return wrap(
    `<rect width="240" height="150" fill="url(#${g}f)"/>` +
    `<polygon points="0,150 0,0 96,70 144,70 240,0 240,150" fill="#0A1030"/>` +
    `<polygon points="96,70 144,70 240,150 0,150" fill="#0D1B45"/>` + floorLines +
    `<path d="M0 0 L96 70 M240 0 L144 70" stroke="#22D3EE" stroke-width="2" opacity=".8"/>` +
    rack(-1) + rack(1) +
    `<ellipse cx="120" cy="72" rx="46" ry="30" fill="url(#${g}m)"/><rect x="104" y="58" width="32" height="18" rx="3" fill="#06122A" stroke="#7DEBFF" stroke-width="1.6"/><text x="120" y="70.6" text-anchor="middle" font-family="monospace" font-size="10" font-weight="900" fill="#7DEBFF">PING</text>` +
    `<path d="M0 110 C60 96 90 130 130 112 S200 96 240 108" fill="none" stroke="#FF3DCB" stroke-width="3" stroke-linecap="round" opacity=".85"/><path d="M0 118 C60 104 90 138 130 120 S200 104 240 116" fill="none" stroke="#22D3EE" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>` +
    `<path d="M108 150 L120 96 L132 150Z" fill="none" stroke="#FFD166" stroke-width="0"/>` +
    [0, 1, 2].map((i) => `<path d="M${102 + i * 6} ${142 - i * 12} l18 -8 l18 8" fill="none" stroke="#FFD166" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity="${1 - i * 0.28}"/>`).join(''),
    defs);
}

function marcoverse() {
  const g = uid('mv');
  const rng = makeRng(23);
  const defs = grad(`${g}b`, [[0, '#0A0420'], [0.6, '#1B0B4A'], [1, '#3B1170']]) +
    grad(`${g}r`, [[0, '#22D3EE'], [0.5, '#8B5CFF'], [1, '#FF3DCB']], 0, 0, 1, 0) +
    grad(`${g}a`, [[0, '#3DFF7B', 0], [0.5, '#3DFFB0', 0.55], [1, '#8B5CFF', 0]], 0, 0, 1, 0) +
    rgrad(`${g}p`, [[0, '#FF6B77'], [1, '#B3202D']], 0.35, 0.3, 0.8) + rgrad(`${g}q`, [[0, '#9BE8FF'], [1, '#2A6BD8']], 0.35, 0.3, 0.8);
  let stars = '';
  for (let i = 0; i < 70; i++) stars += `<circle cx="${(rng() * 240).toFixed(0)}" cy="${(rng() * 150).toFixed(0)}" r="${(0.4 + rng() * 1.1).toFixed(1)}" fill="#fff" opacity="${(0.4 + rng() * 0.6).toFixed(2)}"/>`;
  return wrap(
    `<rect width="240" height="150" fill="url(#${g}b)"/>` + stars +
    `<path d="M0 30 C50 10 90 46 140 24 S210 6 240 26 L240 52 C200 34 150 56 100 44 S30 30 0 52Z" fill="url(#${g}a)"/>` +
    `<circle cx="184" cy="42" r="30" fill="url(#${g}q)" stroke="${INK}" stroke-width="3"/><ellipse cx="184" cy="46" rx="52" ry="9" fill="none" stroke="#FFD166" stroke-width="4" transform="rotate(-18 184 46)"/><path d="M160 50 a26 26 0 0 0 48 -6" fill="none" stroke="#FFD166" stroke-width="4" transform="rotate(-18 184 46)"/>` +
    `<g transform="translate(46 44)"><circle r="26" fill="url(#${g}p)" stroke="${INK}" stroke-width="3"/><path d="M-24 -6 C-24 -30 24 -30 24 -6Z" fill="#E63946" stroke="${INK}" stroke-width="2.6"/><path d="M-30 -6 Q0 -16 30 -6 Q26 0 0 -2 Q-26 0 -30 -6Z" fill="#B3202D" stroke="${INK}" stroke-width="2.6"/>` +
    `<ellipse cx="-9" cy="6" rx="4.2" ry="5" fill="#fff" stroke="${INK}" stroke-width="2"/><ellipse cx="9" cy="6" rx="4.2" ry="5" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="-8" cy="7" r="2.2" fill="${INK}"/><circle cx="10" cy="7" r="2.2" fill="${INK}"/><path d="M-9 16 Q0 24 9 16" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></g>` +
    // the neon ribbon: a wide S curve in perspective
    `<path d="M236 148 C170 140 96 132 96 112 C96 92 176 96 176 78 C176 62 110 70 112 60" fill="none" stroke="${INK}" stroke-width="30" stroke-linecap="round"/>` +
    `<path d="M236 148 C170 140 96 132 96 112 C96 92 176 96 176 78 C176 62 110 70 112 60" fill="none" stroke="#FFF8EC" stroke-width="25" stroke-linecap="round"/>` +
    `<path d="M236 148 C170 140 96 132 96 112 C96 92 176 96 176 78 C176 62 110 70 112 60" fill="none" stroke="#1B1B55" stroke-width="20" stroke-linecap="round"/>` +
    `<path d="M236 148 C170 140 96 132 96 112 C96 92 176 96 176 78 C176 62 110 70 112 60" fill="none" stroke="#22D3EE" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="7 9"/>` +
    [[150, 132], [122, 120], [170, 90]].map(([x, y]) => `<path d="M${x - 7} ${y + 3} l7 -5 l7 5" fill="none" stroke="#FFD166" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`).join('') +
    `<g transform="translate(22 112) rotate(-14)"><rect width="30" height="22" rx="2" fill="#2A3B5C" stroke="${INK}" stroke-width="2.4"/><circle cx="8" cy="6" r="1.6" fill="#3DFF7B"/><circle cx="14" cy="6" r="1.6" fill="#22D3EE"/><circle cx="20" cy="6" r="1.6" fill="#FF3DCB"/><circle cx="8" cy="12" r="1.6" fill="#FF3DCB"/><circle cx="14" cy="12" r="1.6" fill="#3DFF7B"/><circle cx="20" cy="12" r="1.6" fill="#22D3EE"/></g>`,
    defs);
}

const ART = { copacabana, blighty, datacentre, marcoverse };

/**
 * Card artwork for a track id.
 * @param {string} trackId copacabana | blighty | datacentre | marcoverse
 * @returns {string} svg markup
 */
export function trackArt(trackId) {
  return (ART[trackId] ?? ART.copacabana)();
}
