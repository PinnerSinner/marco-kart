// Behaviour of the later general items (sniffer, bsod, autoscale, spill, zero-day, pods, force push, pigeon) and the skill items, item roulette
// weighting by place, and the AI's use of every live item.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_IDS, GENERAL_ITEM_IDS, ITEMS } from '../src/core/config.js';
import { makeRng } from '../src/core/util.js';
import { ITEM_DEFS, ITEM_WEIGHTS, itemWeights, pickItem } from '../src/race/itemDefs.js';
import { DT, makeRace, runUntil, skipCountdown, recordEvents, place, freezeOthers, allFinite } from './race_helpers.js';

const IDLE = { throttle: 0, brake: 0, steer: 0, drift: false };
const GAS = { throttle: 1, brake: 0, steer: 0, drift: false };

function scenario(n = 8, seed = 1) {
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
const press = (race, actions = {}, input = IDLE) => race.step(DT, input, { itemPressed: true, ...actions });
const fire = (race, r, id, actions = {}) => { race.items.give(r, id); race.items.use(r, actions); };
const of = (race, type) => race.items.entities.filter((e) => e.type === type);

// ---- roster + roulette weighting -------------------------------------------------------------------------------------------

test('all 24 items (20 general + 4 Biscuit-only) are live, with definitions, weights, meshes and icons', async () => {
  const { ITEM_MESH_IDS } = await import('../src/visuals/itemMeshes.js');
  const { ITEM_ICON_IDS } = await import('../src/ui/icons.js');
  assert.equal(ITEM_IDS.length, 24);
  assert.equal(GENERAL_ITEM_IDS.length, 20, 'the Biscuit-only items are extra to the 20');
  for (const id of ITEM_IDS) {
    assert.ok(ITEM_DEFS[id] && ITEM_DEFS[id].uses > 0, `${id} def`);
    assert.ok(ITEM_WEIGHTS[id], `${id} weights`);
    assert.ok(ITEM_MESH_IDS.includes(id), `${id} mesh`);
    assert.ok(ITEM_ICON_IDS.includes(id), `${id} icon`);
    assert.ok(ITEMS[id].name && ITEMS[id].blurb, `${id} copy`);
  }
  assert.deepEqual(ITEM_IDS.filter((id) => ITEMS[id].skill).sort(), ['capacitor', 'cronjob', 'legacy']);
});

const dist = (place, count = 8, N = 20000) => {
  const rng = makeRng(7 + place);
  const c = Object.fromEntries(GENERAL_ITEM_IDS.map((i) => [i, 0]));
  for (let i = 0; i < N; i++) c[pickItem(place, count, rng)]++;
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / N]));
};
const share = (d, ids) => ids.reduce((s, id) => s + d[id], 0);
const CHASERS = ['sudo', 'fibre', 'outage', 'kernel_panic', 'bsod', 'autoscale'];      // strong comeback items
const DEFENCE = ['cable', 'ping', 'firewall', 'spill', 'zeroday', 'legacy', 'pods', 'espresso'];    // cheap / defensive

test('roulette weighting: leaders get weak and defensive items, the back gets strong comeback items (rubber banding)', () => {
  const first = dist(1), mid = dist(4), last = dist(8);
  assert.ok(share(first, DEFENCE) > 0.85, 'leader mostly defensive');
  assert.ok(share(first, CHASERS) === 0, 'no comeback items for the leader');
  assert.ok(share(last, CHASERS) > 0.6, 'last place mostly strong items');
  assert.ok(share(last, DEFENCE) < 0.1);
  // monotone: comeback share rises and defensive share falls with every place
  const c = [], d = [];
  for (let p = 1; p <= 8; p++) { const x = dist(p, 8, 6000); c.push(share(x, CHASERS)); d.push(share(x, DEFENCE)); }
  for (let p = 1; p < 8; p++) { assert.ok(c[p] >= c[p - 1] - 0.03, `comeback share place ${p + 1}`); assert.ok(d[p] <= d[p - 1] + 0.03, `defence share place ${p + 1}`); }
  assert.ok(share(mid, CHASERS) < share(last, CHASERS) && share(mid, CHASERS) > share(first, CHASERS));
});

