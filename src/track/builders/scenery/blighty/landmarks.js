// Blighty landmarks: the clock-tower roundabout (lawn, flower beds, benches, animated clock hands) and the canal.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { canvasTexture } from '../../textures.js';
import { clockTowerGeo, hourHandGeo, minuteHandGeo, lampGeo, lanternGeo, benchGeo, narrowboatGeo, pillarBoxGeo, phoneBoxGeo } from './props.js';

/** Clock dial: cream face, gold bezel, Roman numerals. */
export function clockFaceTexture() {
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#c9a54a'; ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#1d2530'; ctx.beginPath(); ctx.arc(256, 256, 244, 0, 7); ctx.fill();
    ctx.fillStyle = '#f4ecd2'; ctx.beginPath(); ctx.arc(256, 256, 232, 0, 7); ctx.fill();
    ctx.strokeStyle = '#1d2530'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(256, 256, 176, 0, 7); ctx.stroke();
    ctx.fillStyle = '#1d2530'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 46px Georgia, "Times New Roman", serif';
    const R = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, x = 256 + Math.sin(a) * 202, y = 256 - Math.cos(a) * 202;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillText(R[i], 0, 0, 62); ctx.restore();
    }
    for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2, r0 = i % 5 ? 172 : 164; ctx.lineWidth = i % 5 ? 2 : 4; ctx.beginPath(); ctx.moveTo(256 + Math.sin(a) * r0, 256 - Math.cos(a) * r0); ctx.lineTo(256 + Math.sin(a) * 178, 256 - Math.cos(a) * 178); ctx.stroke(); }
  }, { repeat: false, aniso: 8 });
}

/**
 * Roundabout island: tower + lawn + flower beds. `ctx.island` = { x, z, r }.
 */
export function buildRoundabout(kit, M, ctx) {
  const { track, statics, rng } = kit, { x, z } = ctx.island, y = track.heightAt(x, z), T = kit.THREE;
  const solid = statics.at(M.solid, x, z), stone = statics.at(M.stone, x, z);
  solid.cyl(25.4, 25.6, 0.3, 32, { x, y, z, colour: 0x4d7d3c, top: 0x5a8a45, ao: 0 });
  stone.merge(clockTowerGeo(), { x, y: y + 0.2, z, ry: 0.4 });
  track.model.addCollider(x, z, 14.2);
  // flower beds and benches ring
  const bloom = [0xd94a76, 0xf2c14e, 0xf5f0e6, 0xa66bd6, 0xe8703a];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2, bx = x + Math.cos(a) * 20.4, bz = z + Math.sin(a) * 20.4;
    solid.cyl(2.3, 2.5, 0.45, 10, { x: bx, y: y + 0.2, z: bz, colour: 0x5a4636, top: bloom[i % 5], ao: 0.1 });
    for (let k = 0; k < 14; k++) solid.sphere(0.34, { x: bx + rng.range(-1.7, 1.7), y: y + 0.5, z: bz + rng.range(-1.7, 1.7), colour: bloom[(i + k * 2) % 5], ao: 0 }, 5, 4);
  }
  const bench = benchGeo(), lamp = lampGeo(), lantern = lanternGeo();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, bx = x + Math.cos(a) * 17, bz = z + Math.sin(a) * 17;
    solid.merge(bench, { x: bx, y: y + 0.25, z: bz, ry: -a + Math.PI / 2 });
    const lx = x + Math.cos(a + 0.5) * 23.2, lz = z + Math.sin(a + 0.5) * 23.2;
    solid.merge(lamp, { x: lx, y: y + 0.25, z: lz }); statics.at(M.glow, lx, lz).merge(lantern, { x: lx, y: y + 0.25, z: lz });
  }
  // chevron-board style road furniture on the island: a pillar box and phone box by the path
  solid.merge(pillarBoxGeo(), { x: x + 16.5, y: y + 0.25, z: z - 5, ry: 1.2 }); solid.merge(phoneBoxGeo(), { x: x + 16, y: y + 0.25, z: z + 2, ry: 1.9 });
  // clock faces + animated hands
  const cy = y + 0.2 + 34.6, half = 5.56, hands = [];
  for (let k = 0; k < 4; k++) {
    const ry = 0.4 + (k * Math.PI) / 2, fx = Math.sin(ry), fz = Math.cos(ry);
    statics.at(M.clock, x, z).panel(7.6, 7.6, { x: x + fx * half, y: cy - 3.8, z: z + fz * half, ry, uv: [0, 0, 1, 1], colour: 0xffffff, ao: 0 });
    const grp = new T.Group(); grp.position.set(x + fx * (half + 0.06), cy, z + fz * (half + 0.06)); grp.rotation.y = ry;
    const hour = new T.Mesh(hourHandGeo().build(), M.dark), minute = new T.Mesh(minuteHandGeo().build(), M.dark);
    hour.scale.setScalar(1.3); minute.scale.setScalar(1.35); minute.position.z = 0.05;
    grp.add(hour, minute); kit.add(grp); hands.push([hour, minute]);
  }
  kit.animate((dt, t) => {
    const mins = 622 + t * 0.9;                              // ten past ten, running about 54x real time so the hands visibly move
    const m = (mins % 60) / 60 * Math.PI * 2, h = (mins / 720) % 1 * Math.PI * 2;
    for (const [hh, mm] of hands) { hh.rotation.z = -h; mm.rotation.z = -m; }
  });
}

