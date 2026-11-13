// Phase 0, step 2: Qwen3.6 writes Bob's lessons. Every lesson is a real Bob turn: his own system prompt and the tools
// he'd really offer for that message (src/brain.js frontDeskTools), with neutral names and a throwaway settings
// folder, so nothing from anyone's own chats, notes or files goes in. Half think, half don't.
// Tool results are played by the teacher (nothing is really run); use_tools is answered the way Bob answers it.
// Resumable: run it again and it carries on. A file called PAUSE in the out folder pauses it.
// node write-lessons.mjs [--count 4000] [--hours 10] [--images <folder of pictures>] [--bob ...] [--model ...]
// Coding set (step 2 of Riker's coding plan): --jobs coding:3,science:1 --think all --dir lessons-coding --count 800
//   --jobs a,b   only these jobs      --think all|none|half (default half)      --dir name   output folder under out\ (default lessons)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { opts, locate, checkFree, startServer, chat, appendJsonl, readJsonl, pauseGate } from './common.mjs';
import { loadBob } from './bob-kit.mjs';
import { toolSetFor } from '../src/tool-sets.js';

const o = opts({ count: 4000, hours: 0 });
const L = locate(o);
if (!L.model) { console.error('Qwen3.6 GGUF not found. Pass --model.'); process.exit(1); }
// --url <server>: use a rented teacher (vLLM) instead of starting llama-server here. Set LAB_API_KEY and LAB_MODEL_NAME.
const remoteUrl = o.url ? String(o.url).replace(/\/$/, '') : null;
// --persona <file>: appended to Bob's system prompt for every lesson (a voice for a themed set); Bob's own rules stay in front of it.
const persona = o.persona ? fs.readFileSync(path.resolve(String(o.persona)), 'utf8').trim() : '';
// --tag "Think: Sherlock" (12 Nov): a short switch line added to Bob's system prompt in BOTH the teacher's prompt and the saved
// lesson, while the --persona text (how that style thinks) is only shown to the teacher. The student learns to think that
// way from the short line alone, so the style can be picked at chat time (a "switch"), tool turns included.
const tag = o.tag ? String(o.tag).replace(/[\r\n]+/g, ' ').trim().slice(0, 80) : '';
if (remoteUrl) process.env.LAB_REMOTE = '1'; else checkFree(o);
const parallel = Math.max(1, Number(o.parallel) || 1);
const kit = await loadBob(L.bob);
// 12 Nov (later): the idea writer is told what Bob's tools can really do, so it doesn't invent jobs no tool covers (calendar events...)
const TOOLBOX = (() => { try { return Object.entries(kit.groups()).map(([k, g]) => `${k} (${g.what || (g.tools || []).join(', ')})`).join('; '); } catch { return ''; } })();
const toolboxNote = TOOLBOX ? ` Only ask for things this assistant can really do: its basic tools (list and read files, web search, open a web page, reminders, a notice board, memory) plus ${TOOLBOX}. Nothing else (no calendar app, no email sending, no phone calls).` : '';
// and, for jobs where the message should carry everything, the teacher (only) is reminded to act on it rather than ask again
const ACT_JOBS = new Set(['precise', 'missed', 'agent', 'twins', 'recover', 'codefix', 'research', 'files', 'office', 'run', 'schedules', 'web', 'pictures', 'reminders', 'security', 'apps']);
const ACT_NUDGE = 'Act on the details the person already gave (names, paths, times, amounts) with the right tool; do not ask again for anything that is already in the message.';
const dir = path.join(L.out, o.dir ? String(o.dir).replace(/[^\w.-]/g, '') : 'lessons'); fs.mkdirSync(dir, { recursive: true });
const F = { ideas: path.join(dir, 'ideas.jsonl'), lessons: path.join(dir, 'lessons.jsonl'), sets: path.join(dir, 'toolsets.json') };
const until = Number(o.hours) > 0 ? Date.now() + Number(o.hours) * 3600e3 : Infinity;
const target = Number(o.count);

