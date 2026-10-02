import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MockRace, bus } from './visuals_mock.js';
import { RaceView } from '../src/visuals/RaceView.js';
import { applyEnvironment } from '../src/visuals/environment.js';
import { createPostFX } from '../src/visuals/postfx.js';
import { CFG } from '../src/core/config.js';

function setup(quality = 'high') {
  bus.clear();
  const race = new MockRace();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1500);
  const view = new RaceView({ scene, camera, race, track: race.track, quality });
  const p = race.player.kart.pos;
  camera.position.set(p.x - 6, p.y + 4, p.z - 8);
  return { race, scene, camera, view };
}

function drive(race, view, steps, alpha = 1) {
  for (let i = 0; i < steps; i++) { race.step(); view.snapshot(); view.update(CFG.fixedDt, alpha); }
}

test('RaceView creates a mesh per racer, positioned on the kart at alpha = 1', () => {
  const { race, view } = setup();
  drive(race, view, 120);
  assert.equal(view.karts.length, 8);
  for (const kv of view.karts) {
    const k = kv.kart;
    assert.ok(Math.abs(kv.root.position.x - k.pos.x) < 1e-4 && Math.abs(kv.root.position.z - k.pos.z) < 1e-4, kv.id);
    assert.ok(Number.isFinite(kv.root.quaternion.x + kv.root.quaternion.w));
  }
  view.dispose();
});

test('interpolation: alpha 0.5 sits halfway between the last two fixed steps, alpha 0 on the previous one', () => {
  const { race, view } = setup();
  drive(race, view, 60);
  const kv = view.getKartView(race.player.id);
  race.step(); view.snapshot();
  const a = { x: kv.prev.x, z: kv.prev.z }, b = { x: kv.cur.x, z: kv.cur.z };
  assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 0.05);
  view.update(1 / 60, 0.5);
  assert.ok(Math.abs(kv.root.position.x - (a.x + b.x) / 2) < 1e-4);
  assert.ok(Math.abs(kv.root.position.z - (a.z + b.z) / 2) < 1e-4);
  view.update(1 / 60, 0);
  assert.ok(Math.abs(kv.root.position.x - a.x) < 1e-4);
  view.dispose();
});

test('auto-capture works when the host never calls snapshot()', () => {
  const { race, view } = setup();
  for (let i = 0; i < 120; i++) { race.step(); view.update(CFG.fixedDt, 1); }
  const kv = view.getKartView(race.player.id);
  assert.ok(Math.abs(kv.root.position.x - kv.kart.pos.x) < 1e-3);
  view.dispose();
});

test('teleports (respawn / grid) do not interpolate across the jump', () => {
  const { race, view } = setup();
  drive(race, view, 30);
  const k = race.player.kart;
  k.pos.set(k.pos.x + 200, 0, k.pos.z + 50);
  view.snapshot();
  view.update(1 / 60, 0);
  const kv = view.getKartView(race.player.id);
  assert.ok(Math.abs(kv.root.position.x - k.pos.x) < 1e-3, 'alpha 0 after a teleport must already be at the new spot');
  view.dispose();
});

test('every bus event in the catalogue is handled without throwing, including unknown ids', () => {
  const { race, view } = setup();
  drive(race, view, 30);
  const id = race.player.id, other = race.racers[3].id;
  const events = [
    ['race:countdown', { n: 3 }], ['race:start', {}], ['race:lap', { id, lap: 2, laps: 3, time: 40, isPlayer: true, final: true }],
    ['race:finish', { id, place: 1, time: 100, isPlayer: true }], ['race:over', { results: [] }], ['race:overtake', { id, passedId: other, place: 2, isPlayer: true }],
    ['race:wrong-way', { on: true }], ['race:final-lap', {}],
    ['kart:drift-start', { id, dir: 1 }], ['kart:drift-level', { id, level: 3 }], ['kart:boost', { id, kind: 'drift', power: 1, duration: 1 }],
    ['kart:boost', { id, kind: 'start', power: 1, duration: 1 }], ['kart:boost', { id, kind: 'fibre', power: 1.6, duration: 4 }], ['kart:boost', { id, kind: 'pad', power: 1, duration: 1 }],
    ['kart:wall-hit', { id, impact: 0.8 }], ['kart:bump', { id, otherId: other, impact: 0.5 }], ['kart:land', { id, impact: 12 }], ['kart:surface', { id, surface: 'water' }],
    ['kart:surface', { id, surface: 'grass' }], ['kart:spin', { id, cause: 'hit' }], ['kart:shrink', { id, seconds: 6 }], ['kart:fall', { id }], ['kart:respawn', { id }],
    ['item:box', { id, index: 0 }], ['item:box', { id, index: 9999 }], ['item:roulette', { id, shown: 'ping', done: false }], ['item:get', { id, item: 'ping' }],
    ...['cable', 'ping', 'traceroute', 'espresso', 'sudo', 'firewall', 'fibre', 'outage', 'kernel_panic'].flatMap((item) => [['item:use', { id, item }], ['item:hit', { victimId: other, byId: id, item }], ['item:block', { id: other, item }]]),
    ['item:expire', { entityId: 5 }], ['kart:drift-start', { id: 'ghost', dir: -1 }], ['item:hit', { victimId: 'ghost', byId: 'x', item: 'ping' }],
  ];
  for (const [name, data] of events) { bus.emit(name, data); view.update(1 / 60, 1); }
  drive(race, view, 200);
  assert.ok(view.add.live <= view.add.capacity && view.norm.live <= view.norm.capacity);
  for (const kv of view.karts) assert.ok(Number.isFinite(kv.root.position.y + kv.lean.scale.x + kv.lean.rotation.y), kv.id);
  view.dispose();
});

