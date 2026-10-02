// Screenshot demo: photo decoration on a real track. Set window.__DECOR = { track, quality, views:[{s,lat,back,up,ahead,lookUp,fov}] } before loading (see tools shot entry wrappers),
// or import and call runDecorDemo(). Renders each view as a tile of a 2 column grid.
import * as THREE from 'three';
import { createTrack } from '../src/track/index.js';
import { applyEnvironment } from '../src/visuals/environment.js';
import { decorateTrack } from '../src/visuals/photoDecor.js';

/** @param {{track:string, quality?:string, views:object[], time?:number}} cfg */
export async function runDecorDemo(cfg) {
  const track = createTrack(cfg.track);
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setScissorTest(true);
  const scene = new THREE.Scene();
  const env = applyEnvironment(scene, renderer, track.environment, cfg.quality ?? 'medium');
  scene.add(track.group);
  const decor = decorateTrack(scene, track, cfg.track, { quality: cfg.quality ?? 'medium' });
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2600);
  await new Promise((r) => setTimeout(r, 900));         // let photo textures decode
  const cols = 2, rows = Math.ceil(cfg.views.length / cols), tw = innerWidth / cols, th = innerHeight / rows;
  camera.aspect = tw / th;
  const v = new THREE.Vector3(), l = new THREE.Vector3();
  cfg.views.forEach((spec, i) => {
    if (spec.pos) { v.fromArray(spec.pos); l.fromArray(spec.look); } else {
      track.surfacePoint((spec.s ?? 0) - (spec.back ?? 14), spec.lat ?? 0, v); v.y += spec.up ?? 5;
      track.surfacePoint((spec.s ?? 0) + (spec.ahead ?? 30), spec.lookLat ?? spec.lat ?? 0, l); l.y += spec.lookUp ?? 1;
    }
    camera.fov = spec.fov ?? 66; camera.updateProjectionMatrix(); camera.position.copy(v); camera.lookAt(l);
    track.setViewer(camera.position);
    const t = cfg.time ?? 4;
    for (let k = 0; k < 3; k++) { track.update(1 / 60, t + k / 60); env.update(1 / 60, camera.position, v); }
    decor.update(t + i);
    const x = (i % cols) * tw, y = (rows - 1 - Math.floor(i / cols)) * th;
    renderer.setViewport(x, y, tw, th); renderer.setScissor(x, y, tw, th);
    renderer.render(scene, camera);
  });
  console.log('decor stats', JSON.stringify(decor.stats), 'draw calls last view', renderer.info.render.calls, 'tris', renderer.info.render.triangles);
  window.__ready = true;
}
