// Biscuit-only items (poo, woof, zoomies, fetch) and Biscuit's easter eggs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ITEMS, ITEM_IDS, GENERAL_ITEM_IDS, EXCLUSIVE_ITEMS, exclusiveItemsFor } from '../src/core/config.js';
import { ITEM_DEFS, ITEM_WEIGHTS, BISCUIT_SHARE, pickItemFor, defaultItemIds, activeIds } from '../src/race/itemDefs.js';
import { planHydrant, EGGS } from '../src/race/easterEggs.js';
import { decideItem } from '../src/race/aiItems.js';
import { makeRng } from '../src/core/util.js';
import { DT, makeRace, skipCountdown, runUntil, recordEvents, place, freezeOthers, allFinite } from './race_helpers.js';

const IDLE = { throttle: 0, brake: 0, steer: 0, drift: false };
const OWN = ['poo', 'woof', 'zoomies', 'fetch'];
const bis = (race) => race.byId.get('biscuit');
const other = (race, id = 'marco') => race.byId.get(id);
const fire = (race, r, id, actions = {}) => { race.items.give(r, id); return race.items.use(r, actions); };
const of = (race, type) => race.items.entities.filter((e) => e.type === type);
/** Biscuit (human) + frozen rivals on the stub track. */
function scene(n = 4, seed = 3) {
  const race = makeRace({ human: 'biscuit', n: Math.max(n, 8) > 8 ? 8 : 8, seed });
  freezeOthers(race, race.player);
  skipCountdown(race);
  return race;
}
const step = (race, n = 1, input = IDLE) => { for (let i = 0; i < n; i++) race.step(DT, input); };

test('config: four exclusive items for biscuit, extra to the 20 general ones', () => {
  assert.deepEqual(Object.keys(EXCLUSIVE_ITEMS).sort(), [...OWN].sort());
  assert.equal(ITEM_IDS.length, 24); assert.equal(GENERAL_ITEM_IDS.length, 20);
  assert.deepEqual(exclusiveItemsFor('biscuit').sort(), [...OWN].sort());
  assert.deepEqual(exclusiveItemsFor('marco'), []);
  for (const id of OWN) {
    const it = ITEMS[id];
    assert.equal(it.exclusive, 'biscuit');
    assert.ok(it.name && it.good && it.how, id);
    assert.ok(it.blurb.length <= 60 && /\.$/.test(it.blurb), `${id} blurb "${it.blurb}" (${it.blurb.length})`);
    assert.ok(ITEM_DEFS[id] && ITEM_WEIGHTS[id], `${id} def + weights`);
  }
});

test('only Biscuit can roll the exclusive items: the general table never contains them', () => {
  for (const id of OWN) { assert.ok(!defaultItemIds().includes(id)); assert.ok(!activeIds().includes(id)); }
  const rng = makeRng(5);
  for (let place = 1; place <= 8; place++) for (let i = 0; i < 3000; i++) {
    assert.ok(!OWN.includes(pickItemFor('marco', place, 8, rng)), 'marco never');
    assert.ok(!OWN.includes(pickItemFor('subnet', place, 8, rng)), 'subnet never');
  }
});

test('Biscuit gets her own items for about 40 % of her draws, the rest are normal items', () => {
  assert.equal(BISCUIT_SHARE, 0.4);
  const rng = makeRng(11), N = 20000, seen = {};
  let own = 0;
  for (let i = 0; i < N; i++) { const id = pickItemFor('biscuit', 4, 8, rng); if (OWN.includes(id)) own++; seen[id] = 1; }
  assert.ok(own / N > 0.36 && own / N < 0.44, `share ${own / N}`);
  for (const id of OWN) assert.ok(seen[id], `${id} reachable for biscuit`);
  assert.ok(Object.keys(seen).some((id) => !OWN.includes(id)), 'and normal items');
});

