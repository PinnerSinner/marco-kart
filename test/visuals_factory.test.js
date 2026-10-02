import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCharacterMesh, createKartMesh, createDriverKart, createItemMesh, createItemBoxMesh, EXPRESSIONS } from '../src/visuals/factory.js';
import { CHARACTERS, KARTS } from '../src/core/roster.js';
import { ITEM_IDS } from '../src/core/config.js';

function assertFiniteTree(root, label) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    assert.ok(Number.isFinite(o.position.x + o.position.y + o.position.z), `${label}: position NaN on ${o.name || o.type}`);
    assert.ok(Number.isFinite(o.scale.x + o.scale.y + o.scale.z), `${label}: scale NaN`);
    if (o.geometry?.attributes?.position) {
      const a = o.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) assert.fail(`${label}: NaN vertex in ${o.name || o.type}`);
      const n = o.geometry.attributes.normal?.array;
      if (n) for (let i = 0; i < n.length; i++) if (!Number.isFinite(n[i])) assert.fail(`${label}: NaN normal`);
    }
  });
}

test('every roster character builds with the documented API', () => {
  for (const c of CHARACTERS) {
    const g = createCharacterMesh(c.id);
    assert.ok(g instanceof THREE.Group, c.id);
    const u = g.userData;
    assert.ok(u.head instanceof THREE.Object3D, `${c.id} head`);
    for (const fn of ['setExpression', 'lookSteer', 'setPose']) assert.equal(typeof u[fn], 'function', `${c.id}.${fn}`);
    for (const e of EXPRESSIONS) u.setExpression(e);
    for (const p of ['drive', 'celebrate', 'defeat', 'spin', 'drive']) { u.setPose(p); for (let i = 0; i < 30; i++) u.lookSteer(Math.sin(i), 1 / 60); }
    assertFiniteTree(g, c.id);
    const box = new THREE.Box3().setFromObject(g, true);
    const h = box.max.y - box.min.y;
    assert.ok(h > 1.1 && h < 3.0, `${c.id} height ${h.toFixed(2)}`);
    // origin = hips: most of the body is above it
    assert.ok(box.max.y > 0.6, `${c.id} rises above the seat`);
    assert.ok(box.min.y > -1.2, `${c.id} does not sink far below the seat`);
    u.dispose();
  }
});

test('expression names are the documented five', () => {
  assert.deepEqual([...EXPRESSIONS].sort(), ['boost', 'happy', 'hit', 'neutral', 'sad']);
});

test('unknown character falls back to the first roster entry', () => {
  const g = createCharacterMesh('nobody');
  assert.equal(g.userData.charId, CHARACTERS[0].id);
});

test('kart meshes have the documented shape and animate without NaN', () => {
  for (const k of KARTS) {
    const kart = createKartMesh(k.id, 0x3366cc);
    assert.equal(kart.wheels.length, 4, k.id);
    assert.equal(kart.exhausts.length, 2, k.id);
    assert.ok(kart.seat instanceof THREE.Object3D);
    assert.ok(kart.body instanceof THREE.Mesh);
    assert.ok(kart.group instanceof THREE.Group);
    // [fl, fr, rl, rr]: fronts are steerable and ahead of the rears; left = +X
    assert.ok(kart.wheels[0].position.z > kart.wheels[2].position.z);
    assert.ok(kart.wheels[0].position.x > 0 && kart.wheels[1].position.x < 0);
    assert.ok(kart.wheels[0].userData.front && kart.wheels[1].userData.front && !kart.wheels[2].userData.front);
    const spin0 = kart.wheels[2].rotation.x;
    for (let i = 0; i < 120; i++) kart.animate(1 / 60, Math.sin(i / 10), 30);
    assert.notEqual(kart.wheels[2].rotation.x, spin0, `${k.id} rear wheels spin`);
    assert.ok(Math.abs(kart.wheels[0].rotation.y) <= 0.5, `${k.id} front steer bounded`);
    assertFiniteTree(kart.group, k.id);
    const box = new THREE.Box3().setFromObject(kart.group, true);
    const size = box.getSize(new THREE.Vector3());
    assert.ok(size.z > 2.4 && size.z < 5.2, `${k.id} length ${size.z.toFixed(2)}`);
    assert.ok(size.x > 1.4 && size.x < 3.4, `${k.id} width ${size.x.toFixed(2)}`);
    assert.ok(box.min.y > -0.05 && box.min.y < 0.1, `${k.id} sits on the ground (min y ${box.min.y.toFixed(3)})`);
  }
});

test('every character x kart combination assembles', () => {
  for (const c of CHARACTERS) for (const k of KARTS) {
    const dk = createDriverKart(c.id, k.id);
    assert.ok(dk.driver instanceof THREE.Group);
    assert.equal(dk.driver.parent, dk.seat);
    assert.equal(dk.wheels.length, 4);
    assert.equal(typeof dk.animate, 'function');
  }
});

test('kart geometry is cached and shared between instances of the same kart', () => {
  const a = createKartMesh('hauler', 0xff0000), b = createKartMesh('hauler', 0xff0000), c = createKartMesh('hauler', 0x00ff00);
  assert.equal(a.body.geometry, b.body.geometry);
  assert.notEqual(a.body.geometry, c.body.geometry);
  const d1 = createCharacterMesh('rex'), d2 = createCharacterMesh('rex');
  assert.equal(d1.userData.head.children[0]?.geometry ?? d1.userData.head.geometry, d2.userData.head.children[0]?.geometry ?? d2.userData.head.geometry);
});

test('every item has a world model and the item box works', () => {
  for (const id of [...ITEM_IDS, 'pod', 'bolt']) {
    const m = createItemMesh(id);
    assert.ok(m.children.length > 0, id);
    assert.equal(m.userData.itemId, id);
    for (let t = 0; t < 3; t += 0.1) m.userData.update(t);
    assertFiniteTree(m, id);
    const r = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    assert.ok(Math.max(r.x, r.y, r.z) > 0.4 && Math.max(r.x, r.y, r.z) <= 3, `${id} size ${r.toArray().map((v) => v.toFixed(2))}`);
  }
  const box = createItemBoxMesh();
  for (let t = 0; t < 3; t += 0.1) box.userData.update(t, Math.min(1, t));
  assertFiniteTree(box, 'item box');
  assert.ok(box.scale.x > 0);
  box.userData.update(1, 0);
  assert.ok(box.scale.x < 0.01, 'pop 0 hides the box');
});

test('unknown item id falls back safely', () => {
  assert.equal(createItemMesh('nope').userData.itemId, 'cable');
});
