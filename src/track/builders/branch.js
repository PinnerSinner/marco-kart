// branch.js: a full-width road that leaves the main centreline and rejoins it later (a FORK), without a second Track.
//
// The engine has one closed centreline; everything the kart drives on is either that ribbon or a Platform. A RibbonRoad is a Platform
// whose footprint follows a polyline with its own width / height / bank, so a def can open a second route beside the spline:
//
//   const rb = addRibbon(kit, { id: 'beach', pts: [{ x, z, y, w }, ...], material, edge: { colours: [0xffd166, 0x1f9d4c] } });
//
//  * The spline stays the AI's line and the lap-credit line: a kart on the ribbon projects onto the nearest spline station, `s` keeps
//    rising, gates are crossed in order, so the progress tracker needs no special case.
//  * Keep the ribbon close enough to "its" stretch of spline (well under half the distance to any other stretch) that the projection
//    is unambiguous, and keep it on flat ground: the terrain under it is not carved, the ribbon simply overrides it.
//  * Where the ribbon lies inside the spline's own road surface it is drawn a few centimetres low (hidden), so the two never z-fight.
import * as THREE from 'three';
import { Platform } from './Platform.js';
import { Geo } from './Geo.js';

const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a || 1e-9))); return t * t * (3 - 2 * t); };

/**
 * Smooth resample of control points (x, z, y, w, bank) into a dense polyline.
 * x / z follow a centripetal Catmull-Rom curve; y / w / bank are eased (smoothstep) between the control values by distance along it.
 * @param {Array<{x:number,z:number,y?:number,w?:number,bank?:number}>} ctrl
 * @param {number} [step=3] metres between samples
 */
export function resampleRibbon(ctrl, step = 3) {
  if (ctrl.length < 2) throw new Error('ribbon needs at least 2 points');
  const V = ctrl.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const curve = ctrl.length === 2 ? new THREE.LineCurve3(V[0], V[1]) : new THREE.CatmullRomCurve3(V, false, 'centripetal');
  const L = curve.getLength(), n = Math.max(2, Math.ceil(L / step));
  // arc position of every control point (nearest sample)
  const fine = curve.getSpacedPoints(Math.max(200, n * 4)), cum = [0];
  for (let i = 1; i < fine.length; i++) cum.push(cum[i - 1] + Math.hypot(fine[i].x - fine[i - 1].x, fine[i].z - fine[i - 1].z));
  const ctrlS = V.map((v) => { let b = 0, bd = Infinity; for (let i = 0; i < fine.length; i++) { const d = (fine[i].x - v.x) ** 2 + (fine[i].z - v.z) ** 2; if (d < bd) { bd = d; b = cum[i]; } } return b; });
  ctrlS[0] = 0; ctrlS[ctrlS.length - 1] = cum[cum.length - 1];
  const tot = cum[cum.length - 1];
  const val = (key, dflt, s) => {
    let k = 0; while (k < ctrlS.length - 2 && s > ctrlS[k + 1]) k++;
    const a = ctrl[k][key] ?? dflt, b = ctrl[k + 1][key] ?? dflt, t = smooth(ctrlS[k], ctrlS[k + 1], s);
    return a + (b - a) * t;
  };
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPointAt(u), s = u * tot;
    out.push({ x: p.x, z: p.z, y: val('y', 0, s), w: val('w', 18, s), bank: val('bank', 0, s) });
  }
  return out;
}

/** Control points that follow the spline: lateral offset `lat(u)` (u 0..1 over s0..s1, + = right) with y / w profiles. */
export function ribbonAlong(track, { s0, s1, lat = () => 0, w = 18, y = null, bank = 0, every = 12 }) {
  const a = track.S(s0); let b = track.S(s1); if (b < a) b += track.length;
  const n = Math.max(2, Math.ceil((b - a) / every)), pts = [], q = {};
  for (let i = 0; i <= n; i++) {
    const u = i / n, sp = track.sample(((a + (b - a) * u) % track.length + track.length) % track.length, q), l = lat(u);
    const ww = typeof w === 'function' ? w(u) : w, bk = typeof bank === 'function' ? bank(u) : bank;
    pts.push({ x: sp.pos.x + sp.right.x * l, z: sp.pos.z + sp.right.z * l, y: (y ? y(u, sp.pos.y) : sp.pos.y) - l * Math.tan(sp.banking), w: ww, bank: bk });
  }
  return pts;
}

