// Tuning constants and the stat -> behaviour mapping for the arcade kart model (KartPhysics.js).
// Pure data + pure functions. Units: metres, seconds, radians.
// Every "feel" number lives here so the model can be retuned without touching the integrator.
//
// Three layers decide how a kart drives:
//   1. TUNING          the base numbers of a stat-3 "cruiser" at the standard 100 Mbps speed class
//   2. stats (1..5)    character + kart mods from roster.js statsFor(): top speed, acceleration time, turn rate, mass, drift charge rate
//   3. KART_PROFILES   one multiplier block per kart TYPE: grip, drift arc, mini-turbo size, off-road penalty, collision weight, air control...
// and the speed class (CFG.speedClasses, "Mbps") is a time scale on the result: see classScale().
import { CFG } from '../core/config.js';

export const TUNING = {
  // ---- speed / acceleration ---------------------------------------------------------------
  topSpeedMin: 30.5, topSpeedMax: 35,     // stat 1 -> 5 (m/s)
  timeToTopMax: 4.2, timeToTopMin: 2.4,   // 0 -> 98 % of top speed, stat 1 -> 5 (s)
  topFraction: 0.98,                      // what "reaching top speed" means for the acceleration curve
  brakeDecel: 34,                         // m/s^2 while braking and moving forward
  reverseAccel: 13, reverseMax: 9,        // m/s^2, m/s
  coastDrag: 0.9, coastDragLin: 0.06,     // coasting deceleration = a + b*speed  (m/s^2)
  excessDecel: 1.5, excessRate: 1.2,      // slowing towards a lowered cap: a + b*excess (m/s^2)
  airDrag: 0.05,                          // 1/s horizontal drag while airborne

  // ---- boost ------------------------------------------------------------------------------
  boostCapPerPower: 0.28,                 // cap multiplier = 1 + this * power
  boostAccel: 46,                         // m/s^2 (scaled by power) while below the boosted cap
  boostKick: 2.6,                         // instant m/s added by a fresh boost (scaled by power)
  boostPowerMax: 2.2,                     // a kart's own boost multiplier never pushes a boost beyond this power
  padSeconds: 1.1, padPower: 1.0,         // boost pad refresh
  driftBoostSeconds: [0.7, 1.2, 1.9],     // mini-turbo per drift level 1..3
  driftBoostPower: [0.9, 1.05, 1.25],     // ... and its power (top-speed cap 1 + 0.28 * power)
  perfectWindow: 0.15,                    // s after a level is reached in which releasing counts as a "perfect release"
  perfectSeconds: 0.25, perfectPower: 0.1,// ... and what it adds to that mini-turbo

  // ---- steering ---------------------------------------------------------------------------
  turnBase: 1.85, turnPerHandling: 0.20,  // peak full-lock yaw rate (rad/s) = base + per*(handling-1)
  turnLowSpeed: [0.3, 6.0],               // yaw authority ramps in over this speed range (no pivoting)
  pivot: 0.14,                            // yaw authority at standstill with full throttle (getting off a wall)
  understeer: 0.28,                       // fraction of yaw rate lost approaching top speed
  steerAttack: 9.5, steerRelease: 14,     // smoothing of the steering wheel (1/s)
  airSteer: 0.4,                          // fraction of steering authority while airborne

  // ---- grip / slip ------------------------------------------------------------------------
  gripRoad: 22,                           // lateral velocity relaxation rate on full grip (1/s)
  gripDrift: 4.4,                         // ... while drifting
  gripAir: 0.3,
  slipKeep: 0.92,                         // fraction of scrubbed lateral energy converted to forward speed

  // ---- drift ------------------------------------------------------------------------------
  hopVelocity: 5.4,                       // m/s vertical when hopping into a drift
  driftMinSpeed: 9,                       // must be at least this fast to hop into a drift
  driftHoldSpeed: 5, driftHoldGrace: 0.35,// an active drift survives dips down to this speed, and this long below it
  driftBrakeCancel: 0.6,                  // brake input that cancels a drift (no reward)
  driftEnterSteer: 0.3,                   // |steer| needed to commit to a drift
  driftKick: 0.11,                        // rad body swing when the drift starts
  driftYawMin: 0.28, driftYawMax: 1.32,   // yaw-rate multiplier: steering fully out .. fully in
  driftLevelTimes: [0.6, 1.3, 2.1],       // seconds of full-rate charging to reach level 1, 2, 3 (the HUD meter is 1/3 per level)
  chargeOutside: 0.6,                     // charge-rate multiplier with neutral or outward steering (inward >= chargeInSteer gives 1)
  chargeInSteer: 0.5,                     // steering into the drift beyond this gives the full rate
  chargeSpeedRef: 0.5,                    // fraction of top speed at and above which charging is at full rate (floor 0.6 below)
  driftAirLimit: 1.3, driftAirCharge: 0.5,// s airborne before a drift is cancelled / until charging pauses
  wallChargeKeep: 0.92,                   // charge kept on a scraping wall hit

  // ---- tricks -----------------------------------------------------------------------------------
  trickMinAir: 0.35,                      // s airborne before a trick may start
  trickDuration: 0.5, trickForgive: 0.85, // s per trick; a trick this far through when landing still counts
  trickMax: 4, trickTapWindow: 0.4,       // tricks per jump; double-tap window for steer-only tricks (s)
  trickBoostBase: 0.6, trickBoostPerTrick: 0.2, trickBoostPerAir: 0.35, trickBoostMax: 1.4,
  stumbleKeep: 0.85,                      // speed kept after a botched landing

  // ---- perfect take-off (hop pressed just before a ramp lip) -----------------------------------------------
  takeoffWindow: 0.25,                    // s: a hop press this recent (and not later than the take-off) makes the jump "perfect"
  takeoffMinVy: 3,                        // m/s upward speed that makes leaving the ground a take-off
  perfectJumpPower: 0.5, perfectJumpSeconds: 0.9, // the reward boost
  perfectJumpAir: 1.06,                   // a touch of extra air: vertical speed multiplier
  perfectJumpKick: 2.4,                   // m/s (100 Mbps terms) added straight away along the heading, so the jump itself carries further
  jumpHoldMax: 1.6,                       // s (100 Mbps terms): the boost clock waits for the landing for at most this long

  // ---- terrain ----------------------------------------------------------------------------
  slopeAlong: 0.32, slopeAcross: 0.18,    // fraction of gravity felt along / across the ground slope
  glue: 0.04,                             // m, ground contact tolerance
  glueVy: 0.35,                           // m/s tolerance above the ground-tangent vertical speed
  maxFall: 70, maxRise: 60,               // vertical speed clamps
  minNormalY: 0.35,                       // steeper normals are treated as this steep
  maxSnapUp: 1.5,                         // ground higher than this above the kart counts as solid, not a step

  // ---- walls ------------------------------------------------------------------------------
  wallRestitution: 0.28, wallRestitutionHead: 0.22,
  wallFriction: 0.22,                     // 1/s speed loss while scraping
  wallImpactLoss: 0.65,                    // extra fractional loss * (closing/speed)^2
  wallAlign: 9,                           // 1/s heading realignment towards the wall while scraping
  wallEventMin: 0.12, wallEventCooldown: 0.18,
  impactRef: 24,                          // m/s closing speed that maps to impact 1

  // ---- karts ------------------------------------------------------------------------------
  shrinkScale: 0.6, shrinkSpeed: 0.78, scaleRate: 6,
  spinTurns: 2, spinSpeedKeep: 0.35, spinDrag: 2.4, spinHop: 3.4,
  killYDefault: -40, voidDepth: 3,        // fall event when this far below the last ground
  staggerSteer: 0.5, staggerGrip: 0.4, staggerAccel: 0.35, // share of steering / grip / acceleration lost at the start of a post-bump stagger
  substepDist: 0.8,                       // m: a kart never moves further than this in one integration sub-step (no wall tunnelling)
  maxSubsteps: 4,
};

