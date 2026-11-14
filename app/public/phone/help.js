// Help for Bob on Android, in Bob's voice: every screen and setting, a glossary and an FAQ.
// test/run-android-test.js checks every setting on the page has a section here.
globalThis.BobHelp = {
  sections: [
    {
      id: 'start', title: 'Getting started',
      html: `<p>I'm the pocket edition of Bob. On the phone I can do two things:</p>
<ul><li><strong>Talk to a Bob on your network.</strong> That's your other replicant matrix's Bob (or any other Bob you add). He has the big brains and all the tools, and I pass your messages along and show you what he makes.</li>
<li><strong>Think on the phone.</strong> A small brain right here, for when no other Bob is reachable. Chat and memory only. It's off until you switch it on.</li></ul>
<p>To set up the first one: on your other replicant matrix, open my Settings and turn on <strong>Bob-Net access</strong>. It shows an address and a passcode. Here, open the menu, <strong>Bob-Net</strong>, add that address, type the passcode and tap <strong>Log in</strong>. Both your other replicant matrix and the phone need Tailscale switched on.</p>`
    },
    {
      id: 'chat', title: 'Chatting',
      html: `<p>Type at the bottom and tap ➤. Send as many as you like: each waits its turn, and the line above the box says how many are waiting. While I'm answering, ➤ turns into ■, which stops me.</p>
<p>The pill at the top right says who's answering: a green dot is a Bob on your network, blue is the phone brain, grey is nobody (No Bob reachable). Tap it to see why or fix it.</p>
<p>Under each reply: <strong>Copy</strong>, <strong>Read aloud</strong>, and, for a phone-brain reply when a Bob on your network is reachable, <strong>Ask (that Bob) instead</strong> to get a second opinion from the big brain.</p>
<p>Code blocks have their own Copy button. Links open in your phone's browser, never inside me.</p>`
    },
    {
      id: 'mic', title: 'Talking instead of typing',
      html: `<p>Tap 🎙 and speak. Your phone's own speech recognition turns it into text and sends it. On most recent phones (the Galaxy S22 included) that happens on the phone itself. The first time, Android asks if I can use the microphone. Otherwise I only listen while that 🎙 window is open, unless you turn on one of the voice switches in Settings: <strong>Talk over Bob</strong>, <strong>"Hey Bob" wake word</strong>, or <strong>Hands-free</strong> in the menu. Each starts off. I never listen with my screen closed.</p>`
    },
    {
      id: 'read-aloud', title: 'Read replies aloud',
      html: `<p>Settings, <strong>Read replies aloud</strong> (off to start with). I read each reply in your phone's own voice. To change the voice or speed, use Android's Settings, Text-to-speech. The fancy voices (Kokoro, Chatterbox, Piper) live on your other replicant matrix.</p>`
    },
    {
      id: 'text-size', title: 'Bigger words and an easier font',
      html: `<p>Settings, Look. <strong>Text size</strong> makes the chat, the message box and Settings bigger or smaller (80% to 160%; 100% to start with). <strong>Readable font</strong> (off to start with) swaps in plainer letters with more room between letters, words and lines. Both are kept on the phone. The other everyday helpers (the today card, the focus timer, receipts, profiles) are on your computer's Bob.</p>`
    },
    {
      id: 'maths', title: 'Maths as formulas',
      html: `<p>Settings, Look, <strong>Render maths</strong> (off to start with). Brains write maths as code, like <code>\\frac{1}{2}</code> for a half. With this on I draw it as real formulas: fractions stacked, powers raised. Prices like $5 stay prices. It's all done on the phone, nothing goes online. A formula I can't read shows as I wrote it, in red. Keyboard shortcuts are only on my computer window, not here.</p>`
    },
    {
      id: 'who', title: 'Who answers',
      html: `<p>Settings, <strong>Who answers</strong>:</p>
<ul><li><strong>Automatic</strong> (the starting position): a Bob on your network when one is reachable, otherwise the phone brain if it's on.</li>
<li><strong>Always a Bob on your network</strong>: never the phone brain. If none is reachable, I say so and the message isn't sent.</li>
<li><strong>Always the phone</strong>: stays here. If you ask for something the phone can't do, I offer a card to send it to a Bob on your network. Nothing goes over without your tap.</li></ul>`
    },
    {
      id: 'big-jobs', title: 'Big jobs: sending to another Bob',
      html: `<p>Some things a phone can't do well: making pictures, video, music and sound effects, working with files and programs on your other replicant matrix, converting documents, virus checks, and Effort above Low. Those need a Bob with a graphics card and his Hands.</p>
<p>When the phone brain is answering and you ask for one, I show a card: <strong>Send to (that Bob)</strong> or <strong>Keep it here</strong>. Keep it here means I'll talk about it, but I can't make it. When a Bob on your network is already answering, it just goes to him.</p>
<p>Pictures, clips and songs he makes show up right in the chat. They're also saved on your other replicant matrix.</p>`
    },
    {
      id: 'bobs', title: 'Bob-Net',
      html: `<p>Menu, <strong>Bob-Net</strong>. Everything about your other Bobs is on this one page: the Bobs this phone can ask (<strong>My other Bobs</strong>), adding and pairing them, and <strong>Lend my brain</strong>. Add a Bob with a name and his Tailscale address: either the name ending in <code>.ts.net</code> or the number starting <code>100.</code>, as your other replicant matrix's <strong>Bob-Net access</strong> setting shows it. Then type his passcode and tap <strong>Log in</strong>.</p>
<p>I only connect to Tailscale addresses. Tailscale scrambles everything between your phone and your other replicant matrix, so the passcode never crosses the café Wi-Fi in the open. The passcode is used once to log in and isn't kept on the phone; your other replicant matrix hands back a key I keep instead.</p>
<p>With more than one Bob, the one at the top is the <strong>First choice</strong>. <strong>Make first choice</strong> moves another one up. <strong>Remove</strong> forgets him and his key (tap twice).</p>
<p>When he needs your OK for something (a file to move, a program to run), the card shows up here too, with <strong>Allow</strong> and <strong>Deny</strong>. If a job needs several OKs, the phone has <strong>Allow all</strong> and <strong>Deny all</strong>; to tick some and not others, use the card on your other replicant matrix.</p>`
    },
    {
      id: 'effort', title: 'Effort',
      html: `<p>When a Bob on your network is answering, the <strong>Effort</strong> button above the message box cycles Low, Medium, High and Extreme, the same as on your other replicant matrix. Higher effort means bigger brains and double-checking, and slower answers. The phone brain is always Low.</p>`
    },
    {
      id: 'phone-brain', title: 'The phone brain',
      html: `<p>Menu, <strong>Phone brain</strong>, <strong>On-device brain</strong> (off to start with). It needs a one-time download:</p>
<ul><li><strong>Gemma 4 E2B</strong> (recommended, about 2.8 GB): quick and light, from the same family as my brains on your other replicant matrix.</li>
<li><strong>Qwen3 4B Instruct</strong> (about 2.5 GB): a little better at step-by-step thinking, but slower, and the phone runs warmer.</li></ul>
<p>Each download asks first, shows its size, comes from an exact pinned version, and is checked against its checksum before I use it. If the check fails, the file is deleted. Pause keeps what's downloaded; Resume carries on. A network hiccup is retried twice by itself.</p>
<p><strong>Use this one</strong> picks which downloaded brain answers. <strong>Delete</strong> frees its space (tap twice).</p>
<p>What the phone brain can't do: pictures, music, files, programs, web search. It's honest about that and points you to a bigger Bob.</p>`
    },
    {
      id: 'speed', title: 'Test speed',
      html: `<p>Phone brain, <strong>Test speed</strong>, under a downloaded brain. It takes about a minute and tells you how fast this phone reads and writes with it. Anything over about 8 words a second feels like chatting. Phones slow down when they get warm, so a second test right after the first can come out lower.</p>`
    },
    {
      id: 'free-memory', title: 'Free memory when Bob is idle',
      html: `<p>Phone brain, <strong>Free memory when Bob is idle</strong> (on to start with), and <strong>Let go after</strong> (5 minutes to start with). After that long without a message, the phone brain lets go of its memory so your other apps stay quick. The next message takes a few seconds longer while it wakes up. <strong>Free it now</strong> does it straight away.</p>
<p>When it wakes up, it gets a short recap of the chat so far, so it doesn't lose the thread.</p>`
    },
    {
      id: 'lend', title: 'Lend my brain',
      html: `<p>Bob-Net, <strong>Lend my brain</strong> (off to start with). With it on, your other Bobs can ask this phone to think quick replies for them. The main use: while you're gaming on your other replicant matrix, I think his small replies here, so your other replicant matrix's processor and graphics card stay with the game.</p>
<p>Only words travel. The other Bob sends the chat and the list of tools he has; I send back words, or "please run this tool". The tool runs on his side, with his own checks and OK cards. The phone only thinks: no tools, files or programs run here for them, and nothing is kept: not the chat, not a log of it. The only line I keep is "Thought a reply for (that Bob) in so many seconds".</p>
<p>To set it up:</p>
<ul><li>Turn on <strong>Lend my brain</strong>. The first time, I make the passcode for you and show it once under <strong>Passcode</strong>: type it into your other Bob straight away. Android shows a notification for as long as lending is on; <strong>Stop lending</strong> on it turns it off.</li>
<li>On your other replicant matrix: Settings, <strong>Bob-Net</strong>, <strong>Borrow a brain</strong>. Add the <strong>Address for your other Bobs</strong> shown here, and the passcode.</li></ul>
<p>I use the phone brain picked above (<strong>Use this one</strong>). I say no, and the other Bob thinks for himself, when: you're using the phone for something else, the phone is warm, the battery is under 25% and not charging, or the phone brain is busy with your own chat. Only Tailscale devices that know the passcode get in, and only on this phone's Tailscale address. <strong>Make a new passcode</strong> signs out every Bob that used the old one.</p>
<p><strong>Let Bob work with the screen off</strong>: Android may stop apps answering when the screen is off. <strong>Open battery settings</strong> takes you to Android's list; pick Bob and allow him.</p>
<p>The first borrowed reply is slow, because I read his instructions and tools once. After that I keep them in mind and only read what's new, so replies start much sooner.</p>`
    },
    {
      id: 'chest', title: 'Chest',
      html: `<p>Menu, <strong>Chest</strong>: the newest things your other Bob has made (pictures, clips, songs, sounds, documents), as little pictures with their names, newest first. Tap one to see it right here, and <strong>Save to this phone</strong> keeps a copy in your Pictures or Music. Nothing is kept on the phone unless you save it; the chest itself lives on your other replicant matrix, so it needs a Bob on your Bob-Net.</p>
<p>Where new things are saved is set on your other replicant matrix: Settings, <strong>Save folder</strong>, then <strong>Change folder…</strong>. Documents and spreadsheets still go wherever you asked for them.</p>`
    },
    {
      id: 'memory', title: 'What Bob remembers',
      html: `<p>Menu, <strong>What Bob remembers</strong>: lasting facts for the phone brain, one per line, yours to edit. It's used from the next new chat. It stays on this phone; your other replicant matrix's Bob keeps his own memory file. Don't put passwords in it.</p><p>If <strong>Relevant memories only</strong> is on in your other replicant matrix's Settings (Speed &amp; memory), then while I can reach your other replicant matrix, the Bob there hands me the few lines of his memory that fit what you just asked, for that one reply. I keep none of them. With your other replicant matrix out of reach, I make do with this phone's list.</p>`
    },
    {
      id: 'past-chats', title: 'Past chats',
      html: `<p>Menu, <strong>Past chats</strong>: every chat on this phone, newest first, with a search box that looks through titles and messages. Tap one to carry on. 🗑 deletes it (tap twice). <strong>New chat</strong> in the menu starts a fresh one.</p>
<p>Chats with a Bob on your network are also kept on your other replicant matrix, under their own chat, so they don't get mixed into your other replicant matrix's main chat.</p>`
    },
    {
      id: 'user-name', title: 'What Bob calls you',
      html: `<p>Settings, <strong>What Bob calls you</strong>. The phone brain uses it. Your other replicant matrix's Bob has his own name setting.</p>`
    },
    {
      id: 'theme', title: 'Theme',
      html: `<p>Settings, <strong>Theme</strong>: Moondust (dark, the starting position: quiet grey with a teal accent, the same one Bob starts with on your other replicant matrices), Bob's Inn (dark, warm tavern browns), Light, or Follow the phone (matches Android's dark mode). A theme you pick stays picked.</p>`
    },
    {
      id: 'resume', title: 'Resume replies',
      html: `<p>Settings, <strong>Resume replies</strong> (off to start with). Android sometimes closes apps in the background to save memory. With this on, if that happens in the middle of a phone-brain reply, I ask the question again when you come back.</p>`
    },
    {
      id: 'to-bottom', title: 'Back to the newest message',
      html: `<p>Scroll up to read and a round button with a down arrow shows at the bottom middle of the chat. Tap it to go back to the newest message. While I'm still answering, three dots on it breathe slowly. If your phone is set to reduce motion, they hold still.</p>`
    },
    {
      id: 'redo', title: 'The … menu: Try again, Edit, Copy, Delete',
      html: `<p>Tap the <strong>…</strong> at the top right of a message:</p><ul><li><strong>Try again</strong> (my latest answer): a new answer to your last message.</li><li><strong>Edit</strong>: your last message, sent again; or my words, fixed here without sending anything.</li><li><strong>Copy</strong>: the whole message.</li><li><strong>Delete</strong>: your message goes with my answer to it; mine goes alone. I ask once first, and it can't be undone.</li></ul><p>Try again, Edit and Delete need Settings, <strong>Try again, Edit and Delete</strong> (on to start with), and wait while I'm still on that chat. Try again and Edit keep what was there as an earlier version (tap <strong>1 earlier version</strong>). Read aloud is in the menu too.</p><p>When a Bob on your network answered, Try again and Edit take his old answer back too (his own switch on). Edit and Delete on this phone change only this phone's copy of the chat: he still remembers what he said.</p>`
    },
    {
      id: 'fade-chat', title: 'Fade old messages and Clear chat',
      html: `<p>With <strong>Fade old messages</strong> on (Settings, In the chat; off to start with), your message and my reply slip off the chat together once they're older than the time you pick, in minutes, hours or days. The chat stays short. A line at the top says how many faded, with <strong>Show them</strong>.</p><ul><li><strong>Hide them</strong> (to start with): they stay on this phone, just off the screen.</li><li><strong>Delete them for good</strong>: gone from this phone, checked every 30 seconds.</li></ul><p><strong>🧹 Clear chat</strong> (top of the chat, or Settings) empties the chat after asking. Tick <strong>Delete it for good</strong> to delete it from the phone. A Bob on your network keeps his own copy, with his own setting. <strong>Amnesia mode</strong> (forget everything from a stretch of time) is on your computer's Bob only for now.</p>`
    },
    {
      id: 'saved-prompts', title: 'Saved prompts and the / menu',
      html: `<p>Settings, <strong>Saved prompts with /</strong> (off to start with). Save the things you ask me often, then type <strong>/</strong> at the start of the message box and tap one. Keep typing after the / to narrow the list down. Its words go in the box; nothing is sent until you tap Send.</p><p>Words in curly brackets, like {file} or {who}, are blanks. The first one is picked out, so just type over it, then tap <strong>Next blank</strong> above the box for the next. {date}, {time} and {day} fill themselves in from the phone's clock.</p><p>Add, change, delete and reorder them under Settings, Saved prompts. <strong>Add Bob's starters</strong> gives you four to try on an empty list. They stay on this phone; your other replicant matrices keep their own list (Settings, How Bob works, 📝 Saved prompts there).</p>`
    },
    {
      id: 'lock', title: 'Passcode lock',
      html: `<p>Settings, <strong>🔒 Passcode lock</strong> (off to start with). Anyone holding this phone can open me and read our chats. A passcode stops that.</p>
<ul><li><strong>Save passcode:</strong> at least 4 characters, typed twice. To change it, type the one you have now too. I never keep a copy, only a lock it opens.</li>
<li><strong>Ask for a passcode to open Bob:</strong> a passcode screen each time I open. To turn it off, untick it, type the same passcode and tap <strong>Turn it off</strong>. If your chats and memory are locked, they go back to plain in that same step, so nothing is lost. A wrong passcode changes nothing.</li>
<li><strong>Lock again after:</strong> back to the passcode screen when nobody has touched me for that many minutes. 0 means only when I open.</li>
<li><strong>Lock my chats and memory:</strong> this phone's chats and my memory are kept scrambled (encrypted) in my storage, opened by the passcode. Off puts them back to plain.</li>
<li><strong>Lock Bob now:</strong> back to the passcode screen at once.</li></ul>
<p><strong>Spare keys for my other Bobs:</strong> keep a spare key for a Bob on your computer, so it can reset a forgotten passcode and keep its locked chats. On that Bob, press <strong>Get a spare key ready</strong> (its Settings, Passcode lock), then <strong>Pick up a spare key</strong> here. When it asks (Forgot it? on its lock screen), it says "asking to reset now" here: tap <strong>Let it reset</strong>. Only from this app, never a web page. The spare opens nothing by itself.</p>
<p><strong>⚠ If you forget the passcode, your locked chats and memory are gone for good.</strong> Nobody can open them, not even me, and this phone's own lock has no reset yet. Write it down first. Your other replicant matrix has its own lock, in its Settings, This replicant matrix, Passcode lock.</p>`
    },
    {
      id: 'alerts', title: 'Alerts',
      html: `<p>When I'm in the background and a Bob on your network needs your OK, or has a check-in for you, Android shows a notification. The first time, Android asks if that's all right. Tap the notification to come back to me.</p><p>Check-ins are set up on your other replicant matrix (Settings, 🔔 Check-ins). The phone only shows them.</p>`
    },
    {
      id: 'pair', title: 'Pair Bobs',
      html: `<p>The quick way to join this phone to a Bob on your other replicant matrix, with no passcode to type.</p>
<ul><li>From the phone: Menu, <strong>Bob-Net</strong>, type that Bob's Tailscale address and tap <strong>Pair with this Bob</strong>. He shows a card with a number; if it matches the one here, press <strong>Yes, pair us</strong> there.</li>
<li>From the other Bob: press <strong>Pair</strong> there (he finds this phone on Tailscale while <strong>Lend my brain</strong> is on). A card shows up here; check the number and tap <strong>Yes, pair us</strong>.</li></ul>
<p>We swap passcodes over Tailscale and each of us adds the other. Nothing else switches on. For the other Bob to ask this phone too, <strong>Lend my brain</strong> has to be on here; for this phone to ask him, <strong>Bob-Net access</strong> has to be on there. Each pairing gets a passcode of its own; <strong>Make a new passcode</strong> signs them all out.</p>`
    },
    {
      id: 'pass-along', title: 'Pass my Bob-Net along',
      html: `<p>Bob-Net, <strong>Pass my Bob-Net along</strong> (off to start with). Your Bobs with this on introduce each other. Say this phone is paired with your handheld, and the handheld with your other replicant matrix: with the switch on for all three, the handheld tells this phone that Bob's name and Tailscale address, and this phone and that Bob pair by themselves, with no card to tap on either side. The phone and that Bob end up on each other's list without you lifting a finger.</p>
<p>What travels: only names and Tailscale addresses, between your own Bobs over Tailscale. The passcodes still pass only between the two Bobs being paired, after the yes the introducer vouched for, exactly as with the card. The phone only answers introductions; it never makes them, so it can't pass your Bob-Net along to anyone else. An introduction has to come through the <strong>Lend my brain</strong> door, signed in with this phone's passcode, so turn that on first; with it off, or the switch off, the other Bob is told no and nothing is kept.</p>
<p>Nothing else switches on. A Bob that's introduced lands under <strong>My other Bobs</strong>, and <strong>Lend my brain</strong> stays as you set it. When a pair comes in this way, the chat says who introduced whom. If you'd rather tap the card every time, leave this off and use <strong>Pair Bobs</strong>.</p>`
    },
    {
      id: 'adventure', title: 'Adventure',
      html: `<p>Menu, <strong>Adventure</strong>: a tabletop role-playing game, the kind you'd play with dice and friends round a table. The game master is your other Bob, on your other replicant matrix; the party is you plus his other Bobs. This phone shows the same table he shows and plays your turns. I'm too small to be game master myself: the phone brain never runs a game, so a Bob on your Bob-Net has to be reachable, and nothing here starts a game by itself.</p>
<p><strong>Starting a game.</strong> Pick a <strong>Setting</strong> (Classic fantasy, Space, Spooky, Pick for me, or type your own) and <strong>Tonight's story</strong> (Make one up, or one of eight ready-made ideas), make <strong>Your character</strong> (a name, a class, one thing about them, or <strong>🎲 Roll one for me</strong>), give them a look under <strong>Looks like</strong>, tick <strong>Who plays</strong> and pick <strong>How long</strong>: Short (3 scenes), Evening (6) or Campaign (saved between sittings). Every character gets their own <strong>Plot armour</strong>: None (the dice decide), Some (one bad roll a scene is rolled again), Lots (can't die) or Legendary (nothing worse than a close call). <strong>Start a new game</strong> loads the game master brain over there; Pause or End lets it go again. The first turn takes longest.</p>
<p><strong>Friends.</strong> <strong>➕ Add a friend</strong> under Who plays gives a real person a character (up to three). On their own phone they open Adventure and pick their character under <strong>This phone plays</strong>; only that character's turns come up there. <strong>Everyone at the table here</strong> plays every human turn on this phone.</p>
<p><strong>On your turn.</strong> Tap a card, or type what you do in your own words under <strong>Say it your way</strong> (🎤 lets you say it). <strong>❓ Ask</strong> puts a question to the game master out of character; it doesn't use your turn. Enemies sit on the table with their hearts, and Attack lets you <strong>Aim at</strong> one. After a big moment the game master may give a character a stat point, a heart, a trick or a spell (⭐ in the log); they keep it for next game. <strong>📓 Journal</strong> opens on the quest log.</p>
<p><strong>Table extras</strong> (all off until ticked): dice you can see, sounds, reading aloud with this phone's voice, pictures and music. Pictures and music are made on your other replicant matrix before the game (<strong>Skip the rest</strong> starts sooner) and need their models there. 🔊 / 🔇 hushes it all.</p>
<p><strong>Looks like.</strong> Your character has a look of its own; my avatar stays mine. <strong>🧍 Change the look</strong> opens the character screen: Body (Man, Woman, Robot, Alien), Build, Hair and Hair colour, Skin, Beard, Glasses, Outfit and Outfit colour, Armour, Weapon and Shield, with a preview and a sentence saying what it adds up to. <strong>🎲 Surprise me</strong> rolls one, <strong>Start over</strong> goes back to plain, <strong>Use for this character</strong> keeps it. It's the same screen as on your other replicant matrix, drawn the same way, so the party looks alike on both.</p>
<p><strong>Saved characters.</strong> <strong>💾 Save this character</strong> keeps the name, class, the one thing about them, plot armour and the look on your other replicant matrix, beside the saved campaigns. Next time, pick them under <strong>Saved characters</strong>. <strong>Delete this character</strong> asks first (<strong>Delete for good</strong> or <strong>Keep it</strong>). Nothing is saved on this phone.</p>
<p><strong>Your turn.</strong> You get <strong>action cards</strong>, only the ones that fit the scene: ⚔ Attack, 🛡 Defend, 🤫 Sneak, 💬 Talk, ✨ Magic, 🎒 Use item, 🔍 Look closer, 🤝 Help an ally, 🏃 Run and ✍ Something else. Some open a second card with the details (which attack, which spell, who to talk to); every second card has <strong>← Back</strong>. Then <strong>How does it play out?</strong> asks for a line of flair: add one (a good line earns +2) and tap <strong>🎲 Roll it</strong>, or <strong>Skip the flair</strong>. Bobs don't get cards; they just say what they do. The app rolls for everyone: a d20 plus a stat; 15 or more is a hit, 10 to 14 a hit at a cost, under 10 a miss. Five <strong>hearts</strong> each; at zero with no plot armour you choose <strong>Go out in style</strong> or <strong>Wake up captured</strong>.</p>
<p><strong>📖 Characters</strong> (on the start card and at the table) is the bestiary, four tabs: <strong>🧍 You</strong> (your saved heroes: <strong>➕ New character</strong>, <strong>Edit</strong>, each with the character screen and <strong>Save this character</strong>, <strong>Delete this character</strong>), <strong>👥 Party</strong> (who's at the table now, or was last game, with hearts, kit and spells), <strong>📖 Met</strong> (everyone and everything the game master has named in a scene; your other Bob draws each one the moment they're named, people from their name, creatures by their kind; between games it holds every meeting across your campaigns, with <strong>Forget</strong>) and <strong>⚔ Enemies</strong> (the usual dozen: Goblin, Skeleton, Wolf, Bandit, Giant rat, Giant spider, Orc, Cultist, Slime, Ghost, Troll, Dragon, each with its hearts, how it attacks and the thing to know; the game master uses those as written and invents the rest). The character screen has monster bodies too, Big humanoid, Beast, Crawler and Blob, with a Hide colour, for heroes who aren't people. All of it lives on your other replicant matrix; the phone shows it.</p>
<p><strong>Tone and Keep out.</strong> Under Story, pick <strong>Cosy</strong>, <strong>Normal</strong> or <strong>Grim</strong>, and list anything to <strong>keep out of the story</strong>; the game master and the Bob players leave it out.</p>
<p><strong>Odds.</strong> Each card shows what the die needs for a hit and about how likely that is (<strong>11+ · 50%</strong>), from your character's stat and plot armour.</p>
<p><strong>↩ Take that back.</strong> For five seconds after a card, before the dice roll, you can take it back and play again; <strong>🎲 Roll now</strong> skips the wait.</p>
<p><strong>Fair fights.</strong> A new enemy's hearts are set by the app to suit the party: more players, tougher enemies; less plot armour, gentler ones. A Bob on your Bob-Net who takes more than 45 seconds over his turn has it played by the game master.</p>
<p><strong>🧭 Journey.</strong> In the menu, next to Adventure (or under Your character on Adventure): Adventure played like an old console game. It opens in my inn; <strong>✨ New adventure</strong> along the bottom rolls a whole new land (pick race, class and size) and <strong>▶ Resume adventure</strong> carries on. Walk with the pad, <strong>A</strong> to talk or open chests, <strong>⚔</strong> to pick a fight with whoever is in front (I ask once; the guards remember), <strong>B</strong> for the menu. Fights are turn-based and every swing and spell rolls to hit. Coin is copper, silver, gold and platinum. Skills, a second and third class, healing on the road and kit go in the menu. No brain needed; the save lives on your other replicant matrix.</p>
<p><strong>🧭 Journey, bigger.</strong> Lands go up to Campaign size here (Saga is for computers), in Fantasy, Sci-fi, Cyberpunk or Steampunk. Your other Bob makes the land and the phone keeps only the part near you. Feed a wild animal the food it loves, mid-fight, to tame it: up to 5 pets and 3 mounts. 🐎 rides, ⤒ flies up on a flier (or comes up from the sea) and ⤓ lands or dives on a dolphin. ☰ Menu has 🐾 Pets and 🧭 The land.</p>
<p><strong>🔊 Journey's music and sound.</strong> Every kind of place has its own tune, fights have theirs, and doors, chests, coin, hits and magic all make sounds, on each style's own instruments. Each style draws its own kit too: pistols and katanas in Cyberpunk, blasters in Sci-fi, flintlocks and sabres in Steampunk, with names to fit. Tap 🔊 at the top to turn the sound off. If you hear nothing, tap the screen once: the phone waits for that.</p>
<p><strong>📕 Storybook.</strong> When a game ends, it's written up as one page with the story, the rolls and the pictures. Open it at the table or next to a campaign under Continue. To keep a copy as a file, open it on your other replicant matrix and press Save a copy.</p>
<p><strong>📋 Table rules</strong> (each off until ticked, remembered for next time): <strong>Easy, Normal or Hard</strong> sets how hard enemies hit. <strong>A map that grows</strong> draws the places the party has been under 🗺 Map. <strong>Coins and shops</strong> gives the party one purse; at a shop, tap something under 🪙 For sale here to buy it. <strong>Catch your breath</strong> puts a 🫁 card in your hand when you're hurt: one heart back, once a scene, no roll. <strong>Secret notes</strong>: 🤫 Secret note passes the game master a line nobody else sees. <strong>Riddle rooms</strong>: the app keeps the answer, so the game master can't give it away; type yours in the 🧩 box (three tries) or Give up. <strong>Badges</strong> (first natural 20, first enemy down, dragon slayer and more) stay with your saved character. 📋 Rules shows it all on one card. Riddles, buying and notes don't use your turn.</p>
<p><strong>Portraits.</strong> Tick <strong>A portrait of every character</strong> under Table extras and your other Bob paints one for each character before the game.</p>
<p><strong>Send a campaign to a friend.</strong> 📤 Send to a friend and 📥 bring a campaign in from a file happen in the Adventure window on your other replicant matrix, not on this phone.</p>
<p><strong>Journal, Pause, End.</strong> 📓 Journal shows the quest log, the 📚 world book (people, places, promises and open threads), the story so far and the scenes. ⏸ Pause lets the game master brain go; ▶ Resume carries on. 🏁 End game finishes it; the campaign stays under <strong>Continue a campaign</strong> on the start card, where Delete takes it away for good. Games are saved on your other replicant matrix, never on this phone.</p>`
    },
    {
      id: 'games', title: 'Games',
      html: `<p>Menu, <strong>Games</strong>: small games your other Bob plays with you. <strong>Twenty questions</strong> (one of us thinks of something, the other asks yes-or-no questions), <strong>Hangman</strong> (a word from a shelf, a letter at a time, seven wrong guesses and it drops), <strong>Word ladder</strong> (climb from one four-letter word to another, one letter a step, real words only), <strong>Five letters</strong> (guess the five-letter word in six tries; each try colours the letters: green right spot, yellow in the word somewhere else, grey not in it) and <strong>Story dice</strong> (six picture dice; we tell a story a line each until every die is in it).</p>
<p>The app on your other replicant matrix runs the game: it picks the secret word, checks every guess, counts the lives and keeps the score. His quick brain only talks, so the games play fine on a small brain and even while he's in a Gaming session. The phone draws the same board and sends the same moves; the phone brain is never used for a game, so a Bob on your Bob-Net has to be reachable. Nothing loads until you press <strong>▶ Start</strong>, and the brain is let go when the game ends.</p>
<p><strong>Four more</strong> (1.5.206): <strong>Four in a row</strong> (tap a column; four of yours in a line wins; yours green, his orange), <strong>Hidden fleet</strong> (tap a square on his sea to fire; your ships are drawn below it; Shuffle my fleet before your first shot), <strong>Liar's dice</strong> (pick How many and the face, then Bid, or tap Liar! to lift the cups; whoever was wrong loses a die) and <strong>Trivia night</strong> (ten questions, four choices; he answers too, and the Bobs on your Bob-Net if you tick Ask the Bobs on my Bob-Net to play; they're sent only the question and the choices). Most games have <strong>Easy</strong>, <strong>Normal</strong> and <strong>Hard</strong>. Five letters and Word ladder have <strong>📅 Today's puzzle</strong>, the same for everyone that day, with a streak. If your other Bob keeps an unfinished game (his setting), it comes back here too; tap <strong>Carry on</strong> when it's his move. New Hangman words from Bob are asked for on your other replicant matrix.</p>
<p><strong>Seven more</strong> (items 123 to 132): <strong>Chess</strong> (tap a piece, then its square; the app checks every move and plays his at the strength you pick; Take back, Offer a draw, Resign), <strong>Sudoku</strong> (tap a square, then a number; Hint shows the next step and why), <strong>Mini crossword</strong> (a 5 by 5 grid, a new one each day with 📅 Today's puzzle; he writes the clues, the app checks your letters), <strong>Letter grid</strong> (find words by joining letters that touch, against the clock; he hunts too), <strong>Noughts and crosses</strong> (Little one, Easy or Can't be beaten), <strong>Code breaker</strong> (tap four colours, then Try it; black pegs right place, white wrong place; or he breaks yours) and <strong>Riddles</strong> (five riddles, three guesses each). <strong>Two players, one screen</strong> under Hangman, Five letters, Word ladder, Noughts and crosses and Riddles: type two names and pass the phone after each move. <strong>Keep this story</strong> under a finished Story dice story makes it a printable page, kept on your other replicant matrix. <strong>Kid mode</strong> (his setting, off to start with) makes the words easier and the teasing gentle.</p>
<p><strong>Hint</strong> costs a life (Hangman) or a try (Five letters); in Word ladder it's free and shows the next rung. <strong>🏁 Stop</strong> ends a game early; it counts as unfinished. The <strong>Scoreboard</strong> under the shelf keeps played, won, lost, shared and your best run per game; it lives on your other replicant matrix, never on this phone. A refused move (not a real word, already on the ladder) costs nothing: the line under the board says why.</p>`
    },
    {
      id: 'save-phone', title: 'Save to this phone',
      html: `<p>Under a picture, clip or song a Bob on your Bob-Net made, <strong>Save to this phone as</strong> keeps it on the phone, in a Bob folder in Pictures, Movies, Music or Download. Tap the type you want; <strong>(original)</strong> is the one he made. Another type is made by that Bob first, so a copy stays on that replicant matrix (your computer) too. Press and hold a type to see what it's good for.</p>`
    },
    {
      id: 'photos', title: 'Photos',
      html: `<p>Tap <strong>📎</strong> next to the message box to pick a photo, then say what to do with it ("make the sky orange", "turn this into a poster"). The photo and your message go to a Bob on your other replicant matrix, who does the work and sends the result back here. The phone brain can't see pictures, so with no Bob reachable the photo waits until you remove it (✕) or one is back. The photo is kept on that replicant matrix (your computer), in its References page, like one you added there.</p>`
    },
    {
      id: 'howtos', title: 'How-tos',
      html: `<p>When a Bob on your Bob-Net finishes a bigger job well, he may offer to keep the steps as a how-to, and the card shows up here too. Tap <strong>Save how-to</strong> (you can rename it first) or <strong>Not now</strong>. Next time you ask for something like it, he follows those steps. He only offers when <strong>Learn how-tos</strong> is on in his Settings. Changing a how-to is done on your other replicant matrix, in Settings, 🧰 Tools and how-tos; here you can look at them and delete them (see Tools and how-tos).</p>`
    },
    {
      id: 'own-kit', title: 'Tools and how-tos',
      html: `<p>Settings, <strong>Tools and how-tos</strong> shows what a Bob on your Bob-Net made for himself: the <strong>tools</strong> he wrote (small programs, only with Make his own tools on in his Settings) and the <strong>how-tos</strong> he kept (the steps of jobs that went well). Each tool says what it does, what it can change and whether it uses the internet.</p>
<p><strong>Delete</strong> asks once more on the same row (Delete or Keep it). Then he stops using the thing at once and it waits 30 days under <strong>Recently deleted</strong>, where <strong>Put back</strong> brings it back exactly as it was. Right after a delete there's an <strong>Undo</strong> too. Delete for good, reading a tool's code and editing a how-to are done on your other replicant matrix itself, in the same panel. The list shows when a Bob is reachable; nothing is kept on the phone.</p>`
    },
    {
      id: 'help-bundle', title: 'Save a help bundle',
      html: `<p>When I'm not working right and neither of us can see why, Settings, <strong>Save a help bundle</strong> packs what a helper needs into one file in this phone's Downloads (folder Bob). The helper can be a person, or an AI agent such as Claude or ChatGPT: the first thing in it, HANDOFF.md, is written for an agent to read first. It says what I am, points at my public code (github.com/MouseWurX/Bob) and the exact version, and lists where to look and what to try, in order. You hand it over; I never send it anywhere myself.</p>
<p>Two kinds, depending on who's home. With a Bob on your network reachable, I ask him for his zip: his logbook, every error, his last chats, his settings without their secrets, this replicant matrix's facts and, if his brain is loaded and idle, a short note on what he thinks is wrong. That takes up to a minute. With nobody home, the phone writes a smaller bundle on its own: one HANDOFF.md with this phone's facts, which phone brain is downloaded or loaded, the last 50 things that went wrong here, and my last three chats here (40 messages each). No note from my brain in that one; it tells the helper to assume the worst.</p>
<p>Taken out before anything is written: your name, every passcode and key, and Tailscale addresses. Read the file yourself before you share it if you like; it's plain text. If something personal slipped through, that's a bug: please tell me at github.com/MouseWurX/Bob/issues.</p>
<p>Where to take it: paste HANDOFF.md, or the whole file, to the agent that's helping you, or open an issue at github.com/MouseWurX/Bob/issues and attach it; say what you saw and what you expected.</p>`
    },
    {
      id: 'privacy', title: 'Privacy',
      html: `<p>Everything on the phone stays on the phone: chats, my memory file and the phone brain. Android's cloud backup is told to leave them out. I only talk to the Bobs you add (over Tailscale) and, when you say yes to a download, to huggingface.co for the phone brain. With <strong>Lend my brain</strong> on, your own Bobs send the chat so far and what they remember about you. The phone thinks a reply and keeps none of it. If your home Bob has a rented brain (a big brain hired from an online service, off unless the owner turned it on there), a job you hire it for goes from that computer to that service; the phone only shows the card and the cost, and the key never leaves the computer. No tracking, no ads, nothing else.</p>`
    },
    {
      id: 'credits', title: 'Credits and thanks',
      html: `<p>Bob is inspired by the wonderful books of Dennis E. Taylor. Bob is an independent, fan-made project. It is not affiliated with, sponsored by or endorsed by Dennis E. Taylor or by his publishers, distributors or licensees. All characters, names, titles, stories and other rights in those books remain the property of their respective owners. Bob contains no text from the books; any similar names or ideas are used only as a tribute.</p><p>This app's code is free software (GPL 3 or later), and its art and writing are CC BY-SA 4.0. Those licences cover only MouseWurX's own work, not anything that belongs to the author or his publishers.</p>`
    },
    {
      id: 'talk-over', title: 'Talk over Bob',
      html: `<p>Settings, Voice, <strong>Talk over Bob</strong> (off to start with). While I'm reading a reply aloud, just start talking: I stop and listen. Say "stop" (or "quiet", "enough") on its own and I only stop. Say anything else and I stop and send it as your next message.</p>
<p>The microphone is only open while I'm reading aloud, and only with my screen showing. Without headphones the phone can hear me through its own speaker; I ignore words that are mostly what I'm saying, but headphones work best. Same switch on your other replicant matrix: Settings, Voice details.</p>`
    },
    {
      id: 'wake', title: 'Hey Bob on the phone',
      html: `<p>Settings, Voice, <strong>"Hey Bob" wake word</strong> (off to start with). Say "Hey Bob, what's on tomorrow?" and it's sent, no tap needed. "Hey Bob" on its own and I listen for the next thing you say (8 seconds).</p>
<p>Only while my screen is showing: when you switch apps or the screen goes off, I stop listening, and I start again when you come back. It uses Android's own speech recognition over and over, so it costs some battery, and on some phones it beeps each time it starts. I stop listening while I talk, unless <strong>Talk over Bob</strong> is on.</p>`
    },
    {
      id: 'hands-free', title: 'Hands-free',
      html: `<p>Menu, <strong>Hands-free</strong>. A big-button page for when your hands are busy (cooking, the workshop, walking): tap <strong>🎙 Talk</strong>, say what you want, and I answer out loud, whatever Read replies aloud is set to.</p>
<ul><li><strong>Keep listening</strong> (on in Hands-free): when I finish talking, I listen for your next words by myself, so a whole conversation needs one tap. Turn it off to tap Talk each time.</li>
<li><strong>Short answers out loud</strong> (off unless you turn it on): I say only the first sentence or two, then "The rest is in the chat." Same as Talk with Bob on the computer.</li>
<li><strong>■ Stop</strong> stops me talking or thinking. <strong>🔁 Say it again</strong> repeats my last answer.</li>
<li>Say "stop" to stop me mid-sentence (Talk over Bob works here too, if it's on).</li></ul>
<p>Leaving the page (Back) stops the listening. Nothing new switches on.</p>`
    },
    {
      id: 'reader', title: 'Read a document aloud',
      html: `<p>Menu, <strong>Read aloud</strong>. I read a document to you in the phone's voice: <strong>Pick a text file</strong> from the phone, paste words in, or <strong>Bob's last reply</strong>. Then <strong>▶ Play</strong>, <strong>⏸ Pause</strong>, <strong>⏮</strong> and <strong>⏭</strong> (one piece back or on; a piece is a few sentences), and <strong>Speed</strong> from 0.75× to 2×.</p>
<p>I remember where you stopped in each one (the last 30), on this phone, so Play carries on from there next time. Code and links are skipped, like Read replies aloud. Word, PDF and other documents: read them on your other replicant matrix, where Settings, Voice details, <strong>Read documents aloud</strong> adds a player to the document panel.</p>`
    },
    {
      id: 'net-voices', title: 'A voice per Bob',
      html: `<p>Settings, Voice, <strong>A voice per Bob</strong> (off to start with). Read aloud gives each of your Bobs his own pitch and pace, picked from his name, so with two or three Bobs in the conversation you can hear who's talking. The phone brain keeps the phone's normal voice. The same Bob always sounds the same. To change the voice itself, use Android's Settings, Text-to-speech.</p>
<p>On your other replicant matrix the same switch (Settings, Voice details) uses a whole different Kokoro voice for each Bob, and lets you pick them.</p>`
    },
    {
      id: 'share', title: 'Share to Bob',
      html: `<p>Settings, <strong>Accept shares</strong> (off to start with). With it on I'm in every app's <strong>Share</strong> menu. Share to me and:</p>
<ul><li>a link or words land in the message box;</li><li>a picture is attached, like 📎, for a Bob on your network to look at;</li><li>a small text file (up to 512 KB: .txt, .md, .csv, .json and so on) comes in as its words.</li></ul>
<p>Nothing is sent until you add what you want and tap Send. Other kinds of file I can't take on the phone; send them from your other replicant matrix. Turn the switch off and I'm out of the Share menu again.</p>`
    },
    {
      id: 'widget', title: 'The home-screen widget',
      html: `<p>Long-press your home screen, <strong>Widgets</strong>, <strong>Bob</strong>, and drag it out. It has an <strong>Ask Bob</strong> box (opens me with the keyboard up), a <strong>🎙</strong> (opens me listening) and one line for your next reminder.</p>
<p>The reminder line is filled only with Settings, <strong>Reminder on widget</strong> on (off to start with), and only while I'm open: I ask your other Bob every 10 minutes, and he has to have <strong>Share status with my phone</strong> on (his Settings, Bob-Net). The widget itself never goes online. Without the switch it just says "Tap to ask Bob".</p>`
    },
    {
      id: 'carry', title: 'Carry on on another Bob',
      html: `<p>Menu, <strong>Carry on on another Bob</strong>. Started a chat with the phone brain on the bus and want the big brain at home? Tap <strong>Carry on with</strong> one of your Bobs: he gets everything you and I said in this chat, it shows up in his Past chats, and from then on he answers this chat while he's reachable. Keep typing here, or open it there.</p>
<p>That Bob has to have Settings, Bob-Net, <strong>Accept chats</strong> on (off to start with). Only the words travel, over Tailscale: no files, pictures or memory. <strong>Let Settings pick who answers again</strong> undoes the pairing for this chat. On your other replicant matrix, Past chats has <strong>Carry on on…</strong> under each chat to hand it to another computer.</p>`
    },
    {
      id: 'glance', title: 'Your Bobs',
      html: `<p>Menu, <strong>Your Bobs</strong>. One line per Bob on your list: up and ready, busy, or gaming; his brain; the graphics card's heat (cool, warm or hot, in °C) and memory; the jobs running or waiting; and your next reminder. It checks again every 15 seconds while the page is open, and not at all when it's closed.</p>
<p>Each Bob only answers with Settings, Bob-Net, <strong>Share status with my phone</strong> on there (off to start with). The heat needs an NVIDIA card; other cards show the rest.</p>`
    },
    {
      id: 'low-data', title: 'Low-data mode',
      html: `<p>Settings, Data, <strong>Low-data mode</strong>: <strong>Off</strong> (to start with), <strong>Only on mobile data</strong> or <strong>Always</strong>. With it on, chats are text only: pictures, clips, songs, diagrams and 3D models from your other Bob wait as a <strong>tap to load</strong> button instead of coming down by themselves. Only on mobile data goes by what Android says about the connection (a metered one), checked each time I come to the front.</p>`
    },
    {
      id: 'glossary', title: 'Glossary',
      html: `<dl>
<dt>Talk over</dt><dd>Speaking while I read aloud, so I stop and listen. Settings, Voice, Talk over Bob.</dd>
<dt>Wake word</dt><dd>"Hey Bob": the words that make me listen without a tap. Settings, Voice.</dd>
<dt>Hands-free</dt><dd>The big-button page where we only speak and listen. Menu, Hands-free.</dd>
<dt>Piece</dt><dd>A few sentences: what Read aloud reads at a time, and what ⏮ and ⏭ skip.</dd>
<dt>Share menu</dt><dd>Android's list of apps you can send a link, picture or file to from another app. I'm in it while Accept shares is on.</dd>
<dt>Widget</dt><dd>A small piece of an app that sits on your home screen. Mine has Ask Bob, 🎙 and your next reminder.</dd>
<dt>Carry on</dt><dd>Handing a chat to another of your Bobs, words and all, so you keep going there.</dd>
<dt>Metered connection</dt><dd>One Android counts as costing by the megabyte, usually mobile data. Low-data mode can go by it.</dd>
<dt>Low-data mode</dt><dd>Text only: what your other Bob makes waits for your tap. Settings, Data.</dd>
<dt>Bob on your network</dt><dd>A Bob running on one of your replicant matrices that lets this phone in. He does the heavy lifting.</dd>
<dt>Phone brain</dt><dd>A small AI model that runs on this phone, without the internet.</dd>
<dt>Chest</dt><dd>The newest things your other Bob made, shown as little pictures with names. Menu, Chest here; Made by Bob on your other replicant matrix.</dd>
<dt>Tailscale</dt><dd>A free app that makes a private, scrambled link between your own devices, wherever they are.</dd>
<dt>Model family</dt><dd>Models made by the same team and built the same way, like Qwen or Gemma. One family comes in many sizes, from phone-sized to big. Under Phone brain each family has its own header you open and close.</dd>
<dt>Replicant matrix</dt><dd>What I call the computer a Bob runs on. Here that's this replicant matrix (this phone); your other Bobs each live on their own, like your other replicant matrix at home. It's still your computer or phone; it's just my name for it.</dd>
<dt>Passcode lock</dt><dd>A passcode screen before I open, off to start with (Settings, Passcode lock). With Lock my chats and memory on, this phone's chats and my memory are scrambled too, and a lost passcode means they're gone for good.</dd>
<dt>Passcode</dt><dd>The code you make on your other replicant matrix under Bob-Net access (or on the phone under Lend my brain). It proves the device asking is yours.</dd>
<dt>Lend my brain</dt><dd>This phone thinks quick replies for your other Bobs. They send words; the phone sends words back. The phone only thinks: no tools, files or programs run here for them, and nothing is kept.</dd>
<dt>Borrowed brain</dt><dd>What your other replicant matrix calls it when another of your replicant matrices thinks a reply for him.</dd>
<dt>Effort</dt><dd>How hard a Bob on your network works on an answer: bigger brains and checking at higher levels.</dd>
<dt>Pinned download</dt><dd>A download from one exact version of a file, checked against its fingerprint (checksum), so nobody can swap it.</dd>
<dt>Free memory when idle</dt><dd>The phone brain unloads after a quiet spell, so the phone stays quick.</dd>
<dt>Introduced</dt><dd>Paired through a third Bob of yours that has Pass my Bob-Net along on: he tells this phone and another Bob each other's name and address, and they pair with no card.</dd>
<dt>Game master</dt><dd>Your other Bob, when he runs an Adventure: he sets the scenes, plays everyone who isn't at the table, and says what the dice mean. The phone brain can't be one.</dd>
<dt>Hearts</dt><dd>A character's health in an Adventure: five to start, up to eight as they earn more. Enemies have them too. A miss can cost one; at zero hearts you choose Go out in style or Wake up captured.</dd>
<dt>Plot armour</dt><dd>How safe a character is from bad dice in an Adventure: None, Some, Lots or Legendary. Asked for every character at the start of every game.</dd>
<dt>Bestiary</dt><dd>The 📖 Characters page in an Adventure: your saved heroes (You), the table (Party), everyone the game master has named (Met, drawn as they appear) and the usual enemies with their hearts (Enemies).</dd>
<dt>Character screen</dt><dd>Where you build a look from parts (body, hair, outfit, armour, weapon and so on) for your Adventure character. The parts are the same ones my own avatars are drawn from, so it blinks and talks like any look.</dd>
<dt>Action card</dt><dd>One of your choices on your turn in an Adventure (Attack, Talk, Magic, Use item and so on). Some open a second card with the details. Bobs don't get cards; they just say what they do.</dd>
<dt>Twenty questions</dt><dd>One of us thinks of something; the other asks yes-or-no questions, twenty at most, then guesses.</dd>
<dt>Shelf</dt><dd>A list of Hangman words on one subject (Animals, Food and drink, Around the house, Out of doors, Jobs people do, Things that move), or Any shelf.</dd>
<dt>Word ladder</dt><dd>Climb from one four-letter word to another, changing one letter a step; every rung must be a real word.</dd>
<dt>Five letters</dt><dd>Guess a five-letter word in six tries. Each try colours its letters: green right spot, yellow in the word elsewhere, grey not in it.</dd>
<dt>Story dice</dt><dd>Six picture dice come up; we tell a story a line each until every die is in it. Always a shared point.</dd>
<dt>Four in a row</dt><dd>Drop counters into seven columns turn about; four of yours in a line, across, down or slanting, wins.</dd>
<dt>Hidden fleet</dt><dd>Five ships each on a ten by ten sea; call squares until one fleet is sunk.</dd>
<dt>Liar's dice</dt><dd>Five hidden dice each; bid how many of a face are on the table, or call the bid a lie. Wrong costs a die.</dd>
<dt>Trivia night</dt><dd>Ten questions with four choices; your other Bob answers too, and the Bobs on your Bob-Net if you tick them in.</dd>
<dt>Today's puzzle</dt><dd>The daily Five letters and Word ladder: the same for everyone that day, one go, with a streak.</dd>
<dt>Help bundle</dt><dd>One file from Save a help bundle (Settings, Save a help bundle): my logs, errors, last chats, settings without their secrets and this replicant matrix's facts, with a HANDOFF.md on top. I never send it anywhere.</dd>
<dt>Handoff file (HANDOFF.md)</dt><dd>The first file in a help bundle, written for whoever helps (a person or an AI agent): what I am, my exact version and public code, what's wrong as far as I can tell, and what to try first.</dd>
<dt>Try again</dt><dd>In the … menu of my latest answer: a new answer to your last message. The old one is kept as an earlier version.</dd>
<dt>… menu</dt><dd>The … at the top right of a message: Try again, Edit, Copy, Delete.</dd>
<dt>Earlier version</dt><dd>Under your message: what was there before you tapped Try again or Edit.</dd>
<dt>Saved prompt</dt><dd>Words you ask me often, saved with a short name. Type / at the start of the message box to pull one up. Blanks in {curly brackets} are what you fill in.</dd>
<dt>OK card</dt><dd>A Bob on your network asking before he does something outside his own folder.</dd>
</dl>`
    },
    {
      id: 'faq', title: 'Questions and fixes',
      html: `<table>
<tr><th>What happens</th><th>What to do</th></tr>
<tr><td>No Try again, Edit or Delete in the … menu</td><td>Settings, Try again, Edit and Delete: turn it back on. They also wait while I'm still answering in that chat.</td></tr>
<tr><td>Can I get a deleted message back?</td><td>No. Delete is for good, so I ask once first. Try again and Edit keep the old version instead.</td></tr>
<tr><td>The chest is empty or says no Bob is reachable</td><td>The chest is your other Bob's Made by Bob list, so it needs him on Tailscale. Once he's reachable, open the menu and tap Chest again.</td></tr>
<tr><td>I forgot my passcode</td><td>If Lock my chats and memory was on, those chats and my memory are gone for good: the passcode is the only key and there is no reset. To start fresh, clear my storage (Android Settings, Apps, Bob, Storage, Clear storage); that removes the lock, the chats and your phone settings. Your other replicant matrix's chats aren't touched.</td></tr>
<tr><td>The pill says Nobody home</td><td>Tap it. Usually your other replicant matrix is asleep, or Tailscale is off on the phone or your other replicant matrix.</td></tr>
<tr><td>"Isn't letting other replicant matrices in yet"</td><td>On your other replicant matrix: Bob's Settings, Bob-Net, Bob-Net access. Turn it on, then restart Bob on your other replicant matrix.</td></tr>
<tr><td>"That isn't a Tailscale address"</td><td>Use the address your other replicant matrix's Bob-Net access setting shows: a name ending in .ts.net, or a number starting 100.</td></tr>
<tr><td>Your other replicant matrix says the phone didn't answer in time</td><td>The first borrowed reply is the slow one: the phone reads my whole instructions and tool list once. After that it only reads what's new. If it keeps happening, check Bob-Net, Lend my brain for a reason (warm, low battery, in use), and tap Open battery settings there.</td></tr>
<tr><td>Can your other replicant matrix borrow the phone while I game?</td><td>Yes: that's what Lend my brain is for. Turn it on here, then on your other replicant matrix: Settings, Bob-Net, Borrow a brain. Keep the phone on its charger with the screen off.</td></tr>
<tr><td>Can my Bobs introduce each other?</td><td>Yes, if you ask them to. Turn on Pass my Bob-Net along under Bob-Net here, and the same switch on the Bobs on your other replicant matrices (Settings, Bob-Net, What they share). A Bob paired with two of them tells each the other's name and address, and those two pair with no card. The phone only answers; Lend my brain has to be on here for the introduction to get in.</td></tr>
<tr><td>Can I save prompts I use a lot?</td><td>Yes. Turn on Saved prompts with / in Settings, add them under Saved prompts, then type / in the message box and tap one.</td></tr>
<tr><td>It asks for the passcode again</td><td>The passcode was changed on your other replicant matrix. Type the new one under Bob-Net.</td></tr>
<tr><td>The phone brain is slow or stops</td><td>Close big apps (games, the camera), let the phone cool down, or try Test speed. Gemma 4 E2B is the quicker one.</td></tr>
<tr><td>The download stopped</td><td>Tap Resume. It carries on where it stopped. If it says the checksum didn't match, the file was damaged on the way and was deleted: download it again on Wi-Fi.</td></tr>
<tr><td>Pictures don't show</td><td>Very big files stay on your other replicant matrix; they're in Made by Bob there.</td></tr>
<tr><td>Can the phone brain see pictures?</td><td>Not yet on the phone. Send them to a Bob on your network for now.</td></tr>
<tr><td>Can the phone brain run an Adventure?</td><td>No: it's too small to be game master. The table lives on your other replicant matrix; the phone shows it and plays your turns. Get your other Bob on Tailscale and open Adventure here.</td></tr>
<tr><td>Can a friend play from their phone?</td><td>Yes. Add them as a friend on the start card; on their phone, open Adventure and pick their character under This phone plays. The game runs on your other replicant matrix either way.</td></tr>
<tr><td>Can my Adventure character look different from Bob?</td><td>Yes. On the start card, under Looks like, tap 🧍 Change the look and build one from parts: any body, hair, outfit, armour and weapon. It's your character's look, saved with the game and under Saved characters; my own avatar doesn't change.</td></tr>
<tr><td>How tough are the enemies in an Adventure?</td><td>The usual dozen are on the Enemies tab of 📖 Characters with their hearts: a giant rat has one, a goblin two, an orc four, a dragon six. The game master uses those as written and takes hearts off them as the story goes; anything else he invents, and a boss simply has more. Whoever he brings on lands on Met, drawn.</td></tr>
<tr><td>Can the phone brain play the games?</td><td>No. The app on your other replicant matrix runs them and his quick brain talks; the phone shows the board and sends your moves. Get your other Bob on Tailscale and open Games here.</td></tr>
<tr><td>How do I get help with my Bob?</td><td>First try the rows above, then ask me in the chat. If I'm the one not working, Settings, Save a help bundle: one file with my logs, errors, last chats and this replicant matrix's facts, with your name, passcodes, keys and Tailscale addresses taken out, written for a helper (a person or an AI agent) to read first. Paste it to the agent you use, or open an issue at github.com/MouseWurX/Bob/issues with it attached and a line about what you saw. Bob is free software made by volunteers, so an issue is a request, not a ticket; the bundle makes it one that can be answered. See Save a help bundle.</td></tr>
<tr><td>Can I stop Bob reading aloud by talking?</td><td>Yes: Settings, Voice, Talk over Bob. Say "stop" to stop him, or just say your next message. Headphones work best.</td></tr>
<tr><td>Can I say "Hey Bob" on the phone?</td><td>Yes, while my screen is showing: Settings, Voice, "Hey Bob" wake word. It's off to start with because it uses battery.</td></tr>
<tr><td>Hey Bob doesn't hear me</td><td>Check the microphone is allowed (Android's Settings, Apps, Bob, Permissions), that my screen is showing, and that the 🎙 window isn't open. Some phones need Google's speech recognition installed.</td></tr>
<tr><td>Bob isn't in the Share menu</td><td>Settings, Sharing and the widget, Accept shares. Some apps only show the apps you used last: look under More.</td></tr>
<tr><td>The widget says "Tap to ask Bob" and no reminder</td><td>Turn on Reminder on widget here, and Share status with my phone on your other Bob (Settings, Bob-Net). It updates while I'm open.</td></tr>
<tr><td>Your Bobs says a Bob isn't sharing</td><td>On that replicant matrix: Settings, Bob-Net, Share status with my phone.</td></tr>
<tr><td>Can I move a chat from the phone to my computer?</td><td>Yes: Menu, Carry on on another Bob. That Bob needs Accept chats on (his Settings, Bob-Net).</td></tr>
<tr><td>Pictures don't load on mobile data</td><td>That's Low-data mode: tap the button to load one, or set it to Off in Settings, Data.</td></tr>
<tr><td>Can I use the phone away from home?</td><td>Yes, as long as your other replicant matrix is on and Tailscale is on at both ends. Without that, the phone brain can still chat.</td></tr>
</table>`
    }
  ]
};
