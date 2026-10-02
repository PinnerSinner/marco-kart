// KartPhysics behaviour tests: stats mapping, steering convention, surfaces, walls, ramps, void, statuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StubTrack } from '../src/track/StubTrack.js';
import { KartPhysics, resolveKartCollisions } from '../src/kart/KartPhysics.js';
import { bus } from '../src/core/bus.js';
import { CFG } from '../src/core/config.js';
import { TUNING } from '../src/kart/kartTuning.js';
import { statsFor } from '../src/core/roster.js';
import { FlatTrack, HillTrack, EdgeVoidTrack, SurfaceTrack } from './drive_tracks.js';
import { makeBot, runLaps } from './drive_bot.js';

const DT = 1 / 60;
const IN = (o = {}) => ({ throttle: 0, brake: 0, steer: 0, drift: false, ...o });

/** Collect bus events for the duration of a callback-free scope. Returns { events, stop }. */
function record(names) {
  const events = [];
  const offs = names.map((n) => bus.on(n, (d) => events.push({ name: n, ...d })));
  return { events, stop: () => offs.forEach((f) => f()) };
}

function flatKart(stats = { speed: 3, accel: 3, handling: 3, weight: 3 }, id = 'k') {
  const k = new KartPhysics(new FlatTrack(), { id, stats });
  k.teleport(new THREE.Vector3(0, 0, 0), 0);
  return k;
}
function run(k, seconds, input) { for (let i = 0; i < Math.round(seconds * 60); i++) k.update(DT, typeof input === 'function' ? input(i) : input); }

test('interface: all public fields exist with the documented shapes', () => {
  const t = new StubTrack();
  const k = new KartPhysics(t, { id: 'a', charId: 'rex', kartId: 'hauler', stats: statsFor('rex', 'hauler') });
  assert.equal(k.id, 'a'); assert.equal(k.charId, 'rex'); assert.equal(k.kartId, 'hauler');
  for (const v of ['pos', 'vel']) assert.ok(k[v] instanceof THREE.Vector3);
  for (const n of ['yaw', 'pitch', 'roll', 'speed', 'maxSpeed', 'steer', 'airTime', 'slip', 'radius', 'mass', 'scale']) assert.equal(typeof k[n], 'number', n);
  assert.equal(typeof k.grounded, 'boolean');
  assert.deepEqual(Object.keys(k.drift).sort(), ['active', 'charge', 'dir', 'hop', 'level']);
  assert.deepEqual(Object.keys(k.boost).sort(), ['power', 'time']);
  for (const n of ['spin', 'stun', 'invincible', 'autopilot', 'respawning']) assert.ok(n in k.status, n);
  for (const n of ['s', 'lateral', 'surface', 'onRoad', 'inVoid', 'height', 'normal']) assert.ok(n in k.ground, n);
  for (const m of ['update', 'applyBoost', 'spinOut', 'shrink', 'setInvincible', 'launch', 'teleport']) assert.equal(typeof k[m], 'function', m);
  assert.equal(typeof resolveKartCollisions, 'function');
  const g = t.gridSlot(0); k.teleport(g.pos, g.heading);
  assert.ok(Math.abs(k.pos.y - 0) < 1e-9);
  assert.ok(k.grounded);
});

test('stats: top speed 30.5..35 m/s (TUNING.topSpeedMin..Max) and 0-to-top 4.2..2.4 s, monotonic per stat, for stats 1..5', () => {
  const rows = [];
  let prevTop = 0;
  for (let sp = 1; sp <= 5; sp++) {
    const k = flatKart({ speed: sp, accel: 3, handling: 3, weight: 3 });
    run(k, 10, IN({ throttle: 1 }));
    rows.push(`speed ${sp}: top ${k.speed.toFixed(2)}`);
    assert.ok(Math.abs(k.speed - (TUNING.topSpeedMin + (sp - 1) * (TUNING.topSpeedMax - TUNING.topSpeedMin) / 4)) < 0.05, `speed stat ${sp} -> ${k.speed}`);
    assert.ok(k.speed > prevTop); prevTop = k.speed;
  }
  let prevT = Infinity;
  for (let ac = 1; ac <= 5; ac++) {
    const k = flatKart({ speed: 3, accel: ac, handling: 3, weight: 3 });
    let t = 0;
    while (k.speed < 0.98 * k.params.top && t < 10) { k.update(DT, IN({ throttle: 1 })); t += DT; }
    const want = 4.2 - (ac - 1) * 0.45;
    rows.push(`accel ${ac}: 0-to-top ${t.toFixed(2)} s`);
    assert.ok(Math.abs(t - want) < 0.06, `accel ${ac}: ${t.toFixed(2)} vs ${want}`);
    assert.ok(t < prevT); prevT = t;
  }
  assert.ok(prevT >= 2.3 && prevT <= 2.5);
  if (process.env.VERBOSE) console.log(rows.join('\n'));
});

