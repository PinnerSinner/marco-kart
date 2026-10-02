// Blighty Grand Prix: a drizzly British high-street circuit, clockwise. Wet tarmac, terraced houses, a clock-tower roundabout,
// a humpback bridge over the canal, a market-square hairpin, a hill with esses, a Tube tunnel and a banked sweeper back onto the start straight.
//
//   start straight (E) -> kink -> Kings Corner (c1) -> [FORK 1: Park Drive through the lawns | Tudor chicane, bus garages, park esses]
//   -> clock-tower roundabout -> Fleet Street dog-leg (off-camber) -> Whitehall esses -> canal bridge (Tower Bridge gate / canal leap)
//   -> Embankment bend -> Gasworks S-bend -> [FORK 2: Market Row across the cobbles | market hairpin] -> hill esses (banked) -> crest jump
//   -> Tube tunnel (cross-passage train) -> banked sweeper -> start.
//
// x east, z south (screen down). Every ground height comes from groundHeight(), the road follows it. All set-pieces are placed by mark
// (never by absolute s), so the layout can be re-tuned in one place (LAYOUT / route()).
import { turtle } from '../builders/layout.js';
import { smoothstep } from '../../core/util.js';
import { fbm2, noise2 } from '../builders/noise.js';
import * as THREE from 'three';
import { railingTexture, customTexture, skyEnvTexture } from '../builders/textures.js';
import { dressBlighty } from '../builders/scenery/blighty.js';
import { routeGeom } from '../builders/scenery/routeGeom.js';
import { blightyCuts } from '../builders/scenery/bl/cuts.js';

const CELL = 8;                                            // terrain grid cell: the canal edges sit on grid lines
const EXTENT = [-576, -304, 832, 896];                     // multiples of CELL
const BRIDGE_LEN = 170, BRIDGE_HUMP = 3.3, BRIDGE_HALF = 58;
const ROAD_LIFT = 0.08;
const CANAL_NORTH = 292, CANAL_SOUTH = 140;                // canal reaches this far north / south of the bridge (m)

/** The clockwise route. `bridgeA` = metres from the start of the bridge straight to the canal centre; `closing(info)` finishes the loop. */
function route(t, bridgeA, closing) {
  const info = {};
  t.straight(90).mark('j1'); t.straight(110);                                    // start straight, first bus garages, phone-box chicane
  t.arc(120, -16); t.arc(120, 16);                                               // kink
  t.straight(20).mark('parkA');                                                  // FORK 1 opens: Park Drive leaves here
  t.arc(70, 40, { bank: 4 }); t.arc(45, 50, { bank: 5 }).mark('c1');             // Kings Corner (compound right)
  t.straight(10, { bank: 0 });
  t.arc(60, -50, { bank: -4 }).mark('ch1'); t.arc(60, 50, { bank: 4 });          // Tudor chicane
  t.straight(25, { bank: 0 }).mark('j2'); t.straight(25);                        // second bus garages
  t.arc(90, 38, { bank: 3 }); t.arc(90, -38, { bank: -3 }).mark('parkB');        // park esses; FORK 1 rejoins
  t.straight(20, { bank: 0 });
  t.arc(22, -90).mark('rb0');                                                    // roundabout: in, three quarters around the tower, out
  const p = t.pose(); info.island = { heading: p.heading, x: p.x, z: p.z };
  t.arc(36, 90).mark('rb1'); t.arc(36, 90).mark('rb2'); t.arc(36, 90).mark('rb3');
  t.arc(22, -90).mark('rb4');
  t.straight(20);
  t.arc(55, 45, { bank: 3 }).mark('hs1'); t.arc(55, -90, { bank: 3 }).mark('hs2'); t.arc(55, 45, { bank: 0 });   // Fleet Street dog-leg (the left is off-camber)
  t.straight(18);
  t.arc(70, -40, { bank: -3 }); t.arc(70, 40, { bank: 3 }).mark('es1');          // Whitehall esses
  t.straight(18, { bank: 0 });
  t.arc(70, 40, { bank: 3 }); t.arc(70, -40, { bank: -3 }).mark('es2');
  t.straight(20, { bank: 0 }, 20);
  info.bridgeStart = t.pose();
  t.straight(bridgeA, {}, 20).mark('bridge'); t.straight(BRIDGE_LEN - bridgeA, {}, 20);
  t.arc(45, -90, { bank: -3 }).mark('c2');                                       // Embankment bend
  t.straight(30, { bank: 0 });
  t.arc(55, 45, { bank: 3 }).mark('g1'); t.arc(55, -45, { bank: -3 }).mark('g2');   // Gasworks S-bend
  t.straight(30, { bank: 0 }).mark('mktA');                                       // FORK 2 opens: Market Row leaves here
  t.arc(34, 90, { bank: 6 }).mark('hair'); t.arc(34, 90, { bank: 6 });           // market hairpin
  t.straight(30, { bank: 0 }).mark('mktB');                       // end of the market shortcut; FORK 2 opens: the Tube tunnel goes straight on
  t.arc(60, 50, { bank: 5 }).mark('hill1'); t.arc(60, -100, { bank: -5 }).mark('hill1b'); t.arc(60, 50, { bank: 5 }).mark('tubeB');   // the hill road bulges east round the Tube; FORK 2 rejoins
  t.straight(10, { bank: 0 });
  t.arc(60, -40, { bank: -5 }).mark('hill2'); t.arc(60, 80, { bank: 5 }).mark('hill2b'); t.arc(60, -40, { bank: 0 });   // hill esses (banked)
  t.straight(30, { bank: 0 }).mark('crest');
  return closing(info);
}

