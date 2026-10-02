// Fork helpers shared by the Data Centre and Marcoverse: numbers only (no Track, no kit), so a def can place ramps, pads and walls on a
// fork's second road before dress(). The second road is a RibbonRoad (builders/branch.js); the spline stays the AI's line and the lap-credit line.
//
//   const F = chordRibbon(R, { s0: R.S('fk1a'), s1: R.S('fk1b'), prof: [[0, 0], [0.3, 6], [0.6, -6], [1, 0]], w: 17 });
//   F.rb            the RibbonRoad (platform)      F.at(u, q) point / heading u metres along it     F.frac(f) the same by fraction 0..1
//   mouthZones(R, F, { sides })     wall zones that open the spline's walls where the second road crosses them
//   edgeRacks(R, F, { ... })        capsules ([ax, az, bx, bz, r]) that wall the second road's edges, clear of the spline road
import { makeRibbon } from '../branch.js';

/**
 * A ribbon on the straight line between two road points (the spline is tangent to that line at both ends), weaving by `prof`.
 * @param {{ at:(s:number,lat?:number)=>object }} R @param {object} o
 * @param {number} o.s0 @param {number} o.s1 spline stations where the second road leaves and rejoins (centre line)
 * @param {Array<[number, number]>} o.prof [fraction 0..1 along the chord, lateral metres (+ right of the chord direction)]
 * @param {number} [o.w=17] width @param {number|((f:number)=>number)} [o.y] height (default: the spline's)
 */
export function chordRibbon(R, { s0, s1, prof, w = 17, y = null, step = 3 }) {
  const A = R.at(s0), B = R.at(s1), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, rx = -uz, rz = ux;
  const ctrl = prof.map(([f, l]) => ({ x: A.x + dx * f + rx * l, z: A.z + dz * f + rz * l, y: typeof y === 'function' ? y(f) : (y ?? A.y + (B.y - A.y) * f), w: typeof w === 'function' ? w(f) : w }));
  const rb = makeRibbon({ pts: ctrl, step });
  const q = {};
  return { rb, ctrl, A, B, chord: L, s0, s1, at: (u, out = q) => rb.at(u, out), frac: (f, out = {}) => rb.at(rb.total * f, out), total: rb.total, w };
}

/** Nearest spline station of a world point near `sHint`: { lat (+ right), s, d }. */
export function makeLateral(cl) {
  return (x, z, sHint, win = 60) => {
    let best = 1e18, bi = 0;
    const N = cl.N, i0 = Math.round(sHint / cl.ds);
    for (let k = -win; k <= win; k++) {
      const i = (((i0 + k) % N) + N) % N, dx = x - cl.x[i], dz = z - cl.z[i], d = dx * dx + dz * dz;
      if (d < best) { best = d; bi = i; }
    }
    return { lat: -(x - cl.x[bi]) * cl.tz[bi] + (z - cl.z[bi]) * cl.tx[bi], s: bi * cl.ds, d: Math.sqrt(best) };
  };
}

/**
 * Wall zones that open the spline's walls where the second road passes through them (and a little way beyond).
 * @param {{ at:Function }} R @param {{ rb: import('../branch.js').RibbonRoad, s0:number, s1:number }} F
 * @param {{ wallLat?: number, margin?: number, pad?: number, wall?: string }} [o]
 * @returns {Array<{ from:number, to:number, side:'left'|'right', wall:string }>}
 */
export function mouthZones(R, F, { wallLat = 11.2, margin = 2.4, pad = 2.5, wall = 'none' } = {}) {
  const out = [];
  for (const sg of [-1, 1]) {
    let a = null, last = null;
    const flush = () => { if (a !== null) out.push({ from: a - pad, to: last + pad, side: sg < 0 ? 'left' : 'right', wall }); a = null; };
    for (let s = F.s0 - 60; s <= F.s1 + 60; s += 1) {
      const p = R.at(s, sg * wallLat);
      if (F.rb.edgeDistance(p.x, p.z) < margin) { if (a === null) a = s; last = s; } else if (a !== null && s - last > 6) flush();
    }
    flush();
  }
  return out;
}

/**
 * Capsules walling both edges of the second road. A point is kept only where it is clear of the spline's own road and wall line
 * (|lateral to the nearest spline station| >= minLat), so the mouths stay open and the island between the two roads is closed.
 * @returns {Array<[number, number, number, number, number]>} [ax, az, bx, bz, r]
 */
export function edgeRacks(R, F, { offset = null, minLat = 12.8, r = 1.0, every = 3, skip = () => false } = {}) {
  const lat = makeLateral(R.cl), off = offset ?? F.w / 2 + 0.9, caps = [], q = {};
  for (const sg of [-1, 1]) {
    let prev = null;
    for (let u = 0; u <= F.rb.total + 1e-6; u += every) {
      const p = F.rb.at(u, q), x = p.x + p.rx * sg * off, z = p.z + p.rz * sg * off;
      const hint = F.s0 + (F.s1 - F.s0) * (u / F.rb.total), l = lat(x, z, hint), ok = Math.abs(l.lat) >= minLat && !skip(u, sg, x, z);
      const cur = ok ? [x, z] : null;
      if (prev && cur) caps.push([prev[0], prev[1], cur[0], cur[1], r]);
      prev = cur;
    }
  }
  return caps;
}
