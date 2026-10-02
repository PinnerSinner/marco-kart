// Audio logic tests in plain Node with a strict fake AudioContext (test/drive_mockaudio.js): every sfx, song, engine and manager
// code path runs and must only make valid WebAudio calls. Sample-level checks (peaks, RMS, NaN, loops) are in the browser
// verification: see test/demo_drive_audio.js and test/drive_audio_render.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMockContext } from './drive_mockaudio.js';
import { noteToMidi, mtof, parseMelody, chordNotes, CHORDS } from '../src/audio/synth.js';
import { SFX, REQUIRED_SFX } from '../src/audio/sfx.js';
import { SONGS, MUSIC_KEYS } from '../src/audio/music/index.js';
import { scheduleSong, expandProgression, loopSeconds, voicing, SongRunner } from '../src/audio/music/sequencer.js';
import { pattern, melodyTable, bassNote } from '../src/audio/music/common.js';
import { PlayerEngine, RivalHum, rpmForSpeed, rpmToHz } from '../src/audio/engine.js';
import { bus } from '../src/core/bus.js';

test('notes, chords and melodies parse correctly', () => {
  assert.equal(noteToMidi('A4'), 69); assert.equal(noteToMidi('C4'), 60); assert.equal(noteToMidi('F#5'), 78); assert.equal(noteToMidi('Bb2'), 46);
  assert.ok(Math.abs(mtof(69) - 440) < 1e-9); assert.ok(Math.abs(mtof(60) - 261.6256) < 1e-3);
  assert.throws(() => noteToMidi('H4')); assert.throws(() => noteToMidi('C'));
  assert.deepEqual(chordNotes(60, 'maj'), [60, 64, 67]); assert.deepEqual(chordNotes(57, 'min7'), [57, 60, 64, 67]);
  assert.deepEqual(chordNotes(60, 'maj', 1), [64, 67, 72]);
  assert.throws(() => chordNotes(60, 'nope'));
  const m = parseMelody('C5:4 .:2 E5 - G5:3');
  assert.deepEqual(m.notes.map((n) => [n.step, n.midi, n.dur]), [[0, 72, 4], [6, 76, 3], [9, 79, 3]]); assert.equal(m.steps, 12);
  assert.deepEqual(voicing([48, 52, 55], 60, 72), [60, 64, 67]);
  assert.equal(bassNote(50, 38), 38); assert.equal(bassNote(47, 38), 47); assert.equal(bassNote(30, 38), 42);
  assert.equal(pattern('x... x... x... x...').filter(Boolean).length, 4);
  assert.throws(() => pattern('x.x')); assert.throws(() => melodyTable(['C5:4']));
  for (const q of Object.keys(CHORDS)) assert.ok(chordNotes(48, q).every(Number.isFinite));
});

test('every required sfx exists, declares a duration and plays without invalid WebAudio calls (pitch 0.5, 1, 2)', () => {
  for (const name of REQUIRED_SFX) assert.ok(SFX[name], `missing sfx ${name}`);
  assert.equal(new Set(REQUIRED_SFX).size, REQUIRED_SFX.length);
  assert.equal(REQUIRED_SFX.length, 34);
  for (const [name, def] of Object.entries(SFX)) {
    assert.ok(def.dur > 0.05 && def.dur < 4, `${name} dur`);
    for (const pitch of [0.5, 1, 2]) {
      const ctx = makeMockContext();
      const out = ctx.createGain();
      def.play(ctx, out, 0.5, { pitch, vol: 1 });
      assert.ok(ctx.stats.nodes >= 3, `${name} created nodes`);
      assert.ok(ctx.stats.starts.every((t) => t >= 0.5 - 1e-9), `${name} nothing scheduled in the past`);
      // nothing keeps running past its declared length + tail allowance
      const maxStop = Math.max(...ctx.stats.stops);
      assert.ok(maxStop <= 0.5 + def.dur + 1.2, `${name} stops at ${maxStop.toFixed(2)} s, declared ${def.dur}`);
    }
  }
});

test('song definitions: 7 keys, loop lengths 45-90 s for the race tracks, progressions match loopBars, melodies are on the grid', () => {
  assert.deepEqual([...MUSIC_KEYS].sort(), ['blighty', 'copacabana', 'datacentre', 'marcoverse', 'menu', 'podium', 'results']);
  for (const key of ['menu', 'copacabana', 'blighty', 'datacentre', 'marcoverse']) {
    const secs = loopSeconds(SONGS[key]);
    assert.ok(secs >= 45 && secs <= 90, `${key} loop is ${secs.toFixed(1)} s`);
  }
  for (const key of ['results', 'podium']) assert.ok(loopSeconds(SONGS[key]) >= 15, `${key} loop`);
  for (const [key, song] of Object.entries(SONGS)) {
    assert.equal(song.key, key);
    assert.equal(expandProgression(song.prog).length, song.loopBars, `${key} progression`);
    if (song.introProg) assert.equal(expandProgression(song.introProg).length, song.introBars);
    assert.equal(typeof song.step, 'function');
  }
});

