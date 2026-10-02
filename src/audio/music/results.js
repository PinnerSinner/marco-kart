// RESULTS: short victory jingle (2-bar brass fanfare, ~5 s) that settles into a mellow celebratory loop (8 bars, ~19 s) so the
// results screen is never silent. 100 bpm, C major.
import { kick, snare, hat, timpani, crash, bell, rim } from '../synth.js';
import { bass, brass, epiano, pad, strum, pluck } from '../instruments.js';
import { pattern, melodyTable, bassNote, human } from './common.js';
import { voicing } from './sequencer.js';

const FANFARE = melodyTable(['G4:2 C5:2 E5:2 G5:6 E5:2 G5:2', 'G5:2 A5:2 B5:2 C6:10']);
const TUNE = melodyTable([
  'E5:4 G5:4 C6:4 B5:4', 'A5:4 C6:4 E6:4 C6:4', 'F5:4 A5:4 C6:4 E6:4', 'D6:4 B5:4 G5:4 F5:4',
  'E5:4 G5:4 C6:4 E6:4', 'E6:4 D6:4 C6:4 A5:4', 'D6:4 C6:4 A5:4 F5:4', 'G5:4 B5:4 D6:8',
]);
const KICK = pattern('x.....x. ..x.....'), SNARE = pattern('.... x... .... x...');

export default {
  key: 'results', bpm: 100, swing: 0.08, swingGrid: 1, introBars: 2, loopBars: 8,
  introProg: [{ root: 'C3', q: 'maj' }, { root: 'C3', q: 'maj' }],
  prog: [{ root: 'C3', q: 'maj7' }, { root: 'A2', q: 'min7' }, { root: 'F2', q: 'maj7' }, { root: 'G2', q: 'dom7' },
    { root: 'C3', q: 'maj7' }, { root: 'A2', q: 'min7' }, { root: 'D3', q: 'min7' }, { root: 'G2', q: 'dom7' }],
  rig: { reverb: { seconds: 2.0, wet: 0.8, send: 0.2 }, delay: { beats: 0.75, feedback: 0.3, wet: 0.4 }, levels: { drums: 0.54, bass: 0.3, pad: 1.08, lead: 1.8, keys: 1.9, arp: 1.0, fx: 1.0 } },

  step(ctx, rig, s) {
    const { t, dur, step, chord, rng } = s;
    if (s.intro) {
      const n = FANFARE[s.bar][step];
      if (n) {
        const len = n.dur * dur * 0.95;
        [0, -12, -5].forEach((off, i) => brass(ctx, rig.lead, t, { midi: n.midi + off, dur: len, vol: i === 0 ? 0.1 : 0.05, cutoff: 3000, attack: 0.02 }));
      }
      if (step === 0) { timpani(ctx, rig.drums, t, { vol: 0.5, freq: 98 }); crash(ctx, rig.drums, t, { vol: 0.22 }); bass(ctx, rig.bass, t, { midi: 36, dur: dur * 8, vol: 0.3 }); }
      if (s.bar === 1 && step === 0) { timpani(ctx, rig.drums, t, { vol: 0.6, freq: 98 }); bell(ctx, rig.drums, t, { vol: 0.1, freq: 1568, decay: 1.4, ratio: 2.005 }); }
      if (step % 4 === 0 && s.bar === 0) snare(ctx, rig.drums, t, { vol: 0.14 + (step / 4) * 0.04, decay: 0.09 });
      if (s.bar === 0 && step >= 8 && step % 2 === 0) snare(ctx, rig.drums, t, { vol: 0.12 + (step - 8) * 0.03, decay: 0.08 });
      return;
    }
    if (KICK[step]) kick(ctx, rig.drums, t, { vol: 0.5 * human(rng), pitch: 50 });
    if (SNARE[step]) { snare(ctx, rig.drums, t, { vol: 0.24 }); rim(ctx, rig.drums, t, { vol: 0.1 }); }
    if (step % 2 === 0) hat(ctx, rig.drums, t, { vol: 0.06 * (step % 4 === 0 ? 1.3 : 0.8) });
    const b = bassNote(chord.root, 36);
    if (step === 0) bass(ctx, rig.bass, t, { midi: b, dur: dur * 6, vol: 0.3, wave: 'triangle', cutoff: 1000, cutoffEnd: 300 });
    if (step === 6) bass(ctx, rig.bass, t, { midi: b + 7, dur: dur * 2, vol: 0.26, wave: 'triangle', cutoff: 1000, cutoffEnd: 300 });
    if (step === 10) bass(ctx, rig.bass, t, { midi: b + 12, dur: dur * 3, vol: 0.24, wave: 'triangle', cutoff: 1000, cutoffEnd: 300 });
    if (step === 0 || step === 6 || step === 10) {
      voicing(chord.notes, 60, 76).forEach((m, i) => epiano(ctx, rig.keys, t + i * 0.008, { midi: m, dur: dur * 3, vol: 0.05, pan: i % 2 ? 0.2 : -0.2 }));
    }
    if (s.chordStart) pad(ctx, rig.pad, t, { notes: voicing(chord.notes, 55, 74), dur: s.barSeconds + 0.2, vol: 0.02, cutoff: 1100, cutoffEnd: 1800, attack: 0.4, wave: 'triangle' });
    const n = TUNE[s.loopBar][step];
    if (n) { pluck(ctx, rig.lead, t, { midi: n.midi, dur: n.dur * dur * 0.9, vol: 0.09, wave: 'triangle', cutoff: 5000, cutoffEnd: 1500 }); bell(ctx, rig.lead, t, { vol: 0.04, freq: 2 * 440 * Math.pow(2, (n.midi - 69) / 12), decay: 0.4, ratio: 2.005 }); }
    if (step === 15 && s.loopBar % 2 === 1) strum(ctx, rig.keys, t, { notes: voicing(s.next.notes, 60, 72).slice(0, 3), vol: 0.04, dur: dur, spread: 0.01, up: true });
  },
};
