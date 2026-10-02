// Marcoverse forks: two places where the ribbon splits into two full-width roads that rejoin (builders/branch.js ribbons over the void).
//
//   FORK 1  THE PLUNGE: the main road dives 20 m into the valley and climbs back out (gravity lens, boost pads on the climb); the VIADUCT stays
//           at 40 m, a flat, wide skyway that peels away east before the dive, sweeps back over the valley floor (20 m above the road below:
//           the crossover) and rejoins at the crest. Longer, but flat out, and two boost pads.
//   FORK 2  THE TUBE: the main road goes through the glass security tube (gates, tight to the wall of light); the SKYLINE swings east of it,
//           open air, wide, with two boost pads.
//
// Pure numbers first (mvForkSpecs: no Track needed, so the def can put pads on the second roads), then the physics (installMvForks, headless
// safe) and the dressing (neon lips, light curtain, dark soffit, hoops). The AI keeps to the spline; ProgressTracker credits either route.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { chordRibbon } from '../forkRoute.js';
import { padMaterial } from '../hazards/signs.js';
import { PALETTE } from './palette.js';
import { neonAt, hot } from './util.js';

const FLAT = { lip: false, startBevel: 0.25, endBevel: 0.25, sideBevel: 0.15, curve: 1 };

/** Profile of each second road: [fraction along the chord, lateral metres (+ right of travel)]. Fork 1 heads south (right = west), fork 2 north (right = east). */
const PROF = {
  viaduct: [[0, 0], [0.1, 0], [0.3, -14], [0.58, 0], [0.76, 14], [0.86, 6], [0.94, 0], [1, 0]],
  skyline: [[0, 0], [0.07, 0], [0.33, 24], [0.67, 24], [0.93, 0], [1, 0]],
};

/**
 * Viaduct height at each control fraction of PROF.viaduct: flat at 40 m over the valley, then it comes down to meet the climbing road and runs on it
 * (never below it, so a kart on the road under the viaduct is never pulled up onto a ribbon that is lower than its own surface).
 */
const VIA_Y = [40, 40, 40, 40, 39.5, 35.4, 37.1, 40];
const VIA_F = [0, 0.1, 0.3, 0.58, 0.76, 0.86, 0.94, 1];
const viaY = (f) => { const i = VIA_F.findIndex((v) => Math.abs(v - f) < 1e-9); return i >= 0 ? VIA_Y[i] : 40; };

/** @param {{ at:Function, S:Function }} R the route (makeRoute) */
export function mvForkSpecs(R) {
  const S = R.S, ramps = [], q = {};
  const PAD = padMaterial(PALETTE.cyan);
  const pad = (id, F, f, { w = 8, len = 12, lat = 0 } = {}) => {
    const p = F.rb.at(F.rb.total * f, q), x = p.x + p.rx * lat, z = p.z + p.rz * lat;
    ramps.push({ id, kind: 'pad', surface: 'boost', road: true, x, z, yaw: p.yaw, length: len, width: w, y0: p.y + 0.04, y1: p.y + 0.04, material: PAD, ...FLAT });
  };
  const viaduct = chordRibbon(R, { s0: S('t1', 10), s1: S('crest'), prof: PROF.viaduct, w: 20, y: (f) => viaY(f) });
  viaduct.rb.sideBevel = 0.2;                                                  // a hard edge: the soft default would draw a skirt down to the road 20 m below
  pad('via-boost2', viaduct, 0.16, { w: 7 });
  pad('via-boost0', viaduct, 0.4, { w: 7 });
  pad('via-boost1', viaduct, 0.85, { w: 7 });
  const skyline = chordRibbon(R, { s0: S('h2'), s1: S('tube'), prof: PROF.skyline, w: 20 });
  skyline.rb.sideBevel = 0.2;
  pad('sky-boost0', skyline, 0.22, { w: 7 });
  const forks = [
    { id: 'viaduct', name: 'Dive or viaduct', from: '@t1+10', to: '@crest', alt: 'viaduct', F: viaduct, hue: PALETTE.yellow },
    { id: 'skyline', name: 'Tube or skyline', from: '@h2', to: '@tube', alt: 'skyline', F: skyline, hue: PALETTE.mint },
  ];
  return { forks, ramps, viaduct, skyline };
}

