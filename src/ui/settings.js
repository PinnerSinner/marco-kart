// Settings model: defaults, validation, persistence and the `ui:settings` bus payload. Node-safe.
import { bus } from '../core/bus.js';
import { clamp01 } from '../core/util.js';
import { resolveSpeedClass, DEFAULT_SPEED_CLASS } from '../core/speedClass.js';

export const QUALITIES = ['low', 'medium', 'high'];
export const UNITS = ['kmh', 'mph'];
export const SHAKE_LEVELS = [{ id: 'off', value: 0 }, { id: 'low', value: 0.5 }, { id: 'full', value: 1 }];

/** @returns {boolean} true when the device reports touch input (safe outside a browser) */
export function detectTouch() {
  try {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  } catch {
    return false;
  }
}

/**
 * Default sliders of the mix (the music keeps its own constant level; Marco's recorded lines sit a few dB over it, whatever the sliders).
 * `mixV` in stored settings says which mix they were saved under: 1 = the original (master 0.8, music 0.6, sfx 0.8), 2 = the louder-voices mix
 * (master 0.85, music 0.6, sfx 0.65, voice 1), 3 = back to master 0.8 / music 0.6 / sfx 0.8 with a moderate voice boost and no ducking.
 */
export const MIX_DEFAULTS = Object.freeze({ master: 0.8, music: 0.6, sfx: 0.8, voice: 1 });
export const MIX_VERSION = 3;
/** The defaults of mix 2 (the louder-voices one): a stored value that is still exactly this was put there by that migration, not chosen by the player. */
const MIX2_DEFAULTS = Object.freeze({ master: 0.85, music: 0.6, sfx: 0.65 });

/**
 * One-time migrations of the stored volumes (each runs once: `mixV` is bumped to MIX_VERSION).
 *  - before mix 2: the voice goes to its default (unless it was muted), music and effects come down to the mix 2 levels if they were louder,
 *    master goes up to it if it was lower (what the louder-voices change did); then the mix 3 step below follows.
 *  - mix 2 to 3: music, effects and master that still sit exactly on the mix 2 defaults (put there by the louder-voices migration, which turned
 *    the effects down and the master up) go back to the defaults 0.6 / 0.8 / 0.8. Any other value is something the player chose and is kept.
 *    Blip voices (the overlapping voice layer) are switched on once.
 * Everything else is kept.
 * @param {any} raw stored settings @returns {any} a migrated copy
 */
export function migrateMix(raw) {
  if (!raw || typeof raw !== 'object' || raw.mixV >= MIX_VERSION) return raw;
  const vol = raw.volume && typeof raw.volume === 'object' ? { ...raw.volume } : {};
  const n = (k) => (Number.isFinite(Number(vol[k])) && vol[k] != null ? Number(vol[k]) : null);
  if (!(raw.mixV >= 2)) {
    if (n('voice') !== 0) vol.voice = MIX_DEFAULTS.voice;
    if (n('music') !== null) vol.music = Math.min(n('music'), MIX2_DEFAULTS.music);
    if (n('sfx') !== null) vol.sfx = Math.min(n('sfx'), MIX2_DEFAULTS.sfx);
    if (n('master') !== null) vol.master = Math.max(n('master'), MIX2_DEFAULTS.master);
  }
  for (const k of ['master', 'music', 'sfx']) if (n(k) !== null && Math.abs(Number(vol[k]) - MIX2_DEFAULTS[k]) < 1e-9) vol[k] = MIX_DEFAULTS[k];
  return { ...raw, volume: vol, blips: true, mixV: MIX_VERSION };
}

/**
 * Fresh default settings.
 * @param {boolean} [touch] initial value of the touch-controls switch
 * @returns {{ volume: {master:number, music:number, sfx:number, voice:number}, quality: string, cameraShake: number, touch: boolean, units: string }}
 */
