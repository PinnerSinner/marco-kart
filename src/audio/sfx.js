// Synthesised sound effects. Each definition renders one sound into `out` starting at time `t`
// and returns nothing: `dur` (seconds, upper bound incl. tail) is declared next to it so callers can schedule loops
// and the offline verifier knows how long to render.  Options: pitch (multiplier, default 1), vol (multiplier, default 1).
// Every sound is designed to peak below about 0.6 before the master bus.
import { mtof, tone, burst, kick, drum, hat, bell, noteToMidi } from './synth.js';
import { installItemSfx } from './sfx_items.js';

/** @type {Record<string, {dur:number, loop?:boolean, gap?:number, play:(ctx:BaseAudioContext, out:AudioNode, t:number, o:{pitch:number, vol:number})=>void}>} */
export const SFX = {};

/** @param {string} name @param {number} dur @param {Function} play @param {{loop?:boolean, gap?:number}} [extra] gap = min seconds between plays */
function def(name, dur, play, extra = {}) { SFX[name] = { dur, play, ...extra }; }
const note = (n) => mtof(noteToMidi(n));

// ---- UI --------------------------------------------------------------------------------------------------------------------

def('ui-hover', 0.09, (c, out, t, o) => {
  tone(c, out, t, { wave: 'sine', freq: 1900 * o.pitch, dur: 0.02, a: 0.002, d: 0.03, s: 0, r: 0.04, vol: 0.16 * o.vol });
}, { gap: 0.03 });

def('ui-click', 0.16, (c, out, t, o) => {
  tone(c, out, t, { wave: 'square', freq: 1500 * o.pitch, glideFrom: 900 * o.pitch, glideTime: 0.03, dur: 0.02, a: 0.001, s: 0, r: 0.06, vol: 0.13 * o.vol, cutoff: 5000 });
  burst(c, out, t, { dur: 0.02, vol: 0.12 * o.vol, type: 'highpass', freq: 3500, a: 0.0008 });
}, { gap: 0.03 });

def('ui-back', 0.24, (c, out, t, o) => {
  tone(c, out, t, { wave: 'triangle', freq: 640 * o.pitch, dur: 0.05, a: 0.002, s: 0, r: 0.08, vol: 0.2 * o.vol });
  tone(c, out, t + 0.07, { wave: 'triangle', freq: 420 * o.pitch, dur: 0.05, a: 0.002, s: 0, r: 0.1, vol: 0.2 * o.vol });
}, { gap: 0.05 });

def('ui-confirm', 0.55, (c, out, t, o) => {
  [note('C6'), note('E6'), note('G6')].forEach((f, i) => {
    tone(c, out, t + i * 0.055, { wave: 'triangle', freq: f * o.pitch, dur: 0.05, a: 0.002, s: 0, r: 0.22, vol: 0.2 * o.vol });
    tone(c, out, t + i * 0.055, { wave: 'sine', freq: f * 2 * o.pitch, dur: 0.03, a: 0.002, s: 0, r: 0.16, vol: 0.06 * o.vol });
  });
}, { gap: 0.08 });

def('ui-error', 0.42, (c, out, t, o) => {
  for (let i = 0; i < 2; i++) {
    tone(c, out, t + i * 0.13, { wave: 'square', freq: 155 * o.pitch, dur: 0.07, a: 0.002, s: 0.8, r: 0.05, vol: 0.2 * o.vol, cutoff: 900 });
    tone(c, out, t + i * 0.13, { wave: 'square', freq: 220 * o.pitch, dur: 0.07, a: 0.002, s: 0.8, r: 0.05, vol: 0.14 * o.vol, cutoff: 900 });
  }
}, { gap: 0.15 });

// ---- race start / items -----------------------------------------------------------------------------------------------------

def('countdown-tick', 0.5, (c, out, t, o) => {
  tone(c, out, t, { wave: 'triangle', freq: 660 * o.pitch, dur: 0.16, a: 0.003, d: 0.1, s: 0.5, r: 0.14, vol: 0.34 * o.vol });
  tone(c, out, t, { wave: 'sine', freq: 1320 * o.pitch, dur: 0.1, a: 0.003, s: 0.3, r: 0.1, vol: 0.1 * o.vol });
}, { gap: 0.3 });

def('countdown-go', 1.1, (c, out, t, o) => {
  const f = 1320 * o.pitch;
  tone(c, out, t, { wave: 'sawtooth', freq: f, dur: 0.45, a: 0.004, d: 0.3, s: 0.5, r: 0.5, vol: 0.2 * o.vol, cutoff: 5200, unison: 3, spread: 8 });
  tone(c, out, t, { wave: 'triangle', freq: f / 2, dur: 0.5, a: 0.004, d: 0.3, s: 0.6, r: 0.5, vol: 0.26 * o.vol });
  tone(c, out, t, { wave: 'sine', freq: f * 1.5, dur: 0.4, a: 0.004, s: 0.4, r: 0.45, vol: 0.09 * o.vol });
  burst(c, out, t, { dur: 0.5, vol: 0.2 * o.vol, type: 'bandpass', freq: 500, freqEnd: 5000, q: 0.9, a: 0.02, d: 0.2, s: 0.2, r: 0.3 });
}, { gap: 0.4 });

def('roulette-tick', 0.1, (c, out, t, o) => {
  tone(c, out, t, { wave: 'square', freq: 1150 * o.pitch, dur: 0.008, a: 0.0006, s: 0, r: 0.03, vol: 0.14 * o.vol, cutoff: 3200 });
  burst(c, out, t, { dur: 0.012, vol: 0.13 * o.vol, type: 'bandpass', freq: 2600, q: 1.2, a: 0.0006 });
}, { gap: 0.03 });

