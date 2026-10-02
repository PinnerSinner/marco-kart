// Game speed classes ("Mbps", the cc of this game): 50 / 100 / 150 / 200. A class is a TIME SCALE on the whole driving model, so a kart's speeds
// scale with it while corner radii, drift arcs, jump arcs and braking distances stay the same. The AI, the rubber band, the HUD read-out and the camera follow.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CFG } from '../src/core/config.js';
import { SPEED_CLASS_IDS, DEFAULT_SPEED_CLASS, resolveSpeedClass, speedClassInfo, speedClassFromQuery } from '../src/core/speedClass.js';
import { KartPhysics } from '../src/kart/KartPhysics.js';
import { classScale } from '../src/kart/kartTuning.js';
import { Race } from '../src/race/Race.js';
import { classTune, AI_TUNE } from '../src/race/aiTuning.js';
import { realKartFactory } from '../src/race/kartFactory.js';
import { createTrack } from '../src/track/index.js';
import { bus } from '../src/core/bus.js';
import { SelectFlow } from '../src/ui/flow.js';
import { Progress } from '../src/ui/progress.js';
import { defaultSettings, sanitizeSettings } from '../src/ui/settings.js';
import { gaugeFraction } from '../src/ui/format.js';
import { HillTrack } from './drive_tracks.js';
import { measure, makeKart, topSpeed, timeToTop, brakeStop, DT } from './drive_karts_measure.js';

const C = { 50: 0.8, 100: 1, 150: 1.25, 200: 1.5 };

test('speed classes: the four classes, their names, the default and the helpers', () => {
  assert.deepEqual(SPEED_CLASS_IDS, [50, 100, 150, 200]);
  assert.equal(DEFAULT_SPEED_CLASS, 100);
  for (const id of SPEED_CLASS_IDS) {
    const info = speedClassInfo(id);
    assert.equal(info.name, `${id} Mbps`);
    assert.ok(info.tag && info.blurb, 'every class has a tag and a one-liner');
    assert.equal(info.speed, C[id]);
    assert.equal(CFG.speedClasses.classes[id].id, id);
  }
  assert.equal(resolveSpeedClass('150'), 150);
  assert.equal(resolveSpeedClass('200 Mbps'), 200);
  assert.equal(resolveSpeedClass(50), 50);
  for (const bad of [77, 'fast', null, undefined, NaN, {}, 0, -100]) assert.equal(resolveSpeedClass(bad), 100, `${String(bad)} falls back`);
  assert.equal(resolveSpeedClass('bad', 150), 150, 'custom fallback');
  assert.equal(speedClassInfo('nonsense').id, 100);
  assert.equal(speedClassFromQuery('?class=150'), 150);
  assert.equal(speedClassFromQuery('?x=1&class=50&y=2'), 50);
  assert.equal(speedClassFromQuery('?class=33'), null);
  assert.equal(speedClassFromQuery(''), null);
  for (const id of SPEED_CLASS_IDS) assert.equal(classScale(id).c, C[id]);
});

test('speed classes: the class tag and name read as intended (50 relaxed ... 200 frantic), and the knobs only grow with the class', () => {
  const ids = SPEED_CLASS_IDS.map(speedClassInfo);
  for (let i = 1; i < ids.length; i++) {
    assert.ok(ids[i].speed > ids[i - 1].speed && ids[i].fov >= ids[i - 1].fov && ids[i].fx > ids[i - 1].fx && ids[i].aiRubber >= ids[i - 1].aiRubber && ids[i].aiPace >= ids[i - 1].aiPace);
  }
  assert.equal(ids[0].tag, 'Relaxed'); assert.equal(ids[3].tag, 'Extreme');
  assert.ok(ids[0].fov < 0 && ids[3].fov > 0 && ids[1].fov === 0, 'camera FOV: narrower at 50, standard at 100, wider at 150 / 200');
});

test('speed classes: top speed and acceleration time scale with the class, for every kart type', () => {
  for (const kartId of ['cruiser', 'buggy', 'hauler', 'rocket']) {
    const top100 = topSpeed(kartId, { speedClass: 100 }), t100 = timeToTop(kartId, { speedClass: 100 });
    for (const cls of SPEED_CLASS_IDS) {
      const top = topSpeed(kartId, { speedClass: cls }), t = timeToTop(kartId, { speedClass: cls });
      assert.ok(Math.abs(top / top100 - C[cls]) < 0.01, `${kartId} ${cls}: top ${top.toFixed(2)} vs ${(top100 * C[cls]).toFixed(2)}`);
      assert.ok(Math.abs(t * C[cls] / t100 - 1) < 0.04, `${kartId} ${cls}: 0-to-top ${t.toFixed(2)} s vs ${(t100 / C[cls]).toFixed(2)} s`);
    }
  }
});