test('acceleration curve is smooth: monotonic speed, acceleration never jumps', () => {
  const k = flatKart();
  let last = 0, lastA = null;
  for (let i = 0; i < 400; i++) {
    k.update(DT, IN({ throttle: 1 }));
    assert.ok(k.speed >= last - 1e-9);
    const a = (k.speed - last) / DT;
    if (lastA !== null) assert.ok(Math.abs(a - lastA) < 1.0, `accel jump ${lastA} -> ${a} at step ${i}`);
    lastA = a; last = k.speed;
  }
});

test('steering convention: steer +1 turns RIGHT (yaw decreases), -1 turns left; needs speed; understeers at top speed', () => {
  const t = new StubTrack();
  let k = flatKart(); run(k, 3, IN({ throttle: 1 }));
  const y0 = k.yaw; run(k, 1, IN({ throttle: 1, steer: 1 }));
  assert.ok(k.yaw < y0 - 0.5, 'right steer should decrease yaw');
  // heading right of the original direction: forward = (sin yaw, cos yaw); right of +Z is -X
  assert.ok(k.pos.x < -1, `kart should have moved to its right (-X), x=${k.pos.x}`);
  k = flatKart(); run(k, 3, IN({ throttle: 1 })); const y1 = k.yaw; run(k, 1, IN({ throttle: 1, steer: -1 }));
  assert.ok(k.yaw > y1 + 0.5 && k.pos.x > 1);
  // standing still: (almost) no pivot without throttle
  k = flatKart(); run(k, 1, IN({ steer: 1 }));
  assert.ok(Math.abs(k.yaw) < 1e-6);
  // tighter circle at 15 m/s than at top speed (radius = v / yawRate)
  const radius = (speed) => { const q = flatKart(); q.vel.set(0, 0, speed); q.speed = speed; run(q, 1.2, IN({ steer: 1, throttle: speed > 20 ? 1 : 0.45 })); const y = q.yaw; run(q, 0.5, IN({ steer: 1, throttle: speed > 20 ? 1 : 0.45 })); return q.speed / (Math.abs(q.yaw - y) / 0.5); };
  const rLow = radius(14), rTop = radius(33);
  assert.ok(rLow < rTop, `low-speed radius ${rLow.toFixed(1)} should be tighter than top-speed ${rTop.toFixed(1)}`);
  assert.ok(rTop > 12 && rTop < 30, `top speed full-lock radius ${rTop.toFixed(1)}`);
  assert.ok(t.length > 0);
});

test('handling stat: higher handling turns tighter; weight stat maps to mass', () => {
  const rate = (h) => { const k = flatKart({ speed: 3, accel: 3, handling: h, weight: 3 }); k.vel.set(0, 0, 20); k.speed = 20; run(k, 0.6, IN({ steer: 1, throttle: 0.7 })); const y = k.yaw; run(k, 0.5, IN({ steer: 1, throttle: 0.7 })); return (y - k.yaw) / 0.5; };
  assert.ok(rate(5) > rate(3) * 1.15 && rate(3) > rate(1) * 1.1);
  assert.ok(flatKart({ speed: 3, accel: 3, handling: 3, weight: 5 }).mass > flatKart({ speed: 3, accel: 3, handling: 3, weight: 1 }).mass * 1.6);
});

test('braking, reverse and coasting', () => {
  const k = flatKart(); run(k, 6, IN({ throttle: 1 }));
  const v0 = k.speed; run(k, 0.5, IN({ brake: 1 }));
  assert.ok(k.speed < v0 - 12, 'brakes bite hard');
  run(k, 3, IN({ brake: 1 }));
  assert.ok(k.speed < -3 && k.speed >= -9.01, `reverses after stopping (${k.speed})`);
  const c = flatKart(); run(c, 6, IN({ throttle: 1 })); run(c, 2, IN());
  assert.ok(c.speed > 20 && c.speed < 31, `coasting loses speed slowly (${c.speed})`);
});

