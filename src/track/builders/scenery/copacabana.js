// Copacabana dressing: everything that is not road. Called from tracks/copacabana.js dress(kit).
// Layout facts are passed in (ctx) so this file never guesses geometry; all placement snaps to the ground via kit.track.
import * as THREE from 'three';
import { Geo } from '../Geo.js';
import { palmGeo, roundTreeGeo, bushGeo } from './flora.js';
import { personGeo, addPerson } from './people.js';
import { addBlock, signAtlas, boatGeo } from './common.js';
import { smoothstep } from '../../../core/util.js';
import { noise2, fbm2 } from '../noise.js';
import { buildParade, addBeachRoad, buildArch, buildPitch, buildPadDecals, buildLines, buildEscadaria, buildStands, buildBondinho, buildTide, buildTunnel } from './copa/setpieces.js';

const PASTELS = [0xf4d58d, 0xf7a072, 0xf2c6de, 0xa2d2ff, 0xbde0c8, 0xf9e0a4, 0xf5b8a5, 0xcdb4db, 0xffe5b4, 0xb8e0d2];
const FAVELA = [0xf2a541, 0xe4572e, 0x29a8ab, 0xf6d55c, 0xef6f9b, 0x4aa3df, 0x8bc34a, 0xd98c5f, 0xf7f0e0, 0x9b6bd1, 0xff7f50, 0x2ec4b6];
const STRIPES = [[0xe63946, 0xffffff], [0x2a9d8f, 0xffffff], [0xffd166, 0xffffff], [0x3a86ff, 0xffffff], [0xff7f11, 0xffffff], [0xf15bb5, 0xffffff]];

/** Shared materials for the whole dressing. */
export function makeMaterials(kit, atlas) {
  const T = kit.THREE, m = kit.mat;
  const foliage = m.vertex({ roughness: 0.78, side: T.DoubleSide }, 'foliage'); m.wind(foliage, { strength: 1.3, speed: 1.9 });
  const people = m.vertex({ roughness: 0.9 }, 'people'); m.hop(people, { amp: 0.32, rate: 6 });
  return {
    solid: m.vertex({ roughness: 0.85 }, 'solid'),
    building: m.vertex({ map: kit.tex.facadeTexture({ kind: 'balcony', glass: 0x4d8fbf }), roughness: 0.7 }, 'building'),
    foliage, people,
    glow: new T.MeshBasicMaterial({ color: 0xfff1b8, toneMapped: false }),
    sign: m.lit({ map: atlas.texture, roughness: 0.55, side: T.DoubleSide }, 'sign'),
    cloth: m.vertex({ roughness: 0.9, side: T.DoubleSide }, 'cloth'),
  };
}

// ---------------------------------------------------------------------------------------------- small props
function umbrellaGeo(c1, c2) {
  const g = new Geo();
  g.cyl(0.04, 0.05, 2.5, 5, { colour: 0xe8e0d0, ao: 0 });
  const seg = 8, r = 1.7, hgt = 0.62;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, c = new THREE.Color(i % 2 ? c1 : c2);
    const top = g.vert(0, 2.5 + hgt, 0, 0, 1, 0, 0.5, 1, c.r, c.g, c.b);
    const n0 = g.vert(Math.cos(a0) * r, 2.5, Math.sin(a0) * r, Math.cos(a0) * 0.5, 0.86, Math.sin(a0) * 0.5, 0, 0, c.r * 0.85, c.g * 0.85, c.b * 0.85);
    const n1 = g.vert(Math.cos(a1) * r, 2.5, Math.sin(a1) * r, Math.cos(a1) * 0.5, 0.86, Math.sin(a1) * 0.5, 1, 0, c.r * 0.85, c.g * 0.85, c.b * 0.85);
    g.tri(top, n1, n0);
  }
  return g;
}

function chairGeo(colour) {
  const g = new Geo();
  g.box(0.62, 0.06, 0.55, { y: 0.32, colour, ao: 0 }); g.box(0.62, 0.62, 0.06, { y: 0.34, z: -0.3, rx: -0.5, colour, ao: 0 });
  g.box(0.06, 0.34, 0.06, { x: -0.28, z: 0.24, colour: 0xd8d8d8, ao: 0 }); g.box(0.06, 0.34, 0.06, { x: 0.28, z: 0.24, colour: 0xd8d8d8, ao: 0 });
  return g;
}

function lampGeo() {
  const g = new Geo();
  g.cyl(0.11, 0.17, 5.4, 6, { colour: 0x22262e, ao: 0.2 });
  g.beam([0, 5.3, 0], [0.9, 5.9, 0], 0.07, 5, { colour: 0x22262e });
  g.sphere(0.32, { x: 0.95, y: 5.72, colour: 0xfff1b8, ao: 0, sy: 0.9 }, 6, 4);
  g.cyl(0.32, 0.22, 0.12, 6, { x: 0.95, y: 5.98, colour: 0x22262e, ao: 0 });
  g.cyl(0.24, 0.26, 0.5, 6, { colour: 0x30343e, ao: 0 });
  return g;
}

