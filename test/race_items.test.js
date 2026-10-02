import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERAL_ITEM_IDS as ITEM_IDS } from '../src/core/config.js';
import { makeRng } from '../src/core/util.js';
import { ITEM_DEFS, itemWeights, pickItem } from '../src/race/itemDefs.js';
import { DT, makeRace, runUntil, skipCountdown, recordEvents, place, freezeOthers } from './race_helpers.js';

const IDLE = { throttle: 0, brake: 0, steer: 0, drift: false };

/** A race with the human plus frozen rivals, past the countdown. Places are set with `line()`. */
function scenario(n = 8, seed = 1) {
  const race = makeRace({ human: 'marco', n, seed });
  freezeOthers(race, race.player);
  skipCountdown(race);
  return race;
}

/**
 * Lines racers up on the first straight: entries [racer, s, lateral]. One step later the places are ranked by s.
 * @returns {void}
 */
function line(race, entries) {
  for (const [r, s, lat = 0] of entries) place(race, r, s, lat);
  race.step(DT, IDLE);
}

const rivals = (race) => race.racers.filter((r) => !r.isPlayer);
const press = (race, actions = {}, input = IDLE) => race.step(DT, input, { itemPressed: true, ...actions });

test('cable: dropped behind, static, spins whoever drives into it (not its owner straight away)', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 40], [a, 5]]);
  const ev = recordEvents(['item:use', 'item:hit', 'kart:spin'], race);
  race.items.give(me, 'cable');
  press(race);
  assert.equal(race.items.entities.length, 1);
  const c = race.items.entities[0];
  assert.equal(c.type, 'cable'); assert.equal(c.ownerId, 'marco'); assert.equal(c.state, 'armed');
  assert.ok(c.pos.z < me.kart.pos.z - 1.5, 'behind the kart');
  assert.equal(me.item, null);
  assert.equal(ev.of('item:use')[0].data.item, 'cable');
  assert.equal(me.kart.status.spin, 0, 'the owner is not hit by their own drop');
  // the rival drives into it
  place(race, a, c.pos.z - 25, 0); a.kart.pos.x = c.pos.x;
  a.control = () => {};
  runUntil(race, () => ev.of('item:hit').length > 0, 4, IDLE, undefined);
  a.control = (r, dt, inp) => { inp.throttle = 1; };
  runUntil(race, () => ev.of('item:hit').length > 0, 6, IDLE);
  ev.off();
  assert.equal(ev.of('item:hit')[0].data.victimId, a.id);
  assert.equal(ev.of('item:hit')[0].data.byId, 'marco');
  assert.equal(ev.of('item:hit')[0].data.item, 'cable');
  assert.equal(ev.of('kart:spin')[0].data.id, a.id);
  assert.equal(race.items.entities.length, 0, 'the cable is consumed');
});

test('cable: thrown forward lands and arms; a ping destroys a cable; cables time out', () => {
  const race = scenario(2);
  const me = race.player;
  line(race, [[me, 30]]);
  race.items.give(me, 'cable');
  press(race, { aimForward: true });
  const c = race.items.entities[0];
  assert.equal(c.state, 'thrown');
  assert.ok(c.pos.z > me.kart.pos.z, 'thrown ahead');
  runUntil(race, () => c.state === 'armed', 3, IDLE);
  assert.equal(c.state, 'armed');
  assert.ok(c.pos.z > me.kart.pos.z + 5);
  // ping into the cable
  race.items.give(me, 'ping');
  const ev = recordEvents(['item:expire'], race);
  press(race);
  runUntil(race, () => race.items.entities.length === 0, 3, IDLE);
  assert.equal(race.items.entities.length, 0, 'ping and cable both gone');
  assert.equal(ev.of('item:expire').length, 2);
  // timeout
  race.items.give(me, 'cable');
  press(race, { aimBack: true });
  assert.equal(race.items.entities.length, 1);
  runUntil(race, () => race.items.entities.length === 0, ITEM_DEFS.cable.lifetime + 5, { throttle: 0, brake: 0, steer: 0, drift: false });
  assert.equal(race.items.entities.length, 0);
  ev.off();
});

test('ping: fast straight projectile that spins the first racer it touches', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 20], [a, 90]]);
  const ev = recordEvents(['item:hit', 'item:expire'], race);
  race.items.give(me, 'ping');
  press(race);
  const p = race.items.entities[0];
  assert.equal(p.type, 'ping');
  assert.ok(Math.hypot(p.vel.x, p.vel.z) >= 60, 'fast');
  assert.ok(p.vel.z > 0, 'straight ahead');
  runUntil(race, () => ev.of('item:hit').length > 0, 3, IDLE);
  assert.equal(ev.of('item:hit')[0].data.victimId, a.id);
  assert.ok(a.kart.status.spin > 1.0);
  assert.equal(race.items.entities.length, 0);
  ev.off();
});

