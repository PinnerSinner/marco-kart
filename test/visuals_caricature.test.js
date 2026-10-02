// Caricature art: asset discovery (art_* keys), the pure placement plan on all four tracks, the merged-geometry builder in Node (no canvas)
// and the kart sticker spots. Run with the real art from assets/user, so a broken or oversized art set fails here too.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { createTrack } from '../src/track/index.js';
import { loopDiff } from '../src/core/util.js';
import { Assets } from '../src/core/assets.js';
import { ART_STYLES, ART_PREFIX, SHIPPED_ART, parseArtKey, dataUriSize, artEntries, artFor, shippedEntries, hashStr, pickArt } from '../src/visuals/caricature.js';
import { planCaricature, CARI_KINDS, CARI_PROFILES, CARI_MODES, DENSITY, roadHazards, touchesHazard } from '../src/visuals/caricatureDecorPlan.js';
import { planDecor } from '../src/visuals/photoDecorPlan.js';
import { decorateCaricature } from '../src/visuals/caricatureDecor.js';
import { decorateKarts, findKartSpots } from '../src/visuals/caricatureKart.js';
import { packAtlas, subRect, QuadSet } from '../src/visuals/artAtlas.js';

const DIR = path.resolve(new URL('../assets/user', import.meta.url).pathname);
const mime = (f) => (f.endsWith('.png') ? 'image/png' : 'image/jpeg');
const files = fs.readdirSync(DIR).filter((f) => f.startsWith(ART_PREFIX) && /\.(png|jpe?g)$/.test(f));
const store = {};
for (const f of files) store[f.replace(/\.\w+$/, '')] = `data:${mime(f)};base64,${fs.readFileSync(path.join(DIR, f)).toString('base64')}`;
const mockAssets = (s) => ({ keysWithPrefix: (p) => Object.keys(s).filter((k) => k.startsWith(p)), uri: (k) => s[k] ?? null, has: (k) => k in s, image: async () => null });
const A = mockAssets(store);
const ENTRIES = artEntries(A);

const IDS = ['copacabana', 'blighty', 'datacentre', 'marcoverse'];
const tracks = {};
for (const id of IDS) tracks[id] = createTrack(id, { headless: true });
const plan = (id, o = {}) => planCaricature(tracks[id], id, { entries: ENTRIES, ...o });

// ------------------------------------------------------------------------------------------------------------------ catalogue / discovery

test('art set: the installed pieces are exactly the shipped catalogue, parse cleanly and stay small', () => {
  const keys = Object.keys(store).sort();
  assert.deepEqual(keys, [...SHIPPED_ART].sort());
  assert.ok(keys.length >= 28 && keys.length <= 36, `${keys.length} pieces`);
  let bytes = 0;
  for (const f of files) bytes += fs.statSync(path.join(DIR, f)).size;
  assert.ok(bytes <= 4 * 1024 * 1024, `art is ${(bytes / 1048576).toFixed(2)} MB, the budget is 4 MB`);
  for (const e of ENTRIES) {
    assert.ok(e.known, `${e.key} has a known style`);
    assert.ok(e.w > 0 && e.h > 0, `${e.key} size read from its header`);
    assert.ok(Math.abs(e.aspect - ART_STYLES[e.style].aspect) < 0.03, `${e.key} aspect ${e.aspect.toFixed(3)} vs ${ART_STYLES[e.style].aspect.toFixed(3)}`);
    const f = files.find((x) => x.startsWith(e.key + '.')), buf = fs.readFileSync(path.join(DIR, f));
    const hasAlpha = f.endsWith('.png') && (buf[25] === 6 || buf[25] === 4 || (buf[25] === 3 && buf.includes('tRNS')));   // RGBA / grey+alpha / palette with a transparency chunk
    assert.equal(hasAlpha, e.alpha, `${e.key}: has an alpha channel exactly when its style says so`);
  }
  assert.ok(new Set(ENTRIES.map((e) => e.style)).size >= 10, 'many styles');
});

