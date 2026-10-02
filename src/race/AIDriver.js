// AIDriver: one computer-controlled racer. Builds on LineDriver (racing line + pure pursuit + speed profile) and adds
// personality, kart / obstacle avoidance, item-box and boost-pad detours, drifting for mini-turbos, item use
// and stuck recovery. All perception runs at 10 Hz (staggered per driver); steering / pedals run every step.
// The AI never exceeds what its kart's physics allows: pace is a fraction of `kart.maxSpeed`; the only extra is the
// bounded `kart.speedScale` rubber-band factor (specialty difficulty and catch-up), if the kart supports it.
import { DIFFICULTIES } from '../core/config.js';
import { getCharacter, statsFor } from '../core/roster.js';
import { clamp, damp, makeRng, smoothstep, wrapAngle, wrapS } from '../core/util.js';
import { LineDriver, kartDynamics } from './LineDriver.js';
import { getRacingLine } from './RacingLine.js';
import { AI_TUNE, classTune } from './aiTuning.js';
import { decideItem } from './aiItems.js';
import { setSpeedScale } from './kartFactory.js';
import { planLateral, makeAvoidScratch } from './aiAvoid.js';

export class AIDriver extends LineDriver {
  /**
   * @param {import('./Race.js').Race} race
   * @param {object} racer the Racer this driver controls
   * @param {{index?: number}} [o] index = grid index (staggers perception, seeds the RNG)
   */
  constructor(race, racer, { index = 0 } = {}) {
    const c = race.speedC ?? 1;                                   // speed-class time scale (1 at 100 Mbps)
    const T = classTune(race.aiTune ?? AI_TUNE, c);
    const diff = race.difficulty ?? DIFFICULTIES[1];
    const ch = getCharacter(racer.charId);
    const stats = racer.kart.stats ?? statsFor(racer.charId, racer.kartId);
    const skillChar = ch.ai?.skill ?? 0.85;
    const skill = clamp(skillChar * diff.aiSkill, 0.3, 1);
    const dyn = kartDynamics(racer.kart);
    super(race.track, {
      ...dyn,
      weight: 0.55 + 0.45 * skill,
      margin: (T.margin + T.marginSkill * skill) * (getRacingLine(race.track).voidShare > 0.5 ? T.voidMarginMul : 1),
      aBrake: Math.min(T.aBrake * (0.85 + 0.15 * skill), dyn.brake * 0.85),     // never plan on more braking than this kart type has
      kp: T.kp, kd: T.kd, lookBase: T.lookBase, lookGain: T.lookGain + 0.06 * (1 - skill), jumpSpeed: T.jumpSpeed,
    });
    this.race = race; this.racer = racer; this.index = index;
    this.driftLo = dyn.driftLo; this.driftHi = dyn.driftHi;       // the kart type's drift yaw band (multipliers of the full-lock yaw rate)
    this.T = T;
    this.diff = diff;
    this.skill = skill;
    this.aggression = ch.ai?.aggression ?? 0.5;
    this.basePace = Math.min(1.03, diff.aiSpeed * (0.97 + 0.03 * skillChar) * (race.speedInfo?.aiPace ?? 1));
    this.rubberMul = race.speedInfo?.aiRubber ?? 1;                // the speed class scales how hard the rubber band pulls
    this.rng = makeRng(((race.seed ?? 1) * 7919 + (index + 1) * 104729) >>> 0);
    this.driftChance = clamp((skill - 0.45) / 0.45, 0, 1);
    this.reaction = 0.35 + (1 - skill) * 1.2;
    this.wobbleAmp = (1 - skill) * 1.3;
    this.wobblePhase = this.rng() * 6.28;
    this.padSeeker = skill > 0.55;
    this.pinned = 0;                         // 0..1: a jump ramp is being approached / crossed (see RacingLine._pinJumps)
    this.rubberT = 0;                        // -1..1, + = ahead of the reference racer (slow down)
    this.rocketStart = this.rng() < clamp(0.2 + 0.75 * skill, 0, 0.95);
    /** Item actions for this step (read by Race). */
    this.actions = { itemPressed: false, aimBack: false, aimForward: false, swapPressed: false };
    // perception results (refreshed at 10 Hz)
    this.frame = 0;
    this.aheadR = null; this.aheadDp = Infinity; this.aheadDLat = 0;
    this.behindR = null; this.behindDp = Infinity; this.behindDLat = 0;
    this.racersAhead = 0;
    this.threat = false;
    this.shiftTarget = 0;
    this.itemHeld = 0; this.itemHeldId = '';
    this.itemCooldown = 0;
    // drifting
    this.dOn = false; this.dDir = 0; this.dCorner = -1; this.dDecided = -2; this.dGo = false; this.dCool = 0; this.dT = 0; this.dInsideT = 0;
    // recovery
    this.stuckT = 0; this.reversing = false; this.revT = 0; this.revFlip = 1; this.lastRecover = -99;
    this.near = Array.from({ length: 8 }, () => ({ d: 0, dP: 0, speed: 0, alongside: false }));
    this.nearCount = 0;
    this.hazards = Array.from({ length: 10 }, () => ({ x: 0, z: 0, vx: 0, vz: 0, r: 0 }));
    this.avoid = makeAvoidScratch();
    this.attract = 0; this.attractW = 0;
  }

