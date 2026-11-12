// What each tool risks, in one place (reliability items 165-180, Nov 12). The loop rules, the retry check, the
// restart rules and the per-tool time limits all read this table, so they can't drift apart.
//   risk 'look'   reads and changes nothing (can run side by side, and isn't an action)
//        'change' changes something on this replicant matrix (files, settings, apps, notes)
//        'send'   sends something out (a connected app, a paid helper, another Bob)
//   again    safe to run twice: it makes a new file or writes the same thing again (retries and restarts may redo it)
//   volatile a look whose answer can change between calls (a window, the schedules), so it is never a "repeat"
//   waits    waits on a person or runs a whole job of its own: no per-tool time limit (the turn's own limits apply)
//   own      has its own time limit in Settings, Hands; the backstop sits a little above it
//   half     can be left half done when Bob is closed mid-way: a restart waits for Carry on instead of redoing it
//   min      the per-tool time limit in minutes, when it isn't the default for its risk
// A tool can also say it itself: { risk, again, volatile, waits, own, half, min } on the tool object wins over this table.
// No model calls in here, and nothing here is read by the brain.

export const TOOL_KINDS = {
  // Looks
  list_folder: { risk: 'look' }, read_file: { risk: 'look' }, git_look: { risk: 'look' }, code_map: { risk: 'look' },
  search_files: { risk: 'look' }, find_in_documents: { risk: 'look' }, bob_help: { risk: 'look' },
  web_search: { risk: 'look' }, fetch_page: { risk: 'look' }, workshop_list: { risk: 'look' },
  mcp_tools: { risk: 'look' }, pack_tools: { risk: 'look' }, my_howtos: { risk: 'look' }, use_tools: { risk: 'look' },
  office_read: { risk: 'look', min: 10 }, security_check: { risk: 'look' }, inspect_file: { risk: 'look' },
  osint_lookup: { risk: 'look' }, check_exposure: { risk: 'look' }, security_tips: { risk: 'look' }, show_made: { risk: 'look' },
  app_look: { risk: 'look', volatile: true, own: true, half: true }, list_schedules: { risk: 'look', volatile: true },
  browser_read: { risk: 'look', own: true }, look_at_job: { risk: 'look' },
  ask_user: { risk: 'look', waits: true },
  // Changes that are safe to run again (a new file each time, or the same content written again)
  write_file: { risk: 'change', again: true }, save_spreadsheet: { risk: 'change', again: true },
  save_reference: { risk: 'change', again: true }, save_as: { risk: 'change', again: true, min: 30 },
  make_image: { risk: 'change', again: true, min: 60 }, make_video: { risk: 'change', again: true, min: 90 },
  make_music: { risk: 'change', again: true, min: 60 }, make_sound: { risk: 'change', again: true, min: 30 },
  workshop_run: { risk: 'change', again: true, min: 90 }, make_diagram: { risk: 'change', again: true },
  make_3d_part: { risk: 'change', again: true, min: 30 }, make_3d_model: { risk: 'change', again: true, min: 90 },
  office_make: { risk: 'change', again: true, min: 30 }, convert_file: { risk: 'change', again: true, min: 60 },
  save_howto: { risk: 'change', again: true }, run_in_sandbox: { risk: 'change', again: true },
  // Changes that may be left half done, or do something new each time
  edit_file: { risk: 'change', half: true }, office_edit: { risk: 'change', half: true, min: 30 }, file_hands: { risk: 'change', half: true, min: 60 },
  undo_files: { risk: 'change', half: true, min: 60 }, sort_files: { risk: 'change', half: true, min: 60 }, strip_metadata: { risk: 'change' },
  defender_scan: { risk: 'change', min: 120 }, forget_topic: { risk: 'change' }, remember: { risk: 'change' },
  reminders: { risk: 'change' }, notice_board: { risk: 'change' }, take_note: { risk: 'change' },
  spending_sheet: { risk: 'change' }, edit_my_message: { risk: 'change' }, pick_session: { risk: 'change' },
  schedule_job: { risk: 'change', half: true }, change_schedule: { risk: 'change', half: true }, make_tool: { risk: 'change' },
  my_tools: { risk: 'change' }, use_my_tool: { risk: 'change', own: true }, use_pack_tool: { risk: 'change', own: true },
  run_command: { risk: 'change', half: true, own: true }, run_recipe: { risk: 'change', half: true, own: true },
  open_app: { risk: 'change', own: true }, app_act: { risk: 'change', half: true, own: true },
  browser_open: { risk: 'change', own: true }, browser_act: { risk: 'change', own: true },
  // Sends
  mcp_use: { risk: 'send', half: true, own: true }, pass_note: { risk: 'send' },
  // Waits on a person, or runs a whole job of its own
  show_plan: { risk: 'look', waits: true }, ask_together: { risk: 'look', waits: true }, offer_setup: { risk: 'look', waits: true },
  ask_specialist: { risk: 'change', waits: true }, work_on_repo: { risk: 'change', waits: true },
  hire_brain: { risk: 'send', waits: true }, ask_cloud: { risk: 'send', waits: true }, pack_job: { risk: 'change', waits: true }
};

