// Visual dressing of the cable-trench shortcut: rack rows that box it in, gate frames with warning lamps, fibre along the edges,
// magenta under-glow, and leaking cables dangling above the oil spills. Colliders are added separately in index.js (headless safe).
import * as THREE from 'three';
import { hdr, glowPad, lineTube } from './util.js';
import { LED } from './textures.js';

export function trenchDress(kit, { R, M, T }) {
  const st = kit.statics, Y0 = R.Y0, deck = T.deck;
  const H = 7.35;
  // rack rows along every capsule
  T.capsules.forEach(([ax, az, bx, bz, r], k) => {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), cx = (ax + bx) / 2, cz = (az + bz) / 2;
    st.at(M.rack, cx, cz).box(2 * r, H, len + 2 * r, { x: cx, y: 0, z: cz, ry: yaw, colour: 0xffffff, top: 0x0a1030, ao: 0.1, facade: [4.8, H] });
    const nc = hdr(k % 2 ? LED.cyan : LED.magenta, 1.2);
    for (const sg of [-1, 1]) {
      const ox = Math.cos(yaw) * sg * (r + 0.03), oz = -Math.sin(yaw) * sg * (r + 0.03);
      st.at(M.neon, cx, cz).box(0.16, 0.2, len + 2 * r, { x: cx + ox, y: H - 0.5, z: cz + oz, ry: yaw, colour: nc, ao: 0 });
      st.at(M.neon, cx, cz).box(0.14, 0.16, len + 2 * r, { x: cx + ox, y: 0.3, z: cz + oz, ry: yaw, colour: hdr(LED.magenta, 0.9), ao: 0 });
    }
  });

  // gate frames every 16 m along the deck
  const span = deck.width + 3.2;
  for (let u = 10; u < deck.length - 12; u += 16) {
    const p = T.dp(u, 0), gs = st.at(M.steel, p.x, p.z), gn = st.at(M.neon, p.x, p.z);
    gs.box(span, 0.6, 0.7, { x: p.x, y: H + 0.8, z: p.z, ry: deck.yaw, colour: 0x18224e, ao: 0.1 });
    for (const sg of [-1, 1]) { const q = T.dp(u, sg * (span / 2 - 0.4)); gs.box(0.5, 0.9, 0.5, { x: q.x, y: H - 0.05, z: q.z, ry: deck.yaw, colour: 0x2a3670, ao: 0 }); }
    gn.box(span - 1.2, 0.14, 0.14, { x: p.x, y: H + 0.68, z: p.z, ry: deck.yaw, colour: hdr(LED.magenta, 1.3), ao: 0 });
    for (let i = -2; i <= 2; i++) {
      const q = T.dp(u, i * 2.4);
      gn.box(0.5, 0.3, 0.2, { x: q.x, y: H + 0.95 + 0.0, z: q.z, ry: deck.yaw, colour: hdr(i % 2 ? LED.amber : LED.magenta, 1.3), ao: 0 });
    }
  }

  // fibre along both deck edges (pulsing) and centre trunk
  const fg = st.at(M.fibreC, deck.x, deck.z), fa = st.at(M.fibreA, deck.x, deck.z);
  for (const v of [-deck.width / 2 + 0.55, deck.width / 2 - 0.55]) {
    const pts = []; for (let i = 0; i <= 10; i++) { const p = T.dp(-2 + (deck.length * i) / 10, v); pts.push([p.x, Y0 + 0.2, p.z]); }
    lineTube(fg, pts, { r: 0.09, colour: hdr(LED.magenta, 1) });
  }
  {
    const pts = []; for (let i = 0; i <= 10; i++) { const p = T.dp(-2 + (deck.length * i) / 10, 0); pts.push([p.x, Y0 + 0.13, p.z]); }
    lineTube(fa, pts, { r: 0.07, colour: hdr(LED.cyan, 1) });
  }

  // glow on the grating and lane
  const gg = st.at(M.glowFlat, deck.x, deck.z), n = Math.ceil(deck.length / 30);
  for (let i = 0; i < n; i++) {
    const p = T.dp(((i + 0.5) * deck.length) / n, 0);
    glowPad(gg, p.x, Y0 + 0.11, p.z, deck.yaw, deck.length / n + 4, deck.width + 1.5, new THREE.Color(LED.magenta), 0.3, 5);
  }
  const ln = T.lane;
  glowPad(gg, ln.x + Math.sin(ln.yaw) * ln.length / 2, Y0 + 0.13, ln.z + Math.cos(ln.yaw) * ln.length / 2, ln.yaw, ln.length + 3, ln.width + 1.5, new THREE.Color(LED.cyan), 0.24, 6);

  // leaking cables dangling over each oil spill
  const drip = st.at(M.fibreB, deck.x, deck.z), nb = st.at(M.neon, deck.x, deck.z);
  T.oil.forEach((o, k) => {
    const cx = o.x + Math.sin(o.yaw) * o.length / 2 + Math.cos(o.yaw) * (-1) * 0, cz = o.z + Math.cos(o.yaw) * o.length / 2;
    const sgn = k % 2 ? 1 : -1, ox = cx + Math.cos(o.yaw) * -sgn * 0.0, oz = cz;
    const top = [ox + Math.cos(o.yaw) * sgn * 1.4, H + 0.7, oz - Math.sin(o.yaw) * sgn * 1.4];
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([top[0] + Math.sin(t * 3) * 0.25, top[1] - t * (H + 0.7 - 3.2), top[2] + Math.cos(t * 3) * 0.2]); }
    lineTube(drip, pts, { r: 0.13, colour: hdr(k % 2 ? LED.cyan : LED.magenta, 1) });
    const e = pts[pts.length - 1];
    nb.sphere(0.32, { x: e[0], y: e[1], z: e[2], colour: hdr(LED.magenta, 1.5), ao: 0 });
  });
}
