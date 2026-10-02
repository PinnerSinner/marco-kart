// Timing rig shared by the Data Centre and Marcoverse set-pieces (timed gates, gusts, lasers, arms, portals, flickering decks).
//
// Everything that changes with time is a pure function of ONE clock so that what you see is what hits you:
//   * while a Race is running the clock is `race.time` (Race calls `track.updateKart(kart, dt, race)` every fixed step). This also works in
//     headless sims that never call `track.update` (test/race_sim_report.mjs builds Race without `updateTrack`).
//   * before the race (intro, countdown, demos, the tracks bot) it is the `time` handed to `kit.animate` by `Track.update`.
// `state(fn)` callbacks own the physics side (obstacle.active / pos, platform.enabled / x / z, patch kinds) and run once per clock change;
// `look(fn)` callbacks own meshes and materials and run once per rendered frame; `kart(fn)` callbacks see every kart every fixed step.
import * as THREE from 'three';

/** Position in a cycle, 0..1. */
export const cyc = (t, period, offset = 0) => ((((t + offset) % period) + period) % period) / period;

/** Smooth 0..1 ramp. */
export const smooth = (a, b, v) => { const u = Math.min(1, Math.max(0, (v - a) / (b - a || 1e-9))); return u * u * (3 - 2 * u); };

export function makeRig(kit) {
  const track = kit.track;
  const rig = { t: 0, raceClock: false, _last: NaN, _states: [], _looks: [], _karts: [], _prev: track.updateKart };

  rig.state = (fn) => { rig._states.push(fn); return rig; };
  rig.look = (fn) => { if (!kit.headless) rig._looks.push(fn); return rig; };
  rig.kart = (fn) => { rig._karts.push(fn); return rig; };

  const runStates = (t) => { rig.t = t; for (let i = 0; i < rig._states.length; i++) rig._states[i](t); };

  /** Call once, after every state / look / kart callback is registered. */
  rig.install = () => {
    runStates(0);
    track.updateKart = (kart, dt, race) => {
      rig._prev?.(kart, dt, race);
      const t = race?.time ?? rig.t;
      if (!rig.raceClock || t !== rig._last) { rig.raceClock = true; rig._last = t; runStates(t); }
      for (let i = 0; i < rig._karts.length; i++) rig._karts[i](kart, dt, race, t);
    };
    let prevT = 0;
    kit.animate((dt, tt) => {
      const t = rig.raceClock ? rig.t : tt;
      if (!rig.raceClock && t !== rig._last) { rig._last = t; runStates(t); }
      const d = Math.max(0, t - prevT); prevT = t;
      for (let i = 0; i < rig._looks.length; i++) rig._looks[i](t, d);
    });
  };
  return rig;
}

/** Translate a Platform (world-baked mesh follows through `pf.mesh.position`). dx / dz are displacements from its authored position. */
export function shiftPlatform(pf, dx, dz) {
  if (pf._ox === undefined) { pf._ox = pf.x; pf._oz = pf.z; pf._omin = [pf.minX, pf.maxX, pf.minZ, pf.maxZ]; }
  pf.x = pf._ox + dx; pf.z = pf._oz + dz;
  pf.minX = pf._omin[0] + dx; pf.maxX = pf._omin[1] + dx; pf.minZ = pf._omin[2] + dz; pf.maxZ = pf._omin[3] + dz;
}

/** A hazard circle that the Race treats like any other track obstacle (kit.obstacles.static keeps it in `track.obstacles`). */
export function hazardCircle(kit, o) {
  const ob = kit.obstacles.static({ id: o.id, kind: o.kind ?? 'hazard', x: o.x, z: o.z, radius: o.radius ?? 1.5, hit: o.hit ?? 'bump' });
  if (o.y !== undefined) ob.pos.y = o.y;
  ob.active = o.active ?? false;
  return ob;
}

const _v = new THREE.Vector3();
/** Move a kart onto the road at (s, lateral), facing along it, keeping its speed. `lift` puts it slightly in the air (a warp out of a portal). */
export function warpKart(track, kart, s, lateral = 0, lift = 0.6, speedMul = 1) {
  const sm = track.sample(s, warpKart._sm ??= {}), sp = Math.max(kart.speed, 18) * speedMul;
  track.surfacePoint(s, lateral, _v);
  const yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
  kart.teleport(_v, yaw);
  kart.speed = sp; kart.vel.set(Math.sin(yaw) * sp, 0, Math.cos(yaw) * sp);
  if (lift > 0) { kart.pos.y += lift; kart.prevPos.y = kart.pos.y; kart.grounded = false; }
}