test('speed classes: corners, drift arcs, braking distance and hop height keep their geometry at every class', () => {
  for (const kartId of ['cruiser', 'buggy', 'hauler', 'rocket']) {
    const ref = measure(kartId, { speedClass: 100 });
    for (const cls of [50, 150, 200]) {
      const m = measure(kartId, { speedClass: cls });
      const near = (a, b, tol, what) => assert.ok(Math.abs(a / b - 1) < tol, `${kartId} @${cls}: ${what} ${a.toFixed(2)} vs ${b.toFixed(2)}`);
      near(m.rTop, ref.rTop, 0.04, 'turn radius at top speed');
      near(m.r25, ref.r25, 0.06, 'turn radius at 25c m/s');
      near(m.drift.radius, ref.drift.radius, 0.04, 'drift arc radius');
      near(m.brake.dist, ref.brake.dist, 0.05, 'braking distance from 25c');
      near(m.hop.apex, ref.hop.apex, 0.08, 'hop apex');
      near(m.drift.l3 * C[cls], ref.drift.l3, 0.06, 'drift charge time (x c)');
    }
  }
});

test('speed classes: a ramp jump has the same shape at every class and takes 1/c as long; boost timers stay in real seconds', () => {
  const jump = (cls) => {
    const t = new HillTrack({ straight: 800 });
    const k = new KartPhysics(t, { id: 'j', speedClass: cls });
    k.teleport(new THREE.Vector3(60, 0, 0), 0);
    let air = 0, maxY = 0, takeZ = null, landZ = null, was = true;
    for (let i = 0; i < 60 * 12; i++) {
      k.update(DT, { throttle: 1 });
      if (!k.grounded) air += DT;
      maxY = Math.max(maxY, k.pos.y);
      if (was && !k.grounded && takeZ == null && k.pos.z > 58) takeZ = k.pos.z;
      if (!was && k.grounded && takeZ != null && landZ == null) landZ = k.pos.z;
      was = k.grounded;
      if (landZ != null) break;
    }
    return { air, maxY, dist: landZ - takeZ };
  };
  const ref = jump(100);
  for (const cls of [50, 150, 200]) {
    const j = jump(cls);
    assert.ok(Math.abs(j.air * C[cls] / ref.air - 1) < 0.12, `${cls}: airtime ${j.air.toFixed(2)} s vs ${(ref.air / C[cls]).toFixed(2)} s`);
    assert.ok(Math.abs(j.maxY / ref.maxY - 1) < 0.12, `${cls}: apex ${j.maxY.toFixed(2)} vs ${ref.maxY.toFixed(2)}`);
  }
  for (const cls of SPEED_CLASS_IDS) {
    const k = makeKart('cruiser', { speedClass: cls });
    k.applyBoost(1, 1, 'item');
    assert.equal(k.boost.time, 1, 'a 1 s boost is 1 real second at every class');
    for (let i = 0; i < 59; i++) k.update(DT, { throttle: 1 });
    assert.ok(k.boost.time > 0, `${cls}: still boosting after 59 ticks`);
    for (let i = 0; i < 3; i++) k.update(DT, { throttle: 1 });
    assert.equal(k.boost.time, 0, `${cls}: boost over after a second`);
  }
});

test('speed classes: setSpeedClass on a live kart and unknown ids behave', () => {
  const k = makeKart('cruiser', { speedClass: 100 });
  assert.equal(k.speedClass, 100);
  const k2 = makeKart('cruiser', { speedClass: 123 });
  assert.equal(k2.params.c, 1, 'an unknown class is the default class');
  if (typeof k.setSpeedClass === 'function') {
    k.setSpeedClass(200);
    assert.equal(k.params.c, 1.5);
    assert.ok(Math.abs(k.params.top / 32.75 - 1.5) < 0.01);
  }
});

