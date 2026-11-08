// 1.5.151 🧪 Computer Science Lab, the Learn tab: guided experiments on the brain Bob has loaded right now. Each card
// is one question, one control, one result, and a line from Bob about what you just saw. Nothing is saved.
import { esc } from './rich.js';

const TOKEN_START = 'Bob\'s favourite cheese is Wensleydale, obviously.';
const WORD_START = 'The best thing about living by the sea is';
const MAX_STEPS = 12;
const pct = (x) => `${Math.round(x * 1000) / 10}%`;
// A token's text, made visible: a leading space shows as ␣ and a line break as ⏎, so you can see them.
const shown = (t) => t.replace(/^ /, '␣').replace(/\n/g, '⏎') || '∅';

export function createLearn({ api }) {
  let el = null, view = null, msg = '';
  const tok = { text: TOKEN_START, out: null, busy: false };
  const nx = { start: WORD_START, text: WORD_START, top: null, steps: 0, busy: false };
  const tp = { start: WORD_START, temperature: 0.8, minP: 0, topP: 1, out: null, busy: false, more: false };

  const saw = {
    tokens(o) { if (!o?.tokens.length) return ''; const per = o.characters / o.tokens.length; if (o.tokens.some((t) => t.partial)) return 'Some of those pieces are only part of a character. Emoji and other alphabets are built from several pieces each, so they cost more of my memory than the same length of English.'; return per >= 4.5 ? 'I don\'t read letters or words. I read pieces, and ordinary English words often fit in one piece each, so this was cheap.' : 'I don\'t read letters or words. I read pieces, about three quarters of a word each in English and fewer in other languages, which is why they cost more of my memory.'; },
    next(top) { const best = top?.[0]?.odds || 0; if (best >= 0.6) return 'Here I was nearly sure: one word had most of the odds. Every word I write is a roll of weighted dice, and this roll was loaded.'; if (best < 0.15) return 'Here it was a toss-up: no word had much of the odds. Every word I write is a roll of weighted dice, and this time the dice were fair.'; return 'Every word I write is a roll of weighted dice. The weights come from everything I read while I was trained. Nothing is looked up.'; },
    temperature(t) { if (t < 0.3) return 'This low, I pick the likeliest word every time, so the three answers are the same or nearly. Good for facts and code.'; if (t <= 1.0) return 'This is where I usually sit: mostly the likely words, with a little room to vary.'; if (t <= 1.5) return 'Up here the odds are flattened, so I wander. Good for brainstorming, less good for getting things right.'; return 'This high I\'m picking unlikely words on purpose. It falls apart, which is fun once.'; }
  };

  const oddsList = (top, { pick = false } = {}) => `<ol class="learn-odds" aria-label="The ten likeliest next tokens">${top.map((x) => `<li>${pick ? `<button type="button" class="learn-odd" data-pick="${esc(x.token)}" aria-label="Choose ${esc(shown(x.token))}, ${pct(x.odds)}">` : '<span class="learn-odd">'}<i style="width:${Math.max(1, Math.round(x.odds * 100))}%" aria-hidden="true"></i><span class="learn-odd-text"><code>${esc(shown(x.token))}</code> <span class="muted">${pct(x.odds)}</span></span>${pick ? '</button>' : '</span>'}</li>`).join('')}</ol>`;
  const sawLine = (t) => (t ? `<p class="learn-saw"><strong>What you just saw.</strong> ${esc(t)}</p>` : '');
  const card = (id, title, why, control, result, more = '') => `<section class="learn-card" aria-labelledby="learn-${id}-h"><h3 id="learn-${id}-h">${esc(title)}</h3><p class="muted">${why}</p>${control}<div class="learn-result" role="status" aria-live="polite">${result}</div>${more}</section>`;

  function tokensCard() {
    const o = tok.out;
    const result = o ? `<ol class="learn-tokens" aria-label="The pieces">${o.tokens.map((t, i) => `<li class="learn-tok ${i % 2 ? 'b' : 'a'}${t.partial ? ' part' : ''}" title="token ${t.id}" aria-label="${esc(shown(t.text))}, token number ${t.id}"><span class="learn-tok-text">${esc(shown(t.text))}</span><span class="learn-tok-id">${t.id}</span></li>`).join('')}</ol>
      <p>${o.characters} characters, ${o.tokens.length} token${o.tokens.length === 1 ? '' : 's'}${o.tokens.length ? ` (about ${Math.round((o.characters / o.tokens.length) * 10) / 10} characters a token)` : ''}.</p>${sawLine(saw.tokens(o))}` : '';
    return card('tokens', 'What is a token?', 'I don\'t read letters or words. I read pieces called tokens, and this is how I\'d split what you type. Try a long word, a number, an emoji, or a sentence in another language.',
      `<p><label for="learn-tok-text">Something to split</label></p><textarea id="learn-tok-text" rows="2" maxlength="2000" spellcheck="false">${esc(tok.text)}</textarea>
      <div class="row"><button type="button" class="get" data-tokens ${tok.busy ? 'disabled' : ''}>${tok.busy ? 'Splitting...' : 'Split it'}</button><span class="muted">Try this: antidisestablishmentarianism · 1234567 · 🐭🧀 · Je ne parle pas français</span></div>`, result);
  }

  function nextCard() {
    const result = nx.top ? `<p class="learn-sofar" aria-label="The sentence so far"><code>${esc(nx.text)}</code><span class="learn-caret" aria-hidden="true">▮</span></p>${oddsList(nx.top, { pick: nx.steps < MAX_STEPS && !nx.busy })}
      <div class="row">${nx.steps < MAX_STEPS ? `<button type="button" class="get" data-letme ${nx.busy ? 'disabled' : ''}>Let me choose</button><span class="muted">or click a word above · step ${nx.steps + 1} of ${MAX_STEPS}</span>` : '<span class="muted">That\'s twelve words. Start again to try another sentence.</span>'}<button type="button" class="link" data-nextreset>Start again</button></div>${sawLine(saw.next(nx.top))}` : '';
    return card('next', 'How do I pick the next word?', 'Every token I write comes from a list of odds over everything I could say next. Here are my top ten for the sentence below. Click one to make me say it, or let me choose the way I usually would.',
      `<p><label for="learn-nx-start">Start of a sentence</label> <input id="learn-nx-start" type="text" maxlength="300" value="${esc(nx.start)}" ${nx.top ? 'disabled' : ''}></p>
      ${nx.top ? '' : `<div class="row"><button type="button" class="get" data-next ${nx.busy ? 'disabled' : ''}>${nx.busy ? 'Looking...' : 'Show my odds'}</button></div>`}`, result);
  }

  function temperatureCard() {
    const o = tp.out;
    const result = o ? `<div class="learn-tries">${o.tries.map((t, i) => `<div class="learn-try"><span class="muted">Try ${i + 1} · ${t.seconds}s</span><p><code>${esc(tp.start)}</code>${esc(t.text)}</p></div>`).join('')}</div>
      <p class="muted">My odds for the very first word, at this setting:</p>${oddsList(o.top)}${sawLine(saw.temperature(tp.temperature))}` : '';
    return card('temperature', 'What does temperature do?', 'Temperature reshapes my odds before I roll. Low makes the likeliest word even likelier; high flattens the odds so unlikely words get a turn. Slide it and I\'ll write the same start three times.',
      `<p><label for="learn-tp">Temperature</label> <input id="learn-tp" type="range" min="0" max="2" step="0.1" value="${tp.temperature}"> <input id="learn-tp-n" type="number" min="0" max="2" step="0.1" value="${tp.temperature}" aria-label="Temperature"> <span class="muted">${tp.temperature < 0.3 ? 'cold: the same every time' : tp.temperature <= 1 ? 'warm: where I usually sit' : tp.temperature <= 1.5 ? 'hot: I wander' : 'scorching: anything goes'}</span></p>
      <details ${tp.more ? 'open' : ''} data-more><summary>More knobs</summary>
        <p><label for="learn-minp">Cut the long tail (min_p)</label> <input id="learn-minp" type="range" min="0" max="0.5" step="0.05" value="${tp.minP}"> <input id="learn-minp-n" type="number" min="0" max="0.5" step="0.05" value="${tp.minP}" aria-label="min_p"> <span class="muted">Drops any word with less than this share of the top word's odds. 0 keeps them all.</span></p>
        <p><label for="learn-topp">Only the likeliest (top_p)</label> <input id="learn-topp" type="range" min="0.5" max="1" step="0.05" value="${tp.topP}"> <input id="learn-topp-n" type="number" min="0.5" max="1" step="0.05" value="${tp.topP}" aria-label="top_p"> <span class="muted">Keeps only the likeliest words that add up to this much of the odds. 1 keeps them all.</span></p>
      </details>
      <p><label for="learn-tp-start">Start of a sentence</label> <input id="learn-tp-start" type="text" maxlength="300" value="${esc(tp.start)}"></p>
      <div class="row"><button type="button" class="get" data-try ${tp.busy ? 'disabled' : ''}>${tp.busy ? 'Writing...' : 'Write it three times'}</button></div>`, result);
  }

  function html() {
    if (!view) return `<p class="muted">${esc(msg || 'Loading...')}</p>`;
    const head = view.ready ? `<p class="muted">These run on the brain I have loaded right now: <strong>${esc(view.brain)}</strong>. Nothing you do here changes how I answer in the chat, and nothing is saved.</p>` : `<p class="learn-why" role="status">${esc(view.why)}</p>`;
    return `<div class="learn">${head}${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}${view.ready ? tokensCard() + nextCard() + temperatureCard() : ''}</div>`;
  }

  function draw() { if (el) el.innerHTML = html(); }
  async function load() { try { view = await api('/api/lab/learn'); msg = ''; } catch (e) { msg = e.message; } draw(); }
  const call = async (kind, body) => api(`/api/lab/learn/${kind}`, body);

  async function run(state, fn) {
    state.busy = true; msg = ''; draw();
    try { await fn(); } catch (e) { msg = e.message; if (/No brain is loaded|answering in the chat/.test(e.message)) await load(); }
    state.busy = false; draw();
  }

  function onChange(e) {
    const t = e.target;
    if (t.id === 'learn-tok-text') tok.text = t.value;
    else if (t.id === 'learn-nx-start') { nx.start = t.value; nx.text = t.value; }
    else if (t.id === 'learn-tp-start') tp.start = t.value;
    else if (t.id === 'learn-tp' || t.id === 'learn-tp-n') { tp.temperature = Math.round(Number(t.value) * 10) / 10; draw(); }
    else if (t.id === 'learn-minp' || t.id === 'learn-minp-n') tp.minP = Number(t.value);
    else if (t.id === 'learn-topp' || t.id === 'learn-topp-n') tp.topP = Number(t.value);
  }
  function onInput(e) { // each slider and its number box move together
    const pairs = { 'learn-tp': 'learn-tp-n', 'learn-tp-n': 'learn-tp', 'learn-minp': 'learn-minp-n', 'learn-minp-n': 'learn-minp', 'learn-topp': 'learn-topp-n', 'learn-topp-n': 'learn-topp' };
    const other = pairs[e.target.id]; if (other) { const o = el.querySelector(`#${other}`); if (o) o.value = e.target.value; }
  }
  async function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if ('tokens' in b.dataset) return run(tok, async () => { tok.out = await call('tokens', { text: tok.text }); });
    if ('next' in b.dataset) return run(nx, async () => { nx.text = nx.start; nx.steps = 0; nx.top = (await call('next', { text: nx.text })).top; });
    if ('nextreset' in b.dataset) { nx.top = null; nx.steps = 0; nx.text = nx.start; return draw(); }
    if (b.dataset.pick !== undefined || 'letme' in b.dataset) return run(nx, async () => {
      const word = b.dataset.pick !== undefined ? b.dataset.pick : (await call('next', { text: nx.text })).picked;
      nx.text += word; nx.steps++;
      nx.top = (await call('next', { text: nx.text })).top;
    });
    if ('try' in b.dataset) return run(tp, async () => { tp.out = await call('try', { text: tp.start, temperature: tp.temperature, minP: tp.minP, topP: tp.topP }); });
  }

  return {
    // Draw the tab into `host` and listen there. Called every time the Lab page redraws with the Learn tab open.
    mount(host) {
      el = host; draw();
      el.addEventListener('change', onChange);
      el.addEventListener('input', onInput);
      el.addEventListener('click', onClick);
      el.addEventListener('toggle', (e) => { if (e.target.matches('[data-more]')) tp.more = e.target.open; }, true);
      load();
    },
    unmount() { el = null; }
  };
}
