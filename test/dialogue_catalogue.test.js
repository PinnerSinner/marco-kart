// Marco's recordings, the world-space speech bubbles, the blip voice and the rude/mild switch.
//   catalogue <-> assets/user (every recording is listed once at tier 0, with its measured length) and reachable by a real game event,
//   bubble maths (camera projection, placement, lifetimes) and the bubble queue, blip planning/scheduling, edgy vs mild banks, speech fallbacks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MARCO_VOICE, CLIP_SECONDS, clipPlaySeconds, voiceLine } from '../src/core/voicelines.js';
import { BANKS, MILD_BANKS, RUDE_BANKS, countLines } from '../src/dialogue/barks/index.js';
import { BarkBank, norm, fill } from '../src/dialogue/barkPicker.js';
import { DialogueDirector } from '../src/dialogue/director.js';
import { CHARACTERS } from '../src/core/roster.js';
import { BUBBLE, SAFE, bubbleMs, bubbleState, projectToScreen, distanceScale, inBubbleRange, placeBubble, anchorInView, pickVisible, bubbleStyle } from '../src/dialogue/bubbleMath.js';
import { BubbleSet, wantsBubble, wantsMenuSubtitle } from '../src/dialogue/bubbleQueue.js';
import { planBlips, syllablesOf, BlipVoice, BLIP_TIMBRES } from '../src/audio/blips.js';
import { SpeechVoice, VOICE_PROFILES, estimateSpeechMs, assignVoices } from '../src/audio/speech.js';
import { makeMockContext } from './drive_mockaudio.js';

const seeded = (seed = 7) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const USER = new URL('../assets/user/', import.meta.url);
const files = readdirSync(USER).filter((f) => /^voice_.+\.(mp3|m4a|wav|ogg)$/i.test(f));
const recorded = new Set(files.map((f) => /^voice_(.+?)(?:_[2-9])?\.[a-z0-9]+$/i.exec(f)[1]));

// ---- the catalogue and the recordings ---------------------------------------------------------------------------------------------

/** Length in seconds of an MP3 file, by walking its frame headers (no ffprobe needed). */
function mp3Seconds(buf) {
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let i = 0;
  if (buf.toString('latin1', 0, 3) === 'ID3') i = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  let sec = 0, frames = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (buf[i + 1] >> 3) & 3, layer = (buf[i + 1] >> 1) & 3, bri = buf[i + 2] >> 4, sri = (buf[i + 2] >> 2) & 3, pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { i++; continue; }
    const sr = SR[ver][sri], br = (ver === 3 ? BR1 : BR2)[bri] * 1000, spf = ver === 3 ? 1152 : 576;
    const size = Math.floor(((ver === 3 ? 144 : 72) * br) / sr) + pad;
    sec += spf / sr; frames++; i += size;
  }
  assert.ok(frames > 5, 'is an MP3');
  return sec;
}

test('catalogue: every recording in assets/user is a tier-0 line with a measured length, and every tier-0 line has a recording', () => {
  assert.ok(files.length >= 49, `${files.length} voice files`);
  for (const key of recorded) {
    const v = voiceLine(key);
    assert.ok(v, `assets/user has voice_${key} but the catalogue has no such key`);
    assert.equal(v.tier, 0, `${key} is recorded, so it must be tier 0`);
    assert.ok(CLIP_SECONDS[key] > 0.5, `${key} needs a CLIP_SECONDS entry`);
    assert.equal(clipPlaySeconds(key), CLIP_SECONDS[key], 'clips play in full');
  }
  for (const v of MARCO_VOICE) if (v.tier === 0) assert.ok(recorded.has(v.key), `${v.key} is tier 0 but there is no voice_${v.key} file`);
  for (const v of MARCO_VOICE) if (v.tier > 0) assert.ok(!recorded.has(v.key), `${v.key} is recorded: move it to tier 0`);
  for (const k of Object.keys(CLIP_SECONDS)) assert.ok(recorded.has(k), `CLIP_SECONDS has ${k} but there is no file`);
});

test('catalogue: CLIP_SECONDS matches the real length of every MP3 (so bubbles and cooldowns are timed right)', () => {
  for (const f of files.filter((x) => /\.mp3$/i.test(x))) {
    const key = /^voice_(.+?)(?:_[2-9])?\.mp3$/i.exec(f)[1];
    if (/_[2-9]\.mp3$/i.test(f)) continue;                               // extra takes may differ in length
    const real = mp3Seconds(readFileSync(new URL(f, USER)));
    assert.ok(Math.abs(real - CLIP_SECONDS[key]) < 0.3, `${key}: file is ${real.toFixed(2)} s, CLIP_SECONDS says ${CLIP_SECONDS[key]}`);
  }
});

// A real game event for every category, driven through the director with all of Marco's recordings available.
function makeRig(seed, clips = [...recorded]) {
  const handlers = new Map(); const out = [];
  const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, new Set()).get(n)).add(f); return () => handlers.get(n).delete(f); }, emit(n, d) { if (n === 'bark') out.push(d); for (const f of [...(handlers.get(n) ?? [])]) f(d); } };
  let t = 100;
  const kart = { speed: 0, maxSpeed: 50, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 1 };
  const racers = [{ id: 'player', charId: 'marco', isPlayer: true, place: 4, kart }, { id: 'rex', charId: 'rex', place: 1 }, { id: 'tilly', charId: 'tilly', place: 2 }, { id: 'biscuit', charId: 'biscuit', place: 3 }];
  const dir = new DialogueDirector({ bus, rng: seeded(seed), now: () => t, lookup: (id) => racers.find((r) => r.id === id) ?? null, hasClip: (k) => clips.includes(k), nameOf: (c) => c.toUpperCase() }).start();
  dir.beginRace({ playerId: 'player', playerChar: 'marco', total: 4, laps: 3, ids: racers.map((r) => r.id) });
  const race = { racers, player: racers[0], state: 'racing', items: { entities: [] }, obstacles: [] };
  const upd = (dt = 0.1) => { race.player.place = racers[0].place; dir.update(dt, race); };
  return { bus, out, dir, racers, kart, race, upd, tick: (s) => { t += s; }, get t() { return t; } };
}

