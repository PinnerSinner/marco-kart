// Blighty bus garages and the double-deckers that cross the road between them. The garages seal the open junction mouths (capsule
// colliders on their fronts, bay sides and back walls), so the only way "through" is the bay - a dead end.
import * as THREE from 'three';
import { depotGeo, doubleDeckerGeo } from './props.js';
import { SIGN_IDS, WIN } from './atlas.js';

const W = 36, DEPTH = 15, DOOR = 6.4, OFF = 10.6, BUS_LEN = 10.4, SPEED = 9;

/** local (lx, lz) of a depot placed at (ox, oz) with yaw ry -> world [x, z] */
const toWorld = (ox, oz, ry, lx, lz) => [ox + Math.cos(ry) * lx + Math.sin(ry) * lz, oz - Math.sin(ry) * lx + Math.cos(ry) * lz];

/**
 * @param {object} kit @param {object|null} M materials (null when headless: only colliders + obstacles are created)
 * @param {object} A atlases (signs)
 */
export function buildDepots(kit, M, A) {
  const { track, statics, obstacles } = kit, model = track.model, sm = {};
  const geo = kit.headless ? null : depotGeo({ w: W, depth: DEPTH, h: 9.5, door: DOOR, doorH: 5.4 });
  const busGeo = kit.headless ? null : doubleDeckerGeo().build();
  // departure times (s) of the first crossing of each bus, cycle waits
  const plan = [
    { mark: 'j1', buses: [{ from: -1, depart: 14, wait: 22 }, { from: 1, depart: 27, wait: 22 }] },
    { mark: 'j2', buses: [{ from: 1, depart: 20, wait: 20 }, { from: -1, depart: 32, wait: 20 }] },
  ];
  for (const j of plan) {
    const s = track.S(`@${j.mark}`); track.sample(s, sm);
    const yt = Math.atan2(sm.tangent.x, sm.tangent.z), half = sm.width / 2, y = sm.pos.y - 0.02;
    for (const side of [-1, 1]) {
      const lat = side * (half + OFF), ox = sm.pos.x + sm.right.x * lat, oz = sm.pos.z + sm.right.z * lat, ry = yt + side * Math.PI / 2;
      // colliders: front walls either side of the door, the bay sides and the back wall
      const c = (a, b, r) => { const [ax, az] = toWorld(ox, oz, ry, a[0], a[1]), [bx, bz] = toWorld(ox, oz, ry, b[0], b[1]); model.addCapsule(ax, az, bx, bz, r); };
      c([-W / 2, -0.4], [-DOOR / 2 - 0.2, -0.4], 0.9); c([DOOR / 2 + 0.2, -0.4], [W / 2, -0.4], 0.9);
      c([-DOOR / 2 - 0.5, -0.4], [-DOOR / 2 - 0.5, -DEPTH + 0.8], 0.7); c([DOOR / 2 + 0.5, -0.4], [DOOR / 2 + 0.5, -DEPTH + 0.8], 0.7);
      c([-DOOR / 2, -DEPTH + 0.9], [DOOR / 2, -DEPTH + 0.9], 0.8);
      if (!kit.headless) {
        statics.at(M.brick, ox, oz).merge(geo, { x: ox, y, z: oz, ry });
        const [sx, sz] = toWorld(ox, oz, ry, 0, 0.62);
        statics.at(M.sign, ox, oz).panel(8.4, 1.58, { x: sx, y: y + 5.95, z: sz, ry, uv: A.signs.uv(SIGN_IDS.garage), colour: 0xffffff, ao: 0 });
        // high windows either side of the door
        for (const k of [-1, 1]) for (let i = 0; i < 4; i++) {
          const wx = k * (DOOR / 2 + 3.4 + i * 3.1); if (Math.abs(wx) > W / 2 - 1.2) continue;
          const [wx0, wz0] = toWorld(ox, oz, ry, wx, 0.05);
          statics.at(M.win, ox, oz).panel(1.6, 2.4, { x: wx0, y: y + 5.2, z: wz0, ry, uv: A.atlas.uv(i % 2 ? WIN.sash4 : WIN.arch), colour: 0xffffff, ao: 0 });
        }
        for (const k of [-1, 1]) { const [px, pz] = toWorld(ox, oz, ry, k * (W / 2 - 4), 0.2); statics.at(M.sign, ox, oz).panel(5.2, 1.0, { x: px, y: y + 7.6, z: pz, ry, uv: A.signs.uv(SIGN_IDS.depot), colour: 0xffffff, ao: 0 }); }
      }
    }
    // buses
    const dLat = half + OFF + 9.2;
    j.buses.forEach((b, i) => {
      const a = [sm.pos.x + sm.right.x * b.from * dLat, sm.pos.z + sm.right.z * b.from * dLat], e = [sm.pos.x - sm.right.x * b.from * dLat, sm.pos.z - sm.right.z * b.from * dLat];
      const drive = Math.hypot(e[0] - a[0], e[1] - a[1]) / SPEED, cyc = drive + b.wait;
      obstacles.path({
        id: `bus-${j.mark}-${i}`, kind: 'bus', points: [a, e], speed: SPEED, mode: 'cross', wait: b.wait, phase: cyc - b.depart, length: 9, radius: 2.1, hit: 'spin',
        mesh: kit.headless ? undefined : () => { const m = new THREE.Mesh(busGeo, M.bus); m.castShadow = true; m.name = 'bus'; return m; },
      });
    });
  }
  void BUS_LEN;
}
