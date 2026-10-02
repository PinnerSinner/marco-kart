// Shared constants. The single source of truth for numbers several modules must agree on.
// Units: metres, seconds, radians. Y is up. Forward for yaw=0 is +Z.

export const CFG = {
  physicsHz: 60,
  fixedDt: 1 / 60,
  maxFrameDt: 0.1,          // clamp for the render-loop accumulator
  racers: 8,
  defaultLaps: 3,
  speedDisplayMult: 4.0,    // HUD km/h = speed(m/s) * this
  kart: {
    radius: 1.15,           // collision radius vs walls / other karts
    length: 2.8,
    width: 1.7,
    wheelBase: 1.8,
  },
  itemBox: { radius: 1.6, respawn: 6.0, hoverHeight: 1.4 },
  roadWidthDefault: 18,     // full width in metres
  countdownSeconds: 3,
  gravity: 32,              // arcade gravity (m/s^2), a bit heavier than real
  // Game speed classes (the "cc" of this game, in Mbps). `speed` is a TIME SCALE on the whole driving model: top speed and boost speed
  // x speed, accelerations and gravity x speed^2, yaw rates and grip rates x speed, so every track, ramp and jump keeps its geometry and
  // only the tempo changes (see KartPhysics / kartTuning.classScale). `aiPace` / `aiRubber` scale the AI's pace and rubber band,
  // `fov` is extra camera field of view at full speed (degrees), `fx` scales engine pitch / wind effects. Use src/core/speedClass.js to read it.
  speedClasses: {
    default: 100,
    classes: {
      50:  { id: 50,  name: '50 Mbps',  tag: 'Relaxed',  blurb: 'Gentle pace. Time to admire the scenery.',    speed: 0.80, aiPace: 0.95, aiRubber: 0.80, fov: -2, fx: 0.7 },
      100: { id: 100, name: '100 Mbps', tag: 'Standard', blurb: 'The proper Marco Kart experience.',            speed: 1.00, aiPace: 1.00, aiRubber: 1.00, fov: 0,  fx: 1.0 },
      150: { id: 150, name: '150 Mbps', tag: 'Fast',     blurb: 'Quicker karts, shorter reaction times.',       speed: 1.25, aiPace: 1.01, aiRubber: 1.15, fov: 4,  fx: 1.25 },
      200: { id: 200, name: '200 Mbps', tag: 'Extreme',  blurb: 'Fibre to the face. Pack a spare brain cell.',  speed: 1.50, aiPace: 1.02, aiRubber: 1.30, fov: 8,  fx: 1.5 },
    },
  },
};

// Yaw convention (IMPORTANT, every module relies on it):
//   forward = (sin yaw, 0, cos yaw);   right = (-cos yaw, 0, sin yaw)
//   three.js: object.rotation.y = yaw  (model authored facing +Z)
//   steer +1 = turn RIGHT = yaw DEcreases.  steer -1 = turn LEFT.
//   track lateral +ve = to the RIGHT of the direction of travel.

export const SURFACE = {
  ROAD: 'road', KERB: 'kerb', GRASS: 'grass', SAND: 'sand',
  BOOST: 'boost', OIL: 'oil', WATER: 'water', VOID: 'void',
};

// grip: 1 = full. speed: multiplier on max speed while on it. Physics reads this table.
export const SURFACE_PROPS = {
  road:  { grip: 1.00, speed: 1.00 },
  kerb:  { grip: 0.95, speed: 0.98, rumble: true },
  grass: { grip: 0.55, speed: 0.55 },
  sand:  { grip: 0.50, speed: 0.50 },
  boost: { grip: 1.00, speed: 1.00, boostPad: true },
  oil:   { grip: 0.22, speed: 1.00 },
  water: { grip: 0.60, speed: 0.72 },
  void:  { grip: 0,    speed: 0,    fall: true },
};

