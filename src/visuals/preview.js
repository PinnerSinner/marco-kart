// Studio lighting + backdrop for character / kart previews (UI turntables, screenshots). Works with any scene.
import * as THREE from 'three';

/**
 * Add a warm key, cool fill, hemisphere ambient and a soft rim light suited to the toon materials.
 * @param {THREE.Scene} scene
 * @param {{key?: number, fill?: number}} [o] intensity multipliers
 * @returns {{group: THREE.Group, dispose: () => void}}
 */
export function addPreviewLights(scene, o = {}) {
  const g = new THREE.Group();
  g.name = 'preview-lights';
  const key = new THREE.DirectionalLight(0xfff0d8, 2.6 * (o.key ?? 1));
  key.position.set(3.5, 6, 5);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 1.1 * (o.fill ?? 1));
  rim.position.set(-5, 3, -4);
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x6a5a7a, 1.15 * (o.fill ?? 1));
  g.add(key, rim, hemi);
  scene.add(g);
  return { group: g, dispose: () => scene.remove(g) };
}
