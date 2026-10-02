// Procedural canvas art for Cloud Nine Data Centre. Every function returns null textures in plain Node (no canvas), so the track builds headless.
// Sizes are chosen so the mip chain is deep (anisotropic filtering is set by canvasTexture) and metres-per-pixel is roughly 5 mm to 25 mm.
import * as THREE from 'three';
import { canvasTexture } from '../../textures.js';
import { makeRng } from '../../../../core/util.js';
import { Assets } from '../../../../core/assets.js';

const cache = new Map();
const cached = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const rgba = (c, a) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

export const LED = { cyan: 0x22e6ff, green: 0x3dff86, amber: 0xffb020, magenta: 0xff2fb0, blue: 0x5b7dff, white: 0xd8f4ff };
const speckle = (ctx, rng, n, x0, y0, w, h, colour, amin, amax, size = 2) => {
  for (let i = 0; i < n; i++) { ctx.fillStyle = rgba(colour, amin + (amax - amin) * rng()); ctx.fillRect(x0 + rng() * w, y0 + rng() * h, size, size); }
};

/**
 * Road plating: 4 x 4 plates per 18 m (4.5 m each) with bevels, brushed grain, greasy wheel lanes and bolts. Travel direction is canvas "up".
 * Emissive: faint cyan seams and bolt heads, so the road reads as lit from within.
 */
export function roadTextures() {
  return cached('road', () => {
    const S = 1024, N = 4, P = S / N, rng = makeRng(11);
    const tones = Array.from({ length: N * N }, () => 0.86 + 0.26 * rng());
    const map = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#0b1027'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = i * P + 4, y = j * P + 4, w = P - 8, t = tones[j * N + i];
        const g = ctx.createLinearGradient(x, y, x + w, y + w);
        g.addColorStop(0, `rgb(${Math.round(70 * t)},${Math.round(84 * t)},${Math.round(132 * t)})`); g.addColorStop(1, `rgb(${Math.round(52 * t)},${Math.round(62 * t)},${Math.round(104 * t)})`);
        ctx.fillStyle = g; ctx.fillRect(x, y, w, w);
        for (let k = 0; k < 260; k++) {                                     // brushed grain along the direction of travel
          const gx = x + 4 + rng() * (w - 8), gy = y + 4 + rng() * (w - 30), gl = 8 + rng() * 26;
          ctx.fillStyle = rng() < 0.5 ? 'rgba(200,215,255,0.05)' : 'rgba(0,0,20,0.08)'; ctx.fillRect(gx, gy, 1.5, gl);
        }
        ctx.fillStyle = 'rgba(140,165,255,0.30)'; ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y, 4, w);      // bevel light
        ctx.fillStyle = 'rgba(4,6,24,0.55)'; ctx.fillRect(x, y + w - 5, w, 5); ctx.fillRect(x + w - 5, y, 5, w);   // bevel shade
        ctx.fillStyle = 'rgba(190,205,255,0.5)';
        for (const [dx, dy] of [[14, 14], [w - 14, 14], [14, w - 14], [w - 14, w - 14]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 4.5, 0, 7); ctx.fill(); }
        speckle(ctx, rng, 40, x + 8, y + 8, w - 16, w - 16, 0xffffff, 0.02, 0.08, 2);
      }
      for (const cx of [0.27, 0.73]) {                                     // wheel lanes: darker, greasier
        const g = ctx.createLinearGradient((cx - 0.09) * S, 0, (cx + 0.09) * S, 0);
        g.addColorStop(0, 'rgba(2,3,16,0)'); g.addColorStop(0.5, 'rgba(2,3,16,0.26)'); g.addColorStop(1, 'rgba(2,3,16,0)');
        ctx.fillStyle = g; ctx.fillRect((cx - 0.09) * S, 0, 0.18 * S, S);
      }
    }, { aniso: 16 });
    const emissive = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = i * P, y = j * P;
        ctx.fillStyle = '#0b4f78'; ctx.fillRect(x - 2, y - 2, P + 4, 5); ctx.fillRect(x - 2, y - 2, 5, P + 4);
        ctx.fillStyle = '#1b7fb0'; for (const [dx, dy] of [[18, 18], [P - 18, 18], [18, P - 18], [P - 18, P - 18]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 3, 0, 7); ctx.fill(); }
      }
    }, { aniso: 16 });
    return { map, emissive };
  });
}

/**
 * Rack face: 4 cabinets across (1.2 m each) by 2 stacked (3.4 m each) = 4.8 m x 7.35 m, 1024 x 1536 px (canvas top = top of the wall).
 * Units carry LED cells snapped to an 8 px grid: the emissive map holds ONLY those cells and the material's shader blinks them.
 */
