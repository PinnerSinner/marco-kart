import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_IDS, ITEMS } from '../src/core/config.js';
import { CHARACTERS, KARTS, TRACKS } from '../src/core/roster.js';
import { itemIcon, ITEM_ICON_IDS, MISSING_ICONS, glyph, GLYPH_NAMES, trophySvg } from '../src/ui/icons.js';
import { portrait, portraitSvg } from '../src/ui/portraits.js';
import { trackArt } from '../src/ui/trackArt.js';
import { kartSvg } from '../src/ui/kartArt.js';
import { logoSvg, unionFlag, waveTileUrl } from '../src/ui/motifs.js';
import { charName } from '../src/ui/chars.js';
import { TIPS, shuffledTips, DIFFICULTY_COPY } from '../src/ui/copy.js';
import { fitMinimap } from '../src/ui/minimap.js';
import { pickDirectional } from '../src/ui/nav.js';
import { units, ring } from '../src/ui/styles/util.js';
import { buildCss } from '../src/ui/styles/index.js';
import { DIFFICULTIES } from '../src/core/config.js';

test('every ITEMS entry has an icon and every icon is valid svg', () => {
  assert.equal(ITEM_ID_CHECK(), true);
  assert.deepEqual(MISSING_ICONS, []);
  assert.equal(ITEM_ICON_IDS.length, ITEM_IDS.length);
  assert.equal(ITEM_IDS.length, 24);
  for (const id of ITEM_IDS) {
    const svg = itemIcon(id);
    assert.match(svg, /^<svg[^>]+viewBox="0 0 64 64"/, id);
    assert.ok(svg.length > 400, `${id} has real artwork`);
    assert.ok(!/NaN|undefined/.test(svg), `${id} has no NaN`);
    assert.equal((svg.match(/<svg/g) || []).length, 1);
  }
  assert.match(itemIcon('nope'), /\?/);
});
function ITEM_ID_CHECK() { return ITEM_IDS.every((id) => ITEMS[id]); }

