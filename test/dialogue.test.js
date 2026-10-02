import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTERS } from '../src/core/roster.js';
import { BANKS, countLines } from '../src/dialogue/barks/index.js';
import { ShuffleBag, BarkBank, fill, norm } from '../src/dialogue/barkPicker.js';
import { DialogueDirector } from '../src/dialogue/director.js';
import { MARCO_VOICE, voiceLine, voiceTakes } from '../src/core/voicelines.js';
import { assignVoices, SpeechVoice, VOICE_PROFILES } from '../src/audio/speech.js';

const seeded = (seed = 7) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const CORE = ['ready', 'go', 'boost', 'speed', 'drift', 'overtake', 'overtaken', 'take_lead', 'lose_lead', 'hit', 'hit_by_item', 'item_get', 'item_use_attack', 'item_use_defence',
  'item_hit_rival', 'miss', 'dodged', 'block', 'wall', 'fall', 'respawn', 'offroad', 'jump', 'trick', 'shortcut', 'near_miss', 'wrong_way', 'last_place', 'comeback', 'lap2', 'final_lap',
  'finish_win', 'finish_podium', 'finish_lose', 'taunt', 'quip', 'bump', 'bumped', 'trick_fail', 'perfect_release', 'hit_kernel_panic', 'hit_bsod', 'hit_popups', 'hit_shrink', 'hit_spill', 'hit_zeroday', 'hit_pigeon',
  'roast', 'perfect_jump', 'jump_vehicle', 'swap_item', 'double_item', 'class_select', 'welcome', 'select_me', 'gp_win', 'photo_finish', 'start', 'rocket_start', 'bad_start'];

test('shuffle bag uses every item once per round and never repeats back to back', () => {
  const rng = seeded(3);
  const bag = new ShuffleBag(['a', 'b', 'c', 'd', 'e'], rng);
  let prev = null;
  for (let round = 0; round < 40; round++) {
    const seen = new Set();
    for (let i = 0; i < 5; i++) { const x = bag.next(); assert.notEqual(x, prev, 'immediate repeat'); seen.add(x); prev = x; }
    assert.equal(seen.size, 5, 'every item once per round');
  }
  assert.equal(new ShuffleBag([]).next(), null);
  const two = new ShuffleBag(['x', 'y'], rng); prev = null;
  for (let i = 0; i < 50; i++) { const v = two.next(); assert.notEqual(v, prev); prev = v; }
});

test('bark bank: no immediate repeat, {other} handled, item and rival pools', () => {
  const bank = new BarkBank(BANKS.marco, seeded(11));
  let prev = null;
  for (let i = 0; i < 200; i++) { const l = bank.pick('overtake', { other: 'rex', hasOther: true }); assert.ok(l); assert.notEqual(l.t, prev); prev = l.t; }
  for (let i = 0; i < 60; i++) assert.ok(!bank.pick('overtake', { hasOther: false }).t.includes('{other}'), 'no {other} without a rival');
  assert.equal(fill('Hi {other}!', 'Rex'), 'Hi Rex!');
  assert.equal(fill('Hi {other}!', ''), 'Hi you!');
  // item lines only for their items
  for (let i = 0; i < 80; i++) { const l = bank.pick('item_use_defence', { item: 'cuppa' }); assert.ok(!l.items || l.items.includes('cuppa')); }
  const general = new Set(); for (let i = 0; i < 80; i++) general.add(bank.pick('item_use_defence', {}).t);
  assert.ok(![...general].some((t) => /cuppa/i.test(t) && /brew|miracle/i.test(t)), 'item-bound lines stay out of the general pool');
  // vs lines appear for named rivals
  const b2 = new BarkBank(BANKS.tilly, seeded(5)); let vs = 0;
  for (let i = 0; i < 300; i++) if (b2.pick('overtake', { other: 'marco', hasOther: true }).vs) vs++;
  assert.ok(vs > 30 && vs < 200, `vs share ${vs}`);
});

test('every character has a big, complete bark bank', () => {
  for (const c of CHARACTERS) {
    const bank = BANKS[c.id];
    assert.ok(bank, `bank for ${c.id}`);
    for (const cat of CORE) assert.ok(bank[cat]?.length >= 3, `${c.id}.${cat} needs 3+ lines (has ${bank[cat]?.length})`);
    assert.ok(countLines(bank) >= 450, `${c.id} has ${countLines(bank)} lines`);
    assert.ok(countLines(bank, { rude: false }) >= 250, `${c.id} has ${countLines(bank, { rude: false })} mild lines`);
    for (const [cat, arr] of Object.entries(bank)) {
      if (cat === 'vs') continue;
      const texts = arr.map((l) => norm(l).t);
      assert.equal(new Set(texts).size, texts.length, `${c.id}.${cat} has duplicate lines`);
      for (const t of texts) { assert.ok(t.length > 1 && t.length <= 70, `${c.id}.${cat} bad length: ${t}`); }
    }
    // rival-specific pools reference real characters and never the speaker
    for (const rid of Object.keys(bank.vs ?? {})) { assert.ok(BANKS[rid], `${c.id}.vs.${rid}`); assert.notEqual(rid, c.id); }
    assert.ok(Object.keys(bank.vs ?? {}).length >= 2, `${c.id} needs rival-specific lines`);
  }
  assert.deepEqual(Object.keys(BANKS).sort(), CHARACTERS.map((c) => c.id).sort());
});

