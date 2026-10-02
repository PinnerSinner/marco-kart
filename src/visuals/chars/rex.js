// Root Rex: big blocky robot in a dark hoodie, green terminal visor, chunky boots.
import * as THREE from 'three';
import { GeoBuilder } from '../geo.js';
import { addLegs, standardArm } from '../rig.js';

const BLUE = 0x3A86FF, BLUE_D = 0x2350b8, BLUE_L = 0x7db3ff, HOOD = 0x161b2b, HOOD_L = 0x2c3554, GREEN = 0x00FF88;

export const cfg = { shoulder: [0.6, 0.56, 0], neckY: 0.78, scale: 1.12, bob: 0.5 };

function promptGeo(scale, k) {
  const b = new GeoBuilder();
  b.tube([-0.16 * scale, 0.13 * scale, 0], [0.02 * scale, 0, 0], 0.03 * scale, { c: GREEN, k }, 6);
  b.tube([0.02 * scale, 0, 0], [-0.16 * scale, -0.13 * scale, 0], 0.03 * scale, { c: GREEN, k }, 6);
  b.box(0.16 * scale, 0.04 * scale, 0.04 * scale, { p: [0.16 * scale, -0.14 * scale, 0], c: GREEN, k });
  return b.build();
}

/** @param {import('../rig.js').Rig} rig */
export function build(rig) {
  rig.add(rig.body, 'torso', () => {
    const b = new GeoBuilder();
    addLegs(b, { pants: HOOD, boots: 0x0e1220, w: 0.86, thick: 1.3 });
    b.rbox([1.08, 0.86, 0.74], 0.2, { p: [0, 0.42, 0], c: HOOD, c2: HOOD_L });
    b.rbox([0.42, 0.6, 0.05], 0.03, { p: [0, 0.44, 0.375], c: BLUE_D, c2: BLUE });
    for (let i = 0; i < 4; i++) b.box(0.3, 0.02, 0.06, { p: [0, 0.3 + i * 0.07, 0.385], c: 0x0d1a3a });
    b.rbox([0.6, 0.24, 0.06], 0.05, { p: [0, 0.14, 0.38], c: HOOD });
    b.torus(0.28, 0.11, { p: [0, 0.84, 0], r: [Math.PI / 2, 0, 0], c: HOOD_L }, 8, 20);
    b.cyl(0.16, 0.2, 0.16, { p: [0, 0.88, 0], c: BLUE_D });
    b.sphere(1, { p: [0, 0.84, -0.3], s: [0.42, 0.26, 0.22], c: HOOD, c2: HOOD_L }, 12, 8);
    for (const sx of [-1, 1]) b.tube([sx * 0.11, 0.78, 0.375], [sx * 0.12, 0.5, 0.385], 0.02, { c: 0xffffff });
    return b.build();
  });
  rig.glow(rig.body, 'chest-leds', () => {
    const b = new GeoBuilder();
    for (let i = 0; i < 5; i++) b.box(0.034, 0.034, 0.02, { p: [-0.125 + i * 0.0625, 0.5625, 0.402], c: i % 2 ? GREEN : 0x22d3ee, k: 2.2 });
    for (const sx of [-1, 1]) b.sphere(0.03, { p: [sx * 0.12, 0.455, 0.4], c: GREEN, k: 1.3 }, 6, 5);
    return b.build();
  });
  rig.glow(rig.body, 'prompt', () => promptGeo(1.1, 1.35), { p: [-0.05, 0.42, -0.385], r: [0, Math.PI, 0] });

  const head = rig.add(rig.head, 'head', () => {
    const b = new GeoBuilder();
    b.rbox([0.92, 0.86, 0.88], 0.11, { p: [0, 0.47, 0], c: BLUE_D, c2: BLUE_L });
    b.rbox([0.84, 0.05, 0.6], 0.02, { p: [0, 0.9, -0.04], c: BLUE_D });
    b.rbox([0.86, 0.68, 0.06], 0.03, { p: [0, 0.44, 0.44], c: 0x0d1a3a });
    for (const sx of [-1, 1]) {
      b.cyl(0.13, 0.13, 0.08, { p: [sx * 0.48, 0.46, 0], r: [0, 0, Math.PI / 2], c: 0x1a3a7a }, 12);
      b.cyl(0.075, 0.075, 0.1, { p: [sx * 0.5, 0.46, 0], r: [0, 0, Math.PI / 2], c: 0x0f2450 }, 10);
    }
    b.tube([0.3, 0.9, -0.05], [0.34, 1.16, -0.05], 0.022, { c: 0x9aa3b6 }, 6);
    b.sphere(0.06, { p: [0.34, 1.18, -0.05], c: GREEN });
    // hood around the back of the head
    b.add(new THREE.SphereGeometry(0.8, 26, 16, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, 2.2), { p: [0, 0.4, -0.06], s: [0.95, 0.88, 0.86], c: HOOD, c2: HOOD_L });
    return b.build();
  }, { mat: 'cloth', ol: 0.034 });
  head.userData.isHead = true;
  rig.face([{ plane: [0.78, 0.62], pos: [0, 0.46, 0.478] }]);
  rig.glow(rig.head, 'antenna', () => new GeoBuilder().sphere(0.03, { c: GREEN, k: 1.35 }, 6, 5).build(), { p: [0.34, 1.18, -0.05] });

  const arm = (side) => () => standardArm(side, { sleeve: HOOD, sleeve2: HOOD_L, cuff: GREEN, glove: BLUE, r: 0.17, hand: 0.2, len: 0.76 });
  rig.add(rig.armL, 'armL', arm(1), { ol: 0.025 });
  rig.add(rig.armR, 'armR', arm(-1), { ol: 0.025 });
}
