// Where Marco's photos go around a track: a pure, deterministic PLAN (no meshes, no canvas), so the placement rules can be unit tested in Node.
// photoDecor.js turns a plan into instanced geometry. The plan only reads `track.length`, `track.sample(s)` and (optionally) `track.model`,
// `track.road`, `track.jumpRamps`, `track.query`; it never edits the track.
import { makeRng, wrapS, loopDiff, angleDiff } from '../core/util.js';
import { PHOTOS, availablePhotos } from '../core/photos.js';
import { Assets } from '../core/assets.js';

/** "Less slop": the catalogue counts below are thinned by this factor (about 40 % fewer props) and neighbours keep more room. */
export const SLIM = 0.6;
const GAP_SCALE = 1.5, ANY_SIDE_GAP = 22, MAX_CORNER_KAPPA = 0.012;

/** Density multiplier per quality tier (fraction of the high-quality item count). */
export const DENSITY = { low: 0.4, medium: 0.7, high: 1 };

/** User setting 'Photo props' -> density fraction (null = follow the quality tier). */
export const PROP_MODES = { auto: null, lots: 1, few: 0.3, off: 0 };

/**
 * Item kinds. `standing`: rooted on the ground beside the road. `span`: crosses over the road (only its posts are on the ground).
 * `gap`: minimum distance (m of s) to another item on the same side. `margin`: extra clearance (m) beyond kerb and wall.
 */
export const KINDS = {
  billboard: { standing: true, gap: 34, margin: 4.5, lateralJitter: 5 },
  hoarding: { standing: true, gap: 30, margin: 3.5, lateralJitter: 2.5 },
  polaroid: { standing: true, gap: 16, margin: 2.6, lateralJitter: 3 },
  stand: { standing: true, gap: 46, margin: 6, lateralJitter: 3 },
  jumbo: { standing: true, gap: 70, margin: 7, lateralJitter: 3 },
  bunting: { span: true, gap: 40, margin: 1.6, lateralJitter: 0 },
  gantry: { span: true, gap: 120, margin: 1.8, lateralJitter: 0 },
  wallscreen: { wall: true, gap: 26, margin: 0, lateralJitter: 0 },
  float: { floating: true, gap: 14, margin: 12, lateralJitter: 12 },
};

/**
 * Per-track taste and counts (at high quality). `tags` / `moods` steer which photos are used; `poster` is the tourist-poster wording.
 * `glow`: screens boosted above 1 so the post-process bloom picks them up. `void`: the track has no ground beside the road.
 */
export const PROFILES = {
  copacabana: {
    tags: ['rio', 'beach', 'travel'], moods: ['happy', 'cool'],
    counts: { billboard: 12, hoarding: 6, polaroid: 16, stand: 6, bunting: 7, gantry: 3, jumbo: 3 },
    poster: [{ title: 'VISIT RIO', sub: 'Sun, sand and Sugarloaf' }, { title: 'COPACABANA', sub: 'Four kilometres of pure joy' }, { title: 'CARIOCA SUMMER', sub: 'Book your caipirinha now' }],
  },
  blighty: {
    tags: ['uk', 'travel', 'costume', 'cool'], moods: ['happy', 'funny'],
    counts: { billboard: 11, hoarding: 8, polaroid: 14, stand: 6, bunting: 7, gantry: 3, jumbo: 3 },
    poster: [{ title: 'VISIT BLIGHTY', sub: 'Mind the gap' }, { title: 'STONES & SCONES', sub: 'A day out for all the family' }, { title: 'CUPPA COUNTRY', sub: 'Milk in second. Obviously' }],
  },
  datacentre: {
    tags: ['setup', 'teaching', 'home', 'sad'], moods: ['calm', 'sad', 'cool'], glow: true,
    counts: { wallscreen: 26 },
    poster: [{ title: 'UPTIME', sub: 'Five nines and a flat white' }],
  },
  marcoverse: {
    tags: ['funny', 'costume', 'travel'], moods: ['funny', 'happy', 'cool'], glow: true, void: true,
    counts: { float: 34, polaroid: 8, jumbo: 3 },
    poster: [{ title: 'MARCOVERSE', sub: 'Every photo, everywhere' }],
  },
  default: {
    tags: ['travel'], moods: ['happy', 'cool', 'funny'],
    counts: { billboard: 8, polaroid: 8, bunting: 4, jumbo: 1 },
    poster: [{ title: 'MARCOVERSE', sub: 'Brought to you by Marco' }],
  },
};

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const clampV = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Photos to use: the ones that exist, or the whole catalogue when no assets are loaded (so layouts stay identical). */
export function photoPool(A = Assets) {
  const have = availablePhotos(A);
  return have.length ? have : PHOTOS;
}

