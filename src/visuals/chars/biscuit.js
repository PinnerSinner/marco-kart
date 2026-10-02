// Biscuit: golden spaniel in a racing vest, floppy ears, goggles. The custom rival photo appears as a medal badge
// (chest + back) when `custom_rival_face` is supplied; the name comes from `custom_rival_name`.
import * as THREE from 'three';
import { GeoBuilder } from '../geo.js';
import { addLegs, standardArm } from '../rig.js';
import { Assets } from '../../core/assets.js';
import { printTexture, inkText, starPath } from '../canvas.js';

const FUR = 0xD9A83A, FUR_D = 0xA9761E, FUR_L = 0xF1CB6A, EAR = 0x9c5f1b, CREAM = 0xF6E7BE, RED = 0xE63946;

export const cfg = { shoulder: [0.43, 0.48, 0], neckY: 0.7, scale: 0.98, bob: 1.3 };

function paintBadge(ctx, w, h, img) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.47, 0, Math.PI * 2); ctx.clip();
  if (img) {
    const m = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, w, h);
  } else {
    const g = ctx.createRadialGradient(w / 2, h * 0.4, w * 0.05, w / 2, h / 2, w * 0.5);
    g.addColorStop(0, '#fff1c2'); g.addColorStop(1, '#f2b84b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7a4a12';
    const c = w / 2;
    for (const [dx, dy, r] of [[-0.2, -0.12, 0.09], [0, -0.22, 0.09], [0.2, -0.12, 0.09], [-0.32, 0.03, 0.08], [0.32, 0.03, 0.08]]) { ctx.beginPath(); ctx.ellipse(c + dx * w, c + dy * w, r * w * 0.8, r * w, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(c, c + 0.16 * w, 0.22 * w, 0.18 * w, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.lineWidth = w * 0.06; ctx.strokeStyle = '#e9c46a';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.455, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = w * 0.02; ctx.strokeStyle = '#8a6a1c';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.485, 0, Math.PI * 2); ctx.stroke();
}

function badgeTexture() {
  const tex = printTexture('badge:biscuit', 256, 256, (ctx, w, h) => paintBadge(ctx, w, h, null));
  if (tex && !tex.userData.upgrading && Assets.has('custom_rival_face')) {
    tex.userData.upgrading = true;
    Assets.image('custom_rival_face').then((img) => {
      if (img) { paintBadge(tex.image.getContext('2d'), 256, 256, img); tex.needsUpdate = true; }
    });
  }
  return tex;
}

/** @param {import('../rig.js').Rig} rig */
export function build(rig) {
  rig.add(rig.body, 'torso', () => {
    const b = new GeoBuilder();
    addLegs(b, { pants: FUR_D, boots: CREAM });
    b.rbox([0.8, 0.74, 0.58], 0.26, { p: [0, 0.37, 0], c: FUR_D, c2: FUR });
    b.rbox([0.84, 0.5, 0.62], 0.16, { p: [0, 0.32, 0], c: 0xe9e5dc, c2: 0xffffff });
    b.rbox([0.16, 0.5, 0.04], 0.02, { p: [0, 0.32, 0.31], c: RED });
    b.rbox([0.84, 0.06, 0.62], 0.02, { p: [0, 0.1, 0], c: RED });
    b.sphere(0.2, { p: [0, 0.62, 0.22], s: [1.1, 0.9, 0.8], c: CREAM }, 12, 8);
    b.torus(0.21, 0.05, { p: [0, 0.74, 0], r: [Math.PI / 2, 0, 0], c: RED }, 6, 20);
    b.cyl(0.05, 0.05, 0.02, { p: [0, 0.66, 0.29], r: [Math.PI / 2, 0, 0], c: 0xe9c46a }, 10);
    return b.build();
  });
  const badge = badgeTexture();
  if (badge) {
    const mat = new THREE.MeshBasicMaterial({ map: badge, transparent: true, depthWrite: false });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), mat);
    back.position.set(0, 0.34, -0.318); back.rotation.y = Math.PI; back.renderOrder = 3;
    const chest = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), mat);
    chest.position.set(-0.24, 0.5, 0.315); chest.renderOrder = 3;
    rig.body.add(back, chest);
    rig.disposers.push(() => { back.geometry.dispose(); chest.geometry.dispose(); mat.dispose(); });
  }
  const name = (Assets.text('custom_rival_name', '') || 'BISCUIT').toUpperCase();
  rig.print(rig.body, `print:biscuit:${name}`, 0.5, 0.11, 640, 140, (ctx, w, h) => {
    inkText(ctx, name.slice(0, 12), w / 2, h / 2, { font: '900 96px system-ui, Arial, sans-serif', fill: '#E63946', stroke: '#ffffff', lw: 0 });
  }, { p: [0, 0.07, -0.318], r: [0, Math.PI, 0] });

  // tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.04, -0.3);
  rig.body.add(tailPivot);
  rig.add(tailPivot, 'tail', () => {
    const b = new GeoBuilder();
    b.sphere(1, { p: [0, 0.1, -0.1], s: [0.1, 0.1, 0.2], r: [0.5, 0, 0], c: FUR_D, c2: FUR }, 10, 8);
    b.sphere(1, { p: [0, 0.3, -0.2], s: [0.12, 0.12, 0.22], r: [1.0, 0, 0], c: FUR, c2: FUR_L }, 10, 8);
    b.sphere(1, { p: [0, 0.5, -0.22], s: [0.11, 0.11, 0.2], r: [1.5, 0, 0], c: FUR_L, c2: CREAM }, 10, 8);
    return b.build();
  }, { ol: 0.02 });
  // Easter egg: the tail wags harder the faster she goes, flat out on a boost, and helicopters on Zoomies (`s.zoom`, set by KartView)
  rig.anim((dt, s) => {
    const happy = s.pose === 'celebrate' ? 1 : s.expression === 'happy' || s.expression === 'boost' ? 0.7 : 0.35;
    const fast = Math.max(happy, 0.3 + 0.4 * (s.speed ?? 0), (s.boost ?? 0) * 0.9, (s.zoom ?? 0));
    tailPivot.rotation.y = Math.sin(s.t * (9 + 14 * fast)) * (0.35 + 0.4 * fast) - s.steerS * 0.3;
    tailPivot.rotation.x = (s.zoom ?? 0) > 0 ? Math.sin(s.t * 31) * 0.25 : 0;
  });

  // head
  const head = rig.add(rig.head, 'head', () => {
    const b = new GeoBuilder();
    b.sphere(0.46, { p: [0, 0.42, 0], s: [1.04, 0.98, 1.0], c: FUR_D, c2: FUR_L }, 26, 18);
    b.sphere(1, { p: [0, 0.31, 0.4], s: [0.245, 0.195, 0.27], c: CREAM, c2: 0xfff4d6 }, 18, 12);
    b.sphere(0.078, { p: [0, 0.36, 0.665], s: [1.15, 0.85, 0.9], c: 0x15121a }, 10, 8);
    b.sphere(0.02, { p: [-0.02, 0.38, 0.72], c: 0xffffff }, 5, 4);
    b.torus(0.464, 0.04, { p: [0, 0.5, -0.01], r: [Math.PI / 2 - 0.08, 0, 0], c: RED }, 6, 30);
    for (const sx of [-1, 1]) b.torus(0.165, 0.038, { p: [sx * 0.205, 0.53, 0.385], r: [0.06, sx * 0.4, 0], c: RED }, 6, 20);
    return b.build();
  }, { mat: 'skin', ol: 0.03 });
  head.userData.isHead = true;
  rig.face([
    { R: 0.46, phiLen: 1.5, thetaLen: 1.5, thetaC: Math.PI / 2 - 0.02, pos: [0, 0.42, 0], scale: [1.04, 0.98, 1.0], row: 0, lift: 1.012 },
    { R: 1, phiLen: 1.55, thetaLen: 1.3, thetaC: Math.PI / 2 + 0.45, pos: [0, 0.31, 0.4], scale: [0.245, 0.195, 0.27], row: 1, lift: 1.012 },
  ]);
  const tongue = rig.add(rig.head, 'tongue', () => new GeoBuilder().sphere(1, { c: 0xf0607a, c2: 0xff9bb0 }, 10, 8).build(), { p: [0, 0.19, 0.6], s: [0.075, 0.03, 0.1], ol: 0.012 });
  tongue.visible = false;
  let tongueExpr = false;
  rig.onExpression((n) => { tongueExpr = n === 'happy' || n === 'boost'; tongue.visible = tongueExpr; });
  // tongue out whenever she is boosting or on Zoomies (and lolling about at top speed), flapping in the wind
  rig.anim((dt, s) => {
    const hot = (s.boost ?? 0) > 0.3 || (s.zoom ?? 0) > 0;
    const out = tongueExpr || hot || (s.speed ?? 0) > 0.92;
    tongue.visible = out;
    if (out) { tongue.rotation.x = 0.25 + Math.sin(s.t * 24) * 0.18 * (0.4 + (s.speed ?? 0)); tongue.scale.z = hot ? 0.155 : 0.1; }
  });

  // floppy ears (pivot at the top of the head, sway with speed)
  const ears = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.44, 0.66, -0.02);
    rig.head.add(pivot);
    rig.add(pivot, 'ear', () => new GeoBuilder().sphere(1, { p: [0, -0.22, 0], s: [0.075, 0.3, 0.17], c: EAR, c2: 0xb87424 }, 12, 10).build(), { ol: 0.022 });
    ears.push([pivot, sx]);
  }
  rig.anim((dt, s) => {
    for (let i = 0; i < 2; i++) {
      const [p, sx] = ears[i];
      const flap = 1 + (s.boost ?? 0) * 1.4 + (s.zoom ?? 0) * 1.4;                       // ears flap with speed, wildly on a boost
      p.rotation.z = sx * (0.28 + s.speed * 0.5 + Math.sin(s.t * 11 * flap + i * 1.7) * 0.1 * (0.3 + s.speed) * flap);
      p.rotation.x = 0.1 + s.speed * 0.4 + Math.sin(s.t * 9 * flap + i) * 0.06 * s.speed * flap;
    }
  });

  const arm = (side) => () => standardArm(side, { sleeve: FUR, sleeve2: FUR_L, cuff: CREAM, glove: CREAM, r: 0.13, hand: 0.16 });
  rig.add(rig.armL, 'armL', arm(1), { ol: 0.022 });
  rig.add(rig.armR, 'armR', arm(-1), { ol: 0.022 });
}
