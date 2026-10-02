// Data Centre and Marcoverse: rampable traffic (AGVs, forklift train, tape robots; hover-taxis, cargo drones, comet-sleds), the two ribbon forks on
// each track, the bridge / viaduct crossovers (platforms are not layer aware: the viaduct and its pads are, see marcoverse/forks.js), the hot / cold
// aisle zones, and an AI field that laps both tracks without a fall.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrack } from '../src/track/index.js';
import { VEHICLE_JUMP, landsOnRoad, VehicleRamps } from '../src/track/builders/scenery/hazards/rampVehicle.js';
import { routeInfo as dcRoute } from '../src/track/builders/scenery/datacentre/route.js';
import { aisleZones, aisleAt } from '../src/track/builders/scenery/datacentre/aisles.js';
import { Race } from '../src/race/Race.js';
import { realKartFactory } from '../src/race/kartFactory.js';
import { makeEntries, DT, recordEvents } from './race_helpers.js';

const IDS = {
  datacentre: ['agv-esses0', 'agv-esses1', 'tape-pre0', 'tape-pre1', 'forklift-dl', 'agv-return'],
  marcoverse: ['drone-esses0', 'drone-esses1', 'taxi-climb0', 'taxi-climb1', 'sled-ladder', 'sled-tube'],
};
const q = () => ({ height: 0, normal: new THREE.Vector3(), surface: '', onRoad: false, s: 0, lateral: 0, inVoid: false });

const makeKart = () => {
  const calls = [];
  const kart = {
    id: 'k', pos: new THREE.Vector3(), vel: new THREE.Vector3(), speed: 0, maxSpeed: 46, grounded: true, status: { spin: 0 }, ground: { height: 0 }, isPlayer: true,
    launch(vy, o) { calls.push({ vy, o }); this.grounded = false; this.vel.y = vy; }, applyBoost(power, seconds, kind) { calls.push({ boost: [power, seconds, kind] }); },
  };
  return { kart, calls };
};
/** A kart `gap` m behind the rear edge of vehicle `v`, driving along its heading at `speed` m/s, `lat` m off its centre line. */
function behind(v, { gap = 4, speed = 43, lat = 0, turn = 0 } = {}) {
  const f = v.frame, { kart, calls } = makeKart();
  kart.pos.set(f.x - f.fx * (v.length / 2 + gap) + f.rx * lat, f.y, f.z - f.fz * (v.length / 2 + gap) + f.rz * lat);
  const a = Math.atan2(f.fx, f.fz) + turn;
  kart.vel.set(Math.sin(a) * speed, 0, Math.cos(a) * speed); kart.speed = speed; kart.ground.height = f.y;
  return { kart, calls };
}
/** Times (s) at which vehicle `v` is on the road, for a handful of phases. */
function activeTimes(v, n = 10) {
  const out = [];
  for (let t = 0; t < 160 && out.length < n; t += 0.5) { const a = v.path.position(t), b = v.path.position(t + 1); if (a.active && b.active) out.push(t); }
  return out;
}

