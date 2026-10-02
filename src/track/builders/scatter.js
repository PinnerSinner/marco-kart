// Placement helpers: positions along the spline with offsets and jitter, and blue-noise scattering over areas.
// All take a seeded rng (kit.rng) so layouts are reproducible. Points are snapped to the ground via track.query.
import * as THREE from 'three';
import { wrapS } from '../../core/util.js';

/**
 * @typedef {object} Spot
 * @property {number} x @property {number} y @property {number} z world position on the ground
 * @property {number} s arc length of the nearest centreline point @property {number} lateral signed metres from it
 * @property {number} yaw heading that FACES THE ROAD from the spot (props "look" at the track); use yaw + PI to face away
 * @property {number} along heading parallel to the road direction at the spot
 * @property {-1|1} side -1 = left of the road, +1 = right
 * @property {string} surface ground surface under the spot
 */

export function makePlacers(track, rng) {
  const q = { height: 0, normal: new THREE.Vector3(), surface: '', onRoad: false, s: 0, lateral: 0, inVoid: false };
  const v = new THREE.Vector3(), sm = {};

  /** Ground info at (x, z). Returns a Spot (fresh object) or null when in the void. */
  const spotAt = (x, z) => {
    v.set(x, 1e4, z); track.query(v, q);
    if (q.inVoid) return null;
    const s = track.sample(q.s, sm);
    const side = q.lateral >= 0 ? 1 : -1;
    const along = Math.atan2(s.tangent.x, s.tangent.z);
    return { x, y: q.height, z, s: q.s, lateral: q.lateral, side, along, yaw: along + (side > 0 ? Math.PI / 2 : -Math.PI / 2), surface: q.surface, onRoad: q.onRoad };
  };

  const api = {
    spotAt,

    /**
     * Walk along the road every `every` metres and place items beside it.
     * @param {object} o
     * @param {number|string} [o.from=0] @param {number|string} [o.to=track.length] s range ('@mark' allowed)
     * @param {number} o.every spacing (m) @param {'left'|'right'|'both'} [o.side='both']
     * @param {number} o.offset metres beyond the ROAD EDGE (not the wall) @param {number} [o.jitterAlong=0] @param {number} [o.jitterOffset=0]
     * @param {(spot:Spot)=>boolean} [o.filter] return false to skip a spot
     * @param {number} [o.chance=1] probability of keeping each spot
     * @returns {Spot[]}
     */
    along({ from = 0, to = track.length, every = 10, side = 'both', offset = 4, jitterAlong = 0, jitterOffset = 0, filter, chance = 1 } = {}) {
      const s0 = track.S(from); let s1 = track.S(to); if (s1 <= s0) s1 += track.length;
      const out = [];
      for (let s = s0; s < s1; s += every) {
        for (const sg of side === 'both' ? [-1, 1] : [side === 'left' ? -1 : 1]) {
          if (chance < 1 && rng() > chance) continue;
          const ss = wrapS(s + (jitterAlong ? rng.range(-jitterAlong, jitterAlong) : 0), track.length);
          const smp = track.sample(ss, sm), lat = sg * (smp.width / 2 + offset + (jitterOffset ? rng.range(-jitterOffset, jitterOffset) : 0));
          const px = smp.pos.x + smp.right.x * lat, pz = smp.pos.z + smp.right.z * lat;
          const sp = spotAt(px, pz);
          if (!sp || sp.onRoad) continue;
          if (filter && !filter(sp)) continue;
          out.push(sp);
        }
      }
      return out;
    },

    /**
     * Blue-noise scatter in a rectangle. Rejects spots on or within `roadMargin` m of the road and anything `filter` refuses.
     * @param {object} o { rect:[x0,z0,x1,z1], minDist, count?, roadMargin=3, filter }
     * @returns {Spot[]}
     */
    scatter({ rect, minDist = 6, count = Infinity, roadMargin = 3, filter, tries = 30 } = {}) {
      const [x0, z0, x1, z1] = rect, cs = minDist / Math.SQRT2, gw = Math.ceil((x1 - x0) / cs), gh = Math.ceil((z1 - z0) / cs);
      const grid = new Int32Array(gw * gh).fill(-1), out = [];
      const attempts = Math.min(count === Infinity ? 1e9 : count * tries, Math.ceil(((x1 - x0) * (z1 - z0)) / (minDist * minDist)) * tries);
      for (let a = 0; a < attempts && out.length < count; a++) {
        const x = rng.range(x0, x1), z = rng.range(z0, z1), gx = Math.floor((x - x0) / cs), gz = Math.floor((z - z0) / cs);
        let ok = true;
        for (let j = Math.max(0, gz - 2); j <= Math.min(gh - 1, gz + 2) && ok; j++) for (let i = Math.max(0, gx - 2); i <= Math.min(gw - 1, gx + 2); i++) {
          const k = grid[j * gw + i]; if (k < 0) continue;
          const dx = out[k].x - x, dz = out[k].z - z; if (dx * dx + dz * dz < minDist * minDist) { ok = false; break; }
        }
        if (!ok) continue;
        const sp = spotAt(x, z);
        if (!sp || sp.onRoad || Math.abs(sp.lateral) < track.widthAt(sp.s) / 2 + roadMargin) continue;
        if (filter && !filter(sp)) continue;
        grid[gz * gw + gx] = out.length; out.push(sp);
      }
      return out;
    },

    /** Points on a circle (cx, cz, r) - handy for roundabout dressing. */
    ring(cx, cz, r, n, phase = 0) {
      return Array.from({ length: n }, (_, k) => { const a = phase + (k / n) * Math.PI * 2; return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, angle: a }; });
    },
  };
  return api;
}