test('real roulettes: nobody but Biscuit ever ends up holding an exclusive item (human or AI Biscuit)', () => {
  for (const human of ['biscuit', 'marco']) {
    const race = makeRace({ human, n: 8, seed: 21 });
    skipCountdown(race);
    let biscuitOwn = 0, biscuitDraws = 0;
    for (let rep = 0; rep < 60; rep++) for (const r of race.racers) {
      r.item = null; r.item2 = null; r.finished = false;
      race.items.startRoulette(r, 1);
      for (let i = 0; i < 120 && r.itemRoulette; i++) race.items._stepRoulette(r, 0.05);
      assert.ok(r.item, 'got an item');
      if (r.charId === 'biscuit') { biscuitDraws++; if (OWN.includes(r.item.id)) biscuitOwn++; }
      else assert.ok(!OWN.includes(r.item.id), `${r.charId} rolled ${r.item.id}`);
    }
    assert.ok(biscuitOwn > 0 && biscuitOwn < biscuitDraws, `${human}: biscuit own ${biscuitOwn}/${biscuitDraws}`);
  }
});

test('the packet sniffer cannot steal an exclusive item (it gives the thief a consolation boost instead)', () => {
  const race = scene();
  const b = bis(race), m = other(race);
  b.item = null; race.items.give(b, 'poo');
  m.item = null; m.item2 = null;
  const ev = recordEvents(['item:steal'], race);
  race.items.sniff({ ownerId: m.id }, b);
  const e = ev.of('item:steal')[0];
  ev.off();
  assert.ok(e, 'steal event'); assert.equal(e.data.consolation, true); assert.equal(e.data.item, null);
  assert.equal(b.item.id, 'poo', 'Biscuit keeps it'); assert.ok(!m.item && !m.item2);
});

test('poo: dropped behind, a kart driving over it spins out, gets the green smear and a 4 s stink cloud that slows karts', () => {
  const race = scene();
  const b = bis(race), v = other(race), ev = recordEvents(['item:use', 'item:hit', 'item:smear', 'item:stink'], race);
  place(race, b, 100); place(race, v, 80);
  step(race, 2);
  assert.equal(fire(race, b, 'poo'), true);
  const poo = of(race, 'poo')[0];
  assert.ok(poo, 'poo entity'); assert.equal(poo.state, 'armed');
  const sm = race.track.sample(b.kart.ground.s - 3);
  assert.ok(poo.pos.distanceTo(b.kart.pos) < 5);
  // the human is the victim: put the human in its path (swap roles: a "player" victim shows the smear)
  v.isPlayer = true;                                   // the smear is a screen effect for the human only
  v.kart.teleport(poo.pos.clone().setY(poo.pos.y), v.kart.yaw);
  race.track.query(v.kart.pos, v.kart.ground);
  step(race, 3);
  assert.ok(ev.of('item:hit').some((e) => e.data.item === 'poo' && e.data.victimId === v.id), 'poo hit');
  assert.ok(v.kart.status.spin > 0, 'spun out');
  assert.equal(v.screenFx?.kind, 'smear');
  const cloud = of(race, 'stink')[0];
  assert.ok(cloud, 'stink cloud'); assert.equal(of(race, 'poo').length, 0, 'poo consumed');
  step(race, 5);
  assert.ok(v.stinkT > 0, 'slowed while inside the cloud'); assert.ok(ev.of('item:stink').length >= 1);
  step(race, Math.ceil(4.2 / DT));
  assert.equal(of(race, 'stink').length, 0, 'cloud gone after 4 s');
  ev.off();
});

test('poo aimed forward is lobbed ahead; the owner drives clear of it', () => {
  const race = scene();
  const b = bis(race);
  place(race, b, 100); step(race, 2);
  fire(race, b, 'poo', { aimForward: true });
  const poo = of(race, 'poo')[0];
  assert.equal(poo.state, 'thrown');
  step(race, 90);
  assert.equal(poo.state, 'armed', 'it landed ahead of the kart');
  assert.ok(poo.pos.distanceTo(b.kart.pos) > 2 && !(b.kart.status.spin > 0), 'owner not hit while it was in the air');
});

