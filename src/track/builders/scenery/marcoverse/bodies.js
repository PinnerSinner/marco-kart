// Things floating around the ribbon: server-rack asteroids, cloud islands, the logo hologram, comets and space dust.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { Assets } from '../../../../core/assets.js';
import { makeRng } from '../../../../core/util.js';
import { canvasTexture } from '../../textures.js';
import { PALETTE } from './palette.js';
import { glowTexture } from './textures.js';
import { hot, neonAt, roadIndex, lightShaft } from './util.js';
import { mesh } from './start.js';
import { MARCO_PLANET } from './planets.js';

const NEON = [PALETTE.cyan, PALETTE.magenta, PALETTE.violet, PALETTE.mint, PALETTE.orange, PALETTE.yellow];
export const HOLOGRAM = { pos: [-10, 132, 262], size: 86 };

/** A point at horizontal distance dist..dist2 from a random spot on the road, with a vertical offset range; rejects spots too near the road or each other. */
function makePicker(kit, seed) {
  const { track } = kit, rng = makeRng(seed), near = roadIndex(track, 10, 60), placed = [], v = new THREE.Vector3();
  const mp = MARCO_PLANET, hp = HOLOGRAM;
  return (o) => {
    for (let tries = 0; tries < 400; tries++) {
      const s = rng() * track.length; track.surfacePoint(s, 0, v);
      const a = rng() * Math.PI * 2, d = o.d0 + rng() * (o.d1 - o.d0), x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d, y = v.y + o.y0 + rng() * (o.y1 - o.y0);
      const r = o.r;
      if (near(x, y, z, r + o.gap)) continue;
      if (Math.hypot(x - mp.pos[0], y - mp.pos[1], z - mp.pos[2]) < mp.radius + r + 40) continue;
      if (Math.hypot(x - hp.pos[0], y - hp.pos[1], z - hp.pos[2]) < hp.size * 0.8 + r) continue;
      if (placed.some((q) => Math.hypot(q[0] - x, q[1] - y, q[2] - z) < q[3] + r + 12)) continue;
      placed.push([x, y, z, r]);
      return { x, y, z, rng };
    }
    return null;
  };
}

/** Rock with a server rack half buried in it. Returns [rockGeo, ledGeo] in unit-rock space (radius ~1). */
function rackAsteroid(seed) {
  const rng = makeRng(seed), rock = new Geo(), leds = new Geo();
  const ico = new THREE.IcosahedronGeometry(1, 1), p = ico.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.78 + 0.42 * rng(); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.82, p.getZ(i) * k); }
  ico.computeVertexNormals();
  rock.geometry(ico, { colour: 0x4a4a86, top: 0x6a68b0, ao: 0.4 });
  for (let k = 0; k < 4; k++) { const a = rng() * 6.28, r = 0.55 + rng() * 0.3; rock.cyl(0, 0.16, 0.5 + rng() * 0.4, 5, { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.15, rx: (rng() - 0.5) * 0.7, rz: (rng() - 0.5) * 0.7, colour: hot(PALETTE.cyan, 1.4), ao: 0 }); }   // crystals
  // the rack: a dark cabinet leaning out of the rock top, with rows of LED strips on its front (+Z)
  const tilt = (rng() - 0.5) * 0.5, rx = 0.34, rh = 0.95, rd = 0.3, y0 = 0.35;
  rock.box(rx * 2, rh, rd * 2, { y: y0, z: 0.1, rz: tilt, colour: 0x161a44, top: 0x2a3080, ao: 0.2 });
  for (let k = 0; k < 7; k++) {
    const y = y0 + 0.08 + k * 0.12;
    rock.box(rx * 1.8, 0.075, 0.02, { y, z: 0.1 + rd + 0.005, rz: tilt, colour: 0x0a0c2a, ao: 0, x: Math.sin(tilt) * -(y - y0) * 0 });
    for (let j = 0; j < 5; j++) if (rng() < 0.72) leds.box(0.035, 0.03, 0.03, { x: -0.24 + j * 0.06 + Math.sin(tilt) * -(y - y0), y: y + 0.02, z: 0.1 + rd + 0.02, rz: tilt, colour: hot(rng() < 0.7 ? 0xffffff : PALETTE.orange, 3), ao: 0 });
  }
  return [rock, leds];
}

