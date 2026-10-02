// Two item slots (Mario-Kart-like): pickup fills the first empty slot, a full box is refused, "use" fires the FRONT item and the queued one
// slides forward, "swap" exchanges them (refused while the front item is live), a double box at the back of the pack, the edge cases
// (finish, outage, sniffer, respawn) and the AI's use of two slots. The HUD snapshot shape is checked at the end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_SLOTS, ITEM_IDS } from '../src/core/config.js';
import { ITEM_DEFS, ALL_ITEM_IDS, SLOTS, doubleBoxChance } from '../src/race/itemDefs.js';
import { decideItem } from '../src/race/aiItems.js';
import { getRacingLine } from '../src/race/RacingLine.js';
import { StubTrack } from '../src/track/StubTrack.js';
import { DT, makeRace, runUntil, skipCountdown, recordEvents, place, freezeOthers, allFinite } from './race_helpers.js';

const IDLE = { throttle: 0, brake: 0, steer: 0, drift: false };
const GO = () => ({ throttle: 1, brake: 0, steer: 0, drift: false });

function scenario(n = 4, seed = 1) {
  const race = makeRace({ human: 'marco', n, seed });
  freezeOthers(race, race.player);
  skipCountdown(race);
  return race;
}
function line(race, entries) {
  for (const [r, s, lat = 0] of entries) place(race, r, s, lat);
  race.step(DT, IDLE);
}
const rivals = (race) => race.racers.filter((r) => !r.isPlayer);
const press = (race, actions = {}) => race.step(DT, IDLE, { itemPressed: true, ...actions });
const ids = (r) => [r.item?.id ?? null, r.item2?.id ?? null];
/** Gives a racer two items (front, queued). */
const hold = (race, r, a, b, countB) => { r.item = null; r.item2 = null; race.items.give(r, a); if (b) assert.equal(race.items.stack(r, b, countB), true); };
/** Teleports the player a few metres before an item box and drives through it. */
function driveThroughBox(race, p, idx = 4, seconds = 4) {
  const box = race.itemBoxes[idx];
  const sm = race.track.query(box.pos, {});
  place(race, p, sm.s - 12, sm.lateral);
  runUntil(race, () => !box.active || p.itemRoulette, seconds, GO);
  return box;
}

// ---- slots: pickup and refusal -------------------------------------------------------------------------------------------------

test('slots: the game has exactly two item slots, and config and the race agree', () => {
  assert.equal(ITEM_SLOTS, 2);
  assert.equal(SLOTS.count, 2);
});

test('pickup: a box fills slot 1 first, then slot 2; the HUD roulette says which slot it is filling', () => {
  const race = scenario(2, 9);
  const p = race.player;
  const ev = recordEvents(['item:get', 'item:box', 'item:roulette'], race);
  const box1 = driveThroughBox(race, p, 4);
  assert.equal(box1.active, false);
  assert.ok(p.itemRoulette, 'rolling');
  let hud = race.getHud();
  assert.equal(hud.roulette.active, true); assert.equal(hud.roulette.slot, 1); assert.equal(hud.roulette.double, false);
  runUntil(race, () => !p.itemRoulette, 3, GO);
  assert.ok(p.item && !p.item2, 'slot 1 is filled, slot 2 is empty');
  assert.equal(ev.of('item:get').at(-1).data.slot, 1);
  // a second box, while slot 1 is held: the roulette fills slot 2
  const box2 = driveThroughBox(race, p, 8);
  assert.equal(box2.active, false);
  hud = race.getHud();
  assert.equal(hud.roulette.slot, 2, 'the spinning box is for the queued slot');
  assert.ok(hud.item, 'the front item stays visible while slot 2 spins');
  const front = p.item.id;
  runUntil(race, () => !p.itemRoulette, 3, GO);
  assert.ok(p.item && p.item2, 'both slots filled');
  assert.equal(p.item.id, front, 'the front item did not move');
  assert.equal(ev.of('item:get').at(-1).data.slot, 2);
  ev.off();
});

