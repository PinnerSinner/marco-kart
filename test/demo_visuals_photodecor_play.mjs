// Drives the BUILT game (node tools/build.mjs first) to screenshot every photo extra: menu wall, char select, intro card, decor mid-race, HUD face, pause, results.
//   node test/demo_visuals_photodecor_play.mjs [track] [WxH]
import fs from 'node:fs';
import { launch, waitScreen, root } from '../tools/qa_lib.mjs';
const track = process.argv[2] ?? 'copacabana';
const size = process.argv[3] ? process.argv[3].split('x').map(Number) : [960, 540];
const g = await launch({ query: 'quality=low', w: size[0], h: size[1] });
const { page, wait, ev } = g;
fs.mkdirSync(`${root}/shots/photodecor`, { recursive: true });
const shot = (n) => page.screenshot({ path: `${root}/shots/photodecor/${n}.png` });
const until = (fn, arg, ms = 90000) => page.waitForFunction(fn, arg, { timeout: ms }).catch(() => console.log('!! timeout'));
await waitScreen(page, 'title'); await wait(600); await page.keyboard.press('Space'); await waitScreen(page, 'menu'); await wait(1500); await shot(`ui_${track}_menu`);
await page.click('section[data-screen=menu] button[data-id=single]'); await waitScreen(page, 'char'); await wait(1200); await shot(`ui_${track}_char`);
await page.click('section[data-screen=char] button[data-char=marco]'); await waitScreen(page, 'kart');
await page.click('section[data-screen=kart] button[data-kart=cruiser]'); await waitScreen(page, 'difficulty');
await page.click('section[data-screen=difficulty] button[data-id=associate]'); await waitScreen(page, 'track');
await page.click(`section[data-screen=track] button[data-track=${track}]`);
await wait(300); await shot(`ui_${track}_loading`);
await until(() => window.__mk.game.phase === 'intro'); await wait(1400); await shot(`ui_${track}_intro`);
await until(() => window.__mk.game.phase === 'racing');
await ev('window.__qa.ff(60*6)');
console.log('decor', JSON.stringify(await ev('window.__mk.game.decor?.stats')));
const L = await ev('window.__mk.game.track.length');
for (let i = 0; i < 4; i++) { await ev(`window.__qa.ff(${Math.round(60 * (L / 60 / 4.2))})`); await ev('window.__qa.frames(3)'); await shot(`race_${track}_${i}`); }
await ev('window.__qa.live()');
await page.keyboard.press('Escape'); await until(() => window.__mk.game.paused, null, 20000); await wait(900); await shot(`ui_${track}_pause`);
await page.keyboard.press('Escape'); await until(() => !window.__mk.game.paused, null, 20000);
await ev('window.__qa.autodrive(true)');
await until(() => window.__mk.game.phase === 'results', null, 400000);
await wait(2500); await shot(`ui_${track}_results`);
console.log(g.problems.join('\n') || 'no console problems');
await g.close();
