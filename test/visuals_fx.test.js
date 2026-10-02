import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ParticlePool, makePreset, SHAPE } from '../src/fx/ParticlePool.js';
import { SkidMarks } from '../src/fx/SkidMarks.js';
import { RibbonTrail } from '../src/fx/RibbonTrail.js';
import { FX } from '../src/fx/presets.js';

test('ParticlePool never grows and recycles slots after 10k spawns', () => {
  const pool = new ParticlePool({ capacity: 512 });
  const lens = [pool.S.length, pool.aPos.array.length, pool.aCol.array.length, pool.aMisc.array.length, pool.aVel.array.length];
  const p = makePreset({ life: [0.4, 0.8], gravity: 9, shape: SHAPE.STREAK, stretch: 0.05, bounce: 0.3, jitter: 2 });
  for (let i = 0; i < 10000; i++) {
    pool.emit(p, i * 0.01, 1, 0, 1, 2, 3);
    if (i % 50 === 0) pool.update(1 / 60);
    assert.ok(pool.live <= 512);
  }
  assert.deepEqual([pool.S.length, pool.aPos.array.length, pool.aCol.array.length, pool.aMisc.array.length, pool.aVel.array.length], lens);
  assert.ok(pool.live > 0);
  assert.equal(pool.mesh.geometry.instanceCount, pool.live);
  for (let i = 0; i < 200; i++) pool.update(0.05);
  assert.equal(pool.live, 0, 'everything expires');
});

test('ParticlePool output is finite for every preset', () => {
  const pool = new ParticlePool({ capacity: 4096 });
  const all = [];
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') all.push(v); else if (typeof v === 'function') { all.push(v(0xff8800)); } };
  Object.values(FX).forEach((v) => (v && typeof v === 'object' && !('life0' in v) && !Array.isArray(v) ? Object.values(v).forEach(walk) : walk(v)));
  assert.ok(all.length >= 30);
  for (const p of all) pool.burst(p, 20, 0, 1, 0, 8, 0, 1, 0, 0.3, 0.2);
  for (let i = 0; i < 90; i++) pool.update(1 / 60);
  for (const arr of [pool.aPos.array, pool.aCol.array, pool.aMisc.array, pool.aVel.array]) for (let i = 0; i < pool.live * 3; i++) assert.ok(Number.isFinite(arr[i]));
});

test('ParticlePool density drops emissions', () => {
  const pool = new ParticlePool({ capacity: 4000 });
  pool.density = 0.25;
  const p = makePreset({});
  for (let i = 0; i < 2000; i++) pool.emit(p, 0, 0, 0);
  pool.update(0.01);
  assert.ok(pool.live > 250 && pool.live < 800, `live ${pool.live}`);
});

test('SkidMarks ring buffer wraps without NaN and strips join / split', () => {
  const s = new SkidMarks({ segments: 64, strips: 4 });
  for (let i = 0; i < 1000; i++) s.add(i % 2, i * 0.3, 0.02, 0, 0, 1, 0.2, 0.8);
  assert.ok(s.head >= 0 && s.head < 64);
  const P = s.aPos.array;
  for (let i = 0; i < P.length; i++) assert.ok(Number.isFinite(P[i]));
  const before = s.head;
  s.end(0); s.add(0, 5, 0, 5, 0, 1, 0.2, 1); // first point after end() starts a new strip: writes no quad
  assert.equal(s.head, before);
  s.add(0, 5.3, 0, 5, 0, 1, 0.2, 1);
  assert.equal(s.head, (before + 1) % 64);
  s.clear();
  assert.equal(s.head, 0);
});

test('RibbonTrail builds, fades and drains', () => {
  const t = new RibbonTrail({ points: 16, life: 0.4 });
  const cam = new THREE.Vector3(0, 5, -10);
  for (let i = 0; i < 100; i++) t.update(1 / 60, cam, i * 0.2, 1, i * 0.4, true, i * 0.01);
  assert.ok(t.on && t.mesh.visible);
  for (let i = 0; i < 60; i++) t.update(1 / 60, cam, 0, 0, 0, false);
  assert.equal(t.mesh.visible, false);
  for (const v of t.aPos.array) assert.ok(Number.isFinite(v));
});
