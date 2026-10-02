// Fuzz + determinism: random inputs and random status events must never produce NaN or runaway state,
// and identical inputs must give bit-identical results.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StubTrack } from '../src/track/StubTrack.js';
import { KartPhysics, resolveKartCollisions } from '../src/kart/KartPhysics.js';
import { bus } from '../src/core/bus.js';
import { makeRng } from '../src/core/util.js';
import { statsFor, CHARACTERS, KARTS } from '../src/core/roster.js';
import { FlatTrack, HillTrack, EdgeVoidTrack } from './drive_tracks.js';

const DT = 1 / 60;

/** Random "human-ish" input generator: holds each choice for 5..70 steps; occasionally wild. */
function makeInputs(rng) {
  const inp = { throttle: 0, brake: 0, steer: 0, drift: false };
  let hold = 0;
  return () => {
    if (--hold <= 0) {
      hold = rng.int(5, 70);
      const r = rng();
      inp.throttle = r < 0.7 ? 1 : r < 0.8 ? rng() : 0;
      inp.brake = r > 0.93 ? 1 : r > 0.9 ? rng() : 0;
      inp.steer = rng() < 0.3 ? 0 : rng.range(-1, 1);
      inp.drift = rng() < 0.35;
      if (rng() < 0.03) { inp.throttle = NaN; inp.steer = Infinity; }        // hostile input must be tolerated
      if (rng() < 0.02) { inp.steer = 5; inp.throttle = 7; inp.brake = -3; }  // out-of-range input
    }
    return inp;
  };
}

function poke(k, track, rng, i) {
  const r = rng();
  if (r < 0.0008) k.spinOut(rng.range(0.3, 2), 'fuzz');
  else if (r < 0.0016) k.applyBoost(rng.range(0.5, 2), rng.range(0.2, 3), 'item');
  else if (r < 0.0020) k.shrink(rng.range(1, 7));
  else if (r < 0.0024) k.launch(rng.range(-5, 25));
  else if (r < 0.0027) k.setInvincible(rng.range(0, 3));
  else if (r < 0.0030) { const g = track.respawnAt ? track.respawnAt(rng.range(0, track.length)) : { pos: new THREE.Vector3(0, 0, 0), heading: 0 }; k.teleport(g.pos, g.heading); }
  void i;
}

function finiteKart(k, label) {
  for (const v of [k.pos.x, k.pos.y, k.pos.z, k.vel.x, k.vel.y, k.vel.z, k.yaw, k.pitch, k.roll, k.speed, k.steer, k.slip, k.maxSpeed, k.radius, k.scale, k.airTime, k.drift.charge, k.boost.time, k.status.spin, k.status.stun]) {
    if (!Number.isFinite(v)) assert.fail(`${label}: non-finite state ${JSON.stringify({ pos: k.pos, vel: k.vel, yaw: k.yaw, speed: k.speed })}`);
  }
}

test('fuzz: 200k random-input steps on the stub oval (walls): no NaN, bounded position, bounded speed', () => {
  const t = new StubTrack();
  const rng = makeRng(1234), next = makeInputs(rng);
  const k = new KartPhysics(t, { id: 'fz', stats: { speed: 5, accel: 5, handling: 1, weight: 5 } });
  const g = t.gridSlot(0); k.teleport(g.pos, g.heading);
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  let maxSpeed = 0, maxAbs = 0, minY = 0, maxY = 0;
  try {
    for (let i = 0; i < 200000; i++) {
      poke(k, t, rng, i);
      k.update(DT, next());
      if (i % 97 === 0) finiteKart(k, `step ${i}`);
      maxSpeed = Math.max(maxSpeed, Math.abs(k.speed)); maxAbs = Math.max(maxAbs, Math.abs(k.pos.x), Math.abs(k.pos.z));
      minY = Math.min(minY, k.pos.y); maxY = Math.max(maxY, k.pos.y);
    }
  } finally { console.warn = warn; }
  finiteKart(k, 'end');
  assert.equal(warned, 0, 'no NaN recovery was needed');
  assert.ok(maxAbs < 200, `stayed inside the walls (max |coord| ${maxAbs.toFixed(1)})`);
  assert.ok(maxSpeed < 60, `speed bounded (${maxSpeed.toFixed(1)})`);
  assert.ok(minY > -1 && maxY < 30, `vertical bounded (${minY.toFixed(1)}..${maxY.toFixed(1)})`);
});

