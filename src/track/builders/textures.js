// Procedural canvas textures (mipmapped, anisotropic). Every function returns null when no canvas exists (plain Node),
// so tracks build headlessly; materials must therefore tolerate `map: null` (they just fall back to the colour).
import * as THREE from 'three';
import { makeRng } from '../../core/util.js';
import { tileFbm2, tileNoise2 } from './noise.js';

const cache = new Map();
export const hasCanvas = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

/** Cache helper: build once per key. */
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

/**
 * Create a canvas texture.
 * @param {number} w @param {number} h pixels
 * @param {(ctx:CanvasRenderingContext2D, w:number, h:number)=>void} draw
 * @param {{repeat?:boolean, srgb?:boolean, aniso?:number, mipmaps?:boolean, nearest?:boolean}} [o]
 * @returns {THREE.CanvasTexture|null}
 */
export function canvasTexture(w, h, draw, { repeat = true, srgb = true, aniso = 8, mipmaps = true, nearest = false } = {}) {
  if (!hasCanvas()) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = mipmaps;
  t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Fill an ImageData pixel-by-pixel. fn(x, y) returns [r, g, b] (0..255). */
export function pixelTexture(w, h, fn, opts) {
  return canvasTexture(w, h, (ctx) => {
    const img = ctx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = fn(x, y), i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] ?? 255;
    }
    ctx.putImageData(img, 0, 0);
  }, opts);
}

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** Neutral tileable detail noise (grey ~0.75..1.0): multiply with vertex colours for grass / sand / earth. */
export function detailTexture({ kind = 'grass', seed = 3, size = 256 } = {}) {
  return cached(`detail:${kind}:${seed}:${size}`, () => pixelTexture(size, size, (x, y) => {
    const u = x / size, v = y / size;
    let n = tileFbm2(u, v, 6, 4, seed);
    if (kind === 'sand') n = 0.6 * n + 0.4 * (0.5 + 0.5 * Math.sin((u * 14 + n * 3) * Math.PI * 2 * 0.5));   // ripples
    else if (kind === 'grass') n = 0.7 * n + 0.3 * tileNoise2(u * 96, v * 96, 96, seed + 9);              // blades
    else n = 0.75 * n + 0.25 * tileNoise2(u * 64, v * 64, 64, seed + 5);
    const g = Math.round(255 * (0.72 + 0.28 * n));
    return [g, g, g];
  }));
}

/** Asphalt: dark aggregate with speckle. 16 m per repeat is a good default. */
export function asphaltTexture({ base = 0x3a3d45, seed = 5, size = 512, wet = false } = {}) {
  return cached(`asphalt:${base}:${seed}:${size}:${wet}`, () => {
    const [r, g, b] = rgb(base); const rng = makeRng(seed);
    return pixelTexture(size, size, (x, y) => {
      const u = x / size, v = y / size;
      let n = 0.82 + 0.3 * (tileFbm2(u, v, 8, 3, seed) - 0.5) + 0.22 * (tileNoise2(u * 128, v * 128, 128, seed + 4) - 0.5);
      const sp = tileNoise2(u * 256, v * 256, 256, seed + 11);
      if (sp > 0.93) n += wet ? 0.1 : 0.18; else if (sp < 0.05) n -= 0.12;
      return [r * n, g * n, b * n];
    });
  });
}

/** Copacabana wave mosaic: black and white bands with sinusoidal edges; u across the road, v along it. */
export function mosaicTexture({ size = 1024, bands = 8, waves = 2, amp = 0.045, tessera = 4, seed = 9 } = {}) {
  return cached(`mosaic:${size}:${bands}:${waves}:${amp}:${tessera}`, () => {
    const rng = makeRng(seed);
    const cells = size / tessera, jit = new Float32Array(cells * cells);
    for (let i = 0; i < jit.length; i++) jit[i] = rng();
    return pixelTexture(size, size, (x, y) => {
      const cx = Math.floor(x / tessera), cy = Math.floor(y / tessera);
      const u = (cx + 0.5) / cells, v = (cy + 0.5) / cells;
      const phase = v * waves * Math.PI * 2;
      const w = u * bands + Math.sin(phase) * amp * bands * 0.8 + Math.sin(phase * 2 + 1.3 + u * 6) * amp * bands * 0.25;
      const band = ((Math.floor(w) % 2) + 2) % 2;
      const j = 0.92 + 0.08 * jit[cy * cells + cx];
      const grout = (x % tessera === 0 || y % tessera === 0) ? 0.72 : 1;
      const base = band ? 236 : 22;
      const val = Math.max(0, Math.min(255, base * j * grout + (band ? 0 : 6 * grout)));
      return [val, val, val * (band ? 0.985 : 1.06)];
    });
  });
}


/**
 * Brick courses (running bond) with per-brick tone variation and darker mortar; tint with vertex colours. One repeat = 8 bricks x 16 courses
 * (~2.4 m at 0.3 x 0.15 m bricks).
 */
