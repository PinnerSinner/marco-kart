// Post-processing: HDR render target (MSAA on high) -> bloom -> vignette / radial blur / speed lines / boost tint -> tone-map + sRGB.
// `low` skips everything and calls renderer.render directly.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { clamp, damp } from '../core/util.js';

const GradeShader = {
  name: 'MKGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uBoost: { value: 0 },
    uSpeed: { value: 0 },
    uVignette: { value: 0.32 },
    uAspect: { value: 1.7778 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uBoost; uniform float uSpeed; uniform float uVignette; uniform float uAspect;
    varying vec2 vUv;
    float hash( float n ) { return fract( sin( n ) * 43758.5453 ); }
    void main() {
      vec2 c = vUv - 0.5;
      float r = length( c * vec2( uAspect, 1.0 ) );
      vec3 col;
      float blur = uSpeed * 0.07;
      if ( blur > 0.002 || uBoost > 0.01 ) {
        // radial blur towards the centre + slight chromatic split that grows with distance from the centre
        float ca = ( uBoost * 0.006 + uSpeed * 0.003 ) * r;
        vec3 acc = vec3( 0.0 );
        float wsum = 0.0;
        for ( int i = 0; i < 6; i++ ) {
          float f = float( i ) / 5.0;
          vec2 uv = vUv - c * blur * f * smoothstep( 0.1, 0.6, r );
          vec3 s;
          s.r = texture2D( tDiffuse, uv - c * ca ).r;
          s.g = texture2D( tDiffuse, uv ).g;
          s.b = texture2D( tDiffuse, uv + c * ca ).b;
          float w = 1.0 - f * 0.55;
          acc += s * w; wsum += w;
        }
        col = acc / wsum;
      } else {
        col = texture2D( tDiffuse, vUv ).rgb;
      }
      // speed lines: sparse radial streaks near the screen edge
      if ( uSpeed > 0.02 ) {
        float a = atan( c.y, c.x );
        float seg = floor( a * 46.0 + floor( uTime * 14.0 ) * 7.13 );
        float rnd = hash( seg );
        float width = 0.18 + 0.5 * hash( seg + 3.1 );
        float across = abs( fract( a * 46.0 / 6.2832 * 6.2832 ) - 0.5 );
        float line = step( 0.78, rnd ) * smoothstep( width, width * 0.2, across );
        float edge = smoothstep( 0.32, 0.72, r );
        col += vec3( 1.0, 0.98, 0.95 ) * line * edge * uSpeed * 0.55;
      }
      // boost tint: warm-cyan glow from the borders
      col += vec3( 0.05, 0.16, 0.3 ) * uBoost * smoothstep( 0.25, 0.85, r ) * 0.6;
      // vignette
      float v = smoothstep( 0.5, 1.05, r * 1.05 );
      col *= 1.0 - v * ( uVignette + uBoost * 0.08 );
      // gentle contrast + saturation lift suits the toon look
      float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      col = mix( vec3( l ), col, 1.08 );
      gl_FragColor = vec4( col, 1.0 );
    }`,
};

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {'low'|'medium'|'high'} [quality='high']
 * @returns {{render: (dt: number) => void, setSize: (w: number, h: number) => void, setBoost: (v: number) => void, setSpeedLines: (v: number) => void, setQuality: (q: string) => void, dispose: () => void, active: boolean}}
 */
export function createPostFX(renderer, scene, camera, quality = 'high') {
  let composer = null, bloom = null, grade = null;
  let boost = 0, boostT = 0, speed = 0, speedT = 0, time = 0;
  let q = quality;
  let w = 0, h = 0;

  const dispose = () => {
    if (!composer) return;
    composer.renderTarget1?.dispose(); composer.renderTarget2?.dispose();
    for (const p of composer.passes) p.dispose?.();
    composer = null; bloom = null; grade = null;
  };

  const build = () => {
    dispose();
    if (q === 'low') return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    w = size.x || 1; h = size.y || 1;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 0 });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(1);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(2, w >> (q === 'high' ? 1 : 2)), Math.max(2, h >> (q === 'high' ? 1 : 2))), q === 'high' ? 0.62 : 0.5, 0.55, 0.92);
    composer.addPass(bloom);
    grade = new ShaderPass(GradeShader);
    grade.uniforms.uAspect.value = w / h;
    composer.addPass(grade);
    composer.addPass(new OutputPass());
  };
  build();

  return {
    get active() { return composer !== null; },
    /** Render the frame. @param {number} dt frame seconds */
    render(dt) {
      if (!composer) { renderer.render(scene, camera); return; }
      time += dt;
      boost = damp(boost, boostT, 8, dt);
      speed = damp(speed, speedT, 6, dt);
      grade.uniforms.uTime.value = time;
      grade.uniforms.uBoost.value = boost;
      grade.uniforms.uSpeed.value = speed;
      composer.render(dt);
    },
    /** @param {number} width drawing-buffer width in px @param {number} height */
    setSize(width, height) {
      w = Math.max(1, Math.floor(width)); h = Math.max(1, Math.floor(height));
      if (!composer) return;
      composer.setSize(w, h);
      bloom.setSize(Math.max(2, w >> (q === 'high' ? 1 : 2)), Math.max(2, h >> (q === 'high' ? 1 : 2)));
      grade.uniforms.uAspect.value = w / h;
    },
    /** Boost intensity 0..1 (tints and chromatically splits the screen edges). @param {number} v */
    setBoost(v) { boostT = clamp(v, 0, 1); },
    /** Speed line / radial blur intensity 0..1. @param {number} v */
    setSpeedLines(v) { speedT = clamp(v, 0, 1); },
    /** Rebuild for a new quality tier. @param {'low'|'medium'|'high'} next */
    setQuality(next) { if (next === q) return; q = next; build(); },
    dispose,
  };
}
