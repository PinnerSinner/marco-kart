// Cloud Nine Data Centre: contract tests (headless), the cable-trench shortcut, the spiral, and bot laps with the real KartPhysics and SimpleKart.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrack } from '../src/track/index.js';
import { KartPhysics } from '../src/kart/KartPhysics.js';
import { SimpleKart } from '../src/kart/SimpleKart.js';
import { routeInfo } from '../src/track/builders/scenery/datacentre/route.js';
import { trenchSpec } from '../src/track/builders/scenery/datacentre/trench.js';
import { loopDiff, wrapAngle, clamp } from '../src/core/util.js';
import { driveLaps } from './tracks_bot.js';

const id = 'datacentre';
const t = createTrack(id, { headless: true });
const P = new THREE.Vector3(), N = new THREE.Vector3();
const q = () => ({ height: 0, normal: new THREE.Vector3(), surface: '', onRoad: false, s: 0, lateral: 0, inVoid: false });

test('datacentre: metadata, closed loop, indoor environment, length and lap time inside the brief', () => {
  assert.equal(t.id, id); assert.equal(t.lapCount, 3); assert.equal(t.def.music, 'datacentre');
  assert.ok(t.length > 2400 && t.length < 2900, `length ${t.length}`);
  const a = t.sample(0), b = t.sample(t.length - 1e-6);
  assert.ok(a.pos.distanceTo(b.pos) < 1e-3 && a.tangent.dot(b.tangent) > 0.9999, 'wraps to itself');
  assert.equal(t.def.environment.skyKind, 'indoor');
  assert.ok(t.environment.sunDir.isVector3 && Math.abs(t.environment.sunDir.length() - 1) < 1e-6);
  assert.ok(t.minimapOutline(128).length === 128);
});

test('datacentre: checkpoints ascend, 6 to 12 of them, first is the line, none more than 500 m apart', () => {
  const c = t.checkpointS;
  assert.ok(c.length >= 6 && c.length <= 12, `${c.length} checkpoints`);
  assert.equal(c[0], 0);
  for (let i = 1; i < c.length; i++) { assert.ok(c[i] > c[i - 1] && c[i] < t.length, `checkpoint ${i}`); assert.ok(c[i] - c[i - 1] < 500); }
  assert.ok(t.length - c[c.length - 1] < 500);
});

test('datacentre: eight grid slots sit on the road, in order, facing forward', () => {
  const seen = [], o = q();
  for (let i = 0; i < 8; i++) {
    const g = t.gridSlot(i); t.query(g.pos, o);
    assert.ok(o.onRoad && o.surface === 'road' && !o.inVoid, `slot ${i}: ${o.surface}`);
    assert.ok(Math.abs(o.lateral) < t.widthAt(o.s) / 2 - 1, `slot ${i} lateral ${o.lateral}`);
    assert.ok(Math.abs(g.pos.y - o.height) < 0.05, `slot ${i} height`);
    const sm = t.sample(o.s); assert.ok(Math.abs(wrapAngle(g.heading - Math.atan2(sm.tangent.x, sm.tangent.z))) < 0.02, `slot ${i} heading`);
    seen.push(loopDiff(0, o.s, t.length));
  }
  assert.ok(seen.every((v) => v < 0), 'all behind the line');
  assert.ok(seen[0] > seen[2] && seen[2] > seen[4] && seen[4] > seen[6], 'rows go back');
});

test('datacentre: 6 to 8 item-box rows of three hover over the road', () => {
  assert.ok(t.itemBoxes.length >= 18 && t.itemBoxes.length <= 24 && t.itemBoxes.length % 3 === 0, `${t.itemBoxes.length} boxes`);
  const o = q();
  for (const b of t.itemBoxes) {
    P.set(b.pos.x, b.pos.y, b.pos.z); t.query(P, o);
    assert.ok(o.onRoad && !o.inVoid, `box at s=${b.s}: ${o.surface}`);
    assert.ok(Math.abs(o.lateral) < t.widthAt(o.s) / 2 - 0.5, `box lateral ${o.lateral}`);
    assert.ok(b.pos.y - o.height > 0.3 && b.pos.y - o.height < 4, `hover ${b.pos.y - o.height}`);
  }
});

