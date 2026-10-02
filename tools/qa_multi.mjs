// QA: N consecutive single races through the real menus, finishing each with the bot. Reports GL memory, heap, listeners and phases.
// Usage: node tools/qa_multi.mjs [tracks,comma,separated] [WxH]
import { launch, waitScreen } from './qa_lib.mjs';
const tracks = (process.argv[2] ?? 'copacabana,blighty,datacentre').split(',');
const size = process.argv[3] ? process.argv[3].split('x').map(Number) : [960, 540];
const g = await launch({ query: 'quality=low', w: size[0], h: size[1] });
const { page, shot, wait, ev } = g;
const until = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms }).catch(() => console.log('!! timeout', fn.toString().slice(0, 90)));
const info = async (l) => console.log(l.padEnd(20), JSON.stringify(await ev('window.__qa.info()')));
const mem = async (l) => console.log(l.padEnd(20), 'GL', JSON.stringify(await ev('window.__qa.gl()')), 'heapMB', await ev(() => performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null), 'dom', await ev(() => document.getElementsByTagName('*').length));
await waitScreen(page, 'title'); await page.keyboard.press('Space'); await waitScreen(page, 'menu');
let n = 0;
for (const t of tracks) {
  n++;
  const tag = `multi${n}_${t}`;
  await page.click('section[data-screen=menu] button[data-id=single]'); await waitScreen(page, 'char');
  await wait(700); await page.keyboard.press('Enter'); await waitScreen(page, 'kart');
  await wait(700); await page.keyboard.press('Enter'); await waitScreen(page, 'difficulty');
  await wait(700); await page.keyboard.press('Enter'); await waitScreen(page, 'track'); await wait(900);
  await page.click(`section[data-screen=track] button[data-track=${t}]`);
  await until((p) => window.__mk.game.phase === 'racing', null);
  await wait(500); await mem('racing ' + t);
  // laps: force 1 lap for speed
  await ev(() => { const r = window.__mk.game.race; r.laps = 1; });
  await ev('window.__qa.ff(60*4)');
  const t0 = Date.now();
  let steps = 0;
  while ((await ev('window.__qa.info().phase')) === 'racing' && steps < 60 * 200) { steps += await ev('window.__qa.ff(600)'); if (await ev('!!window.__mk.game.race.player.finished')) break; }
  console.log('ff steps', steps, 'in', Date.now() - t0, 'ms');
  await info('finished?'); await wait(1200); await shot(`${tag}_1finish`);
  await ev('window.__qa.ff(60*3)'); await wait(800);
  // let the game reach results (finish wait / race over)
  await ev(() => { window.__mk.game._finishTimer = 99; });
  await until(() => window.__mk.game.phase === 'results', null, 60000);
  await wait(2500); await info('results'); await shot(`${tag}_2results`);
  await page.click('section[data-screen=results] button:has-text("Main menu")'); await waitScreen(page, 'menu', 30000); await wait(600);
  await info('menu'); await mem('after ' + t);
}
console.log('problems:', g.problems.join('\n') || 'none');
await g.close();
