// Routines (the Routines Hand, off by default): the node kinds, their pins and fields, and the checks on a routine.
// Shared by Bob's side (src/routines.js runs them) and the editor window (public/routines.js draws them), so it has
// no imports. A routine is a graph you wire up yourself, like Unreal's Blueprints:
//   - white "exec" wires say what runs next (from a node's exec out pin to another node's exec in pin);
//   - coloured data wires carry a value into a field. In the saved file a data wire is just the field's text
//     {{nodeId.pin}}, so a field can also mix words and values: "New file: {{n2.name}}".
//
// The file (inn\bob\routines\<id>.json):
//   { bobRoutine: 1, id, name, what, nodes: [{ id, kind, x, y, f: { field: value } }], wires: [{ from, out, to }] }
// Approval and the on switch are kept beside it (src/routines.js), never inside the graph, so a shared or imported
// routine always comes in switched off and needs your OK.

export const ROUTINE_FORMAT = 1;
export const MAX_NODES = 120;
export const MAX_WIRES = 400;
export const MAX_FIELD = 4000;
export const MAX_LOOP = 500; // For each: at most this many items
export const MAX_STEPS = 3000; // steps in one run, counting loops (a safety net, not a limit you should meet)
export const MAX_WAIT_S = 3600;

// Pin types and their wire colours (the same idea as Blueprints: a pin only takes its own colour).
export const PIN_TYPES = {
  exec: { label: 'Then', colour: '#f2f2f2' },
  text: { label: 'Text', colour: '#e06c9f' },
  number: { label: 'Number', colour: '#7ccf6b' },
  yesno: { label: 'Yes or no', colour: '#d94040' },
  list: { label: 'List', colour: '#4fb3d9' },
  file: { label: 'File path', colour: '#e0b84f' }
};
// Which data types a field of one type accepts. Text takes anything (it's written out as words).
export const ACCEPTS = {
  text: ['text', 'number', 'yesno', 'file', 'list'],
  number: ['number', 'text'],
  yesno: ['yesno'],
  list: ['list'],
  file: ['file', 'text']
};

// Node groups and their header colours.
export const GROUPS = {
  trigger: { label: 'Starts when', colour: '#a23b3b' },
  tool: { label: 'Bob\'s tools', colour: '#2f5f9e' },
  logic: { label: 'Logic', colour: '#3f7f3f' },
  brain: { label: 'Brain', colour: '#6b3fa0' },
  output: { label: 'Results', colour: '#b8661f' }
};

// The tools a routine may use, with the fields their node shows. Only tools whose job fits a routine: no tool that
// waits on a person, hires or rents, or always asks (those can't run while you're away). risk: look | change.
// again: safe to try a second time if it fails. mail: reads e-mail (the mail lock applies to the whole routine).
export const ROUTINE_TOOLS = {
  read_file: { label: 'Read a file', risk: 'look', again: true, fields: { path: 'file' }, out: { text: 'text' } },
  list_folder: { label: 'List a folder', risk: 'look', again: true, fields: { path: 'file' }, out: { text: 'text', list: 'list' } },
  search_files: { label: 'Search files', risk: 'look', again: true, fields: { query: 'text', folder: 'file' }, out: { text: 'text' } },
  fetch_page: { label: 'Read a web page', risk: 'look', again: true, fields: { url: 'text' }, out: { text: 'text' } },
  web_search: { label: 'Search the web', risk: 'look', again: true, fields: { query: 'text' }, out: { text: 'text' } },
  calculate: { label: 'Calculate', risk: 'look', again: true, fields: { expression: 'text' }, out: { text: 'text' } },
  read_email: { label: 'Read e-mail', risk: 'look', again: true, mail: true, fields: { action: 'text', id: 'text', days: 'number', from: 'text' }, out: { text: 'text' } },
  read_calendar: { label: 'Read the calendar', risk: 'look', again: true, fields: { days: 'number' }, out: { text: 'text' } },
  query_data: { label: 'Query a data file (SQL)', risk: 'look', again: true, fields: { path: 'file', sql: 'text' }, out: { text: 'text' } },
  compare_files: { label: 'Compare two files', risk: 'look', again: true, fields: { a: 'file', b: 'file' }, out: { text: 'text' } },
  office_read: { label: 'Read an office file', risk: 'look', again: true, fields: { path: 'file' }, out: { text: 'text' } },
  write_file: { label: 'Write a file', risk: 'change', fields: { path: 'file', content: 'text' }, out: { text: 'text' } },
  file_hands: { label: 'Move, copy or tidy files', risk: 'change', fields: { action: 'text', from: 'file', to: 'file', folder: 'file' }, out: { text: 'text' } },
  convert_file: { label: 'Convert a file', risk: 'change', fields: { path: 'file', to: 'text' }, out: { text: 'text' } },
  make_chart: { label: 'Make a chart', risk: 'change', again: true, fields: { path: 'file', kind: 'text', title: 'text' }, out: { text: 'text' } },
  notice_board: { label: 'Notice board', risk: 'change', fields: { action: 'text', content: 'text' }, out: { text: 'text' } },
  reminders: { label: 'Reminders', risk: 'change', fields: { action: 'text', text: 'text', time: 'text' }, out: { text: 'text' } },
  run_recipe: { label: 'Run a saved recipe', risk: 'change', fields: { name: 'text' }, out: { text: 'text' } }
};
// What a tool node gives besides its own outputs: did it work.
const TOOL_OUT = { ok: 'yesno' };

