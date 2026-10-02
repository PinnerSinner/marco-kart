// Caricature stickers on Marco's own kart: a die-cut sticker on each door panel and a bumper sticker at the back. The spots are found by
// ray casting against the kart body (so every kart shape gets its stickers on a flat bit of paint), then thin textured planes are attached to
// the kart's model group. Without art, or with 'Caricature art' set to Off, nothing is added.
import * as THREE from 'three';
import { Assets } from '../core/assets.js';
import { artEntries, artFor } from './caricature.js';

const _ray = new THREE.Raycaster();
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const _nm = new THREE.Matrix3(), _m4 = new THREE.Matrix4();

/** First hit of a ray on the body: { point, normal, dist } in the body's local space, or null. */
function hit(body, ox, oy, oz, dx, dy, dz) {
  _ray.set(_o.set(ox, oy, oz), _d.set(dx, dy, dz).normalize());
  _ray.far = 12;
  const h = _ray.intersectObject(body, false)[0];
  if (!h || !h.face) return null;
  _nm.getNormalMatrix(body.matrixWorld);
  const n = h.face.normal.clone().applyMatrix3(_nm).normalize();
  return { point: h.point.clone(), normal: n, dist: h.distance };
}

/**
 * Flat spots on a kart body for stickers.
 * @param {THREE.Mesh} body the kart's paint mesh (local space of its model group)
 * @returns {{side: {point:THREE.Vector3, normal:THREE.Vector3}|null, sideL: {point:THREE.Vector3, normal:THREE.Vector3}|null, rear: {point:THREE.Vector3, normal:THREE.Vector3}|null}}
 */
export function findKartSpots(bodyMesh) {
  // cast in the kart's own space: a stand-in mesh carrying only the body's local transform, so it does not matter where the kart is in the world
  const body = new THREE.Mesh(bodyMesh.geometry, bodyMesh.material);
  body.matrix.copy(bodyMesh.matrix); body.matrixWorld.copy(bodyMesh.matrix);
  const flat = (cast, axis, sign, reach = 0.16) => {
    const h = cast(0, 0);
    if (!h || h.normal.getComponent(axis) * sign < 0.8) return null;
    for (const [a, b] of [[reach, 0], [-reach, 0], [0, reach * 0.75], [0, -reach * 0.75]]) {
      const k = cast(a, b);
      if (!k || Math.abs(k.dist - h.dist) > 0.07 || k.normal.getComponent(axis) * sign < 0.7) return null;
    }
    return h;
  };
  const side = (sx) => {
    for (const z of [0.1, -0.15, 0.35, -0.4, 0.6, -0.65, 0.85, -0.9, 1.1, -1.15]) for (const y of [0.7, 0.58, 0.82, 0.46, 0.95]) {
      const h = flat((dz, dy) => hit(body, sx * 4, y + dy, z + dz, -sx, 0, 0), 0, sx, 0.12);
      if (h) return h;
    }
    return null;
  };
  const rear = () => {
    for (const x of [0, 0.3, -0.3, 0.55, -0.55, 0.8, -0.8]) for (const y of [0.62, 0.74, 0.5, 0.86, 1.0]) {
      const h = flat((dx, dy) => hit(body, x + dx, y + dy, -5, 0, 0, 1), 2, -1, 0.12);
      if (h) return h;
    }
    return null;
  };
  return { side: side(1), sideL: side(-1), rear: rear() };
}

/** Attach a flat textured plane at a spot, facing outward along the normal, picture upright. */
function attach(parent, spot, size, material, geo) {
  const mesh = new THREE.Mesh(geo, material);
  _n.copy(spot.normal);
  _r.set(0, 1, 0).cross(_n).normalize();
  _u.copy(_n).cross(_r).normalize();
  _m4.makeBasis(_r, _u, _n);
  mesh.quaternion.setFromRotationMatrix(_m4);
  mesh.position.copy(spot.point).addScaledVector(_n, 0.012);
  mesh.scale.set(size, size, 1);
  mesh.renderOrder = 1; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.userData.caricature = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Put caricature stickers on the karts driven by Marco.
 * @param {{model:{group:THREE.Group, body:THREE.Mesh}, racer?:{charId?:string}}[]} kartViews KartView-like objects
 * @param {{A?: typeof Assets, mode?: string, only?: (kv:object)=>boolean}} [o] mode 'off' hides them
 * @returns {{meshes: THREE.Mesh[], setMode: (m:string)=>void, dispose: ()=>void, ready: Promise<void>}}
 */
export function decorateKarts(kartViews, { A = Assets, mode = 'auto', only = (kv) => kv.racer?.charId === 'marco' } = {}) {
  const api = { meshes: [], setMode(m) { for (const k of api.meshes) k.visible = m !== 'off'; }, dispose() {}, ready: Promise.resolve() };
  const entries = artEntries(A);
  const stickers = artFor('sticker', { A, entries, minAspect: 0.7, maxAspect: 1.4, styles: ['sticker', 'stamp', 'mascot'] }).filter((e) => e.alpha);
  if (!stickers.length || typeof document === 'undefined') return api;
  const themed = (e) => (/desk|couch|marco/.test(e.name) ? 0 : 1);
  const ranked = stickers.map((e, i) => [themed(e), i, e]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
  const geo = new THREE.PlaneGeometry(1, 1);
  const mats = new Map(), texs = [];
  const matFor = (e) => {
    if (mats.has(e.key)) return mats.get(e.key);
    const m = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.2, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, visible: false });
    mats.set(e.key, m);
    (A.image?.(e.key) ?? Promise.resolve(null)).then((img) => {
      if (!img) return;
      const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
      texs.push(t); m.map = t; m.visible = true; m.needsUpdate = true;
    });
    return m;
  };
  let n = 0;
  for (const kv of kartViews ?? []) {
    if (!only(kv) || !kv.model?.body) continue;
    const spots = findKartSpots(kv.model.body);
    const parent = kv.model.group;
    const a = ranked[n % ranked.length], b = ranked[(n + 1) % ranked.length], c = ranked[(n + 2) % ranked.length];
    if (spots.side) api.meshes.push(attach(parent, spots.side, 0.62, matFor(a), geo));
    if (spots.sideL) api.meshes.push(attach(parent, spots.sideL, 0.62, matFor(b), geo));
    if (spots.rear && ['cruiser', 'hauler'].includes(kv.model.kartId)) api.meshes.push(attach(parent, spots.rear, 0.5, matFor(c), geo));   // the buggy and the rocket have nothing flat back there
    n++;
  }
  api.setMode(mode);
  api.dispose = () => { for (const k of api.meshes) k.removeFromParent(); api.meshes.length = 0; geo.dispose(); for (const m of mats.values()) m.dispose(); for (const t of texs) t.dispose(); };
  return api;
}
