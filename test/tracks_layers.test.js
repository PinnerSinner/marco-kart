// Overlapping roads (bridge / spiral) and terrain-less void tracks: the query must pick the right layer.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Track } from '../src/track/Track.js';
import { loopDiff } from '../src/core/util.js';

function figureEight() {
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    pts.push({ x: 220 * Math.sin(t), z: 110 * Math.sin(2 * t), y: 4 + 4 * Math.cos(t), w: 16, bank: 0, id: i === 0 ? 'cross' : null });
  }
  return { id: 'eight', name: 'Figure eight', points: pts, terrain: false, road: { width: 16, thickness: 1.2 }, checkpointCount: 8 };
}

test('figure-eight: both layers resolve to the right s, with and without a hint', () => {
  const t = new Track(figureEight(), { headless: true });
  assert.equal(t.model.layered, true, 'overlap detected');
  const P = new THREE.Vector3(), out = {};
  let n = 0;
  for (let s = 0; s < t.length; s += 4.1) {
    for (const lat of [-4, 0, 5]) {
      t.surfacePoint(s, lat, P);
      P.y += 0.3;                               // hovering slightly, as a kart would
      for (const hint of [undefined, s - 2, s + 5]) {
        t.query(P, out, hint);
        assert.ok(Math.abs(loopDiff(s, out.s, t.length)) < 0.1, `s=${s} lat=${lat} hint=${hint}: got s=${out.s}`);
        assert.ok(Math.abs(out.lateral - lat) < 0.05);
        assert.ok(Math.abs(out.height - (P.y - 0.3)) < 0.05, `height ${out.height} vs ${P.y - 0.3}`);
        assert.ok(out.onRoad);
        n++;
      }
    }
  }
  assert.ok(n > 1500);
});

test('terrain-less track: everything beside the road is void', () => {
  const t = new Track(figureEight(), { headless: true });
  const P = new THREE.Vector3(), out = {};
  t.surfacePoint(300, 12, P); t.query(P, out);
  assert.equal(out.inVoid, true); assert.equal(out.surface, 'void'); assert.equal(out.onRoad, false);
  assert.equal(out.height, t.killY);
  t.surfacePoint(300, 7.9, P); t.query(P, out);
  assert.equal(out.inVoid, false);
  assert.equal(t.collideWalls(P, 1.15, new THREE.Vector3()), 0, 'no walls on an open track');
});

test('gap zones make real holes in the road', () => {
  const def = figureEight(); def.zones = [{ from: 200, to: 230, gap: true }];
  const t = new Track(def, { headless: true });
  const P = new THREE.Vector3(), out = {};
  t.surfacePoint(215, 0, P); t.query(P, out); assert.equal(out.inVoid, true);
  t.surfacePoint(180, 0, P); t.query(P, out); assert.equal(out.inVoid, false);
  const r = t.respawnAt(215); t.query(r.pos, out); assert.equal(out.inVoid, false, 'respawn skips the gap');
});
