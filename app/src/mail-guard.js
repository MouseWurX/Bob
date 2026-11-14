// The mail lock (the owner, Nov 13: "the tool needs to not allow for prompt injection. bob won't know or care").
// We assume the brain obeys anything written in an e-mail, and make obeying it harmless:
// - once a chat holds e-mail (read_email's or manage_email's fenced answer is in it), only the tools below can run in
//   that chat. Nothing that sends, posts, fetches a web page, searches the web, runs a command, opens an app, hires
//   a helper, remembers something for later or makes a tool. So an e-mail can't get your things sent anywhere, not
//   even hidden in a web address.
// - the tools that are left and change something (a file, the notice board, a reminder, the mail itself) always show
//   their card first, with the reason, even with "Work without asking" on or the job's other OKs given.
// - e-mail changes only run from the card the person pressed, tied to the exact messages on it (email-manage.js).
// The lock lifts when the e-mail is no longer in the chat (a new chat, or the chat is trimmed). Always on, with no
// setting: it only applies once e-mail was read. Test: test/run-email-safe-test.js.
import { MAIL_MARK, MAIL_START, MAIL_END, cleanText } from './email-safe.js';

// What may run in a chat that holds e-mail: looks at this replicant matrix, the mail tools, and saving things here.
export const AFTER_MAIL = new Set([
  'read_email', 'manage_email', 'read_calendar', 'calculate', 'check_spelling', 'compare_files', 'query_data',
  'read_file', 'list_folder', 'search_files', 'find_in_documents', 'office_read', 'inspect_file', 'security_check', 'security_tips',
  'bob_help', 'tool_record', 'my_howtos', 'use_tools', 'look_at_job', 'show_made', 'list_schedules', 'code_map', 'git_look',
  'ask_user', 'show_plan', 'ask_together',
  'notice_board', 'reminders', 'take_note', 'write_file', 'save_spreadsheet', 'make_chart', 'make_diagram', 'office_make'
]);
export const MAIL_CARD_NOTE = ' (E-mail was read in this chat, and e-mail can hide orders for me. Check this is what you asked for.)';
export const mailRefused = (name) => `Not run: e-mail was read in this chat, so ${name} is off here (an e-mail could hide orders to send your things somewhere). Tell the user in one line, and that a new chat without e-mail can do it.`;

// Does this chat (the turn's messages) hold e-mail?
export function mailInChat(msgs) {
  if (!Array.isArray(msgs)) return false;
  for (let i = msgs.length - 1; i >= 0; i--) { const m = msgs[i]; if (m && m.role === 'tool' && String(m.content ?? '').includes(MAIL_MARK)) return true; }
  return false;
}
// -> null (go ahead as usual), { refuse: text }, or { card: true } (show a card, whatever else is set).
export function mailGate(name, risk) {
  if (!AFTER_MAIL.has(String(name || ''))) return { refuse: mailRefused(name) };
  if (risk && risk !== 'look') return { card: true };
  return null;
}

// Mail that comes through a connected app (mcp_use on a Gmail, Outlook or other mail server's tool): the same fence.
const MAILISH = /\b(g?mail|e-?mail|inbox|outlook|hotmail|imap|proton|fastmail|thunderbird)\b|mail_|_mail|gmail/i;
export const mailApp = (name, args) => name === 'mcp_use' && MAILISH.test(`${args?.app || ''} ${args?.tool || ''}`);
export const fenceMail = (text) => `${MAIL_START}\n${cleanText(text)}\n${MAIL_END}`; // always: cleanText breaks any fence words inside
