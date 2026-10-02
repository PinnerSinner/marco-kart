// World models for the 24 items (20 general + 4 Biscuit-only; plus the extra world entities: pod, bolt, stink) and the item box. Origin = centre of the object, bounding radius ~0.5 to 0.7 m, faces +Z.
// Every group exposes `userData.update(t, dt)` for its little idle animation (spinning rings, bobbing steam...).
import * as THREE from 'three';
import { GeoBuilder, extrudePoly } from './geo.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cachedGeo } from './rig.js';
import { outlinedMesh, clothMaterial, paintMaterial, glowMaterial, ledMaterial, ledTick, shade } from './toon.js';
import { bubbleMaterial, glowSpriteMaterial, sparkleTexture } from './materials.js';
import { printTexture, inkText } from './canvas.js';

const INK = 0x1b1226;

function part(parent, key, thunk, o = {}) {
  const geo = cachedGeo(`item:${key}`, thunk);
  const mat = o.mat === 'paint' ? paintMaterial() : o.mat === 'glow' ? glowMaterial() : o.mat === 'led' ? ledMaterial() : clothMaterial();
  const m = outlinedMesh(geo, mat, o.mat === 'glow' || o.mat === 'led' ? 0 : (o.ol ?? 0.026), INK);
  if (o.mat === 'led') { m.onBeforeRender = ledTick; m.castShadow = false; }
  if (o.mat === 'glow') m.castShadow = false;
  if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
  if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
  if (o.s !== undefined) m.scale.setScalar(o.s);
  parent.add(m);
  return m;
}

function glowSprite(parent, colour, size, opacity = 0.9, pos = [0, 0, 0]) {
  const s = new THREE.Sprite(glowSpriteMaterial(colour, opacity));
  s.scale.setScalar(size);
  s.position.set(pos[0], pos[1], pos[2]);
  parent.add(s);
  return s;
}

// ---- individual items ---------------------------------------------------------------------------------------------

function cable(g) {
  const knot = part(g, 'cable-knot', () => {
    const b = new GeoBuilder();
    b.add(new THREE.TorusKnotGeometry(0.3, 0.085, 90, 10, 2, 3), { c: 0x0e9fbf, c2: 0x35e2ff, axis: 'z' });
    b.add(new THREE.TorusKnotGeometry(0.3, 0.02, 90, 4, 2, 3), { c: 0x073b4a, s: [1.02, 1.02, 1.02] });
    return b.build();
  }, { ol: 0.022 });
  knot.rotation.set(0.5, 0.3, 0);
  for (const [sx, col] of [[-1, 0xff5a36], [1, 0xffc233]]) {
    const plug = part(g, `cable-plug-${sx}`, () => {
      const b = new GeoBuilder();
      b.rbox([0.2, 0.14, 0.26], 0.03, { c: 0xdfe4ee, c2: 0xffffff });
      b.box(0.1, 0.05, 0.1, { p: [0, 0.095, -0.03], c: col });
      for (let i = -3; i <= 3; i++) b.box(0.016, 0.03, 0.03, { p: [i * 0.026, -0.02, 0.135], c: 0xffd23f });
      b.cyl(0.05, 0.06, 0.16, { p: [0, 0, -0.2], r: [Math.PI / 2, 0, 0], c: col });
      return b.build();
    }, { ol: 0.02 });
    plug.position.set(sx * 0.42, -0.16 + (sx > 0 ? 0.24 : 0), sx * 0.12);
    plug.rotation.set(0.2, sx * 1.1 + (sx > 0 ? 0.5 : 2.6), 0.3);
  }
  const spark = glowSprite(g, 0xffe066, 0.5, 0.0, [0.42, 0.3, 0.1]);
  return (t) => { knot.rotation.y = 0.3 + Math.sin(t * 1.7) * 0.12; knot.rotation.x = 0.5 + Math.cos(t * 1.3) * 0.08; spark.material.opacity = Math.max(0, Math.sin(t * 9)) > 0.85 ? 0.9 : 0; };
}

function ping(g) {
  part(g, 'ping-core', () => {
    const b = new GeoBuilder();
    b.sphere(0.3, { c: 0x1e88e5, c2: 0x8ff3ff }, 20, 14);
    b.cone(0.22, 0.6, { p: [0, 0, -0.45], r: [-Math.PI / 2, 0, 0], c: 0x1e88e5, c2: 0x8ff3ff }, 14);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.add(extrudePoly([[0, 0], [0.22, 0], [0.04, 0.2]], 0.03, { c: 0xffffff, c2: 0x8ff3ff }), { p: [Math.cos(a) * 0.2, Math.sin(a) * 0.2, -0.3], r: [0, Math.PI / 2, a], keep: true });
    }
    return b.build();
  }, { mat: 'paint' });
  const glowCore = part(g, 'ping-glow', () => new GeoBuilder().sphere(0.16, { c: 0xffffff, k: 1.6 }, 12, 8).build(), { mat: 'glow', p: [0, 0, 0.12] });
  const ring = part(g, 'ping-ring', () => new GeoBuilder().torus(0.42, 0.028, { c: 0x9ff8ff, k: 1.8 }, 6, 28).build(), { mat: 'glow' });
  const ring2 = part(g, 'ping-ring2', () => new GeoBuilder().torus(0.42, 0.02, { c: 0xffffff, k: 1.8 }, 6, 28).build(), { mat: 'glow', p: [0, 0, -0.35] });
  glowSprite(g, 0x33c9ff, 1.5, 0.65);
  return (t) => {
    const k = (t * 1.8) % 1;
    ring.scale.setScalar(0.55 + k * 0.7); ring.position.z = 0.1 - k * 0.5;
    ring2.scale.setScalar(0.55 + ((k + 0.5) % 1) * 0.7); ring2.position.z = 0.1 - ((k + 0.5) % 1) * 0.5;
    glowCore.scale.setScalar(1 + Math.sin(t * 14) * 0.15);
  };
}

function traceroute(g) {
  part(g, 'trace-body', () => {
    const b = new GeoBuilder();
    b.capsule(0.19, 0.5, { r: [Math.PI / 2, 0, 0], c: 0xff9a1f, c2: 0xffd08a });
    b.cone(0.19, 0.4, { p: [0, 0, 0.5], r: [Math.PI / 2, 0, 0], c: 0xff5a36, c2: 0xff9a1f }, 14);
    b.torus(0.2, 0.03, { p: [0, 0, 0.1], c: 0xffffff }, 6, 18);
    b.torus(0.2, 0.03, { p: [0, 0, -0.14], c: 0x1b1226 }, 6, 18);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.add(extrudePoly([[0, 0], [0.3, -0.12], [0.3, -0.34], [0, -0.3]], 0.035, { c: 0x1b1226, c2: 0x3a2a55 }), { p: [Math.cos(a) * 0.18, Math.sin(a) * 0.18, -0.2], r: [0, -Math.PI / 2, a], keep: true, });
    }
    b.cyl(0.11, 0.14, 0.14, { p: [0, 0, -0.55], r: [Math.PI / 2, 0, 0], c: 0x333846 }, 10);
    return b.build();
  }, { mat: 'paint' });
  const flame = part(g, 'trace-flame', () => new GeoBuilder().cone(0.1, 0.4, { r: [-Math.PI / 2, 0, 0], p: [0, 0, -0.78], c: 0xffe066, k: 1.7 }, 8).build(), { mat: 'glow' });
  const orbit = new THREE.Group();
  g.add(orbit);
  part(orbit, 'trace-hops', () => {
    const b = new GeoBuilder();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.sphere(0.06, { p: [Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0], c: [0x22d3ee, 0xff4fd8, 0xffe066][i], k: 1.6 }, 8, 6);
    }
    b.torus(0.42, 0.012, { c: 0xffffff, k: 1.3 }, 4, 30);
    return b.build();
  }, { mat: 'glow', p: [0, 0, 0.1] });
  return (t) => { orbit.rotation.z = t * 3.2; flame.scale.set(1, 1, 0.8 + Math.sin(t * 30) * 0.25); };
}

