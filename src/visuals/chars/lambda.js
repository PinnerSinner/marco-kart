// Lambda Lucy: orange hoodie with a glowing lambda, space-buns, goggles pushed up on her forehead.
import * as THREE from 'three';
import { GeoBuilder } from '../geo.js';
import { addLegs, standardArm } from '../rig.js';

const ORANGE = 0xF4A261, ORANGE_D = 0xCB6E2B, ORANGE_L = 0xFFC48A, TEAL = 0x264653, TEAL_L = 0x3f7f8f, SKIN = 0x9A6240, HAIR = 0x2a1810;

export const cfg = { shoulder: [0.44, 0.5, 0], neckY: 0.72, scale: 0.98 };

function lambdaGeo(scale, k) {
  const b = new GeoBuilder();
  const col = 0xffe2bd;
  b.tube([-0.15 * scale, 0.2 * scale, 0], [0.16 * scale, -0.22 * scale, 0], 0.036 * scale, { c: col, k }, 6);
  b.tube([-0.0 * scale, 0.0 * scale, 0], [-0.17 * scale, -0.22 * scale, 0], 0.036 * scale, { c: col, k }, 6);
  b.tube([-0.16 * scale, 0.2 * scale, 0], [-0.3 * scale, 0.2 * scale, 0], 0.036 * scale, { c: col, k }, 6);
  return b.build();
}

/** @param {import('../rig.js').Rig} rig */
export function build(rig) {
  rig.add(rig.body, 'torso', () => {
    const b = new GeoBuilder();
    addLegs(b, { pants: TEAL, boots: 0xf6f3ea });
    b.rbox([0.86, 0.78, 0.6], 0.2, { p: [0, 0.38, 0], c: ORANGE_D, c2: ORANGE_L });
    b.rbox([0.5, 0.2, 0.06], 0.05, { p: [0, 0.18, 0.3], c: ORANGE_D });
    b.torus(0.23, 0.09, { p: [0, 0.78, 0], r: [Math.PI / 2, 0, 0], c: ORANGE_D }, 8, 20);
    b.cyl(0.14, 0.17, 0.14, { p: [0, 0.82, 0], c: SKIN });
    b.sphere(1, { p: [0, 0.76, -0.24], s: [0.3, 0.16, 0.14], c: ORANGE_D, c2: ORANGE }, 12, 8);
    for (const sx of [-1, 1]) {
      b.tube([sx * 0.09, 0.72, 0.3], [sx * 0.1, 0.42, 0.315], 0.016, { c: 0xffffff });
      b.sphere(0.025, { p: [sx * 0.1, 0.4, 0.315], c: TEAL });
    }
    b.rbox([0.9, 0.08, 0.63], 0.03, { p: [0, 0.06, 0], c: TEAL_L });
    return b.build();
  });
  rig.glow(rig.body, 'lambda-back', () => lambdaGeo(1.05, 1.35), { p: [0.06, 0.42, -0.31], r: [0, Math.PI, 0] });
  rig.glow(rig.body, 'lambda-chest', () => lambdaGeo(0.34, 1.35), { p: [-0.25, 0.5, 0.305] });

  const head = rig.add(rig.head, 'head', () => {
    const b = new GeoBuilder();
    b.sphere(0.46, { p: [0, 0.42, 0], c: SKIN }, 24, 18);
    for (const sx of [-1, 1]) b.sphere(0.085, { p: [sx * 0.455, 0.4, -0.02], c: 0x8a5232 });
    b.sphere(0.065, { p: [0, 0.37, 0.455], c: 0x93593a });
    b.add(new THREE.SphereGeometry(0.478, 22, 14, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, 2.15), { p: [0, 0.42, 0], c: HAIR, c2: 0x4a2c1c });
    // fringe
    b.sphere(0.26, { p: [0, 0.83, 0.08], s: [1.35, 0.5, 0.9], c: HAIR, c2: 0x4a2c1c });
    // space buns
    for (const sx of [-1, 1]) {
      b.sphere(0.2, { p: [sx * 0.34, 0.93, -0.12], c: HAIR, c2: 0x4a2c1c }, 14, 10);
      b.torus(0.14, 0.03, { p: [sx * 0.34, 0.8, -0.12], r: [Math.PI / 2, 0, 0], c: 0xF4A261 }, 5, 12);
    }
    // goggles pushed up on the forehead: strap band + two round lenses facing forward
    b.torus(0.472, 0.03, { p: [0, 0.66, -0.02], r: [Math.PI / 2 + 0.22, 0, 0], c: TEAL }, 6, 30);
    const z = new THREE.Vector3(0, 0, 1);
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const sx of [-1, 1]) {
      const n = new THREE.Vector3(sx * 0.3, 0.55, 0.78).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(z, n);
      const qc = new THREE.Quaternion().setFromUnitVectors(yAxis, n);
      const c0 = [n.x * 0.475, 0.42 + n.y * 0.475, n.z * 0.475];
      b.torus(0.12, 0.042, { p: c0, q, c: ORANGE_D }, 6, 18);
      b.cyl(0.118, 0.118, 0.05, { p: [c0[0] + n.x * 0.012, c0[1] + n.y * 0.012, c0[2] + n.z * 0.012], q: qc, c: 0x14526e, c2: 0x3fb8dc }, 16);
      b.sphere(0.03, { p: [c0[0] + n.x * 0.045 - sx * 0.03, c0[1] + n.y * 0.045 + 0.04, c0[2] + n.z * 0.045], c: 0xffffff }, 6, 5);
    }
    return b.build();
  }, { mat: 'skin', ol: 0.03 });
  head.userData.isHead = true;
  rig.face([{ R: 0.46, phiLen: 1.62, thetaLen: 1.5, thetaC: Math.PI / 2 + 0.02, pos: [0, 0.42, 0] }]);

  const arm = (side) => () => standardArm(side, { sleeve: ORANGE, sleeve2: ORANGE_L, cuff: TEAL, glove: SKIN, stripe: undefined });
  rig.add(rig.armL, 'armL', arm(1), { ol: 0.022 });
  rig.add(rig.armR, 'armR', arm(-1), { ol: 0.022 });
}
