// QA regressions found while play-testing the integrated build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBindings } from '../src/ui/screens/controls.js';
import { InputManager } from '../src/core/input.js';

test('splitBindings understands the real InputManager.bindingsHelp() format', () => {
  const rows = new InputManager(null).bindingsHelp();
  for (const r of rows) {
    const { keyboard, pad } = splitBindings(r.action, r.keys);
    assert.ok(keyboard.length > 0, `${r.action}: keyboard keys`);
    assert.ok(pad.length > 0, `${r.action}: gamepad buttons`);
    for (const k of [...keyboard, ...pad]) assert.ok(!/gamepad|touch|button$/i.test(k) || k === 'Back button', `${r.action}: stray label "${k}"`);
  }
  const steer = splitBindings('Steer', ['A / D', 'Left / Right Arrow', 'Gamepad: left stick or D-pad', 'Touch: steer pad']);
  assert.deepEqual(steer.keyboard, ['A', 'D', '←', '→']);
  assert.deepEqual(steer.pad, ['left stick', 'D-pad']);
  const acc = splitBindings('Accelerate', ['W', 'Up Arrow', 'Gamepad: RT or A', 'Touch: automatic']);
  assert.deepEqual(acc.keyboard, ['W', '↑']);
  assert.deepEqual(acc.pad, ['RT', 'A']);
});

test('input: the touch overlay pause button can be switched off and touchActive reflects state', () => {
  const im = new InputManager(null);
  assert.equal(im.touchActive, false);
  im.setPauseButton(false);
  im.setPauseButton(true);
  im.setEnabled(false);
  assert.equal(im.touchActive, false);
});
