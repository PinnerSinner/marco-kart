// Overlapping voices: nothing cuts anything off. Registry rules (anti-spam per speaker, cap of 6, quietest dropped, overlap trim), two clips and a
// blip line sounding at once through the AudioManager, the speech queue, and the extreme / distinct personas (speech and blips).
import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceRegistry, VOICE_RULES, overlapTrim } from '../src/audio/voiceRegistry.js';
import { AudioManager } from '../src/audio/AudioManager.js';
import { BLIP_TIMBRES, BlipVoice } from '../src/audio/blips.js';
import { VOICE_PROFILES, assignVoices, SpeechVoice, utteranceParams } from '../src/audio/speech.js';
import { makeMockContext } from './drive_mockaudio.js';

const mockClip = (duration = 3) => ({ duration, numberOfChannels: 1, sampleRate: 44100, getChannelData: () => new Float32Array(64) });
const newAudio = () => { const am = new AudioManager({ autoAttach: false }); am.ctx = makeMockContext(); am.unlocked = true; am._buildGraph(); return am; };

test('voice registry: anti-spam gap per speaker, nobody else is held back', () => {
  const r = new VoiceRegistry();
  assert.equal(VOICE_RULES.SPEAKER_GAP, 0.4); assert.equal(VOICE_RULES.MAX_VOICES, 6);
  assert.ok(r.admit({ charId: 'rex', now: 0, end: 3 }));
  assert.equal(r.admit({ charId: 'rex', now: 0.3, end: 3 }), null, 'the same speaker inside 0.4 s');
  assert.ok(r.admit({ charId: 'tilly', now: 0.3, end: 3 }), 'another speaker is free at once');
  assert.ok(r.admit({ charId: 'rex', now: 0.45, end: 3 }), 'after the gap the same speaker may start again, on top of the old voice');
  assert.equal(r.count(0.5), 3);
  assert.ok(r.admit({ charId: 'rex', now: 0.5, end: 3, force: true }), 'force skips the gap (menu lines)');
  assert.equal(r.count(3.1), 0, 'everything ended');
});

test('voice registry: global cap of 6, the quietest (then oldest) is dropped silently, a newcomer quieter than all is the one dropped', () => {
  const r = new VoiceRegistry(); const stopped = [];
  const add = (id, level, now) => r.admit({ charId: id, level, now, end: 100, stop: () => stopped.push(id) });
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  ids.forEach((id, i) => add(id, 1, i * 0.5));
  assert.equal(r.count(3), 6);
  // an equal-level newcomer: the oldest of the equals goes
  const g = add('g', 1, 3);
  assert.ok(g); assert.equal(g.evicted.length, 1); assert.deepEqual(stopped, ['a']);
  assert.equal(r.count(3.1), 6, 'never more than six');
  // a quiet voice is the first to go
  const q = new VoiceRegistry(); const gone = [];
  ['x1', 'x2', 'x3', 'x4', 'x5'].forEach((id, i) => q.admit({ charId: id, level: 1, now: i, end: 99 }));
  q.admit({ charId: 'quiet', level: 0.3, now: 5, end: 99, stop: () => gone.push('quiet') });
  const loud = q.admit({ charId: 'loud', level: 1, now: 6, end: 99 });
  assert.ok(loud); assert.deepEqual(gone, ['quiet']);
  // a newcomer that is quieter than everybody is refused
  assert.equal(q.admit({ charId: 'whisper', level: 0.1, now: 7, end: 99 }), null);
  assert.equal(q.count(7), 6); assert.ok(q.dropped >= 2);
});

test('overlap trim: nothing for one or two voices, gently down from three (-1.7 dB, -3 dB at four, about -4.8 dB at six)', () => {
  assert.equal(overlapTrim(0), 1); assert.equal(overlapTrim(1), 1); assert.equal(overlapTrim(2), 1);
  const db = (n) => 20 * Math.log10(overlapTrim(n));
  assert.ok(db(3) < -1 && db(3) > -2.5); assert.ok(Math.abs(db(4) + 3.01) < 0.05); assert.ok(db(6) > -5.5 && db(6) < -4);
  for (let n = 3; n <= 6; n++) assert.ok(overlapTrim(n) < overlapTrim(n - 1));
});

