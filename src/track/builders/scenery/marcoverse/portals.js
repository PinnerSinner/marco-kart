// Portal rings that frame the road (a big neon hoop with a slowly turning inner ring) and the glass tube section.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { PALETTE } from './palette.js';
import { hot, frameMatrix, neonAt } from './util.js';
import { mesh } from './start.js';

const _c = new THREE.Color(), _w = new THREE.Color();

/** Portal rings at named positions: [{ s, colour }]. Animated inner rings turn with kit.animate (no per-frame allocation). */
export function buildPortals(kit, M, list) {
  const { track } = kit, statics = kit.batch('portals', { cell: 300, cull: 700, castShadow: false });
  const spin = [];
  const M4 = new THREE.Matrix4();
  const R = 15.6, outer = new THREE.TorusGeometry(R, 0.55, 8, 56), rim = new THREE.TorusGeometry(R + 0.75, 0.16, 5, 56), lamp = new THREE.SphereGeometry(0.42, 6, 5);
  const inner = new THREE.TorusGeometry(R - 1.7, 0.2, 6, 48, Math.PI * 1.55);
  list.forEach(({ s, colour }, idx) => {
    const S = track.S(s), c = new THREE.Color(colour);
    frameMatrix(track, S, 4.6, M4);
    const px = M4.elements[12], pz = M4.elements[14];
    const g = statics.at(M.glow, px, pz), d = statics.at(M.dark, px, pz);
    g.geometry(outer, { matrix: M4, colour: _c.copy(c).multiplyScalar(2.4), ao: 0 });
    d.geometry(rim, { matrix: M4, colour: 0x2a2f7a, ao: 0 });
    for (let k = 0; k < 24; k++) {                                       // lamps around the hoop
      const a = (k / 24) * Math.PI * 2, m2 = new THREE.Matrix4().multiplyMatrices(M4, new THREE.Matrix4().makeTranslation(Math.cos(a) * (R + 0.75), Math.sin(a) * (R + 0.75), 0));
      g.geometry(lamp, { matrix: m2, colour: hot(k % 2 ? 0xffffff : c.getHex(), 3), ao: 0 });
    }
    // spinning inner ring: its own mesh (rotated about the road direction each frame)
    const gi = new Geo(); gi.geometry(inner, { colour: _c.copy(c).lerp(new THREE.Color(PALETTE.magenta), 0.5).multiplyScalar(2.2), ao: 0 });
    const m = mesh(gi, M.glow), holder = new THREE.Group();
    holder.matrixAutoUpdate = false; holder.matrix.copy(M4); holder.matrixWorldNeedsUpdate = true; holder.add(m); kit.add(holder);
    spin.push({ o: m, sp: (idx % 2 ? -1 : 1) * (0.5 + 0.1 * (idx % 3)) });
  });
  kit.animate((dt) => { for (let i = 0; i < spin.length; i++) spin[i].o.rotation.z += spin[i].sp * dt; });
}

/**
 * A glass tube around the road from s0 to s1: a faint cyan shell with neon longitudinal lines and hoops every 7 m.
 */
export function buildTube(kit, M, s0, s1) {
  const { track } = kit, L = track.length, seg = 40, R = 14.2, cy = 1.4;
  const profile = [];
  for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2; profile.push([Math.cos(a) * R, cy + Math.sin(a) * R]); }
  const lines = new Set([Math.round(seg * 0.25), Math.round(seg * 0.125), Math.round(seg * 0.375), Math.round(seg * 0.875), Math.round(seg * 0.625)]);
  kit.sweep({
    from: s0, to: s1, profile, step: 3, uvTile: 8, material: M.add, name: 'mv-tube-shell',
    colour: (k) => _c.set(PALETTE.cyan).multiplyScalar(lines.has(k) ? 0.45 : 0.018),
  });
  kit.sweep({
    from: s0, to: s1, profile: profile.map(([x, y]) => [x * 1.012, cy + (y - cy) * 1.012]), every: 9, length: 0.5, step: 0.5, material: M.glow, name: 'mv-tube-hoops',
    colour: (k, s) => neonAt(s, L, _c, 1.15).lerp(_w.set(PALETTE.cyan), 0.6),
  });
  // entrance / exit collars: thick dark ring with a bright inner lip
  for (const s of [s0, s1]) {
    kit.sweep({ from: s, to: s + 2.4, profile: profile.map(([x, y]) => [x * 1.05, cy + (y - cy) * 1.05]), step: 0.8, material: M.dark, name: 'mv-tube-collar', colour: 0x262b6a });
  }
}