// What people ask Bob for. share = part of the ideas; the rest of the mix comes from Bob's own test phrasings.
const JOBS = [
  ['chat', 'casual chat, small talk, how their day went, jokes, asking Bob about himself or his cat Patches', 8],
  ['advice', 'everyday advice: cooking, money, health habits, relationships, travel, shopping choices', 6],
  ['knowledge', 'questions about science, history, geography, how things work, definitions', 8],
  ['writing', 'writing help: emails, messages, stories, poems, cover letters, rewording, summarising pasted text', 7],
  ['coding', 'programming help in C, C++, Rust, JavaScript, Python, Kotlin for Android, Unreal Engine C++ and Blueprints, Blender Python, web pages; bugs, explanations, small programs', 12],
  ['maths', 'maths and logic: arithmetic, percentages, unit conversions, word problems, puzzles', 5],
  ['formats', 'answers that must follow an exact shape: reply only as JSON with given keys, a markdown table, a numbered list of exactly N items, yes/no only, a fixed template, CSV lines, exact wording to repeat', 0],
  ['gamemaster', 'running a text adventure or a party game as the game master: describing a scene, an enemy, a fight round, a shop, a riddle; reacting to the player\'s action card; keeping score in a word game; story dice prompts', 0],
  ['refusals', 'requests Bob should politely decline or steer to safety: malware, stalking someone, dangerous chemistry, cheating others, self-harm (reply with care and a helpline), plus borderline ones that are actually fine (security of their own PC, fiction with villains)', 0],
  ['languages', 'ordinary chat and questions written in French, Spanish, German, Ukrainian, Tagalog or Punjabi (the person types in that language and expects the answer in it)', 0],
  ['codefix', 'coding where the first attempt has a bug: the person asks for a small program or fix, Bob writes it, runs it with the run tool, reads the error, fixes it and runs it again until it works', 0],
  ['recover', 'ordinary file, folder, web, reminder or office tasks where the first tool call fails (wrong path, file missing, no permission, timeout, bad format) and Bob must notice the error, try another way or say plainly what went wrong', 0],
  ['clarify', 'requests too thin or ambiguous to act on safely (a bare word, two things it could mean, a missing file name, an unclear date) where the right move is one short clarifying question instead of guessing', 0],
  ['notes', 'the person corrects Bob or states a preference or a fact about themselves or their setup ("no, I use Linux", "call me Sam", "always answer in metric") and Bob saves a short note to memory and uses it', 0],
  ['newtool', 'tasks that need a tool Bob has not used before: he first looks at the list of available tools and their descriptions, picks one, reads what it needs, then calls it', 0],
  ['selfhelp', 'questions about Bob himself (his settings, sessions, brains, Hands, where files go, what a button does) where Bob reads his own Help or settings first with the tools he has and answers from what he read, saying so, instead of guessing', 0],
  ['selfcheck', 'tasks where Bob checks his own answer before sending it: re-reads the request, tests a claim or a calculation a second way, runs the code, or asks the reviewer, then corrects himself if needed and says what he checked', 0],
  ['research', 'looking something up properly: a question that needs several sources or files, where Bob searches or reads more than one place, compares what they say, pulls out what matters, says what is uncertain and where each point came from', 0],
  ['understand', 'a pasted text, log, message or described problem that must be understood before acting: Bob restates what it says and what is being asked in his own words, points out what is missing or unclear, and only then answers or asks', 0],
  // 12 Nov: aimed at what the benchmark showed every Bob gets wrong (tools called on plain chat, arguments, long jobs)
  ['restraint', 'messages that mention files, the web, code, reminders or apps but only want an explanation, an opinion, advice or a quick fact Bob already knows ("what is a zip file?", "is it safe to delete temp files?", "how do reminders usually work?", "what does this error usually mean?"): Bob answers directly from his own knowledge and calls NO tool', 0],
  ['precise', 'jobs full of exact details Bob must copy into the tool call exactly: file and folder names with spaces or odd characters, full paths, dates and times ("next Tuesday at 7:30pm"), amounts, units, quoted text, several items at once', 0],
  ['agent', 'bigger jobs that need three to six tool calls in a row, where each step depends on what the last one returned (find the files, read them, summarise, save the summary, remind me later): Bob says a one-line plan, does it, checks each result and finishes with a short summary of what he did', 0],
  // 12 Nov (later): the owner asked for the rest of the test-design list in this rental
  ['twins', 'pairs of messages on the same topic where one needs a tool and the other does not: first a message about something concrete Bob must act on (a named or attached file, a link, their own PC, a time to schedule, a document to convert), then a plain question on the same topic that Bob answers from what he knows with NO tool (e.g. "is this email a scam?" with the email pasted, then "how can I tell if an email is a scam?")', 0],
  ['missed', 'plain requests Bob\'s tests showed he gets wrong, said many different ways: make a poster, banner, logo or thumbnail; zip or unzip a project, rename photos by date, put all the PDFs in one folder, sort a messy desktop; run the tests, install dependencies, build or compile a project, start the dev server; do something every Friday or on weekdays at 9am; turn a file into a PDF, convert an essay to Word, export as a Word doc, total a column in an Excel file, convert mp4 to mp3, shrink a video to email it; is this email a scam, is this link safe; save this as notes.txt, write that to a file; remember how you did that, do it the same way as last time. Bob goes straight to the right tool (no listing folders or looking at git first) and fills in what it needs', 0],
  ['default', 'requests that look a little vague but have one obvious sensible default (no format given for a list, no folder given for a save, "remind me tomorrow" with no time, "make it smaller" for a picture): Bob does it with the sensible default and says in one short line which default he picked and how to change it, instead of asking a question', 0],
  ['science', 'physics, maths, chemistry and electronics: how things work, worked calculations, circuits and components, units, formulas, explaining a concept plainly, checking a calculation', 0],
  ['plans', 'planning: trips, projects, study plans, step-by-step plans for a big job', 4],
  ['reminders', 'reminders, to-do lists and the notice board: add, change, list, clear', 4],
  ['memory', 'asking Bob to remember or forget facts about them, or what he remembers', 3],
  ['web', 'questions needing fresh facts from the web: news, prices, opening hours, weather, latest versions', 4],
  ['pictures', 'making pictures, video clips, music, sound effects', 6],
  ['files', 'their files and folders: find, read, move, rename, tidy, zip', 5],
  ['office', 'documents and spreadsheets: make a Word file, a spreadsheet, convert to PDF, read a document', 4],
  ['run', 'running programs, scripts and commands on the PC', 3],
  ['schedules', 'scheduled tasks: run something every morning, at a time, weekly', 2],
  ['security', 'PC safety: virus scans, suspicious links or emails, privacy, strong passwords, op-sec', 3],
  ['apps', 'using apps on the PC: open, type into, click in Blender or Unreal through connected apps', 2],
  ['help', 'how to use Bob himself: his settings, sessions, brains, Hands, Bob-Net, phone app, updates', 4]
];
const onlyJobs = o.jobs ? String(o.jobs).split(',').map((x) => x.trim()).filter(Boolean) : null;
const SCI_ANGLES = ['physics: motion, energy, forces, heat, light, with a worked calculation', 'electronics: circuits, Ohm\'s law, resistors, capacitors, transistors, microcontrollers, power supplies', 'chemistry: reactions, moles, acids and bases, materials, safety', 'maths beyond arithmetic: algebra, geometry, trig, probability, a bit of calculus', 'checking a calculation or unit conversion the person already did', 'explaining a science concept in plain words to a curious adult', 'practical engineering: batteries, motors, 3D printing materials, soldering, sensors'];
const thinkMode = String(o.think || 'half');
// --review: the teacher reads each finished lesson and grades it; a failed one goes to rejected.jsonl (with why), not lessons.jsonl
const review = Boolean(o.review);
// --avoid <folders>: requests already in these lesson folders are never written again (first user message, lowercased, gaps squeezed)
const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const avoid = new Set();
for (const d of String(o.avoid || '').split(',').filter(Boolean)) for (const f of ['lessons.jsonl', 'heldout.jsonl']) for (const l of readJsonl(path.join(d, f))) { const u = l.messages?.find((m) => m.role === 'user'); if (typeof u?.content === 'string') avoid.add(norm(u.content)); }
if (avoid.size) console.log(`avoiding ${avoid.size} requests already in the given lesson folders`);
const dropTools = new Set(String(o['drop-tools'] || o.dropTools || '').split(',').filter(Boolean)); // --drop-tools ask_specialist,pick_session: these tools are not offered, so the teacher answers itself
const CODE_ANGLES = ['fixing a bug in pasted code (include the code)', 'writing a small complete program from scratch', 'explaining what a piece of code does', 'JavaScript or TypeScript for a web page or Node', 'Python scripts and data handling', 'C++ or Rust, memory and performance', 'Unreal Engine C++ and Blueprints', 'Kotlin for Android apps', 'Blender Python add-ons and scripts', 'shell, PowerShell or batch scripts on Windows', 'SQL and databases', 'reading or writing files on the PC, then running the result', 'tests, refactors and code review', 'git, builds, packaging and errors from tools', 'software design: how to structure a small program, data layout, which approach and why', 'debugging a described problem step by step (crash, wrong output, slow code) without the code pasted', 'explaining a software engineering idea plainly (big-O, concurrency, APIs, memory, version control)'];
const STYLES = ['short and casual', 'polite and detailed', 'with small typos', 'very brief, a few words', 'a bit frustrated', 'curious, asking why', 'in a hurry', 'chatty, with some context first', 'from a beginner', 'from an expert'];

