// Which voices are sounding right now. Voices (Marco's recorded clips, the blip babble of every character) are free to overlap: nothing cuts
// another one off. The only rules are
//   - a gentle anti-spam rule per speaker (a speaker that has just started a line cannot start another within SPEAKER_GAP seconds), and
//   - a global cap of MAX_VOICES simultaneous voices: when a new voice would be the 7th the quietest one (the oldest of equals) is dropped
//     silently (a short fade), or the newcomer is, if it is the quietest of all.
// While several overlap the whole voice bus is trimmed a little (overlapTrim) so the sum does not clip.
// Pure logic with an injected clock (Node-safe, unit tested); AudioManager owns the audio nodes behind each entry (`stop`).

export const VOICE_RULES = Object.freeze({ SPEAKER_GAP: 0.4, MAX_VOICES: 6, TRIM_FROM: 3 });

/** Gain of the voice bus for `n` voices sounding at once: 1 up to two voices, then 1/sqrt(n/2) (-1.7 dB for three, -3 dB for four, -4.8 dB for six). */
export const overlapTrim = (n) => (n < VOICE_RULES.TRIM_FROM ? 1 : Math.sqrt(2 / n));

export class VoiceRegistry {
  /** @param {{gap?: number, max?: number}} [o] */
  constructor({ gap = VOICE_RULES.SPEAKER_GAP, max = VOICE_RULES.MAX_VOICES } = {}) {
    this.gap = gap; this.max = max;
    /** @type {{charId: string, level: number, start: number, end: number, stop: ((sec?: number) => void)|null}[]} */
    this.voices = [];
    this._last = new Map();      // speaker -> time their last voice started
    this.dropped = 0;            // voices lost to the cap (tests)
    this.refused = 0;            // voices refused by the anti-spam rule (tests)
  }

  /** Forget voices that have ended by `now`. */
  prune(now) {
    if (this.voices.length) this.voices = this.voices.filter((v) => v.end > now);
  }

  /** How many voices are sounding at `now`. */
  count(now) { this.prune(now); return this.voices.length; }

  /** Gain trim for the current number of voices. */
  trim(now) { return overlapTrim(this.count(now)); }

  /**
   * Ask to start a voice.
   * @param {{charId: string, level?: number, now: number, end: number, stop?: (sec?: number) => void, force?: boolean}} o
   *   level: how loud it is (distance-attenuated lines are quieter, so they are the first to go); end: when it ends (same clock as `now`);
   *   stop: fades the sound out (called when it is dropped for the cap); force: skip the anti-spam rule (menu lines).
   * @returns {{voice: object, trim: number, evicted: object[]}|null} null = refused (nothing to start)
   */
  admit({ charId, level = 1, now, end, stop = null, force = false }) {
    this.prune(now);
    const last = this._last.get(charId);
    if (!force && last !== undefined && now - last < this.gap) { this.refused++; return null; }
    const evicted = [];
    while (this.voices.length >= this.max) {
      let victim = 0;
      for (let i = 1; i < this.voices.length; i++) {
        const a = this.voices[i], b = this.voices[victim];
        if (a.level < b.level || (a.level === b.level && a.start < b.start)) victim = i;
      }
      const v = this.voices[victim];
      if (level < v.level) { this.dropped++; return null; }           // the newcomer is the quietest: it is the one that is dropped
      this.voices.splice(victim, 1); evicted.push(v); this.dropped++;
      try { v.stop?.(0.06); } catch { /* already gone */ }
    }
    const voice = { charId, level, start: now, end, stop };
    this.voices.push(voice);
    this._last.set(charId, now);
    return { voice, trim: overlapTrim(this.voices.length), evicted };
  }

  /** A voice ended (or was stopped) early. */
  release(voice) {
    const i = this.voices.indexOf(voice);
    if (i >= 0) this.voices.splice(i, 1);
  }

  /** Stop and forget everything (pause, menus). @param {number} [sec] fade */
  stopAll(sec = 0.06) {
    for (const v of this.voices) { try { v.stop?.(sec); } catch { /* gone */ } }
    this.voices = [];
  }

  /** Is this speaker allowed to start a voice at `now` (anti-spam only)? */
  canStart(charId, now) {
    const last = this._last.get(charId);
    return last === undefined || now - last >= this.gap;
  }
}