test('roulette weighting: items that need a target ahead are never handed to the leader, and all 24 items have weights', () => {
  for (const id of ['sniffer', 'kernel_panic', 'outage', 'traceroute']) assert.equal(ITEM_WEIGHTS[id][0], 0, `${id} not for 1st`);
  for (const id of ITEM_IDS) assert.ok(ITEM_WEIGHTS[id].some((w) => w > 0), `${id} reachable`);
  for (let n = 1; n <= 8; n++) for (let p = 1; p <= n; p++) {
    const w = itemWeights(p, n, {});
    assert.ok(GENERAL_ITEM_IDS.reduce((s, id) => s + w[id], 0) > 0);
    assert.ok(Object.values(w).every((x) => x >= 0));
  }
});

test('roulette weighting: skill items are spread through the pack, the risky fuse never goes to the leader', () => {
  assert.equal(ITEM_WEIGHTS.cronjob[0], 0);
  assert.ok(dist(4).capacitor > 0.03 && dist(6).cronjob > 0.05 && dist(1).legacy > 0.05);
});

test('roulette weighting: a whole race hands out varied items (at least 17 distinct in a full sim)', () => {
  const race = makeRace({ human: null, n: 8, seed: 5 });
  const seen = new Set();
  const ev = recordEvents(['item:get'], race);
  for (let i = 0; i < 40; i++) { for (const r of race.racers) { race.items.startRoulette(r); } runUntil(race, (x) => x.racers.every((r) => !r.itemRoulette), 3, IDLE); for (const e of ev.of('item:get')) seen.add(e.data.item); for (const r of race.racers) { r.item = null; r.item2 = null; } ev.log.length = 0; }
  ev.off();
  assert.ok(seen.size >= 17, `saw ${seen.size} item types`);
});

// ---- v2 items ---------------------------------------------------------------------------------------------------------------

test('sniffer: steals the held item of the racer ahead, or gives a consolation boost when they hold nothing', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 20], [a, 60]]);
  race.items.give(a, 'sudo');
  const ev = recordEvents(['item:steal'], race);
  fire(race, me, 'sniffer');
  assert.equal(of(race, 'sniffer').length, 1);
  runUntil(race, () => ev.of('item:steal').length > 0, 4, IDLE);
  assert.equal(ev.of('item:steal')[0].data.item, 'sudo');
  assert.equal(me.item.id, 'sudo'); assert.equal(a.item, null);
  // nothing to steal: boost
  me.item = null; place(race, me, 20); place(race, a, 60); race.step(DT, IDLE);
  fire(race, me, 'sniffer');
  runUntil(race, () => ev.of('item:steal').length > 1, 4, IDLE);
  assert.equal(ev.of('item:steal')[1].data.item, null);
  assert.ok(me.kart.boost.time > 0.5);
  ev.off();
});

test('sniffer: a firewall on the target stops the theft', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 20], [a, 60]]);
  race.items.give(a, 'sudo'); a.shield = true; a.shieldTime = 9;
  fire(race, me, 'sniffer');
  runUntil(race, () => of(race, 'sniffer').length === 0, 4, IDLE);
  assert.equal(a.item.id, 'sudo'); assert.equal(me.item, null); assert.equal(a.shield, false);
});

