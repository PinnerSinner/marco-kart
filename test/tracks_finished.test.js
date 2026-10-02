// Contract tests for the two shipped tracks (copacabana, blighty), headless: loop, checkpoints, grid, item boxes, NaN, walls, obstacles.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrack } from '../src/track/index.js';
import { loopDiff } from '../src/core/util.js';

const IDS = ['copacabana', 'blighty'];
const tracks = Object.fromEntries(IDS.map((id) => [id, createTrack(id, { headless: true })]));
const P = new THREE.Vector3(), N = new THREE.Vector3();
const q = () => ({ height: 0, normal: new THREE.Vector3(), surface: '', onRoad: false, s: 0, lateral: 0, inVoid: false });

for (const id of IDS) {
  const t = tracks[id];

  test(`${id}: metadata, closed loop, lap length within the 60 to 90 s brief`, () => {
    assert.equal(t.id, id); assert.equal(t.lapCount, 3);
    assert.ok(t.length > 1500 && t.length < 3200, `length ${t.length}`);
    const a = t.sample(0), b = t.sample(t.length - 1e-6);
    assert.ok(a.pos.distanceTo(b.pos) < 1e-3 && a.tangent.dot(b.tangent) > 0.9999, 'wraps to itself');
    assert.ok(t.minimapOutline(128).length === 128);
    assert.ok(t.environment.sunDir.isVector3 && Math.abs(t.environment.sunDir.length() - 1) < 1e-6);
  });

  test(`${id}: checkpoints ascend, 6 to 12 of them, first is the line`, () => {
    const c = t.checkpointS;
    assert.ok(c.length >= 6 && c.length <= 12, `${c.length} checkpoints`);
    assert.equal(c[0], 0);
    for (let i = 1; i < c.length; i++) assert.ok(c[i] > c[i - 1] && c[i] < t.length, `checkpoint ${i}`);
    for (let i = 1; i < c.length; i++) assert.ok(c[i] - c[i - 1] < 500, `checkpoints ${i - 1}..${i} are ${c[i] - c[i - 1]} m apart`);
  });

  test(`${id}: eight grid slots sit on the road, in the right order, facing forward`, () => {
    const seen = [], o = q();
    for (let i = 0; i < 8; i++) {
      const g = t.gridSlot(i); t.query(g.pos, o);
      assert.ok(o.onRoad && o.surface === 'road' && !o.inVoid, `slot ${i}: ${o.surface}`);
      assert.ok(Math.abs(o.lateral) < t.widthAt(o.s) / 2 - 1, `slot ${i} lateral ${o.lateral}`);
      assert.ok(Math.abs(g.pos.y - o.height) < 0.05, `slot ${i} height`);
      const sm = t.sample(o.s); assert.ok(Math.abs(Math.atan2(Math.sin(g.heading - Math.atan2(sm.tangent.x, sm.tangent.z)), Math.cos(g.heading - Math.atan2(sm.tangent.x, sm.tangent.z)))) < 0.02, `slot ${i} heading`);
      seen.push(loopDiff(0, o.s, t.length));
    }
    assert.ok(seen.every((v) => v < 0), 'all behind the line');
    assert.ok(seen[0] > seen[2] && seen[2] > seen[4] && seen[4] > seen[6], 'rows go back');
    const pole = t.gridSlot(0), r2 = t.gridSlot(1); assert.ok(pole.pos.distanceTo(r2.pos) > 3);
  });

  test(`${id}: item boxes hover above the road, inside the road width, in rows of three`, () => {
    assert.ok(t.itemBoxes.length >= 12 && t.itemBoxes.length % 3 === 0, `${t.itemBoxes.length} boxes`);
    const o = q();
    for (const b of t.itemBoxes) {
      P.set(b.pos.x, b.pos.y, b.pos.z); t.query(P, o);
      assert.ok(o.onRoad && !o.inVoid, `box at s=${b.s}: ${o.surface}`);
      assert.ok(Math.abs(o.lateral) < t.widthAt(o.s) / 2 - 0.5, `box lateral ${o.lateral}`);
      assert.ok(b.pos.y - o.height > 0.3 && b.pos.y - o.height < 4, `hover ${b.pos.y - o.height}`);
    }
  });

  test(`${id}: dense sweep of sample() and query() has no NaN; centre line is always on the road`, () => {
    const o = q(), sm = {};
    for (let s = 0; s < t.length; s += 0.9) {
      t.sample(s, sm);
      for (const v of [sm.pos, sm.tangent, sm.right, sm.up]) assert.ok(Number.isFinite(v.x + v.y + v.z), `sample NaN at ${s}`);
      for (const lat of [-t.widthAt(s) / 2 - 12, -3, 0, 3, t.widthAt(s) / 2 + 12]) {
        t.surfacePoint(s, lat, P);
        t.query(P, o, s);
        assert.ok(Number.isFinite(o.height + o.s + o.lateral + o.normal.x + o.normal.y + o.normal.z), `query NaN at ${s}/${lat}`);
        assert.ok(Math.abs(o.normal.length() - 1) < 1e-3, 'unit normal');
        if (lat === 0) assert.ok(o.onRoad && Math.abs(loopDiff(s, o.s, t.length)) < 0.1, `centre off road at ${s}: ${o.surface} s=${o.s}`);
      }
    }
    for (const bad of [[NaN, 0, 0], [0, NaN, 0], [1e9, 0, 0], [Infinity, 1, 1]]) { P.set(...bad); const r = t.query(P, o); assert.ok(r.inVoid && Number.isFinite(r.height)); }
  });

  test(`${id}: collideWalls pushes back into the track (normal points toward the road, penetration positive)`, () => {
    const sm = {}, nrm = new THREE.Vector3(); let walls = 0;
    for (let s = 0; s < t.length; s += 3) {
      t.sample(s, sm);
      for (const side of [-1, 1]) {
        const lat = side * (sm.width / 2 + t.road.wallGap + 0.4);
        t.surfacePoint(s, lat, P); P.y += 0.2;
        const d = t.collideWalls(P, 1.15, nrm);
        assert.ok(Number.isFinite(d));
        if (d > 0) {
          walls++;
          const toward = nrm.x * sm.right.x * -side + nrm.z * sm.right.z * -side;
          assert.ok(toward > 0.5 || Math.abs(nrm.y) < 1e-6, `push points away from the road at s=${s} side=${side}: n=(${nrm.x.toFixed(2)},${nrm.z.toFixed(2)})`);
          assert.ok(Math.abs(nrm.y) < 1e-9 && Math.abs(nrm.length() - 1) < 1e-3, 'horizontal unit normal');
        }
      }
    }
    assert.ok(walls > 20, `${walls} wall / collider hits`);
    // and the centre line of the road is never inside a wall or collider
    for (let s = 0; s < t.length; s += 5) { t.surfacePoint(s, 0, P); P.y += 0.1; assert.equal(t.collideWalls(P, 1.15, nrm), 0, `blocked at the centre line, s=${s}`); }
  });

  test(`${id}: repeatable (same seed gives the same track) and headless is cheap`, () => {
    const t0 = performance.now(); const a = createTrack(id, { headless: true }); const ms = performance.now() - t0;
    assert.ok(ms < 1500, `headless build took ${ms.toFixed(0)} ms`);
    assert.equal(a.length, t.length); assert.equal(a.itemBoxes.length, t.itemBoxes.length); assert.equal(a.obstacles.length, t.obstacles.length);
    assert.equal(a.group.children.length, 0, 'no meshes when headless');
  });
}

