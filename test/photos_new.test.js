// The photos added with the "less slop" pass: certificate (Marco only), graduation (strangers blurred), passport (portrait only).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PHOTOS } from '../src/core/photos.js';
import { createTrack } from '../src/track/index.js';
import { planDecor } from '../src/visuals/photoDecorPlan.js';

const NEW = ['certificate', 'graduation', 'passport'];
const dir = new URL('../assets/user/', import.meta.url).pathname;
const jpegSize = (f) => { const b = fs.readFileSync(dir + f); let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2); } return null; };

test('new photos are registered once, with caption, mood, aspect and tags', () => {
  const slugs = PHOTOS.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'unique slugs');
  for (const s of NEW) {
    const p = PHOTOS.find((x) => x.slug === s);
    assert.ok(p, s);
    assert.ok(p.caption.length > 5 && p.tags.length >= 1 && ['happy', 'cool', 'funny', 'calm', 'sad'].includes(p.mood) && ['portrait', 'landscape', 'square'].includes(p.aspect), s);
  }
  assert.equal(PHOTOS.find((p) => p.slug === 'passport').caption, 'Official ID. Allegedly.');
  for (const dup of ['banana_suit2', 'banana_marathon', 'yoda2']) assert.ok(!slugs.includes(dup), `${dup} is a duplicate of an existing shot and was skipped`);
});

test('new photo files exist; face crops are 320 px squares; the passport portrait is a portrait', () => {
  for (const s of NEW) {
    assert.ok(fs.existsSync(`${dir}photo_${s}.jpg`) && fs.existsSync(`${dir}face_${s}.jpg`), s);
    assert.deepEqual(jpegSize(`face_${s}.jpg`), { w: 320, h: 320 }, s);
    const sz = jpegSize(`photo_${s}.jpg`);
    assert.ok(Math.max(sz.w, sz.h) <= 810 && sz.h >= sz.w, `${s} portrait frame ${sz.w}x${sz.h}`);
    const p = PHOTOS.find((x) => x.slug === s);
    assert.equal(p.aspect, 'portrait');
  }
  const pp = jpegSize('marco_passport.jpg');
  assert.ok(pp && pp.h > pp.w && pp.w <= 800);
  assert.ok(!fs.readdirSync(dir).some((f) => /\.pdf$/i.test(f)), 'no PDF in the assets');
});

for (const id of ['copacabana', 'blighty', 'datacentre', 'marcoverse']) {
  test(`new photos are used by the placement plan on ${id}`, () => {
    const t = createTrack(id, { headless: true });
    const pool = PHOTOS.filter((p) => NEW.includes(p.slug));
    const { items } = planDecor(t, id, { quality: 'high', pool });
    assert.ok(items.length >= 3);
    assert.ok(items.every((i) => NEW.includes(i.slug)));
    assert.equal(new Set(items.map((i) => i.slug)).size, 3, 'all three appear');
  });
}

test('less slop: the photo props are about 40 % fewer than the old catalogue counts', () => {
  const old = { copacabana: 12 + 6 + 16 + 6 + 7 + 3 + 3, blighty: 11 + 8 + 14 + 6 + 7 + 3 + 3, datacentre: 26, marcoverse: 34 + 8 + 3 };
  for (const id of Object.keys(old)) {
    const n = planDecor(createTrack(id, { headless: true }), id, { quality: 'high' }).items.length;
    assert.ok(n <= old[id] * 0.7, `${id}: ${n} props vs ${old[id]} before`);
  }
});