function kioskGeo(body, awning, roof) {
  const g = new Geo();
  g.box(4.6, 2.6, 3.6, { colour: body, ao: 0.3, top: roof });
  g.box(4.9, 0.28, 3.9, { y: 2.6, colour: roof, ao: 0 });
  g.box(4.6, 0.16, 0.1, { y: 0.98, z: 1.86, colour: 0x4a3a2a, ao: 0 });                    // counter
  g.box(3.2, 1.0, 0.06, { y: 1.35, z: 1.81, colour: 0x20303f, ao: 0 });                    // service window
  const n = 10, w = 5.0 / n;
  for (let i = 0; i < n; i++) g.box(w, 0.09, 2.2, { x: -2.5 + w * (i + 0.5), y: 2.02 - i * 0.0, z: 2.9, rx: 0.32, colour: i % 2 ? 0xffffff : awning, ao: 0 });
  g.box(5.1, 0.34, 0.06, { y: 2.16, z: 3.96, colour: awning, ao: 0 });
  for (const x of [-2.3, 2.3]) g.cyl(0.05, 0.05, 2.1, 5, { x, z: 3.75, colour: 0xd0d0d0, ao: 0 });
  g.cyl(0.9, 0.9, 0.04, 8, { y: 2.9, x: -1.2, colour: 0xffffff, ao: 0 });
  return g;
}

function lifeguardGeo(c1, c2) {
  const g = new Geo();
  for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) g.beam([x, 0, z], [x * 0.8, 3.2, z * 0.8], 0.11, 5, { colour: 0xf3ede2 });
  g.beam([-1.1, 0.5, 0], [1.1, 2.6, 0], 0.06, 4, { colour: 0xf3ede2 }); g.beam([1.1, 0.5, 0], [-1.1, 2.6, 0], 0.06, 4, { colour: 0xf3ede2 });
  g.box(3.3, 0.16, 3.3, { y: 3.2, colour: 0xa07a52, ao: 0 });
  g.box(2.6, 2.1, 2.6, { y: 3.36, colour: c1, ao: 0.3, top: c2 });
  g.box(2.0, 0.7, 0.06, { y: 4.35, z: 1.32, colour: 0x1e2c3c, ao: 0 });
  g.box(3.3, 0.22, 3.3, { y: 5.46, colour: c2, ao: 0 }); g.box(3.0, 0.18, 3.0, { y: 5.68, colour: c1, ao: 0 });
  g.cyl(0.04, 0.04, 2.0, 4, { y: 5.7, x: 1.2, colour: 0xdddddd, ao: 0 }); g.box(0.9, 0.6, 0.03, { y: 6.9, x: 1.65, colour: 0xff7f11, ao: 0 });
  g.box(1.1, 0.14, 3.0, { y: 0.9, z: 2.6, rx: 0.5, colour: 0xa07a52, ao: 0 });            // ladder ramp
  return g;
}

function netCourtGeo() {
  const g = new Geo();
  for (const z of [-4.6, 4.6]) { g.cyl(0.06, 0.07, 2.6, 6, { z, colour: 0xe8e8e8, ao: 0 }); g.cyl(0.13, 0.13, 0.7, 6, { z, y: 0.0, colour: 0xd62839, ao: 0 }); }
  g.box(0.05, 1.0, 9.2, { y: 1.55, colour: 0xf5f5f5, ao: 0 });
  g.box(0.02, 0.06, 9.2, { y: 2.5, x: 0.02, colour: 0xffffff, ao: 0 });
  // net mesh hint: vertical dark lines
  for (let i = -8; i <= 8; i++) g.box(0.02, 0.9, 0.025, { y: 1.55, z: i * 0.55, x: 0.03, colour: 0x222222, ao: 0 });
  return g;
}

function goalGeo() {
  const g = new Geo();
  g.cyl(0.07, 0.07, 2.4, 6, { z: -3.6, colour: 0xffffff, ao: 0 }); g.cyl(0.07, 0.07, 2.4, 6, { z: 3.6, colour: 0xffffff, ao: 0 });
  g.beam([0, 2.4, -3.6], [0, 2.4, 3.6], 0.07, 6, { colour: 0xffffff });
  g.box(1.6, 2.4, 0.03, { y: 0, z: -3.5, x: -0.8, ry: Math.PI / 2, colour: 0xe8e8e8, ao: 0 });
  g.box(1.6, 0.03, 7.2, { y: 2.38, x: -0.8, colour: 0xe8e8e8, ao: 0 });
  return g;
}

