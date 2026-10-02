// The edge of the Marcoverse ribbon: there are no walls, so the road edge is drawn in light. Raised neon lip, additive light spill over
// the void, a curtain of glow hanging under the edge, guide pylons, chevron boards on tight bends, structural hoops under the deck.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { chevronSignGeo } from '../../props.js';
import { PALETTE } from './palette.js';
import { neonAt, roadPieces, isGap, frameMatrix, hot } from './util.js';

const _c = new THREE.Color(), _sm = {}, _v = new THREE.Vector3();

/**
 * Extrude an edge profile along [a, b] on one side of the road. Profile points are [outward metres from the road edge, up metres, brightness].
 * Colour = neon cycle at s times brightness. `chunk` splits the output into several Geos (for frustum culling).
 * Geometry lands in `out` (Map of `${key}|${chunk}` -> Geo).
 */
function edgeRibbon(track, out, key, a, b, side, prof, { step = 2, chunk = 260 } = {}) {
  const L = track.length, n = Math.max(1, Math.ceil((b - a) / step));
  const rowsAt = (g, s) => {
    const sm = track.sample(s, _sm), hw = sm.width / 2, tb = Math.tan(sm.banking), rows = [];
    for (let k = 0; k < prof.length - 1; k++) {
      const pair = [], [o0, u0] = prof[k], [o1, u1] = prof[k + 1], nOut = -(u1 - u0), nUp = o1 - o0, nl = Math.hypot(nOut, nUp) || 1;
      const nx = (sm.right.x * side * nOut + sm.up.x * nUp) / nl, ny = (sm.right.y * side * nOut + sm.up.y * nUp) / nl, nz = (sm.right.z * side * nOut + sm.up.z * nUp) / nl;
      for (const j of [k, k + 1]) {
        const [o, u, br] = prof[j], lat = side * (hw + o);
        neonAt(s, L, _c, br);
        pair.push(g.vert(sm.pos.x + sm.right.x * lat + sm.up.x * u, sm.pos.y - lat * tb + sm.up.y * u, sm.pos.z + sm.right.z * lat + sm.up.z * u, nx, ny, nz, 0, 0, _c.r, _c.g, _c.b));
      }
      rows.push(pair);
    }
    return rows;
  };
  const geoOf = (ci) => { const gk = `${key}|${ci}`; let g = out.get(gk); if (!g) out.set(gk, g = new Geo()); return g; };
  let prevS = null, prevCi = -1, prevRows = null;
  for (let i = 0; i <= n; i++) {
    const s = a + ((b - a) * i) / n, ci = Math.floor((s - a) / chunk), g = geoOf(ci);
    if (prevS !== null && ci !== prevCi) prevRows = rowsAt(g, prevS);          // repeat the last station in the new chunk so the seam closes
    const rows = rowsAt(g, s);
    if (prevRows) for (let k = 0; k < rows.length; k++) g.quadN(prevRows[k][0], prevRows[k][1], rows[k][1], rows[k][0]);
    prevS = s; prevCi = ci; prevRows = rows;
  }
}

