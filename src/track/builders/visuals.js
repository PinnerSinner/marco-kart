// buildVisuals: road, kerbs, markings, walls, verge, terrain, ramps, water, gantry and signs, from the def.
import * as THREE from 'three';
import { Paint } from './paint.js';
import { buildRoadSurface, buildRoadUnderside, buildKerbs, buildVerge, buildWalls } from './roadMesh.js';
import { buildTerrain, buildPlatformMesh, makeGroundColour } from './terrainMesh.js';
import { buildStartLine, buildBoostPads, buildGantry } from './props.js';
import { asphaltTexture, detailTexture, kerbTexture, plankTexture } from './textures.js';

function defaultMaterials(kit, def) {
  const { lit } = kit.mat, custom = def.materials?.(kit) ?? {};
  const grassy = def.terrain?.detail ?? 'grass';
  return {
    road: custom.road ?? lit({ map: asphaltTexture(), roughness: 0.92 }, 'road'),
    kerb: custom.kerb ?? (() => lit({ map: kerbTexture(), roughness: 0.8 }, 'kerb')),
    verge: custom.verge ?? lit({ map: detailTexture({ kind: grassy }), vertexColors: true, roughness: 1 }, 'verge'),
    platform: custom.platform ?? (() => lit({ map: plankTexture(), roughness: 0.8 }, 'platform')),
    paint: custom.paint ?? lit({ vertexColors: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }, 'paint'),
    underside: custom.underside ?? lit({ color: 0x33384a, roughness: 0.6 }, 'underside'),
    kerbs: custom.kerbs ?? null,
  };
}

/** Paint the markings requested by def.road.markings and def.paint onto the road. */
function paintMarkings(track, def, paint) {
  const m = track.model, N = m.N, ds = m.ds, F = m.F, L = track.length;
  const mk = { edge: { colour: 0xf2f2ee, inset: 0.55, width: 0.22 }, centre: null, skip: [], ...(def.road?.markings ?? {}) };
  const skip = (mk.skip ?? []).map((z) => [track.S(z.from), track.S(z.to)]);
  const skipped = (s) => skip.some(([a, b]) => (a <= b ? s >= a && s <= b : s >= a || s <= b));
  // group contiguous paintable stretches
  const runs = []; let start = null;
  for (let i = 0; i <= N; i++) {
    const ii = i % N, ok = !(F.gap[ii] | F.gap[(ii + 1) % N]) && !skipped(i * ds) && i < N;
    if (ok && start === null) start = i;
    if (!ok && start !== null) { runs.push([start * ds, i * ds]); start = null; }
  }
  if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] >= L - 1e-6) { const last = runs.pop(); runs[0][0] = last[0] - L; }
  for (const [a, b] of runs) {
    const s0 = (a + L) % L, s1 = b % L || L;
    if (mk.edge) {
      for (const sg of [-1, 1]) paint.strip(s0, s1, (s) => sg * (track.widthAt(s) / 2 - mk.edge.inset), mk.edge.width, mk.edge.colour, 2);
    }
    if (mk.centre) {
      const c = mk.centre;
      if (c.kind === 'solid') paint.strip(s0, s1, 0, c.width ?? 0.2, c.colour ?? 0xf2f2ee, 2);
      else if (c.kind === 'double') { paint.strip(s0, s1, -0.16, 0.14, c.colour ?? 0xf2f2ee, 2); paint.strip(s0, s1, 0.16, 0.14, c.colour ?? 0xf2f2ee, 2); }
      else paint.dashes(s0, s1, 0, c.width ?? 0.2, c.colour ?? 0xf2f2ee, c.dash ?? 3, c.gap ?? 5);
    }
  }
  for (const p of def.paint ?? []) {
    const colour = p.colour ?? 0xf2f2ee;
    if (p.kind === 'strip') { const a = track.S(p.from), b = track.S(p.to); p.dash ? paint.dashes(a, b < a ? b + L : b, p.lateral ?? 0, p.width ?? 0.2, colour, p.dash, p.gap ?? 4) : paint.strip(a, b, p.lateral ?? 0, p.width ?? 0.2, colour); }
    else if (p.kind === 'arrow') paint.arrow(track.S(p.s), p.lateral ?? 0, p.len ?? 5, p.wid ?? 2.2, colour);
    else if (p.kind === 'rect') paint.rect(track.S(p.s), p.lateral ?? 0, p.len ?? 2, p.wid ?? 2, colour);
    else if (p.kind === 'chevrons') {
      const a = track.S(p.from); let b = track.S(p.to); if (b < a) b += L;
      for (let s = a; s <= b; s += p.every ?? 8) paint.chevron(s, p.lateral ?? 0, p.c ?? 1.6, p.w ?? (track.widthAt(s) * 0.3), colour, p.t);
    }
  }
}

