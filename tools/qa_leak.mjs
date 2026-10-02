// QA: restart the same race N times and watch GL objects, bus listeners, DOM nodes and canvases for growth. Usage: node tools/qa_leak.mjs [track] [n]
import { launch } from './qa_lib.mjs';
const track = process.argv[2] ?? 'copacabana'; const N = +(process.argv[3] ?? 4);
const g = await launch({ query: `autostart=1&track=${track}&laps=1&quality=low&mode=single`, w: 640, h: 360 });
const { page, ev, shot } = g;
await page.evaluate(() => {
  const bus = window.__mk.bus; const mirror = new Map(); const on = bus.on.bind(bus), off = bus.off.bind(bus);
  bus.on = (n, f) => { if (!mirror.has(n)) mirror.set(n, new Set()); mirror.get(n).add(f); return on(n, f); };
  bus.off = (n, f) => { mirror.get(n)?.delete(f); return off(n, f); };
  window.__listeners = () => [...mirror.values()].reduce((a, s) => a + s.size, 0);
});
const F = (n) => ev(`window.__qa.frames(${n})`);
for (let i = 0; i <= N; i++) {
  await page.waitForFunction(() => window.__mk.game.phase === 'intro', null, { timeout: 120000 });
  await ev('window.__qa.autodrive(true)');
  let k = 0; while ((await ev('window.__mk.game.phase')) === 'intro' && k++ < 40) await F(15);
  await F(60 * 8);
  const gl = await ev('window.__qa.gl()');
  console.log(`race ${i}`, JSON.stringify(gl), 'listenersAdded', await ev('window.__listeners()'), 'dom', await ev(() => document.getElementsByTagName('*').length), 'canvases', await ev(() => document.querySelectorAll('canvas').length),
    'heapMB', await ev(() => performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null), 'sceneChildren', await ev(() => window.__mk.game.scene.children.length));
  if (i < N) { await ev(() => window.__mk.bus.emit('ui:restart', {})); }
}
console.log('problems:', g.problems.join('\n') || 'none');
await g.close();
