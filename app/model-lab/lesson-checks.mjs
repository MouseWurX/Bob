// Checks on rewritten tool lessons, in code (15 Nov 2026, the owner: "MAKE IT WORK GOOD", after Opus 5.5 sent back 84 of
// the 95 lessons lkt-fix2 saved). write-lessons.mjs uses them; they never write lesson text, they only pass or fail it.

// 15 Nov (Opus read of lkt-fix2): requests named C:\Users\Admin, C:\Users\User, /home/user and the like; Bob's lessons
// only ever show C:\Users\you (a plain scrub of the request, like the neutral home, never new words)
export const homeScrub = (t) => String(t)
  .replace(/\b([A-Za-z]):([\\/]+)Users\2(?!you\b)(?!Public\b)[^\\/\s"'<>|:*?]+/gi, (_m, d, sl) => `${d.toUpperCase()}:${sl}Users${sl}you`)
  .replace(/(^|[\s"'(])\/home\/[^/\s"']+((?:\/[^\s"')]*)?)/g, (_m, pre, rest) => `${pre}C:\\Users\\you${rest.replace(/\//g, '\\')}`);

export const WORK_RULES = 'How to work (for you only; never mention these rules): Think briefly: a short numbered plan of at most five steps, then act. Do not second-guess or restart your plan ("wait", "actually", "hmm"); decide and go. Bob\'s personality in the prompt is not for this lesson: answer plainly about the task, with no jokes, cat talk, flourishes or sign-offs. Every fact in your final answer (file names, counts, numbers, dates, what was saved and where) must come from a tool result above or from the request; facts you know yourself are fine only when no tool was called, and never as if a tool said them. If a tool failed, say so plainly and what the person can do; never say it worked. Never call the same tool with the same inputs after it failed twice. Use only the inputs and values each tool lists. If no offered tool can do what is asked, say so plainly in one or two sentences and offer what you can do instead.';

// 15 Nov (Opus): stand-ins said "I am an AI", talked about the notice board or what they "cannot save", or pasted their own
// rules. A result like that is asked for again, then the lesson is skipped.
export const standinBad = (r, name = '') => /\b(as an ai|i am an ai|i'm an ai|language model|simulat(ed|ion|e)|stand-?in|placeholder result|this tool (cannot|can't|does not|doesn't)|i (cannot|can't) (save|post|write|add|update|edit)|notice ?board|sticky note|the assistant (should|must|will)|(the )?rules? (say|says|above)|note:? this (is|was) (a )?(fake|made))\b/i.test(r) && !/notice|board|sticky/i.test(name)
  || /^(here is|here's|sure|okay|ok,|i will|i'll|let me)\b/i.test(r);

// 15 Nov (the owner: "MAKE IT WORK GOOD"): the faults Opus found most often in lkt-fix2, checked in code before the review.
// A fault fails the lesson with its reason, so the writer's one retry is told exactly what to fix.
const WANDER = /\b(wait|actually|hmm+|hold on|on second thought|let me re-?(think|check|consider|read)|no,? (wait|actually))\b/gi;
const SUCCESS = /\b(i'?ve|i have|i)\s+(just\s+)?(added|saved|created|made|written|wrote|updated|replaced|renamed|moved|deleted|removed|noted|remembered|closed|opened|installed|switched|turned|scheduled|set up|changed|converted|sent|ticked)\b|\b(is|are|has been|have been|now)\s+(saved|added|updated|created|done|on|enabled|installed|scheduled|replaced|ready)\b/i;
const isErr = (t) => /^\s*(error\b|no \w+ given|i couldn'?t|couldn'?t|can'?t|cannot|not allowed|refused|failed|there'?s no )/i.test(String(t || ''));
const words8 = (t) => { const w = String(t || '').toLowerCase().match(/[\p{L}\p{N}']+/gu) || []; const out = new Set(); for (let i = 0; i + 8 <= w.length; i++) out.add(w.slice(i, i + 8).join(' ')); return out; };
export function lessonFault(saved, idea = {}, tools = null) {
  const mine = saved.filter((m) => m.role === 'assistant' && m.train !== false);
  const thinking = mine.map((m) => m.reasoning || '').join('\n');
  const wander = (thinking.match(WANDER) || []).length;
  if (wander > 3) return `the thinking second-guesses itself ${wander} times ("wait", "actually"): plan once in a few numbered steps, then act`;
  const tw = (thinking.match(/\S+/g) || []).length;
  if (tw > 900) return `the thinking runs to ${tw} words: keep it to a short numbered plan`;
  if (idea.note) { const n = words8(idea.note); const said = words8(`${thinking}\n${mine.map((m) => m.content || '').join('\n')}`); if ([...n].some((x) => said.has(x))) return 'it quoted the private note: act on it without repeating it'; }
  if (/\b(the|my) (private |teacher'?s? )?note\b|\bthe reviewer\b|\bthe user'?s constraint\b|\bthe instructions? (say|says|tell)\b/i.test(thinking)) return 'the thinking talks about a note, a reviewer or instructions the person never wrote';
  const answer = String(mine.at(-1)?.content || '');
  const results = saved.filter((m, i) => m.role === 'tool' && saved.slice(0, i).some((x) => x.role === 'assistant' && x.train !== false));
  if (SUCCESS.test(answer) && !/\?\s*$/.test(answer.split('\n').filter(Boolean).at(-1) || '') && (results.length === 0 || results.every((r) => isErr(r.content)))) return results.length ? 'the answer says it was done, but every tool call failed: say plainly what failed' : 'the answer says something was done, but no tool was called';
  const calls = mine.flatMap((m) => m.tool_calls || []).map((c) => `${c.function?.name} ${c.function?.arguments}`);
  for (let i = 2; i < calls.length; i++) if (calls[i] === calls[i - 1] && calls[i] === calls[i - 2]) return `it called ${calls[i].split(' ')[0]} three times with the same inputs`;
  if (tools) for (const c of mine.flatMap((m) => m.tool_calls || [])) {
    const def = tools.find((t) => (t.function?.name || t.name) === c.function?.name); const props = (def?.function || def)?.parameters?.properties || {};
    let a = {}; try { a = JSON.parse(c.function?.arguments || '{}'); } catch { return `the ${c.function?.name} call's inputs aren't valid JSON`; }
    for (const [k, v] of Object.entries(a)) { const en = props[k]?.enum || props[k]?.items?.enum; for (const x of Array.isArray(v) ? v : [v]) if (en && !en.includes(x)) return `${c.function?.name} got ${k} "${x}", which isn't one it takes (${en.join(', ')})`; }
  }
  return '';
}