test('bsod: spins every rival in range (and only them), flashes the human screen', () => {
  const race = scenario(4);
  const [me, a, b, c] = [race.player, ...rivals(race)];
  line(race, [[me, 40], [a, 55, 2], [b, 30, -3], [c, 250]]);
  const ev = recordEvents(['item:hit'], race);
  race.items.give(me, 'bsod');
  press(race);
  assert.ok(a.kart.status.spin > 1 && b.kart.status.spin > 1);
  assert.equal(c.kart.status.spin, 0, 'out of range');
  assert.equal(me.kart.status.spin, 0, 'the user is exempt');
  assert.equal(ev.of('item:hit').filter((e) => e.data.item === 'bsod').length, 2);
  // a rival human would see the blue screen
  const race2 = scenario(3, 2);
  const [me2, x] = [race2.player, rivals(race2)[0]];
  line(race2, [[x, 40], [me2, 30]]);
  fire(race2, x, 'bsod');
  assert.equal(me2.screenFx?.kind, 'bsod');
  ev.off();
});

test('autoscale: grows to double size for 6 s, is slower, flattens hazards and stomps rivals it touches', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 40], [a, 60]]);
  fire(race, me, 'cable', { aimForward: false });   // own cable is a hazard to flatten
  place(race, me, 40);
  race.items.give(me, 'autoscale'); race.items.use(me, {});
  runUntil(race, () => me.giantScale > 1.95, 2, GAS);
  assert.ok(me.kart.scale > 1.9, `scale ${me.kart.scale}`);
  place(race, a, me.kart.pos.z + 2.5, 0); a.kart.pos.x = me.kart.pos.x + 1.0;
  const ev = recordEvents(['item:stomp', 'item:flatten'], race);
  runUntil(race, () => ev.of('item:stomp').length > 0, 2, GAS);
  assert.ok(ev.of('item:stomp').length >= 1);
  runUntil(race, () => me.giant === 0, 8, IDLE);
  runUntil(race, () => me.giantScale === 1, 3, IDLE);
  assert.equal(me.giantScale, 1);
  ev.off();
});

test('spill: a slippery puddle; karts inside it lose grip, others are untouched; lasts a while', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 60], [a, 5]]);
  const ev = recordEvents(['item:hit'], race);
  fire(race, me, 'spill');
  const sp = of(race, 'spill')[0];
  assert.ok(sp && sp.pos.z < me.kart.pos.z);
  runUntil(race, () => true, 1, IDLE);
  place(race, a, sp.pos.z - 1, 0); a.kart.pos.x = sp.pos.x; a.kart.pos.y += 0.05;
  runUntil(race, () => a.slickT > 0, 1, IDLE);
  assert.ok(a.slickT > 0, 'slick');
  assert.ok(ev.of('item:hit').some((e) => e.data.victimId === a.id && e.data.item === 'spill'));
  assert.equal(me.slickT, 0);
  assert.ok(race.items.entities.includes(sp), 'a puddle stays put');
  ev.off();
});

test('zero-day: inert for 5 s, then a mine that spins everyone in its 9 m blast', () => {
  const race = scenario(4);
  const [me, a, b] = [race.player, ...rivals(race).slice(0, 2)];
  line(race, [[me, 80], [a, 30], [b, 30, 5]]);
  fire(race, me, 'zeroday');
  const mine = of(race, 'zeroday')[0];
  assert.equal(mine.state, 'armed');
  place(race, a, mine.pos.z, 0); a.kart.pos.x = mine.pos.x;
  runUntil(race, () => true, 0.5, IDLE);
  assert.equal(a.kart.status.spin, 0, 'still arming: nothing happens');
  place(race, a, 30, 0);
  runUntil(race, () => mine.age > ITEM_DEFS.zeroday.arming + 0.1, 6, IDLE);
  const ev = recordEvents(['item:hit', 'item:blast'], race);
  place(race, a, mine.pos.z, 0); a.kart.pos.x = mine.pos.x;
  place(race, b, mine.pos.z - 5, 0); b.kart.pos.x = mine.pos.x + 4;
  runUntil(race, () => ev.of('item:blast').length > 0, 1, IDLE);
  assert.equal(ev.of('item:blast').length, 1);
  assert.ok(a.kart.status.spin > 0 && b.kart.status.spin > 0, 'blast reaches both');
  ev.off();
});

