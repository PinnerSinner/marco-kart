// WORKED EXAMPLE (not registered in the game): a small "space ribbon" showing the features tracks 3 and 4 need. Read together with TRACKDEF.md.
//   * no terrain at all (terrain:false): everything beside the road is void, no walls, glowing edge lines
//   * a boost-pad chain, a banked sweeper, a jump ramp followed by a broken section (gap zone) and a two-turn spiral descent
//   * a glass tunnel built with kit.sweep(), neon strips built with kit.paint({ material }), an emissive custom road material
//   * space environment (stars, dark sky)
// Register it in a test or demo with:  registerTrack('ribbon', exampleRibbon);  createTrack('ribbon', { headless: true });
import * as THREE from 'three';
import { turtle } from '../builders/layout.js';

/** Control points: turtle heading 90 = east; arcs are (radius, degrees), positive = right turn. y / w / bank are the values reached at the END of each element. */
function ribbonPoints() {
  const t = turtle({ x: 0, z: 0, heading: 90, y: 30, w: 16 });
  t.straight(220).mark('boost');                                   // long start straight with the boost chain
  t.arc(70, 90, { bank: 24 }).mark('bank');                        // banked right-hander (bank > 0 = right edge lower)
  t.straight(200, { bank: 0 }).mark('jump');                       // ramp + gap live here
  t.arc(45, -720, { y: 12, w: 18 }).mark('spiral');                // two full left-hand turns descending 14 m: the road crosses over itself
  t.straight(80, { y: 26, w: 16 });                                // climbs back to the start height
  t.arc(70, 90, { bank: 20 });
  t.straight(420, { bank: 0 });
  t.arc(70, 90, { bank: 24 });
  return t.closeLoop(70, { bank: 0 });                             // returns to the start point and heading
}

/** @param {{ gap?: boolean }} [o] gap:false leaves the road unbroken (SimpleKart cannot jump). */
export default function exampleRibbon({ gap = true } = {}) {
  return {
    id: 'ribbon', name: 'Neon Ribbon', lapCount: 3, seed: 5, killY: -60,
    environment: { skyKind: 'space', skyTop: 0x05061a, skyBottom: 0x1a1140, fogColor: 0x0a0a24, fogNear: 200, fogFar: 1400, stars: true, clouds: 0, sunIntensity: 0.6, ambientIntensity: 1.1 },
    road: { width: 16, thickness: 1.2, markings: { edge: { colour: 0x22d3ee, inset: 0.4, width: 0.3 }, centre: null } },
    points: ribbonPoints(),
    terrain: false,                                                // nothing beside the road: the void
    defaults: { both: { wall: 'none', edge: 'void', kerb: false, skirt: 0 } },
    zones: gap ? [{ from: '@jump-148', to: '@jump-138', gap: true }] : [],   // a 10 m break in the road; the ramp before it launches you across
    boostPads: [20, 60, 100].map((d) => ({ s: `@boost-${200 - d}`, length: 12, width: 8 })),
    ramps: [{ id: 'gap-ramp', s: '@jump-165', length: 12, width: 10, rise: 2.4, kind: 'ramp' }],
    itemRows: [{ s: 40 }, { s: '@bank+30' }, { s: '@spiral+40' }],
    checkpoints: [0, 200, '@bank', '@jump', 800, '@spiral', '@spiral+300', 1500, 1900, 2150],
    materials: (kit) => {
      // deck plating: 4 x 4 panels per 18 m repeat with dark seams and a faint glowing rivet grid (null in Node: kit.tex is canvas-based)
      const plates = kit.tex.customTexture('ribbon-deck', 512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#39406a'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#3e466f' : '#343b62'; ctx.fillRect(i * 128 + 3, j * 128 + 3, 122, 122); }
        ctx.fillStyle = '#0d1230'; for (let i = 0; i <= 4; i++) { ctx.fillRect(i * 128 - 2, 0, 4, h); ctx.fillRect(0, i * 128 - 2, w, 4); }
        ctx.fillStyle = '#5fc8ea'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (const [dx, dy] of [[14, 14], [114, 14], [14, 114], [114, 114]]) ctx.fillRect(i * 128 + dx - 2, j * 128 + dy - 2, 4, 4);
      });
      return {
        road: new THREE.MeshStandardMaterial({ color: 0xffffff, map: plates, roughness: 0.4, metalness: 0.3, emissive: 0x0c1f4a, emissiveIntensity: 0.8 }),
        underside: new THREE.MeshStandardMaterial({ color: 0x0c0e18, roughness: 0.6 }),
        platform: new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.4, emissive: 0x9a5c00, emissiveIntensity: 1.0 }),   // the jump ramp
        paint: kit.mat.glowVertex(),                                 // markings, arrows and edge lines glow (vertex colours above 1 bloom)
      };
    },
    dress(kit) {
      if (kit.headless) return;
      // glass tunnel over the spiral's exit straight: an arch profile [lateral, up] swept along the road
      const glass = new THREE.MeshStandardMaterial({ color: 0x66ccff, transparent: true, opacity: 0.18, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
      const arch = []; for (let a = 0; a <= 12; a++) { const ang = Math.PI * (a / 12); arch.push([-9 * Math.cos(ang), 1 + 6 * Math.sin(ang)]); }
      kit.sweep({ from: '@spiral', to: '@spiral+70', profile: arch, material: glass, step: 2 });
      // neon ribs every 10 m along the tunnel
      kit.sweep({ from: '@spiral', to: '@spiral+70', every: 10, length: 0.4, profile: arch, material: kit.mat.glow(0x22d3ee, 2.5), step: 2 });
      // a pulsing-colour strip down the middle of the start straight (Paint with a glowing material)
      const strip = kit.paint({ material: kit.mat.glowVertex(), lift: 0.05 });
      strip.strip(kit.S(0), kit.S('@boost'), 0, 0.5, 0xffc857, 2);
    },
  };
}
