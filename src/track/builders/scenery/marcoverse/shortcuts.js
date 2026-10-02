// Marcoverse shortcuts: three decks laid across the void, each with a different kind of risk.
//   1. PORTAL BRIDGE (Portal Bend): a boost-pad chain, a jump ramp and a gap that needs the pads' speed. Miss the pads and you fall.
//   2. WARP RING (Tight Two): a side kicker over the void; fly through the overclock ring at speed and it warps you across the Esses.
//   3. GLITCH BRIDGE (Third Corner): flickering tiles, then a sliding ferry deck. Time it, or fall.
// Numbers come from the route (makeRoute), so the def, the dressing and the tests agree. Nothing here needs a Track.
import { pathDeck, solveApproach } from '../hazards/deck.js';
import { padMaterial } from '../hazards/signs.js';

export const MS = {
  /** Jump gap of the Portal Bridge (m). Boost-pad speed clears it, plain top speed does not. */
  gap1: 36,
  glitchOn: 3.4, glitchOff: 1.4,
  /** Where the glitch bridge leaves the road, metres from the end of the straight after the corkscrew (it must start clear of the helix: the deck would cross it). */
  gb0: -88,
  /** Where it rejoins the road, metres after the end of T3's arc. The road is still flat here (the chicane's bank only builds from t3+30): a deck that landed later
   *  (it used to, at +55) lay flat across a banked road, standing up to 0.35 m proud of it on the inside and 0.27 m below it on the outside, and a kart
   *  driving over that patchwork was thrown 1 m into the air onto the outer edge of the chicane. */
  gb1: 25,
};

/** @param {ReturnType<import('../hazards/deck.js').makeRoute>} R */
export function mvShortcuts(R, opt = {}) {
  const PAD = padMaterial(0x22d3ee);
  const S = R.S, gap1 = opt.gap1 ?? MS.gap1;
  // ---------------------------------------------------------------- 1. Portal Bridge (T1 cut)
  const A1 = R.at(S('s1', -108), 7.5), B1 = R.at(S('t1', opt.b1 ?? 92), 7.5), ap1 = solveApproach(A1, B1, 92);
  const land1 = 34, run1 = ap1.length - 12 - gap1 - land1;                       // run-up (pads) / ramp / gap / landing (then the merge arc)
  const d1 = pathDeck({
    id: 'pb', x: A1.x, z: A1.z, yaw: ap1.yaw, y0: 40, y1: B1.y, width: 13,
    steps: [
      { t: 'solid', len: run1 }, { t: 'ramp', len: 12, rise: 2.4 }, { t: 'gap', len: gap1 },
      { t: 'solid', len: land1 }, { t: 'solid', arc: { r: 92, deg: (ap1.turn * 180) / Math.PI } },
    ],
    pads: [{ u: run1 - 14, off: 0, len: 10 }, { u: run1 - 42, off: -3.2 }, { u: run1 - 70, off: 3.2 }, { u: run1 - 98, off: -3.2 }].map((p) => ({ ...p, material: PAD })),
  });

  // ---------------------------------------------------------------- 3. Glitch Bridge (T3 cut)
  const A3 = R.at(S('climb', MS.gb0), 7.5), B3 = R.at(S('t3', MS.gb1), 7.5), ap3 = solveApproach(A3, B3, 92);
  const tile = 12;
  const d3 = pathDeck({
    id: 'gb', x: A3.x, z: A3.z, yaw: ap3.yaw, y0: A3.y, y1: B3.y, width: 13,
    steps: [
      { t: 'solid', len: 26 },
      { t: 'glitch', len: tile }, { t: 'glitch', len: tile }, { t: 'glitch', len: tile }, { t: 'glitch', len: tile },
      { t: 'solid', len: 16 }, { t: 'gap', len: 12 }, { t: 'solid', len: ap3.length - 26 - 4 * tile - 16 - 12 },
      { t: 'solid', arc: { r: 92, deg: (ap3.turn * 180) / Math.PI } },
    ],
    pads: [{ u: 8, off: 0, len: 10, material: PAD }],
  });
  // the ferry: a deck that slides across the 12 m gap after the tiles (it shares the gap's u range)
  const ferryU = 26 + 4 * tile + 16;
  const ferryPose = d3.at(ferryU);
  const ferry = { id: 'gb:ferry', kind: 'deck', x: ferryPose.x, z: ferryPose.z, yaw: d3.pieces.find((p) => p.step === 6).yaw, length: 12, width: 13, y0: d3.yAt(ferryU), y1: d3.yAt(ferryU + 12), lip: false, startBevel: 0.3, endBevel: 0.3, sideBevel: 0.15, surface: 'road', road: true, curve: 1 };

  // ---------------------------------------------------------------- 2. Warp Ring (T2 -> Esses)
  const sK = S('crest', -6), K0 = R.at(sK, 8.2);
  // kicker aimed at the ring: out over the void on the inside of Tight Two
  const kick = { id: 'warp-kicker', kind: 'ramp', x: K0.x, z: K0.z, yaw: K0.yaw - 0.62, length: 12, width: 9, y0: K0.y, y1: K0.y + 2.6, lip: true, curve: 1.3, startBevel: 0.8, sideBevel: 0.4, surface: 'road', road: true };
  const lip = { x: kick.x + Math.sin(kick.yaw) * kick.length, z: kick.z + Math.cos(kick.yaw) * kick.length };
  const ring = { x: lip.x + Math.sin(kick.yaw) * 15, y: kick.y1 + 0.9, z: lip.z + Math.cos(kick.yaw) * 15, r: 5.6, yaw: kick.yaw };
  const warp = { fromS: sK - 10, toS: S('e1', 10), minSpeed: 31 };

  const specs = [...d1.specs, ...d3.specs, ferry, kick];
  const shortcuts = [
    { id: 'portal-bridge', from: S('s1', -108), to: S('t1', 62) },
    { id: 'glitch-bridge', from: S('climb', MS.gb0), to: S('t3', MS.gb1) },
    { id: 'warp-ring', from: warp.fromS, to: warp.toS },
  ];
  return { d1, d3, ferry, kick, ring, warp, specs, shortcuts, A1, B1, A3, B3, ap1, ap3, tile, ferryU };
}
