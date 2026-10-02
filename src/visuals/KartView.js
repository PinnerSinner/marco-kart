// KartView: everything visual about ONE racer: meshes, interpolation, attitude from the ground normal, drift lean / hop, land squash,
// spin-out, shrink, boost flames, invincibility shell, firewall bubble, fibre trail, respawn drone, nametag, per-kart particles and skid marks.
// Created and driven by RaceView; nothing here allocates per frame.
import * as THREE from 'three';
import { CFG } from '../core/config.js';
import { getCharacter } from '../core/roster.js';
import { Assets } from '../core/assets.js';
import { clamp, damp, angleDiff, smoothstep } from '../core/util.js';
import { createDriverKart } from './karts.js';
import { createFirewallBubble } from './itemMeshes.js';
import { bubbleMaterial } from './materials.js';
import { cachedGeo } from './rig.js';
import { GeoBuilder } from './geo.js';
import { clothMaterial, outlinedMesh } from './toon.js';
import { makeCanvas, toTexture, inkText, rrect } from './canvas.js';
import { FX, DRIFT_COLOURS } from '../fx/presets.js';
import { RibbonTrail } from '../fx/RibbonTrail.js';

const _X = new THREE.Vector3();
const _Y = new THREE.Vector3();
const _Z = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _qp = new THREE.Quaternion();
const _ax = new THREE.Vector3(1, 0, 0);
const _tv = new THREE.Vector3();

const DUST = { road: 0xb9b6ad, kerb: 0xd9d5cc, grass: 0x8cc860, sand: 0xe6c98a, oil: 0x2e2836, boost: 0xdff6ff, water: 0xeaf8ff };
const HARD = { road: true, kerb: true, boost: true, oil: true };
const RESPAWN_DUR = 1.7;

let shellGeo = null;
let flameGeo = null;
let droneGeo = null;
let beamGeo = null;

const flameGeometry = () => flameGeo ?? (flameGeo = (() => { const g = new THREE.ConeGeometry(0.17, 1, 10, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.5); return g; })());

/** Shared materials whose time uniform RaceView advances once per frame. */
export function createSharedMaterials() {
  return {
    shell: bubbleMaterial({ color: 0xffffff, edge: 0xffffff, alpha: 0.05, edgeAlpha: 0.9, power: 1.8, hue: true, additive: true }),
    shield: null,
  };
}

export class KartView {
  /**
   * @param {object} racer Racer (see SPEC section 5)
   * @param {number} index racer index (skid strips, colours)
   * @param {object} ctx shared RaceView context
   */
  constructor(racer, index, ctx) {
    this.racer = racer;
    this.kart = racer.kart;
    this.id = racer.id;
    this.index = index;
    this.ctx = ctx;
    const ch = getCharacter(racer.charId);
    this.character = ch;
    this.model = createDriverKart(racer.charId, racer.kartId);
    this.root = new THREE.Group();
    this.root.name = `racer-${racer.id}`;
    this.lean = new THREE.Group();
    this.root.add(this.lean);
    this.lean.add(this.model.group);
    ctx.root.add(this.root);
    this.driver = this.model.driver.userData;

    // interpolation state
    this.prev = { x: 0, y: 0, z: 0, yaw: 0 };
    this.cur = { x: 0, y: 0, z: 0, yaw: 0 };
    this.seeded = false;
    this.up = new THREE.Vector3(0, 1, 0);
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;
    this.fx = 0; this.fz = 1;
    this.speedFrac = 0;
    this.showPlace = false;
    this._landedFx = false;

    // animation springs / timers
    this.driftBlend = 0; this.driftDir = 1; this.hopY = 0; this.hopV = 0;
    this.squash = 0; this.squashV = 0; this.stretch = 0; this.stretchV = 0;
    this.scaleNow = 1;
    this.spinAng = 0; this.spinT0 = 0; this.spinning = false; this.physSpin = false;
    this.airPitch = 0;
    this.roll = 0;
    this.flame = 0; this.boostKind = 'item'; this.boostLevel = 1; this.boostPower = 1; this.boostT = 0;
    this.expr = 'neutral'; this.exprT = 0; this.exprNow = '';
    this.poseNow = '';
    this.respT = 0; this.respActive = false;
    this.shieldPop = 0; this.hadShield = false;
    this.lastLevel = 0;
    this.lastDriftLevel = 0;
    this.acc = { spark: 0, dust: 0, flame: 0, sparkle: 0, wheel: 0, box: 0 };
    this.dist = 0;
    this.lod = 0;
    this.blob = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, air: 0, scale: 1, yaw: 0, alpha: 1 };

    // rear wheel local offsets (kart space)
    const rl = this.model.wheels[2], rr = this.model.wheels[3];
    this.wheelL = { x: rl.position.x, y: rl.userData.radius, z: rl.position.z };
    this.wheelR = { x: rr.position.x, y: rr.userData.radius, z: rr.position.z };
    this.wheelPos = [new THREE.Vector3(), new THREE.Vector3()];

    // outlines for LOD
    this.outlines = [];
    this.model.group.traverse((o) => { if (o.userData?.outline && o.userData.outline.parent === o) this.outlines.push(o.userData.outline); });

