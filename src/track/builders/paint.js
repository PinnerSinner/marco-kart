// Paint: road markings, arrows, boost-pad plates and decals laid on the road surface. Shapes are authored in
// (s, lateral) space and conformed to the road (banking, slope, curves), lifted slightly above it.
import * as THREE from 'three';
import { Geo } from './Geo.js';

const c = new THREE.Color(), _p = new THREE.Vector3(), _u = new THREE.Vector3();

export class Paint {
  /**
   * @param {import('../Track.js').Track} track
   * @param {{ lift?: number }} [o] lift above the surface (m)
   */
  constructor(track, { lift = 0.03 } = {}) {
    this.track = track; this.lift = lift; this.geo = new Geo(); this._sm = {};
  }

  /** Map (s, lateral) to a world point on the surface, lifted along the surface normal. Writes to {p, n}. */
  _at(s, l, lift) {
    const t = this.track, sm = t.sample(s, this._sm);
    _p.copy(sm.pos).addScaledVector(sm.right, l); _p.y = sm.pos.y - l * Math.tan(sm.banking);
    _u.copy(sm.up);
    return { x: _p.x + _u.x * lift, y: _p.y + _u.y * lift, z: _p.z + _u.z * lift, nx: _u.x, ny: _u.y, nz: _u.z };
  }

  _v(s, l, colour, lift = this.lift) {
    const a = this._at(s, l, lift); c.set(colour);
    return this.geo.vert(a.x, a.y, a.z, a.nx, a.ny, a.nz, 0, 0, c.r, c.g, c.b);
  }

  /**
   * Continuous strip of `width` centred on `lateral` between s0 and s1 (s1 < s0 wraps), sampled every `step` m.
   * `lateral` may be a function of s (e.g. to hug the road edge while the width changes).
   */
  strip(s0, s1, lateral, width, colour, step = 2, lift = this.lift) {
    const L = this.track.length; let len = s1 - s0; if (len < 0) len += L;
    const n = Math.max(1, Math.ceil(len / step)), latAt = typeof lateral === 'function' ? lateral : () => lateral;
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const s = s0 + (len * k) / n, l = latAt(s);
      const a = this._v(s, l - width / 2, colour, lift), b = this._v(s, l + width / 2, colour, lift);
      if (prev) this.geo.quadN(prev[0], prev[1], b, a);
      prev = [a, b];
    }
    return this;
  }

  /** Dashed line: `dash` metres painted, `gap` metres clear. */
  dashes(s0, s1, lateral, width, colour, dash = 3, gap = 5) {
    const L = this.track.length; let len = s1 - s0; if (len < 0) len += L;
    for (let d = 0; d + dash <= len + 1e-6; d += dash + gap) this.strip(s0 + d, s0 + d + dash, lateral, width, colour, 1.5);
    return this;
  }

  /** Filled polygon in (s, lateral) space (concave allowed), s measured absolutely. points: [[s, l], ...] */
  poly(points, colour, lift = this.lift) {
    const shape = points.map((p) => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(shape, []);
    const ids = points.map((p) => this._v(p[0], p[1], colour, lift));
    for (const t of tris) {
      const a = ids[t[0]], b = ids[t[1]], d = ids[t[2]];
      this.geo.quadN(a, b, d, d);      // degenerate quad = one triangle, winding fixed by the normal
    }
    return this;
  }

  /** Rectangle centred on (s, l), `len` along the road, `wid` across. */
  rect(s, l, len, wid, colour, lift = this.lift) {
    return this.poly([[s - len / 2, l - wid / 2], [s + len / 2, l - wid / 2], [s + len / 2, l + wid / 2], [s - len / 2, l + wid / 2]], colour, lift);
  }

  /** Forward-pointing road arrow centred on (s, l). */
  arrow(s, l, len, wid, colour, lift = this.lift) {
    const h = len / 2, w = wid / 2, sw = w * 0.32, hl = len * 0.42;
    return this.poly([[s - h, l - sw], [s + h - hl, l - sw], [s + h - hl, l - w], [s + h, l], [s + h - hl, l + w], [s + h - hl, l + sw], [s - h, l + sw]], colour, lift);
  }

  /** Chevron ">" (pointing forward) centred on (s, l): half-length c along the road, half-width w across, band thickness t (m along s). */
  chevron(s, l, c, w, colour, t = c * 0.7, lift = this.lift) {
    const e = t / 2;
    return this.poly([[s - c + e, l - w], [s + c + e, l], [s - c + e, l + w], [s - c - e, l + w], [s + c - e, l], [s - c - e, l - w]], colour, lift);
  }

  /** Build a single mesh with vertex colours. Returns null when empty. */
  build(material) {
    if (!this.geo.vertexCount) return null;
    const m = new THREE.Mesh(this.geo.build(), material); m.name = 'paint'; m.receiveShadow = true;
    return m;
  }
}
