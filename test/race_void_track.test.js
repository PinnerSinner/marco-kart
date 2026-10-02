// The AI on a track with no walls and void edges (Marcoverse Speedway): it must aim squarely at the jump, keep away from the edge, and not litter the jump.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrack } from '../src/track/index.js';
import { getRacingLine } from '../src/race/RacingLine.js';
import { decideItem } from '../src/race/aiItems.js';
import { Race } from '../src/race/Race.js';
import { realKartFactory } from '../src/race/kartFactory.js';
import { KartPhysics } from '../src/kart/KartPhysics.js';
import { loopDiff } from '../src/core/util.js';
import { DT, makeEntries, recordEvents } from './race_helpers.js';

const mv = createTrack('marcoverse', { headless: true });
const line = getRacingLine(mv);

test('racing line: every jump ramp that lies on the road pins the line to the ramp centre, well before it and past the landing', () => {
  assert.equal(line.pins.length, 1, 'the Leap');
  const pin = line.pins[0], ramp = mv.jumpRamps[0];
  for (let d = -30; d <= ramp.length + 40; d += 3) {
    assert.ok(line.at(line.pinW, pin.s + d) > 0.999, `full pin at ${d} m from the ramp start`);
    assert.ok(Math.abs(line.at(line.off, pin.s + d) - pin.lateral) < 0.05, `line is on the ramp centre at ${d} m: ${line.at(line.off, pin.s + d)}`);
  }
  assert.ok(Math.abs(pin.lateral) < 0.5 && Math.abs(loopDiff(pin.s, mv.S(mv.def.ramps[0].s), mv.length)) < 3.1, `pin at s=${pin.s.toFixed(1)}`);
  assert.equal(line.at(line.pinW, pin.s - 120), 0, 'the pin fades in over the approach');
  assert.equal(line.at(line.pinW, pin.s + 200), 0, 'and out again');
  // it is a real "on the road" test: Copacabana's beach ramp lies off the road and must not pull the line
  const cop = getRacingLine(createTrack('copacabana', { headless: true }));
  assert.equal(cop.pins.length, 1, `Copacabana pins only its crest jump, not the beach shortcut ramp: ${JSON.stringify(cop.pins)}`);
});

test('racing line: where the road edge is a drop into the void the line keeps well clear of it; walled edges keep the old margin', () => {
  // where a fork's second road leaves or rejoins, the road edge beside it is level ground, not a drop: that stretch keeps the walled margin
  const forks = (mv.def.forks ?? []).map((f) => [mv.S(f.from), mv.S(f.to)]), beside = (s) => forks.some(([a, b]) => s >= a && s <= b);
  for (let s = 0; s < mv.length; s += 7) {
    if (beside(s) && line.at(line.margin, s) < 5.5) { assert.ok(line.at(line.margin, s) >= 3.6 - 1e-5, `walled margin at ${s}`); continue; }
    assert.ok(line.at(line.margin, s) >= 5.5, `void margin at ${s}`);
    assert.ok(line.maxOffset(s) <= line.at(line.half, s) - 5.5 + 1e-6, `maxOffset at ${s}`);
    assert.ok(line.at(line.room, s) <= line.at(line.half, s) - 4.4 + 1e-6, `dodge room at ${s}`);
  }
  for (let s = 0; s < mv.length; s += 11) assert.ok(Math.abs(line.at(line.off, s)) <= line.maxOffset(s) + 1e-3, `line inside the margin at ${s}`);
  // a walled track keeps the old margin, except on the few short stretches where the road really is bordered by a drop (Blighty's canal bridge)
  const bl = getRacingLine(createTrack('blighty', { headless: true }));
  let walled = 0, total = 0;
  for (let s = 0; s < bl.length; s += 3) { total++; const m = bl.at(bl.margin, s); assert.ok(m >= 3.6 - 1e-5 && m <= 5.6 + 1e-5, `margin ${m}`); if (Math.abs(m - 3.6) < 1e-5) { walled++; assert.ok(Math.abs(bl.at(bl.room, s) - (bl.at(bl.half, s) - 2.4)) < 1e-4); } }
  assert.ok(walled / total > 0.95, `${((100 * walled) / total).toFixed(1)} % of Blighty keeps the walled margin`);
});

test('AI items: nothing that spins a kart is dropped or fired around a jump; the same item is used freely elsewhere', () => {
  const pin = line.pins[0];
  const mk = (id, s, aheadS = null) => {
    const kart = { status: { spin: 0, respawning: 0 }, ground: { s }, speed: 30, maxSpeed: 33, grounded: true, boost: { time: 0 } };
    const other = (os) => ({ kart: { ground: { s: os } } });
    return { racer: { item: { id, count: 1 }, itemRoulette: null, finished: false, place: 3, kart }, race: { state: 'racing' }, line, heldBy: { [id]: 99 }, itemHeld: 99, itemHeldId: id, itemCooldown: 0, reaction: 0,
      aheadR: aheadS === null ? null : other(aheadS), aheadDp: aheadS === null ? Infinity : 20, aheadDLat: 0, behindR: other(s - 10), behindDp: 10, behindDLat: 0, aggression: 1, threat: false, racersAhead: 2 };
  };
  for (const id of ['cable', 'ping', 'traceroute', 'kernel_panic']) {
    const acts = () => ({ itemPressed: false, aimBack: false, aimForward: false });
    const near = acts(); decideItem(mk(id, pin.s - 30, pin.s - 10), 0.1, near);
    assert.equal(near.itemPressed, false, `${id} is held back on the run-up to the jump`);
    const onIt = acts(); decideItem(mk(id, pin.s + 5, pin.s + 30), 0.1, onIt);
    assert.equal(onIt.itemPressed, false, `${id} is held back on the ramp`);
    const far = acts(); decideItem(mk(id, 40, 60), 0.1, far);                     // on the start straight, well away from the Leap
    assert.equal(far.itemPressed, true, `${id} is used normally far from the jump`);
  }
});

