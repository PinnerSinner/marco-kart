// Item contact sheet: 10 items + item box on a dusk backdrop.
import * as THREE from 'three';
import { createStage, renderTiles, done } from './visuals_stage.js';
import { createItemMesh, createItemBoxMesh } from '../src/visuals/factory.js';
import { ITEM_IDS } from '../src/core/config.js';

const stage = createStage({ bg: 0x2c3a66 });
stage.floor.material.color.setHex(0x3a4a80);
const list = [...ITEM_IDS.map((id) => createItemMesh(id)), createItemBoxMesh()];
const tiles = [];
list.forEach((m, i) => {
  m.position.set(i * 10, 0.9, 0);
  stage.scene.add(m);
  m.userData.update(1.3 + i * 0.37, 1);
  const col = i % 4, row = Math.floor(i / 4);
  tiles.push({ rect: [col * 0.25, row * 0.3333, 0.25, 0.3333], pos: [i * 10 + 0.4, 1.4, 3.3], look: [i * 10, 0.9, 0], fov: 30 });
});
renderTiles(stage, tiles);
done();
