// Materials the engine asks for (def.materials): deck plating, slab skin, jump ramp and glowing road paint.
import * as THREE from 'three';
import { deckTextures, slabTextures, rampTextures } from './textures.js';

/** @param {object} kit the track kit @returns {{road: THREE.Material, underside: THREE.Material, platform: THREE.Material, paint: THREE.Material}} */
export function marcoverseMaterials(kit) {
  const deck = deckTextures(), slab = slabTextures(), ramp = rampTextures();
  return {
    road: new THREE.MeshStandardMaterial({ color: 0xffffff, map: deck.map, emissiveMap: deck.emissive, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.42, metalness: 0.25 }),
    underside: new THREE.MeshStandardMaterial({ color: 0xffffff, map: slab.map, emissiveMap: slab.emissive, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.5, metalness: 0.3, vertexColors: true }),
    platform: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ramp.map, emissiveMap: ramp.emissive, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.5, metalness: 0.1 }),
    paint: kit.mat.glowVertex(),
  };
}
