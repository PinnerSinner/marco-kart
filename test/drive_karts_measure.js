// Test helper (not a test): measures how a kart type drives on an open flat road. Used by drive_karts.test.js and the tuning report
// (`node test/drive_karts_measure.js` prints the table). Everything runs at the fixed 1/60 s step, deterministic, no walls.
import * as THREE from 'three';
import { KartPhysics, resolveKartCollisions } from '../src/kart/KartPhysics.js';
import { CHARACTERS, KARTS, statsFor } from '../src/core/roster.js';
import { SURFACE } from '../src/core/config.js';
import { FlatTrack, SurfaceTrack } from './drive_tracks.js';
import { speedClassInfo } from '../src/core/speedClass.js';

export const DT = 1 / 60;
const IN = (o = {}) => ({ throttle: 0, brake: 0, steer: 0, drift: false, ...o });

/** A fresh kart at the origin facing +Z. `opts.class` = speed class, `opts.char` = character id (default marco), `opts.track` */
export function makeKart(kartId, { char = 'marco', speedClass = 100, track = new FlatTrack(), id = `${char}-${kartId}` } = {}) {
  const k = new KartPhysics(track, { id, charId: char, kartId, stats: statsFor(char, kartId), speedClass });
  k.teleport(new THREE.Vector3(0, 0, 0), 0);
  return k;
}
export function run(k, seconds, input) {
  for (let i = 0; i < Math.round(seconds * 60); i++) k.update(DT, typeof input === 'function' ? input(i) : input);
}

/** Top speed after a long full-throttle run. */
export function topSpeed(kartId, o) { const k = makeKart(kartId, o); run(k, 25, IN({ throttle: 1 })); return k.speed; }

/** Seconds from standstill until `target` m/s is reached with full throttle (Infinity when it never is within 20 s). */
export function timeTo(kartId, target, o) {
  const k = makeKart(kartId, o);
  for (let i = 0; i < 20 * 60; i++) { k.update(DT, IN({ throttle: 1 })); if (k.speed >= target) return (i + 1) * DT; }
  return Infinity;
}

/** Seconds from standstill to 98 % of the kart's own top speed. */
export function timeToTop(kartId, o) { const k = makeKart(kartId, o); return timeTo(kartId, 0.98 * k.params.top, o); }

/** Steady full-lock turn radius (m) at a given forward speed held by the throttle. */
export function turnRadius(kartId, speed, o) {
  const k = makeKart(kartId, o);
  k.vel.set(0, 0, speed); k.speed = speed;
  const hold = () => IN({ steer: 1, throttle: k.speed < speed ? 1 : k.speed > speed + 1 ? 0 : 0.6 });
  run(k, 1.5, hold);
  const y0 = k.yaw, p0 = k.pos.clone(); let path = 0, last = p0.clone();
  for (let i = 0; i < 60; i++) { k.update(DT, hold()); path += k.pos.distanceTo(last); last.copy(k.pos); }
  const dyaw = Math.abs(k.yaw - y0);       // over 1 s
  return path / Math.max(dyaw, 1e-6);
}

/** Drift timings: seconds of a held, fully steered drift at 0.85 x top speed until each level; plus the mini-turbo paid at level 3. */
export function driftProfile(kartId, o) {
  const k = makeKart(kartId, o);
  const v = 0.85 * k.params.top;
  k.vel.set(0, 0, v); k.speed = v;
  run(k, 0.5, IN({ throttle: 1 }));
  k.update(DT, IN({ throttle: 1, steer: 1, drift: true }));
  const t = [0, 0, 0, 0]; let time = 0;
  while (k.drift.level < 3 && time < 8) {
    k.update(DT, IN({ throttle: 1, steer: 1, drift: true })); time += DT;
    if (!t[k.drift.level]) t[k.drift.level] = time;
  }
  const yaw0 = k.yaw; run(k, 0.5, IN({ throttle: 1, steer: 1, drift: true }));
  const arc = Math.abs(k.yaw - yaw0) / 0.5;      // rad/s at full inward steer
  const speedNow = k.speed;
  k.update(DT, IN({ throttle: 1, steer: 1, drift: false }));
  return { l1: t[1], l2: t[2], l3: t[3], arc, radius: speedNow / arc, miniSeconds: k.boost.time, miniPower: k.boost.power };
}

