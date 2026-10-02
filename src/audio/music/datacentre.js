// DATACENTRE: pulsing synthwave / techno. 124 bpm, A minor, four on the floor, rolling sidechained bass, delayed arps.
// 16-bar progression (Am F C G | Am F Dm E) played twice = 32 bars (~62 s).
//   section 0 build (kick + bass + hats) / 1 arps + pad / 2 breakdown (no kick) with riser / 3 drop with lead
import { kick, clap, hat, rim, tone, crash } from '../synth.js';
import { bassRound, pluck, superSaw, pad, riser, swell } from '../instruments.js';
import { pattern, melodyTable, bassNote, human } from './common.js';
import { voicing } from './sequencer.js';

const P1 = [['A2', 'min', 2], ['F2', 'maj', 2], ['C3', 'maj', 2], ['G2', 'maj', 2]];
const P2 = [['A2', 'min', 2], ['F2', 'maj', 2], ['D3', 'min', 2], ['E3', 'dom7', 2]];
const toProg = (rows) => rows.map(([root, q, bars]) => ({ root, q, bars }));

// one melody line per bar of the 16-bar progression
const LEAD = melodyTable([
  'E5:4 A5:4 C6:4 B5:2 A5:2', 'E5:4 G5:4 A5:8',
  'F5:4 A5:4 C6:4 A5:2 F5:2', 'C5:4 E5:4 F5:8',
  'E5:4 G5:4 C6:4 D6:2 E6:2', 'D6:4 C6:4 G5:8',
  'D5:4 G5:4 B5:4 A5:2 G5:2', 'D6:4 B5:4 G5:4 A5:4',
  'E5:4 A5:4 C6:4 B5:2 A5:2', 'E5:4 G5:4 A5:8',
  'F5:4 A5:4 C6:4 A5:2 F5:2', 'C5:4 E5:4 F5:8',
  'D5:4 F5:4 A5:4 G5:2 F5:2', 'E5:4 F5:4 D5:8',
  'E5:4 G#5:4 B5:4 D6:2 B5:2', 'G#5:4 E5:4 B4:8',
]);
const ARP_ORDER = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2];
const CLAP = pattern('.... x... .... x...');
const OFFHAT = pattern('..x. ..x. ..x. ..x.');
const SIXTEENTH = pattern('5555 5555 5555 5555');
const A_MINOR_PENT = [69, 72, 74, 76, 79, 81, 84, 88];