test('surfaces: grass, sand and water cap top speed per SURFACE_PROPS; oil kills grip', () => {
  const t = new SurfaceTrack();
  const capOn = (x) => { const k = new KartPhysics(t, {}); k.teleport(new THREE.Vector3(x, 0, 0), 0); run(k, 8, IN({ throttle: 1 })); return k; };
  const grass = capOn(30), sand = capOn(70), water = capOn(150), road = capOn(0);
  const TOP = road.params.top;                                   // 32.75 m/s for stats 3/3/3/3 (the default stats)
  assert.ok(Math.abs(grass.speed - TOP * 0.55) < 0.3, `grass ${grass.speed}`);
  assert.ok(Math.abs(sand.speed - TOP * 0.5) < 0.3, `sand ${sand.speed}`);
  assert.ok(Math.abs(water.speed - TOP * 0.72) < 0.3, `water ${water.speed}`);
  assert.ok(Math.abs(road.speed - TOP) < 0.1);
  assert.ok(grass.maxSpeed < 19 && sand.maxSpeed < 17);
  // entering grass at top speed sheds speed quickly (not instantly)
  const f = new KartPhysics(t, {}); f.teleport(new THREE.Vector3(15, 0, 0), 0); f.vel.set(0, 0, 33); f.speed = 33;
  const trace = []; for (let i = 0; i < 180; i++) { f.update(DT, IN({ throttle: 1, steer: 0 })); if (i % 20 === 0) trace.push(f.speed); f.vel.x = 0; f.pos.x = Math.max(f.pos.x, 30); }
  assert.ok(trace[1] > 22 && trace[trace.length - 1] < 19.5, trace.map((v) => v.toFixed(1)).join());
  // oil: a steered kart keeps sliding in its old direction far more than on road
  const slide = (x) => { const k = new KartPhysics(t, {}); k.teleport(new THREE.Vector3(x, 0, 0), 0); run(k, 4, IN({ throttle: 1 })); run(k, 0.3, IN({ throttle: 1, steer: 1 })); const y = k.yaw; run(k, 0.7, IN({ throttle: 0, steer: 0 })); const dir = Math.atan2(k.vel.x, k.vel.z); return Math.abs(dir - k.yaw) + Math.abs(y - k.yaw) * 0; };
  assert.ok(slide(120) > slide(0) * 3, `oil slide ${slide(120).toFixed(2)} vs road ${slide(0).toFixed(2)}`);
});

test('mini-turbo API: applyBoost raises the cap and speed, expires, pad boosts are refreshed on the pad', () => {
  const rec = record(['kart:boost']);
  const k = flatKart(); run(k, 6, IN({ throttle: 1 }));
  const before = k.speed;
  k.applyBoost(1, 1, 'item');
  assert.equal(rec.events.length, 1); assert.deepEqual([rec.events[0].kind, rec.events[0].power, rec.events[0].duration], ['item', 1, 1]);
  run(k, 0.6, IN({ throttle: 1 }));
  assert.ok(k.speed > before + 6, `boost gains speed (${before.toFixed(1)} -> ${k.speed.toFixed(1)})`);
  assert.ok(k.maxSpeed > k.params.top * 1.25);
  run(k, 2.5, IN({ throttle: 1 }));
  assert.equal(k.boost.time, 0); assert.equal(k.boost.power, 0);
  assert.ok(Math.abs(k.speed - k.params.top) < 0.6, `boost decays back to top speed (${k.speed})`);
  k.applyBoost(1.6, 2, 'fibre');
  assert.ok(k.maxSpeed > k.params.top * 1.4);
  rec.stop();
});

test('drift: hop, 3 charge levels, mini-turbo on release (0.7 / 1.2 / 1.9 s), left and right', () => {
  for (const dir of [1, -1]) {
    const cases = [[0.8, 1, 0.7], [1.6, 2, 1.2], [2.6, 3, 1.9]];
    for (const [hold, level, boostSeconds] of cases) {
      const rec = record(['kart:drift-start', 'kart:drift-level', 'kart:boost']);
      const k = flatKart(); k.id = 'd'; run(k, 5, IN({ throttle: 1 }));
      const yawBefore = k.yaw;
      k.update(DT, IN({ throttle: 1, steer: dir, drift: true }));
      assert.ok(!k.grounded && k.pos.y > 0 && k.drift.hop, 'hops on press');
      assert.ok(k.drift.active && k.drift.dir === dir, 'drift starts on the hop when steering');
      run(k, hold, IN({ throttle: 1, steer: dir, drift: true }));
      assert.equal(k.drift.level, level, `dir ${dir} hold ${hold}s -> level`);
      assert.ok(Math.sign(k.yaw - yawBefore) === -dir, 'yaw turns towards the drift direction');
      assert.ok(k.slip > 0.5, 'tyres slide while drifting');
      const speedBefore = k.speed;
      k.update(DT, IN({ throttle: 1, steer: dir, drift: false }));
      assert.ok(!k.drift.active && k.drift.charge === 0 && k.drift.level === 0);
      const boost = rec.events.filter((e) => e.name === 'kart:boost');
      assert.equal(boost.length, 1, 'exactly one boost event'); assert.equal(boost[0].kind, 'drift'); assert.equal(boost[0].duration, boostSeconds);
      assert.ok(k.boost.time > boostSeconds - 0.05);
      const levels = rec.events.filter((e) => e.name === 'kart:drift-level').map((e) => e.level);
      assert.deepEqual(levels, Array.from({ length: level }, (_, i) => i + 1), 'level events are emitted in order');
      assert.equal(rec.events.filter((e) => e.name === 'kart:drift-start').length, 1);
      run(k, 0.5, IN({ throttle: 1 }));
      assert.ok(k.speed > speedBefore + 3, 'boost speeds the kart up');
      rec.stop();
    }
  }
});

