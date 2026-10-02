// Speed classes ("Mbps", the cc of this game): lookup, validation and the ?class= query hook. Node-safe (no DOM at import time).
// The numbers live in CFG.speedClasses (config.js); `speed` there is a time scale on the driving model (see kartTuning.classScale()).
import { CFG } from './config.js';

/** @type {number[]} selectable ids, slowest first: 50, 100, 150, 200 */
export const SPEED_CLASS_IDS = Object.keys(CFG.speedClasses.classes).map(Number).sort((a, b) => a - b);

/** @type {number} the class used when nothing is chosen (100 Mbps) */
export const DEFAULT_SPEED_CLASS = CFG.speedClasses.default;

/**
 * Turn anything plausible ("150", 150, "150 Mbps", "150mbps") into a valid class id.
 * @param {any} value
 * @param {number} [fallback] returned when `value` is not a known class (default 100)
 * @returns {number} one of SPEED_CLASS_IDS
 */
export function resolveSpeedClass(value, fallback = DEFAULT_SPEED_CLASS) {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? '').trim(), 10);
  return SPEED_CLASS_IDS.includes(n) ? n : fallback;
}

/**
 * The CFG.speedClasses entry for a class id (unknown ids give the default class).
 * @param {any} id
 * @returns {{id:number, name:string, tag:string, blurb:string, speed:number, aiPace:number, aiRubber:number, fov:number, fx:number}}
 */
export function speedClassInfo(id) {
  return CFG.speedClasses.classes[resolveSpeedClass(id)];
}

/**
 * Reads `?class=50|100|150|200` (tools, QA).
 * @param {string} [search] defaults to `location.search` when a browser is present
 * @returns {number|null} the class id, or null when absent or invalid
 */
export function speedClassFromQuery(search) {
  try {
    const s = search ?? (typeof location !== 'undefined' ? location.search : '');
    const v = new URLSearchParams(s).get('class');
    if (v == null) return null;
    const n = resolveSpeedClass(v, NaN);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