export default {
  key: 'datacentre', bpm: 124, swing: 0, introBars: 0, loopBars: 32,
  prog: toProg([...P1, ...P2, ...P1, ...P2]),
  rig: { reverb: { seconds: 2.4, wet: 0.7, send: 0.2 }, delay: { beats: 0.75, feedback: 0.42, cutoff: 3600, wet: 0.7, arpSend: 0.36, leadSend: 0.26 }, levels: { drums: 0.522, bass: 0.31, pad: 2.125, lead: 1.615, keys: 1.0, arp: 1.35, fx: 1.0 } },

  step(ctx, rig, s) {
    const { t, dur, step, chord, section, rng, intensity } = s;
    const barInSec = s.loopBar % 8;
    const inBreak = section === 2;
    const kickOn = !inBreak || barInSec === 7;
    const beat = step % 4 === 0;

    // ---- drums + sidechain ----
    if (beat && kickOn) {
      kick(ctx, rig.drums, t, { vol: 0.66, pitch: 48, punch: 150, decay: 0.26 });
      rig.duck.duck(t, 0.28, dur * 3.4);
    }
    if (CLAP[step] && !(inBreak && barInSec < 6)) clap(ctx, rig.drums, t, { vol: 0.3 });
    if (OFFHAT[step] && (section !== 0 || s.loopBar >= 2)) hat(ctx, rig.drums, t, { vol: 0.13 * human(rng, 0.1), open: true, freq: 7000 });
    if (SIXTEENTH[step] && step % 2 === 1 && !inBreak) hat(ctx, rig.drums, t, { vol: 0.045 * human(rng, 0.2) });
    if (section >= 1 && (step === 3 || step === 11) && !inBreak) rim(ctx, rig.drums, t, { vol: 0.08, freq: 2200 });
    if (barInSec === 7 && step >= 8 && section !== 1) clap(ctx, rig.drums, t, { vol: 0.06 + (step - 8) * 0.03 });
    if (step === 0 && barInSec === 0 && s.loopBar > 0) crash(ctx, rig.drums, t, { vol: 0.2 });

    // ---- rolling bass: kick owns the beats, 3 notes between ----
    if (!inBreak || barInSec >= 6) {
      if (step % 4 !== 0) {
        const b = bassNote(chord.root, 33);
        const midi = step % 4 === 2 ? b + 12 : b;
        const open = section === 0 ? 700 + (s.loopBar / 8) * 900 : 1300;
        bassRound(ctx, rig.bass, t, { midi, dur: dur * 0.9, vol: 0.3 * human(rng, 0.05), cutoff: open + (step % 4 === 2 ? 700 : 0), cutoffEnd: 320 });
      }
    }

    // ---- pad ----
    if (s.chordStart && section >= 1) {
      pad(ctx, rig.pad, t, { notes: voicing(chord.notes, 55, 76), dur: s.chordBars * s.barSeconds + 0.2, vol: inBreak ? 0.03 : 0.022, cutoff: inBreak ? 1900 : 1200, cutoffEnd: inBreak ? 3200 : 1900, attack: 0.9, release: 0.9, unison: 4, spread: 16 });
    }

    // ---- arpeggio (sections 1, 2, 3) ----
    if (section >= 1) {
      const tones = voicing(chord.notes, 64, 88);
      const pool = [tones[0], tones[1] ?? tones[0], tones[2] ?? tones[0], (tones[0] ?? 69) + 12];
      const note = pool[ARP_ORDER[step] % pool.length];
      const gain = inBreak ? 0.13 : section === 3 ? 0.085 : 0.1;
      pluck(ctx, rig.arp, t, { midi: note, dur: dur * 0.85, vol: gain * (step % 4 === 0 ? 1.2 : 0.85), cutoff: 3000 + 2600 * intensity, pan: step % 2 ? 0.35 : -0.35 });
    }

    // ---- lead ----
    if (section === 1 && barInSec >= 4 || section === 3) {
      const n = LEAD[s.loopBar % 16][step];
      if (n) superSaw(ctx, rig.lead, t, { midi: n.midi, dur: n.dur * dur * 0.95, vol: 0.075, cutoff: 3600, cutoffEnd: 1500, unison: 5, spread: 20, release: 0.2 });
      if (n && section === 3) superSaw(ctx, rig.lead, t, { midi: n.midi + 12, dur: n.dur * dur * 0.8, vol: 0.03, cutoff: 5200, unison: 3, spread: 12 });
    }

    // ---- risers and impacts ----
    if (inBreak && barInSec === 6 && step === 0) riser(ctx, rig.fx, t, { dur: 2 * s.barSeconds, vol: 0.16, from: 250, to: 9000 });
    if (inBreak && barInSec === 7 && step === 12) swell(ctx, rig.fx, t, { dur: dur * 4, vol: 0.05 });
    if (section === 3 && s.loopBar === 24 && step === 0) tone(ctx, rig.fx, t, { wave: 'sine', freq: 40, glideFrom: 90, glideTime: 0.4, dur: 0.05, a: 0.003, s: 0.6, r: 1.4, vol: 0.4 });

    // ---- data blips: sparse glitchy pentatonic bleeps (section 3 and 1's second half) ----
    if ((section === 3 || (section === 1 && barInSec >= 4)) && step % 2 === 1 && rng() < 0.11) {
      const n = A_MINOR_PENT[Math.floor(rng() * A_MINOR_PENT.length)];
      pluck(ctx, rig.arp, t, { midi: n + 12, dur: dur * 0.5, vol: 0.05, cutoff: 6500, cutoffEnd: 2000, pan: rng() * 1.2 - 0.6 });
    }
  },
};
