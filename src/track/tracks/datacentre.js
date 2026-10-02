// Cloud Nine Data Centre (indoor neon). A hyperscale hall raced at speed: rack canyons with blinking LEDs, a fan-wall climb, a glass tunnel through
// a cloud atrium, a 540 degree spiral round the Core tower, banked esses, two forks (cold aisle / hot aisle, patch bay), three cable shortcuts,
// a cable-hop jump, a bridge over its own return straight and a teardrop loop. Rampable AGV, forklift and tape-robot traffic (see traffic.js).
// Layout numbers live in builders/scenery/datacentre/route.js; the dressing in builders/scenery/datacentre/index.js. See TRACKDEF.md.
import * as THREE from 'three';
import { datacentrePoints, routeInfo, Y0 } from '../builders/scenery/datacentre/route.js';
import { trenchSpec } from '../builders/scenery/datacentre/trench.js';
import { dressDatacentre } from '../builders/scenery/datacentre/index.js';
import { createMaterials } from '../builders/scenery/datacentre/materials.js';
import { forkSpecs } from '../builders/scenery/datacentre/forks.js';
import { aisleZones } from '../builders/scenery/datacentre/aisles.js';

/** Neon colour scaled above 1 so it blooms when the post-process pass is on. */
const neon = (hex, k = 1.8) => new THREE.Color(hex).multiplyScalar(k);

