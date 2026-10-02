// Roster: characters, karts, tracks, cups. Pure data. Everyone reads this; nobody owns behaviour here.
// Character stats are 1..5. Kart stat mods are -2..+2 steps. Use statsFor() to combine.

export const CHARACTERS = [
  {
    id: 'marco', name: 'Marco', title: 'The Instructor', playerDefault: true,
    colour: 0xE63946, accent: 0xFFFFFF,
    stats: { speed: 3, accel: 3, handling: 3, weight: 3 },
    ai: { aggression: 0.5, skill: 1.0 },
    look: 'Red racing suit with a small Union-flag patch, flat cap, lanyard. Face plane takes the marco_face photo if supplied.',
    blurb: 'Teaches cloud and networking for a living. Drives like he is explaining subnetting: precisely, then suddenly very fast.',
    voiceKey: 'marco',
  },
  {
    id: 'subnet', name: 'Sir Subnet', title: 'Knight of the /24',
    colour: 0x2A9D8F, accent: 0xE9C46A,
    stats: { speed: 3, accel: 2, handling: 4, weight: 3 },
    ai: { aggression: 0.35, skill: 0.9 },
    look: 'Teal armour, plumed helmet, kite shield with 192.168.0.0/24 on it.',
    blurb: 'Divides everything into equal halves, including the racing line.',
  },
  {
    id: 'lambda', name: 'Sadie Spot', title: 'Spot Instance Speedster',
    colour: 0xF4A261, accent: 0x264653,
    stats: { speed: 2, accel: 5, handling: 3, weight: 2 },
    ai: { aggression: 0.6, skill: 0.85 },
    look: 'Orange hoodie with a glowing lightning-bolt badge, goggles pushed up on the forehead.',
    blurb: 'Cheap, quick, and liable to be terminated with two minutes\' notice.',
  },
  {
    id: 'packet', name: 'Packet Pete', title: 'Lossy but Lovable',
    colour: 0x8338EC, accent: 0xFFBE0B,
    stats: { speed: 4, accel: 2, handling: 2, weight: 4 },
    ai: { aggression: 0.75, skill: 0.75 },
    look: 'Chunky purple courier with a parcel-shaped head-box and a cracked visor.',
    blurb: 'Arrives out of order. Sometimes does not arrive at all.',
  },
  {
    id: 'carlos', name: 'Caipirinha Carlos', title: 'Calçadão Local',
    colour: 0x06D6A0, accent: 0xFFD166,
    stats: { speed: 3, accel: 4, handling: 3, weight: 2 },
    ai: { aggression: 0.55, skill: 0.8 },
    look: 'Green-and-yellow football shirt, sunglasses, a lime slice clipped to the helmet.',
    blurb: 'Has never once been in a hurry, and is somehow always ahead.',
  },
  {
    id: 'tilly', name: 'Tea-Time Tilly', title: 'Dame of the Ring Road',
    colour: 0xEF476F, accent: 0xFFFFFF,
    stats: { speed: 2, accel: 3, handling: 5, weight: 2 },
    ai: { aggression: 0.3, skill: 0.95 },
    look: 'Pink quilted jacket, pearl necklace, teacup-shaped helmet crest, flask on the back.',
    blurb: 'Will overtake you politely, then again less politely.',
  },
  {
    id: 'rex', name: 'Root Rex', title: 'Permission Denied',
    colour: 0x3A86FF, accent: 0x00FF88,
    stats: { speed: 5, accel: 2, handling: 2, weight: 5 },
    ai: { aggression: 0.9, skill: 0.8 },
    look: 'Big blocky robot in a dark hoodie, green terminal-text visor, chunky boots.',
    blurb: 'Has sudo on the whole circuit and is not afraid to use it.',
  },
  {
    id: 'biscuit', name: 'Biscuit', title: 'Good Boy, Fast Boy', customSlot: true,
    colour: 0xC9A227, accent: 0xFFFFFF,
    stats: { speed: 3, accel: 5, handling: 4, weight: 1 },
    ai: { aggression: 0.45, skill: 0.85 },
    look: 'Golden spaniel with floppy ears and racing goggles. Customisable: name + photo can be swapped for a pet, friend or family member.',
    blurb: 'Chases the leader on instinct. Distracted by anything called a "treat".',
    voiceKey: 'biscuit',
  },
];

