// LineDriver: the shared low-level controller behind AIDriver (racing) and AutoDriver (fibre link, cooldown laps).
// It follows the racing line with pure-pursuit steering and a curvature-limited speed profile, and adapts its
// speed if the kart cannot hold the line (saturated steering / running wide), so it copes with any physics tuning.
//
// Steering sign: steer +1 = turn RIGHT = yaw decreases, so a target to the LEFT (yaw error > 0) gives a NEGATIVE steer.
import { clamp, damp, wrapAngle } from '../core/util.js';
import { getRacingLine } from './RacingLine.js';

/**
 * Steering / speed numbers of a kart, read from the physics when it exposes them (`kart.params`), else estimated.
 * @param {object} kart
 * @returns {{turn:number, top:number, under:number, c:number, brake:number, driftLo:number, driftHi:number}} turn = full-lock yaw rate (rad/s), top = top speed (m/s), under = fraction of the yaw rate lost
 *   at top speed (kart type), c = speed-class time scale (1 at 100 Mbps; control rates scale with it), brake = the kart's braking deceleration (m/s^2)
 */
export function kartDynamics(kart) {
  const p = kart.params;
  const h = kart.stats?.handling ?? 3;
  return {
    turn: Number.isFinite(p?.turn) ? p.turn : 0.9 + 0.18 * h,
    top: Number.isFinite(p?.top) ? p.top : (kart.maxSpeed > 5 ? kart.maxSpeed : 33),
    under: Number.isFinite(p?.understeer) ? p.understeer : 0.28,
    c: Number.isFinite(p?.c) ? p.c : 1,
    brake: Number.isFinite(p?.brake) ? p.brake : Infinity,
    driftLo: Number.isFinite(p?.driftYawMin) ? p.driftYawMin : 0.28,
    driftHi: Number.isFinite(p?.driftYawMax) ? p.driftYawMax : 1.32,
  };
}

export class LineDriver {
  /**
   * @param {object} track
   * @param {object} [o]
   * @param {number} [o.weight=1]      racing-line strength 0..1 (1 = full out-in-out line, 0 = centreline)
   * @param {number} [o.turn=2.2]      kart yaw rate at full lock (rad/s), see kartDynamics()
   * @param {number} [o.top=33]        kart top speed (m/s), see kartDynamics()
   * @param {number} [o.margin=0.85]   fraction of full steering lock the driver plans to use in corners
   * @param {number} [o.aBrake=27]     braking deceleration (m/s^2) assumed when planning corner entry
   * @param {number} [o.pace=1]        fraction of the kart's own max speed the driver aims for (<= 1 for fair play)
   * @param {number} [o.kp=2.4]        steering proportional gain (per radian of heading error)
   * @param {number} [o.kd=0.35]       steering damping (per rad/s of yaw rate)
   * @param {number} [o.lookBase=5]    look-ahead distance at rest (m)
   * @param {number} [o.lookGain=0.3]  extra look-ahead per m/s of speed
   * @param {number} [o.jumpSpeed=28]  speed (m/s) held on the approach to and over a jump ramp (capped by the kart's own max speed)
   * @param {number} [o.under=0.28]    fraction of yaw rate the kart loses at top speed (see kartDynamics)
   * @param {number} [o.c=1]           speed-class time scale: the steering filter runs c times faster
   */
  constructor(track, { weight = 1, turn = 2.2, top = 33, margin = 0.85, aBrake = 27, pace = 1, kp = 2.4, kd = 0.35, lookBase = 5, lookGain = 0.3, jumpSpeed = 28, under = 0.28, c = 1 } = {}) {
    this.track = track;
    this.line = getRacingLine(track);
    this.weight = weight; this.turn = turn; this.top = top; this.margin = margin; this.aBrake = aBrake; this.pace = pace;
    this.under = under; this.c = c;
    this.kp = kp; this.kd = kd; this.lookBase = lookBase; this.lookGain = lookGain; this.jumpSpeed = jumpSpeed;
    this.shift = 0;            // dynamic lateral shift added to the line (m, + right), set by avoidance logic
    this.noise = 0;            // small lateral wobble (m) used to model imperfect drivers
    this.speedCap = Infinity;  // extra speed cap (m/s), e.g. following a slower kart
    this.trim = 1;             // adaptive speed multiplier 0.72..1
    this.cornerMul = 1;        // extra allowance on the corner speed (e.g. while drifting)
    this.satTime = 0;
    this.steerOut = 0;
    this.yawPrev = null;
    this.tgt = { x: 0, y: 0, z: 0 }; this.tgt2 = { x: 0, y: 0, z: 0 }; this.tgt3 = { x: 0, y: 0, z: 0 };
    // read-outs for the caller
    this.desiredLat = 0;       // desired lateral (m) at the kart's own s
    this.latErr = 0;           // kart lateral minus desired lateral
    this.headingErr = 0;       // rad, +ve = target is to the left
    this.steerRaw = 0;         // unclamped steering demand (drift mapping / adaptive trim)
    this.pathYaw = 0;          // heading (rad) of the intended path at the kart's own position
    this.pathK = 0;            // curvature (1/m, + = right) of the intended path a short way ahead
    this.targetSpeed = 0;
    this.profile = this.line.speedProfile({ turn, top, margin, aBrake, weight, under });
  }

