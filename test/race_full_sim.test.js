// Full-race simulation on every real track that is built. Unbuilt tracks (stub files that throw "not written yet" /
// "not built yet") are skipped, so this file keeps working as A2 / the lead land tracks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from '../src/core/roster.js';
import { createTrack } from '../src/track/index.js';
import { Race } from '../src/race/Race.js';
import { realKartFactory } from '../src/race/kartFactory.js';
import { DT, makeEntries, allFinite, recordEvents, humanBot } from './race_helpers.js';

const NOT_BUILT = /not (written|built) yet/i;

function tryTrack(id) {
  try { return { track: createTrack(id, { headless: true }) }; }
  catch (e) { if (NOT_BUILT.test(e.message)) return { skip: e.message }; throw e; }
}

for (const info of TRACKS) {
  const probe = tryTrack(info.id);
  if (probe.skip) { test(`full sim: ${info.id}`, { skip: probe.skip }, () => {}); continue; }

  test(`full sim: ${info.id}: 8 AIs x 3 laps finish, no NaN, sensible spread, no respawns or fall-offs`, () => {
    const track = tryTrack(info.id).track;
    const race = new Race({ track, entries: makeEntries(8), laps: 3, difficulty: 'professional', seed: 21, kartFactory: realKartFactory, updateTrack: true });
    const ev = recordEvents(['kart:respawn', 'kart:spin', 'kart:wall-hit', 'race:overtake'], race);
    let finite = true, steps = 0;
    while (race.state !== 'finished' && steps < 60 * 900) { race.step(DT, null); steps++; if (steps % 30 === 0 && !allFinite(race)) finite = false; }
    ev.off();
    assert.ok(finite, 'NaN or infinite kart state');
    assert.equal(race.state, 'finished', `not finished after ${(steps * DT).toFixed(0)} s`);
    const res = race.results();
    assert.ok(res.every((r) => r.time != null), 'every racer finished by itself');
    const times = res.map((r) => r.time).sort((a, b) => a - b);
    const spread = (times[7] - times[0]) / times[0];
    assert.ok(spread > 0.004 && spread < 0.2, `spread ${(spread * 100).toFixed(1)}%`);
    assert.equal(ev.of('kart:respawn').length, 0, 'AIs should not need respawning');
    assert.ok(ev.of('kart:wall-hit').length <= 24, `wall hits ${ev.of('kart:wall-hit').length}`);
    assert.ok(ev.of('kart:spin').length <= 60, `spins ${ev.of('kart:spin').length}`);
    // laps are sane: nobody laps in under 60 % of the leader's mean lap
    const leaderLap = times[0] / 3;
    assert.ok(res.every((r) => r.bestLap > leaderLap * 0.6), 'a lap time is implausibly short (checkpoint skip?)');
    console.log(`full sim ${info.id}: winner ${times[0].toFixed(1)} s, last ${times[7].toFixed(1)} s, spins ${ev.of('kart:spin').length}, walls ${ev.of('kart:wall-hit').length}`);
    race.dispose();
  });

  test(`full sim: ${info.id}: a line-following "human" finishes a 2-lap race too and gets results`, () => {
    const track = tryTrack(info.id).track;
    const race = new Race({ track, entries: makeEntries(8, 'marco'), laps: 2, difficulty: 'professional', player: 'marco', seed: 5, kartFactory: realKartFactory, updateTrack: true });
    let steps = 0;
    while (race.state !== 'finished' && steps < 60 * 700) { race.step(DT, humanBot(race)); steps++; }
    assert.equal(race.state, 'finished');
    const res = race.results();
    const me = res.find((r) => r.isPlayer);
    assert.ok(me.time != null, 'human finished');
    assert.ok(me.place <= 8);
    race.dispose();
  });
}
