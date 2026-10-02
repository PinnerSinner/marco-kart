// photoDecor: dresses a BUILT track with Marco's photos without touching any track file.
// Billboards, tourist-poster hoardings, framed polaroids on posts, jumbotrons that cycle photos, bunting and gantry banners over the road,
// spectator stands full of Marco cut-outs, wall screens (Data Centre) and floating photo cards (Marcoverse).
// The layout comes from the pure planner in photoDecorPlan.js (deterministic, outside the road + kerb + wall clearance, outside of bends).
// Draw calls stay low: every repeated thing is an InstancedMesh (one per photo material, one shared box mesh for frames / posts / tiers).
import * as THREE from 'three';
import { Assets } from '../core/assets.js';
import { clamp } from '../core/util.js';
import { PHOTOS } from '../core/photos.js';
import { planDecor, aspectOf, PROP_MODES } from './photoDecorPlan.js';
import { photoTexture } from './photoKit.js';

const hasDoc = () => typeof document !== 'undefined';
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), ONE = new THREE.Vector3(1, 1, 1), IDQ = new THREE.Quaternion();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _lm = new THREE.Matrix4(), _pm = new THREE.Matrix4(), _m = new THREE.Matrix4();
const _pos = new THREE.Vector3(), _pos2 = new THREE.Vector3();

// ---- textures (own composer for poster / screen / banner / flag styles; polaroids come from photoKit) -----------------------------

const PAPER = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#e76f51', '#7b2cbf'];

/**
 * Lazily composed canvas texture. Draws a placeholder first, then the real photo when it has decoded.
 * @param {string} id cache id
 * @param {string} key asset key
 * @param {number} w px @param {number} h px
 * @param {(g:CanvasRenderingContext2D, img:HTMLImageElement|null, w:number, h:number) => void} draw
 */
function composed(cache, id, key, w, h, draw) {
  if (cache.has(id)) return cache.get(id);
  if (!hasDoc()) { const t = new THREE.Texture(); cache.set(id, t); return t; }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  draw(g, null, w, h); tex.needsUpdate = true;
  Assets.image(key).then((img) => { if (img) { draw(g, img, w, h); tex.needsUpdate = true; } });
  cache.set(id, tex);
  return tex;
}

