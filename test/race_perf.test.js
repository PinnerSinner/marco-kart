import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, makeRace, skipCountdown, humanBot } from './race_helpers.js';
import { simpleKartFactory, realKartFactory } from '../src/race/kartFactory.js';

/** Mean cost of Race.step (ms) over `steps` fixed steps of a running 8-racer race, after a warm-up. */
function meanStepMs(kartFactory, steps = 6000) {
  const race = makeRace({ human: 'marco', laps: 50, seed: 8, kartFactory });
  skipCountdown(race);
  for (let i = 0; i < 600; i++) race.step(DT, humanBot(race));          // JIT warm-up
  let total = 0n;
  for (let i = 0; i < steps; i++) {
    const inp = humanBot(race);
    const t0 = process.hrtime.bigint();
    race.step(DT, inp);
    race.getHud();
    total += process.hrtime.bigint() - t0;
  }
  race.dispose();
  return Number(total) / 1e6 / steps;
}

test('perf: Race.step + getHud with 8 racers on the real kart physics stays far below the 16 ms frame', () => {
  const ms = meanStepMs(realKartFactory);
  console.log(`race perf (8 racers, KartPhysics, StubTrack): mean Race.step + getHud = ${ms.toFixed(3)} ms`);
  assert.ok(ms < 1, `mean ${ms.toFixed(3)} ms`);
});

test('perf: the same with the simple kart', () => {
  const ms = meanStepMs(simpleKartFactory);
  console.log(`race perf (8 racers, SimpleKart, StubTrack): mean Race.step + getHud = ${ms.toFixed(3)} ms`);
  assert.ok(ms < 1, `mean ${ms.toFixed(3)} ms`);
});

test('perf: getHud reuses one object and does not grow the heap over a long race', () => {
  const race = makeRace({ human: 'marco', laps: 50, seed: 2 });
  skipCountdown(race);
  const first = race.getHud();
  for (let i = 0; i < 3000; i++) race.step(DT, humanBot(race));
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 6000; i++) { race.step(DT, humanBot(race)); assert.equal(race.getHud(), first); }
  const grown = (process.memoryUsage().heapUsed - before) / 1e6;
  assert.ok(grown < 40, `heap grew ${grown.toFixed(1)} MB over 100 s of racing`);
  race.dispose();
});
