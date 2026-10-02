// Offline check of the mix with a real OfflineAudioContext: the same graph shape as AudioManager (music -> bus, sfx -> bus,
// clips + blips -> voiceTrim -> voiceBus -> compressor -> limiter -> soft clip, all -> master -> limiter), at the default sliders.
// There is NO ducking: the music and the effects never move while somebody talks. Renders each stem alone and prints
//   - the loudness of Marco's real clips (normalised, through the voice bus) against the music: the voice should sit 4 to 6 dB over it,
//   - the blip babble of every character (alone and as the layer under speech) against the clips,
//   - an overlap test (3 clips + 6 blip lines at once): the master must not clip.
// Exit code 1 when the average voice-over-music gap is outside 4..6 dB.   usage: node tools/mix_check.mjs [clip-name ...]
import fs from 'node:fs';
import path from 'node:path';
import { webAudio } from './sfx_lib.mjs';
import { SFX } from '../src/audio/sfx.js';
import { SONGS } from '../src/audio/music/index.js';
import { SongRunner } from '../src/audio/music/sequencer.js';
import { MIX } from '../src/audio/AudioManager.js';
import { MIX_DEFAULTS } from '../src/ui/settings.js';
import { bufferGain, measureChannels, toDb, softClipCurve } from '../src/audio/loudness.js';
import { BlipVoice, BLIP_TIMBRES } from '../src/audio/blips.js';
import { estimateSpeechMs, VOICE_PROFILES } from '../src/audio/speech.js';
import { overlapTrim } from '../src/audio/voiceRegistry.js';

const api = await webAudio();
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SR = 44100, DUR = 6;
const curve = (v) => v * v;
const CLIPS = process.argv.length > 2 ? process.argv.slice(2) : ['voice_overtake', 'voice_go', 'voice_boost', 'voice_hit', 'voice_ready', 'voice_win', 'voice_final_lap', 'voice_item'];

function graph() {
  const ctx = new api.OfflineAudioContext(2, DUR * SR, SR);
  const master = ctx.createGain(); master.gain.value = curve(MIX_DEFAULTS.master);
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -5; lim.knee.value = 4; lim.ratio.value = 14; lim.attack.value = 0.003; lim.release.value = 0.16;
  master.connect(lim); lim.connect(ctx.destination);
  const mk = (g) => { const n = ctx.createGain(); n.gain.value = g; return n; };
  const musicBus = mk(curve(MIX_DEFAULTS.music) * MIX.MUSIC_TRIM), sfxBus = mk(curve(MIX_DEFAULTS.sfx) * MIX.SFX_TRIM), voiceBus = mk(curve(MIX_DEFAULTS.voice) * MIX.VOICE_TRIM), voiceTrim = mk(1);
  musicBus.connect(master); sfxBus.connect(master);
  const vc = ctx.createDynamicsCompressor(); vc.threshold.value = -16; vc.knee.value = 10; vc.ratio.value = 3; vc.attack.value = 0.004; vc.release.value = 0.16;
  const vl = ctx.createDynamicsCompressor(); vl.threshold.value = -3; vl.knee.value = 0; vl.ratio.value = 20; vl.attack.value = 0.001; vl.release.value = 0.08;
  const vs = ctx.createWaveShaper(); vs.curve = softClipCurve(0.9);
  voiceTrim.connect(voiceBus); voiceBus.connect(vc); vc.connect(vl); vl.connect(vs); vs.connect(master);
  return { ctx, musicBus, sfxBus, voiceTrim };
}

const decode = async (ctx, name) => {
  const b = fs.readFileSync(path.join(root, `assets/user/${name}.mp3`));
  return ctx.decodeAudioData(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
};

async function render(build) {
  const g = graph();
  await build(g);
  const out = await g.ctx.startRendering();
  return [out.getChannelData(0), out.getChannelData(1)];
}
const win = (ch, a, b) => ch.map((c) => c.subarray(Math.floor(a * SR), Math.floor(b * SR)));
const db = (ch, a, b) => toDb(measureChannels(win(ch, a, b), SR).rms);
const peak = (ch) => toDb(Math.max(...ch.map((c) => { let m = 0; for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i])); return m; })));
const startMusic = ({ ctx, musicBus }) => { const gain = ctx.createGain(); gain.connect(musicBus); const runner = new SongRunner(ctx, gain, SONGS.copacabana, { seed: 7 }); runner.start(0.05); runner.stopAt = DUR; runner.pump(DUR); };

// ---- music alone: the level is constant (no duck), measured over the whole render ----
const music = await render(startMusic);
const musicDb = db(music, 0.5, DUR - 0.2);
console.log(`defaults ${JSON.stringify(MIX_DEFAULTS)}  trims ${JSON.stringify(MIX)}  (no ducking: the music is ${musicDb.toFixed(1)} dBFS RMS throughout)`);