test('AudioManager: two recorded clips and a blip line sound at the same time, none cut the others, and the voice bus is trimmed', () => {
  const am = newAudio();
  const clip = mockClip(4);
  assert.equal(am._startClip(clip, 'marco'), true);
  assert.equal(am._startClip(clip, 'carlos'), true, 'a second clip starts while the first plays');
  assert.equal(am.voiceCount, 2);
  assert.equal(am.ctx.stats.stops.length, 0, 'nothing was stopped');
  assert.equal(am.blips.play({ charId: 'biscuit', text: 'Woof woof, squirrel!' }, { gain: 1 }), true, 'and a blip line joins');
  assert.equal(am.voiceCount, 3);
  assert.ok(am.voices.trim(am.ctx.currentTime) < 1 && am.voices.trim(am.ctx.currentTime) > 0.7, 'three at once: a slight trim');
  // the clips and the blips go through the same voice bus
  assert.ok(am.voiceTrim._connections.includes(am.voiceBus));
  am.dispose();
});

test('AudioManager: at most six voices at once, the rest are dropped silently', () => {
  const am = newAudio();
  const clip = mockClip(10);
  const ids = ['marco', 'subnet', 'lambda', 'packet', 'carlos', 'tilly', 'rex', 'biscuit'];
  for (const id of ids.slice(0, 3)) assert.equal(am._startClip(clip, id), true);
  for (const id of ids.slice(3, 6)) assert.equal(am.blips.play({ charId: id, text: 'Babble babble babble' }, { gain: 1 }), true);
  assert.equal(am.voiceCount, 6);
  // two more at the same level: each pushes the oldest out, never more than six
  assert.equal(am.blips.play({ charId: 'rex', text: 'Seventh voice here' }, { gain: 1 }), true);
  assert.equal(am.voiceCount, 6);
  // a quiet distant line is refused when the field is full of louder ones
  assert.equal(am.blips.play({ charId: 'biscuit', text: 'Far away woof' }, { gain: 0.2 }), false);
  assert.equal(am.voiceCount, 6);
  assert.ok(am.voices.dropped >= 2);
  // a long time later everything has ended
  am.ctx.currentTime += 30;
  assert.equal(am.voiceCount, 0);
  am.dispose();
});

test('speech queue: lines wait (three at most), a speaking line is never cancelled, stale lines are dropped, cancel() clears the queue', () => {
  class U { constructor(t) { this.text = t; } }
  let t = 0, cancels = 0; const spoken = [];
  const sp = new SpeechVoice({ synth: { getVoices: () => [{ name: 'Daniel', lang: 'en-GB' }], speak: (u) => spoken.push(u), cancel: () => { cancels++; } }, Utterance: U, now: () => t, rng: () => 0.5 });
  assert.equal(sp.maxQueue, 3); assert.equal(sp.staleAfter, 2.5);
  const chars = ['rex', 'tilly', 'lambda', 'packet', 'carlos', 'biscuit'];
  chars.forEach((c, i) => sp.speak({ charId: c, text: `Line ${i}` }));
  assert.equal(spoken.length, 1); assert.equal(sp.queued, 3);
  assert.equal(cancels, 0);
  t = 2.6;                                                  // the three that waited are now stale
  spoken[0].onend();
  assert.equal(spoken.length, 1, 'stale lines are not spoken');
  assert.equal(sp.queued, 0);
  t = 3;
  sp.speak({ charId: 'rex', text: 'Fresh' }); sp.speak({ charId: 'tilly', text: 'Waiting' });
  assert.equal(sp.queued, 1);
  sp.cancel();
  assert.equal(sp.queued, 0); assert.equal(sp.busy, false);
});

// ---- extreme, distinct voices ---------------------------------------------------------------------------------------------------

test('personas: speech pitches are pairwise at least 0.25 apart (and their wobble bands never touch), rates and quirks are unique', () => {
  const ids = Object.keys(VOICE_PROFILES);
  assert.equal(ids.length, 8);
  const sorted = ids.map((id) => ({ id, ...VOICE_PROFILES[id] })).sort((a, b) => a.pitch - b.pitch);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i].pitch - sorted[i - 1].pitch >= 0.25, `${sorted[i - 1].id} (${sorted[i - 1].pitch}) and ${sorted[i].id} (${sorted[i].pitch}) are too close in pitch`);
    assert.ok(sorted[i - 1].pitch * (1 + sorted[i - 1].wobble.pitch) < sorted[i].pitch * (1 - sorted[i].wobble.pitch), `${sorted[i - 1].id} and ${sorted[i].id} pitch bands overlap`);
  }
  for (const id of ids) { const p = VOICE_PROFILES[id]; assert.ok(p.pitch >= 0.1 && p.pitch <= 2 && p.rate >= 0.5 && p.rate <= 2.4, `${id} within pitch 0.1-2 and rate 0.5-2.4`); }
  assert.ok(sorted[0].pitch <= 0.15 && sorted[7].pitch >= 1.9, 'the full pitch range is used');
  const rates = ids.map((i) => VOICE_PROFILES[i].rate).sort((a, b) => a - b);
  for (let i = 1; i < rates.length; i++) assert.ok(rates[i] - rates[i - 1] >= 0.1, 'rates are distinct');
  assert.ok(rates[0] <= 0.55 && rates[7] >= 2.3, 'slow giant to frantic chipmunk');
  assert.equal(new Set(ids.map((i) => VOICE_PROFILES[i].quirk)).size, 8, 'every character has a unique quirk');
  // a real utterance stays inside the band, whatever the wobble
  for (const id of ids) for (let k = 0; k < 40; k++) { const u = utteranceParams(id, 'Hello there, racers', { rng: Math.random }); assert.ok(u.pitch >= 0.1 && u.pitch <= 2 && u.rate >= 0.5 && u.rate <= 2.4); }
  assert.equal(VOICE_PROFILES.rex.wobble.pitch, 0, 'the robot is a monotone');
});

