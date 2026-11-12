// Item 241 (Nov 12): replay tests from real records. A saved chat already holds a whole turn: what was asked, each
// reply the brain gave (its words and tool calls) and each tool's result. tapeFrom() cuts one turn out as a "tape";
// replaying it feeds the same replies and results back through Bob's real loop with no brain and no tools, so a loop
// change can be checked against turns that really happened. "Save as a test" (my-tests.js) keeps a tape with each
// case, so the owner's own saved mistakes become replay tests too; test/replays/ holds the ones that ship.
// Pure: no files, no brain.
export const TAPE_RESULT_MAX = 2000; // characters kept of each tool result
export const TAPE_MAX_REPLIES = 40;

const said = (m) => String(m?.text ?? m?.content ?? '');
const argsOf = (a) => { if (a && typeof a === 'object') return a; try { return JSON.parse(String(a ?? '') || '{}'); } catch { return String(a ?? ''); } };

// messages: a chat's messages; id: the id of Bob's answer that ends the turn (or the last answer when left out).
// Returns { ask, replies: [{ content, calls: [{ name, args }] }], results: [{ name, text }], answer } or null.
export function tapeFrom(messages, id = null) {
  const list = Array.isArray(messages) ? messages : [];
  let at = id ? list.findIndex((m) => m.id === id && m.role === 'assistant') : -1;
  if (!id) for (let i = list.length - 1; i >= 0; i--) if (list[i].role === 'assistant' && !list[i].tool_calls?.length) { at = i; break; }
  if (at < 0) return null;
  let q = at - 1;
  while (q >= 0 && list[q].role !== 'user') q--;
  if (q < 0 || !said(list[q]).trim()) return null;
  const turn = list.slice(q + 1, at + 1).filter((m) => !m.hidden && m.role !== 'system');
  const replies = [], results = [];
  for (const m of turn) {
    if (m.role === 'assistant') replies.push({ content: String(m.content || ''), calls: (m.tool_calls || []).map((c) => ({ name: String(c.function?.name || ''), args: argsOf(c.function?.arguments) })) });
    else if (m.role === 'tool') results.push({ name: String(m.tool_name || m.name || ''), text: String(m.content ?? '').slice(0, TAPE_RESULT_MAX) });
  }
  if (!replies.length) return null;
  return { ask: said(list[q]).slice(0, 4000), replies: replies.slice(0, TAPE_MAX_REPLIES), results, answer: said(list[at]).slice(0, 1500) };
}

// The brain's side of a replay: each request gets the next recorded reply, shaped as the engine returns it.
export function tapeEngine(tape) {
  const replies = [...(tape?.replies || [])];
  let asked = 0;
  return {
    asked: () => asked,
    left: () => replies.length,
    next() {
      asked++;
      const r = replies.shift();
      if (!r) return { role: 'assistant', content: '' }; // the loop asked more often than the record: an empty reply
      return { role: 'assistant', content: r.content, ...(r.calls?.length ? { tool_calls: r.calls.map((c) => ({ function: { name: c.name, arguments: c.args } })) } : {}) };
    }
  };
}

// The tools' side: each call gets the next recorded result for that tool. A call the record doesn't have is noted.
export function tapeTools(tape) {
  const left = [...(tape?.results || [])];
  const ran = [], missing = [];
  return {
    ran, missing,
    run(name) {
      ran.push(name);
      const i = left.findIndex((r) => r.name === name);
      if (i < 0) { missing.push(name); return { text: `Error: ${name} has no recorded result in this replay.` }; }
      return { text: left.splice(i, 1)[0].text };
    }
  };
}
