// 1.5.52: some chat templates (Qwen 3.8, for one) refuse a system message anywhere but first:
// raise_exception('System message must be at the beginning'). Bob adds short system notes mid-chat (nudges, "Thinking
// time is up", the session-switch note), so for those brains the notes go in as the user's side instead: the first
// system message stays, later ones become "[Note from Bob's own system] ..." on a user turn, merged with a user turn
// right next to it so roles still alternate.
export const MID_SYSTEM_REFUSED = /system message must be at the beginning|system message.{0,40}(only|first|beginning)/i;
export function foldSystem(messages) {
  const out = [];
  let seenOther = false;
  for (const m of messages || []) {
    if (m.role === 'system' && !seenOther) {
      const first = out[0];
      if (first?.role === 'system') out[0] = { ...first, content: `${first.content || ''}\n\n${m.content || ''}`.trim() };
      else out.push(m);
      continue;
    }
    seenOther = true;
    const msg = m.role === 'system' ? { role: 'user', content: `[Note from Bob's own system] ${m.content || ''}` } : m;
    const prev = out[out.length - 1];
    const plain = (x) => x?.role === 'user' && typeof x.content === 'string' && !x.images?.length;
    if (plain(prev) && plain(msg)) out[out.length - 1] = { ...prev, content: `${prev.content}\n\n${msg.content}` };
    else out.push(msg);
  }
  return out;
}
