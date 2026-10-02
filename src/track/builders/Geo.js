// Geo: a tiny procedural mesh builder producing ONE BufferGeometry (position, normal, uv, color) from primitives.
// Every primitive gets vertex colours with baked ambient occlusion (darker near its base), which is what keeps
// flat-shaded scenery from looking like plain coloured blocks. Origins: box / cyl / cone / gable are placed by the
// centre of their BASE (y = bottom); sphere by its centre.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _nv = new THREE.Vector3(), _c = new THREE.Color();
const asColor = (c) => (c && c.isColor ? c : _c.set(c ?? 0xffffff));

/**
 * @typedef {object} PrimOpts
 * @property {number} [x] @property {number} [y] @property {number} [z] base-centre position (metres)
 * @property {number} [ry] yaw @property {number} [rx] pitch @property {number} [rz] roll (radians; Euler order YXZ)
 * @property {number|THREE.Color} [colour=0xffffff] base colour (sRGB hex)
 * @property {number|THREE.Color} [top] colour for faces looking up (roofs, tops)
 * @property {number} [ao=0.35] 0..1 darkening toward the base
 * @property {[number, number]} [facade] box only: UVs in metres per tile [tileW, tileH] (sides tile, top/bottom sample a plain texel)
 * @property {number} [sy=1] sphere only: vertical squash
 */
