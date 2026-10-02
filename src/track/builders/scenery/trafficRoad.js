// Keep a moving obstacle (hazards/traffic.js addTraffic) at the height of the road it drives on.
//
// kit.obstacles.path asks the track for the ground under the vehicle from 10 km up. On a LAYERED track (roads that cross over one another: the
// Data Centre's bridge, Marcoverse's corkscrew and viaduct) that picks the highest road in reach, which can be a deck far above or a road
// 100 m away at a different height, so the vehicle (and the rampable frame built from it) would sit at the wrong height or in the void.
// This adds a second animation callback, registered after the path's own, that re-asks with a height hint taken from the vehicle's own lane.
import * as THREE from 'three';

const _q = { height: 0, normal: new THREE.Vector3(), surface: '', onRoad: false, s: 0, lateral: 0, inVoid: false };
const _v = new THREE.Vector3();

/**
 * @param {object} kit @param {{ path: { position:(t:number)=>{x:number,z:number}, entries:object[], object:THREE.Object3D|null } }} r the result of addTraffic
 * @param {{ at:(s:number, lat?:number)=>{x:number,y:number,z:number} }} G the route @param {number} from start station (m) @param {number} to end station (m) @param {number} lat lane
 */
export function pinToRoad(kit, r, G, from, to, lat) {
  const L = kit.track.length, a = from, b = to < a ? to + L : to, ref = [];
  for (let s = a; s < b + 6; s += 6) { const p = G.at(((s % L) + L) % L, lat); ref.push(p.x, p.z, p.y); }
  const height = (x, z) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < ref.length; i += 3) { const dx = ref[i] - x, dz = ref[i + 1] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
    _v.set(x, ref[bi + 2] + 0.6, z); kit.track.query(_v, _q);
    return _q.height;
  };
  const fix = (dt, t) => {
    const st = r.path.position(t), y = height(st.x, st.z);
    for (const e of r.path.entries) e.pos.y = y;
    if (r.path.object) r.path.object.position.y = y;
  };
  fix(0, 0);
  kit.animate(fix);
}
