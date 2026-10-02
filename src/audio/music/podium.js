// PODIUM: triumphant fanfare. 96 bpm, D major. 4-bar brass fanfare with timpani (~10 s), then a 16-bar heroic march loop (~40 s):
// brass tune, string pad, choir, glockenspiel sparkle, timpani on 1 and 3, marching snare.
import { kick, snare, timpani, crash, bell, hat } from '../synth.js';
import { bass, brass, pad, choir } from '../instruments.js';
import { pattern, melodyTable, bassNote, human } from './common.js';
import { voicing } from './sequencer.js';

const PROG = [['D3', 'maj'], ['A2', 'maj'], ['B2', 'min'], ['F#3', 'min'], ['G2', 'maj'], ['D3', 'maj'], ['G2', 'maj'], ['A2', 'maj'],
  ['D3', 'maj'], ['A2', 'maj'], ['B2', 'min'], ['F#3', 'min'], ['G2', 'maj'], ['D3', 'maj'], ['A2', 'maj'], ['A2', 'dom7']];
const TUNE = melodyTable([
  'A4:4 D5:4 F#5:4 A5:4', 'E5:4 A5:4 C#6:4 E6:4', 'D6:6 C#6:2 D6:4 F#6:4', 'C#6:6 B5:2 A5:4 C#6:4',
  'B5:4 D6:4 G6:4 F#6:4', 'F#5:4 A5:4 D6:4 F#6:4', 'G5:4 B5:4 D6:4 B5:4', 'E6:6 D6:2 C#6:4 E6:4',
  'F#6:8 D6:4 A5:4', 'E6:8 C#6:4 A5:4', 'D6:6 F#6:2 D6:4 B5:4', 'C#6:6 A5:2 C#6:4 F#6:4',
  'B5:4 D6:4 G6:8', 'F#6:6 E6:2 D6:8', 'E6:4 C#6:4 A5:8', 'A5:8 E6:4 C#6:4',
]);
const FANFARE = melodyTable([
  'D5:3 D5:1 D5:2 F#5:2 A5:8', 'G5:3 G5:1 G5:2 B5:2 D6:8', 'A5:2 A5:2 B5:2 C#6:2 D6:4 E6:4', 'F#6:12 .:4',
]);
const MARCH = pattern('x... .... x... ....');