test('ping: bounces off walls exactly 3 times, then expires on the next wall contact', () => {
  const race = scenario(1);
  const me = race.player;
  line(race, [[me, 60]]);
  me.kart.yaw = -Math.PI / 2 + 0.25;                 // aim across the road at the wall on the +x side, slightly forward
  race.items.give(me, 'ping');
  press(race);
  const p = race.items.entities[0];
  const seen = new Set([0]);
  const ev = recordEvents(['item:expire'], race);
  let steps = 0;
  while (race.items.entities.includes(p) && steps++ < 600) { race.step(DT, IDLE); seen.add(p.bounces); }
  assert.equal(ev.of('item:expire').length, 1);
  assert.ok(steps < 600, 'expires');
  assert.ok(Math.max(...seen) <= 3, `bounced ${Math.max(...seen)} times`);
  assert.equal(Math.max(...seen), 3, 'reflects three times before expiring');
  ev.off();
});

test('ping: aiming back (brake held while pressing use) fires it backwards', () => {
  const race = scenario(2);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 90], [a, 30]]);
  race.items.give(me, 'ping');
  const ev = recordEvents(['item:hit'], race);
  press(race, { aimBack: true });
  assert.ok(race.items.entities[0].vel.z < 0);
  runUntil(race, () => ev.of('item:hit').length > 0, 3, IDLE);
  assert.equal(ev.of('item:hit')[0].data.victimId, a.id);
  ev.off();
});

test('traceroute: homes along the road spline around a bend and reaches the racer directly ahead', () => {
  const race = scenario(4);
  const [me, a, b] = rivals(race).slice(0, 2).length ? [race.player, ...rivals(race).slice(0, 2)] : [];
  // the racer directly ahead is `a` (mid-bend), `b` further on; `me` is on the straight
  line(race, [[me, 40], [a, 250], [b, 330]]);
  assert.ok(me.place > a.place && a.place > b.place);
  race.items.give(me, 'traceroute');
  const ev = recordEvents(['item:hit'], race);
  press(race);
  const t = race.items.entities[0];
  assert.equal(t.type, 'traceroute'); assert.equal(t.targetId, a.id);
  let maxLat = 0;
  runUntil(race, () => { maxLat = Math.max(maxLat, Math.abs(race.track.query(t.pos, {}).lateral)); return ev.of('item:hit').length > 0 || !race.items.entities.includes(t); }, 8, IDLE);
  ev.off();
  assert.equal(ev.of('item:hit').length, 1);
  assert.equal(ev.of('item:hit')[0].data.victimId, a.id, 'hit the racer directly ahead, not the leader');
  assert.equal(ev.of('item:hit')[0].data.item, 'traceroute');
  assert.ok(maxLat < 30, 'stayed with the road');
  assert.ok(race.time < 12);
});

test('traceroute: the leader fires it blind along the road (no target) and it eventually expires', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 90], [a, 20]]);
  assert.equal(me.place, 1);
  race.items.give(me, 'traceroute');
  const ev = recordEvents(['item:use', 'item:expire'], race);
  press(race);
  assert.equal(race.items.entities.length, 1);
  assert.equal(race.items.entities[0].targetId, null);
  runUntil(race, () => race.items.entities.length === 0, ITEM_DEFS.traceroute.lifetime + 2, IDLE);
  assert.equal(ev.of('item:expire').length, 1);
  ev.off();
});

test('espresso: instant boost of 1.2 s, then the slot empties', () => {
  const race = scenario(2);
  const me = race.player;
  line(race, [[me, 30]]);
  const ev = recordEvents(['kart:boost', 'item:use'], race);
  race.items.give(me, 'espresso');
  assert.equal(me.item.count, 1);
  press(race);
  const b = ev.of('kart:boost').find((e) => e.data.id === 'marco');
  assert.equal(b.data.duration, 1.2); assert.equal(b.data.kind, 'item');
  assert.ok(me.kart.boost.time > 1.1);
  assert.equal(me.item, null);
  assert.equal(ev.of('item:use').filter((e) => e.data.item === 'espresso').length, 1);
  ev.off();
});

