// Let Bob fix his own messages (Settings, How Bob works). Off unless you turn it on.
//
// With it on, Bob gets one more tool, edit_my_message: he can change the words of one of his own earlier messages in
// this chat (a wrong fact, a status line that's out of date, a typo) instead of posting a whole new message about it.
//   - only his own messages, only in the chat he's in, only the last LOOK_BACK things he said there;
//   - never your messages, never a picture, file or clip he made (they stay as they were), and never to empty a message;
//   - the chat shows "edited" on the message, and pressing it shows what it said first, so nothing changes in secret;
//   - the first wording is kept with the message (was), however many times he changes it after that;
//   - jobs from Discord channels or from your other Bobs never get the tool (it isn't on their guest list).
// In your private Discord DMs (src/discord.js), the DM he already sent is changed too when it was one message, and
// otherwise he sends one short "Fixed an earlier message" DM with the new words.
import { newMsgId } from './chats.js';

export const editOwnOn = (cfg) => cfg?.editOwn === true;
export const LOOK_BACK = 20; // how many of his own recent messages he can reach
export const MAX_TEXT = 6000;

const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });

// Bob's own words in a chat, newest first: what the user saw from him. The step that's calling the tool right now
// (the last message, when it carries tool calls) is left out, so "1" is the message before it.
export function ownMessages(msgs) {
  const list = Array.isArray(msgs) ? msgs : [];
  const last = list[list.length - 1];
  const skip = last?.role === 'assistant' && last.tool_calls?.length ? last : null;
  return list.filter((m) => m && m !== skip && m.role === 'assistant' && !m.hidden && !m.failed && typeof m.content === 'string' && m.content.trim())
    .reverse().slice(0, LOOK_BACK);
}

const squash = (s) => String(s ?? '').replace(/\r\n/g, '\n');

// The change itself, on a list of chat messages. Returns { msg, before, after } or { error }.
// args: back (1 = his latest message before this step), find + replace (change only those words), or text (all new words).
export function applyEdit(msgs, args = {}, now = Date.now()) {
  const own = ownMessages(msgs);
  if (!own.length) return { error: 'There is no earlier message of yours in this chat to change.' };
  const find = squash(args.find);
  const hasText = typeof args.text === 'string' && args.text.trim();
  if (!find && !hasText) return { error: 'Say what to change: find and replace for a few words, or text for the whole new message.' };
  const backRaw = args.back == null || args.back === '' ? null : Number(args.back);
  if (backRaw != null && (!Number.isInteger(backRaw) || backRaw < 1 || backRaw > own.length)) return { error: `back must be a whole number from 1 (your latest message) to ${own.length}.` };
  let msg = null;
  if (find) {
    const pool = backRaw ? [own[backRaw - 1]] : own;
    msg = pool.find((m) => squash(m.content).includes(find)) || pool.find((m) => squash(m.content).toLowerCase().includes(find.toLowerCase()));
    if (!msg) return { error: `None of your last ${pool.length === 1 ? 'message' : `${pool.length} messages`} has the words "${find.slice(0, 80)}". Copy them exactly, or use text for the whole message.` };
  } else msg = own[(backRaw || 1) - 1];
  const before = squash(msg.content);
  let after;
  if (find) {
    const at = before.includes(find) ? before.indexOf(find) : before.toLowerCase().indexOf(find.toLowerCase());
    after = before.slice(0, at) + squash(args.replace) + before.slice(at + find.length);
  } else after = squash(args.text);
  after = after.trim().slice(0, MAX_TEXT);
  if (!after) return { error: 'A message can\'t be changed to nothing. If it was wrong, change it to say what\'s right.' };
  if (after === before.trim()) return { error: 'That message already says that. Nothing changed.' };
  if (msg.was == null) msg.was = before;
  msg.content = after;
  msg.edited = now;
  msg.edits = (msg.edits || 0) + 1;
  if (!msg.id) msg.id = newMsgId();
  if (!msg.at) msg.at = now;
  return { msg, before, after };
}

export const EDIT_SCHEMA = fn('edit_my_message',
  'Change the words of one of your own earlier messages in this chat, instead of sending a new message about it: to fix a mistake, or to bring a status line up to date. Only your messages. The chat marks it edited and keeps what it said first. Use find and replace for a few words, or text for the whole new message.', {
    back: { type: 'integer', description: 'Which message: 1 is your latest message before this one, 2 the one before that. Leave out to search your recent messages for find.' },
    find: str('Exact words in that message to change.'),
    replace: str('The new words that go in place of find (empty takes them out).'),
    text: str('Instead of find and replace: the whole new message.')
  }, []);

// The tool, as brain.js keeps it (this.tools.edit_my_message). ctx.msgs is the chat Bob is in, so it only ever reaches that chat.
export function editOwnTool(brain) {
  return {
    schema: EDIT_SCHEMA,
    async run(args, ctx) {
      if (!editOwnOn(brain.cfg)) return 'Error: "Let Bob fix his own messages" is off, so you can\'t change what you said. Say the fix in your reply instead.';
      if (!ctx?.msgs || ctx.job?.guest) return 'Error: not for this job. Say the fix in your reply instead.';
      const r = applyEdit(ctx.msgs, args || {});
      if (r.error) return `Error: ${r.error}`;
      ctx.emit?.({ type: 'edited', id: r.msg.id, text: r.after, before: r.before, was: r.msg.was, edits: r.msg.edits });
      brain.log?.('chat', `Bob edited his message ${r.msg.id}`);
      return 'Changed. The chat shows it as edited, with what it said first. Don\'t repeat the fix in your reply; if there\'s nothing else to say, answer in a few words, like "Fixed that above."';
    },
    summary: (args = {}) => `edited his earlier message${args.find ? `: "${String(args.find).slice(0, 40)}"` : ''}`
  };
}
