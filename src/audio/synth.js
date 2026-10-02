// Shared WebAudio synthesis toolkit. Every function takes the AudioContext (real OR OfflineAudioContext), an output node
// and an absolute start time, so the same voices play live and render offline for verification (see offline.js).
// Nothing here touches the DOM or the clock; randomness is seeded so renders are reproducible.
import { makeRng } from '../core/util.js';

/** MIDI note number -> frequency in Hz. */
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PITCH_CLASS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/** 'F#4' -> 66. Throws on nonsense so typos in melodies fail loudly in tests. */
export function noteToMidi(name) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m || !(m[1] in PITCH_CLASS)) throw new Error(`bad note name "${name}"`);
  return 12 * (Number(m[2]) + 1) + PITCH_CLASS[m[1]];
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---- noise -----------------------------------------------------------------------------------------------------------

const noiseCache = new WeakMap();

/** Cached 2 s mono noise buffer of the given colour for this context. @param {'white'|'pink'|'brown'} [kind] */
export function getNoise(ctx, kind = 'white') {
  let byKind = noiseCache.get(ctx);
  if (!byKind) { byKind = {}; noiseCache.set(ctx, byKind); }
  if (byKind[kind]) return byKind[kind];
  const n = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rng = makeRng(kind === 'white' ? 11 : kind === 'pink' ? 23 : 37);
  if (kind === 'white') for (let i = 0; i < n; i++) d[i] = rng() * 2 - 1;
  else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = rng() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (rng() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  }
  // make the loop point click-free: crossfade the last 256 samples into the first
  for (let i = 0; i < 256; i++) { const k = i / 256; d[n - 256 + i] = d[n - 256 + i] * (1 - k) + d[i] * k; }
  byKind[kind] = buf;
  return buf;
}

let noiseOffset = 0;
/** A started noise source (one-shot or looping). `offset` decorrelates simultaneous voices. */
export function noiseSource(ctx, kind, t, dur = 0, loop = false) {
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx, kind);
  src.loop = loop;
  noiseOffset = (noiseOffset + 0.37) % 1.5;
  src.start(t, noiseOffset);
  if (dur > 0) src.stop(t + dur);
  return src;
}

// ---- envelopes -------------------------------------------------------------------------------------------------------

/**
 * ADSR on an AudioParam. Attack is linear, decay/release are exponential-ish (setTarget) so events never overlap.
 * @returns {number} time at which the voice is silent and its nodes may be stopped
 */
export function adsr(param, t, { a = 0.005, d = 0.1, s = 0.7, dur = 0.3, r = 0.1, peak = 1 }) {
  const end = t + Math.max(dur, a + 0.001);
  // A new GainNode's gain defaults to 1: without this a sample-rounded source start can leak one full-scale sample before the envelope opens.
  param.value = 0;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + Math.max(a, 0.0005));
  if (s < 1) param.setTargetAtTime(Math.max(peak * s, 0), t + a, Math.max(d, 0.005) / 3);
  param.setTargetAtTime(0, end, Math.max(r, 0.005) / 3.5);
  return end + r * 1.6;
}

// ---- generic voices ---------------------------------------------------------------------------------------------------

/**
 * Oscillator voice with ADSR, optional unison, pitch glide, vibrato and a filter with cutoff envelope.
 * @param {BaseAudioContext} ctx @param {AudioNode} out @param {number} t start time (s)
 * @param {object} o wave, freq, dur, vol, a, d, s, r, unison, spread(cents), detune(cents), glideFrom(Hz), glideTime,
 *   cutoff, cutoffEnd, cutoffTime, q, filterType, vibrato(cents), vibRate, vibDelay, pan
 * @returns {number} end time
 */