/** Pass 1 fixes the canal; pass 2 the closing lengths; pass 3 is the real thing with the banked sweeper. */
function buildRoute() {
  const start = { x: 0, z: 0, heading: 90, y: 0, w: 20 };
  let t = turtle(start);
  let info;
  route(t, 70, (i) => { info = i; t.closeLoop(80); });
  const xc = CELL * Math.round((info.bridgeStart.x - 70) / CELL);
  const bridgeA = info.bridgeStart.x - xc;
  t = turtle(start);
  route(t, bridgeA, (i) => { info = i; t.closeLoop(80); });
  const { L1, L2, theta } = t.lastClosing;
  t = turtle(start);
  const points = route(t, bridgeA, () => {
    t.straight(L1).mark('sw0');
    t.arc(80, theta * 0.2).mark('sw1'); t.arc(80, theta * 0.6).mark('sw2'); t.arc(80, theta * 0.2);
    t.straight(L2);
    return t.close();
  });
  const zb = points.find((p) => p.id === 'bridge').z;
  const isl = info.island, hr = (isl.heading * Math.PI) / 180;
  const island = { x: isl.x - Math.cos(hr) * 36, z: isl.z + Math.sin(hr) * 36, r: 36 };
  return { points, xc, zb, island, L1, L2, theta };
}

const R = buildRoute();