test('Marco: canonical catalogue lines come first and every voice key is unique and used', () => {
  const keys = MARCO_VOICE.map((v) => v.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate voice keys');
  for (const k of ['ready', 'go', 'boost', 'hit', 'item', 'final_lap', 'win', 'lose']) assert.equal(voiceLine(k).tier, 0, `${k} stays tier 0`);
  const used = new Set();
  for (const [cat, arr] of Object.entries(BANKS.marco)) {
    if (cat === 'vs') continue;
    arr.forEach((l) => {
      const n = norm(l);
      if (!n.key) return;
      used.add(n.key);
      assert.ok(voiceLine(n.key), `${cat}: unknown voice key ${n.key}`);
      assert.equal(n.t, voiceLine(n.key).text, `${cat}: caption must equal the catalogue text of ${n.key}`);
    });
    if (arr.some((l) => norm(l).key && !norm(l).items)) assert.ok(norm(arr[0]).key, `${cat}: the canonical catalogue line comes first`);
  }
  for (const k of keys) assert.ok(used.has(k), `voice key ${k} is never used by a bark`);
  // voiceTakes finds _2, _3 takes
  const Assets = { has: (k) => ['voice_go', 'voice_go_2', 'voice_go_4'].includes(k) };
  assert.deepEqual(voiceTakes(Assets, 'go'), ['voice_go', 'voice_go_2', 'voice_go_4']);
  // recording sheet is in sync with the catalogue
  // (tools/gen_voicelines.mjs): it lists every line that is still unrecorded and nothing that Marco has recorded already
  const sheet = readFileSync(new URL('../VOICELINES.md', import.meta.url), 'utf8');
  for (const v of MARCO_VOICE.filter((x) => x.tier > 0)) assert.ok(sheet.includes(`| voice_${v.key}.mp3 |`), `VOICELINES.md lists ${v.key}`);
  for (const v of MARCO_VOICE.filter((x) => x.tier === 0)) assert.ok(!sheet.includes(`| voice_${v.key}.mp3 |`), `VOICELINES.md must not list the recorded ${v.key}`);
});

// ---- director --------------------------------------------------------------------------------------------------------------------

function rig({ clips = [], seed = 1 } = {}) {
  const handlers = new Map(); const out = []; let t = 100;
  const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, new Set()).get(n)).add(f); return () => handlers.get(n).delete(f); }, emit(n, d) { if (n === 'bark') { d.at = t; out.push(d); } for (const f of [...(handlers.get(n) ?? [])]) f(d); } };
  const racers = [{ id: 'player', charId: 'marco', isPlayer: true, place: 4 }, { id: 'rex', charId: 'rex', place: 1 }, { id: 'tilly', charId: 'tilly', place: 2 }, { id: 'biscuit', charId: 'biscuit', place: 3 }];
  const dir = new DialogueDirector({ bus, rng: seeded(seed), now: () => t, lookup: (id) => racers.find((r) => r.id === id) ?? null, hasClip: (k) => clips.includes(k), nameOf: (c) => c.toUpperCase() }).start();
  dir.beginRace({ playerId: 'player', playerChar: 'marco', total: 4, laps: 3, ids: racers.map((r) => r.id) });
  return { bus, out, dir, racers, tick: (s) => { t += s; }, get t() { return t; } };
}

test('director: player barks use Marco bank, respect cooldowns, and mention the rival by name', () => {
  const r = rig();
  r.bus.emit('race:overtake', { id: 'player', passedId: 'rex', place: 3, isPlayer: true });
  const first = r.out.find((b) => b.isPlayer && b.category === 'overtake');
  assert.ok(first, 'player overtake bark');
  assert.equal(first.charId, 'marco');
  assert.ok(!first.text.includes('{other}'));
  const n = r.out.length;
  r.tick(0.3);
  r.bus.emit('race:overtake', { id: 'player', passedId: 'rex', place: 3, isPlayer: true });
  assert.equal(r.out.filter((b) => b.isPlayer).length, r.out.slice(0, n).filter((b) => b.isPlayer).length, 'cooldown blocks a second overtake bark');
});

