// RoadModel: the numeric heart of a track. Owns the centreline stations, per-station zone flags, patches, platforms
// (ramps), static colliders and a spatial index, and answers the two hot-path questions:
//   project(x, y, z, hintS)  -> nearest centreline point (s, lateral) with Newton refinement on the smooth curve
//   ground(...)              -> height / normal / surface under a point (road, kerb, verge blend, terrain, ramps, void)
// Nothing in here allocates per call once constructed. No visuals, no three.js objects: fully unit-testable.
import { clamp, loopDiff, wrapS } from '../../core/util.js';
import { Centerline } from './Centerline.js';
import { buildStationFlags, EDGE_SURFACES } from './zones.js';
import { Platform } from './Platform.js';

const CELL = 20;                 // spatial grid cell size (m)
const smooth01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const ROAD_KINDS = new Set(['road', 'kerb', 'boost', 'oil', 'water']);

/** Scratch projection record (see RoadModel.project). */
function makeProj() {
  return { i: 0, f: 0, s: 0, lat: 0, x: 0, y: 0, z: 0, tx: 0, tz: 1, slope: 0, width: 18, tanB: 0, kappa: 0, dx: 0, dz: 0, d2: 0 };
}

export class RoadModel {
  /**
   * @param {object} spec normalised model spec (built by Track from the def)
   * @param {Array} spec.points control points
   * @param {number} spec.spacing station spacing (m)
   * @param {number} spec.width default road width (m)
   * @param {number} spec.kerbWidth kerb strip width (m)
   * @param {number} spec.wallGap gap between road edge and wall face (m)
   * @param {Array<{name:string,height:number,solid:boolean}>} spec.wallStyles
   * @param {string[]} spec.kerbNames
   * @param {object} spec.def raw def (zones, defaults, patches ...)
   * @param {(x:number,z:number)=>number} [spec.terrainHeight] ground height away from the road
   * @param {(x:number,z:number,h:number)=>string|null} [spec.terrainSurface] surface override away from the road
   * @param {number} spec.groundY constant ground level when there is no terrainHeight
   * @param {number} spec.killY
   * @param {number[]} [spec.bounds] [minX, minZ, maxX, maxZ]: outside = void
   * @param {boolean} [spec.voidEdges] terrain-less track: everything beside the road is void unless a zone says otherwise
   */
  constructor(spec) {
    this.spec = spec;
    const cl = this.cl = new Centerline(spec.points, { spacing: spec.spacing, width: spec.width });
    this.N = cl.N; this.ds = cl.ds; this.length = cl.length;
    this.kerbWidth = spec.kerbWidth; this.wallGap = spec.wallGap; this.killY = spec.killY;
    this.wallStyles = spec.wallStyles;
    this.wallSolid = Uint8Array.from([0, ...spec.wallStyles.map((w) => (w.solid ? 1 : 0))]);
    this.wallHeight = Float32Array.from([0, ...spec.wallStyles.map((w) => w.height)]);
    this.F = buildStationFlags(cl, spec.def, spec.wallStyles.map((w) => w.name), spec.kerbNames, !!spec.voidEdges);
    this.groundY = spec.groundY;
    this.terrainH = spec.terrainHeight ?? null;
    this.terrainS = spec.terrainSurface ?? null;
    this.platforms = [];
    this.colliders = [];
    this.layered = false;
    this._P = makeProj(); this._Pw = makeProj(); this._E = makeProj();
    this._cache = { x: NaN, y: NaN, z: NaN };
    this._tmp = { h: 0, nx: 0, ny: 1, nz: 0, top: false };
    this._buildGrid();
    this._buildPatches();
    this._buildBounds(spec.bounds);
    this._detectLayers();
    this._hwMax = cl.width.reduce((m, w) => Math.max(m, w), 0) / 2 + this.kerbWidth + 0.5;
    this.hill = null;
  }

