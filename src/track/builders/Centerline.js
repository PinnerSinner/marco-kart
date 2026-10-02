// Centerline: closed-loop road spline, resampled to uniform arc-length "stations".
//
//  * plan view (x, z): centripetal Catmull-Rom through the control points (no cusps, no overshoot loops)
//  * elevation, width and banking: periodic monotone cubic (PCHIP) in ARC LENGTH (flat crests, no overshoot)
//  * stations every ~`spacing` metres store everything the query / mesh builders need in typed arrays
//
// Conventions (SPEC section 2): forward = (tx, 0, tz) horizontally, right = (-tz, 0, tx), lateral + = right.
// Banking > 0 means the RIGHT edge is LOWER (a banked right-hand turn): height(l) = y - l * tan(bank).
// Curvature > 0 means the road turns to the RIGHT.
import { wrapS } from '../../core/util.js';

const DEG = Math.PI / 180;

/** Periodic monotone cubic Hermite interpolant through (knot_i, value_i), period `period`. Knots ascending, knots[0] = 0. */
export class PeriodicPchip {
  /**
   * @param {ArrayLike<number>} knots ascending arc-length positions of the control points (metres), knots[0] = 0
   * @param {ArrayLike<number>} values value at each knot
   * @param {number} period loop length (metres)
   */
  constructor(knots, values, period) {
    const n = knots.length;
    this.n = n; this.period = period;
    this.k = Float64Array.from(knots); this.v = Float64Array.from(values);
    this.m = new Float64Array(n);
    const h = new Float64Array(n), d = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      h[i] = (j === 0 ? period : this.k[j]) - this.k[i];
      d[i] = h[i] > 1e-9 ? (this.v[j] - this.v[i]) / h[i] : 0;
    }
    for (let i = 0; i < n; i++) {
      const p = (i - 1 + n) % n;
      const d0 = d[p], d1 = d[i];
      if (d0 * d1 <= 0) { this.m[i] = 0; continue; }
      const w1 = 2 * h[i] + h[p], w2 = h[i] + 2 * h[p];
      this.m[i] = (w1 + w2) / (w1 / d0 + w2 / d1);
    }
    this.h = h;
  }

  _find(s) {
    const k = this.k, n = this.n;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (k[mid] <= s) lo = mid; else hi = mid - 1; }
    return lo;
  }

  /** Value at arc length s (wraps). */
  eval(s) {
    s = wrapS(s, this.period);
    const i = this._find(s), j = (i + 1) % this.n, h = this.h[i];
    if (h < 1e-9) return this.v[i];
    const t = (s - this.k[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * this.v[i] + (t3 - 2 * t2 + t) * h * this.m[i] + (-2 * t3 + 3 * t2) * this.v[j] + (t3 - t2) * h * this.m[j];
  }

  /** Derivative d(value)/ds at arc length s. */
  deriv(s) {
    s = wrapS(s, this.period);
    const i = this._find(s), j = (i + 1) % this.n, h = this.h[i];
    if (h < 1e-9) return 0;
    const t = (s - this.k[i]) / h, t2 = t * t;
    return ((6 * t2 - 6 * t) * this.v[i] + (3 * t2 - 4 * t + 1) * h * this.m[i] + (-6 * t2 + 6 * t) * this.v[j] + (3 * t2 - 2 * t) * h * this.m[j]) / h;
  }
}

/** Normalise a control point given as [x, z, y?, width?, bankDeg?] or { x, z, y, w, bank, id }. Bank in DEGREES in the def. */
function normalisePoint(p, defaultWidth) {
  if (Array.isArray(p)) {
    const [x, z, y = 0, w = null, bank = 0] = p;
    return { x, z, y, w: w ?? defaultWidth, bank: bank * DEG, id: null };
  }
  return { x: p.x, z: p.z, y: p.y ?? 0, w: p.w ?? p.width ?? defaultWidth, bank: (p.bank ?? 0) * DEG, id: p.id ?? null };
}

export class Centerline {
  /**
   * @param {Array} points control points (see TRACKDEF.md): [x, z, y, width, bankDeg] arrays or objects
   * @param {{ spacing?: number, width?: number }} [opts] station spacing target (m) and default road width (m)
   */
  constructor(points, { spacing = 2, width = 18 } = {}) {
    if (!points || points.length < 4) throw new Error('Centerline needs at least 4 control points');
    const P = points.map((p) => normalisePoint(p, width));
    const n = P.length;
    this.controls = P;

    // ---- 1. centripetal Catmull-Rom segments (Hermite form) ------------------------------------------------
    const segs = [];
    const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      const t01 = Math.max(Math.sqrt(dist(p0, p1)), 1e-4), t12 = Math.max(Math.sqrt(dist(p1, p2)), 1e-4), t23 = Math.max(Math.sqrt(dist(p2, p3)), 1e-4);
      const mx1 = t12 * ((p1.x - p0.x) / t01 - (p2.x - p0.x) / (t01 + t12) + (p2.x - p1.x) / t12);
      const mz1 = t12 * ((p1.z - p0.z) / t01 - (p2.z - p0.z) / (t01 + t12) + (p2.z - p1.z) / t12);
      const mx2 = t12 * ((p2.x - p1.x) / t12 - (p3.x - p1.x) / (t12 + t23) + (p3.x - p2.x) / t23);
      const mz2 = t12 * ((p2.z - p1.z) / t12 - (p3.z - p1.z) / (t12 + t23) + (p3.z - p2.z) / t23);
      segs.push({ x1: p1.x, z1: p1.z, x2: p2.x, z2: p2.z, mx1, mz1, mx2, mz2 });
    }
    const hermite = (sg, u, o) => {
      const u2 = u * u, u3 = u2 * u;
      const a = 2 * u3 - 3 * u2 + 1, b = u3 - 2 * u2 + u, c = -2 * u3 + 3 * u2, d = u3 - u2;
      o.x = a * sg.x1 + b * sg.mx1 + c * sg.x2 + d * sg.mx2;
      o.z = a * sg.z1 + b * sg.mz1 + c * sg.z2 + d * sg.mz2;
      const da = 6 * u2 - 6 * u, db = 3 * u2 - 4 * u + 1, dc = -6 * u2 + 6 * u, dd = 3 * u2 - 2 * u;
      o.dx = da * sg.x1 + db * sg.mx1 + dc * sg.x2 + dd * sg.mx2;
      o.dz = da * sg.z1 + db * sg.mz1 + dc * sg.z2 + dd * sg.mz2;
      return o;
    };

    // ---- 2. arc-length tables per segment ------------------------------------------------------------------
    const tabs = [], segS0 = new Float64Array(n + 1);
    const tmp = { x: 0, z: 0, dx: 0, dz: 0 };
    let total = 0;
    for (let i = 0; i < n; i++) {
      const sg = segs[i];
      const chord = Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1);
      const K = Math.min(600, Math.max(16, Math.ceil(chord / 0.4)));
      const tab = new Float64Array(K + 1);
      hermite(sg, 0, tmp); let px = tmp.x, pz = tmp.z;
      for (let j = 1; j <= K; j++) {
        hermite(sg, j / K, tmp);
        tab[j] = tab[j - 1] + Math.hypot(tmp.x - px, tmp.z - pz);
        px = tmp.x; pz = tmp.z;
      }
      tabs.push(tab); segS0[i] = total; total += tab[K];
    }
    segS0[n] = total;
    const L0 = total;

    // ---- 3. uniform stations ---------------------------------------------------------------------------------
    const N = Math.max(8, Math.round(L0 / spacing));
    const ds = L0 / N;
    this.N = N; this.ds = ds; this.length = L0;
    const A = (T = Float64Array) => new T(N);
    this.x = A(); this.z = A(); this.tx = A(); this.tz = A(); this.y = A(); this.slope = A(); this.width = A(); this.tanB = A(); this.kappa = A();
    const findSeg = (s) => { let lo = 0, hi = n - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segS0[mid] <= s) lo = mid; else hi = mid - 1; } return lo; };
    this.ctrlS = Array.from({ length: n }, (_, i) => segS0[i]);
    const yK = new PeriodicPchip(this.ctrlS, P.map((p) => p.y), L0);
    const wK = new PeriodicPchip(this.ctrlS, P.map((p) => p.w), L0);
    const bK = new PeriodicPchip(this.ctrlS, P.map((p) => p.bank), L0);
    for (let k = 0; k < N; k++) {
      const s = k * ds;
      const si = findSeg(s), tab = tabs[si], K = tab.length - 1;
      const local = s - segS0[si];
      let lo = 0, hi = K;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tab[mid] <= local) lo = mid; else hi = mid; }
      const span = tab[hi] - tab[lo];
      const u = (lo + (span > 0 ? (local - tab[lo]) / span : 0)) / K;
      hermite(segs[si], Math.min(1, u), tmp);
      const dl = Math.hypot(tmp.dx, tmp.dz) || 1;
      this.x[k] = tmp.x; this.z[k] = tmp.z; this.tx[k] = tmp.dx / dl; this.tz[k] = tmp.dz / dl;
      this.y[k] = yK.eval(s); this.slope[k] = yK.deriv(s);
      this.width[k] = Math.max(4, wK.eval(s));
      this.tanB[k] = Math.tan(bK.eval(s));
    }
    for (let k = 0; k < N; k++) {
      const a = (k - 1 + N) % N, b = (k + 1) % N;
      let d = Math.atan2(this.tx[b], this.tz[b]) - Math.atan2(this.tx[a], this.tz[a]);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.kappa[k] = -d / (2 * ds);      // heading grows when turning LEFT, so negate: + = right
    }
    /** control point id -> arc length (m) */
    this.marks = {};
    P.forEach((p, i) => { if (p.id) this.marks[p.id] = this.ctrlS[i]; });
  }

  /** Station index containing s and the fraction: writes into `o` { i, f } (i in [0, N-1], f in [0, 1)). */
  locate(s, o) {
    s = wrapS(s, this.length);
    const q = s / this.ds; let i = Math.floor(q);
    if (i >= this.N) i = this.N - 1;
    o.i = i; o.f = q - i;
    return o;
  }

  /**
   * Smooth centreline evaluation at s (cubic Hermite in plan, linear in y/width/bank so it matches the meshes exactly).
   * Writes { x, y, z, tx, tz, slope, width, tanB, kappa } into out (tx,tz = unit horizontal tangent).
   * @param {number} s arc length (m), wraps
   * @param {object} out
   */
  eval(s, out) {
    const N = this.N, ds = this.ds;
    s = wrapS(s, this.length);
    const q = s / ds; let i = Math.floor(q); if (i >= N) i = N - 1;
    return this.evalAt(i, q - i, out);
  }

  /** Evaluate on segment i (station i -> i+1) at fraction f (f may stray slightly outside [0,1] during Newton refinement). */
  evalAt(i, f, out) {
    const N = this.N, ds = this.ds, j = i + 1 === N ? 0 : i + 1;
    const f2 = f * f, f3 = f2 * f;
    const a = 2 * f3 - 3 * f2 + 1, b = f3 - 2 * f2 + f, c = -2 * f3 + 3 * f2, d = f3 - f2;
    const x0 = this.x[i], x1 = this.x[j], z0 = this.z[i], z1 = this.z[j];
    const m0x = this.tx[i] * ds, m1x = this.tx[j] * ds, m0z = this.tz[i] * ds, m1z = this.tz[j] * ds;
    out.x = a * x0 + b * m0x + c * x1 + d * m1x;
    out.z = a * z0 + b * m0z + c * z1 + d * m1z;
    const da = 6 * f2 - 6 * f, db = 3 * f2 - 4 * f + 1, dc = -6 * f2 + 6 * f, dd = 3 * f2 - 2 * f;
    const dx = da * x0 + db * m0x + dc * x1 + dd * m1x, dz = da * z0 + db * m0z + dc * z1 + dd * m1z;
    const dl = Math.hypot(dx, dz) || 1;
    out.tx = dx / dl; out.tz = dz / dl;
    out.dx = dx; out.dz = dz;                               // derivative wrt f (metres per unit f), for Newton steps
    const e = 1 - f;
    out.y = this.y[i] * e + this.y[j] * f;
    out.slope = this.slope[i] * e + this.slope[j] * f;
    out.width = this.width[i] * e + this.width[j] * f;
    out.tanB = this.tanB[i] * e + this.tanB[j] * f;
    out.kappa = this.kappa[i] * e + this.kappa[j] * f;
    return out;
  }
}