/**
 * Per-kart-type multipliers on top of the stat mapping. Every key is optional in a profile; BASE_PROFILE fills the rest.
 *   topMul accelMul accelShape   top speed, initial acceleration, shape a = a0 * (1 - u^shape) (2 = smooth, 3 = punchy launch and a long tail)
 *   turnMul turnLow pivot understeer wheel   full-lock yaw rate, speed (m/s) at which steering has full authority (low = tight at low speed),
 *                                            standstill pivot, fraction of yaw rate lost at top speed, steering-wheel response
 *   grip driftGrip               lateral grip on the road / while drifting (low = slides)
 *   driftYaw [min,max] driftKick charge   drift arc (yaw-rate multiplier steering out .. in), body swing, charge-clock speed
 *   miniSecs miniPower           size of the mini-turbo reward (duration, power)
 *   boost boostAccel boostKick   strength of pad / item boosts, how fast the boosted speed is reached, instant kick
 *   offRoad brake                fraction of the grass / sand / water penalty taken (1 = stock), braking strength
 *   massMul stagger bumpKeep     weight multiplier, seconds of reduced control after a hard bump (per impact), how much boost survives bumps (1 = stock loss)
 *   hop gravity air              drift-hop height, gravity multiplier (floaty .. heavy), steering authority in the air
 *   wallFriction wallImpact spinKeep   scraping loss, head-on loss, speed kept through a spin-out
 *   ratings                      1..5 for the extra kart-select bars (grip / drift / turbo / offroad), kept honest by a test
 */