export class Geo {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }

  get vertexCount() { return this.pos.length / 3; }

  /** Append one vertex already in final space (linear colour r,g,b). Returns its index. */
  vert(px, py, pz, nx, ny, nz, u, v, r, g, b) { return this._vert(px, py, pz, nx, ny, nz, u, v, r, g, b); }

  /** Append a triangle of vertex indices. */
  tri(a, b, c) { this.idx.push(a, b, c); return this; }

  /** Append two triangles (a, b, c) and (a, c, d). */
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); return this; }

  /** Like quad(), but flips the winding if needed so the face points along the vertex normal of `a` (robust ribbon building). */
  quadN(a, b, c, d) {
    const P = this.pos, N = this.nor;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const dot = cx * N[a * 3] + cy * N[a * 3 + 1] + cz * N[a * 3 + 2];
    return dot >= 0 ? this.quad(a, b, c, d) : this.quad(a, d, c, b);
  }

  /** Low-level: append one vertex (already in final space). */
  _vert(px, py, pz, nx, ny, nz, u, v, r, g, b) {
    this.pos.push(px, py, pz); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.col.push(r, g, b);
    return this.pos.length / 3 - 1;
  }

  _matrix(o) {
    if (o.matrix) return o.matrix;
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ');
    return _m.makeRotationFromEuler(_e).setPosition(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  }

  /** Append a local-space triangle list through the transform of `o`, colouring with AO. */
  _emit(verts, norms, uvs, index, o, height) {
    const M = this._matrix(o); _n.getNormalMatrix(M);
    const base = asColor(o.colour), br = base.r, bg = base.g, bb = base.b;     // read before asColor() is reused for `top` (shared scratch colour)
    let tr = 0, tg = 0, tb = 0; const top = o.top !== undefined; if (top) { const tc = asColor(o.top); tr = tc.r; tg = tc.g; tb = tc.b; }
    const ao = o.ao ?? 0.35, off = this.vertexCount, h = Math.max(height, 1e-4);
    for (let i = 0; i < verts.length / 3; i++) {
      const lx = verts[i * 3], ly = verts[i * 3 + 1], lz = verts[i * 3 + 2];
      _v.set(lx, ly, lz).applyMatrix4(M);
      const nx0 = norms[i * 3], ny0 = norms[i * 3 + 1], nz0 = norms[i * 3 + 2];
      const nv = _nv.set(nx0, ny0, nz0).applyMatrix3(_n).normalize();
      const t = Math.min(1, Math.max(0, ly / h)), k = 1 - ao * (1 - t) * (1 - t);
      const useTop = top && ny0 > 0.6;
      this._vert(_v.x, _v.y, _v.z, nv.x, nv.y, nv.z, uvs[i * 2], uvs[i * 2 + 1], (useTop ? tr : br) * k, (useTop ? tg : bg) * k, (useTop ? tb : bb) * k);
    }
    for (const j of index) this.idx.push(off + j);
    return this;
  }

  /** Box w (x) x h (y) x d (z), base centred at (x, y, z). */
  box(w, h, d, o = {}) {
    const hw = w / 2, hd = d / 2, V = [], N = [], U = [], I = [];
    const face = (nx, ny, nz, corners, uv) => {
      const b = V.length / 3;
      for (let k = 0; k < 4; k++) { V.push(...corners[k]); N.push(nx, ny, nz); U.push(...uv[k]); }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    const f = o.facade, flat = [[0.03, 0.03], [0.03, 0.03], [0.03, 0.03], [0.03, 0.03]];
    const side = (len, hh) => f ? [[0, 0], [len / f[0], 0], [len / f[0], hh / f[1]], [0, hh / f[1]]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
    face(0, 0, 1, [[-hw, 0, hd], [hw, 0, hd], [hw, h, hd], [-hw, h, hd]], side(w, h));
    face(0, 0, -1, [[hw, 0, -hd], [-hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd]], side(w, h));
    face(1, 0, 0, [[hw, 0, hd], [hw, 0, -hd], [hw, h, -hd], [hw, h, hd]], side(d, h));
    face(-1, 0, 0, [[-hw, 0, -hd], [-hw, 0, hd], [-hw, h, hd], [-hw, h, -hd]], side(d, h));
    face(0, 1, 0, [[-hw, h, hd], [hw, h, hd], [hw, h, -hd], [-hw, h, -hd]], f ? flat : [[0, 0], [1, 0], [1, 1], [0, 1]]);
    face(0, -1, 0, [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]], f ? flat : [[0, 0], [1, 0], [1, 1], [0, 1]]);
    return this._emit(V, N, U, I, o, h);
  }

  /** Cylinder / truncated cone: radius rBot at the base, rTop at the top (0 = cone). */
  cyl(rTop, rBot, h, seg = 10, o = {}) {
    const V = [], N = [], U = [], I = [], slope = (rBot - rTop) / h, nl = Math.hypot(1, slope);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      V.push(c * rBot, 0, s * rBot, c * rTop, h, s * rTop);
      N.push(c / nl, slope / nl, s / nl, c / nl, slope / nl, s / nl);
      U.push(k / seg, 0, k / seg, 1);
    }
    for (let k = 0; k < seg; k++) { const a = k * 2; I.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    const cap = (y, r, ny) => {
      if (r <= 1e-4) return;
      const c0 = V.length / 3; V.push(0, y, 0); N.push(0, ny, 0); U.push(0.5, 0.5);
      for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2; V.push(Math.cos(a) * r, y, Math.sin(a) * r); N.push(0, ny, 0); U.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5); }
      for (let k = 0; k < seg; k++) ny > 0 ? I.push(c0, c0 + k + 2, c0 + k + 1) : I.push(c0, c0 + k + 1, c0 + k + 2);
    };
    cap(h, rTop, 1); cap(0, rBot, -1);
    return this._emit(V, N, U, I, o, h);
  }

  /**
   * Cylinder along an arbitrary segment from (ax, ay, az) to (bx, by, bz) (cables, beams, poles, railings).
   * @param {number[]} a start [x,y,z] @param {number[]} b end [x,y,z] @param {number} r radius (m)
   */
  beam(a, b, r, seg = 6, o = {}) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = dir.length();
    if (len < 1e-6) return this;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.multiplyScalar(1 / len));
    const M = new THREE.Matrix4().compose(new THREE.Vector3(a[0], a[1], a[2]), q, new THREE.Vector3(1, 1, 1));
    return this.cyl(o.rTop ?? r, r, len, seg, { ao: 0, ...o, matrix: M });
  }

  /**
   * Vertical rectangle (billboard, window, flag, sign face) standing on y, facing +Z before yaw `ry`. uv = [u0, v0, u1, v1].
   * Double sided by adding the back face when o.both.
   */
  panel(w, h, o = {}) {
    const u = o.uv ?? [0, 0, 1, 1], hw = w / 2;
    const V = [-hw, 0, 0, hw, 0, 0, hw, h, 0, -hw, h, 0], N = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    const U = [u[0], u[1], u[2], u[1], u[2], u[3], u[0], u[3]], I = [0, 1, 2, 0, 2, 3];
    if (o.both) { V.push(hw, 0, 0, -hw, 0, 0, -hw, h, 0, hw, h, 0); N.push(0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1); U.push(u[2], u[1], u[0], u[1], u[0], u[3], u[2], u[3]); I.push(4, 5, 6, 4, 6, 7); }
    return this._emit(V, N, U, I, { ao: 0, ...o }, h);
  }

  /** Cone (apex up). */
  cone(r, h, seg = 8, o = {}) { return this.cyl(0, r, h, seg, o); }

  /** Low-poly sphere (centre at o.x/y/z), optionally squashed by o.sy. */
  sphere(r, o = {}, wSeg = 8, hSeg = 6) {
    const V = [], N = [], U = [], I = [], sy = o.sy ?? 1;
    for (let j = 0; j <= hSeg; j++) {
      const v = j / hSeg, ph = v * Math.PI;
      for (let i = 0; i <= wSeg; i++) {
        const u = i / wSeg, th = u * Math.PI * 2;
        const nx = Math.cos(th) * Math.sin(ph), ny = Math.cos(ph), nz = Math.sin(th) * Math.sin(ph);
        V.push(nx * r, ny * r * sy + r * sy, nz * r); N.push(nx, ny / sy, nz); U.push(u, 1 - v);
      }
    }
    for (let j = 0; j < hSeg; j++) for (let i = 0; i < wSeg; i++) { const a = j * (wSeg + 1) + i, b = a + wSeg + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
    const oo = { ...o, y: (o.y ?? 0) - r * sy };
    return this._emit(V, N, U, I, oo, 2 * r * sy);
  }

  /** Gable roof: eaves at y (width w along x), ridge height rh, length d along z. Overhang oh on all sides. */
  gable(w, rh, d, o = {}) {
    const oh = o.overhang ?? 0.25, hw = w / 2 + oh, hd = d / 2 + oh, V = [], N = [], U = [], I = [];
    const tri = (a, b, c, n) => { const k = V.length / 3; V.push(...a, ...b, ...c); N.push(...n, ...n, ...n); U.push(0, 0, 1, 0, 0.5, 1); I.push(k, k + 1, k + 2); };
    const quad = (a, b, c, dd, n) => { const k = V.length / 3; V.push(...a, ...b, ...c, ...dd); for (let i = 0; i < 4; i++) N.push(...n); U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
    const sl = Math.hypot(hw, rh), nx = rh / sl, ny = hw / sl;
    quad([-hw, 0, hd], [-hw, 0, -hd], [0, rh, -hd], [0, rh, hd], [-nx, ny, 0]);
    quad([hw, 0, -hd], [hw, 0, hd], [0, rh, hd], [0, rh, -hd], [nx, ny, 0]);
    const inner = w / 2 - 0.02;                                    // end gables (flush with the wall)
    tri([-inner, 0, d / 2], [inner, 0, d / 2], [0, rh * (inner / hw), d / 2], [0, 0, 1]);
    tri([inner, 0, -d / 2], [-inner, 0, -d / 2], [0, rh * (inner / hw), -d / 2], [0, 0, -1]);
    return this._emit(V, N, U, I, { ao: 0.15, ...o, top: o.top ?? o.colour }, rh);
  }

  /** Append a flat polygon (points [[x, z], ...] on plane y) facing up. */
  poly(points, y, o = {}) {
    const shape = points.map((p) => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(shape, []);
    const V = [], N = [], U = [], I = [];
    points.forEach((p) => { V.push(p[0], y, p[1]); N.push(0, 1, 0); U.push(p[0], p[1]); });
    for (const t of tris) I.push(t[0], t[2], t[1]);
    return this._emit(V, N, U, I, { ao: 0, ...o }, 1);
  }

  /** Append an arbitrary THREE.BufferGeometry (needs position + normal; uv optional) with a transform and vertex colours. */
  geometry(g, o = {}) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const V = Array.from(p.array), N = n ? Array.from(n.array) : new Array(V.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0));
    const U = uv ? Array.from(uv.array) : new Array((V.length / 3) * 2).fill(0);
    let I = g.index ? Array.from(g.index.array) : Array.from({ length: V.length / 3 }, (_, i) => i);
    let maxY = 0; for (let i = 1; i < V.length; i += 3) maxY = Math.max(maxY, V[i]);
    return this._emit(V, N, U, I, o, maxY || 1);
  }

  /** Merge another Geo through a transform { x, y, z, ry, rx, rz, s }. */
  merge(other, o = {}) {
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ');
    const M = _m.makeRotationFromEuler(_e).setPosition(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    if (o.s !== undefined) M.scale(_v.set(o.s, o.s, o.s));
    _n.getNormalMatrix(M);
    const off = this.vertexCount, nv = _nv;
    for (let i = 0; i < other.pos.length / 3; i++) {
      _v.set(other.pos[i * 3], other.pos[i * 3 + 1], other.pos[i * 3 + 2]).applyMatrix4(M);
      nv.set(other.nor[i * 3], other.nor[i * 3 + 1], other.nor[i * 3 + 2]).applyMatrix3(_n).normalize();
      this._vert(_v.x, _v.y, _v.z, nv.x, nv.y, nv.z, other.uv[i * 2], other.uv[i * 2 + 1], other.col[i * 3], other.col[i * 3 + 1], other.col[i * 3 + 2]);
    }
    for (const j of other.idx) this.idx.push(off + j);
    return this;
  }

  /** Finish: returns a BufferGeometry (position, normal, uv, color, index). */
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
