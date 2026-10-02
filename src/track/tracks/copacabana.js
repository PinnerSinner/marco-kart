// Copacabana Calçadão: sunny seaside circuit. Wavy black-and-white mosaic promenade, palms, beach, sea, hills.
// Layout (x east, z south, the sea to the south), about 2.8 km, a lap of roughly 85 s:
//   start straight along the promenade -> kiosk esses -> FORK 1 (the spline sweeps north round the kiosk plaza; a straight timber boardwalk
//   with three beach kickers runs along the sand) -> east hairpin with FORK 2 (the turf pitch across its infield) -> a three-leg switchback
//   climb with chicanes up the favela hill -> the crest jump -> ridge esses (banked, off-camber) -> the Tunnel descent -> the sambodromo
//   sweeper (banked left) back onto the promenade.
import { smoothstep } from '../../core/util.js';
import { noise2, fbm2 } from '../builders/noise.js';
import { turtle } from '../builders/layout.js';
import { dressCopacabana } from '../builders/scenery/copacabana.js';
import { routeGeom } from '../builders/scenery/routeGeom.js';
import { copaCuts } from '../builders/scenery/copa/cuts.js';

// ------------------------------------------------------------------------------------------------------------------ the centreline
const Q = { h0: 49, a1: 30, a1b: 23, a2: 21, a2b: 50, a3: 165.5, c1: 22.5, c2: -1.2, s1: 37, r1: 25.7, r2: 14.3, r3: 35, r4: 18, r5: 27.5, r6: 9, s2: 71, s3: 144.5, R: 110 };

function walk() {
  const t = turtle({ x: 0, z: 0, heading: 90, y: 1, w: 22 });
  t.straight(200).mark('slalom');
  t.arc(100, -24).mark('k1'); t.arc(100, 24); t.arc(100, 24); t.arc(100, -24).mark('k2');      // kiosk esses (the pads weave through them)
  t.straight(40, {}, 40).mark('forkA');
  t.arc(110, -46); t.arc(110, 92); t.arc(110, -46).mark('forkB');                                 // the spline's sweep round the kiosk plaza; the boardwalk goes straight
  t.straight(Q.h0, {}, 40).mark('hairIn');
  t.arc(42, -180, { w: 20 }).mark('hair1');                                                       // east hairpin (the pitch cuts its infield)
  t.straight(Q.a1, { y: 3 });
  t.arc(70, 24, { y: 4 }); t.arc(70, -24, { y: 5 }).mark('leg1');                                 // chicane in the first climbing leg
  t.straight(Q.a1b, { y: 6 });
  t.arc(30, 180, { y: 7.5 }).mark('sw1');                                                         // switchback 1 (right)
  t.straight(Q.a2, { y: 9 });
  t.arc(80, -22, { y: 10 }); t.arc(80, 22, { y: 11 }).mark('leg2');
  t.straight(Q.a2b, { y: 12 });
  t.arc(30, -180, { y: 13.5 }).mark('sw2');                                                       // switchback 2 (left)
  t.straight(Q.a3, { y: 15 }).mark('leg3');
  t.arc(70, Q.c1, { y: 16 }); t.arc(70, -Q.c1 + Q.c2, { y: 17.5 }).mark('crest');
  t.straight(Q.s1, { y: 17 });
  t.arc(90, Q.r1, { y: 13, bank: 8 }); t.arc(90, -Q.r1 - Q.r2, { y: 11.5, bank: -8 }).mark('ess1');   // ridge esses, banked and off-camber
  t.arc(90, Q.r2 + Q.r3, { y: 12.5, bank: 8 }); t.arc(90, -Q.r3 - Q.r4, { y: 14.5, bank: -6 }).mark('ess2');
  t.straight(Q.s2, { y: 13, bank: 0 });
  t.arc(90, Q.r4 + Q.r5, { y: 10, bank: 6 }); t.arc(90, -Q.r5 - Q.r6, { y: 8, bank: -6 }).mark('ess3');
  t.straight(25, { y: 7, bank: 0 }).mark('tunA');
  t.straight(95, { y: 7 }).mark('tunB');                                                         // the tunnel
  t.straight(Q.s3 - 120, { y: 7 });
  return t;
}