/** Cover-fit an image into a rectangle. */
function cover(g, img, x, y, w, h) {
  const sr = img.width / img.height, dr = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (sr > dr) { sw = img.height * dr; sx = (img.width - sw) / 2; } else { sh = img.width / dr; sy = (img.height - sh) / 2; }
  g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function placeholder(g, x, y, w, h, label = 'MARCO') {
  const grd = g.createLinearGradient(x, y, x + w, y + h); grd.addColorStop(0, '#ff9a3c'); grd.addColorStop(1, '#e63946');
  g.fillStyle = grd; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.font = `900 ${Math.round(Math.min(h * 0.3, w * 0.2))}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, x + w / 2, y + h / 2);
}

function fitText(g, text, x, y, maxW, px, weight = 800) {
  let size = px; g.font = `${weight} ${size}px system-ui,sans-serif`;
  while (g.measureText(text).width > maxW && size > 8) { size -= 2; g.font = `${weight} ${size}px system-ui,sans-serif`; }
  g.fillText(text, x, y);
}

const STYLES = {
  /** Photo in a dark billboard bezel. */
  board(g, img, w, h) {
    g.fillStyle = '#20242c'; g.fillRect(0, 0, w, h);
    const p = w * 0.03;
    if (img) cover(g, img, p, p, w - 2 * p, h - 2 * p); else placeholder(g, p, p, w - 2 * p, h - 2 * p);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.strokeRect(p, p, w - 2 * p, h - 2 * p);
  },
  /** Tourist poster: photo over a coloured caption band with a title and a line of tag copy. */
  poster(g, img, w, h, o) {
    g.fillStyle = '#fff6e2'; g.fillRect(0, 0, w, h);
    const p = w * 0.025, band = h * 0.27;
    if (img) cover(g, img, p, p, w - 2 * p, h - 2 * p - band); else placeholder(g, p, p, w - 2 * p, h - 2 * p - band);
    g.fillStyle = o.colour; g.fillRect(0, h - band - p * 0.4, w, band + p * 0.4);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, o.title, w / 2, h - band * 0.66, w * 0.9, band * 0.5, 900);
    g.fillStyle = 'rgba(255,255,255,.92)'; fitText(g, o.sub, w / 2, h - band * 0.24, w * 0.88, band * 0.24, 600);
  },
  /** Jumbotron / wall screen: photo with a lower-third caption and faint scan lines. */
  screen(g, img, w, h, o) {
    g.fillStyle = '#05060c'; g.fillRect(0, 0, w, h);
    const p = w * 0.012;
    if (img) cover(g, img, p, p, w - 2 * p, h - 2 * p); else placeholder(g, p, p, w - 2 * p, h - 2 * p);
    g.fillStyle = 'rgba(0,0,0,.28)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1.5);
    if (o.caption) {
      g.fillStyle = 'rgba(8,12,30,.72)'; g.fillRect(0, h * 0.82, w, h * 0.18);
      g.fillStyle = '#fff8ec'; g.textAlign = 'left'; g.textBaseline = 'middle'; fitText(g, o.caption, w * 0.04, h * 0.91, w * 0.92, h * 0.09, 800);
      g.fillStyle = '#22d3ee'; g.fillRect(0, h * 0.82, w, h * 0.008);
    }
    if (o.neon) { g.strokeStyle = '#22d3ee'; g.lineWidth = w * 0.012; g.strokeRect(p, p, w - 2 * p, h - 2 * p); g.strokeStyle = '#ff2fb3'; g.lineWidth = w * 0.005; g.strokeRect(p * 3, p * 3, w - 6 * p, h - 6 * p); }
  },
  /** Neon-framed card for the floating photos. */
  neon(g, img, w, h) {
    g.fillStyle = '#12082e'; g.fillRect(0, 0, w, h);
    const p = w * 0.06;
    if (img) cover(g, img, p, p, w - 2 * p, h - 2 * p); else placeholder(g, p, p, w - 2 * p, h - 2 * p);
    g.strokeStyle = '#22d3ee'; g.lineWidth = w * 0.03; g.strokeRect(p / 2, p / 2, w - p, h - p);
    g.strokeStyle = '#ff2fb3'; g.lineWidth = w * 0.012; g.strokeRect(p * 0.95, p * 0.95, w - p * 1.9, h - p * 1.9);
  },
  /** Gantry banner: square photo at the left, big title and caption at the right. */
  banner(g, img, w, h, o) {
    const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#0b1d3a'); grd.addColorStop(1, o.colour);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const p = h * 0.09, sq = h - 2 * p;
    if (img) cover(g, img, p, p, sq, sq); else placeholder(g, p, p, sq, sq);
    g.strokeStyle = '#fff'; g.lineWidth = h * 0.03; g.strokeRect(p, p, sq, sq);
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    fitText(g, o.title, sq + p * 3, h * 0.42, w - sq - p * 5, h * 0.42, 900);
    g.fillStyle = '#ffd166'; fitText(g, o.sub, sq + p * 3, h * 0.76, w - sq - p * 5, h * 0.2, 700);
  },
  /** Bunting flag: photo with a white border. */
  flag(g, img, w, h) {
    g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, h);
    const p = w * 0.07;
    if (img) cover(g, img, p, p, w - 2 * p, h - 2 * p); else placeholder(g, p, p, w - 2 * p, h - 2 * p, 'M');
  },
};

/** Cut-out of Marco (transparent PNG), or a cheerful procedural stand-in when the asset is missing. */
function cutoutDraw(g, img, w, h) {
  g.clearRect(0, 0, w, h);
  if (img) { const r = Math.min(w / img.width, h / img.height); const dw = img.width * r, dh = img.height * r; g.drawImage(img, (w - dw) / 2, h - dh, dw, dh); return; }
  g.fillStyle = '#ffd7b3'; g.beginPath(); g.arc(w / 2, h * 0.2, w * 0.2, 0, 7); g.fill();
  g.fillStyle = '#e63946'; g.beginPath(); g.moveTo(w * 0.2, h); g.lineTo(w * 0.26, h * 0.42); g.quadraticCurveTo(w / 2, h * 0.34, w * 0.74, h * 0.42); g.lineTo(w * 0.8, h); g.fill();
  g.fillStyle = '#fff'; g.font = `900 ${w * 0.3}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', w / 2, h * 0.68);
}

// ---- batching ---------------------------------------------------------------------------------------------------------------------

/** Collects instance matrices per material key, then creates one InstancedMesh each. */
class Batches {
  constructor() { this.map = new Map(); }
  entry(key, make) { let e = this.map.get(key); if (!e) { e = { key, ...make(), mats: [], cols: [] }; this.map.set(key, e); } return e; }
  /** @returns {number} instance index */
  push(e, matrix, colour) { e.mats.push(matrix.clone()); e.cols.push(colour ?? 0xffffff); return e.mats.length - 1; }
  build(group, animated = new Set()) {
    const col = new THREE.Color();
    for (const e of this.map.values()) {
      const mesh = new THREE.InstancedMesh(e.geo, e.mat, e.mats.length);
      for (let i = 0; i < e.mats.length; i++) { mesh.setMatrixAt(i, e.mats[i]); if (e.tinted) mesh.setColorAt(i, col.set(e.cols[i])); }
      mesh.instanceMatrix.needsUpdate = true;
      if (e.tinted && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = !animated.has(e.key);
      mesh.matrixAutoUpdate = false; mesh.userData.photoDecor = true;
      group.add(mesh); e.mesh = mesh;
    }
  }
}

function parentMatrix(out, x, y, z, yaw, roll = 0) {
  _q.setFromAxisAngle(Y, yaw);
  if (roll) { _q2.setFromAxisAngle(Z, roll); _q.multiply(_q2); }
  return out.compose(_p.set(x, y, z), _q, ONE);
}
function localMatrix(out, parent, lx, ly, lz, sx, sy, sz) {
  _lm.compose(_p.set(lx, ly, lz), IDQ, _s.set(sx, sy, sz));
  return out.multiplyMatrices(parent, _lm);
}

/**
 * Photo decoration for one built track.
 * @param {THREE.Scene|THREE.Object3D} scene where the decor group is added
 * @param {object} track built Track (needs length, sample, surfacePoint, query; jumpRamps/model optional)
 * @param {string} trackId 'copacabana' | 'blighty' | 'datacentre' | 'marcoverse' | any
 * @param {{quality?: 'low'|'medium'|'high', seed?: number, mode?: 'auto'|'lots'|'few'|'off'}} [opts] quality scales density (0.4 / 0.7 / 1) and texture size;
 *   mode is the player's 'Photo props' setting (auto follows quality)
 * @returns {{group: THREE.Group, update: (t:number)=>void, dispose: ()=>void, setQuality: (q:string)=>void, stats: object}}
 */
export function decorateTrack(scene, track, trackId, { quality = 'high', seed = 0, mode = 'auto' } = {}) {
  const group = new THREE.Group(); group.name = 'photoDecor';
  const api = { group, stats: { items: 0, meshes: 0, textures: 0 }, update() {}, dispose() {}, setQuality() {}, setMode() {} };
  let built = null, curQ = quality, curMode = mode;

  const build = (q) => {
    built = buildDecor(group, track, trackId, q, seed, PROP_MODES[curMode] ?? null);
    api.stats = built.stats;
    api.update = built.update;
  };
  build(quality);
  scene?.add?.(group);
  api.setQuality = (q) => {
    if (q === curQ || !['low', 'medium', 'high'].includes(q)) return;
    curQ = q; built.dispose(); build(q);
  };
  api.setMode = (m) => {
    if (m === curMode || !(m in PROP_MODES)) return;
    curMode = m; built.dispose(); build(curQ);
  };
  api.dispose = () => { built?.dispose(); built = null; group.removeFromParent(); };
  return api;
}

function buildDecor(group, track, trackId, quality, seed, density) {
  const plan = planDecor(track, trackId, { quality, seed, density: density ?? undefined });
  const profile = plan.profile;
  const texCache = new Map(), owned = [], mats = [], geos = [];
  const texScale = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
  const px = (v) => Math.max(64, Math.round(v * texScale / 16) * 16);
  const glow = 1.35, ownedMat = (m) => { mats.push(m); return m; };
  const batches = new Batches();
  const planeGeo = new THREE.PlaneGeometry(1, 1), boxGeo = new THREE.BoxGeometry(1, 1, 1);
  geos.push(planeGeo, boxGeo);
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05 }); mats.push(boxMat);
  const boxes = () => batches.entry('box', () => ({ geo: boxGeo, mat: boxMat, tinted: true }));
  const captionOf = (slug) => PHOTOS.find((p) => p.slug === slug)?.caption ?? '';
  const jumbos = [], floats = [], animated = new Set();
  const A = {}, out = { normal: new THREE.Vector3() };
  const stats = { items: 0, meshes: 0, textures: 0, dropped: 0 };
  const colourFor = (i) => PAPER[i % PAPER.length];

  const tex = (id, key, w, h, style, o = {}) => {
    const t = composed(texCache, id, key, px(w), px(h), (g, img, cw, ch) => STYLES[style](g, img, cw, ch, o));
    if (!owned.includes(t)) owned.push(t);
    return t;
  };
  /** Photo material (shared by every instance of the same photo + style). */
  const photoMat = (id, texture, { double = false, glowOn = false, alphaTest = 0 } = {}) => batches.entry(id, () => {
    const m = ownedMat(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: double ? THREE.DoubleSide : THREE.FrontSide, transparent: alphaTest > 0, alphaTest }));
    if (glowOn) m.color.setScalar(glow);
    return { geo: planeGeo, mat: m, tinted: alphaTest > 0 };
  });
  const dimsFor = (item, bw) => { const a = aspectOf(item); return a >= 1 ? [bw, bw / a] : [bw * 0.62, bw * 0.62 / a]; };

  /** Ground height beside the road at (x,z), or null when there is no sensible ground there (sea, void, another road, cliff). */
  const ground = (x, z, roadY, s, half) => {
    if (profile.void || !track.query) return null;
    _pos.set(x, roadY, z);
    const q = track.query(_pos, out, s);
    if (!q || q.inVoid || q.surface === 'void' || !Number.isFinite(q.height) || Math.abs(q.height - roadY) > 7) return null;
    if (q.onRoad) return null;
    if (Math.abs(q.lateral) < half + 1 && Math.abs(track.sDiff ? track.sDiff(q.s, s) : 0) < 30) return null;
    return q.height;
  };

  /** Common frame: ground point, facing yaw. `oncoming` blends the facing from "toward the road" to "toward approaching drivers". */
  const frame = (item, oncoming) => {
    const sm = track.sample(item.s, A);
    track.surfacePoint(item.s, item.lateral, _pos);
    const dx = -item.side * sm.right.x - sm.tangent.x * oncoming, dz = -item.side * sm.right.z - sm.tangent.z * oncoming;
    return { x: _pos.x, y: _pos.y, z: _pos.z, yaw: Math.atan2(dx, dz), sm };
  };


  // ---- standing items ---------------------------------------------------------------------------------------------------------
  const standingBase = (item, oncoming, halfW) => {
    const f = frame(item, oncoming);
    const g = ground(f.x, f.z, f.y, item.s, item.half);
    if (g === null && !profile.void) return null;
    const gy = g ?? f.y - 30;                // void tracks: a long stem hangs down into the abyss, so the sign floats over the edge
    return { ...f, gy, roadY: f.y };
  };

  const billboard = (item, hoard) => {
    const b = standingBase(item, hoard ? 1.1 : 0.95); if (!b) return false;
    const [w, h] = hoard ? [10, 5.2] : dimsFor(item, item.aspect === 'portrait' ? 8 : 9);
    const bottom = hoard ? 1.0 : 2.4, gy = b.gy, base = profile.void ? b.roadY : gy;
    const portrait = item.aspect === 'portrait';
    const t = hoard ? tex(`poster|${item.slug}|${item.title}`, `photo_${item.slug}`, 640, 330, 'poster', { title: item.title, sub: item.sub, colour: colourFor((item.title.length + item.s) | 0) })
      : tex(`board|${item.slug}`, `photo_${item.slug}`, portrait ? 384 : 512, portrait ? 512 : 384, 'board');
    const e = photoMat(`${hoard ? 'poster' : 'board'}|${item.slug}|${hoard ? item.title : ''}`, t);
    const P = parentMatrix(_pm, b.x, base, b.z, b.yaw);
    batches.push(e, localMatrix(_m, P, 0, bottom + h / 2, 0.02, w, h, 1));
    const bx = boxes();
    batches.push(bx, localMatrix(_m, P, 0, bottom + h / 2, -0.15, w + 0.45, h + 0.45, 0.24), hoard ? 0xfff0d0 : 0x1c2029);
    batches.push(bx, localMatrix(_m, P, 0, bottom + h + 0.32, -0.02, w + 0.2, 0.16, 0.5), 0xffe9a8);   // lamp bar
    const stem = bottom + (profile.void ? 30 : 0.5);      // posts reach 0.5 m under the ground (or far down into the void)
    for (const sx of [-w * 0.32, w * 0.32]) batches.push(bx, localMatrix(_m, P, sx, bottom + 0.1 - stem / 2, -0.18, 0.3, stem, 0.3), 0x39404f);
    return true;
  };

  const polaroid = (item) => {
    const b = standingBase(item, 0.9); if (!b) return false;
    const w = 2.3, h = 2.8, bottom = 1.5, base = profile.void ? b.roadY : b.gy;
    const t = photoTexture(`photo_${item.slug}`, { w: px(384), h: px(470), frame: 'polaroid', caption: item.caption });
    const e = photoMat(`polaroid|${item.slug}`, t);
    const P = parentMatrix(_pm, b.x, base, b.z, b.yaw, item.tilt);
    batches.push(e, localMatrix(_m, P, 0, bottom + h / 2, 0.05, w, h, 1));
    const bx = boxes();
    batches.push(bx, localMatrix(_m, P, 0, bottom + h / 2, -0.02, w + 0.12, h + 0.12, 0.08), 0xf2ead8);
    const stem = bottom + h * 0.4 + (profile.void ? 30 : 0.4);
    batches.push(bx, localMatrix(_m, P, 0, bottom + h * 0.4 - stem / 2, -0.1, 0.16, stem, 0.16), 0x8a6a48);
    return true;
  };

  const standee = (item, i) => {
    const b = standingBase(item, 0.25); if (!b || profile.void) return false;
    const P = parentMatrix(_pm, b.x, b.gy, b.z, b.yaw);
    const bx = boxes(), W = 11;
    batches.push(bx, localMatrix(_m, P, 0, 0.55, 0, W, 1.1, 2.6), 0x3d4f7a);
    batches.push(bx, localMatrix(_m, P, 0, 1.1, -2.4, W, 2.2, 2.2), 0x2f3c5e);
    batches.push(bx, localMatrix(_m, P, 0, 3.05, -3.4, W + 0.4, 0.2, 0.3), 0xe63946);    // rail on the back tier
    const ct = composed(texCache, 'cutout', 'marco_full', px(256), px(362), cutoutDraw);
    if (!owned.includes(ct)) owned.push(ct);
    const cut = photoMat('cutout', ct, { double: true, alphaTest: 0.4 });
    const tints = [0xffffff, 0xffe9d0, 0xd6ecff, 0xffd6e5, 0xe4ffd6];
    for (let k = 0; k < 6; k++) {
      const upper = k >= 3, x = (k % 3 - 1) * 3.2 + (upper ? 1.4 : -0.3) + Math.sin(item.phase * 40 + k) * 0.5;
      const sc = 1.85 + ((item.phase * 10 + k * 3.7) % 1) * 0.5;
      batches.push(cut, localMatrix(_m, P, x, upper ? 2.2 : 1.1, upper ? -2.4 : 0.2, sc * 0.72, sc, 1), tints[(k + i) % tints.length]);
    }
    // fan signs: Marco's face photos on sticks, waved above the front row
    const alts = [item.slug, ...(item.alt ?? [])];
    for (let k = 0; k < 3; k++) {
      const slug = alts[k % alts.length];
      const fe = photoMat(`flag|${slug}`, tex(`flag|${slug}`, `face_${slug}`, 192, 192, 'flag'), { double: true, glowOn: false });
      const x = (k - 1) * 3.6 + 1.3;
      batches.push(fe, localMatrix(_m, P, x, 3.55, 0.7, 1.0, 1.0, 1));
      batches.push(bx, localMatrix(_m, P, x, 2.55, 0.68, 0.06, 1.4, 0.06), 0xd9c7a0);
    }
    return true;
  };

  const jumbo = (item) => {
    const b = standingBase(item, 1.1); if (!b) return false;
    const w = 12, h = 6.75, bottom = 5.4, base = profile.void ? b.roadY : b.gy;
    const list = [item.slug, ...(item.alt ?? [])];
    const textures = list.map((slug, i) => tex(`screen|${slug}|${profile.glow ? 1 : 0}`, `photo_${slug}`, 640, 360, 'screen', { caption: captionOf(slug), neon: !!profile.glow }));
    const mat = ownedMat(new THREE.MeshBasicMaterial({ map: textures[0], toneMapped: false })); mat.color.setScalar(profile.glow ? glow : 1.1);
    const screen = new THREE.Mesh(planeGeo, mat);
    const P = parentMatrix(_pm, b.x, base, b.z, b.yaw);
    screen.matrixAutoUpdate = false; screen.matrix.copy(localMatrix(_m, P, 0, bottom + h / 2, 0.5, w, h, 1)); screen.matrixWorldNeedsUpdate = true;
    group.add(screen);
    const bx = boxes();
    batches.push(bx, localMatrix(_m, P, 0, bottom + h / 2, 0.05, w + 0.8, h + 0.8, 0.8), 0x14161d);
    batches.push(bx, localMatrix(_m, P, 0, bottom + h + 0.75, 0.05, w * 0.4, 0.3, 0.9), 0xe63946);
    const stem = bottom + (profile.void ? 30 : 0.5);
    for (const sx of [-w * 0.36, w * 0.36]) batches.push(bx, localMatrix(_m, P, sx, bottom + 0.1 - stem / 2, -0.05, 0.7, stem, 0.7), 0x2a2f3a);
    jumbos.push({ mat, textures, phase: item.phase, idx: 0 });
    return true;
  };

  // ---- spans ------------------------------------------------------------------------------------------------------------------
  const bunting = (item) => {
    const L = Math.abs(item.lateral), top = 8.2;
    track.surfacePoint(item.s, -L, _pos); const a = { x: _pos.x, y: _pos.y, z: _pos.z };
    track.surfacePoint(item.s, L, _pos2); const c = { x: _pos2.x, y: _pos2.y, z: _pos2.z };
    const sm = track.sample(item.s, A), yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
    const bx = boxes(), n = Math.max(6, Math.round(Math.hypot(c.x - a.x, c.z - a.z) / 1.7));
    const slugs = [item.slug, ...(item.alt ?? [])];
    const gA = ground(a.x, a.z, a.y, item.s, item.half) ?? a.y, gC = ground(c.x, c.z, c.y, item.s, item.half) ?? c.y;
    for (const [pt, g] of [[a, gA], [c, gC]]) {
      const P = parentMatrix(_pm, pt.x, 0, pt.z, 0);
      batches.push(bx, localMatrix(_m, P, 0, g + (pt.y + top - g) / 2, 0, 0.4, pt.y + top - g, 0.4), 0xf4f0e8);
      batches.push(bx, localMatrix(_m, P, 0, pt.y + top + 0.2, 0, 0.7, 0.4, 0.7), 0xe63946);
    }
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = a.x + (c.x - a.x) * t, z = a.z + (c.z - a.z) * t, y = a.y + (c.y - a.y) * t + top - Math.sin(Math.PI * t) * 1.1;
      if (prev) {
        const dx = x - prev.x, dy = y - prev.y, dz = z - prev.z, len = Math.hypot(dx, dy, dz);
        _q.setFromUnitVectors(Z, _p.set(dx / len, dy / len, dz / len));
        _m.compose(_pos.set((x + prev.x) / 2, (y + prev.y) / 2, (z + prev.z) / 2), _q, _s.set(0.13, 0.13, len));
        batches.push(bx, _m, 0xfff4d0);
      }
      if (i > 0 && i < n && (i & 1) === 0) {
        const slug = slugs[(i / 2) % slugs.length];
        const fe = photoMat(`flag|${slug}`, tex(`flag|${slug}`, `face_${slug}`, 192, 192, 'flag'), { double: true });
        const P = parentMatrix(_pm, x, y - 0.05, z, yaw, Math.sin(i * 2.1) * 0.08);
        batches.push(fe, localMatrix(_m, P, 0, -0.85, 0, 1.4, 1.4, 1));
      }
      prev = { x, y, z };
    }
    return true;
  };

  const gantry = (item) => {
    const L = Math.abs(item.lateral), top = 12.4;
    track.surfacePoint(item.s, -L, _pos); const a = { x: _pos.x, y: _pos.y, z: _pos.z };
    track.surfacePoint(item.s, L, _pos2); const c = { x: _pos2.x, y: _pos2.y, z: _pos2.z };
    const sm = track.sample(item.s, A), yaw = Math.atan2(-sm.tangent.x, -sm.tangent.z);
    const w = clamp(item.half * 2 * 0.85, 12, 20), h = w / 4, bx = boxes();
    const cx = (a.x + c.x) / 2, cz = (a.z + c.z) / 2, cy = (a.y + c.y) / 2;
    const gA = ground(a.x, a.z, a.y, item.s, item.half) ?? a.y, gC = ground(c.x, c.z, c.y, item.s, item.half) ?? c.y;
    for (const [pt, g] of [[a, gA], [c, gC]]) {
      const P = parentMatrix(_pm, pt.x, 0, pt.z, yaw);
      batches.push(bx, localMatrix(_m, P, 0, g + (pt.y + top - g) / 2, 0, 0.9, pt.y + top - g, 0.9), 0x2b3345);
    }
    const P = parentMatrix(_pm, cx, cy, cz, yaw);
    const span = Math.hypot(c.x - a.x, c.z - a.z);
    batches.push(bx, localMatrix(_m, P, 0, top + 0.1, 0, span + 0.9, 0.7, 0.9), 0x2b3345);
    const e = photoMat(`banner|${item.slug}|${item.title}`, tex(`banner|${item.slug}|${item.title}`, `photo_${item.slug}`, 1024, 256, 'banner', { title: item.title, sub: item.caption, colour: colourFor(item.s | 0) }));
    batches.push(e, localMatrix(_m, P, 0, top - h / 2 - 0.25, 0.5, w, h, 1));
    batches.push(bx, localMatrix(_m, P, 0, top - h / 2 - 0.25, 0.4, w + 0.5, h + 0.4, 0.2), 0x0b0d14);
    return true;
  };

  // ---- wall screens (Data Centre) and floating cards (Marcoverse) -----------------------------------------------------------------
  const wallscreen = (item) => {
    const sm = track.sample(item.s, A);
    const L = Math.abs(item.lateral) - 0.12;
    track.surfacePoint(item.s, item.side * L, _pos);
    const nx = -item.side * sm.right.x, nz = -item.side * sm.right.z;
    const yaw = Math.atan2(nx - sm.tangent.x * 0.45, nz - sm.tangent.z * 0.45);
    const w = 7, h = 4.4;
    const e = photoMat(`screen|${item.slug}|1`, tex(`screen|${item.slug}|1`, `photo_${item.slug}`, 640, 360, 'screen', { caption: item.caption, neon: true }), { glowOn: true });
    const P = parentMatrix(_pm, _pos.x, _pos.y + item.height, _pos.z, yaw);
    batches.push(e, localMatrix(_m, P, 0, 0, 0.1, w, h, 1));
    batches.push(boxes(), localMatrix(_m, P, 0, 0, -0.02, w + 0.4, h + 0.4, 0.14), 0x0a0d18);
    return true;
  };

  const floating = (item) => {
    const w = item.size * Math.min(1.2, aspectOf(item)), h = item.size * Math.min(1.2, aspectOf(item)) / aspectOf(item);
    const e = photoMat(`neon|${item.slug}`, tex(`neon|${item.slug}`, `photo_${item.slug}`, 384, 384, 'neon'), { double: true, glowOn: true });
    animated.add(e.key);
    track.surfacePoint(item.s, item.lateral, _pos);
    const idx = batches.push(e, _m.identity());
    floats.push({ e, idx, x: _pos.x, y: _pos.y + item.height, z: _pos.z, w: w, h, yaw: Math.atan2(-item.side * track.sample(item.s, A).right.x, -item.side * track.sample(item.s, A).right.z), phase: item.phase * 6.283, tilt: item.tilt });
    return true;
  };

  const handlers = { billboard: (it) => billboard(it, false), hoarding: (it) => billboard(it, true), polaroid, jumbo, bunting, gantry, wallscreen, float: floating };
  let stands = 0;
  for (const item of plan.items) {
    const ok = item.type === 'stand' ? standee(item, stands++) : handlers[item.type]?.(item);
    if (ok) stats.items++; else stats.dropped++;
  }

  batches.build(group, animated);
  for (const f of floats) f.mesh = f.e.mesh;
  stats.meshes = group.children.length;
  stats.textures = owned.length;

  const update = (t) => {
    for (const j of jumbos) {
      const k = Math.floor(t / 6 + j.phase * 4) % j.textures.length;
      const flash = (t / 6 + j.phase * 4) % 1;
      if (k !== j.idx) { j.idx = k; j.mat.map = j.textures[k]; }
      j.mat.color.setScalar((profile.glow ? glow : 1.1) * (flash < 0.05 ? 1.6 : 1));
    }
    if (floats.length) {
      for (const f of floats) {
        const bob = Math.sin(t * 0.9 + f.phase) * 0.9, yaw = f.yaw + Math.sin(t * 0.4 + f.phase * 1.7) * 0.5;
        _q.setFromAxisAngle(Y, yaw); _q2.setFromAxisAngle(Z, f.tilt + Math.sin(t * 0.6 + f.phase) * 0.08); _q.multiply(_q2);
        _m.compose(_p.set(f.x, f.y + bob, f.z), _q, _s.set(f.w, f.h, 1));
        f.mesh.setMatrixAt(f.idx, _m);
      }
      for (const m of new Set(floats.map((f) => f.mesh))) m.instanceMatrix.needsUpdate = true;
    }
  };
  update(0);

  const dispose = () => {
    for (const c of [...group.children]) { group.remove(c); c.dispose?.(); }
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const t of owned) t.dispose();
  };
  return { stats, update, dispose };
}
