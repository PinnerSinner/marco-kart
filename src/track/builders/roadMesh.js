// Road surface, kerbs, verge skirts and walls: ribbons swept along the centreline stations.
// Every vertex uses the same station data as RoadModel.query(), so visuals and physics agree.
import * as THREE from 'three';
import { Geo } from './Geo.js';
import { fbm2 } from './noise.js';

const col = new THREE.Color();

/** Point on the road surface at station i, lateral l (m): writes into out {x,y,z}. */
export function stationPoint(cl, i, l, out) {
  out.x = cl.x[i] - cl.tz[i] * l; out.z = cl.z[i] + cl.tx[i] * l; out.y = cl.y[i] - l * cl.tanB[i];
  return out;
}

/** Surface normal at station i (banking + slope). */
export function stationNormal(cl, i, out) {
  const tB = cl.tanB[i], sl = cl.slope[i], tx = cl.tx[i], tz = cl.tz[i];
  const nx = -tB * tz - sl * tx, nz = tB * tx - sl * tz, inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
  out.x = nx * inv; out.y = inv; out.z = nz * inv;
  return out;
}

/** Number of texture repeats along the loop so the pattern joins seamlessly at the start line. */
const repeats = (length, tile) => Math.max(1, Math.round(length / tile));

/**
 * Road ribbon with UVs in metres (u across, v along, both divided by road.tile).
 * @returns {THREE.Mesh}
 */
export function buildRoadSurface(track, material) {
  const m = track.model, cl = m.cl, N = cl.N, tile = track.road.tile ?? 18;
  const g = new Geo(), F = m.F, reps = repeats(cl.length, tile), rows = [-1, -0.5, 0, 0.5, 1];
  const p = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 1, z: 0 };
  const idx = new Int32Array((N + 1) * rows.length).fill(-1);
  for (let i = 0; i <= N; i++) {
    const ii = i % N;
    if (F.gap[ii] && (F.gap[(ii + N - 1) % N])) { /* fully inside a gap: no vertices needed */ }
    const hw = cl.width[ii] / 2, v = (i * cl.ds * reps) / cl.length;
    stationNormal(cl, ii, n);
    rows.forEach((r, k) => {
      const l = r * hw; stationPoint(cl, ii, l, p);
      idx[i * rows.length + k] = g.vert(p.x, p.y, p.z, n.x, n.y, n.z, l / tile + 0.5, v, 1, 1, 1);
    });
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    if (F.gap[i] | F.gap[j]) continue;
    for (let k = 0; k < rows.length - 1; k++) {
      g.quadN(idx[i * rows.length + k], idx[i * rows.length + k + 1], idx[(i + 1) * rows.length + k + 1], idx[(i + 1) * rows.length + k]);
    }
  }
  const mesh = new THREE.Mesh(g.build(), material);
  mesh.name = 'road'; mesh.receiveShadow = true;
  return mesh;
}

/** Slab / girder under the road where zones (or road.thickness) ask for one: side skirts + underside, per-station thickness. */
export function buildRoadUnderside(track, material) {
  const m = track.model, cl = m.cl, N = cl.N, F = m.F, g = new Geo(), p = { x: 0, y: 0, z: 0 };
  if (!F.thick.some((v) => v > 0)) return null;
  const tile = track.road.underTile ?? 2.4;                     // metres per texture repeat on slab sides / underside
  const row = (i, sgn, drop, shade) => {
    const ii = i % N, hw = cl.width[ii] / 2; stationPoint(cl, ii, sgn * hw, p);
    return g.vert(p.x, p.y - drop * F.thick[ii], p.z, sgn * -cl.tz[ii], 0, sgn * cl.tx[ii], (i * cl.ds) / tile, (drop * F.thick[ii]) / tile, shade, shade, shade);
  };
  for (const sgn of [-1, 1]) {
    const ids = [];
    for (let i = 0; i <= N; i++) ids.push([row(i, sgn, 0, 0.9), row(i, sgn, 1, 0.55)]);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if (!(F.thick[i] > 0 && F.thick[j] > 0) || (F.gap[i] | F.gap[j])) continue;
      g.quadN(ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]);
    }
  }
  const under = [];
  for (let i = 0; i <= N; i++) {
    const ii = i % N, hw = cl.width[ii] / 2, r = [];
    for (const sgn of [-1, 1]) { stationPoint(cl, ii, sgn * hw, p); r.push(g.vert(p.x, p.y - F.thick[ii], p.z, 0, -1, 0, (sgn * hw) / tile, (i * cl.ds) / tile, 0.45, 0.45, 0.45)); }
    under.push(r);
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    if (!(F.thick[i] > 0 && F.thick[j] > 0) || (F.gap[i] | F.gap[j])) continue;
    g.quadN(under[i][0], under[i][1], under[i + 1][1], under[i + 1][0]);
  }
  const mesh = new THREE.Mesh(g.build(), material);
  mesh.name = 'road-underside'; mesh.castShadow = true;
  return mesh;
}

