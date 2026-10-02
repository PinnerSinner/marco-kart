// AudioManager: the one audio object the game talks to (SPEC.md section 4). All sound is synthesised with WebAudio.
//
//   const audio = new AudioManager();            // subscribes to the bus immediately (attach() is idempotent)
//   audio.unlock();                              // on the first user gesture (also auto-hooked to the first pointer/key/touch)
//   audio.playMusic('menu'); audio.setVolumes({ master, music, sfx, voice });
//   audio.setRacePlayer(kart, rivals?);          // engine of the player + hums of the 3 nearest rivals
//   audio.update(dt, { camera });                // every render frame while racing (optional: karts, throttle)
//   audio.playSfx('boost'); audio.playVoice('voice_go', 'marco');
//
// Graph:  songs -> musicBus \
//         sfx / engines -> sfxBus                              > master -> limiter -> destination
//         clips + blips -> voiceTrim -> voiceBus (compressor + limiter + soft clip) /
//   Nothing ducks anything: the music and the sound effects keep their level whatever is said. The voice sits a few dB over the music thanks to the
//   per-clip loudness normalisation and the voice bus dynamics. Voices OVERLAP freely (see voiceRegistry.js); voiceTrim eases the whole voice
//   bus down a little when three or more sound at once so the sum does not clip.
import { bus } from '../core/bus.js';
import { Assets } from '../core/assets.js';
import { getCharacter } from '../core/roster.js';
import { voiceTakes } from '../core/voicelines.js';
import { SpeechVoice, estimateSpeechMs, VOICE_PROFILES } from './speech.js';
import { BlipVoice } from './blips.js';
import { SFX } from './sfx.js';
import { SONGS } from './music/index.js';
import { SongRunner } from './music/sequencer.js';
import { PlayerEngine, RivalHum, rpmForSpeed } from './engine.js';
import { bufferGain, softClipCurve } from './loudness.js';
import { VoiceRegistry, overlapTrim } from './voiceRegistry.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
// Mix (dBFS RMS before the master): clips are normalised to VOICE_TARGET_RMS (-37 dBFS) going into the voice bus and its two dynamics stages add about
// 13.5 dB of makeup gain (VOICE_MAKEUP_DB, measured), so the voice sits near -24; songs are mixed to about -20 and sit near -29 at the default music
// slider (0.6); item sounds are calibrated to -15 (loudest 150 ms) and sit near -24 at the default sfx slider (0.8). Measured offline with
// tools/mix_check.mjs over the real clips: the voice sits about 5 dB (4 to 6) over the music, and the music never moves (no ducking).
// The blip babble is mixed as the overlapping layer: BLIP_ALONE when it is the only voice of a line, BLIP_LAYER under a spoken (speechSynthesis) line.
export const MIX = Object.freeze({ MUSIC_TRIM: 1.0, SFX_TRIM: 0.8, VOICE_TRIM: 1.0, VOICE_MAKEUP_DB: 13.5, BLIP_ALONE: 1.0, BLIP_LAYER: 0.7 });
const MUSIC_TRIM = MIX.MUSIC_TRIM, SFX_TRIM = MIX.SFX_TRIM, VOICE_TRIM = MIX.VOICE_TRIM;
const ENGINE_TRIM = 0.9;
const MAX_VOICES = 34;           // concurrent one-shot sfx (low-value ones are dropped beyond this)
const HEARING_RANGE = 85;        // metres: further away than this a rival's sfx is not played
const RIVAL_SLOTS = 3;
const OWN_RADIUS = 5;            // metres: an item sound this close to the player's kart is the player's own (or lands on them) and plays centred

/** perceptual volume curve for the 0..1 sliders */
const curve = (v) => { const x = clamp(Number.isFinite(v) ? v : 0, 0, 1); return x * x; };

