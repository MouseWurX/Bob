// Nov 23 (the owner): GUPPI's records in the chat. One folded bubble per run of changes, a quip outside, the plain
// changes inside, kept after a reload, and never sent to a brain (Bob is never prompted by them).
import fs from 'node:fs';
import { guppiSwitch, guppiStop, keptRecord, guppiNotesOn, guppiListener, MAX_KEPT } from '../src/guppi-notes.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { QUIPS, quipFor, countLine } from '../public/guppi-bubble.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---- the words ----
const up = guppiSwitch({ from: 2048, to: 4096, seconds: 0.91, guess: 0.9, held: 32768, at: 1 });
check('a step up says what changed and why', up.kind === 'up' && /Reading step 2,048 → 4,096: a long read is coming/.test(up.lines[0]), up.lines[0]);
check('it says how long it took and that the chat was kept', /Took 0\.9 s \(guessed 0\.9 s\)\. The chat's 32,768 tokens were kept/.test(up.lines[1]));
const down = guppiSwitch({ from: 4096, to: 2048, seconds: 1.2, guess: 1 });
check('a step down: back to the chat step', down.kind === 'down' && /back to the chat step, which writes faster/.test(down.lines[0]));
check('nothing held: no line about keeping the chat', !/kept/.test(down.lines.join(' ')));
const win = guppiSwitch({ from: 2048, to: 2048, win: { from: 131072, to: 32768 }, cache: { from: 4000, to: 6000 }, seconds: 0.5, guess: 0.4 });
check('a window change, with the cache it fed', win.kind === 'window' && /Chat memory window 131,072 → 32,768 tokens: fitted to this chat/.test(win.lines[0]) && /Expert copy cache 4,000 → 6,000 MiB\./.test(win.lines[1]));
const cache = guppiSwitch({ from: 2048, to: 2048, cache: { from: 4000, to: 5000 } });
check('a cache grown for writing', cache.kind === 'cache' && /a long reply is expected/.test(cache.lines[0]));
check('a switch slower than guessed three times says he stops', guppiSwitch({ from: 2048, to: 4096, stopped: true }).kind === 'slow');
const stop = guppiStop('the engine can\'t change its step in place (404)');
check('turning himself off, in plain words', stop.kind === 'stop' && /GUPPI is off for this engine run: the engine can't change its step in place \(404\)\. Replies go ahead as usual\./.test(stop.lines[0]));
check('no tech names in the words (n_batch, ubatch, moe)', ![up, down, win, cache, stop].some((r) => /n_batch|ubatch|moe_|n_ctx/.test(r.lines.join(' '))));
check('kept form is the plain record only', JSON.stringify(Object.keys(keptRecord({ ...up, type: 'guppi', extra: 1 }))) === '["kind","lines","seconds","at"]');
check('on unless turned off', guppiNotesOn({}) && !guppiNotesOn({ guppiNotes: false }));

// ---- the quips ----
check('a single change gets a quip of its kind', QUIPS.up.includes(quipFor([up], 0).replace(/^GUPPI: /, '')));
check('changes in a row share one quip for several', QUIPS.many.includes(quipFor([up, down], 3).replace(/^GUPPI: /, '')));
check('a stop wins the quip', QUIPS.stop.includes(quipFor([up, stop], 1).replace(/^GUPPI: /, '')));
check('every quip says it is GUPPI', /^GUPPI: /.test(quipFor([down], 7)));
check('the quip for a saved bubble is the same every time', quipFor([up], 12345) === quipFor([up], 12345));
check('quips are short (a phone shows the line)', Object.values(QUIPS).flat().every((q) => q.length <= 70));
check('the count line', countLine([up, down]) === '2 changes · 2.1 s' && countLine([stop]) === '');
const all = Object.values(QUIPS).flat().join(' ') + read('public/guppi-bubble.js') + read('src/guppi-notes.js');
check('no book or series named anywhere', !/bobiverse|we are legion|book/i.test(all));

// ---- to the window and on the turn ----
const sent = [], turn = {};
const say = guppiListener((ev) => sent.push(ev), turn);
say(up); say(down);
check('each record goes to the window as a guppi event', sent.length === 2 && sent.every((e) => e.type === 'guppi'));
check('and is kept on the turn, for the answer', turn.guppi?.length === 2 && turn.guppi[0].lines[0] === up.lines[0]);
for (let i = 0; i < MAX_KEPT + 5; i++) say(up);
check('at most MAX_KEPT on one turn', turn.guppi.length === MAX_KEPT);

// ---- Bob is never prompted by them ----
const chat = [
  { role: 'user', content: 'read this long file' },
  { role: 'assistant', content: 'Done.', guppi: [keptRecord(up)], steps: [{ what: 'x' }] },
  { role: 'user', content: 'thanks' }
];
const wire = LlamaCpp.toOpenAI(chat);
check('what the brain is sent has no GUPPI record', !JSON.stringify(wire).includes('guppi') && !JSON.stringify(wire).includes('Reading step'));
check('the answer goes as role and content only', JSON.stringify(wire[1]) === JSON.stringify({ role: 'assistant', content: 'Done.' }));
const withTools = LlamaCpp.toOpenAI([{ role: 'assistant', content: '', guppi: [keptRecord(up)], tool_calls: [{ id: 'c1', function: { name: 'read_file', arguments: {} } }] }, { role: 'tool', tool_call_id: 'c1', content: 'ok', guppi: [keptRecord(up)] }]);
check('tool calls and results carry no GUPPI record either', !JSON.stringify(withTools).includes('guppi'));

// ---- the engine says each switch ----
{
  const got = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const fake = { url: 'http://x', port: 1, slotDir: '/nowhere', condState: {}, condStep: 2048, condWin: 0, condCacheBase: 0, condWinExtra: 0, condGrown: 0, condRead: LlamaCpp.prototype.condRead, log: () => {}, slotAction: async () => {}, guppiSay: (r) => got.push(r) };
  try {
    await LlamaCpp.prototype.condSwitch.call(fake, 'brain', 4096, 0);
    check('a switch the engine took is said once', got.length === 1 && got[0].kind === 'up' && got[0].type === 'guppi');
    const saw = [];
    const off = { condOff: '', log: () => {}, guppiSay: (r) => saw.push(r) };
    LlamaCpp.prototype.condStop.call(off, 'brain', 'it said no');
    LlamaCpp.prototype.condStop.call(off, 'brain', 'again');
    check('turning off is said once', saw.length === 1 && saw[0].kind === 'stop');
    const quiet = { ...fake, guppiSay: undefined, condStep: 4096 };
    await LlamaCpp.prototype.condSwitch.call(quiet, 'brain', 2048, 0);
    check('with no one listening (notes off, or outside a chat) the switch still goes ahead', quiet.condStep === 2048);
  } finally { globalThis.fetch = realFetch; }
}

// ---- wiring ----
const app = read('public/app.js');
check('the chat shows live records and saved ones', /case 'guppi':/.test(app) && /guppiBubbles\.saved\(m\.guppi\)/.test(app));
check('a run of changes shares the bubble just above', /prev\.records\.push/.test(read('public/guppi-bubble.js')));
check('no animation on his bubble', /think finished guppi/.test(read('public/guppi-bubble.js')));
check('the history keeps them on the answer', /guppi: m\.guppi/.test(read('src/brain-chats.js')) && /last\.guppi = /.test(read('src/brain-turns.js')));
check('the setting is saved and shown', /'guppiNotes'/.test(read('src/config.js')) && /guppiNotes: cfg\.guppiNotes !== false/.test(read('src/server.js')) && /sswitch\('guppiNotes'/.test(read('public/cellar-engines.js')));
const help = read('public/help-content.js');
check('Help: FAQ and glossary', /id: 'faq-guppi-notes'/.test(help) && /<dt>GUPPI<\/dt>/.test(help));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