test('full box: with both slots taken a box is refused: it stays, the HUD counter goes up, one "item:full" (rate limited)', () => {
  const race = scenario(2, 9);
  const p = race.player;
  hold(race, p, 'firewall', 'sudo');
  const ev = recordEvents(['item:full', 'item:box'], race);
  const before = race.getHud().boxRefused;
  const box = race.itemBoxes[4];
  const sm = race.track.query(box.pos, {});
  place(race, p, sm.s - 12, sm.lateral);
  runUntil(race, () => ev.of('item:full').length > 0, 4, GO);
  assert.equal(ev.of('item:full').length, 1);
  assert.equal(ev.of('item:box').length, 0, 'no pickup');
  assert.equal(box.active, true, 'the box stays for the next racer');
  assert.equal(p.itemRoulette, null, 'no roulette');
  assert.deepEqual(ids(p), ['firewall', 'sudo'], 'nothing was lost');
  assert.equal(race.getHud().boxRefused, before + 1);
  // standing in the box keeps refusing but not every frame: the flash is rate limited
  place(race, p, sm.s, sm.lateral);
  for (let i = 0; i < 30; i++) race.step(DT, IDLE);
  assert.equal(ev.of('item:full').length, 1, 'the flash does not repeat inside the cool-down');
  ev.off();
});

test('full box: using one item frees a slot and the next box is accepted', () => {
  const race = scenario(2, 9);
  const p = race.player;
  hold(race, p, 'cable', 'sudo');
  press(race);
  assert.deepEqual(ids(p), ['sudo', null]);
  const box = driveThroughBox(race, p, 4);
  assert.equal(box.active, false);
  assert.ok(p.itemRoulette);
  assert.equal(race.getHud().roulette.slot, 2);
});

test('item boxes: AI racers obey the same two-slot rule', () => {
  const race = makeRace({ human: null, n: 4, seed: 2 });
  skipCountdown(race);
  const r = race.racers[2];
  hold(race, r, 'firewall', 'sudo');
  assert.equal(race.items.canCollect(r), false);
  r.item2 = null;
  assert.equal(race.items.canCollect(r), true);
  assert.equal(race.items.freeSlots(r), 1);
});

// ---- use and swap --------------------------------------------------------------------------------------------------------------

test('use: fires the FRONT item only, and the queued item slides forward', () => {
  const race = scenario(3);
  const me = race.player;
  line(race, [[me, 40]]);
  hold(race, me, 'cable', 'sudo');
  const ev = recordEvents(['item:use'], race);
  press(race);
  assert.equal(ev.of('item:use').length, 1);
  assert.equal(ev.of('item:use')[0].data.item, 'cable', 'the front item was used, not the queued one');
  assert.deepEqual(ids(me), ['sudo', null], 'the queued item moved up');
  assert.equal(race.items.entities.filter((e) => e.type === 'cable').length, 1);
  assert.equal(me.sudo, 0, 'the queued item was not fired');
  ev.off();
});

test('use: a stacked front item (three espressos, set by hand: no item has more than one use now) keeps the queued item waiting until it is empty', () => {
  const race = scenario(3);
  const me = race.player;
  line(race, [[me, 40]]);
  hold(race, me, 'espresso', 'ping');
  me.item.count = 3;
  press(race);
  assert.deepEqual(ids(me), ['espresso', 'ping']); assert.equal(me.item.count, 2);
  runUntil(race, (r) => r.player.kart.boost.time <= 0, 3, IDLE);
  press(race); runUntil(race, (r) => r.player.kart.boost.time <= 0, 3, IDLE);
  press(race);
  assert.deepEqual(ids(me), ['ping', null], 'the third use empties the stack and ping slides forward');
  assert.equal(me.item.count, 1);
});

