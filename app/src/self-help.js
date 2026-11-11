// Bob knows his own settings (2026-11-02: "he should be aware of all of his settings so he can help someone
// set him up"). The bob_help tool searches the same Help text the window shows (public/help-content.js) and adds
// what is set right now, so Bob can say exactly where a switch is and whether it's on. Read-only: it changes nothing.
import { houseStylePrompt } from '../public/house-style.js';
import { HELP } from '../public/help-content.js';
import { webOn } from './web.js';
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
    `Let Bob search the web: ${onOff(webOn(cfg))}`,
    `Let Bob learn how-tos: ${onOff(cfg.howtos === true)}`,
    `Let Bob fix his own messages: ${onOff(cfg.editOwn === true)}`,
    `Let Bob take quick notes: ${onOff(cfg.quickNotes === true)} (Let Bob notice what's worth noting: ${onOff(cfg.smartNotes === true)}); Read and search my documents: ${onOff(cfg.docTools === true)}; Show documents in the side panel: ${onOff(cfg.docView === true)}; Let Bob work things out in a sandbox: ${onOff(cfg.sandboxCode === true)}; Let Bob make 3D parts: ${onOff(cfg.parts3d === true)}`,
    `Let Bob work on repositories: ${onOff(cfg.selfWork?.enabled === true)} (his own app first, then ${(cfg.selfWork?.repos || []).length} of yours); Let my other Bobs help: ${onOff(cfg.selfWork?.helpers === true)}`,
    `Session: ${currentSession(cfg).label}; Let Bob pick the session: ${onOff(cfg.autoSession !== false)}; 🎮 Gaming button (chat page): ${onOff(cfg.gamingLock === true)}`,
    `Free memory when Bob is idle: ${onOff(brainMode(cfg) !== 'always')}`,
    `One brain (snappier): ${onOff(cfg.oneBrain === true)}`,
    `Launch Bob on start-up: ${onOff(cfg.autostart === true)}`,
    `Keep Bob in the tray: ${onOff(cfg.tray !== false)}; Use Bob's look as his icon: ${onOff(cfg.lookIcon !== false)}`,
    `Check for updates when Bob starts: ${onOff(cfg.updates?.autoCheck === true)}`,
    `Keep engines up to date: ${onOff(cfg.engineUpdates?.auto !== false)}`,
    `Show Bob's plan before big jobs: ${onOff(cfg.planFirst === true)}`,
    `Pick up where Bob left off after a restart: ${onOff(cfg.resumeJobs === true)}; Carry on unfinished downloads when Bob starts: ${onOff(cfg.downloads?.resumeOnStart === true || cfg.resumeJobs === true)}`,
    `Bob's engine: ${cfg.engine === 'ollama' ? 'Ollama' : "Bob's own (llama.cpp)"}`,
    `Voice: ${cfg.tts?.provider || 'Windows voice'}`,
    `Hands: ${hands}${h.enabled ? `; Let Bob work without asking ${onOff(h.free)}` : ''}`,
    `Housekeeping: ${onOff(cfg.housekeeping?.enabled === true)}`,
    `Check-ins: ${checkinsNow(cfg)}`,
    `🎲 Adventure (menu page, nothing runs until a game is started): Which brain is the game master: ${cfg.adventure?.gm === 'main' ? 'Main Brain' : 'Biggest brain'}; Who plays the other Bobs: ${cfg.adventure?.players === 'gm' ? 'The game master brain' : 'Their own Bob when reachable'}`,
    `🧩 Games (menu page, nothing runs until a game is started): Which brain plays games: ${cfg.games?.brain === 'main' ? 'Main Brain' : 'Quick brain'}; How often Bob chips in: ${{ some: 'Now and then', end: 'Only at the end' }[cfg.games?.talk] || 'After every move'}`,
    `ComfyUI: ${onOff(cfg.workshop?.enabled === true)}`,
    `Cloud helpers on: ${cloud.length ? cloud.join(', ') : 'none'}`,
    `Keep the graphics card free for quick answers: ${onOff(cfg.quickOnCpu === true)}`,
    `Keep chatting while Bob is busy: ${onOff(cfg.chatWhileBusy !== false)}`,
    `Let the reviewer sit beside Bob's main brain: ${onOff(cfg.mootBeside === true)}`,
    `Ask my other Bobs for a quick second look: ${onOff(cfg.netReview === true)}`,
    `Gaming session: graphics card: ${{ auto: 'Automatic', never: 'Never use the card', always: 'Always borrow a little' }[gamingCard(cfg)]}`,
    `House style (Equip Bob): ${houseStylePrompt(cfg.houseStyle).replace(/^\s+/, '').replace(/^.*?: /, '') || 'none set (Bob picks)'}`,
    `Projects (Settings): ${Object.keys(cfg.projects || {}).join(', ') || 'none'}${cfg.defaultProject ? `; main project ${cfg.defaultProject}` : ''}`,
    `Where Bob saves things (Settings): ${cfg.saveDirMissing ? `the picked folder ${cfg.saveDir} is missing, so saving in Bob's own folder ${cfg.painterDir} for now` : cfg.saveDir ? cfg.painterDir : `Bob's own folder (Made by Bob), ${cfg.painterDir || 'inn\\painter'}`}`,
    `Speed for this replicant matrix: Get Bob ready while you type ${onOff(cfg.readyWhileTyping === true)}, Let games go first ${onOff(cfg.gamesFirst === true)}, Match picture settings to my graphics card ${onOff(cfg.pictureFit === true)}`
  ].join('\n');
}

export function bobHelp(cfg, query, max = 3) {
  const hits = findHelp(query, HELP, max);
  const body = hits.length
    ? hits.map((e) => `## ${e.title}\n${plainText(e.html)}`).join('\n\n').slice(0, 5000)
    : `Nothing in Help matches "${query}". Help topics: ${[...new Set(HELP.map((e) => e.group))].join(', ')}.`;
  return `${body}\n\n## Set right now on this replicant matrix\n${settingsNow(cfg)}\n\n(Help opens with F1 or Help in the left menu.)`;
}
