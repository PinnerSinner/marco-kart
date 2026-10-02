// Marcoverse Speedway: the final-cup showpiece. A neon ribbon through a starfield: no walls, void on both sides, a giant Marco-face planet,
// banked twists, a dramatic dip-and-climb wave, a leap over a broken span, a corkscrew loop and a glass tube.
//
//   start platform (E) -> Portal Bend (T1) -> The Plunge (S, dive and climb) -> Hairpin-ish T2 -> Esses -> Corkscrew (helix, drops 10 m)
//   -> Climb -> T3 -> chicane -> Glass Tube (N) -> T4 -> The Leap (ramp + gap) -> start/finish.
//
// x east, z south (screen down), clockwise. Heights (y): 40 on the flat, 20 at the bottom of the Plunge, 30 at the bottom of the corkscrew.
import { turtle } from '../builders/layout.js';
import { dressMarcoverse } from '../builders/scenery/marcoverse/index.js';
import { marcoverseMaterials } from '../builders/scenery/marcoverse/materials.js';
import { PALETTE } from '../builders/scenery/marcoverse/palette.js';
import { loopDiff, wrapS } from '../../core/util.js';
import { makeRoute } from '../builders/scenery/hazards/deck.js';
import { mvShortcuts } from '../builders/scenery/marcoverse/shortcuts.js';
import { mvForkSpecs, installMvForks } from '../builders/scenery/marcoverse/forks.js';

/** The Leap, in metres relative to the start line (negative = before it): the ramp starts at LEAP.ramp, the gap is LEAP.gap. */
const LEAP = { ramp: -150, gap: [-133, -123], runUp: 85 };

/**
 * Respawns on the Leap must never land between the ramp and the far side of the gap: a kart put down there at a standstill has no
 * run-up, so it can only fall again, for ever. Any respawn request from the ramp start to the end of the gap is moved back `runUp`
 * metres, onto the straight before the boost chain, so the kart is at full speed on the ramp. (Track.respawnAt only steps back off the
 * ramp itself, which leaves the kart 2 m before it; see REQUESTS.md.)
 * @param {import('../Track.js').Track} track @param {number} from s of the ramp start @param {number} to s of the end of the gap
 */
function guardLeapRespawn(track, from, to) {
  const base = track.respawnAt.bind(track), L = track.length, span = loopDiff(from, to, L);
  track.respawnAt = (s, lateral = 0) => {
    const d = loopDiff(from, wrapS(s, L), L);
    return base(d > -3 && d < span + 3 ? from - LEAP.runUp : s, lateral);
  };
}

/**
 * A banked corner that is fair to take at speed: the bank builds over the first `up` of the arc, and is released over the rest, so that it is
 * flat again by the exit. The rate of change is what matters: where the bank changes quickly, the surface at the edge that is going "downhill"
 * falls away faster than the kart's ground contact follows (the track query reports the surface slope without the twist), and a kart on the
 * outer or inner line hops, loses its grip in the air and slides into the void. Holding the peak bank to the very end and then dropping it over
 * the next 40 m straight (the first layout) did exactly that. Height and width, when given, still change evenly over the whole arc.
 * @param {ReturnType<typeof turtle>} t @param {number} radius m @param {number} deg + right, - left @param {number} bank peak bank (degrees, same sign as `deg`)
 * @param {{y?:[number,number], w?:[number,number], up?:number, down?:number}} [o] y / w = [start, end] values across the arc; up / down = fraction of the arc building / releasing the bank
 */
function bankedArc(t, radius, deg, bank, { y, w, up = 0.5, down = 0.5 } = {}) {
  const along = (range, f) => (range ? { v: range[0] + (range[1] - range[0]) * f } : null);
  const props = (f, extra) => ({ ...extra, ...(y ? { y: along(y, f).v } : {}), ...(w ? { w: along(w, f).v } : {}) });
  t.arc(radius, deg * up, props(up, { bank }));
  if (up + down < 0.99) t.arc(radius, deg * (1 - up - down), props(1 - down, {}));      // (a level stretch between build and release, if any)
  t.arc(radius, deg * down, props(1, { bank: 0 }));
  return t;
}

