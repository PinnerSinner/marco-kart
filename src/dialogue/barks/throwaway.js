// Throwaway interjections: the very short noises racers make for no reason at all (1 to 4 words): "Weeeee!" off a jump, "Here we go!" when the lights
// go green, "Ooh, shiny!" at an item box. They are the ambient chatter of the whole field, said by OTHER characters as much as by the player's own.
// A line is a plain string (can be said any time) or { t, on: [context] } (only when that moment happens; see TWOTA_CONTEXTS in ../director.js):
//   jump  going off a ramp or a jump       go     the lights turn green            boost  a boost starts               drift  a drift starts
//   near  a near miss or a dodged item     pass   they have just passed someone    passed they have just been passed  trick  a trick lands
//   item  an item box is picked up         bump   a wall scrape or a little bump
// MILD is the clean game; RUDE is tagged `rude: true` by ./index.js and only heard with Settings 'Rude banter' on. Same personalities as the main
// banks, in miniature (Carlos only ever speaks Brazilian Portuguese, Biscuit mostly pants and barks).

/** Lines for one or more moments. */
const on = (ctx, ...ts) => ts.map((t) => ({ t, on: Array.isArray(ctx) ? ctx : [ctx] }));

export const CONTEXTS = ['jump', 'go', 'boost', 'drift', 'near', 'pass', 'passed', 'trick', 'item', 'bump'];

