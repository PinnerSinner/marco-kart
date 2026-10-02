// QA: one race on a track: intro, countdown, HUD, fast-forward to the finish, results. Usage: node tools/qa_race.mjs <track> [WxH]
import { launch, waitScreen, ffSource } from './qa_lib.mjs';
const track = process.argv[2] ?? 'copacabana';
const size = process.argv[3] ? process.argv[3].split('x').map(Number) : [960, 540];
const t0 = Date.now();
const g = await launch({ query: `autostart=1&track=${track}&laps=1&quality=low&mode=single`, w: size[0], h: size[1] });
const { page, shot, wait, ev } = g;
const tag = `race_${track}_${size[0]}x${size[1]}`;
console.log('ready after', ((Date.now() - t0) / 1000).toFixed(1), 's');
const probe = () => ev(() => { const g = window.__mk.game, r = g.race; const h = r?.getHud?.(); return { phase: g.phase, state: r?.state, cd: r?.countdown?.toFixed(2), t: r?.time?.toFixed(1), place: h?.place, lap: h && `${h.lap}/${h.laps}`, kmh: h && Math.round(h.speedKmh), screen: document.querySelector('.mk')?.dataset.screen, hudVisible: !!document.querySelector('.mk .hud.on, .mk .hud.is-on, .mk [data-hud]') }; });
const fps = () => ev(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t > 3000) res(+(n / 3).toFixed(1)); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
await wait(1500);
console.log('intro', JSON.stringify(await probe()));
await shot(`${tag}_1intro`);
console.log('fps (intro)', await fps());
// skip intro
await page.keyboard.press('Enter');
await wait(1500);
console.log('post-intro', JSON.stringify(await probe()));
await shot(`${tag}_2countdown`);
// fast-forward past the countdown (3 s + a bit)
console.log('ff', await ev(ffSource(60 * 4 + 30)));
await wait(1200);
console.log('racing', JSON.stringify(await probe()));
await shot(`${tag}_3racing`);
console.log('fps (race)', await fps());
console.log('problems:', g.problems.join('\n') || 'none');
await g.close();
