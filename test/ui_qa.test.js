// QA regressions found while play-testing the integrated build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../src/core/input.js';

test('input: the touch overlay pause button can be switched off and touchActive reflects state', () => {
  const im = new InputManager(null);
  assert.equal(im.touchActive, false);
  im.setPauseButton(false);
  im.setPauseButton(true);
  im.setEnabled(false);
  assert.equal(im.touchActive, false);
});

test('menus carry no controls UI: no Controls entry or screen, no key-prompt footers', async () => {
  const fs = await import('node:fs');
  const { MENU_COPY } = await import('../src/ui/copy.js');
  assert.deepEqual(Object.keys(MENU_COPY), ['gp', 'single', 'time', 'items', 'settings', 'about']);
  const dir = new URL('../src/ui/screens/', import.meta.url);
  assert.ok(!fs.existsSync(new URL('controls.js', dir)), 'the Controls screen is gone');
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/hintBar|ControlsScreen|'controls'/.test(src), `${f}: no key-prompt bar or Controls entry`);
  }
  assert.ok(!/hintBar|screens\/controls\.js/.test(fs.readFileSync(new URL('../src/ui/UI.js', import.meta.url), 'utf8')), 'UI.js: no hintBar, no Controls screen');
});