function cup(b, x, y, z, s, colour) {
  b.lathe([[0, 0], [0.16 * s, 0.01], [0.22 * s, 0.06], [0.27 * s, 0.2], [0.29 * s, 0.26], [0.26 * s, 0.26], [0.24 * s, 0.2], [0.18 * s, 0.09], [0, 0.07]], { p: [x, y, z], c: colour, c2: 0xffffff }, 20);
  b.cyl(0.25 * s, 0.25 * s, 0.014 * s, { p: [x, y + 0.245 * s, z], c: 0x5a2b12, c2: 0x8a4b22 }, 18);
  b.cyl(0.13 * s, 0.13 * s, 0.014 * s, { p: [x, y + 0.255 * s, z], c: 0xd9a066 }, 14);
  b.arc(0.085 * s, 0.03 * s, Math.PI, { p: [x + 0.29 * s, y + 0.14 * s, z], r: [0, 0, -Math.PI / 2], c: colour });
  b.cyl(0.38 * s, 0.34 * s, 0.04 * s, { p: [x, y - 0.02 * s, z], c: 0xe7ecf5, c2: 0xffffff }, 24);
}

function steam(g, positions) {
  const wisps = [];
  for (const [x, z] of positions) {
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Sprite(glowSpriteMaterial(0xffffff, 0.4));
      s.userData = { x, z, ph: i * 0.5 };
      g.add(s); wisps.push(s);
    }
  }
  return (t) => {
    for (const s of wisps) {
      const k = (t * 0.6 + s.userData.ph) % 1;
      s.position.set(s.userData.x + Math.sin(k * 6 + s.userData.ph * 9) * 0.05, 0.24 + k * 0.5, s.userData.z);
      s.scale.setScalar(0.18 + k * 0.32);
      s.material.opacity = 0.42 * (1 - k) * Math.min(1, k * 5);
    }
  };
}

function espresso(g) {
  part(g, 'espresso-cup', () => { const b = new GeoBuilder(); cup(b, 0, -0.3, 0, 1.6, 0xf6f3ea); b.rbox([0.5, 0.08, 0.08], 0.03, { p: [0, -0.16, 0.42], c: 0xe63946 }, 1); return b.build(); }, {});
  const st = steam(g, [[-0.08, 0], [0.08, 0.04]]);
  const pivot = g;
  return (t) => { st(t); pivot.children[0].position.y = Math.sin(t * 3) * 0.02; };
}

function sudo(g) {
  const badge = new THREE.Group();
  g.add(badge);
  part(badge, 'sudo-badge', () => {
    const b = new GeoBuilder();
    const pts = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const r = i % 2 ? 0.44 : 0.53; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    b.add(extrudePoly(pts, 0.1, { c: 0xc99a1e, c2: 0xffe066 }, 0.02), { keep: true });
    b.add(extrudePoly(Array.from({ length: 24 }, (_, i) => [Math.cos((i / 24) * Math.PI * 2) * 0.36, Math.sin((i / 24) * Math.PI * 2) * 0.36]), 0.12, { c: 0x111826, c2: 0x1f2a44 }, 0.01), { keep: true });
    b.torus(0.37, 0.025, { p: [0, 0, 0.09], c: 0xffe066 }, 6, 28);
    return b.build();
  }, { mat: 'paint' });
  const tex = printTexture('item:sudo', 256, 256, (ctx, w, h) => {
    ctx.shadowColor = '#25ff8c'; ctx.shadowBlur = 24;
    inkText(ctx, '#', w / 2, h * 0.36, { font: '900 150px monospace', fill: '#25ff8c', stroke: 'rgba(0,0,0,0)', lw: 0 });
    inkText(ctx, 'sudo', w / 2, h * 0.7, { font: '900 70px monospace', fill: '#25ff8c', stroke: 'rgba(0,0,0,0)', lw: 0 });
  });
  if (tex) {
    for (const z of [0.072, -0.072]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.64), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
      m.position.z = z; if (z < 0) m.rotation.y = Math.PI;
      badge.add(m);
    }
  }
  glowSprite(g, 0xffd23f, 1.6, 0.45);
  return (t) => { badge.rotation.y = Math.sin(t * 1.5) * 0.5; badge.position.y = Math.sin(t * 2.4) * 0.04; };
}

/**
 * Firewall shield bubble with a brick-lattice pattern. Used for the world model and the racer shield.
 * @param {number} [radius=0.6]
 * @returns {THREE.Mesh}
 */
export function createFirewallBubble(radius = 0.6) {
  const geo = cachedGeo(`bubble:${radius}`, () => new THREE.SphereGeometry(radius, 28, 20));
  const mat = bubbleMaterial({ color: 0xff7a1a, edge: 0xffe07a, alpha: 0.13, edgeAlpha: 0.75, power: 2.2, pattern: true, pulse: 0.4 });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 5;
  m.userData.tick = (t) => { mat.uniforms.uTime.value = t; };
  return m;
}

function firewall(g) {
  g.add(createFirewallBubble(0.62));
  const wall = part(g, 'fw-wall', () => {
    const b = new GeoBuilder();
    const cols = [0xd6402a, 0xe9602f, 0xb8321f];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      b.rbox([0.2, 0.1, 0.14], 0.025, { p: [(c - 1) * 0.215 + (r % 2 ? 0.1 : 0), (r - 1.5) * 0.115, 0], c: cols[(r + c) % 3], c2: shade(cols[(r + c) % 3], 0.1) }, 1);
    }
    return b.build();
  }, { ol: 0.018, s: 0.8 });
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const f = part(g, `fw-flame-${i}`, () => new GeoBuilder().cone(0.075, 0.28, { c: 0xffd23f, c2: 0xff5a1f, k: 1.6 }, 8).build(), { mat: 'glow', p: [(i - 1) * 0.2, 0.3, 0] });
    flames.push(f);
  }
  return (t) => {
    g.children[0].userData.tick(t);
    wall.rotation.y = Math.sin(t * 1.2) * 0.35;
    flames.forEach((f, i) => { f.scale.set(1, 0.8 + Math.sin(t * 12 + i * 2) * 0.3, 1); });
  };
}

