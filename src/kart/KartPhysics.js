// KartPhysics: the arcade driving model. Implements SPEC.md section 4 exactly (see also kartTuning.js).
//
// Model in one paragraph: the kart is a point with a heading (yaw) and a horizontal velocity vector `vel`.
// Throttle / brake / drag act along the heading; a lateral "grip" relaxes the sideways part of the velocity
// towards the heading WITHOUT scrubbing speed, so slides look right but cost nothing. Yaw rate is set directly
// from the (smoothed) steering, speed-sensitive with mild understeer at the top end. A drift lowers the grip,
// swings the body, tightens the arc in the drift direction and charges a mini-turbo. Vertically the kart is a
// ballistic particle glued to the ground surface (contact projects the velocity onto the ground plane), so
// ramps launch you with the ground slope's vertical speed and crests only launch you when you are fast enough.
//
// CONVENTIONS (SPEC section 2): forward = (sin yaw, 0, cos yaw), steer +1 = right = yaw decreases.
// `pitch` / `roll` are THREE.js Euler angles for order 'YXZ': object.rotation.set(pitch, yaw, roll).
//   pitch > 0 = nose DOWN, roll > 0 = left side up (leaning right). `applyAttitude(object3D)` does exactly this.
// EVENT PAYLOADS: every `impact` is normalised 0..1 (closing speed / 24 m/s for walls and karts, / 22 m/s for landings).
// Deterministic: no clock, no randomness, no allocation in update().
//
// ---- DRIFT (v2) ---------------------------------------------------------------------------------------------------
// Hold `drift` while steering (|steer| >= 0.3) at > 9 m/s: hop + drift. The charge clock runs at full rate while steering
// into the drift (>= 0.5), at 60 % with neutral or outward steering (so holding a line never stalls it), scaled a little by
// speed. Levels at 0.6 / 1.3 / 2.1 s of full-rate charging; `drift.charge` is the HUD value 0..1 with one THIRD per level.
// Only braking (> 0.6), a spin, a heavy wall hit or < 5 m/s for 0.35 s cancel a drift; releasing pays a mini-turbo of
// 0.7 / 1.2 / 1.9 s (power 0.9 / 1.05 / 1.25), plus a small bonus if released within 0.15 s of reaching a level.
// Events: kart:drift-start {id, dir}, kart:drift-level {id, level}, kart:boost {kind:'drift', perfect}, kart:perfect-release {id, level}.
//
// ---- TRICKS ---------------------------------------------------------------------------------------------------------
// While airborne > 0.35 s (not the drift hop) `drift` pressed (+ steer) or a double tap of steer calls `tryTrick(dir)`.
// `kart.trick = { active, count, done, dir, t, score, visual: { progress 0..1, angle rad, axis 'spin'|'roll' } }`.
// Landing with every started trick finished pays a 'trick' boost (0.6..1.4 s); landing mid-trick is a stumble.
// Events: kart:trick {id, dir, count}, kart:trick-land {id, ok, boost, count}.
// `kart.autoTrick` (0..1, default 0): chance that this kart performs one trick per jump by itself (Specialty AIs).
//
// ---- TRACK / ITEM HOOKS (all NaN-safe, all timers in seconds) ----------------------------------------------------------
//   kart.applyForce(vec3, seconds)   push in m/s^2 (wind, current, conveyor), fades linearly to 0 over `seconds`; call it every
//                                    step you are inside the field with a short `seconds` (~0.15); the STRONGEST active force wins.
//   kart.setGrip(mult, seconds)      multiplies surface grip (0.05..1.5), e.g. 0.3 on a spill. The stronger effect wins.
//   kart.setSpeedCap(mult, seconds)  multiplies the top speed AND the boosted cap (0.1..2); the stronger effect wins.
//   kart.addImpulse(vec3)            instant velocity change in m/s (a positive y lifts the kart off the ground).
//   kart.bounce(normal, strength)    reflect off a surface with the given normal (away from the surface), leaving at >= strength m/s.
//   kart.speedScale                  multiplier on top speed and acceleration (rubber band), default 1.
//
// ---- KART TYPES AND SPEED CLASSES ---------------------------------------------------------------------------------------
// `params` (kartTuning.deriveParams) is built from the stats, the kart TYPE profile (grip, drift arc, mini-turbo size, off-road penalty, weight,
// air control... see KART_PROFILES) and the speed class. The speed class (`kart.speedClass`, 50 | 100 | 150 | 200 Mbps, `setSpeedClass()`) is a
// TIME SCALE c on the whole model: speeds x c, accelerations and gravity x c^2, rates x c, so jumps, corners and braking keep their geometry and the
// AI stays valid. The integration step is sub-divided when a kart would move further than T.substepDist in one step (no wall tunnelling).
//
// ---- PERFECT TAKE-OFF ------------------------------------------------------------------------------------------------------
// The physics remembers when the hop button (the drift key) was last pressed. Whenever the kart leaves the ground with an upward speed above
// ~3 m/s, or `launch(vy, { source })` is called, it emits `kart:takeoff { id, perfect, source, vy, isPlayer }`; `perfect` means the hop was pressed
// within T.takeoffWindow (0.25 s) BEFORE the take-off. A perfect take-off pays a small boost (applyBoost(0.5, 0.9, 'jump')), a touch of extra air,
// and emits `kart:perfect-jump { id, isPlayer }`. The drift hop itself, spin-out hops, impulses and bounces are not take-offs.
import * as THREE from 'three';
import { CFG, SURFACE_PROPS } from '../core/config.js';
import { bus } from '../core/bus.js';
import { clamp, clamp01, damp, lerp, smoothstep, angleDiff } from '../core/util.js';
import { TUNING as T, deriveParams, profileFor } from './kartTuning.js';
export { resolveKartCollisions } from './collisions.js';

const MAX_DT = 1 / 30;
const _wn = new THREE.Vector3();
const TWO_PI = Math.PI * 2;
const finite = (v) => Number.isFinite(v);
const _Z = new THREE.Vector3();
const num = (v) => (finite(v) ? v : 0);
/** Small deterministic hash of a string id -> uint32 (seeds the per-kart auto-trick roll). */
function hashId(id) { let h = 2166136261; const t = String(id); for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; }
const easeOutCubic = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const easeInOut = (t) => t * t * (3 - 2 * t);