function layout() {
  const probe = walk(); probe.closeLoop(Q.R, { y: 1, bank: 0 });
  const { L1, theta } = probe.lastClosing, t = walk();
  t.straight(L1, { y: 1, bank: -4, w: 22 });
  t.arc(Q.R, theta / 2, { bank: -11 }).mark('sweep'); t.arc(Q.R, theta / 2, { bank: -11 });    // sambodromo sweeper, banked
  t.straight(probe.lastClosing.L2, { bank: 0 });
  const pts = t.close(); pts[0].id = 'start';
  return pts;
}

const shoreZ = (x) => 70 + 9 * Math.sin(x * 0.011 + 1) + 5 * Math.sin(x * 0.031) + 3 * Math.sin(x * 0.083);

/** Terrain height (before the road embankments are added by terrain.follow): beach + sea south, hills north, offshore rock east. */
function terrainHeight(x, z) {
  const d = z - shoreZ(x);
  let h = d > 0 ? -Math.min(d, 110) * 0.09 - Math.pow(Math.min(d, 60) / 60, 2) * 0.6 : 0.25;
  const north = smoothstep(-235, -520, z);
  h += north * (35 + 70 * fbm2(x * 0.004, 3.3, 3, 4)) * (0.5 + 0.9 * fbm2(x * 0.011, z * 0.011, 4, 7));
  h += 125 * Math.exp(-(((x - 200) ** 2) / (2 * 100 ** 2) + ((z + 720) ** 2) / (2 * 110 ** 2)));   // statue peak
  const dr = Math.hypot(x - 1090, z - 150);
  h += 96 * Math.max(0, 1 - (dr / 120) ** 2) ** 0.8;                                             // offshore rock
  return h;
}

const KERB_COLOURS = { kiosk: [0xffd166, 0x1f9d4c], beach: [0x22d3ee, 0xf5f5f0], hair: [0x2f6fe0, 0xf5f5f0], hill: [0xff7f11, 0xf5f5f0], ridge: [0x8338ec, 0xf5f5f0], sweep: [0xf15bb5, 0xf5f5f0] };
const HOTEL = { x: 250, z: -96, w: 64, d: 28 };
const CTX0 = {
  shoreZ,
  pitch: null,                                                     // the pitch lives inside the hairpin (copa/cuts.js)
  hotel: HOTEL,
  statue: { x: 200, z: -715 },
  courts: [{ x: 96, z: 38 }, { x: 132, z: 40 }, { x: 168, z: 39 }, { x: 250, z: 44 }, { x: 286, z: 43 }, { x: 800, z: 46 }, { x: 836, z: 44 }, { x: -40, z: 44 }],
  guards: [[62, 52], [468, 62], [655, 56], [-40, 50], [180, 54]],
  cable: { a: { x: 960, z: -360 }, b: { x: 1085, z: 150 }, pylons: [[1020, -140, 40]] },
};

// The geometry of the plain route (no shortcuts, no dressing), built once, so decks and gates can be placed in world coordinates.
const G = routeGeom(() => baseDef());
let CUTS = null;
const cuts = () => (CUTS ??= copaCuts(G));

/** Keep scenery off the forks: the boardwalk ribbon, the pitch and the gaps in the walls, and off the hotel. */
function blocked(sp, kit) {
  const C = cuts(), P = C.pitch;
  for (const rb of kit?.track.ribbons ?? []) if (rb.edgeDistance(sp.x, sp.z) < 9) return true;
  if (P) { const dx = sp.x - P.x, dz = sp.z - P.z, u = dx * P.fx + dz * P.fz, v = dx * P.rx + dz * P.rz; if (u > -16 && u < P.length + 18 && Math.abs(v) < P.width / 2 + 16) return true; }
  if (Math.abs(sp.x - HOTEL.x) < HOTEL.w / 2 + 6 && Math.abs(sp.z - HOTEL.z) < HOTEL.d / 2 + 6) return true;
  return false;
}

