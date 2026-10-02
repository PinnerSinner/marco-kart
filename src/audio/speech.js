// SpeechVoice: browser speechSynthesis for character barks. Every character has a deliberately extreme voice persona: a pitch band of its own
// (0.1 to 2, at least 0.25 apart), a very different rate (0.5 to 2.4), a different installed browser voice (scored to prefer different
// voices, genders and accents), a little random wobble on every line and an odd delivery quirk (shouts, trails off, repeats the last word,
// whispers, stutters, speaks like a robot).
// Safe everywhere: with no speechSynthesis (Node, old browsers, locked-down webviews) or no installed voice every call is a silent no-op
// (`available` says so and src/audio/AudioManager.js then falls back to the procedural blip voice in ./blips.js); voices that load late
// (voiceschanged) are picked up on the next line.
// Rules: browsers speak ONE utterance at a time (Chrome queues the rest), so a speaking line is NEVER cancelled because a newer one arrived:
// up to MAX_QUEUE lines wait their turn (the most important first), lines that have waited longer than STALE_AFTER seconds are dropped, a
// speaker cannot start twice within SPEAKER_GAP seconds, and the volume follows the voice slider. The blip layer (./blips.js) is what lets the
// chatter genuinely overlap. Node-importable (no DOM at import time); the director uses estimateSpeechMs() to size speech bubbles.

/**
 * The persona table. `pitch` 0..2 and `rate` 0.1..10 are the base prosody, `wobble` is the +/- fraction of random variation per line,
 * `volume` is relative to the voice slider, `quirk` names a text transform (see applyQuirk), `langs` orders the accents to look for (a two-letter entry such as 'pt' matches any regional voice), `fallbackLang` tags the utterance when no voice is installed,
 * `gender` and `pref` steer the choice of installed voice.
 */
export const VOICE_PROFILES = {
  // pitch bands (ascending): subnet 0.10, rex 0.37, carlos 0.64, marco 0.91, tilly 1.18, packet 1.45, lambda 1.72, biscuit 2.00 (every pair at least 0.25 apart, wobbles kept narrow so the bands never touch)
  marco: { label: 'Gravelly shouty uncle', gender: 'm', pitch: 0.91, rate: 1.3, volume: 1, wobble: { pitch: 0.04, rate: 0.05 }, quirk: 'none', langs: ['en-GB', 'en-AU', 'en-US'], pref: /daniel|oliver|arthur|google uk english male/i },
  subnet: { label: 'Sub-bass slow giant, booming baritone', gender: 'm', pitch: 0.1, rate: 0.5, volume: 1, wobble: { pitch: 0.05, rate: 0.04 }, quirk: 'boom', langs: ['en-GB', 'en-US'], pref: /bad news|bruce|fred|george|thomas|alex|david/i },
  lambda: { label: 'Frantic nasal chipmunk, ALL CAPS auctioneer', gender: 'f', pitch: 1.72, rate: 2.4, volume: 1, wobble: { pitch: 0.05, rate: 0.06 }, quirk: 'shout', langs: ['en-US', 'en-GB', 'en-AU'], pref: /samantha|zira|susan|karen|hazel|junior/i },
  packet: { label: 'Glitchy courier, stutters and drops words', gender: 'm', pitch: 1.45, rate: 1.7, volume: 0.95, wobble: { pitch: 0.05, rate: 0.15 }, quirk: 'stutter', langs: ['en-AU', 'en-GB', 'en-US'], pref: /rishi|aaron|ryan|mark|guy|lee|gordon/i },
  // Carlos speaks Brazilian Portuguese only: pt-BR voices first, then pt-PT, then any Portuguese (`pt`), then whatever English or other voice there is (fallbackLang tags the utterance).
  carlos: { label: 'Deep slow Brazilian beach drawl, trails off', gender: 'm', pitch: 0.64, rate: 0.62, volume: 0.95, wobble: { pitch: 0.05, rate: 0.08 }, quirk: 'trail', langs: ['pt-BR', 'pt-PT', 'pt'], fallbackLang: 'pt-BR', pref: /felipe|antonio|ricardo|eddy|reed|google portugu/i },
  tilly: { label: 'Mid-pitch posh butler-dowager, stage whisper', gender: 'f', pitch: 1.18, rate: 0.8, volume: 0.6, wobble: { pitch: 0.05, rate: 0.06 }, quirk: 'whisper', langs: ['en-GB', 'en-AU', 'en-US'], pref: /serena|martha|kate|fiona|moira|google uk english female/i },
  rex: { label: 'Robotic monotone', gender: 'm', pitch: 0.37, rate: 0.95, volume: 1, wobble: { pitch: 0, rate: 0 }, quirk: 'robot', langs: ['en-US', 'en-GB', 'en-AU'], pref: /zarvox|trinoids|ralph|bad news|fred|alex|junior/i },
  biscuit: { label: 'Helium-squeak dog, repeats the last word', gender: 'f', pitch: 2, rate: 1.5, volume: 1, wobble: { pitch: 0.05, rate: 0.12 }, quirk: 'echo', langs: ['en-US', 'en-AU', 'en-GB'], pref: /tessa|fiona|karen|victoria|allison|ava|google us english/i },
};
const DEFAULT_PROFILE = { label: 'Default', gender: 'm', pitch: 1, rate: 1, volume: 1, wobble: { pitch: 0.05, rate: 0.05 }, quirk: 'none', langs: ['en-GB', 'en-US'], pref: null };

