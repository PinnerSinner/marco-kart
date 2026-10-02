// Helpers shared by the song definitions: pattern strings, melody tables, bass-note folding.
import { parseMelody } from '../synth.js';
import { STEPS_PER_BAR } from './sequencer.js';

/** 'x..x' -> Set-like boolean array of 16 steps (any non-'.' and non-space char is a hit; digits give velocity 1..9). */
export function pattern(str) {
  const out = new Array(STEPS_PER_BAR).fill(0);
  const chars = str.replace(/[\s|]/g, '');
  if (chars.length !== STEPS_PER_BAR) throw new Error(`pattern "${str}" has ${chars.length} steps, expected ${STEPS_PER_BAR}`);
  for (let i = 0; i < STEPS_PER_BAR; i++) {
    const c = chars[i];
    if (c === '.' || c === '-') continue;
    out[i] = /[1-9]/.test(c) ? Number(c) / 9 : 1;
  }
  return out;
}

/**
 * Melody table from one string per bar. Every bar must add up to exactly 16 steps.
 * @param {string[]} bars melody strings (see synth.parseMelody) @returns {Array<Array<{midi:number, dur:number}|null>>} [bar][step]
 */
export function melodyTable(bars) {
  return bars.map((str, i) => {
    const { notes, steps } = parseMelody(str);
    if (steps !== STEPS_PER_BAR) throw new Error(`melody bar ${i + 1} "${str}" is ${steps} steps, expected ${STEPS_PER_BAR}`);
    const row = new Array(STEPS_PER_BAR).fill(null);
    for (const n of notes) row[n.step] = { midi: n.midi, dur: n.dur };
    return row;
  });
}

/** Fold a MIDI root into [lo, lo+12) for bass lines. */
export function bassNote(midi, lo = 36) {
  let m = midi;
  while (m < lo) m += 12;
  while (m >= lo + 12) m -= 12;
  return m;
}

/** Deterministic velocity humanisation: 1 +- amount. */
export const human = (rng, amount = 0.08) => 1 + (rng() * 2 - 1) * amount;

/** true on every n-th bar boundary within a loop (e.g. section starts). */
export const sectionStart = (s, everyBars = 8) => s.step === 0 && s.loopBar >= 0 && s.loopBar % everyBars === 0;

/** Bar index within its 8-bar section (0..7); -1 in an intro. */
export const barInSection = (s) => (s.loopBar < 0 ? -1 : s.loopBar % 8);
