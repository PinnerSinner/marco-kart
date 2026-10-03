// Caricature art in the UI: the setting, the picking helpers and the collage builders, run against a tiny fake DOM (no browser needed) and the
// real art from assets/user. The real-browser look is covered by test/demo_visuals_caricature_play.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ---- a minimal fake DOM: just what h() and the collage builders touch
class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.attrs = {}; this.dataset = {}; this.parent = null; this.hidden = false;
    this.className = ''; this.listeners = {}; this.vars = {};
    const self = this;
    this.classList = {
      add(c) { const l = self.className ? self.className.split(' ') : []; if (!l.includes(c)) l.push(c); self.className = l.join(' '); },
      contains(c) { return self.className.split(' ').includes(c); },
      toggle(c, on) { const has = this.contains(c); if (on === undefined ? !has : on) this.add(c); else self.className = self.className.split(' ').filter((x) => x !== c).join(' '); },
    };
    this.style = { setProperty: (k, v) => { self.vars[k] = v; } };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  append(...kids) { for (const k of kids) { if (k == null) continue; if (k.nodeType === 1) k.parent = this; this.children.push(k); } }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  addEventListener(n, f) { (this.listeners[n] ??= []).push(f); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  set innerHTML(v) { this.html = String(v); this.content = { firstElementChild: new FakeEl('svg') }; }
  set textContent(v) { this.children = [{ nodeType: 3, text: String(v) }]; }
  find(pred, out = []) { for (const c of this.children) if (c.nodeType === 1) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
}
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ nodeType: 3, text: t }) };

// ---- the real art as data URIs
const DIR = path.resolve(new URL('../assets/user', import.meta.url).pathname);
const store = {};
for (const f of fs.readdirSync(DIR)) if (f.startsWith('art_') && /\.(png|jpe?g)$/.test(f)) store[f.replace(/\.\w+$/, '')] = `data:${f.endsWith('.png') ? 'image/png' : 'image/jpeg'};base64,${fs.readFileSync(path.join(DIR, f)).toString('base64')}`;
globalThis.window = { __MK_ASSETS__: { ...store } };

const ui = await import('../src/ui/caricatureUi.js');
const { artEntries } = await import('../src/visuals/caricature.js');
const { SettingsScreen } = await import('../src/ui/screens/settings.js');
const { PHOTO_PROPS } = await import('../src/ui/photoUi.js');
const { buildCss } = await import('../src/ui/styles/index.js');
const { Assets } = await import('../src/core/assets.js');

const hasArt = () => Object.keys(globalThis.window.__MK_ASSETS__).some((k) => k.startsWith('art_'));
const withNoArt = (fn) => { const saved = globalThis.window.__MK_ASSETS__; globalThis.window.__MK_ASSETS__ = { marco_face: 'data:x' }; try { return fn(); } finally { globalThis.window.__MK_ASSETS__ = saved; } };

test('Caricature art setting: the same four words as Photo props, auto by default, validated, announced on the bus', async () => {
  assert.deepEqual(ui.CARICATURE_ART.map((o) => o.id), ['auto', 'lots', 'few', 'off']);
  assert.deepEqual(ui.CARICATURE_ART.map((o) => o.id), PHOTO_PROPS.map((o) => o.id), 'sibling row of Photo props');
  assert.deepEqual(ui.CARICATURE_ART.map((o) => o.label), ['Auto', 'Lots', 'Few', 'Off']);
  assert.equal(ui.getCaricatureArt(), 'auto');
  const { bus } = await import('../src/core/events.js').catch(() => import('../src/core/bus.js'));
  const seen = [];
  const off = bus.on('ui:caricatureart', (v) => seen.push(v));
  ui.setCaricatureArt('few'); assert.equal(ui.getCaricatureArt(), 'few');
  ui.setCaricatureArt('nonsense'); assert.equal(ui.getCaricatureArt(), 'few', 'unknown values are ignored');
  ui.setCaricatureArt('off'); assert.equal(ui.getCaricatureArt(), 'off');
  ui.setCaricatureArt('auto'); assert.equal(ui.getCaricatureArt(), 'auto');
  assert.deepEqual(seen, ['few', 'off', 'auto']);
  off?.();
  assert.deepEqual(Object.keys(ui.COLLAGE_AMOUNT).sort(), ['auto', 'few', 'lots', 'off']);
  assert.equal(ui.COLLAGE_AMOUNT.off, 0);
  assert.ok(ui.COLLAGE_AMOUNT.few < ui.COLLAGE_AMOUNT.auto && ui.COLLAGE_AMOUNT.auto < ui.COLLAGE_AMOUNT.lots);
});