  /** Called by Race after a respawn / teleport. */
  reset() {
    super.reset();
    this.dOn = false; this.dCool = 0; this.dDecided = -2; this.stuckT = 0; this.reversing = false; this.shiftTarget = 0;
    this.cornerMul = 1;
  }

  /** Sets the normalised rubber-band gap (-1 behind .. +1 ahead of the reference racer). */
  setRubber(t) { this.rubberT = clamp(t, -1, 1); }

  /**
   * One fixed step of AI control.
   * @param {number} dt seconds
   * @param {{throttle:number,brake:number,steer:number,drift:boolean}} out receives the kart input
   */
  update(dt, out) {
    const T = this.T;
    const race = this.race, me = this.racer, kart = me.kart;
    const a = this.actions;
    a.itemPressed = false; a.aimBack = false; a.aimForward = false; a.swapPressed = false;
    this.frame++;
    if (this.itemCooldown > 0) this.itemCooldown -= dt;
    if (this.dCool > 0) this.dCool -= dt;
    // pace: base * rubber. Anything above the kart's stock top speed is delivered through the bounded speed scale.
    const rub = this.diff.rubber * this.rubberMul;
    const want = this.basePace * (1 - rub * this.rubberT);
    const scale = clamp(want, 1, 1 + rub + 0.02);
    const scaled = setSpeedScale(kart, scale);
    this.pace = scaled ? want / scale : Math.min(want, 1);
    // perception at 10 Hz
    const scanNow = (this.frame + this.index) % T.scanEvery === 0;
    if (scanNow) this._scan();
    // dynamic lateral shift and driver imperfection
    this.shift = damp(this.shift, this.shiftTarget, 3.2 * this.c, dt);
    // a jump ramp ahead: drive it square (no wobble, no dodging) and at speed
    const pin = this.line.at(this.line.pinW, kart.ground.s + 20);
    this.pinned = pin;
    this.noise = this.wobbleAmp * (1 - smoothstep(0.05, 0.6, pin)) * (Math.sin(race.time * 0.9 + this.wobblePhase) + 0.5 * Math.sin(race.time * 2.3 + 2 * this.wobblePhase));
    if (pin > 0.05) {                                          // dodging is allowed only inside the ramp's width
      const room = this.line.at(this.line.pinRoom, kart.ground.s + 20);
      this.shiftTarget = clamp(this.shiftTarget, -room, room);
      if (pin > 0.5) this.speedCap = Infinity;
    }
    if (kart.status.spin > 0 || (kart.status.respawning ?? 0) > 0) { this.dOn = false; this.cornerMul = 1; }
    this.drive(kart, dt, out);
    this._drift(dt, kart, out);
    this._recover(dt, kart, out);
    if (scanNow) decideItem(this, dt * T.scanEvery, a);
  }