export class KartPhysics {
  /**
   * @param {object} track Track interface (SPEC section 3): query(), collideWalls(), killY.
   * @param {{id?:string, charId?:string, kartId?:string, stats?:{speed:number,accel:number,handling:number,weight:number}}} [opts]
   */
  constructor(track, { id = 'k', charId = 'marco', kartId = 'cruiser', stats = { speed: 3, accel: 3, handling: 3, weight: 3 }, speedClass = CFG.speedClasses.default } = {}) {
    this.track = track; this.id = id; this.charId = charId; this.kartId = kartId; this.stats = stats;
    this.speedClass = speedClass; this.isPlayer = false;
    this.params = deriveParams(stats, kartId, speedClass);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.prevPos = new THREE.Vector3(); this.prevYaw = 0;         // previous fixed step, for render interpolation
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.speed = 0; this.steer = 0; this.slip = 0;
    this.grounded = true; this.airTime = 0;
    this.radius = CFG.kart.radius; this.scale = 1;
    this.mass = this.params.mass;
    this.maxSpeed = this.params.top; this._capBase = this.params.top;
    this.drift = { active: false, dir: 1, charge: 0, level: 0, hop: false };
    this.trick = { active: false, count: 0, done: 0, dir: 1, t: 0, score: 0, visual: { progress: 0, angle: 0, axis: 'spin' } };
    this.speedScale = 1; this.autoTrick = 0;
    this.boost = { time: 0, power: 0 };
    this.status = { spin: 0, stun: 0, invincible: 0, autopilot: false, respawning: 0 };
    this.ground = { height: 0, normal: new THREE.Vector3(0, 1, 0), surface: 'road', onRoad: true, s: 0, lateral: 0, inVoid: false };
    // private state
    this._tick = 0; this._bumpTick = -100; this._wallTick = -100;
    this._prevDrift = false; this._armed = false; this._airDrift = 0;
    this._spinT = 0; this._spinDur = 1; this._spinYaw0 = 0; this._spinDir = 1;
    this._fallen = false; this._lastGroundY = 0; this._surface = 'road'; this._bumpRoll = 0; this._pt = 0; this._rt = 0;
    this._safe = new Float64Array(7); this._nanCount = 0;
    this._wasBoosting = false;
    this._dc = 0; this._levelT = 9; this._slowT = 0; this._pressEdge = false;
    this._tapZone = 0; this._tapDir = 0; this._tapT = 0; this._autoDone = false;
    this._idHash = hashId(id);
    this._force = new THREE.Vector3(); this._forceT = 0; this._forceDur = 1;
    this._gripMul = 1; this._gripT = 0; this._capMul = 1; this._capT = 0;
    this._t = 0; this._hopAt = -1e9; this._stagger = 0; this._jumpHold = false; this._tanVy = 0;
  }

  /**
   * Change the speed class (Mbps) of this kart: rebuilds `params`. Call before the race starts (Race does it when it creates the karts).
   * @param {number} speedClass 50 | 100 | 150 | 200
   */
  setSpeedClass(speedClass) {
    this.speedClass = speedClass;
    this.params = deriveParams(this.stats, this.kartId, speedClass);
    this._capBase = this.params.top; this.maxSpeed = this.params.top; this.speedClass = this.params.speedClass;
  }

  // ---- public API ---------------------------------------------------------------------------------------------

  /** Reset all motion and drift and place the kart on the ground at `pos` facing `yaw`. Used for the grid and respawns. */
  teleport(pos, yaw) {
    this.pos.copy(pos); this.prevPos.copy(pos);
    if (!this._sane(this.pos)) this.pos.set(0, 0, 0);
    this.vel.set(0, 0, 0); this.yaw = num(yaw); this.prevYaw = this.yaw;
    this.speed = 0; this.steer = 0; this.slip = 0; this.airTime = 0; this.grounded = true;
    this.status.spin = 0; this._spinT = 0; this._fallen = false; this._bumpRoll = 0;
    this._prevDrift = false; this._armed = false; this._airDrift = 0;
    const d = this.drift; d.active = false; d.charge = 0; d.level = 0; d.hop = false; this._dc = 0; this._slowT = 0;
    this._resetTrick(); this._force.set(0, 0, 0); this._forceT = 0; this._gripT = 0; this._capT = 0; this._tapT = 0;
    this._hopAt = -1e9; this._stagger = 0; this._jumpHold = false;
    this.boost.time = 0; this.boost.power = 0; this._wasBoosting = false;
    this.track.query(this.pos, this.ground);
    if (this._hasGround()) this.pos.y = this.ground.height;
    this.prevPos.copy(this.pos);
    this._lastGroundY = this.pos.y; this._surface = this.ground.surface;
    this._attitudeTargets(); this.pitch = this._pt; this.roll = this._rt;
    this._store();
  }

  /**
   * Grant a speed boost. Boosts do not stack: the longer time and the higher power win.
   * @param {number} [power=1] ~1 normal, 1.6 fibre. Top speed cap becomes top * (1 + 0.28 * power).
   * @param {number} [seconds=1]
   * @param {'item'|'drift'|'pad'|'start'|'fibre'|'trick'} [kind='item'] @param {boolean} [perfect=false] flags a perfect drift release in the event
   */
  applyBoost(power = 1, seconds = 1, kind = 'item', perfect = false) {
    power = finite(power) ? clamp(power, 0, 3) : 1; seconds = finite(seconds) ? clamp(seconds, 0, 20) : 1;
    const kb = this.params.boost;       // the kart type's boost strength (pads, items, jumps); mini-turbos and the rocket start have their own numbers
    if (kb !== 1 && kind !== 'drift' && kind !== 'start') power = Math.min(power * kb, Math.max(power, T.boostPowerMax));
    const b = this.boost, fresh = b.time <= 0.05;
    b.time = Math.max(b.time, seconds);
    b.power = fresh ? power : Math.max(b.power, power);
    this.maxSpeed = this._capBase * (1 + T.boostCapPerPower * b.power);
    if (fresh && this.grounded && this.speed > -1) this._kick(this.params.boostKick * power);
    bus.emit('kart:boost', { id: this.id, kind, power, duration: seconds, perfect: !!perfect });
  }