export function tone(ctx, out, t, o) {
  const { wave = 'sawtooth', freq = 440, dur = 0.3, vol = 0.3, unison = 1, spread = 10, detune = 0 } = o;
  const g = ctx.createGain();
  const stop = adsr(g.gain, t, { a: o.a ?? 0.005, d: o.d ?? 0.1, s: o.s ?? 0.7, dur, r: o.r ?? 0.1, peak: vol });
  let head = g;
  if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); g.connect(p); head = p; }
  head.connect(out);
  let sink = g;
  if (o.cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = o.filterType ?? 'lowpass'; f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.cutoff, t);
    if (o.cutoffEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.cutoffEnd), t + (o.cutoffTime ?? dur));
    f.connect(g); sink = f;
  }
  const trim = unison > 1 ? 1 / Math.sqrt(unison) : 1;
  const tr = ctx.createGain(); tr.gain.value = trim; tr.connect(sink);
  const oscs = [];
  for (let i = 0; i < unison; i++) {
    const osc = ctx.createOscillator();
    osc.type = wave;
    const cents = unison > 1 ? ((i / (unison - 1)) * 2 - 1) * spread : 0;
    osc.detune.value = cents + detune;
    if (o.glideFrom) { osc.frequency.setValueAtTime(o.glideFrom, t); osc.frequency.exponentialRampToValueAtTime(freq, t + (o.glideTime ?? 0.05)); }
    else osc.frequency.setValueAtTime(freq, t);
    osc.connect(tr); osc.start(t); osc.stop(stop);
    oscs.push(osc);
  }
  if (o.vibrato) {
    const lfo = ctx.createOscillator(); lfo.frequency.value = o.vibRate ?? 5.5;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vibrato, t + (o.vibDelay ?? 0.15) + 0.2);
    lfo.connect(lg); for (const osc of oscs) lg.connect(osc.detune);
    lfo.start(t); lfo.stop(stop);
  }
  return stop;
}

/** Filtered noise burst (hats, snares, whooshes, scrapes). */
export function burst(ctx, out, t, { dur = 0.1, vol = 0.3, kind = 'white', type = 'bandpass', freq = 2000, freqEnd = 0, q = 1, a = 0.002, r = 0, d = 0, s = 0, pan = 0 }) {
  const g = ctx.createGain();
  const rel = r || dur * 0.6;
  const stop = adsr(g.gain, t, { a, d: d || dur * 0.5, s, dur: d ? dur : Math.max(0.002, a + 0.001), r: d ? rel : dur, peak: vol });
  let head = g;
  if (pan) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); head = p; }
  head.connect(out);
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
  f.connect(g);
  const src = noiseSource(ctx, kind, t, stop - t);
  src.connect(f);
  return stop;
}

// ---- drums ---------------------------------------------------------------------------------------------------------------

/** Kick: sine with a fast pitch drop plus a click. */
export function kick(ctx, out, t, { vol = 0.9, pitch = 46, punch = 130, decay = 0.32 } = {}) {
  const g = ctx.createGain();
  const stop = adsr(g.gain, t, { a: 0.002, d: decay * 0.6, s: 0, dur: 0.01, r: decay, peak: vol });
  g.connect(out);
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(punch, t); o.frequency.exponentialRampToValueAtTime(pitch, t + 0.09);
  o.connect(g); o.start(t); o.stop(stop);
  burst(ctx, out, t, { dur: 0.012, vol: vol * 0.18, type: 'highpass', freq: 2500, a: 0.0008 });
  return stop;
}

/** Snare: noise body + short pitched tone. */
export function snare(ctx, out, t, { vol = 0.5, tone: toneHz = 185, decay = 0.17, snap = 1 } = {}) {
  burst(ctx, out, t, { dur: decay, vol: vol * 0.85 * snap, type: 'highpass', freq: 1500, q: 0.6, a: 0.001 });
  burst(ctx, out, t, { dur: decay * 0.6, vol: vol * 0.3, type: 'bandpass', freq: 4200, q: 0.8, a: 0.001 });
  return tone(ctx, out, t, { wave: 'triangle', freq: toneHz, glideFrom: toneHz * 1.5, glideTime: 0.03, dur: 0.02, a: 0.001, d: 0.06, s: 0, r: decay * 0.5, vol: vol * 0.55 });
}

/** Hand clap: three fast noise slaps and a tail. */
export function clap(ctx, out, t, { vol = 0.45, decay = 0.2 } = {}) {
  for (let i = 0; i < 3; i++) burst(ctx, out, t + i * 0.011, { dur: 0.02, vol: vol * 0.7, type: 'bandpass', freq: 1300 + i * 150, q: 1.4, a: 0.0008 });
  return burst(ctx, out, t + 0.033, { dur: decay, vol: vol * 0.6, type: 'bandpass', freq: 1250, q: 1.1, a: 0.001 });
}

