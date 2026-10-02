// Rampable traffic (Need-for-Speed style) on Copacabana and Blighty: the pure launch planner, the launch rule on the real tracks' vehicles,
// the clear-jump reward event, the visual cues, and the ribbon forks (builders/branch.js) that share this agent's files.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrack } from '../src/track/index.js';
import { bus } from '../src/core/bus.js';
import { CFG } from '../src/core/config.js';
import { planVehicleJump, landsOnRoad, VEHICLE_JUMP, rearRampGeo, chevronBumperGeo, VehicleRamps } from '../src/track/builders/scenery/hazards/rampVehicle.js';
import { makeRibbon, resampleRibbon } from '../src/track/builders/branch.js';

// ------------------------------------------------------------------------------------------------------------------ the planner
test('planVehicleJump: clears the roof over the whole body, lands beyond the front edge, never needs more than maxVy', () => {
  const g = CFG.gravity;
  for (const [closing, gap, length, height] of [[30, 6, 4.2, 2.0], [34, 8, 11, 3.1], [36, 9, 8, 3.4], [33, 7, 10.4, 4.3]]) {
    const p = planVehicleJump({ closing, gap, length, height });
    assert.ok(p, `plan for closing ${closing} gap ${gap} length ${length} height ${height}`);
    assert.ok(p.vy <= VEHICLE_JUMP.maxVy + 1e-9 && p.vy > 0);
    const y = (t) => p.vy * t - 0.5 * g * t * t;
    for (let t = p.tRear; t <= p.tFront + 1e-9; t += (p.tFront - p.tRear) / 12) assert.ok(y(t) >= height + VEHICLE_JUMP.clearance - 1e-6, `above the roof at t=${t.toFixed(2)}`);
    assert.ok(p.landAhead > 0, `lands ${p.landAhead.toFixed(1)} m beyond the front edge`);
    assert.ok(p.apex > height, 'apex above the roof');
  }
});

test('planVehicleJump: too slow, too close, or too tall is refused (the hit bumps as before); taller roofs need a bigger launch', () => {
  assert.equal(planVehicleJump({ closing: 0.5, gap: 6, length: 4, height: 2 }), null, 'not closing');
  assert.equal(planVehicleJump({ closing: 30, gap: 0.1, length: 4, height: 2 }), null, 'no run-up');
  assert.equal(planVehicleJump({ closing: 6, gap: 6, length: 11, height: 3.1 }), null, 'a crawl cannot clear a bus');
  assert.equal(planVehicleJump({ closing: 30, gap: 6, length: 12, height: 40 }), null, 'a tower block');
  const lo = planVehicleJump({ closing: 34, gap: 7, length: 4.2, height: 1.9 }), hi = planVehicleJump({ closing: 34, gap: 7, length: 4.2, height: 3.3 });
  assert.ok(hi.vy > lo.vy, 'taller vehicle, bigger launch');
});

test('rampable visual cues: a hazard-striped tail ramp and a chevron bumper', () => {
  const box = (g) => new THREE.Box3().setFromBufferAttribute(g.build().getAttribute('position'));
  const r = box(rearRampGeo({ width: 3.3, rear: -5.5, run: 6, rise: 1.0 }));
  assert.ok(Math.abs(r.min.z - (-11.5)) < 1e-6 && r.max.z <= -5.5 + 0.15, `ramp spans z ${r.min.z}..${r.max.z}`);
  assert.ok(r.max.y > 0.9 && r.max.y < 1.2 && r.min.y >= 0, `ramp rises ${r.max.y.toFixed(2)} m`);
  const c = box(chevronBumperGeo({ width: 2, z: -2.4, y: 0.3, height: 0.36 }));
  assert.ok(c.max.x - c.min.x > 1.9 && c.max.y - c.min.y < 0.5, 'a low chevron bar across the rear');
});