function baseDef() {
  return {
    id: 'copacabana', name: 'Copacabana Calçadão', lapCount: 3, seed: 11, music: 'copacabana', killY: -14,
    environment: {
      skyTop: 0x2f8fe8, skyBottom: 0xbfe6ff, fogColor: 0xcdeaff, fogNear: 260, fogFar: 1500,
      sunDir: [0.55, 0.85, 0.35], sunColor: 0xfff0d0, sunIntensity: 2.6, ambientColor: 0x9cc8ff, ambientIntensity: 0.95, skyKind: 'day', clouds: 0.45,
    },
    road: { width: 22, kerbWidth: 1.4, wallGap: 1.3, tile: 22, markings: { edge: null } },
    // every corner gets its own kerb colours: yellow/green (kiosk esses), cyan (beach sweep), blue (hairpin), orange (favela hill), violet (ridge), pink (sambodromo sweeper)
    materials: (kit) => ({
      road: kit.mat.lit({ map: kit.tex.mosaicTexture({ size: 1024, bands: 8, waves: 2, amp: 0.05 }), roughness: 0.82 }, 'road'),
      kerbs: Object.fromEntries(Object.entries(KERB_COLOURS).map(([k, [a, b]]) => [k, kit.mat.lit({ map: kit.tex.kerbTexture({ a, b }), roughness: 0.8 }, `kerb-${k}`)])),
    }),
    points: layout(),
    walls: {
      balustrade: { height: 1.0, thickness: 0.55, colour: 0xf3ede2, top: 0xffffff },
      rock: { height: 1.5, thickness: 1.2, colour: 0x8c7b68, top: 0xa8967f },
      rail: { height: 0.9, thickness: 0.3, colour: 0xc8cdd4, top: 0xeef1f4 },
    },
    kerbs: { default: {}, kiosk: {}, beach: {}, hair: {}, hill: {}, ridge: {}, sweep: {} },
    defaults: { left: { wall: 'balustrade', edge: 'grass', skirt: 8 }, right: { wall: null, edge: 'sand', skirt: 9 } },
    zones: [
      { from: '@k1-45', to: '@k2+45', kerb: 'kiosk' },
      { from: '@forkA', to: '@forkB', kerb: 'beach', side: 'left', wall: 'balustrade' },
      { from: '@hairIn-70', to: '@hair1+60', side: 'right', wall: 'rock', edge: 'grass' },
      { from: '@hairIn-70', to: '@hair1+60', side: 'left', wall: null, kerb: 'hair', edge: 'sand' },
      { from: '@hair1+60', to: '@crest', side: 'right', wall: 'rail', edge: 'grass', skirt: 6 },
      { from: '@hair1+60', to: '@crest', side: 'left', wall: 'rock', edge: 'grass', skirt: 6 },
      { from: '@hair1+60', to: '@crest', kerb: 'hill' },
      { from: '@crest', to: '@ess3', side: 'right', wall: 'rail', edge: 'grass', skirt: 6 },
      { from: '@crest', to: '@ess3', side: 'left', wall: 'rail', edge: 'grass', skirt: 6 },
      { from: '@crest', to: '@ess3', kerb: 'ridge' },
      { from: '@ess3', to: '@sweep-150', side: 'right', wall: 'rock', edge: 'grass', skirt: 6 },
      { from: '@ess3', to: '@sweep-150', side: 'left', wall: 'rock', edge: 'grass', skirt: 6 },
      { from: '@sweep-150', to: '@sweep+160', side: 'left', edge: 'grass', skirt: 6, kerb: 'sweep' },
      { from: '@sweep-150', to: '@sweep+160', side: 'right', wall: 'rail', edge: 'grass', skirt: 6, kerb: 'sweep' },
    ],
    terrain: {
      height: terrainHeight, base: 0, follow: { slope: 0.16, reach: 120 },
      bounds: [-420, -900, 1300, 420],
      surface: (x, z, h) => (h < -0.35 ? 'void' : h < 0.05 && z > 40 ? 'sand' : null),
      colour: terrainColour,
    },
    water: { level: 0, extent: [-420, 30, 1300, 420], cell: 12, shallow: 0x7fe4d8, deep: 0x0f66a8 },
    // the slalom: four pads alternating left and right (32 m apart) reward a weaving drift line down the start straight
    boostPads: [
      { s: 96, lateral: -6.5, length: 10, width: 7 }, { s: 128, lateral: 6.5, length: 10, width: 7 }, { s: 160, lateral: -6.5, length: 10, width: 7 }, { s: 192, lateral: 6.5, length: 10, width: 7 },
      { s: '@forkB-60', lateral: -3, length: 12, width: 8 },
      { s: '@hair1+40', lateral: 0, length: 12, width: 8 },
      { s: '@sw1+55', lateral: 0, length: 12, width: 8 }, { s: '@sw2+60', lateral: 0, length: 12, width: 8 },
      { s: '@ess1+55', lateral: 4, length: 10, width: 7 }, { s: '@ess2+35', lateral: 0, length: 12, width: 8 },
      { s: '@tunA+30', lateral: 0, length: 14, width: 9 }, { s: '@sweep+60', lateral: 0, length: 12, width: 9 },
    ],
    ramps: [
      { id: 'crest-jump', s: '@crest+14', lateral: 0, length: 12, width: 10, rise: 2.0, kind: 'ramp' },
    ],
    // chevrons on the outside of the tight corners
    signs: [
      { from: '@hairIn-60', to: '@hair1+20', every: 9, side: 'right', dir: 'left' }, { from: '@sw1-60', to: '@sw1+70', every: 10, side: 'left', dir: 'right' },
      { from: '@sw2-60', to: '@sw2+70', every: 10, side: 'right', dir: 'left' },
      { from: '@sweep-90', to: '@sweep+90', every: 12, side: 'right', dir: 'left' },
      { from: '@k1-30', to: '@k1+40', every: 12, side: 'right', dir: 'left' }, { from: '@k1+55', to: '@k2-55', every: 12, side: 'left', dir: 'right' },
    ],
    itemRows: [{ s: 70 }, { s: '@k2-40' }, { s: '@forkA+40' }, { s: '@forkB+10' }, { s: '@hair1+90' }, { s: '@leg1+40' }, { s: '@leg2+30' }, { s: '@leg3-60' }, { s: '@ess1+95' }, { s: '@ess3+60' }, { s: '@sweep-40' }, { s: '@sweep+110' }],
    checkpoints: [0, 250, '@forkA', '@forkB', '@hair1', '@sw1', '@sw2', '@crest', '@ess2', '@ess3+100', '@sweep'],
    dress(kit) { dressCopacabana(kit, { ...CTX0, G, cuts: cuts(), blocked: (sp) => blocked(sp, kit) }); },
  };
}

