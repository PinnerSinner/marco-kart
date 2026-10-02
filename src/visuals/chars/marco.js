// Marco: red racing suit, Union-flag patch, flat cap, cyan lanyard. Face plane = photo when supplied, else cartoon.
import * as THREE from 'three';
import { GeoBuilder, unionFlagGeometry } from '../geo.js';
import { addLegs, standardArm } from '../rig.js';
import { inkText } from '../canvas.js';

const SUIT = 0xE63946, SUIT_D = 0xB92533, SUIT_L = 0xF35662, NAVY = 0x0B1D3A, WHITE = 0xF7F4EA, SKIN = 0xF3BE9C, CYAN = 0x22D3EE;

export const cfg = { shoulder: [0.45, 0.5, 0], neckY: 0.72 };

/** @param {import('../rig.js').Rig} rig */
export function build(rig) {
  rig.add(rig.body, 'torso', () => {
    const b = new GeoBuilder();
    addLegs(b, { pants: SUIT_D, boots: NAVY });
    b.rbox([0.82, 0.76, 0.56], 0.17, { p: [0, 0.38, 0], c: SUIT_D, c2: SUIT_L });
    b.rbox([0.85, 0.1, 0.59], 0.05, { p: [0, 0.2, 0], c: WHITE });
    b.rbox([0.86, 0.07, 0.6], 0.03, { p: [0, 0.1, 0], c: NAVY });
    b.rbox([0.15, 0.1, 0.03], 0.02, { p: [0, 0.1, 0.3], c: 0xF5C542 });
    b.torus(0.21, 0.07, { p: [0, 0.78, 0], r: [Math.PI / 2, 0, 0], c: WHITE }, 8, 20);
    b.cyl(0.13, 0.16, 0.14, { p: [0, 0.81, 0], c: SKIN });
    // lanyard V + badge
    for (const sx of [-1, 1]) b.box(0.035, 0.42, 0.012, { p: [sx * 0.085, 0.56, 0.286], r: [0, 0, -sx * 0.2], c: CYAN });
    b.rbox([0.2, 0.26, 0.03], 0.02, { p: [0, 0.29, 0.288], c: WHITE });
    b.box(0.2, 0.07, 0.034, { p: [0, 0.37, 0.29], c: CYAN });
    b.box(0.12, 0.018, 0.034, { p: [0, 0.27, 0.29], c: NAVY });
    b.box(0.12, 0.018, 0.034, { p: [0, 0.23, 0.29], c: NAVY });
    // union-flag patch on the left chest
    b.add(unionFlagGeometry(0.2, 0.125), { keep: true, p: [0.235, 0.53, 0.286] });
    // back yoke + white back panel (print goes on top)
    b.rbox([0.56, 0.2, 0.03], 0.02, { p: [0, 0.45, -0.283], c: NAVY });
    return b.build();
  });
  rig.print(rig.body, 'print:marco', 0.5, 0.16, 512, 164, (ctx, w, h) => {
    inkText(ctx, 'MARCO', w / 2, h / 2, { font: '900 italic 118px system-ui, Arial, sans-serif', fill: '#ffffff', stroke: '#0B1D3A', lw: 14 });
  }, { p: [0, 0.45, -0.3], r: [0, Math.PI, 0] });

  const head = rig.add(rig.head, 'head', () => {
    const b = new GeoBuilder();
    b.sphere(0.46, { p: [0, 0.42, 0], c: SKIN }, 26, 20);
    for (const sx of [-1, 1]) b.sphere(0.085, { p: [sx * 0.455, 0.4, -0.02], c: 0xE9A98A });
    // hair: back + sides
    b.add(new THREE.SphereGeometry(0.478, 22, 14, Math.PI / 2 + 1.2, Math.PI * 2 - 2.4, 0, 2.05), { p: [0, 0.42, 0], c: 0x3b2417, c2: 0x5a3a24 });
    // flat cap
    b.sphere(0.5, { p: [0, 0.69, -0.03], s: [1.04, 0.44, 1.08], r: [0.1, 0, 0], c: 0x142447, c2: 0x2a3f75 }, 22, 12);
    b.rbox([0.6, 0.07, 0.36], 0.03, { p: [0, 0.645, 0.42], r: [0.24, 0, 0], c: 0x2a3f75, c2: 0x1b2d5a });
    b.torus(0.46, 0.022, { p: [0, 0.615, -0.03], r: [Math.PI / 2 + 0.1, 0, 0], c: SUIT }, 6, 26);
    b.sphere(0.05, { p: [0, 0.9, -0.03], c: SUIT });
    return b.build();
  }, { mat: 'skin', ol: 0.03 });
  head.userData.isHead = true;
  const face = rig.face([{ R: 0.46, phiLen: 2.1, thetaLen: 2.0, thetaC: Math.PI / 2 + 0.15, pos: [0, 0.42, 0], planar: { cx: 0, cy: 0.38, w: 0.8, h: 0.8 } }]);
  // procedural nose: only for the cartoon face. The photo has its own nose, so the mesh hides once the photo is on.
  const nose = rig.add(rig.head, 'nose', () => new GeoBuilder().sphere(0.07, { c: 0xF0AE94 }).build(), { p: [0, 0.37, 0.455], ol: 0.02, mat: 'skin' });
  face.onPhoto((has) => { nose.visible = !has; });

  const arm = (side) => () => standardArm(side, { sleeve: SUIT, sleeve2: SUIT_L, cuff: WHITE, glove: 0x23232b, stripe: WHITE });
  rig.add(rig.armL, 'armL', arm(1), { ol: 0.022 });
  rig.add(rig.armR, 'armR', arm(-1), { ol: 0.022 });
}