test('drift: too short = no boost; steering in charges faster than steering out; needs speed and drift held', () => {
  const rec = record(['kart:boost']);
  const k = flatKart(); run(k, 5, IN({ throttle: 1 }));
  run(k, 0.3, IN({ throttle: 1, steer: 1, drift: true }));
  k.update(DT, IN({ throttle: 1, steer: 1, drift: false }));
  assert.equal(rec.events.length, 0, 'level 0 release gives nothing');
  const chargeAfter = (steer) => { const q = flatKart(); run(q, 5, IN({ throttle: 1 })); run(q, 0.05, IN({ throttle: 1, steer: 1, drift: true })); run(q, 0.25, IN({ throttle: 1, steer, drift: true })); return q.drift.charge; };
  assert.ok(chargeAfter(1) > chargeAfter(-1) * 1.4, 'steering into the drift charges faster than counter-steering');
  // slow kart: no hop, no drift
  const s = flatKart(); run(s, 0.2, IN({ throttle: 1 })); s.update(DT, IN({ throttle: 1, steer: 1, drift: true }));
  assert.ok(!s.drift.active && s.grounded);
  // no drift without steering
  const n = flatKart(); run(n, 5, IN({ throttle: 1 })); run(n, 1, IN({ throttle: 1, drift: true }));
  assert.ok(!n.drift.active);
  rec.stop();
});

test('drift: levels 2 and 3 are reachable at a moderate steer angle and survive steering wobble and a wall kiss', () => {
  const k = flatKart(); run(k, 5, IN({ throttle: 1 }));
  k.update(DT, IN({ throttle: 1, steer: 0.6, drift: true }));
  let t = 0, reached = [0, 0, 0, 0];
  for (let i = 0; i < 4 * 60 && k.drift.level < 3; i++, t += DT) {
    // wobble: alternate between steering in, easing off and a brief counter-steer
    const steer = [0.6, 0.35, 0.6, 0.1, 0.6, -0.2][Math.floor(i / 12) % 6];
    k.update(DT, IN({ throttle: 1, steer, drift: true }));
    if (!reached[k.drift.level]) reached[k.drift.level] = t;
    assert.ok(k.drift.active, 'drift is never dropped by steering changes');
  }
  assert.equal(k.drift.level, 3, 'level 3 reached');
  assert.ok(reached[1] < 1.0 && reached[2] < 2.0 && reached[3] < 3.2, `level times ${reached.map((v) => v.toFixed(2)).join(' ')}`);
  assert.ok(k.drift.charge >= 0.99);
});

test('drift arc is tighter in the drift direction and counter-steer widens it', () => {
  const arcRate = (steer) => { const k = flatKart(); run(k, 5, IN({ throttle: 1 })); run(k, 0.8, IN({ throttle: 1, steer: 1, drift: true })); const y = k.yaw; run(k, 0.5, IN({ throttle: 1, steer, drift: true })); return (y - k.yaw) / 0.5; };
  const inward = arcRate(1), neutral = arcRate(0), outward = arcRate(-1);
  assert.ok(inward > neutral * 1.3 && neutral > outward * 1.3, `${inward.toFixed(2)} > ${neutral.toFixed(2)} > ${outward.toFixed(2)}`);
  assert.ok(outward > 0, 'still turning into the drift');
  // a full-lock drift turns tighter than a full-lock normal turn at the same speed
  const normal = (() => { const k = flatKart(); run(k, 5, IN({ throttle: 1 })); run(k, 0.8, IN({ throttle: 1, steer: 1 })); const y = k.yaw; run(k, 0.5, IN({ throttle: 1, steer: 1 })); return (y - k.yaw) / 0.5; })();
  assert.ok(inward > normal * 1.15, `drift ${inward.toFixed(2)} vs normal ${normal.toFixed(2)}`);
});