// The node kinds. fields: name -> type (a data wire of an accepted type may plug into it). out: data pins.
// exec: the exec out pins ('then' unless said). input: false for triggers (nothing runs into them).
export const NODES = {
  // ---- Starts when (one per routine) ----
  'trigger.manual': { group: 'trigger', label: 'Run now', what: 'Starts when you press Run now (in the editor, in Settings or by asking Bob).', input: false, fields: {}, out: { at: 'text' } },
  'trigger.time': { group: 'trigger', label: 'At a time', what: 'Starts once, every day, on some days of the week, or every so many minutes (at least 5).', input: false,
    fields: { type: 'text', at: 'text', date: 'text', days: 'text', everyMinutes: 'number' }, out: { at: 'text' }, literal: ['type', 'at', 'date', 'days', 'everyMinutes'] },
  'trigger.file': { group: 'trigger', label: 'New file in a folder', what: 'Starts for each new file that turns up in a folder (checked every minute). Files already there when you switch it on don\'t count.', input: false,
    fields: { folder: 'file', pattern: 'text' }, out: { path: 'file', name: 'text' }, literal: ['folder', 'pattern'] },
  'trigger.mail': { group: 'trigger', label: 'New e-mail', what: 'Starts for each new e-mail in the account set in Settings (checked every 5 minutes), optionally only from someone or with words in the subject. The mail lock applies.', input: false,
    fields: { from: 'text', subject: 'text' }, out: { from: 'text', subject: 'text', text: 'text', id: 'text' }, literal: ['from', 'subject'], mail: true },
  'trigger.page': { group: 'trigger', label: 'A web page changes', what: 'Starts when the part of a page you care about changes (the words next to it, like "Price"), checked every few hours.', input: false,
    fields: { url: 'text', find: 'text', hours: 'number' }, out: { before: 'text', now: 'text', url: 'text' }, literal: ['url', 'find', 'hours'] },
  // ---- Logic ----
  if: { group: 'logic', label: 'If', what: 'Goes one way or the other. Tests: contains, equals, is empty, is not empty, is yes, more than, less than.',
    fields: { value: 'text', test: 'text', with: 'text' }, out: {}, exec: ['yes', 'no'], literal: ['test'] },
  forEach: { group: 'logic', label: 'For each', what: 'Runs the "each" pins once for every item in a list (or every line of some text), then "done".',
    fields: { list: 'list' }, out: { item: 'text', index: 'number' }, exec: ['each', 'done'] },
  text: { group: 'logic', label: 'Make text', what: 'Puts words and values together, like "New file: {{n2.name}}".', fields: { text: 'text' }, out: { text: 'text' } },
  lines: { group: 'logic', label: 'Split into lines', what: 'Turns text into a list, one item per non-empty line.', fields: { text: 'text' }, out: { list: 'list', count: 'number' } },
  wait: { group: 'logic', label: 'Wait', what: 'Waits a number of seconds (up to an hour) before going on.', fields: { seconds: 'number' }, out: {} },
  stop: { group: 'logic', label: 'Stop', what: 'Ends the run here. Mark it as a failure to get a tap on the shoulder.', fields: { failed: 'yesno', why: 'text' }, out: {}, exec: [], literal: ['failed'] },
  // ---- Bob's tools (one node kind; the tool is a field) ----
  tool: { group: 'tool', label: 'Use a tool', what: 'Uses one of Bob\'s tools with the inputs you set. The Hand it belongs to must be on.',
    fields: {}, out: { result: 'text', ...TOOL_OUT }, exec: ['then', 'failed'], literal: ['tool'] },
  // ---- Brain ----
  brain: { group: 'brain', label: 'Ask the brain', what: 'Asks Bob\'s small brain one question about some text and gives back its answer. It can only answer: it never uses tools or changes the routine. Answer as yes or no for If.',
    fields: { question: 'text', input: 'text', answer: 'text' }, out: { answer: 'text', yes: 'yesno' }, exec: ['then', 'failed'], literal: ['answer'] },
  // ---- Results ----
  'out.file': { group: 'output', label: 'Save to a file', what: 'Saves text as a file in this routine\'s own folder (Documents\\Bob\\Routines\\<name>). Add to the file instead of replacing it if you like.',
    fields: { name: 'text', text: 'text', add: 'yesno' }, out: { path: 'file' }, literal: ['add'] },
  'out.made': { group: 'output', label: 'Add to Made by Bob', what: 'Puts a file in the Made by Bob panel, so you can open it from Bob\'s window.', fields: { path: 'file' }, out: {} },
  'out.notice': { group: 'output', label: 'Put on the notice board', what: 'Adds a line (or several) to your notice board.', fields: { text: 'text' }, out: {} },
  'out.tap': { group: 'output', label: 'Tap me on the shoulder', what: 'Pops up a note on this replicant matrix, and on your phone too if "Show reminders on my phone" is on.', fields: { text: 'text' }, out: {} },
  'out.chat': { group: 'output', label: 'Post in the Routines chat', what: 'Writes a message in the Routines chat, so you can read it later or ask Bob about it.', fields: { text: 'text' }, out: {} }
};

