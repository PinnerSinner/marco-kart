// Kart types: the four karts must drive noticeably differently (felt within a few seconds), stay inside the SPEC speed band so every kart is
// viable and the AI can race them, and the kart-select ratings must tell the truth. Measurements come from test/drive_karts_measure.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KartPhysics } from '../src/kart/KartPhysics.js';
import { CHARACTERS, KARTS, statsFor } from '../src/core/roster.js';
import { kartRatings, profileFor, TUNING } from '../src/kart/kartTuning.js';
import { FlatTrack } from './drive_tracks.js';
import { makeKart, measure, bump, topSpeed, timeToTop, spreadVsCruiser } from './drive_karts_measure.js';

const IDS = KARTS.map((k) => k.id);
const M = Object.fromEntries(IDS.map((id) => [id, measure(id, {})]));
const ratio = (f) => { const v = IDS.map((id) => f(M[id])); return Math.max(...v) / Math.min(...v); };

test('kart types: the spread between the karts is big enough to feel and small enough to stay viable', () => {
  const rows = IDS.map((id) => `${id}: top ${M[id].top.toFixed(1)} 0-25 ${M[id].t25.toFixed(2)} r@top ${M[id].rTop.toFixed(1)} arc ${M[id].drift.radius.toFixed(1)}`);
  const need = [
    ['top speed', ratio((m) => m.top), 1.07, 1.16],
    ['acceleration (0 to 25 m/s)', ratio((m) => m.t25), 1.5, 2.6],
    ['turn radius at 25 m/s', ratio((m) => m.r25), 1.4, 2.2],
    ['turn radius near top speed', ratio((m) => m.rTop), 1.6, 3.2],
    ['drift arc radius', ratio((m) => m.drift.radius), 2.0, 4.0],
    ['drift charge time (level 3)', ratio((m) => m.drift.l3), 1.8, 4.5],
    ['mini-turbo size (seconds x power)', ratio((m) => m.drift.miniSeconds * m.drift.miniPower), 1.3, 2.4],
    ['grass speed kept', ratio((m) => m.grass), 1.6, 3.0],
    ['braking distance', ratio((m) => m.brake.dist), 1.4, 2.4],
  ];
  for (const [what, r, lo, hi] of need) assert.ok(r >= lo && r <= hi, `${what}: max/min ${r.toFixed(2)} should be in ${lo}..${hi}\n${rows.join('\n')}`);
});

test('kart types: each one has its own character (cruiser balanced, buggy agile, hauler heavy, rocket fast and slippery)', () => {
  const { cruiser: c, buggy: b, hauler: h, rocket: r } = M;
  // buggy: tightest corners and drifts, quickest to charge, best off-road, lowest top speed, shoved about
  assert.ok(b.rTop < Math.min(c.rTop, h.rTop, r.rTop) * 0.8, 'buggy turns tightest at speed');
  assert.ok(b.drift.radius < Math.min(c.drift.radius, h.drift.radius, r.drift.radius) * 0.75, 'buggy drifts tightest');
  assert.ok(b.drift.l1 < Math.min(c.drift.l1, h.drift.l1, r.drift.l1) * 0.8, 'buggy charges its drift fastest');
  assert.ok(b.grass > Math.max(c.grass, h.grass, r.grass) * 1.3, 'buggy keeps the most speed on grass');
  assert.ok(b.top < Math.min(c.top, h.top, r.top), 'buggy has the lowest top speed');
  assert.ok(b.t25 < Math.min(c.t25, h.t25, r.t25), 'buggy gets to speed quickest');
  // hauler: highest top speed, slowest to accelerate, widest, biggest mini-turbo, hardest to push, worst braking
  assert.ok(h.top > Math.max(c.top, b.top, r.top), 'hauler has the highest top speed');
  assert.ok(h.t25 > Math.max(c.t25, b.t25, r.t25) * 1.2, 'hauler is the slowest off the line');
  assert.ok(h.rTop > c.rTop * 1.3, 'hauler is wide in the corners');
  assert.ok(h.drift.miniSeconds * h.drift.miniPower > Math.max(c.drift.miniSeconds * c.drift.miniPower, b.drift.miniSeconds * b.drift.miniPower, r.drift.miniSeconds * r.drift.miniPower), 'hauler has the biggest mini-turbo');
  assert.ok(h.brake.dist > c.brake.dist * 1.25, 'hauler takes longest to stop');
  const bHb = bump('hauler', 'buggy', {}), bBh = bump('buggy', 'hauler', {});
  assert.ok(bHb.dvA < bHb.dvB * 0.5, `the hauler barely notices the buggy (${bHb.dvA.toFixed(1)} vs ${bHb.dvB.toFixed(1)} m/s)`);
  assert.ok(bHb.staggerA < 0.5 * bHb.staggerB && bBh.staggerA > 0.4, 'the buggy is staggered, the hauler is not');
  // rocket: fast and quick off the line (second only to the buggy), very slippery, hates grass, long drift charge, boosts hardest
  assert.ok(r.top > c.top && r.top < h.top, 'rocket: fast, but the hauler tops it');
  assert.ok(r.t25 < c.t25, 'rocket launches harder than the cruiser');
  assert.ok(r.rTop > c.rTop * 1.25, 'rocket slides wide at speed');
  assert.ok(r.drift.l3 > c.drift.l3 * 1.05, 'rocket takes longer to charge a drift');
  assert.ok(r.grass < c.grass, 'rocket hates the grass');
  const cap = (kartId) => { const k = makeKart(kartId); k.applyBoost(1, 1, 'item'); return k.maxSpeed / k.params.top; };
  assert.ok(cap('rocket') > cap('cruiser') * 1.05, 'boosts hit the rocket 30 % harder');
  // cruiser sits in the middle of every spread
  for (const [what, f] of [['top', (m) => m.top], ['0-25', (m) => m.t25], ['r@top', (m) => m.rTop], ['grass', (m) => m.grass]]) {
    const v = IDS.map((id) => f(M[id])).sort((x, y) => x - y);
    assert.ok(f(c) > v[0] && f(c) < v[3], `cruiser is neither best nor worst at ${what}`);
  }
});

