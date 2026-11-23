// Import an n8n workflow (its exported JSON, or a template from the n8n community) as a Bob routine.
// No n8n runs here: each n8n step is turned into Bob's own boxes where there is a match, and everything else becomes
// a "Needs replacing" box that keeps the routine from running until you swap it for Bob's boxes. An import always
// comes in switched off and needs your OK like any routine, and it never keeps keys or sign-ins (n8n doesn't put
// them in the file, and the names of the ones it used are dropped).
//
// importN8n(json, { id }) -> { routine, report }. report: { name, steps, kept, changed: [{ step, text }],
//   todo: [{ step, text }], dropped: [{ step, text }] } in plain words for the report card.
// Shared by Bob's side (POST /api/routines { import }) and the tests; imports only the node table.
import { NODES, ROUTINE_TOOLS, MAX_NODES, MAX_WAIT_S, outsOf, cleanRoutine } from './routine-nodes.js';

export const MAX_IMPORT_BYTES = 900 * 1024; // the biggest community templates are about 200 KB
const T = (type) => String(type || '').replace(/^(@n8n\/n8n-nodes-langchain|n8n-nodes-base)\./, '');

// Steps that only move data along and mean nothing in a Bob routine: they're left out and the wires go straight
// through. why: said on the report card (empty = not worth saying).
const PASS = {
  noOp: '', merge: '', respondToWebhook: 'answered the web call that started it; Bob has no web call to answer',
  extractFromFile: 'Bob\'s "Read a file" already gives the words in a file', readPDF: 'Bob\'s "Read a file" already reads PDFs',
  markdown: 'Bob already gives a page as plain words', html: 'picked parts of a page with CSS selectors; Bob keeps all the page\'s words',
  htmlExtract: 'picked parts of a page with CSS selectors; Bob keeps all the page\'s words', convertToFile: 'Bob saves text to a file directly',
  moveBinaryData: 'Bob passes text along directly',
  aggregate: 'it gathered the items into one; here the data is already one piece of text (inside a For each, add each item to a file instead)', splitInBatches: null, executionData: '', debugHelper: ''
};
// Triggers and how they map.
const TRIGGERS = new Set(['manualTrigger', 'start', 'scheduleTrigger', 'cron', 'interval', 'gmailTrigger', 'emailReadImap', 'microsoftOutlookTrigger',
  'localFileTrigger', 'webhook', 'formTrigger', 'chatTrigger', 'executeWorkflowTrigger', 'errorTrigger', 'n8nTrigger', 'workflowTrigger', 'rssFeedReadTrigger']);
const LOOPS = new Set(['splitInBatches', 'splitOut']);
const isTriggerType = (t) => TRIGGERS.has(t) || /Trigger$/.test(t);
// Sub-parts of an AI step (they hang off it with "ai_" wires): Bob's brain box uses Bob's own brain instead.
const AI_PART = /^(lmChat|lmOpenAi|lmCohere|lmOllama|embeddings|memory|outputParser|textSplitter|documentDefaultDataLoader|documentBinaryInputLoader|documentJsonInputLoader|vectorStore|retriever|rerank|tool|mcpClientTool)/;
// What kind of thing an unmatched step is, for its "why".
const SERVICE_WORDS = (t) => t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());

