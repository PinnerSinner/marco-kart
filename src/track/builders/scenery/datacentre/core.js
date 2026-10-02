// The Core: a giant server silo in the middle of the 540 degree spiral. Blinking rack skin, five holo-screens (Marco's face and dashboards),
// glowing rings, light columns and floor rings.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { hdr } from './util.js';
import { LED } from './textures.js';

/** Centre and free radius of the spiral (derived from the route marks). */
export function spiralCentre(R) {
  const a = R.at(R.S('sp0'), 0), b = R.at(R.S('sp1'), 0);
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, radius: Math.hypot(a.x - b.x, a.z - b.z) / 2 };
}

/** Open cylinder with metric UVs (tile metres) and white vertex colours. */
function cylinder(r, y0, y1, seg, tileU, tileV, thetaStart = 0, thetaLen = Math.PI * 2) {
  const g = new THREE.BufferGeometry(), pos = [], nor = [], uv = [], col = [], idx = [];
  const arcLen = r * thetaLen;
  for (let k = 0; k <= seg; k++) {
    const a = thetaStart + (k / seg) * thetaLen, sx = Math.sin(a), cz = Math.cos(a);
    for (const y of [y0, y1]) { pos.push(sx * r, y, cz * r); nor.push(sx, 0, cz); uv.push((-(k / seg) * arcLen) / tileU, y / tileV); col.push(1, 1, 1); }
    if (k) { const b = (k - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function core(kit, { R, M }, B) {
  const { x: cx, z: cz, radius } = spiralCentre(R), ceil = B.ceil;
  const rs = radius - 18.5;                                   // silo radius: comfortably inside the inner rail
  const at = (mesh, name) => { mesh.name = name; mesh.position.set(cx, 0, cz); mesh.castShadow = false; kit.add(mesh); return mesh; };

  // skin: rack texture all the way up, so the silo blinks like every other rack in the hall
  at(new THREE.Mesh(cylinder(rs, 0, ceil, 72, 4.8, 7.35), M.rack), 'dc-core-skin');

  // holo screens: 5 around, 2:1, alternating Marco / dashboard
  const scrH = 14.4, scrTheta = 2 * (Math.PI / 5) * 0.78, y0 = 10.2;
  for (let k = 0; k < 5; k++) {
    const th0 = (k / 5) * Math.PI * 2 + 0.3, arcW = (rs + 0.35) * scrTheta;
    const geo = cylinder(rs + 0.35, y0, y0 + arcW / 2, 14, arcW, arcW / 2, th0, scrTheta);
    // uv: full screen once over the arc
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const kk = Math.floor(i / 2); uv.setXY(i, 1 - kk / 14, i % 2); }
    at(new THREE.Mesh(geo, k % 2 === 0 ? M.screen : M.screenDash), `dc-core-screen-${k}`);
    void scrH;
  }

  // structure (statics): plinth, rings, light columns
  const g = kit.statics.at(M.steel, cx, cz), ng = kit.statics.at(M.neon, cx, cz);
  g.cyl(rs + 3.2, rs + 4.2, 2.4, 40, { x: cx, y: 0, z: cz, colour: 0x111a44, ao: 0.1, top: 0x1a2660 });
  g.cyl(rs + 1.8, rs + 1.8, 0.9, 40, { x: cx, y: 2.4, z: cz, colour: 0x16205a, ao: 0 });
  for (const [y, c, k, w] of [[2.35, LED.cyan, 1.4, 0.34], [8.4, LED.magenta, 1.1, 0.3], [25.2, LED.cyan, 1.2, 0.3], [ceil - 4, LED.magenta, 1.2, 0.36], [ceil - 8, LED.blue, 0.9, 0.24]]) {
    ng.cyl(rs + 0.6, rs + 0.6, w, 60, { x: cx, y, z: cz, colour: hdr(c, k), ao: 0 });
  }
  for (let k = 0; k < 5; k++) {                                                    // light columns in the gaps between screens
    const a = ((k + 0.5) / 5) * Math.PI * 2 + 0.3 + 0.0, gap = (k / 5) * Math.PI * 2 + 0.3 + scrTheta + (Math.PI * 2 / 5 - scrTheta) / 2;
    const px = cx + Math.sin(gap) * (rs + 0.3), pz = cz + Math.cos(gap) * (rs + 0.3);
    ng.box(0.7, ceil - 3.5, 0.7, { x: px, y: 2.6, z: pz, ry: gap, colour: hdr(k % 2 ? LED.magenta : LED.cyan, 1.2), ao: 0 });
    void a;
  }
  // concentric floor rings and radial spokes around the plinth
  const fl = new THREE.Group(); fl.name = 'dc-core-floor';
  const ringMat = M.neonBase;
  const addRing = (r0, r1, colour, k) => {
    const rg = new THREE.RingGeometry(r0, r1, 72, 1); rg.rotateX(-Math.PI / 2);
    const cols = new Float32Array(rg.attributes.position.count * 3); const c = hdr(colour, k);
    for (let i = 0; i < cols.length; i += 3) { cols[i] = c.r; cols[i + 1] = c.g; cols[i + 2] = c.b; }
    rg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = new THREE.Mesh(rg, ringMat); m.position.set(cx, 0.06, cz); fl.add(m);
  };
  addRing(rs + 4.6, rs + 4.85, LED.cyan, 1.1); addRing(rs + 6.0, rs + 6.12, LED.magenta, 0.9); addRing(rs + 7.6, rs + 7.7, LED.blue, 0.8);
  kit.add(fl);

  // glow: soft columns and a halo pool, plus the energy beam through the middle
  const halos = kit.instances(new THREE.PlaneGeometry(1, 1), M.haloSteady, { name: 'dc-core-halos', cell: 400, castShadow: false, receiveShadow: false });
  halos.add(cx, 4, cz, { sx: rs * 3.4, sy: 22, sz: 1, colour: hdr(LED.cyan, 0.18) });
  halos.add(cx, ceil - 3, cz, { sx: rs * 3.2, sy: 16, sz: 1, colour: hdr(LED.magenta, 0.14) });
  return { cx, cz, rs };
}
