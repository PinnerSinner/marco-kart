// Biscuit's easter eggs (the dog racer, `charId: 'biscuit'`): cheap, funny, all graceful. Pure logic, Node-importable; stepped by Race after the items.
// It never touches a track file: the hidden fire hydrant is placed from `track.sample` + the racing line, off the line but reachable.
//
// Bus events (all `egg:<name>`, payloads carry `id` (racer) and `isPlayer`):
//   egg:woof          { id, isPlayer, pos, cause: 'random'|'pigeon'|'hydrant'|'honk' }   Biscuit barks (sfx `egg-woof` is played here too)
//   egg:tongue        { id, isPlayer, pos }                      her boost started: tongue out (rate limited)
//   egg:pawprint      { id, isPlayer, pos }                      a drift (or zoomies) started: paw-print decals follow (drawn by RaceView)
//   egg:pigeon-chase  { id, isPlayer, entityId, pos }            a rival pigeon flew near her: she barks and (AI Biscuit) swerves after it
//   egg:hydrant       { id, isPlayer, isBiscuit, pos, outcome: 'boost'|'spin'|'blocked' }   somebody hit the hidden hydrant
//   egg:fanfare       { id, isPlayer, place: 1 }                 Biscuit won: a synthesised silly fanfare (sfx `egg-fanfare`)
// `race.eggs.woof(racer, 'honk')` is the hook for a future horn key (there is none today, so the bark is a rare random one).
import { bus } from '../core/bus.js';
import { clamp, makeRng, wrapS } from '../core/util.js';
import { STRIKE } from './itemDefs.js';

export const EGGS = Object.freeze({
  hydrantRadius: 0.62,        // m, plus the kart's radius
  hydrantCooldown: 4,         // s between two triggers of the same hydrant (it spurts for about 2 s)
  hydrantSpin: 1.1,           // s: the funny spin for everybody but Biscuit
  hydrantBoost: 0.7, hydrantBoostSeconds: 1.0,
  firstWoof: [14, 32],        // s into the race: the first random bark
  nextWoof: [24, 55],         // s between random barks
  tongueGap: 4,               // s between two tongue events
  pigeonRange: 26,            // m: a pigeon this close to Biscuit makes her bark
  chaseSeconds: 1.4,
  woofGap: 3,                 // s: never two barks in a row
});

/**
 * Where the hydrant goes on a track: a long straight, away from the start, jumps and the racing line, near a road edge so it is
 * reachable but not on the line. Pure and deterministic. Void-edged roads put it further in from the drop.
 * @param {object} track Track @param {object} [line] RacingLine (`getRacingLine(track)`)
 * @returns {{s:number, lateral:number, side:number, pos:{x:number,y:number,z:number}, yaw:number}|null}
 */
export function planHydrant(track, line) {
  const L = track?.length;
  if (!(L > 200) || typeof track.sample !== 'function') return null;
  const frac = ((Math.round(L * 7.13) % 1000) / 1000);                 // a stable "random" fraction per track
  const target = L * (0.3 + 0.4 * frac);
  const sm = {};
  let best = null, bestScore = Infinity;
  for (let s = L * 0.12; s < L * 0.92; s += 6) {
    const ok = line ? (line.at(line.pinW, s) <= 0.02 && line.at(line.pinW, s + 30) <= 0.02 && line.at(line.pinW, s - 30) <= 0.02) : true;
    if (!ok) continue;
    const straight = line ? line.at(line.straight, s) : 80;
    if (straight < 60) continue;
    let score = Math.abs(s - target);
    if (line && line.at(line.margin, s) > 5) score += L * 0.15;          // prefer walled stretches, fall back to void-edged ones
    if (score < bestScore) { bestScore = score; best = s; }
  }
  if (best === null) best = wrapS(target, L);
  track.sample(best, sm);
  const half = (sm.width ?? 18) / 2;
  const margin = line ? line.at(line.margin, best) : 3.6;
  const inset = Math.max(1.5, margin - 2.3);                          // the racing line's centre is `margin` from the edge: stay 2.3 m clear of it
  const off = line ? line.at(line.off, best) : 0;
  const side = off > 0 ? -1 : 1;
  const lateral = side * Math.max(0, half - inset);
  const x = sm.pos.x + sm.right.x * lateral, y = sm.pos.y + sm.right.y * lateral, z = sm.pos.z + sm.right.z * lateral;
  return { s: best, lateral, side, pos: { x, y, z }, yaw: Math.atan2(sm.tangent.x, sm.tangent.z) };
}

/** The race-side logic of the eggs. One per Race (`race.eggs`). */
export class EasterEggs {
  /** @param {import('./Race.js').Race} race */
  constructor(race) {
    this.race = race;
    this.rng = makeRng((race.seed ^ 0x5bd1e995) >>> 0);                // its own stream: the eggs never disturb the item / AI random sequence
    this.hydrant = null;
    try { this.hydrant = planHydrant(race.track, race.line); } catch { this.hydrant = null; }
    this.hydrantCd = 0;
    /** @type {object|null} */
    this.biscuit = race.racers.find((r) => r.charId === 'biscuit') ?? null;
    this._nextWoof = this._roll(EGGS.firstWoof);
    this._lastWoof = -99; this._lastTongue = -99;
    this._wasBoost = false; this._wasDrift = false;
    this._chased = new Set();
    this._chase = { t: 0, id: 0 };
  }

  _roll([a, b]) { return a + (b - a) * this.rng(); }

