// Blighty dressing: everything that is not road. Called from tracks/blighty.js dress(kit, ctx).
// Headless: only the bus garages' colliders and the crossing buses (obstacles) are created.
import * as THREE from 'three';
import { windowAtlas, busTexture } from './blighty/atlas.js';
import { buildTerraces, buildBackdrop } from './blighty/terraces.js';
import { buildDepots } from './blighty/transport.js';
import { buildRoundabout, buildCanal, clockFaceTexture } from './blighty/landmarks.js';
import { buildStreet, buildPuddles } from './blighty/street.js';
import { buildGreens } from './blighty/park.js';
import { railingTexture } from '../textures.js';
import { buildRoadHazards, addForkRoads, buildForkFurniture, makeBlocked, dressDecks } from './bl/setpieces.js';
import { buildPadDecals } from './copa/setpieces.js';

/** Materials shared by the whole dressing. Vertex-coloured props tint the brick / stucco / stone textures. */
export function makeMaterials(kit, A) {
  const T = kit.tex, m = kit.mat, env = T.skyEnvTexture();
  const foliage = m.vertex({ roughness: 0.8, side: THREE.DoubleSide }, 'foliage'); m.wind(foliage, { strength: 0.9, speed: 1.5 });
  const people = m.vertex({ roughness: 0.9 }, 'people'); m.hop(people, { amp: 0.05, rate: 3.2 });
  const clockTex = clockFaceTexture();
  const win = m.lit({ map: A.atlas.texture, roughness: 0.16, metalness: 0.05, envMap: env, envMapIntensity: 1.1 }, 'win');
  return {
    sign: win, win,
    solid: m.vertex({ roughness: 0.62, envMap: env, envMapIntensity: 0.35 }, 'solid'),
    brick: m.vertex({ map: T.brickTexture({ seed: 4 }), roughness: 0.78 }, 'brick'),
    stone: m.vertex({ map: T.brickTexture({ seed: 11, mortar: 0.8 }), roughness: 0.8, emissive: 0x4d4430 }, 'stone'),
    building: m.vertex({ map: T.facadeTexture({ kind: 'balcony', glass: 0x5f7489 }), roughness: 0.6, envMap: env, envMapIntensity: 0.5 }, 'building'),
    clock: m.lit({ map: clockTex, emissiveMap: clockTex, emissive: 0xfff2c8, emissiveIntensity: 0.45, roughness: 0.4 }, 'clock'),
    rail: m.lit({ map: railingTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, transparent: false }, 'rail'),
    bus: m.lit({ map: busTexture(), roughness: 0.4, envMap: env, envMapIntensity: 0.7 }, 'bus'),
    puddle: m.vertex({ roughness: 0.03, metalness: 0.4, envMap: env, envMapIntensity: 1.15, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }, 'puddle'),
    dark: new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.5 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false }),
    cloth: m.vertex({ roughness: 0.9, side: THREE.DoubleSide }, 'cloth'),
    foliage, people,
  };
}

/**
 * @param {object} kit the track kit @param {{ island:{x,z,r}, canal:object, bridgeZ:number, hill:object, extent:number[], cell:number }} ctx
 */
export function dressBlighty(kit, ctx) {
  const { track } = kit, S = (m) => track.S(m);
  const atlas = kit.headless ? null : windowAtlas(), A = kit.headless ? null : { atlas, signs: { uv: atlas.signUv } };
  const M = kit.headless ? null : makeMaterials(kit, A);
  addForkRoads(kit, M, ctx.cuts);
  buildDepots(kit, M, A);
  buildRoadHazards(kit, M, ctx.G, ctx, ctx.cuts);
  if (kit.headless) return;
  const blocked = makeBlocked(kit), wrap = (fn) => (o) => fn({ ...o, filter: (sp) => !blocked(sp) && (!o.filter || o.filter(sp)) });
  kit.place = { ...kit.place, along: wrap(kit.place.along), scatter: wrap(kit.place.scatter) };
  buildPadDecals(kit); dressDecks(kit); buildForkFurniture(kit, M, A, ctx.G, ctx.cuts);

  // where can houses / furniture stand? [from, to] s-ranges per side (metres, resolved once)
  const R = (a, b) => [S(a), S(b)];
  const NO = {
    both: [R('@j1-46', '@j1+46'), R('@j2-46', '@j2+46'), R('@bridge-52', '@bridge+52'), R('@rb0-6', '@rb0+8'), R('@mktB-10', '@tubeB+10'), R('@parkA-20', '@parkA+30'), R('@parkB-30', '@parkB+30')],
    right: [R(0, '@rb0-46'), R('@rb0', '@rb3+2'), R('@c2+6', '@hill1-30'), R('@sw0', track.length)],
    left: [],
  };
  const inRange = (s, [a, b]) => (a <= b ? s >= a && s <= b : s >= a || s <= b);
  const allowed = (s, side) => !NO.both.some((r) => inRange(s, r)) && !(side > 0 ? NO.right : NO.left).some((r) => inRange(s, r));
  const skip = (sp) => !allowed(sp.s, sp.side);

  // terraces along every street, shop fronts on the high street
  const rows = [];
  for (const side of [-1, 1]) rows.push({ from: 0, to: '@rb4+30', side }, { from: '@rb4+30', to: '@es2+30', side, kind: 'shop' }, { from: '@es2+30', to: track.length, side });
  const houses = buildTerraces(kit, M, A, { rows, skip, batch: kit.batch('terraces', { cell: 300, cull: 430 }) });
  ctx.stats = { houses };
  buildRoundabout(kit, M, ctx);
  buildCanal(kit, M, ctx);
  buildStreet(kit, M, ctx, allowed);
  buildPuddles(kit, M, allowed);
  const G = ctx.G, C = ctx.cuts, hA = G.at('@hair-53', 0), hB = G.at('@hair+53', 0);
  const market = { x: (hA.x + hB.x) / 2, z: (hA.z + hB.z) / 2, r: Math.hypot(hA.x - hB.x, hA.z - hB.z) / 2 };           // centre and radius of the market hairpin
  const bp = C.park.rb.at(C.park.rb.total * 0.36, {}), bandstand = { x: bp.x + bp.rx * 32, z: bp.z + bp.rz * 32, walkTo: { x: bp.x + bp.rx * 10, z: bp.z + bp.rz * 10 } };
  buildGreens(kit, M, { ...ctx, market, bandstand }, allowed);
  // tall backdrop blocks well behind the terraces
  const c = ctx.canal, keep = (s) => !ctx.field.inside(s.x, s.z);
  buildBackdrop(kit, M, A, { batch: kit.batch('backdrop', { cell: 320, cull: 480, castShadow: false }), rect: [-560, -290, 820, 880], minDist: 40, filter: (s) => keep(s) && !(s.x > c.x0 - 30 && s.x < c.x1 + 30 && s.z > c.z0 - 30 && s.z < c.z1 + 30) });
}
