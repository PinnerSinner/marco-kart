// Track: implements the full Track interface of SPEC.md section 3 on top of RoadModel (numbers) and the visual builders.
// Construct through createTrack(id) in src/track/index.js, or directly with a def (see TRACKDEF.md).
import * as THREE from 'three';
import { CFG } from '../core/config.js';
import { loopDiff, wrapS } from '../core/util.js';
import { RoadModel } from './builders/RoadModel.js';
import { resolveS } from './builders/zones.js';
import { Animator } from './builders/Animator.js';
import { makeKit } from './builders/kit.js';
import { buildVisuals } from './builders/visuals.js';

const DEFAULT_ENV = {
  skyTop: 0x4aa8ff, skyBottom: 0xcfeaff, fogColor: 0xcfeaff, fogNear: 160, fogFar: 720,
  sunColor: 0xfff2d6, sunIntensity: 2.2, ambientColor: 0x9fc4ff, ambientIntensity: 0.9, skyKind: 'day',
};

const DEFAULT_WALL = { height: 1.2, thickness: 0.7, solid: true };

/**
 * A racetrack. See SPEC.md section 3 for the consumer contract and TRACKDEF.md for how to define one.
 */
export class Track {
  /**
   * @param {object} def track definition (see TRACKDEF.md)
   * @param {{ headless?: boolean }} [opts] headless: skip all meshes/textures (gameplay data + obstacles only), for fast simulations
   */
  constructor(def, opts = {}) {
    this.def = def;
    this.headless = !!opts.headless;
    this.id = def.id; this.name = def.name ?? def.id;
    this.lapCount = def.lapCount ?? CFG.defaultLaps;
    this.music = def.music ?? def.id;
    this.killY = def.killY ?? -40;
    this.group = new THREE.Group(); this.group.name = `track:${this.id}`;
    this.environment = { ...DEFAULT_ENV, ...(def.environment ?? {}) };
    const sd = this.environment.sunDir ?? [0.5, 1, 0.3];
    this.environment.sunDir = (sd.isVector3 ? sd.clone() : new THREE.Vector3(sd[0], sd[1], sd[2])).normalize();
    this.itemBoxes = []; this.obstacles = []; this.boostPads = []; this.jumpRamps = []; this.shortcuts = [];
    this.animator = new Animator();

    // ---- road model ---------------------------------------------------------------------------------------------
    const road = { width: 18, kerbWidth: 1.3, wallGap: 1.4, spacing: 2, ...(def.road ?? {}) };
    this.road = road;
    const wallNames = Object.keys(def.walls ?? {});
    const wallStyles = wallNames.map((name) => ({ ...DEFAULT_WALL, ...def.walls[name], name }));
    const kerbNames = Object.keys(def.kerbs ?? { default: {} });
    const terrain = def.terrain ?? {};
    this.model = new RoadModel({
      points: def.points, spacing: road.spacing, width: road.width, kerbWidth: road.kerbWidth, wallGap: road.wallGap,
      wallStyles, kerbNames, def, killY: this.killY, groundY: terrain.base ?? def.groundY ?? 0,
      voidEdges: def.terrain === false, terrainHeight: terrain.height ?? null, terrainSurface: terrain.surface ?? null, bounds: terrain.bounds ?? null,
    });
    const m = this.model;
    if (terrain.follow) m.followRoad(terrain.follow === true ? {} : terrain.follow);
    this.length = m.length;
    this.marks = m.cl.marks;
    this.wallNames = wallNames; this.kerbNames = kerbNames;
    this._s = { x: 0, y: 0, z: 0, tx: 0, tz: 1, slope: 0, width: 18, tanB: 0, kappa: 0, dx: 0, dz: 0 };
    this._v = new THREE.Vector3();
    this._q = { height: 0, normal: new THREE.Vector3(0, 1, 0), surface: 'road', onRoad: true, s: 0, lateral: 0, inVoid: false };

    // ---- gameplay data ------------------------------------------------------------------------------------------
    this._setupPlatforms(def);
    this._setupCheckpoints(def);
    this._setupBoostPads(def);
    this._setupItemBoxes(def);

    // ---- visuals + dressing --------------------------------------------------------------------------------------
    this.kit = makeKit(this, def);
    if (!this.headless) buildVisuals(this, this.kit);
    def.dress?.(this.kit);
    this.kit.finish();
    this._collectCullables();
    this.setQuality('high');
  }

