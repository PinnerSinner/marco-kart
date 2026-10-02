// The cloud atrium: a glass tunnel over the raised straight, a skylit volume full of billboard clouds and light shafts.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { hdr } from './util.js';
import { LED } from './textures.js';

/** Region (x0, x1, z0, z1) kept clear of racks / towers so the atrium reads as open air. */
export function atriumBox(R) {
  const a = R.at(R.S('top'), 0), b = R.at(R.S('atriumEnd'), 0);
  return { x0: a.x - 25, x1: b.x + 25, z0: -26, z1: 76 };
}

function arc(r, cy, n, a0 = 0, a1 = Math.PI) { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; p.push([r * Math.cos(a), cy + r * 0.96 * Math.sin(a)]); } return p; }

export function atrium(kit, { R, M }, B) {
  const rng = kit.rng, box = atriumBox(R);
  const from = '@top-14', to = '@atriumEnd+14';
  // glass shell (above the 1.6 m rails) and its glowing arch ribs
  kit.sweep({ from, to, profile: arc(11.3, 0.7, 28, 0.06, Math.PI - 0.06), material: M.glass, step: 4, name: 'dc-glass' });
  const ribs = kit.sweep({ from, to, profile: arc(11.4, 0.7, 28, 0.06, Math.PI - 0.06), material: M.neonBase, colour: hdr(LED.cyan, 1.0), every: 9, length: 0.7, step: 0.7, name: 'dc-ribs' });
  if (ribs) ribs.frustumCulled = true;
  kit.sweep({ from, to, profile: [[-0.5, 12.55], [0.5, 12.55]], material: M.neonBase, colour: hdr(0xdff6ff, 1.5), step: 6, name: 'dc-crown' });                         // roof light strip
  kit.sweep({ from, to, profile: [[-6.6, 11.55], [-6.2, 11.5]], material: M.neonBase, colour: hdr(LED.magenta, 0.9), step: 6, name: 'dc-crown-m' });
  kit.sweep({ from, to, profile: [[6.2, 11.5], [6.6, 11.55]], material: M.neonBase, colour: hdr(LED.magenta, 0.9), step: 6, name: 'dc-crown-m2' });

  // skylight: a big glowing panel in the ceiling above the atrium (gradient towards the middle)
  const g = new Geo(), nx = 10, nz = 6, cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2, hx = (box.x1 - box.x0) / 2, hz = (box.z1 - box.z0) / 2;
  const ids = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const u = (i / nx) * 2 - 1, v = (j / nz) * 2 - 1, f = Math.max(0, 1 - Math.pow(Math.hypot(u, v * 1.1), 1.6));
    ids.push(g.vert(cx + u * hx, B.ceil - 0.25, cz + v * hz, 0, -1, 0, 0, 0, 0.1 + 0.5 * f * f, 0.16 + 0.6 * f, 0.4 + 1.0 * f));
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) g.quad(ids[j * (nx + 1) + i], ids[j * (nx + 1) + i + 1], ids[(j + 1) * (nx + 1) + i + 1], ids[(j + 1) * (nx + 1) + i]);
  const sky = new THREE.Mesh(g.build(), M.neonBase); sky.name = 'dc-skylight'; sky.userData.aerialHide = true; sky.frustumCulled = false; kit.add(sky);

  // clouds
  const clouds = kit.instances(new THREE.PlaneGeometry(1, 1), M.cloud, { name: 'dc-clouds', cell: 400, castShadow: false, receiveShadow: false });
  const shafts = kit.instances(new THREE.PlaneGeometry(1, 1), M.haloSteady, { name: 'dc-shafts', cell: 400, castShadow: false, receiveShadow: false });
  const axisY = R.Y1, pick = (a) => a[Math.floor(rng() * a.length)];
  const tints = [0xe9eeff, 0xdfe8ff, 0xf3e8ff, 0xd6f4ff];
  let placed = 0;
  for (let tries = 0; tries < 600 && placed < 70; tries++) {
    const x = rng.range(box.x0 + 8, box.x1 - 8), z = rng.range(box.z0 + 2, box.z1 - 6), y = rng.range(3, B.ceil - 6);
    if (Math.hypot(z, y - axisY) < 22) continue;                                 // keep the tunnel interior view clear
    if (z < 0 && y < 24) continue;                                               // the cooling wall stands at z = -27
    const size = rng.range(10, 26), low = y < 12;
    const c = new THREE.Color(low ? pick([0xffb2ec, 0x9defff, 0xc9b8ff]) : pick(tints)).multiplyScalar(low ? 0.5 : 0.6);
    clouds.add(x, y, z, { sx: size * 1.5, sy: size, sz: 1, colour: c }); placed++;
  }
  // light shafts from the skylight
  for (let k = 0; k < 9; k++) {
    const x = box.x0 + 20 + ((box.x1 - box.x0 - 40) * (k + rng.range(0.1, 0.9))) / 9, z = rng.range(box.z0 + 15, box.z1 - 15);
    shafts.add(x, B.ceil * 0.55, z, { sx: rng.range(8, 14), sy: B.ceil * 1.05, sz: 1, colour: hdr(k % 3 === 1 ? 0xffc8f4 : 0xbfe8ff, 0.16) });
  }
}
