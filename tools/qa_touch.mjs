// QA: phone landscape with touch: overlay hidden in menus, shown in race, HUD layout, pause button by tap.
import { launch, waitScreen } from './qa_lib.mjs';
const g = await launch({ query: 'quality=low', w: 812, h: 375, touch: true });
const { page, shot, wait, ev } = g;
const touchInfo = () => ev(() => { const t = document.getElementById('mk-touch'); return t ? { display: getComputedStyle(t).display } : 'no overlay'; });
await waitScreen(page, 'title');
console.log('title', JSON.stringify(await touchInfo()));
await page.touchscreen.tap(400, 300); await waitScreen(page, 'menu'); await wait(800);
console.log('menu', JSON.stringify(await touchInfo())); await shot('touch_menu');
await page.touchscreen.tap(120, 137); await waitScreen(page, 'char'); await wait(800);
await shot('touch_char');
// double-tap flow: first tap selects, second confirms
const card = await page.$('section[data-screen=char] button[data-char=subnet]');
const b = await card.boundingBox();
await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await wait(400);
console.log('after 1st tap screen', await ev(() => document.querySelector('.mk').dataset.screen));
await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await waitScreen(page, 'kart', 10000);
console.log('after 2nd tap screen', await ev(() => document.querySelector('.mk').dataset.screen));
await ev(() => window.__mk.bus.emit('ui:start', { mode: 'single', charId: 'subnet', kartId: 'cruiser', difficulty: 'associate', trackId: 'copacabana', laps: 2 }));
await page.waitForFunction(() => window.__mk.game.phase === 'intro', null, { timeout: 90000 });
await ev('window.__qa.frames(30)');
console.log('intro', JSON.stringify(await touchInfo()));
await ev('window.__qa.autodrive(true)');
let k = 0; while ((await ev('window.__mk.game.phase')) === 'intro' && k++ < 40) await ev('window.__qa.frames(15)');
await ev('window.__qa.frames(60*5)'); await shot('touch_race');
console.log('race', JSON.stringify(await touchInfo()));
await ev('window.__qa.autodrive(false)');
// tap the on-screen pause button
const pb = await page.$('.mk .pause-btn'); const pbb = await pb.boundingBox();
await page.touchscreen.tap(pbb.x + pbb.width / 2, pbb.y + pbb.height / 2); await ev('window.__qa.frames(20)'); await wait(600);
console.log('paused?', await ev('window.__mk.game.paused')); await shot('touch_pause');
console.log('problems:', g.problems.join('\n') || 'none');
await g.close();
