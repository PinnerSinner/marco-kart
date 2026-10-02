// Caipirinha Carlos: green-and-yellow football shirt, sunglasses, yellow helmet with a lime slice clipped on.
import * as THREE from 'three';
import { GeoBuilder } from '../geo.js';
import { addLegs, standardArm } from '../rig.js';
import { inkText } from '../canvas.js';

const GREEN = 0x06D6A0, GREEN_D = 0x03a67b, YELLOW = 0xFFD166, YELLOW_D = 0xE0A82E, SKIN = 0xD09468, HAIR = 0x1d120c, LIME = 0x7bd42f, LIME_D = 0x3d8a1a;

export const cfg = { shoulder: [0.45, 0.5, 0], neckY: 0.72, scale: 1.0 };

/** @param {import('../rig.js').Rig} rig */
export function build(rig) {
  rig.add(rig.body, 'torso', () => {
    const b = new GeoBuilder();
    addLegs(b, { pants: 0xf6f3ea, boots: 0x2a2a34 });
    b.rbox([0.84, 0.78, 0.58], 0.2, { p: [0, 0.38, 0], c: GREEN_D, c2: GREEN });
    b.rbox([0.87, 0.13, 0.61], 0.05, { p: [0, 0.46, 0], c: YELLOW });
    b.rbox([0.87, 0.06, 0.61], 0.02, { p: [0, 0.12, 0], c: YELLOW });
    b.cyl(0.11, 0.11, 0.03, { p: [-0.24, 0.6, 0.29], r: [Math.PI / 2, 0, 0], c: YELLOW_D });
    b.cyl(0.075, 0.075, 0.04, { p: [-0.24, 0.6, 0.295], r: [Math.PI / 2, 0, 0], c: 0x1d4ed8 });
    b.torus(0.21, 0.07, { p: [0, 0.78, 0], r: [Math.PI / 2, 0, 0], c: YELLOW }, 8, 20);
    b.cyl(0.13, 0.16, 0.14, { p: [0, 0.81, 0], c: SKIN });
    return b.build();
  });
  rig.print(rig.body, 'print:carlos', 0.5, 0.5, 400, 400, (ctx, w, h) => {
    inkText(ctx, 'CARLOS', w / 2, h * 0.16, { font: '900 60px system-ui, Arial, sans-serif', fill: '#FFD166', stroke: '#03604a', lw: 9 });
    inkText(ctx, '10', w / 2, h * 0.6, { font: '900 250px system-ui, Arial, sans-serif', fill: '#FFD166', stroke: '#03604a', lw: 22 });
  }, { p: [0, 0.4, -0.295], r: [0, Math.PI, 0] });

  const head = rig.add(rig.head, 'head', () => {
    const b = new GeoBuilder();
    b.sphere(0.46, { p: [0, 0.42, 0], c: SKIN }, 24, 18);
    for (const sx of [-1, 1]) b.sphere(0.085, { p: [sx * 0.455, 0.4, -0.02], c: 0xc0855a });
    b.sphere(0.07, { p: [0, 0.37, 0.455], c: 0xc98c60 });
    b.add(new THREE.SphereGeometry(0.478, 22, 14, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, 2.1), { p: [0, 0.42, 0], c: HAIR, c2: 0x3a2618 });
    for (let i = 0; i < 6; i++) b.sphere(0.09, { p: [Math.sin(i * 1.05 - 2.6) * 0.36, 0.34 + (i % 2) * 0.07, -0.34 - Math.cos(i * 1.05 - 2.6) * 0.06], c: HAIR });
    // helmet shell
    b.add(new THREE.SphereGeometry(0.515, 26, 12, 0, Math.PI * 2, 0, 1.05), { p: [0, 0.42, 0], c: YELLOW_D, c2: YELLOW });
    b.torus(0.44, 0.03, { p: [0, 0.42 + 0.515 * Math.cos(1.05), 0], r: [Math.PI / 2, 0, 0], c: GREEN }, 6, 30);
    b.arc(0.522, 0.045, Math.PI * 0.62, { p: [0, 0.42, 0], r: [0, Math.PI / 2, 0], c: GREEN });
    // lime slice clipped to the helmet's left side
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.45, Math.PI / 2));
    const lp = [0.52, 0.7, 0.14];
    b.cyl(0.19, 0.19, 0.05, { p: lp, q, c: LIME_D }, 20);
    const ax = new THREE.Vector3(Math.cos(0.45), 0, -Math.sin(0.45));
    ax.set(0, 1, 0).applyQuaternion(q);
    const fp = [lp[0] + ax.x * 0.03, lp[1] + ax.y * 0.03, lp[2] + ax.z * 0.03];
    b.cyl(0.165, 0.165, 0.03, { p: fp, q, c: LIME }, 20);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a));
      const off = new THREE.Vector3(0, 0, 0.075).applyQuaternion(dq);
      b.box(0.014, 0.036, 0.14, { p: [fp[0] + off.x + ax.x * 0.005, fp[1] + off.y + ax.y * 0.005, fp[2] + off.z + ax.z * 0.005], q: dq, c: 0xf3ffd4 });
    }
    b.sphere(0.03, { p: [fp[0] + ax.x * 0.02, fp[1] + ax.y * 0.02, fp[2] + ax.z * 0.02], c: 0xf3ffd4 });
    b.box(0.05, 0.1, 0.06, { p: [0.5, 0.86, 0.05], c: 0xc8ced9 });
    return b.build();
  }, { mat: 'skin', ol: 0.03 });
  head.userData.isHead = true;
  rig.face([{ R: 0.46, phiLen: 1.64, thetaLen: 1.5, thetaC: Math.PI / 2 + 0.02, pos: [0, 0.42, 0] }]);

  const arm = (side) => () => standardArm(side, { sleeve: YELLOW, sleeve2: YELLOW, cuff: GREEN, glove: SKIN, skin: SKIN, sleeveFrac: 0.4 });
  rig.add(rig.armL, 'armL', arm(1), { ol: 0.022 });
  rig.add(rig.armR, 'armR', arm(-1), { ol: 0.022 });
}
