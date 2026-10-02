// Obstacle helpers: static circles and moving vehicles along a path. Entries land in track.obstacles
// ({ id, kind, pos, radius, active, hit }) and are advanced by Track.update(dt, time), deterministically from `time`.
import * as THREE from 'three';

/**
 * @param {import('../Track.js').Track} track
 * @param {(fn:(dt:number,t:number)=>void)=>void} animate register a per-frame callback
 * @param {(o:THREE.Object3D)=>void} addToScene
 */
export function makeObstacleHelpers(track, animate, addToScene) {
  const q = { height: 0, normal: new THREE.Vector3(), surface: '', onRoad: false, s: 0, lateral: 0, inVoid: false };
  const v = new THREE.Vector3();
  const groundY = (x, z, yRef) => { v.set(x, yRef ?? 1e4, z); track.query(v, q); return q.height; };
  return {
    /**
     * Static circular hazard (cone, barrier, statue base...). Karts bump or spin on overlap (Race decides using `hit`).
     * @param {{id?:string, kind?:string, x:number, z:number, radius?:number, hit?:'spin'|'bump', mesh?:THREE.Object3D}} o
     */
    static({ id, kind = 'cone', x, z, radius = 1, hit = 'bump', mesh } = {}) {
      const o = { id: id ?? `${kind}${track.obstacles.length}`, kind, pos: new THREE.Vector3(x, groundY(x, z), z), radius, active: true, hit };
      track.obstacles.push(o);
      if (mesh) { mesh.position.copy(o.pos); addToScene(mesh); }
      return o;
    },

    /**
     * A vehicle (or anything long) driving along a polyline. Body collision is a row of circles along its length.
     * mode 'loop' (closed circuit), 'pingpong' (back and forth) or 'cross' (drive once per cycle then wait out of sight).
     * Everything is a pure function of `time`, so it is deterministic and frame-rate independent.
     * @param {object} o
     * @param {string} o.id @param {string} [o.kind='bus'] @param {Array<[number,number]>} o.points path in world (x, z)
     * @param {number} o.speed m/s (for 'cross': speed while driving)
     * @param {'loop'|'pingpong'|'cross'} [o.mode='loop']
     * @param {number} [o.phase=0] 0..1 of the cycle at time 0 (loop/pingpong) or seconds offset (cross)
     * @param {number} [o.wait=6] seconds parked/hidden between crossings (cross)
     * @param {number} [o.length=9] body length (m); circles are spread along it
     * @param {number} [o.radius=2.1] circle radius (m)
     * @param {'spin'|'bump'} [o.hit='spin']
     * @param {()=>THREE.Object3D} [o.mesh] factory (skipped when headless); origin = body centre on the ground, faces +Z
     * @returns {{ entries: object[], object: THREE.Object3D|null, position: (t:number)=>{x:number,z:number,yaw:number,active:boolean} }}
     */
    path(o) {
      const pts = o.points, n = pts.length, mode = o.mode ?? 'loop', closed = mode === 'loop';
      const seg = [], cum = [0];
      const last = closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
        seg.push({ a, dx: dx / l, dz: dz / l, l }); cum.push(cum[i] + l);
      }
      const total = cum[cum.length - 1];
      const length = o.length ?? 9, radius = o.radius ?? 2.1, hit = o.hit ?? 'spin', kind = o.kind ?? 'bus';
      const count = Math.max(1, Math.round(length / (radius * 1.5)));
      const offsets = Array.from({ length: count }, (_, k) => (count === 1 ? 0 : -length / 2 + radius + (k * (length - 2 * radius)) / (count - 1)));
      const entries = offsets.map((off, k) => {
        const e = { id: `${o.id}#${k}`, kind, pos: new THREE.Vector3(), radius, active: true, hit, group: o.id, offset: off };
        track.obstacles.push(e); return e;
      });
      const dwell = o.wait ?? 6;
      const state = { x: 0, z: 0, yaw: 0, active: true };
      const position = (t) => {
        let d, active = true;
        if (mode === 'cross') {
          const drive = total / o.speed, cyc = drive + dwell;
          let u = ((t + (o.phase ?? 0)) % cyc + cyc) % cyc;
          if (u > drive) { active = false; u = drive; }
          d = (u / drive) * total;
        } else if (mode === 'pingpong') {
          const cyc = (2 * total) / o.speed; let u = (((t * o.speed) + (o.phase ?? 0) * 2 * total) % (2 * total) + 2 * total) % (2 * total);
          d = u <= total ? u : 2 * total - u; void cyc;
        } else d = ((t * o.speed + (o.phase ?? 0) * total) % total + total) % total;
        let i = 0; while (i < seg.length - 1 && cum[i + 1] < d) i++;
        const sg = seg[i], k = Math.min(sg.l, Math.max(0, d - cum[i]));
        let fx = sg.dx, fz = sg.dz;
        if (mode === 'pingpong' && ((t * o.speed + (o.phase ?? 0) * 2 * total) % (2 * total) + 2 * total) % (2 * total) > total) { fx = -fx; fz = -fz; }
        state.x = sg.a[0] + sg.dx * k; state.z = sg.a[1] + sg.dz * k; state.yaw = Math.atan2(fx, fz); state.active = active;
        return state;
      };
      let object = null;
      if (o.mesh && !track.headless) { object = o.mesh(); addToScene(object); }
      const apply = (t) => {
        const s = position(t), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
        const gy = groundY(s.x, s.z, undefined);
        for (const e of entries) { e.pos.set(s.x + fx * e.offset, gy, s.z + fz * e.offset); e.active = s.active; }
        if (object) { object.position.set(s.x, gy, s.z); object.rotation.y = s.yaw; object.visible = s.active; }
      };
      apply(0);
      animate((dt, t) => apply(t));
      return { entries, object, position };
    },
  };
}
