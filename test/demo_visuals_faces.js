// Head close-ups. Sheet 1: all 8 neutral. Sheet 2 (expressions): set window.__SHEET before the bundle runs, see demo_visuals_expr.js
import * as THREE from 'three';
import { createStage, renderTiles, done } from './visuals_stage.js';
import { createCharacterMesh } from '../src/visuals/characters.js';
import { CHARACTERS } from '../src/core/roster.js';

const stage = createStage({ bg: 0x9cc4f0 });
const tiles = [];
CHARACTERS.forEach((c, i) => {
  const g = createCharacterMesh(c.id);
  g.position.set(i * 10, 0, 0);
  g.rotation.y = 0.3;
  stage.scene.add(g);
  const s = g.scale.x;
  const hy = 1.0 * s / 0.9 * 0.9;
  const col = i % 4, row = Math.floor(i / 4);
  tiles.push({ rect: [col * 0.25, row * 0.5, 0.25, 0.5], pos: [i * 10 + 0.5, hy + 0.05, 2.9], look: [i * 10, hy, 0], fov: 24 });
});
renderTiles(stage, tiles);
done();
