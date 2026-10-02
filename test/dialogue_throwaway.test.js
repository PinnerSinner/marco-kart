// Throwaway interjections ('Weeeee!', 'Here we go!', ...): a bark category for all eight characters, fired by ambient events from OTHER racers as
// well as the player, paced by per-character cooldowns, a chance per moment and an idle filler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS } from '../src/core/roster.js';
import { BANKS, MILD_BANKS, RUDE_BANKS } from '../src/dialogue/barks/index.js';
import { BarkBank, norm } from '../src/dialogue/barkPicker.js';
import { DialogueDirector, TWOTA } from '../src/dialogue/director.js';
import { CONTEXTS } from '../src/dialogue/barks/throwaway.js';

const seeded = (seed = 7) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const IDS = CHARACTERS.map((c) => c.id);

function rig({ seed = 3, rude = true } = {}) {
  const handlers = new Map(); const out = []; let t = 100;
  const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, new Set()).get(n)).add(f); return () => handlers.get(n).delete(f); }, emit(n, d) { if (n === 'bark') { d.at = t; out.push(d); } for (const f of [...(handlers.get(n) ?? [])]) f(d); } };
  const rivals = IDS.filter((c) => c !== 'marco');
  const racers = [{ id: 'player', charId: 'marco', isPlayer: true, place: 8, kart: { speed: 10, maxSpeed: 50, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 1 } },
    ...rivals.map((c, i) => ({ id: c, charId: c, place: i + 1, kart: { speed: 10, maxSpeed: 50, pos: { x: (i - 3) * 8, y: 0, z: 10 + i * 3 }, vel: { x: 0, z: 0 }, radius: 1 } }))];
  const dir = new DialogueDirector({ bus, rng: seeded(seed), now: () => t, lookup: (id) => racers.find((r) => r.id === id) ?? null, hasClip: () => false, nameOf: (c) => c.toUpperCase() }).start();
  dir.rude = rude;
  dir.beginRace({ playerId: 'player', playerChar: 'marco', total: 8, laps: 3, ids: racers.map((r) => r.id) });
  const race = { racers, player: racers[0], state: 'racing', items: { entities: [] }, obstacles: [] };
  const upd = (dt = 0.1) => dir.update(dt, race);
  return { bus, out, dir, racers, race, upd, tick: (s) => { t += s; }, get t() { return t; }, tw: () => out.filter((b) => b.category === 'throwaway') };
}

test('throwaway bank: every character has 25+ short interjections (mild and rude variants), tagged for their moments', () => {
  assert.equal(IDS.length, 8);
  for (const id of IDS) {
    const all = BANKS[id].throwaway.map(norm), mild = MILD_BANKS[id].throwaway.map(norm), rude = RUDE_BANKS[id].throwaway.map(norm);
    assert.ok(all.length >= 25, `${id} has ${all.length} throwaways`);
    assert.ok(mild.length >= 20 && rude.length >= 10, `${id}: ${mild.length} mild, ${rude.length} rude`);
    assert.ok(rude.every((l) => l.rude === true) && mild.every((l) => !l.rude), 'the edgy variants (and only they) are tagged rude');
    assert.equal(new Set(all.map((l) => l.t)).size, all.length, `${id}: no duplicates`);
    for (const l of all) {
      const words = l.t.replace(/[.,!?]/g, ' ').split(/\s+/).filter(Boolean).length;
      assert.ok(words >= 1 && words <= 5, `${id}: "${l.t}" is ${words} words`);
      assert.ok(l.t.length <= 28, `${id}: "${l.t}" is short`);
      if (l.on) for (const c of l.on) assert.ok(CONTEXTS.includes(c), `${id}: unknown moment ${c}`);
    }
    for (const c of CONTEXTS) assert.ok(mild.some((l) => l.on?.includes(c)), `${id} has a mild line for "${c}"`);
    assert.ok(mild.filter((l) => !l.on).length >= 5, `${id} has general lines too`);
  }
  assert.ok(BANKS.biscuit.throwaway.some((l) => /woof|bork|pant|arf|sniff/i.test(norm(l).t)), 'Biscuit pants and barks');
  const texts = IDS.flatMap((id) => BANKS[id].throwaway.map((l) => norm(l).t)).join(' | ');
  for (const w of ['Weeeee!', 'Here we go!', 'Yeehaw!', 'Whoopsie!', 'Nope nope nope!', 'Mwahaha!', 'Ooh, shiny!', 'Zoom zoom!', 'Uhuuul!', 'Bora!', 'Eita!']) assert.ok(texts.includes(w), `${w} is in there`);
});