function fibre(g) {
  const coil = new THREE.Group();
  g.add(coil);
  part(coil, 'fibre-spool', () => {
    const b = new GeoBuilder();
    b.cyl(0.2, 0.2, 0.62, { c: 0x2a2f42, c2: 0x3a4266, r: [0, 0, Math.PI / 2] }, 14);
    for (const s of [-1, 1]) b.cyl(0.42, 0.42, 0.06, { p: [s * 0.32, 0, 0], r: [0, 0, Math.PI / 2], c: 0x8f98ad, c2: 0xdfe4ee }, 22);
    return b.build();
  });
  part(coil, 'fibre-wind', () => {
    const b = new GeoBuilder();
    const cols = [0x22d3ee, 0xff4fd8, 0xffe066, 0x38f28d];
    for (let i = 0; i < 9; i++) b.torus(0.235, 0.032, { p: [(i - 4) * 0.062, 0, 0], r: [0, Math.PI / 2, 0], c: cols[i % 4], k: 1.7 }, 6, 22);
    return b.build();
  }, { mat: 'glow' });
  part(g, 'fibre-tail', () => {
    const b = new GeoBuilder();
    const cols = [0x22d3ee, 0xff4fd8, 0xffe066];
    for (let i = 0; i < 3; i++) b.tube([0.32, 0.1 - i * 0.1, 0.0], [0.95, -0.35 + i * 0.35, 0.2 + i * 0.05], 0.03, { c: cols[i], k: 1.8 }, 6);
    return b.build();
  }, { mat: 'glow', p: [-0.1, 0, 0] });
  glowSprite(g, 0x66f0ff, 1.7, 0.5);
  coil.rotation.z = 0.2;
  return (t) => { coil.rotation.x = t * 2.4; coil.rotation.y = Math.sin(t * 1.3) * 0.2; };
}

function outage(g) {
  const cloud = new THREE.Group();
  g.add(cloud);
  part(cloud, 'outage-cloud', () => {
    const b = new GeoBuilder();
    const puffs = [[0, 0, 0, 0.34], [-0.3, -0.06, 0.02, 0.26], [0.3, -0.05, 0, 0.27], [-0.14, 0.2, 0.05, 0.24], [0.16, 0.19, -0.02, 0.25], [0, -0.14, 0.1, 0.24]];
    for (const [x, y, z, r] of puffs) b.sphere(r, { p: [x, y + 0.14, z], c: 0x4d5470, c2: 0x8b93b3 }, 14, 10);
    return b.build();
  });
  part(g, 'outage-bolt', () => {
    const b = new GeoBuilder();
    b.add(extrudePoly([[0.06, 0.3], [-0.16, -0.06], [-0.02, -0.06], [-0.1, -0.4], [0.18, 0.06], [0.03, 0.06], [0.14, 0.3]], 0.08, { c: 0xffd23f, c2: 0xfff2a0, k: 1.5 }, 0.012), { keep: true });
    return b.build();
  }, { mat: 'glow', p: [0.02, -0.12, 0.2], s: 1.0 });
  const bolt = g.children[1];
  const drops = [];
  for (let i = 0; i < 4; i++) {
    const d = part(g, `outage-drop-${i}`, () => new GeoBuilder().sphere(0.045, { s: [0.7, 1.5, 0.7], c: 0x6fd0ff, k: 1.3 }, 6, 5).build(), { mat: 'glow' });
    drops.push(d);
  }
  return (t) => {
    cloud.position.y = 0.2 + Math.sin(t * 2) * 0.03;
    bolt.visible = Math.sin(t * 11) > -0.6;
    drops.forEach((d, i) => { const k = (t * 1.3 + i * 0.25) % 1; d.position.set(-0.3 + i * 0.2, 0.1 - k * 0.6, 0.15); d.material.opacity = 1; d.scale.setScalar(1 - k * 0.4); });
  };
}

function kernelPanic(g) {
  const mine = new THREE.Group();
  g.add(mine);
  part(mine, 'kp-mine', () => {
    const b = new GeoBuilder();
    b.add(new THREE.IcosahedronGeometry(0.34, 1), { c: 0x1b1226, c2: 0x4a2a5c, flat: true });
    const dirs = new THREE.IcosahedronGeometry(1, 0).attributes.position;
    const seen = new Set();
    for (let i = 0; i < dirs.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
      const k = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
      if (seen.has(k)) continue; seen.add(k);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      b.cone(0.09, 0.3, { p: [v.x * 0.46, v.y * 0.46, v.z * 0.46], q, c: 0x8a1c2b, c2: 0xff3b4d }, 8);
    }
    return b.build();
  }, { mat: 'paint' });
  part(mine, 'kp-core', () => new GeoBuilder().torus(0.35, 0.03, { c: 0xff3b4d, k: 1.9 }, 6, 24).build(), { mat: 'glow' });
  const core2 = part(mine, 'kp-core2', () => new GeoBuilder().torus(0.35, 0.03, { c: 0xff3b4d, k: 1.9, r: [Math.PI / 2, 0, 0] }, 6, 24).build(), { mat: 'glow' });
  const sign = new THREE.Group();
  sign.position.y = 0.78;
  g.add(sign);
  part(sign, 'kp-tri', () => {
    const b = new GeoBuilder();
    b.add(extrudePoly([[-0.3, -0.2], [0.3, -0.2], [0, 0.32]], 0.06, { c: 0xffd23f, c2: 0xfff2a0 }, 0.02), { keep: true });
    b.add(extrudePoly([[-0.2, -0.14], [0.2, -0.14], [0, 0.22]], 0.08, { c: 0x111826 }, 0.005), { keep: true });
    return b.build();
  }, { mat: 'paint', ol: 0.02 });
  part(sign, 'kp-bang', () => {
    const b = new GeoBuilder();
    b.rbox([0.05, 0.16, 0.05], 0.02, { p: [0, 0.03, 0.055], c: 0xffd23f, k: 1.6 }, 1);
    b.sphere(0.03, { p: [0, -0.1, 0.055], c: 0xffd23f, k: 1.6 }, 8, 6);
    b.rbox([0.05, 0.16, 0.05], 0.02, { p: [0, 0.03, -0.055], c: 0xffd23f, k: 1.6 }, 1);
    b.sphere(0.03, { p: [0, -0.1, -0.055], c: 0xffd23f, k: 1.6 }, 8, 6);
    return b.build();
  }, { mat: 'glow' });
  glowSprite(g, 0xff2a3a, 1.5, 0.4);
  return (t) => { mine.rotation.y = t * 1.2; mine.rotation.x = Math.sin(t * 0.9) * 0.4; core2.rotation.z = t * 2; sign.rotation.y = -t * 1.6; sign.position.y = 0.78 + Math.sin(t * 3) * 0.04; };
}

// ---- more items ------------------------------------------------------------------------------------------------------

/** A ring of shock (torus) helper: a glowing flat ring that the animation scales / fades. */
function ring(g, key, r, colour, thick = 0.03, o = {}) {
  return part(g, key, () => new GeoBuilder().torus(r, thick, { c: colour, k: 1.8 }, 6, 36).build(), { mat: 'glow', r: [Math.PI / 2, 0, 0], ...o });
}

