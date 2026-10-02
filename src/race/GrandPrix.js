// GrandPrix: a cup of races with points, standings and a final trophy tier (SPEC section 5).
import { DIFFICULTIES, GP_POINTS } from '../core/config.js';
import { CUPS as ROSTER_CUPS } from '../core/roster.js';

const TROPHY = ['gold', 'silver', 'bronze'];

export class GrandPrix {
  /**
   * @param {object} o
   * @param {string} [o.cupId] id from roster `CUPS` (default: the first cup)
   * @param {Array<{id:string,name?:string,charId:string,kartId:string,isPlayer?:boolean}>} o.entries all racers (up to 8)
   * @param {string} [o.difficulty='professional']
   */
  constructor({ cupId, entries, difficulty = 'professional' }) {
    const cup = ROSTER_CUPS.find((c) => c.id === cupId) ?? ROSTER_CUPS[0];
    if (!entries?.length) throw new Error('GrandPrix: entries required');
    this.cup = cup;
    this.cupId = cup.id;
    this.tracks = cup.tracks.slice();
    this.difficulty = (DIFFICULTIES.find((d) => d.id === difficulty) ?? DIFFICULTIES[1]).id;
    this.entries = entries.map((e) => ({ ...e }));
    this.raceIndex = 0;
    /** @type {Map<string, {points:number, placings:number[], lastPoints:number}>} */
    this._table = new Map(this.entries.map((e) => [e.id, { points: 0, placings: [], lastPoints: 0 }]));
    this._recorded = 0;
  }

  /** Track id of the race to run next. */
  get trackId() { return this.tracks[Math.min(this.raceIndex, this.tracks.length - 1)]; }

  /** Number of races in the cup. */
  get total() { return this.tracks.length; }

  /** True once every race of the cup has been recorded. */
  get done() { return this._recorded >= this.tracks.length; }

  /**
   * Records a finished race. Each racer earns `GP_POINTS[place - 1]`.
   * @param {Array<{id:string, place:number}>} results rows from `Race.results()`
   */
  record(results) {
    if (this.done) return;
    for (const row of results) {
      const t = this._table.get(row.id);
      if (!t) continue;
      const pts = GP_POINTS[row.place - 1] ?? 0;
      t.points += pts; t.lastPoints = pts; t.placings.push(row.place);
    }
    this._recorded++;
  }

  /** Moves on to the next race (call after `record`). Returns the new race index. */
  next() {
    if (this.raceIndex < this.tracks.length) this.raceIndex++;
    return this.raceIndex;
  }

  /**
   * Championship table. Sorted by points; ties broken by best placings (most wins, then most seconds ...), then by
   * the earlier entry.
   * `gained` (= `lastPoints`) is what each racer earned in the most recently recorded race.
   * @returns {Array<{place:number,id:string,name:string,charId:string,kartId:string,points:number,gained:number,lastPoints:number,placings:number[],isPlayer:boolean}>}
   */
  standings() {
    const rows = this.entries.map((e, i) => {
      const t = this._table.get(e.id);
      return { id: e.id, name: e.name, charId: e.charId, kartId: e.kartId, points: t.points, gained: t.lastPoints, lastPoints: t.lastPoints, placings: t.placings.slice(), isPlayer: !!e.isPlayer, _i: i };
    });
    rows.sort((a, b) => b.points - a.points || compareBest(a.placings, b.placings) || a._i - b._i);
    return rows.map((r, i) => { const { _i, ...rest } = r; return { place: i + 1, ...rest }; });
  }

  /**
   * Entries in grid order for the upcoming race (copies; index 0 = pole). Race 1: the given order with the human moved to
   * the back row (they have to work for it). Later races: championship order, leader on pole, or the reverse with
   * `worstFirst` (a catch-up grid: the worst-placed racer takes pole).
   * @param {{worstFirst?: boolean}} [o]
   * @returns {Array<object>}
   */
  grid({ worstFirst = false } = {}) {
    if (this._recorded === 0) {
      const list = this.entries.map((e) => ({ ...e }));
      const hi = list.findIndex((e) => e.isPlayer);
      if (hi >= 0) { const [p] = list.splice(hi, 1); list.push(p); }
      return worstFirst ? list.reverse() : list;
    }
    const byId = new Map(this.entries.map((e) => [e.id, e]));
    const rows = this.standings().map((r) => ({ ...byId.get(r.id) }));
    return worstFirst ? rows.reverse() : rows;
  }

  /**
   * Final table plus the human's trophy tier.
   * @returns {{standings: Array<object>, trophy: 'gold'|'silver'|'bronze'|'none', player: object|null}}
   *   standings rows are `standings()` rows plus their own `trophy` tier (by place); `trophy` / `player` describe the human.
   */
  finalResults() {
    const standings = this.standings().map((r) => ({ ...r, trophy: TROPHY[r.place - 1] ?? 'none' }));
    const player = standings.find((r) => r.isPlayer) ?? null;
    return { standings, trophy: player ? player.trophy : 'none', player };
  }
}

/** Lexicographic compare of placing lists: better (lower) placings first, i.e. more wins, then more 2nds ... */
function compareBest(a, b) {
  const count = (arr, p) => arr.reduce((n, x) => n + (x === p ? 1 : 0), 0);
  for (let p = 1; p <= 8; p++) {
    const d = count(b, p) - count(a, p);
    if (d) return d;
  }
  return 0;
}
