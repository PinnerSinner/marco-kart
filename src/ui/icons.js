// Inline SVG icons: the 24 item icons (20 general + 4 Biscuit-only) (64x64, cel-shaded with thick outlines) and a small set of UI glyphs.
// Everything returns a string so it is Node-safe and can be dropped straight into innerHTML.
import { ITEM_IDS } from '../core/config.js';

const INK = '#0B1D3A';
const PAPER = '#FFF8EC';
const O = `stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`;

/** Wrap icon body markup in the shared 64x64 svg shell. */
const shell = (cls, body) => `<svg class="ico ${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${body}</svg>`;

/** Points of a regular "seal" (alternating radii) for badges and bursts. */
function seal(cx, cy, r1, r2, n, rot = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** A cable stroke drawn as outline + body + highlight so it reads as a tube. */
const tube = (d, col, hi, w = 7) =>
  `<path d="${d}" fill="none" ${O} stroke-width="${w + 5}"/>` +
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>` +
  `<path d="${d}" fill="none" stroke="${hi}" stroke-width="${Math.max(1.6, w / 4)}" stroke-linecap="round" stroke-dasharray="5 9" transform="translate(-1.2,-1.4)" opacity=".85"/>`;

/** RJ45-style plug centred on (x, y), rotated by `rot` degrees, pointing along +Y before rotation. */
const plug = (x, y, rot) =>
  `<g transform="translate(${x} ${y}) rotate(${rot})">` +
  `<rect x="-6" y="-3" width="12" height="14" rx="2.5" fill="#CFE8F5" ${O} stroke-width="2.6"/>` +
  `<rect x="-4" y="6" width="8" height="3.4" fill="#FFD166" stroke="none"/>` +
  `<path d="M-2.4 6.2v3.2M0 6.2v3.2M2.4 6.2v3.2" stroke="${INK}" stroke-width="1" fill="none"/>` +
  `<rect x="-3" y="-8" width="6" height="6" rx="1.5" fill="#FF8A3D" ${O} stroke-width="2.4"/>` +
  `</g>`;

const cup = (x, y, s, body, band, steam = false) =>
  `<g transform="translate(${x} ${y}) scale(${s})">` +
  `<ellipse cx="0" cy="17" rx="19" ry="5.5" fill="#DCE7F5" ${O} stroke-width="3"/>` +
  `<path d="M-13 -4 h26 l-3.6 19 c-.4 2-2 3-4 3 h-10.8 c-2 0-3.6-1-4-3z" fill="${body}" ${O} stroke-width="3"/>` +
  `<path d="M-11.6 4 h23.2 l-1.2 6 h-20.8z" fill="${band}" stroke="none"/>` +
  `<path d="M13 0 c9-1 11 8 4 12 c-1.6 1-3 1.2-4.4 1" fill="none" ${O} stroke-width="3"/>` +
  `<ellipse cx="0" cy="-4" rx="13" ry="3.6" fill="#7A4A2B" ${O} stroke-width="2.6"/>` +
  `<ellipse cx="0" cy="-4.4" rx="8.5" ry="1.9" fill="#C68A55" stroke="none"/>` +
  (steam ? `<path d="M-6 -9 c-5-6 5-8 0-15 M2 -9 c-5-6 5-8 0-15 M9 -9 c-4-5 4-7 0-12" fill="none" ${O} stroke-width="5.6"/>` +
    `<path d="M-6 -9 c-5-6 5-8 0-15 M2 -9 c-5-6 5-8 0-15 M9 -9 c-4-5 4-7 0-12" fill="none" stroke="${PAPER}" stroke-width="2.6" stroke-linecap="round"/>` : '') +
  `</g>`;

/** Body markup for each item icon. */
const ITEM_ART = {
  cable: () => {
    const d = 'M13 47 C4 33 20 20 32 26 C46 33 44 50 30 47 C16 44 22 16 40 14 C52 13 58 26 52 38';
    return tube(d, '#FF8A3D', '#FFD9A8', 6.5) + plug(13, 47, 150) + plug(52, 38, -20) +
      `<circle cx="31" cy="30" r="2.4" fill="${PAPER}" ${O} stroke-width="1.6"/>`;
  },
  ping: () =>
    // sonar rings, packet with a data face, speed streaks
    `<path d="M40 14 A22 22 0 0 1 40 50" fill="none" stroke="#22D3EE" stroke-width="3.4" stroke-linecap="round" opacity=".55"/>` +
    `<path d="M47 8 A31 31 0 0 1 47 56" fill="none" stroke="#22D3EE" stroke-width="3" stroke-linecap="round" opacity=".32"/>` +
    `<path d="M4 24h14M0 32h12M6 40h13" stroke="#8BEAFB" stroke-width="3.2" stroke-linecap="round" fill="none"/>` +
    `<g transform="rotate(-8 33 32)"><rect x="17" y="17" width="30" height="30" rx="8" fill="#22D3EE" ${O} stroke-width="3.6"/>` +
    `<path d="M22 22h20a4 4 0 0 1 4 4v3H18v-3a4 4 0 0 1 4-4z" fill="#9CF0FF" stroke="none"/>` +
    `<circle cx="26" cy="35" r="3" fill="${INK}"/><circle cx="33" cy="35" r="3" fill="${INK}"/><circle cx="40" cy="35" r="3" fill="${INK}"/>` +
    `<path d="M22 41h20" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" opacity=".55"/></g>` +
    `<path d="M53 26l7 6-7 6z" fill="#FFD166" ${O} stroke-width="2.6"/>`,
  traceroute: () =>
    `<path d="M10 52 C18 40 26 50 32 38 C38 26 30 22 40 16" fill="none" ${O} stroke-width="11"/>` +
    `<path d="M10 52 C18 40 26 50 32 38 C38 26 30 22 40 16" fill="none" stroke="#9B5CFF" stroke-width="6.4" stroke-linecap="round"/>` +
    `<path d="M10 52 C18 40 26 50 32 38 C38 26 30 22 40 16" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="1.5 6.5" stroke-linecap="round"/>` +
    `<circle cx="12" cy="51" r="5.6" fill="#FFD166" ${O} stroke-width="3"/>` +
    `<circle cx="28" cy="45" r="5" fill="#FFD166" ${O} stroke-width="3"/>` +
    `<circle cx="34" cy="31" r="5" fill="#FFD166" ${O} stroke-width="3"/>` +
    `<circle cx="47" cy="17" r="13" fill="${PAPER}" ${O} stroke-width="3.4"/>` +
    `<circle cx="47" cy="17" r="8.4" fill="none" stroke="#E63946" stroke-width="3.4"/>` +
    `<circle cx="47" cy="17" r="3.2" fill="#E63946"/>` +
    `<path d="M47 1.4v6.2M47 26.4v6.2M31.4 17h6.2M56.4 17h6.2" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  espresso: () => `<ellipse cx="32" cy="55" rx="20" ry="3.6" fill="rgba(0,0,0,.22)"/>` + cup(30, 36, 1.12, PAPER, '#E63946', true) +
    `<path d="M39 30l-6 9h5l-3 9 9-12h-5.5l3.5-6z" fill="#FFD166" ${O} stroke-width="2.4"/>`,
  sudo: () =>
    `<polygon points="${seal(32, 32, 29, 25, 14, 0.1)}" fill="#FFD166" ${O} stroke-width="3.4"/>` +
    `<circle cx="32" cy="32" r="19.5" fill="${INK}" stroke="#E9A92A" stroke-width="2.6"/>` +
    `<path d="M26 20l-3 24M37 20l-3 24M19.5 28.5h24M18.5 36.5h24" stroke="#FFD166" stroke-width="4.2" stroke-linecap="round" fill="none"/>` +
    `<rect x="43" y="40" width="7" height="3.6" rx="1" fill="#22D3EE"/>` +
    `<path d="M14 15l3.2 3.2M50 15l-3.2 3.2" stroke="${PAPER}" stroke-width="2.4" stroke-linecap="round"/>`,
  firewall: () =>
    `<path d="M32 4 L55 12.5 V32 C55 46.5 45 55 32 61 C19 55 9 46.5 9 32 V12.5 Z" fill="#E63946" ${O} stroke-width="3.6"/>` +
    `<path d="M32 4 L55 12.5 V32 C55 46.5 45 55 32 61Z" fill="#B3202D" stroke="none" opacity=".55"/>` +
    `<path d="M13 22h38M12 32h40M15 42h34M22 12v10M38 12v10M14 22v10M30 22v10M46 22v10M22 32v10M38 32v10M30 42v13" stroke="#7E1420" stroke-width="2" fill="none" opacity=".75"/>` +
    `<path d="M32 15 C42 25 45 33 39 42 C36 46 27 46 24 41 C20 34 26 29 28 22 C30 26 32 27 34 26 C35 22 33 19 32 15Z" fill="#FF8A1F" ${O} stroke-width="3"/>` +
    `<path d="M32 27 C37 32 38 37 34 41 C31 43 27 41 27 37 C27 33 30 32 32 27Z" fill="#FFD166" stroke="none"/>` +
    `<path d="M14 14l3-1M44 44l3-3" stroke="#FFC9CE" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>`,
  fibre: () => {
    const strands = [['#22D3EE', 'M14 50 C22 48 26 38 36 32 C44 27 48 20 52 12'], ['#FF4FD8', 'M14 50 C24 52 30 44 40 41 C48 38 52 33 57 27'],
      ['#FFD166', 'M14 50 C20 42 28 34 33 26 C37 20 38 14 38 8'], ['#7CFF6B', 'M14 50 C26 55 38 52 46 49 C51 47 54 46 58 44']];
    const tips = [[52, 12, '#22D3EE'], [57, 27, '#FF4FD8'], [38, 8, '#FFD166'], [58, 44, '#7CFF6B']];
    return strands.map(([c, d]) => `<path d="${d}" fill="none" ${O} stroke-width="9.6"/>`).join('') +
      strands.map(([c, d]) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="5.6" stroke-linecap="round"/>`).join('') +
      strands.map(([c, d]) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="3 9" opacity=".95"/>`).join('') +
      tips.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="4.4" fill="#fff" ${O} stroke-width="2.4"/><circle cx="${x}" cy="${y}" r="1.9" fill="${c}"/>`).join('') +
      `<g transform="translate(11 52) rotate(-40)"><rect x="-8" y="-7" width="16" height="14" rx="3" fill="#22D3EE" ${O} stroke-width="3"/>` +
      `<rect x="-11" y="-3.4" width="5" height="6.8" rx="1.5" fill="${INK}"/><rect x="-6" y="-4" width="12" height="3" rx="1" fill="#9CF0FF" stroke="none"/></g>`;
  },
  outage: () =>
    `<path d="M16 44 C6 44 4 30 14 27 C14 16 30 10 38 19 C46 13 58 20 55 31 C62 34 60 44 51 44Z" fill="#8FA0C4" ${O} stroke-width="3.6"/>` +
    `<path d="M16 44 C6 44 4 30 14 27 C14 16 30 10 38 19 C42 16.6 47 16.6 50 19 C40 20 30 24 26 32 C22 40 20 43 16 44Z" fill="#C4D0EA" stroke="none" opacity=".8"/>` +
    `<path d="M14 36 C22 40 36 40 50 36 L52 44 H16Z" fill="#5B6B8C" stroke="none" opacity=".7"/>` +
    `<path d="M35 22l-11 19h9l-4 18 16-24h-10z" fill="#FFD166" ${O} stroke-width="3.2"/>` +
    `<circle cx="51" cy="50" r="9" fill="#E63946" ${O} stroke-width="3"/><path d="M47 46l8 8M55 46l-8 8" stroke="${PAPER}" stroke-width="3.2" stroke-linecap="round"/>`,
  kernel_panic: () =>
    `<circle cx="32" cy="32" r="27" fill="none" ${O} stroke-width="9"/>` +
    `<circle cx="32" cy="32" r="27" fill="none" stroke="#E63946" stroke-width="5"/>` +
    `<path d="M32 1v9M32 54v9M1 32h9M54 32h9" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M32 2.5v6.5M32 55v6.5M2.5 32h6.5M55 32h6.5" stroke="${PAPER}" stroke-width="2" stroke-linecap="round"/>` +
    `<polygon points="${seal(32, 32, 20, 11, 9, -0.2)}" fill="#FF8A1F" ${O} stroke-width="3.2"/>` +
    `<polygon points="${seal(32, 32, 13, 7.6, 9, 0.1)}" fill="#FFD166" stroke="none"/>` +
    `<path d="M32 22v11" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="40" r="3" fill="${INK}"/>`,

  sniffer: () =>
    `<path d="M10 22 Q32 -2 54 22 L48 26 Q32 10 16 26Z" fill="#DFE6F2" ${O} stroke-width="3.2"/>` +
    `<path d="M32 15 V44" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="14" r="4.6" fill="#FF9A1F" ${O} stroke-width="2.6"/>` +
    `<path d="M22 47 h20 l6 9 h-32z" fill="#3D5A96" ${O} stroke-width="3.2"/>` +
    `<path d="M14 34 a20 20 0 0 0 0 0 M17 40 A17 17 0 0 1 17 26 M11 43 A24 24 0 0 1 11 23" fill="none" stroke="#22D3EE" stroke-width="3.2" stroke-linecap="round"/>` +
    `<path d="M47 40 A17 17 0 0 0 47 26 M53 43 A24 24 0 0 0 53 23" fill="none" stroke="#22D3EE" stroke-width="3.2" stroke-linecap="round"/>`,
  bsod: () =>
    `<rect x="5" y="9" width="54" height="38" rx="6" fill="#2A6BFF" ${O} stroke-width="3.6"/>` +
    `<rect x="10" y="14" width="44" height="28" rx="2" fill="#123BC4" stroke="none"/>` +
    `<circle cx="22" cy="24" r="4" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M19 32 q3-3 6 0" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" transform="rotate(180 22 32)"/>` +
    `<path d="M30 22h18M30 28h14M14 36h32" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M22 56h20M32 47v9" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M22 56h20M32 47v9" stroke="#8FA0C4" stroke-width="2.6" stroke-linecap="round"/>`,
  autoscale: () =>
    `<rect x="20" y="20" width="24" height="24" rx="5" fill="#3A5A96" ${O} stroke-width="3.4"/><path d="M25 27h14M25 33h14M25 39h9" stroke="#7CFF6B" stroke-width="2.8" stroke-linecap="round"/>` +
    [[32, 3, 0], [61, 32, 90], [32, 61, 180], [3, 32, 270]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M0 -1 l-8 12 h5 v6 h6 v-6 h5z" fill="#39D98A" ${O} stroke-width="3" transform="scale(.9)"/></g>`).join(''),
  spill: () =>
    `<path d="M4 46 C2 38 14 34 24 37 C30 33 44 34 48 40 C58 40 62 48 54 53 C46 58 30 58 22 55 C12 56 6 52 4 46Z" fill="#B87A44" ${O} stroke-width="3.4"/>` +
    `<path d="M12 45 C18 41 28 42 32 44 M36 48 C42 46 48 47 50 49" stroke="#F3D9B0" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    `<g transform="translate(40 22) rotate(58)">` + `<path d="M-13 -12 h26 l-3.6 26 c-.4 2-2 3-4 3 h-10.8 c-2 0-3.6-1-4-3z" fill="#FFF8EC" ${O} stroke-width="3"/><path d="M-11.6 -2 h23.2 l-1.2 6 h-20.8z" fill="#E63946" stroke="none"/><path d="M13 -8 c9-1 11 8 4 12" fill="none" ${O} stroke-width="3"/></g>` +
    `<path d="M26 30 c-4 4-2 8-8 10" stroke="#B87A44" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="14" cy="30" r="2.8" fill="#B87A44" ${O} stroke-width="1.8"/><circle cx="22" cy="24" r="2" fill="#B87A44" ${O} stroke-width="1.6"/>`,
  zeroday: () =>
    `<ellipse cx="32" cy="54" rx="22" ry="4" fill="rgba(0,0,0,.22)"/>` +
    `<path d="M10 46 h44 l-4 8 H14z" fill="#3A4152" ${O} stroke-width="3.2"/>` +
    `<path d="M14 46 c0-14 8-22 18-22 s18 8 18 22z" fill="#4B5368" ${O} stroke-width="3.6"/>` +
    `<path d="M20 44 c1-8 5-14 12-16" stroke="#8B96B3" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    `<circle cx="32" cy="34" r="5" fill="#FF3B4D" ${O} stroke-width="2.6"/><rect x="29" y="14" width="6" height="8" rx="2" fill="#E63946" ${O} stroke-width="2.6"/>` +
    `<circle cx="46" cy="14" r="6" fill="#111826" ${O} stroke-width="2.2"/><path d="M42 12l-6-2M42 15l-6 1M50 12l6-2M50 15l6 1" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  pods: () =>
    [[32, 14], [14, 44], [50, 44]].map(([x, y], i) => `<g transform="translate(${x} ${y}) rotate(${[0, -120, 120][i]})"><rect x="-8" y="-13" width="16" height="26" rx="8" fill="#2E6BFF" ${O} stroke-width="3.4"/><path d="M-8 -3 h16" stroke="#fff" stroke-width="2.6"/><circle cx="0" cy="6" r="2.6" fill="#FFE066"/></g>`).join('') +
    `<circle cx="32" cy="34" r="18" fill="none" stroke="#7FEAFF" stroke-width="2.6" stroke-dasharray="4 5"/>`,
  forcepush: () =>
    `<path d="M50 14 A26 26 0 0 0 50 50" fill="none" stroke="#B46BFF" stroke-width="3.4" stroke-linecap="round" opacity=".5"/>` +
    `<path d="M42 20 A18 18 0 0 0 42 44" fill="none" stroke="#7FEAFF" stroke-width="3.6" stroke-linecap="round" opacity=".85"/>` +
    `<path d="M8 30 h10 v-8 a3 3 0 0 1 6 0 v-2 a3 3 0 0 1 6 0 v2 a3 3 0 0 1 6 0 v12 c0 8-5 12-12 12 h-4 c-6 0-12-4-12-10z" fill="#FFD2A8" ${O} stroke-width="3.4" transform="translate(-2 3)"/>` +
    `<path d="M50 26h8M52 32h10M50 38h8" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity="0"/>`,
  pigeon: () =>
    `<path d="M14 30 C20 12 40 8 52 14 C48 24 40 28 34 30 C40 36 44 44 36 52 C28 58 12 52 14 30Z" fill="#8A93A8" ${O} stroke-width="3.6"/>` +
    `<path d="M22 26 C30 16 44 18 50 16 C44 26 34 30 22 34Z" fill="#B6BDCE" stroke="none" opacity=".9"/>` +
    `<circle cx="47" cy="19" r="2.6" fill="${INK}"/><path d="M53 15 l8 3 l-8 3z" fill="#FFB347" ${O} stroke-width="2.6"/>` +
    `<path d="M14 30 L4 24 L10 38Z" fill="#6B7590" ${O} stroke-width="3"/>` +
    `<ellipse cx="34" cy="43" rx="5" ry="6" fill="#2F9D6A" opacity="0"/><path d="M28 54 c-1 4 3 6 3 8 c2-2 5-4 3-8z" fill="#fff" ${O} stroke-width="2.6"/>`,
  // ---- skill items
  capacitor: () =>
    `<rect x="18" y="14" width="28" height="38" rx="6" fill="#1F3A93" ${O} stroke-width="3.6"/>` +
    `<rect x="18" y="14" width="28" height="7" rx="3" fill="#DFE4EE" ${O} stroke-width="2.8"/><rect x="18" y="45" width="28" height="7" rx="3" fill="#DFE4EE" ${O} stroke-width="2.8"/>` +
    `<path d="M32 22l-7 12h6l-3 10 10-14h-6z" fill="#FFE066" ${O} stroke-width="2.6"/>` +
    `<path d="M26 14V5M38 14V5" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M26 13V6M38 13V6" stroke="#C0C8D8" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M8 26 A26 26 0 0 0 8 46 M56 26 A26 26 0 0 1 56 46" stroke="#7FEAFF" stroke-width="3.2" fill="none" stroke-linecap="round"/>` +
    `<path d="M22 60 h20" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M23 60 h11" stroke="#7CFF6B" stroke-width="3" stroke-linecap="round"/><path d="M36 60 h5" stroke="#FF4B4B" stroke-width="3" stroke-linecap="round"/>`,
  legacy: () =>
    `<path d="M6 46 C10 40 8 30 16 26" fill="none" ${O} stroke-width="8"/><path d="M6 46 C10 40 8 30 16 26" fill="none" stroke="#FFC233" stroke-width="4" stroke-linecap="round"/>` +
    `<rect x="16" y="8" width="40" height="46" rx="4" fill="#D9CFAE" ${O} stroke-width="3.6"/>` +
    [0, 1, 2, 3].map((i) => `<rect x="21" y="${13 + i * 9}" width="30" height="6" rx="1.4" fill="#B3A884" ${O} stroke-width="1.8"/><circle cx="46" cy="${16 + i * 9}" r="1.9" fill="${['#7CFF6B', '#FFB347', '#7CFF6B', '#FF3B4D'][i]}"/>`).join('') +
    `<circle cx="36" cy="48" r="0" fill="none"/><rect x="24" y="50" width="14" height="2.4" rx="1" fill="#555A66"/>` +
    `<path d="M22 58 h28" stroke="rgba(0,0,0,.22)" stroke-width="4" stroke-linecap="round"/>`,
  cronjob: () =>
    `<circle cx="30" cy="38" r="20" fill="#1B1226" ${O} stroke-width="3.6"/>` +
    `<circle cx="30" cy="38" r="14" fill="${PAPER}" ${O} stroke-width="2.8"/>` +
    `<path d="M30 38v-9M30 38l7 3" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" fill="none"/>` +
    `<rect x="25" y="14" width="10" height="7" rx="2" fill="#8FA0C4" ${O} stroke-width="2.8"/>` +
    `<path d="M32 14 C34 8 42 8 46 4" fill="none" ${O} stroke-width="6"/><path d="M32 14 C34 8 42 8 46 4" fill="none" stroke="#D9B26A" stroke-width="3" stroke-linecap="round"/>` +
    `<polygon points="${seal(50, 8, 7, 3.2, 8, 0.3)}" fill="#FFD23F" ${O} stroke-width="2.2"/>` +
    `<path d="M14 26 l-4-4 M10 38 h-5" stroke="#FF5A36" stroke-width="3" stroke-linecap="round"/>`,

  // ---- Biscuit-only items
  poo: () =>
    // a swirl of poo with googly eyes, a gift bow and green stink wisps
    `<path d="M20 12 c-4-5 4-7 0-12 M32 10 c-4-5 4-7 0-12 M44 12 c-4-5 4-7 0-12" transform="translate(0 6)" fill="none" stroke="#7CFF6B" stroke-width="3.2" stroke-linecap="round" opacity=".85"/>` +
    `<ellipse cx="32" cy="49" rx="23" ry="9.5" fill="#6B3F1D" ${O} stroke-width="3.4"/>` +
    `<ellipse cx="32" cy="36" rx="17" ry="8.5" fill="#7C4A22" ${O} stroke-width="3.4"/>` +
    `<ellipse cx="32" cy="25" rx="11" ry="7" fill="#8E5A2C" ${O} stroke-width="3.2"/>` +
    `<path d="M30 19 C29 13 35 12 37 14 C35 15 36 17 34 19Z" fill="#9C6733" ${O} stroke-width="2.6"/>` +
    `<circle cx="25.5" cy="36" r="4.6" fill="#fff" ${O} stroke-width="2.2"/><circle cx="38.5" cy="36" r="4.6" fill="#fff" ${O} stroke-width="2.2"/>` +
    `<circle cx="26.6" cy="37" r="2" fill="${INK}"/><circle cx="37.4" cy="37" r="2" fill="${INK}"/>` +
    `<path d="M26 43 q6 5 12 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M45 18 l7-5 v9z M45 18 l-7-5 v9z" fill="#E63946" ${O} stroke-width="2.4" transform="translate(3 0)"/><circle cx="48" cy="18" r="2.8" fill="#E63946" ${O} stroke-width="2"/>`,
  woof: () =>
    // a golden dog head barking, with three sound-wave arcs
    `<path d="M44 14 A22 22 0 0 1 44 50" fill="none" stroke="#FF8A3D" stroke-width="3.6" stroke-linecap="round" opacity=".9"/>` +
    `<path d="M51 7 A31 31 0 0 1 51 57" fill="none" stroke="#FFD166" stroke-width="3.2" stroke-linecap="round" opacity=".75"/>` +
    `<path d="M58 1 A40 40 0 0 1 58 63" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" opacity=".6"/>` +
    `<path d="M12 18 C4 20 4 40 12 46 C16 38 15 26 12 18Z" fill="#9C5F1B" ${O} stroke-width="3"/>` +
    `<path d="M14 24 C14 12 30 8 38 16 C44 22 44 30 42 36 L44 42 C44 48 38 52 30 52 C20 52 14 46 14 38Z" fill="#E0AE46" ${O} stroke-width="3.4"/>` +
    `<path d="M28 38 L44 36 L46 46 C44 52 36 54 30 52Z" fill="#F6E7BE" ${O} stroke-width="3"/>` +
    `<path d="M32 44 L44 43 L44 48 C41 51 36 51 33 49Z" fill="#7E1420" stroke="none"/>` +
    `<ellipse cx="45" cy="36" rx="3.8" ry="3" fill="${INK}"/><circle cx="27" cy="26" r="3.4" fill="${INK}"/><circle cx="28" cy="25" r="1.1" fill="#fff"/>` +
    `<path d="M20 19 l5 2" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
  zoomies: () =>
    // a paw print with speed streaks and little motion curls
    `<path d="M2 24h16M0 34h12M5 44h15" stroke="#FFD166" stroke-width="3.6" stroke-linecap="round" fill="none"/>` +
    `<ellipse cx="38" cy="42" rx="13" ry="11" fill="#8E5A2C" ${O} stroke-width="3.4"/>` +
    `<ellipse cx="22.5" cy="30" rx="5" ry="6.4" transform="rotate(-22 22.5 30)" fill="#8E5A2C" ${O} stroke-width="3"/>` +
    `<ellipse cx="32" cy="21" rx="5" ry="6.6" transform="rotate(-6 32 21)" fill="#8E5A2C" ${O} stroke-width="3"/>` +
    `<ellipse cx="44.5" cy="21" rx="5" ry="6.6" transform="rotate(6 44.5 21)" fill="#8E5A2C" ${O} stroke-width="3"/>` +
    `<ellipse cx="54" cy="30" rx="5" ry="6.4" transform="rotate(22 54 30)" fill="#8E5A2C" ${O} stroke-width="3"/>` +
    `<ellipse cx="38" cy="45" rx="6" ry="4.4" fill="#C58B4C" stroke="none"/>` +
    `<path d="M52 8l-5 9h5l-4 9 9-11h-5.5l3-7z" fill="#FFD166" ${O} stroke-width="2.4"/>`,
  fetch: () =>
    // a bone with a boomerang arrow looping round it
    `<path d="M10 46 C8 20 36 8 54 20" fill="none" ${O} stroke-width="8.4"/>` +
    `<path d="M10 46 C8 20 36 8 54 20" fill="none" stroke="#22D3EE" stroke-width="4.4" stroke-linecap="round" stroke-dasharray="1 0"/>` +
    `<path d="M58 22l-12-1 6 10z" fill="#22D3EE" ${O} stroke-width="2.6"/>` +
    `<g transform="rotate(-38 32 38)"><rect x="12" y="34" width="40" height="8" rx="4" fill="#F6E7BE" ${O} stroke-width="3.2"/>` +
    `<circle cx="13" cy="33" r="6" fill="#F6E7BE" ${O} stroke-width="3.2"/><circle cx="13" cy="43" r="6" fill="#F6E7BE" ${O} stroke-width="3.2"/>` +
    `<circle cx="51" cy="33" r="6" fill="#F6E7BE" ${O} stroke-width="3.2"/><circle cx="51" cy="43" r="6" fill="#F6E7BE" ${O} stroke-width="3.2"/>` +
    `<rect x="14" y="34.4" width="36" height="7" rx="3.5" fill="#F6E7BE" stroke="none"/></g>` +
    `<path d="M42 46l3 3M46 42l3 3" stroke="#B89A62" stroke-width="2.2" stroke-linecap="round"/>`,
};

/**
 * SVG markup for an item icon.
 * @param {string} id one of ITEM_IDS (unknown ids get a "?" tile)
 * @returns {string}
 */
export function itemIcon(id) {
  const art = ITEM_ART[id];
  if (!art) return shell('unknown', `<rect x="10" y="10" width="44" height="44" rx="10" fill="#1B3B73" ${O} stroke-width="3.4"/><text x="32" y="44" text-anchor="middle" font-size="32" font-weight="900" fill="${PAPER}">?</text>`);
  return shell(`item-${id}`, art());
}

/** @returns {string[]} ids that have artwork (kept in step with config ITEM_IDS by tests) */
export const ITEM_ICON_IDS = Object.keys(ITEM_ART);

/** Every ITEMS id must have an icon: exported so a unit test can assert it. */
export const MISSING_ICONS = ITEM_IDS.filter((id) => !ITEM_ART[id]);

// ---- UI glyphs (24x24, currentColor) -------------------------------------------------------------------------------

const G = {
  flag: '<path d="M5 3v18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M6 4h13v9H6z" fill="currentColor"/><path d="M6 4h3.25v3H6zM12.5 4h3.25v3H12.5zM9.25 7h3.25v3H9.25zM15.75 7H19v3h-3.25zM6 10h3.25v3H6zM12.5 10h3.25v3H12.5z" fill="var(--glyph-alt,#0B1D3A)"/>',
  gear: '<path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M10.4 2.5h3.2l.5 2.4 1.7.7 2.1-1.4 2.3 2.3-1.4 2.1.7 1.7 2.4.5v3.2l-2.4.5-.7 1.7 1.4 2.1-2.3 2.3-2.1-1.4-1.7.7-.5 2.4h-3.2l-.5-2.4-1.7-.7-2.1 1.4-2.3-2.3 1.4-2.1-.7-1.7-2.4-.5v-3.2l2.4-.5.7-1.7-1.4-2.1 2.3-2.3 2.1 1.4 1.7-.7z" fill="currentColor" opacity=".95"/><circle cx="12" cy="12" r="3.6" fill="var(--glyph-alt,#0B1D3A)"/>',
  pad: '<path d="M7 7h10c3 0 5 2 5.6 5.6l.7 4.4c.3 2-1.6 3.4-3.3 2.4l-3-1.8H8.9l-3 1.8c-1.7 1-3.6-.4-3.3-2.4l.7-4.4C3.9 9 4 7 7 7z" fill="currentColor"/><path d="M7.5 10v4M5.5 12h4" stroke="var(--glyph-alt,#0B1D3A)" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="10.8" r="1.2" fill="var(--glyph-alt,#0B1D3A)"/><circle cx="18.4" cy="13" r="1.2" fill="var(--glyph-alt,#0B1D3A)"/>',
  user: '<circle cx="12" cy="8" r="4.4" fill="currentColor"/><path d="M3.5 21c.6-5 4-7.4 8.5-7.4s7.9 2.4 8.5 7.4z" fill="currentColor"/>',
  timer: '<circle cx="12" cy="13.4" r="8" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 8.6v5.2l3.4 2" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M9.2 2.6h5.6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  trophy: '<path d="M7 3h10v6.2c0 3.2-2.2 5.4-5 5.4S7 12.4 7 9.2z" fill="currentColor"/><path d="M7 5H3.6c0 3.4 1.4 5.2 4 5.6M17 5h3.4c0 3.4-1.4 5.2-4 5.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.6 14.4h2.8V18h-2.8zM7 21h10l-1-3.4H8z" fill="currentColor"/>',
  back: '<path d="M14.5 5 7.5 12l7 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
  chev: '<path d="M9.5 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
  up: '<path d="M5 14.5l7-7 7 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
  down: '<path d="M5 9.5l7 7 7-7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
  play: '<path d="M7 4.4v15.2L20 12z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  restart: '<path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M19.6 3.6v5.2h-5.2z" fill="currentColor"/>',
  home: '<path d="M3 11.6 12 4l9 7.6M5.6 10.4V20h4.6v-5.6h3.6V20h4.6v-9.6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  volume: '<path d="M3.5 9.4h3.8L12 5.4v13.2l-4.7-4H3.5z" fill="currentColor"/><path d="M15.4 8.6a4.8 4.8 0 0 1 0 6.8M18.2 6a8.4 8.4 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.4" fill="currentColor"/><path d="M8.4 10.5V8a3.6 3.6 0 0 1 7.2 0v2.5" fill="none" stroke="currentColor" stroke-width="2.6"/>',
  check: '<path d="M4.5 12.8 9.6 18 19.6 6.4" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>',
  bolt: '<path d="M13.6 2 5 13.6h5.6L9.6 22l9-12.2h-5.8z" fill="currentColor"/>',
  flame: '<path d="M12 2.4c1 4 5.6 6.2 5.6 11.4A5.6 5.6 0 0 1 12 19.6a5.6 5.6 0 0 1-5.6-5.8c0-2.6 1.4-4 2.6-5.6.2 1.8 1 2.8 2.2 3C11.4 8.6 11.6 5.4 12 2.4z" fill="currentColor"/>',
  cloud: '<path d="M7 18.4a4.4 4.4 0 0 1-.6-8.8A5.8 5.8 0 0 1 17.4 8.6a4.9 4.9 0 0 1 .1 9.8z" fill="currentColor"/>',
  quit: '<path d="M9 4H4.6v16H9M14.4 7.6 19 12l-4.6 4.4M19 12H9" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  shield: '<path d="M12 2.6 20 5.6v6c0 5-3.4 8.4-8 9.8-4.6-1.4-8-4.8-8-9.8v-6z" fill="currentColor"/>',
  map: '<path d="M12 21s7-6.2 7-11.4A7 7 0 0 0 5 9.6C5 14.8 12 21 12 21z" fill="currentColor"/><circle cx="12" cy="9.6" r="2.6" fill="var(--glyph-alt,#0B1D3A)"/>',
  tea: '<path d="M4 9h13v4.6A5.4 5.4 0 0 1 11.6 19H9.4A5.4 5.4 0 0 1 4 13.6z" fill="currentColor"/><path d="M17 10.4h1.4a2.8 2.8 0 0 1 0 5.6H16.6M7.5 2.6c-1.2 1.4 1.2 2.2 0 3.6M11.5 2.6c-1.2 1.4 1.2 2.2 0 3.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

/**
 * A 24x24 glyph in currentColor.
 * @param {string} name key of the glyph table
 * @returns {string} svg markup
 */
export function glyph(name) {
  return `<svg class="glyph g-${name}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${G[name] ?? ''}</svg>`;
}

