// The worked example of TRACKDEF.md (src/track/tracks/example_ribbon.js) must do everything the doc promises for tracks 3 and 4:
// no walls, void edges, inVoid queries, banking, spiral layers, a jump over a gap, boost chains, cheap headless build.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrack, registerTrack } from '../src/track/index.js';
import exampleRibbon from '../src/track/tracks/example_ribbon.js';
import { KartPhysics } from '../src/kart/KartPhysics.js';
import { SimpleKart } from '../src/kart/SimpleKart.js';
import { loopDiff } from '../src/core/util.js';
import { driveLaps } from './tracks_bot.js';

registerTrack('ribbon', exampleRibbon);
registerTrack('ribbon-nogap', () => ({ ...exampleRibbon({ gap: false }), id: 'ribbon-nogap' }));
const P = new THREE.Vector3(), N = new THREE.Vector3(), o = { height: 0, normal: new THREE.Vector3(), surface: '', onRoad: false, s: 0, lateral: 0, inVoid: false };

test('ribbon: builds headless in well under a second, with no meshes', () => {
  const t0 = performance.now(); const t = createTrack('ribbon', { headless: true }); const ms = performance.now() - t0;
  assert.ok(ms < 800, `${ms.toFixed(0)} ms`);
  assert.equal(t.group.children.length, 0);
  assert.ok(t.length > 2200 && t.length < 2600, `length ${t.length}`);
  assert.equal(t.environment.skyKind, 'space');
});

test('ribbon: no walls, void beyond the road edge, inVoid queries', () => {
  const t = createTrack('ribbon', { headless: true });
  let voids = 0, n = 0;
  for (let s = 5; s < t.length; s += 7) {
    const hw = t.widthAt(s) / 2;
    if (Math.abs(loopDiff(s, t.S('@jump-143'), t.length)) < 6) continue;         // the gap itself
    if (s > t.S('@jump') && s < t.S('@spiral') + 90) continue;                    // spiral: beside an upper layer lies the road below (not void)
    for (const side of [-1, 1]) {
      t.surfacePoint(s, side * (hw + 0.8), P); P.y += 0.3;
      assert.equal(t.collideWalls(P, 1.15, N), 0, `no wall at s=${s}`);
      t.query(P, o); n++;
      if (o.inVoid) { voids++; assert.equal(o.surface, 'void'); assert.equal(o.height, t.killY); assert.ok(!o.onRoad); }
      t.surfacePoint(s, side * (hw - 0.8), P); P.y += 0.1; t.query(P, o); assert.ok(o.onRoad && !o.inVoid, `on the road at ${s}`);
    }
  }
  assert.equal(voids, n, 'every sample past the edge is void');
});

test('ribbon: the gap is a hole in the road, the ramp is before it, boost pads chain', () => {
  const t = createTrack('ribbon', { headless: true });
  const g = t.S('@jump-143'); t.surfacePoint(g, 0, P); P.y += 1; t.query(P, o);
  assert.ok(o.inVoid, 'gap is void');
  const r = t.jumpRamps[0]; assert.ok(r && r.height > 2 && r.id === 'gap-ramp');
  assert.equal(t.boostPads.length, 3);
  const ss = t.boostPads.map((b) => b.s); assert.ok(ss[1] - ss[0] === 40 && ss[2] - ss[1] === 40, `pads ${ss}`);
  t.surfacePoint(ss[1], 0, P); t.query(P, o); assert.equal(o.surface, 'boost'); assert.ok(o.onRoad);
  // respawn never lands in the gap or on the ramp
  for (let s = g - 20; s < g + 20; s += 1) { const rs = t.respawnAt(s); t.query(rs.pos, o); assert.ok(o.onRoad && !o.inVoid, `respawn at ${s}`); }
});

test('ribbon: banking follows the sign convention and the spiral resolves both layers by height', () => {
  const t = createTrack('ribbon', { headless: true });
  const sb = t.sample(t.S('@bank')); assert.ok(sb.banking > 0.3, `bank ${sb.banking}`);
  t.surfacePoint(t.S('@bank'), 8, P); const yr = P.y; t.surfacePoint(t.S('@bank'), -8, P); assert.ok(yr < P.y - 2, 'right edge is lower');
  assert.equal(t.model.layered, true, 'the spiral overlaps itself');
  let n = 0;
  for (let s = t.S('@jump') + 10; s < t.S('@spiral') - 5; s += 3.3) {
    for (const lat of [-5, 0, 6]) {
      t.surfacePoint(s, lat, P); P.y += 0.4;
      for (const hint of [undefined, s + 2]) {
        t.query(P, o, hint);
        assert.ok(Math.abs(loopDiff(s, o.s, t.length)) < 0.2, `layer confusion at s=${s} (${o.s}) hint=${hint}`);
        assert.ok(o.onRoad && Math.abs(o.height - (P.y - 0.4)) < 0.05); n++;
      }
    }
  }
  assert.ok(n > 300);
});

test('ribbon: checkpoints are ordered; item boxes and the grid are on the road', () => {
  const t = createTrack('ribbon', { headless: true });
  assert.equal(t.checkpointS.length, 10);
  for (let i = 1; i < 10; i++) assert.ok(t.checkpointS[i] > t.checkpointS[i - 1]);
  for (let i = 0; i < 8; i++) { const g = t.gridSlot(i); t.query(g.pos, o); assert.ok(o.onRoad && !o.inVoid, `slot ${i}`); }
  for (const b of t.itemBoxes) { P.copy(b.pos); t.query(P, o); assert.ok(o.onRoad); }
});

test('ribbon: KartPhysics bot laps with the gap (jumps it); SimpleKart laps the no-gap variant', () => {
  const a = driveLaps(createTrack('ribbon', { headless: true }), KartPhysics, { laps: 2, maxTime: 300 });
  assert.ok(a.finished && !a.fell && !a.stuck && !a.nan, JSON.stringify({ t: a.time, fell: a.fellAt, stuck: a.stuckAt }));
  assert.ok(a.airTime > 0.5, 'the bot really jumps');
  assert.ok(a.laps[0] > 55 && a.laps[0] < 95, `lap ${a.laps[0]}`);
  const b = driveLaps(createTrack('ribbon-nogap', { headless: true }), SimpleKart, { laps: 1, maxTime: 300 });
  assert.ok(b.finished && !b.fell && !b.stuck, JSON.stringify({ t: b.time, fell: b.fellAt, stuck: b.stuckAt }));
});
