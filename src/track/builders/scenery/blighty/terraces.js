// Blighty terraced houses and shop fronts along the streets. Rows are walked along the OFFSET curve of the road at true arc-length
// spacing, so they stay continuous on the inside of bends; each house is a brick / stucco box + window panels + door + roof + chimney.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { WIN, DOORS, SHOPS, SIGN_IDS } from './atlas.js';
import { chimneyGeo } from './props.js';

const BRICKS = [0xc9a877, 0xb4533a, 0x9a4b3b, 0xc98a5a, 0xa66a4a, 0xd4b48a];
const STUCCOS = [0xe8b4b8, 0xa9c8e0, 0xefe3c0, 0xb5d9c3, 0xf2c9a0, 0xc8b8dc];
const SLATES = [0x4a505b, 0x5a4d4a, 0x3f4650];
const SHOP_SIGN = { [WIN.shopTea]: SIGN_IDS.tea, [WIN.shopNews]: SIGN_IDS.news, [WIN.shopBakery]: SIGN_IDS.bakery, [WIN.shopPub]: SIGN_IDS.pub, [WIN.shopChips]: SIGN_IDS.chips, [WIN.shopBooks]: SIGN_IDS.books };
const AWNINGS = [0xc8281f, 0x1d3a6e, 0x2a7f62, 0xe9b91c];

/**
 * Walk the offset curve of the road and return evenly spaced spots facing the road.
 * @param {object} kit @param {{from:number|string,to:number|string,side:-1|1,offset?:number,width?:number}} o
 * @returns {Array<{x:number,y:number,z:number,yaw:number,s:number,side:number,along:number}>}
 */
export function walkRow(kit, { from, to, side, offset = 5.5, width = 6.2 }) {
  const { track, place } = kit, out = [], sm = {};
  const s0 = track.S(from); let s1 = track.S(to); if (s1 <= s0) s1 += track.length;
  let px = 0, pz = 0, acc = width / 2, first = true;
  for (let s = s0; s <= s1; s += 0.6) {
    track.sample(s, sm);
    const lat = side * (sm.width / 2 + offset), x = sm.pos.x + sm.right.x * lat, z = sm.pos.z + sm.right.z * lat;
    if (first) first = false; else acc += Math.hypot(x - px, z - pz);
    px = x; pz = z;
    if (acc < width) continue;
    acc -= width;
    const sp = place.spotAt(x, z); if (!sp) continue;
    const along = Math.atan2(sm.tangent.x, sm.tangent.z);
    out.push({ x, y: sp.y, z, yaw: along + (side > 0 ? Math.PI / 2 : -Math.PI / 2), s: wrap(s, track.length), side, along });
  }
  return out;
}
const wrap = (s, L) => ((s % L) + L) % L;

/** True when a w x d footprint behind `spot` keeps at least `margin` metres clear of every road. */
function footprintClear(kit, spot, w, d, margin) {
  const { track } = kit, q = clearQ, v = clearV, nx = Math.sin(spot.yaw), nz = Math.cos(spot.yaw), tx = nz, tz = -nx;
  for (const [a, b] of [[0, 0], [-w / 2, 0], [w / 2, 0], [0, -d], [-w / 2, -d], [w / 2, -d], [0, -d / 2]]) {
    v.set(spot.x + tx * a + nx * b, 1e4, spot.z + tz * a + nz * b);
    track.query(v, q);
    if (q.inVoid) return false;
    if (Math.abs(q.lateral) - track.widthAt(q.s) / 2 < margin) return false;
  }
  return true;
}
const clearQ = { height: 0, normal: new THREE.Vector3(), surface: '', onRoad: false, s: 0, lateral: 0, inVoid: false }, clearV = new THREE.Vector3();

/**
 * @param {object} kit @param {object} M materials { brick, stucco, solid, win, sign, cloth }
 * @param {{ atlas:{uv:(i:number)=>number[]}, signs:{uv:(i:number)=>number[]} }} A atlases
 * @param {{ rows:Array<{from,to,side,kind}>, skip:(spot)=>boolean }} spec
 * @returns {number} houses built
 */
