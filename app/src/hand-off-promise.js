// Nov 18: Hands off, and Bob promised the job anyway ("I'll create the folder... 📝 Noted") with nothing done. The
// prompt already tells him which Hands are off; a brain can still miss it. So the harness checks, not the brain:
// when the ask needs a Hand that's off and his reply says he'll do it, the Switch it on card goes up and he says
// plainly that it isn't done. No imports, so the test can load it alone.

// What the ask needs, by its words. Only the two Hands a plain file or script job needs.
const RUN = /\b(?:run|execute|launch|start)\b[^.?!\n]{0,60}\b(?:script|program|command|it|them|\.py|\.bat|\.cmd|\.ps1|\.sh|\.exe|python|node|powershell)\b|\b(?:python|node|powershell)\s+\S+\.(?:py|js|ps1)\b/i;
const FILES = /\b(?:make|create|new|move|copy|rename|zip|unzip|organi[sz]e|tidy|sort out|clean up)\b[^.?!\n]{0,60}\b(?:folders?|director(?:y|ies)|files)\b/i;
// He says he'll do it, anywhere in the reply (the 📝 Noted line hides the promise from the end-of-reply check).
const WILL = /\b(?:i(?:'ll| will| am going to|'m going to)|let me|i'?m (?:now )?(?:going to|about to)|first,? i'?ll)\b[^.!?\n]{0,80}?\b(?:create|make|add|write|save|run|execute|move|copy|rename|zip|unzip|put|set up|start)\b/i;
// He already told the truth about it.
const TOLD = /\bHands?\b[^.\n]{0,60}\b(?:off|turned off|switched off|not on)\b|\bSwitch it on\b|\bcan(?:no|')t (?:do|run|create|make|touch)\b/i;

// ask: what the user wrote. reply: Bob's words. usable(tool): is that tool his now. Returns 'hand:run', 'hand:files' or ''.
export function handOffPromise({ ask = '', reply = '', usable = () => true } = {}) {
  const said = String(reply || '').replace(/📝 Noted:[^\n]*/g, ' ');
  if (!WILL.test(said) || TOLD.test(said)) return '';
  const a = String(ask || '');
  if (RUN.test(a) && !usable('run_command')) return 'hand:run';
  if (FILES.test(a) && !usable('file_hands') && !usable('write_file')) return 'hand:files';
  return '';
}

export const HAND_OFF_LINE = (name) => `\n\n✋ Correction: I haven't done any of that, and I can't yet. "${name}" is off, so I have no way to do it on this replicant matrix. Press **Switch it on** on the card below and I'll carry on.`;
export const HAND_OFF_LOG = (what) => `Bob promised a job that needs ${what}, which is off; showed the Switch it on card and said so`;