export default function datacentre() {
  const R = routeInfo();
  const T = trenchSpec(R);
  // the Tape-Library Cut (right corner into the north leg) and the Battery-Yard Cut (right corner after the dogleg): hazards, not oil
  const T2 = trenchSpec(R, { id: 'tape', sg: 1, sA: R.S('jump', -100), sQ: R.S('bk0', 45), kind: 'none', from: R.S('jump', -105), to: R.S('bk0', 72) });
  const T3 = trenchSpec(R, { id: 'yard', sg: 1, sA: R.S('dl1', -100), sQ: R.S('dl2', 45), kind: 'none', from: R.S('dl1', -105), to: R.S('dl2', 72) });
  const CUTS = [T, T2, T3];
  const M = createMaterials();
  const FK = forkSpecs(R, M);                 // the two forks: ribbon roads, their pads / kicker, the wall mouths and the rack rows
  const AIS = aisleZones(R);                  // hot / cold aisle colour zones
  const S = (m, o = 0) => (o ? `@${m}${o > 0 ? '+' : ''}${o}` : `@${m}`);
  return {
    id: 'datacentre', name: 'Cloud Nine Data Centre', lapCount: 3, seed: 39, music: 'datacentre', killY: -40,
    environment: {
      skyKind: 'indoor', skyTop: 0x050a1e, skyBottom: 0x0d1638, fogColor: 0x080e2a, fogNear: 60, fogFar: 460,
      sunDir: [0.18, 1, 0.12], sunColor: 0xb9d4ff, sunIntensity: 1.05, ambientColor: 0x7d92ff, ambientIntensity: 1.05,
    },
    road: {
      width: 18, kerbWidth: 1.3, wallGap: 1.4, tile: 18, underTile: 3,
      markings: { edge: { colour: neon(0x22d3ee, 1.5), inset: 0.45, width: 0.3 }, centre: { kind: 'dashed', colour: neon(0xff3fd8, 1.2), width: 0.2, dash: 4, gap: 7 } },
    },
    points: datacentrePoints(),
    walls: {
      rack: { height: 7, thickness: 1.6, solid: true, profile: [[0, -0.35], [0, 7], [1.6, 7], [1.6, -0.35]], colour: 0x1a2244, material: M.rack, tile: 4.8 },
      rail: { height: 1.6, thickness: 0.6, solid: true, profile: [[0, -0.35], [0, 1.6], [0.6, 1.6], [0.6, -0.35]], colour: 0x1c2648, top: 0x22d3ee, material: M.rail, tile: 4 },
    },
    kerbs: { default: {} },
    defaults: { both: { wall: 'rack', kerb: false, edge: 'road', skirt: 0 } },
    zones: [
      // the raised deck: climb, glass tunnel and the upper half of the spiral run behind low rails on a slab
      { from: S('boost1', 25), to: S('sp1', 25), wall: 'rail', thickness: 1.6, kerb: true },
      // the bridge: the north leg climbs onto a deck (rails on a slab) that crosses over the return straight, then falls into the teardrop
      { from: S('bk1', 40), to: S('tear0', 6), wall: 'rail', thickness: 1.6, kerb: true },
      // under the bridge the return straight loses its 7 m racks (they would meet the deck): low rails instead
      { from: S('under', -38), to: S('under', 38), wall: 'rail' },
      // corners get kerbs
      { from: S('sp0'), to: S('sp1'), kerb: true },
      { from: S('exit', 10), to: S('esses', 20), kerb: true },
      { from: S('fk1a', 6), to: S('fk1b', -6), kerb: true },
      { from: S('pre', -8), to: S('dl1', 8), kerb: true },
      { from: S('dl1', 5), to: S('dl2', 8), kerb: true },
      { from: S('jump', -8), to: S('bk0', 8), kerb: true },
      { from: S('br1', 36), to: S('tear1', 8), kerb: true },
      // the second roads of the forks open the walls where they leave and rejoin
      ...FK.zones,
      // the trench: the racks part on the inside of the dogleg (left side) where the deck leaves and rejoins the road
      ...CUTS.flatMap((c) => c.zones),
    ],
    terrain: { height: () => 0, base: 0, extent: [-2000, -2000, -1968, -1968], cell: 16, bounds: [-540, -230, 640, 420] },
    boostPads: [{ s: '@boost1-45', length: 12, width: 8 }, { s: S('sp1', 34), length: 12, width: 8 }, { s: S('dl2', 30), length: 12, width: 8 },
      { s: 22, lateral: -4.2, length: 10, width: 5 }, { s: 50, lateral: 4.2, length: 10, width: 5 },                       // start-straight weave chain
      ...[70, 170, 270].map((o) => ({ s: S('sp0', o), lateral: 5.2, length: 11, width: 4.2 })),                            // the Core: inside-line drift pads
      { s: S('exit', 8), lateral: 4, length: 10, width: 5 }, { s: S('exit', 49), lateral: -4, length: 10, width: 5 }, { s: S('exit', 90), lateral: 4, length: 10, width: 5 },   // esses: pads on the apexes
      { s: S('fk1a', 62), length: 12, width: 8 }, { s: S('fk1a', 150), length: 12, width: 8 },                               // the cold-aisle bulge is the fast way: two pads
      { s: S('bk1', 8), length: 12, width: 8 }, { s: S('tear0', 60), lateral: 4, length: 11, width: 5 },                     // before the bridge climb, round the teardrop
      { s: S('fk2b', 34), length: 12, width: 8 }],
    ramps: [
      { id: 'cable-hop', s: S('dl2', 62), lateral: 0, length: 12, width: 12, rise: 2.4, kind: 'ramp', material: M.hazard(12) },
      ...FK.ramps,
      ...CUTS.flatMap((c) => c.platforms(M)),
    ],
    shortcuts: [{ from: T.from, to: T.to, id: 'cable-trench' }, { from: T2.from, to: T2.to, id: 'tape-library-cut' }, { from: T3.from, to: T3.to, id: 'battery-yard-cut' }],
    itemRows: [{ s: 70 }, { s: '@top+50' }, { s: S('sp0', 150) }, { s: S('sp1', 60) }, { s: S('fk1b', 30) }, { s: S('jump', -60) }, { s: S('bk1', 30) }, { s: S('tear1', 60) }],
    checkpoints: [0, 220, '@atriumEnd', S('sp0', 150), S('sp0', 300), '@exit', '@pre', '@dl1', '@jump', '@bk1', '@tear1'],
    // the forks (data: tests, minimap and other agents read it). `alt` = id of the platform that carries the second road.
    forks: FK.forks.map(({ id, name, from, to, alt }) => ({ id, name, from, to, alt })),
    gantry: { lines: ['MARCO KART', 'START / FINISH'], clearance: 8.2 },
    materials: (kit) => M.forKit(kit),
    dress(kit) { dressDatacentre(kit, { R, T, T2, T3, CUTS, M, FK, AIS }); },
  };
}
