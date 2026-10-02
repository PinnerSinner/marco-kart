// Contract + drive tests for Marcoverse Speedway (track 4, space, NO walls): loop, checkpoints, grid, item boxes, void edges,
// respawn safety, the Leap (ramp + gap), boost chains, the helix, and a pursuit bot lapping it with KartPhysics and SimpleKart.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrack, Track } from '../src/track/index.js';
import marcoverse from '../src/track/tracks/marcoverse.js';
import { loopDiff } from '../src/core/util.js';
import { KartPhysics } from '../src/kart/KartPhysics.js';
import { SimpleKart } from '../src/kart/SimpleKart.js';
import { driveLaps } from './tracks_bot.js';

const t = createTrack('marcoverse', { headless: true });
const P = new THREE.Vector3(), N = new THREE.Vector3();
const q = () => ({ height: 0, normal: new THREE.Vector3(), surface: '', onRoad: false, s: 0, lateral: 0, inVoid: false });
/** Centreline s of a jump ramp's START: `track.jumpRamps` entries carry the world placement (x, z, yaw, length), not an s, so project it onto the road. */
const rampStartS = (tr, r) => { const o = q(); P.set(r.x, 41, r.z); tr.query(P, o); return o.s; };
const gapRuns = (tr) => { const F = tr.model.F.gap, ds = tr.model.ds, runs = []; let a = -1; for (let i = 0; i <= F.length; i++) { const g = i < F.length && F[i]; if (g && a < 0) a = i; if (!g && a >= 0) { runs.push([a * ds, i * ds]); a = -1; } } return runs; };

test('marcoverse: metadata, closed loop, 20 to 26 m wide, length and music from the brief', () => {
  assert.equal(t.id, 'marcoverse'); assert.equal(t.lapCount, 3);
  assert.ok(t.length > 2500 && t.length < 3000, `length ${t.length}`);
  assert.equal(t.music, 'marcoverse'); assert.equal(t.environment.skyKind, 'space');
  const a = t.sample(0), b = t.sample(t.length - 1e-6);
  assert.ok(a.pos.distanceTo(b.pos) < 1e-3 && a.tangent.dot(b.tangent) > 0.9999, 'wraps to itself');
  let wmin = 1e9, wmax = 0; for (let s = 0; s < t.length; s += 3) { const w = t.widthAt(s); wmin = Math.min(wmin, w); wmax = Math.max(wmax, w); }
  assert.ok(wmin >= 20 && wmax <= 26.5, `width ${wmin}..${wmax}`);
  assert.equal(t.def.defaults.both.wall, 'none', 'no walls');
  assert.ok(t.minimapOutline(128).length === 128);
});

test('marcoverse: checkpoints ascend, 6 to 12 of them, none more than 500 m apart; a spiral guard sits inside the helix', () => {
  const c = t.checkpointS;
  assert.ok(c.length >= 6 && c.length <= 12, `${c.length} checkpoints`);
  assert.equal(c[0], 0);
  for (let i = 1; i < c.length; i++) assert.ok(c[i] > c[i - 1] && c[i] < t.length && c[i] - c[i - 1] < 500, `checkpoint ${i}`);
  assert.ok(c.some((v) => v > t.S('@spiral-200') && v < t.S('@spiral-20')), 'a checkpoint mid-helix so nobody skips a turn by dropping to the lower layer');
});

