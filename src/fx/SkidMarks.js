// SkidMarks: ribbon decals on the road, drawn from a fixed ring buffer of quads in ONE mesh (no allocation while racing).
// Each strip (one per tyre) is fed points via `add`; `end` closes it. Oldest segments are overwritten first.
// Node-importable.
import * as THREE from 'three';

const VERT = /* glsl */`
  attribute float aAlpha; varying float vA;
  void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity; varying float vA;
  void main() {
    gl_FragColor = vec4( uColor, vA * uOpacity );
    if ( gl_FragColor.a < 0.01 ) discard;
    #include <colorspace_fragment>
  }`;

export class SkidMarks {
  /**
   * @param {{segments?: number, strips?: number, colour?: number, opacity?: number}} [o]
   */
  constructor({ segments = 900, strips = 24, colour = 0x0e0d12, opacity = 0.55 } = {}) {
    this.segments = segments;
    this.head = 0;
    this.enabled = true;
    const pos = new Float32Array(segments * 4 * 3);
    const alpha = new Float32Array(segments * 4);
    const idx = new Uint32Array(segments * 6);
    for (let s = 0; s < segments; s++) {
      const v = s * 4;
      idx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], s * 6);
      for (let k = 0; k < 4; k++) pos[(v + k) * 3 + 1] = -1000; // parked far below until written
    }
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aAlpha', this.aAlpha);
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      uniforms: { uColor: { value: new THREE.Color(colour) }, uOpacity: { value: opacity } },
    });
    /** @type {THREE.Mesh} */
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'skid-marks';
    // per strip: last left/right edge point (x,y,z x2), last alpha, active flag
    this.last = new Float32Array(strips * 8);
    this.active = new Uint8Array(strips);
    this.strips = strips;
  }

  /**
   * Extend a strip by one point.
   * @param {number} strip strip index (0..strips-1), e.g. racerIndex * 2 + wheel
   * @param {number} x @param {number} y @param {number} z point on the road (m)
   * @param {number} nx @param {number} nz unit vector across the strip (horizontal)
   * @param {number} halfWidth half width (m)
   * @param {number} alpha 0..1 darkness of this point
   */
  add(strip, x, y, z, nx, nz, halfWidth, alpha) {
    if (!this.enabled || strip >= this.strips) return;
    const L = this.last, o = strip * 8;
    const lx = x - nx * halfWidth, lz = z - nz * halfWidth, rx = x + nx * halfWidth, rz = z + nz * halfWidth;
    if (this.active[strip]) {
      const s = this.head;
      this.head = (this.head + 1) % this.segments;
      const v = s * 4;
      const P = this.aPos.array, A = this.aAlpha.array;
      P[v * 3] = L[o]; P[v * 3 + 1] = L[o + 1]; P[v * 3 + 2] = L[o + 2];
      P[v * 3 + 3] = L[o + 3]; P[v * 3 + 4] = L[o + 4]; P[v * 3 + 5] = L[o + 5];
      P[v * 3 + 6] = lx; P[v * 3 + 7] = y; P[v * 3 + 8] = lz;
      P[v * 3 + 9] = rx; P[v * 3 + 10] = y; P[v * 3 + 11] = rz;
      A[v] = A[v + 1] = L[o + 6]; A[v + 2] = A[v + 3] = alpha;
      this.aPos.needsUpdate = this.aAlpha.needsUpdate = true;
    }
    L[o] = lx; L[o + 1] = y; L[o + 2] = lz; L[o + 3] = rx; L[o + 4] = y; L[o + 5] = rz; L[o + 6] = alpha;
    this.active[strip] = 1;
  }

  /** Close a strip (the next `add` starts a fresh mark instead of joining). @param {number} strip */
  end(strip) { this.active[strip] = 0; }

  /** Forget everything. */
  clear() {
    const P = this.aPos.array;
    for (let i = 1; i < P.length; i += 3) P[i] = -1000;
    this.aAlpha.array.fill(0);
    this.active.fill(0);
    this.head = 0;
    this.aPos.needsUpdate = this.aAlpha.needsUpdate = true;
  }

  dispose() { this.geo.dispose(); this.mesh.material.dispose(); }
}