  /**
   * Spin the kart out (hit by an item, obstacle...). Ignored while invincible or already spinning.
   * @param {number} [seconds=1.4] @param {string} [cause='hit'] @returns {boolean} false if it had no effect
   */
  spinOut(seconds = 1.4, cause = 'hit') {
    const st = this.status;
    if (st.invincible > 0 || st.spin > 0 || this._fallen) return false;
    seconds = finite(seconds) ? clamp(seconds, 0.3, 6) : 1.4;
    st.spin = seconds; this._spinDur = seconds; this._spinT = 0; this._spinYaw0 = this.yaw;
    this._spinDir = this.steer !== 0 ? Math.sign(this.steer) : (this.drift.active ? this.drift.dir : 1);
    this._endDrift(false); this._resetTrick();
    this.vel.x *= this.params.spinKeep; this.vel.z *= this.params.spinKeep;
    this.boost.time = 0; this.boost.power = 0; this._jumpHold = false;
    if (this.grounded) this._pop(this.params.spinHop);
    bus.emit('kart:spin', { id: this.id, cause });
    return true;
  }

  /** Shrink the kart (Regional Outage). Ignored while invincible. @param {number} [seconds=6] @returns {boolean} */
  shrink(seconds = 6) {
    if (this.status.invincible > 0) return false;
    seconds = finite(seconds) ? clamp(seconds, 0, 30) : 6;
    this.status.stun = Math.max(this.status.stun, seconds);
    bus.emit('kart:shrink', { id: this.id, seconds });
    return true;
  }

  /** Set the invincibility timer (seconds). Blocks spinOut() and shrink(). */
  setInvincible(seconds) { this.status.invincible = Math.max(0, num(seconds)); }

  /**
   * Pop into the air with vertical speed `vy` (m/s, in 100 Mbps terms: it is scaled with the speed class so the arc keeps its shape).
   * An upward launch is a take-off: it emits `kart:takeoff { id, perfect, source, vy }` and pays the perfect-jump boost when the hop
   * button was pressed within 0.25 s before (see the file header).
   * @param {number} vy vertical speed, m/s @param {{source?: 'ramp'|'vehicle'|'pad'}} [opts] who launched the kart (default 'ramp')
   */
  launch(vy, { source = 'ramp' } = {}) {
    const c = this.params.c, v = num(vy);
    this._pop(v * (v > 0 ? c : 1));
    if (v > 0.5) this._takeoff(source, v);
  }

  /** Raw vertical pop (hop, spin-out hop): no take-off logic. @param {number} vy m/s as applied */
  _pop(vy) { this.vel.y = clamp(num(vy), -T.maxFall, T.maxRise); this.grounded = false; this.airTime = 0; }

  /**
   * A take-off happened: decide whether it was perfect, pay the reward and announce it.
   * @param {string} source @param {number} vy class-normalised vertical speed for the event payload
   */
  _takeoff(source, vy) {
    const since = this._t - this._hopAt;
    const perfect = since >= -1e-6 && since <= T.takeoffWindow + 1e-4 && !this._fallen && this.status.spin <= 0;
    bus.emit('kart:takeoff', { id: this.id, perfect, source, vy, isPlayer: this.isPlayer });
    if (!perfect) return;
    this._hopAt = -1e9;                                              // one press pays once
    this.vel.y = clamp(this.vel.y * T.perfectJumpAir, -T.maxFall, T.maxRise);
    this.applyBoost(T.perfectJumpPower, T.perfectJumpSeconds, 'jump');
    this._jumpHold = true;
    this._kick(T.perfectJumpKick * this.params.c);                  // and an instant shove forward that carries through the air
    bus.emit('kart:perfect-jump', { id: this.id, isPlayer: this.isPlayer });
  }

  /**
   * Push the kart with an acceleration (wind, current, conveyor). Fades linearly to zero over `seconds`; the strongest active force wins.
   * @param {{x:number,y?:number,z:number}} vec m/s^2 in world axes @param {number} [seconds=0.25]
   */
  applyForce(vec, seconds = 0.25) {
    if (!vec || !finite(vec.x) || !finite(vec.z)) return;
    const y = finite(vec.y) ? vec.y : 0;
    seconds = finite(seconds) ? clamp(seconds, 0.01, 30) : 0.25;
    const cur = this._forceT > 0 ? this._force.length() * (this._forceT / this._forceDur) : 0;
    const mag = Math.sqrt(vec.x * vec.x + y * y + vec.z * vec.z);
    if (mag < cur * 0.999 && this._forceT > 0) return;
    const k = mag > 80 ? 80 / mag : 1;
    this._force.set(vec.x * k, y * k, vec.z * k); this._forceT = seconds; this._forceDur = seconds;
  }

  /** Multiply surface grip for a while (spill, ice). @param {number} mult 0.05..1.5 @param {number} seconds */
  setGrip(mult, seconds) {
    if (!finite(mult) || !finite(seconds) || seconds <= 0) return;
    mult = clamp(mult, 0.05, 1.5);
    if (this._gripT <= 0 || Math.abs(mult - 1) >= Math.abs(this._gripMul - 1)) this._gripMul = mult;
    this._gripT = Math.max(this._gripT, Math.min(seconds, 60));
  }

  /** Multiply the top speed (and boosted cap) for a while (mud and the like). @param {number} mult 0.1..2 @param {number} seconds */
  setSpeedCap(mult, seconds) {
    if (!finite(mult) || !finite(seconds) || seconds <= 0) return;
    mult = clamp(mult, 0.1, 2);
    if (this._capT <= 0 || Math.abs(mult - 1) >= Math.abs(this._capMul - 1)) this._capMul = mult;
    this._capT = Math.max(this._capT, Math.min(seconds, 60));
  }