export default function copacabana() {
  const def = baseDef(), C = cuts();
  // forks: data only (tests, minimap and other agents read it). `alt` = id of the platform that carries the second road.
  const forks = [
    { id: 'beach', name: 'Calcadao or beach boardwalk', from: '@forkA', to: '@forkB', alt: 'beach' },
    { id: 'pitch', name: 'Hairpin or the pitch', from: '@hairIn-30', to: '@hair1+30', alt: 'pitch' },
  ];
  return { ...def, zones: [...def.zones, ...C.zones], ramps: [...C.ramps, ...def.ramps], shortcuts: C.shortcuts, boostPads: [...def.boostPads, ...C.boostPads], forks };
}

function terrainColour(surf, x, z, h, out) {
  const C = out.constructor;
  if (surf === 'void' || h < -0.2) return out.set(0xd9c89a).lerp(new C(0x1a6f8a), Math.min(1, -h / 5));
  if (surf === 'sand') return out.set(0xf3dca8).lerp(new C(0xe2be7e), fbm2(x * 0.05, z * 0.05, 3, 2)).multiplyScalar(0.94 + 0.12 * noise2(x * 0.4, z * 0.4, 8));
  if (h > 55) return out.set(0x8f8577).lerp(new C(0xb5aa98), fbm2(x * 0.05, z * 0.05, 3, 6));
  if (h > 5) { const g = fbm2(x * 0.02, z * 0.02, 4, 3); return out.set(0x2f8f3d).lerp(new C(0x8dc63f), g).multiplyScalar(0.8 + 0.2 * noise2(x * 0.3, z * 0.3, 1)); }
  if (z < -12 && z > -60 && x > -120 && x < 740) return out.set(0xe9e1d2).lerp(new C(0xd6cdbb), noise2(x * 0.5, z * 0.5, 4)); // promenade paving
  return null;
}