/** A puffy cloud on a small rocky underside, with an optional glowing ring. Returns [cloudGeo, rockGeo, glowGeo] in local metres (radius ~1). */
function cloudIsland(seed) {
  const rng = makeRng(seed), cloud = new Geo(), rock = new Geo(), glow = new Geo();
  const n = 7 + Math.floor(rng() * 4);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng(), d = 0.15 + rng() * 0.55, r = 0.28 + rng() * 0.26;
    cloud.sphere(r, { x: Math.cos(a) * d, y: 0.18 + rng() * 0.16, z: Math.sin(a) * d, sy: 0.82, colour: 0xf2ecff, top: 0xffffff, ao: 0.42 }, 9, 7);
  }
  cloud.sphere(0.5, { y: 0.34, sy: 0.85, colour: 0xf8f4ff, top: 0xffffff, ao: 0.4 }, 10, 8);
  rock.cyl(0.78, 0.2, 0.64, 9, { y: -0.6, colour: 0x3c3a7c, top: 0x5a58a4, ao: 0.5 });
  rock.cone(0.2, 0.42, 7, { y: -1.28, rx: Math.PI, colour: 0x3c3a7c, ao: 0.3 });
  glow.geometry(new THREE.TorusGeometry(0.79, 0.022, 5, 36), { rx: Math.PI / 2, y: 0.03, colour: hot(PALETTE.cyan, 2.4), ao: 0 });
  // a tiny rack on some islands
  if (rng() < 0.6) { rock.box(0.16, 0.4, 0.14, { x: 0.05, y: 0.32, z: 0.05, colour: 0x1b1f58, top: 0x2b3390, ao: 0.1 }); glow.box(0.12, 0.03, 0.02, { x: 0.05, y: 0.56, z: 0.125, colour: hot(PALETTE.mint, 3), ao: 0 }); }
  return [cloud, rock, glow];
}

export function buildAsteroidsAndIslands(kit, M) {
  const pick = makePicker(kit, (kit.def.seed ?? 1) * 101 + 7), col = new THREE.Color();
  // --- rack asteroids
  const rackMat = kit.mat.vertex({ roughness: 0.7, metalness: 0.15, emissive: 0x141650, emissiveIntensity: 1.0 }, 'mv-rock');
  const sets = Array.from({ length: 3 }, (_, i) => { const [r, l] = rackAsteroid(60 + i * 13); return [kit.instances(r, rackMat, { cell: 300, castShadow: false, receiveShadow: false, name: `mv-rack${i}`, cull: 520 }), kit.instances(l, M.glow, { cell: 300, castShadow: false, receiveShadow: false, name: `mv-led${i}`, cull: 520 })]; });
  for (let i = 0; i < 30; i++) {
    const s = 8 + (i % 5) * 4 + Math.floor(i / 10) * 6, p = pick({ d0: 60, d1: 340, y0: -110, y1: 90, r: s * 1.1, gap: 45 }); if (!p) continue;
    const ry = p.rng() * 6.28, rz = (p.rng() - 0.5) * 0.7, colr = col.set(NEON[Math.floor(p.rng() * NEON.length)]).clone();
    const [rk, lk] = sets[i % 3]; rk.add(p.x, p.y, p.z, { s, ry, rz }); lk.add(p.x, p.y, p.z, { s, ry, rz, colour: colr });
  }
  // --- cloud islands
  const cloudMat = kit.mat.vertex({ roughness: 1, emissive: 0x2b2a78, emissiveIntensity: 0.9, side: THREE.DoubleSide }, 'mv-cloud');
  const csets = Array.from({ length: 3 }, (_, i) => { const [c, r, g] = cloudIsland(90 + i * 7); return [kit.instances(c, cloudMat, { cell: 320, castShadow: false, receiveShadow: false, name: `mv-cloud${i}`, cull: 620 }), kit.instances(r, rackMat, { cell: 320, castShadow: false, receiveShadow: false, name: `mv-cloudrock${i}`, cull: 620 }), kit.instances(g, M.glow, { cell: 320, castShadow: false, receiveShadow: false, name: `mv-cloudglow${i}`, cull: 620 })]; });
  for (let i = 0; i < 12; i++) {
    const s = 28 + (i % 4) * 9, p = pick({ d0: 90, d1: 360, y0: -80, y1: 70, r: s * 0.9, gap: 40 }); if (!p) continue;
    const ry = p.rng() * 6.28, [c, r, g] = csets[i % 3];
    c.add(p.x, p.y, p.z, { s, ry }); r.add(p.x, p.y, p.z, { s, ry }); g.add(p.x, p.y, p.z, { s, ry });
  }
}

