// Every skyKind: day, overcast, dusk, indoor, space (with a kart in front for scale) rendered through the post chain.
import * as THREE from 'three';
import { createStage, renderTiles, done } from './visuals_stage.js';
import { applyEnvironment } from '../src/visuals/environment.js';
import { createPostFX } from '../src/visuals/postfx.js';
import { createDriverKart } from '../src/visuals/karts.js';

const base = { fogNear: 120, fogFar: 600, sunColor: 0xfff2d6, ambientColor: 0x9fc4ff };
const ENVS = {
  day: { ...base, skyKind: 'day', skyTop: 0x2f8cff, skyBottom: 0xbfe6ff, fogColor: 0xc6e6ff, sunDir: new THREE.Vector3(0.5, 0.75, 0.4).normalize(), sunIntensity: 2.4, ambientIntensity: 0.9, clouds: 0.55 },
  overcast: { ...base, skyKind: 'overcast', skyTop: 0x7c8794, skyBottom: 0xb9c2cb, fogColor: 0xaab4bf, sunDir: new THREE.Vector3(-0.3, 0.8, 0.3).normalize(), sunColor: 0xdfe6f0, sunIntensity: 1.5, ambientIntensity: 1.2, clouds: 0.95, rain: 0.9 },
  dusk: { ...base, skyKind: 'dusk', skyTop: 0x2a1f5c, skyBottom: 0xff8a5c, fogColor: 0xd9827a, sunDir: new THREE.Vector3(0.75, 0.12, 0.4).normalize(), sunColor: 0xffb070, sunIntensity: 2.0, ambientColor: 0x8f78d0, ambientIntensity: 0.8, clouds: 0.5, stars: true },
  indoor: { ...base, skyKind: 'indoor', skyTop: 0x050a1c, skyBottom: 0x0a1430, fogColor: 0x081026, fogNear: 40, fogFar: 260, sunDir: new THREE.Vector3(0.1, 1, 0.2).normalize(), sunColor: 0x9fd8ff, sunIntensity: 1.3, ambientColor: 0x3a5fd0, ambientIntensity: 0.9 },
  space: { ...base, skyKind: 'space', skyTop: 0x04030f, skyBottom: 0x12083a, fogColor: 0x0a0620, fogNear: 300, fogFar: 1400, sunDir: new THREE.Vector3(-0.4, 0.5, 0.6).normalize(), sunColor: 0xd6c8ff, sunIntensity: 1.8, ambientColor: 0x6a58d0, ambientIntensity: 0.8, stars: true },
};

const stage = createStage({ bg: 0x000000, fov: 55 });
const { scene, camera, renderer } = stage;
stage.floor.visible = false;
scene.children.filter((c) => c.name === 'preview-lights').forEach((c) => scene.remove(c));
const names = Object.keys(ENVS);
const grid = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 40, 40), new THREE.MeshStandardMaterial({ color: 0x33384a, roughness: 1 }));
grid.rotation.x = -Math.PI / 2; scene.add(grid);
const kart = createDriverKart('marco', 'cruiser');
kart.group.rotation.y = 2.6;
scene.add(kart.group);
camera.position.set(-2.6, 2.3, -5.6);
camera.lookAt(0, 2.4, 6);
const W = innerWidth, H = innerHeight;
const cols = 3;
renderer.setSize(W, H, false);
const post = createPostFX(renderer, scene, camera, 'medium');
// render each env into its own tile via scissor on the composer output: simplest is one full-res render per env, downscaled by CSS-free canvas draws
const tileCanvas = document.createElement('canvas');
tileCanvas.width = W; tileCanvas.height = H;
const tctx = tileCanvas.getContext('2d');
const tw = Math.floor(W / cols), th = Math.floor(H / 2);
names.forEach((name, i) => {
  const env = applyEnvironment(scene, renderer, ENVS[name], 'high');
  for (let f = 0; f < 3; f++) env.update(0.5, camera.position, kart.group.position);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  post.render(0.016);
  const c = i % cols, r = Math.floor(i / cols);
  tctx.drawImage(renderer.domElement, c * tw, r * th, tw, th);
  env.dispose();
});
// show the composite by drawing it back onto the WebGL canvas' parent overlay
tileCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:5';
document.body.appendChild(tileCanvas);
done();
