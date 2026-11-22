// 1.5.210 (the owner, Nov 12): the chat shows only Bob's finished answer, whole. Everything else he wrote on the
// way (lines before a tool, drafts that were sent back and tried again, the moot's second look, fixes and minutes)
// goes in the thinking bubble above it.
//
// Display only: nothing here goes to the brain. The turn's messages stay exactly as they were for the brain; this
// only adds `step: true` (and, when the reviewer's corrected answer replaced the draft, `showText`) for the window.
// The engines send only role and content, so these fields never reach a brain.
import { correctedPart } from './moot.js';
import { stripMarkers } from './answer-checks.js';

const said = (m) => m?.role === 'assistant' && String(m.content || '').trim() !== '';

// added: the messages this turn added. rounds: the moot's rounds (runMoot's return), if one ran.
// Returns { final, text, checked } (final is the message the chat shows; null when nothing was said).
export function pickAnswer(added = [], rounds = null) {
  const list = Array.isArray(added) ? added : [];
  const plain = [...list].reverse().find((m) => m?.role === 'assistant' && !m.tool_calls?.length && !m.moot && (said(m) || m.media?.length));
  let final = plain || [...list].reverse().find((m) => said(m) && !m.moot) || [...list].reverse().find(said) || null;
  let text = final ? String(final.content || '') : '';
  // The moot: a corrected answer that was kept takes the draft's place. Its check message is shown as that answer.
  const last = Array.isArray(rounds) ? [...rounds].reverse().find((r) => r?.kind === 'check') : null;
  if (last?.corrected) {
    const check = [...list].reverse().find((m) => m?.role === 'assistant' && m.moot === 'check' && /corrected answer:/i.test(String(m.content || '')));
    const fixed = check ? correctedPart(check.content).trim() : '';
    if (fixed.length >= 20) {
      if (final && final !== check && final.media?.length) check.media = [...(check.media || []), ...final.media].slice(0, 24);
      final = check; text = fixed; check.showText = fixed;
    }
  }
  const minutes = [...list].reverse().find((m) => m?.moot === 'minutes' && said(m));
  for (const m of list) {
    if (m === final || m?.role !== 'assistant') continue;
    if (said(m)) m.step = true;
  }
  if (final) delete final.step;
  // Nov 16 (GPT-OSS trial): its browsing markers (【1†L1-L3】) are taken out of the answer the chat shows
  if (final && /【\d/.test(text)) { text = stripMarkers(text); if (final.showText) final.showText = stripMarkers(final.showText); else final.content = stripMarkers(final.content); }
  // 17 Nov (after1: 7 of 94 mail runs): after the last step (no tools left) the answer was only a tool call written as
  // text ("<tool_call> <function=list_folder> ..."), shown as the reply. It never ran. The chat and the record get a
  // plain, honest line instead, so neither the user nor the next turn reads a call that never happened.
  if (final && bareTextCall(text)) {
    const line = unfinishedLine(text);
    text = line; final.content = line; if (final.showText) final.showText = line; final.textCall = true;
  } else if (final && XML_CALL.test(text)) {
    // 22 Nov (flashnext-tools read, repo1: 3 runs): words, then the call ("Let me try with a command argument:
    // <tool_call>...") passed the check above and the raw call was shown. The final answer's calls never ran, so the
    // call text comes out and a plain line says the next step didn't run. Only the XML forms: a JSON code sample in an
    // answer is left alone.
    const line = proseAndUnfinished(text);
    text = line; final.content = line; if (final.showText) final.showText = line; final.textCall = true;
  }
  return { final, text, checked: minutes ? String(minutes.content) : '' };
}

const CALL_BLOCK = /<tool_call>[\s\S]*?(?:<\/tool_call>|$)|<function=[\s\S]*?(?:<\/function>|$)|```(?:json)?\s*\{[\s\S]*?"name"\s*:[\s\S]*?```|<\|[\s\S]*$/g;
// A reply that is nothing but tool calls written as text (a few words around them at most).
export function bareTextCall(text) {
  const t = String(text || '').trim();
  if (!/<tool_call>|<function=|"name"\s*:\s*"[a-z_]+"\s*,\s*"arguments"|<\|(?:channel|call|start)\|?/.test(t)) return false;
  return t.replace(CALL_BLOCK, '').replace(/\s+/g, ' ').trim().length < 40;
}
const XML_CALL = /<tool_call>\s*<function=|<function=[\w.-]+>\s*<parameter=/;
const XML_BLOCK = /<tool_call>[\s\S]*?(?:<\/tool_call>|$)|<function=[\s\S]*?(?:<\/function>|$)/g;
// The words around an XML call written as text, without it, and one line saying that step never ran.
export function proseAndUnfinished(text) {
  const name = (String(text || '').match(/<function=([\w.-]+)>/) || [])[1];
  // "Let me run it:" / "Now let's run the tests:" just before the call is about a step that never happened
  const words = String(text || '').replace(XML_BLOCK, '').replace(/\s*(?:(?:Now|OK|Okay|So),?\s+)?(?:let me|let's|I'll|I will)\b[^.!?\n]*:\s*$/i, '').replace(/\n{3,}/g, '\n\n').trim();
  const line = `I didn't finish this: my next step${name ? ` (${name})` : ''} never ran, so it isn't done. Say "keep going" and I'll carry on.`;
  return words ? `${words}\n\n${line}` : line;
}
export function unfinishedLine(text) {
  const name = (String(text || '').match(/<function=([\w.-]+)>|"name"\s*:\s*"([a-z_]+)"/) || []).slice(1).find(Boolean);
  // 22 Nov: not "I ran out of steps": with steps as backstops, "found nothing new" ends a turn far more often
  return `I didn't finish this: I stopped while I was still looking${name ? ` (my next try, ${name}, never ran)` : ''}, so nothing was done. Tell me where to look, or say "keep going".`;
}