test('walls: glancing hits slide with a small loss, head-on hits lose much more, events are emitted once per hit', () => {
  const t = new StubTrack();
  const hit = (deg) => {
    const k = new KartPhysics(t, { id: 'w' });
    const sm = t.sample(50);
    k.teleport(sm.pos.clone().addScaledVector(sm.right, -6), 0);
    k.yaw = (deg * Math.PI) / 180; k.vel.set(Math.sin(k.yaw) * 33, 0, Math.cos(k.yaw) * 33); k.speed = 33;
    const rec = record(['kart:wall-hit']);
    let minSpeed = 99;
    for (let i = 0; i < 90; i++) { k.update(DT, IN({ throttle: 1 })); minSpeed = Math.min(minSpeed, k.speed); assert.ok(Math.abs(k.ground.lateral) <= t.wallOffset + 0.01); }
    rec.stop();
    return { events: rec.events, minSpeed, k };
  };
  const glance = hit(12), angled = hit(35), head = hit(85);
  assert.ok(glance.minSpeed > 25.5, `glancing 12 deg only loses a little (${glance.minSpeed.toFixed(1)})`);
  assert.ok(head.minSpeed < 5, `head-on stops the kart (${head.minSpeed.toFixed(1)})`);
  assert.ok(angled.minSpeed < glance.minSpeed && angled.minSpeed > head.minSpeed);
  assert.ok(glance.events.length >= 1 && glance.events.length <= 2);
  assert.ok(head.events[0].impact > 0.9 && glance.events[0].impact < head.events[0].impact);
  assert.ok(glance.events.every((e) => e.id === 'w' && e.impact >= 0 && e.impact <= 1));
  // after a glancing hit the kart keeps going roughly along the wall
  assert.ok(glance.k.speed > 25 && Math.abs(glance.k.ground.lateral) > 8);
});

test('slopes and ramps: grounded kart follows the surface, a ramp launches it, landing emits kart:land', () => {
  const t = new HillTrack({ straight: 800 });
  const k = new KartPhysics(t, { id: 'r' });
  const start = t.sample(0); k.teleport(start.pos, 0);
  const rec = record(['kart:land']);
  let air = 0, maxY = 0, groundedOnRamp = 0;
  for (let i = 0; i < 60 * 6; i++) {
    k.update(DT, IN({ throttle: 1 }));
    if (k.grounded) assert.ok(Math.abs(k.pos.y - k.ground.height) < 1e-6, 'glued to the ground while grounded');
    if (!k.grounded) air += DT; else if (k.pos.z > 41 && k.pos.z < 59) groundedOnRamp++;
    maxY = Math.max(maxY, k.pos.y);
    if (k.pos.z > 100) break;
  }
  assert.ok(groundedOnRamp > 20, 'drives up the ramp');
  assert.ok(air > 0.45 && air < 1.2, `airborne after the ramp for ${air.toFixed(2)} s`);
  assert.ok(maxY > 4.2, `apex above the ramp lip (${maxY.toFixed(2)})`);
  assert.equal(rec.events.length, 1); assert.ok(rec.events[0].impact > 0.3 && rec.events[0].impact <= 1);
  assert.ok(k.grounded);
  rec.stop();
});

test('slopes: climbing slows the kart, descending speeds it up (relative to flat)', () => {
  const t = new HillTrack({ straight: 800 });
  const k = new KartPhysics(t, {});
  k.teleport(new THREE.Vector3(60, 0, 118), 0);
  let minV = 99, maxV = 0;
  const v0 = 33; k.vel.set(0, 0, v0); k.speed = v0;
  for (let i = 0; i < 60 * 2 && k.pos.z < 175; i++) { k.update(DT, IN({ throttle: 1 })); if (k.pos.z < 145) minV = Math.min(minV, k.speed); else maxV = Math.max(maxV, k.speed); }
  assert.ok(minV < v0 - 0.4, `uphill slows (${minV.toFixed(2)})`);
  assert.ok(maxV >= minV, 'downhill regains speed');
  assert.ok(k.pitch !== 0 || k.grounded);
});

