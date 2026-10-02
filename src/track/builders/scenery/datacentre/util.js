// Helpers for the data-centre dressing: route-relative points, wall lookups, chunked tube / band ribbons and small colour tools.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { wrapS } from '../../../../core/util.js';

export const hdr = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

/** point(s, lat, up, out): world point at arc length s, lateral offset (+ right of travel) and world-up offset; follows banking like the walls do. */
export function makePointer(track) {
  const sm = {};
  const point = (s, lat, up = 0, out = { x: 0, y: 0, z: 0 }) => {
    track.sample(wrapS(s, track.length), sm);
    out.x = sm.pos.x + sm.right.x * lat; out.z = sm.pos.z + sm.right.z * lat; out.y = sm.pos.y - lat * Math.tan(sm.banking) + up;
    return out;
  };
  /** road frame at s: { x, y, z, tx, tz, rx, rz, yaw, width } (fresh object) */
  const frame = (s) => {
    track.sample(wrapS(s, track.length), sm);
    return { x: sm.pos.x, y: sm.pos.y, z: sm.pos.z, tx: sm.tangent.x, tz: sm.tangent.z, rx: sm.right.x, rz: sm.right.z, yaw: Math.atan2(sm.tangent.x, sm.tangent.z), width: sm.width, banking: sm.banking };
  };
  return { point, frame };
}

/**
 * Where a wall of a given style stands. Returns ranges [s0, s1] (metres, s0 < s1, may exceed the lap length only if it wraps) on one side.
 * @param {'rack'|'rail'} name @param {-1|1} side
 */
export function wallRanges(track, name, side) {
  const m = track.model, N = m.cl.N, ds = m.cl.ds, flags = side < 0 ? m.F.wallL : m.F.wallR;
  const idx = m.wallStyles.findIndex((w) => w.name === name) + 1, out = [];
  let start = -1;
  for (let i = 0; i <= N; i++) {
    const on = i < N && flags[i] === idx && !m.F.gap[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) { out.push([start * ds, i * ds]); start = -1; }
  }
  return out.filter(([a, b]) => b - a > 1);
}

/** Height (m above the road) of the wall standing at s on that side, 0 when there is none. */
export function wallHeightAt(track, s, side) {
  const m = track.model, i = Math.round(wrapS(s, track.length) / m.cl.ds) % m.cl.N, k = (side < 0 ? m.F.wallL : m.F.wallR)[i];
  return k > 0 ? m.wallStyles[k - 1].height : 0;
}

/** True when a wall of any style stands at s on that side. */
export function hasWall(track, s, side) {
  const m = track.model, i = Math.round(wrapS(s, track.length) / m.cl.ds) % m.cl.N;
  return (side < 0 ? m.F.wallL : m.F.wallR)[i] > 0;
}

/**
 * Chunked ribbons along the route in ONE material: hex tubes and vertical / horizontal bands, split every `chunk` metres so frustum culling works.
 * uv.y of every vertex is the arc length in metres (pulse shaders use it).
 */
export class Ribbons {
  constructor(kit, material, { chunk = 150, name = 'ribbon' } = {}) {
    this.kit = kit; this.material = material; this.chunk = chunk; this.name = name; this.geos = new Map(); this.p = makePointer(kit.track); this.L = kit.track.length;
  }

  _geo(s) { const k = Math.floor(s / this.chunk); let g = this.geos.get(k); if (!g) this.geos.set(k, g = new Geo()); return g; }