function sniffer(g) {
  const dish = new THREE.Group();
  g.add(dish);
  part(dish, 'sniffer-dish', () => {
    const b = new GeoBuilder();
    b.lathe([[0, 0], [0.12, 0.02], [0.3, 0.1], [0.42, 0.22], [0.4, 0.24], [0.28, 0.14], [0.1, 0.06], [0, 0.05]], { r: [Math.PI / 2, 0, 0], c: 0xdfe6f2, c2: 0xffffff }, 20);
    b.cyl(0.03, 0.03, 0.4, { p: [0, 0, 0.2], r: [Math.PI / 2, 0, 0], c: 0x333846 }, 8);
    b.sphere(0.06, { p: [0, 0, 0.42], c: 0xff9a1f, k: 1.5 }, 8, 6);
    return b.build();
  }, { mat: 'paint' });
  const body = part(g, 'sniffer-body', () => {
    const b = new GeoBuilder();
    b.capsule(0.13, 0.4, { r: [Math.PI / 2, 0, 0], c: 0x263a5c, c2: 0x4d6ea8 });
    b.cone(0.12, 0.3, { p: [0, 0, 0.42], r: [Math.PI / 2, 0, 0], c: 0xff9a1f, c2: 0xffd08a }, 10);
    return b.build();
  }, { mat: 'paint', p: [0, 0, -0.1] });
  const r1 = ring(g, 'sniffer-r1', 0.4, 0x7feaff, 0.02, { p: [0, 0, 0.6], r: [0, 0, 0] });
  return (t) => { dish.rotation.z = t * 2.6; const k = (t * 1.6) % 1; r1.scale.setScalar(0.4 + k); body.rotation.z = Math.sin(t * 5) * 0.1; };
}

function bsod(g) {
  // expanding shock rings and a small blue-screen slab
  const rs = [ring(g, 'bsod-r1', 0.9, 0x2a6bff, 0.05), ring(g, 'bsod-r2', 0.9, 0xffffff, 0.03)];
  const slab = part(g, 'bsod-slab', () => {
    const b = new GeoBuilder();
    b.rbox([1.0, 0.68, 0.08], 0.04, { c: 0x1d3fbf, c2: 0x3a72ff }, 2);
    b.box(0.78, 0.5, 0.02, { p: [0, 0, 0.05], c: 0x0f2a9c, c2: 0x1f4fe0 });
    b.rbox([0.34, 0.05, 0.02], 0.01, { p: [-0.12, 0.14, 0.07], c: 0xffffff, k: 1.6 }, 1);
    b.rbox([0.5, 0.04, 0.02], 0.01, { p: [-0.02, 0.02, 0.07], c: 0xd7e4ff, k: 1.5 }, 1);
    b.rbox([0.4, 0.04, 0.02], 0.01, { p: [-0.07, -0.08, 0.07], c: 0xd7e4ff, k: 1.5 }, 1);
    return b.build();
  }, { mat: 'paint', ol: 0.02 });
  glowSprite(g, 0x2a6bff, 2.2, 0.5);
  return (t) => {
    rs.forEach((m, i) => { const k = (t * 0.9 + i * 0.4) % 1; m.scale.setScalar(0.4 + k * 1.4); });
    slab.rotation.y = Math.sin(t * 2) * 0.35; slab.position.y = Math.sin(t * 3) * 0.05;
  };
}

function autoscale(g) {
  const arrows = new THREE.Group();
  g.add(arrows);
  part(arrows, 'auto-arrows', () => {
    const b = new GeoBuilder();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.cone(0.13, 0.32, { p: [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0], r: [0, 0, a - Math.PI / 2], c: 0x39d98a, c2: 0xb4ffd5 }, 8);
      b.tube([Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0], [Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0], 0.06, { c: 0x39d98a });
    }
    return b.build();
  }, { mat: 'paint', ol: 0.02 });
  const core = part(g, 'auto-core', () => {
    const b = new GeoBuilder();
    b.rbox([0.5, 0.5, 0.5], 0.08, { c: 0x2a3a5c, c2: 0x5673a8 }, 2);
    b.box(0.34, 0.06, 0.02, { p: [0, 0.1, 0.26], c: 0x7cff6b, k: 1.7 });
    b.box(0.34, 0.06, 0.02, { p: [0, -0.02, 0.26], c: 0x7cff6b, k: 1.7 });
    b.box(0.34, 0.06, 0.02, { p: [0, -0.14, 0.26], c: 0x22d3ee, k: 1.7 });
    return b.build();
  }, { mat: 'paint' });
  return (t) => { const k = 1 + Math.sin(t * 4) * 0.12; arrows.scale.setScalar(k); arrows.rotation.z = Math.sin(t * 1.3) * 0.15; core.rotation.y = t * 1.2; };
}

function spill(g) {
  part(g, 'spill-puddle', () => {
    const b = new GeoBuilder();
    b.cyl(1.0, 1.0, 0.05, { c: 0x4a2410, c2: 0x7a4a26 }, 24);
    for (const [x, z, r] of [[0.9, 0.3, 0.42], [-0.7, 0.7, 0.36], [0.2, -0.95, 0.4], [-0.9, -0.4, 0.3], [0.55, 0.85, 0.28]]) b.cyl(r, r, 0.05, { p: [x, 0, z], c: 0x4a2410, c2: 0x7a4a26 }, 14);
    b.cyl(0.55, 0.55, 0.055, { p: [-0.1, 0.01, 0.05], c: 0x8a5630, c2: 0xb47a48 }, 18);
    return b.build();
  }, { p: [0, -0.35, 0], ol: 0.02 });
  part(g, 'spill-shine', () => new GeoBuilder().cyl(0.22, 0.22, 0.03, { c: 0xffffff, k: 1.3 }, 12).build(), { mat: 'glow', p: [0.3, -0.31, 0.3], s: 1 });
  const st = steam(g, [[0.1, 0.1], [-0.4, -0.2], [0.5, -0.3]]);
  return (t) => st(t);
}

function zeroday(g) {
  const mine = new THREE.Group();
  g.add(mine);
  part(mine, 'zd-body', () => {
    const b = new GeoBuilder();
    b.cyl(0.42, 0.5, 0.2, { c: 0x2a2f3d, c2: 0x4b5368 }, 14);
    b.cyl(0.32, 0.4, 0.1, { p: [0, 0.14, 0], c: 0x3a4152, c2: 0x5f6a82 }, 14);
    b.cyl(0.12, 0.12, 0.12, { p: [0, 0.25, 0], c: 0x8a1c2b, c2: 0xff3b4d }, 8);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.cone(0.05, 0.18, { p: [Math.cos(a) * 0.4, 0.05, Math.sin(a) * 0.4], r: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2], c: 0xff3b4d }, 6); }
    return b.build();
  }, { mat: 'paint', p: [0, -0.2, 0] });
  const led = part(g, 'zd-led', () => new GeoBuilder().sphere(0.07, { c: 0xff3b4d, k: 2 }, 8, 6).build(), { mat: 'glow', p: [0, 0.14, 0] });
  const bug = part(g, 'zd-bug', () => {
    const b = new GeoBuilder();
    b.sphere(0.09, { c: 0x111826 }, 8, 6);
    for (let i = -1; i <= 1; i++) { b.tube([-0.08, 0, i * 0.05], [-0.2, -0.05, i * 0.1], 0.012, { c: 0x111826 }, 4); b.tube([0.08, 0, i * 0.05], [0.2, -0.05, i * 0.1], 0.012, { c: 0x111826 }, 4); }
    return b.build();
  }, { mat: 'paint', p: [0, 0.32, 0], ol: 0.014 });
  return (t) => { mine.rotation.y = t * 0.5; led.visible = Math.sin(t * 6) > -0.2; led.scale.setScalar(1 + Math.max(0, Math.sin(t * 6)) * 0.4); bug.position.y = 0.32 + Math.sin(t * 3) * 0.02; };
}

