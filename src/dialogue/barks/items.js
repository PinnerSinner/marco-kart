// Biscuit's own items: poo (a dropped trap), woof (a bark shockwave), zoomies (a manic speed burst), fetch (a thrown stick that comes back).
// Item-specific lines (`items: [...]`) in the existing item pools: Biscuit using them (item_use_attack / item_use_defence), Biscuit landing one
// (item_hit_rival), and everybody else reacting to being hit (hit_by_item) in their own persona. MILD is clean; RUDE is tagged by the index and swears.
// Carlos stays Portuguese-only.
const I = (items, ...lines) => lines.map((t) => ({ t, items }));
const POO = ['poo'], WOOF = ['woof'], ZOOMIES = ['zoomies'], FETCH = ['fetch'];

export const MILD = {
  biscuit: {
    item_use_attack: [...I(POO, 'Poo! A present! Do not step in it!', 'Woof! I did a poo! Look at it!', 'Sniff sniff... done! Poo for you!'), ...I(WOOF, 'WOOF WOOF WOOF!', 'BORK! BORK! BORK! Loud boy!', 'I barked so hard my ears fell off!'), ...I(FETCH, 'Fetch, {other}! FETCH!', 'Stick! Stick! Go get the stick!', 'I threw it! Bring it back! Bring it BACK!')],
    item_use_defence: [...I(ZOOMIES, 'ZOOMIES! WOOF! ZOOMIES!', 'Round and round and round! Zoom!', 'My legs have left! Woof!'), ...I(POO, 'Poo defence! Nobody follows a poo!'), ...I(WOOF, 'Woof! Back off! Big bark!'), ...I(FETCH, 'Fetch! Come back, stick! Come back!')],
    item_hit_rival: [...I(POO, '{other} stepped in it! Woof!', 'Sniff sniff... {other}, it is poo! Hee!'), ...I(WOOF, '{other}! Did you hear me?! WOOF!'), ...I(FETCH, '{other}! Fetch it! You got fetched!'), ...I(ZOOMIES, '{other}! Zoomies! Bonk! Sorry!')],
  },
  marco: {
    hit_by_item: [...I(POO, 'Is that... is that a... Biscuit! DETENTION!', 'A dog has left a gift in my lesson zone.'), ...I(WOOF, 'Biscuit! Indoor voice! INDOOR VOICE!', 'My ears! The instructor requires silence!'), ...I(ZOOMIES, 'Biscuit! Sit! SIT! Walk, do not zoom!'), ...I(FETCH, 'A stick! Who throws a stick at an examiner?!')],
  },
  subnet: {
    hit_by_item: [...I(POO, 'A foul offering upon my greaves! The hound!', 'Dung upon the warlord! To the moat!'), ...I(WOOF, 'The hound\'s roar shakes my bunker!', 'A bark most terrible! The walls tremble!'), ...I(ZOOMIES, 'The beast charges! Raise the drawbridge!'), ...I(FETCH, 'A flung stick! Dishonourable! Fetch it thyself!')],
  },
  lambda: {
    hit_by_item: [...I(POO, 'A sacrifice! A smelly sacrifice!', 'The dog left an offering! I accept! Ew!'), ...I(WOOF, 'The sacred bark! I am enlightened! And deaf!'), ...I(ZOOMIES, 'The zoomies! A blessing! A blur!'), ...I(FETCH, 'A stick! A sacred stick! Bill the dog!')],
  },
  packet: {
    hit_by_item: [...I(POO, 'That is not poo! That is a tracking device!', 'It is a bug! A literal bug! In poo form!'), ...I(WOOF, 'That bark is a signal! Who is it for?!'), ...I(ZOOMIES, 'The dog is a drone! I knew it!'), ...I(FETCH, 'A stick! With a camera! I SAW IT!')],
  },
  tilly: {
    hit_by_item: [...I(POO, 'Oh, how terribly common. My shoes, darling!', 'The dog has been naughty. The dog shall be sorry.'), ...I(WOOF, 'Such a vulgar noise, darling. I shall remember it.'), ...I(ZOOMIES, 'Biscuit, dear, I do hope you enjoy the shrubbery.'), ...I(FETCH, 'A stick? How rustic. I shall return it. Sharply.')],
  },
  rex: {
    hit_by_item: [...I(POO, 'Biological waste detected. Dog charged with littering.', 'Excrement on chassis. Lawsuit filed against dog.'), ...I(WOOF, 'Acoustic assault by dog. Summons issued.'), ...I(ZOOMIES, 'Unauthorised dog acceleration. Writ filed.'), ...I(FETCH, 'Projectile stick. Dog will be sued in a stick court.')],
  },
  carlos: {
    hit_by_item: [...I(POO, 'Cocô de cachorro na minha praia! Que desrespeito!', 'Quem deixou presente de cachorro? Pedágio em dobro!'), ...I(WOOF, 'Que latido! Meus ouvidos viraram farofa!'), ...I(ZOOMIES, 'O cachorro está solto! Alguém segura o Biscuit!'), ...I(FETCH, 'Um graveto na minha cara! Isso é invasão de praia!')],
  },
};

export const RUDE = {
  biscuit: {
    item_use_attack: [...I(POO, 'POO! Step in it, {other}, you tit!', 'I did a big poo and it is for YOU, {other}!'), ...I(WOOF, 'WOOF, YOU BASTARDS! I AM LOUD!'), ...I(FETCH, 'Fetch it, {other}, you knob! FETCH!')],
    item_use_defence: [...I(ZOOMIES, 'ZOOMIES, YOU BASTARDS! I AM A BLUR WITH A BUM!')],
    item_hit_rival: [...I(POO, '{other}! You stepped in my poo! Haha, git!'), ...I(WOOF, '{other}, did that make you piss yourself? Woof!')],
  },
  marco: { hit_by_item: [...I(POO, 'A dog has shat on my lesson, you furry bastard!'), ...I(WOOF, 'Biscuit! Shut your bloody barking hole!')] },
  subnet: { hit_by_item: [...I(POO, 'Hound! Thou hast shat upon a warlord! To the moat!'), ...I(WOOF, 'Thy bark is bollocks, thou mutt!')] },
  lambda: { hit_by_item: [...I(POO, 'A SACRIFICE OF SHIT! I DID NOT ORDER THAT!'), ...I(WOOF, 'WOOF? WOOF?! I WILL BILL YOUR BARK, YOU MUTT!')] },
  packet: { hit_by_item: [...I(POO, 'That is... that is poo! Or a bug! Fuck!'), ...I(WOOF, 'That bark is... a signal, you git!')] },
  tilly: { hit_by_item: [...I(POO, 'Oh, you filthy little sod. That is going in the garden. With you.'), ...I(WOOF, 'Do stop yapping, darling, or I shall feed you to the shrubbery.')] },
  rex: { hit_by_item: [...I(POO, 'Dog excrement on my chassis. A lawsuit for your arse, mutt.'), ...I(WOOF, 'Barking violation. Sod off, dog.')] },
  carlos: { hit_by_item: [...I(POO, 'Porra, cocô de cachorro! Esse bicho é um babaca!'), ...I(WOOF, 'Cala a boca, cachorro do caralho!')] },
};