  /** Biscuit barks. `cause`: 'random' | 'pigeon' | 'hydrant' | 'honk'. Returns false when it is too soon after the last one. */
  woof(r = this.biscuit, cause = 'honk') {
    if (!r) return false;
    const t = this.race.simTime;
    if (t - this._lastWoof < EGGS.woofGap) return false;
    this._lastWoof = t;
    const pos = r.kart.pos.clone();
    bus.emit('egg:woof', { id: r.id, isPlayer: r.isPlayer, pos, cause });
    bus.emit('sfx', { name: 'egg-woof', pos, pitch: 0.92 + this.rng() * 0.2 });
    return true;
  }

  /** Per fixed step, after the items. */
  update(dt) {
    const race = this.race;
    if (race.state !== 'racing') return;
    this.hydrantCd = Math.max(0, this.hydrantCd - dt);
    if (this.hydrant) this._hydrant();
    const b = this.biscuit;
    if (!b || b.finished) return;
    const k = b.kart, t = race.simTime;
    // tongue out when a boost starts
    const boosting = k.boost.time > 0.2 && k.boost.power > 0.2;
    if (boosting && !this._wasBoost && t - this._lastTongue > EGGS.tongueGap) {
      this._lastTongue = t;
      bus.emit('egg:tongue', { id: b.id, isPlayer: b.isPlayer, pos: k.pos.clone() });
    }
    this._wasBoost = boosting;
    // paw prints start with a drift (or zoomies)
    const printing = (k.drift.active || b.zoomies > 0) && k.grounded;
    if (printing && !this._wasDrift) bus.emit('egg:pawprint', { id: b.id, isPlayer: b.isPlayer, pos: k.pos.clone() });
    this._wasDrift = printing;
    // a rare random bark (never while spun out or respawning)
    if (t >= this._nextWoof) {
      if (k.status.spin <= 0 && (k.status.respawning ?? 0) <= 0 && this.woof(b, 'random')) this._nextWoof = t + this._roll(EGGS.nextWoof);
      else this._nextWoof = t + 3;
    }
    this._pigeons(b);
    if (this._chase.t > 0) this._chase.t -= dt;
  }

  /** Rival pigeons flying near Biscuit: she barks once per pigeon and chases it. */
  _pigeons(b) {
    const ents = this.race.items?.entities;
    if (!ents) return;
    const k = b.kart, R2 = EGGS.pigeonRange * EGGS.pigeonRange;
    let any = false;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.type !== 'pigeon') continue;
      any = true;
      if (e.ownerId === b.id || this._chased.has(e.id)) continue;
      const dx = e.pos.x - k.pos.x, dz = e.pos.z - k.pos.z;
      if (dx * dx + dz * dz > R2) continue;
      this._chased.add(e.id);
      this._chase.t = EGGS.chaseSeconds; this._chase.id = e.id;
      bus.emit('egg:pigeon-chase', { id: b.id, isPlayer: b.isPlayer, entityId: e.id, pos: e.pos.clone() });
      this.woof(b, 'pigeon');
    }
    if (!any && this._chased.size) this._chased.clear();
  }

  /** The little swerve after a pigeon (AI Biscuit only: a human keeps the wheel). Called before the kart update; stays on walled, jump-free road. */
  beforeKart(r, inp) {
    if (r !== this.biscuit || r.isPlayer || !(this._chase.t > 0) || r.finished) return;
    const e = this.race.items?.findEntity?.(this._chase.id);
    const line = this.race.line, g = r.kart.ground;
    if (!e || (line && (line.at(line.pinW, g.s) > 0.02 || line.at(line.margin, g.s) > 5))) return;
    const half = (g.width ?? 18) / 2;
    const want = clamp(e.lat ?? 0, -(half - 4), half - 4);
    inp.steer = clamp(inp.steer + clamp((want - g.lateral) * 0.12, -0.3, 0.3), -1, 1);
  }

  /** Hydrant contact: Biscuit gets a tiny boost and a happy bark, everybody else spins. */
  _hydrant() {
    if (this.hydrantCd > 0) return;
    const h = this.hydrant, race = this.race;
    for (const r of race.racers) {
      if (r.finished) continue;
      const k = r.kart;
      const dx = k.pos.x - h.pos.x, dz = k.pos.z - h.pos.z, R = EGGS.hydrantRadius + k.radius;
      if (dx * dx + dz * dz > R * R || Math.abs(k.pos.y - h.pos.y) > 2.5 || (k.status.respawning ?? 0) > 0) continue;
      const isBiscuit = r.charId === 'biscuit';
      let outcome;
      if (isBiscuit) { k.applyBoost(EGGS.hydrantBoost, EGGS.hydrantBoostSeconds, 'item'); outcome = 'boost'; }
      else {
        const res = race.items.strike(r, null, 'hydrant', EGGS.hydrantSpin, 'hydrant');
        if (res === STRIKE.IGNORED) continue;
        outcome = res === STRIKE.BLOCKED ? 'blocked' : 'spin';
      }
      this.hydrantCd = EGGS.hydrantCooldown;
      const pos = { x: h.pos.x, y: h.pos.y, z: h.pos.z };
      bus.emit('egg:hydrant', { id: r.id, isPlayer: r.isPlayer, isBiscuit, pos, outcome });
      bus.emit('sfx', { name: 'egg-splash', pos });
      if (isBiscuit) this.woof(r, 'hydrant');
      return;
    }
  }

  /** A racer finished: Biscuit in first place gets the silly fanfare. */
  onFinish(r, place) {
    if (r.charId !== 'biscuit' || place !== 1) return;
    bus.emit('egg:fanfare', { id: r.id, isPlayer: r.isPlayer, place: 1 });
    bus.emit('sfx', { name: 'egg-fanfare' });
  }

  dispose() { this.hydrant = null; this._chased.clear(); this.biscuit = null; }
}
