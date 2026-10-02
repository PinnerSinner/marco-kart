// 8 racers on the StubTrack mid-drift with sparks, boost, items, invincibility, shield, shrink, spin, grass spray.
import * as THREE from 'three';
import { createStage, renderTiles, done } from './visuals_stage.js';
import { MockRace, bus } from './visuals_mock.js';
import { RaceView } from '../src/visuals/RaceView.js';
import { CFG } from '../src/core/config.js';

const stage = createStage({ bg: 0x8fc8ff });
const { scene, camera, renderer } = stage;
stage.floor.visible = false;
const race = new MockRace();
const track = race.track;
scene.add(track.group);
scene.fog = new THREE.Fog(track.environment.fogColor, 150, 700);
const view = new RaceView({ scene, camera, race, track, quality: 'high' });

// drive a few seconds so karts are in motion around the first corner
const P = race.player;
for (let i = 0; i < 60 * 4.5; i++) {
  race.step();
  view.snapshot();
  view.update(CFG.fixedDt, 1);
  if (i === 5) {
    bus.emit('kart:boost', { id: race.racers[1].id, kind: 'item', power: 1, duration: 3 });
    race.racers[1].kart.boost.time = 3; race.racers[1].kart.boost.power = 1;
    bus.emit('kart:boost', { id: race.racers[2].id, kind: 'fibre', power: 1.6, duration: 3 });
    race.racers[2].kart.boost.time = 3; race.racers[2].kart.boost.power = 1.6;
    race.racers[4].kart.boost.time = 3; bus.emit('kart:boost', { id: race.racers[4].id, kind: 'pad', power: 1, duration: 3 });
    race.racers[6].shield = true;
    race.racers[7].kart.status.stun = 8; race.racers[7].kart.scale = 0.6;
  }
  race.racers[3].kart.status.invincible = 5;
  // scripted drift state on the player
  const k = P.kart;
  const t = i / 60;
  k.drift.active = t > 1.2; k.drift.dir = 1; k.drift.level = t < 2.2 ? 1 : t < 3.4 ? 2 : 3;
  k.slip = 0.7;
  if (i === 72) bus.emit('kart:drift-start', { id: P.id, dir: 1 });
  if (i === 132) bus.emit('kart:drift-level', { id: P.id, level: 2 });
}
// dummy items
race.addEntity('ping', new THREE.Vector3(P.kart.pos.x + 6, 0.8, P.kart.pos.z + 20), new THREE.Vector3(0, 0, 30), 0);
race.addEntity('traceroute', new THREE.Vector3(P.kart.pos.x - 8, 0.8, P.kart.pos.z + 14), new THREE.Vector3(0, 0, 25), 0);
race.addEntity('cable', new THREE.Vector3(P.kart.pos.x + 3, 0.6, P.kart.pos.z + 34), new THREE.Vector3(), 0.4);
race.addEntity('kernel_panic', new THREE.Vector3(P.kart.pos.x - 3, 1.5, P.kart.pos.z + 44), new THREE.Vector3(0, 0, 20), 0);
race.addEntity('cable', new THREE.Vector3(P.kart.pos.x - 6, 0.6, P.kart.pos.z + 60), new THREE.Vector3(), 1.2);
for (let i = 0; i < 4; i++) { view.update(CFG.fixedDt, 1); }

const kp = P.kart.pos;
const yaw = P.kart.yaw;
const fx = Math.sin(yaw), fz = Math.cos(yaw);
const tiles = [
  { rect: [0, 0, 0.6, 1], pos: [kp.x - fx * 7.5 + 1.5, kp.y + 3.3, kp.z - fz * 7.5], look: [kp.x + fx * 5, kp.y + 0.8, kp.z + fz * 5], fov: 62 },
  { rect: [0.6, 0, 0.4, 0.5], pos: [kp.x + fx * 9 - 4, kp.y + 3.2, kp.z + fz * 9 + 4], look: [kp.x, kp.y + 0.8, kp.z], fov: 42 },
  { rect: [0.6, 0.5, 0.4, 0.5], pos: [kp.x - 26, kp.y + 22, kp.z - 26], look: [kp.x + fx * 12, kp.y, kp.z + fz * 12], fov: 46 },
];
camera.position.set(...tiles[0].pos);
view.update(0.0001, 1);
renderTiles(stage, tiles);
window.__view = view;
done();