function podMesh(g, big) {
  const s = big ? 1 : 0.7;
  part(g, big ? 'pod-big' : 'pod-small', () => {
    const b = new GeoBuilder();
    b.capsule(0.2 * s, 0.3 * s, { c: 0x2e6bff, c2: 0x8fb5ff });
    b.torus(0.2 * s, 0.03 * s, { p: [0, 0.04, 0], r: [Math.PI / 2, 0, 0], c: 0xffffff }, 6, 16);
    b.sphere(0.06 * s, { p: [0, 0.03, 0.19 * s], c: 0xffe066, k: 1.6 }, 6, 5);
    return b.build();
  }, { mat: 'paint', ol: 0.02, r: [Math.PI / 2, 0, 0] });
}

function pod(g) {
  podMesh(g, true);
  const flame = part(g, 'pod-flame', () => new GeoBuilder().cone(0.09, 0.4, { r: [-Math.PI / 2, 0, 0], p: [0, 0, -0.5], c: 0x7feaff, k: 1.7 }, 8).build(), { mat: 'glow' });
  glowSprite(g, 0x4d8bff, 1.1, 0.5);
  return (t) => flame.scale.set(1, 1, 0.8 + Math.sin(t * 28) * 0.25);
}

function pods(g) {
  const orb = new THREE.Group();
  g.add(orb);
  for (let i = 0; i < 3; i++) {
    const h = new THREE.Group();
    const a = (i / 3) * Math.PI * 2;
    h.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); h.rotation.y = -a;
    orb.add(h); podMesh(h, false);
  }
  ring(g, 'pods-ring', 0.5, 0x7feaff, 0.012);
  return (t) => { orb.rotation.y = t * 2.2; };
}

function forcepush(g) {
  const rs = [];
  for (let i = 0; i < 3; i++) rs.push(ring(g, `fp-r${i}`, 0.5, [0xffffff, 0x7feaff, 0xb46bff][i], 0.05));
  part(g, 'fp-hand', () => {
    const b = new GeoBuilder();
    b.rbox([0.34, 0.3, 0.14], 0.06, { c: 0xffd2a8, c2: 0xffe6cf }, 1);
    for (let i = -2; i <= 1; i++) b.rbox([0.07, 0.24, 0.1], 0.03, { p: [i * 0.085 + 0.04, 0.24, 0], c: 0xffd2a8, c2: 0xffe6cf }, 1);
    b.rbox([0.07, 0.2, 0.1], 0.03, { p: [-0.22, 0.08, 0], r: [0, 0, 0.9], c: 0xffd2a8 }, 1);
    return b.build();
  }, { mat: 'paint', ol: 0.02, p: [0, -0.15, 0] });
  return (t) => rs.forEach((m, i) => { const k = (t * 1.1 + i / 3) % 1; m.scale.setScalar(0.4 + k * 1.6); });
}

function pigeon(g) {
  const wingL = new THREE.Group(), wingR = new THREE.Group();
  g.add(wingL, wingR);
  part(g, 'pg-body', () => {
    const b = new GeoBuilder();
    b.sphere(0.26, { s: [0.85, 0.8, 1.25], c: 0x8a93a8, c2: 0xc4cad8 }, 14, 10);
    b.sphere(0.15, { p: [0, 0.2, 0.3], c: 0x6b7590, c2: 0xa0a8bd }, 10, 8);
    b.cone(0.04, 0.14, { p: [0, 0.18, 0.46], r: [Math.PI / 2, 0, 0], c: 0xffb347 }, 6);
    b.sphere(0.028, { p: [0.08, 0.24, 0.4], c: 0x1b1226 }, 6, 5); b.sphere(0.028, { p: [-0.08, 0.24, 0.4], c: 0x1b1226 }, 6, 5);
    b.add(extrudePoly([[0, 0], [0.16, -0.5], [-0.16, -0.5]], 0.04, { c: 0x6b7590 }), { p: [0, 0.02, -0.25], r: [Math.PI / 2, 0, 0], keep: true });
    b.sphere(0.07, { p: [0, 0.02, 0.05], c: 0x2f9d6a, c2: 0x7cff6b }, 6, 5);
    return b.build();
  }, { mat: 'paint', ol: 0.02 });
  const wing = (grp, sx) => part(grp, `pg-wing${sx}`, () => {
    const b = new GeoBuilder();
    b.add(extrudePoly([[0, 0.15], [0.7, 0.1], [0.75, -0.05], [0.5, -0.25], [0, -0.2]], 0.035, { c: 0xa0a8bd, c2: 0xe2e6ef }), { r: [Math.PI / 2, 0, 0], keep: true });
    return b.build();
  }, { mat: 'paint', ol: 0.02, s: 1 });
  const wl = wing(wingL, 'L'), wr = wing(wingR, 'R');
  wl.rotation.y = Math.PI;
  const drop = part(g, 'pg-drop', () => new GeoBuilder().sphere(0.06, { s: [0.8, 1.3, 0.8], c: 0xffffff, k: 1.4 }, 6, 5).build(), { mat: 'glow', p: [0, -0.3, -0.3] });
  return (t) => { const f = Math.sin(t * 16) * 0.7; wingL.rotation.z = -f; wingR.rotation.z = f; wingL.position.y = wingR.position.y = 0.1; g.position.y = 0; drop.position.y = -0.3 - ((t * 1.2) % 1) * 0.4; };
}

// ---- skill items --------------------------------------------------------------------------------------------------

