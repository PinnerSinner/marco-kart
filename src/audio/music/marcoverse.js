// MARCOVERSE: epic trance arpeggios. 138 bpm, D minor (Dm Bb F C, two bars each), 32 bars (~56 s).
//   section 0 groove + arps / 1 first drop with lead / 2 breakdown: pads, strings, arps, snare-roll riser / 3 final drop, doubled lead.
import { kick, snare, clap, hat, crash, tone } from '../synth.js';
import { bassRound, pluck, superSaw, pad, choir, riser } from '../instruments.js';
import { pattern, melodyTable, bassNote, human } from './common.js';
import { voicing } from './sequencer.js';

const PROG4 = [['D3', 'min', 2], ['Bb2', 'maj', 2], ['F3', 'maj', 2], ['C3', 'maj', 2]];
const toProg = (rows) => rows.map(([root, q, bars]) => ({ root, q, bars }));

const LEAD = melodyTable([
  'A5:6 D6:2 F6:8', 'E6:4 D6:4 A5:8',
  'F5:6 Bb5:2 D6:8', 'C6:4 Bb5:4 F5:8',
  'A5:6 C6:2 F6:8', 'E6:4 C6:4 A5:8',
  'G5:6 C6:2 E6:8', 'D6:4 C6:4 G5:8',
]);
const ARP_ORDER = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2];
const CLAP = pattern('.... x... .... x...');
const OFFHAT = pattern('..x. ..x. ..x. ..x.');

export default {
  key: 'marcoverse', bpm: 138, swing: 0, introBars: 0, loopBars: 32,
  prog: toProg([...PROG4, ...PROG4, ...PROG4, ...PROG4]),
  rig: { reverb: { seconds: 3.0, decay: 2.2, wet: 0.85, send: 0.24 }, delay: { beats: 0.75, feedback: 0.45, cutoff: 4200, wet: 0.75, arpSend: 0.4, leadSend: 0.3 }, levels: { drums: 0.522, bass: 0.27, pad: 1.53, lead: 1.615, keys: 1.0, arp: 2.25, fx: 1.0 } },

  step(ctx, rig, s) {
    const { t, dur, step, chord, section, rng, intensity } = s;
    const barInSec = s.loopBar % 8;
    const inBreak = section === 2;
    const kickOn = !inBreak;
    const beat = step % 4 === 0;

    // ---- drums ----
    if (beat && kickOn) { kick(ctx, rig.drums, t, { vol: 0.66, pitch: 48, punch: 150, decay: 0.24 }); rig.duck.duck(t, 0.3, dur * 3.2); }
    if (CLAP[step] && !inBreak && (section >= 1 || s.loopBar >= 4)) clap(ctx, rig.drums, t, { vol: 0.3 });
    if (OFFHAT[step] && !inBreak && (section >= 1 || s.loopBar >= 2)) hat(ctx, rig.drums, t, { vol: 0.13 * human(rng, 0.1), open: true, freq: 7200 });
    if (step % 2 === 1 && !inBreak) hat(ctx, rig.drums, t, { vol: 0.04 * human(rng, 0.2) });
    if (barInSec === 7 && step >= 4 && (section === 0 || section === 2)) snare(ctx, rig.drums, t, { vol: 0.04 + step * 0.016, decay: 0.08 });
    if (step === 0 && barInSec === 0 && s.loopBar > 0) crash(ctx, rig.drums, t, { vol: 0.24 });

    // ---- off-beat bass ----
    if (!inBreak && step % 4 === 2) {
      bassRound(ctx, rig.bass, t, { midi: bassNote(chord.root, 33), dur: dur * 3.2, vol: 0.34, cutoff: 1100, cutoffEnd: 340, q: 3 });
    }

    // ---- pads / strings ----
    if (s.chordStart) {
      const notes = voicing(chord.notes, 55, 79);
      if (section !== 0 || s.loopBar >= 4) pad(ctx, rig.pad, t, { notes, dur: s.chordBars * s.barSeconds + 0.1, vol: inBreak ? 0.036 : 0.022, cutoff: inBreak ? 2400 : 1400, cutoffEnd: inBreak ? 4200 : 2200, attack: 0.7, release: 0.9, unison: 4, spread: 18 });
      if (inBreak || section === 3) choir(ctx, rig.pad, t, { notes: voicing(chord.notes, 62, 81).slice(-3), dur: s.chordBars * s.barSeconds, vol: 0.02, attack: 0.9 });
    }

    // ---- arpeggio: constant 16ths, filter opens through the section ----
    {
      const tones = voicing(chord.notes, 62, 90);
      const pool = [tones[0], tones[1], tones[2], tones[0] + 12];
      const note = pool[ARP_ORDER[step] % pool.length];
      const open = inBreak ? 2200 + barInSec * 500 : 3200 + 1800 * intensity + (section === 0 ? barInSec * 260 : 700);
      const gain = inBreak ? 0.1 : 0.088;
      if (!(section === 0 && s.loopBar < 2 && step % 2)) pluck(ctx, rig.arp, t, { midi: note, dur: dur * 0.8, vol: gain * (step % 4 === 0 ? 1.25 : 0.85), cutoff: open, wave: 'sawtooth', pan: step % 2 ? 0.4 : -0.4 });
    }

    // ---- lead ----
    if (section === 1 || section === 3) {
      const n = LEAD[s.loopBar % 8][step];
      if (n) {
        superSaw(ctx, rig.lead, t, { midi: n.midi, dur: n.dur * dur * 0.97, vol: 0.075, cutoff: 4200, cutoffEnd: 1900, unison: 5, spread: 24, release: 0.25 });
        if (section === 3) superSaw(ctx, rig.lead, t, { midi: n.midi + 12, dur: n.dur * dur * 0.85, vol: 0.038, cutoff: 5600, unison: 3, spread: 14 });
      }
    }

    // ---- builds ----
    if ((section === 0 || section === 2) && barInSec === 6 && step === 0) riser(ctx, rig.fx, t, { dur: 2 * s.barSeconds, vol: 0.18, from: 300, to: 10000 });
    if ((section === 1 || section === 3) && barInSec === 0 && step === 0) tone(ctx, rig.fx, t, { wave: 'sine', freq: 44, glideFrom: 110, glideTime: 0.5, dur: 0.05, a: 0.003, s: 0.7, r: 1.5, vol: 0.34 });
  },
};
