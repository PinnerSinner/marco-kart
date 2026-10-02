// Headless playthrough of the BUILT game (dist/marco-kart.html).
//   node tools/play.mjs <out-prefix> [--track copacabana] [--secs 12] [--shots 4] [--w 960] [--h 540] [--q low] [--menu]
// Boots with ?autostart=1 (skips menus unless --menu), holds ArrowUp, screenshots evenly, prints console errors + HUD probe.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/x.js');
const { chromium } = require('playwright');

const a = process.argv.slice(2);
const flag = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
const prefix = a.find((x, i) => !x.startsWith('--') && !(a[i - 1] ?? '').startsWith('--')) ?? 'shots/play/run';
const track = flag('track', 'copacabana'), secs = +flag('secs', 12), shots = +flag('shots', 4);
const W = +flag('w', 960), H = +flag('h', 540), q = flag('q', 'low'), menu = a.includes('--menu');
const steerKeys = (flag('keys', 'ArrowUp') || '').split(',').filter(Boolean);

const file = path.resolve('dist/marco-kart.html');
const url = `file://${file}?quality=${q}` + (menu ? '' : `&autostart=1&track=${track}&laps=1&mode=single&char=marco&kart=cruiser&diff=professional`);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
let bad = 0;
page.on('console', (m) => { const t = m.type(); if (t === 'error') bad++; if (t !== 'warning' && t !== 'debug') console.log(`[${t}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => { bad++; console.log(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 }).catch(() => console.log('!! never became ready'));
await page.click('#game').catch(() => {});
for (const k of steerKeys) await page.keyboard.down(k);
fs.mkdirSync(path.dirname(path.resolve(prefix)), { recursive: true });
const step = (secs * 1000) / shots;
for (let i = 1; i <= shots; i++) {
  await page.waitForTimeout(step);
  await page.screenshot({ path: `${prefix}-${i}.png` });
  const probe = await page.evaluate(() => { try { const g = window.__mk.game; const h = g.race?.getHud?.(); return h ? `state=${h.state} t=${h.time?.toFixed(1)} lap=${h.lap}/${h.laps} place=${h.place} kmh=${Math.round(h.speedKmh)}` : 'no race'; } catch (e) { return 'probe err ' + e.message; } });
  console.log(`shot ${i}: ${probe}`);
}
await browser.close();
process.exit(bad ? 1 : 0);