export const RACK = { w: 1024, h: 1536, cell: 8, tileW: 4.8, tileH: 7.35 };
export function rackTextures() {
  return cached('rack', () => {
    const { w: W, h: H, cell: C } = RACK, rng = makeRng(23);
    const cabW = W / 4, unitH = 32, cabTop = [0.1 * 209, 3.6 * 209 + 0.1 * 209];   // canvas y of each cabinet's top edge (px)
    const leds = [];                      // [x, y, colour] (cell-aligned) for the emissive pass
    const palette = [LED.green, LED.cyan, LED.cyan, LED.cyan, LED.cyan, LED.blue, LED.blue, LED.blue, LED.amber, LED.magenta, LED.white];
    const map = canvasTexture(W, H, (ctx) => {
      ctx.fillStyle = '#060a1c'; ctx.fillRect(0, 0, W, H);
      for (let ci = 0; ci < 4; ci++) for (let cj = 0; cj < 2; cj++) {
        const x0 = ci * cabW, y0 = Math.round((0.15 + cj * 3.6) * 209 * 0.98), cw = cabW, ch = Math.round(3.4 * 209 * 0.98);
        // cabinet body
        ctx.fillStyle = '#0d1430'; ctx.fillRect(x0 + 3, y0, cw - 6, ch);
        const g = ctx.createLinearGradient(x0, 0, x0 + cw, 0); g.addColorStop(0, 'rgba(120,150,255,0.16)'); g.addColorStop(0.08, 'rgba(120,150,255,0)'); g.addColorStop(0.92, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,10,0.35)');
        ctx.fillStyle = g; ctx.fillRect(x0 + 3, y0, cw - 6, ch);
        // header plate with a rack id
        ctx.fillStyle = '#131c44'; ctx.fillRect(x0 + 12, y0 + 5, cw - 24, 24);
        ctx.fillStyle = '#8fb6ff'; ctx.font = '700 17px "DejaVu Sans Mono", Consolas, monospace'; ctx.textBaseline = 'middle';
        const id = `${String.fromCharCode(65 + Math.floor(rng() * 12))}${String(Math.floor(rng() * 90) + 10)}-${cj ? 'U' : 'L'}${ci + 1}`;
        ctx.fillText(id, x0 + 20, y0 + 18);
        leds.push([x0 + cw - 40, y0 + 12, rng() < 0.85 ? LED.green : LED.amber], [x0 + cw - 28, y0 + 12, LED.cyan]);
        // server units
        const n = Math.floor((ch - 44) / unitH);
        for (let u = 0; u < n; u++) {
          const uy = y0 + 36 + u * unitH, ux = x0 + 12, uw = cw - 24, kind = rng();
          const tone = 30 + Math.round(rng() * 16);
          ctx.fillStyle = `rgb(${tone - 8},${tone},${tone + 34})`; ctx.fillRect(ux, uy + 1, uw, unitH - 3);
          ctx.fillStyle = 'rgba(160,185,255,0.18)'; ctx.fillRect(ux, uy + 1, uw, 2);
          ctx.fillStyle = 'rgba(0,0,12,0.6)'; ctx.fillRect(ux, uy + unitH - 3, uw, 2);
          // mounting ears + handle
          ctx.fillStyle = '#5c6a9c'; ctx.fillRect(ux, uy + 3, 6, unitH - 8); ctx.fillRect(ux + uw - 6, uy + 3, 6, unitH - 8);
          if (kind < 0.35) {                                                  // vented compute node
            ctx.fillStyle = 'rgba(2,4,20,0.85)'; for (let k = 0; k < 24; k++) ctx.fillRect(ux + 60 + k * 6, uy + 6, 3, unitH - 14);
            for (let k = 0; k < 3; k++) leds.push([ux + 14 + k * 10, uy + 12, palette[Math.floor(rng() * palette.length)]]);
          } else if (kind < 0.62) {                                           // drive bays
            const bays = 8, bw = (uw - 80) / bays;
            for (let b = 0; b < bays; b++) {
              ctx.fillStyle = '#0a1030'; ctx.fillRect(ux + 60 + b * bw, uy + 5, bw - 4, unitH - 12);
              ctx.fillStyle = 'rgba(150,175,255,0.22)'; ctx.fillRect(ux + 60 + b * bw, uy + 5, bw - 4, 2);
              leds.push([Math.floor((ux + 62 + b * bw + bw * 0.5) / C) * C, uy + 18, rng() < 0.55 ? LED.cyan : rng() < 0.8 ? LED.green : LED.amber]);
            }
            leds.push([ux + 16, uy + 12, LED.cyan]);
          } else if (kind < 0.86) {                                           // network switch: port rows
            const ports = 20, pw = (uw - 76) / ports;
            for (let p = 0; p < ports; p++) {
              ctx.fillStyle = '#04081c'; ctx.fillRect(ux + 56 + p * pw, uy + 6, pw - 2, 10); ctx.fillRect(ux + 56 + p * pw, uy + 17, pw - 2, 6);
              if (rng() < 0.55) leds.push([Math.floor((ux + 57 + p * pw) / C) * C, uy + 8, rng() < 0.4 ? LED.green : rng() < 0.35 ? LED.amber : rng() < 0.5 ? LED.cyan : LED.blue]);
            }
            ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(ux + 12, uy + 8, 32, 3);
            leds.push([ux + 14, uy + 16, LED.cyan], [ux + 26, uy + 16, LED.green]);
          } else {                                                            // blank filler plate with a tiny label
            ctx.fillStyle = 'rgba(0,0,12,0.28)'; ctx.fillRect(ux + 10, uy + 4, uw - 20, unitH - 10);
            ctx.fillStyle = 'rgba(160,185,255,0.35)'; ctx.font = '600 12px "DejaVu Sans Mono", monospace'; ctx.fillText(`SRV-${Math.floor(rng() * 9000 + 1000)}`, ux + 16, uy + 15);
            if (rng() < 0.6) leds.push([ux + uw - 24, uy + 12, LED.green]);
          }
        }
        // door frame lines
        ctx.strokeStyle = '#26326c'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 4, y0 + 1, cw - 8, ch - 2);
      }
      speckle(ctx, rng, 2200, 0, 0, W, H, 0xffffff, 0.015, 0.05, 1.5);
    }, { aniso: 8 });
    const emissive = canvasTexture(W, H, (ctx) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      for (const [x, y, c] of leds) {
        const cx = Math.floor(x / C) * C, cy = Math.floor(y / C) * C;
        ctx.fillStyle = hex(c); ctx.fillRect(cx + 1, cy + 1, C - 2, C - 2);
        ctx.fillStyle = rgba(c, 0.22); ctx.fillRect(cx - 1, cy - 1, C + 2, C + 2);      // tiny bleed so it survives mipmapping
        ctx.fillStyle = hex(c); ctx.fillRect(cx + 1, cy + 1, C - 2, C - 2);
      }
      // cabinet edge glow strips (steady) along the cold-aisle side of each cabinet
      for (let ci = 0; ci < 4; ci++) for (let cj = 0; cj < 2; cj++) {
        const x0 = ci * cabW, y0 = Math.round((0.15 + cj * 3.6) * 209 * 0.98), ch = Math.round(3.4 * 209 * 0.98);
        const g = ctx.createLinearGradient(0, y0, 0, y0 + ch); g.addColorStop(0, '#0d5f99'); g.addColorStop(1, '#0a2f66');
        ctx.fillStyle = g; ctx.fillRect(x0 + 4, y0 + 30, 2, ch - 34);
        ctx.fillStyle = '#0f6a9c'; ctx.fillRect(x0 + 12, y0 + 5, cabW - 24, 1);
      }
    }, { aniso: 8 });
    return { map, emissive };
  });
}

