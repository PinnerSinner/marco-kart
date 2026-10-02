// The mix: loudness normalisation of the recorded clips, no ducking, the default levels (voice about 5 dB over the music) and the settings migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { measureChannels, normGain, VOICE_TARGET_RMS, PEAK_CEILING, LIMITER_HEADROOM, MAX_GAIN, MIN_GAIN, toDb, softLimit, bufferGain } from '../src/audio/loudness.js';
import { MIX_DEFAULTS, MIX_VERSION, migrateMix, defaultSettings, SettingsModel } from '../src/ui/settings.js';
import { MIX } from '../src/audio/AudioManager.js';
import { makeMockContext } from './drive_mockaudio.js';
import { AudioManager } from '../src/audio/AudioManager.js';
import { SpeechVoice, utteranceParams } from '../src/audio/speech.js';

const peakOf = (a) => { let m = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) m = v; } return m; };
const sine = (amp, n = 44100, f = 220) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / 44100));

test('measureChannels: peak and RMS of a sine, silence is gated out', () => {
  const m = measureChannels([sine(0.5)], 44100);
  assert.ok(Math.abs(m.peak - 0.5) < 1e-3);
  assert.ok(Math.abs(m.rms - 0.5 / Math.SQRT2) < 5e-3, `rms ${m.rms}`);
  // the same sine followed by 3 s of near silence: the speech-only RMS barely changes
  const padded = new Float32Array(44100 * 4); padded.set(sine(0.5)); for (let i = 44100; i < padded.length; i++) padded[i] = 1e-5 * Math.sin(i);
  assert.ok(Math.abs(measureChannels([padded], 44100).rms - m.rms) < 0.01);
  assert.equal(measureChannels([new Float32Array(100)], 44100).rms, 0);
});

test('normGain: quiet clips are lifted to the target, loud ones pulled down, peaky ones held back, silence untouched', () => {
  const quiet = measureChannels([sine(0.005)], 44100), loud = measureChannels([sine(0.9)], 44100);
  const gq = normGain(quiet), gl = normGain(loud);
  assert.ok(gq > 1 && gl < 1);
  assert.ok(Math.abs(quiet.rms * gq - VOICE_TARGET_RMS) < 1e-3, 'quiet reaches the target');
  assert.ok(Math.abs(toDb(loud.rms * gl) - toDb(VOICE_TARGET_RMS)) < 0.1, 'loud reaches the target');
  // a clip that is quiet on average but has a spike: gain is held so the peak stays within the limiter's reach
  const spiky = sine(0.003); spiky[1000] = 0.6;
  const ms = measureChannels([spiky], 44100), gs = normGain(ms);
  assert.ok(ms.peak * gs <= PEAK_CEILING * LIMITER_HEADROOM + 1e-9, 'peak after gain stays within ceiling x headroom');
  assert.ok(gs < VOICE_TARGET_RMS / ms.rms, 'peak limit beats the RMS target');
  assert.equal(normGain({ peak: 0, rms: 0 }), 1);
  assert.ok(normGain({ peak: 0.3, rms: 0.000001 }) === 1, 'unmeasurably quiet = left alone');
  assert.ok(normGain({ peak: 0.001, rms: 0.0002 }) <= MAX_GAIN && normGain({ peak: 1, rms: 5 }) >= MIN_GAIN);
});

test('after normalisation clips of very different levels land within a narrow loudness band and the limiter keeps them from clipping', () => {
  for (const amp of [0.005, 0.02, 0.05, 0.2, 0.6, 1]) {
    const ch = sine(amp); const m = measureChannels([ch], 44100); const g = normGain(m);
    const out = Float32Array.from(ch, (x) => softLimit(x * g));
    assert.ok(peakOf(out) <= 1.0, `amp ${amp} does not clip`);
    const after = measureChannels([out], 44100).rms;
    assert.ok(Math.abs(toDb(after) - toDb(VOICE_TARGET_RMS)) < 1.5, `amp ${amp}: ${toDb(after).toFixed(1)} dB`);
  }
  const buf = { numberOfChannels: 1, sampleRate: 44100, getChannelData: () => sine(0.005) };
  assert.ok(bufferGain(buf) > 1);
});

