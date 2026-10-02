// Terrain grid, ground colours and platform (ramp) meshes. Heights come from RoadModel.ground(), the same
// function query() uses, so what you see is what the wheels feel.
import * as THREE from 'three';
import { Geo } from './Geo.js';
import { fbm2 } from './noise.js';
import { clamp } from '../../core/util.js';

const PALETTE = {
  grass: [0x4f9d3a, 0x8bc34a], sand: [0xe4c688, 0xf3dfac], road: [0x8c8d94, 0xa7a8ae],
  water: [0x2a97a6, 0x1d7591], kerb: [0xd62839, 0xf5f5f0], boost: [0x22d3ee, 0x22d3ee], oil: [0x222230, 0x2b2b3a], void: [0x000000, 0x000000],
};

/**
 * Build the per-vertex ground colour function. def.terrain.colours overrides palette entries ([a, b] hex pairs blended by noise);
 * def.terrain.colour(surface, x, z, h, out, track) may return a THREE.Color to override completely (`track` lets it query the road).
 * @returns {(surface:string,x:number,z:number,h:number,out:THREE.Color)=>THREE.Color}
 */
export function makeGroundColour(terrain = {}, track = null) {
  const pal = { ...PALETTE, ...(terrain.colours ?? {}) };
  const a = new THREE.Color(), b = new THREE.Color();
  return (surface, x, z, h, out) => {
    if (terrain.colour) { const r = terrain.colour(surface, x, z, h, out, track); if (r) return r; }
    const p = pal[surface] ?? pal.grass;
    a.set(Array.isArray(p) ? p[0] : p); b.set(Array.isArray(p) ? p[1] : p);
    const n = fbm2(x * 0.035, z * 0.035, 3, 21);
    out.copy(a).lerp(b, n);
    const v = 0.9 + 0.2 * fbm2(x * 0.13 + 9, z * 0.13 - 4, 2, 5);
    out.multiplyScalar(v);
    return out;
  };
}

/**
 * Terrain grid over the drivable world. Vertices inside the road / verge band are sunk under it so the skirts never z-fight.
 * @returns {THREE.Mesh|null}
 */
export function buildTerrain(track, material, groundColour) {
  const m = track.model, tcfg = track.def.terrain ?? {};
  if (tcfg === false || track.def.terrain === false) return null;
  const ext = tcfg.extent ?? m.bounds;
  const [x0, z0, x1, z1] = ext;
  const area = (x1 - x0) * (z1 - z0);
  const cell = tcfg.cell ?? clamp(Math.sqrt(area / 26000), 6, 16);
  const nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const H = new Float32Array(nx * nz), S = new Array(nx * nz);
  const P = { i: 0, f: 0, s: 0, lat: 0, x: 0, y: 0, z: 0, tx: 0, tz: 1, slope: 0, width: 18, tanB: 0, kappa: 0, dx: 0, dz: 0 };
  const out = { height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'grass', onRoad: false, s: 0, lateral: 0, inVoid: false };
  const F = m.F, sink = tcfg.sink ?? 0.45;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, k = j * nx + i;
    m.project(x, 1e4, z, undefined, P);
    m.ground(x, 1e4, z, P, out, true);
    let h = out.height, surf = out.surface;
    if (out.inVoid) {
      if (m.voidReason !== 'terrain') { H[k] = NaN; S[k] = 'void'; continue; }
      H[k] = m._terrainAt(x, z); S[k] = 'void'; continue;      // sea floor etc: visible, but lethal to drive on
    }
    const a = Math.abs(P.lat), right = P.lat >= 0, hw = P.width / 2;
    const skirt = (right ? F.skirtR : F.skirtL)[P.i];
    if (a < hw + m.kerbWidth + skirt + 2.5) h -= sink;
    H[k] = h; S[k] = surf;
  }
  const g = new Geo(), ids = new Int32Array(nx * nz).fill(-1), col = new THREE.Color();
  const uvS = 1 / (tcfg.uvTile ?? 8);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (Number.isNaN(H[k])) continue;
    const x = x0 + i * cell, z = z0 + j * cell;
    const hl = H[j * nx + Math.max(0, i - 1)], hr = H[j * nx + Math.min(nx - 1, i + 1)], hu = H[Math.max(0, j - 1) * nx + i], hd = H[Math.min(nz - 1, j + 1) * nx + i];
    const sx = (Number.isNaN(hr) ? H[k] : hr) - (Number.isNaN(hl) ? H[k] : hl), sz = (Number.isNaN(hd) ? H[k] : hd) - (Number.isNaN(hu) ? H[k] : hu);
    const gx = sx / (2 * cell), gz = sz / (2 * cell), inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
    groundColour(S[k], x, z, H[k], col);
    ids[k] = g.vert(x, H[k], z, -gx * inv, inv, -gz * inv, x * uvS, z * uvS, col.r, col.g, col.b);
  }
  const holes = tcfg.holes ?? [];
  const inHole = (x, z) => holes.some((h) => x > h[0] && x < h[2] && z > h[1] && z < h[3]);
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = ids[j * nx + i], b = ids[j * nx + i + 1], c = ids[(j + 1) * nx + i + 1], d = ids[(j + 1) * nx + i];
    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    if (holes.length && inHole(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell)) continue;
    (i + j) % 2 ? g.quadN(a, b, c, d) : g.quadN(b, c, d, a);
  }
  if (!g.vertexCount) return null;
  const mesh = new THREE.Mesh(g.build(), material);
  mesh.name = 'terrain'; mesh.receiveShadow = true;
  return mesh;
}

