// Shared toon-shading kit: 3-step gradient ramp, stylised rim + glossy highlight patch for MeshToonMaterial,
// inverted-hull outline meshes (smoothed-normal extrusion), and a few colour helpers.
// Node-importable: nothing here touches the DOM.
import * as THREE from 'three';

let gradientMap = null;

/**
 * The shared 3-step toon ramp (dark / mid / lit). Nearest filtered, one texel per band.
 * @returns {THREE.DataTexture}
 */
export function getGradientMap() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([92, 178, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradientMap = tex;
  return tex;
}

const RIM_GLSL = /* glsl */`
  {
    vec3 mkV = normalize( vViewPosition );
    float mkNdv = clamp( dot( normal, mkV ), 0.0, 1.0 );
    float mkRim = smoothstep( 0.60, 0.68, 1.0 - mkNdv );
    outgoingLight += ( diffuseColor.rgb * 0.55 + vec3( 0.10 ) ) * mkRim * MK_RIM;
    #if NUM_DIR_LIGHTS > 0
      vec3 mkH = normalize( directionalLights[ 0 ].direction + mkV );
      float mkSp = smoothstep( 0.955, 0.972, dot( normal, mkH ) );
      outgoingLight += vec3( 1.0, 0.98, 0.92 ) * mkSp * MK_SPEC;
    #endif
  }
`;

const toonCache = new Map();

/**
 * Create (or fetch from cache) a toon material with a rim band and an optional glossy highlight patch.
 * @param {object} [o]
 * @param {number} [o.rim=0.35] rim band strength 0..1
 * @param {number} [o.spec=0] highlight strength 0..1
 * @param {boolean} [o.vertexColors=true]
 * @param {THREE.Texture|null} [o.map]
 * @param {number} [o.color=0xffffff]
 * @param {number} [o.emissive=0x000000]
 * @param {boolean} [o.transparent=false]
 * @param {number} [o.opacity=1]
 * @param {THREE.Side} [o.side]
 * @param {string} [o.cacheKey] when given the material is cached under this key (textured materials pass their own)
 * @returns {THREE.MeshToonMaterial}
 */
export function makeToonMaterial(o = {}) {
  const { rim = 0.35, spec = 0, vertexColors = true, map = null, color = 0xffffff, emissive = 0x000000,
    transparent = false, opacity = 1, side = THREE.FrontSide, cacheKey } = o;
  const key = cacheKey ?? (map ? null : `${rim}|${spec}|${vertexColors}|${color}|${emissive}|${transparent}|${opacity}|${side}`);
  if (key && toonCache.has(key)) return toonCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, vertexColors, map, gradientMap: getGradientMap(), emissive, transparent, opacity, side });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      RIM_GLSL.replace('MK_RIM', rim.toFixed(3)).replace('MK_SPEC', spec.toFixed(3)) + '\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => `mk-toon-${rim.toFixed(2)}-${spec.toFixed(2)}`;
  if (key) toonCache.set(key, m);
  return m;
}

/** Vertex-coloured cloth-like toon material (default for most parts). @returns {THREE.MeshToonMaterial} */
export const clothMaterial = () => makeToonMaterial({ rim: 0.35, spec: 0 });
/** Vertex-coloured glossy paint material (karts). @returns {THREE.MeshToonMaterial} */
export const paintMaterial = () => makeToonMaterial({ rim: 0.30, spec: 0.55 });
/** Softer skin/fur material. @returns {THREE.MeshToonMaterial} */
export const skinMaterial = () => makeToonMaterial({ rim: 0.22, spec: 0.12 });

let glowMat = null;
/** Unlit vertex-coloured material for lamps, LEDs and screens (bloom picks it up). @returns {THREE.MeshBasicMaterial} */
export function glowMaterial() {
  if (!glowMat) glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return glowMat;
}

let ledMat = null;
const ledTime = { value: 0 };
/**
 * Unlit material for lamps that also blinks any vertex whose colour is boosted above 1.5 (server-rack LEDs). Blink
 * phase is hashed from the vertex's position on a 1/16 m grid, so LEDs must be authored on that grid.
 * Time is driven by `ledTick` (assign it as `mesh.onBeforeRender`).
 * @returns {THREE.MeshBasicMaterial}
 */