function capacitor(g) {
  const coil = new THREE.Group();
  g.add(coil);
  part(g, 'cap-body', () => {
    const b = new GeoBuilder();
    b.cyl(0.24, 0.24, 0.62, { c: 0x1f3a93, c2: 0x4d78ff }, 18);
    b.cyl(0.25, 0.25, 0.05, { p: [0, 0.32, 0], c: 0xdfe4ee }, 18);
    b.cyl(0.25, 0.25, 0.05, { p: [0, -0.32, 0], c: 0xdfe4ee }, 18);
    b.rbox([0.1, 0.5, 0.02], 0.02, { p: [0, 0, 0.245], c: 0xffe066, k: 1.5 }, 1);
    b.cyl(0.03, 0.03, 0.2, { p: [-0.1, 0.44, 0], c: 0xc0c8d8 }, 6); b.cyl(0.03, 0.03, 0.2, { p: [0.1, 0.44, 0], c: 0xc0c8d8 }, 6);
    return b.build();
  }, { mat: 'paint', ol: 0.024 });
  part(coil, 'cap-arc', () => new GeoBuilder().arc(0.42, 0.025, Math.PI * 1.3, { c: 0xffe066, k: 1.9 }).build(), { mat: 'glow', r: [Math.PI / 2, 0, 0] });
  part(coil, 'cap-arc2', () => new GeoBuilder().arc(0.5, 0.02, Math.PI * 0.9, { c: 0x7feaff, k: 1.9 }).build(), { mat: 'glow', r: [Math.PI / 2, 0, 2] });
  glowSprite(g, 0x5da0ff, 1.3, 0.4);
  return (t) => { coil.rotation.y = t * 5; coil.rotation.x = Math.sin(t * 3) * 0.3; };
}

function bolt(g) {
  const core = part(g, 'bolt-core', () => {
    const b = new GeoBuilder();
    b.sphere(0.3, { c: 0xffe066, c2: 0xffffff, k: 1.6 }, 14, 10);
    b.cone(0.22, 0.9, { p: [0, 0, -0.55], r: [-Math.PI / 2, 0, 0], c: 0x5da0ff, k: 1.6 }, 10);
    return b.build();
  }, { mat: 'glow' });
  const arcs = [0, 1, 2].map((i) => part(g, `bolt-arc${i}`, () => new GeoBuilder().arc(0.4, 0.025, Math.PI * 0.8, { c: 0xffffff, k: 2 }).build(), { mat: 'glow' }));
  glowSprite(g, 0x5da0ff, 2.0, 0.7);
  return (t) => { core.scale.setScalar(1 + Math.sin(t * 30) * 0.12); arcs.forEach((m, i) => { m.rotation.z = t * (9 + i * 3) + i * 2; m.rotation.x = i * 1.2 + Math.sin(t * 7 + i); }); };
}

function legacy(g) {
  const rack = part(g, 'legacy-rack', () => {
    const b = new GeoBuilder();
    b.rbox([0.9, 0.95, 0.7], 0.05, { c: 0xd9cfae, c2: 0xefe6c8 }, 1);       // beige cabinet
    for (let i = 0; i < 4; i++) {
      b.rbox([0.76, 0.14, 0.03], 0.01, { p: [0, 0.3 - i * 0.2, 0.36], c: 0xb3a884 }, 1);
      b.sphere(0.028, { p: [0.3, 0.3 - i * 0.2, 0.385], c: [0x7cff6b, 0xffb347, 0x7cff6b, 0xff3b4d][i], k: 1.7 }, 6, 5);
    }
    b.rbox([0.5, 0.05, 0.03], 0.01, { p: [-0.05, 0.3, 0.385], c: 0x555a66 }, 1);
    b.cyl(0.2, 0.2, 0.05, { p: [0, -0.3, 0.37], r: [Math.PI / 2, 0, 0], c: 0x555a66 }, 12);
    b.rbox([0.5, 0.08, 0.02], 0.01, { p: [0, 0.44, 0.36], c: 0x1f3a93 }, 1);
    return b.build();
  }, { mat: 'paint', ol: 0.026 });
  part(g, 'legacy-rope', () => {
    const b = new GeoBuilder();
    b.tube([0, 0.3, -0.35], [0, 0.35, -1.0], 0.04, { c: 0xffc233 }, 6);
    b.torus(0.09, 0.03, { p: [0, 0.3, -0.36], c: 0xdfe4ee }, 6, 12);
    return b.build();
  }, { mat: 'paint', ol: 0.014, p: [0, -0.1, 0] });
  return (t) => { rack.rotation.z = Math.sin(t * 3) * 0.05; rack.rotation.x = Math.sin(t * 2.3) * 0.03; };
}

function cronjob(g) {
  const bomb = part(g, 'cron-bomb', () => {
    const b = new GeoBuilder();
    b.sphere(0.32, { c: 0x1b1226, c2: 0x4a3a66 }, 16, 12);
    b.cyl(0.1, 0.12, 0.1, { p: [0, 0.34, 0], c: 0x8fa0c4 }, 10);
    // a clock face on the front
    b.cyl(0.19, 0.19, 0.04, { p: [0, 0, 0.29], r: [Math.PI / 2, 0, 0], c: 0xfff8ec }, 16);
    b.box(0.025, 0.14, 0.02, { p: [0, 0.05, 0.32], c: 0x1b1226 }); b.box(0.1, 0.025, 0.02, { p: [0.04, 0, 0.32], c: 0xe63946 });
    return b.build();
  }, { mat: 'paint', ol: 0.024 });
  const fuse = part(g, 'cron-fuse', () => {
    const b = new GeoBuilder();
    b.tube([0, 0.38, 0], [0.06, 0.55, 0], 0.025, { c: 0xd9b26a }, 5);
    b.tube([0.06, 0.55, 0], [0.16, 0.6, 0], 0.025, { c: 0xd9b26a }, 5);
    return b.build();
  }, { mat: 'paint', ol: 0.012 });
  const spark = glowSprite(g, 0xffd23f, 0.5, 0.95, [0.16, 0.62, 0]);
  glowSprite(g, 0xff5a36, 1.4, 0.3);
  return (t) => { spark.scale.setScalar(0.4 + Math.abs(Math.sin(t * 18)) * 0.3); spark.material.rotation = t * 8; bomb.scale.setScalar(1 + Math.max(0, Math.sin(t * 6)) * 0.05); fuse.rotation.z = 0; };
}

// ---- Biscuit-only items ---------------------------------------------------------------------------------------------

