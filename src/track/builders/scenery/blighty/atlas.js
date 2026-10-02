// Blighty texture atlases (canvas, generated once): sash windows, painted doors and shop fronts on one sheet, plus the double-decker's sides.
import { canvasTexture } from '../../textures.js';

const CW = 128, CH = 192, COLS = 8, SCW = 512, SCH = 96;

/** Cell order of the window atlas. */
export const WIN = {
  sash6: 0, sash4: 1, arch: 2, curtains: 3, lit: 4, grille: 5, bay: 6, attic: 7,
  doorBlack: 8, doorNavy: 9, doorRed: 10, doorGreen: 11, doorCream: 12, doorYellow: 13,
  shopTea: 14, shopNews: 15, shopBakery: 16, shopPub: 17, shopChips: 18, shopBooks: 19, roller: 20, blank: 21,
};
export const DOORS = [WIN.doorBlack, WIN.doorNavy, WIN.doorRed, WIN.doorGreen, WIN.doorCream, WIN.doorYellow];
export const SHOPS = [WIN.shopTea, WIN.shopNews, WIN.shopBakery, WIN.shopPub, WIN.shopChips, WIN.shopBooks];

const FRAME = '#f3f0e8', SILL = '#c9c5bb';

function glass(ctx, x, y, w, h, warm) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (warm) { g.addColorStop(0, '#ffe7a6'); g.addColorStop(1, '#e9a94a'); } else { g.addColorStop(0, '#9fb2c4'); g.addColorStop(0.5, '#5f7489'); g.addColorStop(1, '#2c3a4a'); }
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}

