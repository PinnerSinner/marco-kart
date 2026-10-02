// caricatureDecor: dresses a BUILT track with Marco's caricature art (comic / pop-art / graffiti pictures made from his own photos by
// tools/caricature_build.py, or anything dropped into assets/user/ as art_<name>.png|jpg) without touching any track file.
// Roadside billboards and murals, big-head bobblehead statues, graffiti strips and sticker clusters on walls, face stickers and a hopscotch of
// mini portraits on the tarmac, tiled kerb patterns, tiny faces on the chequered line and floating art cards over the Marcoverse void.
// The layout comes from the pure planner in caricatureDecorPlan.js. Draw calls stay low (about ten per track): every flat piece of art is
// packed into ONE atlas and merged into one mesh, the road decals are a second mesh, frames / posts / statue bodies are one vertex-coloured
// mesh, and the bobblehead heads are instanced. Without any art in the build it adds nothing at all.
import * as THREE from 'three';
import { Assets } from '../core/assets.js';
import { GeoBuilder } from './geo.js';
import { PROP_MODES, planDecor } from './photoDecorPlan.js';
import { planCaricature, CARI_PROFILES, CARI_MODES } from './caricatureDecorPlan.js';
import { artEntries } from './caricature.js';
import { packAtlas, subRect, createAtlas, QuadSet } from './artAtlas.js';

const Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qx = new THREE.Quaternion(), _qz = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _pos = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- statue geometry (local space: origin on the ground, faces +Z) ------------------------------------------------------------------

const SKIN = 0xe2aa82, HAIR = 0x3a2518, SUIT = 0xe63946;
const HEAD_R = [1.05, 1.18, 1.0];

/** Body + base for a bobblehead; the head floats above it (instanced and animated). @returns {{geo: THREE.BufferGeometry, headY: number}} */
function statueBody(base) {
  const b = new GeoBuilder();
  let y = 0;
  if (base === 'pavement') {                           // a Copacabana wave-pavement tile
    b.cyl(1.55, 1.7, 0.34, { p: [0, 0.17, 0], c: 0xf6f1e4 }, 28);
    b.torus(1.45, 0.07, { p: [0, 0.35, 0], r: [Math.PI / 2, 0, 0], c: 0x1b1b24 }, 6, 32);
    b.torus(1.05, 0.05, { p: [0, 0.35, 0], r: [Math.PI / 2, 0, 0], c: 0x1b1b24 }, 6, 28);
    y = 0.34;
  } else if (base === 'plinth') {                      // stone plinth with a brass plate
    b.box(2.5, 0.95, 2.5, { p: [0, 0.475, 0], c: 0xb2ad9c, c2: 0xcfc9b8 });
    b.box(2.85, 0.2, 2.85, { p: [0, 1.05, 0], c: 0xd9d4c4 });
    b.box(1.3, 0.3, 0.06, { p: [0, 0.55, 1.27], c: 0xd4a62a });
    y = 1.15;
  } else if (base === 'server') {                      // a squat server unit on top of a rack
    b.box(2.1, 0.9, 2.1, { p: [0, 0.45, 0], c: 0x232a3a });
    b.box(1.7, 0.08, 0.05, { p: [0, 0.66, 1.06], c: 0x22d3ee });
    for (let i = 0; i < 4; i++) b.box(0.12, 0.12, 0.05, { p: [-0.7 + i * 0.28, 0.3, 1.06], c: i % 2 ? 0x2ee08a : 0xffd166 });
    y = 0.9;
  } else {                                             // floating island
    b.cone(2.6, 3.4, { p: [0, -1.7, 0], r: [Math.PI, 0, 0], c: 0x3d3470, c2: 0x6a4fb5, axis: 'y' }, 9);
    b.cyl(2.75, 2.6, 0.4, { p: [0, 0.2, 0], c: 0x232a55 }, 20);
    b.torus(2.68, 0.08, { p: [0, 0.42, 0], r: [Math.PI / 2, 0, 0], c: 0xff2fb3, k: 1 }, 6, 36);
    y = 0.4;
  }
  for (const sx of [-1, 1]) {
    b.cyl(0.3, 0.34, 0.9, { p: [sx * 0.38, y + 0.45, 0], c: 0x2a3f8f });                    // legs
    b.box(0.58, 0.2, 0.85, { p: [sx * 0.38, y + 0.1, 0.14], c: 0x14161f });                  // shoes
    b.tube([sx * 0.72, y + 2.15, 0], [sx * 1.02, y + 1.3, 0.38], 0.2, { c: SUIT });           // arms
    b.sphere(0.25, { p: [sx * 1.04, y + 1.2, 0.42], c: SKIN }, 10, 8);                        // hands
  }
  b.cyl(0.62, 0.76, 1.5, { p: [0, y + 1.65, 0], c: SUIT, c2: 0xff6b6b }, 14);                 // torso
  b.box(0.12, 0.95, 0.04, { p: [0, y + 1.7, 0.7], c: 0x1d4ed8 });                             // lanyard
  b.box(0.3, 0.38, 0.04, { p: [0, y + 1.2, 0.74], c: 0xffffff });                             // badge
  b.cyl(0.24, 0.26, 0.45, { p: [0, y + 2.55, 0], c: SKIN }, 10);                              // neck
  return { geo: b.build(), headY: y + 2.55 + 0.75 };
}

