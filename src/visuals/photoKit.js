// Turn Marco's photos into things you can hang in a 3D world. Browser-only at call time (uses canvas); import-safe in Node.
// Every helper returns something sensible with NO assets present (a cheerful procedural stand-in), so tracks never break.
import * as THREE from 'three';
import { Assets } from '../core/assets.js';
import { PHOTOS, availablePhotos } from '../core/photos.js';

const cache = new Map();
const hasDoc = () => typeof document !== 'undefined';

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/**
 * A CanvasTexture of a photo with an optional frame. Loads asynchronously: the texture starts as a coloured placeholder and fills in when the image decodes.
 * @param {string} key asset key, e.g. 'photo_holi' or 'face_holi' or 'marco_face'
 * @param {{w?:number,h?:number,frame?:'none'|'billboard'|'polaroid'|'neon'|'gold',caption?:string,fit?:'cover'|'contain',colour?:string}} [o]
 */
export function photoTexture(key, o = {}) {
  const { w = 512, h = 512, frame = 'none', caption = '', fit = 'cover', colour = '#ff9a3c' } = o;
  const id = `${key}|${w}|${h}|${frame}|${caption}|${fit}|${colour}`;
  if (cache.has(id)) return cache.get(id);
  if (!hasDoc()) return new THREE.Texture();
  const canvas = makeCanvas(w, h), g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const draw = (img) => {
    const pad = frame === 'polaroid' ? w * 0.07 : frame === 'none' ? 0 : w * 0.035;
    const bottom = frame === 'polaroid' ? h * 0.2 : pad;
    g.fillStyle = frame === 'polaroid' ? '#fffaf0' : frame === 'gold' ? '#d9a520' : frame === 'neon' ? '#12082e' : frame === 'billboard' ? '#20242c' : colour;
    g.fillRect(0, 0, w, h);
    const ix = pad, iy = pad, iw = w - pad * 2, ih = h - pad - bottom;
    if (img) {
      const sr = img.width / img.height, dr = iw / ih;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (fit === 'cover') { if (sr > dr) { sw = img.height * dr; sx = (img.width - sw) / 2; } else { sh = img.width / dr; sy = (img.height - sh) / 2; } }
      g.drawImage(img, sx, sy, sw, sh, ix, iy, iw, ih);
    } else {
      const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#ff9a3c'); grd.addColorStop(1, '#e63946');
      g.fillStyle = grd; g.fillRect(ix, iy, iw, ih);
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = `900 ${Math.round(ih * 0.28)}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('MARCO', w / 2, iy + ih / 2);
    }
    if (frame === 'neon') { g.strokeStyle = '#22d3ee'; g.lineWidth = w * 0.02; g.strokeRect(pad / 2, pad / 2, w - pad, h - pad); g.strokeStyle = '#ff2fb3'; g.lineWidth = w * 0.008; g.strokeRect(pad, pad, w - pad * 2, h - pad * 2); }
    if (caption) {
      g.fillStyle = frame === 'polaroid' ? '#2b2b2b' : '#fff8ec'; g.font = `${frame === 'polaroid' ? 600 : 800} ${Math.round(h * 0.06)}px system-ui,sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(caption, w / 2, h - bottom / 2 - (frame === 'polaroid' ? 0 : 0), w - pad * 2);
    }
    tex.needsUpdate = true;
  };
  draw(null);
  Assets.image(key).then((img) => { if (img) draw(img); });
  cache.set(id, tex);
  return tex;
}

/** Standing billboard: a framed photo on two posts. Returns THREE.Group, width w metres, faces +Z. Origin at the ground, centre of the base. */
export function makeBillboard(slugOrKey, { w = 8, aspect = 0.75, frame = 'billboard', caption, lit = true } = {}) {
  const key = slugOrKey.includes('_') && (slugOrKey.startsWith('photo_') || slugOrKey.startsWith('face_') || slugOrKey.startsWith('marco_')) ? slugOrKey : `photo_${slugOrKey}`;
  const h = w * aspect, g = new THREE.Group();
  const tex = photoTexture(key, { w: 768, h: Math.round(768 * aspect), frame, caption });
  const mat = lit ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: tex });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); board.position.y = h / 2 + 2.2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.2), new THREE.MeshStandardMaterial({ color: 0x1c2029 })); back.position.set(0, board.position.y, -0.12);
  const postGeo = new THREE.CylinderGeometry(0.15, 0.2, 2.6, 8), postMat = new THREE.MeshStandardMaterial({ color: 0x333a46 });
  for (const sx of [-w * 0.35, w * 0.35]) { const p = new THREE.Mesh(postGeo, postMat); p.position.set(sx, 1.3, -0.12); g.add(p); }
  g.add(back, board); g.userData.board = board;
  return g;
}

/** Flat decal on the ground / a wall (mural). Plane facing +Y by default; rotate as needed. */
export function makeMural(slugOrKey, { w = 10, h = 10, frame = 'none', caption } = {}) {
  const key = slugOrKey.startsWith('photo_') || slugOrKey.startsWith('face_') || slugOrKey.startsWith('marco_') ? slugOrKey : `photo_${slugOrKey}`;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: photoTexture(key, { w: 768, h: Math.round(768 * h / w), frame, caption }), toneMapped: false, transparent: true }));
  m.rotation.x = -Math.PI / 2; return m;
}

/** A sphere textured with a face (planets, balloons, disco balls). */
export function makeFaceBall(slugOrKey = 'marco_face', { radius = 3 } = {}) {
  const key = slugOrKey.includes('_') && (slugOrKey.startsWith('face_') || slugOrKey.startsWith('marco_')) ? slugOrKey : `face_${slugOrKey}`;
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), new THREE.MeshStandardMaterial({ map: photoTexture(key, { w: 512, h: 512 }), roughness: 0.6 }));
}

/** Deterministic list of photo slugs to sprinkle around a track, cycling through what exists (or PHOTOS order if none loaded, so layouts stay identical). */
export function photoSlugs(n, seed = 0, filter = {}) {
  const have = availablePhotos(Assets, filter); const src = have.length ? have : PHOTOS;
  return Array.from({ length: n }, (_, i) => src[(i + Math.abs(Math.floor(seed))) % src.length].slug);
}
