// Defensive normalisers for data that arrives from other modules (GrandPrix standings, final results). Pure, Node-safe.
import { CHARACTERS } from '../core/roster.js';

export const TROPHIES = ['gold', 'silver', 'bronze', 'none'];

/**
 * Trophy tier from a final placing.
 * @param {number} place 1-based
 * @returns {'gold'|'silver'|'bronze'|'none'}
 */
export function trophyFor(place) {
  return place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : 'none';
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * One standings row, tolerant of the field names other modules might use.
 * @param {any} r raw row
 * @param {number} index position in the list (0-based), used as the place when none is given
 * @param {Map<string, number>} [gainedById] fallback for points gained in the last race
 * @returns {{ id: string, charId: string, name: string, points: number, gained: number, place: number, isPlayer: boolean }}
 */
export function normaliseRow(r, index, gainedById) {
  const id = String(r?.id ?? r?.racerId ?? r?.charId ?? index);
  const charId = CHARACTERS.some((c) => c.id === (r?.charId ?? id)) ? (r?.charId ?? id) : (r?.charId ?? CHARACTERS[index % CHARACTERS.length].id);
  const gained = num(r?.gained ?? r?.lastPoints ?? r?.raceGain ?? r?.delta ?? gainedById?.get(id), 0);
  return {
    id, charId, name: String(r?.name ?? CHARACTERS.find((c) => c.id === charId)?.name ?? id),
    points: num(r?.points ?? r?.total ?? r?.score, 0), gained, place: num(r?.place, index + 1), isPlayer: !!(r?.isPlayer ?? r?.player),
  };
}

/**
 * Standings sorted best first with 1-based places.
 * @param {any} raw array of rows, or an object holding one under `standings` / `rows` / `table`
 * @param {Map<string, number>} [gainedById]
 * @returns {ReturnType<typeof normaliseRow>[]}
 */
export function normaliseStandings(raw, gainedById) {
  const list = Array.isArray(raw) ? raw : (raw?.standings ?? raw?.rows ?? raw?.table ?? []);
  const rows = list.map((r, i) => normaliseRow(r, i, gainedById));
  const hasPlaces = list.every((r) => Number.isFinite(r?.place));
  if (!hasPlaces) rows.sort((a, b) => b.points - a.points);
  else rows.sort((a, b) => a.place - b.place);
  rows.forEach((r, i) => { r.place = i + 1; });
  return rows;
}

/**
 * Where each row stood before the last race (points minus gained), for the animated re-ordering.
 * Ties keep their current order so nothing jumps for no reason.
 * @param {ReturnType<typeof normaliseStandings>} rows
 * @returns {Map<string, number>} id -> previous 0-based rank
 */
export function previousRanks(rows) {
  const order = rows.map((r, i) => ({ id: r.id, before: r.points - r.gained, i }));
  order.sort((a, b) => b.before - a.before || a.i - b.i);
  return new Map(order.map((o, k) => [o.id, k]));
}

/**
 * Final GP result: rows plus the player's trophy tier.
 * @param {any} raw `GrandPrix.finalResults()` (array, or object with standings + trophy)
 * @returns {{ rows: ReturnType<typeof normaliseStandings>, trophy: 'gold'|'silver'|'bronze'|'none', player: ReturnType<typeof normaliseRow>|null }}
 */
export function normaliseFinal(raw) {
  const rows = normaliseStandings(raw);
  const player = rows.find((r) => r.isPlayer) ?? null;
  let trophy = raw && !Array.isArray(raw) ? (raw.trophy ?? raw.tier ?? raw.trophyTier ?? raw.player?.trophy) : null;
  if (!TROPHIES.includes(trophy)) trophy = player ? trophyFor(player.place) : 'none';
  return { rows, trophy, player };
}
