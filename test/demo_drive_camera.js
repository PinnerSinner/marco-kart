// Screenshot demo: ChaseCamera following a scripted drifting kart on the StubTrack (contact sheet of 6 moments).
//   node tools/shot.mjs test/demo_drive_camera.js shots/drive/camera.png --wait 6000 --w 1440 --h 810
import * as THREE from 'three';
import { StubTrack } from '../src/track/StubTrack.js';
import { KartPhysics } from '../src/kart/KartPhysics.js';
import { ChaseCamera } from '../src/kart/ChaseCamera.js';
import { createDriverKart } from '../src/visuals/factory.js';
import { bus } from '../src/core/bus.js';
import { statsFor } from '../src/core/roster.js';
import { makeBot } from './drive_bot.js';

const W = innerWidth, H = innerHeight, COLS = 3, ROWS = 2, PW = Math.floor(W / COLS), PH = Math.floor(H / ROWS);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
renderer.setSize(W, H, false); renderer.setScissorTest(true);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const track = new StubTrack({ radius: 42, straight: 200, width: 18 });
const scene = new THREE.Scene();
const env = track.environment;
scene.background = new THREE.Color(env.skyBottom); scene.fog = new THREE.Fog(env.fogColor, 120, 520);
scene.add(track.group);
track.group.traverse((o) => { if (o.material && o.geometry && o.geometry.type === 'BufferGeometry') { o.material.polygonOffset = true; o.material.polygonOffsetFactor = -4; o.material.polygonOffsetUnits = -4; } });   // StubTrack's road sits 2 cm above the ground: avoid z-fighting in software GL
const sun = new THREE.DirectionalLight(env.sunColor, 2.4); sun.position.copy(env.sunDir).multiplyScalar(100); scene.add(sun);
scene.add(new THREE.AmbientLight(env.ambientColor, 1.0));

// reference dressing: cones along the walls and white stripes across the road so motion and swing are readable
const coneGeo = new THREE.ConeGeometry(0.6, 1.6, 10), coneMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a });
const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
const cones = new THREE.InstancedMesh(coneGeo, coneMat, 900); let ci = 0; const m4 = new THREE.Matrix4();
for (let s = 0; s < track.length && ci < 900; s += 8) {
  const sm = track.sample(s);
  for (const side of [-1, 1]) { const p = sm.pos.clone().addScaledVector(sm.right, side * (track.wallOffset + 0.3)); m4.makeTranslation(p.x, 0.8, p.z); cones.setMatrixAt(ci++, m4); }
  if (s % 24 === 0) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(track.width, 0.7), stripeMat);
    stripe.rotation.x = -Math.PI / 2; stripe.rotation.z = Math.atan2(sm.tangent.x, sm.tangent.z) * 0 + Math.atan2(sm.right.z, sm.right.x) * 0;
    stripe.position.copy(sm.pos).setY(0.05); stripe.rotation.set(-Math.PI / 2, 0, 0); stripe.rotation.order = 'YXZ'; stripe.rotation.y = Math.atan2(sm.tangent.x, sm.tangent.z) + Math.PI / 2 * 0;
    stripe.rotation.set(-Math.PI / 2, 0, -Math.atan2(sm.tangent.x, sm.tangent.z), 'YXZ');
    scene.add(stripe);
  }
}
cones.count = ci; scene.add(cones);

const stats = statsFor('marco', 'cruiser');
const kart = new KartPhysics(track, { id: 'marco', charId: 'marco', kartId: 'cruiser', stats });
const g = track.gridSlot(0); kart.teleport(g.pos, g.heading);
const dk = createDriverKart('marco', 'cruiser'); scene.add(dk.group);
const bot = makeBot(kart, track, { drift: true });

const mkCam = () => new THREE.PerspectiveCamera(62, PW / PH, 0.1, 1500);
const camNormal = mkCam(), camBack = mkCam(), camFinish = mkCam(), camIntro = mkCam();
const chase = new ChaseCamera(camNormal), chaseBack = new ChaseCamera(camBack), chaseFinish = new ChaseCamera(camFinish), chaseIntro = new ChaseCamera(camIntro);
for (const c of [chase, chaseBack, chaseFinish, chaseIntro]) c.setTarget(kart);

const labels = [];
const panelIndex = { i: 0 };
function panel(cam, label) {
  const i = panelIndex.i++, col = i % COLS, row = Math.floor(i / COLS);
  const x = col * PW, y = (ROWS - 1 - row) * PH;
  renderer.setViewport(x, y, PW, PH); renderer.setScissor(x, y, PW, PH);
  renderer.render(scene, cam);
  labels.push([col * PW, row * PH, label]);
}
function syncMesh() {
  dk.group.position.copy(kart.pos); kart.applyAttitude(dk.group);
  dk.wheels[0].rotation.y = dk.wheels[1].rotation.y = -kart.steer * 0.5;
}

const DT = 1 / 60;
const events = [];
bus.on('kart:boost', (d) => events.push(`boost ${d.kind} ${d.duration}`));
bus.on('kart:drift-level', (d) => events.push(`level ${d.level}`));
const want = { accel: false, entry: false, charged: false, boost: false, back: false, fin: false };
let frame = 0, backStart = -1, finStart = -1, driftFrames = 0;
const state = { boosting: false, drifting: false, lookBack: false, speedFrac: 0 };
for (frame = 0; frame < 60 * 60 && panelIndex.i < 6; frame++) {
  kart.update(DT, bot());
  syncMesh();
  state.boosting = kart.boost.time > 0.05; state.drifting = kart.drift.active; state.speedFrac = kart.speed / kart.params.top;
  chase.update(DT, state); chaseFinish.update(DT, state);
  state.lookBack = true; chaseBack.update(DT, state); state.lookBack = false;
  if (!want.accel && frame === 200) { want.accel = true; panel(camNormal, '1  accelerating on the straight'); }
  if (kart.drift.active) driftFrames++; else if (!kart.drift.active) driftFrames = 0;
  if (!want.entry && driftFrames === 24) { want.entry = true; panel(camNormal, '2  drift swing (charging)'); }
  if (!want.charged && kart.drift.level >= 2 && driftFrames > 60) { want.charged = true; panel(camNormal, `3  drift level ${kart.drift.level}`); }
  if (!want.boost && want.charged && kart.boost.time > 0.75 && !kart.drift.active) { want.boost = true; panel(camNormal, '4  mini-turbo boost: FOV kick'); backStart = frame; }
  if (want.boost && !want.back && frame === backStart + 20) { want.back = true; panel(camBack, '5  look back'); finStart = frame; chaseFinish.startFinish(kart); }
  if (want.back && !want.fin && frame === finStart + 150) { want.fin = true; panel(camFinish, '6  finish orbit'); }
}

for (const [x, y, text] of labels) {
  const d = document.createElement('div');
  d.textContent = text;
  d.style.cssText = `position:fixed;left:${x + 8}px;top:${y + 6}px;color:#fff;font:600 15px system-ui;text-shadow:0 1px 3px #000,0 0 6px #000;pointer-events:none`;
  document.getElementById('ui-root').appendChild(d);
}
console.log('events:', events.join(', '), 'frames', frame);
window.__ready = true;
