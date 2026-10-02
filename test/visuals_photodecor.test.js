import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrack } from '../src/track/index.js';
import { planDecor, DENSITY, KINDS } from '../src/visuals/photoDecorPlan.js';
import { decorateTrack } from '../src/visuals/photoDecor.js';

const IDS = ['copacabana', 'blighty', 'datacentre', 'marcoverse'];
const tracks = {};
for (const id of IDS) tracks[id] = createTrack(id, { headless: true });

for (const id of IDS) {
  test(`photo plan ${id}: nothing inside road width + kerb, sorted, finite`, () => {
    const t = tracks[id];
    const { items } = planDecor(t, id, { quality: 'high' });
    assert.ok(items.length >= 8, `${id} has ${items.length} items`);
    const kerb = t.road.kerbWidth ?? 1.3;
    for (const it of items) {
      const w = t.sample(it.s).width;
      assert.ok(Number.isFinite(it.s) && Number.isFinite(it.lateral), 'finite');
      assert.ok(Math.abs(it.lateral) >= w / 2 + kerb - 1e-6, `${id} ${it.type} at s=${it.s.toFixed(1)} lateral ${it.lateral.toFixed(1)} inside road width ${w}`);
      assert.ok(it.slug, 'has a photo');
    }
    for (let i = 1; i < items.length; i++) assert.ok(items[i].s >= items[i - 1].s);
  });

  test(`photo plan ${id}: deterministic by seed, varies with seed`, () => {
    const t = tracks[id];
    const a = planDecor(t, id, { seed: 5 }).items, b = planDecor(t, id, { seed: 5 }).items, c = planDecor(t, id, { seed: 6 }).items;
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.map((x) => x.s), c.map((x) => x.s));
  });

  test(`photo plan ${id}: density follows quality; low is at most ~half of high`, () => {
    const t = tracks[id];
    const n = (q) => planDecor(t, id, { quality: q }).items.length;
    assert.ok(n('low') < n('medium') && n('medium') <= n('high'));
    assert.ok(n('low') <= Math.ceil(n('high') * (DENSITY.low + 0.15)));
  });

  test(`photo plan ${id}: same-side neighbours keep their gap, no standing item near the start line`, () => {
    const t = tracks[id];
    const { items } = planDecor(t, id);
    for (const it of items) {
      if (KINDS[it.type].wall) continue;
      const d = Math.min(it.s, t.length - it.s);
      assert.ok(d >= 40, `${it.type} ${d.toFixed(0)} m from the start line`);
    }
    const spans = items.filter((i) => i.span);
    for (let i = 1; i < spans.length; i++) assert.ok(spans[i].s - spans[i - 1].s > 30);
  });
}

test('photo plan: photos are varied (many distinct slugs per track)', () => {
  const { items } = planDecor(tracks.copacabana, 'copacabana');
  assert.ok(new Set(items.map((i) => i.slug)).size >= 6);
});

test('photo plan: hairpin outsides only (standing items avoid the inside of tight bends)', () => {
  for (const id of ['copacabana', 'blighty']) {
    for (const it of planDecor(tracks[id], id).items) {
      if (it.span || KINDS[it.type].wall || Math.abs(it.kappa) <= 0.003) continue;
      assert.equal(it.side, it.kappa > 0 ? -1 : 1, `${id} ${it.type} on inside of a bend`);
    }
  }
});

test('decorateTrack builds in Node (no canvas), reports stats, disposes and rebuilds on quality change', () => {
  const t = tracks.copacabana;
  const holder = { children: [], add(o) { this.children.push(o); } };
  const d = decorateTrack(holder, t, 'copacabana', { quality: 'high' });
  assert.ok(d.group.children.length > 0);
  assert.ok(d.stats.items > 5);
  d.update(3.2);
  const hi = d.group.children.length;
  d.setQuality('low');
  assert.ok(d.group.children.length > 0 && d.stats.items > 0);
  assert.ok(d.stats.items <= hi);
  d.dispose();
  assert.equal(d.group.children.length, 0);
});

test('decorateTrack floats animate on marcoverse', () => {
  const t = tracks.marcoverse;
  const d = decorateTrack(null, t, 'marcoverse', { quality: 'medium' });
  const m = d.group.children.find((c) => c.isInstancedMesh && c.frustumCulled === false);
  assert.ok(m, 'animated float mesh');
  const before = m.instanceMatrix.array.slice(0, 16).join();
  d.update(1.7);
  assert.notEqual(m.instanceMatrix.array.slice(0, 16).join(), before);
  d.dispose();
});

test('photo plan: density override and the Photo props modes', async () => {
  const { PROP_MODES } = await import('../src/visuals/photoDecorPlan.js');
  const t = tracks.copacabana;
  assert.equal(planDecor(t, 'copacabana', { density: 0 }).items.length, 0);
  const n = (mode) => planDecor(t, 'copacabana', { quality: 'high', density: PROP_MODES[mode] ?? undefined }).items.length;
  assert.ok(n('off') === 0 && n('few') < n('lots') && n('auto') === n('lots'));
  const d = decorateTrack(null, t, 'copacabana', { quality: 'high', mode: 'off' });
  assert.equal(d.group.children.length, 0);
  d.setMode('lots');
  assert.ok(d.group.children.length > 0);
  d.dispose();
});
