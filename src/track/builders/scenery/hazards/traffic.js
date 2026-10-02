// Along-road traffic that Marco can jump off: slow vehicles driving the same way as the race, every one registered as rampable.
//
//   addTraffic(kit, G, { id, kind, from: '@a', to: '@b', lat: 4.5, speed: 8, geo: busGeo(), length: 11, width: 2.6, height: 3.1, ramp: 'ramp' })
//
// builds the polyline along the track's own spline (so the vehicle follows the bends), creates the moving obstacle (bump hit: side and
// slow hits still bump), merges a hazard-striped tail ramp (or a chevron bumper on small vehicles) into the body mesh and registers it with
// installVehicleRamps (rampVehicle.js). Vehicles are 'cross' mode paths: they drive once from `from` to `to`, wait out of sight, repeat.
// Everything is a pure function of the track clock and works headless (meshes skipped). Crossing vehicles (side-on) are NOT rampable.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { installVehicleRamps, rearRampGeo, chevronBumperGeo } from './rampVehicle.js';

const wheels = (g, W, zs, r = 0.5, y = r) => { for (const z of zs) for (const sx of [-1, 1]) g.cyl(r, r, 0.34, 10, { x: sx * (W / 2 - 0.05), y, z, rz: Math.PI / 2, colour: 0x101114, ao: 0 }); };

// ------------------------------------------------------------------------------------------------------------------ bodies (local frame: origin on the ground under the centre, +Z forward)
/** Rio city bus (ônibus): cream and green with a destination board. 11 x 2.6 x 3.1 m. */
export function cityBusGeo({ body = 0xf3efe0, stripe = 0x1f9d4c, accent = 0xffd166 } = {}) {
  const g = new Geo(), L = 11, W = 2.6;
  g.box(W, 2.3, L, { y: 0.6, colour: body, ao: 0.2, top: 0xe8e4d4 });
  g.box(W + 0.04, 0.5, L + 0.02, { y: 1.15, colour: stripe, ao: 0 });
  g.box(W + 0.04, 0.3, L + 0.02, { y: 1.75, colour: accent, ao: 0 });
  g.box(W - 0.1, 0.9, L - 1.2, { y: 2.0, z: -0.3, colour: 0x2b3a4a, ao: 0 });                       // window band
  g.box(W - 0.3, 0.45, 0.08, { y: 2.55, z: L / 2 + 0.03, colour: 0x111114, ao: 0 });               // destination board
  g.box(W - 0.4, 0.5, 0.06, { y: 1.9, z: L / 2 + 0.03, colour: 0x2b3a4a, ao: 0 });
  g.box(W - 0.5, 0.18, 0.1, { y: 0.55, z: L / 2 + 0.04, colour: 0xfff0c0, ao: 0 });
  wheels(g, W, [-3.6, 3.4], 0.52);
  return g;
}

/** Kombi: the splitter-window VW-style camper, pastel two-tone. 4.2 x 1.8 x 2.0 m. */
export function kombiGeo({ lower = 0x2ec4b6, upper = 0xf5f2e8 } = {}) {
  const g = new Geo(), W = 1.8;
  g.box(W, 0.95, 4.2, { y: 0.32, colour: lower, ao: 0.25 });
  g.box(W - 0.04, 0.9, 4.0, { y: 1.25, colour: upper, ao: 0.2, top: 0xffffff });
  g.box(W - 0.1, 0.45, 3.2, { y: 1.5, z: -0.15, colour: 0x2b3a4a, ao: 0 });
  g.box(W - 0.3, 0.3, 0.06, { y: 1.5, z: 2.03, colour: 0x2b3a4a, ao: 0 });
  g.cyl(0.16, 0.16, 0.06, 8, { x: -0.55, y: 0.75, z: 2.12, rx: Math.PI / 2, colour: 0xfff0c0, ao: 0 }); g.cyl(0.16, 0.16, 0.06, 8, { x: 0.55, y: 0.75, z: 2.12, rx: Math.PI / 2, colour: 0xfff0c0, ao: 0 });
  wheels(g, W, [-1.35, 1.35], 0.36);
  return g;
}