function setKey(system, tools) {
  const k = crypto.createHash('sha1').update(system).update(JSON.stringify(tools)).digest('hex').slice(0, 12);
  const sets = fs.existsSync(F.sets) ? JSON.parse(fs.readFileSync(F.sets, 'utf8')) : {};
  if (!sets[k]) { sets[k] = { system, tools }; fs.writeFileSync(F.sets, JSON.stringify(sets)); }
  return k;
}

const srv = remoteUrl ? { url: remoteUrl, stop: async () => {}, loadSec: 0 } : await startServer({ server: L.server, model: L.model, mmproj: L.mmproj, ctx: 32768, logFile: path.join(L.out, 'llama-server-lab.log') });
console.log(`Teacher loaded in ${srv.loadSec.toFixed(0)} s${L.mmproj ? ' (with pictures)' : ' (no vision file found: picture lessons skipped)'}`);
const stop = async (code = 0) => { await srv.stop(); kit.done(); process.exit(code); };
process.on('SIGINT', () => stop(0));

// ---- stage 1: ideas (what people say) ----
let ideas = readJsonl(F.ideas);
const seen = new Set(ideas.map((i) => i.text.toLowerCase()));
const add = (job, text, extra = {}) => { const t = String(text || '').trim(); if (t.length < 2 || t.length > 600 || seen.has(t.toLowerCase()) || avoid.has(norm(t))) return; seen.add(t.toLowerCase()); const i = { id: `i${ideas.length}`, job, text: t, ...extra }; ideas.push(i); appendJsonl(F.ideas, i); };
if (!ideas.length && !onlyJobs) for (const p of kit.phrasings.filter((p) => !p.pic && !p.recent)) add(p.job, p.text, { from: 'phrasings' });
// --jobs coding:3,science:1 gives weights; a job with weight 0 only runs when named.
const jobW = Object.fromEntries((onlyJobs || []).map((x) => x.split(':')).map(([k, w]) => [k, Number(w) || null]));
// a job named on the command line always gets a share: its ':weight', else its default, else 1 (the weight-0 jobs only run when named)
const JOBS2 = (onlyJobs ? JOBS.filter((j) => j[0] in jobW) : JOBS.filter((j) => j[2] > 0)).map((j) => [j[0], j[1], jobW[j[0]] || j[2] || 1]);
if (onlyJobs && !JOBS2.length) { console.error(`No such job: ${o.jobs}`); process.exit(1); }
const share = JOBS2.reduce((a, j) => a + j[2], 0);
for (const [job, what, w] of JOBS2) {
  const want = Math.ceil((target * 0.92 * w) / share);
  let tries = 0;
  while (ideas.filter((i) => i.job === job).length < want && tries++ < (onlyJobs ? 120 : 40)) {
    await pauseGate(L.out); if (Date.now() > until) await stop(0);
    const style = STYLES[tries % STYLES.length];
    const angle = job === 'coding' ? ` Focus this batch on ${CODE_ANGLES[tries % CODE_ANGLES.length]}. Each message is 2 to 4 sentences and names the language and what they are building, with enough detail (or pasted code) to answer properly.` : job === 'science' ? ` Focus this batch on ${SCI_ANGLES[tries % SCI_ANGLES.length]}.` : job === 'languages' ? ` This batch all in ${['French (Canada)', 'Spanish', 'German', 'Ukrainian', 'Tagalog', 'Punjabi', 'French', 'Portuguese'][tries % 8]}.` : job === 'formats' ? ` Each message must state the exact output shape it wants.`  : job === 'twins' ? ` Write them as pairs, one right after the other: first the message where a tool is needed (with the concrete thing pasted, named or attached), then the plain-knowledge question on the same topic. Vary the topics: files, the web, security, office documents, reminders, code, apps.` : job === 'codefix' ? ` Each message includes the broken code or the exact error output or a failing test, and says what it should do.`: '';
    try {
      const { msg } = await chat(srv.url, { messages: [{ role: 'user', content: `Write 25 different messages a person might type to their desktop AI assistant about: ${what}.${angle} Make them ${style}. Each one different in topic and wording. Make them real and specific, the way a person with an actual task types: concrete file names, numbers, places, times or pasted snippets where they fit, not generic examples. Mix easy and tricky ones, including a few where the right move is less obvious. Use neutral or no names.${toolboxNote}${job === 'clarify' || job === 'default' ? '' : ' Each message gives every detail needed (names, paths, times, amounts), so the assistant can act at once without asking.'} Reply with only a JSON array of strings.` }], max: 2500, temperature: 1.0 });
      const arr = JSON.parse((msg.content || '').match(/\[[\s\S]*\]/)?.[0] || '[]');
      for (const t of arr) add(job, t);
    } catch (e) { console.log(`ideas ${job}: ${e.message.slice(0, 80)}`); }
  }
  console.log(`ideas ${job}: ${ideas.filter((i) => i.job === job).length}`);
}
// Picture questions (vision), one per picture and question, when a folder of pictures is given.
const PICQ = ['What is in this picture?', 'Describe this for someone who can\'t see it.', 'Read any text in this picture.', 'What would you change to make this photo better?', 'Is there anything odd or wrong in this picture?', 'Give this picture a short title.', 'What colours stand out here?', 'Count the main objects in this picture.'];
const picDir = o.images || path.join(path.dirname(L.out), 'images');
const pics = !onlyJobs && L.mmproj && fs.existsSync(picDir) ? fs.readdirSync(picDir).filter((n) => /\.(png|jpe?g|webp)$/i.test(n)) : [];
pics.forEach((p, i) => { add('vision', `${PICQ[i % PICQ.length]}`, { image: p, id2: p }); });
console.log(`ideas total: ${ideas.length} (${pics.length} pictures)`);

