// Stat bar widget (SPEED / ACCEL / HANDLING / WEIGHT, 1..5) with optional delta colouring against a reference.
import { h } from './dom.js';

export const STAT_KEYS = [['speed', 'Speed'], ['accel', 'Accel'], ['handling', 'Handling'], ['weight', 'Weight']];
/** Kart-type ratings (kartTuning.kartRatings): shown under the four stats on the kart-select screen when `createStatBars({ extra: true })`. */
export const EXTRA_KEYS = [['grip', 'Grip'], ['drift', 'Drift'], ['turbo', 'Turbo'], ['offroad', 'Off-road']];

/**
 * Build the bars once, update them with `setStats`.
 * @param {{ extra?: boolean }} [opts] extra: also build the kart-type rating rows (grip, drift, turbo, off-road); pass their values in `stats`
 * @returns {{ el: HTMLElement, setStats: (stats: Record<string, number>, ref?: Record<string, number>|null) => void }}
 */
export function createStatBars({ extra = false } = {}) {
  const el = h('div.stats');
  const rows = {};
  const keys = extra ? [...STAT_KEYS, ...EXTRA_KEYS] : STAT_KEYS;
  for (const [key, label] of keys) {
    const segs = [0, 1, 2, 3, 4].map((k) => h('i', { style: { '--k': k } }));
    const d = h('span.stat-d');
    rows[key] = { segs, d };
    el.append(h('div.stat', null, h('span.stat-l', { text: label }), h('div.stat-bar', null, ...segs), d));
  }
  return {
    el,
    setStats(stats, ref = null) {
      for (const [key] of keys) {
        const v = Math.round(stats[key] ?? 0);
        const r = ref ? Math.round(ref[key] ?? v) : v;
        const row = rows[key];
        row.segs.forEach((seg, i) => {
          seg.className = i < v ? (i >= r ? 'on up' : 'on') : (i < r ? 'down' : '');
        });
        const dv = v - r;
        row.d.className = `stat-d${dv > 0 ? ' up' : dv < 0 ? ' down' : ''}`;
        row.d.textContent = dv === 0 ? '' : `${dv > 0 ? '+' : ''}${dv}`;
      }
    },
  };
}