/**
 * Mesh for a Platform (ramp / pad): a height grid over its footprint plus the vertical lip face.
 * @param {import('./RoadModel.js').RoadModel} m @param {import('./Platform.js').Platform} pf
 */
export function buildPlatformMesh(m, pf, material, tint = 0xffffff) {
  const g = new Geo(), col = new THREE.Color(tint);
  const P = { i: 0, f: 0, s: 0, lat: 0, x: 0, y: 0, z: 0, tx: 0, tz: 1, slope: 0, width: 18, tanB: 0, kappa: 0, dx: 0, dz: 0 };
  const out = { height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'grass', onRoad: false, s: 0, lateral: 0, inVoid: false };
  const base = (x, z) => { m.project(x, pf.y0, z, undefined, P); m.ground(x, pf.y0, z, P, out, true); return out.inVoid ? pf.y0 - 0.5 : out.height; };
  const uEnd = pf.lip ? pf.length : pf.length + pf.endBevel, uStart = -pf.startBevel;
  const hw = pf.width / 2 + pf.sideBevel;
  const nu = Math.max(2, Math.ceil((uEnd - uStart) / 0.9)), nv = Math.max(2, Math.ceil((2 * hw) / 0.9));
  const ids = [];
  const world = (du, dv) => [pf.x + pf.fx * du + pf.rx * dv, pf.z + pf.fz * du + pf.rz * dv];
  const hAt = (du, dv) => { const [x, z] = world(du, dv); return pf.heightLocal(du, dv, base(x, z)); };
  const eps = 0.02;
  for (let a = 0; a <= nu; a++) {
    const du = uStart + ((uEnd - uStart) * a) / nu;
    const row = [];
    for (let b = 0; b <= nv; b++) {
      const dv = -hw + ((2 * hw) * b) / nv, [x, z] = world(du, dv), h = hAt(du, dv);
      const e = 0.3, dhdu = (hAt(Math.min(du + e, uEnd), dv) - hAt(Math.max(du - e, uStart), dv)) / (Math.min(du + e, uEnd) - Math.max(du - e, uStart));
      const dhdv = (hAt(du, dv + e) - hAt(du, dv - e)) / (2 * e);
      const gx = dhdu * pf.fx + dhdv * pf.rx, gz = dhdu * pf.fz + dhdv * pf.rz, inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      row.push(g.vert(x, h + eps, z, -gx * inv, inv, -gz * inv, dv / pf.width + 0.5, du / 2.2, col.r, col.g, col.b));
    }
    ids.push(row);
  }
  for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) g.quadN(ids[a][b], ids[a][b + 1], ids[a + 1][b + 1], ids[a + 1][b]);
  if (pf.lip) {                                         // vertical face at the lip
    let prev = null;
    const nvl = Math.max(2, Math.ceil(pf.width / 0.9));
    for (let b = 0; b <= nvl; b++) {
      const dv = -pf.width / 2 + (pf.width * b) / nvl, [x, z] = world(pf.length, dv);
      const top = pf.heightLocal(pf.length, dv, base(x, z)), bot = base(world(pf.length + 0.5, dv)[0], world(pf.length + 0.5, dv)[1]) - 0.1;
      const t = g.vert(x, top + eps, z, pf.fx, 0, pf.fz, dv / pf.width + 0.5, 0, col.r * 0.8, col.g * 0.8, col.b * 0.8);
      const u = g.vert(x, bot, z, pf.fx, 0, pf.fz, dv / pf.width + 0.5, 1, col.r * 0.5, col.g * 0.5, col.b * 0.5);
      if (prev) g.quadN(prev[0], prev[1], u, t);
      prev = [t, u];
    }
  }
  const mesh = new THREE.Mesh(g.build(), material);
  mesh.name = `platform:${pf.kind}`; mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}
