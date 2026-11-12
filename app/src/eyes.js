// Eyes checks: Bob looks at a picture of the screen with his eyes brain (Settings, Brains, "Seeing pictures",
// cfg.models.eyes) and answers one question about it. Used by the Apps hand (after an action: "did it work?",
// and app_look's ask) and the Browser hand (the same two). Nothing new to download: any vision brain in the
// eyes slot does, and when none is equipped the check is skipped and the result says so.
//
// Setting: hands.eyesCheck ("Bob checks his work with his eyes", on). The check costs one picture and one short
// answer per action, about a second on a small brain, so it can be switched off in Settings, Hands.
import fs from 'node:fs';
import { handsSettings } from './hands-settings.js';

// Is there an eyes brain to check with, and is the setting on?
export const eyesModel = (cfg) => String(cfg?.models?.eyes || '').trim();
export const eyesOn = (cfg) => Boolean(eyesModel(cfg)) && handsSettings(cfg).eyesCheck !== false;
// Why a check can't happen right now, for the tool result (empty when it can).
export function eyesWhy(cfg) {
  if (!eyesModel(cfg)) return `no eyes brain is in its slot (Settings, Brains, "Seeing pictures"), so Bob can't check his work by looking; ${cfg?.userName || 'the user'} can equip a vision brain there`;
  if (handsSettings(cfg).eyesCheck === false) return '"Bob checks his work with his eyes" is off in Settings, Hands';
  return '';
}

// The question put to the eyes brain. expect = what should be true afterwards; ask = a free question.
export function eyesPrompt({ expect = '', ask = '' } = {}) {
  if (ask) return `This is a picture of a window on a computer screen. Answer this question about it in plain words, in at most three sentences, saying only what you can see: ${String(ask).slice(0, 400)}`;
  return `This is a picture of a window on a computer screen, taken right after an action. Is this true of what you see: "${String(expect).slice(0, 300)}"? Answer on the first line with exactly one word: yes, no or unsure. Then one short sentence saying what the picture shows that made you answer that.`;
}

// yes / no / unsure from the first word of the answer (null when the brain didn't follow the form).
export function eyesVerdict(text) {
  const m = String(text || '').trim().toLowerCase().match(/^\W*(yes|no|unsure|not sure)\b/);
  return m ? (m[1] === 'not sure' ? 'unsure' : m[1]) : null;
}

// Looks at the picture and answers. Returns { verdict, text, line } or { skipped: why }.
// brain: ensureModel, chatSafe, log, cfg (a Brain, or a test stand-in).
export async function eyesCheck(brain, { file, expect = '', ask = '' }, { emit = () => {}, signal } = {}) {
  const cfg = brain.cfg;
  const why = eyesWhy(cfg);
  if (why) return { skipped: why, line: `(Not checked by eye: ${why}.)` };
  if (!file || !fs.existsSync(file)) return { skipped: 'no picture', line: '(Not checked by eye: no picture of the window was taken.)' };
  const eyes = eyesModel(cfg);
  let reply;
  try {
    const sees = (await brain.ensureModel(eyes, emit, signal, 'eyes')) || eyes;
    brain.setState?.('thinking', ask ? 'Looking at the screen' : 'Checking the screen', sees);
    const r = await brain.chatSafe({ model: sees, signal, messages: [{ role: 'user', content: eyesPrompt({ expect, ask }), images: [fs.readFileSync(file).toString('base64')] }] }, { emit, who: 'eyes' });
    reply = String(r?.content || '').trim();
  } catch (e) {
    brain.log?.('hands', `eyes check failed: ${e.message}`);
    return { skipped: e.message, line: `(Not checked by eye: the eyes brain didn't answer: ${e.message}.)` };
  }
  if (!reply) return { skipped: 'empty answer', line: '(Not checked by eye: the eyes brain gave no answer.)' };
  if (ask) { brain.log?.('hands', `eyes: asked "${String(ask).slice(0, 80)}": ${reply.slice(0, 120)}`); return { verdict: null, text: reply, line: `Eyes (what Bob sees in the picture): ${reply.slice(0, 600)}` }; }
  const verdict = eyesVerdict(reply);
  const saw = reply.replace(/^\W*(yes|no|unsure|not sure)\b[\s.:,-]*/i, '').trim();
  brain.log?.('hands', `eyes check "${String(expect).slice(0, 80)}": ${verdict || 'unclear'} (${saw.slice(0, 120)})`);
  const line = verdict === 'yes' ? `Eyes check: yes, it looks right. ${saw}`.trim()
    : verdict === 'no' ? `Eyes check: NO, the screen doesn't show "${String(expect).slice(0, 120)}". ${saw} Look at the window again before doing anything else; don't repeat the same step blindly.`.trim()
    : `Eyes check: unsure. ${saw || reply.slice(0, 300)} Look at the window to be certain.`.trim();
  return { verdict, text: reply, line };
}
