// Driver rig: shared skeleton (body / head / two arms), pose + expression + steering animation, geometry cache and
// small helpers used by every character builder in ./chars/. Node-importable (canvas features degrade to nothing).
import * as THREE from 'three';
import { DRIVER_SCALE, SEAT_POS, WHEEL_POS, WHEEL_NORMAL, WHEEL_RADIUS } from './layout.js';
import { GeoBuilder } from './geo.js';
import { outlinedMesh, clothMaterial, paintMaterial, skinMaterial, glowMaterial, ledMaterial, ledTick } from './toon.js';
import { createFacePatches } from './faces.js';
import { printTexture } from './canvas.js';
import { damp } from '../core/util.js';

const geoCache = new Map();

/**
 * Cached geometry by key (the same character built twice shares GPU buffers).
 * @param {string} key
 * @param {() => THREE.BufferGeometry} thunk
 * @returns {THREE.BufferGeometry}
 */
export function cachedGeo(key, thunk) {
  let g = geoCache.get(key);
  if (!g) { g = thunk(); geoCache.set(key, g); }
  return g;
}

/** Free every cached character/kart/item geometry. */
export function disposeGeoCache() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}

export const OUTLINE_INK = 0x1b1226;

const _up = new THREE.Vector3(0, -1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _hand = new THREE.Vector3();
const _sh = new THREE.Vector3();
const WHEEL_LOCAL = new THREE.Vector3().subVectors(WHEEL_POS, SEAT_POS).divideScalar(DRIVER_SCALE);
const WHEEL_R_LOCAL = WHEEL_RADIUS / DRIVER_SCALE;
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_U = new THREE.Vector3().crossVectors(AXIS_X, WHEEL_NORMAL).negate().normalize();

/** Arm direction table for non-driving poses (unit-ish vectors from the shoulder; +X is the character's left). */
const ARM_POSES = {
  celebrate: { l: [0.42, 0.92, 0.12], r: [-0.42, 0.92, 0.12] },
  defeat: { l: [0.12, -1, 0.16], r: [-0.12, -1, 0.16] },
  spin: { l: [0.95, 0.2, 0.25], r: [-0.95, 0.2, 0.25] },
};

/** Driver rig. Builders in ./chars/ receive one and fill body / head / arms. */
export class Rig {
  /**
   * @param {string} charId
   * @param {{shoulder?: number[], armLen?: number, neckY?: number, headZ?: number, scale?: number, bob?: number}} [cfg]
   */
  constructor(charId, cfg = {}) {
    this.charId = charId;
    this.cfg = { shoulder: [0.44, 0.5, 0], armLen: 0.64, neckY: 0.72, headZ: 0, scale: 1, bob: 1, ...cfg };
    this.root = new THREE.Group();
    this.root.name = `driver-${charId}`;
    this.body = new THREE.Group();
    this.head = new THREE.Group();
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.root.add(this.body);
    this.body.add(this.head, this.armL, this.armR);
    this.head.position.set(0, this.cfg.neckY, this.cfg.headZ);
    const [sx, sy, sz] = this.cfg.shoulder;
    this.armL.position.set(sx, sy, sz);
    this.armR.position.set(-sx, sy, sz);
    this.root.scale.setScalar(DRIVER_SCALE * this.cfg.scale);
    /** @type {Array<(dt:number, s:object)=>void>} */
    this.anims = [];
    this.faceSet = null;
    this.state = { pose: 'drive', expression: 'neutral', steer: 0, steerS: 0, t: 0, speed: 0, boost: 0, animated: false, poseT: 0, air: 0 };
    this.armBase = new THREE.Quaternion();
    this.disposers = [];
    /** @type {Array<(name: string) => void>} */
    this.expressionHooks = [];
  }

  /**
   * Add an unlit glow / blinking-LED mesh (no outline). Colours boosted above 1.5 blink.
   * @param {THREE.Object3D} parent @param {string} key @param {() => THREE.BufferGeometry} thunk
   * @param {{p?: number[], r?: number[]}} [o]
   * @returns {THREE.Mesh}
   */
  glow(parent, key, thunk, o = {}) {
    const mesh = new THREE.Mesh(cachedGeo(`${this.charId}:${key}`, thunk), ledMaterial());
    mesh.onBeforeRender = ledTick;
    mesh.castShadow = false;
    if (o.p) mesh.position.set(o.p[0], o.p[1], o.p[2]);
    if (o.r) mesh.rotation.set(o.r[0], o.r[1], o.r[2]);
    parent.add(mesh);
    return mesh;
  }

  /** Run `fn(expressionName)` whenever the expression changes. @param {(name: string) => void} fn */
  onExpression(fn) { this.expressionHooks.push(fn); }

  /**
   * Add an outlined mesh from a cached geometry.
   * @param {THREE.Object3D} parent
   * @param {string} key geometry cache key (scoped by character)
   * @param {() => THREE.BufferGeometry} thunk
   * @param {{mat?: 'cloth'|'paint'|'skin'|'glow'|THREE.Material, ol?: number, ink?: number, p?: number[], r?: number[], s?: number|number[], shadow?: boolean}} [o]
   * @returns {THREE.Mesh}
   */
  add(parent, key, thunk, o = {}) {
    const geo = cachedGeo(`${this.charId}:${key}`, thunk);
    const m = o.mat;
    const mat = m && typeof m === 'object' ? m : m === 'paint' ? paintMaterial() : m === 'skin' ? skinMaterial() : m === 'glow' ? glowMaterial() : clothMaterial();
    const mesh = outlinedMesh(geo, mat, m === 'glow' ? 0 : (o.ol ?? 0.026), o.ink ?? OUTLINE_INK);
    if (o.p) mesh.position.set(o.p[0], o.p[1], o.p[2]);
    if (o.r) mesh.rotation.set(o.r[0], o.r[1], o.r[2]);
    if (o.s !== undefined) { if (typeof o.s === 'number') mesh.scale.setScalar(o.s); else mesh.scale.set(o.s[0], o.s[1], o.s[2]); }
    if (o.shadow === false) mesh.castShadow = false;
    parent.add(mesh);
    return mesh;
  }

  /**
   * Textured decal plane (name prints, badges). Returns null when there is no canvas support.
   * @param {THREE.Object3D} parent
   * @param {string} key texture cache key
   * @param {number} w @param {number} h world size
   * @param {number} pw @param {number} ph canvas pixels
   * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
   * @param {{p?: number[], r?: number[], emissive?: boolean, additive?: boolean}} [o]
   * @returns {THREE.Mesh|null}
   */
  print(parent, key, w, h, pw, ph, draw, o = {}) {
    const tex = printTexture(key, pw, ph, draw);
    if (!tex) return null;
    const mat = o.emissive
      ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending })
      : new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    if (o.p) mesh.position.set(o.p[0], o.p[1], o.p[2]);
    if (o.r) mesh.rotation.set(o.r[0], o.r[1], o.r[2]);
    mesh.renderOrder = 3;
    parent.add(mesh);
    this.disposers.push(() => { mesh.geometry.dispose(); mat.dispose(); });
    return mesh;
  }

  /**
   * Attach face patches to the head. @param {Parameters<typeof createFacePatches>[1]} patches
   */
  face(patches) {
    this.faceSet = createFacePatches(this.charId, patches);
    for (const m of this.faceSet.meshes) this.head.add(m);
    this.disposers.push(() => this.faceSet.dispose());
    return this.faceSet;
  }

  /** Register a per-frame secondary animation. @param {(dt:number, s:object)=>void} fn */
  anim(fn) { this.anims.push(fn); }

  setExpression(name) {
    this.state.expression = name;
    this.faceSet?.setExpression(name);
    for (let i = 0; i < this.expressionHooks.length; i++) this.expressionHooks[i](name);
  }

  setPose(name) {
    if (!(name === 'drive' || ARM_POSES[name])) return;
    if (this.state.pose !== name) this.state.poseT = 0;
    this.state.pose = name;
    if (!this.state.animated) this.snap();
  }

  /** Jump straight to the current pose (used before the first animated frame). */
  snap() {
    const was = this.state.animated;
    this.state.animated = true;
    this.update(0.5);
    this.state.animated = was;
  }

  lookSteer(steer, dt) {
    this.state.steer = steer;
    this.state.animated = true;
    this.update(dt);
  }

  /** Advance animation. @param {number} dt seconds */
  update(dt) {
    const s = this.state;
    s.t += dt; s.poseT += dt;
    s.steerS = damp(s.steerS, s.steer, 14, dt);
    const k = 1 - Math.exp(-16 * dt);
    const drive = s.pose === 'drive';
    const st = s.steerS;
    // body lean + bounce
    let bodyY = 0, bodyX = 0, bodyZ = st * 0.1, headX = 0, headY = -st * 0.34, headZ = st * 0.14;
    const bobAmp = this.cfg.bob;
    if (drive) {
      bodyY = Math.sin(s.t * 21) * 0.006 * s.speed * bobAmp + Math.sin(s.t * 2.1) * 0.005;
      headX = -0.05 * s.boost;
    } else if (s.pose === 'celebrate') {
      bodyY = Math.abs(Math.sin(s.t * 7)) * 0.14 * bobAmp; headX = -0.18; headY = Math.sin(s.t * 3) * 0.3; headZ = Math.sin(s.t * 7) * 0.08; bodyZ = Math.sin(s.t * 3.5) * 0.1;
    } else if (s.pose === 'defeat') {
      bodyX = 0.34; bodyY = -0.05; headX = 0.5; headY = Math.sin(s.t * 1.3) * 0.12; headZ = 0.05; bodyZ = 0;
    } else if (s.pose === 'spin') {
      bodyZ = Math.sin(s.t * 13) * 0.22; headZ = Math.sin(s.t * 13 + 1) * 0.35; headY = Math.sin(s.t * 9) * 0.5; headX = 0.1; bodyY = 0.04;
    }
    this.body.position.y = damp(this.body.position.y, bodyY, 18, dt);
    this.body.rotation.x = damp(this.body.rotation.x, bodyX, 10, dt);
    this.body.rotation.z = damp(this.body.rotation.z, bodyZ, 10, dt);
    this.head.rotation.x = damp(this.head.rotation.x, headX, 12, dt);
    this.head.rotation.y = damp(this.head.rotation.y, headY, 12, dt);
    this.head.rotation.z = damp(this.head.rotation.z, headZ, 12, dt);
    // arms
    const [shx, shy, shz] = this.cfg.shoulder;
    for (let side = -1; side <= 1; side += 2) {
      const arm = side === 1 ? this.armL : this.armR;
      let scaleY = 1;
      if (drive) {
        const phi = st * 1.05;
        const beta = 0.34;
        const a = side === 1 ? beta + phi : Math.PI - beta + phi;
        const rr = WHEEL_R_LOCAL;
        _hand.copy(WHEEL_LOCAL).addScaledVector(AXIS_X, Math.cos(a) * rr).addScaledVector(AXIS_U, Math.sin(a) * rr);
        _sh.set(side * shx, shy, shz);
        _dir.subVectors(_hand, _sh);
        const dist = _dir.length();
        _dir.multiplyScalar(1 / (dist || 1));
        scaleY = Math.min(1.25, Math.max(0.8, dist / this.cfg.armLen));
      } else {
        const t = ARM_POSES[s.pose];
        const v = side === 1 ? t.l : t.r;
        _dir.set(v[0], v[1], v[2]).normalize();
        if (s.pose === 'spin') { _dir.x += Math.sin(s.t * 15 + side) * 0.25; _dir.y += Math.cos(s.t * 12 + side) * 0.3; _dir.normalize(); }
        if (s.pose === 'celebrate') { _dir.z += Math.sin(s.t * 9 + side) * 0.2; _dir.normalize(); }
      }
      _q.setFromUnitVectors(_up, _dir);
      arm.quaternion.slerp(_q, k);
      arm.scale.y = damp(arm.scale.y, scaleY, 20, dt);
    }
    for (let i = 0; i < this.anims.length; i++) this.anims[i](dt, s);
  }

  /** Public API bundle for `group.userData`. */
  api() {
    return {
      charId: this.charId,
      head: this.head,
      body: this.body,
      rig: this,
      setExpression: (n) => this.setExpression(n),
      lookSteer: (steer, dt) => this.lookSteer(steer, dt),
      setPose: (n) => this.setPose(n),
      /** @param {number} speedFrac 0..1 @param {number} [boost] 0..1 */
      setMotion: (speedFrac, boost = 0) => { this.state.speed = speedFrac; this.state.boost = boost; },
      /** Free-form animation flag read by a character's `anim` (e.g. Biscuit's `zoom`). */
      setFlag: (key, v) => { this.state[key] = v; },
      dispose: () => { for (const d of this.disposers) d(); this.disposers.length = 0; },
    };
  }
}

