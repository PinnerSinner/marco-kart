// Contact sheet: every racer in every mood (screenshot demo).
import { CHARACTERS } from '../src/core/roster.js';
import { portrait } from '../src/ui/portraits.js';

const root = document.getElementById('ui-root');
root.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,#132C55,#0B1D3A);display:grid;grid-template-columns:repeat(8,1fr);gap:10px;padding:16px;align-content:center;font:900 12px system-ui;color:#FFF8EC';
const css = document.createElement('style');
css.textContent = '.pt{display:block;width:100%;aspect-ratio:1;border-radius:14px;overflow:hidden;border:3px solid #0B1D3A;background:var(--pc);box-shadow:0 4px 0 rgba(0,0,0,.4)}.pt svg,.pt img{display:block;width:100%;height:100%;object-fit:cover}';
document.head.appendChild(css);
for (const c of CHARACTERS) {
  for (const mood of ['neutral', 'happy', 'sad']) {
    const cell = document.createElement('div');
    cell.innerHTML = portrait(c.id, { mood }) + `<div style="text-align:center;margin-top:3px">${c.name}</div>`;
    root.appendChild(cell);
  }
}
// reorder so each column is one character: grid is row-major, so put moods as rows
const cells = [...root.children];
root.replaceChildren();
for (let m = 0; m < 3; m++) for (let i = 0; i < 8; i++) root.appendChild(cells[i * 3 + m]);
window.__ready = true;