// ---------------------------------------------------------------------------------------------------------------- terrain fields
// Distance to the road and "inside the circuit" on a coarse grid (cheap, computed once from the control points). The misty downs on the
// horizon start a long way from the road and the park lawns fill the inside of the loop, wherever the loop happens to run.
const FIELD = (() => {
  const step = 12, [x0, z0, x1, z1] = EXTENT, nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
  const poly = [], P = R.points;
  for (let i = 0; i < P.length; i++) {                                         // densify: the control points of an arc are 22 degrees apart
    const a = P[i], b = P[(i + 1) % P.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 16));
    for (let k = 0; k < n; k++) poly.push([a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n]);
  }
  const dist = new Float32Array(nx * nz), inside = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, z = z0 + j * step;
    let best = 1e9, c = false;
    for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
      const [ax, az] = poly[k], [bx, bz] = poly[m], ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
      const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)), dx = x - (ax + ex * u), dz = z - (az + ez * u);
      const d2 = dx * dx + dz * dz; if (d2 < best) best = d2;
      if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
    }
    dist[j * nx + i] = Math.sqrt(best); inside[j * nx + i] = c ? 1 : 0;
  }
  const cell = (x, z) => { const fx = (x - x0) / step, fz = (z - z0) / step; return [Math.max(0, Math.min(nx - 1.001, fx)), Math.max(0, Math.min(nz - 1.001, fz))]; };
  return {
    /** bilinear distance to the nearest road (m) */
    dist(x, z) { const [fx, fz] = cell(x, z), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, d = dist; const a = d[j * nx + i], b = d[j * nx + i + 1], c = d[(j + 1) * nx + i], e = d[(j + 1) * nx + i + 1]; return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v; },
    /** true inside the loop (the park side) */
    inside(x, z) { const [fx, fz] = cell(x, z); return inside[Math.round(fz) * nx + Math.round(fx)] === 1; },
  };
})();

// ---------------------------------------------------------------------------------------------------------------- the city's shape
// The hill sits west of the market hairpin: the road climbs it in banked esses and drops off its far side towards the Tube tunnel.
const HILL = (() => {
  const h1 = R.points.find((p) => p.id === 'hill1'), h2 = R.points.find((p) => p.id === 'hill2'), cr = R.points.find((p) => p.id === 'crest');
  return { x: (h1.x + h2.x) / 2 - 8, z: (h1.z + cr.z) / 2 + 20, s: 85, h: 14 };
})();

/** Ground height (m) of the whole city: flat streets, a broad hill in the west, misty downs on the horizon. */
export function groundHeight(x, z) {
  const hill = HILL.h * Math.exp(-(((x - HILL.x) ** 2 + (z - HILL.z) ** 2) / (2 * HILL.s * HILL.s)));
  const downs = smoothstep(300, 620, FIELD.dist(x, z)) * (24 + 40 * fbm2(x * 0.004, z * 0.004, 3, 5));
  return hill + downs + (fbm2(x * 0.02, z * 0.02, 2, 3) - 0.5) * 0.25 * smoothstep(20, 200, Math.abs(hill) + downs);
}

// road heights, bridge hump
{
  const zb = R.zb, xc = R.xc, P = R.points;
  P.forEach((p) => {
    p.y = groundHeight(p.x, p.z) + ROAD_LIFT;
    if (Math.abs(p.z - zb) < 60 && Math.abs(p.x - xc) < BRIDGE_HALF) p.y += BRIDGE_HUMP * (0.5 + 0.5 * Math.cos((Math.PI * (p.x - xc)) / BRIDGE_HALF));
  });
  const ids = P.map((p) => p.id), sw1 = ids.indexOf('sw1'), sw2 = ids.indexOf('sw2');
  P.forEach((p, i) => { if (i === sw1) p.bank = 4; else if (i === sw2 + 1) p.bank = 5; else if (i > sw1 && i <= sw2) p.bank = 9; });
}

const CANAL_Z = [CELL * Math.round((R.zb - CANAL_NORTH) / CELL), CELL * Math.round((R.zb + CANAL_SOUTH) / CELL)];
const CANAL = { x0: R.xc - 8, x1: R.xc + 8, z0: CANAL_Z[0], z1: CANAL_Z[1], level: -1.5, floor: -3.4 };
const inCanal = (x, z) => x > CANAL.x0 && x < CANAL.x1 && z > CANAL.z0 && z < CANAL.z1;   // strict: the bank nodes on the edge keep the ground height

/** Everything the dressing needs to know about the shape of the city. */
const CTX = { island: R.island, canal: CANAL, bridgeZ: R.zb, hill: HILL, extent: EXTENT, cell: CELL, field: FIELD, closing: { L1: R.L1, L2: R.L2, theta: R.theta } };

