// All eight characters in their karts: front view, plus an expression strip.
import * as THREE from 'three';
import { createStage, renderTiles, done } from './visuals_stage.js';
import { createDriverKart } from '../src/visuals/karts.js';
import { CHARACTERS } from '../src/core/roster.js';

const stage = createStage({ bg: 0x9cc4f0 });
const { scene } = stage;
const kartFor = ['cruiser', 'buggy', 'hauler', 'rocket', 'buggy', 'cruiser', 'hauler', 'buggy'];
const tiles = [];
CHARACTERS.forEach((c, i) => {
  const k = createDriverKart(c.id, kartFor[i]);
  k.group.position.set(i * 20, 0, 0);
  k.group.rotation.y = 0.45;
  scene.add(k.group);
  const col = i % 4, row = Math.floor(i / 4);
  tiles.push({ rect: [col * 0.25, row * 0.5, 0.25, 0.5], pos: [i * 20 + 1.2, 3.1, 6.6], look: [i * 20, 1.55, 0], fov: 30 });
});
stage.renderer.setClearColor(0x9cc4f0);
renderTiles(stage, tiles);
done();
