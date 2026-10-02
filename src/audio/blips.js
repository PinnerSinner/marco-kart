// Gibberish blip voice: Animalese-style syllable blips, one short tone per syllable, with a timbre of its own for every character.
// Used when speechSynthesis is missing or has no voice (so every character still "speaks"), and as a cute quiet layer under a spoken line
// when the Settings toggle 'Blip voices' is on. The blips are spread over the estimated speaking time of the line, so they end with the text.
// planBlips() is pure (Node unit tested); BlipVoice turns a plan into scheduled WebAudio oscillators and never throws without an AudioContext.
import { estimateSpeechMs } from './speech.js';
import { VoiceRegistry } from './voiceRegistry.js';

/**
 * Per-character timbre, each as extreme and as separable by ear as the speech personas in speech.js (base pitches are at least a major third
 * apart: 62, 100, 150, 215, 330, 520, 820, 1200 Hz). `base` Hz of the middle of the melody, `span` the semitone range, `wave` the oscillator type,
 * `lp` a low-pass cut-off (Hz) that darkens or brightens it, `sps` syllables per second (at the pace of the speech), `vib` vibrato depth (semitones),
 * `drop` the share of syllables lost (packet loss), `step` quantises the pitch to whole semitone steps of this size (0 = free; robots use big steps),
 * `glide` semitones of slide over each blip (negative = drawl, positive = yip), `mono` = no melody at all (a monotone), `gain` loudness (balanced per character: equal to within a dB through the voice bus).
 */
export const BLIP_TIMBRES = Object.freeze({
  subnet: { base: 62, span: 4, wave: 'sawtooth', lp: 520, sps: 4.5, vib: 0.3, drop: 0, step: 0, glide: -2.5, gain: 0.72 },       // sub-bass giant: slow, long, rumbling
  rex: { base: 100, span: 0, wave: 'square', lp: 1300, sps: 8, vib: 0, drop: 0, step: 0, glide: 0, mono: true, gain: 0.52 },       // robot: one flat pitch, hard buzz
  carlos: { base: 150, span: 5, wave: 'sine', lp: 900, sps: 5.5, vib: 0.45, drop: 0, step: 0, glide: -3.2, gain: 0.66 },              // deep slow drawl: soft, wobbling, sliding down
  marco: { base: 215, span: 8, wave: 'sawtooth', lp: 1700, sps: 10, vib: 0.25, drop: 0, step: 0, glide: 0, gain: 0.81 },            // gravelly shouty uncle
  tilly: { base: 330, span: 5, wave: 'triangle', lp: 1400, sps: 6.5, vib: 0.2, drop: 0, step: 0, glide: 0.3, gain: 0.73 },          // posh stage whisper: mid pitch, gentle, unhurried
  packet: { base: 520, span: 12, wave: 'square', lp: 2400, sps: 14, vib: 0, drop: 0.22, step: 3, glide: 0, gain: 0.43 },           // glitchy courier: stepped pitches, lost syllables
  lambda: { base: 820, span: 10, wave: 'square', lp: 3800, sps: 22, vib: 0.1, drop: 0, step: 0, glide: 0.8, gain: 0.43 },           // nasal chipmunk: bright and frantic
  biscuit: { base: 1200, span: 7, wave: 'triangle', lp: 5200, sps: 16, vib: 0, drop: 0.05, step: 0, glide: 4, gain: 0.71 },        // helium squeak with a yip on every blip
});
/** Overall level of a blip line (timbre gains are balanced so every character babbles about 2 dB under Marco's clips at gain 1: see tools/mix_check.mjs). */
const BLIP_BASE = 0.12;
const DEFAULT_TIMBRE = BLIP_TIMBRES.marco;
/** A pentatonic-ish set of semitone offsets: whatever the letters are, the melody stays cute. */
const SCALE = [0, 2, 4, 7, 9, 12];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const VOWELS = /[aeiouy]/i;

/** Split a line into syllable-ish units: each vowel group is one blip (a word with none still gets one), punctuation becomes a pause. */
export function syllablesOf(text) {
  const out = [];
  const words = String(text ?? '').replace(/\{[^}]*\}/g, 'x').split(/\s+/).filter(Boolean);
  for (const w of words) {
    const letters = w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '');       // accents fold away (Carlos speaks Portuguese)
    const groups = letters.match(/[aeiouy]+/gi) ?? [];
    const n = Math.max(letters.length ? 1 : 0, groups.length);
    const tail = /[.!?]+$/.test(w) ? (w.endsWith('?') ? 'q' : w.endsWith('!') ? 'x' : '.') : /[,;:]$/.test(w) ? ',' : '';
    for (let i = 0; i < n; i++) {
      const g = groups[i] ?? letters[0] ?? 'a';
      out.push({ code: (g.toLowerCase().charCodeAt(0) * 7 + (groups[i + 1] ? groups[i + 1].charCodeAt(0) : 3) + i * 5) | 0, vowel: VOWELS.test(g), end: i === n - 1 ? tail : '' });
    }
  }
  return out;
}

