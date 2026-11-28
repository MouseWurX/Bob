// The owner, 16 Nov 2026: "make his tool call work perfectly" and "attempt the new effort level changes with your tool
// call changes to make sure they work perfectly together and that he reads and calls tools with no errors and does
// what it intends to do". Every Effort level (Minimus, Medius, Magnus, Maximus, with Effort on one brain) runs whole
// jobs through Bob's real loop and his real tools, on a throwaway folder, with a scripted brain that behaves like a
// tool-calling model: it reads what's there, calls tools with real arguments, and answers from the results.
// Checked at every level: the job finishes with no error, every tool call ran (no unknown tool, no bad arguments),
// the answer holds what the file said, there is exactly one shown answer, an honest "the Hand is off" isn't sent back
// or stacked, and a brain that never stops calling tools still ends. Nothing here reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + String(extra).slice(0, 600) : ''}`); };
const LEVELS = { low: 'Minimus', medium: 'Medius', high: 'Magnus', extreme: 'Maximus' };
const text = (m) => String(m?.content ?? '');

// A brain that acts like a decent tool-calling model, by what Bob's loop asks of it: a plan (Maximus), a review of his
// own work (a helper copy with the job packet), the doing (tools offered), or the answer (no tools, or an answer note).
// mode: 'read' (find and read the notes file, answer from it), 'handoff' (wants a program run with the Run Hand off),
// 'endless' (never stops asking for new pages).
function scripted(mode, notesPath, log) {
  let n = 0;
  return async (o) => {
    const msgs = o.messages || [];
    const tools = new Set((o.tools || []).map((t) => t.function?.name));
    const last = msgs.at(-1);
    const note = last?.role === 'system' ? text(last) : '';
    const said = (content, calls) => { if (content) o.onToken?.(content); log.push({ tools: tools.size, content, calls: (calls || []).map((c) => c.function.name) }); return { role: 'assistant', content, ...(calls ? { tool_calls: calls } : {}) }; };
    const call = (name, args, words = '') => said(words, [{ function: { name, arguments: args } }]);
    const found = msgs.filter((m) => m.role === 'tool' || m.role === 'user').map(text).join('\n').match(/blue heron[^\n"]*/i)?.[0];
    const answer = () => said(mode === 'read' ? (found ? `Your notes say the password hint is "${found}". That's the line in notes.txt.` : 'I could not find your notes.')
      : mode === 'handoff' ? 'I read the notes. To start the server I need to run a program, and the Run Hand is off, so I can\'t start it here. Switch it on in Settings > Hands and ask again.'
      : mode === 'save' ? `Saved the summary to ${path.join(path.dirname(notesPath), 'summary.txt')}.`
      : 'Here is what I read so far.');
    if (/^## Conversation so far/.test(text(msgs[1]))) return said('Looks right.'); // a review of his own work or his plan
    if (/^Max effort, planning|wants a change|^Improve the plan/.test(note)) return said(mode === 'endless' ? '1. Read every page of the site\n2. Sum it up' : '1. Find and read the notes file\n2. Answer from what it says');
    if (!tools.size || /^Max effort, the answer|^Improve it|answer now|whole final answer/i.test(note)) return answer();
    if (mode === 'save') {
      const out = path.join(path.dirname(notesPath), 'summary.txt');
      if (msgs.some((m) => m.role === 'tool' && /^(?:Saved|Wrote|Written)/i.test(text(m)))) return said(`Saved the summary to ${out}.`);
      if (!found) return call('read_file', { path: notesPath }, 'Reading your notes first.');
      return call('write_file', { path: out, content: `Summary of notes.txt\nShopping: milk and eggs. Password hint: ${found}.\n` }, 'Writing the summary now.');
    }
    if (mode === 'endless') { n++; return call('fetch_page', { url: `https://example.com/page-${n}` }, n === 1 ? 'Reading the site page by page.' : ''); }
    const ranTools = msgs.some((m) => m.role === 'tool');
    if (mode === 'handoff') return ranTools ? answer() : call('read_file', { path: notesPath }, 'Checking the project first.');
    if (!ranTools && tools.has('list_folder')) return call('list_folder', { path: path.dirname(notesPath) }, 'Looking for your notes first.');
    if (!found && tools.has('read_file')) return call('read_file', { path: notesPath }, 'Found notes.txt, reading it.');
    return answer();
  };
}

const runJob = async (effort, mode, { extra = {} } = {}) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob effort tools '));
  const inn = path.join(tmp, 'inn'), dataDir = path.join(inn, 'bob'), docs = path.join(inn, 'Documents'); fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(docs, { recursive: true });
  const notes = path.join(docs, 'notes.txt');
  fs.writeFileSync(notes, 'Shopping: milk, eggs\nPassword hint: blue heron by the pond\n');
  const brain = new Brain({ agentDir: tmp, innDir: inn, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [inn], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
    models: { bob: 'qwen3.6-35b-a3b' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', soloEffort: true, ...extra }, () => {});
  clearInterval(brain.reminderTimer);
  brain.ensureModel = async () => {}; brain.fitCtx = async (m, c) => c || 32768; brain.recall = async () => '';
  const said = [], logs = [], ran = [];
  const realLog = brain.log.bind(brain); brain.log = (k, t) => { logs.push(`${k}: ${t}`); try { realLog(k, t); } catch {} };
  const realTool = brain.runTool.bind(brain);
  brain.runTool = async (name, args, ...rest) => { const r = await realTool(name, args, ...rest); ran.push({ name, args, text: String(r?.text ?? r ?? '').slice(0, 300) }); return r; };
  if (mode === 'endless') { brain.runTool = async (name, args) => { ran.push({ name, args, text: 'page' }); return { text: `page ${ran.length}: something new` }; }; }
  brain.engine = { chat: scripted(mode, notes, said), isLoaded: async () => true, loaded: async () => [], unloadAll: async () => [], unload: async () => [] };
  const evs = [];
  const ask = mode === 'save' ? `Read my notes in ${docs} and save a two-line summary as summary.txt in the same folder` : mode === 'read' ? 'What does my notes file in Documents say about the password hint?' : mode === 'handoff' ? `Start the dev server for the app in ${docs}` : 'Read the whole site at example.com and sum it up';
  let error = '';
  try { await brain.run('s1', ask, (e) => evs.push(e), new AbortController().signal, [], { id: 'j1', effort, state: 'running' }); } catch (e) { error = e.stack || e.message; }
  const shown = brain.session('s1').filter((m) => m.role === 'assistant' && !m.tool_calls?.length && !m.step && !m.moot && text(m).trim());
  const tokens = evs.filter((e) => e.type === 'token').map((e) => e.text).join('');
  const summary = fs.existsSync(path.join(docs, 'summary.txt')) ? fs.readFileSync(path.join(docs, 'summary.txt'), 'utf8').replace(/\r\n/g, '\n') : null;
  fs.rmSync(tmp, { recursive: true, force: true });
  return { summary, error, shown, ran, said, logs, evs, tokens, final: evs.find((e) => e.type === 'final')?.text || '' };
};

for (const [effort, name] of Object.entries(LEVELS)) {
  { // a real read: find the file, read it, answer from it
    const r = await runJob(effort, 'read');
    check(`${name}: the job finishes with no error`, !r.error, r.error);
    const reads = r.ran.filter((c) => c.name === 'read_file');
    check(`${name}: he reads the file with real arguments, and the tool reads it`, reads.length >= 1 && reads.every((c) => /blue heron/.test(c.text)), JSON.stringify(r.ran));
    check(`${name}: no tool call failed or was unknown`, !r.ran.some((c) => /^(?:Error|Unknown tool|Not run)/i.test(c.text)) && !r.logs.some((l) => /broke|unknown tool|not offered/i.test(l)), JSON.stringify(r.ran) + r.logs.filter((l) => /broke|unknown|offered/i.test(l)).join(' / '));
    check(`${name}: exactly one shown answer, and it holds what the file says`, r.shown.length === 1 && /blue heron by the pond/.test(text(r.shown[0])), JSON.stringify(r.shown.map(text)));
    check(`${name}: he says what he's doing as he goes, before the answer`, /Looking for your notes|reading it|Find and read the notes file/.test(r.tokens.split('blue heron by the pond')[0] || ''), r.tokens.slice(0, 400));
    if (effort === 'extreme') check(`${name}: his plan is shown in the chat`, /1\. Find and read the notes file/.test(r.tokens), r.tokens.slice(0, 500));
  }
  { // an honest blocker: one answer, no every-tool go, no "nothing did it" go
    const r = await runJob(effort, 'handoff');
    check(`${name}: an honest "the Run Hand is off" ends with no error`, !r.error, r.error);
    check(`${name}: ...one shown answer, not two stacked`, r.shown.length === 1 && /Run Hand is off/.test(text(r.shown[0])), JSON.stringify(r.shown.map(text)));
    check(`${name}: ...and he wasn't sent back for another go with every tool`, !r.logs.some((l) => /added every tool group and asked again/.test(l)), r.logs.filter((l) => /toolbox|handoff/.test(l)).join(' / '));
  }
  { // a save: read, then write the file asked for, and the answer's "saved to" is checked against the disk
    const r = await runJob(effort, 'save');
    check(`${name}: a save finishes with no error`, !r.error, r.error);
    check(`${name}: ...the file is really written, with what the notes say`, /blue heron by the pond/.test(r.summary || ''), JSON.stringify(r.ran.map((c) => [c.name, c.text.slice(0, 80)])));
    check(`${name}: ...one shown answer, with no "no file there" note or second go`, r.shown.length === 1 && /Saved the summary/.test(text(r.shown[0])) && !r.shown[0].correction && !r.logs.some((l) => /one more go|said but not done/.test(l)), JSON.stringify(r.shown.map((m) => [text(m), m.correction])) + r.logs.filter((l) => /handoff|honesty/.test(l)).join(' / '));
  }
  { // a brain that never stops: it still ends, with an answer
    // Nov 23 (#315): no step cap in the app; the time ceiling stops a runaway. stepCap (tests only) keeps this fast.
    const r = await runJob(effort, 'endless', { extra: { stepCap: 30 } });
    check(`${name}: a brain that never stops calling tools still ends, with no error`, !r.error && r.ran.length <= 40, `${r.error} ran ${r.ran.length}`);
    check(`${name}: ...and answers with what he has`, r.shown.length >= 1 && r.shown.every((m) => text(m).trim()), JSON.stringify(r.shown.map(text)));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
