// Marco's voice lines. ONE source of truth: the game (captions + audio lookup) and the recording sheet (VOICELINES.md) both read this.
// Audio asset key = `voice_<key>`; extra takes are `voice_<key>_2`, `voice_<key>_3` (the game picks one at random among those that exist).
// `text` is what Marco says (and the caption shown when there is no recording). `when` says exactly when it plays.
// tier 0 = RECORDED: there is a voice_<key>.mp3 in assets/user (test/dialogue_catalogue.test.js checks both directions, file <-> tier 0)
// tier 1 = record these first | 2 = next | 3 = bonus flavour. `rude: true` lines only play with the Settings toggle 'Rude banter' on.
// CLIP_SECONDS below holds the measured length of every recording so the dialogue director can time speech bubbles and stop other barks
// talking over a clip. `cooldown` = minimum seconds between plays of this key. `chance` = probability it fires when its trigger happens.
export const MARCO_VOICE = [
  // ---- recorded (tier 0): the first eight Marco supplied, then the big session of 41
  { key: 'ready', text: 'Right, let\'s go!', when: 'Before the countdown', tier: 0 },
  { key: 'go', text: 'Go go go!', when: 'On GO', tier: 0 },
  { key: 'boost', text: 'Woohoo!', when: 'Any boost (item, mini-turbo)', tier: 0, cooldown: 5 },
  { key: 'hit', text: 'Not again!', when: 'You get spun out or hit', tier: 0, cooldown: 3 },
  { key: 'item', text: 'Nice one!', when: 'You pick up an item', tier: 0, cooldown: 6 },
  { key: 'final_lap', text: 'Final lap!', when: 'Start of the last lap', tier: 0 },
  { key: 'win', text: 'Yes! That\'s how it\'s done!', when: 'You finish 1st', tier: 0 },
  { key: 'lose', text: 'Ah, mate...', when: 'You finish 4th or worse', tier: 0 },
  { key: 'overtake', text: 'Coming through!', when: 'You pass a rival', tier: 0, cooldown: 8 },
  { key: 'overtaken', text: 'Oi! Rude.', when: 'A rival passes you', tier: 0, cooldown: 8 },
  { key: 'take_lead', text: 'Front of the pack!', when: 'You move into 1st place', tier: 0, cooldown: 12 },
  { key: 'rocket_start', text: 'Perfect start!', when: 'You nail the rocket start', tier: 0 },
  { key: 'speed', text: 'Flat out!', when: 'Holding top speed for a few seconds', tier: 0, cooldown: 20 },
  { key: 'mini_turbo', text: 'Turbo!', when: 'You release a charged drift', tier: 0, cooldown: 6 },
  { key: 'max_charge', text: 'Full charge!', when: 'Drift reaches the third (magenta) level', tier: 0, cooldown: 10 },
  { key: 'jump', text: 'Wheeeee!', when: 'Big jump or ramp', tier: 0, cooldown: 8 },
  { key: 'shortcut', text: 'Secret route!', when: 'You use a shortcut', tier: 0, cooldown: 10 },
  { key: 'wall', text: 'Ow! That\'s a wall.', when: 'You smack a wall', tier: 0, cooldown: 6 },
  { key: 'wrong_way', text: 'Wait, wrong way!', when: 'You drive the wrong way', tier: 0, cooldown: 10 },
  { key: 'fall', text: 'Not the void!', when: 'You fall off the track', tier: 0, cooldown: 30 },
  { key: 'use_attack', text: 'Take that!', when: 'You fire an attacking item', tier: 0, cooldown: 6 },
  { key: 'item_hit_rival', text: 'Bullseye!', when: 'Your item hits a rival', tier: 0, cooldown: 6 },
  { key: 'miss', text: 'Oh, that missed.', when: 'Your item misses', tier: 0, cooldown: 6 },
  { key: 'block', text: 'Blocked!', when: 'Your shield or decoy absorbs a hit', tier: 0, cooldown: 8 },
  { key: 'dodged', text: 'Ha! Missed me!', when: 'An item narrowly misses you', tier: 0, cooldown: 6 },
  { key: 'podium', text: 'On the podium!', when: 'You finish 2nd or 3rd', tier: 0 },
  { key: 'bad_start', text: 'Ah, stalled it.', when: 'Poor start', tier: 0 },
  { key: 'drift_start', text: 'Here we go, sliding!', when: 'You begin a long drift', tier: 0, cooldown: 25, chance: 0.4 },
  { key: 'trick', text: 'Nailed it!', when: 'You land a trick off a ramp', tier: 0, cooldown: 8 },
  { key: 'offroad', text: 'Grass, grass, grass!', when: 'You are off-road for a while', tier: 0, cooldown: 15 },
  { key: 'respawn', text: 'Right, back in.', when: 'After a respawn', tier: 0 },
  { key: 'near_miss', text: 'Close one!', when: 'You scrape past a hazard or kart', tier: 0, cooldown: 12 },
  { key: 'lose_lead', text: 'Lost the lead!', when: 'You drop out of 1st', tier: 0, cooldown: 15 },
  { key: 'comeback', text: 'I\'m coming for you!', when: 'You gain 2+ places quickly', tier: 0, cooldown: 20 },
  { key: 'lap2', text: 'Lap two, let\'s go.', when: 'Start of lap 2', tier: 0 },
  { key: 'kernel_panic', text: 'Kernel panic!', when: 'You are hit by Kernel Panic', tier: 0 },
  { key: 'shrink', text: 'I\'m tiny!', when: 'You are shrunk by an outage', tier: 0 },
  { key: 'sudo', text: 'I have root access!', when: 'You use Sudo or Overclock', tier: 0 },
  { key: 'fibre', text: 'Gigabit speed!', when: 'You use Fibre Link or VPN Tunnel', tier: 0 },
  { key: 'cuppa', text: 'Lovely cuppa.', when: 'You use the Cuppa item', tier: 0 },
  { key: 'menu_welcome', text: 'Welcome to Marco Kart!', when: 'Title screen, first key press', tier: 0 },
  { key: 'photo_finish', text: 'Photo finish!', when: 'You finish within 0.3 s of the next racer', tier: 0 },
  { key: 'popups', text: 'Stop the pop-ups!', when: 'You are hit by Pop-up Ads', tier: 0 },
  { key: 'bsod', text: 'Blue screen! Again!', when: 'You are hit by Blue Screen', tier: 0 },
  { key: 'coconut', text: 'Coco gelado!', when: 'You use the coconut', tier: 0 },
  { key: 'select_me', text: 'Marco, of course.', when: 'You pick Marco on character select', tier: 0 },
  { key: 'quip_dns', text: 'It\'s always DNS.', when: 'Random quip, now and then', tier: 0, cooldown: 60 },
  { key: 'quip_subnet', text: 'That\'s a slash twenty-four for you.', when: 'Random quip after passing someone', tier: 0, cooldown: 60 },
  { key: 'quip_cloud', text: 'There is no cloud. Just someone else\'s kart.', when: 'Random quip', tier: 0, cooldown: 90 },

  // ---- tier 1: record these next (they come up all the time)
  { key: 'hit_item', text: 'Who threw that?!', when: 'You are hit by any other item', tier: 1, cooldown: 6 },
  { key: 'bump', text: 'Mind the paintwork!', when: 'You nudge another kart', tier: 1, cooldown: 10 },
  { key: 'bumped', text: 'Oi, watch it!', when: 'Another kart bumps you', tier: 1, cooldown: 10 },
  { key: 'taunt', text: 'Keep up, class!', when: 'Random taunt when you are in front', tier: 1, cooldown: 40 },
  // ---- tier 2
  { key: 'last_place', text: 'Dead last. Brilliant.', when: 'You are in last place', tier: 2, cooldown: 30 },
  { key: 'gp_win', text: 'Cup champion!', when: 'You win the Grand Prix', tier: 2 },
  { key: 'perfect_release', text: 'Textbook!', when: 'You release a drift at the perfect moment', tier: 2, cooldown: 12 },
  { key: 'perfect_jump', text: 'Perfect take-off!', when: 'You time the hop just right on a ramp (perfect jump boost)', tier: 2, cooldown: 8 },
  { key: 'firewall', text: 'Firewall up!', when: 'You use Firewall, Proxy or Pods', tier: 2, cooldown: 8 },
  { key: 'quip_class', text: 'Right, class, eyes on the road.', when: 'Random quip', tier: 2, cooldown: 60 },
  { key: 'class_select', text: 'Right, how fast are we going?', when: 'Race start: your speed class (Mbps) is announced', tier: 2, cooldown: 30 },
  // ---- tier 3: bonus flavour
  { key: 'trick_fail', text: 'Ah. Botched it.', when: 'A ramp trick goes wrong', tier: 3, cooldown: 10 },
  { key: 'spill', text: 'Coffee! Sacrilege!', when: 'You slip on a spill', tier: 3, cooldown: 8 },
  { key: 'zeroday', text: 'A zero-day! Of course!', when: 'You are caught by a Zero-Day mine', tier: 3, cooldown: 8 },
  { key: 'pigeon', text: 'Not the pigeon!', when: 'A pigeon splats you', tier: 3, cooldown: 8 },
  { key: 'jump_vehicle', text: 'Launched off a lorry. Normal Tuesday.', when: 'You jump off a moving vehicle', tier: 3, cooldown: 10 },
  { key: 'swap_item', text: 'Swapsies!', when: 'You swap your two held items round', tier: 3, cooldown: 8 },
  { key: 'double_item', text: 'Two for the price of one!', when: 'You grab a second item (double item)', tier: 3, cooldown: 10 },
  { key: 'quip_ping', text: 'Ping me when you\'re ready.', when: 'Random quip in the countdown', tier: 3, cooldown: 60 },

  // ---- optional EDGY recordings (six at most; only heard with the Settings toggle 'Rude banter' on). Every other rude line is spoken by the browser.
  { key: 'rude_hit', text: 'Oh, bollocks!', when: 'Rude banter only: you get spun out or hit', tier: 3, cooldown: 6, rude: true },
  { key: 'rude_overtake', text: 'Move your arse, I\'m coming through!', when: 'Rude banter only: you pass a rival', tier: 3, cooldown: 10, rude: true },
  { key: 'rude_fall', text: 'Well, that is absolute bollocks.', when: 'Rude banter only: you fall off the track', tier: 3, cooldown: 30, rude: true },
  { key: 'rude_win', text: 'Get in! Who is a genius? Me!', when: 'Rude banter only: you win the race', tier: 3, rude: true },
  { key: 'rude_lose', text: 'Well, that was absolute shite.', when: 'Rude banter only: you finish 4th or worse', tier: 3, rude: true },
  { key: 'rude_taunt', text: 'Is that your best, you muppet?', when: 'Rude banter only: random taunt when you are in front', tier: 3, cooldown: 40, rude: true },
];