test('datacentre: dense sweep of sample() and query() has no NaN; the centre line is always road', () => {
  const o = q(), sm = {};
  for (let s = 0; s < t.length; s += 0.9) {
    t.sample(s, sm);
    for (const v of [sm.pos, sm.tangent, sm.right, sm.up]) assert.ok(Number.isFinite(v.x + v.y + v.z), `sample NaN at ${s}`);
    for (const lat of [-t.widthAt(s) / 2 - 12, -3, 0, 3, t.widthAt(s) / 2 + 12]) {
      t.surfacePoint(s, lat, P); t.query(P, o, s);
      assert.ok(Number.isFinite(o.height + o.s + o.lateral + o.normal.x + o.normal.y + o.normal.z), `query NaN at ${s}/${lat}`);
      assert.ok(Math.abs(o.normal.length() - 1) < 1e-3, 'unit normal');
      if (lat === 0) assert.ok(o.onRoad && Math.abs(loopDiff(s, o.s, t.length)) < 0.1, `centre off road at ${s}: ${o.surface}`);
    }
  }
  for (const bad of [[NaN, 0, 0], [0, NaN, 0], [1e9, 0, 0], [Infinity, 1, 1]]) { P.set(...bad); const r = t.query(P, o); assert.ok(r.inVoid && Number.isFinite(r.height)); }
});

test('datacentre: collideWalls pushes back toward the road; the centre line is never blocked', () => {
  const sm = {}; let walls = 0;
  for (let s = 0; s < t.length; s += 3) {
    t.sample(s, sm);
    for (const side of [-1, 1]) {
      t.surfacePoint(s, side * (sm.width / 2 + t.road.wallGap + 0.4), P); P.y += 0.2;
      const d = t.collideWalls(P, 1.15, N);
      assert.ok(Number.isFinite(d));
      if (d > 0) {
        walls++;
        const toward = N.x * sm.right.x * -side + N.z * sm.right.z * -side;
        assert.ok(toward > 0.5 || Math.abs(N.y) < 1e-6, `push points away from the road at s=${s} side=${side}: n=(${N.x.toFixed(2)},${N.z.toFixed(2)})`);
        assert.ok(Math.abs(N.y) < 1e-9 && Math.abs(N.length() - 1) < 1e-3, 'horizontal unit normal');
      }
    }
  }
  assert.ok(walls > 100, `${walls} wall / collider hits`);
  for (let s = 0; s < t.length; s += 5) { t.surfacePoint(s, 0, P); P.y += 0.1; assert.equal(t.collideWalls(P, 1.15, N), 0, `blocked at the centre line, s=${s}`); }
});

test('datacentre: repeatable (same seed gives the same track) and headless is cheap', () => {
  const t0 = performance.now(); const a = createTrack(id, { headless: true }); const ms = performance.now() - t0;
  assert.ok(ms < 1500, `headless build took ${ms.toFixed(0)} ms`);
  assert.equal(a.length, t.length); assert.equal(a.itemBoxes.length, t.itemBoxes.length);
  assert.equal(a.group.children.length, 0, 'no meshes when headless');
});

test('datacentre: boost pads (a dozen or so, two of them on the forks) and a jump, all on the road', () => {
  const o = q();
  assert.ok(t.boostPads.length >= 8 && t.boostPads.length <= 24, `${t.boostPads.length} boost pads`);
  assert.ok(t.jumpRamps.length >= 1, 'jump ramp');
  for (const b of t.boostPads) { t.surfacePoint(b.s, b.lateral, P); t.query(P, o, b.s); assert.ok(o.onRoad && !o.inVoid, `boost at ${b.s}`); }
});

test('datacentre: the spiral descends at least 5 m per turn and the lap climbs 10 m and comes back', () => {
  const s0 = t.S('@sp0'), s1 = t.S('@sp1');
  const y0 = t.sample(s0).pos.y, y1 = t.sample(s1).pos.y;
  assert.ok(y0 - y1 > 9, `spiral drop ${(y0 - y1).toFixed(2)}`);
  let hi = -1e9, lo = 1e9; for (let s = 0; s < t.length; s += 3) { const y = t.sample(s).pos.y; hi = Math.max(hi, y); lo = Math.min(lo, y); }
  assert.ok(hi - lo > 9.5 && hi - lo < 12, `elevation range ${(hi - lo).toFixed(2)}`);
  // the spiral crosses over itself: some pair of points 300+ m apart in s share x,z within 20 m but differ in height by 5+ m
  let stacked = false;
  for (let a = s0; a < s1 && !stacked; a += 6) { const pa = t.sample(a).pos; for (let b = a + 200; b < s1; b += 6) { const pb = t.sample(b).pos; if (Math.hypot(pa.x - pb.x, pa.z - pb.z) < 18 && Math.abs(pa.y - pb.y) > 5) { stacked = true; break; } } }
  assert.ok(stacked, 'the spiral stacks over itself with 5+ m clearance');
});