/** Steaming Gift: a swirl of poo with googly eyes, a red gift bow, green stink wisps and two circling flies. */
function poo(g) {
  part(g, 'poo-swirl', () => {
    const b = new GeoBuilder();
    b.sphere(0.38, { p: [0, 0.0, 0], s: [1, 0.55, 1], c: 0x5a3414, c2: 0x8a5a2a }, 18, 10);
    b.sphere(0.29, { p: [0, 0.2, 0], s: [1, 0.55, 1], c: 0x654020, c2: 0x9a6a34 }, 16, 10);
    b.sphere(0.2, { p: [0, 0.38, 0], s: [1, 0.55, 1], c: 0x704a26, c2: 0xa87a40 }, 14, 8);
    b.cone(0.09, 0.2, { p: [0.02, 0.58, 0], r: [0, 0, -0.35], c: 0x7a5230 }, 8);
    // googly eyes + a daft grin on the front
    for (const sx of [-1, 1]) {
      b.sphere(0.085, { p: [sx * 0.13, 0.22, 0.27], c: 0xffffff }, 10, 8);
      b.sphere(0.04, { p: [sx * 0.13 + sx * 0.012, 0.215, 0.34], c: 0x1b1226 }, 6, 5);
    }
    b.arc(0.11, 0.018, Math.PI, { p: [0, 0.1, 0.34], r: [0, 0, Math.PI], c: 0x2a1408 });
    return b.build();
  }, { mat: 'paint', p: [0, -0.3, 0], ol: 0.024 });
  part(g, 'poo-bow', () => {
    const b = new GeoBuilder();
    b.sphere(0.07, { c: 0xe63946 }, 8, 6);
    for (const sx of [-1, 1]) b.sphere(0.12, { p: [sx * 0.13, 0.02, 0], s: [1, 0.55, 0.5], r: [0, 0, sx * 0.3], c: 0xe63946, c2: 0xff7a85 }, 10, 8);
    return b.build();
  }, { mat: 'paint', p: [0, 0.33, 0.02], ol: 0.016 });
  const st = steam(g, [[0, 0], [-0.18, 0.1], [0.18, -0.05]]);
  const wisps = [0, 1, 2].map(() => glowSprite(g, 0x7cff3b, 0.32, 0.4, [0, 0.3, 0]));
  const flies = [0, 1].map(() => part(g, 'poo-fly', () => new GeoBuilder().sphere(0.035, { c: 0x111826 }, 6, 5).build(), { mat: 'paint', ol: 0.008 }));
  return (t) => {
    st(t);
    wisps.forEach((w, i) => { const k = (t * 0.55 + i / 3) % 1; w.position.set(Math.sin(k * 7 + i) * 0.14, 0.3 + k * 0.7, Math.cos(k * 5 + i) * 0.1); w.scale.setScalar(0.22 + k * 0.4); w.material.opacity = 0.45 * (1 - k); });
    flies.forEach((f, i) => { const a = t * (5 + i * 2) + i * 3; f.position.set(Math.cos(a) * 0.5, 0.35 + Math.sin(a * 1.7) * 0.12, Math.sin(a) * 0.5); });
  };
}

/** The stink cloud a poo leaves behind (drawn at the entity's radius): a few billowing green puffs. */
function stink(g) {
  const puffs = [];
  for (let i = 0; i < 7; i++) puffs.push(glowSprite(g, i % 2 ? 0x8bd630 : 0x5fae22, 1.0, 0.36, [0, 0.4, 0]));
  return (t) => puffs.forEach((p, i) => {
    const a = t * 0.5 + i * 0.9, r = 0.22 + (i % 3) * 0.2;
    p.position.set(Math.cos(a) * r, 0.25 + ((t * 0.3 + i * 0.37) % 1) * 0.7, Math.sin(a) * r);
    p.scale.setScalar(0.95 + Math.sin(t * 1.7 + i) * 0.18 + (i % 3) * 0.25);
    p.material.opacity = 0.3 + Math.sin(t * 2 + i * 1.3) * 0.08;
  });
}

/** Mega Woof: three expanding sound-wave arcs in a cone ahead (+Z) plus a flat ring; the renderer scales the whole thing to the bark's range. */
function woof(g) {
  const arcs = [];
  const A = 2.3;
  for (let i = 0; i < 3; i++) {
    const m = part(g, `woof-arc${i}`, () => new GeoBuilder().arc(1, 0.045, A, { c: [0xffffff, 0xffd166, 0xff8a3d][i], k: 1.9 }).build(), { mat: 'glow', r: [Math.PI / 2, 0, Math.PI / 2 - A / 2] });
    arcs.push(m);
  }
  const base = ring(g, 'woof-base', 0.3, 0xffd166, 0.05);
  glowSprite(g, 0xffd166, 1.2, 0.35, [0, 0.3, 0.2]);
  return (t) => {
    arcs.forEach((m, i) => { const k = (t * 1.3 + i / 3) % 1; m.scale.setScalar(0.35 + k * 0.65); m.position.y = 0.2; });
    base.scale.setScalar(0.6 + Math.sin(t * 8) * 0.08);
  };
}

/** Zoomies: a very bouncy tennis ball with speed streaks and a paw print (the "item" model; the boost itself has no world entity). */
function zoomies(g) {
  const ball = part(g, 'zm-ball', () => {
    const b = new GeoBuilder();
    b.sphere(0.34, { c: 0xc8e63a, c2: 0xeaff6b }, 18, 12);
    b.arc(0.35, 0.02, Math.PI * 1.1, { r: [0.3, 1.2, 0.5], c: 0xffffff });
    b.arc(0.35, 0.02, Math.PI * 1.1, { r: [2.6, 0.4, 3.6], c: 0xffffff });
    return b.build();
  }, { mat: 'paint', ol: 0.024 });
  const paws = part(g, 'zm-paw', () => {
    const b = new GeoBuilder();
    b.sphere(0.09, { p: [0, -0.04, 0], s: [1.3, 0.5, 1], c: 0x7a4a12 }, 8, 6);
    for (const [x, z] of [[-0.15, 0.11], [-0.05, 0.19], [0.05, 0.19], [0.15, 0.11]]) b.sphere(0.04, { p: [x, -0.04, z], s: [1, 0.5, 1.2], c: 0x7a4a12 }, 6, 5);
    return b.build();
  }, { mat: 'glow', p: [0, -0.34, 0], s: 1.6 });
  const streaks = part(g, 'zm-streak', () => {
    const b = new GeoBuilder();
    for (let i = 0; i < 3; i++) b.cone(0.03, 0.5, { p: [(i - 1) * 0.16, 0, -0.55], r: [-Math.PI / 2, 0, 0], c: 0xffffff, k: 1.6 }, 6);
    return b.build();
  }, { mat: 'glow' });
  glowSprite(g, 0xc8e63a, 1.3, 0.35);
  return (t) => { ball.position.y = Math.abs(Math.sin(t * 6)) * 0.18; ball.rotation.x = t * 8; paws.rotation.y = t * 2; streaks.scale.z = 0.8 + Math.sin(t * 22) * 0.25; };
}

/** Fetch!: a cartoon bone-stick with chew marks and a twig; it spins end over end as it flies. */
function fetch(g) {
  const spin = new THREE.Group();
  g.add(spin);
  part(spin, 'fetch-bone', () => {
    const b = new GeoBuilder();
    b.cyl(0.07, 0.07, 0.7, { r: [0, 0, Math.PI / 2], c: 0xf3e6c4, c2: 0xfff6dc }, 10);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.sphere(0.13, { p: [sx * 0.37, 0.0, sz * 0.09], c: 0xf3e6c4, c2: 0xfff6dc }, 10, 8);
    b.sphere(0.05, { p: [0.1, 0.07, 0.02], c: 0xb89a62 }, 6, 5);                       // a chew mark
    b.tube([-0.05, 0.02, 0.06], [-0.2, 0.18, 0.06], 0.025, { c: 0x6a8a2a }, 5);        // a twig and a leaf: it started life as a stick
    b.sphere(0.06, { p: [-0.21, 0.2, 0.06], s: [1.6, 0.4, 1], c: 0x7cc23a }, 6, 5);
    return b.build();
  }, { mat: 'paint', ol: 0.022 });
  glowSprite(g, 0xfff0b0, 1.0, 0.28);
  return (t) => { spin.rotation.z = t * 11; spin.rotation.y = Math.sin(t * 2) * 0.3; };
}