const FEMALE = /luciana|francisca|fernanda|raquel|camila|leticia|catarina|female|woman|samantha|serena|susan|kate|hazel|karen|zira|martha|fiona|moira|tessa|victoria|allison|ava|libby|sonia|amy|emma|joanna|salli|kimberly|nicole|catherine/i;
const MALE = /felipe|antonio|ricardo|eddy|jorge|\bmale\b|daniel|oliver|george|arthur|fred|alex|david|mark|guy|rishi|aaron|ryan|thomas|brian|james|gordon|ralph|lee|reed|ravi|zarvox|trinoids|bad news/i;
const genderOf = (v) => (FEMALE.test(v.name) ? 'f' : MALE.test(v.name) ? 'm' : '?');

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Stable 32-bit string hash (FNV-1a). */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * Rough length of a spoken line in ms: about 13.5 characters a second at rate 1, plus a breath at every pause mark. Used for speech-bubble
 * timing and to size the blip voice; real engines vary by +/- 25 %.
 * @param {string} text @param {number} [rate] utterance rate (1 = normal)
 */
export function estimateSpeechMs(text, rate = 1) {
  const t = String(text ?? '');
  const pauses = (t.match(/\.\.\.|[,;:.!?]/g) ?? []).length;
  return Math.round(300 + (t.length / (13.5 * clamp(rate, 0.1, 4))) * 1000 + pauses * 120);
}

// ---- voice choice ------------------------------------------------------------------------------------------------------------------

/** How well an installed voice suits a persona (higher is better). Pure. */
export function scoreVoice(v, prof, charId) {
  const langs = prof.langs ?? ['en-GB'];
  const lang = String(v.lang || '').replace('_', '-');
  let li = langs.findIndex((l) => lang.toLowerCase() === l.toLowerCase());
  if (li < 0) li = langs.findIndex((l) => lang.toLowerCase().startsWith(l.slice(0, 2).toLowerCase()) && l.length === 2);
  let s = li >= 0 ? 40 - li * 7 : /^en/i.test(lang) ? (/^en/i.test(langs[0]) ? 14 : 4) : -80;         // the persona's accents in order, then any English, then (never, if there is any alternative) another language
  const g = genderOf(v);
  s += g === prof.gender ? 14 : g === '?' ? 4 : -10;
  if (prof.pref && prof.pref.test(v.name)) s += 26;
  if (v.localService === true) s += 6;                                    // local voices honour pitch and rate; some network voices ignore them
  s += (hash32(`${charId}|${v.name}`) % 1000) / 200;                      // stable tie-break: a different voice per character
  return s;
}

/**
 * Pick a browser voice for each character from the voices on offer: each persona's accents first (en-GB, en-US, en-AU ... then any
 * English, then anything), its gender and favourite names, with a stable hash as the tie-break so a character always gets the same
 * voice. Different characters strongly prefer DIFFERENT voices (a used voice costs 60 points, more than any other preference), and then
 * different genders and accents (a gender + accent combination somebody already has costs 9), so the cast spreads over male, female and regional
 * voices where the browser has them; voices are only shared once there are fewer of them than characters (the pitch and rate still differ).
 * The Portuguese speaker chooses first, so nobody takes the only Portuguese voice. Pure function (unit tested).
 * @param {{name:string, lang:string, default?:boolean, localService?:boolean}[]} voices
 * @param {string[]} charIds
 * @param {Record<string, object>} [profiles]
 * @returns {Record<string, object|null>}
 */
