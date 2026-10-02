// Screenshot demo: caricature stickers on Marco's kart, all four kart bodies, three-quarter views from both sides.
//   node tools/shot.mjs test/demo_visuals_caricature_kart.js out.png --wait 20000 --w 1600 --h 800
import * as THREE from 'three';
import { createDriverKart } from '../src/visuals/karts.js';
import { decorateKarts } from '../src/visuals/caricatureKart.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb8e8);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(4, 8, 6); scene.add(sun);
const kv = [];
['cruiser', 'buggy', 'hauler', 'rocket'].forEach((id, i) => {
  const model = createDriverKart('marco', id);
  model.group.position.set((i - 1.5) * 4.4, 0, 0);
  scene.add(model.group);
  kv.push({ model, racer: { charId: 'marco' } });
});
const deco = decorateKarts(kv);
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 100);
setTimeout(() => {
  renderer.setScissorTest(true);
  const tw = innerWidth / 4, th = innerHeight / 2;
  camera.aspect = tw / th; camera.fov = 28; camera.updateProjectionMatrix();
  kv.forEach((k, i) => {
    const kx = k.model.group.position.x;
    for (let row = 0; row < 2; row++) {
      if (row === 0) camera.position.set(kx + 8, 1.5, 0.4); else camera.position.set(kx - 4, 2.6, -8.5);
      camera.lookAt(kx, 0.8, 0);
      const x = i * tw, y = (1 - row) * th;
      renderer.setViewport(x, y, tw, th); renderer.setScissor(x, y, tw, th);
      renderer.render(scene, camera);
    }
  });
  console.log('stickers', deco.meshes.length, kv.map((k) => k.model.group.children.filter((c) => c.userData.caricature).length).join(','));
  window.__ready = true;
}, 900);
