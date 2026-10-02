// Registry for Marco's own assets (photos + voice lines), plus safe fallbacks.
// At build time tools/build.mjs embeds every file in assets/user/ as a data URI into
// window.__MK_ASSETS__ = { "marco_face": "data:image/jpeg;base64,...", ... } (key = filename without extension).
// Everything must work with ZERO user assets present: check Assets.has(key) and fall back.
//
// Known keys (all optional):
//   marco_face, marco_face_happy, marco_face_sad   photos (jpg/png/webp), square-ish, face centred
//   marco_full                                     casual full-body or half-body photo (title screen, podium)
//   logo_marcoverse                                logo (png with transparency ideal)
//   custom_rival_face, custom_rival_name           photo + a .txt file holding the name  (Biscuit slot)
//   voice_ready, voice_go, voice_boost, voice_hit, voice_item, voice_win, voice_lose, voice_final_lap, voice_overtake
//                                                  short audio clips (wav/mp3/ogg/m4a)

export const ASSET_KEYS = {
  images: ['marco_face', 'marco_face_happy', 'marco_face_sad', 'marco_full', 'logo_marcoverse', 'custom_rival_face',
    'marco_desk', 'marco_rio'],   // marco_desk: smiling thumbs-up at his desk; marco_rio: Christ the Redeemer selfie
  voices: ['voice_ready', 'voice_go', 'voice_boost', 'voice_hit', 'voice_item', 'voice_win', 'voice_lose', 'voice_final_lap', 'voice_overtake'],
  text: ['custom_rival_name'],
};

const store = () => (typeof window !== 'undefined' && window.__MK_ASSETS__) || {};
const imageCache = new Map();
const bufferCache = new Map();

export const Assets = {
  has(key) { return key in store(); },
  keys() { return Object.keys(store()); },
  /** All asset keys starting with prefix (e.g. 'photo_', 'face_', 'voice_'). */
  keysWithPrefix(prefix) { return Object.keys(store()).filter((k) => k.startsWith(prefix)); },
  uri(key) { return store()[key] ?? null; },
  text(key, fallback = '') {
    const u = store()[key];
    if (!u) return fallback;
    try { return decodeURIComponent(escape(atob(u.split(',')[1]))).trim() || fallback; } catch { return fallback; }
  },
  // Returns Promise<HTMLImageElement|null>
  image(key) {
    if (imageCache.has(key)) return imageCache.get(key);
    const u = store()[key];
    const p = !u ? Promise.resolve(null) : new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = u;
    });
    imageCache.set(key, p);
    return p;
  },
  // Returns Promise<AudioBuffer|null>. Pass the shared AudioContext.
  async audioBuffer(key, ctx) {
    if (bufferCache.has(key)) return bufferCache.get(key);
    const u = store()[key];
    if (!u || !ctx) return null;
    try {
      const bin = atob(u.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buf = await ctx.decodeAudioData(bytes.buffer);
      bufferCache.set(key, buf);
      return buf;
    } catch (e) {
      console.warn('[assets] could not decode', key, e);
      return null;
    }
  },
};