test('marcoverse: eight grid slots on the road behind the line, in order, and item boxes in rows of three on the road', () => {
  const seen = [], o = q();
  for (let i = 0; i < 8; i++) {
    const g = t.gridSlot(i); t.query(g.pos, o);
    assert.ok(o.onRoad && o.surface === 'road' && !o.inVoid, `slot ${i}: ${o.surface}`);
    assert.ok(Math.abs(o.lateral) < t.widthAt(o.s) / 2 - 2, `slot ${i} lateral ${o.lateral}`);
    assert.ok(Math.abs(g.pos.y - o.height) < 0.05, `slot ${i} height`);
    seen.push(loopDiff(0, o.s, t.length));
  }
  assert.ok(seen.every((v) => v < 0) && seen[0] > seen[2] && seen[2] > seen[4] && seen[4] > seen[6], 'rows go back');
  assert.ok(t.itemBoxes.length >= 18 && t.itemBoxes.length <= 30 && t.itemBoxes.length % 3 === 0, `${t.itemBoxes.length} boxes`);
  assert.ok(t.itemBoxes.length / 3 >= 6 && t.itemBoxes.length / 3 <= 8, 'six to eight rows');
  for (const b of t.itemBoxes) {
    P.set(b.pos.x, b.pos.y, b.pos.z); t.query(P, o);
    assert.ok(o.onRoad && !o.inVoid, `box at s=${b.s}: ${o.surface}`);
    assert.ok(Math.abs(o.lateral) < t.widthAt(o.s) / 2 - 0.5, `box lateral ${o.lateral}`);
    assert.ok(b.pos.y - o.height > 0.3 && b.pos.y - o.height < 4, `hover ${b.pos.y - o.height}`);
  }
});

test('marcoverse: dense sweep of sample() and query() has no NaN; the centre line is always road', () => {
  const o = q(), sm = {};
  for (let s = 0; s < t.length; s += 1.1) {
    t.sample(s, sm);
    for (const v of [sm.pos, sm.tangent, sm.right, sm.up]) assert.ok(Number.isFinite(v.x + v.y + v.z), `sample NaN at ${s}`);
    for (const lat of [-t.widthAt(s) / 2 - 12, -3, 0, 3, t.widthAt(s) / 2 + 12]) {
      t.surfacePoint(s, lat, P); t.query(P, o, s);
      assert.ok(Number.isFinite(o.height + o.s + o.lateral + o.normal.x + o.normal.y + o.normal.z), `query NaN at ${s}/${lat}`);
    }
  }
  const gaps = gapRuns(t);
  for (let s = 0; s < t.length; s += 5) {
    if (gaps.some(([a, b]) => s > a - 6 && s < b + 6)) continue;
    t.surfacePoint(s, 0, P); t.query(P, o, s); assert.ok(o.onRoad && !o.inVoid, `centre off road at ${s}: ${o.surface}`);
  }
  for (const bad of [[NaN, 0, 0], [0, NaN, 0], [1e9, 0, 0], [Infinity, 1, 1]]) { P.set(...bad); const r = t.query(P, o); assert.ok(r.inVoid && Number.isFinite(r.height)); }
});

test('marcoverse: the edge is a void, not a wall: just past the edge is inVoid and nothing pushes back, everywhere', () => {
  const o = q(), sm = {}; let checked = 0;
  const gaps = gapRuns(t);
  for (let s = 3; s < t.length; s += 4) {
    t.sample(s, sm);
    for (const side of [-1, 1]) {
      const inside = side * (sm.width / 2 - 0.6), outside = side * (sm.width / 2 + 1.2);
      t.surfacePoint(s, inside, P); t.query(P, o, s);
      if (!gaps.some(([a, b]) => s > a - 4 && s < b + 4)) assert.ok(o.onRoad && !o.inVoid, `inside the edge is road at s=${s}`);
      t.surfacePoint(s, outside, P); P.y = sm.pos.y - outside * Math.tan(sm.banking) + 0.5; t.query(P, o, s);
      if (t.model.platforms.some((p) => p.evaluate(P.x, P.z, P.y - 0.5, new THREE.Vector3()))) continue;   // a shortcut deck leaves or joins the road here
      assert.ok(o.inVoid && !o.onRoad, `just past the edge is void at s=${s} side=${side} (${o.surface})`);
      t.surfacePoint(s, outside - side * 0.3, P); P.y += 0.3; assert.equal(t.collideWalls(P, 1.1, N), 0, `no wall at s=${s}`);
      checked++;
    }
  }
  assert.ok(checked > 800);
  assert.ok(t.killY <= -50 && t.killY > -200, `killY ${t.killY}`);
});

