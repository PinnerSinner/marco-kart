// Offline rendering of every synthesised sound (sfx, engine, music) into raw sample buffers. Used by the headless-Chromium
// verification (test/demo_drive_audio.js) to prove nothing clips, is silent, contains NaN or overruns its declared length.
// Browser only (needs OfflineAudioContext).
import { SFX } from './sfx.js';
import { SONGS } from './music/index.js';
import { SongRunner } from './music/sequencer.js';
import { PlayerEngine, RivalHum } from './engine.js';

const RATE = 44100;

/** @returns {Promise<{channels: Float32Array[], sampleRate: number}>} */
async function render(seconds, build, sampleRate = RATE) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  build(ctx, bus);
  const buf = await ctx.startRendering();
  return { channels: [buf.getChannelData(0), buf.getChannelData(1)], sampleRate };
}

/** Render one sfx by name at its own volume, with 0.6 s of extra tail. */
export function renderSfx(name, { pitch = 1, vol = 1 } = {}) {
  const def = SFX[name];
  return render(def.dur + 0.6, (ctx, bus) => def.play(ctx, bus, 0.02, { pitch, vol }));
}

const STEMS = ['drums', 'bass', 'pad', 'lead', 'arp', 'keys', 'fx'];

/**
 * Render a song: the intro once plus `loops` passes of the loop. The song is scheduled in 2-second chunks from suspend()
 * callbacks, exactly like the live lookahead scheduler does, which also keeps the offline graph small enough to render fast.
 * With `stems` the context gets 2 + 7 channels: the stereo mix followed by a mono tap of every mixer channel.
 * `bars` renders only that many bars starting at loop bar `startBar` (for mix analysis).
 * @returns {Promise<{channels: Float32Array[], sampleRate: number, introSeconds: number, loopSeconds: number, t0: number, stems?: Record<string, Float32Array[]>}>}
 */
export async function renderSong(key, { loops = 2, intensity = 0, sampleRate = RATE, stems = false, startBar = 0, bars = 0, rig } = {}) {
  const base = SONGS[key];
  const song = rig ? { ...base, rig: { ...base.rig, ...rig, levels: { ...base.rig?.levels, ...rig.levels } } } : base;
  const bpm = song.bpm * (1 + 0.07 * intensity);
  const stepSec = 60 / (bpm * 4);
  const introSeconds = (song.introBars ?? 0) * 16 * stepSec, loopSeconds = song.loopBars * 16 * stepSec;
  const musicSeconds = bars ? bars * 16 * stepSec : introSeconds + loops * loopSeconds;
  const total = musicSeconds + 4, t0 = 0.05, chunk = 2;
  const nch = stems ? 2 + STEMS.length : 2;
  const ctx = new OfflineAudioContext(nch, Math.ceil(total * sampleRate), sampleRate);
  const bus = ctx.createGain();
  let merger = null;
  if (stems) {
    merger = ctx.createChannelMerger(nch); merger.connect(ctx.destination);
    const split = ctx.createChannelSplitter(2); bus.connect(split); split.connect(merger, 0, 0); split.connect(merger, 1, 1);
  } else bus.connect(ctx.destination);
  const onChannel = stems ? (name, node) => { node.connect(merger, 0, 2 + STEMS.indexOf(name)); } : undefined;
  const runner = new SongRunner(ctx, bus, song, { seed: 7, onChannel });
  runner.setIntensity(intensity);
  if (bars) runner.stepIndex = runner.introSteps + startBar * 16;
  runner.stopAt = t0 + musicSeconds + 2;
  runner.start(t0);
  runner.pump(t0 + 2 * chunk);
  const pumps = [];
  for (let t = chunk; t < musicSeconds; t += chunk) {
    pumps.push(ctx.suspend(t).then(() => { runner.pump(Math.min(t0 + musicSeconds - 1e-6, t + 2 * chunk)); ctx.resume(); }));
  }
  const buf = await ctx.startRendering();
  await Promise.all(pumps);
  const out = { channels: [buf.getChannelData(0), buf.getChannelData(1)], sampleRate, introSeconds, loopSeconds, t0 };
  if (stems) { out.stems = {}; STEMS.forEach((name, i) => { out.stems[name] = buf.getChannelData(2 + i); }); }
  return out;
}

/**
 * Render the player engine through a scripted drive (accelerate through the gears, drift with squeal, boost, grass, kerb, jump).
 * @returns {Promise<{channels: Float32Array[], sampleRate: number, seconds: number}>}
 */