function floodlightGeo() {
  const g = new Geo();
  g.cyl(0.18, 0.3, 17, 6, { colour: 0x9aa3ad, ao: 0.2 });
  g.box(3.6, 1.3, 0.5, { y: 16.6, colour: 0x30343e, ao: 0 });
  for (let i = 0; i < 4; i++) g.box(0.7, 0.5, 0.06, { y: 17.0, x: -1.3 + i * 0.86, z: 0.3, colour: 0xfffbe0, ao: 0 });
  return g;
}

function statueGeo(scale = 1) {
  const g = new Geo(), W = 0xf6f3ec, S = 0xd8d4c8, SH = 0xe4dfd2;
  g.box(10, 6, 10, { colour: 0xcfc9bb, ao: 0.4, top: 0xe8e3d6 });                         // pedestal, stepped
  g.box(8, 3, 8, { y: 6, colour: 0xd8d3c4, ao: 0.25 }); g.box(6.2, 2, 6.2, { y: 9, colour: 0xddd8c9, ao: 0.2 });
  g.cyl(1.7, 3.6, 15.5, 12, { y: 11, colour: W, top: W, ao: 0.3 });                       // robe, flaring to the hem
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; g.beam([Math.cos(a) * 3.2, 11, Math.sin(a) * 3.2], [Math.cos(a) * 1.9, 26, Math.sin(a) * 1.9], 0.34, 5, { colour: SH }); }   // folds
  g.box(5.4, 2.7, 3.0, { y: 23.2, colour: W, ao: 0.15, top: W });                         // shoulders
  for (const sx of [-1, 1]) {
    g.beam([sx * 2.4, 25.4, 0], [sx * 12.6, 25.0, 0], 0.95, 8, { colour: W });            // outstretched arms
    g.beam([sx * 2.4, 25.6, 0], [sx * 7.5, 24.4, 0], 1.25, 8, { colour: W });             // fuller sleeve
    g.box(2.1, 0.5, 1.2, { x: sx * 13.6, y: 24.75, z: 0, colour: SH, ao: 0 });            // hands
  }
  g.cyl(0.9, 1.1, 1.3, 8, { y: 26.0, colour: W, ao: 0 });                                  // neck
  g.sphere(1.5, { y: 27.1, colour: W, top: 0xffffff, ao: 0 }, 10, 7);                      // head
  g.box(1.0, 0.3, 0.3, { y: 28.3, z: 1.35, colour: S, ao: 0 });                            // brow / face hint
  const out = new Geo(); out.merge(g, { s: scale });
  return out;
}

function pylonGeo(h) {
  const g = new Geo();
  const w0 = h * 0.16, w1 = h * 0.05;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.beam([sx * w0, 0, sz * w0], [sx * w1, h, sz * w1], h * 0.012 + 0.15, 5, { colour: 0xd23b3b });
  for (let k = 1; k <= 4; k++) { const y = (h * k) / 5, w = w0 + (w1 - w0) * (k / 5); g.box(w * 2, 0.35, 0.35, { y, colour: 0xf3f3ee, ao: 0 }); g.box(0.35, 0.35, w * 2, { y, colour: 0xf3f3ee, ao: 0 }); }
  g.box(h * 0.5, 0.6, 1.2, { y: h, colour: 0x30343e, ao: 0 });
  return g;
}

function cabinGeo() {
  const g = new Geo();
  g.cyl(0.35, 0.35, 0.5, 6, { y: 1.4, colour: 0x30343e, ao: 0 });
  g.beam([0, 2.4, 0], [0, 1.8, 0], 0.1, 5, { colour: 0x30343e });
  g.box(3.4, 1.9, 2.2, { y: -0.6, colour: 0xe63946, ao: 0.2, top: 0xf5f0e6 });
  g.box(3.1, 0.9, 2.3, { y: -0.1, colour: 0x9fd3ff, ao: 0 });
  g.box(3.6, 0.2, 2.4, { y: 1.3, colour: 0xf5f0e6, ao: 0 });
  return g;
}

/** Hop-animated crowd cluster of n people around (cx, cz) facing `yaw`. */
function crowdAt(kit, M, cx, cz, yaw, n, spread, opts = {}) {
  const rng = kit.rng, place = kit.place;
  for (let i = 0; i < n; i++) {
    const a = rng.range(-spread, spread), d = rng.range(0, spread * 0.5);
    const x = cx + Math.cos(yaw) * a * 1 + Math.sin(yaw) * d, z = cz - Math.sin(yaw) * a + Math.cos(yaw) * d;
    const sp = place.spotAt(x, z); if (!sp || sp.onRoad) continue;
    addPerson(kit.statics, M.people, rng, x, sp.y, z, yaw + rng.range(-0.3, 0.3), opts);
  }
}

// ---------------------------------------------------------------------------------------------- the dressing
/**
 * @param {object} kit the track kit (see TRACKDEF.md)
 * @param {{ pitch:{x:number,z:number,w:number,d:number}, statue:{x:number,z:number}, rock:{x:number,z:number}, shoreZ:(x:number)=>number }} ctx
 */
