// Racer factory. A Racer is a plain object (SPEC section 5) plus a few bookkeeping fields used by Race / ItemManager / AI.
import { getCharacter } from '../core/roster.js';

/**
 * @param {{id:string,name?:string,charId:string,kartId:string,isPlayer?:boolean}} entry
 * @param {number} gridIndex 0-based grid slot
 * @param {object} kart KartPhysics-shaped kart
 * @param {boolean} isPlayer whether this racer is the human
 * @param {number} obstacleCount number of track obstacles (sizes the per-obstacle cooldown array)
 */
export function createRacer(entry, gridIndex, kart, isPlayer, obstacleCount) {
  const ch = getCharacter(entry.charId);
  return {
    // ---- public shape (SPEC section 5) ----
    id: entry.id,
    name: entry.name ?? ch.name,
    charId: entry.charId,
    kartId: entry.kartId,
    isPlayer,
    kart,
    ai: null,
    place: gridIndex + 1,
    lap: 1,
    progress: 0,
    finished: false,
    finishTime: null,
    lapTimes: [],
    bestLap: null,
    item: null,
    itemRoulette: null,
    shield: false,
    lastInput: { throttle: 0, brake: 0, steer: 0, drift: false },
    // ---- extras (safe for visuals / UI to read) ----
    colour: ch.colour,
    gridIndex,
    shieldTime: 0,        // s of firewall left
    sudo: 0,              // s of sudo left
    fibre: 0,             // s of fibre link left
    finishOrder: 0,       // 1 = first to finish
    // ---- bookkeeping ----
    sudoImmune: 0,
    g: -1, maxG: -1, lastS: 0, crossFrac: 1, dsLast: 0, lapStart: 0,
    prevOnRoad: true, airSinceRoad: false, safeProgress: 0,
    stuckTime: 0, flipTime: 0, offRoadTime: 0, fallTime: 0, fallFlag: false,
    wrongTime: 0, rightTime: 0,
    thrHeld: false, thrPressedAt: 0,
    obstacleCd: new Float32Array(obstacleCount),
    auto: null, fibreDriver: null,
    control: null,         // optional scripted controller: (racer, dt, input, race) => actions | void
    _item: null, _roulette: null, _ovt: null,
  };
}