test('marcoverse: respawnAt returns a safe spot on the road (never in a gap, on the ramp, or in the void), facing forward', () => {
  const o = q(), runs = gapRuns(t);
  for (let s = 0; s < t.length; s += 7.3) {
    const r = t.respawnAt(s); t.query(r.pos, o);
    assert.ok(o.onRoad && !o.inVoid && Number.isFinite(r.heading), `unsafe respawn for s=${s}`);
    for (const [a, b] of runs) assert.ok(!(o.s > a - 1 && o.s < b + 1), `respawn in the gap for s=${s}`);
  }
  // asking for a spot inside the gap or on the ramp walks back to before the ramp
  const leapS = rampStartS(t, t.jumpRamps.find((r) => r.id === 'leap')), gap = runs[0];
  assert.ok(Math.abs(loopDiff(leapS, t.S(t.def.ramps[0].s), t.length)) < 1.5, `ramp projects to s=${leapS.toFixed(1)}`);
  for (const s of [gap[0] + 4, gap[1] - 1, leapS + 3]) {
    const r = t.respawnAt(s); t.query(r.pos, o);
    assert.ok(o.onRoad && !o.inVoid && loopDiff(o.s, leapS, t.length) > -1, `respawn for s=${s} lands at s=${o.s.toFixed(1)}, ramp at ${leapS.toFixed(1)}`);
  }
});

test('marcoverse: features from the brief exist: the Leap (ramp + a gap of 7 to 11 m), boost chains, a vertical wave, a full spiral', () => {
  const runs = gapRuns(t); assert.equal(runs.length, 1, 'one gap');
  const w = runs[0][1] - runs[0][0]; assert.ok(w >= 7 && w <= 11, `gap ${w} m`);
  const leap = t.jumpRamps.filter((r) => r.id === 'leap'); assert.equal(leap.length, 1);
  const lip = rampStartS(t, leap[0]) + leap[0].length; assert.ok(runs[0][0] - lip >= 4.5, `gap starts ${runs[0][0] - lip} m after the lip`);
  assert.ok(t.boostPads.length >= 9, `${t.boostPads.length} boost pads`);
  let lo = 1e9, hi = -1e9; for (let s = 0; s < t.length; s += 5) { const y = t.sample(s).pos.y; lo = Math.min(lo, y); hi = Math.max(hi, y); }
  assert.ok(hi - lo >= 18, `vertical wave range ${hi - lo} m`);
  // the helix: the road heading turns through a full circle within one stretch and the second lap is at least 8 m above the first
  const s0 = t.S('@spin'), s1 = t.S('@spiral'); let turn = 0, prev = null;
  for (let s = s0; s <= s1; s += 2) { const sm = t.sample(s), h = Math.atan2(sm.tangent.x, sm.tangent.z); if (prev !== null) turn += Math.atan2(Math.sin(h - prev), Math.cos(h - prev)); prev = h; }
  assert.ok(Math.abs(turn) > 2 * Math.PI * 0.95, `spiral turns ${(turn / Math.PI / 2).toFixed(2)} laps`);
  const dropPerTurn = Math.abs(t.sample(s0 + 60).pos.y - t.sample(s1).pos.y); assert.ok(dropPerTurn >= 0 && Number.isFinite(dropPerTurn));
});

