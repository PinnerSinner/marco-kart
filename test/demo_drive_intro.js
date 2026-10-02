// Screenshot demo: ChaseCamera intro fly-through along the StubTrack, ending behind the grid kart (6 moments).
//   node tools/shot.mjs test/demo_drive_intro.js shots/drive/intro.png --wait 6000 --w 1440 --h 810
import * as THREE from 'three';
import { StubTrack } from '../src/track/StubTrack.js';
import { KartPhysics } from '../src/kart/KartPhysics.js';
import { ChaseCamera } from '../src/kart/ChaseCamera.js';
import { createDriverKart } from '../src/visuals/factory.js';
import { statsFor } from '../src/core/roster.js';

const W = innerWidth, H = innerHeight, COLS = 3, ROWS = 2, PW = Math.floor(W / COLS), PH = Math.floor(H / ROWS);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
renderer.setSize(W, H, false); renderer.setScissorTest(true);
const track = new StubTrack({ radius: 42, straight: 200, width: 18 });
const scene = new THREE.Scene();
const env = track.environment;
scene.background = new THREE.Color(env.skyBottom); scene.fog = new THREE.Fog(env.fogColor, 150, 700);
scene.add(track.group);
track.group.traverse((o) => { if (o.material && o.geometry && o.geometry.type === 'BufferGeometry') { o.material.polygonOffset = true; o.material.polygonOffsetFactor = -4; o.material.polygonOffsetUnits = -4; } });   // StubTrack's road sits 2 cm above the ground: avoid z-fighting in software GL
const sun = new THREE.DirectionalLight(env.sunColor, 2.4); sun.position.copy(env.sunDir).multiplyScalar(100); scene.add(sun);
scene.add(new THREE.AmbientLight(env.ambientColor, 1.0));
const coneGeo = new THREE.ConeGeometry(0.6, 1.6, 10), coneMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a });
const cones = new THREE.InstancedMesh(coneGeo, coneMat, 600); let ci = 0; const m4 = new THREE.Matrix4();
for (let s = 0; s < track.length; s += 10) { const sm = track.sample(s); for (const side of [-1, 1]) { const p = sm.pos.clone().addScaledVector(sm.right, side * (track.wallOffset + 0.3)); m4.makeTranslation(p.x, 0.8, p.z); cones.setMatrixAt(ci++, m4); } }
cones.count = ci; scene.add(cones);

const karts = [];
for (let i = 0; i < 8; i++) {
  const k = new KartPhysics(track, { id: `k${i}`, stats: statsFor('marco', 'cruiser') });
  const g = track.gridSlot(i); k.teleport(g.pos, g.heading);
  const dk = createDriverKart(['marco', 'rex', 'tilly', 'lambda', 'packet', 'carlos', 'subnet', 'biscuit'][i], 'cruiser');
  dk.group.position.copy(k.pos); k.applyAttitude(dk.group); scene.add(dk.group); karts.push(k);
}
const cam = new THREE.PerspectiveCamera(62, PW / PH, 0.1, 1500);
const chase = new ChaseCamera(cam); chase.setTarget(karts[0]);
let done = false;
chase.startIntro(track, 5.5).then(() => { done = true; });

const stops = [0.02, 0.22, 0.45, 0.7, 0.9, 1.0];
const labels = [];
let idx = 0, t = 0;
const DT = 1 / 60;
for (let f = 0; f < 60 * 8 && idx < stops.length; f++) {
  chase.update(DT); t += DT;
  if (t / 5.5 >= stops[idx] || (done && idx === stops.length - 1)) {
    const col = idx % COLS, row = Math.floor(idx / COLS), x = col * PW, y = (ROWS - 1 - row) * PH;
    renderer.setViewport(x, y, PW, PH); renderer.setScissor(x, y, PW, PH); renderer.render(scene, cam);
    labels.push([col * PW, row * PH, `t = ${t.toFixed(2)} s  mode=${chase.mode}  introDone=${chase.introDone}`]);
    idx++;
  }
}
for (const [x, y, text] of labels) {
  const d = document.createElement('div'); d.textContent = text;
  d.style.cssText = `position:fixed;left:${x + 8}px;top:${y + 6}px;color:#fff;font:600 15px system-ui;text-shadow:0 1px 3px #000,0 0 6px #000;pointer-events:none`;
  document.getElementById('ui-root').appendChild(d);
}
window.__ready = true;
