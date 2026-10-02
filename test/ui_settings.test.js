import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/ui/storage.js';
import { SettingsModel, defaultSettings, sanitizeSettings, SHAKE_LEVELS } from '../src/ui/settings.js';
import { Progress, sanitizePicks, defaultPicks } from '../src/ui/progress.js';

/** A minimal Storage double. */
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const throwing = () => ({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } });

test('store: round-trips JSON through the backend', () => {
  const be = memStorage();
  const a = createStore({ backend: be });
  assert.equal(a.persistent, true);
  a.set('x', { n: 1 });
  const b = createStore({ backend: be });
  assert.deepEqual(b.get('x'), { n: 1 });
  assert.equal(b.get('missing', 'fb'), 'fb');
});

test('store: falls back to memory when storage throws or is absent', () => {
  for (const be of [throwing(), null]) {
    const s = createStore({ backend: be });
    assert.equal(s.persistent, false);
    assert.equal(s.set('k', [1, 2]), false);
    assert.deepEqual(s.get('k'), [1, 2], 'value survives in memory');
    s.remove('k');
    assert.equal(s.get('k', 'gone'), 'gone');
  }
});

test('store: survives storage that breaks after start, and corrupt JSON', () => {
  const be = memStorage();
  const s = createStore({ backend: be });
  s.set('a', 1);
  be.getItem = () => { throw new Error('boom'); };
  be.setItem = () => { throw new Error('boom'); };
  assert.equal(s.get('a'), 1, 'served from the memory mirror');
  assert.doesNotThrow(() => s.set('b', 2));
  const be2 = memStorage();
  be2.setItem('marcokart.v1.bad', '{not json');
  assert.equal(createStore({ backend: be2 }).get('bad', 'fallback'), 'fallback');
});

test('settings: defaults are sane', () => {
  const d = defaultSettings(false);
  assert.deepEqual(Object.keys(d).sort(), ['blips', 'bubbles', 'cameraShake', 'quality', 'rude', 'speech', 'speechMarco', 'speedClass', 'touch', 'units', 'volume']);
  assert.equal(d.speedClass, 100, 'game speed defaults to 100 Mbps');
  assert.equal(sanitizeSettings({ speedClass: '150' }, d).speedClass, 150);
  assert.equal(sanitizeSettings({ speedClass: 77 }, d).speedClass, 100, 'unknown classes fall back');
  assert.deepEqual(Object.keys(d.volume).sort(), ['master', 'music', 'sfx', 'voice']);
  assert.equal(d.touch, false);
  assert.equal(defaultSettings(true).touch, true);
});

test('settings: sanitize clamps, rejects junk and keeps valid fields', () => {
  const base = defaultSettings(false);
  const s = sanitizeSettings({ volume: { master: 3, music: -1, sfx: 'x', voice: 0.333 }, quality: 'ultra', units: 'mph', cameraShake: 7, touch: 'yes' }, base);
  assert.equal(s.volume.master, 1);
  assert.equal(s.volume.music, 0);
  assert.equal(s.volume.sfx, base.volume.sfx, 'NaN keeps the default');
  assert.equal(s.volume.voice, 0.33);
  assert.equal(s.quality, base.quality, 'unknown quality rejected');
  assert.equal(s.units, 'mph');
  assert.equal(s.cameraShake, 1);
  assert.equal(s.touch, false, 'non-boolean rejected');
  assert.deepEqual(sanitizeSettings(null, base), base);
  assert.deepEqual(sanitizeSettings('junk', base), base);
});

test('settings: set persists, emits ui:settings with the full payload, and reloads', () => {
  const be = memStorage();
  const events = [];
  const m = new SettingsModel(createStore({ backend: be }), (n, d) => events.push([n, d]));
  m.set({ quality: 'high', units: 'mph', volume: { music: 0.2 } });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], 'ui:settings');
  assert.equal(events[0][1].quality, 'high');
  assert.equal(events[0][1].volume.music, 0.2);
  assert.equal(events[0][1].volume.master, defaultSettings().volume.master, 'untouched volumes stay');
  const m2 = new SettingsModel(createStore({ backend: be }), () => {});
  assert.equal(m2.get().quality, 'high');
  assert.equal(m2.get().units, 'mph');
  assert.equal(m2.get().volume.music, 0.2);
});

test('settings: get() returns a copy, reset restores defaults', () => {
  const m = new SettingsModel(createStore({ backend: memStorage() }), () => {});
  const g = m.get(); g.volume.master = 0; g.quality = 'low';
  assert.notEqual(m.get().volume.master, 0);
  m.set({ quality: 'low' }); m.reset();
  assert.equal(m.get().quality, defaultSettings().quality);
});

test('settings: camera shake levels are ordered 0..1', () => {
  assert.deepEqual(SHAKE_LEVELS.map((l) => l.value), [0, 0.5, 1]);
});

test('progress: best times only improve and report what was beaten', () => {
  const p = new Progress(createStore({ backend: memStorage() }));
  let r = p.record('copacabana', 3, { bestLap: 60, time: 190 });
  assert.equal(r.newBestLap, true); assert.equal(r.newBestRace, true);
  assert.deepEqual(p.getBest('copacabana', 3), { bestLap: 60, bestRace: 190 });
  r = p.record('copacabana', 3, { bestLap: 61, time: 189 });
  assert.equal(r.newBestLap, false); assert.equal(r.newBestRace, true);
  assert.equal(r.prevBestRace, 190);
  assert.deepEqual(p.getBest('copacabana', 3), { bestLap: 60, bestRace: 189 });
  assert.equal(p.getBest('copacabana', 5).bestRace, null, 'race records are per lap count');
  assert.equal(p.getBest('copacabana').bestLap, 60, 'lap records are shared');
  assert.deepEqual(p.getBest('blighty', 3), { bestLap: null, bestRace: null });
});

test('progress: ignores DNF / junk times', () => {
  const p = new Progress(createStore({ backend: memStorage() }));
  const r = p.record('blighty', 3, { bestLap: null, time: null });
  assert.equal(r.newBestLap, false); assert.equal(r.newBestRace, false);
  p.record('blighty', 3, { bestLap: NaN, time: -4 });
  assert.deepEqual(p.getBest('blighty', 3), { bestLap: null, bestRace: null });
});

test('progress: picks are validated against the roster and merged', () => {
  const p = new Progress(createStore({ backend: memStorage() }));
  assert.deepEqual(p.getPicks(), defaultPicks());
  p.savePicks({ charId: 'rex', kartId: 'hauler' });
  p.savePicks({ difficulty: 'specialty', trackId: 'blighty', laps: 5 });
  assert.deepEqual(p.getPicks(), { charId: 'rex', kartId: 'hauler', difficulty: 'specialty', trackId: 'blighty', laps: 5 });
  const bad = sanitizePicks({ charId: 'mario', kartId: 'zzz', difficulty: 'easy', trackId: 'rainbow', laps: 99 });
  assert.deepEqual(bad, defaultPicks());
});