const EMIT = {
  ready: (r) => r.dir.sayPlayer('ready'),
  go: (r) => r.dir.sayPlayer('go'),
  boost: (r) => r.bus.emit('kart:boost', { id: 'player', kind: 'item' }),
  rocket_start: (r) => r.bus.emit('kart:boost', { id: 'player', kind: 'start' }),
  mini_turbo: (r) => r.bus.emit('kart:boost', { id: 'player', kind: 'drift' }),
  drift: (r) => r.bus.emit('kart:drift-start', { id: 'player' }),
  max_charge: (r) => r.bus.emit('kart:drift-level', { id: 'player', level: 3 }),
  hit: (r) => { r.bus.emit('kart:spin', { id: 'player', cause: 'bump' }); r.tick(0.2); r.upd(); },
  hit_kernel_panic: (r) => { r.bus.emit('item:hit', { victimId: 'player', byId: 'rex', item: 'kernel_panic' }); r.tick(0.2); r.upd(); },
  hit_bsod: (r) => { r.bus.emit('item:hit', { victimId: 'player', byId: 'rex', item: 'bsod' }); r.tick(0.2); r.upd(); },
  hit_popups: (r) => { r.bus.emit('item:hit', { victimId: 'player', byId: 'rex', item: 'popups' }); r.tick(0.2); r.upd(); },
  hit_shrink: (r) => { r.bus.emit('kart:shrink', { id: 'player' }); r.tick(0.2); r.upd(); },
  item_get: (r) => r.bus.emit('item:get', { id: 'player', slot: 1 }),
  double_item: (r) => r.bus.emit('item:get', { id: 'player', slot: 2 }),
  swap_item: (r) => r.bus.emit('item:swap', { id: 'player' }),
  item_use_attack: (r) => { for (const item of ['ping', 'coconut', 'ddos']) { r.tick(20); r.bus.emit('item:use', { id: 'player', item }); } },
  item_use_defence: (r) => { for (const item of ['sudo', 'fibre', 'cuppa', 'firewall']) { r.tick(20); r.bus.emit('item:use', { id: 'player', item }); } },
  item_hit_rival: (r) => r.bus.emit('item:hit', { victimId: 'rex', byId: 'player', item: 'ping' }),
  block: (r) => r.bus.emit('item:block', { id: 'player', byId: 'rex' }),
  miss: (r) => r.bus.emit('item:block', { id: 'rex', byId: 'player' }),
  dodged: (r) => { r.race.items.entities = [{ alive: true, id: 1, type: 'ping', pos: { x: -8, y: 0, z: 3.2 }, radius: 1, ownerId: 'rex' }]; for (let x = -8; x <= 8; x += 1.5) { r.race.items.entities[0].pos.x = x; r.tick(0.05); r.upd(0.05); } },
  near_miss: (r) => { r.race.items.entities = [{ alive: true, id: 2, type: 'cable', pos: { x: -8, y: 0, z: 3.2 }, radius: 1, ownerId: 'rex' }]; for (let x = -8; x <= 8; x += 1.5) { r.race.items.entities[0].pos.x = x; r.tick(0.05); r.upd(0.05); } },
  wall: (r) => r.bus.emit('kart:wall-hit', { id: 'player', impact: 1 }),
  fall: (r) => r.bus.emit('kart:fall', { id: 'player' }),
  respawn: (r) => r.bus.emit('kart:respawn', { id: 'player' }),
  jump: (r) => r.bus.emit('kart:land', { id: 'player', impact: 0.9 }),
  perfect_jump: (r) => r.bus.emit('kart:perfect-jump', { id: 'player' }),
  jump_vehicle: (r) => r.bus.emit('kart:takeoff', { id: 'player', source: 'vehicle' }),
  trick: (r) => r.bus.emit('kart:trick-land', { id: 'player', ok: true }),
  shortcut: (r) => r.bus.emit('race:shortcut', { id: 'player' }),
  wrong_way: (r) => r.bus.emit('race:wrong-way', { on: true }),
  overtake: (r) => r.bus.emit('race:overtake', { id: 'player', passedId: 'rex', place: 3, isPlayer: true }),
  overtaken: (r) => r.bus.emit('race:overtake', { id: 'rex', passedId: 'player', place: 1 }),
  lap2: (r) => r.bus.emit('race:lap', { id: 'player', isPlayer: true, lap: 1, laps: 3 }),
  final_lap: (r) => r.bus.emit('race:final-lap', { id: 'player' }),
  finish_win: (r) => r.bus.emit('race:finish', { id: 'player', isPlayer: true, place: 1, time: 80 }),
  finish_podium: (r) => r.bus.emit('race:finish', { id: 'player', isPlayer: true, place: 2, time: 81 }),
  finish_lose: (r) => r.bus.emit('race:finish', { id: 'player', isPlayer: true, place: 4, time: 90 }),
  photo_finish: (r) => { r.bus.emit('race:finish', { id: 'rex', place: 1, time: 80 }); r.bus.emit('race:finish', { id: 'player', isPlayer: true, place: 2, time: 80.1 }); },
  quip: (r) => { r.tick(70); r.upd(); },
  welcome: (r) => r.bus.emit('ui:title-key', {}),
  select_me: (r) => r.bus.emit('ui:pick', { field: 'charId', value: 'marco' }),
  gp_win: (r) => r.bus.emit('gp:done', { charId: 'marco', trophy: 'gold' }),
  take_lead: (r) => { r.upd(); r.tick(2); r.upd(); r.racers[0].place = 1; r.upd(); r.tick(1.2); r.upd(); },
  lose_lead: (r) => { r.racers[0].place = 1; r.upd(); r.tick(2); r.upd(); r.racers[0].place = 3; r.upd(); r.tick(1.2); r.upd(); },
  comeback: (r) => { r.upd(); r.tick(2); r.upd(); r.racers[0].place = 2; r.upd(); r.tick(1.2); r.upd(); },
  speed: (r) => { r.kart.speed = 50; for (let i = 0; i < 6; i++) { r.tick(1); r.upd(1); } },
  bad_start: (r) => { r.bus.emit('race:start', {}); r.kart.speed = 0; r.tick(2); r.upd(2); },
  offroad: (r) => { r.bus.emit('kart:surface', { id: 'player', surface: 'grass' }); r.tick(2); r.upd(); },
};

test('every recording is reachable: a real game event makes Marco say it, with the clip flag set', () => {
  const keyCats = new Map();                                                  // recorded key -> categories of Marco's bank that carry it
  for (const [cat, arr] of Object.entries(BANKS.marco)) {
    if (cat === 'vs') continue;
    for (const l of arr) { const n = norm(l); if (n.key && recorded.has(n.key)) (keyCats.get(n.key) ?? keyCats.set(n.key, new Set()).get(n.key)).add(cat); }
  }
  const heard = new Map();                                                    // category -> keys heard when it was triggered
  const cats = new Set([...keyCats.values()].flatMap((s) => [...s]));
  for (const cat of cats) {
    assert.ok(EMIT[cat], `no event wired for the category "${cat}" in this test: add one (or wire it in the director)`);
    const keys = new Set();
    for (let seed = 1; seed <= 90; seed++) {
      const r = makeRig(seed);
      EMIT[cat](r);
      for (const b of r.out) if (b.isPlayer && b.key) { keys.add(b.key); if (recorded.has(b.key)) assert.equal(b.clip, true, `${b.key} must play its clip`); }
    }
    heard.set(cat, keys);
  }
  const all = new Set([...heard.values()].flatMap((s) => [...s]));
  for (const key of recorded) {
    if (key === 'menu_welcome') assert.ok(all.has(key), 'menu_welcome plays on the first key press at the title');
    assert.ok(all.has(key), `voice_${key} is never played by any game event (categories: ${[...(keyCats.get(key) ?? [])].join(', ') || 'none'})`);
  }
});