test('pods: three orbiting pods absorb three hits, or are launched one by one as homing missiles', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 40], [a, 130]]);
  fire(race, me, 'pods');
  assert.equal(me.pods, 3);
  assert.deepEqual({ id: me.item.id, count: me.item.count }, { id: 'pods', count: 3 }, 'the cluster stays in slot 1, count = pods left');
  const ev = recordEvents(['item:block', 'item:hit', 'item:shield-break'], race);
  race.items.strike(me, 'x', 'ping', 1, 'ping');
  assert.equal(me.pods, 2); assert.equal(ev.of('item:block')[0].data.kind, 'pods');
  assert.equal(me.item.count, 2);
  // launch one: it homes on the racer ahead
  press(race);
  const pod = of(race, 'pod')[0];
  assert.ok(pod && pod.targetId === a.id);
  assert.equal(me.pods, 1); assert.equal(me.item.count, 1);
  runUntil(race, () => ev.of('item:hit').length > 0, 5, IDLE);
  assert.equal(ev.of('item:hit')[0].data.victimId, a.id);
  ev.off();
});

test('forcepush: shoves every kart in 14 m sideways and deflects projectiles; distant karts are untouched', () => {
  const race = scenario(4);
  const [me, a, b] = [race.player, ...rivals(race).slice(0, 2)];
  line(race, [[me, 60], [a, 62, 3], [b, 150]]);
  const vx0 = a.kart.vel.x;
  const ev = recordEvents(['item:hit'], race);
  fire(race, me, 'forcepush');
  assert.ok(Math.abs(a.kart.vel.x - vx0) > 4, 'shoved sideways');
  assert.ok(a.kart.vel.x > 0 || a.kart.vel.x < 0);
  assert.equal(b.kart.vel.x, 0);
  assert.equal(a.kart.status.spin, 0, 'a shove, not a spin');
  assert.equal(ev.of('item:hit')[0].data.item, 'forcepush');
  ev.off();
});

test('pigeon: flies the road and splats the first racer it meets: a spin plus a screen full of feathers', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 30], [a, 110]]);
  const ev = recordEvents(['item:splat', 'item:hit'], race);
  fire(race, me, 'pigeon');
  assert.equal(of(race, 'pigeon').length, 1);
  runUntil(race, () => ev.of('item:splat').length > 0, 4, IDLE);
  assert.equal(ev.of('item:splat')[0].data.id, a.id);
  assert.ok(a.splat > 3);
  ev.off();
});

// ---- skill items -------------------------------------------------------------------------------------------------------------

test('capacitor: tap to charge (kart slows), tap again to fire; the sweet spot gives a fast piercing bolt, an early tap a weak one', () => {
  const d = ITEM_DEFS.capacitor;
  const shoot = (chargeSeconds) => {
    const race = scenario(4);
    const [me, a, b] = [race.player, ...rivals(race).slice(0, 2)];
    line(race, [[me, 20], [a, 60], [b, 90]]);
    const ev = recordEvents(['item:charge', 'item:release', 'item:hit'], race);
    race.items.give(me, 'capacitor');
    press(race);
    assert.equal(me.charging, true);
    assert.ok(me.item, 'still holding it while charging');
    assert.equal(race.getHud().itemFx.charging, true);
    for (let i = 0; i < Math.round(chargeSeconds / DT); i++) race.step(DT, IDLE);
    press(race);
    const spin = of(race, 'bolt')[0].aux2;
    assert.equal(me.charging, false); assert.equal(me.item, null);
    const rel = ev.of('item:release')[0].data;
    runUntil(race, () => of(race, 'bolt').length === 0, 4, IDLE);
    const hits = ev.of('item:hit').filter((e) => e.data.item === 'capacitor').map((e) => e.data.victimId);
    ev.off();
    return { rel, hits, spin };
  };
  const weak = shoot(0.25), perfect = shoot((d.sweetMin + d.sweetMax) / 2);
  assert.equal(weak.rel.perfect, false); assert.ok(weak.rel.power < 0.6);
  assert.equal(perfect.rel.perfect, true); assert.equal(perfect.rel.power, 1);
  assert.equal(weak.hits.length, 1, 'a weak bolt stops at the first racer');
  assert.equal(perfect.hits.length, 2, 'a perfect bolt pierces through two racers');
  assert.ok(perfect.spin > weak.spin * 1.5, 'and spins longer');
});

