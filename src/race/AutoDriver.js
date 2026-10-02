// AutoDriver: takes over a racer's input in two situations.
//   mode 'fibre'  - the Fibre Link item: 4.5 s of clean driving on the racing line at boost speed (kart is invincible).
//   mode 'cruise' - after a racer has finished (or the race is over): a relaxed victory lap on the outside of the line.
// It shares the racing line and controller with the AI, minus drifting, item use and overtaking logic.
import { LineDriver, kartDynamics } from './LineDriver.js';
import { RACE } from './constants.js';

export class AutoDriver extends LineDriver {
  /**
   * @param {object} track
   * @param {{mode?: 'fibre'|'cruise', kart?: object}} [o] kart = the kart to be driven (its steering / speed numbers set the profile)
   */
  constructor(track, { mode = 'fibre', kart } = {}) {
    const dyn = kart ? kartDynamics(kart) : { turn: 2.2, top: 33 };
    super(track, mode === 'fibre'
      ? { ...dyn, weight: 0.7, margin: 0.9, aBrake: 30, pace: 1, lookBase: 6, lookGain: 0.3 }
      : { ...dyn, weight: 0.5, margin: 0.6, aBrake: 22, pace: RACE.cruiseSpeedFrac, lookBase: 6, lookGain: 0.3 });
    this.mode = mode;
    if (mode === 'cruise') this.shift = RACE.cruiseOffset;
  }

  /**
   * Writes the kart input for one fixed step.
   * @param {object} kart
   * @param {number} dt seconds
   * @param {{throttle:number,brake:number,steer:number,drift:boolean}} out
   */
  update(kart, dt, out) { return this.drive(kart, dt, out); }
}
