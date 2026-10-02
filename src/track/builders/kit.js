// The "kit" handed to a track def's dress(kit) hook: everything needed to dress a track, bundled and seeded.
// See TRACKDEF.md for the documented surface. Nothing here is specific to a particular track.
import * as THREE from 'three';
import { makeRng } from '../../core/util.js';
import { Geo } from './Geo.js';
import { StaticBatch, InstanceSet } from './batch.js';
import * as tex from './textures.js';
import { noise2, fbm2 } from './noise.js';
import { makePlacers } from './scatter.js';
import { makeObstacleHelpers } from './obstacles.js';
import { Paint } from './paint.js';
import { buildWater } from './water.js';
import { chevronSignGeo, buildGantry } from './props.js';
import { turtle } from './layout.js';
import { applyWind, applyHop } from './shaders.js';
import { buildSweep } from './sweep.js';

/**
 * @param {import('../Track.js').Track} track
 * @param {object} def
 */
export function makeKit(track, def) {
  const rng = makeRng(def.seed ?? 1);
  const headless = track.headless;
  const statics = new StaticBatch({ name: `${track.id}-static` });
  const batches = [statics], instanceSets = [], paints = [], waterUpdaters = [];
  const materials = new Map();
  const addToScene = (o) => { track.group.add(o); return o; };
  const animate = (fn) => track.animator.add(fn);

  const lit = (opts = {}, key) => {
    if (key && materials.has(key)) return materials.get(key);
    const { color = 0xffffff, ...rest } = opts;
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...rest });
    if (key) materials.set(key, m);
    return m;
  };

  const kit = {
    THREE, track, def, headless, rng, Geo, tex, noise: { noise2, fbm2 }, turtle,
    group: track.group,
    /** Resolve a lap position: metres or '@mark+offset'. */
    S: (v) => track.S(v),

    mat: {
      /** Standard (PBR-ish) material. `key` caches it. */
      lit,
      /** Standard material using vertex colours (the default for Geo-built props). */
      vertex: (opts = {}, key) => lit({ vertexColors: true, ...opts }, key),
      /** Unlit colour (signs, lamps). toneMapped:false keeps emissive-style brightness. */
      basic: (color, opts = {}) => new THREE.MeshBasicMaterial({ color, ...opts }),
      /** Bright glowing colour for neon (multiply colour above 1 for bloom). */
      glow: (color, intensity = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false }),
      /** Unlit vertex-coloured neon (edge rails, light strips, holograms). Vertex colours above 1.0 bloom. */
      glowVertex: (opts = {}) => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, ...opts }),
      /** Add a wind sway to a material; returns uniforms whose uTime the caller must advance (kit.windTick does it). */
      wind: (material, o) => { const u = applyWind(material, o); kit._wind.push(u); return u; },
      /** Add crowd-hop animation (uv.x phase, uv.y weight) to a material. */
      hop: (material, o) => { const u = applyHop(material, o); kit._wind.push(u); return u; },
    },
    _wind: [],

    place: makePlacers(track, rng),
    statics,

    /**
     * An additional static batch with its own culling: `cull` metres from the viewer (Track.setViewer) and a minimum
     * quality tier ('low' | 'medium' | 'high') for it to draw. Use for crowds, small props and other detail.
     */
    batch(name, opts = {}) { const b = new StaticBatch({ name: `${track.id}-${name}`, ...opts }); batches.push(b); return b; },

    /** Create an instanced prop set (chunked InstancedMesh). Call .add(x, y, z, {ry, s, colour}) then it builds automatically. */
    instances(geometry, material, opts) { const s = new InstanceSet(geometry, material, { name: `${track.id}-inst`, ...opts }); instanceSets.push(s); return s; },

    /** Add any object to the track group. */
    add: addToScene,
    /** Register a per-frame callback (dt, time). */
    animate,
    obstacles: makeObstacleHelpers(track, animate, addToScene),

    /**
     * A road-paint builder (markings, arrows, glowing strips). Shapes are authored in (s, lateral) space. Built in finish() with the
     * default paint material, or with `o.material` (e.g. kit.mat.glowVertex() for neon lines). `o.lift` = metres above the road.
     */
    paint(o = {}) { const p = new Paint(track, o); p.material = o.material ?? null; paints.push(p); return p; },

    /** Extrude a cross-section along the road: tunnels, tubes, canyon walls, arches, rails. See builders/sweep.js (SweepSpec). Returns the mesh (null when headless). */
    sweep(spec) { const m = buildSweep(track, spec); if (m) addToScene(m); return m; },

    props: { chevronSignGeo, gantry: (s, o) => addToScene(buildGantry(track, s, o)) },

    /** Water grid + animation. See builders/water.js. */
    water(spec) { const w = buildWater(track, spec); addToScene(w.mesh); waterUpdaters.push(w.update); return w; },

    /** Called by Track after dress(): builds batched meshes. */
    finish() {
      if (!headless) {
        for (const b of batches) b.build(track.group);
        for (const s of instanceSets) s.build(track.group);
        for (const p of paints) { const m = p.build(p.material ?? (kit._paintMaterial ??= lit({ vertexColors: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))); if (m) track.group.add(m); }
      }
      if (kit._wind.length) animate((dt, t) => { for (const u of kit._wind) u.uTime.value = t; });
      if (waterUpdaters.length) animate((dt, t) => { for (const fn of waterUpdaters) fn(dt, t); });
    },
  };
  return kit;
}