test('swap: exchanges the two items, counts included, and never loses one', () => {
  const race = scenario(3);
  const me = race.player;
  hold(race, me, 'espresso', 'kernel_panic');
  me.item.count = 2;
  const ev = recordEvents(['item:swap', 'item:swap-denied'], race);
  assert.equal(race.items.swap(me), true);
  assert.deepEqual(ids(me), ['kernel_panic', 'espresso']);
  assert.equal(me.item.count, 1); assert.equal(me.item2.count, 2, 'the stack kept its count');
  assert.equal(ev.of('item:swap')[0].data.front, 'kernel_panic');
  assert.equal(ev.of('item:swap')[0].data.back, 'espresso');
  assert.equal(race.items.swap(me), true);
  assert.deepEqual(ids(me), ['espresso', 'kernel_panic']); assert.equal(me.item.count, 2);
  assert.equal(ev.of('item:swap-denied').length, 0);
  ev.off();
});

test('swap: does nothing with fewer than two items, or after the finish', () => {
  const race = scenario(3);
  const me = race.player;
  const ev = recordEvents(['item:swap'], race);
  me.item = null; me.item2 = null;
  assert.equal(race.items.swap(me), false, 'nothing held');
  race.items.give(me, 'cable');
  assert.equal(race.items.swap(me), false, 'one item held');
  assert.deepEqual(ids(me), ['cable', null]);
  race.items.stack(me, 'ping'); me.finished = true;
  assert.equal(race.items.swap(me), false, 'finished');
  assert.equal(ev.of('item:swap').length, 0);
  ev.off();
});

test('swap: the player\'s swapPressed action (and a scripted control) swaps through Race.step', () => {
  const race = scenario(3);
  const me = race.player;
  hold(race, me, 'cable', 'sudo');
  race.step(DT, IDLE, { swapPressed: true });
  assert.deepEqual(ids(me), ['sudo', 'cable']);
  race.step(DT, IDLE, { swapPressed: false });
  assert.deepEqual(ids(me), ['sudo', 'cable'], 'no action, no swap');
  const bot = rivals(race)[0];
  hold(race, bot, 'ping', 'firewall');
  let once = true;
  bot.control = () => { if (!once) return undefined; once = false; return { swapPressed: true }; };
  race.step(DT, IDLE);
  assert.deepEqual(ids(bot), ['firewall', 'ping'], 'scripted racers can swap too');
});

test('swap then use: the swapped-in item is the one fired', () => {
  const race = scenario(3);
  const me = race.player;
  line(race, [[me, 40]]);
  hold(race, me, 'cable', 'espresso');
  const ev = recordEvents(['item:use'], race);
  race.step(DT, IDLE, { swapPressed: true });
  press(race);
  assert.equal(ev.of('item:use')[0].data.item, 'espresso');
  assert.deepEqual(ids(me), ['cable', null]);
  ev.off();
});

// ---- live items: swapping is refused ------------------------------------------------------------------------------------------

test('swap is locked while a Capacitor charges, and works again after it is released', () => {
  const race = scenario(3);
  const me = race.player;
  line(race, [[me, 40]]);
  hold(race, me, 'capacitor', 'ping');
  const ev = recordEvents(['item:swap-denied'], race);
  press(race);                                                     // start charging
  assert.equal(me.charging, true);
  assert.equal(race.getHud().swapLocked, true, 'the HUD knows');
  race.step(DT, IDLE, { swapPressed: true });
  assert.deepEqual(ids(me), ['capacitor', 'ping'], 'still in order');
  assert.equal(ev.of('item:swap-denied').length, 1);
  assert.equal(ev.of('item:swap-denied')[0].data.reason, 'charging');
  runUntil(race, () => race.getHud().itemFx.zone === 'sweet', 4, IDLE);
  press(race);                                                     // release
  assert.equal(me.charging, false);
  assert.equal(race.getHud().swapLocked, false);
  assert.equal(me.item?.id, 'ping', 'the capacitor was used up and ping slid forward');
  ev.off();
});