export function dressCopacabana(kit, ctx) {
  // gameplay first (works headless): the beach boardwalk road (fork 1), goal posts of the pitch (fork 2), the carnival floats and the rampable traffic
  for (const o of ctx.cuts.obstacles) kit.obstacles.static(o);
  if (ctx.cuts.beach) addBeachRoad(kit, ctx.cuts.beach);
  buildParade(kit, null, ctx.G);
  if (kit.headless) return;
  const { track, rng, statics } = kit, T = kit.THREE;
  const blocked = ctx.blocked, wrap = (fn) => (o) => fn({ ...o, filter: (sp) => !blocked(sp) && (!o.filter || o.filter(sp)) });
  const place = { ...kit.place, along: wrap(kit.place.along), scatter: wrap(kit.place.scatter) };
  const signs = signAtlas([
    { text: 'MARCO KART', sub: 'A MARCOVERSE PRODUCTION', bg: '#0b1d3a', fg: '#ffd166', size: 40 },
    { text: 'AÇAÍ', sub: 'BOWLS & SMOOTHIES', bg: '#7b2cbf', fg: '#ffffff' },
    { text: 'ÁGUA DE COCO', bg: '#2ec4b6', fg: '#ffffff', size: 40 },
    { text: 'CAIPIRINHA', sub: 'HAPPY HOUR ALL DAY', bg: '#8ac926', fg: '#10331a', size: 42 },
    { text: 'MARCOVERSE', sub: 'CLOUD & NETWORKING', bg: '#e63946', fg: '#fff8ec', size: 42 },
    { text: 'BOA VIAGEM', bg: '#ffd166', fg: '#0b1d3a', size: 50 },
    { text: 'SAMBA!', bg: '#ff7f11', fg: '#ffffff' },
    { text: 'PASTEL & CALDO', sub: 'DE CANA', bg: '#f15bb5', fg: '#ffffff', size: 40 },
    { text: 'COPACABANA', sub: 'CALÇADÃO · RIO DE JANEIRO', bg: '#0b1d3a', fg: '#ffffff', size: 44 },
    { text: 'ATALHO ►', sub: 'CAMPO DE FUTEBOL', bg: '#2a9d8f', fg: '#ffffff', size: 46 },
    { text: 'ATALHO ►', sub: 'PASSARELA DA PRAIA', bg: '#ff7f11', fg: '#ffffff', size: 46 },
    { text: 'SALTOS!', sub: 'PISTA DE MANOBRAS', bg: '#f15bb5', fg: '#ffffff', size: 48 },
    { text: 'PASSARELA ►', sub: 'PRAIA · RETA · SALTOS', bg: '#ff7f11', fg: '#ffffff', size: 44 },
    { text: '◄ CALÇADÃO', sub: 'CURVA LARGA · QUIOSQUES', bg: '#0b1d3a', fg: '#ffd166', size: 44 },
  ]);
  const M = makeMaterials(kit, signs);
  const sc = (x, z) => statics.at(M.solid, x, z);
  buildArch(kit, M, ctx.G, signs); buildPitch(kit, M, ctx.cuts, signs); buildPadDecals(kit); buildLines(kit, M, ctx.G, ctx.cuts, signs);
  buildEscadaria(kit, M, ctx.G); buildStands(kit, M); buildBondinho(kit, M, ctx.G); buildTide(kit, ctx); buildTunnel(kit, M, ctx.G);
  buildHotel(kit, M, ctx);
  const groundY = (x, z) => track.heightAt(x, z);

  // ------------------------------------------------------------------ palms and trees
  const palmSets = [0, 1, 2].map((k) => kit.instances(palmGeo({ height: 8.5 + k * 1.6, bend: 0.8 + k * 0.5, seed: k + 1, fronds: 10 + k, frondLen: 4.0 + k * 0.4 }), M.foliage, { cell: 300, name: `palm${k}` }));
  const addPalm = (sp, scale = 1) => {
    const k = rng.int(0, 2);
    palmSets[k].add(sp.x, sp.y - 0.05, sp.z, { ry: rng.range(0, 6.28), s: scale * rng.range(0.85, 1.25) });
    if (Math.abs(sp.lateral) < track.widthAt(sp.s) / 2 + 9) track.model.addCollider(sp.x, sp.z, 0.5);
  };
  const A0 = '@sweep+160', A1 = '@hairIn-70';
  for (const sp of place.along({ from: A0, to: A1, every: 15, side: 'right', offset: 4.2, jitterAlong: 3.5, jitterOffset: 1.2 })) addPalm(sp);
  for (const sp of place.along({ from: A0, to: '@k1-30', every: 20, side: 'left', offset: 4.4, jitterAlong: 3, jitterOffset: 1 })) addPalm(sp, 1.1);
  for (const sp of place.along({ from: '@k2+40', to: A1, every: 20, side: 'left', offset: 4.4, jitterAlong: 3, jitterOffset: 1 })) addPalm(sp, 1.1);
  // loose palms on the sand and around the infield
  for (const sp of place.scatter({ rect: [-60, 22, 900, 60], minDist: 22, roadMargin: 8, filter: (s) => s.surface === 'sand' })) addPalm(sp, 0.9);
  const treeSet = kit.instances(roundTreeGeo({ height: 7, crown: 3.4, seed: 1 }), M.foliage, { cell: 300, name: 'trees', cull: 800 });
  const treeSet2 = kit.instances(roundTreeGeo({ height: 9, crown: 4.2, seed: 2, leaf: [0x2f8a4a, 0x9bd34f] }), M.foliage, { cell: 300, name: 'trees2', cull: 800 });
  for (const sp of place.scatter({ rect: [-150, -230, 760, -40], minDist: 14, roadMargin: 10, filter: (s) => s.y < 14 && s.z > -175 })) (rng() < 0.5 ? treeSet : treeSet2).add(sp.x, sp.y - 0.05, sp.z, { ry: rng.range(0, 6.28), s: rng.range(0.85, 1.35) });
  const bush = kit.instances(bushGeo({ size: 1.5, flowers: [0xff5d8f, 0xffd166, 0xffffff] }), M.foliage, { cell: 300, name: 'bushes', cull: 320 });
  for (const sp of place.along({ from: '@sweep+160', to: '@hairIn-70', every: 9, side: 'left', offset: 2.3, jitterAlong: 2 })) bush.add(sp.x, sp.y, sp.z, { ry: rng.range(0, 6), s: rng.range(0.7, 1.2) });

  // ------------------------------------------------------------------ lamps
  const lamps = kit.instances(lampGeo(), M.solid, { cell: 300, name: 'lamps' });
  const lampGlow = kit.instances(new Geo().sphere(0.36, { x: 0.95, y: 5.72, colour: 0xffffff, ao: 0 }, 6, 4), M.glow, { cell: 300, name: 'lampglow', castShadow: false, receiveShadow: false });
  for (const sp of place.along({ from: A0, to: A1, every: 32, side: 'left', offset: 2.0, jitterAlong: 0 })) { lamps.add(sp.x, sp.y, sp.z, { ry: sp.along + Math.PI / 2 * (sp.side > 0 ? -1 : 1) }); }

  // ------------------------------------------------------------------ kiosks (market plaza north of the chicane + strip along the promenade)
  const kiosks = [
    [470, -62], [515, -68], [560, -70], [605, -66], [650, -58], [-10, -34], [70, -34], [150, -34], [240, -32], [330, -40], [760, -36],
  ];
  kiosks.forEach(([x, z], i) => {
    const sp = place.spotAt(x, z); if (!sp) return;
    const [c1, c2] = STRIPES[i % STRIPES.length], body = PASTELS[(i * 3) % PASTELS.length];
    statics.at(M.solid, x, z).merge(kioskGeo(body, c1, c2 === 0xffffff ? 0xfefefe : c2), { x, y: sp.y, z, ry: sp.along + Math.PI / 2 + (sp.side > 0 ? Math.PI : 0) * 0 - (sp.lateral > 0 ? 0 : 0) });
    crowdAt(kit, M, x + Math.cos(sp.along) * 0, z + 6, Math.PI, 4 + rng.int(0, 3), 4);
  });

  // ------------------------------------------------------------------ beach: umbrellas, chairs, courts, lifeguard posts
  const umbrellaSets = STRIPES.slice(0, 5).map(([c1, c2], i) => kit.instances(umbrellaGeo(c1, c2), M.cloth, { cell: 420, name: `umb${i}`, castShadow: true }));
  const chairSets = [0xffd166, 0x3a86ff].map((c, i) => kit.instances(chairGeo(c), M.solid, { cell: 420, name: `chair${i}` }));
  const avoidCourt = (s) => !ctx.courts.some((c) => Math.abs(s.x - c.x) < 14 && Math.abs(s.z - c.z) < 10);
  const beach = place.scatter({ rect: [-60, 24, 780, 58], minDist: 6.5, roadMargin: 7, filter: (s) => s.surface === 'sand' && s.z < ctx.shoreZ(s.x) - 8 && avoidCourt(s) });
  beach.forEach((sp, i) => {
    if (noise2(sp.x * 0.02, sp.z * 0.02, 3) < 0.38) return;
    umbrellaSets[i % 5].add(sp.x, sp.y, sp.z, { ry: rng.range(0, 6.28), rz: rng.range(-0.08, 0.08), s: rng.range(0.9, 1.15) });
    for (let k = 0; k < 2; k++) { const a = rng.range(0, 6.28); chairSets[(i + k) % 2].add(sp.x + Math.cos(a) * 2.1, sp.y, sp.z + Math.sin(a) * 2.1, { ry: a + Math.PI }); }
    if (rng() < 0.4) addPerson(statics, M.people, rng, sp.x + rng.range(-1.5, 1.5), sp.y, sp.z + rng.range(1, 2.5), rng.range(0, 6.28), { arms: 'down' });
  });
  const courtSet = kit.instances(netCourtGeo(), M.solid, { cell: 420, name: 'courts' });
  const lines = kit.paint({ lift: 0.06 });
  const courtLines = new Geo();
  for (const c of ctx.courts) {
    const y = groundY(c.x, c.z);
    courtSet.add(c.x, y, c.z, { ry: 0 });
    const w = 0.12, hx = 9, hz = 4.5, sg = statics.at(M.solid, c.x, c.z);
    for (const [px, pz, sx, sz] of [[0, -hz, hx * 2, w], [0, hz, hx * 2, w], [-hx, 0, w, hz * 2], [hx, 0, w, hz * 2], [-3, 0, w, hz * 2], [3, 0, w, hz * 2]]) sg.box(sx, 0.05, sz, { x: c.x + px, y: groundY(c.x + px, c.z + pz) + 0.02, z: c.z + pz, colour: 0xfff8ec, ao: 0 });
    crowdAt(kit, M, c.x, c.z - 8, 0, 6, 6, { arms: 'up' });
    for (let k = 0; k < 4; k++) addPerson(statics, M.people, rng, c.x + rng.range(-7, 7), y, c.z + rng.range(-3, 3), rng.range(0, 6.28), { arms: 'up', shirt: rng.pick([0xff5d8f, 0x22d3ee, 0xffd166, 0xffffff]) });
  }
  const guardSets = STRIPES.slice(0, 3).map(([c1, c2], i) => kit.instances(lifeguardGeo(c1, i % 2 ? 0xffd166 : 0xffffff), M.solid, { cell: 500, name: `guard${i}` }));
  ctx.guards.forEach(([x, z], i) => { const y = groundY(x, z); guardSets[i % 3].add(x, y, z, { ry: 0 }); crowdAt(kit, M, x, z + 5, Math.PI, 4, 3); });
  if (ctx.cuts.beach) {                                          // lifeguard towers on the sand side of the boardwalk's weaves
    const rb = ctx.cuts.beach.rb, q = {};
    [[0.27, 14], [0.43, 20], [0.6, 14], [0.76, 20]].forEach(([f, off], i) => {
      const p = rb.at(rb.total * f, q), x = p.x + p.rx * off, z = p.z + p.rz * off, y = groundY(x, z);
      guardSets[i % 3].add(x, y, z, { ry: 0 }); crowdAt(kit, M, x, z + 5, Math.PI, 3, 3);
    });
  }

  // ------------------------------------------------------------------ (the football pitch now lives inside the hairpin: copa/setpieces.js buildPitch)
  if (ctx.pitch) {
    const { x, z, w, d } = ctx.pitch, y = groundY(x, z) + 0.06;
    const g = statics.at(M.solid, x, z);
    const stripes = 10;
    for (let i = 0; i < stripes; i++) g.box(w / stripes, 0.05, d, { x: x - w / 2 + (i + 0.5) * (w / stripes), y: y - 0.02, z, colour: i % 2 ? 0x3ea34a : 0x54b955, ao: 0 });
    const line = (px, pz, sx, sz) => g.box(sx, 0.05, sz, { x: px, y: y + 0.01, z: pz, colour: 0xffffff, ao: 0 });
    line(x, z - d / 2, w, 0.18); line(x, z + d / 2, w, 0.18); line(x - w / 2, z, 0.18, d); line(x + w / 2, z, 0.18, d); line(x, z, 0.18, d);
    line(x - w / 2 + 8, z, 0.18, 20); line(x + w / 2 - 8, z, 0.18, 20); line(x - w / 2 + 4, z - 10, 8, 0.18); line(x - w / 2 + 4, z + 10, 8, 0.18);
    const goal = kit.instances(goalGeo(), M.solid, { cell: 500, name: 'goals' });
    goal.add(x - w / 2, y, z, { ry: 0 }); goal.add(x + w / 2, y, z, { ry: Math.PI });
    const fl = kit.instances(floodlightGeo(), M.solid, { cell: 500, name: 'floods' });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const px = x + sx * (w / 2 + 6), pz = z + sz * (d / 2 + 6); fl.add(px, groundY(px, pz), pz, { ry: Math.atan2(-sx, -sz) }); }
    for (let i = 0; i < 10; i++) addPerson(statics, M.people, rng, x + rng.range(-w / 3, w / 3), y, z + rng.range(-d / 3, d / 3), rng.range(0, 6.28), { arms: 'down', shirt: i < 5 ? 0xffd166 : 0x2a9d8f, legs: i < 5 ? 0x2a4bb0 : 0xffffff });
  }

  // ------------------------------------------------------------------ apartment blocks along the promenade + a skyline behind
  {
    const gb = (x, z) => statics.at(M.building, x, z), gr = (x, z) => statics.at(M.solid, x, z);
    const row = (x0, x1, zs, hMin, hMax, spacing) => {
      for (let x = x0; x < x1; x += spacing + rng.range(-6, 10)) {
        const w = rng.range(22, 34), d = rng.range(20, 30), z = zs + rng.range(-6, 6), sp = place.spotAt(x, z); if (!sp || sp.y > 10 || sp.onRoad) continue;
        if (Math.abs(sp.lateral) < 30 || (ctx.hotel && inRect({ x, z }, ctx.hotel, 34))) continue;
        addBlock(gb(x, z), gr(x, z), { x, y: sp.y - 0.5, z, w, d, floors: rng.int(hMin, hMax), colour: rng.pick(PASTELS), rng, stripe: rng() < 0.4 ? rng.pick([0xe63946, 0x2a9d8f, 0xffd166]) : null, yaw: 0 });
      }
    };
    row(-110, 400, -68, 8, 16, 34); row(780, 900, -68, 8, 14, 34);
    row(-110, 640, -105, 12, 22, 44);
  }

  // ------------------------------------------------------------------ hill favela blocks (instanced cubes, tinted per instance)
  {
    const cube = new Geo().box(1, 1, 1, { colour: 0xffffff, top: 0xe8dccb, ao: 0.32 });
    const cubes = kit.instances(cube, M.solid, { cell: 260, name: 'favela', castShadow: false });
    const roofC = kit.instances(new Geo().box(1, 0.16, 1, { colour: 0xffffff, ao: 0 }), M.solid, { cell: 260, name: 'favela-roof', castShadow: false });
    const cluster = (cx, cz, r, n, minLat = 40) => {
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, 6.28), d = Math.sqrt(rng()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, sp = place.spotAt(x, z);
        if (!sp || sp.y < 6 || sp.y > 150) continue;
        if (Math.abs(sp.lateral) < minLat && sp.y < 30) continue;
        const nz = noise2(x * 0.03, z * 0.03, 9); if (nz < 0.3) continue;
        const w = rng.range(4, 9), d2 = rng.range(4, 9), h = rng.range(3.5, 9) * (0.6 + nz), c = rng.pick(FAVELA);
        cubes.add(x, sp.y - 0.6, z, { sx: w, sy: h, sz: d2, ry: rng.range(-0.3, 0.3) + Math.atan2(0, 1), colour: c });
        if (rng() < 0.6) roofC.add(x, sp.y - 0.6 + h, z, { sx: w * 1.06, sy: 1, sz: d2 * 1.06, ry: 0, colour: rng.pick([0xb5533c, 0x6c757d, 0xd6ccc2, 0x264653]) });
      }
    };
    for (let k = 0; k < 26; k++) cluster(rng.range(-250, 1050), rng.range(-520, -250), rng.range(50, 110), 60);
    for (let k = 0; k < 8; k++) cluster(rng.range(300, 900), rng.range(-330, -240), 70, 50);
    // dense band just north of the ridge road
    for (let k = 0; k < 10; k++) cluster(rng.range(-60, 650), rng.range(-330, -290), 55, 45);
    // houses packed between the legs of the switchback climb
    for (let k = 0; k < 14; k++) cluster(rng.range(560, 860), rng.range(-205, -105), 36, 30, 17);
  }

  // ------------------------------------------------------------------ hilltop statue
  {
    const { x, z } = ctx.statue, y = groundY(x, z);
    statics.at(M.solid, x, z).merge(statueGeo(3.4), { x, y: y - 2, z, ry: Math.atan2(0 - x, 200 - z) * 0 + 0.35 });
  }

  // ------------------------------------------------------------------ cable car (station on the north hills to the offshore rock)
  {
    const a = ctx.cable.a, b = ctx.cable.b;
    const ya = groundY(a.x, a.z) + 14, yb = groundY(b.x, b.z) + 3;
    const cableGeo = new Geo();
    const dir = new THREE.Vector3(b.x - a.x, yb - ya, b.z - a.z), len = dir.length();
    const sag = 6, nseg = 24, pts = [];
    for (let i = 0; i <= nseg; i++) { const t = i / nseg; pts.push([a.x + (b.x - a.x) * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t]); }
    for (let i = 0; i < nseg; i++) { cableGeo.beam(pts[i], pts[i + 1], 0.12, 4, { colour: 0x30343e }); }
    statics.at(M.solid, a.x, a.z).merge(cableGeo);
    for (const [px, pz, ph] of ctx.cable.pylons) { const gy = groundY(px, pz); statics.at(M.solid, px, pz).merge(pylonGeo(ph), { x: px, y: gy - 1, z: pz }); }
    // station huts
    for (const [p, y0] of [[a, ya - 14], [b, yb - 3]]) statics.at(M.solid, p.x, p.z).merge(new Geo().box(14, 8, 10, { colour: 0xe63946, ao: 0.3, top: 0xf5f0e6 }), { x: p.x, y: y0 - 0.5, z: p.z });
    const cabins = [0, 1].map((k) => { const m = new THREE.Mesh(cabinGeo().build(), M.solid); m.castShadow = true; kit.add(m); return m; });
    const tmp = new THREE.Vector3();
    kit.animate((dt, time) => {
      const u = 0.5 + 0.5 * Math.sin(time * 0.045 * Math.PI * 2 * 0.25);
      cabins.forEach((cab, k) => {
        const t = k ? 1 - u : u;
        cab.position.set(a.x + (b.x - a.x) * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t) - 2.3, a.z + (b.z - a.z) * t);
        cab.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2; cab.rotation.z = Math.sin(time * 0.9 + k) * 0.03;
      });
    });
  }

  // ------------------------------------------------------------------ boats on the sea
  {
    const boats = [0xd62839, 0x2a9d8f, 0xffd166, 0x3a86ff].map((c, i) => kit.instances(boatGeo({ stripe: c, size: 1.1 }), M.cloth, { cell: 900, name: `boat${i}`, castShadow: false }));
    const spots = [[80, 118, 0.6], [240, 150, 2.1], [430, 122, 1.2], [610, 170, 0.2], [770, 128, 2.6], [-100, 160, 1.7], [520, 230, 0.9], [330, 260, 2.4]];
    spots.forEach(([x, z, yaw], i) => boats[i % 4].add(x, 0, z, { ry: yaw }));
  }

  // ------------------------------------------------------------------ billboards along the promenade wall and the hill road
  {
    const g = statics.at(M.sign, 0, 0);
    const list = place.along({ from: '@sweep+110', to: '@hairIn-70', every: 55, side: 'left', offset: 0.5 });
    list.forEach((sp, i) => {
      const uv = signs.uv(i % 8), q = track.sample(sp.s), yaw = Math.atan2(q.tangent.x, q.tangent.z);
      const bx = sp.x - q.right.x * 0.35 * -1, bz = sp.z;
      statics.at(M.sign, sp.x, sp.z).panel(7.0, 3.5, { x: sp.x + q.right.x * -1.1, y: sp.y + 0.9, z: sp.z + q.right.z * -1.1, ry: yaw + Math.PI, colour: 0xffffff, uv, both: false });
      statics.at(M.solid, sp.x, sp.z).box(0.3, 1.2, 0.3, { x: sp.x + q.right.x * -1.1, y: sp.y, z: sp.z + q.right.z * -1.1, colour: 0x444a55 });
    });
    void g;
  }
}

