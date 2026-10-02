// Contact sheet of the ten item icons at large and HUD sizes (screenshot demo for tools/shot.mjs).
import { itemIcon, ITEM_ICON_IDS } from '../src/ui/icons.js';
import { ITEMS } from '../src/core/config.js';

const root = document.getElementById('ui-root');
root.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,#132C55,#0B1D3A);display:grid;grid-template-columns:repeat(5,1fr);gap:14px;padding:18px;font:900 15px system-ui;color:#FFF8EC;align-content:center';
for (const id of ITEM_ICON_IDS) {
  const cell = document.createElement('div');
  cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;background:rgba(255,255,255,.06);border-radius:12px;padding:10px';
  cell.innerHTML = `<div style="width:150px;height:150px;filter:drop-shadow(0 4px 0 rgba(0,0,0,.35))">${itemIcon(id)}</div>` +
    `<div style="display:flex;gap:10px;align-items:end"><div style="width:48px;height:48px">${itemIcon(id)}</div><div style="width:32px;height:32px">${itemIcon(id)}</div></div>` +
    `<div>${ITEMS[id].name}</div>`;
  cell.querySelectorAll('svg').forEach((s) => { s.style.width = '100%'; s.style.height = '100%'; });
  root.appendChild(cell);
}
window.__ready = true;
