// Procedural canvas art for Marcoverse Speedway (null in Node, where there is no canvas: materials fall back to plain colours).
import * as THREE from 'three';
import { canvasTexture } from '../../textures.js';
import { makeRng } from '../../../../core/util.js';

const cache = new Map();
const cached = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

/**
 * Deck plating: 3 x 3 bevelled plates per 18 m repeat (6 m each), a faint forward chevron in every plate, and a matching emissive map
 * (dim glowing seams, bright corner rivets). Direction of travel is canvas "up".
 * @returns {{map: THREE.Texture|null, emissive: THREE.Texture|null}}
 */
export function deckTextures() {
  return cached('deck', () => {
    const N = 3, S = 1024, P = S / N, rng = makeRng(7);
    const tones = Array.from({ length: N * N }, () => 0.88 + 0.24 * rng());
    const chevron = (ctx, cx, cy, w, h, lw) => { ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(cx - w, cy + h); ctx.lineTo(cx, cy - h); ctx.lineTo(cx + w, cy + h); ctx.stroke(); };
    const map = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#0d1030'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = i * P + 6, y = j * P + 6, w = P - 12, t = tones[j * N + i];
        const g = ctx.createLinearGradient(x, y, x + w, y + w);
        g.addColorStop(0, `rgb(${Math.round(58 * t)},${Math.round(66 * t)},${Math.round(140 * t)})`); g.addColorStop(1, `rgb(${Math.round(34 * t)},${Math.round(40 * t)},${Math.round(104 * t)})`);
        ctx.fillStyle = g; ctx.fillRect(x, y, w, w);
        ctx.fillStyle = 'rgba(120,140,255,0.28)'; ctx.fillRect(x, y, w, 5); ctx.fillRect(x, y, 5, w);           // bevel light
        ctx.fillStyle = 'rgba(6,8,30,0.55)'; ctx.fillRect(x, y + w - 6, w, 6); ctx.fillRect(x + w - 6, y, 6, w);    // bevel shade
        ctx.strokeStyle = 'rgba(150,170,255,0.20)'; chevron(ctx, x + w / 2, y + w / 2 + 6, w * 0.24, w * 0.14, 9);
        ctx.strokeStyle = 'rgba(150,170,255,0.10)'; chevron(ctx, x + w / 2, y + w / 2 + 44, w * 0.24, w * 0.14, 9);
        for (let k = 0; k < 90; k++) { ctx.fillStyle = `rgba(255,255,255,${0.02 + 0.05 * rng()})`; ctx.fillRect(x + 14 + rng() * (w - 28), y + 14 + rng() * (w - 28), 3, 3); }   // sparkle
      }
    }, { aniso: 8 });
    const emissive = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = i * P, y = j * P;
        ctx.fillStyle = '#123a9c'; ctx.fillRect(x, y, P, 8); ctx.fillRect(x, y, 8, P);                              // seams glow
        ctx.strokeStyle = '#4a34c8'; chevron(ctx, x + P / 2, y + P / 2 + 6, P * 0.24 * 0.94, P * 0.14, 8);
        ctx.fillStyle = '#26e0ff';
        for (const [dx, dy] of [[24, 24], [P - 34, 24], [24, P - 34], [P - 34, P - 34]]) ctx.fillRect(x + dx, y + dy, 10, 10);   // rivets
        ctx.fillStyle = '#7a4dff'; ctx.fillRect(x + P / 2 - 26, y + 30, 52, 6); ctx.fillRect(x + P / 2 - 26, y + P - 38, 52, 6);
      }
    }, { aniso: 8 });
    return { map, emissive };
  });
}

/** Underside / slab skin: dark metal panels with a bright cyan lip at the top edge of the side skirt (v = 0 side). */
export function slabTextures() {
  return cached('slab', () => {
    const S = 256;
    const map = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#171a44'; ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#0c0e2a'; ctx.fillRect(0, 0, S, 4); ctx.fillRect(0, 0, 4, S); ctx.fillRect(S / 2, 0, 3, S);
      ctx.fillStyle = '#242a66'; ctx.fillRect(8, 8, S / 2 - 14, S - 16); ctx.fillRect(S / 2 + 8, 8, S / 2 - 14, S - 16);
    }, { aniso: 4 });
    const emissive = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
      const g = ctx.createLinearGradient(0, S, 0, S * 0.55); g.addColorStop(0, '#22d3ee'); g.addColorStop(1, '#000');
      ctx.fillStyle = g; ctx.fillRect(0, S * 0.55, S, S * 0.45);                                                 // glow hugging the road edge
      ctx.fillStyle = '#3a2a9a'; ctx.fillRect(S / 2 - 2, 0, 4, S * 0.5);
    }, { aniso: 4 });
    return { map, emissive };
  });
}

/** Jump ramp: dark plate with big hot-orange chevrons pointing up the ramp (canvas up = forward), one per 2.2 m. */
export function rampTextures() {
  return cached('ramp', () => {
    const S = 256;
    const draw = (bg, fg, edge) => (ctx) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = edge; ctx.fillRect(0, 0, 12, S); ctx.fillRect(S - 12, 0, 12, S);
      ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(30, S * 0.9); ctx.lineTo(S / 2, S * 0.42); ctx.lineTo(S - 30, S * 0.9); ctx.lineTo(S - 30, S * 0.9 - 52); ctx.lineTo(S / 2, S * 0.42 + 4 - 4); ctx.lineTo(30, S * 0.9 - 52); ctx.closePath(); ctx.fill();
    };
    return { map: canvasTexture(S, S, draw('#2a1246', '#ff8a3d', '#22d3ee'), { aniso: 8 }), emissive: canvasTexture(S, S, draw('#000', '#ff7a1a', '#22d3ee'), { aniso: 8 }) };
  });
}

