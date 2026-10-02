// RibbonTrail: camera-facing ribbon following a moving point (fibre light trail, invincibility streaks). Fixed ring of points,
// no allocation per frame. Colour ramps along its length; alpha fades toward the tail.
// Node-importable.
import * as THREE from 'three';

const _t = new THREE.Vector3();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export class RibbonTrail {
  /**
   * @param {{points?: number, width?: number, colours?: number[], hueCycle?: boolean, minDist?: number, life?: number}} [o]
   */
  constructor({ points = 28, width = 0.22, colours = [0x22d3ee, 0xff4fd8], hueCycle = false, minDist = 0.35, life = 0.6 } = {}) {
    this.n = points; this.width = width; this.minDist = minDist; this.life = life; this.hueCycle = hueCycle;
    this.pts = new Float32Array(points * 4); // x y z time
    this.count = 0; this.headIdx = 0; this.time = 0; this.on = false;
    this.colours = colours.map((c) => new THREE.Color(c));
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(points * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(points * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('color', this.aCol);
    const idx = [];
    for (let i = 0; i < points - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    /** @type {THREE.Mesh} */
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.visible = false;
  }

  /**
   * Feed the head position. Call every frame while emitting (`emitting=false` lets the tail drain).
   * @param {number} dt seconds
   * @param {THREE.Vector3} camPos camera world position (for facing)
   * @param {number} x @param {number} y @param {number} z head position
   * @param {boolean} emitting
   * @param {number} [hue=0] hue offset when `hueCycle`
   */
  update(dt, camPos, x, y, z, emitting, hue = 0) {
    this.time += dt;
    const P = this.pts, n = this.n;
    if (emitting) {
      const last = ((this.headIdx - 1 + n) % n) * 4;
      const moved = this.count === 0 || Math.hypot(x - P[last], y - P[last + 1], z - P[last + 2]) > this.minDist;
      if (moved) {
        const i = this.headIdx * 4;
        P[i] = x; P[i + 1] = y; P[i + 2] = z; P[i + 3] = this.time;
        this.headIdx = (this.headIdx + 1) % n;
        this.count = Math.min(n, this.count + 1);
      } else {
        P[last] = x; P[last + 1] = y; P[last + 2] = z; P[last + 3] = this.time;
      }
    }
    // drop expired points from the tail
    while (this.count > 0) {
      const tail = ((this.headIdx - this.count + n) % n) * 4;
      if (this.time - P[tail + 3] > this.life) this.count--; else break;
    }
    this.on = this.count >= 2;
    this.mesh.visible = this.on;
    if (!this.on) return;
    const pos = this.aPos.array, col = this.aCol.array;
    for (let k = 0; k < n; k++) {
      // vertex pair k maps to the k-th oldest point; unused pairs collapse onto the newest point
      const idxAge = Math.min(k, this.count - 1);
      const pi = ((this.headIdx - this.count + idxAge + n) % n) * 4;
      const px = P[pi], py = P[pi + 1], pz = P[pi + 2];
      const nxt = ((this.headIdx - this.count + Math.min(idxAge + 1, this.count - 1) + n) % n) * 4;
      const prv = ((this.headIdx - this.count + Math.max(idxAge - 1, 0) + n) % n) * 4;
      _t.set(P[nxt] - P[prv], P[nxt + 1] - P[prv + 1], P[nxt + 2] - P[prv + 2]);
      _v.set(camPos.x - px, camPos.y - py, camPos.z - pz);
      _s.crossVectors(_t, _v);
      const l = _s.length() || 1;
      const u = k <= this.count - 1 ? idxAge / Math.max(1, this.count - 1) : 1; // 0 = tail, 1 = head
      const w = this.width * (0.15 + 0.85 * u) / l;
      const o = k * 6;
      pos[o] = px + _s.x * w; pos[o + 1] = py + _s.y * w; pos[o + 2] = pz + _s.z * w;
      pos[o + 3] = px - _s.x * w; pos[o + 4] = py - _s.y * w; pos[o + 5] = pz - _s.z * w;
      const c = this._colourAt(u, hue);
      const a = u * u;
      const c4 = k * 8;
      col[c4] = col[c4 + 4] = c.r; col[c4 + 1] = col[c4 + 5] = c.g; col[c4 + 2] = col[c4 + 6] = c.b; col[c4 + 3] = col[c4 + 7] = a * 0.9;
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = true;
  }

  _colourAt(u, hue) {
    if (this.hueCycle) return _hsl(((u * 0.6 + hue) % 1 + 1) % 1);
    const cs = this.colours;
    if (cs.length === 1) return cs[0];
    const f = u * (cs.length - 1), i = Math.min(cs.length - 2, Math.floor(f));
    return _mix.copy(cs[i]).lerp(cs[i + 1], f - i);
  }

  /** Empty the trail immediately (teleports). */
  reset() { this.count = 0; this.on = false; this.mesh.visible = false; }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

const _mix = new THREE.Color();
const _h = new THREE.Color();
function _hsl(h) { return _h.setHSL(h, 1, 0.62); }