/** Low wall (rails on the raised deck): dark plate with a perforated band and glowing rivet dots. u along the wall, v up it. */
export function railTextures() {
  return cached('rail', () => {
    const W = 512, H = 256, rng = makeRng(31);
    const map = canvasTexture(W, H, (ctx) => {
      ctx.fillStyle = '#131b40'; ctx.fillRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(120,150,255,0.10)'); g.addColorStop(1, 'rgba(0,0,10,0.3)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(2,4,20,0.85)';
      for (let x = 12; x < W - 8; x += 10) for (let y = 70; y < 170; y += 10) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(120,150,255,0.35)'; ctx.fillRect(0, 60, W, 2); ctx.fillRect(0, 176, W, 2);
      ctx.fillStyle = '#48548c'; for (let x = 0; x < W; x += 128) ctx.fillRect(x, 0, 3, H);
      speckle(ctx, rng, 500, 0, 0, W, H, 0xffffff, 0.02, 0.07, 1.5);
    }, { aniso: 8 });
    const emissive = canvasTexture(W, H, (ctx) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#0c5d8f'; ctx.fillRect(0, 58, W, 3); ctx.fillRect(0, 176, W, 3);
      ctx.fillStyle = '#22c8ee'; for (let x = 64; x < W; x += 128) { ctx.fillRect(x - 8, 20, 16, 4); ctx.fillRect(x - 8, 218, 16, 4); }
    }, { aniso: 8 });
    return { map, emissive };
  });
}

/** Raised-floor tiles: 8 x 8 tiles (0.6 m each) per 4.8 m. Perforated cold-aisle tiles glow faintly from beneath. */
export function floorTextures() {
  return cached('floor', () => {
    const S = 1024, N = 8, P = S / N, rng = makeRng(47);
    const kinds = Array.from({ length: N * N }, () => { const r = rng(); return r < 0.2 ? 'perf' : r < 0.26 ? 'vent' : 'plain'; });
    const tones = Array.from({ length: N * N }, () => 0.85 + 0.3 * rng());
    const map = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#060a20'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = i * P + 2, y = j * P + 2, w = P - 4, k = kinds[j * N + i], t = tones[j * N + i];
        ctx.fillStyle = `rgb(${Math.round(24 * t)},${Math.round(32 * t)},${Math.round(64 * t)})`; ctx.fillRect(x, y, w, w);
        ctx.fillStyle = 'rgba(130,160,255,0.18)'; ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y, 3, w);
        ctx.fillStyle = 'rgba(0,0,12,0.5)'; ctx.fillRect(x, y + w - 3, w, 3); ctx.fillRect(x + w - 3, y, 3, w);
        if (k === 'perf') { ctx.fillStyle = 'rgba(2,4,22,0.92)'; for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) { ctx.beginPath(); ctx.arc(x + 12 + a * 11.5, y + 12 + b * 11.5, 3.4, 0, 7); ctx.fill(); } }
        else if (k === 'vent') { ctx.fillStyle = 'rgba(2,4,22,0.9)'; for (let a = 0; a < 9; a++) ctx.fillRect(x + 10, y + 10 + a * 12, w - 20, 6); }
        else speckle(ctx, rng, 26, x + 6, y + 6, w - 12, w - 12, 0xffffff, 0.02, 0.07, 2);
      }
    }, { aniso: 16 });
    const emissive = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = i * P + 2, y = j * P + 2, k = kinds[j * N + i];
        if (k === 'perf') { ctx.fillStyle = '#0a4a7a'; for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) { ctx.beginPath(); ctx.arc(x + 12 + a * 11.5, y + 12 + b * 11.5, 2.4, 0, 7); ctx.fill(); } }
        else if (k === 'vent') { ctx.fillStyle = '#0b3d6c'; for (let a = 0; a < 9; a++) ctx.fillRect(x + 12, y + 12 + a * 12, P - 28, 3); }
        ctx.fillStyle = '#051f3e'; ctx.fillRect(i * P, j * P, P, 2); ctx.fillRect(i * P, j * P, 2, P);
      }
    }, { aniso: 16 });
    return { map, emissive };
  });
}