/**
 * Kerb strips along flagged edges. One mesh per kerb style.
 * @param {(styleIndex:number)=>THREE.Material} materialFor
 */
export function buildKerbs(track, materialFor) {
  const m = track.model, cl = m.cl, N = cl.N, F = m.F, kw = m.kerbWidth, meshes = [];
  const styles = new Map();
  const p = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 1, z: 0 }, lift = 0.05;
  for (const side of [-1, 1]) {
    const flags = side < 0 ? F.kerbL : F.kerbR;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, st = flags[i];
      if (!st || flags[j] !== st || (F.gap[i] | F.gap[j])) continue;
      let g = styles.get(st); if (!g) styles.set(st, g = new Geo());
      const vs = [];
      for (const ii of [i, j]) {
        const hw = cl.width[ii] / 2, s = (ii === 0 && i > 0 ? N : ii) * cl.ds, v = s / 2.4;
        stationNormal(cl, ii, n);
        const ox = side * -cl.tz[ii], oz = side * cl.tx[ii];
        const a = stationPoint(cl, ii, side * hw, p);
        const va = g.vert(a.x, a.y + lift, a.z, n.x, n.y, n.z, 0, v, 1, 1, 1);
        const b = stationPoint(cl, ii, side * (hw + kw), p);
        const vb = g.vert(b.x, b.y + lift, b.z, n.x, n.y, n.z, 1, v, 1, 1, 1);
        const vb2 = g.vert(b.x, b.y + lift, b.z, ox, 0, oz, 1, v, 0.6, 0.6, 0.6);
        const vc = g.vert(b.x, b.y + lift - 0.16, b.z, ox, 0, oz, 1, v, 0.5, 0.5, 0.5);
        vs.push([va, vb, vb2, vc]);
      }
      g.quadN(vs[0][0], vs[0][1], vs[1][1], vs[1][0]);
      g.quadN(vs[0][2], vs[0][3], vs[1][3], vs[1][2]);
    }
  }
  for (const [st, g] of styles) { const mesh = new THREE.Mesh(g.build(), materialFor(st)); mesh.name = `kerb:${st}`; mesh.receiveShadow = true; meshes.push(mesh); }
  return meshes;
}

/**
 * Verge skirts: from the road / kerb edge outward to `skirt` metres, following the exact height blend used by query(),
 * plus a flare that dips under the terrain so the seam can never open.
 * @param {(surface:string,x:number,z:number,h:number,out:THREE.Color)=>THREE.Color} groundColour
 */
export function buildVerge(track, material, groundColour) {
  const m = track.model, cl = m.cl, N = cl.N, F = m.F, g = new Geo();
  const T = [0, 0.1, 0.24, 0.42, 0.62, 0.82, 1.0, 1.0], rows = T.length;
  const p = { x: 0, y: 0, z: 0 }, EDGES = ['grass', 'sand', 'road', 'void'];
  const uvS = 1 / (track.def.terrain?.uvTile ?? 8);
  for (const side of [-1, 1]) {
    const skirtArr = side < 0 ? F.skirtL : F.skirtR, edgeArr = side < 0 ? F.edgeL : F.edgeR, kerbArr = side < 0 ? F.kerbL : F.kerbR;
    const ids = new Int32Array((N + 1) * rows).fill(-1);
    for (let i = 0; i <= N; i++) {
      const ii = i % N, hw = cl.width[ii] / 2, kw = kerbArr[ii] ? m.kerbWidth : 0, skirt = skirtArr[ii];
      if (edgeArr[ii] === 3 || skirt <= 0) continue;
      const he = cl.y[ii] - side * (hw + kw) * cl.tanB[ii];
      for (let r = 0; r < rows; r++) {
        const flare = r === rows - 1, d = T[r] * skirt + (flare ? 1.6 : 0);
        const l = side * (hw + kw + d);
        stationPoint(cl, ii, l, p);
        const Ty = m._terrainAt(p.x, p.z);
        let h = m.vergeHeight(he, Ty, d, skirt);
        if (flare) h = Ty - 0.7;
        const surf = (m.terrainS && m.terrainS(p.x, p.z, h)) || EDGES[edgeArr[ii]];
        groundColour(surf, p.x, p.z, h, col);
        ids[i * rows + r] = g.vert(p.x, h + (r === 0 ? 0.0 : 0), p.z, 0, 1, 0, p.x * uvS, p.z * uvS, col.r, col.g, col.b);
      }
    }
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if ((F.gap[i] | F.gap[j]) || edgeArr[i] === 3 || edgeArr[j] === 3) continue;
      for (let r = 0; r < rows - 1; r++) {
        const a = ids[i * rows + r], b = ids[i * rows + r + 1], c = ids[(i + 1) * rows + r + 1], d = ids[(i + 1) * rows + r];
        if (a < 0 || b < 0 || c < 0 || d < 0) continue;
        side < 0 ? g.quadN(b, a, d, c) : g.quadN(a, b, c, d);
      }
    }
  }
  if (!g.vertexCount) return null;
  // smooth normals from the finished surface
  const geo = g.build(); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'verge'; mesh.receiveShadow = true;
  return mesh;
}

