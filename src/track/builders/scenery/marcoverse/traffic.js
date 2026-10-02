// Marcoverse traffic: slow space-lane vehicles drifting the race's way along the ribbon. Every one is a moving obstacle (bump when hit from the
// side, front or too slowly) and RAMPABLE from behind (hazard-striped tail ramp: hit it fast and lined up and the kart launches over the roof;
// see hazards/rampVehicle.js and hazards/traffic.js). Meshes are skipped headless; the paths and the ramp rule are gameplay and always built.
//
//   hover-taxi    low neon saloon pod on four hover pads, a roof lamp, underglow (corkscrew exit straight)
//   cargo drone   flat-bed lifter with four ducted fans and a striped crate (the Esses)
//   comet-sled    wedge-shaped ice sled with a glowing crystal at the nose and light runners (the Tube leg)
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { addTraffic } from '../hazards/traffic.js';
import { pinToRoad } from '../trafficRoad.js';
import { materialise } from '../datacentre/traffic.js';
import { PALETTE } from './palette.js';
import { hot } from './util.js';

const disc = (g, x, y, z, r, colour) => g.cyl(r, r, 0.08, 14, { x, y, z, colour, ao: 0 });

/** Hover-taxi: 4.6 x 2.0 x 1.5 m. A glowing yellow pod floating 0.3 m above the road on four pads. */
export function hoverTaxiGeo({ body = 0xffc83a, glow = PALETTE.cyan } = {}) {
  const g = new Geo(), W = 2.0, L = 4.6;
  g.box(W, 0.55, L, { y: 0.42, colour: body, ao: 0.2, top: 0xffe58a });
  g.box(W - 0.3, 0.5, L - 1.8, { y: 0.97, z: -0.2, colour: 0x1f2a63, ao: 0.1, top: 0x3a4aa8 });                 // canopy
  g.box(W + 0.04, 0.1, L + 0.04, { y: 0.78, colour: hot(0x111111, 1), ao: 0 });                                    // belt line
  g.box(0.9, 0.18, 0.4, { y: 1.5, z: -0.2, colour: hot(PALETTE.yellow, 2.4), ao: 0 });                             // roof lamp
  g.box(W - 0.4, 0.12, 0.06, { y: 0.62, z: L / 2 + 0.03, colour: hot(0xffffff, 3), ao: 0 });                      // head light bar
  g.box(W - 0.3, 0.08, 0.06, { y: 0.52, z: -L / 2 - 0.03, colour: hot(0xff3a3a, 2.6), ao: 0 });                   // tail light bar
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { disc(g, sx * (W / 2 - 0.3), 0.22, sz * (L / 2 - 0.7), 0.34, 0x20245a); disc(g, sx * (W / 2 - 0.3), 0.16, sz * (L / 2 - 0.7), 0.26, hot(glow, 2.2)); }
  g.box(W - 0.3, 0.05, L - 0.6, { y: 0.14, colour: hot(glow, 1.8), ao: 0 });                                       // underglow
  return g;
}

/** Cargo drone: 5.4 x 3.0 x 2.0 m. A low lifter deck with four ducted fans on outriggers and a striped crate. */
export function cargoDroneGeo({ crate = PALETTE.magenta, glow = PALETTE.mint } = {}) {
  const g = new Geo(), W = 2.2, L = 5.4;
  g.box(W, 0.45, L, { y: 0.4, colour: 0x262c63, ao: 0.25, top: 0x3c4690 });                                       // deck
  g.box(W - 0.5, 1.15, 2.6, { y: 0.85, z: -0.7, colour: crate, ao: 0.15, top: 0xffffff });                          // crate
  for (let k = 0; k < 4; k++) g.box(W - 0.46, 0.1, 0.24, { y: 1.1 + (k % 2) * 0.55, z: -1.7 + k * 0.78, colour: hot(0xffffff, 1.4), ao: 0 });
  g.box(W - 0.6, 0.7, 1.0, { y: 0.85, z: 1.9, colour: 0x1a1f4d, ao: 0.1 });                                       // cab bubble
  g.box(W - 0.9, 0.2, 0.06, { y: 1.15, z: 2.42, colour: hot(PALETTE.cyan, 2.4), ao: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 + 0.45), z = sz * 1.9;
    g.box(0.7, 0.12, 0.2, { x: sx * (W / 2 + 0.12), y: 0.58, z, colour: 0x39406a, ao: 0 });                         // outrigger
    g.cyl(0.62, 0.62, 0.22, 14, { x, y: 0.5, z, colour: 0x20245a, ao: 0.1 });                                       // fan housing
    disc(g, x, 0.74, z, 0.46, hot(glow, 2.4));
  }
  g.box(W - 0.3, 0.05, L - 0.8, { y: 0.12, colour: hot(glow, 1.6), ao: 0 });
  return g;
}