/**
 * Platforms are not layer aware: one that covers a point wins whatever height the kart is at. The viaduct crosses 20 m above the road of the
 * Plunge, so its deck and pads must only count for a kart that is at (or above) their height; a kart on the road underneath keeps the road.
 * `Q.y` is the height of the point being asked about (set by a thin wrapper round the model's ground query).
 */
const Q = { y: 0 };
const OVER_TOL = 0.8;
function layerAware(model, pfs) {
  if (!model._layerAwareGround) {
    const ground = model.ground;
    model._layerAwareGround = true;
    model.ground = function (x, y, z, P, out, noPlatforms) { Q.y = y; return ground.call(this, x, y, z, P, out, noPlatforms); };
  }
  for (const pf of pfs) {
    const ev = pf.evaluate;
    // The deck height decides, not the blended edge height: a soft edge (bevel) falls from the deck to the road beneath, and a kart on that road
    // would otherwise meet a steep skirt on its way under the viaduct.
    const deck = pf.branch
      ? (self) => { const r = self._r, i = Math.min(r.i, self.n - 2), t = Math.min(1, Math.max(0, r.u / self.SL[i])); return self.Y[i] + (self.Y[i + 1] - self.Y[i]) * t; }
      : (self) => Math.max(self.y0, self.y1);
    pf.evaluate = function (x, z, hBase, o) { return ev.call(this, x, z, hBase, o) && !(deck(this) > Q.y + OVER_TOL); };
  }
}

/** Register the second roads (physics, headless-safe). `road` is unused here: the deck surface is drawn by dressMvForks. */
export function installMvForks(kit, { FK }) {
  const model = kit.track.model, ribbons = (kit.track.ribbons ??= []);
  for (const f of FK.forks) {
    const rb = f.F.rb;
    rb.def = { id: f.alt, ribbon: true, name: f.name };
    model.platforms.unshift(rb);                                  // underneath every other platform (pads and kickers placed on it still show)
    ribbons.push(rb);
  }
  const ids = new Set(FK.ramps.filter((r) => r.id.startsWith('via-')).map((r) => r.id));
  layerAware(model, [FK.viaduct.rb, ...model.platforms.filter((p) => p.def && ids.has(p.def.id))]);
}