let headCache = null;
/** Egg-shaped head (hair on top and at the back, skin elsewhere, two ears): vertex coloured, no UVs. */
function headGeometry() {
  if (headCache) return headCache;
  const sph = new THREE.SphereGeometry(1, 28, 20); sph.deleteAttribute('uv');
  const pos = sph.attributes.position, nrm = sph.attributes.normal, col = new Float32Array(pos.count * 3);
  const skin = new THREE.Color(SKIN), hair = new THREE.Color(HAIR), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    c.copy(skin).lerp(hair, Math.max(sstep(0.22, 0.6, y), sstep(0.05, -0.45, z)));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    nrm.setXYZ(i, x / HEAD_R[0], y / HEAD_R[1], z / HEAD_R[2]);
    pos.setXYZ(i, x * HEAD_R[0], y * HEAD_R[1], z * HEAD_R[2]);
  }
  const n = new THREE.Vector3();
  for (let i = 0; i < nrm.count; i++) { n.fromBufferAttribute(nrm, i).normalize(); nrm.setXYZ(i, n.x, n.y, n.z); }
  sph.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const b = new GeoBuilder();
  b.add(sph, { keep: true });
  for (const sx of [-1, 1]) b.sphere(0.24, { p: [sx * 1.0, -0.08, 0.04], s: [0.55, 1, 0.8], c: SKIN }, 10, 8);
  sph.dispose();
  headCache = b.build();
  return headCache;
}

let capCache = null;
/** The face patch laid over the front of the head: an elliptical cap with a soft edge (vertex alpha), UVs sampling the middle of the art. */
function faceCapGeometry() {
  if (capCache) return capCache;
  const rings = 9, segs = 32, PHI = 0.98, THETA = 1.02, UR = [0.34, 0.385];
  const pos = [], nrm = [], uv = [], col = [], idx = [];
  const vert = (rho, t) => {
    const u = rho * Math.cos(t), v = rho * Math.sin(t), az = u * PHI, el = v * THETA;
    const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(az) * Math.cos(el);
    pos.push(dx * HEAD_R[0] * 1.012, dy * HEAD_R[1] * 1.012, dz * HEAD_R[2] * 1.012);
    const nx = dx / HEAD_R[0], ny = dy / HEAD_R[1], nz = dz / HEAD_R[2], nl = Math.hypot(nx, ny, nz);
    nrm.push(nx / nl, ny / nl, nz / nl);
    uv.push(0.5 + u * UR[0], 0.5 + v * UR[1]);
    col.push(1, 1, 1, 1 - sstep(0.62, 1.0, rho));
  };
  vert(0, 0);
  for (let r = 1; r <= rings; r++) for (let k = 0; k < segs; k++) vert(r / rings, (k / segs) * Math.PI * 2);
  const ring = (r, k) => 1 + (r - 1) * segs + (k % segs);
  const tri = (a, b, c) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const e1 = [pos[b * 3] - ax, pos[b * 3 + 1] - ay, pos[b * 3 + 2] - az], e2 = [pos[c * 3] - ax, pos[c * 3 + 1] - ay, pos[c * 3 + 2] - az];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * nrm[a * 3] + cy * nrm[a * 3 + 1] + cz * nrm[a * 3 + 2] >= 0) idx.push(a, b, c); else idx.push(a, c, b);
  };
  for (let k = 0; k < segs; k++) tri(0, ring(1, k), ring(1, k + 1));
  for (let r = 1; r < rings; r++) for (let k = 0; k < segs; k++) { tri(ring(r, k), ring(r + 1, k), ring(r + 1, k + 1)); tri(ring(r, k), ring(r + 1, k + 1), ring(r, k + 1)); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  capCache = g;
  return g;
}