def('item-get', 0.75, (c, out, t, o) => {
  [note('E5'), note('G5'), note('C6'), note('E6'), note('G6')].forEach((f, i) => {
    tone(c, out, t + i * 0.055, { wave: 'triangle', freq: f * o.pitch, dur: 0.06, a: 0.002, s: 0.2, r: 0.2, vol: 0.19 * o.vol });
    tone(c, out, t + i * 0.055, { wave: 'sine', freq: f * 3 * o.pitch, dur: 0.03, a: 0.002, s: 0, r: 0.12, vol: 0.05 * o.vol });
  });
  burst(c, out, t + 0.1, { dur: 0.35, vol: 0.05 * o.vol, type: 'highpass', freq: 6500, a: 0.05, d: 0.15, s: 0.2, r: 0.2 });
}, { gap: 0.1 });

def('item-use', 0.55, (c, out, t, o) => {
  burst(c, out, t, { dur: 0.3, vol: 0.32 * o.vol, type: 'bandpass', freq: 500 * o.pitch, freqEnd: 3800 * o.pitch, q: 1.2, a: 0.01, d: 0.12, s: 0.15, r: 0.2 });
  tone(c, out, t, { wave: 'sine', freq: 520 * o.pitch, glideFrom: 240 * o.pitch, glideTime: 0.09, dur: 0.05, a: 0.002, s: 0, r: 0.16, vol: 0.32 * o.vol });
  tone(c, out, t + 0.02, { wave: 'triangle', freq: 1040 * o.pitch, dur: 0.02, a: 0.002, s: 0, r: 0.14, vol: 0.12 * o.vol });
}, { gap: 0.06 });

def('item-hit', 0.95, (c, out, t, o) => {
  kick(c, out, t, { vol: 0.7 * o.vol, pitch: 42, punch: 180, decay: 0.4 });
  burst(c, out, t, { dur: 0.45, vol: 0.4 * o.vol, type: 'lowpass', freq: 3800, freqEnd: 300, q: 0.8, a: 0.002, d: 0.15, s: 0.2, r: 0.3 });
  tone(c, out, t + 0.02, { wave: 'sawtooth', freq: 180 * o.pitch, glideFrom: 1200 * o.pitch, glideTime: 0.3, dur: 0.15, a: 0.002, s: 0.4, r: 0.3, vol: 0.2 * o.vol, cutoff: 2400 });
  tone(c, out, t + 0.02, { wave: 'sine', freq: 90 * o.pitch, dur: 0.1, a: 0.004, s: 0.5, r: 0.5, vol: 0.32 * o.vol });
}, { gap: 0.05 });

def('item-block', 0.85, (c, out, t, o) => {
  bell(c, out, t, { vol: 0.34 * o.vol, freq: 880 * o.pitch, decay: 0.5, ratio: 2.76 });
  bell(c, out, t + 0.03, { vol: 0.22 * o.vol, freq: 1320 * o.pitch, decay: 0.45, ratio: 2.3 });
  burst(c, out, t, { dur: 0.25, vol: 0.22 * o.vol, type: 'bandpass', freq: 6000, q: 2, a: 0.002, d: 0.08, s: 0.2, r: 0.2 });
  tone(c, out, t, { wave: 'sine', freq: 1760 * o.pitch, dur: 0.2, a: 0.01, s: 0.5, r: 0.4, vol: 0.09 * o.vol, vibrato: 30, vibRate: 12, vibDelay: 0 });
}, { gap: 0.08 });

def('box-pickup', 0.8, (c, out, t, o) => {
  [note('C6'), note('G6'), note('E7')].forEach((f, i) => {
    bell(c, out, t + i * 0.04, { vol: 0.16 * o.vol, freq: f * o.pitch, decay: 0.4, ratio: 2.005 });
  });
  tone(c, out, t, { wave: 'sine', freq: 1600 * o.pitch, glideFrom: 500 * o.pitch, glideTime: 0.2, dur: 0.1, a: 0.005, s: 0.5, r: 0.2, vol: 0.14 * o.vol });
  burst(c, out, t + 0.02, { dur: 0.4, vol: 0.06 * o.vol, type: 'highpass', freq: 7000, a: 0.02, d: 0.15, s: 0.2, r: 0.25 });
}, { gap: 0.08 });

// ---- speed -----------------------------------------------------------------------------------------------------------------

def('boost', 1.2, (c, out, t, o) => {
  burst(c, out, t, { dur: 0.85, vol: 0.4 * o.vol, type: 'bandpass', freq: 300 * o.pitch, freqEnd: 3200 * o.pitch, q: 0.9, a: 0.05, d: 0.35, s: 0.4, r: 0.4 });
  tone(c, out, t, { wave: 'sawtooth', freq: 660 * o.pitch, glideFrom: 140 * o.pitch, glideTime: 0.6, dur: 0.6, a: 0.04, d: 0.3, s: 0.5, r: 0.35, vol: 0.14 * o.vol, cutoff: 1800, unison: 3, spread: 12 });
  tone(c, out, t, { wave: 'sine', freq: 90 * o.pitch, dur: 0.15, a: 0.005, s: 0.5, r: 0.4, vol: 0.32 * o.vol });
}, { gap: 0.12 });

def('pad-boost', 1.1, (c, out, t, o) => {
  tone(c, out, t, { wave: 'sawtooth', freq: 1300 * o.pitch, glideFrom: 200 * o.pitch, glideTime: 0.45, dur: 0.5, a: 0.01, d: 0.2, s: 0.6, r: 0.4, vol: 0.15 * o.vol, cutoff: 3600, cutoffEnd: 900, unison: 3, spread: 18, vibrato: 60, vibRate: 22, vibDelay: 0 });
  burst(c, out, t, { dur: 0.6, vol: 0.28 * o.vol, type: 'bandpass', freq: 1000 * o.pitch, freqEnd: 5000 * o.pitch, q: 1.6, a: 0.01, d: 0.2, s: 0.3, r: 0.35 });
  tone(c, out, t, { wave: 'square', freq: 110 * o.pitch, dur: 0.2, a: 0.004, s: 0.6, r: 0.3, vol: 0.2 * o.vol, cutoff: 400 });
  tone(c, out, t + 0.02, { wave: 'sine', freq: 2400 * o.pitch, glideFrom: 800 * o.pitch, glideTime: 0.3, dur: 0.15, a: 0.003, s: 0.3, r: 0.3, vol: 0.07 * o.vol });
}, { gap: 0.2 });