export class AudioManager {
  /** @param {{autoAttach?: boolean}} [opts] */
  constructor({ autoAttach = true } = {}) {
    this.ctx = null;
    this.unlocked = false;
    this.volumes = { master: 0.8, music: 0.6, sfx: 0.8, voice: 1 };
    this._offs = [];
    this._gestureOff = null;
    this._pendingMusic = null;
    this._music = null;                 // { key, runner, gain, timer }
    this._intensity = 0;
    this._lastPlay = new Map();         // sfx name -> ctx time of last play
    this._active = [];                  // end times of playing one-shots
    this._warned = new Set();
    this.player = null; this.rivals = []; this.karts = new Map();
    this._engine = null; this._hums = []; this._camera = null;
    this._cam = { x: 0, y: 0, z: 0, rx: 1, rz: 0, ready: false };
    this._paused = false; this._starNext = 0; this._lastRoulette = null;
    this._speechOn = false; this._clipGains = new WeakMap();
    this._lastTake = new Map();
    this.voices = new VoiceRegistry();     // every sounding voice (recorded clips, blip babble): free to overlap, capped, anti-spam per speaker
    this.speech = new SpeechVoice();      // browser speech synthesis: every character's barks, and Marco's lines that have no recording (one utterance at a time, queued)
    this.speech.onSpeaking = (on) => { this._speechOn = !!on; };
    this.blips = new BlipVoice({ ctx: () => this.ctx, dest: () => this.voiceTrim, registry: this.voices });   // procedural gibberish voice: the overlapping layer (and the voice where there is no speech engine)
    this.blips.onChange = () => this._trimVoices();
    this.blipLayer = true;                // Settings 'Blip voices' (default on): a blip babble for every line, on top of whatever speech is going on
    this._speakBlips = new Map();         // utterance item -> blip line handle (faded when the utterance ends)
    this.speech.onEnd = (item) => { const h = this._speakBlips.get(item); this._speakBlips.delete(item); if (h && h.end > (this.ctx?.currentTime ?? 0) + 0.3) h.stop(0.12); };
    this._lastUpdate = 0;
    if (autoAttach) this.attach();
  }

  // ---- lifecycle --------------------------------------------------------------------------------------------------------------

