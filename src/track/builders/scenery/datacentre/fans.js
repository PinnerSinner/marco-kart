// Cooling fans: instanced, spinning in the vertex shader (M.fanBlade). Fan geometry has radius 1 and faces +Z; scale = radius.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { hdr } from './util.js';
import { LED } from './textures.js';

const BLADES = 7;

function bladeGeo() {
  const g = new Geo(), m = new THREE.Matrix4(), t = new THREE.Matrix4(), q = new THREE.Matrix4();
  for (let i = 0; i < BLADES; i++) {
    const a = (i / BLADES) * Math.PI * 2;
    m.makeRotationZ(a); q.makeRotationY(0.5); t.makeTranslation(0, 0.24, 0);      // twist about the radial axis, then out from the hub
    m.multiply(q.multiply(t));
    const tone = 0.85 + 0.3 * ((i % 2) * 0.5);
    g.box(0.34, 0.72, 0.035, { matrix: m.clone(), colour: new THREE.Color(0.5 * tone, 0.62 * tone, 0.95 * tone), ao: 0.1 });
  }
  g.cyl(0.24, 0.24, 0.2, 14, { rx: Math.PI / 2, z: -0.1, colour: 0x24356e, ao: 0 });      // hub barrel (axis along z)
  g.cyl(0.14, 0.14, 0.04, 14, { rx: Math.PI / 2, z: 0.1, colour: hdr(LED.cyan, 0.9), ao: 0 });
  return g;
}

function housingGeo() {
  const g = new Geo(), dark = 0x0c1230, mid = 0x2b3a7a;
  g.box(2.6, 2.6, 0.08, { x: 0, y: -1.3, z: -0.42, colour: dark, ao: 0 });                                    // square mounting plate
  g.geometry(new THREE.RingGeometry(0.98, 1.3, 20), { z: -0.3, colour: mid, ao: 0 });                         // bezel
  g.geometry(new THREE.CircleGeometry(1.0, 20), { z: -0.28, colour: 0x04071a, ao: 0 });                       // dark opening behind the blades
  for (let k = 0; k < 4; k++) {                                                                               // grill spokes
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    g.beam([0, 0, 0.16], [Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0.16], 0.03, 3, { colour: mid, ao: 0 });
  }
  return g;
}

function ringGeo() {
  const rg = new THREE.RingGeometry(1.08, 1.2, 28, 1);
  const col = new Float32Array(rg.attributes.position.count * 3).fill(1);
  rg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  rg.translate(0, 0, 0.02);
  return rg;
}

/** A shared fan set: call add(x, y, z, radius, faceYaw, colourHex) for each fan; sets build themselves through the kit. */
export function makeFanSet(kit, M) {
  const opts = { cell: 240, castShadow: false, receiveShadow: false };
  const blades = kit.instances(bladeGeo(), M.fanBlade, { name: 'dc-fanblades', ...opts });
  const housing = kit.instances(housingGeo(), M.steel, { name: 'dc-fanhousing', ...opts });
  const rings = kit.instances(ringGeo(), M.neonBase, { name: 'dc-fanrings', ...opts });
  const halos = kit.instances(new THREE.PlaneGeometry(1, 1), M.haloSteady, { name: 'dc-fanhalo', ...opts });
  return {
    add(x, y, z, r, ry, colour = LED.cyan) {
      blades.add(x, y, z, { s: r, ry }); housing.add(x, y, z, { s: r, ry });
      rings.add(x, y, z, { s: r, ry, colour: hdr(colour, 1.6) });
      // halo sits a little in front of the fan so it glows over the blades
      const fx = Math.sin(ry), fz = Math.cos(ry);
      halos.add(x + fx * 0.6, y, z + fz * 0.6, { s: r * 3.0, colour: hdr(colour, 0.07) });
    },
  };
}

/** Fan walls on the four outer hall walls plus the near cooling wall beside the climb. */
export function fanWalls(kit, { R, M }, B) {
  const fans = makeFanSet(kit, M), statics = kit.statics;
  const { x0, x1, z0, z1, ceil } = B;
  const cols = [LED.cyan, LED.cyan, LED.blue, LED.magenta, LED.cyan, LED.amber];
  const panel = (g, x, z, w, h, d, ry = 0) => g.box(w, h, d, { x, y: 0, z, ry, colour: 0x0f1636, ao: 0.2, top: 0x141c44 });
  // outer walls: two rows of big fans
  const row = (fx, fz, ry, from, to, pitch, ys, r) => {
    let k = 0;
    for (let t = from; t < to; t += pitch) for (const y of ys) { fans.add(fx(t), y, fz(t), r, ry, cols[(k++ + Math.floor(t / pitch)) % cols.length]); }
  };
  row((t) => t, () => z0 + 0.4 * 8.2, 0, x0 + 30, x1 - 20, 26, [9, 25], 8.2);                               // south wall, faces +z
  row((t) => t, () => z1 - 0.4 * 8.2, Math.PI, x0 + 30, x1 - 20, 26, [9, 25], 8.2);                           // north wall, faces -z
  row(() => x0 + 0.4 * 8.2, (t) => t, Math.PI / 2, z0 + 30, z1 - 20, 26, [9, 25], 8.2);                       // west wall, faces +x
  row(() => x1 - 0.4 * 8.2, (t) => t, -Math.PI / 2, z0 + 30, z1 - 20, 26, [9, 25], 8.2);                      // east wall, faces -x

  // the cooling wall that shadows the climb (left of the road heading east), full-height dark plates with four warning bands
  const wx0 = R.S('boost1', -10), wx1 = R.S('sp0', -6), zc = -27;
  const len = wx1 - wx0, g = statics.at(M.steel, (wx0 + wx1) / 2, zc);
  for (let x = wx0; x < wx1; x += 100) { const l = Math.min(100, wx1 - x); statics.at(M.steel, x + l / 2, zc).box(l, 23, 3, { x: x + l / 2, y: 0, z: zc, colour: 0x101838, ao: 0.15, top: 0x18225a }); }
  void g; void len; void panel;
  const neon = (x, y, w, h, c, k = 1.2) => statics.at(M.neon, x, zc).box(w, h, 0.2, { x, y, z: zc + 1.55, colour: hdr(c, k), ao: 0 });
  for (let x = wx0; x < wx1; x += 100) { const l = Math.min(100, wx1 - x); neon(x + l / 2, 0.5, l, 0.3, LED.magenta, 1.0); neon(x + l / 2, 11.2, l, 0.18, LED.blue, 0.8); neon(x + l / 2, 22.6, l, 0.3, LED.cyan, 1.3); }
  const pitch = 12.6;
  let k = 0;
  for (let x = wx0 + 7; x < wx1 - 5; x += pitch) for (const y of [6, 16.8]) fans.add(x, y, zc + 1.5 + 0.42 * 5, 5.0, 0, cols[(k++) % cols.length]);
  return fans;
}
