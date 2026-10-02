// MENU: upbeat funk-pop. 108 bpm, light 16th swing, C major. 2-bar intro + 32-bar loop (4 x 8-bar sections) = ~72 s.
//   section 0 groove (no lead) / 1 hook A / 2 breakdown: keys + pad + marimba answer / 3 hook doubled + full drums
import { kick, snare, hat, clap, crash, rim } from '../synth.js';
import { bass, pluck, epiano, strum, pad } from '../instruments.js';
import { pattern, melodyTable, bassNote, human } from './common.js';
import { voicing } from './sequencer.js';

const PROG8 = [
  { root: 'C3', q: 'maj9' }, { root: 'A2', q: 'min9' }, { root: 'D3', q: 'min9' }, { root: 'G2', q: 'dom13' },
  { root: 'E3', q: 'min7' }, { root: 'A2', q: 'min7' }, { root: 'D3', q: 'min9' }, { root: 'G2', q: 'dom7b13' },
];

const HOOK_A = melodyTable([
  'G5:3 E5:1 G5:2 A5:2 G5:4 E5:2 D5:2',
  'E5:3 C5:1 E5:2 G5:2 E5:4 D5:2 C5:2',
  'F5:3 D5:1 F5:2 A5:2 F5:4 E5:2 D5:2',
  'B5:3 G5:1 B5:2 D6:2 B5:2 A5:2 G5:4',
  'G5:3 E5:1 G5:2 B5:2 G5:4 D5:2 E5:2',
  'A5:3 E5:1 A5:2 C6:2 A5:4 G5:2 E5:2',
  'F5:2 A5:2 D6:4 C6:2 A5:2 F5:4',
  'B5:2 D6:2 G6:4 F6:2 D6:2 B5:2 G5:2',
]);

const KICK = pattern('x..x..x. ..x. ....');
const KICK_B = pattern('x..x..x. ..x. ..x.');
const SNARE = pattern('.... x... .... x...');
const GHOST = pattern('.... ...x .x.. ...x');
const HAT = pattern('9435 9435 9435 9435');
const KEYS = pattern('..x. .x.x ..x. .x..');
const BASS_A = [[0, 0, 3], [3, 0, 1], [6, 12, 1], [8, 7, 2], [10, 0, 2], [12, 10, 1], [14, 'app', 2]];
const BASS_B = [[0, 0, 2], [2, 12, 1], [4, 0, 2], [7, 7, 1], [8, 0, 3], [11, 10, 1], [12, 12, 1], [14, 'app', 2]];

