// Stylised people: tiny chunky figures for crowds, drummers and beach-goers. Origin at the feet, facing +Z, ~1.8 m tall.
// uv.x = per-person random phase, uv.y = height weight (0 feet .. 1 head) drive the crowd-hop shader (shaders.js applyHop).
import * as THREE from 'three';
import { Geo } from '../Geo.js';

/**
 * @param {{ shirt?:number, legs?:number, skin?:number, hair?:number, hat?:number|null, arms?:'up'|'down'|'wave', s?:number, phase?:number, drum?:boolean, dress?:boolean }} [o]
 * @returns {Geo}
 */
export function personGeo({ shirt = 0xe63946, legs = 0x2a3a6a, skin = 0xd9a066, hair = 0x3a2a1a, hat = null, arms = 'up', s = 1, phase = Math.random(), drum = false, dress = false } = {}) {
  const g = new Geo();
  if (dress) g.cyl(0.15, 0.36, 0.78, 6, { colour: legs, ao: 0.3 });
  else { g.cyl(0.075, 0.09, 0.74, 4, { x: -0.11, colour: legs, ao: 0.2 }); g.cyl(0.075, 0.09, 0.74, 4, { x: 0.11, colour: legs, ao: 0.2 }); }
  g.cyl(0.2, 0.27, 0.66, 6, { y: 0.72, colour: shirt, ao: 0.2 });
  g.sphere(0.2, { y: 1.42, colour: skin, ao: 0 }, 6, 4);
  g.sphere(0.215, { y: 1.55, z: -0.02, colour: hair, ao: 0, sy: 0.7 }, 6, 3);
  if (hat) g.cyl(0.32, 0.34, 0.09, 7, { y: 1.62, colour: hat, ao: 0 });
  if (arms === 'up') { g.beam([-0.26, 1.3, 0], [-0.46, 1.86, 0.05], 0.06, 4, { colour: skin }); g.beam([0.26, 1.3, 0], [0.46, 1.86, 0.05], 0.06, 4, { colour: skin }); }
  else if (arms === 'wave') { g.beam([-0.26, 1.3, 0], [-0.4, 0.75, 0.05], 0.06, 4, { colour: skin }); g.beam([0.26, 1.3, 0], [0.5, 1.85, 0.05], 0.06, 4, { colour: skin }); }
  else { g.beam([-0.26, 1.3, 0], [-0.32, 0.8, 0.05], 0.06, 4, { colour: skin }); g.beam([0.26, 1.3, 0], [0.32, 0.8, 0.05], 0.06, 4, { colour: skin }); }
  if (drum) { g.cyl(0.3, 0.3, 0.32, 8, { y: 0.55, z: 0.32, rx: Math.PI / 2 * 0, colour: 0xd62839, ao: 0 }); g.cyl(0.29, 0.29, 0.02, 8, { y: 0.87, z: 0.32, colour: 0xf5f0e6, ao: 0 }); }
  // animation channels
  const P = g.pos, U = g.uv;
  for (let i = 0; i < P.length / 3; i++) { U[i * 2] = phase; U[i * 2 + 1] = Math.min(1, Math.max(0, P[i * 3 + 1] / 1.9)); }
  if (s !== 1) for (let i = 0; i < P.length; i++) P[i] *= s;
  return g;
}

const SHIRTS = [0xe63946, 0xffd166, 0x2ec4b6, 0x3a86ff, 0xff9f1c, 0xf15bb5, 0x9ef01a, 0xffffff, 0x8338ec];
const LEGS = [0x22305a, 0x3a3a48, 0x1b6ca8, 0xe9d8a6, 0x202020, 0x7a4b2a];
const SKINS = [0xf1c27d, 0xd9a066, 0xc68642, 0x8d5524, 0xe0ac69, 0x6b4423, 0xffdbac];
const HAIRS = [0x201510, 0x3b2314, 0x6b4423, 0xc9a227, 0x111111, 0xa0522d];

/**
 * Add a person to a static batch bucket: random outfit, standing at (x, y, z) facing yaw.
 * @param {(mat:THREE.Material,x:number,z:number)=>Geo} at kit.statics.at bound to the crowd material
 * @param {import('../../../core/util.js').rng} rng seeded rng
 */
export function addPerson(statics, mat, rng, x, y, z, yaw, opts = {}) {
  const geo = personGeo({
    shirt: opts.shirt ?? rng.pick(SHIRTS), legs: opts.legs ?? rng.pick(LEGS), skin: rng.pick(SKINS), hair: rng.pick(HAIRS),
    hat: opts.hat ?? (rng() < 0.18 ? rng.pick(SHIRTS) : null), arms: opts.arms ?? (rng() < 0.55 ? 'up' : rng() < 0.6 ? 'wave' : 'down'),
    s: (opts.s ?? 1) * (0.9 + rng() * 0.2), phase: rng(), drum: opts.drum, dress: opts.dress,
  });
  statics.addGeo(mat, geo, { x, y, z, ry: yaw });
}
