// Biscuit contact sheet: the four exclusive items + stink cloud + bark rings + hydrant + paw prints + Biscuit's face.
import * as THREE from 'three';
import { createStage, renderTiles, done } from './visuals_stage.js';
import { createItemMesh, createCharacterMesh } from '../src/visuals/factory.js';
import { createHydrant, PawPrints } from '../src/visuals/easterEggs.js';

const stage = createStage({ bg: 0x2c3a66 });
stage.floor.material.color.setHex(0x3a4a80);
const list = [createItemMesh('poo'), createItemMesh('woof'), createItemMesh('zoomies'), createItemMesh('fetch'), createItemMesh('stink'), createHydrant(), createCharacterMesh('biscuit', { expression: 'boost' })];
const tiles = [];
list.forEach((m, i) => {
  m.position.set(i * 10, i === 5 ? 0 : 0.9, 0);
  if (i === 1) m.scale.setScalar(2.2);
  if (i === 4) m.scale.setScalar(3);
  stage.scene.add(m);
  m.userData?.update?.(1.3 + i * 0.37, 1);
  const col = i % 4, row = Math.floor(i / 4);
  tiles.push({ rect: [col * 0.25, row * 0.5, 0.25, 0.5], pos: [i * 10 + 0.4, 2.2, 5.2], look: [i * 10, 0.9, 0], fov: 32 });
});
const paws = new PawPrints(8); stage.scene.add(paws.mesh);
for (let i = 0; i < 6; i++) paws.stamp(60 + i * 0.4, 0, 3 + (i % 2) * 0.5, 0.2);
paws.update(0.5);
renderTiles(stage, tiles);
done();