test('uiPieces / pickCaricature: kinds pick fitting pieces, deterministically; null without art', () => {
  assert.ok(hasArt());
  const all = ui.uiPieces();
  assert.ok(all.length >= 20 && all.every((e) => e.roles.includes('ui')));
  const p = ui.pickCaricature('poster', 2); assert.ok(!p.alpha && p.aspect >= 0.55 && p.aspect <= 1.1);
  const w = ui.pickCaricature('wide', 1); assert.ok(!w.alpha && w.aspect >= 1.6);
  const s = ui.pickCaricature('sticker', 0); assert.ok(s.alpha);
  const b = ui.pickCaricature('badge', 0); assert.ok(b.alpha && ['sticker', 'mascot'].includes(b.style) && b.aspect >= 0.8 && b.aspect <= 1.25);
  assert.ok(['popart', 'album', 'card', 'toon', 'bighead'].includes(ui.pickCaricature('win', 3).style));
  assert.ok(['wanted', 'tarot', 'pixel', 'constructivist'].includes(ui.pickCaricature('lose', 3).style));
  assert.ok(/rio|sugarloaf|flag|holi/.test(ui.pickCaricature('track:copacabana', 0).name));
  assert.ok(ui.pickCaricature('track:nowhere', 0), 'unknown kinds still give a piece');
  assert.ok(ui.pickCaricature('mystery', 5));
  assert.equal(ui.pickCaricature('poster', 7).key, ui.pickCaricature('poster', 7).key, 'deterministic');
  assert.notEqual(ui.pickCaricature('poster', 0).key, ui.pickCaricature('poster', 1).key, 'seed varies the pick');
  assert.equal(withNoArt(() => ui.pickCaricature('poster', 0)), null);
  assert.deepEqual(withNoArt(() => ui.uiPieces()), []);
});