/** Top speed on grass as a fraction of top speed on the road. */
export function grassFraction(kartId, o) {
  const t = new SurfaceTrack();
  const k = makeKart(kartId, { ...o, track: t });
  k.teleport(new THREE.Vector3(30, 0, 0), 0);
  run(k, 14, IN({ throttle: 1 }));
  return k.speed / k.params.top;
}

/** Braking distance and time from 25 m/s with the brake held. */
export function brakeStop(kartId, o) {
  const k = makeKart(kartId, o);
  const v0 = 25 * speedClassInfo(o?.speedClass ?? 100).speed;          // from 25 m/s at 100 Mbps, scaled with the class: the stopping distance is then the same at every class
  k.vel.set(0, 0, v0); k.speed = v0; const z0 = k.pos.z; let t = 0;
  while (k.speed > 0.5 && t < 10) { k.update(DT, IN({ brake: 1 })); t += DT; }
  return { time: t, dist: k.pos.z - z0 };
}

/** Head-on bump at a closing speed of 20 m/s against a fixed reference kart: velocity change (m/s) of each and the subject's stagger. */
export function bump(kartA, kartB, o) {
  const a = makeKart(kartA, { ...o, id: 'a' }), b = makeKart(kartB, { ...o, id: 'b' });
  b.teleport(new THREE.Vector3(2.0, 0, 0), 0);
  a.vel.set(0, 0, 10); b.vel.set(0, 0, -10); a.pos.set(0, 0, 0); b.pos.set(0, 0, 2.2);
  a.yaw = 0; b.yaw = Math.PI;
  const va = a.vel.clone(), vb = b.vel.clone();
  resolveKartCollisions([a, b]);
  return { dvA: a.vel.distanceTo(va), dvB: b.vel.distanceTo(vb), staggerA: a._stagger, staggerB: b._stagger, a, b };
}

/** Hop: apex height (m) and airtime (s) of a drift hop at speed. */
export function hopStats(kartId, o) {
  const k = makeKart(kartId, o); run(k, 6, IN({ throttle: 1 }));
  k.update(DT, IN({ throttle: 1, steer: 0.0, drift: true }));
  let apex = 0, t = DT;
  while (!k.grounded && t < 3) { k.update(DT, IN({ throttle: 1, drift: true })); apex = Math.max(apex, k.pos.y); t += DT; }
  return { apex, air: t };
}

/** Yaw rate (rad/s) achievable in the air at 20 m/s with full steer, relative to the same kart on the road. */
export function airControl(kartId, o) {
  const k = makeKart(kartId, o); k.vel.set(0, 0, 25); k.speed = 25; run(k, 0.5, IN({ throttle: 1 }));
  k.launch(14); const y0 = k.yaw; let t = 0;
  while (!k.grounded && t < 0.6) { k.update(DT, IN({ throttle: 1, steer: 1 })); t += DT; }
  return Math.abs(k.yaw - y0) / t;
}

/** Everything in one object for a kart type. */
export function measure(kartId, o) {
  const top = topSpeed(kartId, o);
  const c = speedClassInfo(o?.speedClass ?? 100).speed;                 // the "25 m/s" reference speed is 25 * c, so a class is comparable with 100 Mbps
  return {
    kart: kartId, top, t25: timeTo(kartId, 25 * c, o), tTop: timeToTop(kartId, o),
    r25: turnRadius(kartId, 25 * c, o), rTop: turnRadius(kartId, top * 0.95, o),
    drift: driftProfile(kartId, o), grass: grassFraction(kartId, o), brake: brakeStop(kartId, o), hop: hopStats(kartId, o), air: airControl(kartId, o),
  };
}

/**
 * Each kart's key numbers relative to the cruiser (1.00 = the same), for the feel spread table.
 * Higher is "more": top speed, acceleration (inverse of the 0-25 time), turn tightness (inverse of the radius at 25 m/s and at top speed),
 * drift tightness (inverse of the drift arc radius), grass speed kept, braking (inverse of the stopping distance), air control.
 */