  /**
   * Tube of radius r along [s0, s1]. lat/up are numbers or (s) => number.
   * @param {{lat:number|Function, up:number|Function, r?:number, colour?:THREE.Color|number, seg?:number, step?:number}} o
   */
  tube(s0, s1, { lat, up, r = 0.12, colour = 0xffffff, seg = 5, step = 4 } = {}) {
    const latF = typeof lat === 'function' ? lat : () => lat, upF = typeof up === 'function' ? up : () => up;
    const c = colour.isColor ? colour : new THREE.Color(colour), P = { x: 0, y: 0, z: 0 }, Q = { x: 0, y: 0, z: 0 };
    let prev = null, prevKey = -1, gS = null;
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n, key = Math.floor(s / this.chunk);
      const fr = this.p.frame(s), ring = [];
      const cx = this.p.point(s, latF(s), upF(s), P);
      const g = this._geo(s);
      const rebuild = (gg, cxp) => {
        const ids = [];
        for (let k = 0; k < seg; k++) {
          const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          const nx = fr.rx * ca, nz = fr.rz * ca, ny = sa;
          ids.push(gg.vert(cxp.x + nx * r, cxp.y + ny * r, cxp.z + nz * r, nx, ny, nz, k / seg, s, c.r, c.g, c.b));
        }
        return ids;
      };
      ring.push(...rebuild(g, cx));
      if (prev && prevKey !== key) {                               // chunk boundary: start a fresh ring in the new chunk from the previous point
        const sp = s0 + ((s1 - s0) * (i - 1)) / n, cxp = this.p.point(sp, latF(sp), upF(sp), Q), frp = this.p.frame(sp), ids = [];
        for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); ids.push(g.vert(cxp.x + frp.rx * ca * r, cxp.y + sa * r, cxp.z + frp.rz * ca * r, frp.rx * ca, sa, frp.rz * ca, k / seg, sp, c.r, c.g, c.b)); }
        prev = ids;
      }
      if (prev) for (let k = 0; k < seg; k++) { const k2 = (k + 1) % seg; g.quad(prev[k], ring[k], ring[k2], prev[k2]); }
      prev = ring; prevKey = key; gS = g;
    }
    void gS;
    return this;
  }

  /**
   * Band (a strip between two heights on a vertical plane at lateral `lat`, facing `face` = +1 toward +lateral, -1 toward -lateral)
   * along [s0, s1]. up0 < up1 (world up above the road surface at that lateral). Double sided in the material.
   */
  band(s0, s1, { lat, up0, up1, colour = 0xffffff, colour1 = null, step = 4 } = {}) {
    const latF = typeof lat === 'function' ? lat : () => lat;
    const c0 = colour.isColor ? colour : new THREE.Color(colour), c1 = colour1 ? (colour1.isColor ? colour1 : new THREE.Color(colour1)) : c0;
    const P = { x: 0, y: 0, z: 0 };
    let prev = null, prevKey = -1;
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    const mk = (g, s) => {
      const fr = this.p.frame(s), l = latF(s);
      const a = this.p.point(s, l, up0, P), va = g.vert(a.x, a.y, a.z, fr.rx, 0, fr.rz, 0, s, c0.r, c0.g, c0.b);
      const b = this.p.point(s, l, up1, P), vb = g.vert(b.x, b.y, b.z, fr.rx, 0, fr.rz, 1, s, c1.r, c1.g, c1.b);
      return [va, vb];
    };
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n, key = Math.floor(s / this.chunk), g = this._geo(s);
      const cur = mk(g, s);
      if (prev && prevKey !== key) prev = mk(g, s0 + ((s1 - s0) * (i - 1)) / n);
      if (prev) g.quad(prev[0], cur[0], cur[1], prev[1]);
      prev = cur; prevKey = key;
    }
    return this;
  }

  /** Create the meshes in the track group. Call once when everything is added. */
  build() {
    const out = [];
    for (const [k, g] of this.geos) {
      if (!g.vertexCount) continue;
      const mesh = new THREE.Mesh(g.build(), this.material);
      mesh.name = `${this.name}:${k}`; mesh.frustumCulled = true; mesh.castShadow = false; mesh.receiveShadow = false;
      this.kit.add(mesh); out.push(mesh);
    }
    this.geos.clear();
    return out;
  }
}

/** Convenience: dot-product-free yaw for facing a point. */
export const yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

