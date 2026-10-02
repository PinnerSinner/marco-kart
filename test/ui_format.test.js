import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ordinalSuffix, ordinal, ordinalParts, formatTime, formatTimeShort, formatDelta, displaySpeed, speedUnitLabel,
  gaugeFraction, lapLabel, formatPoints, lapSplitRows, currentLapTime, KMH_TO_MPH,
} from '../src/ui/format.js';

test('ordinals: suffixes including the teens', () => {
  const got = [1, 2, 3, 4, 8, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal);
  assert.deepEqual(got, ['1ST', '2ND', '3RD', '4TH', '8TH', '11TH', '12TH', '13TH', '21ST', '22ND', '23RD', '101ST', '111TH']);
  assert.equal(ordinalSuffix(0), 'TH');
});

test('ordinalParts: split for the big HUD numeral, placeholder for bad input', () => {
  assert.deepEqual(ordinalParts(3), { num: '3', suffix: 'RD' });
  assert.deepEqual(ordinalParts(NaN), { num: '-', suffix: '' });
  assert.deepEqual(ordinalParts(0), { num: '-', suffix: '' });
  assert.deepEqual(ordinalParts(2.9), { num: '2', suffix: 'ND' });
});

test('formatTime: M:SS.mmm with correct rounding and guards', () => {
  assert.equal(formatTime(0), '0:00.000');
  assert.equal(formatTime(61.5), '1:01.500');
  assert.equal(formatTime(59.9996), '1:00.000');
  assert.equal(formatTime(754.321), '12:34.321');
  assert.equal(formatTime(null), '--:--.---');
  assert.equal(formatTime(NaN), '--:--.---');
  assert.equal(formatTime(-1), '--:--.---');
  assert.equal(formatTime(Infinity), '--:--.---');
});

test('formatTimeShort: centiseconds truncate like a stopwatch', () => {
  assert.equal(formatTimeShort(48.219), '0:48.21');
  assert.equal(formatTimeShort(125.999), '2:05.99');
  assert.equal(formatTimeShort(undefined), '-:--.--');
});

test('formatDelta and formatPoints', () => {
  assert.equal(formatDelta(1.2346), '+1.235');
  assert.equal(formatDelta(-0.5), '-0.500');
  assert.equal(formatDelta(NaN), '');
  assert.equal(formatPoints(15), '+15');
  assert.equal(formatPoints(0), '');
});

test('speed: km/h and mph conversion, rounding, clamping', () => {
  assert.equal(displaySpeed(100, 'kmh'), 100);
  assert.equal(displaySpeed(100, 'mph'), Math.round(100 * KMH_TO_MPH));
  assert.equal(displaySpeed(160.9344, 'mph'), 100);
  assert.equal(displaySpeed(-30, 'kmh'), 30, 'reversing shows a positive number');
  assert.equal(displaySpeed(NaN), 0);
  assert.equal(speedUnitLabel('mph'), 'MPH');
  assert.equal(speedUnitLabel('kmh'), 'KM/H');
  assert.equal(speedUnitLabel(undefined), 'KM/H');
});

test('gaugeFraction stays within 0..1', () => {
  assert.equal(gaugeFraction(120, 240), 0.5);
  assert.equal(gaugeFraction(999), 1);
  assert.equal(gaugeFraction(-120, 240), 0.5, 'reversing fills the arc too');
  assert.equal(gaugeFraction(NaN), 0);
});

test('lapLabel clamps the lap into range', () => {
  assert.equal(lapLabel(2, 3), 'LAP 2/3');
  assert.equal(lapLabel(4, 3), 'LAP 3/3');
  assert.equal(lapLabel(0, 3), 'LAP 1/3');
  assert.equal(lapLabel(1, 0), 'LAP 1/1');
});

test('lapSplitRows: finished laps, live lap, blanks, best marking', () => {
  const rows = lapSplitRows([50, 48], 130, 3, false);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.live), [false, false, true]);
  assert.equal(rows[2].time, 32);
  assert.equal(rows[1].best, true);
  assert.equal(rows[0].best, false);
  const fin = lapSplitRows([50, 48, 49], 147, 3, true);
  assert.ok(fin.every((r) => !r.live));
  const early = lapSplitRows([], 10, 3, false);
  assert.deepEqual(early.map((r) => r.time), [10, null, null]);
  assert.equal(early[0].best, false, 'a single lap is not a "best"');
});

test('currentLapTime subtracts completed laps and never goes negative', () => {
  assert.equal(currentLapTime([50, 48], 130), 32);
  assert.equal(currentLapTime([], 5), 5);
  assert.equal(currentLapTime([100], 50), 0);
});