test('caricatureCard: a framed picture; die-cut for alpha pieces; null for nothing', () => {
  const poster = ui.caricatureCard(ui.pickCaricature('poster', 0), { tilt: 5 });
  assert.ok(poster.classList.contains('cari-card') && !poster.classList.contains('die'));
  assert.equal(poster.vars['--tilt'], '5deg');
  const img = poster.children[0]; assert.equal(img.tagName, 'IMG'); assert.match(img.attrs.src, /^data:image\//); assert.equal(img.attrs.alt, '');
  assert.equal(poster.attrs['aria-hidden'], 'true');
  const die = ui.caricatureCard(ui.pickCaricature('sticker', 0), { cls: 'pc' });
  assert.ok(die.classList.contains('die') && die.classList.contains('pc'));
  assert.equal(ui.caricatureCard(null), null);
  assert.equal(ui.caricatureCard('art_does_not_exist'), null, 'a key with no data');
  assert.ok(ui.caricatureCard('art_sticker_yoda').classList.contains('die'), 'asset keys work too and PNG keys are die-cut');
});

test('collages: wall, scatter, corner and badge build from the art, scale with the setting, and vanish when Off or without art', () => {
  const wall = ui.caricatureWall(1, { cols: 5, rows: 3 });
  assert.ok(wall.classList.contains('cari-wall') && wall.children.length >= 6 && wall.children.length <= 15);
  assert.equal(String(wall.vars['--cols']), '5');
  assert.ok(ui.caricatureWall(1, { cols: 5, rows: 3, amount: 1.5 }).children.length >= ui.caricatureWall(1, { cols: 5, rows: 3, amount: 0.5 }).children.length);
  assert.equal(ui.caricatureWall(1, { amount: 0 }), null);

  for (const slots of ['podium', 'any']) {
    const sc = ui.caricatureScatter(4, { count: 7, slots });
    assert.ok(sc.classList.contains('cari-scatter') && sc.children.length >= 2 && sc.children.length <= 12, slots);
    for (const c of sc.children) {
      assert.match(c.vars['--x'], /^\d+%$/); assert.match(c.vars['--y'], /^\d+%$/); assert.ok(Number(c.vars['--w']) > 80);
      assert.ok(c.classList.contains('pc'));
    }
  }
  const stickersOnly = ui.caricatureScatter(0, { count: 6, kind: 'stickers', slots: 'podium' });
  assert.ok(stickersOnly.children.every((c) => c.classList.contains('die')), 'the podium collage is die-cut stickers only');
  const any = ui.caricatureScatter(0, { count: 7, slots: 'any' }), podium = ui.caricatureScatter(0, { count: 7, slots: 'podium' });
  assert.notDeepEqual(any.children.map((c) => c.vars['--x'] + c.vars['--y']), podium.children.map((c) => c.vars['--x'] + c.vars['--y']), 'each layout has its own slots');
  const podiumYs = podium.children.map((c) => parseFloat(c.vars['--y']));
  assert.ok(podiumYs.every((y) => y >= 50), 'podium stickers stay in the bottom half, clear of the results header');
  assert.equal(ui.caricatureScatter(0, { amount: 0 }), null);

  const corner = ui.caricatureCorner(2);
  assert.ok(corner.classList.contains('cari-corner') && corner.children.length >= 1);
  assert.equal(ui.caricatureCorner(2, { amount: 0 }), null);

  const badge = ui.caricatureBadge();
  assert.equal(badge.tagName, 'IMG'); assert.ok(badge.classList.contains('hud-badge')); assert.equal(badge.hidden, false);

  withNoArt(() => {
    assert.equal(ui.caricatureWall(0), null); assert.equal(ui.caricatureScatter(0), null); assert.equal(ui.caricatureCorner(0), null); assert.equal(ui.caricatureBadge(), null);
  });
});

test('the badge starts hidden when the setting is Off', () => {
  ui.setCaricatureArt('off');
  try {
    assert.equal(ui.caricatureBadge().hidden, true);
    assert.equal(ui.caricatureWall(0), null, 'collages default to the current amount, which is 0');
    assert.equal(ui.caricatureScatter(0), null);
  } finally { ui.setCaricatureArt('auto'); }
});

test('backdrop: layers are built lazily per screen layout, shown by data-screen, rebuilt on refresh', () => {
  const bd = ui.caricatureBackdrop();
  assert.ok(bd.el.classList.contains('bg-cari'));
  assert.equal(bd.layers.size, 0, 'nothing built until a screen needs it');
  bd.show('title'); assert.equal(bd.layers.size, 0, 'the title screen has no collage');
  bd.show('menu'); assert.equal(bd.layers.size, 0, 'the main menu has no collage: its photo card is part of the layout');
  bd.show('loading'); assert.equal(bd.layers.size, 1);
  bd.show('loading'); assert.equal(bd.layers.size, 1, 'layers are reused');
  bd.show('char'); bd.show('kart'); assert.equal(bd.layers.size, 1, 'the select screens have no collage');
  bd.show('results'); bd.show('podium'); assert.equal(bd.layers.size, 2);
  const loadingLayer = bd.layers.get('loading');
  assert.equal(loadingLayer.dataset.k, 'loading'); assert.match(loadingLayer.dataset.for, /\bloading\b/);
  assert.ok(loadingLayer.children[0]?.classList.contains('cari-wall'));
  assert.ok(bd.layers.get('podium').children[0]?.classList.contains('cari-scatter'));
  bd.refresh();
  assert.ok(bd.layers.size >= 1 && bd.layers.get('podium'), 'the screen showing last is rebuilt');
  assert.equal(withNoArt(() => { const b2 = ui.caricatureBackdrop(); b2.show('loading'); return b2.layers.get('loading').children.length; }), 0, 'an empty layer without art');
});

test('layoutFor / COLLAGE_LAYOUTS: the screens that get a collage, and the ones that do not', () => {
  for (const s of ['loading', 'podium', 'standings', 'results']) assert.ok(ui.layoutFor(s), s);
  for (const s of ['menu', 'items', 'char', 'kart', 'difficulty', 'track', 'title', 'settings', 'hud', 'pause', 'about', 'nope']) assert.equal(ui.layoutFor(s), null, s);
  assert.equal(ui.layoutFor('podium'), ui.layoutFor('results'));
});

test('caricatureCss: shows each collage on its screens, no NaN, honours reduced motion and small screens, styles the settings row and badge', () => {
  const css = ui.caricatureCss();
  for (const s of Object.keys(ui.COLLAGE_LAYOUTS)) assert.ok(css.includes(`.mk[data-screen="${s}"] .bg-cari .cl[data-for~="${s}"]`), s);
  for (const needle of ['.cari-wall', '.cari-card', '.cari-scatter', '.cari-corner', '.pause-cari', '.hud-badge', '.row-cari', 'prefers-reduced-motion', 'max-width:820px']) assert.ok(css.includes(needle), needle);
  assert.ok(!/NaN|undefined|\bAI art\b/.test(css));
  assert.equal((css.match(/\{/g) ?? []).length, (css.match(/\}/g) ?? []).length, 'balanced braces');
  const full = buildCss();
  assert.ok(full.includes('.bg-cari') && full.includes('.hud-badge'), 'part of the shared stylesheet');
  assert.ok(!/\d(u|f)\b/.test(full.replace(/url\([^)]*\)/g, '')), 'design units were all converted');
});