/** Hex tube through world points [[x,y,z], ...] into Geo `g` (uv.y = distance along, for the pulse shaders). */
export function lineTube(g, pts, { r = 0.1, colour = 0xffffff, seg = 5 } = {}) {
  const c = colour.isColor ? colour : new THREE.Color(colour), rings = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    if (i) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
    // side = up x t (fallback x axis), then n = t x side
    let sx = ty * 0 - tz * 1 * 0, sy = 0, sz = 0;
    sx = tz; sy = 0; sz = -tx;                                   // (0,1,0) x t = (tz*1 - 0, 0, -tx)  -> (tz, 0, -tx)
    let sl = Math.hypot(sx, sy, sz); if (sl < 1e-4) { sx = 1; sy = 0; sz = 0; sl = 1; }
    sx /= sl; sy /= sl; sz /= sl;
    const nx = ty * sz - tz * sy, ny = tz * sx - tx * sz, nz = tx * sy - ty * sx;
    const ring = [];
    for (let k = 0; k < seg; k++) {
      const an = (k / seg) * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
      const ox = sx * ca + nx * sa, oy = sy * ca + ny * sa, oz = sz * ca + nz * sa;
      ring.push(g.vert(p[0] + ox * r, p[1] + oy * r, p[2] + oz * r, ox, oy, oz, k / seg, dist, c.r, c.g, c.b));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < seg; k++) { const k2 = (k + 1) % seg; g.quad(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]); }
}

/** Soft rectangular glow lying flat at height y (additive material): vertex colours fade to black at the edges. yaw turns the +z axis. */
export function glowPad(g, cx, y, cz, yaw, len, wid, colour, k = 1, n = 5) {
  const c = colour.isColor ? colour : new THREE.Color(colour), sn = Math.sin(yaw), cs = Math.cos(yaw), ids = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const u = (i / n) * 2 - 1, v = (j / n) * 2 - 1, f = Math.pow(1 - u * u, 1.5) * Math.pow(1 - v * v, 1.5) * k;
    const lx = u * wid / 2, lz = v * len / 2;
    ids.push(g.vert(cx + lx * cs + lz * sn, y, cz - lx * sn + lz * cs, 0, 1, 0, 0, 0, c.r * f, c.g * f, c.b * f));
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.quadN(ids[j * (n + 1) + i], ids[j * (n + 1) + i + 1], ids[(j + 1) * (n + 1) + i + 1], ids[(j + 1) * (n + 1) + i]);
}

/**
 * Plan-view nearest-road field (all road layers, elevation ignored). `at(x, z)` returns { d, s, lat, edge, y } where d is the distance to the
 * nearest centreline point and edge = d - half width. Cheap uniform grid over the centreline stations.
 */
export function makeRoadField(track, cellSize = 24) {
  const cl = track.model.cl, N = cl.N, ds = cl.ds, cells = new Map(), step = Math.max(1, Math.round(6 / ds));
  const key = (i, j) => i * 100003 + j;
  for (let k = 0; k < N; k += step) {
    const i = Math.floor(cl.x[k] / cellSize), j = Math.floor(cl.z[k] / cellSize), kk = key(i, j);
    let c = cells.get(kk); if (!c) cells.set(kk, c = []); c.push(k);
  }
  const out = { d: 0, s: 0, lat: 0, edge: 0, y: 0 };
  return {
    at(x, z, reach = 3) {
      const ci = Math.floor(x / cellSize), cj = Math.floor(z / cellSize);
      let best = 1e18, bk = -1;
      for (let r = 0; r <= reach; r++) {
        for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          const c = cells.get(key(i, j)); if (!c) continue;
          for (const k of c) { const dx = x - cl.x[k], dz = z - cl.z[k], d = dx * dx + dz * dz; if (d < best) { best = d; bk = k; } }
        }
        if (bk >= 0 && Math.sqrt(best) < r * cellSize) break;
      }
      if (bk < 0) { out.d = 1e9; out.s = 0; out.lat = 0; out.edge = 1e9; out.y = 0; return out; }
      out.d = Math.sqrt(best); out.s = bk * ds; out.lat = -(x - cl.x[bk]) * cl.tz[bk] + (z - cl.z[bk]) * cl.tx[bk]; out.edge = out.d - cl.width[bk] / 2; out.y = cl.y[bk];
      return out;
    },
  };
}
