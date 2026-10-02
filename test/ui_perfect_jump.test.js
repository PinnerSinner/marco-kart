// DOM checks (headless Chromium, skipped when playwright / esbuild are not available) for the perfect-jump pop, the speed-class tag on the HUD
// dial, and the game-speed selector on the last step of the select flow.
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
  const entry = path.join(root, 'test/.ui_pj_entry.js');
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
  return { browser, page, errors };
}

test('ui dom: PERFECT JUMP pops for the player only, once per jump, and the dial shows the speed class', { skip, timeout: 90000 }, async () => {
  const { browser, page, errors } = await boot();
  try {
    await page.evaluate("window.__demo.go('hud-race')");
    await page.waitForTimeout(500);
    const emit = (d) => page.evaluate((x) => window.__demo.ui.emit('kart:perfect-jump', x), d);
    await emit({ id: 'rival', isPlayer: false });
    assert.equal(await page.locator('.pop').count(), 0, 'a rival\'s perfect jump shows nothing');
    await emit({ id: 'marco', isPlayer: true });
    await emit({ id: 'marco', isPlayer: true });
    await page.waitForTimeout(80);
    assert.equal(await page.locator('.pop').count(), 1, 'one pop (duplicates inside half a second are folded)');
    assert.match(await page.locator('.pop .pop-t').first().textContent(), /perfect jump/i);
    await page.waitForTimeout(1600);
    assert.equal(await page.locator('.pop').count(), 0, 'it clears itself');

    await page.evaluate("window.__demo.go('hud-class-200')");
    await page.waitForTimeout(600);
    assert.equal((await page.locator('.sp-class').textContent()).trim(), '200 Mbps');
    assert.equal(await page.locator('.speedo').getAttribute('data-cls'), '200');
    assert.deepEqual(errors, [], 'no console/page errors');
  } finally { await browser.close(); }
});

test('ui dom: the game-speed selector sits on the last step, saves to the settings and rides on ui:start', { skip, timeout: 90000 }, async () => {
  const { browser, page, errors } = await boot();
  try {
    await page.evaluate("window.__demo.go('select-track-tt')");
    await page.waitForFunction("document.querySelectorAll('.speed-pick button').length > 0 && !!document.querySelector('section[data-screen=track].is-active .speed-pick')", null, { timeout: 15000 });
    const btns = page.locator('section[data-screen=track] .speed-pick button');
    assert.equal(await btns.count(), 4);
    assert.deepEqual(await btns.allTextContents(), ['50', '100', '150', '200']);
    assert.equal(await page.locator('section[data-screen=track] .speed-pick button.on').textContent(), '100', 'defaults to 100 Mbps');
    await page.evaluate("document.querySelector('section[data-screen=track] .speed-pick button[data-speed=\"150\"]').click()");
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__demo.ui.getSettings().speedClass), 150, 'saved in the settings');
    assert.equal(await page.evaluate(() => window.__demo.ui.flow.picks.speedClass), 150);
    assert.match(await page.locator('section[data-screen=track] .sp-cap').textContent(), /150 Mbps/);
    await page.evaluate("window.__demo.ui.flow.confirm('copacabana')");
    const starts = await page.evaluate(() => window.__events.filter((e) => e.n === 'ui:start').map((e) => e.d));
    assert.equal(starts.length, 1);
    assert.equal(starts[0].speedClass, 150);
    assert.equal(starts[0].mode, 'time');

    // the Settings screen shows the same choice
    await page.evaluate("window.__demo.go('settings')");
    await page.waitForTimeout(800);
    assert.equal(await page.locator('section[data-screen=settings] .seg button.on', { hasText: /^150$/ }).count(), 1);
    assert.deepEqual(errors, [], 'no console/page errors');
  } finally { await browser.close(); }
});
