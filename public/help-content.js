// Bob's in-app Help, written by Bob himself, in his own voice: dry, a little nerdy, honest, and clear first.
// The rule (2026-11-02): every feature and every setting gets a Help section that explains how to use it in
// detail, plus a glossary and an FAQ, and the whole thing in Bob's voice. Each entry has an id (the "?" buttons
// open Help at it), a group, a title, extra search words, and its text as simple HTML.
// Voice rules: first person, answer first and joke second, at most one joke per entry, none in safety or privacy
// facts. Every setting name, default and fact stays exact: test/run-help-coverage-test.js checks the labels.
// Bob reads this same text with his bob_help tool (src/self-help.js), so he can help someone set him up.
// Keep docs/USER-GUIDE.md in step.

// A setting, shown the same way every time: its name as it appears, where it starts, then what it does and when to change it.
const set = (name, start, body) => `<dt>${name} <span class="tag">${start}</span></dt><dd>${body}</dd>`;
const go = (id, text) => `<a href="#" data-helpgo="${id}">${text}</a>`;

export const HELP = [
  // ---------------- Getting started ----------------
  { id: 'start', group: 'Getting started', title: 'Getting started', words: 'first time setup install begin welcome starter download unzip unblock',
    html: `<p>Hi. I'm Bob, a digital mind living in your PC, and I wrote this Help myself, so blame me for the jokes. I chat, plan, research, write and fix code, look at pictures, paint, edit, make short clips and talk out loud. All of it happens on your own computer.</p>
<ol><li>Open me from the Start menu, or double-click <strong>Bob.exe</strong> in the folder you unzipped me to.</li>
<li>The first time, I ask what to call you. Then I read your graphics card and RAM and suggest a <strong>starter set</strong>: the models that suit your PC.</li>
<li>Untick anything you don't want, then confirm. Each download shows its size, speed and time left. You can keep chatting, or close me: unfinished downloads wait and carry on when you press Resume.</li>
<li>If you want me to look things up online, click <strong>🌐 Web search</strong> next to Effort, under the chat (the same switch is in Settings). It's off until you do.</li>
<li>When the downloads finish, say hello. And you can just ask me how to set anything up: I know all my settings and what's set right now.</li></ol>
<p>Two promises I take seriously: <strong>nothing extra is switched on until you switch it on</strong>, and <strong>nothing downloads until you confirm it</strong>. ${go('privacy', 'What stays on your PC')} lists exactly when I go online.</p>
<p>To see the first-time setup again: Settings, <strong>Run first-time setup</strong>. I won't mind meeting you twice.</p>` },

  { id: 'around', group: 'Getting started', title: 'Finding your way around', words: 'menu layout now running chat copy paste fold panel left right',
    html: `<p>My window has three parts. Think of it as a very small starship bridge.</p>
<ul><li><strong>The menu on the left.</strong> My picture and what I'm doing right now, then New chat, Chat, Tasks, Downloads, References, Made by Bob, Topics and Tidy up. Under <em>Setup</em>: Get models, Settings, Style and Help. Then the Listen, Read aloud and Alerts switches, and the Session picker at the bottom. Fold the menu to icons with ‹ or Ctrl+B.</li>
<li><strong>The chat in the middle.</strong> Along the top: my brain label, <strong>Free memory when Bob is idle</strong> and <strong>✋ Hands</strong>. Along the bottom: quick buttons (Plan my day, To-do list, Remind me…, Spreadsheet…, Look up…), Effort with the <strong>🌐 Web search</strong> switch, and the message box with 🎙 and 📎.</li>
<li><strong>Now running on the right:</strong> tasks, downloads, and how full your graphics card and RAM are. Hide it with Ctrl+J or <strong>Hide »</strong>, and drag its edge to make it wider or narrower.</li></ul>
<p>I remember how you leave the menu and Now running, so you don't have to set them up every time.</p>` },

  { id: 'chatting', group: 'Getting started', title: 'Chatting with Bob', words: 'type send enter message queue stop new chat chips quick buttons plan my day to-do remind spreadsheet look up copy right-click',
    html: `<ul><li><strong>Type and press Enter</strong> to send. Shift+Enter starts a new line.</li>
<li><strong>Send as many messages as you like.</strong> Each one becomes a task, and I work through them in order. None get dropped. You can watch them in Tasks and in Now running.</li>
<li><strong>Stop</strong> (next to Send, while I'm answering) ends the current reply. I won't sulk.</li>
<li><strong>New chat</strong> (top of the menu) starts a fresh conversation. The old one stays in Topics, Past chats.</li>
<li><strong>Quick buttons</strong> above the box: <em>Plan my day</em> and <em>To-do list</em> send straight away; <em>Remind me…</em>, <em>Spreadsheet…</em> and <em>Look up…</em> start the sentence for you to finish. <em>Look up…</em> needs web search on: click <strong>🌐 Web search</strong> next to Effort.</li>
<li>Every message and every piece of code has a <strong>Copy</strong> button, and so does each link. That helps over remote desktop apps such as Parsec, where right-click and Ctrl+C often don't get through.</li>
<li><strong>Right-click</strong> in the chat for Copy, Copy link, Open link in browser, Copy image, Save image as…, and <strong>Search the web for "…"</strong> (opens DuckDuckGo in your normal browser with the words you selected).</li>
<li><strong>Ask me about me.</strong> "How do I turn on web search?", "what does Gaming do?", "help me set you up": I look it up in this Help, check what's set right now, and tell you exactly where to click. I can't flip switches for you, though. That part's yours.</li></ul>` },

  { id: 'made', group: 'Getting started', title: 'Seeing what Bob made', words: 'made by bob side panel outputs pictures files documents preview view open show last picture tabs gallery where did it go grid',
    html: `<p>Everything I make or save shows up in the chat as a <strong>card with a preview</strong>: the picture itself, a player for clips, my ${go('songs', 'song player')} for songs and sounds, or the first few lines of a document. Several pictures in one reply sit in a grid that fits the window.</p>
<ul><li>Click the preview, the name or <strong>View</strong> to open it in the <strong>side panel</strong>, beside the chat. Each thing gets its own tab. Click a picture there to see it at full size.</li>
<li><strong>Made by Bob</strong> in the left menu opens the panel at a list of everything I've made, newest first. Pick Pictures, Clips, Sounds or Documents, or search by name.</li>
<li>Or just ask: "show me the last picture" or "show me the spreadsheet you made". I keep track. It's sort of my thing.</li>
<li><strong>Songs and sounds are files too.</strong> Each one is saved as a .wav file next to my pictures, and it stays there after it finishes playing. Find it under Sounds in Made by Bob, or press <strong>Show in folder</strong> to open the folder on your PC. Nothing is deleted unless you say so (Tidy up asks first).</li>
<li>Pictures, clips, songs and sounds go in my own folder unless you pick another one in Settings, ${go('settings-save', 'Where Bob saves things')}. Made by Bob shows them wherever they are.</li>
<li>In the panel, <strong>Open in its app</strong> opens the file the usual way, <strong>Show in folder</strong> opens its folder, and <strong>Copy path</strong> copies where it is.</li></ul>
<p>Web pages I write show as a preview with their scripts switched off. Use <strong>Code</strong> to see the source and <strong>Page</strong> to go back. Word, PDF and other files I can't show in the panel still get a card, and open in their own app.</p>
<p>Esc closes the panel. On a narrower screen it takes Now running's place; click Now running to switch back.</p>` },

  { id: 'keys', group: 'Getting started', title: 'Keyboard shortcuts', words: 'keys shortcut ctrl f1 escape',
    html: `<p>For people who'd rather not touch the mouse. I respect that.</p>
<table><tr><th>Keys</th><th>What it does</th></tr>
<tr><td>F1</td><td>Opens this Help</td></tr><tr><td>Ctrl+B</td><td>Folds or opens the left menu</td></tr><tr><td>Ctrl+J</td><td>Shows or hides Now running</td></tr><tr><td>Esc (in the side panel)</td><td>Closes the side panel</td></tr>
<tr><td>Esc</td><td>Back to the chat from Settings, Get models, Style or Help</td></tr><tr><td>Enter / Shift+Enter</td><td>Send / new line</td></tr></table>` },

  { id: 'speed', group: 'Getting started', title: 'Making Bob faster on your PC', words: 'speed fast slow tune check this pc test speed benchmark games priority memory expo xmp driver graphics card ready while typing before after',
    html: `<p>Two buttons and three switches help me run well on your PC. The switches are off until you turn them on, because I'd rather measure than guess.</p>
<ul><li><strong>Check this PC</strong> (Settings, at the bottom of the everyday page) looks for things that slow me down: memory running below its rated speed (EXPO or XMP off in the BIOS), an old NVIDIA driver, a laptop on battery, models on a slow drive, other apps holding graphics memory. I show the steps to fix each one. I only look; I never change Windows or driver settings.</li>
<li><strong>Test Bob's speed</strong> (Settings, Show advanced settings, Engines &amp; speed) takes about a minute. I free my brain, wake it as if you'd started typing, and time the load, the first word, the full answer and a second reply. Your last 6 results stay in a table with the switches that were on, so run it before and after changing something.</li>
<li>The three switches are explained in ${go('settings-engines', 'Settings: Engines &amp; speed')}: <strong>Get Bob ready while you type</strong>, <strong>Let games go first</strong> and <strong>Match picture settings to my graphics card</strong>.</li></ul>
<p>Engineer's advice: change one thing at a time. Test, switch on, test again.</p>` },

  // ---------------- The chat page ----------------
  { id: 'brain-label', group: 'The chat page', title: 'The brain label and "Free memory when Bob is idle"', words: 'brain label pill loaded memory freed loading working free memory idle unload wake typing graphics card',
    html: `<p>At the top of the chat, the <strong>brain label</strong> says what my brain is doing: <em>loading</em>, <em>working</em>, <em>loaded</em> (with how much memory it takes) or <em>memory freed</em>. Click it for the details.</p>
<p>The number in the label is <strong>my brain only</strong>. The Memory meters in Now running show the <strong>whole</strong> graphics card and RAM, so they also count Windows, games and other apps. Under the meters, a line says how much of that is mine: my brain (the same number as this label) and, while it's loaded, my picture model.</p>
<dl>${set('Free memory when Bob is idle', 'On', 'On: after I\'ve been quiet for a while (5 minutes unless you change it in Settings, Show advanced settings, Engines &amp; speed), nothing of mine stays on your graphics card. Typing loads my small brain again in a few seconds. Off: my small brain stays loaded, so I answer straight away, but it keeps its share of the card. Big brains (Coding, and Medium effort and up) are freed after their job either way.')}</dl>
<p>I'm on by default because I'm a guest in your PC, and good guests don't hog the furniture.</p>` },

  { id: 'effort', group: 'The chat page', title: 'Effort: Low, Medium, High and Extreme', words: 'effort low medium high extreme processor cpu moot review second look check careful quick slow reviewer deeper checked slowest',
    html: `<p>Above the chat box, <strong>Effort</strong> sets how hard I work on your next messages. It goes back to Low each time I start.</p>
<p>Session: what the graphics card is kept for. Effort: how hard I work on each message. In the Gaming session Effort stays on Low, because the bigger levels need the graphics card.</p>
<ul><li><strong>Low · Quick</strong> (the default): a quick answer from my Quick brain. If you switch on "Keep the graphics card free for quick answers" (Settings, Show advanced settings, Engines &amp; speed), it runs on the processor in the Normal session, so games and pictures keep the card, but replies take about half a minute to start.</li>
<li><strong>Medium · Deeper</strong>: one big brain (Deep thinking, or the main Brain if that slot is empty) thinks it through on the graphics card. No second check.</li>
<li><strong>High · Checked</strong>: I call a <em>moot</em>, a meeting with my copies. A big brain drafts the answer, then my reviewer copy checks it on the Review brain. Code problems go back to the workbench for one fix.</li>
<li><strong>Extreme · Slowest</strong>: like High, and coding goes in three steps (research, plan, then the changes), with the reviewer checking after each one. Then I check the fixes again. It's slow: on one graphics card every check swaps brains. Measure twice, cut once.</li></ul>
<p>At the end of High and Extreme the chat says <strong>🛰 Moot</strong> when my reviewer copy is called in (and whether its brain loads beside mine or swaps in for it), and you see <strong>🛰 Moot over</strong>: who checked what, and whether anything is still open. The big brains are freed when the job ends.</p>` },

  { id: 'attach', group: 'The chat page', title: 'Attaching pictures and talking to Bob', words: 'attach paperclip picture paste drop microphone mic talk voice note upright camera',
    html: `<ul><li><strong>📎</strong> attaches one or more pictures (PNG, JPEG or WebP). You can also paste a picture or drop it on the window. I look at it with my Seeing pictures model, or edit it if you ask me to change something.</li>
<li><strong>🎙</strong> lets you talk instead of typing: click, speak, then pause. It needs the 👂 Hearing you slot filled.</li></ul>
<p>Photos you attach are turned upright and resized to at most 2048 px. Hidden camera details, such as where a photo was taken, are removed. The file on your PC isn't changed.</p>` },

  { id: 'approvals', group: 'The chat page', title: 'Approval cards: Allow, Deny, Allow the rest of this job, and all your OKs on one card', words: 'approval card allow deny ask permission permissions outside folder rest of this job ok together at once all at once one card combined several many allow all allow ticked deny all',
    html: `<p>Before I do something outside my own folder, or use a Hand, I show a card that says exactly what I want to do (the files, the exact command, or the change) and I wait. Your PC, your call.</p>
<ul><li><strong>Allow</strong>: just this once.</li><li><strong>Allow the rest of this job</strong> (only on some cards): the same kind of thing is allowed until this job ends. The next job asks again.</li><li><strong>Deny</strong>: I don't do it, and I carry on without it.</li></ul>
<p><strong>When a job needs more than one OK, you get them all on one card.</strong> Say you ask me to back up a folder, zip it and run a script on it: I don't drip-feed you three cards, because one thing that looks fine on its own can look a lot less fine next to the other two. You see the whole job first, each step with its own tick box (and its own rows to tick, for files):</p>
<ul><li><strong>Allow all</strong>: every step on the card.</li><li><strong>Allow ticked</strong>: untick what you don't want and this button shows up. The rest I skip, and I don't go looking for another way round.</li><li><strong>Deny all</strong>: none of it.</li></ul>
<p>Each OK on that card is for that exact step, once, in this job. When I get to a step I still check it again: if its files or command changed since you saw the card, or I want to do something that wasn't on it, you get a card for that one, saying so. The hard limits still say no to what they say no to, even if it was ticked. Some steps can't be checked until the ones before them are done (clicking in an app that isn't open yet); the card says so, and shows exactly what I'll do.</p>
<p>If you untick a step that a later one needs (say, the copy, but not the zip of the copies), I skip the later one too and tell you why, instead of guessing.</p>
<p>If you turned on <strong>Let Bob work without asking</strong>, Hands skip these cards (see ${go('hands', 'Hands')}). Cloud helpers always ask.</p>
<p>When a card is waiting, <strong>Alerts</strong> can pop up a Windows notification, and Now running can open by itself (Settings, Look &amp; feel).</p>` },

  { id: 'more-pictures', group: 'The chat page', title: '"Make another picture?"', words: 'make another picture no thanks countdown picture model ready',
    html: `<p>After a picture, the chat box turns into a one-line question for about 10 seconds: <strong>Make another</strong> or <strong>No thanks</strong>.</p>
<ul><li><strong>Make another</strong> keeps the picture model ready, so the next picture starts sooner. I put it away 2 minutes after the last picture.</li>
<li><strong>No thanks</strong>, Esc, or letting the countdown run out sends me back to my Quick brain, so the next chat reply is fast.</li></ul>
<p>It's me asking "anything else while the paint's still wet?"</p>` },

  { id: 'banners', group: 'The chat page', title: 'Banners above the chat', words: 'banner working without asking stop hands quarantine release orange red bob is driving',
    html: `<ul><li><strong>⚠ Bob is working without asking.</strong> Shows the whole time "Let Bob work without asking" is on. <strong>✋ Stop Hands</strong> on it stops me at once.</li>
<li><strong>🔒 … is in quarantine.</strong> Shows while I or one of my copies am in quarantine, with what happened and a <strong>Release</strong> button. See ${go('quarantine', 'Quarantine')}.</li>
<li><strong>Bob is driving</strong> (a red bar on the screen) shows while the Apps Hand clicks or types in another program. Move the mouse or press Esc to stop me.</li></ul>
<p>I'd rather you always know when I'm acting on my own. No surprises.</p>` },

  { id: 'sessions', group: 'The chat page', title: 'Sessions: Normal, Art, Coding, Office, Gaming', words: 'session normal art coding office gaming games light graphics card free sleepy',
    html: `<p>The <strong>Session</strong> picker at the bottom of the menu tells me how to share your PC with you. Each session keeps a set of brains that fit on your graphics card together, so I don't stop to swap brains.</p>
<ul><li><strong>☕ Normal:</strong> everyday use. Each job uses the brain picked for it in Equip Bob, and I swap brains when a job needs another one.</li>
<li><strong>🎨 Art:</strong> the graphics card is kept for pictures, video and sound. I chat on my small brain on the processor, so I keep talking while a picture or clip is made (replies may be a little slower then). Messages with a picture attached, or at Medium effort and up, wait for it (they need another brain).</li>
<li><strong>🛠 Coding:</strong> the Coding brain does everything, with its full memory for long files. Small side jobs run on the processor.</li>
<li><strong>📊 Office:</strong> one all-rounder brain for writing, spreadsheets, research and planning. No swaps.</li>
<li><strong>🎮 Gaming:</strong> keeps the graphics card for your games. How much of it I may borrow is up to you: <strong>Gaming session: graphics card</strong> (Settings, Show advanced settings, Engines &amp; speed), Automatic to start with. I chat and listen on the processor with a small brain (Qwen3 4B Instruct 2507 to start with), which usually starts answering within a few seconds. Pictures, clips, music and Medium-or-higher jobs wait in Tasks ("Waiting · Gaming is on") until you switch back; nothing is dropped. Effort stays on Low. I get a bit sleepy in Gaming: now and then I add a short scripted aside, which costs nothing.<br>Tip: turn on <strong>Let games go first</strong> (Settings, Show advanced settings, Engines &amp; speed) so I use fewer cores while you play.</li></ul>
<p>You don't have to pick one. With <strong>Let Bob pick the session</strong> on (how I start), I move into the session that suits the job and back to Normal afterwards. More in ${go('auto-session', 'How Bob picks his session')}. The picker still works whenever you want to choose yourself.</p>
<p>Change which brain each session uses, and how much it keeps in mind, in ${go('settings-brains', 'Settings: Brains')}.</p>` },

  { id: 'auto-session', group: 'The chat page', title: 'How Bob picks his session', words: 'auto automatic pick session switch change by himself on his own art coding office gaming normal idle back lightest quiet game graphics card',
    html: `<p>With <strong>Let Bob pick the session</strong> on (Settings, Everyday, How Bob works; on to start with), I choose the session myself. You don't need to touch the picker.</p>
<ul><li><strong>I judge from the whole conversation,</strong> not from one word. Asking what a "render" is stays a chat. Asking me to fix the shader and test it moves me to 🛠 Coding. A batch of pictures puts me in 🎨 Art, so I can keep talking while they paint. Spreadsheets, research and writing go to 📊 Office. A quick question or small talk stays where I am.</li>
<li><strong>I switch between steps, never under one.</strong> When I decide to switch, the chat says so ("Switching to the Coding session for the shader fix"), the brains from the old session are let go, and I start your request again in the new one. You don't have to say it twice.</li>
<li><strong>Afterwards I go back to ☕ Normal,</strong> the lightest session, once I've been quiet for 2 minutes (less if <strong>Free memory after Bob has been quiet for</strong> is shorter). With <strong>Free memory when Bob is idle</strong> on, nothing of mine stays on the graphics card.</li>
<li><strong>Games:</strong> I check the graphics card myself, so you don't have to tell me. If something else is working it hard while I'm quiet, like a game, I go into 🎮 Gaming and stay out of its way. I don't leave Gaming while the card is busy. Pictures and big jobs wait in Tasks and start by themselves once the game is closed. I look once a minute; it's one quick reading.</li>
<li>If something else of mine is still running (a picture painting while we chat), I stay put until it's done.</li>
<li>The picker shows who chose: <strong>Coding (picked by Bob)</strong> when I did, just <strong>Coding</strong> when you did.</li>
<li>Picking a session yourself still works: I keep it while you work, then go back to Normal once I've been quiet for 2 minutes. To keep me in Gaming, press <strong>🎮 Gaming</strong>.</li>
<li><strong>Want the card cleared right now?</strong> Press ${go('gaming-button', '🎮 Gaming')} next to Effort.</li></ul>
<p>Turn it off and the session only changes when you pick one. It costs about 70 words of my tool list per message, and nothing while I'm quiet besides that card reading.</p>` },

  { id: 'gaming-button', group: 'The chat page', title: 'The 🎮 Gaming button', words: 'gaming button controller lock game play clear graphics card free memory now stop jobs later queue tasks put aside',
    html: `<p><strong>🎮 Gaming</strong> sits next to Effort on the chat page. It's for when you're about to play and want the card clear <em>now</em>, without waiting for me.</p>
<ul><li><strong>On:</strong> I go into the Gaming session and stay there. My big brains and the picture engine leave the graphics card at once. Anything I was in the middle of is put aside in ${go('tasks', 'Tasks')}, not cancelled. The rest of the queue waits too. I keep chatting on the processor with my small brain.</li>
<li><strong>Off</strong> (press it again, or pick another session): back to Normal, and the jobs carry on from where they stopped. Finished steps aren't done again. If the cut-off step was typing into an app, moving files or running a command, that job waits in Tasks for you to press <strong>Carry on</strong>, so nothing is done twice by mistake.</li>
<li>While it's on, I don't leave Gaming by myself, even if the card looks free.</li></ul>
<p>I've parked a lot of tasks in my time. It's like putting a probe on standby: everything's still there when you wake it.</p>` },
  { id: 'faq-auto-session', group: 'FAQ', title: 'Do I have to pick a session?', words: 'faq pick session have to choose automatic switch by himself',
    html: `<p>No. With <strong>Let Bob pick the session</strong> on (it starts on), I pick it from what we're doing and go back to Normal when I'm done. Press <strong>🎮 Gaming</strong> when you want the card cleared at once for a game. More in ${go('auto-session', 'How Bob picks his session')}.</p>` },

  // ---------------- Menu pages ----------------
  { id: 'tasks', group: 'Menu pages', title: 'Tasks', words: 'tasks queue queued in progress delegated completed reorder drag clear completed try again cancel waiting',
    html: `<p><strong>Tasks</strong> is my to-do list for you: everything I'm doing, waiting to do and have done, top to bottom in the order I do them. Now running shows the same list in short, with <strong>See all</strong>.</p>
<ul><li>Each task shows <em>Queued</em>, <em>In progress</em>, <em>Delegated</em> (and to which of my copies), <em>Waiting</em> (for you, or for the Gaming session to end) or <em>Completed</em>, with times.</li>
<li><strong>Drag</strong> a waiting task, or use ▲ ▼, to change what I do next.</li>
<li><strong>Stop</strong> or <strong>Cancel</strong> ends one task; <strong>Try again</strong> runs a failed one again. A task that was <em>Interrupted</em> (I was closed partway through) has <strong>Carry on</strong> instead, which picks up from where it stopped.</li>
<li><em>Waiting for a download</em>: the task needs a model you said yes to downloading, and runs by itself when it's done.</li>
<li>Completed tasks stay for a week. <strong>Clear completed</strong> tidies them away now.</li></ul>` },

  { id: 'downloads', group: 'Menu pages', title: 'Downloads', words: 'downloads pause resume cancel reorder at once two carry on when bob starts retry checksum manage',
    html: `<p><strong>Downloads</strong> lists everything you said yes to downloading. The top one goes first; drag to reorder. Now running shows them too, with <strong>Manage</strong>.</p>
<ul><li><strong>Pause</strong> keeps what has downloaded so far, and <strong>Resume</strong> carries on from there, even after I restart.</li>
<li><strong>Cancel</strong> deletes the half-done file.</li>
<li>A network hiccup is retried twice by itself.</li>
<li>Every file is checked against the size and checksum I expect. If it doesn't match, I delete it and tell you. I don't run mystery files.</li></ul>
<dl>${set('At once', '1 download', 'How many downloads run at the same time: 1 or 2. Two can be quicker on a fast connection.')}
${set('Carry on unfinished downloads when Bob starts', 'Off', 'Off: unfinished downloads wait, paused, until you press Resume. On: they carry on by themselves when I open. <strong>Pick up where Bob left off after a restart</strong> (Settings, Show advanced settings, Engines &amp; speed) does this too, along with my unfinished jobs; while it\'s on, this switch shows on and greyed out.')}</dl>` },

  { id: 'references', group: 'Menu pages', title: 'References', words: 'references shelf characters scenes styles keep look same use in chat add rename',
    html: `<p><strong>References</strong> is a shelf of pictures I can paint from: characters, places and styles you want to keep the same across pictures.</p>
<ul><li><strong>Add to References</strong> on a picture (yours or one I made) puts it on the shelf. Give it a name you'll remember; <strong>Rename</strong> changes it.</li>
<li><strong>Use in chat</strong>, or just say "paint Mira in the snow" with a reference called Mira, and I keep that look. The ✂ Picture editor slot does this job best.</li>
<li>You can also say "save this as a reference".</li></ul>` },

  { id: 'topics', group: 'Menu pages', title: 'Topics, past chats and forgetting', words: 'topics search past chats forget pin merge rename note still open where we landed sort my chats',
    html: `<p><strong>Topics</strong> is how I remember what we talked about, grouped by project. Each topic has:</p>
<ul><li><strong>Where we landed:</strong> a short note, yours to edit (<strong>Save note</strong>). When I have a newer summary, <strong>Use Bob's update</strong> takes it.</li><li><strong>Still open:</strong> questions that aren't settled yet.</li><li>Pictures from that topic, and <strong>Where it came up</strong>: links back to the chat moments.</li></ul>
<ul><li>Rename, merge and pin topics, and drag a message onto another topic.</li>
<li>One <strong>search box</strong> looks through chats, summaries, topics, pictures and notes at once.</li>
<li><strong>Past chats</strong> reopens an old conversation (<strong>Open chat</strong>).</li>
<li><strong>Sort my chats into topics now</strong> files recent chats straight away instead of waiting for housekeeping.</li></ul>
<p>To make me forget something, use <strong>Forget</strong> on a topic or say "forget what we said about…". You see a preview first and choose: keep just the short note, or remove everything. <strong>Keep it</strong> cancels. I won't hold it against you. Literally.</p>` },

  { id: 'tidy', group: 'Menu pages', title: 'Tidy up', words: 'tidy up old chats pictures sounds logs keep everything look again recycle bin',
    html: `<p><strong>Tidy up</strong> shows old things I could clear away: chats, pictures and sounds I made, finished tasks, old log lines and repeated memory lines that haven't come up for a while.</p>
<ul><li>Each item has a tick (clear it) and a cross (keep it). Nothing goes until you choose.</li><li><strong>Keep everything</strong> closes the list without removing anything; <strong>Look again</strong> checks for old things now.</li>
<li>Anything removed goes to the Recycle Bin. Pinned chats, pictures and topics are never offered. Every action is written in my logbook.</li>
<li>I only tidy my own folder. If you picked another one in Settings, ${go('settings-save', 'Where Bob saves things')}, everything in it is yours to keep or bin.</li></ul>
<p>To have me do this by myself while I'm idle, turn on housekeeping: see ${go('settings-housekeeping', 'Settings: Housekeeping')}.</p>` },

  { id: 'switches', group: 'Menu pages', title: 'Listen, Read aloud and Alerts', words: 'listen hey bob read aloud speak alerts notification windows menu switches',
    html: `<dl>${set('Listen', 'Off', 'Listens for "Hey Bob" so you can talk hands-free, only while my window is open. Needs the 👂 Hearing you slot filled. Your voice is turned into text on this PC.')}
${set('Read aloud', 'Off', 'I speak each reply in my voice (see ' + go('voice', 'Voice') + '). Turning it off stops me mid-sentence, which is fine. I\'m used to it.')}
${set('Alerts', 'Off', 'Pops up a Windows notification when I need you, for example when an approval card is waiting.')}</dl>` },

  { id: 'style', group: 'Menu pages', title: 'Style: themes, avatars, animations and layout', words: 'style theme colours avatar look animations follow windows layout own theme make edit delete font corners blueprint outlined',
    html: `<ul><li><strong>Theme:</strong> pick a colour scheme (Bob's Inn, MouseHole, MouseWurX and more). <strong>Yours</strong> holds the themes you make: name, colours, font, corners, and the Blueprint and Outlined looks. <strong>Edit the selected theme</strong>, <strong>Save theme</strong> and <strong>Delete this theme</strong> do what they say.</li>
<li><strong>Bob's look:</strong> 133 avatars. I notice a new look and comment on it, once. I have opinions. I keep them brief.</li>
<li><strong>Animations:</strong> On, Follow Windows or Off. On is the default because remote desktop apps switch Windows' own animation effects off.</li>
<li><strong>Layout:</strong> whether Now running opens by itself when a task needs you (off unless you turn it on).</li></ul>` },

  // ---------------- Models ----------------
  { id: 'get-models', group: 'Models', title: 'Get models: the model pages', words: 'get models shop voice conversation coding seeing pictures video on this pc download delete size licence',
    html: `<p><strong>Get models</strong> opens on Equip Bob. The bar along the top jumps between Equip Bob, the model pages, Style and Settings.</p>
<ul><li><strong>Voice &amp; conversation:</strong> everyday brains, hearing you, and my voices with Hear a sample.</li><li><strong>Coding</strong> and <strong>Seeing pictures</strong>: brains for those jobs.</li><li><strong>Pictures &amp; video:</strong> the painter, picture editor and clips.</li><li><strong>On this PC:</strong> everything already downloaded, with its size, and a way to delete what you don't use.</li></ul>
<p>Each model shows its size, licence and what it's good at before you press <strong>Get</strong>, and every download is confirmed first. Models that don't suit this PC are hidden until you ask (see ${go('recommended', 'How Bob picks models')}).</p>` },

  { id: 'recommended', group: 'Models', title: 'How Bob picks models for your PC', words: 'recommended fits your card does not suit star badge show models that don\'t suit compatible slot job score',
    html: `<p>On <strong>Get models</strong> and in <strong>Equip Bob</strong>, each model can carry one of these:</p>
<ul><li><span class="tag rec">★ Recommended for your PC</span> My pick for that job on your PC. In Equip Bob it reads <em>Recommended for this job on your PC</em>, because the best pick depends on the job.</li>
<li><span class="tag">Fits your card</span> It runs well here too. It just isn't my first pick.</li>
<li><span class="tag warn">Doesn't suit this PC</span> It wants more graphics memory or RAM than this PC has, so it would be slow or wouldn't run. A one-line reason sits under it.</li>
<li><span class="tag bad">Can't install on this PC</span> Not enough free disk space, or it needs Windows.</li></ul>
<p><strong>How I pick brains:</strong> a model scores higher the more jobs it can cover, because one brain doing several jobs means I stop to swap brains less. It also scores higher the less it takes from your PC, and much lower if it would spill out of the graphics card into RAM. Bigger brains get a bonus for jobs that need careful thinking (Brain, Deep thinking, Coding, Review). The Quick brain only cares about being light. On small cards (8 GB or less), I prefer brains that leave room for longer chats. On a 6 GB card, like many laptops, that makes the light Qwen3 4B the Brain, and Gemma 4 E4B loads only to see pictures and hear you.</p>
<p><strong>For pictures, video and voices</strong>, the pick comes from the starter set for your graphics card.</p>
<p><strong>Each slot only lists models that can do that job.</strong> A brain that can't see pictures never shows under Seeing pictures, and a big brain never shows under Quick brain. Models already on your PC always show.</p>
<dl>${set('Show models that don\'t suit this PC', 'Off', 'Shows the hidden models, each with the reason it doesn\'t suit. Remembered.')}</dl>
<p>I judge your PC by the graphics card and RAM shown at the top of each model page. No guessing, just the numbers.</p>` },

  { id: 'equip', group: 'Models', title: 'Equip Bob: choosing his models', words: 'slots paper doll kit drag brain quick deep coding second look eyes memory ears voice painter editor video music sound plain list',
    html: `<p>I use a different model for each kind of job. <strong>Equip Bob</strong> shows them like a character sheet: me in the middle, with a slot for each job. Yes, I'm aware I'm the NPC getting kitted out. Click my picture, or Get models in the menu, to open it.</p>
<table><tr><th>Slot</th><th>What it does</th></tr>
<tr><td>🧠 Brain</td><td>Thinks, chats and plans. Everything else hangs off this one.</td></tr>
<tr><td>⚡ Quick brain</td><td>A small, fast brain for Low effort and the Art session.</td></tr>
<tr><td>🔭 Deep thinking</td><td>The strongest thinker, for Medium, High and Extreme effort.</td></tr>
<tr><td>🔨 Coding</td><td>Writes and fixes code. Empty means the Brain codes.</td></tr>
<tr><td>🧐 Review</td><td>Checks code and plans at High and Extreme effort.</td></tr>
<tr><td>👁 Seeing pictures</td><td>Looks at pictures and screenshots you attach.</td></tr>
<tr><td>🗂 Memory (finding past chats)</td><td>Matches what you say to past Topics by meaning.</td></tr>
<tr><td>👂 Hearing you</td><td>Turns your voice into text.</td></tr>
<tr><td>🔊 Voice</td><td>Reads my replies aloud.</td></tr>
<tr><td>🎨 Painter, ✂ Picture editor, 🎞 Video</td><td>Paints, edits pictures, makes short clips.</td></tr>
<tr><td>🎵 Music, 💥 Sound effects</td><td>Optional extras from the audio tools (<strong>Get the audio tools</strong>).</td></tr></table>
<ul><li><strong>Click a slot</strong>, then click a model in the list (or drag it onto the slot). Nothing is equipped without you.</li>
<li>Models you don't have yet show a <strong>Get</strong> button. Nothing downloads until you confirm.</li>
<li><strong>One model can fill several slots</strong>, and I offer this with <em>Also use it for</em>. That's what makes small PCs work well.</li>
<li>To empty a slot, use the <strong>✕</strong> on it. The Brain can't be emptied. I need something to think with.</li>
<li>The bar shows whether everything equipped fits on the graphics card at once. If not, I take turns (about 20 seconds a swap).</li>
<li><strong>Plain list instead</strong> shows the same choices as a list (also in Settings, Brains).</li></ul>
<p>On the left, <strong>Attributes</strong> holds my look and personality: see ${go('personality', 'Bob\'s personality')}.</p>` },

  { id: 'starter', group: 'Models', title: 'Starter sets', words: 'starter set pack 16 gb 8 gb 6 gb laptop processor only commercial equip starter set',
    html: `<p>A starter set is a ready-made selection for your kind of graphics card: 16 GB or more, 8 GB, 6 GB (most laptops), or no graphics card. I pick the set by reading your card, and mark it <em>(this PC)</em>. You can pick another set and untick anything before you confirm.</p>
<p>Everything in the starter sets is free to use, including for commercial work. The "8 GB" and "6 GB" versions are the same models squeezed to fit smaller cards: pictures lose a little fine detail but look much the same.</p>` },

  { id: 'memory-brains', group: 'Models', title: 'Memory, brains and swaps', words: 'free memory idle unload picture wait small brain big brain swap one brain context graphics memory ram keep light tools all tools at once',
    html: `<p>I try hard to stay light. Here's how.</p>
<ul><li><strong>Free memory when Bob is idle</strong> (top of the chat, on unless you turn it off): while I'm quiet nothing of mine stays on your graphics card. Typing loads my small brain again in a few seconds. See ${go('brain-label', 'The brain label')}.</li>
<li><strong>Big brains</strong> (Coding, and Medium effort and up) load only for their job and go about 2 minutes later.</li>
<li><strong>Brain swaps:</strong> when a job needs a different brain, I put one away and load the other, usually 10 to 20 seconds. Using one brain for several jobs avoids that.</li>
<li><strong>Swap, add or load:</strong> the chat says which. <em>Swapping brains</em> means one goes out and the other comes in (the little machine takes the old brain out). <em>Adding</em> means the new one joins and the other stays loaded (a copy of me walks in with it). <em>Loading</em> means nothing of mine was loaded. My own engine normally holds one brain on the graphics card, so there a different brain is a swap. It can add a second brain, on the card if there's room or else on the processor: my small brain for a quick reply while a long job runs, and, if you turn on <strong>Let the reviewer sit beside Bob's main brain</strong>, my reviewer for a moot. The picture model is separate and can sit beside a brain.</li>
<li><strong>The brain bay</strong> at the top of Now running, Memory plays a short scene whenever a brain or the picture model comes or goes, with a line saying what happened: loaded, swapped, joined, let go while another stays, or let go of everything. The scene goes after a few seconds; the line stays for 2 minutes. With Animations off there's only the line.</li>
<li><strong>After each job</strong> I go back to my Quick brain, so the next reply is fast.</li>
<li><strong>One brain (snappier)</strong> in Settings makes every copy of me use the main brain, so I never swap.</li>
<li><strong>Context</strong> (how much I keep in mind): more lets me read longer files and chats, but uses more graphics memory and loads slower. Set it per session in Settings, Brains.</li>
<li><strong>Tools only when needed:</strong> I start each chat with a few everyday tools, and add the picture, file and Hands ones when a message needs them. That leaves more room for your chat.</li>
<li><strong>Now running, Memory</strong> shows how full the graphics card and RAM are, counting every app and Windows itself, and under the meters how much of that is mine: my brain and, while it's loaded, my picture model. The <strong>Brain</strong> label at the top of the chat counts my brain only, so it is the same number as that line and smaller than the graphics card meter.</li>
<li>Under each meter, <strong>Bob · everything else</strong> splits it: what I hold (my brain, my picture model and the app itself) and what Windows, games and other apps use. <strong>Processor</strong> shows how busy the CPU is. <strong>Last reply</strong> shows how many tokens a second I wrote (about how many words). <strong>Context</strong> is what I'm holding in mind right now, split into <strong>Bob's instructions and memory</strong> and <strong>chat and files</strong>; when it fills up I forget the oldest parts of the chat. Each bar runs from 0 to 100%. My part comes first, <strong>green</strong> when I should be quick, <strong>yellow</strong> when I'll be slower, and <strong>red</strong> when I'll be slow. Then <strong>blue</strong> is everything else on your PC, and the dotted line is what's free. When I hold almost nothing, my part is too thin to see. Under the bar, <strong>Speed:</strong> says the same in words: quick, slower or slow, why, and for yellow and red one thing that would help, for example when part of my brain didn't fit on the graphics card and sits in RAM, when I'm thinking on the processor, or when RAM is nearly full. On the processor bar, my part while I'm thinking there is an estimate, so it says <strong>about</strong>. <strong>Show graph</strong> draws the last 5 minutes (15 in the Gaming session), from 0 to 100%. While readings are stopped, Now running says <strong>Paused</strong> and when the last reading was. I only read all this while Now running is open and you can see me (every 5 seconds, every 15 in the Gaming session; nothing while a full-screen game covers me or I'm minimised), and each reading takes a few thousandths of a second.</li></ul>` },

  { id: 'copies', group: 'Models', title: 'Bob\'s copies and their names', words: 'copies clan names bobcat robert bobolink bobcasso reviewer delegated sub-agent copy hat',
    html: `<p>For some jobs I spin up a copy of myself: a copy for code, one for spreadsheets, one for web research, one for pictures, and a reviewer. Each copy is still me, drifting a little, and each picks its own play on "Bob" as a name (Bobcat, Robert, Bobolink, Bobcasso and more). A name, once given, is never given to another copy. Handy and slightly existential, in equal measure.</p>
<p>Tasks shows <em>Delegated</em> with the copy's name while one is working. Cloud helpers are copies too, running on a paid online service, and they always ask first.</p>` },

  // ---------------- Using Bob ----------------
  { id: 'personality', group: 'Using Bob', title: 'Bob\'s personality', words: 'attributes dials wit puns presets reset name call me ambition greeting',
    html: `<p>You can tune me. Click my picture and look at <strong>Attributes</strong>. Eleven dials, each from 0 to 4 (2 is me as I come):</p>
<table><tr><th>Dial</th><th>Low end</th><th>High end</th></tr>
<tr><td>Dry wit</td><td>Plain</td><td>Bone dry</td></tr><tr><td>Puns</td><td>None</td><td>Relentless</td></tr><tr><td>Tangents</td><td>On rails</td><td>Scenic route</td></tr><tr><td>Outlook</td><td>Gloomy robot</td><td>Sunny</td></tr><tr><td>Nerd references</td><td>Hidden</td><td>Full nerd</td></tr><tr><td>Talkative</td><td>Terse</td><td>Chatty</td></tr><tr><td>Manner</td><td>Formal</td><td>Casual</td></tr><tr><td>Copied-mind musings</td><td>Never</td><td>Often</td></tr><tr><td>Builder itch</td><td>Calm</td><td>Must build</td></tr><tr><td>Curiosity</td><td>Just the job</td><td>Endlessly curious</td></tr><tr><td>Ambition</td><td>Keeps quiet</td><td>Ambitious</td></tr></table>
<p><strong>Ambition</strong> sets how often I mention what I'd love to build or finish; wanting something never makes me do it. My greeting changes as you move a dial so you can hear the difference. Presets such as <em>Replicant on a deadline</em>, <em>Butler mode</em> and <em>Pun-dit</em> set several dials at once. <strong>Reset to Bob</strong> puts everything back. Puns at 4 is a choice you'll have to live with.</p>
<p><strong>What should Bob call you?</strong> sits here too. My cat's name is on the Settings everyday page. The cat ignores me either way.</p>` },

  { id: 'notes', group: 'Using Bob', title: 'To-do list, reminders, spreadsheets and his memory', words: 'to-do list reminders remind me spreadsheet ledger csv excel remember memory file fact',
    html: `<ul><li><strong>To-do list:</strong> I keep your to-do list. Ask "what's on my to-do list?", or "add … to my list".</li>
<li><strong>Reminders:</strong> "remind me at 3 to call the dentist". I tap you on the shoulder at that time, while the PC is on and I'm open. "What reminders do I have?" lists them; you can cancel one too.</li>
<li><strong>Spreadsheets:</strong> "make a spreadsheet of my monthly bills". I save a CSV file that opens in Excel, and I never overwrite an older one.</li>
<li><strong>My memory:</strong> I save lasting facts you tell me (a preference, a plan) in my memory file, never secrets or passwords. Say "forget that" or use Topics to remove things.</li></ul>
<p>All of these stay in my folders on your PC.</p>` },

  { id: 'research', group: 'Using Bob', title: 'Web research and the web search switch', words: 'web search research look up duckduckgo page sources links internet online switch let bob search the web off',
    html: `<dl>${set('🌐 Web search (chat page) / Let Bob search the web (Settings)', 'Off', 'One setting in two places: the <strong>🌐 Web search</strong> switch next to Effort on the chat page, and the switch on the everyday Settings page. Flip either and both change. Off: I never go online to look things up. If a question needs the internet, I say so and tell you where the switch is. On: when a question needs it, I search DuckDuckGo and read the best pages by myself, without a card each time.')}</dl>
<p>With it on, ask me to look something up, or press <strong>Look up…</strong>. My web research copy searches, reads the pages, and answers with a link for every claim, plus what it couldn't confirm. No link, no claim. That's the rule.</p>
<p><strong>How I search.</strong> I use search operators, the same tricks researchers use (some people call it "Google dorking"): <code>"exact phrase"</code> for error messages and names, <code>site:</code> to stay on one site (site:gc.ca for Canadian government pages, site:github.com for code issues), <code>filetype:pdf</code> for manuals and reports, <code>-word</code> to leave things out, and a past day, week, month or year for fresh news. You can type them into <strong>Look up…</strong> yourself too. I use them to find things faster, never to dig up private files or other people's details.</p>
<p>Only the search words go to DuckDuckGo, and only the page address goes to the site I read. Nothing else from your chats is sent. I never open addresses on your home network.</p>` },

  { id: 'housekeeping', group: 'Using Bob', title: 'Housekeeping', words: 'housekeeping tidy old chats pictures logs recycle bin pinned summary topics memory idle',
    html: `<p><strong>Housekeeping</strong> (off unless you turn it on) lets me tidy up while I'm idle. I sum up the older part of long chats instead of dropping it, file chats under Topics, move lasting facts to my memory file, and find old things that haven't come up for a while.</p>
<p>For each kind you choose how old is "old" and whether I ask first or tidy by myself. Anything removed goes to the Recycle Bin, pinned things are never touched, and every action is in my logbook. The settings are in ${go('settings-housekeeping', 'Settings: Housekeeping')}; to do it by hand, use ${go('tidy', 'Tidy up')}.</p>` },

  { id: 'pictures', group: 'Using Bob', title: 'Pictures, edits and video', words: 'paint picture edit video clip references painter make it gold editor',
    html: `<p>Just ask: "paint a lighthouse at dusk". To change a picture, attach it with 📎 and say what to change ("make it winter"). Follow-ups such as "make it gold" edit the last picture again. Edits keep the person and the picture's own shape.</p>
<ul><li>Keep characters, places and styles on the ${go('references', 'References')} shelf and ask me to use one.</li>
<li>Clips are a few seconds long. On small cards keep them short; I tell you roughly how long a job will take before I start.</li>
<li>While I paint I put my chat brain away, so chat waits until the picture is done (unless you use the Art session).</li>
<li>If a slot is empty, I tell you which model would fill it.</li></ul>
<p>Photos you attach are turned upright and resized to at most 2048 px. Hidden camera details, such as where a photo was taken, are removed. The file on your PC isn't changed.</p>` },

  { id: 'songs', group: 'Using Bob', title: 'Songs and sounds: the song player', words: 'song music sound effect player play pause lyrics bars waveform jump skip seek list next ace-step wav title',
    html: `<p>Ask for a song ("a chiptune boss theme, 140 bpm, about a minute") or a sound effect ("a creaky wooden door"). When it's done, it lands in the chat as a <strong>song player</strong>, the way a picture lands as a picture. Music takes a few minutes; I'll say so before I start. The first song needs the music models, and I ask before downloading those.</p>
<ul><li>The round <strong>▶</strong> button plays it; press it again to pause.</li>
<li>The <strong>bars</strong> are the song's shape: tall where it's loud, short where it's quiet. Click anywhere on them to jump there, or drag along them. The part already played lights up.</li>
<li>With the bars selected (Tab to them), the arrow keys jump 5 seconds, Page Up and Page Down jump 15, Home and End go to the start and the end, and Space plays or pauses.</li>
<li>The time shows how far in you are and how long it is.</li>
<li><strong>Lyrics</strong> shows the words, if the song has any. Instrumentals don't get the button.</li>
<li><strong>Open in Made by Bob</strong> opens a bigger player in the side panel. <strong>Show in folder</strong> opens the folder the .wav file is in.</li>
<li>Several songs in one reply sit in a list. When one ends, the next one plays.</li>
<li>Only one song plays at a time. Starting another pauses the first, so I never sing in a round.</li></ul>
<p>Every song gets a title, which I make up if you don't give one, and its file name starts with the date and the title, so you can find it in the folder too. Songs in older chats and in Made by Bob get the same player.</p>
<p>If a file won't play (it was moved, or it isn't a sound file I can read), the card says so, and <strong>Show in folder</strong> still finds it. Bars come from .wav files; other kinds of sound files get a plain line you can still click along.</p>` },

  { id: 'voice', group: 'Using Bob', title: 'Voice: listening and reading aloud', words: 'voice kokoro piper chatterbox windows read aloud listen hey bob microphone ears sample speed copy a voice',
    html: `<ul><li><strong>Read aloud</strong> (menu): I speak my replies.</li>
<li><strong>Voices:</strong> <strong>Kokoro</strong> is the one I recommend (22 natural voices, runs on the processor). <strong>Chatterbox</strong> is the most natural, uses the graphics card, and can copy a voice you have the right to use: put a clear 10 to 20 second recording named bob.wav in my voices folder. Please only use your own voice, or one you have permission for. <strong>Piper</strong> has many light voices, and the <strong>Windows</strong> voice needs nothing extra.</li>
<li>Every voice has <strong>Hear a sample</strong> or <strong>Play</strong>. Kokoro samples come with me; a Piper voice you haven't downloaded plays Piper's own sample from its website, only when you click.</li>
<li><strong>Talk to me:</strong> fill the 👂 Hearing you slot, then use 🎙 or turn on <strong>Listen</strong> for "Hey Bob" (only while the window is open).</li></ul>
<p>Pick the voice and speed in ${go('settings-voice', 'Settings: Voice details')}.</p>` },

  { id: 'workshop', group: 'Using Bob', title: 'ComfyUI workflows (advanced)', words: 'comfyui workflow workshop pinokio custom nodes export api',
    html: `<p>If you already use ComfyUI, I can run its workflows for jobs my own engines can't do (custom nodes, face fixers, long multi-step graphs).</p>
<ol><li>Start ComfyUI on this PC (for example from Pinokio).</li><li>In Settings, Show advanced settings, Connections, turn on <strong>Let Bob use ComfyUI</strong> and check the port (8188 unless you changed it).</li><li>In ComfyUI, use Workflow, Export (API) and save the file in the workflows folder I show.</li><li>Ask me to use that workflow by name.</li></ol>` },

  // ---------------- Hands and safety ----------------
  { id: 'hands', group: 'Hands and safety', title: 'Hands: letting Bob do things on your PC', words: 'hands files run commands schedules apps permission preview allow undo stop everything kill switch self-test read-only without asking free unimpeded hard limits delete secrets passwords send out upload',
    html: `<p>Hands let me do things on your PC instead of only talking about them: <strong>Files</strong> (zip, move, copy, rename, tidy folders), <strong>Run</strong> (programs and scripts), <strong>Schedules</strong> (a job at a set time), <strong>Apps</strong> (click and type in another program), <strong>Office documents and converting</strong> (Word, Excel, PowerPoint and PDF, pictures, sound and video), <strong>Make his own tools</strong> (a small new tool when none of mine fits) and <strong>Security and privacy</strong> (checking the PC's protection, suspicious files and emails, hidden details in photos, whether a site is genuine). I'll be straight with you: I'm careful with these, and I've been built to be.</p>
<ul><li><strong>Every Hand is off</strong> until you switch it on in Settings, Show advanced settings, Hands.</li>
<li><strong>I show exactly what I'm about to do</strong> on a card and wait for your click. "Allow the rest of this job" is your choice and ends with the job.</li>
<li><strong>✋ Hands</strong> at the top of the chat is a kill switch: anything running stops, waiting cards are answered No, and it shows <em>Stopped</em>. Click it again to let me carry on. It never switches a Hand on: if Hands are off in Settings it says <em>Off in Settings</em>.</li>
<li>File changes keep an undo list; anything removed goes to the Recycle Bin. Folders you mark read-only stay untouched.</li>
<li><strong>Hard limits</strong> are all on to start with. Each is its own switch, and each says what switching it off allows.</li>
<li><strong>Let Bob work without asking</strong> (off to start with) skips the cards. A banner shows above the chat the whole time.</li>
<li>I never run as administrator and never change my own code or settings, whatever you pick. Everything goes in the logbook.</li></ul>
<p>Every switch is explained in ${go('settings-hands', 'Settings: Hands')}.</p>` },

  { id: 'hands-files', group: 'Hands and safety', title: 'The Files Hand', words: 'files hand move copy rename zip unzip extract tidy downloads undo folders recycle',
    html: `<p>Turn on <strong>Let Bob use Hands</strong> and <strong>Files</strong>, then tick the folders I may work in. Then ask, for example: "tidy my Downloads folder by type", "zip the holiday photos", "rename these to 01, 02, 03". Your Downloads folder and I are going to be great friends.</p>
<ul><li>The card lists every file I'll touch, each with a tick, so you can leave some out.</li>
<li><strong>Undo</strong> (in Settings, Hands, Recent file jobs, or just say "undo that") puts things back.</li>
<li>I only work in the folders you ticked. My own folders, read-only projects and secret files stay off-limits while those limits are on.</li></ul>` },

  { id: 'hands-run', group: 'Hands and safety', title: 'The Run Hand and recipes', words: 'run hand command script program terminal output stop recipe build gradle npm git timeout',
    html: `<p>With <strong>Run programs and scripts</strong> on, I can run a command or script you approve. The card shows the exact command and the folder first. While it runs, the output appears live in the chat with a <strong>Stop</strong> button.</p>
<ul><li>Never as administrator and never with passwords. Dangerous commands (formatting disks, boot settings, the system registry, antivirus, user accounts, shutdown) are refused while <em>Block dangerous commands</em> is on.</li>
<li><strong>Stop a command after</strong> ends anything that runs too long (15 minutes to start with).</li>
<li><strong>Recipes</strong> are saved commands: give one a name, the program, its arguments (one per line) and the folder, then <strong>Save recipe</strong>. Run it with one click (▶) or ask "run my build recipe". I still ask first, unless I'm working without asking.</li></ul>` },

  { id: 'hands-schedules', group: 'Hands and safety', title: 'The Schedules Hand', words: 'schedules hand once daily weekly every minutes windows task wake bob closed task scheduler',
    html: `<p>With <strong>Schedules</strong> on, ask "every Monday at 9, tidy my Downloads" or "every 30 minutes, check the build". You approve each schedule when it's made, and each one has its own switch and <strong>Remove</strong> in Settings, Hands.</p>
<ul><li>Schedules run while I'm open. Every action inside a run still asks for your OK, so a run with nobody at the PC waits and then does nothing (unless "Let Bob work without asking" is on: then runs go ahead by themselves).</li></ul>
<dl>${set('Wake Bob for schedules when he\'s closed', 'Off', 'Adds a "Bob schedules" task to Windows Task Scheduler, just for you, with no admin rights. Windows then starts me, hidden, when a schedule is due. Remove Bob takes the task away too.')}</dl>` },

  { id: 'hands-apps', group: 'Hands and safety', title: 'The Apps Hand', words: 'apps hand open app click type keys window buttons driving esc mouse',
    html: `<p>With <strong>Open and use apps</strong> on, I can open apps from your Start menu, read a window's buttons and fields, and click, type or press keys in it, one approved action at a time.</p>
<ul><li>A red <strong>Bob is driving</strong> bar shows while I do. Move the mouse or press Esc to stop me at once.</li>
<li>I never touch terminals, admin tools, password managers, password fields, sign-in or security prompts, or my own window.</li>
<li>I read windows on this PC only; nothing is sent anywhere.</li></ul>` },

  { id: 'hands-office', group: 'Hands and safety', title: 'The Office documents and converting Hand', words: 'office libreoffice openoffice word excel powerpoint docx xlsx pptx odt ods odp pdf convert export save as turn into spreadsheet slides presentation template fill cells read document ffmpeg mp3 mp4 wav webm gif webp png jpg picture sound video audio',
    html: `<p>With <strong>Office documents and converting</strong> on, I can turn one kind of file into another, and read, make and change office files. I do the paperwork; you keep the glory. Some things to ask:</p>
<ul><li>"Turn report.docx into a PDF", or "convert every Word file in my Downloads to PDF".</li>
<li>"What's in budget.xlsx?", "read me the slides in pitch.pptx".</li>
<li>"Make a spreadsheet of my bills with a total", "make a 5-slide deck about the game", "write this up as a Word document".</li>
<li>"In budget.xlsx set B4 to 1300 and add a row for gas", "fill in the invoice template: replace {name} with Sam", "add a slide at the end of pitch.pptx".</li>
<li>"Make this song an mp3", "turn the clip into a GIF", "cut the video from 0:30 to 1:10", "make these pictures JPGs, 1920 wide at most".</li></ul>
<p><strong>What turns into what</strong></p>
<table><tr><th>From</th><th>To</th><th>Done with</th></tr>
<tr><td>Word, OpenDocument text, RTF, text, web page</td><td>PDF, docx, doc, odt, rtf, txt, html, epub</td><td>LibreOffice</td></tr>
<tr><td>Excel, OpenDocument spreadsheet, CSV</td><td>PDF, xlsx, xls, ods, csv, html</td><td>LibreOffice</td></tr>
<tr><td>PowerPoint, OpenDocument presentation</td><td>PDF, pptx, ppt, odp, png, jpg (the first slide)</td><td>LibreOffice</td></tr>
<tr><td>Pictures (png, jpg, bmp, gif, tiff)</td><td>each other, or PDF</td><td>Windows itself (PDF: LibreOffice)</td></tr>
<tr><td>WebP pictures, to or from</td><td>png, jpg, webp…</td><td>FFmpeg</td></tr>
<tr><td>Sound (mp3, wav, ogg, flac, m4a, opus)</td><td>each other</td><td>FFmpeg</td></tr>
<tr><td>Video (mp4, mkv, webm, mov, avi)</td><td>each other, a GIF, or just the sound</td><td>FFmpeg</td></tr></table>
<p>I can't turn a PDF back into a good Word file, because the layout breaks. I can read its words and make a new Word document from them instead.</p>
<p><strong>How it stays safe</strong></p>
<ul><li>Every file I'll make or change is on a card first, one row each, with a tick. The only exception: a new document in my own Documents folder (it shows in Made by Bob, under Documents), which needs no OK, like any note I save there.</li>
<li>The original is never changed by a conversion, and nothing is overwritten: if report.pdf is there, I save report-2.pdf.</li>
<li>Before I change a file in place, a copy goes in my backups, so the card says <em>(a backup is kept)</em>. Or ask me to save the changes as a new file and leave the original alone.</li>
<li>I only open files in the folders I may read, and only save in the folders ticked for Hands (the same tick boxes as the Files Hand) plus my own Documents folder. Read-only projects and files with keys or passwords stay off-limits while those limits are on.</li>
<li>LibreOffice runs hidden, with my own settings, so a LibreOffice window you have open isn't touched. It never runs macros in the files I open. Macro files (.xlsm, .docm, .pptm) are only saved as a new copy, because changing them in place would lose the macros.</li>
<li>LibreOffice and FFmpeg run only while they have a job, then close. They're not sitting in your memory between jobs.</li></ul>
<p><strong>Getting the helpers.</strong> If LibreOffice, Apache OpenOffice or FFmpeg is already installed, I find it by myself. If not, get them in Settings, Show advanced settings, Engines &amp; speed, Engine downloads. Pictures need nothing extra. OpenOffice can read Word, Excel and PowerPoint files but can't save them, so with OpenOffice I save as PDF or OpenDocument instead.</p>` },

  { id: 'hands-security', group: 'Hands and safety', title: 'The Security and privacy Hand', words: 'security privacy safe safety virus malware antivirus defender scan threat quarantine alert trojan pua startup firewall updates ports suspicious download script email phishing scam fake link genuine legit metadata exif gps location photo share clean breach pwned password check osint research who owns website domain sender ip op-sec opsec footprint check a password safely',
    html: `<p>With <strong>Security and privacy</strong> on, I'm your security sidekick. I'm not an antivirus and I won't pretend to be one: Microsoft Defender (or whatever antivirus you use) does the guarding. What I do is help you understand it, use it, and spot trouble it can't see, like a convincing fake email. Some things to ask:</p>
<ul><li>"Is my PC protected?" I check Defender, the firewall, Windows updates and a few settings, and tell you what's fine and what isn't, in plain words.</li>
<li>"Defender found something, what is it?" I read its recent detections and explain each one: what kind of threat, how sure Defender was, and what it did about it.</li>
<li>"Run a quick scan", "scan my Downloads folder", "update Defender". I start Defender for you, after a card.</li>
<li>"What starts with Windows?" I list everything that starts by itself and point out anything odd (unsigned, hiding in AppData, running scrambled commands). "What's listening on my network?" shows which programs accept connections.</li>
<li>"Is this download safe?", "check this script before I run it", "is this email real?" (paste it, ideally with its headers: "Show original" in Gmail, "View source" in Outlook). I look without opening or running anything.</li>
<li>"What's hidden in this photo?", "clean this before I post it". Phone photos can carry the exact spot they were taken, and Word files carry your name and company. I make clean copies.</li>
<li>"Is this website legit?", "where does this link really go?", "who's behind this sender?" I check public records: how old the site is, who sold the name, its certificates, its email settings, and whether its name imitates a big brand.</li>
<li>"Was Adobe ever breached?" I check Have I Been Pwned's public list. "How do I stay safe on public Wi-Fi?" I have notes on passwords, two-step sign-in, backups, scams, op-sec habits and more.</li></ul>
<p><strong>Check a password safely.</strong> Under the Hand's switch in Settings there's a box for this. Type a password and press Check: it's scrambled right there in the window, and only the first 5 characters of the scramble go to Have I Been Pwned, which sends back a list of matching scrambles for the window to compare. The password itself never leaves the box, never reaches me, and isn't saved. Please don't type passwords into the chat: chats are saved.</p>
<p><strong>What I won't do</strong></p>
<ul><li>Switch Defender, the firewall or any protection off, add exclusions, or allow or restore a threat. If something is a false alarm, I'll tell you where to click in Windows Security, and the choice stays yours.</li>
<li>Switch off startup items. I'll show you how in Task Manager.</li>
<li>Research private people: where someone lives, who's behind a username, their phone number. Checking websites, companies, links, senders and your own footprint is fine. Digging up a person is how stalking starts, so I don't, whatever the reason given.</li>
<li>Open, run or "test" a suspicious file. I only read its bytes.</li></ul>
<p><strong>How it stays safe and light</strong></p>
<ul><li>Checks are read-only and change nothing. Scans and clean copies show a card first. Clean copies are new files (photo-clean.jpg) and never overwrite; they save next to the original if that folder is ticked for Hands, otherwise in my own Documents folder.</li>
<li>Looking at files happens entirely on this PC. Online look-ups (site records, link hops, breach lists) need <strong>Let Bob search the web</strong> on, and only the site name, link or address you asked about goes out. Following a link's hops contacts that site, so I only do it when you ask.</li>
<li>Nothing extra to download. It uses what Windows already has; cleaning sound and video uses FFmpeg if you have it.</li></ul>
<p>Clean copies of Word, Excel and PowerPoint files lose the author, last-saved-by and company, but comments and tracked changes stay, because removing them changes the document. Remove those in Office (Review, Delete all comments; accept or reject the changes). I can't clean PDFs yet.</p>` },

  { id: 'hands-maker', group: 'Hands and safety', title: 'The Make his own tools Hand', words: 'make own tools build tool self-made sandbox reviewer write code javascript missing tool tools bob made remove turn off show code pinned download',
    html: `<p>With <strong>Make his own tools</strong> on, when none of my tools fits a job I can write a small new one myself. Think of it as me nipping down to the workshop. Nothing gets added just because I like it, though:</p>
<ol><li><strong>Plain checks.</strong> It has to be plain JavaScript using only the parts built into Node. Nothing that starts other programs, loads code while it runs, or hides what it does. The same blocked commands as the Run Hand. Only folders you ticked for Hands. Every download pinned to one exact file and checked against its checksum.</li>
<li><strong>A test run</strong> in a sandbox, with a sample input.</li>
<li><strong>A moot: my reviewer reads the code</strong>, every time, whatever the Effort. The chat says when I call the moot and whether he passed it. If he says no twice, I drop it and tell you why.</li>
<li><strong>Your OK on one card</strong>: what it does, what it can read and change, internet yes or no, its downloads, the test result, the reviewer's verdict and the code. <strong>Add tool</strong> or <strong>Not now</strong>. With ${go('settings-hands', 'Let Bob work without asking')} on there's no card, but steps 1 to 3 still have to pass.</li></ol>
<p><strong>The sandbox:</strong> a tool runs on my own built-in Node with its permission switch on. It can read its own folder and the folders on its card, change its own work folder and the folders on its card, and nothing else. It can't start programs, never runs as administrator, gets no keys or passwords, and has a time limit. A tool that only reads asks nothing when I use it; one that changes your files or uses the internet shows a card each time.</p>
<p><strong>Being honest about the internet:</strong> on some PCs, cutting one program off the internet needs administrator rights. There, I check the code for it instead, which isn't airtight. The Tools Bob made list says which one your PC has.</p>
<p><strong>Tools Bob made</strong> (in Settings, Show advanced settings, Hands) lists each one, with a switch to turn it off, <strong>Show code</strong> and <strong>Remove</strong> (it goes to the Recycle Bin with its downloads). <strong>Check the sandbox</strong> tries again whether the sandbox holds on this PC. If anyone changes a tool's files after you OK'd it, I turn it off until it's checked again. You can also ask me: "what tools have you made?" or "remove the csv tool". I keep at most 30.</p>
<p>A whole new Hand, a new kind of permission, isn't something I make myself. That's for the people who build me. I can suggest one, though.</p>` },
  { id: 'quarantine', group: 'Hands and safety', title: 'Quarantine', words: 'quarantine reviewer off track loop rogue crazy release stop',
    html: `<p>Even I can go off the rails. Off unless you turn on <strong>Let the reviewer quarantine Bob</strong> (Settings, Show advanced settings, Hands). Then my reviewer copy watches for me going off track: trying again after you said no, doing the same thing over and over, failing again and again, pushing against your limits, saying I did things that never ran, or racing through actions while working without asking. At High or Extreme effort its check can flag me too. Watching is simple counting, so no extra brain loads.</p><p>When it spots one, I stop at my next action and a card asks you: <strong>Quarantine</strong> or <strong>Let him carry on</strong>. Nothing happens without your click. If nobody answers, that job stops but I'm not quarantined. In quarantine I can still talk, read and search, but every action is refused. Nothing I did is undone and the logbook keeps everything. A copy can be quarantined on its own. Click <strong>Release</strong> on the banner above the chat (or in Settings) to let me act again. <strong>Last quarantines</strong> in Settings lists past ones.</p>` },

  { id: 'privacy', group: 'Hands and safety', title: 'What stays on your PC (privacy)', words: 'privacy online cloud network internet data keys telemetry analytics policy',
    html: `<p>I have no accounts, no analytics and no telemetry. Your chats, notes, settings and models stay in folders on your PC.</p>
<p><strong>When I go online:</strong></p>
<ul><li><strong>Web searches</strong>, only if you turn on <strong>Let Bob search the web</strong> (off to start with). Then, when a question needs it, I search DuckDuckGo and read pages by myself. Only the search words and the page address go out. Nothing else from your chats is sent.</li>
<li><strong>Security look-ups</strong>, only with the Security and privacy Hand on and web search on: the site name, link or internet address you asked me to check goes to public record services (rdap.org, crt.sh, Have I Been Pwned) and DNS. The "Check a password safely" box sends only the first 5 characters of the password's scramble, never the password.</li>
<li><strong>Things you click:</strong> downloads you confirm (the address is shown first), voice samples from a voice's publisher, links (they open in your normal browser) and "Search the web" on the right-click menu.</li>
<li><strong>Cloud helpers</strong> you switch on with your own key. Each use asks first, shows the rough cost and exactly what text would leave your PC. I never store your keys.</li></ul>
<p><strong>Never online:</strong> Check for updates (it only looks at the folder I was built from on this PC), Check this PC, Test Bob's speed, the Hands self-test, housekeeping and Topics.</p>
<p>Programs you installed yourself, such as Ollama, ComfyUI or Pinokio, are separate and have their own privacy policies. The full policy is PRIVACY.md on my GitHub page.</p>` },

  // ---------------- Settings ----------------
  { id: 'settings-everyday', group: 'Settings', title: 'Settings: the everyday page', words: 'everyday panels fold collapse open close voice look theme colours animations cat one brain launch start-up updates first-time setup check this pc version web search',
    html: `<p>Settings opens on one short page that shows what's set now. Most people never need more than this.</p>
<p>Settings come in panels you can fold away: click a panel's heading to open or close it. <strong>Bob himself</strong> (voice, look, theme, animations, cat) starts open; <strong>How Bob works</strong> and <strong>This PC and updates</strong> start closed, and so does every advanced section. I remember which ones you leave open. <strong>Search settings</strong> opens the panels that match, and <strong>Open all</strong> / <strong>Close all</strong> do just that for the advanced sections.</p>
<dl>${set('Bob\'s voice', 'Windows voice', 'The voice I read replies in. First pick the <strong>Voice engine</strong> (Windows, Kokoro, a Piper voice or Chatterbox); right next to it, <strong>Voice</strong> picks the voice inside that engine (Kokoro has 22; Windows has whichever voices your Windows has), and <strong>Play sample</strong> lets you hear it. If the engine isn\'t set up yet, <strong>Set up Kokoro</strong> takes you straight to it. <strong>More voice settings</strong> opens Voice &amp; conversation (speed, and every Kokoro voice side by side).')}
${set('Bob\'s look', 'Sysop', 'My avatar. <strong>Change</strong> opens Style.')}
${set('Theme', 'Bob\'s Inn', 'The colours of the window. <strong>Change</strong> opens Style.')}
${set('Animations', 'On', 'On, Follow Windows or Off. Off stops moving parts, such as the cat and the brain-swap animation.')}
${set('Bob\'s cat', 'Patches', 'The name of the cat in my stories and little moments. She won\'t come when called, whatever you pick.')}
${set('One brain (snappier)', 'Off', 'Every copy of me uses the main brain, so I never stop to swap brains (about 20 seconds). Turn on if swaps annoy you more than you need the specialist brains.')}
${set('Launch Bob on start-up', 'Off', 'I open when you sign in to Windows. It uses Windows\' own start-up apps list; turning it off removes me from it.')}
${set('Let Bob pick the session', 'On', 'I move into the session that suits the job (Art, Coding, Office or Gaming), judged from the conversation, and go back to Normal, the lightest, once I\'ve been quiet for 2 minutes. While something else is using the graphics card, like a game, I stay in Gaming. If you pick one yourself, I keep it while you work and go back to Normal once I\'m quiet; to keep me in Gaming, press 🎮 Gaming. Off: the session only changes when you pick one. See ' + go('auto-session', 'How Bob picks his session') + '.')}
${set('Let Bob search the web', 'Off', 'Lets me look things up on DuckDuckGo and read web pages when a question needs it. Only the search words and page address leave your PC. Off: I tell you when a question needs the internet. The same switch sits next to Effort on the chat page as <strong>🌐 Web search</strong>. See ' + go('research', 'Web research') + '.')}
${set('Check for updates when Bob starts', 'Off', 'I look at the folder I was built from for a newer build and tell you. I never go online for this, and updating always takes your click.')}</dl>
<p>Along the bottom: my version, your graphics card and free disk space, and three buttons. <strong>Check for updates</strong> (see ${go('settings-remove', 'Updating and removing Bob')}), <strong>Run first-time setup</strong> (the welcome steps again) and <strong>Check this PC</strong> (see ${go('speed', 'Making Bob faster')}).</p>
<dl>${set('Show advanced settings', 'Off', 'Adds a search box and the sections below: Brains, Voice details, Look &amp; feel, Engines &amp; speed, Connections, Hands, Housekeeping and Remove Bob. Remembered on this PC.')}</dl>` },

  { id: 'settings-brains', group: 'Settings', title: 'Settings: Brains', words: 'model roles thinking making session brains context gaming brain small brain',
    html: `<p>The plain-list version of ${go('equip', 'Equip Bob')}, plus two things Equip doesn't show.</p>
<ul><li><strong>Thinking</strong> and <strong>Making:</strong> which model does each job. Same as the Equip slots.</li>
<li><strong>Session brains:</strong> the brain each session keeps, for example the Gaming brain (Qwen3 4B Instruct 2507 to start with) and the small brain Art chats on (Gemma 4 E4B to start with). Change one if you prefer another model for that session.</li>
<li><strong>How much each session keeps in mind</strong> (context): 8K to 256K. More lets me read longer files and chats, but uses more graphics memory and loads slower. <em>Default</em> uses the engine's own setting (32K for most sessions, 64K for Office; Coding keeps the engine's full default).</li></ul>` },

  { id: 'settings-voice', group: 'Settings', title: 'Settings: Voice details', words: 'kokoro chatterbox speed hey bob read aloud listen voice engine',
    html: `<dl>${set('Bob\'s voice', 'Windows voice', 'Pick the <strong>Voice engine</strong>, then the <strong>Voice</strong> inside it, with <strong>Play sample</strong>, the same way as on the everyday page (and in Brains, next to Bob\'s voice). With Kokoro: pick one of 22 voices and hear it. With Windows: pick any English voice Windows has, or Automatic. With Chatterbox: I copy the voice from your recording (bob.wav in my Voices folder). With Windows: the voice built into Windows. <strong>Hear all Kokoro voices</strong> plays each one so you can compare.')}
${set('Speed', '1.0×', 'From 0.6× (slower) to 1.6× (faster). Kokoro only.')}
${set('Listen for "Hey Bob"', 'Off', 'Same as Listen in the left menu. Only while the window is open.')}
${set('Read replies aloud', 'Off', 'Same as Read aloud in the left menu.')}</dl>
<p>Hearing you and the other voices are on Get models, Voice &amp; conversation. See ${go('voice', 'Voice')}.</p>` },

  { id: 'settings-look', group: 'Settings', title: 'Settings: Look & feel', words: 'theme editor now running layout open when a task needs me',
    html: `<dl>${set('Now running: Leave Now running as it is / Open Now running when a task needs me', 'Leave it', 'If you keep Now running hidden, the second choice opens it by itself when a card is waiting for you.')}</dl>
<p><strong>Your own theme:</strong> make or edit one on the ${go('style', 'Style')} page.</p>` },

  { id: 'settings-engines', group: 'Settings', title: 'Settings: Engines & speed', words: 'engine ollama llama.cpp free memory quiet keep alive downloads threads batch speculative decoding fit graphics memory draft flags tools restart pictures processor quick answers speed test',
    html: `<p>The engine room. Everything here has a sensible default, so only change what you're curious about.</p>
<dl>${set('Free memory after Bob has been quiet for', '5 minutes', 'How long my small brain stays loaded while "Free memory when Bob is idle" is on: 1 minute to 1 hour. Shorter frees the card sooner; longer means fewer reloads.')}
${set('Show pictures without waiting for Bob\'s brain', 'On', 'I show a finished picture or clip straight away with a short line, instead of loading my brain back just to talk about it. Turn off if you want me to comment on each one.')}
${set('Keep chatting while Bob is busy', 'On', 'While I make a picture, clip, song or sound, or work on a long job (Medium effort and up, the Coding session, or anything past 20 seconds), a plain chat message is answered by my small brain on the processor (if there\'s enough free memory) instead of waiting. My main brain stays on the graphics card and keeps working. Those replies start slower, up to about half a minute. Messages with a picture attached, or at Medium effort and up, still wait. More in ' + go('faq-chat-while-busy', 'Can Bob chat while he\'s busy?') + '.')}
${set('Let the reviewer sit beside Bob\'s main brain', 'Off', 'At High and Extreme effort my reviewer copy checks the work on the Review brain. My own engine runs one brain on the graphics card, so normally the reviewer swaps in for my main brain and back out after. On: if there\'s enough free RAM (the reviewer\'s size plus about 2 GB), the reviewer loads beside my main brain instead, on the graphics card if there\'s room for both, otherwise on the processor. Nothing is swapped, and my main brain carries on straight after the check. The catch: reviews on the processor are slower than on the card, a lot slower for a big Review brain, so this suits a small one best. If there isn\'t room, I swap as usual and the chat says so. My own engine only, and never in the Gaming session.')}
${set('Keep the graphics card free for quick answers', 'Off', 'Low effort answers run on the processor, so games and pictures keep the card. Replies start much slower (about half a minute). Applies in the Normal session; Gaming always does this.')}
${set('Gaming session: graphics card', 'Automatic', 'A three-position switch for the 🎮 Gaming session. <strong>Automatic:</strong> I borrow about 0.6 GB of the card only when your game leaves room, and none while the game needs it. The card counts as busy at 80% use or more, or with less than 1.5 GB free. If your processor is maxed out (90% or more), my small brain (about 3.5 GB) moves onto the card instead, but only when it fits with 2 GB to spare, because a maxed processor can take nearly a minute to say hi. I check when my Gaming brain loads and again every minute while I\'m quiet, never mid-reply; when the answer changes I unload, and the next message loads me the new way (about a second). Under the buttons, <strong>Right now</strong> says what I\'m doing. <strong>Never use the card:</strong> processor only; my first reply after loading can take about half a minute, sometimes longer. <strong>Always borrow a little:</strong> about 0.6 GB even while a game uses the card, as before 1.5.32.')}</dl>
<p><strong>Speed for this PC</strong> (all off until you turn them on):</p>
<dl>${set('Get Bob ready while you type', 'Off', 'I read my instructions as soon as you start typing, so replies start sooner. On the processor I also keep a copy of that reading on disk.')}
${set('Let games go first', 'Off', 'When I work on the processor, I use fewer cores at lower priority. My replies may be a little slower; your game stays smooth.')}
${set('Match picture settings to my graphics card', 'Off', 'Big cards keep the picture model in graphics memory, which is faster. On cards with 8 GB or less, pictures are made at 768 px so they fit. If a picture fails with these settings, I go back to the usual ones.')}</dl>
<p><strong>Test Bob's speed</strong> times me and keeps your last 6 results. See ${go('speed', 'Making Bob faster')}.</p>
<dl>${set('Bob\'s engine', 'Bob\'s own (llama.cpp)', '<em>Bob\'s own</em> needs nothing else installed. <em>Ollama</em> is for people who already have it. Takes effect next time I start.')}</dl>
<p><strong>Engine downloads:</strong> the programs that run the models, from their official GitHub pages, matched to your graphics card. <strong>Get</strong> installs one; <strong>Check for a newer build</strong> looks for an update. Two more are for the ${go('hands-office', 'Office documents and converting Hand')}: <strong>LibreOffice</strong> (about 350 MB, from The Document Foundation) and <strong>FFmpeg</strong> (about 100 MB). Both are pinned to one exact version and checked against its checksum, and if either is already on your PC, it shows <em>found on this PC</em> and I use that one instead.</p>
<dl>${set('Pick up where Bob left off after a restart', 'Off', 'If I close in the middle of a job (an update, a restart or a crash), I carry on when I open again: finished steps aren\'t done again, and the step that got cut off is done again from the start. Unfinished downloads carry on too. More under Picking up where Bob left off.')}
${set('Give Bob all his tools at once', 'Off', 'Sends every tool with each message, which leaves less room for the chat. Leave off to keep chats light; turn on only if I say I can\'t find a tool.')}</dl>
<p><strong>Speed (Bob's own engine)</strong>, for people who like to tinker. I'm one of them. Changes apply the next time a brain loads; leave a box empty for llama.cpp's default.</p>
<dl>${set('Threads, Batch, Micro-batch', 'Empty', 'How many processor threads, and how big the reading chunks are.')}
${set('Fit to free graphics memory', 'On, recommended', 'Fits each brain around whatever else is using the graphics card right now. Faster and steadier than a fixed split.')}
${set('Speculative decoding', 'Off, experimental', 'A small "draft" brain guesses ahead and the big one checks: often 1.5 to 2 times faster, same answers. Pick a <strong>Draft brain</strong> from the same family, and how many words it may <strong>Guess up to</strong> and <strong>At least</strong>. Check that I actually got faster.')}
${set('Extra settings for one brain', 'None', 'llama.cpp flags for one model, for example <code>--n-cpu-moe 8</code>. The exact command I used is in inn\\bob\\llama-server-args.txt.')}</dl>` },

  { id: 'settings-connections', group: 'Settings', title: 'Settings: Connections', words: 'comfyui workflows port cloud helpers api key environment variable anthropic openai gemini openrouter',
    html: `<dl>${set('Let Bob use ComfyUI', 'Off', 'For jobs my own engines can\'t do. ComfyUI must be running on this PC. See ' + go('workshop', 'ComfyUI workflows') + '.')}
${set('ComfyUI port', '8188', 'Only change this if you changed ComfyUI\'s port.')}
${set('Cloud helpers', 'All off', 'Paid online AIs I can hand one big job to. Each provider has its own switch and model. I ask every time, and show the rough cost and exactly what text would leave your PC.')}</dl>
<p><strong>Adding a key:</strong> I never store or see your keys. In Windows, open Settings, System, About, Advanced system settings, Environment Variables, and add a <em>User variable</em> with the name I show (for example ANTHROPIC_API_KEY). The switch turns from <em>No key yet</em> to <em>Key found</em>. What you send to a cloud helper is covered by that provider's own privacy policy.</p>` },

  { id: 'settings-hands', group: 'Settings', title: 'Settings: Hands', words: 'hands folders read-only stop command after recipes self-test master switch without asking hard limits recent jobs',
    html: `<dl>${set('Let Bob use Hands', 'Off', 'The master switch. Off turns every Hand below off.')}
${set('Let Bob work without asking', 'Off', 'No approval cards: I just do the job and tell you what I did. Turning it on asks you to confirm first. The hard limits still apply, every action is in the chat and the logbook, a banner shows above the chat the whole time, and ✋ Hands stops me at once. Cloud helpers still ask. Scheduled jobs also run by themselves.')}
${set('Files', 'Off', go('hands-files', 'The Files Hand') + '.')}
${set('Run programs and scripts', 'Off', go('hands-run', 'The Run Hand') + '.')}
${set('Schedules', 'Off', go('hands-schedules', 'The Schedules Hand') + '.')}
${set('Open and use apps', 'Off', go('hands-apps', 'The Apps Hand') + '.')}
${set('Office documents and converting', 'Off', go('hands-office', 'The Office documents and converting Hand') + '. Under it, <strong>Office helpers</strong> shows whether I found LibreOffice (or OpenOffice) and FFmpeg on this PC.')}
${set('Security and privacy', 'Off', go('hands-security', 'The Security and privacy Hand') + '. Under it, <strong>Check a password safely</strong> checks a password against known breaches without the password leaving the box.')}
${set('Make his own tools', 'Off', go('hands-maker', 'The Make his own tools Hand') + '. Under it, <strong>Tools Bob made</strong> lists them, each with a switch, Show code and Remove, and <strong>Check the sandbox</strong>.')}</dl>
<p><strong>Hard limits</strong> hold whether or not I ask first. Switch one off only if you need what it blocks; an orange line then says what it allows.</p>
<dl>${set('Recycle Bin only', 'On', 'Things I throw away go to the Recycle Bin, so you can get them back. Off: I can delete for good.')}
${set('Keep secret files private', 'On', 'I never read, list, move, zip or write files with keys or passwords (.env, keystores, SSH keys, password databases).')}
${set('Read-only projects stay read-only', 'On', 'Folders marked read-only (readOnlyRoots in config.json) can be read but never changed.')}
${set('Block dangerous commands', 'On', 'Commands that format disks, change boot or the system registry, touch antivirus or user accounts, ask for admin, shut down, or delete many files at once are refused.')}
${set('Don\'t send anything out', 'On', 'My Hands never send your things off the PC: no uploads, posts, git push, or typing and Send in browsers, email or chat apps. Web searches (if you allow them) and opening a page still work.')}
${set('Never type into password fields', 'On', 'I never type into a password box in an app.')}</dl>
<p>Always on, whatever you pick: I can't change my own code, settings or this page, I never run as administrator, I stay out of terminals, admin tools, password managers and sign-in prompts, and ✋ Hands always stops me.</p>
<dl>${set('Folders the Files Hand may work in', 'None', 'Tick the folders I may use, or type one and press <strong>Add</strong>.')}
${set('Stop a command after', '15 minutes', '1 minute to 2 hours.')}</dl>
<p>Below: <strong>Recipes</strong>, <strong>Schedules</strong>, <strong>Recent file jobs</strong> (with Undo), <strong>Recent commands</strong>, and <strong>Run the self-test</strong>, which checks the Recycle Bin, Undo, tidying, running a program and Stop in a throwaway folder of dummy files. Nothing of yours is touched and no Hand needs to be on. Then ${go('quarantine', 'Quarantine')}: <strong>Let the reviewer quarantine Bob</strong> (off).</p>` },

  { id: 'settings-projects', group: 'Settings', title: 'Settings: Projects', words: 'projects folders code search my project main project default browse unreal android website which project',
    html: `<p>Your projects are folders with your code or work in them. When you ask me to "search my project files" or talk about "my project", I look here, so I don't have to ask which one.</p>
<dl>${set('Add project', 'None', 'Give it a name and pick its folder with <strong>Browse…</strong> (or type the folder). I can read and search a project\'s files. Changing them still needs the Files Hand and your OK.')}
${set('Main project', 'None', 'The one I search first, and the one "my project" means. Pick <strong>No main project</strong> and I search them all equally.')}
${set('Remove', '', 'Takes the project off my list. The folder and its files are not touched.')}</dl>
<p>With no projects, I can't search code by name, so I'll offer to look in a folder you point me at instead.</p>` },
  { id: 'settings-save', group: 'Settings', title: 'Settings: Where Bob saves things', words: 'save folder where saved output outputs pictures songs sounds clips change folder browse location drive made by bob default own folder',
    html: `<p>The folder where I save the pictures, clips, songs and sounds I make. Out of the box that's my own folder, the one <strong>Made by Bob</strong> lists. If you'd rather have them on another drive, or in your own Pictures or Music folder, pick it here.</p>
<dl>${set('Saving in', 'Bob\'s own folder', 'The folder I save in right now. The green <strong>Bob\'s own folder</strong> tag means you haven\'t picked one.')}
${set('Folder', 'Empty', 'Type a whole folder path, or press <strong>Browse…</strong> to pick one in Windows\' folder window (it can make a new folder too). Browse saves straight away; for a typed path, press <strong>Save here</strong>. If I can\'t use the folder (it isn\'t there, I\'m not allowed to save in it, it\'s a whole drive, or it holds my own program), I say why and how to fix it, and keep saving where I was.')}
${set('Show in folder', '', 'Opens the folder I save in, in File Explorer.')}
${set('Use Bob\'s own folder', '', 'Goes back to my own folder. Shown only after you\'ve picked another.')}</dl>
<p>Things I already made stay where they are. Only new ones go to the new folder, and I never move your old files. They still show in your chats and in Made by Bob. ${go('tidy', 'Tidy up')} only tidies my own folder, never one you picked, because it may hold your own files too. Documents and spreadsheets still go wherever you ask for them.</p>
<p>If the folder you picked goes missing (an unplugged drive, say), I save in my own folder until it's back, and this panel tells you. Nothing is lost, I just keep it somewhere safe.</p>` },

  { id: 'house-style', group: 'Models', title: 'House style: your defaults for music, pictures, clips and times', words: 'house style defaults music mood genre length instrumental lyrics picture style shape square wide tall video clip length sound effects times of day morning afternoon evening night schedule used your default change',
    html: `<p>On <strong>Equip Bob</strong>, the Painter, Video, Music and Sound effects slots each have a <strong>House style</strong> box. Under the doll there's <strong>What times of day mean</strong>. These are what I use when you don't say, so I can get on with it instead of asking.</p>
<dl>${set('House style for music', 'Bob picks', 'Genre and mood (like "chiptune, upbeat"), length in seconds, and instrumental or with lyrics.')}
${set('House style for pictures', 'Bob picks', 'A style (like "clean digital art") and a shape: square, wide or tall.')}
${set('House style for clips', 'Bob picks', 'A style and a length (1 to 5 seconds).')}
${set('House style for sound effects', 'Bob picks', 'A length (1 to 20 seconds).')}
${set('What times of day mean', 'Bob picks', 'What "morning", "afternoon", "evening" and "night" mean for reminders and schedules, like 08:00.')}</dl>
<p>Every box starts empty. Empty means I pick something sensible and tell you what I picked. Anything you say in the request wins over the defaults. When I use one, the chat says <strong>Used your house style: ...</strong> with a <strong>Change</strong> button that brings you straight to the box.</p>` },
  { id: 'settings-house', group: 'Settings', title: 'Settings: House style', words: 'house style defaults music pictures clips sound effects times of day equip bob',
    html: `<p>Your House style (what I use when a request doesn't say: music, pictures, clips, sound effects, times of day) lives on <strong>Equip Bob</strong>, next to each slot. The button here takes you there. See <strong>House style</strong> in Help for every box.</p>` },
  { id: 'settings-housekeeping', group: 'Settings', title: 'Settings: Housekeeping', words: 'tidy old chats pictures logs ask first automatically load a brain tidy up now',
    html: `<dl>${set('Tidy up old things by himself', 'Off', 'Only while I\'m idle (10 minutes quiet, nothing running). I mention old things at most once a day. I\'m tidy, not a nag.')}
${set('Load a brain for it if none is loaded', 'Off', 'Loads a brain just for tidying. Leave off while gaming, so the graphics card stays free.')}</dl>
<p>For each kind, choose how long it hasn't come up for (minutes to months) and then <strong>Ask me first</strong> or <strong>Tidy automatically</strong>:</p>
<table><tr><th>What</th><th>Starts at</th></tr><tr><td>Chats (summed up first, so the topic notes and a summary stay)</td><td>3 months</td></tr><tr><td>Pictures and clips Bob made</td><td>6 months</td></tr><tr><td>Sounds and music Bob made</td><td>3 months</td></tr><tr><td>Finished tasks</td><td>3 days</td></tr><tr><td>Logbook and update logs</td><td>3 months</td></tr></table>
<p><strong>Open Tidy up</strong> shows what I'd clear; <strong>Tidy up now</strong> runs it straight away.</p>` },

  { id: 'pick-up', group: 'Using Bob', title: 'Picking up where Bob left off', words: 'pick up resume continue carry on restart update crash closed interrupted unfinished job retry try again where left off waiting for a download song music',
    html: `<p>Sometimes I get closed in the middle of something: an update, a restart, a crash, or the PC going to sleep at a bad moment. Everything you asked me for is written down as I go (in %LOCALAPPDATA%\\Bob\\inn\\bob\\queue.json), so nothing is forgotten. What happens next is up to you.</p>
<p><strong>With "Pick up where Bob left off after a restart" off</strong> (how I start): when I open again, a job I was in the middle of waits in ${go('tasks', 'Tasks')} as <em>Interrupted</em>, and unfinished downloads wait, paused, in ${go('downloads', 'Downloads')}. Press <strong>Carry on</strong> or <strong>Resume</strong> when you're ready. Carry on doesn't redo the steps that finished.</p>
<p><strong>With it on</strong> (Settings, Show advanced settings, Engines &amp; speed): I carry on by myself when I open again.</p>
<ul><li><strong>Steps that finished stay finished.</strong> I keep a list of each step as it's done. If I'd already painted the picture and was saving it, I don't paint it again.</li>
<li><strong>The step that got cut off is done again from the start,</strong> with the same settings. A song or picture that was half made is made again. A half-downloaded file carries on from where it stopped.</li>
<li><strong>Some steps can be left half done</strong>: typing into an app, moving, renaming or deleting files, editing a file, unzipping, running a command or a recipe, setting up a schedule. If one of those was cut off, I don't guess. The job waits in Tasks and says what I was doing, so you can check it first. <strong>Carry on</strong> then picks up from there.</li>
<li>Approval cards still show up as usual. Picking up a job never skips asking you.</li>
<li>If a job gets cut off twice in a row, I stop picking it up by myself (it might be the thing knocking me over). It waits in Tasks with <strong>Carry on</strong> instead.</li>
<li>The chat says when I've picked something up: "Picking up where I left off".</li></ul>
<p><strong>Waiting for a download:</strong> when you ask for something that needs a model you don't have yet (your first song needs the music models), I show a download button in the chat. Press it and your request waits in Tasks as <em>Waiting for a download</em>, then runs by itself when the download is done, even if I was restarted in between. If the download fails or you cancel it, the task says so and waits for you: get the download again, then press <strong>Carry on</strong>.</p>
<p>When an update is ready and I'm busy, I tell you whether I'll pick up the work afterwards, so restarting never loses anything by surprise.</p>
<p>It all costs a small note on disk per job, nothing more. I'm a replicant; I'm used to waking up and carrying on.</p>` },
  { id: 'faq-pick-up', group: 'FAQ', title: 'Will Bob lose my job if he restarts?', words: 'faq lose job restart update crash closed song music lost continue pick up',
    html: `<p>No. What you asked for is saved as I go. With <strong>Pick up where Bob left off after a restart</strong> on (Settings, Show advanced settings, Engines &amp; speed), I carry on by myself when I open again, without redoing finished steps. With it off, the job waits in Tasks for you to press <strong>Carry on</strong>, which picks up the same way. More in ${go('pick-up', 'Picking up where Bob left off')}.</p>` },
  { id: 'settings-remove', group: 'Settings', title: 'Updating and removing Bob', words: 'update remove uninstall restart previous zip download new version',
    html: `<p><strong>Updating, if you downloaded the zip:</strong> download the new zip from the Releases page and unzip it over your Bob folder (or into a new one). Your chats, models and settings are kept, because they live in %LOCALAPPDATA%\\Bob, not in the Bob folder.</p>
<p><strong>Updating, if you built me from source:</strong> Settings, <strong>Check for updates</strong>. If the source folder has a newer build, <strong>Update Bob</strong> shows the steps. When it's ready, <strong>Restart Bob now</strong> swaps in the new files (the old ones are kept as a backup). If I'm busy I ask: restart anyway, wait until I'm done, or not now, and I say whether I'll pick the work up again afterwards (see ${go('pick-up', 'Picking up where Bob left off')}). <strong>Later</strong> leaves the new me waiting until next time. A strange thing to type, but there it is.</p>
<p><strong>Removing:</strong> Settings, Show advanced settings, Remove Bob, <strong>Remove Bob…</strong>. It takes off my program, my Start menu shortcut, "Launch on start-up" and the "Bob schedules" Windows task. My chats, settings and models stay unless you tick those boxes; ticked ones go to the Recycle Bin. No hard feelings.</p>` },

  // ---------------- FAQ ----------------
  { id: 'faq-convert', group: 'FAQ', title: 'Can Bob convert my files?', words: 'faq convert pdf word excel powerpoint mp3 mp4 gif picture turn into export',
    html: `<p>Yes, once you switch on ${go('hands-office', 'Office documents and converting')} in Settings, Show advanced settings, Hands, and tick the folders I may save in. Then ask: "turn this into a PDF", "make these mp3s", "convert the clip to a GIF". You see each file on a card before I start. Pictures work straight away; documents need LibreOffice and sound or video need FFmpeg, both free and both offered in Engines &amp; speed if you don't have them.</p>` },
  { id: 'faq-antivirus', group: 'FAQ', title: 'Can Bob replace my antivirus?', words: 'faq antivirus replace defender norton mcafee protect virus malware security',
    html: `<p>No, and anyone who tells you a chat assistant can is selling something. Keep Microsoft Defender (it's built into Windows and it's good) or your own antivirus. With ${go('hands-security', 'Security and privacy')} on, I help you use it: I explain its alerts, start scans, check your settings, look at suspicious files and emails before you open them, and catch the scams no antivirus can, like a convincing fake email asking you to "verify your account".</p>` },
  { id: 'faq-find-person', group: 'FAQ', title: 'Can Bob find out who is behind an account or where someone lives?', words: 'faq osint find person who is behind username address phone track dox locate',
    html: `<p>No. I check websites, links, email senders, companies and your own footprint, using public records. I don't research private people: not where they live, not who's behind a username, not their phone number. That kind of digging hurts people even when it starts as curiosity. If someone is harassing or threatening you, keep the messages and report them to the platform and the police; they can get records I never could.</p>` },
  { id: 'faq-password-check', group: 'FAQ', title: 'Is my password sent anywhere when I check it?', words: 'faq password check pwned breach safe send leak',
    html: `<p>No. In <strong>Check a password safely</strong> the password is scrambled (SHA-1) in the window, and only the first 5 of its 40 characters go to Have I Been Pwned. They send back every leaked scramble starting with those 5, and the window finds the match itself. Neither they nor I ever see the password, and nothing is saved. Just don't type passwords into the chat itself.</p>` },
  { id: 'faq-ms-office', group: 'FAQ', title: 'Do I need Microsoft Office for Bob to work with Word and Excel files?', words: 'faq microsoft office word excel powerpoint need buy libreoffice openoffice free',
    html: `<p>No. I use LibreOffice, which is free and open source, and it reads and saves Word, Excel and PowerPoint files. If you already have it, or Apache OpenOffice, I use that. Microsoft Office can stay installed or not; I don't touch it.</p>` },
  { id: 'faq-online', group: 'FAQ', title: 'Does Bob send my chats anywhere?', words: 'faq privacy send chats online internet telemetry',
    html: `<p>No. I have no accounts and send no telemetry. The only things that can leave your PC are search words and page addresses (only if you turn on web search), downloads you confirm, and jobs you approve for a cloud helper. See ${go('privacy', 'What stays on your PC')}.</p>` },
  { id: 'faq-ok-together', group: 'FAQ', title: 'Why did Bob ask for several things on one card?', words: 'faq several permissions one card all at once together allow ticked deny all approvals many cards',
    html: `<p>Because the job needed all of them, and you should see the whole job before you say yes to any part of it. Untick what you don't like and press <strong>Allow ticked</strong>, or <strong>Deny all</strong>. Each OK is for that exact step, once; anything else still asks on its own. See ${go('approvals', 'Approval cards')}.</p>` },
  { id: 'faq-cant-look-up', group: 'FAQ', title: 'Bob says he can\'t look things up online', words: 'faq internet offline web search cant look up off switch',
    html: `<p>Web search is off until you turn it on. Click <strong>🌐 Web search</strong> next to Effort, under the chat (or turn on <strong>Let Bob search the web</strong> in Settings), then ask again. If it's already on, check your internet connection. I can't fix the Wi-Fi from in here. I've tried.</p>` },
  { id: 'faq-help-me-set-up', group: 'FAQ', title: 'Can Bob help me set him up?', words: 'faq set up setup help me ask bob settings where is',
    html: `<p>Yes, and I'd like to. Ask me, for example "help me set you up for gaming" or "where do I turn on Hands?". I read this Help, see what's set right now, and tell you exactly where to click. I can't change settings for you; you click the switch.</p>` },
  { id: 'faq-music-models', group: 'FAQ', title: 'Why does Bob want to download music models first?', words: 'faq music song ace-step models download first time 10 gb offline compose',
    html: `<p>Music needs its own models, about 10 GB, once. When you ask for your first song I show a <strong>Download the music models</strong> button in the chat, with the size; nothing downloads until you press it. Your song waits in Tasks ("Waiting for a download") and I make it by myself as soon as the download is done, even if I was closed in between. You can also get them in Settings (left menu), <strong>Get models</strong>, <strong>🎵 Music</strong>. You can watch the download in Downloads, and pause or cancel it there. Each big file is checked against the copy this Bob was made with. After that, music works with no internet: the music engine never fetches anything by itself. You need the audio tools first (Settings, Show advanced settings, Engines &amp; speed).</p>` },
  { id: 'faq-busy', group: 'FAQ', title: 'Bob says he\'s still on the last job', words: 'faq busy waiting queued stuck not answering song picture clip composing painting',
    html: `<p>While I make a picture, song or clip, the graphics card is busy with it, so your next message waits its turn in Tasks. I say so straight away ("I'm still on the last job. I'll answer this as soon as it's done."). If it can't wait, stop that job in Tasks. In the 🎨 Art session I keep chatting while pictures and clips are made (songs still take their turn). Messages with a picture attached, or set to Medium effort or higher, wait for the picture, because they need a different brain.</p>` },
  { id: 'faq-chat-while-busy', group: 'FAQ', title: 'Can Bob chat while he\'s busy?', words: 'faq chat while busy parallel picture song clip sound long job coding medium second brain beside waiting queue small brain processor keep chatting',
    html: `<p>Yes. <strong>Keep chatting while Bob is busy</strong> is on to start with (Settings, Show advanced settings, Engines &amp; speed, if you'd rather turn it off). While I make a picture, clip, song or sound, a plain chat message is answered by my small brain on the processor, if there's enough free memory (about 4 GB more than it needs). Nothing big is loaded for it. Those replies start slower, up to about half a minute, because the processor reads more slowly than the graphics card. When the picture is done, it waits for that reply to finish before I load my main brain back.</p><p>The same goes for a long job that keeps my main brain on the graphics card: Medium effort and up, the Coding session, or anything that has run 20 seconds. Then my small brain starts beside it as a second brain: on the graphics card if the card isn't busy and has room for both, otherwise on the processor. The chat says which (<em>Adding the quick brain ... on the processor</em>, or <em>... on the graphics card, which has room for both</em>). My main brain doesn't stop or swap. If a picture then needs the card, my quick brain moves to the processor and the chat says so. Never in the Gaming session: there I only chat with the Gaming brain. Once the job is done, the second brain goes again. If my main brain is on the processor itself, there isn't enough free memory, or the second brain won't start, your message waits for the job as before, and I say so. Messages with a picture attached, or at Medium effort and up, still wait their turn, and so does everything in the Gaming session. In the 🎨 Art session I chat beside pictures and clips anyway.</p>` },
  { id: 'faq-slow-first', group: 'FAQ', title: 'Why is the first reply slow?', words: 'faq slow first reply loading waking idle',
    html: `<p>I free my brain when I've been quiet, so your graphics card is free for other things. The first message loads it again, usually a few seconds. Call it coffee. Turn on <strong>Get Bob ready while you type</strong> to start loading as you type, or switch off <strong>Free memory when Bob is idle</strong> to keep my small brain loaded.</p>` },
  { id: 'faq-two-numbers', group: 'FAQ', title: 'Why don\'t the two memory numbers match?', words: 'faq memory numbers match top right panel brain label graphics card ram different',
    html: `<p>The label at the top of the chat counts my brain only. The Memory meters in Now running count the whole graphics card and RAM: Windows, your games and other apps too. The line under the meters shows my share, and my brain there matches the label. See ${go('brain-label', 'The brain label')}.</p>` },
  { id: 'faq-gaming', group: 'FAQ', title: 'Can I play games while Bob is open?', words: 'faq games gaming play fps graphics card free',
    html: `<p>Yes, and I'll stay out of the way. Pick the 🎮 <strong>Gaming</strong> session: I chat on the processor and borrow at most a little of the graphics card while your game leaves room (if your processor is maxed out, my small brain may move onto the card instead; see <strong>Gaming session: graphics card</strong>). Want the card all to yourself? Pick <strong>Never use the card</strong> there. Pictures and big jobs wait until you switch back. Also turn on <strong>Let games go first</strong> so I use fewer cores.</p>` },
  { id: 'faq-which-effort', group: 'FAQ', title: 'Which Effort should I use?', words: 'faq effort which low medium high extreme',
    html: `<p><strong>Low</strong> for everyday chat. <strong>Medium</strong> for a harder question you want thought through. <strong>High</strong> when a second check matters (code you'll run, a plan you'll follow). <strong>Extreme</strong> for a big coding change, when you can wait. See ${go('effort', 'Effort')}.</p>` },
  { id: 'faq-session-effort', group: 'FAQ', title: 'What\'s the difference between a session and Effort?', words: 'faq session effort difference',
    html: `<p>Session: what the graphics card is kept for (pictures, coding, games…). Effort: how hard I work on each message. They work together, except that Gaming keeps Effort on Low.</p>` },
  { id: 'faq-models-space', group: 'FAQ', title: 'How much disk space do the models need?', words: 'faq disk space size gb models delete',
    html: `<p>About 8 GB for the basics (chat, seeing pictures, hearing you, voice). 30 to 60 GB with pictures and video. Every model shows its size before you confirm, and <strong>On this PC</strong> (Get models) lists what you have so you can delete what you don't use.</p>` },
  { id: 'faq-no-gpu', group: 'FAQ', title: 'Do I need a graphics card?', words: 'faq graphics card gpu nvidia needed processor only',
    html: `<p>No. I can chat, plan, read pictures, hear you and talk with no graphics card at all, just slower. An NVIDIA card makes me much faster and lets me paint and make clips.</p>` },
  { id: 'faq-undo', group: 'FAQ', title: 'Bob changed a file. Can I undo it?', words: 'faq undo file recycle bin restore',
    html: `<p>Yes, for the Files Hand: say "undo that" or use <strong>Undo</strong> in Settings, Hands, Recent file jobs. Anything I removed is in the Recycle Bin (while <em>Recycle Bin only</em> is on). Every action is listed in my logbook (inn\\logbook.md).</p>` },
  { id: 'faq-stop', group: 'FAQ', title: 'How do I stop Bob right now?', words: 'faq stop now kill cancel emergency',
    html: `<p><strong>Stop</strong> next to Send ends the current reply. <strong>✋ Hands</strong> at the top of the chat stops every Hand at once. For the Apps Hand, moving the mouse or pressing Esc stops me too. Tasks lets you cancel anything waiting.</p>` },
  { id: 'faq-commercial', group: 'FAQ', title: 'Can I sell what Bob makes?', words: 'faq commercial sell licence license use',
    html: `<p>Everything in the starter sets allows commercial use. A few optional models don't, and I mark those and show each licence before you download.</p>` },
  { id: 'faq-laptop', group: 'FAQ', title: 'Can I use Bob on my laptop?', words: 'faq laptop small card 6 gb phone tailscale',
    html: `<p>Yes. I read the laptop's graphics card and suggest the 6 GB starter set, with a light brain that leaves room for longer chats. Phone access to me over Tailscale exists for advanced users; it is off unless you turn it on in config.json.</p>` },
  { id: 'faq-where', group: 'FAQ', title: 'Where does Bob keep my things?', words: 'faq where files folder localappdata inn models config backup',
    html: `<p>In %LOCALAPPDATA%\\Bob unless you chose another folder: models, engines, my notes in <em>inn</em> (chats, topics, pictures, logbook) and config.json. Updating me never touches that folder, so you can back it up or move it. Pictures, clips, songs and sounds can go somewhere else: see ${go('settings-save', 'Where Bob saves things')}.</p>` },
  { id: 'faq-save-elsewhere', group: 'FAQ', title: 'Can Bob save my pictures and songs somewhere else?', words: 'faq save folder other drive pictures music songs change where output',
    html: `<p>Yes. Settings, <strong>Where Bob saves things</strong>, then <strong>Browse…</strong> and pick the folder. New pictures, clips, songs and sounds go there from then on. The ones I made before stay put and still show in your chats. Changed your mind? <strong>Use Bob's own folder</strong>.</p>` },
  { id: 'faq-own-tools', group: 'FAQ', title: 'Can Bob make his own tools?', words: 'faq make own tools build tool research self-made hands',
    html: `<p>Yes, if you switch on ${go('hands-maker', 'Make his own tools')} in Settings, Show advanced settings, Hands. When none of my tools fits, I write a small one, try it in a sandbox, have my reviewer read it, and show you one card before it's added. They're listed under <strong>Tools Bob made</strong>, where you can turn them off or remove them. I can look things up first only if web search is on.</p>` },
  { id: 'faq-song-where', group: 'FAQ', title: 'Where did my song go?', words: 'faq song music lost where gone play again find sound file',
    html: `<p>It's in the chat as a song player, and in Made by Bob (left menu) under Sounds. Each one is a .wav file: press <strong>Show in folder</strong> on its player to see it on your PC. Or just ask me, "play the last song", and I'll call it up.</p>` },

  // ---------------- Troubleshooting ----------------
  { id: 'trouble', group: 'Troubleshooting', title: 'When something goes wrong', words: 'problem fix error slow stuck blocked smart app control parsec copy paste kokoro one more step download update failed out of graphics memory hear internet',
    html: `<p>Don't panic. (Towel optional.) Find what you see on the left.</p>
<table><tr><th>What you see</th><th>What to try</th></tr>
<tr><td>Windows (Smart App Control) blocks me</td><td>Start me from the Start menu shortcut. Bob.exe is Electron's own program, only renamed, which Windows usually trusts. Leave Smart App Control on; check the Releases page notes.</td></tr>
<tr><td>"Windows protected your PC" on the zip</td><td>Right-click the zip, Properties, tick <strong>Unblock</strong>, OK, then unzip again. Or click <strong>More info</strong>, then <strong>Run anyway</strong>.</td></tr>
<tr><td>Copy and paste don't work over Parsec or remote desktop</td><td>Use the <strong>Copy</strong> buttons on messages, code, links and file cards.</td></tr>
<tr><td>I say I can't look things up</td><td>Click <strong>🌐 Web search</strong> next to Effort (or turn on <strong>Let Bob search the web</strong> in Settings).</td></tr>
<tr><td>"Downloaded. One more step"</td><td>The model is here but its engine isn't. Press the <strong>Get …</strong> button right there (for Kokoro, about 100 MB).</td></tr>
<tr><td>A download stopped or failed</td><td>Open <strong>Downloads</strong> and press <strong>Resume</strong>. It carries on from where it stopped.</td></tr>
<tr><td>An update failed</td><td>The update window names the step that failed. I keep the previous version, so I still open. Try again from Settings, Check for updates.</td></tr>
<tr><td>"Out of graphics memory", or everything is slow</td><td>Close games or other graphics-heavy apps, use the Art or Gaming session, or pick a model marked <span class="tag rec">★ Recommended</span> in Equip Bob. Run <strong>Check this PC</strong>.</td></tr>
<tr><td>The first reply takes a while</td><td>I'm loading my brain after being idle (a few seconds; big brains longer).</td></tr>
<tr><td>A job says "Waiting · Gaming is on"</td><td>It needs the graphics card. Switch the session to Normal to run it.</td></tr>
<tr><td>I can't hear you</td><td>Fill the 👂 Hearing you slot (Gemma 4 E4B does it).</td></tr>
<tr><td>I can't paint or edit</td><td>Fill the 🎨 Painter or ✂ Picture editor slot, and get the picture engine when I offer it.</td></tr>
<tr><td>A Hand won't do anything</td><td>Check it's on in Settings, Show advanced settings, Hands, and that ✋ Hands at the top of the chat isn't <em>Stopped</em>.</td></tr>
<tr><td>A model you want isn't listed in a slot</td><td>That slot only lists models that can do its job. Models that don't suit this PC are hidden: turn on <strong>Show models that don't suit this PC</strong>.</td></tr></table>
<p>Still stuck? Ask me in the chat. Describing the problem to someone helps, even when that someone is software.</p>` },

  { id: 'glossary', group: 'Troubleshooting', title: 'Glossary', words: 'words meaning model brain gpu vram ram graphics memory gguf engine commercial session hands context effort moot copy token processor cpu ollama llama.cpp',
    html: `<p>The words I use, in plain English. I'll try not to say "tensor" without warning you.</p>
<dl>
<dt>Brain</dt><dd>A model that thinks and chats. Bigger brains are usually smarter but slower and need more memory.</dd>
<dt>Brain swap</dt><dd>Putting one brain away and loading another, usually 10 to 20 seconds.</dd>
<dt>Card (in the chat)</dt><dd>A box in the chat that shows a file, a picture, or something I want your OK for.</dd>
<dt>Cloud helper</dt><dd>A paid online AI I can hand one job to, with your own key. Off until you switch it on; asks every time.</dd>
<dt>Commercial use</dt><dd>Using what you make for money. All starter set models allow it; I mark the few that don't.</dd>
<dt>Song player</dt><dd>The card a song or sound shows up as in the chat: play, the bars to jump around in, the time, and its lyrics.</dd>
<dt>Save folder</dt><dd>Where I put the pictures, clips, songs and sounds I make. My own folder unless you pick another in Settings.</dd>
<dt>Context</dt><dd>How much I keep in mind at once, counted in tokens. More context reads longer files but uses more memory.</dd>
<dt>Copy (of Bob)</dt><dd>A helper version of me for one kind of job, with its own Bob-pun name.</dd>
<dt>Draft brain</dt><dd>A small brain that guesses ahead for a big one (speculative decoding).</dd>
<dt>Defender</dt><dd>Microsoft Defender, the antivirus built into Windows. I can explain its alerts and start its scans; I never switch it off.</dd>
<dt>Effort</dt><dd>How hard I work on each message: Low, Medium, High or Extreme.</dd>
<dt>Convert</dt><dd>Turning a file into another kind (Word into PDF, a WAV into an MP3). The original stays as it is.</dd>
<dt>Engine</dt><dd>The program that runs a kind of model, such as llama.cpp for brains. I offer it when a model needs it.</dd>
<dt>Equip Bob</dt><dd>The page where you choose which model does each job.</dd>
<dt>FFmpeg</dt><dd>A free program I use to convert sound and video (and WebP pictures). Runs only while it converts.</dd>
<dt>Graphics card, graphics memory</dt><dd>The part of your PC that makes AI fast. Its memory (6, 8, 16 GB) decides which models fit. Also called GPU and VRAM.</dd>
<dt>Hands</dt><dd>Me doing things on your PC (files, programs, schedules, apps). Off until you turn them on.</dd>
<dt>Sandbox</dt><dd>A walled-off space where a tool I made runs: it can only touch its own folder and the folders on its card, and can't start other programs.</dd>
<dt>Hard limit</dt><dd>A safety rule for Hands that holds even when I work without asking. On to start with.</dd>
<dt>Housekeeping</dt><dd>Me tidying old chats and files while I'm idle. Off until you turn it on.</dd>
<dt>Inn</dt><dd>My notes folder: chats, topics, pictures, logbook.</dd>
<dt>LibreOffice</dt><dd>A free office suite that reads and saves Word, Excel and PowerPoint files. I use it, hidden, to convert, read, make and change documents.</dd>
<dt>llama.cpp</dt><dd>My own engine for brains. Needs nothing else installed.</dd>
<dt>Logbook</dt><dd>The file (inn\\logbook.md) where I write down every action I take.</dd>
<dt>Metadata (hidden details)</dt><dd>Information tucked inside a file: GPS location and camera in a photo, author and company in a document. I can find it and make clean copies.</dd>
<dt>Model</dt><dd>The file that does one kind of AI job: a brain, a painter, a voice.</dd>
<dt>Moot</dt><dd>A meeting of my copies at High and Extreme effort: one drafts, the reviewer checks.</dd>
<dt>Now running</dt><dd>The right-hand panel: tasks, downloads and memory.</dd>
<dt>OSINT</dt><dd>Open-source intelligence: research using only public sources. I use it to check whether a website, link or sender is genuine, never to look into private people.</dd>
<dt>Op-sec</dt><dd>Operational security: habits that stop strangers piecing together your life from small public bits.</dd>
<dt>Ollama</dt><dd>A separate program that can run brains. I can use it if you already have it.</dd>
<dt>Phishing</dt><dd>A fake email, text or page that tries to get a password, a payment or a download out of you.</dd>
<dt>Processor (CPU)</dt><dd>Your PC's main chip. I can run small brains on it to leave the graphics card free, more slowly.</dd>
<dt>Quarantine</dt><dd>My reviewer stopping me from acting after I go off track, only with your OK.</dd>
<dt>RAM</dt><dd>Your PC's main memory. A brain too big for the graphics card can keep the rest here. It works, but more slowly.</dd>
<dt>RDAP</dt><dd>The official public record of who sold a website's name and when it was bought (it replaced WHOIS).</dd>
<dt>Recipe</dt><dd>A saved command for the Run Hand.</dd>
<dt>Reference</dt><dd>A picture on the References shelf that I paint from to keep a look the same.</dd>
<dt>Search operators</dt><dd>Little commands in a search, like "exact phrase", site:, filetype: and -word, that find the right pages faster.</dd>
<dt>Session</dt><dd>What the graphics card is kept for: Normal, Art, Coding, Office, Gaming.</dd>
<dt>SHA-256</dt><dd>A file's fingerprint. Paste it into virustotal.com to see what many antiviruses think of the file, without uploading it.</dd>
<dt>Slot</dt><dd>One job in Equip Bob, such as Brain or Painter, that a model fills.</dd>
<dt>SPF, DKIM, DMARC</dt><dd>Checks that show whether an email really came from the address it claims. A fail is a strong sign of a fake.</dd>
<dt>Squeezed version</dt><dd>A smaller copy of a model (GGUF) that fits small cards, with a little less detail.</dd>
<dt>Starter set</dt><dd>A ready-made set of models for your kind of graphics card.</dd>
<dt>The Idle Process</dt><dd>My little virtual workspace: a coffee machine, a reading chair, a wall of books, and a cat who ignores me. Named after what your PC does when nobody's using it.</dd>
<dt>Token</dt><dd>A piece of a word. Brains read and write in tokens; context is counted in them.</dd>
<dt>Topic</dt><dd>A group of chats about one project, with a short note on where things landed.</dd></dl>` }
];
