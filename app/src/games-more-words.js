// 🧩 Games, the second shelf of words (items 125 to 130): three-letter words for the Letter grid, the grid's sixteen
// letter dice, the riddles and their answers, and the easier words Kid mode plays with. Plain, everyday English;
// nothing a child shouldn't see. The riddles are old folk riddles, retold in our own words.

// Three-letter words. With the four- and five-letter lists (games-words.js) and the Hangman shelves they make the
// Letter grid's dictionary, so a word only counts when it's here.
export const THREE = `ace act add ado age ago aid aim air ale all and ant any ape apt arc are ark arm art ash ask ate awe axe bad bag ban bar bat bay bed bee beg bet bib bid big bin bit boa bob bog boo bow box boy bud bug bun bus but buy bye cab can cap car cat cod cog cot cow coy cry cub cue cup cut dab dad dam day den dew did die dig dim din dip doe dog don dot dry dub due dug dye ear eat ebb eel egg ego elf elk elm emu end era eve ewe eye fad fan far fat fax fed fee few fig fin fir fit fix flu fly foe fog fox fry fun fur gag gap gas gel gem get gig gin gnu goo got gum gun gut guy gym had ham has hat hay hen her hew hid him hip his hit hob hog hop hot how hub hue hug hum hut ice icy ill imp ink inn ion ire irk ivy jab jam jar jaw jay jet jig job jog jot joy jug keg ken key kid kin kit lab lad lag lap law lay led leg let lid lie lip lit log lot low lug mad man map mat maw may men met mid mix mob mop mow mud mug mum nab nag nap net new nib nil nip nit nod nor not now nun nut oak oar oat odd ode off oft oil old one opt orb ore our out owe owl own pad pal pan pat paw pay pea peg pen pet pew pie pig pin pit ply pod pop pot pro pry pub pug pun pup put rag ram ran rap rat raw ray red rib rid rig rim rip rob rod roe rot row rub rug rum run rut rye sad sag sap sat saw say sea see set sew shy sin sip sir sit six ski sky sly sob sod son sow soy spa spy sty sub sum sun tab tag tan tap tar tea ten the tie tin tip toe ton too top tot tow toy try tub tug two urn use van vat vet vow wag war was wax way web wed wet who why wig win wit woe wok won woo wow yak yam yap yaw yes yet yew you zap zen zip zoo`.split(' ');

// The Letter grid's dice: sixteen of them, six faces each, weighted like English so most grids hold plenty of words.
// Q comes as "Qu", counted as two letters. Our own set.
export const GRID_DICE = ['AEIOUA', 'EEIOAU', 'AEEINS', 'RSTLNE', 'TTRHLN', 'SSNRTD', 'AEIMOU', 'CDLMPR', 'BCFGHM', 'EIOSTA', 'ADENRS', 'HLPRTW', 'EEGNST', 'ILORTY', 'AKQuVWY', 'BDFGJX'];

