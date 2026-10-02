// Melodic instrument voices built on synth.js primitives. Each takes (ctx, out, t, opts) and returns the end time.
// `midi` is a MIDI note number, `dur` the held length in seconds, `vol` linear gain (peak per voice, before the mix bus).
import { mtof, tone, burst } from './synth.js';

/** Punchy filtered bass: saw + square sub, filter envelope closing fast. */
export function bass(ctx, out, t, { midi, dur = 0.2, vol = 0.32, cutoff = 1500, cutoffEnd = 260, q = 3, wave = 'sawtooth', sub = 0.7, decay = 0.12 }) {
  const f = mtof(midi);
  tone(ctx, out, t, { wave: 'sine', freq: f, dur, a: 0.004, d: decay, s: 0.85, r: 0.06, vol: vol * sub });
  return tone(ctx, out, t, { wave, freq: f, dur, a: 0.003, d: decay, s: 0.6, r: 0.05, vol: vol * 0.55, cutoff, cutoffEnd, cutoffTime: Math.max(dur, 0.12), q });
}

/** Round synth bass with a longer body (synthwave / trance). */
export function bassRound(ctx, out, t, { midi, dur = 0.2, vol = 0.3, cutoff = 900, cutoffEnd = 380, q = 4 }) {
  const f = mtof(midi);
  tone(ctx, out, t, { wave: 'sine', freq: f, dur, a: 0.004, d: 0.1, s: 0.9, r: 0.04, vol: vol * 0.7 });
  return tone(ctx, out, t, { wave: 'sawtooth', freq: f, dur, a: 0.003, d: 0.08, s: 0.7, r: 0.03, vol: vol * 0.55, cutoff, cutoffEnd, cutoffTime: dur, q, unison: 2, spread: 6 });
}

/** Tuba: rounded, breathy low brass (oom-pah). */
export function tuba(ctx, out, t, { midi, dur = 0.3, vol = 0.34 }) {
  const f = mtof(midi);
  tone(ctx, out, t, { wave: 'sine', freq: f, dur, a: 0.012, d: 0.05, s: 0.9, r: 0.05, vol: vol * 0.75 });
  return tone(ctx, out, t, { wave: 'sawtooth', freq: f, dur, a: 0.014, d: 0.08, s: 0.7, r: 0.05, vol: vol * 0.5, cutoff: 520, cutoffEnd: 380, cutoffTime: dur, q: 1.5 });
}

/** Plucked synth (arps, funk leads). */
export function pluck(ctx, out, t, { midi, dur = 0.15, vol = 0.16, cutoff = 4200, cutoffEnd = 700, q = 4, wave = 'square', pan = 0, detune = 0 }) {
  const f = mtof(midi);
  return tone(ctx, out, t, { wave, freq: f, dur, a: 0.002, d: 0.09, s: 0.25, r: 0.08, vol, cutoff, cutoffEnd, cutoffTime: 0.14, q, unison: 2, spread: 7, pan, detune });
}

/** Electric piano: FM-ish bell tine over a soft sine body. */
export function epiano(ctx, out, t, { midi, dur = 0.3, vol = 0.12, pan = 0 }) {
  const f = mtof(midi);
  tone(ctx, out, t, { wave: 'sine', freq: f, dur, a: 0.003, d: 0.4, s: 0.15, r: 0.25, vol, pan });
  tone(ctx, out, t, { wave: 'sine', freq: f * 4, dur: 0.01, a: 0.001, d: 0.06, s: 0, r: 0.06, vol: vol * 0.32, pan });
  return tone(ctx, out, t, { wave: 'triangle', freq: f * 2, dur, a: 0.003, d: 0.2, s: 0.1, r: 0.15, vol: vol * 0.3, pan });
}

/** Nylon-ish guitar pluck: triangle + filtered saw, quick decay. */
export function guitar(ctx, out, t, { midi, dur = 0.3, vol = 0.12, pan = 0 }) {
  const f = mtof(midi);
  tone(ctx, out, t, { wave: 'triangle', freq: f, dur: 0.01, a: 0.002, d: 0.3, s: 0, r: 0.25, vol, pan });
  return tone(ctx, out, t, { wave: 'sawtooth', freq: f, dur: 0.01, a: 0.002, d: 0.14, s: 0, r: 0.12, vol: vol * 0.5, cutoff: 2600, cutoffEnd: 600, cutoffTime: 0.16, q: 1.2, pan });
}