/** The clockwise route. Returns control points (turtle output, closed). Marks are the ends of the elements they follow. */
function routePoints() {
  const t = turtle({ x: 0, z: 0, heading: 90, y: 40, w: 26 });
  t.straight(130, { w: 26 }).mark('s1');                                   // start platform, then straight to T1
  bankedArc(t, 90, 90, 22).mark('t1');                                     // T1: Portal Bend (banked right, portals); fork 1 (the viaduct) leaves just after it
  t.straight(100, { bank: 0, w: 24 }).mark('dive0');                       // level run: the viaduct peels away east while the road is still at 40 m
  t.straight(150, { y: 20 }).mark('dip');                                  // The Plunge: 20 m drop over 150 m, climb back over 170 m
  t.straight(170, { y: 40 }).mark('crest');
  bankedArc(t, 70, 90, 18, { w: [24, 26] }).mark('t2');                    // T2: the tight one, widest road
  t.straight(24, { bank: 0, w: 24 }).mark('t2x');
  t.arc(100, 40, { bank: 11 }).mark('e1'); t.arc(100, -40, { bank: -11 }).mark('e2');   // Esses through the rack asteroids
  t.straight(40, { bank: 0 }).mark('spin');
  bankedArc(t, 58, 360, 16, { y: [40, 30], w: [24, 22] }).mark('spiral');  // Corkscrew: one full right-hand turn, drops 10 m (the exit passes under the entry)
  t.straight(150, { y: 36, bank: 0, w: 24 }).mark('climb');
  bankedArc(t, 90, 90, 20, { w: [24, 26] }).mark('t3');                    // T3 (the glitch bridge cuts it)
  // the west switchbacks: chicane, a right hairpin south, a left hairpin north, then the long Tube leg (fork 2: tube or skyline)
  t.straight(30, { bank: 0, w: 24 }).mark('n0');
  t.arc(90, -35, { bank: -10 }).mark('c1'); t.arc(90, 35, { bank: 10 }).mark('c2');     // chicane
  t.straight(10, { bank: 10 });                                              // (the chicane's last bank carries on into the hairpin: no sudden release)
  bankedArc(t, 40, 180, 18, { y: [37, 37.5], w: [24, 26] }).mark('h1');    // hairpin right: heading south
  t.straight(90, { bank: 0, w: 24, y: 38 }).mark('l2');
  bankedArc(t, 40, -180, -18, { y: [38, 38.5], w: [24, 26] }).mark('h2');  // hairpin left: heading north again, 70 m east of the first leg
  const p = t.pose();
  t.straight(p.z - 140, { bank: 0, w: 24, y: 40 }).mark('tube');           // the Tube leg (fork 2), 260 m north
  bankedArc(t, 60, -90, -14, { w: [24, 24] }).mark('t4a');                 // T4a: left, heading west
  t.straight(24, { bank: 0 }).mark('wleg');
  bankedArc(t, 40, 180, 20, { w: [24, 26] }).mark('t4');                   // T4: the last hairpin, onto the Leap straight
  const q = t.pose();
  t.straight(-q.x, { bank: 0, w: 26, y: 40 });                             // the Leap straight (about 240 m) into the start
  return t.close();
}

const POINTS = routePoints();
const ROUTE = makeRoute(POINTS, { spacing: 2, width: 24 });
const SC0 = mvShortcuts(ROUTE);
let MATS = null;                                                            // the deck materials (made once per build in def.materials, reused for the fork roads)

