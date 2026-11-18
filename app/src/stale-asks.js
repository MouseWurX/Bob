// Nov 18 (a 120B test, saved chat in the builder's notes): Bob answered an old ask instead of the newest message. The old
// ask's turn had been stopped with no answer, and the rented-brain card's hidden note "...Do what they asked." stayed in
// the chat after it. Before a new message goes in, the harness settles both: an old carry-on note goes, and an ask that
// never got an answer is marked so the brain leaves it alone. No imports, so the test can load it alone.
export const STOPPED_NOTE = '[Bob note, not from the user: the ask above was stopped before it got an answer. Don\'t do it now unless they ask for it again; answer their newest message.]';
const CARRY_ON = /^\[Bob note, not from the user:[\s\S]*\bDo what they asked\.\]$/;
const answered = (m) => m.role === 'assistant' && (String(m.content || '').trim() || (Array.isArray(m.tool_calls) && m.tool_calls.length));

// msgs: the chat before the new message goes in. Changes it in place; returns how many changes.
export function settleOld(msgs) {
  if (!Array.isArray(msgs)) return 0;
  let n = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m?.role === 'system' && m.hidden && CARRY_ON.test(String(m.content || '').trim())) { msgs.splice(i, 1); n++; }
  }
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i]?.role !== 'user') continue;
    let j = i + 1, got = false;
    for (; j < msgs.length && msgs[j]?.role !== 'user'; j++) if (answered(msgs[j])) got = true;
    if (got) continue;
    const marked = msgs.slice(i + 1, j).some((x) => x?.role === 'system' && x.content === STOPPED_NOTE);
    if (!marked) { msgs.splice(i + 1, 0, { role: 'system', content: STOPPED_NOTE, hidden: true }); n++; }
  }
  return n;
}