test('Settings screen: a Caricature art row follows Photo props and uses the same options', () => {
  const calls = [];
  const fakeUi = { settings: { get: () => ({ volume: { master: 0.8, music: 0.6, sfx: 0.8, voice: 0.9 }, quality: 'medium', cameraShake: 1, touch: false, units: 'kmh', speedClass: 100, speech: true, speechMarco: true, rude: true, blips: false, bubbles: true }), set: (p) => calls.push(p), reset() {} }, hud: { setUnits() {} }, sfx() {} };
  const screen = new SettingsScreen(fakeUi);
  screen.el = new FakeEl('section');
  screen.build();
  const rows = screen.el.find((el) => el.classList.contains('row'));
  const labels = rows.map((r) => r.find((x) => x.tagName === 'SPAN').map((x) => x.children[0]?.text).join(''));
  const iPhoto = rows.findIndex((r) => r === screen.photos.el), iCari = rows.findIndex((r) => r === screen.cari.el);
  assert.ok(iPhoto >= 0 && iCari === iPhoto + 1, `Caricature art row right after Photo props (${labels.join(' | ')})`);
  assert.ok(screen.cari.el.classList.contains('row-cari'));
  const btns = screen.cari.el.find((el) => el.tagName === 'BUTTON');
  assert.deepEqual(btns.map((b) => b.dataset.id), ['auto', 'lots', 'few', 'off']);
});

test('the Assets registry the UI uses sees dropped-in art without any code change', () => {
  globalThis.window.__MK_ASSETS__.art_my_new_drawing = store.art_toon_couch;
  try {
    assert.ok(Assets.keysWithPrefix('art_').includes('art_my_new_drawing'));
    const e = artEntries().find((x) => x.key === 'art_my_new_drawing');
    assert.ok(e && !e.known && e.roles.includes('ui'), 'poster for the collages');
    assert.ok(ui.uiPieces().some((x) => x.key === 'art_my_new_drawing'));
  } finally { delete globalThis.window.__MK_ASSETS__.art_my_new_drawing; }
});