def('drift-spark', 0.22, (c, out, t, o) => {
  for (let i = 0; i < 4; i++) burst(c, out, t + i * 0.018, { dur: 0.03, vol: 0.09 * o.vol, type: 'highpass', freq: (4500 + i * 700) * o.pitch, q: 1, a: 0.0008 });
  tone(c, out, t, { wave: 'sine', freq: 2400 * o.pitch, glideFrom: 3600 * o.pitch, glideTime: 0.06, dur: 0.01, a: 0.001, s: 0, r: 0.08, vol: 0.05 * o.vol });
}, { gap: 0.08 });

def('drift-level', 0.5, (c, out, t, o) => {
  const f = 880 * o.pitch;
  tone(c, out, t, { wave: 'triangle', freq: f, dur: 0.04, a: 0.002, s: 0.3, r: 0.18, vol: 0.3 * o.vol });
  tone(c, out, t + 0.06, { wave: 'triangle', freq: f * 1.5, dur: 0.04, a: 0.002, s: 0.3, r: 0.22, vol: 0.3 * o.vol });
  tone(c, out, t, { wave: 'sine', freq: f * 3, dur: 0.02, a: 0.002, s: 0, r: 0.2, vol: 0.06 * o.vol });
  burst(c, out, t + 0.05, { dur: 0.15, vol: 0.06 * o.vol, type: 'highpass', freq: 6500, a: 0.01, d: 0.05, s: 0.3, r: 0.1 });
}, { gap: 0.1 });

def('mini-turbo', 0.95, (c, out, t, o) => {
  kick(c, out, t, { vol: 0.5 * o.vol, pitch: 55, punch: 200, decay: 0.2 });
  burst(c, out, t, { dur: 0.65, vol: 0.36 * o.vol, type: 'bandpass', freq: 700 * o.pitch, freqEnd: 4200 * o.pitch, q: 1.1, a: 0.01, d: 0.25, s: 0.4, r: 0.3 });
  tone(c, out, t, { wave: 'sawtooth', freq: 990 * o.pitch, glideFrom: 330 * o.pitch, glideTime: 0.28, dur: 0.3, a: 0.01, d: 0.15, s: 0.5, r: 0.3, vol: 0.14 * o.vol, cutoff: 2600, unison: 2, spread: 10 });
  tone(c, out, t, { wave: 'sine', freq: 2640 * o.pitch, glideFrom: 1320 * o.pitch, glideTime: 0.2, dur: 0.08, a: 0.002, s: 0.3, r: 0.25, vol: 0.06 * o.vol });
}, { gap: 0.12 });

// Perfect take-off (kart:perfect-jump): a bright rising three-note ping over a short whoosh. Not in REQUIRED_SFX (an extra).
def('perfect-jump', 0.9, (c, out, t, o) => {
  [note('G5'), note('D6'), note('G6')].forEach((f, i) => {
    tone(c, out, t + i * 0.045, { wave: 'triangle', freq: f * o.pitch, dur: 0.05, a: 0.002, s: 0.3, r: 0.22, vol: 0.22 * o.vol });
    tone(c, out, t + i * 0.045, { wave: 'sine', freq: f * 2 * o.pitch, dur: 0.03, a: 0.002, s: 0, r: 0.16, vol: 0.07 * o.vol });
  });
  burst(c, out, t, { dur: 0.5, vol: 0.3 * o.vol, type: 'bandpass', freq: 600 * o.pitch, freqEnd: 5200 * o.pitch, q: 1.2, a: 0.01, d: 0.18, s: 0.3, r: 0.3 });
  tone(c, out, t, { wave: 'sawtooth', freq: 880 * o.pitch, glideFrom: 300 * o.pitch, glideTime: 0.22, dur: 0.2, a: 0.008, d: 0.1, s: 0.4, r: 0.25, vol: 0.1 * o.vol, cutoff: 2800, unison: 2, spread: 10 });
  kick(c, out, t, { vol: 0.3 * o.vol, pitch: 60, punch: 180, decay: 0.14 });
}, { gap: 0.3 });

// ---- contact -----------------------------------------------------------------------------------------------------------------

def('wall-hit', 0.5, (c, out, t, o) => {
  tone(c, out, t, { wave: 'sine', freq: 55 * o.pitch, glideFrom: 130 * o.pitch, glideTime: 0.08, dur: 0.01, a: 0.001, s: 0, r: 0.28, vol: 0.55 * o.vol });
  burst(c, out, t, { dur: 0.22, vol: 0.4 * o.vol, type: 'lowpass', freq: 2400, freqEnd: 350, q: 0.8, a: 0.001, d: 0.1, s: 0.15, r: 0.15 });
  burst(c, out, t + 0.02, { dur: 0.15, vol: 0.14 * o.vol, type: 'bandpass', freq: 1200, q: 0.9, a: 0.004, d: 0.06, s: 0.3, r: 0.1 });
}, { gap: 0.12 });

def('bump', 0.4, (c, out, t, o) => {
  tone(c, out, t, { wave: 'triangle', freq: 120 * o.pitch, glideFrom: 300 * o.pitch, glideTime: 0.07, dur: 0.01, a: 0.001, s: 0, r: 0.16, vol: 0.5 * o.vol });
  tone(c, out, t, { wave: 'sine', freq: 62 * o.pitch, dur: 0.01, a: 0.001, s: 0, r: 0.2, vol: 0.4 * o.vol });
  burst(c, out, t, { dur: 0.06, vol: 0.14 * o.vol, type: 'bandpass', freq: 900, q: 1, a: 0.001 });
}, { gap: 0.1 });