export function buildTerraces(kit, M, A, { rows, skip, batch }) {
  const { rng } = kit;
  const chim = chimneyGeo();
  let count = 0;
  for (const row of rows) {
    const spots = walkRow(kit, { offset: 5.4, ...row });
    let run = 0, style = null;
    for (const sp of spots) {
      if (skip && skip(sp)) { run = 0; continue; }
      const kind = row.kind ?? 'home';
      if (run <= 0) { run = rng.int(3, 7); style = newStyle(rng, kind); }
      run--;
      const d = kind === 'shop' ? 10 : rng.range(8.5, 10.5), w = 6.2;
      if (!footprintClear(kit, sp, w, d, 3)) continue;
      addHouse(kit, M, A, sp, { ...style, batch, w, d, kind, floors: kind === 'shop' ? 3 : style.floors, chimney: rng() < 0.5 ? chim : null });
      count++;
    }
  }
  return count;
}

function newStyle(rng, kind) {
  const stucco = rng() < 0.38;
  return {
    stucco, colour: stucco ? rng.pick(STUCCOS) : rng.pick(BRICKS), floors: rng() < 0.4 ? 4 : 3, roof: rng.pick(SLATES),
    door: rng.pick(DOORS), shop: rng.pick(SHOPS), awning: rng.pick(AWNINGS), bay: rng() < 0.6, kind,
  };
}

/** One terraced house / shop. `sp` = front-centre spot facing the road. */
function addHouse(kit, M, A, sp, o) {
  const { rng } = kit, statics = o.batch ?? kit.statics, { w, d, floors } = o, fh = 3.1, H = floors * fh, ry = sp.yaw;
  const nx = Math.sin(ry), nz = Math.cos(ry), tx = nz, tz = -nx;
  const at = (lx, lz) => [sp.x + tx * lx + nx * lz, sp.z + tz * lx + nz * lz];
  const [cx, cz] = at(0, -d / 2), y0 = sp.y - 2.4;
  const wall = statics.at(o.stucco ? M.solid : M.brick, cx, cz), solid = statics.at(M.solid, cx, cz), win = statics.at(M.win, cx, cz);
  const tint = o.colour;
  wall.box(w, H + 2.4, d, { x: cx, y: y0, z: cz, ry, colour: tint, top: 0x777a80, ao: 0.32, facade: o.stucco ? [3, 3] : [2.4, 2.4] });
  // plinth + cornice + parapet
  const [px, pz] = at(0, 0.06);
  solid.box(w + 0.05, 0.9, 0.3, { x: at(0, 0.1)[0], y: sp.y - 0.05, z: at(0, 0.1)[1], ry, colour: 0xb8b3a6, ao: 0.2 });
  solid.box(w + 0.24, 0.32, d + 0.24, { x: cx, y: sp.y + H - 0.1, z: cz, ry, colour: 0xe8e2d2, ao: 0 });
  solid.box(w + 0.1, 0.5, d + 0.1, { x: cx, y: sp.y + H + 0.22, z: cz, ry, colour: tint, top: 0x777a80, ao: 0.1 });
  // roof (ridge along the street) and chimney
  const [rx, rz] = at(0, -d / 2);
  solid.gable(d - 0.6, 1.5, w, { x: rx, y: sp.y + H + 0.6, z: rz, ry: ry + Math.PI / 2, colour: o.roof, top: o.roof, ao: 0.15, overhang: 0.1 });
  if (o.chimney) { const [chx, chz] = at(w / 2, -d * 0.45); solid.merge(o.chimney, { x: chx, y: sp.y + H + 0.8, z: chz, ry }); }
  const glass = (cell, lx, yy, ww, hh, lz = 0.03) => { const [x, z] = at(lx, lz + 0.02); win.panel(ww, hh, { x, y: yy, z, ry, uv: A.atlas.uv(cell), colour: 0xffffff, ao: 0 }); };
  // ground floor
  if (o.kind === 'shop') {
    glass(o.shop, -1.75, sp.y + 0.15, 1.9, 2.6); glass(o.shop, 0.2, sp.y + 0.15, 1.9, 2.6); glass(o.door, 2.15, sp.y + 0.15, 1.6, 2.4);
    const [sx, sz] = at(0, 0.06), sg = statics.at(M.sign, cx, cz);
    sg.panel(5.7, 1.0, { x: sx, y: sp.y + 2.85, z: sz, ry, uv: A.signs.uv(SHOP_SIGN[o.shop] ?? 0), colour: 0xffffff, ao: 0 });
    const aw = o.awning, [ax, az] = at(0, 0.7);
    for (let i = 0; i < 8; i++) { const [sxx, szz] = at(-2.75 + (i + 0.5) * 0.6875, 0.65); solid.box(0.6875, 0.07, 1.25, { x: sxx, y: sp.y + 2.7, z: szz, ry, rx: -0.3, colour: i % 2 ? 0xffffff : aw, ao: 0 }); }
    void ax; void az;
    solid.box(5.8, 0.4, 0.06, { x: at(0, 1.25)[0], y: sp.y + 2.42, z: at(0, 1.25)[1], ry, colour: o.awning, ao: 0 });
  } else {
    glass(o.door, -1.5, sp.y + 0.55, 1.4, 2.1);
    if (o.bay) {
      const [bx, bz] = at(1.5, 0.35);
      wall.box(2.5, 2.9, 0.7, { x: bx, y: sp.y - 0.05, z: bz, ry, colour: tint, top: 0x777a80, ao: 0.25, facade: [3, 3] });
      solid.box(2.7, 0.14, 0.9, { x: bx, y: sp.y + 2.85, z: bz, ry, colour: 0xe8e2d2, ao: 0 });
      glass(WIN.bay, 1.5, sp.y + 0.25, 2.1, 2.4, 0.72);
    } else glass(rng() < 0.5 ? WIN.sash6 : WIN.sash4, 1.5, sp.y + 0.6, 1.4, 2.1);
    // steps
    solid.box(1.6, 0.35, 0.9, { x: at(-1.5, 0.45)[0], y: sp.y - 0.02, z: at(-1.5, 0.45)[1], ry, colour: 0xc9c4b6, ao: 0.1 });
  }
  // upper floors
  for (let f = 1; f < floors; f++) {
    const yy = sp.y + f * fh + 0.5;
    for (const lx of [-1.5, 1.5]) glass(pickWin(rng, f, floors), lx, yy, 1.4, 2.1);
    if (f === 1) solid.box(w, 0.12, 0.05, { x: at(0, 0.03)[0], y: sp.y + f * fh - 0.05, z: at(0, 0.03)[1], ry, colour: 0xe8e2d2, ao: 0 });
  }
  void px; void pz;
}