test('woof: shoves karts in the cone sideways, startles them, bats projectiles away, emits item:woof with a shout', () => {
  const race = scene();
  const b = bis(race), v = other(race), behind = other(race, 'subnet');
  place(race, b, 100); place(race, v, 108, 1.5); place(race, behind, 60, 0);
  step(race, 2);
  const ev = recordEvents(['item:use', 'item:woof', 'item:hit'], race);
  const x0 = v.kart.pos.clone(), bx0 = behind.kart.pos.clone();
  race.items.give(b, 'ping'); race.items.use(b, {});               // a ping heading at the victim: our own, so the bark ignores it
  fire(race, b, 'woof');
  const use = ev.of('item:use').find((e) => e.data.item === 'woof');
  assert.ok(use.data.shake && use.data.shout === 'WOOF!');
  const w = ev.of('item:woof')[0].data;
  assert.equal(w.hits, 1, 'only the kart in front is hit'); assert.equal(w.radius, ITEM_DEFS.woof.radius);
  assert.ok(v.startled > 0, 'startled');
  step(race, 12);
  const dx = v.kart.pos.x - x0.x, dz = v.kart.pos.z - x0.z;
  assert.ok(Math.hypot(dx, dz) > 0.5, 'shoved');
  assert.equal(behind.kart.pos.distanceTo(bx0) < 0.01, true, 'the kart far behind is untouched');
  ev.off();
  // projectiles from others are swatted
  const race2 = scene();
  const b2 = bis(race2), a2 = other(race2);
  place(race2, b2, 100); place(race2, a2, 80); step(race2, 2);
  race2.items.give(a2, 'ping'); race2.items.use(a2, {});
  const ping = of(race2, 'ping')[0];
  place(race2, a2, 70);
  ping.pos.copy(b2.kart.pos).add({ x: 0, y: 1, z: -6 }); ping.vel.set(0, 0, 66);
  const ev2 = recordEvents(['item:deflect'], race2);
  fire(race2, b2, 'woof');
  assert.ok(ev2.of('item:deflect').length >= 1 || of(race2, 'ping').length === 0 || of(race2, 'ping')[0].ownerId === b2.id, 'ping deflected');
  ev2.off();
});

test('woof is blocked by a firewall (no shove, no wobble)', () => {
  const race = scene();
  const b = bis(race), v = other(race);
  place(race, b, 100); place(race, v, 106); step(race, 2);
  v.shield = true; v.shieldTime = 10;
  const ev = recordEvents(['item:block'], race);
  fire(race, b, 'woof');
  assert.equal(ev.of('item:block').length, 1); assert.ok(!(v.startled > 0)); assert.equal(v.shield, false);
  ev.off();
});

test('zoomies: five seconds of boost with keen steering, ends with item:end, wobble only off void edges', () => {
  const race = scene();
  const b = bis(race), ev = recordEvents(['item:use', 'item:end'], race);
  place(race, b, 60); step(race, 2);
  fire(race, b, 'zoomies');
  assert.ok(b.zoomies > 4.9 && b.kart.boost.time > 0.5);
  step(race, Math.round(2 / DT), { throttle: 1, brake: 0, steer: 0, drift: false });
  assert.ok(b.kart.boost.time > 0.25, 'boost kept alive');
  assert.ok(Math.abs(b.lastInput.steer) > 0.02, 'erratic steering assist on a straight');
  step(race, Math.round(3.3 / DT), { throttle: 1, brake: 0, steer: 0, drift: false });
  assert.equal(b.zoomies, 0);
  assert.ok(ev.of('item:end').some((e) => e.data.item === 'zoomies'));
  assert.ok(allFinite(race));
  ev.off();
});