test('speed classes: classTune is the identity at 100 Mbps and scales braking / thresholds with the class', () => {
  assert.equal(classTune(AI_TUNE, 1), AI_TUNE);
  const T2 = classTune(AI_TUNE, 1.5);
  assert.ok(Math.abs(T2.aBrake / AI_TUNE.aBrake - 2.25) < 1e-9, 'braking deceleration scales with c^2');
  assert.ok(Math.abs(T2.jumpSpeed / AI_TUNE.jumpSpeed - 1.5) < 1e-9 && Math.abs(T2.driftMinSpeed / AI_TUNE.driftMinSpeed - 1.5) < 1e-9);
  assert.ok(Object.isFrozen(T2));
});

test('speed classes: Race carries the class into every kart, the AI pace and rubber band, and the HUD snapshot', () => {
  const entries = [{ id: 'p', charId: 'marco', kartId: 'cruiser', isPlayer: true }, { id: 'a', charId: 'rex', kartId: 'hauler' }, { id: 'b', charId: 'tilly', kartId: 'buggy' }];
  const track = createTrack('copacabana', { headless: true });
  const paces = {};
  for (const cls of SPEED_CLASS_IDS) {
    const race = new Race({ track, entries, laps: 2, difficulty: 'professional', player: 'p', seed: 3, kartFactory: realKartFactory, speedClass: cls });
    assert.equal(race.speedClass, cls); assert.equal(race.speedC, C[cls]);
    for (const r of race.racers) { assert.equal(r.kart.speedClass, cls); assert.equal(r.kart.params.c, C[cls]); }
    assert.equal(race.player.kart.isPlayer, true, 'only the human kart is flagged for the HUD / audio events');
    assert.equal(race.racers.filter((r) => r.kart.isPlayer).length, 1);
    const hud = race.getHud();
    assert.equal(hud.speedClass, cls); assert.equal(hud.speedClassName, `${cls} Mbps`); assert.equal(hud.speedClassTag, speedClassInfo(cls).tag); assert.equal(hud.speedC, C[cls]);
    const ai = race.racers.find((r) => r.ai).ai;
    assert.equal(ai.rubberMul, speedClassInfo(cls).aiRubber);
    paces[cls] = ai.basePace;
  }
  assert.ok(paces[50] < paces[100] && paces[200] >= paces[150] && paces[150] >= paces[100], `AI pace by class ${JSON.stringify(paces)}`);
  const dflt = new Race({ track, entries, laps: 2, player: 'p', seed: 3, kartFactory: realKartFactory });
  assert.equal(dflt.speedClass, 100, 'no class given = 100 Mbps');
  const bad = new Race({ track, entries, laps: 2, player: 'p', seed: 3, kartFactory: realKartFactory, speedClass: 'ludicrous' });
  assert.equal(bad.speedClass, 100);
});

test('speed classes: the HUD read-out follows the class (km/h scales, the dial full-scale grows) and shows the class name', () => {
  const entries = [{ id: 'p', charId: 'marco', kartId: 'cruiser', isPlayer: true }];
  const track = createTrack('copacabana', { headless: true });
  const kmh = {};
  for (const cls of [100, 200]) {
    const race = new Race({ track, entries, laps: 2, player: 'p', seed: 1, kartFactory: realKartFactory, speedClass: cls });
    for (let i = 0; i < 60 * 14; i++) race.step(DT, { throttle: 1, brake: 0, steer: 0, drift: false });
    kmh[cls] = race.getHud().speedKmh;
  }
  assert.ok(kmh[200] / kmh[100] > 1.4, `200 Mbps shows ${kmh[200].toFixed(0)} km/h vs ${kmh[100].toFixed(0)}`);
  assert.ok(gaugeFraction(kmh[200], 240 * 1.5) < 0.95, 'the dial is not pinned at 200 Mbps');
  assert.ok(gaugeFraction(kmh[200], 240) >= 0.99 || kmh[200] < 240, 'a fixed 240 km/h dial would run out');
});

