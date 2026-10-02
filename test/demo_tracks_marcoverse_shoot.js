// Multi-view screenshot driver for Marcoverse Speedway (a node script, not a test).
//   node test/demo_tracks_marcoverse_shoot.js [view1,view2,...] [--w 1280] [--h 720] [--plain] [--nokarts]
// Writes shots/tracks/marcoverse-<view>.png and prints draw calls and triangles per view. Embeds assets/user/* like tools/shot.mjs does.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('/home/claude/.npm-global/lib/node_modules/x.js');
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const only = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
const W = +flag('w', 1280), H = +flag('h', 720), plain = args.includes('--plain'), noKarts = args.includes('--nokarts'), noAssets = args.includes('--noassets');
const views = (await import(path.resolve('test/demo_tracks_marcoverse_views.js'))).default;
const names = only ? only.split(',') : Object.keys(views);

const built = await build({ entryPoints: [path.resolve('test/demo_tracks_marcoverse.js')], bundle: true, format: 'iife', target: 'es2022', write: false, logLevel: 'error', sourcemap: 'inline' });
const js = built.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const assets = {};
const dir = path.resolve('assets/user');
if (!noAssets && fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
  const ext = path.extname(f).slice(1).toLowerCase(), mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext];
  if (mime) assets[path.basename(f, path.extname(f))] = `data:${mime};base64,` + fs.readFileSync(path.join(dir, f)).toString('base64');
}
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#0b0d1a;overflow:hidden}#game{position:fixed;inset:0;width:100%;height:100%;display:block}</style></head><body><canvas id="game"></canvas><div id="ui-root"></div><script>window.__MK_ASSETS__=${JSON.stringify(assets)};window.__PLAIN__=${plain};window.__KARTS__=${!noKarts};globalThis.__MVOFF=${JSON.stringify(flag("off",""))};</script><script>${js}</script></body></html>`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
let bad = 0;
page.on('console', (m) => { if (m.type() === 'error') bad++; if (!/GPU stall|GL Driver/.test(m.text())) console.log(`[page:${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => { bad++; console.log(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`); });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 240000 });
fs.mkdirSync('shots/tracks', { recursive: true });
for (const n of names) {
  const spec = views[n]; if (!spec) { console.log('no view', n); continue; }
  const info = await page.evaluate((s) => window.__view(s), spec);
  await page.waitForTimeout(150);
  const out = `shots/tracks/marcoverse-${n}.png`;
  await page.screenshot({ path: out });
  console.log('saved', out, '|', info);
}
await browser.close();
process.exit(bad ? 1 : 0);
