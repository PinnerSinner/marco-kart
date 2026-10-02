// QA: do Marco's recorded voice lines decode, and does playVoice start them without throwing? (headless Chromium may have no audio device)
import { launch } from './qa_lib.mjs';
const g = await launch({ query: 'quality=low' });
const { page, ev } = g;
await page.mouse.click(100, 100);            // user gesture
await page.keyboard.press('Space');
await page.waitForTimeout(800);
const res = await ev(async () => {
  const a = window.__mk.game.audio; const out = { ctx: a.ctx ? a.ctx.state : 'none', unlocked: a.unlocked, keys: Object.keys(window.__MK_ASSETS__).filter((k) => k.startsWith('voice_')), decode: {}, play: {}, errors: [] };
  window.addEventListener('error', (e) => out.errors.push(e.message));
  for (const k of out.keys) {
    try { const bin = atob(window.__MK_ASSETS__[k].split(',')[1]); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); const buf = await a.ctx.decodeAudioData(bytes.buffer); out.decode[k] = `${buf.duration.toFixed(2)}s ${buf.numberOfChannels}ch ${buf.sampleRate}Hz`; } catch (e) { out.decode[k] = 'FAIL ' + e.message; }
  }
  for (const k of ['go', 'ready', 'boost', 'hit', 'item', 'final_lap', 'win', 'lose', 'overtake']) {
    try { out.play[k] = await a.playVoice(k, 'marco'); } catch (e) { out.play[k] = 'THROW ' + e.message; }
  }
  try { out.play.notMarco = await a.playVoice('go', 'rex'); } catch (e) { out.play.notMarco = 'THROW ' + e.message; }
  return out;
});
console.log(JSON.stringify(res, null, 1));
console.log('problems:', g.problems.join('\n') || 'none');
await g.close();
