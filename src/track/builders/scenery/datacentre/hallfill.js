// The body of the hall beyond the racing walls: rows of tall rack blocks, structural pillars with light columns, ceiling light bars and
// halos, ladder trays, and cooling towers. Everything is placed in the open floor space: a plan-view road field keeps it clear of every road layer.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { makeRoadField, hdr } from './util.js';
import { LED } from './textures.js';
import { atriumBox } from './atrium.js';

const CYAN = LED.cyan, MAGENTA = LED.magenta, AMBER = LED.amber, BLUE = LED.blue;

/** Free-floor test for a rectangle (centre cx,cz; half sizes hx,hz; axis aligned): every sample must be `gap` metres beyond any road edge. */
function rectClear(field, cx, cz, hx, hz, gap) {
  const nx = Math.max(1, Math.ceil((2 * hx) / 5)), nz = Math.max(1, Math.ceil((2 * hz) / 5));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    if (field.at(cx - hx + (2 * hx * i) / nx, cz - hz + (2 * hz * j) / nz).edge < gap) return false;
  }
  return true;
}

export function hallFill(kit, { R, M, CUTS = [] }, B) {
  const rng = kit.rng, field0 = makeRoadField(kit.track), statics = kit.statics;
  const { x0, x1, z0, z1, ceil } = B;
  // the off-road shortcut decks (and their rack rows) keep the free-floor dressing out
  const keep = CUTS.map((c) => c.deck).map((d) => ({ d }));
  const nearCut = (x, z, pad) => keep.some(({ d }) => { const dx = x - d.x, dz = z - d.z, u = dx * d.ax + dz * d.az, v = dx * d.rx + dz * d.rz; return u > -pad && u < d.length + pad && Math.abs(v) < d.width / 2 + pad + 2; });
  const nearLane = (x, z, pad) => CUTS.some((c) => { const l = c.lane, dx = x - l.x, dz = z - l.z, f = Math.sin(l.yaw), g = Math.cos(l.yaw), u = dx * f + dz * g, v = dx * -g + dz * f; return u > -pad && u < l.length + pad && Math.abs(v) < l.width / 2 + pad + 2; });
  const kept = (x, z, pad) => nearCut(x, z, pad) || nearLane(x, z, pad);
  const field = { at: (x, z) => { const r = field0.at(x, z); return kept(x, z, 3) ? { ...r, edge: -1 } : r; } };
  const blocks = [];                                   // {cx, cz, hx, hz}
  const A = atriumBox(R), inAtrium = (x, z, px, pz) => x + px > A.x0 && x - px < A.x1 && z + pz > A.z0 && z - pz < A.z1;

  // ---- rack blocks: rows running east-west, 5 m deep, 16 m pitch
  const rowPitch = 17, depth = 5.4;
  let rowIdx = 0;
  for (let z = z0 + 12; z < z1 - 10; z += rowPitch, rowIdx++) {
    let x = x0 + 8 + rng.range(0, 20);
    while (x < x1 - 20) {
      const len = rng.range(26, 70), cx = x + len / 2;
      x += len + rng.range(12, 22);
      if (inAtrium(cx, z, len / 2, depth / 2)) continue;
      const tall = rng() < 0.22 ? 3 : 2;
      const h = 7.35 * tall;
      // near the roads keep them at least a wall's thickness back; elsewhere anything goes
      if (!rectClear(field, cx, z, len / 2, depth / 2, 9)) {
        // try a shorter block on either side of the obstruction: shrink from both ends until clear
        let l2 = len * 0.5, ok = false;
        while (l2 > 12) { if (rectClear(field, cx, z, l2 / 2, depth / 2, 9)) { ok = true; break; } l2 *= 0.75; }
        if (!ok) continue;
        addBlock(cx, z, l2, h);
      } else addBlock(cx, z, len, h);
    }
  }
  function addBlock(cx, cz, len, h) {
    blocks.push({ cx, cz, hx: len / 2, hz: depth / 2 });
    const tone = 0.55 + 0.45 * rng();
    const g = statics.at(M.rack, cx, cz);
    g.box(len, h, depth, { x: cx, y: 0, z: cz, colour: new THREE.Color(tone, tone, tone), top: 0x0a1030, ao: 0.1, facade: [4.8, 7.35] });
    const ng = statics.at(M.neon, cx, cz), col = hdr(rowIdx % 3 === 0 ? MAGENTA : CYAN, 1.25);
    ng.box(len + 0.2, 0.18, 0.18, { x: cx, y: h - 0.4, z: cz - depth / 2 - 0.03, colour: col, ao: 0 });
    ng.box(len + 0.2, 0.18, 0.18, { x: cx, y: h - 0.4, z: cz + depth / 2 + 0.03, colour: col, ao: 0 });
    if (h > 15) ng.box(len + 0.2, 0.14, 0.14, { x: cx, y: 7.35, z: cz - depth / 2 - 0.03, colour: hdr(BLUE, 0.7), ao: 0 }), ng.box(len + 0.2, 0.14, 0.14, { x: cx, y: 7.35, z: cz + depth / 2 + 0.03, colour: hdr(BLUE, 0.7), ao: 0 });
  }

  // ---- pillars on a 64 m grid with glowing corner strips
  const inBlock = (x, z, pad) => blocks.some((b) => Math.abs(x - b.cx) < b.hx + pad && Math.abs(z - b.cz) < b.hz + pad);
  const pillarCol = new THREE.Color(0x141c40);
  let np = 0;
  for (let px = x0 + 40; px < x1 - 30; px += 64) for (let pz = z0 + 30; pz < z1 - 20; pz += 64) {
    const x = px + rng.range(-3, 3), z = pz + rng.range(-3, 3);
    if (field.at(x, z).edge < 8 || inBlock(x, z, 3) || inAtrium(x, z, 3, 3)) continue;
    const g = statics.at(M.steel, x, z), ng = statics.at(M.neon, x, z);
    g.box(3, ceil, 3, { x, y: 0, z, colour: pillarCol, ao: 0.15 });
    const c = hdr(np % 3 === 1 ? MAGENTA : CYAN, 1.3);
    for (const [dx, dz] of [[-1.55, -1.55], [1.55, -1.55], [-1.55, 1.55], [1.55, 1.55]]) ng.box(0.16, ceil - 0.5, 0.16, { x: x + dx, y: 0.2, z: z + dz, colour: c, ao: 0 });
    g.box(4.2, 0.6, 4.2, { x, y: 0, z, colour: 0x1c2652, ao: 0 });           // plinth
    np++;
  }

  // ---- ceiling: light bars, ladders and halos
  const barGeo = new Geo(); barGeo.box(10, 0.3, 0.42, { colour: 0xffffff, ao: 0 });
  const bars = kit.instances(barGeo, M.neonBase, { name: 'dc-bars', cell: 260, castShadow: false, receiveShadow: false });
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  const halos = kit.instances(haloGeo, M.haloSteady, { name: 'dc-halos', cell: 260, castShadow: false, receiveShadow: false });
  for (let bx = x0 + 20; bx < x1 - 10; bx += 34) for (let bz = z0 + 20; bz < z1 - 10; bz += 38) {
    if (inAtrium(bx, bz, 6, 2)) continue;
    const r = rng(), colour = r < 0.68 ? CYAN : r < 0.84 ? 0xdff6ff : r < 0.95 ? MAGENTA : AMBER;
    bars.add(bx, ceil - 1.2, bz, { colour: hdr(colour, 1.7) });
    halos.add(bx, ceil - 3, bz, { sx: 26, sy: 14, sz: 1, colour: hdr(colour, 0.24) });
  }
  const ladder = statics;
  for (let z = z0 + 30; z < z1; z += 76) {
    const g = ladder.at(M.steel, x0 + (x1 - x0) / 2, z);
    // (long beams are split so the batch chunks cull well)
    for (let x = x0; x < x1; x += 140) { const len = Math.min(140, x1 - x); g.box(len, 0.7, 0.9, { x: x + len / 2, y: ceil - 4.6, z, colour: 0x121a3c, ao: 0 }); }
  }

  // ---- cooling towers in the open floor
  const towers = [];
  for (let tries = 0; tries < 400 && towers.length < 9; tries++) {
    const x = rng.range(x0 + 40, x1 - 40), z = rng.range(z0 + 40, z1 - 40), r = rng.range(5.5, 8.5);
    if (field.at(x, z).edge < r + 14 || inBlock(x, z, r + 4) || inAtrium(x, z, r + 6, r + 6) || towers.some((t) => Math.hypot(t.x - x, t.z - z) < 70)) continue;
    towers.push({ x, z, r });
  }
  towers.forEach((t, k) => {
    const g = statics.at(M.steel, t.x, t.z), ng = statics.at(M.neon, t.x, t.z);
    g.cyl(t.r, t.r * 1.08, ceil, 18, { x: t.x, y: 0, z: t.z, colour: 0x18224a, ao: 0.2 });
    g.cyl(t.r * 1.3, t.r * 1.3, 1.2, 18, { x: t.x, y: 0, z: t.z, colour: 0x222d60, ao: 0 });
    const c = hdr(k % 3 === 2 ? AMBER : k % 2 ? MAGENTA : CYAN, 1.5);
    for (let y = 4; y < ceil - 3; y += 6.5) ng.cyl(t.r * 1.03, t.r * 1.03, 0.32, 18, { x: t.x, y, z: t.z, colour: c, ao: 0 });
    for (let a = 0; a < 3; a++) {                                                    // vertical light slits
      const an = (a / 3) * 6.283 + k, sx = t.x + Math.cos(an) * (t.r + 0.05), sz = t.z + Math.sin(an) * (t.r + 0.05);
      ng.box(0.3, ceil - 8, 0.3, { x: sx, y: 4, z: sz, colour: hdr(BLUE, 0.9), ao: 0, ry: an });
    }
    halos.add(t.x, ceil * 0.5, t.z, { sx: t.r * 5, sy: ceil * 0.9, sz: 1, colour: hdr(k % 3 === 2 ? AMBER : CYAN, 0.16) });
  });
  return { blocks, towers, field };
}