test('throwaway picking: moment lines are preferred for their moment, only general lines otherwise, and the mild game never draws a rude one', () => {
  const bank = new BarkBank(BANKS.marco, seeded(2));
  let hits = 0;
  for (let i = 0; i < 100; i++) { const l = bank.pick('throwaway', { on: 'jump', rude: false }); assert.ok(!l.rude); if (l.on?.includes('jump')) hits++; }
  assert.ok(hits > 60, `jump lines for a jump (${hits}/100)`);
  for (let i = 0; i < 100; i++) { const l = bank.pick('throwaway', { rude: true }); assert.ok(!l.on, 'no moment: only general lines'); }
  const seen = new Set(); for (let i = 0; i < 60; i++) seen.add(bank.pick('throwaway', { on: 'go', rude: false }).t);
  assert.ok(seen.has('Here we go!') || seen.has('Right then, off!') || seen.has('Handbrake off!'));
});

test('throwaway triggers: other racers (not just the player) blurt on jumps, boosts, drifts, near misses, tricks, item boxes and bumps', () => {
  const fired = new Map();
  const EV = {
    jump: (r, id) => r.bus.emit('kart:takeoff', { id, source: 'ramp', perfect: false }),
    boost: (r, id) => r.bus.emit('kart:boost', { id, kind: 'item' }),
    drift: (r, id) => r.bus.emit('kart:drift-start', { id }),
    trick: (r, id) => r.bus.emit('kart:trick-land', { id, ok: true }),
    item: (r, id) => r.bus.emit('item:get', { id, slot: 1 }),
    bump: (r, id) => r.bus.emit('kart:bump', { id, otherId: 'player', impact: 0.3 }),
    wall: (r, id) => r.bus.emit('kart:wall-hit', { id, impact: 0.1 }),
  };
  for (const [name, fire] of Object.entries(EV)) {
    let byRival = 0, byPlayer = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = rig({ seed });
      r.tick(30); r.upd();
      for (const id of ['rex', 'tilly', 'biscuit', 'carlos']) { fire(r, id); r.tick(0.5); }
      fire(r, 'player');
      for (const b of r.tw()) { if (b.isPlayer) byPlayer++; else byRival++; assert.ok(b.text && b.category === 'throwaway' && b.clip === false); }
    }
    fired.set(name, [byRival, byPlayer]);
    assert.ok(byRival > 5, `${name}: rivals blurt (${byRival})`);
  }
  assert.ok([...fired.values()].some(([, p]) => p > 0), 'the player too, now and then');
});

test('throwaway triggers: the green light makes a chorus of rivals ("Here we go!"), the player keeps Marco\'s own start line', () => {
  let chorus = 0, goLines = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = rig({ seed });
    r.tick(5);
    r.bus.emit('race:countdown', { n: 0 });
    const tw = r.tw().filter((b) => b.at === r.t);
    chorus = Math.max(chorus, new Set(tw.map((b) => b.id)).size);
    assert.ok(tw.every((b) => !b.isPlayer), 'only rivals');
    goLines += tw.filter((b) => b.text.length > 0).length;
  }
  assert.ok(chorus >= 3, `several rivals shout at once (${chorus})`);
  assert.ok(goLines > 20);
});

test('throwaway triggers: passing and being passed (rival against rival, from place changes, and from race:overtake), near misses', () => {
  let passes = 0, passed = 0, near = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const r = rig({ seed });
    for (let i = 0; i < 12; i++) { r.tick(0.5); r.upd(0.5); }       // 6 s into the race: past the start line shuffle
    r.tick(10); r.upd(0.2);
    const a = r.racers.find((x) => x.id === 'rex'), b = r.racers.find((x) => x.id === 'tilly');
    [a.place, b.place] = [b.place, a.place];                      // they swap places: no human involved, so no race:overtake exists for it
    r.tick(0.2); r.upd(0.2);
    const tw = r.tw();
    if (tw.some((x) => x.id === 'rex')) passes++;
    if (tw.some((x) => x.id === 'tilly')) passed++;
    r.tick(20);
    r.bus.emit('race:overtake', { id: 'player', passedId: 'biscuit', isPlayer: true, place: 3 });
    // a dodged item
    r.race.items.entities = [{ alive: true, id: 1, type: 'ping', pos: { x: -8, y: 0, z: 10.2 + 0 }, radius: 1, ownerId: 'rex' }];
    const kt = r.racers.find((x) => x.id === 'carlos').kart; kt.pos.x = 0; kt.pos.z = 11;
    for (let x = -8; x <= 8; x += 1.5) { r.race.items.entities[0].pos = { x, y: 0, z: 12.6 }; r.tick(0.05); r.upd(0.05); }
    if (r.tw().some((x) => x.id === 'carlos')) near++;
  }
  assert.ok(passes >= 5 && passed >= 5, `rival passes: ${passes} passers, ${passed} passed`);
  assert.ok(near >= 3, `near misses (${near})`);
});

