// Canvas art and gantries shared by the timed set-pieces: sector name arches, boost-pad chevrons, warning boards. Textures are null in Node.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { canvasTexture } from '../../textures.js';

const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

/** A neon board: big title, small strapline, coloured top and bottom bars. Aspect 8:1 by default. */
export function signTexture(title, sub, hex, { w = 2048, h = 256, bg = '#080a26' } = {}) {
  return cached(`sign:${title}:${sub}:${hex}:${w}`, () => canvasTexture(w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, bg); g.addColorStop(1, '#141040');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = css(hex); ctx.fillRect(0, 0, w, h * 0.04); ctx.fillRect(0, h * 0.96, w, h * 0.04);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = css(hex); ctx.shadowBlur = h * 0.16; ctx.fillStyle = '#f4fbff';
    ctx.font = `italic 900 ${sub ? h * 0.5 : h * 0.6}px "Arial Black", Impact, system-ui, sans-serif`;
    ctx.fillText(title, w / 2, sub ? h * 0.4 : h * 0.52, w * 0.94);
    if (sub) { ctx.shadowBlur = h * 0.06; ctx.fillStyle = css(hex); ctx.font = `800 ${h * 0.17}px system-ui, sans-serif`; ctx.fillText(sub, w / 2, h * 0.78, w * 0.9); }
  }, { repeat: false, aniso: 8 }));
}

/** Boost chevrons for platform pads (canvas up = forward, one repeat per 2.2 m): bright chevrons on a dark plate with a lit border. */
export function padTexture(hex = 0x22d3ee) {
  return cached(`pad:${hex}`, () => {
    const S = 256;
    const draw = (bg, fg, edge) => (ctx) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = edge; ctx.fillRect(0, 0, 10, S); ctx.fillRect(S - 10, 0, 10, S);
      ctx.strokeStyle = fg; ctx.lineWidth = 34; ctx.lineJoin = 'miter'; ctx.beginPath();
      ctx.moveTo(34, S * 0.86); ctx.lineTo(S / 2, S * 0.46); ctx.lineTo(S - 34, S * 0.86); ctx.stroke();
    };
    return { map: canvasTexture(S, S, draw('#0b1030', css(hex), '#ffffff'), { aniso: 8 }), emissive: canvasTexture(S, S, draw('#000', css(hex), '#9fe8ff'), { aniso: 8 }) };
  });
}

/** A ready pad material (lit, glowing chevrons). Cached per colour. */
export function padMaterial(hex = 0x22d3ee, k = 1.8) {
  return cached(`padmat:${hex}:${k}`, () => {
    const t = padTexture(hex);
    return new THREE.MeshStandardMaterial({ color: 0xffffff, map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: k, roughness: 0.4, metalness: 0.1 });
  });
}

/**
 * Sector arch: two pylons and a neon board over the road at s, facing the traffic. Returns the board mesh (so callers can pulse it).
 * Pylons stand at lateral +-(half + 1.6), on the road surface height there (works over void: they hang from a base plate).
 * @param {object} kit @param {{ s:number|string, title:string, sub?:string, colour:number, height?:number, mats:{dark:THREE.Material, glow:THREE.Material}, board?:number }} o
 */
export function sectorArch(kit, o) {
  const { track } = kit, s = track.S(o.s), sm = track.sample(s), hw = sm.width / 2, H = o.height ?? 9.2, yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
  const span = 2 * (hw + 1.6), col = new THREE.Color(o.colour);
  const grp = new THREE.Group(); grp.name = `arch:${o.title}`; grp.position.set(sm.pos.x, sm.pos.y, sm.pos.z); grp.rotation.y = yaw;
  const solid = new Geo(), glow = new Geo();
  for (const sg of [-1, 1]) {
    const x = sg * (hw + 1.6), y = -sg * (hw + 1.6) * Math.tan(sm.banking);
    solid.box(1.3, H, 1.3, { x, y, colour: 0x1b1f58, top: 0x30378a, ao: 0.25 });
    solid.box(2.2, 0.5, 2.2, { x, y, colour: 0x0d1035, ao: 0 });
    glow.box(0.18, H - 0.6, 0.18, { x: x - sg * 0.5, y: y + 0.3, z: 0.68, colour: col.clone().multiplyScalar(2.6), ao: 0 });
    glow.box(0.18, H - 0.6, 0.18, { x: x - sg * 0.5, y: y + 0.3, z: -0.68, colour: col.clone().multiplyScalar(2.6), ao: 0 });
  }
  const bw = o.board ?? span - 2, bh = bw / 8;
  solid.box(span + 1.2, 1.1, 1.1, { y: H - 0.2, colour: 0x141850, top: 0x2b3390, ao: 0.1 });
  glow.box(span + 1.3, 0.14, 1.2, { y: H + 0.85, colour: col.clone().multiplyScalar(3), ao: 0 });
  const mk = (g, m) => { const me = new THREE.Mesh(g.build(), m); me.castShadow = false; me.receiveShadow = false; return me; };
  grp.add(mk(solid, o.mats.dark), mk(glow, o.mats.glow));
  const tex = signTexture(o.title, o.sub ?? '', o.colour);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : col, toneMapped: false, side: THREE.DoubleSide }));
  board.position.set(0, H - 0.55 + bh / 2 + 0.3, -0.62); board.rotation.y = Math.PI;
  grp.add(board);
  kit.add(grp);
  return { group: grp, board };
}