/**
 * Walls swept along flagged stretches. Styles come from def.walls[name] = { height, thickness, shape, colour, top, material, tile, profile }.
 * @param {(name:string, style:object)=>THREE.Material} materialFor
 */
export function buildWalls(track, materialFor) {
  const m = track.model, cl = m.cl, N = cl.N, F = m.F, meshes = [];
  const p = { x: 0, y: 0, z: 0 };
  const perStyle = new Map();
  const gap = m.wallGap;
  const profileFor = (st) => {
    const h = st.height, t = st.thickness, low = -0.35;
    if (st.profile) return st.profile;
    if (st.shape === 'plane') return [[t / 2, low], [t / 2, h]];
    if (st.shape === 'hedge') return [[0, low], [0.06, h * 0.7], [0.35, h], [t - 0.35, h], [t - 0.06, h * 0.7], [t, low]];
    return [[0, low], [0, h * 0.84], [0.1, h], [t - 0.1, h], [t, h * 0.84], [t, low]];
  };
  for (const side of [-1, 1]) {
    const flags = side < 0 ? F.wallL : F.wallR;
    let i = 0;
    while (i < N) {
      const style = flags[i];
      const j0 = (i + 1) % N;
      if (!style || flags[j0] !== style || (F.gap[i] | F.gap[j0])) { i++; continue; }
      let e = i; while (e < N && flags[(e + 1) % N] === style && !(F.gap[e] | F.gap[(e + 1) % N]) && e - i < N - 1) e++;   // segments i..e
      const st = m.wallStyles[style - 1], prof = profileFor(st);
      let g = perStyle.get(style); if (!g) perStyle.set(style, g = new Geo());
      const tile = st.tile ?? 4, base = new THREE.Color(st.colour ?? 0xcccccc), top = new THREE.Color(st.top ?? st.colour ?? 0xcccccc);
      const rowIds = [];
      for (let a = i; a <= e + 1; a++) {
        const ii = a % N, hw = cl.width[ii] / 2, s = a * cl.ds;
        const ids = [];
        for (let k = 0; k < prof.length - 1; k++) {
          const [o0, u0] = prof[k], [o1, u1] = prof[k + 1];
          const dOut = o1 - o0, dUp = u1 - u0, nl = Math.hypot(dOut, dUp) || 1;
          // 2D normal of the profile segment (rotate direction by -90 degrees so that going up the inner face gives an inward-facing normal)
          const n2o = -dUp / nl, n2u = dOut / nl;
          const ox = side * -cl.tz[ii], oz = side * cl.tx[ii];
          const nx = ox * n2o, nz = oz * n2o, ny = n2u;
          const pair = [];
          for (const [o, u, vv] of [[o0, u0, (u0 - prof[0][1]) / (st.height - prof[0][1] || 1)], [o1, u1, (u1 - prof[0][1]) / (st.height - prof[0][1] || 1)]]) {
            const l = side * (hw + gap + o);
            stationPoint(cl, ii, l, p);
            const shade = 0.72 + 0.28 * Math.min(1, Math.max(0, (u + 0.35) / (st.height + 0.35)));
            const c = u >= st.height - 0.02 ? top : base;
            pair.push(g.vert(p.x, p.y + u, p.z, nx, ny, nz, s / tile, vv, c.r * shade, c.g * shade, c.b * shade));
          }
          ids.push(pair);
        }
        rowIds.push(ids);
      }
      for (let a = 0; a < rowIds.length - 1; a++) for (let k = 0; k < prof.length - 1; k++) {
        const A = rowIds[a][k], B = rowIds[a + 1][k];
        g.quadN(A[0], A[1], B[1], B[0]);
      }
      i = e + 1;
    }
  }
  for (const [style, g] of perStyle) {
    const st = m.wallStyles[style - 1];
    const mesh = new THREE.Mesh(g.build(), materialFor(st.name, st)); mesh.name = `wall:${st.name}`; mesh.receiveShadow = true; mesh.castShadow = st.shape !== 'plane';
    meshes.push(mesh);
  }
  return meshes;
}