test('capacitor: held too long it overloads in your face; being spun cancels the charge without losing the item', () => {
  const race = scenario(2);
  const me = race.player;
  line(race, [[me, 40]]);
  const ev = recordEvents(['item:overload', 'item:charge'], race);
  race.items.give(me, 'capacitor');
  press(race);
  runUntil(race, () => ev.of('item:overload').length > 0, 4, IDLE);
  assert.equal(ev.of('item:overload').length, 1);
  assert.equal(me.charging, false); assert.equal(me.item, null);
  assert.ok(me.kart.status.spin > 0, 'self-spin');
  assert.deepEqual(ev.of('item:charge').map((e) => e.data.zone), ['weak', 'sweet', 'over']);
  runUntil(race, () => me.kart.status.spin === 0 && me.kart.status.invincible === 0, 6, IDLE);
  race.items.give(me, 'capacitor');
  press(race);
  me.kart.spinOut(1, 'test');
  race.step(DT, IDLE);
  assert.equal(me.charging, false); assert.equal(me.item.id, 'capacitor');
  ev.off();
});

test('legacy: tow it behind as a shield that soaks up a projectile; tap again to hurl it ahead at a rival', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 60], [a, 5]]);
  race.items.give(me, 'legacy');
  press(race);
  const l = of(race, 'legacy')[0];
  assert.equal(l.state, 'trail'); assert.ok(me.item, 'the slot stays used while towing');
  runUntil(race, () => true, 0.5, GAS);
  assert.ok(l.pos.z < me.kart.pos.z - 2, 'trails behind');
  // a ping from behind hits the towed server instead of the kart
  const ev = recordEvents(['item:block', 'item:hit', 'item:end'], race);
  place(race, a, me.kart.ground.s - 30, 0); a.kart.pos.x = me.kart.pos.x;
  race.step(DT, IDLE);
  fire(race, a, 'ping');
  runUntil(race, () => ev.of('item:block').length > 0, 3, GAS);
  assert.equal(ev.of('item:block')[0].data.kind, 'legacy');
  assert.equal(ev.of('item:hit').length, 0);
  assert.equal(me.item, null, 'the server is gone, the slot is free');
  assert.equal(me.trailId, 0);
  // now hurl: deploy again, tap again, it flies ahead and spins a rival
  place(race, me, 40); place(race, a, 110);
  race.step(DT, IDLE);
  race.items.give(me, 'legacy');
  press(race);
  press(race);
  const flying = of(race, 'legacy')[0];
  assert.equal(flying.state, 'flying'); assert.equal(me.item, null);
  runUntil(race, () => ev.of('item:hit').length > 0, 4, IDLE);
  assert.equal(ev.of('item:hit')[0].data.victimId, a.id);
  assert.equal(ev.of('item:hit')[0].data.item, 'legacy');
  ev.off();
});

test('legacy: a rival who tailgates into the towed server is rammed and spun; the tow expires by itself', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 60], [a, 40]]);
  race.items.give(me, 'legacy');
  press(race);
  place(race, a, me.kart.ground.s - 3.6, 0); a.kart.pos.x = me.kart.pos.x;
  const ev = recordEvents(['item:hit'], race);
  runUntil(race, () => ev.of('item:hit').length > 0, 1, IDLE);
  assert.equal(ev.of('item:hit')[0].data.victimId, a.id);
  ev.off();
  race.items.give(me, 'legacy'); me.item = me.item ?? null;
  const race2 = scenario(2, 4);
  const m2 = race2.player;
  line(race2, [[m2, 40]]);
  race2.items.give(m2, 'legacy'); press(race2);
  runUntil(race2, () => !m2.item, ITEM_DEFS.legacy.seconds + 2, IDLE);
  assert.equal(m2.item, null);
  assert.equal(of(race2, 'legacy').length, 0);
});

