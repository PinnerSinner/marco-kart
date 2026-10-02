// End-to-end DOM test: drives the real UI with the keyboard in headless Chromium and checks the bus events it emits.
// Skipped automatically when playwright / esbuild / a browser are not available.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

let chromium; let build;
try {
  const require = createRequire('/home/claude/.npm-global/lib/node_modules/x.js');
  ({ chromium } = require('playwright'));
  ({ build } = await import('esbuild'));
} catch { /* skipped below */ }

const root = path.resolve(new URL('..', import.meta.url).pathname);
const skip = !chromium || !build;

async function boot() {
  const entry = path.join(root, 'test/.ui_dom_entry.js');
  fs.writeFileSync(entry, "import { startDemo } from './ui_demo_app.js'; startDemo('title');\n");
  let js;
  try { js = (await build({ entryPoints: [entry], bundle: true, format: 'iife', target: 'es2020', write: false, logLevel: 'error' })).outputFiles[0].text; } finally { fs.unlinkSync(entry); }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}#ui-root{position:fixed;inset:0}</style></head><body><canvas id="game"></canvas><div id="ui-root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('http://mk.test/**', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://mk.test/', { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 8000 });
  return { browser, page, errors, reload: async () => { await page.reload({ waitUntil: 'load' }); await page.waitForFunction('window.__ready === true', null, { timeout: 8000 }); } };
}
const events = (page, name) => page.evaluate((n) => window.__events.filter((e) => e.n === n).map((e) => e.d), name);
const press = async (page, key, wait = 120) => { await page.keyboard.press(key); await page.waitForTimeout(wait); };
// wait until the nav scope belongs to the named screen and its short input lock has expired (robust against slow software GL)
const ready = (page, name) => page.waitForFunction((n) => { const u = window.__demo.ui; return u.nav.scope?.el?.dataset?.screen === n && performance.now() >= u.nav.lockUntil; }, name, { timeout: 15000 });
const active = (page) => page.evaluate(() => document.querySelector('.is-focus')?.textContent?.trim().slice(0, 40) ?? '');

test('ui dom: keyboard walks title -> menu -> grand prix -> ui:start, Esc goes back, pause emits events, no console errors', { skip, timeout: 90000 }, async () => {
  const { browser, page, errors, reload } = await boot();
  try {
    await ready(page, 'title');
    await press(page, 'Enter', 50); // title -> menu
    await ready(page, 'menu');
    assert.match(await active(page), /grand prix/i, 'first menu item is focused');

    await press(page, 'Enter', 50); await ready(page, 'char'); // -> character select
    assert.equal(await page.evaluate(() => window.__demo.ui.flow.step), 'char');
    await press(page, 'ArrowRight', 100); await press(page, 'ArrowLeft', 100);
    await press(page, 'Enter', 50); await ready(page, 'kart');
    await press(page, 'Escape', 50); await ready(page, 'char'); // back to character
    await press(page, 'Enter', 50); await ready(page, 'kart');
    await press(page, 'Enter', 50); await ready(page, 'difficulty');
    assert.equal((await events(page, 'ui:start')).length, 0, 'nothing started yet');
    await press(page, 'Enter', 400); // difficulty -> start (gp has no track step)
    const starts = await events(page, 'ui:start');
    assert.equal(starts.length, 1);
    assert.equal(starts[0].mode, 'gp');
    assert.ok(starts[0].charId && starts[0].kartId && starts[0].difficulty);

    // pause from the HUD
    await page.evaluate("window.__demo.go('pause')");
    await page.waitForFunction('window.__demo.ui.isPauseOpen()', null, { timeout: 8000 });
    await page.waitForTimeout(500);
    assert.match(await active(page), /resume/i);
    await press(page, 'Enter', 200);
    assert.equal((await events(page, 'ui:resume')).length, 1);

    // settings persist and are announced
    await page.evaluate("window.__demo.go('settings')");
    await ready(page, 'settings');
    const before = (await events(page, 'ui:settings')).length;
    await press(page, 'ArrowLeft', 200);
    const after = await events(page, 'ui:settings');
    assert.ok(after.length > before, 'changing a setting emits ui:settings');
    assert.ok(after.at(-1).volume.master < 1, 'master volume went down');
    const master = after.at(-1).volume.master;
    await reload();
    const restored = await page.evaluate(() => window.__demo.ui.getSettings().volume.master);
    assert.equal(restored, master, 'volume survives a page reload');

    assert.deepEqual(errors, [], 'no console/page errors');
  } finally { await browser.close(); }
});