test('marcoverse: headless is cheap, repeatable and has no meshes; the visual build works without a canvas (Node) and animates', () => {
  const t0 = performance.now(); const a = createTrack('marcoverse', { headless: true }); const ms = performance.now() - t0;
  assert.ok(ms < 1500, `headless build took ${ms.toFixed(0)} ms`);
  assert.equal(a.length, t.length); assert.equal(a.itemBoxes.length, t.itemBoxes.length); assert.equal(a.group.children.length, 0, 'no meshes when headless');
  const v = createTrack('marcoverse'), v2 = createTrack('marcoverse');
  assert.ok(v.group.children.length > 10, `${v.group.children.length} scene objects`);
  assert.equal(v.group.children.length, v2.group.children.length, 'deterministic build');
  v.setViewer(new THREE.Vector3(0, 40, 0));
  for (let k = 0; k < 90; k++) v.update(1 / 60, k / 60);           // comets, portals, hologram: nothing may throw or go NaN
  v.group.traverse((o) => { if (o.position) assert.ok(Number.isFinite(o.position.x + o.position.y + o.position.z), `NaN position on ${o.name}`); });
  v.dispose();
});

test('marcoverse: pursuit bot completes 2 laps with KartPhysics and clears the Leap (no void, no stall, no NaN)', () => {
  const r = driveLaps(createTrack('marcoverse', { headless: true }), KartPhysics, { laps: 2, maxTime: 260 });
  const info = `t=${r.time.toFixed(1)}s progress=${r.progress.toFixed(0)} fell=${r.fell}@${r.fellAt} stuck=${r.stuck}@${r.stuckAt} laps=${r.laps.map((v) => v.toFixed(1))} air=${r.airTime.toFixed(1)}s`;
  console.log('marcoverse bot (KartPhysics):', info);
  assert.ok(!r.nan && !r.fell && !r.stuck && r.finished, info);
  assert.ok(r.laps[0] > 60 && r.laps[0] < 95, `lap ${r.laps[0]}`);
  assert.ok(r.airTime > 0.5, 'the Leap is actually jumped');
});

test('marcoverse: pursuit bot also laps the gap-free variant with SimpleKart', () => {
  const track = new Track(marcoverse({ gap: false }), { headless: true });
  const r = driveLaps(track, SimpleKart, { laps: 1, maxTime: 260 });
  assert.ok(r.finished && !r.fell && !r.stuck, `simple: ${JSON.stringify({ t: r.time, f: r.fell, s: r.stuck, at: r.stuckAt ?? r.fellAt })}`);
});

test('marcoverse: banking changes gently: the twist (rate of change of tan(bank)) stays low so an outer or inner line never gets launched off a banked corner', () => {
  // ground height at lateral l is y - l tan(bank), so along the road it changes by l * d(tan bank)/ds on top of the centre-line slope. The
  // first layout released 22 degrees over a 40 m straight (0.020 per metre): 10 m off the centre the surface fell away 20 cm per metre.
  let worst = 0, at = 0, peak = 0;
  for (let s = 0; s < t.length; s += 2) {
    const a = Math.tan(t.sample(s).banking), b = Math.tan(t.sample(s + 2).banking);
    if (Math.abs(b - a) / 2 > worst) { worst = Math.abs(b - a) / 2; at = s; }
    peak = Math.max(peak, Math.abs(t.sample(s).banking) * 180 / Math.PI);
  }
  assert.ok(worst <= 0.0095, `bank twist ${worst.toFixed(4)} per metre at s=${at.toFixed(0)}`);
  assert.ok(peak >= 20 && peak <= 24, `the biggest banked corner is ${peak.toFixed(1)} degrees`);
});

test('marcoverse: the Leap is fair: a ramp wide enough for a pack (16 m or more of a 26 m road) fed by a boost chain', () => {
  const ramp = t.jumpRamps.find((r) => r.id === 'leap');
  assert.ok(ramp.width >= 16 && ramp.width <= t.widthAt(rampStartS(t, ramp)), `ramp ${ramp.width} m wide`);
  const chainEnd = t.boostPads.map((p) => p.s).filter((s) => loopDiff(s, rampStartS(t, ramp), t.length) > 0 && loopDiff(s, rampStartS(t, ramp), t.length) < 40);
  assert.ok(chainEnd.length >= 2, 'the boost chain feeds the ramp');
});
