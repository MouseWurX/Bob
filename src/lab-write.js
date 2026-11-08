// Lab 2a: write a new lesson set with a teacher brain on this replicant matrix (the model lab's write-lessons.mjs,
// trimmed for the Lab). Run as its own process by src/lab.js, so the throwaway Bob it builds never touches the owner's
// Bob: his real system prompt and tool list come from a stand-in settings folder (no chats, notes, memory or names).
// Every lesson is one Bob turn: a made-up message, the teacher answering as Bob, tool results played by the teacher
// (nothing is really run). Resumable: lessons already in the file are kept and counted.
//   node src/lab-write.js '<json>'  json = { url, out, skills: [ids], count, think: 'on'|'off'|'half', seed }
// Prints "progress <done> <total>" lines and "done <n>" at the end.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { LESSON_SKILLS } from './lab-skills.js';

const STYLES = ['short and casual', 'polite and detailed', 'with small typos', 'very brief, a few words', 'a bit frustrated', 'curious, asking why', 'in a hurry', 'chatty, with some context first', 'from a beginner', 'from an expert'];

export async function chat(url, { messages, tools, think = false, max = 1500, temperature = 0.7, fetchImpl = fetch }) {
  const body = { messages, max_tokens: max, temperature, chat_template_kwargs: { enable_thinking: Boolean(think) }, ...(tools?.length ? { tools, tool_choice: 'auto' } : {}) };
  const r = await fetchImpl(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(600e3) });
  if (!r.ok) throw new Error(`the teacher answered ${r.status}`);
  const j = await r.json();
  return j.choices?.[0]?.message || {};
}

// A throwaway Bob, as the model lab's bob-kit.mjs makes it: every maker "set up" with stand-in files.
export async function throwawayBob() {
  const { Brain } = await import('./brain.js');
  const { systemPrompt } = await import('./persona.js');
  const tb = await import('./toolbox.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lab-write-'));
  const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), painterDir = path.join(innDir, 'painter');
  for (const d of [dataDir, painterDir]) fs.mkdirSync(d, { recursive: true });
  const f = (n) => { const p = path.join(tmp, n); fs.writeFileSync(p, 'x'); return p; };
  const sdcpp = { exe: f('sd.exe'), image: { diffusionModel: f('z.gguf') }, edit: { diffusionModel: f('qie.gguf'), vae: f('vae.st'), llm: f('vl.gguf') } };
  const hands = Object.fromEntries(['files', 'run', 'schedules', 'apps', 'office', 'security', 'maker', 'mcp'].map((h) => [h, { on: true }]));
  const cfg = {
    agentDir, innDir, dataDir, painterDir, defaultPainterDir: painterDir, settingsFile: path.join(dataDir, 'settings.json'),
    readRoots: [innDir], readOnlyRoots: [], recycleBin: false, models: { bob: 'lab-teacher' }, engine: 'llamacpp', ollamaUrl: 'http://127.0.0.1:1',
    painter: { engine: 'sdcpp', sdcpp }, stt: { provider: 'http' }, hands: { enabled: true, ...hands, folders: [innDir] }, howtos: { on: true }, webSearch: true
  };
  const brain = new Brain(cfg, () => {});
  clearInterval(brain.reminderTimer);
  for (const k of Object.keys(brain)) { const v = brain[k]; if (v && typeof v === 'object' && v.timer) try { clearInterval(v.timer); } catch {} }
  return {
    turn(loaded = new Set()) {
      const sys = brain.withLimits(systemPrompt({ now: brain.now(), memory: '', user: 'the user', backstory: brain.backstory(), about: '', cat: 'Patches' }), loaded);
      return { system: sys, tools: brain.frontDeskTools(loaded) };
    },
    guessGroups: (text) => tb.guessGroups(brain, text),
    useTools: (args, loaded) => brain.tools.use_tools.run(args, { loaded }),
    done: () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  };
}

const readJsonl = (f) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
const h = (s) => crypto.createHash('md5').update(s).digest('hex');