export function importN8n(input, { id = 'rimport', now = '', start = '' } = {}) {
  let wf = input;
  if (typeof wf === 'string') {
    if (wf.length > MAX_IMPORT_BYTES) throw new Error('That file is too big to be a routine.');
    try { wf = JSON.parse(wf.replace(/^\uFEFF/, '')); } catch { throw new Error('That isn\'t an n8n workflow (it isn\'t JSON).'); }
  }
  if (wf && typeof wf === 'object' && !Array.isArray(wf.nodes) && wf.workflow && typeof wf.workflow === 'object') wf = wf.workflow;
  if (!wf || typeof wf !== 'object' || !Array.isArray(wf.nodes)) throw new Error('That isn\'t an n8n workflow (it has no "nodes").');
  const conns = wf.connections && typeof wf.connections === 'object' ? wf.connections : {};
  const report = { name: String(wf.name || 'Imported routine').slice(0, 80), steps: 0, kept: 0, changed: [], todo: [], dropped: [] };
  const changed = (step, text) => report.changed.push({ step, text });
  const todoSay = (step, text) => report.todo.push({ step, text });
  const dropped = (step, text) => { if (text) report.dropped.push({ step, text }); };

  // n8n steps by name (names are how n8n's wires and formulas point at steps).
  const steps = new Map();
  for (const n of wf.nodes) {
    if (!n || typeof n !== 'object' || typeof n.name !== 'string' || steps.has(n.name)) continue;
    steps.set(n.name, { name: n.name, type: T(n.type), v: Number(n.typeVersion) || 1, p: n.parameters && typeof n.parameters === 'object' ? n.parameters : {}, pos: Array.isArray(n.position) ? n.position : [0, 0], off: n.disabled === true, onError: n.onError || (n.continueOnFail ? 'continueRegularOutput' : '') });
  }
  // Main wires: name -> [output index] -> [names]. Parents: name -> [names] (for $json, "the step before").
  const outs = new Map(), parents = new Map(), inMain = new Set();
  for (const [from, c] of Object.entries(conns)) {
    if (!steps.has(from) || !Array.isArray(c?.main)) continue;
    const list = c.main.map((arr) => (Array.isArray(arr) ? arr : []).map((x) => x?.node).filter((x) => steps.has(x) && x !== from));
    outs.set(from, list);
    inMain.add(from);
    for (const arr of list) for (const to of arr) { inMain.add(to); if (!parents.has(to)) parents.set(to, []); if (!parents.get(to).includes(from)) parents.get(to).push(from); }
  }
  // AI steps that had tools hung on them (the brain box only answers).
  const aiTools = new Map();
  for (const [from, c] of Object.entries(conns)) for (const [k, arr] of Object.entries(c || {})) if (k === 'ai_tool' && Array.isArray(arr)) for (const x of arr.flat()) if (x?.node) aiTools.set(x.node, [...(aiTools.get(x.node) || []), from]);

  // ---- Bob nodes ----
  const nodes = [];
  const wires = [];
  let seq = 0;
  const newId = () => `n${++seq}`;
  const xs = [...steps.values()].map((s) => Number(s.pos[0]) || 0), ys = [...steps.values()].map((s) => Number(s.pos[1]) || 0);
  const minX = Math.min(0, ...xs), minY = Math.min(0, ...ys);
  const at = (s, dx = 0, dy = 0) => ({ x: Math.round(((Number(s.pos[0]) || 0) - minX) * 1.35 + 40 + dx), y: Math.round(((Number(s.pos[1]) || 0) - minY) * 1.5 + 40 + dy) });
  const add = (s, kind, f = {}, dx = 0, dy = 0) => { const n = { id: newId(), kind, ...at(s, dx, dy), f, note: s.name.slice(0, 300) }; nodes.push(n); return n; };
  // Per n8n step: how it maps. entry: the Bob node its input goes to. exits[i]: [{ id, out }] for n8n output i.
  // pass: left out (wires go through). ref: the Bob node whose values stand for this step's data.
  const map = new Map();

  // The start. n8n can have several (often a test button beside the real start, or separate flows in one file); a
  // routine has one. You can pick it (start); otherwise the one that reaches the most steps, preferring a start Bob has.
  const reachFrom = (name) => { const seen = new Set(); const stack = [name]; while (stack.length) { const n = stack.pop(); if (seen.has(n)) continue; seen.add(n); for (const arr of outs.get(n) || []) stack.push(...arr); } return seen; };
  const allTrigs = [...steps.values()].filter((s) => isTriggerType(s.type) && !s.off);
  const rank = (s) => (['scheduleTrigger', 'cron', 'interval'].includes(s.type) ? 0 : ['gmailTrigger', 'emailReadImap', 'microsoftOutlookTrigger'].includes(s.type) ? 1 : s.type === 'localFileTrigger' ? 2 : ['manualTrigger', 'start'].includes(s.type) ? 4 : 3);
  const size = new Map(allTrigs.map((s) => [s.name, reachFrom(s.name).size]));
  allTrigs.sort((a, b) => (size.get(b.name) - size.get(a.name)) || (rank(a) - rank(b)));
  const mainTrig = allTrigs.find((s) => s.name === start) || allTrigs[0];
  const trigSteps = mainTrig ? [mainTrig] : [];
  report.starts = allTrigs.map((s) => s.name);
  report.start = mainTrig?.name || '';
  if (allTrigs.length > 1) changed(mainTrig.name, `It has ${allTrigs.length} starts in n8n (${allTrigs.map((s) => `"${s.name}"`).join(', ')}). A routine has one, so this came in with "${mainTrig.name}" and the steps it reaches. Import it again to pick another.`);
  const trigNode = mainTrig ? triggerNode(mainTrig) : { id: newId(), kind: 'trigger.manual', x: 40, y: 40, f: {} };
  if (!mainTrig) { nodes.push(trigNode); changed('', 'It had no start of its own (n8n ran it from another workflow), so it starts when you press Run now.'); }
  for (const s of trigSteps) map.set(s.name, { entry: null, exits: [[{ id: trigNode.id, out: 'then' }]], ref: trigNode.id, trig: true });

  function triggerNode(s) {
    const p = s.p;
    const t = s.type;
    if (['scheduleTrigger', 'cron', 'interval'].includes(t)) {
      const f = scheduleFields(s);
      const n = add(s, 'trigger.time', f.f);
      if (f.why) changed(s.name, f.why);
      return n;
    }
    if (['gmailTrigger', 'emailReadImap', 'microsoftOutlookTrigger'].includes(t)) {
      const from = str(p.filters?.sender || p.filters?.from || '');
      const subject = str(p.filters?.q || p.filters?.subject || '');
      changed(s.name, 'It now looks at the e-mail account set in Bob\'s Settings, every 5 minutes. The mail lock applies.');
      return add(s, 'trigger.mail', { ...(from && !from.startsWith('=') ? { from } : {}), ...(subject && !subject.startsWith('=') ? { subject } : {}) });
    }
    if (t === 'localFileTrigger') {
      const pth = str(p.path);
      const file = p.triggerOn === 'file';
      const folder = file ? pth.replace(/[\\/][^\\/]*$/, '') : pth;
      const pattern = file ? pth.slice(folder.length + 1) : '';
      if (!/add/.test(JSON.stringify(p.events || ['add']))) changed(s.name, 'Bob only starts for new files, not changed or deleted ones.');
      return add(s, 'trigger.file', { folder, ...(pattern ? { pattern } : {}) });
    }
    if (t === 'rssFeedReadTrigger' && str(p.feedUrl).startsWith('http')) {
      changed(s.name, 'It now starts when the feed\'s page changes (checked every few hours).');
      return add(s, 'trigger.page', { url: str(p.feedUrl), find: '', hours: 6 });
    }
    if (!['manualTrigger', 'start'].includes(t)) {
      const how = t === 'webhook' ? 'a web call' : t === 'formTrigger' ? 'a web form' : t === 'chatTrigger' ? 'a chat message' : t === 'executeWorkflowTrigger' ? 'another workflow' : t === 'errorTrigger' ? 'another workflow failing' : SERVICE_WORDS(t.replace(/Trigger$/, ''));
      changed(s.name, `In n8n it started from ${how}. Bob can't listen for that, so it starts when you press Run now. Change the start box if you like.${t === 'chatTrigger' ? ' (For chatting with an AI, Bob\'s own chat already does that: routines are for jobs that run by themselves.)' : ''}`);
    }
    return add(s, 'trigger.manual', {});
  }

  // What the start reaches. Without a start of its own, the steps nothing runs into start it.
  const roots = trigSteps.length ? trigSteps.map((s) => s.name) : [...inMain].filter((n) => !parents.has(n) && !steps.get(n).off);
  if (!trigSteps.length && roots.length) { map.set('\u0000start', { exits: [[{ id: trigNode.id, out: 'then' }]] }); outs.set('\u0000start', [roots]); }
  const reach = new Set();
  { const stack = [...roots]; while (stack.length) { const n = stack.pop(); if (reach.has(n)) continue; reach.add(n); for (const arr of outs.get(n) || []) stack.push(...arr); } }

  // Everything else, step by step.
  for (const s of steps.values()) {
    if (map.has(s.name)) continue;
    if (s.type === 'stickyNote') { add(s, 'note', { text: str(p0(s.p.content)).slice(0, 3000) }); continue; }
    if (!inMain.has(s.name)) {
      if (AI_PART.test(s.type)) { /* part of an AI step; the brain box covers it */ } else dropped(s.name, 'Nothing was wired to it in n8n, so it was left out.');
      continue;
    }
    if (!reach.has(s.name)) { dropped(s.name, 'It isn\'t joined to the start (in n8n it was a side flow, often one an AI step used as a tool), so it was left out.'); continue; }
    report.steps++;
    if (s.off) { map.set(s.name, { pass: true }); dropped(s.name, 'It was switched off in n8n.'); continue; }
    const m = convert(s);
    map.set(s.name, m);
    if (m.pass) { report.kept++; if (m.why) dropped(s.name, m.why); continue; }
    if (m.todo) todoSay(s.name, m.todo); else report.kept++;
  }

  function convert(s) {
    const p = s.p, t = s.type;
    if (t in PASS && PASS[t] !== null) return { pass: true, why: PASS[t] };
    if (t === 'splitOut' || t === 'splitInBatches' || t === 'itemLists' && p.operation === 'splitOutItems') {
      // n8n runs the next steps once per item; Bob's For each does the same over the lines of the text before it.
      const lines = add(s, 'lines', { text: '' }, -40, 0);
      const each = add(s, 'forEach', { list: `{{${lines.id}.list}}` }, 230, 0);
      wires.push({ from: lines.id, out: 'then', to: each.id });
      changed(s.name, 'n8n split the data into items; Bob splits the text into lines and repeats the next steps for each line. Check it splits the way you want.');
      const v3 = t === 'splitInBatches' && s.v >= 3;
      return { entry: lines.id, exits: v3 ? [[{ id: each.id, out: 'done' }], [{ id: each.id, out: 'each' }]] : [[{ id: each.id, out: 'each' }]], ref: each.id, input: [lines.id, 'text'] };
    }
    if (t === 'set' || t === 'editFields') {
      // One Make text box per field, in a row, so later steps can use each field by name.
      const pairs = setPairs(p).slice(0, 12);
      if (!pairs.length) return { pass: true, why: '' };
      const boxes = pairs.map(([k], i) => ({ k, n: add(s, 'text', { text: '' }, 0, i * 110) }));
      boxes.forEach(({ n }, i) => { n.note = `${s.name}: ${pairs[i][0]}`.slice(0, 300); if (boxes[i + 1]) wires.push({ from: n.id, out: 'then', to: boxes[i + 1].n.id }); });
      if (pairs.length > 1) changed(s.name, `Its ${pairs.length} fields became ${pairs.length} Make text boxes in a row.`);
      const last = boxes[boxes.length - 1].n;
      return { entry: boxes[0].n.id, exits: [[{ id: last.id, out: 'then' }]], ref: last.id, fields: Object.fromEntries(boxes.map(({ k, n }) => [k, n.id])), keepRest: p.include !== 'none' && p.includeOtherFields !== false,
        fill: () => boxes.forEach(({ n }, i) => { n.f.text = expr(pairs[i][1], s); }) };
    }
    if (t === 'if' || t === 'filter') {
      const conds = conditions(p);
      if (!conds.length) return todo(s, 'its test couldn\'t be read');
      const any = /or/i.test(String(p.conditions?.combinator || p.combineOperation || 'and'));
      const ifs = conds.map((c, i) => ({ c, n: add(s, 'if', {}, 0, i * 150) }));
      const yes = [], no = [];
      ifs.forEach(({ c, n }, i) => {
        const next = ifs[i + 1]?.n;
        const pass = c.flip ? 'no' : 'yes', failPin = c.flip ? 'yes' : 'no';
        // AND: every test must pass, so a pass goes on to the next test. OR: any pass is enough.
        if (any) { yes.push({ id: n.id, out: pass }); if (next) wires.push({ from: n.id, out: failPin, to: next.id }); else no.push({ id: n.id, out: failPin }); }
        else { no.push({ id: n.id, out: failPin }); if (next) wires.push({ from: n.id, out: pass, to: next.id }); else yes.push({ id: n.id, out: pass }); }
        if (c.why) changed(s.name, c.why);
      });
      if (conds.length > 1) changed(s.name, `Its ${conds.length} tests became ${conds.length} If boxes in a row.`);
      if (t === 'filter') changed(s.name, 'A filter in n8n drops what doesn\'t pass; here the run just stops there.');
      return { entry: ifs[0].n.id, exits: t === 'filter' ? [yes] : [yes, no], ref: null, fill: () => ifs.forEach(({ c, n }) => { n.f = { value: expr(c.value, s), test: c.test, ...(c.with !== undefined ? { with: expr(c.with, s) } : {}) }; }) };
    }
    if (t === 'switch') {
      const rules = switchRules(p);
      if (!rules.length) return todo(s, 'its rules couldn\'t be read');
      const ifs = rules.map((c, i) => ({ c, n: add(s, 'if', {}, 0, i * 150) }));
      const exits = [];
      ifs.forEach(({ c, n }, i) => {
        const next = ifs[i + 1]?.n;
        exits[c.out] = [...(exits[c.out] || []), { id: n.id, out: c.flip ? 'no' : 'yes' }];
        if (next) wires.push({ from: n.id, out: c.flip ? 'yes' : 'no', to: next.id });
        else if (p.options?.fallbackOutput === 'extra' || p.fallbackOutput !== undefined) exits[rules.length] = [{ id: n.id, out: c.flip ? 'yes' : 'no' }];
        if (c.why) changed(s.name, c.why);
      });
      changed(s.name, `Its ${rules.length} ways became If boxes in a row: the first test that passes wins.`);
      return { entry: ifs[0].n.id, exits: Array.from({ length: exits.length }, (_, i) => exits[i] || []), ref: null, fill: () => ifs.forEach(({ c, n }) => { n.f = { value: expr(c.value, s), test: c.test, ...(c.with !== undefined ? { with: expr(c.with, s) } : {}) }; }) };
    }
    if (t === 'wait') {
      const resume = p.resume || 'timeInterval';
      if (resume !== 'timeInterval') return todo(s, 'it waited for a web call, a form or a set date; a routine only waits a number of seconds');
      const unit = { seconds: 1, minutes: 60, hours: 3600, days: 86400 }[p.unit || (s.v >= 1.1 ? 'seconds' : 'hours')] || 1;
      const secs = Math.round((Number(p.amount ?? 1) || 0) * unit);
      if (secs > MAX_WAIT_S) return todo(s, `it waited ${secs >= 86400 ? `${Math.round(secs / 86400)} days` : `${Math.round(secs / 3600)} hours`}; a routine waits up to an hour. Split it into two routines with a time start instead`);
      return one(s, 'wait', { seconds: secs });
    }
    if (t === 'stopAndError') return { ...one(s, 'stop', { failed: true, why: '' }), fill2: (n) => { n.f.why = expr(p.errorMessage || p.errorDescription || 'Stopped.', s); } };
    if (t === 'httpRequest') {
      const method = String(p.method || p.requestMethod || 'GET').toUpperCase();
      if (method !== 'GET') return todo(s, `it sent data to a web service (${method}); Bob's routines only read pages`);
      let url = str(p.url);
      const q = (p.queryParameters?.parameters || p.queryParametersUi?.parameter || []).filter((x) => x?.name);
      if (q.length && (p.sendQuery !== false)) url += `${url.includes('?') ? '&' : '?'}${q.map((x) => `${x.name}=${x.value ?? ''}`).join('&')}`;
      if ((p.authentication && p.authentication !== 'none') || p.sendHeaders) changed(s.name, 'It signed in or sent headers in n8n. Bob reads the page without them, so a page that needs a key won\'t work.');
      return tool(s, 'fetch_page', { url }, { url: 'url' });
    }
    if (t === 'rssFeedRead') return tool(s, 'fetch_page', { url: p.url }, { url: 'url' });
    if (t === 'readWriteFile' || t === 'readBinaryFile' || t === 'readBinaryFiles' || t === 'writeBinaryFile') {
      const write = t === 'writeBinaryFile' || p.operation === 'write';
      if (write) { changed(s.name, 'It wrote the data from the step before into the file.'); return tool(s, 'write_file', { path: p.fileName, content: '={{ $json.text }}' }, { path: 'path', content: 'content' }); }
      const pth = p.fileSelector ?? p.filePath;
      if (/[*?]/.test(str(pth))) return todo(s, 'it read many files at once with * in the name; use "List a folder" and For each');
      return tool(s, 'read_file', { path: pth }, { path: 'path' });
    }
    if (t === 'gmail' || t === 'microsoftOutlook' || t === 'emailReadImap') {
      const op = String(p.operation || 'getAll');
      if (/send|reply|draft|delete|add|remove|mark|create|update/i.test(op) || !p.operation) return todo(s, 'it sent or changed e-mail; routines only read e-mail');
      changed(s.name, 'It reads the e-mail account set in Bob\'s Settings.');
      if (op === 'get') return tool(s, 'read_email', { action: 'read', id: p.messageId }, { id: 'id' });
      return tool(s, 'read_email', { action: 'list', days: 1, from: p.filters?.sender || '' }, { from: 'from' });
    }
    if (t === 'emailSend' || t === 'sendEmail') return todo(s, 'it sent e-mail; routines don\'t send e-mail. Use "Tap me on the shoulder" to tell yourself');
    if (t === 'executeCommand' || t === 'ssh') return todo(s, 'it ran a command; routines never run commands');
    if (t === 'code' || t === 'function' || t === 'functionItem' || t === 'aiTransform') return todo(s, 'it ran code; Bob doesn\'t run code from an import. Rebuild it with Make text, If and For each');
    if (t === 'executeWorkflow' || t === 'toolWorkflow') return todo(s, 'it ran another n8n workflow; import that one too and run it from here');
    if (t === 'dateTime' && /format|current/i.test(String(p.operation || 'getCurrentDate')) && !p.value) { changed(s.name, 'It now uses the time the routine started.'); return { pass: true, why: '', refPin: 'at', refTrig: true }; }
    // ---- AI ----
    const ai = aiStep(s);
    if (ai) return ai;
    if (AI_PART.test(t)) return todo(s, 'it was part of an AI step that Bob\'s brain box covers differently');
    // A notifier that only tells you something: the closest Bob box tells you too, but it can't reach the service.
    if (/^(telegram|slack|discord|mattermost|matrix|pushover|pushbullet|pushcut|gotify|ntfy|whatsApp|twilio|microsoftTeams|signal)/.test(t))
      return todo(s, `it sent a message on ${SERVICE_WORDS(t)}. Bob can't reach that; to tell yourself, use "Tap me on the shoulder" or "Post in the Routines chat"`);
    return todo(s, `${SERVICE_WORDS(t)} is a service or n8n step Bob doesn't have`);
  }

  function aiStep(s) {
    const p = s.p, t = s.type;
    let sys = p.options?.systemMessage || p.systemMessage || '';
    let prompt = '';
    if (['agent', 'chainLlm', 'chainSummarization', 'chainRetrievalQa', 'informationExtractor', 'textClassifier', 'sentimentAnalysis', 'openAi', 'anthropic', 'googleGemini', 'ollama', 'mistralAi'].includes(t) === false) return null;
    if ((t === 'openAi' || t === 'anthropic' || t === 'googleGemini') && p.resource && p.resource !== 'text' && p.resource !== 'chat') return todo(s, `it made or read ${p.resource === 'image' ? 'pictures' : p.resource === 'audio' ? 'sound' : 'files'} with AI; Bob's brain box only works with words`);
    if (t === 'chainRetrievalQa') return todo(s, 'it looked things up in a vector store; use "Search files" before an "Ask the brain" box');
    // Several messages become one question; any formula in them stays a formula.
    const joinAll = (list) => { const parts = list.map(str).filter(Boolean); return parts.some((x) => x.startsWith('=')) ? `=${parts.map((x) => x.replace(/^=/, '')).join('\n\n')}` : parts.join('\n\n'); };
    if (Array.isArray(p.messages?.values)) prompt = joinAll(p.messages.values.map((x) => x?.content ?? x?.message));
    else if (Array.isArray(p.messages?.messageValues)) prompt = joinAll(p.messages.messageValues.map((x) => x?.message));
    if (Array.isArray(p.prompt?.messages)) prompt = joinAll(p.prompt.messages.map((x) => x?.content));
    // With its own prompt text, the messages are the instructions around it (n8n's chain); without, they're the prompt.
    const own = str(p.text || (typeof p.prompt === 'string' ? p.prompt : '') || p.inputText);
    if (own && prompt && !sys) sys = prompt;
    prompt = own || prompt;
    // An agent or chain without its own prompt reads the chat message that started it.
    if (!prompt && ['agent', 'chainLlm'].includes(t) && p.promptType !== 'define') prompt = '={{ $json.chatInput }}';
    const tools = aiTools.get(s.name);
    if (tools?.length) changed(s.name, `It could use ${tools.length} tool${tools.length > 1 ? 's' : ''} (${tools.slice(0, 4).join(', ')}). Bob's brain box only answers, so put Bob's tool boxes before it.`);
    changed(s.name, 'It asks Bob\'s own small brain instead of an online AI.');
    if (t === 'textClassifier') {
      const cats = (p.categories?.categories || []).map((c) => str(c?.category)).filter(Boolean);
      if (!cats.length) return todo(s, 'its sorting groups couldn\'t be read');
      const b = add(s, 'brain', {});
      const ifs = cats.map((c, i) => ({ c, n: add(s, 'if', { value: `{{${b.id}.answer}}`, test: 'contains', with: c }, 300, i * 150) }));
      wires.push({ from: b.id, out: 'then', to: ifs[0].n.id });
      ifs.forEach(({ n }, i) => { if (ifs[i + 1]) wires.push({ from: n.id, out: 'no', to: ifs[i + 1].n.id }); });
      return { entry: b.id, exits: ifs.map(({ n }) => [{ id: n.id, out: 'yes' }]), ref: b.id, fill: () => { b.f = { question: `Which one of these fits best: ${cats.join(', ')}? Answer with just its name.`, input: prompt ? expr(prompt, s) : prevText(s), answer: 'text' }; } };
    }
    const b = add(s, 'brain', {});
    const question = t === 'chainSummarization' ? 'Sum this up in a few lines.' : t === 'sentimentAnalysis' ? 'Is the feeling in this good? Answer yes or no.'
      : t === 'informationExtractor' ? `Pull these out of it, one per line as "name: value": ${(p.attributes?.attributes || []).map((a) => a?.name).filter(Boolean).join(', ') || 'the main facts'}.` : '';
    return { entry: b.id, exits: [[{ id: b.id, out: 'then' }], ...(s.onError === 'continueErrorOutput' ? [[{ id: b.id, out: 'failed' }]] : [])], ref: b.id,
      fill: () => {
        const q = question || (sys ? expr(sys, s) : '') || (prompt ? expr(prompt, s) : 'Answer this.');
        const input = question || sys ? (prompt ? expr(prompt, s) : prevText(s)) : '';
        b.f = { question: q.slice(0, 3800), input, answer: t === 'sentimentAnalysis' ? 'yesno' : 'text' };
      } };
  }

  function one(s, kind, f) { const n = add(s, kind, f); return { entry: n.id, exits: [[{ id: n.id, out: (NODES[kind].exec ?? ['then'])[0] }]], ref: n.id }; }
  function todo(s, why) {
    const n = add(s, 'todo', { was: `${s.name} (${SERVICE_WORDS(s.type)})`.slice(0, 200), why: why.slice(0, 400) });
    return { entry: n.id, exits: [[{ id: n.id, out: 'then' }]], ref: n.id, todo: `Needs replacing: ${why}.` };
  }
  // A tool box. fields: Bob field -> n8n value; formulas are turned into values after every step has its box.
  function tool(s, name, vals) {
    const n = add(s, 'tool', { tool: name });
    const errOut = s.onError === 'continueErrorOutput';
    return { entry: n.id, exits: [[{ id: n.id, out: 'then' }], ...(errOut ? [[{ id: n.id, out: 'failed' }]] : [])], ref: n.id,
      fill: () => { for (const [k, v] of Object.entries(vals)) { if (v === undefined || v === null || v === '') continue; n.f[k] = typeof v === 'number' ? v : expr(v, s); } if (ROUTINE_TOOLS[name]?.fields.days === 'number' && typeof n.f.days === 'string' && /^\d+$/.test(n.f.days)) n.f.days = Number(n.f.days); } };
  }

  // ---- Formulas: n8n's ={{ $json.x }} and $('Step').item.json.x become Bob's {{node.pin}} ----
  function refOf(name, field, hops = 0) {
    const m = map.get(name);
    if (!m || hops > 50) return null;
    // A left-out step (or an If) passes on the data of the steps before it: the first of them that has this field.
    const fromParents = () => { for (const up of parents.get(name) || []) { const r = refOf(up, field, hops + 1); if (r) return r; } return null; };
    if (m.pass) {
      if (m.refTrig) return { id: trigNode.id, pin: outsOf(trigNode).at ? 'at' : pinFor(trigNode, field) };
      return fromParents();
    }
    if (!m.ref) return fromParents();
    // A Set step: each field has its own box; a field it didn't set comes from the step before it.
    if (m.fields) { if (m.fields[field]) return { id: m.fields[field], pin: 'text' }; if (field && m.keepRest) { const up = (parents.get(name) || [])[0]; return up ? refOf(up, field, hops + 1) : null; } }
    const node = nodes.find((n) => n.id === m.ref);
    const pin = node ? pinFor(node, field) : null;
    return pin ? { id: node.id, pin } : null;
  }
  // The pin that stands for an n8n field: the same name, a known other name for it, or (for a box with one value,
  // like a For each item or a whole page) that value. A field Bob can't match stays a formula for you to fix.
  function pinFor(node, field) {
    const o = outsOf(node);
    const f = String(field || '').toLowerCase();
    if (f && o[f]) return f;
    const alias = { textplain: 'text', texthtml: 'text', snippet: 'text', body: 'text', html: 'text', content: 'text', data: 'text', output: 'answer', response: 'answer', message: 'answer', choices: 'answer', sender: 'from', filepath: 'path', filename: 'name' }[f];
    if (alias && o[alias]) return alias;
    if (f === 'text' && o.answer) return 'answer';
    if (node.kind === 'todo') return 'text';
    if (!f || node.kind === 'forEach') for (const p of ['item', 'answer', 'text', 'list', 'path', 'at']) if (o[p]) return p;
    return null;
  }
  function prevText(s) {
    const up = (parents.get(s.name) || [])[0];
    const r = up ? refOf(up, 'text') : null;
    return r ? `{{${r.id}.${r.pin}}}` : '';
  }
  const PATH = String.raw`(?:\??\.([A-Za-z_$][\w$]*)|\??\.?\[\s*["']([^"'\]]+)["']\s*\]|\??\.?\[\s*\d+\s*\])`;
  const NODE_PICK = new RegExp(String.raw`^(?:\$\(\s*(["'])(.+?)\1\s*\)\s*\.\s*(?:item|first\(\)|last\(\)|all\(\)\[0\]|itemMatching\([^)]*\))|(?:\$item\(\s*\d+\s*\)\s*\.\s*)?\$node\s*\[\s*(["'])(.+?)\3\s*\]|\$items\(\s*(["'])(.+?)\5\s*\)\s*\[0\])\s*\.\s*json((?:${PATH})*)\s*$`);
  const JSON_PICK = new RegExp(String.raw`^(?:\$json|\$input\s*\.\s*(?:item|first\(\)|last\(\)|all\(\)\[0\])\s*\.\s*json)((?:${PATH})*)\s*$`);
  const firstKey = (tail) => { for (const m of String(tail || '').matchAll(new RegExp(PATH, 'g'))) if (m[1] || m[2]) return m[1] || m[2]; return ''; };
  function chunk(js, s) {
    // Turning a value into words changes nothing here (Bob's values are already words).
    let c = js.trim();
    for (let i = 0; i < 3; i++) c = c.replace(/^JSON\.stringify\(([\s\S]*)\)$/, '$1').replace(/\.(toString|trim|toJsonString)\(\)$/, '').trim();
    let m = JSON_PICK.exec(c);
    if (m) { const up = (parents.get(s.name) || [])[0]; const r = up ? refOf(up, firstKey(m[1])) : null; if (r) return `{{${r.id}.${r.pin}}}`; }
    m = NODE_PICK.exec(c);
    if (m) { const r = refOf(m[2] || m[4] || m[6], firstKey(m[7])); if (r) return `{{${r.id}.${r.pin}}}`; }
    if (/^\$now|^\$today|^new Date\(\)/.test(c) && outsOf(trigNode).at) return `{{${trigNode.id}.at}}`;
    if (/^(["'])[^"']*\1$/.test(c)) return c.slice(1, -1);
    if (/^(true|false|-?\d+(\.\d+)?)$/.test(c)) return c;
    return `[[n8n: ${c.slice(0, 300)}]]`;
  }
  function expr(v, s) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') v = v.__rl ? String(v.value ?? '') : JSON.stringify(v);
    v = String(v);
    if (!v.startsWith('=')) return v;
    return v.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_, js) => chunk(js, s));
  }

  // Formulas are turned into values now that every step has its box.
  for (const s of steps.values()) {
    const m = map.get(s.name);
    m?.fill?.();
    if (m?.fill2) m.fill2(nodes.find((n) => n.id === m.entry));
    if (m?.input && !nodes.find((n) => n.id === m.input[0]).f[m.input[1]]) nodes.find((n) => n.id === m.input[0]).f[m.input[1]] = prevText(s);
  }
  for (const n of nodes) for (const [k, v] of Object.entries(n.f)) if (typeof v === 'string' && /\[\[n8n:/.test(v) && !report.todo.some((x) => x.node === n.id)) { report.todo.push({ step: n.note || n.id, node: n.id, text: `The "${k}" field has a formula Bob couldn't turn into a value. Rewrite it.` }); }

  // ---- Wires ----
  // Where an n8n step's input goes: its entry box, or (for a left-out step) the steps after it.
  const entries = (name, seen = new Set()) => {
    if (seen.has(name)) return [];
    seen.add(name);
    const m = map.get(name);
    if (!m) return [];
    if (m.entry) return [m.entry];
    if (m.pass || !m.entry) return ((outs.get(name) || [])[0] || []).flatMap((x) => entries(x, seen));
    return [];
  };
  // Wires that go back to an earlier step (n8n's loops). For each repeats by itself; any other loop is said.
  const backEdge = new Set();
  {
    const state = new Map();
    const visit = (n) => { state.set(n, 1); for (const arr of outs.get(n) || []) for (const x of arr) { if (state.get(x) === 1) { backEdge.add(`${n}>${x}`); if (!LOOPS.has(steps.get(x)?.type)) changed(x, 'n8n went back to this step to repeat it. Routines repeat only with For each, so that wire was left out.'); } else if (!state.has(x)) visit(x); } state.set(n, 2); };
    for (const r of [...outs.keys()].filter((n) => n === '\u0000start' || trigSteps.some((s) => s.name === n))) visit(r);
  }
  const fanouts = [];
  const used = new Set(wires.map((w) => `${w.from}.${w.out}`));
  const wire = (from, out, to) => { const k = `${from}.${out}`; if (used.has(k) || from === to) return false; used.add(k); wires.push({ from, out, to }); return true; };
  for (const [name, list] of outs) {
    const m = map.get(name);
    if (!m || m.pass || !m.exits) continue;
    list.forEach((targets, i) => {
      // The end of a loop goes back to "Loop over items" in n8n; For each repeats by itself, so that wire goes.
      const to = [...new Set(targets.filter((x) => !backEdge.has(`${name}>${x}`)).flatMap((x) => entries(x)))];
      if (!to.length) return;
      for (const src of m.exits[i] || []) { const rest = wire(src.id, src.out, to[0]) ? to.slice(1) : to; if (rest.length) fanouts.push({ src, rest, name }); }
    });
  }
  // A step that went to two places at once in n8n: Bob does them one after the other.
  const joins = new Set();
  { const count = new Map(); for (const w of wires) count.set(w.to, (count.get(w.to) || 0) + 1); for (const [k, c] of count) if (c > 1) joins.add(k); }
  const done = new Set();
  for (const fo of fanouts) {
    const key = `${fo.src.id}.${fo.src.out}`;
    if (done.has(key)) continue;
    done.add(key);
    let first = wires.find((w) => w.from === fo.src.id && w.out === fo.src.out)?.to;
    let ok = true;
    for (const next of fo.rest) {
      if (after(fo.src.id).has(next)) continue; // it already runs later in the row
      // Both ways meet again at the first one (an n8n Merge): run this way first, and it leads on to the meeting point.
      if (after(next).has(first) && !after(first).has(next)) { const w = wires.find((x) => x.from === fo.src.id && x.out === fo.src.out); if (w) { w.to = next; first = next; continue; } }
      const tail = tailOf(first);
      if (!tail || after(next).has(tail.id)) { ok = false; break; }
      if (tail.join) { const i = wires.findIndex((w) => w.from === tail.id && w.out === tail.out); wires.splice(i, 1); used.delete(`${tail.id}.${tail.out}`); }
      wire(tail.id, tail.out, next);
      first = next;
    }
    changed(fo.name, ok ? 'It went to several steps at once in n8n; Bob does them one after the other.' : 'It went to several steps at once in n8n. Bob couldn\'t put them all in a row, so wire the rest yourself (they have red marks).');
  }
  function after(id) { const seen = new Set(); const stack = [id]; while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); for (const w of wires) if (w.from === x) stack.push(w.to); } return seen; }
  function tailOf(start) {
    let id = start;
    const seen = new Set();
    for (let i = 0; i < 400 && id && !seen.has(id); i++) {
      seen.add(id);
      const n = nodes.find((x) => x.id === id);
      if (!n) return null;
      const pins = NODES[n.kind]?.exec ?? ['then'];
      const out = n.kind === 'forEach' ? 'done' : pins.length === 1 || (pins[0] === 'then') ? 'then' : null;
      if (!out) return null;
      const w = wires.find((x) => x.from === id && x.out === out);
      if (!w) return { id, out };
      if (joins.has(w.to)) return { id, out, join: true };
      id = w.to;
    }
    return null;
  }
  // Loops back (n8n's "Loop over items" comes back to the start of the loop): For each repeats by itself.
  {
    const trig = trigNode.id;
    const state = new Map();
    const back = [];
    const visit = (id) => { state.set(id, 1); for (const w of wires.filter((x) => x.from === id)) { if (state.get(w.to) === 1) back.push(w); else if (!state.has(w.to)) visit(w.to); } state.set(id, 2); };
    visit(trig);
    for (const w of back) {
      wires.splice(wires.indexOf(w), 1);
      const to = nodes.find((n) => n.id === w.to);
      if (to?.kind !== 'forEach') changed(to?.note || '', 'n8n went back to this step to repeat it. Routines repeat only with For each, so that wire was left out.');
    }
  }

  while (nodes.length > MAX_NODES && nodes.some((n) => n.kind === 'note')) nodes.splice(nodes.findLastIndex((n) => n.kind === 'note'), 1);
  if (nodes.length > MAX_NODES) throw new Error(`That workflow has more steps than a routine can hold (${MAX_NODES} boxes).`);
  const routine = cleanRoutine({ id, name: report.name, what: `Imported from n8n${now ? ` on ${now}` : ''}. Check every box before you switch it on.`, nodes, wires, from: 'n8n' });
  report.lines = reportLines(report);
  return { routine, report };
}

