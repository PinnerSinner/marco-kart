// Visual side of Biscuit's easter eggs (logic: src/race/easterEggs.js, nothing in any track file): the hidden fire hydrant (placed by
// `race.eggs.hydrant`, planned from track.sample), its water spurt, tiny paw-print decals when Biscuit drifts / has the zoomies, and the
// reactions to `egg:*` / `item:woof` / `item:smear` bus events. Everything degrades quietly: no canvas = plain dark paw quads, no `race.eggs` = nothing.
import * as THREE from 'three';
import { bus } from '../core/bus.js';
import { makeCanvas } from './canvas.js';
import { FX } from '../fx/presets.js';

const PAW_COUNT = 160;
const PAW_LIFE = 9;           // seconds a print stays on the road

let _pawTex = null;
function pawTexture() {
  if (_pawTex !== null) return _pawTex || null;
  const c = makeCanvas(64, 64);
  if (!c) { _pawTex = false; return null; }
  const g = c.getContext('2d');
  if (!g) { _pawTex = false; return null; }
  g.fillStyle = 'rgba(70,40,12,0.9)';
  g.beginPath(); g.ellipse(32, 41, 15, 12, 0, 0, Math.PI * 2); g.fill();
  for (const [x, y, r] of [[13, 26, 6.5], [25, 15, 7], [39, 15, 7], [51, 26, 6.5]]) { g.beginPath(); g.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _pawTex = t;
  return t;
}

/** A ring buffer of paw-print decals in one InstancedMesh. `stamp` places one; prints shrink away over their last 20 % of life. */
export class PawPrints {
  constructor(count = PAW_COUNT) {
    this.count = count; this.head = 0;
    const g = new THREE.PlaneGeometry(0.5, 0.5);
    g.rotateX(-Math.PI / 2);
    const tex = pawTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex ?? null, color: tex ? 0xffffff : 0x46280c, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
    this.mesh = new THREE.InstancedMesh(g, mat, count);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.name = 'paw-prints';
    this.mesh.count = count;
    this.age = new Float32Array(count).fill(1e9);
    this.p = new Float32Array(count * 4);            // x y z yaw
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._v = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
    const z = this._m.makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) this.mesh.setMatrixAt(i, z);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.stamped = 0;
  }

  stamp(x, y, z, yaw) {
    const i = this.head; this.head = (this.head + 1) % this.count;
    this.age[i] = 0; this.p[i * 4] = x; this.p[i * 4 + 1] = y + 0.04; this.p[i * 4 + 2] = z; this.p[i * 4 + 3] = yaw;
    this.stamped++;
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] > PAW_LIFE + 1) continue;
      this.age[i] += dt; dirty = true;
      const k = this.age[i];
      const sc = k >= PAW_LIFE ? 0 : k > PAW_LIFE * 0.8 ? (PAW_LIFE - k) / (PAW_LIFE * 0.2) : Math.min(1, k * 12);
      this._q.setFromAxisAngle(this._up, this.p[i * 4 + 3]);
      this._s.setScalar(sc);
      this._m.compose(this._v.set(this.p[i * 4], this.p[i * 4 + 1], this.p[i * 4 + 2]), this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose(); }
}

/** The hydrant model: red body, domed cap, two side nozzles and a front nozzle, a chain, and a little bone-shaped sign. */
export function createHydrant() {
  const g = new THREE.Group();
  g.name = 'egg-hydrant';
  const red = new THREE.MeshLambertMaterial({ color: 0xd8262f }), gold = new THREE.MeshLambertMaterial({ color: 0xf2c230 }), steel = new THREE.MeshLambertMaterial({ color: 0xb9c0cc });
  const add = (geo, mat, x, y, z, rot) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rot) m.rotation.set(rot[0], rot[1], rot[2]); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.36, 0.42, 0.18, 14), red, 0, 0.09, 0);
  add(new THREE.CylinderGeometry(0.3, 0.32, 0.72, 14), red, 0, 0.54, 0);
  add(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 14), gold, 0, 0.86, 0);
  add(new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0.9, 0);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), gold, 0, 1.22, 0);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.26, 10), red, sx * 0.4, 0.62, 0, [0, 0, Math.PI / 2]);
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 10), steel, sx * 0.55, 0.62, 0, [0, 0, Math.PI / 2]);
  }
  add(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 10), red, 0, 0.5, 0.38, [Math.PI / 2, 0, 0]);
  add(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10), steel, 0, 0.5, 0.5, [Math.PI / 2, 0, 0]);
  g.userData.spout = new THREE.Vector3(0, 1.25, 0);
  return g;
}