function sash(ctx, x, y, cols, rows, o = {}) {
  const wx = x + 22, wy = y + (o.top ?? 34), ww = CW - 44, wh = o.h ?? 112;
  ctx.fillStyle = FRAME; ctx.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
  glass(ctx, wx, wy, ww, wh, o.warm);
  if (o.curtains) { ctx.fillStyle = 'rgba(250,240,210,0.85)'; ctx.fillRect(wx, wy, ww * 0.3, wh * 0.85); ctx.fillRect(wx + ww * 0.7, wy, ww * 0.3, wh * 0.85); }
  ctx.fillStyle = FRAME;
  for (let i = 1; i < cols; i++) ctx.fillRect(wx + (ww * i) / cols - 2, wy, 4, wh);
  for (let i = 1; i < rows; i++) ctx.fillRect(wx, wy + (wh * i) / rows - 2, ww, 4);
  ctx.fillStyle = SILL; ctx.fillRect(wx - 10, wy + wh + 6, ww + 20, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(wx - 6, wy - 12, ww + 12, 6);             // lintel shadow
  ctx.fillStyle = '#9b9587'; ctx.fillRect(wx - 12, wy - 18, ww + 24, 6);
}

function door(ctx, x, y, colour) {
  ctx.fillStyle = FRAME; ctx.fillRect(x + 20, y + 4, CW - 40, CH - 4);
  ctx.fillStyle = colour; ctx.fillRect(x + 28, y + 56, CW - 56, CH - 56);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (const [dx, dy, dw, dh] of [[36, 66, 24, 44], [68, 66, 24, 44], [36, 118, 24, 52], [68, 118, 24, 52]]) ctx.fillRect(x + dx, y + dy, dw, dh);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  for (const [dx, dy, dw, dh] of [[36, 66, 24, 3], [68, 66, 24, 3], [36, 118, 24, 3], [68, 118, 24, 3]]) ctx.fillRect(x + dx, y + dy, dw, dh);
  ctx.fillStyle = '#d8b04a'; ctx.beginPath(); ctx.arc(x + 88, y + 112, 4, 0, 7); ctx.fill(); ctx.fillRect(x + 46, y + 100, 20, 5);
  // fanlight
  ctx.fillStyle = '#4c5f72'; ctx.beginPath(); ctx.arc(x + CW / 2, y + 54, 36, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = FRAME; ctx.lineWidth = 3;
  for (let k = 0; k <= 4; k++) { const a = Math.PI + (k / 4) * Math.PI; ctx.beginPath(); ctx.moveTo(x + CW / 2, y + 54); ctx.lineTo(x + CW / 2 + Math.cos(a) * 36, y + 54 + Math.sin(a) * 36); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(x + CW / 2, y + 54, 22, Math.PI, 0); ctx.stroke();
}

function shop(ctx, x, y, o) {
  ctx.fillStyle = o.frame; ctx.fillRect(x + 4, y + 6, CW - 8, CH - 6);
  glass(ctx, x + 12, y + 28, CW - 24, CH - 60, o.warm ?? true);
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.moveTo(x + 12, y + 28); ctx.lineTo(x + 70, y + 28); ctx.lineTo(x + 30, y + CH - 32); ctx.lineTo(x + 12, y + CH - 32); ctx.fill();
  o.goods(ctx, x + 12, y + 28, CW - 24, CH - 60);
  ctx.fillStyle = o.frame; ctx.fillRect(x + 4, y + CH - 32, CW - 8, 26); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 4, y + CH - 8, CW - 8, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 12, y + 28, CW - 24, 5);
}

const shelves = (ctx, x, y, w, h, items) => {
  ctx.fillStyle = 'rgba(60,40,20,0.65)';
  for (let r = 1; r <= 3; r++) ctx.fillRect(x, y + (h * r) / 4, w, 4);
  items.forEach((c, i) => { const r = 1 + Math.floor(i / 5) % 3, col = i % 5; ctx.fillStyle = c; ctx.fillRect(x + 6 + col * ((w - 8) / 5), y + (h * r) / 4 - 22, 14, 20); });
};

const CELLS = [
  (c, x, y) => sash(c, x, y, 2, 3), (c, x, y) => sash(c, x, y, 2, 2), (c, x, y) => sash(c, x, y, 2, 2, { top: 40 }),
  (c, x, y) => sash(c, x, y, 2, 3, { curtains: true, warm: true }), (c, x, y) => sash(c, x, y, 2, 3, { warm: true }),
  (c, x, y) => { c.fillStyle = '#1f2228'; c.fillRect(x + 28, y + 120, CW - 56, 44); c.fillStyle = '#5b5f68'; for (let i = 0; i < 8; i++) c.fillRect(x + 32 + i * 8, y + 122, 3, 40); c.fillStyle = SILL; c.fillRect(x + 20, y + 164, CW - 40, 8); },
  (c, x, y) => { sash(c, x, y, 3, 3, { top: 18, h: 138 }); },
  (c, x, y) => { c.fillStyle = FRAME; c.fillRect(x + 34, y + 60, CW - 68, 80); glass(c, x + 40, y + 66, CW - 80, 68, false); c.fillStyle = FRAME; c.fillRect(x + CW / 2 - 2, y + 66, 4, 68); },
  (c, x, y) => door(c, x, y, '#16171b'), (c, x, y) => door(c, x, y, '#1d3a6e'), (c, x, y) => door(c, x, y, '#a4262c'),
  (c, x, y) => door(c, x, y, '#2f6f4e'), (c, x, y) => door(c, x, y, '#efe6c8'), (c, x, y) => door(c, x, y, '#e2b23a'),
  (c, x, y) => shop(c, x, y, { frame: '#2b6b62', goods: (cc, a, b, w, h) => { shelves(cc, a, b, w, h, ['#f2b5c8', '#ffe3a1', '#c98b5a', '#f2b5c8', '#fff', '#a4d8c8', '#ffe3a1', '#c98b5a', '#f2b5c8', '#fff']); cc.fillStyle = '#c94b3a'; cc.beginPath(); cc.arc(a + w * 0.7, b + h * 0.72, 16, 0, 7); cc.fill(); cc.fillRect(a + w * 0.7 - 4, b + h * 0.72 - 24, 8, 10); } }),
  (c, x, y) => shop(c, x, y, { frame: '#a4262c', goods: (cc, a, b, w, h) => { const cols = ['#ffd166', '#e63946', '#3a86ff', '#ffffff', '#2ec4b6', '#f15bb5']; for (let i = 0; i < 12; i++) { cc.fillStyle = cols[i % 6]; cc.fillRect(a + 6 + (i % 4) * 24, b + 10 + Math.floor(i / 4) * 40, 20, 32); } } }),
  (c, x, y) => shop(c, x, y, { frame: '#e6c17a', goods: (cc, a, b, w, h) => shelves(cc, a, b, w, h, ['#c98b5a', '#e8c48a', '#c98b5a', '#f5deb3', '#a8672f', '#e8c48a', '#c98b5a', '#f5deb3', '#e8c48a', '#a8672f']) }),
  (c, x, y) => shop(c, x, y, { frame: '#3a2a20', warm: false, goods: (cc, a, b, w, h) => { cc.fillStyle = 'rgba(255,240,200,0.5)'; cc.fillRect(a, b + h * 0.35, w, h * 0.5); cc.fillStyle = '#e0a63a'; for (let i = 0; i < 4; i++) cc.fillRect(a + 10 + i * 24, b + h * 0.5, 16, h * 0.3); } }),
  (c, x, y) => shop(c, x, y, { frame: '#e9e2cf', goods: (cc, a, b, w, h) => { cc.fillStyle = '#d99a3a'; for (let i = 0; i < 5; i++) cc.fillRect(a + 8 + i * 20, b + h * 0.55 - (i % 2) * 14, 14, h * 0.3); cc.fillStyle = '#fff'; cc.fillRect(a + 10, b + 12, w - 20, 22); } }),
  (c, x, y) => shop(c, x, y, { frame: '#1d3a6e', goods: (cc, a, b, w, h) => shelves(cc, a, b, w, h, ['#e63946', '#22d3ee', '#ffd166', '#fff8ec', '#e63946', '#3a86ff', '#22d3ee', '#ffd166', '#e63946', '#fff8ec']) }),
  (c, x, y) => { c.fillStyle = '#9aa0a8'; c.fillRect(x + 8, y + 20, CW - 16, CH - 20); c.fillStyle = 'rgba(0,0,0,0.22)'; for (let i = 0; i < 16; i++) c.fillRect(x + 8, y + 20 + i * 11, CW - 16, 3); c.fillStyle = '#e9b91c'; c.fillRect(x + 8, y + 20, CW - 16, 10); },
  (c, x, y) => { c.fillStyle = '#e0dbd0'; c.fillRect(x, y, CW, CH); },
];

/**
 * Sash windows, doors, shop fronts AND shop fascia boards on one sheet (one material for all of them).
 * Window cells are 128 x 192 px = one 1.4 m x 2.1 m opening; the fascia boards (512 x 96 px, aspect 5.3:1) sit in a band below.
 * @returns {{ texture: import('three').CanvasTexture|null, uv: (i:number)=>number[], signUv: (i:number)=>number[] }}
 */
export function windowAtlas() {
  const rows = Math.ceil(CELLS.length / COLS), winH = rows * CH, sRows = SIGNS.length / 2, W = COLS * CW, H = winH + sRows * SCH;
  const texture = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = '#c8c4b8'; ctx.fillRect(0, 0, W, winH);
    CELLS.forEach((draw, i) => { const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH; ctx.save(); ctx.beginPath(); ctx.rect(x, y, CW, CH); ctx.clip(); draw(ctx, x, y); ctx.restore(); });
    SIGNS.forEach(([text, bg, fg], i) => {
      const x = (i % 2) * SCW, y = winH + Math.floor(i / 2) * SCH;
      ctx.fillStyle = bg; ctx.fillRect(x, y, SCW, SCH);
      ctx.strokeStyle = fg; ctx.globalAlpha = 0.55; ctx.lineWidth = 4; ctx.strokeRect(x + 6, y + 6, SCW - 12, SCH - 12); ctx.globalAlpha = 1;
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${text.length > 14 ? 46 : 56}px Georgia, "Times New Roman", serif`;
      ctx.fillText(text, x + SCW / 2, y + SCH / 2 + 3, SCW - 40);
    });
  }, { repeat: false, aniso: 8 });
  const uv = (i) => { const cx = i % COLS, cy = Math.floor(i / COLS); return [(cx * CW + 2) / W, 1 - ((cy + 1) * CH - 2) / H, ((cx + 1) * CW - 2) / W, 1 - (cy * CH + 2) / H]; };
  const signUv = (i) => { const cx = i % 2, cy = winH + Math.floor(i / 2) * SCH; return [(cx * SCW + 2) / W, 1 - (cy + SCH - 2) / H, ((cx + 1) * SCW - 2) / W, 1 - (cy + 2) / H]; };
  return { texture, uv, signUv };
}

/** Double-decker livery sheet: left half = side (10.4 x 4.4 m), right half = front. A white texel block sits bottom-left for plain-coloured boxes. */
export function busTexture() {
  return canvasTexture(1024, 512, (ctx) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1024, 512);
    // ---- side (0..640 x 0..512): red body, cream band, window rows
    const sideW = 640, H = 512;
    ctx.fillStyle = '#d22f27'; ctx.fillRect(0, 0, sideW, H);
    ctx.fillStyle = '#efe6cf'; ctx.fillRect(0, 232, sideW, 22); ctx.fillRect(0, 22, sideW, 14);
    const win = (y, h) => {
      ctx.fillStyle = '#12202e'; ctx.fillRect(14, y, sideW - 28, h);
      const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#94aabd'); g.addColorStop(1, '#3d5468'); ctx.fillStyle = g;
      for (let i = 0; i < 9; i++) ctx.fillRect(20 + i * 68, y + 5, 60, h - 10);
    };
    win(56, 128); win(288, 108);
    ctx.fillStyle = '#efe6cf'; ctx.fillRect(14, 196, sideW - 28, 16);
    ctx.fillStyle = '#0b1d3a'; ctx.fillRect(120, 384, 400, 62); ctx.fillStyle = '#ffd166';
    ctx.font = 'italic 900 40px "Arial Black", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('MARCOVERSE', 320, 406);
    ctx.font = '700 20px system-ui, sans-serif'; ctx.fillStyle = '#fff8ec'; ctx.fillText('CLOUD & NETWORKING TRAINING', 320, 434);
    ctx.fillStyle = '#1a1a1e'; ctx.fillRect(14, 452, sideW - 28, 8);
    // ---- front (640..1024): windscreen, destination blind, lamps, fascia
    const fx = 640, fw = 384;
    ctx.fillStyle = '#d22f27'; ctx.fillRect(fx, 0, fw, H);
    ctx.fillStyle = '#efe6cf'; ctx.fillRect(fx, 232, fw, 22);
    ctx.fillStyle = '#12202e'; ctx.fillRect(fx + 26, 60, fw - 52, 110); ctx.fillRect(fx + 26, 290, fw - 52, 130);
    const g = ctx.createLinearGradient(0, 290, 0, 420); g.addColorStop(0, '#9db3c6'); g.addColorStop(1, '#3d5468'); ctx.fillStyle = g; ctx.fillRect(fx + 34, 298, fw - 68, 114);
    ctx.fillStyle = '#12202e'; ctx.fillRect(fx + fw / 2 - 3, 298, 6, 114);
    ctx.fillStyle = '#1a1a1e'; ctx.fillRect(fx + 70, 262, fw - 140, 24); ctx.fillStyle = '#ffb347'; ctx.font = '800 20px system-ui, sans-serif'; ctx.fillText('42  BLIGHTY CENTRAL', fx + fw / 2, 275);
    ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.arc(fx + 60, 424, 22, 0, 7); ctx.arc(fx + fw - 60, 424, 22, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a1a1e'; ctx.fillRect(fx + 100, 414, fw - 200, 30);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 464, 48, 48);           // plain texel block for un-textured boxes (uv 0..0.1)
  }, { repeat: false, aniso: 8 });
}
/** UV rectangles inside busTexture(): [u0, v0, u1, v1]. */
export const BUS_UV = { side: [0, 0.1, 640 / 1024, 1], front: [640 / 1024, 0.1, 1, 1] };

/** Shop fascia boards (512 x 96 px each, aspect 5.3:1). Index = SIGN_IDS.<name>; drawn into windowAtlas() (signUv). */
export const SIGN_IDS = { tea: 0, chips: 1, pub: 2, news: 3, bakery: 4, books: 5, post: 6, bookies: 7, pharmacy: 8, arms: 9, laundry: 10, takeaway: 11, garage: 12, depot: 13, parkdrive: 14, kings: 15, tube: 16, hillroad: 17 };
const SIGNS = [
  ['YE OLDE TEA ROOMS', '#1f4d3a', '#f6e7b4'], ['FISH & CHIPS', '#1d3a6e', '#fff8ec'], ['THE PACKET INN', '#2b1d17', '#e7b84a'], ['NEWSAGENT', '#a4262c', '#fff8ec'],
  ['BAKERY', '#f0d9a8', '#7b3f1d'], ['MARCOVERSE BOOKS', '#0b1d3a', '#ffd166'], ['POST OFFICE', '#c8281f', '#ffffff'], ['BOOKMAKERS', '#2a5d34', '#ffffff'],
  ['PHARMACY', '#e9f4ee', '#1a7a4c'], ['THE ROUTER ARMS', '#3a2a20', '#e8d9a8'], ['LAUNDERETTE', '#2b7bb9', '#ffffff'], ['TAKEAWAY', '#e9b91c', '#1a1a1e'], ['BLIGHTY BUS GARAGE', '#0b1d3a', '#ffd166'], ['DEPOT - NO ENTRY', '#e9b91c', '#1a1a1e'],
  ['PARK DRIVE', '#2a5d34', '#ffffff'], ['KINGS CORNER', '#1d3a6e', '#ffffff'], ['THE TUBE', '#c8281f', '#ffffff'], ['HILL ROAD', '#1d3a6e', '#ffffff'],
];
