// Cloud Nine Data Centre: the centreline (turtle route) and the layout numbers shared by the def and the dressing.
//
// Plan (x east, z south, clockwise). One long hall, about 2.75 km:
//
//   start straight (E, ground floor) -> climb through the fan wall -> glass tunnel across the cloud atrium (upper deck, y = 10)
//   -> 540 degree cold-aisle spiral round the Core tower (a big U-turn) -> W along the "north" aisle: esses -> FORK 1 (the spline sweeps
//   south round the "cold aisle" bulge; the "hot aisle" cut-through is a tight chicane straight across it) -> dogleg S (left corner cut by
//   the cable trench) -> long straight with the cable-hop jump -> dogleg N -> a long climb onto the BRIDGE that crosses over the return
//   straight -> teardrop loop (270 degrees, drops back to the floor) -> E under the bridge, FORK 2 (the straight is the short way, the
//   "patch bay" side road swings north with boost pads) -> start.
import { turtle } from '../../layout.js';
import { Centerline } from '../../Centerline.js';

/** Ground-floor road height (m) and the upper deck height. */
export const Y0 = 0.1, Y1 = 10;
/** Bridge deck height (m) where the north leg crosses over the return straight. */
export const YBR = 6;
/** Straight lengths (m). */
const LEN = { pre: 110, jumpLeg: 210 };

/** Lay the whole route with a turtle. */
function lay() {
  const t = turtle({ x: 0, z: 0, heading: 90, y: Y0, w: 18 });
  t.straight(140).mark('boost1');
  t.straight(150, { y: Y1 }).mark('top');                                  // climb 0.1 -> 10 m
  t.straight(150).mark('atriumEnd');                                       // upper deck: the glass tunnel
  t.straight(30).mark('sp0');
  t.arc(46, 540, { y: Y0, w: 17 }).mark('sp1');                            // right-hand spiral: a U-turn that drops 10 m
  t.straight(30, { w: 18 }).mark('exit');
  t.arc(55, 28, { bank: 7 }); t.arc(55, -56, { bank: -7 }); t.arc(55, 28, { bank: 0 }).mark('esses');   // W-bound (right = north): banked esses
  t.straight(20).mark('fk1a');
  t.arc(85, -38, { bank: -4 }); t.arc(85, 76, { bank: 5 }); t.arc(85, -38, { bank: 0 }).mark('fk1b');  // the cold-aisle bulge (the hot aisle runs straight across it)
  t.straight(LEN.pre).mark('pre');
  t.arc(45, -90, { bank: -6 }).mark('dl0');                                // dogleg south: left corner (the trench cuts it)
  t.straight(100, { bank: 0 }).mark('dl1');
  t.arc(45, 90, { bank: 6 }).mark('dl2');
  t.straight(LEN.jumpLeg, { bank: 0 }).mark('jump');
  t.arc(45, 90, { bank: 6 }).mark('bk0');                                  // dogleg north (the tape-library cut takes the inside)
  const p = t.pose();
  t.straight(p.z - 114, { bank: 0 }).mark('bk1');                          // flat run, then the climb: the bridge deck is at z = +14 .. -14
  t.straight(100, { y: YBR }).mark('br0');
  t.straight(28, { y: YBR }).mark('br1');                                  // over the return straight (it passes at z = 0)
  t.straight(31, { y: 3.9 });
  t.arc(45, -90, { y: Y0, bank: -5 }).mark('tear0');                       // teardrop loop: three quarter-turns left, falling back to the floor
  t.arc(45, -90, { bank: -6 }); t.arc(45, -90, { bank: 0 }).mark('tear1');
  const q = t.pose();
  t.straight(45, { bank: 0, w: 18 }).mark('under');                        // the bridge deck is directly overhead here
  t.straight(60).mark('fk2a');
  t.straight(150).mark('fk2b');                                            // fork 2 (patch bay): straight is the short way
  t.straight(-q.x - 255);
  return t.close();
}

/** Control points of the closed loop (turtle output with marks). */
export function datacentrePoints() { return lay(); }

let cache = null;
/**
 * The road as numbers, for placing things before the Track exists (world-placed trench deck, etc.).
 * @returns {{ cl: Centerline, S: (mark: string|number, off?: number) => number, at: (s: number, lat?: number) => { x: number, y: number, z: number, tx: number, tz: number, yaw: number } }}
 */
export function routeInfo() {
  if (cache) return cache;
  const cl = new Centerline(datacentrePoints(), { spacing: 2, width: 18 });
  const E = {};
  const S = (mark, off = 0) => (typeof mark === 'number' ? mark : cl.marks[mark]) + off;
  const at = (s, lat = 0) => {
    cl.eval(((s % cl.length) + cl.length) % cl.length, E);
    return { x: E.x - E.tz * lat, y: E.y, z: E.z + E.tx * lat, tx: E.tx, tz: E.tz, yaw: Math.atan2(E.tx, E.tz), width: E.width };
  };
  cache = { cl, S, at, Y0 };
  return cache;
}