  // ---- perception ---------------------------------------------------------------------------------------
  /** Neighbour bookkeeping (who is ahead / behind / alongside), attractor selection and the lateral plan. */
  _scan() {
    const T = this.T;
    const race = this.race, me = this.racer, kart = me.kart, line = this.line;
    const s = kart.ground.s, myLat = kart.ground.lateral;
    this.aheadR = null; this.aheadDp = Infinity; this.behindR = null; this.behindDp = Infinity;
    this.racersAhead = 0;
    let n = 0;
    for (const o of race.racers) {
      if (o === me || o.finished || (o.kart.status.respawning ?? 0) > 0) continue;
      const dP = o.progress - me.progress;
      if (o.place < me.place) this.racersAhead++;
      if (dP > 80 || dP < -50) continue;
      const oLat = o.kart.ground.lateral;
      const dLat = oLat - myLat;
      if (dP > 0 && dP < this.aheadDp) { this.aheadDp = dP; this.aheadR = o; this.aheadDLat = dLat; }
      if (dP < 0 && -dP < this.behindDp) { this.behindDp = -dP; this.behindR = o; this.behindDLat = dLat; }
      const alongside = dP <= 0.5 && dP > -3.5;
      if ((dP > 0.5 && dP < T.aheadRange) || alongside) {
        const rec = this.near[n++];
        rec.d = oLat - this.weight * line.at(line.off, o.kart.ground.s);    // the other kart's offset from OUR ideal line at its position
        rec.dP = dP; rec.speed = o.kart.speed; rec.alongside = alongside;
      }
    }
    this.nearCount = n;
    this._attractor(s, line.at(line.room, s) + 0.9);
    planLateral(this);
    this._threats(kart);
  }

  /** Picks the most attractive item box / boost pad ahead: sets `attract` (shift from the racing line, m) and `attractW` (0..1). */
  _attractor(s, half) {
    const T = this.T;
    const race = this.race, line = this.line, me = this.racer;
    const wantsItem = !(me.item && me.item2) && !me.itemRoulette;      // two item slots: keep collecting until both are full
    let best = 0, bestScore = 1e9, w = 0;
    if (wantsItem) {
      for (let i = 0; i < race.itemBoxes.length; i++) {
        const b = race.itemBoxes[i];
        if (!b.active) continue;
        const ds = wrapS(b.s - s, line.length);
        if (ds < 8 || ds > T.boxRange) continue;
        const d = b.lateral - this.weight * line.at(line.off, b.s);
        const score = Math.abs(d) + ((i * 7 + this.index * 3) % 3) * 0.5 + ds * 0.01;   // spread the field across a row
        if (Math.abs(d) < 6.5 && Math.abs(b.lateral) < half - 1.5 && score < bestScore) { bestScore = score; best = d; w = smoothstep(T.boxRange, 22, ds); }
      }
    }
    if (this.padSeeker && race.boostPads.length) {
      for (const p of race.boostPads) {
        const ds = wrapS(p.s - s, line.length);
        if (ds < 8 || ds > T.boxRange * 0.8) continue;
        const d = p.lateral - this.weight * line.at(line.off, p.s);
        if (Math.abs(d) < 5.5 && Math.abs(d) < bestScore) { bestScore = Math.abs(d); best = d; w = smoothstep(T.boxRange * 0.8, 20, ds); }
      }
    }
    this.attract = best; this.attractW = w;
  }