export async function renderEngine() {
  const seconds = 26;
  const r = await render(seconds + 0.5, (ctx, bus) => {
    const eng = new PlayerEngine(ctx, bus, 0);
    const k = { speed: 0, params: { top: 33 }, grounded: true, slip: 0, drift: { active: false }, boost: { time: 0, power: 1 }, ground: { surface: 'road' }, status: { spin: 0 } };
    const dt = 1 / 60;
    for (let i = 0; i < seconds * 60; i++) {
      const t = i * dt;
      // 0-4 s idle, 4-12 full throttle, 12-16 drift, 16-18 boost, 18-21 grass, 21-23 kerb, 23-24 airborne, then coast
      if (t < 4) k.speed = 0;
      else if (t < 12) k.speed = Math.min(33, (t - 4) * 5.2);
      else if (t >= 23.6) k.speed = Math.max(0, k.speed - 9 * dt);
      k.slip = t >= 12 && t < 16 ? 0.9 : 0;
      k.drift.active = t >= 12 && t < 16;
      k.boost.time = t >= 16 && t < 18 ? 1 : 0;
      if (t >= 16 && t < 18) k.speed = Math.min(41, k.speed + 12 * dt);
      else if (t >= 18 && t < 21) k.speed = Math.max(18, k.speed - 8 * dt);
      k.ground.surface = t >= 18 && t < 21 ? 'grass' : t >= 21 && t < 23 ? 'kerb' : 'road';
      if (t >= 21 && t < 23) k.speed = Math.min(30, k.speed + 6 * dt);
      k.grounded = !(t >= 23 && t < 23.6);
      eng.update(t, k, dt);
    }
    // three rival hums at different distances / speeds
    for (let i = 0; i < 3; i++) {
      const h = new RivalHum(ctx, bus, 0);
      for (let n = 0; n < 60 * seconds; n += 6) h.set(n / 60, 0.4 + 0.5 * Math.min(1, n / 60 / (10 + i * 3)), 0.6 / (i + 1), i - 1);
    }
  });
  return { ...r, seconds };
}

// ---- analysis ------------------------------------------------------------------------------------------------------------------

/** @param {Float32Array[]} channels @returns {{peak:number, rms:number, nan:boolean, dc:number}} */
export function levels(channels) {
  let peak = 0, sum = 0, n = 0, nan = false, dc = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) {
    const v = ch[i];
    if (!Number.isFinite(v)) { nan = true; continue; }
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    sum += v * v; dc += v; n++;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), nan, dc: dc / Math.max(1, n) };
}

/** Seconds until the signal is last louder than `thresh` (default -60 dBFS). */
export function audibleSeconds(channels, sampleRate, thresh = 0.001) {
  let last = 0;
  for (const ch of channels) for (let i = ch.length - 1; i >= 0; i--) if (Math.abs(ch[i]) > thresh) { if (i > last) last = i; break; }
  return last / sampleRate;
}

/** RMS envelope in windows of `win` seconds (mono mix). */
export function envelope(channels, sampleRate, win = 0.1) {
  const n = Math.floor(channels[0].length / (win * sampleRate));
  const out = new Float32Array(n), w = Math.floor(win * sampleRate);
  for (let b = 0; b < n; b++) {
    let s = 0;
    for (let i = b * w; i < (b + 1) * w; i++) { const m = 0.5 * (channels[0][i] + channels[1][i]); s += m * m; }
    out[b] = Math.sqrt(s / w);
  }
  return out;
}

/** Pearson correlation of two equal-length arrays. */
export function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb + 1e-30);
}

/** In-place radix-2 FFT magnitude spectrum of the mono mix of channels[start..start+size). size must be a power of two. */
export function spectrum(channels, start, size = 4096) {
  const re = new Float64Array(size), im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const idx = start + i;
    const v = idx < channels[0].length ? 0.5 * (channels[0][idx] + channels[1][idx]) : 0;
    re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= size; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < size; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = i + j + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  const mag = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  return mag;
}

/**
 * Chroma (12 pitch classes, C = 0) of a stretch of audio, using bins between 55 and 2000 Hz.
 * @returns {Float64Array} energies (sum of squared magnitudes), unnormalised
 */
export function chroma(channels, sampleRate, startSec, lenSec) {
  const size = 16384, chromaOut = new Float64Array(12);
  const hop = size, start = Math.floor(startSec * sampleRate), end = Math.floor((startSec + lenSec) * sampleRate);
  for (let s = start; s + size <= end; s += hop) {
    const mag = spectrum(channels, s, size);
    for (let i = 1; i < mag.length; i++) {
      const f = (i * sampleRate) / size;
      if (f < 55 || f > 2000) continue;
      const midi = 69 + 12 * Math.log2(f / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chromaOut[pc] += mag[i] * mag[i];
    }
  }
  return chromaOut;
}