// ---- shared body parts ----------------------------------------------------------------------------------------------

/**
 * Standard pelvis + legs + boots (mostly hidden inside the kart). Adds to `b`.
 * @param {GeoBuilder} b
 * @param {{pants: number, boots: number, w?: number, thick?: number}} o
 */
export function addLegs(b, o) {
  const w = o.w ?? 0.72, t = o.thick ?? 1;
  b.rbox([w, 0.3, 0.5], 0.13, { p: [0, -0.02, 0], c: o.pants });
  for (const sx of [-1, 1]) {
    b.rbox([0.27 * t, 0.27 * t, 0.62], 0.11, { p: [sx * 0.2, 0.02, 0.3], c: o.pants });
    b.rbox([0.25 * t, 0.46, 0.26 * t], 0.1, { p: [sx * 0.2, -0.22, 0.6], c: o.pants, c2: o.pants });
    b.rbox([0.29 * t, 0.17, 0.44], 0.08, { p: [sx * 0.2, -0.47, 0.7], c: o.boots });
  }
}

/**
 * Standard straight arm hanging along -Y from the shoulder pivot: sleeve, cuff and hand.
 * @param {number} side +1 = the character's left arm (+X), -1 = right
 * @param {{sleeve: number, sleeve2?: number, cuff?: number, glove: number, r?: number, len?: number, stripe?: number, hand?: number, shoulderBall?: boolean, skin?: number, sleeveFrac?: number}} o
 * @returns {THREE.BufferGeometry}
 */