  /** Is anything dangerous heading for us? (drives when the firewall is used) */
  _threats(kart) {
    let threat = false;
    const me = this.racer;
    for (const e of this.race.items.entities) {
      if (e.ownerId === me.id) continue;
      if (e.type === 'ping') {
        const dx = kart.pos.x - e.pos.x, dz = kart.pos.z - e.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 55 * 55 && e.vel.x * dx + e.vel.z * dz > 0) {
          const d = Math.sqrt(d2) || 1;
          const cross = Math.abs((e.vel.x * dz - e.vel.z * dx) / (Math.hypot(e.vel.x, e.vel.z) || 1));
          if (cross < 5 && d > 4) threat = true;
        }
      } else if ((e.type === 'traceroute' || e.type === 'kernel_panic') && e.targetId === me.id) {
        const dx = kart.pos.x - e.pos.x, dz = kart.pos.z - e.pos.z;
        if (dx * dx + dz * dz < 130 * 130) threat = true;
      }
    }
    this.threat = threat;
  }

  // ---- drifting -----------------------------------------------------------------------------------------
  // Physics facts the AI relies on (see KartPhysics): while a drift is held the yaw rate is
  //   omega = turn * hi * lerp(0.28, 1.32, 0.5 + 0.5 * steer * dir)
  // so a drift can only follow a corner whose required yaw rate lies in that band, and the velocity direction lags the
  // heading (lateral grip is low), so the drift controller follows the PATH: feed-forward curvature plus cross-track and
  // course corrections, converted to a yaw-rate demand and mapped onto the steering input by `driftSteer`.

  /**
   * Steering input (into the corner = +) that yields `wanted` (fraction of normal full-lock yaw rate inside the drift band).
   * @param {number} wanted @param {number} [lo=0.28] yaw multiplier with the steering fully out (kart type) @param {number} [hi=1.32] ... fully in
   */
  static driftSteer(wanted, lo = 0.28, hi = 1.32) { return clamp((2 * (wanted - lo)) / (hi - lo) - 1, -1, 1); }

  /** Is this corner worth a drift? Long enough to charge a mini-turbo, tight enough for the drift's yaw band. */
  _wantsDrift(c, kart) {
    const T = this.T;
    if (c.len < T.driftMinLen || c.angle < T.driftMinAngle) return false;
    const mid = c.start * this.line.ds + c.len * 0.5;
    // a long bend above a drop into the void (a hairpin): the drift is let go part-way round (the corner tightens and eases against the drift's fixed minimum yaw), and
    // the mini-turbo then carries the kart through the rest of the bend at 45 m/s, over the edge. Take it at normal speed.
    if (c.len > T.driftVoidMaxLen && this.line.at(this.line.margin, mid) > 5) return false;
    const v = Math.min(this.line.at(this.profile, mid), kart.maxSpeed * this.pace);
    const q = (v * c.kMean) / (this.turn * 0.85);
    if (q < T.driftMinDemand + (this.driftLo - 0.28) || q > 1.15 + (this.driftHi - 1.32)) return false;
    return this.rng() < this.driftChance;
  }

  _endDrift() {
    this.dOn = false; this.dCool = this.T.driftCooldown; this.cornerMul = 1;
  }

  /** Yaw-rate demand of the path follower expressed as a fraction of normal full-lock yaw rate, + = into the corner. */
  _driftWanted(kart) {
    const T = this.T, v = Math.max(kart.speed, 6);
    const course = Math.atan2(kart.vel.x, kart.vel.z);
    const psi = wrapAngle(course - this.pathYaw);
    const omega = -v * this.pathK + T.driftKLat * this.latErr - T.driftKHead * psi;     // rad/s, + = yaw increasing (left)
    const hi = 1 - this.under * smoothstep(0.55, 1.1, v / this.top);
    return (-omega * this.dDir) / (this.turn * hi);
  }

  /**
   * Drift state machine. Press (steering into the corner) a few metres before a corner, hold through it, release near the
   * exit so the mini-turbo launches us onto the straight; in very long corners cash in at level 3 and re-hop.
   */
  _drift(dt, kart, out) {
    const T = this.T, line = this.line, race = this.race;
    if (race.state !== 'racing' || kart.status.autopilot || this.reversing || kart.status.spin > 0 || (kart.status.respawning ?? 0) > 0) {
      if (this.dOn) this._endDrift();
      return;
    }
    const s = kart.ground.s, v = kart.speed;
    if (!this.dOn) {
      this.cornerMul = 1;
      if (this.dCool > 0 || !kart.grounded || v < T.driftMinSpeed || (kart.status.stun ?? 0) > 0 || this.pinned > 0.02 || line.at(line.pinW, s + 45) > 0.02) return;
      const cid = line.cornerAhead(s, T.driftLead + v * 0.08);
      if (cid < 0) return;
      const c = line.corners[cid];
      if (this.dDecided !== cid) { this.dDecided = cid; this.dGo = this._wantsDrift(c, kart); }
      if (!this.dGo || Math.abs(this.latErr) > 3.2 || Math.abs(this.headingErr) > 0.35) return;   // only from a clean entry
      if (this.targetSpeed < v - 3) return;                                // still braking for this corner: the brake would cancel the drift at once (heavy karts brake late)
      // a drift cannot hold a straight line (its yaw rate never drops below 0.28 of full lock): start when the path really turns
      const hi = 1 - this.under * smoothstep(0.55, 1.1, v / this.top);
      const kAhead = line.at(line.lk, s + v * T.driftAnticipate) * c.sign;
      if ((kAhead * v) / (this.turn * hi) < T.driftStartDemand + (this.driftLo - 0.28)) return;
      const inside = line.cornerAt[line.index(s) | 0] === cid;
      const remain = wrapS(c.end * line.ds - s, line.length);
      if (inside && remain < Math.max(22, v * 0.7)) return;                 // too late to be worth it
      this.dOn = true; this.dDir = c.sign; this.dCorner = cid; this.dT = 0; this.dInsideT = 0;
      out.drift = true;                                                     // the press: hop
      out.steer = this.dDir * 0.6;
      return;
    }
    // ---- while drifting
    this.dT += dt;
    const c = line.corners[this.dCorner];
    const inside = line.cornerAt[line.index(s) | 0] === this.dCorner;
    const remain = inside ? wrapS(c.end * line.ds - s, line.length) : 0;
    const past = !inside && this.dT > 0.5;
    const exiting = inside && remain < Math.max(4, v * T.driftExitLead);
    const wanted = this._driftWanted(kart);
    this.dInsideT = wanted < this.driftLo - 0.08 ? this.dInsideT + dt : 0;                  // corner too gentle for the drift's minimum yaw
    const airborne = !kart.grounded && kart.airTime > 0.6;
    const notStarted = this.dT > 0.12 && !kart.drift.active;                // the physics refused or cancelled the drift (a held button would re-arm it the wrong way round)
    if (this.pinned > 0.02 || past || exiting || v < 9 || airborne || this.dT > 9 || this.dInsideT > 0.4 || notStarted) { this._endDrift(); return; }
    // cash in, re-hop (never above a drop into the void: the mini-turbo then carries the kart through the rest of a hairpin at 45 m/s, and braking cannot fight a boost)
    if (kart.drift.level >= 3 && remain > 45 && this.dT > 2.3 && v > 15 && line.at(line.margin, s) <= 5) { this._endDrift(); this.dCool = 0.12; return; }
    this.cornerMul = T.driftSpeedMul;
    out.drift = true;
    out.steer = this.dDir * AIDriver.driftSteer(wanted, this.driftLo, this.driftHi);
    if (this.dT < 0.12 && out.steer * this.dDir < 0.4) out.steer = this.dDir * 0.4;     // the hop needs steering held into the corner
  }

  // ---- stuck recovery -----------------------------------------------------------------------------------
  _recover(dt, kart, out) {
    const T = this.T;
    const race = this.race;
    if (race.state !== 'racing' || kart.status.spin > 0 || (kart.status.respawning ?? 0) > 0) { this.stuckT = 0; this.reversing = false; return; }
    if (this.reversing) {
      this.revT -= dt;
      out.throttle = 0; out.brake = 1; out.drift = false;
      out.steer = clamp(this.headingErr * 1.5, -1, 1) * this.revFlip;
      if (this.revT <= 0) this.reversing = false;
      return;
    }
    if (Math.abs(kart.speed) < T.stuckSpeed && out.throttle > 0.3) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - 2 * dt);
    if (this.stuckT > T.stuckTime) {
      this.stuckT = 0; this.reversing = true; this.revT = T.reverseTime;
      this.revFlip = race.time - this.lastRecover < 6 ? -this.revFlip : 1;
      this.lastRecover = race.time;
    }
  }
}