// A tool nobody has put in the table is treated as a change that isn't safe to repeat: the careful default.
const UNKNOWN = { risk: 'change' };
export function kindOf(name, tool) {
  const base = TOOL_KINDS[name] || UNKNOWN;
  if (!tool) return base;
  const own = {};
  for (const k of ['risk', 'again', 'volatile', 'waits', 'own', 'half', 'min']) if (tool[k] !== undefined) own[k] = tool[k];
  return Object.keys(own).length ? { ...base, ...own } : base;
}
export const riskOf = (name, tool) => kindOf(name, tool).risk;
export const isReadOnly = (name, tool) => riskOf(name, tool) === 'look';
export const repeatSafe = (name, tool) => { const k = kindOf(name, tool); return k.risk === 'look' || Boolean(k.again); };
export const isVolatile = (name, tool) => Boolean(kindOf(name, tool).volatile);
export const isKnown = (name) => Object.prototype.hasOwnProperty.call(TOOL_KINDS, name);

// Restarts (handoff.js): a tool that changes something isn't redone blindly, and one that can be left half done
// makes the job wait for Carry on. Kept as { test } so older callers that used the regexes still work.
export const SIDE_EFFECT = { test: (name) => !isReadOnly(name) };
export const WAIT_IF_CUT = { test: (name) => !isKnown(name) || Boolean(kindOf(name).half) };

// 175: every tool has a time limit of its own. Looks: 5 minutes. Changes and sends: 15. Tools with their own limit
// in Settings, Hands: that plus 2. Tools that wait on a person or run a job of their own: none (0).
export const LOOK_MIN = 5, CHANGE_MIN = 15;
export function limitMs(name, tool, { ownMin = 0 } = {}) {
  const k = kindOf(name, tool);
  if (k.waits) return 0;
  let min = k.min || (k.risk === 'look' ? LOOK_MIN : CHANGE_MIN);
  if (k.own && ownMin > 0) min = Math.max(min, ownMin + 2);
  return min * 60_000;
}

// 168: a result is cut where it's made, not after it has filled memory. The start and the end are kept (a
// command's error is usually at the end).
export const RESULT_CAP = 48_000;
export function capResult(text, cap = RESULT_CAP) {
  const s = String(text ?? '');
  if (s.length <= cap) return { text: s, cut: 0 };
  const head = Math.floor(cap / 3), tail = cap - head;
  const cut = s.length - head - tail;
  return { text: `${s.slice(0, head)}\n[... ${cut.toLocaleString('en')} characters cut from the middle ...]\n${s.slice(-tail)}`, cut };
}

// 169: tools hand back text. Anything else is turned into text here, so a broken tool can't send junk to the brain.
// fixed: what was wrong (for the log), or ''.
export function cleanResult(value) {
  if (typeof value === 'string') {
    // NUL and other control characters (not tabs or new lines) break some chat templates.
    const t = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    return { text: t, fixed: t.length !== value.length ? 'control characters taken out' : '' };
  }
  if (value === undefined || value === null) return { text: '', fixed: `gave back ${value === null ? 'null' : 'undefined'}` };
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return { text: String(value), fixed: '' };
  if (typeof value === 'object' && typeof value.text === 'string') return { ...cleanResult(value.text), fixed: 'gave back an object with text' };
  try { return { text: JSON.stringify(value).slice(0, RESULT_CAP), fixed: 'gave back an object, not text' }; } catch { return { text: '', fixed: 'gave back something that is not text' }; }
}

// 178: a tool that gives back nothing says so in one fixed form. A look that finds nothing found nothing; an
// action that says nothing can't be told to have worked (verify.js says that one).
export const NOTHING_FOUND = (name) => `(No result: ${name} ran and found nothing.)`;
export const isNothingFound = (text) => /^\(No result: [\w.-]+ ran and found nothing\.\)$/.test(String(text || ''));

// 167: a result says ok or failed in a field. Older results (saved chats) only have the words, so those are read
// as before.
export const failedResult = (m) => (m && typeof m === 'object' && typeof m.ok === 'boolean' ? !m.ok : /^Error:/.test(String(m?.content ?? m?.text ?? m ?? '')));

// 165/166: each call keeps an id, and each result names the call it answers. The engine's own id is kept when it
// sent one; otherwise one is made once and kept, so the same chat reads the same way on every request.
let seq = 0;
export const newCallId = () => `call_${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export function giveIds(calls) {
  for (const c of calls || []) if (c && typeof c === 'object' && !(typeof c.id === 'string' && c.id)) c.id = newCallId();
  return calls;
}
// The tool message for one call's result. ok: true, false or undefined (not known).
export function toolMessage(call, text, ok) {
  const m = { role: 'tool', tool_name: call?.function?.name, content: text };
  if (call?.id) m.tool_call_id = call.id;
  if (typeof ok === 'boolean') m.ok = ok;
  return m;
}

// 173: a call to a tool this step can't offer. Looks still run (they change nothing); anything else goes back with one line.
export const NOT_OFFERED = (name) => `(Not run: ${name} isn't offered here. Use one of the tools you were given.)`;
export const NOT_FOR_JOB = (name) => `(Not run: ${name} isn't one of the tools for this job.)`;

// 171: after a restart, the last action that finished before Bob was closed (from the job's saved steps), with its
// inputs, so the same call asked for again first thing hands back its result. null when there is none, or when its
// inputs were cut short when saved (then there's no sure key).
export function lastFinished(before, tools = {}) {
  const a = [...(before || [])].reverse().find((x) => x && x.name && !isReadOnly(x.name, tools[x.name]));
  if (!a) return null;
  try { const args = JSON.parse(a.args || '{}'); return { name: a.name, args, text: String(a.text || 'done') }; } catch { return null; }
}
