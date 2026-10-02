// ChaseCamera: spring-damped third-person camera for a KartPhysics (SPEC.md section 4).
//   follow  : behind and above, heading eased towards the kart's velocity, drift swing, boost FOV kick, look-back, impact shake
//   intro   : cinematic fly-through along the track spline that settles into the follow position behind the target
//   finish  : slow orbit around the kart for the victory lap
// The camera is a plain THREE.PerspectiveCamera owned by the caller; this class only moves it and animates its fov.
// Runs per RENDER frame (variable dt). Pass `alpha` (0..1 fixed-step interpolation) in update() to render the kart at
// its interpolated position; without it the camera smooths the 60 Hz steps itself.
// No per-frame allocations. Node-importable (uses only three + the bus).
import * as THREE from 'three';
import { bus } from '../core/bus.js';
import { clamp, clamp01, lerp, smoothstep, angleDiff, damp } from '../core/util.js';
import { speedClassInfo } from '../core/speedClass.js';

const CFG = {
  dist: 7.0, distSpeed: 1.7, distBoost: 1.0,      // metres behind the kart
  height: 3.2, heightSpeed: 0.5,                   // metres above the kart
  lookAhead: 6.0, lookAheadSpeed: 3.0, lookUp: 1.3,
  yawFollow: 5.5, yawFollowDrift: 3.4,             // 1/s heading spring
  velocityBlend: 0.25, velocityBlendDrift: 0.7,    // how much of the heading follows the velocity direction
  swing: 1.8, swingLook: 1.3,                      // metres of sideways drift swing (camera out, look in)
  fovSpeed: 7, fovBoost: 11, fovDrift: 2,
  fovJump: 9, jumpDecay: 3.4, jumpTrauma: 0.3,    // perfect take-off: a quick FOV punch that settles in about half a second
  distClass: 1.6,                                  // extra metres behind the kart per unit of (class fx - 1): faster classes pull the camera back a touch
  groundClearance: 0.9,
  lookBackDist: 7.4, lookBackHeight: 3.3,
  shakeDecay: 1.9, shakeMaxPos: 0.42, shakeMaxRot: 0.02,
  orbitRadius: 9.5, orbitHeight: 3.7, orbitRate: 0.55,
};

const _ground = { height: 0, normal: new THREE.Vector3(0, 1, 0), surface: 'road', onRoad: true, s: 0, lateral: 0, inVoid: false };
const _sm = {};
const _tmpA = new THREE.Vector3(), _tmpB = new THREE.Vector3();

export class ChaseCamera {
  /** @param {THREE.PerspectiveCamera} camera */
  constructor(camera) {
    this.camera = camera;
    this.baseFov = camera.fov || 62;
    /** 'follow' | 'intro' | 'finish' */
    this.mode = 'follow';
    this.introDone = true;
    this.target = null;
    this.shakeScale = 1;
    this._pos = new THREE.Vector3(); this._look = new THREE.Vector3();
    this._anchor = new THREE.Vector3(); this._anchorReady = false;
    this._yaw = 0; this._lb = 0; this._swing = 0; this._boostK = 0; this._speedK = 0;
    this._fov = this.baseFov; this._roll = 0; this._dist = CFG.dist; this._trauma = 0; this._time = 0;
    this._jumpK = 0;                   // perfect take-off FOV punch, 1 -> 0
    this._classFov = 0; this._classDist = 0;   // speed class: extra FOV at full speed (degrees), extra follow distance (m)
    this._intro = null; this._orbit = null;
    this._offs = [
      bus.on('kart:wall-hit', (d) => this._impact(d, 0.55)),
      bus.on('kart:bump', (d) => this._impact(d, 0.4)),
      bus.on('kart:land', (d) => this._impact(d, 0.5)),
      bus.on('kart:spin', (d) => this._impact({ id: d.id, impact: 1 }, 0.6)),
      bus.on('kart:boost', (d) => this._impact({ id: d.id, impact: 0.5 }, d.kind === 'start' ? 0.5 : 0.3)),
      bus.on('kart:perfect-jump', (d) => this._perfectJump(d)),
    ];
  }

  /** Follow this kart from now on. Snaps the camera behind it. @param {import('./KartPhysics.js').KartPhysics} kart */
  setTarget(kart) { this.target = kart; this.snap(); }

  /**
   * Game speed class (Mbps, CFG.speedClasses): a faster class widens the field of view at full speed and pulls the camera back a little.
   * @param {number} [id=100] 50 | 100 | 150 | 200
   */
  setSpeedClass(id = 100) {
    const info = speedClassInfo(id);
    this._classFov = info.fov; this._classDist = (info.fx - 1) * CFG.distClass;
  }

