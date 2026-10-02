// Reference demo: how to render a scene for tools/shot.mjs
import * as THREE from 'three';
import { StubTrack } from '../src/track/StubTrack.js';
import { createDriverKart } from '../src/visuals/factory.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const track = new StubTrack();
const env = track.environment;
scene.background = new THREE.Color(env.skyBottom);
scene.fog = new THREE.Fog(env.fogColor, env.fogNear, env.fogFar);
scene.add(track.group);
const sun = new THREE.DirectionalLight(env.sunColor, env.sunIntensity); sun.position.copy(env.sunDir).multiplyScalar(100); scene.add(sun);
scene.add(new THREE.AmbientLight(env.ambientColor, env.ambientIntensity));
const slot = track.gridSlot(0);
const dk = createDriverKart('marco', 'cruiser');
dk.group.position.copy(slot.pos); dk.group.rotation.y = slot.heading; scene.add(dk.group);
const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1500);
cam.position.copy(slot.pos).add(new THREE.Vector3(0, 4.5, -9)); cam.lookAt(slot.pos);
renderer.render(scene, cam);
window.__ready = true;