function baseDef() {
  return {
    id: 'blighty', name: 'Blighty Grand Prix', lapCount: 3, seed: 21, music: 'blighty', killY: -14,
    environment: {
      skyTop: 0x66717f, skyBottom: 0xaeb8c2, fogColor: 0x9ea9b4, fogNear: 55, fogFar: 520,
      sunDir: [0.3, 0.78, 0.5], sunColor: 0xdfe7f0, sunIntensity: 1.15, ambientColor: 0xb4c2d2, ambientIntensity: 1.3,
      skyKind: 'overcast', clouds: 0.95, rain: 0.7,
    },
    road: {
      width: 20, kerbWidth: 1.2, wallGap: 1.3, tile: 14, underTile: 2.4,
      markings: {
        edge: { colour: 0xe8e8e2, inset: 0.6, width: 0.2 }, centre: { kind: 'dashed', colour: 0xe8e8e2, dash: 3, gap: 6, width: 0.16 },
        skip: [{ from: '@j1-19', to: '@j1+19' }, { from: '@j2-19', to: '@j2+19' }, { from: '@rb0-4', to: '@rb4+4' }],
      },
    },
    points: R.points,
    materials: (kit) => blightyMaterials(kit),
    walls: {
      railing: { shape: 'plane', height: 1.15, thickness: 0.12, tile: 4, map: railingTexture(), roughness: 0.6 },
      brick: { height: 1.0, thickness: 0.55, colour: 0x9a4b3b, top: 0xc8b9a6 },
      parapet: { height: 1.25, thickness: 0.8, colour: 0xa6493a, top: 0xd6cdbd },
      island: { height: 0.6, thickness: 0.5, colour: 0x8f8f95, top: 0xb4b4ba },
      hedge: { shape: 'hedge', height: 1.5, thickness: 1.5, colour: 0x3f7d3b },
    },
    kerbs: { default: {}, rw: {} },
    defaults: { both: { wall: 'railing', kerb: true, edge: 'grass', skirt: 6 } },
    zones: [
      // bus garages: open mouths, the depots behind are closed off with capsule colliders (see scenery)
      { from: '@j1-17', to: '@j1+17', wall: 'none', kerb: false },
      { from: '@j2-17', to: '@j2+17', wall: 'none', kerb: false },
      { from: '@c1-70', to: '@ch1+60', kerb: 'rw' },
      { from: '@rb0', to: '@rb3', side: 'right', wall: 'island', kerb: 'rw', skirt: 0 },
      { from: '@rb0', to: '@rb3', side: 'left', kerb: 'rw' },
      { from: '@hs1-30', to: '@hs2+60', kerb: 'rw' },
      { from: '@hair-14', to: '@hair+95', kerb: 'rw' },
      { from: '@hair-14', to: '@hair+95', side: 'left', wall: 'brick' },
      { from: '@hill1', to: '@hill2', wall: 'hedge' },
      { from: '@sw0', to: '@sw2+60', kerb: 'rw' },
      // canal bridge: brick viaduct with parapets, no verge skirt
      { from: '@bridge-40', to: '@bridge+40', wall: 'parapet', kerb: false, skirt: 0, thickness: 2.2 },
    ],
    terrain: {
      height: (x, z) => (inCanal(x, z) ? CANAL.floor : groundHeight(x, z)), base: 0, cell: CELL, extent: EXTENT, bounds: EXTENT,
      holes: [[CANAL.x0, CANAL.z0, CANAL.x1, CANAL.z1]],
      surface: (x, z) => (inCanal(x, z) ? 'void' : null),
      detail: 'stone', colour: (surface, x, z, h, out, track) => groundColour(surface, x, z, h, out, track),
    },
    water: { level: CANAL.level, extent: [CANAL.x0 - CELL, CANAL.z0 - CELL, CANAL.x1 + CELL, CANAL.z1 + CELL], cell: CELL, depth: (x, z) => (x >= CANAL.x0 && x <= CANAL.x1 && z >= CANAL.z0 && z <= CANAL.z1 ? 3 : -1), shallow: 0x4d6d63, deep: 0x1b2c29, opacity: 0.97, roughness: 0.06, envMap: skyEnvTexture(), envIntensity: 1.3, normalScale: 0.9 },
    // puddles (water surface): on and around the racing line, avoidable but tempting
    patches: [
      { kind: 'water', s: '@j1+75', lateral: 3, rs: 11, rl: 4.2 }, { kind: 'water', s: '@c1+22', lateral: -3.5, rs: 9, rl: 4 },
      { kind: 'water', s: '@parkB+46', lateral: 2, rs: 10, rl: 4.4 }, { kind: 'water', s: '@rb4+40', lateral: -3, rs: 12, rl: 4.4 },
      { kind: 'water', s: '@es2+38', lateral: 3.5, rs: 10, rl: 4.2 }, { kind: 'water', s: '@c2+40', lateral: 1, rs: 9, rl: 4.6 },
      { kind: 'water', s: '@g2-30', lateral: -2, rs: 11, rl: 4.4 }, { kind: 'water', s: '@hill2+30', lateral: 3, rs: 10, rl: 4.2 },
    ],
    boostPads: [
      { s: '@j1+135', lateral: 0, length: 12, width: 8 }, { s: '@rb4+22', lateral: 0, length: 12, width: 8 },
      { s: '@hair+88', lateral: 0, length: 12, width: 8 }, { s: '@sw1-40', lateral: 0, length: 12, width: 9 },
    ],
    ramps: [{ id: 'crest-jump', s: '@crest+12', lateral: 0, length: 12, width: 10, rise: 2.1, kind: 'ramp' }],
    itemRows: [{ s: 50 }, { s: '@c1+60' }, { s: '@rb0-50' }, { s: '@rb4+80' }, { s: '@es2+50' }, { s: '@bridge+75' }, { s: '@hair+70' }, { s: '@hill2+50' }],
    checkpoints: [0, '@parkA', '@parkB', '@rb2', '@hs2', '@es2', '@c2', '@hair', '@tubeB', '@crest', '@sw1'],
    signs: [
      { from: '@c1-80', to: '@c1-6', every: 12, side: 'left' }, { from: '@hair-40', to: '@hair+60', every: 10, side: 'left' },
      { from: '@sw1-10', to: '@sw2+40', every: 14, side: 'left' }, { from: '@c2-40', to: '@c2-4', every: 10, side: 'right' },
    ],
    paint: blightyPaint(),
    dress(kit) { dressBlighty(kit, { ...CTX, G, cuts: cuts() }); },
  };
}

