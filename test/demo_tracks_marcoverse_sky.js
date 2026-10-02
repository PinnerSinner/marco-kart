// Marcoverse space sky from six camera directions (forward, back, left, right, up, down) through the real post chain.
//   node tools/shot.mjs test/demo_tracks_marcoverse_sky.js shots/tracks/marcoverse-sky.png --w 1500 --h 840 --wait 20000
import * as THREE from 'three';
import { applyEnvironment } from '../src/visuals/environment.js';
import { createPostFX } from '../src/visuals/postfx.js';
import marcoverse from '../src/track/tracks/marcoverse.js';

const def = marcoverse();
const env = { ...def.environment, sunDir: new THREE.Vector3(...def.environment.sunDir).normalize() };
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
const W = innerWidth, H = innerHeight, cols = 3, rows = 2, tw = Math.floor(W / cols), th = Math.floor(H / rows);
renderer.setSize(tw, th, false);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, tw / th, 0.3, 2600);
const e = applyEnvironment(scene, renderer, env, 'high');
const post = createPostFX(renderer, scene, camera, 'high');
post.setSize(tw, th);
const tile = document.createElement('canvas'); tile.width = W; tile.height = H;
const ctx = tile.getContext('2d');
const dirs = [[0, 0.12, 1], [0, 0.12, -1], [-1, 0.12, 0], [1, 0.12, 0], [0.3, 1, 0.3], [0.1, -1, 0.15]];
dirs.forEach((d, i) => {
  camera.position.set(0, 0, 0); camera.up.set(0, 1, 0);
  if (Math.abs(d[1]) > 0.9) camera.up.set(0, 0, 1);
  camera.lookAt(d[0], d[1], d[2]);
  e.update(0.5, camera.position, camera.position);
  post.render(0.016);
  ctx.drawImage(renderer.domElement, (i % cols) * tw, Math.floor(i / cols) * th, tw, th);
});
tile.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:5';
document.body.appendChild(tile);
window.__ready = true;
