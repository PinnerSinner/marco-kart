// Flora geometry factories (Geo based, vertex coloured): palms, round trees, bushes, grass tufts.
// Each returns a Geo with its origin at the base centre. Colours carry baked variation; instances can tint further.
import * as THREE from 'three';
import { Geo } from '../Geo.js';

const c1 = new THREE.Color(), c2 = new THREE.Color();

/** One curved palm frond: local +X = outward, arcs up then droops. width tapers to a point. Double sided via two windings. */
function addFrond(g, { len = 4, width = 0.9, rise = 0.9, droop = 2.2, segs = 5, yaw = 0, x = 0, y = 0, z = 0, base, tip, twist = 0 }) {
  const rows = [];
  const cb = c1.set(base), ct = c2.set(tip);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, px = len * t, py = rise * Math.sin(t * Math.PI * 0.55) * 1.0 - droop * t * t;
    const w = width * Math.sin(Math.PI * Math.pow(t, 0.72)) * (1 - 0.3 * t) + (i === 0 ? 0.08 : 0);
    pts.push([px, py, w, t]);
  }
  for (let i = 0; i <= segs; i++) {
    const [px, py, w, t] = pts[i];
    const nxt = pts[Math.min(segs, i + 1)], prv = pts[Math.max(0, i - 1)];
    const tx = nxt[0] - prv[0], ty = nxt[1] - prv[1], tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl, ny = tx / tl;                       // normal in the XY plane (up-ish)
    const col = new THREE.Color().copy(cb).lerp(ct, t);
    const tw = twist * t;
    const zs = [-w, w];
    const ids = zs.map((zz) => {
      const lz = zz * Math.cos(tw), ly = py + zz * Math.sin(tw);
      const wx = x + px * cs - lz * sn, wz = z + px * sn + lz * cs;
      const nX = nx * cs, nZ = nx * sn;
      return g.vert(wx, y + ly, wz, nX, ny, nZ, t, zz > 0 ? 1 : 0, col.r, col.g, col.b);
    });
    rows.push(ids);
  }
  for (let i = 0; i < segs; i++) g.quadN(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
}

/**
 * Coconut palm. Origin at the trunk base.
 * @param {{ height?:number, bend?:number, fronds?:number, seed?:number, trunk?:number, leaf?:[number,number], frondLen?:number }} [o]
 */
export function palmGeo({ height = 9, bend = 1.2, fronds = 10, seed = 1, trunk = 0x8b6a45, leaf = [0x2f8f3a, 0x8fd14f], frondLen = 4.2 } = {}) {
  const g = new Geo();
  const segs = 5, r0 = 0.38;
  let x = 0, z = 0;
  const bendYaw = seed * 2.4, bx = Math.cos(bendYaw), bz = Math.sin(bendYaw);
  const trunkPts = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs, off = bend * t * t; trunkPts.push([bx * off, height * t, bz * off, r0 * (1 - 0.42 * t)]); }
  const tcol = new THREE.Color(trunk);
  for (let i = 0; i < segs; i++) {
    const a = trunkPts[i], b = trunkPts[i + 1], side = 7;
    const ring = (p, k, shade) => Array.from({ length: side + 1 }, (_, j) => {
      const th = (j / side) * Math.PI * 2, cx = Math.cos(th), sz = Math.sin(th);
      const sh = shade * (0.85 + 0.15 * cx);
      return g.vert(p[0] + cx * p[3], p[1], p[2] + sz * p[3], cx, 0.15, sz, j / side, p[1] * 0.4, tcol.r * sh, tcol.g * sh, tcol.b * sh);
    });
    const ra = ring(a, i, i % 2 ? 0.86 : 1.0), rb = ring(b, i + 1, (i + 1) % 2 ? 0.86 : 1.0);
    for (let j = 0; j < side; j++) g.quadN(ra[j], ra[j + 1], rb[j + 1], rb[j]);
  }
  const top = trunkPts[segs];
  for (let k = 0; k < fronds; k++) {
    const yaw = (k / fronds) * Math.PI * 2 + (seed % 3) * 0.37, lift = k % 2 ? 0.6 : 1.1;
    addFrond(g, { len: frondLen * (0.85 + 0.3 * ((k * 37) % 7) / 7), width: 0.95, rise: lift, droop: 1.5 + (k % 3) * 0.7, yaw, x: top[0], y: top[1] - 0.15, z: top[2], base: leaf[0], tip: leaf[1], twist: 0.25 });
  }
  addFrond(g, { len: frondLen * 0.5, width: 0.6, rise: 1.8, droop: -0.4, yaw: 0.3, x: top[0], y: top[1], z: top[2], base: leaf[0], tip: leaf[1] });   // spear
  for (let k = 0; k < 4; k++) g.sphere(0.24, { x: top[0] + Math.cos(k * 1.6) * 0.32, y: top[1] - 0.5, z: top[2] + Math.sin(k * 1.6) * 0.32, colour: 0x6b4a1a, ao: 0 }, 5, 4);
  return g;
}