test('attitude: pitch and roll follow the ground normal (Euler convention documented in KartPhysics)', () => {
  const t = new HillTrack({ straight: 800 });
  const k = new KartPhysics(t, {});
  k.teleport(new THREE.Vector3(60, 0, 45), 0);
  run(k, 0.5, IN({ throttle: 1 }));
  assert.ok(k.grounded && k.ground.height > 0.5);
  assert.ok(k.pitch < -0.1, `nose up on an uphill has negative pitch (${k.pitch})`);
  const obj = new THREE.Object3D(); k.applyAttitude(obj);
  const fwd = new THREE.Vector3(0, 0, 1).applyEuler(obj.rotation);
  assert.ok(fwd.y > 0.1, 'model +Z points uphill after applying the attitude');
});

test('void: driving off an open edge falls, emits kart:fall exactly once, never NaN', () => {
  const t = new EdgeVoidTrack();
  const k = new KartPhysics(t, { id: 'v' });
  const sm = t.sample(20); k.teleport(sm.pos, 0);
  const rec = record(['kart:fall', 'kart:surface']);
  for (let i = 0; i < 60 * 4; i++) {
    k.update(DT, IN({ throttle: 1, steer: i < 30 ? 0 : 0.2 }));
    assert.ok(Number.isFinite(k.pos.y));
  }
  const falls = rec.events.filter((e) => e.name === 'kart:fall');
  assert.equal(falls.length, 1, 'fall is announced once');
  assert.ok(k.pos.y < -3, `still falling (y=${k.pos.y})`);
  assert.equal(k.grounded, false);
  // teleport recovers everything
  const g = t.respawnAt(30); k.teleport(g.pos, g.heading);
  assert.ok(k.grounded && k.pos.y === 0 && k.speed === 0);
  run(k, 1, IN({ throttle: 1 }));
  assert.ok(k.speed > 10);
  rec.stop();
});

test('void gap: a fast kart launched by the ramp clears the gap, a slow kart falls in', () => {
  const t = new HillTrack({ straight: 800, gap: [62, 76] });
  const rec = record(['kart:fall']);
  const drive = (id, v0) => {
    const k = new KartPhysics(t, { id }); k.teleport(new THREE.Vector3(60, 0, 20), 0); k.vel.set(0, 0, v0); k.speed = v0;
    for (let i = 0; i < 60 * 4; i++) k.update(DT, IN({ throttle: v0 > 20 ? 1 : 0.35 }));
    return k;
  };
  const fast = drive('f', 33), slow = drive('s', 12);
  assert.equal(rec.events.filter((e) => e.id === 'f').length, 0, 'the fast kart clears the gap');
  assert.ok(fast.pos.z > 80 && fast.grounded);
  assert.equal(rec.events.filter((e) => e.id === 's').length, 1, 'the slow kart falls in');
  rec.stop();
});

test('spin-out: two full turns, speed lost, controls ignored, blocked while invincible, no double spin', () => {
  const k = flatKart(); run(k, 6, IN({ throttle: 1 }));
  const yaw0 = k.yaw, v0 = k.speed;
  const rec = record(['kart:spin']);
  k.setInvincible(1);
  assert.equal(k.spinOut(1.4, 'cable'), false); assert.equal(rec.events.length, 0);
  k.setInvincible(0);
  assert.equal(k.spinOut(1.4, 'cable'), true);
  assert.equal(rec.events.length, 1); assert.equal(rec.events[0].cause, 'cable');
  assert.equal(k.spinOut(1.4, 'again'), false);
  let maxYawDelta = 0;
  for (let i = 0; i < 60 * 1.4 + 2; i++) { k.update(DT, IN({ throttle: 1, steer: 1 })); maxYawDelta = Math.max(maxYawDelta, Math.abs(k.yaw - yaw0)); }
  assert.ok(maxYawDelta > 2 * Math.PI * 1.5, 'spins around');
  assert.ok(Math.abs(Math.abs(k.yaw - yaw0) - 4 * Math.PI) < 0.05, 'ends facing the way it started');
  assert.ok(k.speed < v0 * 0.2);
  assert.equal(k.status.spin, 0);
  rec.stop();
});

test('shrink: smaller radius and lower top speed while stunned, restored afterwards, blocked while invincible', () => {
  const k = flatKart(); const r0 = k.radius;
  k.setInvincible(1); assert.equal(k.shrink(3), false); k.setInvincible(0);
  assert.equal(k.shrink(2), true);
  run(k, 1, IN({ throttle: 1 }));
  assert.ok(k.radius < r0 * 0.75 && k.maxSpeed < k.params.top * 0.9);
  run(k, 4, IN({ throttle: 1 }));
  assert.ok(Math.abs(k.radius - r0) < 0.01 && Math.abs(k.maxSpeed - k.params.top) < 0.01);
});

