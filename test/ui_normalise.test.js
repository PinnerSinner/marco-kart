import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseStandings, normaliseFinal, normaliseRow, previousRanks, trophyFor } from '../src/ui/normalise.js';

test('trophyFor maps placings to tiers', () => {
  assert.deepEqual([1, 2, 3, 4, 8].map(trophyFor), ['gold', 'silver', 'bronze', 'none', 'none']);
});

test('normaliseRow tolerates alternative field names', () => {
  const r = normaliseRow({ racerId: 'rex', total: 27, lastPoints: 8, player: true }, 3);
  assert.equal(r.id, 'rex'); assert.equal(r.charId, 'rex'); assert.equal(r.points, 27); assert.equal(r.gained, 8);
  assert.equal(r.isPlayer, true); assert.equal(r.name, 'Root Rex'); assert.equal(r.place, 4);
});

test('normaliseStandings sorts by points when places are absent and assigns 1..n', () => {
  const rows = normaliseStandings([{ id: 'rex', points: 10 }, { id: 'marco', points: 30, isPlayer: true }, { id: 'tilly', points: 20 }]);
  assert.deepEqual(rows.map((r) => r.id), ['marco', 'tilly', 'rex']);
  assert.deepEqual(rows.map((r) => r.place), [1, 2, 3]);
});

test('normaliseStandings respects given places and accepts wrapped objects', () => {
  const rows = normaliseStandings({ standings: [{ id: 'rex', points: 1, place: 2 }, { id: 'marco', points: 0, place: 1 }] });
  assert.deepEqual(rows.map((r) => r.id), ['marco', 'rex']);
  assert.deepEqual(normaliseStandings(null), []);
  assert.deepEqual(normaliseStandings(undefined), []);
});

test('normaliseStandings falls back to the last race points when rows carry no "gained"', () => {
  const gained = new Map([['marco', 12], ['rex', 15]]);
  const rows = normaliseStandings([{ id: 'marco', points: 12 }, { id: 'rex', points: 15 }], gained);
  assert.equal(rows.find((r) => r.id === 'rex').gained, 15);
});

test('previousRanks reconstructs the order before the last race, keeping ties stable', () => {
  const rows = normaliseStandings([
    { id: 'marco', points: 27, gained: 15 }, { id: 'rex', points: 25, gained: 5 }, { id: 'tilly', points: 10, gained: 10 },
  ]);
  const prev = previousRanks(rows);
  assert.equal(prev.get('rex'), 0, 'rex led with 20 before');
  assert.equal(prev.get('marco'), 1, 'marco had 12');
  assert.equal(prev.get('tilly'), 2, 'tilly had 0');
});

test('normaliseFinal: uses the trophy tier it is given, else derives it from the player place', () => {
  const rows = [{ id: 'rex', points: 40 }, { id: 'marco', points: 35, isPlayer: true }, { id: 'tilly', points: 5 }];
  assert.equal(normaliseFinal(rows).trophy, 'silver');
  assert.equal(normaliseFinal({ standings: rows, trophy: 'gold' }).trophy, 'gold');
  assert.equal(normaliseFinal({ standings: rows, trophy: 'platinum' }).trophy, 'silver', 'unknown tier is ignored');
  assert.equal(normaliseFinal(rows).player.id, 'marco');
  const none = normaliseFinal([{ id: 'a', points: 9 }, { id: 'b', points: 8 }, { id: 'c', points: 7 }, { id: 'marco', points: 1, isPlayer: true }]);
  assert.equal(none.trophy, 'none');
  assert.equal(normaliseFinal([]).trophy, 'none');
});
