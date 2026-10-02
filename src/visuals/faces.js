// Face atlases: one canvas per character with five expression cells (neutral / happy / sad / hit / boost), drawn in a
// clean cartoon style and mapped onto a curved patch on the head. Marco's atlas is built from `marco_face(_happy/_sad)`
// photos when the assets exist (async upgrade, no pop: the procedural face is shown until the photo decodes): every photo
// is aligned on the eyes, exposure/saturation matched, feathered into the head, and the expressions the photos cannot
// supply (sad, hit, boost) are made with a tint, droop/zoom and cartoon overlays (tear, brows, stars, speed lines).
// The pixel helpers are pure and exported for tests. Everything returns null / empty without a DOM.
import * as THREE from 'three';
import { Assets } from '../core/assets.js';
import { makeToonMaterial } from './toon.js';
import { makeCanvas, toTexture, ell, rrect, starPath } from './canvas.js';

export const EXPRESSIONS = ['neutral', 'happy', 'sad', 'hit', 'boost'];
const CELL = 256;
const INK = '#2b1c22';

/** Expression parameters shared by the character face painters. */
const E = {
  neutral: { open: 1, tilt: 0, lift: 0, mouth: 'smile' },
  happy: { open: 0, tilt: -0.06, lift: -10, mouth: 'grin', squint: true },
  sad: { open: 0.92, tilt: 0.5, lift: -2, mouth: 'frown', tear: true },
  hit: { open: 1, tilt: -0.18, lift: -16, mouth: 'o', cross: true },
  boost: { open: 0.6, tilt: -0.6, lift: 6, mouth: 'grit', lines: true },
};

// ---- drawing primitives -------------------------------------------------------------------------------------------

function brow(ctx, cx, y, len, thick, tilt, side, colour, arch = 0.2) {
  const ox = cx + side * len / 2, ix = cx - side * len / 2;
  const oy = y + tilt * len * 0.5, iy = y - tilt * len * 0.5;
  ctx.strokeStyle = colour; ctx.lineWidth = thick; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.quadraticCurveTo((ox + ix) / 2, (oy + iy) / 2 - len * arch, ix, iy); ctx.stroke();
}

function eye(ctx, cx, cy, r, e, o = {}) {
  const ink = o.ink ?? INK;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (e.squint) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.36;
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.55, r * 0.85, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    return;
  }
  if (e.cross) {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.32;
    const k = r * 0.68;
    ctx.beginPath(); ctx.moveTo(cx - k, cy - k); ctx.lineTo(cx + k, cy + k); ctx.moveTo(cx + k, cy - k); ctx.lineTo(cx - k, cy + k); ctx.stroke();
    return;
  }
  const rx = r * 0.86, ry = r * 1.18 * Math.max(0.3, e.open);
  ell(ctx, cx, cy, rx, ry, '#ffffff', ink, r * 0.15);
  const ir = Math.min(rx * 0.98, ry * 0.94) * (o.iris ?? 0.86);
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
  const ix = cx + (o.lookX ?? 0), iy = cy + ry * 0.1 + (o.lookY ?? 0);
  ell(ctx, ix, iy, ir, ir, o.irisColor ?? '#6b4423');
  ell(ctx, ix, iy, ir * 0.55, ir * 0.55, '#120b0d');
  ctx.restore();
  ell(ctx, ix - ir * 0.34, iy - ir * 0.36, ir * 0.3, ir * 0.3, '#ffffff');
  ell(ctx, ix + ir * 0.32, iy + ir * 0.3, ir * 0.14, ir * 0.14, 'rgba(255,255,255,0.9)');
  // heavy top lid line
  ctx.strokeStyle = ink; ctx.lineWidth = r * 0.24;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  if (o.lashes) {
    ctx.lineWidth = r * 0.16;
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * (1.12 + i * 0.1) + (o.lashSide ?? 0) * 0.0;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
      ctx.lineTo(cx + Math.cos(a) * (rx + r * 0.36), cy + Math.sin(a) * (ry + r * 0.32) - r * 0.06);
      ctx.stroke();
    }
  }
}

function mouth(ctx, cx, cy, w, kind, o = {}) {
  const ink = o.ink ?? INK;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = ink; ctx.lineWidth = w * 0.075;
  if (kind === 'smile') {
    ctx.beginPath(); ctx.moveTo(cx - w * 0.42, cy - w * 0.03); ctx.quadraticCurveTo(cx, cy + w * 0.34, cx + w * 0.46, cy - w * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w * 0.46, cy - w * 0.1); ctx.lineTo(cx + w * 0.5, cy - w * 0.16); ctx.stroke();
  } else if (kind === 'grin') {
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.5, cy - w * 0.08);
    ctx.quadraticCurveTo(cx, cy + w * 0.06, cx + w * 0.5, cy - w * 0.08);
    ctx.quadraticCurveTo(cx + w * 0.36, cy + w * 0.5, cx, cy + w * 0.52);
    ctx.quadraticCurveTo(cx - w * 0.36, cy + w * 0.5, cx - w * 0.5, cy - w * 0.08);
    ctx.closePath();
    ctx.fillStyle = '#7c1d2b'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - w * 0.55, cy - w * 0.12, w * 1.1, w * 0.2);
    ell(ctx, cx, cy + w * 0.48, w * 0.28, w * 0.2, '#f0607a');
    ctx.restore();
    ctx.stroke();
  } else if (kind === 'frown') {
    ctx.beginPath(); ctx.moveTo(cx - w * 0.36, cy + w * 0.1); ctx.quadraticCurveTo(cx, cy - w * 0.2, cx + w * 0.36, cy + w * 0.1); ctx.stroke();
  } else if (kind === 'o') {
    ell(ctx, cx, cy + w * 0.06, w * 0.19, w * 0.26, '#7c1d2b', ink, w * 0.075);
    ell(ctx, cx, cy + w * 0.16, w * 0.11, w * 0.09, '#f0607a');
  } else if (kind === 'grit') {
    rrect(ctx, cx - w * 0.44, cy - w * 0.1, w * 0.88, w * 0.3, w * 0.09);
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
    ctx.lineWidth = w * 0.045;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.44, cy + w * 0.05); ctx.lineTo(cx + w * 0.44, cy + w * 0.05); ctx.stroke();
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * w * 0.16, cy - w * 0.1); ctx.lineTo(cx + i * w * 0.16, cy + w * 0.2); ctx.stroke(); }
  }
}

function teardrop(ctx, x, y, s, col = '#63c7ff') {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x + s * 0.9, y + s * 0.2, x, y + s);
  ctx.quadraticCurveTo(x - s * 0.9, y + s * 0.2, x, y - s);
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = s * 0.16; ctx.stroke();
  ell(ctx, x - s * 0.25, y, s * 0.16, s * 0.28, 'rgba(255,255,255,0.85)');
}