test('director: a long clip holds nothing back: rivals keep talking over it, and its floating text still lasts as long as the clip', () => {
  const r = makeRig(5);
  r.bus.emit('kart:fall', { id: 'player' });
  const fall = r.out.find((b) => b.key === 'fall');
  assert.ok(fall, 'fall clip');
  assert.ok(fall.ms >= CLIP_SECONDS.fall * 1000, `bubble (${fall.ms} ms) outlasts the ${CLIP_SECONDS.fall} s clip`);
  const n = r.out.length;
  for (let i = 0; i < 40; i++) { r.tick(0.2); r.bus.emit('race:overtake', { id: 'rex', passedId: 'tilly', place: 1 }); r.bus.emit('kart:bump', { id: 'tilly', otherId: 'rex' }); r.bus.emit('kart:fall', { id: 'biscuit' }); }
  const during = r.out.slice(n).filter((b) => !b.isPlayer);
  assert.ok(during.length >= 3, `rivals talk while the ${CLIP_SECONDS.fall} s clip plays (${during.length} barks in 8 s)`);
  assert.ok(new Set(during.map((b) => b.id)).size >= 2, 'several rivals at once');
  assert.ok(r.out.slice(n).every((b) => b.cut === false), 'nothing is flagged to cut anything off');
  // the player's own next line is not held back either: only the per-speaker anti-spam gap and its category cooldown apply
  r.tick(2);
  const m = r.out.length;
  for (const cat of ['wall', 'hit', 'overtake', 'boost']) r.dir.say('player', cat, { chance: 1, otherId: 'rex' });
  assert.ok(r.out.slice(m).filter((b) => b.isPlayer).length >= 1, 'the player speaks while the clip is still playing');
});

// ---- rude / mild ---------------------------------------------------------------------------------------------------------------------

test('rude banter: every character has 150+ edgy lines of their own; the mild banks are complete without them', () => {
  for (const c of CHARACTERS) {
    const rude = countLines(RUDE_BANKS[c.id]);
    assert.ok(rude >= 150, `${c.id} has ${rude} edgy lines`);
    const mild = countLines(MILD_BANKS[c.id]);
    assert.ok(mild >= 250, `${c.id} has ${mild} mild lines`);
    assert.equal(countLines(BANKS[c.id]), mild + rude, 'merged = mild + rude');
    assert.equal(countLines(BANKS[c.id], { rude: false }), mild, 'rude:false counts the mild lines only');
    for (const cat of Object.keys(BANKS[c.id])) {
      if (cat === 'vs') continue;
      const mildCat = BANKS[c.id][cat].map(norm).filter((l) => !l.rude);
      assert.ok(mildCat.length >= 3, `${c.id}.${cat}: the mild game needs 3+ clean lines (has ${mildCat.length})`);
    }
    for (const [cat, arr] of Object.entries(RUDE_BANKS[c.id])) {
      const pools = cat === 'vs' ? Object.values(arr) : [arr];
      for (const pool of pools) for (const l of pool) { assert.equal(norm(l).rude, true, `${c.id}.${cat}: edgy lines are tagged`); assert.ok(norm(l).t.length <= 70, `${c.id}.${cat}: too long: ${norm(l).t}`); }
    }
  }
});

test('rude banter: the edgy banks stay clear of slurs, sex, self-harm, children and real people', () => {
  const BANNED = /\b(cunt|nigg\w*|fag\w*|retard\w*|spastic|paki|chink|tranny|mong|cripple\w*|gyp\w*|pikey|whore|slut|rape\w*|paedo\w*|pedo\w*|kill yourself|suicide|child\w*|kids?|toddler|school\w*|teen\w*|trump|putin|musk|bezos|farage|boris|starmer|sunak|biden|hitler|nazi\w*|jew\w*|muslim\w*|christian\w*|sex\w*|porn\w*|dildo|boobs?|penis|vagina|orgasm|molest\w*|homeless|autis\w*|schizo\w*|cancer|dementia)\b/i;
  const seen = new Set();
  for (const c of CHARACTERS) {
    for (const [cat, arr] of Object.entries(RUDE_BANKS[c.id])) {
      for (const pool of cat === 'vs' ? Object.values(arr) : [arr]) for (const l of pool) {
        const t = norm(l).t;
        assert.ok(!BANNED.test(t), `${c.id}.${cat}: not for this game: ${t}`);
        seen.add(t.toLowerCase());
      }
    }
  }
  const swears = [...seen].filter((t) => /\b(bollocks|arse\w*|bloody|shite?|git|wank\w*|knob\w*|tits?|sod\w*|tosser\w*|bastards?|piss\w*|bugger\w*|fuck\w*|bell-?end|twat)\b/.test(t));
  assert.ok(swears.length >= 200, `the edgy lines actually swear (${swears.length} do)`);
});

test('rude banter: the six optional Marco recordings are keyed lines that say exactly the catalogue text', () => {
  const rudeKeys = MARCO_VOICE.filter((v) => v.rude).map((v) => v.key);
  assert.equal(rudeKeys.length, 6);
  const used = new Map();
  for (const [cat, arr] of Object.entries(RUDE_BANKS.marco)) {
    if (cat === 'vs') continue;
    for (const l of arr) { const n = norm(l); if (n.key) used.set(n.key, n.t); }
  }
  for (const k of rudeKeys) { assert.ok(used.has(k), `${k} appears in Marco's edgy bank`); assert.equal(used.get(k), voiceLine(k).text); }
  // and none of them is on the sheet's main list
  assert.ok(!MARCO_VOICE.some((v) => v.rude && v.tier === 0));
});

test('rude banter: director.rude=false never emits an edgy line; with it on they are a good share', () => {
  const run = (rude) => {
    let rudeN = 0, total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = makeRig(seed, []);                                        // no recordings: spoken lines only
      r.dir.rude = rude;
      for (const cat of ['overtake', 'overtaken', 'wall', 'fall', 'item_hit_rival', 'boost']) {
        for (let k = 0; k < 4; k++) { r.tick(40); EMIT[cat](r); }
      }
      for (const b of r.out) { total++; if (b.rude) rudeN++; }
    }
    return { rudeN, total };
  };
  const mild = run(false), edgy = run(true);
  assert.ok(mild.total > 200 && edgy.total > 200);
  assert.equal(mild.rudeN, 0, 'mild game: no edgy line');
  assert.ok(edgy.rudeN / edgy.total > 0.3 && edgy.rudeN / edgy.total < 0.9, `edgy share ${(edgy.rudeN / edgy.total).toFixed(2)}`);
});