test('teleport resets motion, drift, spin and boost', () => {
  const k = flatKart(); run(k, 4, IN({ throttle: 1 })); run(k, 1, IN({ throttle: 1, steer: 1, drift: true })); k.applyBoost(1, 2);
  k.teleport(new THREE.Vector3(5, 0, 7), 1.2);
  assert.equal(k.speed, 0); assert.equal(k.vel.length(), 0); assert.equal(k.yaw, 1.2); assert.equal(k.steer, 0);
  assert.ok(!k.drift.active && k.drift.level === 0 && k.drift.charge === 0 && k.boost.time === 0 && k.status.spin === 0);
  assert.deepEqual([k.pos.x, k.pos.z], [5, 7]);
});

test('launch pops the kart into the air and it comes back down', () => {
  const k = flatKart(); run(k, 1, IN({ throttle: 1 }));
  const rec = record(['kart:land']);
  k.launch(12);
  assert.equal(k.grounded, false);
  let apex = 0, steps = 0;
  while (!k.grounded && steps++ < 300) { k.update(DT, IN({ throttle: 1 })); apex = Math.max(apex, k.pos.y); }
  assert.ok(apex > 2 && apex < 3.2, `apex ${apex}`);
  assert.equal(rec.events.length, 1); rec.stop();
});

test('kart-kart collisions are mass-weighted: heavy kart barely moves, light kart is shoved; events emitted', () => {
  const t = new FlatTrack();
  const heavy = new KartPhysics(t, { id: 'h', stats: { speed: 3, accel: 3, handling: 3, weight: 5 } });
  const light = new KartPhysics(t, { id: 'l', stats: { speed: 3, accel: 3, handling: 3, weight: 1 } });
  heavy.teleport(new THREE.Vector3(0, 0, 0), 0); light.teleport(new THREE.Vector3(1.6, 0, 0), Math.PI);
  heavy.vel.set(0, 0, 0); light.vel.set(-8, 0, 0);
  const rec = record(['kart:bump']);
  const dvHeavy0 = heavy.vel.x;
  resolveKartCollisions([heavy, light]);
  assert.ok(Math.hypot(heavy.pos.x - light.pos.x, heavy.pos.z - light.pos.z) >= heavy.radius + light.radius - 1e-6, 'separated');
  const dHeavy = Math.abs(heavy.vel.x - dvHeavy0), dLight = Math.abs(light.vel.x - -8);
  assert.ok(dLight > dHeavy * 1.5, `light kart changes velocity more (${dLight.toFixed(2)} vs ${dHeavy.toFixed(2)})`);
  assert.ok(light.vel.x > -8 * 0.5, 'light kart bounces back');
  assert.equal(rec.events.length, 2); assert.deepEqual(rec.events.map((e) => e.otherId).sort(), ['h', 'l']);
  assert.ok(rec.events.every((e) => e.impact > 0 && e.impact <= 1));
  // a second immediate contact does not spam events
  light.pos.set(1.8, 0, 0); light.vel.set(-6, 0, 0); resolveKartCollisions([heavy, light]);
  assert.equal(rec.events.length, 2);
  // side-by-side touch shoves them apart
  const a = new KartPhysics(t, { id: 'a' }), b = new KartPhysics(t, { id: 'b' });
  a.teleport(new THREE.Vector3(0, 0, 0), 0); b.teleport(new THREE.Vector3(2.0, 0, 0), 0);
  a.vel.set(0, 0, 30); b.vel.set(0, 0, 30);
  resolveKartCollisions([a, b]);
  assert.ok(b.vel.x - a.vel.x >= 2.0, 'shoved apart');
  // ghosts do not collide (respawning)
  const c = new KartPhysics(t, { id: 'c' }); c.teleport(new THREE.Vector3(0, 0, 0.5), 0); c.status.respawning = 1;
  const before = a.pos.clone(); resolveKartCollisions([a, c]);
  assert.ok(a.pos.equals(before));
  rec.stop();
});

test('invincible kart bulldozes: it is shoved less than the kart it hits', () => {
  const t = new FlatTrack();
  const a = new KartPhysics(t, { id: 'a' }), b = new KartPhysics(t, { id: 'b' });
  a.teleport(new THREE.Vector3(0, 0, 0), 0); b.teleport(new THREE.Vector3(1.8, 0, 0), Math.PI);
  a.vel.set(5, 0, 0); b.vel.set(-5, 0, 0); a.setInvincible(5);
  resolveKartCollisions([a, b]);
  assert.ok(Math.abs(b.vel.x - -5) > Math.abs(a.vel.x - 5) * 2);
});

