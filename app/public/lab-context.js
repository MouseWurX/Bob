// 1.5.16x 🧪 Playground: Longer, "How much can it hold?" (thinking-paths.md sec 15.2). The memory meter moves with the
// slider (the sums are public/lab-context-math.js, the same the server uses); the speed-and-needle ladder, the stretch
// and the forgetting demo run as a Lab job (src/lab-context.js). Use this in Bob writes the brain's size in Settings.
import { esc } from './rich.js';
import { meter, fitsAnswer, ladderSizes, kLabel, STOPS, SQUEEZE, STRETCH } from './lab-context-math.js';

export function createContextPage({ api }) {
  let v = null, from = '', at = 5, squeeze = 'half', stretch = 1, sizes = [1024, 4096, 16384, 32768], forget = true, plan = null, msg = '', used = '', askUnload = null, loading = false;
  const brain = () => v?.brains.find((b) => b.id === from);
  async function load() { loading = true; try { v = await api('/api/lab/context'); } catch (e) { msg = e.message; } loading = false; }
  async function replan() { plan = null; if (!from) return; try { plan = await api('/api/lab/context/plan', { brain: from, sizes, stretch, squeeze, forget }); } catch (e) { plan = { problems: [e.message], notes: [] }; } }
  const stops = () => { const b = brain(); const top = (b?.max || 32768) * stretch; return STOPS.filter((s) => s <= top); };

  function meterHtml(b) {
    const list = stops(); const i = Math.min(at, list.length - 1); const ctx = list[i];
    const m = meter({ fileBytes: b.fileBytes, perToken: b.perToken, ctx, squeeze, cardBytes: v.cardBytes, ramBytes: v.ramBytes });
    const scale = Math.max(m.totalGB, m.cardGB, 1);
    const pc = (x) => Math.max(0, Math.min(100, Math.round((x / scale) * 100)));
    const where = { card: 'It all fits on the graphics card.', spill: 'Part of it spills into RAM: it still runs, but slower.', no: 'It doesn\'t fit on this replicant matrix at this size.' }[m.where];
    const fit = fitsAnswer({ name: b.name, fileBytes: b.fileBytes, perToken: b.perToken, max: (b.max || 32768) * stretch, squeeze, cardBytes: v.cardBytes, ramBytes: v.ramBytes });
    const useAt = fit.card || (m.where !== 'no' ? ctx : 0);
    return `<section class="lab-compare" aria-labelledby="ctx-meter-h"><h4 id="ctx-meter-h">The memory meter</h4>
      <p class="muted">Every word in the chat is kept in a memory next to the brain (the key-value cache). Drag the slider to see how much card memory a longer chat takes.</p>
      ${b.perToken ? `<label for="ctx-at">Context: <strong>${kLabel(ctx)}</strong> tokens (about ${Math.round(ctx * 0.75).toLocaleString('en')} words)</label>
      <input type="range" id="ctx-at" min="0" max="${list.length - 1}" step="1" value="${i}" aria-valuetext="${kLabel(ctx)} tokens">
      <div class="ctx-meter" role="img" aria-label="${esc(`${b.name}: ${m.brainGB} GB brain, ${m.kvGB} GB chat memory, ${m.workGB} GB working room${m.cardGB ? `, ${m.cardGB} GB card` : ''}`)}">
        <span class="ctx-brain" style="width:${pc(m.brainGB)}%"></span><span class="ctx-kv" style="width:${pc(m.kvGB)}%"></span><span class="ctx-work" style="width:${pc(m.workGB)}%"></span>
        ${m.cardGB ? `<span class="ctx-line" style="left:${pc(m.cardGB)}%" title="The graphics card ends here"></span>` : ''}</div>
      <p class="play-key muted"><span><span class="ctx-brain swatch"></span> The brain ${m.brainGB} GB</span> <span><span class="ctx-kv swatch"></span> Chat memory ${m.kvGB} GB</span> <span><span class="ctx-work swatch"></span> Working room ${m.workGB} GB</span>${m.cardGB ? ` <span><span class="ctx-line swatch"></span> The card, ${m.cardGB} GB</span>` : ''}</p>
      <p role="status" class="${m.where === 'no' ? 'error' : ''}"><strong>${esc(where)}</strong>${m.where === 'card' ? ` ${m.leftGB} GB left on the card.` : ''}</p>
      <fieldset><legend>Cache squeeze</legend>${SQUEEZE.map((s) => `<label class="lab-opt"><input type="radio" name="ctxsq" value="${s.id}" ${squeeze === s.id ? 'checked' : ''}> <span><strong>${esc(s.label)}</strong><br><span class="muted">${esc(s.hint)}</span></span></label>`).join('')}</fieldset>
      <p class="lab-saw"><strong>Fits my card:</strong> ${esc(fit.line)}</p>
      <div class="row"><button type="button" class="get" data-ctxuse="${useAt}" ${useAt ? '' : 'disabled'}>Use this in Bob</button>${used ? `<span role="status">${esc(used)}</span>` : ''}</div>
      <p class="muted">${fit.card ? `Use this in Bob sets ${esc(b.name)}'s size in Settings to the biggest that stays on the card (${kLabel(fit.card)}).` : `${esc(b.name)} never fits on the card whole, so Use this in Bob sets the size on the slider${useAt ? ` (${kLabel(useAt)})` : ''}.`} Bob uses half-size chat memory.</p>`
      : `<p>Bob couldn't read ${esc(b.name)}'s shape from its file, so the meter can't be drawn for it.</p>`}</section>`;
  }

  function ladderHtml(b) {
    const list = ladderSizes(b.max, stretch);
    return `<section class="lab-compare" aria-labelledby="ctx-run-h"><h4 id="ctx-run-h">Speed against length, and the needle at every size</h4>
      <p class="muted">Bob gives ${esc(b.name)} one long text at each size you tick, with a note hidden in it, and asks for the note at the end. He times how long the first word takes and how fast it writes, so you see the slow-down with your own eyes.</p>
      <fieldset><legend>Sizes</legend><div class="row">${list.map((s) => `<label class="lab-opt${s.ok ? '' : ' dim'}"><input type="checkbox" data-ctxsize="${s.n}" ${sizes.includes(s.n) && s.ok ? 'checked' : ''} ${s.ok ? '' : 'disabled'}> <span><strong>${s.label}</strong>${s.ok ? (s.past ? ' <span class="tag warn">stretched</span>' : '') : '<br><span class="muted">Past its window. Stretch it to try.</span>'}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>Stretch the window</legend><div class="row">${STRETCH.map((n) => `<label class="lab-opt"><input type="radio" name="ctxstretch" value="${n}" ${stretch === n ? 'checked' : ''}> <span><strong>${n === 1 ? 'No stretch' : `${n}x`}</strong>${n > 1 ? `<br><span class="muted">up to ${kLabel((b.max || 32768) * n)}</span>` : ''}</span></label>`).join('')}</div>
        <p class="muted">Stretching (YaRN, the same setting as Long memory) spreads the brain's positions out so it can read further. It trades a little sharpness everywhere for reach: run it plain and stretched, and compare the notes it finds.</p></fieldset>
      <label class="lab-opt"><input type="checkbox" data-ctxforget ${forget ? 'checked' : ''}> <span><strong>What gets forgotten</strong><br><span class="muted">A 20-turn chat that's too long for a 2K window. Bob asks about the first turn with the whole chat, and again with only what fits.</span></span></label>
      ${plan ? `<div class="lab-check" role="status">${plan.problems.length ? `<p><strong>Before it can start:</strong></p><ul>${plan.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p><strong>Ready.</strong> It runs here, for free, on whatever card this is.</p>'}${plan.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}</div>` : ''}
      ${askUnload ? `<div class="setup-offer" role="alert"><strong>Bob's brain is on the graphics card</strong><span>${esc(askUnload.join(', '))} is loaded. This needs the card, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-ctxgo="unload">Unload it and start</button><button type="button" class="link" data-ctxnounload>Not now</button></div></div>` : ''}
      <div class="row"><button type="button" class="get" data-ctxgo ${plan && !plan.problems.length ? '' : 'disabled'}>Run it</button></div></section>`;
  }

  function resultHtml(rec, i) {
    const top = Math.max(...rec.rows.map((r) => r.writeTps || 0), 1);
    return `<section class="lab-compare" aria-labelledby="ctx-res-${i}"><h4 id="ctx-res-${i}">${esc(rec.brain.name)} <span class="muted">· ${esc(rec.when)}${rec.stretch > 1 ? ` · stretched ${rec.stretch}x` : ''} · cache ${esc(rec.squeeze)}</span></h4>
      <table class="lab-report"><caption class="muted">"Words a second" are tokens, about three quarters of a word each. The note was hidden a quarter, half or three quarters of the way in.</caption>
      <tr><th scope="col">Size</th><th scope="col">Read</th><th scope="col">First word</th><th scope="col">Reading, words a second</th><th scope="col">Writing, words a second</th><th scope="col">Found the note</th></tr>
      ${rec.rows.map((r) => `<tr><th scope="row">${esc(r.label)}${r.past ? ' (stretched)' : ''}</th><td>${r.tokens ?? '-'}</td><td>${r.firstWordS ?? '-'} s</td><td>${r.readTps ?? '-'}</td><td>${r.writeTps ?? '-'}</td><td>${r.found ? 'Yes' : `No <span class="muted">("${esc(r.answer)}")</span>`}</td></tr>`).join('')}</table>
      <div class="play-bars" aria-hidden="true">${rec.rows.map((r) => `<div class="play-bar"><span class="play-lbl">${esc(r.label)}</span><span class="play-track"><span class="play-size" style="width:${Math.round(((r.writeTps || 0) / top) * 100)}%"></span></span><span>${r.found ? '✓' : '✗'}</span></div>`).join('')}</div>
      ${rec.forget ? `<p><strong>What got forgotten:</strong> the chat was ${rec.forget.totalTokens} tokens; in a ${kLabel(rec.forget.window)} window only turns ${rec.forget.keptFrom} to ${rec.forget.turns} fit. Asked "what is my cat called?": with the whole chat, "${esc(rec.forget.whole.text)}"; with what fits, "${esc(rec.forget.windowed.text)}".</p>` : ''}
      ${rec.saw ? `<p class="lab-saw"><strong>What you just saw:</strong> ${esc(rec.saw)}</p>` : ''}</section>`;
  }

  function html() {
    if (!v) return `<p class="muted" role="status">${loading ? 'Reading your brains…' : ''}</p>${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}`;
    const b = brain();
    return `<h3>How much can it hold?</h3>
      <p class="muted">A brain can only keep so much of a chat in mind at once: its window. Here you can see what a longer window costs in memory and speed, where it stops fitting, and what a brain forgets when a chat outgrows it. It all runs here, for free.</p>
      <fieldset><legend>Which brain?</legend>${v.brains.map((x) => `<label class="lab-opt"><input type="radio" name="ctxfrom" value="${esc(x.id)}" ${from === x.id ? 'checked' : ''}> <span><strong>${esc(x.name)}</strong><br><span class="muted">${x.sizeGB} GB${x.max ? `, made for ${kLabel(x.max)}` : ''}</span></span></label>`).join('') || '<p>There are no brains here yet. Get one from Get models.</p>'}</fieldset>
      ${b ? meterHtml(b) + ladderHtml(b) : ''}
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
      ${(v.runs || []).filter((r) => !from || r.brain.id === from).map((r, i) => resultHtml({ ...r, saw: r.saw || '' }, i)).join('')}`;
  }

  async function change(el) {
    if (el.name === 'ctxfrom') { from = el.value; at = 5; used = ''; await replan(); return true; }
    if (el.name === 'ctxsq') { squeeze = el.value; await replan(); return true; }
    if (el.name === 'ctxstretch') { stretch = Number(el.value); await replan(); return true; }
    if (el.dataset?.ctxsize) { const n = Number(el.dataset.ctxsize); sizes = el.checked ? [...new Set([...sizes, n])] : sizes.filter((x) => x !== n); await replan(); return true; }
    if ('ctxforget' in (el.dataset || {})) { forget = el.checked; await replan(); return true; }
    return false;
  }
  function input(el) { if (el.id === 'ctx-at') { at = Number(el.value); return 'draw'; } return false; }
  async function click(b) {
    const d = b.dataset;
    if ('ctxnounload' in d) { askUnload = null; return 'draw'; }
    if ('ctxuse' in d) { try { used = (await api('/api/lab/context/use', { brain: from, ctx: Number(d.ctxuse) || 0 })).line; } catch (e) { used = e.message; } return 'draw'; }
    if ('ctxgo' in d) {
      msg = '';
      try { const r = await api('/api/lab/context/start', { brain: from, sizes, stretch, squeeze, forget, unload: d.ctxgo === 'unload' }); askUnload = r.needUnload ? r.names : null; } catch (e) { msg = e.message; }
      return 'load';
    }
    return false;
  }
  function saveTable(k) {
    if (!k.startsWith('ctx-')) return null;
    const rec = v?.runs?.[Number(k.slice(4))]; if (!rec) return null;
    return { title: `How much can it hold: ${rec.brain.name}`, head: ['Size', 'Read', 'First word (s)', 'Reading', 'Writing', 'Found the note'], rows: rec.rows.map((r) => [r.label, r.tokens ?? '', r.firstWordS ?? '', r.readTps ?? '', r.writeTps ?? '', r.found ? 'Yes' : 'No']), note: 'Words a second are tokens. Stretched: ' + (rec.stretch > 1 ? `${rec.stretch}x` : 'no') };
  }
  return { load, html, change, input, click, saveTable, kind: 'context' };
}