test('rude banter: lines that name the other racer are never edgy when that racer is a real person in the custom slot', () => {
  const bank = new BarkBank(BANKS.rex, seeded(3));
  let named = 0;
  for (let i = 0; i < 300; i++) {
    const l = bank.pick('overtake', { other: 'biscuit', hasOther: true, noRudeOther: true, rude: true, rudeBias: 1 });
    assert.ok(l); assert.ok(!(l.rude && l.t.includes('{other}')), `edgy line names the custom racer: ${l.t}`);
    assert.ok(!l.vs, 'the dog-specific pool is skipped for a real person');
    if (l.t.includes('{other}')) named++;
  }
  assert.ok(named >= 0);
  const dir = makeRig(2, []);
  const d2 = new DialogueDirector({ bus: dir.bus, rng: seeded(9), now: () => dir.t, lookup: (id) => dir.racers.find((x) => x.id === id), isCustom: (c) => c === 'biscuit', nameOf: (c) => (c === 'biscuit' ? 'Dave' : c) }).start();
  d2.beginRace({ playerId: 'player', playerChar: 'marco', total: 4, laps: 3, ids: dir.racers.map((x) => x.id) });
  for (let i = 0; i < 60; i++) { dir.tick(30); d2.say('player', 'overtake', { otherId: 'biscuit' }); }
  for (const b of d2.log) if (b.rude) assert.ok(!b.text.includes('Dave'), `edgy line names Dave: ${b.text}`);
});

// ---- bubble maths -----------------------------------------------------------------------------------------------------------------------

test('bubbles: projectToScreen agrees with THREE for a moving camera, and flags points behind it', () => {
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2500);
  const W = 1280, H = 720, out = {};
  for (const [cx, cy, cz, lx, ly, lz] of [[0, 3, 10, 0, 1, 0], [20, 5, -30, -4, 0, 12], [-8, 2, 6, 5, 3, -9]]) {
    cam.position.set(cx, cy, cz); cam.lookAt(lx, ly, lz); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    for (const [x, y, z] of [[lx, ly, lz], [lx + 2, ly + 1, lz], [lx - 3, ly + 2, lz + 1.5], [lx, ly + 4, lz - 2]]) {
      const v = new THREE.Vector3(x, y, z).project(cam);
      projectToScreen(cam, x, y, z, W, H, out);
      assert.ok(!out.behind);
      assert.ok(Math.abs(out.x - (v.x * 0.5 + 0.5) * W) < 0.01 && Math.abs(out.y - (1 - (v.y * 0.5 + 0.5)) * H) < 0.01, `(${x},${y},${z}) -> ${out.x},${out.y} vs ${(v.x * 0.5 + 0.5) * W},${(1 - (v.y * 0.5 + 0.5)) * H}`);
      assert.ok(Math.abs(out.dist - Math.hypot(x - cx, y - cy, z - cz)) < 1e-6);
    }
  }
  cam.position.set(0, 2, 10); cam.lookAt(0, 2, 0); cam.updateMatrixWorld();
  projectToScreen(cam, 0, 2, 0, W, H, out);
  assert.ok(Math.abs(out.x - W / 2) < 0.01 && Math.abs(out.y - H / 2) < 0.01 && out.onScreen);
  projectToScreen(cam, 0, 2, 14, W, H, out);
  assert.equal(out.behind, true); assert.equal(out.onScreen, false);
  projectToScreen(cam, 400, 2, 0, W, H, out);
  assert.equal(out.onScreen, false);
});

test('bubbles: placement keeps the bubble inside the safe rectangle (clear of the HUD) and the pointer on the speaker', () => {
  const W = 960, H = 540, w = 200, h = 60;
  const mid = placeBubble(480, 300, w, h, W, H, SAFE);
  assert.equal(mid.x, 480); assert.equal(mid.y, 300); assert.equal(mid.side, null); assert.equal(mid.tail, 50);
  const left = placeBubble(30, 300, w, h, W, H, SAFE);
  assert.ok(left.x - w / 2 >= W * SAFE.left, 'clear of the left HUD column');
  assert.ok(left.tail < 50 && left.tail >= 10, 'pointer leans toward the speaker');
  const right = placeBubble(950, 300, w, h, W, H, SAFE);
  assert.ok(right.x + w / 2 <= W * (1 - SAFE.right), 'clear of the minimap column');
  assert.ok(right.tail > 50 && right.tail <= 90);
  const low = placeBubble(480, 530, w, h, W, H, SAFE);
  assert.ok(low.y <= H * SAFE.bottom, 'clear of the speedometer row');
  const high = placeBubble(480, 10, w, h, W, H, SAFE);
  assert.ok(high.y - h >= H * SAFE.top - 1e-6, 'clear of the top row');
  assert.equal(placeBubble(-20, 100, w, h, W, H, SAFE).side, 'l');
  assert.equal(placeBubble(W + 20, 100, w, h, W, H, SAFE).side, 'r');
  assert.equal(anchorInView(480, 270, W, H), true);
  assert.equal(anchorInView(-200, 270, W, H), false);
  assert.equal(anchorInView(480, 600, W, H), false);
  assert.equal(anchorInView(480, -50, W, H), false);
});

test('bubbles: size falls with distance, range is limited, and lifetimes follow the text, the speech and the clip', () => {
  assert.equal(distanceScale(5), 1); assert.equal(distanceScale(BUBBLE.nearM), 1);
  assert.ok(distanceScale(40) < 1 && distanceScale(40) > BUBBLE.minScale);
  assert.equal(distanceScale(500), BUBBLE.minScale);
  assert.equal(inBubbleRange(30), true); assert.equal(inBubbleRange(BUBBLE.farM + 1), false);
  assert.equal(bubbleMs('Hi'), BUBBLE.minMs);
  assert.ok(bubbleMs('x'.repeat(40)) > bubbleMs('Hi'));
  assert.ok(bubbleMs('x'.repeat(200)) <= BUBBLE.maxTextMs);
  assert.ok(bubbleMs('x'.repeat(40), 0, 3500) > bubbleMs('x'.repeat(40)), 'spoken lines stay up while they are said');
  assert.ok(bubbleMs('x'.repeat(40), 0, 20000) <= BUBBLE.maxSpeechMs);
  assert.ok(bubbleMs('Not the void!', CLIP_SECONDS.fall) >= CLIP_SECONDS.fall * 1000, 'a recording stays up for the whole clip');
  assert.ok(bubbleMs('Hi', 0.3) >= BUBBLE.minMs);
  for (const [text, min, max] of [['Oh, bollocks!', 1200, 2600], ['Who threw that, you absolute bell-end?!', 1200, 2600]]) { const ms = bubbleMs(text); assert.ok(ms >= min && ms <= max, `${text}: ${ms}`); }
  const life = 2000;
  assert.equal(bubbleState(0, life).phase, 'in');
  assert.ok(bubbleState(100, life).pop > 0 && bubbleState(100, life).pop < 1.2);
  assert.equal(bubbleState(1000, life).phase, 'hold'); assert.equal(bubbleState(1000, life).alpha, 1);
  assert.equal(bubbleState(1900, life).phase, 'out'); assert.ok(bubbleState(1900, life).alpha < 1);
  assert.equal(bubbleState(life, life).phase, 'done');
  assert.deepEqual(['marco', 'subnet', 'lambda', 'packet', 'carlos', 'tilly', 'rex', 'biscuit'].map(bubbleStyle).length, 8);
  assert.equal(new Set(['subnet', 'lambda', 'packet', 'carlos', 'tilly', 'rex', 'biscuit'].map(bubbleStyle)).size, 7, 'a delivery style of its own for every rival');
});