    this._buildFlames();
    this._buildShell();
    this.shield = null;
    this.trail = null;
    this.drone = null;
    this.tag = null;
    if (!racer.isPlayer) this._buildTag();
    this.stars = null;
  }

  // ---- construction helpers ---------------------------------------------------------------------------------------

  _buildFlames() {
    this.flameMats = [
      new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    ];
    this.flames = [];
    for (const ex of this.model.exhausts) {
      const outer = new THREE.Mesh(flameGeometry(), this.flameMats[0]);
      const inner = new THREE.Mesh(flameGeometry(), this.flameMats[1]);
      outer.visible = inner.visible = false;
      outer.renderOrder = 12; inner.renderOrder = 13;
      ex.add(outer, inner);
      this.flames.push([outer, inner]);
    }
  }

  _buildShell() {
    shellGeo = shellGeo ?? new THREE.SphereGeometry(1, 20, 14);
    this.shell = new THREE.Mesh(shellGeo, this.ctx.mats.shell);
    this.shell.scale.set(1.5, 1.25, 2.15);
    this.shell.position.y = 0.85;
    this.shell.visible = false;
    this.shell.renderOrder = 6;
    this.lean.add(this.shell);
  }

  _buildShield() {
    this.shield = createFirewallBubble(1);
    this.shield.scale.setScalar(0.0001);
    this.shield.position.y = 0.95;
    this.shield.visible = false;
    this.lean.add(this.shield);
  }

  _buildTag() {
    const canvas = makeCanvas(256, 72);
    if (!canvas) return;
    this.tagCanvas = canvas;
    this.tagTex = toTexture(canvas, { aniso: 2, mip: false });
    const mat = new THREE.SpriteMaterial({ map: this.tagTex, transparent: true, depthWrite: false, depthTest: true, toneMapped: false });
    this.tag = new THREE.Sprite(mat);
    this.tag.center.set(0.5, 0);
    this.tag.renderOrder = 20;
    this.tag.visible = false;
    this.ctx.root.add(this.tag);
    this.tagPlace = -1; this.tagShowPlace = false;
    this.tagName = '';
  }

  _drawTag(name, place, showPlace) {
    const c = this.tagCanvas, g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    const col = '#' + this.character.colour.toString(16).padStart(6, '0');
    const x0 = showPlace ? 58 : 10;
    rrect(g, x0, 10, w - x0 - 10, 52, 16);
    g.fillStyle = 'rgba(12,16,34,0.78)'; g.fill();
    g.lineWidth = 4; g.strokeStyle = col; g.stroke();
    let size = 32;
    g.font = `900 ${size}px system-ui, Arial, sans-serif`;
    const maxW = w - x0 - 34;
    while (g.measureText(name).width > maxW && size > 16) { size -= 2; g.font = `900 ${size}px system-ui, Arial, sans-serif`; }
    inkText(g, name, x0 + (w - x0 - 10) / 2, 37, { font: `900 ${size}px system-ui, Arial, sans-serif`, fill: '#ffffff', stroke: '#0b1020', lw: 5 });
    if (showPlace) {
      g.beginPath(); g.arc(34, 36, 27, 0, Math.PI * 2);
      g.fillStyle = col; g.fill(); g.lineWidth = 5; g.strokeStyle = '#0b1020'; g.stroke();
      inkText(g, String(place), 34, 38, { font: '900 32px system-ui, Arial, sans-serif', fill: '#ffffff', stroke: '#0b1020', lw: 5 });
    }
    this.tagTex.needsUpdate = true;
  }

  _buildDrone() {
    const g = new THREE.Group();
    droneGeo = droneGeo ?? cachedGeo('drone', () => {
      const b = new GeoBuilder();
      b.rbox([0.9, 0.3, 0.9], 0.12, { c: 0x3a4266, c2: 0x8f98ad });
      b.rbox([0.5, 0.16, 0.5], 0.06, { p: [0, 0.2, 0], c: 0x22d3ee, c2: 0x9ff8ff });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        b.tube([sx * 0.2, 0, sz * 0.2], [sx * 0.7, 0.05, sz * 0.7], 0.04, { c: 0x2a2f42 });
        b.cyl(0.07, 0.07, 0.12, { p: [sx * 0.7, 0.08, sz * 0.7], c: 0x14161f });
      }
      b.sphere(0.12, { p: [0, -0.2, 0], c: 0xff4fd8, k: 1 });
      return b.build();
    });
    g.add(outlinedMesh(droneGeo, clothMaterial(), 0.03, 0x1b1226));
    this.rotors = [];
    const rotorGeo = cachedGeo('rotor', () => new THREE.CylinderGeometry(0.5, 0.5, 0.01, 18));
    const rotorMat = new THREE.MeshBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const r = new THREE.Mesh(rotorGeo, rotorMat);
      r.position.set(sx * 0.7, 0.16, sz * 0.7);
      g.add(r); this.rotors.push(r);
    }
    beamGeo = beamGeo ?? (() => { const b = new THREE.CylinderGeometry(0.55, 1.15, 1, 20, 1, true); b.translate(0, -0.5, 0); return b; })();
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0x66f0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(beamGeo, this.beamMat);
    this.beam.renderOrder = 8;
    g.add(this.beam);
    g.visible = false;
    this.drone = g;
    this.ctx.root.add(g);
  }

  // ---- state capture -----------------------------------------------------------------------------------------------

  /** Shift cur -> prev and read the physics state. Called once per fixed step (or auto-detected). */
  capture() {
    const k = this.kart, c = this.cur, p = this.prev;
    p.x = c.x; p.y = c.y; p.z = c.z; p.yaw = c.yaw;
    const x = k.pos.x, y = k.pos.y, z = k.pos.z;
    if (!this.seeded || !(Math.abs(x - c.x) < 12 && Math.abs(z - c.z) < 12 && Math.abs(y - c.y) < 12)) {
      // first frame or teleport: no interpolation across the jump
      p.x = x; p.y = y; p.z = z; p.yaw = k.yaw;
      this.seeded = true;
      this.up.set(0, 1, 0);
    }
    c.x = x; c.y = y; c.z = z; c.yaw = k.yaw;
  }

  /** True when the physics state differs from the last capture (used for auto-capture without an external step hook). */
  changed() {
    const k = this.kart, c = this.cur;
    return !this.seeded || k.pos.x !== c.x || k.pos.z !== c.z || k.pos.y !== c.y || k.yaw !== c.yaw;
  }

  // ---- events -------------------------------------------------------------------------------------------------------

  flash(name, seconds) { this.expr = name; this.exprT = seconds; }

  onDriftStart(dir) {
    this.driftDir = dir;
    this.hopV = 5.2; this.hopY = 0.001;
    const a = this.ctx.add, n = this.ctx.norm;
    for (let i = 0; i < 2; i++) {
      const w = this.wheelPos[i];
      n.burst(FX.dust(0xd9d5cc), 2, w.x, w.y + 0.1, w.z, 1.6, 0, 0.6, 0);
      a.burst(FX.sparks[0], 4, w.x, w.y + 0.1, w.z, 4, 0, 1.5, 0);
    }
  }

  onDriftLevel(level) {
    this.lastDriftLevel = level;
    if (level <= 0) return;
    const c = DRIFT_COLOURS[level], a = this.ctx.add;
    for (let i = 0; i < 2; i++) {
      const w = this.wheelPos[i];
      a.burst(FX.sparkleColour[level], 5, w.x, w.y + 0.2, w.z, 3.5, 0, 1.2, 0);
      a.emit(FX.ringFlat(c), w.x, w.y + 0.06, w.z, 0, 0, 0, 0.55);
    }
    a.emit(FX.glowPuff(c), this.x, this.y + 0.9, this.z, 0, 0, 0, 1.6, 0.6);
    this.squashV += 1.2;
  }

  onBoost(kind, power, duration) {
    this.boostKind = kind || 'item';
    this.boostPower = power || 1;
    this.boostT = duration || 1;
    if (this.boostKind === 'drift') this.boostLevel = this.lastDriftLevel || 1;
    this.stretchV += 3.2;
    const a = this.ctx.add;
    const big = this.boostKind === 'start' ? 1.8 : this.boostKind === 'jump' ? 1.4 : 1;
    for (let i = 0; i < 2; i++) {
      const ex = this.exhaustPos(i);
      a.burst(FX.flameCore, Math.round(6 * big), ex.x, ex.y, ex.z, 3.5 * big, -this.fx * 6, 0.4, -this.fz * 6);
    }
    if (this.kart.status?.spin <= 0) this.flash('boost', Math.min(2, duration || 1));
    if (this.boostKind === 'pad') a.emit(FX.ringFlat(0x66c8ff), this.x, this.y + 0.06, this.z, 0, 0, 0, 1.2);
  }

  onLand(impact) {
    this.squash = Math.max(this.squash, Math.min(0.42, 0.14 + 0.02 * (impact || 0)));
    this.squashV = 0;
    const s = this.kart.ground?.surface ?? 'road';
    const c = DUST[s] ?? DUST.road;
    const n = this.ctx.norm;
    n.burst(FX.landPuff(c), 6, this.x, this.y + 0.15, this.z, 3, 0, 0.5, 0, 0, 0.9);
    if (s === 'water') n.burst(FX.spray, 8, this.x, this.y + 0.2, this.z, 4, 0, 2, 0, 0.6);
  }

  onSpin() {
    this.flash('hit', 1.6);
    this.spinning = true;
    this.spinT0 = Math.max(0.6, this.kart.status?.spin || 1.4);
    this.spinAng = 0;
    this.physSpin = false;
    this.hopV = 6.5; this.hopY = 0.001;
  }

  onShrink() {
    const n = this.ctx.norm;
    n.burst(FX.smoke, 6, this.x, this.y + 0.8, this.z, 2.4, 0, 0.5, 0);
    this.ctx.add.burst(FX.sparkleColour[1], 6, this.x, this.y + 0.9, this.z, 3, 0, 0.5, 0);
    this.flash('sad', 2);
  }

  onRespawn() {
    this.respT = 0.0001;
    this.respActive = true;
    if (!this.drone) this._buildDrone();
    this.trail?.reset();
  }

  onBump(ox, oz) {
    const a = this.ctx.add;
    const mx = (this.x + ox) * 0.5, mz = (this.z + oz) * 0.5;
    a.burst(FX.sparks[0], 7, mx, this.y + 0.6, mz, 5, 0, 2, 0);
    a.emit(FX.flash, mx, this.y + 0.6, mz, 0, 0, 0, 0.3, 0.6);
  }

  onWallHit(impact) {
    const side = Math.sign(this.kart.ground?.lateral ?? 1) || 1;
    // yaw-right = (-cos, 0, sin)
    const rx = -Math.cos(this.yaw) * side, rz = Math.sin(this.yaw) * side;
    const a = this.ctx.add;
    const n = 4 + Math.min(10, Math.round((impact ?? 0.5) * 8));
    a.burst(FX.sparks[2], n, this.x + rx * 1.1, this.y + 0.5, this.z + rz * 1.1, 6, -rx * 2, 1.5, -rz * 2);
    this.ctx.norm.burst(FX.dust(0xcfcabf), 3, this.x + rx * 1.1, this.y + 0.4, this.z + rz * 1.1, 1.5, 0, 0.6, 0);
    this.squashV += 1.6;
  }

  onBlock() {
    if (this.shield) this.shield.userData.flash = 1;
    this.ctx.add.burst(FX.bubblePop, 14, this.x, this.y + 1, this.z, 6, 0, 1, 0);
  }

  onFinish(place) { this.flash(place <= 3 ? 'happy' : 'sad', 6); }

  // ---- per frame ----------------------------------------------------------------------------------------------------

  exhaustPos(i) {
    const e = this.model.exhausts[i];
    return _tv.set(e.position.x, e.position.y, e.position.z).applyQuaternion(this.root.quaternion).add(this.root.position);
  }

  /**
   * @param {number} dt frame seconds
   * @param {number} alpha interpolation factor between the last two fixed steps
   * @param {number} time render clock (s)
   */
  update(dt, alpha, time) {
    const ctx = this.ctx, k = this.kart, st = k.status ?? {};
    const c = this.cur, p = this.prev;
    const a = clamp(alpha, 0, 1);
    this.x = p.x + (c.x - p.x) * a;
    this.y = p.y + (c.y - p.y) * a;
    this.z = p.z + (c.z - p.z) * a;
    this.yaw = p.yaw + angleDiff(p.yaw, c.yaw) * a;
    const yawRate = Math.abs(angleDiff(p.yaw, c.yaw)) / CFG.fixedDt;
    this.speedFrac = clamp(Math.abs(k.speed ?? 0) / 34, 0, 1.2);
    this.fx = Math.sin(this.yaw); this.fz = Math.cos(this.yaw);

    const cam = ctx.camera.position;
    const ddx = this.x - cam.x, ddy = this.y - cam.y, ddz = this.z - cam.z;
    this.dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
    const lod = this.dist > 80 ? 1 : 0;
    if (lod !== this.lod) { this.lod = lod; for (let i = 0; i < this.outlines.length; i++) this.outlines[i].visible = lod === 0; }

    // ---- attitude: ground normal (smoothed), pitched by vertical velocity in the air
    const grounded = k.grounded !== false;
    const gn = k.ground?.normal;
    if (grounded && gn) _tv.set(gn.x, gn.y, gn.z); else _tv.set(0, 1, 0);
    const kk = 1 - Math.exp(-(grounded ? 14 : 4) * dt);
    this.up.x += (_tv.x - this.up.x) * kk; this.up.y += (_tv.y - this.up.y) * kk; this.up.z += (_tv.z - this.up.z) * kk;
    this.up.normalize();
    _Y.copy(this.up);
    _Z.set(this.fx, 0, this.fz);
    _Z.addScaledVector(_Y, -_Z.dot(_Y)).normalize();
    _X.crossVectors(_Y, _Z);
    _m4.makeBasis(_X, _Y, _Z);
    this.root.quaternion.setFromRotationMatrix(_m4);
    const vy = k.vel?.y ?? 0;
    const pitchT = grounded ? 0 : clamp(Math.atan2(vy, Math.max(4, Math.abs(k.speed ?? 0))), -0.7, 0.7) * 0.7;
    this.airPitch = damp(this.airPitch, pitchT, 8, dt);
    if (Math.abs(this.airPitch) > 0.002) { _qp.setFromAxisAngle(_ax, -this.airPitch); this.root.quaternion.multiply(_qp); }

    // ---- springs
    const drift = k.drift ?? { active: false, dir: 1, level: 0 };
    this.driftBlend = damp(this.driftBlend, drift.active && grounded ? 1 : 0, 10, dt);
    if (drift.active) this.driftDir = drift.dir || this.driftDir;
    this.squashV += (-140 * this.squash - 14 * this.squashV) * dt; this.squash += this.squashV * dt;
    this.stretchV += (-110 * this.stretch - 11 * this.stretchV) * dt; this.stretch += this.stretchV * dt;
    if (this.hopY > 0) { this.hopY += this.hopV * dt; this.hopV -= 34 * dt; if (this.hopY <= 0) { this.hopY = 0; this.hopV = 0; this.squash = Math.max(this.squash, 0.1); } }
    const shrinkT = (st.stun > 0 || (k.scale ?? 1) < 0.99) ? Math.min(k.scale ?? 1, 0.62) : 1;
    const prevScale = this.scaleNow;
    this.scaleNow = damp(this.scaleNow, shrinkT, 7, dt);
    if (Math.abs(this.scaleNow - prevScale) > 0.004) this.squashV += (this.scaleNow - prevScale) * 20;

    // ---- spin out
    const spinning = (st.spin ?? 0) > 0;
    if (spinning && !this.spinning) this.onSpin();
    if (!spinning) this.spinning = false;
    let spinAng = 0;
    if (this.spinning) {
      if (yawRate > 6) this.physSpin = true;
      if (!this.physSpin) {
        const prog = clamp(1 - st.spin / this.spinT0, 0, 1);
        const ease = 1 - Math.pow(1 - prog, 2);
        spinAng = ease * Math.PI * 4;
      }
    }

    // ---- lean group
    const steer = k.steer ?? 0;
    const rollT = -steer * 0.07 * this.speedFrac - this.driftDir * 0.11 * this.driftBlend;
    this.roll = damp(this.roll, rollT, 12, dt);
    this.lean.rotation.set(0, this.driftDir * 0.3 * this.driftBlend + spinAng, this.roll);
    const sc = this.scaleNow;
    const sq = this.squash;
    this.lean.scale.set(sc * (1 + sq * 0.55 - this.stretch * 0.08), sc * (1 - sq * 0.9 + this.stretch * 0.04), sc * (1 + sq * 0.55 + this.stretch * 0.22));
    const wobble = this.spinning ? Math.sin(time * 18) * 0.05 : 0;

    // ---- respawn drone
    let respY = 0;
    if ((st.respawning ?? 0) > 0 && !this.respActive) this.onRespawn();
    if (this.respActive) {
      this.respT += dt;
      const t = this.respT, kk2 = Math.min(1, t / 1.15);
      respY = (1 - kk2) * (1 - kk2) * (1 - kk2) * 7.5;
      this._updateDrone(dt, t, time, respY);
      if (t > RESPAWN_DUR) { this.respActive = false; this.respT = 0; this.drone.visible = false; }
    }

    this.root.position.set(this.x, this.y + this.hopY + respY + wobble, this.z);

    // ---- model animation
    this.model.animate(dt, steer, k.speed ?? 0);
    this._updateDriver(dt, steer, drift, st, spinning);

    // ---- world-space rear wheels (for sparks / dust / skid marks)
    this._wheelWorld(0, this.wheelL); this._wheelWorld(1, this.wheelR);

    // ---- effects
    this._boostFx(dt, time, k, st);
    this._surfaceFx(dt, k, grounded, drift);
    this._skid(k, grounded, drift);
    this._statusFx(dt, time, k, st, spinning);
    this._tag(dt, time);

    // blob shadow data (no query: uses the physics ground result)
    const g = k.ground;
    const gy = g && Number.isFinite(g.height) ? g.height : this.y;
    const air = Math.max(0, this.y + this.hopY - gy);
    const b = this.blob;
    b.x = this.x; b.y = gy + 0.03; b.z = this.z; b.yaw = this.yaw;
    b.nx = g?.normal?.x ?? 0; b.ny = g?.normal?.y ?? 1; b.nz = g?.normal?.z ?? 0;
    b.air = air; b.scale = sc * (1 + air * 0.04);
    b.alpha = (g?.inVoid ? 0 : 0.55) * (1 - clamp(air / 9, 0, 1)) * (1 - clamp(respY / 6, 0, 1));
  }

  _wheelWorld(i, w) {
    const out = this.wheelPos[i];
    out.set(w.x, 0, w.z).multiplyScalar(this.scaleNow).applyQuaternion(this.root.quaternion);
    out.x += this.x; out.y += this.y; out.z += this.z;
  }

  _updateDriver(dt, steer, drift, st, spinning) {
    const d = this.driver;
    if (this.dist < 95) {
      d.setMotion(this.speedFrac, (this.boostT > 0 ? 1 : 0));
      d.lookSteer(steer + this.driftDir * this.driftBlend * 0.5, dt);
    }
    if (this.exprT > 0) this.exprT -= dt;
    let e = 'neutral';
    if (spinning) e = 'hit';
    else if (this.exprT > 0) e = this.expr;
    else if ((this.kart.boost?.time ?? 0) > 0 || (drift.level ?? 0) >= 2) e = 'boost';
    if (e !== this.exprNow) { this.exprNow = e; d.setExpression(e); }
    let pose = 'drive';
    if (spinning) pose = 'spin';
    else if (this.racer.finished) pose = (this.racer.place ?? 9) <= 3 ? 'celebrate' : (this.racer.place ?? 0) >= 6 ? 'defeat' : 'drive';
    if (pose !== this.poseNow) { this.poseNow = pose; d.setPose(pose); }
  }

  _boostFx(dt, time, k, st) {
    const boosting = (k.boost?.time ?? 0) > 0;
    if (boosting) this.boostT = k.boost.time; else this.boostT = Math.max(0, this.boostT - dt);
    const power = boosting ? (k.boost.power || 1) : this.boostPower;
    if (boosting && k.boost.power >= 1.45 && this.boostKind !== 'fibre' && this.boostKind !== 'start') this.boostKind = 'fibre';
    const target = boosting ? 1 : 0;
    this.flame = damp(this.flame, target, boosting ? 22 : 9, dt);
    const on = this.flame > 0.03;
    const kind = this.boostKind;
    let cols;
    if (kind === 'drift') cols = FX.flameKind['drift' + clamp(this.boostLevel, 1, 3)];
    else cols = FX.flameKind[kind] ?? FX.flameKind.item;
    if (on) {
      const fl = 0.85 + Math.sin(time * 60 + this.index) * 0.12 + Math.sin(time * 37) * 0.08;
      const len = (0.55 + 1.9 * clamp(power / 1.3, 0.5, 1.5)) * this.flame * fl * (kind === 'start' ? 1.5 : 1);
      const w = (0.7 + 0.5 * this.flame) * (kind === 'fibre' ? 1.3 : 1);
      if (kind === 'fibre') { this.flameMats[0].color.setHSL((time * 0.8) % 1, 1, 0.6); this.flameMats[1].color.setHex(0xffffff); }
      else { this.flameMats[0].color.setHex(cols[1]); this.flameMats[1].color.setHex(cols[0]); }
      for (let i = 0; i < this.flames.length; i++) {
        const [o, inn] = this.flames[i];
        o.visible = inn.visible = true;
        o.scale.set(w, w, len); inn.scale.set(w * 0.55, w * 0.55, len * 0.62);
      }
      // trail particles
      this.acc.flame += dt * 70 * this.ctx.quality.emit;
      while (this.acc.flame >= 1) {
        this.acc.flame -= 1;
        const ex = this.exhaustPos(Math.random() < 0.5 ? 0 : 1);
        const sp = 6 + 8 * this.speedFrac;
        this.ctx.add.emit(FX.flameCore, ex.x, ex.y, ex.z, -this.fx * sp * 0.4, 0.3, -this.fz * sp * 0.4, 0.8 + 0.6 * this.flame);
      }
      if (kind === 'fibre') {
        this.acc.sparkle += dt * 40 * this.ctx.quality.emit;
        while (this.acc.sparkle >= 1) { this.acc.sparkle -= 1; this.ctx.add.emit(FX.rainbowSparkle[(Math.random() * 7) | 0], this.x + (Math.random() - 0.5) * 2, this.y + 0.4 + Math.random() * 1.2, this.z + (Math.random() - 0.5) * 2, -this.fx * 8, 0.5, -this.fz * 8); }
      }
      // speed streaks alongside
      if (this.racer.isPlayer && this.speedFrac > 0.5 && Math.random() < 0.5 * this.ctx.quality.emit) {
        const sx = (Math.random() - 0.5) * 8, sy = 0.3 + Math.random() * 3;
        this.ctx.add.emit(FX.whoosh, this.x + -Math.cos(this.yaw) * sx + this.fx * 6, this.y + sy, this.z + Math.sin(this.yaw) * sx + this.fz * 6, -this.fx * 30, 0, -this.fz * 30);
      }
    } else {
      for (let i = 0; i < this.flames.length; i++) { this.flames[i][0].visible = this.flames[i][1].visible = false; }
    }
    // fibre light trail (autopilot or fibre boost)
    const fibre = boosting && kind === 'fibre';
    if (fibre && !this.trail) {
      this.trail = [new RibbonTrail({ points: 26, width: 0.34, hueCycle: true, life: 0.55 }), new RibbonTrail({ points: 26, width: 0.34, hueCycle: true, life: 0.55 })];
      this.ctx.root.add(this.trail[0].mesh, this.trail[1].mesh);
    }
    if (this.trail) {
      for (let i = 0; i < 2; i++) {
        const w = this.wheelPos[i];
        this.trail[i].update(dt, this.ctx.camera.position, w.x, w.y + 0.6, w.z, fibre, time * 0.6 + i * 0.5);
      }
    }
  }

  _surfaceFx(dt, k, grounded, drift) {
    const g = k.ground;
    if (!g || !grounded) return;
    const surf = g.surface ?? 'road';
    const speed = Math.abs(k.speed ?? 0);
    const q = this.ctx.quality.emit;
    const slip = k.slip ?? 0;
    // drift sparks (colour by charge level)
    if (drift.active && HARD[surf]) {
      const lvl = drift.level ?? 0;
      const rate = [22, 46, 70, 96][lvl];
      this.acc.spark += dt * rate * q;
      while (this.acc.spark >= 1) {
        this.acc.spark -= 1;
        const w = this.wheelPos[Math.random() < 0.5 ? 0 : 1];
        const out = -this.driftDir; // outside of the turn
        const sx = -Math.cos(this.yaw) * out, sz = Math.sin(this.yaw) * out;
        this.ctx.add.emit(FX.sparks[lvl], w.x, w.y + 0.08, w.z, sx * (2 + Math.random() * 3) - this.fx * 3, 1.5 + Math.random() * 3, sz * (2 + Math.random() * 3) - this.fz * 3);
      }
      if (lvl > 0) {
        this.acc.wheel += dt * 30 * q;
        while (this.acc.wheel >= 1) { this.acc.wheel -= 1; const w = this.wheelPos[Math.random() < 0.5 ? 0 : 1]; this.ctx.add.emit(FX.wheelGlow(DRIFT_COLOURS[lvl]), w.x, w.y + 0.15, w.z, 0, 0.3, 0); }
      }
    }
    // dust / spray by surface
    if (speed < 5 || surf === 'void') return;
    let rate = 0;
    const sliding = drift.active || slip > 0.4;
    if (surf === 'grass' || surf === 'sand') rate = 24 + speed * 1.2;
    else if (surf === 'water') rate = 30 + speed * 1.8;
    else if (surf === 'oil') rate = sliding ? 16 : 5;
    else if (sliding) rate = 16 + speed * 0.4;
    else if (surf === 'kerb') rate = 5;
    if (rate <= 0) return;
    this.acc.dust += dt * rate * q;
    while (this.acc.dust >= 1) {
      this.acc.dust -= 1;
      const w = this.wheelPos[Math.random() < 0.5 ? 0 : 1];
      const bx = -this.fx * speed * 0.18, bz = -this.fz * speed * 0.18;
      const n = this.ctx.norm;
      if (surf === 'water') {
        n.emit(FX.spray, w.x, w.y + 0.15, w.z, bx + (Math.random() - 0.5) * 3, 2 + Math.random() * 3, bz + (Math.random() - 0.5) * 3);
        if (Math.random() < 0.6) this.ctx.add.emit(FX.droplet, w.x, w.y + 0.2, w.z, bx * 1.4 + (Math.random() - 0.5) * 4, 4 + Math.random() * 4, bz * 1.4 + (Math.random() - 0.5) * 4);
      } else if (surf === 'grass') {
        n.emit(FX.dust(DUST.grass), w.x, w.y + 0.15, w.z, bx, 1 + Math.random(), bz);
        n.emit(Math.random() < 0.35 ? FX.clump : FX.grass, w.x, w.y + 0.2, w.z, bx * 1.3 + (Math.random() - 0.5) * 3, 3 + Math.random() * 4, bz * 1.3 + (Math.random() - 0.5) * 3);
      } else if (surf === 'sand') {
        n.emit(FX.dust(DUST.sand), w.x, w.y + 0.15, w.z, bx, 1 + Math.random(), bz, 1.3);
      } else if (surf === 'oil') {
        n.emit(FX.dust(DUST.oil), w.x, w.y + 0.15, w.z, bx, 1.2, bz, 0.8);
      } else {
        n.emit(FX.dust(DUST[surf] ?? DUST.road), w.x, w.y + 0.12, w.z, bx, 0.8 + Math.random() * 0.6, bz, 0.8);
      }
    }
  }

  _skid(k, grounded, drift) {
    const g = k.ground;
    const skid = this.ctx.skid;
    const surf = g?.surface;
    const on = grounded && HARD[surf] && ((k.slip ?? 0) > 0.38 || drift.active) && Math.abs(k.speed ?? 0) > 5 && this.ctx.quality.skid;
    for (let i = 0; i < 2; i++) {
      const strip = this.index * 2 + i;
      if (!on) { skid.end(strip); continue; }
      const w = this.wheelPos[i];
      const vx = k.vel?.x ?? this.fx, vz = k.vel?.z ?? this.fz;
      const l = Math.hypot(vx, vz) || 1;
      const alpha = clamp(0.35 + (k.slip ?? 0) * 0.65, 0.3, 1);
      skid.add(strip, w.x, (g.height ?? this.y) + 0.035, w.z, -vz / l, vx / l, 0.2 * this.scaleNow, alpha);
    }
  }

  _statusFx(dt, time, k, st, spinning) {
    const q = this.ctx.quality.emit;
    // invincibility shell + sparkle trail
    const inv = (st.invincible ?? 0) > 0;
    this.shell.visible = inv && this.lod === 0;
    if (inv) {
      const s = 1 + Math.sin(time * 10) * 0.04;
      this.shell.scale.set(1.5 * s, 1.25 * s, 2.15 * s);
      this.acc.sparkle += dt * 32 * q;
      while (this.acc.sparkle >= 1) {
        this.acc.sparkle -= 1;
        this.ctx.add.emit(FX.rainbowSparkle[(Math.random() * 7) | 0], this.x + (Math.random() - 0.5) * 2, this.y + 0.3 + Math.random() * 1.6, this.z + (Math.random() - 0.5) * 2.4, -this.fx * 3, 0.6, -this.fz * 3);
      }
    }
    // firewall bubble
    const sh = !!this.racer.shield;
    if (sh && !this.shield) this._buildShield();
    if (this.shield) {
      const tgt = sh ? 1.75 * this.scaleNow : 0.0001;
      this.shieldPop = damp(this.shieldPop, tgt, sh ? 10 : 16, dt);
      const f = this.shield.userData.flash ?? 0;
      if (f > 0) this.shield.userData.flash = Math.max(0, f - dt * 3);
      const s = this.shieldPop * (1 + Math.sin(time * 5) * 0.02 + f * 0.25);
      this.shield.scale.set(s, s * 0.82, s * 1.18);
      this.shield.visible = this.shieldPop > 0.02;
      this.shield.userData.tick(time);
      if (this.hadShield && !sh) {
        this.ctx.add.burst(FX.bubblePop, 16, this.x, this.y + 1, this.z, 6, 0, 1, 0);
        this.ctx.add.emit(FX.ringFlat(0xff9a2a), this.x, this.y + 0.08, this.z, 0, 0, 0, 1.4);
      }
    }
    this.hadShield = sh;
    // dizzy stars while spinning
    if (spinning) {
      this.acc.box += dt * 24;
      while (this.acc.box >= 1) {
        this.acc.box -= 1;
        for (let i = 0; i < 3; i++) {
          const a = time * 5 + (i * Math.PI * 2) / 3;
          this.ctx.add.emit(FX.dizzy, this.x + Math.cos(a) * 0.85, this.y + 2.25 + Math.sin(a * 2) * 0.05, this.z + Math.sin(a) * 0.85, 0, 0, 0);
        }
      }
    }
  }

  _updateDrone(dt, t, time, respY) {
    const d = this.drone;
    d.visible = true;
    const rise = t > 1.2 ? (t - 1.2) : 0;
    d.position.set(this.x, this.y + respY + 3.1 + rise * rise * 26, this.z);
    d.rotation.y = this.yaw + Math.sin(time * 2) * 0.1;
    for (let i = 0; i < this.rotors.length; i++) this.rotors[i].rotation.y += dt * 60;
    const fadeIn = clamp(t / 0.25, 0, 1), fadeOut = 1 - clamp((t - 1.25) / 0.4, 0, 1);
    this.beamMat.opacity = 0.42 * fadeIn * fadeOut * (0.85 + Math.sin(time * 40) * 0.15);
    this.beam.scale.set(1, 3.5 + respY, 1);
    this.beam.position.y = -0.1;
    if (Math.random() < 0.8) this.ctx.add.emit(FX.beam, this.x + (Math.random() - 0.5) * 1.6, this.y + Math.random() * (respY + 3), this.z + (Math.random() - 0.5) * 1.6, 0, 1 + Math.random() * 2, 0);
    if (t < 1.2 && respY <= 0.05 && !this._landedFx) {
      this._landedFx = true;
      this.ctx.add.emit(FX.ringFlat(0x66f0ff), this.x, this.y + 0.06, this.z, 0, 0, 0, 1.6);
      this.ctx.add.burst(FX.beam, 12, this.x, this.y + 0.3, this.z, 4, 0, 1, 0);
    }
    if (t < 0.1) this._landedFx = false;
  }

  _tag(dt, time) {
    if (!this.tag) return;
    const tag = this.tag;
    const show = this.dist > 11 && this.dist < 85 && !this.respActive;
    tag.visible = show;
    if (!show) return;
    const r = this.racer;
    const clean = (v) => (typeof v === 'string' && v.trim() && !/^(null|undefined|nan)$/i.test(v.trim()) ? v.trim() : '');
    const name = (r.charId === 'biscuit' && clean(Assets.text('custom_rival_name', ''))) || clean(r.name) || clean(this.character?.name);
    if (!name || r.isPlayer) { tag.visible = false; return; }   // never draw 'null'/'undefined'; the player has no tag
    const place = Number.isFinite(r.place) && r.place > 0 ? Math.round(r.place) : 0;
    const showPlace = !!this.showPlace && place > 0;
    if (place !== this.tagPlace || showPlace !== this.tagShowPlace || name !== this.tagName) {
      this.tagPlace = place; this.tagShowPlace = showPlace; this.tagName = name;
      this._drawTag(name, place, showPlace);
    }
    const s = 0.75 + this.dist * 0.014;
    tag.scale.set(2.6 * s, 0.73 * s, 1);
    tag.position.set(this.x, this.y + (2.35 + 0.5 * this.scaleNow) * this.scaleNow + 0.1, this.z);
    tag.material.opacity = (1 - smoothstep(48, 84, this.dist)) * smoothstep(11, 17, this.dist);
  }

  dispose() {
    this.driver.dispose?.();
    this.root.parent?.remove(this.root);
    for (const m of this.flameMats) m.dispose();
    if (this.tag) { this.tag.parent?.remove(this.tag); this.tag.material.dispose(); this.tagTex.dispose(); }
    if (this.trail) for (const t of this.trail) { t.mesh.parent?.remove(t.mesh); t.dispose(); }
    if (this.drone) { this.drone.parent?.remove(this.drone); this.beamMat.dispose(); }
    if (this.shield) this.shield.material.dispose();
  }
}