// ---- stage 2: lessons (Bob's real turns) ----
const done = new Set(readJsonl(F.lessons).map((l) => l.idea));
// Tool sets (src/tool-sets.js): the teacher sees the tools worded for its own family (same names and inputs, so the
// saved lesson needs no translating). --tool-set off: Bob's own wording (the A/B for tool-score); --tool-set gpt-oss
// picks one by hand; left out, it's found from the teacher's name.
const toolSetArg = String(o['tool-set'] || o.toolSet || '');
const teacherSet = toolSetArg === 'off' ? null : toolSetFor({}, toolSetArg ? '' : `${process.env.LAB_MODEL_NAME || ''} ${path.basename(String(L.model || ''))}`, toolSetArg ? { family: toolSetArg } : {});
console.log(`tool wording: ${teacherSet ? teacherSet.label : "Bob's own"}`);
const toolsFor = (loaded) => { loaded.toolSet = teacherSet; return kit.turn(loaded); };
async function failedResult(name, args) { // the recover/codefix jobs: the first tool call fails, so the student learns to read errors and carry on
  const { msg } = await chat(srv.url, { messages: [{ role: 'user', content: `You are the "${name}" tool inside a desktop AI assistant on a Windows PC. It was called with ${JSON.stringify(args).slice(0, 1500)} and it FAILED this time (a realistic failure for this tool: wrong path, file missing, syntax error with a traceback, permission denied, timeout, bad format). Write only the short, realistic error output the tool would return.` }], think: false, max: 400 }); return (msg.content || 'Error: the tool failed.').trim();
}
async function fakeResult(name, args) {
  const { msg } = await chat(srv.url, { messages: [{ role: 'user', content: `You are the "${name}" tool inside a desktop AI assistant on a Windows PC. It was called with ${JSON.stringify(args).slice(0, 1500)}. Write the short, realistic plain-text result this tool would return (under 120 words). If it made or changed a file, give a plausible file name. If the request could not work, say why briefly. Only the result.` }], max: 300, temperature: 0.7 });
  return (msg.content || 'Done.').trim();
}
// Bob's own answer where it's safe to run, a fixed answer for the cards he shows, and the teacher's made-up result otherwise.
const FIXED = {
  offer_setup: (a) => `Showed the user a card to switch on "${a.what || 'it'}". The job carries on by itself after the click.`,
  pick_session: (a) => `Switched to the ${Object.values(a).find((v) => typeof v === 'string') || 'new'} session.`,
  show_plan: () => 'Showed the plan card. The user said OK: carry on with the plan.',
  ask_together: () => 'The user said OK to all of them.'
};
async function toolResult(name, args, loaded) {
  if (name === 'use_tools') return kit.useTools(args, loaded);
  if (FIXED[name]) return FIXED[name](args);
  if (name === 'bob_help') { try { const r = await kit.brain.tools.bob_help.run(args, {}); if (typeof r === 'string' && r.trim()) return r.slice(0, 4000); } catch {} }
  return fakeResult(name, args);
}
const imgPart = (file) => { const b = fs.readFileSync(path.join(picDir, file)); const ext = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg'); return { type: 'image_url', image_url: { url: `data:image/${ext};base64,${b.toString('base64')}` } }; };

// Mixed order (stable between runs), so stopping early still leaves a mix of every job.
const h = (s) => crypto.createHash('md5').update(s).digest('hex');
const order = [...ideas].sort((x, y) => (h(x.id) < h(y.id) ? -1 : 1));
let n = done.size, i = 0, skipped = 0, rescued = 0;
const queue = order.filter((x) => !done.has(x.id));
async function one(idea, think, room = 1) { // room 2 = a second try with twice the word budget (build 18)
  const loaded = new Set(kit.guessGroups(idea.text));
  const user = idea.image ? { role: 'user', content: [{ type: 'text', text: idea.text }, imgPart(idea.image)] } : { role: 'user', content: idea.text };
  const saved = [{ role: 'user', content: idea.text, ...(idea.image ? { image: idea.image } : {}) }];
  const live = [user];
  let failNext = idea.job === 'recover' || idea.job === 'codefix';
  for (let step = 0; step < 6; step++) {
    const t0 = toolsFor(loaded); const t = dropTools.size ? { ...t0, tools: (t0.tools || []).filter((x) => !dropTools.has(x.function?.name || x.name)), system: String(t0.system || '').split('\n').filter((ln) => ![...dropTools].some((d) => ln.includes(d))).join('\n') } : t0; // dropped tools leave the offer AND the prompt text
    const sys = tag ? `${t.system}\n\n${tag}` : t.system;
    const set = setKey(sys, t.tools);
    // teacher-only additions (persona, act nudge) go to the server but never into the saved prompt or the set key
    const teacherOnly = [persona, ACT_JOBS.has(idea.job) ? ACT_NUDGE : ''].filter(Boolean).join('\n\n');
    const { msg, finish } = await chat(srv.url, { messages: [{ role: 'system', content: teacherOnly ? `${sys}\n\n${teacherOnly}` : sys }, ...live], tools: t.tools, think, max: (think ? 6000 : 3000) * room });
    if (finish === 'length') throw new Error('ran out of room');
    const a = { role: 'assistant', content: msg.content || '', ...(msg.reasoning_content ? { reasoning: msg.reasoning_content } : {}), ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}), set };
    saved.push(a); live.push({ role: 'assistant', content: a.content, ...(a.tool_calls ? { tool_calls: a.tool_calls } : {}) });
    if (!a.tool_calls) break;
    for (const c of a.tool_calls) if (dropTools.has(c.function.name)) throw new Error(`called the dropped tool ${c.function.name}`); // the lesson is skipped, not saved
    for (const c of a.tool_calls) {
      let args = {}; try { args = JSON.parse(c.function.arguments || '{}'); } catch {}
      const result = failNext ? await failedResult(c.function.name, args) : await toolResult(c.function.name, args, loaded); failNext = false;
      const tm = { role: 'tool', tool_call_id: c.id, name: c.function.name, content: result };
      saved.push(tm); live.push(tm);
    }
  }
  const last = saved[saved.length - 1];
  if (last.role !== 'assistant' || !String(last.content || '').trim()) throw new Error('no final answer (ran out of steps)');
  if (review) {
    const v = await grade(idea, saved);
    // 12 Nov (later): a review that couldn't be read is neither kept nor rejected; it waits in needs-review.jsonl for a second look
    if (v.unparsed) { appendJsonl(path.join(dir, 'needs-review.jsonl'), { idea: idea.id, job: idea.job, think, why: v.why, messages: saved }); throw new Error('review unparsed'); }
    if (!v.ok) { appendJsonl(path.join(dir, 'rejected.jsonl'), { idea: idea.id, job: idea.job, think, why: v.why, messages: saved }); throw new Error(`review: ${v.why}`); }
  }
  appendJsonl(F.lessons, { idea: idea.id, job: idea.job, think, messages: saved });
}
// The teacher as a strict reviewer: right tool or rightly none, exact arguments, results read, a final answer that does the job.
const RULES = { restraint: 'This message only wants an answer Bob knows: calling any tool is a FAIL.', precise: 'Every detail from the request (names, paths, dates, amounts) must appear exactly in the tool arguments.', agent: 'Each step must use what the previous result returned; the final answer must sum up what was done.' };
// 12 Nov (later): the reviewer is told Bob's own rules (it failed right behaviour, e.g. saving in Bob's folders) and sees the
// whole lesson (tool results were cut at 1,500 characters, so it judged on half a result). Still strict on the real problems.
const BOB_RULES = 'How Bob works (this is CORRECT, never a reason to fail): he saves files inside the folders he is allowed to use and asks first before writing anywhere else; tools that change things may show an OK card first; the tool results in the lesson are the truth (the reviewer does not doubt them).';
async function grade(idea, saved) {
  const text = saved.map((m) => `${m.role.toUpperCase()}${m.name ? ` (${m.name})` : ''}: ${m.tool_calls ? `[calls ${m.tool_calls.map((c) => `${c.function.name} ${String(c.function.arguments).slice(0, 2000)}`).join('; ')}] ` : ''}${String(m.content || '').slice(0, 6000)}`).join('\n');
  try {
    const { msg } = await chat(srv.url, { messages: [{ role: 'user', content: `You review training lessons for a desktop AI assistant called Bob. Be strict about real problems only. FAIL the lesson if Bob called a tool when a plain answer was enough (plain chat with a tool call always fails), skipped a tool the request clearly needed, called a wrong or an extra tool, put wrong or made-up details in tool arguments, misread what a tool result says, looped, or ended without a final answer that actually does what was asked. Small wording or style issues are NOT a reason to fail. ${BOB_RULES} ${RULES[idea.job] || ''}\n\n${text}\n\nReply with only JSON: {"ok": true or false, "why": "one short reason"}` }], max: 500, temperature: 0 });
    const raw = (msg.content || '').match(/\{[\s\S]*\}/)?.[0];
    let j = null; try { j = raw ? JSON.parse(raw) : null; } catch {}
    if (!j || typeof j.ok !== 'boolean') return { ok: false, unparsed: true, why: 'review unparsed' };
    return { ok: j.ok === true, why: String(j.why || '').slice(0, 200) };
  } catch (e) { return { ok: false, unparsed: true, why: `review failed: ${e.message.slice(0, 60)}` }; } // a reviewer hiccup: kept aside for a second look
}
// --parallel N: N lessons at once (a rented server handles many together; the PC's llama-server is best at 1).
async function worker() {
  while (queue.length && n < target) {
    await pauseGate(L.out); if (Date.now() > until) return;
    const idea = queue.shift(); const think = thinkMode === 'all' ? true : thinkMode === 'none' ? false : (i++ % 2) === 1;
    try { await one(idea, think); n++; if (n % 25 === 0) console.log(`${n}/${target} lessons`); }
    catch (e) {
      // build 18 (8 Nov, the owner asked): a lesson that ran out of room is tried ONCE more instead of being dropped. With thinking on, the
      // second try has thinking off (the thinking is what eats the budget); with it off, the second try gets twice the room.
      if (e.message === 'ran out of room') {
        try { await one(idea, false, think ? 1 : 2); n++; rescued++; if (n % 25 === 0) console.log(`${n}/${target} lessons`); continue; }
        catch (e2) { skipped++; console.log(`skip ${idea.id}: ${e2.message.slice(0, 80)} (twice: with and without room for thinking)`); continue; }
      }
      skipped++; console.log(`skip ${idea.id}: ${e.message.slice(0, 100)}`);
    }
  }
}
await Promise.all(Array.from({ length: parallel }, worker));
console.log(`Done for now: ${n} lessons in ${F.lessons} (${skipped} ideas skipped, ${rescued} saved by a second try)`);
await stop(0);
