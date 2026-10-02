// RacingLine: a precomputed racing line for any track, built purely from `track.sample()`.
// Shared (cached per track) by every AIDriver and by the AutoDriver. Everything is stored in typed arrays so
// the per-step lookups are index arithmetic with no allocation.
//
// Sign convention (matches SPEC): curvature `kappa` is +ve when the track turns RIGHT (yaw decreasing),
// lateral offsets are +ve to the RIGHT, so the inside of a right-hand corner is +ve.
import * as THREE from 'three';
import { clamp, lerp, loopDiff, smoothstep, wrapAngle } from '../core/util.js';

const cache = new WeakMap();

/**
 * Returns the (cached) racing line of a track.
 * @param {object} track a Track (SPEC section 3)
 * @returns {RacingLine}
 */
export function getRacingLine(track) {
  let line = cache.get(track);
  if (!line) { line = new RacingLine(track); cache.set(track, line); }
  return line;
}

/** Forgets the cached line of a track (used when a track object is rebuilt). */
export function dropRacingLine(track) { cache.delete(track); }

export class RacingLine {
  /**
   * @param {object} track
   * @param {{spacing?: number, wallMargin?: number, voidMargin?: number, voidMarginFull?: number}} [opts] spacing = sample spacing in metres;
   *   wallMargin = how far (m) the line's centre stays away from a walled road edge; voidMargin = the same where the edge is a
   *   drop into the void (no wall to save a kart that runs wide, so the line keeps well clear); voidMarginFull = the same on a track that is void-edged over more than half its lap.
   */
  constructor(track, { spacing = 3, wallMargin = 3.6, voidMargin = 5.6, voidMarginFull = 7 } = {}) {
    this.length = track.length;
    const n = Math.max(24, Math.round(track.length / spacing));
    this.n = n;
    this.ds = track.length / n;
    this.wallMargin = wallMargin; this.voidMargin = voidMargin; this.voidMarginFull = voidMarginFull;
    const F = () => new Float32Array(n);
    this.cx = F(); this.cy = F(); this.cz = F();         // centreline position
    this.rx = F(); this.rz = F();                        // horizontal unit right vector
    this.half = F();                                     // half road width
    this.margin = F();                                   // how far the racing line's centre stays from the road edge (m)
    this.room = F();                                     // largest |lateral| (m) the driver may ever aim for (dodging, item boxes)
    this.bank = F();                                     // banking (rad)
    this.kap = F();                                      // smoothed centreline curvature (+ = right)
    this.off = F();                                      // optimal lateral offset at full racing-line strength
    this.lk = F();                                       // smoothed curvature of the full racing line
    this.straight = F();                                 // metres of near-straight road ahead of each sample
    this.pinW = F();                                     // 0..1: how strongly the line is pinned onto a jump ramp here (see _pinJumps)
    this.pinRoom = new Float32Array(n).fill(99);         // largest deviation (m) from the line a driver may take here (narrows towards a ramp's edges)
    this.voidShare = 0;                                  // 0..1: share of the lap with a void edge (set by _probeEdges)
    this.pins = [];                                      // [{s, lip, lateral}] jump ramps the line is pinned to (s = ramp start, metres)
    this.corners = [];                                   // [{start,end,sign,kMax,kMean,len,angle}]
    this.cornerAt = new Int16Array(n).fill(-1);          // corner index covering each sample (or -1)
    this._profiles = new Map();
    this._sampleCentre(track);
    this._computeKappa(this.cx, this.cz, this.kap);
    this._buildOffsets();
    this._applyBands(track);
    this._pinJumps(track);
    this._computeLineCurvature();
    this._findCorners();
    this._computeStraights();
  }

  // ---- lookups -----------------------------------------------------------------------------------------
  /** Fractional sample index of distance `s` (wrapped). */
  index(s) {
    let f = s / this.ds;
    f %= this.n; if (f < 0) f += this.n;
    return f;
  }

  /** Interpolates a per-sample array at distance `s`. */
  at(arr, s) {
    const f = this.index(s);
    const i = f | 0; const t = f - i;
    const j = i + 1 === this.n ? 0 : i + 1;
    return arr[i] + (arr[j] - arr[i]) * t;
  }