test('world items: pooled meshes are reused across spawn / despawn churn', () => {
  const { race, view, scene } = setup();
  drive(race, view, 5);
  const types = ['cable', 'ping', 'traceroute', 'kernel_panic'];
  for (let round = 0; round < 60; round++) {
    const ents = race.items.entities;
    ents.length = 0;
    for (let i = 0; i < 6; i++) race.addEntity(types[(round + i) % 4], race.player.kart.pos.clone().add(new THREE.Vector3(i * 3, 0.8, 10 + i * 4)), new THREE.Vector3(0, 0, 20));
    drive(race, view, 3);
  }
  let meshes = 0;
  view.root.traverse((o) => { if (o.name?.startsWith('item-') && o.name !== 'item-box') meshes++; });
  assert.ok(meshes <= 24, `item meshes should be pooled, found ${meshes}`);
  race.items.entities.length = 0;
  drive(race, view, 3);
  assert.equal(view._items.size, 0);
  view.dispose();
  assert.equal(scene.children.includes(view.root), false);
});

test('item boxes: popping out on pickup and back in after respawn', () => {
  const { race, view } = setup();
  drive(race, view, 5);
  assert.equal(view.boxGlass.count, race.itemBoxes.length > 0 && race.itemBoxes.length <= 64 ? view.boxGlass.count : 0);
  const before = view.boxGlass.count;
  assert.ok(before > 0);
  race.itemBoxes[0].active = false;
  bus.emit('item:box', { id: 'marco', index: 0 });
  drive(race, view, 40);
  assert.equal(view.boxGlass.count, before - 1, 'picked box disappears');
  race.itemBoxes[0].active = true;
  drive(race, view, 5);
  assert.equal(view.boxGlass.count, before, 'respawned box pops back in');
  view.dispose();
});

test('setQuality switches emission density and skid marks', () => {
  const { race, view } = setup('high');
  view.setQuality('low');
  assert.ok(view.add.density < 0.5 && view.skid.enabled === false);
  view.setQuality('high');
  assert.equal(view.add.density, 1);
  assert.equal(view.skid.enabled, true);
  view.dispose();
});

test('environment + postfx handles work for every sky kind (stub renderer)', () => {
  const renderer = { shadowMap: { enabled: false }, toneMapping: 0, toneMappingExposure: 1, outputColorSpace: '', render() { this.calls = (this.calls ?? 0) + 1; } };
  const scene = new THREE.Scene();
  for (const skyKind of ['day', 'overcast', 'dusk', 'indoor', 'space']) {
    const env = applyEnvironment(scene, renderer, { skyTop: 0x2244ff, skyBottom: 0xaaccff, fogColor: 0xaaccff, fogNear: 100, fogFar: 500, sunDir: new THREE.Vector3(1, 1, 0).normalize(), sunColor: 0xffffff, sunIntensity: 2, ambientColor: 0x8899ff, ambientIntensity: 1, skyKind, rain: skyKind === 'overcast' ? 0.8 : 0, clouds: 0.5, stars: skyKind === 'space' }, 'high');
    const cam = new THREE.Vector3(10, 5, 20);
    for (let i = 0; i < 30; i++) env.update(1 / 60, cam, new THREE.Vector3(i, 0, 0));
    assert.ok(Number.isFinite(env.sun.position.x + env.sun.position.y) && Number.isFinite(env.dome.position.x));
    env.setQuality('low');
    env.dispose();
    assert.equal(scene.getObjectByName('environment'), undefined);
  }
  const cam = new THREE.PerspectiveCamera();
  const post = createPostFX(renderer, scene, cam, 'low');
  post.setBoost(1); post.setSpeedLines(1); post.setSize(800, 600); post.render(0.016);
  assert.equal(renderer.calls, 1, 'low quality renders directly');
  assert.equal(post.active, false);
  post.dispose();
});
