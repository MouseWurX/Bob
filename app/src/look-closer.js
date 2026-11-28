// "Look closer before answering" (Nov 28, the owner: "Figure it out and test it"). Off unless turned on
// (cfg.lookCloser === true) until an A/B on Bob's held-out jobs shows it helps. Three causes of lost jobs, read from
// the to-do A/B of Nov 27 (Qwen3.6 35B and Qwen3.5 4B, 130 runs):
//   1. Web: Bob searched, never opened a page, and answered from the search snippets (35B: 7 of its 11 web runs;
//      several also called a site it didn't know "fake" or "a placeholder" without opening it).
//   2. Mail: "anything that looks like phishing in the last fortnight?" listed the newest 15 of 105 messages, and
//      Bob's own danger check only ran on those 15, so the dangerous ones further back were never seen.
//   3. A declined card: after "no" to trashing the scams, Bob's answer was only "Fair enough, what now?", and what he
//      had found (the scams themselves) was lost.
//   4. A call missing a field the tool needs (add_slide with no title) was answered with "try another way", so the
//      same bad call came three times. Now an error that names what's missing says "fix this call".
// All of it is code and short notes: nothing is added to the start of a job.

export const lookCloserOn = (cfg) => cfg?.lookCloser === true;

const SEARCHES = new Set(['web_search', 'news', 'search_news', 'deep_search']);
const READS = new Set(['fetch_page', 'open_url', 'browser_read', 'browser_open']);
const ok = (a) => a && a.ok !== false && !a.declined;

// (1) The end-of-turn check: searched, opened nothing, and answered. One more go, the same budget as the others.
export function snippetNudge({ actions = [], reply = '', who = 'the user', usable = () => true } = {}) {
  const said = String(reply || '').trim();
  if (!said || /\?\s*$/.test(said) || said.length < 60) return '';
  if (!actions.some((a) => ok(a) && SEARCHES.has(a.name))) return '';
  if (actions.some((a) => ok(a) && READS.has(a.name))) return '';
  if (!usable('fetch_page')) return '';
  return `You searched but never opened a page, so your answer rests on search snippets only. Open the best result (or two) with fetch_page now and answer from what the pages say; give the address you read. Don't call a site fake or a placeholder because you don't know it: open it first. If no page answers it, say plainly what you couldn't find.`;
}

// (2) Mail: Bob's danger check over every message in the range, not just the ones shown. Takes the rows the list
// fetched for the rest (uid, from, subject, danger) and gives one line for the brain, or ''.
export function moreDangerLine(rest = [], shown = 0, total = 0) {
  const flagged = rest.filter((m) => m?.danger?.length);
  const hidden = Math.max(0, total - shown);
  if (!hidden) return '';
  const lines = flagged.slice(0, 20).map((m) => `⚠️ id ${m.uid} looks dangerous: ${m.danger.join('; ')} (${String(m.from || '').slice(0, 60)} · ${String(m.subject || '').slice(0, 80)})`);
  return `Bob's checks also ran on the ${hidden} message${hidden === 1 ? '' : 's'} not shown: ${flagged.length ? `\n${lines.join('\n')}${flagged.length > 20 ? `\n(and ${flagged.length - 20} more)` : ''}` : 'no danger signs in their senders or subjects.'}\nFor a question about the whole period, look at those too (read one by its id, or list again with words or from).`;
}

// (3) The note a declined card gives back: keep what was found.
export const DECLINED_KEEP = 'The user said no to that step, so it was not done. Don\'t try it again or another way. Still give your whole answer: what you looked at and what you found, in full, then say that step wasn\'t done and ask what they\'d like instead.';

// (4) A call missing what the tool needs (Nov 28: the default brain left add_slide's title out, then Bob's "try one other
// way" line sent him to another tool, and he sent the same bad call three times). With the switch on, an error that
// says what's missing gets "fix this call" instead of "try another way".
const ARG_ERROR = /^Error: (?:[\w ]{1,30} needs |Which messages?\?|Give |Please give |How should |A bulk act needs |bulk needs |[A-Z]{1,3}\d* isn't a cell name|No changes given)/;
export const isArgError = (text) => ARG_ERROR.test(String(text || ''));
export const FIX_CALL_NUDGE = (name) => ` (This call was missing something ${name} needs, and the error says what. Call ${name} again now with that added; don't send the same call again and don't switch to another tool.)`;