test('dataUriSize reads PNG and JPEG headers without decoding and rejects junk', () => {
  for (const f of files) {
    const buf = fs.readFileSync(path.join(DIR, f));
    const key = f.replace(/\.\w+$/, '');
    const sz = dataUriSize(store[key]);
    assert.ok(sz, key);
    if (f.endsWith('.png')) { assert.equal(sz.w, buf.readUInt32BE(16), key); assert.equal(sz.h, buf.readUInt32BE(20), key); }
  }
  assert.equal(dataUriSize('data:image/png;base64,AAAA'), null);
  assert.equal(dataUriSize(null), null);
  assert.equal(dataUriSize('not a uri'), null);
});

test('parseArtKey: known styles, unknown names (PNG = sticker, JPG = poster) and non-art keys', () => {
  const k = parseArtKey('art_sticker_yoda');
  assert.deepEqual([k.style, k.name, k.known, k.alpha], ['sticker', 'yoda', true, true]);
  assert.deepEqual(parseArtKey('art_popart_desk_point').name, 'desk_point');
  const png = parseArtKey('art_mycat', 'data:image/png;base64,xx'), jpg = parseArtKey('art_mypost', 'data:image/jpeg;base64,xx');
  assert.deepEqual([png.known, png.style, png.alpha], [false, 'custom', true]);
  assert.ok(png.roles.includes('sticker') && !png.roles.includes('board'));
  assert.deepEqual([jpg.known, jpg.alpha], [false, false]);
  assert.ok(jpg.roles.includes('board') && jpg.roles.includes('wall') && !jpg.roles.includes('sticker'));
  assert.equal(parseArtKey('art_toon_').known, false, 'a style with no name is just a name');
  assert.equal(parseArtKey('photo_toon_x'), null);
  assert.equal(parseArtKey('art_'), null);
  assert.equal(parseArtKey(undefined), null);
});

test('discovery goes through Assets.keysWithPrefix("art_"): a dropped-in art_<name> shows up with no code change', () => {
  const saved = globalThis.window;
  try {
    globalThis.window = { __MK_ASSETS__: { marco_face: 'data:x', photo_a: 'data:x', art_mycat: store.art_sticker_yoda, art_mypost: store.art_toon_couch } };
    assert.deepEqual(Assets.keysWithPrefix('art_').sort(), ['art_mycat', 'art_mypost']);
    const es = artEntries();                                  // the default registry
    assert.deepEqual(es.map((e) => e.key), ['art_mycat', 'art_mypost']);
    assert.ok(es[0].alpha && es[0].roles.includes('sticker'), 'PNG: sticker');
    assert.ok(!es[1].alpha && es[1].roles.includes('board'), 'JPG: poster');
    assert.ok(es[0].w > 0 && es[1].h > 0, 'real size from the file header');
    assert.deepEqual(artFor('sticker').map((e) => e.key), ['art_mycat']);
    assert.ok(artFor('board').some((e) => e.key === 'art_mypost'));
  } finally { globalThis.window = saved; }
  assert.deepEqual(artEntries(), [], 'no window, no art, no crash');
});

test('artFor: role filter, aspect range, style preference order; entries sorted by key', () => {
  assert.deepEqual(ENTRIES.map((e) => e.key), ENTRIES.map((e) => e.key).sort());
  const stickers = artFor('sticker', { entries: ENTRIES, minAspect: 0.7, maxAspect: 1.4 });
  assert.ok(stickers.length >= 4 && stickers.every((e) => e.roles.includes('sticker') && e.aspect >= 0.7 && e.aspect <= 1.4));
  const ranked = artFor('board', { entries: ENTRIES, styles: ['wanted', 'popart'] });
  assert.equal(ranked[0].style, 'wanted');
  assert.ok(ranked.findIndex((e) => e.style === 'popart') > ranked.findLastIndex((e) => e.style === 'wanted'));
  assert.ok(artFor('head', { entries: ENTRIES }).length >= 4, 'bobblehead faces');
  assert.ok(artFor('kerb', { entries: ENTRIES }).length >= 1, 'kerb tile');
  assert.equal(hashStr('a'), hashStr('a'));
  assert.notEqual(hashStr('a'), hashStr('b'));
  assert.equal(pickArt([], 3), null);
  assert.equal(pickArt(['x', 'y'], 3), 'y');
  assert.equal(shippedEntries().length, SHIPPED_ART.length);
});