// Riddles: the question, then the answers that count (the first is the one shown). The app checks your answer; Bob
// only reads the riddle and drops hints, and the app makes sure a hint never names the answer.
export const RIDDLES = [
  ['What has keys but opens no doors?', 'a piano', 'piano', 'keyboard'],
  ['What has hands but cannot clap?', 'a clock', 'clock', 'watch'],
  ['What gets wetter the more it dries?', 'a towel', 'towel'],
  ['What has a neck but no head?', 'a bottle', 'bottle', 'shirt', 'jumper'],
  ['What can you catch but never throw?', 'a cold', 'cold', 'flu'],
  ['What has one eye but cannot see?', 'a needle', 'needle'],
  ['What goes up but never comes down?', 'your age', 'age'],
  ['What has teeth but cannot bite?', 'a comb', 'comb', 'zip', 'zipper', 'saw'],
  ['What runs but never walks, has a mouth but never talks?', 'a river', 'river', 'stream'],
  ['What is full of holes but still holds water?', 'a sponge', 'sponge'],
  ['What can fill a room but takes up no space?', 'light', 'light', 'sound'],
  ['What has a thumb and four fingers but is not alive?', 'a glove', 'glove', 'mitten'],
  ['The more you take, the more you leave behind. What are they?', 'footsteps', 'footstep', 'footsteps', 'steps', 'footprints', 'footprint'],
  ['What belongs to you, but other people use it more than you do?', 'your name', 'name'],
  ['What has a head and a tail but no body?', 'a coin', 'coin', 'penny'],
  ['What building has the most stories?', 'a library', 'library'],
  ['What can travel around the world while staying in a corner?', 'a stamp', 'stamp'],
  ['What has words but never speaks?', 'a book', 'book', 'newspaper', 'letter'],
  ['What breaks when you say its name?', 'silence', 'silence', 'quiet'],
  ['What has legs but cannot walk?', 'a table', 'table', 'chair', 'desk', 'stool'],
  ['What comes once in a minute, twice in a moment, but never in a thousand years?', 'the letter M', 'm', 'letter m'],
  ['What is always in front of you but cannot be seen?', 'the future', 'future'],
  ['What can you hold in your left hand but never in your right?', 'your right elbow', 'right elbow', 'elbow', 'right hand'],
  ['I shave every day, but my beard stays the same. What am I?', 'a barber', 'barber'],
  ['What has many rings but no fingers?', 'a tree', 'tree', 'tree trunk', 'phone', 'telephone'],
  ['What goes through towns and over hills but never moves?', 'a road', 'road', 'path', 'street'],
  ['What has a bed but never sleeps?', 'a river', 'river', 'stream', 'sea'],
  ['What kind of band never plays music?', 'a rubber band', 'rubber band', 'elastic band', 'hair band', 'headband'],
  ['What starts with T, ends with T, and has T in it?', 'a teapot', 'teapot'],
  ['What gets bigger the more you take away from it?', 'a hole', 'hole'],
  ['What has to be broken before you can use it?', 'an egg', 'egg'],
  ['What is so fragile that saying its name breaks it?', 'silence', 'silence'],
  ['I am tall when I am young and short when I am old. What am I?', 'a candle', 'candle', 'pencil'],
  ['What month of the year has 28 days?', 'all of them', 'all', 'every month', 'all of them', 'all months', 'every one'],
  ['What can you keep after giving it to someone?', 'your word', 'word', 'promise'],
  ['What flies without wings?', 'time', 'time'],
  ['What has cities but no houses, forests but no trees, and water but no fish?', 'a map', 'map', 'atlas'],
  ['What invention lets you look right through a wall?', 'a window', 'window'],
  ['What goes up and down but does not move?', 'a staircase', 'staircase', 'stairs', 'steps'],
  ['What has four wheels and flies?', 'a rubbish lorry', 'rubbish lorry', 'garbage truck', 'bin lorry', 'dump truck', 'trash truck']
];

// Kid mode's easier words: short, common, things a young child can picture. Used by Hangman (and its shelf), Five
// letters picks only from KID_FIVE, and Twenty questions only thinks of animals and foods.
export const KID_WORDS = {
  animals: 'cat dog cow pig hen duck frog fish bear lion goat sheep horse mouse tiger zebra snake whale panda koala rabbit monkey'.split(' '),
  food: 'egg jam cake milk soup rice pear apple bread grape lemon peach pizza toast honey cookie banana carrot cheese'.split(' '),
  house: 'bed cup mug bath door lamp sofa sock spoon chair clock table towel teddy pillow'.split(' '),
  outside: 'sun sky tree rain snow park sand pond hill beach river grass cloud flower garden'.split(' '),
  moves: 'bus car van bike boat ship kite train plane truck rocket scooter tractor'.split(' ')
};
export const KID_FIVE = 'apple bread chair clock cloud grape horse house juice lemon mouse peach pizza plant puppy sheep shirt smile snake spoon sweet table tiger toast train truck whale water zebra happy candy'.split(' ');