/** Kerb: amber and navy hazard stripes at 45 degrees (1.3 m wide x 2.4 m long repeat), glowing. */
export function kerbTextures() {
  return cached('kerb', () => {
    const S = 512;
    const paint = (ctx, a, b, glow) => {
      ctx.fillStyle = b; ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = a;
      const k = 0.54, period = S / 3;
      for (let n = -2; n < 5; n++) { ctx.beginPath(); ctx.moveTo(0, n * period); ctx.lineTo(S, n * period + k * S); ctx.lineTo(S, n * period + k * S + period / 2); ctx.lineTo(0, n * period + period / 2); ctx.fill(); }
      if (!glow) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(0, 0, 6, S); ctx.fillStyle = 'rgba(0,0,10,0.4)'; ctx.fillRect(S - 8, 0, 8, S); }
    };
    const map = canvasTexture(S, S, (ctx) => paint(ctx, '#ffb31f', '#10163a', false), { aniso: 8 });
    const emissive = canvasTexture(S, S, (ctx) => paint(ctx, '#7a4d05', '#000', true), { aniso: 8 });
    return { map, emissive };
  });
}

/** Trench grating: 2.2 m square repeat, 4 x 4 cells. Bright slots beneath: `hue` picks magenta (deck) or cyan (lane). */
export function gratingTextures(hue = 'magenta') {
  return cached(`grating:${hue}`, () => {
    const S = 512, N = 4, P = S / N, glow = hue === 'magenta' ? 0xd02ab0 : 0x22b8ee, rng = makeRng(5);
    const map = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#0a0e26'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = i * P + 3, y = j * P + 3, w = P - 6;
        ctx.fillStyle = '#243057'; ctx.fillRect(x, y, w, w);
        ctx.fillStyle = 'rgba(150,175,255,0.3)'; ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y, 3, w);
        ctx.fillStyle = '#05081c';
        for (let a = 0; a < 7; a++) ctx.fillRect(x + 10, y + 12 + a * ((w - 24) / 7), w - 20, ((w - 24) / 7) * 0.55);
        ctx.fillStyle = '#39457a'; for (let a = 0; a < 5; a++) ctx.fillRect(x + 10 + a * ((w - 20) / 4.4), y + 8, 3, w - 16);
      }
      speckle(ctx, rng, 500, 0, 0, S, S, 0xffffff, 0.02, 0.06, 1.5);
    }, { aniso: 16 });
    const emissive = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = i * P + 3, y = j * P + 3, w = P - 6;
        ctx.fillStyle = hex(glow);
        for (let a = 0; a < 7; a++) ctx.fillRect(x + 12, y + 14 + a * ((w - 24) / 7), w - 24, ((w - 24) / 7) * 0.3);
      }
    }, { aniso: 16 });
    return { map, emissive };
  });
}

/** Hazard plate for the cable-hop ramp: amber chevrons on navy, pointing up the ramp (canvas up = forward). 2.2 m square. */
export function hazardTextures() {
  return cached('hazard', () => {
    const S = 512;
    const draw = (ctx, a, b, bev) => {
      ctx.fillStyle = b; ctx.fillRect(0, 0, S, S); ctx.fillStyle = a;
      for (let n = -1; n < 3; n++) {
        const y = n * (S / 2) + S * 0.1;
        ctx.beginPath(); ctx.moveTo(0, y + S * 0.34); ctx.lineTo(S / 2, y); ctx.lineTo(S, y + S * 0.34); ctx.lineTo(S, y + S * 0.5); ctx.lineTo(S / 2, y + S * 0.16); ctx.lineTo(0, y + S * 0.5); ctx.fill();
      }
      if (bev) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, 0, S, 4); ctx.fillStyle = 'rgba(0,0,10,0.45)'; ctx.fillRect(0, S - 5, S, 5); }
    };
    return { map: canvasTexture(S, S, (c) => draw(c, '#ffb31f', '#151b46', true), { aniso: 8 }), emissive: canvasTexture(S, S, (c) => draw(c, '#a86a0a', '#000', false), { aniso: 8 }) };
  });
}

/** Cable spill: near-black violet liquid with an iridescent sheen and a soft ragged edge (alpha). Fills the whole pad. */
export function spillTextures() {
  return cached('spill', () => {
    const S = 512, rng = makeRng(77);
    const map = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#0a0414'; ctx.fillRect(0, 0, S, S);
      const hues = ['#22e6ff', '#ff2fb0', '#ffd84d', '#6a5cff'];
      for (let i = 0; i < 26; i++) {
        const x = rng() * S, y = rng() * S, r = 40 + rng() * 120, g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(parseInt(hues[i % 4].slice(1), 16), 0.34)); g.addColorStop(0.55, rgba(parseInt(hues[(i + 1) % 4].slice(1), 16), 0.14)); g.addColorStop(1, 'rgba(10,4,20,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
      }
      ctx.globalCompositeOperation = 'destination-out';                                 // ragged edge
      for (let side = 0; side < 4; side++) {
        for (let k = 0; k < 90; k++) {
          const t = rng() * S, d = rng() * 26 + 2, r = 4 + rng() * 14;
          const px = side === 0 ? t : side === 1 ? S - d + 4 : side === 2 ? t : d - 4, py = side === 0 ? d - 4 : side === 1 ? t : side === 2 ? S - d + 4 : t;
          const g = ctx.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }, { aniso: 8 });
    const emissive = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
      const r2 = makeRng(78), hues = [0x0c6a8c, 0x8c1268, 0x6a5a10, 0x3a2a99];
      for (let i = 0; i < 14; i++) {
        const x = r2() * S, y = r2() * S, r = 24 + r2() * 70, g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(hues[i % 4], 0.85)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
      }
    }, { aniso: 8 });
    return { map, emissive };
  });
}