  // ------------------------------------------------------------------ setup helpers
  /** Resolve a position given as metres or '@mark+offset'. */
  S(v) { return resolveS(v, this.marks, this.length); }

  _setupPlatforms(def) {
    const m = this.model;
    for (const r of def.ramps ?? []) {
      let { x, z, yaw } = r, probeY = 1e4;
      if (r.s !== undefined) {
        const sm = this.sample(this.S(r.s)), lat = r.lateral ?? 0;
        x = sm.pos.x + sm.right.x * lat; z = sm.pos.z + sm.right.z * lat;
        yaw = Math.atan2(sm.tangent.x, sm.tangent.z) + (r.yawOffset ?? 0);
        probeY = sm.pos.y - lat * Math.tan(sm.banking) + 0.5;        // pick the right layer on bridges / spirals / elevated void tracks
      }
      const q = this._v.set(x, probeY, z);
      const base = this.query(q, this._q).height;
      const rise0 = r.rise0 ?? 0, rise1 = r.rise1 ?? r.rise ?? 2.4;
      const spec = {
        x, z, yaw, length: r.length ?? 12, width: r.width ?? 10, y0: r.y0 ?? base + rise0, y1: r.y1 ?? base + rise1,
        curve: r.curve, lip: r.lip ?? (r.kind ?? 'ramp') === 'ramp', startBevel: r.startBevel, endBevel: r.endBevel, sideBevel: r.sideBevel,
        surface: r.surface ?? 'road', road: r.road ?? (r.surface ?? 'road') === 'road', kind: r.kind ?? 'ramp',
      };
      for (const k of Object.keys(spec)) if (spec[k] === undefined) delete spec[k];
      const pf = m.addPlatform(spec);
      pf.def = r; pf.material = r.material;
      if (pf.kind === 'ramp') this.jumpRamps.push({ x, z, yaw, length: pf.length, width: pf.width, height: pf.y1 - pf.y0, id: r.id ?? null });
    }
    for (const sc of def.shortcuts ?? []) this.shortcuts.push({ from: this.S(sc.from), to: this.S(sc.to), id: sc.id ?? null });
  }

  _setupCheckpoints(def) {
    let cps = def.checkpoints;
    if (!cps) { const n = def.checkpointCount ?? 8; cps = Array.from({ length: n }, (_, i) => (i * this.length) / n); }
    cps = cps.map((v) => this.S(v));
    cps[0] = 0;
    for (let i = 1; i < cps.length; i++) if (cps[i] <= cps[i - 1]) throw new Error(`Track ${this.id}: checkpoints must ascend (index ${i})`);
    if (cps.length < 6 || cps.length > 12) console.warn(`Track ${this.id}: ${cps.length} checkpoints (spec wants 6 to 12)`);
    this.checkpointS = cps;
  }

  _setupBoostPads(def) {
    const m = this.model;
    for (const b of def.boostPads ?? []) {
      const pad = { s: this.S(b.s), lateral: b.lateral ?? 0, length: b.length ?? 10, width: b.width ?? 6 };
      this.boostPads.push(pad);
      m.addPatch({ kind: 'boost', ...pad });
    }
    for (const p of def.patches ?? []) m.addPatch({ ...p, s: this.S(p.s) });
    m._indexPatches();
  }

  _setupItemBoxes(def) {
    const hover = CFG.itemBox.hoverHeight, p = new THREE.Vector3();
    for (const row of def.itemRows ?? []) {
      const n = row.count ?? 3, spacing = row.spacing ?? 4.6, s = this.S(row.s);
      for (let k = 0; k < n; k++) {
        const lat = (row.lateral ?? 0) + (k - (n - 1) / 2) * spacing;
        this.surfacePoint(s, lat, p);
        this.itemBoxes.push({ pos: new THREE.Vector3(p.x, p.y + hover, p.z), s, row: this.itemBoxes.length / n | 0 });
      }
    }
  }