/** Comet-sled: 4.0 x 1.9 x 1.3 m. A wedge hull on two light runners; an ice crystal at the nose with a comet streak above it. */
export function cometSledGeo({ hull = 0x6a4cc8, ice = 0x8fe8ff } = {}) {
  const g = new Geo(), W = 1.9, L = 4.0;
  for (const sx of [-1, 1]) g.box(0.2, 0.2, L + 0.4, { x: sx * (W / 2 - 0.25), y: 0.14, colour: hot(PALETTE.cyan, 2.2), ao: 0 });   // runners
  g.box(W - 0.2, 0.5, L - 0.4, { y: 0.34, colour: hull, ao: 0.2, top: 0x9a85ff });
  g.box(W - 0.7, 0.38, L - 1.8, { y: 0.8, z: -0.5, colour: 0x2a1f6a, ao: 0.1, top: 0x4a3aa8 });
  g.cone(0.55, 1.3, 6, { x: 0, y: 0.84, z: 1.15, colour: hot(ice, 1.6), ao: 0 });                                  // ice crystal
  g.cone(0.3, 0.9, 5, { x: 0.45, y: 0.84, z: 0.7, colour: hot(ice, 1.2), ao: 0 });
  g.beam([0, 1.1, 1.6], [0, 1.45, 3.2], 0.22, 5, { colour: hot(PALETTE.violet, 2.2), rTop: 0.02 });                // comet streak (ahead of the sled)
  g.box(W - 0.5, 0.1, 0.06, { y: 0.5, z: -L / 2 - 0.03, colour: hot(0xff3a3a, 2.4), ao: 0 });
  return g;
}

/**
 * Install the Marcoverse traffic. `R` is the route (makeRoute): `at(s, lat)` and `S(mark, off)` double as the traffic helper's geometry source.
 * Vehicles keep clear of: the start grid, the Leap and its run-up, the corkscrew, the glitch bridge's own deck, and the Plunge (the viaduct crosses it).
 */
export function installMvTraffic(kit, { R, material = null }) {
  const S = R.S;
  const T = (o) => {
    const r = addTraffic(kit, R, { hit: 'bump', merge: 0, wait: 4, material: material ?? undefined, ...o });
    const L = kit.track.length, a = R.at(((o.from % L) + L) % L, o.lat), b = R.at(((o.to % L) + L) % L, o.lat);
    pinToRoad(kit, r, R, o.from, o.to, o.lat);
    materialise(kit, r.rec, r.path, [[a.x, a.z], [b.x, b.z]]);
    return r;
  };
  // cargo drones through the Esses: two lanes, staggered, out by the edges so there is a 6 m corridor between them (at +-5 they closed the road to the AI, which could only
  // slow right down or vault one: a boosted kart vaulting it at 50 m/s flew 45 m and landed at the Esses' end, or in the corkscrew's entry, far too fast for the bend).
  [0, 1].forEach((i) => T({ id: `drone-esses${i}`, kind: 'drone', from: S('t2x', 6), to: S('spin', -4), lat: i ? -7.5 : 7.5, speed: 9.5, phase: i * 8,
    geo: () => cargoDroneGeo(i ? { crate: PALETTE.cyan, glow: PALETTE.magenta } : {}), length: 5.4, width: 2.2, height: 2.0, radius: 1.5, run: 6, rise: 0.8 }));
  // hover-taxis on the straight after the corkscrew
  T({ id: 'taxi-climb0', kind: 'taxi', from: S('spiral', 24), to: S('climb', -6), lat: -5.2, speed: 10, phase: 3,
    geo: () => hoverTaxiGeo(), length: 4.6, width: 2.0, height: 1.5, radius: 1.35, run: 5.5, rise: 0.8 });
  T({ id: 'taxi-climb1', kind: 'taxi', from: S('climb', -64), to: S('climb', -6), lat: 5, speed: 10.5, phase: 9,
    geo: () => hoverTaxiGeo({ body: 0xff7ac8, glow: PALETTE.magenta }), length: 4.6, width: 2.0, height: 1.5, radius: 1.35, run: 5.5, rise: 0.8 });
  // comet-sleds: out of the second hairpin onto the Tube leg, and further down the same leg. (The second used to run down the 90 m leg between the two hairpins:
  // a kart that vaulted it at 47 m/s flew 45 m and landed at the entry of the next hairpin, too fast to turn, and went over the edge.)
  T({ id: 'sled-ladder', kind: 'sled', from: S('tube', -140), to: S('tube', -70), lat: 5, speed: 9, phase: 5,
    geo: () => cometSledGeo(), length: 4.0, width: 1.9, height: 1.3, radius: 1.3, run: 5, rise: 0.8 });
  T({ id: 'sled-tube', kind: 'sled', from: S('h2', 16), to: S('h2', 80), lat: -5, speed: 9.5, phase: 11,
    geo: () => cometSledGeo({ hull: 0x3a8fc8, ice: 0xff9ae0 }), length: 4.0, width: 1.9, height: 1.3, radius: 1.3, run: 5, rise: 0.8 });
}

void THREE;
