// Data Centre traffic: slow service vehicles driving the race's way down the aisles. Every one is a moving obstacle (bump when hit from the side,
// front or too slowly) and RAMPABLE from behind (hazard-striped tail ramp: hit it fast and lined up and the kart launches over the roof;
// see hazards/rampVehicle.js and hazards/traffic.js). Meshes are skipped headless; the paths and the ramp rule are gameplay and always built.
//
//   AGV cable-cart      low autonomous guided vehicle hauling a cable reel (esses, return straight)
//   forklift train      yellow forklift towing two cable-drum trolleys (the south dogleg)
//   tape-library robot  boxy rail robot with a cartridge magazine and a picker arm (the aisle before the dogleg)
import { Geo } from '../../Geo.js';
import { addTraffic } from '../hazards/traffic.js';
import { pinToRoad } from '../trafficRoad.js';

const wheels = (g, W, zs, r, y = r) => { for (const z of zs) for (const sx of [-1, 1]) g.cyl(r, r, 0.3, 10, { x: sx * (W / 2 - 0.04), y, z, rz: Math.PI / 2, colour: 0x0d0f16, ao: 0 }); };

/** AGV cable-cart: 4.2 x 2.0 x 1.9 m. A flat deck on four small wheels, a scanner bumper, a cable reel and an amber beacon. */
export function agvGeo({ body = 0x232d52, trim = 0x22d3ee, cable = 0xff8a00 } = {}) {
  const g = new Geo(), W = 2.0, L = 4.2;
  g.box(W, 0.5, L, { y: 0.32, colour: body, ao: 0.25, top: 0x34417a });
  g.box(W + 0.04, 0.1, L + 0.04, { y: 0.58, colour: trim, ao: 0 });                                      // glowing edge band
  g.box(W - 0.3, 0.3, 0.5, { y: 0.45, z: L / 2 + 0.1, colour: 0x101426, ao: 0 });                         // laser scanner bumper (front)
  g.box(W - 0.8, 0.06, 0.06, { y: 0.52, z: L / 2 + 0.36, colour: 0xff3a3a, ao: 0 });
  g.cyl(0.78, 0.78, 1.2, 14, { y: 1.28, z: -0.3, rz: Math.PI / 2, colour: 0x1a1f33, ao: 0.1 });            // cable reel on its side
  g.cyl(0.52, 0.52, 1.24, 14, { y: 1.28, z: -0.3, rz: Math.PI / 2, colour: cable, ao: 0 });
  g.cyl(0.9, 0.9, 0.06, 14, { x: -0.62, y: 1.28, z: -0.3, rz: Math.PI / 2, colour: 0x39406a, ao: 0 }); g.cyl(0.9, 0.9, 0.06, 14, { x: 0.62, y: 1.28, z: -0.3, rz: Math.PI / 2, colour: 0x39406a, ao: 0 });
  g.cyl(0.14, 0.14, 0.3, 8, { y: 2.05, z: L / 2 - 0.5, colour: 0xffb020, ao: 0 });                         // beacon
  wheels(g, W, [-1.4, 1.4], 0.3);
  return g;
}

/** Forklift train: 9.6 x 2.2 x 2.4 m. Forklift at the front (mast leads), two trolleys with cable drums behind it. */
export function forkliftTrainGeo({ body = 0xffb020 } = {}) {
  const g = new Geo(), W = 2.0;
  // forklift (front 3.6 m)
  g.box(W, 0.9, 3.2, { y: 0.5, z: 3.1, colour: body, ao: 0.2, top: 0xffd166 });
  g.box(W - 0.2, 1.0, 1.6, { y: 1.45, z: 2.5, colour: 0x2b3a4a, ao: 0.1 });                                // cab glass
  g.box(0.12, 1.2, 1.7, { x: -0.92, y: 1.4, z: 2.5, colour: 0x1a1f33, ao: 0 }); g.box(0.12, 1.2, 1.7, { x: 0.92, y: 1.4, z: 2.5, colour: 0x1a1f33, ao: 0 });
  g.box(W - 0.3, 0.1, 1.9, { y: 2.0, z: 2.5, colour: body, ao: 0.1 });                                      // overhead guard
  for (const sx of [-0.6, 0.6]) g.box(0.16, 2.4, 0.2, { x: sx, y: 1.3, z: 4.8, colour: 0x39406a, ao: 0 }); // mast
  for (const sx of [-0.5, 0.5]) g.box(0.2, 0.08, 1.4, { x: sx, y: 0.14, z: 5.4, colour: 0x6c7390, ao: 0 });  // forks
  wheels(g, W, [1.9, 3.8], 0.46);
  // two trolleys, each with a cable drum, joined by drawbars
  [-0.6, -4.1].forEach((z, k) => {
    g.box(1.8, 0.28, 3.0, { y: 0.4, z, colour: 0x39406a, ao: 0.2, top: 0x4a5490 });
    g.cyl(0.8, 0.8, 1.1, 12, { y: 1.35, z, rz: Math.PI / 2, colour: k ? 0x22d3ee : 0xff3fb4, ao: 0.1 });
    g.cyl(0.34, 0.34, 1.14, 10, { y: 1.35, z, rz: Math.PI / 2, colour: 0x1a1f33, ao: 0 });
    wheels(g, 1.8, [z - 0.9, z + 0.9], 0.22, 0.22);
    g.box(0.12, 0.12, 1.0, { y: 0.45, z: z + 1.9, colour: 0x1a1f33, ao: 0 });
  });
  return g;
}

