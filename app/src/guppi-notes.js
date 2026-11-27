// Nov 23 (the owner): GUPPI, the Governor of Unified Placement, Paging, and Inference (Settings, Engine tuning, the
// mode that lets him drive; off unless picked), puts each change he makes in the chat as a record that stays: one
// folded bubble per run of changes, a dry quip on the outside, the plain changes inside (public/guppi-bubble.js).
//
// Display only. The records go to the window (a 'guppi' event) and are kept on the answer they came before, for a
// reload, the same way the thinking bubble's steps are. They are never sent to a brain: LlamaCpp.toOpenAI sends only
// role, content, pictures and tool calls (test/run-guppi-notes-test.js checks it). Settings, Engine tuning,
// "GUPPI's notes in the chat" (cfg.guppiNotes, on unless turned off: the owner asked for it) hides them.

export const MAX_KEPT = 20; // records kept on one answer

export const guppiNotesOn = (cfg) => cfg?.guppiNotes !== false;

const secs = (s) => `${(Number(s) || 0).toFixed(1)} s`;
const num = (n) => Number(n || 0).toLocaleString('en');

// One switch, in plain words. from/to: the reading step before and after. win: { from, to } chat memory window in
// tokens, cache: { from, to } expert copy cache in MiB (either only when it changed). held: tokens of chat kept
// through the switch. stopped: switches came out slower than guessed three times in a row.
export function guppiSwitch({ from = 0, to = 0, seconds = 0, guess = 0, held = 0, win = null, cache = null, stopped = false, at = Date.now() } = {}) {
  const lines = [];
  let kind = '';
  if (from && to && from !== to) {
    kind = to > from ? 'up' : 'down';
    lines.push(to > from
      ? `Reading step ${num(from)} → ${num(to)}: a long read is coming, and a bigger step reads it faster.`
      : `Reading step ${num(from)} → ${num(to)}: back to the chat step, which writes faster.`);
  }
  if (win && win.to && win.from !== win.to) {
    kind ||= 'window';
    lines.push(`Chat memory window ${num(win.from)} → ${num(win.to)} tokens: ${win.to < win.from ? 'fitted to this chat, so the spare room goes to the expert copy cache' : 'the chat grew, so the window grows with it'}.`);
  }
  if (cache && cache.to >= 0 && cache.from !== cache.to) {
    kind ||= 'cache';
    lines.push(`Expert copy cache ${num(cache.from)} → ${num(cache.to)} MiB${win ? '' : cache.to > cache.from ? ': a long reply is expected, so writing gets more room' : ': back to the reading size'}.`);
  }
  if (!lines.length) { kind = 'same'; lines.push(`Checked the engine's settings at step ${num(to || from)}. Nothing needed changing.`); }
  lines.push(`Took ${secs(seconds)} (guessed ${secs(guess)}).${held > 0 ? ` The chat's ${num(held)} tokens were kept, so nothing is read twice.` : ''}`);
  if (stopped) { kind = 'slow'; lines.push('That was the third switch in a row slower than guessed, so no more switching for this brain until it loads again.'); }
  return { type: 'guppi', kind, lines, seconds: Math.round((Number(seconds) || 0) * 100) / 100, at };
}

// GUPPI turned himself off for this engine run (the engine refused, or MTP on an older engine).
export const guppiStop = (why, at = Date.now()) => ({ type: 'guppi', kind: 'stop', lines: [`GUPPI is off for this engine run: ${String(why || 'stopped')}. Replies go ahead as usual.`], seconds: 0, at });

// what is kept on an answer: the plain record, nothing else
export const keptRecord = (r) => ({ kind: String(r?.kind || ''), lines: [].concat(r?.lines || []).map(String).slice(0, 6), seconds: Number(r?.seconds) || 0, at: Number(r?.at) || 0 });

// Nov 23: GUPPI's record goes to the window now and on the turn (brain-turns.js keeps it on the answer for a reload)
export function guppiListener(emit, turn) {
  return (rec) => {
    try { emit({ ...rec, type: 'guppi' }); } catch {}
    if (turn) (turn.guppi ||= []).length < MAX_KEPT && turn.guppi.push(keptRecord(rec));
  };
}