export const BASE_PROFILE = Object.freeze({
  topMul: 1, accelMul: 1, accelShape: 2,
  turnMul: 1, turnLow: 6, pivot: TUNING.pivot, understeer: TUNING.understeer, wheel: 1,
  grip: 1, driftGrip: 1,
  driftYaw: [TUNING.driftYawMin, TUNING.driftYawMax], driftKick: TUNING.driftKick, charge: 1,
  miniSecs: 1, miniPower: 1,
  boost: 1, boostAccel: 1, boostKick: 1,
  offRoad: 1, brake: 1,
  massMul: 1, stagger: 0.3, bumpKeep: 1,
  hop: 1, gravity: 1, air: 1,
  wallFriction: 1, wallImpact: 1, spinKeep: TUNING.spinSpeedKeep,
  ratings: { grip: 3, drift: 3, turbo: 3, offroad: 3 },
});

/**
 * The four kart types (ids match roster.js KARTS). Numbers for a stat-3 character at 100 Mbps; see the table in the file header of test/drive_karts.test.js.
 * @type {Record<string, typeof BASE_PROFILE>}
 */
export const KART_PROFILES = {
  // Balanced and forgiving: no weakness, cheap mistakes.
  cruiser: {
    ...BASE_PROFILE,
    wallFriction: 0.6, wallImpact: 0.6, spinKeep: 0.5, stagger: 0.25,
    ratings: { grip: 3, drift: 3, turbo: 3, offroad: 3 },
  },
  // Light, nimble, takes the shortcut over the sand: quickest to accelerate and turn, lowest top speed, quick-charging but short mini-turbos, bounced by everybody.
  buggy: {
    ...BASE_PROFILE,
    topMul: 1.03, accelMul: 1.0,
    turnMul: 1.0, turnLow: 4, pivot: 0.22, understeer: 0.14, wheel: 1.3,
    grip: 1.15, driftGrip: 1.25,
    driftYaw: [0.36, 1.45], driftKick: 0.14, charge: 1.6,
    miniSecs: 0.8, miniPower: 1.0,
    boost: 0.95, boostAccel: 1.15,
    offRoad: 0.3, brake: 1.15,
    massMul: 0.8, stagger: 0.6, bumpKeep: 1.25,
    hop: 1.25, gravity: 0.88, air: 1.8,
    wallFriction: 1.3, wallImpact: 1.1, spinKeep: 0.25,
    ratings: { grip: 4, drift: 5, turbo: 2, offroad: 5 },
  },
  // Heavy bulldozer: highest top speed but slow to get there, wide arcs, slow drift charge that pays out enormous mini-turbos, shoves everything aside.
  hauler: {
    ...BASE_PROFILE,
    topMul: 0.985, accelMul: 0.85,
    turnMul: 0.95, turnLow: 8, pivot: 0.1, understeer: 0.33, wheel: 0.8,
    grip: 1.3, driftGrip: 0.8,
    driftYaw: [0.22, 1.05], driftKick: 0.08, charge: 0.7,
    miniSecs: 1.35, miniPower: 1.15,
    boost: 1.0, boostAccel: 0.8, boostKick: 0.8,
    offRoad: 1.25, brake: 0.7,
    massMul: 1.35, stagger: 0.12, bumpKeep: 0.4,
    hop: 0.75, gravity: 1.1, air: 0.4,
    wallFriction: 0.9, wallImpact: 0.9, spinKeep: 0.5,
    ratings: { grip: 5, drift: 2, turbo: 5, offroad: 2 },
  },
  // Punchy launch and strong boosts (they hit 30% harder); slides everywhere, hates the grass, brakes late.
  rocket: {
    ...BASE_PROFILE,
    topMul: 1.0, accelMul: 1.0, accelShape: 3,
    turnMul: 1.15, turnLow: 4.5, pivot: 0.18, understeer: 0.45, wheel: 1.5,
    grip: 0.36, driftGrip: 0.6,
    driftYaw: [0.3, 1.25], driftKick: 0.16, charge: 1.0,
    miniSecs: 1.0, miniPower: 1.15,
    boost: 1.3, boostAccel: 1.3, boostKick: 1.4,
    offRoad: 1.15, brake: 0.85,
    massMul: 0.95, stagger: 0.45, bumpKeep: 1.0,
    hop: 1.0, gravity: 1.0, air: 0.8,
    wallFriction: 1.1, wallImpact: 1.15, spinKeep: 0.3,
    ratings: { grip: 1, drift: 3, turbo: 4, offroad: 2 },
  },
};

