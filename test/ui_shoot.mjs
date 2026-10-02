// Multi-screenshot runner for the UI (dev tool). Bundles test/ui_demo_app.js once and, for every viewport, walks every demo state.
//   node test/ui_shoot.mjs [--sizes 1280x720,1920x1080,812x375] [--states title,menu] [--wait 1100] [--prefix name]
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('/home/claude/.npm-global/lib/node_modules/x.js');
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const sizes = flag('sizes', '1280x720').split(',').map((s) => s.split('x').map(Number));
const wanted = flag('states', '').split(',').filter(Boolean);
const wait = +flag('wait', 1100);
const outDir = path.resolve('shots/ui');
fs.mkdirSync(outDir, { recursive: true });

const entry = path.resolve('test/.ui_shoot_entry.js');
fs.writeFileSync(entry, "import { startDemo } from './ui_demo_app.js'; startDemo(window.__START__ || 'title');\n");
const built = await build({ entryPoints: [entry], bundle: true, format: 'iife', target: 'es2020', write: false, logLevel: 'error', sourcemap: 'inline' });
fs.unlinkSync(entry);
const js = built.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const assets = (() => {
  const dir = path.resolve('assets/user'); const o = {};
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
    const ext = path.extname(f).slice(1).toLowerCase();
    const m = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', txt: 'text/plain' }[ext];
    if (m) o[path.basename(f, path.extname(f))] = `data:${m};base64,` + fs.readFileSync(path.join(dir, f)).toString('base64');
  }
  return `window.__MK_ASSETS__=${JSON.stringify(o)};`;
})();
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#0b0d1a;overflow:hidden;font-family:system-ui,sans-serif}#game{position:fixed;inset:0;width:100%;height:100%;display:block}#ui-root{position:fixed;inset:0;pointer-events:none}#ui-root>*{pointer-events:auto}</style></head><body><canvas id="game" tabindex="0"></canvas><div id="ui-root"></div><script>${assets}window.__START__='__NONE__';</script><script>${js}</script></body></html>`;

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
let bad = 0;
for (const [W, H] of sizes) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('console', (m) => { if (m.type() === 'error') { bad++; console.log(`[page:error] ${m.text()}`); } else if (m.type() === 'warning' && !/GPU stall|GL Driver/.test(m.text())) console.log(`[page:warn] ${m.text()}`); });
  page.on('pageerror', (e) => { bad++; console.log(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`); });
  await page.setContent(html.replace('__NONE__', 'title'), { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 8000 }).catch(() => {});
  const states = wanted.length ? wanted : await page.evaluate('window.__demo.states');
  for (const s of states) {
    await page.evaluate(`window.__demo.go(${JSON.stringify(s)})`);
    await page.waitForTimeout(/select-(char|kart)/.test(s) ? wait + 2500 : /gp-standings/.test(s) ? wait + 1400 : wait);
    const file = path.join(outDir, `${flag('prefix', '')}${s}-${W}x${H}.png`);
    await page.screenshot({ path: file });
    console.log('saved', path.relative(process.cwd(), file));
  }
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
