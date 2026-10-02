import test from 'node:test';
import assert from 'node:assert/strict';
import { CFG, GP_POINTS } from '../src/core/config.js';
import { loopDiff } from '../src/core/util.js';
import { StubTrack, DT, makeRace, runUntil, skipCountdown, recordEvents, place, humanBot, freezeOthers, allFinite, bus } from './race_helpers.js';
import { simpleKartFactory } from '../src/race/kartFactory.js';

test('countdown: 3-2-1-0 events, then race:start, state flips at GO', () => {
  const race = makeRace({ human: 'marco' });
  const ev = recordEvents(['race:countdown', 'race:start'], race);
  assert.equal(race.state, 'countdown');
  assert.equal(race.countdown, CFG.countdownSeconds);
  race.step(DT, null);
  assert.equal(race.state, 'countdown');
  assert.ok(race.countdown < 3 && race.countdown > 2.9);
  runUntil(race, (r) => r.state === 'racing', 10);
  ev.off();
  assert.deepEqual(ev.log.map((e) => e.name + (e.data.n ?? '')), ['race:countdown3', 'race:countdown2', 'race:countdown1', 'race:countdown0', 'race:start']);
  assert.equal(race.time, 0, 'time stays 0 until GO');
  assert.equal(race.countdown, 0);
  const t0 = race.time;
  race.step(DT, null);
  assert.ok(race.time > t0);
});

test('countdown: karts do not move before GO, even with full throttle', () => {
  const race = makeRace({ human: 'marco' });
  const start = race.racers.map((r) => r.kart.pos.clone());
  for (let i = 0; i < 60 * 2.5; i++) race.step(DT, { throttle: 1, brake: 0, steer: 0, drift: false });
  race.racers.forEach((r, i) => assert.ok(r.kart.pos.distanceTo(start[i]) < 0.05, `${r.id} crept`));
  assert.equal(race.state, 'countdown');
});

test('rocket start: throttle pressed inside the last 0.6 s gives a start boost, holding from the beginning does not', () => {
  const boosts = (pressAt) => {
    const race = makeRace({ human: 'marco', n: 2 });
    freezeOthers(race, race.player);
    const ev = recordEvents(['kart:boost'], race);
    let step = 0;
    while (race.state === 'countdown') {
      const thr = race.countdown <= pressAt ? 1 : 0;
      race.step(DT, { throttle: thr, brake: 0, steer: 0, drift: false }); step++;
    }
    ev.off();
    return ev.log.filter((e) => e.data.id === 'marco' && e.data.kind === 'start');
  };
  const good = boosts(0.45);
  assert.equal(good.length, 1);
  assert.equal(good[0].data.duration, 1.0);
  assert.equal(boosts(0.0).length, 0, 'pressing only at GO is too late');
  assert.equal(boosts(2.0).length, 0, 'pressing too early is not a rocket start');
});

test('lap events: ordered gates, sub-step timing, final-lap and finish, race:over with results', () => {
  const race = makeRace({ human: 'marco', n: 3, laps: 2 });
  freezeOthers(race, race.player);
  const ev = recordEvents(['race:lap', 'race:final-lap', 'race:finish', 'race:over'], race);
  runUntil(race, (r) => r.state === 'finished', 200, () => humanBot(race));
  ev.off();
  const names = ev.log.map((e) => e.name);
  assert.deepEqual(names.slice(0, 4), ['race:lap', 'race:final-lap', 'race:lap', 'race:finish']);
  assert.equal(names[names.length - 1], 'race:over');
  const laps = ev.of('race:lap');
  assert.equal(laps[0].data.lap, 1); assert.equal(laps[0].data.final, false); assert.equal(laps[0].data.isPlayer, true);
  assert.equal(laps[1].data.lap, 2); assert.equal(laps[1].data.final, true); assert.equal(laps[1].data.laps, 2);
  const p = race.player;
  assert.equal(p.lapTimes.length, 2);
  assert.ok(Math.abs(p.lapTimes[0] + p.lapTimes[1] - p.finishTime) < 1e-6, 'lap times add up to the finish time');
  assert.equal(p.bestLap, Math.min(...p.lapTimes));
  const fin = ev.of('race:finish')[0].data;
  assert.equal(fin.place, 1); assert.equal(fin.isPlayer, true); assert.equal(fin.time, p.finishTime);
  assert.ok(ev.of('race:over')[0].data.results.length === 3);
});

