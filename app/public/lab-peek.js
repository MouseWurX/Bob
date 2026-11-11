// 1.5.164 🧪 Computer Science Lab, Playground: Peek inside. "Which experts did you use for that?" A map of a
// mixture-of-experts brain, layers across and experts down, one square per expert: shaded by how much of a thing's
// work it carries (from the usage map's counts), or lit up live as Brain Engine answers a question and reports which
// experts it picked for every word. A scrubber steps word by word; two questions can be compared; Keep count adds every
// traced word to the tally, which Cut these out and Send to the Forge use. Its own module; the Playground places it.
// The map is a canvas with text under it (never colour alone): a line per layer, the totals, and the cold experts.
import { esc } from './rich.js';
import { nameNow } from './lab-names.js'; // 1.5.199 proper names in Professional mode

export function createPeek({ api, view, cutWith = () => {}, toForge = () => {} }) {
  let brain = '', data = null, thing = 'total', question = 'Write a haiku about rain, then explain what a prime number is.', asks = [], busy = false, msg = '', askUnload = null, tally = false, showCold = false, scrub = -1, perLayer = false, compare = false, switchAsk = null;
  const v = () => view() || {};
  const brains = () => (v().brains || []).filter((b) => b.facts?.experts);
  const cur = () => asks[asks.length - 1] || null;

  async function load() { data = null; if (!brain) return; try { data = await api('/api/lab/peek', { brain }); } catch (e) { msg = e.message; } }

  // The counts the map shows: a thing from the usage map, the whole tally, or the lit-up set of the last question (one word, or all).
  function shown() {
    const live = cur();
    if (thing === 'live' && live) {
      if (scrub >= 0 && live.words[scrub]) { const L = live.counts.length; return Array.from({ length: L }, (_, li) => { const ids = live.words[scrub].layers[li] || []; const row = live.counts[li] ? new Array(live.counts[li].length).fill(0) : null; if (row) for (const e of ids) row[e] = 1; return row; }); }
      return live.counts;
    }
    if (!data?.have) return null;
    if (thing === 'total') return data.total;
    const t = data.things[Number(thing)]; return t ? t.counts : data.total;
  }

  function draw(canvasId, counts, { lit = null } = {}) {
    const c = document.getElementById(canvasId); if (!c || !counts) return;
    const L = counts.length, E = Math.max(...counts.filter(Boolean).map((r) => r.length), 1);
    const w = Math.max(1, Math.floor(Math.min(14, (c.clientWidth || 600) / L))), h = Math.max(1, Math.floor(Math.min(6, 600 / E)));
    c.width = L * w; c.height = E * h;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const css = getComputedStyle(document.body), accent = css.getPropertyValue('--accent').trim() || '#3b82f6', line = css.getPropertyValue('--line').trim() || '#888', bg = css.getPropertyValue('--bg').trim() || '#fff';
    ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
    for (let li = 0; li < L; li++) {
      const row = counts[li]; if (!row) continue;
      const max = Math.max(...row, 1);
      for (let e = 0; e < row.length; e++) {
        const x = li * w, y = e * h;
        if (lit && lit[li]?.includes(e)) { ctx.fillStyle = accent; ctx.fillRect(x, y, w - 1, h - 1); continue; }
        if (!row[e]) { ctx.strokeStyle = line; ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 2), Math.max(1, h - 2)); continue; }
        ctx.globalAlpha = 0.25 + 0.75 * (row[e] / max); ctx.fillStyle = accent; ctx.fillRect(x, y, w - 1, h - 1); ctx.globalAlpha = 1;
      }
    }
  }
  function mounted() {
    const counts = shown(); if (counts) draw('peek-map', counts);
    if (compare && asks.length >= 2) { draw('peek-map-a', asks[asks.length - 2].counts); draw('peek-map-b', asks[asks.length - 1].counts); const both = overlapCounts(asks[asks.length - 2].lit, asks[asks.length - 1].lit, counts.length); draw('peek-map-both', both); }
  }
  const overlapCounts = (a, b, L) => Array.from({ length: L }, (_, li) => { const sa = new Set(a[li] || []), row = new Array(Math.max(...[(a[li] || []), (b[li] || [])].flat(), 0) + 1).fill(0); for (const e of b[li] || []) if (sa.has(e)) row[e] = 1; return row; });
  function overlapWords(a, b) { let both = 0, either = 0; for (let li = 0; li < Math.max(a.length, b.length); li++) { const sa = new Set(a[li] || []), sb = new Set(b[li] || []); for (const e of sa) { either++; if (sb.has(e)) both++; } for (const e of sb) if (!sa.has(e)) either++; } return either ? Math.round((1000 * both) / either) / 10 : 0; }

  // The text under the map: one line per layer, so nobody needs the colours.
  function layerLines(counts) {
    if (!counts) return '';
    const lines = counts.map((row, li) => { if (!row) return ''; const used = row.filter((x) => x > 0).length, top = row.map((x, e) => [x, e]).filter(([x]) => x > 0).sort((p, q) => q[0] - p[0] || p[1] - q[1]).slice(0, 3).map(([, e]) => e); return `<li>Layer ${li}: ${used} of ${row.length} used${top.length ? `, mostly ${top.join(', ')}` : ''}${row.length - used ? `, ${row.length - used} never` : ''}.</li>`; }).filter(Boolean);
    return `<details ${perLayer ? 'open' : ''} data-peekper><summary>Layer by layer, in words</summary><ul class="tlist peek-layers">${lines.join('')}</ul></details>`;
  }

  function liveHtml() {
    const live = cur(), d = data;
    if (!d) return '';
    if (!d.live?.ok) return `<div class="lab-check" aria-disabled="true"><p><strong>Which experts did you use for this question?</strong> <span class="lab-later">Not yet</span></p><p class="muted">${esc(d.live?.why || '')}</p></div>`;
    const words = live ? live.words : [];
    return `<div class="lab-check peek-live"><p><strong>Which experts did you use for this question?</strong></p>
      <label for="peek-q">Your question</label><textarea id="peek-q" rows="2" maxlength="500">${esc(question)}</textarea>
      <label class="lab-opt"><input type="checkbox" data-peektally ${tally ? 'checked' : ''}> <span><strong>Keep count while Bob asks these</strong><br><span class="muted">Every traced word is added to this brain's tally (the thing "Peek inside" in the usage map's files), so the cold experts are counted over everything you ask.</span></span></label>
      ${askUnload ? `<div class="setup-offer" role="alert"><strong>Bob's brain is on the graphics card</strong><span>${esc(askUnload.names.join(', '))} is loaded. Peek inside needs the graphics card, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-peekunload>Unload it and ask</button><button type="button" class="link" data-peeknounload>Not now</button></div></div>` : ''}
      <div class="row"><button type="button" class="get" data-peekask ${busy || !question.trim() ? 'disabled' : ''}>${busy ? 'Asking…' : asks.length ? 'Ask another' : 'Ask it'}</button>${live ? `<button type="button" class="link" data-peekoff ${busy ? 'disabled' : ''}>Keep only these and ask again</button>` : ''}${asks.length >= 2 ? `<button type="button" class="link" data-peekcompare aria-pressed="${compare}">Compare the last two</button>` : ''}${live ? '<button type="button" class="link" data-peekclear>Clear</button>' : ''}</div>
      ${live ? `<p><strong>"${esc(live.question)}"</strong>${live.masked ? ' <span class="muted">(with only the experts lit up last time switched on)</span>' : ''}</p><p class="peek-answer">${esc(live.answer) || '<span class="muted">(no answer)</span>'}</p>
        <p class="muted">${live.words.length} words; ${live.used} experts lit up, ${live.share}% of the brain.${live.tps ? ` ${live.tps} words a second.` : ''}${live.tallied ? ` Counted: ${live.tallied.tokens} words in the tally so far.` : ''} In these brains experts split work by word pattern more than by topic, so most questions light up much the same set; don't expect a "coding corner".</p>
        <label for="peek-scrub">Word by word</label> <input id="peek-scrub" type="range" min="-1" max="${words.length - 1}" value="${scrub}" aria-valuetext="${scrub < 0 ? 'the whole answer' : `word ${scrub + 1}: ${esc(words[scrub]?.text || '')}`}"> <span id="peek-scrub-h" role="status" class="muted">${scrub < 0 ? 'The whole answer.' : `Word ${scrub + 1} of ${words.length}: "${esc(words[scrub]?.text || '')}", ${(words[scrub]?.layers || []).reduce((a, l) => a + l.length, 0)} experts.`}</span>` : ''}
      ${compare && asks.length >= 2 ? compareHtml() : ''}</div>`;
  }
  // 1.5.20x Switch these off in the file: only for a brain whose router has a bias (gpt-oss).
  function switchHtml() {
    const sw = data?.switch;
    if (!sw?.can) return '';
    const st = sw.state;
    return `<div class="lab-check peek-switch"><p><strong>Switch experts off in the file</strong>${st ? ` <span class="tag">${st.off.toLocaleString()} switched off</span>` : ''}</p>
      <p class="muted">This brain's router lets me switch experts off without cutting anything: it never picks them again, in any engine, and the ones it never picks are never read. Only a few kilobytes of the file change, so it takes seconds, and Switch them all back on puts it back exactly as it was. The file stays the same size; Cut these out is what makes it smaller.</p>
      ${switchAsk ? `<div class="setup-offer" role="alert"><strong>Bob's brain is loaded</strong><span>${esc(switchAsk.names.join(', '))} is loaded. The brain file changes, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-peekswunload>Unload it and go on</button><button type="button" class="link" data-peeksworry>Not now</button></div></div>` : ''}
      <div class="row"><button type="button" class="get" data-peekswoff ${busy ? 'disabled' : ''}>${st ? 'Switch off these instead' : 'Switch these off in the file'}</button>${st ? `<button type="button" class="link" data-peekswon ${busy ? 'disabled' : ''}>Switch them all back on</button>` : ''}</div>
      <p class="muted">It uses the same kept experts as Cut these out${cur() && thing === 'live' ? ', from the experts the last question lit up' : ', from the tally'}.</p></div>`;
  }
  function compareHtml() {
    const a = asks[asks.length - 2], b = asks[asks.length - 1], pct = overlapWords(a.lit, b.lit);
    return `<div class="peek-compare"><div><p class="muted">"${esc(a.question)}"</p><canvas id="peek-map-a" aria-label="Experts the first question used"></canvas></div><div><p class="muted">"${esc(b.question)}"</p><canvas id="peek-map-b" aria-label="Experts the second question used"></canvas></div><div><p class="muted">Both</p><canvas id="peek-map-both" aria-label="Experts both questions used"></canvas></div>
      <p><strong>These two used ${pct}% of the same experts.</strong> <span class="muted">That number is usually high: experts split work by word pattern more than by topic.</span></p></div>`;
  }

  function html() {
    const list = brains(), d = data, counts = shown();
    const things = d?.have ? [['total', 'Everything counted so far'], ...d.things.map((t, i) => [String(i), `${t.name}${t.source === 'peek' ? ' (Peek inside)' : ''}`]), ...(cur() ? [['live', 'The last question']] : [])] : (cur() ? [['live', 'The last question']] : []);
    return `<section class="lab-compare peek" id="lab-peek" aria-labelledby="peek-h" tabindex="-1"><h3 id="peek-h">${nameNow('Peek inside: which experts did you use for that?')}</h3>
      <p class="muted">A mixture-of-experts brain picks a few experts in every layer for every word. This map shows them: layers across, experts down, one square per expert, darker where it does more of the work; an outlined square did nothing for what was counted. Level one comes from the usage map's counts (Make a brain, step 1). Level two asks the brain a question on Brain Engine and lights up the experts it picked, word by word.</p>
      <fieldset><legend>Which brain?</legend>${list.length ? `<select id="peek-brain" aria-label="Which brain"><option value="">(pick one)</option>${list.map((b) => `<option value="${esc(b.id)}" ${brain === b.id ? 'selected' : ''}>${esc(b.name)} · ${b.facts.experts} experts, ${b.facts.layers} layers</option>`).join('')}</select>` : '<p>There\'s no mixture-of-experts brain here to peek inside. Get one in Get models (one with "experts" or "A3B" in its name).</p>'}</fieldset>
      ${brain && d ? `${things.length ? `<label for="peek-thing">Show</label> <select id="peek-thing">${things.map(([id, l]) => `<option value="${esc(id)}" ${thing === id ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
        ${counts ? `<canvas id="peek-map" class="peek-map" aria-label="The expert map: layers across, experts down"></canvas>` : `<p class="muted">Nothing counted for this brain yet. Run the usage map (Make a brain, step 1, Open the usage map), or ask it a question below with Brain Engine.</p>`}
        ${d.have ? `<p class="muted">Across everything counted: ${d.cold.toLocaleString()} of ${(d.experts * d.layers).toLocaleString()} experts never woke up, about ${d.coldShare}% of the brain. A cold expert is only cold for what <em>you</em> tested; a short test leaves hundreds cold that a wider set would wake, so test wide before you cut.</p>` : ''}
        ${layerLines(counts)}
        ${d.have ? `<button type="button" class="link" data-peekcold aria-expanded="${showCold}">Show cold experts</button>${showCold ? `<ul class="tlist peek-layers">${d.perLayer.map((l) => `<li>Layer ${l.layer}: ${l.cold ? l.coldIds.join(', ') : 'none'}</li>`).join('')}</ul>` : ''}` : ''}
        ${liveHtml()}
        ${d.have || cur() ? `<div class="row"><button type="button" class="link" data-peekcut ${busy ? 'disabled' : ''}>Cut these out</button><button type="button" class="link" data-peekforge ${d.have ? '' : 'disabled'}>Send to the Forge</button></div><p class="muted">Cut these out opens Make a brain, step 3, with the kept experts filled in (the cold ones are dropped)${cur() && thing === 'live' ? ', from the experts the last question lit up' : ', from the tally'}. Send to the Forge saves the same keep file where a Forge plan can point at it.</p>${switchHtml()}` : ''}` : ''}
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
    </section>`;
  }

  async function change(el) {
    if (el.id === 'peek-brain') { brain = el.value; asks = []; thing = 'total'; scrub = -1; compare = false; msg = ''; await load(); return true; }
    if (el.id === 'peek-thing') { thing = el.value; scrub = -1; return true; }
    if ('peektally' in el.dataset) { tally = el.checked; return true; }
    return false;
  }
  function input(el) {
    if (el.id === 'peek-q') { question = el.value; return true; }
    if (el.id === 'peek-scrub') { scrub = Number(el.value); const live = cur(); const h = document.getElementById('peek-scrub-h'); if (h && live) h.textContent = scrub < 0 ? 'The whole answer.' : `Word ${scrub + 1} of ${live.words.length}: "${live.words[scrub]?.text || ''}", ${(live.words[scrub]?.layers || []).reduce((a, l) => a + l.length, 0)} experts.`; if (thing === 'live') draw('peek-map', shown()); return true; }
    return false;
  }
  async function click(b, redraw) {
    const d = b.dataset;
    if (!('peekask' in d || 'peekoff' in d || 'peekclear' in d || 'peekcold' in d || 'peekcut' in d || 'peekforge' in d || 'peekunload' in d || 'peeknounload' in d || 'peekcompare' in d || 'peekswoff' in d || 'peekswon' in d || 'peekswunload' in d || 'peeksworry' in d)) return false;
    msg = '';
    if ('peekcold' in d) { showCold = !showCold; return 'draw'; }
    if ('peekclear' in d) { asks = []; thing = 'total'; scrub = -1; compare = false; return 'draw'; }
    if ('peeknounload' in d) { askUnload = null; return 'draw'; }
    if ('peekcompare' in d) { compare = !compare; return 'draw'; }
    if ('peekforge' in d) { toForge(data?.keepFile || ''); return true; }
    if ('peeksworry' in d) { switchAsk = null; return 'draw'; }
    if ('peekswoff' in d || 'peekswon' in d || 'peekswunload' in d) {
      const back = 'peekswon' in d || switchAsk?.back === true;
      try {
        busy = true; redraw();
        const live = cur();
        const res = await api('/api/lab/peek/switch', { brain, back, unload: 'peekswunload' in d, ...(!back && thing === 'live' && live ? { counts: live.counts } : {}) });
        busy = false;
        if (res.needUnload) { switchAsk = { names: res.names, back }; return 'draw'; }
        switchAsk = null;
        if (data) data.switch = res.switch;
      } catch (e) { busy = false; switchAsk = null; msg = e.message; }
      return 'draw';
    }
    try {
      if ('peekcut' in d) { const live = cur(); const k = await api('/api/lab/peek/keep', { brain, ...(thing === 'live' && live ? { counts: live.counts } : {}) }); cutWith({ brain, file: k.file, experts: k.experts }); return true; }
      if ('peekask' in d || 'peekoff' in d || 'peekunload' in d) {
        const off = 'peekoff' in d || askUnload?.off;
        busy = true; redraw();
        const res = await api('/api/lab/peek/ask', { brain, question, tally, unload: 'peekunload' in d, ...(off && cur() ? { maskCounts: cur().counts } : {}) });
        busy = false;
        if (res.needUnload) { askUnload = { names: res.names, off }; return 'draw'; }
        askUnload = null;
        asks.push({ ...res, question }); if (asks.length > 6) asks.shift();
        thing = 'live'; scrub = -1;
      }
    } catch (e) { busy = false; msg = e.message; await load(); }
    return 'draw';
  }

  return { html, change, input, click, mounted, hasBrain: () => Boolean(brain) };
}
