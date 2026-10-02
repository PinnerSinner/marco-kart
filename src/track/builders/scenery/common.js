// Shared scenery pieces used by more than one track: apartment blocks, lamps, benches, flags, boats, sign atlas.
import * as THREE from 'three';
import { Geo } from '../Geo.js';
import { canvasTexture } from '../textures.js';

const col = new THREE.Color();

/**
 * Apartment / office block with stacked setbacks, facade UVs (one texture tile = one bay x one floor), a plain roof cap and
 * roof clutter. Drawn into the statics geometry bucket `g` in WORLD coordinates.
 * @param {Geo} g bucket for the facade material (tiles)  @param {Geo} gRoof bucket for the plain vertex-colour material
 * @param {{x:number,y:number,z:number,w:number,d:number,floors:number,yaw?:number,colour:number,roof?:number,bay?:number,floorH?:number,stripe?:number|null,rng:Function,setback?:boolean}} o
 */
export function addBlock(g, gRoof, o) {
  const { x, y, z, w, d, floors, colour, roof = 0x8d8f96, bay = 3.4, floorH = 3.1, rng, yaw = 0, setback = true } = o;
  const tiers = setback && floors > 8 && rng() < 0.6 ? 2 : 1;
  let cy = y, cw = w, cd = d, left = floors;
  for (let t = 0; t < tiers; t++) {
    const fl = t === tiers - 1 ? left : Math.ceil(left * 0.7), hh = fl * floorH;
    g.box(cw, hh, cd, { x, y: cy, z, ry: yaw, colour, top: roof, ao: 0.28, facade: [bay, floorH] });
    if (o.stripe) gRoof.box(cw + 0.5, 0.5, cd + 0.5, { x, y: cy + hh - 0.05, z, ry: yaw, colour: o.stripe, ao: 0 });
    cy += hh; left -= fl; cw *= 0.72; cd *= 0.8;
  }
  const ry = yaw;
  gRoof.box(w * 0.3, 2.2, d * 0.3, { x: x + Math.cos(ry) * w * 0.15, y: cy, z: z - Math.sin(ry) * w * 0.15, ry, colour: 0xb0b4bc, ao: 0.3 });
  gRoof.cyl(0.08, 0.1, 6 + rng() * 4, 5, { x, y: cy, z, colour: 0x707480, ao: 0 });
}

/**
 * Painted sign atlas: a grid of `cells` (cols x rows) panels; each cell = { text, sub?, bg, fg }.
 * @returns {{ texture: THREE.Texture|null, uv: (i:number)=>number[] }}
 */
export function signAtlas(cells, { cols = 4, cw = 256, ch = 128 } = {}) {
  const rows = Math.ceil(cells.length / cols);
  const tex = canvasTexture(cols * cw, rows * ch, (ctx) => {
    cells.forEach((c, i) => {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      ctx.fillStyle = c.bg; ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = c.fg; ctx.lineWidth = 6; ctx.strokeRect(x + 6, y + 6, cw - 12, ch - 12);
      ctx.fillStyle = c.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const size = c.size ?? (c.sub ? 46 : 58);
      ctx.font = `italic 900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
      ctx.fillText(c.text, x + cw / 2, y + ch * (c.sub ? 0.4 : 0.52), cw - 30);
      if (c.sub) { ctx.font = `700 ${Math.round(size * 0.42)}px system-ui, sans-serif`; ctx.fillText(c.sub, x + cw / 2, y + ch * 0.76, cw - 30); }
    });
  }, { repeat: false, aniso: 4 });
  const uv = (i) => { const cx = i % cols, cy = Math.floor(i / cols); return [(cx * cw + 3) / (cols * cw), 1 - ((cy + 1) * ch - 3) / (rows * ch), ((cx + 1) * cw - 3) / (cols * cw), 1 - (cy * ch + 3) / (rows * ch)]; };
  return { texture: tex, uv };
}

/** Small sailing dinghy: hull + mast + two sails. Origin at the waterline. */
export function boatGeo({ hull = 0xf5f0e6, stripe = 0xd62839, sail = 0xffffff, size = 1 } = {}) {
  const g = new Geo();
  g.box(1.6 * size, 0.55 * size, 4.8 * size, { y: -0.15 * size, colour: hull, ao: 0.2 });
  g.cone(0.85 * size, 1.4 * size, 4, { y: -0.15 * size, z: 2.9 * size, rx: Math.PI / 2, colour: hull, ao: 0.1 });
  g.box(1.62 * size, 0.14 * size, 4.9 * size, { y: 0.28 * size, colour: stripe, ao: 0 });
  g.cyl(0.05 * size, 0.07 * size, 6.4 * size, 5, { y: 0.3 * size, z: 0.3 * size, colour: 0xc8ccd2, ao: 0 });
  const tri = (h, w, z0, c) => { const a = g.vert(0, 0.6 * size, z0, 1, 0, 0, 0, 0, ...(col.set(c).toArray())), b = g.vert(0, 0.6 * size + h, z0, 1, 0, 0, 0, 1, ...(col.set(c).toArray())), d = g.vert(0, 0.6 * size, z0 - w, 1, 0, 0, 1, 0, ...(col.set(c).toArray())); g.tri(a, d, b); const a2 = g.vert(0, 0.6 * size, z0, -1, 0, 0, 0, 0, ...(col.set(c).toArray())), b2 = g.vert(0, 0.6 * size + h, z0, -1, 0, 0, 0, 1, ...(col.set(c).toArray())), d2 = g.vert(0, 0.6 * size, z0 - w, -1, 0, 0, 1, 0, ...(col.set(c).toArray())); g.tri(a2, b2, d2); };
  tri(5.6 * size, 2.6 * size, 0.5 * size, sail); tri(4.2 * size, 1.5 * size, 1.9 * size, 0xffd166);
  return g;
}