// Writes `count` lessons over `skills` into `out` (lessons.jsonl) with `ideas.jsonl` beside it. kit = throwawayBob().
export async function writeLessons({ url, out, skills, count, think = 'half', kit, chatFn = chat, onProgress = () => {}, shouldStop = () => false }) {
  const picked = LESSON_SKILLS.filter((s) => skills.includes(s.id));
  if (!picked.length) throw new Error('Pick at least one skill.');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ideasFile = path.join(path.dirname(out), 'ideas.jsonl');
  const ideas = readJsonl(ideasFile);
  const seen = new Set(ideas.map((i) => i.text.toLowerCase()));
  const add = (skill, text) => { const t = String(text || '').trim(); if (t.length < 2 || t.length > 800 || seen.has(t.toLowerCase())) return; seen.add(t.toLowerCase()); const i = { id: `i${ideas.length}`, skill, text: t }; ideas.push(i); fs.appendFileSync(ideasFile, JSON.stringify(i) + '\n'); };
  // Stage 1: what people say, in batches of 25 per skill, until each skill has its share.
  for (const s of picked) {
    const want = Math.ceil(count / picked.length);
    let tries = 0;
    while (ideas.filter((i) => i.skill === s.id).length < want && tries++ < Math.ceil(want / 10) + 5) {
      if (shouldStop()) throw new Error('Stopped.');
      const style = STYLES[tries % STYLES.length];
      try {
        const msg = await chatFn(url, { messages: [{ role: 'user', content: `Write 25 different messages a person might type to their desktop AI assistant about: ${s.what} Make them ${style}. Each one different in topic and wording. Use neutral or no names. Reply with only a JSON array of strings.` }], max: 2500, temperature: 1.0 });
        const arr = JSON.parse((msg.content || '').match(/\[[\s\S]*\]/)?.[0] || '[]');
        for (const t of arr) add(s.id, t);
      } catch {}
    }
  }
  // Stage 2: the lessons, in a mixed order that stays the same between runs.
  const done = new Set(readJsonl(out).map((l) => l.idea));
  const queue = [...ideas].filter((i) => picked.some((s) => s.id === i.skill)).sort((x, y) => (h(x.id) < h(y.id) ? -1 : 1));
  let n = done.size;
  onProgress(n, count);
  for (const idea of queue) {
    if (n >= count) break;
    if (done.has(idea.id)) continue;
    if (shouldStop()) throw new Error('Stopped.');
    const skill = picked.find((s) => s.id === idea.skill);
    const thinkOn = think === 'on' || (think === 'half' && parseInt(h(idea.id).slice(0, 2), 16) % 2 === 0) || skill.think === true;
    try {
      const lesson = await oneLesson({ url, idea, skill, think: thinkOn, kit, chatFn });
      if (!lesson) continue;
      fs.appendFileSync(out, JSON.stringify(lesson) + '\n');
      n++; onProgress(n, count);
    } catch {}
  }
  return n;
}

async function oneLesson({ url, idea, skill, think, kit, chatFn }) {
  const loaded = new Set(kit.guessGroups(idea.text));
  const saved = [{ role: 'user', content: idea.text }];
  let failNext = skill.failFirst === true;
  for (let round = 0; round < 5; round++) {
    const t = kit.turn(loaded);
    const tools = skill.noTools ? [] : t.tools;
    const msg = await chatFn(url, { messages: [{ role: 'system', content: t.system + (skill.extra ? `\n\n${skill.extra}` : '') }, ...saved], tools, think, max: think ? 6000 : 2000, temperature: 0.7 });
    const calls = (msg.tool_calls || []).filter((c) => c?.function?.name);
    const content = String(msg.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const thought = String(msg.reasoning_content || '').trim();
    if (!calls.length) {
      if (!content) return null;
      saved.push({ role: 'assistant', content, ...(thought ? { reasoning_content: thought } : {}) });
      return { idea: idea.id, skill: skill.id, job: skill.id, think, messages: saved };
    }
    saved.push({ role: 'assistant', content, ...(thought ? { reasoning_content: thought } : {}), tool_calls: calls.map((c, i) => ({ id: c.id || `call_${round}_${i}`, type: 'function', function: { name: c.function.name, arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments || {}) } })) });
    for (const [i, c] of calls.entries()) {
      let args = {}; try { args = typeof c.function.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : c.function.arguments || {}; } catch {}
      let result;
      if (c.function.name === 'use_tools') { try { result = await kit.useTools(args, loaded); } catch (e) { result = `Error: ${e.message}`; } }
      else {
        const fail = failNext; failNext = false;
        const ask = fail
          ? `You are the "${c.function.name}" tool inside a desktop AI assistant on a Windows PC. It was called with ${JSON.stringify(args).slice(0, 1500)} and it FAILED this time (a realistic failure: wrong path, file missing, syntax error with a traceback, permission denied, timeout). Write only the short error output.`
          : `You are the "${c.function.name}" tool inside a desktop AI assistant on a Windows PC. It was called with ${JSON.stringify(args).slice(0, 1500)}. Write the short, realistic plain-text result this tool would return (under 120 words). If it made or changed a file, give a plausible file name. Only the result.`;
        const m = await chatFn(url, { messages: [{ role: 'user', content: ask }], max: 400, temperature: 0.7 });
        result = String(m.content || 'Done.').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      }
      saved.push({ role: 'tool', tool_call_id: saved.at(-1).tool_calls[i].id, name: c.function.name, content: String(typeof result === 'string' ? result : JSON.stringify(result)).slice(0, 4000) });
    }
  }
  return null;
}

// As its own process (src/lab.js starts it this way).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const job = JSON.parse(process.argv[2] || '{}');
  let stop = false;
  process.on('SIGTERM', () => { stop = true; });
  const kit = await throwawayBob();
  try {
    const n = await writeLessons({ ...job, kit, onProgress: (d, t) => console.log(`progress ${d} ${t}`), shouldStop: () => stop });
    console.log(`done ${n}`);
    kit.done();
    process.exit(0);
  } catch (e) { console.error(e.message); kit.done(); process.exit(1); }
}
