// BLIGHTY: jaunty brass-band / britpop shuffle with rain. 120 bpm, 8th-note shuffle (swing 0.3), G major. 32-bar loop (A B A B, ~64 s).
//   tuba oom-pah, jangly strummed guitar, marching snare with rolls, brass tune with harmony, rain bed + drips + distant thunder.
import { kick, snare, hat, crash, bell, burst, tone } from '../synth.js';
import { tuba, brass, strum, epiano, pad } from '../instruments.js';
import { noiseSource } from '../synth.js';
import { pattern, melodyTable, bassNote, human } from './common.js';
import { voicing } from './sequencer.js';

const A = [['G3', 'maj'], ['D3', 'maj'], ['E3', 'min'], ['C3', 'maj'], ['G3', 'maj'], ['D3', 'maj'], ['C3', 'maj'], ['D3', 'maj']];
const B = [['C3', 'maj'], ['G3', 'maj'], ['A2', 'min'], ['D3', 'maj'], ['C3', 'maj'], ['G3', 'maj'], ['D3', 'maj'], ['D3', 'dom7']];
const toProg = (rows) => rows.map(([root, q]) => ({ root, q }));

const TUNE_A = melodyTable([
  'B5:3 D6:1 G6:4 D6:2 B5:2 D6:4',
  'A5:3 D6:1 F#6:4 D6:2 A5:2 F#5:4',
  'G5:3 B5:1 E6:4 B5:2 G5:2 B5:4',
  'E5:3 G5:1 C6:4 G5:2 E5:2 G5:2 A5:2',
  'B5:3 D6:1 G6:4 F#6:2 E6:2 D6:4',
  'A5:2 A5:2 D6:4 C#6:2 D6:2 E6:4',
  'E6:3 C6:1 G5:4 E5:2 G5:2 C6:4',
  'D6:2 C#6:2 A5:2 F#5:2 A5:4 D5:2 F#5:2',
]);
const TUNE_B = melodyTable([
  'G5:3 C6:1 E6:4 C6:2 G5:2 E5:4',
  'D5:3 G5:1 B5:4 G5:2 D5:2 B4:4',
  'A5:3 C6:1 E6:4 C6:2 A5:2 C6:4',
  'F#6:3 D6:1 A5:4 D6:2 F#6:2 A5:4',
  'E6:2 D6:2 C6:4 G5:2 E5:2 G5:4',
  'G5:2 B5:2 D6:4 B5:2 G5:2 D6:4',
  'A5:3 D6:1 F#6:4 E6:2 D6:2 C#6:4',
  'D6:8 A5:2 F#5:2 A5:2 D5:2',
]);

const KICK = pattern('x....... x...x...');
const SNARE = pattern('....x... ....x...');
const SHUFFLE_HAT = pattern('x.x.x.x. x.x.x.x.');   // 8ths: the off-beats get the swing
const JANGLE = [[0, false], [4, false], [6, true], [10, true], [12, false], [14, true]];

