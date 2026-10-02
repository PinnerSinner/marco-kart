// Marco's photo library. Files live in assets/user/ and are embedded by tools/build.mjs:
//   photo_<slug>   full frame (<= 800 px, JPEG)     face_<slug>   square face crop (320 px, JPEG)
// Also: marco_face (headset cut-out, transparent PNG), marco_face_happy, marco_face_sad (= face_headache), marco_face_hit (= face_squish),
//       marco_face_wow (= face_marina_laugh), marco_full (throne cut-out), marco_rio, marco_desk, logo_marcoverse.
// EVERYTHING must still work with none of these present (Assets.has(key) === false): use procedural art.
//
// mood: happy | cool | funny | calm | sad     tags help choose where a photo fits (billboards, murals, loading tips, podium...)
// aspect: 'landscape' | 'portrait' | 'square' of the FULL frame (see `photo_<slug>`)
export const PHOTOS = [
  { slug: 'keffiyeh_car',  mood: 'happy', aspect: 'portrait',  caption: 'Desert road-trip chic', tags: ['travel', 'costume'] },
  { slug: 'headache',      mood: 'sad',   aspect: 'portrait',  caption: 'It was DNS. It is always DNS.', tags: ['sad', 'setup'] },
  { slug: 'couch',         mood: 'calm',  aspect: 'landscape', caption: 'Between cohorts', tags: ['home'] },
  { slug: 'hippie',        mood: 'funny', aspect: 'portrait',  caption: 'Dress-up day', tags: ['costume', 'funny'] },
  { slug: 'snake_chair',   mood: 'cool',  aspect: 'portrait',  caption: 'Gaming chair, flat white in hand', tags: ['setup', 'cool'] },
  { slug: 'sugarloaf',     mood: 'cool',  aspect: 'landscape', caption: 'Sugarloaf, Rio', tags: ['rio', 'travel'] },
  { slug: 'yoda',          mood: 'funny', aspect: 'portrait',  caption: 'Hammock time with a little green friend', tags: ['home', 'funny'] },
  { slug: 'desk_point',    mood: 'happy', aspect: 'landscape', caption: 'Point one: the labs are ready', tags: ['setup', 'teaching'] },
  { slug: 'vatican',       mood: 'happy', aspect: 'landscape', caption: 'Gallery of Maps, Vatican', tags: ['travel'] },
  { slug: 'beach_sunset',  mood: 'happy', aspect: 'landscape', caption: 'Copacabana sunset', tags: ['rio', 'beach'] },
  { slug: 'snorkel',       mood: 'cool',  aspect: 'landscape', caption: 'Snorkel on standby', tags: ['beach', 'travel'] },
  { slug: 'flag_rio',      mood: 'happy', aspect: 'landscape', caption: 'Above Copacabana', tags: ['rio', 'travel'] },
  { slug: 'desert_drive',  mood: 'happy', aspect: 'portrait',  caption: 'Open road', tags: ['travel', 'cars'] },
  { slug: 'banana_suit',   mood: 'funny', aspect: 'portrait',  caption: 'The banana years', tags: ['costume', 'funny'] },
  { slug: 'squish',        mood: 'funny', aspect: 'portrait',  caption: 'Cheeks: maximum compression', tags: ['funny', 'hit'] },
  { slug: 'marina_laugh',  mood: 'happy', aspect: 'portrait',  caption: 'Golden hour at the marina', tags: ['travel', 'win'] },
  { slug: 'holi',          mood: 'happy', aspect: 'portrait',  caption: 'Colour run', tags: ['travel', 'funny'] },
  { slug: 'kazakh_hat',    mood: 'cool',  aspect: 'portrait',  caption: 'Almaty TV tower', tags: ['travel', 'cool'] },
  { slug: 'banana_run',    mood: 'funny', aspect: 'portrait',  caption: 'Race number 512', tags: ['costume', 'racing', 'funny'] },
  { slug: 'stonehenge',    mood: 'happy', aspect: 'landscape', caption: 'Stonehenge, obviously', tags: ['uk', 'travel'] },
  { slug: 'certificate',   mood: 'happy', aspect: 'portrait',  caption: 'Certified. Framed by nobody.', tags: ['teaching', 'win'] },
  { slug: 'graduation',    mood: 'funny', aspect: 'portrait',  caption: 'Already forgotten everything', tags: ['uk', 'funny', 'teaching'] },
  { slug: 'passport',      mood: 'cool',  aspect: 'portrait',  caption: 'Official ID. Allegedly.', tags: ['cool', 'funny'] },
];

/** Slugs whose assets are actually present, optionally filtered by mood / tag. Safe in Node (returns []). */
export function availablePhotos(Assets, { mood, tag } = {}) {
  return PHOTOS.filter((p) => Assets.has(`photo_${p.slug}`) && (!mood || p.mood === mood) && (!tag || p.tags.includes(tag)));
}

/** Deterministic pick (by seed) from the photos that exist; returns undefined when none. */
export function pickPhoto(Assets, seed = 0, filter = {}) {
  const list = availablePhotos(Assets, filter);
  return list.length ? list[Math.abs(Math.floor(seed)) % list.length] : undefined;
}

/** Marco's face-plane photo for an expression, with fallbacks. Returns an asset key or null. */
export function marcoFaceKey(Assets, expression = 'neutral') {
  const order = {
    neutral: ['marco_face'], happy: ['marco_face_happy', 'marco_face'], boost: ['marco_face_wow', 'marco_face_happy', 'marco_face'],
    sad: ['marco_face_sad'], hit: ['marco_face_hit', 'marco_face_sad'], wow: ['marco_face_wow', 'marco_face_happy'],
  }[expression] ?? ['marco_face'];
  return order.find((k) => Assets.has(k)) ?? (Assets.has('marco_face') ? 'marco_face' : null);
}