test('swap is locked while a Legacy Server is in tow; hurling it frees the slot', () => {
  const race = scenario(3);
  const me = race.player;
  line(race, [[me, 40]]);
  hold(race, me, 'legacy', 'ping');
  press(race);
  assert.ok(me.trailId, 'the server is in tow');
  assert.equal(race.items.swapLocked(me), true);
  race.step(DT, IDLE, { swapPressed: true });
  assert.deepEqual(ids(me), ['legacy', 'ping']);
  press(race);                                                     // hurl it
  assert.equal(race.items.swapLocked(me), false);
  assert.equal(me.item?.id, 'ping');
});

test('swap is locked while Pods orbit; the pods keep slot 1 and each use fires one', () => {
  const race = scenario(3);
  const me = race.player;
  line(race, [[me, 40]]);
  hold(race, me, 'pods', 'sudo');
  press(race);
  assert.ok(me.pods > 0, 'pods are out');
  assert.equal(race.items.swapLocked(me), true);
  assert.equal(race.items.swap(me), false);
  assert.deepEqual(ids(me), ['pods', 'sudo']);
});

// ---- edge cases ------------------------------------------------------------------------------------------------------------------

test('finish: a racer that crosses the line holds nothing, and cannot use or swap', () => {
  const race = scenario(3);
  const me = race.player;
  hold(race, me, 'cable', 'sudo');
  race._finishRacer(me, race.time);
  assert.deepEqual(ids(me), [null, null]);
  assert.equal(race.items.use(me, {}), false);
  assert.equal(race.items.swap(me), false);
  const hud = race.getHud();
  assert.equal(hud.item, null); assert.equal(hud.item2, null);
});

test('respawn: both slots survive a respawn', () => {
  const race = scenario(3);
  const me = race.player;
  hold(race, me, 'ping', 'cable');
  race._respawn(me);
  assert.deepEqual(ids(me), ['ping', 'cable']);
});

test('outage: victims lose BOTH slots; the user keeps the item waiting behind the outage', () => {
  const race = scenario(4);
  const [me, a, b] = [race.player, rivals(race)[0], rivals(race)[1]];
  line(race, [[me, 10], [a, 60], [b, 90]]);
  hold(race, a, 'ping', 'sudo'); hold(race, b, 'cable', 'firewall');
  hold(race, me, 'outage', 'espresso');
  press(race);
  assert.deepEqual(ids(a), [null, null]);
  assert.deepEqual(ids(b), [null, null]);
  assert.deepEqual(ids(me), ['espresso', null]);
});

test('sniffer: steals the FRONT item; the victim\'s queued item moves up; it lands in the thief\'s free slot', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 20], [a, 60]]);
  hold(race, a, 'kernel_panic', 'sudo');
  hold(race, me, 'sniffer');
  const ev = recordEvents(['item:steal'], race);
  press(race);
  runUntil(race, () => ev.of('item:steal').length > 0, 4, IDLE);
  assert.equal(ev.of('item:steal')[0].data.item, 'kernel_panic');
  assert.deepEqual(ids(a), ['sudo', null], 'the victim keeps the queued item, now in front');
  assert.deepEqual(ids(me), ['kernel_panic', null], 'the thief\'s slot 1 was empty (the sniffer is spent)');
  ev.off();
});

test('sniffer: a thief who already holds an item gets the loot in slot 2', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 20], [a, 60]]);
  hold(race, a, 'kernel_panic');
  hold(race, me, 'sniffer', 'espresso');
  const ev = recordEvents(['item:steal'], race);
  press(race);
  assert.deepEqual(ids(me), ['espresso', null], 'the queued item moved up when the sniffer was fired');
  runUntil(race, () => ev.of('item:steal').length > 0, 4, IDLE);
  assert.deepEqual(ids(me), ['espresso', 'kernel_panic']);
  assert.deepEqual(ids(a), [null, null]);
  ev.off();
});