function decor(ctx, S, e, o = {}) {
  if (e.tear) teardrop(ctx, o.tearX ?? S * 0.27, o.tearY ?? S * 0.6, S * 0.05);
  if (e.cross) {
    for (const [x, y, r, a] of [[0.2, 0.16, 0.06, 0.3], [0.8, 0.14, 0.07, -0.2], [0.5, 0.08, 0.045, 0]]) {
      starPath(ctx, x * S, y * S, r * S, 5, 0.45, -Math.PI / 2 + a);
      ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = S * 0.012; ctx.stroke();
    }
  }
  if (e.lines) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineCap = 'round'; ctx.lineWidth = S * 0.018;
    for (const [x0, y0, x1] of [[0.02, 0.36, 0.14], [0.03, 0.5, 0.17], [0.02, 0.64, 0.12], [0.98, 0.36, 0.86], [0.97, 0.5, 0.83], [0.98, 0.64, 0.88]]) {
      ctx.beginPath(); ctx.moveTo(x0 * S, y0 * S); ctx.lineTo(x1 * S, y0 * S); ctx.stroke();
    }
  }
  if (e.squint && o.blush !== false) {
    // happy sparkle by the cheeks
    starPath(ctx, S * 0.16, S * 0.3, S * 0.035, 4, 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  }
}

function blush(ctx, S, y = 0.62, a = 0.32, col = '255,110,120') {
  for (const x of [0.22, 0.78]) {
    const g = ctx.createRadialGradient(x * S, y * S, 0, x * S, y * S, S * 0.12);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(x * S - S * 0.14, y * S - S * 0.14, S * 0.28, S * 0.28);
  }
}

// ---- photo pipeline -------------------------------------------------------------------------------------------------
// Pure pixel helpers work on RGBA byte arrays (S x S) so they can be unit tested without a canvas.

/** Layout of the aligned photo inside one square cell (fractions of the cell size) and the exposure target. */
export const PHOTO_FACE = {
  eyeMid: [0.5, 0.41], eyeDist: 0.35, rest: -0.1,
  core: { cx: 0.5, cy: 0.53, rx: 0.19, ry: 0.28 },
  feather: { cx: 0.5, cy: 0.52, rx: 0.46, rxL: 0.35, ry: 0.52, inner: 0.5, rxR: 0.4 },
  erode: 0.012, soften: 0.022,
  target: { mean: 0.55, std: 0.15, sat: 0.4 },
  pivot: [0.5, 0.6],
};

/** Eye positions (fractions of the source image, viewer-left / viewer-right eye) of the shipped photos. */
const PHOTO_LANDMARKS = {
  marco_face: { l: [0.254, 0.41], r: [0.453, 0.355], nudge: [0.03, 0.01] },
  marco_face_happy: { l: [0.41, 0.523], r: [0.58, 0.441], nudge: [0.012, 0.01] },
};
/** Mouth centre of the neutral photo (fraction of the image): where the cartoon frown / "o" of sad and hit is drawn. */
const MOUTH_NEUTRAL = [0.4, 0.566];
const DEFAULT_LANDMARKS = { l: [0.36, 0.42], r: [0.64, 0.42] };

/**
 * Similarity transform that puts the two eyes of a photo at the standard place in the cell, levelled to `PHOTO_FACE.rest`.
 * Canvas order: translate(mid) rotate(rot) scale(scale) translate(-src).
 * @param {{l: number[], r: number[], nudge?: number[]}} lm eye positions as fractions of the image; `nudge` moves the anchor
 *   (fractions of the image) so the visual centre of the face, not the eye midpoint, lands on the head centre
 * @param {number} w @param {number} h image size in px @param {number} S cell size in px
 * @returns {{scale: number, rot: number, sx: number, sy: number, tx: number, ty: number}}
 */
export function alignTransform(lm, w, h, S, P = PHOTO_FACE) {
  const lx = lm.l[0] * w, ly = lm.l[1] * h, rx = lm.r[0] * w, ry = lm.r[1] * h;
  const dist = Math.hypot(rx - lx, ry - ly) || 1;
  return { scale: (P.eyeDist * S) / dist, rot: P.rest - Math.atan2(ry - ly, rx - lx), sx: (lx + rx) / 2 + (lm.nudge?.[0] ?? 0) * w, sy: (ly + ry) / 2 + (lm.nudge?.[1] ?? 0) * h, tx: P.eyeMid[0] * S, ty: P.eyeMid[1] * S };
}

/** Map a source-pixel point through an `alignTransform`. @returns {[number, number]} */
export function alignPoint(t, x, y) {
  const dx = (x - t.sx) * t.scale, dy = (y - t.sy) * t.scale, c = Math.cos(t.rot), s = Math.sin(t.rot);
  return [t.tx + dx * c - dy * s, t.ty + dx * s + dy * c];
}

/**
 * Mean / spread of luminance and mean saturation over the face core (opaque pixels inside an ellipse).
 * @param {ArrayLike<number>} px RGBA bytes @param {number} S cell size
 * @returns {{mean: number, std: number, sat: number, n: number, rgb: number[]}} luminance 0..1
 */
export function measureFace(px, S, core = PHOTO_FACE.core) {
  let n = 0, sl = 0, sl2 = 0, ss = 0, r = 0, g = 0, b = 0;
  const cx = core.cx * S, cy = core.cy * S, rx = core.rx * S, ry = core.ry * S;
  for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(S, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(S, Math.ceil(cx + rx)); x++) {
      const ex = (x - cx) / rx, ey = (y - cy) / ry;
      if (ex * ex + ey * ey > 1) continue;
      const i = (y * S + x) * 4;
      if (px[i + 3] < 128) continue;
      const R = px[i] / 255, G = px[i + 1] / 255, B = px[i + 2] / 255;
      const l = 0.2126 * R + 0.7152 * G + 0.0722 * B, mx = Math.max(R, G, B);
      n++; sl += l; sl2 += l * l; ss += mx > 0.001 ? (mx - Math.min(R, G, B)) / mx : 0; r += R; g += G; b += B;
    }
  }
  if (!n) return { mean: 0.5, std: PHOTO_FACE.target.std, sat: PHOTO_FACE.target.sat, n: 0, rgb: [0.9, 0.7, 0.6] };
  const mean = sl / n;
  return { mean, std: Math.sqrt(Math.max(0, sl2 / n - mean * mean)), sat: ss / n, n, rgb: [r / n, g / n, b / n] };
}

/**
 * Auto-levels an RGBA buffer in place so its face core matches `to` (mean luminance, luminance spread, saturation).
 * @param {Uint8ClampedArray|number[]} px @param {{mean: number, std: number, sat: number}} from measured with `measureFace`
 * @param {{mean: number, std: number, sat: number}} [to]
 * @returns {{contrast: number, chroma: number}} gains applied
 */
export function matchLevels(px, from, to = PHOTO_FACE.target) {
  const k = Math.min(2.2, Math.max(0.7, to.std / Math.max(from.std, 1e-3)));
  const g = Math.min(1.6, Math.max(0.35, to.sat / Math.max(from.sat, 1e-3)));
  for (let i = 0; i < px.length; i += 4) {
    const R = px[i] / 255, G = px[i + 1] / 255, B = px[i + 2] / 255;
    const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    const l2 = to.mean + (l - from.mean) * k;
    px[i] = Math.round(Math.min(1, Math.max(0, l2 + (R - l) * g)) * 255);
    px[i + 1] = Math.round(Math.min(1, Math.max(0, l2 + (G - l) * g)) * 255);
    px[i + 2] = Math.round(Math.min(1, Math.max(0, l2 + (B - l) * g)) * 255);
  }
  return { contrast: k, chroma: g };
}