test('bubbles: at most three at once, one per speaker, the human first, nobody bumped before a fair look', () => {
  const removed = [];
  const set = new BubbleSet({ onRemove: (e) => removed.push(e.id) });
  const b = (id, extra = {}) => ({ id, charId: id === 'player' ? 'marco' : id, text: `Hello from ${id}`, ms: 2000, isPlayer: id === 'player', ...extra });
  assert.ok(set.add(b('rex'), 0)); assert.ok(set.add(b('tilly'), 100)); assert.ok(set.add(b('biscuit'), 200));
  assert.equal(set.size, 3);
  assert.equal(set.add(b('lambda'), 300), null, 'a fresh rival bubble is not bumped by another rival');
  assert.equal(set.size, 3);
  assert.ok(set.add(b('lambda'), 1500), 'after 40% of its life the oldest makes room');
  assert.deepEqual(removed, ['rex']);
  assert.ok(set.add(b('player'), 1600), 'the human always gets a bubble');
  assert.equal(set.size, 3);
  assert.equal(set.ordered()[0].id, 'player', 'the human is drawn first');
  const again = set.add(b('player', { text: 'Again' }), 1700);
  assert.equal(set.entries.filter((e) => e.id === 'player').length, 1, 'one bubble per speaker');
  assert.equal(again.text, 'Again');
  set.prune(1700 + 3000);
  assert.equal(set.size, 0, 'everything expires');
  assert.equal(set.add({ id: 'menu', charId: 'marco', text: 'Welcome', menu: true, isPlayer: true, ms: 3000 }, 0), null, 'menu lines have no kart to hang a bubble on');
  assert.ok(set.add(b('rex', { ms: 100 }), 0).ms >= BUBBLE.minMs, 'never shorter than the minimum');
  set.clear(); assert.equal(set.size, 0);
  set.enabled = false; assert.equal(set.add(b('rex'), 0), null);
  assert.deepEqual(pickVisible([{ isPlayer: false, t0: 1 }, { isPlayer: true, t0: 0 }, { isPlayer: false, t0: 5 }, { isPlayer: false, t0: 3 }], 3).map((e) => e.t0), [0, 5, 3]);
});