def('land', 0.4, (c, out, t, o) => {
  tone(c, out, t, { wave: 'sine', freq: 48 * o.pitch, glideFrom: 110 * o.pitch, glideTime: 0.07, dur: 0.01, a: 0.001, s: 0, r: 0.22, vol: 0.5 * o.vol });
  burst(c, out, t, { dur: 0.16, vol: 0.2 * o.vol, type: 'lowpass', freq: 1800, freqEnd: 300, q: 0.7, a: 0.002, d: 0.06, s: 0.2, r: 0.12 });
}, { gap: 0.1 });

def('splash', 0.9, (c, out, t, o) => {
  burst(c, out, t, { dur: 0.6, vol: 0.34 * o.vol, type: 'bandpass', freq: 3200 * o.pitch, freqEnd: 900 * o.pitch, q: 0.7, a: 0.01, d: 0.2, s: 0.2, r: 0.4 });
  burst(c, out, t, { dur: 0.35, vol: 0.2 * o.vol, type: 'lowpass', freq: 900, q: 0.7, a: 0.01, d: 0.1, s: 0.3, r: 0.25 });
  for (let i = 0; i < 5; i++) tone(c, out, t + 0.04 + i * 0.05, { wave: 'sine', freq: (500 + i * 170) * o.pitch, glideFrom: (300 + i * 90) * o.pitch, glideTime: 0.05, dur: 0.02, a: 0.002, s: 0, r: 0.08, vol: 0.07 * o.vol });
}, { gap: 0.2 });

def('spin', 1.2, (c, out, t, o) => {
  tone(c, out, t, { wave: 'sawtooth', freq: 260 * o.pitch, glideFrom: 1100 * o.pitch, glideTime: 0.9, dur: 0.7, a: 0.01, d: 0.4, s: 0.6, r: 0.3, vol: 0.14 * o.vol, cutoff: 2200, vibrato: 120, vibRate: 9, vibDelay: 0 });
  burst(c, out, t, { dur: 0.9, vol: 0.2 * o.vol, type: 'bandpass', freq: 1500 * o.pitch, freqEnd: 900 * o.pitch, q: 5, a: 0.02, d: 0.4, s: 0.5, r: 0.3 });
  tone(c, out, t, { wave: 'sine', freq: 80 * o.pitch, dur: 0.05, a: 0.003, s: 0.4, r: 0.4, vol: 0.32 * o.vol });
}, { gap: 0.3 });

def('shrink', 0.9, (c, out, t, o) => {
  tone(c, out, t, { wave: 'square', freq: 170 * o.pitch, glideFrom: 1400 * o.pitch, glideTime: 0.45, dur: 0.4, a: 0.005, d: 0.2, s: 0.5, r: 0.25, vol: 0.16 * o.vol, cutoff: 3000 });
  tone(c, out, t + 0.02, { wave: 'sine', freq: 90 * o.pitch, glideFrom: 300 * o.pitch, glideTime: 0.3, dur: 0.3, a: 0.005, s: 0.5, r: 0.25, vol: 0.28 * o.vol });
  burst(c, out, t, { dur: 0.4, vol: 0.12 * o.vol, type: 'bandpass', freq: 4000, freqEnd: 500, q: 1.5, a: 0.005, d: 0.15, s: 0.3, r: 0.2 });
  tone(c, out, t + 0.5, { wave: 'triangle', freq: 320 * o.pitch, glideFrom: 200 * o.pitch, glideTime: 0.08, dur: 0.05, a: 0.003, s: 0.2, r: 0.2, vol: 0.2 * o.vol });
}, { gap: 0.3 });

def('respawn', 1.3, (c, out, t, o) => {
  [note('C5'), note('E5'), note('G5'), note('C6'), note('E6')].forEach((f, i) => {
    tone(c, out, t + i * 0.08, { wave: 'sine', freq: f * o.pitch, dur: 0.06, a: 0.01, d: 0.1, s: 0.4, r: 0.3, vol: 0.16 * o.vol });
    tone(c, out, t + i * 0.08, { wave: 'triangle', freq: f * 2 * o.pitch, dur: 0.03, a: 0.01, s: 0.2, r: 0.25, vol: 0.05 * o.vol });
  });
  burst(c, out, t, { dur: 0.7, vol: 0.2 * o.vol, type: 'bandpass', freq: 400 * o.pitch, freqEnd: 4200 * o.pitch, q: 1.4, a: 0.1, d: 0.3, s: 0.3, r: 0.35 });
  tone(c, out, t, { wave: 'sawtooth', freq: 150 * o.pitch, glideFrom: 60 * o.pitch, glideTime: 0.6, dur: 0.6, a: 0.1, d: 0.3, s: 0.5, r: 0.4, vol: 0.1 * o.vol, cutoff: 700 });
}, { gap: 0.5 });

def('fall', 1.4, (c, out, t, o) => {
  tone(c, out, t, { wave: 'sine', freq: 180 * o.pitch, glideFrom: 1500 * o.pitch, glideTime: 1.1, dur: 1.0, a: 0.02, d: 0.5, s: 0.6, r: 0.3, vol: 0.2 * o.vol, vibrato: 25, vibRate: 7, vibDelay: 0.2 });
  burst(c, out, t, { dur: 1.0, vol: 0.1 * o.vol, type: 'bandpass', freq: 2500, freqEnd: 300, q: 2.5, a: 0.05, d: 0.5, s: 0.4, r: 0.4 });
}, { gap: 0.6 });