export class RibbonRoad extends Platform {
  /**
   * @param {object} spec
   * @param {Array<{x:number,z:number,y:number,w:number,bank?:number}>} spec.pts dense centre polyline (use resampleRibbon)
   * @param {number} [spec.sideBevel=1.6] metres of soft edge
   * @param {string} [spec.surface='road'] @param {boolean} [spec.road=true]
   */
  constructor(spec) {
    const pts = spec.pts, a = pts[0], b = pts[1];
    super({ x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z), length: 1, width: a.w, y0: pts.reduce((s, p) => s + p.y, 0) / pts.length, y1: pts.reduce((s, p) => s + p.y, 0) / pts.length, lip: false, kind: 'branch', sideBevel: spec.sideBevel ?? 1.6, surface: spec.surface ?? 'road', road: spec.road ?? true });
    this.branch = { pts };
    const n = pts.length;
    this.n = n;
    this.X = Float64Array.from(pts, (p) => p.x); this.Z = Float64Array.from(pts, (p) => p.z); this.Y = Float64Array.from(pts, (p) => p.y);
    this.W = Float64Array.from(pts, (p) => p.w); this.B = Float64Array.from(pts, (p) => Math.tan(((p.bank ?? 0) * Math.PI) / 180));
    this.TX = new Float64Array(n - 1); this.TZ = new Float64Array(n - 1); this.SL = new Float64Array(n - 1); this.cum = new Float64Array(n);
    for (let i = 0; i < n - 1; i++) {
      const dx = this.X[i + 1] - this.X[i], dz = this.Z[i + 1] - this.Z[i], l = Math.hypot(dx, dz) || 1e-6;
      this.TX[i] = dx / l; this.TZ[i] = dz / l; this.SL[i] = l; this.cum[i + 1] = this.cum[i] + l;
    }
    this.total = this.cum[n - 1];
    const maxHw = Math.max(...this.W) / 2 + this.sideBevel + 0.5;
    this.maxHw = maxHw;
    const CH = 8; this.chunks = [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let a0 = 0; a0 < n - 1; a0 += CH) {
      const b0 = Math.min(n - 1, a0 + CH); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = a0; i <= b0; i++) { x0 = Math.min(x0, this.X[i]); x1 = Math.max(x1, this.X[i]); z0 = Math.min(z0, this.Z[i]); z1 = Math.max(z1, this.Z[i]); }
      this.chunks.push({ a: a0, b: b0, x0: x0 - maxHw, x1: x1 + maxHw, z0: z0 - maxHw, z1: z1 + maxHw });
      minX = Math.min(minX, x0 - maxHw); maxX = Math.max(maxX, x1 + maxHw); minZ = Math.min(minZ, z0 - maxHw); maxZ = Math.max(maxZ, z1 + maxHw);
    }
    this.minX = minX; this.maxX = maxX; this.minZ = minZ; this.maxZ = maxZ;
    this._r = { i: 0, u: 0, d: 0, dv: 0 };
  }

  /** Nearest segment to (x, z): fills this._r with { i, u (along the segment, unclamped), d (euclid distance to the polyline), dv (signed, + = right) }. */
  _nearest(x, z) {
    const X = this.X, Z = this.Z, TX = this.TX, TZ = this.TZ, SL = this.SL, cs = this.chunks;
    let bd = Infinity, bi = -1, bu = 0, bdv = 0;
    for (let c = 0; c < cs.length; c++) {
      const ch = cs[c];
      if (x < ch.x0 || x > ch.x1 || z < ch.z0 || z > ch.z1) continue;
      for (let i = ch.a; i < ch.b; i++) {
        const px = x - X[i], pz = z - Z[i], tx = TX[i], tz = TZ[i];
        const u = px * tx + pz * tz, L = SL[i], uc = u < 0 ? 0 : u > L ? L : u;
        const dx = px - tx * uc, dz = pz - tz * uc, d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; bi = i; bu = u; bdv = px * -tz + pz * tx; }
      }
    }
    if (bi < 0) return false;
    const r = this._r; r.i = bi; r.u = bu; r.d = Math.sqrt(bd); r.dv = bdv >= 0 ? r.d : -r.d;
    return true;
  }

  _heightFromNearest(hBase) {
    const r = this._r, i = r.i, L = this.SL[i], n = this.n;
    if ((i === 0 && r.u < -this.startBevel) || (i === n - 2 && r.u > L + this.endBevel)) return NaN;
    const t = r.u < 0 ? 0 : r.u > L ? 1 : r.u / L;
    const w = this.W[i] + (this.W[i + 1] - this.W[i]) * t, hw = w / 2;
    if (r.d > hw + this.sideBevel) return NaN;
    const y = this.Y[i] + (this.Y[i + 1] - this.Y[i]) * t, tb = this.B[i] + (this.B[i + 1] - this.B[i]) * t;
    const top = y - r.dv * tb;
    let g = 1 - smooth(hw, hw + this.sideBevel, r.d);
    if (i === 0 && r.u < 0) g *= smooth(-this.startBevel, 0, r.u);
    if (i === n - 2 && r.u > L) g *= 1 - smooth(L, L + this.endBevel, r.u);
    this._top = r.d <= hw && (i > 0 || r.u >= 0) && (i < n - 2 || r.u <= L);
    return hBase + (top - hBase) * g;
  }

  /** Platform contract: see Platform.evaluate. Writes { h, nx, ny, nz, top } and returns true inside the footprint. */
  evaluate(x, z, hBase, out) {
    if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) return false;
    if (!this._nearest(x, z)) return false;
    const h = this._heightFromNearest(hBase);
    if (h !== h) return false;
    const top = this._top, i = this._r.i;
    // normal: analytic on the top (along slope + cross-fall), finite differences in the bevel
    let nx, nz;
    if (top) {
      const dhdu = (this.Y[i + 1] - this.Y[i]) / this.SL[i], dhdv = -(this.B[i] + this.B[i + 1]) / 2, tx = this.TX[i], tz = this.TZ[i];
      nx = -(dhdu * tx + dhdv * -tz); nz = -(dhdu * tz + dhdv * tx);
    } else {
      const e = 0.3; let hx0 = h, hx1 = h, hz0 = h, hz1 = h;
      if (this._nearest(x + e, z)) { const v = this._heightFromNearest(hBase); if (v === v) hx1 = v; }
      if (this._nearest(x - e, z)) { const v = this._heightFromNearest(hBase); if (v === v) hx0 = v; }
      if (this._nearest(x, z + e)) { const v = this._heightFromNearest(hBase); if (v === v) hz1 = v; }
      if (this._nearest(x, z - e)) { const v = this._heightFromNearest(hBase); if (v === v) hz0 = v; }
      nx = -(hx1 - hx0) / (2 * e); nz = -(hz1 - hz0) / (2 * e);
    }
    const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
    out.h = h; out.nx = nx * inv; out.ny = inv; out.nz = nz * inv; out.top = top;
    return true;
  }

  /** Distance (m) from (x, z) to the ribbon's edge (negative inside the road), for keeping scenery clear. Infinity when far. */
  edgeDistance(x, z) {
    if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) return Infinity;
    if (!this._nearest(x, z)) return Infinity;
    const r = this._r, i = r.i, t = Math.min(1, Math.max(0, r.u / this.SL[i]));
    return r.d - (this.W[i] + (this.W[i + 1] - this.W[i]) * t) / 2;
  }

  /** Centre point, heading and right vector at distance `u` (m) along the ribbon. */
  at(u, out = {}) {
    u = Math.min(this.total, Math.max(0, u));
    let i = 0; while (i < this.n - 2 && this.cum[i + 1] < u) i++;
    const t = (u - this.cum[i]) / this.SL[i];
    out.x = this.X[i] + (this.X[i + 1] - this.X[i]) * t; out.z = this.Z[i] + (this.Z[i + 1] - this.Z[i]) * t; out.y = this.Y[i] + (this.Y[i + 1] - this.Y[i]) * t;
    out.w = this.W[i] + (this.W[i + 1] - this.W[i]) * t; out.tx = this.TX[i]; out.tz = this.TZ[i]; out.rx = -this.TZ[i]; out.rz = this.TX[i]; out.yaw = Math.atan2(this.TX[i], this.TZ[i]);
    return out;
  }
}