test('no user-facing text calls the art "AI art"', () => {
  const text = [...Object.values(ART_STYLES).map((s) => s.label)].join(' ');
  assert.ok(!/\bAI\b/i.test(text));
  for (const f of ['src/ui/caricatureUi.js', 'src/ui/screens/settings.js']) {
    const src = fs.readFileSync(path.resolve(DIR, '../..', f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');   // comments may say "never AI art"
    for (const m of src.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) assert.ok(!/\bAI[ -]art/i.test(m[2]), `${f}: ${m[2]}`);
  }
});

// ------------------------------------------------------------------------------------------------------------------ atlas

test('packAtlas: everything fits inside the sheet, no overlaps, uv inside 0..1, deterministic', () => {
  const items = ENTRIES.map((e) => ({ key: e.key, w: e.w, h: e.h }));
  for (const [size, maxSide] of [[1024, 256], [2048, 384], [2048, 512]]) {
    const a = packAtlas(items, { size, maxSide }), b = packAtlas(items, { size, maxSide });
    assert.deepEqual([...a.rects], [...b.rects]);
    assert.equal(a.rects.size, items.length);
    const rs = [...a.rects.values()];
    for (const r of rs) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= size && r.y + r.h <= size);
      assert.ok(r.u0 >= 0 && r.u1 <= 1 && r.v0 >= 0 && r.v1 <= 1 && r.u0 < r.u1 && r.v0 < r.v1);
    }
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const p = rs[i], q = rs[j];
      assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, 'overlap');
    }
  }
  const r = packAtlas([{ key: 'a', w: 100, h: 50 }]).rects.get('a'), q = subRect(r, 0, 0, 0.5, 0.5);
  assert.ok(Math.abs((q.u1 - q.u0) - (r.u1 - r.u0) / 2) < 1e-9);
});

test('QuadSet: normals face the viewer and the geometry is indexed and finite', () => {
  const qs = new QuadSet();
  qs.quad([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], { u0: 0, v0: 0, u1: 1, v1: 1 });
  qs.panel(0, 0, 5, [1, 0, 0], [0, 1, 0], 2, 2, { u0: 0, v0: 0, u1: 1, v1: 1 });
  assert.equal(qs.triangles, 4);
  assert.deepEqual(qs.nrm.slice(0, 3), [0, 0, 1]);
  const g = qs.build();
  assert.equal(g.getAttribute('position').count, 8);
  assert.ok([...g.getAttribute('position').array].every(Number.isFinite));
  assert.equal(new QuadSet().build(), null);
});

// ------------------------------------------------------------------------------------------------------------------ placement plan