/** Measured length (seconds) of every clip Marco has recorded (ffprobe of assets/user/voice_*.mp3; the catalogue test re-measures the MP3 frames). */
export const CLIP_SECONDS = Object.freeze({
  bad_start: 2.26, block: 4.70, boost: 2.88, bsod: 3.14, coconut: 3.26, comeback: 2.21, cuppa: 1.75, dodged: 1.78, drift_start: 3.38,
  fall: 11.38, fibre: 3.22, final_lap: 2.06, go: 2.62, hit: 2.47, item: 1.18, item_hit_rival: 4.37, jump: 1.73, kernel_panic: 1.63,
  lap2: 1.54, lose: 5.16, lose_lead: 1.75, max_charge: 1.54, menu_welcome: 4.27, mini_turbo: 2.57, miss: 1.73, near_miss: 1.54,
  offroad: 3.05, overtake: 1.63, overtaken: 1.13, photo_finish: 2.40, podium: 8.90, popups: 3.70, quip_cloud: 8.21, quip_dns: 1.94,
  quip_subnet: 5.21, ready: 1.82, respawn: 1.54, rocket_start: 1.66, select_me: 3.89, shortcut: 3.19, shrink: 1.51, speed: 4.58,
  sudo: 1.63, take_lead: 2.30, trick: 1.58, use_attack: 1.42, wall: 2.42, win: 4.10, wrong_way: 1.92,
});

export const clipSeconds = (key) => CLIP_SECONDS[key] ?? 2;
/**
 * Seconds a recording occupies the voice channel: its full length (nothing is cut short, so a caption or speech bubble stays up for
 * as long as the clip is playing and no other bark talks over it).
 */
export const clipPlaySeconds = (key) => clipSeconds(key);

export const VOICE_TIERS = { 0: 'Already recorded', 1: 'Record these first', 2: 'Next', 3: 'Bonus flavour' };
export const voiceLine = (key) => MARCO_VOICE.find((v) => v.key === key);

/** Which asset keys exist for a line: voice_<key>, voice_<key>_2, ... Assets is the registry from ./assets.js. */
export function voiceTakes(Assets, key) {
  const out = [];
  if (Assets.has(`voice_${key}`)) out.push(`voice_${key}`);
  for (let i = 2; i <= 9; i++) if (Assets.has(`voice_${key}_${i}`)) out.push(`voice_${key}_${i}`);
  return out;
}
