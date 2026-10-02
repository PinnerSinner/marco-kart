// The start: a neon MARCO KART gantry, floodlight masts with light shafts, and a glowing launch pad under the grid deck.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { PALETTE } from './palette.js';
import { hot, lightShaft } from './util.js';
import { bannerTexture } from './textures.js';

/** @param {object} kit @param {object} M materials */
export function buildStart(kit, M) {
  const { track } = kit, sm = track.sample(0), hw = sm.width / 2, y0 = sm.pos.y, yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
  const group = new THREE.Group(); group.name = 'mv-start'; group.position.set(sm.pos.x, y0, sm.pos.z); group.rotation.y = yaw;
  const solid = new Geo(), glow = new Geo(), shaft = new Geo();
  const span = 2 * (hw + 1.7), H = 9.4;
  const cy = hot(PALETTE.cyan, 3), mg = hot(PALETTE.magenta, 3), wh = hot(0xffffff, 2.4);

  // gantry: two tapering pylons with neon spines, a truss beam, lamp row and a banner
  for (const sg of [-1, 1]) {
    const x = sg * (hw + 1.7);
    solid.box(1.5, H, 1.5, { x, colour: 0x1b1f58, ao: 0.25, top: 0x30378a });
    solid.box(2.4, 0.7, 2.4, { x, colour: 0x0d1035, ao: 0 });
    glow.box(0.22, H - 1.2, 0.22, { x: x - sg * 0.0, z: 0.78, y: 0.9, colour: cy, ao: 0 }); glow.box(0.22, H - 1.2, 0.22, { x, z: -0.78, y: 0.9, colour: cy, ao: 0 });
    glow.box(0.3, 0.3, 2.6, { x, y: H, colour: mg, ao: 0 });
    for (let k = 0; k < 4; k++) glow.box(1.9, 0.12, 1.9, { x, y: 1.4 + k * 2.0, colour: k % 2 ? mg : cy, ao: 0 });   // pylon rungs
  }
  solid.box(span + 1.6, 1.9, 1.5, { y: H - 1.0, colour: 0x141850, ao: 0.1, top: 0x2b3390 });
  glow.box(span + 1.7, 0.16, 1.6, { y: H - 1.1, colour: cy, ao: 0 }); glow.box(span + 1.7, 0.16, 1.6, { y: H + 0.85, colour: mg, ao: 0 });
  for (let k = -4; k <= 4; k++) {                                                                       // lamp row under the beam
    glow.box(0.7, 0.28, 0.7, { x: k * (span / 8.6), y: H - 1.4, colour: wh, ao: 0 });
    lightShaft(shaft, [k * (span / 8.6), H - 1.4, 0], [k * (span / 8.6) * 1.05, 0.2, 0], 0.32, 1.3, hot(PALETTE.cyan, 0.05), hot(PALETTE.cyan, 0), 8);
  }
  // twin holographic fins above the beam
  for (const sg of [-1, 1]) solid.box(0.35, 3.4, 0.9, { x: sg * span * 0.32, y: H + 0.9, colour: 0x1b1f58, ao: 0.1, rz: sg * 0.18 });
  const off = globalThis.__MVOFF || '';
  group.add(mesh(solid, M.dark), mesh(glow, M.glow)); if (!off.includes('shaft')) group.add(mesh(shaft, M.add, 2));

  const tex = bannerTexture();
  const bm = new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : 0x1b1f58, toneMapped: false, fog: false });
  const bw = span + 0.4, bh = bw / 8;
  for (const sg of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), bm);
    p.position.set(0, H - 1.0, sg * 0.78); if (sg < 0) p.rotation.y = Math.PI;
    group.add(p);
  }
  if (!off.includes('banner')) kit.add(group); else { group.children.slice(2).forEach((c) => group.remove(c)); kit.add(group); }

  // floodlight masts with cones of light, two pairs either side of the grid
  const mast = new Geo(), lamps = new Geo(), beams = new Geo();
  for (const ds of [-34, 26]) for (const sg of [-1, 1]) {
    const x = sg * (hw + 3.2), z = ds;
    mast.cyl(0.32, 0.55, 15, 8, { x, z, colour: 0x1b1f58, ao: 0.3 });
    mast.box(3.4, 0.5, 1.0, { x, y: 15, z, colour: 0x0d1035, ao: 0 });
    for (let k = -1; k <= 1; k++) {
      lamps.box(0.9, 0.5, 0.9, { x: x + k * 1.05, y: 14.6, z, colour: hot(0xfff4dd, 3.2), ao: 0 });
      lightShaft(beams, [x + k * 1.05, 14.5, z], [x * 0.35 + k * 1.6, 0, z + 2.5 * (k)], 0.5, 4.2, hot(0xbfe9ff, 0.022), hot(0x7fbfff, 0.002), 10);
    }
  }
  const fg = new THREE.Group(); fg.name = 'mv-floods'; fg.add(mesh(mast, M.dark), mesh(lamps, M.glow), mesh(beams, M.add, 2));
  fg.position.set(sm.pos.x, y0, sm.pos.z); fg.rotation.y = yaw; if (!off.includes('floods')) kit.add(fg);

  // launch pad below the grid: a wide dark disc ringed in neon, hanging under the slab
  const pad = new Geo(), padGlow = new Geo();
  const pc = track.sample(-14), R = 33;
  pad.cyl(R, R * 0.92, 1.6, 40, { colour: 0x14174a, ao: 0.1, top: 0x1b2066 });
  padGlow.geometry(new THREE.TorusGeometry(R * 0.985, 0.32, 6, 64), { rx: Math.PI / 2, y: 0.8, colour: hot(PALETTE.cyan, 3), ao: 0 });
  padGlow.geometry(new THREE.TorusGeometry(R * 0.7, 0.16, 6, 56), { rx: Math.PI / 2, y: 1.7, colour: hot(PALETTE.magenta, 2.6), ao: 0 });
  const pg = new THREE.Group(); pg.name = 'mv-pad'; pg.add(mesh(pad, M.dark), mesh(padGlow, M.glow));
  pg.position.set(pc.pos.x, pc.pos.y - 4.85, pc.pos.z); if (!off.includes('pad')) kit.add(pg);
}

function mesh(g, mat, order = 0) {
  const m = new THREE.Mesh(g.build(), mat); m.renderOrder = order; m.castShadow = false; return m;
}
export { mesh };
