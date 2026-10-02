// Animated water: a coarse grid over the sea (or canal) with per-vertex depth-based colour and alpha, and a scrolling
// normal map for sun glints. The depth comes from the same terrain function the ground uses, so shorelines line up.
import * as THREE from 'three';
import { waterNormalTexture } from './textures.js';
import { clamp } from '../../core/util.js';

/**
 * @param {import('../Track.js').Track} track
 * @param {object} w water spec
 * @param {number} w.level water surface height (m)
 * @param {number[]} w.extent [minX, minZ, maxX, maxZ]
 * @param {number} [w.cell=10] grid cell (m)
 * @param {number} [w.shallow=0x5fd0cf] @param {number} [w.deep=0x1466a0] colours
 * @param {number} [w.opacity=0.9] alpha in deep water
 * @param {number} [w.tile=40] metres per normal-map repeat
 * @param {number} [w.roughness=0.18]
 * @param {(x:number,z:number)=>number} [w.depth] override depth function (default level - terrain height)
 * @returns {{ mesh: THREE.Mesh, update: (dt:number, t:number)=>void }}
 */
export function buildWater(track, w) {
  const m = track.model, cell = w.cell ?? 10;
  const [x0, z0, x1, z1] = w.extent;
  const nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const pos = new Float32Array(nx * nz * 3), nor = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), colr = new Float32Array(nx * nz * 4);
  const shallow = new THREE.Color(w.shallow ?? 0x62d6cf), deep = new THREE.Color(w.deep ?? 0x14649e), c = new THREE.Color();
  const tile = w.tile ?? 40, P = { i: 0, f: 0, s: 0, lat: 0, x: 0, y: 0, z: 0, tx: 0, tz: 1, slope: 0, width: 18, tanB: 0, kappa: 0, dx: 0, dz: 0 };
  const out = { height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'grass', onRoad: false, s: 0, lateral: 0, inVoid: false };
  const depthAt = w.depth ?? ((x, z) => {
    m.project(x, 1e4, z, undefined, P); m.ground(x, 1e4, z, P, out, true);
    return out.inVoid ? (m.voidReason === 'terrain' ? w.level - m._terrainAt(x, z) : 6) : w.level - out.height;
  });
  const maxA = w.opacity ?? 0.9;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * cell, z = z0 + j * cell, d = depthAt(x, z);
    pos.set([x, w.level, z], k * 3); nor.set([0, 1, 0], k * 3); uv.set([x / tile, z / tile], k * 2);
    c.copy(shallow).lerp(deep, clamp(d / (w.deepAt ?? 7), 0, 1));
    const a = clamp((d + 0.15) / 0.9, 0, 1) * 0.35 + clamp((d - 0.3) / 5, 0, 1) * (maxA - 0.35);
    colr.set([c.r, c.g, c.b, d <= -0.1 ? 0 : a], k * 4);
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, cc = a + nx + 1, d = a + nx;
    if (colr[a * 4 + 3] === 0 && colr[b * 4 + 3] === 0 && colr[cc * 4 + 3] === 0 && colr[d * 4 + 3] === 0) continue;
    idx.push(a, d, cc, a, cc, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(colr, 4));
  g.setIndex(idx);
  const map = waterNormalTexture();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, transparent: true, roughness: w.roughness ?? 0.18, metalness: 0.0,
    normalMap: map ?? null, normalScale: new THREE.Vector2(w.normalScale ?? 0.55, w.normalScale ?? 0.55), depthWrite: false,
    envMap: w.envMap ?? null, envMapIntensity: w.envIntensity ?? 1,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'water'; mesh.renderOrder = 1; mesh.receiveShadow = false;
  const update = (dt, t) => { if (map) { map.offset.set(t * 0.011, t * 0.017); } };
  return { mesh, update };
}