export function ledMaterial() {
  if (ledMat) return ledMat;
  ledMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  ledMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = ledTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <color_vertex>', `
      #include <color_vertex>
      {
        float mx = max( color.r, max( color.g, color.b ) );
        if ( mx > 1.5 ) {
          vec3 g = floor( position * 16.0 + 0.5 );
          float ph = fract( sin( dot( g, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
          float on = step( 0.42, fract( uTime * ( 0.7 + ph * 1.9 ) + ph * 17.0 ) );
          vColor.rgb = color.rgb * mix( 0.1, 0.75, on );
        }
      }`);
  };
  ledMat.customProgramCacheKey = () => 'mk-led';
  return ledMat;
}

/** `onBeforeRender` hook that advances the shared LED blink clock (cheap; safe to assign to many meshes). */
export function ledTick() {
  ledTime.value = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

// ---- outlines ----------------------------------------------------------------------------------------------------

const outlineGeoCache = new WeakMap();

/**
 * Geometry sharing `geo`'s positions but with smoothed (position-welded) normals, so an inverted-hull extrusion
 * stays closed at hard edges. Cached per source geometry.
 * @param {THREE.BufferGeometry} geo
 * @returns {THREE.BufferGeometry}
 */
export function outlineGeometry(geo) {
  const hit = outlineGeoCache.get(geo);
  if (hit) return hit;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const n = pos.count;
  const sums = new Map();
  const keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    keys[i] = k;
    let s = sums.get(k);
    if (!s) { s = [0, 0, 0]; sums.set(k, s); }
    s[0] += nor.getX(i); s[1] += nor.getY(i); s[2] += nor.getZ(i);
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = sums.get(keys[i]);
    const l = Math.hypot(s[0], s[1], s[2]) || 1;
    out[i * 3] = s[0] / l; out[i * 3 + 1] = s[1] / l; out[i * 3 + 2] = s[2] / l;
  }
  const og = new THREE.BufferGeometry();
  og.setAttribute('position', pos);
  og.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  if (geo.index) og.setIndex(geo.index);
  og.boundingSphere = geo.boundingSphere;
  outlineGeoCache.set(geo, og);
  return og;
}

const outlineMatCache = new Map();

/**
 * Cached inverted-hull outline material. Thickness is in the mesh's local units and swells gently with view distance
 * so lines stay legible at the back of the pack.
 * @param {number} [thickness=0.03]
 * @param {number} [colour=0x1b1226]
 * @returns {THREE.MeshBasicMaterial}
 */
export function outlineMaterial(thickness = 0.03, colour = 0x1b1226) {
  const key = `${thickness}|${colour}`;
  const hit = outlineMatCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({ color: colour, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uThick = { value: thickness };
    shader.vertexShader = 'uniform float uThick;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float mkZ = -( modelViewMatrix * vec4( position, 1.0 ) ).z;
      transformed += normalize( normal ) * uThick * clamp( 0.85 + 0.016 * mkZ, 1.0, 3.0 );`);
  };
  m.customProgramCacheKey = () => 'mk-outline';
  outlineMatCache.set(key, m);
  return m;
}

/** Darken a colour towards ink for a tinted outline. @param {number} hex @param {number} [k=0.28] @returns {number} */
export function inkOf(hex, k = 0.28) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  c.offsetHSL(0, 0.05, -0.02);
  return c.getHex();
}

/**
 * Build a Mesh plus its outline shell (child, no shadow casting).
 * @param {THREE.BufferGeometry} geo
 * @param {THREE.Material} mat
 * @param {number} [thickness=0.03]
 * @param {number} [ink=0x1b1226]
 * @returns {THREE.Mesh} the main mesh (outline is `mesh.userData.outline`, added as a child)
 */
export function outlinedMesh(geo, mat, thickness = 0.03, ink = 0x1b1226) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.userData.noShadow = true; // karts / characters never receive shadows (avoids acne on toon shading)
  if (thickness > 0) {
    const o = new THREE.Mesh(outlineGeometry(geo), outlineMaterial(thickness, ink));
    o.castShadow = false;
    o.receiveShadow = false;
    o.matrixAutoUpdate = false;
    o.raycast = () => {};
    mesh.add(o);
    mesh.userData.outline = o;
  }
  return mesh;
}

// ---- colour helpers ----------------------------------------------------------------------------------------------

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

/** Lerp two hex colours into a hex. @param {number} a @param {number} b @param {number} t @returns {number} */
export function mixHex(a, b, t) {
  return _c1.setHex(a).lerp(_c2.setHex(b), t).getHex();
}

/** Shift a hex colour's lightness. @param {number} hex @param {number} dl lightness delta (-1..1) @returns {number} */
export function shade(hex, dl) {
  _c1.setHex(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  _c1.getHSL(hsl);
  _c1.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + dl)));
  return _c1.getHex();
}

/** Registry of created shared resources so tests / hot reload can free them. */
export function disposeToonCaches() {
  for (const m of toonCache.values()) m.dispose();
  toonCache.clear();
  for (const m of outlineMatCache.values()) m.dispose();
  outlineMatCache.clear();
  gradientMap?.dispose();
  gradientMap = null;
  glowMat?.dispose();
  glowMat = null;
  ledMat?.dispose();
  ledMat = null;
}
