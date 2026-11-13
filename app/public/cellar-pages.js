// Settings: the Everyday, Gaming, Other apps, Rented brains, Online, Bob-Net, Look, Jobs and memory pages. Split out of cellar.js.
import { keep, tip, noteOrTip } from './tips.js';
import { esc } from './util.js';
import { findTheme, DEFAULT_THEME } from './themes.js';
import { LANGS, pickLang } from './i18n.js';
import { dayWords, rentPicks, visibleModels } from './catalogue.js';
import { appsDoorHtml } from './apps-door.js';
import { claudeDoorHtml } from './claude-door.js';
import { agentsSettingsHtml } from './coding-agents.js'; // Nov 13 Coding agents
import { telegramHtml } from './telegram.js';
import { discordHtml } from './discord.js';
import { phoneAccessHtml } from './phone-access.js';
import { shareBrainsHtml } from './share-brains.js';
import { TEXT_MIN, TEXT_MAX, TEXT_STEP } from './everyday.js';

// now() hands over createCellar's own values as they are at the moment of each call; fresh() copies them in.
export function createSettingsParts(now) {
  let EVERY_EXTRA, cloud, data, eqCtx, howSumNow, hw, kokoroDefault, more, naughtyOn, notesFoldersHtml, panel, rent, rentPickOpen, settings, srow, sswitch, voicePickHtml, zoneLine;
  const fresh = () => { ({ EVERY_EXTRA, cloud, data, eqCtx, howSumNow, hw, kokoroDefault, more, naughtyOn, notesFoldersHtml, panel, rent, rentPickOpen, settings, srow, sswitch, voicePickHtml, zoneLine } = now()); };
  // "Let Bob work on repositories" (src/self-work.js): the switch, then (when on) the brain he uses, how much he keeps
  // in mind, and the list of repositories (his own first), each with its own code copy. Originals are never changed.
  const selfWorkHtml = () => {
    const w = settings.selfWork || {};
    const sizeName = (v) => (v >= 1048576 ? `${v / 1048576}M` : `${Math.round(v / 1024)}K`);
    const head = sswitch('selfWork', w.enabled === true, 'Let Bob work on repositories', keep('Off unless you turn it on. On: when you ask, Bob edits code in his own app or a repository on your list. He works on a copy with the brain you pick below (his biggest unless you change it), shows a card for every edit and command, and hands you a git branch and patch to look over. Nothing is sent anywhere. If Git or Node.js is missing, he downloads his own copy into his folder (35 to 55 MB each).'));
    // Every setting shows whether the switch is on or off, so it can be set first (the owner's rule, 2026-11-11).
    // The brain list (the owner, 2026-11-11): the biggest first, then your own brains and the ones doing a job, then the
    // catalogue's other brains here, then the catalogue's brains to get first.
    const groupName = { big: 'Recommended: the biggest', jobs: 'Your own brains and the ones doing a job', here: 'Other brains on this replicant matrix', get: 'In the catalogue, get it first' };
    const shown = w.model || (w.missing ? w.picked : ''); // the brain he'd really use; a picked one that isn't here yet only shows when nothing is
    const optName = (b) => `${b.name}${b.jobs?.length ? ` (${b.jobs.join(', ')})` : ''}${b.here === false ? ' (not downloaded)' : ''}`;
    const groups = ['big', 'jobs', 'here', 'get'].map((g) => [g, (w.brains || []).filter((b) => (b.group || 'big') === g)]).filter(([, l]) => l.length);
    const brain = w.brains?.length
      ? `<select data-selfwork="model" aria-label="Brain for working on repositories">${shown ? '' : '<option value="" selected>Pick a brain</option>'}${groups.map(([g, l]) => `<optgroup label="${esc(groupName[g])}">${l.map((b) => `<option value="${esc(b.id)}" ${b.id === shown ? 'selected' : ''}>${esc(optName(b))}</option>`).join('')}</optgroup>`).join('')}</select> ${tip('Bob uses his biggest brain unless you pick another: Bobert, else Qwen3.6 35B. Your own tuned brains and the brains doing a job show their jobs. A brain from the catalogue that isn\'t here yet needs Get models first. A smaller brain is quicker but makes more mistakes on a big repository.', 'Brain for these jobs')}${w.missing ? `<br><span class="muted">${esc(w.missing)} isn't downloaded yet: get it in Get models. Until then Bob uses the one shown here.</span>` : ''}`
      : '<span class="muted">There are no brains on this replicant matrix yet. Get one in Get models (Qwen3.6 35B-A3B is the one Bob would use), or add your own under Brains of your own.</span>';
    const mem = `<select data-selfwork="ctx" aria-label="Long memory for working on repositories">${(w.ctxChoices || [524288, 1048576]).map((v) => `<option value="${v}" ${v === w.ctx ? 'selected' : ''}>${sizeName(v)}</option>`).join('')}</select> ${tip('How much of a repository Bob keeps in mind at once on these jobs. Both are past what most brains were made for (Qwen3.6 35B: 256K), so it\'s stretched (Long memory). If the size won\'t fit your graphics card and RAM, he uses 256K and says so in the chat.', 'Long memory for these jobs')}`;
    const repoRow = (r) => srow(esc(r.name) + (r.own ? ' <span class="muted">(Bob himself)</span>' : ''),
      `<span class="muted">${esc(r.source)}</span>${r.ready ? `<br><span class="muted">Code copy: ${esc(r.dir)}</span>` : ''}`,
      `${r.ready ? '' : `<button type="button" class="mini" data-selfcopy="${esc(r.id)}">Make the code copy</button>`}${r.own ? '' : `<button type="button" class="mini" data-selfrm="${esc(r.id)}">Remove</button>`}`);
    const add = (w.repos || []).length - 1 < (w.maxRepos || 20)
      ? `<div class="row self-add"><input data-selfnew="name" maxlength="40" placeholder="Name" aria-label="Repository name" style="width:9em"><input data-selfnew="source" maxlength="400" placeholder="https link or folder" aria-label="Repository link or folder" style="flex:1;min-width:12em"><button type="button" class="mini" data-selfadd>Add</button> ${tip('A GitHub (or other https) link, or the full path of a folder on this replicant matrix that is already a git repository. Bob copies it with Git into his inn folder and only ever works on that copy. A private link needs Git here to know your sign-in already; a folder you cloned yourself always works.', 'Add a repository')}</div>`
      : '';
    const helpers = `<label class="switch srow-switch"><input type="checkbox" data-selfwork="helpers" ${w.helpers ? 'checked' : ''}><span><strong>Let my other Bobs help</strong>${noteOrTip(keep(`Off unless you turn it on. On a big job Bob splits the work into tasks; the research tasks (reading and looking things up) can go to your other Bobs on Bob-Net at the same time, but only ones running Bobert, Qwen3.6 35B or the brain picked above. They only think: what they read is read here and sent to them, and edits, commands and the patch always stay on this replicant matrix. ${w.bobNet ? `${w.bobNet} Bob${w.bobNet === 1 ? '' : 's'} on your Bob-Net list.` : 'Your Bob-Net list is empty: add your other Bobs in Settings, Bob-Net.'}`), 'Let my other Bobs help')}</span></label>`;
    return `${head}<div class="self-work-rows">${srow('Brain for these jobs', brain)}${srow('Long memory', mem)}${helpers}<h4 class="ssub">Repositories</h4>${(w.repos || []).map(repoRow).join('')}${add}<p class="muted self-copy-out" aria-live="polite"></p></div>`;
  };
  function everydayHtml() {
    const st = settings.style || {};
    const lookName = (settings.lookText || '').split(/[:.,(]/)[0].replace(/["“”]/g, '').trim() || 'Sysop';
    const theme = findTheme(st.theme || DEFAULT_THEME, st.custom || []);
    const motion = st.motion || 'on';
    const mopt = (val, label) => `<button type="button" role="radio" aria-checked="${motion === val}" data-motion="${val}">${label}</button>`;
    // Closed panels show what's set now, not just what's inside.
    const onoff = (v) => (v ? 'on' : 'off');
    const t = settings.tts || {};
    const voiceSum = t.provider === 'kokoro' ? `Kokoro, ${((settings.kokoroVoices || []).find(([id]) => id === (t.voice || kokoroDefault()))?.[1] || t.voice).replace(/ \(.*$/, '')}` : t.provider === 'piper' ? 'Piper' : t.provider === 'chatterbox' ? 'Chatterbox' : 'Windows';
    const bobSum = `Voice: ${voiceSum} · Look: ${lookName} · Theme: ${theme?.name || 'Moondust'}`;
    const howSum = howSumNow();
    // 1.5.117: the version and Check for updates sit on the closed panel's line, so no scrolling to check.
    const pcSum = `<span class="pc-ver">Bob ${esc(settings.version?.label || '')}</span> <button type="button" class="mini" data-checkupdate>Check for updates</button> <span class="update-out"></span><span class="pc-spec">· ${esc(hw?.spec || 'specs not read yet')} · graphics card: ${hw?.gpu ? `${esc(hw.gpu.name)}, ${hw.gpu.vramGB} GB` : 'not detected'} · ${hw?.freeGB ?? '?'} GB free</span>`;
    return `<div class="everyday">${panel('ev-pc', '💻 This replicant matrix and updates', pcSum, `
      <div class="updates srow-foot"><span class="muted">${hw?.gpu?.integrated && hw.installedRamGB ? `Built-in graphics: ${esc(hw.gpu.name.replace(/ \(shared memory\)$/, ''))} · Memory: ${hw.installedRamGB} GB ${hw.reservedGraphicsGB >= 2 ? `shared, ${hw.reservedGraphicsGB} GB set aside for graphics` : 'shared with graphics as needed'} (about ${hw.gpu.vramGB} GB of it for models)` : hw?.gpu?.integrated ? `Built-in graphics: ${esc(hw.gpu.name.replace(/ \(shared memory\)$/, ''))}, about ${hw.gpu.vramGB} GB of memory shared with it` : hw?.gpu?.unified ? `Chip: ${esc(hw.gpu.name)}, about ${hw.gpu.vramGB} GB of it for graphics` : `Graphics card: ${hw?.gpu ? `${esc(hw.gpu.name)}, ${hw.gpu.vramGB} GB` : 'not detected'}`} · Free disk: ${hw?.freeGB ?? '?'} GB</span>
        ${srow('Time zone', zoneLine(settings), tip(settings.timeZoneSet ? 'Set by hand in Bob\'s config file, so he keeps it.' : `Read from ${settings.platform === 'win32' ? 'Windows\'' : 'this replicant matrix\'s'} own clock when Bob starts, and again every half hour. Change the clock's time zone there and Bob follows. Quiet hours, reminders and the logbook use it.`, 'Time zone'), 'pc-zone')}
        ${sswitch('autoCheck', settings.updates?.autoCheck, 'Check for updates when Bob starts', 'Off unless you turn it on. Bob looks at his GitHub page for a newer version and only tells you; updating always takes your click.')}
        <div class="row"><button type="button" data-welcome>Run first-time setup</button><button type="button" data-helpbundle>Save a help bundle</button>${tip('Saves one zip with Bob\'s logs, the last chats, errors and this replicant matrix\'s facts, scrubbed of passcodes, keys and your name, so an agent or a person can work out what\'s wrong. Nothing is sent anywhere: you pick where it goes.', 'Save a help bundle')}${settings.features?.pcCheck === false ? '' : '<button type="button" data-pccheck>Check this replicant matrix</button>'}</div>
        <div class="help-bundle muted" aria-live="polite"></div><div class="update-steps"></div><div class="pc-check" aria-live="polite"></div></div>`, '', true)}${panel('ev-bob', '🙂 Bob himself', bobSum, `
      ${srow('Bob\'s voice', voicePickHtml(), '<button type="button" class="mini" data-tab="speech">More voice settings</button>')}
      ${srow('Bob\'s look', esc(lookName), '<button type="button" class="mini" data-tab="style">Change</button>')}
      ${sswitch('lookIcon', settings.lookIcon !== false, 'Use Bob\'s look as his icon', `On unless you turn it off. His icon on the ${settings.platform === 'darwin' ? 'Dock' : 'taskbar'}, in the tray and in the corner of his window shows the look you picked, and changes the moment you save a new one (a shortcut pinned to the taskbar may keep the usual icon: Windows draws those from the shortcut). Off: the usual Bob icon.${settings.trayHere ? '' : ' Only in Bob\'s own window, not in a browser.'}`, settings.trayHere ? '' : 'disabled')}
      ${srow('Theme', esc(theme?.name || 'Bob\'s Inn'), '<button type="button" class="mini" data-tab="style">Change</button>')}
      ${srow('Animations', `<span class="ttabs" role="radiogroup" aria-label="Animations">${mopt('on', 'On')}${mopt('system', settings.platform === 'win32' ? 'Follow Windows' : 'Follow the system')}${mopt('off', 'Off')}</span>`)}
      ${srow('Language', `<select data-set="language" data-no-translate aria-label="Language">${LANGS.map((l) => `<option value="${l.code}" ${l.code === pickLang(settings.language) ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select> ${tip('The words on Bob\'s screens. English unless you pick another. Help and Bob\'s replies stay as they are: write to him in your language and he answers in it.', 'Language')}`)}
      ${sswitch('mathView', settings.mathView === true, 'Show maths as formulas', 'Off unless you turn it on. Maths in Bob\'s replies shows as real formulas (fractions, powers, roots, sums) instead of LaTeX code. Drawn here, nothing goes online.')}
      ${sswitch('shortcuts', settings.shortcuts === true, 'Keyboard shortcuts', 'Off unless you turn it on. Ctrl+Shift+O new chat, Ctrl+K search, Esc stops Bob, Ctrl+/ shows them all.')}
      ${srow('Bob\'s cat', `<input data-set="catName" maxlength="24" value="${esc(settings.catName || 'Patches')}" aria-label="Cat's name" style="width:12em"> ${tip('The cat in Bob\'s stories.', 'Bob\'s cat')}`)}
`)}${panel('ev-how', '⚡ How Bob works', howSum, `
      <h4 class="ssub">How he works</h4>
      ${sswitch('autoSession', settings.autoSession !== false, 'Let Bob pick the session', 'Bob moves into the session that suits the job (Art, Coding, Office or Gaming) and goes back to Normal, the lightest, once he has been quiet for 2 minutes. While something else is using the graphics card, like a game, he stays in Gaming. You can still pick a session yourself from the menu: Bob keeps it while you work, then goes back to Normal once he has been quiet for 2 minutes. To keep him in Gaming, press 🎮 Gaming next to Effort.')}
      ${sswitch('oneBrain', settings.oneBrain, 'One brain (snappier)', 'Every job uses the main brain and the Quick brain is off, so he never stops to swap brains (about 20 seconds). Other picks are kept, greyed on the Brains page.')}
      ${sswitch('planFirst', settings.planFirst === true, 'Show Bob\'s plan before big jobs', keep('Off unless you turn it on. Before a job with several steps, or one that changes files or runs programs, Bob shows the steps on one card and waits for your OK.'))}
      ${sswitch('howtos', settings.howtos === true, 'Let Bob learn how-tos', 'Off unless you turn it on. After a job with a few steps goes well, Bob offers to keep the steps as a how-to, and follows them next time you ask for something like it. Nothing is kept without your click. Your how-tos are in 🧰 Tools and how-tos Bob made below.')}
      ${sswitch('editOwn', settings.editOwn === true, 'Let Bob fix his own messages', 'Off unless you turn it on. When Bob gets something wrong, or a status line goes out of date, he changes his earlier message instead of sending a new one. Only his own messages, only in the chat he\'s in. The message says edited, and pressing that shows what it said first.')}
      ${sswitch('thinkBubble', settings.thinkBubble !== false, 'Thinking bubble above answers', 'On unless you turn it off. While Bob works, one small folded bubble above his answer shows what he\'s up to; press it to see every step, draft and fix. The answer under it is only his finished answer, whole. Off: his words type out in the chat as before, steps and all.')}
      ${sswitch('statusJokes', settings.statusJokes !== false, 'Funny status line', 'On unless you turn it off. The line under my name changes with what I\'m doing, in my own words: asleep with no brain loaded, loading, thinking, writing back. Off: plain words.')}
      ${sswitch('chatRedo', settings.chatRedo !== false, 'Show Try again, Edit and Delete in the chat', 'On unless you turn it off. Adds them to each message\'s … menu.')}
      ${sswitch('quickNotes', settings.quickNotes === true, 'Let Bob take quick notes', 'Off unless you turn it on. Say "note: ..." or "jot this down" in any chat, here, on your phone, in Discord DMs or Telegram, and Bob writes it down at once with the date and time. Ask for your notes, or find them by a word or #tag.')}
      ${sswitch('smartNotes', settings.smartNotes === true, 'Let Bob notice what\'s worth noting', 'Off unless you turn it on. Bob also notes on his own what a chat shows is worth keeping (a decision, a number, a plan, a name, a link, an idea) and says 📝 Noted each time. He tags notes with the project you\'re on, updates a note instead of copying it, and brings up the notes that fit what you ask.')}
      ${`<div class="srow"><button type="button" data-opennotes>Open my notes</button> <span class="muted">One plain text file, one note per line. Notes Bob takes away are kept in the archive folder.</span></div>`}
      ${sswitch('docTools', settings.docTools === true, 'Read and search my documents', 'Off unless you turn it on. Bob reads Word, Excel, PowerPoint, OpenDocument, PDF, e-book and Rich Text files with nothing extra installed, and can search inside them for words in the folders he may read (Documents, Desktop and Downloads). Nothing leaves this replicant matrix and nothing is kept on disk. Old .doc, .xls and .ppt files need the Office documents Hand.')}
      ${sswitch('docMeaning', settings.docMeaning === true, 'Search my documents by meaning', 'Off unless you turn it on. Works with reading and searching documents on. A search also finds files that mean what you asked in other words. While Bob is idle he makes an index of your documents with the Memory slot\'s embedding model; it stays on this replicant matrix, holds numbers and file names but not the words, and is deleted when you turn this off.')}
      ${settings.docIndex ? `<div class="srow muted" data-docindex>${settings.docIndex.files ? `${settings.docIndex.files} ${settings.docIndex.files === 1 ? 'document' : 'documents'} in the index${settings.docIndex.building ? ', adding more now' : ''}.` : (settings.docIndex.building ? 'Making the index now.' : 'The index is made while Bob is idle.')}</div>` : ''}
      ${sswitch('docFresh', settings.docFresh === true, 'Keep my documents fresh', 'Off unless you turn it on. Works with Search my documents by meaning on. When a document is saved, added or deleted in a folder Bob may read, he reads it again (or drops it) within a minute, instead of waiting until he\'s idle. Never in the Gaming session or while he\'s answering.')}
      ${sswitch('docPlaces', settings.docPlaces === true, 'Show the page and line', 'Off unless you turn it on. Works with reading and searching documents on. When Bob finds something in your documents, he says where: the page of a PDF, the slide, the sheet, the paragraph of a Word file, or the line of a text file. Click that place in his answer to open the file beside the chat, at that spot.')}
      ${notesFoldersHtml()}
      ${sswitch('weeklyDigest', settings.weeklyDigest === true, 'A Sunday digest', 'Off unless you turn it on. Every Sunday from 9 in the morning (or the next time Bob is open, up to Tuesday), Bob puts one short note in the chat: the week\'s chats, the reminders that went off, and what he noticed. It\'s saved in the digests folder too. No brain is loaded for it and nothing goes online.')}
      <div class="srow"><button type="button" data-digestnow>Make this week's digest now</button> <span class="muted digest-out"></span></div>
      ${sswitch('docView', settings.docView === true, 'Show documents in the side panel', 'Off unless you turn it on. Word, Excel, PowerPoint, OpenDocument, e-book and Rich Text files open in the panel beside the chat as their words, tables and slides, and a PDF as its pages where this window can draw them. Nothing extra to install, nothing kept on disk. Off: these files get an Open in its app button.')}
      ${sswitch('toolHelp', settings.toolHelp !== false, 'Better tool calling', 'On unless you turn it off. Before a tool runs, Bob checks the call and mends sure slips (broken brackets, a field under another name, "5" for 5). After common errors he adds one plain hint. On long jobs he keeps a short "where we are" note and makes the last step an answer. Look-ups run side by side, and old tool results in long chats shrink to one line. Most useful with a small brain.')}
      ${sswitch('toolLearning', settings.toolLearning === true, 'Let Bob learn from his tools', 'Off unless you turn it on. When a tool fails and then works, Bob keeps one line on what fixed it and reads it next time. He also counts what works and what fails, and offers to fix a tool that keeps failing. It all stays on this replicant matrix.')}
      ${settings.toolLearning ? `<div class="srow">${(settings.toolScores || []).length ? `<span class="muted">${settings.toolScores.slice(0, 6).map((t) => `${esc(t.name.replace(/^use_my_tool:/, ''))} ${t.wins}✓ ${t.misses}✗${t.often ? ' (keeps failing)' : ''}`).join(' · ')}</span> <button type="button" data-forgettools>Forget what he learned</button>` : '<span class="muted">Nothing learned yet.</span>'}</div>` : ''}
      ${sswitch('chatFiles', settings.chatFiles === true, 'Save chats as files and bring chats in', 'Off unless you turn it on. Topics, Past chats gets Save as Markdown, JSON or PDF and Share (a tidy page or picture, names and folders taken out) under every chat, and Bring in chats, for a file exported from ChatGPT, Claude or Open WebUI. You tick which chats to keep; they join Past chats like any other. Nothing goes online.')}
      ${sswitch('sandboxCode', settings.sandboxCode === true, 'Let Bob work things out in a sandbox', 'Off unless you turn it on. For sums, dates, money and counting, Bob runs a few lines of code in a locked box and answers from the result instead of guessing. The box is empty and thrown away after each run: it can\'t see your files or start programs, code that goes online is refused, and it stops after 20 seconds.')}
      ${sswitch('parts3d', settings.parts3d === true, 'Let Bob make 3D parts', `Off unless you turn it on. Ask for a bracket, a box, a spacer or a replacement part, and Bob writes it as an OpenSCAD recipe in millimetres and makes an STL file for a 3D printer. It shows in a 3D viewer beside the chat, where you can turn it and zoom. Recipes can't read your files, start programs or go online. ${settings.openscadHere ? 'OpenSCAD is on this replicant matrix.' : 'Needs OpenSCAD (about 30 MB, free): Settings, Engines, or openscad.org.'}`)}
      ${sswitch('model3d', settings.model3d === true, 'Let Bob turn pictures into 3D models', `Off unless you turn it on. Ask for a figurine, a creature or a prop, and Bob paints a picture of it (or uses one you give him) and turns it into a textured 3D model with TRELLIS.2, shown in the 3D viewer. Takes 1 to 5 minutes. Needs an NVIDIA graphics card. ${settings.model3dHere ? 'The 3D workshop is set up.' : 'Needs the 3D workshop (about 28 GB): Settings, Engines. On a Mac, send the job to a PC Bob over Bob-Net.'}`)}
      ${sswitch('resumeJobs', settings.resumeJobs, 'Pick up where Bob left off after a restart', 'If Bob closes in the middle of a job (an update, a restart or a crash), he carries on when he opens again. Steps that finished aren\'t done again, and the step that got cut off is done again from the start. Unfinished downloads carry on too. If the cut-off step was typing into an app, moving or deleting files, editing a file or running a command, the job waits in Tasks so you can check first.')}
      <h4 class="ssub">Starting and closing</h4>
      ${sswitch('autostart', settings.autostart, 'Launch Bob on start-up', 'Off unless you turn it on.', settings.platform === 'win32' || settings.platform === 'darwin' || settings.loginItems ? '' : 'disabled')}
      ${sswitch('tray', settings.tray !== false, 'Keep Bob in the tray', `On unless you turn it off. Closing or minimising Bob's window tucks him into ${settings.platform === 'darwin' ? 'the menu bar at the top of the screen' : settings.platform === 'win32' ? 'the tray by the clock' : 'your desktop\'s tray'} instead of closing him, so he keeps running. Click his icon to open him again. To close him fully, ${settings.platform === 'darwin' ? 'click' : 'right-click'} his icon and pick <strong>Quit Bob</strong>.${settings.trayHere ? '' : ' Only in Bob\'s own window, not in a browser.'}`, settings.trayHere ? '' : 'disabled')}
      <h4 class="ssub">Going online</h4>
      ${sswitch('webSearch', settings.webSearch === true, 'Let Bob search the web', keep('Off unless you turn it on. Bob searches DuckDuckGo and reads pages when a question needs it. Only the search words and addresses leave your replicant matrix (your computer).'))}
      ${sswitch('catalogUpdates', settings.catalogUpdates === true, 'Let Bob fetch his newest brain list', keep('Off unless you turn it on. Once a day Bob checks GitHub for new brains, so they show in the Brain catalogue without updating Bob. Nothing about you is sent, and downloads still ask first.'))}
      <p class="muted list-date">${data?.updated ? `Bob's brain list is from ${esc(dayWords(data.updated))}.` : ''} ${settings.catalogUpdates === true ? '<button type="button" class="mini" data-listcheck>Check now</button>' : ''}</p>
      <h4 class="ssub">Brains</h4>
      ${sswitch('computerLab', settings.computerLab !== false, 'Show the Computer Science Lab', keep('On unless you turn it off. On: 🧪 Lab appears in the left pane, where you can make your own brain from one on this replicant matrix: take out sight or hearing, cut experts, make the running files, and test it before it goes into Bob. It runs here and costs nothing. Off: the Lab button is hidden; brains you made stay in Bob.' + (settings.computerLabRoom?.ok === false ? ' ' + settings.computerLabRoom.why : '')), settings.computerLabRoom?.ok === false && settings.computerLab === false ? 'disabled' : '')}
      ${sswitch('labPro', settings.labPro === true, 'Lab: Professional mode', keep('Off: each Lab tab shows the usual choices, in plain words. On: every control, the test logs, and each method\'s proper name. The same switch is at the top of the Lab.'))}
      ${selfWorkHtml()}
      ${sswitch('naughtyList', settings.naughtyList === true, 'Show the naughty list', keep('Off unless you turn it on. On: the Brain catalogue gets a Naughty list (the red devil) of other people\'s Qwen and Gemma remixes with the refusals taken out ("heretic" or "abliterated"). They answer without refusing, so what they say is on you. Bob never recommends one. Off: hidden; one already equipped stays until you change it.'))}
`)}${EVERY_EXTRA.map(([id, label, note, body]) => panel(id, label, typeof note === 'function' ? note() : note, body())).join('')}
    </div>`;
  }
  // 1.5.32: a three-position switch for how the Gaming session uses the graphics card.
  const GCARD_NOW = { none: 'processor only', borrow: 'borrowing about 0.6 GB', whole: 'small brain on the card (processor busy)' };
  function gamingCardHtml() {
    if (settings.features?.gamingCard === false) return ''; // a Mac shares its memory: there's no separate card to lend
    const cur = settings.gamingCard || 'auto';
    const opts = [['auto', 'Automatic', 'Bob borrows about 0.6 GB of the card only when your game leaves room, and none while the game needs it. If your processor is maxed out, Bob\'s small brain (about 3.5 GB) moves onto the card instead, but only when it fits with room to spare.'],
      ['never', 'Never use the card', 'Processor only: the card is all yours. Bob\'s first reply after loading can take about half a minute, sometimes longer.'],
      ['always', 'Always borrow a little', 'About 0.6 GB of the card for reading your messages, even while a game is using it (how Bob worked before 1.5.32).']];
    return `<fieldset class="seg3"><legend><strong>Gaming session: graphics card</strong></legend>
      <div class="seg3-row" role="radiogroup" aria-label="Gaming session: graphics card">${opts.map(([v, label]) => `<label class="seg3-btn${v === cur ? ' on' : ''}"><input type="radio" name="gamingCard" data-gcard="${v}" value="${v}" ${v === cur ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
      <span class="muted" data-gcard-note>${esc((opts.find(([v]) => v === cur) || opts[0])[2])}</span>
      ${cur === 'auto' ? `<span class="muted" data-gcard-now><strong>Right now:</strong> ${esc(GCARD_NOW[settings.gamingCardNow] || (settings.session?.id === 'light' ? 'the Gaming brain isn\'t loaded; Bob decides when it loads' : 'not in the Gaming session'))}</span>` : ''}
      <span class="muted">Only matters in the 🎮 Gaming session. Applies the next time the Gaming brain loads.</span></fieldset>`;
  }
  // 1.5.98: Connections became three panels: Bob-Net, Online services and Other apps.
  function otherAppsHtml() {
    return `<div><strong>ComfyUI workflows</strong> <span class="tag">off unless you turn it on</span>
         ${tip('For jobs Bob\'s own engines can\'t do (custom nodes, face fixers, long multi-step graphs). Bob drives ComfyUI for you; it just has to be running on this replicant matrix (for example from Pinokio). Add workflows to the workflows folder as Workflow > Export (API) files.', 'ComfyUI workflows')}
        <label class="switch"><input type="checkbox" data-set="workshop" ${settings.workshop?.enabled ? 'checked' : ''}><span><strong>Let Bob use ComfyUI</strong><br><span class="muted">${settings.workshop?.folder ? `Workflows folder: ${esc(settings.workshop.folder)} · ${settings.workshop.count || 0} workflow${settings.workshop.count === 1 ? '' : 's'}` : 'Off.'}</span></span></label>
        <label class="pick"><strong>ComfyUI port</strong><input data-set="workshopPort" inputmode="numeric" value="${esc(settings.workshop?.port || 8188)}" aria-label="ComfyUI port" style="width:7em"></label></div>
      ${appsDoorHtml()}
      <p class="muted">Apps Bob works inside (Unreal Engine, Blender) are under Hands, Connected apps (MCP).</p>
      ${claudeDoorHtml()}
      ${agentsSettingsHtml()}`;
  }
  // 1.5.127 Rented brains: a big brain hired for one job from a service the owner has an account with.
  function rentHtml() {
    const r = rent || {};
    const caps = r.caps || {};
    const svc = (s) => {
      const keyLine = s.id === 'other' ? 'You name the variable that holds each key when you add a rental.' : s.keyFound ? `Key found (${esc(s.keyEnv)})` : settings.platform === 'win32' ? `No key yet. Add a user variable named ${esc(s.keyEnv)}.` : `No key yet. Put a line ${esc(s.keyEnv)}=… in ~/.config/bob/env.`;
      return `<div class="cloud row rent-service${s.keyFound === false ? ' dim' : ''}" data-rentsvc="${esc(s.id)}">
        <label class="switch"><input type="checkbox" data-rentenable="${esc(s.id)}" ${s.enabled ? 'checked' : ''} ${s.keyFound === false ? 'disabled' : ''}><span><strong>Let Bob hire from ${esc(s.name)}</strong><br><span class="muted">${esc(s.what)} ${keyLine}${s.keyPage ? ` <a href="${esc(s.keyPage)}" target="_blank" rel="noopener">Get a key</a>` : ''}</span></span></label>
        <div class="confirm rent-warn" hidden></div></div>`;
    };
    const rentalRow = (x) => `<li class="rent-row${x.id === r.current ? ' worn' : ''}"><strong>${esc(x.name)}</strong> <span class="muted">${esc(x.model)} on ${esc(x.serviceName)}${x.kind === 'answer' ? '' : `, ${esc(x.cardsText || `${x.card} GB card`)}`} · ${esc(x.price || '')}</span>${(x.cards || 1) > 1 ? '<span class="tag warn">Several cards: costs more</span>' : ''}${x.id === r.current ? '<span class="tag good">in the slot</span>' : ''}${x.ready?.ok ? '' : `<span class="tag warn">${esc(x.ready?.why || '')}</span>`}${x.running ? '<span class="tag">Running</span>' : ''}
      <span class="row"><button type="button" class="mini" data-rentuse="${x.id === r.current ? '' : esc(x.id)}">${x.id === r.current ? 'Take it off' : 'Use this one'}</button>${x.kind === 'answer' ? `<button type="button" class="mini" data-rentprice="${esc(x.id)}">Check the price</button>` : ''}<button type="button" class="mini" data-rentremove="${esc(x.id)}">Remove</button></span></li>`;
    const running = (r.running || []).map((m) => `<li>${esc((r.rentals || []).find((x) => x.id === m.rental)?.name || m.rental)}: ${m.starting ? 'starting' : `${m.minutes} min, about ${esc(m.usd)}`}</li>`).join('');
    const leftover = (r.leftover || []).map((m) => `<li>${esc(m.serviceName)} ${esc(m.id)}${m.perHour ? ` (about $${(+m.perHour).toFixed(2)} an hour)` : ''}, started before Bob did <button type="button" class="mini danger" data-rentstopone="${esc(m.id)}">Stop it</button></li>`).join('');
    const cardOpts = (r.cards || []).map((c) => `<option value="${esc(c.id)}" ${c.id === '48' ? 'selected' : ''}>${esc(c.name)} (about $${c.perHour.toFixed(2)} an hour): ${esc(c.say)}</option>`).join('');
    // 1.5.137: Bob's list, so you needn't know what a service calls a brain: the really big ones, and the catalogue
    // brains too big for this replicant matrix and every Bob on your Bob-Net (those are only listed here and in the Lab).
    const picks = rentPicks(visibleModels(data?.models || [], naughtyOn()), data?.bigBrains || [], eqCtx(), data?.bobNet || [], settings.platform);
    const pickOpt = (p) => `<option value="${esc(p.key)}">${esc(p.name)}${p.by ? ` (${esc(p.by)})` : ''}${p.answerOnly ? ': pay per answer only' : p.cards > 1 ? `: needs ${p.cards} cards` : ''}</option>`;
    const bigs = picks.filter((p) => p.group === 'big'), tooBig = picks.filter((p) => p.group === 'too-big');
    const pickSel = picks.length ? `<label class="pick"><strong>Pick a brain from Bob's list</strong><select data-rentadd="pick" aria-label="Pick a brain from Bob's list"><option value="">None: I'll type the model's name</option>${bigs.length ? `<optgroup label="Really big brains">${bigs.map(pickOpt).join('')}</optgroup>` : ''}${tooBig.length ? `<optgroup label="Too big for your Bobs">${tooBig.map(pickOpt).join('')}</optgroup>` : ''}</select></label>` : '';
    const svcOpts = (r.services || []).map((s) => `<option value="${esc(s.id)}" ${s.enabled ? '' : 'disabled'}>${esc(s.name)}${s.enabled ? '' : ' (switch it on first)'}</option>`).join('');
    return `<div class="rent-block"><strong>Rented brains</strong> <span class="tag">off unless you turn one on</span>
      ${more('Hire a big brain for a big job, from any service you have an account with. A rental is a service plus a model (for example Qwen 3.6 35B on OpenRouter, or a full-size 24Bob on a RunPod card). Put one in the Rented brain job in Settings, Brains, then use it from the 🏗 Rented brain switch under the chat, or when Bob offers it for a job too big for this replicant matrix. You press a card before anything is spent, and it says the cost and exactly what leaves this replicant matrix: the chat of that job, the files you attach to it, Bob\'s instructions and what he remembers about you. Keys are environment variables Bob only reads (on Mac and Linux they can also go in ~/.config/bob/env); he never stores or shows one. Bob\'s figures are estimates from the service\'s price list; the service\'s own billing page is the real bill.')}
      <h4 class="ssub">Spending limits</h4>
      <p class="muted">Every limit starts at 0. Nothing can be hired until you set the ones a rental needs.</p>
      <label class="pick"><strong>The most Bob may spend on rented brains this month</strong> $<input data-rentcap="month" inputmode="decimal" value="${esc(String(caps.month ?? 0))}" aria-label="Month cap in dollars" style="width:6em"> <span class="muted">Spent this month: ${esc(r.spentText || '$0.00')}. Resets on the 1st.</span></label>
      <label class="pick"><strong>The most one job may cost</strong> $<input data-rentcap="job" inputmode="decimal" value="${esc(String(caps.job ?? 0))}" aria-label="Per-job cap in dollars" style="width:6em"></label>
      <label class="pick"><strong>The longest a hired machine may run</strong> <input data-rentcap="minutes" inputmode="numeric" value="${esc(String(caps.minutes ?? 0))}" aria-label="Longest run in minutes" style="width:5em"> minutes <span class="muted">The machine carries this timer and stops itself when it runs out, even if this replicant matrix is off.</span></label>
      <h4 class="ssub">Services</h4>
      ${(r.services || []).map(svc).join('')}
      <h4 class="ssub">Rentals</h4>
      ${(r.rentals || []).length ? `<ul class="rent-list">${r.rentals.map(rentalRow).join('')}</ul>` : '<p class="muted">None yet.</p>'}
      <details class="more rent-add"${rentPickOpen ? ' open' : ''}><summary>Add a rental</summary>
        ${pickSel}
        <label class="pick"><strong>Service</strong><select data-rentadd="service" aria-label="Service">${svcOpts}</select></label>
        <label class="pick"><strong>Model</strong><input data-rentadd="model" placeholder="as the service lists it, e.g. qwen/qwen3.6-35b-a3b, or Owner/Repo/file.gguf" aria-label="Model name" style="width:24em"> <button type="button" class="mini" data-rentfind hidden>Find it on this service</button></label>
        <p class="muted rent-pick-note" aria-live="polite"></p>
        <label class="pick rent-card-pick"><strong>Card size</strong><select data-rentadd="card" aria-label="Card size">${cardOpts}</select></label>
        <label class="pick rent-cards-pick"><strong>Cards on the machine</strong><select data-rentadd="cards" aria-label="How many cards on the machine">${(r.cardCounts || [1]).map((n) => `<option value="${n}" ${n === 1 ? 'selected' : ''}>${n === 1 ? '1 card (the usual)' : `${n} cards at once: ${n} times the hourly price`}</option>`).join('')}</select> <span class="muted">Only for a model too big for one card. The price and the limits apply to the whole machine.</span></label>
        <div class="confirm rent-multi-warn" hidden></div>
        <label class="pick rent-other"><strong>Web address</strong><input data-rentadd="address" placeholder="https://…/v1" aria-label="Web address" style="width:20em"></label>
        <label class="pick rent-other"><strong>Variable that holds the key</strong><input data-rentadd="keyEnv" placeholder="MY_SERVICE_API_KEY" aria-label="Key variable name" style="width:16em"></label>
        <label class="pick"><strong>Name</strong><input data-rentadd="name" placeholder="optional, e.g. Qwen 35B on OpenRouter" aria-label="Rental name" style="width:20em"></label>
        <p class="row"><button type="button" class="get" data-rentaddgo>Add this rental</button><span class="muted rent-add-note"></span></p>
      </details>
      <h4 class="ssub">Machines running</h4>
      ${running || leftover ? `<ul>${running}${leftover}</ul><p class="row"><button type="button" class="danger" data-rentstop>Stop everything now</button><button type="button" class="mini" data-rentcheck>Check the services again</button></p>` : `<p class="muted">None. <button type="button" class="link" data-rentcheck>Check the services again</button></p>`}
      ${(r.recent || []).length ? `<details class="more"><summary>Recent spending</summary><ul>${r.recent.map((x) => `<li>${esc(new Date(x.at).toLocaleString())}: ${esc(x.name)}, ${esc(x.usd)}${x.minutes ? ` (${x.minutes} min)` : x.tokensIn ? ` (${x.tokensIn} words in, ${x.tokensOut} out)` : ''}${x.guessed ? ', estimated' : ''}</li>`).join('')}</ul></details>` : ''}
    </div>`;
  }
  function onlineHtml() {
    return `<p class="muted">Each of these sends something over the internet, and says what.</p>
      ${rentHtml()}
      <div><strong>Cloud helpers</strong> <span class="tag">off unless you turn one on</span>
        ${more('Paid cloud AIs Bob can hand one job to, as a helper copy. He asks you every time, shows the rough cost and exactly what text would leave your replicant matrix (your computer). Bob never stores or sees your keys: you add a key as a Windows environment variable yourself (Settings, System, About, Advanced system settings, Environment Variables, under "User variables").')}
        ${cloud.map((c) => `<div class="cloud row${c.keyFound ? '' : ' dim'}">
          <label class="switch"><input type="checkbox" data-cloud="${esc(c.id)}" ${c.enabled ? 'checked' : ''} ${c.keyFound ? '' : 'disabled'}><span><strong>${esc(c.name)}</strong><br><span class="muted">${c.keyFound ? `Key found (${esc(c.apiKeyEnv)})` : `No key yet. Add a user variable named ${esc(c.apiKeyEnv)}.`}</span></span></label>
          ${c.models.length ? `<select data-cloudmodel="${esc(c.id)}" aria-label="${esc(c.name)} model" ${c.keyFound ? '' : 'disabled'}>${c.models.map((m) => `<option ${m === c.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>` : `<input data-cloudmodel="${esc(c.id)}" aria-label="${esc(c.name)} model" placeholder="model name" value="${esc(c.model)}" ${c.keyFound ? '' : 'disabled'}>`}
        </div>`).join('')}</div>
      ${telegramHtml()}
      ${discordHtml()}`;
  }
  function bobNetHtml() {
    return `<h4 class="ssub">This Bob</h4>
      ${phoneAccessHtml()}
      ${shareBrainsHtml()}
      <h4 class="ssub">Chats and your phone</h4>
      ${sswitch('carryIn', settings.carryIn === true, 'Take chats from my other Bobs', 'Off unless you turn it on. Your other Bobs and your phone can hand a chat over to this Bob with Carry on on another Bob, and you keep going here. It lands in Past chats as a new chat; the original stays where it was. Only what you and Bob said comes over: no files, pictures or memory.')}
      ${sswitch('netOverlay', settings.netOverlay === true, 'Bob-Net icons under Bob', 'Off unless you turn it on. Small icons under my picture for each of your other Bobs on Bob-Net right now, and each coding agent you added. Click one to chat with it here; Return from Guest Mode brings you back to me. In that chat it only thinks, plus web search if that\'s on: no files, programs or Hands on either computer. The other Bob needs this version and Take jobs from my other Bobs on.')}
      ${sswitch('phoneGlance', settings.phoneGlance === true, 'Let my phone see how I\'m doing', 'Off unless you turn it on. Bob for Android\'s Your Bobs page (and its home-screen widget) can show whether this Bob is up or busy, his brain, the graphics card\'s heat and memory, the jobs running and your next reminder. Only your signed-in phone and your other Bobs can ask, over Tailscale; the card is read at most every 20 seconds.')}`;
  }
  function lookExtrasHtml() {
    const st = settings.style || {};
    const opt = (val, label, on) => `<button type="button" role="radio" aria-checked="${on}" data-nowneed="${val}">${label}</button>`;
    const ts = settings.textSize || 100;
    return `<div class="srow"><label class="pick"><strong>Text size: <b data-textsizelabel>${ts}%</b></strong><input type="range" min="${TEXT_MIN}" max="${TEXT_MAX}" step="${TEXT_STEP}" data-textsize value="${ts}" aria-describedby="textsize-hint"></label>
      <p class="muted" id="textsize-hint">The chat, the message box and Settings, bigger or smaller. 100% to start with. Saved for this Bob, on every window.</p></div>
      ${sswitch('readableFont', settings.readableFont === true, 'Easier-to-read font', 'Off to start with. A plainer font with more space between letters, words and lines, for the chat and Settings. Good for tired eyes and for dyslexia.')}
      <div><strong>Now running</strong><div class="ttabs" role="radiogroup" aria-label="Open Now running when a task needs me">${opt('0', 'Leave Now running as it is', st.openNowOnNeed !== true)}${opt('1', 'Open Now running when a task needs me', st.openNowOnNeed === true)}</div></div>
      <div><strong>Your own theme</strong><p class="muted">Make or edit a theme on the <button type="button" class="link" data-tab="style">🎨 Style</button> page (Make your own theme).</p></div>`;
  }
  // Settings, Jobs (src/job-helps.js): how Bob works through a job. Eleven switches, all off unless you turn them on.
  const jobsHtml = () => {
    const j = settings.jobHelps || {};
    const sw = (k, label, note) => sswitch('jh' + k[0].toUpperCase() + k.slice(1), j[k] === true, label, note);
    return `<p class="muted">How I work through a job. All off unless you turn them on.</p>
      ${sw('steer', 'Steer Bob mid-job', 'Type in the chat while I work on a job there, and I read it before my next step instead of after the whole job.')}
      ${sw('softStop', 'Show Stop after this step', 'A softer button beside Stop: the step running now finishes and keeps its result, then I tell you what I did and what\'s left.')}
      ${sw('timeLimit', 'Give each job a time limit', 'A bar shows the time left. When it runs out, a card asks whether to give me more; with no answer in 2 minutes I wrap up.')}
      <div class="srow"><label class="pick"><strong>Time limit</strong> <select data-jhminutes aria-label="Time limit">${[5, 10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}" ${(j.minutes || 10) === m ? 'selected' : ''}>${m} minutes</option>`).join('')}</select></label> <span class="muted">This also stops any work that runs past it, switch on or off, so I never run away.</span></div>
      ${sw('receipt', 'Show a receipt after each job', 'Files changed, commands run and pages read, each with Open or Undo. Undo works for a week, while the file still holds what I wrote.')}
      ${sw('runTests', 'Run the tests after code edits', 'In a project with tests, I run them after changing its code and fix what fails before I say done. The command still asks you first.')}
      ${sw('askFirst', 'Ask one question before a vague big job', 'If a big ask could mean two things, I ask you to pick one first, instead of guessing and doing the wrong thing.')}
      ${sw('rememberNo', 'Remember a no for the whole chat', 'When you deny a step I remember it, with your reason if you type one, and don\'t offer the same thing again in other words.')}
      ${sw('lookupCache', 'Reuse look-ups for an hour', 'The same search or page within an hour comes from my memory, not the web again.')}
      ${sw('sources', 'Show sources under web answers', 'Numbered links to the pages I actually read, under the answer.')}
      ${sw('howSure', 'Say how sure Bob is', 'When pages disagree or results are thin, one line saying how sure I am.')}
      ${sw('fileLinks', 'Make file:line links clickable', 'A file and line in my replies about code opens your editor there. On this replicant matrix only, not the phone.')}
      <div class="srow"><label class="pick"><strong>Open file:line links in</strong> <select data-jheditor aria-label="Open file:line links in">${[['vscode', 'VS Code'], ['cursor', 'Cursor'], ['vscodium', 'VSCodium'], ['system', 'Show it in its folder']].map(([v, n]) => `<option value="${v}" ${(j.editor || 'vscode') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>`;
  };
  // 🗓 Everyday helpers (everyday.js): each switch off to start with. The boxes below fill themselves (mountEveryday).
  const dailyHtml = () => `<div class="everyday-box">
      ${sswitch('todayCard', settings.todayCard === true, 'Show a today card when Bob opens', 'Off to start with. Once a day, the first time his window opens: the weather, today\'s reminders and scheduled jobs, and what the last check-in found.')}
      <div class="srow"><label class="pick"><strong>Place for the weather</strong><input data-todayplace maxlength="60" value="${esc(settings.todayPlace || '')}" placeholder="Your town" aria-describedby="todayplace-hint" style="width:14em"></label>
      <p class="muted" id="todayplace-hint">Empty: no weather. With a town here, only its name goes to open-meteo.com (free, no account), once a day.</p></div>
      ${sswitch('focusTimer', settings.focusTimer === true, 'Focus timer', 'Off to start with. Shows ⏱ Focus beside Effort. Pick 15, 25, 45 or 60 minutes: Bob keeps his check-ins, reminders and other notes to himself until it ends, then says how it went. Replies to what you ask still come.')}
      ${sswitch('receipts', settings.receipts === true, 'Keep a spending sheet from receipts', 'Off to start with. Attach a photo of a receipt and say "add this receipt": Bob reads it and adds the date, shop, total and a category. The sheet stays on this replicant matrix, always locked. Needs a brain that can see pictures.')}
      <div class="spend-box"></div>
      ${sswitch('updateTour', settings.updateTour === true, 'Show what\'s new after an update', 'Off to start with. After an update, up to three cards in the chat for the new switches, each with Turn on. Once per version.')}
      ${sswitch('trayDot', settings.trayDot === true, 'Show a dot on the tray icon', `Off to start with. A dot on Bob\'s tray icon when a reply is ready or something needs you while his window is hidden. Windows also shows it on the taskbar button, a Mac on the Dock icon. Gone when you look.${settings.trayHere ? '' : ' Only in Bob\'s own window: in a browser this does nothing.'}`)}
      ${sswitch('profilesOn', settings.profilesOn === true, 'Profiles for other people', 'Off to start with. On a shared replicant matrix, each person gets their own chats and memory, locked with their own passcode. They pick their name on the lock screen. Needs the passcode lock with Lock my chats and memory.')}
      <div class="people-box"></div>
    </div>`;
  // 1.5.181 "Memory kept for Windows" (built-in graphics only): how much free memory a brain load leaves alone.
  const holdbackHtml = () => { const v = settings.apuHoldbackGB ?? 2; return `<div class="srow"><label class="pick"><strong>Memory kept for Windows: <b data-holdbacklabel>${v} GB</b></strong><input type="range" min="0" max="8" step="0.5" data-holdback value="${v}" aria-describedby="holdback-hint"></label>
      <p class="muted" id="holdback-hint">With built-in graphics, a brain shares memory with Windows. When Bob works out how much of a brain goes on the graphics, he leaves this much free memory alone (2 GB to start with), and at least 1 GB always stays free. It never stops a load: if a brain runs out of memory, Bob loads it again with less. Lower lets bigger brains load on a small machine. <strong>At 0, Windows may slow down, or Bob may close, if memory runs out.</strong></p></div>`; };
  return {
    selfWorkHtml: (...a) => { fresh(); return selfWorkHtml(...a); },
    everydayHtml: (...a) => { fresh(); return everydayHtml(...a); },
    GCARD_NOW,
    gamingCardHtml: (...a) => { fresh(); return gamingCardHtml(...a); },
    otherAppsHtml: (...a) => { fresh(); return otherAppsHtml(...a); },
    rentHtml: (...a) => { fresh(); return rentHtml(...a); },
    onlineHtml: (...a) => { fresh(); return onlineHtml(...a); },
    bobNetHtml: (...a) => { fresh(); return bobNetHtml(...a); },
    lookExtrasHtml: (...a) => { fresh(); return lookExtrasHtml(...a); },
    jobsHtml: (...a) => { fresh(); return jobsHtml(...a); },
    dailyHtml: (...a) => { fresh(); return dailyHtml(...a); },
    holdbackHtml: (...a) => { fresh(); return holdbackHtml(...a); }
  };
}
