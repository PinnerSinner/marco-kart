// routeGeom: world coordinates along a track's own centreline, available while the def is still being written.
// A def cannot ask its own (not yet built) Track where `@hair+70` is, but shortcut decks, ramps and gates need world x/z/yaw.
// So we build the BASE def (no shortcuts, no dressing) once, headless, and ask that. Cached per base-def factory; ~50 ms once.
import { Track } from '../../Track.js';

/**
 * @param {() => object} makeBase returns the base def (it is called once; strip nothing, this helper does that)
 * @returns {{ track: () => Track, at: (s: number|string, lateral?: number, dyaw?: number) => {x:number,y:number,z:number,yaw:number,s:number,width:number,bank:number}, S:(v:number|string)=>number }}
 */
export function routeGeom(makeBase) {
  let t = null;
  const track = () => (t ??= new Track({ ...makeBase(), dress: undefined, materials: undefined, shortcuts: [], ramps: [], patches: [], boostPads: [] }, { headless: true }));
  const S = (v) => track().S(v);
  const at = (v, lateral = 0, dyaw = 0) => {
    const tr = track(), s = tr.S(v), q = tr.sample(s, {});
    return {
      x: q.pos.x + q.right.x * lateral, z: q.pos.z + q.right.z * lateral, y: q.pos.y - lateral * Math.tan(q.banking),
      yaw: Math.atan2(q.tangent.x, q.tangent.z) + dyaw, s, width: q.width, bank: q.banking,
    };
  };
  return { track, at, S };
}

/** Straight platform spec from world point A to world point B (start-edge centre at A). Heights are absolute. */
export function deckBetween(A, B, { width = 8, y0 = A.y, y1 = B.y, ...rest } = {}) {
  const dx = B.x - A.x, dz = B.z - A.z;
  return { x: A.x, z: A.z, yaw: Math.atan2(dx, dz), length: Math.hypot(dx, dz), width, y0, y1, ...rest };
}
