// Perfect take-off: press the hop (drift key) within 0.25 s before leaving a ramp and the kart gets a small boost, a shove forward and a touch of air.
// Contract: `kart:takeoff { id, perfect, source, vy, isPlayer }` on every take-off, `kart:perfect-jump { id, isPlayer }` on a perfect one.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KartPhysics } from '../src/kart/KartPhysics.js';
import { TUNING } from '../src/kart/kartTuning.js';
import { bus } from '../src/core/bus.js';
import { HillTrack, FlatTrack } from './drive_tracks.js';

const DT = 1 / 60;
const LIP_Z = 60;

/** The ramp fixture with an exact (analytic) surface normal, so a tick that samples right at the lip cannot produce a wild slope. */
class LipTrack extends HillTrack {
  query(pos, out = {}, hint) {
    super.query(pos, out, hint);
    if (pos.x >= 30 && pos.z < 120) {
      if (pos.z >= 40 && pos.z < LIP_Z) { out.normal.set(0, 1, -0.2).normalize(); out.height = (pos.z - 40) * 0.2; }
      else { out.normal.set(0, 1, 0); out.height = 0; }
    }
    return out;
  }
}

function record(names) {
  const events = [];
  const offs = names.map((n) => bus.on(n, (d) => events.push({ name: n, ...d })));
  return { events, stop: () => offs.forEach((f) => f()) };
}

/**
 * Drive a kart up the ramp from a standing start.
 * @param {{ lead?: number|null, hold?: boolean, cls?: number, kartId?: string, isPlayer?: boolean, after?: number, steer?: number }} o
 *   lead = seconds before the lip at which the hop is pressed (null = never); hold = keep the button down afterwards; after = keep driving this long (s) after take-off
 */
function ramp({ lead = null, hold = false, cls = 100, kartId = 'cruiser', isPlayer = false, after = 2, steer = 0 } = {}) {
  const t = new LipTrack({ straight: 800 });
  const k = new KartPhysics(t, { id: 'k', speedClass: cls, kartId, charId: 'marco', stats: { speed: 3, accel: 3, handling: 3, weight: 3 } });
  k.isPlayer = isPlayer;
  k.teleport(new THREE.Vector3(60, 0, 0), 0);
  const rec = record(['kart:takeoff', 'kart:perfect-jump', 'kart:boost']);
  let pressed = false, takeT = null, takeZ = null, endZ = null, vmax = 0, boostAtTake = null, pressedAt = null, boostAfterAir = null;
  for (let i = 0; i < 60 * 12; i++) {
    const v = Math.max(k.vel.z, 1);
    let drift = hold && pressed;
    if (!pressed && lead != null && (LIP_Z - k.pos.z) / v <= lead) { drift = true; pressed = true; pressedAt = k._t; }
    const was = k.grounded;
    k.update(DT, { throttle: 1, brake: 0, steer, drift });
    if (was && !k.grounded && takeT == null && k.pos.z >= LIP_Z - 1) { takeT = k._t; takeZ = k.pos.z; boostAtTake = { time: k.boost.time, power: k.boost.power }; }
    if (takeT != null) {
      vmax = Math.max(vmax, k.speed);
      if (boostAfterAir == null && k.grounded) boostAfterAir = { time: k.boost.time, power: k.boost.power };
      if (k._t - takeT >= after) { endZ = k.pos.z; break; }
    }
  }
  rec.stop();
  return { k, events: rec.events, dist: endZ - takeZ, vmax, boostAtTake, boostAfterAir, takeT, pressedAt, top: k.params.top };
}
const takeoffs = (r) => r.events.filter((e) => e.name === 'kart:takeoff');
const perfects = (r) => r.events.filter((e) => e.name === 'kart:perfect-jump');

test('perfect take-off: the window is 0.25 s before the lip (real seconds), presses outside it are ordinary jumps', () => {
  assert.equal(TUNING.takeoffWindow, 0.25);
  for (const [lead, want] of [[0.6, false], [0.4, false], [0.3, false], [0.22, true], [0.15, true], [0.08, true], [0.03, true], [null, false]]) {
    const r = ramp({ lead });
    assert.equal(takeoffs(r).length, 1, `lead ${lead}: exactly one take-off`);
    assert.equal(takeoffs(r)[0].perfect, want, `lead ${lead}`);
    assert.equal(perfects(r).length, want ? 1 : 0, `lead ${lead}: kart:perfect-jump count`);
    assert.equal(takeoffs(r)[0].source, 'ramp');
    assert.ok(takeoffs(r)[0].vy > TUNING.takeoffMinVy, 'reported vy is the class-normalised launch speed');
  }
});