// star-loop: one 1.2 s iteration of a shimmering invincibility arpeggio; the manager repeats it while active
def('star-loop', 1.2, (c, out, t, o) => {
  const seq = ['C6', 'E6', 'G6', 'C7', 'G6', 'E6', 'C6', 'E6'];
  seq.forEach((n, i) => {
    const tt = t + i * 0.15;
    tone(c, out, tt, { wave: 'triangle', freq: note(n) * o.pitch, dur: 0.06, a: 0.004, d: 0.1, s: 0.3, r: 0.16, vol: 0.09 * o.vol });
    tone(c, out, tt, { wave: 'sine', freq: note(n) * 2 * o.pitch, dur: 0.03, a: 0.004, s: 0, r: 0.12, vol: 0.03 * o.vol });
  });
  tone(c, out, t, { wave: 'sawtooth', freq: 110 * o.pitch, dur: 1.1, a: 0.1, s: 0.8, r: 0.1, vol: 0.05 * o.vol, cutoff: 500, vibrato: 30, vibRate: 6 });
}, { loop: true, gap: 0.5 });

// ---- race events --------------------------------------------------------------------------------------------------------------

def('lap-chime', 1.0, (c, out, t, o) => {
  bell(c, out, t, { vol: 0.24 * o.vol, freq: note('G5') * o.pitch, decay: 0.6, ratio: 2.005 });
  bell(c, out, t + 0.16, { vol: 0.24 * o.vol, freq: note('D6') * o.pitch, decay: 0.7, ratio: 2.005 });
  tone(c, out, t + 0.16, { wave: 'sine', freq: note('D7') * o.pitch, dur: 0.05, a: 0.003, s: 0.3, r: 0.4, vol: 0.05 * o.vol });
}, { gap: 0.3 });

def('final-lap', 1.6, (c, out, t, o) => {
  const stab = (tt, midiNotes, len) => midiNotes.forEach((m) => tone(c, out, tt, { wave: 'sawtooth', freq: mtof(m) * o.pitch, dur: len, a: 0.012, d: 0.1, s: 0.7, r: 0.15, vol: 0.09 * o.vol, cutoff: 900, cutoffEnd: 3200, cutoffTime: 0.12, q: 1.2, unison: 2, spread: 8 }));
  stab(t, [67, 71, 74], 0.16); stab(t + 0.2, [67, 71, 74], 0.16); stab(t + 0.4, [72, 76, 79], 0.6);
  tone(c, out, t + 0.4, { wave: 'triangle', freq: mtof(48) * o.pitch, dur: 0.55, a: 0.01, s: 0.7, r: 0.2, vol: 0.22 * o.vol });
  tone(c, out, t + 0.9, { wave: 'sine', freq: 1300 * o.pitch, glideFrom: 700 * o.pitch, glideTime: 0.4, dur: 0.1, a: 0.01, s: 0.5, r: 0.3, vol: 0.06 * o.vol });
  kick(c, out, t, { vol: 0.5 * o.vol }); kick(c, out, t + 0.2, { vol: 0.5 * o.vol }); kick(c, out, t + 0.4, { vol: 0.6 * o.vol });
}, { gap: 1.0 });

def('finish', 2.3, (c, out, t, o) => {
  const chord = (tt, notes, len, v) => notes.forEach((m) => tone(c, out, tt, { wave: 'sawtooth', freq: mtof(m) * o.pitch, dur: len, a: 0.015, d: 0.15, s: 0.75, r: 0.35, vol: v * o.vol, cutoff: 1100, cutoffEnd: 3600, cutoffTime: 0.15, q: 1, unison: 2, spread: 9 }));
  chord(t, [60, 64, 67], 0.16, 0.08); chord(t + 0.18, [62, 65, 69], 0.16, 0.08); chord(t + 0.36, [64, 67, 71, 76], 0.9, 0.08);
  tone(c, out, t + 0.36, { wave: 'triangle', freq: mtof(40) * o.pitch, dur: 0.9, a: 0.01, s: 0.7, r: 0.3, vol: 0.24 * o.vol });
  burst(c, out, t + 0.36, { dur: 1.4, vol: 0.06 * o.vol, type: 'bandpass', freq: 1800, q: 0.5, a: 0.2, d: 0.6, s: 0.4, r: 0.7 });
  bell(c, out, t + 0.36, { vol: 0.12 * o.vol, freq: note('E6') * o.pitch, decay: 1.0, ratio: 2.005 });
}, { gap: 1.0 });

def('overtake', 0.5, (c, out, t, o) => {
  burst(c, out, t, { dur: 0.22, vol: 0.28 * o.vol, type: 'bandpass', freq: 600 * o.pitch, freqEnd: 3800 * o.pitch, q: 1.5, a: 0.01, d: 0.08, s: 0.2, r: 0.14 });
  tone(c, out, t + 0.05, { wave: 'triangle', freq: 880 * o.pitch, dur: 0.05, a: 0.003, s: 0.3, r: 0.1, vol: 0.2 * o.vol });
  tone(c, out, t + 0.12, { wave: 'triangle', freq: 1320 * o.pitch, dur: 0.05, a: 0.003, s: 0.3, r: 0.18, vol: 0.2 * o.vol });
}, { gap: 0.3 });

