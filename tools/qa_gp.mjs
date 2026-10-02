// QA: a whole Grand Prix (4 races, 1 lap each via race.laps) through results -> standings -> next race -> podium -> menu.
// Usage: node tools/qa_gp.mjs [WxH] [char]
import { launch, waitScreen } from './qa_lib.mjs';
const size = process.argv[2] ? process.argv[2].split('x').map(Number) : [960, 540];
const char = process.argv[3] ?? 'marco';
const tag = `gp_${size[0]}x${size[1]}_${char}`;
const g = await launch({ query: `quality=low`, w: size[0], h: size[1] });
const { page, shot, wait, ev } = g;
const F = (n) => ev(`window.__qa.frames(${n})`);
const until = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms }).catch(() => console.log('!! timeout', fn.toString().slice(0, 100)));
const info = async (l) => console.log(l.padEnd(14), JSON.stringify(await ev('window.__qa.info()')), JSON.stringify(await ev('window.__qa.gl()')));
await waitScreen(page, 'title'); await page.keyboard.press('Space'); await waitScreen(page, 'menu'); await wait(800);
await page.click('section[data-screen=menu] button[data-id=gp]'); await waitScreen(page, 'char'); await wait(900);
await page.click(`section[data-screen=char] button[data-char=${char}]`); await waitScreen(page, 'kart'); await wait(900);
await page.click('section[data-screen=kart] button[data-kart=cruiser]'); await waitScreen(page, 'difficulty'); await wait(900);
await page.click('section[data-screen=difficulty] button[data-id=associate]');
await ev('window.__qa.autodrive(true)');
for (let race = 1; race <= 4; race++) {
  await until(() => window.__mk.game.phase === 'intro', null);
  await F(30);
  if (race === 2) await shot(`${tag}_loading_or_intro_${race}`);
  let k = 0; while ((await ev('window.__mk.game.phase')) === 'intro' && k++ < 40) await F(15);
  await ev(() => { window.__mk.game.race.laps = 1; });
  await F(60 * 4);
  await info('race ' + race);
  let n = 0; while (!(await ev('window.__mk.game.race.player.finished')) && n++ < 400) await ev('window.__qa.ff(60)');
  let m = 0; while ((await ev('window.__mk.game.phase')) !== 'results' && m++ < 60) await F(30);
  await wait(2500); await shot(`${tag}_results${race}`); await info('results ' + race);
  await page.click('section[data-screen=results] button:has-text("Continue")'); await waitScreen(page, 'standings', 30000); await wait(3500);
  await shot(`${tag}_standings${race}`);
  await page.click('section[data-screen=standings] .res-btns button:first-child');
  if (race === 4) break;
  await wait(500);
}
await waitScreen(page, 'podium', 30000); await wait(3000); await shot(`${tag}_podium`); await info('podium');
await page.click('section[data-screen=podium] button:has-text("Continue")'); await waitScreen(page, 'menu', 30000); await wait(800);
await info('menu');
console.log('problems:', g.problems.join('\n') || 'none');
await g.close();