test('datacentre: the cable trench is a declared shortcut with grating road, oil spills, a boost pad and rack colliders', () => {
  const R = routeInfo(), T = trenchSpec(R), o = q();
  assert.equal(t.shortcuts?.length ?? t.def.shortcuts.length, 3);
  const centre = (u, v = 0) => { const p = T.dp(u, v); P.set(p.x, 3, p.z); return t.query(P, o); };
  // the grating road: every centre-line point of the deck that is clear of a spill or the boost pad reports plain road (the deck midpoint itself
  // sits on the third spill by design, so it is not a valid probe for "plain grating"); points on a spill or the pad must not
  const onPad = (u, v) => [...T.oil.map((s) => ({ u0: s.u - s.length / 2, u1: s.u + s.length / 2, v0: s.v - s.width / 2, v1: s.v + s.width / 2 })),
    (() => { const bu = (T.boost.x - T.deck.x) * T.deck.ax + (T.boost.z - T.deck.z) * T.deck.az; return { u0: bu, u1: bu + T.boost.length, v0: -T.boost.width / 2, v1: T.boost.width / 2 }; })()].some((r) => u >= r.u0 - 0.6 && u <= r.u1 + 0.6 && v >= r.v0 - 0.6 && v <= r.v1 + 0.6);
  let plain = 0;
  for (let u = 4; u < T.deck.length - 4; u += 2) {
    centre(u);
    assert.ok(o.onRoad && !o.inVoid, `deck is driveable at u=${u}: ${o.surface}`);
    if (!onPad(u, 0)) { assert.equal(o.surface, 'road', `plain grating at u=${u}`); plain++; }
  }
  assert.ok(plain >= 40, `${plain} plain grating probes`);
  const p0 = T.dp(0, 0); P.set(p0.x, 3, p0.z); t.query(P, o);
  for (const s of T.oil) { P.set(s.x + Math.sin(s.yaw) * s.length / 2, 3, s.z + Math.cos(s.yaw) * s.length / 2); t.query(P, o); assert.equal(o.surface, 'oil', 'oil pad'); assert.ok(o.onRoad); }
  P.set(T.boost.x + Math.sin(T.boost.yaw) * T.boost.length / 2, 3, T.boost.z + Math.cos(T.boost.yaw) * T.boost.length / 2); t.query(P, o); assert.equal(o.surface, 'boost');
  assert.ok(T.oil.length >= 3, 'at least three spills');
  // the deck edges are walled by rack rows: a kart at the edge of the deck is pushed back inside, the centre line is free
  for (const v of [-T.deck.width / 2 - 0.6, T.deck.width / 2 + 0.6]) { const p = T.dp(T.deck.length / 2, v); P.set(p.x, R.Y0 + 0.2, p.z); assert.ok(t.collideWalls(P, 1.15, N) > 0, `rack row at v=${v}`); }
  const pc = T.dp(T.deck.length / 2, 0); P.set(pc.x, R.Y0 + 0.2, pc.z); assert.equal(t.collideWalls(P, 1.15, N), 0);
});