test('fetch: the stick homes on the racer ahead, spins them out, boomerangs back and a catch gives a mini-boost; a bark knocks it down', () => {
  const race = scene();
  const b = bis(race), v = other(race);
  place(race, b, 100); place(race, v, 150); step(race, 2);
  const ev = recordEvents(['item:use', 'item:hit', 'item:fetch', 'item:catch'], race);
  fire(race, b, 'fetch');
  const stick = of(race, 'fetch')[0];
  assert.ok(stick && stick.targetId === v.id);
  for (let i = 0; i < 300 && !ev.of('item:fetch').length; i++) step(race);
  assert.ok(ev.of('item:hit').some((e) => e.data.item === 'fetch' && e.data.victimId === v.id), 'hit the racer ahead');
  assert.equal(ev.of('item:fetch')[0].data.hit, true);
  assert.equal(stick.state, 'back');
  place(race, b, race.byId.get('biscuit').kart.ground.s);        // stay put: let it come home
  for (let i = 0; i < 400 && !ev.of('item:catch').length; i++) step(race);
  assert.equal(ev.of('item:catch').length, 1, 'caught');
  assert.ok(b.kart.boost.time > 0.5, 'mini-boost on the catch');
  assert.equal(of(race, 'fetch').length, 0);
  ev.off();
  // a Mega Woof (or a force push) from someone else destroys the returning stick: no boost
  const race2 = scene();
  const b2 = bis(race2), v2 = other(race2), z = other(race2, 'subnet');
  place(race2, b2, 100); place(race2, v2, 140); step(race2, 2);
  fire(race2, b2, 'fetch');
  const ev2 = recordEvents(['item:catch', 'item:fetch'], race2);
  for (let i = 0; i < 300 && !ev2.of('item:fetch').length; i++) step(race2);
  const s2 = of(race2, 'fetch')[0];
  place(race2, z, 100); s2.pos.copy(z.kart.pos).setY(z.kart.pos.y + 1);
  race2.items.give(z, 'forcepush'); race2.items.use(z, {});
  step(race2, 120);
  assert.equal(ev2.of('item:catch').length, 0, 'no catch'); assert.equal(of(race2, 'fetch').length, 0);
  ev2.off();
});

test('fetch from the leader runs the road blind, then comes back', () => {
  const race = scene();
  const b = bis(race);
  for (const r of race.racers) if (r !== b) place(race, r, 20);
  place(race, b, 200); step(race, 2);
  fire(race, b, 'fetch');
  assert.equal(of(race, 'fetch')[0].targetId, null);
  const ev = recordEvents(['item:fetch'], race);
  step(race, 150);
  assert.ok(ev.of('item:fetch').length >= 1 || of(race, 'fetch')[0]?.state === 'back');
  ev.off();
});

test('AI Biscuit uses every one of her items within a race, and nothing blows up', () => {
  for (const id of OWN) {
    const race = makeRace({ n: 8, seed: 9 });
    skipCountdown(race);
    const b = bis(race);
    const ev = recordEvents(['item:use'], race);
    race.items.give(b, id);
    runUntil(race, () => ev.of('item:use').some((e) => e.data.id === 'biscuit' && e.data.item === id), 90);
    assert.ok(ev.of('item:use').some((e) => e.data.id === 'biscuit' && e.data.item === id), `${id} used by the AI`);
    assert.ok(allFinite(race));
    ev.off();
  }
});

test('AI gating: no poo / woof / fetch in a jump zone, no woof shove beside a void edge, zoomies need a clear road', () => {
  const race = makeRace({ n: 8, seed: 4 });
  skipCountdown(race);
  const b = bis(race), ai = b.ai;
  step(race, 5);
  const line = race.line;
  const decide = (id, setup) => {
    b.item = null; b.item2 = null; race.items.give(b, id);
    ai.itemCooldown = 0; ai.heldBy = Object.create(null); ai.reaction = 0;
    const real = { pin: line.at, margin: line.at };
    const acts = { itemPressed: false, aimBack: false, aimForward: false };
    setup?.();
    ai.heldBy[id] = 30;
    decideItem(ai, 0.1, acts);
    return acts.itemPressed;
  };
  const orig = line.at.bind(line);
  line.at = (arr, s) => (arr === line.pinW ? 1 : orig(arr, s));       // everything is a jump zone
  for (const id of ['poo', 'woof', 'fetch', 'zoomies']) assert.equal(decide(id), false, `${id} held back near a jump`);
  line.at = (arr, s) => (arr === line.margin ? 7 : arr === line.pinW ? 0 : orig(arr, s));   // a drop into the void on the edge
  ai.threat = false; ai.aheadR = null;
  assert.equal(decide('woof'), false, 'woof not beside a void edge without a threat');
  line.at = orig;
});