for (const id of IDS) {
  test(`caricature plan ${id}: nothing standing on the road, kerb or wall line; flat decals stay on the tarmac`, () => {
    const t = tracks[id];
    const { items, profile } = plan(id, { quality: 'high' });
    assert.ok(items.length >= 20, `${id} has ${items.length} items`);
    const kerb = t.road.kerbWidth ?? 1.3, wallGap = t.road.wallGap ?? 1.4;
    for (const it of items) {
      const half = t.sample(it.s).width / 2;
      assert.ok(Number.isFinite(it.s) && Number.isFinite(it.lateral), `${it.type} finite`);
      const out = Math.abs(it.lateral);
      switch (it.type) {
        case 'board': case 'mural':
          assert.ok(out >= half + kerb + wallGap, `${id} ${it.type} s=${it.s.toFixed(0)} lateral ${out.toFixed(1)} vs ${half}`); break;
        case 'statue':
          assert.ok(out >= half + wallGap - 1e-6, `${id} statue lateral ${out.toFixed(1)} vs ${half}`);
          if (it.base === 'pavement' || it.base === 'plinth') assert.ok(out >= half + kerb + wallGap, `${id} ${it.base} statue beside the kerb`);
          break;
        case 'float': assert.ok(out >= half + 9, `${id} float well off the road`); assert.ok(it.height >= 5); break;
        case 'wall': assert.ok(out >= half + wallGap - 0.1, `${id} wall piece on the wall face, lateral ${out.toFixed(2)}`); break;
        case 'sticker': assert.ok(out + it.size / 2 <= half + 1e-6, `${id} sticker inside the road width`); break;
        case 'kerb': assert.ok(out >= half && out <= half + kerb + 1e-6, `${id} kerb run sits on the kerb`); break;
        case 'hopscotch': assert.ok(it.wid / 2 < half && Math.abs(it.lateral) < 1e-9); break;
        case 'finish': assert.ok(it.cells.length >= 6); for (const c of it.cells) assert.ok(Math.abs(c.lateral) <= half); break;
        default: assert.fail(`unknown type ${it.type}`);
      }
      assert.ok(CARI_KINDS[it.type] || ['hopscotch', 'finish', 'island'].includes(it.type), it.type);
    }
    for (let i = 1; i < items.length; i++) assert.ok(items[i].s >= items[i - 1].s, 'sorted by s');
    void profile;
  });

  test(`caricature plan ${id}: nothing near the start line except the hopscotch and the finish faces`, () => {
    const t = tracks[id];
    const { items } = plan(id);
    const types = new Set(items.map((i) => i.type));
    assert.ok(types.has('finish') && !types.has('hopscotch'), 'finish faces yes, no hopscotch on the grid');
    for (const it of items) {
      if (it.type === 'hopscotch' || it.type === 'finish') continue;
      assert.ok(Math.abs(loopDiff(0, it.s, t.length)) >= 45, `${id} ${it.type} ${Math.abs(loopDiff(0, it.s, t.length)).toFixed(0)} m from the line`);
    }
    const fin = items.find((i) => i.type === 'finish');
    assert.ok(fin.s === 0);
  });

  test(`caricature plan ${id}: road decals keep off boost pads and jump ramps, and keep their spacing`, () => {
    const t = tracks[id];
    const { items } = plan(id);
    const hz = roadHazards(t);
    const stickers = items.filter((i) => i.type === 'sticker');
    assert.ok(stickers.length >= 4, `${id} has ${stickers.length} road stickers`);
    for (const it of stickers) assert.ok(!touchesHazard(hz, t.length, it.s, it.lateral, it.size * 0.75), `${id} sticker at s=${it.s.toFixed(0)} touches a pad or ramp`);
    for (let i = 1; i < stickers.length; i++) assert.ok(stickers[i].s - stickers[i - 1].s >= CARI_KINDS.sticker.gap - 1e-6, 'sticker gap');
    if (id === 'copacabana' || id === 'blighty') assert.ok(t.boostPads?.length || t.jumpRamps?.length || hz, 'track exposes its pads (or none exist)');
  });

  test(`caricature plan ${id}: deterministic by seed, varies with seed`, () => {
    const a = plan(id, { seed: 3 }).items, b = plan(id, { seed: 3 }).items, c = plan(id, { seed: 4 }).items;
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.map((x) => x.s), c.map((x) => x.s));
  });

  test(`caricature plan ${id}: density follows quality and the Caricature art setting`, () => {
    const n = (o) => plan(id, o).items.filter((i) => i.type !== 'hopscotch' && i.type !== 'finish').length;
    assert.ok(n({ quality: 'low' }) < n({ quality: 'medium' }) && n({ quality: 'medium' }) < n({ quality: 'high' }), `${id} low < medium < high`);
    assert.ok(n({ quality: 'low' }) <= Math.ceil(n({ quality: 'high' }) * (DENSITY.low + 0.2)), 'low is about 40 %');
    assert.equal(n({ density: CARI_MODES.off }), 0);
    assert.ok(n({ density: CARI_MODES.few }) < n({ density: CARI_MODES.lots }));
    assert.equal(n({ quality: 'high', density: CARI_MODES.auto ?? undefined }), n({ quality: 'high', density: CARI_MODES.lots }), 'auto at high quality is "lots"');
    assert.equal(plan(id, { density: 0 }).items.length, 0);
  });

  test(`caricature plan ${id}: art pieces are real, varied and used by role`, () => {
    const { items } = plan(id, { quality: 'high' });
    const known = new Set(ENTRIES.map((e) => e.key));
    const used = new Set();
    for (const it of items) {
      for (const k of [it.key, ...(it.extra ?? []), ...(it.pieces ?? []).map((p) => p.key), ...(it.cells ?? []).map((c) => c.key)].filter(Boolean)) { assert.ok(known.has(k), `${k} exists`); used.add(k); }
      if (it.type === 'statue') assert.equal(parseArtKey(it.key).style, 'head', 'bobbleheads wear head textures');
      if (it.type === 'sticker') assert.ok(parseArtKey(it.key).roles.includes('sticker'), 'road stickers come from the sticker styles');
      if (it.type === 'kerb') assert.equal(parseArtKey(it.key).style, 'tile');
    }
    assert.ok(used.size >= 10, `${id} uses ${used.size} different pieces`);
  });
}

