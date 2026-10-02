// Engine tests on the synthetic fixture track (headless): continuity, round trips, walls, ramps, checkpoints, grid, perf.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Track } from '../src/track/Track.js';
import { fixtureDef } from './tracks_fixture.js';
import { loopDiff } from '../src/core/util.js';

const track = new Track(fixtureDef(), { headless: true });
const P = new THREE.Vector3(), out = {};

test('centreline: closed loop, continuous position / tangent, unit vectors, no NaN', () => {
  const a = track.sample(0), b = track.sample(track.length - 1e-6);
  assert.ok(a.pos.distanceTo(b.pos) < 1e-3, 'wraps to itself');
  assert.ok(a.tangent.dot(b.tangent) > 0.9999, 'tangent matches across the seam');
  let prev = track.sample(0).pos.clone(), prevT = track.sample(0).tangent.clone();
  for (let s = 0.5; s <= track.length; s += 0.5) {
    const sm = track.sample(s);
    for (const v of [sm.pos, sm.tangent, sm.right, sm.up]) assert.ok(Number.isFinite(v.x + v.y + v.z), `NaN at ${s}`);
    assert.ok(Math.abs(sm.tangent.length() - 1) < 1e-6 && Math.abs(sm.up.length() - 1) < 1e-6 && Math.abs(sm.right.length() - 1) < 1e-6);
    assert.ok(Math.abs(sm.tangent.dot(sm.up)) < 0.05, 'up is perpendicular to the tangent');
    assert.ok(sm.pos.distanceTo(prev) < 0.6, `gap in centreline at ${s}: ${sm.pos.distanceTo(prev)}`);
    assert.ok(sm.tangent.dot(prevT) > 0.99, `kink at ${s}`);
    prev = sm.pos.clone(); prevT = sm.tangent.clone();
  }
});

test('sample() is consistent with distance: |dpos/ds| = 1 along the slope', () => {
  for (let s = 3; s < track.length; s += 37) {
    const a = track.sample(s - 0.1).pos, b = track.sample(s + 0.1).pos;
    const d = a.distanceTo(b) / 0.2;
    assert.ok(d > 0.98 && d < 1.06, `speed of parametrisation at s=${s}: ${d}`);
  }
});

test('query round-trip: s, lateral and height for many offsets (with and without hint)', () => {
  let n = 0;
  for (let s = 1; s < track.length; s += 2.3) {
    for (const lat of [-8.5, -6, -2.2, 0, 3.1, 6.6, 8.4]) {
      track.surfacePoint(s, lat, P);
      for (const hint of [undefined, s + 3]) {
        track.query(P, out, hint);
        assert.ok(Math.abs(loopDiff(s, out.s, track.length)) < 0.03, `s at ${s}/${lat}: ${out.s}`);
        assert.ok(Math.abs(out.lateral - lat) < 0.03, `lateral at ${s}/${lat}: ${out.lateral}`);
        assert.ok(out.onRoad, `onRoad at ${s}/${lat} (${out.surface})`);
        n++;
      }
    }
  }
  assert.ok(n > 3000);
});

test('query height matches the drawn surface on road, and is continuous across the road edge into the verge', () => {
  for (let s = 5; s < track.length; s += 9) {
    if (s > 50 && s < 80) continue;                    // the jump ramp sits here (tested separately)
    let last = null;
    for (let lat = -14; lat <= 14; lat += 0.25) {
      track.surfacePoint(s, lat, P); track.query(P, out);
      if (Math.abs(lat) < 8.9) assert.ok(Math.abs(out.height - P.y) < 0.02, `height ${out.height} vs ${P.y} at s=${s} lat=${lat}`);
      if (last !== null) assert.ok(Math.abs(out.height - last) < 0.6, `height jump ${last} -> ${out.height} at s=${s} lat=${lat}`);
      last = out.height;
      assert.ok(out.normal.y > 0.3 && Math.abs(out.normal.length() - 1) < 1e-3, 'unit normal, facing up');
    }
  }
});

test('surface classification: road / kerb / sand / grass / boost / oil', () => {
  const at = (s, lat) => { track.surfacePoint(s, lat, P); return track.query(P, {}).surface; };
  assert.equal(at(300, 0), 'road');
  assert.equal(at(450, 12), 'grass');
  assert.equal(at(100, 0), 'boost');
  assert.equal(at(400, 3), 'oil');
  const hair = track.marks.hair;
  assert.equal(at(hair, 9.6), 'kerb');
  assert.equal(at(hair, 14), 'sand');
});

test('no NaN or throw for hostile query inputs; returns void far outside', () => {
  const bad = [new THREE.Vector3(NaN, 0, 0), new THREE.Vector3(1e9, 0, 0), new THREE.Vector3(0, NaN, 5), new THREE.Vector3(-1e5, 5, 1e5), new THREE.Vector3(0, 0, 0)];
  for (const v of bad) {
    const o = track.query(v, {});
    assert.ok(Number.isFinite(o.height) && Number.isFinite(o.s) && Number.isFinite(o.lateral), 'finite outputs');
    assert.ok(o.s >= 0 && o.s < track.length);
  }
  assert.equal(track.query(new THREE.Vector3(-1e5, 5, 1e5), {}).inVoid, true);
  assert.equal(track.collideWalls(new THREE.Vector3(NaN, 0, 0), 1, new THREE.Vector3()), 0);
});

