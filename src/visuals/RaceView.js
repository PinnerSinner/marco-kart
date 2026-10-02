// RaceView: renders a Race (SPEC sections 4 to 6) into a THREE.Scene. Owns kart + driver meshes for every racer (KartView), item boxes
// (instanced), world items (pooled), blob shadows (instanced), skid marks, all particle effects and the reactions to bus events.
//
//   const view = new RaceView({ scene, camera, race, track, quality });
//   per fixed step (optional but exact):  view.snapshot();   // after race.step(...)
//   per frame:                             view.update(frameDt, alpha);
import * as THREE from 'three';
import { bus } from '../core/bus.js';
import { CFG } from '../core/config.js';
import { clamp } from '../core/util.js';
import { KartView, createSharedMaterials } from './KartView.js';
import { createItemMesh, getItemBoxParts } from './itemMeshes.js';
import { ParticlePool } from '../fx/ParticlePool.js';
import { SkidMarks } from '../fx/SkidMarks.js';
import { FX } from '../fx/presets.js';
import { EggView } from './easterEggs.js';

const BOX_SIZE = 1.7;
const QUALITY = {
  low: { emit: 0.35, skid: false, pool: 1024 },
  medium: { emit: 0.7, skid: true, pool: 2048 },
  high: { emit: 1, skid: true, pool: 3072 },
};

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();

const popScale = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * (1 + 0.35 * Math.sin(Math.PI * k)));

const BLOB_VERT = /* glsl */`
  attribute float aAlpha; varying vec2 vUv; varying float vA;
  void main() { vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 ); }`;
const BLOB_FRAG = /* glsl */`
  varying vec2 vUv; varying float vA;
  void main() {
    float r = length( vUv - 0.5 ) * 2.0;
    float a = smoothstep( 1.0, 0.25, r );
    gl_FragColor = vec4( 0.05, 0.04, 0.12, a * a * vA );
    if ( gl_FragColor.a < 0.005 ) discard;
    #include <colorspace_fragment>
  }`;

export class RaceView {
  /**
   * @param {{scene: THREE.Scene, camera: THREE.Camera, race: object, track: object, quality?: 'low'|'medium'|'high'}} o
   */
  constructor({ scene, camera, race, track, quality = 'high' }) {
    this.scene = scene; this.camera = camera; this.race = race; this.track = track;
    this.time = 0;
    this.externalSnap = false;
    this.root = new THREE.Group();
    this.root.name = 'race-view';
    scene.add(this.root);
    this.quality = { ...QUALITY[quality] ?? QUALITY.high, name: quality };

    this.add = new ParticlePool({ capacity: this.quality.pool, blending: 'add', renderOrder: 12 });
    this.norm = new ParticlePool({ capacity: this.quality.pool, blending: 'normal', renderOrder: 9 });
    this.root.add(this.add.mesh, this.norm.mesh);
    this.skid = new SkidMarks({ segments: 1000, strips: Math.max(16, (race.racers?.length ?? 8) * 2 + 2) });
    this.root.add(this.skid.mesh);
    this.ctx = { root: this.root, camera, track, add: this.add, norm: this.norm, skid: this.skid, quality: this.quality, mats: createSharedMaterials() };
    this._applyQuality();

    this.karts = [];
    this.byId = new Map();
    for (let i = 0; i < race.racers.length; i++) this._addKart(race.racers[i], i);
    this._buildBlobs();
    this._buildBoxes();
    this._items = new Map();
    this._itemPool = new Map();
    this._recPool = [];
    this._frame = 0;
    this._gq = { height: 0, normal: new THREE.Vector3(0, 1, 0), surface: 'road', onRoad: true, s: 0, lateral: 0, inVoid: false };
    this.confettiT = 0;
    this._off = [];
    this._subscribe();
    this.eggs = null;                                       // Biscuit's easter eggs (hydrant, paw prints, reactions); needs `race.eggs`
    try { if (race.eggs) this.eggs = new EggView({ root: this.root, race, add: this.add, norm: this.norm, getKart: (id) => this.byId.get(id), confetti: (x, y, z, n) => this.confetti(x, y, z, n), quality: this.quality }); } catch (e) { this.eggs = null; }
  }