test('perfect take-off: the window is the same number of real seconds at every speed class (and the take-off happens at every class)', () => {
  for (const cls of [50, 100, 150, 200]) {
    for (const [lead, want] of [[0.45, false], [0.1, true]]) {
      const r = ramp({ lead, cls });
      assert.equal(takeoffs(r).length, 1, `${cls} Mbps lead ${lead}`);
      assert.equal(takeoffs(r)[0].perfect, want, `${cls} Mbps, hop ${lead} s before the lip`);
    }
  }
});

test('perfect take-off: pays a boost (0.5 for 0.9 s), kept until the kart lands, plus a shove forward: 4+ m and a clear speed gain within 2 s', () => {
  for (const cls of [50, 100, 200]) {
    const a = ramp({ lead: 0.1, cls }), b = ramp({ lead: null, cls });
    assert.equal(perfects(a).length, 1);
    const bo = a.events.find((e) => e.name === 'kart:boost');
    assert.ok(bo && bo.kind === 'jump' && Math.abs(bo.power - 0.5) < 1e-9 && Math.abs(bo.duration - 0.9) < 1e-9, JSON.stringify(bo));
    assert.ok(a.boostAtTake.time > 0.85 && a.boostAtTake.power === 0.5, `boost is live at take-off ${JSON.stringify(a.boostAtTake)}`);
    assert.ok(a.boostAfterAir.time > 0.85, `the clock waited for the landing (${a.boostAfterAir.time.toFixed(2)} s left on touchdown)`);
    assert.equal(b.events.filter((e) => e.name === 'kart:boost').length, 0, 'no boost without the perfect press');
    const gain = a.dist - b.dist;
    assert.ok(gain > 4, `${cls} Mbps: +${gain.toFixed(1)} m over 2 s`);
    assert.ok(gain < 16 * (cls / 100) + 2, `a little boost, not a rocket (+${gain.toFixed(1)} m)`);
    assert.ok(a.vmax > b.vmax + 2 * (cls / 100), `peak speed ${a.vmax.toFixed(1)} vs ${b.vmax.toFixed(1)}`);
    assert.ok(a.vmax < a.top * 1.3, 'the boosted cap is 14 % above top speed plus the shove, never beyond');
  }
});

test('perfect take-off: a touch more air than an ordinary jump, and the boost ends after 0.9 s on the ground', () => {
  const a = ramp({ lead: 0.1, after: 4 }), b = ramp({ lead: null, after: 4 });
  assert.ok(a.k.boost.time === 0 && a.k.boost.power === 0, 'boost over after 4 s');
  assert.ok(a.vmax > b.vmax);
  // vertical speed right after the lip is 6 % higher
  const vy = (lead) => {
    const t = new LipTrack({ straight: 800 }), k = new KartPhysics(t, { id: 'v' });
    k.teleport(new THREE.Vector3(60, 0, 0), 0);
    let done = null;
    for (let i = 0; i < 60 * 10 && done == null; i++) {
      const v = Math.max(k.vel.z, 1);
      const was = k.grounded;
      k.update(DT, { throttle: 1, drift: lead != null && (LIP_Z - k.pos.z) / v <= lead && (LIP_Z - k.pos.z) / v > lead - 0.05 });
      if (was && !k.grounded) done = k.vel.y;
    }
    return done;
  };
  assert.ok(Math.abs(vy(0.1) / vy(null) - TUNING.perfectJumpAir) < 0.02, `${vy(0.1)} vs ${vy(null)}`);
});

test('perfect take-off: a button held since long before the ramp is not a press; a press after take-off is too late', () => {
  const held = ramp({ lead: 1.5, hold: true });
  assert.equal(takeoffs(held)[0].perfect, false, 'held for 1.5 s: the press was long ago');
  // late: press 0.2 s after leaving the lip
  const t = new LipTrack({ straight: 800 }), k = new KartPhysics(t, { id: 'late' });
  k.teleport(new THREE.Vector3(60, 0, 0), 0);
  const rec = record(['kart:takeoff', 'kart:perfect-jump', 'kart:boost']);
  let tk = null;
  for (let i = 0; i < 60 * 6; i++) {
    const was = k.grounded;
    k.update(DT, { throttle: 1, drift: tk != null && k._t - tk > 0.2 && k._t - tk < 0.4 });
    if (was && !k.grounded && tk == null && k.pos.z > LIP_Z - 1) tk = k._t;
  }
  rec.stop();
  const tks = rec.events.filter((e) => e.name === 'kart:takeoff');
  assert.equal(tks.length, 1); assert.equal(tks[0].perfect, false);
  assert.equal(rec.events.filter((e) => e.name === 'kart:perfect-jump' || e.name === 'kart:boost').length, 0, 'a late press buys nothing');
});

