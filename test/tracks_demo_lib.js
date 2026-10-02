// Demo scene + camera helper for the tracks_* screenshots. Sky, fog and lights come from the real src/visuals/environment.js.
import * as THREE from 'three';
import { applyEnvironment } from '../src/visuals/environment.js';

/**
 * @param {import('../src/track/Track.js').Track} track
 * @param {{ shadows?: boolean }} [o]
 */
export function createDemo(track, { shadows = true } = {}) {
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(innerWidth, innerHeight, false);
  const scene = new THREE.Scene();
  const env = applyEnvironment(scene, renderer, track.environment, shadows ? 'high' : 'medium');
  scene.add(track.group);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 2600);
  track.setViewer(camera.position);
  const api = {
    renderer, scene, camera, env,
    /** Point the camera and render. spec: { pos:[x,y,z], look:[x,y,z], fov } or { s, lat, back, up, ahead, lookUp, fov } (relative to the spline). */
    view(spec) {
      const v = new THREE.Vector3(), l = new THREE.Vector3();
      if (spec.pos) { v.fromArray(spec.pos); l.fromArray(spec.look); }
      else {
        track.surfacePoint((spec.s ?? 0) - (spec.back ?? 12), spec.lat ?? 0, v); v.y += spec.up ?? 5;
        track.surfacePoint((spec.s ?? 0) + (spec.ahead ?? 30), spec.lookLat ?? spec.lat ?? 0, l); l.y += spec.lookUp ?? 1;
      }
      camera.fov = spec.fov ?? 62; camera.updateProjectionMatrix(); camera.position.copy(v);
      camera.up.set(0, spec.topDown ? 0 : 1, spec.topDown ? -1 : 0); camera.lookAt(l);
      const follow = spec.pos ? l : v.clone().lerp(l, 0.35);
      // aerial shots: no fog, rain or cloud sprites so the whole layout is readable
      const fog = scene.fog, near = fog.near, far = fog.far;
      if (spec.aerial) { fog.near = 1e5; fog.far = 2e5; }
      env.group.traverse((o) => { if (o.name === 'rain' || o.isSprite) o.visible = !spec.aerial; });
      const t = spec.time ?? 3.3;
      for (let k = 0; k < 3; k++) { track.update(1 / 60, t + k / 60); env.update(1 / 60, camera.position, follow); }
      renderer.info.reset();
      renderer.render(scene, camera);
      fog.near = near; fog.far = far;
    },
  };
  return api;
}
