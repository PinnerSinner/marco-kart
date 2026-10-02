// Visual set-pieces that make each corner of Marcoverse recognisable: sector name arches, the shortcut decks and their gateways,
// the giant orbiting MARCOVERSE ring round the hologram, and Marco's Copacabana island (calçadão mosaic, palms, two sugar-loaf peaks).
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { canvasTexture } from '../../textures.js';
import { dressDeck } from '../hazards/deck.js';
import { sectorArch } from '../hazards/signs.js';
import { PALETTE, SECTORS } from './palette.js';
import { HOLOGRAM } from './bodies.js';
import { hot, neonAt } from './util.js';
import { MS } from './shortcuts.js';
import { mesh } from './start.js';

const _c = new THREE.Color();

/** A named arch at the start of each sector (the table lives in palette.js). */
export function buildSectorArches(kit, M) {
  for (const q of SECTORS) {
    if (!q.title) continue;
    sectorArch(kit, { s: q.s, title: q.title, sub: q.sub ?? '', colour: q.hex, mats: { dark: M.dark, glow: M.glow }, height: 9.6, board: 22 });
  }
}

/** The shortcut decks: slabs and neon, entry gateways and floor chevrons at each mouth. */
export function dressShortcuts(kit, M, SC) {
  const mats = { dark: M.dark, glow: M.glow };
  dressDeck(kit, SC.d1, mats, { colour: PALETTE.cyan, colour2: PALETTE.magenta });
  dressDeck(kit, SC.d3, mats, { colour: PALETTE.mint, colour2: 0x9dff3d, skip: (pc) => pc.t !== 'solid' });
  const paint = kit.paint({ material: M.glow, lift: 0.05 });
  const track = kit.track;
  // chevrons on the road pointing at each mouth
  const mouth = (s, lat, colour) => { for (let k = 0; k < 4; k++) paint.chevron(s - 24 + k * 6, lat, 2.4, 6.2, _c.set(colour).multiplyScalar(2.4).clone(), 1.7); };
  mouth(track.S('@s1-108') - 6, 7.5, PALETTE.cyan);
  mouth(track.S('@climb') + MS.gb0 - 6, 7.5, PALETTE.mint);
  mouth(track.S('@crest-6') - 4, 8.2, PALETTE.magenta);
  // gateway hoops at the two bridge mouths (a magenta / mint ring standing on the deck)
  const M4 = new THREE.Matrix4(), tor = new THREE.TorusGeometry(8.4, 0.34, 8, 40), tor2 = new THREE.TorusGeometry(7.4, 0.14, 6, 40);
  const gate = (deck, colour, u) => {
    const a = deck.at(u), fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const g = new THREE.Group(); g.position.set(a.x, a.y + 1.2, a.z); g.rotation.y = a.yaw;
    g.add(new THREE.Mesh(tor, new THREE.MeshBasicMaterial({ color: hot(colour, 2.4), toneMapped: false })));
    const inner = new THREE.Mesh(tor2, new THREE.MeshBasicMaterial({ color: hot(0xffffff, 2), toneMapped: false })); g.add(inner);
    g.children[0].position.y = 5; inner.position.y = 5;
    kit.add(g); void fx; void fz; void M4;
    return inner;
  };
  const spinners = [gate(SC.d1, PALETTE.magenta, 14), gate(SC.d3, PALETTE.mint, 14), gate(SC.d1, PALETTE.cyan, SC.d1.length * 0.5)];
  kit.animate((dt, t) => { spinners.forEach((m, i) => { m.rotation.z = t * (i % 2 ? -1 : 1) * 0.8; }); });
  // ferry rails: a glowing track across the bridge where the ferry slides
  const fp = SC.ferry, rails = new THREE.Group();
  const railGeo = new THREE.BoxGeometry(34, 0.16, 0.24), railMat = new THREE.MeshBasicMaterial({ color: hot(PALETTE.yellow, 1.8), toneMapped: false });
  for (const dz of [-5.6, 5.6]) { const r = new THREE.Mesh(railGeo, railMat); r.position.set(0, -0.1, dz); rails.add(r); }
  rails.position.set(fp.x + Math.sin(fp.yaw) * fp.length / 2, fp.y0, fp.z + Math.cos(fp.yaw) * fp.length / 2); rails.rotation.y = fp.yaw + Math.PI / 2;
  kit.add(rails);
}

// ------------------------------------------------------------------ orbiting logo ring
function ringBandTexture() {
  return canvasTexture(4096, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const words = ['MARCOVERSE', 'CLOUD & PROUD', 'MARCO KART', 'SPEEDWAY'];
    const cols = ['#22d3ee', '#ff3fb4', '#ffd166', '#3dffb0'];
    const seg = w / words.length;
    words.forEach((t, i) => {
      ctx.font = 'italic 900 88px "Arial Black", Impact, system-ui, sans-serif';
      ctx.shadowColor = cols[i]; ctx.shadowBlur = 24; ctx.fillStyle = '#ffffff';
      ctx.fillText(t, seg * (i + 0.5), h / 2, seg * 0.86);
      ctx.fillStyle = cols[i]; ctx.fillRect(seg * i + 40, h - 12, seg - 80, 6); ctx.fillRect(seg * i + 40, 6, seg - 80, 6);
    });
  }, { repeat: false, aniso: 8 });
}