function inRect(s, r, m = 0) { return Math.abs(s.x - r.x) < r.w / 2 + m && Math.abs(s.z - r.z) < r.d / 2 + m; }

/** The grand white hotel on the promenade: stepped tower, red awning, flagpoles. */
function buildHotel(kit, M, ctx) {
  const H = ctx.hotel, { statics, rng, track } = kit, sp = kit.place.spotAt(H.x, H.z);
  if (!sp) return;
  const gb = statics.at(M.building, H.x, H.z), gr = statics.at(M.solid, H.x, H.z);
  addBlock(gb, gr, { x: H.x, y: sp.y - 0.5, z: H.z, w: H.w, d: H.d, floors: 14, colour: 0xf6f1e4, roof: 0x9aa0aa, stripe: 0xe63946, rng, yaw: 0, setback: true, bay: 3.6 });
  const front = H.z + H.d / 2 + 0.2;
  for (let i = 0; i < 14; i++) gr.box(H.w * 0.6 / 14 + 0.02, 0.5, 4.2, { x: H.x - H.w * 0.3 + (i + 0.5) * (H.w * 0.6 / 14), y: sp.y + 5.0, z: front + 1.9, rx: -0.25, colour: i % 2 ? 0xffffff : 0xe63946, ao: 0 });
  for (const k of [-1, 1]) for (let f = 0; f < 3; f++) { const x = H.x + k * (H.w / 2 - 3 - f * 5); gr.cyl(0.08, 0.1, 14, 5, { x, y: sp.y + 40, z: front + 0.6, colour: 0xd0d0d0, ao: 0 }); gr.box(2.4, 1.5, 0.05, { x: x + 1.3, y: sp.y + 51, z: front + 0.6, colour: [0x009c3b, 0xffdf00, 0x002776][f], ao: 0 }); }
  track.model.addCapsule(H.x - H.w / 2, front, H.x + H.w / 2, front, 1.0);
}
