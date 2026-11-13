// Bob knows his own settings (2026-11-02: "he should be aware of all of his settings so he can help someone
// set him up"). The bob_help tool searches the same Help text the window shows (public/help-content.js) and adds
// what is set right now, so Bob can say exactly where a switch is and whether it's on. Read-only: it changes nothing.
import { harnessNow } from './harness.js';
import { moreToolsLine } from './more-tools.js';
import { houseStylePrompt } from '../public/house-style.js';
import { HELP } from '../public/help-content.js';
import { webOn } from './web.js';
import { jobHelpsNow } from './job-helps.js';
import { currentSession } from './sessions.js';
import { gamingCard } from './gaming-card.js';
import { brainMode } from './brain-mode.js';
import { handsSettings, HANDS } from './hands-settings.js';
import { checkinSettings } from './checkin-settings.js';

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
export function plainText(html) {
  return String(html || '')
    .replace(/<span class="tag[^"]*">([^<]*)<\/span>/gi, ' [$1]').replace(/<\/dt>/gi, ':\n')
    .replace(/<(?:br|\/p|\/li|\/tr|\/dd|\/dt|\/h3)\s*\/?>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ').replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] || e)
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

// Best entries first: a word in the title counts most, then the search words, then the text.
export function findHelp(query, list = HELP, max = 3) {
  const words = String(query || '').toLowerCase().split(/[^a-z0-9.+'-]+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  const scored = list.map((e) => {
    const title = e.title.toLowerCase(), extra = String(e.words || '').toLowerCase(), body = plainText(e.html).toLowerCase();
    const score = words.reduce((n, w) => n + (title.includes(w) ? 5 : 0) + (extra.includes(w) ? 2 : 0) + (body.includes(w) ? 1 : 0), 0);
    return { e, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((x) => x.e);
}

const onOff = (v) => (v ? 'on' : 'off');
// 1.5.78: "on, every day at 09:00, 2 of your own checks"
function checkinsNow(cfg) {
  const c = checkinSettings(cfg);
  if (!c.enabled) return 'off';
  const when = c.how === 'hours' ? `every ${c.hours === 1 ? 'hour' : `${c.hours} hours`}` : `${c.how === 'weekdays' ? 'every weekday' : 'every day'} at ${c.at}`;
  return `on, ${when}, ${c.own.length} of your own check${c.own.length === 1 ? '' : 's'}`;
}
// What is set right now, in the words Settings uses. Window-only switches (Listen, Read aloud, Alerts) live in the
// window, so they aren't listed.
export function settingsNow(cfg) {
  const h = handsSettings(cfg);
  const hands = h.enabled ? Object.entries(HANDS).map(([id, x]) => `${x.label} ${onOff(h[id]?.on)}`).join(', ') : 'off (master switch off)';
  const cloud = (cfg.cloud || []).filter((c) => c.enabled).map((c) => c.name);
  return [
    `Web search: ${onOff(webOn(cfg))}`,
    `Learn how-tos: ${onOff(cfg.howtos === true)}`,
    `Edit his own messages: ${onOff(cfg.editOwn === true)}`,
    `Try again, Edit and Delete: ${onOff(cfg.chatRedo !== false)}`,
    `Reply between steps: ${onOff(cfg.answerMidJob !== false)}`,
    `Stop and wait words: ${onOff(cfg.stopWords !== false)}`,
    `Thinking bubble: ${onOff(cfg.thinkBubble !== false)}`,
    `Funny status line: ${onOff(cfg.statusJokes !== false)}`,
    `Quick brain sees the job: ${onOff(cfg.quickSeesJob === true)}`,
    `Engine extras (Speed & memory): Prompt-lookup decoding: ${onOff(cfg.copyGuess === true)}; Preload the next brain: ${onOff(cfg.preloadNext === true)}; Laptop mode: ${onOff(cfg.laptopMode === true)}; Auto-test a new GPU: ${onOff(cfg.newCardTest === true)}; Speed history: ${onOff(cfg.speedLog === true)}; Engine update notes (Engines): ${onOff(cfg.engineNotes === true)}; Chat memory type picked for ${Object.values(cfg.brainMemType || {}).filter((t) => t !== 'standard').length} brain(s), the rest Standard`,
    harnessNow(cfg), // items 62 to 72: crashes, safe start, undo, quiet hours, weekly, shortcut, chat extras
    `Quick notes: ${onOff(cfg.quickNotes === true)} (Auto notes: ${onOff(cfg.smartNotes === true)}); Read and search documents: ${onOff(cfg.docTools === true)} (Semantic document search: ${onOff(cfg.docMeaning === true)}); Documents in the side panel: ${onOff(cfg.docView === true)}; Export and import chats: ${onOff(cfg.chatFiles === true)}; Render maths: ${onOff(cfg.mathView === true)}; Keyboard shortcuts: ${onOff(cfg.shortcuts === true)}; Saved prompts with /: ${onOff(cfg.promptMenu === true)}; Code sandbox: ${onOff(cfg.sandboxCode === true)}; Assistant presets: ${onOff(cfg.chatPresets === true)} (${(cfg.presetList || []).length} saved); 3D parts: ${onOff(cfg.parts3d === true)}; Pictures to 3D models: ${onOff(cfg.model3d === true)}`,
    `Text size: ${cfg.textSize || 100}%; Readable font: ${onOff(cfg.readableFont === true)}; Today card: ${onOff(cfg.todayCard === true)}${cfg.todayPlace ? ' (weather for the place typed)' : ''}; Focus timer: ${onOff(cfg.focusTimer === true)}; Receipt tracker: ${onOff(cfg.receipts === true)}; What's new after updates: ${onOff(cfg.updateTour === true)}; Tray icon dot: ${onOff(cfg.trayDot === true)}; Users: ${onOff(cfg.profilesOn === true)}`,
    `Live document index: ${onOff(cfg.docFresh === true)}; Cite page and line: ${onOff(cfg.docPlaces === true)}; Search notes apps: ${(cfg.notesFolders || []).length} folder(s); Sunday digest: ${onOff(cfg.weeklyDigest === true)}`,
    `Memory sources: ${onOff(cfg.memorySources === true)}; Expiring memories: ${onOff(cfg.memoryExpiry === true)}; Per-project memories: ${onOff(cfg.memoryWhere === true)}`,
    moreToolsLine(cfg),
    `Time zone: ${cfg.timeZone || 'not read yet'} (${cfg.timeZoneSet ? 'set by hand in config.json' : 'read from this computer\'s clock'}; shown in Settings, This replicant matrix, read-only)`,
    `Work on repositories: ${onOff(cfg.selfWork?.enabled === true)} (his own app first, then ${(cfg.selfWork?.repos || []).length} of yours); Other Bobs help: ${onOff(cfg.selfWork?.helpers === true)}`,
    `Session: ${currentSession(cfg).label}; Auto session: ${onOff(cfg.autoSession !== false)}; 🎮 Gaming button (chat page): ${onOff(cfg.gamingLock === true)}`,
    `Free memory when Bob is idle: ${onOff(brainMode(cfg) !== 'always')}`,
    `One brain: ${onOff(cfg.oneBrain === true)}`,
    `Launch at start-up: ${onOff(cfg.autostart === true)}`,
    `Minimise to tray: ${onOff(cfg.tray !== false)}; Use Bob's look as his icon: ${onOff(cfg.lookIcon !== false)}`,
    `Check for updates at start: ${onOff(cfg.updates?.autoCheck === true)}`,
    `Auto-update engines: ${onOff(cfg.engineUpdates?.auto !== false)}`,
    `Plan before big jobs: ${onOff(cfg.planFirst === true)}`,
    jobHelpsNow(cfg),
    `Resume jobs after restart: ${onOff(cfg.resumeJobs === true)}; Carry on unfinished downloads when Bob starts: ${onOff(cfg.downloads?.resumeOnStart === true || cfg.resumeJobs === true)}`,
    `Bob's engine: ${cfg.engine === 'ollama' ? 'Ollama' : "Brain Engine, Bob's own"}`,
    `Voice: ${cfg.tts?.provider || 'Windows voice'}`,
    `Hands: ${hands}${h.enabled ? `; Work without asking ${onOff(h.free)}` : ''}`,
    `Housekeeping: ${onOff(cfg.housekeeping?.enabled === true)}`,
    `Check-ins: ${checkinsNow(cfg)}`,
    `🎲 Adventure (menu page, nothing runs until a game is started): Game master brain: ${cfg.adventure?.gm === 'main' ? 'Main Brain' : 'Biggest brain'}; Who plays the other Bobs: ${cfg.adventure?.players === 'gm' ? 'The game master brain' : 'Their own Bob when reachable'}; Table extras (ticked on the start card): ${(() => { const x = cfg.adventure?.extras || {}; const on = [['dice', 'Dice you can see'], ['sounds', 'Sounds'], ['voice', 'Read it aloud'], ['pictures', 'Pictures'], ['scenePics', 'A new picture every scene'], ['portraits', 'Portraits'], ['music', 'Music']].filter(([k]) => x[k] === true).map(([, n]) => n); return on.length ? on.join(', ') : 'none'; })()}; Table rules (ticked on the start card): ${(() => { const r = cfg.adventure?.rules || {}; const on = [['map', 'A map that grows'], ['coins', 'Coins and shops'], ['breath', 'Catch your breath'], ['secrets', 'Secret notes'], ['riddles', 'Riddle rooms'], ['badges', 'Badges']].filter(([k]) => r[k] === true).map(([, n]) => n); return on.length ? on.join(', ') : 'none'; })()}; How hard: ${{ easy: 'Easy', hard: 'Hard' }[cfg.adventure?.difficulty] || 'Normal'}`,
    `🧩 Games (menu page, nothing runs until a game is started): Games brain: ${cfg.games?.brain === 'main' ? 'Main Brain' : 'Quick brain'}; How often Bob chips in: ${{ some: 'Now and then', end: 'Only at the end' }[cfg.games?.talk] || 'After every move'}; Keep an unfinished game: ${cfg.games?.keep === true ? 'On' : 'Off'}; Kid mode: ${cfg.games?.kid === true ? 'On' : 'Off'}`,
    `ComfyUI: ${onOff(cfg.workshop?.enabled === true)}`,
    `Cloud helpers on: ${cloud.length ? cloud.join(', ') : 'none'}`,
    `Quick answers on CPU: ${onOff(cfg.quickOnCpu === true)}`,
    `Chat while busy: ${onOff(cfg.chatWhileBusy !== false)}`,
    `Reviewer beside main brain: ${onOff(cfg.mootBeside === true)}`,
    `Review by my other Bobs: ${onOff(cfg.netReview === true)}`,
    `Gaming session: graphics card: ${{ auto: 'Automatic', never: 'Never use the card', always: 'Always borrow a little' }[gamingCard(cfg)]}`,
    `House style (Settings): ${houseStylePrompt(cfg.houseStyle).replace(/^\s+/, '').replace(/^.*?: /, '') || 'none set (Bob picks)'}`,
    `Projects (Settings): ${Object.keys(cfg.projects || {}).join(', ') || 'none'}${cfg.defaultProject ? `; main project ${cfg.defaultProject}` : ''}`,
    `Save folder (Settings): ${cfg.saveDirMissing ? `the picked folder ${cfg.saveDir} is missing, so saving in Bob's own folder ${cfg.painterDir} for now` : cfg.saveDir ? cfg.painterDir : `Bob's own folder (Made by Bob), ${cfg.painterDir || 'inn\\painter'}`}`,
    `Speed for this replicant matrix: Warm up while typing ${onOff(cfg.readyWhileTyping === true)}, Games first ${onOff(cfg.gamesFirst === true)}, Fit pictures to my GPU ${onOff(cfg.pictureFit === true)}`
  ].join('\n');
}

export function bobHelp(cfg, query, max = 3) {
  const hits = findHelp(query, HELP, max);
  const body = hits.length
    ? hits.map((e) => `## ${e.title}\n${plainText(e.html)}`).join('\n\n').slice(0, 5000)
    : `Nothing in Help matches "${query}". Help topics: ${[...new Set(HELP.map((e) => e.group))].join(', ')}.`;
  return `${body}\n\n## Set right now on this replicant matrix\n${settingsNow(cfg)}\n\n(Help opens with F1 or Help in the left menu.)`;
}