/** Boost plate on the trench: bright cyan chevrons on dark, pointing forward. 2.2 m square. */
export function boostTextures() {
  return cached('boost', () => {
    const S = 512;
    const draw = (ctx, a, b) => {
      ctx.fillStyle = b; ctx.fillRect(0, 0, S, S); ctx.fillStyle = a;
      for (let n = 0; n < 2; n++) {
        const y = n * (S / 2) + S * 0.12;
        ctx.beginPath(); ctx.moveTo(S * 0.08, y + S * 0.3); ctx.lineTo(S / 2, y); ctx.lineTo(S * 0.92, y + S * 0.3); ctx.lineTo(S * 0.92, y + S * 0.42); ctx.lineTo(S / 2, y + S * 0.12); ctx.lineTo(S * 0.08, y + S * 0.42); ctx.fill();
      }
      ctx.fillStyle = a; ctx.fillRect(0, 0, 10, S); ctx.fillRect(S - 10, 0, 10, S);
    };
    return { map: canvasTexture(S, S, (c) => draw(c, '#3ee6ff', '#0a1638'), { aniso: 8 }), emissive: canvasTexture(S, S, (c) => draw(c, '#22e6ff', '#02081c'), { aniso: 8 }) };
  });
}

/** Slab underside / edge skin: dark ribbed steel with a lit seam. u along the slab (3 m per repeat), v across / down. */
export function slabTextures() {
  return cached('slab', () => {
    const S = 256, rng = makeRng(61);
    const map = canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#10163a'; ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = 'rgba(120,150,255,0.14)'; for (let x = 0; x < S; x += 32) ctx.fillRect(x, 0, 3, S);
      ctx.fillStyle = 'rgba(0,0,12,0.4)'; for (let y = 0; y < S; y += 64) ctx.fillRect(0, y, S, 4);
      speckle(ctx, rng, 300, 0, 0, S, S, 0xffffff, 0.02, 0.08, 1.5);
    }, { aniso: 4 });
    const emissive = canvasTexture(S, S, (ctx) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S); ctx.fillStyle = '#0a5a88'; ctx.fillRect(0, 60, S, 4); }, { aniso: 4 });
    return { map, emissive };
  });
}

/** Additive hologram atlas: 4 x 8 cells of 256 x 128. Black = transparent. Cell k in reading order = HOLO_WORDS[k]. */
export const HOLO_WORDS = [
  ['PING', '64 bytes  time=0.4 ms', 0x22e6ff], ['404', 'ROUTE NOT FOUND', 0xff2fb0], ['sudo', '$ sudo make it faster', 0x3dff86], ['/24', '255.255.255.0', 0xffb020],
  ['us-east-1', 'AZ a  b  c', 0x22e6ff], ['99.999%', 'FIVE NINES', 0x3dff86], ['TTL 64', 'hops: 9', 0xffb020], ['BGP', 'AS 65001  ESTABLISHED', 0xff2fb0],
  ['DNS', 'A   AAAA   CNAME', 0x22e6ff], ['VLAN 10', 'trunk allowed', 0x5b7dff], ['ssh', 'connection open', 0x3dff86], ['CLOUD 9', 'hyperscale region', 0xff2fb0],
  ['10.0.0.0/8', 'RFC 1918', 0xffb020], ['SYN-ACK', 'three-way handshake', 0x22e6ff], ['0.4 ms', 'LATENCY', 0x3dff86], ['HTTP 200', 'OK', 0x3dff86],
  ['NAT', 'src rewritten', 0xffb020], ['VPC', 'peering active', 0x5b7dff], ['IPv6', '2001:db8::/32', 0x22e6ff], ['MTU 9001', 'jumbo frames', 0xff2fb0],
  ['ECMP', '8 equal-cost paths', 0x22e6ff], ['WARNING', 'COLD AISLE', 0xffb020], ['DROP', 'packet loss 0%', 0x3dff86], ['SLA', 'uptime target met', 0x22e6ff],
  ['CIDR', 'subnet planner', 0x5b7dff], ['REBOOT', 'never on a Friday', 0xff2fb0], ['ARP', 'who has 10.0.0.1?', 0x22e6ff], ['GATEWAY', '10.0.0.1  UP', 0x3dff86],
  ['TRACERT', '1  2  3  ...  9', 0xffb020], ['PONG', 'reply from 10.0.0.9', 0x22e6ff], ['PAGE 1', 'load balancer OK', 0x3dff86], ['LATENCY', 'p99  12 ms', 0xff2fb0],
];
export const HOLO = { cols: 4, rows: 8, cw: 256, ch: 128 };
export function holoAtlas() {
  return cached('holo', () => canvasTexture(HOLO.cols * HOLO.cw, HOLO.rows * HOLO.ch, (ctx) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, HOLO.cols * HOLO.cw, HOLO.rows * HOLO.ch);
    HOLO_WORDS.forEach(([word, sub, colour], k) => {
      const x = (k % HOLO.cols) * HOLO.cw, y = Math.floor(k / HOLO.cols) * HOLO.ch, w = HOLO.cw, h = HOLO.ch, c = hex(colour);
      ctx.fillStyle = rgba(colour, 0.13); ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      for (let sy = y + 8; sy < y + h - 8; sy += 4) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x + 6, sy, w - 12, 1.5); }   // scanlines
      ctx.strokeStyle = c; ctx.lineWidth = 3; const L = 22;
      for (const [cx, cy, dx, dy] of [[x + 6, y + 6, 1, 1], [x + w - 6, y + 6, -1, 1], [x + 6, y + h - 6, 1, -1], [x + w - 6, y + h - 6, -1, -1]]) { ctx.beginPath(); ctx.moveTo(cx + dx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * L); ctx.stroke(); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = c;
      const size = word.length > 8 ? 34 : word.length > 6 ? 44 : 58;
      ctx.font = `800 ${size}px "DejaVu Sans Mono", Consolas, "Courier New", monospace`;
      ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.fillText(word, x + w / 2, y + h * 0.42); ctx.fillText(word, x + w / 2, y + h * 0.42);
      ctx.shadowBlur = 0; ctx.fillStyle = rgba(colour, 0.85); ctx.font = '600 17px "DejaVu Sans Mono", Consolas, monospace'; ctx.fillText(sub, x + w / 2, y + h * 0.8);
    });
  }, { repeat: false, aniso: 8 }));
}