test('mix levels: master 0.8 / music 0.6 / sfx 0.8 / voice 1, the voice sits 4 to 6 dB over the music, the effects close to the voice', () => {
  const d = MIX_DEFAULTS, curve = (v) => v * v;
  assert.deepEqual({ ...d }, { master: 0.8, music: 0.6, sfx: 0.8, voice: 1 });
  assert.deepEqual(defaultSettings().volume, { master: d.master, music: d.music, sfx: d.sfx, voice: d.voice });
  const voiceDb = toDb(VOICE_TARGET_RMS) + MIX.VOICE_MAKEUP_DB + toDb(curve(d.voice) * MIX.VOICE_TRIM);
  const musicDb = -20 + toDb(curve(d.music) * MIX.MUSIC_TRIM);          // songs are mixed to about -20 dBFS RMS
  const sfxDb = -15 + toDb(curve(d.sfx) * MIX.SFX_TRIM);                // item sounds are calibrated to -15 dBFS (loudest 150 ms)
  assert.ok(voiceDb - musicDb >= 4 && voiceDb - musicDb <= 6, `the voice is ${(voiceDb - musicDb).toFixed(1)} dB over the music`);
  assert.ok(Math.abs(voiceDb - sfxDb) <= 6, `sfx within 6 dB of the voice (${(voiceDb - sfxDb).toFixed(1)})`);
  assert.ok(d.voice >= d.music);
  assert.ok(MIX.BLIP_ALONE > MIX.BLIP_LAYER && MIX.BLIP_LAYER >= 0.5, 'the blip babble is mixed as a clear layer');
});

test('no ducking: the music and effects buses never move while clips, blips or speech are sounding, and there are no duck nodes', async () => {
  const am = new AudioManager({ autoAttach: false });
  am.ctx = makeMockContext(); am.unlocked = true;
  am._buildGraph();
  assert.equal(am.musicDuck, undefined); assert.equal(am.sfxDuck, undefined);
  const events = () => am.ctx.stats.paramEvents;
  const before = events();
  const musicGain = am.musicBus.gain, sfxGain = am.sfxBus.gain;
  const mv = musicGain.value, sv = sfxGain.value;
  const clip = { duration: 2, numberOfChannels: 1, sampleRate: 44100, getChannelData: () => new Float32Array(10) };
  assert.equal(am._startClip(clip, 'marco'), true);
  assert.ok(am.blips.start({ charId: 'rex', text: 'Permission denied' }, { gain: 1 }));
  am.speech.onSpeaking(true);
  am.setPaused(true);
  assert.equal(musicGain.value, mv, 'music untouched'); assert.equal(sfxGain.value, sv, 'sfx untouched');
  assert.ok(events() > before, 'only the voice trim moved');
  assert.equal(am.voiceActive, true);
  am.dispose();
});

test('settings migration to mix 3: the louder-voices defaults go back to 0.8 / 0.6 / 0.8, anything the player chose after is kept', () => {
  assert.equal(MIX_VERSION, 3);
  // stored by the mix-2 migration (master 0.85, music 0.6, sfx 0.65, voice 1): reset to the restored defaults, blips on
  const v2 = { volume: { master: 0.85, music: 0.6, sfx: 0.65, voice: 1 }, quality: 'high', units: 'mph', blips: false, mixV: 2 };
  const m = migrateMix(v2);
  assert.equal(m.mixV, 3);
  assert.deepEqual(m.volume, { master: 0.8, music: 0.6, sfx: 0.8, voice: 1 });
  assert.equal(m.blips, true); assert.equal(m.quality, 'high'); assert.equal(m.units, 'mph');
  // values the player set after mix 2 survive
  const chosen = migrateMix({ volume: { master: 0.9, music: 0.4, sfx: 0.5, voice: 0.7 }, mixV: 2 });
  assert.deepEqual(chosen.volume, { master: 0.9, music: 0.4, sfx: 0.5, voice: 0.7 });
  // a muted voice stays muted
  assert.equal(migrateMix({ volume: { voice: 0 }, mixV: 2 }).volume.voice, 0);
  // settings from before mix 2 go through both steps (the old 0.8 effects come back as 0.8, a quiet choice is kept)
  const old = migrateMix({ volume: { master: 0.8, music: 0.6, sfx: 0.8, voice: 0.9 } });
  assert.deepEqual(old.volume, { master: 0.8, music: 0.6, sfx: 0.8, voice: 1 });
  assert.equal(migrateMix({ volume: { music: 0.2, sfx: 0.3 } }).volume.sfx, 0.3);
  assert.equal(migrateMix({ volume: { music: 0.2, sfx: 0.3 } }).volume.music, 0.2);
  assert.equal(migrateMix(m), m, 'already migrated: untouched');
  assert.equal(migrateMix(null), null);
  // through the model: stored mix-2 settings are migrated, saved back with the version, a later choice survives the next start
  const mem = { settings: v2 };
  const store = { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } };
  const model = new SettingsModel(store, () => {});
  assert.deepEqual(model.get().volume, { master: 0.8, music: 0.6, sfx: 0.8, voice: 1 });
  assert.equal(mem.settings.mixV, 3);
  model.set({ volume: { voice: 0.7, sfx: 0.65 } });
  const again = new SettingsModel(store, () => {}).get();
  assert.equal(again.volume.voice, 0.7); assert.equal(again.volume.sfx, 0.65, 'a later choice of exactly 0.65 is not touched again');
  assert.equal(new SettingsModel({ get: (k, d) => d, set() {} }, () => {}).get().volume.sfx, MIX_DEFAULTS.sfx, 'fresh install = defaults');
  assert.equal(defaultSettings().blips, true, 'blip voices default on');
});