  // ---- setup ------------------------------------------------------------------------------------------------------

  _addKart(racer, index) {
    const kv = new KartView(racer, index, this.ctx);
    kv.capture();
    this.karts.push(kv);
    this.byId.set(racer.id, kv);
    return kv;
  }

  _buildBlobs() {
    const cap = 96;
    const g = new THREE.PlaneGeometry(2, 2);
    g.rotateX(-Math.PI / 2);
    this.blobAlpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aAlpha', this.blobAlpha);
    const mat = new THREE.ShaderMaterial({
      vertexShader: BLOB_VERT, fragmentShader: BLOB_FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.blobs = new THREE.InstancedMesh(g, mat, cap);
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 3;
    this.blobs.count = 0;
    this.root.add(this.blobs);
    this.blobCap = cap;
  }

  _buildBoxes() {
    const parts = getItemBoxParts(BOX_SIZE);
    this.boxParts = parts;
    const n = Math.max(64, this.race.itemBoxes?.length ?? this.track.itemBoxes?.length ?? 0);
    this.boxCap = n;
    this.boxGlass = new THREE.InstancedMesh(parts.glassGeo, parts.glassMat, n);
    this.boxFrame = new THREE.InstancedMesh(parts.frameGeo, parts.frameMat, n);
    this.boxQ = parts.qMat ? new THREE.InstancedMesh(parts.qGeo, parts.qMat, n) : null;
    for (const m of [this.boxGlass, this.boxFrame, this.boxQ]) {
      if (!m) continue;
      m.frustumCulled = false; m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(m);
    }
    this.boxGlass.renderOrder = 4;
    if (this.boxQ) this.boxQ.renderOrder = 5;
    this.boxPop = new Float32Array(n).fill(1);
    this.boxWas = new Uint8Array(n).fill(1);
  }

  _applyQuality() {
    this.add.density = this.quality.emit;
    this.norm.density = this.quality.emit;
    this.skid.enabled = this.quality.skid;
  }

  /** Change the quality tier at runtime. @param {'low'|'medium'|'high'} q */
  setQuality(q) {
    const t = QUALITY[q] ?? QUALITY.high;
    this.quality.emit = t.emit; this.quality.skid = t.skid; this.quality.name = q;
    this._applyQuality();
    if (!t.skid) this.skid.clear();
  }

  _subscribe() {
    const on = (name, fn) => this._off.push(bus.on(name, fn));
    const kv = (d) => this.byId.get(d?.id);
    on('kart:drift-start', (d) => kv(d)?.onDriftStart(d.dir));
    on('kart:drift-level', (d) => kv(d)?.onDriftLevel(d.level));
    on('kart:boost', (d) => kv(d)?.onBoost(d.kind, d.power, d.duration));
    on('kart:perfect-jump', (d) => this._onPerfectJump(kv(d)));
    on('kart:land', (d) => kv(d)?.onLand(d.impact));
    on('kart:wall-hit', (d) => kv(d)?.onWallHit(d.impact));
    on('kart:bump', (d) => { const a = kv(d), b = this.byId.get(d.otherId); if (a && b) { a.onBump(b.x, b.z); a.flash('sad', 0.9); } });
    on('kart:spin', (d) => kv(d)?.onSpin());
    on('kart:shrink', (d) => kv(d)?.onShrink());
    on('kart:respawn', (d) => kv(d)?.onRespawn());
    on('kart:surface', (d) => this._onSurface(kv(d), d.surface));
    on('item:box', (d) => this._onBoxPicked(d));
    on('item:get', (d) => { const k = kv(d); if (k) { k.flash('happy', 1.2); this.add.burst(FX.sparkleColour[1], 6, k.x, k.y + 1.4, k.z, 3, 0, 1.5, 0); } });
    on('item:use', (d) => this._onItemUse(kv(d), d));
    on('item:hit', (d) => this._onItemHit(d));
    on('item:block', (d) => kv(d)?.onBlock());
    on('race:finish', (d) => { const k = kv(d); if (k) k.onFinish(d.place); if (d.isPlayer && d.place <= 3) this.confettiT = 6; });
    on('race:over', () => { const pl = this.race.player; if (pl && (pl.place ?? 9) <= 3 && this.confettiT <= 0) this.confettiT = 5; });
    on('race:lap', (d) => { const k = kv(d); if (k) this.add.emit(FX.ringFlat(d.final ? 0xffd166 : 0x22d3ee), k.x, k.y + 0.06, k.z, 0, 0, 0, 1.5); });
    on('race:overtake', (d) => { kv(d)?.flash('happy', 1.4); const p = this.byId.get(d.passedId); if (p) p.flash('sad', 1.4); });
    on('race:start', () => { for (const k of this.karts) this.norm.burst(FX.dust(0xd9d5cc), 4, k.x, k.y + 0.2, k.z, 2, -k.fx * 3, 0.3, -k.fz * 3); });
  }

  // ---- event helpers ----------------------------------------------------------------------------------------------------

  _onSurface(k, surface) {
    if (!k || Math.abs(k.kart.speed ?? 0) < 6) return;
    if (surface === 'water') {
      this.norm.burst(FX.spray, 14, k.x, k.y + 0.3, k.z, 5, 0, 3, 0, 0.7);
      this.add.burst(FX.droplet, 10, k.x, k.y + 0.3, k.z, 6, 0, 4, 0, 0.7);
    } else if (surface === 'grass' || surface === 'sand') {
      this.norm.burst(FX.dust(surface === 'sand' ? 0xe6c98a : 0x8cc860), 5, k.x, k.y + 0.2, k.z, 2.5, -k.fx * 3, 1, -k.fz * 3);
    }
  }

  /** Perfect take-off: gold sparks from the wheels, a flat ring under the kart and a happy face. */
  _onPerfectJump(k) {
    if (!k) return;
    k.flash('happy', 1.2);
    for (let i = 0; i < 2; i++) {
      const ex = k.exhaustPos(i);
      this.add.burst(FX.jumpSpark, 9, ex.x, ex.y, ex.z, 4.5, -k.fx * 3, 3, -k.fz * 3);
    }
    this.add.burst(FX.sparkleColour[1], 6, k.x, k.y + 0.6, k.z, 4, 0, 2.5, 0);
    this.add.emit(FX.ringFlat(0xffd166), k.x, k.y + 0.06, k.z, 0, 0, 0, 1.4);
  }

  _onBoxPicked(d) {
    const b = this.race.itemBoxes?.[d.index];
    if (!b) return;
    const i = d.index;
    if (i < this.boxCap) this.boxWas[i] = 0;
    for (let c = 0; c < FX.boxBurst.length; c++) this.add.burst(FX.boxBurst[c], 5, b.pos.x, b.pos.y, b.pos.z, 6, 0, 1.5, 0);
    this.add.emit(FX.flash, b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, 0.5, 0.7);
    this.add.emit(FX.ringBillboard(0xffffff), b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, 1.4);
    if (i < this.boxCap) this.boxPop[i] = Math.min(this.boxPop[i], 0.6);
  }

  _onItemUse(k, d) {
    if (!k) return;
    const a = this.add;
    switch (d.item) {
      case 'sudo':
        for (let i = 0; i < 7; i++) a.burst(FX.rainbowSparkle[i], 3, k.x, k.y + 1, k.z, 7, 0, 2, 0);
        a.emit(FX.ringFlat(0xffd23f), k.x, k.y + 0.08, k.z, 0, 0, 0, 1.8);
        break;
      case 'firewall':
        a.burst(FX.bubblePop, 12, k.x, k.y + 1, k.z, 5, 0, 1, 0);
        a.emit(FX.ringFlat(0xff9a2a), k.x, k.y + 0.08, k.z, 0, 0, 0, 1.6);
        break;
      case 'fibre':
        a.emit(FX.flash, k.x, k.y + 0.9, k.z, 0, 0, 0, 0.9, 0.8);
        a.burst(FX.beam, 14, k.x, k.y + 0.8, k.z, 7, 0, 1, 0);
        break;
      case 'outage':
        this.norm.burst(FX.smoke, 12, k.x, k.y + 2.4, k.z, 4, 0, 0.5, 0, 0, 0.6);
        a.emit(FX.flash, k.x, k.y + 2.6, k.z, 0, 0, 0, 1.4, 0.55);
        a.burst(FX.sparkleColour[2], 8, k.x, k.y + 2.4, k.z, 6, 0, 0, 0);
        break;
      case 'kernel_panic':
        a.emit(FX.flash, k.x, k.y + 1.2, k.z, 0, 0, 0, 1.2, 0.8);
        a.burst(FX.kernel, 6, k.x, k.y + 1.2, k.z, 4, 0, 1, 0);
        break;
      case 'espresso':
        a.burst(FX.flameCore, 6, k.x, k.y + 0.6, k.z, 3, -k.fx * 3, 0.5, -k.fz * 3);
        break;
      default:
        a.burst(FX.sparkleColour[1], 4, k.x + k.fx * 1.5, k.y + 0.8, k.z + k.fz * 1.5, 3, 0, 1, 0);
    }
  }

  _onItemHit(d) {
    const k = this.byId.get(d.victimId);
    if (!k) return;
    const a = this.add, n = this.norm;
    const x = k.x, y = k.y + 0.9, z = k.z;
    a.emit(FX.flash, x, y, z, 0, 0, 0, 1, 1);
    switch (d.item) {
      case 'kernel_panic':
        a.emit(FX.flash, x, y, z, 0, 0, 0, 2.2, 1);
        a.burst(FX.fireball, 14, x, y, z, 12, 0, 3, 0, 0.3);
        a.burst(FX.ember, 40, x, y, z, 22, 0, 5, 0, 0.6);
        a.emit(FX.shockwave, x, k.y + 0.1, z, 0, 0, 0, 1.35);
        a.emit(FX.ringBillboard(0xff5a5a), x, y, z, 0, 0, 0, 3);
        n.burst(FX.smoke, 14, x, y, z, 6, 0, 2, 0, 0.5);
        n.burst(FX.debris, 12, x, y, z, 12, 0, 6, 0, 0.6);
        break;
      case 'ping':
        a.burst(FX.sparkleColour[1], 10, x, y, z, 9, 0, 2, 0);
        a.burst(FX.sparks[1], 14, x, y, z, 10, 0, 3, 0, 0.3);
        a.emit(FX.ringBillboard(0x2ad4ff), x, y, z, 0, 0, 0, 2);
        a.emit(FX.ringFlat(0x2ad4ff), x, k.y + 0.08, z, 0, 0, 0, 1.4);
        break;
      case 'traceroute':
        a.burst(FX.fireball, 7, x, y, z, 7, 0, 2, 0, 0.3);
        a.burst(FX.ember, 20, x, y, z, 14, 0, 4, 0, 0.5);
        a.emit(FX.ringFlat(0xff9a2a), x, k.y + 0.08, z, 0, 0, 0, 1.6);
        n.burst(FX.smoke, 6, x, y, z, 3, 0, 1, 0, 0.5);
        break;
      case 'cable':
        a.burst(FX.sparks[2], 18, x, y, z, 9, 0, 3, 0, 0.3);
        a.burst(FX.sparks[1], 10, x, y, z, 8, 0, 3, 0, 0.3);
        a.emit(FX.ringFlat(0xffe066), x, k.y + 0.08, z, 0, 0, 0, 1.2);
        break;
      default:
        a.burst(FX.fireball, 5, x, y, z, 6, 0, 2, 0, 0.3);
        a.burst(FX.ember, 16, x, y, z, 12, 0, 4, 0, 0.5);
        n.burst(FX.smoke, 5, x, y, z, 3, 0, 1, 0, 0.5);
    }
  }

  /**
   * Fire a confetti fountain.
   * @param {number} x @param {number} y @param {number} z world position (m)
   * @param {number} [count=90]
   */
  confetti(x, y, z, count = 90) {
    for (let i = 0; i < count; i++) {
      const c = FX.confetti[i % FX.confetti.length];
      const a = Math.random() * 6.2832, r = 1 + Math.random() * 5;
      this.norm.emit(c, x + Math.cos(a) * 1.5, y + 1 + Math.random() * 2, z + Math.sin(a) * 1.5, Math.cos(a) * r, 9 + Math.random() * 9, Math.sin(a) * r);
    }
  }

  // ---- per frame ----------------------------------------------------------------------------------------------------------

  /** Record the current physics state of every racer as the newest interpolation endpoint. Call once after each `race.step`. */
  snapshot() {
    this.externalSnap = true;
    for (let i = 0; i < this.karts.length; i++) this.karts[i].capture();
  }

  /**
   * @param {number} frameDt real frame time (s)
   * @param {number} alpha interpolation factor 0..1 between the last two fixed steps
   */
  update(frameDt, alpha) {
    const dt = clamp(frameDt, 0, 0.1);
    this.time += dt;
    const time = this.time;
    const karts = this.karts;
    if (!this.externalSnap) for (let i = 0; i < karts.length; i++) if (karts[i].changed()) karts[i].capture();
    this._syncRacers();
    for (let i = 0; i < karts.length; i++) karts[i].update(dt, alpha, time);
    this._nametags();
    this._updateBoxes(dt, time);
    this._updateItems(dt, time, alpha);
    this._updateBlobs();
    this._updateConfetti(dt);
    this.eggs?.update(dt);
    this.ctx.mats.shell.uniforms.uTime.value = time;
    this.add.update(dt);
    this.norm.update(dt);
  }

  _syncRacers() {
    const rs = this.race.racers;
    if (rs.length === this.karts.length) return;
    for (let i = this.karts.length; i < rs.length; i++) this._addKart(rs[i], i);
  }

  _nametags() {
    const pl = this.byId.get(this.race.player?.id);
    const karts = this.karts;
    let d1 = Infinity, d2 = Infinity, d3 = Infinity, k1 = null, k2 = null, k3 = null;
    for (let i = 0; i < karts.length; i++) {
      const k = karts[i];
      k.showPlace = false;
      if (!pl || k === pl) continue;
      const d = (k.x - pl.x) ** 2 + (k.z - pl.z) ** 2;
      if (d < d1) { d3 = d2; k3 = k2; d2 = d1; k2 = k1; d1 = d; k1 = k; }
      else if (d < d2) { d3 = d2; k3 = k2; d2 = d; k2 = k; }
      else if (d < d3) { d3 = d; k3 = k; }
    }
    if (k1) k1.showPlace = true;
    if (k2) k2.showPlace = true;
    if (k3) k3.showPlace = true;
  }

  _updateBoxes(dt, time) {
    const boxes = this.race.itemBoxes;
    if (!boxes) return;
    const cam = this.camera.position;
    let n = 0;
    const n2 = Math.min(boxes.length, this.boxCap);
    for (let i = 0; i < n2; i++) {
      const b = boxes[i];
      const active = b.active !== false;
      if (active && !this.boxWas[i]) { this.boxPop[i] = Math.min(this.boxPop[i], 0.02); this.add.burst(FX.boxTwinkle, 5, b.pos.x, b.pos.y, b.pos.z, 3, 0, 1, 0); }
      this.boxWas[i] = active ? 1 : 0;
      const target = active ? 1 : 0;
      const pop = this.boxPop[i];
      this.boxPop[i] = target > pop ? Math.min(1, pop + dt * 2.6) : Math.max(0, pop - dt * 9);
      const s = popScale(this.boxPop[i]);
      if (s <= 0.001) continue;
      const dx = b.pos.x - cam.x, dz = b.pos.z - cam.z;
      if (dx * dx + dz * dz > 200 * 200) continue;
      _p.set(b.pos.x, b.pos.y + Math.sin(time * 2 + i * 1.7) * 0.14, b.pos.z);
      _e.set(0.35 + Math.sin(time * 1.1 + i) * 0.12, time * 1.6 + i * 0.9, 0.2);
      _q.setFromEuler(_e);
      _s.set(s, s, s);
      _m.compose(_p, _q, _s);
      this.boxGlass.setMatrixAt(n, _m);
      this.boxFrame.setMatrixAt(n, _m);
      this.boxQ?.setMatrixAt(n, _m);
      n++;
      if (dx * dx + dz * dz < 70 * 70 && Math.random() < 0.012 * this.quality.emit) {
        const a = Math.random() * 6.283;
        this.add.emit(FX.boxTwinkle, b.pos.x + Math.cos(a) * 1.2, b.pos.y + (Math.random() - 0.3) * 1.2, b.pos.z + Math.sin(a) * 1.2, 0, 0.3, 0);
      }
    }
    for (const m of [this.boxGlass, this.boxFrame, this.boxQ]) { if (!m) continue; m.count = n; m.instanceMatrix.needsUpdate = true; }
    this.boxParts.glassMat.uniforms.uTime.value = time;
  }

  _acquireItem(type) {
    const list = this._itemPool.get(type);
    if (list && list.length) return list.pop();
    const mesh = createItemMesh(type);
    this.root.add(mesh);
    return mesh;
  }

  _updateItems(dt, time, alpha) {
    const ents = this.race.items?.entities;
    const frame = ++this._frame;
    if (ents) {
      const back = (1 - clamp(alpha, 0, 1)) * CFG.fixedDt;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (!e || e.type === 'firewall') continue;
        let rec = this._items.get(e.id);
        if (!rec) {
          rec = this._recPool.pop() ?? { mesh: null, type: '', frame: 0, x: 0, y: 0, z: 0, ph: 0 };
          rec.type = e.type; rec.mesh = this._acquireItem(e.type); rec.mesh.visible = true; rec.ph = Math.random() * 10;
          this._items.set(e.id, rec);
          if (e.type === 'ping' || e.type === 'traceroute' || e.type === 'kernel_panic') this.add.emit(FX.flash, e.pos.x, e.pos.y, e.pos.z, 0, 0, 0, 0.35, 0.6);
        }
        rec.frame = frame;
        const vx = e.vel?.x ?? 0, vy = e.vel?.y ?? 0, vz = e.vel?.z ?? 0;
        rec.x = e.pos.x - vx * back; rec.y = e.pos.y - vy * back; rec.z = e.pos.z - vz * back;
        const m = rec.mesh;
        m.position.set(rec.x, rec.y, rec.z);
        const moving = vx * vx + vz * vz > 1;
        m.rotation.y = Number.isFinite(e.yaw) ? e.yaw : moving ? Math.atan2(vx, vz) : rec.ph;
        if (m.userData.fitRadius) {                                  // bark rings / stink cloud: drawn at the gameplay radius (the rings grow out of the kart)
          const grow = e.type === 'woof' ? 0.25 + 0.75 * Math.min(1, e.age / 0.55) : Math.min(1, 0.4 + e.age * 2);
          m.scale.setScalar((e.radius / m.userData.fitRadius) * grow);
        }
        m.userData.update(time + rec.ph);
        this._itemTrail(e, rec, dt, vx, vy, vz);
      }
    }
    for (const [id, rec] of this._items) {
      if (rec.frame === frame) continue;
      rec.mesh.visible = false;
      let list = this._itemPool.get(rec.type);
      if (!list) { list = []; this._itemPool.set(rec.type, list); }
      list.push(rec.mesh);
      this.add.burst(FX.sparkleColour[1], 3, rec.x, rec.y, rec.z, 2, 0, 1, 0);
      rec.mesh = null;
      this._recPool.push(rec);
      this._items.delete(id);
    }
  }

  _itemTrail(e, rec, dt, vx, vy, vz) {
    const q = this.quality.emit;
    const t = e.type;
    if (t === 'ping') { if (Math.random() < 0.9 * q) this.add.emit(FX.ping, rec.x, rec.y, rec.z, -vx * 0.05, 0, -vz * 0.05); }
    else if (t === 'traceroute') { if (Math.random() < 0.9 * q) this.add.emit(FX.traceroute, rec.x - vx * 0.02, rec.y, rec.z - vz * 0.02, -vx * 0.05, 0.3, -vz * 0.05); }
    else if (t === 'kernel_panic') { if (Math.random() < q) this.add.emit(FX.kernel, rec.x, rec.y, rec.z, -vx * 0.04, vy * 0.03 + 0.4, -vz * 0.04, 1.3); }
    else if (t === 'cable') { if (Math.random() < 0.03 * q) this.add.emit(FX.sparks[2], rec.x, rec.y + 0.2, rec.z, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3); }
  }

  _updateBlobs() {
    let n = 0;
    const cap = this.blobCap;
    const A = this.blobAlpha.array;
    for (let i = 0; i < this.karts.length && n < cap; i++) {
      const b = this.karts[i].blob;
      if (b.alpha <= 0.01) continue;
      _n.set(b.nx, b.ny, b.nz);
      _q.setFromUnitVectors(_up, _n);
      _qy.setFromAxisAngle(_up, b.yaw);
      _q.multiply(_qy);
      _p.set(b.x, b.y, b.z);
      _s.set(1.15 * b.scale, 1, 1.75 * b.scale);
      _m.compose(_p, _q, _s);
      this.blobs.setMatrixAt(n, _m);
      A[n++] = b.alpha;
    }
    const ents = this.race.items?.entities;
    if (ents) {
      for (const rec of this._items.values()) {
        if (n >= cap) break;
        if (rec.type === 'kernel_panic') continue;
        const cam = this.camera.position;
        const dx = rec.x - cam.x, dz = rec.z - cam.z;
        if (dx * dx + dz * dz > 120 * 120) continue;
        _p.set(rec.x, rec.y, rec.z);
        this.track.query(_p, this._gq);
        if (this._gq.inVoid || !Number.isFinite(this._gq.height)) continue;
        const air = Math.max(0, rec.y - this._gq.height);
        _n.copy(this._gq.normal);
        _q.setFromUnitVectors(_up, _n);
        _p.set(rec.x, this._gq.height + 0.03, rec.z);
        const sc = 0.55 * (1 + air * 0.08);
        _s.set(sc, 1, sc);
        _m.compose(_p, _q, _s);
        this.blobs.setMatrixAt(n, _m);
        A[n++] = 0.42 * (1 - clamp(air / 6, 0, 1));
      }
    }
    this.blobs.count = n;
    this.blobs.instanceMatrix.needsUpdate = true;
    this.blobAlpha.needsUpdate = true;
  }

  _updateConfetti(dt) {
    if (this.confettiT <= 0) return;
    this.confettiT -= dt;
    const pl = this.byId.get(this.race.player?.id);
    if (!pl) return;
    const rate = 55 * this.quality.emit * Math.min(1, this.confettiT / 1.5);
    this._cAcc = (this._cAcc ?? 0) + dt * rate;
    while (this._cAcc >= 1) {
      this._cAcc -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const rx = -Math.cos(pl.yaw) * side, rz = Math.sin(pl.yaw) * side;
      const c = FX.confetti[(Math.random() * FX.confetti.length) | 0];
      this.norm.emit(c, pl.x + rx * 2.2, pl.y + 1.2, pl.z + rz * 2.2, -rx * (2 + Math.random() * 4) + pl.fx * 5, 11 + Math.random() * 8, -rz * (2 + Math.random() * 4) + pl.fz * 5);
    }
  }

  /** @param {string} id racer id @returns {KartView|undefined} */
  getKartView(id) { return this.byId.get(id); }

  /** Remove everything from the scene and free GPU resources. */
  dispose() {
    for (const off of this._off) off();
    this._off.length = 0;
    this.eggs?.dispose();
    for (const k of this.karts) k.dispose();
    for (const rec of this._items.values()) rec.mesh?.parent?.remove(rec.mesh);
    this._items.clear();
    this.add.dispose(); this.norm.dispose(); this.skid.dispose();
    this.blobs.geometry.dispose(); this.blobs.material.dispose(); this.blobs.dispose();
    for (const m of [this.boxGlass, this.boxFrame, this.boxQ]) m?.dispose();
    this.ctx.mats.shell.dispose();
    this.scene.remove(this.root);
  }
}
