// Small material patches (onBeforeCompile) used by track dressing: wind sway, crowd hop, glow pulse.
// Each returns the uniforms object; Track drives uTime through kit.mat.* helpers, so callers never touch it.

/**
 * Sway vertices with height above the object origin (grass, palms, flags). Works on instanced and plain meshes.
 * @param {THREE.Material} material
 * @param {{ strength?: number, speed?: number, fromHeight?: number }} [o] strength = metres of sway per 20 m of height
 */
export function applyWind(material, { strength = 1, speed = 1.7, fromHeight = 0 } = {}) {
  const uniforms = { uTime: { value: 0 } };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    prev?.(shader, r);
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 wp = instanceMatrix[3].xz;
        #else
          vec2 wp = modelMatrix[3].xz;
        #endif
        float wph = wp.x * 0.13 + wp.y * 0.17;
        float wk = max(position.y - ${fromHeight.toFixed(2)}, 0.0);
        transformed.x += sin(uTime * ${speed.toFixed(2)} + wph + position.y * 0.3) * ${strength.toFixed(3)} * wk * 0.05;
        transformed.z += cos(uTime * ${(speed * 0.83).toFixed(2)} + wph * 1.3) * ${strength.toFixed(3)} * wk * 0.04;`);
  };
  material.customProgramCacheKey = () => `wind-${strength}-${speed}-${fromHeight}`;
  return uniforms;
}

/**
 * Crowd hop: vertices bounce by `amp` metres, phase from uv.x (0..1 per person), weight from uv.y (0 feet .. 1 head),
 * so limbs and heads move more than feet. Geometry must carry those uvs (see scenery/people.js).
 * @param {THREE.Material} material @param {{ amp?: number, rate?: number }} [o]
 */
export function applyHop(material, { amp = 0.3, rate = 5 } = {}) {
  const uniforms = { uTime: { value: 0 } };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    prev?.(shader, r);
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hopPh = uv.x * 6.2831;
        float hop = abs(sin(uTime * ${rate.toFixed(2)} + hopPh));
        transformed.y += hop * ${amp.toFixed(3)} * (0.4 + 0.6 * uv.y);`);
  };
  material.customProgramCacheKey = () => `hop-${amp}-${rate}`;
  return uniforms;
}