function pickWin(rng, f, floors) {
  const r = rng();
  if (f === floors - 1 && r < 0.25) return WIN.arch;
  return r < 0.08 ? WIN.lit : r < 0.16 ? WIN.curtains : r < 0.6 ? WIN.sash6 : WIN.sash4;
}

/** Tall backdrop blocks (offices / mansion flats) scattered behind the terraces for depth. */
export function buildBackdrop(kit, M, A, { rect, filter, minDist = 34, batch }) {
  const { rng, place } = kit, statics = batch ?? kit.statics;
  const spots = place.scatter({ rect, minDist, roadMargin: 34, filter });
  for (const sp of spots) {
    const w = rng.range(16, 26), d = rng.range(14, 22), floors = rng.int(4, 9), colour = rng.pick([...BRICKS, 0x8e8a86, 0xb8b0a0]);
    const wall = statics.at(M.building, sp.x, sp.z), roof = statics.at(M.solid, sp.x, sp.z);
    const H = floors * 3.3;
    wall.box(w, H + 2, d, { x: sp.x, y: sp.y - 2, z: sp.z, ry: sp.yaw, colour, top: 0x6b6f76, ao: 0.3, facade: [3.6, 3.3] });
    roof.box(w + 0.4, 0.5, d + 0.4, { x: sp.x, y: sp.y + H - 0.1, z: sp.z, ry: sp.yaw, colour: 0xd8d2c4, ao: 0 });
    roof.box(w * 0.3, 1.6, d * 0.3, { x: sp.x, y: sp.y + H + 0.4, z: sp.z, ry: sp.yaw, colour: 0x8a8f98, ao: 0.2 });
  }
  return spots.length;
}