export const isTrigger = (kind) => NODES[kind]?.group === 'trigger';
export const execOuts = (node) => (NODES[node.kind]?.exec ?? ['then']);
// A node's fields with their types (a tool node's come from its tool).
export function fieldsOf(node) {
  if (node.kind === 'tool') return { tool: 'text', ...(ROUTINE_TOOLS[node.f?.tool]?.fields || {}) };
  return NODES[node.kind]?.fields || {};
}
// A node's data out pins with their types.
export function outsOf(node) {
  if (node.kind === 'tool') return { ...(ROUTINE_TOOLS[node.f?.tool]?.out || { text: 'text' }), result: 'text', ...TOOL_OUT };
  return NODES[node.kind]?.out || {};
}

// {{n3.text}} references in a field's text.
export const REF = /\{\{\s*([A-Za-z0-9_-]{1,40})\.([A-Za-z0-9_]{1,40})\s*\}\}/g;
export function refsIn(v) {
  const out = [];
  for (const m of String(v ?? '').matchAll(REF)) out.push({ node: m[1], pin: m[2], whole: m[0] });
  return out;
}
// Is the field exactly one reference (a plain data wire), not words around it?
export const onlyRef = (v) => { const r = refsIn(v); return r.length === 1 && String(v).trim() === r[0].whole ? r[0] : null; };

// A stable fingerprint of what a routine does (its nodes, fields and wires, not where the boxes sit). Approval is
// tied to it: change a step, a field or a wire and the routine needs your OK again. Plain FNV-1a, no imports.
export function graphHash(r) {
  const nodes = [...(r.nodes || [])].map((n) => ({ id: n.id, kind: n.kind, f: sortObj(n.f || {}) })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const wires = [...(r.wires || [])].map((w) => `${w.from}.${w.out}>${w.to}`).sort();
  const s = JSON.stringify({ nodes, wires });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0') + s.length.toString(16);
}
function sortObj(o) { const out = {}; for (const k of Object.keys(o).sort()) out[k] = o[k]; return out; }

// Tidy a routine from the editor, a file or an import: only known keys, sizes capped. Throws on a broken shape.
export function cleanRoutine(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('That isn\'t a routine.');
  const id = String(raw.id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new Error('A routine needs an id of letters, numbers, - or _.');
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).slice(0, MAX_NODES + 1).map((n) => {
    const nid = String(n?.id || '').trim();
    const f = {};
    for (const [k, v] of Object.entries(n?.f && typeof n.f === 'object' ? n.f : {})) {
      if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) continue;
      f[k] = typeof v === 'number' || typeof v === 'boolean' ? v : String(v ?? '').slice(0, MAX_FIELD);
    }
    return { id: nid, kind: String(n?.kind || ''), x: Math.round(Number(n?.x) || 0), y: Math.round(Number(n?.y) || 0), f, ...(n?.note ? { note: String(n.note).slice(0, 300) } : {}) };
  });
  const wires = (Array.isArray(raw.wires) ? raw.wires : []).slice(0, MAX_WIRES + 1).map((w) => ({ from: String(w?.from || ''), out: String(w?.out || 'then'), to: String(w?.to || '') }));
  return { bobRoutine: ROUTINE_FORMAT, id, name: String(raw.name || 'New routine').trim().slice(0, 80) || 'New routine', what: String(raw.what || '').slice(0, 600), nodes, wires, ...(raw.from ? { from: String(raw.from).slice(0, 200) } : {}) };
}