test('director: rivals are never held back by one another (voices overlap); only one speaker\'s own barks are spaced, and category cooldowns hold', () => {
  const r = rig({ seed: 4 });
  for (let i = 0; i < 300; i++) {
    r.tick(0.5);
    r.bus.emit('kart:fall', { id: ['rex', 'tilly', 'biscuit'][i % 3] });
  }
  const rivals = r.out.filter((b) => !b.isPlayer && b.category === 'fall');
  assert.ok(rivals.length > 20, `rivals do speak (${rivals.length})`);
  // no shared budget: different rivals speak within a fraction of a second of each other
  let together = 0;
  for (let i = 1; i < rivals.length; i++) if (rivals[i].id !== rivals[i - 1].id && rivals[i].at - rivals[i - 1].at < 0.6) together++;
  assert.ok(together >= 3, `rivals overlap freely (${together} near-simultaneous pairs)`);
  // one speaker: never twice inside the anti-spam gap, and the fall cooldown (3 s) holds
  for (const id of ['rex', 'tilly', 'biscuit']) {
    const mine = r.out.filter((b) => b.id === id);
    for (let i = 1; i < mine.length; i++) assert.ok(mine[i].at - mine[i - 1].at >= 0.4 - 1e-9, `${id} spoke twice within the anti-spam gap`);
    const falls = mine.filter((b) => b.category === 'fall');
    for (let i = 1; i < falls.length; i++) assert.ok(falls[i].at - falls[i - 1].at >= 3 - 1e-9, `${id} fall cooldown`);
  }
});

test('director: hit by an item picks the item-specific category, and clips win over synthesis', () => {
  const r = rig({ clips: ['hit', 'kernel_panic'], seed: 9 });
  let got = null;
  for (let i = 0; i < 12 && !got; i++) {
    r.tick(20);
    r.bus.emit('kart:spin', { id: 'player', cause: 'kernel_panic' });
    r.bus.emit('item:hit', { victimId: 'player', byId: 'rex', item: 'kernel_panic' });
    r.tick(0.1); r.dir.update(0.1, { racers: r.racers, player: { id: 'player', place: 4, kart: { speed: 0, maxSpeed: 50 } }, state: 'racing' });
    got = r.out.find((b) => b.isPlayer && (b.category === 'hit_kernel_panic'));
  }
  assert.ok(got, 'hit_kernel_panic bark');
  const clipBark = r.out.find((b) => b.isPlayer && b.clip);
  if (clipBark) assert.ok(clipBark.key && voiceLine(clipBark.key), 'clip barks carry a real voice key');
  const attackerLine = r.out.find((b) => b.id === 'rex' && b.category === 'item_hit_rival');
  if (attackerLine) assert.ok(!attackerLine.text.includes('{other}'));
});

test('director: place changes make lead barks, and disabled director is silent', () => {
  const r = rig({ seed: 2 });
  const kart = { speed: 10, maxSpeed: 50 };
  const p = r.racers[0];
  const upd = () => r.dir.update(0.1, { racers: r.racers, player: { id: 'player', place: p.place, kart }, state: 'racing' });
  upd(); r.tick(2); upd();          // settle at 4th
  p.place = 1; upd(); r.tick(1.2); upd();
  assert.ok(r.out.some((b) => b.category === 'take_lead'), 'take_lead fired');
  r.dir.enabled = false; const n = r.out.length;
  r.bus.emit('kart:fall', { id: 'player' });
  assert.equal(r.out.length, n);
});

test('director: a player who is not Marco speaks with their own bank', () => {
  const r = rig();
  r.dir.beginRace({ playerId: 'player', playerChar: 'rex', total: 4, laps: 3, ids: r.racers.map((x) => x.id) });
  r.racers[0].charId = 'rex';
  const b = r.dir.sayPlayer('go');
  assert.equal(b.charId, 'rex'); assert.equal(b.clip, false);
});

// ---- speech ----------------------------------------------------------------------------------------------------------------------

test('speech: voices are assigned per character, preferring en-GB and distinct voices', () => {
  const voices = [
    { name: 'Google UK English Male', lang: 'en-GB' }, { name: 'Google UK English Female', lang: 'en-GB' }, { name: 'Daniel', lang: 'en-GB' }, { name: 'Kate', lang: 'en-GB' },
    { name: 'Alex', lang: 'en-US' }, { name: 'Amelie', lang: 'fr-FR' },
  ];
  const a = assignVoices(voices, Object.keys(VOICE_PROFILES));
  for (const v of Object.values(a)) assert.ok(v && /^en/.test(v.lang), 'English voice chosen');
  assert.equal(a.lambda.name.includes('Female') || a.lambda.name === 'Kate', true);
  assert.notEqual(a.marco.name, a.subnet.name);
  assert.deepEqual(assignVoices([], ['marco']), { marco: null });
  assert.equal(assignVoices(null, ['rex']).rex, null);
});