export function defaultSettings(touch = detectTouch()) {
  return { volume: { master: MIX_DEFAULTS.master, music: MIX_DEFAULTS.music, sfx: MIX_DEFAULTS.sfx, voice: MIX_DEFAULTS.voice }, quality: 'medium', cameraShake: 1, touch: !!touch, units: 'kmh', speech: true, speechMarco: true, rude: true, blips: true, bubbles: true, speedClass: DEFAULT_SPEED_CLASS };
}

/**
 * Merge untrusted data (e.g. from storage) over defaults, clamping and validating every field.
 * @param {any} raw
 * @param {ReturnType<typeof defaultSettings>} [base]
 * @returns {ReturnType<typeof defaultSettings>}
 */
export function sanitizeSettings(raw, base = defaultSettings()) {
  const out = { ...base, volume: { ...base.volume } };
  if (!raw || typeof raw !== 'object') return out;
  const vol = raw.volume && typeof raw.volume === 'object' ? raw.volume : {};
  for (const k of Object.keys(out.volume)) {
    const v = Number(vol[k]);
    if (vol[k] != null && Number.isFinite(v)) out.volume[k] = Math.round(clamp01(v) * 100) / 100;
  }
  if (QUALITIES.includes(raw.quality)) out.quality = raw.quality;
  if (UNITS.includes(raw.units)) out.units = raw.units;
  if (raw.cameraShake != null && Number.isFinite(Number(raw.cameraShake))) out.cameraShake = Math.round(clamp01(Number(raw.cameraShake)) * 100) / 100;
  if (typeof raw.touch === 'boolean') out.touch = raw.touch;
  if (typeof raw.speech === 'boolean') out.speech = raw.speech;
  if (typeof raw.speechMarco === 'boolean') out.speechMarco = raw.speechMarco;
  for (const k of ['rude', 'blips', 'bubbles']) if (typeof raw[k] === 'boolean') out[k] = raw[k];   // rude banter, blip voices, speech bubbles over heads
  if (raw.speedClass != null) out.speedClass = resolveSpeedClass(raw.speedClass, out.speedClass);   // game speed in Mbps: 50 | 100 | 150 | 200
  return out;
}

/** Owns the current settings, persists them, and announces changes on the bus. */
export class SettingsModel {
  /**
   * @param {{ get: Function, set: Function }} store guarded store from storage.js
   * @param {(name: string, data: any) => void} [emit] defaults to bus.emit
   */
  constructor(store, emit = (n, d) => bus.emit(n, d)) {
    this.store = store;
    this.emit = emit;
    const stored = store.get('settings', null);
    this.value = sanitizeSettings(migrateMix(stored));
    if (stored && stored.mixV !== MIX_VERSION) store.set('settings', { ...this.value, mixV: MIX_VERSION });   // old mix: persist the migrated volumes once
  }

  /** @returns {ReturnType<typeof defaultSettings>} a copy, safe for the caller to keep */
  get() {
    return { ...this.value, volume: { ...this.value.volume } };
  }

  /**
   * Apply a partial change, persist it and emit `ui:settings`.
   * @param {{ volume?: Partial<{master:number,music:number,sfx:number,voice:number}>, quality?: string, cameraShake?: number, touch?: boolean, units?: string }} patch
   */
  set(patch) {
    this.value = sanitizeSettings({ ...this.value, ...patch, volume: { ...this.value.volume, ...(patch.volume || {}) } }, this.value);
    this.store.set('settings', { ...this.value, mixV: MIX_VERSION });
    this.emit('ui:settings', this.get());
  }

  /** Emit the current settings without changing them (used at start-up so audio and renderer pick them up). */
  announce() {
    this.emit('ui:settings', this.get());
  }

  /** Restore defaults (keeps the touch switch as detected). */
  reset() {
    this.value = defaultSettings();
    this.store.set('settings', { ...this.value, mixV: MIX_VERSION });
    this.emit('ui:settings', this.get());
  }
}
