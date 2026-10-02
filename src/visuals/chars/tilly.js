// Tea-Time Tilly: quilted pink jacket, pearls, silver curls, a teacup crest on her helmet and a tartan flask on her back.
import * as THREE from 'three';
import { GeoBuilder } from '../geo.js';
import { addLegs, standardArm } from '../rig.js';

const PINK = 0xEF476F, PINK_D = 0xc22e55, PINK_L = 0xff7c98, CREAM = 0xf6ebd6, SKIN = 0xF6D2BC, SILVER = 0xc9cfd8, SILVER_L = 0xeef1f5;

export const cfg = { shoulder: [0.47, 0.5, 0], neckY: 0.7, scale: 0.97 };

/** @param {import('../rig.js').Rig} rig */
export function build(rig) {
  rig.add(rig.body, 'torso', () => {
    const b = new GeoBuilder();
    addLegs(b, { pants: 0x3b3a52, boots: 0x7a3b52 });
    for (let i = 0; i < 4; i++) {
      b.rbox([0.9 - (i === 3 ? 0.06 : 0), 0.22, 0.6 - (i === 3 ? 0.04 : 0)], 0.1, { p: [0, 0.12 + i * 0.185, 0], c: i % 2 ? PINK : PINK_D, c2: i % 2 ? PINK_L : PINK });
    }
    b.rbox([0.06, 0.76, 0.03], 0.012, { p: [0, 0.4, 0.31], c: CREAM });
    b.torus(0.235, 0.1, { p: [0, 0.78, 0], r: [Math.PI / 2, 0, 0], c: PINK_D }, 8, 20);
    b.cyl(0.13, 0.16, 0.14, { p: [0, 0.82, 0], c: SKIN });
    // pearls
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const front = Math.max(0, Math.cos(a));
      b.sphere(0.036, { p: [Math.sin(a) * 0.21, 0.83 - front * 0.1, Math.cos(a) * 0.2 + front * 0.03], c: 0xfff8f0 }, 8, 6);
    }
    // flask strap
    b.tube([-0.36, 0.7, 0.02], [0.3, 0.16, -0.34], 0.035, { c: CREAM }, 6);
    return b.build();
  });
  const flask = rig.add(rig.body, 'flask', () => {
    const b = new GeoBuilder();
    const cols = [0xc8323c, 0xf6ebd6, 0x2a6b4a, 0xf6ebd6];
    b.add(new THREE.CylinderGeometry(0.115, 0.115, 0.5, 16), { c: 0xc8323c, tri: (x, y) => (Math.abs(y) > 0.249 ? 0xc0c6d2 : cols[Math.floor((y + 0.25) * 10) % 4]) });
    b.cyl(0.125, 0.125, 0.1, { p: [0, 0.3, 0], c: PINK }, 16);
    b.sphere(0.06, { p: [0, 0.37, 0], s: [1, 0.6, 1], c: 0xf6ebd6 });
    b.cyl(0.05, 0.05, 0.05, { p: [0, -0.27, 0], c: 0x8a8fa0 }, 10);
    return b.build();
  }, { p: [0.3, 0.32, -0.42], r: [-0.12, 0, -0.16], ol: 0.02 });
  rig.anim((dt, s) => { flask.rotation.z = -0.16 + Math.sin(s.t * 3) * 0.02 - s.steerS * 0.06; });

  const head = rig.add(rig.head, 'head', () => {
    const b = new GeoBuilder();
    b.sphere(0.46, { p: [0, 0.42, 0], c: SKIN }, 24, 18);
    for (const sx of [-1, 1]) b.sphere(0.08, { p: [sx * 0.455, 0.4, -0.02], c: 0xe8b9a2 });
    b.sphere(0.06, { p: [0, 0.37, 0.455], c: 0xf2b8a4 });
    b.add(new THREE.SphereGeometry(0.484, 22, 14, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, 2.15), { p: [0, 0.42, 0], c: SILVER, c2: SILVER_L });
    for (let i = 0; i < 11; i++) {
      const a = Math.PI / 2 + 0.95 + (i / 10) * (Math.PI * 2 - 1.9);
      b.sphere(0.115, { p: [-Math.cos(a) * 0.47, 0.3 + (i % 3) * 0.06, Math.sin(a) * 0.47], c: SILVER, c2: SILVER_L }, 10, 8);
    }
    // pink helmet dome + piping
    b.add(new THREE.SphereGeometry(0.515, 26, 12, 0, Math.PI * 2, 0, 1.0), { p: [0, 0.42, 0], c: PINK_D, c2: PINK_L });
    b.torus(0.435, 0.03, { p: [0, 0.42 + 0.515 * Math.cos(1.0), 0], r: [Math.PI / 2, 0, 0], c: CREAM }, 6, 30);
    // teacup on top
    const y0 = 0.42 + 0.515 - 0.02;
    b.cyl(0.26, 0.24, 0.03, { p: [0, y0 + 0.015, -0.02], c: CREAM }, 20);
    b.lathe([[0, 0], [0.09, 0.005], [0.14, 0.05], [0.175, 0.13], [0.185, 0.21], [0.17, 0.21], [0.16, 0.13], [0.12, 0.06], [0, 0.04]], { p: [0, y0 + 0.03, -0.02], c: 0xfdfbf5, c2: 0xffffff }, 20);
    b.cyl(0.155, 0.155, 0.012, { p: [0, y0 + 0.215, -0.02], c: 0x8a4b22 }, 16);
    b.torus(0.18, 0.012, { p: [0, y0 + 0.24, -0.02], r: [Math.PI / 2, 0, 0], c: 0xe9c46a }, 4, 20);
    b.arc(0.065, 0.024, Math.PI, { p: [0.2, y0 + 0.14, -0.02], r: [0, 0, -Math.PI / 2], c: 0xfdfbf5 });
    for (let i = 0; i < 6; i++) { const a = i * 1.05; b.sphere(0.03, { p: [Math.sin(a) * 0.17, y0 + 0.13 + (i % 2) * 0.03, -0.02 + Math.cos(a) * 0.17], c: PINK }, 6, 5); }
    return b.build();
  }, { mat: 'skin', ol: 0.03 });
  head.userData.isHead = true;
  rig.face([{ R: 0.46, phiLen: 1.62, thetaLen: 1.5, thetaC: Math.PI / 2 + 0.03, pos: [0, 0.42, 0] }]);

  const arm = (side) => () => standardArm(side, { sleeve: PINK, sleeve2: PINK_L, cuff: CREAM, glove: 0xffffff, r: 0.14 });
  rig.add(rig.armL, 'armL', arm(1), { ol: 0.022 });
  rig.add(rig.armR, 'armR', arm(-1), { ol: 0.022 });
}