/** Soft round glow (halo sprites, light pools). */
export function glowSprite() {
  return cached('glow', () => canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)'); g.addColorStop(0.45, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  }, { repeat: false, aniso: 1 }));
}

/** Streak flare (horizontal light bar glow). */
export function barGlow() {
  return cached('barglow', () => canvasTexture(256, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.12, 'rgba(255,255,255,0.7)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(0.88, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    const v = ctx.createLinearGradient(0, 0, 0, 64); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 64); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = v; ctx.fillRect(0, 0, 256, 64);
  }, { repeat: false, aniso: 1 }));
}

/** Cloud puff sprite: overlapping soft blobs, white with a cool underside. */
export function cloudSprite() {
  return cached('cloud', () => {
    const rng = makeRng(101);
    return canvasTexture(256, 256, (ctx) => {
      ctx.clearRect(0, 0, 256, 256);
      for (let i = 0; i < 16; i++) {
        const a = rng() * 6.283, d = rng() * 58, x = 128 + Math.cos(a) * d * 1.1, y = 132 + Math.sin(a) * d * 0.55, r = 34 + rng() * 34;
        const g = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(235,240,255,0.22)'); g.addColorStop(1, 'rgba(220,230,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
      }
    }, { repeat: false, aniso: 1 });
  });
}

/** Ceiling: dark acoustic tile grid with cable-tray shadows; it is barely lit, the light comes from the bars. */
export function ceilingTextures() {
  return cached('ceiling', () => {
    const S = 512, rng = makeRng(83);
    return canvasTexture(S, S, (ctx) => {
      ctx.fillStyle = '#0a1030'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const t = 0.8 + rng() * 0.4; ctx.fillStyle = `rgb(${Math.round(18 * t)},${Math.round(26 * t)},${Math.round(58 * t)})`; ctx.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
        ctx.fillStyle = 'rgba(2,4,20,0.7)'; for (let k = 0; k < 6; k++) ctx.fillRect(i * 128 + 12, j * 128 + 14 + k * 18, 104, 5);
      }
      speckle(ctx, rng, 400, 0, 0, S, S, 0xffffff, 0.02, 0.06, 1.5);
    }, { aniso: 8 });
  });
}

/** Outer hall wall: giant dark panels with a glowing horizontal band pattern (u along the wall, 24 m per repeat; v = 0..1 over 40 m). */
export function hallWallTextures() {
  return cached('hallwall', () => {
    const W = 512, H = 512, rng = makeRng(91);
    const map = canvasTexture(W, H, (ctx) => {
      ctx.fillStyle = '#0a1030'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) {
        const t = 0.85 + rng() * 0.3; ctx.fillStyle = `rgb(${Math.round(16 * t)},${Math.round(24 * t)},${Math.round(56 * t)})`; ctx.fillRect(i * 128 + 3, j * 64 + 3, 122, 58);
        ctx.fillStyle = 'rgba(120,150,255,0.12)'; ctx.fillRect(i * 128 + 3, j * 64 + 3, 122, 2);
      }
      speckle(ctx, rng, 500, 0, 0, W, H, 0xffffff, 0.02, 0.06, 1.5);
    }, { aniso: 8 });
    const emissive = canvasTexture(W, H, (ctx) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      for (let j = 0; j < 8; j += 2) { ctx.fillStyle = j % 4 ? '#0a3a66' : '#0a5588'; ctx.fillRect(0, j * 64 + 60, W, 3); }
      ctx.fillStyle = '#22c8ee'; for (let i = 0; i < 4; i++) ctx.fillRect(i * 128 + 60, 2, 8, 2);
    }, { aniso: 8 });
    return { map, emissive };
  });
}

// ------------------------------------------------------------------------------------------------
// Marco's holo-screen: his face photo (marco_face) in a cyan frame, MARCO KART lettering, and the Marcoverse logo when present.
// Built procedurally first (a cartoon face) then redrawn when the photos load, so it always looks intentional.