/** Closed / open hi-hat. */
export function hat(ctx, out, t, { vol = 0.22, open = false, freq = 7500 } = {}) {
  return burst(ctx, out, t, { dur: open ? 0.3 : 0.045, vol, type: 'highpass', freq, q: 0.9, a: 0.001 });
}

/** Tom / conga / surdo: pitched membrane. */
export function drum(ctx, out, t, { vol = 0.5, freq = 120, drop = 1.8, decay = 0.25, noise = 0.2 } = {}) {
  const stop = tone(ctx, out, t, { wave: 'sine', freq, glideFrom: freq * drop, glideTime: 0.06, dur: 0.01, a: 0.001, d: decay * 0.5, s: 0, r: decay, vol });
  if (noise > 0) burst(ctx, out, t, { dur: 0.03, vol: vol * noise, type: 'bandpass', freq: freq * 6, q: 1, a: 0.001 });
  return stop;
}

/** Shaker / ganza tick. */
export function shaker(ctx, out, t, { vol = 0.12, freq = 6500, dur = 0.05 } = {}) {
  return burst(ctx, out, t, { dur, vol, type: 'bandpass', freq, q: 1.6, a: 0.006 });
}

/** Rim click / wood block. */
export function rim(ctx, out, t, { vol = 0.35, freq = 1700 } = {}) {
  burst(ctx, out, t, { dur: 0.02, vol: vol * 0.5, type: 'highpass', freq: 3000, a: 0.0008 });
  return tone(ctx, out, t, { wave: 'square', freq, dur: 0.01, a: 0.0006, d: 0.03, s: 0, r: 0.03, vol: vol * 0.5, cutoff: 3500 });
}

/** Cowbell / agogo bell: two inharmonic partials. */
export function bell(ctx, out, t, { vol = 0.25, freq = 540, decay = 0.25, ratio = 1.48 } = {}) {
  tone(ctx, out, t, { wave: 'square', freq: freq * ratio, dur: 0.01, a: 0.0008, d: decay * 0.5, s: 0, r: decay, vol: vol * 0.7, cutoff: 5200 });
  return tone(ctx, out, t, { wave: 'square', freq, dur: 0.01, a: 0.0008, d: decay * 0.5, s: 0, r: decay, vol, cutoff: 5200 });
}

/** Crash cymbal. */
export function crash(ctx, out, t, { vol = 0.3, decay = 1.6 } = {}) {
  burst(ctx, out, t, { dur: decay, vol, type: 'highpass', freq: 5200, q: 0.5, a: 0.002, r: decay * 0.9, d: decay * 0.3, s: 0.15 });
  return burst(ctx, out, t, { dur: decay * 0.6, vol: vol * 0.5, type: 'bandpass', freq: 9500, q: 0.8, a: 0.002, r: decay * 0.5, d: decay * 0.2, s: 0.1 });
}

/** Timpani hit. */
export function timpani(ctx, out, t, { vol = 0.6, freq = 98, decay = 0.9 } = {}) {
  burst(ctx, out, t, { dur: 0.05, vol: vol * 0.3, type: 'lowpass', freq: 900, a: 0.001 });
  return tone(ctx, out, t, { wave: 'sine', freq, glideFrom: freq * 1.25, glideTime: 0.12, dur: 0.02, a: 0.002, d: decay * 0.5, s: 0, r: decay, vol });
}

// ---- effects ---------------------------------------------------------------------------------------------------------------

/**
 * Synthetic reverb: a stereo impulse of decaying, progressively darker noise into a ConvolverNode.
 * @returns {{input: GainNode, output: GainNode}}
 */
export function makeReverb(ctx, { seconds = 2.2, decay = 2.6, wet = 1, damp = 0.35 } = {}) {
  const rate = ctx.sampleRate, n = Math.floor(rate * seconds);
  const ir = ctx.createBuffer(2, n, rate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c), rng = makeRng(101 + c * 17);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const a = damp + (1 - damp) * (1 - k);                       // tail gets darker
      lp += a * ((rng() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - k, decay) * (i < 300 ? i / 300 : 1);
    }
  }
  const conv = ctx.createConvolver(); conv.normalize = true; conv.buffer = ir;
  const input = ctx.createGain(), output = ctx.createGain();
  output.gain.value = wet;
  input.connect(conv); conv.connect(output);
  return { input, output };
}