// The report card, in plain lines.
export function reportLines(rep) {
  const out = [`${rep.kept} of ${rep.steps} step${rep.steps === 1 ? '' : 's'} came across as Bob's own boxes (or weren't needed here).`];
  if (rep.todo.length) out.push(`${rep.todo.length} thing${rep.todo.length === 1 ? '' : 's'} need${rep.todo.length === 1 ? 's' : ''} fixing before it can run (the pink "Needs replacing" boxes and the red marks).`);
  if (rep.changed.length) out.push(`${rep.changed.length} thing${rep.changed.length === 1 ? '' : 's'} work a bit differently; they're listed below.`);
  out.push('It comes in switched off and needs your OK like any routine.');
  return out;
}

// ---- n8n's settings, read ----
const str = (v) => (v === undefined || v === null ? '' : typeof v === 'object' ? (v.__rl ? String(v.value ?? '') : JSON.stringify(v)) : String(v));
const p0 = (v) => (typeof v === 'string' ? v : '');
const pad = (n) => String(Math.max(0, Math.min(59, Number(n) || 0))).padStart(2, '0');
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function scheduleFields(s) {
  const p = s.p;
  if (s.type === 'interval') {
    const mins = Math.round((Number(p.interval) || 1) * ({ minutes: 1, hours: 60, days: 1440 }[p.unit || 'seconds'] ?? 1 / 60));
    return { f: { type: 'interval', everyMinutes: Math.max(5, mins) }, why: mins < 5 ? 'Routines run at most every 5 minutes.' : '' };
  }
  if (s.type === 'cron') {
    const it = p.triggerTimes?.item?.[0] || {};
    const hm = `${String(Math.min(23, Number(it.hour) || 0)).padStart(2, '0')}:${pad(it.minute)}`;
    if (it.mode === 'everyWeek') return { f: { type: 'weekly', at: hm, days: DAYS[Number(it.weekday) % 7] || 'mon' } };
    if (it.mode === 'everyHour') return { f: { type: 'interval', everyMinutes: 60 }, why: 'It runs every 60 minutes (not on the minute it did in n8n).' };
    if (it.mode === 'everyMinute') return { f: { type: 'interval', everyMinutes: 5 }, why: 'Routines run at most every 5 minutes.' };
    if (it.mode === 'everyX') { const mins = (Number(it.value) || 1) * (it.unit === 'hours' ? 60 : 1); return { f: { type: 'interval', everyMinutes: Math.max(5, mins) }, why: mins < 5 ? 'Routines run at most every 5 minutes.' : '' }; }
    if (it.mode === 'custom') return cronFields(String(it.cronExpression || ''));
    return { f: { type: 'daily', at: hm } };
  }
  const r = (p.rule?.interval || [{}])[0] || {};
  const field = r.field || 'days';
  const hm = `${String(Math.min(23, Number(r.triggerAtHour) || 0)).padStart(2, '0')}:${pad(r.triggerAtMinute)}`;
  const many = (p.rule?.interval || []).length > 1 ? ' It had more than one time in n8n; only the first came across.' : '';
  if (field === 'seconds' || field === 'minutes') { const mins = field === 'seconds' ? 1 : Number(r.minutesInterval) || 5; return { f: { type: 'interval', everyMinutes: Math.max(5, mins) }, why: (mins < 5 ? 'Routines run at most every 5 minutes.' : '') + many }; }
  if (field === 'hours') return { f: { type: 'interval', everyMinutes: 60 * (Number(r.hoursInterval) || 1) }, why: `It runs every ${Number(r.hoursInterval) || 1} hour(s) from when it's switched on.${many}` };
  if (field === 'weeks') { const d = (Array.isArray(r.triggerAtDay) ? r.triggerAtDay : [1]).map((x) => DAYS[Number(x) % 7]).filter(Boolean); return { f: { type: 'weekly', at: hm, days: (d.length ? d : ['mon']).join(', ') }, why: (Number(r.weeksInterval) > 1 ? `It runs every week, not every ${r.weeksInterval} weeks.` : '') + many }; }
  if (field === 'months') return { f: { type: 'daily', at: hm }, why: 'Routines don\'t have a monthly start yet, so it runs every day: add an If on the date, or change it.' + many };
  if (field === 'cronExpression') { const c = cronFields(String(r.expression || '')); return { ...c, why: (c.why || '') + many }; }
  return { f: { type: 'daily', at: hm }, why: (Number(r.daysInterval) > 1 ? `It runs every day, not every ${r.daysInterval} days.` : '') + many };
}
// The simple cron lines ("m h * * dow"); anything fancier runs every day and says so.
function cronFields(expr) {
  const parts = expr.trim().split(/\s+/);
  const [m, h, dom, mon, dow] = parts.length === 6 ? parts.slice(1) : parts;
  const ok = (x) => /^\d{1,2}$/.test(x || '');
  const every = /^\*\/(\d+)$/.exec(m || '');
  if (every && h === '*') return { f: { type: 'interval', everyMinutes: Math.max(5, Number(every[1])) } };
  if (ok(m) && /^\*\/(\d+)$/.test(h || '')) return { f: { type: 'interval', everyMinutes: 60 * Number(h.slice(2)) } };
  if (ok(m) && ok(h) && dom === '*' && mon === '*') {
    const at = `${String(Math.min(23, Number(h))).padStart(2, '0')}:${pad(m)}`;
    if (!dow || dow === '*') return { f: { type: 'daily', at } };
    const days = dow.split(',').flatMap((x) => { const r = /^(\d)-(\d)$/.exec(x); return r ? Array.from({ length: Number(r[2]) - Number(r[1]) + 1 }, (_, i) => Number(r[1]) + i) : [Number(x)]; }).map((x) => DAYS[x % 7]).filter(Boolean);
    if (days.length) return { f: { type: 'weekly', at, days: days.join(', ') } };
  }
  return { f: { type: 'daily', at: ok(h) && ok(m) ? `${String(Math.min(23, Number(h))).padStart(2, '0')}:${pad(m)}` : '09:00' }, why: `Its timing ("${expr.slice(0, 40)}") was too fancy to copy, so it runs every day. Set the time you want.` };
}