test('cronjob: lit fuse plus a boost; touching a rival passes it on; if it goes off the holder and anyone close spin', () => {
  const d = ITEM_DEFS.cronjob;
  const race = scenario(4);
  const [me, a, b] = [race.player, ...rivals(race).slice(0, 2)];
  line(race, [[me, 40], [a, 41.5], [b, 140]]);
  const ev = recordEvents(['item:potato', 'item:potato-boom', 'item:hit'], race);
  fire(race, me, 'cronjob');
  assert.ok(me.potato > d.fuse - 0.1);
  assert.ok(me.kart.boost.time > 3);
  runUntil(race, () => a.potato > 0, 2, IDLE);
  assert.ok(a.potato > 0 && me.potato === 0, 'passed on');
  assert.equal(ev.of('item:potato').at(-1).data.fromId, me.id);
  assert.ok(a.potato <= d.passFuse);
  // nobody to pass it to: it goes off on the holder
  place(race, me, 200); place(race, a, 30); place(race, b, 300);
  race.step(DT, IDLE);
  a.potato = 0.2; a.potatoOwner = me.id;
  runUntil(race, () => ev.of('item:potato-boom').length > 0, 1, IDLE);
  assert.equal(ev.of('item:potato-boom')[0].data.id, a.id);
  assert.ok(a.kart.status.spin > 1);
  assert.equal(ev.of('item:hit').at(-1).data.byId, me.id, 'the original owner gets the credit');
  ev.off();
});

test('cronjob: a firewall stops the pass and the fuse stays with the holder; AI holders steer at a rival', () => {
  const race = scenario(3);
  const [me, a] = [race.player, rivals(race)[0]];
  line(race, [[me, 40], [a, 41.5]]);
  a.shield = true; a.shieldTime = 9;
  fire(race, me, 'cronjob');
  runUntil(race, () => !a.shield, 2, IDLE);
  assert.equal(a.potato, 0); assert.ok(me.potato > 0);
  // the seek helper steers an AI carrier towards the nearest rival
  const race2 = scenario(3, 3);
  const [x, y] = [race2.player, rivals(race2)[0]];
  line(race2, [[y, 40, 0], [x, 70, 6]]);
  y.potato = 5; y.potatoOwner = y.id; x.progress = y.progress + 30;
  const inp = { throttle: 0, brake: 0, steer: 0, drift: false };
  race2.items._potatoSeek(y, inp);
  assert.ok(inp.steer > 0.15, `target is to the right, so steer right (+): ${inp.steer}`);
});

// ---- AI usage ----------------------------------------------------------------------------------------------------------------

test('AI: every live item is used by AI racers within 45 s of holding it (no item is left to rot)', () => {
  const failed = [];
  for (const id of ITEM_IDS) {
    const race = makeRace({ human: null, n: 8, seed: 3 });
    const ev = recordEvents(['item:use'], race);
    runUntil(race, (r) => r.state === 'racing', 10, null);
    runUntil(race, (r) => r.time > 6, 20, null);
    const order = race.order.slice();
    const holder = order[4];                                   // a mid-pack racer: rivals both ahead and behind
    let used = false;
    for (let t = 0; t < 45 && !used; t += 1) {
      if (!holder.item && !holder.charging && !holder.trailId && !(holder.pods > 0) && !(t === 0)) break;
      if (t === 0) race.items.give(holder, id);
      runUntil(race, () => false, 1, null);
      used = ev.log.some((e) => e.data.id === holder.id && e.data.item === id);
    }
    ev.off();
    if (!used) failed.push(id);
    assert.ok(allFinite(race), `${id}: finite state`);
  }
  assert.deepEqual(failed, []);
});