const screenState = { tex: null, canvas: null, redraw: null };

/** @returns {THREE.CanvasTexture|null} the 1024 x 512 screen texture (updates itself when Assets images arrive) */
export function marcoScreen() {
  if (screenState.tex) return screenState.tex;
  const draw = (ctx, face, logo) => {
    const W = 1024, H = 512;
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#08153a'); g.addColorStop(1, '#1a0b40'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(80,140,255,0.16)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // portrait ring
    const cx = 270, cy = 262, R = 190;
    const ring = ctx.createRadialGradient(cx, cy, R - 10, cx, cy, R + 40); ring.addColorStop(0, 'rgba(34,230,255,0.9)'); ring.addColorStop(1, 'rgba(34,230,255,0)');
    ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(cx, cy, R + 40, 0, 7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
    if (face) {
      const s = Math.max((2 * R) / face.width, (2 * R) / face.height);
      ctx.drawImage(face, cx - (face.width * s) / 2, cy - (face.height * s) / 2 - 8, face.width * s, face.height * s);
    } else {                                                             // cartoon Marco: flat cap, big grin
      ctx.fillStyle = '#2b3f7a'; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      ctx.fillStyle = '#f2c29b'; ctx.beginPath(); ctx.ellipse(cx, cy + 20, 118, 140, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#1a2a5e'; ctx.beginPath(); ctx.ellipse(cx, cy - 92, 138, 60, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(cx - 138, cy - 96, 276, 26);
      ctx.beginPath(); ctx.ellipse(cx + 92, cy - 70, 90, 14, 0.06, 0, 7); ctx.fill();
      ctx.fillStyle = '#231a18'; ctx.fillRect(cx - 118, cy - 60, 22, 62); ctx.fillRect(cx + 96, cy - 60, 22, 62);
      ctx.fillStyle = '#fff'; for (const ex of [-46, 46]) { ctx.beginPath(); ctx.ellipse(cx + ex, cy - 16, 20, 24, 0, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#1b1024'; for (const ex of [-44, 48]) { ctx.beginPath(); ctx.arc(cx + ex, cy - 12, 10, 0, 7); ctx.fill(); }
      ctx.strokeStyle = '#7a3b32'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy + 34, 62, 0.25, Math.PI - 0.25); ctx.stroke();
      ctx.fillStyle = '#d33a4a'; ctx.fillRect(cx - 110, cy + 128, 220, 70);
    }
    ctx.restore();
    ctx.strokeStyle = '#22e6ff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    // lettering
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = 'italic 900 118px "Arial Black", Impact, "DejaVu Sans", sans-serif'; ctx.shadowColor = '#ff2fb0'; ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff'; ctx.fillText('MARCO', 520, 150); ctx.fillStyle = '#ff5cc8'; ctx.fillText('KART', 520, 262); ctx.shadowBlur = 0;
    ctx.font = '700 30px "DejaVu Sans Mono", Consolas, monospace'; ctx.fillStyle = '#7fe9ff'; ctx.fillText('CLOUD + NETWORKING INSTRUCTOR', 520, 350);
    ctx.fillStyle = '#3dff86'; ctx.fillText('uptime 99.999%   ping 0.4 ms', 520, 392);
    if (logo) {
      const lh = 76, lw = (logo.width / logo.height) * lh; ctx.globalAlpha = 0.95; ctx.drawImage(logo, 520, 424, Math.min(lw, 420), lh); ctx.globalAlpha = 1;
    } else { ctx.font = 'italic 900 44px "Arial Black", Impact, sans-serif'; ctx.fillStyle = '#22e6ff'; ctx.fillText('MARCOVERSE', 520, 458); }
    for (let y = 0; y < H; y += 4) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, y, W, 1.5); }
    ctx.strokeStyle = '#22e6ff'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
  };
  const tex = canvasTexture(1024, 512, (ctx) => { screenState.canvas = ctx.canvas; draw(ctx, null, null); }, { repeat: false, aniso: 8 });
  if (!tex) return null;
  screenState.tex = tex;
  Promise.all([Assets.image('marco_face'), Assets.image('logo_marcoverse')]).then(([face, logo]) => {
    if (!face && !logo) return;
    draw(screenState.canvas.getContext('2d'), face, logo); tex.needsUpdate = true;
  }).catch(() => {});
  return tex;
}

/** A second holo-screen: an ops dashboard (region status, traffic graph, uptime gauge, network map). 1024 x 512. */
export function dashScreen() {
  return cached('dash', () => canvasTexture(1024, 512, (ctx) => {
    const W = 1024, H = 512, rng = makeRng(313);
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#061632'); g.addColorStop(1, '#14083a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(80,140,255,0.14)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.font = '800 40px "DejaVu Sans Mono", Consolas, monospace'; ctx.fillStyle = '#22e6ff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.shadowColor = '#22e6ff'; ctx.shadowBlur = 14;
    ctx.fillText('CLOUD 9 // REGION STATUS', 34, 44); ctx.shadowBlur = 0;
    const regions = ['us-east-1', 'us-west-2', 'eu-west-2', 'sa-east-1', 'ap-south-1', 'ap-southeast-2'];
    ctx.font = '600 24px "DejaVu Sans Mono", Consolas, monospace';
    regions.forEach((r, i) => {
      const y = 104 + i * 56; ctx.fillStyle = '#9fd0ff'; ctx.fillText(r, 34, y);
      const w = 120 + rng() * 130; ctx.fillStyle = 'rgba(34,230,255,0.18)'; ctx.fillRect(250, y - 14, 260, 26);
      ctx.fillStyle = i === 3 ? '#ffb020' : '#3dff86'; ctx.fillRect(250, y - 14, w, 26);
      ctx.fillStyle = '#ffffff'; ctx.fillText(`${(1 + rng() * 11).toFixed(1)}ms`, 530, y);
    });
    const gx = 34, gy = 356, gw = 476, gh = 120;
    ctx.strokeStyle = 'rgba(160,190,255,0.35)'; ctx.strokeRect(gx, gy, gw, gh);
    ctx.beginPath(); let v = 0.5;
    for (let x = 0; x <= gw; x += 8) { v = Math.min(0.95, Math.max(0.1, v + (rng() - 0.5) * 0.28)); const y = gy + gh - v * gh; x ? ctx.lineTo(gx + x, y) : ctx.moveTo(gx + x, y); }
    ctx.strokeStyle = '#ff2fb0'; ctx.lineWidth = 4; ctx.shadowColor = '#ff2fb0'; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffb020'; ctx.font = '700 22px "DejaVu Sans Mono", monospace'; ctx.fillText('TRAFFIC 42.7 Tbps', gx + 10, gy - 16);
    const cx = 760, cy = 210, r = 108;
    ctx.lineWidth = 22; ctx.strokeStyle = 'rgba(34,230,255,0.2)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#3dff86'; ctx.shadowColor = '#3dff86'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI * 1.96 - Math.PI / 2); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.font = '800 44px "DejaVu Sans Mono", monospace'; ctx.fillText('99.999%', cx, cy - 6);
    ctx.font = '600 20px "DejaVu Sans Mono", monospace'; ctx.fillStyle = '#9fd0ff'; ctx.fillText('UPTIME', cx, cy + 34);
    const nodes = Array.from({ length: 12 }, () => [600 + rng() * 380, 350 + rng() * 130]);
    ctx.strokeStyle = 'rgba(34,230,255,0.5)'; ctx.lineWidth = 2;
    nodes.forEach((a, i) => { const b = nodes[(i * 5 + 3) % 12]; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
    nodes.forEach((a, i) => { ctx.fillStyle = i % 4 === 1 ? '#ff2fb0' : '#22e6ff'; ctx.beginPath(); ctx.arc(a[0], a[1], 8, 0, 7); ctx.fill(); });
    for (let y = 0; y < H; y += 4) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, y, W, 1.5); }
    ctx.strokeStyle = '#22e6ff'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
  }, { repeat: false, aniso: 8 }));
}