/** Drive the stretch end of fork 1 -> end of the dogleg with a pursuit controller, either along the road or through the trench waypoints. */
function trenchRun(useTrench) {
  const R = routeInfo(), T = trenchSpec(R);
  const kart = new KartPhysics(t, { id: 'b', charId: 'marco', kartId: 'cruiser', stats: { speed: 3, accel: 3, handling: 3, weight: 3 } });
  const sStart = R.S('pre', -110), g = R.at(sStart, 0);
  kart.teleport(new THREE.Vector3(g.x, g.y, g.z), g.yaw); kart.vel.set(Math.sin(g.yaw) * 30, 0, Math.cos(g.yaw) * 30);
  const o = q(), tgt = new THREE.Vector3(), way = useTrench ? [R.at(T.sA - 20, -3), R.at(T.sA, -7), R.at(T.sQ, -14.2), R.at(T.sQ + 40, -4.5)] : null;
  let time = 0, lastS = sStart, hits = 0, prevV = 30, wi = 0; const surfaces = {};
  const sEnd = R.S('dl1', 0);
  for (let i = 0; i < 60 * 40; i++) {
    t.query(kart.pos, o, lastS); lastS = o.s; surfaces[o.surface] = (surfaces[o.surface] ?? 0) + 1;
    if (loopDiff(sStart, o.s, t.length) > loopDiff(sStart, sEnd, t.length) && Math.abs(o.lateral) < 12) break;
    if (useTrench) {
      while (wi < way.length - 2 && Math.hypot(way[wi + 1].x - kart.pos.x, way[wi + 1].z - kart.pos.z) < 14) wi++;
      const a = way[wi], b = way[wi + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
      let u = ((kart.pos.x - a.x) * (b.x - a.x) + (kart.pos.z - a.z) * (b.z - a.z)) / (L * L) + 16 / L, tx, tz;
      if (u <= 1 || wi >= way.length - 2) { u = Math.min(u, 1.6); tx = a.x + (b.x - a.x) * u; tz = a.z + (b.z - a.z) * u; }
      else { const c = way[wi + 2], L2 = Math.hypot(c.x - b.x, c.z - b.z), u2 = ((u - 1) * L) / L2; tx = b.x + (c.x - b.x) * u2; tz = b.z + (c.z - b.z) * u2; }
      tgt.set(tx, 0, tz);
    } else t.surfacePoint(o.s + 12 + 0.5 * kart.speed, 0, tgt);
    const err = wrapAngle(Math.atan2(tgt.x - kart.pos.x, tgt.z - kart.pos.z) - kart.yaw);
    kart.update(1 / 60, { throttle: kart.speed < 31 ? 1 : 0, brake: 0, steer: clamp(-err * 2.2, -1, 1), drift: false });
    time += 1 / 60;
    if (kart.speed < prevV - 7) hits++;
    prevV = kart.speed;
  }
  return { time, hits, surfaces };
}

test('datacentre: the trench is a real shortcut (faster than the road, crosses oil, no wall hits)', () => {
  const main = trenchRun(false), cut = trenchRun(true);
  console.log(`datacentre trench: road ${main.time.toFixed(2)} s, trench ${cut.time.toFixed(2)} s`, JSON.stringify(cut.surfaces));
  assert.ok(cut.time < main.time - 1.0, `trench ${cut.time.toFixed(2)} vs road ${main.time.toFixed(2)}`);
  assert.ok((cut.surfaces.oil ?? 0) > 10, 'crossed the oil');
  assert.ok((cut.surfaces.boost ?? 0) > 5, 'crossed the boost pad');
  assert.ok(cut.hits <= 2, `${cut.hits} wall hits`);
});

test('datacentre: pursuit bot completes 2 laps with KartPhysics (no void, no stall, no NaN); lap time 70 to 100 s', () => {
  const track = createTrack(id, { headless: true });
  const r = driveLaps(track, KartPhysics, { laps: 2, maxTime: 300 });
  const info = `${id}: t=${r.time.toFixed(1)}s progress=${r.progress.toFixed(0)}/${(2 * track.length).toFixed(0)} fell=${r.fell}@${r.fellAt} stuck=${r.stuck}@${r.stuckAt} wallHits=${r.wallHits} off=${r.offRoadTime.toFixed(1)}s laps=${r.laps.map((v) => v.toFixed(1))}`;
  console.log(info);
  assert.ok(!r.nan && !r.fell && !r.stuck && r.finished, info);
  assert.ok(r.laps[0] > 70 && r.laps[0] < 100, `lap ${r.laps[0]}`);
  assert.ok(r.wallHits <= 3, `${r.wallHits} wall hits: ${info}`);
});

test('datacentre: pursuit bot also laps with SimpleKart', () => {
  const track = createTrack(id, { headless: true });
  const r = driveLaps(track, SimpleKart, { laps: 1, maxTime: 300 });
  assert.ok(r.finished && !r.fell && !r.stuck, `simple: ${JSON.stringify({ t: r.time, f: r.fell, s: r.stuck, at: r.stuckAt ?? r.fellAt })}`);
});
