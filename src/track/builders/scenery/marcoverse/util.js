// Small helpers shared by the Marcoverse dressing modules: the neon colour cycle, gap ranges, road frames and a "keep away from the road" index.
import * as THREE from 'three';
import { PALETTE, SECTORS } from './palette.js';

const SEC = SECTORS.map((q) => ({ s: q.s, c: new THREE.Color(q.hex) }));
const _a = new THREE.Color(), _b = new THREE.Color(), HALF = 32;

/** Sector neon at lap position s (each stretch of the ribbon has its own colour, blended over 64 m). Writes to and returns `out`. */
export function neonAt(s, L, out = new THREE.Color(), k = 1) {
  s = ((s % L) + L) % L;
  let i = 0; for (let j = 0; j < SEC.length; j++) if (SEC[j].s <= s) i = j;
  const prev = SEC[(i + SEC.length - 1) % SEC.length], cur = SEC[i], next = SEC[(i + 1) % SEC.length];
  out.copy(cur.c);
  const d0 = s - cur.s;                                        // metres past this sector's start
  if (d0 < HALF) { const f = 0.5 + 0.5 * (d0 / HALF); out.copy(prev.c).lerp(cur.c, f * f * (3 - 2 * f)); }
  else { const d1 = (next.s > cur.s ? next.s : next.s + L) - s; if (d1 < HALF) { const f = 0.5 - 0.5 * (d1 / HALF); out.copy(cur.c).lerp(next.c, f * f * (3 - 2 * f)); } }
  // equalise perceived brightness: cyan is twice as luminous as violet and would flood the bloom pass at the same multiplier
  const lum = 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b;
  void _a; void _b;
  return out.multiplyScalar(k * Math.min(1.7, Math.max(0.5, 0.3 / Math.max(lum, 1e-3))));
}

/** Runs of consecutive gap stations as [s0, s1] pairs (metres). */
export function gapRuns(track) {
  const F = track.model.F.gap, N = track.model.N, ds = track.model.ds, runs = [];
  let start = -1;
  for (let i = 0; i <= N; i++) {
    const g = i < N && F[i];
    if (g && start < 0) start = i;
    if (!g && start >= 0) { runs.push([start * ds, i * ds]); start = -1; }
  }
  return runs;
}

/** The lap split into road pieces between the gaps: [[a, b], ...] with b > a (b may exceed the lap length when a piece wraps the line). */
export function roadPieces(track, margin = 0.6) {
  const L = track.length, runs = gapRuns(track);
  if (!runs.length) return [[0, L]];
  const out = [];
  for (let k = 0; k < runs.length; k++) {
    const a = runs[k][1] + margin; let b = runs[(k + 1) % runs.length][0] - margin; if (b <= a) b += L;
    out.push([a, b]);
  }
  return out;
}

/** True when the station containing s is a gap. */
export const isGap = (track, s) => { const m = track.model, i = Math.floor((((s % track.length) + track.length) % track.length) / m.ds) % m.N; return !!(m.F.gap[i] | m.F.gap[(i + 1) % m.N]); };

const _sm = {};
/** Matrix placing local +X = road right (banked), +Y = road up, +Z = travel direction at s, origin `lift` metres above the centreline. */
export function frameMatrix(track, s, lift = 0, out = new THREE.Matrix4(), lat = 0) {
  const sm = track.sample(s, _sm), f = sm.tangent, up = sm.up;
  const r = new THREE.Vector3().crossVectors(up, f).normalize(), u2 = new THREE.Vector3().crossVectors(f, r);
  out.makeBasis(r, u2, f);
  const p = new THREE.Vector3(); track.surfacePoint(s, lat, p); p.addScaledVector(u2, lift);
  return out.setPosition(p);
}

/**
 * Index of the road (a coarse 3D hash of centreline points) so scenery bodies can keep clear of it.
 * @returns {(x:number, y:number, z:number, r:number) => boolean} true when (x, y, z) is within r metres of the centreline
 */
export function roadIndex(track, spacing = 12, cell = 80) {
  const map = new Map(), v = new THREE.Vector3(), key = (i, j, k) => `${i}|${j}|${k}`;
  for (let s = 0; s < track.length; s += spacing) {
    track.surfacePoint(s, 0, v);
    const k = key(Math.floor(v.x / cell), Math.floor(v.y / cell), Math.floor(v.z / cell));
    let a = map.get(k); if (!a) map.set(k, a = []); a.push(v.x, v.y, v.z);
  }
  return (x, y, z, r) => {
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell), ck = Math.floor(z / cell), r2 = r * r, n = Math.ceil(r / cell);
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (let k = ck - n; k <= ck + n; k++) {
      const a = map.get(key(i, j, k)); if (!a) continue;
      for (let q = 0; q < a.length; q += 3) { const dx = a[q] - x, dy = a[q + 1] - y, dz = a[q + 2] - z; if (dx * dx + dy * dy + dz * dz < r2) return true; }
    }
    return false;
  };
}

/** Vertex colour as a THREE.Color scaled above 1 (bloom) - Geo accepts Color objects. */
export const hot = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

const _ax = new THREE.Vector3(), _u1 = new THREE.Vector3(), _u2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/**
 * Open tapered cylinder from a to b (light shafts, comet tails) with vertex colours fading from c0 (at a) to c1 (at b). Use an additive material.
 * @param {import('../../Geo.js').Geo} g @param {number[]} a @param {number[]} b @param {number} r0 radius at a @param {number} r1 radius at b
 */
export function lightShaft(g, a, b, r0, r1, c0, c1, seg = 10) {
  _ax.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _ax.length(); if (len < 1e-6) return;
  _ax.multiplyScalar(1 / len);
  _u1.crossVectors(Math.abs(_ax.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : _up, _ax).normalize(); _u2.crossVectors(_ax, _u1);
  const base = g.vertexCount;
  for (let k = 0; k <= seg; k++) {
    const t = (k / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const dx = _u1.x * c + _u2.x * s, dy = _u1.y * c + _u2.y * s, dz = _u1.z * c + _u2.z * s;
    g.vert(a[0] + dx * r0, a[1] + dy * r0, a[2] + dz * r0, dx, dy, dz, k / seg, 0, c0.r, c0.g, c0.b);
    g.vert(b[0] + dx * r1, b[1] + dy * r1, b[2] + dz * r1, dx, dy, dz, k / seg, 1, c1.r, c1.g, c1.b);
  }
  for (let k = 0; k < seg; k++) { const i = base + k * 2; g.tri(i, i + 1, i + 3); g.tri(i, i + 3, i + 2); }
}