/** Canal: bed, brick quay walls with coping, railings, tunnel portals, moored + cruising narrowboats. */
export function buildCanal(kit, M, ctx) {
  const { track, statics, rng } = kit, C = ctx.canal, T = kit.THREE, len = C.z1 - C.z0, midx = (C.x0 + C.x1) / 2, wid = C.x1 - C.x0;
  const solid = statics.at(M.solid, midx, C.z0 + len / 2);
  // bed (hidden under opaque-ish water)
  solid.box(wid + 0.6, 0.3, len + 0.6, { x: midx, y: C.floor - 0.3, z: C.z0 + len / 2, colour: 0x2f3a33, ao: 0 });
  const brick = (x, z) => statics.at(M.brick, x, z), SEG = 16;
  for (let z = C.z0; z < C.z1; z += SEG) {
    const zc = z + SEG / 2, ground = Math.max(track.heightAt(C.x0 - 1, zc), track.heightAt(C.x1 + 1, zc));
    const h = ground - C.floor + 0.02;
    for (const [x, sgn] of [[C.x0 - 0.02, -1], [C.x1 + 0.02, 1]]) {
      brick(x, zc).box(0.8, h, SEG, { x: x + sgn * 0.4 * -1, y: C.floor, z: zc, colour: 0x8a5a48, top: 0x8a5a48, ao: 0.4, facade: [2.4, 2.4] });
      solid.box(1.1, 0.22, SEG, { x: x - sgn * 0.3 + sgn * 0.0, y: ground - 0.2, z: zc, colour: 0xc9c4b6, ao: 0 });
    }
  }
  // end walls with arched tunnel portals (the canal continues under the city)
  for (const zz of [C.z0, C.z1]) {
    const dir = zz === C.z0 ? 1 : -1, zw = zz + dir * 0.4, ground = track.heightAt(midx, zz + dir * -2);
    const b = brick(midx, zz);
    const H = ground - C.floor + 0.02, ph = 5.2, pw = 10.6;
    b.box(wid + 1.6, H - ph - 1.9, 0.8, { x: midx, y: C.floor + ph + 1.9, z: zw, colour: 0x8a5a48, top: 0x8a5a48, ao: 0.3, facade: [2.4, 2.4] });
    for (const sx of [-1, 1]) b.box(wid / 2 - pw / 2 + 0.8, ph + 1.9, 0.8, { x: midx + sx * (pw / 2 + (wid / 2 - pw / 2 + 0.8) / 2 - 0.4), y: C.floor, z: zw, colour: 0x8a5a48, ao: 0.3, facade: [2.4, 2.4] });
    solid.box(pw, 0.8, 0.9, { x: midx, y: C.floor + ph, z: zw, colour: 0xc9c4b6, ao: 0 });
    solid.box(pw + 0.6, ph + 1.9, 0.5, { x: midx, y: C.floor - 0.1, z: zw + dir * 0.6, colour: 0x0b0d10, ao: 0 });   // the dark tunnel
    solid.box(wid + 2.2, 0.28, 1.2, { x: midx, y: ground - 0.25, z: zw, colour: 0xc9c4b6, ao: 0 });
  }
  // railings along both banks
  const rails = statics.at(M.rail, midx, C.z0);
  for (const sgn of [-1, 1]) for (let z = C.z0 + 4; z < C.z1 - 3; z += 8) {
    if (Math.abs(z + 4 - ctx.bridgeZ) < 16) continue;
    const zc = z + 4 > C.z1 ? z : z, gy = track.heightAt(sgn < 0 ? C.x0 - 0.4 : C.x1 + 0.4, zc);
    statics.at(M.rail, midx, zc).panel(8, 1.1, { x: sgn < 0 ? C.x0 - 0.5 : C.x1 + 0.5, y: gy, z: zc, ry: Math.PI / 2, colour: 0xffffff, ao: 0, both: true });
  }
  void rails;
  // lamps along the towpath
  const lamp = lampGeo(), lantern = lanternGeo();
  for (const sgn of [-1, 1]) for (let z = C.z0 + 20; z < C.z1 - 10; z += 36) {
    if (Math.abs(z - ctx.bridgeZ) < 30) continue;
    const lx = sgn < 0 ? C.x0 - 1.6 : C.x1 + 1.6, gy = track.heightAt(lx, z);
    solid.merge(lamp, { x: lx, y: gy, z }); statics.at(M.glow, lx, z).merge(lantern, { x: lx, y: gy, z });
    track.model.addCollider(lx, z, 0.5);
  }
  // boats: moored on the west bank (bobbing) + one cruising between the tunnel and the bridge
  const hulls = [[0x1f4d8a, 0xc8281f], [0x2a6f4e, 0xf2d16b], [0x7a2a2a, 0x2f6f8a], [0x1d1f28, 0xd9b45a]];
  const boat = (cfg, x, z, yaw) => { const m = new T.Mesh(narrowboatGeo({ hull: cfg[0], cabin: cfg[1] }).build(), M.solid); m.castShadow = true; m.position.set(x, C.level + 0.3, z); m.rotation.y = yaw; kit.add(m); return m; };
  const moored = [[C.x0 + 3.4, C.z0 + 46, hulls[0]], [C.x0 + 3.4, C.z0 + 66, hulls[1]], [C.x1 - 3.4, C.z0 + 130, hulls[2]], [C.x0 + 3.4, C.z1 - 60, hulls[3]], [C.x1 - 3.4, C.z1 - 100, hulls[0]]].map(([x, z, h]) => ({ m: boat(h, x, z, rng.pick([0, Math.PI])), z, ph: rng.range(0, 6) }));
  const cruiser = boat(hulls[3], midx, C.z0 + 100, 0);
  kit.animate((dt, t) => {
    for (const b of moored) { b.m.position.y = C.level + 0.3 + Math.sin(t * 0.9 + b.ph) * 0.03; b.m.rotation.z = Math.sin(t * 0.7 + b.ph) * 0.012; }
    const span = ctx.bridgeZ - C.z0 - 60, u = (t * 1.4) % (2 * span), d = u < span ? u : 2 * span - u;
    cruiser.position.set(midx + 0.6, C.level + 0.3 + Math.sin(t * 1.1) * 0.02, C.z0 + 34 + d); cruiser.rotation.y = u < span ? 0 : Math.PI;
  });
}
