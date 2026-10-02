// Entry bundled by test/tracks_shoot.mjs: builds a track and exposes window.__view(spec) for multi-view screenshots.
// Also runs standalone under tools/shot.mjs (renders the start straight).
import * as THREE from 'three';
import { createTrack, registerTrack } from '../src/track/index.js';
import { fixtureDef } from './tracks_fixture.js';
import exampleRibbon from '../src/track/tracks/example_ribbon.js';
import { createDriverKart } from '../src/visuals/factory.js';
import { createDemo } from './tracks_demo_lib.js';

const id = window.__TRACK_ID__ ?? 'copacabana';
registerTrack('fixture', fixtureDef);
registerTrack('ribbon', exampleRibbon);
const t0 = performance.now();
const track = createTrack(id);
console.log(`[demo] built ${id} in ${(performance.now() - t0).toFixed(0)} ms, length ${track.length.toFixed(0)} m`);
const demo = createDemo(track, { shadows: window.__SHADOWS__ !== false });
if (window.__KARTS__ !== false) {
  const chars = ['marco', 'subnet', 'lambda', 'packet', 'carlos', 'tilly', 'rex', 'biscuit'];
  for (let i = 0; i < 8; i++) {
    const slot = track.gridSlot(i), dk = createDriverKart(chars[i], ['cruiser', 'buggy', 'hauler', 'rocket'][i % 4]);
    dk.group.position.copy(slot.pos); dk.group.rotation.y = slot.heading; demo.scene.add(dk.group);
  }
}
window.__track = track; window.__demo = demo; window.THREE = THREE;
const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
/** Triangles + meshes actually in the view frustum, by mesh-name prefix (for perf budgeting). */
function breakdown() {
  demo.camera.updateMatrixWorld(); pm.multiplyMatrices(demo.camera.projectionMatrix, demo.camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
  const by = {};
  demo.scene.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh) || !o.visible) return;
    let p = o.parent, vis = true; while (p) { if (!p.visible) vis = false; p = p.parent; } if (!vis) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    if (!o.isInstancedMesh && !frustum.intersectsSphere(sph)) return;
    if (o.isInstancedMesh && o.boundingSphere && !frustum.intersectsSphere(sph.copy(o.boundingSphere).applyMatrix4(o.matrixWorld))) return;
    const k = o.name.replace(/:.*$/, '') || ('~' + (o.parent?.name || o.parent?.type) + '.' + o.type), n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    by[k] = by[k] ?? [0, 0]; by[k][0]++; by[k][1] += n;
  });
  return Object.entries(by).sort((a, b) => b[1][1] - a[1][1]).slice(0, 9).map(([k, v]) => `${k}:${v[0]}/${Math.round(v[1] / 1000)}k`).join(' ');
}
window.__view = (spec) => { demo.view(spec); return demo.renderer.info.render.calls + ' calls, ' + demo.renderer.info.render.triangles + ' tris | ' + breakdown(); };
demo.view({ s: 0, back: 14, up: 5, ahead: 40, lookUp: 0 });
window.__ready = true;