for (const id of ['datacentre', 'marcoverse']) {
  test(`${id}: the traffic is registered as rampable (bump when hit side-on or slowly), keeps clear of the grid and the Leap, and has a striped tail ramp`, () => {
    const track = createTrack(id, { headless: true }), reg = track.vehicleRamps, L = track.length;
    assert.ok(reg instanceof VehicleRamps, 'vehicle ramps installed');
    for (const want of IDS[id]) assert.ok(reg.vehicles.some((v) => v.id === want), `${want} registered`);
    assert.ok(reg.vehicles.length >= 6, `${reg.vehicles.length} rampable vehicles`);
    const o = q(), P = new THREE.Vector3();
    for (const v of reg.vehicles.filter((x) => IDS[id].includes(x.id))) {
      assert.ok(v.speed > 6 && v.speed < 14 && v.length > 3 && v.width > 1.5 && v.height > 1.2 && v.height <= 4.4 + 1e-9, `${v.id} size / speed`);
      assert.ok(v.path.entries.length >= 1 && v.path.entries.every((e) => e.hit === 'bump'), `${v.id}: side and slow hits still bump`);
      for (const t of activeTimes(v, 6)) {                                    // never on the start grid, never in the run-up to a jump
        const p = v.path.position(t); P.set(p.x, 1e4, p.z); track.query(P, o);
        const d = ((o.s % L) + L) % L, behindLine = L - d;
        assert.ok(!(behindLine < 90 || d < 70), `${v.id} at s=${d.toFixed(0)} is on the start grid`);
        if (id === 'marcoverse') assert.ok(!(behindLine > 90 && behindLine < 330), `${v.id} at s=${d.toFixed(0)} is in the Leap run-up`);
      }
    }
  });

  test(`${id}: a fast, lined-up kart behind a vehicle is launched (source 'vehicle'); side, slow, off-lane, spinning and airborne karts are not; the landing is on the road`, () => {
    const track = createTrack(id, { headless: true }), reg = track.vehicleRamps;
    let launched = 0, tried = 0; const seen = new Set();
    for (const v of reg.vehicles.filter((x) => IDS[id].includes(x.id))) {
      for (const t of activeTimes(v)) {
        track.update(0.016, t); reg._refresh();
        if (!v.frame.active) continue;
        const gap = v.run + 1.4, { kart, calls } = behind(v, { gap }); tried++;
        if (reg.update(kart, 1 / 60, null) !== v.id) { reg.flights.clear(); continue; }
        launched++; seen.add(v.id);
        const c = calls.find((x) => x.o);
        assert.equal(c.o.source, 'vehicle'); assert.ok(c.vy > 5 && c.vy <= VEHICLE_JUMP.maxVy + 1e-9, `${v.id} vy ${c.vy}`);
        const p0 = behind(v, { gap }).kart.pos.clone();
        assert.ok(landsOnRoad(track, p0, new THREE.Vector3(kart.vel.x / 1.05, 0, kart.vel.z / 1.05), c.vy, v.frame.y, v.entrySet), `${v.id} lands on the road (t=${t})`);
        reg.flights.clear();
        assert.equal(reg.update(behind(v, { gap, speed: 12 }).kart, 1 / 60, null), null, 'slow kart bumps instead');
        assert.equal(reg.update(behind(v, { gap, turn: Math.PI / 2 }).kart, 1 / 60, null), null, 'side-on kart bumps instead');
        assert.equal(reg.update(behind(v, { gap, lat: v.width / 2 + 3 }).kart, 1 / 60, null), null, 'a kart in the next lane is not launched');
        const spun = behind(v, { gap }); spun.kart.status.spin = 1; assert.equal(reg.update(spun.kart, 1 / 60, null), null, 'a spinning kart is not launched');
        const air = behind(v, { gap }); air.kart.grounded = false; air.kart.pos.y += 3; assert.equal(reg.update(air.kart, 1 / 60, null), null, 'an airborne kart is not launched');
        reg.flights.clear();
      }
    }
    assert.ok(tried > 20 && launched >= 10, `${launched} launches in ${tried} tries`);
    assert.ok(seen.size >= IDS[id].length - 1, `${seen.size} of ${IDS[id].length} vehicles launched a kart: ${[...seen]}`);
  });

  test(`${id}: two forks; the second road of each is drivable end to end, full width, and the spline station keeps rising along it`, () => {
    const track = createTrack(id, { headless: true }), forks = track.def.forks ?? [];
    assert.ok(forks.length >= 2, `${forks.length} forks declared`);
    for (const f of forks) {
      const a = track.S(f.from), b = track.S(f.to), pf = track.model.platforms.find((p) => (p.def?.id ?? p.id) === f.alt);
      assert.ok(b > a && b - a < 700, `${f.id}: ${(b - a).toFixed(0)} m of spline between the fork marks`);
      assert.ok(pf && pf.branch, `${f.id}: ribbon '${f.alt}' exists`);
      assert.ok(track.ribbons.includes(pf), 'listed in track.ribbons');
      const o = q(), P = new THREE.Vector3(); let lastS = -1, bad = 0;
      for (let u = 0; u <= pf.total; u += 2.5) {
        const p = pf.at(u, {}); P.set(p.x, p.y + 1.0, p.z); track.query(P, o, lastS >= 0 ? lastS : undefined);
        if (!o.onRoad || o.inVoid || Math.abs(o.height - p.y) > 2.2) bad++;                   // (a kicker on the road rises up to 1.7 m)
        assert.ok(o.s >= a - 80 && o.s <= b + 80, `${f.id}: station ${o.s.toFixed(0)} within the fork span at u=${u.toFixed(0)}`);
        if (lastS >= 0) assert.ok(o.s - lastS > -4, `${f.id}: station never runs backwards (${lastS.toFixed(1)} -> ${o.s.toFixed(1)})`);
        lastS = o.s;
        for (const sg of [-1, 1]) {                                            // full width: both edges are road
          P.set(p.x + p.rx * sg * (p.w / 2 - 1.2), p.y + 1.0, p.z + p.rz * sg * (p.w / 2 - 1.2)); track.query(P, o, lastS);
          if (!o.onRoad || o.inVoid) bad++;
        }
      }
      assert.equal(bad, 0, `${f.id}: ${bad} off-road samples along the ribbon`);
      assert.ok(pf.total > 150, `${f.id}: length ${pf.total.toFixed(0)}`);
      // the second road is about as long as the spline stretch it replaces (a real alternative, not a shortcut or a detour)
      assert.ok(pf.total > (b - a) * 0.9 && pf.total < (b - a) * 1.25 + 10, `${f.id}: second road ${pf.total.toFixed(0)} m vs spline ${(b - a).toFixed(0)} m`);
    }
  });
}