def('win-fanfare', 3.2, (c, out, t, o) => {
  const P = o.pitch;
  const brass = (tt, midis, len, v = 0.075) => midis.forEach((m) => tone(c, out, tt, { wave: 'sawtooth', freq: mtof(m) * P, dur: len, a: 0.02, d: 0.15, s: 0.75, r: 0.3, vol: v * o.vol, cutoff: 900, cutoffEnd: 3400, cutoffTime: 0.14, q: 1.1, unison: 3, spread: 10, vibrato: 12, vibRate: 5.5, vibDelay: 0.3 }));
  brass(t, [67, 72, 76], 0.16); brass(t + 0.2, [67, 72, 76], 0.16); brass(t + 0.4, [67, 72, 76], 0.22); brass(t + 0.7, [69, 74, 77], 0.35); brass(t + 1.1, [72, 76, 79, 84], 1.5, 0.07);
  tone(c, out, t, { wave: 'triangle', freq: mtof(48) * P, dur: 0.6, a: 0.01, s: 0.8, r: 0.2, vol: 0.24 * o.vol });
  tone(c, out, t + 1.1, { wave: 'triangle', freq: mtof(36) * P, dur: 1.5, a: 0.01, s: 0.8, r: 0.5, vol: 0.28 * o.vol });
  for (let i = 0; i < 4; i++) drum(c, out, t + i * 0.2, { vol: 0.35 * o.vol, freq: 110, drop: 1.5, decay: 0.3 });
  drum(c, out, t + 1.1, { vol: 0.5 * o.vol, freq: 90, drop: 1.6, decay: 0.7 });
  for (let i = 0; i < 6; i++) hat(c, out, t + 1.1 + i * 0.05, { vol: 0.07 * o.vol, open: true });
  bell(c, out, t + 1.1, { vol: 0.12 * o.vol, freq: note('G6') * P, decay: 1.4, ratio: 2.005 });
}, { gap: 1.5 });

def('lose-sting', 2.0, (c, out, t, o) => {
  const P = o.pitch;
  [[57, 0], [55, 0.34], [53, 0.68]].forEach(([m, dt]) => {
    tone(c, out, t + dt, { wave: 'sawtooth', freq: mtof(m) * P, glideFrom: mtof(m) * 1.06 * P, glideTime: 0.08, dur: 0.28, a: 0.03, d: 0.15, s: 0.7, r: 0.15, vol: 0.14 * o.vol, cutoff: 700, cutoffEnd: 1500, cutoffTime: 0.18, q: 2, vibrato: 25, vibRate: 5, vibDelay: 0.1 });
    tone(c, out, t + dt, { wave: 'triangle', freq: mtof(m - 12) * P, dur: 0.28, a: 0.02, s: 0.7, r: 0.15, vol: 0.18 * o.vol });
  });
  tone(c, out, t + 1.02, { wave: 'sawtooth', freq: mtof(50) * P, glideFrom: mtof(53) * P, glideTime: 0.6, dur: 0.7, a: 0.04, d: 0.3, s: 0.6, r: 0.4, vol: 0.14 * o.vol, cutoff: 600, cutoffEnd: 300, cutoffTime: 0.8, q: 2, vibrato: 40, vibRate: 5.5, vibDelay: 0.15 });
  tone(c, out, t + 1.02, { wave: 'triangle', freq: mtof(38) * P, dur: 0.7, a: 0.02, s: 0.7, r: 0.4, vol: 0.22 * o.vol });
}, { gap: 1.0 });

def('explosion', 1.6, (c, out, t, o) => {
  kick(c, out, t, { vol: 0.85 * o.vol, pitch: 34, punch: 120, decay: 0.7 });
  burst(c, out, t, { dur: 1.2, vol: 0.5 * o.vol, type: 'lowpass', freq: 5000 * o.pitch, freqEnd: 120, q: 0.7, a: 0.002, d: 0.45, s: 0.25, r: 0.7 });
  burst(c, out, t, { dur: 0.5, vol: 0.28 * o.vol, type: 'highpass', freq: 2000, q: 0.6, a: 0.001, d: 0.1, s: 0.2, r: 0.3 });
  tone(c, out, t, { wave: 'sawtooth', freq: 40 * o.pitch, dur: 0.1, a: 0.002, s: 0.6, r: 0.9, vol: 0.32 * o.vol, cutoff: 300 });
  for (let i = 0; i < 6; i++) burst(c, out, t + 0.12 + i * 0.09, { dur: 0.05, vol: 0.12 * o.vol, type: 'bandpass', freq: 800 + i * 350, q: 1.4, a: 0.001 });
}, { gap: 0.1 });

def('pickup-coin', 0.6, (c, out, t, o) => {
  [note('D6'), note('A6'), note('D7')].forEach((f, i) => {
    tone(c, out, t + i * 0.07, { wave: 'triangle', freq: f * o.pitch, dur: 0.05, a: 0.002, s: 0.4, r: 0.22, vol: 0.2 * o.vol });
    tone(c, out, t + i * 0.07, { wave: 'sine', freq: f * 2 * o.pitch, dur: 0.03, a: 0.002, s: 0, r: 0.15, vol: 0.05 * o.vol });
  });
}, { gap: 0.05 });

// ---- Biscuit-only items and easter eggs ---------------------------------------------------------------------------------

/** One cartoon bark: a voiced saw through a sweeping "ah" filter that falls in pitch, with a breathy noise onset. */
function bark(c, out, t, { pitch = 1, vol = 1, f0 = 330, len = 0.17 } = {}) {
  tone(c, out, t, { wave: 'sawtooth', freq: f0 * 0.62 * pitch, glideFrom: f0 * pitch, glideTime: len * 0.9, dur: len, a: 0.008, d: 0.05, s: 0.55, r: 0.07, vol: 0.3 * vol, cutoff: 1900, cutoffEnd: 520, cutoffTime: len, q: 3.2, unison: 2, spread: 14 });
  tone(c, out, t, { wave: 'square', freq: f0 * 0.31 * pitch, glideFrom: f0 * 0.5 * pitch, glideTime: len, dur: len * 0.8, a: 0.006, s: 0.5, r: 0.06, vol: 0.12 * vol, cutoff: 700 });
  burst(c, out, t, { dur: len * 0.6, vol: 0.2 * vol, type: 'bandpass', freq: 1600, freqEnd: 700, q: 1.1, a: 0.002, d: 0.04, s: 0.2, r: 0.05 });
}

def('egg-woof', 0.5, (c, out, t, o) => { bark(c, out, t, { pitch: o.pitch, vol: o.vol, f0: 360, len: 0.16 }); bark(c, out, t + 0.2, { pitch: o.pitch * 1.06, vol: o.vol * 0.8, f0: 390, len: 0.15 }); }, { gap: 0.4 });