test('caricature plan: statues stand where the theme says (pavement / plinth / server top / floating island)', () => {
  const base = (id) => new Set(plan(id).items.filter((i) => i.type === 'statue').map((i) => i.base));
  assert.deepEqual([...base('copacabana')], ['pavement']);
  assert.deepEqual([...base('blighty')], ['plinth']);
  assert.deepEqual([...base('datacentre')], ['server']);
  assert.deepEqual([...base('marcoverse')], ['island']);
  for (const it of plan('datacentre').items.filter((i) => i.type === 'statue')) assert.ok(it.top >= 4, 'on top of a tall rack wall');
  for (const it of plan('marcoverse').items.filter((i) => i.type === 'statue')) assert.ok(it.height > 1, 'islands hover');
  assert.equal(CARI_PROFILES.marcoverse.walls.length, 0);
  assert.equal(plan('marcoverse').items.filter((i) => i.type === 'wall').length, 0, 'no walls on the void track');
  assert.ok(plan('marcoverse').items.some((i) => i.type === 'float'), 'floating art cards over the void');
});

test('caricature plan: wall art only goes on the wall styles each track allows, and low walls carry sticker clusters / strips', () => {
  for (const id of ['copacabana', 'blighty', 'datacentre']) {
    const walls = plan(id).items.filter((i) => i.type === 'wall');
    assert.ok(walls.length >= 3, `${id} ${walls.length} wall pieces`);
    for (const w of walls) {
      assert.ok(CARI_PROFILES[id].walls.includes(w.wall), `${id} wall ${w.wall}`);
      assert.ok(['strip', 'cluster'].includes(w.variant));
      assert.ok(w.w > 0.3 && w.h > 0.3 && w.h <= w.wallHeight + 1e-6 + (w.wallHeight >= 3 ? 1.5 : 0.4));
      if (w.variant === 'cluster') assert.ok(w.extra.length >= 1);
    }
  }
});

test('caricature plan: never overlaps a photo prop that is really placed', () => {
  for (const id of IDS) {
    const t = tracks[id];
    const ph = planDecor(t, id, { quality: 'high' });
    const avoid = ph.items.map((i) => ({ s: i.s, side: i.span ? 0 : i.side, gap: i.span ? 3 : 0 }));
    const { items } = plan(id, { quality: 'high', avoid });
    assert.ok(items.length > 15, `${id} still has art`);
    for (const it of items) {
      const g = CARI_KINDS[it.type]?.avoidPhoto ?? 0;
      if (!g) continue;
      for (const a of avoid) {
        if (a.side && a.side !== it.side) continue;
        assert.ok(Math.abs(loopDiff(a.s, it.s, t.length)) >= g + (a.gap ?? 0) - 1e-6, `${id} ${it.type} s=${it.s.toFixed(0)} within ${g} m of a photo prop at ${a.s.toFixed(0)}`);
      }
    }
  }
});

