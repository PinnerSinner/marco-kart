// Step sequencer + mixer rig for the procedural music. Songs are plain objects (see below); this module owns timing,
// looping, swing, tempo/intensity scaling and the per-song mixer, and it works on any BaseAudioContext, so the
// exact same code plays live (lookahead scheduler) and renders offline (OfflineAudioContext, all steps at once).
//
// A song is:
//   { key, bpm, swing (0..0.5, share of a grid unit that the off-beat unit is delayed), swingGrid (1 = swing 16ths, 2 = swing 8ths), introBars, loopBars,
//     prog: [{ root:'C3', q:'maj9', bars:1 }, ...]   // the LOOP's chords, total bars = loopBars (intro bars use `introProg` if given)
//     rig: { reverb:{seconds,decay,wet,send}, delay:{beats,feedback,cutoff,wet}, levels:{drums,bass,pad,lead,arp,fx} },
//     ambient?(ctx, rig, t): void        // continuous layers (rain), started with the song
//     step(ctx, rig, s): void            // called for every 16th step, see StepInfo }
// StepInfo s: { t, dur (16th seconds), step (0..15), bar (0-based from song start), loopBar (0-based inside the loop, -1 in the intro),
//               intro, chord:{root,q,notes,name}, next:{...}, chordStart (first step of a new chord), chordBars (bars this chord lasts, set on chordStart),
//               section (8-bar block within the loop), barSeconds, intensity 0..1, rng, absStep, loopCount }
import { noteToMidi, chordNotes, makeReverb, makeDelay, makeChannel, makeDuck } from '../synth.js';
import { makeRng } from '../../core/util.js';

export const STEPS_PER_BAR = 16;

/** Expand a progression [{root,q,bars}] into a per-bar chord array. */
export function expandProgression(prog) {
  const bars = [];
  for (const c of prog) {
    const root = typeof c.root === 'number' ? c.root : noteToMidi(c.root);
    const chord = { root, q: c.q, notes: chordNotes(root, c.q), name: `${c.root}${c.q}` };
    for (let i = 0; i < (c.bars ?? 1); i++) bars.push(chord);
  }
  return bars;
}

/**
 * Close-voice `notes` (any octave) into the range [lo, hi], sorted ascending. Used for pads, keys and guitar comping.
 * @param {number[]} notes MIDI @param {number} lo @param {number} hi @returns {number[]}
 */
export function voicing(notes, lo = 55, hi = 76) {
  const out = [];
  for (const n of notes) {
    let m = n;
    while (m < lo) m += 12;
    while (m > hi) m -= 12;
    if (m >= lo && m <= hi) out.push(m);
  }
  return out.sort((a, b) => a - b);
}

/** Total loop length in seconds at the song's base tempo. */
export function loopSeconds(song) { return (song.loopBars * STEPS_PER_BAR * 60) / (song.bpm * 4); }

/**
 * Build the per-song mixer.
 * @param {BaseAudioContext} ctx @param {AudioNode} out destination (song gain)
 * @param {{onChannel?: (name:string, node:GainNode)=>void}} [hooks] onChannel lets the verification tap each stem
 * @returns {object} rig with channels: drums, bass, pad, lead, arp, fx (GainNodes), reverb, delay, duck
 */
export function createRig(ctx, out, song, { onChannel } = {}) {
  const cfg = song.rig ?? {};
  const trim = ctx.createGain(); trim.gain.value = cfg.trim ?? 1; trim.connect(out); out = trim;
  const rv = cfg.reverb ?? {}, dl = cfg.delay ?? {}, lv = cfg.levels ?? {};
  const reverb = makeReverb(ctx, { seconds: rv.seconds ?? 2.2, decay: rv.decay ?? 2.6, wet: rv.wet ?? 0.8, damp: rv.damp ?? 0.35 });
  reverb.output.connect(out);
  const spb = 60 / song.bpm;
  const delay = makeDelay(ctx, { time: (dl.beats ?? 0.75) * spb, feedback: dl.feedback ?? 0.38, cutoff: dl.cutoff ?? 3000, wet: dl.wet ?? 0.6 });
  delay.output.connect(out);
  delay.output.connect(reverb.input);
  const duck = makeDuck(ctx, out);
  const send = rv.send ?? 0.18;
  const rig = {
    reverb, delay, duck, spb,
    drums: makeChannel(ctx, out, { gain: lv.drums ?? 1, reverb, reverbSend: send * 0.4 }),
    bass: makeChannel(ctx, duck.input, { gain: lv.bass ?? 1 }),
    pad: makeChannel(ctx, duck.input, { gain: lv.pad ?? 1, reverb, reverbSend: send * 1.6 }),
    lead: makeChannel(ctx, out, { gain: lv.lead ?? 1, reverb, reverbSend: send * 1.3, delay, delaySend: dl.leadSend ?? 0.22 }),
    arp: makeChannel(ctx, out, { gain: lv.arp ?? 1, reverb, reverbSend: send, delay, delaySend: dl.arpSend ?? 0.3 }),
    keys: makeChannel(ctx, out, { gain: lv.keys ?? 1, reverb, reverbSend: send }),
    fx: makeChannel(ctx, out, { gain: lv.fx ?? 1, reverb, reverbSend: send * 1.2 }),
  };
  if (onChannel) for (const name of ['drums', 'bass', 'pad', 'lead', 'arp', 'keys', 'fx']) onChannel(name, rig[name]);
  return rig;
}

