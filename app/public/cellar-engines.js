// Settings: Brain Engines, speed, the speed log and test, Qwen and tuning pages. Split out of cellar.js.
import { esc } from './util.js';
import { tip, keep } from './tips.js';
import { brainEngineName } from './engine-name.js';

// now() hands over createCellar's own values as they are at the moment of each call; fresh() copies them in.
export function createEngineParts(now) {
  let data, engineById, gamingCardHtml, live, memoryBanksHtml, more, progress, roles, settings, speedLogData, speedModel, speedRuns, sswitch;
  const fresh = () => { ({ data, engineById, gamingCardHtml, live, memoryBanksHtml, more, progress, roles, settings, speedLogData, speedModel, speedRuns, sswitch } = now()); };
  // Making Bob's own engine (llama.cpp) faster. Blank means llama.cpp's own default.
  function speedHtml() {
    const sp = settings.speed || {};
    const d = sp.draft || {};
    const llms = roles?.options?.llm || [];
    const n = (k, label, hint) => `<label class="pick"><span>${label}</span><input type="text" inputmode="numeric" data-speed="${k}" value="${esc(sp[k] ?? '')}" placeholder="${hint}" style="width:7em"></label>`;
    const models = [...new Set([...llms.map((o) => o.value), ...Object.keys(sp.modelArgs || {}), ...Object.keys(sp.expertsPerWord || {})])];
    const pw = sp.expertsPerWord?.[speedModel || models[0]];
    return `<div><strong>Speed (Bob's own engine)</strong>${settings.engine === 'llamacpp' ? '' : ' <span class="tag">only used with Bob\'s own engine</span>'} ${tip('Changes apply the next time a brain loads. Leave a box empty for the engine\'s default.', 'Speed')}
      <div class="row">${n('threads', 'Threads', 'auto')}${n('batch', 'Batch', '2048')}${n('ubatch', 'Micro-batch', '512')}</div>
      <label class="switch"><input type="checkbox" data-fit ${sp.fit !== false ? 'checked' : ''}><span><strong>Fit to free graphics memory</strong> <span class="tag good">recommended</span> ${tip('Fits each brain around whatever else is using the graphics card right now. Faster and steadier than a fixed split.', 'Fit to free graphics memory')}</span></label>
      <label class="switch"><input type="checkbox" data-draft="enabled" ${d.enabled && d.model ? 'checked' : ''}><span><strong>Speculative decoding</strong> <span class="tag warn">experimental</span> ${tip('A small "draft" brain guesses ahead and the big one checks: often 1.5 to 2 times faster, same answers. The draft must be from the same family (for example a small Qwen for a big Qwen). Not every pair works: check that Bob got faster. The exact command is in inn\\bob\\llama-server-args.txt.', 'Speculative decoding')}</span></label>
      <div class="row"><label class="pick"><span>Draft brain</span><select data-draft="model"><option value="">Pick one</option>${llms.map((o) => `<option value="${esc(o.value)}" ${o.value === d.model ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}${d.model && !llms.some((o) => o.value === d.model) ? `<option selected value="${esc(d.model)}">${esc(d.model)}</option>` : ''}</select></label>
        <label class="pick"><span>Guess up to (words ahead)</span><input type="text" inputmode="numeric" data-draft="max" value="${esc(d.max ?? 16)}" style="width:5em" aria-label="Guess up to this many words ahead"></label>
        <label class="pick"><span>At least (words ahead)</span><input type="text" inputmode="numeric" data-draft="min" value="${esc(d.min ?? 1)}" style="width:5em" aria-label="Guess at least this many words ahead"></label></div>
      ${turboRowsHtml(sp, llms)}
      ${sp.trainer ? `<p class="muted">The Lab's Trainer pack is here (for Teach it). <button type="button" class="link" data-trainerremove aria-expanded="false">Remove the Trainer pack</button></p>` : ''}
      <div class="row"><label class="pick"><span>Extra settings for one brain</span><select data-margsmodel>${models.map((m) => `<option ${m === speedModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
        <label class="pick" style="flex:1"><span>Engine flags (for example <code>--n-cpu-moe 8</code>)</span><input type="text" data-margs value="${esc((sp.modelArgs?.[speedModel || models[0]] || []).join(' '))}" placeholder="none"></label>
        <label class="pick"><span>Experts per word <span class="tag warn">experimental</span> ${tip('For a mixture-of-experts brain: how many of its experts it asks for each word. Empty means the brain\'s own count, which is how it was made. More is slower and can help or hurt; fewer is faster. One number, or one per layer with commas. Brain Engine changes it before the next answer without reloading, and the brain file never changes. Try counts first in the Lab, Peek inside.', 'Experts per word')}</span><input type="text" inputmode="numeric" data-perword value="${esc(pw == null ? '' : Array.isArray(pw) ? pw.join(',') : pw)}" placeholder="its own" style="width:9em" aria-label="Experts per word for this brain, empty for its own"></label></div>
    </div>`;
  }
  // 1.5.16x Turbo per brain: rows the Lab's Turbo page wrote with "Use this in Bob". Each wins over the one draft above
  // for its brain. Switch, guess length, Remove; the guesser itself is picked (and measured) in the Lab.
  function turboRowsHtml(sp, llms) {
    const rows = Object.entries(sp.turbo || {}).filter(([, t]) => t);
    if (!rows.length) return '';
    const nameOf = (id) => llms.find((o) => o.value === id)?.label || id;
    return `<div><strong>Turbo, per brain</strong> ${tip('Set from the Lab, Test, Faster: "Use this in Bob". For these brains this wins over the draft brain above. Its own guesser means the brain carries a multi-token head, so nothing else loads.', 'Turbo, per brain')}
      ${rows.map(([id, t]) => `<div class="row"><label class="switch"><input type="checkbox" data-turbo="${esc(id)}" data-turbok="on" ${t.on ? 'checked' : ''}><span><strong>${esc(nameOf(id))}</strong> <span class="muted">${t.mtp ? 'its own guesser' : `${esc(nameOf(t.draft))} guessing`}</span></span></label>
        <label class="pick"><span>Guess ahead</span><input type="text" inputmode="numeric" data-turbo="${esc(id)}" data-turbok="max" value="${esc(t.max ?? 8)}" style="width:4em" aria-label="Guess this many words ahead for ${esc(nameOf(id))}"></label>
        <button type="button" class="link" data-turboremove="${esc(id)}">Remove</button></div>`).join('')}</div>`;
  }
  // 1.5.98: Speed & memory (split from Engines & speed).
  function speedMemoryHtml() {
    const ka = settings.ollamaKeepAlive || '5m';
    const kaOpts = [['1m', '1 minute'], ['2m', '2 minutes'], ['150s', '2½ minutes'], ['5m', '5 minutes'], ['10m', '10 minutes'], ['15m', '15 minutes'], ['30m', '30 minutes'], ['1h', '1 hour']];
    const held = settings.brainMode === 'always';
    return `<label class="pick${held ? ' dim' : ''}"><strong>Free memory after Bob has been quiet for</strong>
        <select data-set="keepAlive" aria-label="Free memory after Bob has been quiet for">${kaOpts.some(([v]) => v === ka) ? '' : `<option value="${esc(ka)}" selected>${esc(ka)}</option>`}${kaOpts.map(([v, label]) => `<option value="${v}" ${v === ka ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <span class="muted">${held ? 'Not used right now: "Free memory when Bob is idle" on the chat page is off, so his small brain stays loaded.' : 'Used while "Free memory when Bob is idle" on the chat page is on.'} Big brains (Coding, and Medium effort and up) are freed after 2 minutes, or sooner if you pick less.</span></label>
      ${sswitch('quickOnCpu', settings.quickOnCpu === true, 'Keep the graphics card free for quick answers', 'Low effort answers run on the processor, so games and pictures keep the card. Replies start much slower (about half a minute). A message with a link still goes to your main Brain, which reads web pages better. Applies in the Normal session; Gaming always does this.')}
      ${sswitch('pictureNoWait', settings.pictureNoWait !== false, 'Show pictures without waiting for Bob\'s brain', 'Bob shows a finished picture or clip straight away with a short line, instead of loading his brain back just to talk about it. Turn off if you want him to comment on each one.')}
      ${tuneHtml()}
      ${gamingCardHtml()}
      ${sswitch('memoryRecall', settings.memoryRecall === true, 'Remember only what fits', 'With each message, Bob reads only the memories that fit it (up to 8), not his whole memory file, so chats stay light. Off: he reads all of it every time.')}
      ${more('Each project gets its own memory bank: while you talk about one project, Bob leaves the other projects\' memories out. To have him read a line every time, add [always] to it in his memory file. He matches by meaning when the 🗂 Memory (finding past chats) model is downloaded (it runs on the processor, never in the Gaming session), and by words otherwise.')}
      ${settings.memoryRecall ? memoryBanksHtml() : ''}
      ${engineExtrasHtml()}
      ${sswitch('memorySources', settings.memorySources === true, 'Note where each memory came from', 'Off unless you turn it on. Each new memory keeps a link to the chat it was learned in. Below, Where my memories came from lists them with Open the chat and Forget, so a wrong one is easy to trace and fix.')}
      ${sswitch('memoryExpiry', settings.memoryExpiry === true, 'Let memories run out', 'Off unless you turn it on. Say "remember this for the week" (or for a day, a month, or until a date) and Bob stops reading that memory once the time is up, then takes it out of his memory file when he\'s idle. The old file goes to the Recycle Bin first.')}
      ${sswitch('memoryWhere', settings.memoryWhere === true, 'Keep project memories to their project', 'Off unless you turn it on. Works with Remember only what fits on. A memory in a project\'s bank comes back only while Bob works on that project: you name it, or he opens a file in its folder or repository. In other chats he reads only your general memories.')}
      <div class="srow memory-sources"><button type="button" data-memsources>Where my memories came from</button> <span class="muted">Every memory, newest first, with the chat it came from.</span><div class="mem-src"></div></div>
      ${speedTestHtml()}`;
  }
  // List items 94-98: engine and speed extras, each off unless turned on. (99 sits in Engines, 100 on the Brains page.)
  function engineExtrasHtml() {
    const bat = settings.onBattery === true ? 'On battery right now.' : settings.onBattery === false ? 'Plugged in right now.' : settings.laptopMode ? 'No battery found, so nothing changes here.' : '';
    return `<div class="tune engine-extras"><strong>Engine extras</strong> <span class="tag">off unless you turn it on</span>
         ${tip('Each switch is separate. They work with Brain Engine and llama.cpp; Ollama runs its own way, so only the speed history and Laptop mode reach it. Bob\'s Android app runs its own small engine and isn\'t changed by these.', 'Engine extras')}
        ${sswitch('copyGuess', settings.copyGuess === true, 'Guess ahead by copying from the chat', 'When Bob rewrites code or a document, most of the words are already in the chat. The engine guesses them by copying and the brain checks each guess, so edits come out faster and the answer is the same. No second brain needed. Not used while Turbo is on for that brain.')}
        ${sswitch('preloadNext', settings.preloadNext === true, 'Load the next brain early', 'When Bob hands a job to another brain (like the coder), he reads that brain\'s file into memory while the first one is still writing, so the swap is quicker. Only when there\'s room: the brain plus 4 GB free.')}
        ${sswitch('laptopMode', settings.laptopMode === true, 'Laptop mode', `On battery, Bob's Quick brain answers the chat and the engine uses half the cores. Plugged in, nothing changes.${bat ? ' ' + keep(bat) : ''}`)}
        ${sswitch('newCardTest', settings.newCardTest === true, 'Test a new graphics card by itself', 'When Bob starts and sees a different graphics card, he runs the one-minute speed test once he\'s free, and puts brains set by hand on the Brains page back on Auto.')}
        ${sswitch('speedLog', settings.speedLog === true, 'Keep a speed history', 'After each reply, Bob adds its words per second to one line per day, brain and engine version. Only the numbers are kept, here, for 90 days.')}
        ${speedLogHtml()}
      </div>`;
  }
  // 96 Speed history: one small line chart per brain, words a second by day, with a mark where the engine changed.
  function speedLogHtml() {
    if (!settings.speedLog) return '';
    const brains = speedLogData?.brains || [];
    if (!brains.length) return '<p class="muted">No replies counted yet. The chart starts with the next one.</p>';
    const W = 260, H = 60;
    const chart = (b) => {
      const pts = b.points.slice(-30), top = Math.max(...pts.map((p) => p.avg), 1);
      const x = (i) => (pts.length > 1 ? (i * W) / (pts.length - 1) : W / 2), y = (v) => H - 4 - (v / top) * (H - 8);
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(' ');
      const marks = pts.map((p, i) => (i && p.engine !== pts[i - 1].engine ? `<line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="0" y2="${H}" class="speed-mark"><title>${esc(p.engine || 'engine')} from ${esc(p.day)}</title></line>` : '')).join('');
      const last = pts[pts.length - 1];
      const words = `${esc(b.model)}: ${last.avg} words a second on ${esc(last.day)}, highest ${top}.`;
      return `<figure class="speed-log"><figcaption><strong>${esc(b.model)}</strong> <span class="muted">${last.avg} words/s · ${esc(last.engine || '')}</span></figcaption>
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${words}">${marks}<path d="${line}" class="speed-line" fill="none"/></svg>
        ${b.slower ? `<p class="speed-slower">⚠ Slower since ${esc(b.slower.engine || 'the engine changed')}: ${b.slower.after} words a second, was ${b.slower.before} on ${esc(b.slower.from || 'the one before')}. Go back in Settings, Engines puts the old engine back.</p>` : ''}</figure>`;
    };
    return `<div class="speed-logs">${brains.map(chart).join('')}</div>`;
  }
  // 1.5.98: Engines (the rest of Engines & speed). The fine-tuning sits under More.
  // 1.5.17x Engines rework: the engine for Bob's brains sits behind a ⚙ (Brain Engine, llama.cpp or Ollama), the Lab
  // has its own pick, and the engines are grouped and folded. Each engine shows one status with one main button:
  // Get, Update (swapped in place, the old build kept), Go back, Remove. Updates are told apart by the download's
  // checksum, so a rebuilt Brain Engine shows as an update even though its name stays the same.
  const openGroups = new Set(['thinking']); // which engine groups are unfolded, kept across redraws
  const ENGINE_NAMES = { brainengine: 'Brain Engine', llamacpp: 'llama.cpp', ollama: 'Ollama' };
  const ENGINE_GROUPS = [['thinking', 'Thinking', 'The engines that run Bob\'s brains.'], ['senses', 'Pictures, sound and hearing', 'Painting, music and sound effects, and turning your voice into text.'], ['voices', 'Voices', 'How Bob reads replies aloud.'], ['helpers', 'Helpers', 'Programs the Hands use for documents, converting and connected apps.']];
  // 1.5.196: Brain Engine is the only engine for Bob's brains wherever it has a build (Windows, x64 Linux). Where it has
  // none yet (a Mac, an ARM board), Bob's own llama.cpp runs them. No picker: there's nothing to pick.
  function engineGearHtml() {
    const ch = data.engineChoices || {};
    const be = engineById('brainengine');
    const only = ch.only || (be && be.available !== false ? 'brainengine' : 'llamacpp');
    const now = ch.brainsNow || only;
    const line = only === 'brainengine'
      ? (now === 'brainengine' ? 'Bob\'s brains run on Brain Engine, the only engine that fits him now.' : 'Brain Engine is the only engine that fits Bob\'s brains now. It isn\'t here yet: Get it under Thinking, below. Until then the llama.cpp already here stands in.')
      : `Bob's brains run on plain llama.cpp here. ${be?.note || 'There\'s no Brain Engine build for this replicant matrix yet.'} He moves to Brain Engine when there is one.`;
    return `<p data-engine-now><strong>Engine for brains:</strong> ${esc(ENGINE_NAMES[only])} <span class="muted">${esc(line)}</span></p>`;
  }
  function labEngineHtml() {
    const lab = data.engineChoices?.lab || '';
    return `<label class="pick"><strong>Engine for the Lab</strong>
        <select data-labengine aria-label="Engine for the Lab">${[['', 'Same as Bob\'s brains'], ['brainengine', 'Brain Engine'], ['llamacpp', 'llama.cpp']].map(([v, l]) => `<option value="${v}" ${v === lab ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="muted">Which engine the Computer Science Lab makes, tests and runs brains with, from its next job. If a tool is only in one engine's download (the direction finder, say), the Lab still finds it there. The Lab page shows the same choice at the top.</span></label>`;
  }
  // Brain Engine is Bob's own engine. From build 5 a build is named N1bN2 (its own number, then the llama.cpp build
  // under it: "5b12282"), read from the installed build's release name (public/engine-name.js); older ones as before.
  const newName = (v) => (/^brain-engine-\d+b\d+$/.test(String(v || '')) ? brainEngineName(v) : '');
  const verName = (e, v) => (e.id !== 'brainengine' ? v : newName(v) || String(v || '').replace(/^brain-engine-v(\d+)$/, (m, n) => `version ${n}${e.basedOn ? `, built on llama.cpp ${e.basedOn}` : ''}`).replace(/^brain-engine-(b\d+)$/, 'built on llama.cpp $1'));
  // 1.5.203: the Go back button names the build plainly: "the previous engine (llama.cpp b12282)" or "(version 3)".
  const prevName = (e, v) => newName(v) || String(v || '').replace(/^brain-engine-v(\d+)$/, 'version $1').replace(/^brain-engine-(b\d+)$/, 'llama.cpp $1');
  function engineCard(e) {
    const ch = data.engineChoices || {};
    const inUse = [ch.brainsNow === e.id ? 'runs the brains' : '', e.id !== 'llamacpp' && e.id !== 'brainengine' ? '' : (ch.lab === e.id || (!ch.lab && ch.brainsNow === e.id)) ? 'the Lab uses it' : ''].filter(Boolean);
    const tags = inUse.length ? ` <span class="tag good">${esc(inUse.join(', '))}</span>` : '';
    let act;
    // 1.5.185 An update that came with files missing was kept aside, not put in: say so, and offer only those files.
    const held = e.incomplete && !live.has('engine:' + e.id + '@missing') ? `<div class="engine-held" role="status"><p><strong>The ${esc(e.name)} update${e.incomplete.version ? ` (${esc(verName(e, e.incomplete.version))})` : ''} is missing ${esc(e.incomplete.what)}</strong>, so Bob didn't put it in. The ${esc(e.name)} you have is still the one in use.</p><button class="get" data-engine="${esc(e.id)}" data-missing="1">Download the missing files</button></div>` : '';
    if (live.has('engine:' + e.id + '@missing')) act = progress(live.get('engine:' + e.id + '@missing'));
    else if (live.has('engine:' + e.id)) act = progress(live.get('engine:' + e.id));
    else if (e.installed) {
      const ver = e.found ? esc(e.found[0].toUpperCase() + e.found.slice(1)) : `Here${e.version ? `: ${esc(verName(e, e.version))}` : ''}${e.tested && e.version === e.tested ? ', the tested build' : ''}`;
      act = `<div class="have">✓ ${ver}</div>`
        + (e.pinned || e.available === false || e.found ? '' : `<button data-checkengine="${esc(e.id)}">Check for updates</button>`)
        + (e.previous && e.canSwap ? (e.blocked ? `<button data-engineback="${esc(e.id)}">Try again</button>` : `<button data-engineback="${esc(e.id)}">Go back to the previous engine (${esc(prevName(e, e.previous))})</button>`) : '')
        + (e.tested && e.version && e.version !== e.tested && !e.found && !e.previous ? `<button data-engine="${esc(e.id)}">Go back to the tested build (${esc(verName(e, e.tested))})</button>` : '')
        + (e.own && e.canSwap ? `<button class="link" data-engineremove="${esc(e.id)}">Remove</button>` : '');
    } else if (e.available === false) act = `<div class="muted">${esc(e.note || 'Not for this replicant matrix yet.')}</div>`;
    else act = `<button class="get" data-engine="${esc(e.id)}">Get ${esc(e.name)}</button>`;
    const blockedNote = e.blocked?.manual ? `<div class="engine-held" role="status"><p><strong>You went back to the previous build</strong>, so Bob keeps using it and doesn't fetch the newer one${e.blocked.version ? ` (${esc(prevName(e, e.blocked.version))})` : ''} again. <strong>Try again</strong> puts the newer one back in.</p></div>` : e.blocked ? `<div class="engine-held" role="status"><p><strong>${e.blocked.windows ? 'Windows blocked the new build' : 'The new build wouldn\'t start'}${e.blocked.version ? ` (${esc(prevName(e, e.blocked.version))})` : ''}</strong>, so Bob went back to the one he had before and uses that.${e.blocked.windows ? ' Windows\' Smart App Control stops programs that aren\'t signed yet.' : ''} <strong>Try again</strong> puts the new one back in. Help has more under Smart App Control.</p></div>` : '';
    return `<article class="model" id="m-engine:${esc(e.id)}"><header><strong>${esc(e.name)}</strong>${tags}</header><p>${esc(e.what)}</p>${held}${blockedNote}<div class="act">${act}</div><div class="confirm" hidden></div></article>`;
  }
  function enginesHtml() {
    const all = data.engines || [];
    const groups = ENGINE_GROUPS.map(([id, label, hint]) => {
      const only = data.engineChoices?.only || 'brainengine';
      const list = all.filter((e) => (e.group || 'helpers') === id && !(id === 'thinking' && e.id !== only)).sort((a, b) => (a.id === 'brainengine' ? -1 : b.id === 'brainengine' ? 1 : 0));
      const here = list.filter((e) => e.installed).length;
      const cards = list.map(engineCard).join(''); // 1.5.196: no Ollama card, no llama.cpp card where Brain Engine has a build
      return `<details class="engine-group" data-egroup="${id}" ${openGroups.has(id) ? 'open' : ''}><summary><strong>${esc(label)}</strong> <span class="muted">${here} of ${list.length} here</span></summary><p class="muted">${esc(hint)}</p>${cards}</details>`;
    }).join('');
    return `${engineGearHtml()}
      ${labEngineHtml()}
      <div><strong>Engine downloads</strong> ${tip('The programs that run the models, from their official GitHub pages (Brain Engine from Bob\'s own), matched to your graphics card. Update swaps a new build in and keeps the one before, so Go back puts it straight back without downloading. Bob checks a download\'s checksum, so a rebuilt engine with the same name still shows as an update.', 'Engine downloads')}
        <div class="row"><button type="button" data-checkall>Check all for updates</button></div>
        ${sswitch('engineNotes', settings.engineNotes === true, 'Tell me what engine updates change', `Off unless you turn it on. When an engine update finishes, Bob adds one or two plain lines to his message in the chat: what it changes for you.${settings.engineNotes && settings.engineNote ? ` The engine you have now: ${esc(settings.engineNote)}` : ''}`)}
        ${sswitch('engineAuto', settings.engineUpdates?.auto !== false, 'Keep engines up to date', 'On unless you turn it off. When Bob starts and about once a day, he checks the plain llama.cpp that stands in for Brain Engine and updates it by himself, only while no brain is loaded on it. Brain Engine updates with Bob himself, whatever this says. Go back puts the old build back. The other engines wait until you press Check for updates.')}
        ${groups}</div>
      ${qwenHtml()}
      <details class="more"><summary>More</summary>${speedHtml()}</details>`;
  }
  // 1.5.148: how Qwen3.6 brains (and Bob's own brains made from them) pick their words. Qwen's settings by default,
  // one set per mode; the person can switch on their own numbers. Every field has a visible label for screen readers.
  const QWEN_FIELDS = [['temperature', 'Temperature', 0, 2, 0.05], ['top_p', 'Top P', 0, 1, 0.05], ['top_k', 'Top K', 0, 200, 1], ['min_p', 'Min P', 0, 1, 0.01], ['presence_penalty', 'Presence penalty', 0, 2, 0.1], ['repeat_penalty', 'Repetition penalty', 1, 2, 0.05]];
  function qwenHtml() {
    const own = settings.qwenPresets || {};
    const qd = settings.qwenDefaults || {};
    const on = own.on === true;
    const rows = Object.entries(qd).map(([id, d]) => {
      const mine = { ...d, ...(own[id] || {}) };
      return `<fieldset class="qwen-preset" data-qpreset="${esc(id)}"><legend><strong>${esc(d.label)}</strong></legend>
        <div class="row">${QWEN_FIELDS.map(([k, label, lo, hi, step]) => `<label class="pick"><span>${label}</span><input type="number" inputmode="decimal" data-qfield="${k}" min="${lo}" max="${hi}" step="${step}" value="${esc(String(mine[k] ?? ''))}" aria-label="${esc(d.label)}: ${label}"></label>`).join('')}</div>
        <button type="button" data-qreset="${esc(id)}">Back to Qwen's</button></fieldset>`;
    }).join('');
    return `<div class="qwen-presets" data-qbox><strong>How Qwen brains pick their words</strong> <span class="tag">Qwen's settings unless you change them</span>
        ${tip('On the built-in engine, Qwen3.6 brains, and Bob\'s own brains made from them, use the settings Qwen recommends: one set when they think it through, a cooler set when they think through code, and one for quick replies. Switch this on only if you want to try your own numbers.', 'How Qwen brains pick their words')}
        ${sswitch('qwenPresetsOn', on, 'Choose my own word settings', 'Off: Bob uses Qwen\'s. On: the numbers below are used instead, from the next reply.')}
        ${rows}</div>`;
  }
  // 1.5.24: speed for this PC. Three switches (off unless turned on) and a before-and-after speed test.
  function tuneHtml() {
    const sw = (on, name) => `${on ? '✓' : '–'} ${name}`;
    return `<div class="tune"><strong>Speed for this replicant matrix</strong> <span class="tag">off unless you turn it on</span>
         ${tip('Try one switch at a time: run the speed test, turn the switch on, and run it again. The table keeps your last results so you can compare. Bob never changes Windows or driver settings; Check this replicant matrix (on the Everyday page) only suggests them.', 'Speed for this replicant matrix')}
        ${sswitch('readyWhileTyping', settings.readyWhileTyping === true, 'Get Bob ready while you type', 'He reads his instructions as soon as you start typing, so replies start sooner.')}
        ${sswitch('gamesFirst', settings.gamesFirst === true, 'Let games go first', 'When Bob works on the processor, he uses fewer cores at lower priority. His replies may be a little slower.')}
        ${sswitch('pictureFit', settings.pictureFit === true, 'Match picture settings to my graphics card', 'Big cards keep the picture model in graphics memory, which is faster. On cards with 8 GB or less, and on built-in graphics, pictures are made at 768 px so they fit and come quicker.')}
      </div>`;
  }
  // 1.5.98: the speed test and its table, at the bottom of Speed & memory.
  function speedTestHtml() {
    const rows = speedRuns.slice(-6).reverse().map((r) => `<tr><td>${esc(new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</td><td>${esc(r.model)}<br><span class="muted">${esc(r.where)}</span></td><td>${r.wake} s</td><td><strong>${r.first.firstWord} s</strong></td><td>${r.first.full} s</td><td>${r.next.firstWord} s</td><td class="muted">${sw(r.switches?.readyWhileTyping, 'Ready while typing')} · ${sw(r.switches?.gamesFirst, 'Games first')} · ${sw(r.switches?.pictureFit, 'Matched pictures')}</td></tr>`).join('');
    return `<div class="tune speed-test"><div class="row"><button type="button" data-speedtest>Test Bob's speed</button><span class="speed-out muted">Takes about a minute. Bob frees his brain and wakes it, as when you start typing.</span></div>
        ${rows ? `<div class="speed-table"><table><thead><tr><th>When</th><th>Brain</th><th>Load</th><th>First word</th><th>Full answer</th><th>Second reply</th><th>Switches</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      </div>`;
  }
  function pcCheckHtml(r) {
    const tip = (t) => `<article class="pc-tip"><header><strong>${t.level === 'optional' ? '' : '⚠ '}${esc(t.title)}</strong></header><p class="muted">${esc(t.why)}</p><ol>${t.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></article>`;
    const fixes = r.tips.filter((t) => t.level !== 'optional'), opts = r.tips.filter((t) => t.level === 'optional');
    return `<p><strong>${fixes.length ? `${fixes.length} thing${fixes.length === 1 ? '' : 's'} could make Bob faster` : 'Nothing slowing Bob down was found.'}</strong> <span class="muted">Bob only looked; he changed nothing.</span></p>
      ${fixes.map(tip).join('')}
      ${r.fine.length ? `<ul class="pc-fine">${r.fine.map((f) => `<li>✓ ${esc(f)}</li>`).join('')}</ul>` : ''}
      ${opts.map(tip).join('')}`;
  }
  return {
    speedHtml: (...a) => { fresh(); return speedHtml(...a); },
    turboRowsHtml: (...a) => { fresh(); return turboRowsHtml(...a); },
    speedMemoryHtml: (...a) => { fresh(); return speedMemoryHtml(...a); },
    engineExtrasHtml: (...a) => { fresh(); return engineExtrasHtml(...a); },
    speedLogHtml: (...a) => { fresh(); return speedLogHtml(...a); },
    openGroups,
    ENGINE_NAMES,
    ENGINE_GROUPS,
    engineGearHtml: (...a) => { fresh(); return engineGearHtml(...a); },
    labEngineHtml: (...a) => { fresh(); return labEngineHtml(...a); },
    newName: (...a) => { fresh(); return newName(...a); },
    verName: (...a) => { fresh(); return verName(...a); },
    prevName: (...a) => { fresh(); return prevName(...a); },
    engineCard: (...a) => { fresh(); return engineCard(...a); },
    enginesHtml: (...a) => { fresh(); return enginesHtml(...a); },
    QWEN_FIELDS,
    qwenHtml: (...a) => { fresh(); return qwenHtml(...a); },
    tuneHtml: (...a) => { fresh(); return tuneHtml(...a); },
    speedTestHtml: (...a) => { fresh(); return speedTestHtml(...a); },
    pcCheckHtml: (...a) => { fresh(); return pcCheckHtml(...a); }
  };
}