test('anti-cheat: driving straight across the infield does not count a lap', () => {
  const race = makeRace({ human: 'marco', n: 1, laps: 3 });
  const p = race.player, k = p.kart;
  skipCountdown(race);
  const ev = recordEvents(['race:lap'], race);
  place(race, p, 30, 0);
  // Drive the oval "the wrong way round the middle": across the infield to the far straight, then along the road to the line.
  const target = race.track.sample(race.track.length * 0.75).pos;
  let steps = 0;
  while (steps++ < 60 * 40 && p.g < race.tracker.N) {
    const to = steps < 60 * 12 ? target : race.track.sample(k.ground.s + 25).pos;
    let err = Math.atan2(to.x - k.pos.x, to.z - k.pos.z) - k.yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    race.step(DT, { throttle: 1, brake: 0, steer: Math.max(-1, Math.min(1, -err * 2.5)), drift: false });
  }
  ev.off();
  assert.equal(ev.of('race:lap').length, 0, 'no lap may be credited');
  assert.ok(p.lapTimes.length === 0);
});

test('anti-cheat: reversing back over the line then forwards again does not double count', () => {
  const race = makeRace({ human: 'marco', n: 1, laps: 3 });
  const p = race.player, k = p.kart, N = race.tracker.N, L = race.track.length;
  skipCountdown(race);
  const ev = recordEvents(['race:lap'], race);
  const fwd = () => ({ throttle: 1, brake: 0, steer: 0, drift: false });
  place(race, p, L - 4, 0);
  p.g = N - 1; p.maxG = N - 1;                           // every gate of lap 1 passed, the line is next
  runUntil(race, () => p.g >= N, 5, fwd);
  assert.equal(ev.of('race:lap').length, 1);
  // turn round and drive backwards over the line ...
  k.vel.set(0, 0, 0); k.speed = 0; k.yaw += Math.PI;
  runUntil(race, () => p.g < N, 5, fwd);
  assert.equal(p.g, N - 1, 'crossing backwards un-passes the gate');
  // ... and forwards again
  k.vel.set(0, 0, 0); k.speed = 0; k.yaw += Math.PI;
  runUntil(race, () => p.g >= N, 5, fwd);
  assert.equal(p.g, N);
  assert.equal(ev.of('race:lap').length, 1, 'the same line crossing must not count twice');
  ev.off();
});

