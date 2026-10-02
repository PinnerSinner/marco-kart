// GeoBuilder: compose many primitives (each with its own transform + vertex colours) into ONE merged BufferGeometry
// (position, normal, color). Keeps every kart / character part to a single draw call while still giving hand-painted
// colour variation (per-part vertical gradients and a baked ambient-occlusion ramp).
// Node-importable.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _ca = new THREE.Color();
const _cb = new THREE.Color();
const _cc = new THREE.Color();
const _tv0 = new THREE.Vector3();
const _tv1 = new THREE.Vector3();
const _tvUp = new THREE.Vector3(0, 1, 0);
const _tq = new THREE.Quaternion();

/**
 * @typedef {object} PartOpts
 * @property {number[]} [p] position [x,y,z]
 * @property {number[]} [r] rotation Euler XYZ radians
 * @property {THREE.Quaternion} [q] rotation quaternion (wins over `r`)
 * @property {(x:number,y:number,z:number)=>number|null} [tri] per-triangle colour override evaluated at the triangle centroid in local space (hex or null)
 * @property {number|number[]} [s] scale
 * @property {number} [c=0xffffff] colour (hex) at the bottom of the part
 * @property {number} [c2] colour at the top; when given, the part gets a smooth gradient along `axis`
 * @property {'x'|'y'|'z'} [axis='y'] gradient axis (local space)
 * @property {boolean} [flat] facet-shaded normals
 * @property {number} [k=1] colour multiplier (values above 1.5 mark blinking LEDs for `ledMaterial`)
 * @property {boolean} [keep] keep the source geometry's own `color` attribute (for pre-coloured geometry)
 */

export class GeoBuilder {
  constructor() {
    /** @type {THREE.BufferGeometry[]} */
    this.geos = [];
  }

  /**
   * Add any geometry.
   * @param {THREE.BufferGeometry} geometry (not modified)
   * @param {PartOpts} [o]
   * @returns {GeoBuilder}
   */
  add(geometry, o = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && !(o.keep && name === 'color')) g.deleteAttribute(name);
    }
    if (o.flat) g.computeVertexNormals();
    const pos = g.attributes.position;
    const n = pos.count;
    const col = o.keep && g.attributes.color ? null : new Float32Array(n * 3);
    _ca.setHex(o.c ?? 0xffffff);
    if (!col) {
      // pre-coloured: nothing to generate
    } else if (o.c2 !== undefined) {
      _cb.setHex(o.c2);
      const ax = o.axis ?? 'y';
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const lo = bb.min[ax], hi = bb.max[ax];
      const span = hi - lo || 1;
      for (let i = 0; i < n; i++) {
        const t = ((ax === 'x' ? pos.getX(i) : ax === 'y' ? pos.getY(i) : pos.getZ(i)) - lo) / span;
        const k = t * t * (3 - 2 * t);
        _cc.copy(_ca).lerp(_cb, k);
        col[i * 3] = _cc.r; col[i * 3 + 1] = _cc.g; col[i * 3 + 2] = _cc.b;
      }
    } else {
      for (let i = 0; i < n; i++) { col[i * 3] = _ca.r; col[i * 3 + 1] = _ca.g; col[i * 3 + 2] = _ca.b; }
    }
    if (col && o.tri) {
      for (let t = 0; t + 2 < n; t += 3) {
        const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
        const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
        const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
        const hex = o.tri(cx, cy, cz);
        if (hex === null || hex === undefined) continue;
        _cc.setHex(hex);
        for (let v = 0; v < 3; v++) { col[(t + v) * 3] = _cc.r; col[(t + v) * 3 + 1] = _cc.g; col[(t + v) * 3 + 2] = _cc.b; }
      }
    }
    if (col && o.k !== undefined && o.k !== 1) for (let i = 0; i < col.length; i++) col[i] *= o.k;
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const p = o.p ?? [0, 0, 0];
    const r = o.r ?? [0, 0, 0];
    const s = typeof o.s === 'number' ? [o.s, o.s, o.s] : (o.s ?? [1, 1, 1]);
    if (o.q) _q.copy(o.q); else _q.setFromEuler(_e.set(r[0], r[1], r[2]));
    _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    this.geos.push(g);
    return this;
  }

  /** Axis-aligned box. @param {number} w @param {number} h @param {number} d @param {PartOpts} [o] */
  box(w, h, d, o) { return this.add(new THREE.BoxGeometry(w, h, d), o); }

  /** Rounded box (soft cartoon edges). @param {number[]} size [w,h,d] @param {number} radius @param {PartOpts} [o] @param {number} [seg=3] */
  rbox(size, radius, o, seg = 3) {
    const r = Math.min(radius, Math.min(size[0], size[1], size[2]) / 2 - 1e-3);
    return this.add(new RoundedBoxGeometry(size[0], size[1], size[2], seg, r), o);
  }

  /** UV sphere. @param {number} r @param {PartOpts} [o] @param {number} [ws=14] @param {number} [hs=10] */
  sphere(r, o, ws = 14, hs = 10) { return this.add(new THREE.SphereGeometry(r, ws, hs), o); }

  /** Cylinder. @param {number} rTop @param {number} rBot @param {number} h @param {PartOpts} [o] @param {number} [seg=12] */
  cyl(rTop, rBot, h, o, seg = 12) { return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), o); }

  /** Cone. @param {number} r @param {number} h @param {PartOpts} [o] @param {number} [seg=12] */
  cone(r, h, o, seg = 12) { return this.add(new THREE.ConeGeometry(r, h, seg), o); }

  /** Capsule. @param {number} r @param {number} len @param {PartOpts} [o] */
  capsule(r, len, o) { return this.add(new THREE.CapsuleGeometry(r, len, 5, 10), o); }

  /** Torus. @param {number} R @param {number} r @param {PartOpts} [o] @param {number} [ts=8] @param {number} [rs=20] */
  torus(R, r, o, ts = 8, rs = 20) { return this.add(new THREE.TorusGeometry(R, r, ts, rs), o); }

  /** Cylinder between two points. @param {number[]} a @param {number[]} b @param {number} r @param {PartOpts} [o] @param {number} [seg=8] */
  tube(a, b, r, o = {}, seg = 8) {
    _tv0.set(a[0], a[1], a[2]); _tv1.set(b[0], b[1], b[2]);
    const len = _tv0.distanceTo(_tv1);
    _tv1.sub(_tv0).normalize();
    _tq.setFromUnitVectors(_tvUp, _tv1);
    return this.add(new THREE.CylinderGeometry(r, r, len, seg), { ...o, p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], q: _tq.clone() });
  }

  /** Partial torus (arc in the local XY plane starting at +X). @param {number} R @param {number} r @param {number} arc @param {PartOpts} [o] */
  arc(R, r, arc, o) { return this.add(new THREE.TorusGeometry(R, r, 6, 22, arc), o); }

  /** Lathe from [radius, y] points. @param {number[][]} pts @param {PartOpts} [o] @param {number} [seg=16] */
  lathe(pts, o, seg = 16) { return this.add(new THREE.LatheGeometry(pts.map((q) => new THREE.Vector2(q[0], q[1])), seg), o); }

  /** Merge into a single BufferGeometry (position, normal, color). Disposes the temporaries.
   * @param {{ao?: {y0:number, y1:number, min:number}}} [opts] baked ambient-occlusion ramp on world-builder Y */
  build(opts = {}) {
    if (!this.geos.length) return new THREE.BufferGeometry();
    const geo = mergeGeometries(this.geos, false);
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    if (opts.ao) {
      const { y0, y1, min } = opts.ao;
      const pos = geo.attributes.position, col = geo.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
        const f = min + (1 - min) * t * t * (3 - 2 * t);
        col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
      }
    }
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

