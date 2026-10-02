// All user-facing copy that is not tied to one screen: loading tips, difficulty blurbs, the About Marco card.
// British English throughout. Edit here to change the wording.
import { makeRng } from '../core/util.js';

export const TIPS = [
  'A /24 has 254 usable hosts, just like this track has 254 ways to crash.',
  'Hold the drift button through a corner to build a mini-turbo, then let go for a burst of speed.',
  'Drift boosts come in three colours: cyan, amber and magenta. The longer you hold on, the bigger the kick.',
  'Tap accelerate just before GO for a rocket start.',
  'There are only 10 types of racer: those who understand binary and those who do not.',
  'Grass and sand will slow you right down. The road is faster, however tempting the shortcut looks.',
  'It is always DNS. Except when it is the wall.',
  'Coming last has its perks: the item boxes are much kinder to the back of the pack.',
  'Cloud is just somebody else\'s computer. This kart is somebody else\'s problem.',
  'A Firewall soaks up one hit. Hold on to it until you hear something coming.',
  'Have you tried turning it off and on again? Restart lives in the pause menu.',
  'Kerbs are your friend. The sea is not.',
  'Latency is what happens when the network takes a moment to think. Rather like a Brit deciding whether to queue.',
  'Look behind you before dropping a Tangled Cable. Someone will be there.',
  'Item boxes come in rows of three, so you can always pick a lane.',
  'Subnetting is easy. Halve everything, then argue about the broadcast address.',
  'A Traceroute will find whoever is in front of you, eventually. So will you.',
  'TTL expired: that is what happens to your lead when you stop drifting.',
  'Tea first, racing second, post-race analysis third and with more tea.',
  'Always check the cable is plugged in at both ends. Then check the kart.',
  'Fibre Link drives itself for a few glorious seconds. Enjoy the view.',
  'Mind the gap, and preferably the double-decker as well.',
  'Every good route table has a default route. Every good racer has a default excuse.',
  'A little packet loss builds character. A large wall builds a bigger one.',
  'The OSI model has seven layers, and you have crashed on every one of them.',
  'Never blame the Wi-Fi for a missed corner. The corner was there the whole time.',
];

/**
 * Deterministic-but-shuffled tip order so the loading screen does not repeat itself.
 * @param {number} [seed]
 * @returns {string[]}
 */
export function shuffledTips(seed = Date.now() % 100000) {
  const rng = makeRng(seed);
  const a = TIPS.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const DIFFICULTY_COPY = {
  associate: {
    tagline: 'Entry level', blurb: 'Relaxed rivals and a forgiving pace. A lovely way to learn the circuits without anyone getting personal about it.',
    skill: 1, tag: 'GOOD FOR A FIRST LAP',
  },
  professional: {
    tagline: 'The proper job', blurb: 'Rivals race properly, use their items sensibly and will make you work for every place. The standard experience.',
    skill: 2, tag: 'RECOMMENDED',
  },
  specialty: {
    tagline: 'For the very confident', blurb: 'Sharp, fast and slightly smug rivals. They take the racing line, the item boxes and, given half a chance, your dignity.',
    skill: 3, tag: 'BRING TEA',
  },
};

export const MENU_COPY = {
  gp: { title: 'Grand Prix', text: 'Race the whole Marcoverse Cup: four tracks, points for every finish and a trophy at the end.' },
  single: { title: 'Single Race', text: 'One track of your choosing, any difficulty, no strings attached.' },
  time: { title: 'Time Trial', text: 'Just you and the clock. No rivals, no items, and no excuses. Chase your best lap.' },
  controls: { title: 'Controls', text: 'Keyboard, gamepad and touch. Everything you need to know, minus the manual.' },
  items: { title: 'Item Guide', text: 'All 24 items in plain English: what each one does, what it is good against, and which ones take real skill.' },
  settings: { title: 'Settings', text: 'Volumes, graphics quality, camera shake, touch controls and units.' },
  about: { title: 'About Marco', text: 'Meet the instructor behind the wheel and the brand behind the Marcoverse.' },
};

export const ABOUT = {
  name: 'Marco',
  role: 'Cloud and networking instructor',
  paragraphs: [
    'Marco teaches cloud and networking for a living, and he does it with rather more enthusiasm than the subject strictly requires. Ask him about subnetting and you will get a whiteboard, three colours of pen and a story about a router in Slough.',
    'He is an AWS Authorised Instructor with a shelf of certifications, and he runs the Marcoverse brand from his flat in Copacabana, Rio de Janeiro. The beach is lovely, the caipirinhas are dangerous and the Wi-Fi is usually adequate.',
    'Marco Kart is what happens when a British sense of humour, a lot of tea and a weakness for arcade racers all end up in the same browser tab.',
  ],
  facts: [
    ['Job', 'Cloud and networking instructor'],
    ['Certified', 'AWS Authorised Instructor'],
    ['Teaches', 'AWS, CompTIA and CCNA'],
    ['Brand', 'Marcoverse'],
    ['Home', 'Copacabana, Rio de Janeiro'],
    ['Fuel', 'Tea, obviously'],
  ],
  quirks: [
    'Special move: explaining subnetting at 200 km/h.',
    'Favourite port: 443. Least favourite: any port with a queue.',
    'Believes every problem is DNS until proven otherwise.',
  ],
  url: 'marcoverse.co.uk',
};

/** Menu greeting lines shown in the speech bubble on the title hero. */
export const HERO_LINES = [
  'Right then, shall we begin?',
  'Mind the roundabouts.',
  'Kettle is on. Race first.',
  'Have you tried a different route?',
];