test('perfect take-off: one press pays once; the landing and later bounces are not take-offs', () => {
  const r = ramp({ lead: 0.1, after: 5 });
  assert.equal(takeoffs(r).length, 1);
  assert.equal(perfects(r).length, 1);
  assert.equal(r.events.filter((e) => e.name === 'kart:boost').length, 1);
});

test('perfect take-off: the plain hop on flat ground and spin-out hops are not take-offs', () => {
  const t = new FlatTrack(), k = new KartPhysics(t, { id: 'f' });
  k.teleport(new THREE.Vector3(0, 0, 0), 0);
  const rec = record(['kart:takeoff', 'kart:perfect-jump']);
  for (let i = 0; i < 60 * 4; i++) k.update(DT, { throttle: 1 });
  for (let i = 0; i < 40; i++) k.update(DT, { throttle: 1, steer: 0.5, drift: true });      // hop + drift
  for (let i = 0; i < 40; i++) k.update(DT, { throttle: 1 });
  k.spinOut(1.0);                                                                              // spin hop
  for (let i = 0; i < 120; i++) k.update(DT, { throttle: 1 });
  rec.stop();
  assert.equal(rec.events.length, 0, JSON.stringify(rec.events));
});

test('perfect take-off: launch() is a take-off too (source is passed on), and a recent hop press makes it perfect', () => {
  const mk = () => { const k = new KartPhysics(new FlatTrack(), { id: 'l' }); k.teleport(new THREE.Vector3(0, 0, 0), 0); for (let i = 0; i < 60 * 4; i++) k.update(DT, { throttle: 1 }); return k; };
  const rec = record(['kart:takeoff', 'kart:perfect-jump']);
  const a = mk(); a.launch(9, { source: 'pad' });
  const b = mk(); b.update(DT, { throttle: 1, drift: true }); b.update(DT, { throttle: 1, drift: false });   // hop pressed 2 ticks ago (the hop pop is not a take-off)
  b.grounded = true; b.launch(9, { source: 'vehicle' });
  const c = mk(); c.launch(0.3);                                                                                // too small to count
  rec.stop();
  const tk = rec.events.filter((e) => e.name === 'kart:takeoff');
  assert.equal(tk.length, 2);
  assert.deepEqual([tk[0].source, tk[0].perfect], ['pad', false]);
  assert.deepEqual([tk[1].source, tk[1].perfect], ['vehicle', true]);
  assert.equal(rec.events.filter((e) => e.name === 'kart:perfect-jump').length, 1);
});

test('perfect take-off: events carry the kart id and isPlayer, and a fallen or spinning kart never gets the reward', () => {
  const r = ramp({ lead: 0.1, isPlayer: true });
  assert.ok(takeoffs(r)[0].isPlayer === true && perfects(r)[0].isPlayer === true);
  assert.equal(perfects(r)[0].id, 'k');
  const r2 = ramp({ lead: 0.1, isPlayer: false });
  assert.equal(perfects(r2)[0].isPlayer, false);
  // spinning: hit just after the press
  const t = new LipTrack({ straight: 800 }), k = new KartPhysics(t, { id: 's' });
  k.teleport(new THREE.Vector3(60, 0, 0), 0);
  const rec = record(['kart:perfect-jump']);
  for (let i = 0; i < 60 * 8; i++) {
    const v = Math.max(k.vel.z, 1), lead = (LIP_Z - k.pos.z) / v;
    k.update(DT, { throttle: 1, drift: lead < 0.12 && lead > 0.08 });
    if (lead < 0.08 && lead > 0.06) k.spinOut(1.2);
  }
  rec.stop();
  assert.equal(rec.events.length, 0, 'spinning at the lip: no reward');
});

test('perfect take-off: every kart type gets it, and the boost keeps the kart type\'s own strength (the rocket boosts hardest)', () => {
  const gains = {};
  for (const kartId of ['cruiser', 'buggy', 'hauler', 'rocket']) {
    const a = ramp({ lead: 0.1, kartId }), b = ramp({ lead: null, kartId });
    assert.equal(perfects(a).length, 1, kartId);
    gains[kartId] = a.vmax - b.vmax;
    assert.ok(gains[kartId] > 2, `${kartId} +${gains[kartId].toFixed(1)} m/s`);
  }
  assert.ok(gains.rocket >= gains.cruiser && gains.rocket > gains.hauler, JSON.stringify(gains));
});
