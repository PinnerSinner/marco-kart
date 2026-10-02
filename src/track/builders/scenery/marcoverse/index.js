// Marcoverse Speedway dressing: everything that is not the ribbon itself. Called from tracks/marcoverse.js dress(kit).
// Headless builds create nothing (the road, checkpoints and void are all the engine needs).
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { buildRails } from './rails.js';
import { buildStart } from './start.js';
import { buildPortals, buildTube } from './portals.js';
import { buildPlanets } from './planets.js';
import { installHazards } from './hazards.js';
import { buildSectorArches, dressShortcuts, buildLogoRing, buildIslands } from './setpieces.js';
import { buildAsteroidsAndIslands, buildHologram, buildComets, buildDust } from './bodies.js';
import { installMvTraffic } from './traffic.js';
import { dressMvForks } from './forks.js';

/** Materials shared by the dressing modules. */
function makeMaterials(kit) {
  const glow = kit.mat.glowVertex();
  const add = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const dark = kit.mat.vertex({ roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide }, 'mv-dark');
  return { glow, add, dark };
}

/** @param {object} kit the track kit */
export function dressMarcoverse(kit, ctx = {}) {
  const M = kit.headless ? {} : makeMaterials(kit);
  if (ctx.SC) installHazards(kit, { SC: ctx.SC, M });
  if (ctx.R) installMvTraffic(kit, { R: ctx.R, material: kit.headless ? null : kit.mat.vertex({ roughness: 0.5, metalness: 0.2, emissive: 0x2a2f8a, emissiveIntensity: 0.9 }, 'mv-traffic') });
  if (kit.headless) return;
  if (ctx.FK) dressMvForks(kit, { FK: ctx.FK, M, road: ctx.road });
  if (ctx.SC) {
    buildSectorArches(kit, M); dressShortcuts(kit, M, ctx.SC); buildLogoRing(kit, M); buildIslands(kit, M);
  }
  const off = (n) => (globalThis.__MVOFF || '').includes(n);
  if (!off('rails')) buildRails(kit, M);
  if (!off('start')) buildStart(kit, M);
  if (!off('portals')) buildPortals(kit, M, [
    { s: '@dive0+50', colour: PALETTE.cyan }, { s: '@dip+8', colour: PALETTE.magenta }, { s: '@crest-40', colour: PALETTE.violet },
    { s: '@t2x+10', colour: PALETTE.cyan }, { s: '@spin+18', colour: PALETTE.magenta }, { s: '@climb-88', colour: PALETTE.mint },
    { s: '@n0+24', colour: PALETTE.violet }, { s: '@l2-40', colour: PALETTE.magenta }, { s: '@h2+50', colour: PALETTE.mint },
    { s: -178, colour: PALETTE.magenta }, { s: -70, colour: PALETTE.cyan },
  ]);
  if (!off('tube')) {                                                    // the glass tube: its middle (clear of the skyline's mouths), then through the corner
    buildTube(kit, M, kit.S('@h2+84'), kit.S('@tube-84'));
    buildTube(kit, M, kit.S('@tube+6'), kit.S('@wleg-2'));
  }
  if (!off('planets')) buildPlanets(kit);
  if (!off('holo')) buildHologram(kit, M);
  if (!off('rocks')) buildAsteroidsAndIslands(kit, M);
  if (!off('comets')) buildComets(kit, M);
  if (!off('dust')) buildDust(kit);
}