  /** Create / resume the AudioContext. Must be called from a user gesture at least once; safe to call repeatedly. */
  unlock() {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this._warn('no-webaudio', 'WebAudio is not available: the game will be silent'); return false; }
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { this._warn('ctx', `AudioContext failed: ${e.message}`); return false; }
      this._buildGraph();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.unlocked) {
      this.unlocked = true;
      if (this._pendingMusic) { const p = this._pendingMusic; this._pendingMusic = null; this.playMusic(p.key, p.opts); }
      if (this.player) this._ensureEngine();
      this._preloadClips();
    }
    return true;
  }

  /** Decode the clips heard first (countdown, title greeting, character pick, hit, boost) so the first play has no decode delay; the rest decode on first use. */
  _preloadClips() {
    const first = ['ready', 'go', 'menu_welcome', 'select_me', 'hit', 'boost'].filter((k) => Assets.has(`voice_${k}`));
    first.forEach((k, i) => setTimeout(() => { if (this.ctx) Assets.audioBuffer(`voice_${k}`, this.ctx).catch(() => {}); }, 300 + i * 250));
  }

  /** Subscribe to bus events (see SPEC section 6) and start listening for the first user gesture. Idempotent. */
  attach() {
    if (this._offs.length) return;
    const on = (n, fn) => this._offs.push(bus.on(n, fn));
    on('sfx', (d) => d && this._onSfxEvent(d));
    on('voice', (d) => d && this.playVoice(d.key, d.charId));
    on('bark', (d) => this._onBark(d));
    on('music', (d) => d && d.key && this.playMusic(d.key));
    on('race:countdown', (d) => { if (d && d.n > 0) this.playSfx('countdown-tick', { pitch: 1 }); else if (d && d.n === 0) this.playSfx('countdown-go'); });
    on('race:lap', (d) => { if (d && d.isPlayer && !d.final) this.playSfx('lap-chime'); });
    on('race:final-lap', () => { this.playSfx('final-lap'); this.setMusicIntensity(1); });
    on('race:finish', (d) => this._onFinish(d));
    on('race:overtake', (d) => { if (d && d.isPlayer) this.playSfx('overtake'); });
    on('race:wrong-way', (d) => { if (d && d.on) this.playSfx('ui-error'); });
    on('kart:drift-start', (d) => d && this._kartSfx(d.id, 'drift-spark', { volume: 0.8 }));
    on('kart:drift-level', (d) => d && this._kartSfx(d.id, 'drift-level', { pitch: [1, 1, 1.26, 1.5][clamp(d.level | 0, 0, 3)], volume: 0.9 }));
    on('kart:boost', (d) => this._onBoost(d));
    on('kart:perfect-jump', (d) => d && this._kartSfx(d.id, 'perfect-jump', { volume: 0.95 }));
    on('kart:wall-hit', (d) => d && this._kartSfx(d.id, 'wall-hit', { volume: 0.4 + 0.6 * clamp(d.impact ?? 0.5, 0, 1), pitch: 1.1 - 0.25 * clamp(d.impact ?? 0.5, 0, 1) }));
    on('kart:bump', (d) => d && this._kartSfx(d.id, 'bump', { volume: 0.4 + 0.6 * clamp(d.impact ?? 0.5, 0, 1) }));
    on('kart:land', (d) => d && this._kartSfx(d.id, 'land', { volume: 0.3 + 0.7 * clamp(d.impact ?? 0.5, 0, 1) }));
    on('kart:surface', (d) => { if (d && d.surface === 'water') this._kartSfx(d.id, 'splash'); });
    on('kart:spin', (d) => d && this._kartSfx(d.id, 'spin'));
    on('kart:shrink', (d) => d && this._kartSfx(d.id, 'shrink'));
    on('kart:fall', (d) => d && this._kartSfx(d.id, 'fall'));
    on('kart:respawn', (d) => d && this._kartSfx(d.id, 'respawn', { volume: 0.7 }));
    on('item:box', (d) => d && this._kartSfx(d.id, 'box-pickup', { volume: 0.8 }));
    on('item:roulette', (d) => this._onRoulette(d));
    on('item:get', (d) => { if (d && this._isPlayer(d.id)) this.playSfx('item-get'); });
    // every item has its own `item-use-<id>`. ItemManager also emits it as an `sfx` event; whichever arrives first plays and the repeat falls inside the gap.
    // The capacitor (pitched by its charge) and the firewall pop (the shield-break cue covers it) come only through those other events.
    on('item:use', (d) => { if (d && d.item !== 'capacitor' && d.item !== 'firewall') this._kartSfx(d.id, SFX[`item-use-${d.item}`] ? `item-use-${d.item}` : 'item-use', { pos: d.pos, pitch: d.fire && d.item === 'legacy' ? 1.3 : 1 }); });
    on('item:hit', (d) => this._onItemHit(d));
    on('item:block', (d) => d && this._kartSfx(d.id, 'item-block'));
    on('item:end', (d) => { if (d && SFX[`item-end-${d.item}`]) this._kartSfx(d.id, `item-end-${d.item}`, { volume: 0.9 }); });             // timed effect over (sudo, fibre, vpn, autoscale, pods, legacy, bandwidth, zoomies)
    on('item:shield-break', (d) => d && this._kartSfx(d.id, d.kind === 'pods' ? 'item-end-pods' : 'item-end-firewall'));
    on('ui:pause', () => this.setPaused(true));
    for (const n of ['ui:resume', 'ui:restart', 'ui:quit']) on(n, () => this.setPaused(false));
    if (typeof window !== 'undefined' && !this.unlocked) {
      const hook = () => { this.unlock(); if (this.unlocked) unhook(); };
      const evs = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];
      const unhook = () => { for (const e of evs) window.removeEventListener(e, hook, true); this._gestureOff = null; };
      for (const e of evs) window.addEventListener(e, hook, true);
      this._gestureOff = unhook;
    }
    if (typeof document !== 'undefined') {
      const vis = () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend().catch(() => {});
        else if (this.unlocked) this.ctx.resume().catch(() => {});
      };
      document.addEventListener('visibilitychange', vis);
      this._offs.push(() => document.removeEventListener('visibilitychange', vis));
    }
  }

  /** Unsubscribe from the bus (sound already playing carries on). */
  detach() {
    for (const off of this._offs) off();
    this._offs = [];
    if (this._gestureOff) this._gestureOff();
  }

  /** Stop everything and release the AudioContext. */
  dispose() {
    this.detach();
    this.stopMusic({ fadeOut: 0 });
    this._stopEngine(true);
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
    this.unlocked = false;
  }

  // ---- volumes ------------------------------------------------------------------------------------------------------------------

  /** @param {{master?:number, music?:number, sfx?:number, voice?:number}} v each 0..1 */
  setVolumes(v = {}) {
    for (const k of ['master', 'music', 'sfx', 'voice']) if (Number.isFinite(v[k])) this.volumes[k] = clamp(v[k], 0, 1);
    this._applyVolumes();
    // speechSynthesis cannot go through WebAudio (no bus, no normalisation, no way to line it up with the music): utterance.volume stays at 1 and
    // the slider only lowers it below half way.
    this.speech.setVolume(Math.min(1, 2 * this.volumes.voice * this.volumes.master));
  }

  /**
   * Speech switches: `rivals` (every character but Marco), `marco` (his lines that have no recording), `blips` (the blip-voice layer).
   * @param {{rivals?: boolean, marco?: boolean, blips?: boolean}} o
   */
  setSpeech(o = {}) {
    this.speech.setEnabled(o);
    if (o.blips !== undefined) { this.blipLayer = !!o.blips; if (!o.blips) this.blips.stop(0.1); }
  }

  /** Silence every spoken line at once (pause, menus): speech synthesis and blips. Recorded clips play to their end. */
  cancelSpeech() { this.speech.cancel(); this.blips.stop(0.06); this._speakBlips.clear(); this._trimVoices(); }

  /**
   * Bark from the dialogue director: Marco's recording when the line has one, else speech synthesis (every character, per the settings) and/or
   * the blip babble. Nothing cuts anything off: recordings, blip lines and speech overlap (browser speech is one utterance at a time, queued, and
   * the blips are the layer that overlaps); distant rivals are quieter; throwaway interjections are blips (or an idle browser voice), never queued.
   */
  _onBark(d) {
    if (!d || !d.text) return;
    if (d.clip && d.key) {
      this.playVoice(d.key, 'marco', { force: !!d.menu }).catch(() => false);
      return;
    }
    if (!this.unlocked) return;
    const gain = this._speechGain(d);
    const o = { priority: (d.prio ?? 1) + (d.isPlayer ? 1 : 0), gain };
    if (!this.speech.permits(d, o)) return;
    const on = this.speech.isOn(d.charId);
    const throwaway = d.category === 'throwaway';
    const viaSpeech = on && this.speech.available;
    const accepted = viaSpeech && this.speech.speak(d, { ...o, idleOnly: throwaway });
    const item = accepted ? this.speech.lastAccepted : null;
    const speakingNow = !!item && this.speech._speaking === item;
    // the blip babble is always allowed to overlap: with 'Blip voices' on it accompanies every line (under the browser voice when that speaks right
    // now, on its own while the line waits in the queue); without a speech engine (or voice) it IS the voice
    if (this.blipLayer || (on && !viaSpeech)) {
      const ms = estimateSpeechMs(d.text, VOICE_PROFILES[d.charId]?.rate ?? 1);
      const level = gain * (speakingNow ? MIX.BLIP_LAYER : MIX.BLIP_ALONE);
      const h = this.blips.start(d, { gain: level, durationMs: ms, force: !!d.menu });
      if (h && speakingNow) this._speakBlips.set(item, h);
    }
  }

  /** 1 for the player's own lines and close rivals, fading to 0.45 for a rival on the far side of the track. */
  _speechGain(d) {
    if (d.isPlayer || d.menu || !this._cam.ready) return 1;
    const k = this.karts.get(d.id);
    if (!k?.pos) return 0.8;
    const dx = k.pos.x - this._cam.x, dz = k.pos.z - this._cam.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return clamp(1 - (dist - 25) / 160, 0.45, 1);
  }

  /** Is any voice speaking right now: a recorded clip, speech synthesis or the blip babble? */
  get voiceActive() { return this._speechOn || this.voiceCount > 0; }

  /** Recorded clips and blip lines sounding right now (speech synthesis is outside the mix and not counted). */
  get voiceCount() { return this.ctx ? this.voices.count(this.ctx.currentTime) : 0; }

  /** Ease the voice bus down while three or more voices overlap (1 / sqrt(n/2)), and back up as they end. */
  _trimVoices() {
    if (!this.ctx || !this.voiceTrim) return;
    const t = this.ctx.currentTime, g = overlapTrim(this.voices.count(t));
    const p = this.voiceTrim.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.setTargetAtTime(g, t, g < p.value ? 0.02 : 0.15);
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, V = this.volumes;
    this.master.gain.setTargetAtTime(curve(V.master), t, 0.03);
    this.musicBus.gain.setTargetAtTime(curve(V.music) * MUSIC_TRIM, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(curve(V.sfx) * SFX_TRIM, t, 0.03);
    this.voiceBus.gain.setTargetAtTime(curve(V.voice) * VOICE_TRIM, t, 0.03);
  }

  _buildGraph() {
    const c = this.ctx;
    this.master = c.createGain();
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -5; this.limiter.knee.value = 4; this.limiter.ratio.value = 14; this.limiter.attack.value = 0.003; this.limiter.release.value = 0.16;
    this.master.connect(this.limiter); this.limiter.connect(c.destination);
    this.musicBus = c.createGain(); this.sfxBus = c.createGain(); this.voiceBus = c.createGain(); this.voiceTrim = c.createGain();
    this.voiceTrim.connect(this.voiceBus);          // every voice enters here: the overlap trim lives on this node
    this.engineBus = c.createGain(); this.engineBus.gain.value = ENGINE_TRIM; this.engineBus.connect(this.sfxBus);
    // the voice: its own bus with a gentle compressor (evens out the takes) then a brick-wall-ish limiter, so it can be loud and never clips
    this.voiceComp = c.createDynamicsCompressor();
    this.voiceComp.threshold.value = -16; this.voiceComp.knee.value = 10; this.voiceComp.ratio.value = 3; this.voiceComp.attack.value = 0.004; this.voiceComp.release.value = 0.16;
    this.voiceLimiter = c.createDynamicsCompressor();
    this.voiceLimiter.threshold.value = -3; this.voiceLimiter.knee.value = 0; this.voiceLimiter.ratio.value = 20; this.voiceLimiter.attack.value = 0.001; this.voiceLimiter.release.value = 0.08;
    this.voiceClip = c.createWaveShaper(); this.voiceClip.curve = softClipCurve(0.9);        // last line of defence: nothing from the voice passes 0.9
    this.voiceBus.connect(this.voiceComp); this.voiceComp.connect(this.voiceLimiter); this.voiceLimiter.connect(this.voiceClip); this.voiceClip.connect(this.master);
    this.musicBus.connect(this.master); this.sfxBus.connect(this.master);
    this._applyVolumes();
  }

  // ---- music ----------------------------------------------------------------------------------------------------------------------

  /**
   * Start a music track (crossfades from the current one). Playing the key that is already playing does nothing.
   * @param {'menu'|'copacabana'|'blighty'|'datacentre'|'marcoverse'|'results'|'podium'} key
   * @param {{fadeIn?: number}} [opts] fade-in seconds (default 0.8)
   */
  playMusic(key, opts = {}) {
    if (!SONGS[key]) { this._warn(`music:${key}`, `unknown music key "${key}"`); return; }
    if (!this.ctx || !this.unlocked) { this._pendingMusic = { key, opts }; return; }
    if (this._music && this._music.key === key) return;
    const fadeIn = opts.fadeIn ?? 0.8;
    this._stopSong(this._music, Math.min(fadeIn, 1.2) || 0.2);
    const c = this.ctx, now = c.currentTime;
    const gain = c.createGain();
    gain.gain.setValueAtTime(fadeIn > 0 ? 0 : 1, now);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(1, now + fadeIn);
    gain.connect(this.musicBus);
    const runner = new SongRunner(c, gain, SONGS[key], { seed: 7 });
    this._intensity = 0; runner.setIntensity(0);
    runner.start(now + 0.1);
    const m = { key, runner, gain, timer: null };
    const pump = () => runner.pump(c.currentTime + (typeof document !== 'undefined' && document.hidden ? 2 : 0.35));
    pump();
    m.timer = setInterval(pump, 40);
    this._music = m;
  }

  /** @param {{fadeOut?: number}} [opts] seconds (default 1) */
  stopMusic({ fadeOut = 1 } = {}) {
    this._pendingMusic = null;
    this._stopSong(this._music, fadeOut);
    this._music = null;
  }

  _stopSong(m, fadeOut) {
    if (!m || !this.ctx) return;
    clearInterval(m.timer);
    const c = this.ctx, now = c.currentTime;
    m.gain.gain.cancelScheduledValues(now);
    m.gain.gain.setValueAtTime(m.gain.gain.value, now);
    m.gain.gain.linearRampToValueAtTime(0, now + Math.max(0.02, fadeOut));
    setTimeout(() => { try { m.gain.disconnect(); } catch { /* gone */ } }, (Math.max(0.02, fadeOut) + 4) * 1000);
  }

  /** 0..1: raises tempo (up to +7 %) and energy (filters open, extra layers) of the running track. */
  setMusicIntensity(v) {
    this._intensity = clamp(Number.isFinite(v) ? v : 0, 0, 1);
    if (this._music) this._music.runner.setIntensity(this._intensity);
  }

  /** Key of the track currently playing (or pending until unlock), or null. */
  get musicKey() { return this._music?.key ?? this._pendingMusic?.key ?? null; }

  // ---- sfx ------------------------------------------------------------------------------------------------------------------------

  /**
   * Play a synthesised effect. With `pos` (world position) it is panned and attenuated relative to the camera.
   * @param {string} name one of the SPEC names @param {{pos?:{x:number,y:number,z:number}, volume?:number, pitch?:number}} [o]
   * @returns {boolean} true if the sound was started
   */
  playSfx(name, { pos, volume = 1, pitch = 1 } = {}) {
    const def = SFX[name];
    if (!def) { this._warn(`sfx:${name}`, `unknown sfx "${name}"`); return false; }
    const c = this.ctx;
    if (!c || !this.unlocked || c.state !== 'running') return false;
    const now = c.currentTime;
    const last = this._lastPlay.get(name);
    if (last !== undefined && now - last < (def.gap ?? 0.02)) return false;
    this._active = this._active.filter((e) => e > now);
    if (this._active.length >= MAX_VOICES && name.startsWith('ui-') === false && !['countdown-tick', 'countdown-go', 'finish', 'win-fanfare', 'lose-sting', 'final-lap'].includes(name)) return false;
    let gain = clamp(Number.isFinite(volume) ? volume : 1, 0, 2), pan = 0;
    if (pos && this._cam.ready) {
      const sp = this._spatial(pos);
      if (!sp) return false;
      gain *= sp.gain; pan = sp.pan;
    }
    if (gain < 0.01) return false;
    const g = c.createGain(); g.gain.value = gain;
    let head = g;
    if (pan) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); head = p; }
    head.connect(this.sfxBus);
    def.play(c, g, now + 0.004, { pitch: clamp(Number.isFinite(pitch) ? pitch : 1, 0.25, 4), vol: 1 });
    this._lastPlay.set(name, now);
    this._active.push(now + def.dur);
    return true;
  }

  // ---- voice ------------------------------------------------------------------------------------------------------------------------

  /**
   * Play one of Marco's recorded voice lines (assets `voice_*`). Plays nothing when the clip is missing.
   * Clips overlap with everything: another clip, the blip babble, speech synthesis. Nothing is cut off; the only gates are the gentle per-speaker
   * anti-spam gap (0.4 s) and the global cap of simultaneous voices (the quietest / oldest one is dropped with a short fade).
   * @param {string} key 'voice_go' or just 'go' @param {string} [charId] other characters try `voice_<voiceKey>_<name>`
   * @param {{maxSec?: number, force?: boolean}} [opts] maxSec: stop (with a fade) after this many seconds; force: skip the anti-spam gap (menu lines)
   * @returns {Promise<boolean>} true if a clip started
   */
  async playVoice(key, charId, opts = {}) {
    if (!key || !this.ctx || !this.unlocked) return false;
    const name = String(key).replace(/^voice_/, '');
    let asset = `voice_${name}`;
    if (charId && charId !== 'marco') {
      const vk = getCharacter(charId)?.voiceKey;
      if (!vk || vk === 'marco') return false;
      asset = `voice_${vk}_${name}`;
    }
    if (!Assets.has(asset)) return false;
    if (asset === `voice_${name}`) {          // Marco: several takes (voice_x, voice_x_2, ...) are picked at random, never the same one twice in a row
      const takes = voiceTakes(Assets, name);
      if (takes.length > 1) { const last = this._lastTake.get(name); const pool = takes.filter((k) => k !== last); asset = pool[Math.floor(Math.random() * pool.length)]; }
      this._lastTake.set(name, asset);
    }
    const c = this.ctx;
    const buf = await Assets.audioBuffer(asset, c);
    if (!buf || !this.ctx || !this.voiceTrim) return false;
    return this._startClip(buf, charId || 'marco', opts);
  }

  /** Start a decoded clip as one more voice (the part of playVoice that needs no assets: unit tested with a mock context). @returns {boolean} */
  _startClip(buf, speaker = 'marco', opts = {}) {
    const c = this.ctx;
    const now = c.currentTime;
    const cap = opts.maxSec ?? Infinity;
    const len = Math.min(buf.duration, cap);
    const src = c.createBufferSource(); src.buffer = buf;
    const norm = this._clipGain(buf);          // per-clip loudness normalisation (clips were recorded at very different levels)
    const g = c.createGain(); g.gain.setValueAtTime(norm, now);
    const stop = (sec = 0.06) => {             // dropped for the voice cap: fade out quietly
      try { const t = c.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + sec); src.stop(t + sec + 0.02); } catch { /* already ended */ }
    };
    const adm = this.voices.admit({ charId: speaker, level: opts.level ?? 1, now, end: now + 0.01 + len, stop, force: !!opts.force });
    if (!adm) return false;
    src.connect(g); g.connect(this.voiceTrim);
    src.start(now + 0.01);
    if (buf.duration > cap) {                  // fade out and stop at the cap
      const f = 0.35;
      g.gain.setValueAtTime(norm, now + 0.01 + Math.max(0, len - f));
      g.gain.linearRampToValueAtTime(0, now + 0.01 + len);
      src.stop(now + 0.01 + len + 0.03);
    }
    src.onended = () => { this.voices.release(adm.voice); this._trimVoices(); };
    this._trimVoices();
    return true;
  }

  /** Normalisation gain of a decoded clip, measured once per buffer. */
  _clipGain(buf) {
    let g = this._clipGains.get(buf);
    if (g === undefined) { try { g = bufferGain(buf); } catch { g = 1; } this._clipGains.set(buf, g); }
    return g;
  }

  // ---- race engine ---------------------------------------------------------------------------------------------------------------------

  /**
   * Set (or clear with null) the kart whose engine the player hears, and optionally the rivals for the positional hums.
   * @param {object|null} kart KartPhysics-like @param {object[]} [rivals] all other karts
   */
  setRacePlayer(kart, rivals) {
    this.player = kart ?? null;
    if (Array.isArray(rivals)) this.setRivals(rivals);
    this._rebuildKartMap();
    if (!kart) { this._stopEngine(false); return; }
    if (this.unlocked) this._ensureEngine();
  }

  /** @param {object[]} karts every other racer (used for the 3 nearest engine hums and for positional sfx) */
  setRivals(karts) { this.rivals = karts.filter((k) => k && k !== this.player); this._rebuildKartMap(); }

  _rebuildKartMap() {
    this.karts.clear();
    for (const k of this.rivals) this.karts.set(k.id, k);
    if (this.player) this.karts.set(this.player.id, this.player);
  }

  _ensureEngine() {
    if (!this.ctx || this._engine) return;
    const t = this.ctx.currentTime;
    this._engine = new PlayerEngine(this.ctx, this.engineBus, t);
    this._engine.setLevel(t, this._paused ? 0 : 1, 0.01);
    this._hums = Array.from({ length: RIVAL_SLOTS }, () => new RivalHum(this.ctx, this.engineBus, t));
  }

  _stopEngine(now) {
    if (!this._engine || !this.ctx) return;
    const eng = this._engine, hums = this._hums, t = this.ctx.currentTime;
    this._engine = null; this._hums = [];
    eng.setLevel(t, 0, now ? 0.005 : 0.2);
    for (const h of hums) h.amp.gain.setTargetAtTime(0, t, now ? 0.005 : 0.2);
    setTimeout(() => { const t2 = this.ctx ? this.ctx.currentTime : 0; eng.stop(t2); for (const h of hums) h.stop(t2); }, now ? 60 : 1200);
  }

  /**
   * Per-frame update: player engine, rival hums, listener position, invincibility loop.
   * @param {number} dt seconds @param {{camera?: object, karts?: object[], throttle?: number}} [o]
   */
  update(dt, { camera, karts } = {}) {
    const c = this.ctx;
    if (!c || !this.unlocked || c.state !== 'running') return;
    if (camera) this._setCamera(camera);
    if (karts && karts !== this._kartsRef) { this._kartsRef = karts; this.setRivals(karts); }
    const t = c.currentTime;
    const k = this.player;
    if (k && this._engine && !this._paused) {
      this._engine.update(t, k, dt);
      this._updateHums(t, k);
      const st = k.status;
      if (st && st.invincible > 1.65 && st.respawning <= 0) {
        if (t >= this._starNext) { this._lastPlay.delete('star-loop'); this.playSfx('star-loop', { volume: 0.8 }); this._starNext = t + 1.2; }
      } else this._starNext = 0;
    }
  }

  _setCamera(cam) {
    const m = cam.matrixWorld?.elements;
    if (!m) return;
    const C = this._cam;
    C.x = m[12]; C.y = m[13]; C.z = m[14];
    C.rx = m[0]; C.rz = m[2];
    C.ready = true;
  }

  _updateHums(t, player) {
    const hums = this._hums;
    if (!hums.length) return;
    const C = this._cam;
    const px = C.ready ? C.x : player.pos.x, pz = C.ready ? C.z : player.pos.z;
    // nearest rivals by distance to the listener
    const cand = [];
    for (const r of this.rivals) {
      const dx = r.pos.x - px, dz = r.pos.z - pz;
      cand.push({ r, d: Math.sqrt(dx * dx + dz * dz), dx, dz });
    }
    cand.sort((a, b) => a.d - b.d);
    const top = cand.slice(0, hums.length);
    const want = new Set(top.map((e) => e.r.id));
    for (const h of hums) if (h.id !== null && !want.has(h.id)) h.id = null;
    for (const e of top) {
      let h = hums.find((x) => x.id === e.r.id);
      if (!h) { h = hums.find((x) => x.id === null); if (!h) continue; h.id = e.r.id; }
      const top_ = e.r.params?.top ?? 33;
      const sf = clamp(Math.abs(e.r.speed) / top_, 0, 1.3);
      const att = 1 / (1 + (e.d / 16) * (e.d / 16));
      const pan = C.ready ? clamp((e.dx * C.rx + e.dz * C.rz) / Math.max(4, e.d), -1, 1) * 0.85 : 0;
      h.set(t, rpmForSpeed(sf), e.d > 90 ? 0 : att, pan);
    }
    for (const h of hums) if (h.id === null) h.amp.gain.setTargetAtTime(0, t, 0.1);
  }

  /** Pause: the engines stop (the music and the voices carry on at their level). */
  setPaused(on) {
    this._paused = !!on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this._engine) this._engine.setLevel(t, on ? 0 : 1, 0.05);
    for (const h of this._hums) if (on) h.amp.gain.setTargetAtTime(0, t, 0.05);
  }

  // ---- bus reactions ----------------------------------------------------------------------------------------------------------------------

  _isPlayer(id) { return !!this.player && id === this.player.id; }

  /** Play `name` for a kart id: centred for the player, positional for a known rival, ignored for unknown ids. */
  _kartSfx(id, name, o = {}) {
    if (id === undefined || id === null) return this.playSfx(name, o);
    if (this._isPlayer(id)) return this.playSfx(name, { volume: o.volume, pitch: o.pitch });
    const k = this.karts.get(id);
    const pos = o.pos ?? (k ? k.pos : null);
    if (!pos) return false;
    return this.playSfx(name, { pos, volume: (o.volume ?? 1) * 0.8, pitch: o.pitch });
  }

  _onBoost(d) {
    if (!d || d.kind === 'jump') return;                          // a perfect take-off has its own sound (perfect-jump)
    const name = d.kind === 'pad' ? 'pad-boost' : d.kind === 'drift' ? 'mini-turbo' : 'boost';
    this._kartSfx(d.id, name, { volume: d.kind === 'start' ? 0.9 : 1, pitch: d.kind === 'fibre' ? 1.25 : 1 });
  }

  _onFinish(d) {
    if (!d || !d.isPlayer) return;
    this.playSfx('finish');
    const t = this.ctx ? this.ctx.currentTime : 0;
    setTimeout(() => { if (this.ctx && this.ctx.currentTime >= t) this.playSfx(d.place <= 3 ? 'win-fanfare' : 'lose-sting', { volume: 0.9 }); }, 900);
  }

  _onRoulette(d) {
    if (!d || !this._isPlayer(d.id)) return;
    if (d.done) { this._lastRoulette = null; this.playSfx('roulette-land'); return; }
    if (d.shown !== this._lastRoulette) { this._lastRoulette = d.shown; this.playSfx('roulette-tick', { pitch: 0.95 + Math.random() * 0.1 }); }
  }

  /** A bus `sfx` event. Item sounds that start on the player's own kart are always played centred and clear; other karts' are positional. */
  _onSfxEvent(d) {
    if (!d.pos || !this.player?.pos || !/^(item|egg)-/.test(d.name)) return this.playSfx(d.name, d);
    const p = this.player.pos, dx = d.pos.x - p.x, dz = d.pos.z - p.z;
    return this.playSfx(d.name, dx * dx + dz * dz < OWN_RADIUS * OWN_RADIUS ? { ...d, pos: undefined } : d);
  }

  /** The victim's hit sound: `item-hit-<id>` (the same name ItemManager's own sfx event uses, so the repeat inside the gap is dropped). */
  _onItemHit(d) {
    if (!d) return;
    const name = `item-hit-${d.item}`;
    this._kartSfx(d.victimId, SFX[name] ? name : 'item-hit');
  }

  _warn(key, msg) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(`[audio] ${msg}`);
  }

  /** Spatial gain / pan for a world position relative to the camera, or null when out of earshot. */
  _spatial(pos) {
    const C = this._cam;
    const dx = pos.x - C.x, dz = pos.z - C.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > HEARING_RANGE) return null;
    return { gain: 1 / (1 + (d / 16) * (d / 16)) + 0.04, pan: clamp((dx * C.rx + dz * C.rz) / Math.max(4, d), -1, 1) * 0.85 };
  }
}