test('sudo: 8 s of invincibility with a speed bonus; rivals that touch it are knocked aside; projectiles are blocked', () => {
  const race = scenario(3);
  const [me, a, b] = [race.player, ...rivals(race).slice(0, 2)];
  line(race, [[me, 40, 0], [a, 40, 2.6], [b, 120]]);
  race.items.give(me, 'sudo');
  const ev = recordEvents(['item:hit', 'item:block', 'kart:boost'], race);
  press(race);
  assert.ok(me.kart.status.invincible > 7.9);
  assert.ok(me.kart.boost.time > 7.5, 'speed bonus for the whole duration');
  runUntil(race, () => ev.of('item:hit').length > 0, 2, IDLE);
  assert.equal(ev.of('item:hit')[0].data.victimId, a.id);
  assert.equal(ev.of('item:hit')[0].data.item, 'sudo');
  assert.ok(a.kart.status.spin > 0);
  // a ping from behind is blocked (b fires backwards at me)
  place(race, me, 60); place(race, b, 100);
  race.items.give(b, 'ping');
  race.items.use(b, { aimBack: true });
  runUntil(race, () => ev.of('item:block').length > 0, 2, IDLE);
  assert.equal(ev.of('item:block')[0].data.id, 'marco');
  assert.ok(me.kart.status.spin === 0);
  runUntil(race, () => me.kart.status.invincible === 0, 9, IDLE);
  assert.equal(me.sudo, 0);
  ev.off();
});

test('firewall: a shield for 10 s that absorbs exactly one hit; pressing use with an empty slot shakes it off', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 60], [a, 5]]);
  race.items.give(me, 'firewall');
  const ev = recordEvents(['item:block', 'item:hit', 'item:use'], race);
  press(race);
  assert.equal(me.shield, true);
  assert.equal(race.getHud().shield, true);
  // first ping is absorbed
  race.items.give(a, 'ping'); race.items.use(a, {});
  runUntil(race, () => ev.of('item:block').length > 0, 3, IDLE);
  assert.equal(ev.of('item:block').length, 1);
  assert.equal(me.shield, false);
  assert.equal(me.kart.status.spin, 0);
  assert.equal(ev.of('item:hit').length, 0);
  // the second one connects
  place(race, a, 5);
  race.items.give(a, 'ping'); race.items.use(a, {});
  runUntil(race, () => ev.of('item:hit').length > 0, 3, IDLE);
  assert.equal(ev.of('item:hit')[0].data.victimId, 'marco');
  // shaking off: new shield, then use with an empty slot
  runUntil(race, () => me.kart.status.spin === 0 && me.kart.status.invincible === 0, 5, IDLE);
  race.items.give(me, 'firewall'); press(race);
  assert.equal(me.shield, true);
  press(race);
  assert.equal(me.shield, false);
  assert.ok(ev.of('item:use').some((e) => e.data.shake === true));
  // expiry
  race.items.give(me, 'firewall'); press(race);
  runUntil(race, () => !me.shield, 11, IDLE);
  assert.ok(race.time > 10 && me.shield === false);
  ev.off();
});

test('fibre: AutoDriver drives at 1.6x boost, ignores the human input, keeps the kart on the road, then hands control back', () => {
  const race = scenario(2);
  const me = race.player;
  line(race, [[me, 20]]);
  runUntil(race, () => me.kart.speed > 25, 8, () => ({ throttle: 1, brake: 0, steer: 0, drift: false }));
  const ev = recordEvents(['kart:boost', 'item:use'], race);
  race.items.give(me, 'fibre');
  const hostile = { throttle: 0, brake: 1, steer: 1, drift: true };      // would be a disaster if it were obeyed
  press(race, {}, hostile);
  assert.equal(me.kart.status.autopilot, true);
  const fb = ev.of('kart:boost').find((e) => e.data.kind === 'fibre');
  assert.equal(fb.data.power, 1.6); assert.equal(fb.data.duration, 4.5);
  assert.ok(me.kart.status.invincible >= 4.5);
  let vmax = 0, maxLat = 0;
  const t0 = race.time;
  while (me.kart.status.autopilot && race.time - t0 < 6) {
    race.step(DT, hostile);
    vmax = Math.max(vmax, me.kart.speed); maxLat = Math.max(maxLat, Math.abs(me.kart.ground.lateral));
  }
  assert.ok(race.time - t0 > 4.4 && race.time - t0 < 4.7, `lasted ${race.time - t0}`);
  assert.ok(vmax > 38, `fibre speed ${vmax}`);
  assert.ok(maxLat < 8, `stayed on the racing line (max lateral ${maxLat})`);
  assert.equal(me.fibre, 0);
  // control returns: the hostile input now takes effect (brake)
  for (let i = 0; i < 90; i++) race.step(DT, { throttle: 0, brake: 1, steer: 0, drift: false });
  assert.ok(me.kart.speed < 20);
  ev.off();
});