/** Instanced chevron signs on the outside of corners, facing oncoming traffic. def.signs: [{ from, to, every, side, offset, dir }] */
function buildSigns(track, kit, def) {
  const sets = { left: null, right: null };
  const mat = kit.mat.vertex({ roughness: 0.6 }, 'signs');
  const get = (dir) => sets[dir] ?? (sets[dir] = kit.instances(kit.props.chevronSignGeo(dir), mat, { name: `signs-${dir}`, castShadow: true }));
  for (const sg of def.signs ?? []) {
    const spots = kit.place.along({ from: sg.from, to: sg.to, every: sg.every ?? 12, side: sg.side ?? 'right', offset: sg.offset ?? 2.4 });
    for (const sp of spots) {
      const set = get(sg.dir ?? (sp.side < 0 ? 'right' : 'left'));
      set.add(sp.x, sp.y, sp.z, { ry: sp.along + Math.PI + sp.side * 0.28 });
    }
  }
}

/**
 * @param {import('../Track.js').Track} track
 * @param {object} kit
 */
export function buildVisuals(track, kit) {
  const def = track.def, m = track.model, g = track.group;
  const M = defaultMaterials(kit, def);
  const kerbMat = (st) => { const k = M.kerb; const name = track.kerbNames[st - 1]; const perStyle = M.kerbs?.[name]; return perStyle ?? (typeof k === 'function' ? (M.kerb = k()) : k); };
  const groundColour = makeGroundColour(def.terrain ?? {}, track);

  g.add(buildRoadSurface(track, M.road));
  const under = buildRoadUnderside(track, M.underside); if (under) g.add(under);
  for (const k of buildKerbs(track, kerbMat)) g.add(k);
  const wallMat = (name, st) => {
    if (st.material) return st.material;
    const plane = st.shape === 'plane';
    return kit.mat.lit({ vertexColors: true, map: st.map ?? null, roughness: st.roughness ?? 0.85, side: plane ? THREE.DoubleSide : THREE.FrontSide, transparent: plane && !!st.map, alphaTest: plane ? 0.4 : 0 }, `wall:${name}`);
  };
  for (const w of buildWalls(track, wallMat)) g.add(w);

  const paint = new Paint(track, { lift: 0.03 });
  paintMarkings(track, def, paint);
  const pm = paint.build(M.paint); if (pm) g.add(pm);
  if (def.startLine !== false) { const sl = buildStartLine(track, M.paint); if (sl) g.add(sl); }

  if (track.boostPads.length) {
    const lamps = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: 0x22d3ee, toneMapped: false }));
    const plate = kit.mat.lit({ vertexColors: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }, 'plate');
    for (const l of lamps) { l.polygonOffset = true; l.polygonOffsetFactor = -5; l.polygonOffsetUnits = -5; }
    for (const mesh of buildBoostPads(track, { plate, lamps })) g.add(mesh);
    const dim = new THREE.Color(0x0e6f86), hot = new THREE.Color(0xd9ffff);
    kit.animate((dt, t) => { for (let k = 0; k < 3; k++) { const a = Math.max(0, Math.sin((t * 1.8 - k / 3) * Math.PI * 2)); lamps[k].color.copy(dim).lerp(hot, a * a); } });
  }

  if (def.terrain !== false) {
    const verge = buildVerge(track, M.verge, groundColour); if (verge) g.add(verge);
    const terrain = buildTerrain(track, M.verge, groundColour); if (terrain) g.add(terrain);
  }

  for (const pf of m.platforms) {
    const mat = pf.material ?? (typeof M.platform === 'function' ? (M.platform = M.platform()) : M.platform);
    pf.mesh = buildPlatformMesh(m, pf, mat);      // kept so dressing can hide / offset a moving or flickering deck
    g.add(pf.mesh);
  }

  if (def.water) kit.water(def.water);
  if (def.gantry !== false) g.add(buildGantry(track, 0, def.gantry ?? {}));
  buildSigns(track, kit, def);
}