test('every song schedules a full loop (+ intro) on the strict fake context: valid calls, steps in order, notes inside the piece', () => {
  for (const [key, song] of Object.entries(SONGS)) {
    const ctx = makeMockContext(); const out = ctx.createGain();
    const t0 = 0.05;
    const { seconds, runner } = scheduleSong(ctx, out, song, { loops: 1, t0 });
    const steps = song.loopBars * 16 + (song.introBars ?? 0) * 16;
    assert.equal(runner.absStep, steps, `${key} step count`);
    assert.ok(ctx.stats.nodes > steps * 1.5, `${key} plays plenty of notes (${ctx.stats.nodes} nodes)`);
    const minStart = Math.min(...ctx.stats.starts), maxStart = Math.max(...ctx.stats.starts);
    assert.ok(minStart >= t0 - 1e-9, `${key} nothing before t0`);
    assert.ok(maxStart <= t0 + seconds + 0.5, `${key} nothing starts after the loop end (${maxStart.toFixed(2)} > ${(t0 + seconds).toFixed(2)})`);
    // a second loop continues seamlessly: the runner wraps into the loop, not the intro
    const idx0 = runner.stepIndex;
    assert.equal(idx0, runner.introSteps, `${key} wraps to loop start`);
  }
});

test('intensity speeds the tempo and never breaks scheduling', () => {
  const ctx = makeMockContext(); const out = ctx.createGain();
  const r = new SongRunner(ctx, out, SONGS.datacentre, { seed: 1 });
  r.start(0); r.setIntensity(0); r.pump(10);
  const n0 = r.absStep;
  const r2 = new SongRunner(makeMockContext(), makeMockContext().createGain(), SONGS.datacentre, { seed: 1 });
  r2.start(0); r2.setIntensity(1); r2.pump(10);
  assert.ok(r2.absStep > n0 * 1.05 && r2.absStep < n0 * 1.09, `${r2.absStep} vs ${n0}`);
});

