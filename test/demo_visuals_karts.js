// Kart sheet: each kart from a front 3/4 and a rear chase-style view (Marco driving).
import * as THREE from 'three';
import { createStage, renderTiles, done } from './visuals_stage.js';
import { createDriverKart } from '../src/visuals/karts.js';

const stage = createStage({ bg: 0x9cc4f0 });
const { scene } = stage;
const ids = ['cruiser', 'buggy', 'hauler', 'rocket'];
const charForKart = { cruiser: 'marco', buggy: 'marco', hauler: 'marco', rocket: 'marco' };
const tiles = [];
ids.forEach((id, i) => {
  const k = createDriverKart(charForKart[id], id);
  k.group.position.set(i * 20, 0, 0);
  scene.add(k.group);
  const cx = i * 20;
  const col = i % 2, row = Math.floor(i / 2);
  tiles.push({ rect: [col * 0.5, row * 0.5, 0.25, 0.5], pos: [cx + 4.6, 2.6, 5.4], look: [cx, 0.9, 0], fov: 30 });
  tiles.push({ rect: [col * 0.5 + 0.25, row * 0.5, 0.25, 0.5], pos: [cx - 3.2, 3.3, -6.6], look: [cx, 1.1, 0], fov: 30 });
});
renderTiles(stage, tiles);
done();