/** Marcoverse Speedway. @param {{ gap?: boolean }} [o] gap:false leaves the Leap unbroken (SimpleKart cannot jump). */
export default function marcoverse({ gap = true, gap1 } = {}) {
  const SC = gap1 ? mvShortcuts(ROUTE, { gap1 }) : SC0;
  const FK = mvForkSpecs(ROUTE);                                            // the two forks (a fresh pair of ribbons per build): the viaduct over the Plunge, the skyline beside the Tube
  return {
    id: 'marcoverse', name: 'Marcoverse Speedway', lapCount: 3, seed: 44, music: 'marcoverse', killY: -70,
    environment: {
      skyKind: 'space', stars: true, clouds: 0,
      skyTop: 0x0b0836, skyBottom: 0x2a1466, fogColor: 0x120d3a, fogNear: 260, fogFar: 2200,
      sunDir: [-0.35, 0.55, -0.6], sunColor: 0xffd9f2, sunIntensity: 0.9, ambientColor: 0x9aa8ff, ambientIntensity: 1.25,
    },
    road: {
      width: 24, thickness: 1.5, tile: 18, underTile: 3,
      markings: { edge: null, centre: null },
    },
    points: POINTS,
    terrain: false,
    defaults: { both: { wall: 'none', edge: 'void', kerb: false, skirt: 0 } },
    zones: [
      { from: -70, to: 60, thickness: 3.2 },                               // the lit start platform
      ...(gap ? [{ from: LEAP.gap[0], to: LEAP.gap[1], gap: true }] : []),
    ],
    boostPads: [
      ...['@dip+30', '@dip+66', '@dip+102'].map((s) => ({ s, length: 12, width: 8 })),
      ...['@climb-110', '@climb-75', '@climb-40'].map((s) => ({ s, length: 12, width: 8 })),
      ...[-205, -182, -159].map((s) => ({ s, length: 12, width: 9 })),
      ...[16, 40].map((s, i) => ({ s, length: 10, width: 6, lateral: i ? 6 : -6 })),          // start-straight weave chain
      ...['@spin+60', '@spin+150', '@spin+240'].map((s) => ({ s, length: 12, width: 5, lateral: 7 })),   // corkscrew inside-line drift pads
      ...['@h1+26', '@h2+14', '@t4+8'].map((s) => ({ s, length: 12, width: 8 })),             // out of each hairpin (never into one)
    ],
    ramps: [{ id: 'leap', s: LEAP.ramp, length: 12, width: 20, rise: 2.4, kind: 'ramp' }, ...SC.specs, ...FK.ramps],
    shortcuts: SC.shortcuts,
    itemRows: [{ s: 55 }, { s: '@dive0+40' }, { s: '@dip+60' }, { s: '@t2x+20' }, { s: '@e2+30' }, { s: '@climb-20' }, { s: '@c2+30' }, { s: '@h2+40' }],
    checkpoints: [0, '@dive0', '@dip', '@t2', '@spin', '@spiral-180', '@spiral', '@t3', '@c2', '@h2', '@tube', '@t4'],
    // the forks (data: tests, the minimap and other agents read it). `alt` = id of the platform that carries the second road.
    // the AI line: at the foot of the Plunge the viaduct (flat at 40 m) peels away east while the road is still level with it, and it takes every kart that is
    // on its deck when the road starts to drop. The racing line (east of centre, for Tight Two) would be on it every lap, so hold it west of the viaduct's edge there:
    // a kart that rides the viaduct and then steers for the line goes off the deck's edge. Fades in and out over 36 m.
    aiLine: [{ from: '@dive0-8', to: '@dive0+14', min: 2.6, fade: 36 },
      { from: '@e1-62', to: '@e2+16', min: -2.8, max: 2.8, fade: 24 }],      // the Esses' glitch boost tiles sit at +-7: the AI keeps between them
    forks: FK.forks.map(({ id, name, from, to, alt }) => ({ id, name, from, to, alt })),
    gantry: false, paint: [],
    materials: (kit) => (MATS = marcoverseMaterials(kit)),
    dress(kit) {
      if (gap) guardLeapRespawn(kit.track, kit.S(LEAP.ramp), kit.S(LEAP.gap[1]));
      installMvForks(kit, { FK });                // the second roads: physics now (headless too), dressing in dressMarcoverse
      dressMarcoverse(kit, { PALETTE, SC, FK, R: ROUTE, road: MATS?.road ?? null });
    },
  };
}