test('floating text: every racer\'s line (the human\'s too) floats over a kart; only menu lines get the small bottom-centre subtitle; no HUD caption box is left', () => {
  assert.equal(wantsBubble({ text: 'x', isPlayer: true }), true, 'the player\'s own line floats over the player\'s kart');
  assert.equal(wantsBubble({ text: 'x' }), true);
  assert.equal(wantsBubble({ text: 'x', menu: true }), false);
  assert.equal(wantsBubble({ text: '' }), false);
  assert.equal(wantsMenuSubtitle({ text: 'x', menu: true }), true);
  assert.equal(wantsMenuSubtitle({ text: 'x', isPlayer: true, clip: true, ms: 8000 }), false, 'a long recording is not a subtitle any more');
  assert.equal(wantsMenuSubtitle({ text: 'x' }), false);
  const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const hud = read('../src/ui/hud.js'), hudCss = read('../src/ui/styles/hud.js'), bubCss = read('../src/ui/styles/bubbles.js'), ui = read('../src/ui/UI.js'), wb = read('../src/ui/worldBubbles.js');
  assert.ok(!/caption\(|_capQ|\.captions/.test(hud + ui), 'the HUD caption box is gone');
  assert.ok(!/\.caption/.test(hudCss), 'and so is its CSS');
  assert.ok(!/wb-card|wb-tail|wb-n\b|!important/.test(bubCss + wb), 'the floating text is just text: no card, tail, name or portrait');
  assert.ok(/Floating speech text/.test(read('../src/ui/screens/settings.js')) && !/Speech bubbles/.test(read('../src/ui/screens/settings.js')));
});

// ---- blip voice -----------------------------------------------------------------------------------------------------------------------

test('blips: one blip per syllable, spread over the line, in each character\'s own timbre', () => {
  assert.equal(syllablesOf('').length, 0);
  assert.equal(syllablesOf('Hello there, friend!').length, 5);
  assert.equal(syllablesOf('{other} sod').length, 2, '{other} counts as one word');
  const rng = seeded(4);
  for (const id of Object.keys(BLIP_TIMBRES)) {
    const text = 'Right then, you absolute melons, shift it!';
    const p = planBlips(id, text, { rng });
    assert.ok(p.events.length >= 6, `${id} babbles`);
    assert.ok(p.events.length <= syllablesOf(text).length);
    let prev = -1;
    for (const e of p.events) {
      assert.ok(e.t >= prev && e.dur > 0.02 && e.dur < 0.2, 'sane timing'); prev = e.t;
      assert.ok(Number.isFinite(e.freq) && e.freq > 30 && e.freq < 4000, `${id} freq ${e.freq}`);
      assert.ok(e.gain > 0 && e.gain <= 1.3);
    }
    assert.ok(p.totalMs > 500 && p.totalMs < 7000);
  }
  const mean = (id) => { const e = planBlips(id, 'One two three four five six seven eight', { rng: seeded(1) }).events; return e.reduce((a, x) => a + x.freq, 0) / e.length; };
  assert.ok(mean('biscuit') > mean('marco') * 2, 'the dog is high');
  assert.ok(mean('rex') < mean('marco') / 1.8, 'the robot is low');
  assert.ok(mean('subnet') < mean('rex') / 1.3, 'the giant is lower still');
  assert.equal(new Set(Object.values(BLIP_TIMBRES).map((t) => `${t.wave}|${t.base}`)).size, 8, 'a timbre of its own each');
  // the blips end with the text: a longer line is a longer babble, and an explicit duration is honoured (within the pause budget)
  const short = planBlips('marco', 'Oi!', { rng: seeded(2) }), long = planBlips('marco', 'Oi, you absolute pack of muppets, get out of the way!', { rng: seeded(2) });
  assert.ok(long.totalMs > short.totalMs * 2);
  const spread = planBlips('marco', 'Keep up, class, keep up, you absolute melons, shift it!', { rng: seeded(2), durationMs: 2600 });
  assert.ok(Math.abs(spread.totalMs - 2600) < 700, `spread over the speaking time: ${spread.totalMs}`);
  // packet loses some syllables, the same text always plans the same with the same seed
  const lossy = planBlips('packet', 'a b c d e f g h i j k l m n o p q r s t u v w x y z '.repeat(3), { rng: seeded(8) });
  assert.ok(lossy.events.length < syllablesOf('a b c d e f g h i j k l m n o p q r s t u v w x y z '.repeat(3)).length);
  assert.deepEqual(planBlips('tilly', 'Darling, do mind', { rng: seeded(5) }), planBlips('tilly', 'Darling, do mind', { rng: seeded(5) }));
});

test('blips: BlipVoice schedules oscillators on a fake context, lets lines overlap, applies only the anti-spam gap and the voice cap, fades out, and never throws without audio', () => {
  const none = new BlipVoice();
  assert.equal(none.play({ charId: 'rex', text: 'Hello there' }), false);
  none.stop();
  const ctx = makeMockContext();
  const dest = ctx.createGain();
  const v = new BlipVoice({ ctx: () => ctx, dest: () => dest, rng: seeded(6) });
  assert.equal(v.play({ charId: 'rex', text: 'sudo make me a sandwich' }, { gain: 0.8 }), true);
  assert.ok(v.nodes >= 5 && ctx.stats.byKind.osc === v.nodes, 'one oscillator per blip');
  assert.equal(v.playing, true);
  const first = v.nodes;
  // another speaker babbles on top of it at once: nothing is cut, nothing waits
  assert.equal(v.play({ charId: 'tilly', text: 'Darling, do mind the wall' }), true, 'a second voice starts while the first still sounds');
  assert.ok(v.nodes > first);
  assert.equal(v.active, 2, 'both are sounding');
  // the same speaker cannot start twice within 0.4 s, but can after that
  assert.equal(v.play({ charId: 'rex', text: 'again' }), false, 'anti-spam: the same speaker has just started a line');
  ctx.currentTime += 0.5;
  assert.equal(v.play({ charId: 'rex', text: 'again please' }), true, 'after the gap the same speaker may babble again, over the old line');
  assert.equal(v.active, 3);
  ctx.currentTime += 0.2; v.stop(0.05);
  assert.equal(v.playing, false);
  ctx.currentTime += 30;
  assert.equal(v.play({ charId: 'biscuit', text: 'Woof! Squirrel!' }), true, 'free again once everything has ended');
  ctx.state = 'suspended';
  assert.equal(v.play({ charId: 'lambda', text: 'Woof!' }), false, 'a suspended context stays silent');
  ctx.state = 'running';
  assert.equal(v.play({ charId: 'lambda', text: '' }), false);
  assert.equal(v.play({ charId: 'lambda', text: 'Woof' }, { gain: 0 }), false);
});

test('speech: availability falls back (no synth, no voices after the grace period, repeated engine errors)', () => {
  class U { constructor(t) { this.text = t; } }
  assert.equal(new SpeechVoice({ synth: null, Utterance: null }).available, false);
  let t = 0;
  const silent = new SpeechVoice({ synth: { getVoices: () => [], speak() {}, cancel() {} }, Utterance: U, now: () => t });
  assert.equal(silent.available, true, 'voices may still be loading');
  t = 3;
  assert.equal(silent.available, false, 'no voice after the grace period: the blips take over');
  const voices = [{ name: 'Daniel', lang: 'en-GB' }];
  const spoken = [];
  const sp = new SpeechVoice({ synth: { getVoices: () => voices, speak: (u) => spoken.push(u), cancel() {} }, Utterance: U, now: () => t });
  assert.equal(sp.available, true);
  assert.equal(sp.speak({ charId: 'rex', text: 'One' }), true);
  spoken[0].onerror({ error: 'synthesis-unavailable' }); t += 1;
  assert.equal(sp.speak({ charId: 'rex', text: 'Two' }), true);
  spoken[1].onerror({ error: 'synthesis-failed' }); t += 1;
  assert.equal(sp.available, false, 'two engine errors in a row: give up on synthesis');
  assert.equal(sp.permits({ charId: 'rex', text: 'x' }), true, 'but the line itself is still allowed, for the blips');
  assert.equal(sp.permits({ charId: 'rex', text: 'x' }, { clipPlaying: true }), false, 'never over a recorded clip');
  assert.ok(estimateSpeechMs('Hello there you absolute melon', VOICE_PROFILES.subnet.rate) > estimateSpeechMs('Hello there you absolute melon', VOICE_PROFILES.lambda.rate), 'slow voices take longer');
});

test('speech: every character has a distinct, extreme persona (pitch bands and rates of their own)', () => {
  const ids = Object.keys(VOICE_PROFILES);
  assert.equal(ids.length, 8);
  for (const id of ids) { const p = VOICE_PROFILES[id]; assert.ok(p.pitch >= 0.1 && p.pitch <= 2 && p.rate >= 0.5 && p.rate <= 2.4, `${id} stays within what engines allow (pitch 0.1-2, rate 0.5-2.4)`); }
  assert.ok(VOICE_PROFILES.biscuit.pitch >= 1.9 && VOICE_PROFILES.subnet.pitch <= 0.15 && VOICE_PROFILES.subnet.rate <= 0.55 && VOICE_PROFILES.lambda.rate >= 2.3, 'the extremes are really extreme');
});

// ---- the audio routing ------------------------------------------------------------------------------------------------------------------

test('AudioManager: barks go to a recording, the browser voice and/or the blip voice; nothing is cut off, voices overlap, and nothing throws', async () => {
  const created = [];
  globalThis.window = { AudioContext: function () { const c = makeMockContext(); created.push(c); return c; }, addEventListener() {}, removeEventListener() {} };
  const { AudioManager } = await import('../src/audio/AudioManager.js');
  const { bus } = await import('../src/core/bus.js');
  const warn = console.warn; console.warn = () => {};
  let audio;
  try {
    audio = new AudioManager();
    // before the first gesture nothing plays and nothing throws
    assert.doesNotThrow(() => bus.emit('bark', { id: 'rex', charId: 'rex', text: 'Hello', category: 'taunt', prio: 1 }));
    assert.ok(audio.unlock());
    const ctx = created[0];
    class U { constructor(t) { this.text = t; } }
    const spoken = []; let now = 0, cancels = 0;
    const mkSynth = (voices) => ({ getVoices: () => voices, speak: (u) => spoken.push(u), cancel() { cancels++; } });
    const VOICES = [{ name: 'Daniel', lang: 'en-GB' }, { name: 'Kate', lang: 'en-GB' }];
    audio.speech.synth = mkSynth(VOICES);
    audio.speech.Utterance = U; audio.speech.now = () => now; audio.speech._born = 0; audio.speech.minGap = 0;
    const bark = (charId, text, extra = {}) => bus.emit('bark', { id: charId, charId, text, category: 'taunt', prio: 1, isPlayer: false, ...extra });
    assert.equal(audio.blipLayer, true, 'blip voices are on by default');
    audio.setSpeech({ blips: false });

    bark('rex', 'Permission denied, you absolute melon');
    assert.equal(spoken.length, 1, 'a rival is read out by the browser voice');
    assert.equal(audio.blips.played, 0, 'no blips when the layer is switched off');
    spoken[0].onend(); now += 1;

    audio.setSpeech({ blips: true });
    bark('tilly', 'Darling, do keep up');
    assert.equal(spoken.length, 2);
    assert.equal(audio.blips.played, 1, 'the blip layer sits under a spoken line');
    // more chatter while she speaks: it is queued for the browser voice (one utterance at a time, never cancelled) and babbles right away as blips
    bark('lambda', 'INVOKE THE FUNCTION');
    bark('packet', 'The cones are listening');
    assert.equal(spoken.length, 2, 'the browser speaks one at a time');
    assert.equal(audio.speech.queued, 2, 'the others wait their turn');
    assert.equal(audio.blips.played, 3, 'but the blips overlap: three lines babbling at once');
    assert.equal(audio.blips.active, 3);
    assert.equal(cancels, 0, 'nothing was cancelled');
    // a throwaway never queues behind the browser voice: it is a blip on top (and speech only when the browser is idle)
    bark('biscuit', 'Weeeee!', { category: 'throwaway', prio: 0 });
    assert.equal(audio.speech.queued, 2); assert.equal(audio.blips.played, 4);
    spoken[1].onend(); now += 0.1; spoken[2].onend(); now += 0.1; spoken[3].onend(); now += 1; audio.cancelSpeech();
    audio.setSpeech({ blips: false });
    ctxAdvance(ctx);

    // Marco: lines without a recording are spoken by default; a switch turns it off
    bark('player', 'Lovely clean lines', { charId: 'marco', isPlayer: true });
    const nm = spoken.length;
    assert.equal(spoken[nm - 1].text.startsWith('Lovely clean lines'), true, 'Marco\'s unrecorded line is spoken');
    spoken[nm - 1].onend(); now += 1;
    audio.setSpeech({ marco: false });
    bark('player', 'Lovely clean lines again', { charId: 'marco', isPlayer: true });
    assert.equal(spoken.length, nm);
    audio.setSpeech({ marco: true });

    // a recorded clip no longer holds anybody back: the rival speaks over it, and a second clip joins the first
    const clip = { duration: 3, numberOfChannels: 1, sampleRate: 44100, getChannelData: () => new Float32Array(100) };
    assert.equal(audio._startClip(clip, 'marco'), true);
    assert.equal(audio.voiceCount, 1);
    const ns = spoken.length;
    bark('rex', 'Talking over the clip');
    assert.equal(spoken.length, ns + 1, 'speech overlaps a recorded clip');
    assert.equal(audio._startClip(clip, 'marco'), false, 'the same speaker cannot start another clip inside the anti-spam gap');
    ctx.currentTime += 0.5;
    assert.equal(audio._startClip(clip, 'marco'), true, 'after it, a second clip plays on top of the first');
    assert.equal(audio.voiceCount, 2);
    spoken[spoken.length - 1].onend(); now += 1;

    // no voices on the machine: the character babbles instead
    audio.speech.synth = { getVoices: () => [], speak: () => { throw new Error('should not be called'); }, cancel() {} };
    audio.speech._seenVoices = false; now += 10; ctxAdvance(ctx);
    const before = audio.blips.played;
    bark('biscuit', 'Squirrel! Squirrel!');
    assert.equal(audio.blips.played, before + 1, 'blip fallback when the browser lists no voice');

    // speech switched off for rivals: silence (blips only when the layer is on)
    audio.speech.synth = mkSynth([{ name: 'Daniel', lang: 'en-GB' }]);
    audio.setSpeech({ rivals: false });
    const n = spoken.length, bp = audio.blips.played;
    ctxAdvance(ctx);
    bark('rex', 'Silent now');
    assert.equal(spoken.length, n); assert.equal(audio.blips.played, bp);

    // a recording: plays through playVoice (the asset registry has none in Node, so it resolves false); `cut` no longer exists
    assert.doesNotThrow(() => bus.emit('bark', { id: 'player', charId: 'marco', key: 'fall', clip: true, text: 'Not the void!', isPlayer: true, prio: 2, cut: true }));
    assert.doesNotThrow(() => bus.emit('bark', { id: 'x' }));
    assert.doesNotThrow(() => bus.emit('bark', null));
  } finally {
    audio?.dispose();
    console.warn = warn; delete globalThis.window;
  }
});
function ctxAdvance(ctx) { ctx.currentTime += 40; }

// ---- extreme personas, Carlos in Portuguese, Biscuit's items -----------------------------------------------------------------------

const allLines = (bank) => Object.entries(bank).flatMap(([cat, v]) => (cat === 'vs' ? Object.entries(v).flatMap(([r, a]) => a.map((l) => [`vs.${r}`, norm(l)])) : v.map((l) => [cat, norm(l)])));
const PT_ACCENT = /[ãõçáéíóúâêôà]/i;
const PT_WORDS = /\b(que|não|você|pra|para|com|uma?|meu|minha|é|tá|eu|se|na|no|do|da|de|em|os|as|por|mais|bora|vai|partiu|eita|nossa|opa|gol|olha|beleza|tranquilo|caipirinha|praia|areia|limão|coco|sol|ai|ih|ufa|uau|cara|mano|porra|caralho|merda|cacete|tchau|licença|foi|vou|sou|estou|isso|aqui|tudo|todo|quem|meus|cuidado|calma|campeão|primeiro|volta|voltei|ganhei|perdi|bati|caí|errei|acertei|toma|pega|presente|pedágio|socorro|fogo|pronto|olá|quase|errou|passou|devagar|rápido|dois|dobrou|troca|troquei|perfeito|lindo|salto|pulo|pulei|voa|voando|carga|chispou|zoom|ha|haha|foto|pódio|troféu|derrota|vitória|desonra|fechou|firmeza|sacou|segura|solta|tela|azul|mar|mas|igual|quebrado|nem|ninguém|ninguem|já|ja|só|vendo|fora|dono|rei|pista|corre|correr|alguém|alguem|ou|ele|ela|seu|sua|teu|tua|sem|sob|sobre|até|ate|isto|aquilo|lá|la|cá|aí|ali|tem|ter|ser|estar|dá|da|vem|vamos|bem|mal|muito|pouco|nada|tudo|pura|inteiro|cachorro|busca|explodiu|senti|habilidade|uh+u+l|uhul|oba|iupi+|vruu+m|derrapou|largou|olé|lerdo|lesma|trouxa|babaca|errei|vish|xi|aê+|ih|ei|respeita|passei|ufa|brinde|freguês|foguete|voando|mano|placa|licença)\b/i;
const EN_WORDS = /\b(the|you|your|and|is|are|was|with|this|that|have|what|not|it|my|i|on|of|to|we|he|she|they|will|can|just|but)\b/i;
const NON_PT = /[ãõç]|\b(não|você|vocês|pra|tá|caralho|porra|cacete|beleza|bora|eita|valeu|saudade|tchau|obrigad[oa]|caipirinha)\b/i;

test('personas: every line is short, clean-banked mild lines do not swear, and no banned theme appears in any bank', () => {
  const BANNED = /\b(cunt|nigg\w*|fag\w*|retard\w*|spastic|paki|chink|tranny|mong|cripple\w*|gyp\w*|pikey|whore|slut|rape\w*|paedo\w*|pedo\w*|kill yourself|suicide|child\w*|kids?|toddler|school\w*|teen\w*|trump|putin|musk|bezos|farage|boris|starmer|sunak|biden|hitler|nazi\w*|jew\w*|muslim\w*|christian\w*|sex\w*|porn\w*|dildo|boobs?|penis|vagina|orgasm|molest\w*|homeless|autis\w*|schizo\w*|cancer|dementia|religi\w*|viado|puta)\b/i;
  const SWEAR = /\b(bollocks|arse(hole)?s?|bloody|shite?|git|wank\w*|knob\w*|tits?|sod\w*|tosser\w*|bastards?|piss\w*|bugger\w*|fuck\w*|bell-?end|twat|porra|caralho|merda|cacete|babaca|otário|trouxa)\b/i;
  for (const c of CHARACTERS) {
    for (const [label, bank] of [['mild', MILD_BANKS[c.id]], ['rude', RUDE_BANKS[c.id]]]) {
      for (const [cat, l] of allLines(bank)) {
        assert.ok(l.t.length >= 2 && l.t.length <= 70, `${c.id}.${cat}: bad length: ${l.t}`);
        assert.ok(!BANNED.test(l.t), `${c.id}.${label}.${cat}: not for this game: ${l.t}`);
        if (label === 'mild') assert.ok(!SWEAR.test(l.t), `${c.id}.mild.${cat} swears: ${l.t}`);
      }
    }
    assert.ok(countLines(MILD_BANKS[c.id]) >= 340, `${c.id} mild bank is big`);
  }
});

test('Carlos speaks only Brazilian Portuguese (mild and rude, every category); nobody else does', () => {
  for (const [label, bank] of [['mild', MILD_BANKS.carlos], ['rude', RUDE_BANKS.carlos]]) {
    const lines = allLines(bank);
    assert.ok(lines.length > 150);
    for (const [cat, l] of lines) {
      const t = l.t.replace(/\{[^}]+\}/g, ' ');
      assert.ok(PT_ACCENT.test(t) || PT_WORDS.test(t), `carlos.${label}.${cat} does not look Portuguese: ${l.t}`);
      assert.ok(!EN_WORDS.test(t), `carlos.${label}.${cat} has English in it: ${l.t}`);
    }
  }
  for (const c of CHARACTERS.filter((x) => x.id !== 'carlos')) {
    for (const bank of [MILD_BANKS[c.id], RUDE_BANKS[c.id]]) for (const [cat, l] of allLines(bank)) assert.ok(!NON_PT.test(l.t.replace(/caipirinha/gi, '')), `${c.id}.${cat} speaks Portuguese: ${l.t}`);
  }
  // {other} still works, with the Portuguese fallback for a missing name
  const bank = new BarkBank(BANKS.carlos, seeded(5));
  let named = 0;
  for (let i = 0; i < 60; i++) { const l = bank.pick('overtake', { other: 'rex', hasOther: true }); if (l.t.includes('{other}')) named++; assert.ok(fill(l.t, 'Rex').indexOf('{other}') < 0); }
  assert.ok(named > 5);
  assert.equal(fill('Oi, {other}!', '', { you: 'você' }), 'Oi, você!');
  assert.equal(fill('Hi, {other}!', ''), 'Hi, you!');
});

