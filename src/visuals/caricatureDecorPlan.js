// Where Marco's caricature art goes around a track: a pure, deterministic PLAN (no meshes, no canvas), so the placement rules can be unit
// tested in Node. caricatureDecor.js turns a plan into merged geometry. Nothing here edits a track: it only reads `track.length`,
// `track.sample(s)`, `track.query`, `track.road`, `track.model` (walls and kerbs) and `track.boostPads` / `track.jumpRamps`.
//
// Kinds of item:
//   board      giant roadside billboard (square / portrait comic art)           standing beside the road, outside kerb + wall
//   mural      wide low hoarding with a comic mural / synthwave / stencil       standing beside the road
//   statue     big-head bobblehead statue (pavement, plinth, on a server rack, or on a floating island)
//   float      neon-framed art card floating over the void (Marcoverse)
//   wall       graffiti strip or sticker cluster on a track wall (low walls get the "tyre-barrier" sticker clusters)
//   sticker    die-cut face sticker on the tarmac (a decal: it IS on the road, but flat, away from boost pads and jumps)
//   kerb       a run of tiled caricature pattern on the kerb stripe
//   hopscotch  hopscotch of mini portraits on the tarmac just after the start line
//   finish     tiny faces on the white cells of the chequered line
import * as THREE from 'three';
import { makeRng, wrapS, loopDiff } from '../core/util.js';
import { DENSITY, PROP_MODES, SLIM } from './photoDecorPlan.js';
import { artEntries, artFor, shippedEntries, hashStr } from './caricature.js';

export { DENSITY };
/** The 'Caricature art' setting uses the same words and fractions as 'Photo props'. */
export const CARI_MODES = PROP_MODES;

/**
 * Item kinds. `gap`: minimum distance (m of s) to another item on the same side. `margin`: extra clearance (m) beyond kerb and wall.
 */
export const CARI_KINDS = {
  board: { standing: true, gap: 46, margin: 5.5, jitter: 5, avoidPhoto: 18 },
  mural: { standing: true, gap: 52, margin: 4.2, jitter: 3, avoidPhoto: 20 },
  statue: { standing: true, gap: 30, margin: 3.4, jitter: 3, avoidPhoto: 12 },
  float: { floating: true, gap: 24, margin: 9, jitter: 12, avoidPhoto: 8 },
  island: { floating: true, gap: 34, margin: 10, jitter: 9, avoidPhoto: 8 },
  wall: { wall: true, gap: 22, avoidPhoto: 9 },
  sticker: { flat: true, gap: 46 },
  kerb: { kerb: true, gap: 60 },
};

/**
 * Per-track taste. `styles`: art styles per role in preference order; `theme`: words in a piece's name that suit the track.
 * `walls`: wall style names (from the track definition) that may carry graffiti; `statueBase`: pavement | plinth | server | island.
 * `counts`: pieces at high quality. `glow`: the track is dark and bloomy, so art is boosted above 1 for the bloom pass.
 */