export function assignVoices(voices, charIds, profiles = VOICE_PROFILES) {
  const list = (voices || []).filter((v) => v && v.lang && v.name);
  const used = new Map();       // voice name -> times taken
  const flavour = new Map();    // gender|lang -> times taken
  const picked = {};
  const fixedLang = (id) => /^[a-z]{2}(-[A-Za-z]{2})?$/.test((profiles[id] ?? DEFAULT_PROFILE).langs?.[0] ?? '') && !/^en/i.test((profiles[id] ?? DEFAULT_PROFILE).langs[0]);
  const order = [...charIds].sort((a, b) => (fixedLang(a) ? 0 : 1) - (fixedLang(b) ? 0 : 1));
  for (const id of order) {
    const prof = profiles[id] ?? DEFAULT_PROFILE;
    let best = null, bestScore = -1e9;
    for (const v of list) {
      const fl = `${genderOf(v)}|${String(v.lang).toLowerCase()}`;
      const sc = scoreVoice(v, prof, id) - 60 * (used.get(v.name) ?? 0) - 9 * (flavour.get(fl) ?? 0);
      if (sc > bestScore) { best = v; bestScore = sc; }
    }
    if (best) { used.set(best.name, (used.get(best.name) ?? 0) + 1); const fl = `${genderOf(best)}|${String(best.lang).toLowerCase()}`; flavour.set(fl, (flavour.get(fl) ?? 0) + 1); }
    picked[id] = best;
  }
  const out = {};
  for (const id of charIds) out[id] = picked[id] ?? null;
  return out;
}

// ---- delivery quirks -----------------------------------------------------------------------------------------------------------------

const stutterWord = (w, rng) => {
  const m = /^([^A-Za-z]*)([A-Za-z])(.*)$/.exec(w);
  if (!m) return w;
  const n = 1 + Math.floor(rng() * 3);
  return `${m[1]}${m[2]}${`-${m[2].toLowerCase()}`.repeat(n)}-${m[2]}${m[3]}`;
};