  // ------------------------------------------------------------------ construction helpers
  _buildGrid() {
    const { x, z } = this.cl, N = this.N;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) { minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]); minZ = Math.min(minZ, z[i]); maxZ = Math.max(maxZ, z[i]); }
    this.gx0 = minX - CELL; this.gz0 = minZ - CELL;
    this.gnx = Math.ceil((maxX - minX) / CELL) + 3; this.gnz = Math.ceil((maxZ - minZ) / CELL) + 3;
    const cells = this.gnx * this.gnz, count = new Int32Array(cells + 1);
    const cellOf = (i) => Math.floor((x[i] - this.gx0) / CELL) + this.gnx * Math.floor((z[i] - this.gz0) / CELL);
    for (let i = 0; i < N; i++) count[cellOf(i) + 1]++;
    for (let c = 0; c < cells; c++) count[c + 1] += count[c];
    this.cellStart = count; this.cellItems = new Int32Array(N);
    const fill = count.slice(0, cells);
    for (let i = 0; i < N; i++) this.cellItems[fill[cellOf(i)]++] = i;
    this.bbox = { minX, minZ, maxX, maxZ };
  }

  _buildBounds(b) {
    const pad = 420, bb = this.bbox;
    this.bounds = b ?? [bb.minX - pad, bb.minZ - pad, bb.maxX + pad, bb.maxZ + pad];
  }

  _buildPatches() {
    /** patch kinds: boost | oil | water | sand | grass. Stored in (s, lateral) space so they follow the road. */
    this.patches = [];
    this._indexPatches();
  }

  /**
   * Add a surface patch. Rectangle: { kind, s, lateral, length, width } (centre + full extents along/across the road).
   * Ellipse: { kind, s, lateral, rs, rl } (radii along/across). Call indexPatches() after a batch (Track does this).
   */
  addPatch(p) {
    const q = { kind: p.kind, sc: p.s, lc: p.lateral ?? 0, ellipse: p.rs !== undefined };
    if (q.ellipse) { q.hs = p.rs; q.hl = p.rl ?? p.rs; } else { q.hs = (p.length ?? 8) / 2; q.hl = (p.width ?? 6) / 2; }
    this.patches.push(q);
    return q;
  }

  _indexPatches() {
    const N = this.N, ds = this.ds, lists = Array.from({ length: N }, () => []);
    this.patches.forEach((p, k) => {
      const i0 = Math.floor((p.sc - p.hs) / ds) - 1, i1 = Math.ceil((p.sc + p.hs) / ds) + 1;
      for (let i = i0; i <= i1; i++) lists[((i % N) + N) % N].push(k);
    });
    this.patchStart = new Int32Array(N + 1);
    let total = 0; for (let i = 0; i < N; i++) { this.patchStart[i] = total; total += lists[i].length; }
    this.patchStart[N] = total;
    this.patchItems = new Int32Array(total);
    for (let i = 0; i < N; i++) lists[i].forEach((k, j) => { this.patchItems[this.patchStart[i] + j] = k; });
  }

  /** Register a ramp / pad. `spec` as Platform; y0 / y1 are absolute heights. Returns the Platform. */
  addPlatform(spec) {
    const p = spec instanceof Platform ? spec : new Platform(spec);
    this.platforms.push(p);
    return p;
  }

  /** Register a static circular collider (lamp post, kiosk, tower base...). y0 / y1 = height band it blocks (default: everything). */
  addCollider(x, z, r, y0 = -1e9, y1 = 1e9) {
    this.colliders.push({ x, z, r, y0, y1, bx: NaN, bz: NaN });
    this._colGrid = null;
  }

  /** Register a static capsule collider: the segment (ax, az)-(bx, bz) thickened by radius r (building fronts, fences, rack rows). */
  addCapsule(ax, az, bx, bz, r, y0 = -1e9, y1 = 1e9) {
    this.colliders.push({ x: ax, z: az, bx, bz, r, y0, y1 });
    this._colGrid = null;
  }

  _buildColliderGrid() {
    const S = 32, g = new Map();
    for (const c of this.colliders) {
      const ex = c.bx === c.bx ? c.bx : c.x, ez = c.bx === c.bx ? c.bz : c.z;
      const cx0 = Math.floor((Math.min(c.x, ex) - c.r - 1.5) / S), cx1 = Math.floor((Math.max(c.x, ex) + c.r + 1.5) / S);
      const cz0 = Math.floor((Math.min(c.z, ez) - c.r - 1.5) / S), cz1 = Math.floor((Math.max(c.z, ez) + c.r + 1.5) / S);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const key = cx * 100003 + cz; let l = g.get(key); if (!l) g.set(key, l = []); l.push(c);
      }
    }
    this._colGrid = g; this._colS = S;
  }

  _detectLayers() {
    const N = this.N, cl = this.cl;
    for (let i = 0; i < N && !this.layered; i += 2) {
      const cx = Math.floor((cl.x[i] - this.gx0) / CELL), cz = Math.floor((cl.z[i] - this.gz0) / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const xx = cx + ox, zz = cz + oz;
        if (xx < 0 || zz < 0 || xx >= this.gnx || zz >= this.gnz) continue;
        const c = xx + zz * this.gnx;
        for (let p = this.cellStart[c]; p < this.cellStart[c + 1]; p++) {
          const k = this.cellItems[p];
          if (Math.abs(loopDiff(i, k, N)) * this.ds < 50) continue;
          if (Math.hypot(cl.x[i] - cl.x[k], cl.z[i] - cl.z[k]) < (cl.width[i] + cl.width[k]) / 2 + 6 && Math.abs(cl.y[i] - cl.y[k]) > 1.5) this.layered = true;
        }
      }
    }
  }

  // ------------------------------------------------------------------ projection
  _dist2(i, x, z) { const dx = x - this.cl.x[i], dz = z - this.cl.z[i]; return dx * dx + dz * dz; }

  /**
   * Vertical + horizontal cost of a station for layered (bridge / spiral / crossing) roads. Horizontally a point ON the road strip
   * costs only its distance along the road, so a point over the outer part of an upper deck is not stolen by a lower road that
   * merely passes closer to the upper road's centre line.
   */
  _layerCost(i, x, y, z) {
    const cl = this.cl, dx = x - cl.x[i], dz = z - cl.z[i];
    const along = dx * cl.tx[i] + dz * cl.tz[i], lat = -dx * cl.tz[i] + dz * cl.tx[i];
    const dyv = y - (cl.y[i] - lat * cl.tanB[i]);
    const pen = dyv < -1.5 ? 900 + dyv * dyv * 4 : dyv > 2.5 ? (dyv - 2.5) * (dyv - 2.5) * 4 : 0;
    const over = (lat < 0 ? -lat : lat) - cl.width[i] * 0.5, lo = over > 0 ? over : 0;
    return along * along + lo * lo + 0.02 * lat * lat + 0.3 * dyv * dyv + pen;
  }

  _nearestGrid(x, y, z) {
    const cl = this.cl, layered = this.layered, gnx = this.gnx, gnz = this.gnz;
    const cx = Math.floor((x - this.gx0) / CELL), cz = Math.floor((z - this.gz0) / CELL);
    let best = Infinity, bi = -1;
    for (let r = 1; r <= 7; r++) {
      const x0 = cx - r, x1 = cx + r, z0 = cz - r, z1 = cz + r;
      for (let zz = z0; zz <= z1; zz++) {
        if (zz < 0 || zz >= gnz) continue;
        const edgeRow = zz === z0 || zz === z1, step = edgeRow || r === 1 ? 1 : x1 - x0;
        for (let xx = x0; xx <= x1; xx += step) {
          if (xx < 0 || xx >= gnx) continue;
          const c = xx + zz * gnx;
          for (let p = this.cellStart[c], e = this.cellStart[c + 1]; p < e; p++) {
            const k = this.cellItems[p];
            let d;
            if (layered) d = this._layerCost(k, x, y, z);
            else { const dx = x - cl.x[k], dz = z - cl.z[k]; d = dx * dx + dz * dz; }
            if (d < best) { best = d; bi = k; }
          }
        }
      }
      const reach = layered ? r * CELL - this._hwMax : r * CELL;      // layered cost ignores the lateral distance inside the road strip
      if (bi >= 0 && reach > 0 && best <= reach * reach) break;
    }
    if (bi < 0) {                       // far away from everything: coarse brute force
      for (let k = 0; k < this.N; k += 3) { const d = this._dist2(k, x, z); if (d < best) { best = d; bi = k; } }
    }
    this._bd = best;
    return bi;
  }

  _cost(k, x, y, z) { return this.layered ? this._layerCost(k, x, y, z) : this._dist2(k, x, z); }

  _walk(i0, x, y, z) {
    const N = this.N;
    let i = i0, d = this._cost(i, x, y, z);
    for (let n = 0; n < 24; n++) {
      const a = i + 1 === N ? 0 : i + 1, b = i === 0 ? N - 1 : i - 1;
      const da = this._cost(a, x, y, z), db = this._cost(b, x, y, z);
      if (da < d && da <= db) { i = a; d = da; } else if (db < d) { i = b; d = db; } else break;
    }
    this._bd = d;
    return i;
  }

  /**
   * Project a world point onto the centreline. Fills P with the segment index i, fraction f, arc length s, lateral,
   * and the interpolated centre data (x, y, z, tx, tz, slope, width, tanB, kappa).
   * @param {number} x @param {number} y @param {number} z world point
   * @param {number|undefined} hintS last known s of the caller (fast local search; needed to disambiguate overlaps)
   * @param {object} P output record
   */
  project(x, y, z, hintS, P) {
    const cl = this.cl, N = this.N, ds = this.ds;
    let j;
    if (hintS !== undefined && hintS === hintS) {
      j = this._walk(Math.floor(wrapS(hintS, this.length) / ds + 0.5) % N, x, y, z);
      // Only trust the local answer while on (or right next to) its own road; otherwise something else may be nearer.
      const dx = x - cl.x[j], dz = z - cl.z[j];
      const latJ = Math.abs(-dx * cl.tz[j] + dz * cl.tx[j]);
      if (latJ > cl.width[j] * 0.5 + 1.5 && !this.layered) {
        const bd = this._bd, g = this._nearestGrid(x, y, z);
        if (this._bd < bd - 1e-3) j = g; else this._bd = bd;
      }
    } else {
      j = this._nearestGrid(x, y, z);
    }
    // choose the segment on the side of the nearest station the point lies toward, then Newton-refine on the Hermite curve
    const dx0 = x - cl.x[j], dz0 = z - cl.z[j];
    const t = dx0 * cl.tx[j] + dz0 * cl.tz[j];
    let i, f;
    if (t >= 0) { i = j; f = Math.min(1, t / ds); } else { i = j === 0 ? N - 1 : j - 1; f = Math.max(0, 1 + t / ds); }
    const E = this._E;
    for (let it = 0; it < 3; it++) {
      cl.evalAt(i, f, E);
      const ex = x - E.x, ez = z - E.z;
      const g = ex * E.tx + ez * E.tz, lat = -ex * E.tz + ez * E.tx;
      let den = 1 - lat * E.kappa; if (den < 0.25) den = 0.25;
      f += g / (ds * den);
      if (f < 0) { i = i === 0 ? N - 1 : i - 1; f += 1; } else if (f >= 1) { i = i + 1 === N ? 0 : i + 1; f -= 1; }
      if (f < -0.5 || f > 1.5) f = clamp(f, 0, 1);
    }
    cl.evalAt(i, f, P);
    const ex = x - P.x, ez = z - P.z;
    P.lat = -ex * P.tz + ez * P.tx;
    P.i = i; P.f = f; P.s = wrapS((i + f) * ds, this.length);
    return P;
  }

  // ------------------------------------------------------------------ ground
  /**
   * Raise the terrain around the road so elevated road sections sit on natural embankments instead of pillars:
   * terrain >= road height - slope * distance. Rasterised once (cell metres), looked up bilinearly afterwards.
   * @param {{ slope?: number, reach?: number, cell?: number }} o slope = rise per metre (0.16 ~ 9 degrees), reach = max distance (m)
   */
  followRoad({ slope = 0.16, reach = 110, cell = 5 } = {}) {
    const cl = this.cl, bb = this.bbox, x0 = bb.minX - reach, z0 = bb.minZ - reach;
    const nx = Math.ceil((bb.maxX - bb.minX + 2 * reach) / cell) + 1, nz = Math.ceil((bb.maxZ - bb.minZ + 2 * reach) / cell) + 1;
    const data = new Float32Array(nx * nz).fill(-1e3), R = Math.ceil(reach / cell);
    for (let k = 0; k < this.N; k++) {
      const hw = cl.width[k] / 2 + this.kerbWidth, cx = Math.round((cl.x[k] - x0) / cell), cz = Math.round((cl.z[k] - z0) / cell);
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const ix = cx + dx, iz = cz + dz; if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
        const d = Math.hypot(x0 + ix * cell - cl.x[k], z0 + iz * cell - cl.z[k]);
        const h = cl.y[k] - slope * Math.max(0, d - hw);
        if (h > data[iz * nx + ix]) data[iz * nx + ix] = h;
      }
    }
    this.hill = { x0, z0, cell, nx, nz, data };
  }

  _hillAt(x, z) {
    const H = this.hill, fx = (x - H.x0) / H.cell, fz = (z - H.z0) / H.cell;
    if (fx < 0 || fz < 0 || fx >= H.nx - 1 || fz >= H.nz - 1) return -1e3;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, d = H.data, i0 = iz * H.nx + ix;
    const a = d[i0], b = d[i0 + 1], c = d[i0 + H.nx], e = d[i0 + H.nx + 1];
    if (a < -900 || b < -900 || c < -900 || e < -900) return Math.max(a, b, c, e);
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + e) * tx * tz;
  }

  _terrainAt(x, z) {
    const base = this.terrainH ? this.terrainH(x, z) : this.groundY;
    if (!this.hill) return base;
    const h = this._hillAt(x, z);
    return h > base ? h : base;
  }

  /** Height of the verge/skirt profile at (x, z) given projection data (used by query and by the mesh builder). */
  vergeHeight(he, terrainY, d, skirt) {
    if (skirt <= 0) return terrainY;
    const w = smooth01(d / skirt);
    return he + (terrainY - he) * w;
  }

  /**
   * Full ground evaluation for a projected point. out: { height, normal:{x,y,z}, surface, onRoad, s, lateral, inVoid }.
   * @param {number} x @param {number} y @param {number} z world point
   * @param {object} P projection from project()
   * @param {object} out
   * @param {boolean} [noPlatforms] ignore ramps / pads (used to build the terrain under them)
   */
  ground(x, y, z, P, out, noPlatforms = false) {
    const F = this.F, N = this.N, i = P.i, j = i + 1 === N ? 0 : i + 1;
    const lat = P.lat, a = lat < 0 ? -lat : lat, right = lat >= 0, sgn = right ? 1 : -1;
    const hw = P.width * 0.5;
    const nrm = out.normal;
    out.s = P.s; out.lateral = lat; out.inVoid = false; out.onRoad = false;
    this.voidReason = null;
    let onRoadBase = false, hRaw = 0, isVoid = false, surface = 'grass';

    const b = this.bounds;
    if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) {
      isVoid = true; this.voidReason = 'bounds';
    } else if (F.gap[i] | F.gap[j]) {
      isVoid = true; this.voidReason = 'gap';
    } else {
      const kerbArr = right ? F.kerbR : F.kerbL;
      const kw = kerbArr[i] && kerbArr[j] ? this.kerbWidth : 0;
      if (a <= hw + kw) {
        hRaw = P.y - lat * P.tanB;
        onRoadBase = true;
        surface = a <= hw ? 'road' : 'kerb';
        if (a <= hw) {
          const ps = this.patchStart;
          for (let p = ps[i], e = ps[i + 1]; p < e; p++) {
            const pt = this.patches[this.patchItems[p]];
            const ds_ = loopDiff(pt.sc, P.s, this.length), dl = lat - pt.lc;
            const inside = pt.ellipse ? (ds_ * ds_) / (pt.hs * pt.hs) + (dl * dl) / (pt.hl * pt.hl) <= 1 : (ds_ < 0 ? -ds_ : ds_) <= pt.hs && (dl < 0 ? -dl : dl) <= pt.hl;
            if (inside) { surface = pt.kind; break; }
          }
        }
        const tB = P.tanB, tx = P.tx, tz = P.tz;
        // Off the centreline the surface also rises/falls with the change of bank along the road (twist), so the normal must include it.
        const sl = P.slope - lat * (this.cl.tanB[j] - this.cl.tanB[i]) / this.ds;
        let nx = -tB * tz - sl * tx, nz = tB * tx - sl * tz;
        const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
        nrm.x = nx * inv; nrm.y = inv; nrm.z = nz * inv;
      } else {
        const edge = (right ? F.edgeR : F.edgeL)[i];
        if (edge === 3) {
          isVoid = true; this.voidReason = 'edge';
        } else {
          const skirt = (right ? F.skirtR : F.skirtL)[i];
          const d = a - hw - kw;
          const he = P.y - sgn * (hw + kw) * P.tanB;
          const T = this._terrainAt(x, z);
          hRaw = this.vergeHeight(he, T, d, skirt);
          const e = 0.6, rx = -P.tz, rz = P.tx;
          let gx, gz;
          if (skirt <= 0 || d >= skirt) {
            const tx1 = this._terrainAt(x + e, z), tz1 = this._terrainAt(x, z + e);
            gx = (tx1 - T) / e; gz = (tz1 - T) / e;
          } else {
            const xa = x + sgn * rx * e, za = z + sgn * rz * e, xb = x - sgn * rx * e, zb = z - sgn * rz * e;
            const ha = this.vergeHeight(he, this._terrainAt(xa, za), d + e, skirt), hb = this.vergeHeight(he, this._terrainAt(xb, zb), Math.max(0, d - e), skirt);
            const dLat = sgn * (ha - hb) / (2 * e);
            const w = smooth01(d / skirt);
            const dS = P.slope * (1 - w) + w * (this._terrainAt(x + P.tx * e, z + P.tz * e) - T) / e;
            gx = dLat * rx + dS * P.tx; gz = dLat * rz + dS * P.tz;
          }
          const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
          nrm.x = -gx * inv; nrm.y = inv; nrm.z = -gz * inv;
          surface = (this.terrainS && this.terrainS(x, z, hRaw)) || EDGE_SURFACES[edge];
          if (surface === 'void') { isVoid = true; this.voidReason = 'terrain'; }
        }
      }
    }

    if (isVoid) {
      hRaw = this.killY; surface = 'void'; onRoadBase = false;
      nrm.x = 0; nrm.y = 1; nrm.z = 0;
    }

    // platforms (ramps, pads) override the base surface inside their footprint
    if (this.platforms.length && !noPlatforms) {
      const tmp = this._tmp;
      for (let k = 0; k < this.platforms.length; k++) {
        const pf = this.platforms[k];
        if (pf.enabled === false || !pf.evaluate(x, z, isVoid ? pf.y0 : hRaw, tmp)) continue;   // `enabled` (default undefined = on): dressing can switch a deck off (glitch tiles)
        if (isVoid && !tmp.top) continue;
        hRaw = tmp.h; nrm.x = tmp.nx; nrm.y = tmp.ny; nrm.z = tmp.nz;
        if (tmp.top) { surface = pf.surface; onRoadBase = pf.road; isVoid = false; }
      }
    }
    out.height = hRaw; out.surface = surface; out.inVoid = isVoid; out.onRoad = onRoadBase && ROAD_KINDS.has(surface);
    return out;
  }

  // ------------------------------------------------------------------ walls + colliders
  /**
   * Wall / collider overlap for a circle of `radius` at (x, y, z). Returns penetration depth (0 = none) and writes the
   * horizontal unit push direction (back into the track) into outNormal {x, y, z}.
   */
  collide(x, y, z, radius, outNormal) {
    let P = this._P;
    const c = this._cache;
    if (!(c.x === x && c.y === y && c.z === z)) P = this.project(x, y, z, undefined, this._Pw);
    const F = this.F, N = this.N, i = P.i, j = i + 1 === N ? 0 : i + 1;
    let best = 0;
    const lat = P.lat, a = lat < 0 ? -lat : lat, right = lat >= 0, sgn = right ? 1 : -1;
    const wl = right ? F.wallR : F.wallL;
    const style = wl[i];
    if (style && wl[j] === style && this.wallSolid[style] && !(F.gap[i] | F.gap[j])) {
      const W = P.width * 0.5 + this.wallGap;
      const depth = a + radius - W;
      if (depth > 0 && a < W + 2.4) {
        const baseY = P.y - sgn * W * P.tanB;
        if (y <= baseY + this.wallHeight[style] + 0.35) {
          best = depth;
          outNormal.x = sgn * P.tz; outNormal.y = 0; outNormal.z = -sgn * P.tx;   // -sgn * right, right = (-tz, 0, tx)
        }
      }
    }
    if (this.colliders.length) {
      if (!this._colGrid) this._buildColliderGrid();
      const S = this._colS, l = this._colGrid.get(Math.floor(x / S) * 100003 + Math.floor(z / S));
      if (l) for (let k = 0; k < l.length; k++) {
        const co = l[k];
        if (y < co.y0 || y > co.y1) continue;
        let px = co.x, pz = co.z;
        if (co.bx === co.bx) {                                    // capsule: nearest point on the segment
          const ex = co.bx - co.x, ez = co.bz - co.z, l2 = ex * ex + ez * ez;
          const u = l2 > 1e-9 ? Math.min(1, Math.max(0, ((x - co.x) * ex + (z - co.z) * ez) / l2)) : 0;
          px = co.x + ex * u; pz = co.z + ez * u;
        }
        const dx = x - px, dz = z - pz, rr = co.r + radius, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-6, depth = rr - d;
          if (depth > best) { best = depth; outNormal.x = dx / d; outNormal.y = 0; outNormal.z = dz / d; }
        }
      }
    }
    return best;
  }

  /** Mark the projection cache so a following collide() at the same point reuses it. */
  noteQuery(x, y, z) { const c = this._cache; c.x = x; c.y = y; c.z = z; }
}