/** Mega Woof: a huge, deep bark with a sub thump and a rolling shockwave of noise. */
def('item-use-woof', 1.0, (c, out, t, o) => {
  kick(c, out, t, { vol: 0.6 * o.vol, pitch: 52, punch: 150, decay: 0.45 });
  bark(c, out, t, { pitch: 0.62 * o.pitch, vol: 1.35 * o.vol, f0: 330, len: 0.34 });
  bark(c, out, t + 0.02, { pitch: 0.5 * o.pitch, vol: 0.7 * o.vol, f0: 330, len: 0.4 });
  burst(c, out, t + 0.03, { dur: 0.6, vol: 0.28 * o.vol, type: 'bandpass', freq: 400, freqEnd: 3000, q: 0.8, a: 0.01, d: 0.2, s: 0.3, r: 0.3 });
}, { gap: 0.3 });
def('item-hit-woof', 0.5, (c, out, t, o) => {            // the victim's startled yelp: a rising squeak and a puff
  tone(c, out, t, { wave: 'triangle', freq: 1250 * o.pitch, glideFrom: 520 * o.pitch, glideTime: 0.12, dur: 0.12, a: 0.004, s: 0.4, r: 0.1, vol: 0.2 * o.vol, vibrato: 50, vibRate: 22, vibDelay: 0 });
  burst(c, out, t, { dur: 0.18, vol: 0.14 * o.vol, type: 'bandpass', freq: 1200, q: 1, a: 0.003, r: 0.08 });
}, { gap: 0.1 });

/** Steaming Gift: a wet, descending raspberry (a stack of detuned buzzing saws wobbling in pitch) and a "plop". */
function raspberry(c, out, t, o, len = 0.55, f0 = 150) {
  tone(c, out, t, { wave: 'sawtooth', freq: f0 * 0.6 * o.pitch, glideFrom: f0 * o.pitch, glideTime: len, dur: len, a: 0.02, d: 0.1, s: 0.7, r: 0.12, vol: 0.3 * o.vol, cutoff: 900, cutoffEnd: 420, cutoffTime: len, q: 4, vibrato: 190, vibRate: 31, vibDelay: 0, unison: 3, spread: 30 });
  burst(c, out, t, { dur: len, vol: 0.18 * o.vol, type: 'lowpass', freq: 1500, freqEnd: 300, q: 1.5, a: 0.01, d: 0.1, s: 0.5, r: 0.12 });
}
def('item-use-poo', 0.85, (c, out, t, o) => {
  raspberry(c, out, t, o, 0.5, 170);
  tone(c, out, t + 0.52, { wave: 'sine', freq: 130 * o.pitch, glideFrom: 360 * o.pitch, glideTime: 0.1, dur: 0.1, a: 0.002, s: 0, r: 0.12, vol: 0.34 * o.vol });     // plop
}, { gap: 0.2 });
def('item-hit-poo', 0.9, (c, out, t, o) => {
  tone(c, out, t, { wave: 'sine', freq: 110 * o.pitch, glideFrom: 320 * o.pitch, glideTime: 0.09, dur: 0.1, a: 0.002, s: 0, r: 0.14, vol: 0.42 * o.vol });
  raspberry(c, out, t + 0.05, { pitch: o.pitch * 0.9, vol: o.vol * 0.9 }, 0.55, 130);
  burst(c, out, t, { dur: 0.25, vol: 0.2 * o.vol, type: 'lowpass', freq: 1800, freqEnd: 250, q: 0.8, a: 0.002, d: 0.08, s: 0.3, r: 0.12 });
}, { gap: 0.1 });

def('item-use-zoomies', 1.05, (c, out, t, o) => {            // a panting "hah-hah-hah" with a rising whoosh and two yaps
  for (let i = 0; i < 5; i++) burst(c, out, t + i * 0.09, { dur: 0.06, vol: 0.2 * o.vol, type: 'bandpass', freq: 2400 + (i % 2) * 400, q: 1.4, a: 0.004, r: 0.03 });
  burst(c, out, t, { dur: 0.7, vol: 0.28 * o.vol, type: 'bandpass', freq: 300 * o.pitch, freqEnd: 4200 * o.pitch, q: 0.9, a: 0.05, d: 0.25, s: 0.4, r: 0.25 });
  bark(c, out, t + 0.05, { pitch: 1.35 * o.pitch, vol: 0.6 * o.vol, f0: 420, len: 0.1 });
  bark(c, out, t + 0.2, { pitch: 1.5 * o.pitch, vol: 0.6 * o.vol, f0: 420, len: 0.1 });
}, { gap: 0.3 });

def('item-use-fetch', 0.6, (c, out, t, o) => {              // a throw: whoosh, then an eager yap
  burst(c, out, t, { dur: 0.3, vol: 0.28 * o.vol, type: 'bandpass', freq: 600 * o.pitch, freqEnd: 3200 * o.pitch, q: 1.2, a: 0.01, d: 0.1, s: 0.2, r: 0.15 });
  bark(c, out, t + 0.12, { pitch: 1.4 * o.pitch, vol: 0.55 * o.vol, f0: 400, len: 0.09 });
}, { gap: 0.1 });
def('item-hit-fetch', 0.6, (c, out, t, o) => {              // a bonk: wooden knock and a boing
  tone(c, out, t, { wave: 'triangle', freq: 220 * o.pitch, glideFrom: 520 * o.pitch, glideTime: 0.05, dur: 0.06, a: 0.002, s: 0, r: 0.1, vol: 0.4 * o.vol });
  tone(c, out, t + 0.04, { wave: 'sine', freq: 300 * o.pitch, glideFrom: 160 * o.pitch, glideTime: 0.25, dur: 0.25, a: 0.004, s: 0.3, r: 0.2, vol: 0.2 * o.vol, vibrato: 90, vibRate: 14, vibDelay: 0 });
}, { gap: 0.1 });
def('item-catch', 0.5, (c, out, t, o) => {                   // caught it: happy double yap and a sparkle
  burst(c, out, t, { dur: 0.03, vol: 0.45 * o.vol, type: 'bandpass', freq: 1500, q: 2, a: 0.0006 });          // the snap of the stick between her teeth
  tone(c, out, t, { wave: 'triangle', freq: 260 * o.pitch, glideFrom: 600 * o.pitch, glideTime: 0.03, dur: 0.01, a: 0.0006, d: 0.06, s: 0, r: 0.05, vol: 0.35 * o.vol });
  bark(c, out, t + 0.04, { pitch: 1.5 * o.pitch, vol: 0.5 * o.vol, f0: 430, len: 0.09 });
  [note('G6'), note('C7')].forEach((f, i) => bell(c, out, t + 0.12 + i * 0.07, { vol: 0.14 * o.vol, freq: f * o.pitch, decay: 0.25, ratio: 2.005 }));
}, { gap: 0.1 });

