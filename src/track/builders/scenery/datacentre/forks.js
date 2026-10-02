// Data Centre forks: two places where the road splits into two full-width routes that rejoin, on the ribbon road of builders/branch.js.
//
//   FORK 1  COLD AISLE or HOT AISLE (north aisle, ~225 m): the spline sweeps south round the cold-aisle bulge (wide, banked, long and fast, two
//           boost pads); the hot-aisle service lane is a tight chicane straight across it (shorter, slower through the bends, one pad).
//   FORK 2  PATCH BAY (return straight, 150 m): the straight is the short way (a laser gate across it); the patch-bay side road swings north
//           (a little longer) with two boost pads and a kicker over a fibre run.
//
// Pure numbers first (forkSpecs: works before a Track exists, so the def can put pads and kickers on the second road), then the
// dressing (rack rows along both edges, glow strips, gates). The AI keeps to the spline; ProgressTracker credits either route.
import * as THREE from 'three';
import { chordRibbon, mouthZones, edgeRacks } from '../forkRoute.js';
import { addRibbon } from '../../branch.js';
import { hdr } from './util.js';
import { LED } from './textures.js';

const FLAT = { lip: false, startBevel: 0.25, endBevel: 0.25, sideBevel: 0.15, curve: 1 };

/** Profile of each second road: [fraction along the chord, lateral metres (+ right of travel)]. */
const PROF = {
  hot: [[0, 0], [0.1, 0], [0.25, 5], [0.42, -5], [0.58, 5], [0.74, -4.5], [0.88, 0], [1, 0]],
  bay: [[0, 0], [0.14, 0], [0.32, -24], [0.5, -27], [0.68, -24], [0.86, 0], [1, 0]],
};

/** @param {ReturnType<import('./route.js').routeInfo>} R @param {object} M the DC materials (for pad / kicker platforms) */
export function forkSpecs(R, M) {
  const S = R.S, ramps = [], q = {};
  const pad = (id, F, f, { w = 6, len = 12, lat = 0 } = {}) => {
    const p = F.rb.at(F.rb.total * f, q), x = p.x + p.rx * lat, z = p.z + p.rz * lat;
    ramps.push({ id, kind: 'pad', surface: 'boost', road: true, x, z, yaw: p.yaw, length: len, width: w, y0: p.y + 0.04, y1: p.y + 0.04, material: M.boostMat(w), ...FLAT });
  };

  // ------------------------------------------------------------- fork 1: the hot-aisle service lane (chord across the bulge)
  const hot = chordRibbon(R, { s0: S('fk1a'), s1: S('fk1b'), prof: PROF.hot, w: 17 });
  pad('hot-boost0', hot, 0.16, { w: 6 });
  pad('hot-boost', hot, 0.84, { w: 6 });
  // ------------------------------------------------------------- fork 2: the patch-bay side road (north of the return straight)
  const bay = chordRibbon(R, { s0: S('fk2a'), s1: S('fk2b'), prof: PROF.bay, w: 17 });
  pad('bay-boost0', bay, 0.3, { w: 6, lat: 0 });
  pad('bay-boost1', bay, 0.78, { w: 6 });
  {
    const p = bay.rb.at(bay.rb.total * 0.43, q);
    ramps.push({ id: 'bay-kick', kind: 'ramp', x: p.x, z: p.z, yaw: p.yaw, length: 10, width: 9, y0: p.y, y1: p.y + 1.7, material: M.hazard(9) });
    const pd = bay.rb.at(bay.rb.total * 0.43 + 24, {});
    ramps.push({ id: 'bay-land', kind: 'pad', surface: 'boost', road: true, x: pd.x, z: pd.z, yaw: pd.yaw, length: 10, width: 6, y0: pd.y + 0.04, y1: pd.y + 0.04, material: M.boostMat(6), ...FLAT });
  }

  const forks = [
    { id: 'hot-aisle', name: 'Cold aisle or hot aisle', from: '@fk1a', to: '@fk1b', alt: 'hot-aisle', F: hot, hue: 'hot' },
    { id: 'patch-bay', name: 'Straight or patch bay', from: '@fk2a', to: '@fk2b', alt: 'patch-bay', F: bay, hue: 'bay' },
  ];
  const zones = [], capsules = [];
  for (const f of forks) {
    zones.push(...mouthZones(R, f.F));
    f.capsules = edgeRacks(R, f.F);
    capsules.push(...f.capsules);
  }
  return { forks, zones, capsules, ramps, hot, bay };
}