export const CARI_PROFILES = {
  copacabana: {
    styles: { board: ['popart', 'toon', 'riso', 'album', 'bighead', 'card'], mural: ['mural', 'synth', 'stencil'], wall: ['stencil', 'mural', 'synth'], sticker: ['sticker', 'stamp', 'mascot'], head: ['head'] },
    theme: ['rio', 'sugarloaf', 'holi', 'flag', 'desert', 'beach', 'sunset', 'snorkel'],
    walls: ['balustrade', 'island'], statueBase: 'pavement', stickerTint: 0.9,
    counts: { board: 9, mural: 3, statue: 9, wall: 16, sticker: 13, kerb: 9 },
  },
  blighty: {
    styles: { board: ['wanted', 'tarot', 'card', 'toon', 'constructivist', 'popart'], mural: ['mural', 'stencil', 'synth'], wall: ['stencil', 'mural'], sticker: ['sticker', 'stamp', 'mascot'], head: ['head'] },
    theme: ['blighty', 'stonehenge', 'couch', 'yoda', 'vatican', 'hippie', 'banana'],
    walls: ['railing', 'brick', 'parapet', 'island'], statueBase: 'plinth', stickerTint: 0.9,
    counts: { board: 9, mural: 3, statue: 8, wall: 16, sticker: 13, kerb: 9 },
  },
  datacentre: {
    styles: { board: ['synth', 'pixel', 'card', 'constructivist'], mural: ['synth', 'mural', 'stencil'], wall: ['synth', 'stencil', 'mural', 'pixel'], sticker: ['pixel', 'sticker', 'mascot'], head: ['head'] },
    theme: ['desk', 'snake', 'chair', 'laptop', 'couch', 'kazakh', 'point'],
    walls: ['rack'], statueBase: 'server', glow: true, stickerTint: 0.78,
    counts: { wall: 20, statue: 9, sticker: 11, kerb: 7 },
  },
  marcoverse: {
    styles: { board: ['synth', 'riso', 'popart', 'pixel', 'bighead', 'album'], mural: ['synth'], wall: [], sticker: ['pixel', 'sticker', 'mascot', 'stamp'], head: ['head'] },
    theme: ['marco', 'desert', 'hippie', 'snake', 'kazakh'],
    walls: [], statueBase: 'island', glow: true, void: true, stickerTint: 1,
    counts: { float: 16, statue: 9, sticker: 12, kerb: 9 },
  },
  default: {
    styles: { board: ['popart', 'toon', 'riso'], mural: ['mural', 'synth'], wall: ['stencil', 'mural'], sticker: ['sticker', 'mascot'], head: ['head'] },
    theme: [], walls: [], statueBase: 'plinth', stickerTint: 0.9,
    counts: { board: 6, statue: 4, sticker: 6, kerb: 4 },
  },
};

// "Less slop": counts are thinned by SLIM (about 40 % fewer), neighbours keep 1.4x the room, anything on the other side of the road keeps
// at least ANY_SIDE_GAP metres, and standing things are never placed beside a real corner.
const GAP_SCALE = 1.4, ANY_SIDE_GAP = 24, MAX_CORNER_KAPPA = 0.012;
const clampV = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Wall at station s on a side: { style, name, height, thickness } or null (no wall model, no wall, or a gap in the road). */
export function wallInfo(track, s, side) {
  const m = track.model, F = m?.F;
  if (!F || !m.cl) return null;
  const N = m.cl.N, i = ((Math.round(s / m.cl.ds) % N) + N) % N;
  if (F.gap && F.gap[i]) return null;
  const style = (side > 0 ? F.wallR : F.wallL)[i];
  if (!style) return null;
  const st = m.wallStyles?.[style - 1];
  return { style, name: st?.name ?? '', height: m.wallHeight?.[style] ?? st?.height ?? 1, thickness: st?.thickness ?? 0.5, shape: st?.shape ?? null };
}

/** Kerb style at station s on a side (0 = no kerb, or a gap). */
export function kerbAt(track, s, side) {
  const m = track.model, F = m?.F;
  if (!F || !m.cl) return 0;
  const N = m.cl.N, i = ((Math.round(s / m.cl.ds) % N) + N) % N;
  if (F.gap && F.gap[i]) return 0;
  return (side > 0 ? F.kerbR : F.kerbL)[i] | 0;
}

/**
 * Things on the road that decals must keep clear of: boost pads (rectangles in s / lateral) and jump ramps (stations).
 * @returns {{s:number, lat:number, hl:number, hw:number}[]} half-length along s and half-width across (hw = Infinity: the whole road width)
 */
export function roadHazards(track) {
  const out = [];
  for (const b of track.boostPads ?? []) if (typeof b.s === 'number') out.push({ s: b.s, lat: b.lateral ?? 0, hl: (b.length ?? 10) / 2, hw: (b.width ?? 5) / 2 });
  for (const r of track.jumpRamps ?? []) {
    let s = r.s;
    if (typeof s !== 'number' && r.x !== undefined && track.query) { try { const q = track.query({ x: r.x, y: r.y ?? 0, z: r.z }, {}); s = q.s; } catch { s = undefined; } }
    if (Number.isFinite(s)) out.push({ s, lat: 0, hl: (r.length ?? 12) / 2 + 3, hw: Infinity });
  }
  return out;
}