/** Feedback delay with a tone filter in the loop. @returns {{input: GainNode, output: GainNode}} */
export function makeDelay(ctx, { time = 0.375, feedback = 0.4, cutoff = 3200, wet = 0.5 } = {}) {
  const input = ctx.createGain(), output = ctx.createGain(); output.gain.value = wet;
  const d = ctx.createDelay(2); d.delayTime.value = time;
  const fb = ctx.createGain(); fb.gain.value = feedback;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
  input.connect(d); d.connect(f); f.connect(fb); fb.connect(d); f.connect(output);
  return { input, output };
}

/**
 * A mixer channel: gain -> (pan) -> out, with optional reverb / delay sends.
 * @returns {GainNode} connect voices to this node
 */
export function makeChannel(ctx, out, { gain = 1, pan = 0, reverb = null, reverbSend = 0, delay = null, delaySend = 0 } = {}) {
  const g = ctx.createGain(); g.gain.value = gain;
  let head = g;
  if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); head = p; }
  head.connect(out);
  if (reverb && reverbSend > 0) { const s = ctx.createGain(); s.gain.value = reverbSend; head.connect(s); s.connect(reverb.input); }
  if (delay && delaySend > 0) { const s = ctx.createGain(); s.gain.value = delaySend; head.connect(s); s.connect(delay.input); }
  return g;
}

/** Sidechain-style ducking node: route a channel through `input`, call duck() at each kick. */
export function makeDuck(ctx, out) {
  const input = ctx.createGain();
  input.connect(out);
  return {
    input,
    /** Dip the gain at `t` and release linearly. */
    duck(t, depth = 0.35, release = 0.18) { input.gain.setValueAtTime(depth, t); input.gain.linearRampToValueAtTime(1, t + release); },
  };
}

// ---- melody / chord notation ----------------------------------------------------------------------------------------------------

/**
 * Parse a melody string: tokens "C5:4" (note:steps), "." rest (1 step, or ".:n"), "-" extends the previous note by 1 step.
 * Default length is 2 steps. Returns [{step, midi, dur}] with step counted from the start of the string.
 */
export function parseMelody(str) {
  const out = []; let step = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    const [name, len] = tok.split(':');
    const n = len ? Number(len) : (name === '.' || name === '-' ? 1 : 2);
    if (!(n > 0)) throw new Error(`bad length in "${tok}"`);
    if (name === '.') { step += n; continue; }
    if (name === '-') { if (out.length) out[out.length - 1].dur += n; step += n; continue; }
    out.push({ step, midi: noteToMidi(name), dur: n });
    step += n;
  }
  return { notes: out, steps: step };
}

/** Chord tone tables (semitones above the root). */
export const CHORDS = {
  maj: [0, 4, 7], min: [0, 3, 7], dom7: [0, 4, 7, 10], min7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], m7b5: [0, 3, 6, 10],
  sus4: [0, 5, 7], maj9: [0, 4, 7, 11, 14], min9: [0, 3, 7, 10, 14], dom9: [0, 4, 7, 10, 14], dom13: [0, 4, 7, 10, 14, 21],
  dom7s9: [0, 4, 7, 10, 15], dom7b9: [0, 4, 7, 10, 13], dom7b13: [0, 4, 7, 10, 20], dim7: [0, 3, 6, 9], maj6: [0, 4, 7, 9],
  maj69: [0, 4, 7, 9, 14], min6: [0, 3, 7, 9], dom7sus: [0, 5, 7, 10], maj7s11: [0, 4, 7, 11, 18], min7add11: [0, 3, 7, 10, 17], power: [0, 7, 12], min11: [0, 3, 7, 10, 14, 17], add9: [0, 4, 7, 14], sus2: [0, 2, 7],
};

/** MIDI notes for a chord: chordNotes(60, 'min7') -> [60, 63, 67, 70]. Optional inversion moves the lowest notes up an octave. */
export function chordNotes(root, quality, inversion = 0) {
  const tones = CHORDS[quality];
  if (!tones) throw new Error(`unknown chord quality "${quality}"`);
  const notes = tones.map((i) => root + i);
  for (let i = 0; i < inversion; i++) notes.push(notes.shift() + 12);
  return notes;
}

/** Deterministic humanisation source for step() functions (fresh per rig). */
export function makeGroove(seed) { return makeRng(seed); }