const _c = new THREE.Color();
/** Dress one second road: dark soffit under the deck, raised neon lips, a light curtain hanging off both edges, spill over the void, hoops. */
export function dressMvForks(kit, { FK, M, road }) {
  const L = kit.track.length;
  for (const f of FK.forks) {
    const rb = f.F.rb, n = rb.n, hue = new THREE.Color(f.hue);
    const sOf = (i) => f.F.s0 + ((f.F.s1 - f.F.s0) * rb.cum[i]) / rb.total;
    const soffit = new Geo(), lip = new Geo(), halo = new Geo();
    const frame = (i) => {
      const a = i > 0 ? i - 1 : 0, b = i < n - 1 ? i : n - 2;
      let tx = rb.TX[a] + rb.TX[b], tz = rb.TZ[a] + rb.TZ[b]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      return { rx: -tz, rz: tx, hw: rb.W[i] / 2, y: rb.Y[i], x: rb.X[i], z: rb.Z[i], tb: rb.B[i] };
    };
    // the deck surface itself (a flat strip with the road texture; the soft-edged ribbon mesh would hang a skirt down to whatever is below)
    if (road) {
      const top = new Geo(); let pv = null;
      for (let i = 0; i < n; i++) {
        const F = frame(i), v = [-1, 0, 1].map((k) => { const dv = k * F.hw; return top.vert(F.x + F.rx * dv, F.y - dv * F.tb + 0.02, F.z + F.rz * dv, 0, 1, 0, (k + 1) / 2, rb.cum[i] / 18, 1, 1, 1); });
        if (pv) for (let k = 0; k < 2; k++) top.quadN(pv[k], pv[k + 1], v[k + 1], v[k]);   // (winding checked below: faces up)
        pv = v;
      }
      const tm = new THREE.Mesh(top.build(), road); tm.name = `${f.id}-deck`; tm.receiveShadow = true; kit.add(tm);
    }
    // soffit: a shallow dark hull under the deck (the surface alone is single sided and would vanish from below)
    const SOF = [[-1, -0.1], [-0.85, -1.25], [0.85, -1.25], [1, -0.1]];                      // [fraction of the half width, metres below the surface]
    let prev = null;
    for (let i = 0; i < n; i++) {
      const F = frame(i), row = SOF.map(([k, dy]) => { const dv = k * F.hw; return soffit.vert(F.x + F.rx * dv, F.y - dv * F.tb + dy, F.z + F.rz * dv, 0, -1, 0, 0, 0, 0.1, 0.12, 0.3); });
      if (prev) for (let k = 0; k < row.length - 1; k++) soffit.quadN(prev[k], prev[k + 1], row[k + 1], row[k]);
      prev = row;
    }
    // lips + spill + curtain, both sides
    const LIP = [[-0.95, 0.0, 0.7], [-0.95, 0.2, 1.7], [-0.15, 0.24, 3.4], [0.14, 0.06, 2.4], [0.14, -0.4, 1.0]];
    const SPILL = [[0.15, 0.02, 0.55], [1.1, -0.05, 0.28], [3.2, -0.35, 0.08], [5.6, -0.7, 0]];
    const CURT = [[0.18, -0.3, 0.5], [0.5, -2.6, 0.2], [1.5, -7.5, 0]];
    const strip = (g, side, prof) => {
      let pr = null;
      for (let i = 0; i < n; i++) {
        const F = frame(i); neonAt(sOf(i), L, _c, 1).lerp(hue, 0.7);
        const rows = [];
        for (let k = 0; k < prof.length - 1; k++) {
          const pair = [], [o0, u0] = prof[k], [o1, u1] = prof[k + 1];
          const nOut = -(u1 - u0), nUp = o1 - o0, nl = Math.hypot(nOut, nUp) || 1;
          for (const j of [k, k + 1]) {
            const [o, u, br] = prof[j], dv = side * (F.hw + o);
            pair.push(g.vert(F.x + F.rx * dv, F.y - dv * F.tb + u, F.z + F.rz * dv, F.rx * side * nOut / nl, nUp / nl, F.rz * side * nOut / nl, 0, 0, _c.r * br, _c.g * br, _c.b * br));
          }
          rows.push(pair);
        }
        if (pr) for (let k = 0; k < rows.length; k++) g.quadN(pr[k][0], pr[k][1], rows[k][1], rows[k][0]);
        pr = rows;
      }
    };
    for (const side of [-1, 1]) { strip(lip, side, LIP); strip(halo, side, SPILL); strip(halo, side, CURT); }
    const place = (g, mat, name) => { const m = new THREE.Mesh(g.build(), mat); m.name = `${f.id}-${name}`; m.frustumCulled = true; kit.add(m); return m; };
    place(soffit, M.dark, 'soffit'); place(lip, M.glow, 'lip'); place(halo, M.add, 'halo').renderOrder = 2;
    // hoops standing on the deck (mouths and middle): a thin neon ring each, plus rim lamps
    const hoops = new Geo(), tor = new THREE.TorusGeometry(10.8, 0.3, 6, 36, Math.PI), q = {};
    const M4 = new THREE.Matrix4(), B4 = new THREE.Matrix4();
    for (const u of [0.14, 0.3, 0.5, 0.7, 0.86].map((k) => rb.total * k)) {
      const p = rb.at(u, q), yaw = p.yaw;
      B4.makeRotationY(yaw); B4.setPosition(p.x, p.y + 0.2, p.z);
      M4.copy(B4).multiply(new THREE.Matrix4().makeRotationX(0));
      hoops.geometry(tor, { matrix: M4, colour: hot(f.hue, 2.2), ao: 0 });
    }
    place(hoops, M.glow, 'hoops');
  }
}