export default {
  key: 'menu', bpm: 108, swing: 0.11, swingGrid: 1, introBars: 2, loopBars: 32,
  introProg: [{ root: 'C3', q: 'maj9' }, { root: 'G2', q: 'dom13' }],
  prog: [...PROG8, ...PROG8, ...PROG8, ...PROG8],
  rig: { reverb: { seconds: 1.8, wet: 0.7, send: 0.14 }, delay: { beats: 0.75, feedback: 0.33, wet: 0.5 }, levels: { drums: 0.437, bass: 0.33, pad: 1.26, lead: 1.2, keys: 1.25, arp: 1.0, fx: 1.0 } },

  step(ctx, rig, s) {
    const { t, dur, step, chord, section, rng } = s;
    const introBar = s.intro ? s.bar : -1;
    const barInSec = s.loopBar % 8;
    const lastBarOfSection = !s.intro && barInSec === 7;
    const kickPat = barInSec % 2 === 1 ? KICK_B : KICK;

    // ---- drums ----
    if (s.intro) {
      if (step % 4 === 0 && introBar === 1) kick(ctx, rig.drums, t, { vol: 0.5 });
      if (introBar === 1 && step >= 8) snare(ctx, rig.drums, t, { vol: 0.16 + (step - 8) * 0.03 });
      if (step % 2 === 0) hat(ctx, rig.drums, t, { vol: 0.09 * (step % 4 === 0 ? 1.4 : 0.7) });
      if (introBar === 0 && step === 0) crash(ctx, rig.drums, t, { vol: 0.14 });
    } else {
      const hv = HAT[step];
      if (kickPat[step] && !(section === 2 && barInSec < 2)) kick(ctx, rig.drums, t, { vol: 0.62 * human(rng) });
      if (SNARE[step]) { snare(ctx, rig.drums, t, { vol: 0.42 }); if (section >= 1) clap(ctx, rig.drums, t, { vol: 0.13 }); }
      if (GHOST[step] && section !== 2) snare(ctx, rig.drums, t, { vol: 0.09, decay: 0.08 });
      hat(ctx, rig.drums, t, { vol: 0.03 + hv * 0.1 * human(rng, 0.15), open: step === 14 && barInSec % 2 === 1 });
      if (lastBarOfSection && step >= 12) snare(ctx, rig.drums, t, { vol: 0.1 + (step - 12) * 0.07, decay: 0.1 });
      if (step === 0 && barInSec === 0 && s.loopBar > 0) crash(ctx, rig.drums, t, { vol: 0.2 });
    }

    // ---- bass ----
    const b = bassNote(chord.root, 36);
    const nextB = bassNote(s.next.root, 36);
    const line = s.intro ? BASS_A : (s.loopBar % 2 ? BASS_B : BASS_A);
    for (const [st, off, len] of line) {
      if (st !== step) continue;
      const midi = off === 'app' ? nextB + (nextB > b ? -1 : 1) : b + off;
      bass(ctx, rig.bass, t, { midi, dur: len * dur * 0.86, vol: 0.34 * human(rng, 0.06), cutoff: 1900, cutoffEnd: 300 });
    }

    // ---- keys comping (electric piano stabs) ----
    if (KEYS[step] && (s.intro ? introBar === 1 : true)) {
      const v = voicing(chord.notes, 60, 77);
      const top = v.length > 4 ? v.slice(-4) : v;
      top.forEach((m, i) => epiano(ctx, rig.keys, t + i * 0.006, { midi: m, dur: dur * 1.4, vol: (section === 2 ? 0.075 : 0.055) * human(rng), pan: (step % 4 === 2 ? -0.25 : 0.25) }));
    }
    // funky guitar chick on the off-beats (sections 1 and 3)
    if ((section === 1 || section === 3) && (step === 4 || step === 12 || step === 7 || step === 15)) {
      strum(ctx, rig.keys, t, { notes: voicing(chord.notes, 55, 70).slice(0, 4), vol: 0.05, spread: 0.007, up: step === 7 || step === 15, dur: dur * 0.7, pan: 0.35 });
    }

    // ---- pad ----
    if (s.chordStart && (section === 2 || section === 3 || s.intro)) {
      pad(ctx, rig.pad, t, { notes: voicing(chord.notes, 55, 74), dur: s.chordBars * s.barSeconds, vol: 0.026, cutoff: 1200, cutoffEnd: 2200, attack: 0.5 });
    }

    // ---- lead ----
    if (!s.intro && s.loopBar >= 0) {
      const row = HOOK_A[barInSec][step];
      if (row && section === 1) pluck(ctx, rig.lead, t, { midi: row.midi, dur: row.dur * dur * 0.9, vol: 0.12 * human(rng, 0.05) });
      if (row && section === 3) {
        pluck(ctx, rig.lead, t, { midi: row.midi, dur: row.dur * dur * 0.9, vol: 0.11 });
        pluck(ctx, rig.lead, t, { midi: row.midi + 12, dur: row.dur * dur * 0.7, vol: 0.05, cutoff: 6000, wave: 'sawtooth' });
        if (row.dur >= 4) pluck(ctx, rig.lead, t + dur * 0.5, { midi: row.midi - 5, dur: row.dur * dur * 0.6, vol: 0.05, cutoff: 3000 });
      }
      if (row && section === 2 && barInSec >= 4) epiano(ctx, rig.lead, t, { midi: row.midi + 12, dur: row.dur * dur, vol: 0.06 });
    }
    // intro flourish: rising arpeggio into the groove
    if (s.intro && introBar === 1 && step % 2 === 0 && step >= 4) {
      const scale = [60, 62, 64, 67, 69, 72, 74, 76];
      pluck(ctx, rig.lead, t, { midi: scale[(step - 4) / 2 % scale.length] + 12, dur: dur * 1.6, vol: 0.09 });
    }
  },
};
