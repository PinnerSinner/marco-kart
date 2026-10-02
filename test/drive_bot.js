// Test helper (not a test): a deterministic pursuit-controller bot that drives a KartPhysics around any Track.
// Steers at a look-ahead point on the centreline, lifts / brakes for curvature, optionally drifts long curves.
import { clamp, wrapAngle, loopDiff } from '../src/core/util.js';

/**
 * @param {import('../src/kart/KartPhysics.js').KartPhysics} kart
 * @param {object} track
 * @param {{drift?:boolean, lateral?:number, cornerGrip?:number}} [opts]
 * @returns {{throttle:number, brake:number, steer:number, drift:boolean}}
 */
export function makeBot(kart, track, opts = {}) {
  const state = { drifting: false, cool: 0, k0: 0, ticks: 0 };
  const out = { throttle: 1, brake: 0, steer: 0, drift: false };
  const sm0 = {}, sm1 = {}, sm2 = {};
  const cornerGrip = opts.cornerGrip ?? 0.8;
  return function drive() {
    const s = kart.ground.s;
    const speed = Math.max(kart.speed, 6);
    const look = clamp(5 + speed * 0.45, 9, 26);
    track.sample(s + look, sm0);
    const lat = opts.lateral ?? 0;
    const tx = sm0.pos.x + sm0.right.x * lat, tz = sm0.pos.z + sm0.right.z * lat;
    const want = Math.atan2(tx - kart.pos.x, tz - kart.pos.z);
    const err = wrapAngle(want - kart.yaw);
    out.steer = clamp(-err * 2.6, -1, 1);
    // curvature ahead: heading change over the next stretch
    const ahead = clamp(speed * 0.9, 12, 40);
    track.sample(s + 2, sm1); track.sample(s + 2 + ahead, sm2);
    const dh = wrapAngle(Math.atan2(sm2.tangent.x, sm2.tangent.z) - Math.atan2(sm1.tangent.x, sm1.tangent.z));
    const kappa = Math.abs(dh) / ahead;                      // 1/m
    const p = kart.params;
    const omegaAvail = p.turn * 0.72 * cornerGrip;            // rad/s available at top speed with understeer
    const safe = kappa > 1e-4 ? omegaAvail / kappa : 1e9;
    out.throttle = speed > safe ? 0 : 1;
    out.brake = speed > safe * 1.25 ? 1 : 0;
    // drift: press once when a sustained curve starts, hold through it, release near the exit for the mini-turbo
    out.drift = false;
    if (opts.drift) {
      if (state.cool > 0) state.cool--;
      if (!state.drifting) {
        if (kappa > 0.012 && kart.speed > 18 && state.cool === 0 && kart.grounded) { state.drifting = true; state.k0 = kappa; state.ticks = 0; }
      } else {
        state.ticks++;
        const over = kappa < state.k0 * 0.4 && state.ticks > 30;
        if (over || state.ticks > 60 * 6) { state.drifting = false; state.cool = 50; }
      }
      out.drift = state.drifting;
      if (state.drifting) out.steer = clamp(-err * 2.2, -1, 1);
    }
    return out;
  };
}

/**
 * Drive `kart` for up to `maxTime` seconds with `botFn`; returns lap stats.
 * @param {import('../src/kart/KartPhysics.js').KartPhysics} kart
 * @param {object} track
 * @param {Function} botFn from makeBot
 * @param {{laps?:number, maxTime?:number, onStep?:(k:object,t:number)=>void}} [opts]
 */
export function runLaps(kart, track, botFn, { laps = 1, maxTime = 200, onStep } = {}) {
  const dt = 1 / 60;
  let travelled = 0, last = kart.ground.s, time = 0, wallHits = 0, offRoad = 0, maxSpeed = 0;
  const lapTimes = [];
  let lapStart = 0, nextLap = track.length;
  while (time < maxTime && lapTimes.length < laps) {
    const inp = botFn();
    kart.update(dt, inp);
    time += dt;
    travelled += loopDiff(last, kart.ground.s, track.length); last = kart.ground.s;
    if (!kart.ground.onRoad) offRoad += dt;
    if (kart.speed > maxSpeed) maxSpeed = kart.speed;
    if (travelled >= nextLap) { lapTimes.push(time - lapStart); lapStart = time; nextLap += track.length; }
    if (onStep) onStep(kart, time);
  }
  return { lapTimes, time, travelled, offRoad, maxSpeed, wallHits };
}

/**
 * A human-like keyboard driver: DIGITAL steering (-1, 0, 1) with a dead band around the wanted heading, a reaction delay,
 * and small random hesitations (a key lifted for a few frames). It drives a look-ahead pursuit like `makeBot` but with
 * left / right keys instead of a smooth wheel. Press `drift` (hold) from `driftAtS` onwards when `opts.driftAtS` is set.
 * Deterministic (seeded).
 * @param {import('../src/kart/KartPhysics.js').KartPhysics} kart
 * @param {object} track
 * @param {{driftAtS?:number, driftEndS?:number, seed?:number, reaction?:number, wobble?:number, deadband?:number}} [opts]
 */
export function makeHumanBot(kart, track, opts = {}) {
  let seed = (opts.seed ?? 1) >>> 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const delay = Math.max(0, Math.round((opts.reaction ?? 0.12) * 60));
  const queue = new Array(delay + 1).fill(0);
  const wobble = opts.wobble ?? 0.35;         // chance per second of a hesitation
  const dead = opts.deadband ?? 0.10;
  let lift = 0, tick = 0;
  const out = { throttle: 1, brake: 0, steer: 0, drift: false };
  const sm = {};
  return function drive() {
    tick++;
    const s = kart.ground.s, speed = Math.max(kart.speed, 6);
    const look = clamp(5 + speed * 0.45, 9, 26);
    track.sample(s + look, sm);
    const err = wrapAngle(Math.atan2(sm.pos.x - kart.pos.x, sm.pos.z - kart.pos.z) - kart.yaw);
    let want = err > dead ? -1 : err < -dead ? 1 : 0;         // err > 0 = target is to the left
    if (lift > 0) { lift--; want = 0; } else if (rnd() < wobble / 60) lift = 3 + Math.floor(rnd() * 6);
    queue.push(want);
    out.steer = queue.shift();
    out.drift = opts.driftAtS !== undefined && s >= opts.driftAtS && (opts.driftEndS === undefined || s < opts.driftEndS);
    return out;
  };
}
