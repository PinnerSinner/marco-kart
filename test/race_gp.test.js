import test from 'node:test';
import assert from 'node:assert/strict';
import { GP_POINTS } from '../src/core/config.js';
import { CUPS } from '../src/core/roster.js';
import { GrandPrix } from '../src/race/GrandPrix.js';
import { makeEntries } from './race_helpers.js';

const rows = (order) => order.map((id, i) => ({ id, place: i + 1 }));

test('GrandPrix: default cup, track order, total and done', () => {
  const gp = new GrandPrix({ entries: makeEntries(8, 'marco') });
  assert.equal(gp.cupId, CUPS[0].id);
  assert.equal(gp.trackId, CUPS[0].tracks[0]);
  assert.equal(gp.total, CUPS[0].tracks.length);
  assert.equal(gp.done, false);
  assert.throws(() => new GrandPrix({ entries: [] }));
});

test('GrandPrix: points follow GP_POINTS by place and accumulate over races', () => {
  const entries = makeEntries(8, 'marco');
  const ids = entries.map((e) => e.id);
  const gp = new GrandPrix({ entries });
  gp.record(rows(ids));
  let st = gp.standings();
  st.forEach((r, i) => { assert.equal(r.points, GP_POINTS[i]); assert.equal(r.gained, GP_POINTS[i]); });
  gp.next();
  assert.equal(gp.trackId, CUPS[0].tracks[1]);
  gp.record(rows([...ids].reverse()));
  st = gp.standings();
  const byId = new Map(st.map((r) => [r.id, r]));
  ids.forEach((id, i) => assert.equal(byId.get(id).points, GP_POINTS[i] + GP_POINTS[7 - i]));
  assert.deepEqual(byId.get(ids[0]).placings, [1, 8]);
  assert.equal(byId.get(ids[0]).gained, GP_POINTS[7], 'gained = the latest race');
});

test('GrandPrix: standings sort by points, and equal points and placings fall back to entry order', () => {
  const entries = makeEntries(4, null);
  const [a, b, c, d] = entries.map((e) => e.id);
  const gp = new GrandPrix({ entries });
  gp.record([{ id: a, place: 1 }, { id: b, place: 3 }, { id: c, place: 2 }, { id: d, place: 4 }]);
  gp.record([{ id: a, place: 5 }, { id: b, place: 2 }, { id: c, place: 4 }, { id: d, place: 1 }]);
  // a 15+6 = 21, b 10+12 = 22, c 12+8 = 20, d 8+15 = 23
  assert.deepEqual(gp.standings().map((r) => r.id), [d, b, a, c]);
  const v = new GrandPrix({ entries });
  v.record([{ id: a, place: 1 }, { id: b, place: 3 }, { id: c, place: 8 }, { id: d, place: 8 }]);
  v.record([{ id: a, place: 3 }, { id: b, place: 1 }, { id: c, place: 8 }, { id: d, place: 8 }]);
  assert.deepEqual(v.standings().slice(0, 2).map((r) => r.id), [a, b], 'identical points and placings: entry order');
});

test('GrandPrix: a genuine points tie goes to the racer with more wins', () => {
  const entries = makeEntries(3, null);
  const [a, b, c] = entries.map((e) => e.id);
  const gp = new GrandPrix({ entries });
  // a: 2nd + 4th = 12 + 8 = 20; b: 3rd + 3rd = 10 + 10 = 20
  gp.record([{ id: a, place: 2 }, { id: b, place: 3 }, { id: c, place: 1 }]);
  gp.record([{ id: a, place: 4 }, { id: b, place: 3 }, { id: c, place: 1 }]);
  const st = gp.standings();
  assert.equal(st[0].id, c);
  assert.equal(st[1].points, st[2].points, 'a and b tie on 20');
  assert.equal(st[1].id, a, 'a has the better single placing (a 2nd)');
});

test('GrandPrix: race 1 grid puts the human on the back row, later grids follow the championship', () => {
  const entries = makeEntries(8, 'marco');
  const gp = new GrandPrix({ entries });
  const g1 = gp.grid();
  assert.equal(g1.length, 8);
  assert.equal(g1[7].id, 'marco');
  assert.equal(new Set(g1.map((e) => e.id)).size, 8);
  const ids = entries.map((e) => e.id);
  gp.record(rows([...ids].reverse()));
  gp.next();
  assert.equal(gp.grid()[0].id, ids[7], 'race winner takes pole');
  assert.equal(gp.grid({ worstFirst: true })[0].id, ids[0], 'catch-up grid: last place on pole');
});

test('GrandPrix: record is ignored after the last race, results from Race.results() shape are accepted', () => {
  const entries = makeEntries(8, 'marco');
  const ids = entries.map((e) => e.id);
  const gp = new GrandPrix({ entries });
  for (let i = 0; i < gp.total; i++) { gp.record(rows(ids)); gp.next(); }
  assert.equal(gp.done, true);
  const before = gp.standings()[0].points;
  gp.record(rows(ids));
  assert.equal(gp.standings()[0].points, before);
  assert.equal(before, GP_POINTS[0] * gp.total);
  assert.equal(gp.trackId, CUPS[0].tracks[gp.total - 1], 'trackId clamps at the last track');
});

test('GrandPrix.finalResults: trophy tiers by place and the human trophy', () => {
  const mk = (humanPlace) => {
    const entries = makeEntries(8, 'marco');
    const ids = entries.map((e) => e.id);
    const order = ids.filter((i) => i !== 'marco'); order.splice(humanPlace - 1, 0, 'marco');
    const gp = new GrandPrix({ entries });
    for (let i = 0; i < gp.total; i++) { gp.record(rows(order)); gp.next(); }
    return gp.finalResults();
  };
  assert.equal(mk(1).trophy, 'gold');
  assert.equal(mk(2).trophy, 'silver');
  assert.equal(mk(3).trophy, 'bronze');
  assert.equal(mk(4).trophy, 'none');
  const f = mk(1);
  assert.equal(f.player.id, 'marco');
  assert.deepEqual(f.standings.slice(0, 4).map((r) => r.trophy), ['gold', 'silver', 'bronze', 'none']);
  assert.ok(f.standings.every((r, i) => r.place === i + 1));
});