/**
 * Order the photo pool by how well it suits a profile (tag hits weigh most, then mood), with a little seeded shuffle for variety.
 * @param {object[]} pool entries of PHOTOS
 * @param {{tags:string[],moods:string[]}} profile
 * @param {() => number} rng
 * @returns {object[]} best first
 */
export function rankPhotos(pool, profile, rng) {
  const score = (p) => p.tags.reduce((a, t) => a + (profile.tags.includes(t) ? 3 : 0), 0) + (profile.moods.includes(p.mood) ? 1.5 : 0) + rng() * 1.6;
  return pool.map((p) => [score(p), p]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

/** Stateful, cycling chooser over a ranked list: item i takes the next photo, so neighbours differ and every photo is used before repeats. */
function chooser(ranked, prefer) {
  const k = clampV(Math.max(prefer, 6), 1, ranked.length);
  let i = 0;
  return () => ranked[(i++) % k];
}

/** Photo aspect (w/h) of a catalogue entry. */
export const aspectOf = (p) => (p.aspect === 'portrait' ? 0.75 : p.aspect === 'square' ? 1 : 1.3333);

/**
 * Wall on one side at station s (undefined when the track has no wall model). Height in metres or 0.
 * @returns {number}
 */
export function wallHeightAt(track, s, side) {
  const m = track.model, F = m?.F;
  if (!F || !m.cl) return 0;
  const i = Math.round(s / m.cl.ds) % m.cl.N;
  const style = (side > 0 ? F.wallR : F.wallL)[i];
  return style ? (m.wallHeight?.[style] ?? 1) : 0;
}

/** Signed curvature (1/m, + = turns right) from tangent headings either side of s. Works on any track (StubTrack included). */
function curvature(track, s, a = {}, b = {}) {
  const A = track.sample(s - 6, a), B = track.sample(s + 6, b);
  return angleDiff(Math.atan2(A.tangent.x, A.tangent.z), Math.atan2(B.tangent.x, B.tangent.z)) / 12;
}

/** Station numbers within `pad` metres of a jump ramp (photo arches over the road would be a hazard for airborne karts). */
function rampStations(track, pad = 38) {
  const out = [];
  for (const r of track.jumpRamps ?? []) {
    if (typeof r.s === 'number') { out.push(r.s); continue; }
    if (r.x === undefined || !track.query) continue;
    try { const q = track.query({ x: r.x, y: r.y ?? 0, z: r.z }, {}); if (Number.isFinite(q.s)) out.push(q.s); } catch { /* ignore */ }
  }
  return { list: out, pad };
}

/**
 * Plan every photo placement for a track. Deterministic for a given (trackId, seed, quality, photo pool).
 * Rules: nothing stands within road width + kerb + wall clearance; standing things prefer the OUTSIDE of bends so they never hide the apex;
 * nothing near the start line or a jump; neighbours on the same side keep a minimum gap; density scales with quality.
 * @param {object} track built Track (headless is fine) or any object with length and sample()
 * @param {string} trackId
 * @param {{quality?: 'low'|'medium'|'high', seed?: number, pool?: object[], density?: number}} [o] density overrides the quality tier's fraction (0 = nothing)
 * @returns {{ items: object[], profile: object, seed: number }}
 */
export function planDecor(track, trackId, { quality = 'high', seed = 0, pool, density: densityOverride } = {}) {
  const profile = PROFILES[trackId] ?? PROFILES.default;
  const L = track.length;
  const S = ((track.def?.seed ?? 0) * 7919 + hashStr(trackId) + seed) >>> 0;
  const rng = makeRng(S);
  const ranked = rankPhotos(pool ?? photoPool(), profile, rng);
  const preferred = ranked.filter((p) => p.tags.some((t) => profile.tags.includes(t))).length;
  const pick = chooser(ranked, preferred);
  const density = densityOverride ?? DENSITY[quality] ?? 1;
  if (density <= 0) return { items: [], profile, seed: S };
  const road = track.road ?? {};
  const kerb = road.kerbWidth ?? 1.3, wallGap = road.wallGap ?? 1.4;
  const avoid = rampStations(track);
  const A = {}, B = {};
  const items = [];
  const bySide = { '-1': [], '1': [] };
  const spans = [];

  const nearStart = (s) => Math.abs(loopDiff(0, s, L)) < 45;
  const nearRamp = (s) => avoid.list.some((r) => Math.abs(loopDiff(r, s, L)) < avoid.pad);
  const free = (kind, s, side) => {
    const gap = KINDS[kind].gap * GAP_SCALE;
    if (KINDS[kind].span) return spans.every((o) => Math.abs(loopDiff(o, s, L)) > gap);
    const any = KINDS[kind].floating ? 8 : ANY_SIDE_GAP;      // never two props close together, even across the road
    return bySide[side].every((o) => Math.abs(loopDiff(o.s, s, L)) > Math.min(gap, o.gap * GAP_SCALE)) && bySide[-side].every((o) => Math.abs(loopDiff(o.s, s, L)) > any);
  };

  // kinds in a fixed order so seeds stay stable; each has its own phase so kinds do not all pile up at the same s
  const order = Object.keys(KINDS).filter((k) => profile.counts[k]);
  order.forEach((kind, ki) => {
    const K = KINDS[kind];
    const n = Math.max(profile.counts[kind] > 0 ? 1 : 0, Math.round(profile.counts[kind] * SLIM * density));
    const step = L / n, phase = ((ki * 0.37 + 0.13) % 1) * step;
    for (let i = 0; i < n; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 5 && !placed; attempt++) {
        const s = wrapS(phase + (i + 0.5) * step + (rng() - 0.5) * step * 0.5 + attempt * 11, L);
        if (nearStart(s) && !K.wall) continue;
        if (nearRamp(s) && (K.span || K.floating)) continue;
        const sm = track.sample(s, A);
        const half = sm.width / 2;
        const kap = curvature(track, s, A, B);
        if (K.span && Math.abs(kap) > 0.02) continue;
        if (!K.span && !K.wall && !K.floating && Math.abs(kap) > MAX_CORNER_KAPPA) continue;      // nothing beside a corner, where it distracts
        let side = ((i + ki) & 1) ? 1 : -1;
        if (rng() < 0.2) side = -side;
        if (!K.span && Math.abs(kap) > 0.003) side = kap > 0 ? -1 : 1;     // outside of the bend: left when the road turns right
        if (K.wall) { if (wallHeightAt(track, s, side) < 6) { side = -side; if (wallHeightAt(track, s, side) < 6) continue; } }
        if (!free(kind, s, side)) continue;
        const photo = pick();
        const ph = { slug: photo.slug, mood: photo.mood, aspect: photo.aspect, caption: photo.caption };
        const wall = K.wall ? 0 : wallHeightAt(track, s, side) ? 1.6 : 0;
        const clear = half + kerb + wallGap + wall + K.margin;
        const lateral = side * (K.wall ? half + wallGap : clear + rng() * K.lateralJitter);
        const item = { type: kind, s, side, lateral, span: !!K.span, half, kappa: kap, ...ph, phase: rng(), tilt: (rng() - 0.5) * 0.14 };
        const poster = profile.poster[Math.floor(rng() * profile.poster.length)];
        Object.assign(item, { title: poster.title, sub: poster.sub, glow: !!profile.glow });
        // alternates for things that cycle or repeat photos (jumbotrons, bunting)
        if (kind === 'jumbo' || kind === 'bunting' || kind === 'stand') item.alt = [pick().slug, pick().slug, pick().slug];
        if (kind === 'float') { item.lateral = side * (half + 8 + rng() * K.lateralJitter * 1.4); item.height = 5 + rng() * 9; item.size = 6 + rng() * 4; }
        if (K.wall) item.height = 3.3 + rng() * 1.3;
        items.push(item);
        if (K.span) spans.push(s); else bySide[side].push({ s, gap: K.gap });
        placed = true;
      }
    }
  });
  items.sort((a, b) => a.s - b.s);
  return { items, profile, seed: S };
}