  // ------------------------------------------------------------------ Track interface
  /**
   * Centreline sample. pos includes elevation; tangent follows the slope; right is the HORIZONTAL lateral axis
   * (positive lateral = pos + right * lateral in plan); up is the road-surface normal.
   * @param {number} s metres along the centreline (wraps)
   * @param {object} [out] reuse to avoid allocation
   * @returns {{pos:THREE.Vector3, tangent:THREE.Vector3, right:THREE.Vector3, up:THREE.Vector3, width:number, banking:number, s:number}}
   */
  sample(s, out = {}) {
    const E = this._s;
    this.model.cl.eval(s, E);
    (out.pos ??= new THREE.Vector3()).set(E.x, E.y, E.z);
    const inv = 1 / Math.sqrt(1 + E.slope * E.slope);
    (out.tangent ??= new THREE.Vector3()).set(E.tx * inv, E.slope * inv, E.tz * inv);
    (out.right ??= new THREE.Vector3()).set(-E.tz, 0, E.tx);
    const nx = -E.tanB * E.tz - E.slope * E.tx, nz = E.tanB * E.tx - E.slope * E.tz, ni = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
    (out.up ??= new THREE.Vector3()).set(nx * ni, ni, nz * ni);
    out.width = E.width; out.banking = Math.atan(E.tanB); out.s = wrapS(s, this.length);
    return out;
  }

  /**
   * Ground query. HOT PATH: allocation free when `out` is supplied.
   * @param {{x:number,y:number,z:number}} pos world position (y disambiguates bridges / spirals when no hint is given)
   * @param {object} [out] result object to fill (height, normal:Vector3, surface, onRoad, s, lateral, inVoid)
   * @param {number} [hintS] last known s of this caller (fast local search)
   */
  query(pos, out = {}, hintS) {
    const x = pos.x, y = pos.y, z = pos.z;
    out.normal ??= new THREE.Vector3(0, 1, 0);
    if (!(x === x && y === y && z === z) || Math.abs(x) > 1e7 || Math.abs(z) > 1e7) {
      out.height = this.killY; out.surface = 'void'; out.onRoad = false; out.s = 0; out.lateral = 0; out.inVoid = true; out.normal.set(0, 1, 0);
      return out;
    }
    const m = this.model, P = m._P;
    m.project(x, y, z, hintS, P);
    m.noteQuery(x, y, z);
    m.ground(x, y, z, P, out);
    return out;
  }

  /**
   * Wall / static collider overlap for a circle. Returns the penetration depth (0 = none); writes the horizontal unit
   * normal pointing back INTO the track (the direction to push the kart) into outNormal.
   * @param {{x:number,y:number,z:number}} pos @param {number} radius (m) @param {THREE.Vector3} outNormal
   */
  collideWalls(pos, radius, outNormal = this._v) {
    const x = pos.x, z = pos.z, y = pos.y;
    if (!(x === x && z === z && y === y)) return 0;
    return this.model.collide(x, y, z, radius, outNormal);
  }

  /** Start grid slot i (0..7): two staggered columns behind the line, i = 0 is pole (left column, front). */
  gridSlot(i) {
    const row = i >> 1, right = i & 1;
    const back = 7 + row * 7 + (right ? 3.5 : 0), lat = right ? 3.7 : -3.7;
    const pos = new THREE.Vector3();
    this.surfacePoint(-back, lat, pos);
    const sm = this.sample(-back, this._samp ??= {});
    return { pos, heading: Math.atan2(sm.tangent.x, sm.tangent.z) };
  }

  /** Safe road position at or behind s facing forward (skips gaps, ramps and hazards). */
  respawnAt(s, lateral = 0) {
    const m = this.model, q = this._q, v = this._v;
    let ss = wrapS(s, this.length);
    for (let k = 0; k < 40; k++, ss = wrapS(ss - 3, this.length)) {
      this.surfacePoint(ss, lateral, v);
      const i = Math.floor(ss / m.ds) % m.N, j = (i + 1) % m.N;
      if (m.F.gap[i] | m.F.gap[j]) continue;
      this.query(v, q);
      if (!q.onRoad || q.surface === 'oil' || q.surface === 'water') continue;
      if (m.platforms.some((p) => p.evaluate(v.x, v.z, q.height, m._tmp))) continue;
      break;
    }
    this.surfacePoint(ss, lateral, v);
    const sm = this.sample(ss, this._samp ??= {});
    return { pos: v.clone(), heading: Math.atan2(sm.tangent.x, sm.tangent.z) };
  }