/** @param {object} kit @param {object} M materials from index.js: { glow, add, dark, lit } */
export function buildRails(kit, M) {
  const { track } = kit, L = track.length, pieces = roadPieces(track);
  // ---- 1. lip + light spill + curtain, both sides, per road piece
  const LIP = [[-0.95, 0.0, 0.6], [-0.95, 0.2, 1.6], [-0.15, 0.24, 3.4], [0.14, 0.06, 2.4], [0.14, -0.4, 1.0]];
  const SPILL = [[0.15, 0.02, 0.8], [1.1, -0.05, 0.42], [3.2, -0.35, 0.12], [5.6, -0.7, 0]];
  const CURT = [[0.18, -0.3, 0.75], [0.5, -2.6, 0.3], [1.5, -7.5, 0]];
  const lip = new Map(), halo = new Map();
  pieces.forEach(([a, b], p) => {
    for (const side of [-1, 1]) {
      edgeRibbon(track, lip, `${p}${side}`, a, b, side, LIP);
      edgeRibbon(track, halo, `${p}${side}s`, a, b, side, SPILL); edgeRibbon(track, halo, `${p}${side}c`, a, b, side, CURT);
    }
  });
  const emit = (map, mat, name) => {
    for (const [k, g] of map) {
      if (!g.vertexCount) continue;
      const m = new THREE.Mesh(g.build(), mat); m.name = `${name}`; m.frustumCulled = true; m.renderOrder = mat === M.add ? 2 : 0;
      kit.add(m);
    }
  };
  emit(lip, M.glow, 'mv-lip'); emit(halo, M.add, 'mv-halo');

  // ---- 2. thin inner guide line (paint) - dashed violet on the deck a metre inside the lip
  const line = kit.paint({ material: M.glow, lift: 0.045 });
  for (const [a, b] of pieces) {
    for (const side of [-1, 1]) {
      line.strip(a, b, (s) => side * (track.widthAt(s) / 2 - 1.55), 0.16, _c.set(PALETTE.violet).multiplyScalar(1.6).clone(), 3);
    }
  }

  // ---- 3. guide pylons: small lit beacons on the edge every ~30 m, alternating sides
  const beacon = new Geo();
  beacon.cyl(0.13, 0.22, 1.5, 7, { colour: 0x1a1d52, ao: 0.1 });
  beacon.cyl(0.2, 0.2, 0.16, 7, { y: 1.5, colour: hot(0xffffff, 0.35), ao: 0 });
  beacon.sphere(0.3, { y: 1.85, colour: hot(0xffffff, 3.2), ao: 0 }, 8, 6);
  const pyl = kit.instances(beacon, M.glow, { cell: 260, castShadow: false, receiveShadow: false, name: 'mv-beacon', cull: 380 });
  let n = 0;
  for (const [a, b] of pieces) {
    for (let s = a + 6; s < b - 6; s += 30) {
      const side = (n++ & 1) ? 1 : -1;
      if (isGap(track, s) || isGap(track, s + 5) || isGap(track, s - 5)) continue;
      const sm = track.sample(s, _sm), lat = side * (sm.width / 2 + 0.55);
      track.surfacePoint(s, lat, _v);
      neonAt(s, L, _c, 1);
      pyl.add(_v.x, _v.y - 0.5, _v.z, { colour: _c });
    }
  }

  // ---- 4. chevron boards on the OUTSIDE of tight bends, facing the approaching kart
  const boards = { left: chevronSignGeo('left', { board: 0x090a2a, chev: hot(PALETTE.yellow, 2.6), post: 0x30357a }), right: chevronSignGeo('right', { board: 0x090a2a, chev: hot(PALETTE.yellow, 2.6), post: 0x30357a }) };
  const sg = kit.batch('chevrons', { cell: 260, cull: 360, castShadow: false });
  const sw = 0.0085;                                                                      // curvature (1/m) that counts as a tight bend
  let run = false, runStart = 0, last = -1e9;
  for (let s = 0; s < L; s += 6) {
    const k = track.curvatureAt(s), tight = Math.abs(k) > sw;
    if (tight && !run) { run = true; runStart = s; }
    if (!tight) run = false;
    if (!tight || s - last < 15 || isGap(track, s)) continue;
    last = s;
    const dir = k > 0 ? 'right' : 'left', outer = k > 0 ? -1 : 1;
    const sm = track.sample(s, _sm), lat = outer * (sm.width / 2 + 2.4);
    track.surfacePoint(s, lat, _v);
    const yaw = Math.atan2(sm.tangent.x, sm.tangent.z) + Math.PI;
    sg.addGeo(M.glow, boards[dir], { x: _v.x, y: _v.y - 0.8, z: _v.z, ry: yaw, s: 1.45 });
  }

  // ---- 5. structural hoops under the deck (shallow ellipses) so the ribbon reads as a built thing from below
  const ribs = kit.batch('ribs', { cell: 280, cull: 460, castShadow: false });
  const M4 = new THREE.Matrix4(), S4 = new THREE.Matrix4(), R4 = new THREE.Matrix4().makeRotationZ(Math.PI);
  const torDark = new THREE.TorusGeometry(1, 0.055, 6, 22, Math.PI), torGlow = new THREE.TorusGeometry(1, 0.018, 4, 22, Math.PI);
  for (let s = 20, i = 0; s < L; s += 44, i++) {
    if (isGap(track, s) || isGap(track, s - 8) || isGap(track, s + 8) || (s > track.S('@spin') - 20 && s < track.S('@spiral') + 20)) continue;
    const hw = track.widthAt(s) / 2 + 0.2;
    frameMatrix(track, s, -0.6, M4);
    M4.multiply(R4).multiply(S4.makeScale(hw, hw * 0.34, 1));
    neonAt(s, L, _c, 2.2);
    const dark = ribs.at(M.dark, _v.setFromMatrixPosition(M4).x, _v.z), glow = ribs.at(M.glow, _v.x, _v.z);
    dark.geometry(torDark, { matrix: M4, colour: 0x2a2f6e, ao: 0 });
    glow.geometry(torGlow, { matrix: M4, colour: _c, ao: 0 });
  }
}
