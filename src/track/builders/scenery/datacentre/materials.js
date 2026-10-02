// Materials for Cloud Nine Data Centre. Everything shared: one uniform block (uTime) feeds the LED blink, fibre pulses, spinning fans,
// hologram flicker and billboard sprites, advanced by M.tick(dt, t) (registered through kit.animate by the dressing).
// Plain Node (no canvas) yields textureless materials, so the track builds headless.
import * as THREE from 'three';
import * as X from './textures.js';

const U = { uTime: { value: 0 } };
const hdr = (k) => new THREE.Color(k, k, k);

/** Add `uTime` plus GLSL to a material through onBeforeCompile, chaining any existing hook. `key` keeps program caches apart. */
function patch(material, key, edit) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => { prev?.(shader, r); shader.uniforms.uTime = U.uTime; edit(shader); };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `dc-${key}-${prevKey ? prevKey() : ''}`;
  return material;
}
const inject = (src, token, code, after = true) => src.replace(token, after ? `${token}\n${code}` : `${code}\n${token}`);

/** Rack wall / anything wearing the rack emissive map: LEDs (bright emissive cells) blink per 8 px cell; dim glow strips stay steady. */
function ledBlink(material) {
  return patch(material, 'led', (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        float dcH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`);
    sh.fragmentShader = inject(sh.fragmentShader, '#include <emissivemap_fragment>', `
      #ifdef USE_EMISSIVEMAP
        float ledMax = max(emissiveColor.r, max(emissiveColor.g, emissiveColor.b));
        if (ledMax > 0.42) {
          vec2 cid = floor(vEmissiveMapUv * vec2(${X.RACK.w}.0, ${X.RACK.h}.0) / ${X.RACK.cell}.0);
          float hh = dcH(cid), mode = dcH(cid + 7.13);
          float slow = step(0.5, fract(uTime * (0.35 + 1.2 * hh) + hh * 13.0));
          float fast = step(0.4, dcH(cid + floor(uTime * (6.0 + 9.0 * hh))));
          float on = mode < 0.42 ? 1.0 : (mode < 0.78 ? mix(0.06, 1.0, slow) : mix(0.08, 1.0, fast));
          totalEmissiveRadiance *= on;
        }
      #endif`);
  });
}

/** Unlit vertex-coloured tube/ribbon whose brightness pulses in travelling packets: uv.y must be metres along the route (sweep uvTile: 1). */
function pulseMaterial({ speed = 14, wave = 0.11, base = 0.35, peak = 2.4, sharp = 5, mul = 1.0 } = {}) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, color: hdr(mul) });
  return patch(m, `pulse${speed}${wave}${base}${peak}${sharp}`, (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDcS;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDcS = uv.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vDcS;');
    sh.fragmentShader = inject(sh.fragmentShader, '#include <color_fragment>', `
      float dcP = 0.5 + 0.5 * sin((vDcS - uTime * ${speed.toFixed(2)}) * ${wave.toFixed(3)} * 6.2831);
      diffuseColor.rgb *= ${base.toFixed(2)} + ${peak.toFixed(2)} * pow(dcP, ${sharp.toFixed(1)});`);
  });
}