const G = routeGeom(() => baseDef());
let CUTS = null;
const cuts = () => (CUTS ??= blightyCuts(G));

export default function blighty() {
  const def = baseDef(), C = cuts();
  return { ...def, zones: [...def.zones, ...C.zones], ramps: [...def.ramps, ...C.ramps], boostPads: [...def.boostPads, ...C.boostPads], patches: [...def.patches, ...C.patches], shortcuts: C.shortcuts, forks: C.forks };
}

/** Wet-city materials: dark reflective tarmac, brick viaduct, hazard-striped roadworks ramp. */
function blightyMaterials(kit) {
  const { lit } = kit.mat, T = kit.tex, env = T.skyEnvTexture();
  const wet = { envMap: env, envMapIntensity: 0.9 };
  const hazard = customTexture('hazard', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d6a11c'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#1a1a1e';
    for (let k = -2; k < 4; k++) { ctx.beginPath(); ctx.moveTo(k * 64, 0); ctx.lineTo(k * 64 + 32, 0); ctx.lineTo(k * 64 + 32 + h, h); ctx.lineTo(k * 64 + h, h); ctx.fill(); }
  }, { aniso: 8 });
  return {
    road: lit({ map: T.asphaltTexture({ base: 0x353840, wet: true, seed: 5 }), roughness: 0.38, metalness: 0.12, ...wet }, 'road'),
    kerb: () => lit({ map: T.kerbTexture({ a: 0xb4b4ae, b: 0xe4e4de }), roughness: 0.75 }, 'kerb'),
    kerbs: { rw: lit({ map: T.kerbTexture(), roughness: 0.55, ...wet }, 'kerb-rw') },
    verge: lit({ map: T.detailTexture({ kind: 'stone' }), vertexColors: true, roughness: 0.85 }, 'verge'),
    underside: lit({ map: T.brickTexture({ seed: 9 }), vertexColors: true, color: 0xc26a48, roughness: 0.9 }, 'underside'),
    platform: lit({ map: hazard, roughness: 0.6, ...wet }, 'platform'),
  };
}

