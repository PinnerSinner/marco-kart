// Packet Pete: chunky purple courier with a parcel-shaped head-box and a cracked visor.
import * as THREE from 'three';
import { GeoBuilder } from '../geo.js';
import { addLegs, standardArm } from '../rig.js';
import { inkText, rrect } from '../canvas.js';

const PURPLE = 0x8338EC, PURPLE_D = 0x5a1fb0, PURPLE_L = 0xa66df5, YELLOW = 0xFFBE0B, CARD = 0xC8945A, CARD_L = 0xE1B27A, CARD_D = 0xA5733F;

export const cfg = { shoulder: [0.52, 0.52, 0], neckY: 0.74, scale: 1.05, bob: 1.2 };

/** @param {import('../rig.js').Rig} rig */
export function build(rig) {
  rig.add(rig.body, 'torso', () => {
    const b = new GeoBuilder();
    addLegs(b, { pants: PURPLE_D, boots: 0x231a3a, w: 0.8, thick: 1.15 });
    b.rbox([0.98, 0.82, 0.68], 0.2, { p: [0, 0.39, 0], c: PURPLE_D, c2: PURPLE_L });
    b.rbox([1.02, 0.1, 0.72], 0.04, { p: [0, 0.2, 0], c: YELLOW });
    b.tube([-0.36, 0.72, 0.335], [0.34, 0.12, 0.35], 0.055, { c: YELLOW }, 6);
    b.rbox([0.26, 0.2, 0.06], 0.03, { p: [0.28, 0.5, 0.35], c: PURPLE_D });
    b.rbox([0.16, 0.13, 0.04], 0.02, { p: [-0.28, 0.42, 0.35], c: 0xf6f3ea });
    b.torus(0.25, 0.09, { p: [0, 0.8, 0], r: [Math.PI / 2, 0, 0], c: PURPLE_D }, 8, 20);
    b.cyl(0.16, 0.19, 0.14, { p: [0, 0.83, 0], c: 0x3a2a63 });
    return b.build();
  });
  rig.print(rig.body, 'print:pete', 0.6, 0.34, 512, 290, (ctx, w, h) => {
    rrect(ctx, 6, 6, w - 12, h - 12, 26); ctx.fillStyle = '#f6f3ea'; ctx.fill();
    ctx.fillStyle = '#1b1226';
    let x = 34; let seed = 5;
    while (x < w - 40) { seed = (seed * 16807) % 2147483647; const bw = 3 + (seed % 7); ctx.fillRect(x, 26, bw, 100); x += bw + 3 + (seed % 5); }
    inkText(ctx, 'PETE', w / 2, h * 0.76, { font: '900 96px system-ui, Arial, sans-serif', fill: '#8338EC', stroke: '#1b1226', lw: 10 });
  }, { p: [0, 0.42, -0.355], r: [0, Math.PI, 0] });

  // parcel head
  rig.add(rig.head, 'head', () => {
    const b = new GeoBuilder();
    b.rbox([0.92, 0.82, 0.88], 0.08, { p: [0, 0.46, 0], c: CARD_D, c2: CARD_L });
    b.rbox([0.22, 0.03, 0.9], 0.012, { p: [0, 0.875, 0], c: YELLOW });
    b.rbox([0.22, 0.6, 0.03], 0.012, { p: [0, 0.6, 0.445], c: YELLOW });
    b.rbox([0.03, 0.26, 0.34], 0.012, { p: [0.47, 0.5, -0.08], c: 0xf6f3ea });
    b.box(0.036, 0.04, 0.24, { p: [0.47, 0.56, -0.08], c: 0xd0343f });
    b.box(0.036, 0.02, 0.2, { p: [0.47, 0.48, -0.08], c: 0x333333 });
    b.rbox([0.8, 0.54, 0.06], 0.03, { p: [0, 0.42, 0.44], c: 0x2a1f44 });
    b.rbox([0.95, 0.06, 0.9], 0.02, { p: [0, 0.07, 0], c: CARD_D });
    return b.build();
  }, { mat: 'skin', ol: 0.03 });
  rig.face([{ plane: [0.72, 0.62], pos: [0, 0.44, 0.478] }]);
  // flapping tape tab on top
  const tab = new THREE.Group();
  tab.position.set(0.0, 0.88, -0.38);
  rig.head.add(tab);
  rig.add(tab, 'tab', () => new GeoBuilder().rbox([0.5, 0.025, 0.36], 0.01, { p: [0, 0.01, 0.18], c: YELLOW }, 1).build(), { ol: 0.012 });
  rig.anim((dt, s) => { tab.rotation.x = -0.15 - s.speed * 0.5 + Math.sin(s.t * 17) * 0.08 * s.speed; });

  const arm = (side) => () => standardArm(side, { sleeve: PURPLE, sleeve2: PURPLE_L, cuff: YELLOW, glove: YELLOW, stripe: YELLOW, r: 0.15, hand: 0.17 });
  rig.add(rig.armL, 'armL', arm(1), { ol: 0.024 });
  rig.add(rig.armR, 'armR', arm(-1), { ol: 0.024 });
}
