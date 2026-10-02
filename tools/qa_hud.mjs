// QA: a whole 1-lap race at a fixed 60 fps fake clock (real game frames, bot driver): intro, countdown, GO, mid-race, finish orbit, results.
// Usage: node tools/qa_hud.mjs <track> [WxH] [char]
import { launch } from './qa_lib.mjs';
const track = process.argv[2] ?? 'copacabana';
const size = process.argv[3] ? process.argv[3].split('x').map(Number) : [960, 540];
const char = process.argv[4] ?? 'marco';
const tag = `hud_${track}_${size[0]}x${size[1]}${char === 'marco' ? '' : '_' + char}`;
const g = await launch({ query: `autostart=1&track=${track}&laps=1&quality=low&mode=single&char=${char}`, w: size[0], h: size[1] });
const { page, shot, wait, ev } = g;
await page.waitForFunction(() => window.__mk.game.phase === 'intro', null, { timeout: 90000 });
const F = (n) => ev(`window.__qa.frames(${n})`);
const info = async (l) => console.log(l.padEnd(10), JSON.stringify(await ev('window.__qa.info()')));
await ev('window.__qa.autodrive(true)');
await F(90); await shot(`${tag}_1intro`); await info('intro');
let k = 0; while ((await ev('window.__mk.game.phase')) === 'intro' && k++ < 40) await F(15);
await F(45); await shot(`${tag}_2countdown`); await info('countdown');
await F(60 * 3); await shot(`${tag}_3go`); await info('go');
await F(60 * 12); await shot(`${tag}_4mid`); await info('mid');
console.log('gl', JSON.stringify(await ev('window.__qa.gl()')));
let n = 0; while (!(await ev('window.__mk.game.race.player.finished')) && n++ < 400) await F(30);
await F(20); await shot(`${tag}_5finish`); await info('finish');
await F(90); await shot(`${tag}_6orbit`);
await F(180); await shot(`${tag}_7orbit2`); await info('orbit');
let m = 0; while ((await ev('window.__mk.game.phase')) !== 'results' && m++ < 40) await F(60);
await F(60); await wait(1500); await shot(`${tag}_8results`); await info('results');
console.log('problems:', g.problems.join('\n') || 'none');
await g.close();
