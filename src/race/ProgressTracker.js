// ProgressTracker: lap / checkpoint bookkeeping with anti-cheat.
//
// Each racer owns a gate counter `g` (may be negative on the grid, where the gate before the line is gate -1).
// Gate index = g mod N, lap = floor(g / N). A gate only counts when crossed IN ORDER and going FORWARD;
// crossing the last passed gate backwards un-passes it, so reversing over the line cannot farm laps.
// A big jump of the projected `s` (cutting across grass, tunnelling through the projection) is NOT credited
// unless the kart was on the road on both sides of it, or was airborne (a real ramp shortcut).
import { clamp, loopDiff, wrapS } from '../core/util.js';
import { RACE } from './constants.js';

export class ProgressTracker {
  /** @param {object} track Track with `length` and ascending `checkpointS` (first entry = start line) */
  constructor(track) {
    this.length = track.length;
    this.cp = Array.from(track.checkpointS ?? [0]);
    if (this.cp.length === 0 || this.cp[0] !== 0) this.cp.unshift(0);
    this.N = this.cp.length;
    /** Declared shortcuts [{from, to}] (metres along the centreline): jumps of `s` through them are legitimate. */
    this.shortcuts = (track.shortcuts ?? []).map((sc) => ({ from: sc.from, to: sc.to }));
  }

  /** Does a forward jump prev -> s lie inside a declared shortcut (with a little slack at both ends)? */
  _viaShortcut(prev, s) {
    const L = this.length, slack = 30;
    for (const sc of this.shortcuts) {
      const span = loopDiff(sc.from, sc.to, L) + 2 * slack;
      const a = loopDiff(sc.from - slack, prev, L), b = loopDiff(sc.from - slack, s, L);
      if (a >= 0 && b >= a && b <= span) return true;
    }
    return false;
  }

  /** Centreline `s` of gate number g. */
  gateS(g) { const N = this.N; return this.cp[((g % N) + N) % N]; }

  /** Absolute distance (m, incl. laps) of gate number g. */
  gateAbs(g) { const N = this.N; const k = Math.floor(g / N); return k * this.length + this.cp[g - k * N]; }

  /** Lap number (1-based, display) for gate counter g. */
  lapOf(g, laps) { return g < 0 ? 1 : Math.min(laps, Math.floor(g / this.N) + 1); }

  /**
   * Initialises a racer's counters for a kart standing at centreline distance `s`.
   * @param {object} r Racer @param {number} s centreline distance of the kart (m)
   */
  init(r, s) {
    const cp = this.cp, N = this.N, L = this.length;
    let g;
    if (s >= L / 2) { let c = 0; for (let k = 1; k < N; k++) if (cp[k] > s) c++; g = -1 - c; }
    else { let c = 0; for (let k = 0; k < N; k++) if (cp[k] <= s) c++; g = c - 1; }
    r.g = g; r.maxG = g; r.lastS = s; r.crossFrac = 1; r.dsLast = 0;
    r.progress = this.progressOf(r, s);
  }

  /** Progress in metres (incl. laps) for the racer's gate counter and current `s`, clamped between neighbouring gates. */
  progressOf(r, s) {
    const g = r.g;
    const a = this.gateAbs(g), b = this.gateAbs(g + 1), c = this.gateAbs(g - 1);
    const rel = loopDiff(this.gateS(g), s, this.length);
    return a + clamp(rel, c - a, b - a - 0.001);
  }

  /**
   * Advances the gate state for one step and refreshes `r.progress`.
   * @param {object} r Racer
   * @param {number} s the kart's projected centreline distance this step
   * @param {boolean} creditJump whether a large forward jump of `s` may be credited (on road / airborne)
   * @returns {number} number of gates newly passed this step (may be > 1 only for credited jumps)
   */
  update(r, s, creditJump) {
    const L = this.length, prev = r.lastS;
    const ds = loopDiff(prev, s, L);
    r.lastS = s;
    let passed = 0;
    r.crossFrac = 1;
    if (Math.abs(ds) <= RACE.jumpMax) {
      r.dsLast = ds;
      if (ds > 0) {
        const gs = this.gateS(r.g + 1);
        const dPrev = loopDiff(gs, prev, L), dCur = loopDiff(gs, s, L);
        if (dPrev <= 0 && dCur > 0) { r.g++; passed = 1; r.crossFrac = clamp(dPrev === dCur ? 1 : -dPrev / (dCur - dPrev), 0, 1); }
      } else if (ds < 0) {
        const gs = this.gateS(r.g);
        const dPrev = loopDiff(gs, prev, L), dCur = loopDiff(gs, s, L);
        if (dPrev >= 0 && dCur < 0) r.g--;
      }
    } else {
      r.dsLast = 0;
      if (ds > 0 && (creditJump || this._viaShortcut(prev, s))) {
        for (let guard = 0; guard < this.N; guard++) {
          const gs = this.gateS(r.g + 1);
          const dPrev = loopDiff(gs, prev, L), dCur = loopDiff(gs, s, L);
          if (dPrev <= 0 && dCur > 0) { r.g++; passed++; } else break;
        }
      }
    }
    r.progress = this.progressOf(r, s);
    return passed;
  }

  /** Re-anchors a racer after a teleport (respawn) without crediting anything. */
  resync(r, s) { r.lastS = wrapS(s, this.length); r.dsLast = 0; r.progress = this.progressOf(r, r.lastS); }
}
