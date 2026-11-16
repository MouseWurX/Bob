// 15 Nov 2026 🧪 Lab, Learn, Lessons: a short course from tokens to cutting and healing a brain. Each lesson is
// Read (Bob explains one idea), Try it (one step on the brain Bob has loaded, or a link to the Lab page that does the
// real job), and Check (two questions; every answer says why). The lessons come from the server (src/lab-lessons.js),
// so Help, the tests and this page share one list. Off unless "Lab: Lessons" is on. Only "done" is saved.
import { esc } from './rich.js';
import { tip } from './tips.js';
import { goBtn } from './lab-go.js';

const pct = (x) => `${Math.round(x * 1000) / 10}%`;
const shown = (t) => String(t).replace(/^ /, '␣').replace(/\n/g, '⏎') || '∅';
const firstSentence = (t) => String(t).split(/(?<=\.)\s/)[0];
const INDEX = '#index'; // the course's own index of where every Real result comes from (16 Nov)
const PAGE_LABEL = { teach: 'Teach', steps: 'Steps', make: 'Make a brain', test: 'Test', inside: 'Look inside', forge: 'Forge' };

export function createLessons({ api, go = () => {} }) {
  let el = null, view = null, msg = '', open = null;
  const tries = {}; // lesson id -> { text, out, busy, err }
  const picks = {}; // lesson id -> { question index: answer index }
  const checked = {}; // lesson id -> true once Check was pressed
  const tryState = (l) => (tries[l.id] ||= { text: l.try.text || '', out: null, busy: false, err: '' });

  const lessons = () => view?.lessons || [];
  const unitOf = (l) => view.units.find((u) => u.id === l.unit) || { title: '' };
  const levelOf = (l) => { const lv = (view.levels || []).find((x) => x.id === unitOf(l).level); return lv ? `${lv.title}, ` : ''; };
  const isDone = (id) => Boolean(view?.done?.[id]);
  const nextUndone = () => lessons().find((l) => !isDone(l.id));

  // ---- the list ----
  function listHtml() {
    const all = lessons(), n = all.filter((l) => isDone(l.id)).length, nx = nextUndone();
    let i = 0, ui = 0;
    const pickHtml = (l) => { i++; const d = isDone(l.id); return `<li><button type="button" class="lesson-pick${d ? ' done' : ''}" data-lesson="${esc(l.id)}" aria-label="${esc(`${l.title}${d ? ', done' : ''}`)}"><span class="lesson-mark" aria-hidden="true">${d ? '✓' : '○'}</span> <span>${esc(l.title)}<br><span class="muted lesson-pro">${esc(l.pro)}</span></span></button></li>`; };
    const unitHtml = (u) => { const ls = all.filter((l) => l.unit === u.id), start = i + 1;
      return `<section class="lesson-unit" aria-labelledby="lu-${u.id}"><h4 id="lu-${u.id}">${++ui}. ${esc(u.title)}</h4><p class="muted">${esc(u.about)}${ls.length ? '' : ' <em>Coming next.</em>'}</p>${ls.length ? `<ol class="lesson-list" start="${start}">${ls.map(pickHtml).join('')}</ol>` : ''}</section>`; };
    // Each level and its units. A unit with no lessons yet says "Coming next".
    const units = (view.levels || [{ id: '', title: '', about: '' }]).map((lv) => { const us = view.units.filter((u) => !lv.id || u.level === lv.id);
      return `<section class="lesson-level" aria-labelledby="lv-${lv.id}"><h3 id="lv-${lv.id}">${esc(lv.title)}</h3><p class="muted">${esc(lv.about)}</p>${us.map(unitHtml).join('')}</section>`; }).join('');
    return `<p class="muted">A short course on how brains work, from the basics up. Each lesson: read a little, try it on the brain I have loaded, then two quick questions. Nothing here changes a brain or rents anything.</p>
      <div class="row lesson-progress"><label for="lesson-prog">${n} of ${all.length} done</label> <progress id="lesson-prog" max="${all.length}" value="${n}"></progress>
        ${nx ? `<button type="button" class="get" data-lesson="${esc(nx.id)}">${n ? 'Carry on' : 'Start'}: ${esc(nx.title)}</button>` : '<strong>All done. Well done!</strong>'}
        ${n ? '<button type="button" class="link" data-lessonsreset>Start over</button>' : ''}</div>
      <p><button type="button" class="link" data-lessonsindex>Where every Real result comes from</button> <span class="muted">One table: lesson, chapter, result, how strong it is, and its file.</span></p>
      <div class="lesson-units">${units}</div>`;
  }

  // ---- one lesson ----
  function tryResult(l, s) {
    const o = s.out; if (!o) return '';
    if (o.kind === 'tokens') return `<ol class="learn-tokens" aria-label="The pieces">${o.tokens.map((t, i) => `<li class="learn-tok ${i % 2 ? 'b' : 'a'}${t.partial ? ' part' : ''}" aria-label="${esc(shown(t.text))}, token number ${t.id}"><span class="learn-tok-text">${esc(shown(t.text))}</span><span class="learn-tok-id">${t.id}</span></li>`).join('')}</ol><p>${o.characters} characters, ${o.tokens.length} tokens.</p>`;
    if (o.kind === 'next') return `<ol class="learn-odds" aria-label="My ten likeliest next tokens">${o.top.map((x) => `<li><span class="learn-odd"><i style="width:${Math.max(1, Math.round(x.odds * 100))}%" aria-hidden="true"></i><span class="learn-odd-text"><code>${esc(shown(x.token))}</code> <span class="muted">${pct(x.odds)}</span></span></span></li>`).join('')}</ol>${l.try.loss && o.top[0] ? `<p class="learn-saw">If <code>${esc(shown(o.top[0].token))}</code> is the right next token, my loss for it is −ln(${Math.round(o.top[0].odds * 1000) / 1000}) = <strong>${(-Math.log(Math.max(o.top[0].odds, 1e-9))).toFixed(2)}</strong>. If the right token were one I gave low odds, the loss would be much bigger.</p>` : ''}`;
    if (o.kind === 'temps') { const col = (h, xs) => `<div class="learn-try"><strong>${h}</strong>${xs.map((t) => `<p><code>${esc(s.text)}</code>${esc(t)}</p>`).join('')}</div>`; return `<div class="learn-tries">${col('Cold (0.2)', o.cold)}${col('Hot (1.5)', o.hot)}</div>`; }
    if (o.kind === 'context') return `<p><strong>${o.tokens.toLocaleString()} tokens</strong> from ${o.characters.toLocaleString()} characters.${o.ctx ? ` That's ${o.share}% of the ${o.ctx.toLocaleString()} tokens I can hold right now.` : ''}</p>${o.ctx ? `<progress max="100" value="${Math.min(100, o.share)}" aria-label="Share of my context">${o.share}%</progress>` : ''}`;
    if (o.kind === 'facts') {
      const rows = { params: ['Weights', `${o.paramsB} billion`], layers: ['Layers', o.layers], size: ['File size', `${o.sizeGB} GB`], experts: ['Experts', o.experts ? `${o.experts} in each layer, ${o.used} work per token` : 'None: a dense brain, every weight works on every token'], active: ['Working per token', o.experts ? `about ${o.activeB} of ${o.paramsB} billion` : `all ${o.paramsB} billion`], type: ['Stored as', o.type || 'unknown'], bits: ['Bits per weight', o.bits ? `about ${o.bits}` : 'unknown'] };
      return `<p class="muted">${esc(o.name || view.brain)}</p><dl class="lesson-facts">${(l.try.show || []).map((k) => `<dt>${rows[k][0]}</dt><dd>${esc(String(rows[k][1]))}</dd>`).join('')}</dl>`;
    }
    if (o.kind === 'gguf') return `<p>GGUF version ${o.version}: ${o.keys} facts in the header, ${o.tensors.toLocaleString()} tensors, data starts at byte ${o.dataStart.toLocaleString()}.</p>
      <dl class="lesson-facts">${o.facts.map(([k, v]) => `<dt><code>${esc(k)}</code></dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="lesson-table"><table><caption class="muted">The first ${o.first.length} tensors</caption><tr><th scope="col">Name</th><th scope="col">Shape</th><th scope="col">Type</th><th scope="col">Offset</th></tr>${o.first.map((t) => `<tr><td><code>${esc(t.name)}</code></td><td>${t.dims.join(' × ')}</td><td>${t.type}</td><td>${t.offset.toLocaleString()}</td></tr>`).join('')}</table></div>`;
    if (o.kind === 'chat' && o.mode === 'tools') return o.calls.length ? `<p>It called a tool:</p><pre class="lesson-call">${esc(o.calls.map((c) => `${c.name}(${c.args})`).join('\n'))}</pre><p class="learn-saw">${o.right ? 'Right tool, right name. Bob would now run it and hand back the weather.' : 'That isn\'t the one tool it was given. That\'s the kind of mistake lessons train out.'}</p>` : `<p>It answered without the tool:</p><p class="lesson-answer">${esc(o.text)}</p><p class="learn-saw">It can't know today's weather, so it should have called get_weather. That's the kind of mistake lessons train out.</p>`;
    if (o.kind === 'chat') return `<div class="learn-tries">${o.answers.map((a) => `<div class="learn-try"><strong>${esc(a.label)}</strong>${a.thought ? `<details><summary>Its thinking</summary><p class="lesson-answer">${esc(a.thought)}</p></details>` : ''}<p class="lesson-answer">${esc(a.text)}</p></div>`).join('')}</div>${o.mode === 'think' && !o.answers[1].thinks ? '<p class="muted">This brain didn\'t think out loud, so it may not be a thinking brain. The answers can still differ.</p>' : ''}`;
    return '';
  }

  function tryHtml(l) {
    const t = l.try;
    if (t.kind === 'page') return `<p>${esc(t.ask)}</p><div class="row"><button type="button" class="get" data-lessonpage="${esc(t.page)}">${esc(t.button || `Open ${PAGE_LABEL[t.page] || 'it'}`)}</button><span class="muted">It opens the page. Nothing starts until you press its own button.</span></div>`;
    if (!view.ready) return `<p class="learn-why" role="status">${esc(view.why)}${view.wake ? goBtn('chat') : /Settings, Engines/.test(view.why || '') ? goBtn('engines') : ''}</p>`;
    const s = tryState(l), box = ['tokens', 'next', 'temps', 'context', 'chat'].includes(t.kind);
    const busyWord = { tokens: 'Splitting…', next: 'Looking…', temps: 'Writing…', context: 'Counting…', facts: 'Reading…', chat: 'Asking…' }[t.kind];
    return `<p>${esc(t.ask)}</p>${box ? `<p><label for="lesson-text">${t.kind === 'context' ? 'Text to count' : t.kind === 'chat' ? 'Your question' : 'Text'}</label></p><textarea id="lesson-text" rows="${t.kind === 'context' ? 6 : 2}" maxlength="${t.kind === 'context' ? 40000 : 2000}" spellcheck="false">${esc(s.text)}</textarea>` : ''}
      <div class="row"><button type="button" class="get" data-lessontry ${s.busy ? 'disabled' : ''}>${s.busy ? busyWord : 'Try it'}</button>${t.kind === 'chat' ? '<span class="muted">It can take a minute.</span>' : ''}</div>
      ${s.err ? `<p class="error" role="alert">${esc(s.err)}</p>` : ''}<div class="learn-result" role="status" aria-live="polite">${tryResult(l, s)}</div>`;
  }

  function checkHtml(l) {
    const p = picks[l.id] || {}, done = checked[l.id], all = l.check.every((q, qi) => q.answers[p[qi]]?.right);
    return `<form class="lesson-check" data-lessoncheck>${l.check.map((q, qi) => {
      const a = q.answers[p[qi]];
      return `<fieldset><legend>${esc(q.q)}</legend>${q.answers.map((x, ai) => `<label class="lab-opt"><input type="radio" name="lq-${qi}" value="${ai}" data-q="${qi}" ${p[qi] === ai ? 'checked' : ''}> <span>${esc(x.t)}</span></label>`).join('')}
        ${done && a ? `<p class="lesson-why ${a.right ? 'right' : 'wrong'}"><strong>${a.right ? '✓ Right.' : '✗ Not quite.'}</strong> ${esc(a.why.replace(/^Right\. /, ''))}</p>` : done ? '<p class="lesson-why wrong"><strong>Pick an answer.</strong></p>' : ''}</fieldset>`;
    }).join('')}
      <div class="row"><button type="submit" class="get">Check my answers</button>${done && all ? '<strong role="status">Lesson done. ✓</strong>' : done ? '<span class="muted" role="status">Change an answer and check again.</span>' : ''}</div></form>`;
  }

  function lessonHtml(l) {
    const all = lessons(), i = all.indexOf(l), prev = all[i - 1], next = all[i + 1];
    const nav = `<div class="row lesson-nav">${prev ? `<button type="button" class="link" data-lesson="${esc(prev.id)}">← ${esc(prev.title)}</button>` : ''}${next ? `<button type="button" class="link" data-lesson="${esc(next.id)}">${esc(next.title)} →</button>` : ''}</div>`;
    return `<div class="row"><button type="button" class="link" data-lessonsback>← All lessons</button><span class="muted">Lesson ${i + 1} of ${all.length} · ${esc(levelOf(l))}${esc(unitOf(l).title)}${isDone(l.id) ? ' · done ✓' : ''}</span></div>
      <article class="learn-card lesson" aria-labelledby="lesson-h"><h3 id="lesson-h" tabindex="-1">${esc(l.title)}</h3>
        <p class="muted">Proper name: <button type="button" class="link" data-lessongloss aria-label="${esc(`${l.pro}: open the glossary`)}">${esc(l.pro)}</button> ${tip(esc(firstSentence(l.read[0])), l.pro)}</p>
        <section class="lesson-step" aria-labelledby="ls-read"><h4 id="ls-read">1. Read</h4>${l.read.map((t) => `<p>${esc(t)}</p>`).join('')}${l.real ? `<aside class="lesson-real" aria-label="Real result"><strong>Real result from my own research.</strong> ${esc(l.real.text)} <span class="muted">From ${esc(l.real.from)}.</span>${l.real.status ? ` <span class="lesson-status"><strong>How strong:</strong> ${esc(l.real.status)}</span>` : ''}</aside>` : ''}${l.cite ? `<aside class="lesson-real lesson-cite" aria-label="From the research"><strong>From the research (not my own).</strong> ${esc(l.cite.text)} <span class="muted">${esc(l.cite.who)}. <a href="${esc(l.cite.url)}" target="_blank" rel="noopener noreferrer">Source</a></span></aside>` : ''}${l.code ? `<figure class="lesson-code"><figcaption class="muted">${esc(l.code.from)}</figcaption><pre><code>${esc(l.code.text)}</code></pre></figure>` : ''}</section>
        <section class="lesson-step" aria-labelledby="ls-try"><h4 id="ls-try">2. Try it</h4>${tryHtml(l)}</section>
        <section class="lesson-step" aria-labelledby="ls-check"><h4 id="ls-check">3. Check</h4>${checkHtml(l)}</section>
      </article>${nav}`;
  }

  // The index: every Real result in one table, then other people's findings apart, so a learner can see that each
  // number traces to a chapter and a named file (dissertation 12.5).
  function indexHtml() {
    const all = lessons(), mine = all.filter((l) => l.real), theirs = all.filter((l) => l.cite), ch = view.chapters || {};
    const pick = (l) => `<button type="button" class="link" data-lesson="${esc(l.id)}">${esc(l.title)}</button><br><span class="muted">${esc(levelOf(l))}${esc(unitOf(l).title)}</span>`;
    const chap = (n) => ch[n] ? `${n}. ${esc(ch[n].title)}` : n ? String(n) : '';
    return `<div class="row"><button type="button" class="link" data-lessonsback>← All lessons</button></div>
      <h3 id="lesson-h" tabindex="-1">Where every Real result comes from</h3>
      <p>Every <strong>Real result</strong> in this course is something I measured myself and checked against its file. Here they all are: the lesson that shows it, the chapter of my write-up it comes from, how strong it is, and the file. Findings from other people's papers are listed apart, below, so the two never mix.</p>
      <div class="lesson-table lesson-index"><table><caption>My own Real results (${mine.length})</caption>
        <tr class="lesson-index-head"><th scope="col">Lesson</th><th scope="col">Chapter</th><th scope="col">What was measured</th><th scope="col">How strong</th><th scope="col">Source</th></tr>
        ${mine.map((l) => `<tr><th scope="row">${pick(l)}</th><td data-label="Chapter">${chap(l.real.ch)}</td><td data-label="What was measured">${esc(l.real.text)}</td><td data-label="How strong">${esc(l.real.status || '')}</td><td data-label="Source"><code>${esc(l.real.from)}</code></td></tr>`).join('')}</table></div>
      <div class="lesson-table lesson-index"><table><caption>From the research, not my own (${theirs.length})</caption>
        <tr class="lesson-index-head"><th scope="col">Lesson</th><th scope="col">Finding</th><th scope="col">Who</th><th scope="col">Link</th></tr>
        ${theirs.map((l) => `<tr><th scope="row">${pick(l)}</th><td data-label="Finding">${esc(l.cite.text)}</td><td data-label="Who">${esc(l.cite.who)}</td><td data-label="Link"><a href="${esc(l.cite.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(`Source for ${l.title}`)}">Source</a></td></tr>`).join('')}</table></div>
      <p class="muted">The chapters are in my write-up, docs/dissertation in my folder. A result that hasn't been re-run says so under How strong.</p>`;
  }

  function html() {
    if (!view) return `<p class="muted">${esc(msg || 'Loading...')}</p>`;
    if (!view.on) return '<p class="learn-why">Lessons are off. Turn on <strong>Lab: Lessons</strong> in Settings, How Bob works, Brains.</p>';
    const l = open && lessons().find((x) => x.id === open);
    return `<div class="lessons">${view.ready ? `<p class="muted">Try it uses the brain I have loaded: <strong>${esc(view.brain)}</strong>.</p>` : ''}${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}${l ? lessonHtml(l) : open === INDEX ? indexHtml() : listHtml()}</div>`;
  }

  function draw(focus = '') { if (!el) return; el.innerHTML = html(); if (focus) el.querySelector(focus)?.focus(); }
  async function load() { try { view = await api('/api/lab/lessons'); msg = ''; } catch (e) { msg = e.message; } draw(); }

  async function onClick(e) {
    const b = e.target.closest('button'); if (!b || !el?.contains(b)) return;
    if (b.dataset.lesson) { open = b.dataset.lesson; draw('#lesson-h'); el.scrollIntoView?.({ block: 'start' }); return; }
    if ('lessonsindex' in b.dataset) { open = INDEX; draw('#lesson-h'); el.scrollIntoView?.({ block: 'start' }); return; }
    if ('lessonsback' in b.dataset) { const was = open; open = null; draw(was === INDEX ? '[data-lessonsindex]' : `[data-lesson="${was}"].lesson-pick`); return; }
    if (b.dataset.lessonpage) { go(b.dataset.lessonpage); return; }
    if ('lessongloss' in b.dataset) { const ev = () => new CustomEvent('bob-help', { detail: 'glossary' }); window.dispatchEvent(ev()); try { window.opener?.dispatchEvent(ev()); } catch {} return; }
    if ('lessonsreset' in b.dataset) { try { view.done = (await api('/api/lab/lessons/reset', {})).done; for (const k of Object.keys(checked)) delete checked[k]; for (const k of Object.keys(picks)) delete picks[k]; } catch (err) { msg = err.message; } draw(); return; }
    if ('lessontry' in b.dataset) {
      const l = lessons().find((x) => x.id === open); if (!l) return;
      const s = tryState(l); s.busy = true; s.err = ''; draw();
      try { s.out = await api('/api/lab/lessons/try', { id: l.id, text: s.text }); } catch (err) { s.err = err.message; if (/No brain is loaded|answering in the chat/.test(err.message)) await load(); }
      s.busy = false; draw();
    }
  }
  async function onSubmit(e) {
    if (!e.target.matches?.('[data-lessoncheck]')) return;
    e.preventDefault();
    const l = lessons().find((x) => x.id === open); if (!l) return;
    checked[l.id] = true;
    const p = picks[l.id] || {};
    if (l.check.every((q, qi) => q.answers[p[qi]]?.right) && !isDone(l.id)) { try { view.done = (await api('/api/lab/lessons/done', { id: l.id, done: true })).done; } catch (err) { msg = err.message; } }
    draw('.lesson-check [role="status"]');
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'lesson-text') { const l = lessons().find((x) => x.id === open); if (l) tryState(l).text = t.value; return; }
    if (t.dataset.q !== undefined && open) { (picks[open] ||= {})[Number(t.dataset.q)] = Number(t.value); }
  }

  return {
    mount(host) {
      el = host; draw();
      el.addEventListener('click', onClick);
      el.addEventListener('submit', onSubmit);
      el.addEventListener('change', onChange);
      el.addEventListener('input', (e) => { if (e.target.id === 'lesson-text') onChange(e); });
      load();
    },
    unmount() { el = null; }
  };
}