test('throwaway pacing: a character cools down for 4-8 s, two throwaways are never closer than the global gap (except the green-light chorus), and a real bark is never displaced', () => {
  const r = rig({ seed: 5 });
  r.tick(30);
  for (let i = 0; i < 600; i++) {            // 150 s of constant jumping by everybody
    r.tick(0.25); r.upd(0.25);
    for (const x of r.racers) r.bus.emit('kart:takeoff', { id: x.id, source: 'ramp' });
  }
  const tw = r.tw();
  assert.ok(tw.length > 10);
  for (const id of ['rex', 'tilly', 'biscuit', 'lambda', 'subnet', 'packet', 'carlos', 'player']) {
    const mine = tw.filter((b) => (id === 'player' ? b.isPlayer : b.id === id));
    for (let i = 1; i < mine.length; i++) assert.ok(mine[i].at - mine[i - 1].at >= TWOTA.cooldown[0] - 1e-9, `${id}: ${mine[i].at - mine[i - 1].at} s between throwaways`);
  }
  for (let i = 1; i < tw.length; i++) assert.ok(tw[i].at - tw[i - 1].at >= TWOTA.globalGap - 1e-9, 'global gap');
  // a real bark wins over the throwaway of the same moment (the anti-spam gap lets the first one through)
  const r2 = rig({ seed: 9 });
  r2.tick(30);
  r2.bus.emit('kart:perfect-jump', { id: 'rex' });
  const rexBarks = r2.out.filter((b) => b.id === 'rex');
  assert.ok(rexBarks.length <= 1);
  if (rexBarks.length) assert.equal(rexBarks[0].category, 'perfect_jump');
});

test('throwaway pacing: about one somewhere on screen every 3-5 s in a normal race (idle filler included), never a flood', () => {
  const gaps = []; let total = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const r = rig({ seed });
    r.bus.emit('race:start', {});
    let nextEvent = 3;
    for (let s = 0; s < 1200; s++) {            // 120 s at 10 Hz with a plausible trickle of events
      r.tick(0.1); r.upd(0.1);
      if (r.t - 100 > nextEvent) {
        nextEvent += 4 + (s % 7);
        const id = ['rex', 'tilly', 'biscuit', 'lambda', 'subnet', 'packet', 'carlos'][s % 7];
        const kind = s % 4;
        if (kind === 0) r.bus.emit('kart:takeoff', { id, source: 'ramp' }); else if (kind === 1) r.bus.emit('kart:drift-start', { id }); else if (kind === 2) r.bus.emit('kart:boost', { id, kind: 'pad' }); else r.bus.emit('item:get', { id, slot: 1 });
      }
    }
    const tw = r.tw();
    total += tw.length;
    for (let i = 1; i < tw.length; i++) gaps.push(tw[i].at - tw[i - 1].at);
  }
  const perRace = total / 6, mean = 120 / perRace;
  assert.ok(mean >= 2.5 && mean <= 5.5, `one throwaway every ${mean.toFixed(1)} s on average (${perRace.toFixed(0)} per 2-minute race)`);
  assert.ok(Math.max(...gaps) <= 12, `never silent for long (longest gap ${Math.max(...gaps).toFixed(1)} s)`);
});

test('throwaway: the idle filler is quiet until the race has run a few seconds, and is silent when the director is disabled or the mild game has no rude lines', () => {
  const r = rig({ seed: 2, rude: false });
  for (let i = 0; i < 40; i++) { r.tick(0.1); r.upd(0.1); }
  assert.equal(r.tw().length, 0, 'nothing in the first seconds');
  for (let i = 0; i < 600; i++) { r.tick(0.1); r.upd(0.1); }
  assert.ok(r.tw().length >= 3);
  assert.ok(r.tw().every((b) => !b.rude), 'rude banter off: only mild lines');
  r.dir.enabled = false; const n = r.out.length;
  for (let i = 0; i < 100; i++) { r.tick(0.1); r.upd(0.1); r.bus.emit('kart:takeoff', { id: 'rex', source: 'ramp' }); }
  assert.equal(r.out.length, n);
});
