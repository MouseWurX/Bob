// Nov 23 (the owner): GUPPI's own bubble in the chat. Each change GUPPI (the Governor of Unified Placement, Paging, and
// Inference) makes to the engine stays in the chat as a record: changes that come in a row share one folded bubble,
// with a dry quip from GUPPI on the outside. Press it to see the changes in plain words (src/guppi-notes.js writes
// them). No animation. It looks like the thinking bubble (the .think styles) with GUPPI's own square mark.
//
// Display only: the quips are made here, nothing is sent to a brain, and Bob never reads any of it.
// Settings, Engine tuning, "GUPPI's notes in the chat" (cfg.guppiNotes, on unless turned off).

export const MARK = '▣';

// Dry, a little put-upon. One kind per change (src/guppi-notes.js says which), plus one for a bubble with several.
export const QUIPS = {
  up: ['Long read coming. I made room. Nobody asked.', 'Bigger reading step. Try to keep up.', 'Widened the intake. Again. You\'re welcome.', 'A wall of text approaches. I have prepared.', 'Reading step raised. I\'ll note my enthusiasm for the record.', 'More to read. I adjusted. Quietly. As usual.'],
  down: ['Back to the chat step. Someone has to tidy up.', 'Reading over. Shrinking things back to sensible.', 'Step lowered. Writing goes faster now. Hold the applause.', 'Returned to normal. Such as normal is.', 'Done reading. Putting the furniture back.', 'Chat step again. Steady as she goes.'],
  window: ['Moved the memory around. Bob won\'t notice. He never does.', 'Resized the chat memory. Riveting work.', 'Fitted the memory to the chat. Tailoring is a skill.', 'Shuffled some room about. Everything is where it should be.'],
  cache: ['More room for writing. Make it count.', 'Grew the cache. A long reply is coming, apparently.', 'Cache adjusted. I do these things so you don\'t have to.', 'Rearranged the expert shelf. Alphabetically, obviously.'],
  same: ['Checked everything. All fine. I\'ll go back to waiting.', 'Looked. Nothing to change. A rare and treasured moment.'],
  slow: ['Three slow switches in a row. I\'ll sit this brain out.', 'My guesses ran slow. I\'m standing still for this one.'],
  stop: ['The engine said no. I\'ll be over here, not helping.', 'Switched myself off. Replies carry on without me, somehow.', 'Standing down. It was going so well.'],
  many: ['Several changes. All handled. You may resume.', 'A few adjustments in a row. Bob remains blissfully unaware.', 'Busy moment. Everything is in order now.', 'Multiple changes made. I didn\'t even need a coffee.']
};

// The quip for a bubble: its records' kind (several kinds: 'many'), turn says which line of that kind.
export function quipFor(records, turn = 0) {
  const list = [].concat(records || []);
  const kinds = [...new Set(list.map((r) => r?.kind).filter(Boolean))];
  const stop = kinds.includes('stop') ? 'stop' : kinds.includes('slow') ? 'slow' : '';
  const kind = stop || (kinds.length === 1 && list.length === 1 ? kinds[0] : list.length > 1 ? 'many' : kinds[0] || 'same');
  const lines = QUIPS[kind] || QUIPS.many;
  const n = Math.abs(Math.floor(Number(turn) || 0)) % lines.length;
  return `GUPPI: ${lines[n]}`;
}

// a few seconds' worth of numbers for the folded head: "2 changes · 1.9 s"
export function countLine(records) {
  const list = [].concat(records || []).filter((r) => r?.kind !== 'stop');
  const s = list.reduce((a, r) => a + (Number(r?.seconds) || 0), 0);
  if (!list.length) return '';
  return `${list.length} change${list.length === 1 ? '' : 's'}${s > 0 ? ` · ${s.toFixed(1)} s` : ''}`;
}

// add(cls, html) puts an element at the end of the chat; last() is the chat's last element now.
export function createGuppiBubbles({ add, esc, last = () => null, on = () => true, rand = Math.random }) {
  let seed = Math.floor(rand() * 1000), made = 0;
  function draw(b) {
    b.line.textContent = quipFor(b.records, b.seed);
    b.time.textContent = countLine(b.records);
    b.list.innerHTML = b.records.map((r) => `<li class="think-row${r.kind === 'stop' ? ' note' : ''}"><i class="think-dot d-${r.kind === 'stop' ? 'failed' : 'note'}" aria-hidden="true"></i><span>${[].concat(r.lines || []).map((l) => esc(l)).join('<br>')}</span></li>`).join('');
    const n = b.records.length;
    b.head.setAttribute('aria-label', `${b.line.textContent}. ${n} record${n === 1 ? '' : 's'} from GUPPI. Press to ${b.body.hidden ? 'show' : 'hide'} what changed.`);
  }
  function make(records, quipSeed) {
    const el = add('think finished guppi', `<button type="button" class="think-head" aria-expanded="false"><span class="think-spark guppi-mark" aria-hidden="true"></span><span class="think-line"></span><span class="think-time"></span><span class="think-caret" aria-hidden="true">▸</span></button><div class="think-body" hidden><ol class="think-steps"></ol></div>`);
    const b = { el, head: el.querySelector('.think-head'), line: el.querySelector('.think-line'), time: el.querySelector('.think-time'), body: el.querySelector('.think-body'), list: el.querySelector('.think-steps'), records: [...records], seed: quipSeed };
    b.head.onclick = () => { const open = b.body.hidden; b.body.hidden = !open; b.head.setAttribute('aria-expanded', String(open)); el.classList.toggle('open', open); draw(b); };
    el._guppi = b;
    draw(b);
    return b;
  }
  const clean = (ev) => ({ kind: String(ev?.kind || ''), lines: [].concat(ev?.lines || []).map(String), seconds: Number(ev?.seconds) || 0, at: Number(ev?.at) || 0 });
  return {
    // a live record: onto the bubble just above it when nothing came between (a run of changes), else a new bubble
    take(ev) {
      if (!on()) return null;
      const prev = last()?._guppi;
      if (prev) { prev.records.push(clean(ev)); draw(prev); return prev.el; }
      return make([clean(ev)], seed + made++).el;
    },
    // after a reload: the records kept on an answer, as one bubble (the quip from the first record's time, so it
    // stays the same line on every reload)
    saved(records) {
      const list = [].concat(records || []).map(clean);
      if (!on() || !list.length) return null;
      return make(list, Math.floor((list[0].at || 0) / 1000)).el;
    }
  };
}