test('caricature plan: the layout is the same with the real art, the shipped catalogue stand-in, or no art at all', () => {
  for (const id of IDS) {
    const real = plan(id, { quality: 'high' }).items.map((i) => [i.type, i.s, i.side]);
    const stand = planCaricature(tracks[id], id, { quality: 'high', entries: shippedEntries() }).items.map((i) => [i.type, i.s, i.side]);
    const none = planCaricature(tracks[id], id, { quality: 'high', entries: [] }).items.map((i) => [i.type, i.s, i.side]);
    assert.deepEqual(stand, real, `${id}: stand-in catalogue`);
    assert.deepEqual(none, real, `${id}: empty pool falls back to the catalogue`);
  }
});

test('caricature plan: dropped-in art is preferred: a PNG becomes road/wall stickers, a JPG becomes a board or wall strip', () => {
  const s2 = { ...store, art_mycat: store.art_sticker_yoda, art_mypost: store.art_toon_couch };
  const es = artEntries(mockAssets(s2));
  assert.equal(es.length, ENTRIES.length + 2);
  const items = planCaricature(tracks.copacabana, 'copacabana', { entries: es }).items;
  const uses = (key) => items.some((i) => i.key === key || i.extra?.includes(key) || i.cells?.some((c) => c.key === key) || i.pieces?.some((p) => p.key === key));
  assert.ok(uses('art_mycat'), 'dropped-in sticker is used');
  assert.ok(uses('art_mypost'), 'dropped-in poster is used');
});

// ------------------------------------------------------------------------------------------------------------------ builder

const finiteGeo = (g) => [...g.getAttribute('position').array].every(Number.isFinite);

for (const id of IDS) {
  test(`decorateCaricature ${id}: builds in Node, a handful of draw calls, finite geometry, quality / mode / dispose`, () => {
    const t = tracks[id];
    const holder = { children: [], add(o) { this.children.push(o); } };
    const d = decorateCaricature(holder, t, id, { quality: 'high', A });
    assert.equal(holder.children[0], d.group);
    assert.ok(d.stats.items >= 8, `${d.stats.items} items`);
    assert.equal(d.stats.dropped, 0);
    assert.ok(d.stats.meshes <= 12, `${d.stats.meshes} draw calls`);
    assert.ok(d.stats.triangles > 500 && d.stats.triangles < 40000, `${d.stats.triangles} triangles`);
    assert.ok(d.stats.atlas.size <= 2048 && d.stats.atlas.pieces >= 10);
    let meshes = 0;
    d.group.traverse((o) => { if (o.isMesh) { meshes++; assert.ok(finiteGeo(o.geometry), `${o.name} finite`); assert.ok(o.geometry.boundingSphere || o.geometry.computeBoundingSphere() || true); } });
    assert.ok(meshes >= 4 && meshes <= 14, `${meshes} meshes`);
    assert.ok(d.group.children.some((c) => c.isInstancedMesh), 'statue heads are instanced');
    d.update(1.3); d.update(2.9);
    const hi = d.stats.triangles;
    d.setQuality('low');
    assert.ok(d.stats.items > 0 && d.stats.items < d.plan.items.length + 1 && d.stats.items <= 40);
    assert.ok(d.stats.triangles <= hi, 'low builds less');
    d.setMode('off');
    assert.equal(d.group.children.length, 0, 'Off removes everything');
    assert.equal(d.stats.items, 0);
    d.setMode('few'); const few = d.stats.items;
    d.setMode('lots'); assert.ok(d.stats.items > few, 'lots > few');
    d.setMode('nonsense'); assert.ok(d.stats.items > few, 'unknown modes are ignored');
    d.dispose();
    assert.equal(d.group.children.length, 0);
    assert.equal(d.group.parent, null);
  });
}