  /** Instant velocity change in m/s (shove, cannon). A positive y lifts the kart off the ground. @param {{x:number,y?:number,z:number}} vec */
  addImpulse(vec) {
    if (!vec || !finite(vec.x) || !finite(vec.z) || (vec.y !== undefined && !finite(vec.y))) return;
    const y0 = vec.y ?? 0, y = y0 > 0 ? y0 * this.params.c : y0, m = Math.sqrt(vec.x * vec.x + y * y + vec.z * vec.z), k = m > 80 ? 80 / m : 1;
    this.vel.x += vec.x * k; this.vel.z += vec.z * k;
    if (y * k > 0.2) { this.vel.y = clamp(this.vel.y + y * k, -T.maxFall, T.maxRise); if (this.grounded) { this.grounded = false; this.airTime = 0; } }
    else this.vel.y = clamp(this.vel.y + y * k, -T.maxFall, T.maxRise);
    if (this.drift.active && m * k > 12) this.drift.charge *= 0.5;
  }

  /**
   * Bounce off a surface (bumper, trampoline, another body). Removes the velocity into the surface and leaves along the normal at
   * >= `strength` m/s (restitution 1 on the incoming part). Emits kart:bounce {id, impact}.
   * @param {{x:number,y?:number,z:number}} normal points AWAY from the surface (need not be unit) @param {number} [strength=8] m/s
   */
  bounce(normal, strength = 8) {
    if (!normal || !finite(normal.x) || !finite(normal.z) || (normal.y !== undefined && !finite(normal.y))) return;
    strength = finite(strength) ? clamp(strength, 0, 60) : 8;
    let nx = normal.x, ny = normal.y ?? 0, nz = normal.z;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(l > 1e-6)) return;
    nx /= l; ny /= l; nz /= l;
    const v = this.vel, vn = v.x * nx + v.y * ny + v.z * nz;
    const out = Math.max(strength, vn < 0 ? -vn : 0);
    const add = out - vn;                        // vn < out always here: ends with normal speed `out`
    v.x += nx * add; v.y += ny * add; v.z += nz * add;
    v.y = clamp(v.y, -T.maxFall, T.maxRise);
    if (v.y > 1 && this.grounded) { this.grounded = false; this.airTime = 0; }
    if (this.drift.active && out > 10) this._endDrift(false);
    bus.emit('kart:bounce', { id: this.id, impact: clamp01(out / T.impactRef) });
  }

  /**
   * Try to start an air trick (also what the input calls). Needs > 0.35 s of air, no drift hop, no trick in progress, < 4 per jump.
   * @param {number} [dir=1] -1 left, +1 right (0 = right) @returns {boolean} whether a trick started
   */
  tryTrick(dir = 1) {
    const tr = this.trick;
    if (this.grounded || this._fallen || this.status.spin > 0 || this.drift.hop || tr.active || tr.count >= T.trickMax || !(this.airTime > this.params.trickMinAir)) return false;
    if (this.drift.active) this._endDrift(false);
    tr.active = true; tr.t = 0; tr.dir = dir < 0 ? -1 : 1; tr.count++;
    tr.visual.axis = tr.count % 2 === 1 ? 'spin' : 'roll'; tr.visual.progress = 0; tr.visual.angle = 0;
    bus.emit('kart:trick', { id: this.id, dir: tr.dir, count: tr.count });
    return true;
  }

  /** Set a THREE.Object3D's rotation from this kart's attitude (Euler order YXZ). */
  applyAttitude(obj) { obj.rotation.order = 'YXZ'; obj.rotation.set(this.pitch, this.yaw, this.roll); }

  /**
   * Advance the kart by one fixed step.
   * @param {number} dt seconds (1/60)
   * @param {{throttle?:number, brake?:number, steer?:number, drift?:boolean}} input
   */
  update(dt, input) {
    if (!(dt > 0)) return;
    if (dt > MAX_DT) dt = MAX_DT;
    this._tick++; this._t += dt;
    this.prevPos.copy(this.pos); this.prevYaw = this.yaw;
    const P = this.params;

    const st = this.status;
    st.stun = Math.max(0, st.stun - dt); st.invincible = Math.max(0, st.invincible - dt);
    st.respawning = Math.max(0, st.respawning - dt);
    const b = this.boost;
    // a perfect take-off's boost waits for the landing (thrust only works on the ground), so the reward is never spent in the air
    if (this._jumpHold && (this.grounded || this.airTime > T.jumpHoldMax / P.c)) this._jumpHold = false;
    if (!this._jumpHold) b.time = Math.max(0, b.time - dt);
    if (b.time === 0) b.power = 0;
    this._forceT = Math.max(0, this._forceT - dt); this._gripT = Math.max(0, this._gripT - dt); this._capT = Math.max(0, this._capT - dt);
    if (this._gripT === 0) this._gripMul = 1;
    if (this._capT === 0) this._capMul = 1;
    this._stagger = Math.max(0, this._stagger - dt);
    const stg = P.stagger > 0 ? clamp01(this._stagger / P.stagger) : 0;       // 1 just after a hard bump, fading to 0
    const scale = finite(this.speedScale) ? clamp(this.speedScale, 0.5, 2) : 1;

    // scale / radius / mass follow the shrink state
    this.scale = damp(this.scale, st.stun > 0 ? T.shrinkScale : 1, T.scaleRate, dt);
    this.radius = CFG.kart.radius * this.scale;
    this.mass = this.params.mass;

    // ---- controls ---------------------------------------------------------------------------------------------
    const spinning = st.spin > 0;
    const controllable = !spinning && !this._fallen;
    const th = controllable && input ? clamp01(num(input.throttle)) : 0;
    const br = controllable && input ? clamp01(num(input.brake)) : 0;
    const steerIn = controllable && input ? clamp(num(input.steer), -1, 1) : 0;
    const driftIn = controllable && input ? !!input.drift : false;
    const driftRaw = input ? !!input.drift : false;

    const rate = (Math.abs(steerIn) > Math.abs(this.steer) && steerIn * this.steer >= 0) ? P.steerAttack : P.steerRelease;
    this.steer = damp(this.steer, steerIn, rate, dt);
    if (Math.abs(this.steer) < 1e-4 && steerIn === 0) this.steer = 0;

    // ---- surface, caps ----------------------------------------------------------------------------------------
    const g = this.ground;
    const sp = SURFACE_PROPS[g.surface] ?? SURFACE_PROPS.road;
    // the kart type decides how much of the grass / sand / water penalty it takes (Buggy: little, Hauler and Rocket: more)
    let surfSpeed = sp.speed, surfGrip = sp.grip;
    if (P.offRoad !== 1 && (g.surface === 'grass' || g.surface === 'sand' || g.surface === 'water')) {
      surfSpeed = clamp(1 - (1 - sp.speed) * P.offRoad, 0.3, 1); surfGrip = clamp(1 - (1 - sp.grip) * P.offRoad, 0.2, 1);
    }
    const surfaceMul = this.grounded ? surfSpeed : 1;
    const shrinkMul = 1 - (1 - T.shrinkSpeed) * clamp01((1 - this.scale) / (1 - T.shrinkScale));
    const top = P.top * scale * surfaceMul * shrinkMul * this._capMul;
    const boostMul = b.time > 0 ? 1 + T.boostCapPerPower * b.power : 1;
    const cap = top * boostMul;
    this._capBase = top; this.maxSpeed = cap;
    const grip = this.grounded ? clamp(surfGrip, 0, 1) * this._gripMul : 1;

    // ---- drift state machine ----------------------------------------------------------------------------------
    this._driftStep(dt, driftIn, driftRaw, steerIn, br);
    this._trickStep(dt, steerIn);

    // ---- yaw ----------------------------------------------------------------------------------------------------
    let vx = this.vel.x, vz = this.vel.z;
    let fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let vf = vx * fx + vz * fz;
    let V = Math.sqrt(vx * vx + vz * vz);
    if (spinning) {
      this._spinT += dt;
      const k = clamp01(this._spinT / this._spinDur);
      this.yaw = this._spinYaw0 + this._spinDir * TWO_PI * T.spinTurns * easeOutCubic(k);
      st.spin = Math.max(0, st.spin - dt);
    } else if (!this._fallen) {
      // yaw authority ramps in with speed; a little wheel-spin pivot under throttle lets a kart wriggle off a wall
      const lowS = Math.max(smoothstep(P.turnLow[0], P.turnLow[1], Math.abs(vf)), P.pivot * th);
      const u = V / P.top;
      const hi = 1 - P.understeer * smoothstep(0.55, 1.1, u);
      const turn = P.turn * lowS * hi * (0.55 + 0.45 * Math.min(1, grip)) * (1 - T.staggerSteer * stg);
      let yawRate;
      const d = this.drift;
      if (d.active) {
        const t = clamp01(0.5 + 0.5 * this.steer * d.dir);
        yawRate = -d.dir * turn * lerp(P.driftYawMin, P.driftYawMax, t);
        if (!this.grounded) yawRate *= 0.6;
      } else {
        yawRate = -this.steer * turn * (vf >= -0.5 ? 1 : -1);
        if (!this.grounded) yawRate *= P.airSteer;
      }
      this.yaw += yawRate * dt;
    }
    fx = Math.sin(this.yaw); fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx;     // right = (-cos yaw, sin yaw) = (-fz, fx)
    vf = vx * fx + vz * fz;

    // ---- longitudinal forces ----------------------------------------------------------------------------------
    if (this.grounded && controllable) {
      const gripAccel = (0.55 + 0.45 * Math.min(1, grip)) * (1 - T.staggerAccel * stg);
      if (br > 0.05 && vf > 0.5) {
        const nv = Math.max(0, V - P.brake * br * dt);
        const k = V > 1e-6 ? nv / V : 0; vx *= k; vz *= k;
      } else if (br > 0.05) {
        const add = Math.min(P.reverseAccel * br * dt, Math.max(0, P.reverseMax + vf));
        vx -= fx * add; vz -= fz * add;
      } else if (th > 0) {
        let a;
        if (vf < 0) a = 26 * P.c * P.c;
        else { const u = Math.min(1, vf / Math.max(top, 1)); a = P.a0 * scale * (P.accelP === 2 ? 1 - u * u : 1 - Math.pow(u, P.accelP)); }
        a *= th * gripAccel;
        vx += fx * a * dt; vz += fz * a * dt;
      }
      if (th < 1 && br <= 0.05) {   // coasting drag on the throttle we are not using
        const drag = (P.coastDrag + P.coastDragLin * V) * (1 - th) * dt;
        const nv = Math.max(0, V - drag);
        const k = V > 1e-6 ? nv / V : 0; vx *= k; vz *= k;
      }
      if (b.time > 0 && vf > -1 && !spinning) {
        const room = clamp01((cap - V) / (cap * 0.25));
        const a = P.boostAccel * b.power * room;
        vx += fx * a * dt; vz += fz * a * dt;
      }
      // slopes: gravity along / across the ground, arcade-scaled
      const n = g.normal, ny = Math.max(n.y, T.minNormalY);
      const hx = (n.x / ny) * P.slopeGravity, hz = (n.z / ny) * P.slopeGravity;
      const along = (hx * fx + hz * fz) * T.slopeAlong, across = (hx * rx + hz * rz) * T.slopeAcross;
      vx += (fx * along + rx * across) * dt; vz += (fz * along + rz * across) * dt;
    } else if (!this.grounded) {
      const k = Math.exp(-P.airDrag * dt); vx *= k; vz *= k;
    }
    if (spinning) { const k = Math.exp(-T.spinDrag * P.c * dt); vx *= k; vz *= k; }   // a rate: x c keeps the slide distance (and so the edge of a wall-less track) the same at every class
    if (this._forceT > 0) {                       // track force field (wind, conveyor): fades out
      const f = (this._forceT / this._forceDur) * dt;
      vx += this._force.x * f; vz += this._force.z * f;
      if (this._force.y !== 0) this.vel.y += this._force.y * f;
    }

    // lowered cap (grass, end of boost, shrink): bleed the excess
    if (this.grounded) {
      const m = Math.sqrt(vx * vx + vz * vz);
      if (m > cap) {
        const nm = Math.max(cap, m - (P.excessDecel + P.excessRate * (m - cap)) * dt);
        const k = nm / m; vx *= k; vz *= k;
      }
    }

    // ---- lateral grip (magnitude-preserving relaxation of the sideways velocity) -------------------------------
    let vr = vx * rx + vz * rz;
    vf = vx * fx + vz * fz;
    const lam = spinning ? 0 : (!this.grounded ? P.gripAir : this.drift.active ? P.gripDrift : P.gripRoad) * (this.grounded ? grip : 1) * (1 - T.staggerGrip * stg);
    if (lam > 0) {
      const vr2 = vr * Math.exp(-lam * dt);
      const e = vf * vf + T.slipKeep * (vr * vr - vr2 * vr2);
      const vf2 = (vf >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, e));
      vx = fx * vf2 + rx * vr2; vz = fz * vf2 + rz * vr2;
    }
    this.slip = damp(this.slip, this._slipTarget(vr, V, br, spinning), 14, dt);

    // ---- integrate (sub-stepped when fast, so a kart never skips through a wall) ---------------------------------
    this.vel.x = vx; this.vel.z = vz;
    const sub = clamp(Math.ceil((Math.sqrt(vx * vx + vz * vz) * dt) / T.substepDist), 1, T.maxSubsteps), sdt = dt / sub;
    for (let i = 0; i < sub; i++) {
      this.vel.y = clamp(this.vel.y - P.gravity * sdt, -T.maxFall, T.maxRise);
      this.pos.x += this.vel.x * sdt; this.pos.y += this.vel.y * sdt; this.pos.z += this.vel.z * sdt;
      this._walls(sdt);
      this._groundStep(sdt);
    }
    this._boostPads();
    this._surfaceEvents();
    this._attitude(dt);
    this._finish();
  }

  // ---- drift ------------------------------------------------------------------------------------------------------

  _driftStep(dt, driftIn, driftRaw, steerIn, brake) {
    const d = this.drift, P = this.params, pressed = driftIn && !this._prevDrift;
    this._prevDrift = driftRaw; this._pressEdge = pressed;
    this._levelT += dt;
    if (pressed) this._hopAt = this._t;                                // remembered for the perfect take-off window
    const fastEnough = this.speed > P.driftMinSpeed;
    if (pressed && !d.active && this.grounded && !this._fallen) {
      this._armed = true;                                              // holding drift from now on may start a drift as soon as steering allows
      // the hop (not while climbing a launch ramp: it would only be absorbed, and popping off the ramp early would hide the lip from the take-off check)
      if (fastEnough && !(this._tanVy > P.takeoffMinVy)) { this._pop(P.hopV); d.hop = true; }
    }
    if (!driftIn) {
      if (d.active) this._endDrift(this.grounded || this.airTime < 0.4);
      this._armed = false;
      return;
    }
    if (!d.active) {
      if (this._armed && Math.abs(steerIn) >= T.driftEnterSteer && fastEnough && (this.grounded || d.hop)) this._beginDrift(steerIn > 0 ? 1 : -1);
      return;
    }
    // active: only braking, a spin, or being (nearly) stopped cancels
    if (this.status.spin > 0 || brake > T.driftBrakeCancel) { this._endDrift(false); return; }
    if (this.speed < P.driftHoldSpeed) { this._slowT += dt; if (this._slowT > T.driftHoldGrace) { this._endDrift(false); return; } } else this._slowT = 0;
    let air = 1;
    if (!this.grounded && !d.hop) {
      this._airDrift += dt;
      if (this._airDrift > T.driftAirLimit) { this._endDrift(false); return; }
      if (this._airDrift > T.driftAirCharge) air = 0;                  // a long jump pauses the charge but keeps the drift
    } else this._airDrift = 0;
    // charge clock: full rate steering in, T.chargeOutside with neutral / outward steering (holding a line never stalls it)
    const into = clamp01(steerIn * d.dir / T.chargeInSteer);
    const speedF = clamp(this.speed / (T.chargeSpeedRef * this.params.top), 0.6, 1);
    const times = T.driftLevelTimes;
    this._dc = Math.min(times[2], this._dc + this.params.chargeRate * lerp(T.chargeOutside, 1, into) * speedF * air * dt);
    const lv = this._dc >= times[2] ? 3 : this._dc >= times[1] ? 2 : this._dc >= times[0] ? 1 : 0;
    if (lv > d.level) { d.level = lv; this._levelT = 0; bus.emit('kart:drift-level', { id: this.id, level: lv }); }
    this._syncCharge();
  }

  /** drift.charge: 0..1 with one third per level (level thresholds at 1/3, 2/3, 1), interpolated inside each level. */
  _syncCharge() {
    const t = T.driftLevelTimes, c = this._dc;
    const i = c >= t[2] ? 2 : c >= t[1] ? 1 : 0, lo = i === 0 ? 0 : t[i - 1];
    this.drift.charge = c >= t[2] ? 1 : (i + clamp01((c - lo) / (t[i] - lo))) / 3;
  }

  _beginDrift(dir) {
    const d = this.drift;
    d.active = true; d.dir = dir; d.charge = 0; d.level = 0; this._airDrift = 0; this._dc = 0; this._slowT = 0; this._levelT = 9;
    this.yaw -= dir * this.params.driftKick;       // body swings into the turn, velocity keeps going: instant slide
    bus.emit('kart:drift-start', { id: this.id, dir });
  }

  /** @param {boolean} reward give the mini-turbo for the charged level */
  _endDrift(reward) {
    const d = this.drift;
    if (!d.active) return;
    const lv = d.level, perfect = lv > 0 && this._levelT <= T.perfectWindow;
    d.active = false; d.charge = 0; d.level = 0; this._dc = 0; this._slowT = 0;
    if (reward && lv > 0) {
      const secs = (T.driftBoostSeconds[lv - 1] + (perfect ? T.perfectSeconds : 0)) * this.params.miniSecs;
      const power = (T.driftBoostPower[lv - 1] + (perfect ? T.perfectPower : 0)) * this.params.miniPower;
      this.applyBoost(power, secs, 'drift', perfect);
      if (perfect) bus.emit('kart:perfect-release', { id: this.id, level: lv });
    }
  }

  // ---- tricks -----------------------------------------------------------------------------------------------------

  /** Trick input (drift press or steer double-tap while airborne), auto tricks, and the rotation clock. */
  _trickStep(dt, steerIn) {
    const tr = this.trick;
    if (this.grounded) { this._tapT = 0; this._tapZone = 0; this._autoDone = false; }
    else if (this.status.spin <= 0 && !this._fallen) {
      const ready = this.airTime > this.params.trickMinAir && !this.drift.hop;
      // drift press + steer direction (no steering = right)
      if (this._pressEdge && ready) this.tryTrick(steerIn < -0.3 ? -1 : 1);
      // steer alone, twice: two separate flicks in the same direction within the tap window
      this._tapT = Math.max(0, this._tapT - dt);
      const zone = steerIn > 0.6 ? 1 : steerIn < -0.6 ? -1 : Math.abs(steerIn) < 0.25 ? 0 : this._tapZone;
      if (zone !== this._tapZone) {
        if (zone !== 0) { if (this._tapT > 0 && this._tapDir === zone && ready) this.tryTrick(zone); this._tapDir = zone; this._tapT = T.trickTapWindow; }
        this._tapZone = zone;
      }
      // AI specialists: one trick per jump with probability `autoTrick`
      if (this.autoTrick > 0 && !this._autoDone && ready) {
        this._autoDone = true;
        const r = (Math.imul(this._tick ^ this._idHash, 2654435761) >>> 0) / 4294967296;
        if (r < this.autoTrick) this.tryTrick(r < this.autoTrick * 0.5 ? -1 : 1);
      }
    }
    if (tr.active) {
      tr.t += dt;
      const p = clamp01(tr.t / this.params.trickDuration);
      tr.visual.progress = easeInOut(p); tr.visual.angle = tr.visual.progress * TWO_PI * tr.dir;
      if (p >= 1) { tr.active = false; tr.done++; tr.score += 100 * tr.done; }
    }
  }

  _resetTrick() {
    const tr = this.trick, v = tr.visual;
    tr.active = false; tr.count = 0; tr.done = 0; tr.t = 0; v.progress = 0; v.angle = 0;
  }

  /** Landing after a jump: pay out (or stumble on) the tricks of this jump. `air` = seconds spent airborne. */
  _trickLand(air) {
    const tr = this.trick;
    if (tr.count === 0) { this._resetTrick(); return; }
    if (tr.active && tr.t / this.params.trickDuration >= T.trickForgive) { tr.active = false; tr.done++; tr.score += 100 * tr.done; }
    const count = tr.count;
    if (!tr.active && this.status.spin <= 0) {
      const secs = clamp(T.trickBoostBase + T.trickBoostPerTrick * (count - 1) + T.trickBoostPerAir * clamp(air - 0.5, 0, 2), T.trickBoostBase, T.trickBoostMax);
      tr.score += 50 * count;
      this.applyBoost(1 + 0.05 * (count - 1), secs, 'trick');
      bus.emit('kart:trick-land', { id: this.id, ok: true, boost: secs, count });
    } else {
      this.vel.x *= T.stumbleKeep; this.vel.z *= T.stumbleKeep; this._bumpRoll += 0.35;
      bus.emit('kart:trick-land', { id: this.id, ok: false, boost: 0, count });
    }
    this._resetTrick();
  }

  // ---- walls ------------------------------------------------------------------------------------------------------

  _walls(dt) {
    const track = this.track;
    for (let iter = 0; iter < 2; iter++) {
      const pen = track.collideWalls(this.pos, this.radius, _wn);
      if (!(pen > 0)) return;
      let nx = _wn.x, nz = _wn.z;
      const nl = Math.sqrt(nx * nx + nz * nz);
      if (!(nl > 1e-6)) return;
      nx /= nl; nz /= nl;
      const push = Math.min(pen, 4) + 0.002;
      this.pos.x += nx * push; this.pos.z += nz * push;

      const vel = this.vel;
      const vn = vel.x * nx + vel.z * nz;
      const V = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      // scraping friction whenever we touch
      const P = this.params;
      const fr = Math.exp(-P.wallFriction * dt);
      vel.x *= fr; vel.z *= fr;
      if (vn < 0 && V > 1e-3) {
        const closing = -vn, a = clamp01(closing / V);
        const tx = vel.x - vn * nx * fr, tz = vel.z - vn * nz * fr;      // tangential part (already scraped)
        const loss = clamp(P.wallImpact * a * a, 0, 0.85);
        const e = lerp(T.wallRestitution, T.wallRestitutionHead, a);
        vel.x = tx * (1 - loss) + nx * closing * e;
        vel.z = tz * (1 - loss) + nz * closing * e;
        const impact = clamp01(closing / (T.impactRef * P.c));
        // realign the heading along the wall so glancing hits slide instead of stick
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const hn = fx * nx + fz * nz;
        if (hn < -0.02 && hn > -0.985 && this.speed > 0) {
          const tl = Math.sqrt(1 - hn * hn);
          const want = Math.atan2((fx - hn * nx) / tl, (fz - hn * nz) / tl);
          this.yaw += clamp(angleDiff(this.yaw, want), -0.6, 0.6) * (1 - Math.exp(-P.wallAlign * dt));
          this._bumpRoll += clamp(fx * nz - fz * nx, -1, 1) * -impact * 0.5;
        }
        if (this.drift.active) { if (a > 0.55) this._endDrift(false); else if (a > 0.3) this._scrapeCharge(); }
        if (a > 0.6) this.boost.time *= 0.5;
        if (impact >= T.wallEventMin && this._tick - this._wallTick >= T.wallEventCooldown * CFG.physicsHz) {
          this._wallTick = this._tick;
          bus.emit('kart:wall-hit', { id: this.id, impact });
        }
      }
    }
  }

  /** A scraping wall hit costs a little charge but never a level already earned. */
  _scrapeCharge() {
    const t = T.driftLevelTimes, floor = this.drift.level > 0 ? t[this.drift.level - 1] : 0;
    this._dc = Math.max(floor, this._dc * T.wallChargeKeep); this._syncCharge();
  }

  // ---- ground contact ---------------------------------------------------------------------------------------------

  _hasGround() {
    const q = this.ground;
    return !q.inVoid && finite(q.height) && q.surface !== 'void';
  }

  _groundStep(dt) {
    const q = this.ground, vel = this.vel;
    this.track.query(this.pos, q, q.s);
    if (!q.normal) q.normal = new THREE.Vector3(0, 1, 0);
    else if (!(q.normal.y > 0)) q.normal.set(0, 1, 0);
    let has = this._hasGround();
    if (has && q.height - this.pos.y > T.maxSnapUp) has = false;   // inside solid geometry (far side of a gap): keep falling
    const gh = has ? q.height : -Infinity;
    const ny = has ? Math.max(q.normal.y, T.minNormalY) : 1;
    const tanVy = has ? -(q.normal.x * vel.x + q.normal.z * vel.z) / ny : 0;
    this._tanVy = this.grounded ? tanVy : 0;                        // upward speed of the ground under a grounded kart (launch ramp detection)
    const gap = this.pos.y - gh;
    const contact = has && (gap <= 0 || (this.grounded && gap <= T.glue && vel.y <= tanVy + T.glueVy));
    if (contact) {
      const closing = -(vel.x * q.normal.x + vel.y * q.normal.y + vel.z * q.normal.z);
      const wasAir = !this.grounded, airBefore = this.airTime, land = 22 * this.params.c;
      this.pos.y = gh; vel.y = tanVy;
      this.grounded = true;
      if (wasAir) {
        const d = this.drift;
        if (d.hop) d.hop = false;
        else if (this.airTime > 0.1 && closing > 2) {
          const impact = clamp01(closing / land);
          this._bumpRoll += impact * 0.12;
          bus.emit('kart:land', { id: this.id, impact });
        }
        this._trickLand(airBefore);
      }
      this.airTime = 0; this._lastGroundY = gh;
    } else {
      const left = this.grounded;
      this.grounded = false; this.airTime += dt;
      if (this.drift.hop && this.airTime > 0.8) this.drift.hop = false;
      // the ground fell away under a climbing kart (ramp lip, crest): a take-off
      if (left && vel.y > this.params.takeoffMinVy && !this._fallen) this._takeoff('ramp', vel.y / this.params.c);
    }
    // falling out of the world
    if (!this._fallen) {
      const killY = finite(this.track.killY) ? this.track.killY : T.killYDefault;
      if ((!has && this.pos.y < this._lastGroundY - T.voidDepth) || this.pos.y < killY) {
        this._fallen = true; this._endDrift(false); this._resetTrick();
        bus.emit('kart:fall', { id: this.id });
      }
    }
    if (this.pos.y < -2000) { this.pos.y = -2000; vel.y = 0; }
  }

  _boostPads() {
    const sp = SURFACE_PROPS[this.ground.surface];
    if (!this.grounded || !sp || !sp.boostPad || this._fallen) return;
    if (this._surface !== this.ground.surface) this.applyBoost(T.padPower, T.padSeconds, 'pad');
    else { this.boost.time = Math.max(this.boost.time, T.padSeconds); this.boost.power = Math.max(this.boost.power, T.padPower); }
  }

  _surfaceEvents() {
    if (!this.grounded) return;
    const s = this.ground.surface;
    if (s !== this._surface) { this._surface = s; bus.emit('kart:surface', { id: this.id, surface: s }); }
  }

  // ---- visual attitude ----------------------------------------------------------------------------------------------

  _attitudeTargets() {
    if (this.grounded && this._hasGround()) {
      const n = this.ground.normal;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const ny = Math.max(n.y, T.minNormalY);
      this._pt = Math.atan2(n.x * fx + n.z * fz, ny);
      this._rt = Math.atan2(-n.x * fz + n.z * fx, ny);       // n . right, right = (-fz, fx)
    } else {
      const hs = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
      this._pt = this._fallen ? this.pitch + 0.05 : -Math.atan2(this.vel.y, hs + 4) * 0.7;
      this._rt = 0;
    }
  }

  _attitude(dt) {
    this._attitudeTargets();
    const k = this.grounded ? 12 : 4;
    this.pitch = damp(this.pitch, this._pt, this._fallen ? 0.5 : k, dt);
    this._bumpRoll = damp(this._bumpRoll, 0, 9, dt);
    this.roll = damp(this.roll, this._rt, k, dt) + this._bumpRoll;
  }

  // ---- misc ---------------------------------------------------------------------------------------------------------

  _slipTarget(vr, V, br, spinning) {
    if (spinning) return 1;
    let s = clamp01((Math.abs(vr) / this.params.c - 1.5) / 6);
    if (br > 0.5 && V > 10 && this.grounded) s = Math.max(s, 0.35 * br);
    if (!this.grounded) s *= 0.3;
    return s;
  }

  _kick(dv) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const cap = this.params.top * this.speedScale * this._capMul * (1 + T.boostCapPerPower * this.boost.power);
    const vf = this.vel.x * fx + this.vel.z * fz;
    const add = Math.min(dv, Math.max(0, cap - vf));
    this.vel.x += fx * add; this.vel.z += fz * add;
    this.speed += add;
  }

  _sane(p) { return finite(p.x) && finite(p.y) && finite(p.z); }

  _store() {
    const s = this._safe;
    s[0] = this.pos.x; s[1] = this.pos.y; s[2] = this.pos.z; s[3] = this.vel.x; s[4] = this.vel.y; s[5] = this.vel.z; s[6] = this.yaw;
  }

  /** Final bookkeeping: derived speed, NaN guard. */
  _finish() {
    const p = this.pos, v = this.vel;
    if (!(finite(p.x) && finite(p.y) && finite(p.z) && finite(v.x) && finite(v.y) && finite(v.z) && finite(this.yaw) &&
          finite(this.pitch) && finite(this.roll) && finite(this.steer) && finite(this.drift.charge))) {
      const s = this._safe;
      p.set(s[0], s[1], s[2]); v.set(0, 0, 0); this.yaw = s[6];
      this.pitch = 0; this.roll = 0; this.steer = 0; this.slip = 0; this.drift.charge = 0; this.drift.level = 0; this.drift.active = false;
      this._bumpRoll = 0; this._nanCount++;
      if (this._nanCount === 1) console.warn(`[KartPhysics] ${this.id}: non-finite state recovered`);
      this.track.query(p, this.ground);
    }
    const vx = v.x, vz = v.z, m = Math.sqrt(vx * vx + vz * vz);
    this.speed = vx * Math.sin(this.yaw) + vz * Math.cos(this.yaw) >= 0 ? m : -m;
    this._store();
  }
}
