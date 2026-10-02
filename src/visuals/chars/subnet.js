// Sir Subnet: teal armour, plumed helmet, kite shield (192.168.0.0/24) on his back.
import * as THREE from 'three';
import { GeoBuilder, extrudePoly } from '../geo.js';
import { addLegs, standardArm } from '../rig.js';
import { inkText } from '../canvas.js';

const TEAL = 0x2A9D8F, TEAL_D = 0x1B7268, TEAL_L = 0x54CDBD, GOLD = 0xE9C46A, GOLD_D = 0xB8923A, CREAM = 0xF7F1DE, RED = 0xD1343F, SKIN = 0xEDB998;

export const cfg = { shoulder: [0.5, 0.5, 0], neckY: 0.72, scale: 1.0 };

/** @param {import('../rig.js').Rig} rig */
export function build(rig) {
  rig.add(rig.body, 'torso', () => {
    const b = new GeoBuilder();
    addLegs(b, { pants: TEAL_D, boots: GOLD_D });
    b.rbox([0.9, 0.78, 0.6], 0.2, { p: [0, 0.38, 0], c: TEAL_D, c2: TEAL_L });
    b.rbox([0.32, 0.56, 0.05], 0.02, { p: [0, 0.34, 0.3], c: CREAM });
    b.rbox([0.32, 0.07, 0.06], 0.02, { p: [0, 0.07, 0.3], c: RED });
    b.box(0.1, 0.1, 0.06, { p: [0, 0.4, 0.32], c: TEAL });
    b.rbox([0.94, 0.09, 0.64], 0.03, { p: [0, 0.14, 0], c: GOLD });
    b.rbox([0.15, 0.13, 0.05], 0.02, { p: [0, 0.14, 0.33], c: GOLD_D });
    b.torus(0.23, 0.085, { p: [0, 0.78, 0], r: [Math.PI / 2, 0, 0], c: GOLD }, 8, 20);
    b.cyl(0.14, 0.17, 0.14, { p: [0, 0.83, 0], c: TEAL_D });
    for (const sx of [-1, 1]) {
      b.sphere(0.25, { p: [sx * 0.55, 0.65, 0], s: [1, 0.7, 1], c: TEAL, c2: TEAL_L }, 14, 10);
      b.torus(0.235, 0.035, { p: [sx * 0.55, 0.6, 0], r: [Math.PI / 2, 0, 0], c: GOLD }, 5, 16);
    }
    b.cyl(0.52, 0.66, 0.2, { p: [0, 0.03, 0], c: TEAL_D, flat: true }, 8);
    return b.build();
  });

  // kite shield on the back
  rig.add(rig.body, 'shield', () => {
    const kite = [[-0.31, 0.44], [0.31, 0.44], [0.31, 0.12], [0, -0.44], [-0.31, 0.12]];
    const b = new GeoBuilder();
    b.add(extrudePoly(kite, 0.06, { c: GOLD_D, c2: GOLD }, 0.012), { keep: true });
    b.add(extrudePoly(kite.map(([x, y]) => [x * 0.84, y * 0.84 - 0.02]), 0.07, { c: TEAL_D, c2: TEAL }, 0.01), { keep: true, p: [0, 0, 0.012] });
    return b.build();
  }, { p: [0, 0.34, -0.38], r: [0, Math.PI, 0], ol: 0.02 });
  rig.print(rig.body, 'print:shield', 0.5, 0.64, 400, 512, (ctx, w, h) => {
    inkText(ctx, '192.168.', w / 2, h * 0.34, { font: '900 66px system-ui, Arial, sans-serif', fill: '#E9C46A', stroke: '#0f3b36', lw: 12 });
    inkText(ctx, '0.0/24', w / 2, h * 0.52, { font: '900 78px system-ui, Arial, sans-serif', fill: '#F7F1DE', stroke: '#0f3b36', lw: 13 });
  }, { p: [0, 0.29, -0.435], r: [0, Math.PI, 0] });

  const head = rig.add(rig.head, 'head', () => {
    const b = new GeoBuilder();
    b.sphere(0.46, { p: [0, 0.42, 0], c: SKIN }, 24, 18);
    b.add(new THREE.SphereGeometry(0.505, 26, 16, Math.PI / 2 + 0.78, Math.PI * 2 - 1.56, 0, 2.35), { p: [0, 0.42, 0], c: TEAL_D, c2: TEAL_L });
    b.add(new THREE.SphereGeometry(0.508, 26, 12, 0, Math.PI * 2, 0, 0.98), { p: [0, 0.42, 0], c: TEAL_D, c2: TEAL_L });
    b.torus(0.42, 0.032, { p: [0, 0.42 + 0.508 * Math.cos(0.98), 0], r: [Math.PI / 2, 0, 0], c: GOLD }, 6, 30);
    b.arc(0.512, 0.036, Math.PI * 0.62, { p: [0, 0.42, 0], r: [0, Math.PI / 2, 0], c: GOLD });
    for (const sx of [-1, 1]) {
      b.sphere(0.2, { p: [sx * 0.42, 0.3, 0.06], s: [0.5, 1.1, 0.9], c: TEAL_D, c2: TEAL });
      b.sphere(0.05, { p: [sx * 0.49, 0.32, 0.06], c: GOLD });
    }
    return b.build();
  }, { mat: 'skin', ol: 0.03 });
  head.userData.isHead = true;
  rig.face([{ R: 0.46, phiLen: 1.6, thetaLen: 1.5, thetaC: Math.PI / 2 - 0.02, pos: [0, 0.42, 0] }]);

  // plume (sways)
  const plumePivot = new THREE.Group();
  plumePivot.position.set(0, 0.98, -0.06);
  rig.head.add(plumePivot);
  rig.add(plumePivot, 'plume', () => {
    const b = new GeoBuilder();
    const cols = [GOLD, CREAM, RED, CREAM, GOLD];
    for (let i = -2; i <= 2; i++) {
      b.sphere(1, { p: [i * 0.075, 0.18 - Math.abs(i) * 0.03, -0.06 - Math.abs(i) * 0.02], s: [0.075, 0.34, 0.11], r: [-0.45, 0, i * 0.22], c: cols[i + 2], c2: cols[i + 2] }, 10, 8);
    }
    b.sphere(0.07, { p: [0, 0.0, 0], c: GOLD_D });
    return b.build();
  }, { ol: 0.02 });
  rig.anim((dt, s) => {
    plumePivot.rotation.x = -0.1 - s.speed * 0.35 + Math.sin(s.t * 3.1) * 0.05;
    plumePivot.rotation.z = -s.steerS * 0.25 + Math.sin(s.t * 2.3) * 0.04;
  });

  const arm = (side) => () => standardArm(side, { sleeve: TEAL_D, sleeve2: TEAL, cuff: GOLD, glove: GOLD_D, r: 0.135 });
  rig.add(rig.armL, 'armL', arm(1), { ol: 0.022 });
  rig.add(rig.armR, 'armR', arm(-1), { ol: 0.022 });
}
