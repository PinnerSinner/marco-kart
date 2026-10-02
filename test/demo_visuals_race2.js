// Full pipeline: environment + postfx + RaceView on the StubTrack, driver's-eye chase view mid-drift, boost, items.
import * as THREE from 'three';
import { createStage, done } from './visuals_stage.js';
import { MockRace, bus } from './visuals_mock.js';
import { RaceView } from '../src/visuals/RaceView.js';
import { applyEnvironment } from '../src/visuals/environment.js';
import { createPostFX } from '../src/visuals/postfx.js';
import { CFG } from '../src/core/config.js';

const stage = createStage({ bg: 0x8fc8ff, fov: 68 });
const { scene, camera, renderer } = stage;
scene.children.filter((c) => c.name === 'preview-lights').forEach((c) => scene.remove(c));
stage.floor.visible = false;
const race = new MockRace();
const track = race.track;
scene.add(track.group);
const env = applyEnvironment(scene, renderer, track.environment, 'high');
const post = createPostFX(renderer, scene, camera, 'high');
const view = new RaceView({ scene, camera, race, track, quality: 'high' });
const P = race.player;
race.racers[1].kart.boost.time = 30; race.racers[1].kart.boost.power = 1;
bus.emit('kart:boost', { id: race.racers[1].id, kind: 'item', power: 1, duration: 30 });
race.racers[2].kart.boost.time = 30; race.racers[2].kart.boost.power = 1.6;
bus.emit('kart:boost', { id: race.racers[2].id, kind: 'fibre', power: 1.6, duration: 30 });
race.racers[3].kart.status.invincible = 30;
race.racers[6].shield = true;
race.racers[7].kart.status.stun = 30; race.racers[7].kart.scale = 0.6;
for (let i = 0; i < 60 * 5; i++) {
  race.step(); view.snapshot(); view.update(CFG.fixedDt, 1);
  const k = P.kart, t = i / 60;
  k.drift.active = t > 1.2; k.drift.dir = 1; k.drift.level = t < 2.2 ? 1 : t < 3.4 ? 2 : 3; k.slip = 0.7;
  race.racers[3].kart.status.invincible = 30;
  if (i === 72) bus.emit('kart:drift-start', { id: P.id, dir: 1 });
  if (i === 132) bus.emit('kart:drift-level', { id: P.id, level: 2 });
  if (i === 204) bus.emit('kart:drift-level', { id: P.id, level: 3 });
  race.racers[4].kart.status.spin = i > 60 * 4 ? 1 : 0;
}
race.addEntity('ping', new THREE.Vector3(P.kart.pos.x + 6, 0.8, P.kart.pos.z + 22), new THREE.Vector3(0, 0, 30), 0);
race.addEntity('traceroute', new THREE.Vector3(P.kart.pos.x - 8, 0.8, P.kart.pos.z + 16), new THREE.Vector3(0, 0, 25), 0);
race.addEntity('cable', new THREE.Vector3(P.kart.pos.x + 3, 0.6, P.kart.pos.z + 40), new THREE.Vector3(), 0.4);
for (let i = 0; i < 6; i++) { race.step(); view.snapshot(); view.update(CFG.fixedDt, 1); }
const kp = P.kart.pos, yaw = P.kart.yaw;
const fx = Math.sin(yaw), fz = Math.cos(yaw);
camera.position.set(kp.x - fx * 7.2 + Math.cos(yaw) * 0.0, kp.y + 3.2, kp.z - fz * 7.2);
camera.lookAt(kp.x + fx * 6, kp.y + 1.0, kp.z + fz * 6);
post.setBoost(0.6); post.setSpeedLines(0.6);
for (let i = 0; i < 40; i++) { view.update(0.016, 1); env.update(0.016, camera.position, kp); }
post.render(0.016);
window.__view = view;
done();