  /** Closed loop of [x, z] points for the HUD minimap. */
  minimapOutline(n = 128) {
    const pts = [], v = this._v;
    for (let i = 0; i < n; i++) { this.surfacePoint((i / n) * this.length, 0, v); pts.push([v.x, v.z]); }
    return pts;
  }

  /** Advance animated scenery and moving obstacles; applies distance culling when a viewer is set. */
  update(dt, time) {
    this.animator.update(dt, time);
    if (this._viewer && this._cull.length) this._applyCulling();
  }

  /**
   * Optional: tell the track where the camera is so far-away detail chunks (crowds, small props) stop drawing.
   * Pass the camera's position Vector3 once (it is read on every update()) or null to draw everything.
   * @param {THREE.Vector3|null} pos
   */
  setViewer(pos) { this._viewer = pos; if (!pos) this._applyCulling(); }

  /**
   * Quality tier: 'low' hides 'medium'/'high' detail batches and halves cull distances; 'medium' hides 'high' detail.
   * @param {'low'|'medium'|'high'} q
   */
  setQuality(q) {
    this.quality = q; this._qRank = { low: 0, medium: 1, high: 2 }[q] ?? 2; this._qScale = [0.55, 0.8, 1][this._qRank];
    this._applyCulling();
  }

  _collectCullables() {
    this._cull = []; this._viewer = null; this.quality = 'high'; this._qRank = 2; this._qScale = 1;
    this.group.traverse((o) => {
      const c = o.userData?.cull; if (!c) return;
      const geo = o.geometry; if (!geo) return;
      if (o.isInstancedMesh) o.computeBoundingSphere(); else if (!geo.boundingSphere) geo.computeBoundingSphere();
      const bs = o.isInstancedMesh ? o.boundingSphere : geo.boundingSphere; if (!bs) return;
      this._cull.push({ mesh: o, cx: bs.center.x, cy: bs.center.y, cz: bs.center.z, rad: bs.radius, range: c.r, tier: { low: 0, medium: 1, high: 2 }[c.tier] ?? 0 });
    });
  }

  _applyCulling() {
    const v = this._viewer, rank = this._qRank, sc = this._qScale;
    for (const e of this._cull) {
      let vis = e.tier <= rank;
      if (vis && v && e.range) { const dx = v.x - e.cx, dy = v.y - e.cy, dz = v.z - e.cz; const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - e.rad; vis = d < e.range * sc; }
      e.mesh.visible = vis;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const mt of mats) { for (const k of ['map', 'normalMap', 'emissiveMap', 'alphaMap', 'roughnessMap', 'envMap']) mt[k]?.dispose?.(); mt.dispose?.(); }
    });
    this.group.clear();
    this.animator.clear();
  }

  // ------------------------------------------------------------------ extras (additive to the spec)
  /** Point ON the road surface at (s, lateral) including banking: pos = centre + right * lateral, y follows the bank. */
  surfacePoint(s, lateral, out) {
    const E = this._s;
    this.model.cl.eval(s, E);
    return out.set(E.x - E.tz * lateral, E.y - lateral * E.tanB, E.z + E.tx * lateral);
  }

  /** Signed curvature (1/m) at s; positive = the road turns to the RIGHT. */
  curvatureAt(s) { this.model.cl.eval(s, this._s); return this._s.kappa; }

  /** Road width (m) at s. */
  widthAt(s) { this.model.cl.eval(s, this._s); return this._s.width; }

  /** Ground height at a world XZ (uses query). */
  heightAt(x, z) { this._v.set(x, 1e4, z); return this.query(this._v, this._q).height; }

  /** Signed distance along the lap from a to b in (-length/2, length/2]. */
  sDiff(a, b) { return loopDiff(a, b, this.length); }

  /** Index of the checkpoint gate at or before s. */
  checkpointIndexAt(s) {
    const c = this.checkpointS; s = wrapS(s, this.length);
    let k = 0; for (let i = 0; i < c.length; i++) if (c[i] <= s) k = i;
    return k;
  }
}
