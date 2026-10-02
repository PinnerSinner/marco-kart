// Menu flow state machine for character -> kart -> difficulty -> track. Pure logic: no DOM, safe in Node.
import { bus } from '../core/bus.js';
import { CFG, DIFFICULTIES } from '../core/config.js';
import { CHARACTERS, KARTS, TRACKS } from '../core/roster.js';
import { sanitizePicks, LAP_OPTIONS } from './progress.js';
import { SPEED_CLASS_IDS } from '../core/speedClass.js';

/** Steps per mode (SPEC section 8): GP has no track step (the Grand Prix picks tracks), time trial has no rivals so no difficulty. */
export const FLOW_STEPS = {
  gp: ['char', 'kart', 'difficulty'],
  single: ['char', 'kart', 'difficulty', 'track'],
  time: ['char', 'kart', 'track'],
};

const STEP_FIELD = { char: 'charId', kart: 'kartId', difficulty: 'difficulty', track: 'trackId' };

/** Validators so a bad value can never reach `ui:start`. */
const VALID = {
  charId: (v) => CHARACTERS.some((c) => c.id === v),
  kartId: (v) => KARTS.some((k) => k.id === v),
  difficulty: (v) => DIFFICULTIES.some((d) => d.id === v),
  trackId: (v) => TRACKS.some((t) => t.id === v),
};

export class SelectFlow {
  /**
   * @param {'gp'|'single'|'time'} mode
   * @param {{ picks?: object, emit?: (name: string, data: any) => void }} [opts] picks = starting values (last picks); emit defaults to bus.emit
   */
  constructor(mode, { picks = {}, emit = (n, d) => bus.emit(n, d) } = {}) {
    if (!FLOW_STEPS[mode]) throw new Error(`SelectFlow: unknown mode "${mode}"`);
    this.mode = mode;
    this.steps = FLOW_STEPS[mode];
    this.index = 0;
    this.picks = sanitizePicks(picks);
    this.emit = emit;
    this.done = false;
  }

  /** @returns {'char'|'kart'|'difficulty'|'track'} the current step */
  get step() { return this.steps[this.index]; }

  /** @returns {{ index: number, total: number }} zero-based progress for the step pips */
  get progress() { return { index: this.index, total: this.steps.length }; }

  /**
   * Set a value without advancing (used while browsing, e.g. hovering a kart updates the preview).
   * @param {'charId'|'kartId'|'difficulty'|'trackId'|'laps'|'speedClass'} field
   * @param {any} value ignored if invalid
   * @returns {boolean} whether the value was accepted
   */
  pick(field, value) {
    if (field === 'speedClass') {                      // game speed in Mbps (50 | 100 | 150 | 200), carried in the `ui:start` payload
      if (!SPEED_CLASS_IDS.includes(value)) return false;
      this.picks.speedClass = value;
      return true;
    }
    if (field === 'laps') {
      if (!LAP_OPTIONS.includes(value)) return false;
      this.picks.laps = value;
      return true;
    }
    if (!VALID[field]?.(value)) return false;
    this.picks[field] = value;
    return true;
  }

  /**
   * Confirm the current step. Advances, or on the last step emits `ui:start`.
   * @param {any} [value] the chosen value for this step (defaults to the current pick)
   * @returns {'next'|'start'|'invalid'}
   */
  confirm(value) {
    if (this.done) return 'invalid';
    const field = STEP_FIELD[this.step];
    if (value !== undefined && !this.pick(field, value)) return 'invalid';
    if (this.index < this.steps.length - 1) { this.index++; return 'next'; }
    this.done = true;
    this.emit('ui:start', this.payload());
    return 'start';
  }

  /**
   * Go back one step.
   * @returns {'prev'|'exit'} 'exit' means we were on the first step, so the caller should return to the main menu
   */
  back() {
    this.done = false;
    if (this.index === 0) return 'exit';
    this.index--;
    return 'prev';
  }

  /** @returns {{mode:string, charId:string, kartId:string, difficulty:string, trackId?:string, laps?:number, speedClass?:number}} the `ui:start` payload */
  payload() {
    const p = { mode: this.mode, charId: this.picks.charId, kartId: this.picks.kartId, difficulty: this.picks.difficulty };
    if (this.mode !== 'gp') {
      p.trackId = this.picks.trackId;
      p.laps = this.picks.laps ?? CFG.defaultLaps;
    }
    if (this.picks.speedClass != null) p.speedClass = this.picks.speedClass;
    return p;
  }
}
