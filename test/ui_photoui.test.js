import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { __MK_ASSETS__: { photo_marina_laugh: 'data:x', photo_headache: 'data:x', photo_squish: 'data:x', photo_stonehenge: 'data:x', photo_snorkel: 'data:x', marco_face: 'data:x', marco_face_hit: 'data:x' } };
const { pickPhotoFor, PHOTO_PROPS } = await import('../src/ui/photoUi.js');
const { faceKeyFor } = await import('../src/ui/hudFace.js');

test('pickPhotoFor: mood-matched picks from the photos that exist', () => {
  assert.equal(pickPhotoFor('win').slug, 'marina_laugh');
  assert.equal(pickPhotoFor('lose').slug, 'headache');
  assert.equal(pickPhotoFor('hit').slug, 'squish');
  assert.equal(pickPhotoFor('track:blighty').slug, 'stonehenge');
  assert.equal(pickPhotoFor('track:copacabana').slug, 'snorkel');
  assert.ok(pickPhotoFor('any', 3));
});

test('pickPhotoFor: null when there are no photos', () => {
  const saved = globalThis.window.__MK_ASSETS__;
  globalThis.window.__MK_ASSETS__ = {};
  assert.equal(pickPhotoFor('win'), null);
  globalThis.window.__MK_ASSETS__ = saved;
});

test('HUD face: expression falls back through marcoFaceKey; smug uses its own photo only when supplied', () => {
  assert.equal(faceKeyFor('neutral'), 'marco_face');
  assert.equal(faceKeyFor('hit'), 'marco_face_hit');
  assert.equal(faceKeyFor('smug'), 'marco_face');
  globalThis.window.__MK_ASSETS__.marco_face_smug = 'data:x';
  assert.equal(faceKeyFor('smug'), 'marco_face_smug');
});

test('Photo props options', () => {
  assert.deepEqual(PHOTO_PROPS.map((o) => o.id), ['auto', 'lots', 'few', 'off']);
});
