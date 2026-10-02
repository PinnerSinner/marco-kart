// A simple pursuit-controller bot used by the tracks_* tests. Works with any kart exposing the KartPhysics interface.
import * as THREE from 'three';
import { loopDiff, wrapAngle, clamp } from '../src/core/util.js';

/**
 * Drive `laps` laps (or until `maxTime`). Returns stats.
 * @param {object} track @param {Function} KartClass constructor(track, opts)
 * @param {{ laps?: number, maxTime?: number, lookBase?: number, lookSpeed?: number, aim?: (s:number)=>number, startS?: number, lateralAt?: (s:number)=>number, onStep?: Function }} [o]
 */
export function driveLaps(track, KartClass, { laps = 1, maxTime = 400, lookBase = 7, lookSpeed = 0.5, lateralAt = () => 0, slot = 0, stats } = {}) {
  const kart = new KartClass(track, { id: 'bot', charId: 'marco', kartId: 'cruiser', stats: stats ?? { speed: 3, accel: 3, handling: 3, weight: 3 } });
  const g = track.gridSlot(slot);
  kart.teleport(g.pos, g.heading);
  const q = { height: 0, normal: new THREE.Vector3(), surface: 'road', onRoad: true, s: 0, lateral: 0, inVoid: false };
  const tgt = new THREE.Vector3(), sm = {}, dt = 1 / 60;
  track.query(kart.pos, q); let lastS = q.s, progress = loopDiff(0, q.s, track.length);
  const res = { finished: false, time: 0, fell: false, stuck: false, wallHits: 0, offRoadTime: 0, maxLateral: 0, airTime: 0, minSpeed: 1e9, laps: [] };
  let stuckT = 0, lapMark = 0, nanFound = false, prevSpeed = 0;
  const target = laps * track.length;
  for (let step = 0; step < maxTime * 60; step++) {
    track.query(kart.pos, q, lastS);
    const s = q.s;
    // curvature-aware look-ahead
    const look = lookBase + lookSpeed * Math.max(0, kart.speed);
    const sm2 = track.sample(s + look, sm);
    track.surfacePoint(s + look, lateralAt(s + look), tgt);
    const dx = tgt.x - kart.pos.x, dz = tgt.z - kart.pos.z;
    const err = wrapAngle(Math.atan2(dx, dz) - kart.yaw);
    const steer = clamp(-err * 2.2, -1, 1);
    // speed control from the sharpest curvature in the braking window
    let kmax = 0; for (let a = 8; a <= 28 + kart.speed * 1.2; a += 8) kmax = Math.max(kmax, Math.abs(track.curvatureAt(s + a)));
    const vT = clamp(1.45 / Math.max(kmax, 1e-4), 13, 60);
    const throttle = kart.speed < vT ? 1 : 0, brake = kart.speed > vT + 3 ? 1 : 0;
    kart.update(dt, { throttle, brake, steer, drift: false });
    if (!Number.isFinite(kart.pos.x + kart.pos.y + kart.pos.z + kart.speed + kart.yaw)) { nanFound = true; break; }
    res.time += dt;
    track.update(dt, res.time);
    const ds = loopDiff(lastS, q.s, track.length);
    if (Math.abs(ds) < 60) progress += ds;
    lastS = q.s;
    res.maxLateral = Math.max(res.maxLateral, Math.abs(q.lateral));
    if (!q.onRoad) res.offRoadTime += dt;
    if (!kart.grounded) res.airTime += dt;
    res.minSpeed = Math.min(res.minSpeed, kart.speed);
    if (kart.speed < prevSpeed - 9 && kart.speed < 25) res.wallHits++;
    prevSpeed = kart.speed;
    if (kart.pos.y < track.killY + 0.5 || q.inVoid && kart.pos.y < q.height - 3) { res.fell = true; res.fellAt = q.s; break; }
    stuckT = kart.speed < 2.5 ? stuckT + dt : 0;
    if (stuckT > 6) { res.stuck = true; res.stuckAt = q.s; break; }
    if (progress - lapMark >= track.length) { res.laps.push(res.time); lapMark += track.length; }
    if (progress >= target) { res.finished = true; break; }
  }
  res.nan = nanFound; res.progress = progress; res.kart = kart;
  return res;
}