test('eggs: the hydrant is planned from track.sample, on the road, off the racing line, away from the start', () => {
  const race = makeRace({ n: 8, seed: 2 });
  const h = race.eggs.hydrant;
  assert.ok(h, 'planned');
  const L = race.track.length, d = Math.abs(h.lateral), half = race.track.sample(h.s).width / 2;
  assert.ok(h.s > L * 0.1 && h.s < L * 0.95);
  assert.ok(d < half && d > half - 5, `lateral ${d} of half ${half}`);
  const off = race.line.at(race.line.off, h.s);
  assert.ok(Math.sign(h.lateral) !== Math.sign(off) || Math.abs(off) < 0.5, 'on the side away from the racing line');
  assert.deepEqual(planHydrant(race.track, race.line), h, 'deterministic');
});

test('eggs: the hydrant gives Biscuit a tiny boost and a bark, and spins anyone else', () => {
  const race = makeRace({ n: 8, seed: 2 });
  freezeOthers(race, null); skipCountdown(race);
  const b = bis(race), m = other(race), h = race.eggs.hydrant;
  const ev = recordEvents(['egg:hydrant', 'egg:woof', 'item:hit'], race);
  for (const r of race.racers) place(race, r, 10);
  m.kart.teleport(new THREE.Vector3(h.pos.x, h.pos.y, h.pos.z), m.kart.yaw);
  race.track.query(m.kart.pos, m.kart.ground);
  step(race, 3);
  const e1 = ev.of('egg:hydrant')[0];
  assert.ok(e1 && e1.data.id === m.id && e1.data.outcome === 'spin' && e1.data.isBiscuit === false);
  assert.ok(m.kart.status.spin > 0);
  place(race, m, 10);                                   // the spun kart leaves the hydrant alone
  step(race, Math.round((EGGS.hydrantCooldown + 0.5) / DT));
  b.kart.teleport(new THREE.Vector3(h.pos.x, h.pos.y, h.pos.z), b.kart.yaw);
  race.track.query(b.kart.pos, b.kart.ground);
  step(race, 3);
  const e2 = ev.of('egg:hydrant').find((e) => e.data.id === 'biscuit');
  assert.ok(e2 && e2.data.outcome === 'boost' && e2.data.isBiscuit === true);
  assert.ok(b.kart.boost.time > 0.3); assert.ok(!(b.kart.status.spin > 0));
  assert.ok(ev.of('egg:woof').some((e) => e.data.cause === 'hydrant'));
  ev.off();
});

test('eggs: a rare random woof happens, never twice in a row; the horn hook works', () => {
  const race = makeRace({ n: 8, seed: 6 });
  freezeOthers(race, null); skipCountdown(race);
  const ev = recordEvents(['egg:woof'], race);
  runUntil(race, () => ev.of('egg:woof').length >= 1, 90);
  assert.ok(ev.of('egg:woof').length >= 1); assert.equal(ev.of('egg:woof')[0].data.cause, 'random');
  step(race, 4 * 60);
  assert.equal(race.eggs.woof(bis(race), 'honk'), true);
  assert.equal(race.eggs.woof(bis(race), 'honk'), false, 'no machine-gun barking');
  ev.off();
});

test('eggs: a rival pigeon near Biscuit makes her bark and chase it (egg:pigeon-chase), once per pigeon', () => {
  const race = makeRace({ n: 8, seed: 7 });
  freezeOthers(race, null); skipCountdown(race);
  const b = bis(race), m = other(race);
  place(race, b, 100); place(race, m, 90); step(race, 2);
  const ev = recordEvents(['egg:pigeon-chase', 'egg:woof'], race);
  fire(race, m, 'pigeon');
  step(race, 30);
  assert.equal(ev.of('egg:pigeon-chase').length, 1);
  assert.ok(ev.of('egg:woof').some((e) => e.data.cause === 'pigeon'));
  ev.off();
});