test('ranking: finished racers ahead ordered by finish time, unfinished by progress, places are a permutation', () => {
  const race = makeRace({ human: 'marco', laps: 2, seed: 4 });
  const seen = [];
  for (let i = 0; i < 60 * 200 && race.state !== 'finished'; i++) {
    race.step(DT, humanBot(race));
    if (i % 30 !== 0 || race.state !== 'racing') continue;
    const places = race.racers.map((r) => r.place).sort((a, b) => a - b);
    assert.deepEqual(places, race.racers.map((_, k) => k + 1));
    const ord = race.order;
    for (let k = 1; k < ord.length; k++) {
      const a = ord[k - 1], b = ord[k];
      if (a.finished && b.finished) assert.ok(a.finishOrder < b.finishOrder);
      else if (!a.finished) assert.ok(!b.finished && b.progress <= a.progress + 0.8, 'progress order (within hysteresis)');
      else assert.ok(!b.finished);
    }
    seen.push(race.getHud().place);
  }
  assert.ok(seen.length > 5);
  const res = race.results();
  assert.deepEqual(res.map((r) => r.place), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(res.map((r) => r.points), GP_POINTS);
  const times = res.filter((r) => r.time != null).map((r) => r.time);
  assert.deepEqual(times, [...times].sort((a, b) => a - b), 'finishers listed by finish time');
});

test('finish handling: after the human finishes the rest race on, unfinished racers are auto-placed by progress after 25 s', () => {
  const race = makeRace({ human: 'marco', laps: 2, seed: 2 });
  // slow everybody else right down so they cannot finish within the timeout
  for (const r of race.racers) if (!r.isPlayer) { r.ai = null; r.control = (rr, dt, inp) => { inp.throttle = 0.12; inp.brake = 0; inp.steer = 0; inp.drift = false; }; }
  const ev = recordEvents(['race:finish', 'race:over'], race);
  runUntil(race, (r) => r.player.finished, 200, () => humanBot(race));
  const tFinish = race.time;
  assert.equal(race.state, 'racing', 'race continues after the human finishes');
  runUntil(race, (r) => r.state === 'finished', 60, () => humanBot(race));
  ev.off();
  assert.equal(race.state, 'finished');
  assert.ok(race.time - tFinish >= 24.9 && race.time - tFinish < 26, `timeout was ${race.time - tFinish}`);
  const res = race.results();
  assert.equal(res[0].isPlayer, true);
  assert.equal(res.filter((r) => r.time === null).length, 7, 'the rest have no finish time');
  assert.equal(ev.of('race:over').length, 1);
});

test('wrong way: reversing along the track for > 1.5 s raises the flag, driving on clears it; no other events', () => {
  const race = makeRace({ human: 'marco', n: 1 });
  const p = race.player;
  skipCountdown(race);
  place(race, p, 200, 0);
  p.kart.yaw += Math.PI;                     // face backwards
  const ev = recordEvents(['race:wrong-way'], race);
  runUntil(race, (r) => r.wrongWay, 8, () => ({ throttle: 1, brake: 0, steer: 0, drift: false }));
  assert.equal(race.wrongWay, true);
  assert.equal(race.getHud().wrongWay, true);
  assert.ok(race.time > 1.4, 'not before 1.5 s of driving the wrong way');
  runUntil(race, () => !race.wrongWay, 12, () => {
    const to = race.track.sample(p.kart.ground.s + 20).pos;
    let err = Math.atan2(to.x - p.kart.pos.x, to.z - p.kart.pos.z) - p.kart.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
    return { throttle: 1, brake: 0, steer: Math.max(-1, Math.min(1, -err * 2.5)), drift: false };
  });
  ev.off();
  assert.deepEqual(ev.log.map((e) => e.data.on), [true, false]);
});

test('respawn: falling below killY, being stuck and flipping put the kart back on the road, invincible, with kart:respawn', () => {
  const race = makeRace({ human: 'marco', n: 2 });
  freezeOthers(race, race.player);
  skipCountdown(race);
  const p = race.player;
  const ev = recordEvents(['kart:respawn'], race);
  place(race, p, 300, 0);
  runUntil(race, () => race.time > 1, 3, () => humanBot(race));
  const s0 = p.kart.ground.s;
  p.kart.pos.y = race.killY - 5;             // fell out of the world
  race.step(DT, humanBot(race));
  assert.equal(ev.of('kart:respawn').length, 1);
  assert.ok(Math.abs(loopDiff(s0, p.kart.ground.s, race.track.length)) < 30, 'respawned close to where it fell');
  assert.ok(p.kart.status.invincible > 1.0);
  assert.ok(p.kart.pos.y > -1);
  // stuck: full throttle into nothing (pinned against a wall by zero speed): emulate with a kart that cannot move
  p.kart.update = (dt) => { p.kart.status.respawning = Math.max(0, p.kart.status.respawning - dt); };
  runUntil(race, () => ev.of('kart:respawn').length >= 2, 8, () => ({ throttle: 1, brake: 0, steer: 0, drift: false }));
  assert.equal(ev.of('kart:respawn').length, 2, 'stuck > 5 s respawns');
  ev.off();
});

test('item boxes: pickup deactivates the box, starts a roulette that ends with an item, box respawns after CFG.itemBox.respawn', () => {
  const race = makeRace({ human: 'marco', n: 2, seed: 9 });
  freezeOthers(race, race.player);
  skipCountdown(race);
  const p = race.player;
  const ev = recordEvents(['item:box', 'item:roulette', 'item:get'], race);
  const box = race.itemBoxes[4];
  const sm = race.track.query(box.pos, {});
  place(race, p, sm.s - 12, sm.lateral);
  const go = () => ({ throttle: 1, brake: 0, steer: 0, drift: false });
  runUntil(race, () => !box.active, 4, go);
  assert.equal(box.active, false);
  assert.equal(ev.of('item:box')[0].data.index, 4);
  assert.ok(p.itemRoulette && p.itemRoulette.active);
  assert.equal(race.getHud().roulette.active, true);
  const t0 = race.time;
  runUntil(race, () => !p.itemRoulette, 3, go);
  assert.ok(Math.abs(race.time - t0 - 1.4) < 0.1, 'roulette lasts 1.4 s');
  assert.ok(p.item && p.item.count >= 1);
  const rl = ev.of('item:roulette');
  assert.ok(rl.length >= 5, 'several ticks');
  assert.equal(rl[rl.length - 1].data.done, true);
  assert.equal(rl[rl.length - 1].data.shown, p.item.id);
  assert.equal(ev.of('item:get')[0].data.item, p.item.id);
  const t1 = race.time;
  runUntil(race, () => box.active, 10, go);
  assert.ok(Math.abs(race.time - t1 - (CFG.itemBox.respawn - 1.4 - (t1 - t0 - 1.4))) < 3, 'box comes back');
  assert.equal(box.active, true);
  ev.off();
});

test('obstacles: overlapping an active obstacle spins the kart once per cooldown; inactive ones do nothing', () => {
  const track = new StubTrack();
  const sm = track.sample(400);
  const o = { id: 'bus1', kind: 'bus', pos: sm.pos.clone(), radius: 3, active: true, hit: 'spin' };
  track.obstacles = [o];
  const race = makeRace({ human: 'marco', n: 2, track });
  freezeOthers(race, race.player);
  const p = race.player;
  skipCountdown(race);
  const ev = recordEvents(['kart:spin', 'kart:bump'], race);
  place(race, p, 380, 0);
  runUntil(race, () => ev.of('kart:spin').length > 0, 4, () => ({ throttle: 1, brake: 0, steer: 0, drift: false }));
  assert.equal(ev.of('kart:spin')[0].data.cause, 'obstacle');
  const n = ev.of('kart:spin').length;
  assert.equal(n, 1);
  // inactive obstacles do nothing
  o.active = false; place(race, p, 380, 0);
  runUntil(race, () => race.time > 8, 8, () => ({ throttle: 1, brake: 0, steer: 0, drift: false }));
  assert.equal(ev.of('kart:spin').length, 1);
  ev.off();
});

test('obstacles: a bump obstacle takes speed and pushes aside instead of spinning', () => {
  const track = new StubTrack();
  const sm = track.sample(400);
  track.obstacles = [{ id: 'cone', kind: 'cone', pos: sm.pos.clone(), radius: 1.5, active: true, hit: 'bump' }];
  const race = makeRace({ human: 'marco', n: 2, track });
  freezeOthers(race, race.player);
  skipCountdown(race);
  const p = race.player;
  const ev = recordEvents(['kart:spin', 'kart:bump'], race);
  place(race, p, 370, 0);
  let vBefore = 0;
  runUntil(race, () => { if (ev.of('kart:bump').length === 0) vBefore = p.kart.speed; return ev.of('kart:bump').length > 0; }, 4, () => ({ throttle: 1, brake: 0, steer: 0, drift: false }));
  ev.off();
  assert.equal(ev.of('kart:spin').length, 0);
  assert.equal(ev.of('kart:bump')[0].data.otherId, 'cone');
  assert.ok(p.kart.speed < vBefore * 0.8, `speed ${p.kart.speed} vs ${vBefore}`);
});

test('HudSnapshot has the exact SPEC shape and the same object is reused', () => {
  const race = makeRace({ human: 'marco', seed: 3 });
  const h1 = race.getHud();
  const keys = ['state', 'countdown', 'time', 'place', 'racers', 'lap', 'laps', 'lapTimes', 'bestLap', 'speedKmh', 'boost', 'drift', 'item', 'item2', 'roulette', 'swapLocked', 'boxRefused', 'shield', 'wrongWay', 'finished', 'finishTime', 'finalLap', 'standings', 'minimap', 'itemFx', 'smear', 'speedClass', 'speedClassName', 'speedClassTag', 'speedC'];   // + the game speed class (Mbps) of this race
  assert.deepEqual(Object.keys(h1).sort(), [...keys].sort());
  assert.deepEqual(Object.keys(h1.boost).sort(), ['power', 'time']);
  assert.deepEqual(Object.keys(h1.drift).sort(), ['active', 'charge', 'level']);
  assert.deepEqual(Object.keys(h1.minimap).sort(), ['karts', 'outline']);
  assert.ok(h1.minimap.outline.length >= 32 && h1.minimap.outline[0].length === 2);
  runUntil(race, (r) => r.time > 6, 20, () => humanBot(race));
  const h2 = race.getHud();
  assert.equal(h1, h2, 'same object');
  assert.equal(h2.state, 'racing');
  assert.equal(h2.racers, 8);
  assert.equal(h2.standings.length, 8);
  assert.deepEqual(Object.keys(h2.standings[0]).sort(), ['charId', 'finished', 'id', 'isPlayer', 'lap', 'name', 'place']);
  assert.deepEqual(Object.keys(h2.minimap.karts[0]).sort(), ['colour', 'id', 'isPlayer', 'place', 'x', 'z']);
  assert.ok(h2.speedKmh > 20);
  assert.equal(h2.speedKmh, Math.abs(race.player.kart.speed) * CFG.speedDisplayMult);
  assert.equal(h2.place, race.player.place);
  assert.equal(h2.minimap.karts.filter((k) => k.isPlayer).length, 1);
  race.items.give(race.player, 'espresso'); race.player.item.count = 3;      // a stack of three (no item has more than one use any more)
  assert.deepEqual({ ...race.getHud().item }, { id: 'espresso', count: 3 });
});

test('HudSnapshot lap data: lap counter, final lap flag and split list', () => {
  const race = makeRace({ human: 'marco', n: 2, laps: 2 });
  freezeOthers(race, race.player);
  runUntil(race, (r) => r.player.lap === 2, 100, () => humanBot(race));
  const h = race.getHud();
  assert.equal(h.lap, 2); assert.equal(h.laps, 2); assert.equal(h.finalLap, true);
  assert.equal(h.lapTimes.length, 1);
  assert.equal(h.bestLap, h.lapTimes[0]);
  runUntil(race, (r) => r.player.finished, 100, () => humanBot(race));
  const f = race.getHud();
  assert.equal(f.finished, true); assert.equal(f.finalLap, false);
  assert.equal(f.finishTime, race.player.finishTime);
  assert.equal(f.lapTimes.length, 2);
});

test('event ordering: start precedes any lap; laps precede finish; finish precedes over; overtakes only after the grace period', () => {
  const race = makeRace({ human: 'marco', laps: 1, seed: 5 });
  const names = ['race:countdown', 'race:start', 'race:lap', 'race:finish', 'race:over', 'race:overtake', 'race:final-lap'];
  const ev = recordEvents(names, race);
  runUntil(race, (r) => r.state === 'finished', 300, () => humanBot(race));
  ev.off();
  const idx = (n) => ev.log.findIndex((e) => e.name === n);
  assert.ok(idx('race:countdown') < idx('race:start'));
  assert.ok(idx('race:start') < idx('race:lap'));
  assert.ok(idx('race:lap') < idx('race:finish'));
  assert.equal(ev.log[ev.log.length - 1].name, 'race:over');
  assert.equal(ev.of('race:over').length, 1);
  assert.equal(ev.of('race:finish').length, 8);
  assert.deepEqual(ev.of('race:finish').map((e) => e.data.place), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const o of ev.of('race:overtake')) {
    assert.ok(o.t >= 2, 'no overtake events in the grid shuffle');
    assert.ok(o.data.id === 'marco' || o.data.passedId === 'marco', 'only overtakes involving the player are announced');
    assert.equal(o.data.isPlayer, o.data.id === 'marco');
  }
});

test('no NaN and finite state throughout a full 8-racer race, on both kart implementations', () => {
  for (const f of [undefined, simpleKartFactory]) {
    const race = makeRace({ human: 'marco', laps: 1, seed: 6, kartFactory: f });
    let bad = 0;
    for (let i = 0; i < 60 * 120 && race.state !== 'finished'; i++) { race.step(DT, humanBot(race)); if (!allFinite(race)) bad++; }
    assert.equal(bad, 0);
    assert.equal(race.state, 'finished');
  }
});

test('dispose stops the race from responding', () => {
  const race = makeRace({ human: 'marco' });
  race.dispose();
  const t = race.countdown;
  race.step(DT, null);
  assert.equal(race.countdown, t);
});

test('kart:fall from the physics leads to a respawn after the fall delay', () => {
  const race = makeRace({ human: 'marco', n: 2 });
  freezeOthers(race, race.player);
  skipCountdown(race);
  const ev = recordEvents(['kart:respawn'], race);
  bus.emit('kart:fall', { id: 'marco' });
  runUntil(race, () => ev.of('kart:respawn').length > 0, 3, () => ({ throttle: 0, brake: 0, steer: 0, drift: false }));
  ev.off();
  assert.equal(ev.of('kart:respawn').length, 1);
  assert.ok(race.time >= 0.99 && race.time < 1.2, `respawn after ${race.time}`);
});