// ---- the hopscotch (drawn in code: chalk lines, numbers and mini portraits) --------------------------------------------------------------

const HOP = { w: 200, h: 700 };
/** @returns {(g:CanvasRenderingContext2D, r:object, img:(k:string)=>HTMLImageElement|null)=>void} */
function hopscotchDrawer(faces) {
  return (g, r, img) => {
    const cell = r.w / 2, rows = [[0, 1], [0, 2], [0, 1], [0, 2], [0, 1], [0, 2], [0, 1]];
    let n = 1, f = 0;
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const y = r.y + r.h - (i + 1) * cell * (r.h / (7 * cell));          // row i from the bottom (the start of the court)
      const rh = r.h / 7, cols = rows[i][1];
      for (let k = 0; k < cols; k++) {
        const cw = cols === 1 ? r.w : r.w / 2, x = r.x + (cols === 1 ? 0 : k * cw);
        g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x + 3, y + 3, cw - 6, rh - 6);
        g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = Math.max(3, r.w * 0.026);
        g.strokeRect(x + 3 + (k % 2) * 0.6, y + 3, cw - 6, rh - 6);
        const key = faces[f++ % Math.max(1, faces.length)], im = key ? img(key) : null;
        if (im) {
          const sz = Math.min(cw, rh) * 0.82;
          g.save(); g.translate(x + cw / 2, y + rh / 2 + 2); g.rotate(((i * 7 + k * 3) % 5 - 2) * 0.05); g.drawImage(im, -sz / 2, -sz / 2, sz, sz); g.restore();
        }
        g.fillStyle = 'rgba(255,255,255,.96)'; g.strokeStyle = 'rgba(20,20,40,.55)'; g.lineWidth = 4;
        g.font = `900 ${Math.round(rh * 0.3)}px "Segoe Print","Comic Sans MS",system-ui,sans-serif`; g.textAlign = 'left'; g.textBaseline = 'top';
        g.strokeText(String(n), x + 9, y + 7); g.fillText(String(n), x + 9, y + 7);
        n++;
      }
    }
  };
}

// ---- the builder -----------------------------------------------------------------------------------------------------------------------

const GLOW = 1.35;

/**
 * Caricature art for one built track.
 * @param {THREE.Scene|THREE.Object3D} scene where the decor group is added
 * @param {object} track built Track (needs length, sample, surfacePoint; query / model / boostPads optional)
 * @param {string} trackId 'copacabana' | 'blighty' | 'datacentre' | 'marcoverse' | any
 * @param {{quality?:'low'|'medium'|'high', seed?:number, mode?:'auto'|'lots'|'few'|'off', photoMode?:string, A?: typeof Assets}} [opts]
 *   quality scales density (0.4 / 0.7 / 1) and atlas size; mode is the player's 'Caricature art' setting (auto follows quality);
 *   photoMode is the 'Photo props' setting, so the art keeps clear of the photo props that are actually placed.
 * @returns {{group: THREE.Group, update: (t:number)=>void, dispose: ()=>void, setQuality: (q:string)=>void, setMode: (m:string)=>void, stats: object, ready: Promise<void>}}
 */