/** Soft white blob used for glow sprites, comet heads and star dust (radial falloff). */
export function glowTexture() {
  return cached('glow', () => canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  }, { repeat: false, aniso: 1 }));
}

/** Start / finish gantry banner (two lines, neon on dark glass). */
export function bannerTexture() {
  return cached('banner', () => canvasTexture(2048, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#0a0c30'); g.addColorStop(1, '#161046');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 2048, 256);
    ctx.fillStyle = '#22d3ee'; ctx.fillRect(0, 0, 2048, 8); ctx.fillStyle = '#ff3fb4'; ctx.fillRect(0, 248, 2048, 8);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'italic 900 150px "Arial Black", Impact, system-ui, sans-serif';
    ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 36; ctx.fillStyle = '#e8fbff'; ctx.fillText('MARCO KART', 1024, 116, 1780);
    ctx.shadowColor = '#ff3fb4'; ctx.shadowBlur = 18; ctx.font = '800 46px system-ui, sans-serif'; ctx.fillStyle = '#ffd1f0';
    ctx.fillText('MARCOVERSE SPEEDWAY  ·  START / FINISH', 1024, 214, 1700);
  }, { repeat: false, aniso: 8 }));
}

/** Soft ring for planet coronas: clear in the middle (hidden by the planet anyway), a bright rim at r = `inner`, a long falloff to 1. */
export function coronaTexture(inner = 0.62) {
  return cached(`corona${inner}`, () => canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(inner * 0.96, 'rgba(255,255,255,0.10)'); g.addColorStop(inner, 'rgba(255,255,255,0.85)');
    g.addColorStop(inner + (1 - inner) * 0.18, 'rgba(255,255,255,0.32)'); g.addColorStop(inner + (1 - inner) * 0.5, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  }, { repeat: false, aniso: 1 }));
}

/** Banded gas-giant surface (equirect-ish, u wraps) in the given [css colour] palette. */
export function bandsTexture(key, palette, seed = 5) {
  return cached(`bands:${key}`, () => {
    const rng = makeRng(seed), W = 1024, H = 512;
    return canvasTexture(W, H, (ctx) => {
      let y = 0;
      while (y < H) {
        const h = 10 + rng() * 44; ctx.fillStyle = palette[Math.floor(rng() * palette.length)]; ctx.globalAlpha = 0.9; ctx.fillRect(0, y, W, h + 2); y += h;
      }
      ctx.globalAlpha = 1;
      for (let k = 0; k < 90; k++) {                                                                   // storm swirls
        const x = rng() * W, yy = rng() * H, r = 10 + rng() * 60;
        const g = ctx.createRadialGradient(x, yy, 0, x, yy, r); g.addColorStop(0, `rgba(255,255,255,${0.10 + rng() * 0.12})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save(); ctx.translate(x, yy); ctx.scale(2.6, 0.5); ctx.translate(-x, -yy); ctx.fillStyle = g; ctx.fillRect(x - r, yy - r, 2 * r, 2 * r); ctx.restore();
      }
    }, { aniso: 4 });
  });
}

/** Planet ring: radial stripes across u (inner -> outer) for a RingGeometry with radial UVs. */
export function ringTexture(seed = 3) {
  return cached('ring', () => {
    const rng = makeRng(seed), W = 512;
    return canvasTexture(W, 8, (ctx) => {
      for (let x = 0; x < W; x++) {
        const edge = Math.min(x, W - x) / 24, a = Math.min(1, edge) * (0.25 + 0.75 * rng()) * (Math.sin(x * 0.05) * 0.25 + 0.75);
        const gap = x > W * 0.52 && x < W * 0.56 ? 0.1 : 1;
        ctx.fillStyle = `rgba(${230 + rng() * 25 | 0},${190 + rng() * 40 | 0},${200 + rng() * 40 | 0},${a * gap})`; ctx.fillRect(x, 0, 1, 8);
      }
    }, { repeat: false, aniso: 4 });
  });
}

/** Windows of a huge ring habitat: rows of lit cells (u wraps around the ring, v across its width). */
export function habitatTexture(seed = 8) {
  return cached('habitat', () => {
    const rng = makeRng(seed), W = 2048, H = 128, cells = [];
    for (let x = 0; x < W; x += 16) for (let y = 12; y < H - 8; y += 14) { const r = rng(); cells.push([x, y, r < 0.42 ? (rng() < 0.7 ? '#ffd48a' : '#7fe8ff') : null]); }
    const map = canvasTexture(W, H, (ctx) => {
      ctx.fillStyle = '#20245a'; ctx.fillRect(0, 0, W, H);
      for (const [x, y, lit] of cells) { ctx.fillStyle = lit ? '#1a1c48' : '#3a4288'; ctx.fillRect(x + 2, y, 11, 9); }
    }, { aniso: 4 });
    const emissive = canvasTexture(W, H, (ctx) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      for (const [x, y, lit] of cells) if (lit) { ctx.fillStyle = lit; ctx.fillRect(x + 2, y, 11, 9); }
    }, { aniso: 4 });
    return { map, emissive };
  });
}