  /** Scale camera shake (settings `cameraShake`, 0..1). */
  setShakeScale(v) { this.shakeScale = clamp01(Number.isFinite(v) ? v : 1); }

  /** Place the camera at its resting position behind the target immediately (no easing). */
  snap() {
    const k = this.target;
    if (!k) return;
    this._yaw = k.yaw; this._lb = 0; this._swing = 0; this._boostK = 0; this._speedK = 0; this._trauma = 0; this._jumpK = 0;
    this._anchor.copy(k.pos); this._anchorReady = true;
    this._chasePoseAt(this._anchor, this._pos, this._look, 0, 0, 0, 0);
    this._fov = this.baseFov; this._roll = 0; this._dist = CFG.dist;
    this._apply(0);
  }

  /**
   * Per-frame update.
   * @param {number} dt seconds since last frame
   * @param {{boosting?:boolean, drifting?:boolean, lookBack?:boolean, speedFrac?:number, alpha?:number}} [state]
   */
  update(dt, state = {}) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    this._time += dt;
    this._trauma = Math.max(0, this._trauma - CFG.shakeDecay * dt);
    this._jumpK = damp(this._jumpK, 0, CFG.jumpDecay, dt);
    if (this.mode === 'intro' && this._intro) { this._updateIntro(dt); return; }
    const k = this.target;
    if (!k) return;
    if (this.mode === 'finish' && this._orbit) { this._updateFinish(dt, k, state.alpha); return; }
    this._updateFollow(dt, k, state);
  }

  /**
   * Cinematic fly-through along the track that ends in the follow position behind the target.
   * @param {object} track Track (sample(s), length, gridSlot)
   * @param {number} [duration=5.5] seconds
   * @returns {Promise<void>} resolves when the intro has finished (also exposed as `introDone`)
   */
  startIntro(track, duration = 5.5) {
    this.finishIntro();
    const k = this.target;
    const s1 = k ? k.ground.s : 0;
    const dist = Math.min(track.length * 0.45, 70 * duration);
    this.mode = 'intro'; this.introDone = false;
    return new Promise((resolve) => {
      this._intro = { track, duration: Math.max(1, duration), t: 0, s0: s1 - dist, s1, resolve };
      this._updateIntro(0);
    });
  }

  /** End a running intro at once and settle behind the target. */
  finishIntro() {
    const it = this._intro;
    if (!it) return;
    this._intro = null; this.mode = 'follow'; this.introDone = true;
    this.snap();
    it.resolve();
  }

  /** Victory orbit around a kart. @param {import('./KartPhysics.js').KartPhysics} kart */
  startFinish(kart) {
    if (kart) this.target = kart;
    const k = this.target;
    if (!k) return;
    this._intro = null; this.introDone = true;
    this._orbit = { angle: Math.atan2(this._pos.x - k.pos.x, this._pos.z - k.pos.z), t: 0, ready: false, ox: 0, oy: 0, oz: 0 };
    this.mode = 'finish';
  }

  /** Back to normal following (e.g. after a restart). */
  startFollow() { this._orbit = null; this.mode = 'follow'; this.snap(); }

  /** Remove bus listeners. */
  dispose() { this._offs.forEach((f) => f()); this._offs = []; }

  // ---- follow ---------------------------------------------------------------------------------------------------

  _updateFollow(dt, k, state) {
    const alpha = state.alpha;
    const interp = Number.isFinite(alpha);
    const a = interp ? clamp01(alpha) : 1;
    const px = interp ? lerp(k.prevPos.x, k.pos.x, a) : k.pos.x;
    const py = interp ? lerp(k.prevPos.y, k.pos.y, a) : k.pos.y;
    const pz = interp ? lerp(k.prevPos.z, k.pos.z, a) : k.pos.z;
    const kyaw = interp ? k.prevYaw + angleDiff(k.prevYaw, k.yaw) * a : k.yaw;

    // anchor: the point the camera is built around (smoothed vertically over bumps, lightly horizontally if not interpolated)
    if (!this._anchorReady) { this._anchor.set(px, py, pz); this._anchorReady = true; }
    const hk = interp ? 60 : 28;
    this._anchor.x = damp(this._anchor.x, px, hk, dt);
    this._anchor.z = damp(this._anchor.z, pz, hk, dt);
    this._anchor.y = damp(this._anchor.y, py, k.grounded ? 8 : 3.5, dt);

    const st = k.status;
    const drifting = !!(state.drifting ?? k.drift.active);
    const boosting = !!(state.boosting ?? k.boost.time > 0.05);
    const speedFrac = clamp(state.speedFrac ?? Math.abs(k.speed) / Math.max(1, k.params ? k.params.top : 33), 0, 1.4);
    const lookBack = !!state.lookBack;

    // heading: ease towards a mix of the kart's heading and its velocity direction; hold while spinning
    const hs = Math.hypot(k.vel.x, k.vel.z);
    if (st.spin <= 0) {
      let target = kyaw;
      if (hs > 4) {
        const velYaw = Math.atan2(k.vel.x, k.vel.z);
        const w = (drifting ? CFG.velocityBlendDrift : CFG.velocityBlend) * clamp01((hs - 4) / 8);
        target = kyaw + angleDiff(kyaw, velYaw) * w;
      }
      const rate = drifting ? CFG.yawFollowDrift : CFG.yawFollow;
      this._yaw += angleDiff(this._yaw, target) * (1 - Math.exp(-rate * dt));
    }

    // eased blend variables
    const dir = k.drift.active ? k.drift.dir : 0;
    this._swing = damp(this._swing, drifting ? 1 : 0, drifting ? 4 : 3, dt);
    this._boostK = damp(this._boostK, boosting ? 1 : 0, boosting ? 7 : 2.4, dt);
    this._speedK = damp(this._speedK, speedFrac, 3, dt);
    this._lb = damp(this._lb, lookBack ? 1 : 0, 11, dt);

    this._chasePoseAt(this._anchor, this._pos, this._look, this._swing * dir, this._boostK, this._speedK, this._lb);

    // ground avoidance
    const track = k.track;
    if (track && typeof track.query === 'function') {
      track.query(this._pos, _ground, _ground.s);
      if (!_ground.inVoid && Number.isFinite(_ground.height)) this._pos.y = Math.max(this._pos.y, _ground.height + CFG.groundClearance);
    }

    // fov: speed + boost kick + drift, springy on the way in
    const fovTarget = this.baseFov + this._speedK * (CFG.fovSpeed + this._classFov) + this._boostK * CFG.fovBoost + this._swing * CFG.fovDrift;
    this._fov = damp(this._fov, fovTarget, fovTarget > this._fov ? 6 : 2.6, dt);
    const rollTarget = -(k.steer * 0.018 + this._swing * dir * 0.03) - k.roll * 0.35;
    this._roll = damp(this._roll, rollTarget, 6, dt);
    this._apply(this._time);
  }

  /**
   * Compute camera position and look-at point around `anchor` for the current smoothed heading.
   * @param {THREE.Vector3} anchor @param {THREE.Vector3} outPos @param {THREE.Vector3} outLook
   * @param {number} swingDir signed drift swing (+1 = drifting right) @param {number} boostK 0..1 @param {number} speedK 0..1.4 @param {number} lb look-back 0..1
   */
  _chasePoseAt(anchor, outPos, outLook, swingDir, boostK, speedK, lb) {
    const yaw = this._yaw + Math.PI * lb;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = -fz, rz = fx;                      // right of the camera heading
    const dist = lerp(CFG.dist + this._classDist * speedK + CFG.distSpeed * speedK + CFG.distBoost * boostK, CFG.lookBackDist, lb);
    const height = lerp(CFG.height + CFG.heightSpeed * speedK, CFG.lookBackHeight, lb);
    const side = -swingDir * CFG.swing * (1 - lb);
    outPos.set(anchor.x - fx * dist + rx * side, anchor.y + height, anchor.z - fz * dist + rz * side);
    const ahead = lerp(CFG.lookAhead + CFG.lookAheadSpeed * speedK, 2.5, lb);
    const lookSide = swingDir * CFG.swingLook * (1 - lb);
    outLook.set(anchor.x + fx * ahead + rx * lookSide, anchor.y + CFG.lookUp, anchor.z + fz * ahead + rz * lookSide);
  }

  // ---- intro ----------------------------------------------------------------------------------------------------

  _updateIntro(dt) {
    const it = this._intro, k = this.target;
    it.t += dt;
    const u = clamp01(it.t / it.duration);
    const e = u * u * (3 - 2 * u);                                   // ease in/out along the spline
    const s = lerp(it.s0, it.s1, e);
    const tr = it.track;
    tr.sample(s, _sm);
    const sway = Math.sin(u * Math.PI * 1.3) * 16 * (1 - u);
    const height = lerp(15, 6.5, smoothstep(0, 1, u));
    this._pos.copy(_sm.pos).addScaledVector(_sm.right, sway); this._pos.y += height;
    tr.sample(s + 34, _sm);
    this._look.copy(_sm.pos); this._look.y += 1.5;
    let fov = this.baseFov + 6 * (1 - u);
    let roll = Math.sin(u * Math.PI * 2) * 0.03;
    // final approach: blend into the follow pose behind the target
    const b = smoothstep(0.7, 1, u);
    if (b > 0 && k) {
      this._yaw = k.yaw;
      this._chasePoseAt(k.pos, _tmpA, _tmpB, 0, 0, 0, 0);
      this._pos.lerp(_tmpA, b); this._look.lerp(_tmpB, b);
      fov = lerp(fov, this.baseFov, b); roll *= 1 - b;
    }
    this._fov = fov; this._roll = roll;
    this._apply(this._time);
    if (u >= 1) this.finishIntro();
  }

  // ---- finish orbit -----------------------------------------------------------------------------------------------

  _updateFinish(dt, k, alpha) {
    const o = this._orbit;
    o.t += dt; o.angle += CFG.orbitRate * dt;
    const a = Number.isFinite(alpha) ? clamp01(alpha) : 1;
    const px = Number.isFinite(alpha) ? lerp(k.prevPos.x, k.pos.x, a) : k.pos.x;
    const py = Number.isFinite(alpha) ? lerp(k.prevPos.y, k.pos.y, a) : k.pos.y;
    const pz = Number.isFinite(alpha) ? lerp(k.prevPos.z, k.pos.z, a) : k.pos.z;
    this._anchor.x = damp(this._anchor.x, px, 20, dt); this._anchor.z = damp(this._anchor.z, pz, 20, dt); this._anchor.y = damp(this._anchor.y, py, 6, dt);
    const r = CFG.orbitRadius + Math.sin(o.t * 0.8) * 1.2;
    const ox = Math.sin(o.angle) * r, oy = CFG.orbitHeight + Math.sin(o.t * 0.6) * 0.6, oz = Math.cos(o.angle) * r;
    if (!o.ready) { o.ox = this._pos.x - this._anchor.x; o.oy = this._pos.y - this._anchor.y; o.oz = this._pos.z - this._anchor.z; o.ready = true; }
    o.ox = damp(o.ox, ox, 3, dt); o.oy = damp(o.oy, oy, 3, dt); o.oz = damp(o.oz, oz, 3, dt);
    this._pos.set(this._anchor.x + o.ox, this._anchor.y + o.oy, this._anchor.z + o.oz);
    this._look.set(this._anchor.x, this._anchor.y + 1.0, this._anchor.z);
    this._fov = damp(this._fov, this.baseFov - 6, 1.5, dt);
    this._roll = damp(this._roll, 0, 3, dt);
    this._apply(this._time);
  }

  // ---- shared -----------------------------------------------------------------------------------------------------

  /** Perfect take-off: punch the field of view out and give a short rumble (the kick eases back on its own). */
  _perfectJump(d) {
    if (!this.target || !d || d.id !== this.target.id) return;
    this._jumpK = 1;
    this._trauma = Math.min(1, this._trauma + CFG.jumpTrauma);
  }

  _impact(d, gain) {
    if (!this.target || !d || d.id !== this.target.id) return;
    const v = clamp01(Number.isFinite(d.impact) ? d.impact : 0.5);
    this._trauma = Math.min(1, this._trauma + v * gain);
  }

  /** Write position / orientation / fov to the THREE camera, adding shake. */
  _apply(time) {
    const cam = this.camera;
    const tr = this._trauma * this._trauma * this.shakeScale;
    cam.position.copy(this._pos);
    if (tr > 1e-5) {
      const a = CFG.shakeMaxPos * tr;
      cam.position.x += Math.sin(time * 41.3) * a; cam.position.y += Math.sin(time * 37.1 + 1.3) * a; cam.position.z += Math.sin(time * 33.7 + 2.1) * a;
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(this._look);
    const roll = this._roll + (tr > 1e-5 ? Math.sin(time * 29.9 + 0.7) * CFG.shakeMaxRot * tr * 4 : 0);
    if (roll !== 0) cam.rotateZ(roll);
    const fov = this._fov + this._jumpK * CFG.fovJump;
    if (Math.abs(cam.fov - fov) > 0.02) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
}
