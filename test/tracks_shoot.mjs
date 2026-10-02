// Multi-view screenshot driver for the tracks demos (not a unit test).
//   node test/tracks_shoot.mjs <trackId> <viewsFile> [viewName,viewName,...] [--w 1280] [--h 720] [--noshadow]
// viewsFile exports default { name: viewSpec }; see test/tracks_views.js. Writes shots/tracks/<trackId>-<view>.png.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('/home/claude/.npm-global/lib/node_modules/x.js');
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
const [trackId, viewsFile, only] = pos;
const W = +flag('w', 1280), H = +flag('h', 720), noShadow = args.includes('--noshadow'), noKarts = args.includes('--nokarts');
const views = (await import(path.resolve(viewsFile))).default[trackId];
const names = only ? only.split(',') : Object.keys(views);

const built = await build({ entryPoints: [path.resolve('test/demo_tracks_scene.js')], bundle: true, format: 'iife', target: 'es2020', write: false, logLevel: 'error', sourcemap: 'inline' });
const js = built.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#0b0d1a;overflow:hidden}#game{position:fixed;inset:0;width:100%;height:100%;display:block}</style></head><body><canvas id="game"></canvas><div id="ui-root"></div><script>window.__TRACK_ID__=${JSON.stringify(trackId)};window.__SHADOWS__=${!noShadow};window.__KARTS__=${!noKarts};</script><script>${js}</script></body></html>`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
let bad = 0;
page.on('console', (m) => { if (m.type() === 'error') bad++; if (m.type() !== 'warning' || !/GPU stall/.test(m.text())) console.log(`[page:${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => { bad++; console.log(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`); });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
fs.mkdirSync('shots/tracks', { recursive: true });
for (const n of names) {
  const spec = views[n]; if (!spec) { console.log('no view', n); continue; }
  const info = await page.evaluate((s) => window.__view(s), spec);
  await page.waitForTimeout(150);
  const out = `shots/tracks/${trackId}-${n}.png`;
  await page.screenshot({ path: out });
  console.log('saved', out, '|', info);
}
await browser.close();
process.exit(bad ? 1 : 0);