test('speech synthesis: utterance volume is 1 (a floor for the whisperer too); the Voices slider only lowers it below half way', () => {
  const p = utteranceParams('marco', 'hello there', { volume: 1, gain: 1 });
  assert.equal(p.volume, 1);
  assert.ok(utteranceParams('tilly', 'hello', { volume: 1, gain: 1 }).volume >= 0.9);
  assert.equal(new SpeechVoice({ synth: null }).volume, 1);
});

test('AudioManager graph: voices enter through the trim node into a compressor + limiter + soft clip; setVolumes drives the speech volume', () => {
  const am = new AudioManager({ autoAttach: false });
  am.ctx = makeMockContext(); am.unlocked = true;
  am._buildGraph();
  assert.ok(am.voiceComp && am.voiceLimiter && am.voiceTrim && am.voiceBus);
  assert.equal(am.voiceActive, false);
  am.speech.onSpeaking(true);
  assert.equal(am.voiceActive, true);
  am.speech.onSpeaking(false);
  assert.equal(am.voiceActive, false);
  am.setVolumes({ voice: 0.4, master: 0.5 });
  assert.equal(am.speech.volume, 0.4, '2 x 0.4 x 0.5');
  am.setVolumes({ voice: 1, master: 1 });
  assert.equal(am.speech.volume, 1);
  am.dispose();
});

test('every recorded clip, normalised, lands near the target and under the limiter ceiling (decoded with the real decoder when available)', async (t) => {
  let api; try { api = await import('node-web-audio-api'); } catch { return t.skip('node-web-audio-api not installed'); }
  const dir = new URL('../assets/user/', import.meta.url).pathname;
  const files = fs.readdirSync(dir).filter((f) => /^voice_.*\.mp3$/.test(f));
  assert.ok(files.length >= 40, `${files.length} clips`);
  const ctx = new api.OfflineAudioContext(1, 44100, 44100);
  const dbs = [];
  for (const f of files) {
    const b = fs.readFileSync(dir + f);
    const buf = await ctx.decodeAudioData(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
    const g = bufferGain(buf);
    const ch = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
    const m = measureChannels(ch, buf.sampleRate);
    assert.ok(m.peak * g <= PEAK_CEILING * LIMITER_HEADROOM + 1e-6, `${f} peak after gain`);
    const lim = Float32Array.from(ch[0], (x) => softLimit(x * g));
    assert.ok(peakOf(lim) <= 1, `${f} never clips`);
    dbs.push(toDb(m.rms * g));
  }
  const spread = Math.max(...dbs) - Math.min(...dbs);
  const raw = [];
  assert.ok(spread < 12, `normalised loudness spread ${spread.toFixed(1)} dB`);
  assert.ok(dbs.filter((d) => Math.abs(d - toDb(VOICE_TARGET_RMS)) < 1).length >= files.length * 0.6, 'most clips hit the target');
  void raw;
});