export const MILD = {
  marco: {
    throwaway: [
      ...on('jump', 'Weeeee!', 'Wheee! Lovely!', 'Airborne! Legally!'),
      ...on('go', 'Here we go!', 'Handbrake off!', 'Right then, off!'),
      ...on('boost', 'Whoosh! Lovely!', 'Zoom zoom!'),
      ...on('drift', 'Sideways! Lovely!', 'Yeehaw!'),
      ...on('near', 'Whoa, steady!', 'Mirror, signal, gulp!'),
      ...on('pass', 'Bye bye now!', 'Cheerio!', 'Coming through!'),
      ...on('passed', 'Oi, cheeky!', 'Do signal, please!'),
      ...on('trick', 'Ta-daa!', 'Top marks!'),
      ...on('item', 'Ooh, shiny!', 'Lovely, ta!'),
      ...on('bump', 'Ooft!', 'Easy, easy!', 'Pardon me!'),
      'Mwahaha!', 'Hoo hoo!', 'Whoopsie!', 'Nope nope nope!', 'Yippee!', 'Crikey!',
    ],
  },
  subnet: {
    throwaway: [
      ...on('jump', 'Huzzah!', 'Over the moat!', 'Leap, noble steed!'),
      ...on('go', 'Charge!', 'To arms!', 'Onward, huzzah!'),
      ...on('boost', 'Forward, ho!', 'By my plume!'),
      ...on('drift', 'Hard to port!', 'Tack and veer!'),
      ...on('near', 'Gadzooks!', 'Zounds, close!'),
      ...on('pass', 'Fare thee well!', 'Make way!'),
      ...on('passed', 'Treachery!', 'Fie upon thee!'),
      ...on('trick', 'Behold!', 'A feat of arms!'),
      ...on('item', 'A tin!', 'Rations!', 'Spoils!'),
      ...on('bump', 'Oof, my armour!', 'Mind my plume!'),
      'Hear ye!', 'Ha ha ha!', 'Mwahaha!', 'By my beans!', 'Forsooth!', 'Hark!',
    ],
  },
  lambda: {
    throwaway: [
      ...on('jump', 'Scale up, WEEE!', 'Ascend!', 'Wheee, no servers!'),
      ...on('go', 'INVOKE!', 'Cold start!', 'Here we GO!'),
      ...on('boost', 'Burst scaling!', 'Zoom zoom!'),
      ...on('drift', 'Elastic!', 'Sideways scaling!'),
      ...on('near', 'Nearly billed!', 'Throttled! Phew!'),
      ...on('pass', 'Scale past!', 'Bye, servers!'),
      ...on('passed', 'Latency!', 'Timeout!'),
      ...on('trick', 'Ta-da, cult!', 'Enlightened!'),
      ...on('item', 'An offering!', 'Tithe accepted!'),
      ...on('bump', 'Retry! Retry!', 'Four-two-nine! Eek!'),
      'Yippee!', 'Eeeee!', 'Praise be!', 'Espresso!', 'Hallelujah!', 'Whoopsie!',
    ],
  },
  packet: {
    throwaway: [
      ...on('jump', 'Weeeee! Drop zone!', 'Airborne! Hide!', 'Parcel away!'),
      ...on('go', 'Go go go!', 'Delivering!', 'Here we go... maybe!'),
      ...on('boost', 'Too fast to track!', 'Zoom zoom!'),
      ...on('drift', 'Evasive!', 'Shake the tail!'),
      ...on('near', 'They missed!', 'Drone! Drone!', 'That was close!'),
      ...on('pass', 'Cannot catch me!', 'Lose the tail!'),
      ...on('passed', 'Spy!', 'Who sent you?'),
      ...on('trick', 'Classified!', 'Ta-da! Unseen!'),
      ...on('item', 'Package!', 'Bugged? Yes.'),
      ...on('bump', 'They know!', 'Ow, ambush!'),
      'Shh!', 'Nope nope nope!', 'Hm hm hm!', 'Whoa whoa!', 'Eek!', 'Ha! Gotcha!',
    ],
  },
  carlos: {
    throwaway: [
      ...on('jump', 'Uhuuul!', 'Voando, freguês!', 'Iupiii!'),
      ...on('go', 'Bora!', 'Partiu!', 'Largou!'),
      ...on('boost', 'Vruuum!', 'Foguete!'),
      ...on('drift', 'Derrapou!', 'Olha a curva!'),
      ...on('near', 'Eita!', 'Ufa, passou!', 'Quase, hein!'),
      ...on('pass', 'Tchau, freguês!', 'Passei!', 'Com licença!'),
      ...on('passed', 'Ei, calma!', 'Respeita!'),
      ...on('trick', 'Olé!', 'Gol de placa!'),
      ...on('item', 'Presente!', 'Opa, brinde!'),
      ...on('bump', 'Ai, ai!', 'Ih, bateu!'),
      'Aêêê!', 'Nossa!', 'Oba!', 'Xi, errei!', 'Vish!', 'Uhuuul, praia!',
    ],
  },
  tilly: {
    throwaway: [
      ...on('jump', 'Wheee, darling!', 'Up we pop!', 'Weeeee! Pearls!'),
      ...on('go', 'Tally-ho!', 'Off we pop!', 'Chocks away!'),
      ...on('boost', 'Whoosh, darling!', 'How brisk!'),
      ...on('drift', 'Sideways! Naughty!', 'Wheeeel!'),
      ...on('near', 'Oh, my pearls!', 'Goodness me!'),
      ...on('pass', 'Toodle-oo!', 'Ta-ta, dear!'),
      ...on('passed', 'How rude!', 'I never!'),
      ...on('trick', 'Marvellous!', 'Bravo, me!'),
      ...on('item', 'Oh, a present!', 'Ooh, shiny!'),
      ...on('bump', 'Oh, my hat!', 'Mind the lace!'),
      'Mwahaha, darlings!', 'Tee-hee!', 'Oopsie!', 'Heavens!', 'Delightful!', 'Splendid!',
    ],
  },
  rex: {
    throwaway: [
      ...on('jump', 'Altitude acquired.', 'Wheee. Simulated.', 'Airborne. Logged.'),
      ...on('go', 'Executing.', 'Here we go. Probably.', 'Sequence: begun.'),
      ...on('boost', 'Thrust optimal.', 'Zoom. Zoom. Logged.'),
      ...on('drift', 'Lateral motion.', 'Skid authorised.'),
      ...on('near', 'Collision: avoided.', 'Close. Noted.'),
      ...on('pass', 'Overtake: filed.', 'Goodbye, subject.'),
      ...on('passed', 'Objection!', 'Cease. Desist.'),
      ...on('trick', 'Style: logged.', 'Ta-da. Notarised.'),
      ...on('item', 'Asset acquired.', 'Mine now.', 'Seized.'),
      ...on('bump', 'Impact: noted.', 'Minor damage.'),
      'Beep boop.', 'Bzzzt.', 'Whirr.', 'Affirmative.', 'Hnnnng. Processing.', 'Error. Ignored.',
    ],
  },
  biscuit: {
    throwaway: [
      ...on('jump', 'Weeeee!', 'Wheee! Woof!', 'Boing boing!', 'Awoooo!'),
      ...on('go', 'Walkies!', 'Here we go!', 'Woof! GO!'),
      ...on('boost', 'Zoomies!', 'Zoom zoom!', 'Whoosh! Woof!'),
      ...on('drift', 'Wheee! Sliiide!', 'Yip yip!'),
      ...on('near', 'Yikes! Woof!', 'Eep! Squirrel!', 'Phew! Pant!'),
      ...on('pass', 'Bye bye! Woof!', 'Sniff ya later!'),
      ...on('passed', 'Hey! Grrr!', 'No fair! Woof!'),
      ...on('trick', 'Ta-da! Bork!', 'Good dog!'),
      ...on('item', 'Snack!', 'Ooh, treat!', 'Present! Woof!'),
      ...on('bump', 'Yelp!', 'Ow! Whine!', 'Boop!'),
      'Woof woof!', 'Pant pant pant!', 'Arf arf!', 'Sniff sniff!', 'Squirrel!', 'Rrruff!', 'Bork!', 'Aroooo!',
    ],
  },
};

