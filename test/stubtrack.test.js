import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StubTrack } from '../src/track/StubTrack.js';
import { loopDiff } from '../src/core/util.js';

test('StubTrack: sample -> query round-trips s and lateral', () => {
  const t = new StubTrack();
  const out = {};
  for (let s = 0; s < t.length; s += 7.3) {
    for (const lat of [-6, 0, 4]) {
      const sm = t.sample(s);
      const p = sm.pos.clone().addScaledVector(sm.right, lat);
      t.query(p, out);
      assert.ok(Math.abs(loopDiff(s, out.s, t.length)) < 0.5, `s mismatch at ${s}: got ${out.s}`);
      assert.ok(Math.abs(out.lateral - lat) < 0.01, `lateral mismatch at s=${s}: ${out.lateral} vs ${lat}`);
    }
  }
});

test('StubTrack: surfaces, walls, grid', () => {
  const t = new StubTrack();
  const out = {};
  t.query(t.sample(50).pos, out);
  assert.equal(out.surface, 'road');
  t.query(t.sample(50).pos.clone().addScaledVector(t.sample(50).right, 30), out);
  assert.equal(out.surface, 'grass');
  const n = new THREE.Vector3();
  assert.equal(t.collideWalls(t.sample(50).pos, 1, n), 0);
  const far = t.sample(50).pos.clone().addScaledVector(t.sample(50).right, -(t.wallOffset + 1));
  const pen = t.collideWalls(far, 1, n);
  assert.ok(pen > 0);
  // normal should point back toward the centreline (i.e. along +right at this spot)
  assert.ok(n.dot(t.sample(50).right) > 0.9);
  const slots = Array.from({ length: 8 }, (_, i) => t.gridSlot(i));
  assert.equal(new Set(slots.map((g) => g.pos.toArray().join())).size, 8);
});
