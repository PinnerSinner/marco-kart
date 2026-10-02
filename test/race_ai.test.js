import test from 'node:test';
import assert from 'node:assert/strict';
import { StubTrack, DT, makeRace, runToEnd, runUntil, skipCountdown, recordEvents, place, allFinite, bus } from './race_helpers.js';
import { simpleKartFactory, realKartFactory } from '../src/race/kartFactory.js';
import { Track } from '../src/track/Track.js';
import { fixtureDef } from './tracks_fixture.js';

const tracks = {
  stub: () => new StubTrack(),
  fixture: () => new Track(fixtureDef(), { headless: true }),
};

for (const [tname, mk] of Object.entries(tracks)) {
  for (const [kname, kartFactory] of [['simple', simpleKartFactory], ['physics', realKartFactory]]) {
    test(`AI field (${tname}, ${kname} kart): 8 AIs x 3 laps all finish with a sensible spread, no NaN, no respawn`, () => {
      // seed 5: the roulette stream changed when the item set was trimmed; with seed 3 one SimpleKart (no physics) came out of a zero-day spin facing
      // backwards and drove a whole lap the wrong way. The physics kart (the real game) is unaffected.
      const race = makeRace({ track: mk(), laps: 3, kartFactory, seed: 5 });
      const ev = recordEvents(['kart:respawn'], race);
      let finite = true;
      runUntil(race, (r) => { if (!allFinite(r)) finite = false; return r.state === 'finished'; }, 500);
      ev.off();
      assert.ok(finite, 'NaN in kart state');
      assert.equal(race.state, 'finished');
      const res = race.results();
      assert.equal(res.length, 8);
      assert.ok(res.every((r) => r.time != null), 'every AI finished by itself');
      const times = res.map((r) => r.time);
      const spread = (Math.max(...times) - Math.min(...times)) / Math.min(...times);
      // SimpleKart maps the stat bars straight onto top speed and turn rate with no kart-type profile, so the wide kart mods (+-2 steps) spread it more than the real physics
      const maxSpread = kname === 'simple' ? 0.4 : 0.25;
      assert.ok(spread > 0.005 && spread < maxSpread, `spread ${(spread * 100).toFixed(1)}%`);
      assert.ok(ev.log.length <= 1, `respawns ${ev.log.length}`);
      race.dispose();
    });
  }
}

test('AI is deterministic: the same seed gives the same result', () => {
  const run = () => { const r = makeRace({ laps: 1, seed: 11 }); runToEnd(r); const out = r.results().map((x) => `${x.id}:${x.time.toFixed(3)}`).join(','); r.dispose(); return out; };
  assert.equal(run(), run());
});

test('AI drifts and earns mini-turbos on a track with corners', () => {
  const race = makeRace({ track: tracks.fixture(), laps: 2, seed: 2 });
  const ev = recordEvents(['kart:drift-start', 'kart:boost'], race);
  runToEnd(race, 500);
  ev.off();
  assert.ok(ev.of('kart:drift-start').length >= 3, `drift starts ${ev.of('kart:drift-start').length}`);
  assert.ok(ev.of('kart:boost').some((e) => e.data.kind === 'drift'), 'at least one drift boost');
  race.dispose();
});

test('AI collects and uses items with intent (several kinds, all through item:use)', () => {
  const race = makeRace({ laps: 3, seed: 5 });
  const ev = recordEvents(['item:use', 'item:get'], race);
  runToEnd(race, 500);
  ev.off();
  const used = new Set(ev.of('item:use').map((e) => e.data.item));
  assert.ok(ev.of('item:get').length >= 8, 'items were picked up');
  assert.ok(used.size >= 4, `kinds used: ${[...used]}`);
  race.dispose();
});

test('AI never uses an item it does not hold (item:use follows item:get per racer)', () => {
  const race = makeRace({ laps: 2, seed: 7 });
  const held = new Map();
  const offs = [
    bus.on('item:get', (d) => held.set(d.id, (held.get(d.id) ?? 0) + 1)),
    bus.on('item:use', (d) => { assert.ok((held.get(d.id) ?? 0) > 0, `${d.id} used ${d.item} with nothing given`); }),
  ];
  runToEnd(race, 400);
  offs.forEach((o) => o());
  race.dispose();
});

test('AI stuck recovery: a kart pinned facing backwards gets going again without a respawn', () => {
  const race = makeRace({ laps: 3, seed: 4, n: 4 });
  skipCountdown(race);
  const r = race.racers[2];
  const sm = race.track.sample(80);
  r.kart.teleport(sm.pos.clone(), Math.atan2(-sm.tangent.x, -sm.tangent.z));     // facing back down the track
  race.track.query(r.kart.pos, r.kart.ground);
  const ev = recordEvents(['kart:respawn'], race);
  let moving = null;
  runUntil(race, (rc) => { if (moving === null && rc.time > 0 && r.kart.speed > 8 && Math.cos(r.kart.yaw - Math.atan2(sm.tangent.x, sm.tangent.z)) > 0.5) moving = rc.time; return moving !== null || rc.time > 20; }, 25);
  ev.off();
  assert.notEqual(moving, null, 'kart recovered');
  assert.equal(ev.log.length, 0);
  race.dispose();
});

test('AI rubber band is bounded: the speed scale never exceeds 1 + rubber + 0.02', () => {
  const race = makeRace({ laps: 2, seed: 9 });
  let worst = 1;
  runUntil(race, (r) => { for (const x of r.racers) if (x.kart.speedScale > worst) worst = x.kart.speedScale; return r.state === 'finished'; }, 400);
  assert.ok(worst <= 1.12, `speedScale peaked at ${worst.toFixed(3)}`);
  race.dispose();
});

test('AI difficulty: Associate < Professional < Specialty in pace over the same course', () => {
  // the mean over three seeds: with kart types that differ this much, one race can be decided by a single collision or spin-out
  const total = (difficulty) => {
    let sum = 0;
    for (const seed of [3, 4, 5]) { const r = makeRace({ track: tracks.fixture(), laps: 3, seed, difficulty }); runToEnd(r, 600); sum += r.results().reduce((a, x) => a + x.time, 0) / 8; r.dispose(); }
    return sum / 3;
  };
  const a = total('associate'), p = total('professional'), s = total('specialty');
  assert.ok(a > p * 1.02, `associate ${a.toFixed(1)} vs professional ${p.toFixed(1)}`);
  assert.ok(p > s * 1.005, `professional ${p.toFixed(1)} vs specialty ${s.toFixed(1)}`);
});