export function decorateCaricature(scene, track, trackId, { quality = 'high', seed = 0, mode = 'auto', photoMode = 'auto', A = Assets } = {}) {
  const group = new THREE.Group(); group.name = 'caricatureDecor';
  const api = { group, plan: null, stats: { items: 0, meshes: 0, triangles: 0 }, ready: Promise.resolve(), update() {}, dispose() {}, setQuality() {}, setMode() {} };
  let built = null, curQ = quality, curMode = mode;
  const build = (q) => {
    try { built = buildDecor(group, track, trackId, q, seed, CARI_MODES[curMode] ?? null, photoMode, A); } catch (e) { console.warn('[caricature] decor skipped', e); built = { stats: api.stats, update() {}, dispose() { for (const c of [...group.children]) group.remove(c); }, ready: Promise.resolve() }; }
    api.stats = built.stats; api.update = built.update; api.ready = built.ready; api.plan = built.plan ?? null;
  };
  build(quality);
  scene?.add?.(group);
  api.setQuality = (q) => { if (q === curQ || !['low', 'medium', 'high'].includes(q)) return; curQ = q; built.dispose(); build(q); };
  api.setMode = (m) => { if (m === curMode || !(m in CARI_MODES)) return; curMode = m; built.dispose(); build(curQ); };
  api.dispose = () => { built?.dispose(); built = null; group.removeFromParent(); };
  return api;
}
function buildDecor(group, track, trackId, quality, seed, density, photoMode, A) {
  const empty = (why) => ({ stats: { items: 0, meshes: 0, triangles: 0, why }, update() {}, dispose() {}, ready: Promise.resolve() });
  const entries = artEntries(A);
  if (!entries.length || density === 0) return empty(entries.length ? 'off' : 'no art');
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const profile = CARI_PROFILES[trackId] ?? CARI_PROFILES.default;

  // photo props that are really placed: keep out of their way
  let avoid = [];
  try {
    const ph = planDecor(track, trackId, { quality, density: PROP_MODES[photoMode] ?? undefined });
    avoid = ph.items.map((i) => ({ s: i.s, side: i.span ? 0 : i.side, gap: i.span ? 3 : 0 }));
  } catch { avoid = []; }
  const plan = planCaricature(track, trackId, { quality, seed, entries, density: density ?? undefined, avoid });
  if (!plan.items.length) return empty('empty plan');

  // ---- atlas: every flat piece this track uses
  const want = new Set();
  const stickerKeys = [];
  for (const it of plan.items) {
    if (it.type === 'statue') continue;
    if (it.key) want.add(it.key);
    for (const k of it.extra ?? []) want.add(k);
    for (const c of it.cells ?? []) want.add(c.key);
  }
  for (const it of plan.items) if (it.type === 'sticker' && stickerKeys.length < 10 && !stickerKeys.includes(it.key)) stickerKeys.push(it.key);
  for (const c of plan.items.find((i) => i.type === 'finish')?.cells ?? []) if (stickerKeys.length < 10 && !stickerKeys.includes(c.key)) stickerKeys.push(c.key);
  stickerKeys.forEach((k) => want.add(k));
  const atlasItems = [...want].filter((k) => byKey.has(k)).sort().map((k) => ({ key: k, w: byKey.get(k).w, h: byKey.get(k).h }));
  atlasItems.push({ key: 'hop', w: HOP.w, h: HOP.h, max: 700 });
  const layout = packAtlas(atlasItems, quality === 'low' ? { size: 1024, maxSide: 256 } : quality === 'medium' ? { size: 2048, maxSide: 384 } : { size: 2048, maxSide: 512 });
  if (!layout.rects.size) return empty('no atlas');
  const R = (k) => layout.rects.get(k);

  const flat = new QuadSet(), decal = new QuadSet(), tmp = {};
  const struct = new GeoBuilder(), neon = new GeoBuilder();
  const glow = profile.glow ? GLOW : 1;
  const tint = (v = 1) => [v, v, v];
  const stats = { items: 0, dropped: 0, meshes: 0, triangles: 0, byType: {}, atlas: { size: layout.size, pieces: layout.rects.size, scale: +layout.scale.toFixed(2) } };
  const statues = [];
  const A_ = {}, up = [0, 1, 0];

  /** [x,y,z] of (s, lateral) on the road surface, lifted along the surface normal. */
  const roadPt = (s, lat, lift) => {
    const sm = track.sample(s, A_);
    track.surfacePoint(s, lat, _pos);
    return [_pos.x + sm.up.x * lift, _pos.y + sm.up.y * lift, _pos.z + sm.up.z * lift];
  };
  /** Flat picture lying on the road: a w (across) x h (along) rectangle at (s, lat), rotated by yaw, split into ~cell-sized quads that follow the surface. */
  const decalGrid = (set, s, lat, w, h, yaw, rect, rgb, lift, cell = 1.1) => {
    const nu = Math.max(1, Math.ceil(w / cell)), nv = Math.max(1, Math.ceil(h / cell)), c = Math.cos(yaw), sn = Math.sin(yaw);
    const pts = [];
    for (let iv = 0; iv <= nv; iv++) for (let iu = 0; iu <= nu; iu++) {
      const lx = (iu / nu - 0.5) * w, ly = (iv / nv - 0.5) * h;
      pts.push(roadPt(s + lx * sn + ly * c, lat + lx * c - ly * sn, lift));
    }
    const P = (iu, iv) => pts[iv * (nu + 1) + iu];
    for (let iv = 0; iv < nv; iv++) for (let iu = 0; iu < nu; iu++) {
      const r = { u0: rect.u0 + (rect.u1 - rect.u0) * (iu / nu), u1: rect.u0 + (rect.u1 - rect.u0) * ((iu + 1) / nu), v0: rect.v0 + (rect.v1 - rect.v0) * (iv / nv), v1: rect.v0 + (rect.v1 - rect.v0) * ((iv + 1) / nv) };
      set.quad([P(iu, iv), P(iu + 1, iv), P(iu + 1, iv + 1), P(iu, iv + 1)], r, rgb);
    }
  };

  /** Facing (horizontal unit vector toward the road / approaching drivers) and ground position for a standing item. */
  const frame = (item, oncoming) => {
    const sm = track.sample(item.s, tmp);
    track.surfacePoint(item.s, item.lateral, _pos);
    let dx = -item.side * sm.right.x - sm.tangent.x * oncoming, dz = -item.side * sm.right.z - sm.tangent.z * oncoming;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    return { x: _pos.x, y: _pos.y, z: _pos.z, fx: dx, fz: dz, yaw: Math.atan2(dx, dz) };
  };
  const place = (f, lx, ly, lz) => { const c = Math.cos(f.yaw), s = Math.sin(f.yaw); return [f.x + lx * c + lz * s, ly, f.z - lx * s + lz * c]; };
  /** Box in a frame's local space, standing on `base` height. */
  const box = (bld, f, base, lx, ly, lz, sx, sy, sz, c, k) => bld.box(sx, sy, sz, { p: (() => { const p = place(f, lx, ly, lz); p[1] += base; return p; })(), r: [0, f.yaw, 0], c, k });

  // ---- billboards and murals
  const standingBoard = (it, mural) => {
    const f = frame(it, mural ? 1.0 : 0.9), r = R(it.key); if (!r) return false;
    const base = it.ground, bottom = it.bottom, w = it.w, h = it.h;
    const c = place(f, 0, 0, 0.03), rightV = [Math.cos(f.yaw), 0, -Math.sin(f.yaw)];
    flat.panel(c[0], base + bottom + h / 2, c[2], rightV, up, w, h, r, tint(glow));
    box(struct, f, base, 0, bottom + h / 2, -0.15, w + 0.45, h + 0.45, 0.24, mural ? 0xf3ead2 : 0x1c2029);
    box(struct, f, base, 0, bottom + h + 0.3, -0.02, w + 0.2, 0.16, 0.5, 0xffe9a8);
    const stem = bottom + 0.7;                           // the posts reach 0.6 m under the ground
    for (const sx of [-w * 0.32, w * 0.32]) box(struct, f, base, sx, (bottom - 0.5) / 2, -0.18, 0.3, stem, 0.3, 0x39404f);
    if (mural) box(struct, f, base, 0, bottom - 0.28, -0.1, w + 0.7, 0.3, 0.5, 0xd62839);   // a red plinth line under the mural
    return true;
  };

  // ---- floating art cards (Marcoverse)
  const floatCard = (it) => {
    const f = frame(it, 0.6), r = R(it.key); if (!r) return false;
    const y = f.y + it.height, rightV = [Math.cos(f.yaw), 0, -Math.sin(f.yaw)], c = place(f, 0, 0, 0);
    const tilt = it.tilt, rv = [rightV[0] * Math.cos(tilt), Math.sin(tilt), rightV[2] * Math.cos(tilt)], uv = [-Math.sin(tilt) * rightV[0], Math.cos(tilt), -Math.sin(tilt) * rightV[2]];
    flat.panel(c[0], y, c[2], rv, uv, it.w, it.h, r, tint(glow));
    const back = c.slice(); back[0] -= f.fx * 0.06; back[2] -= f.fz * 0.06;
    flat.panel(back[0], y, back[2], [-rv[0], -rv[1], -rv[2]], uv, it.w, it.h, r, tint(glow * 0.8));
    const bar = (lx, ly, sx, sy, col, k) => neon.box(sx, sy, 0.16, { p: (() => { const p = place(f, lx, 0, -0.03); return [p[0], y + ly, p[2]]; })(), r: [0, f.yaw, tilt], c: col, k });
    const t = 0.24;
    bar(0, it.h / 2 + t / 2, it.w + t * 2, t, 0x22d3ee, 1.35); bar(0, -it.h / 2 - t / 2, it.w + t * 2, t, 0xff2fb3, 1.35);
    bar(-it.w / 2 - t / 2, 0, t, it.h, 0x22d3ee, 1.35); bar(it.w / 2 + t / 2, 0, t, it.h, 0xff2fb3, 1.35);
    return true;
  };

  // ---- walls: graffiti strips and sticker clusters (the low walls are where the "tyre-barrier" stickers go)
  const wallPiece = (it) => {
    const sm = track.sample(it.s, tmp), side = it.side;
    const kap = track.curvatureAt ? track.curvatureAt(it.s) : 0;
    const sc = Math.max(0.5, 1 - kap * it.lateral);
    const fx = -side * sm.right.x, fz = -side * sm.right.z, rightV = [fz, 0, -fx];                    // up x f = the picture's right
    const col = tint(glow);
    if (it.variant === 'strip') {
      const span = it.w / sc, pieces = it.pieces ?? [{ key: it.key, w: it.w }];
      const sOf = (t) => (side < 0 ? it.s - span / 2 + t * span : it.s + span / 2 - t * span);
      let u0 = 0, drawn = 0;
      for (const pc of pieces) {
        const r = R(pc.key), u1 = u0 + pc.w / it.w;
        if (r) {
          const nseg = Math.max(1, Math.ceil(pc.w / 2.4)), pts = [];
          for (let k = 0; k <= nseg; k++) { track.surfacePoint(sOf(u0 + (u1 - u0) * (k / nseg)), it.lateral, _pos); pts.push([_pos.x, _pos.y, _pos.z]); }
          for (let k = 0; k < nseg; k++) {
            const a = pts[k], b = pts[k + 1], y0 = it.y0, y1 = it.y0 + it.h;
            const rr = { u0: r.u0 + (r.u1 - r.u0) * (k / nseg), u1: r.u0 + (r.u1 - r.u0) * ((k + 1) / nseg), v0: r.v0, v1: r.v1 };
            flat.quad([[a[0], a[1] + y0, a[2]], [b[0], b[1] + y0, b[2]], [b[0], b[1] + y1, b[2]], [a[0], a[1] + y1, a[2]]], rr, col);
          }
          drawn++;
        }
        u0 = u1 + 0.12 / it.w;
      }
      return drawn > 0;
    }
    if (!R(it.key)) return false;
    const keys = [it.key, ...(it.extra ?? [])];
    track.surfacePoint(it.s, it.lateral, _pos);
    const baseY = _pos.y, cx = _pos.x, cz = _pos.z;
    const tx = sm.tangent.x, tz = sm.tangent.z, norm = Math.hypot(tx, tz) || 1;
    keys.forEach((key, i) => {
      const rr = R(key); if (!rr) return;
      const off = (i - (keys.length - 1) / 2) * it.w * 1.35 * side * -1;
      const tl = ((i * 37 % 11) - 5) * 0.022, ch = Math.cos(tl), sh = Math.sin(tl);
      const rv = [rightV[0] * ch, sh, rightV[2] * ch], uv = [-sh * rightV[0], ch, -sh * rightV[2]];
      flat.panel(cx + (tx / norm) * off, baseY + it.y0 + it.h / 2 + 0.02 * i, cz + (tz / norm) * off, rv, uv, it.w, it.h, rr, col);
    });
    return true;
  };

  // ---- road decals
  const roadSticker = (it) => {
    const r = R(it.key); if (!r) return false;
    const a = Math.min(1.35, Math.max(0.7, it.aspect || 1));
    decalGrid(decal, it.s, it.lateral, it.size * (a < 1 ? a : 1), it.size / (a > 1 ? a : 1), it.yaw, r, tint(profile.stickerTint ?? 0.9), 0.04);
    return true;
  };
  const kerbRun = (it) => {
    const r = R(it.key); if (!r) return false;
    const quads = [subRect(r, 0.5, 0.5, 1, 1), subRect(r, 0, 0.5, 0.5, 1), subRect(r, 0, 0, 0.5, 0.5), subRect(r, 0.5, 0, 1, 0.5)];  // face / ring / face / ring (TR, TL, BL, BR)
    const order = [0, 1, 2, 3];
    const sd = it.side, kw = track.road?.kerbWidth ?? 1.3;
    for (let i = 0; i < it.tiles; i++) {
      const s0 = it.s - it.run / 2 + i * it.tile, s1 = s0 + it.tile;
      const h0 = track.sample(s0, A_).width / 2, h1 = track.sample(s1, A_).width / 2;
      const lo = (h) => h + 0.06, hi = (h) => h + kw - 0.06;
      const L = (h, outer) => (sd < 0 ? -(outer ? hi(h) : lo(h)) : (outer ? hi(h) : lo(h)));
      // BL / BR measured with lateral increasing to the right
      const l0a = Math.min(L(h0, true), L(h0, false)), l0b = Math.max(L(h0, true), L(h0, false)), l1a = Math.min(L(h1, true), L(h1, false)), l1b = Math.max(L(h1, true), L(h1, false));
      const rect = quads[order[(i + it.first) % 4]];
      decal.quad([roadPt(s0, l0a, 0.065), roadPt(s0, l0b, 0.065), roadPt(s1, l1b, 0.065), roadPt(s1, l1a, 0.065)], rect, tint(profile.stickerTint ?? 0.9));
    }
    return true;
  };
  const hopscotch = (it) => {
    const r = R('hop'); if (!r) return false;
    decalGrid(decal, it.s, it.lateral, it.wid, it.len, 0, r, tint(1), 0.04, 1.15);
    return true;
  };
  const finish = (it) => {
    let n = 0;
    for (const c of it.cells) {
      const r = R(c.key); if (!r) continue;
      decalGrid(decal, c.s, c.lateral, it.size, it.size, 0, r, tint(1), 0.052, 2);
      n++;
    }
    return n > 0;
  };

  // ---- statues
  const bodies = new Map();
  const statue = (it) => {
    const f = frame(it, 0.55);
    let by = it.ground ?? f.y;
    if (it.base === 'server') by = f.y + it.top;
    if (it.base === 'island') by = f.y + it.height;
    if (!bodies.has(it.base)) bodies.set(it.base, statueBody(it.base));
    const body = bodies.get(it.base), sc = it.scale ?? 1;
    struct.add(body.geo, { p: [f.x, by, f.z], r: [0, f.yaw, 0], s: sc, keep: true });
    statues.push({ hi: statues.length, key: it.key, x: f.x, y: by + body.headY * sc, z: f.z, yaw: f.yaw, scale: sc, phase: it.phase, mesh: null, idx: 0 });
    return true;
  };

  const handlers = { board: (it) => standingBoard(it, false), mural: (it) => standingBoard(it, true), float: floatCard, wall: wallPiece, sticker: roadSticker, kerb: kerbRun, hopscotch, finish, statue };
  for (const it of plan.items) {
    const ok = handlers[it.type]?.(it);
    if (ok) { stats.items++; stats.byType[it.type] = (stats.byType[it.type] ?? 0) + 1; } else stats.dropped++;
  }

  // ---- meshes
  const owned = { geos: [], mats: [], tex: [] };
  const own = (g) => { owned.geos.push(g); return g; };
  const atlas = createAtlas(layout, { alpha: true, A, custom: { hop: hopscotchDrawer(stickerKeys) } });
  owned.tex.push(atlas.texture);
  const flatGeo = flat.build(), decalGeo = decal.build();
  const meshes = [], waiting = [];
  let disposed = false;
  const add = (mesh, name, o = {}) => { mesh.name = name; mesh.frustumCulled = o.cull ?? true; mesh.userData.caricature = true; mesh.visible = !o.wait; group.add(mesh); meshes.push(mesh); if (o.wait) waiting.push(mesh); return mesh; };
  if (flatGeo) {
    const m = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, toneMapped: false, alphaTest: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    owned.mats.push(m); add(new THREE.Mesh(own(flatGeo), m), 'caricature:art', { wait: true });
  }
  if (decalGeo) {
    const m = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, toneMapped: false, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    owned.mats.push(m); const mesh = add(new THREE.Mesh(own(decalGeo), m), 'caricature:decals', { wait: true }); mesh.renderOrder = 2; mesh.receiveShadow = false;
  }
  const structGeo = struct.build();
  if (structGeo.getAttribute('position')) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 });
    owned.mats.push(m); add(new THREE.Mesh(own(structGeo), m), 'caricature:structure');
  }
  const neonGeo = neon.build();
  if (neonGeo.getAttribute('position')) {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    owned.mats.push(m); add(new THREE.Mesh(own(neonGeo), m), 'caricature:neon');
  }

  // bobblehead heads: one instanced mesh for the egg, one instanced face patch per art key
  let headMesh = null;
  const capMeshes = new Map();
  const headTextures = [];
  if (statues.length) {
    const hm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
    owned.mats.push(hm);
    headMesh = new THREE.InstancedMesh(headGeometry(), hm, statues.length);
    headMesh.frustumCulled = false; add(headMesh, 'caricature:heads', { cull: false });
    const keys = [...new Set(statues.map((s) => s.key))];
    for (const key of keys) {
      const list = statues.filter((s) => s.key === key);
      const cm = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      cm.color.setScalar(profile.glow ? 1.15 : 1);
      owned.mats.push(cm);
      const mesh = new THREE.InstancedMesh(faceCapGeometry(), cm, list.length);
      mesh.frustumCulled = false; mesh.renderOrder = 3; add(mesh, `caricature:face:${key}`, { cull: false, wait: false }); mesh.visible = false;
      list.forEach((s, i) => { s.mesh = mesh; s.idx = i; });
      capMeshes.set(key, mesh);
      (A.image?.(key) ?? Promise.resolve(null)).then((img) => {
        if (!img || disposed) return;
        const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
        headTextures.push(t); owned.tex.push(t); cm.map = t; cm.needsUpdate = true; mesh.visible = true;
      });
    }
  }

  const ready = atlas.ready.then(() => { if (!disposed) for (const m of waiting) m.visible = true; });

  const writeHeads = (t) => {
    if (!headMesh) return;
    for (const s of statues) {
      const ph = s.phase * 6.2832, bob = Math.sin(t * 2.2 + ph) * 0.07 * s.scale;
      _q.setFromAxisAngle(Y, s.yaw);
      _qx.setFromAxisAngle(X, Math.sin(t * 1.7 + ph) * 0.07); _qz.setFromAxisAngle(Z, Math.sin(t * 1.25 + ph * 2) * 0.1 + Math.sin(t * 3.1 + ph) * 0.025);
      _q2.copy(_q).multiply(_qx).multiply(_qz);
      _m.compose(_p.set(s.x, s.y + bob, s.z), _q2, _s.setScalar(s.scale));
      headMesh.setMatrixAt(s.hi, _m);
      s.mesh.setMatrixAt(s.idx, _m);
    }
    headMesh.instanceMatrix.needsUpdate = true;
    for (const m of capMeshes.values()) m.instanceMatrix.needsUpdate = true;
  };
  writeHeads(0);
  let lastT = -1;
  const update = (t) => { if (statues.length && t - lastT > 0.015) { lastT = t; writeHeads(t); } };

  stats.meshes = meshes.length;
  stats.triangles = (flatGeo?.index.count ?? 0) / 3 + (decalGeo?.index.count ?? 0) / 3 + (structGeo.attributes.position?.count ?? 0) / 3;
  stats.statues = statues.length;

  const dispose = () => {
    disposed = true;
    for (const c of [...group.children]) { group.remove(c); c.dispose?.(); }
    for (const g of owned.geos) g.dispose();
    for (const m of owned.mats) m.dispose();
    for (const t of owned.tex) t.dispose();
    atlas.dispose();
  };
  return { stats, update, dispose, ready, plan };
}
