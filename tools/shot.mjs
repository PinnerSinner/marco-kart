// Headless screenshot harness (Chromium + software WebGL2). Lets you SEE your rendering work.
//
//   node tools/shot.mjs <entry.js> <out.png> [--wait 1500] [--shots 1] [--interval 800] [--w 1280] [--h 720]
//                                            [--keys "ArrowUp,Space"] [--html-only]
//
// <entry.js> is any ES module that imports from src/. It is bundled (three included) into an IIFE and run in a page that
// already contains <canvas id="game"> and <div id="ui-root">. Your entry creates its own renderer on #game.
// Set window.__ready = true when your scene has rendered its first frame (optional; otherwise it just waits --wait ms).
// Prints all console messages / page errors, and writes <out.png> (or <out>-1.png, <out>-2.png ... when --shots > 1).
// Exit code 1 if any page error / console.error occurred.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('/home/claude/.npm-global/lib/node_modules/x.js');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const pos = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const [entryArg, outArg] = pos;
if (!entryArg || !outArg) { console.error('usage: node tools/shot.mjs <entry.js> <out.png> [--wait ms] [--shots n] [--interval ms] [--w px] [--h px] [--keys a,b]'); process.exit(2); }

const W = +flag('w', 1280), H = +flag('h', 720), wait = +flag('wait', 1500), shots = +flag('shots', 1), interval = +flag('interval', 800);
const keys = (flag('keys', '') || '').split(',').filter(Boolean);

const built = await build({ entryPoints: [path.resolve(entryArg)], bundle: true, format: 'iife', target: 'es2020', write: false, logLevel: 'error', sourcemap: 'inline' });
const js = built.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const assetsJs = (() => {
  const dir = path.resolve('assets/user'); const o = {};
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
    const ext = path.extname(f).slice(1).toLowerCase();
    const m = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', txt: 'text/plain' }[ext];
    if (m) o[path.basename(f, path.extname(f))] = `data:${m};base64,` + fs.readFileSync(path.join(dir, f)).toString('base64');
  }
  return `window.__MK_ASSETS__=${JSON.stringify(o)};`;
})();
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#0b0d1a;overflow:hidden;font-family:system-ui,sans-serif}#game{position:fixed;inset:0;width:100%;height:100%;display:block}#ui-root{position:fixed;inset:0;pointer-events:none}#ui-root>*{pointer-events:auto}</style></head><body><canvas id="game" tabindex="0"></canvas><div id="ui-root"></div><script>${assetsJs}</script><script>${js}</script></body></html>`;

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
let bad = 0;
page.on('console', (m) => { const t = m.type(); if (t === 'error') bad++; console.log(`[page:${t}] ${m.text()}`); });
page.on('pageerror', (e) => { bad++; console.log(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`); });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: wait }).catch(() => {});
await page.waitForTimeout(Math.min(wait, 400));
for (const k of keys) await page.keyboard.down(k);
for (let i = 0; i < shots; i++) {
  if (i > 0) await page.waitForTimeout(interval);
  const out = shots === 1 ? outArg : outArg.replace(/\.png$/, `-${i + 1}.png`);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.screenshot({ path: out });
  console.log('saved', out);
}
for (const k of keys) await page.keyboard.up(k);
await browser.close();
process.exit(bad ? 1 : 0);
