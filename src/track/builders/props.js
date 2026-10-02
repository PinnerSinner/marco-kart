// Ready-made track furniture: start line + grid boxes, boost pads, chevron / arrow signs, start gantry.
import * as THREE from 'three';
import { Geo } from './Geo.js';
import { Paint } from './paint.js';
import { bannerTexture, checkerTexture } from './textures.js';

const col = new THREE.Color();

/**
 * Chequered start/finish line across the whole road at s = 0, plus painted grid slot boxes.
 * @returns {THREE.Mesh}
 */
export function buildStartLine(track, material, { gridBoxes = true } = {}) {
  const paint = new Paint(track, { lift: 0.035 });
  const hw = track.widthAt(0) / 2, cols = 12, cw = (2 * hw) / cols, rows = 2, len = 1.0;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    paint.rect(-0.5 + (r - 0.5) * len + len / 2 * 0, -hw + cw * (k + 0.5), len, cw, (k + r) % 2 ? 0xf7f7f2 : 0x141418);
  }
  if (gridBoxes) {
    for (let i = 0; i < 8; i++) {
      const slot = track.gridSlot(i);
      const q = track.query(slot.pos, {}), s = q.s > track.length / 2 ? q.s - track.length : q.s;
      const l = q.lateral, len2 = 3.4, w = 2.4, t = 0.16;
      const s0 = s - len2 / 2, s1 = s + len2 / 2;
      paint.rect(s0 + t / 2, l, t, w, 0xffffff); paint.rect((s0 + s1) / 2, l - w / 2 + t / 2, len2, t, 0xffffff); paint.rect((s0 + s1) / 2, l + w / 2 - t / 2, len2, t, 0xffffff);
    }
  }
  return paint.build(material);
}

/** Chevron shapes (three staggered ">") for one boost pad; returns 3 Paint meshes (one per chaser lamp). */
export function buildBoostPads(track, mats) {
  const meshes = [];
  const plate = new Paint(track, { lift: 0.028 });
  const lamps = [new Paint(track, { lift: 0.04 }), new Paint(track, { lift: 0.04 }), new Paint(track, { lift: 0.04 })];
  for (const b of track.boostPads) {
    const { s, lateral: l, length: L, width: W } = b;
    plate.rect(s, l, L, W, 0x0d1a3a);
    plate.rect(s, l - W / 2 + 0.16, L, 0.32, 0x22d3ee); plate.rect(s, l + W / 2 - 0.16, L, 0.32, 0x22d3ee);
    const c = Math.min(L * 0.14, 1.5), w = W * 0.36;
    for (let k = 0; k < 3; k++) lamps[k].chevron(s + (k - 1) * L * 0.29, l, c, w, 0xffffff, c * 0.62);
  }
  const pm = plate.build(mats.plate); if (pm) meshes.push(pm);
  lamps.forEach((p, k) => { const m = p.build(mats.lamps[k]); if (m) meshes.push(m); });
  return meshes;
}

/**
 * Geometry for one chevron sign (two posts, a board, a bold ">" made of two bars). Faces +Z; the board is 3.4 x 1.9 m.
 * @param {'left'|'right'} dir which way the chevron points (the direction of the upcoming turn)
 */
export function chevronSignGeo(dir = 'right', { board = 0x101a33, chev = 0xffd166, post = 0x9aa3b2 } = {}) {
  const g = new Geo();
  g.cyl(0.07, 0.09, 2.6, 6, { x: -1.2, colour: post, ao: 0.2 }); g.cyl(0.07, 0.09, 2.6, 6, { x: 1.2, colour: post, ao: 0.2 });
  g.box(3.4, 1.9, 0.14, { y: 1.5, z: -0.02, colour: board, ao: 0.1 });
  g.box(3.5, 0.12, 0.2, { y: 3.32, z: -0.02, colour: 0xf2f2ee, ao: 0 }); g.box(3.5, 0.12, 0.2, { y: 1.46, z: -0.02, colour: 0xf2f2ee, ao: 0 });
  const sg = dir === 'right' ? -1 : 1;                   // chevron '>' as seen by a driver facing the sign (their right is -x for a +z-facing sign)
  const y = 2.45, a = 0.78;
  g.box(1.25, 0.34, 0.06, { x: sg * -0.5 * 0 + sg * 0.15, y: y + 0.36 - 0.17, z: 0.08, rz: sg * -a * 1, colour: chev, ao: 0 });
  g.box(1.25, 0.34, 0.06, { x: sg * 0.15, y: y - 0.36 - 0.17, z: 0.08, rz: sg * a, colour: chev, ao: 0 });
  return g;
}

/**
 * Start gantry over the road at s = 0 (or `s`): striped pylons, a truss beam and a lit two-sided MARCO KART banner.
 * @returns {THREE.Group}
 */
export function buildGantry(track, s = 0, { lines = ['MARCO KART', 'START / FINISH'], clearance = 7.4 } = {}) {
  const group = new THREE.Group(); group.name = 'gantry';
  const sm = track.sample(s), hw = sm.width / 2 + track.model.wallGap + 1.4;
  const yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
  const g = new Geo(), y0 = sm.pos.y;
  const side = (sg) => {
    const x = sg * hw;
    for (let k = 0; k < 6; k++) g.cyl(0.55, 0.62, 1.3, 10, { x, y: k * 1.3 + (k ? 0 : 0), colour: k % 2 ? 0xf5f5f0 : 0xd62839, ao: 0.15 });
    g.box(1.6, 0.5, 1.6, { x, y: -0.05, colour: 0x222a3a }); g.cyl(0.62, 0.62, 0.3, 10, { x, y: 7.8, colour: 0x101a33 });
  };
  side(-1); side(1);
  const span = 2 * hw;
  g.box(span, 1.5, 0.9, { y: clearance, colour: 0x101a33, ao: 0.1, top: 0x1c2a52 });
  g.box(span, 0.18, 1.1, { y: clearance + 1.5, colour: 0xd62839 }); g.box(span, 0.18, 1.1, { y: clearance - 0.18, colour: 0x22d3ee, ao: 0 });
  for (let k = -3; k <= 3; k++) { g.cyl(0.22, 0.28, 0.35, 8, { x: k * (span / 7.4), y: clearance - 0.5, colour: 0xffffff, ao: 0 }); }
  const mesh = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 }));
  mesh.castShadow = true; mesh.name = 'gantry-frame';
  group.add(mesh);
  const tex = bannerTexture(lines);
  const bm = new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : 0x0b1d3a });
  const bw = span - 1.6, bh = 1.32;
  for (const sgn of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), bm);
    p.position.set(0, clearance + 0.75, sgn * 0.47); if (sgn < 0) p.rotation.y = Math.PI;
    group.add(p);
  }
  group.position.set(sm.pos.x, y0, sm.pos.z); group.rotation.y = yaw;
  return group;
}
