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

const o = opts({ count: 4000, hours: 0 });
const L = locate(o);
if (!L.model) { console.error('Qwen3.6 GGUF not found. Pass --model.'); process.exit(1); }
// --url <server>: use a rented teacher (vLLM) instead of starting llama-server here. Set LAB_API_KEY and LAB_MODEL_NAME.
const remoteUrl = o.url ? String(o.url).replace(/\/$/, '') : null;
if (remoteUrl) process.env.LAB_REMOTE = '1'; else checkFree(o);
const parallel = Math.max(1, Number(o.parallel) || 1);
const kit = await loadBob(L.bob);
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
const add = (job, text, extra = {}) => { const t = String(text || '').trim(); if (t.length < 2 || t.length > 600 || seen.has(t.toLowerCase())) return; seen.add(t.toLowerCase()); const i = { id: `i${ideas.length}`, job, text: t, ...extra }; ideas.push(i); appendJsonl(F.ideas, i); };
if (!ideas.length && !onlyJobs) for (const p of kit.phrasings.filter((p) => !p.pic && !p.recent)) add(p.job, p.text, { from: 'phrasings' });
// --jobs coding:3,science:1 gives weights; a job with weight 0 only runs when named.
const jobW = Object.fromEntries((onlyJobs || []).map((x) => x.split(':')).map(([k, w]) => [k, Number(w) || null]));
const JOBS2 = (onlyJobs ? JOBS.filter((j) => j[0] in jobW) : JOBS.filter((j) => j[2] > 0)).map((j) => [j[0], j[1], jobW[j[0]] || j[2]]);
if (onlyJobs && !JOBS2.length) { console.error(`No such job: ${o.jobs}`); process.exit(1); }
const share = JOBS2.reduce((a, j) => a + j[2], 0);
for (const [job, what, w] of JOBS2) {
  const want = Math.ceil((target * 0.92 * w) / share);
  let tries = 0;
  while (ideas.filter((i) => i.job === job).length < want && tries++ < (onlyJobs ? 120 : 40)) {
    await pauseGate(L.out); if (Date.now() > until) await stop(0);
    const style = STYLES[tries % STYLES.length];
    const angle = job === 'coding' ? ` Focus this batch on ${CODE_ANGLES[tries % CODE_ANGLES.length]}.` : job === 'science' ? ` Focus this batch on ${SCI_ANGLES[tries % SCI_ANGLES.length]}.` : '';
    try {
      const { msg } = await chat(srv.url, { messages: [{ role: 'user', content: `Write 25 different messages a person might type to their desktop AI assistant about: ${what}.${angle} Make them ${style}. Each one different in topic and wording. Use neutral or no names. Reply with only a JSON array of strings.` }], max: 2500, temperature: 1.0 });
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
const toolsFor = (loaded) => kit.turn(loaded);
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
let n = done.size, i = 0;
const queue = order.filter((x) => !done.has(x.id));
async function one(idea, think) {
  const loaded = new Set(kit.guessGroups(idea.text));
  const user = idea.image ? { role: 'user', content: [{ type: 'text', text: idea.text }, imgPart(idea.image)] } : { role: 'user', content: idea.text };
  const saved = [{ role: 'user', content: idea.text, ...(idea.image ? { image: idea.image } : {}) }];
  const live = [user];
  for (let step = 0; step < 5; step++) {
    const t = toolsFor(loaded);
    const set = setKey(t.system, t.tools);
    const { msg, finish } = await chat(srv.url, { messages: [{ role: 'system', content: t.system }, ...live], tools: t.tools, think, max: think ? 6000 : 2000 });
    if (finish === 'length') throw new Error('ran out of room');
    const a = { role: 'assistant', content: msg.content || '', ...(msg.reasoning_content ? { reasoning: msg.reasoning_content } : {}), ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}), set };
    saved.push(a); live.push({ role: 'assistant', content: a.content, ...(a.tool_calls ? { tool_calls: a.tool_calls } : {}) });
    if (!a.tool_calls) break;
    for (const c of a.tool_calls) {
      let args = {}; try { args = JSON.parse(c.function.arguments || '{}'); } catch {}
      const result = await toolResult(c.function.name, args, loaded);
      const tm = { role: 'tool', tool_call_id: c.id, name: c.function.name, content: result };
      saved.push(tm); live.push(tm);
    }
  }
  appendJsonl(F.lessons, { idea: idea.id, job: idea.job, think, messages: saved });
}
// --parallel N: N lessons at once (a rented server handles many together; the PC's llama-server is best at 1).
async function worker() {
  while (queue.length && n < target) {
    await pauseGate(L.out); if (Date.now() > until) return;
    const idea = queue.shift(); const think = thinkMode === 'all' ? true : thinkMode === 'none' ? false : (i++ % 2) === 1;
    try { await one(idea, think); n++; if (n % 25 === 0) console.log(`${n}/${target} lessons`); }
    catch (e) { console.log(`skip ${idea.id}: ${e.message.slice(0, 100)}`); }
  }
}
await Promise.all(Array.from({ length: parallel }, worker));
console.log(`Done for now: ${n} lessons in ${F.lessons}`);
await stop(0);
