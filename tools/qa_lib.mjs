// Shared helpers for the QA scripts: launch the built game in headless Chromium (software WebGL) and collect console problems.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/x.js');
const { chromium } = require('playwright');

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/**
 * Launch the built game.
 * @param {{query?: string, w?: number, h?: number, touch?: boolean}} o query = URL query string without '?'
 * @returns {Promise<{page: any, browser: any, logs: string[], problems: string[], shot: Function, ev: Function, close: Function, wait: Function}>}
 */
export async function launch({ query = 'quality=low', w = 960, h = 540, touch = false } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const logs = [], problems = [];
  page.on('console', (m) => { const t = m.type(); const s = `[${t}] ${m.text().slice(0, 400)}`; logs.push(s); if ((t === 'error' || t === 'warning') && !/GPU stall/.test(s)) problems.push(s); });
  page.on('pageerror', (e) => { const s = `[pageerror] ${e.message} ${(e.stack || '').split('\n').slice(1, 4).join(' | ')}`; logs.push(s); problems.push(s); });
  await page.goto(`file://${path.join(root, 'dist/marco-kart.html')}?${query}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 }).catch(() => problems.push('never ready'));
  await page.evaluate(QA_PAGE);
  const shot = async (name) => { fs.mkdirSync(path.join(root, 'shots/qa'), { recursive: true }); const p = path.join(root, 'shots/qa', name + '.png'); await page.screenshot({ path: p }); return p; };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  return { page, browser, logs, problems, shot, ev, wait, close: async () => { await browser.close(); } };
}

/** Wait until the UI shows the given screen (root dataset.screen). */
export async function waitScreen(page, name, timeout = 30000) {
  await page.waitForFunction((n) => document.querySelector('.mk')?.dataset.screen === n, name, { timeout }).catch(() => {});
  return page.evaluate(() => document.querySelector('.mk')?.dataset.screen);
}

/** Page-side helpers: window.__qa.ff(n) steps the current race n fixed steps with a pursuit bot; __qa.ffUntil(pred, max). Call once per page load. */
export const QA_PAGE = `(() => {
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const out = { throttle: 1, brake: 0, steer: 0, drift: false };
  const sm = {};
  const drive = (race) => {
    const k = race.player.kart, tr = race.track ?? window.__mk.game.track;
    const s = k.ground?.s ?? 0, sp = Math.max(k.speed, 6);
    tr.sample(s + Math.min(26, Math.max(9, 5 + sp * 0.45)), sm);
    const err = wrap(Math.atan2(sm.pos.x - k.pos.x, sm.pos.z - k.pos.z) - k.yaw);
    out.steer = Math.max(-1, Math.min(1, -err * 2.6)); out.throttle = Math.abs(err) > 0.7 ? 0.4 : 1; out.brake = 0; out.drift = false;
    return out;
  };
  window.__qa = {
    ff(n, opts = {}) {
      const r = window.__mk.game.race; if (!r) return -1;
      let i = 0;
      for (; i < n; i++) {
        if (r.state === 'finished') break;
        if (window.__mk.game.session?.mode === 'time') r._aiDoneAt = null;
        r.step(1 / 60, opts.idle ? { throttle: 0, brake: 0, steer: 0, drift: false } : drive(r), { itemPressed: false, aimBack: false });
      }
      return i;
    },
    /** Replace the InputManager with the bot (true) or restore it (false). */
    autodrive(on) {
      const g = window.__mk.game;
      if (on) { g.__origRead = g.__origRead ?? g.input.read.bind(g.input); const o = { throttle: 1, brake: 0, steer: 0, drift: false, itemPressed: false, lookBack: false, pausePressed: false };
        g.input.read = () => { if (g.race && g.phase !== 'intro') Object.assign(o, drive(g.race)); else { o.throttle = 0; o.steer = 0; } return o; }; }
      else if (g.__origRead) g.input.read = g.__origRead;
    },
    /** Run n real game frames at a fixed fake 60 fps clock (only the last frame is rendered) so cameras, HUD and audio glue behave as in real time. */
    frames(n) {
      const g = window.__mk.game; cancelAnimationFrame(g._raf);
      const realRender = g.post?.render; let t = (window.__qaClock ?? performance.now());
      for (let i = 0; i < n; i++) {
        if (g.post) g.post.render = i < n - 1 ? () => {} : realRender;
        t += 1000 / 60; g._last = t - 1000 / 60; g.frame(t); cancelAnimationFrame(g._raf);
      }
      if (g.post && realRender) g.post.render = realRender;
      window.__qaClock = t;
      return n;
    },
    /** Hand the loop back to requestAnimationFrame. */
    live() { const g = window.__mk.game; cancelAnimationFrame(g._raf); g._last = performance.now(); g._raf = requestAnimationFrame((t) => g.frame(t)); },
    info() {
      const g = window.__mk.game, r = g.race, h = r?.getHud?.();
      return { phase: g.phase, state: r?.state, t: +(r?.time ?? 0).toFixed(1), place: h?.place, lap: h && h.lap + '/' + h.laps, kmh: h && Math.round(h.speedKmh), fin: r?.player?.finished,
        screen: document.querySelector('.mk')?.dataset.screen, paused: g.paused };
    },
    gl() { const i = window.__mk.game.renderer.info; return { geo: i.memory.geometries, tex: i.memory.textures, calls: i.render.calls, tris: i.render.triangles, progs: i.programs?.length }; },
  };
})()`;