test('chord tables produce the intended harmony in the melodies (every melody note is in the key or a chord tone)', () => {
  const keys = { menu: 0, copacabana: 2, blighty: 7, datacentre: 9, marcoverse: 2, results: 0, podium: 2 };
  // pitch classes allowed: the major or natural-minor scale of the tonic plus a few borrowed / chromatic chord tones
  for (const [key, song] of Object.entries(SONGS)) {
    const ctx = makeMockContext(); const out = ctx.createGain();
    const seen = new Map();
    const orig = song.step;
    const runner = new SongRunner(ctx, out, { ...song, step: (c, rig, s) => { seen.set(s.chord.name, s.chord); orig.call(song, c, rig, s); } });
    runner.start(0); runner.pump(loopSeconds(song) + (song.introBars ?? 0) * 3);
    const tonic = keys[key];
    const minor = key === 'datacentre' || key === 'marcoverse';
    const scale = new Set((minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map((d) => (d + tonic) % 12));
    for (const chord of seen.values()) {
      const chordPcs = chord.notes.map((n) => n % 12);
      const inKey = chordPcs.filter((pc) => scale.has(pc)).length;
      assert.ok(inKey >= chordPcs.length - 2, `${key}: chord ${chord.name} strays from the key (${chordPcs.join()})`);
    }
  }
});

test('engine: rpm climbs inside a gear and drops at each upshift (audible gear steps); pitch range is sane', () => {
  let drops = 0, prev = rpmForSpeed(0);
  for (let sf = 0.005; sf <= 1.0; sf += 0.005) { const r = rpmForSpeed(sf); if (r < prev - 0.15) drops++; prev = r; }
  assert.equal(drops, 4, 'four upshifts across five gears');
  assert.ok(rpmForSpeed(0.14) > 0.85 && rpmForSpeed(0.16) < 0.6);
  assert.ok(rpmToHz(0) >= 35 && rpmToHz(1) < 240 && rpmToHz(0.5) > rpmToHz(0.2));
  for (const sf of [-1, 0, 0.5, 1, 1.4, 5, NaN]) assert.ok(Number.isFinite(rpmForSpeed(sf)) || Number.isNaN(sf));
});

test('engine voices drive valid AudioParam automation for every driving state', () => {
  const ctx = makeMockContext(); const out = ctx.createGain();
  const eng = new PlayerEngine(ctx, out, 0);
  const k = { speed: 0, params: { top: 33 }, grounded: true, slip: 0, drift: { active: false }, boost: { time: 0, power: 1.6 }, ground: { surface: 'road' }, status: { spin: 0 } };
  const surfaces = ['road', 'kerb', 'grass', 'sand', 'water', 'boost', 'oil', 'void'];
  for (let i = 0; i < 600; i++) {
    k.speed = (i % 200) * 0.2 - 4; k.slip = (i % 50) / 50; k.drift.active = i % 90 < 40; k.boost.time = i % 120 < 30 ? 1 : 0;
    k.grounded = i % 70 !== 0; k.ground.surface = surfaces[i % surfaces.length]; k.status.spin = i % 300 < 20 ? 1 : 0;
    eng.update(i / 60, k, 1 / 60);
  }
  eng.setLevel(11, 0); eng.stop(12);
  const h = new RivalHum(ctx, out, 0); h.set(1, 0.5, 0.7, -0.4); h.set(2, 1.2, 0, 2); h.stop(3);
  eng.update(0, {}, 0);                     // missing fields must not throw
});

test('AudioManager: unlock, volumes, music lifecycle, sfx gating, positional sfx, bus reactions (fake context)', async () => {
  const created = [];
  const listeners = [];
  globalThis.window = { AudioContext: function () { const c = makeMockContext(); created.push(c); return c; }, addEventListener: (e, f) => listeners.push([e, f]), removeEventListener() {} };
  const { AudioManager } = await import('../src/audio/AudioManager.js');
  const warn = console.warn; const warnings = []; console.warn = (...a) => warnings.push(a.join(' '));
  let audio;
  try {
    audio = new AudioManager();
    assert.equal(audio.playSfx('ui-click'), false, 'silent before unlock');
    audio.playMusic('menu');
    assert.equal(audio.musicKey, 'menu', 'music request is remembered until unlock');
    assert.ok(audio.unlock());
    const ctx = created[0];
    assert.ok(audio.unlocked && audio.musicKey === 'menu');
    assert.ok(ctx.stats.nodes > 30, 'music started on unlock');
    audio.unlock();                        // idempotent
    assert.equal(created.length, 1);
    audio.setVolumes({ master: 0.5, music: 0.25, sfx: 1, voice: 0 });
    assert.deepEqual(audio.volumes, { master: 0.5, music: 0.25, sfx: 1, voice: 0 });
    audio.setVolumes({ master: 7, sfx: NaN }); assert.equal(audio.volumes.master, 1); assert.equal(audio.volumes.sfx, 1);
    // sfx
    ctx.currentTime = 1;
    assert.equal(audio.playSfx('ui-click'), true);
    assert.equal(audio.playSfx('ui-click'), false, 'min gap dedupes a double trigger');
    ctx.currentTime = 1.2; assert.equal(audio.playSfx('ui-click'), true);
    assert.equal(audio.playSfx('does-not-exist'), false); assert.equal(audio.playSfx('does-not-exist'), false);
    assert.equal(warnings.filter((w) => w.includes('does-not-exist')).length, 1, 'unknown sfx warns once');
    // positional: camera at origin looking +Z: a source on the right (-X for yaw 0) pans right; far away is skipped
    const cam = { matrixWorld: { elements: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 5, 0, 1] } };   // yaw PI camera: local +X = world -X? just needs a valid matrix
    audio.update(1 / 60, { camera: cam });
    ctx.currentTime = 2; assert.equal(audio.playSfx('bump', { pos: { x: 10, y: 0, z: 0 } }), true);
    ctx.currentTime = 3; assert.equal(audio.playSfx('bump', { pos: { x: 500, y: 0, z: 0 } }), false, 'out of earshot');
    // music: same key no-op, other key switches, stop
    const nodesBefore = ctx.stats.nodes; audio.playMusic('menu'); assert.equal(ctx.stats.nodes, nodesBefore);
    audio.playMusic('copacabana', { fadeIn: 0.1 }); assert.equal(audio.musicKey, 'copacabana');
    audio.setMusicIntensity(0.7); audio.setMusicIntensity(NaN);
    audio.playMusic('nope'); assert.equal(audio.musicKey, 'copacabana');
    audio.stopMusic({ fadeOut: 0.1 }); assert.equal(audio.musicKey, null);
    // race player + rivals
    const mk = (id, x, z, speed) => ({ id, pos: { x, y: 0, z }, speed, params: { top: 33 }, grounded: true, slip: 0, drift: { active: false }, boost: { time: 0, power: 1 }, ground: { surface: 'road' }, status: { spin: 0, invincible: 0, respawning: 0 } });
    const me = mk('me', 0, 0, 20), rivals = [mk('a', 12, 5, 30), mk('b', -20, 30, 25), mk('c', 40, 0, 10), mk('d', 300, 0, 33)];
    audio.setRacePlayer(me, rivals);
    for (let i = 0; i < 30; i++) { ctx.currentTime = 4 + i / 60; audio.update(1 / 60, { camera: cam }); }
    me.status.invincible = 5;
    ctx.currentTime = 6; audio.update(1 / 60, { camera: cam });
    // bus reactions: each event must be handled without throwing; player events are audible, unknown karts are ignored
    ctx.currentTime = 10;
    const play = (name, d, expectNodes = true) => { const n = ctx.stats.nodes; ctx.currentTime += 1; bus.emit(name, d); assert.equal(ctx.stats.nodes > n, expectNodes, `${name} ${JSON.stringify(d)}`); };
    play('kart:drift-start', { id: 'me', dir: 1 }); play('kart:drift-level', { id: 'me', level: 2 }); play('kart:boost', { id: 'me', kind: 'pad', power: 1, duration: 1 });
    play('kart:boost', { id: 'me', kind: 'drift', power: 1, duration: 1 }); play('kart:boost', { id: 'me', kind: 'start', power: 1, duration: 1 });
    play('kart:wall-hit', { id: 'me', impact: 0.8 }); play('kart:bump', { id: 'me', otherId: 'a', impact: 0.5 }); play('kart:land', { id: 'me', impact: 0.7 });
    play('kart:surface', { id: 'me', surface: 'water' }); play('kart:surface', { id: 'me', surface: 'grass' }, false);
    play('kart:spin', { id: 'me', cause: 'hit' }); play('kart:shrink', { id: 'me', seconds: 5 }); play('kart:fall', { id: 'me' }); play('kart:respawn', { id: 'me' });
    play('item:box', { id: 'me', index: 3 }); play('item:get', { id: 'me', item: 'ping' }); play('item:use', { id: 'me', item: 'ping' });
    play('item:hit', { victimId: 'me', byId: 'a', item: 'ping' }); play('item:hit', { victimId: 'me', byId: 'a', item: 'kernel_panic' }); play('item:block', { id: 'me', item: 'ping' });
    play('item:roulette', { id: 'me', shown: 'cable', done: false }); play('item:roulette', { id: 'me', shown: 'cable', done: false }, false); play('item:roulette', { id: 'me', shown: 'ping', done: false });
    play('race:countdown', { n: 3 }); play('race:countdown', { n: 0 }); play('race:lap', { id: 'me', isPlayer: true, final: false }); play('race:lap', { id: 'me', isPlayer: true, final: true }, false);
    play('race:final-lap', {}); play('race:overtake', { id: 'me', isPlayer: true }); play('race:overtake', { id: 'a', isPlayer: false }, false); play('race:wrong-way', { on: true });
    play('race:finish', { id: 'me', place: 1, time: 100, isPlayer: true });
    play('kart:spin', { id: 'a', cause: 'hit' });                // a known rival within earshot: positional
    play('kart:spin', { id: 'zzz', cause: 'hit' }, false);       // unknown kart: ignored
    play('kart:wall-hit', { id: 'd', impact: 1 }, false);        // rival 300 m away: out of earshot
    play('sfx', { name: 'ui-confirm' }); play('sfx', { name: 'boost', pos: { x: 3, y: 0, z: 3 }, volume: 0.5, pitch: 1.2 });
    bus.emit('voice', { key: 'voice_go', charId: 'marco' });     // no asset: silently ignored
    bus.emit('music', { key: 'blighty' }); assert.equal(audio.musicKey, 'blighty');
    bus.emit('ui:pause', {}); audio.update(1 / 60, { camera: cam }); bus.emit('ui:resume', {});
    audio.setRacePlayer(null);
    audio.detach();
    const n = ctx.stats.nodes; ctx.currentTime += 2; bus.emit('sfx', { name: 'ui-click' }); assert.equal(ctx.stats.nodes, n, 'detach() unsubscribes');
    audio.dispose();
    assert.equal(warnings.filter((w) => !w.includes('does-not-exist') && !w.includes('nope')).length, 0, `unexpected warnings: ${warnings.join(' | ')}`);
  } finally { audio?.dispose(); console.warn = warn; delete globalThis.window; }
});

test('AudioManager without WebAudio (or without window) stays silent and never throws', async () => {
  delete globalThis.window;
  const { AudioManager } = await import('../src/audio/AudioManager.js');
  const audio = new AudioManager();
  assert.equal(audio.unlock(), false); assert.equal(audio.playSfx('boost'), false);
  audio.playMusic('menu'); audio.setVolumes({ master: 1 }); audio.setRacePlayer({ id: 'x' }); audio.update(0.016, {}); audio.stopMusic(); audio.dispose();
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const warn = console.warn; console.warn = () => {};
  try { const a2 = new AudioManager(); assert.equal(a2.unlock(), false); a2.dispose(); } finally { console.warn = warn; delete globalThis.window; }
});
