// In-race HUD layout: the held item and the minimap are sized from min(viewport height, 55% of width) with sane clamps, the lap-time panel
// sits under the minimap, and the HUD's own size units expand fully.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hudUnits } from '../src/ui/styles/util.js';
import { buildCss } from '../src/ui/styles/index.js';
import { hudCss } from '../src/ui/styles/hud.js';
import { itemsCss } from '../src/ui/styles/items.js';

test('hudUnits: item and minimap units expand to the --iu / --mu scale, text has a floor', () => {
  assert.equal(hudUnits('width:76i'), 'width:calc(var(--iu)*76)');
  assert.equal(hudUnits('font-size:7.8t'), 'font-size:max(11px,calc(var(--iu)*7.8))');
  assert.equal(hudUnits('gap:8m'), 'gap:calc(var(--mu)*8)');
  assert.equal(hudUnits('font-size:25k'), 'font-size:max(10px,calc(var(--mu)*25))');
  assert.equal(hudUnits('a:nth-child(2) .5s #FF3DCB 40%'), 'a:nth-child(2) .5s #FF3DCB 40%', 'nothing else is touched');
});

test('hud css: item box about a fifth of the height, minimap at least 1.5x the old one, both capped by width and clamped', () => {
  const css = hudCss();
  assert.match(css, /--hv:min\(1vh,\.55vw\)/, 'height, but never more than a width fraction');
  assert.match(css, /--isz:clamp\(76px,calc\(var\(--hv\)\*19\.5\),220px\)/);
  assert.match(css, /--msz:clamp\(120px,calc\(var\(--hv\)\*34\),400px\)/);
  assert.match(css, /\.timer\{width:var\(--msz\)/, 'the lap-time panel is as wide as the minimap it sits under');
  assert.match(css, /\.minimap\{[^}]*width:var\(--msz\)/);
});

test('hud css: the caption only takes space while an item is held, and the stylesheet has no leftover units', () => {
  const css = itemsCss();
  assert.match(css, /\.item-pop\{[^}]*display:none/);
  assert.match(css, /\.item-pop\.has,\.item-pop\.on\{display:block\}/);
  assert.match(css, /\.ip-rname\{[^}]*font-size:max\(11px,calc\(var\(--iu\)\*13\)\)/);
  const all = buildCss().replace(/url\("[^"]*"\)/g, '');
  assert.ok(!/(?<![\w#.-])\d*\.?\d+[ifmtk](?![\w-])/.test(all.replace(/nth-child\(\d+n\)/g, '')), 'no unexpanded HUD units');
});
