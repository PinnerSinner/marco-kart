import { trackArt } from '../src/ui/trackArt.js';
const root = document.getElementById('ui-root');
root.style.cssText = 'position:fixed;inset:0;background:#0B1D3A;display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:14px;align-content:center';
for (const id of ['copacabana', 'blighty', 'datacentre', 'marcoverse']) {
  const d = document.createElement('div'); d.style.cssText = 'border:4px solid #FFF8EC;border-radius:12px;overflow:hidden;aspect-ratio:240/150';
  d.innerHTML = trackArt(id); d.firstChild.style.cssText = 'width:100%;height:100%;display:block'; root.appendChild(d);
}
window.__ready = true;
