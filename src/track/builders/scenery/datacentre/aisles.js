// Hot and cold aisle colour zones. A real hall alternates: cold aisles (the fronts of the racks, cool blue-white light, 18 C) and hot aisles
// (the exhaust side, amber and red light, 38 C+). Every stretch of the lap belongs to one; the rack trim, cable fibre, edge studs and the
// aisle arches all take their colour from it (canyon.js, hazards.js), so the lap reads as a sequence of cool and warm rooms.
import { LED } from './textures.js';

export const AISLE = {
  cold: { name: 'COLD AISLE', temp: '18 C', crown: LED.cyan, base: LED.cyan, seam: LED.blue, fibre: [LED.cyan, LED.white, LED.blue], edge: LED.cyan, sub: 'cool air in · fast and clean' },
  hot: { name: 'HOT AISLE', temp: '41 C', crown: 0xff9a1f, base: 0xff4a1a, seam: 0xff7a00, fibre: [0xff9a1f, 0xff4a1a, 0xffd24a], edge: 0xff8a00, sub: 'exhaust side · mind the heat' },
};

/**
 * The aisle of every stretch of the lap, as [{ from, to, kind }] in metres (start of the lap to the end of it, no gaps).
 * @param {ReturnType<import('./route.js').routeInfo>} R
 */
export function aisleZones(R) {
  const S = R.S, L = R.cl.length;
  const cut = [[0, 'cold'], [S('sp0'), 'cold'], [S('exit'), 'hot'], [S('fk1a'), 'cold'], [S('fk1b'), 'hot'], [S('dl2'), 'cold'], [S('bk0'), 'hot'], [S('br0'), 'cold'], [S('under'), 'hot'], [S('fk2b'), 'cold']];
  const out = [];
  cut.forEach(([from, kind], i) => { const to = i + 1 < cut.length ? cut[i + 1][0] : L; if (to > from) out.push({ from, to, kind }); });
  // merge neighbours of the same kind
  const merged = [];
  for (const z of out) { const last = merged[merged.length - 1]; if (last && last.kind === z.kind) last.to = z.to; else merged.push({ ...z }); }
  return merged;
}

/** Split a wall range [a, b] at the aisle boundaries: [[a, b, kind], ...]. */
export function splitByAisle(a, b, zones) {
  const out = [];
  for (const z of zones) {
    const lo = Math.max(a, z.from), hi = Math.min(b, z.to);
    if (hi - lo > 0.5) out.push([lo, hi, z.kind]);
  }
  return out;
}

export const aisleAt = (zones, s) => zones.find((z) => s >= z.from && s < z.to)?.kind ?? 'cold';