test('outage: only racers AHEAD of the user shrink for 7 s and drop their held item; the ones behind are untouched', () => {
  const race = scenario(6, 3);
  const me = race.player;
  const others = rivals(race);
  // me in 4th: three ahead (others 0..2), two behind (3..4)
  line(race, [[others[0], 100], [others[1], 86], [others[2], 72], [me, 58], [others[3], 44], [others[4], 30]]);
  assert.equal(me.place, 4);
  for (const r of others) race.items.give(r, 'ping');
  race.items.give(me, 'outage');
  const ev = recordEvents(['kart:shrink', 'item:hit', 'item:use'], race);
  press(race);
  const shrunk = ev.of('kart:shrink').map((e) => e.data.id).sort();
  assert.deepEqual(shrunk, [others[0].id, others[1].id, others[2].id].sort());
  for (const r of others.slice(0, 3)) { assert.ok(r.kart.status.stun > 6.9, `${r.id} stun`); assert.equal(r.item, null, 'drops the held item'); }
  for (const r of others.slice(3, 5)) { assert.equal(r.kart.status.stun, 0); assert.ok(r.item, 'unaffected racer keeps its item'); }
  assert.equal(me.kart.status.stun, 0);
  assert.equal(ev.of('kart:shrink')[0].data.seconds, 7);
  ev.off();
});

test('outage: a firewall absorbs it; the leader using it affects nobody', () => {
  const race = scenario(4);
  const me = race.player;
  const [a, b] = rivals(race);
  line(race, [[a, 120], [b, 100], [me, 60]]);
  a.shield = true; a.shieldTime = 10;
  race.items.give(me, 'outage');
  const ev = recordEvents(['kart:shrink', 'item:block'], race);
  press(race);
  assert.deepEqual(ev.of('kart:shrink').map((e) => e.data.id), [b.id]);
  assert.equal(ev.of('item:block')[0].data.id, a.id);
  assert.equal(a.shield, false); assert.equal(a.kart.status.stun, 0);
  // now the leader uses it
  line(race, [[me, 200], [a, 100], [b, 80]]);
  race.items.give(me, 'outage');
  const n0 = ev.log.length;
  press(race);
  assert.equal(ev.log.length, n0, 'nobody is ahead: nothing happens');
  ev.off();
});

test('kernel panic: homes on 1st place with a 9 m ring; a firewall or sudo blocks it; the user is exempt', () => {
  const race = scenario(6, 5);
  const me = race.player;
  const [first, second, near, far] = rivals(race);
  // 1st place `first` at s=260 (mid-bend); `near` 4 m from it, `far` 20 m away; me at the back
  line(race, [[first, 260, 0], [near, 256, 3], [far, 230, 0], [second, 200], [me, 30]]);
  assert.equal(first.place, 1);
  const ev = recordEvents(['item:hit', 'item:block', 'item:use', 'sfx'], race);
  race.items.give(me, 'kernel_panic');
  press(race);
  const kp = race.items.entities[0];
  assert.equal(kp.type, 'kernel_panic'); assert.equal(kp.targetId, first.id);
  runUntil(race, () => ev.of('item:hit').length > 0, 10, IDLE);
  const victims = ev.of('item:hit').map((e) => e.data.victimId);
  assert.ok(victims.includes(first.id), 'the leader is struck');
  assert.ok(victims.includes(near.id), 'racers inside the ring are struck too');
  assert.ok(!victims.includes(far.id), 'racers outside the ring are safe');
  assert.ok(!victims.includes(me.id));
  assert.ok(ev.of('item:hit').every((e) => e.data.item === 'kernel_panic' && e.data.byId === 'marco'));
  ev.off();
  // sudo blocks it
  const race2 = scenario(3, 5);
  const [m2, t2] = [race2.player, rivals(race2)[0]];
  line(race2, [[t2, 260], [m2, 30]]);
  t2.sudo = 8; t2.kart.setInvincible(8);
  const ev2 = recordEvents(['item:hit', 'item:block'], race2);
  race2.items.give(m2, 'kernel_panic'); press(race2);
  runUntil(race2, () => ev2.of('item:block').length > 0, 10, IDLE);
  assert.equal(ev2.of('item:block')[0].data.id, t2.id);
  assert.equal(ev2.of('item:hit').length, 0);
  ev2.off();
  // a firewall blocks it and is used up
  const race3 = scenario(3, 5);
  const [m3, t3] = [race3.player, rivals(race3)[0]];
  line(race3, [[t3, 260], [m3, 30]]);
  t3.shield = true; t3.shieldTime = 10;
  const ev3 = recordEvents(['item:hit', 'item:block'], race3);
  race3.items.give(m3, 'kernel_panic'); press(race3);
  runUntil(race3, () => ev3.of('item:block').length > 0, 10, IDLE);
  assert.equal(t3.shield, false);
  assert.equal(ev3.of('item:hit').length, 0);
  ev3.off();
});

