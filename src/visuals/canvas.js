// Canvas helpers. Everything degrades to `null` when there is no DOM (Node tests), so callers must handle null.
import * as THREE from 'three';

/** True when 2D canvases are available. @returns {boolean} */
export function hasCanvas() {
  return typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined';
}

/**
 * Create a canvas or null.
 * @param {number} w @param {number} h
 * @returns {HTMLCanvasElement|OffscreenCanvas|null}
 */
export function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

/**
 * Wrap a canvas in an sRGB CanvasTexture with mipmaps + anisotropy.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {{aniso?: number, mip?: boolean}} [o]
 * @returns {THREE.CanvasTexture}
 */
export function toTexture(canvas, { aniso = 4, mip = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Rounded-rectangle path. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Filled + stroked ellipse. @param {CanvasRenderingContext2D} ctx */
export function ell(ctx, cx, cy, rx, ry, fill, stroke, lw = 0, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke && lw > 0) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

/** Outlined text (ink stroke under a fill). @param {CanvasRenderingContext2D} ctx */
export function inkText(ctx, text, x, y, { font = '900 40px system-ui, sans-serif', fill = '#fff', stroke = '#1b1226', lw = 8, align = 'center' } = {}) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** 5-pointed (or n) star path. @param {CanvasRenderingContext2D} ctx */
export function starPath(ctx, cx, cy, r, n = 5, inner = 0.45, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 === 0 ? r : r * inner;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const texCache = new Map();

/**
 * Small cached "print" texture drawn by `draw(ctx, w, h)`. Returns null with no DOM.
 * @param {string} key cache key
 * @param {number} w @param {number} h
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
 * @returns {THREE.CanvasTexture|null}
 */
export function printTexture(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = makeCanvas(w, h);
  if (!c) { texCache.set(key, null); return null; }
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = toTexture(c, { aniso: 4 });
  texCache.set(key, t);
  return t;
}

/** Drop every cached print texture. */
export function disposePrintTextures() {
  for (const t of texCache.values()) t?.dispose();
  texCache.clear();
}
