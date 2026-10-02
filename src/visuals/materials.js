// Special-purpose materials: fresnel bubble (shields, invincibility glow, item-box glass) and soft additive glow.
// Node-importable.
import * as THREE from 'three';

const FRES_VERT = /* glsl */`
  varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vObj;
  void main() {
    vec4 p = vec4( position, 1.0 );
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3( instanceMatrix ) * n;
    #endif
    vec4 mv = modelViewMatrix * p;
    vN = normalize( normalMatrix * n );
    vV = normalize( -mv.xyz );
    vUv = uv; vObj = p.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

const FRES_FRAG = /* glsl */`
  uniform vec3 uColor; uniform vec3 uEdge; uniform float uAlpha; uniform float uEdgeAlpha; uniform float uPower;
  uniform float uTime; uniform float uPattern; uniform float uPulse; uniform float uHue;
  varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vObj;
  vec3 hsv2rgb( vec3 c ) { vec4 K = vec4( 1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0 ); vec3 p = abs( fract( c.xxx + K.xyz ) * 6.0 - K.www ); return c.z * mix( K.xxx, clamp( p - K.xxx, 0.0, 1.0 ), c.y ); }
  void main() {
    float ndv = abs( dot( normalize( vN ), normalize( vV ) ) );
    float f = pow( 1.0 - ndv, uPower );
    vec3 col = mix( uColor, uEdge, f );
    if ( uHue > 0.5 ) {
      float h = fract( uTime * 0.35 + vObj.y * 0.6 + vObj.x * 0.3 + f * 0.25 );
      col = mix( col, hsv2rgb( vec3( h, 0.75, 1.0 ) ), 0.85 );
    }
    float a = uAlpha + f * uEdgeAlpha;
    if ( uPattern > 0.5 ) {
      // hex / brick lattice scrolling upwards
      vec2 p = vec2( atan( vObj.z, vObj.x ) * 3.2, vObj.y * 3.6 - uTime * 0.6 );
      float row = floor( p.y );
      p.x += mod( row, 2.0 ) * 0.5;
      vec2 g = abs( fract( p ) - 0.5 );
      float line = smoothstep( 0.44, 0.5, max( g.x * 0.8, g.y ) );
      a += line * 0.42; col += line * 0.5;
    }
    a *= 1.0 + uPulse * 0.25 * sin( uTime * 9.0 );
    gl_FragColor = vec4( col, clamp( a, 0.0, 1.0 ) );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * Fresnel bubble (glass-like: transparent centre, bright rim). `uniforms.uTime.value` may be driven by callers.
 * @param {{color?: number, edge?: number, alpha?: number, edgeAlpha?: number, power?: number, pattern?: boolean, hue?: boolean, additive?: boolean, pulse?: number}} [o]
 * @returns {THREE.ShaderMaterial}
 */
export function bubbleMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(o.color ?? 0x66ccff) },
      uEdge: { value: new THREE.Color(o.edge ?? 0xffffff) },
      uAlpha: { value: o.alpha ?? 0.12 },
      uEdgeAlpha: { value: o.edgeAlpha ?? 0.8 },
      uPower: { value: o.power ?? 2.4 },
      uTime: { value: 0 },
      uPattern: { value: o.pattern ? 1 : 0 },
      uPulse: { value: o.pulse ?? 0 },
      uHue: { value: o.hue ? 1 : 0 },
    },
    vertexShader: FRES_VERT,
    fragmentShader: FRES_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  });
}

let glowTex = null;
/** Soft round radial-gradient texture for additive glow sprites. Null without a DOM. @returns {THREE.CanvasTexture|null} */
export function glowTexture() {
  if (glowTex !== null) return glowTex;
  if (typeof document === 'undefined') { glowTex = undefined; return null; }
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/**
 * Additive glow sprite material (falls back to a flat additive colour without a DOM).
 * @param {number} colour @param {number} [opacity=1]
 * @returns {THREE.SpriteMaterial}
 */
export function glowSpriteMaterial(colour, opacity = 1) {
  return new THREE.SpriteMaterial({ map: glowTexture() ?? null, color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
}

let starTex = null;
/** 4-point sparkle texture. Null without a DOM. @returns {THREE.CanvasTexture|null} */
export function sparkleTexture() {
  if (starTex !== null) return starTex;
  if (typeof document === 'undefined') { starTex = undefined; return null; }
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 22);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(32, 1); g.quadraticCurveTo(35, 29, 63, 32); g.quadraticCurveTo(35, 35, 32, 63); g.quadraticCurveTo(29, 35, 1, 32); g.quadraticCurveTo(29, 29, 32, 1);
  g.fill();
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}