/**
 * Plan the blips of one line. Times are seconds from the start of the line.
 * @param {string} charId @param {string} text
 * @param {{rng?: () => number, durationMs?: number}} [o] `durationMs` = how long the line is spoken (default: estimated from the text at the character's own pace, `sps` / 10)
 * @returns {{events: {t:number, dur:number, freq:number, gain:number, glide:number}[], totalMs: number, timbre: object}}
 */
export function planBlips(charId, text, { rng = Math.random, durationMs = 0 } = {}) {
  const tb = BLIP_TIMBRES[charId] ?? DEFAULT_TIMBRE;
  const syl = syllablesOf(text);
  const total = (durationMs > 0 ? durationMs : estimateSpeechMs(text, tb.sps / 10)) / 1000;
  if (!syl.length) return { events: [], totalMs: 0, timbre: tb };
  const pauseFor = (c) => (c === '.' || c === 'q' || c === 'x' ? 0.24 : c === ',' ? 0.12 : 0);
  const pauses = syl.reduce((a, s) => a + pauseFor(s.end), 0);
  // the time between two syllables: the line's length shared out, but never faster or slower than a voice could plausibly babble
  const gap = clamp((total - pauses) / syl.length, 0.045, 0.2);
  const events = [];
  let t = 0;
  for (let i = 0; i < syl.length; i++) {
    const s = syl[i];
    const lastOnes = i >= syl.length - 2;
    const off = SCALE[Math.abs(s.code) % SCALE.length] + (s.vowel ? 2 : 0) - 3;
    let semi = off * (tb.span / 9) - (i / syl.length) * 2.2;                 // statements sink a little over the line
    if (lastOnes && syl[syl.length - 1].end === 'q') semi += 3.5;              // questions lift at the end
    if (s.end === 'x') semi += 2;                                              // shouts punch up
    if (tb.mono) semi = 0;                                                     // a robot has one note
    if (tb.step) semi = Math.round(semi / tb.step) * tb.step;
    const lost = tb.drop > 0 && rng() < tb.drop;
    const dur = clamp(gap * (0.62 + rng() * 0.22), 0.03, 0.15);
    if (!lost) {
      events.push({
        t, dur, freq: tb.base * Math.pow(2, (semi + (rng() - 0.5) * (tb.step ? 0 : 0.6)) / 12),
        gain: tb.gain * (s.end === 'x' ? 1 : s.vowel ? 0.85 : 0.6) * (0.9 + rng() * 0.2), glide: tb.glide,
      });
    }
    t += gap + pauseFor(s.end);
  }
  return { events, totalMs: Math.round(t * 1000), timbre: tb };
}

/**
 * Synthesises plans with WebAudio. Everything is scheduled ahead and can be faded out, so a stopped line never clicks. Lines OVERLAP freely (every
 * speaker babbles on top of the others); the registry only applies the per-speaker anti-spam gap and the global cap of simultaneous voices.
 */
export class BlipVoice {
  /**
   * @param {{ctx: () => (AudioContext|null), dest: () => (AudioNode|null), rng?: () => number, registry?: VoiceRegistry}} o getters, so a context created later (first gesture) is picked up
   */
  constructor({ ctx, dest, rng, registry } = {}) {
    this.getCtx = ctx ?? (() => null);
    this.getDest = dest ?? (() => null);
    this.rng = rng ?? Math.random;
    this.registry = registry ?? new VoiceRegistry();
    this.enabled = true;
    this._lines = [];            // [{ out: GainNode, lp, end: number (ctx time), charId, stop(sec) }]
    this.played = 0;             // lines started (tests)
    this.nodes = 0;              // oscillators scheduled (tests)
    this.last = null;            // last plan
    this.onChange = null;        // () => void when a line starts or ends (the mix trims the voice bus)
  }

  /** Is anything babbling right now? */
  get playing() {
    const c = this.getCtx();
    return !!c && this._lines.some((l) => l.end > c.currentTime);
  }