test('use is ignored while the roulette spins, with an empty slot, and after finishing', () => {
  const race = scenario(2);
  const me = race.player;
  const ev = recordEvents(['item:use'], race);
  assert.equal(race.items.use(me, {}), false);
  race.items.startRoulette(me, 1);
  assert.equal(race.items.use(me, {}), false, 'slot 1 is still spinning');
  me.itemRoulette = null;
  race.items.give(me, 'ping'); me.itemRoulette = { active: true, t: 0, shown: null, next: 0, count: 1 };
  assert.equal(race.items.use(me, {}), true, 'slot 2 may spin while slot 1 is used (two item slots)');
  me.itemRoulette = null; race.items.give(me, 'ping'); me.finished = true;
  assert.equal(race.items.use(me, {}), false);
  assert.equal(ev.of('item:use').length, 1, 'only the legitimate use went out');
  ev.off();
});

test('item table: leaders get cheap / defensive items, the back gets comeback items, every item is reachable', () => {
  const N = 20000;
  const dist = (place, count = 8) => {
    const rng = makeRng(42 + place);
    const c = Object.fromEntries(ITEM_IDS.map((i) => [i, 0]));
    for (let i = 0; i < N; i++) c[pickItem(place, count, rng)]++;
    return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / N]));
  };
  const first = dist(1), mid = dist(4), last = dist(8);
  const nonzero = (d) => Object.keys(d).filter((k) => d[k] > 0).sort();
  const safe = ['cable', 'espresso', 'firewall', 'forcepush', 'legacy', 'pods', 'ping', 'spill', 'zeroday'].sort();
  assert.deepEqual(nonzero(first), safe, 'the leader only gets cheap / defensive items');
  assert.ok(first.cable + first.ping > 0.3);
  assert.ok(mid.traceroute + mid.espresso + mid.ping > 0.15, 'mid: traceroute, espresso, ping');
  assert.ok(mid.kernel_panic === 0, 'no kernel panic in the middle of the pack');
  assert.ok(last.sudo + last.fibre + last.outage + last.kernel_panic > 0.25, 'last: sudo, fibre, outage, kernel panic');
  assert.equal(last.cable, 0); assert.equal(last.ping, 0);
  for (const id of ITEM_IDS) assert.ok(ITEM_IDS.some((_, i) => dist(i + 1)[id] > 0), `${id} is reachable`);
  // monotone trends
  assert.ok(dist(1).cable > dist(4).cable);
  assert.ok(dist(8).kernel_panic > dist(5).kernel_panic);
  assert.ok(dist(8).sudo > dist(5).sudo);
  // works for any field size, weights never all zero
  for (let n = 1; n <= 8; n++) for (let p = 1; p <= n; p++) {
    const w = itemWeights(p, n, {});
    assert.ok(ITEM_IDS.reduce((s, id) => s + w[id], 0) > 0, `weights for place ${p} of ${n}`);
  }
  // a 2-racer race: the leader still never gets outage / kernel panic
  const two = itemWeights(1, 2, {});
  assert.equal(two.outage + two.kernel_panic, 0);
});

test('roulette: events carry valid item ids, tick faster then slower, the final one matches the item given', () => {
  const race = scenario(2, 11);
  const me = race.player;
  const ev = recordEvents(['item:roulette', 'item:get'], race);
  race.items.startRoulette(me);
  runUntil(race, () => me.item !== null, 3, IDLE);
  const ticks = ev.of('item:roulette');
  assert.ok(ticks.length >= 6);
  for (const t of ticks) assert.ok(ITEM_IDS.includes(t.data.shown) && t.data.id === 'marco');
  assert.deepEqual(ticks.map((t) => t.data.done), ticks.map((_, i) => i === ticks.length - 1));
  assert.equal(ticks[ticks.length - 1].data.shown, me.item.id);
  const gaps = ticks.slice(1).map((t, i) => t.t - ticks[i].t);
  assert.ok(gaps[gaps.length - 2] > gaps[0], 'slows down towards the end');
  assert.equal(ev.of('item:get').length, 1);
  ev.off();
});