test('portraits: every character in every mood', () => {
  for (const c of CHARACTERS) for (const mood of ['neutral', 'happy', 'sad']) {
    const s = portrait(c.id, { mood });
    assert.match(s, /^<span class="pt/, c.id);
    assert.match(s, new RegExp(`data-char="${c.id}"`));
    assert.ok(!/NaN|undefined/.test(s), `${c.id}/${mood}`);
    assert.ok(portraitSvg(c.id, mood).includes('<svg'));
  }
  assert.ok(portrait('unknown').includes('data-char="marco"'), 'unknown ids fall back to Marco');
});

test('custom rival keeps its roster name when no asset is supplied', () => {
  assert.equal(charName('biscuit'), 'Biscuit');
  assert.equal(charName('marco'), 'Marco');
});

test('track art, kart art, logo and motifs render without NaN', () => {
  for (const t of TRACKS) { const s = trackArt(t.id); assert.match(s, /^<svg/); assert.ok(!/NaN|undefined/.test(s), t.id); }
  for (const k of KARTS) { const s = kartSvg(k.id, 0xE63946, 0xFFFFFF); assert.match(s, /^<svg/); assert.ok(!/NaN|undefined/.test(s), k.id); }
  assert.match(logoSvg(), /MARCO/); assert.match(logoSvg(), /KART/);
  assert.match(unionFlag(), /^<svg/);
  assert.match(waveTileUrl(), /^url\("data:image\/svg\+xml/);
});

test('SVG ids are unique per instance so cloned artwork cannot collide', () => {
  const idsOf = (s) => [...s.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  const a = idsOf(logoSvg() + trackArt('copacabana')); const b = idsOf(logoSvg() + trackArt('copacabana'));
  assert.equal(new Set([...a, ...b]).size, a.length + b.length);
  assert.notEqual(trophySvg('gold'), trophySvg('gold'));
});

test('glyph table', () => {
  for (const n of GLYPH_NAMES) assert.match(glyph(n), /<svg class="glyph g-/);
  assert.equal(glyph('missing').includes('<svg'), true);
});

test('copy: tips are plenty and shuffle keeps them all', () => {
  assert.ok(TIPS.length >= 20);
  assert.deepEqual([...shuffledTips(3)].sort(), [...TIPS].sort());
  assert.notDeepEqual(shuffledTips(1), shuffledTips(2));
  assert.ok(TIPS.some((t) => /\/24/.test(t)), 'includes the networking gag from the spec');
  for (const d of DIFFICULTIES) assert.ok(DIFFICULTY_COPY[d.id], d.id);
  const american = /\b(color|colour)\b/i; void american;
  for (const t of TIPS) assert.ok(!/\b(color|favorite|organize|tire)\b/i.test(t), `American spelling in: ${t}`);
});

test('minimap fit: maps into the box, mirrored so right is right, and survives junk', () => {
  const outline = [[0, 0], [100, 0], [100, 200], [0, 200]];
  const f = fitMinimap(outline, 100, 10);
  assert.match(f.path, /^M[\d. ]+L/);
  const p = f.project(0, 0, { x: 0, y: 0 });
  const q = f.project(100, 200, { x: 0, y: 0 });
  for (const v of [p.x, p.y, q.x, q.y]) assert.ok(v >= 9.9 && v <= 90.1, `inside the padded box: ${v}`);
  assert.ok(p.x > q.x, 'world +X maps to screen left (yaw 0 faces +Z, right is -X)');
  assert.ok(p.y > q.y, 'world +Z maps up the screen');
  const empty = fitMinimap(null);
  assert.equal(empty.path, '');
  assert.deepEqual(empty.project(5, 5, { x: 0, y: 0 }), { x: 50, y: 50 });
  assert.ok(fitMinimap([[0, 0], [NaN, 4], [5, 5], [9, 1]]).path.length > 0);
});

test('nav: directional focus picks the nearest element in the beam', () => {
  const r = (x, y) => ({ x, y, w: 100, h: 40 });
  const grid = [r(0, 0), r(120, 0), r(240, 0), r(0, 60), r(120, 60), r(240, 60)];
  const from = grid[1];
  const others = grid.filter((g) => g !== from);
  assert.equal(others[pickDirectional(from, others, 'right')], grid[2]);
  assert.equal(others[pickDirectional(from, others, 'left')], grid[0]);
  assert.equal(others[pickDirectional(from, others, 'down')], grid[4]);
  assert.equal(pickDirectional(from, others, 'up'), -1);
  assert.equal(pickDirectional(grid[5], grid.filter((g) => g !== grid[5]), 'right'), -1);
  const stagger = [r(0, 0), r(0, 60), r(130, 70)];
  assert.equal(pickDirectional(stagger[0], stagger.slice(1), 'down'), 0, 'straight down beats the diagonal');
});

test('styles: design units expand and the stylesheet has no unexpanded units', () => {
  assert.equal(units('padding:12u 3.5u;font-size:14f;margin:-4u'), 'padding:calc(var(--u)*12) calc(var(--u)*3.5);font-size:max(10px,calc(var(--u)*14));margin:calc(var(--u)*-4)');
  assert.equal(units('width:100%;color:#22D3EE;animation:x .35s;transition:.5s'), 'width:100%;color:#22D3EE;animation:x .35s;transition:.5s');
  assert.match(ring(2, '#000'), /\d\.\d+u/);
  const css = buildCss();
  assert.ok(css.length > 20000);
  assert.ok(!/(?<![\w#.-])\d*\.?\d+[uf](?![\w-])/.test(css.replace(/url\("[^"]*"\)/g, '')), 'no leftover design units');
  assert.ok(!/NaN|undefined/.test(css));
  const opens = (css.match(/{/g) || []).length; const closes = (css.match(/}/g) || []).length;
  assert.equal(opens, closes, 'balanced braces');
});