test('datacentre: the bridge crosses clear above the return straight, and no other stretch of the spline overlaps another at an ambiguous height', () => {
  const track = createTrack('datacentre', { headless: true }), cl = track.model.cl, L = track.length;
  let minSep = 1e9, pairs = 0;
  for (let i = 0; i < cl.N; i += 2) {
    for (let j = i + 40; j < cl.N; j += 2) {
      if (Math.abs(cl.x[i] - cl.x[j]) > 9 || Math.abs(cl.z[i] - cl.z[j]) > 9) continue;
      if (cl.N - (j - i) < 40) continue;                                       // neighbours across the start line
      const dy = Math.abs(cl.y[i] - cl.y[j]); pairs++;
      assert.ok(dy >= 4.5, `stations ${(i * cl.ds).toFixed(0)} and ${(j * cl.ds).toFixed(0)} overlap in plan only ${dy.toFixed(1)} m apart in height`);
      minSep = Math.min(minSep, dy);
    }
  }
  assert.ok(pairs > 10, `${pairs} crossing samples (the bridge exists)`);
  assert.ok(minSep >= 4.5, `bridge clearance ${minSep.toFixed(1)} m`);
  const R = dcRoute(); assert.ok(Math.abs(R.cl.length - L) < 1e-6);
});

test('marcoverse: the viaduct crosses 15 m or more above the road of the Plunge, and the road under it (and its pads) keeps its own surface', () => {
  const track = createTrack('marcoverse', { headless: true }), via = track.ribbons.find((r) => r.def.id === 'viaduct');
  const o = q(), P = new THREE.Vector3(); let crossed = 0, worst = 0;
  for (let u = 0; u <= via.total; u += 3) {
    const p = via.at(u, {});
    P.set(p.x, p.y + 0.3, p.z); track.query(P, o); assert.ok(Math.abs(o.height - p.y) < 0.3 && o.onRoad, `on the viaduct at u=${u.toFixed(0)}: height ${o.height.toFixed(1)} vs ${p.y.toFixed(1)}`);
    P.set(p.x, 22, p.z); track.query(P, o);                                    // a kart far below the deck: it must not be lifted onto it
    if (o.onRoad && o.height < p.y - 15) { crossed++; worst = Math.max(worst, p.y - o.height); }
  }
  assert.ok(crossed >= 12, `${crossed} samples with the Plunge road 15 m or more below the viaduct (worst ${worst.toFixed(1)} m)`);
  // the pads on the viaduct are layer aware too: straight under via-boost0 a kart on the road is not boosted
  const pad = track.model.platforms.find((p) => p.def?.id === 'via-boost0');
  P.set(pad.x + pad.fx * 6, 24, pad.z + pad.fz * 6); track.query(P, o);
  assert.notEqual(o.surface, 'boost', 'no boost for the road underneath'); assert.ok(o.height < 36, `road under the pad ${o.height.toFixed(1)}`);
  P.set(pad.x + pad.fx * 6, pad.y0 + 0.2, pad.z + pad.fz * 6); track.query(P, o);
  assert.equal(o.surface, 'boost', 'a kart on the viaduct gets it');
});

test('datacentre: every stretch of the lap is a hot or a cold aisle (contiguous from the line to the line), both kinds, alternating', () => {
  const R = dcRoute(), z = aisleZones(R), L = R.cl.length;
  assert.equal(z[0].from, 0); assert.ok(Math.abs(z[z.length - 1].to - L) < 1e-6, 'reaches the line');
  for (let i = 1; i < z.length; i++) { assert.equal(z[i].from, z[i - 1].to, 'no gaps'); assert.notEqual(z[i].kind, z[i - 1].kind, 'neighbours alternate'); }
  assert.ok(z.some((a) => a.kind === 'hot') && z.some((a) => a.kind === 'cold') && z.length >= 6, `${z.length} aisle zones`);
  const hot = z.filter((a) => a.kind === 'hot').reduce((s, a) => s + a.to - a.from, 0);
  assert.ok(hot > L * 0.25 && hot < L * 0.65, `${((100 * hot) / L).toFixed(0)} % of the lap is hot aisle`);
  assert.equal(aisleAt(z, 10), 'cold'); assert.equal(aisleAt(z, R.S('exit', 20)), 'hot');
});

for (const id of ['datacentre', 'marcoverse']) {
  test(`${id}: 8 AIs take two laps on Professional without a fall or a respawn, with the traffic and both forks live (laps 70 to 100 s)`, () => {
    for (const seed of [11, 12]) {
      const race = new Race({ track: createTrack(id, { headless: true }), entries: makeEntries(8), laps: 2, difficulty: 'professional', seed, kartFactory: realKartFactory, updateTrack: true });
      const ev = recordEvents(['kart:respawn', 'kart:fall'], race);
      for (let i = 0; i < 60 * 330 && race.state !== 'finished'; i++) race.step(DT, null);
      assert.equal(race.state, 'finished', `seed ${seed} finished`);
      ev.off();
      for (const r of race.racers) assert.ok(r.lapTimes.every((t) => t > 65 && t < 105), `${r.id} laps ${r.lapTimes.map((t) => t.toFixed(1))}`);
      assert.equal(ev.log.length, 0, `seed ${seed}: ${ev.log.length} falls / respawns`);
      race.dispose();
    }
  });
}
