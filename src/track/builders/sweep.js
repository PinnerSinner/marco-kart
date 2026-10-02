// Sweep: extrudes a 2D cross-section (profile) along a stretch of the road. The workhorse for tunnels, glass tubes, rack canyons,
// gantry arches, hedges, cable trays, glowing edge rails, bridges' parapets and anything else that follows the road.
// One call = ONE mesh (ranges and ribs are merged into the same geometry).
import * as THREE from 'three';
import { Geo } from './Geo.js';
import { wrapS } from '../../core/util.js';

const col = new THREE.Color(), col2 = new THREE.Color();

/**
 * @typedef {object} SweepSpec
 * @property {number|string} from @property {number|string} to lap range in metres or '@mark+offset' (wraps through the line)
 * @property {Array<[number, number]>} profile cross-section points [lateral, up] in metres (lateral + = right of travel,
 *   up measured from the road surface). Consecutive points form a strip. Orientation: a strip running LEFT to RIGHT (increasing
 *   lateral) faces UP, e.g. floors; a ceiling meant to be seen from below therefore runs right to left. Use a THREE.DoubleSide material to see both sides.
 * @property {THREE.Material} material any material (vertexColors are supplied: uv.x = profile length / uvTile, uv.y = s / uvTile)
 * @property {number} [step=2] station spacing along the road (m)
 * @property {'road'|'flat'} [frame='road'] 'road' banks the profile with the road; 'flat' keeps up = world up
 * @property {number|THREE.Color|((k:number, s:number)=>THREE.Color)} [colour=0xffffff] vertex colour; a function gets the profile
 *   point index and s (return a Color, it is copied immediately)
 * @property {number} [uvTile=4] metres per texture repeat
 * @property {number} [every] with `length`: repeat a short segment every `every` metres from `from` to `to` (tunnel ribs, arches)
 * @property {number} [length] length of each repeated segment (m)
 * @property {boolean} [shadow=false] cast shadows
 * @property {string} [name]
 */

/**
 * Build a swept mesh. Returns null when the track is headless.
 * @param {import('../Track.js').Track} track
 * @param {SweepSpec} spec
 * @returns {THREE.Mesh|null}
 */
export function buildSweep(track, spec) {
  if (track.headless) return null;
  const { profile, material, step = 2, frame = 'road', uvTile = 4 } = spec;
  if (!profile || profile.length < 2) throw new Error('sweep: profile needs at least two points');
  const L = track.length;
  const ranges = [];
  const a = track.S(spec.from);
  let b = track.S(spec.to); if (b <= a) b += L;
  if (spec.every && spec.length) for (let s = a; s + spec.length <= b + 1e-6; s += spec.every) ranges.push([s, s + spec.length]);
  else ranges.push([a, b]);

  const g = new Geo(), sm = {}, pl = [];
  let acc = 0;
  for (let k = 0; k < profile.length; k++) { if (k) acc += Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]); pl.push(acc); }
  const colourOf = (k, s) => {
    const c = spec.colour;
    if (typeof c === 'function') return col2.copy(c(k, s));
    if (c && c.isColor) return col2.copy(c);
    return col2.set(c ?? 0xffffff);
  };
  const point = (s, lat, up, out) => {
    track.sample(s, sm);
    const tb = Math.tan(sm.banking);
    if (frame === 'flat') {
      out.x = sm.pos.x + sm.right.x * lat; out.z = sm.pos.z + sm.right.z * lat; out.y = sm.pos.y - lat * tb + up;
    } else {
      const inv = 1 / Math.sqrt(1 + tb * tb), rx = sm.right.x * inv, rz = sm.right.z * inv, ry = -tb * inv;
      out.x = sm.pos.x + rx * lat + sm.up.x * up; out.z = sm.pos.z + rz * lat + sm.up.z * up; out.y = sm.pos.y + ry * lat + sm.up.y * up;
    }
    return out;
  };
  const P = new THREE.Vector3(), N = new THREE.Vector3(), rightV = new THREE.Vector3(), upV = new THREE.Vector3();
  for (const [r0, r1] of ranges) {
    const n = Math.max(1, Math.ceil((r1 - r0) / step));
    const rows = [];
    for (let i = 0; i <= n; i++) {
      const s = wrapS(r0 + ((r1 - r0) * i) / n, L), sAbs = r0 + ((r1 - r0) * i) / n;
      track.sample(s, sm);
      const tb = Math.tan(sm.banking), inv = 1 / Math.sqrt(1 + tb * tb);
      if (frame === 'flat') { rightV.copy(sm.right); upV.set(0, 1, 0); } else { rightV.set(sm.right.x * inv, -tb * inv, sm.right.z * inv); upV.copy(sm.up); }
      const row = [];
      for (let k = 0; k < profile.length - 1; k++) {
        const [l0, u0] = profile[k], [l1, u1] = profile[k + 1];
        const dl = l1 - l0, du = u1 - u0, len = Math.hypot(dl, du) || 1;
        const nl = -du / len, nu = dl / len;                       // 2D normal: direction rotated +90 degrees
        N.copy(rightV).multiplyScalar(nl).addScaledVector(upV, nu);
        const pair = [];
        for (const [j, l, u] of [[k, l0, u0], [k + 1, l1, u1]]) {
          point(s, l, u, P); const c = colourOf(j, s);
          pair.push(g.vert(P.x, P.y, P.z, N.x, N.y, N.z, pl[j] / uvTile, sAbs / uvTile, c.r, c.g, c.b));
        }
        row.push(pair);
      }
      rows.push(row);
    }
    for (let i = 0; i < n; i++) for (let k = 0; k < profile.length - 1; k++) {
      const A = rows[i][k], B = rows[i + 1][k];
      g.quadN(A[0], A[1], B[1], B[0]);
    }
  }
  if (!g.vertexCount) return null;
  const mesh = new THREE.Mesh(g.build(), material);
  mesh.name = spec.name ?? 'sweep'; mesh.castShadow = !!spec.shadow; mesh.receiveShadow = true;
  return mesh;
}
