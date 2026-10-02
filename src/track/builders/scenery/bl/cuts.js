// Blighty forks, shortcuts and timed gates: pure gameplay data (ribbon roads, decks, zones, declared shortcuts, boost pads).
// The dressing that draws them is in ./setpieces.js. World placements come from routeGeom (the plain route asked for coordinates);
// everything is placed by MARK so the layout in tracks/blighty.js can be re-tuned freely.
//
//   FORK 1 Park Drive   (parkA..parkB, ~370 m)   the main road turns right round Kings Corner, through the Tudor chicane, past the bus garages and
//                                                the park esses; Park Drive (a full-width ribbon) goes straight on across the lawns with a weave round
//                                                the bandstand and a humpback bridge over the brook.
//   FORK 2 The Tube     (mktB..tubeB, ~190 m)    the hill road bulges east in a banked S; the Tube (ribbon) runs straight through a tiled tunnel with a
//                                                cross-passage where a train crosses on a timed cycle.
//   B2 Market cut       (hairpin)                a cobbled shortcut deck across the market square (grass-slow), with a delivery van crossing.
//   B3 Canal leap       (Tower Bridge)           a towpath ramp and a 22 m jump over the canal beside the bridge. Skips the lifting bridge (and its gate).
import { deckBetween } from '../routeGeom.js';
import { makeRibbon } from '../../branch.js';

export const GATE = { cycle: 30, phase: 8, warn: 20, down: 21, closed: 22, rise: 28, up: 29, leafUp: 22, leafTop: 24, leafFall: 26, leafDown: 28 };

const FLAT = { sideBevel: 0.4, startBevel: 0.4, endBevel: 0.4 };
const PAD = (id, rb, u, extra = {}) => { const p = rb.at(u, {}); return { id, kind: 'pad', surface: 'boost', road: true, x: p.x, z: p.z, yaw: p.yaw, length: 12, width: 7, y0: p.y + 0.04, y1: p.y + 0.04, ...FLAT, ...extra }; };