/** Multiplies alpha by a soft elliptical falloff (1 inside `inner` of the radius, smoothly 0 at the rim). */
export function featherMask(px, S, F = PHOTO_FACE.feather) {
  const cx = F.cx * S, cy = F.cy * S, rxR = (F.rxR ?? F.rx) * S, rxL = (F.rxL ?? F.rx) * S, ry = F.ry * S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const ex = (x - cx) / (x < cx ? rxL : rxR), ey = (y - cy) / ry, r = Math.sqrt(ex * ex + ey * ey);
      const t = Math.min(1, Math.max(0, (r - F.inner) / (1 - F.inner)));
      const i = (y * S + x) * 4 + 3;
      px[i] = Math.round(px[i] * (1 - t * t * (3 - 2 * t)));
    }
  }
}

/**
 * Shrinks the opaque area (min filter on alpha, square window) so the bright halo of a cut-out edge is dropped.
 * @param {Uint8ClampedArray|number[]} px RGBA @param {number} S size @param {number} radius px
 */
export function erodeAlpha(px, S, radius) {
  const r = Math.max(0, Math.round(radius));
  if (!r) return;
  const line = new Uint8Array(S);
  const pass = (stride, step) => {
    for (let a = 0; a < S; a++) {
      const base = a * step * 4 + 3;
      for (let i = 0; i < S; i++) line[i] = px[base + i * stride * 4];
      for (let i = 0; i < S; i++) {
        let m = 255;
        for (let k = Math.max(0, i - r); k <= Math.min(S - 1, i + r); k++) if (line[k] < m) m = line[k];
        px[base + i * stride * 4] = m;
      }
    }
  };
  pass(1, S); pass(S, 1);
}

/**
 * Blurs the alpha channel in place (two box passes) so cut-out silhouettes fade instead of ending in a hard line.
 * @param {Uint8ClampedArray|number[]} px RGBA @param {number} S size @param {number} radius px
 */
export function softenAlpha(px, S, radius) {
  const r = Math.max(0, Math.round(radius));
  if (!r) return;
  const line = new Float32Array(S), out = new Float32Array(S);
  const pass = (stride, step) => {
    for (let a = 0; a < S; a++) {
      const base = a * step * 4 + 3;
      for (let i = 0; i < S; i++) line[i] = px[base + i * stride * 4];
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += line[Math.min(S - 1, Math.max(0, i))];
      for (let i = 0; i < S; i++) {
        out[i] = sum / (2 * r + 1);
        sum += line[Math.min(S - 1, i + r + 1)] - line[Math.max(0, i - r)];
      }
      for (let i = 0; i < S; i++) px[base + i * stride * 4] = Math.round(out[i]);
    }
  };
  for (let n = 0; n < 2; n++) { pass(1, S); pass(S, 1); }
}

/**
 * Gives fully transparent pixels the colour `fill` (in place). Canvas storage loses the colour of alpha-0 pixels (black),
 * and bilinear / mip filtering on the GPU would then darken every soft edge with a black fringe.
 * @param {Uint8ClampedArray|number[]} px RGBA @param {number[]} fill 0..255 rgb
 */
export function bleedTransparent(px, fill) {
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 6) { px[i] = fill[0]; px[i + 1] = fill[1]; px[i + 2] = fill[2]; }
  }
}

/** Desaturate and colour-multiply an RGBA buffer in place (the sad / hit look). @param {{sat: number, mul: number[]}} o */
export function tintPixels(px, { sat, mul }) {
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    for (let c = 0; c < 3; c++) px[i + c] = Math.min(255, Math.max(0, Math.round((l + (px[i + c] - l) * sat) * mul[c])));
  }
}

/** `tintPixels` for one rgb colour (0..1 components). @returns {number[]} */
export function tintRgb([r, g, b], { sat, mul }) {
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [r, g, b].map((v, i) => Math.min(1, Math.max(0, (l + (v - l) * sat) * mul[i])));
}

const TINT_SAD = { sat: 0.5, mul: [0.84, 0.92, 1.1] };
const TINT_HIT = { sat: 0.72, mul: [0.96, 0.92, 1.08] };

/** How each expression treats the aligned photo: droop/zoom about the pivot plus which cartoon overlays are drawn. */
const PHOTO_EXPR = {
  neutral: { roll: 0, dx: 0, dy: 0, zoom: 1 },
  happy: { roll: -0.025, dx: 0, dy: 0, zoom: 1.02, sparkle: true },
  sad: { roll: -0.14, dx: -0.012, dy: 0.05, zoom: 1, tint: 'sad', brows: { tilt: 0.7, y: -0.085 }, tear: true, mouth: 'frown' },
  hit: { roll: 0.15, dx: 0.012, dy: 0.035, zoom: 1.04, tint: 'hit', brows: { tilt: 0.45, y: -0.1 }, stars: true, sweat: true, mouth: 'o' },
  boost: { roll: 0.03, dx: 0, dy: -0.005, zoom: 1.1, brows: { tilt: -0.42, y: -0.08 }, lines: true, sparkle: true },
};

function readPixels(canvas) {
  const c = canvas.getContext('2d', { willReadFrequently: true });
  return { ctx: c, data: c.getImageData(0, 0, canvas.width, canvas.height) };
}

/**
 * Align, exposure-match and feather one photo into an S x S canvas.
 * @param {CanvasImageSource & {width: number, height: number}} img @param {string} key asset key (picks the eye landmarks)
 * @param {number} S
 * @returns {{canvas: any, stats: object}|null}
 */