/** A ring 300 m across, tipped 24 degrees, turning slowly round the logo hologram: a band of light letters plus two neon rims and satellites. */
export function buildLogoRing(kit, M) {
  const R = 150, H = 20, pos = HOLOGRAM.pos;
  const tex = ringBandTexture();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 128, 1, true), new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : 0x22d3ee, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  if (tex) { tex.repeat.set(1, 1); }
  const rims = new Geo();
  for (const y of [-H / 2, H / 2]) rims.geometry(new THREE.TorusGeometry(R, 0.9, 6, 128), { rx: Math.PI / 2, y, colour: hot(y > 0 ? PALETTE.magenta : PALETTE.cyan, 2.6), ao: 0 });
  const sats = new Geo();
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; sats.sphere(4.2, { x: Math.cos(a) * R, z: Math.sin(a) * R, colour: hot([PALETTE.yellow, PALETTE.mint, PALETTE.orange][k % 3], 2.8), ao: 0 }, 10, 8); sats.box(1.2, 26, 1.2, { x: Math.cos(a) * R, z: Math.sin(a) * R, y: -13, colour: hot(0x8b7bff, 1.4), ao: 0 }); }
  const spin = new THREE.Group(); spin.add(band, mesh(rims, M.glow), mesh(sats, M.glow));
  const tilt = new THREE.Group(); tilt.add(spin); tilt.position.set(pos[0], pos[1] - 6, pos[2]); tilt.rotation.set(0.42, 0.5, 0.12);
  tilt.name = 'mv-logo-ring'; tilt.traverse((o) => { o.frustumCulled = false; });
  kit.add(tilt);
  kit.animate((dt, t) => { spin.rotation.y = -t * 0.09; tilt.rotation.z = 0.12 + Math.sin(t * 0.15) * 0.05; });
}

// ------------------------------------------------------------------ Copacabana island
function mosaicTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f2efe6'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#1b1b24';
    const amp = 26, per = 128;
    for (let row = 0; row < 5; row++) {
      const y0 = row * 100 + 30;
      ctx.beginPath(); ctx.moveTo(0, y0);
      for (let x = 0; x <= w; x += 4) ctx.lineTo(x, y0 + Math.sin((x / per) * Math.PI * 2 + row * 1.2) * amp);
      for (let x = w; x >= 0; x -= 4) ctx.lineTo(x, y0 + 46 + Math.sin((x / per) * Math.PI * 2 + row * 1.2) * amp);
      ctx.closePath(); ctx.fill();
    }
  }, { aniso: 8 });
}

/** A floating island of the Calçadão: black-and-white wave paving on a rock base, palms, two sugar-loaf peaks and a neon rim. */
export function buildIslands(kit, M) {
  const spots = [{ x: -60, y: 14, z: 330, r: 36, name: 'COPACABANA' }, { x: 120, y: 8, z: 380, r: 30, name: 'ARPOADOR' }];
  const mos = mosaicTexture();
  const topMat = new THREE.MeshStandardMaterial({ map: mos, color: mos ? 0xffffff : 0xdddddd, roughness: 0.7, emissive: 0x24263a, emissiveIntensity: 0.35 });
  const rock = new Geo(), leaves = new Geo(), glow = new Geo();
  const palm = (x, z, h, ry, g) => {
    g.cyl(0.35, 0.55, h, 6, { x, y: 0.4, z, colour: 0x6b4a34, ao: 0.2 });
    for (let k = 0; k < 7; k++) { const a = ry + (k / 7) * Math.PI * 2; leaves.beam([x, 0.4 + h, z], [x + Math.cos(a) * 4.6, 0.4 + h - 1.6, z + Math.sin(a) * 4.6], 0.32, 5, { colour: 0x2fbf6a, ao: 0 }); }
    leaves.sphere(0.6, { x, y: 0.4 + h, z, colour: 0x6b4a34, ao: 0 }, 6, 5);
  };
  for (const sp of spots) {
    const g = new THREE.Group(); g.position.set(sp.x, sp.y, sp.z); g.rotation.set(0.05, sp.x * 0.01, -0.04);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(sp.r, sp.r * 0.93, 1.4, 40), [new THREE.MeshStandardMaterial({ color: 0x2a2d6a, roughness: 0.8 }), topMat, new THREE.MeshStandardMaterial({ color: 0x2a2d6a })]);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(sp.r * 0.93, sp.r * 0.9, 20, 1, true).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0x3c3a7c, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
    cone.position.y = -sp.r * 0.45 - 0.7;
    g.add(top, cone);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(sp.r * 0.97, 0.3, 5, 60).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: hot(PALETTE.yellow, 2.2), toneMapped: false }));
    rim.position.y = 0.72; g.add(rim);
    const deco = new Geo(), lv = new Geo();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.4, d = sp.r * (0.4 + 0.3 * ((k * 37) % 10) / 10); palm(Math.cos(a) * d, Math.sin(a) * d, 5 + (k % 3), a, deco); }
    deco.cone(6, 15, 8, { x: sp.r * 0.45, y: 0.7, z: -sp.r * 0.1, colour: 0x4b4f96, top: 0x7b80c8, ao: 0.3 });
    deco.cone(4.2, 10, 8, { x: sp.r * 0.62, y: 0.7, z: sp.r * 0.2, colour: 0x4b4f96, top: 0x7b80c8, ao: 0.3 });
    g.add(mesh(rock, M.dark), mesh(deco, M.dark), mesh(leaves, M.dark), mesh(glow, M.glow));
    kit.add(g);
    void lv;
    kit.animate((dt, t) => { g.position.y = sp.y + Math.sin(t * 0.5 + sp.x) * 1.4; });
  }
}
