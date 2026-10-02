// Signage: truss gantries with status lights and holographic signs, the Marcoverse logo over the grid, chevron boards on corners.
import * as THREE from 'three';
import { makePointer, wallHeightAt, hdr, glowPad } from './util.js';
import { LED, HOLO, HOLO_WORDS } from './textures.js';

const wordIdx = (w) => HOLO_WORDS.findIndex((x) => x[0] === w);
const cell = (k) => { const c = k % HOLO.cols, r = Math.floor(k / HOLO.cols); return [c / HOLO.cols, 1 - (r + 1) / HOLO.rows, (c + 1) / HOLO.cols, 1 - r / HOLO.rows]; };

/** One gantry over the road at s: two posts standing on the wall tops, a truss beam with status LEDs and a holo sign facing oncoming traffic. */
export function gantry(kit, { M }, P, s, word, { flipMirror = true, y = 16, w = 12 } = {}) {
  const track = kit.track, f = P.frame(s), gap = track.road.wallGap, statics = kit.statics;
  const hwOut = f.width / 2 + gap + 0.8, k = wordIdx(word), colour = HOLO_WORDS[k]?.[2] ?? LED.cyan;
  const steel = 0x18224e, dark = 0x0e1636;
  const gs = statics.at(M.steel, f.x, f.z), gn = statics.at(M.neon, f.x, f.z);
  for (const side of [-1, 1]) {
    const px = f.x + f.rx * side * hwOut, pz = f.z + f.rz * side * hwOut, base = f.y - side * hwOut * Math.tan(f.banking) + wallHeightAt(track, s, side);
    gs.box(0.9, f.y + y + 0.5 - base, 0.9, { x: px, y: base - 0.1, z: pz, ry: f.yaw, colour: steel, ao: 0.1 });
    gs.box(1.6, 0.35, 1.6, { x: px, y: base - 0.1, z: pz, ry: f.yaw, colour: dark, ao: 0 });
    gn.box(0.12, y - 3, 0.12, { x: px + f.tx * -0.47, y: base + 1, z: pz + f.tz * -0.47, ry: f.yaw, colour: hdr(side < 0 ? LED.magenta : LED.cyan, 1.1), ao: 0 });
  }
  gs.box(2 * hwOut, 0.9, 0.9, { x: f.x, y: f.y + y - 0.3, z: f.z, ry: f.yaw, colour: steel, ao: 0.1 });
  gs.box(2 * hwOut - 1, 0.25, 1.15, { x: f.x, y: f.y + y + 0.55, z: f.z, ry: f.yaw, colour: dark, ao: 0 });
  gn.box(2 * hwOut - 2, 0.14, 0.14, { x: f.x + f.tx * 0.5, y: f.y + y - 0.36, z: f.z + f.tz * 0.5, ry: f.yaw, colour: hdr(colour, 1.2), ao: 0 });
  // status lights on the beam face
  const stat = [LED.green, LED.green, LED.cyan, LED.green, LED.amber, LED.green, LED.cyan, LED.magenta, LED.green];
  for (let i = -5; i <= 5; i++) {
    const lat = i * 2.0, c = stat[(i + 5 + Math.floor(s / 10)) % stat.length];
    gn.box(0.45, 0.32, 0.12, { x: f.x + f.rx * lat + f.tx * -0.47, y: f.y + y - 0.55, z: f.z + f.rz * lat + f.tz * -0.47, ry: f.yaw, colour: hdr(c, 1.25), ao: 0 });
  }
  // the sign
  if (k >= 0) {
    const h = w / 2, top = f.y + y - 0.5, bottom = top - h, [u0, v0, u1, v1] = cell(k);
    const face = f.yaw + Math.PI, cx = f.x + f.tx * -0.1, cz = f.z + f.tz * -0.1;
    const gh = statics.at(M.holo, f.x, f.z);
    gh.panel(w, h, { x: cx, y: bottom, z: cz, ry: face, uv: [u0, v0, u1, v1], colour: 0xffffff, ao: 0 });
    if (flipMirror) gh.panel(w, h, { x: f.x + f.tx * 0.1, y: bottom, z: f.z + f.tz * 0.1, ry: f.yaw, uv: [u1, v0, u0, v1], colour: 0xffffff, ao: 0 });     // back face reads correctly for cars leaving
    for (const [dy, len, hz] of [[0, w + 0.4, 0.14], [h, w + 0.4, 0.14]]) gn.box(len, hz, 0.12, { x: f.x, y: bottom + dy - 0.07, z: f.z, ry: f.yaw, colour: hdr(colour, 1.1), ao: 0 });
    for (const sg of [-1, 1]) gn.box(0.14, h + 0.14, 0.12, { x: f.x + f.rx * sg * (w / 2 + 0.2), y: bottom - 0.07, z: f.z + f.rz * sg * (w / 2 + 0.2), ry: f.yaw, colour: hdr(colour, 1.1), ao: 0 });
    // glow spilled onto the road
    glowPad(statics.at(M.glowFlat, f.x, f.z), f.x, f.y + 0.07, f.z, f.yaw, 16, f.width * 0.95, new THREE.Color(colour), 0.2, 5);
    kit._dcHalos?.add(f.x, f.y + bottom - f.y + h / 2, f.z, { sx: w * 2.0, sy: h * 2.2, sz: 1, colour: hdr(colour, 0.08) });
  }
}