function buildPhotoLayer(img, key, S) {
  const canvas = makeCanvas(S, S);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const t = alignTransform(PHOTO_LANDMARKS[key] ?? DEFAULT_LANDMARKS, img.width, img.height, S);
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(t.tx, t.ty); ctx.rotate(t.rot); ctx.scale(t.scale, t.scale); ctx.translate(-t.sx, -t.sy);
  ctx.drawImage(img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  let stats = null;
  try {
    const { data } = readPixels(canvas);
    stats = measureFace(data.data, S);
    matchLevels(data.data, stats);
    erodeAlpha(data.data, S, PHOTO_FACE.erode * S);
    softenAlpha(data.data, S, PHOTO_FACE.soften * S);
    featherMask(data.data, S);
    stats.skin = measureFace(data.data, S).rgb;
    ctx.putImageData(data, 0, 0);
  } catch (e) {
    // pixel access can be blocked (tainted canvas): keep the aligned photo and only soften the rim with a gradient
    ctx.globalCompositeOperation = 'destination-in';
    const F = PHOTO_FACE.feather, g = ctx.createRadialGradient(F.cx * S, F.cy * S, F.rx * S * F.inner, F.cx * S, F.cy * S, F.rx * S);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
  }
  return { canvas, stats };
}

/** Copy of a layer with a colour tint applied (used for the sad / hit looks). */
function tintedLayer(layer, S, tint) {
  const canvas = makeCanvas(S, S);
  if (!canvas || !layer) return layer;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(layer, 0, 0);
  try {
    const img = ctx.getImageData(0, 0, S, S);
    tintPixels(img.data, tint);
    ctx.putImageData(img, 0, 0);
  } catch { /* keep the untinted copy */ }
  return canvas;
}

/** Build every photo layer of an atlas (aligned + matched) plus the tinted sad / hit variants. */
function buildLayers(at) {
  const S = at.cell;
  at.layers = {};
  for (const [key, img] of Object.entries(at.photos)) {
    const l = buildPhotoLayer(img, key, S);
    if (l) { at.layers[key] = l.canvas; at.skin = at.skin ?? l.stats?.skin; }
  }
  const base = at.layers.marco_face ?? at.layers.marco_face_happy ?? at.layers.marco_face_sad ?? null;
  at.layers.base = base;
  const bi = at.photos.marco_face ?? at.photos.marco_face_happy ?? at.photos.marco_face_sad;
  const bk = at.photos.marco_face ? 'marco_face' : at.photos.marco_face_happy ? 'marco_face_happy' : 'marco_face_sad';
  if (bi) {
    const t = alignTransform(PHOTO_LANDMARKS[bk] ?? DEFAULT_LANDMARKS, bi.width, bi.height, S);
    at.mouth = alignPoint(t, (bk === 'marco_face' ? MOUTH_NEUTRAL[0] : 0.586) * bi.width, (bk === 'marco_face' ? MOUTH_NEUTRAL[1] : 0.654) * bi.height);
  }
  at.layers.sad = at.layers.marco_face_sad ?? tintedLayer(base, S, TINT_SAD);
  at.layers.hit = tintedLayer(at.layers.marco_face_sad ?? base, S, TINT_HIT);
  at.layers.happy = at.layers.marco_face_happy ?? base;
  at.layers.neutral = base;
  at.layers.boost = at.layers.happy;
}

function sparkle4(ctx, x, y, r) {
  starPath(ctx, x, y, r, 4, 0.28);
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = 'rgba(43,28,34,0.55)'; ctx.lineWidth = r * 0.16; ctx.stroke();
}

/** Hide the photo's smile under a soft skin patch and draw a cartoon frown / open "o" over it. */
function drawMouth(ctx, S, kind, [mx, my], skin) {
  const c = (skin ?? [0.85, 0.6, 0.5]).map((v) => Math.round(v * 255));
  ctx.save();
  ctx.translate(mx, my); ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.2);
  g.addColorStop(0, `rgba(${c},0.97)`); g.addColorStop(0.75, `rgba(${c},0.9)`); g.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = g; ctx.fillRect(-S * 0.2, -S * 0.2, S * 0.4, S * 0.4);
  ctx.restore();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'frown') {
    ctx.strokeStyle = '#4b2621'; ctx.lineWidth = S * 0.02;
    ctx.beginPath(); ctx.moveTo(mx - S * 0.11, my + S * 0.025); ctx.quadraticCurveTo(mx, my - S * 0.05, mx + S * 0.11, my + S * 0.025); ctx.stroke();
  } else {
    ell(ctx, mx, my + S * 0.012, S * 0.036, S * 0.05, '#6e1f2c', '#3b1a1d', S * 0.012);
    ell(ctx, mx, my + S * 0.03, S * 0.022, S * 0.018, '#e9667d');
  }
}

/** Marco's photo cell: the aligned photo (drooped / zoomed per expression) with cartoon overlays drawn in the face frame. */
function paintPhotoCell(ctx, S, name, at) {
  const x = PHOTO_EXPR[name] ?? PHOTO_EXPR.neutral, P = PHOTO_FACE;
  const layer = at.layers[name] ?? at.layers.base;
  const d = P.eyeDist * S;
  ctx.save();
  ctx.translate(P.pivot[0] * S, P.pivot[1] * S);
  ctx.rotate(x.roll); ctx.scale(x.zoom, x.zoom);
  ctx.translate(x.dx * S - P.pivot[0] * S, x.dy * S - P.pivot[1] * S);
  ctx.drawImage(layer, 0, 0);
  if (x.mouth && at.mouth && !at.layers.marco_face_sad) drawMouth(ctx, S, x.mouth, at.mouth, x.tint && at.skin ? tintRgb(at.skin, x.tint === 'sad' ? TINT_SAD : TINT_HIT) : at.skin);
  // face frame: origin = between the eyes, x along the eye line
  ctx.translate(P.eyeMid[0] * S, P.eyeMid[1] * S); ctx.rotate(P.rest);
  if (x.brows) {
    for (const side of [-1, 1]) brow(ctx, side * d * 0.5, x.brows.y * S, d * 0.5, S * 0.032, x.brows.tilt, side, '#2a180d', 0.16);
  }
  if (x.tear) {
    teardrop(ctx, -d * 0.52, S * 0.118, S * 0.05);
    ell(ctx, -d * 0.5, S * 0.05, d * 0.2, S * 0.012, 'rgba(160,225,255,0.55)');
  }
  if (x.sweat) teardrop(ctx, d * 0.98, -S * 0.1, S * 0.038, '#bfeaff');
  ctx.restore();
  if (x.stars) {
    for (const [px, py, r, a] of [[0.15, 0.5, 0.05, 0.3], [0.87, 0.44, 0.058, -0.2], [0.8, 0.7, 0.036, 0.1]]) {
      starPath(ctx, px * S, py * S, r * S, 5, 0.45, -Math.PI / 2 + a);
      ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = S * 0.012; ctx.stroke();
    }
  }
  if (x.lines) {
    // speed lines streaming off both temples
    ctx.lineCap = 'round';
    for (const [x0, y0, x1, y1] of [[0.14, 0.3, 0.02, 0.3], [0.19, 0.42, 0.03, 0.42], [0.12, 0.54, 0.02, 0.54]]) {
      for (const m of [0, 1]) {
        const ax = m ? 1 - x0 : x0, bx = m ? 1 - x1 : x1;
        ctx.strokeStyle = INK; ctx.lineWidth = S * 0.032; ctx.beginPath(); ctx.moveTo(ax * S, y0 * S); ctx.lineTo(bx * S, y1 * S); ctx.stroke();
        ctx.strokeStyle = '#fff6c4'; ctx.lineWidth = S * 0.017; ctx.beginPath(); ctx.moveTo(ax * S, y0 * S); ctx.lineTo(bx * S, y1 * S); ctx.stroke();
      }
    }
  }
  if (x.sparkle) { sparkle4(ctx, S * 0.16, S * 0.5, S * 0.04); sparkle4(ctx, S * 0.85, S * 0.64, S * 0.03); }
}

// ---- per-character painters (ctx is translated to the cell origin; S = cell size) ---------------------------------

