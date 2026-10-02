// Shared helper for visuals demos: renderer + studio scene + small layout utilities. Not a test file.
import * as THREE from 'three';
import { addPreviewLights } from '../src/visuals/preview.js';

/**
 * @param {{bg?: number, fov?: number, shadows?: boolean}} [o]
 */
export function createStage(o = {}) {
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(o.bg ?? 0x8fb6e8);
  addPreviewLights(scene);
  const camera = new THREE.PerspectiveCamera(o.fov ?? 35, innerWidth / innerHeight, 0.1, 500);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshBasicMaterial({ color: o.floor ?? 0x6b86b3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);
  return { renderer, scene, camera, floor };
}

/** Place objects on a grid centred on the origin. Returns bounds info. */
export function layoutGrid(objects, cols, dx, dz) {
  const rows = Math.ceil(objects.length / cols);
  objects.forEach((obj, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    obj.position.x = (c - (cols - 1) / 2) * dx;
    obj.position.z = (r - (rows - 1) / 2) * dz;
  });
  return { rows, cols, width: cols * dx, depth: rows * dz };
}

export function done() {
  window.__ready = true;
}

/**
 * Render several camera tiles into one canvas.
 * @param {{renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera}} stage
 * @param {{rect: number[], pos: number[], look: number[], fov?: number}[]} tiles rect = [x, y, w, h] normalised (origin top-left)
 */
export function renderTiles({ renderer, scene, camera }, tiles) {
  const W = innerWidth, H = innerHeight;
  renderer.setScissorTest(true);
  renderer.autoClear = false;
  renderer.clear();
  for (const t of tiles) {
    const x = Math.round(t.rect[0] * W), w = Math.round(t.rect[2] * W), h = Math.round(t.rect[3] * H);
    const y = H - Math.round(t.rect[1] * H) - h;
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    camera.aspect = w / h;
    camera.fov = t.fov ?? 32;
    camera.position.set(t.pos[0], t.pos[1], t.pos[2]);
    camera.lookAt(t.look[0], t.look[1], t.look[2]);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  renderer.setScissorTest(false);
}