/** @param {string} [kartId] @returns {typeof BASE_PROFILE} the profile of a kart type (unknown ids get the cruiser) */
export function profileFor(kartId) {
  return KART_PROFILES[kartId] ?? KART_PROFILES.cruiser;
}

/**
 * The extra 1..5 ratings shown under the four stat bars on the kart-select screen.
 * @param {string} kartId
 * @returns {{grip:number, drift:number, turbo:number, offroad:number}}
 */
export function kartRatings(kartId) {
  return { ...profileFor(kartId).ratings };
}

/**
 * Speed class (Mbps) scaling. A class is a TIME SCALE `c` on the driving model: speeds x c, accelerations and gravity x c^2,
 * yaw / grip / drag rates x c. Every trajectory (corner radius, jump arc, braking distance) is then geometrically the same at every class
 * and only the tempo changes, so tracks and the AI stay valid at 50 to 200 Mbps.
 * @param {number} [speedClass=100] 50 | 100 | 150 | 200
 * @returns {{id:number, c:number, c2:number}}
 */
export function classScale(speedClass = CFG.speedClasses.default) {
  const info = CFG.speedClasses.classes[speedClass] ?? CFG.speedClasses.classes[CFG.speedClasses.default];
  return { id: info.id, c: info.speed, c2: info.speed * info.speed };
}

const _shapeCache = new Map();
/**
 * Integral of du / (1 - u^p) from 0 to topFraction: the time (in units of top / a0) to reach topFraction of top speed
 * with the acceleration law a = a0 (1 - u^p). p = 2 gives atanh(topFraction).
 * @param {number} p exponent > 1
 */
export function accelIntegral(p) {
  const key = Math.round(p * 1000);
  let v = _shapeCache.get(key);
  if (v === undefined) {
    const n = 2000, hi = TUNING.topFraction, h = hi / n;
    const f = (u) => 1 / (1 - Math.pow(u, p));
    let s = f(0) + f(hi);
    for (let i = 1; i < n; i++) s += f(i * h) * (i % 2 ? 4 : 2);
    v = (s * h) / 3;
    _shapeCache.set(key, v);
  }
  return v;
}

