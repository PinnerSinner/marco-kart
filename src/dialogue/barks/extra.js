// Mild lines for the less common moments (roast, perfect take-off, vehicle jump, item swap, double item, speed-class announcement).
// They keep every category alive in the mild game ('Rude banter' off), in the same extreme persona as the rest of the character's bank; the edgy versions live in ./rude/*.js.
// Marco's first line in each is the recordable catalogue text (core/voicelines.js), so a recording of that key plays when it exists.
// Carlos speaks Brazilian Portuguese only, here as everywhere.
import { voiceLine } from '../../core/voicelines.js';

const V = (key, extra) => ({ t: voiceLine(key).text, key, ...extra });

export default {
  marco: {
    roast: ['Gently, {other}. The walls are not your enemy. I am.', 'Do mind the barrier, {other}. I have marked your licence.', 'A little less sideways, {other}, or I confiscate the wheel.', '{other}, steer with the wheel. The round thing. Do try.', 'Fail, {other}. Fail on all counts. Sign here.', '{other}, I have seen better driving from a shopping trolley.'],
    perfect_jump: [V('perfect_jump'), 'Stuck it. Gold star for me. Gold stars only for me.', 'Textbook take-off. I shall frame it and you.', 'Ramp, meet instructor. Ramp, kneel.', 'That was perfect. Do not clap. Applaud silently.', 'Flawless leap. I award myself full marks and a medal.'],
    jump_vehicle: [V('jump_vehicle'), 'Over a bus. Health and safety will weep.', 'That is going in the risk assessment. In capitals.', 'Hopped a lorry. Bit cheeky. I regret nothing.', 'The vehicle was in my lesson zone. It had it coming.', 'Cleared a lorry. Somebody tell the examiner. Me.'],
    swap_item: [V('swap_item'), 'Shuffle, shuffle, lovely. Fear the shuffle.', 'A quick rearrangement of the furniture. And the enemy.', 'Switching seats, class. Hands up if you are scared.', 'Swapsies. The instructor does as the instructor pleases.', 'Items reordered by decree.'],
    double_item: [V('double_item'), 'Two items. Somebody give me a clipboard and a bigger one.', 'Greedy, but legal. I wrote the law.', 'One for now, one for later. Both for you.', 'Two weapons. Do you feel lucky, class?', 'Armed twice. Educationally.'],
    class_select: [V('class_select'), '{class} Mbps. Sensible. Fasten your seatbelts or I fasten them.', '{class} Mbps. A fine, honest bandwidth. Mine, in fact.', 'Right, {class} Mbps. Nobody panic. Panic quietly.', '{class} Mbps. I have declared it the national speed.', 'Speed class {class} Mbps. Mirror, signal, tremble.'],
  },
  lambda: {
    roast: ['{other}, you are in the way! Join my cult or move!', 'Watch it, {other}! I am under a very strict budget!', 'Steer, {other}! Steer! The Function is watching!', '{other}, that was not graceful! Sacrifice your steering!', '{other}! Your driving is a cold start! Warm up!', 'Let go of the wall, {other}! The wall is a construct!'],
    perfect_jump: ['Perfect take-off! Billing that to the Function!', 'Smooth! I might be a prophet!', 'Nailed it! Do not check the invoice!', 'Ascension complete! Applaud or be billed!', 'Beautiful! I shall sacrifice a latte to it!'],
    jump_vehicle: ['Jumped a lorry! Spot price, baby!', 'Over the bus! Somebody log that sacrifice!', 'Lorry hop! Do not tell accounting!', 'I leapt a vehicle! The Function approves!', 'A bus! A sacrifice to the road gods!'],
    swap_item: ['Swapped! Scaling up and down and sideways!', 'Switch! Do not ask! The Function decides!', 'Swapsies! Quick, quick, offer something!', 'Shuffle! Reborn as a better item!', 'Item rotation! Enlightenment is a swap!'],
    double_item: ['Two items! Autoscaling works!', 'Double! I am rich! Briefly!', 'Two for one! I love a discount!', 'Two offerings! The cult doubles!', 'Double the sacrifice, double the glory!'],
    class_select: ['{class} Mbps! Spin it up!', '{class} Mbps! That is a lot of billing!', '{class} Mbps! Let me at it! Let me at ALL of it!', '{class} Mbps! The Function hums at that speed!', '{class} Mbps! Sacrifice your latency!'],
  },
  subnet: {
    roast: ['Fie, {other}! Thy steering is most unknightly.', 'Prithee, {other}, mind the road, or I mind thy moat.', 'Thou drivest like a jester, {other}! To the dungeon!', '{other}, a warlord would have turned. Thou hast not.', 'Thy chariot is a danger to the realm, {other}!', 'By my /24, {other}, thou art a menace to my siege!'],
    perfect_jump: ['A perfect leap! Huzzah! The moat is conquered!', 'By my /24, a flawless take-off!', 'The crowd would cheer, were there any. Cheer, ye wretches!', 'A flawless vault! Raise the standard!', 'Behold! I have crossed the chasm!'],
    jump_vehicle: ['I have leapt a chariot! Huzzah!', 'Over the wagon, like a true warlord!', 'Vaulted a lorry! Most gallant, most doomed.', 'The wagon was in my siege path. It is vanquished!', 'I have cleared a cart, and a cart is a castle!'],
    swap_item: ['A swap! Most cunning.', 'Thus I rearrange my arsenal.', 'Switcheroo, good racers! Mine is the better weapon!', 'The quartermaster rearranges the stores!', 'Swapped! The beans are in the other crate.'],
    double_item: ['Two tokens! The kingdom provides!', 'A double boon! Huzzah!', 'Twice the ammunition, twice the doom.', 'Two weapons! Fear the siege!', 'My bunker holds two! I am prepared!'],
    class_select: ['{class} Mbps! A noble bandwidth.', 'By my /24, {class} Mbps! Splendid.', '{class} Mbps. The realm is well connected, and well armed.', '{class} Mbps! I shall rule it with an iron fist!', 'The speed of the realm: {class} Mbps. Hoard it!'],
  },
  packet: {
    roast: ['{other}, you are all over the place! Like my parcels!', 'Mind the road, {other}! Fragile load! Fragile mind!', '{other}, you dropped something. Your steering.', 'Oi, {other}, that was not first class.', '{other}! Is your driving a distraction? Drone!', 'Do you work for the cones, {other}?!'],
    perfect_jump: ['Perfect delivery! Landed on the doormat!', 'Nailed the take-off! Sign here! No, do not!', 'Zero loss on that one! Suspicious!', 'That was too perfect. Who is watching?', 'Perfect! The cones are stunned!'],
    jump_vehicle: ['Jumped a lorry! Another courier, hello!', 'Over the van! I hope it was not mine.', 'Lorry hop! Handle with care! Do not film!', 'I jumped a bus! Was that a drone?!', 'Over a lorry! They did not see me coming!'],
    swap_item: ['Swapped! Out of order, in style.', 'Switch! Re-sequencing! Evade!', 'Swapsies! Somebody sign for it, but not you.', 'I rerouted the parcel! In secret!', 'Shuffled! The cones are baffled!'],
    double_item: ['Two parcels! Lovely! Suspicious!', 'Double delivery! Nice. Is it bugged?', 'Two items! Somebody has to carry them.', 'Two! They gave me two! Why?', 'Double! They want me to use it! No!'],
    class_select: ['{class} Mbps! Plenty of room for parcels.', '{class} Mbps! Next-day delivery, please. Secretly.', '{class} Mbps! Fragments, fasten up!', '{class} Mbps! Is that a trap?', '{class} Mbps! I want to know who chose that.'],
  },
  carlos: {
    roast: ['Calma, {other}, calma! A parede não vai sair do lugar!', '{other}, meu amigo, vire o volante, tá ligado?', 'Ai, {other}! Olha pra frente, pelo amor do coco!', '{other}, isso não foi bonito! Vou te cobrar pedágio!', '{other}, aprende a dirigir ou sai da minha praia!', 'Que feio, {other}! Até o isopor desviaria!'],
    perfect_jump: ['Perfeito! Salto lindo, tá ligado?', 'Gol! O pulo foi perfeito!', 'Lindo! Igual passo de samba!', 'Decolagem de campeão! Meu império voa!', 'Que pulo! Cobrei pedágio da gravidade!'],
    jump_vehicle: ['Pulei o caminhão! Tranquilo!', 'Passei por cima do ônibus, meu amigo! Uau!', 'Salto de caminhão! Beleza!', 'Pulei o veículo! Pedágio cobrado no ar!', 'Voei por cima do ônibus! A praia é minha!'],
    swap_item: ['Troca! Uma troca de mestre!', 'Troquei, troquei! Tranquilo!', 'Um aqui, outro ali. Beleza!', 'Embaralhei o isopor! Vai que cola!', 'Troca feita! Pedágio de troca é cinco reais!'],
    double_item: ['Dois itens! Que sorte!', 'Dois! Muito bom! A praia ficou rica!', 'Dobrou! Caipirinha pra mim!', 'Dois itens! Dois pedágios!', 'Dois presentes! Vou cobrar em dobro!'],
    class_select: ['{class} Mbps? Tranquilo. Devagar e rápido.', '{class} Mbps! Calma, calma, que a praia é grande.', '{class} Mbps. Muito bom, tá ligado?', '{class} Mbps! Vou cobrar pedágio por cada Mbps!', '{class} Mbps! Meu império tem banda larga!'],
  },
  tilly: {
    roast: ['Do mind the wall, {other}, dear. It has a long memory.', '{other}, darling, steer with intent. I am watching.', 'Oh, {other}. That was not the way. I shall note it.', '{other}, really. A little more grace. Or I shall help.', '{other}, darling, such a waste of a lovely kart.', 'Oh, {other}. You drive like a man being chased. I wonder by whom.'],
    perfect_jump: ['Perfect, darlings! What a leap! What a landing!', 'A perfect take-off! Lovely. I shall remember it.', 'Oh, that was rather good. Rather deadly, too.', 'Marvellous! Do applaud. Quietly.', 'Spiffing! I shall bake a cake for it.'],
    jump_vehicle: ['I jumped a lorry! How splendid! How rude of the lorry.', 'Over a bus, darlings! How thrilling!', 'A lorry! In my day it was a horse. And a hedge.', 'Over a van! I do hope the driver is all right. Is he?', 'A bus! How terribly fun! I did not see anyone.'],
    swap_item: ['A little swap, darling. Keep up.', 'Switched! How terribly clever of me.', 'Swapsies, dears! The good one for me.', 'Rearranged the tea tray. And the weapons.', 'A sweet little switch. Do mind it.'],
    double_item: ['Two items! Spoilt, I am. And so are you. Nearly.', 'Double trouble, darlings!', 'Two! How terribly generous of the universe.', 'Two little gifts for two little victims.', 'A pair! How terribly sweet. How terribly sharp.'],
    class_select: ['{class} Mbps, darlings? Marvellous.', '{class} Mbps! Hold my hat. And my tea.', '{class} Mbps. Quite brisk, I must say.', '{class} Mbps! I shall be in the lead. And the garden.', '{class} Mbps, how delightfully quick. Mind the corners.'],
  },
  rex: {
    roast: ['{other}: steering error. A strongly worded letter follows.', 'Warning: {other} is driving badly. Penalty: all of it.', '{other}, permission to turn. Denied. Appeal: denied.', '{other}: input invalid. Try again. Or be sued.', '{other}: your steering is in breach of contract.', 'Notice to {other}: please vacate the road. Per Rex.'],
    perfect_jump: ['Take-off: perfect. Logged. Notarised.', 'Jump validated. Zero errors. Zero appeals.', 'Flight path optimal. Aviation law: bent.', 'Perfect leap. Lawyers will be thrilled.', 'Ascent flawless. All claims dismissed.'],
    jump_vehicle: ['Vehicle jumped. Status: fine. Lawsuit: none.', 'Lorry cleared. No permissions required.', 'Bus: overridden. Authority: Rex.', 'Obstacle vaulted. Obstacle will be sued.', 'Vehicle bypassed. Please file complaint with the vehicle.'],
    swap_item: ['swap --items. Done. Legally.', 'Items reordered. No errors. No appeals.', 'mv slot1 slot2. Executed. Court order attached.', 'Inventory shuffled. By decree.', 'Swap complete. Terms and conditions apply.'],
    double_item: ['Second item: acquired. Seized.', 'Inventory: two. Status: armed. Status: dangerous.', 'Items: 2. Risk: elevated. Lawsuits: pending.', 'Two items. The planet is now two steps closer.', 'Double acquisition. Counsel is delighted.'],
    class_select: ['{class} Mbps. Noted. Approved. Seized.', 'Bandwidth set: {class} Mbps. By me.', 'Speed class {class}: acknowledged. And claimed.', '{class} Mbps. Terms apply to all users. All.', 'Network: {class} Mbps. It is mine.'],
  },
  biscuit: {
    roast: ['{other}! Wall! Woof! Bad wall! Bad {other}!', '{other}, you are going the wrong way! Squirrel!', 'Bad driving, {other}! Woof! I will bite you!', '{other}, that was a silly one! I peed a bit!', '{other}! I will wee on your tyres! Gently!', 'Woof! {other}! You drive like a cat!'],
    perfect_jump: ['Perfect jump! Good boy! Treat!', 'Woof! Flying! I am a bird dog!', 'I jumped! Best jump! Treats now!', 'Boing! I am a spring!', 'Wheee! Squirrel altitude!'],
    jump_vehicle: ['I jumped a lorry! Woof!', 'Over the bus! Wheee! Over the bus!', 'Lorry hop! Again! Again!', 'I jumped a van! It smelled of sausages!', 'Woof! Bus! I flew over a bus!'],
    swap_item: ['Swapped! Wheee!', 'Switch! Switch! Woof!', 'Swappy swap! Sniff sniff!', 'Mixed them up! Like a stew!', 'I swapped! Treat for me!'],
    double_item: ['Two items! Two! Woof!', 'Double treats! Woof!', 'Two! I got two! Two!', 'Two toys! Two toys! Two!', 'Woof! Doubly good boy!'],
    class_select: ['{class} Mbps! Fast fast fast!', '{class} Mbps! Is that walkies speed?', 'Woof! {class} Mbps!', '{class} Mbps! Zoomies at that speed!', '{class} Mbps! I licked a number!'],
  },
};
