import { kartSvg } from '../src/ui/kartArt.js';
const root = document.getElementById('ui-root');
root.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,#132C55,#0B1D3A);display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:18px;align-content:center';
for (const [colour, acc] of [[0xE63946, 0xFFFFFF], [0x2A9D8F, 0xE9C46A], [0x8338EC, 0xFFBE0B], [0xC9A227, 0xFFFFFF]]) {
  for (const k of ['cruiser', 'buggy', 'hauler', 'rocket']) {
    const d = document.createElement('div'); d.style.cssText = 'background:rgba(255,255,255,.06);border-radius:12px;padding:8px';
    d.innerHTML = kartSvg(k, colour, acc); d.firstChild.style.width = '100%'; root.appendChild(d);
  }
}
window.__ready = true;
