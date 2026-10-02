// ParticlePool: fixed-capacity, allocation-free particle system drawn as ONE instanced quad mesh.
// CPU-simulated (gravity, drag, floor bounce), GPU-billboarded. Per-particle colour ramp, size ramp, spin, shape.
// Shapes: 0 soft blob, 1 hard disc, 2 4-point sparkle, 3 streak (velocity-stretched), 4 confetti (flipping rect),
//         5 billboard ring, 6 ground-flat ring, 7 ground-flat soft disc.
// Node-importable (three only, no DOM).
import * as THREE from 'three';

export const SHAPE = { SOFT: 0, DISC: 1, SPARKLE: 2, STREAK: 3, CONFETTI: 4, RING: 5, FLAT_RING: 6, FLAT_DISC: 7 };

const STRIDE = 28;
const _c = new THREE.Color();

const VERT = /* glsl */`
  attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iMisc; attribute vec3 iVel;
  varying vec4 vCol; varying vec2 vP; varying float vShape;
  void main() {
    vCol = iCol; vP = position.xy; vShape = iMisc.y;
    float size = iPos.w;
    vec3 world = iPos.xyz;
    vec4 mv;
    if ( iMisc.y > 5.5 ) {
      float c = cos( iMisc.x ), s = sin( iMisc.x );
      vec2 q = vec2( c * position.x - s * position.y, s * position.x + c * position.y ) * size;
      mv = viewMatrix * vec4( world + vec3( q.x, 0.0, q.y ), 1.0 );
    } else {
      mv = viewMatrix * vec4( world, 1.0 );
      vec2 corner;
      if ( iMisc.z > 0.0 ) {
        vec3 vv = ( viewMatrix * vec4( iVel, 0.0 ) ).xyz;
        float len = length( vv.xy );
        vec2 dir = len > 1e-4 ? vv.xy / len : vec2( 1.0, 0.0 );
        float L = size * ( 1.0 + iMisc.z * length( iVel ) );
        corner = dir * position.x * L + vec2( -dir.y, dir.x ) * position.y * size * 0.5;
      } else {
        float c = cos( iMisc.x ), s = sin( iMisc.x );
        vec2 q = position.xy;
        if ( iMisc.y > 3.5 && iMisc.y < 4.5 ) q.x *= cos( iMisc.w );
        corner = vec2( c * q.x - s * q.y, s * q.x + c * q.y ) * size;
      }
      mv.xy += corner;
    }
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */`
  varying vec4 vCol; varying vec2 vP; varying float vShape;
  void main() {
    vec2 p = vP;
    float r = length( p );
    float a;
    if ( vShape < 0.5 ) { a = smoothstep( 0.5, 0.0, r ); a *= a; }
    else if ( vShape < 1.5 ) { a = smoothstep( 0.5, 0.4, r ); }
    else if ( vShape < 2.5 ) {
      float d = min( abs( p.x ), abs( p.y ) );
      a = max( smoothstep( 0.09, 0.0, d ) * smoothstep( 0.5, 0.05, r ), smoothstep( 0.22, 0.0, r ) );
    }
    else if ( vShape < 3.5 ) { a = smoothstep( 0.5, 0.1, abs( p.x ) ) * smoothstep( 0.5, 0.15, abs( p.y ) ); }
    else if ( vShape < 4.5 ) { a = 1.0; }
    else if ( vShape < 5.5 ) { a = smoothstep( 0.1, 0.0, abs( r - 0.4 ) ); }
    else if ( vShape < 6.5 ) { a = smoothstep( 0.09, 0.0, abs( r - 0.4 ) ) + smoothstep( 0.4, 0.0, r ) * 0.12; }
    else { a = smoothstep( 0.5, 0.05, r ); a *= a; }
    gl_FragColor = vec4( vCol.rgb, vCol.a * a );
    if ( gl_FragColor.a < 0.004 ) discard;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * Build a reusable emitter preset (create once, reuse for every spawn: nothing is allocated when emitting).
 * @param {object} o
 * @param {number[]} [o.life=[0.5,0.8]] seconds (min,max)
 * @param {number[]} [o.size=[0.3,0.5]] start size (m)
 * @param {number} [o.grow=1] end size = start size * grow
 * @param {number[]} [o.color=[0xffffff,0xffffff]] start,end colour (sRGB hex)
 * @param {number[]} [o.alpha=[1,0]] start,end alpha
 * @param {number} [o.gravity=0] m/s^2 (positive = falls)
 * @param {number} [o.drag=0] 1/s velocity damping
 * @param {number[]} [o.spin=[0,0]] rad/s (min,max)
 * @param {number} [o.shape=0] see SHAPE
 * @param {number} [o.stretch=0] streak length per m/s of speed
 * @param {number} [o.jitter=0] random velocity added on each axis (m/s)
 * @param {number} [o.bounce=0] floor bounce restitution (0 = no floor)
 * @param {number} [o.flip=0] confetti flip speed (rad/s)
 * @param {number} [o.glow=1] colour multiplier (values above 1 bloom in the post chain)
 * @returns {object} preset
 */
export function makePreset(o = {}) {
  const life = o.life ?? [0.5, 0.8];
  const size = o.size ?? [0.3, 0.5];
  const col = o.color ?? [0xffffff, 0xffffff];
  const alpha = o.alpha ?? [1, 0];
  const spin = o.spin ?? [0, 0];
  const gl = o.glow ?? 1;
  _c.setHex(col[0]); const r0 = _c.r * gl, g0 = _c.g * gl, b0 = _c.b * gl;
  _c.setHex(col[1] ?? col[0]); const r1 = _c.r * gl, g1 = _c.g * gl, b1 = _c.b * gl;
  return {
    life0: life[0], life1: life[1] ?? life[0], size0: size[0], size1: size[1] ?? size[0], grow: o.grow ?? 1,
    r0, g0, b0, r1, g1, b1, a0: alpha[0], a1: alpha[1],
    gravity: o.gravity ?? 0, drag: o.drag ?? 0, spin0: spin[0], spin1: spin[1] ?? spin[0],
    shape: o.shape ?? 0, stretch: o.stretch ?? 0, jitter: o.jitter ?? 0, bounce: o.bounce ?? 0, flip: o.flip ?? 0,
  };
}

export class ParticlePool {
  /**
   * @param {{capacity?: number, blending?: 'add'|'normal', renderOrder?: number}} [o]
   */
  constructor({ capacity = 2048, blending = 'add', renderOrder = 10 } = {}) {
    this.capacity = capacity;
    this.S = new Float32Array(capacity * STRIDE);
    for (let i = 0; i < capacity; i++) this.S[i * STRIDE + 6] = 1, this.S[i * STRIDE + 7] = 0; // dead: age >= life
    this.next = 0;
    this.live = 0;
    /** Emission multiplier (quality tiers): emit() drops particles probabilistically below 1. */
    this.density = 1;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('position', quad.attributes.position);
    geo.setIndex(quad.index);
    quad.dispose();
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iMisc', this.aMisc);
    geo.setAttribute('iVel', this.aVel);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: blending === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    /** @type {THREE.Mesh} add this to the scene */
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = `particles-${blending}`;
  }

  /**
   * Emit one particle. No allocation.
   * @param {object} p preset from makePreset
   * @param {number} x @param {number} y @param {number} z position (m)
   * @param {number} [vx=0] @param {number} [vy=0] @param {number} [vz=0] velocity (m/s)
   * @param {number} [sizeMul=1] @param {number} [alphaMul=1]
   */
  emit(p, x, y, z, vx = 0, vy = 0, vz = 0, sizeMul = 1, alphaMul = 1) {
    if (this.density < 1 && Math.random() > this.density) return;
    const S = this.S;
    const i = this.next * STRIDE;
    this.next = (this.next + 1) % this.capacity;
    const j = p.jitter;
    S[i] = x; S[i + 1] = y; S[i + 2] = z;
    S[i + 3] = vx + (j ? (Math.random() - 0.5) * 2 * j : 0);
    S[i + 4] = vy + (j ? (Math.random() - 0.5) * 2 * j : 0);
    S[i + 5] = vz + (j ? (Math.random() - 0.5) * 2 * j : 0);
    S[i + 6] = 0;
    S[i + 7] = p.life0 + (p.life1 - p.life0) * Math.random();
    const s0 = (p.size0 + (p.size1 - p.size0) * Math.random()) * sizeMul;
    S[i + 8] = s0; S[i + 9] = s0 * p.grow;
    S[i + 10] = p.r0; S[i + 11] = p.g0; S[i + 12] = p.b0; S[i + 13] = p.a0 * alphaMul;
    S[i + 14] = p.r1; S[i + 15] = p.g1; S[i + 16] = p.b1; S[i + 17] = p.a1 * alphaMul;
    S[i + 18] = p.gravity; S[i + 19] = p.drag;
    S[i + 20] = Math.random() * 6.2832;
    S[i + 21] = p.spin0 + (p.spin1 - p.spin0) * Math.random();
    S[i + 22] = p.shape; S[i + 23] = p.stretch;
    S[i + 24] = Math.random() * 6.2832; S[i + 25] = p.flip * (0.6 + Math.random() * 0.8);
    S[i + 26] = y - 0.02; S[i + 27] = p.bounce;
  }

  /**
   * Emit `n` particles in random directions (sphere or cone).
   * @param {object} p preset
   * @param {number} n count
   * @param {number} x @param {number} y @param {number} z origin
   * @param {number} speed m/s (each particle uses 35..100 % of it)
   * @param {number} [bx=0] @param {number} [by=0] @param {number} [bz=0] base velocity added to each
   * @param {number} [upBias=0] added to the direction's Y before normalising (0 = full sphere, 1 = mostly up)
   * @param {number} [flat=0] 0..1 squashes the burst towards the XZ plane (1 = horizontal ring)
   */
  burst(p, n, x, y, z, speed, bx = 0, by = 0, bz = 0, upBias = 0, flat = 0) {
    for (let k = 0; k < n; k++) {
      let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
      dy = dy * (1 - flat) + upBias;
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = speed * (0.35 + Math.random() * 0.65) / l;
      this.emit(p, x, y, z, bx + dx * sp, by + dy * sp, bz + dz * sp);
    }
  }

  /** Advance the simulation and refresh the instance buffers. @param {number} dt seconds */
  update(dt) {
    const S = this.S, cap = this.capacity;
    const P = this.aPos.array, C = this.aCol.array, M = this.aMisc.array, V = this.aVel.array;
    let n = 0;
    for (let k = 0; k < cap; k++) {
      const i = k * STRIDE;
      const life = S[i + 7];
      let age = S[i + 6];
      if (age >= life) continue;
      age += dt;
      if (age >= life) { S[i + 6] = age; continue; }
      S[i + 6] = age;
      let vx = S[i + 3], vy = S[i + 4], vz = S[i + 5];
      const drag = S[i + 19];
      if (drag > 0) { const f = Math.max(0, 1 - drag * dt); vx *= f; vy *= f; vz *= f; }
      vy -= S[i + 18] * dt;
      let px = S[i] + vx * dt, py = S[i + 1] + vy * dt, pz = S[i + 2] + vz * dt;
      const bounce = S[i + 27];
      if (bounce > 0 && py < S[i + 26] && vy < 0) { py = S[i + 26]; vy = -vy * bounce; vx *= 0.75; vz *= 0.75; }
      S[i] = px; S[i + 1] = py; S[i + 2] = pz; S[i + 3] = vx; S[i + 4] = vy; S[i + 5] = vz;
      S[i + 20] += S[i + 21] * dt;
      S[i + 24] += S[i + 25] * dt;
      const t = age / life;
      const te = t * t * (3 - 2 * t) * 0.35 + t * 0.65; // size ramp: mostly linear, slightly eased
      const fade = t < 0.06 ? t / 0.06 : 1;
      const o4 = n * 4, o3 = n * 3;
      P[o4] = px; P[o4 + 1] = py; P[o4 + 2] = pz;
      P[o4 + 3] = S[i + 8] + (S[i + 9] - S[i + 8]) * te;
      C[o4] = S[i + 10] + (S[i + 14] - S[i + 10]) * t;
      C[o4 + 1] = S[i + 11] + (S[i + 15] - S[i + 11]) * t;
      C[o4 + 2] = S[i + 12] + (S[i + 16] - S[i + 12]) * t;
      C[o4 + 3] = (S[i + 13] + (S[i + 17] - S[i + 13]) * t) * fade;
      M[o4] = S[i + 20]; M[o4 + 1] = S[i + 22]; M[o4 + 2] = S[i + 23]; M[o4 + 3] = S[i + 24];
      V[o3] = vx; V[o3 + 1] = vy; V[o3 + 2] = vz;
      n++;
    }
    this.live = n;
    const geo = this.mesh.geometry;
    geo.instanceCount = n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aMisc.needsUpdate = this.aVel.needsUpdate = true;
  }

  /** Kill every particle. */
  clear() {
    for (let k = 0; k < this.capacity; k++) { this.S[k * STRIDE + 6] = 1; this.S[k * STRIDE + 7] = 0; }
    this.live = 0;
    this.mesh.geometry.instanceCount = 0;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