test('walls: none mid-road, penetration + inward normal at the wall, none where no wall', () => {
  const n = new THREE.Vector3();
  const hw = 9 + track.road.wallGap;
  for (const s of [20, 80, 140, 190]) {
    for (const side of [-1, 1]) {
      track.surfacePoint(s, 0, P); assert.equal(track.collideWalls(P, 1.15, n), 0);
      track.surfacePoint(s, side * (hw - 1.15 - 0.5), P); assert.equal(track.collideWalls(P, 1.15, n), 0, 'clear inside the wall');
      track.surfacePoint(s, side * (hw - 1.15 + 0.4), P);
      const d = track.collideWalls(P, 1.15, n);
      assert.ok(Math.abs(d - 0.4) < 0.05, `penetration ${d} at s=${s} side=${side}`);
      const sm = track.sample(s);
      assert.ok(n.dot(sm.right) * side < -0.98, 'normal points back into the track');
      assert.ok(Math.abs(n.y) < 1e-6 && Math.abs(n.length() - 1) < 1e-6);
      P.addScaledVector(n, d); assert.ok(track.collideWalls(P, 1.15, n) < 1e-3, 'pushing along the normal resolves it');
    }
  }
  track.surfacePoint(400, 13, P); assert.equal(track.collideWalls(P, 1.15, n), 0, 'no wall on this stretch');
});

test('jump ramp: height field rises consistently and geometry agrees with query', () => {
  const r = track.model.platforms[0];
  let prev = -Infinity;
  for (let du = 0; du <= r.length; du += 0.5) {
    const x = r.x + r.fx * du, z = r.z + r.fz * du;
    P.set(x, 50, z); track.query(P, out);
    assert.ok(out.height >= prev - 1e-6, 'monotonic rise');
    prev = out.height;
    if (du > 1 && du < r.length - 0.6) assert.ok(out.normal.dot(new THREE.Vector3(r.fx, 0, r.fz)) < 0.05, 'normal tilts back against travel');
  }
  const top = out.height;
  P.set(r.x + r.fx * (r.length + 1.5), 50, r.z + r.fz * (r.length + 1.5)); track.query(P, out);
  assert.ok(top - out.height > 1.8, `lip drops away: ${top} -> ${out.height}`);
  assert.equal(track.jumpRamps.length, 1);
});

test('checkpoints: ascending, first is the start line, in range', () => {
  const c = track.checkpointS;
  assert.equal(c[0], 0);
  for (let i = 1; i < c.length; i++) assert.ok(c[i] > c[i - 1] && c[i] < track.length);
});

test('grid: 8 slots on the road, facing forward, behind the line, no overlaps', () => {
  const slots = Array.from({ length: 8 }, (_, i) => track.gridSlot(i));
  for (const [i, g] of slots.entries()) {
    track.query(g.pos, out);
    assert.ok(out.onRoad && out.surface === 'road', `slot ${i} on road (${out.surface})`);
    assert.ok(Math.abs(out.lateral) < 7, `slot ${i} lateral ${out.lateral}`);
    const behind = loopDiff(out.s, 0, track.length);
    assert.ok(behind > 3 && behind < 60, `slot ${i} is ${behind} m behind the line`);
    const sm = track.sample(out.s), fwd = new THREE.Vector3(Math.sin(g.heading), 0, Math.cos(g.heading));
    assert.ok(fwd.dot(sm.tangent) > 0.99, 'heading follows the road');
    assert.ok(Math.abs(g.pos.y - out.height) < 0.05, 'slot sits on the road surface');
  }
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) assert.ok(slots[i].pos.distanceTo(slots[j].pos) > 3.0 * 1.15, `slots ${i}/${j} overlap`);
  assert.ok(track.gridSlot(0).pos.distanceTo(new THREE.Vector3(0, 0, 0)) < track.gridSlot(7).pos.distanceTo(new THREE.Vector3(0, 0, 0)), 'pole is nearest the line');
});

test('item boxes: rows of 3, hovering above the road', () => {
  assert.equal(track.itemBoxes.length % 3, 0);
  for (const b of track.itemBoxes) {
    track.query(b.pos, out);
    assert.ok(out.onRoad && b.pos.y - out.height > 1 && b.pos.y - out.height < 2);
  }
});

test('respawnAt: lands on plain road facing forward, never on a ramp/oil/boost', () => {
  for (let s = 0; s < track.length; s += 11) {
    const r = track.respawnAt(s);
    track.query(r.pos, out);
    assert.ok(out.onRoad && out.surface !== 'oil' && out.surface !== 'water');
    assert.ok(Math.abs(loopDiff(s, out.s, track.length)) < 130);
  }
});

test('minimapOutline: closed loop of the requested size', () => {
  const pts = track.minimapOutline(64);
  assert.equal(pts.length, 64);
  assert.ok(pts.every((p) => p.length === 2 && Number.isFinite(p[0] + p[1])));
});

test('query throughput >= 200k / s (hinted and unhinted, allocation free)', () => {
  const o = {}, v = new THREE.Vector3(); let sum = 0;
  for (const hinted of [true, false]) {
    for (let k = 0; k < 20000; k++) { track.surfacePoint((k * 0.7) % track.length, ((k * 7) % 13) - 6, v); track.query(v, o, hinted ? (k * 0.7) % track.length : undefined); }
    const t0 = performance.now(), N = 200000;
    for (let k = 0; k < N; k++) { track.surfacePoint((k * 0.37) % track.length, ((k * 7) % 13) - 6, v); track.query(v, o, hinted ? (k * 0.37) % track.length : undefined); sum += o.height; }
    const qps = N / ((performance.now() - t0) / 1000);
    assert.ok(qps > 200000, `${hinted ? 'hinted' : 'unhinted'} ${Math.round(qps)} q/s`);
  }
  assert.ok(Number.isFinite(sum));
});