test('speed classes: the settings, the select flow and the saved picks carry the class (default 100, junk rejected)', () => {
  const d = defaultSettings(false);
  assert.equal(d.speedClass, 100);
  for (const id of SPEED_CLASS_IDS) assert.equal(sanitizeSettings({ speedClass: id }, d).speedClass, id);
  assert.equal(sanitizeSettings({ speedClass: '200' }, d).speedClass, 200);
  assert.equal(sanitizeSettings({ speedClass: 'x' }, d).speedClass, 100);
  assert.equal(sanitizeSettings({ speedClass: 12 }, { ...d, speedClass: 150 }).speedClass, 150, 'invalid values keep the current one');
  const events = [];
  const flow = new SelectFlow('single', { picks: { speedClass: 150 }, emit: (n, p) => events.push([n, p]) });
  assert.equal(flow.picks.speedClass, 150);
  assert.equal(flow.pick('speedClass', 77), false); assert.equal(flow.pick('speedClass', '50'), false);
  assert.equal(flow.pick('speedClass', 200), true);
  while (flow.confirm() === 'next');
  const start = events.find((e) => e[0] === 'ui:start')[1];
  assert.equal(start.speedClass, 200);
  const none = [];
  const f2 = new SelectFlow('gp', { emit: (n, p) => none.push([n, p]) });
  while (f2.confirm() === 'next');
  assert.equal('speedClass' in none[0][1], false, 'a flow that was never given a class leaves it out (the game then uses the setting)');
  // best times are kept per class: a 200 Mbps lap would otherwise beat every 100 Mbps record
  const mem = {};
  const store = { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); } };
  const prog = new Progress(store);
  prog.record('copacabana', 3, { bestLap: 60, time: 190 }, 100);
  const r200 = prog.record('copacabana', 3, { bestLap: 45, time: 140 }, 200);
  assert.equal(r200.newBestLap, true); assert.equal(r200.prevBestLap, null, 'the 200 Mbps book starts empty');
  assert.equal(prog.getBest('copacabana', 3).bestLap, 60);
  assert.equal(prog.getBest('copacabana', 3, 200).bestLap, 45);
  assert.equal(prog.getBest('copacabana', 3, 50).bestLap, null);
});

// AI races on all four real tracks at the extreme classes: everybody finishes, nobody is respawned, nobody falls off (marcoverse has no walls)
for (const trackId of ['copacabana', 'blighty', 'datacentre', 'marcoverse']) {
  test(`speed classes: AI karts finish ${trackId} at 50 and 200 Mbps with no respawns (one of every kart type, 2 laps)`, () => {
    for (const cls of [50, 200]) {
      const track = createTrack(trackId, { headless: true });
      track.itemBoxes = [];
      const entries = [['marco', 'cruiser'], ['tilly', 'buggy'], ['rex', 'hauler'], ['packet', 'rocket']].map(([charId, kartId]) => ({ id: charId, charId, kartId }));
      const race = new Race({ track, entries, laps: 2, difficulty: 'professional', seed: 5, kartFactory: realKartFactory, speedClass: cls });
      let respawns = 0, falls = 0;
      const offs = [bus.on('kart:respawn', () => respawns++), bus.on('kart:fall', () => falls++)];
      let steps = 0;
      while (race.state !== 'finished' && steps < 60 * 600) { race.step(DT, null); steps++; }
      offs.forEach((o) => o());
      assert.equal(race.state, 'finished', `${trackId} @${cls}: not finished after ${(steps * DT).toFixed(0)} s`);
      assert.ok(race.results().every((r) => r.time != null), `${trackId} @${cls}: every kart finished`);
      assert.equal(respawns, 0, `${trackId} @${cls}: respawns`);
      assert.equal(falls, 0, `${trackId} @${cls}: falls`);
    }
  });
}

test('speed classes: lap times fall with the class (50 slower than 100 slower than 150 slower than 200) on a real track', () => {
  const lap = (cls) => {
    const track = createTrack('blighty', { headless: true });
    track.itemBoxes = [];
    const race = new Race({ track, entries: [{ id: 'marco', charId: 'marco', kartId: 'cruiser' }], laps: 2, seed: 2, kartFactory: realKartFactory, speedClass: cls });
    let steps = 0;
    while (race.state !== 'finished' && steps < 60 * 900) { race.step(DT, null); steps++; }
    return race.results()[0].time;
  };
  const t = Object.fromEntries(SPEED_CLASS_IDS.map((c) => [c, lap(c)]));
  assert.ok(t[50] > t[100] && t[100] > t[150] && t[150] > t[200], JSON.stringify(t));
  for (const cls of SPEED_CLASS_IDS) assert.ok(Math.abs(t[cls] * C[cls] / t[100] - 1) < 0.12, `${cls}: lap time ${t[cls].toFixed(1)} s is roughly 1/c of 100 Mbps (${t[100].toFixed(1)} s)`);
});

void brakeStop;
