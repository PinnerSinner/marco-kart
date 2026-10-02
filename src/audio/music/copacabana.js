// COPACABANA: bossa / samba groove. 112 bpm straight 16ths, D major. 32-bar loop (~69 s).
//   nylon-guitar comping on the bossa clave, walking-ish bass, surdo + shaker + tamborim + agogo, flute hook.
//   section 0 groove / 1 flute hook / 2 marimba hook + pad / 3 flute with octave + full percussion
import { drum, shaker, rim, bell, hat, snare } from '../synth.js';
import { bass, flute, epiano, strum, pad, guitar } from '../instruments.js';
import { pattern, melodyTable, bassNote, human } from './common.js';
import { voicing } from './sequencer.js';

const PROG8 = [
  { root: 'D3', q: 'maj9' }, { root: 'B2', q: 'min9' }, { root: 'E3', q: 'min9' }, { root: 'A2', q: 'dom13' },
  { root: 'D3', q: 'maj9' }, { root: 'G2', q: 'maj9' }, { root: 'G2', q: 'min6' }, { root: 'A2', q: 'dom7b9' },
];

const HOOK = melodyTable([
  'F#5:3 A5:3 B5:2 A5:2 F#5:4 E5:2',
  'D5:3 F#5:3 A5:2 G5:2 F#5:4 D5:2',
  'G5:3 B5:3 D6:2 B5:2 A5:4 G5:2',
  'E5:2 G5:2 A5:2 C#6:4 B5:2 A5:2 G5:2',
  'A5:3 F#5:1 A5:2 D6:4 C#6:2 A5:4',
  'B5:3 D6:3 F#6:2 E6:2 D6:4 B5:2',
  'Bb5:3 D6:3 E6:2 D6:2 Bb5:4 G5:2',
  'E6:2 C#6:2 Bb5:3 A5:3 G5:2 E5:2 C#5:2',
]);

const CLAVE_A = pattern('x.....x. ....x...'), CLAVE_B = pattern('....x... x.......');
const COMP_A = pattern('..x...x. ..x..x..'), COMP_B = pattern('..x..x.. .x...x..');
const TAMBORIM = pattern('x.xx.x.x x.xx.x.x');
const SURDO_LOUD = pattern('....x... ....x...'), SURDO_SOFT = pattern('x....... x.......');
const AGOGO = [[0, 'hi'], [3, 'lo'], [6, 'hi'], [9, 'lo'], [12, 'hi']];