test('fuzz: 8 karts with collisions on a hilly stub track, random inputs, 60k steps', () => {
  const t = new HillTrack({ straight: 300 });
  const rng = makeRng(99);
  const karts = Array.from({ length: 8 }, (_, i) => {
    const c = CHARACTERS[i % CHARACTERS.length], kt = KARTS[i % KARTS.length];
    const k = new KartPhysics(t, { id: `k${i}`, charId: c.id, kartId: kt.id, stats: statsFor(c.id, kt.id) });
    const g = t.gridSlot(i); k.teleport(g.pos, g.heading); return k;
  });
  const inputs = karts.map(() => makeInputs(rng));
  for (let i = 0; i < 60000; i++) {
    for (let j = 0; j < karts.length; j++) { poke(karts[j], t, rng, i); karts[j].update(DT, inputs[j]()); }
    resolveKartCollisions(karts);
    if (i % 101 === 0) karts.forEach((k, j) => finiteKart(k, `kart ${j} step ${i}`));
  }
  karts.forEach((k, j) => { finiteKart(k, `end ${j}`); assert.ok(Math.abs(k.pos.x) < 300 && Math.abs(k.pos.z) < 400 && k.pos.y < 40, `kart ${j} bounded`); });
});

test('fuzz: void track (no walls) and flat track stay finite; falling is bounded', () => {
  for (const [name, t] of [['void', new EdgeVoidTrack()], ['flat', new FlatTrack()]]) {
    const rng = makeRng(7), next = makeInputs(rng);
    const k = new KartPhysics(t, { id: name });
    k.teleport(t.sample ? t.sample(0).pos : new THREE.Vector3(), 0);
    let falls = 0; const off = bus.on('kart:fall', () => { falls++; });
    for (let i = 0; i < 60000; i++) {
      poke(k, t, rng, i);
      k.update(DT, next());
      if (i % 89 === 0) finiteKart(k, `${name} step ${i}`);
      if (k.pos.y < -100 && i % 300 === 0) { const g = t.respawnAt ? t.respawnAt(rng.range(0, t.length)) : { pos: new THREE.Vector3(), heading: 0 }; k.teleport(g.pos, g.heading); }
    }
    off();
    assert.ok(k.pos.y >= -2000.001, `${name} y bounded`);
    if (name === 'flat') assert.equal(falls, 0);
  }
});

test('non-finite state is recovered instead of propagated', () => {
  const t = new StubTrack();
  const k = new KartPhysics(t, {});
  const g = t.gridSlot(0); k.teleport(g.pos, g.heading);
  for (let i = 0; i < 120; i++) k.update(DT, { throttle: 1 });
  k.vel.x = NaN; k.yaw = NaN;
  const warn = console.warn; console.warn = () => {};
  try { k.update(DT, { throttle: 1 }); } finally { console.warn = warn; }
  finiteKart(k, 'recovered');
  for (let i = 0; i < 120; i++) k.update(DT, { throttle: 1 });
  assert.ok(k.speed > 5);
});

function scenario(seed) {
  const t = new StubTrack({ radius: 40, straight: 150 });
  const rng = makeRng(seed);
  const karts = Array.from({ length: 4 }, (_, i) => { const k = new KartPhysics(t, { id: `d${i}`, stats: { speed: 1 + i, accel: 5 - i, handling: 3, weight: 1 + i } }); const g = t.gridSlot(i); k.teleport(g.pos, g.heading); return k; });
  const inputs = karts.map(() => makeInputs(rng));
  const events = [];
  const offs = ['kart:drift-start', 'kart:drift-level', 'kart:boost', 'kart:wall-hit', 'kart:bump', 'kart:land', 'kart:surface', 'kart:spin', 'kart:fall'].map((n) => bus.on(n, (d) => events.push(`${n}:${JSON.stringify(d)}`)));
  let checksum = 0;
  for (let i = 0; i < 40000; i++) {
    for (let j = 0; j < 4; j++) { poke(karts[j], t, rng, i); karts[j].update(DT, inputs[j]()); }
    resolveKartCollisions(karts);
    if (i % 50 === 0) for (const k of karts) checksum = (checksum * 31 + k.pos.x * 1000 + k.pos.z * 777 + k.yaw * 13 + k.speed * 7 + k.drift.charge * 3) % 1e9;
  }
  offs.forEach((f) => f());
  return { checksum, events, state: karts.map((k) => [k.pos.x, k.pos.y, k.pos.z, k.vel.x, k.vel.z, k.yaw, k.speed, k.drift.charge, k.boost.time]) };
}

test('determinism: the same inputs give bit-identical states and identical event streams', () => {
  const a = scenario(2024), b = scenario(2024), c = scenario(2025);
  assert.deepEqual(a.state, b.state);
  assert.equal(a.checksum, b.checksum);
  assert.deepEqual(a.events, b.events);
  assert.ok(a.events.length > 50, 'scenario is eventful');
  assert.notEqual(a.checksum, c.checksum, 'different seeds differ');
});