/** Amber chevron plate for the outside of corners (pointing +u). 512 x 256, opaque. */
export function chevronTexture() {
  return cached('chevron', () => canvasTexture(512, 256, (ctx) => {
    const W = 512, H = 256;
    ctx.fillStyle = '#0c1330'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(90,120,255,0.18)'); g.addColorStop(1, 'rgba(0,0,10,0.3)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffb31f';
    for (let k = 0; k < 3; k++) {
      const x = 80 + k * 128;
      ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x + 70, H / 2); ctx.lineTo(x, H - 34); ctx.lineTo(x + 46, H - 34); ctx.lineTo(x + 116, H / 2); ctx.lineTo(x + 46, 34); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#ffb31f'; ctx.lineWidth = 8; ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(16, 16, W - 32, H - 32);
  }, { repeat: false, aniso: 8 }));
}

const logoState = { tex: null, canvas: null };
/** Marcoverse logo panel (1024 x 256): the real logo when loaded, wordmark otherwise. */
export function logoSign() {
  if (logoState.tex) return logoState.tex;
  const draw = (ctx, logo) => {
    const W = 1024, H = 256;
    const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#07122e'); g.addColorStop(0.5, '#160a3a'); g.addColorStop(1, '#07122e'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(80,140,255,0.16)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    if (logo) {
      const s = Math.min((W - 80) / logo.width, (H - 50) / logo.height);
      ctx.drawImage(logo, (W - logo.width * s) / 2, (H - logo.height * s) / 2, logo.width * s, logo.height * s);
    } else {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'italic 900 118px "Arial Black", Impact, "DejaVu Sans", sans-serif';
      ctx.shadowColor = '#22e6ff'; ctx.shadowBlur = 28; ctx.fillStyle = '#ffffff'; ctx.fillText('MARCOVERSE', W / 2, H / 2 + 4); ctx.shadowBlur = 0;
    }
    ctx.strokeStyle = '#22e6ff'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.fillStyle = '#ff2fb0'; ctx.fillRect(4, H - 14, W - 8, 10);
  };
  const tex = canvasTexture(1024, 256, (ctx) => { logoState.canvas = ctx.canvas; draw(ctx, null); }, { repeat: false, aniso: 8 });
  if (!tex) return null;
  logoState.tex = tex;
  Assets.image('logo_marcoverse').then((logo) => { if (!logo) return; draw(logoState.canvas.getContext('2d'), logo); tex.needsUpdate = true; }).catch(() => {});
  return tex;
}

/** Test hook: drop cached textures (a fresh track build creates its own set). */
export function clearDatacentreTextures() { for (const v of cache.values()) for (const t of Object.values(v && v.isTexture === undefined ? v : { t: v })) t?.dispose?.(); cache.clear(); screenState.tex = null; }