  /**
   * World position of the point `lateral` metres to the right of the centreline at distance `s`.
   * @param {number} s metres along the centreline
   * @param {number} lateral metres, + = right
   * @param {{x:number,y:number,z:number}} out
   */
  point(s, lateral, out) {
    const f = this.index(s);
    const i = f | 0; const t = f - i;
    const j = i + 1 === this.n ? 0 : i + 1;
    const rx = this.rx[i] + (this.rx[j] - this.rx[i]) * t;
    const rz = this.rz[i] + (this.rz[j] - this.rz[i]) * t;
    out.x = this.cx[i] + (this.cx[j] - this.cx[i]) * t + rx * lateral;
    out.y = this.cy[i] + (this.cy[j] - this.cy[i]) * t;
    out.z = this.cz[i] + (this.cz[j] - this.cz[i]) * t + rz * lateral;
    return out;
  }

  /** Largest |lateral| a kart centre should use at `s` (keeps the kart off the walls). */
  maxOffset(s) { return Math.max(0, this.at(this.half, s) - this.at(this.margin, s)); }

  // ---- speed profile -----------------------------------------------------------------------------------
  /**
   * Cornering speed profile along the line with the braking pass applied. The corner limit comes from the kart's
   * steering authority: holding curvature k at speed v needs a yaw rate v*k, and the kart can yaw at most
   * `turn * understeer(v)` rad/s (arcade physics: sliding costs no speed, only steering lock limits a corner).
   * @param {{turn:number, top:number, margin?:number, aBrake:number, vMin?:number, weight?:number}} p
   *   turn = yaw rate at full lock (rad/s); top = the kart's top speed (m/s, drives the understeer curve);
   *   margin = fraction of full lock the driver is willing to use; aBrake = braking deceleration planned for (m/s^2);
   *   vMin = floor for tight corners; weight = racing-line strength 0..1 (blends line and centreline curvature);
   *   under = fraction of the yaw rate the kart loses approaching top speed (kart type; default 0.28).
   * @returns {Float32Array} target speed per sample (m/s)
   */
  speedProfile({ turn, top, margin = 0.85, aBrake, vMin = 8, weight = 1, under = 0.28 }) {
    const key = `${turn.toFixed(2)}|${top.toFixed(1)}|${margin.toFixed(2)}|${aBrake.toFixed(1)}|${vMin.toFixed(1)}|${weight.toFixed(2)}|${under.toFixed(2)}`;
    const hit = this._profiles.get(key);
    if (hit) return hit;
    const { n, ds } = this;
    const v = new Float32Array(n);
    const authority = margin * turn;
    for (let i = 0; i < n; i++) {
      const k = Math.max(lerp(Math.abs(this.lk[i]), Math.abs(this.kap[i]), 1 - weight), 1e-3);
      let s = Math.min(80, authority / k);
      for (let it = 0; it < 3; it++) s = Math.min(80, (authority * (1 - under * smoothstep(0.55, 1.1, s / top))) / k);
      v[i] = Math.max(vMin, s);
    }
    // backward braking pass, twice around the loop so the wrap-around converges
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const nx = v[i + 1 === n ? 0 : i + 1];
        const lim = Math.sqrt(nx * nx + 2 * aBrake * ds);
        if (v[i] > lim) v[i] = lim;
      }
    }
    if (this._profiles.size > 64) this._profiles.clear();
    this._profiles.set(key, v);
    return v;
  }

  /** Index of the corner ahead of (or containing) fractional sample index `f` within `maxM` metres, else -1. */
  cornerAhead(s, maxM) {
    const n = this.n;
    const i0 = this.index(s) | 0;
    const steps = Math.min(n, Math.ceil(maxM / this.ds));
    for (let k = 0; k <= steps; k++) {
      const c = this.cornerAt[(i0 + k) % n];
      if (c >= 0) return c;
    }
    return -1;
  }

  // ---- construction ------------------------------------------------------------------------------------
  _sampleCentre(track) {
    const tmp = {};
    for (let i = 0; i < this.n; i++) {
      const sm = track.sample(i * this.ds, tmp);
      this.cx[i] = sm.pos.x; this.cy[i] = sm.pos.y; this.cz[i] = sm.pos.z;
      const rl = Math.hypot(sm.right.x, sm.right.z) || 1;
      this.rx[i] = sm.right.x / rl; this.rz[i] = sm.right.z / rl;
      this.half[i] = (sm.width ?? 18) / 2;
      this.bank[i] = sm.banking ?? 0;
    }
    this._probeEdges(track);
  }

  /** Sets `margin` / `room` per sample: samples whose road edge is a drop into the void keep the line (and any dodge) further from it. */
  _probeEdges(track) {
    const { n, ds } = this;
    const canProbe = typeof track.surfacePoint === 'function' && typeof track.query === 'function';
    const p = new THREE.Vector3(), q = { height: 0, normal: new THREE.Vector3(0, 1, 0), surface: 'road', onRoad: true, s: 0, lateral: 0, inVoid: false };
    let voided = 0;
    for (let i = 0; i < n; i++) {
      let edgeVoid = false;
      if (canProbe) {
        for (const side of [-1, 1]) {
          const lat = side * (this.half[i] + 1.2);
          track.surfacePoint(i * ds, lat, p);
          p.y += 0.5;
          if (track.query(p, q, i * ds).inVoid) edgeVoid = true;
        }
      }
      this.margin[i] = edgeVoid ? this.voidMargin : this.wallMargin;
      this.room[i] = this.half[i] - (edgeVoid ? 6 : 2.4);
      if (edgeVoid) voided++;
    }
    // a track that is void-edged nearly all the way round (no walls, nothing pushes back) keeps further off the edge than one with a short drop (Blighty's canal bridge)
    if (voided / n > 0.5) for (let i = 0; i < n; i++) if (this.margin[i] > this.wallMargin + 0.5) this.margin[i] = Math.max(this.voidMargin, this.voidMarginFull);
    this.voidShare = voided / n;                 // fraction of the lap whose road edge is a drop into the void (Marcoverse: nearly all)
  }

  /** Signed curvature (+ = right turn) of a closed polyline, lightly smoothed. */
  _computeKappa(xs, zs, out) {
    const { n, ds } = this;
    const yaw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n;
      yaw[i] = Math.atan2(xs[b] - xs[a], zs[b] - zs[a]);
    }
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n;
      raw[i] = -wrapAngle(yaw[b] - yaw[a]) / (2 * ds);
    }
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) sum += raw[(i + k + n) % n] * (3 - Math.abs(k));
      out[i] = sum / 9;
    }
  }

  /** Detects corners on the centreline and lays out an out-in-out lateral offset profile. */
  _buildOffsets() {
    const { n, ds, kap } = this;
    const thr = 1 / 150;
    const maxOff = (i) => { const k = ((i % n) + n) % n; return Math.max(0, this.half[k] - this.margin[k]); };
    // find a start index that is outside any corner so runs do not straddle the array end
    let start = 0;
    for (let i = 0; i < n; i++) if (Math.abs(kap[i]) < thr * 0.5) { start = i; break; }
    // runs of same-sign curvature
    const runs = [];
    let cur = null;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const sgn = Math.abs(kap[i]) > thr ? Math.sign(kap[i]) : 0;
      if (sgn !== 0 && (!cur || cur.sign !== sgn)) {
        if (cur) runs.push(cur);
        cur = { sign: sgn, a: start + k, b: start + k };
      } else if (sgn !== 0) cur.b = start + k;
      else if (cur && start + k - cur.b > Math.ceil(20 / ds)) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    // merge same-sign neighbours separated by short gaps
    const merged = [];
    for (const r of runs) {
      const p = merged[merged.length - 1];
      if (p && p.sign === r.sign && r.a - p.b <= Math.ceil(24 / ds)) p.b = r.b; else merged.push({ ...r });
    }
    // keys: [index (unwrapped, may exceed n), offset]
    const keys = [];
    for (const c of merged) {
      let angle = 0;
      for (let i = c.a; i <= c.b; i++) angle += Math.abs(kap[i % n]) * ds;
      if (angle < 0.22) continue;
      const lenM = (c.b - c.a) * ds;
      const apex = c.a + Math.round((c.b - c.a) * 0.55);
      const amp = clamp(angle / 0.7, 0.4, 1);
      const lead = Math.round(clamp(lenM * 0.4, 8, 34) / ds);
      const trail = Math.round(clamp(lenM * 0.5, 10, 44) / ds);
      const inside = c.sign;
      keys.push({ i: c.a - lead, v: -inside * amp * 0.9, kind: 'in', c });
      keys.push({ i: apex, v: inside * amp, kind: 'apex', c });
      keys.push({ i: c.b + trail, v: -inside * amp * 0.9, kind: 'out', c });
    }
    // conflicts: an exit key that runs into the next entry key -> drop both
    for (let k = 0; k < keys.length; k++) {
      const a = keys[k], b = keys[(k + 1) % keys.length];
      if (!a || !b || a.kind !== 'out' || b.kind !== 'in') continue;
      const gap = b.i + (k + 1 === keys.length ? n : 0) - a.i;
      if (gap < Math.ceil(10 / ds)) { a.drop = true; b.drop = true; }
    }
    const kept = keys.filter((k) => !k.drop).sort((p, q) => p.i - q.i);
    const off = this.off;
    if (kept.length === 0) off.fill(0);
    else if (kept.length === 1) off.fill(kept[0].v);
    else {
      // wrap keys into [0, n) and interpolate with smoothstep between successive keys (cyclic)
      const ks = kept.map((k) => ({ i: ((k.i % n) + n) % n, v: k.v })).sort((p, q) => p.i - q.i);
      const m = ks.length;
      let p = -1;                                   // last key with index <= idx (-1: wrapped, use the final key)
      for (let idx = 0; idx < n; idx++) {
        while (p + 1 < m && ks[p + 1].i <= idx) p++;
        const lo = p >= 0 ? ks[p] : ks[m - 1];
        const hi = p + 1 < m ? ks[p + 1] : ks[0];
        const loI = p >= 0 ? lo.i : lo.i - n;
        const hiI = p + 1 < m ? hi.i : hi.i + n;
        off[idx] = lerp(lo.v, hi.v, hiI === loI ? 0 : smoothstep(loI, hiI, idx));
      }
    }
    // scale to metres, smooth, clamp to the road
    const tmp = new Float32Array(n);
    for (let i = 0; i < n; i++) tmp[i] = off[i] * maxOff(i);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) off[i] = (tmp[(i + n - 1) % n] + 2 * tmp[i] + tmp[(i + 1) % n]) / 4;
      tmp.set(off);
    }
    for (let i = 0; i < n; i++) off[i] = clamp(off[i], -maxOff(i), maxOff(i));
  }

  /**
   * Track-declared lateral bands (`def.aiLine: [{ from, to, min?, max?, fade? }]`, s in the usual mark syntax): over [from, to] the racing line is held
   * inside [min, max] metres of the centreline (+ = right), easing in and out over `fade` metres on either side. For places where a lateral position
   * decides something the line cannot know about, e.g. which road of a fork a kart is on when the other road peels away from under it.
   */
  _applyBands(track) {
    const bands = track.def?.aiLine;
    if (!bands?.length || typeof track.S !== 'function') return;
    const { n, ds, off } = this, L = this.length;
    for (const b of bands) {
      const a = track.S(b.from), len = Math.max(0, loopDiff(a, track.S(b.to), L)), fade = Math.max(1, b.fade ?? 30);
      const lo = b.min ?? -Infinity, hi = b.max ?? Infinity;
      for (let i = 0; i < n; i++) {
        const d = loopDiff(a, i * ds, L), out = d < 0 ? -d : Math.max(0, d - len);
        const w = 1 - smoothstep(0, fade, out);
        if (w <= 0) continue;
        const room = Math.max(0, this.half[i] - this.margin[i]);
        off[i] = clamp(lerp(off[i], clamp(off[i], lo, hi), w), -room, room);
      }
    }
  }

  /**
   * Jump ramps that sit on the driving surface (`track.jumpRamps`, world-placed) pull the line onto the ramp centre: the kart has to hit
   * the ramp square, at speed, because whatever lies beyond the lip (a gap, void) does not forgive an out-in-out line that clips the
   * ramp's edge. The line eases onto the ramp over ~60 m, holds it to well past the landing, then eases back to the racing line.
   * Ramps that are not on the road (a shortcut ramp beside it) or do not face along it are ignored.
   */
  _pinJumps(track) {
    const { n, ds, half } = this;
    const IN0 = 95, IN1 = 35, HOLD = 45, OUT = 40;             // blend-in start / full start (m before the ramp), hold after the lip, blend-out length
    for (const r of track.jumpRamps ?? []) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const dx = r.x - this.cx[i], dz = r.z - this.cz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
      const lateral = (r.x - this.cx[bi]) * this.rx[bi] + (r.z - this.cz[bi]) * this.rz[bi];
      const roadYaw = Math.atan2(this.rz[bi], -this.rx[bi]);
      if (Math.abs(lateral) > 0.5 * half[bi] || Math.abs(wrapAngle(r.yaw - roadYaw)) > 0.35 || bd > 40 * 40) continue;
      const s0 = bi * ds;
      this.pins.push({ s: s0, lip: s0 + r.length, lateral });
      const corridor = Math.max(0.5, r.width / 2 - 3.2);       // kart radius plus a margin of error from the ramp's side edges
      for (let i = 0; i < n; i++) {
        let d = (i * ds - s0) % this.length; if (d < -this.length / 2) d += this.length; if (d > this.length / 2) d -= this.length;   // metres from the ramp start
        const w = d < 0 ? smoothstep(-IN0, -IN1, d) : 1 - smoothstep(r.length + HOLD, r.length + HOLD + OUT, d);
        if (w <= 0) continue;
        this.off[i] += (lateral - this.off[i]) * w;
        if (w > this.pinW[i]) this.pinW[i] = w;
        this.pinRoom[i] = Math.min(this.pinRoom[i], lerp(99, corridor, w));
      }
    }
  }

  _computeLineCurvature() {
    const { n } = this;
    const lx = new Float32Array(n), lz = new Float32Array(n);
    for (let i = 0; i < n; i++) { lx[i] = this.cx[i] + this.rx[i] * this.off[i]; lz[i] = this.cz[i] + this.rz[i] * this.off[i]; }
    this._computeKappa(lx, lz, this.lk);
  }

  _findCorners() {
    const { n, ds, lk } = this;
    const thr = 1 / 130;
    let i = 0;
    let first = 0;
    for (; first < n; first++) if (Math.abs(lk[first]) < thr * 0.5) break;
    if (first === n) first = 0;
    while (i < n) {
      const idx = (first + i) % n;
      if (Math.abs(lk[idx]) > thr) {
        const sign = Math.sign(lk[idx]);
        let j = i, kMax = 0, sum = 0, cnt = 0, gap = 0, last = i;
        while (j < n) {
          const jj = (first + j) % n;
          if (Math.abs(lk[jj]) > thr * 0.7 && Math.sign(lk[jj]) === sign) { last = j; gap = 0; kMax = Math.max(kMax, Math.abs(lk[jj])); sum += Math.abs(lk[jj]); cnt++; }
          else if (++gap > Math.ceil(12 / ds)) break;
          j++;
        }
        const len = (last - i + 1) * ds;
        const id = this.corners.length;
        const c = { start: (first + i) % n, end: (first + last) % n, sign, kMax, kMean: sum / Math.max(1, cnt), len, angle: (sum / Math.max(1, cnt)) * len };
        this.corners.push(c);
        for (let k = i; k <= last; k++) this.cornerAt[(first + k) % n] = id;
        i = last + 1;
      } else i++;
    }
  }

  _computeStraights() {
    const { n, ds, lk, straight } = this;
    const thr = 1 / 260;
    let run = 0;
    // two passes around the loop so the value wraps correctly
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        run = Math.abs(lk[i]) > thr ? 0 : run + ds;
        if (pass === 1) straight[i] = Math.min(run, this.length);
      }
    }
  }
}