export function brickTexture({ mortar = 0.62, seed = 4, size = 256 } = {}) {
  return cached(`brick:${mortar}:${seed}:${size}`, () => {
    const rng = makeRng(seed), cols = 8, rows = 16, bw = size / cols, bh = size / rows;
    const tone = new Float32Array(cols * rows * 2).map(() => 0.82 + 0.18 * rng());
    return pixelTexture(size, size, (x, y) => {
      const row = Math.floor(y / bh), off = row % 2 ? bw / 2 : 0, xx = (x + off) % size, col = Math.floor(xx / bw);
      const lx = xx - col * bw, ly = y - row * bh, edge = lx < 1.6 || ly < 1.6;
      const n = 0.9 + 0.1 * tileNoise2(x / size * 40, y / size * 40, 40, seed);
      const v = edge ? mortar : tone[row * cols + col] * n;
      const g = Math.round(255 * Math.min(1, v));
      return [g, g, g];
    });
  });
}

/** Black iron railings on transparent: vertical bars with spear tips and two rails. u along, v up; alphaTest it. */
export function railingTexture({ bars = 8, size = 256 } = {}) {
  return cached(`railing:${bars}:${size}`, () => canvasTexture(size, size, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#17181d';
    const bw = Math.max(3, w / bars / 6);
    for (let i = 0; i < bars; i++) {
      const x = (i + 0.5) * (w / bars);
      ctx.fillRect(x - bw / 2, h * 0.12, bw, h * 0.88);
      ctx.beginPath(); ctx.moveTo(x - bw * 1.2, h * 0.12); ctx.lineTo(x, 0); ctx.lineTo(x + bw * 1.2, h * 0.12); ctx.closePath(); ctx.fill();
    }
    ctx.fillRect(0, h * 0.2, w, h * 0.05); ctx.fillRect(0, h * 0.82, w, h * 0.05);
  }, { aniso: 4 }));
}

/** Red / white kerb stripes (v along the road, 1 repeat = 2 stripes). */
export function kerbTexture({ a = 0xd62839, b = 0xf5f5f0 } = {}) {
  return cached(`kerb:${a}:${b}`, () => canvasTexture(64, 128, (ctx, w, h) => {
    ctx.fillStyle = hex(a); ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = hex(b); ctx.fillRect(0, h / 2, w, h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, h / 2, w, 3);
  }));
}

/** Wooden planks (u across, v along). */
export function plankTexture({ base = 0xb8763c, seed = 2, size = 256 } = {}) {
  return cached(`planks:${base}:${seed}`, () => {
    const [r, g, b] = rgb(base);
    return pixelTexture(size, size, (x, y) => {
      const u = x / size, v = y / size, plank = Math.floor(u * 8), pu = u * 8 - plank;
      let n = 0.85 + 0.25 * (tileFbm2(u * 0.9, v * 8, 4, 2, seed + plank) - 0.5) + (pu < 0.05 || pu > 0.95 ? -0.28 : 0);
      n *= 0.9 + 0.2 * ((Math.sin(plank * 12.9898) * 43758.5453) % 1 + 1) % 1;
      return [r * n, g * n, b * n];
    });
  });
}

/** Tileable tangent-space normal map of small ripples (for animated water). */
export function waterNormalTexture({ size = 256, strength = 2.2, seed = 12 } = {}) {
  return cached(`waternormal:${size}:${strength}`, () => {
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = tileFbm2(x / size, y / size, 6, 4, seed);
    return pixelTexture(size, size, (x, y) => {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
      const nx = (l - r) * strength, ny = (u - d) * strength, nz = 1, len = Math.hypot(nx, ny, nz);
      return [(nx / len * 0.5 + 0.5) * 255, (ny / len * 0.5 + 0.5) * 255, (nz / len * 0.5 + 0.5) * 255];
    }, { srgb: false });
  });
}

/**
 * Window facade tile: white wall (tinted by vertex colours) with glazing. One tile = one floor x one bay.
 * The top-left texel region is plain wall, so roofs can point their UVs at (0.03, 0.03).
 * @param {{kind?:'balcony'|'sash'|'shop'|'tower', glass?:number, frame?:number, size?:number}} [o]
 */