test('sniffer: a thief with both slots full again on arrival gets a consolation boost, and the victim keeps the item', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 20], [a, 60]]);
  hold(race, a, 'kernel_panic');
  hold(race, me, 'sniffer', 'espresso');
  const ev = recordEvents(['item:steal'], race);
  press(race);
  race.items.stack(me, 'cable');                                   // a box picked up while the sniffer was flying
  assert.deepEqual(ids(me), ['espresso', 'cable']);
  runUntil(race, () => ev.of('item:steal').length > 0, 4, IDLE);
  assert.equal(ev.of('item:steal')[0].data.consolation, true);
  assert.deepEqual(ids(me), ['espresso', 'cable'], 'nothing was dropped');
  assert.ok(me.kart.boost.time > 0.5, 'a small boost instead');
  ev.off();
});

test('sniffer: a live front item (Capacitor charging) cannot be stolen; the queued item goes instead', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 20], [a, 60]]);
  hold(race, a, 'capacitor', 'sudo');
  a.charging = true; a.chargeT = 0.2;
  hold(race, me, 'sniffer');
  const ev = recordEvents(['item:steal'], race);
  press(race);
  runUntil(race, () => ev.of('item:steal').length > 0, 4, IDLE);
  assert.equal(ev.of('item:steal')[0].data.item, 'sudo');
  assert.deepEqual(ids(a), ['capacitor', null]);
  ev.off();
});

test('sniffer: nothing to steal gives the consolation boost', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 20], [a, 60]]);
  a.item = null; a.item2 = null;
  hold(race, me, 'sniffer');
  const ev = recordEvents(['item:steal'], race);
  press(race);
  runUntil(race, () => ev.of('item:steal').length > 0, 4, IDLE);
  assert.equal(ev.of('item:steal')[0].data.item, null);
  assert.ok(me.kart.boost.time > 0.5);
  ev.off();
});

// ---- double box ------------------------------------------------------------------------------------------------------------------

test('double box: never at the front of the field, more likely towards the back, always within 0..1', () => {
  assert.equal(doubleBoxChance(1, 8), 0);
  assert.equal(doubleBoxChance(3, 8), 0);
  let prev = 0;
  for (let place = 1; place <= 8; place++) {
    const c = doubleBoxChance(place, 8);
    assert.ok(c >= prev && c >= 0 && c <= 1, `place ${place}: ${c}`);
    prev = c;
  }
  assert.ok(doubleBoxChance(8, 8) >= 0.25, 'last place gets a real chance');
  assert.equal(doubleBoxChance(3, 3), 0, 'tiny fields never get one');
});

test('double box: two DIFFERENT items, only when both slots are empty; a busy racer gets a single item', () => {
  const race = scenario(8, 5);
  const last = race.racers[7];
  last.place = 8;
  let doubles = 0, total = 400;
  last.item = null; last.item2 = null;
  for (let i = 0; i < total; i++) if (race.items.boxCount(last) === 2) doubles++;
  assert.ok(doubles > total * 0.15 && doubles < total * 0.55, `last place gets a double box in ${doubles} of ${total} boxes`);
  race.items.give(last, 'cable');
  for (let i = 0; i < 100; i++) assert.equal(race.items.boxCount(last), 1, 'one slot is taken: a single item');
  const first = race.racers[0]; first.place = 1; first.item = null; first.item2 = null;
  for (let i = 0; i < 100; i++) assert.equal(race.items.boxCount(first), 1, 'the leader never gets a double');
});

test('double box: the roulette hands out two different items, in slot 1 and slot 2, and the HUD says "double"', () => {
  const race = scenario(8, 5);
  const p = race.player;
  p.place = 8; p.item = null; p.item2 = null;
  const ev = recordEvents(['item:roulette'], race);
  race.items.startRoulette(p, 2);
  const hud = race.getHud();
  assert.equal(hud.roulette.active, true); assert.equal(hud.roulette.double, true); assert.equal(hud.roulette.slot, 1);
  runUntil(race, () => !p.itemRoulette, 3, IDLE);
  assert.ok(p.item && p.item2, 'both slots filled');
  assert.notEqual(p.item.id, p.item2.id, 'two different items');
  const last = ev.of('item:roulette').at(-1).data;
  assert.equal(last.double, true); assert.equal(last.items.length, 2);
  ev.off();
});