  /** Rebuilds the speed profile after turn / top / margin / aBrake / weight changed. */
  refreshProfile() { this.profile = this.line.speedProfile({ turn: this.turn, top: this.top, margin: this.margin, aBrake: this.aBrake, weight: this.weight, under: this.under }); }

  /** Forgets transient state (after a respawn / teleport). */
  reset() { this.yawPrev = null; this.shift = 0; this.satTime = 0; this.trim = Math.max(this.trim, 0.9); this.steerOut = 0; }

  /**
   * Writes throttle / brake / steer into `out` for one fixed step.
   * @param {object} kart a KartPhysics-shaped kart
   * @param {number} dt seconds
   * @param {{throttle:number,brake:number,steer:number,drift:boolean}} out
   */
  drive(kart, dt, out) {
    const line = this.line;
    const s = kart.ground.s;
    const v = kart.speed;
    const vf = v > 0 ? v : 0;
    const look = clamp(this.lookBase + this.lookGain * vf, 6, 36);
    const sT = s + look;
    // ---- where do we want to be?
    const lim = Math.max(line.maxOffset(sT), line.at(line.room, sT));
    const lat = clamp(this.weight * line.at(line.off, sT) + this.shift + this.noise, -lim, lim);
    line.point(sT, lat, this.tgt);
    const latHere = clamp(this.weight * line.at(line.off, s) + this.shift + this.noise, -lim, lim);
    this.desiredLat = latHere;
    this.latErr = kart.ground.lateral - latHere;
    // path heading / curvature (used by the drift controller, which follows the path rather than a look-ahead point)
    line.point(s + 4, clamp(this.weight * line.at(line.off, s + 4) + this.shift + this.noise, -lim, lim), this.tgt2);
    line.point(s - 2, clamp(this.weight * line.at(line.off, s - 2) + this.shift + this.noise, -lim, lim), this.tgt3);
    this.pathYaw = Math.atan2(this.tgt2.x - this.tgt3.x, this.tgt2.z - this.tgt3.z);
    this.pathK = line.at(line.lk, s + vf * 0.2);
    // ---- steering (pure pursuit + yaw-rate damping)
    const dx = this.tgt.x - kart.pos.x, dz = this.tgt.z - kart.pos.z;
    const err = wrapAngle(Math.atan2(dx, dz) - kart.yaw);
    this.headingErr = err;
    const yawRate = this.yawPrev === null ? 0 : wrapAngle(kart.yaw - this.yawPrev) / dt;
    this.yawPrev = kart.yaw;
    let steerRaw = -(this.kp * err) + this.kd * clamp(yawRate, -4, 4);
    this.steerRaw = steerRaw;
    const steer = clamp(steerRaw, -1, 1);
    this.steerOut = damp(this.steerOut, steer, 22 * this.c, dt);
    out.steer = this.steerOut;
    // ---- adaptive speed trim: back off when the kart cannot follow the line, creep back up when it can
    if (Math.abs(steerRaw) > 1.15 && Math.abs(this.latErr) > 2.2 && vf > 8) this.satTime += dt;
    else this.satTime = Math.max(0, this.satTime - 2 * dt);
    if (this.satTime > 0.3) this.trim = Math.max(0.72, this.trim - 0.35 * dt);
    else this.trim = Math.min(1, this.trim + 0.06 * dt);
    // ---- speed
    const ahead = s + vf * 0.15;
    let vt = line.at(this.profile, ahead) * this.trim * this.cornerMul;
    const wide = Math.abs(this.latErr);
    if (wide > 3.5) vt *= 1 - clamp((wide - 3.5) / 12, 0, 0.3);
    vt = Math.min(vt, kart.maxSpeed * this.pace, this.speedCap);
    // approaching / crossing a jump ramp: no cornering trim, no follow-the-leader cap; hold the speed the jump needs
    if (line.at(line.pinW, ahead) > 0.5) vt = Math.max(vt, Math.min(kart.maxSpeed, this.jumpSpeed), Math.min(line.at(this.profile, ahead), kart.maxSpeed * this.pace));
    this.targetSpeed = vt;
    const dv = v - vt;
    if (Math.abs(err) > 1.9 && vf < 9) { out.throttle = 0.5; out.brake = 0; }     // facing the wrong way: swing round
    else if (dv > 1.2) { out.throttle = 0; out.brake = clamp((dv - 1.2) / 5, 0, 1); }
    else { out.brake = 0; out.throttle = clamp(-dv / 1.5 + 0.6, 0, 1); }
    out.drift = false;
    return out;
  }
}
