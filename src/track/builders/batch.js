// StaticBatch (merge many props into few draw calls, chunked by map cell) and InstanceSet (InstancedMesh per cell).
// Chunking keeps frustum culling effective: only the cells in view are drawn.
import * as THREE from 'three';
import { Geo } from './Geo.js';

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _mat = new THREE.Matrix4(), _col = new THREE.Color();

export class StaticBatch {
  /**
   * @param {{ cell?: number, castShadow?: boolean, receiveShadow?: boolean, name?: string, cull?: number|null, quality?: 'low'|'medium'|'high' }} [o]
   *   cell = chunk size (m); cull = draw only within this many metres of the viewer (see Track.setViewer); quality = lowest tier that draws it
   */
  constructor({ cell = 220, castShadow = true, receiveShadow = true, name = 'static', cull = null, quality = 'low' } = {}) {
    this.cell = cell; this.castShadow = castShadow; this.receiveShadow = receiveShadow; this.name = name; this.cull = cull; this.quality = quality;
    this.buckets = new Map(); this.matIds = new Map();
  }

  /**
   * Geo accumulator for material `mat` in the chunk containing world (x, z). Draw primitives straight into it using
   * WORLD coordinates in the primitive options (o.x, o.y, o.z ...).
   * @param {THREE.Material} mat @param {number} x @param {number} z
   * @returns {Geo}
   */
  at(mat, x, z) {
    let id = this.matIds.get(mat); if (id === undefined) { id = this.matIds.size; this.matIds.set(mat, id); }
    const key = `${id}:${Math.floor(x / this.cell)}:${Math.floor(z / this.cell)}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, b = { mat, geo: new Geo() });
    return b.geo;
  }

  /** Merge a prebuilt Geo placed at (x, y, z) with yaw ry and uniform scale s. */
  addGeo(mat, geo, { x = 0, y = 0, z = 0, ry = 0, s } = {}) { this.at(mat, x, z).merge(geo, { x, y, z, ry, s }); }

  /** Create the meshes and add them to `group`. Returns the meshes. */
  build(group) {
    const meshes = [];
    for (const [key, b] of this.buckets) {
      if (!b.geo.vertexCount) continue;
      const mesh = new THREE.Mesh(b.geo.build(), b.mat);
      mesh.name = `${this.name}:${key}`; mesh.castShadow = this.castShadow; mesh.receiveShadow = this.receiveShadow;
      mesh.userData.cull = { r: this.cull, tier: this.quality };
      group.add(mesh); meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

export class InstanceSet {
  /**
   * @param {THREE.BufferGeometry|Geo} geometry prototype (a Geo is built once)
   * @param {THREE.Material} material
   * @param {{ cell?: number, castShadow?: boolean, receiveShadow?: boolean, name?: string, cull?: number|null, quality?: 'low'|'medium'|'high' }} [o]
   */
  constructor(geometry, material, { cell = 200, castShadow = true, receiveShadow = true, name = 'inst', cull = null, quality = 'low' } = {}) {
    this.geometry = geometry instanceof Geo ? geometry.build() : geometry;
    this.material = material; this.cell = cell; this.castShadow = castShadow; this.receiveShadow = receiveShadow; this.name = name; this.cull = cull; this.quality = quality;
    this.cells = new Map(); this.count = 0;
  }

  /**
   * Add one instance.
   * @param {number} x @param {number} y @param {number} z world position of the prototype's origin
   * @param {{ry?:number, rx?:number, rz?:number, s?:number, sx?:number, sy?:number, sz?:number, colour?:number|THREE.Color}} [o]
   */
  add(x, y, z, o = {}) {
    const key = `${Math.floor(x / this.cell)}:${Math.floor(z / this.cell)}`;
    let c = this.cells.get(key); if (!c) this.cells.set(key, c = []);
    const s = o.s ?? 1;
    _p.set(x, y, z); _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ'); _q.setFromEuler(_e);
    _s.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
    _mat.compose(_p, _q, _s);
    const colour = o.colour !== undefined ? _col.set(o.colour) : null;
    c.push({ m: _mat.toArray(), r: colour ? colour.r : 1, g: colour ? colour.g : 1, b: colour ? colour.b : 1, tinted: !!colour });
    this.count++;
  }

  /** Create the InstancedMeshes (one per occupied cell) and add them to `group`. Returns them. */
  build(group) {
    const out = [];
    for (const [key, list] of this.cells) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, list.length);
      const tinted = list.some((e) => e.tinted);
      list.forEach((e, i) => {
        mesh.setMatrixAt(i, _mat.fromArray(e.m));
        if (tinted) mesh.setColorAt(i, _col.setRGB(e.r, e.g, e.b));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = `${this.name}:${key}`; mesh.castShadow = this.castShadow; mesh.receiveShadow = this.receiveShadow;
      mesh.userData.cull = { r: this.cull, tier: this.quality };
      group.add(mesh); out.push(mesh);
    }
    this.cells.clear();
    return out;
  }
}