/** Shout in capitals, but leave short words alone: some engines spell out a three or four letter word in capitals as an acronym. */
const shoutCase = (t) => t.replace(/[A-Za-z][A-Za-z'’]*/g, (w) => (w.length >= 5 ? w.toUpperCase() : w));

/**
 * Bend the spoken text for a delivery quirk. The bubble always shows the original line; only the speech changes.
 * @param {string} text @param {string} quirk none|shout|boom|stutter|trail|whisper|robot|echo @param {() => number} [rng]
 * @returns {{text: string, rate: number}} rate = multiplier on the persona's rate
 */
export function applyQuirk(text, quirk, rng = Math.random) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  switch (quirk) {
    case 'shout': return { text: shoutCase(t).replace(/[.,;]+$/, '!'), rate: 1 };
    case 'boom': return { text: shoutCase(t).replace(/[.,;]+$/, '!').replace(/, /g, '... '), rate: 1 };
    case 'stutter': {
      const w = t.split(' ');
      if (rng() < 0.9) w[0] = stutterWord(w[0], rng);
      if (w.length > 4 && rng() < 0.6) w[1 + Math.floor(rng() * (w.length - 2))] = '...';        // packet loss: a word goes missing
      if (w.length > 5 && rng() < 0.35) { const i = 2 + Math.floor(rng() * (w.length - 3)); w[i] = stutterWord(w[i], rng); }
      return { text: w.join(' '), rate: 1 };
    }
    case 'trail': {
      const w = t.split(' ');
      if (w.length >= 4) { const keep = Math.max(3, Math.ceil(w.length * (0.55 + rng() * 0.2))); return { text: `${w.slice(0, keep).join(' ').replace(/[.,!?;:]+$/, '')}...`, rate: 0.95 }; }
      return { text: `${t.replace(/[.!?]+$/, '')}...`, rate: 0.95 };
    }
    case 'whisper': return { text: t.replace(/,\s*/g, '... '), rate: 0.92 };
    case 'robot': {
      const w = t.split(' ');
      return { text: w.map((x, i) => (i < w.length - 1 && !/[.,!?;:]$/.test(x) ? `${x},` : x)).join(' '), rate: 1 };
    }
    case 'echo': {
      const m = /([A-Za-z'’-]+)[.!?]*$/.exec(t);
      if (m && rng() < 0.75) return { text: `${t.replace(/[.]$/, '!')} ${m[1]}!`, rate: 1 };
      return { text: t, rate: 1 };
    }
    default: return { text: t, rate: 1 };
  }
}

/**
 * Everything the utterance needs for one line: the (quirked) text plus pitch, rate and volume with this line's random wobble.
 * @param {string} charId @param {string} text @param {{rng?: () => number, volume?: number, gain?: number}} [o]
 * @returns {{text: string, pitch: number, rate: number, volume: number, quirk: string, ms: number}} ms = estimated speaking time
 */
const SPEECH_FLOOR = 0.9;   // even the whisperer is audible
export function utteranceParams(charId, text, { rng = Math.random, volume = 1, gain = 1 } = {}) {
  const prof = VOICE_PROFILES[charId] ?? DEFAULT_PROFILE;
  const q = applyQuirk(text, prof.quirk, rng);
  const wob = (w) => 1 + (rng() * 2 - 1) * w;
  const rate = clamp(prof.rate * q.rate * wob(prof.wobble.rate), 0.5, 2.4);
  return {
    text: q.text,
    pitch: clamp(prof.pitch * wob(prof.wobble.pitch), 0.1, 2),
    rate,
    volume: clamp(volume * Math.max(prof.volume, SPEECH_FLOOR) * gain, 0, 1),   // utterance.volume: speech cannot be routed through WebAudio, so it is as loud as the engine allows (the voice slider only lowers it)
    quirk: prof.quirk,
    ms: estimateSpeechMs(q.text, rate),
  };
}

// ---- the speaker -----------------------------------------------------------------------------------------------------------------------

/** How long to wait for the browser to list its voices before deciding there are none (Chrome loads them late). */
const VOICE_GRACE_S = 2.5;
/** Lines that may wait for the engine, and how long a waiting line stays worth saying. */
export const SPEECH_QUEUE = Object.freeze({ MAX_QUEUE: 3, STALE_AFTER: 2.5, SPEAKER_GAP: 0.4 });

export class SpeechVoice {
  /** @param {{synth?: any, Utterance?: any, now?: () => number, rng?: () => number, deferMs?: number}} [o] injectable for tests */
  constructor({ synth, Utterance, now, rng, deferMs = 30 } = {}) {
    const g = typeof globalThis !== 'undefined' ? globalThis : {};
    this.synth = synth !== undefined ? synth : (g.speechSynthesis ?? null);
    this.Utterance = Utterance ?? g.SpeechSynthesisUtterance ?? null;
    this.now = now ?? (() => Date.now() / 1000);
    this.rng = rng ?? Math.random;
    this.deferMs = deferMs;        // pause before speak() after a cancel (some engines drop a speak() issued in the same tick)
    this.enabled = true;           // every character except Marco
    this.enabledMarco = true;      // Marco's lines that have no recording (on by default)
    this.volume = 1;               // 0..1 (utterance.volume = 1: browser speech cannot be mixed, the voice slider only lowers it)
    this.maxQueue = SPEECH_QUEUE.MAX_QUEUE;      // lines waiting for the one that is speaking
    this.staleAfter = SPEECH_QUEUE.STALE_AFTER;  // s a waiting line stays worth saying
    this.speakerGap = SPEECH_QUEUE.SPEAKER_GAP;  // s before the same speaker may start another line
    this.minGap = 0.2;             // s of quiet between two lines
    this.voices = {};
    this._voicesFor = '';
    this._voiceCount = -1;
    this._queue = [];              // waiting lines (at most maxQueue)
    this._speaking = null;
    this._lastEnd = -1e9;
    this._lastSay = new Map();     // speaker -> time of their last accepted line
    this._pumpTimer = 0;
    this._born = this.now();       // when we started looking for voices
    this._errors = 0;              // consecutive engine errors (synthesis-unavailable and friends)
    this._seenVoices = false;      // the browser has listed at least one voice at some point
    this.spoken = 0;               // counters (tests)
    this.interrupted = 0;          // always 0: a speaking line is never cut off
    this.dropped = 0;              // waiting lines lost (stale, or bumped by more important ones)
    this.last = null;              // parameters of the last utterance (tests, debugging)
    this.lastAccepted = null;      // the line accepted by the last speak() (spoken or queued)
    this.onSpeaking = null;        // (on: boolean) => void when speech starts / stops
    this.onStart = null;           // (line: {charId, text, gain}, params: {text, rate, pitch, ms}) => void when a line actually begins
    this.onEnd = null;             // (line) => void when a line ends
    if (this.synth?.addEventListener) { try { this.synth.addEventListener('voiceschanged', () => { this._voicesFor = ''; this._seenVoices = true; this._errors = 0; }); } catch { /* ignore */ } }
  }

  get supported() { return !!(this.synth && this.Utterance); }

  get busy() { return !!this._speaking; }

  /** Nothing speaking and nothing waiting. */
  get idle() { return !this._speaking && !this._queue.length; }

  /** Lines waiting for their turn. */
  get queued() { return this._queue.length; }

  /**
   * Can speech synthesis really say something right now? False without speechSynthesis, after repeated engine errors, or once the browser has
   * had VOICE_GRACE_S seconds and still lists no voice at all (headless Linux, locked-down webviews): the caller then uses the blip voice.
   */
  get available() {
    if (!this.supported || this._errors >= 2) return false;
    let n = 0;
    try { n = this.synth.getVoices?.().length ?? 0; } catch { /* ignore */ }
    if (n > 0) { this._seenVoices = true; return true; }
    return this._seenVoices || this.now() - this._born < VOICE_GRACE_S;
  }

  setEnabled({ rivals, marco } = {}) {
    if (rivals !== undefined) this.enabled = !!rivals;
    if (marco !== undefined) this.enabledMarco = !!marco;
    if (!this.enabled && !this.enabledMarco) this.cancel();
  }

  /** Is this character's speech switched on in the settings (Marco has his own switch)? */
  isOn(charId) { return charId === 'marco' ? this.enabledMarco : this.enabled; }

  /** @param {number} v 0..1 (voice slider times master) */
  setVolume(v) { this.volume = clamp(Number.isFinite(v) ? v : 0, 0, 1); if (this.volume === 0) this.cancel(); }

  /**
   * The gates every spoken line passes, whichever voice says it (synthesis or blips): volume above zero and audible. (`clipPlaying` is still
   * understood for callers that want it, but the game no longer passes it: speech and recorded clips overlap.)
   * @param {{charId:string, text:string}} bark @param {{clipPlaying?: boolean, gain?: number}} [o]
   */
  permits(bark, { clipPlaying = false, gain = 1 } = {}) {
    return !!bark?.text && !clipPlaying && this.volume > 0 && gain > 0;
  }

  /** Stop everything on purpose (pause, menus, switched off, volume 0): the one thing allowed to silence a speaking line. */
  cancel() {
    const was = !!this._speaking;
    this._queue = []; this._speaking = null;
    try { this.synth?.cancel?.(); } catch { /* ignore */ }
    if (was) this._state(false);
  }

  _state(on) { try { this.onSpeaking?.(on); } catch { /* ignore */ } }

  _pickVoices(ids) {
    let list = [];
    try { list = this.synth?.getVoices?.() ?? []; } catch { /* ignore */ }
    if (!list.length) return;                                  // voices not loaded yet (they arrive late in Chrome): try again on the next line
    const key = ids.join(',');
    if (this._voicesFor === key && this._voiceCount === list.length) return;
    this.voices = assignVoices(list, ids);
    this._voicesFor = key; this._voiceCount = list.length;
  }

  /**
   * Speak a line, or queue it behind the one that is speaking (never cutting that one off). Dropped when speech is off or unsupported, when this
   * speaker has just spoken (anti-spam), or when the queue is full of lines at least as important.
   * @param {{charId:string, text:string}} bark
   * @param {{clipPlaying?: boolean, priority?: number, gain?: number, idleOnly?: boolean}} [o] priority: higher goes first and survives a full queue; gain: 0..1 distance attenuation;
   *   idleOnly: speak only if nothing is speaking or waiting (throwaway interjections: the blips cover them otherwise)
   * @returns {boolean} whether the line was accepted (spoken or queued)
   */
  speak(bark, { clipPlaying = false, priority = 1, gain = 1, idleOnly = false } = {}) {
    if (!this.supported || !this.available || !this.permits(bark, { clipPlaying, gain })) return false;
    if (!this.isOn(bark.charId)) return false;
    const t = this.now();
    if (t - (this._lastSay.get(bark.charId) ?? -1e9) < this.speakerGap) return false;       // gentle per-speaker anti-spam
    const item = { charId: bark.charId, text: String(bark.text).replace(/\s+/g, ' ').slice(0, 160), at: t, prio: priority, gain, startedAt: 0 };
    if (this._speaking || t - this._lastEnd < this.minGap) {
      if (idleOnly && (this._speaking || this._queue.length)) return false;
      const ok = this._enqueue(item);
      if (ok) { this._lastSay.set(bark.charId, t); this.lastAccepted = item; }
      if (ok && !this._speaking) this._schedulePump(Math.max(0, (this.minGap - (t - this._lastEnd)) * 1000) + 5);
      return ok;
    }
    if (idleOnly && this._queue.length) return false;
    this._lastSay.set(bark.charId, t);
    this.lastAccepted = item;
    return this._start(item);
  }

  _fresh(item, t) { return t - item.at <= this.staleAfter; }

  /** Add to the waiting list: stale lines go first, then (when still full) the least important, oldest line, unless the newcomer is less important than all of them. */
  _enqueue(item) {
    const t = this.now();
    const before = this._queue.length;
    this._queue = this._queue.filter((q) => this._fresh(q, t));
    this.dropped += before - this._queue.length;
    if (this._queue.length >= this.maxQueue) {
      let v = 0;
      for (let i = 1; i < this._queue.length; i++) { const a = this._queue[i], b = this._queue[v]; if (a.prio < b.prio || (a.prio === b.prio && a.at < b.at)) v = i; }
      if (item.prio < this._queue[v].prio) { this.dropped++; return false; }
      this._queue.splice(v, 1); this.dropped++;
    }
    this._queue.push(item);
    return true;
  }

  _start(item, { defer = 0 } = {}) {
    const t = this.now();
    if (!this._fresh(item, t)) { this.dropped++; return this._next(); }               // too stale to be worth saying
    this._pickVoices(Object.keys(VOICE_PROFILES));
    const p = utteranceParams(item.charId, item.text, { rng: this.rng, volume: this.volume, gain: item.gain });
    let u;
    try { u = new this.Utterance(p.text); } catch { return false; }
    const v = this.voices[item.charId];
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = VOICE_PROFILES[item.charId]?.fallbackLang ?? 'en-GB';
    u.pitch = p.pitch; u.rate = p.rate; u.volume = p.volume;
    const done = (ok = true) => { if (this._speaking === item) { this._speaking = null; this._lastEnd = this.now(); if (ok) this._errors = 0; try { this.onEnd?.(item); } catch { /* ignore */ } this._state(false); this._next(); } };
    const failed = (e) => {
      const code = e?.error;
      if (code === 'synthesis-unavailable' || code === 'synthesis-failed' || code === 'language-unavailable' || code === 'voice-unavailable') this._errors++;
      done(!/^(synthesis-unavailable|synthesis-failed|language-unavailable|voice-unavailable)$/.test(code ?? ''));
    };
    u.onend = () => done(true); u.onerror = failed;
    item.startedAt = t + defer / 1000;
    this._speaking = item;
    this.spoken++;
    this.last = { charId: item.charId, ...p, voice: v?.name ?? null };
    this._state(true);
    const go = () => {
      if (this._speaking !== item) return;
      try { this.synth.speak(u); } catch { this._speaking = null; this._state(false); return; }
      try { this.onStart?.(item, p); } catch { /* ignore */ }
    };
    if (defer > 0) setTimeoutSafe(go, defer); else go();
    // some browsers never fire onend (background tab, engine glitch): do not get stuck
    setTimeoutSafe(() => { if (this._speaking === item) done(); }, Math.min(9000, 1500 + (p.text.length * 75) / Math.max(0.5, p.rate) + defer));
    return true;
  }

  /** Start the best waiting line that is still fresh: the most important first, the oldest of equals. */
  _next() {
    const t = this.now();
    const before = this._queue.length;
    this._queue = this._queue.filter((q) => this._fresh(q, t));
    this.dropped += before - this._queue.length;
    if (!this._queue.length || this._speaking) return false;
    let b = 0;
    for (let i = 1; i < this._queue.length; i++) { const x = this._queue[i], y = this._queue[b]; if (x.prio > y.prio || (x.prio === y.prio && x.at < y.at)) b = i; }
    const [item] = this._queue.splice(b, 1);
    return this._start(item);
  }

  _schedulePump(ms) {
    if (this._pumpTimer) return;
    this._pumpTimer = setTimeoutSafe(() => { this._pumpTimer = 0; if (!this._speaking) this._next(); }, ms);
  }
}

const setTimeoutSafe = (fn, ms) => { try { const h = setTimeout(fn, ms); h?.unref?.(); return h; } catch { return 0; } };
