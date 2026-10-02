// Entry point: boots the Game on #game / #ui-root.
// Query-string hooks (for testing): ?autostart=1&track=blighty&char=marco&kart=cruiser&diff=professional&laps=1&mode=single|gp|time&quality=low|medium|high
import { Game } from './core/game.js';
import { bus } from './core/bus.js';

const params = new URLSearchParams(location.search);
const game = new Game({ canvas: document.getElementById('game'), uiRoot: document.getElementById('ui-root') });
window.__mk = { game, bus };

game.init().then(() => {
  const q = params.get('quality');
  if (q) game.ui.settings.set({ quality: q });   // goes through ui:settings so the Settings screen shows the same tier
  if (params.get('autostart')) game.autostart(Object.fromEntries(params));
  window.__ready = true;
}).catch((e) => {
  console.error('[Marco Kart] failed to start', e);
  document.getElementById('ui-root').innerHTML = '<div style="color:#fff;font:600 18px system-ui;padding:32px">Marco Kart could not start: ' + String(e.message ?? e) + '</div>';
});
