// Portrait renderer: cel-shaded SVG busts for the eight racers in three moods, with photo upgrade for Marco / the custom rival.
// Each portrait is self-contained (no shared defs) so it survives being cloned, hidden or removed.
import { getCharacter } from '../core/roster.js';
import { hex, lighten, darken } from './colour.js';
import { charPhoto } from './chars.js';

const INK = '#0B1D3A';
const st = (w = 2.6) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

/** Eyes for a face with two round eyes. */
function eyes(mood, lx, rx, y, { r = 4.6, iris = '#3B2A20', brow = INK } = {}) {
  if (mood === 'happy') {
    return [lx, rx].map((x) => `<path d="M${x - 5.2} ${y + 1.6} Q${x} ${y - 6.4} ${x + 5.2} ${y + 1.6}" fill="none" ${st(3.2)}/>`).join('');
  }
  const sad = mood === 'sad';
  let out = '';
  for (const [x, dir] of [[lx, 1], [rx, -1]]) {
    out += `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * (sad ? 1.15 : 1.3)}" fill="#fff" ${st(2)}/>`;
    out += `<circle cx="${x + (sad ? 0 : dir * -0.3)}" cy="${y + (sad ? 1.6 : 0.4)}" r="${r * 0.62}" fill="${iris}"/>`;
    out += `<circle cx="${x + 1}" cy="${y - 0.8}" r="1.3" fill="#fff"/>`;
    const b = sad ? `M${x - dir * 5} ${y - 6.4 - 1} L${x + dir * 5.4} ${y - 10.6}` : `M${x - 5.6} ${y - 8.8} Q${x} ${y - 11.6} ${x + 5.6} ${y - 8.6}`;
    out += `<path d="${b}" fill="none" stroke="${brow}" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (sad) out += `<path d="M${rx + 3} ${y + 7} q-2.6 4-1 6.4 q3 0 1-6.4z" fill="#7FD6FF" ${st(1.4)}/>`;
  return out;
}

/** Mouth centred on (cx, y). */
function mouth(mood, cx, y, w = 8) {
  if (mood === 'happy') {
    return `<path d="M${cx - w} ${y} Q${cx} ${y + w * 1.9} ${cx + w} ${y}Z" fill="#7A1F2B" ${st(2.4)}/>` +
      `<path d="M${cx - w * 0.7} ${y + 0.6} h${w * 1.4}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M${cx - w * 0.5} ${y + w * 1.15} q${w * 0.5} ${w * 0.6} ${w} 0" fill="none" stroke="#F0707F" stroke-width="2.6" stroke-linecap="round"/>`;
  }
  if (mood === 'sad') return `<path d="M${cx - w * 0.8} ${y + 3.4} Q${cx} ${y - 3.2} ${cx + w * 0.8} ${y + 3.4}" fill="none" ${st(2.8)}/>`;
  return `<path d="M${cx - w * 0.85} ${y} Q${cx} ${y + w * 0.65} ${cx + w * 0.85} ${y}" fill="none" ${st(2.8)}/>`;
}

const blush = (lx, rx, y, on = true) => (on ? [lx, rx].map((x) => `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="2.8" fill="#FF7A8A" opacity=".45"/>`).join('') : '');
const shoulders = (fill) => `<path d="M8 101 Q10 76 36 72 L64 72 Q90 76 92 101Z" fill="${fill}" ${st()}/>`;
const neck = (skin) => `<path d="M42 62h16v14q-8 5-16 0z" fill="${darken(skin, 0.18)}" ${st(2.2)}/>`;

/** Backdrop: two-tone burst in the character colour. */
function backdrop(c) {
  const base = hex(c);
  let rays = '';
  for (let i = 0; i < 12; i++) {
    const a0 = (i * Math.PI) / 6; const a1 = a0 + Math.PI / 12;
    rays += `<path d="M50 52 L${(50 + Math.cos(a0) * 90).toFixed(1)} ${(52 + Math.sin(a0) * 90).toFixed(1)} L${(50 + Math.cos(a1) * 90).toFixed(1)} ${(52 + Math.sin(a1) * 90).toFixed(1)}Z"/>`;
  }
  return `<rect width="100" height="100" fill="${darken(base, 0.22)}"/><g fill="${lighten(base, 0.14)}">${rays}</g>` +
    `<circle cx="50" cy="50" r="40" fill="${base}" opacity=".85"/><circle cx="50" cy="50" r="30" fill="${lighten(base, 0.22)}" opacity=".5"/>`;
}

/** One drawing function per character. Each returns inner svg markup (drawn over the backdrop). */
const ART = {
  marco: (mood, c) => {
    const skin = '#F6C7A1'; const red = hex(c);
    return shoulders(red) +
      `<path d="M30 76 L50 92 L70 76" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M30 76 L50 92 L70 76" fill="none" stroke="#22D3EE" stroke-width="2.6" stroke-linecap="round"/>` +
      `<rect x="43" y="88" width="14" height="10" rx="2" fill="#fff" ${st(2)}/><rect x="45" y="91" width="10" height="2" fill="#22D3EE"/><rect x="45" y="94.6" width="7" height="1.8" fill="${INK}" opacity=".5"/>` +
      `<rect x="14" y="80" width="16" height="10" fill="#0F2A6B" ${st(1.8)}/><path d="M14 80l16 10M30 80L14 90" stroke="#fff" stroke-width="2.2"/><path d="M22 80v10M14 85h16" stroke="#E63946" stroke-width="2.6"/>` +
      neck(skin) +
      `<ellipse cx="26" cy="54" rx="4.4" ry="6" fill="${skin}" ${st(2.2)}/><ellipse cx="74" cy="54" rx="4.4" ry="6" fill="${skin}" ${st(2.2)}/>` +
      `<path d="M27 42 C27 68 40 76 50 76 C60 76 73 68 73 42 C73 30 62 26 50 26 C38 26 27 30 27 42Z" fill="${skin}" ${st()}/>` +
      `<path d="M26 44 C22 50 24 58 27 60 L28 46Z M74 44 C78 50 76 58 73 60 L72 46Z" fill="#4A3324" ${st(2)}/>` +
      `<path d="M25 44 C24 20 76 20 75 44 Z" fill="${red}" ${st()}/><path d="M27 33 Q50 20 73 33" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".9"/>` +
      `<path d="M50 20.4v-3" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/><circle cx="50" cy="17.6" r="2.6" fill="${darken(red, 0.2)}" ${st(1.6)}/>` +
      `<path d="M21 44 Q50 32 79 44 Q77 51 50 48 Q23 51 21 44Z" fill="${darken(red, 0.22)}" ${st()}/>` +
      blush(35, 65, 62, mood !== 'sad') + eyes(mood, 40, 60, 55, { iris: '#4A3324', brow: '#4A3324' }) +
      `<path d="M50 56 q-3 6 0 8" fill="none" stroke="${darken(skin, 0.3)}" stroke-width="2.4" stroke-linecap="round"/>` + mouth(mood, 50, 68, 8);
  },
  subnet: (mood, c) => {
    const teal = hex(c); const gold = '#E9C46A'; const skin = '#E8B48A';
    return shoulders(teal) + `<path d="M12 88 Q30 78 50 84 Q70 78 88 88" fill="none" stroke="${gold}" stroke-width="4" stroke-linecap="round"/>` +
      `<rect x="36" y="86" width="28" height="12" rx="3" fill="${darken(teal, 0.15)}" ${st(2)}/><text x="50" y="95.6" text-anchor="middle" font-family="monospace" font-weight="900" font-size="9.5" fill="${gold}">/24</text>` +
      neck('#C99A76') +
      `<path d="M28 46 C28 70 40 76 50 76 C60 76 72 70 72 46 Z" fill="${skin}" ${st()}/>` +
      eyes(mood, 41, 59, 57, { iris: '#2A6B78', brow: '#8A8A93', r: 4.2 }) +
      `<path d="M50 60 q-2 4 0 6" fill="none" stroke="${darken(skin, 0.3)}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<path d="M50 68 Q40 63 33 68 Q36 74 45 71 Q50 70 50 68 Q50 70 55 71 Q64 74 67 68 Q60 63 50 68Z" fill="#B7B3AA" ${st(2)}/>` +
      (mood === 'happy' ? `<path d="M43 74 Q50 80 57 74" fill="#7A1F2B" ${st(2)}/>` : mood === 'sad' ? `<path d="M44 77 Q50 73 56 77" fill="none" ${st(2.4)}/>` : `<path d="M45 75 Q50 78 55 75" fill="none" ${st(2.4)}/>`) +
      `<g ${st(2.2)}><ellipse cx="0" cy="0" rx="5.6" ry="16" transform="translate(40 14) rotate(-42)" fill="#E63946"/><ellipse cx="0" cy="0" rx="5.6" ry="17" transform="translate(60 14) rotate(42)" fill="#E63946"/><ellipse cx="0" cy="0" rx="6" ry="18" transform="translate(50 10) rotate(0)" fill="${gold}"/></g><path d="M49 4 q-2 6 -1 12" stroke="#fff" stroke-width="1.6" fill="none" opacity=".7" stroke-linecap="round"/>` +
      `<path d="M22 58 C18 30 32 20 50 20 C68 20 82 30 78 58 L70 58 C70 40 66 36 50 36 C34 36 30 40 30 58Z" fill="${teal}" ${st()}/>` +
      `<path d="M25 40 Q50 22 75 40" fill="none" stroke="${gold}" stroke-width="3.4" stroke-linecap="round"/>` +
      `<path d="M22 58 L28 74 L36 70 L30 58Z M78 58 L72 74 L64 70 L70 58Z" fill="${darken(teal, 0.1)}" ${st(2.2)}/>` +
      `<circle cx="50" cy="28" r="3" fill="${gold}" ${st(1.6)}/>`;
  },
  lambda: (mood, c) => {
    const org = hex(c); const dark = '#264653'; const skin = '#F5C9A8';
    return `<path d="M50 14 C24 14 16 40 20 62 L80 62 C84 40 76 14 50 14Z" fill="${darken(org, 0.18)}" ${st()}/>` +
      shoulders(org) + `<path d="M28 76 Q50 92 72 76" fill="none" stroke="${darken(org, 0.3)}" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="M44 82 v10M56 82 v10" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="44" cy="93" r="2" fill="#fff"/><circle cx="56" cy="93" r="2" fill="#fff"/>` +
      `<path d="M43 79 L57 98 M50 88.5 L42.6 98" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M43 79 L57 98 M50 88.5 L42.6 98" fill="none" stroke="#22D3EE" stroke-width="4" stroke-linecap="round"/><path d="M43.6 80.6 L47.6 86" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>` +
      neck(skin) +
      `<path d="M29 46 C29 68 40 74 50 74 C60 74 71 68 71 46 C71 32 62 28 50 28 C38 28 29 32 29 46Z" fill="${skin}" ${st()}/>` +
      `<path d="M28 46 C26 30 42 24 50 30 C58 24 74 30 72 46 C66 38 58 36 50 38 C42 36 34 38 28 46Z" fill="#7A4B2A" ${st(2.2)}/>` +
      `<path d="M22 32 Q50 22 78 32" fill="none" stroke="${dark}" stroke-width="7" stroke-linecap="round"/><path d="M22 32 Q50 22 78 32" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" opacity=".0"/>` +
      `<circle cx="38" cy="29" r="9" fill="${dark}" ${st(2.4)}/><circle cx="38" cy="29" r="5.8" fill="#7DEBFF" stroke="${INK}" stroke-width="1.6"/><circle cx="36" cy="27" r="1.8" fill="#fff"/>` +
      `<circle cx="62" cy="29" r="9" fill="${dark}" ${st(2.4)}/><circle cx="62" cy="29" r="5.8" fill="#7DEBFF" stroke="${INK}" stroke-width="1.6"/><circle cx="60" cy="27" r="1.8" fill="#fff"/>` +
      `<g fill="#B5723F" opacity=".8"><circle cx="34.6" cy="60" r="1"/><circle cx="38" cy="62" r="1"/><circle cx="36" cy="64" r="1"/><circle cx="65.4" cy="60" r="1"/><circle cx="62" cy="62" r="1"/><circle cx="64" cy="64" r="1"/></g>` +
      blush(35, 65, 61, mood !== 'sad') + eyes(mood, 41, 59, 52, { iris: '#2A6B78', brow: '#7A4B2A' }) + mouth(mood, 50, 65, 7);
  },
  packet: (mood, c) => {
    const pur = hex(c); const yel = '#FFBE0B'; const box = '#C89B62';
    const vEyes = mood === 'happy'
      ? `<path d="M36 52 q5-8 10 0M54 52 q5-8 10 0" fill="none" stroke="${yel}" stroke-width="3.6" stroke-linecap="round"/>`
      : mood === 'sad'
        ? `<path d="M35 52 l10 3M65 52 l-10 3" stroke="${yel}" stroke-width="3.6" stroke-linecap="round"/><path d="M40 57 q-2 4-.6 6" stroke="#7FD6FF" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
        : `<rect x="35" y="47" width="10" height="9" rx="2" fill="${yel}"/><rect x="55" y="47" width="10" height="9" rx="2" fill="${yel}"/>`;
    return shoulders(pur) + `<path d="M10 90 H90" stroke="${yel}" stroke-width="5"/><path d="M10 96 H90" stroke="${yel}" stroke-width="2" opacity=".8"/>` +
      `<rect x="40" y="62" width="20" height="14" fill="${darken(pur, 0.2)}" ${st(2.2)}/>` +
      `<path d="M22 24 L50 14 L78 24 V68 L50 78 L22 68Z" fill="${box}" ${st()}/>` +
      `<path d="M22 24 L50 34 L78 24 L50 14Z" fill="${lighten(box, 0.25)}" ${st(2.4)}/><path d="M50 34 V78 L78 68 V24Z" fill="${darken(box, 0.12)}" ${st(2.4)}/>` +
      `<path d="M44 16.4 L56 21 V36 L44 31Z" fill="#EAD6A6" ${st(1.8)} opacity=".95"/>` +
      `<rect x="28" y="40" width="44" height="22" rx="8" fill="#1B0B36" ${st()}/><path d="M32 43 q18-4 36 0" stroke="#fff" stroke-width="2.2" fill="none" opacity=".35" stroke-linecap="round"/>` + vEyes +
      `<path d="M61 40 L57 47 L63 50 L58 62" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<rect x="30" y="66" width="12" height="7" rx="1" fill="#fff" ${st(1.6)} transform="rotate(-6 36 69)"/><path d="M32 68.4h8M32 70.6h5" stroke="${INK}" stroke-width="1" opacity=".6" transform="rotate(-6 36 69)"/>` +
      (mood === 'happy' ? `<path d="M41 76 q9 6 18 0" fill="none" stroke="${INK}" stroke-width="0"/>` : '');
  },
  carlos: (mood, c) => {
    const grn = hex(c); const yel = '#FFD166'; const skin = '#D9A066';
    const shades = `<path d="M28 47 h20 v6 q0 8-10 8 q-10 0-10-8z M52 47 h20 v6 q0 8-10 8 q-10 0-10-8z" fill="#111A2E" ${st(2.4)}/><path d="M48 49 h4" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M31 50 l6-1.6M55 50 l6-1.6" stroke="#8BEAFB" stroke-width="2.2" stroke-linecap="round"/>` +
      (mood === 'sad' ? `<path d="M31 42 l14 4M69 42 l-14 4" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>` : `<path d="M31 44 Q38 40 46 43M54 43 Q62 40 69 44" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`);
    return shoulders(yel) + `<path d="M12 84 Q50 96 88 84" fill="none" stroke="${grn}" stroke-width="6"/><path d="M36 74 L50 86 L64 74" fill="none" stroke="${grn}" stroke-width="5" stroke-linecap="round"/>` +
      `<circle cx="70" cy="92" r="4.4" fill="#fff" ${st(1.8)}/><path d="M70 89.4l2.4 1.8-.9 2.9h-3l-.9-2.9z" fill="${INK}"/>` +
      neck(skin) +
      `<path d="M27 46 C27 68 40 76 50 76 C60 76 73 68 73 46 C73 32 62 28 50 28 C38 28 27 32 27 46Z" fill="${skin}" ${st()}/>` +
      `<ellipse cx="26" cy="54" rx="4" ry="5.6" fill="${skin}" ${st(2.2)}/><ellipse cx="74" cy="54" rx="4" ry="5.6" fill="${skin}" ${st(2.2)}/>` +
      shades + blush(34, 66, 64, mood !== 'sad') + mouth(mood === 'neutral' ? 'happy' : mood, 50, 66, 9) +
      `<path d="M24 46 C22 18 78 18 76 46 C70 38 62 34 50 34 C38 34 30 38 24 46Z" fill="${grn}" ${st()}/>` +
      `<path d="M30 30 Q40 22 52 22" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>` +
      `<g transform="translate(66 27) rotate(24)"><circle r="10.4" fill="#B6F542" ${st(2.4)}/><circle r="7.4" fill="#E5FF9B" stroke="#7DC21B" stroke-width="1.4"/><path d="M0 0V-7.4M0 0L6.3 -3.8M0 0L6.3 3.8M0 0V7.4M0 0L-6.3 3.8M0 0L-6.3 -3.8" stroke="#B6F542" stroke-width="1.6"/></g>`;
  },
  tilly: (mood, c) => {
    const pink = hex(c); const skin = '#F8D5BC';
    let quilt = ''; for (let i = -1; i < 5; i++) quilt += `M${i * 18 + 6} 72 L${i * 18 + 30} 104M${i * 18 + 30} 72 L${i * 18 + 6} 104`;
    let pearls = ''; for (let i = 0; i < 9; i++) { const t = i / 8; pearls += `<circle cx="${(31 + t * 38).toFixed(1)}" cy="${(77 + Math.sin(t * Math.PI) * 9).toFixed(1)}" r="2.7" fill="#fff" ${st(1.4)}/>`; }
    return shoulders(pink) + `<path d="${quilt}" stroke="${darken(pink, 0.25)}" stroke-width="1.6" fill="none" opacity=".6"/>` +
      `<path d="M30 74 L40 86 L50 76 L60 86 L70 74" fill="#fff" ${st(2)}/>` + pearls +
      neck(skin) +
      `<g fill="#EDEDF4" ${st(2.2)}><circle cx="27" cy="38" r="8"/><circle cx="21" cy="48" r="8"/><circle cx="24" cy="59" r="7"/><circle cx="73" cy="38" r="8"/><circle cx="79" cy="48" r="8"/><circle cx="76" cy="59" r="7"/><circle cx="36" cy="26" r="8"/><circle cx="50" cy="22" r="8.4"/><circle cx="64" cy="26" r="8"/></g>` +
      `<path d="M29 46 C29 68 40 74 50 74 C60 74 71 68 71 46 C71 34 62 30 50 30 C38 30 29 34 29 46Z" fill="${skin}" ${st()}/>` +
      `<path d="M31 42 Q50 26 69 42 Q60 34 50 35 Q40 34 31 42Z" fill="#EDEDF4" ${st(2)}/>` +
      blush(35, 65, 61, mood !== 'sad') + eyes(mood, 41, 59, 51, { iris: '#3B6B4E', brow: '#9A9AA8', r: 3.8 }) +
      `<circle cx="41" cy="51" r="8" fill="#fff" fill-opacity=".18" stroke="${pink}" stroke-width="2.2"/><circle cx="59" cy="51" r="8" fill="#fff" fill-opacity=".18" stroke="${pink}" stroke-width="2.2"/><path d="M49 50h2" stroke="${pink}" stroke-width="2.2"/>` +
      mouth(mood, 50, 64, 6.4) +
      `<g transform="translate(50 15)"><ellipse cx="0" cy="9" rx="15" ry="3.6" fill="#fff" ${st(2)}/><path d="M-11 -2 h22 l-2.4 10 h-17.2z" fill="#fff" ${st(2.2)}/><path d="M-10 2 h20 l-.8 3 h-18.4z" fill="${pink}"/><path d="M11 0 c6 0 6 7 0 7" fill="none" ${st(2)}/><circle cx="-4" cy="-4" r="2.6" fill="#FFD166" ${st(1.2)}/><circle cx="3" cy="-5" r="2.6" fill="${pink}" ${st(1.2)}/></g>`;
  },
  rex: (mood, c) => {
    const blue = hex(c); const grn = '#00FF88'; const hood = '#1E2A44';
    const eyesSvg = mood === 'happy'
      ? `<path d="M36 55 q5-9 10 0M54 55 q5-9 10 0" fill="none" stroke="${grn}" stroke-width="3.8" stroke-linecap="round"/>`
      : mood === 'sad'
        ? `<path d="M35 49 l11 5M65 49 l-11 5" stroke="${grn}" stroke-width="3.8" stroke-linecap="round"/><rect x="38" y="57" width="6" height="4" rx="1" fill="${grn}"/><rect x="56" y="57" width="6" height="4" rx="1" fill="${grn}"/>`
        : `<rect x="34" y="48" width="12" height="10" rx="2" fill="${grn}"/><rect x="54" y="48" width="12" height="10" rx="2" fill="${grn}"/><path d="M36 53l4 -2 -4 -2M50 63h8" stroke="${INK}" stroke-width="2" fill="none" opacity="0"/>`;
    return `<path d="M50 12 C26 12 14 34 18 64 L82 64 C86 34 74 12 50 12Z" fill="${hood}" ${st()}/>` +
      shoulders(hood) + `<path d="M40 76 v14M60 76 v14" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="40" cy="91" r="2.2" fill="#fff"/><circle cx="60" cy="91" r="2.2" fill="#fff"/>` +
      `<rect x="34" y="88" width="32" height="12" rx="3" fill="#0B1D3A" ${st(1.8)}/><text x="50" y="97.6" text-anchor="middle" font-family="monospace" font-weight="900" font-size="9" fill="${grn}">&gt;_ sudo</text>` +
      `<path d="M50 24v-8" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><circle cx="50" cy="14" r="3.6" fill="${grn}" ${st(2)}/>` +
      `<rect x="26" y="26" width="48" height="48" rx="12" fill="${blue}" ${st()}/><rect x="30" y="29" width="40" height="8" rx="4" fill="${lighten(blue, 0.35)}" opacity=".7"/>` +
      `<rect x="30" y="40" width="40" height="24" rx="8" fill="#08142A" ${st(2.6)}/>` + eyesSvg +
      `<path d="M38 68h24" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="2.4 3"/>` +
      `<circle cx="29.6" cy="70" r="2" fill="${darken(blue, 0.3)}"/><circle cx="70.4" cy="70" r="2" fill="${darken(blue, 0.3)}"/>`;
  },
  biscuit: (mood, c) => {
    const gold = hex(c); const dk = '#8E6F12'; const cream = '#F4E3B0';
    const tongue = mood === 'sad' ? '' : `<path d="M45 66 q5 14 10 0z" fill="#FF7A8A" ${st(2.2)}/><path d="M50 66v7" stroke="#D9485C" stroke-width="1.6"/>`;
    return shoulders('#FFF8EC') + `<path d="M30 78 Q50 92 70 78" fill="none" stroke="#E63946" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="90" r="4.6" fill="#FFD166" ${st(1.8)}/><path d="M12 92 H88" stroke="${gold}" stroke-width="4"/>` +
      `<path d="M27 32 C12 36 10 62 18 76 C28 80 34 62 33 44Z" fill="${dk}" ${st()}/><path d="M73 32 C88 36 90 62 82 76 C72 80 66 62 67 44Z" fill="${dk}" ${st()}/>` +
      `<path d="M50 20 C34 20 26 34 28 50 C30 66 40 76 50 76 C60 76 70 66 72 50 C74 34 66 20 50 20Z" fill="${gold}" ${st()}/>` +
      `<path d="M50 20 C46 28 44 34 44 40 L56 40 C56 34 54 28 50 20Z" fill="${lighten(gold, 0.35)}" opacity=".85"/>` +
      `<ellipse cx="50" cy="62" rx="15" ry="12" fill="${cream}" ${st(2.4)}/>` + tongue +
      `<path d="M43 55 Q50 49 57 55 Q50 62 43 55Z" fill="${INK}" ${st(1.6)}/><ellipse cx="48" cy="54" rx="2" ry="1" fill="#fff" opacity=".7"/>` +
      (mood === 'happy' ? `<path d="M36 43q4-6 8 0M56 43q4-6 8 0" fill="none" ${st(3)}/>` :
        `<ellipse cx="39" cy="43" rx="4.4" ry="${mood === 'sad' ? 4.4 : 5}" fill="${INK}"/><ellipse cx="61" cy="43" rx="4.4" ry="${mood === 'sad' ? 4.4 : 5}" fill="${INK}"/><circle cx="40.6" cy="41.4" r="1.5" fill="#fff"/><circle cx="62.6" cy="41.4" r="1.5" fill="#fff"/>` +
        (mood === 'sad' ? `<path d="M33 34 l10 4M67 34 l-10 4" stroke="${dk}" stroke-width="3.2" stroke-linecap="round"/>` : '')) +
      `<path d="M27 34 Q50 26 73 34" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` +
      `<circle cx="38" cy="28" r="8.6" fill="#fff" ${st(2.4)}/><circle cx="38" cy="28" r="5.4" fill="#7DEBFF" stroke="${INK}" stroke-width="1.6"/><circle cx="36" cy="26" r="1.6" fill="#fff"/>` +
      `<circle cx="62" cy="28" r="8.6" fill="#fff" ${st(2.4)}/><circle cx="62" cy="28" r="5.4" fill="#7DEBFF" stroke="${INK}" stroke-width="1.6"/><circle cx="60" cy="26" r="1.6" fill="#fff"/>`;
  },
};