/** Sequencer state machine: hands out step times (with swing and live tempo scaling) and calls song.step(). */
export class SongRunner {
  /**
   * @param {BaseAudioContext} ctx @param {AudioNode} out @param {object} song
   * @param {{seed?:number, onChannel?:Function}} [opts]
   */
  constructor(ctx, out, song, { seed = 1, onChannel } = {}) {
    this.ctx = ctx; this.song = song;
    this.rig = createRig(ctx, out, song, { onChannel });
    this.chords = expandProgression(song.prog);
    this.introChords = song.introProg ? expandProgression(song.introProg) : null;
    this.introSteps = (song.introBars ?? 0) * STEPS_PER_BAR;
    this.loopSteps = song.loopBars * STEPS_PER_BAR;
    if (this.chords.length !== song.loopBars) throw new Error(`song ${song.key}: progression covers ${this.chords.length} bars, loopBars=${song.loopBars}`);
    if (this.introChords && this.introChords.length !== song.introBars) throw new Error(`song ${song.key}: intro progression length mismatch`);
    this.rng = makeRng(seed);
    this.intensity = 0;
    this.absStep = 0;              // steps played since start (monotonic)
    this.stepIndex = 0;            // 0..introSteps+loopSteps-1
    this.nextTime = 0;
    this.started = false;
    this.loops = 0;
    this.stopAt = Infinity;        // ambient layers stop here (offline renders); live playback is stopped by the song gain
  }

  /** Start at absolute time t0; runs song.ambient once. */
  start(t0) {
    this.nextTime = t0; this.started = true;
    if (this.song.ambient) this.song.ambient(this.ctx, this.rig, t0, this);
  }

  /** @param {number} v 0..1 */
  setIntensity(v) { this.intensity = v < 0 ? 0 : v > 1 ? 1 : v; }

  /** Current tempo in BPM after intensity scaling. */
  get bpm() { return this.song.bpm * (1 + 0.07 * this.intensity); }

  _chordAt(bar, intro) {
    if (intro) return this.introChords ? this.introChords[bar] : this.chords[bar % this.chords.length];
    return this.chords[bar % this.chords.length];
  }

  /** Fill the reused StepInfo for `stepIndex` at nominal time `t`. */
  _fill(s, idx, t, dur) {
    const song = this.song;
    const intro = idx < this.introSteps;
    const inLoop = intro ? idx : idx - this.introSteps;
    const bar = Math.floor(inLoop / STEPS_PER_BAR);
    const step = inLoop % STEPS_PER_BAR;
    const g = song.swingGrid ?? 1;
    const swung = song.swing && step % (2 * g) === g ? song.swing * g * dur : 0;
    s.t = t + swung; s.dur = dur; s.step = step; s.intro = intro;
    s.bar = intro ? bar : this.introSteps / STEPS_PER_BAR + bar;
    s.loopBar = intro ? -1 : bar;
    s.chord = this._chordAt(bar, intro);
    const lastIntro = intro && bar + 1 >= (song.introBars ?? 0);
    s.next = intro && !lastIntro ? this._chordAt(bar + 1, true) : lastIntro ? this.chords[0] : this._chordAt((bar + 1) % song.loopBars, false);
    const prev = bar > 0 ? this._chordAt(bar - 1, intro) : intro ? null : this._chordAt(song.loopBars - 1, false);
    s.chordStart = step === 0 && prev !== s.chord;
    if (s.chordStart) {
      let n = 1;
      const limit = intro ? song.introBars : song.loopBars;
      while (bar + n < limit && this._chordAt(bar + n, intro) === s.chord) n++;
      s.chordBars = n;
    }
    s.section = intro ? -1 : Math.floor(bar / 8);
    s.barSeconds = dur * STEPS_PER_BAR;
    s.intensity = this.intensity; s.absStep = this.absStep; s.loopCount = this.loops;
  }

  /** Schedule every step whose start time is before `until` (seconds on the context clock). Returns steps scheduled. */
  pump(until) {
    if (!this.started) return 0;
    let n = 0;
    const s = this._info ?? (this._info = { t: 0, dur: 0, step: 0, bar: 0, loopBar: 0, intro: false, chord: null, next: null, chordStart: false, chordBars: 1, section: 0, barSeconds: 0, intensity: 0, rng: this.rng, absStep: 0, loopCount: 0 });
    while (this.nextTime < until) {
      this._fill(s, this.stepIndex, this.nextTime, 60 / (this.bpm * 4));
      this.song.step(this.ctx, this.rig, s);
      this.nextTime += s.dur;
      this.absStep++; n++;
      this.stepIndex++;
      if (this.stepIndex >= this.introSteps + this.loopSteps) { this.stepIndex = this.introSteps; this.loops++; }
    }
    return n;
  }
}

/**
 * Render a song into an (offline) context: `loops` passes of the loop (plus the intro once), all scheduled up front.
 * @returns {{seconds:number, runner:SongRunner}} seconds of scheduled music (intro + loops)
 */
export function scheduleSong(ctx, out, song, { loops = 1, intensity = 0, seed = 1, t0 = 0.05 } = {}) {
  const runner = new SongRunner(ctx, out, song, { seed });
  runner.setIntensity(intensity);
  runner.stopAt = t0 + (runner.introSteps + runner.loopSteps * loops) * 60 / (runner.bpm * 4) + 2;
  runner.start(t0);
  const steps = runner.introSteps + runner.loopSteps * loops;
  const secs = (steps * 60) / (runner.bpm * 4);
  runner.pump(t0 + secs - 1e-6);
  return { seconds: secs, runner };
}