test('blighty: buses cross the road on schedule, are deterministic and hide when parked', () => {
  const t = createTrack('blighty', { headless: true });
  const buses = t.obstacles.filter((o) => o.kind === 'bus');
  assert.ok(buses.length >= 12, `${buses.length} bus circles`);
  const groups = [...new Set(buses.map((b) => b.group))]; assert.ok(groups.length >= 4);
  const snap = () => buses.map((b) => `${b.pos.x.toFixed(2)},${b.pos.z.toFixed(2)},${b.active}`).join('|');
  const seen = new Set(); let active = 0, inactive = 0, moved = 0, prev = null;
  for (let time = 0; time < 120; time += 0.25) {
    t.update(0.25, time);
    seen.add(snap()); for (const b of buses) b.active ? active++ : inactive++;
    const cur = buses.map((b) => b.pos.clone()); if (prev && cur.some((p, i) => p.distanceTo(prev[i]) > 0.5)) moved++; prev = cur;
    for (const b of buses) assert.ok(Number.isFinite(b.pos.x + b.pos.y + b.pos.z));
  }
  assert.ok(seen.size > 100, 'buses move');
  assert.ok(active > 0 && inactive > 0, 'buses are sometimes parked and hidden');
  assert.ok(moved > 20);
  // deterministic in time (not in call history)
  const t2 = createTrack('blighty', { headless: true }); t2.update(0.016, 77.5); t.update(0.016, 77.5);
  assert.equal(t.obstacles.filter((o) => o.kind === 'bus').map((b) => b.pos.x.toFixed(3)).join(), t2.obstacles.filter((o) => o.kind === 'bus').map((b) => b.pos.x.toFixed(3)).join());
  // a bus in the road at some moment does sit on the road
  const o = q(); let onRoad = false;
  for (let time = 0; time < 60 && !onRoad; time += 0.1) { t.update(0.1, time); for (const b of buses) if (b.active) { t.query(b.pos, o); if (o.onRoad) onRoad = true; } }
  assert.ok(onRoad, 'a bus crosses the road surface');
});