test('double box: asking for two items with one slot free still gives one and loses nothing', () => {
  const race = scenario(8, 5);
  const p = race.player;
  hold(race, p, 'cable');
  race.items.startRoulette(p, 2);
  runUntil(race, () => !p.itemRoulette, 3, IDLE);
  assert.equal(p.item.id, 'cable');
  assert.ok(p.item2, 'the free slot was filled');
});

// ---- the AI with two slots -----------------------------------------------------------------------------------------------------

/** A decision-ready AI stand-in on an open straight with a rival right behind (cable is "ready"), nothing else around. */
function mockAi(front, back, extra = {}) {
  const track = new StubTrack();
  const kart = { status: { spin: 0, respawning: 0 }, ground: { s: 40 }, speed: 30, maxSpeed: 33, grounded: true, boost: { time: 0 }, pos: { x: 0, y: 0, z: 0 } };
  const mk = (id) => (id ? { id, count: 1 } : null);
  const racer = { id: 'bot', item: mk(front), item2: mk(back), itemRoulette: null, finished: false, place: 3, pods: 0, kart };
  const simTime = extra.simTime ?? 10;
  const locked = extra.locked ?? false;
  return {
    racer, race: { state: 'racing', simTime, items: { swapLocked: () => locked, entities: [] }, racers: [] }, line: getRacingLine(track),
    heldBy: { [front]: 0, ...(back ? { [back]: 0 } : {}) }, itemHeld: 0, itemHeldId: front, itemCooldown: 0, reaction: 0,
    aheadR: null, aheadDp: Infinity, aheadDLat: 0, behindR: { kart: { ground: { s: 30 } } }, behindDp: 10, behindDLat: 0,
    aggression: 1, threat: false, racersAhead: 2, ...extra.ai,
  };
}
const acts = () => ({ itemPressed: false, aimBack: false, aimForward: false, swapPressed: false });

test('AI: a ready front item is used, and the queued item is left alone (one action per decision)', () => {
  const ai = mockAi('cable', 'firewall');
  const a = acts(); decideItem(ai, 0.1, a);
  assert.equal(a.itemPressed, true);
  assert.equal(a.swapPressed, false, 'it never uses AND swaps in the same decision');
});

test('AI: when only the queued item is ready, it swaps it forward instead of waiting', () => {
  const ai = mockAi('firewall', 'cable');
  const a = acts(); decideItem(ai, 0.1, a);
  assert.equal(a.itemPressed, false);
  assert.equal(a.swapPressed, true);
});

test('AI: it does not swap back and forth (swap guard), nor swap while the front item is live', () => {
  const ai = mockAi('firewall', 'cable');
  const a1 = acts(); decideItem(ai, 0.1, a1);
  assert.equal(a1.swapPressed, true);
  ai.race.simTime += 0.5;
  const a2 = acts(); decideItem(ai, 0.1, a2);
  assert.equal(a2.swapPressed, false, 'inside the 1.2 s guard');
  ai.race.simTime += 1.0;
  const a3 = acts(); decideItem(ai, 0.1, a3);
  assert.equal(a3.swapPressed, true, 'after the guard it may swap again');
  const live = mockAi('firewall', 'cable', { locked: true });
  const a4 = acts(); decideItem(live, 0.1, a4);
  assert.equal(a4.swapPressed, false, 'a live front item cannot be swapped away');
});