// ------------------------------------------------------------------------------------------------------------------ the launch rule on the real tracks
const RAMPABLE = {
  copacabana: ['trio-sweep0', 'trio-sweep1', 'trio-hill0', 'trio-hill1', 'bus-tunnel', 'kombi0', 'kombi1'],
};
const makeKart = (track, id = 'k') => {
  const calls = [];
  const kart = {
    id, pos: new THREE.Vector3(), vel: new THREE.Vector3(), speed: 0, maxSpeed: 46, grounded: true, status: { spin: 0 }, ground: { height: 0 }, isPlayer: true,
    launch(vy, o) { calls.push({ vy, o }); this.grounded = false; this.vel.y = vy; }, applyBoost(power, seconds, kind) { calls.push({ boost: [power, seconds, kind] }); },
  };
  return { kart, calls };
};
/** A kart `gap` m behind the rear edge of vehicle `v` (a registry record), driving along its heading at `speed` m/s, `lat` m off its centre line. */
function behind(track, v, { gap = 4, speed = 43, lat = 0, turn = 0 } = {}) {
  const f = v.frame, { kart, calls } = makeKart(track);
  kart.pos.set(f.x - f.fx * (v.length / 2 + gap) + f.rx * lat, f.y, f.z - f.fz * (v.length / 2 + gap) + f.rz * lat);
  const a = Math.atan2(f.fx, f.fz) + turn;
  kart.vel.set(Math.sin(a) * speed, 0, Math.cos(a) * speed); kart.speed = speed; kart.ground.height = f.y;
  return { kart, calls };
}
/** Times (s) at which vehicle `v` is on the road, in the middle third of its drive, for a handful of phases. */
function activeTimes(track, v, n = 14) {
  const out = [];
  for (let t = 0; t < 140 && out.length < n; t += 0.5) { const a = v.path.position(t), b = v.path.position(t + 1); if (a.active && b.active) out.push(t); }
  return out;
}

