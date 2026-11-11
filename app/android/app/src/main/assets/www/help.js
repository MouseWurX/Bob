// Help for Bob on Android, in Bob's voice: every screen and setting, a glossary and an FAQ.
// test/run-android-test.js checks every setting on the page has a section here.
globalThis.BobHelp = {
  sections: [
    {
      id: 'start', title: 'Getting started',
      html: `<p>I'm the pocket edition of Bob. On the phone I can do two things:</p>
<ul><li><strong>Talk to a Bob on your network.</strong> That's your other replicant matrix's Bob (or any other Bob you add). He has the big brains and all the tools, and I pass your messages along and show you what he makes.</li>
<li><strong>Think on the phone.</strong> A small brain right here, for when no other Bob is reachable. Chat and memory only. It's off until you switch it on.</li></ul>
<p>To set up the first one: on your other replicant matrix, open my Settings and turn on <strong>Let my other replicant matrices in</strong>. It shows an address and a passcode. Here, open the menu, <strong>Bob-Net</strong>, add that address, type the passcode and tap <strong>Log in</strong>. Both your other replicant matrix and the phone need Tailscale switched on.</p>`
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
      html: `<p>Tap 🎙 and speak. Your phone's own speech recognition turns it into text and sends it. On most recent phones (the Galaxy S22 included) that happens on the phone itself. The first time, Android asks if I can use the microphone. I only listen while that 🎙 window is open; there's no "Hey Bob" on the phone, because keeping the microphone open all day eats the battery.</p>`
    },
    {
      id: 'read-aloud', title: 'Read replies aloud',
      html: `<p>Settings, <strong>Read replies aloud</strong> (off to start with). I read each reply in your phone's own voice. To change the voice or speed, use Android's Settings, Text-to-speech. The fancy voices (Kokoro, Chatterbox, Piper) live on your other replicant matrix.</p>`
    },
    {
      id: 'maths', title: 'Maths as formulas',
      html: `<p>Settings, Look, <strong>Show maths as formulas</strong> (off to start with). Brains write maths as code, like <code>\\frac{1}{2}</code> for a half. With this on I draw it as real formulas: fractions stacked, powers raised. Prices like $5 stay prices. It's all done on the phone, nothing goes online. A formula I can't read shows as I wrote it, in red. Keyboard shortcuts are only on my computer window, not here.</p>`
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
      html: `<p>Menu, <strong>Bob-Net</strong>. Everything about your other Bobs is on this one page: the Bobs this phone can ask (<strong>My other Bobs</strong>), adding and pairing them, and <strong>Lend my brain</strong>. Add a Bob with a name and his Tailscale address: either the name ending in <code>.ts.net</code> or the number starting <code>100.</code>, as your other replicant matrix's <strong>Let my other replicant matrices in</strong> setting shows it. Then type his passcode and tap <strong>Log in</strong>.</p>
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
      html: `<p>Menu, <strong>Phone brain</strong>, <strong>Let Bob think on the phone</strong> (off to start with). It needs a one-time download:</p>
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
<p>Where new things are saved is set on your other replicant matrix: open Equip Bob, press the chest under Bob, then <strong>Change folder…</strong>. Documents and spreadsheets still go wherever you asked for them.</p>`
    },
    {
      id: 'memory', title: 'What Bob remembers',
      html: `<p>Menu, <strong>What Bob remembers</strong>: lasting facts for the phone brain, one per line, yours to edit. It's used from the next new chat. It stays on this phone; your other replicant matrix's Bob keeps his own memory file. Don't put passwords in it.</p><p>If <strong>Remember only what fits</strong> is on in your other replicant matrix's Settings (Speed &amp; memory), then while I can reach your other replicant matrix, the Bob there hands me the few lines of his memory that fit what you just asked, for that one reply. I keep none of them. With your other replicant matrix out of reach, I make do with this phone's list.</p>`
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
      html: `<p>Settings, <strong>Theme</strong>: Bob's Inn (dark, the starting position), Light, or Follow the phone (matches Android's dark mode).</p>`
    },
    {
      id: 'resume', title: 'Pick up where Bob left off',
      html: `<p>Settings, <strong>Pick up where Bob left off</strong> (off to start with). Android sometimes closes apps in the background to save memory. With this on, if that happens in the middle of a phone-brain reply, I ask the question again when you come back.</p>`
    },
    {
      id: 'alerts', title: 'Alerts',
      html: `<p>When I'm in the background and a Bob on your network needs your OK, or has a check-in for you, Android shows a notification. The first time, Android asks if that's all right. Tap the notification to come back to me.</p><p>Check-ins are set up on your other replicant matrix (Settings, 🔔 Check-ins). The phone only shows them.</p>`
    },
    {
      id: 'pair', title: 'Pair with my other Bobs',
      html: `<p>The quick way to join this phone to a Bob on your other replicant matrix, with no passcode to type.</p>
<ul><li>From the phone: Menu, <strong>Bob-Net</strong>, type that Bob's Tailscale address and tap <strong>Pair with this Bob</strong>. He shows a card with a number; if it matches the one here, press <strong>Yes, pair us</strong> there.</li>
<li>From the other Bob: press <strong>Pair</strong> there (he finds this phone on Tailscale while <strong>Lend my brain</strong> is on). A card shows up here; check the number and tap <strong>Yes, pair us</strong>.</li></ul>
<p>We swap passcodes over Tailscale and each of us adds the other. Nothing else switches on. For the other Bob to ask this phone too, <strong>Lend my brain</strong> has to be on here; for this phone to ask him, <strong>Let my other replicant matrices in</strong> has to be on there. Each pairing gets a passcode of its own; <strong>Make a new passcode</strong> signs them all out.</p>`
    },
    {
      id: 'pass-along', title: 'Pass my Bob-Net along',
      html: `<p>Bob-Net, <strong>Pass my Bob-Net along</strong> (off to start with). Your Bobs with this on introduce each other. Say this phone is paired with your handheld, and the handheld with your other replicant matrix: with the switch on for all three, the handheld tells this phone that Bob's name and Tailscale address, and this phone and that Bob pair by themselves, with no card to tap on either side. The phone and that Bob end up on each other's list without you lifting a finger.</p>
<p>What travels: only names and Tailscale addresses, between your own Bobs over Tailscale. The passcodes still pass only between the two Bobs being paired, after the yes the introducer vouched for, exactly as with the card. The phone only answers introductions; it never makes them, so it can't pass your Bob-Net along to anyone else. An introduction has to come through the <strong>Lend my brain</strong> door, signed in with this phone's passcode, so turn that on first; with it off, or the switch off, the other Bob is told no and nothing is kept.</p>
<p>Nothing else switches on. A Bob that's introduced lands under <strong>My other Bobs</strong>, and <strong>Lend my brain</strong> stays as you set it. When a pair comes in this way, the chat says who introduced whom. If you'd rather tap the card every time, leave this off and use <strong>Pair with my other Bobs</strong>.</p>`
    },
    {
      id: 'adventure', title: 'Adventure',
      html: `<p>Menu, <strong>Adventure</strong>: a tabletop role-playing game, the kind you'd play with dice and friends round a table. The game master is your other Bob, on your other replicant matrix; the party is you plus his other Bobs. This phone shows the same table he shows and plays your turns. I'm too small to be game master myself: the phone brain never runs a game, so a Bob on your Bob-Net has to be reachable, and nothing here starts a game by itself.</p>
<p><strong>Starting a game.</strong> Pick a <strong>Setting</strong> (Classic fantasy, Space, Spooky, Pick for me, or type your own), make <strong>Your character</strong> (a name, a class, one thing about them, or <strong>🎲 Roll one for me</strong>), give them a look under <strong>Looks like</strong>, tick <strong>Who plays</strong> and pick <strong>How long</strong>: Short (3 scenes), Evening (6) or Campaign (saved between sittings). Every character gets their own <strong>Plot armour</strong>: None (the dice decide), Some (one bad roll a scene is rolled again), Lots (can't die) or Legendary (nothing worse than a close call). <strong>Start a new game</strong> loads the game master brain over there; Pause or End lets it go again. The first turn takes longest.</p>
<p><strong>Looks like.</strong> Your character has a look of its own; my avatar stays mine. <strong>🧍 Change the look</strong> opens the character screen: Body (Man, Woman, Robot, Alien), Build, Hair and Hair colour, Skin, Beard, Glasses, Outfit and Outfit colour, Armour, Weapon and Shield, with a preview and a sentence saying what it adds up to. <strong>🎲 Surprise me</strong> rolls one, <strong>Start over</strong> goes back to plain, <strong>Use for this character</strong> keeps it. It's the same screen as on your other replicant matrix, drawn the same way, so the party looks alike on both.</p>
<p><strong>Saved characters.</strong> <strong>💾 Save this character</strong> keeps the name, class, the one thing about them, plot armour and the look on your other replicant matrix, beside the saved campaigns. Next time, pick them under <strong>Saved characters</strong>. <strong>Delete this character</strong> asks first (<strong>Delete for good</strong> or <strong>Keep it</strong>). Nothing is saved on this phone.</p>
<p><strong>Your turn.</strong> You get <strong>action cards</strong>, only the ones that fit the scene: ⚔ Attack, 🛡 Defend, 🤫 Sneak, 💬 Talk, ✨ Magic, 🎒 Use item, 🔍 Look closer, 🤝 Help an ally, 🏃 Run and ✍ Something else. Some open a second card with the details (which attack, which spell, who to talk to); every second card has <strong>← Back</strong>. Then <strong>How does it play out?</strong> asks for a line of flair: add one (a good line earns +2) and tap <strong>🎲 Roll it</strong>, or <strong>Skip the flair</strong>. Bobs don't get cards; they just say what they do. The app rolls for everyone: a d20 plus a stat; 15 or more is a hit, 10 to 14 a hit at a cost, under 10 a miss. Five <strong>hearts</strong> each; at zero with no plot armour you choose <strong>Go out in style</strong> or <strong>Wake up captured</strong>.</p>
<p><strong>📖 Characters</strong> (on the start card and at the table) is the bestiary, four tabs: <strong>🧍 You</strong> (your saved heroes: <strong>➕ New character</strong>, <strong>Edit</strong>, each with the character screen and <strong>Save this character</strong>, <strong>Delete this character</strong>), <strong>👥 Party</strong> (who's at the table now, or was last game, with hearts, kit and spells), <strong>📖 Met</strong> (everyone and everything the game master has named in a scene; your other Bob draws each one the moment they're named, people from their name, creatures by their kind; between games it holds every meeting across your campaigns, with <strong>Forget</strong>) and <strong>⚔ Enemies</strong> (the usual dozen: Goblin, Skeleton, Wolf, Bandit, Giant rat, Giant spider, Orc, Cultist, Slime, Ghost, Troll, Dragon, each with its hearts, how it attacks and the thing to know; the game master uses those as written and invents the rest). The character screen has monster bodies too, Big humanoid, Beast, Crawler and Blob, with a Hide colour, for heroes who aren't people. All of it lives on your other replicant matrix; the phone shows it.</p>
<p><strong>Journal, Pause, End.</strong> 📓 Journal shows the story so far and the scenes. ⏸ Pause lets the game master brain go; ▶ Resume carries on. 🏁 End game finishes it; the campaign stays under <strong>Continue a campaign</strong> on the start card, where Delete takes it away for good. Games are saved on your other replicant matrix, never on this phone.</p>`
    },
    {
      id: 'games', title: 'Games',
      html: `<p>Menu, <strong>Games</strong>: small games your other Bob plays with you. <strong>Twenty questions</strong> (one of us thinks of something, the other asks yes-or-no questions), <strong>Hangman</strong> (a word from a shelf, a letter at a time, seven wrong guesses and it drops), <strong>Word ladder</strong> (climb from one four-letter word to another, one letter a step, real words only), <strong>Five letters</strong> (guess the five-letter word in six tries; each try colours the letters: green right spot, yellow in the word somewhere else, grey not in it) and <strong>Story dice</strong> (six picture dice; we tell a story a line each until every die is in it).</p>
<p>The app on your other replicant matrix runs the game: it picks the secret word, checks every guess, counts the lives and keeps the score. His quick brain only talks, so the games play fine on a small brain and even while he's in a Gaming session. The phone draws the same board and sends the same moves; the phone brain is never used for a game, so a Bob on your Bob-Net has to be reachable. Nothing loads until you press <strong>▶ Start</strong>, and the brain is let go when the game ends.</p>
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
      html: `<p>When a Bob on your Bob-Net finishes a bigger job well, he may offer to keep the steps as a how-to, and the card shows up here too. Tap <strong>Save how-to</strong> (you can rename it first) or <strong>Not now</strong>. Next time you ask for something like it, he follows those steps. He only offers when <strong>Let Bob learn how-tos</strong> is on in his Settings. Changing a how-to is done on your other replicant matrix, in Settings, 🧰 Tools and how-tos Bob made; here you can look at them and delete them (see Tools and how-tos Bob made).</p>`
    },
    {
      id: 'own-kit', title: 'Tools and how-tos Bob made',
      html: `<p>Settings, <strong>Tools and how-tos Bob made</strong> shows what a Bob on your Bob-Net made for himself: the <strong>tools</strong> he wrote (small programs, only with Make his own tools on in his Settings) and the <strong>how-tos</strong> he kept (the steps of jobs that went well). Each tool says what it does, what it can change and whether it uses the internet.</p>
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
      id: 'glossary', title: 'Glossary',
      html: `<dl>
<dt>Bob on your network</dt><dd>A Bob running on one of your replicant matrices that lets this phone in. He does the heavy lifting.</dd>
<dt>Phone brain</dt><dd>A small AI model that runs on this phone, without the internet.</dd>
<dt>Chest</dt><dd>The newest things your other Bob made, shown as little pictures with names. Menu, Chest here; under Bob on Equip Bob on your other replicant matrix.</dd>
<dt>Tailscale</dt><dd>A free app that makes a private, scrambled link between your own devices, wherever they are.</dd>
<dt>Model family</dt><dd>Models made by the same team and built the same way, like Qwen or Gemma. One family comes in many sizes, from phone-sized to big. Under Phone brain each family has its own header you open and close.</dd>
<dt>Replicant matrix</dt><dd>What I call the computer a Bob runs on. Here that's this replicant matrix (this phone); your other Bobs each live on their own, like your other replicant matrix at home. It's still your computer or phone; it's just my name for it.</dd>
<dt>Passcode</dt><dd>The code you make on your other replicant matrix under Let my other replicant matrices in (or on the phone under Lend my brain). It proves the device asking is yours.</dd>
<dt>Lend my brain</dt><dd>This phone thinks quick replies for your other Bobs. They send words; the phone sends words back. The phone only thinks: no tools, files or programs run here for them, and nothing is kept.</dd>
<dt>Borrowed brain</dt><dd>What your other replicant matrix calls it when another of your replicant matrices thinks a reply for him.</dd>
<dt>Effort</dt><dd>How hard a Bob on your network works on an answer: bigger brains and checking at higher levels.</dd>
<dt>Pinned download</dt><dd>A download from one exact version of a file, checked against its fingerprint (checksum), so nobody can swap it.</dd>
<dt>Free memory when idle</dt><dd>The phone brain unloads after a quiet spell, so the phone stays quick.</dd>
<dt>Introduced</dt><dd>Paired through a third Bob of yours that has Pass my Bob-Net along on: he tells this phone and another Bob each other's name and address, and they pair with no card.</dd>
<dt>Game master</dt><dd>Your other Bob, when he runs an Adventure: he sets the scenes, plays everyone who isn't at the table, and says what the dice mean. The phone brain can't be one.</dd>
<dt>Hearts</dt><dd>A character's health in an Adventure. A miss can cost one; at zero hearts you choose Go out in style or Wake up captured.</dd>
<dt>Plot armour</dt><dd>How safe a character is from bad dice in an Adventure: None, Some, Lots or Legendary. Asked for every character at the start of every game.</dd>
<dt>Bestiary</dt><dd>The 📖 Characters page in an Adventure: your saved heroes (You), the table (Party), everyone the game master has named (Met, drawn as they appear) and the usual enemies with their hearts (Enemies).</dd>
<dt>Character screen</dt><dd>Where you build a look from parts (body, hair, outfit, armour, weapon and so on) for your Adventure character. The parts are the same ones my own avatars are drawn from, so it blinks and talks like any look.</dd>
<dt>Action card</dt><dd>One of your choices on your turn in an Adventure (Attack, Talk, Magic, Use item and so on). Some open a second card with the details. Bobs don't get cards; they just say what they do.</dd>
<dt>Twenty questions</dt><dd>One of us thinks of something; the other asks yes-or-no questions, twenty at most, then guesses.</dd>
<dt>Shelf</dt><dd>A list of Hangman words on one subject (Animals, Food and drink, Around the house, Out of doors, Jobs people do, Things that move), or Any shelf.</dd>
<dt>Word ladder</dt><dd>Climb from one four-letter word to another, changing one letter a step; every rung must be a real word.</dd>
<dt>Five letters</dt><dd>Guess a five-letter word in six tries. Each try colours its letters: green right spot, yellow in the word elsewhere, grey not in it.</dd>
<dt>Story dice</dt><dd>Six picture dice come up; we tell a story a line each until every die is in it. Always a shared point.</dd>
<dt>Help bundle</dt><dd>One file from Save a help bundle (Settings, Save a help bundle): my logs, errors, last chats, settings without their secrets and this replicant matrix's facts, with a HANDOFF.md on top. I never send it anywhere.</dd>
<dt>Handoff file (HANDOFF.md)</dt><dd>The first file in a help bundle, written for whoever helps (a person or an AI agent): what I am, my exact version and public code, what's wrong as far as I can tell, and what to try first.</dd>
<dt>OK card</dt><dd>A Bob on your network asking before he does something outside his own folder.</dd>
</dl>`
    },
    {
      id: 'faq', title: 'Questions and fixes',
      html: `<table>
<tr><th>What happens</th><th>What to do</th></tr>
<tr><td>The chest is empty or says no Bob is reachable</td><td>The chest is your other Bob's Made by Bob list, so it needs him on Tailscale. Once he's reachable, open the menu and tap Chest again.</td></tr>
<tr><td>The pill says Nobody home</td><td>Tap it. Usually your other replicant matrix is asleep, or Tailscale is off on the phone or your other replicant matrix.</td></tr>
<tr><td>"Isn't letting other replicant matrices in yet"</td><td>On your other replicant matrix: Bob's Settings, Bob-Net, Let my other replicant matrices in. Turn it on, then restart Bob on your other replicant matrix.</td></tr>
<tr><td>"That isn't a Tailscale address"</td><td>Use the address your other replicant matrix's Let my other replicant matrices in setting shows: a name ending in .ts.net, or a number starting 100.</td></tr>
<tr><td>Your other replicant matrix says the phone didn't answer in time</td><td>The first borrowed reply is the slow one: the phone reads my whole instructions and tool list once. After that it only reads what's new. If it keeps happening, check Bob-Net, Lend my brain for a reason (warm, low battery, in use), and tap Open battery settings there.</td></tr>
<tr><td>Can your other replicant matrix borrow the phone while I game?</td><td>Yes: that's what Lend my brain is for. Turn it on here, then on your other replicant matrix: Settings, Bob-Net, Borrow a brain. Keep the phone on its charger with the screen off.</td></tr>
<tr><td>Can my Bobs introduce each other?</td><td>Yes, if you ask them to. Turn on Pass my Bob-Net along under Bob-Net here, and the same switch on the Bobs on your other replicant matrices (Settings, Bob-Net, What they share). A Bob paired with two of them tells each the other's name and address, and those two pair with no card. The phone only answers; Lend my brain has to be on here for the introduction to get in.</td></tr>
<tr><td>It asks for the passcode again</td><td>The passcode was changed on your other replicant matrix. Type the new one under Bob-Net.</td></tr>
<tr><td>The phone brain is slow or stops</td><td>Close big apps (games, the camera), let the phone cool down, or try Test speed. Gemma 4 E2B is the quicker one.</td></tr>
<tr><td>The download stopped</td><td>Tap Resume. It carries on where it stopped. If it says the checksum didn't match, the file was damaged on the way and was deleted: download it again on Wi-Fi.</td></tr>
<tr><td>Pictures don't show</td><td>Very big files stay on your other replicant matrix; they're in Made by Bob there.</td></tr>
<tr><td>Can the phone brain see pictures?</td><td>Not yet on the phone. Send them to a Bob on your network for now.</td></tr>
<tr><td>Can the phone brain run an Adventure?</td><td>No: it's too small to be game master. The table lives on your other replicant matrix; the phone shows it and plays your turns. Get your other Bob on Tailscale and open Adventure here.</td></tr>
<tr><td>Can my Adventure character look different from Bob?</td><td>Yes. On the start card, under Looks like, tap 🧍 Change the look and build one from parts: any body, hair, outfit, armour and weapon. It's your character's look, saved with the game and under Saved characters; my own avatar doesn't change.</td></tr>
<tr><td>How tough are the enemies in an Adventure?</td><td>The usual dozen are on the Enemies tab of 📖 Characters with their hearts: a giant rat has one, a goblin two, an orc four, a dragon six. The game master uses those as written and takes hearts off them as the story goes; anything else he invents, and a boss simply has more. Whoever he brings on lands on Met, drawn.</td></tr>
<tr><td>Can the phone brain play the games?</td><td>No. The app on your other replicant matrix runs them and his quick brain talks; the phone shows the board and sends your moves. Get your other Bob on Tailscale and open Games here.</td></tr>
<tr><td>How do I get help with my Bob?</td><td>First try the rows above, then ask me in the chat. If I'm the one not working, Settings, Save a help bundle: one file with my logs, errors, last chats and this replicant matrix's facts, with your name, passcodes, keys and Tailscale addresses taken out, written for a helper (a person or an AI agent) to read first. Paste it to the agent you use, or open an issue at github.com/MouseWurX/Bob/issues with it attached and a line about what you saw. Bob is free software made by volunteers, so an issue is a request, not a ticket; the bundle makes it one that can be answered. See Save a help bundle.</td></tr>
<tr><td>Can I use the phone away from home?</td><td>Yes, as long as your other replicant matrix is on and Tailscale is on at both ends. Without that, the phone brain can still chat.</td></tr>
</table>`
    }
  ]
};
