// Help for Bob on Android, in Bob's voice: every screen and setting, a glossary and an FAQ.
// test/run-android-test.js checks every setting on the page has a section here.
globalThis.BobHelp = {
  sections: [
    {
      id: 'start', title: 'Getting started',
      html: `<p>I'm the pocket edition of Bob. On the phone I can do two things:</p>
<ul><li><strong>Talk to a Bob on your network.</strong> That's your other replicant matrix's Bob (or any other Bob you add). He has the big brains and all the tools, and I pass your messages along and show you what he makes.</li>
<li><strong>Think on the phone.</strong> A small brain right here, for when no other Bob is reachable. Chat and memory only. It's off until you switch it on.</li></ul>
<p>To set up the first one: on your other replicant matrix, open my Settings and turn on <strong>Let my other replicant matrices in</strong>. It shows an address and a passcode. Here, open the menu, <strong>Bobs on your network</strong>, add that address, type the passcode and tap <strong>Log in</strong>. Both your other replicant matrix and the phone need Tailscale switched on.</p>`
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
      id: 'bobs', title: 'Bobs on your network',
      html: `<p>Menu, <strong>Bobs on your network</strong>. Add a Bob with a name and his Tailscale address: either the name ending in <code>.ts.net</code> or the number starting <code>100.</code>, as your other replicant matrix's <strong>Let my other replicant matrices in</strong> setting shows it. Then type his passcode and tap <strong>Log in</strong>.</p>
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
      html: `<p>Phone brain, <strong>Lend my brain</strong> (off to start with). With it on, your other Bobs can ask this phone to think quick replies for them. The main use: while you're gaming on your other replicant matrix, I think his small replies here, so your other replicant matrix's processor and graphics card stay with the game.</p>
<p>Only words travel. The other Bob sends the chat and the list of tools he has; I send back words, or "please run this tool". The tool runs on his side, with his own checks and OK cards. The phone only thinks: no tools, files or programs run here for them, and nothing is kept: not the chat, not a log of it. The only line I keep is "Thought a reply for (that Bob) in so many seconds".</p>
<p>To set it up:</p>
<ul><li>Turn on <strong>Lend my brain</strong>. The first time, I make the passcode for you and show it once under <strong>Passcode</strong>: type it into your other Bob straight away. Android shows a notification for as long as lending is on; <strong>Stop lending</strong> on it turns it off.</li>
<li>On your other replicant matrix: Settings, <strong>Show advanced settings</strong>, <strong>Connections</strong>, <strong>Bob-Net: share work with my other Bobs</strong>, <strong>Borrow a brain</strong>. Add the <strong>Address for your other Bobs</strong> shown here, and the passcode.</li></ul>
<p>I use the phone brain picked above (<strong>Use this one</strong>). I say no, and the other Bob thinks for himself, when: you're using the phone for something else, the phone is warm, the battery is under 25% and not charging, or the phone brain is busy with your own chat. Only Tailscale devices that know the passcode get in, and only on this phone's Tailscale address. <strong>Make a new passcode</strong> signs out every Bob that used the old one.</p>
<p><strong>Let Bob work with the screen off</strong>: Android may stop apps answering when the screen is off. <strong>Open battery settings</strong> takes you to Android's list; pick Bob and allow him.</p>
<p>The first borrowed reply is slow, because I read his instructions and tools once. After that I keep them in mind and only read what's new, so replies start much sooner.</p>`
    },
    {
      id: 'memory', title: 'What Bob remembers',
      html: `<p>Menu, <strong>What Bob remembers</strong>: lasting facts for the phone brain, one per line, yours to edit. It's used from the next new chat. It stays on this phone; your other replicant matrix's Bob keeps his own memory file. Don't put passwords in it.</p><p>If <strong>Remember only what fits</strong> is on in your other replicant matrix's Settings (Show advanced settings, Engines &amp; speed), then while I can reach your other replicant matrix, the Bob there hands me the few lines of his memory that fit what you just asked, for that one reply. I keep none of them. With your other replicant matrix out of reach, I make do with this phone's list.</p>`
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
      html: `<p>When I'm in the background and a Bob on your network needs your OK, or has a check-in for you, Android shows a notification. The first time, Android asks if that's all right. Tap the notification to come back to me.</p><p>Check-ins are set up on your other replicant matrix (Settings, Show advanced settings, 🔔 Check-ins). The phone only shows them.</p>`
    },
    {
      id: 'howtos', title: 'How-tos',
      html: `<p>When a Bob on your network finishes a bigger job well, he may offer to keep the steps as a how-to, and the card shows up here too. Tap <strong>Save how-to</strong> (you can rename it first) or <strong>Not now</strong>. Next time you ask for something like it, he follows those steps. He only offers when <strong>Let Bob learn how-tos</strong> is on in his Settings. Changing or deleting how-tos is done on your other replicant matrix, in Settings, 📒 How-tos.</p>`
    },
    {
      id: 'privacy', title: 'Privacy',
      html: `<p>Everything on the phone stays on the phone: chats, my memory file and the phone brain. Android's cloud backup is told to leave them out. I only talk to the Bobs you add (over Tailscale) and, when you say yes to a download, to huggingface.co for the phone brain. With <strong>Lend my brain</strong> on, your own Bobs send the chat so far and what they remember about you. The phone thinks a reply and keeps none of it. No tracking, no ads, nothing else.</p>`
    },
    {
      id: 'glossary', title: 'Glossary',
      html: `<dl>
<dt>Bob on your network</dt><dd>A Bob running on one of your replicant matrices that lets this phone in. He does the heavy lifting.</dd>
<dt>Phone brain</dt><dd>A small AI model that runs on this phone, without the internet.</dd>
<dt>Tailscale</dt><dd>A free app that makes a private, scrambled link between your own devices, wherever they are.</dd>
<dt>Replicant matrix</dt><dd>What I call the computer a Bob runs on. Here that's this replicant matrix (this phone); your other Bobs each live on their own, like your other replicant matrix at home. It's still your computer or phone; it's just my name for it.</dd>
<dt>Passcode</dt><dd>The code you make on your other replicant matrix under Let my other replicant matrices in (or on the phone under Lend my brain). It proves the device asking is yours.</dd>
<dt>Lend my brain</dt><dd>This phone thinks quick replies for your other Bobs. They send words; the phone sends words back. The phone only thinks: no tools, files or programs run here for them, and nothing is kept.</dd>
<dt>Borrowed brain</dt><dd>What your other replicant matrix calls it when another of your replicant matrices thinks a reply for him.</dd>
<dt>Effort</dt><dd>How hard a Bob on your network works on an answer: bigger brains and checking at higher levels.</dd>
<dt>Pinned download</dt><dd>A download from one exact version of a file, checked against its fingerprint (checksum), so nobody can swap it.</dd>
<dt>Free memory when idle</dt><dd>The phone brain unloads after a quiet spell, so the phone stays quick.</dd>
<dt>OK card</dt><dd>A Bob on your network asking before he does something outside his own folder.</dd>
</dl>`
    },
    {
      id: 'faq', title: 'Questions and fixes',
      html: `<table>
<tr><th>What happens</th><th>What to do</th></tr>
<tr><td>The pill says Nobody home</td><td>Tap it. Usually your other replicant matrix is asleep, or Tailscale is off on the phone or your other replicant matrix.</td></tr>
<tr><td>"Isn't letting other replicant matrices in yet"</td><td>On your other replicant matrix: Bob's Settings, Show advanced settings, Connections, Let my other replicant matrices in. Turn it on, then restart Bob on your other replicant matrix.</td></tr>
<tr><td>"That isn't a Tailscale address"</td><td>Use the address your other replicant matrix's Let my other replicant matrices in setting shows: a name ending in .ts.net, or a number starting 100.</td></tr>
<tr><td>Your other replicant matrix says the phone didn't answer in time</td><td>The first borrowed reply is the slow one: the phone reads my whole instructions and tool list once. After that it only reads what's new. If it keeps happening, check Phone brain, Lend my brain for a reason (warm, low battery, in use), and tap Open battery settings there.</td></tr>
<tr><td>Can your other replicant matrix borrow the phone while I game?</td><td>Yes: that's what Lend my brain is for. Turn it on here, then on your other replicant matrix: Settings, Show advanced settings, Connections, Bob-Net: share work with my other Bobs, Borrow a brain. Keep the phone on its charger with the screen off.</td></tr>
<tr><td>It asks for the passcode again</td><td>The passcode was changed on your other replicant matrix. Type the new one under Bobs on your network.</td></tr>
<tr><td>The phone brain is slow or stops</td><td>Close big apps (games, the camera), let the phone cool down, or try Test speed. Gemma 4 E2B is the quicker one.</td></tr>
<tr><td>The download stopped</td><td>Tap Resume. It carries on where it stopped. If it says the checksum didn't match, the file was damaged on the way and was deleted: download it again on Wi-Fi.</td></tr>
<tr><td>Pictures don't show</td><td>Very big files stay on your other replicant matrix; they're in Made by Bob there.</td></tr>
<tr><td>Can the phone brain see pictures?</td><td>Not yet on the phone. Send them to a Bob on your network for now.</td></tr>
<tr><td>Can I use the phone away from home?</td><td>Yes, as long as your other replicant matrix is on and Tailscale is on at both ends. Without that, the phone brain can still chat.</td></tr>
</table>`
    }
  ]
};