export default {
  key: 'podium', bpm: 96, swing: 0, introBars: 4, loopBars: 16,
  introProg: [{ root: 'D3', q: 'maj' }, { root: 'G2', q: 'maj' }, { root: 'A2', q: 'maj' }, { root: 'D3', q: 'maj' }],
  prog: PROG.map(([root, q]) => ({ root, q })),
  rig: { reverb: { seconds: 3.2, decay: 2.0, wet: 0.9, send: 0.26 }, delay: { beats: 0.75, feedback: 0.2, wet: 0.25 }, levels: { drums: 0.76, bass: 0.33, pad: 1.5, lead: 1.5, keys: 1.0, arp: 1.0, fx: 1.0 } },

  step(ctx, rig, s) {
    const { t, dur, step, chord, rng } = s;
    if (s.intro) {
      const n = FANFARE[s.bar][step];
      if (n) {
        const len = n.dur * dur * 0.95;
        [0, -12, -7, -16].forEach((off, i) => brass(ctx, rig.lead, t, { midi: n.midi + off, dur: len, vol: i === 0 ? 0.1 : 0.05, cutoff: 3200, attack: 0.02 }));
      }
      if (step % 4 === 0 && s.bar < 3) timpani(ctx, rig.drums, t, { vol: 0.45 + (step === 0 ? 0.15 : 0), freq: 73.4 });
      if (s.bar === 3 && step === 0) { timpani(ctx, rig.drums, t, { vol: 0.7, freq: 73.4, decay: 1.6 }); crash(ctx, rig.drums, t, { vol: 0.3, decay: 2.4 }); }
      if (s.bar === 2 && step >= 8) snare(ctx, rig.drums, t, { vol: 0.08 + (step - 8) * 0.03, decay: 0.09 });
      if (s.chordStart) {
        pad(ctx, rig.pad, t, { notes: voicing(chord.notes, 50, 74), dur: s.barSeconds + 0.3, vol: 0.03, cutoff: 1600, cutoffEnd: 2600, attack: 0.15, unison: 4 });
        bass(ctx, rig.bass, t, { midi: bassNote(chord.root, 33), dur: s.barSeconds * 0.9, vol: 0.3, cutoff: 700, cutoffEnd: 300 });
      }
      return;
    }
    const barInSec = s.loopBar % 8;
    // ---- rhythm: timpani on 1 and 3, kick support, marching snare, hats in the second half ----
    if (MARCH[step]) { timpani(ctx, rig.drums, t, { vol: 0.42 * human(rng), freq: bassNote(chord.root, 38) >= 45 ? 73.4 : 55, decay: 0.7 }); kick(ctx, rig.drums, t, { vol: 0.26, pitch: 50 }); }
    if (step === 4 || step === 12) snare(ctx, rig.drums, t, { vol: 0.28, tone: 210 });
    if ((step === 7 || step === 15 || step === 3 || step === 11) && s.loopBar >= 8) snare(ctx, rig.drums, t, { vol: 0.09, decay: 0.07 });
    if (s.loopBar >= 8 && step % 2 === 0) hat(ctx, rig.drums, t, { vol: 0.05, freq: 8400 });
    if (barInSec === 7 && step >= 10) snare(ctx, rig.drums, t, { vol: 0.07 + (step - 10) * 0.04, decay: 0.08 });
    if (step === 0 && s.loopBar % 8 === 0) crash(ctx, rig.drums, t, { vol: 0.2, decay: 2 });

    // ---- bass pedal + strings + choir ----
    if (step === 0 || step === 8) bass(ctx, rig.bass, t, { midi: bassNote(chord.root, 33) + (step === 8 ? 7 : 0), dur: dur * 6, vol: 0.3, cutoff: 800, cutoffEnd: 320 });
    if (s.chordStart) {
      pad(ctx, rig.pad, t, { notes: voicing(chord.notes, 52, 79), dur: s.chordBars * s.barSeconds + 0.3, vol: 0.026, cutoff: 1700, cutoffEnd: 2800, attack: 0.35, unison: 4, spread: 15 });
      if (s.loopBar >= 4) choir(ctx, rig.pad, t, { notes: voicing(chord.notes, 62, 81).slice(-3), dur: s.chordBars * s.barSeconds, vol: 0.02, attack: 0.5 });
    }
    // ---- heroic tune ----
    const n = TUNE[s.loopBar][step];
    if (n) {
      const len = n.dur * dur * 0.96;
      brass(ctx, rig.lead, t, { midi: n.midi, dur: len, vol: 0.09 * human(rng, 0.04), cutoff: 3200 });
      brass(ctx, rig.lead, t, { midi: n.midi - 12, dur: len, vol: 0.045, cutoff: 2200 });
      if (s.loopBar >= 8) brass(ctx, rig.lead, t, { midi: n.midi - 5, dur: len, vol: 0.04, cutoff: 2400, pan: 0.2 });
      if (s.loopBar >= 8 && n.dur >= 4) bell(ctx, rig.lead, t, { vol: 0.045, freq: 880 * Math.pow(2, (n.midi - 69) / 12), decay: 0.6, ratio: 2.005 });
    }
    // glockenspiel sparkle in the second half
    if (s.loopBar >= 8 && step % 4 === 2) {
      const v = voicing(chord.notes, 81, 96);
      bell(ctx, rig.lead, t, { vol: 0.03, freq: 440 * Math.pow(2, (v[(step / 4) % v.length | 0] - 69) / 12), decay: 0.3, ratio: 2.005 });
    }
  },
};