/** Does a flat decal of half-size r at (s, lat) touch a hazard (with margin m)? */
export function touchesHazard(hazards, L, s, lat, r, m = 1.4) {
  return hazards.some((h) => Math.abs(loopDiff(h.s, s, L)) < h.hl + r + m && (h.hw === Infinity || Math.abs(lat - h.lat) < h.hw + r + m));
}

/**
 * Plan every caricature placement for a track. Deterministic for a given (trackId, seed, quality, art pool).
 * Rules: standing things stay outside road + kerb + wall clearance and prefer the OUTSIDE of bends; nothing near the start line (except the
 * hopscotch and the finish-line faces, which belong there); neighbours on a side keep a gap; flat decals keep off boost pads and jump ramps;
 * photo props (`avoid`) are never overlapped; density scales with quality (or the player's 'Caricature art' setting).
 * @param {object} track built Track (headless is fine) or anything with length and sample()
 * @param {string} trackId
 * @param {{quality?:'low'|'medium'|'high', seed?:number, entries?:object[], density?:number, avoid?:{s:number,side?:number,gap?:number}[]}} [o]
 *   entries: the art pool (artEntries()); when omitted the installed art is used, falling back to the shipped catalogue so layouts are stable.
 *   density overrides the quality tier's fraction (0 = nothing).
 * @returns {{items: object[], profile: object, seed: number, density: number}}
 */