export function spreadVsCruiser(o) {
  const base = measure('cruiser', o);
  const rows = {};
  for (const kt of KARTS) {
    const m = kt.id === 'cruiser' ? base : measure(kt.id, o);
    rows[kt.id] = {
      top: m.top / base.top, accel: base.t25 / m.t25, turn: base.r25 / m.r25, turnTop: base.rTop / m.rTop, drift: base.drift.radius / m.drift.radius,
      driftCharge: base.drift.l3 / m.drift.l3, mini: (m.drift.miniSeconds * m.drift.miniPower) / (base.drift.miniSeconds * base.drift.miniPower),
      grass: m.grass / base.grass, brake: base.brake.dist / m.brake.dist, air: m.air / base.air,
    };
  }
  return rows;
}

// `node test/drive_karts_measure.js [--class 150] [--char rex] [--spread] [--classes]` prints the comparison table
// --spread: every kart relative to the cruiser; --classes: the table at 50 / 100 / 150 / 200 Mbps (turn radii, drift arcs and braking distances stay the same,
// times shrink with the class)
if (process.argv[1] && process.argv[1].endsWith('drive_karts_measure.js')) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
  const o = { speedClass: Number(opt('class', 100)), char: opt('char', 'marco') };
  const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '  inf');
  console.log(`class ${o.speedClass} Mbps, character ${o.char}`);
  console.log('kart     top   0-25   toTop  r@25  r@top  L1    L2    L3    arcR  mini(s x p)   grass  brake(m)  hop(m/s)  air');
  for (const kt of KARTS) {
    const m = measure(kt.id, o);
    console.log(`${kt.id.padEnd(8)} ${f(m.top, 1)}  ${f(m.t25)}   ${f(m.tTop)}   ${f(m.r25, 1)}  ${f(m.rTop, 1)}  ${f(m.drift.l1)}  ${f(m.drift.l2)}  ${f(m.drift.l3)}  ${f(m.drift.radius, 1)}  ${f(m.drift.miniSeconds)} x ${f(m.drift.miniPower)}   ${f(m.grass)}   ${f(m.brake.dist, 1)}      ${f(m.hop.apex)}/${f(m.hop.air)}  ${f(m.air)}`);
  }
  if (args.includes('--spread')) {
    const sp = spreadVsCruiser(o);
    console.log('\nrelative to the cruiser (1.00): top  accel turn@25 turn@top drift  charge mini  grass brake air');
    for (const kt of KARTS) { const r = sp[kt.id]; console.log(`${kt.id.padEnd(8)}                        ${[r.top, r.accel, r.turn, r.turnTop, r.drift, r.driftCharge, r.mini, r.grass, r.brake, r.air].map((v) => f(v).padStart(5)).join(' ')}`); }
  }
  if (args.includes('--classes')) {
    for (const cls of [50, 100, 150, 200]) {
      console.log(`\n-- ${cls} Mbps`);
      for (const kt of KARTS) { const m = measure(kt.id, { ...o, speedClass: cls }); console.log(`${kt.id.padEnd(8)} top ${f(m.top, 1)}  0-25 ${f(m.t25)}  toTop ${f(m.tTop)}  r@25 ${f(m.r25, 1)}  r@top ${f(m.rTop, 1)}  arc ${f(m.drift.radius, 1)}  brake ${f(m.brake.dist, 1)} m  hop ${f(m.hop.apex)} m`); }
    }
  }
  const pairs = [['hauler', 'buggy'], ['hauler', 'cruiser'], ['cruiser', 'buggy'], ['rocket', 'cruiser'], ['rocket', 'rocket']];
  for (const [a, b] of pairs) { const r = bump(a, b, o); console.log(`bump ${a} vs ${b}: dv ${f(r.dvA, 1)} / ${f(r.dvB, 1)}  stagger ${f(r.staggerA)} / ${f(r.staggerB)}`); }
  void CHARACTERS; void SURFACE;
}