test('Carlos\'s voice asks for pt-BR first, then pt-PT, then any Portuguese, then falls back; the blips cope with accents', () => {
  assert.deepEqual(VOICE_PROFILES.carlos.langs, ['pt-BR', 'pt-PT', 'pt']);
  const vs = [{ name: 'Daniel', lang: 'en-GB' }, { name: 'Joaquim', lang: 'pt-PT' }, { name: 'Felipe', lang: 'pt-BR' }, { name: 'Marcos', lang: 'pt-AO' }];
  assert.equal(assignVoices(vs, ['carlos']).carlos.lang, 'pt-BR');
  assert.equal(assignVoices(vs.filter((v) => v.lang !== 'pt-BR'), ['carlos']).carlos.lang, 'pt-PT');
  assert.equal(assignVoices(vs.filter((v) => v.lang === 'pt-AO' || v.lang === 'en-GB'), ['carlos']).carlos.lang, 'pt-AO');
  assert.equal(assignVoices([vs[0]], ['carlos']).carlos.lang, 'en-GB', 'no Portuguese voice installed: whatever there is');
  assert.equal(syllablesOf('Não, você é um campeão!').length, 7);
  assert.ok(planBlips('carlos', 'Eita, minha caipirinha!', { rng: seeded(1) }).events.length >= 5);
  const utt = []; class U { constructor(t) { this.text = t; } }
  const sp = new SpeechVoice({ synth: { getVoices: () => [], speak: (u) => utt.push(u), cancel() {} }, Utterance: U, now: () => 100 });
  sp._seenVoices = true;
  sp.synth.getVoices = () => [{ name: 'Daniel', lang: 'en-GB' }];
  sp._voicesFor = ''; sp.voices = {};
  assert.ok(sp.speak({ charId: 'carlos', text: 'Bora, bora, bora!' }));
});