test('personas: blip timbres are just as extreme (base pitches at least a major third apart, waveforms, rates, vibrato and glide differ)', () => {
  const ids = Object.keys(BLIP_TIMBRES);
  assert.equal(ids.length, 8);
  assert.deepEqual([...ids].sort(), Object.keys(VOICE_PROFILES).sort(), 'a timbre for every speaker');
  const sorted = ids.map((id) => ({ id, ...BLIP_TIMBRES[id] })).sort((a, b) => a.base - b.base);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].base / sorted[i - 1].base >= Math.pow(2, 4 / 12), `${sorted[i - 1].id} (${sorted[i - 1].base} Hz) and ${sorted[i].id} (${sorted[i].base} Hz) are less than a third apart`);
  assert.ok(sorted[7].base / sorted[0].base > 15, 'a wide spread: sub-bass giant to helium squeak');
  assert.equal(new Set(ids.map((i) => `${BLIP_TIMBRES[i].sps}`)).size, 8, 'syllable rates differ');
  assert.ok(new Set(ids.map((i) => BLIP_TIMBRES[i].wave)).size >= 3, 'several waveforms');
  assert.ok(BLIP_TIMBRES.carlos.vib > 0.3 && BLIP_TIMBRES.rex.vib === 0 && BLIP_TIMBRES.rex.mono === true, 'wobbling drawl against a flat robot');
  assert.ok(BLIP_TIMBRES.carlos.glide < -2 && BLIP_TIMBRES.biscuit.glide > 3, 'drawl slides down, yip slides up');
  // blips of different characters are really different at the oscillator level
  const ctx = makeMockContext();
  const v = new BlipVoice({ ctx: () => ctx, dest: () => ctx.createGain(), rng: () => 0.5 });
  v.play({ charId: 'subnet', text: 'Hail, brave racers' }); const low = v.last.events[0].freq;
  ctx.currentTime += 1;
  v.play({ charId: 'biscuit', text: 'Hail, brave racers' }); const high = v.last.events[0].freq;
  assert.ok(high / low > 8, `squeak ${high.toFixed(0)} Hz vs giant ${low.toFixed(0)} Hz`);
});

test('voice choice: different characters get different installed voices, spread over male / female / regional ones; Carlos gets pt-BR', () => {
  const voices = [
    { name: 'Google UK English Male', lang: 'en-GB' }, { name: 'Google UK English Female', lang: 'en-GB' }, { name: 'Daniel', lang: 'en-GB' }, { name: 'Kate', lang: 'en-GB' },
    { name: 'Alex', lang: 'en-US' }, { name: 'Samantha', lang: 'en-US' }, { name: 'Karen', lang: 'en-AU' }, { name: 'Rishi', lang: 'en-IN' },
    { name: 'Felipe', lang: 'pt-BR' }, { name: 'Luciana', lang: 'pt-BR' }, { name: 'Amelie', lang: 'fr-FR' },
  ];
  const a = assignVoices(voices, Object.keys(VOICE_PROFILES));
  const names = Object.values(a).map((v) => v.name);
  assert.equal(new Set(names).size, 8, `eight different voices: ${names.join(', ')}`);
  assert.equal(a.carlos.lang, 'pt-BR');
  for (const [id, v] of Object.entries(a)) if (id !== 'carlos') assert.ok(/^en/.test(v.lang), `${id} speaks English`);
  const langs = new Set(Object.entries(a).filter(([id]) => id !== 'carlos').map(([, v]) => v.lang));
  assert.ok(langs.size >= 3, `regional spread ${[...langs].join(', ')}`);
  assert.ok(a.lambda.name !== a.tilly.name && ['Samantha', 'Karen', 'Kate', 'Google UK English Female'].includes(a.lambda.name), 'the chipmunk is a female voice');
  // too few voices: they are shared, but only then
  const two = assignVoices(voices.slice(0, 2), ['marco', 'subnet', 'lambda']);
  assert.equal(new Set(Object.values(two).map((v) => v.name)).size, 2);
});
