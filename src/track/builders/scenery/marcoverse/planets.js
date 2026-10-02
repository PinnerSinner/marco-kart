// Big things in the distance: the Marco-face planet, a ringed gas giant, cratered moons and a huge habitat ring.
// Every material here ignores fog (they are far away by design) and is lit by the scene sun plus a healthy emissive so the night side never goes black.
import * as THREE from 'three';
import { Assets } from '../../../../core/assets.js';
import { makeRng } from '../../../../core/util.js';
import { canvasTexture } from '../../textures.js';
import { PALETTE } from './palette.js';
import { coronaTexture, bandsTexture, ringTexture, habitatTexture } from './textures.js';
import { hot } from './util.js';

/** Where the Marco planet floats (east of the loop, face turned toward the start / east-straight side). Exported for the tests and the aerial views. */
export const MARCO_PLANET = { pos: [640, 118, 290], radius: 190, look: [140, 40, 120] };

// ------------------------------------------------------------------ Marco face planet
/** Paint the planet surface + face into a square canvas (orthographic mapping: the face sits at the centre of the visible disc). */
function paintMarcoPlanet(ctx, S, img) {
  const rng = makeRng(31);
  const g = ctx.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#2a1a8a'); g.addColorStop(0.45, '#1b5fb0'); g.addColorStop(1, '#3a2cc0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 70; k++) {                                                                      // continents and seas
    const x = rng() * S, y = rng() * S, r = 90 + rng() * 260, hue = [`60,220,190`, `255,110,200`, `140,110,255`, `40,160,255`][Math.floor(rng() * 4)];
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${hue},0.42)`); rg.addColorStop(1, `rgba(${hue},0)`);
    ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let k = 0; k < 150; k++) {                                                                     // cloud streaks
    const x = rng() * S, y = rng() * S, w = 160 + rng() * 380, h = 14 + rng() * 40;
    ctx.save(); ctx.translate(x, y); ctx.rotate((rng() - 0.5) * 0.35); ctx.scale(1, h / w);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2); rg.addColorStop(0, `rgba(255,255,255,${0.10 + rng() * 0.16})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  const c = S / 2, R = S / 2;
  if (img) {
    const ph = S * 0.94, pw = ph * (img.width / img.height), cx = c + S * 0.015, cy = c + S * 0.02;
    const off = document.createElement('canvas'); off.width = S; off.height = S; const o = off.getContext('2d');
    o.shadowColor = 'rgba(120,230,255,0.9)'; o.shadowBlur = S * 0.03; o.drawImage(img, cx - pw / 2, cy - ph / 2, pw, ph);   // cool rim light round the silhouette
    o.shadowBlur = 0; o.drawImage(img, cx - pw / 2, cy - ph / 2, pw, ph);
    o.globalCompositeOperation = 'source-atop'; o.fillStyle = 'rgba(90,110,255,0.16)'; o.fillRect(0, 0, S, S);           // gentle cool grade so the portrait belongs to the planet
    o.globalCompositeOperation = 'destination-in';
    const m = o.createRadialGradient(c, c, R * 0.10, c, c, R * 0.86); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.62, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = m; o.fillRect(0, 0, S, S);
    ctx.drawImage(off, 0, 0);
  } else drawCartoonMarco(ctx, S);
}

/** Procedural fallback: a friendly cartoon Marco (hair, headphones, grin) painted on the planet. */
function drawCartoonMarco(ctx, S) {
  const c = S / 2, u = S / 100;
  ctx.save(); ctx.translate(c, c + u * 2);
  const blob = (x, y, rx, ry, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x * u, y * u, rx * u, ry * u, 0, 0, Math.PI * 2); ctx.fill(); };
  blob(0, 4, 24, 28, '#f0b48c');                                              // face
  blob(0, -14, 26, 15, '#4a2b1c'); blob(-16, -8, 10, 14, '#4a2b1c'); blob(16, -8, 10, 14, '#4a2b1c');    // hair
  blob(-27, 3, 6, 12, '#e63946'); blob(27, 3, 6, 12, '#e63946');              // headphone cups
  ctx.strokeStyle = '#1a1c3a'; ctx.lineWidth = u * 2.6; ctx.beginPath(); ctx.arc(0, -4 * u, 28 * u, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  for (const sx of [-1, 1]) { blob(sx * 9, 0, 5, 3.6, '#ffffff'); blob(sx * 9, 0.4, 2.2, 2.4, '#2a1a12'); }
  ctx.strokeStyle = '#8a4a34'; ctx.lineWidth = u * 1.6; ctx.beginPath(); ctx.arc(0, 8 * u, 10 * u, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.restore();
}

/** Sphere whose UVs are an orthographic projection along +Z (so a painted portrait keeps its proportions when viewed from the front). */
function orthoSphere(R, wSeg = 72, hSeg = 52) {
  const g = new THREE.SphereGeometry(R, wSeg, hSeg), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * R), 0.5 + p.getY(i) / (2 * R));
  uv.needsUpdate = true; return g;
}

function atmosphereMaterial(color, power = 2.4, strength = 1.4) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPow: { value: power }, uK: { value: strength } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uPow; uniform float uK; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), uPow); gl_FragColor = vec4(uColor * f * uK, 1.0); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
}

