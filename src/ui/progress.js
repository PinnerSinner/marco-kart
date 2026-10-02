// Persistent progress: best times per track and the player's last menu picks. Node-safe.
import { CFG } from '../core/config.js';
import { CHARACTERS, KARTS, TRACKS } from '../core/roster.js';
import { DIFFICULTIES } from '../core/config.js';
import { SPEED_CLASS_IDS } from '../core/speedClass.js';

export const LAP_OPTIONS = [2, 3, 4, 5];

/** @returns {{charId:string, kartId:string, difficulty:string, trackId:string, laps:number}} default picks */
export function defaultPicks() {
  return {
    charId: (CHARACTERS.find((c) => c.playerDefault) ?? CHARACTERS[0]).id,
    kartId: KARTS[0].id,
    difficulty: 'professional',
    trackId: TRACKS[0].id,
    laps: CFG.defaultLaps,
  };
}

/**
 * Validate picks (from storage or a caller) against the roster, falling back to defaults per field.
 * @param {any} raw
 * @returns {ReturnType<typeof defaultPicks>}
 */
export function sanitizePicks(raw) {
  const d = defaultPicks();
  if (!raw || typeof raw !== 'object') return d;
  const out = {
    charId: CHARACTERS.some((c) => c.id === raw.charId) ? raw.charId : d.charId,
    kartId: KARTS.some((k) => k.id === raw.kartId) ? raw.kartId : d.kartId,
    difficulty: DIFFICULTIES.some((x) => x.id === raw.difficulty) ? raw.difficulty : d.difficulty,
    trackId: TRACKS.some((t) => t.id === raw.trackId) ? raw.trackId : d.trackId,
    laps: LAP_OPTIONS.includes(raw.laps) ? raw.laps : d.laps,
  };
  if (SPEED_CLASS_IDS.includes(raw.speedClass)) out.speedClass = raw.speedClass;   // optional: the game speed (Mbps) the flow was opened with
  return out;
}

const okTime = (t) => typeof t === 'number' && Number.isFinite(t) && t > 0;

/** Best times are kept per game speed: 100 Mbps uses the plain track id (as before), the other classes use `track@150` and so on. */
export const bestKey = (trackId, speedClass = 100) => (speedClass && speedClass !== 100 && SPEED_CLASS_IDS.includes(speedClass) ? `${trackId}@${speedClass}` : trackId);

/** Best-time book and last picks, backed by a guarded store. */
export class Progress {
  /** @param {{ get: Function, set: Function }} store */
  constructor(store) {
    this.store = store;
  }

  /** @returns {ReturnType<typeof defaultPicks>} */
  getPicks() {
    return sanitizePicks(this.store.get('picks', null));
  }

  /** @param {Partial<ReturnType<typeof defaultPicks>>} picks merged over the stored picks */
  savePicks(picks) {
    this.store.set('picks', sanitizePicks({ ...this.getPicks(), ...picks }));
  }

  /**
   * @param {string} trackId
   * @param {number} [laps] race length; when omitted the race time is null
   * @param {number} [speedClass=100] game speed (Mbps): every class has its own book, since a 200 Mbps lap would beat every 100 Mbps record
   * @returns {{ bestLap: number|null, bestRace: number|null }}
   */
  getBest(trackId, laps, speedClass = 100) {
    const book = this.store.get('best', {}) || {};
    const rec = book[bestKey(trackId, speedClass)] || {};
    return {
      bestLap: okTime(rec.bestLap) ? rec.bestLap : null,
      bestRace: laps != null && okTime(rec.race?.[String(laps)]) ? rec.race[String(laps)] : null,
    };
  }

  /**
   * Record a finished player race. Returns which records were beaten so the results screen can celebrate.
   * A first-ever time counts as a record only when `announceFirst` is true, so the very first race does not shout "NEW RECORD" at every lap.
   * @param {string} trackId
   * @param {number} laps
   * @param {{ bestLap?: number|null, time?: number|null }} result
   * @param {number} [speedClass=100] game speed (Mbps) the race was run at
   * @returns {{ newBestLap: boolean, newBestRace: boolean, prevBestLap: number|null, prevBestRace: number|null }}
   */
  record(trackId, laps, { bestLap = null, time = null } = {}, speedClass = 100) {
    const key = bestKey(trackId, speedClass);
    const book = this.store.get('best', {}) || {};
    const rec = book[key] || { bestLap: null, race: {} };
    rec.race = rec.race || {};
    const prevBestLap = okTime(rec.bestLap) ? rec.bestLap : null;
    const prevBestRace = okTime(rec.race[String(laps)]) ? rec.race[String(laps)] : null;
    const newBestLap = okTime(bestLap) && (prevBestLap == null || bestLap < prevBestLap);
    const newBestRace = okTime(time) && (prevBestRace == null || time < prevBestRace);
    if (newBestLap) rec.bestLap = bestLap;
    if (newBestRace) rec.race[String(laps)] = time;
    book[key] = rec;
    this.store.set('best', book);
    return { newBestLap, newBestRace, prevBestLap, prevBestRace };
  }
}