/** Renders the eggs for one RaceView. */
export class EggView {
  /**
   * @param {{root: THREE.Object3D, race: object, add: object, norm: object, getKart: (id:string)=>object|undefined, confetti?: (x:number,y:number,z:number,n?:number)=>void, quality?: {emit:number, skid:boolean}}} o
   */
  constructor({ root, race, add, norm, getKart, confetti, quality }) {
    this.race = race; this.add = add; this.norm = norm; this.getKart = getKart; this.confetti = confetti; this.quality = quality ?? { emit: 1, skid: true };
    this.group = new THREE.Group(); this.group.name = 'easter-eggs';
    root.add(this.group);
    this.hydrant = null; this.spurt = 0; this.pawT = 0; this.pawSide = 1;
    const h = race?.eggs?.hydrant;
    if (h) {
      try {
        this.hydrant = createHydrant();
        this.hydrant.position.set(h.pos.x, h.pos.y, h.pos.z);
        this.hydrant.rotation.y = h.yaw + (h.side > 0 ? -Math.PI / 2 : Math.PI / 2);     // faces the road
        this.group.add(this.hydrant);
      } catch { this.hydrant = null; }
    }
    this.paws = null;
    try { this.paws = new PawPrints(); this.group.add(this.paws.mesh); } catch { this.paws = null; }
    this._off = [
      bus.on('egg:hydrant', (d) => { this.spurt = 2; if (d?.pos) this.add.emit(FX.ringFlat(0x8fd4ff), d.pos.x, d.pos.y + 0.1, d.pos.z, 0, 0, 0, 1.6); }),
      bus.on('egg:woof', (d) => { const k = this.getKart(d?.id); if (k) { k.flash?.('boost', 0.5); this.add.emit(FX.ringBillboard(0xffd166), k.x, k.y + 1.2, k.z, 0, 0, 0, 1.8); } }),
      bus.on('egg:pigeon-chase', (d) => { this.getKart(d?.id)?.flash?.('boost', 0.9); }),
      bus.on('egg:fanfare', (d) => { const k = this.getKart(d?.id); if (k && this.confetti) this.confetti(k.x, k.y, k.z, 120); }),
      bus.on('item:woof', (d) => { if (d?.pos) { this.add.emit(FX.shockwave, d.pos.x, d.pos.y + 0.1, d.pos.z, 0, 0, 0, 1.6); this.add.burst(FX.sparkleColour?.[1] ?? FX.flash, 10, d.pos.x + Math.sin(d.yaw) * 2, d.pos.y + 1, d.pos.z + Math.cos(d.yaw) * 2, 8, Math.sin(d.yaw) * 6, 1, Math.cos(d.yaw) * 6); } }),
      bus.on('item:catch', (d) => { const k = this.getKart(d?.id); if (k) { k.flash?.('happy', 1); this.add.burst(FX.sparkleColour?.[1] ?? FX.flash, 8, k.x, k.y + 1.2, k.z, 4, 0, 2, 0); } }),
    ];
  }

  /** @param {number} dt */
  update(dt) {
    if (this.spurt > 0 && this.hydrant) {
      this.spurt -= dt;
      const p = this.hydrant.position, n = Math.random() < 0.8 * this.quality.emit ? 2 : 0;
      if (n) {
        this.norm.burst(FX.spray, n, p.x, p.y + 1.25, p.z, 3, 0, 9, 0, 0.7);
        this.add.burst(FX.droplet, n, p.x, p.y + 1.25, p.z, 4, 0, 9, 0, 0.7);
      }
    }
    const b = this.race?.eggs?.biscuit;
    if (b && this.paws && this.quality.skid !== false) {
      const k = b.kart, on = (k.drift?.active || b.zoomies > 0) && k.grounded && !b.finished && Math.abs(k.speed) > 6;
      this.pawT -= dt;
      if (on && this.pawT <= 0) {
        this.pawT = b.zoomies > 0 ? 0.1 : 0.16; this.pawSide = -this.pawSide;
        const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
        this.paws.stamp(k.pos.x + fz * 0.45 * this.pawSide, k.pos.y, k.pos.z - fx * 0.45 * this.pawSide, k.yaw);
      }
    }
    this.paws?.update(dt);
    const kv = b ? this.getKart(b.id) : null;
    kv?.driver?.setFlag?.('zoom', b.zoomies > 0 ? 1 : 0);
  }

  dispose() {
    for (const off of this._off) off();
    this._off.length = 0;
    this.paws?.dispose();
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh && o !== this.paws?.mesh) { o.geometry?.dispose(); o.material?.dispose?.(); } });
  }
}