def('egg-splash', 0.9, (c, out, t, o) => {                   // hydrant: a spurt of water
  burst(c, out, t, { dur: 0.7, vol: 0.3 * o.vol, type: 'highpass', freq: 1800, freqEnd: 5200, q: 0.7, a: 0.02, d: 0.2, s: 0.5, r: 0.3 });
  burst(c, out, t, { dur: 0.5, vol: 0.2 * o.vol, type: 'bandpass', freq: 900, freqEnd: 2200, q: 1.2, a: 0.01, d: 0.2, s: 0.3, r: 0.25 });
  for (let i = 0; i < 5; i++) tone(c, out, t + 0.1 + i * 0.06, { wave: 'sine', freq: (700 + i * 130) * o.pitch, glideFrom: 400 * o.pitch, glideTime: 0.05, dur: 0.03, a: 0.002, s: 0, r: 0.05, vol: 0.1 * o.vol });
}, { gap: 0.4 });

/** A synthesised silly fanfare (our own tune, no borrowed melody): slide whistle up, a kazoo-ish march, a bike horn and two proud barks. */
def('egg-fanfare', 2.6, (c, out, t, o) => {
  const P = o.pitch;
  tone(c, out, t, { wave: 'sine', freq: 1900 * P, glideFrom: 350 * P, glideTime: 0.42, dur: 0.46, a: 0.02, s: 0.8, r: 0.06, vol: 0.2 * o.vol, vibrato: 35, vibRate: 7, vibDelay: 0.1 });
  const kazoo = (tt, midi, len) => {
    tone(c, out, tt, { wave: 'sawtooth', freq: mtof(midi) * P, dur: len, a: 0.01, d: 0.05, s: 0.8, r: 0.05, vol: 0.12 * o.vol, cutoff: 2600, q: 5, vibrato: 28, vibRate: 6, vibDelay: 0.05, unison: 2, spread: 20 });
    tone(c, out, tt, { wave: 'square', freq: mtof(midi) * 0.5 * P, dur: len, a: 0.01, s: 0.6, r: 0.04, vol: 0.06 * o.vol, cutoff: 900 });
  };
  const m = [[72, 0.0, 0.12], [72, 0.15, 0.12], [79, 0.3, 0.2], [76, 0.55, 0.12], [79, 0.7, 0.12], [84, 0.85, 0.5]];
  m.forEach(([n, d, l]) => kazoo(t + 0.5 + d, n, l));
  for (let i = 0; i < 6; i++) drum(c, out, t + 0.5 + i * 0.15, { vol: 0.2 * o.vol, freq: 150, drop: 1.4, decay: 0.12 });
  tone(c, out, t + 1.5, { wave: 'square', freq: 392 * P, dur: 0.14, a: 0.005, s: 0.9, r: 0.03, vol: 0.14 * o.vol, cutoff: 2200 });           // bike horn: two notes a fourth apart
  tone(c, out, t + 1.5, { wave: 'square', freq: 523 * P, dur: 0.14, a: 0.005, s: 0.9, r: 0.03, vol: 0.12 * o.vol, cutoff: 2200 });
  tone(c, out, t + 1.7, { wave: 'square', freq: 392 * P, dur: 0.3, a: 0.005, s: 0.9, r: 0.08, vol: 0.14 * o.vol, cutoff: 2200 });
  tone(c, out, t + 1.7, { wave: 'square', freq: 523 * P, dur: 0.3, a: 0.005, s: 0.9, r: 0.08, vol: 0.12 * o.vol, cutoff: 2200 });
  bark(c, out, t + 2.05, { pitch: P, vol: 0.9 * o.vol, f0: 360, len: 0.16 });
  bark(c, out, t + 2.3, { pitch: 1.12 * P, vol: 0.9 * o.vol, f0: 380, len: 0.2 });
  bell(c, out, t + 0.5 + 0.85, { vol: 0.1 * o.vol, freq: note('C7') * P, decay: 0.8, ratio: 2.005 });
}, { gap: 1.5 });

// every item's own sounds (use / hit / end), the item-slot sounds, and the loudness trim of Biscuit's items above
installItemSfx(SFX, def);

/** Names of every required SFX (SPEC section 4). */
export const REQUIRED_SFX = [
  'ui-hover', 'ui-click', 'ui-back', 'ui-confirm', 'ui-error', 'countdown-tick', 'countdown-go', 'roulette-tick', 'item-get', 'item-use',
  'item-hit', 'item-block', 'box-pickup', 'boost', 'pad-boost', 'drift-spark', 'drift-level', 'mini-turbo', 'wall-hit', 'bump', 'land',
  'splash', 'spin', 'shrink', 'respawn', 'star-loop', 'lap-chime', 'final-lap', 'finish', 'overtake', 'win-fanfare', 'lose-sting',
  'explosion', 'pickup-coin',
];
