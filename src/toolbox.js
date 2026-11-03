// Bob's toolbox (1.5.5): every chat starts with a small core of tools. The rest sit in groups that are added
// only when a message needs them, so his small brain isn't carrying ~4,000 tokens of tool descriptions it
// won't use. Three ways a group gets added:
//   1. the user's words this turn match the group (cheap word check, no extra model call),
//   2. Bob asks for it with use_tools(group),
//   3. Bob calls one of its tools by name anyway (small models do this): it's added and the call runs.
// A group used in a chat stays for the next few messages of that chat, then drops off again.
// Setting allTools (Advanced, off) sends every tool every time, the old way.
import { HANDS, handOn, handOffWhy } from './hands-settings.js';

export const CORE = ['notice_board', 'remember', 'reminders', 'list_folder', 'read_file', 'web_search', 'fetch_page', 'bob_help', 'ask_specialist', 'show_made', 'pick_session', 'use_tools'];

// Groups Bob can add. `what` is what Bob reads in use_tools; `words` is the cheap pre-check on the user's message.
const WORK_GROUPS = {
  pictures: {
    what: 'make pictures, video clips, music and sound effects; save reference pictures; ComfyUI workflows', // narrowed to what this PC has, see groupsFor
    tools: ['make_image', 'make_video', 'save_reference', 'make_music', 'make_sound', 'workshop_list', 'workshop_run'],
    words: /\b((?:picture|image|photo|pic)s? of|pic|pics|picture|image|photo|draw|drawing|paint|painting|render|sketch|artwork|art|portrait|wallpaper|logo|icon|sprite|concept|illustrat\w*|video|clip|animat\w*|music|song|tune|melody|beat|chiptune|soundtrack|jingle|sound|sfx|workflow|comfy\w*|reference|character sheet)s?\b/i
  },
  documents: {
    what: 'write or edit files, save spreadsheets, search inside files',
    tools: ['write_file', 'edit_file', 'save_spreadsheet', 'search_files'],
    words: /\b(save|write|edit|document|txt|csv|xlsx|spreadsheet|excel|search (?:my|the|in|for)|find (?:in|where)|grep)\b/i
  },
  memory: {
    what: 'forget a topic you keep notes on',
    tools: ['forget_topic'],
    words: /\b(forget|erase|delete (?:the |that |your )?(?:note|topic|memory))\b/i
  },
  cloud: {
    what: 'hand a job to a paid cloud helper',
    tools: ['ask_cloud'],
    words: /\b(cloud|claude|gpt|openai|gemini|anthropic|online model|bigger model)\b/i
  }
};

// The Hands each get their own group, only when that Hand is switched on.
const HAND_WORDS = {
  files: /\b(move|copy|rename|zip|unzip|extract|tidy|organi[sz]e|sort|clean ?up|downloads|undo|folder|folders)\b/i,
  run: /\b(run|execute|command|script|terminal|powershell|cmd|install|build|npm|python|node|git|recipe)\b/i,
  schedules: /\b(schedules?|scheduled|every (?:day|morning|afternoon|evening|night|week|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|month|hour|\d+)|each (?:day|morning|evening|night|week|weekday|hour)|daily|nightly|weekly|hourly|on a timer)\b/i,
  office: /\b(convert\w*|turn (?:it|this|that|them|these) into|save (?:it |this |that )?as|export\w*|pdf|docx?|xlsx?|pptx?|odt|ods|odp|word (?:doc\w*|file)|excel|powerpoint|libre ?office|open ?office|writer|calc|impress|slides?|presentation|slideshow|deck|spreadsheet|sheet|cells?|template|mp3|mp4|wav|webm|webp|flac|ogg|mkv|gif|jpe?g|png)\b/i,
  security: /\b(secur\w*|virus\w*|malware|antivirus|defender|scan(?:s|ning)?|threats?|quarantin\w*|trojan|ransomware|spyware|adware|hack(?:ed|er|ers|ing)|phish\w*|scam\w*|suspicious|dodgy|sketchy|legit\w*|genuine|fake|spoof\w*|firewall|start(?:s|ing)? (?:up )?with windows|startup (?:apps?|items?|programs?)|open ports?|breach\w*|pwned|leak(?:ed|s)?|password|2fa|two.?factor|privacy|op.?sec|metadata|exif|gps|location data|hidden (?:details|info)|osint|who owns|whois|is (?:this|that|it) (?:real|safe|legit)|look ?up (?:this|that|a) (?:site|website|link|sender|email|ip)|footprint|dork\w*)\b/i,
  apps: /\b(open|launch|click|press|button|type (?:in|into)|app|apps|notepad|browser|chrome|explorer|blender|paint\.net|drive|driving|take (?:the )?(?:wheel|control|over)|screen control|control (?:my|the) (?:pc|computer|screen)|use my (?:screen|pc|computer|mouse|keyboard)|do it in)\b/i
};

const HAND_WHAT = {
  files: 'move, copy, rename, zip, unzip, tidy files and folders, undo',
  run: 'run commands, scripts, programs',
  schedules: 'repeat a job at set times (every morning...)',
  apps: 'open apps and click, type or press keys in them',
  office: 'convert files (documents, PDF, pictures, sound, video), read, make and change Word, Excel, PowerPoint and LibreOffice files',
  security: 'check the PC\'s protection, Defender scans and alerts, inspect suspicious files, emails and links, remove hidden details from photos, check if a site is genuine or was breached, safety and op-sec notes'
};
// What each picture-group tool adds, so the group says only what this PC can really make.
const PICTURE_WHAT = { make_image: 'make pictures', make_video: 'make video clips', make_music: 'make music', make_sound: 'make sound effects', save_reference: 'save reference pictures', workshop_run: 'run ComfyUI workflows' };