/** Register the second roads (physics, headless-safe) and their rack rows. */
export function installForks(kit, { R, M, FK }) {
  const m = kit.track.model;
  for (const f of FK.forks) {
    addRibbon(kit, { id: f.alt, rb: f.F.rb, material: kit.headless ? null : M.road, tile: 18, hideInsideSpline: true });
    f.F.rb.def.name = f.name;
  }
  for (const c of FK.capsules) m.addCapsule(c[0], c[1], c[2], c[3], c[4], -1e9, 1e9);
}

/** Visual dressing of the second roads: rack rows, neon edges, gate frames. Colours follow the aisle (hot = amber, patch bay = magenta / green). */
export function dressForks(kit, { R, M, FK }) {
  const st = kit.statics, H = 7.35, Y0 = R.Y0;
  for (const f of FK.forks) {
    const hot = f.hue === 'hot', c1 = hot ? LED.amber : LED.magenta, c2 = hot ? 0xff4a1a : LED.green;
    f.capsules.forEach(([ax, az, bx, bz, r], k) => {
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), cx = (ax + bx) / 2, cz = (az + bz) / 2;
      st.at(M.rack, cx, cz).box(2 * r, H, len + 2 * r, { x: cx, y: 0, z: cz, ry: yaw, colour: 0xffffff, top: 0x0a1030, ao: 0.1, facade: [4.8, H] });
      const nc = hdr(k % 2 ? c1 : c2, 1.15);
      for (const sg of [-1, 1]) {
        const ox = Math.cos(yaw) * sg * (r + 0.03), oz = -Math.sin(yaw) * sg * (r + 0.03);
        st.at(M.neon, cx, cz).box(0.16, 0.2, len + 2 * r, { x: cx + ox, y: H - 0.5, z: cz + oz, ry: yaw, colour: nc, ao: 0 });
        st.at(M.neon, cx, cz).box(0.14, 0.16, len + 2 * r, { x: cx + ox, y: 0.3, z: cz + oz, ry: yaw, colour: hdr(c1, 0.9), ao: 0 });
      }
    });
    // glowing edge studs along both edges of the road itself, and gate frames every 40 m
    const rb = f.F.rb, q = {}, gn = st.at(M.neon, rb.X[0], rb.Z[0]), gs = st.at(M.steel, rb.X[0], rb.Z[0]);
    for (let u = 3; u < rb.total - 3; u += 5) {
      const p = rb.at(u, q);
      for (const sg of [-1, 1]) gn.box(0.28, 0.1, 3.2, { x: p.x + p.rx * sg * (p.w / 2 - 0.45), y: p.y + 0.05, z: p.z + p.rz * sg * (p.w / 2 - 0.45), ry: p.yaw, colour: hdr(sg > 0 ? c1 : c2, 2.2), ao: 0 });
    }
    for (let u = 30; u < rb.total - 24; u += 44) {
      const p = rb.at(u, q), span = p.w + 3.2;
      gs.box(span, 0.6, 0.7, { x: p.x, y: H + 0.8, z: p.z, ry: p.yaw, colour: 0x18224e, ao: 0.1 });
      for (const sg of [-1, 1]) gs.box(0.5, 0.9, 0.5, { x: p.x + p.rx * sg * (span / 2 - 0.4), y: H - 0.05, z: p.z + p.rz * sg * (span / 2 - 0.4), ry: p.yaw, colour: 0x2a3670, ao: 0 });
      gn.box(span - 1.2, 0.14, 0.14, { x: p.x, y: H + 0.68, z: p.z, ry: p.yaw, colour: hdr(c1, 1.4), ao: 0 });
    }
  }
  void Y0; void THREE;
}