  /** Number of lines sounding right now. */
  get active() {
    const c = this.getCtx();
    return c ? this._lines.filter((l) => l.end > c.currentTime).length : 0;
  }

  /**
   * Start babbling a line and return its handle ({ stop(sec), end, charId }), or null (and do nothing) without an AudioContext, when the plan is empty,
   * when this speaker has just started a line (anti-spam) or when the global voice cap would drop it.
   * @param {{charId: string, text: string}} bark
   * @param {{gain?: number, durationMs?: number, force?: boolean}} [o] gain 0..1 (volume of the whole line), durationMs = speaking time to spread over, force = skip the anti-spam gap
   */
  start(bark, { gain = 1, durationMs = 0, force = false } = {}) {
    const c = this.getCtx(), dest = this.getDest();
    if (!this.enabled || !c || !dest || !bark?.text || gain <= 0) return null;
    if (c.state && c.state !== 'running') return null;
    const now = c.currentTime;
    this._lines = this._lines.filter((l) => l.end > now);
    const plan = planBlips(bark.charId, bark.text, { rng: this.rng, durationMs });
    if (!plan.events.length) return null;
    const tb = plan.timbre;
    const t0 = now + 0.02;
    const end = t0 + plan.totalMs / 1000 + 0.2;
    const line = { out: null, lp: null, end, charId: bark.charId, stop: null, voice: null };
    line.stop = (sec = 0.08) => this._fade(line, sec);
    const adm = this.registry.admit({ charId: bark.charId, level: gain, now, end, stop: line.stop, force });
    if (!adm) return null;
    line.voice = adm.voice;
    try {
      const out = c.createGain();
      out.gain.value = clamp(gain, 0, 1.5) * BLIP_BASE;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = tb.lp; lp.Q.value = 0.8;
      lp.connect(out); out.connect(dest);
      for (const e of plan.events) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = tb.wave;
        const a = t0 + e.t, b = a + e.dur;
        o.frequency.setValueAtTime(e.freq, a);
        if (e.glide) o.frequency.linearRampToValueAtTime(e.freq * Math.pow(2, e.glide / 12), b);
        if (tb.vib > 0 && o.detune) { o.detune.setValueAtTime(-tb.vib * 100, a); o.detune.linearRampToValueAtTime(tb.vib * 100, a + e.dur * 0.5); o.detune.linearRampToValueAtTime(-tb.vib * 100, b); }
        g.gain.setValueAtTime(0.0001, a);
        g.gain.linearRampToValueAtTime(e.gain, a + Math.min(0.008, e.dur * 0.25));
        g.gain.exponentialRampToValueAtTime(0.0001, b);
        o.connect(g); g.connect(lp);
        o.start(a); o.stop(b + 0.02);
        this.nodes++;
      }
      line.out = out; line.lp = lp;
      this._lines.push(line);
      setTimeoutSafe(() => { this._drop(line); }, (end - now) * 1000 + 300);
    } catch {
      this.registry.release(adm.voice);
      return null;
    }
    this.played++;
    this.last = plan;
    this._changed();
    return line;
  }

  /** Babble a line: like start(), but returns whether it started. */
  play(bark, o = {}) { return !!this.start(bark, o); }

  _changed() { try { this.onChange?.(); } catch { /* ignore */ } }

  _drop(line) {
    try { line.lp?.disconnect(); line.out?.disconnect(); } catch { /* gone */ }
    const i = this._lines.indexOf(line);
    if (i >= 0) this._lines.splice(i, 1);
    this._changed();
  }

  /** Fade one line out (it ends at once for the registry). */
  _fade(line, sec = 0.08) {
    const c = this.getCtx();
    line.end = 0;
    if (line.voice) this.registry.release(line.voice);
    if (!c || !line.out) return;
    try {
      const now = c.currentTime;
      line.out.gain.cancelScheduledValues(now);
      line.out.gain.setValueAtTime(line.out.gain.value, now);
      line.out.gain.linearRampToValueAtTime(0, now + sec);
      setTimeoutSafe(() => this._drop(line), (sec + 0.5) * 1000);
    } catch { /* gone */ }
  }

  /** Fade out every line that is babbling. @param {number} [sec] */
  stop(sec = 0.08) {
    const lines = this._lines.slice();
    this._lines = [];
    for (const l of lines) this._fade(l, sec);
  }
}

const setTimeoutSafe = (fn, ms) => { try { const h = setTimeout(fn, ms); h?.unref?.(); return h; } catch { return 0; } };
