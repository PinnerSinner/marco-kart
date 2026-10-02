// Scene + camera driver for the Marcoverse Speedway screenshots (bundled by test/demo_tracks_marcoverse_shoot.js, or run alone under tools/shot.mjs).
// Sky, fog and lights come from src/visuals/environment.js; the image goes through the real post chain (bloom, grade) like the game does.
import * as THREE from 'three';
import { createTrack } from '../src/track/index.js';
import { Assets } from '../src/core/assets.js';
import { applyEnvironment } from '../src/visuals/environment.js';
import { createPostFX } from '../src/visuals/postfx.js';
import { createDriverKart } from '../src/visuals/factory.js';

async function main() {
  await Promise.all(['marco_face', 'logo_marcoverse'].map((k) => Assets.image(k)));   // the game preloads these; the track also upgrades late
  const t0 = performance.now();
  const track = createTrack('marcoverse');
  console.log(`[demo] built marcoverse in ${(performance.now() - t0).toFixed(0)} ms, length ${track.length.toFixed(0)} m, faces ${Assets.has('marco_face')}`);

  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight, false);
  const scene = new THREE.Scene();
  const env = applyEnvironment(scene, renderer, track.environment, 'high');
  scene.add(track.group);
  const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.3, 2600);
  track.setViewer(camera.position);
  const post = createPostFX(renderer, scene, camera, window.__PLAIN__ ? 'low' : 'high');
  post.setSize(innerWidth, innerHeight);

  const chars = ['marco', 'subnet', 'lambda', 'packet', 'carlos', 'tilly', 'rex', 'biscuit'];
  const grid = [];
  if (window.__KARTS__ !== false) {
    for (let i = 0; i < 8; i++) {
      const slot = track.gridSlot(i), dk = createDriverKart(chars[i], ['cruiser', 'buggy', 'hauler', 'rocket'][i % 4]);
      dk.group.position.copy(slot.pos); dk.group.rotation.y = slot.heading; scene.add(dk.group); grid.push(dk);
    }
  }
  const hero = createDriverKart('marco', 'rocket'); scene.add(hero.group); hero.group.visible = false;
  const sm = {}, m4 = new THREE.Matrix4(), v = new THREE.Vector3(), l = new THREE.Vector3(), p3 = new THREE.Vector3();

  /** Put the hero kart on the road at (s, lateral) with the road's attitude. */
  function placeHero(s, lat) {
    track.sample(s, sm); track.surfacePoint(s, lat, p3);
    const up = sm.up, f = sm.tangent, r = new THREE.Vector3().crossVectors(up, f).normalize();
    const f2 = new THREE.Vector3().crossVectors(r, up);
    m4.makeBasis(r, up, f2);
    hero.group.quaternion.setFromRotationMatrix(m4); hero.group.position.copy(p3); hero.group.visible = true;
  }

  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  /** Triangles and draw calls per mesh-name prefix inside the view frustum (perf budgeting). */
  function breakdown() {
    camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    const by = {};
    scene.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh || o.isPoints) || !o.visible) return;
      let p = o.parent, vis = true; while (p) { if (!p.visible) vis = false; p = p.parent; } if (!vis) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      if (o.frustumCulled !== false) { sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); if (o.isInstancedMesh && o.boundingSphere) sph.copy(o.boundingSphere).applyMatrix4(o.matrixWorld); if (!frustum.intersectsSphere(sph)) return; }
      const k = o.name.replace(/:.*$/, '') || ('~' + (o.parent?.name || o.parent?.type) + '.' + o.type);
      const n = ((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
      by[k] = by[k] ?? [0, 0]; by[k][0]++; by[k][1] += n;
    });
    return Object.entries(by).sort((a, b) => b[1][1] - a[1][1]).slice(0, 8).map(([k, x]) => `${k}:${x[0]}/${Math.round(x[1] / 1000)}k`).join(' ');
  }

  /** Render one view. spec: { s, lat, back, up, ahead, lookUp, fov, time, kart } chase view along the spline, or { pos, look, fov } free camera. */
  window.__view = (spec) => {
    if (spec.pos) { v.fromArray(spec.pos); l.fromArray(spec.look); }
    else {
      track.surfacePoint((spec.s ?? 0) - (spec.back ?? 12), spec.lat ?? 0, v); v.y += spec.up ?? 5;
      track.surfacePoint((spec.s ?? 0) + (spec.ahead ?? 30), spec.lookLat ?? spec.lat ?? 0, l); l.y += spec.lookUp ?? 1;
    }
    hero.group.visible = false;
    if (!spec.pos && spec.kart !== false) placeHero(spec.s ?? 0, spec.lat ?? 0);
    camera.fov = spec.fov ?? 66; camera.updateProjectionMatrix(); camera.position.copy(v);
    camera.up.set(0, spec.topDown ? 0 : 1, spec.topDown ? -1 : 0); camera.lookAt(l);
    const t = spec.time ?? 3.3;
    for (let k = 0; k < 3; k++) { track.update(1 / 60, t + k / 60); env.update(1 / 60, camera.position, v); }
    renderer.info.reset();
    renderer.render(scene, camera);
    const info = `${renderer.info.render.calls} calls, ${renderer.info.render.triangles} tris | ${breakdown()}`;
    post.render(1 / 60);
    return info;
  };
  window.__track = track; window.THREE = THREE;
  window.__view({ s: 0, back: 16, up: 5, ahead: 60, lookUp: 1 });
  window.__ready = true;

}
main();
