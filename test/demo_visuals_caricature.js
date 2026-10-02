// Screenshot demo: caricature art (and the photo props) on a real track. Renders each view as a tile of a 2 column grid.
//   views: [{ s, lat, back, up, ahead, lookUp, fov }]  or  pick: ['board','statue',...] (a camera is placed in front of the first item of each kind)
import * as THREE from 'three';
import { createTrack } from '../src/track/index.js';
import { applyEnvironment } from '../src/visuals/environment.js';
import { decorateTrack } from '../src/visuals/photoDecor.js';
import { decorateCaricature } from '../src/visuals/caricatureDecor.js';

/** @param {{track:string, quality?:string, views?:object[], pick?:string[], skip?:number, time?:number, photos?:boolean, cols?:number}} cfg */
export async function runCaricatureDemo(cfg) {
  const track = createTrack(cfg.track);
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setScissorTest(true);
  const scene = new THREE.Scene();
  const env = applyEnvironment(scene, renderer, track.environment, cfg.quality ?? 'medium');
  scene.add(track.group);
  const photos = cfg.photos === false ? null : decorateTrack(scene, track, cfg.track, { quality: cfg.quality ?? 'medium' });
  const cari = decorateCaricature(scene, track, cfg.track, { quality: cfg.quality ?? 'medium', mode: cfg.mode ?? 'auto' });
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2600);
  await cari.ready;
  await new Promise((r) => setTimeout(r, 1200));         // let textures decode
  const views = cfg.views ?? [];
  const counts = {};
  for (const kind of cfg.pick ?? []) {
    if (kind.startsWith('drive@')) { views.push({ s: +kind.slice(6), back: 7, up: 3.6, ahead: 34, lookUp: 1.4, fov: 72, label: kind }); continue; }
    const list = (cari.plan?.items ?? []).filter((i) => i.type === kind);
    const it = list[Math.min(list.length - 1, (cfg.skip ?? 0))];
    if (!it) { console.log('no item of kind', kind); continue; }
    counts[kind] = list.length;
    const flatKind = ['sticker', 'hopscotch', 'finish', 'kerb'].includes(kind);
    const lat = it.lateral ?? 0;
    views.push(flatKind
      ? { s: it.s, lat: lat * 0.3, back: 11, up: 2.4, ahead: 6, lookLat: lat, lookUp: 0, fov: 62, label: kind }
      : kind === 'wall' ? { s: it.s, lat: -Math.sign(lat) * 3, back: 9, up: 2.2, ahead: 0, lookLat: lat, lookUp: it.y0 + it.h / 2, fov: 60, label: kind }
      : { s: it.s, lat: lat * 0.3, back: kind === 'statue' ? 13 : 18, up: 3, ahead: 0, lookLat: lat, lookUp: kind === 'statue' ? 3.2 : (it.bottom ?? 0) + (it.h ?? 4) / 2, fov: 58, label: kind });
  }
  const cols = cfg.cols ?? 2, rows = Math.ceil(views.length / cols), tw = innerWidth / cols, th = innerHeight / rows;
  camera.aspect = tw / th;
  const v = new THREE.Vector3(), l = new THREE.Vector3();
  views.forEach((spec, i) => {
    if (spec.pos) { v.fromArray(spec.pos); l.fromArray(spec.look); } else {
      track.surfacePoint((spec.s ?? 0) - (spec.back ?? 14), spec.lat ?? 0, v); v.y += spec.up ?? 5;
      track.surfacePoint((spec.s ?? 0) + (spec.ahead ?? 30), spec.lookLat ?? spec.lat ?? 0, l); l.y += spec.lookUp ?? 1;
    }
    camera.fov = spec.fov ?? 66; camera.updateProjectionMatrix(); camera.position.copy(v); camera.lookAt(l);
    track.setViewer(camera.position);
    const t = cfg.time ?? 4;
    for (let k = 0; k < 3; k++) { track.update(1 / 60, t + k / 60); env.update(1 / 60, camera.position, v); }
    photos?.update(t + i); cari.update(t + i);
    const x = (i % cols) * tw, y = (rows - 1 - Math.floor(i / cols)) * th;
    renderer.setViewport(x, y, tw, th); renderer.setScissor(x, y, tw, th);
    renderer.render(scene, camera);
  });
  console.log('caricature stats', JSON.stringify(cari.stats), 'kinds', JSON.stringify(counts), 'draw calls last view', renderer.info.render.calls, 'tris', renderer.info.render.triangles);
  window.__ready = true;
}