const _c = new THREE.Color();
const _q = { height: 0, surface: 'grass', onRoad: false, s: 0, lateral: 0, inVoid: false }, _p = { x: 0, y: 1e4, z: 0 };
const HAIR = R.points.find((p) => p.id === 'hair');       // the market square fills the inside of the hairpin
const inMarket = (x, z) => { const dx = x - HAIR.x, dz = z - (HAIR.z - 34); return dz < 0 ? Math.abs(dx) < 26 && dz > -34 : dx * dx + dz * dz < 26 * 26; };
const PAVE = [0x7d8086, 0x9c9a94], LAWN = [0x476f36, 0x648f43], FIELD_C = [0x50703a, 0x6c8a48];
/** Terrain colours: paving near the streets, lawn inside the circuit and on the hill, misty fields on the horizon. */
function groundColour(surface, x, z, h, out, track) {
  if (surface === 'void') return out.set(0x2a3330);
  _p.x = x; _p.z = z;
  const q = track.query(_p, _q), d = Math.abs(q.lateral) - track.widthAt(q.s) / 2;
  const n = fbm2(x * 0.05, z * 0.05, 3, 4), n2 = noise2(x * 0.35, z * 0.35, 8);
  if (inMarket(x, z)) return out.set(0x8b8781).lerp(_c.set(0xa29d94), noise2(x * 0.9, z * 0.9, 3)).multiplyScalar(0.86 + 0.28 * n2);   // market cobbles
  const park = FIELD.inside(x, z) && d > 6;
  const hill = h > 2.2 && d > 8 && x < HILL.x + 120;
  if (park || hill) return out.set(LAWN[0]).lerp(_c.set(LAWN[1]), n).multiplyScalar(0.85 + 0.25 * n2);
  if (d > 300) return out.set(FIELD_C[0]).lerp(_c.set(FIELD_C[1]), n).multiplyScalar(0.85 + 0.25 * n2);
  const t = d < 5 ? 0.85 : n;                            // lighter pavement hugging the road
  return out.set(PAVE[0]).lerp(_c.set(PAVE[1]), t).multiplyScalar(0.9 + 0.2 * n2);
}

/** Road paint: zebra crossings by the bus garages, stop lines. */
function blightyPaint() {
  const out = [];
  for (const m of ['@j1-25', '@j2-25', '@j1+25', '@j2+25']) for (let l = -8.4; l <= 8.5; l += 1.4) out.push({ kind: 'rect', s: m, lateral: l, len: 3.4, wid: 0.75, colour: 0xf0f0ea });
  for (const m of ['@rb0-18']) out.push({ kind: 'rect', s: m, lateral: 0, len: 0.5, wid: 18.4, colour: 0xf0f0ea });
  out.push({ kind: 'arrow', s: '@rb0-40', lateral: -5, len: 6, wid: 2.4, colour: 0xf0f0ea }, { kind: 'arrow', s: '@rb0-40', lateral: 5, len: 6, wid: 2.4, colour: 0xf0f0ea });
  return out;
}