// ------------------------------------------------------------------ logo hologram
function fallbackLogo(ctx, S) {
  const g = ctx.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#f39b1f'); g.addColorStop(1, '#ff6b4a');
  ctx.clearRect(0, 0, S, S); ctx.fillStyle = g; ctx.beginPath();
  for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k / 6) * Math.PI * 2; ctx.lineTo(S / 2 + Math.cos(a) * S * 0.48, S / 2 + Math.sin(a) * S * 0.48); }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = S * 0.012; ctx.stroke();
  ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.font = `italic 900 ${S * 0.13}px "Arial Black", Impact, sans-serif`; ctx.fillText('MARCOVERSE', S / 2, S * 0.62, S * 0.8);
  ctx.font = `700 ${S * 0.05}px system-ui, sans-serif`; ctx.fillText('CLOUD & PROUD', S / 2, S * 0.74, S * 0.6);
  ctx.beginPath(); ctx.arc(S * 0.42, S * 0.3, S * 0.09, 0, 6.28); ctx.arc(S * 0.54, S * 0.27, S * 0.11, 0, 6.28); ctx.arc(S * 0.62, S * 0.33, S * 0.07, 0, 6.28); ctx.fill();
}

/** The Marcoverse logo floating above the infield (readable from both long straights) over a projector pad, with animated scan lines. */
export function buildHologram(kit, M) {
  const { pos, size } = HOLOGRAM, S = 512;
  const tex = canvasTexture(S, S, (ctx) => fallbackLogo(ctx, S), { repeat: false, aniso: 8 });
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : 0xf39b1f, transparent: true, alphaTest: 0.02, toneMapped: false, fog: false, side: THREE.FrontSide });
  const grp = new THREE.Group(); grp.name = 'mv-hologram'; grp.position.set(pos[0], pos[1], pos[2]);
  const plane = new THREE.PlaneGeometry(size, size);
  const scanTex = canvasTexture(4, 64, (ctx) => { ctx.clearRect(0, 0, 4, 64); ctx.fillStyle = 'rgba(120,230,255,0.9)'; ctx.fillRect(0, 0, 4, 3); ctx.fillStyle = 'rgba(120,230,255,0.25)'; ctx.fillRect(0, 3, 4, 8); }, { repeat: true, aniso: 1 });
  if (scanTex) scanTex.repeat.set(1, 26);
  const scanMat = new THREE.MeshBasicMaterial({ map: scanTex, color: hot(0xffffff, 0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
  for (const sg of [1, -1]) {                                                                // readable from +X and -X
    const front = new THREE.Mesh(plane, mat); front.position.x = sg * 0.4; front.rotation.y = sg > 0 ? Math.PI / 2 : -Math.PI / 2;
    grp.add(front);
  }
  const scan = new THREE.Mesh(plane, scanMat); scan.rotation.y = Math.PI / 2; scan.position.x = 0.9; grp.add(scan);
  const scan2 = scan.clone(); scan2.rotation.y = -Math.PI / 2; scan2.position.x = -0.9; grp.add(scan2);
  // hexagonal neon frame (glow boxes) and a projector pad below with a faint beam
  const fr = new Geo(), beam = new Geo();
  const hr = size * 0.53, hx = new THREE.Color(PALETTE.cyan);
  for (let k = 0; k < 6; k++) {
    const a0 = -Math.PI / 2 + (k / 6) * Math.PI * 2, a1 = a0 + Math.PI / 3, p0 = [0, Math.sin(a0) * hr, Math.cos(a0) * hr], p1 = [0, Math.sin(a1) * hr, Math.cos(a1) * hr];
    fr.beam(p0, p1, 0.55, 5, { colour: hot(k % 2 ? PALETTE.magenta : PALETTE.cyan, 2.6), ao: 0 });
    fr.sphere(1.1, { x: 0, y: p0[1], z: p0[2], colour: hot(0xffffff, 2.8), ao: 0 }, 7, 5);
  }
  const padY = -size * 0.62;
  fr.cyl(size * 0.3, size * 0.34, 3, 28, { y: padY - 3, colour: hot(0x2a2f7a, 1), ao: 0.2 });
  fr.geometry(new THREE.TorusGeometry(size * 0.32, 0.5, 6, 48), { rx: Math.PI / 2, y: padY, colour: hot(PALETTE.cyan, 2.8), ao: 0 });
  lightShaft(beam, [0, padY, 0], [0, -size * 0.4, 0], size * 0.31, size * 0.12, hot(PALETTE.cyan, 0.16), hot(PALETTE.cyan, 0.0), 24);
  grp.add(mesh(fr, M.glow), mesh(beam, M.add, 2));
  kit.add(grp);
  let t0 = 0;
  kit.animate((dt, t) => { grp.position.y = pos[1] + Math.sin(t * 0.7) * 1.6; if (scanTex) scanTex.offset.y = -t * 0.06; t0 = t; });
  Assets.image('logo_marcoverse').then((img) => {
    if (!img) return; const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
    mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true;
  }).catch(() => {});
}

// ------------------------------------------------------------------ comets
export function buildComets(kit, M) {
  const { track } = kit, near = roadIndex(track, 10, 60), rng = makeRng((kit.def.seed ?? 1) * 31 + 5), comets = [];
  const gt = glowTexture();
  const headGeo = new THREE.SphereGeometry(2.4, 10, 8), headMat = new THREE.MeshBasicMaterial({ color: hot(0xdffbff, 2.5), toneMapped: false, fog: false });
  const tail = new Geo(), tail2 = new Geo();
  lightShaft(tail, [0, 0, 0], [0, 0, -190], 2.1, 0.15, hot(0x8fe8ff, 0.7), hot(0x3a6cff, 0), 10);
  lightShaft(tail2, [0, 0, 0], [0, 0, -120], 5.4, 0.4, hot(PALETTE.violet, 0.28), hot(PALETTE.magenta, 0), 12);
  const tailGeo = tail.build(), tail2Geo = tail2.build();
  for (let i = 0; i < 5; i++) {
    let sx, sy, sz, dx, dz, dy;
    for (let tries = 0; tries < 60; tries++) {
      const a = rng() * Math.PI * 2, c = [-60 + (rng() - 0.5) * 500, 0, 290 + (rng() - 0.5) * 500];
      dx = Math.cos(a); dz = Math.sin(a); dy = (rng() - 0.5) * 0.18;
      sy = 50 + rng() * 210; sx = c[0] - dx * 800; sz = c[2] - dz * 800; sy -= dy * 800;
      let ok = true; for (let d = 0; d <= 1600; d += 40) if (near(sx + dx * d, sy + dy * d, sz + dz * d, 55)) { ok = false; break; }
      if (ok) break;
    }
    const g = new THREE.Group(); g.name = 'mv-comet';
    g.add(new THREE.Mesh(headGeo, headMat), new THREE.Mesh(tailGeo, M.add), new THREE.Mesh(tail2Geo, M.add));
    if (gt) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0x9fe8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false })); sp.scale.setScalar(26); g.add(sp); }
    const len = Math.hypot(dx, dy, dz); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx / len, dy / len, dz / len));
    g.frustumCulled = false; kit.add(g);
    comets.push({ g, sx, sy, sz, dx: dx / len, dy: dy / len, dz: dz / len, speed: 34 + rng() * 26, phase: rng() * 1600 });
  }
  kit.animate((dt, t) => {
    for (let i = 0; i < comets.length; i++) {
      const c = comets[i], d = (c.phase + t * c.speed) % 1600;
      c.g.position.set(c.sx + c.dx * d, c.sy + c.dy * d, c.sz + c.dz * d);
    }
  });
}

// ------------------------------------------------------------------ space dust
export function buildDust(kit) {
  const { track } = kit, rng = makeRng((kit.def.seed ?? 1) * 17 + 3), tex = glowTexture();
  if (!tex) return;
  const N = 2600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const s = rng() * track.length, side = rng() < 0.5 ? -1 : 1, lat = side * (track.widthAt(s) / 2 + 3 + rng() * rng() * 70);
    track.surfacePoint(s, lat, v);
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y + (rng() - 0.35) * 46; pos[i * 3 + 2] = v.z;
    neonAt(s + rng() * 200, track.length, c, 0.35 + rng() * 0.6).lerp(new THREE.Color(0xffffff), 0.35 * rng());
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.9, map: tex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false }));
  pts.name = 'mv-dust'; pts.frustumCulled = false; kit.add(pts);
}