export function blightyCuts(G) {
  const ramps = [], zones = [], shortcuts = [], boostPads = [], patches = [];
  const tr = () => G.track(), gy = (x, z) => tr().heightAt(x, z);
  const out = { ramps, zones, shortcuts, boostPads, patches, park: null, tube: null, market: null, leap: null };

  // ---------------------------------------------------------------- FORK 1: Park Drive (ribbon across the lawns)
  {
    const A = G.at('@parkA', 0), B = G.at('@parkB', 0), pa = G.at('@parkA-40', 0), pb = G.at('@parkB+30', 0);
    const q1 = G.at('@parkA+4', 9), q2 = G.at('@parkB-14', 13);
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, rx = -uz, rz = ux;
    // (fraction of the chord, metres to the right of it, extra height)
    const prof = [[0.13, -2, 0], [0.27, 13, 0], [0.4, -7, 0], [0.465, -9, 0], [0.5, -9, 1.9], [0.535, -9, 0], [0.62, 12, 0], [0.76, -8, 0], [0.88, 7, 0]];
    const mid = prof.map(([u, l, h]) => ({ x: A.x + dx * u + rx * l, z: A.z + dz * u + rz * l, y: A.y + (B.y - A.y) * u + h, w: 16 }));
    const ctrl = [{ x: pa.x, z: pa.z, y: pa.y, w: 18 }, { x: q1.x, z: q1.z, y: q1.y, w: 16 }, ...mid, { x: q2.x, z: q2.z, y: q2.y, w: 16 }, { x: pb.x, z: pb.z, y: pb.y, w: 18 }];
    const rb = makeRibbon({ pts: ctrl, step: 3 });
    out.park = { rb, ctrl, A, B, bridgeU: 0, brook: null };
    // the humpback bridge: find its crest (highest point) so the dressing can put the brook and parapets there
    let best = 0, bu = 0; for (let u = 0; u <= rb.total; u += 1) { const p = rb.at(u, {}); if (p.y > best) { best = p.y; bu = u; } }
    out.park.bridgeU = bu;
    ramps.push(PAD('park-pad1', rb, rb.total * 0.2), PAD('park-pad2', rb, bu + 26), PAD('park-pad3', rb, rb.total * 0.82));
    zones.push({ from: '@parkA-45', to: '@parkA+48', side: 'right', wall: 'none', kerb: false });
    zones.push({ from: '@parkB-50', to: '@parkB+30', side: 'right', wall: 'none', kerb: false });
  }

  // ---------------------------------------------------------------- FORK 2: the Tube (ribbon straight through the hill)
  {
    const A = G.at('@mktB', 0), B = G.at('@tubeB', 0), pa = G.at('@mktB-22', 0), pb = G.at('@tubeB+22', 0);
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, rx = -uz, rz = ux;
    const ctrl = [{ x: pa.x, z: pa.z, y: pa.y, w: 18, bank: 0 }];
    const hw = 7;
    for (let u = 0.1; u < 0.97; u += 0.09) {
      const x = A.x + dx * u, z = A.z + dz * u, y = gy(x, z) + 0.1, hl = gy(x - rx * hw, z - rz * hw), hr = gy(x + rx * hw, z + rz * hw);
      ctrl.push({ x, z, y, w: 14, bank: (Math.atan2(hl - hr, 2 * hw) * 180) / Math.PI });
    }
    ctrl.push({ x: B.x, z: B.z, y: B.y, w: 16, bank: 0 }, { x: pb.x, z: pb.z, y: pb.y, w: 18, bank: 0 });
    const rb = makeRibbon({ pts: ctrl, step: 3 });
    // the tunnel only starts where the hill road has bulged clear of it (the walls are colliders: they must never stand on the hill road)
    const q = {}, sep = (u) => { const p = rb.at(u, {}); tr().query({ x: p.x, y: 1e4, z: p.z }, q); return Math.abs(q.lateral); };
    let uA = null, uB = null; for (let u = 0; u <= rb.total; u += 2) if (sep(u) >= 21) { uA ??= u; uB = u; }
    uA = Math.ceil((uA ?? rb.total * 0.3) / 10) * 10 + 4; uB = Math.floor((uB ?? rb.total * 0.7) / 10) * 10 - 4;
    const trainU = (uA + uB) / 2;
    out.tube = { rb, ctrl, A, B, trainU, gapU: [trainU - 11, trainU + 11], tunnelU: [uA, uB], sepAt: sep };
    ramps.push(PAD('tube-pad1', rb, rb.total * 0.2), PAD('tube-pad2', rb, rb.total * 0.7));
    zones.push({ from: '@mktB-30', to: '@hill1', side: 'left', wall: 'none', kerb: false });
    zones.push({ from: '@tubeB-40', to: '@tubeB+16', side: 'left', wall: 'none', kerb: false });
  }

  // ---------------------------------------------------------------- B2 market cut across the hairpin (deck, grass-slow, van crossing)
  {
    const A = G.at('@hair-80', 13.5), B = G.at('@hair+74', 13.5), W = 11;
    const d = deckBetween(A, B, { width: W, y0: gy(A.x, A.z) + 0.05, y1: gy(B.x, B.z) + 0.05 });
    ramps.push({ id: 'market-cut', kind: 'deck', surface: 'grass', road: false, curve: 1, startBevel: 1.2, endBevel: 2, sideBevel: 1.2, ...d });
    const f = [Math.sin(d.yaw), Math.cos(d.yaw)], u = d.length * 0.5 - 5;
    ramps.push({ id: 'market-boost', kind: 'pad', surface: 'boost', x: d.x + f[0] * u, z: d.z + f[1] * u, yaw: d.yaw, length: 10, width: 6, y0: d.y0, y1: d.y1, curve: 1, ...FLAT });
    zones.push({ from: '@hair-96', to: '@hair-64', side: 'right', wall: 'none', kerb: false });
    zones.push({ from: '@hair+60', to: '@hair+90', side: 'right', wall: 'none', kerb: false });
    shortcuts.push({ from: '@hair-92', to: '@hair+90', id: 'market-cut' });
    out.market = { A, B, deck: d };
  }

  // ---------------------------------------------------------------- B3 canal leap beside the bridge (right = north of the westbound road)
  {
    const LAT = 17.5, lip = '@bridge-18';
    const sl = G.S(lip), land = G.at(sl + 23, LAT);
    const b0 = G.at(sl + 34, LAT), yl = gy(b0.x, b0.z) + 0.25, yEnd = gy(G.at(sl + 72, LAT).x, G.at(sl + 72, LAT).z) + 0.25;
    ramps.push({ id: 'canal-leap', s: sl - 12, lateral: LAT, length: 12, width: 8, rise: 3.4, kind: 'ramp', curve: 1.25 });
    ramps.push({ id: 'canal-land', s: sl + 23, lateral: LAT, length: 49, width: 10, y0: yl, y1: yEnd, kind: 'deck', endBevel: 3, curve: 1 });
    ramps.push({ id: 'canal-land-pad', s: sl + 36, lateral: LAT, length: 10, width: 6, y0: yl + 0.02, y1: yl + 0.05, kind: 'pad', surface: 'boost', ...FLAT, curve: 1 });
    boostPads.push({ s: sl - 50, lateral: LAT - 2, length: 12, width: 7 });
    ramps.push({ id: 'canal-lane', s: sl - 40, lateral: 15.5, length: 24, width: 9, rise0: 0.05, rise1: 0.05, kind: 'deck', endBevel: 1, startBevel: 1 });
    zones.push({ from: sl - 44, to: sl - 2, side: 'right', wall: 'none', kerb: false });
    zones.push({ from: sl + 56, to: sl + 96, side: 'right', wall: 'none', kerb: false });
    shortcuts.push({ from: sl - 16, to: sl + 84, id: 'canal-leap' });
    out.leap = { lat: LAT, lipS: sl, land };
  }

  // ---------------------------------------------------------------- extra pads on the plain road (drift lines)
  boostPads.push({ s: G.S('@rb2') - 20, lateral: 4.5, length: 12, width: 7 }, { s: G.S('@hs1') - 30, lateral: 0, length: 12, width: 8 }, { s: G.S('@es1') - 30, lateral: 0, length: 12, width: 8 });

  // ---------------------------------------------------------------- forks as data
  out.forks = [
    { id: 'park', name: 'Kings Corner or Park Drive', from: '@parkA', to: '@parkB', alt: 'park' },
    { id: 'tube', name: 'Hill road or the Tube', from: '@mktB', to: '@tubeB', alt: 'tube' },
  ];
  return out;
}