// Set / Edit Fields: [name, value] pairs, whatever the version.
function setPairs(p) {
  const a = p.assignments?.assignments;
  if (Array.isArray(a)) return a.filter((x) => x?.name).map((x) => [String(x.name).replace(/^=/, ''), x.value]);
  if (Array.isArray(p.fields?.values)) return p.fields.values.filter((x) => x?.name).map((x) => [String(x.name), x.stringValue ?? x.numberValue ?? x.booleanValue ?? x.value]);
  if (p.values && typeof p.values === 'object') return Object.values(p.values).flatMap((arr) => (Array.isArray(arr) ? arr : [])).filter((x) => x?.name).map((x) => [String(x.name), x.value]);
  if (typeof p.jsonOutput === 'string') return [['json', p.jsonOutput]];
  return [];
}
// If / Filter tests -> Bob's If: { value, test, with, flip (the yes and no pins swap), why }.
const OPS = {
  equals: ['equals'], equal: ['equals'], notEquals: ['equals', true], notEqual: ['equals', true], contains: ['contains'], notContains: ['contains', true],
  empty: ['empty'], isEmpty: ['empty'], notEmpty: ['notEmpty'], isNotEmpty: ['notEmpty'], exists: ['notEmpty'], notExists: ['empty'],
  gt: ['more'], larger: ['more'], lt: ['less'], smaller: ['less'], gte: ['less', true], largerEqual: ['less', true], lte: ['more', true], smallerEqual: ['more', true],
  true: ['yes'], false: ['yes', true], startsWith: ['contains', false, 'starts with'], endsWith: ['contains', false, 'ends with'], regex: ['contains', false, 'matches a pattern'],
  notStartsWith: ['contains', true, 'doesn\'t start with'], notEndsWith: ['contains', true, 'doesn\'t end with'], notRegex: ['contains', true, 'doesn\'t match a pattern'], lengthEquals: ['equals', false, 'has a length of']
};
function oneCond(left, op, right, type) {
  let o = OPS[op];
  if (type === 'boolean' && op === 'equals') o = String(right) === 'false' ? ['yes', true] : ['yes'];
  if (!o) return { value: left, test: 'notEmpty', why: `Its test "${op}" isn't one Bob has, so it only checks the value isn't empty. Fix the If box.` };
  const [test, flip, near] = o;
  return { value: left, test, ...(['contains', 'equals', 'more', 'less'].includes(test) ? { with: right ?? '' } : {}), flip: Boolean(flip), why: near ? `Its test "${near}" became "contains". Check it.` : '' };
}
function conditions(p) {
  const c = p.conditions;
  if (Array.isArray(c?.conditions)) return c.conditions.map((x) => oneCond(x?.leftValue, x?.operator?.operation, x?.rightValue, x?.operator?.type));
  if (c && typeof c === 'object') return ['string', 'number', 'boolean', 'dateTime'].flatMap((k) => (Array.isArray(c[k]) ? c[k] : []).map((x) => oneCond(x?.value1, x?.operation || (k === 'boolean' ? 'equal' : 'equal'), x?.value2, k)));
  return [];
}
function switchRules(p) {
  if (Array.isArray(p.rules?.values)) return p.rules.values.flatMap((r, i) => { const cs = conditions(r); return cs.length ? [{ ...cs[0], out: i, ...(cs.length > 1 ? { why: 'A way with more than one test kept only its first test.' } : {}) }] : []; });
  if (Array.isArray(p.rules?.rules)) return p.rules.rules.map((r, i) => ({ ...oneCond(p.value1 ?? p.value ?? '', r?.operation || 'equal', r?.value2 ?? r?.value, p.dataType || 'string'), out: Number(r?.output ?? i) }));
  return [];
}