/**
 * Mesh for a ribbon: a height grid along the polyline (same height function as the physics) plus optional striped kerbs.
 * @param {import('./RoadModel.js').RoadModel} m
 * @param {RibbonRoad} rb
 * @param {THREE.Material} material
 * @param {{ kerb?: {colours:[number,number], width?:number, every?:number, sides?:'both'|'left'|'right'}, tile?:number, tint?:number, hideInsideSpline?:boolean }} [o]
 * @returns {{ road: THREE.Mesh, kerbs: Geo|null }}
 */
export function buildRibbonMesh(m, rb, material, o = {}) {
  const g = new Geo(), tint = new THREE.Color(o.tint ?? 0xffffff), tile = o.tile ?? 2.2, n = rb.n, bev = rb.sideBevel;
  const P = { i: 0, f: 0, s: 0, lat: 0, x: 0, y: 0, z: 0, tx: 0, tz: 1, slope: 0, width: 18, tanB: 0, kappa: 0, dx: 0, dz: 0 };
  const out = { height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'grass', onRoad: false, s: 0, lateral: 0, inVoid: false };
  const base = (x, z, y) => { m.project(x, y, z, undefined, P); m.ground(x, y, z, P, out, true); return out.inVoid ? y - 0.5 : out.height; };
  const rows = [];
  const eps = 0.02;
  for (let i = 0; i < n; i++) {
    // smoothed frame at the vertex: average of the adjoining segment directions
    const a = i > 0 ? i - 1 : 0, b = i < n - 1 ? i : n - 2;
    let tx = rb.TX[a] + rb.TX[b], tz = rb.TZ[a] + rb.TZ[b]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const rx = -tz, rz = tx, hw = rb.W[i] / 2, nv = Math.max(2, Math.ceil((2 * (hw + bev)) / 0.9));
    const row = [];
    for (let k = 0; k <= nv; k++) {
      const dv = -(hw + bev) + (2 * (hw + bev) * k) / nv, adv = Math.abs(dv);
      const x = rb.X[i] + rx * dv, z = rb.Z[i] + rz * dv, hB = base(x, z, rb.Y[i]);
      const top = rb.Y[i] - dv * rb.B[i], gg = 1 - smooth(hw, hw + bev, adv);
      let h = hB + (top - hB) * gg + eps;
      if (o.hideInsideSpline !== false && gg > 0.99) { m.project(x, top, z, undefined, P); if (Math.abs(P.lat) < P.width / 2 - 0.2 && Math.abs(P.y - top) < 0.6) h -= 0.07; }   // hidden under the spline road: no z-fighting
      row.push({ x, z, h, dv, hw });
    }
    row.fr = [rx, rz]; rows.push(row);
  }
  const ids = rows.map((row, i) => row.map((q) => g.vert(q.x, q.h, q.z, 0, 1, 0, q.dv / (2 * q.hw) + 0.5, rb.cum[i] / tile, tint.r, tint.g, tint.b)));
  for (let i = 0; i < n - 1; i++) {
    // rows may have different vertex counts when the width changes: stitch by normalised lateral position
    const A = rows[i], B = rows[i + 1];
    let ia = 0, ib = 0;
    while (ia < A.length - 1 || ib < B.length - 1) {
      const ua = ia < A.length - 1 ? (ia + 1) / (A.length - 1) : 2, ub = ib < B.length - 1 ? (ib + 1) / (B.length - 1) : 2;
      if (ua <= ub) { g.tri(ids[i][ia], ids[i][ia + 1], ids[i + 1][ib]); ia++; } else { g.tri(ids[i][ia], ids[i + 1][ib + 1], ids[i + 1][ib]); ib++; }
    }
  }
  // normals from the final geometry
  const geo = g.build(); geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, material);
  road.name = `ribbon:${rb.def?.id ?? 'branch'}`; road.receiveShadow = true;
  let kerbs = null;
  if (o.kerb) {
    const kc = o.kerb, kw = kc.width ?? 0.7, every = kc.every ?? 2.4, cols = kc.colours ?? [0xd62839, 0xf5f5f0], skip = kc.skip ?? [];
    const c0 = new THREE.Color(cols[0]), c1 = new THREE.Color(cols[1]);
    kerbs = new Geo();
    for (const sg of kc.sides === 'left' ? [-1] : kc.sides === 'right' ? [1] : [-1, 1]) {
      let prev = null;
      for (let i = 0; i < n; i++) {
        if (skip.some(([u0, u1]) => rb.cum[i] >= u0 && rb.cum[i] <= u1)) { prev = null; continue; }
        const [rx, rz] = rows[i].fr, hw = rb.W[i] / 2, c = Math.floor(rb.cum[i] / every) % 2 ? c1 : c0;
        const vs = [hw - kw, hw].map((d) => { const dv = sg * d; return kerbs.vert(rb.X[i] + rx * dv, rb.Y[i] - dv * rb.B[i] + eps + 0.05, rb.Z[i] + rz * dv, 0, 1, 0, d === hw ? 1 : 0, rb.cum[i] / every, c.r, c.g, c.b); });
        if (prev) kerbs.quadN(prev[0], prev[1], vs[1], vs[0]);
        prev = vs;
      }
    }
  }
  return { road, kerbs };
}

