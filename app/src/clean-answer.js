// 1.5.210 (the owner, Nov 12): the chat shows only Bob's finished answer, whole. Everything else he wrote on the
// way (lines before a tool, drafts that were sent back and tried again, the moot's second look, fixes and minutes)
// goes in the thinking bubble above it.
//
// Display only: nothing here goes to the brain. The turn's messages stay exactly as they were for the brain; this
// only adds `step: true` (and, when the reviewer's corrected answer replaced the draft, `showText`) for the window.
// The engines send only role and content, so these fields never reach a brain.
import { correctedPart } from './moot.js';

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
  return { final, text, checked: minutes ? String(minutes.content) : '' };
}
