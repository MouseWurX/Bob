// 1.5.16x 🧪 Playground: Faster, Turbo (thinking-paths.md sec 15.1). A small brain guesses, the big one checks. Pick
// the main brain; the page suggests a draft from the same family that fits next to it, or uses the brain's own
// guesser. Try it runs Turbo off and on (src/lab-turbo.js); the guess-length slider moves over what was measured.
import { esc } from './rich.js';
import { nameNow } from './lab-names.js'; // 1.5.199 proper names in Professional mode
import { goBtn } from './lab-go.js'; // a button to where the message points

export function createTurboPage({ api }) {
  let v = null, from = '', guesser = '', draft = '', guess = [2, 4, 8, 16], prompt = 'code', plan = null, msg = '', used = '', askUnload = null, pick = {}, loading = false;
  const main = () => v?.brains.find((b) => b.id === from);
  async function load() { loading = true; try { v = await api('/api/lab/turbo'); } catch (e) { msg = e.message; } loading = false; }
  async function replan() { plan = null; if (!from) return; try { plan = await api('/api/lab/turbo/plan', { brain: from, guesser, draft, guess, prompt }); } catch (e) { plan = { problems: [e.message], notes: [] }; } }

  function pickHtml(b) {
    const own = b.mtp ? `<label class="lab-opt"><input type="radio" name="tbguess" value="own" ${guesser === 'own' ? 'checked' : ''}> <span><strong>Its own guesser</strong> <span class="tag good">built in</span><br><span class="muted">${esc(b.name)} carries a multi-token head, so nothing else needs to load.</span></span></label>` : '';
    const drafts = b.drafts.map((d) => `<label class="lab-opt${d.fits ? '' : ' dim'}"><input type="radio" name="tbguess" value="draft:${esc(d.id)}" ${guesser === 'draft' && draft === d.id ? 'checked' : ''} ${d.fits ? '' : 'disabled'}> <span><strong>${esc(d.name)}</strong> <span class="muted">${d.sizeGB} GB</span><br><span class="muted">${d.fits ? `Both fit on the card (about ${d.needGB} GB).` : `Not enough room next to ${esc(b.name)}: both need about ${d.needGB} GB. Try a smaller draft or a smaller size of ${esc(b.name)} (the quantization ladder shows them).`}</span></span></label>`).join('');
    return `<fieldset><legend>${nameNow('Who guesses?')}</legend>${own}${drafts || (b.mtp ? '' : `<p>There's no smaller brain from ${esc(b.name)}'s family here to guess for it. The smallest brain of the same family is the best guesser; get one from Get models.${goBtn('models')}</p>`)}</fieldset>`;
  }

  function rowsHtml(rec, i) {
    const on = rec.rows.filter((r) => r.guess > 0);
    const at = pick[i] ?? Math.max(0, on.findIndex((r) => r.guess === rec.best?.guess));
    const sel = on[at] || on[0];
    const off = rec.rows[0];
    const top = Math.max(...rec.rows.map((r) => r.tps || 0), 1);
    return `<section class="lab-compare" aria-labelledby="tb-res-${i}"><h4 id="tb-res-${i}">${esc(rec.brain.name)}, ${esc(rec.guesser.name)} guessing <span class="muted">· ${esc(rec.when)} · ${esc(rec.prompt)}</span></h4>
      <table class="lab-report"><tr><th scope="col">Turbo</th><th scope="col">Words a second</th><th scope="col">Guesses kept</th><th scope="col">Same words</th></tr>
      ${rec.rows.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${r.tps ?? '-'}</td><td>${r.accept === null ? '-' : `${r.accept}%`}</td><td>${r.same ? 'Yes' : 'A few differed'}</td></tr>`).join('')}</table>
      <div class="play-bars" aria-hidden="true">${rec.rows.map((r) => `<div class="play-bar"><span class="play-lbl">${esc(r.label)}</span><span class="play-track"><span class="play-size" style="width:${Math.round(((r.tps || 0) / top) * 100)}%"></span></span></div>`).join('')}</div>
      ${on.length > 1 && sel ? `<label for="tb-slide-${i}">Guess length: <strong>${sel.guess} words ahead</strong></label><input type="range" id="tb-slide-${i}" data-tbslide="${i}" min="0" max="${on.length - 1}" step="1" value="${at}" aria-valuetext="${sel.guess} words ahead">
        <p role="status">At ${sel.guess} ahead the main brain kept ${sel.accept ?? '-'}% of the guesses and wrote ${sel.tps ?? '-'} words a second (${off?.tps ?? '-'} with Turbo off). Longer guesses are cheap to check but more of them are wrong, so there's a best length for each pair.</p>` : ''}
      ${rec.saw ? `<p class="lab-saw"><strong>What you just saw:</strong> ${esc(rec.saw)}</p>` : ''}
      <div class="row"><button type="button" class="get" data-tbuse="${i}" data-tbg="${sel?.guess || 8}">Use this in Bob</button>${used ? `<span role="status">${esc(used)}</span>` : ''}</div></section>`;
  }

  function html() {
    if (!v) return `<p class="muted" role="status">${loading ? 'Reading your brains…' : ''}</p>${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}`;
    const b = main();
    return `<h3>${nameNow('Make it faster: Turbo')}</h3>
      <p class="muted">A small brain guesses the next few words and the big brain checks them all at once. Right guesses are free speed. The answer is exactly what the big brain would say alone.</p>
      <fieldset><legend>The main brain</legend>${v.brains.map((x) => `<label class="lab-opt"><input type="radio" name="tbfrom" value="${esc(x.id)}" ${from === x.id ? 'checked' : ''}> <span><strong>${esc(x.name)}</strong><br><span class="muted">${x.sizeGB} GB${x.mtp ? ', has its own guesser' : x.drafts.some((d) => d.fits) ? `, ${x.drafts.filter((d) => d.fits).length} draft${x.drafts.filter((d) => d.fits).length === 1 ? '' : 's'} fit next to it` : ''}${x.saved?.on ? ' · Turbo is on in Bob' : ''}</span></span></label>`).join('') || '<p>There are no brains here yet.' + goBtn('models') + '</p>'}</fieldset>
      ${b ? `${pickHtml(b)}
      <fieldset><legend>Guess lengths to try</legend><div class="row">${v.guess.map((n) => `<label class="lab-opt"><input type="checkbox" data-tblen="${n}" ${guess.includes(n) ? 'checked' : ''}> <span><strong>${n} words ahead</strong></span></label>`).join('')}</div></fieldset>
      <fieldset><legend>The test</legend><label class="lab-opt"><input type="radio" name="tbprompt" value="code" ${prompt === 'code' ? 'checked' : ''}> <span><strong>Write some code</strong></span></label><label class="lab-opt"><input type="radio" name="tbprompt" value="prose" ${prompt === 'prose' ? 'checked' : ''}> <span><strong>Explain something plainly</strong></span></label></fieldset>
      <p class="muted">Turbo helps most on code and plain writing, least on creative writing at a high temperature, and not at all if the draft brain doesn't fit next to the main one.</p>
      ${plan ? `<div class="lab-check" role="status">${plan.problems.length ? `<p><strong>Before it can start:</strong></p><ul>${plan.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p><strong>Ready.</strong> It loads the brain once per run, so it takes a few minutes.</p>'}${plan.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}</div>` : ''}
      ${askUnload ? `<div class="setup-offer" role="alert"><strong>Bob's brain is on the graphics card</strong><span>${esc(askUnload.join(', '))} is loaded. Try it needs the card, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-tbgo="unload">Unload it and start</button><button type="button" class="link" data-tbnounload>Not now</button></div></div>` : ''}
      <div class="row"><button type="button" class="get" data-tbgo ${plan && !plan.problems.length ? '' : 'disabled'}>Try it</button>${b.saved?.on ? '<button type="button" class="link" data-tboff>Turn Turbo off in Bob for this brain</button>' : ''}</div>` : ''}
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
      ${(v.runs || []).filter((r) => !from || r.brain.id === from).map(rowsHtml).join('')}`;
  }

  async function change(el) {
    if (el.name === 'tbfrom') { from = el.value; const b = main(); guesser = b?.mtp ? 'own' : 'draft'; draft = b?.drafts.find((d) => d.fits)?.id || ''; used = ''; await replan(); return true; }
    if (el.name === 'tbguess') { if (el.value === 'own') guesser = 'own'; else { guesser = 'draft'; draft = el.value.slice(6); } await replan(); return true; }
    if (el.name === 'tbprompt') { prompt = el.value; await replan(); return true; }
    if (el.dataset?.tblen) { const n = Number(el.dataset.tblen); guess = el.checked ? [...new Set([...guess, n])].sort((a, b) => a - b) : guess.filter((x) => x !== n); await replan(); return true; }
    return false;
  }
  function input(el) { if (el.dataset?.tbslide) { pick[el.dataset.tbslide] = Number(el.value); return 'draw'; } return false; }
  async function click(b) {
    const d = b.dataset;
    if ('tbnounload' in d) { askUnload = null; return 'draw'; }
    if ('tboff' in d) { try { used = (await api('/api/lab/turbo/use', { brain: from, off: true })).line; await load(); } catch (e) { used = e.message; } return 'draw'; }
    if (d.tbuse !== undefined && 'tbuse' in d) {
      const rec = (v.runs || []).filter((r) => !from || r.brain.id === from)[Number(d.tbuse)]; if (!rec) return 'draw';
      try { used = (await api('/api/lab/turbo/use', { brain: rec.brain.id, guesser: rec.guesser.own ? 'own' : 'draft', draft: rec.guesser.id || '', guess: Number(d.tbg) })).line; await load(); } catch (e) { used = e.message; }
      return 'draw';
    }
    if ('tbgo' in d) {
      msg = '';
      try { const r = await api('/api/lab/turbo/start', { brain: from, guesser, draft, guess, prompt, unload: d.tbgo === 'unload' }); askUnload = r.needUnload ? r.names : null; } catch (e) { msg = e.message; }
      return 'load';
    }
    return false;
  }
  return { load, html, change, input, click, saveTable: () => null, kind: 'turbo' };
}