/**
 * A small Union-flag built from thin coloured slabs (no textures, so it works headless). Faces +Z, centred.
 * @param {number} w width (m)
 * @param {number} h height (m)
 * @param {number} [thick=0.012]
 * @returns {THREE.BufferGeometry}
 */
export function unionFlagGeometry(w, h, thick = 0.012) {
  const b = new GeoBuilder();
  const blue = 0x1d3f8f, white = 0xf6f3ea, red = 0xd0202f;
  const diag = Math.hypot(w, h);
  const ang = Math.atan2(h, w);
  b.box(w, h, thick, { c: blue });
  b.box(diag * 1.0, h * 0.2, thick, { c: white, p: [0, 0, thick * 0.6], r: [0, 0, ang] });
  b.box(diag * 1.0, h * 0.2, thick, { c: white, p: [0, 0, thick * 0.6], r: [0, 0, -ang] });
  b.box(diag * 1.0, h * 0.075, thick, { c: red, p: [0, 0, thick * 1.2], r: [0, 0, ang] });
  b.box(diag * 1.0, h * 0.075, thick, { c: red, p: [0, 0, thick * 1.2], r: [0, 0, -ang] });
  b.box(w, h * 0.34, thick, { c: white, p: [0, 0, thick * 1.8] });
  b.box(w * 0.34, h, thick, { c: white, p: [0, 0, thick * 1.8] });
  b.box(w, h * 0.2, thick, { c: red, p: [0, 0, thick * 2.4] });
  b.box(w * 0.2, h, thick, { c: red, p: [0, 0, thick * 2.4] });
  return b.build();
}

/**
 * Extruded 2D outline as vertex-coloured geometry.
 * @param {number[][]} pts polygon [[x,y],...] (counter-clockwise)
 * @param {number} depth
 * @param {PartOpts} [o]
 * @param {number} [bevel=0]
 * @returns {THREE.BufferGeometry}
 */
export function extrudePoly(pts, depth, o = {}, bevel = 0) {
  const shape = new THREE.Shape(pts.map((q) => new THREE.Vector2(q[0], q[1])));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 8,
  });
  g.translate(0, 0, -depth / 2);
  const b = new GeoBuilder();
  b.add(g, o);
  g.dispose();
  return b.build();
}
