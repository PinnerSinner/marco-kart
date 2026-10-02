// AI tuning constants. Calibrated by test/race_sim_report.mjs against the kart physics; change them there, not inline.
export const AI_TUNE = Object.freeze({
  // Cornering: fraction of full steering lock planned for (scaled by skill); braking deceleration planned for (m/s^2)
  margin: 0.72, marginSkill: 0.16,
  voidMarginMul: 0.78,      // x margin on a track whose edges are mostly a drop into the void: plan the corners with more steering in hand, so a boosted kart brakes for them
  aBrake: 27,
  // Jump ramps: speed (m/s) held on the approach and over the ramp so a gap or void beyond the lip is cleared
  jumpSpeed: 28,
  // Steering
  kp: 2.4,
  kd: 0.35,
  lookBase: 5,
  lookGain: 0.3,
  // Drifting
  driftMinSpeed: 13,
  driftMinLen: 34,          // corner length (m) needed before drifting is worth it (charges at least level 1)
  driftMinAngle: 0.6,       // rad of turning needed
  driftMinDemand: 0.36,     // corner must demand at least this fraction of full lock (below it the drift's minimum yaw is too much)
  driftLead: 14,            // m before the corner start from which a drift may begin
  driftAnticipate: 0.3,     // s of travel ahead at which the path curvature is checked before hopping
  driftStartDemand: 0.42,   // fraction of full lock the path must demand (there) before the hop is made
  driftVoidMaxLen: 110,     // m: no drifting through a bend longer than this where the road edge is a drop into the void
  driftExitLead: 0.16,      // release this many seconds of travel before the corner ends (mini-turbo out of the exit)
  driftCooldown: 0.25,
  driftSteerMin: 0.3,       // minimum steer into the drift while it is held (the physics needs >= 0.3 to commit)
  driftKLat: 0.07,          // rad/s of yaw demand per metre of cross-track error while drifting
  driftKHead: 2.0,          // rad/s of yaw demand per radian of course error while drifting
  driftSpeedMul: 1.15,      // corner-speed allowance while drifting
  // Scanning
  scanEvery: 6,             // steps between the heavy perception updates (10 Hz at 60 Hz)
  aheadRange: 28,           // m look-ahead for kart avoidance
  clearance: 3.4,           // lateral clearance kept from other karts (m)
  boxRange: 72,             // m within which item boxes / boost pads attract the AI
  // Recovery
  stuckSpeed: 1.2,
  stuckTime: 1.0,
  reverseTime: 1.1,
});

/**
 * The AI tuning for a speed class. A class is a time scale `c` on the driving model (see kartTuning.classScale): speeds x c, accelerations x c^2,
 * rates x c, so the numbers that are speeds, decelerations or control rates scale with it and everything else (metres, fractions) stays.
 * Returns `T` itself at 100 Mbps (c = 1).
 * @param {typeof AI_TUNE} T @param {number} [c=1] class time scale
 * @returns {typeof AI_TUNE}
 */
export function classTune(T, c = 1) {
  if (!(c > 0) || c === 1) return T;
  const c2 = c * c;
  return Object.freeze({
    ...T,
    aBrake: T.aBrake * c2, jumpSpeed: T.jumpSpeed * c,
    driftMinSpeed: T.driftMinSpeed * c, driftKLat: T.driftKLat * c, driftKHead: T.driftKHead * c,
    stuckSpeed: T.stuckSpeed * c,
  });
}