test('bot laps: a pursuit controller completes 3 laps of the stub oval, on the road, without touching walls', () => {
  const t = new StubTrack();
  const k = new KartPhysics(t, { id: 'bot' });
  const g = t.gridSlot(0); k.teleport(g.pos, g.heading);
  const rec = record(['kart:wall-hit']);
  const r = runLaps(k, t, makeBot(k, t), { laps: 3 });
  rec.stop();
  assert.equal(r.lapTimes.length, 3);
  assert.ok(r.lapTimes.every((x) => x > 21 && x < 30), r.lapTimes.join());
  assert.equal(r.offRoad, 0); assert.equal(rec.events.length, 0);
  assert.ok(r.maxSpeed > 32.6);
});

test('bot laps on a tight hairpin oval (R=22) without leaving the road; every stat combination finishes', () => {
  const t = new StubTrack({ radius: 22, straight: 120, width: 16 });
  for (const [c, kt] of [['marco', 'cruiser'], ['rex', 'hauler'], ['tilly', 'buggy'], ['packet', 'rocket'], ['lambda', 'buggy']]) {
    const k = new KartPhysics(t, { id: c, stats: statsFor(c, kt) });
    const g = t.gridSlot(0); k.teleport(g.pos, g.heading);
    const r = runLaps(k, t, makeBot(k, t), { laps: 2 });
    assert.equal(r.lapTimes.length, 2, `${c}/${kt} finished`);
    assert.ok(r.offRoad < 2, `${c}/${kt} off road ${r.offRoad}`);
  }
});

test('mini-turbos pay off: a drifting bot laps faster than a non-drifting bot on a medium-radius oval', () => {
  const t = new StubTrack({ radius: 36, straight: 200, width: 18 });
  const lap = (drift) => { const k = new KartPhysics(t, { id: 'b' }); const g = t.gridSlot(0); k.teleport(g.pos, g.heading); const rec = record(['kart:boost', 'kart:drift-level']); const r = runLaps(k, t, makeBot(k, t, { drift }), { laps: 3 }); rec.stop(); return { best: Math.min(...r.lapTimes), events: rec.events, off: r.offRoad }; };
  const plain = lap(false), drifting = lap(true);
  assert.ok(drifting.events.some((e) => e.name === 'kart:boost' && e.kind === 'drift'), 'drift boosts fired');
  assert.ok(drifting.events.some((e) => e.name === 'kart:drift-level' && e.level >= 2));
  assert.ok(drifting.best < plain.best - 0.5, `drift ${drifting.best.toFixed(2)} vs plain ${plain.best.toFixed(2)}`);
  assert.ok(drifting.off < 1);
});

test('boost pad surface grants a pad boost once on entry and keeps it while on the pad', () => {
  const t = new StubTrack();
  const orig = t.query.bind(t);
  t.query = (pos, out, hint) => { orig(pos, out, hint); if (out.s > 60 && out.s < 75 && out.surface === 'road') out.surface = 'boost'; return out; };
  const k = new KartPhysics(t, {});
  k.teleport(t.sample(40).pos, 0);
  const rec = record(['kart:boost', 'kart:surface']);
  run(k, 2, IN({ throttle: 1 }));
  assert.equal(rec.events.filter((e) => e.name === 'kart:boost' && e.kind === 'pad').length, 1);
  assert.ok(rec.events.some((e) => e.name === 'kart:surface' && e.surface === 'boost'));
  assert.ok(k.speed > 30);
  rec.stop();
});

test('surface events fire on change only', () => {
  const t = new StubTrack();
  const k = new KartPhysics(t, { id: 's' });
  const sm = t.sample(40);
  k.teleport(sm.pos.clone().addScaledVector(sm.right, -6), 0);
  const rec = record(['kart:surface']);
  run(k, 2, IN({ throttle: 1, steer: -0.4 }));
  const surfaces = rec.events.map((e) => e.surface);
  assert.ok(surfaces.length >= 1 && surfaces.length <= 3, surfaces.join());
  assert.equal(new Set(surfaces.map((s, i) => s + (surfaces[i - 1] ?? ''))).size, surfaces.length);
  rec.stop();
});

test('rocket start API: applyBoost(kind start) works while stationary', () => {
  const k = flatKart();
  k.applyBoost(1, 1.0, 'start');
  run(k, 1, IN({ throttle: 1 }));
  assert.ok(k.speed > 25, `rocket start reaches ${k.speed.toFixed(1)} after 1 s`);
  assert.ok(CFG.fixedDt > 0);
});