/** All the signs and gantries of the lap. */
export function signage(kit, ctx, B) {
  const { R, M } = ctx, track = kit.track, P = makePointer(track), L = track.length, statics = kit.statics;
  kit._dcHalos = kit.instances(new THREE.PlaneGeometry(1, 1), M.haloSteady, { name: 'dc-signhalos', cell: 300, castShadow: false, receiveShadow: false });
  const S = (m, o = 0) => R.S(m) + o;
  const list = [
    [L - 130, 'PING'], [L - 40, 'sudo'], [70, 'us-east-1'], [S('boost1', 95), 'CLOUD 9'], [S('exit', 20), '/24'], [S('pre', -50), 'BGP'],
    [ctx.T.mouthA.sLo - 14, '404'], [S('dl1', -60), 'DNS'], [S('dl2', 46), 'MTU 9001'], [S('dl2', 120), 'VLAN 10'], [S('jump', -40), '10.0.0.0/8'],
    [S('bk0', 38), 'TTL 64'], [S('bk1', -30), 'ssh'], [S('tear1', 30), 'ECMP'], [S('fk1a', -40), 'OSPF'],
  ];
  for (const [s, word] of list) gantry(kit, ctx, P, s, word);

  // Marcoverse logo above the grid, hung from the ceiling
  const f = P.frame(0), w = 26, h = w / 4, y0 = f.y + 13;
  const gl = statics.at(M.logo, f.x, f.z);
  gl.panel(w, h, { x: f.x + f.tx * -0.06, y: y0, z: f.z + f.tz * -0.06, ry: f.yaw + Math.PI, uv: [0, 0, 1, 1], colour: 0xffffff, ao: 0 });
  gl.panel(w, h, { x: f.x + f.tx * 0.06, y: y0, z: f.z + f.tz * 0.06, ry: f.yaw, uv: [1, 0, 0, 1], colour: 0xffffff, ao: 0 });
  const gs = statics.at(M.steel, f.x, f.z), gn = statics.at(M.neon, f.x, f.z);
  for (const sg of [-1, 1]) gs.box(0.3, B.ceil - y0 - h, 0.3, { x: f.x + f.rx * sg * (w / 2 - 1.2), y: y0 + h, z: f.z + f.rz * sg * (w / 2 - 1.2), ry: f.yaw, colour: 0x18224e, ao: 0 });
  gn.box(w + 0.5, 0.2, 0.2, { x: f.x, y: y0 - 0.1, z: f.z, ry: f.yaw, colour: hdr(LED.cyan, 1.3), ao: 0 });
  gn.box(w + 0.5, 0.2, 0.2, { x: f.x, y: y0 + h - 0.1, z: f.z, ry: f.yaw, colour: hdr(LED.magenta, 1.3), ao: 0 });

  // chevron boards on the outside wall of the tight corners, pointing along the road
  const corners = [
    [S('pre'), S('dl0'), -1], [S('dl1'), S('dl2'), 1], [S('jump'), S('bk0'), 1], [S('br1', 31), S('tear0'), -1], [S('tear0'), S('tear1'), -1],
  ];
  const gc = (x, z) => statics.at(M.chev, x, z);
  for (const [a, b, dir] of corners) {
    const side = dir > 0 ? -1 : 1;
    for (let s = a - 22; s <= b - 3; s += 8) {
      const fr = P.frame(s), lat = side * (fr.width / 2 + track.road.wallGap - 0.06);
      const x = fr.x + fr.rx * lat, z = fr.z + fr.rz * lat, y = fr.y - lat * Math.tan(fr.banking) + 2.4;
      const ry = Math.atan2(-side * fr.rx, -side * fr.rz), uv = side < 0 ? [0, 0, 1, 1] : [1, 0, 0, 1];
      gc(x, z).panel(4.8, 2.4, { x, y, z, ry, uv, colour: 0xffffff, ao: 0 });
    }
  }
}