export function standardArm(side, o) {
  const b = new GeoBuilder();
  const r = o.r ?? 0.125, len = o.len ?? 0.72;
  const handR = o.hand ?? 0.15;
  if (o.shoulderBall !== false) b.sphere(r * 1.32, { c: o.sleeve2 ?? o.sleeve, p: [0, 0, 0] });
  const seg = len - handR * 1.2;
  if (o.skin !== undefined) {
    const sl = seg * (o.sleeveFrac ?? 0.42);
    b.add(new THREE.CylinderGeometry(r * 0.96, r * 0.9, sl, 12), { p: [0, -sl / 2 - 0.02, 0], c: o.sleeve, c2: o.sleeve2 ?? o.sleeve });
    b.add(new THREE.CylinderGeometry(r * 0.84, r * 0.74, seg - sl, 12), { p: [0, -sl - (seg - sl) / 2 - 0.02, 0], c: o.skin, c2: o.skin });
    b.torus(r * 0.92, r * 0.16, { p: [0, -sl - 0.02, 0], r: [Math.PI / 2, 0, 0], c: o.cuff ?? o.sleeve }, 6, 14);
  } else {
    b.add(new THREE.CylinderGeometry(r * 0.96, r * 0.82, seg, 12), { p: [0, -seg / 2 - 0.02, 0], c: o.sleeve, c2: o.sleeve2 ?? o.sleeve });
  }
  if (o.stripe !== undefined) b.box(0.028, seg * 0.86, r * 0.75, { p: [side * r * 0.93, -seg / 2 - 0.02, 0.0], c: o.stripe });
  if (o.skin === undefined) b.torus(r * 0.84, r * 0.2, { p: [0, -seg - 0.005, 0], r: [Math.PI / 2, 0, 0], c: o.cuff ?? o.sleeve }, 6, 14);
  b.sphere(handR, { p: [0, -len + handR * 0.55, 0.01], c: o.glove, c2: o.glove });
  return b.build();
}
