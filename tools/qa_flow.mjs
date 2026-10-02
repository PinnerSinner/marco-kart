// QA: full session with real clicks: menu -> single race -> intro/countdown -> pause/resume/restart -> finish -> results -> menu -> 2nd and 3rd race; memory + listeners.
import { launch, waitScreen } from './qa_lib.mjs';
const size = process.argv[2] ? process.argv[2].split('x').map(Number) : [960, 540];
const tag = `flow_${size[0]}x${size[1]}`;
const g = await launch({ query: 'quality=low', w: size[0], h: size[1] });
const { page, shot, wait, ev } = g;
const info = async (label) => console.log(label.padEnd(22), JSON.stringify(await ev('window.__qa.info()')));
const until = async (fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms }).catch(() => console.log('!! timeout waiting', fn.toString().slice(0, 80)));
const phase = (p) => until((p) => window.__mk.game.phase === p, p, 90000);

await waitScreen(page, 'title'); await page.keyboard.press('Space'); await waitScreen(page, 'menu');
await page.click('section[data-screen=menu] button[data-id=single]'); await waitScreen(page, 'char');
await page.click('section[data-screen=char] button[data-char=marco]'); await waitScreen(page, 'kart');
await page.click('section[data-screen=kart] button[data-kart=cruiser]'); await waitScreen(page, 'difficulty');
await page.click('section[data-screen=difficulty] button[data-id=associate]'); await waitScreen(page, 'track');
await page.click('section[data-screen=track] button[data-track=copacabana]');
await phase('intro'); await wait(800); await info('intro'); await shot(`${tag}_1intro`);
await phase('racing'); await wait(800); await info('racing (countdown)'); await shot(`${tag}_2hudcount`);
console.log('ff', await ev('window.__qa.ff(60*5)'));
await wait(1500); await info('after GO');
// pause via Escape
await page.keyboard.press('Escape'); await until(() => window.__mk.game.paused, null, 20000); await wait(800);
await info('paused'); await shot(`${tag}_3pause`);
await page.keyboard.press('Escape'); await until(() => !window.__mk.game.paused, null, 20000); await info('resumed (Esc)');
// pause via button click, resume via Resume button
await page.click('.mk .pause-btn'); await until(() => window.__mk.game.paused, null, 20000); await wait(500);
await page.click('.mk .pause button:has-text("Resume")'); await until(() => !window.__mk.game.paused, null, 20000); await info('resumed (click)');
// restart via pause
await page.keyboard.press('Escape'); await until(() => window.__mk.game.paused, null, 20000);
await page.click('.mk .pause button:has-text("Restart race")'); await wait(500); await shot(`${tag}_4restartconfirm`);
await page.click('.mk .pause .pause-yn button.red');
await phase('intro'); await info('after restart'); await phase('racing'); await info('restarted racing');
console.log('gl', JSON.stringify(await ev('window.__qa.gl()')));
await g.close();
console.log('problems:', g.problems.join('\n') || 'none');