/** Tape-library robot: 3.6 x 2.2 x 2.9 m. A magazine of cartridges on a tracked base with a little picker arm on top. */
export function tapeRobotGeo({ body = 0x3a2a6e, magenta = 0xff3fb4 } = {}) {
  const g = new Geo(), W = 2.2, L = 3.6;
  g.box(W, 0.6, L, { y: 0.4, colour: 0x1a1f33, ao: 0.3 });                                                   // track base
  g.box(W - 0.3, 1.9, L - 0.5, { y: 0.7, colour: body, ao: 0.2, top: 0x5a43a8 });                           // magazine
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) g.box(0.05, 0.22, L - 1.1, { x: sx * (W / 2 - 0.12), y: 0.95 + i * 0.34, z: 0, colour: i % 2 ? 0x22d3ee : magenta, ao: 0 });
  g.box(W - 0.8, 0.4, 0.9, { y: 2.8, z: 0.8, colour: 0x2b3a4a, ao: 0.1 });                                  // picker head
  g.beam([0, 2.6, 0.2], [0, 2.9, 1.4], 0.12, 5, { colour: 0xffb020, rTop: 0.05 });
  g.box(0.3, 0.12, 0.12, { y: 3.02, z: L / 2 - 0.4, colour: 0xff3a3a, ao: 0 });
  wheels(g, W, [-1.2, -0.4, 0.4, 1.2], 0.3);
  return g;
}

/**
 * Vehicles should not pop in and out of existence in the middle of the aisle: each one materialises over its first 6 m (a scan-in from the floor)
 * and dematerialises over its last 6 m, scaling about the ground point under it. (The collision circles stay put: nothing is hit in those 6 m
 * because the kart cannot see, or be in, a thing that is not there yet.)
 */
export function materialise(kit, rec, path, pts) {
  if (kit.headless || !path.object) return;
  const a = pts[0], b = pts[pts.length - 1], obj = path.object, ease = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
  kit.animate((dt, t) => {
    const st = path.position(t);
    if (!st.active) return;
    const k = Math.min(ease(Math.hypot(st.x - a[0], st.z - a[1]) / 6), ease(Math.hypot(st.x - b[0], st.z - b[1]) / 6));
    obj.scale.setScalar(Math.max(0.02, k));
  });
}

/** Install the Data Centre's traffic. `R` is the route (routeInfo): `at(s, lat)` and `S(mark, off)` double as the traffic helper's geometry source. */
export function installDcTraffic(kit, { R }) {
  const S = R.S, L = kit.track.length;
  const T = (o) => {
    const r = addTraffic(kit, R, { hit: 'bump', merge: 0, wait: 4, ...o });
    const a = R.at(((o.from % L) + L) % L, o.lat), b = R.at(((o.to % L) + L) % L, o.lat);
    pinToRoad(kit, r, R, o.from, o.to, o.lat);
    materialise(kit, r.rec, r.path, [[a.x, a.z], [b.x, b.z]]);
    return r;
  };
  // AGV cable-carts through the banked esses: two, in opposite lanes, staggered
  [0, 1].forEach((i) => T({ id: `agv-esses${i}`, kind: 'agv', from: S('exit', 22), to: S('esses', 30), lat: i ? -4.7 : 4.7, speed: 9, phase: i * 7.5,
    geo: () => agvGeo(i ? { trim: 0xff3fb4 } : {}), length: 4.2, width: 2.0, height: 1.9, radius: 1.35, run: 5, rise: 0.8 }));
  // tape-library robots rolling away from the fork, down the aisle to the dogleg
  [0, 1].forEach((i) => T({ id: `tape-pre${i}`, kind: 'robot', from: S('fk1b', 22), to: S('pre', 56), lat: i ? 4.7 : -4.7, speed: 9.5, phase: 4 + i * 10,
    geo: () => tapeRobotGeo(i ? { body: 0x2a4a6e } : {}), length: 3.6, width: 2.2, height: 2.9, radius: 1.45, run: 5.5, rise: 1.0 }));
  // the forklift train crawling down the south dogleg
  T({ id: 'forklift-dl', kind: 'forklift', from: S('dl0', 12), to: S('dl1', 84), lat: -4.8, speed: 8.2, phase: 6, wait: 5,
    geo: () => forkliftTrainGeo(), length: 9.6, width: 2.2, height: 2.4, radius: 1.5, run: 6.5, rise: 0.9 });
  // an AGV on the return straight, before the patch bay
  T({ id: 'agv-return', kind: 'agv', from: S('under', 44), to: S('fk2a', 36), lat: 4.7, speed: 9.5, phase: 9,
    geo: () => agvGeo({ trim: 0xffb020 }), length: 4.2, width: 2.0, height: 1.9, radius: 1.35, run: 5, rise: 0.8 });
}