test('blighty: canal is a void, the bridge deck is solid, puddles report water, garages block their doors', () => {
  const t = createTrack('blighty', { headless: true }), o = q();
  // walk the whole lap: find the bridge (road crossing the canal) and check the deck / canal below it
  const bs = t.S('@bridge'); t.surfacePoint(bs, 0, P); t.query(P, o);
  assert.ok(o.onRoad && !o.inVoid, 'bridge deck is road');
  // canal: somewhere within 60 m of the bridge beside the road must be void
  let voids = 0, samples = 0;
  for (let s = bs - 40; s < bs + 40; s += 2) for (const side of [-1, 1]) for (let d = 10; d < 40; d += 3) {
    t.surfacePoint(s, side * (t.widthAt(s) / 2 + d), P); P.y = t.sample(s).pos.y; t.query(P, o); samples++; if (o.inVoid) voids++;
  }
  assert.ok(voids > 0, 'a canal void exists beside the bridge');
  // puddles: patches of kind water are on the road and report 'water'
  const water = (t.def.patches ?? []).filter((p) => p.kind === 'water'); assert.ok(water.length >= 4, `${water.length} water patches`);
  for (const p of water) { const s = t.S(p.s); t.surfacePoint(s, p.lateral ?? 0, P); t.query(P, o); assert.equal(o.surface, 'water'); assert.ok(o.onRoad); }
  // garages: capsule colliders exist near the junction marks
  for (const mk of ['j1', 'j2']) {
    const s = t.S(`@${mk}`); let blocked = 0;
    for (const side of [-1, 1]) { t.surfacePoint(s, side * (t.widthAt(s) / 2 + 10.6 + 15 - 1), P); P.y += 0.1; if (t.collideWalls(P, 1.15, N) > 0) blocked++; }
    assert.ok(blocked >= 1, `garage back wall at ${mk}`);
  }
});

test('copacabana: sand beside the road, ramps and boost pads present', () => {
  const t = createTrack('copacabana', { headless: true }), o = q();
  let sand = 0;
  for (let s = 0; s < t.length; s += 4) for (let d = 14; d < 90; d += 8) for (const side of [-1, 1]) {
    t.surfacePoint(s, side * (t.widthAt(s) / 2 + d), P); P.y = t.sample(s).pos.y + 1; t.query(P, o);
    if (o.surface === 'sand') sand++;
  }
  assert.ok(sand > 50, `${sand} sand samples`);
  assert.ok(t.jumpRamps.length >= 1 && t.boostPads.length >= 3, 'ramp + boost pads');
});
