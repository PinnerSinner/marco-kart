// Expression grid: 4 characters x 5 expressions (chosen via the CHARS list below).
import { createStage, renderTiles, done } from './visuals_stage.js';
import { createCharacterMesh } from '../src/visuals/characters.js';
import { EXPRESSIONS } from '../src/visuals/faces.js';

const CHARS = ['marco', 'subnet', 'lambda', 'packet'];
const stage = createStage({ bg: 0x9cc4f0 });
const tiles = [];
CHARS.forEach((id, r) => {
  EXPRESSIONS.forEach((ex, c) => {
    const g = createCharacterMesh(id, { expression: ex });
    const n = r * 5 + c;
    g.position.set(n * 10, 0, 0); g.rotation.y = 0.25;
    stage.scene.add(g);
    const hy = 1.0;
    tiles.push({ rect: [c * 0.2, r * 0.25, 0.2, 0.25], pos: [n * 10 + 0.4, hy + 0.05, 2.6], look: [n * 10, hy, 0], fov: 22 });
  });
});
renderTiles(stage, tiles);
done();
