// Bob's toolbox (1.5.5): every chat starts with a small core of tools. The rest sit in groups that are added
// only when a message needs them, so his small brain isn't carrying ~4,000 tokens of tool descriptions it
// won't use. Three ways a group gets added:
//   1. the user's words this turn match the group (cheap word check, no extra model call),
//   2. Bob asks for it with use_tools(group),
//   3. Bob calls one of its tools by name anyway (small models do this): it's added and the call runs.
// A group used in a chat stays for the next few messages of that chat, then drops off again.
// Setting allTools (Advanced, off) sends every tool every time, the old way.
import { HANDS, handOn, handOffWhy } from './hands-settings.js';
import { makerWords, makerWhat } from './selftools.js';
import { mcpWords, mcpWhat } from './mcp.js';
import { packsWords, packsWhat } from './toolpacks.js';
import { selfWorkWords } from './self-work.js';
import { GROUP_WORDS, GROUP_TOOLS, GROUP_WHAT } from './more-tools.js'; // 🧰 More tools, each only while its switch is on

export const CORE = ['notice_board', 'remember', 'reminders', 'list_folder', 'read_file', 'web_search', 'fetch_page', 'bob_help', 'ask_specialist', 'show_made', 'pick_session', 'edit_my_message', 'take_note', 'offer_setup', 'use_tools', 'ask_user'];

