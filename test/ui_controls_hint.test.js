// Controls reminder: per-device rows include drift and look back; opacity stays bright, then fades to a faint resting level.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hintRows, hintOpacity, HINT_BRIGHT_S, HINT_REST_OPACITY, ControlsHint } from '../src/ui/controlsHint.js';

test('controls hint: every device lists drift and look back; unknown devices fall back to keyboard', () => {
  for (const d of ['keyboard', 'gamepad', 'touch']) {
    const text = hintRows(d).map((r) => r.join(' ')).join('|').toLowerCase();
    assert.ok(text.includes('drift') && text.includes('look back'), d);
  }
  assert.equal(hintRows('nonsense'), hintRows('keyboard'));
});

test('controls hint: full opacity for 10 s, then fades to a faint but visible level', () => {
  assert.equal(hintOpacity(0), 1); assert.equal(hintOpacity(HINT_BRIGHT_S), 1);
  assert.ok(hintOpacity(HINT_BRIGHT_S + 1) < 1 && hintOpacity(HINT_BRIGHT_S + 1) > HINT_REST_OPACITY);
  assert.equal(hintOpacity(500), HINT_REST_OPACITY); assert.ok(HINT_REST_OPACITY > 0.2);
});

test('controls hint: device change re-brightens, look back only while shown (no DOM needed)', () => {
  const h = new ControlsHint();
  h.setVisible(true); h.update(30); h.setDevice('gamepad');
  assert.ok(h.age < HINT_BRIGHT_S && h.device === 'gamepad');
  h.setLookBack(true); assert.equal(h.lookBack, true); h.setVisible(false); assert.equal(h.lookBack, false);
});
