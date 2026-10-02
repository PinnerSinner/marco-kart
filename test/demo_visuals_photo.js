// Marco photo + custom rival: synthesised stand-in "photos" injected via window.__MK_ASSETS__ (nothing written to assets/user).
import { createStage, renderTiles, done } from './visuals_stage.js';
import { createCharacterMesh } from '../src/visuals/characters.js';

function fakePhoto(skin, hair) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8fb8d8'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = hair; g.beginPath(); g.ellipse(128, 100, 78, 84, 0, 0, 7); g.fill();
  g.fillStyle = skin; g.beginPath(); g.ellipse(128, 130, 64, 78, 0, 0, 7); g.fill();
  g.fillStyle = '#222'; g.beginPath(); g.ellipse(104, 116, 7, 9, 0, 0, 7); g.ellipse(152, 116, 7, 9, 0, 0, 7); g.fill();
  g.strokeStyle = '#7a2b2b'; g.lineWidth = 5; g.beginPath(); g.arc(128, 150, 28, 0.2, Math.PI - 0.2); g.stroke();
  return c.toDataURL('image/png');
}
window.__MK_ASSETS__ = {
  marco_face: fakePhoto('#e2b48f', '#3a2a20'),
  custom_rival_face: fakePhoto('#c98a5e', '#111'),
  custom_rival_name: 'data:text/plain;base64,' + btoa('Uncle Dave'),
};
(async () => {
const stage = createStage({ bg: 0x9cc4f0 });
const tiles = [];
['marco', 'biscuit'].forEach((id, i) => {
  const g = createCharacterMesh(id);
  g.position.set(i * 10, 0, 0); g.rotation.y = 0.3;
  stage.scene.add(g);
  tiles.push({ rect: [i * 0.5, 0, 0.5, 1], pos: [i * 10 + 0.5, 1.05, 3.4], look: [i * 10, 1.0, 0], fov: 24 });
});
await new Promise((r) => setTimeout(r, 1500));
renderTiles(stage, tiles);
done();
})();