export const GLYPH_NAMES = Object.keys(G);

let trophyCount = 0;

/**
 * A trophy in gold, silver or bronze (cel-shaded, 96x110).
 * @param {'gold'|'silver'|'bronze'|'none'} tier "none" gives a plain participation rosette
 * @returns {string} svg markup
 */
export function trophySvg(tier = 'gold') {
  const pal = {
    gold: ['#FFF3B0', '#FFD166', '#E0A020', '#A66A00'],
    silver: ['#FFFFFF', '#DDE6F2', '#A5B4CC', '#66758F'],
    bronze: ['#FFD3A8', '#F0A35E', '#C4703A', '#7E4420'],
    none: ['#DCE7F5', '#8FA0C4', '#5B6B8C', '#34415E'],
  }[tier] ?? [];
  const [hi, mid, lo, dk] = pal;
  const id = `tr${(trophyCount = (trophyCount + 1) % 1e9).toString(36)}`;
  if (tier === 'none') {
    return `<svg class="trophy" viewBox="0 0 96 110" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".6" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs>` +
      `<path d="M30 60 L20 104 L38 96 L48 108 L58 96 L76 104 L66 60Z" fill="#E63946" ${O} stroke-width="4"/>` +
      `<polygon points="${seal(48, 44, 40, 34, 16, 0)}" fill="url(#${id})" ${O} stroke-width="4"/><circle cx="48" cy="44" r="24" fill="none" stroke="${dk}" stroke-width="3" opacity=".7"/>` +
      `<text x="48" y="54" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-style="italic" font-size="30" fill="${INK}">GG</text></svg>`;
  }
  return `<svg class="trophy" viewBox="0 0 96 110" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${lo}"/><stop offset=".3" stop-color="${hi}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs>` +
    `<path d="M22 20 H8 c0 22 8 34 26 38 M74 20 H88 c0 22-8 34-26 38" fill="none" ${O} stroke-width="11"/><path d="M22 20 H8 c0 22 8 34 26 38 M74 20 H88 c0 22-8 34-26 38" fill="none" stroke="url(#${id})" stroke-width="5"/>` +
    `<path d="M22 6 H74 V34 C74 54 62 66 48 66 C34 66 22 54 22 34Z" fill="url(#${id})" ${O} stroke-width="4.4"/>` +
    `<path d="M29 12 H37 V34 C37 46 41 54 46 58 C36 54 29 46 29 34Z" fill="#fff" opacity=".55"/>` +
    `<rect x="41" y="64" width="14" height="18" fill="url(#${id})" ${O} stroke-width="4"/>` +
    `<path d="M26 82 H70 L74 96 H22Z" fill="url(#${id})" ${O} stroke-width="4.4"/><rect x="16" y="96" width="64" height="12" rx="3" fill="${dk}" ${O} stroke-width="4"/>` +
    `<polygon points="${seal(48, 32, 12, 5.6, 5, -Math.PI / 2)}" fill="#fff" ${O} stroke-width="2.4"/></svg>`;
}