/** Camera-facing quads for instanced sprites (halos, clouds). Per-instance colour = instanceColor, size = instance matrix scale. */
function billboardMaterial(map, { additive = true, fadeNear = 6, fadeFar = 14, opacity = 1, pulse = 0 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uMap: { value: map }, uOpacity: { value: opacity }, uFade: { value: new THREE.Vector2(fadeNear, fadeFar) }, uFog: { value: new THREE.Color(0x080e2a) }, uFogRange: { value: new THREE.Vector2(60, 460) } },
    vertexShader: `
      uniform float uTime; uniform vec2 uFade; uniform vec2 uFogRange;
      varying vec2 vUv; varying vec3 vCol; varying float vAlpha;
      void main() {
        vUv = uv;
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        mat4 im = instanceMatrix;
        vec4 mv = modelViewMatrix * im * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 sc = vec2(length(im[0].xyz), length(im[1].xyz));
        float ph = im[3].x * 0.37 + im[3].z * 0.23;
        float tw = ${pulse > 0 ? `1.0 - ${pulse.toFixed(2)} + ${pulse.toFixed(2)} * (0.5 + 0.5 * sin(uTime * (0.8 + fract(ph) * 2.0) + ph))` : '1.0'};
        float d = -mv.z;
        vAlpha = tw * smoothstep(uFade.x, uFade.y, d) * (1.0 - smoothstep(uFogRange.y * 0.8, uFogRange.y * 1.6, d));
        mv.xy += position.xy * sc;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uOpacity;
      varying vec2 vUv; varying vec3 vCol; varying float vAlpha;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        float a = t.a * uOpacity * vAlpha;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vCol * t.rgb, a);
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false, fog: false,
  });
  return m;
}

/** Rotating fan blades (instanced, axis = local +Z): angle = uTime * rate, direction and phase from the instance position. */
function fanBladeMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.4, side: THREE.DoubleSide, emissive: 0x0c2a55, emissiveIntensity: 0.8 });
  return patch(m, 'fan', (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        #ifdef USE_INSTANCING
          float fh = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float fang = uTime * (2.4 + 1.6 * fh) * (fh > 0.5 ? 1.0 : -1.0) + fh * 6.283;
        #else
          float fang = uTime * 3.0;
        #endif
        float fc = cos(fang), fs = sin(fang);
        objectNormal.xy = mat2(fc, fs, -fs, fc) * objectNormal.xy;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.xy = mat2(fc, fs, -fs, fc) * transformed.xy;`);
  });
}

/** Additive hologram: atlas texture, flicker and a scanning bar. */
function holoMaterial(map) {
  const m = new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, color: hdr(1.7), vertexColors: true });
  return patch(m, 'holo', (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDcY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDcY = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vDcY;');
    sh.fragmentShader = inject(sh.fragmentShader, '#include <map_fragment>', `
      float dcScan = 0.82 + 0.18 * sin(vDcY * 9.0 - uTime * 3.0);
      float dcFlick = 0.9 + 0.1 * sin(uTime * 23.0 + vDcY * 2.0) * sin(uTime * 7.0);
      diffuseColor.rgb *= dcScan * dcFlick;`);
  });
}