export function facadeTexture({ kind = 'balcony', glass = 0x4a86b8, frame = 0xf2efe6, size = 256, seed = 1 } = {}) {
  return cached(`facade:${kind}:${glass}:${frame}:${size}`, () => canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    const g = hex(glass), f = hex(frame);
    const pane = (x, y, ww, hh, mullions) => {
      const grad = ctx.createLinearGradient(0, y, 0, y + hh);
      grad.addColorStop(0, '#ffffff33'); grad.addColorStop(0.35, g); grad.addColorStop(1, '#16304d');
      ctx.fillStyle = f; ctx.fillRect(x - 5, y - 5, ww + 10, hh + 10);
      ctx.fillStyle = grad; ctx.fillRect(x, y, ww, hh);
      ctx.fillStyle = f;
      for (let i = 1; i < mullions[0]; i++) ctx.fillRect(x + (ww * i) / mullions[0] - 1.5, y, 3, hh);
      for (let i = 1; i < mullions[1]; i++) ctx.fillRect(x, y + (hh * i) / mullions[1] - 1.5, ww, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x - 5, y + hh + 5, ww + 10, 5);
    };
    if (kind === 'balcony') {
      pane(w * 0.24, h * 0.3, w * 0.52, h * 0.56, [2, 1]);
      ctx.fillStyle = 'rgba(30,30,40,0.55)'; ctx.fillRect(w * 0.1, h * 0.78, w * 0.8, 7);
      for (let i = 0; i <= 12; i++) ctx.fillRect(w * 0.1 + (w * 0.8 * i) / 12 - 1, h * 0.78, 2.5, h * 0.2);
      ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(0, h * 0.965, w, h * 0.035);
    } else if (kind === 'sash') {
      pane(w * 0.28, h * 0.2, w * 0.44, h * 0.6, [2, 3]);
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(w * 0.22, h * 0.86, w * 0.56, 6);
    } else if (kind === 'shop') {
      pane(w * 0.08, h * 0.16, w * 0.84, h * 0.7, [3, 1]);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, h * 0.92, w, h * 0.08);
    } else {
      pane(w * 0.08, h * 0.12, w * 0.84, h * 0.72, [4, 1]);
    }
  }, { size }));
}

/** Vertical-gradient sky used as an equirectangular reflection map (wet roads, puddles). */
export function skyEnvTexture({ top = 0x8894a3, horizon = 0xc8ced6, ground = 0x555a63, w = 256, h = 128 } = {}) {
  return cached(`skyenv:${top}:${horizon}:${ground}`, () => {
    const t = canvasTexture(w, h, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hex(top)); g.addColorStop(0.5, hex(horizon)); g.addColorStop(0.52, hex(ground)); g.addColorStop(1, hex(ground));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const rng = makeRng(4);
      for (let i = 0; i < 26; i++) { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.ellipse(rng() * w, rng() * h * 0.42, 20 + rng() * 40, 4 + rng() * 8, 0, 0, Math.PI * 2); ctx.fill(); }
    }, { repeat: false, mipmaps: false });
    if (t) t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });
}

/** Chequered flag pattern. */
export function checkerTexture({ n = 8, a = 0xffffff, b = 0x111111 } = {}) {
  return cached(`checker:${n}:${a}:${b}`, () => canvasTexture(n * 16, n * 16, (ctx) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { ctx.fillStyle = (x + y) % 2 ? hex(a) : hex(b); ctx.fillRect(x * 16, y * 16, 16, 16); }
  }, { nearest: true }));
}

/**
 * Banner with big italic text on a coloured board (start gantry). Text lines are drawn centred.
 * @param {string[]} lines
 */
export function bannerTexture(lines, { w = 1024, h = 256, bg = 0x0b1d3a, fg = 0xfff8ec, accent = 0xe63946, accent2 = 0x22d3ee } = {}) {
  return cached(`banner:${lines.join('|')}:${bg}:${fg}`, () => canvasTexture(w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, hex(bg)); g.addColorStop(1, '#050d1c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hex(accent); ctx.fillRect(0, 0, w, 14); ctx.fillStyle = hex(accent2); ctx.fillRect(0, h - 14, w, 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const big = lines.length > 1 ? h * 0.46 : h * 0.6;
    ctx.font = `italic 900 ${big}px "Arial Black", Impact, system-ui, sans-serif`;
    ctx.lineJoin = 'round'; ctx.lineWidth = 14; ctx.strokeStyle = '#000';
    ctx.strokeText(lines[0], w / 2 + 5, h * (lines.length > 1 ? 0.36 : 0.5) + 5);
    ctx.fillStyle = hex(accent); ctx.strokeStyle = '#000'; ctx.strokeText(lines[0], w / 2, h * (lines.length > 1 ? 0.36 : 0.5));
    ctx.fillStyle = hex(fg); ctx.fillText(lines[0], w / 2, h * (lines.length > 1 ? 0.36 : 0.5));
    if (lines[1]) { ctx.font = `italic 800 ${h * 0.2}px "Arial Black", Impact, sans-serif`; ctx.fillStyle = hex(accent2); ctx.fillText(lines[1], w / 2, h * 0.76); }
  }, { repeat: false, aniso: 4 }));
}

/** Generic painted sign face (word on a coloured panel). */
export function signTexture(text, { w = 256, h = 128, bg = 0xffd166, fg = 0x111111, font = 'italic 900 64px "Arial Black", Impact, sans-serif' } = {}) {
  return cached(`sign:${text}:${bg}:${fg}:${w}x${h}`, () => canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = hex(bg); ctx.fillRect(0, 0, w, h); ctx.strokeStyle = hex(fg); ctx.lineWidth = 8; ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = hex(fg); ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 4);
  }, { repeat: false, aniso: 4 }));
}

/** Free-form canvas texture for track-specific art (cached under `key`). */
export function customTexture(key, w, h, draw, opts) { return cached(`custom:${key}`, () => canvasTexture(w, h, draw, opts)); }

/** Drop the cache (tests / hot reload). */
export function clearTextureCache() { for (const t of cache.values()) t?.dispose?.(); cache.clear(); }