// Groups Bob can add. `what` is what Bob reads in use_tools; `words` is the cheap pre-check on the user's message.
const WORK_GROUPS = {
  pictures: {
    what: 'make pictures, video clips, music and sound effects; save reference pictures; ComfyUI workflows', // narrowed to what this PC has, see groupsFor
    tools: ['make_image', 'make_video', 'save_reference', 'make_music', 'make_sound', 'save_as', 'workshop_list', 'workshop_run'],
    words: /\b((?:picture|image|photo|pic)s? of|pic|pics|picture|image|photo|draw|drawing|paint|painting|render|sketch|artwork|art|portrait|wallpaper|logo|icon|sprite|concept|illustrat\w*|video|clip|animat\w*|music|song|tune|melody|beat|chiptune|soundtrack|jingle|sound|sfx|workflow|comfy\w*|reference|character sheet)s?\b|\b(?:visuali[sz]e|doodle|poster|banner|thumbnail|album (?:art|cover)|cover art|pfp|profile pic\w*|avatar|emoji|sticker|meme|comic|photoshop|show me what|movie|gif|mock ?up|(?:a )?cover for my (?:book|album|game|ep|single|podcast)|bring (?:it|this|that|him|her) to life|make (?:it|this|that|him|her) (?:move|dance|talk|walk)|lo-?fi|track|theme (?:song|tune|music)|(?:a|the) theme for|noise|sound effect|foley|save (?:it|that|this|them) as (?:an? )?(?:mp3|wav|ogg|flac|jpe?g|png|webp|gif|mp4|webm))\b/i // 1.5.94: plain-English phrasings (test/phrasings.js)
  },
  diagrams: { // 1.5.95 (diagram.js)
    what: 'draw flowcharts and diagrams: steps, decisions, mind maps, timelines, org charts, project plans, pie charts',
    tools: ['make_diagram'],
    words: /\b(flow ?charts?|diagrams?|mind ?maps?|org(?:ani[sz]ation(?:al)?)? charts?|family trees?|decision trees?|process (?:map|chart)s?|gantt|timelines?|pie charts?|bar charts?|swim ?lanes?|wireframes?|boxes and arrows|map (?:it |this |that |them )?out|lay (?:it |this |that )?out visually|chart (?:out|how)|(?:draw|sketch|show) (?:me )?(?:how|the steps|the process|the flow)|visual(?:ly)? (?:show|map|lay)|mermaid|uml|er diagram|sequence)\b/i
  },
  documents: {
    what: 'write or edit files, save spreadsheets, search inside files and documents, map a codebase, see what changed (git)',
    tools: ['write_file', 'edit_file', 'save_spreadsheet', 'search_files', 'find_in_documents', 'code_map', 'git_look'],
    words: /\b(save|write|edit|git|commits?|diffs?|what (?:i |we )?changed|uncommitted|documents?|txt|csv|xlsx|spreadsheet|excel|pdfs?|word (?:doc|file)s?|search (?:my|the|in|for)|find (?:in|where|the (?:file|doc|document|pdf))|grep|jot|text file|notes? file|(?:in|through) my (?:files|documents|docs|folders)|where did I (?:mention|write|put|say|save)|which (?:file|document|doc|pdf))\b/i
  },
  parts3d: { // "3D parts" (parts3d.js): only while it's on (offTools hides it otherwise)
    what: 'make exact 3D parts (STL files for a 3D printer) from an OpenSCAD recipe: brackets, boxes, lids, spacers, replacement parts; and turn a picture into a textured 3D model (GLB): figurines, characters, props',
    tools: ['make_3d_part', 'make_3d_model'],
    words: /\b(3d|3-d|stl|openscad|scad|cad|3d ?print\w*|printable|bracket|enclosure|spacer|washer|standoff|knob|hinge|gear|cog|replacement part|spare part|part for|glb|figurine|sculpt\w*|miniature|3d model|mesh)s?\b/i
  },
  sandbox: { // "Code sandbox" (sandbox-code.js): only while it's on (offTools hides it otherwise)
    what: 'work out sums, money, dates, unit conversions, counting and sorting exactly, by running a little code in a locked sandbox',
    tools: ['run_in_sandbox'],
    words: /\b(calculat\w*|work (?:it |this |that )?out|how (?:many|much|long) (?:days|weeks|months|years|hours|minutes|until|till|since|left)|add (?:up|these|them)|total|sum|average|mean|median|percent\w*|per cent|interest|compound|tip|split (?:the )?(?:bill|cost)|convert (?:\d|this|that|these)|in (?:km|miles|kg|lbs?|pounds|celsius|fahrenheit|inches|cm|feet|metres|meters|litres|liters|gallons|ounces)|sort (?:this|these|them|the list)|count (?:the|how|these)|regex|pattern|run (?:the |some |this )?(?:code|numbers|maths?|math)|sandbox|exact(?:ly)?)\b/i
  },
  spending: { // 🧾 "Receipts to spending sheet" (receipts.js): only while it's on (offTools hides it otherwise)
    what: 'add a receipt from a picture to the private spending sheet, list it, or total it up',
    tools: ['spending_sheet'],
    words: /\b(receipts?|spending|spent|expenses?|bills? (?:from|at)|how much (?:did )?i (?:spend|spent)|budget)\b/i
  },
  memory: {
    what: 'forget a topic you keep notes on',
    tools: ['forget_topic'],
    words: /\b(forget|erase|delete (?:the |that |your )?(?:note|topic|memory))\b/i
  },
  howtos: { // 1.5.79: only while "Learn how-tos" is on (offTools hides the tools otherwise)
    what: 'keep the steps of a job that worked as a how-to, list your how-tos',
    tools: ['save_howto', 'my_howtos'],
    words: /\b(how-tos?|remember how (?:to|you|we)|(?:same|like) (?:way |as )?(?:as )?(?:last time|before)|keep (?:those|these|the) steps|save (?:those|these|the) steps)\b/i
  },
  selfwork: { // "Work on repositories" (self-work.js): only while it's on and a code copy is made
    what: 'change your own app (Bob\'s code) or one of the user\'s repositories, on its code copy',
    tools: ['work_on_repo'],
    words: /\b(your (?:own )?(?:app|code|source|program)|bob'?s (?:own )?(?:app|code|source)|(?:work on|improve|upgrade|fix|change|update|patch) (?:your ?self|you)|(?:add|give) (?:yourself|you) (?:a |an )?(?:feature|switch|button|setting|option)|(?:feature|switch|button|setting|option|page|tab) (?:to|for|in|on) your ?self|code copy|(?:in|on|to) (?:the |my |our )?(?:\w+ )?(?:repo|repository)|(?:repo|repository) (?:called|named))\b/i
  },
  cloud: {
    what: 'hand a job to a paid cloud helper, or hire a rented brain',
    tools: ['ask_cloud', 'hire_brain'],
    words: /\b(cloud|claude|gpt|openai|gemini|anthropic|online model|bigger model|rent|rented|hire|runpod|openrouter)\b/i
  }
};

// The Hands each get their own group, only when that Hand is switched on.
const HAND_WORDS = {
  files: /\b(move|copy|rename|zip|unzip|unpack|archive|extract|(?:clear|free) (?:up )?(?:some )?(?:disk )?space|biggest files|disk space|tidy|organi[sz]e|sort|clean ?up|downloads|undo|folder|folders)\b/i,
  sort: /\b(sort|rename|renam\w+|organi[sz]e|tidy|naming|name (?:them|these|my|all)|librar(?:y|ies)|music (?:folder|collection)|my (?:music|songs|albums|videos|movies|films|shows|tv|episodes|photos)|downloads|output folder|undo)\b/i,
  run: /\b(run|execute|command|script|terminal|powershell|cmd|install|build|npm|python|node|git|recipe|(?:start|fire|spin|boot) (?:up )?(?:the |my |a )?(?:dev |local |web )?(?:server|app|game|project|bot)|dev server|compile)\b/i,
  schedules: /\b(schedules?|scheduled|every (?:day|morning|afternoon|evening|night|week|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|month|hour|\d+)|each (?:day|morning|evening|night|week|weekday|hour)|daily|nightly|weekly|hourly|on a timer|automatically|at \d{1,2}(?::\d\d)?\s*(?:am|pm)|(?:on |every )?weekdays|(?:on |every )?weekends)\b/i,
  office: /\b(convert\w*|shrink|compress\w*|make (?:it|this|that) smaller|turn (?:it|this|that|them|these) into|save (?:it |this |that )?as|export\w*|pdf|docx?|xlsx?|pptx?|odt|ods|odp|word (?:doc\w*|file)|excel|powerpoint|libre ?office|open ?office|writer|calc|impress|slides?|presentation|slideshow|deck|spreadsheet|sheet|cells?|template|mp3|mp4|wav|webm|webp|flac|ogg|mkv|gif|jpe?g|png)\b/i,
  security: /\b(secur\w*|virus\w*|malware|antivirus|defender|scan(?:s|ning)?|threats?|quarantin\w*|trojan|ransomware|spyware|adware|hack(?:s|ed|er|ers|ing)?|phish\w*|scam\w*|suspicious|dodgy|sketchy|legit\w*|genuine|fake|spoof\w*|firewall|start(?:s|ing)? (?:up )?with windows|startup (?:apps?|items?|programs?)|open ports?|breach\w*|pwned|leak(?:ed|s)?|password|2fa|two.?factor|privacy|op.?sec|metadata|exif|gps|location data|hidden (?:details|info)|osint|who owns|whois|is (?:this|that|it) (?:real|safe|legit)|look ?up (?:this|that|a) (?:site|website|link|sender|email|ip)|footprint|dork\w*|(?:is|are) (?:this|that|it|these|those) (?:\w+ )?safe|safe to (?:click|open|download|install|run|use)|infect\w*|feels? off with my (?:computer|pc|laptop)|location)\b/i,
  apps: /\b(open|launch|click|press|button|type (?:in|into)|app|apps|notepad|browser|chrome|explorer|blender|paint\.net|drive|driving|take (?:the )?(?:wheel|control|over)|screen control|control (?:my|the) (?:pc|computer|screen)|use my (?:screen|pc|computer|mouse|keyboard)|do it in|what(?:'s| is) on (?:my|the) screen|look at (?:my|the) (?:screen|window))\b/i,
  browser: /\b(browser|browse|web ?pages?|web ?sites?|site|log ?in (?:to|on)|sign ?in (?:to|on)|fill (?:in|out)|forms?|on the page|click (?:the|on|that) (?:link|button)|open (?:the |that |this )?(?:link|page|site|url)|url|https?:\/\/\S+|[a-z0-9-]+\.(?:com|org|net|ca|io|co\.uk|gov|edu)\b|search (?:on|at|in) \w+|amazon|youtube|github|wikipedia|google|ebay|kijiji|craigslist|look (?:it |this |that )?up on)\b/i
};

const HAND_WHAT = {
  files: 'move, copy, rename, zip, unzip, tidy files and folders, undo',
  sort: 'sort and rename many files (music, videos, photos) to the user\'s naming rules, or from Downloads into their folders, undo',
  run: 'run commands, scripts, programs',
  schedules: 'repeat a job at set times (every morning...)',
  apps: 'open apps and click, type or press keys in them, with a look at the screen through your eyes brain',
  browser: 'use Bob\'s own browser window: open a web page, read it, click links and buttons, type in fields, scroll, go back',
  office: 'convert files (documents, PDF, pictures, sound, video), read, make and change Word, Excel, PowerPoint and LibreOffice files',
  security: 'check the PC\'s protection, Defender scans and alerts, inspect suspicious files, emails and links, remove hidden details from photos, check if a site is genuine or was breached, safety and op-sec notes'
};
// What each picture-group tool adds, so the group says only what this PC can really make.
const PICTURE_WHAT = { make_image: 'make pictures', make_video: 'make video clips', make_music: 'make music', make_sound: 'make sound effects', save_reference: 'save reference pictures', save_as: 'save what you made as another file type (mp3, jpg...)', workshop_run: 'run ComfyUI workflows' };

export function groupsFor(brain) {
  const g = {};
  for (const [id, x] of Object.entries(WORK_GROUPS)) g[id] = { ...x };
  for (const id of Object.keys(GROUP_TOOLS)) g[id] = { what: GROUP_WHAT[id], tools: GROUP_TOOLS[id], words: GROUP_WORDS[id] };
  // The user's repositories by name, so "fix the login bug in WeatherApp" finds the tool (self-work.js).
  g.selfwork.words = selfWorkWords(brain.cfg, g.selfwork.words);
  for (const [id, hand] of Object.entries(HANDS)) {
    g[id] = { what: HAND_WHAT[id] || `Hands, ${hand.label.toLowerCase()}`, tools: hand.tools, words: HAND_WORDS[id] || /$^/, hand: id };
    // A shared tool (Undo) goes with this Hand's group while its own Hand is off, so it is in one group only.
    for (const t of hand.shares || []) {
      const owner = Object.keys(HANDS).find((h) => HANDS[h].tools.includes(t));
      if (owner && brain.cfg && handOn(brain.cfg, id) && !handOn(brain.cfg, owner)) { g[id].tools = [...g[id].tools, t]; if (g[owner]) g[owner].tools = g[owner].tools.filter((x) => x !== t); }
    }
    // 1.5.48: the tools Bob made himself are named in the group, so "run my csv tool" finds them.
    if (id === 'maker') Object.assign(g[id], { what: makerWhat(brain.cfg), words: makerWords(brain.cfg) });
    // The connected apps by name, so "in Blender, add a cube" finds them.
    if (id === 'mcp') Object.assign(g[id], { what: mcpWhat(brain.cfg), words: mcpWords(brain.cfg) });
    // Tool packs from other people (toolpacks.js) by name, so "count the words with the word tools pack" finds them.
    if (id === 'packs') Object.assign(g[id], { what: packsWhat(brain.cfg), words: packsWords(brain.cfg) });
  }
  // Only groups with at least one tool Bob can use on this PC right now.
  const out = {};
  for (const [id, x] of Object.entries(g)) {
    const usable = x.tools.filter((n) => brain.usable(n));
    if (!usable.length) continue;
    out[id] = { ...x, tools: usable };
    // 1.5.91: a maker that isn't set up is still listed (calling it shows the Set it up card), and says so.
    // 1.5.102: the not-set-up note once for all of them, not after each one.
    if (id === 'pictures') {
      const named = usable.filter((n) => PICTURE_WHAT[n]);
      const notYet = named.filter((n) => brain.notSetUp?.(n)), ready = named.filter((n) => !brain.notSetUp?.(n));
      out[id].what = [notYet.length ? `${notYet.map((n) => PICTURE_WHAT[n]).join(', ')} (not set up yet: calling ${notYet.length > 1 ? 'one' : 'it'} offers to set it up)` : '', ready.map((n) => PICTURE_WHAT[n]).join(', ')].filter(Boolean).join(', ');
    }
  }
  return out;
}

export const groupOf = (brain, name) => Object.entries(groupsFor(brain)).find(([, x]) => x.tools.includes(name))?.[0] || null;

// The groups the user's words point at this turn.
// Assistant presets (presets.js): only the groups a chat's preset allows. `only` null = every group, as usual.
export function onlyGroups(groups, only) {
  if (!only) return groups;
  return Object.fromEntries(Object.entries(groups).filter(([id]) => only.has(id)));
}

export function guessGroups(brain, text) {
  const t = String(text || '');
  return Object.entries(groupsFor(brain)).filter(([, x]) => x.words.test(t)).map(([id]) => id);
}

// The chat chip when a group is added (clarity reviewer's words; Hands match their names in Settings).
const CHIP = { pictures: 'Using his picture, video and music tools', diagrams: 'Using his diagram tools', parts3d: 'Using his 3D part tools', documents: 'Using his document tools', files: 'Using his file tools', sort: 'Using Hands: sort and rename', run: 'Using Hands: run programs', schedules: 'Using Hands: schedules', apps: 'Using Hands: apps', browser: 'Using Hands: his browser', office: 'Using Hands: office and converting', security: 'Using Hands: security and privacy', maker: 'Using Hands: his own tools', mcp: 'Using Hands: connected apps', memory: 'Forgetting a topic', howtos: 'Using his how-tos', selfwork: 'Working on a repository', cloud: 'Using a cloud helper' };

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
      const all = groupsFor(brain);
      const groups = onlyGroups(all, ctx?.loaded?.only);
      const id = String(group || '').toLowerCase().trim();
      if (all[id] && !groups[id]) return `This chat's assistant preset leaves out ${id}. Say so in a line; a chat without this preset can use it.`;
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
    // Less context is better (1.5.207): an empty required list and "Optional:" in front of a field the required list
    // already leaves out say nothing the brain doesn't know. About 500 characters with everything on.
    if (k === 'required' && Array.isArray(v) && !v.length) continue;
    if (k === 'description' && typeof v === 'string') { out[k] = v.replace(/^Optional(?:[:,] ?|\. )(\S)/, (_, c) => c.toUpperCase()); continue; }
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
  if (allToolsOn(brain.cfg) && !loaded?.only) return '';
  const open = Object.entries(onlyGroups(groupsFor(brain), loaded?.only)).filter(([id]) => !loaded.has(id));
  if (!open.length) return '';
  return `\n\nMore you CAN do: call use_tools with a group, then its tool. ${open.map(([id, x]) => `${id} = ${x.what}`).join('; ')}. Never say you can't do these.`;
}

// "I can't do that" with no tool call: worth one more go with every tool (router test fix). Kept narrow.
// An empty reply (no words, no tool call) counts too: the router test and a real "show me a picture" both hit it.
export function saysCant(text) {
  if (!String(text || '').trim()) return true;
  // 1.5.65: "I don't have live web access" / "no internet access" (Qwen3 4B, asked about a link) counts too.
  if (/\b(?:no|don(?:'|\u2019)?t\s+have|do\s+not\s+have)\s+(?:live\s+|real-time\s+)?(?:web|internet|online)\s+access\b/i.test(String(text))) return true;
  return /\b(?:I\s*(?:can(?:'|\u2019)?t|cannot|am not able to|'m not able to|am unable to|'m unable to)|I\s+don(?:'|\u2019)?t\s+have\s+(?:a|the|any)\s+(?:tool|way|ability|access))\b/i.test(String(text || ''));
}
