// QA: boot -> title -> menu -> every menu screen -> full select flow with keyboard and mouse.
import { launch, waitScreen } from './qa_lib.mjs';
const size = process.argv[2] ? process.argv[2].split('x').map(Number) : [960, 540];
const g = await launch({ query: 'quality=low', w: size[0], h: size[1] });
const { page, shot, wait } = g;
const tag = size[0] + 'x' + size[1];
const at = async (n) => { const s = await waitScreen(page, n, 15000); await wait(1200); console.log('screen', s); await shot(`menu_${tag}_${n}`); };
await at('title');
await page.keyboard.press('Space'); await at('menu');
// walk each menu screen by mouse
for (const id of ['controls', 'settings', 'about']) {
  await page.click(`section[data-screen=menu] button[data-id=${id}]`); await at(id);
  await page.keyboard.press('Escape'); await at('menu');
}
// keyboard select flow: Grand Prix
await page.click('section[data-screen=menu] button[data-id=gp]'); await at('char');
await page.keyboard.press('ArrowRight'); await wait(500); await shot(`menu_${tag}_char2`);
await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter'); await at('kart');
await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await at('difficulty');
await page.keyboard.press('Escape'); await at('kart');
await page.keyboard.press('Escape'); await at('char');
await page.keyboard.press('Escape'); await at('menu');
// mouse flow: Single race
await page.click('section[data-screen=menu] button[data-id=single]'); await at('char');
await page.click('section[data-screen=char] button[data-char=marco]'); await at('kart');
await page.click('section[data-screen=kart] button[data-kart=buggy]'); await at('difficulty');
await page.click('section[data-screen=difficulty] button[data-id=professional]'); await at('track');
console.log(g.problems.join('\n') || 'no console problems');
await g.close();
