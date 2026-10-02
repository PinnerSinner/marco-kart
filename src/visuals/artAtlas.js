// Texture atlas for the caricature art: every piece a track uses is packed into ONE canvas so that all the flat art (boards, murals, wall
// strips, road decals) is a handful of draw calls instead of one per picture. The packing is pure (Node-safe, deterministic); only
// `createAtlas` touches the DOM, and without a DOM it returns a bare texture, so tests and art-less builds still get correct UV rectangles.
import * as THREE from 'three';
import { Assets } from '../core/assets.js';

/**
 * Shelf-pack rectangles into a square sheet. Pieces are first scaled to fit `maxSide` (never enlarged beyond their own size); if the sheet
 * overflows, every piece shrinks by 15 % and packing restarts, so the result always fits.
 * @param {{key:string,w:number,h:number,max?:number}[]} items natural sizes (`max` overrides maxSide for one piece)
 * @param {{size?:number,maxSide?:number,pad?:number}} [o]
 * @returns {{size:number, scale:number, rects: Map<string,{x:number,y:number,w:number,h:number,u0:number,v0:number,u1:number,v1:number}>}}
 */
export function packAtlas(items, { size = 2048, maxSide = 512, pad = 6 } = {}) {
  let k = 1;
  for (let attempt = 0; attempt < 24; attempt++, k *= 0.85) {
    const sized = items.map((it) => {
      const f = Math.min(1, ((it.max ?? maxSide) * k) / Math.max(it.w, it.h));
      return { key: it.key, w: Math.max(8, Math.round(it.w * f)), h: Math.max(8, Math.round(it.h * f)) };
    }).sort((a, b) => b.h - a.h || (a.key < b.key ? -1 : 1));
    const rects = new Map();
    let x = pad, y = pad, rowH = 0, ok = true;
    for (const it of sized) {
      if (x + it.w + pad > size) { x = pad; y += rowH + pad; rowH = 0; }
      if (y + it.h + pad > size) { ok = false; break; }
      rects.set(it.key, { x, y, w: it.w, h: it.h });
      x += it.w + pad; rowH = Math.max(rowH, it.h);
    }
    if (!ok) continue;
    const inset = 1.25 / size;
    for (const r of rects.values()) { r.u0 = r.x / size + inset; r.u1 = (r.x + r.w) / size - inset; r.v1 = 1 - r.y / size - inset; r.v0 = 1 - (r.y + r.h) / size + inset; }
    return { size, scale: k, rects };
  }
  return { size, scale: 0, rects: new Map() };
}

/** A sub-rectangle of a packed rect (fractions of the rect, v measured upwards like UVs). Used to cut a tile sheet into its quarters. */
export function subRect(r, fu0, fv0, fu1, fv1) {
  const du = r.u1 - r.u0, dv = r.v1 - r.v0;
  return { ...r, u0: r.u0 + du * fu0, u1: r.u0 + du * fu1, v0: r.v0 + dv * fv0, v1: r.v0 + dv * fv1 };
}

const hasDoc = () => typeof document !== 'undefined';

/**
 * Create the atlas texture and fill it from the assets (asynchronously: each cell shows a flat placeholder until its picture decodes).
 * @param {{size:number, rects: Map<string,object>}} layout from packAtlas
 * @param {{alpha?: boolean, custom?: Record<string,(g:CanvasRenderingContext2D, r:object, img: (key:string)=>HTMLImageElement|null)=>void>, A?: typeof Assets, onImage?: ()=>void}} [o]
 *   `custom`: keys that are drawn by code (the hopscotch, for example) instead of loaded from an asset; they may use `img(key)` for decoded pieces.
 * @returns {{texture: THREE.Texture, ready: Promise<void>, dispose: ()=>void}}
 */
export function createAtlas(layout, { alpha = false, custom = {}, A = Assets } = {}) {
  if (!hasDoc()) return { texture: new THREE.Texture(), ready: Promise.resolve(), dispose() {} };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = layout.size;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const palette = ['#ff9a3c', '#22d3ee', '#ff3fa8', '#8f6bff', '#ffd166', '#2ee08a'];
  let n = 0;
  for (const [key, r] of layout.rects) {
    if (!alpha) { g.fillStyle = palette[(n++) % palette.length]; g.fillRect(r.x, r.y, r.w, r.h); }
  }
  tex.needsUpdate = true;
  const images = new Map();
  const get = (key) => images.get(key) ?? null;
  const drawImage = (key, r, img) => {
    g.clearRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    g.drawImage(img, r.x, r.y, r.w, r.h);
    // extrude the border by a few pixels so mip-mapping never bleeds a neighbour into the edge of a piece
    const p = 4;
    g.drawImage(canvas, r.x, r.y, r.w, 1, r.x, r.y - p, r.w, p); g.drawImage(canvas, r.x, r.y + r.h - 1, r.w, 1, r.x, r.y + r.h, r.w, p);
    g.drawImage(canvas, r.x, r.y, 1, r.h, r.x - p, r.y, p, r.h); g.drawImage(canvas, r.x + r.w - 1, r.y, 1, r.h, r.x + r.w, r.y, p, r.h);
    tex.needsUpdate = true;
  };
  const jobs = [];
  for (const [key, r] of layout.rects) {
    if (custom[key]) continue;
    jobs.push(A.image(key).then((img) => { if (img) { images.set(key, img); drawImage(key, r, img); } }).catch(() => {}));
  }
  const ready = Promise.all(jobs).then(() => {
    for (const [key, draw] of Object.entries(custom)) {
      const r = layout.rects.get(key);
      if (!r) continue;
      g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip(); g.clearRect(r.x, r.y, r.w, r.h);
      try { draw(g, r, get); } catch { /* a failed custom piece stays blank */ }
      g.restore();
    }
    tex.needsUpdate = true;
  });
  return { texture: tex, ready, dispose() { tex.dispose(); } };
}

/**
 * Merged textured quads: every flat piece of art on a track (boards, murals, wall strips, road decals) goes into ONE BufferGeometry so it is
 * one draw call. Corners are given as [x,y,z] arrays in the order bottom-left, bottom-right, top-right, top-left (seen from the front, which
 * is the side the normal points to: n = (BR - BL) x (TL - BL)).
 */
export class QuadSet {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; this.count = 0; }

  /** @param {number[][]} c four corners @param {{u0:number,v0:number,u1:number,v1:number}} r uv rectangle (v1 is the top) @param {number[]} [rgb] tint / brightness */
  quad(c, r, rgb = [1, 1, 1]) {
    const [a, b, , d] = c;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const uvs = [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]];
    const base = this.count;
    for (let i = 0; i < 4; i++) {
      this.pos.push(c[i][0], c[i][1], c[i][2]); this.nrm.push(nx, ny, nz); this.uv.push(uvs[i][0], uvs[i][1]); this.col.push(rgb[0], rgb[1], rgb[2]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
    return this;
  }

  /** A vertical or free panel from a centre, a unit `right` vector (along the picture's u) and `up`, with the given size. */
  panel(cx, cy, cz, right, up, w, h, r, rgb) {
    const hx = w / 2, hy = h / 2, p = (sx, sy) => [cx + right[0] * hx * sx + up[0] * hy * sy, cy + right[1] * hx * sx + up[1] * hy * sy, cz + right[2] * hx * sx + up[2] * hy * sy];
    return this.quad([p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)], r, rgb);
  }

  get triangles() { return this.idx.length / 3; }

  /** @returns {THREE.BufferGeometry|null} null when empty */
  build() {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65000 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