test('AI: with nothing ready neither item is touched', () => {
  const ai = mockAi('firewall', 'sudo', { ai: { behindR: null, behindDp: Infinity, aggression: 0 } });
  const a = acts(); decideItem(ai, 0.1, a);
  assert.equal(a.itemPressed, false); assert.equal(a.swapPressed, false);
});

test('AI: two items in a whole race: never a use and a swap in the same tick, and both items get used', () => {
  const race = makeRace({ human: null, n: 8, seed: 3 });
  const ev = recordEvents(['item:use', 'item:swap'], race);
  runUntil(race, (r) => r.state === 'racing', 10, null);
  runUntil(race, (r) => r.time > 6, 20, null);
  const pairs = [['ping', 'espresso'], ['cable', 'firewall'], ['traceroute', 'sudo'], ['kernel_panic', 'fibre'], ['sniffer', 'espresso'], ['pigeon', 'legacy'], ['spill', 'bsod'], ['forcepush', 'zeroday']];
  const start = race.time;
  race.racers.forEach((r, i) => hold(race, r, pairs[i][0], pairs[i][1]));
  runUntil(race, (r) => r.time > start + 60, 70, null);
  ev.off();
  const byRacer = (id) => ev.log.filter((e) => e.data.id === id && e.t >= start);
  let bothUsed = 0;
  race.racers.forEach((r, i) => {
    const log = byRacer(r.id);
    const uses = log.filter((e) => e.name === 'item:use').map((e) => e.data.item);
    for (const e of log) {
      if (e.name !== 'item:swap') continue;
      assert.equal(log.some((o) => o !== e && o.name === 'item:use' && o.t === e.t), false, `${r.id}: swapped and used in the same tick at ${e.t.toFixed(2)}`);
    }
    if (uses.includes(pairs[i][0]) && uses.includes(pairs[i][1])) bothUsed++;
  });
  assert.ok(bothUsed >= 5, `at least 5 of 8 AI racers used BOTH their items within a minute (${bothUsed})`);
  assert.ok(allFinite(race));
});

// ---- the HUD snapshot ----------------------------------------------------------------------------------------------------------

test('getHud: item and item2 are { id, count } or null; swapLocked, boxRefused and itemFx are always present', () => {
  const race = scenario(3);
  const me = race.player;
  let hud = race.getHud();
  assert.equal(hud.item, null); assert.equal(hud.item2, null); assert.equal(hud.roulette, null);
  assert.equal(hud.swapLocked, false); assert.equal(typeof hud.boxRefused, 'number'); assert.equal(typeof hud.itemFx, 'object');
  hold(race, me, 'espresso', 'kernel_panic');
  me.item.count = 3;
  hud = race.getHud();
  assert.deepEqual({ ...hud.item }, { id: 'espresso', count: 3 });
  assert.deepEqual({ ...hud.item2 }, { id: 'kernel_panic', count: 1 });
  race.items.swap(me);
  hud = race.getHud();
  assert.equal(hud.item.id, 'kernel_panic'); assert.equal(hud.item2.id, 'espresso'); assert.equal(hud.item2.count, 3);
});

test('getHud: the two item objects are reused between frames (no per-frame allocation) and never alias each other', () => {
  const race = scenario(3);
  const me = race.player;
  hold(race, me, 'cable', 'ping');
  const a = race.getHud(), i1 = a.item, i2 = a.item2;
  const b = race.getHud();
  assert.equal(b.item, i1); assert.equal(b.item2, i2);
  assert.notEqual(b.item, b.item2);
});

test('every holdable item has a use count the slots can hold (1..3), so a stack never overflows the HUD badge', () => {
  assert.deepEqual([...ALL_ITEM_IDS].sort(), [...ITEM_IDS].sort(), 'the 24 holdable items (20 general + 4 Biscuit-only)');
  for (const id of ALL_ITEM_IDS) { const d = ITEM_DEFS[id]; assert.ok(Number.isInteger(d.uses) && d.uses >= 1 && d.uses <= 3, `${id} uses ${d.uses}`); }
});