test('speech: no speechSynthesis means silent no-ops; a speaking line is never cut off; three lines wait their turn, stale ones are dropped', () => {
  const none = new SpeechVoice({ synth: null, Utterance: null });
  assert.equal(none.supported, false);
  assert.equal(none.speak({ charId: 'rex', text: 'Hello' }), false);
  none.cancel(); none.setVolume(0.5); none.setEnabled({ rivals: true });

  const spoken = []; let cancels = 0;
  class U { constructor(t) { this.text = t; } }
  const synth = { getVoices: () => [{ name: 'Daniel', lang: 'en-GB' }, { name: 'Kate', lang: 'en-GB' }], speak: (u) => spoken.push(u), cancel: () => { cancels++; } };
  let t = 0;
  const sp = new SpeechVoice({ synth, Utterance: U, now: () => t, rng: () => 0.5 });      // rng 0.5: no random wobble, so the profile values come out exactly
  assert.equal(sp.supported, true);
  assert.equal(sp.available, true);
  assert.equal(sp.speak({ charId: 'rex', text: 'One' }), true);
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].pitch, VOICE_PROFILES.rex.pitch);
  assert.equal(spoken[0].rate, VOICE_PROFILES.rex.rate);
  // more lines arrive while it speaks: they wait (up to three), the speaking one is never cancelled
  assert.equal(sp.speak({ charId: 'tilly', text: 'Two' }), true);
  assert.equal(sp.speak({ charId: 'biscuit', text: 'Three' }), true);
  assert.equal(sp.speak({ charId: 'lambda', text: 'Four' }), true);
  assert.equal(sp.queued, 3);
  assert.equal(sp.speak({ charId: 'packet', text: 'Five' }, { priority: 0 }), false, 'the queue is full of lines at least as important');
  assert.equal(sp.speak({ charId: 'packet', text: 'Five' }), true, 'an equal line bumps the oldest waiting one');
  assert.equal(sp.queued, 3);
  assert.deepEqual(sp._queue.map((q) => q.text), ['Three', 'Four', 'Five']);
  assert.equal(sp.speak({ charId: 'rex', text: 'Again' }), false, 'a speaker cannot start twice within the anti-spam gap');
  assert.equal(spoken.length, 1, 'only one utterance at a time');
  assert.equal(cancels, 0, 'nothing was cancelled'); assert.equal(sp.interrupted, 0);
  assert.equal(sp.speak({ charId: 'marco', text: 'Interjection' }, { idleOnly: true }), false, 'idle-only lines (throwaways) never queue');
  spoken[0].onend(); t += 1;                                               // first ends, the oldest waiting line follows
  assert.equal(spoken.length, 2); assert.match(spoken[1].text, /^Three/);
  // a more important line goes to the front of the queue
  assert.equal(sp.speak({ charId: 'marco', text: 'Urgent' }, { priority: 5 }), true);
  t += 3;                                                                    // everything that was waiting is now stale
  spoken[1].onend();
  assert.equal(spoken.length, 2, 'stale lines (older than 2.5 s) are dropped, not spoken late');
  assert.ok(sp.dropped >= 3, `dropped ${sp.dropped}`);
  assert.equal(sp.queued, 0);
  t += 1;
  // a fresh urgent line beats older ones in the queue
  assert.equal(sp.speak({ charId: 'rex', text: 'Slow one' }), true);
  assert.equal(sp.speak({ charId: 'tilly', text: 'Routine' }), true);
  assert.equal(sp.speak({ charId: 'marco', text: 'Important' }, { priority: 4 }), true);
  spoken[spoken.length - 1].onend(); t += 0.1;
  assert.match(spoken[spoken.length - 1].text, /^Important/, 'priority goes first');
  spoken[spoken.length - 1].onend(); t += 0.1;
  spoken[spoken.length - 1].onend(); t += 1;
  assert.equal(sp.idle, true);
  assert.equal(sp.speak({ charId: 'marco', text: 'Marco line' }, { clipPlaying: true }), false, 'the clipPlaying gate still exists for callers that want it (the game no longer passes it)');
  assert.equal(sp.speak({ charId: 'marco', text: 'Marco line' }), true, 'Marco\'s lines without a recording are spoken by default');
  spoken[spoken.length - 1].onend(); t += 1;
  sp.setEnabled({ marco: false });
  assert.equal(sp.speak({ charId: 'marco', text: 'Marco line' }), false, 'his switch turns them off');
  sp.setEnabled({ marco: true });
  sp.setVolume(0); assert.ok(cancels > 0); assert.equal(sp.speak({ charId: 'rex', text: 'quiet' }), false);
  sp.setVolume(0.7); sp.setEnabled({ rivals: false, marco: false });
  assert.equal(sp.speak({ charId: 'rex', text: 'off' }), false);
});