for (const id of ['copacabana', 'blighty']) {
  test(`${id}: every moving along-road vehicle is registered as rampable, with a speed, size and a visual cue`, () => {
    const track = createTrack(id, { headless: true });
    const reg = track.vehicleRamps;
    assert.ok(reg instanceof VehicleRamps, 'vehicle ramps installed');
    assert.ok(reg.vehicles.length >= (id === 'copacabana' ? 7 : 5), `${reg.vehicles.length} rampable vehicles`);
    for (const v of reg.vehicles) {
      assert.ok(v.speed > 3 && v.speed < 16 && v.length > 3 && v.width > 1.5 && v.height > 1.2 && v.height <= 4.4 + 1e-9, `${v.id} size / speed`);
      assert.ok(v.path.entries.length >= 1 && v.path.entries.every((e) => e.hit === 'bump'), `${v.id}: side and slow hits still bump`);
    }
    for (const want of RAMPABLE[id] ?? []) assert.ok(reg.vehicles.some((v) => v.id === want), `${want} registered`);
    // crossing timing hazards (side-on) are NOT rampable
    for (const o of track.obstacles) if (/^(van|tube-train|float-x\d|bus-j\d|bus-x\d?)$/.test(o.id ?? '')) assert.ok(!reg.vehicles.some((v) => v.path.entries.includes(o)), `${o.id} is a crossing hazard, not rampable`);
  });

  test(`${id}: a fast, lined-up kart behind a vehicle is launched (source 'vehicle'); side, slow and off-lane approaches are not`, () => {
    const track = createTrack(id, { headless: true }), reg = track.vehicleRamps;
    let launched = 0, tried = 0;
    for (const v of reg.vehicles) {
      for (const t of activeTimes(track, v)) {
        track.update(0.016, t); reg._refresh();
        if (!v.frame.active) continue;
        for (const gap of [v.run + 0.9, v.run + 1.6, v.run + 2.4]) {
          const { kart, calls } = behind(track, v, { gap }); tried++;
          const hit = reg.update(kart, 1 / 60, null);
          if (hit === v.id) {
            launched++;
            const c = calls.find((x) => x.o);
            assert.equal(c.o.source, 'vehicle'); assert.ok(c.vy > 5 && c.vy <= VEHICLE_JUMP.maxVy + 1e-9, `vy ${c.vy}`);
            assert.ok(kart.speed >= 43 * 0.99, 'speed is kept (or pushed up a little)');
            // negative cases against the same scene
            const slow = behind(track, v, { gap, speed: 12 }); assert.equal(reg.update(slow.kart, 1 / 60, null), null, 'slow kart bumps instead');
            const side = behind(track, v, { gap, turn: Math.PI / 2 }); assert.equal(reg.update(side.kart, 1 / 60, null), null, 'side-on kart bumps instead');
            const off = behind(track, v, { gap, lat: v.width / 2 + 3 }); assert.equal(reg.update(off.kart, 1 / 60, null), null, 'a kart in the next lane is not launched');
            const spun = behind(track, v, { gap }); spun.kart.status.spin = 1; assert.equal(reg.update(spun.kart, 1 / 60, null), null, 'a spinning kart is not launched');
            const air = behind(track, v, { gap }); air.kart.grounded = false; air.kart.pos.y += 3; assert.equal(reg.update(air.kart, 1 / 60, null), null, 'an airborne kart is not launched');
          }
          reg.flights.clear();
        }
      }
    }
    assert.ok(tried > 20 && launched >= 1, `${launched} launches in ${tried} tries`);
  });

  test(`${id}: clearing a vehicle announces traffic:jumped once and pays a pad-style boost on touchdown`, () => {
    const track = createTrack(id, { headless: true }), reg = track.vehicleRamps, events = [], dones = bus.on('traffic:jumped', (d) => events.push(d));
    try {
      let done = false;
      for (const v of reg.vehicles) {
        for (const t of activeTimes(track, v)) {
          track.update(0.016, t); reg._refresh();
          const { kart, calls } = behind(track, v, { gap: v.run + 1.2 });
          if (reg.update(kart, 1 / 60, null) !== v.id) { reg.flights.clear(); continue; }
          // fly it over: past the front edge, 2 m up
          const f = v.frame; kart.pos.set(f.x + f.fx * (v.length / 2 + 3), f.y + 2.2, f.z + f.fz * (v.length / 2 + 3)); kart.ground.height = f.y;
          for (let k = 0; k < 5; k++) reg.update(kart, 1 / 60, null);
          assert.equal(events.length, 1, 'announced exactly once'); assert.equal(events[0].vehicleId, v.id); assert.equal(events[0].isPlayer, true); assert.ok(events[0].height > 1);
          assert.ok(!calls.some((c) => c.boost), 'no boost in the air');
          kart.grounded = true; kart.pos.y = f.y; for (let k = 0; k < 20; k++) reg.update(kart, 1 / 60, null);
          const b = calls.filter((c) => c.boost);
          assert.equal(b.length, 1, 'one boost on touchdown'); assert.deepEqual(b[0].boost, [VEHICLE_JUMP.rewardPower, VEHICLE_JUMP.rewardSeconds, 'pad']);
          assert.equal(reg.flights.size, 0, 'flight finished'); done = true; break;
        }
        if (done) break;
      }
      assert.ok(done, 'found a vehicle to jump');
    } finally { dones(); }
  });

  test(`${id}: a launch from the planner always lands on the road (landsOnRoad agrees with the rule)`, () => {
    const track = createTrack(id, { headless: true }), reg = track.vehicleRamps; let checked = 0;
    for (const v of reg.vehicles) for (const t of activeTimes(track, v, 6)) {
      track.update(0.016, t); reg._refresh();
      const { kart, calls } = behind(track, v, { gap: v.run + 1.4 });
      if (reg.update(kart, 1 / 60, null) !== v.id) { reg.flights.clear(); continue; }
      const vy = calls.find((c) => c.o).vy, p0 = new THREE.Vector3(...behind(track, v, { gap: v.run + 1.4 }).kart.pos.toArray());
      assert.ok(landsOnRoad(track, p0, new THREE.Vector3(kart.vel.x / 1.05, 0, kart.vel.z / 1.05), vy, v.frame.y, v.entrySet), `${v.id} landing is on the road`);
      checked++; reg.flights.clear();
    }
    assert.ok(checked >= 1, 'checked at least one landing');
  });
}