test('kart types: spread table relative to the cruiser stays inside +/-20..30 % on the headline numbers (top speed, acceleration, turning)', () => {
  const sp = spreadVsCruiser({});
  if (process.env.VERBOSE) console.table(sp);
  for (const id of IDS) {
    assert.ok(sp[id].top > 0.93 && sp[id].top < 1.1, `${id} top ${sp[id].top.toFixed(2)}`);
    assert.ok(sp[id].accel > 0.65 && sp[id].accel < 1.4, `${id} accel ${sp[id].accel.toFixed(2)}`);
    assert.ok(sp[id].turnTop > 0.65 && sp[id].turnTop < 1.5, `${id} turn at top ${sp[id].turnTop.toFixed(2)}`);
  }
});

test('kart types: every character x kart combination stays inside the SPEC speed band (30..36.5 m/s) and 0-to-top 1.8..5.4 s', () => {
  for (const c of CHARACTERS) {
    for (const k of KARTS) {
      const top = topSpeed(k.id, { char: c.id }), t = timeToTop(k.id, { char: c.id });
      assert.ok(top >= 30 && top <= 36.5, `${c.id} on ${k.id}: top ${top.toFixed(2)}`);
      assert.ok(t >= 1.8 && t <= 5.4, `${c.id} on ${k.id}: 0-to-top ${t.toFixed(2)}`);
    }
  }
});

test('kart types: the character stats still matter on every kart (a stat-5 speed character is faster than a stat-2 one on the same kart)', () => {
  for (const k of KARTS) {
    const fast = topSpeed(k.id, { char: 'rex' }), slow = topSpeed(k.id, { char: 'tilly' });
    assert.ok(fast > slow + 1.2, `${k.id}: rex ${fast.toFixed(1)} vs tilly ${slow.toFixed(1)}`);
  }
});

test('kart-select ratings are honest: they rank the karts the way the measurements do', () => {
  const R = Object.fromEntries(IDS.map((id) => [id, kartRatings(id)]));
  const params = Object.fromEntries(IDS.map((id) => [id, makeKart(id).params]));
  const metric = {
    grip: (id) => params[id].gripRoad,
    drift: (id) => 1 / M[id].drift.radius,                       // tighter drift arc = better
    turbo: (id) => M[id].drift.miniSeconds * M[id].drift.miniPower * profileFor(id).boost,
    offroad: (id) => M[id].grass,
  };
  for (const key of Object.keys(metric)) {
    for (const a of IDS) {
      assert.ok(R[a][key] >= 1 && R[a][key] <= 5 && Number.isInteger(R[a][key]), `${a}.${key} is 1..5`);
      for (const b of IDS) {
        if (metric[key](a) > metric[key](b) * 1.05) assert.ok(R[a][key] >= R[b][key], `${key}: ${a} (${R[a][key]}) should not rate below ${b} (${R[b][key]})`);
      }
    }
    const vals = IDS.map((id) => R[id][key]);
    assert.ok(Math.max(...vals) - Math.min(...vals) >= 2, `${key} ratings spread over at least two steps`);
  }
});

test('kart-select copy: every kart has a name, a feel line, a trait and a trait description; stat mods stay within +/-2', () => {
  for (const k of KARTS) {
    assert.ok(k.feel && k.feel.length > 20 && k.feel.length < 110, `${k.id} feel line`);
    assert.ok(k.trait && k.traitText && k.blurb);
    for (const key of ['speed', 'accel', 'handling', 'weight']) assert.ok(Math.abs(k.mods[key]) <= 2, `${k.id}.${key}`);
    assert.ok(/[.!?]$/.test(k.feel), `${k.id} feel ends like a sentence`);
  }
  assert.equal(new Set(KARTS.map((k) => k.feel)).size, KARTS.length);
});

test('kart types: the physics reads the kart type from kartId and the kart type changes nothing for unknown ids', () => {
  const t = new FlatTrack();
  const mk = (kartId) => { const k = new KartPhysics(t, { id: 'x', kartId, stats: statsFor('marco', 'cruiser') }); k.teleport(new THREE.Vector3(0, 0, 0), 0); return k; };
  const a = mk('hauler'), b = mk('nonsense'), c = mk('cruiser');
  assert.ok(a.params.gripRoad > c.params.gripRoad * 1.15 && a.params.miniSecs > c.params.miniSecs, 'hauler differs from the cruiser with the same stats');
  assert.deepEqual({ ...b.params, kartId: '' }, { ...c.params, kartId: '' }, 'unknown kart ids behave like the cruiser');
  assert.ok(TUNING.topSpeedMax > TUNING.topSpeedMin);
});