// Kart stat mods are -2..+2 steps on the 1..5 bars (the combined result is clamped). They are deliberately big: each kart type is a different
// vehicle. The rest of a kart's character (grip, drift arc, mini-turbo size, off-road penalty, collisions, air control, signature trait) lives in
// KART_PROFILES (src/kart/kartTuning.js); `trait`/`traitText` name the signature trait and `feel` is the one-line "how it drives" the kart-select screen shows.
export const KARTS = [
  { id: 'cruiser', name: 'Blighty Cruiser', mods: { speed: 0, accel: 0, handling: 0, weight: 0 },
    trait: 'Steady Hand',
    traitText: 'Forgiving: wall scrapes and spin-outs cost less speed, and it never gets twitchy.',
    blurb: 'Balanced. Reliable. Comes with a cup holder.',
    feel: 'A sensible saloon: nothing to prove, nothing to spill.' },
  { id: 'buggy', name: 'Copa Buggy', mods: { speed: -2, accel: 2, handling: 2, weight: -2 },
    trait: 'Sand Surfer',
    traitText: 'Barely slows on grass, sand or puddles, and its quick little drifts charge fast. Gets shoved about by heavier karts.',
    blurb: 'Light and twitchy. Loves a tight corner.',
    feel: 'A shopping trolley with ambition: dives into corners, shrugs off the verge.' },
  { id: 'hauler', name: 'Rack Hauler', mods: { speed: 2, accel: -2, handling: -2, weight: 2 },
    trait: 'Bulldozer',
    traitText: 'Shoves rivals aside and its mini-turbos are huge, but it is slow off the line and wide in the corners.',
    blurb: 'Heavy server-rack on wheels. Flattens rivals.',
    feel: 'Subtle as a skip lorry: slow off the mark, then impossible to argue with.' },
  { id: 'rocket', name: 'Packet Rocket', mods: { speed: 1, accel: 1, handling: -2, weight: -1 },
    trait: 'Afterburner',
    traitText: 'Brutal launch and boosts that hit 30% harder, but it slides in every corner, its drifts take an age to charge and it hates the grass.',
    blurb: 'Fast in a straight line. Corners are a suggestion.',
    feel: 'All throttle, no apologies: brilliant on the straights, slippery as a kipper in the bends.' },
];

/**
 * Combined character + kart stats, each clamped to 1..5 (what the stat bars show). A non-enumerable `raw` property keeps the unclamped
 * sums, so physics can still tell a stat-5 character on a +2 kart from a stat-3 one (kartTuning.deriveParams reads `raw`, limited to 0.5..6).
 * @param {string} charId @param {string} kartId
 * @returns {{speed:number, accel:number, handling:number, weight:number}}
 */
export function statsFor(charId, kartId) {
  const c = CHARACTERS.find((x) => x.id === charId) ?? CHARACTERS[0];
  const k = KARTS.find((x) => x.id === kartId) ?? KARTS[0];
  const cl = (v) => Math.max(1, Math.min(5, v));
  const raw = {
    speed: c.stats.speed + k.mods.speed,
    accel: c.stats.accel + k.mods.accel,
    handling: c.stats.handling + k.mods.handling,
    weight: c.stats.weight + k.mods.weight,
  };
  const out = { speed: cl(raw.speed), accel: cl(raw.accel), handling: cl(raw.handling), weight: cl(raw.weight) };
  Object.defineProperty(out, 'raw', { value: raw, enumerable: false });
  return out;
}

export const TRACKS = [
  { id: 'copacabana', name: 'Copacabana Calçadão', cup: 'marcoverse',
    blurb: 'Wavy black-and-white pavement, beach volleyball, kiosks, a hilltop statue watching over you.',
    music: 'copacabana', palette: 'sunny' },
  { id: 'blighty', name: 'Blighty Grand Prix', cup: 'marcoverse',
    blurb: 'A drizzly city circuit: clock tower, double-deckers, roundabouts, and puddles that grab your wheels.',
    music: 'blighty', palette: 'rainy' },
  { id: 'datacentre', name: 'Cloud Nine Data Centre', cup: 'marcoverse',
    blurb: 'Server-rack canyons, glowing fibre, spinning fans. Mind the cable trench.',
    music: 'datacentre', palette: 'neon-dark' },
  { id: 'marcoverse', name: 'Marcoverse Speedway', cup: 'marcoverse', final: true,
    blurb: 'A neon ribbon through deep space. No walls. Do not fall off.',
    music: 'marcoverse', palette: 'space' },
];

export const CUPS = [
  { id: 'marcoverse', name: 'Marcoverse Cup', tracks: ['copacabana', 'blighty', 'datacentre', 'marcoverse'] },
];

export const getCharacter = (id) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
export const getKart = (id) => KARTS.find((k) => k.id === id) ?? KARTS[0];
export const getTrackInfo = (id) => TRACKS.find((t) => t.id === id) ?? TRACKS[0];
