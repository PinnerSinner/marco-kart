// Pure formatting helpers for the HUD and result tables. No DOM, safe to import in Node.

/**
 * English ordinal suffix for a positive integer, upper case.
 * @param {number} n place (1-based)
 * @returns {'ST'|'ND'|'RD'|'TH'}
 */
export function ordinalSuffix(n) {
  const v = Math.abs(Math.trunc(n)) % 100;
  if (v >= 11 && v <= 13) return 'TH';
  switch (v % 10) {
    case 1: return 'ST';
    case 2: return 'ND';
    case 3: return 'RD';
    default: return 'TH';
  }
}

/**
 * Split a place into number + suffix for the big HUD ordinal.
 * @param {number} n place (1-based); non-finite or < 1 gives "-"
 * @returns {{ num: string, suffix: string }}
 */
export function ordinalParts(n) {
  if (!Number.isFinite(n) || n < 1) return { num: '-', suffix: '' };
  const p = Math.trunc(n);
  return { num: String(p), suffix: ordinalSuffix(p) };
}

/**
 * "1ST", "2ND", "11TH".
 * @param {number} n place
 * @returns {string}
 */
export function ordinal(n) {
  const { num, suffix } = ordinalParts(n);
  return num + suffix;
}

/**
 * Race time as M:SS.mmm (rounded to the nearest millisecond, so 59.9996 is "1:00.000", never "0:60.000").
 * Non-finite or negative input gives "--:--.---".
 * @param {number|null|undefined} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '--:--.---';
  const total = Math.round(seconds * 1000);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const ms = total % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Compact time for tight columns: M:SS.mm (centiseconds, truncated like a stopwatch).
 * @param {number|null|undefined} seconds
 * @returns {string}
 */
export function formatTimeShort(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '-:--.--';
  const total = Math.floor(seconds * 100);
  const m = Math.floor(total / 6000);
  const s = Math.floor((total % 6000) / 100);
  const cs = total % 100;
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Signed time gap, e.g. "+1.234" / "-0.500".
 * @param {number} seconds
 * @returns {string}
 */
export function formatDelta(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const sign = seconds < 0 ? '-' : '+';
  return `${sign}${Math.abs(seconds).toFixed(3)}`;
}

export const KMH_TO_MPH = 0.621371192;

/**
 * Convert a HUD km/h figure into the display number for the chosen units.
 * @param {number} kmh speed in km/h (already multiplied by CFG.speedDisplayMult)
 * @param {'kmh'|'mph'} units
 * @returns {number} non-negative integer
 */
export function displaySpeed(kmh, units = 'kmh') {
  if (!Number.isFinite(kmh)) return 0;
  const v = Math.max(0, Math.abs(kmh)) * (units === 'mph' ? KMH_TO_MPH : 1);
  return Math.round(v);
}

/**
 * @param {'kmh'|'mph'} units
 * @returns {string} "KM/H" or "MPH"
 */
export function speedUnitLabel(units) {
  return units === 'mph' ? 'MPH' : 'KM/H';
}

/**
 * How full the speedometer arc is, 0..1.
 * @param {number} kmh
 * @param {number} [maxKmh=240] speed at which the arc is full
 * @returns {number}
 */
export function gaugeFraction(kmh, maxKmh = 240) {
  if (!Number.isFinite(kmh) || maxKmh <= 0) return 0;
  return Math.min(1, Math.max(0, Math.abs(kmh) / maxKmh));
}

/**
 * "LAP 2/3", clamping the lap into the valid range so the HUD never shows "LAP 4/3".
 * @param {number} lap 1-based current lap
 * @param {number} laps total laps
 * @returns {string}
 */
export function lapLabel(lap, laps) {
  const total = Math.max(1, Math.trunc(laps) || 1);
  const cur = Math.min(total, Math.max(1, Math.trunc(lap) || 1));
  return `LAP ${cur}/${total}`;
}

/**
 * Points gained, "+15" or "" when nothing was scored.
 * @param {number} points
 * @returns {string}
 */
export function formatPoints(points) {
  return points > 0 ? `+${Math.trunc(points)}` : '';
}

/**
 * Build the rows for the lap-split list: finished laps, the live lap, then blanks.
 * @param {number[]} lapTimes completed lap times in seconds
 * @param {number} time race time in seconds
 * @param {number} laps total laps
 * @param {boolean} finished true once the player crossed the line (no live lap any more)
 * @returns {{ index: number, time: number|null, live: boolean, best: boolean }[]}
 */
export function lapSplitRows(lapTimes, time, laps, finished = false) {
  const done = Array.isArray(lapTimes) ? lapTimes.filter((t) => Number.isFinite(t)) : [];
  let best = Infinity;
  for (const t of done) if (t < best) best = t;
  const doneSum = done.reduce((a, b) => a + b, 0);
  const rows = [];
  const total = Math.max(1, Math.trunc(laps) || 1);
  for (let i = 0; i < total; i++) {
    if (i < done.length) rows.push({ index: i + 1, time: done[i], live: false, best: done.length > 1 && done[i] === best });
    else if (i === done.length && !finished) rows.push({ index: i + 1, time: Math.max(0, (time || 0) - doneSum), live: true, best: false });
    else rows.push({ index: i + 1, time: null, live: false, best: false });
  }
  return rows;
}

/**
 * Current-lap elapsed time.
 * @param {number[]} lapTimes
 * @param {number} time race time in seconds
 * @returns {number}
 */
export function currentLapTime(lapTimes, time) {
  const sum = (lapTimes || []).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  return Math.max(0, (time || 0) - sum);
}