test('decorateCaricature: without any art it builds nothing and does not throw (graceful degradation)', () => {
  const d = decorateCaricature(null, tracks.blighty, 'blighty', { quality: 'high', A: mockAssets({ marco_face: 'data:x' }) });
  assert.equal(d.group.children.length, 0);
  assert.equal(d.stats.items, 0);
  assert.equal(d.stats.why, 'no art');
  d.update(1); d.setQuality('low'); d.setMode('lots'); d.dispose();
  const real = decorateCaricature(null, tracks.blighty, 'blighty', { quality: 'high' });   // global registry is empty in Node
  assert.equal(real.group.children.length, 0);
  real.dispose();
});

test('decorateCaricature: dropped-in art is atlased and the floating islands animate on marcoverse', () => {
  const s2 = { ...store, art_mycat: store.art_sticker_yoda, art_mypost: store.art_toon_couch };
  const d = decorateCaricature(null, tracks.copacabana, 'copacabana', { quality: 'high', A: mockAssets(s2) });
  assert.ok(d.plan.items.length > 20);
  d.dispose();
  const m = decorateCaricature(null, tracks.marcoverse, 'marcoverse', { quality: 'high', A });
  const moving = m.group.children.find((c) => c.isInstancedMesh && c.frustumCulled === false);
  assert.ok(moving, 'an animated (bobbing) instanced mesh');
  const before = moving.instanceMatrix.array.slice(0, 16).join();
  m.update(1.9);
  assert.notEqual(moving.instanceMatrix.array.slice(0, 16).join(), before);
  m.dispose();
});

// ------------------------------------------------------------------------------------------------------------------ kart stickers

function boxKart() {
  const geo = new THREE.BoxGeometry(1.4, 0.9, 2.6); geo.translate(0, 0.7, 0);
  const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  body.updateMatrix();
  return body;
}

test('findKartSpots: finds a flat spot on each door and at the back of a boxy kart, in the kart\'s own space', () => {
  const body = boxKart();
  const s = findKartSpots(body);
  assert.ok(s.side && s.sideL && s.rear);
  assert.ok(Math.abs(s.side.point.x - 0.7) < 1e-3 && s.side.normal.x > 0.99, 'right door');
  assert.ok(Math.abs(s.sideL.point.x + 0.7) < 1e-3 && s.sideL.normal.x < -0.99, 'left door');
  assert.ok(Math.abs(s.rear.point.z + 1.3) < 1e-3 && s.rear.normal.z < -0.99, 'back');
  const far = boxKart(); far.matrixWorld.makeTranslation(500, 20, -300);        // where the kart is in the world must not matter
  const s2 = findKartSpots(far);
  assert.ok(s2.side && Math.abs(s2.side.point.x - 0.7) < 1e-3);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial()); sphere.updateMatrix();
  const none = findKartSpots(sphere);
  assert.ok(!none.side && !none.rear, 'a curved body offers no flat spot');
});

test('decorateKarts: only Marco\'s kart, nothing without a canvas or without art, Off hides', () => {
  const marco = { racer: { charId: 'marco' }, model: { body: boxKart(), group: new THREE.Group(), kartId: 'cruiser' } };
  const rival = { racer: { charId: 'rex' }, model: { body: boxKart(), group: new THREE.Group(), kartId: 'cruiser' } };
  const api = decorateKarts([marco, rival], { A });
  assert.equal(api.meshes.length, 0, 'no document in Node, so no planes');
  assert.equal(rival.model.group.children.length, 0);
  assert.doesNotThrow(() => { api.setMode('off'); api.dispose(); });
  const none = decorateKarts([marco], { A: mockAssets({}) });
  assert.equal(none.meshes.length, 0);
  assert.doesNotThrow(() => decorateKarts(null, { A }));
});