const BUILDERS = {
  poo, woof, zoomies, fetch, stink, stick: fetch,
  cable, ping, traceroute, espresso, sudo, firewall, fibre, outage, kernel_panic: kernelPanic,
  sniffer, bsod, autoscale, spill, zeroday, pods, forcepush, pigeon,
  capacitor, legacy, cronjob,
  // world entities that are not item ids
  pod, bolt,
};
/** Mesh radius (m) of effect-style models that are drawn at the entity's gameplay radius (see REQUESTS.md). */
/** Entities drawn at their gameplay radius by RaceView (mesh radius 1 m): the bark's wave rings and the stink cloud. */
export const FIT_RADIUS = { woof: 1, stink: 1 };
export const FX_BASE = { spill: 1.0, bsod: 1.0, forcepush: 1.0, cronjob: 0.9 };
/** Ids that have a world model: every item plus the extra world entities (`pod`, `bolt`). */
export const ITEM_MESH_IDS = Object.keys(BUILDERS);

/**
 * World model for an item. `group.userData.update(t)` animates it (t in seconds); `group.userData.radius` is the bounding radius.
 * @param {string} itemId one of ITEM_IDS or `pod` / `bolt` (unknown ids get the cable)
 * @returns {THREE.Group}
 */
export function createItemMesh(itemId) {
  const id = BUILDERS[itemId] ? itemId : 'cable';
  const g = new THREE.Group();
  g.name = `item-${id}`;
  const anim = BUILDERS[id](g) ?? (() => {});
  g.userData = { itemId: id, radius: 0.7, update: (t) => anim(t) };
  // world entities whose gameplay radius is much bigger than the model: the renderer may scale the mesh by `entity.radius / fxBase`
  if (FX_BASE[id]) g.userData.fxBase = FX_BASE[id];
  if (FIT_RADIUS[id]) g.userData.fitRadius = FIT_RADIUS[id];
  anim(0);
  return g;
}

// ---- item box ---------------------------------------------------------------------------------------------------------

let boxParts = new Map();

/**
 * Shared geometry + materials for the item box (also used by RaceView's instanced boxes).
 * @param {number} [size=1.5] cube edge (m)
 * @returns {{glassGeo: THREE.BufferGeometry, glassMat: THREE.ShaderMaterial, frameGeo: THREE.BufferGeometry, frameMat: THREE.Material, qGeo: THREE.BufferGeometry, qMat: THREE.MeshBasicMaterial|null}}
 */
export function getItemBoxParts(size = 1.5) {
  const hit = boxParts.get(size);
  if (hit) return hit;
  const h = size / 2;
  const glassGeo = new THREE.BoxGeometry(size, size, size);
  const glassMat = bubbleMaterial({ color: 0x66d8ff, edge: 0xffffff, alpha: 0.2, edgeAlpha: 0.55, power: 1.6, hue: true });
  const frameGeo = (() => {
    const b = new GeoBuilder();
    const e = 0.045 * size / 1.5;
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) b.box(size + e, e, e, { p: [0, sy * h, sz * h], c: 0xffffff, k: 1.8 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(e, size + e, e, { p: [sx * h, 0, sz * h], c: 0xffffff, k: 1.8 });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.box(e, e, size + e, { p: [sx * h, sy * h, 0], c: 0xffffff, k: 1.8 });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) b.sphere(e * 0.95, { p: [sx * h, sy * h, sz * h], c: 0xffe066, k: 1.8 }, 8, 6);
    return b.build();
  })();
  const tex = printTexture('item-box:q', 256, 256, (ctx, w, hh) => {
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 30;
    inkText(ctx, '?', w / 2, hh * 0.53, { font: '900 210px system-ui, Arial, sans-serif', fill: '#ffffff', stroke: '#ff4fd8', lw: 26 });
    ctx.shadowBlur = 0;
    inkText(ctx, '?', w / 2, hh * 0.53, { font: '900 210px system-ui, Arial, sans-serif', fill: '#ffffff', stroke: 'rgba(0,0,0,0)', lw: 0 });
  });
  const qMat = tex ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }) : null;
  const qGeo = (() => {
    const b = new GeoBuilder();
    const a = new THREE.PlaneGeometry(size * 0.72, size * 0.72);
    const c = new THREE.PlaneGeometry(size * 0.72, size * 0.72); c.rotateY(Math.PI / 2);
    const merged = mergeGeometries([a, c]);
    a.dispose(); c.dispose(); b.geos.length = 0;
    return merged;
  })();
  const parts = { glassGeo, glassMat, frameGeo, frameMat: glowMaterial(), qGeo, qMat };
  boxParts.set(size, parts);
  return parts;
}

/** Free the shared item-box resources. */
export function disposeItemBoxParts() {
  for (const p of boxParts.values()) { p.glassGeo.dispose(); p.glassMat.dispose(); p.frameGeo.dispose(); p.qGeo.dispose(); p.qMat?.dispose(); }
  boxParts = new Map();
}

/**
 * Translucent rainbow-glass cube with a glowing "?" on every face and orbiting sparkles.
 * `userData.update(t, pop)` animates spin and sparkles; `pop` (0..1) scales the whole box for the pop-in animation.
 * @param {number} [size=1.5] cube edge (m)
 * @returns {THREE.Group}
 */
export function createItemBoxMesh(size = 1.5) {
  const g = new THREE.Group();
  g.name = 'item-box';
  const cube = new THREE.Group();
  g.add(cube);
  const parts = getItemBoxParts(size);
  const glass = new THREE.Mesh(parts.glassGeo, parts.glassMat);
  glass.renderOrder = 4;
  const frame = new THREE.Mesh(parts.frameGeo, parts.frameMat);
  frame.castShadow = false;
  cube.add(glass, frame);
  if (parts.qMat) { const q = new THREE.Mesh(parts.qGeo, parts.qMat); q.renderOrder = 3; cube.add(q); }
  glowSprite(g, 0xa66bff, size * 2.4, 0.5);
  const sparks = [];
  const stex = sparkleTexture();
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: stex, color: [0xffffff, 0x7feaff, 0xffe066, 0xff8ae8, 0xffffff][i], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.userData.ph = i / 5;
    g.add(s); sparks.push(s);
  }
  g.userData = {
    radius: size * 0.87,
    cube,
    update(t, pop = 1) {
      const k = pop <= 0 ? 0 : pop >= 1 ? 1 : pop;
      const back = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.35 : 1;
      g.scale.setScalar(Math.max(0.0001, k * back));
      cube.rotation.set(0.35 + Math.sin(t * 1.1) * 0.12, t * 1.6, 0.2);
      parts.glassMat.uniforms.uTime.value = t;
      for (let i = 0; i < sparks.length; i++) {
        const a = t * (1.2 + i * 0.13) + sparks[i].userData.ph * 6.283;
        const r = size * (0.95 + 0.12 * Math.sin(t * 2 + i));
        sparks[i].position.set(Math.cos(a) * r, Math.sin(a * 0.8 + i) * size * 0.6, Math.sin(a) * r);
        sparks[i].scale.setScalar(size * (0.26 + 0.12 * Math.sin(t * 7 + i * 2)));
        sparks[i].material.rotation = t + i;
      }
    },
  };
  g.userData.update(0, 1);
  return g;
}