// ------------------------------------------------------------------------------------------------------------------ ribbon forks (builders/branch.js)
test('makeRibbon: a drivable full-width strip with its own height, edges and heading', () => {
  const rb = makeRibbon({ pts: [{ x: 0, z: 0, y: 1, w: 16 }, { x: 0, z: 60, y: 3, w: 16 }, { x: 40, z: 120, y: 3, w: 20 }] });
  const out = {};
  assert.ok(rb.evaluate(0, 30, 0, out) && out.top && out.h > 1 && out.h < 3.2, 'on the strip');
  assert.ok(rb.evaluate(5, 30, 0, out) && out.top, 'near the edge is still the top');
  assert.ok(!rb.evaluate(30, 30, 0, out), 'well outside is not');
  assert.ok(rb.edgeDistance(-2, 30) < -7 && rb.edgeDistance(11, 30) > 0 && rb.edgeDistance(500, 500) === Infinity, 'signed edge distance');
  const a = rb.at(10), b = rb.at(rb.total - 1);
  assert.ok(Math.abs(a.yaw) < 0.2 && b.yaw > 0.3, 'heading follows the polyline');
  assert.ok(rb.total > 125 && rb.total < 150, `length ${rb.total.toFixed(0)}`);
  const dense = resampleRibbon([{ x: 0, z: 0, y: 0, w: 10 }, { x: 50, z: 0, y: 5, w: 20 }], 3);
  assert.ok(dense.length >= 17 && Math.abs(dense[0].y) < 1e-9 && Math.abs(dense[dense.length - 1].y - 5) < 1e-9 && dense[8].w > 10 && dense[8].w < 20, 'eased y and width');
});

test('forks: both tracks declare two genuine forks whose alternative road is drivable end to end and keeps the spline station rising', () => {
  for (const id of ['copacabana', 'blighty']) {
    const track = createTrack(id, { headless: true }), forks = track.def.forks ?? [];
    assert.ok(forks.length >= 2, `${id}: ${forks.length} forks declared`);
    for (const f of forks) {
      const a = track.S(f.from), b = track.S(f.to);
      assert.ok(b > a && b - a < 700, `${id}/${f.id}: ${(b - a).toFixed(0)} m of spline between the fork marks`);
      const pf = track.model.platforms.find((p) => (p.def?.id ?? p.id) === f.alt);
      assert.ok(pf, `${id}/${f.id}: alternative platform '${f.alt}' exists`);
      const o = { height: 0, normal: new THREE.Vector3(), surface: '', onRoad: false, s: 0, lateral: 0, inVoid: false }, P = new THREE.Vector3();
      if (pf.branch) {
        let lastS = -1, bad = 0;
        for (let u = 0; u <= pf.total; u += 2.5) {
          const q = pf.at(u, {}); P.set(q.x, q.y + 1.5, q.z); track.query(P, o, lastS >= 0 ? lastS : undefined);
          if (!o.onRoad || o.inVoid) bad++;
          assert.ok(o.s >= a - 80 && o.s <= b + 80, `${id}/${f.id}: station ${o.s.toFixed(0)} within the fork span at u=${u.toFixed(0)}`);
          if (lastS >= 0) assert.ok(o.s - lastS > -4, `${id}/${f.id}: station never runs backwards (${lastS.toFixed(1)} -> ${o.s.toFixed(1)})`);
          lastS = o.s;
        }
        assert.ok(bad === 0, `${id}/${f.id}: ${bad} off-road samples along the ribbon`);
      } else {
        for (let u = 1; u < pf.length; u += 2.5) { const x = pf.x + Math.sin(pf.yaw) * u, z = pf.z + Math.cos(pf.yaw) * u; P.set(x, pf.y0 + (pf.y1 - pf.y0) * (u / pf.length) + 1.5, z); track.query(P, o); assert.ok(!o.inVoid, `${id}/${f.id}: deck is solid at u=${u.toFixed(0)}`); assert.ok(Math.abs(o.height - (pf.y0 + (pf.y1 - pf.y0) * (u / pf.length))) < 0.6, `${id}/${f.id}: deck height at u=${u.toFixed(0)}`); }
      }
    }
  }
});