export function createMaterials() {
  const lit = (o) => new THREE.MeshStandardMaterial(o);
  const roadT = X.roadTextures(), rackT = X.rackTextures(), railT = X.railTextures(), floorT = X.floorTextures(), kerbT = X.kerbTextures(), slabT = X.slabTextures();
  const emis = (t, k = 1) => ({ emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: k });

  const M = {
    U,
    tick(dt, t) { U.uTime.value = t; },
    // ---- gameplay surfaces (also wall styles)
    road: lit({ color: 0xffffff, map: roadT.map, ...emis(roadT, 1.0), roughness: 0.5, metalness: 0.18 }),
    rack: ledBlink(lit({ color: 0xffffff, map: rackT.map, ...emis(rackT, 1.35), vertexColors: true, roughness: 0.55, metalness: 0.2 })),
    rail: lit({ color: 0xffffff, map: railT.map, ...emis(railT, 1.2), vertexColors: true, roughness: 0.6, metalness: 0.25 }),
    kerb: lit({ color: 0xffffff, map: kerbT.map, ...emis(kerbT, 1.3), roughness: 0.5 }),
    underside: lit({ color: 0xffffff, map: slabT.map, ...emis(slabT, 1.0), vertexColors: true, roughness: 0.6, metalness: 0.3 }),
    paint: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: hdr(1.0), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    // ---- hall
    floor: lit({ color: 0xffffff, map: floorT.map, ...emis(floorT, 1.6), roughness: 0.4, metalness: 0.35 }),
    hallWall: (() => { const t = X.hallWallTextures(); return lit({ color: 0xffffff, map: t.map, ...emis(t, 1.0), roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide }); })(),
    ceiling: lit({ color: 0xffffff, map: X.ceilingTextures(), roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide }),
    steel: lit({ vertexColors: true, roughness: 0.55, metalness: 0.45 }),                 // structural dressing (Geo colours)
    litVertex: lit({ vertexColors: true, roughness: 0.7, metalness: 0.1 }),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    neonBase: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }),
    glass: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.10, 0.36, 0.62), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
    holo: holoMaterial(X.holoAtlas()),
    screen: new THREE.MeshBasicMaterial({ map: X.marcoScreen(), color: hdr(1.25), toneMapped: false, side: THREE.DoubleSide }),
    chev: new THREE.MeshBasicMaterial({ map: X.chevronTexture(), color: hdr(1.25), toneMapped: false, side: THREE.DoubleSide }),
    logo: new THREE.MeshBasicMaterial({ map: X.logoSign(), color: hdr(1.2), toneMapped: false, side: THREE.DoubleSide }),
    glowFlat: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    screenDash: new THREE.MeshBasicMaterial({ map: X.dashScreen(), color: hdr(1.2), toneMapped: false, side: THREE.DoubleSide }),
    fibreA: pulseMaterial({ speed: 18, wave: 0.045, base: 0.4, peak: 1.8, sharp: 6, mul: 1.0 }),
    fibreB: pulseMaterial({ speed: -13, wave: 0.031, base: 0.45, peak: 1.7, sharp: 5, mul: 1.0 }),
    fibreC: pulseMaterial({ speed: 24, wave: 0.07, base: 0.3, peak: 2.0, sharp: 8, mul: 1.0 }),
    fanBlade: fanBladeMaterial(),
    halo: billboardMaterial(X.glowSprite(), { additive: true, fadeNear: 3, fadeFar: 10, pulse: 0.25 }),
    haloSteady: billboardMaterial(X.glowSprite(), { additive: true, fadeNear: 3, fadeFar: 10 }),
    cloud: billboardMaterial(X.cloudSprite(), { additive: false, fadeNear: 10, fadeFar: 30, opacity: 0.6 }),
    barGlow: billboardMaterial(X.barGlow(), { additive: true, fadeNear: 4, fadeFar: 14 }),
  };

  /** A clone of a 2.2 m-repeat platform texture set repeated across `width` metres (platform uv: u across the width once, v = 2.2 m per repeat). */
  const platformMap = (t, width, along = 1) => {
    const set = (x) => { if (!x) return null; const c = x.clone(); c.repeat.set(width / 2.2, along); c.needsUpdate = true; return c; };
    return { map: set(t.map), emissive: set(t.emissive) };
  };
  const platform = (t, width, o = {}) => { const p = platformMap(t, width, o.along ?? 1); return lit({ color: 0xffffff, map: p.map, ...emis(p, o.glow ?? 1), roughness: o.roughness ?? 0.5, metalness: o.metalness ?? 0.3, ...(o.extra ?? {}) }); };
  const memo = new Map();
  const once = (k, fn) => { if (!memo.has(k)) memo.set(k, fn()); return memo.get(k); };
  M.grating = (width, hue) => once(`grating${width}${hue}`, () => platform(X.gratingTextures(hue), width, { glow: 0.9, metalness: 0.4 }));
  M.hazard = (width) => once(`hazard${width}`, () => platform(X.hazardTextures(), width, { glow: 0.9 }));
  M.boostMat = (width) => once(`boost${width}`, () => platform(X.boostTextures(), width, { glow: 2.2, roughness: 0.4, along: 1 }));
  M.spillMat = (width, length) => once(`spill${width}x${length}`, () => {
    const t = X.spillTextures(), p = platformMap(t, 1, 2.2 / length);
    const m = lit({ color: 0xffffff, map: p.map, emissiveMap: p.emissive, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.12, metalness: 0.75, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return m;
  });
  M.forKit = () => ({ road: M.road, kerb: M.kerb, platform: M.hazard(12), paint: M.paint, underside: M.underside, verge: M.floor });
  return M;
}