test('Biscuit\'s items (poo, woof, zoomies, fetch): item-specific lines for every character, and the director reacts to the events', () => {
  for (const id of ['poo', 'woof', 'zoomies', 'fetch']) {
    for (const c of CHARACTERS) {
      const cats = c.id === 'biscuit' ? ['item_use_attack', 'item_use_defence', 'item_hit_rival'] : ['hit_by_item'];
      const n = cats.reduce((a, cat) => a + (MILD_BANKS[c.id][cat] ?? []).map(norm).filter((l) => l.items?.includes(id)).length, 0);
      assert.ok(n >= 1, `${c.id} has a mild line for ${id}`);
    }
  }
  const r = makeRig(11, []);
  r.dir.rude = false;
  let hit = null, use = null;
  for (let i = 0; i < 40 && !(hit && use); i++) {
    r.tick(30);
    r.bus.emit('item:use', { id: 'biscuit', item: 'poo' });
    r.bus.emit('item:hit', { victimId: 'player', byId: 'biscuit', item: 'poo' });
    r.tick(0.2); r.dir.update(0.2, { racers: r.racers, player: { id: 'player', place: 4, kart: { speed: 0, maxSpeed: 50 } }, state: 'racing' });
    hit = hit ?? r.out.find((b) => b.id === 'player' && b.category === 'hit_by_item');
    use = use ?? r.out.find((b) => b.id === 'biscuit' && b.category === 'item_use_attack');
  }
  assert.ok(hit && use, 'both the victim and Biscuit speak');
  let itemLine = 0;
  for (let i = 0; i < 40; i++) {
    r.tick(30);
    r.bus.emit('item:hit', { victimId: 'player', byId: 'biscuit', item: 'woof' });
    r.tick(0.2); r.dir.update(0.2, { racers: r.racers, player: { id: 'player', place: 4, kart: { speed: 0, maxSpeed: 50 } }, state: 'racing' });
  }
  for (const b of r.out) if (b.category === 'hit_by_item' && b.id === 'player') { const l = MILD_BANKS.marco.hit_by_item.map(norm).find((x) => x.t === b.text); if (l?.items?.includes('woof')) itemLine++; }
  assert.ok(itemLine > 0, 'Marco\'s woof-specific reaction is used');
});