// Every problem with a routine, each tied to a node where it has one: [{ node, text }]. A routine with any problem
// can't be switched on (the editor shows them as red marks). tools: the tool names that exist on this replicant
// matrix (optional: without it, tool names are only checked against ROUTINE_TOOLS).
export function checkRoutine(r, { tools = null, afterMail = null } = {}) {
  const out = [];
  const say = (node, text) => out.push({ node: node || '', text });
  const nodes = r.nodes || [];
  const byId = new Map();
  if (!nodes.length) say('', 'Add a "Starts when" node and at least one step.');
  if (nodes.length > MAX_NODES) say('', `Up to ${MAX_NODES} nodes in one routine.`);
  if ((r.wires || []).length > MAX_WIRES) say('', `Up to ${MAX_WIRES} wires in one routine.`);
  for (const n of nodes) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(n.id)) { say('', 'A node has a broken id.'); continue; }
    if (byId.has(n.id)) say(n.id, 'Two nodes share this id.');
    byId.set(n.id, n);
    if (!NODES[n.kind]) say(n.id, `"${n.kind}" isn't a node Bob knows.`);
  }
  const triggers = nodes.filter((n) => isTrigger(n.kind));
  if (nodes.length && triggers.length !== 1) say(triggers[1]?.id || '', triggers.length ? 'Only one "Starts when" node per routine.' : 'Add one "Starts when" node: it says when the routine runs.');
  // Exec wires: from a real exec pin to a node that takes them; one wire out of each pin.
  const fromPin = new Set();
  const into = new Map();
  for (const w of r.wires || []) {
    const a = byId.get(w.from), b = byId.get(w.to);
    if (!a || !b) { say(a?.id || b?.id || '', 'A wire is joined to a node that isn\'t there.'); continue; }
    if (!execOuts(a).includes(w.out)) say(a.id, `This node has no "${w.out}" pin.`);
    if (NODES[b.kind]?.input === false) say(b.id, 'Nothing can run into a "Starts when" node.');
    if (w.from === w.to) say(a.id, 'A node can\'t be wired to itself.');
    const k = `${w.from}.${w.out}`;
    if (fromPin.has(k)) say(a.id, `The "${w.out}" pin can only go to one place. Use more nodes after it instead.`);
    fromPin.add(k);
    into.set(w.to, (into.get(w.to) || 0) + 1);
  }
  // Reachable from the trigger (a node nothing runs into would never run).
  const reach = new Set();
  if (triggers[0]) {
    const stack = [triggers[0].id];
    while (stack.length) { const id = stack.pop(); if (reach.has(id)) continue; reach.add(id); for (const w of r.wires || []) if (w.from === id) stack.push(w.to); }
  }
  for (const n of nodes) if (!isTrigger(n.kind) && byId.get(n.id) === n && NODES[n.kind] && !reach.has(n.id)) say(n.id, 'Nothing runs into this node, so it would never run. Wire a white "then" pin into it.');
  // Loops: an exec wire back to an earlier node would run forever. Only For each repeats.
  if (triggers[0]) {
    const state = new Map();
    const visit = (id) => {
      state.set(id, 1);
      for (const w of r.wires || []) if (w.from === id) {
        if (state.get(w.to) === 1) { say(w.to, 'These wires go round in a circle, which would run forever. Use For each to repeat.'); continue; }
        if (!state.has(w.to)) visit(w.to);
      }
      state.set(id, 2);
    };
    visit(triggers[0].id);
  }
  // Fields.
  const usesMail = nodes.some((n) => NODES[n.kind]?.mail || (n.kind === 'tool' && ROUTINE_TOOLS[n.f?.tool]?.mail));
  for (const n of nodes) {
    const def = NODES[n.kind];
    if (!def) continue;
    const f = n.f || {};
    if (n.kind === 'tool') {
      const t = ROUTINE_TOOLS[f.tool];
      if (!f.tool) say(n.id, 'Pick which tool this node uses.');
      else if (!t) say(n.id, `"${f.tool}" can't be used in a routine.`);
      else if (tools && !tools.includes(f.tool)) say(n.id, `The tool "${t.label}" isn't on this replicant matrix right now.`);
      if (usesMail && t && afterMail && !afterMail.includes(f.tool)) say(n.id, `This routine reads e-mail, and an e-mail can hide orders, so "${t.label}" is off in it (the mail lock).`);
    }
    for (const [k, type] of Object.entries(fieldsOf(n))) {
      for (const ref of refsIn(f[k])) {
        const src = byId.get(ref.node);
        if (!src) { say(n.id, `The "${k}" field is wired to a node that isn't there (${ref.node}).`); continue; }
        const pinType = outsOf(src)[ref.pin];
        if (!pinType) { say(n.id, `The "${k}" field is wired to a pin "${ref.pin}" that ${src.id} doesn't have.`); continue; }
        if (!(ACCEPTS[type] || ACCEPTS.text).includes(pinType)) say(n.id, `The "${k}" field takes ${PIN_TYPES[type].label.toLowerCase()}, not ${PIN_TYPES[pinType].label.toLowerCase()}.`);
        if (!runsBefore(r, src.id, n.id)) say(n.id, `The "${k}" field uses ${src.id}, which doesn't always run before this node.`);
        if (ref.pin === 'item' || ref.pin === 'index') { if (src.kind === 'forEach' && !insideEach(r, src.id, n.id)) say(n.id, `"${ref.pin}" from ${src.id} only exists inside its "each" steps.`); }
      }
      if (type === 'list' && f[k] && !onlyRef(f[k])) say(n.id, `The "${k}" field needs a list wired into it.`);
    }
    if (n.kind === 'trigger.time') {
      const t = String(f.type || '');
      if (!['once', 'daily', 'weekly', 'interval'].includes(t)) say(n.id, 'Pick how often: once, daily, weekly or interval.');
      else if (t === 'interval' && !(Number(f.everyMinutes) >= 5)) say(n.id, 'Every so many minutes needs at least 5.');
      else if (t !== 'interval' && !/^\d{1,2}:\d{2}$/.test(String(f.at || ''))) say(n.id, 'Set the time, like 09:00.');
      if (t === 'once' && !/^\d{4}-\d{2}-\d{2}$/.test(String(f.date || ''))) say(n.id, 'Set the date, like 2026-12-01.');
      if (t === 'weekly' && !String(f.days || '').trim()) say(n.id, 'Pick the days, like mon, thu.');
    }
    if (n.kind === 'trigger.file' && !/^([a-zA-Z]:[\\/]|\/)/.test(String(f.folder || ''))) say(n.id, 'Give the whole path of the folder to watch.');
    if (n.kind === 'trigger.page' && !/^https?:\/\//i.test(String(f.url || ''))) say(n.id, 'Give the page\'s address, starting with https://.');
    if (n.kind === 'if' && !['contains', 'equals', 'empty', 'notEmpty', 'yes', 'more', 'less'].includes(String(f.test || ''))) say(n.id, 'Pick a test.');
    if (n.kind === 'wait' && !onlyRef(f.seconds) && !(Number(f.seconds) >= 0 && Number(f.seconds) <= MAX_WAIT_S)) say(n.id, `Wait between 0 and ${MAX_WAIT_S} seconds.`);
    if (n.kind === 'brain' && !String(f.question || '').trim()) say(n.id, 'Write the question for the brain.');
    if (n.kind === 'out.file' && !String(f.name || '').trim()) say(n.id, 'Give the file a name, like report.md.');
    if (n.kind === 'out.file' && /[\\/:*?"<>|]|^\.+$/.test(String(f.name || '').replace(REF, 'x'))) say(n.id, 'The file name can\'t have \\ / : * ? " < > | in it (it always goes in the routine\'s own folder).');
  }
  return out;
}

// Does `a` always run before `b`? True when every exec path from the trigger to b passes through a (a dominates b).
export function runsBefore(r, a, b) {
  const trig = (r.nodes || []).find((n) => isTrigger(n.kind));
  if (!trig) return false;
  if (a === trig.id) return true;
  // b reachable from the trigger without passing a? Then a doesn't always run first.
  const seen = new Set([a]);
  const stack = [trig.id];
  while (stack.length) {
    const id = stack.pop();
    if (id === b) return false;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const w of r.wires || []) if (w.from === id) stack.push(w.to);
  }
  return true;
}
// Is b among the steps run by a For each's "each" pin?
export function insideEach(r, each, b) {
  const start = (r.wires || []).find((w) => w.from === each && w.out === 'each')?.to;
  if (!start) return false;
  const seen = new Set();
  const stack = [start];
  while (stack.length) { const id = stack.pop(); if (id === b) return true; if (seen.has(id) || id === each) continue; seen.add(id); for (const w of r.wires || []) if (w.from === id) stack.push(w.to); }
  return false;
}

// What switching on lets the routine do, in plain lines for the OK card: every step that changes something, with its
// target, saying plainly where a target comes from data (a file name from a new e-mail, say).
export function approvalLines(r) {
  const lines = [];
  const trig = (r.nodes || []).find((n) => isTrigger(n.kind));
  if (trig) lines.push({ kind: 'start', text: `Starts: ${triggerWords(trig)}` });
  for (const n of r.nodes || []) {
    const f = n.f || {};
    if (n.kind === 'tool') {
      const t = ROUTINE_TOOLS[f.tool];
      if (!t) continue;
      const inputs = Object.keys(t.fields).filter((k) => f[k] !== undefined && f[k] !== '').map((k) => `${k}: ${fieldWords(f[k])}`).join(', ');
      lines.push({ kind: t.risk === 'look' ? 'look' : 'change', node: n.id, text: `${t.risk === 'look' ? 'Looks' : 'Changes'}: ${t.label}${inputs ? ` (${inputs})` : ''}`, data: Object.keys(t.fields).some((k) => refsIn(f[k]).length) });
    } else if (n.kind === 'brain') lines.push({ kind: 'brain', node: n.id, text: `Asks the brain: "${String(f.question || '').slice(0, 120)}" (it only answers; it can't add steps)` });
    else if (n.kind === 'out.file') lines.push({ kind: 'change', node: n.id, text: `Saves ${fieldWords(f.name)} in the routine's own folder${f.add === true ? ' (adding to it)' : ''}`, data: refsIn(f.name).length > 0 });
    else if (n.kind === 'out.notice') lines.push({ kind: 'change', node: n.id, text: 'Adds to your notice board' });
    else if (n.kind === 'out.made') lines.push({ kind: 'change', node: n.id, text: `Adds ${fieldWords(f.path)} to Made by Bob` });
    else if (n.kind === 'out.tap') lines.push({ kind: 'tell', node: n.id, text: 'Taps you on the shoulder' });
    else if (n.kind === 'out.chat') lines.push({ kind: 'tell', node: n.id, text: 'Posts in the Routines chat' });
  }
  return lines;
}
const fieldWords = (v) => { const r = onlyRef(v); return r ? `the ${r.pin} from ${r.node}` : `"${String(v).replace(REF, (m, a, b) => `<${b} from ${a}>`).slice(0, 80)}"`; };
export function triggerWords(n) {
  const f = n.f || {};
  if (n.kind === 'trigger.manual') return 'when you press Run now';
  if (n.kind === 'trigger.time') return f.type === 'interval' ? `every ${f.everyMinutes} minutes` : f.type === 'once' ? `once, ${f.date} at ${f.at}` : f.type === 'weekly' ? `every ${f.days} at ${f.at}` : `every day at ${f.at}`;
  if (n.kind === 'trigger.file') return `when a new file${f.pattern ? ` like ${f.pattern}` : ''} turns up in ${f.folder}`;
  if (n.kind === 'trigger.mail') return `when new e-mail comes in${f.from ? ` from ${f.from}` : ''}${f.subject ? ` with "${f.subject}" in the subject` : ''}`;
  if (n.kind === 'trigger.page') return `when ${f.find ? `"${f.find}" on ` : ''}${f.url} changes`;
  return n.kind;
}

// A new, empty routine: just a Run now start.
export function blankRoutine(id, name = 'New routine') {
  return { bobRoutine: ROUTINE_FORMAT, id, name, what: '', nodes: [{ id: 'n1', kind: 'trigger.manual', x: 80, y: 120, f: {} }], wires: [] };
}