test('eggs: tongue on a boost, paw-print event on a drift, fanfare when Biscuit wins', () => {
  const race = makeRace({ n: 8, seed: 8 });
  freezeOthers(race, null); skipCountdown(race);
  const b = bis(race);
  const ev = recordEvents(['egg:tongue', 'egg:pawprint', 'egg:fanfare', 'sfx'], race);
  place(race, b, 100); step(race, 2);
  b.kart.applyBoost(0.8, 1, 'item'); step(race, 3);
  assert.ok(ev.of('egg:tongue').length >= 1);
  b.zoomies = 3; step(race, 2);                           // zoomies print paws like a drift does
  assert.ok(ev.of('egg:pawprint').length >= 1);
  race.eggs.onFinish(b, 1);
  assert.equal(ev.of('egg:fanfare').length, 1);
  assert.ok(ev.of('sfx').some((e) => e.data.name === 'egg-fanfare'));
  race.eggs.onFinish(other(race), 1); race.eggs.onFinish(b, 2);
  assert.equal(ev.of('egg:fanfare').length, 1, 'only for Biscuit, only for first place');
  ev.off();
});

test('meshes, icons, sfx and the Item Guide cover the four items', async () => {
  const { createItemMesh, ITEM_MESH_IDS } = await import('../src/visuals/itemMeshes.js');
  const { itemIcon, ITEM_ICON_IDS } = await import('../src/ui/icons.js');
  const { guideItems, guideCopy } = await import('../src/ui/itemGuide.js');
  const { SFX } = await import('../src/audio/sfx.js');
  for (const id of [...OWN, 'stick', 'stink']) {
    assert.ok(ITEM_MESH_IDS.includes(id), `${id} mesh id`);
    const g = createItemMesh(id);
    assert.ok(g.children.length > 0, `${id} builds`);
    assert.doesNotThrow(() => g.userData.update(1.3, 0.016));
  }
  for (const id of OWN) {
    assert.ok(ITEM_ICON_IDS.includes(id)); assert.match(itemIcon(id), /^<svg[^>]+viewBox="0 0 64 64"/);
    assert.equal(guideCopy(id).exclusive, 'biscuit'); assert.equal(guideCopy(id).exclusiveLabel, 'Biscuit only');
    assert.ok(guideItems('all').some((c) => c.id === id));
    assert.ok(SFX[`item-use-${id}`], `sfx item-use-${id}`);
  }
  for (const n of ['egg-woof', 'egg-fanfare', 'egg-splash', 'item-catch', 'item-hit-poo', 'item-hit-woof']) assert.ok(SFX[n], n);
  assert.equal(guideItems('all').filter((c) => c.exclusive).length, 4);
  const { EggView, PawPrints, createHydrant } = await import('../src/visuals/easterEggs.js');
  assert.ok(createHydrant().children.length > 5);
  const paws = new PawPrints(8);
  paws.stamp(1, 0, 2, 0.5); assert.doesNotThrow(() => paws.update(0.1));
  paws.dispose();
  assert.equal(typeof EggView, 'function');
});

test('a whole AI race with Biscuit stays finite and finishes', () => {
  const race = makeRace({ n: 8, seed: 12 });
  let steps = 0;
  while (race.state !== 'finished' && steps < 60 * 600) { race.step(DT, null); steps++; }
  assert.equal(race.state, 'finished'); assert.ok(allFinite(race));
});

test('HUD: a poo hit on the human gives hud.smear, which fades out', () => {
  const race = scene();
  const b = bis(race), m = other(race);
  place(race, b, 100); place(race, m, 120); step(race, 2);
  race.items.give(m, 'poo'); race.items.use(m, {});
  const poo = of(race, 'poo')[0];
  b.kart.teleport(poo.pos.clone(), b.kart.yaw); race.track.query(b.kart.pos, b.kart.ground);
  step(race, 3);
  assert.equal(race.getHud().smear, 1);
  step(race, Math.round(2.4 / DT));
  const s = race.getHud().smear; assert.ok(s > 0 && s < 1, `fading ${s}`);
  step(race, Math.round(1 / DT));
  assert.equal(race.getHud().smear, 0);
});