/** Strummed chord: notes staggered by `spread` seconds, low to high (or reverse for upstrokes). */
export function strum(ctx, out, t, { notes, vol = 0.09, spread = 0.012, up = false, dur = 0.3, pan = 0, voice = guitar }) {
  const list = up ? [...notes].reverse() : notes;
  let end = t;
  list.forEach((m, i) => { end = Math.max(end, voice(ctx, out, t + i * spread, { midi: m, dur, vol: vol * (0.85 + 0.15 * (i / list.length)), pan })); });
  return end;
}

/** Detuned-saw pad; slow attack, filter opening with the note. */
export function pad(ctx, out, t, { notes, dur = 2, vol = 0.05, cutoff = 1400, cutoffEnd = 2400, attack = 0.25, release = 0.5, unison = 3, spread = 12, wave = 'sawtooth' }) {
  let end = t;
  for (const m of notes) end = Math.max(end, tone(ctx, out, t, { wave, freq: mtof(m), dur, a: attack, d: 0.4, s: 0.85, r: release, vol, cutoff, cutoffEnd, cutoffTime: dur, q: 0.6, unison, spread }));
  return end;
}

/** Brass section note: 3 unison saws, filter swell on attack, gentle late vibrato. */
export function brass(ctx, out, t, { midi, dur = 0.4, vol = 0.09, attack = 0.03, cutoff = 2800, pan = 0 }) {
  return tone(ctx, out, t, { wave: 'sawtooth', freq: mtof(midi), dur, a: attack, d: 0.12, s: 0.8, r: 0.1, vol, cutoff, cutoffEnd: cutoff * 0.45, cutoffTime: dur, q: 1.1, unison: 3, spread: 9, vibrato: 14, vibRate: 5.2, vibDelay: 0.25, pan });
}

/** Flute-like lead: sine + a little triangle octave, breath noise on the attack, delayed vibrato. */
export function flute(ctx, out, t, { midi, dur = 0.3, vol = 0.14, pan = 0 }) {
  const f = mtof(midi);
  burst(ctx, out, t, { dur: 0.06, vol: vol * 0.35, type: 'bandpass', freq: f * 3, q: 3, a: 0.004, pan });
  tone(ctx, out, t, { wave: 'triangle', freq: f * 2, dur, a: 0.03, d: 0.1, s: 0.3, r: 0.08, vol: vol * 0.16, pan });
  return tone(ctx, out, t, { wave: 'sine', freq: f, dur, a: 0.025, d: 0.08, s: 0.9, r: 0.1, vol, vibrato: 18, vibRate: 5.4, vibDelay: 0.18, pan });
}

/** Big detuned lead (synthwave / trance). */
export function superSaw(ctx, out, t, { midi, dur = 0.3, vol = 0.09, cutoff = 4200, cutoffEnd = 1800, unison = 5, spread = 22, attack = 0.006, release = 0.12, pan = 0 }) {
  return tone(ctx, out, t, { wave: 'sawtooth', freq: mtof(midi), dur, a: attack, d: 0.12, s: 0.75, r: release, vol, cutoff, cutoffEnd, cutoffTime: Math.max(dur, 0.2), q: 0.8, unison, spread, pan });
}

/** Choir-ish "ooh": stacked triangle + sine with slow vibrato. */
export function choir(ctx, out, t, { notes, dur = 2, vol = 0.04, attack = 0.4, release = 0.7 }) {
  let end = t;
  for (const m of notes) {
    end = Math.max(end, tone(ctx, out, t, { wave: 'triangle', freq: mtof(m), dur, a: attack, d: 0.3, s: 0.85, r: release, vol, cutoff: 1800, q: 0.5, unison: 3, spread: 14, vibrato: 10, vibRate: 4.6, vibDelay: 0.5 }));
  }
  return end;
}

/** Noise riser (build-ups): band-pass sweeping upwards with rising level. */
export function riser(ctx, out, t, { dur = 4, vol = 0.16, from = 300, to = 9000 }) {
  return burst(ctx, out, t, { dur, vol, type: 'bandpass', freq: from, freqEnd: to, q: 1.4, a: dur * 0.85, d: dur * 0.1, s: 0.9, r: 0.05 });
}

/** Reverse-cymbal-ish swell into a downbeat. */
export function swell(ctx, out, t, { dur = 1.2, vol = 0.14 }) {
  return burst(ctx, out, t, { dur, vol, type: 'highpass', freq: 3000, freqEnd: 9000, q: 0.7, a: dur * 0.9, d: dur * 0.05, s: 0.9, r: 0.03 });
}
