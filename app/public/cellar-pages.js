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
  // "Work on repositories" (src/self-work.js): the switch, then (when on) the brain he uses, how much he keeps
  // in mind, and the list of repositories (his own first), each with its own code copy. Originals are never changed.
  const selfWorkHtml = () => {
    const w = settings.selfWork || {};
    const sizeName = (v) => (v >= 1048576 ? `${v / 1048576}M` : `${Math.round(v / 1024)}K`);
    const head = sswitch('selfWork', w.enabled === true, 'Work on repositories', keep('Bob edits code in his own app or a listed repository, on a copy, with the brain picked below. Every edit and command gets a card, and you get a git branch and patch. Nothing is sent anywhere. Missing Git or Node.js is downloaded into his folder (35 to 55 MB each).'));
    // Every setting shows whether the switch is on or off, so it can be set first (the owner's rule, 2026-11-11).
    // The brain list (the owner, 2026-11-11): the biggest first, then your own brains and the ones doing a job, then the
    // catalogue's other brains here, then the catalogue's brains to get first.
    const groupName = { big: 'Recommended: the biggest', jobs: 'Your own brains and the ones doing a job', here: 'Other brains on this replicant matrix', get: 'In the catalogue, get it first' };
    const shown = w.model || (w.missing ? w.picked : ''); // the brain he'd really use; a picked one that isn't here yet only shows when nothing is
    const optName = (b) => `${b.name}${b.jobs?.length ? ` (${b.jobs.join(', ')})` : ''}${b.here === false ? ' (not downloaded)' : ''}`;
    const groups = ['big', 'jobs', 'here', 'get'].map((g) => [g, (w.brains || []).filter((b) => (b.group || 'big') === g)]).filter(([, l]) => l.length);
    const brain = w.brains?.length
      ? `<select data-selfwork="model" aria-label="Brain for working on repositories">${shown ? '' : '<option value="" selected>Pick a brain</option>'}${groups.map(([g, l]) => `<optgroup label="${esc(groupName[g])}">${l.map((b) => `<option value="${esc(b.id)}" ${b.id === shown ? 'selected' : ''}>${esc(optName(b))}</option>`).join('')}</optgroup>`).join('')}</select> ${tip('Bob uses his biggest brain unless you pick another: Bobert, else Qwen3.6 35B. A catalogue brain that isn\'t here yet needs Get models first. A smaller brain is quicker but makes more mistakes on a big repository.', 'Brain for these jobs')}${w.missing ? `<br><span class="muted">${esc(w.missing)} isn't downloaded yet: get it in Get models. Until then Bob uses the one shown here.</span>` : ''}`
      : '<span class="muted">There are no brains on this replicant matrix yet. Get one in Get models (Qwen3.6 35B-A3B is the one Bob would use), or add your own under Brains of your own.</span>';
    const mem = `<select data-selfwork="ctx" aria-label="Long memory for working on repositories">${(w.ctxChoices || [524288, 1048576]).map((v) => `<option value="${v}" ${v === w.ctx ? 'selected' : ''}>${sizeName(v)}</option>`).join('')}</select> ${tip('Context size for these jobs. Both are past what most brains were made for (Qwen3.6 35B: 256K), so it\'s stretched (Long memory). If it won\'t fit your GPU and RAM, he uses 256K and says so.', 'Long memory for these jobs')}`;
    const repoRow = (r) => srow(esc(r.name) + (r.own ? ' <span class="muted">(Bob himself)</span>' : ''),
      `<span class="muted">${esc(r.source)}</span>${r.ready ? `<br><span class="muted">Code copy: ${esc(r.dir)}</span>` : ''}`,
      `${r.ready ? '' : `<button type="button" class="mini" data-selfcopy="${esc(r.id)}">Make the code copy</button>`}${r.own ? '' : `<button type="button" class="mini" data-selfrm="${esc(r.id)}">Remove</button>`}`);
    const add = (w.repos || []).length - 1 < (w.maxRepos || 20)
      ? `<div class="row self-add"><input data-selfnew="name" maxlength="40" placeholder="Name" aria-label="Repository name" style="width:9em"><input data-selfnew="source" maxlength="400" placeholder="https link or folder" aria-label="Repository link or folder" style="flex:1;min-width:12em"><button type="button" class="mini" data-selfadd>Add</button> ${tip('An https link (GitHub or other), or the full path of a git repository on this replicant matrix. Bob clones it into his inn folder and only works on that copy. A private link needs Git here to know your sign-in already; a folder you cloned yourself always works.', 'Add a repository')}</div>`
      : '';
    const helpers = `<label class="switch srow-switch"><input type="checkbox" data-selfwork="helpers" ${w.helpers ? 'checked' : ''}><span><strong>Other Bobs help</strong>${noteOrTip(keep(`On a big job, research tasks can go to your other Bobs on Bob-Net in parallel, if they run Bobert, Qwen3.6 35B or the brain picked above. They only think: edits, commands and the patch stay on this replicant matrix. ${w.bobNet ? `${w.bobNet} Bob${w.bobNet === 1 ? '' : 's'} on your Bob-Net list.` : 'Your Bob-Net list is empty: add your other Bobs in Settings, Bob-Net.'}`), 'Other Bobs help')}</span></label>`;
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
        ${sswitch('autoCheck', settings.updates?.autoCheck, 'Check for updates at start', 'Checks GitHub for a newer version and tells you. Updating always takes your click.')}
        <div class="row"><button type="button" data-welcome>Run first-time setup</button><button type="button" data-helpbundle>Save a help bundle</button>${tip('One zip of Bob\'s logs, recent chats, errors and this replicant matrix\'s facts, scrubbed of passcodes, keys and your name. Nothing is sent anywhere: you pick where it goes.', 'Save a help bundle')}${settings.features?.pcCheck === false ? '' : '<button type="button" data-pccheck>Check this replicant matrix</button>'}</div>
        <div class="help-bundle muted" aria-live="polite"></div><div class="update-steps"></div><div class="pc-check" aria-live="polite"></div></div>`, '', true)}${panel('ev-bob', '🙂 Bob himself', bobSum, `
      ${srow('Bob\'s voice', voicePickHtml(), '<button type="button" class="mini" data-tab="speech">More voice settings</button>')}
      ${srow('Bob\'s look', esc(lookName), '<button type="button" class="mini" data-tab="style">Change</button>')}
      ${sswitch('lookIcon', settings.lookIcon !== false, 'Use Bob\'s look as his icon', `His icon on the ${settings.platform === 'darwin' ? 'Dock' : 'taskbar'}, in the tray and in the corner of his window shows the look you picked, and changes the moment you save a new one (a shortcut pinned to the taskbar may keep the usual icon: Windows draws those from the shortcut). Off: the usual Bob icon.${settings.trayHere ? '' : ' Only in Bob\'s own window, not in a browser.'}`, settings.trayHere ? '' : 'disabled')}
      ${srow('Theme', esc(theme?.name || 'Bob\'s Inn'), '<button type="button" class="mini" data-tab="style">Change</button>')}
      ${srow('Animations', `<span class="ttabs" role="radiogroup" aria-label="Animations">${mopt('on', 'On')}${mopt('system', settings.platform === 'win32' ? 'Follow Windows' : 'Follow the system')}${mopt('off', 'Off')}</span>`)}
      ${srow('Language', `<select data-set="language" data-no-translate aria-label="Language">${LANGS.map((l) => `<option value="${l.code}" ${l.code === pickLang(settings.language) ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select> ${tip('The words on Bob\'s screens. English unless you pick another. Help and Bob\'s replies stay as they are: write to him in your language and he answers in it.', 'Language')}`)}
      ${sswitch('mathView', settings.mathView === true, 'Render maths', 'Shows LaTeX in replies as formulas. Drawn here, nothing goes online.')}
      ${sswitch('shortcuts', settings.shortcuts === true, 'Keyboard shortcuts', 'Ctrl+Shift+O new chat, Ctrl+K search, Esc stops Bob, Ctrl+/ shows them all.')}
      ${srow('Bob\'s cat', `<input data-set="catName" maxlength="24" value="${esc(settings.catName || 'Patches')}" aria-label="Cat's name" style="width:12em"> ${tip('The cat in Bob\'s stories.', 'Bob\'s cat')}`)}
`)}${panel('ev-how', '⚡ How Bob works', howSum, `
      <h4 class="ssub">How he works</h4>
      ${sswitch('autoSession', settings.autoSession !== false, 'Auto session', 'Bob switches to the session that suits the job (Art, Coding, Office or Gaming) and returns to Normal after 2 quiet minutes. He stays in Gaming while a game uses the GPU. A session you pick is kept while you work.')}
      ${sswitch('oneBrain', settings.oneBrain, 'One brain', 'The main brain does every job and the Quick brain is off. No swaps (about 20 seconds each). Other picks are kept, greyed on the Brains page.')}
      ${sswitch('planFirst', settings.planFirst === true, 'Plan before big jobs', keep('Before a multi-step job, or one that changes files or runs programs, Bob shows the steps on one card and waits for your OK.'))}
      ${sswitch('howtos', settings.howtos === true, 'Learn how-tos', 'After a multi-step job goes well, Bob offers to save the steps as a how-to and follows it for similar asks. Nothing is kept without your click. Your how-tos are in 🧰 Tools and how-tos below.')}
      ${sswitch('editOwn', settings.editOwn === true, 'Edit his own messages', 'Bob corrects his earlier message instead of sending a new one. It says edited; press that to see the original.')}
      ${sswitch('thinkBubble', settings.thinkBubble !== false, 'Thinking bubble', 'One folded bubble above the answer holds every step, draft and fix. Off: it all types out in the chat.')}
      ${sswitch('statusJokes', settings.statusJokes !== false, 'Funny status line', 'The line under my name says what I\'m doing, in my own words. Off: plain words.')}
      ${sswitch('chatRedo', settings.chatRedo !== false, 'Try again, Edit and Delete', 'Adds them to each message\'s … menu.')}
      ${sswitch('quickNotes', settings.quickNotes === true, 'Quick notes', 'Say "note: ..." or "jot this down" in any chat, here, on your phone, in Discord DMs or Telegram. Find notes by a word or #tag.')}
      ${sswitch('smartNotes', settings.smartNotes === true, 'Auto notes', 'Bob also notes what\'s worth keeping (a decision, a number, a plan, a link) and says 📝 Noted. Notes are tagged with the project and updated, not duplicated.')}
      ${`<div class="srow"><button type="button" data-opennotes>Open my notes</button> <span class="muted">One plain text file, one note per line. Notes Bob takes away are kept in the archive folder.</span></div>`}
      ${sswitch('docTools', settings.docTools === true, 'Read and search documents', 'Reads Word, Excel, PowerPoint, OpenDocument, PDF, e-book and Rich Text files and searches them in Documents, Desktop and Downloads. Nothing leaves this replicant matrix or is kept on disk. Old .doc, .xls and .ppt files need the Office documents Hand.')}
      ${sswitch('docMeaning', settings.docMeaning === true, 'Semantic document search', 'Also finds files that mean what you asked. Bob indexes documents while idle with the Memory slot\'s embedding model; the index stays here and is deleted when this is off. Needs Read and search documents.')}
      ${settings.docIndex ? `<div class="srow muted" data-docindex>${settings.docIndex.files ? `${settings.docIndex.files} ${settings.docIndex.files === 1 ? 'document' : 'documents'} in the index${settings.docIndex.building ? ', adding more now' : ''}.` : (settings.docIndex.building ? 'Making the index now.' : 'The index is made while Bob is idle.')}</div>` : ''}
      ${sswitch('docFresh', settings.docFresh === true, 'Live document index', 'Re-indexes a document within a minute of a change instead of waiting for idle. Never in Gaming or mid-answer. Needs Semantic document search.')}
      ${sswitch('docPlaces', settings.docPlaces === true, 'Cite page and line', 'Answers from your documents say where: page, slide, sheet, paragraph or line. Click it to open the file at that spot. Needs Read and search documents.')}
      ${notesFoldersHtml()}
      ${sswitch('weeklyDigest', settings.weeklyDigest === true, 'Sunday digest', 'Each Sunday from 9 AM, one short note in the chat: the week\'s chats, reminders and what Bob noticed. Also saved in the digests folder. No brain is loaded and nothing goes online.')}
      <div class="srow"><button type="button" data-digestnow>Make this week's digest now</button> <span class="muted digest-out"></span></div>
      ${sswitch('docView', settings.docView === true, 'Documents in the side panel', 'Office, OpenDocument, e-book, Rich Text and PDF files open beside the chat. Off: an Open in its app button.')}
      ${sswitch('toolHelp', settings.toolHelp !== false, 'Better tool calling', 'Repairs malformed tool calls, adds a hint after common errors, runs look-ups in parallel and shrinks old tool results. Helps small brains most.')}
      ${sswitch('toolRecord', settings.toolRecord !== false, 'Keep a record of my tool calls', 'Code writes each tool call down word for word: your ask, the inputs, the result and the end of Bob\'s thinking. When you ask why, or a tool keeps missing, Bob reads it instead of guessing. Newest 500, never email. Off deletes it.')}
      ${sswitch('toolSets', settings.toolSets !== false, 'Tool wording for each brain family', 'Same tools, same names. A brain family gets its own tool wording only once a test proves it helps; none has yet, so every brain gets the usual wording.')}
      ${sswitch('toolLearning', settings.toolLearning === true, 'Learn from tool errors', 'When a tool fails and then works, Bob keeps one line on the fix. He counts failures and offers to fix a tool that keeps failing. It all stays here.')}
      ${settings.toolLearning ? `<div class="srow">${(settings.toolScores || []).length ? `<span class="muted">${settings.toolScores.slice(0, 6).map((t) => `${esc(t.name.replace(/^use_my_tool:/, ''))} ${t.wins}✓ ${t.misses}✗${t.often ? ' (keeps failing)' : ''}`).join(' · ')}</span> <button type="button" data-forgettools>Forget what he learned</button>` : '<span class="muted">Nothing learned yet.</span>'}</div>` : ''}
      ${sswitch('chatFiles', settings.chatFiles === true, 'Export and import chats', 'Past chats get Save as Markdown, JSON or PDF, and Share. Bring in chats imports a ChatGPT, Claude or Open WebUI export. Nothing goes online.')}
      ${sswitch('sandboxCode', settings.sandboxCode === true, 'Code sandbox', 'For sums, dates, money and counting, Bob runs code in a sandbox instead of guessing. No file access, no network, 20-second limit.')}
      ${sswitch('parts3d', settings.parts3d === true, '3D parts', `Ask for a bracket, box or spacer: Bob writes it in OpenSCAD (mm) and makes an STL, shown in a 3D viewer. Recipes can't read files, run programs or go online. ${settings.openscadHere ? 'OpenSCAD is on this replicant matrix.' : 'Needs OpenSCAD (about 30 MB, free): Settings, Engines, or openscad.org.'}`)}
      ${sswitch('model3d', settings.model3d === true, 'Pictures to 3D models', `Bob turns a picture (his or yours) into a textured 3D model with TRELLIS.2. Takes 1 to 5 minutes. Needs an NVIDIA GPU. ${settings.model3dHere ? 'The 3D workshop is set up.' : 'Needs the 3D workshop (about 28 GB): Settings, Engines. On a Mac, send the job to a PC Bob over Bob-Net.'}`)}
      ${sswitch('resumeJobs', settings.resumeJobs, 'Resume jobs after restart', 'If Bob closes mid-job, he carries on when he opens again; finished steps aren\'t redone. Downloads resume too. A cut-off step that typed into an app, changed files or ran a command waits in Tasks for your check.')}
      <h4 class="ssub">Starting and closing</h4>
      ${sswitch('autostart', settings.autostart, 'Launch at start-up', '', settings.platform === 'win32' || settings.platform === 'darwin' || settings.loginItems ? '' : 'disabled')}
      ${sswitch('tray', settings.tray !== false, 'Minimise to tray', `Closing or minimising tucks Bob into ${settings.platform === 'darwin' ? 'the menu bar at the top of the screen' : settings.platform === 'win32' ? 'the tray by the clock' : 'your desktop\'s tray'} and he keeps running. To close him fully, ${settings.platform === 'darwin' ? 'click' : 'right-click'} his icon and pick <strong>Quit Bob</strong>.${settings.trayHere ? '' : ' Only in Bob\'s own window, not in a browser.'}`, settings.trayHere ? '' : 'disabled')}
      <h4 class="ssub">Going online</h4>
      ${sswitch('webSearch', settings.webSearch === true, 'Web search', keep('Searches DuckDuckGo and reads pages when needed. Only search terms and addresses leave this replicant matrix.'))}
      ${sswitch('catalogUpdates', settings.catalogUpdates === true, 'Auto-update the brain list', keep('Checks GitHub once a day for new brains for the Brain catalogue. Nothing about you is sent, and downloads still ask first.'))}
      <p class="muted list-date">${data?.updated ? `Bob's brain list is from ${esc(dayWords(data.updated))}.` : ''} ${settings.catalogUpdates === true ? '<button type="button" class="mini" data-listcheck>Check now</button>' : ''}</p>
      <h4 class="ssub">Brains</h4>
      ${sswitch('computerLab', settings.computerLab !== false, 'Show the Lab', keep('Shows 🧪 Lab, where you make your own brain from one you have: remove senses, cut experts, build and test. Runs here, free. Off: hidden; brains you made stay.' + (settings.computerLabRoom?.ok === false ? ' ' + settings.computerLabRoom.why : '')), settings.computerLabRoom?.ok === false && settings.computerLab === false ? 'disabled' : '')}
      ${sswitch('labPro', settings.labPro === true, 'Lab: Professional mode', keep('Shows every control, the test logs and each method\'s proper name. The same switch is at the top of the Lab.'))}
      ${selfWorkHtml()}
      ${sswitch('naughtyList', settings.naughtyList === true, 'Show the naughty list', keep('Adds a Naughty list to the Brain catalogue: Qwen and Gemma remixes with the refusals removed ("heretic" or "abliterated"). What they say is on you. Bob never recommends one. Off: hidden; one already equipped stays.'))}
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
         ${tip('For jobs Bob\'s own engines can\'t do (custom nodes, face fixers, long graphs). ComfyUI has to be running on this replicant matrix (for example from Pinokio). Add workflows to the workflows folder as Workflow > Export (API) files.', 'ComfyUI workflows')}
        <label class="switch"><input type="checkbox" data-set="workshop" ${settings.workshop?.enabled ? 'checked' : ''}><span><strong>Use ComfyUI</strong><br><span class="muted">${settings.workshop?.folder ? `Workflows folder: ${esc(settings.workshop.folder)} · ${settings.workshop.count || 0} workflow${settings.workshop.count === 1 ? '' : 's'}` : 'Off.'}</span></span></label>
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
      ${more('A rental is a service plus a model (for example Qwen 3.6 35B on OpenRouter, or a full-size 24Bob on a RunPod card). Put one in the Rented brain job in Settings, Brains, then use the 🏗 Rented brain switch under the chat. You press a card before anything is spent. It shows the cost and what leaves this replicant matrix: that job\'s chat, its attached files, Bob\'s instructions and what he remembers about you. Keys are environment variables Bob only reads (on Mac and Linux also ~/.config/bob/env); he never stores or shows one. Costs are estimates; the service\'s billing page is the real bill.')}
      <h4 class="ssub">Spending limits</h4>
      <p class="muted">Every limit starts at 0. Nothing can be hired until you set the ones a rental needs.</p>
      <label class="pick"><strong>Monthly spending cap</strong> $<input data-rentcap="month" inputmode="decimal" value="${esc(String(caps.month ?? 0))}" aria-label="Month cap in dollars" style="width:6em"> <span class="muted">Spent this month: ${esc(r.spentText || '$0.00')}. Resets on the 1st.</span></label>
      <label class="pick"><strong>Per-job cap</strong> $<input data-rentcap="job" inputmode="decimal" value="${esc(String(caps.job ?? 0))}" aria-label="Per-job cap in dollars" style="width:6em"></label>
      <label class="pick"><strong>Max rental time</strong> <input data-rentcap="minutes" inputmode="numeric" value="${esc(String(caps.minutes ?? 0))}" aria-label="Longest run in minutes" style="width:5em"> minutes <span class="muted">The machine carries this timer and stops itself when it runs out, even if this replicant matrix is off.</span></label>
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
        <label class="pick rent-other"><strong>Key variable</strong><input data-rentadd="keyEnv" placeholder="MY_SERVICE_API_KEY" aria-label="Key variable name" style="width:16em"></label>
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
        ${more('Paid cloud AIs Bob can hand one job to. He asks every time, with the rough cost and exactly what text would leave this replicant matrix. Bob never stores or sees your keys: you add a key as a Windows environment variable yourself (Settings, System, About, Advanced system settings, Environment Variables, under "User variables").')}
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
      ${sswitch('carryIn', settings.carryIn === true, 'Accept chats', 'Your other Bobs and your phone can hand a chat to this Bob with Carry on on another Bob. It lands in Past chats as a new chat. Words only: no files, pictures or memory.')}
      ${sswitch('netOverlay', settings.netOverlay === true, 'Bob-Net icons', 'An icon under my picture for each Bob on Bob-Net and each coding agent you added. Click one to chat with it here. It only thinks (plus web search if on): no files, programs or Hands. The other Bob needs Accept jobs on.')}
      ${sswitch('phoneGlance', settings.phoneGlance === true, 'Share status with my phone', 'Bob for Android and its widget can show this Bob\'s state, brain, GPU heat and memory, running jobs and your next reminder. Only your signed-in phone and your other Bobs can ask.')}`;
  }
  function lookExtrasHtml() {
    const st = settings.style || {};
    const opt = (val, label, on) => `<button type="button" role="radio" aria-checked="${on}" data-nowneed="${val}">${label}</button>`;
    const ts = settings.textSize || 100;
    return `<div class="srow"><label class="pick"><strong>Text size: <b data-textsizelabel>${ts}%</b></strong><input type="range" min="${TEXT_MIN}" max="${TEXT_MAX}" step="${TEXT_STEP}" data-textsize value="${ts}" aria-describedby="textsize-hint"></label>
      <p class="muted" id="textsize-hint">The chat, the message box and Settings, bigger or smaller. 100% to start with. Saved for this Bob, on every window.</p></div>
      ${sswitch('readableFont', settings.readableFont === true, 'Readable font', 'More space between letters, words and lines, in the chat and Settings. Good for tired eyes and dyslexia.')}
      <div><strong>Now running</strong><div class="ttabs" role="radiogroup" aria-label="Open Now running when a task needs me">${opt('0', 'Leave Now running as it is', st.openNowOnNeed !== true)}${opt('1', 'Open Now running when a task needs me', st.openNowOnNeed === true)}</div></div>
      <div><strong>Your own theme</strong><p class="muted">Make or edit a theme on the <button type="button" class="link" data-tab="style">🎨 Style</button> page (Make your own theme).</p></div>`;
  }
  // Settings, Jobs (src/job-helps.js): how Bob works through a job. Eleven switches, all off unless you turn them on.
  const jobsHtml = () => {
    const j = settings.jobHelps || {};
    const sw = (k, label, note) => sswitch('jh' + k[0].toUpperCase() + k.slice(1), j[k] === true, label, note);
    return `<p class="muted">How I work through a job.</p>
      ${sw('steer', 'Steer mid-job', 'A message in the job\'s chat is read before my next step, not after the whole job.')}
      ${sw('softStop', 'Stop after this step', 'A softer Stop: the current step finishes and keeps its result, then I say what\'s done and what\'s left.')}
      ${sw('timeLimit', 'Job time limit', 'A bar shows the time left. When it runs out, a card asks whether to give me more; with no answer in 2 minutes I wrap up.')}
      <div class="srow"><label class="pick"><strong>Time limit</strong> <select data-jhminutes aria-label="Time limit">${[5, 10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}" ${(j.minutes || 10) === m ? 'selected' : ''}>${m} minutes</option>`).join('')}</select></label> <span class="muted">This also stops any work that runs past it, switch on or off, so I never run away.</span></div>
      ${sw('receipt', 'Job receipt', 'Files changed, commands run and pages read, each with Open or Undo. Undo works for a week.')}
      ${sw('runTests', 'Run tests after code edits', 'In a project with tests, I run them after an edit and fix what fails before I say done. The command still asks first.')}
      ${sw('askFirst', 'Ask before a vague job', 'If a big ask could mean two things, I ask you to pick one first.')}
      ${sw('rememberNo', 'Remember a no', 'A step you deny stays denied for the whole chat, with your reason if you type one.')}
      ${sw('lookupCache', 'Cache look-ups for an hour', 'The same search or page within an hour is reused, not fetched again.')}
      ${sw('sources', 'Sources under web answers', 'Numbered links to the pages I read.')}
      ${sw('howSure', 'Confidence line', 'When pages disagree or results are thin, one line on how sure I am.')}
      ${sw('fileLinks', 'Clickable file:line links', 'A file and line in my replies opens your editor there. This replicant matrix only, not the phone.')}
      <div class="srow"><label class="pick"><strong>Open file:line links in</strong> <select data-jheditor aria-label="Open file:line links in">${[['vscode', 'VS Code'], ['cursor', 'Cursor'], ['vscodium', 'VSCodium'], ['system', 'Show it in its folder']].map(([v, n]) => `<option value="${v}" ${(j.editor || 'vscode') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>`;
  };
  // 🗓 Everyday helpers (everyday.js): each switch off to start with. The boxes below fill themselves (mountEveryday).
  const dailyHtml = () => `<div class="everyday-box">
      ${sswitch('todayCard', settings.todayCard === true, 'Today card', 'Once a day when Bob opens: the weather, today\'s reminders and scheduled jobs, and the last check-in.')}
      <div class="srow"><label class="pick"><strong>Place for the weather</strong><input data-todayplace maxlength="60" value="${esc(settings.todayPlace || '')}" placeholder="Your town" aria-describedby="todayplace-hint" style="width:14em"></label>
      <p class="muted" id="todayplace-hint">Empty: no weather. With a town here, only its name goes to open-meteo.com (free, no account), once a day.</p></div>
      ${sswitch('focusTimer', settings.focusTimer === true, 'Focus timer', 'Adds ⏱ Focus beside Effort (15 to 60 minutes). Bob holds check-ins and reminders until it ends. Replies still come.')}
      ${sswitch('receipts', settings.receipts === true, 'Receipt tracker', 'Attach a receipt photo and say "add this receipt": Bob logs the date, shop, total and category. The sheet stays here, always locked. Needs a brain that sees pictures.')}
      <div class="spend-box"></div>
      ${sswitch('updateTour', settings.updateTour === true, 'What\'s new after updates', 'Up to three cards in the chat for the new switches, each with Turn on. Once per version.')}
      ${sswitch('trayDot', settings.trayDot === true, 'Tray icon dot', `A dot on Bob\'s tray icon (taskbar button on Windows, Dock on a Mac) when a reply is ready or something needs you.${settings.trayHere ? '' : ' Only in Bob\'s own window: in a browser this does nothing.'}`)}
      ${sswitch('profilesOn', settings.profilesOn === true, 'Users', 'Each person gets their own chats, memory, email, keys and agents. A passcode is up to them.')}
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