// Item ids and player-facing copy. Behaviour lives in src/race/ (itemDefs, ItemManager, itemEntities, aiItems), icons in src/ui/icons.js,
// meshes in src/visuals/itemMeshes.js. All 20 general items (plus 4 Biscuit-only ones, `exclusive`) are live: each has behaviour, a 3D mesh, an HUD icon, place weights and AI usage logic.
// Every entry carries its copy, so the HUD pop-up and the Item Guide screen are generated from this table and cannot drift from it:
//   name      final display name (title case)
//   blurb     ONE plain-English sentence (max 60 characters) saying exactly what it does: shown under the item box when picked up
//   category  one of ITEM_CATEGORIES (attack / defence / boost / hazard / chaos / skill)
//   good      "good against" tip for the Item Guide: the situation or rival this item is best used on (short noun phrase)
//   how       short how-to-use for the Item Guide (skill items explain the timing)
//   exclusive character id (e.g. 'biscuit') when ONLY that racer can roll the item (the Item Guide tags it)
//   skill     true for the timing / risk-and-reward items (the Item Guide flags them as skill-based)
// Two item slots: the big slot (the FRONT item) is the one the use button fires; a box fills the first empty slot.
export const ITEMS = {
  // --- original set
  cable:        { id: 'cable', name: 'Tangled Cable', category: 'hazard', blurb: 'Drops a cable behind you that spins out whoever hits it.',
                  good: 'Rivals tailgating you on a straight',
                  how: 'Press to drop it behind you. Best used with a rival on your tail.' },
  ping:         { id: 'ping', name: 'Ping Packet', category: 'attack', blurb: 'Fires a fast packet that bounces off walls three times.',
                  good: 'A rival ahead in a straight line',
                  how: 'Press to fire forwards. Hold Brake while pressing to fire backwards.' },
  traceroute:   { id: 'traceroute', name: 'Traceroute', category: 'attack', blurb: 'Fires a homing shot at the racer directly ahead of you.',
                  good: 'Rivals ahead, even round a corner',
                  how: 'Press to fire. It follows the road to the racer directly ahead, then locks on.' },
  espresso:     { id: 'espresso', name: 'Espresso', category: 'boost', blurb: 'A quick burst of speed for just over a second.',
                  good: 'Long straights and slow corner exits',
                  how: 'Press for an instant boost. Best on a straight or out of a corner.' },
  sudo:         { id: 'sudo', name: 'Sudo', category: 'boost', blurb: 'Eight seconds of invincible speed that knocks rivals aside.',
                  good: 'A crowded pack: bowl straight through it',
                  how: 'Press to activate. Touch rivals to knock them aside while it lasts.' },
  firewall:     { id: 'firewall', name: 'Firewall', category: 'defence', blurb: 'A shield that absorbs one hit, or fades after 10 seconds.',
                  good: 'Incoming shots, traps and blasts',
                  how: 'Press to raise it. It absorbs one hit (or fades after 10 seconds).' },
  fibre:        { id: 'fibre', name: 'Fibre Link', category: 'boost', blurb: 'Autopilot for 4.5 seconds: very fast and invincible.',
                  good: 'Falling behind, or a stretch you keep fumbling',
                  how: 'Press to hand over the wheel for 4.5 seconds. You are invincible and very fast.' },
  outage:       { id: 'outage', name: 'Regional Outage', category: 'chaos', blurb: 'Shrinks racers ahead for 7 seconds and wipes their items.',
                  good: 'A pack of rivals ahead of you',
                  how: 'Press when several racers are ahead of you: they shrink for 7 seconds and drop BOTH held items. The further back you are, the more it hits.' },
  kernel_panic: { id: 'kernel_panic', name: 'Kernel Panic', category: 'attack', blurb: 'Homes in on 1st place and spins everyone near the blast.',
                  good: 'The leader and anyone running close to them',
                  how: 'Press to launch. It flies to the leader and spins everyone near them.' },
  // --- v2 set
  sniffer:      { id: 'sniffer', name: 'Packet Sniffer', category: 'attack', blurb: 'Steals the front item of a racer ahead of you.',
                  good: 'A rival holding an item you would love to have',
                  how: 'Press to send it after a racer ahead. It steals their front item (their queued one if the front is in use). No item, or your slots are full: you get a small boost instead.' },
  bsod:         { id: 'bsod', name: 'Blue Screen', category: 'chaos', blurb: 'Spins out every rival within 45 metres of you.',
                  good: 'Rivals bunched close around you',
                  how: 'Press when rivals are close on all sides. Your own kart is not affected.' },
  autoscale:    { id: 'autoscale', name: 'Auto Scaling', category: 'attack', blurb: 'Grow huge for 6 seconds: squash hazards and spin rivals.',
                  good: 'Hazards on the road and rivals in your way',
                  how: 'Press to grow. You steer more slowly, but hazards are flattened and rivals you touch are spun.' },
  spill:        { id: 'spill', name: 'Coffee Spill', category: 'hazard', blurb: 'Drops a puddle behind you that makes karts lose grip.',
                  good: 'Rivals chasing you through a corner',
                  how: 'Press to drop it behind you. Any racer who drives through it loses grip.' },
  zeroday:      { id: 'zeroday', name: 'Zero-Day Mine', category: 'hazard', blurb: 'Drops a mine that arms in 5 seconds and blasts a wide area.',
                  good: 'Narrow roads where rivals must drive past',
                  how: 'Press to bury it behind you. It arms after 5 seconds, so steer round it yourself.' },
  pods:         { id: 'pods', name: 'Pod Cluster', category: 'defence', blurb: 'Three pods orbit to block hits, or launch as homing shots.',
                  good: 'Rivals in front and shots from behind',
                  how: 'Press once to orbit three pods (each blocks a hit), then press again to launch them one at a time. While the pods are out the swap button is locked.' },
  forcepush:    { id: 'forcepush', name: 'Force Push', category: 'chaos', blurb: 'Shoves racers within 14 metres aside and deflects shots.',
                  good: 'Rivals alongside and incoming shots',
                  how: 'Press when rivals are within about 14 metres. Projectiles nearby are bounced away too.' },
  pigeon:       { id: 'pigeon', name: 'Pigeon Post', category: 'attack', blurb: 'Flies down the road and splats the first racer it reaches.',
                  good: 'A rival a long way ahead of you',
                  how: 'Press to release it. Hold Brake while pressing to send it backwards.' },
  // --- skill items (timing and risk/reward)
  capacitor:    { id: 'capacitor', name: 'Surge Capacitor', category: 'skill', blurb: 'Charge then fire a bolt; the sweet spot pierces rivals.', skill: true,
                  good: 'A rival in a clear straight line ahead',
                  how: 'Press to start charging (you slow down), press again to fire. Fire in the green zone, 0.9 to 1.7 seconds, for a fast piercing bolt. Too early is weak; past 2.4 seconds it blows up on you. No swapping while charging.' },
  legacy:       { id: 'legacy', name: 'Legacy Server', category: 'skill', blurb: 'Tow it as a shield, then hurl it at a rival ahead.', skill: true,
                  good: 'Tailgaters and shots coming from behind',
                  how: 'Press to tow it behind you for up to 14 seconds: it blocks shots and rams tailgaters. Press again to hurl it. Being held as a shield locks item swapping.' },
  cronjob:      { id: 'cronjob', name: 'Cron Job', category: 'skill', blurb: 'Lights a 6-second fuse: pass it on by bumping a rival.', skill: true,
                  good: 'Rivals close enough to bump',
                  how: 'Press to light the 6-second fuse (you get a small boost). Bump a rival to pass it on. Whoever holds it at zero spins out, and so does anyone close by.' },
  // --- Biscuit-only items (`exclusive: 'biscuit'`): the roulette offers them to the dog racer and to nobody else
  poo:          { id: 'poo', name: 'Steaming Gift', category: 'hazard', exclusive: 'biscuit', blurb: 'Leaves a stinky present that spins out whoever hits it.',
                  good: 'Rivals tailgating you, or a gap you lob it into',
                  how: 'Press to drop it behind you (hold Forward-aim to lob it ahead). Whoever drives over it spins out, gets a green smear over the screen, and the stink cloud slows karts for 4 seconds.' },
  woof:         { id: 'woof', name: 'Mega Woof', category: 'chaos', exclusive: 'biscuit', blurb: 'A huge bark shoves karts aside and swats shots away.',
                  good: 'Rivals alongside and incoming shots',
                  how: 'Press when rivals are close, in front or beside you. The shockwave shoves them sideways, bats projectiles away and leaves them wobbling for a moment.' },
  zoomies:      { id: 'zoomies', name: 'Zoomies', category: 'boost', exclusive: 'biscuit', blurb: 'Five frantic seconds of speed, tail wagging, paws printing.',
                  good: 'Long, open stretches (the steering gets twitchy)',
                  how: 'Press for five seconds of boost with extra-keen, slightly erratic steering. Best on open road: it is hard to keep dead straight.' },
  fetch:        { id: 'fetch', name: 'Fetch!', category: 'attack', exclusive: 'biscuit', blurb: 'Throws a homing stick that boomerangs back for a boost.',
                  good: 'The racer just ahead of you',
                  how: 'Press to throw the stick at the racer ahead. It spins them out, then flies back to you: catch it for a mini-boost. Shots and barks can knock it out of the air.' },
};
/** The item categories in display order, with the plain-English meaning shown in the Item Guide. */
export const ITEM_CATEGORIES = {
  attack:  { id: 'attack',  label: 'Attack',  text: 'Hits a rival' },
  defence: { id: 'defence', label: 'Defence', text: 'Protects you' },
  boost:   { id: 'boost',   label: 'Boost',   text: 'Makes you faster' },
  hazard:  { id: 'hazard',  label: 'Hazard',  text: 'A trap left on the road' },
  chaos:   { id: 'chaos',   label: 'Chaos',   text: 'Disrupts several rivals at once' },
  skill:   { id: 'skill',   label: 'Skill',   text: 'Rewards good timing' },
};
/** Every race holds at most this many items at once (slot 1 is the one the use button fires). */
export const ITEM_SLOTS = 2;
/** Kept for compatibility: every v2 item is now live in `ITEMS`. */
export const ITEMS_V2 = {};
export const ITEM_IDS = Object.keys(ITEMS);
/** Items only one racer can ever roll: `{ poo: 'biscuit', ... }` (the value is the character id). They are extra to the 20 general items. */
export const EXCLUSIVE_ITEMS = Object.freeze(Object.fromEntries(Object.values(ITEMS).filter((i) => i.exclusive).map((i) => [i.id, i.exclusive])));
/** The 20 items every racer can roll. */
export const GENERAL_ITEM_IDS = ITEM_IDS.filter((id) => !EXCLUSIVE_ITEMS[id]);
/** Ids that only this character can roll (empty for everybody but Biscuit). @param {string} charId */
export const exclusiveItemsFor = (charId) => ITEM_IDS.filter((id) => EXCLUSIVE_ITEMS[id] === charId);
export const ITEM_IDS_V2 = Object.keys(ITEMS_V2);
/** Every item id including v2 (for icons, meshes and sfx work in progress). */
export const ALL_ITEMS = { ...ITEMS, ...ITEMS_V2 };

export const DIFFICULTIES = [
  { id: 'associate',    name: 'Associate',    aiSkill: 0.70, aiSpeed: 0.90, rubber: 0.05 },
  { id: 'professional', name: 'Professional', aiSkill: 0.85, aiSpeed: 0.96, rubber: 0.08 },
  { id: 'specialty',    name: 'Specialty',    aiSkill: 0.97, aiSpeed: 1.02, rubber: 0.10 },
];

// Grand Prix points by finishing place (1st..8th)
export const GP_POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

// Bus event catalogue lives in SPEC.md section 6.