/** Stylised broadleaf tree: trunk + 3-5 overlapping blobs. */
export function roundTreeGeo({ height = 7, crown = 3.2, trunk = 0x6b4a2b, leaf = [0x3c9a3c, 0x86cf4a], seed = 1 } = {}) {
  const g = new Geo();
  g.cyl(0.22 * (crown / 3), 0.38 * (crown / 3), height * 0.62, 7, { colour: trunk, ao: 0.4 });
  const cnt = 4 + (seed % 2);
  for (let k = 0; k < cnt; k++) {
    const a = k * 2.4 + seed, r = k === 0 ? 0 : crown * 0.42, y = height * 0.62 + (k === 0 ? crown * 0.5 : crown * (0.15 + 0.22 * (k % 3)));
    c1.set(leaf[0]).lerp(c2.set(leaf[1]), (k / cnt) * 0.8 + 0.1);
    g.sphere(crown * (k === 0 ? 0.9 : 0.68), { x: Math.cos(a) * r, y, z: Math.sin(a) * r, colour: c1.clone(), top: c1.clone().offsetHSL(0, 0, 0.09), ao: 0.5, sy: 0.85 }, 7, 5);
  }
  return g;
}

/** Cone pine / cypress. */
export function coneTreeGeo({ height = 8, radius = 2, trunk = 0x5b3f26, leaf = [0x1f6f3a, 0x3f9f4a], tiers = 3 } = {}) {
  const g = new Geo();
  g.cyl(0.18, 0.3, height * 0.3, 6, { colour: trunk, ao: 0.4 });
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers, r = radius * (1 - t * 0.55), h = height * 0.5;
    c1.set(leaf[0]).lerp(c2.set(leaf[1]), t);
    g.cone(r, h, 8, { y: height * 0.22 + t * height * 0.5, colour: c1.clone(), top: c1.clone().offsetHSL(0, 0, 0.06), ao: 0.5 });
  }
  return g;
}

/** Low bush / hedge blob cluster. */
export function bushGeo({ size = 1.4, leaf = [0x2f8f3a, 0x77c24a], flowers = null, seed = 1 } = {}) {
  const g = new Geo();
  for (let k = 0; k < 4; k++) {
    const a = k * 1.9 + seed, r = k === 0 ? 0 : size * 0.5;
    c1.set(leaf[0]).lerp(c2.set(leaf[1]), k / 4);
    g.sphere(size * (k === 0 ? 0.75 : 0.55), { x: Math.cos(a) * r, y: size * 0.1 * k, z: Math.sin(a) * r, colour: c1.clone(), top: c1.clone().offsetHSL(0, 0, 0.08), ao: 0.5, sy: 0.8 }, 6, 4);
  }
  if (flowers) for (let k = 0; k < 5; k++) g.sphere(0.13 * size, { x: Math.cos(k * 1.3 + seed) * size * 0.55, y: size * (0.7 + 0.05 * (k % 3)), z: Math.sin(k * 1.3 + seed) * size * 0.55, colour: flowers[k % flowers.length], ao: 0 }, 4, 3);
  return g;
}