/** Trio elétrico: a flatbed parade truck, low and wide with a speaker stack at the FRONT (nothing tall over the centre line at the back). 12 x 3 x 3 m. */
export function trioGeo(a = 0xe63946, b = 0x2ec4b6, c = 0xffd166) {
  const g = new Geo(), L = 12, W = 3.0;
  g.box(W, 0.9, L, { y: 0.45, colour: 0x2a2f3a, ao: 0.3 });
  g.box(W + 0.5, 0.3, L + 0.2, { y: 1.3, colour: a, ao: 0.1, top: c });                          // stage deck
  for (let i = 0; i < 8; i++) g.box(W + 0.6, 0.45, 1.3, { y: 0.88, z: -5.2 + i * 1.5, colour: i % 2 ? b : c, ao: 0 });
  g.box(W - 0.3, 1.5, 2.2, { y: 1.6, z: 4.6, colour: 0x17171b, ao: 0.2 });                        // speaker stack
  for (const x of [-0.7, 0.7]) { g.cyl(0.5, 0.5, 0.1, 10, { x, y: 2.5, z: 5.72, rx: Math.PI / 2, colour: 0x444a55, ao: 0 }); g.cyl(0.3, 0.3, 0.1, 10, { x, y: 1.9, z: 5.72, rx: Math.PI / 2, colour: 0x444a55, ao: 0 }); }
  for (const x of [-1.4, 1.4]) for (let k = 0; k < 4; k++) g.beam([x, 1.6, -4.8 + k * 1.1], [x + Math.sign(x) * 0.3, 3.1 + (k % 2) * 0.35, -4.8 + k * 1.1], 0.16, 4, { colour: [c, a, b, 0xf15bb5][k], rTop: 0.03 });   // side plumes
  g.box(W + 0.5, 0.1, 0.12, { y: 1.62, z: -L / 2 - 0.05, colour: b, ao: 0 });
  wheels(g, W, [-4.2, 3.6], 0.62);
  return g;
}

/** Brewery-style delivery lorry (Blighty). 8 x 2.5 x 3.3 m. */
export function lorryGeo({ cab = 0x2f6f3a, box = 0xf5f1e6, band = 0xd22f27 } = {}) {
  const g = new Geo(), W = 2.5;
  g.box(W, 2.7, 5.6, { y: 0.75, z: -1.2, colour: box, ao: 0.2, top: 0xffffff });
  g.box(W + 0.04, 0.5, 5.62, { y: 1.5, z: -1.2, colour: band, ao: 0 });
  g.box(W - 0.1, 1.9, 2.0, { y: 0.75, z: 2.8, colour: cab, ao: 0.2 });
  g.box(W - 0.3, 0.7, 0.06, { y: 1.9, z: 3.81, colour: 0x2b3a4a, ao: 0 });
  g.box(W, 0.35, 8.0, { y: 0.4, colour: 0x1a1a1e, ao: 0 });
  wheels(g, W, [-3.0, -1.4, 2.8], 0.55);
  return g;
}

/** Milk float: tiny, slow, a crate-stacked electric cart. 4.2 x 1.7 x 1.8 m. */
export function milkFloatGeo() {
  const g = new Geo(), W = 1.7;
  g.box(W, 0.55, 4.2, { y: 0.35, colour: 0xf2f1ea, ao: 0.25 });
  g.box(W - 0.1, 0.9, 1.0, { y: 0.9, z: 1.4, colour: 0xf2f1ea, ao: 0.2 });
  g.box(W - 0.2, 0.4, 0.06, { y: 1.35, z: 1.93, colour: 0x2b3a4a, ao: 0 });
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) g.box(0.5, 0.45, 0.5, { x: -0.45 + k * 0.9, y: 0.9, z: -1.4 + i * 0.7, colour: k ? 0x2d5fa8 : 0xd22f27, ao: 0.1 });
  g.box(W + 0.02, 0.2, 4.22, { y: 0.55, colour: 0x2d5fa8, ao: 0 });
  wheels(g, W, [-1.3, 1.3], 0.34);
  return g;
}

/** Black cab with its roof light, now with a chevron bumper where the ramp would be too big. 4.7 x 1.9 x 1.9 m (cabGeo in bl/setpieces.js is the same body). */
export function taxiGeo() {
  const g = new Geo();
  g.box(1.9, 0.9, 4.7, { y: 0.35, colour: 0x15161b, ao: 0.2 });
  g.box(1.8, 0.85, 2.6, { y: 1.22, z: -0.5, colour: 0x15161b, ao: 0.2, top: 0x1c1d24 });
  g.box(1.82, 0.5, 2.4, { y: 1.42, z: -0.5, colour: 0x2b3a4a, ao: 0 });
  g.box(0.5, 0.2, 0.26, { y: 2.1, z: 0.2, colour: 0xffe9a6, ao: 0 });
  wheels(g, 1.9, [-1.5, 1.5], 0.36);
  g.box(1.5, 0.12, 0.05, { y: 0.75, z: 2.36, colour: 0xfff0c0, ao: 0 });
  return g;
}