test('AI solo on Marcoverse: each lap clears the Leap on the ramp centre at speed, no falls, lap time 70 to 100 s', () => {
  for (const charId of ['tilly', 'rex']) {
    const track = createTrack('marcoverse', { headless: true }); track.itemBoxes = [];
    const race = new Race({ track, entries: [{ id: charId, name: charId, charId, kartId: charId === 'tilly' ? 'buggy' : 'hauler', isPlayer: false }], laps: 2, seed: 4, kartFactory: realKartFactory, updateTrack: true });
    const ev = recordEvents(['kart:respawn', 'kart:fall'], race);
    const lipS = line.pins[0].lip; let crossings = 0, worstLat = 0, slowest = 99, prevS = null;
    for (let i = 0; i < 60 * 260 && race.state !== 'finished'; i++) {
      race.step(DT, null);
      const g = race.racers[0].kart.ground, s = g.s;
      if (prevS !== null && prevS < lipS && s >= lipS) { crossings++; worstLat = Math.max(worstLat, Math.abs(g.lateral)); slowest = Math.min(slowest, race.racers[0].kart.speed); }
      prevS = s;
    }
    ev.off();
    assert.equal(race.state, 'finished', `${charId} finished`);
    assert.equal(ev.log.length, 0, `${charId} fell ${ev.log.length} times`);
    assert.equal(crossings, 2, 'both laps take the jump');
    assert.ok(worstLat < 3, `${charId} crossed the lip ${worstLat.toFixed(1)} m off the centre`);
    assert.ok(slowest > 26, `${charId} hit the lip at ${slowest.toFixed(1)} m/s`);
    const laps = race.racers[0].lapTimes;
    assert.ok(laps.every((t) => t > 70 && t < 100), `${charId} laps ${laps.map((t) => t.toFixed(1))}`);
    race.dispose();
  }
});

test('Marcoverse field: 8 AIs on Professional take three laps with at most a couple of falls between them', () => {
  let falls = 0;
  for (const seed of [1, 2, 3]) {
    const race = new Race({ track: createTrack('marcoverse', { headless: true }), entries: makeEntries(8), laps: 3, difficulty: 'professional', seed, kartFactory: realKartFactory, updateTrack: true });
    const ev = recordEvents(['kart:respawn'], race);
    for (let i = 0; i < 60 * 400 && race.state !== 'finished'; i++) race.step(DT, null);
    ev.off(); falls += ev.log.length;
    assert.equal(race.state, 'finished'); assert.ok(race.results().every((r) => r.time != null), `seed ${seed}: everyone finished`);
    race.dispose();
  }
  assert.ok(falls <= 3, `${falls} respawns over three races`);
});

test('a kart respawned after a fall at the Leap gets a run-up and clears the gap', () => {
  const runs = (() => { const F = mv.model.F.gap, out = []; let a = -1; for (let i = 0; i <= F.length; i++) { const g = i < F.length && F[i]; if (g && a < 0) a = i; if (!g && a >= 0) { out.push([a * mv.model.ds, i * mv.model.ds]); a = -1; } } return out; })();
  const gap = runs[0], rampS = line.pins[0].s;
  const spot = mv.respawnAt(gap[0] - 2);                                   // what Race asks for after a kart fell from the ramp
  const kart = new KartPhysics(mv, { id: 'k', charId: 'marco', kartId: 'cruiser', stats: { speed: 3, accel: 3, handling: 3, weight: 3 } });
  kart.teleport(spot.pos, spot.heading);
  const q = { height: 0, normal: new THREE.Vector3(), surface: '', onRoad: false, s: 0, lateral: 0, inVoid: false };
  mv.query(kart.pos, q); assert.ok(loopDiff(q.s, rampS, mv.length) >= 60, `respawned ${loopDiff(q.s, rampS, mv.length).toFixed(0)} m before the ramp`);
  const tgt = new THREE.Vector3(); let landed = false;
  for (let i = 0; i < 60 * 12 && !kart._fallen; i++) {
    mv.query(kart.pos, q, q.s);
    mv.surfacePoint(q.s + 12, 0, tgt);
    let err = Math.atan2(tgt.x - kart.pos.x, tgt.z - kart.pos.z) - kart.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
    kart.update(DT, { throttle: 1, brake: 0, steer: Math.max(-1, Math.min(1, -err * 2.4)), drift: false });
    if (kart.grounded && loopDiff(gap[1], q.s, mv.length) > 8) { landed = true; break; }
  }
  assert.ok(!kart._fallen && landed, `fell=${kart._fallen} s=${q.s.toFixed(0)} gap ${gap.map((v) => v.toFixed(0))}`);
});