// ---- recorded clips ----
const gaps = [];
for (const clip of CLIPS) {
  if (!fs.existsSync(path.join(root, `assets/user/${clip}.mp3`))) { console.log(`${clip}: missing, skipped`); continue; }
  let len = 0;
  const v = await render(async ({ ctx, voiceTrim }) => {
    const buf = await decode(ctx, clip); len = buf.duration;
    const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); g.gain.value = bufferGain(buf); src.connect(g); g.connect(voiceTrim); src.start(0.5);
  });
  const vdb = db(v, 0.55, Math.min(0.5 + len, DUR - 0.1));
  gaps.push(vdb - musicDb);
  console.log(`${clip.padEnd(18)} ${len.toFixed(2)} s  voice ${vdb.toFixed(1)} dBFS  = ${(vdb - musicDb).toFixed(1)} dB over the music  (peak ${peak(v).toFixed(1)} dBFS)`);
}
const mean = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);
console.log(`voice over music: mean ${mean.toFixed(1)} dB (min ${Math.min(...gaps).toFixed(1)}, max ${Math.max(...gaps).toFixed(1)}); target 4 to 6 dB`);

// ---- sfx for reference ----
const SFX_PICK = Object.keys(SFX).filter((n) => /^item-(use|hit)-/.test(n)).slice(0, 4);
const sfx = await render(({ ctx, sfxBus }) => { SFX_PICK.forEach((n, i) => { const g = ctx.createGain(); g.connect(sfxBus); SFX[n].play(ctx, g, 0.3 + i * 1.1, { pitch: 1, vol: 1 }); }); });
console.log(`sfx (4 item sounds, default sfx slider): ${db(sfx, 0.3, 4.7).toFixed(1)} dBFS = ${(db(sfx, 0.3, 4.7) - musicDb).toFixed(1)} dB vs the music`);

// ---- blips: every character babbling alone (BLIP_ALONE) and as the layer (BLIP_LAYER), against the average clip ----
const line = 'Right then, you absolute melons, shift it!';
const clipMean = mean + musicDb;
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const blipLines = async (ids, level) => render(({ ctx, voiceTrim }) => {
  Object.defineProperty(ctx, 'state', { value: 'running' });
  const bv = new BlipVoice({ ctx: () => ctx, dest: () => voiceTrim, rng: seeded(11) });
  for (const id of ids) bv.start({ charId: id, text: line }, { gain: level, durationMs: estimateSpeechMs(line, VOICE_PROFILES[id]?.rate ?? 1), force: true });
});
for (const id of Object.keys(BLIP_TIMBRES)) {
  const a = await blipLines([id], MIX.BLIP_ALONE), l = await blipLines([id], MIX.BLIP_LAYER);
  const ms = estimateSpeechMs(line, VOICE_PROFILES[id]?.rate ?? 1) / 1000;
  const da = db(a, 0.05, 0.05 + ms), dl = db(l, 0.05, 0.05 + ms);
  if (process.env.CALIBRATE) console.log(`  ${id}: gain ${BLIP_TIMBRES[id].gain} -> ${(BLIP_TIMBRES[id].gain * Math.pow(10, (clipMean - 3 - da) / 20)).toFixed(3)} for -3 dB vs the clips`);
  console.log(`blips ${id.padEnd(8)} alone ${da.toFixed(1)} dBFS (${(da - clipMean).toFixed(1)} dB vs the clips)  as layer ${dl.toFixed(1)} dBFS (${(dl - clipMean).toFixed(1)})  peak ${peak(a).toFixed(1)}/${peak(l).toFixed(1)}`);
}

// ---- overlap: three clips and six blip lines at once ----
const all = await render(async (g) => {
  const { ctx, voiceTrim, sfxBus } = g;
  Object.defineProperty(ctx, 'state', { value: 'running' });
  voiceTrim.gain.value = overlapTrim(6);
  startMusic(g);
  SFX_PICK.slice(0, 2).forEach((n, i) => { const gg = ctx.createGain(); gg.connect(sfxBus); SFX[n].play(ctx, gg, 0.6 + i * 0.5, { pitch: 1, vol: 1 }); });
  for (const clip of CLIPS.slice(0, 3)) { const buf = await decode(ctx, clip); const src = ctx.createBufferSource(); src.buffer = buf; const gg = ctx.createGain(); gg.gain.value = bufferGain(buf); src.connect(gg); gg.connect(voiceTrim); src.start(0.5); }
  const bv = new BlipVoice({ ctx: () => ctx, dest: () => voiceTrim });
  for (const id of ['subnet', 'lambda', 'carlos', 'biscuit', 'tilly', 'rex']) bv.start({ charId: id, text: line }, { gain: MIX.BLIP_ALONE, durationMs: 2400, force: true });
});
let nan = 0; for (const c of all) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) nan++;
console.log(`overlap (3 clips + 6 blip lines + music + sfx, trim ${toDb(overlapTrim(6)).toFixed(1)} dB): master peak ${peak(all).toFixed(1)} dBFS, NaN samples ${nan}`);

if (!(mean >= 4 && mean <= 6) || nan || peak(all) > -0.5) { console.log('FAIL: outside the expected mix'); process.exit(1); }
console.log('OK');
