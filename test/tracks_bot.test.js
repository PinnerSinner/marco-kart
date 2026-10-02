// A pursuit bot driving the REAL KartPhysics must lap each track without falling into the void or getting stuck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrack } from '../src/track/index.js';
import { KartPhysics } from '../src/kart/KartPhysics.js';
import { SimpleKart } from '../src/kart/SimpleKart.js';
import { driveLaps } from './tracks_bot.js';

for (const id of ['copacabana', 'blighty']) {
  test(`${id}: pursuit bot completes 2 laps with KartPhysics (no void, no stall, no NaN)`, () => {
    const track = createTrack(id, { headless: true });
    const r = driveLaps(track, KartPhysics, { laps: 2, maxTime: 300 });
    const info = `${id}: t=${r.time.toFixed(1)}s progress=${r.progress.toFixed(0)}/${(2 * track.length).toFixed(0)} fell=${r.fell}@${r.fellAt} stuck=${r.stuck}@${r.stuckAt} wallHits=${r.wallHits} off=${r.offRoadTime.toFixed(1)}s laps=${r.laps.map((v) => v.toFixed(1))}`;
    console.log(info);
    assert.ok(!r.nan, 'no NaN');
    assert.ok(!r.fell, 'fell into the void: ' + info);
    assert.ok(!r.stuck, 'got stuck: ' + info);
    assert.ok(r.finished, 'did not finish: ' + info);
    assert.ok(r.laps[0] > 45 && r.laps[0] < 120, `lap time ${r.laps[0]} within the 60-90 s brief (loosely)`);
  });
  test(`${id}: pursuit bot also laps with SimpleKart`, () => {
    const track = createTrack(id, { headless: true });
    const r = driveLaps(track, SimpleKart, { laps: 1, maxTime: 300 });
    assert.ok(r.finished && !r.fell && !r.stuck, `${id} simple: ${JSON.stringify({ t: r.time, f: r.fell, s: r.stuck, at: r.stuckAt ?? r.fellAt })}`);
  });
}