export default {
  key: 'blighty', bpm: 120, swing: 0.3, swingGrid: 2, introBars: 0, loopBars: 32,
  prog: toProg([...A, ...B, ...A, ...B]),
  rig: { reverb: { seconds: 2.6, decay: 2.2, wet: 0.8, send: 0.2 }, delay: { beats: 0.75, feedback: 0.25, wet: 0.35, leadSend: 0.1 }, levels: { drums: 0.612, bass: 0.31, pad: 1.08, lead: 1.8, keys: 2.0, arp: 1.0, fx: 1.0 } },

  /** Continuous rain: two filtered noise layers (hiss + patter) that loop seamlessly, plus a low rumble. */
  ambient(ctx, rig, t0, runner) {
    const stop = runner?.stopAt ?? Infinity;
    const dur = Number.isFinite(stop) ? stop - t0 : 0;
    const layer = (kind, type, freq, q, gain) => {
      const src = noiseSource(ctx, kind, t0, dur, true);
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(rig.fx);
    };
    layer('pink', 'bandpass', 3800, 0.45, 0.06);       // patter
    layer('white', 'highpass', 6500, 0.7, 0.012);      // hiss
    layer('brown', 'lowpass', 260, 0.7, 0.05);         // distant traffic / rumble
  },

  step(ctx, rig, s) {
    const { t, dur, step, chord, section, rng } = s;
    const barInSec = s.loopBar % 8;
    const tune = section % 2 === 0 ? TUNE_A : TUNE_B;
    const lastBar = barInSec === 7;

    // ---- rain drips and thunder (very quiet, through the reverb) ----
    if (step % 2 === 0 && rng() < 0.16) {
      const f = 1500 + rng() * 2600;
      tone(ctx, rig.fx, t + rng() * dur, { wave: 'sine', freq: f, glideFrom: f * 1.5, glideTime: 0.02, dur: 0.01, a: 0.001, d: 0.03, s: 0, r: 0.05, vol: 0.02 + rng() * 0.02, pan: rng() * 1.6 - 0.8 });
    }
    if (s.loopBar === 13 && step === 0) burst(ctx, rig.fx, t, { dur: 3.2, vol: 0.05, kind: 'brown', type: 'lowpass', freq: 220, q: 0.6, a: 0.5, d: 1.2, s: 0.4, r: 1.6 });

    // ---- drums: shuffle backbeat + marching snare rolls ----
    if (KICK[step]) kick(ctx, rig.drums, t, { vol: 0.55 * human(rng), pitch: 50, decay: 0.24 });
    if (SNARE[step]) snare(ctx, rig.drums, t, { vol: 0.4, tone: 200 });
    if (SHUFFLE_HAT[step]) hat(ctx, rig.drums, t, { vol: step % 4 === 0 ? 0.1 : 0.075, open: false, freq: 8200 });
    if (section >= 1 && step === 14) kick(ctx, rig.drums, t, { vol: 0.32, pitch: 52, decay: 0.2 });
    if (lastBar && step >= 8) snare(ctx, rig.drums, t, { vol: 0.07 + (step - 8) * 0.03, decay: 0.09 });   // roll
    if (s.step === 0 && barInSec === 0 && s.loopBar > 0) crash(ctx, rig.drums, t, { vol: 0.22, decay: 1.4 });
    if (section === 3 && barInSec === 7 && step === 8) bell(ctx, rig.drums, t, { vol: 0.08, freq: 1500, decay: 0.5, ratio: 2.7 });

    // ---- tuba oom-pah ----
    const b = bassNote(chord.root, 31);
    if (step === 0) tuba(ctx, rig.bass, t, { midi: b, dur: dur * 5, vol: 0.36 });
    if (step === 8) tuba(ctx, rig.bass, t, { midi: b + 7, dur: dur * 5, vol: 0.34 });
    if (step === 14 && barInSec % 2 === 1) tuba(ctx, rig.bass, t, { midi: bassNote(s.next.root, 31) + (bassNote(s.next.root, 31) > b ? -2 : 2), dur: dur * 1.6, vol: 0.28 });

    // ---- pah stabs (brass-organ) on 2 and 4 ----
    if (step === 4 || step === 12) {
      const v = voicing(chord.notes, 58, 74);
      v.forEach((m) => brass(ctx, rig.keys, t, { midi: m, dur: dur * 2.6, vol: 0.03, attack: 0.012, cutoff: 1700 }));
    }

    // ---- jangly guitar ----
    for (const [st, up] of JANGLE) {
      if (st === step) strum(ctx, rig.keys, t, { notes: voicing(chord.notes, 55, 71).slice(0, 5), vol: 0.048 * (st % 4 === 0 ? 1 : 0.8) * human(rng, 0.08), spread: 0.009, up, dur: dur * 2, pan: 0.32 });
    }

    // ---- brass tune: section 0/2 tune A, 1/3 tune B; second half adds harmony and a counter line ----
    const n = tune[barInSec][step];
    if (n) {
      const len = n.dur * dur * 0.93;
      brass(ctx, rig.lead, t, { midi: n.midi, dur: len, vol: 0.085 * human(rng, 0.04), pan: -0.1 });
      if (section >= 2) brass(ctx, rig.lead, t, { midi: n.midi - (section === 3 ? 8 : 4), dur: len, vol: 0.05, pan: 0.15, cutoff: 2000 });
      if (section === 3 && n.dur >= 4) epiano(ctx, rig.lead, t, { midi: n.midi + 12, dur: len * 0.6, vol: 0.05 });
    }

    // ---- warm organ pad under the big sections ----
    if (s.chordStart && section >= 2) pad(ctx, rig.pad, t, { notes: voicing(chord.notes, 52, 71), dur: s.chordBars * s.barSeconds, vol: 0.022, cutoff: 900, cutoffEnd: 1500, attack: 0.3, wave: 'triangle' });
  },
};