export function groupsFor(brain) {
  const g = {};
  for (const [id, x] of Object.entries(WORK_GROUPS)) g[id] = { ...x };
  for (const [id, hand] of Object.entries(HANDS)) {
    g[id] = { what: HAND_WHAT[id] || `Hands, ${hand.label.toLowerCase()}`, tools: hand.tools, words: HAND_WORDS[id] || /$^/, hand: id };
  }
  // Only groups with at least one tool Bob can use on this PC right now.
  const out = {};
  for (const [id, x] of Object.entries(g)) {
    const usable = x.tools.filter((n) => brain.usable(n));
    if (!usable.length) continue;
    out[id] = { ...x, tools: usable };
    if (id === 'pictures') out[id].what = usable.map((n) => PICTURE_WHAT[n]).filter(Boolean).join(', ');
  }
  return out;
}

export const groupOf = (brain, name) => Object.entries(groupsFor(brain)).find(([, x]) => x.tools.includes(name))?.[0] || null;

// The groups the user's words point at this turn.
export function guessGroups(brain, text) {
  const t = String(text || '');
  return Object.entries(groupsFor(brain)).filter(([, x]) => x.words.test(t)).map(([id]) => id);
}

// The chat chip when a group is added (clarity reviewer's words; Hands match their names in Settings).
const CHIP = { pictures: 'Using his picture, video and music tools', documents: 'Using his document tools', files: 'Using his file tools', run: 'Using Hands: run programs', schedules: 'Using Hands: schedules', apps: 'Using Hands: apps', office: 'Using Hands: office and converting', security: 'Using Hands: security and privacy', memory: 'Forgetting a topic', cloud: 'Using a cloud helper' };

export const allToolsOn = (cfg) => cfg.allTools === true;

// How many of the chat's next messages a used group stays for.
export const STICKY_TURNS = 3;

// The use_tools tool. Its group list is filled in per turn (brain.toolSchemas), so Bob only sees groups he can add.
export function useToolsTool(brain) {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'use_tools',
        description: 'Add a group of tools you need for this job, then call them. Groups: {{GROUPS}}.',
        parameters: { type: 'object', properties: { group: { type: 'string', description: 'Which group', enum: ['{{GROUP_IDS}}'] } }, required: ['group'] }
      }
    },
    async run({ group }, ctx) {
      const groups = groupsFor(brain);
      const id = String(group || '').toLowerCase().trim();
      const handId = Object.keys(HANDS).find((h) => h === id);
      if (!groups[id]) {
        if (handId && !handOn(brain.cfg, handId)) return handOffWhy(brain.cfg, handId);
        return `There is no group called ${group || '(none)'}. Groups you can add: ${Object.keys(groups).join(', ') || 'none'}.`;
      }
      ctx.loaded?.add(id);
      return `Added ${id}: ${groups[id].tools.join(', ')}. Call the one you need now.`;
    },
    summary: ({ group }) => CHIP[String(group || '').toLowerCase().trim()] || 'Using more of his tools'
  };
}

// The text that fills in use_tools's description and enum.
// 1.5.26: an empty "enum" (for example the project list when there are no projects) makes llama.cpp's tool grammar
// refuse the whole request ("enum must be a non-empty array"). Drop empty enums anywhere in a tool's schema;
// the parameter stays, as a plain value.
export function tidySchema(x) {
  if (Array.isArray(x)) return x.map(tidySchema);
  if (!x || typeof x !== 'object') return x;
  const out = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === 'enum' && Array.isArray(v) && !v.length) continue;
    out[k] = tidySchema(v);
  }
  return out;
}

export function fillUseTools(schema, groups, loaded) {
  const open = Object.entries(groups).filter(([id]) => !loaded.has(id));
  if (!open.length) return null; // everything's already here; no need for the tool
  const s = JSON.parse(JSON.stringify(schema));
  // The groups are described once, in the prompt line (toolboxPrompt); here just the names.
  s.function.description = s.function.description.replace('{{GROUPS}}', open.map(([id]) => id).join(', '));
  s.function.parameters.properties.group.enum = open.map(([id]) => id);
  return s;
}

// One line in the front desk's prompt naming the groups not added yet (router test, 2026-11-02: without it,
// small brains said "I can't make pictures yet" instead of calling use_tools). About 80 tokens.
export function toolboxPrompt(brain, loaded) {
  if (allToolsOn(brain.cfg)) return '';
  const open = Object.entries(groupsFor(brain)).filter(([id]) => !loaded.has(id));
  if (!open.length) return '';
  return `\n\nMore you CAN do: call use_tools with a group, then its tool. ${open.map(([id, x]) => `${id} = ${x.what}`).join('; ')}. Never say you can't do these.`;
}

// "I can't do that" with no tool call: worth one more go with every tool (router test fix). Kept narrow.
// An empty reply (no words, no tool call) counts too: the router test and a real "show me a picture" both hit it.
export function saysCant(text) {
  if (!String(text || '').trim()) return true;
  return /\b(?:I\s*(?:can(?:'|\u2019)?t|cannot|am not able to|'m not able to|am unable to|'m unable to)|I\s+don(?:'|\u2019)?t\s+have\s+(?:a|the|any)\s+(?:tool|way|ability|access))\b/i.test(String(text || ''));
}
