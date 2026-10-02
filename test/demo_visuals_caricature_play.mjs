// Drives the BUILT game (node tools/build.mjs first) to screenshot the caricature art everywhere: menu collage, settings row, item guide, char select,
// loading, intro, in-race decor (4 spots), kart stickers, HUD badge, pause, results / podium.
//   node test/demo_visuals_caricature_play.mjs [track] [WxH] [outDir] [quality]
import fs from 'node:fs';
import { launch, waitScreen } from '../tools/qa_lib.mjs';
const track = process.argv[2] ?? 'copacabana';
const size = process.argv[3] ? process.argv[3].split('x').map(Number) : [960, 540];
const out = process.argv[4] ?? 'shots/caricature';
const quality = process.argv[5] ?? 'medium';
const g = await launch({ query: `quality=${quality}`, w: size[0], h: size[1] });
const { page, wait, ev } = g;
fs.mkdirSync(out, { recursive: true });
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const until = (fn, arg, ms = 90000) => page.waitForFunction(fn, arg, { timeout: ms }).catch(() => console.log('!! timeout'));
await waitScreen(page, 'title'); await wait(600); await page.keyboard.press('Space'); await waitScreen(page, 'menu'); await wait(1500); await shot(`ui_menu`);
await page.click('section[data-screen=menu] button[data-id=settings]'); await waitScreen(page, 'settings'); await wait(900); await shot(`ui_settings`);
await page.keyboard.press('Escape'); await waitScreen(page, 'menu'); await wait(500);
await page.click('section[data-screen=menu] button[data-id=items]'); await waitScreen(page, 'items'); await wait(1000); await shot(`ui_items`);
await page.keyboard.press('Escape'); await waitScreen(page, 'menu'); await wait(500);
await page.click('section[data-screen=menu] button[data-id=single]'); await waitScreen(page, 'char'); await wait(1200); await shot(`ui_char`);
await page.click('section[data-screen=char] button[data-char=marco]'); await waitScreen(page, 'kart');
await page.click('section[data-screen=kart] button[data-kart=cruiser]'); await waitScreen(page, 'difficulty');
await page.click('section[data-screen=difficulty] button[data-id=associate]'); await waitScreen(page, 'track');
await wait(500); await shot(`ui_track`);
await page.click(`section[data-screen=track] button[data-track=${track}]`);
await wait(300); await shot(`ui_loading`);
await until(() => window.__mk.game.phase === 'intro'); await wait(1400); await shot(`ui_intro`);
await until(() => window.__mk.game.phase === 'racing');
await ev('window.__qa.ff(60*6)');
console.log('cari', JSON.stringify(await ev('window.__mk.game.cariDecor?.stats')));
const L = await ev('window.__mk.game.track.length');
for (let i = 0; i < 4; i++) { await ev(`window.__qa.ff(${Math.round(60 * (L / 60 / 4.2))})`); await ev('window.__qa.frames(3)'); await shot(`race_${i}`); }
await ev('window.__qa.live()');
await page.keyboard.press('Escape'); await until(() => window.__mk.game.paused, null, 20000); await wait(900); await shot(`ui_pause`);
await page.keyboard.press('Escape'); await until(() => !window.__mk.game.paused, null, 20000);
await ev('window.__qa.autodrive(true)');
await until(() => window.__mk.game.phase === 'results' || document.querySelector('.mk')?.dataset.screen === 'podium' || document.querySelector('.mk')?.dataset.screen === 'results', null, 400000);
await wait(2500); await shot(`ui_results`);
console.log('problems', JSON.stringify(g.problems.slice(0, 8)));
await g.close();