/**
 * Inner svg markup for a character bust.
 * @param {string} charId
 * @param {'neutral'|'happy'|'sad'} [mood]
 * @returns {string}
 */
export function portraitSvg(charId, mood = 'neutral') {
  const c = getCharacter(charId);
  const draw = ART[c.id] ?? ART.marco;
  return `<svg class="pt-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${backdrop(c.colour)}${draw(mood, c.colour)}</svg>`;
}

const SAD_OVERLAY = '<svg class="pt-sad" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
  '<g transform="translate(20 6) scale(1.15)"><path d="M6 21 a7 7 0 0 1 6-11 a10 10 0 0 1 18 2 a6.5 6.5 0 0 1 1 9z" fill="#B9C9E6" stroke="#0B1D3A" stroke-width="2.2" stroke-linejoin="round"/>' +
  '<path class="rain" d="M11 26v6M18 26v8M25 26v5" stroke="#7FD6FF" stroke-width="2.4" stroke-linecap="round"/></g>' +
  '<path class="tear" d="M68 52 q-5.5 9-2.8 13.4 q5.8 0 2.8-13.4z" fill="#7FD6FF" stroke="#0B1D3A" stroke-width="1.8" stroke-linejoin="round"/></svg>';

/**
 * A framed portrait element as markup: photo when the user supplied one (Marco, custom rival), else the drawn bust.
 * Size comes from the parent via CSS (`.pt` is width:100%; aspect-ratio:1).
 * @param {string} charId
 * @param {{ mood?: 'neutral'|'happy'|'sad', photo?: boolean }} [opts]
 * @returns {string}
 */
export function portrait(charId, { mood = 'neutral', photo = true } = {}) {
  const c = getCharacter(charId);
  const uri = photo ? charPhoto(c.id, mood) : null;
  const inner = uri ? `<img class="pt-img" src="${uri}" alt="" draggable="false">` : portraitSvg(c.id, mood);
  // no dedicated "sad" photo: keep the neutral one but droop it (tilted, moody tint, a tear and a rain cloud) so it reads as deliberate
  const droop = !!uri && mood === 'sad' && uri === charPhoto(c.id, 'neutral');
  const extra = droop ? SAD_OVERLAY : '';
  return `<span class="pt${uri ? ' has-photo' : ''}${droop ? ' sad-fb' : ''}" style="--pc:${hex(c.colour)}" data-char="${c.id}" data-mood="${mood}">${inner}${extra}</span>`;
}