/** The edgy variants (mild swearing, insults), tagged `rude: true` by ./index.js. */
export const RUDE = {
  marco: {
    throwaway: [
      ...on('go', 'Floor it, you wallies!', 'Bollocks to the lights!'),
      ...on('pass', 'Eat my dust, muppet!', 'Hah! Loser!'),
      ...on('passed', 'Oi! Wanker!', 'Bloody cheek!'),
      ...on('bump', 'Watch it, pillock!', 'Bugger!'),
      'Bloody hell!', 'Get stuffed!', 'Oi, muppet!', 'Budge up, melon!', 'Sod that!', 'Move, you plum!',
    ],
  },
  subnet: {
    throwaway: [
      ...on('pass', 'Out of my way, knave!', 'Begone, peasant!'),
      ...on('passed', 'Thou pillock!', 'Fie, thou cur!'),
      ...on('bump', 'Bollocks and beans!', 'Scurvy dog!'),
      'Move, thou lout!', 'Base varlet!', 'Sod off, peasant!', 'Daft knave!', 'Thy mother!', 'Out, wretch!',
    ],
  },
  lambda: {
    throwaway: [
      ...on('pass', 'Heretic!', 'Out, unbeliever!'),
      ...on('passed', 'Idiot disciple!', 'Bugger, a rival!'),
      ...on('bump', 'Bollocks! Retry!', 'You utter melon!'),
      'Billable, loser!', 'Pay up!', 'Deploy THIS!', 'Move, server-lover!', 'Pillock!', 'Sod the cloud!',
    ],
  },
  packet: {
    throwaway: [
      ...on('pass', 'Move, drone!', 'Back off, spy!'),
      ...on('passed', 'Stop tailing me!', 'Get lost, narc!'),
      ...on('bump', 'Bollocks, they know!', 'Bugger! Ambush!'),
      'Oi! Cone-lover!', 'Shut it, cones!', 'Naff off, drone!', 'Sod the system!', 'You melon!', 'Daft drone!',
    ],
  },
  carlos: {
    throwaway: [
      ...on('pass', 'Sai da frente!', 'Anda, lerdo!'),
      ...on('passed', 'Porra, cara!', 'Babaca!'),
      ...on('bump', 'Merda!', 'Cacete!'),
      'Vai, lesma!', 'Sai fora, otário!', 'Trouxa!', 'Caraca, mano!', 'Chega pra lá!', 'Sai da minha praia!',
    ],
  },
  tilly: {
    throwaway: [
      ...on('pass', 'Shift, you ruffian!', 'Do shove off!'),
      ...on('passed', 'Absolute twit!', 'Bugger off, darling!'),
      ...on('bump', 'Bollocks, how vulgar!', 'Sod it, darling!'),
      'Move, you dreadful oik!', 'Get stuffed, dear!', 'Budge, you pleb!', 'Knickers!', 'Kindly vanish!', 'Oh, bollocks.',
    ],
  },
  rex: {
    throwaway: [
      ...on('pass', 'Move, organic.', 'Out, meatbag.'),
      ...on('passed', 'Idiot detected.', 'Fool. Filed.'),
      ...on('bump', 'Bollocks. Logged.', 'Bugger. Error.'),
      'Delete yourself.', 'Sod off. Formally.', 'Obstruction: crushed.', 'Piss off. Politely.', 'Daft human.', 'Move, flesh-pile.',
    ],
  },
  biscuit: {
    throwaway: [
      ...on('pass', 'Grrr! Move!', 'Woof off!'),
      ...on('passed', 'Grrr, bad kart!', 'Bork, you plonker!'),
      ...on('bump', 'Grrrr bollocks!', 'Snap! Snap!'),
      'Bite! Bite!', 'Wee on you!', 'Out, cat!', 'Oi! Bum-sniffer!', 'Growl, you melon!', 'Pee on that!',
    ],
  },
};