// ------------------------------------------------------------------------------------------------------------------ the helper
/**
 * @param {object} kit @param {{ at:(s:number|string, lat?:number)=>{x:number,z:number}, S:(v:number|string)=>number }} G routeGeom of the track
 * @param {object} o
 * @param {string} o.id  @param {string} [o.kind='bus']  @param {number|string} o.from  @param {number|string} o.to  route along the spline
 * @param {number} [o.lat=0] lane (m, + = right)  @param {number} o.speed m/s  @param {number} [o.phase=0] s offset into the cycle  @param {number} [o.wait=5]
 * @param {Geo|(()=>Geo)} o.geo body  @param {number} o.length @param {number} o.width @param {number} o.height visible body size in metres
 * @param {THREE.Material} [o.material] default vertex-colour material  @param {number} [o.radius] collision circle radius
 * @param {number} [o.merge=0] metres over which the vehicle enters / leaves the lane from the side (hides the spawn); o.side = +1 right / -1 left, o.off = lateral start offset
 * @param {object} [o.ribbon] a RibbonRoad (builders/branch.js): drive along it instead of the spline, from o.u0 to o.u1 metres (lat = metres right of its centre line)
 * @param {boolean} [o.separateRamp=false] keep the body as its own textured mesh (o.material) and add the ramp / bumper as a child mesh with the plain vertex-colour material
 * @param {'ramp'|'chevron'|false} [o.ramp='ramp'] visual cue: striped tail ramp, chevron bumper or nothing (still rampable)
 * @param {number} [o.run=6] tail ramp length @param {number} [o.rise=0.9] ramp height at the body @param {number} [o.every=12] polyline spacing (m)
 * @returns {{ path: object, rec: object }}
 */
export function addTraffic(kit, G, o) {
  const rbn = o.ribbon;
  const a = rbn ? o.u0 : G.S(o.from); let b = rbn ? o.u1 : G.S(o.to); if (!rbn && b < a) b += kit.track.length;
  const pts = [], lat = o.lat ?? 0, L = kit.track.length, m = o.merge ?? 0, side = o.side ?? (lat >= 0 ? 1 : -1);
  const P = rbn ? (u, l) => { const p = rbn.at(u, {}); pts.push([p.x + p.rx * l, p.z + p.rz * l]); } : (s, l) => { const p = G.at(((s % L) + L) % L, l); pts.push([p.x, p.z]); };
  if (m > 0) P(a, lat + side * (o.off ?? 17));                           // drive out of a side street / alley onto the lane ...
  for (let s = a + (m > 0 ? m : 0); s < b - (m > 0 ? m : 0); s += o.every ?? 12) P(s, lat);
  P(b - (m > 0 ? m : 0), lat);
  if (m > 0) P(b, lat + side * (o.off ?? 17));                           // ... and off again at the end, so nothing pops in or out in the middle of the road
  const head = kit.headless, run = o.run ?? 6;
  let mesh;
  if (!head) {
    const geo = typeof o.geo === 'function' ? o.geo() : o.geo, kindRamp = o.ramp ?? 'ramp';
    const cue = kindRamp === 'ramp' ? rearRampGeo({ width: o.width + 0.7, rear: -o.length / 2, run, rise: o.rise ?? 0.9 }) : kindRamp === 'chevron' ? chevronBumperGeo({ width: o.width + 0.1, z: -o.length / 2 - 0.08, y: 0.32, height: 0.36 }) : null;
    const plain = (kit._trafficMat ??= kit.mat.vertex({ roughness: 0.6 }, 'traffic'));
    if (o.separateRamp) {
      const built = geo.build(), cueGeo = cue?.build();
      mesh = () => { const grp = new THREE.Group(), m = new THREE.Mesh(built, o.material ?? plain); m.castShadow = true; grp.add(m); if (cueGeo) { const c = new THREE.Mesh(cueGeo, plain); c.castShadow = true; grp.add(c); } grp.name = o.id; return grp; };
    } else {
      if (cue) geo.merge(cue);
      const built = geo.build(), mat = o.material ?? plain;
      mesh = () => { const m = new THREE.Mesh(built, mat); m.castShadow = true; m.name = o.id; return m; };
    }
  }
  const path = kit.obstacles.path({
    id: o.id, kind: o.kind ?? 'bus', points: pts, speed: o.speed, mode: 'cross', wait: o.wait ?? 5, phase: o.phase ?? 0,
    length: o.length, radius: o.radius ?? Math.max(1.2, o.width * 0.5 + 0.2), hit: o.hit ?? 'bump', mesh,
  });
  const rec = installVehicleRamps(kit).add({ id: o.id, path, speed: o.speed, length: o.length, width: o.width, height: Math.min(o.height, 4.4), run });
  return { path, rec };
}