/**
 * Map 1..5 stats (plus kart type and speed class) onto the physical numbers the integrator uses. Everything returned is already
 * scaled for the speed class (so `params.top` is the real top speed at that class and AI / audio / camera can read it directly).
 * @param {{speed:number, accel:number, handling:number, weight:number, raw?:object}} stats each 1..5; `stats.raw` (from roster.statsFor) keeps the unclamped sums so
 *   a high-stat character on a high-mod kart still beats a lower one
 * @param {string} [kartId='cruiser']
 * @param {number} [speedClass=100]
 * @returns {object} see the keys below
 */
export function deriveParams(stats, kartId = 'cruiser', speedClass = CFG.speedClasses.default) {
  const src = stats?.raw ?? stats;
  const s = (v) => Math.min(6, Math.max(0.5, Number.isFinite(v) ? v : 3));
  const speed = s(src?.speed), accel = s(src?.accel), handling = s(src?.handling), weight = s(src?.weight);
  const P = profileFor(kartId);
  const { c, c2, id } = classScale(speedClass);
  const top0 = (TUNING.topSpeedMin + ((speed - 1) / 4) * (TUNING.topSpeedMax - TUNING.topSpeedMin)) * P.topMul;
  const timeToTop = (TUNING.timeToTopMax - ((accel - 1) / 4) * (TUNING.timeToTopMax - TUNING.timeToTopMin)) / P.accelMul;
  // a(u) = a0 * (1 - u^p), u = v / top;  u = topFraction at t = timeToTop   (p = 2: u(t) = tanh(a0 t / top))
  const a00 = (top0 * accelIntegral(P.accelShape)) / timeToTop;
  const lo = P.turnLow;
  return {
    kartId, speedClass: id, c,
    top: top0 * c, timeToTop: timeToTop / c, a0: a00 * c2, accelP: P.accelShape,
    turn: (TUNING.turnBase + TUNING.turnPerHandling * (handling - 1)) * P.turnMul * c,
    turnLow: [TUNING.turnLowSpeed[0] * c, lo * c], pivot: P.pivot, understeer: P.understeer,
    steerAttack: TUNING.steerAttack * P.wheel * c, steerRelease: TUNING.steerRelease * P.wheel * c,
    mass: (0.8 + 0.25 * weight) * P.massMul,
    chargeRate: (0.85 + 0.05 * handling) * P.charge * c,
    weight, handling,
    gripRoad: TUNING.gripRoad * P.grip * c, gripDrift: TUNING.gripDrift * P.driftGrip * c, gripAir: TUNING.gripAir * c,
    driftYawMin: P.driftYaw[0], driftYawMax: P.driftYaw[1], driftKick: P.driftKick,
    driftMinSpeed: TUNING.driftMinSpeed * c, driftHoldSpeed: TUNING.driftHoldSpeed * c,
    miniSecs: P.miniSecs, miniPower: P.miniPower,
    boost: P.boost, boostAccel: TUNING.boostAccel * P.boostAccel * c2, boostKick: TUNING.boostKick * P.boostKick * c,
    offRoad: P.offRoad, bumpKeep: P.bumpKeep, stagger: P.stagger,
    brake: TUNING.brakeDecel * P.brake * c2, brakeRatio: P.brake,
    reverseAccel: TUNING.reverseAccel * c2, reverseMax: TUNING.reverseMax * c,
    coastDrag: TUNING.coastDrag * c2, coastDragLin: TUNING.coastDragLin * c,
    excessDecel: TUNING.excessDecel * c2, excessRate: TUNING.excessRate * c,
    airDrag: TUNING.airDrag * c,
    hopV: TUNING.hopVelocity * P.hop * c, spinHop: TUNING.spinHop * c,
    gravity: CFG.gravity * P.gravity * c2, slopeGravity: CFG.gravity * c2,
    airSteer: Math.min(1, TUNING.airSteer * P.air),
    wallFriction: TUNING.wallFriction * P.wallFriction * c, wallImpact: TUNING.wallImpactLoss * P.wallImpact, wallAlign: TUNING.wallAlign * c,
    spinKeep: P.spinKeep,
    trickMinAir: TUNING.trickMinAir / c, trickDuration: TUNING.trickDuration / c,
    takeoffMinVy: TUNING.takeoffMinVy * c,
  };
}