/** The Marco planet: portrait sphere + atmosphere shell + corona sprite. The portrait is upgraded when the photo finishes decoding. */
function buildMarcoPlanet(kit) {
  const { pos, radius: R, look } = MARCO_PLANET, S = 2048;
  const state = { img: null };
  const tex = canvasTexture(S, S, (ctx) => paintMarcoPlanet(ctx, S, state.img), { repeat: false, aniso: 8 });
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.42, roughness: 0.85, metalness: 0, fog: false });
  const planet = new THREE.Mesh(orthoSphere(R), mat); planet.name = 'mv-marco-planet';
  const grp = new THREE.Group(); grp.name = 'mv-marco'; grp.position.set(pos[0], pos[1], pos[2]);
  grp.add(planet);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 48, 32), atmosphereMaterial(0x62d8ff, 2.6, 1.5)); shell.name = 'mv-marco-atmo'; shell.renderOrder = 3; grp.add(shell);
  const ct = coronaTexture(0.62);
  if (ct) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, color: 0x7fd8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, opacity: 0.85 }));
    spr.scale.setScalar((R * 1.05 * 2) / 0.62); spr.renderOrder = 2; grp.add(spr);
  }
  planet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]).normalize());   // +Z (the face) toward the road
  kit.add(grp);
  if (tex) Assets.image('marco_face').then((img) => { if (!img) return; state.img = img; paintMarcoPlanet(tex.image.getContext('2d'), S, img); tex.needsUpdate = true; }).catch(() => {});
}

// ------------------------------------------------------------------ gas giant with a ring
function buildRingedPlanet(kit) {
  const R = 96, pos = [-690, 190, -420];
  const bands = bandsTexture('giant', ['#ff9f6b', '#ffcf9a', '#d86b8a', '#8a5cff', '#ffb0d0', '#f08a5a'], 12);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: bands, emissiveMap: bands, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.9, fog: false, ...(bands ? {} : { color: 0xd88a8a }) });
  const grp = new THREE.Group(); grp.name = 'mv-giant'; grp.position.set(...pos); grp.rotation.set(0.35, 0.4, 0.5);
  grp.add(new THREE.Mesh(new THREE.SphereGeometry(R, 56, 40), mat));
  const rg = new THREE.RingGeometry(R * 1.45, R * 2.5, 96, 1), p = rg.attributes.position, uv = rg.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) - R * 1.45) / (R * 1.05), 0.5);
  const rt = ringTexture();
  const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: rt, color: rt ? 0xffffff : 0xf0c8d8, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false, opacity: 0.92 }));
  ring.rotation.x = -Math.PI / 2; grp.add(ring);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 32, 24), atmosphereMaterial(0xffa0c8, 3, 1.1)); grp.add(shell);
  kit.add(grp);
}

// ------------------------------------------------------------------ moons
function moonGeo(seed, R, hue) {
  const rng = makeRng(seed), g = new THREE.IcosahedronGeometry(R, 4), p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
  const craters = Array.from({ length: 16 }, () => { const v = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(); return [v, 0.12 + rng() * 0.28]; });
  const c = new THREE.Color(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, i).normalize(); let d = 0;
    for (const [cv, cr] of craters) { const a = Math.acos(Math.min(1, v.dot(cv))); if (a < cr) d -= 0.5 * (1 - (a / cr) ** 2) * cr * 0.5; else if (a < cr * 1.25) d += 0.02; }
    p.setXYZ(i, v.x * R * (1 + d + (rng() - 0.5) * 0.01), v.y * R * (1 + d), v.z * R * (1 + d));
    c.set(hue).multiplyScalar(0.75 + 0.5 * (d * -4 < 0 ? 0 : 1 - Math.min(1, -d * 6)));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}
function buildMoons(kit) {
  for (const [seed, R, pos, hue] of [[3, 34, [340, 230, -340], 0xb7a8ff], [8, 20, [-360, -60, 800], 0xffb59a], [5, 46, [760, 340, -120], 0x9fd6ff]]) {
    const m = new THREE.Mesh(moonGeo(seed, R, hue), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, emissive: 0x1a1850, emissiveIntensity: 0.9, fog: false }));
    m.position.set(...pos); m.name = 'mv-moon'; kit.add(m);
  }
}

// ------------------------------------------------------------------ habitat ring
function buildHabitatRing(kit) {
  const R = 620, H = 70, T = habitatTexture();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: T?.map, emissiveMap: T?.emissive, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide, fog: false, ...(T ? {} : { color: 0x3a4288 }) });
  if (mat.map) mat.map.repeat.set(26, 1);
  if (mat.emissiveMap) mat.emissiveMap.repeat.set(26, 1);
  const grp = new THREE.Group(); grp.name = 'mv-habitat';
  grp.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 220, 1, true), mat));
  const glow = new THREE.MeshBasicMaterial({ color: hot(PALETTE.cyan, 2.2), toneMapped: false, fog: false });
  for (const y of [-H / 2, H / 2]) { const t = new THREE.Mesh(new THREE.TorusGeometry(R, 3.4, 6, 220), glow); t.rotation.x = Math.PI / 2; t.position.y = y; grp.add(t); }
  const rim = new THREE.MeshStandardMaterial({ color: 0x2a2f7a, roughness: 0.5, metalness: 0.5, fog: false });
  for (let k = 0; k < 4; k++) {                                                                   // spokes to a far hub (only the first stretch is visible)
    const a = (k / 4) * Math.PI * 2, spoke = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, R * 0.7, 6), rim);
    spoke.position.set(Math.cos(a) * R * 0.65, 0, Math.sin(a) * R * 0.65); spoke.rotation.set(0, -a, Math.PI / 2); grp.add(spoke);
  }
  grp.position.set(-780, 380, -1050); grp.rotation.set(1.18, 0.35, 0.22);
  kit.add(grp);
}

/** @param {object} kit */
export function buildPlanets(kit) {
  buildMarcoPlanet(kit); buildRingedPlanet(kit); buildMoons(kit); buildHabitatRing(kit);
}