/** A RibbonRoad from control points ({ x, z, y, w, bank }): see resampleRibbon. Pure (no kit), so defs can place kickers on it before dress(). */
export function makeRibbon(spec) {
  return new RibbonRoad({ pts: resampleRibbon(spec.pts, spec.step ?? 3), sideBevel: spec.sideBevel, surface: spec.surface, road: spec.road });
}

/**
 * Add a ribbon road to a track from inside def.dress(kit): registers the platform (works headless) and draws it.
 * Call it BEFORE placing scenery so kit.place skips the new road.
 * @param {object} kit
 * @param {{ id:string, pts?:Array, rb?:RibbonRoad, step?:number, sideBevel?:number, surface?:string, road?:boolean, material?:THREE.Material, tint?:number, kerb?:object, tile?:number }} spec
 */
export function addRibbon(kit, spec) {
  const rb = spec.rb ?? makeRibbon(spec);
  rb.def = { id: spec.id, ribbon: true };
  kit.track.model.platforms.unshift(rb);               // underneath every other platform: later platforms win in ground(), so kickers / pads placed on the ribbon still show
  (kit.track.ribbons ??= []).push(rb);
  if (!kit.headless) {
    const mat = spec.material ?? kit.mat.lit({ map: kit.tex.plankTexture(), roughness: 0.8 }, 'ribbon');
    const { road, kerbs } = buildRibbonMesh(kit.track.model, rb, mat, spec);
    rb.mesh = road; kit.add(road);
    if (kerbs) { const km = kit.mat.vertex({ roughness: 0.75 }, 'ribbon-kerb'); const mesh = new THREE.Mesh(kerbs.build(), km); mesh.name = `ribbon-kerb:${spec.id}`; mesh.receiveShadow = true; kit.add(mesh); rb.kerbMesh = mesh; }
  }
  return rb;
}
