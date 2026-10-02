// Shared helpers for the race_* tests and sim scripts (not a test file itself).
import { StubTrack } from '../src/track/StubTrack.js';
import { Race } from '../src/race/Race.js';
import { CHARACTERS, KARTS } from '../src/core/roster.js';
import { bus } from '../src/core/bus.js';
import { LineDriver, kartDynamics } from '../src/race/LineDriver.js';
import { AIDriver } from '../src/race/AIDriver.js';

export const DT = 1 / 60;

/** Eight entries, one per character, karts rotating through the four models. `humanId` marks one as the player. */
export function makeEntries(n = 8, humanId = null) {
  return CHARACTERS.slice(0, n).map((c, i) => ({
    id: c.id, name: c.name, charId: c.id, kartId: KARTS[i % KARTS.length].id, isPlayer: c.id === humanId,
  }));
}

/**
 * Builds a Race. Options: n, human (character id or null), difficulty, seed, laps, track, kartFactory.
 * @returns {Race}
 */
export function makeRace({ n = 8, human = null, difficulty = 'professional', seed = 1, laps, track, kartFactory } = {}) {
  const tr = track ?? new StubTrack();
  return new Race({ track: tr, entries: makeEntries(n, human), laps, difficulty, player: human, seed, kartFactory });
}

/** Steps a race until `cond(race)` is true or `maxSeconds` of sim time pass. Returns the number of steps taken. */
export function runUntil(race, cond, maxSeconds = 300, input = null, actions) {
  let steps = 0;
  const limit = Math.ceil(maxSeconds / DT);
  while (!cond(race) && steps < limit) { race.step(DT, typeof input === 'function' ? input(race, steps) : input, actions); steps++; }
  return steps;
}

/** Steps a whole race to the end. */
export function runToEnd(race, maxSeconds = 400, input = null) {
  return runUntil(race, (r) => r.state === 'finished', maxSeconds, input);
}

/** Skips the countdown. */
export function skipCountdown(race, input = null) {
  return runUntil(race, (r) => r.state === 'racing', 10, input);
}

/**
 * Records bus events. Returns { log, off } where log = [{ name, data, t }] in emission order.
 * @param {string[]} names event names
 * @param {Race} [race] used for timestamps
 */
export function recordEvents(names, race) {
  const log = [];
  const offs = names.map((name) => bus.on(name, (data) => log.push({ name, data, t: race ? race.time : 0 })));
  return { log, off: () => offs.forEach((o) => o()), of: (n) => log.filter((e) => e.name === n) };
}

/** Puts a racer at `s` metres / `lateral` metres on the track, facing along it, at rest. */
export function place(race, racer, s, lateral = 0) {
  const sm = race.track.sample(s);
  const pos = sm.pos.clone().addScaledVector(sm.right, lateral);
  racer.kart.teleport(pos, Math.atan2(sm.tangent.x, sm.tangent.z));
  race.track.query(racer.kart.pos, racer.kart.ground);
  race.tracker.init(racer, racer.kart.ground.s);       // re-derive the gate counter for the new position (no credit)
  racer.maxG = racer.g;
  racer.safeProgress = racer.progress;
}

/** Drives a racer's kart with a plain "straight along the road" controller (for scripted scenarios). */
export function cruiseInput(race, racer, throttle = 1) {
  const sm = race.track.sample(racer.kart.ground.s + 14);
  const dx = sm.pos.x - racer.kart.pos.x, dz = sm.pos.z - racer.kart.pos.z;
  let err = Math.atan2(dx, dz) - racer.kart.yaw;
  err = Math.atan2(Math.sin(err), Math.cos(err));
  return { throttle, brake: 0, steer: Math.max(-1, Math.min(1, -err * 2.5)), drift: false };
}

const bots = new WeakMap();

/**
 * A clean-lap "human" stand-in: the shared line controller at full pace (no drifting, no items).
 * Call once per step: `race.step(DT, humanBot(race))`.
 * @param {Race} race @param {object} [racer] defaults to the player
 * @returns {{throttle:number,brake:number,steer:number,drift:boolean}} an input object reused between calls
 */
export function humanBot(race, racer = race.player) {
  let b = bots.get(racer);
  if (!b || b.race !== race) {
    b = { race, drv: new LineDriver(race.track, { ...kartDynamics(racer.kart), weight: 1, margin: 0.85, pace: 1 }), inp: { throttle: 0, brake: 0, steer: 0, drift: false } };
    bots.set(racer, b);
  }
  if (race.state === 'racing') b.drv.drive(racer.kart, DT, b.inp); else { b.inp.throttle = 0; b.inp.brake = 0; b.inp.steer = 0; }
  return b.inp;
}

/**
 * Turns the human racer into an "expert player": the AI controller at the kart's true limits (pace 1.0, no rubber band,
 * no wobble, always drifts, full item logic) driving through the human input path. Used to calibrate difficulty.
 * @param {Race} race @param {object} [racer]
 */
export function makeExpert(race, racer = race.player) {
  const ai = new AIDriver(race, racer, { index: racer.gridIndex });
  ai.basePace = 1; ai.diff = { ...ai.diff, rubber: 0 }; ai.wobbleAmp = 0; ai.driftChance = 1; ai.reaction = 0.3;
  racer.expert = ai;
  racer.control = (r, dt, inp) => { ai.update(dt, inp); return ai.actions; };
  return ai;
}

/** Makes every racer except `keep` (a Racer or null) sit still under a no-op script, so a scenario is not disturbed. */
export function freezeOthers(race, keep = null) {
  for (const r of race.racers) if (r !== keep) { r.ai = null; r.control = () => {}; }
}

/** Counts NaN / non-finite kart state across the race. */
export function allFinite(race) {
  return race.racers.every((r) => [r.kart.pos.x, r.kart.pos.y, r.kart.pos.z, r.kart.yaw, r.kart.speed, r.progress].every(Number.isFinite));
}

export { Race, StubTrack, bus };