const PAINTERS = {
  marco(ctx, S, e) {
    blush(ctx, S, 0.63, e.squint ? 0.5 : 0.3);
    // stubble
    ctx.fillStyle = 'rgba(70,45,35,0.32)';
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 90; i++) {
      const a = Math.PI * (0.15 + 0.7 * rnd()), rr = S * (0.34 + 0.09 * rnd());
      ctx.fillRect(S / 2 + Math.cos(a) * rr * 1.0 - 1, S * 0.5 + Math.sin(a) * rr * 0.92 - 1, 2.4, 2.4);
    }
    const ey = S * 0.44 + e.lift * 0.15, dx = S * 0.195, r = S * 0.094;
    eye(ctx, S / 2 - dx, ey, r, e, { irisColor: '#5b4a2c', lookX: e.tear ? S * 0.008 : 0 });
    eye(ctx, S / 2 + dx, ey, r, e, { irisColor: '#5b4a2c', lookX: e.tear ? -S * 0.008 : 0 });
    brow(ctx, S / 2 - dx, S * 0.285 + e.lift * 0.6, S * 0.25, S * 0.055, e.tilt, -1, '#3a2213');
    brow(ctx, S / 2 + dx, S * 0.285 + e.lift * 0.6, S * 0.25, S * 0.055, e.tilt, 1, '#3a2213');
    mouth(ctx, S / 2, S * 0.735, S * 0.3, e.mouth);
    decor(ctx, S, e);
  },

  subnet(ctx, S, e) {
    blush(ctx, S, 0.6, 0.4);
    const ey = S * 0.44 + e.lift * 0.15, dx = S * 0.15, r = S * 0.075;
    eye(ctx, S / 2 - dx, ey, r, e, { irisColor: '#2f6fdd' });
    eye(ctx, S / 2 + dx, ey, r, e, { irisColor: '#2f6fdd' });
    brow(ctx, S / 2 - dx, S * 0.335 + e.lift * 0.6, S * 0.21, S * 0.05, e.tilt, -1, '#e9e9ee');
    brow(ctx, S / 2 + dx, S * 0.335 + e.lift * 0.6, S * 0.21, S * 0.05, e.tilt, 1, '#e9e9ee');
    // bulbous nose
    ell(ctx, S / 2, S * 0.57, S * 0.06, S * 0.05, '#f0a48a', INK, S * 0.012);
    // mouth hidden behind the great white moustache; only the open bits peek out below
    if (e.mouth === 'grin' || e.mouth === 'o' || e.mouth === 'grit') mouth(ctx, S / 2, S * 0.79, S * 0.16, e.mouth);
    else if (e.mouth === 'frown') mouth(ctx, S / 2, S * 0.83, S * 0.14, 'frown');
    // handlebar moustache
    ctx.fillStyle = '#f4f4f7'; ctx.strokeStyle = INK; ctx.lineWidth = S * 0.014; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(S * 0.5, S * 0.6);
    ctx.bezierCurveTo(S * 0.4, S * 0.58, S * 0.27, S * 0.63, S * 0.2, S * 0.7);
    ctx.bezierCurveTo(S * 0.15, S * 0.6, S * 0.2, S * 0.56, S * 0.2, S * 0.58);
    ctx.bezierCurveTo(S * 0.15, S * 0.74, S * 0.4, S * 0.73, S * 0.5, S * 0.68);
    ctx.bezierCurveTo(S * 0.6, S * 0.73, S * 0.85, S * 0.74, S * 0.8, S * 0.58);
    ctx.bezierCurveTo(S * 0.8, S * 0.56, S * 0.85, S * 0.6, S * 0.8, S * 0.7);
    ctx.bezierCurveTo(S * 0.73, S * 0.63, S * 0.6, S * 0.58, S * 0.5, S * 0.6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    decor(ctx, S, e, { tearX: S * 0.32, tearY: S * 0.56 });
  },

  lambda(ctx, S, e) {
    blush(ctx, S, 0.64, 0.42, '255,140,110');
    ctx.fillStyle = 'rgba(70,35,20,0.5)';
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) ell(ctx, S / 2 + sx * (S * 0.09 + rnd() * S * 0.14), S * 0.55 + rnd() * S * 0.05, 2.2, 2.2, 'rgba(90,45,25,0.55)');
    const ey = S * 0.45 + e.lift * 0.15, dx = S * 0.185, r = S * 0.098;
    eye(ctx, S / 2 - dx, ey, r, e, { irisColor: '#b0621f', lashes: true });
    eye(ctx, S / 2 + dx, ey, r, e, { irisColor: '#b0621f', lashes: true });
    brow(ctx, S / 2 - dx, S * 0.29 + e.lift * 0.6, S * 0.22, S * 0.038, e.tilt, -1, '#2a160d', 0.28);
    brow(ctx, S / 2 + dx, S * 0.29 + e.lift * 0.6, S * 0.22, S * 0.038, e.tilt, 1, '#2a160d', 0.28);
    mouth(ctx, S / 2, S * 0.74, S * 0.28, e.mouth);
    decor(ctx, S, e);
  },

  packet(ctx, S, e) {
    // dark visor glass
    rrect(ctx, S * 0.08, S * 0.2, S * 0.84, S * 0.62, S * 0.14);
    const bg = ctx.createLinearGradient(0, S * 0.2, 0, S * 0.82);
    bg.addColorStop(0, '#171a3a'); bg.addColorStop(1, '#0a0b1c');
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = '#ffbe0b'; ctx.lineWidth = S * 0.028; ctx.stroke();
    const glow = '#5cf2ff';
    ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = S * 0.05; ctx.strokeStyle = glow; ctx.fillStyle = glow; ctx.lineCap = 'round'; ctx.lineWidth = S * 0.04;
    const ey = S * 0.45, dx = S * 0.19;
    for (const sx of [-1, 1]) {
      const cx = S / 2 + sx * dx;
      if (e.squint) { ctx.beginPath(); ctx.arc(cx, ey + S * 0.03, S * 0.06, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      else if (e.cross) { const k = S * 0.045; ctx.beginPath(); ctx.moveTo(cx - k, ey - k); ctx.lineTo(cx + k, ey + k); ctx.moveTo(cx + k, ey - k); ctx.lineTo(cx - k, ey + k); ctx.stroke(); }
      else if (e.lines) { ctx.beginPath(); ctx.moveTo(cx - sx * S * 0.05, ey - S * 0.045); ctx.lineTo(cx + sx * S * 0.05, ey); ctx.lineTo(cx - sx * S * 0.05, ey + S * 0.045); ctx.stroke(); }
      else { ell(ctx, cx, ey, S * 0.055, S * 0.07 * Math.max(0.5, e.open), glow); if (e.tear) { ctx.fillStyle = '#7fd0ff'; ctx.fillRect(cx + sx * S * 0.02 - 3, ey + S * 0.09, 6, S * 0.06); ctx.fillStyle = glow; } }
    }
    ctx.lineWidth = S * 0.03;
    const my = S * 0.64;
    ctx.beginPath();
    if (e.mouth === 'smile') { ctx.moveTo(S * 0.42, my); ctx.quadraticCurveTo(S * 0.5, my + S * 0.05, S * 0.58, my); }
    else if (e.mouth === 'grin') { ctx.moveTo(S * 0.38, my - S * 0.01); ctx.quadraticCurveTo(S * 0.5, my + S * 0.13, S * 0.62, my - S * 0.01); ctx.closePath(); ctx.fill(); }
    else if (e.mouth === 'frown') { ctx.moveTo(S * 0.42, my + S * 0.04); ctx.quadraticCurveTo(S * 0.5, my - S * 0.03, S * 0.58, my + S * 0.04); }
    else if (e.mouth === 'o') { ctx.arc(S * 0.5, my + S * 0.02, S * 0.035, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.moveTo(S * 0.4, my); ctx.lineTo(S * 0.44, my - S * 0.02); ctx.lineTo(S * 0.48, my + S * 0.02); ctx.lineTo(S * 0.52, my - S * 0.02); ctx.lineTo(S * 0.56, my + S * 0.02); ctx.lineTo(S * 0.6, my); }
    ctx.stroke();
    ctx.restore();
    // crack + glare
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = S * 0.011; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(S * 0.78, S * 0.2); ctx.lineTo(S * 0.7, S * 0.36); ctx.lineTo(S * 0.75, S * 0.44); ctx.lineTo(S * 0.6, S * 0.6); ctx.lineTo(S * 0.63, S * 0.7); ctx.lineTo(S * 0.52, S * 0.82);
    ctx.moveTo(S * 0.7, S * 0.36); ctx.lineTo(S * 0.56, S * 0.33); ctx.moveTo(S * 0.6, S * 0.6); ctx.lineTo(S * 0.46, S * 0.62); ctx.moveTo(S * 0.75, S * 0.44); ctx.lineTo(S * 0.86, S * 0.5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.beginPath(); ctx.moveTo(S * 0.1, S * 0.26); ctx.lineTo(S * 0.42, S * 0.2); ctx.lineTo(S * 0.18, S * 0.78); ctx.lineTo(S * 0.1, S * 0.7); ctx.closePath(); ctx.fill();
  },

  carlos(ctx, S, e) {
    blush(ctx, S, 0.66, 0.25);
    const ey = S * 0.44 + e.lift * 0.2, dx = S * 0.2;
    const skew = e.cross ? 0.16 : 0;
    // brows above the shades
    brow(ctx, S / 2 - dx, S * 0.25 + e.lift * 0.7, S * 0.25, S * 0.055, e.tilt, -1, '#1d120c');
    brow(ctx, S / 2 + dx, S * 0.25 + e.lift * 0.7, S * 0.25, S * 0.055, e.tilt, 1, '#1d120c');
    // sunglasses
    ctx.save(); ctx.translate(S / 2, ey + S * (e.cross ? 0.05 : 0)); ctx.rotate(skew);
    ctx.fillStyle = '#12121a'; ctx.strokeStyle = '#000'; ctx.lineWidth = S * 0.02; ctx.lineJoin = 'round';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * S * 0.04, -S * 0.09); ctx.lineTo(sx * S * 0.38, -S * 0.09);
      ctx.quadraticCurveTo(sx * S * 0.41, S * 0.09, sx * S * 0.27, S * 0.13);
      ctx.quadraticCurveTo(sx * S * 0.08, S * 0.14, sx * S * 0.04, -S * 0.04);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(120,200,255,0.5)';
      ctx.beginPath(); ctx.moveTo(sx * S * 0.12, -S * 0.06); ctx.lineTo(sx * S * 0.2, -S * 0.06); ctx.lineTo(sx * S * 0.13, S * 0.06); ctx.lineTo(sx * S * 0.09, S * 0.06); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#12121a';
    }
    ctx.lineWidth = S * 0.028; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.moveTo(-S * 0.05, -S * 0.06); ctx.lineTo(S * 0.05, -S * 0.06); ctx.stroke();
    ctx.restore();
    if (e.tear) teardrop(ctx, S * 0.24, S * 0.62, S * 0.045);
    // goatee
    ctx.fillStyle = '#1d120c';
    ctx.beginPath(); ctx.moveTo(S * 0.38, S * 0.8); ctx.quadraticCurveTo(S * 0.5, S * 0.98, S * 0.62, S * 0.8); ctx.quadraticCurveTo(S * 0.5, S * 0.86, S * 0.38, S * 0.8); ctx.fill();
    ell(ctx, S / 2, S * 0.62, S * 0.035, S * 0.025, 'rgba(120,60,30,0.5)');
    mouth(ctx, S / 2, S * 0.73, S * 0.34, e.mouth === 'smile' ? 'grin' : e.mouth);
    decor(ctx, S, e, { tearX: S * 0.26, tearY: S * 0.64 });
  },

  tilly(ctx, S, e) {
    blush(ctx, S, 0.63, 0.55, '255,100,120');
    const ey = S * 0.44 + e.lift * 0.15, dx = S * 0.185, r = S * 0.08;
    eye(ctx, S / 2 - dx, ey, r, e, { irisColor: '#3d7fb5', lashes: true });
    eye(ctx, S / 2 + dx, ey, r, e, { irisColor: '#3d7fb5', lashes: true });
    // gold round glasses
    ctx.strokeStyle = '#d4a63a'; ctx.lineWidth = S * 0.022;
    for (const sx of [-1, 1]) ell(ctx, S / 2 + sx * dx, ey, S * 0.13, S * 0.13, 'rgba(200,235,255,0.14)', '#d4a63a', S * 0.022);
    ctx.beginPath(); ctx.moveTo(S / 2 - dx + S * 0.13, ey - S * 0.01); ctx.quadraticCurveTo(S / 2, ey - S * 0.05, S / 2 + dx - S * 0.13, ey - S * 0.01); ctx.stroke();
    brow(ctx, S / 2 - dx, S * 0.26 + e.lift * 0.6, S * 0.22, S * 0.03, e.tilt, -1, '#9aa1ad', 0.3);
    brow(ctx, S / 2 + dx, S * 0.26 + e.lift * 0.6, S * 0.22, S * 0.03, e.tilt, 1, '#9aa1ad', 0.3);
    // lipstick smile
    mouth(ctx, S / 2, S * 0.74, S * 0.26, e.mouth, { ink: '#b31f4c' });
    decor(ctx, S, e, { tearX: S * 0.3, tearY: S * 0.6 });
  },

  rex(ctx, S, e) {
    rrect(ctx, S * 0.06, S * 0.2, S * 0.88, S * 0.6, S * 0.1);
    const bg = ctx.createLinearGradient(0, S * 0.2, 0, S * 0.8);
    bg.addColorStop(0, '#04150c'); bg.addColorStop(1, '#010a05');
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = '#0f2a1a'; ctx.lineWidth = S * 0.03; ctx.stroke();
    const G = '#25ff8c';
    ctx.save();
    ctx.shadowColor = G; ctx.shadowBlur = S * 0.045; ctx.fillStyle = G; ctx.strokeStyle = G; ctx.lineCap = 'square'; ctx.lineWidth = S * 0.045;
    const ey = S * 0.42, dx = S * 0.2, w = S * 0.11;
    for (const sx of [-1, 1]) {
      const cx = S / 2 + sx * dx;
      if (e.squint) { ctx.beginPath(); ctx.moveTo(cx - w, ey + S * 0.04); ctx.lineTo(cx, ey - S * 0.04); ctx.lineTo(cx + w, ey + S * 0.04); ctx.stroke(); }
      else if (e.cross) { const k = S * 0.055; ctx.beginPath(); ctx.moveTo(cx - k, ey - k); ctx.lineTo(cx + k, ey + k); ctx.moveTo(cx + k, ey - k); ctx.lineTo(cx - k, ey + k); ctx.stroke(); }
      else if (e.lines) { ctx.beginPath(); ctx.moveTo(cx - sx * w * 0.9, ey - S * 0.06); ctx.lineTo(cx + sx * w * 0.9, ey); ctx.lineTo(cx - sx * w * 0.9, ey + S * 0.06); ctx.stroke(); }
      else { ctx.fillRect(cx - w / 2, ey - S * 0.07 * Math.max(0.5, e.open), w, S * 0.14 * Math.max(0.5, e.open)); }
    }
    const my = S * 0.62;
    ctx.lineWidth = S * 0.04;
    ctx.beginPath();
    if (e.mouth === 'smile') { ctx.moveTo(S * 0.4, my - S * 0.02); ctx.lineTo(S * 0.44, my + S * 0.03); ctx.lineTo(S * 0.56, my + S * 0.03); ctx.lineTo(S * 0.6, my - S * 0.02); }
    else if (e.mouth === 'grin') { ctx.moveTo(S * 0.36, my - S * 0.02); ctx.lineTo(S * 0.42, my + S * 0.07); ctx.lineTo(S * 0.58, my + S * 0.07); ctx.lineTo(S * 0.64, my - S * 0.02); ctx.closePath(); ctx.fill(); }
    else if (e.mouth === 'frown') { ctx.moveTo(S * 0.4, my + S * 0.05); ctx.lineTo(S * 0.44, my); ctx.lineTo(S * 0.56, my); ctx.lineTo(S * 0.6, my + S * 0.05); }
    else if (e.mouth === 'o') { ctx.rect(S * 0.46, my - S * 0.03, S * 0.08, S * 0.09); }
    else { ctx.moveTo(S * 0.38, my); ctx.lineTo(S * 0.62, my); ctx.moveTo(S * 0.44, my - S * 0.03); ctx.lineTo(S * 0.44, my + S * 0.03); ctx.moveTo(S * 0.5, my - S * 0.03); ctx.lineTo(S * 0.5, my + S * 0.03); ctx.moveTo(S * 0.56, my - S * 0.03); ctx.lineTo(S * 0.56, my + S * 0.03); }
    ctx.stroke();
    ctx.font = `700 ${S * 0.05}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.6;
    ctx.fillText(['$ sudo', '$ 200 OK', '$ 403', '$ segfault', '$ ./go --fast'][EXPRESSIONS.findIndex((n) => E[n] === e)] ?? '$', S * 0.12, S * 0.27);
    ctx.restore();
    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = S * 0.22; y < S * 0.8; y += 5) ctx.fillRect(S * 0.07, y, S * 0.86, 1.6);
  },

  // Biscuit: row 0 = eyes behind racing goggles, row 1 = muzzle/mouth
  biscuit(ctx, S, e, _photo, row) {
    if (row === 0) {
      const ey = S * 0.5 + e.lift * 0.2, dx = S * 0.22, r = S * 0.19;
      // goggle strap edge fade
      for (const sx of [-1, 1]) {
        const cx = S / 2 + sx * dx;
        ell(ctx, cx, ey, r * 1.12, r * 1.05, '#e63946', INK, S * 0.02);
        ell(ctx, cx, ey, r * 0.9, r * 0.86, '#bfefff', INK, S * 0.014);
        ctx.save(); ctx.beginPath(); ctx.ellipse(cx, ey, r * 0.9, r * 0.86, 0, 0, Math.PI * 2); ctx.clip();
        const gg = ctx.createLinearGradient(cx - r, ey - r, cx + r, ey + r);
        gg.addColorStop(0, '#dff8ff'); gg.addColorStop(1, '#79c6e8');
        ctx.fillStyle = gg; ctx.fillRect(cx - r, ey - r, r * 2, r * 2);
        // pupil
        const py = ey + (e.tear ? r * 0.2 : 0);
        if (e.squint) { ctx.strokeStyle = INK; ctx.lineWidth = r * 0.24; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, py + r * 0.35, r * 0.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
        else if (e.cross) { ctx.strokeStyle = INK; ctx.lineWidth = r * 0.22; ctx.lineCap = 'round'; const k = r * 0.42; ctx.beginPath(); ctx.moveTo(cx - k, py - k); ctx.lineTo(cx + k, py + k); ctx.moveTo(cx + k, py - k); ctx.lineTo(cx - k, py + k); ctx.stroke(); }
        else {
          const pr = r * 0.52 * (e.open < 0.7 ? 0.8 : 1);
          ell(ctx, cx, py, pr, pr * (e.open < 0.7 ? 0.7 : 1), '#2a1a12');
          ell(ctx, cx - pr * 0.3, py - pr * 0.35, pr * 0.32, pr * 0.32, '#fff');
          ell(ctx, cx + pr * 0.35, py + pr * 0.3, pr * 0.15, pr * 0.15, 'rgba(255,255,255,0.9)');
        }
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.moveTo(cx - r * 0.7, ey - r * 0.3); ctx.lineTo(cx - r * 0.2, ey - r * 0.75); ctx.lineTo(cx - r * 0.5, ey + r * 0.1); ctx.closePath(); ctx.fill();
        ctx.restore();
        // bridge
      }
      ctx.strokeStyle = '#e63946'; ctx.lineWidth = S * 0.05; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(S / 2 - dx + r * 1.05, ey); ctx.lineTo(S / 2 + dx - r * 1.05, ey); ctx.stroke();
      // brows
      brow(ctx, S / 2 - dx, S * 0.2 + e.lift * 0.5, S * 0.2, S * 0.05, e.tilt, -1, '#8a5a1a', 0.3);
      brow(ctx, S / 2 + dx, S * 0.2 + e.lift * 0.5, S * 0.2, S * 0.05, e.tilt, 1, '#8a5a1a', 0.3);
      if (e.lines) decor(ctx, S, { lines: true }, {});
      if (e.cross) decor(ctx, S, { cross: true }, {});
    } else {
      // muzzle mouth (nose is geometry)
      ctx.strokeStyle = INK; ctx.lineWidth = S * 0.03; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const cx = S / 2, my = S * 0.42;
      ctx.beginPath(); ctx.moveTo(cx, S * 0.16); ctx.lineTo(cx, my); ctx.stroke();
      if (e.mouth === 'smile' || e.mouth === 'grin') {
        ctx.beginPath(); ctx.moveTo(cx, my); ctx.quadraticCurveTo(cx - S * 0.12, my + S * 0.14, cx - S * 0.3, my - S * 0.02); ctx.moveTo(cx, my); ctx.quadraticCurveTo(cx + S * 0.12, my + S * 0.14, cx + S * 0.3, my - S * 0.02); ctx.stroke();
        if (e.mouth === 'grin') { ell(ctx, cx, my + S * 0.16, S * 0.1, S * 0.16, '#f0607a', INK, S * 0.02); }
      } else if (e.mouth === 'frown') {
        ctx.beginPath(); ctx.moveTo(cx, my); ctx.quadraticCurveTo(cx - S * 0.1, my - S * 0.05, cx - S * 0.26, my + S * 0.08); ctx.moveTo(cx, my); ctx.quadraticCurveTo(cx + S * 0.1, my - S * 0.05, cx + S * 0.26, my + S * 0.08); ctx.stroke();
      } else if (e.mouth === 'o') {
        ell(ctx, cx, my + S * 0.1, S * 0.09, S * 0.12, '#7c1d2b', INK, S * 0.025);
      } else {
        rrect(ctx, cx - S * 0.2, my, S * 0.4, S * 0.13, S * 0.04); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
        ctx.lineWidth = S * 0.018; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * S * 0.075, my); ctx.lineTo(cx + i * S * 0.075, my + S * 0.13); ctx.stroke(); }
      }
    }
  },
};

// per-character atlas definition: painter, rows, cell size, and (Marco) the photo assets the atlas is built from
const FACE_DEFS = {
  marco: { rows: 1, cell: 320, photos: ['marco_face', 'marco_face_happy', 'marco_face_sad'] },
  subnet: { rows: 1 }, lambda: { rows: 1 }, packet: { rows: 1, emissive: true }, carlos: { rows: 1 }, tilly: { rows: 1 }, rex: { rows: 1, emissive: true },
  biscuit: { rows: 2 },
};

const atlases = new Map();

function redraw(at) {
  const { ctx, def, painter } = at;
  const S = at.cell;
  ctx.clearRect(0, 0, at.canvas.width, at.canvas.height);
  for (let row = 0; row < def.rows; row++) {
    for (let i = 0; i < EXPRESSIONS.length; i++) {
      const name = EXPRESSIONS[i];
      ctx.save();
      ctx.translate(i * S, row * S);
      ctx.beginPath(); ctx.rect(0, 0, S, S); ctx.clip();
      if (at.layers?.base) paintPhotoCell(ctx, S, name, at);
      else painter(ctx, S, E[name], null, row);
      ctx.restore();
    }
  }
  if (at.layers?.base && at.skin) {
    try {
      const img = ctx.getImageData(0, 0, at.canvas.width, at.canvas.height);
      bleedTransparent(img.data, at.skin.map((v) => Math.round(v * 255)));
      ctx.putImageData(img, 0, 0);
    } catch { /* pixel access blocked: the soft edges keep a faint dark fringe */ }
  }
  at.texture.needsUpdate = true;
}

/**
 * Atlas for a character (canvas + texture), created on first use. Null without a DOM.
 * `hasPhoto` turns true once Marco's photos have decoded and the photo cells replace the procedural ones.
 * @param {string} charId
 * @returns {{canvas: any, ctx: CanvasRenderingContext2D, texture: THREE.CanvasTexture, rows: number, cell: number, hasPhoto: boolean, listeners: Set<() => void>}|null}
 */
export function getFaceAtlas(charId) {
  if (atlases.has(charId)) return atlases.get(charId);
  const def = FACE_DEFS[charId];
  const painter = PAINTERS[charId];
  const cell = def?.cell ?? CELL;
  const canvas = def && painter ? makeCanvas(cell * EXPRESSIONS.length, cell * def.rows) : null;
  if (!canvas) { atlases.set(charId, null); return null; }
  const at = { canvas, ctx: canvas.getContext('2d', def.photos ? { willReadFrequently: true } : undefined), texture: toTexture(canvas, { aniso: 4 }), rows: def.rows, cell, def, painter, photos: {}, layers: null, mouth: null, hasPhoto: false, disposed: false, listeners: new Set() };
  redraw(at);
  atlases.set(charId, at);
  const keys = (def.photos ?? []).filter((k) => Assets.has(k));
  if (keys.length) {
    Promise.all(keys.map((k) => Assets.image(k).then((img) => { if (img) at.photos[k] = img; }))).then(() => {
      if (at.disposed || !Object.keys(at.photos).length) return;
      buildLayers(at);
      at.hasPhoto = !!at.layers.base;
      if (at.hasPhoto) { redraw(at); for (const fn of at.listeners) fn(true); }
    });
  }
  return at;
}

/**
 * Curved face patches on a head sphere, driven by an expression name.
 * @param {string} charId
 * @param {{R?:number, plane?:number[], phiLen?:number, thetaLen?:number, thetaC?:number, row?:number, pos?:number[], scale?:number[], lift?:number, planar?:{cx:number, cy:number, w:number, h:number}}[]} patches
 *   `planar`: map the cell by orthographic front projection onto the patch (centre + size in head-local metres)
 * @returns {{meshes: THREE.Mesh[], setExpression: (name: string) => void, usesPhoto: () => boolean, onPhoto: (fn: (has: boolean) => void) => void, dispose: () => void}}
 *   `usesPhoto` / `onPhoto`: whether the face shows a real photo (so procedural features such as a nose mesh must hide)
 */
export function createFacePatches(charId, patches) {
  const at = getFaceAtlas(charId);
  const meshes = [];
  const geos = [];
  if (!at) return { meshes, setExpression() {}, usesPhoto: () => false, onPhoto() {}, dispose() {} };
  const mat = makeToonMaterial({ map: at.texture, vertexColors: false, transparent: true, rim: at.def.photos ? 0 : 0.12, spec: 0, cacheKey: `face-${charId}` });
  if (at.def.photos) { mat.emissive.setHex(0xffffff); mat.emissiveMap = at.texture; mat.emissiveIntensity = 0.3; } // keeps the photo readable in the toon shadow bands
  mat.depthWrite = false;
  if (at.def.emissive) { mat.emissive.setHex(0xffffff); mat.emissiveMap = at.texture; mat.emissiveIntensity = 1.0; }
  mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
  for (const p of patches) {
    const phiLen = p.phiLen ?? 1.7, thetaLen = p.thetaLen ?? phiLen, thetaC = p.thetaC ?? Math.PI / 2;
    const g = p.plane
      ? new THREE.PlaneGeometry(p.plane[0], p.plane[1])
      : new THREE.SphereGeometry(p.R * (p.lift ?? 1.007), p.planar ? 40 : 24, p.planar ? 32 : 18, Math.PI / 2 - phiLen / 2, phiLen, thetaC - thetaLen / 2, thetaLen);
    if (p.scale) g.scale(p.scale[0], p.scale[1], p.scale[2]);
    if (p.pos) g.translate(p.pos[0], p.pos[1], p.pos[2]);
    if (p.planar) {
      // front-orthographic projection (a photo projected onto the head): no foreshortening squash towards the chin
      const pl = p.planar, pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - pl.cx) / pl.w + 0.5, (pos.getY(i) - pl.cy) / pl.h + 0.5);
    }
    g.userData.baseUV = Float32Array.from(g.attributes.uv.array);
    g.userData.row = p.row ?? 0;
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 2;
    m.castShadow = false;
    meshes.push(m); geos.push(g);
  }
  const cols = EXPRESSIONS.length, rows = at.rows;
  let current = -1;
  const setExpression = (name) => {
    const idx = Math.max(0, EXPRESSIONS.indexOf(name));
    if (idx === current) return;
    current = idx;
    for (const g of geos) {
      const uv = g.attributes.uv, base = g.userData.baseUV, row = g.userData.row;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (idx + base[i * 2]) / cols, (rows - 1 - row + base[i * 2 + 1]) / rows);
      uv.needsUpdate = true;
    }
  };
  setExpression('neutral');
  const hooks = [];
  const usesPhoto = () => at.hasPhoto;
  const onPhoto = (fn) => { hooks.push(fn); at.listeners.add(fn); if (at.hasPhoto) fn(true); };
  return { meshes, setExpression, usesPhoto, onPhoto, dispose() { for (const g of geos) g.dispose(); for (const fn of hooks) at.listeners.delete(fn); } };
}

/** Free every atlas texture (tests / hot reload). */
export function disposeFaceAtlases() {
  for (const a of atlases.values()) { if (a) { a.disposed = true; a.texture.dispose(); } }
  atlases.clear();
}