export default {
  key: 'copacabana', bpm: 112, swing: 0, introBars: 0, loopBars: 32,
  prog: [...PROG8, ...PROG8, ...PROG8, ...PROG8],
  rig: { reverb: { seconds: 2.0, wet: 0.75, send: 0.16 }, delay: { beats: 0.75, feedback: 0.3, wet: 0.45, leadSend: 0.16 }, levels: { drums: 0.712, bass: 0.27, pad: 1.35, lead: 0.6, keys: 1.9, arp: 1.0, fx: 1.0 } },

  step(ctx, rig, s) {
    const { t, dur, step, chord, section, rng } = s;
    const barInSec = s.loopBar % 8;
    const even = s.loopBar % 2 === 0;

    // ---- percussion ----
    if (SURDO_LOUD[step]) drum(ctx, rig.drums, t, { vol: 0.5 * human(rng, 0.05), freq: 66, drop: 1.5, decay: 0.32, noise: 0.05 });
    if (SURDO_SOFT[step]) drum(ctx, rig.drums, t, { vol: 0.2, freq: 62, drop: 1.4, decay: 0.16, noise: 0.03 });
    const accent = step % 4 === 0 ? 1 : step % 2 === 0 ? 0.7 : 0.45;
    shaker(ctx, rig.drums, t, { vol: 0.055 * accent * human(rng, 0.12), freq: 6800 + (step % 2) * 900, dur: 0.045 });
    if ((even ? CLAVE_A : CLAVE_B)[step]) rim(ctx, rig.drums, t, { vol: 0.24, freq: 1750 });
    if (TAMBORIM[step] && section >= 1) rim(ctx, rig.drums, t, { vol: 0.07 * human(rng, 0.2), freq: 2900 });
    if (section >= 1) for (const [st, kind] of AGOGO) if (st === step) bell(ctx, rig.drums, t, { vol: 0.05, freq: kind === 'hi' ? 820 : 610, decay: 0.12, ratio: 1.5 });
    if (section === 3 && step % 4 === 2) hat(ctx, rig.drums, t, { vol: 0.05, open: true });
    if (section === 3 && barInSec === 7 && step >= 12) snare(ctx, rig.drums, t, { vol: 0.09 + (step - 12) * 0.05, decay: 0.09 });
    // conga-ish accents
    if (section >= 2 && (step === 7 || step === 10 || step === 15)) drum(ctx, rig.drums, t, { vol: 0.1, freq: 320 + (step === 10 ? 60 : 0), drop: 1.25, decay: 0.09, noise: 0.15 });

    // ---- bass (root on 1 and 3, fifth on the "ands") ----
    const b = bassNote(chord.root, 38);
    const hits = [[0, 0, 5], [6, 7, 2], [8, 0, 5], [14, 7, 2]];
    for (const [st, off, len] of hits) {
      if (st !== step) continue;
      const approach = s.next.root % 12 === b % 12 ? b + 7 : bassNote(s.next.root, 38) + (bassNote(s.next.root, 38) > b ? -1 : 1);
      const midi = step === 14 && barInSec % 2 === 1 ? approach : b + off;
      bass(ctx, rig.bass, t, { midi, dur: len * dur * 0.9, vol: 0.3 * human(rng, 0.05), wave: 'triangle', cutoff: 900, cutoffEnd: 260, q: 1, sub: 0.9 });
    }

    // ---- nylon guitar comping ----
    if ((even ? COMP_A : COMP_B)[step]) {
      const v = voicing(chord.notes, 55, 74).slice(0, 4);
      strum(ctx, rig.keys, t, { notes: v, vol: 0.075 * human(rng, 0.1), spread: 0.011, up: step % 4 === 1, dur: dur * 2.5, pan: -0.3 });
    }
    // bass-note answer on the & of 4 in odd bars: little guitar arpeggio pickup
    if (!even && step === 15) guitar(ctx, rig.keys, t, { midi: voicing(s.next.notes, 62, 74)[1], dur: dur, vol: 0.05, pan: -0.3 });

    // ---- pad (sections 2, 3) ----
    if (s.chordStart && section >= 2) pad(ctx, rig.pad, t, { notes: voicing(chord.notes, 57, 76), dur: s.chordBars * s.barSeconds, vol: 0.022, cutoff: 1100, cutoffEnd: 1900, attack: 0.6, wave: 'triangle' });

    // ---- melody ----
    const n = HOOK[barInSec][step];
    if (n) {
      const len = n.dur * dur * 0.95;
      if (section === 1) flute(ctx, rig.lead, t, { midi: n.midi, dur: len, vol: 0.15 * human(rng, 0.05) });
      if (section === 2) {
        epiano(ctx, rig.lead, t, { midi: n.midi, dur: len, vol: 0.085 });
        if (barInSec === 3 || barInSec === 7) flute(ctx, rig.lead, t, { midi: n.midi + 12, dur: len, vol: 0.06 });
      }
      if (section === 3) {
        flute(ctx, rig.lead, t, { midi: n.midi, dur: len, vol: 0.14 });
        flute(ctx, rig.lead, t, { midi: n.midi + 12, dur: len, vol: 0.05 });
        if (n.dur >= 3) epiano(ctx, rig.lead, t + dur * 0.02, { midi: n.midi - 7, dur: len, vol: 0.05 });
      }
    }
  },
};