export function planCaricature(track, trackId, { quality = 'high', seed = 0, entries, density: densityOverride, avoid = [] } = {}) {
  const profile = CARI_PROFILES[trackId] ?? CARI_PROFILES.default;
  const L = track.length;
  const S = ((track.def?.seed ?? 0) * 6151 + hashStr(`caricature:${trackId}`) + seed) >>> 0;
  const density = densityOverride ?? DENSITY[quality] ?? 1;
  const rng = makeRng(S);
  const pool = (entries ?? artEntries()).length ? (entries ?? artEntries()) : shippedEntries();
  if (density <= 0 || !pool.length) return { items: [], profile, seed: S, density };

  // ---- art choosers: ranked per role, cycling so neighbours differ and every piece shows before repeats
  const themed = (e) => profile.theme.some((t) => e.name.includes(t));
  const ranked = (role, o = {}) => {
    const styles = profile.styles[role];
    const list = artFor(role, { entries: pool, styles: styles?.length ? styles : undefined, minAspect: o.min ?? 0, maxAspect: o.max ?? Infinity })
      .filter((e) => !styles?.length || styles.includes(e.style) || !e.known);
    const score = (e, i) => -(styles?.indexOf(e.style) ?? 0) * 0.9 + (themed(e) ? 2.4 : 0) + (e.known ? 0 : 3) + rng() * 1.3 - i * 0.001;
    return list.map((e, i) => [score(e, i), e]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  };
  const chooser = (list, spread = 8) => { const k = clampV(Math.max(spread, 1), 1, list.length); let i = 0; return list.length ? () => list[(i++) % k] : null; };
  const pickers = {
    board: chooser(ranked('board', { min: 0.55, max: 1.75 }), 10),
    mural: chooser(ranked('wall', { min: 1.7 }).concat(ranked('board', { min: 1.7 })).filter((e, i, a) => a.indexOf(e) === i), 5),
    wallStrip: chooser(ranked('wall', { min: 1.7 }), 8),
    sticker: chooser(ranked('sticker', { min: 0.7, max: 1.35 }), 9),
    head: chooser(ranked('head'), 6),
    tile: chooser(artFor('kerb', { entries: pool }), 3),
  };
  const standingBoards = pickers.board;

  const road = track.road ?? {};
  const kerb = road.kerbWidth ?? 1.3, wallGap = road.wallGap ?? 1.4;
  const hazards = roadHazards(track);
  const A = {}, B = {}, q = {}, pt = new THREE.Vector3();
  const items = [];
  const bySide = { '-1': [], '1': [] };
  const kerbRuns = [];

  const nearStart = (s, pad = 45) => Math.abs(loopDiff(0, s, L)) < pad;
  const nearAvoid = (kind, s, side) => {
    const g = CARI_KINDS[kind].avoidPhoto ?? 0;
    return g > 0 && avoid.some((a) => (!a.side || a.side === side) && Math.abs(loopDiff(a.s, s, L)) < g + (a.gap ?? 0));
  };
  const free = (kind, s, side) => bySide[side].every((o) => Math.abs(loopDiff(o.s, s, L)) > Math.min(CARI_KINDS[kind].gap, o.gap) * GAP_SCALE) && (bySide[-side] ?? []).every((o) => Math.abs(loopDiff(o.s, s, L)) > ANY_SIDE_GAP);
  const curvature = (s) => {
    const a = track.sample(s - 6, A), b = track.sample(s + 6, B);
    const h0 = Math.atan2(a.tangent.x, a.tangent.z), h1 = Math.atan2(b.tangent.x, b.tangent.z);
    let d = h1 - h0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    return d / 12;
  };
  /** Ground height beside the road at lateral (null when there is no sensible ground: sea, void, another road, cliff). */
  const groundAt = (s, lateral, half) => {
    track.surfacePoint?.(s, lateral, pt);
    const roadY = track.sample(s, A).pos.y;
    if (profile.void || !track.query) return track.query ? null : roadY;
    const r = track.query({ x: pt.x, y: pt.y, z: pt.z }, q, s);
    if (!r || r.inVoid || r.surface === 'void' || !Number.isFinite(r.height) || Math.abs(r.height - pt.y) > 7 || r.onRoad) return null;
    if (Math.abs(r.lateral) < half + 1 && Math.abs(loopDiff(r.s, s, L)) < 30) return null;
    return r.height;
  };

  const countOf = (kind) => { const c = profile.counts[kind] ?? 0; return c > 0 ? Math.max(1, Math.round(c * SLIM * density)) : 0; };
  const phaseOf = (ki, step) => ((ki * 0.37 + 0.13) % 1) * step;
  const order = ['board', 'mural', 'statue', 'float', 'wall', 'sticker', 'kerb'];

  order.forEach((kind, ki) => {
    const n = countOf(kind);
    if (!n) return;
    const isStatue = kind === 'statue', island = isStatue && profile.statueBase === 'island', server = isStatue && profile.statueBase === 'server';
    const K = CARI_KINDS[island ? 'island' : kind];
    const step = L / n, phase = phaseOf(ki, step);
    for (let i = 0; i < n; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 6 && !placed; attempt++) {
        const s = wrapS(phase + (i + 0.5) * step + (rng() - 0.5) * step * 0.55 + attempt * 13, L);
        if (nearStart(s)) continue;
        const sm = track.sample(s, A);
        const half = sm.width / 2;
        const kap = curvature(s);
        let side = ((i + ki) & 1) ? 1 : -1;
        if (rng() < 0.2) side = -side;

        if (K.flat) {                                        // die-cut sticker on the tarmac
          const art = pickers.sticker?.(); if (!art) continue;
          const size = 3.0 + rng() * 0.6;
          const room = Math.max(0, half - size / 2 - 1.8), lat = (rng() < 0.5 ? -1 : 1) * room * (0.55 + rng() * 0.45);   // towards the edges, off the racing line
          if (touchesHazard(hazards, L, s, lat, size * 0.75)) continue;
          if (bySide['0']?.some((o) => Math.abs(loopDiff(o.s, s, L)) < K.gap)) continue;
          (bySide['0'] ??= []).push({ s, gap: K.gap });
          items.push({ type: 'sticker', s, lateral: lat, side: lat < 0 ? -1 : 1, key: art.key, size, aspect: art.aspect, yaw: (rng() - 0.5) * 0.5 });
          placed = true; continue;
        }

        if (K.kerb) {                                        // a run of kerb tiles
          const art = pickers.tile?.(); if (!art) continue;
          const tiles = 8 + Math.floor(rng() * 6), tile = (road.kerbWidth ?? 1.3) - 0.12, run = tiles * tile;
          const sd = kap > 0.0015 ? 1 : kap < -0.0015 ? -1 : side;           // the inside kerb of a bend: it is the one drivers cut across and see
          const st0 = kerbAt(track, s - run / 2, sd);
          if (!st0 || !(kerbAt(track, s, sd) === st0 && kerbAt(track, s + run / 2, sd) === st0 && kerbAt(track, s + run / 4, sd) === st0 && kerbAt(track, s - run / 4, sd) === st0)) continue;
          if (kerbRuns.some((o) => o.side === sd && Math.abs(loopDiff(o.s, s, L)) < run + 16)) continue;
          kerbRuns.push({ s, side: sd });
          items.push({ type: 'kerb', s, side: sd, lateral: sd * (half + kerb / 2), key: art.key, tiles, tile, run, first: (rng() * 4) | 0 });
          placed = true; continue;
        }

        if (K.wall) {                                        // graffiti strip or sticker cluster on a wall
          if (!profile.walls.length) continue;
          let sd = side, w = wallInfo(track, s, sd);
          if (!w || !profile.walls.includes(w.name)) { sd = -sd; w = wallInfo(track, s, sd); }
          if (!w || !profile.walls.includes(w.name) || w.shape === 'hedge') continue;
          const tall = w.height >= 3;
          const strip = tall || w.shape === 'plane' || rng() < 0.6;
          const art = strip ? pickers.wallStrip?.() : pickers.sticker?.(); if (!art) continue;
          let wid, hgt, pieces = null;
          if (strip) {
            hgt = tall ? Math.min(4.4, w.height * 0.62) : clampV(w.height * 0.9, 0.45, 1.3);
            const n = tall ? 1 : 4;                         // low walls get a run of four pieces side by side, so the strip reads from the car
            pieces = [{ key: art.key, aspect: art.aspect, w: clampV(hgt * art.aspect, 1.4, 9.5) }];
            for (let k = 1; k < n; k++) { const a2 = pickers.wallStrip?.(); if (a2) pieces.push({ key: a2.key, aspect: a2.aspect, w: clampV(hgt * a2.aspect, 1.4, 9.5) }); }
            wid = pieces.reduce((a, p) => a + p.w, 0) + (pieces.length - 1) * 0.12;
          } else { hgt = clampV(w.height * 0.9, 0.45, 1.1); wid = hgt; }
          const reach = strip ? wid : wid * 3.4;
          const ends = [-reach / 2, 0, reach / 2].map((o) => wallInfo(track, s + o, sd));
          if (!ends.every((e) => e && e.style === w.style)) continue;
          if (Math.abs(curvature(s)) > 0.03 && wid > 3) continue;
          if (nearAvoid('wall', s, sd) || !free('wall', s, sd)) continue;
          bySide[sd].push({ s, gap: CARI_KINDS.wall.gap });
          const face = half + wallGap + (w.shape === 'plane' ? w.thickness / 2 : 0);
          const base = { type: 'wall', s, side: sd, lateral: sd * (face - 0.04), wall: w.name, wallHeight: w.height, w: wid, h: hgt, variant: strip ? 'strip' : 'cluster', key: art.key, aspect: art.aspect, pieces, y0: Math.min(w.height * 0.12 + 0.04, tall ? 1.4 : 0.14) };
          if (!strip) base.extra = [pickers.sticker?.()?.key, pickers.sticker?.()?.key].filter(Boolean);
          items.push(base);
          placed = true; continue;
        }

        // ---- standing / floating things from here on
        if (K.standing && !server && Math.abs(kap) > MAX_CORNER_KAPPA) continue;      // nothing beside a corner
        if (K.standing && !server && Math.abs(kap) > 0.003) side = kap > 0 ? -1 : 1;     // outside of the bend: left when the road turns right
        if (nearAvoid(kind, s, side) || !free(island ? 'island' : kind, s, side)) continue;
        const thick = (() => { const w = wallInfo(track, s, side); return w ? Math.max(w.thickness, 0.5) + 1 : 0; })();

        if (server) {                                        // on top of a rack wall
          const w = wallInfo(track, s, side);
          if (!w || !profile.walls.includes(w.name) || w.height < 4) continue;
          const head = pickers.head?.(); if (!head) continue;
          const lat = side * (half + wallGap + Math.max(w.thickness, 1) / 2);
          bySide[side].push({ s, gap: K.gap });
          items.push({ type: 'statue', s, side, lateral: lat, base: 'server', top: w.height, key: head.key, scale: 1.15, phase: rng(), yaw: 0, ground: sm.pos.y });
          placed = true; continue;
        }
        if (K.floating) {
          const art = kind === 'float' ? pickers.board?.() : pickers.head?.(); if (!art) continue;
          const lat = side * (half + 10 + rng() * K.jitter);
          const height = kind === 'float' ? 5 + rng() * 9 : 1.2 + rng() * 3.2;
          if (profile.void && track.query) {                 // an island must hover over the void, not through another stretch of road
            track.surfacePoint(s, lat, pt);
            const r = track.query({ x: pt.x, y: pt.y + height, z: pt.z }, q, s);
            if (r && !r.inVoid && r.surface !== 'void' && Math.abs(r.height - (pt.y + height)) < 14) continue;
          }
          bySide[side].push({ s, gap: K.gap });
          if (kind === 'float') { const size = 6.5 + rng() * 3, a = clampV(art.aspect, 0.6, 1.8); items.push({ type: 'float', s, side, lateral: lat, height, key: art.key, w: a >= 1 ? size : size * a, h: a >= 1 ? size / a : size, aspect: art.aspect, phase: rng(), tilt: (rng() - 0.5) * 0.2 }); }
          else items.push({ type: 'statue', s, side, lateral: lat, base: 'island', height, key: art.key, scale: 1.4, phase: rng(), ground: sm.pos.y });
          placed = true; continue;
        }
        const clear = half + kerb + wallGap + thick + K.margin;
        const lat = side * (clear + rng() * K.jitter);
        const gy = groundAt(s, lat, half);
        if (gy === null) continue;
        if (kind === 'statue') {
          const head = pickers.head?.(); if (!head) continue;
          bySide[side].push({ s, gap: K.gap });
          items.push({ type: 'statue', s, side, lateral: lat, base: profile.statueBase, key: head.key, scale: profile.statueBase === 'plinth' ? 1.4 : 1.55, phase: rng(), ground: gy });
          placed = true; continue;
        }
        const art = (kind === 'mural' ? pickers.mural : standingBoards)?.(); if (!art) continue;
        const a = art.aspect;
        const w = kind === 'mural' ? 13.5 : a >= 1 ? 8.2 : 7.6 * a, h = w / a;
        bySide[side].push({ s, gap: K.gap });
        items.push({ type: kind, s, side, lateral: lat, key: art.key, aspect: a, w, h, bottom: kind === 'mural' ? 0.9 : 2.2, ground: gy, tilt: (rng() - 0.5) * 0.12 });
        placed = true;
      }
    }
  });

  // ---- the two fixed pieces at the start line
  const hw0 = track.sample(0, A).width / 2;
  const stickersForFinish = artFor('sticker', { entries: pool, minAspect: 0.7, maxAspect: 1.35, styles: profile.styles.sticker });
  if (stickersForFinish.length) {
    const cells = [];
    for (let r = 0; r < 2; r++) for (let k = 0; k < 12; k++) if ((k + r) % 2) cells.push({ s: r === 0 ? -1.0 : 0.0, lateral: -hw0 + (2 * hw0 / 12) * (k + 0.5), key: stickersForFinish[(k * 2 + r * 5) % stickersForFinish.length].key });
    items.push({ type: 'finish', s: 0, lateral: 0, cells, size: 0.82 });
  }
  // (no hopscotch of mini portraits on the grid any more: it sat right on the racing line)
  items.sort((a, b) => a.s - b.s);
  return { items, profile, seed: S, density };
}
