// Settings: the voice pages (Bob's voice, samples, voices from other Bobs, talking in the cloud). Split out of cellar.js.
import { sampleButton, sampleHint } from './voice-samples.js';
import { esc } from './util.js';
import { tip } from './tips.js';

// now() hands over createCellar's own values as they are at the moment of each call; fresh() copies them in.
export function createVoiceParts(now) {
  let engineById, engineStep, roles, settings, sswitch, voices, winVoices;
  const fresh = () => { ({ engineById, engineStep, roles, settings, sswitch, voices, winVoices } = now()); };
  // Bob's own voice: which Kokoro voice and how fast. Piper voices and Chatterbox are picked in Model roles.
  // The Kokoro voice Bob recommends (Onyx), from the server so there's one place to change it.
  const kokoroDefault = () => settings.kokoroDefault || 'am_onyx';
  const voiceOf = (engine, voice) => voices.find((v) => v.engine === engine && v.voice === voice);
  const hear = (engine, voice, label) => sampleButton(engine, voice, label, sampleHint(voiceOf(engine, voice)));
  // Every Kokoro voice with a play button, so they can be compared without picking each one.
  function kokoroGrid(canUse) {
    const list = voices.filter((v) => v.engine === 'kokoro');
    if (!list.length) return '';
    const cur = settings.tts?.voice;
    return `<details class="voices"><summary>Hear all ${list.length} Kokoro voices</summary>
      ${list[0].installed ? '' : list[0].filesHere ? engineStep(engineById('kokoro'), 'Voices downloaded') + '<p class="muted">Until then only the voices that come with Bob can play.</p>' : '<p class="muted">Kokoro isn\'t set up yet: it needs the voice pack (below) and the Kokoro engine (Settings, Engines). Until then only the voices that come with Bob can play.</p>'}
      <ul class="voice-grid">${list.map((v) => `<li class="sample-row"><span>${esc(v.label)}${v.voice === kokoroDefault() ? ' <span class="tag rec">★ Recommended</span>' : ''}${canUse && v.voice === cur ? ' <span class="tag good">Bob\'s voice</span>' : ''}</span>${v.have === 'none' ? `<span class="muted">${v.filesHere ? 'after the Kokoro engine' : 'needs Kokoro'}</span>` : hear('kokoro', v.voice, 'Play')}${canUse && v.voice !== cur ? `<button type="button" class="link" data-usevoice="${esc(v.voice)}">Use</button>` : ''}</li>`).join('')}</ul></details>`;
  }
  // 1.5.33: one picker for Bob's voice everywhere it's chosen: the engine, then (nested under it) the voice inside that
  // engine, with Play sample. Kokoro has 22 voices; Windows has whatever voices Windows has; each Piper voice is its own
  // download, so Piper voices are listed in the engine list itself.
  const speechNow = () => roles?.current?.speech || ({ kokoro: 'kokoro-v1', chatterbox: 'chatterbox' }[settings.tts?.provider] || 'windows');
  const engineLabel = (o) => o.value === 'windows' ? 'Windows (built in)' : o.value === 'chatterbox' ? 'Chatterbox (copies a voice)'
    : /kokoro/.test(o.value) ? `Kokoro (${(settings.kokoroVoices || []).length} voices)` : /^piper-/.test(o.value) ? `Piper: ${o.label}` : o.label;
  function nestedVoiceHtml() {
    const t = settings.tts || {}, cur = speechNow();
    if (/kokoro/.test(cur)) {
      const v = t.voice || kokoroDefault();
      // Not set up yet: a button right here to set it up (the voice samples that come with Bob still play).
      const ready = voices.find((x) => x.engine === 'kokoro')?.installed;
      return `<span class="voice-nest"><label class="pick-inline"><span>Voice</span><select data-tts="voice" aria-label="Kokoro voice">${(settings.kokoroVoices || []).map(([id, label]) => `<option value="${esc(id)}" ${id === v ? 'selected' : ''}>${esc(label)}${id === kokoroDefault() ? ' · recommended' : ''}</option>`).join('')}</select></label>${hear('kokoro', v, 'Play sample')}${ready ? '' : '<button type="button" class="mini" data-gocat="speech" data-gomodel="kokoro-v1">Set up Kokoro</button>'}</span>`;
    }
    if (cur === 'windows') {
      const list = winVoices(), w = t.windowsVoice || '';
      return `<span class="voice-nest"><label class="pick-inline"><span>Voice</span><select data-winvoice aria-label="Windows voice"><option value="" ${w ? '' : 'selected'}>Automatic (an English voice Bob picks)</option>${w && !list.some((x) => x.name === w) ? `<option value="${esc(w)}" selected>${esc(w)}</option>` : ''}${list.map((x) => `<option value="${esc(x.name)}" ${x.name === w ? 'selected' : ''}>${esc(x.name.replace(/^Microsoft /, ''))}</option>`).join('')}</select></label>${sampleButton('windows', w || 'default', 'Play sample', 'A voice built into Windows.')}</span>`;
    }
    if (cur === 'chatterbox') return `<span class="voice-nest"><span class="muted">Copies the voice from your recording (bob.wav in Bob's Voices folder).</span>${hear('chatterbox', 'bob', 'Play sample')}</span>`;
    const p = voices.find((x) => x.engine === 'piper' && x.catalogId === cur) || voices.find((x) => x.engine === 'piper' && x.installed);
    return `<span class="voice-nest"><span class="muted">One voice per Piper download; more in 💬 Voice &amp; conversation.</span>${p ? hear('piper', p.voice, 'Play sample') : ''}</span>`;
  }
  function voicePickHtml() {
    const opts = roles?.options?.speech || [{ value: 'windows', label: 'Windows voices (built in)' }];
    const cur = speechNow();
    return `<span class="voice-pick sample-row"><label class="pick-inline"><span>Voice engine</span><select data-role="speech" aria-label="Voice engine">${opts.some((o) => o.value === cur) ? '' : `<option value="${esc(cur)}" selected>${esc(engineLabel({ value: cur, label: cur }))} · not set up yet</option>`}${opts.map((o) => `<option value="${esc(o.value)}" ${o.value === cur ? 'selected' : ''}>${esc(engineLabel(o))}</option>`).join('')}</select></label>${nestedVoiceHtml()}</span>`;
  }
  function voiceHtml() {
    const t = settings.tts || {};
    const head = `<div class="voice-head"><strong>Bob's voice</strong>${voicePickHtml()}</div>`;
    if (t.provider === 'kokoro') return `${head}<div class="row">
      <label class="pick"><strong>Speed: <b data-speedlabel>${(t.speed || 1).toFixed(1)}×</b></strong><input type="range" min="0.6" max="1.6" step="0.1" data-tts="speed" value="${t.speed || 1}"></label></div>${engineStep(engineById('kokoro'), voiceOf('kokoro', t.voice || kokoroDefault())?.filesHere ? 'Voices downloaded' : 'Kokoro is picked as Bob\'s voice')}${kokoroGrid(true)}`;
    if (t.provider === 'chatterbox') return `${head}<div><p class="muted">To copy a voice, put a clear 10 to 20 second recording named bob.wav in ${esc(t.voicesFolder)}. Only use a voice you have the right to use (your own, or one you have permission for).</p>${voiceOf('chatterbox', 'bob')?.installed ? `<p class="sample-row">${hear('chatterbox', 'bob')}</p>` : engineStep(engineById('chatterbox'), 'Chatterbox is picked as Bob\'s voice')}</div>`;
    return head;
  }
  function voiceNow() {
    const t = settings.tts || {};
    if (t.provider === 'kokoro') { const k = (settings.kokoroVoices || []).find(([id]) => id === (t.voice || kokoroDefault())); return { name: `${k ? k[1] : t.voice} (Kokoro)`, play: hear('kokoro', t.voice || kokoroDefault(), 'Play sample') }; }
    if (t.provider === 'chatterbox') return { name: 'Chatterbox (copies voices\\bob.wav)', play: hear('chatterbox', 'bob', 'Play sample') };
    if (t.provider === 'piper') { const v = voices.find((x) => x.engine === 'piper' && x.installed); return { name: v ? `${v.label} (Piper)` : 'Piper', play: v ? hear('piper', v.voice, 'Play sample') : '' }; }
    return { name: 'The voice built into Windows', play: sampleButton('windows', 'default', 'Play sample', 'The voice built into Windows.') };
  }
  // A voice per Bob: one menu per Bob on the Bob-Net list. "Bob picks" uses a voice from his name.
  function netVoicesHtml() {
    const names = settings.netBobs || [];
    if (!names.length) return '<p class="muted">No other Bobs on your Bob-Net list yet, so there are no voices to pick.</p>';
    const map = settings.netVoiceMap || {};
    return `<div class="net-voices">${names.map((n) => `<label class="pick-inline"><span>${esc(n)}</span><select data-netvoice="${esc(n)}" aria-label="Voice for ${esc(n)}"><option value="auto">Bob picks one from his name</option>${(settings.kokoroVoices || []).map(([id, label]) => `<option value="${esc(id)}" ${map[n] === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>`).join('')}</div>`;
  }
  // 🗣 Talk with Bob's online extra (src/talk.js): xAI's hearing and voice, off unless picked. Always shown.
  function talkCloudHtml() {
    const way = settings.talkCloud === 'xai' ? 'xai' : 'off';
    const voices = settings.xaiVoices || [['eve', 'Eve'], ['ara', 'Ara'], ['rex', 'Rex']];
    return `<div class="talk-cloud">
      <label class="pick-inline"><span><strong>Online hearing and voice</strong> ${tip('Off unless you pick xAI. xAI\'s hearing and voice for Talk with Bob, instead of mine. It needs your own xAI key, which xAI charges for, and it sends your voice and my words to xAI over the internet. My thinking, memory and tools stay right here. If xAI doesn\'t answer, I carry on with my own hearing and voice.', 'Online hearing and voice')}</span>
        <select data-talkset="talkCloud" aria-label="Online hearing and voice"><option value="off" ${way === 'off' ? 'selected' : ''}>Off: my own, on this replicant matrix</option><option value="xai" ${way === 'xai' ? 'selected' : ''}>xAI (online, needs a paid key)</option></select></label>
      <label class="pick-inline"><span><strong>xAI voice</strong></span><select data-talkset="talkCloudVoice" aria-label="xAI voice">${voices.map(([id, name]) => `<option value="${esc(id)}" ${settings.talkCloudVoice === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>
      <div class="row wrap"><label class="pick-inline"><span><strong>xAI key</strong> <span class="muted">${settings.talkKeyFound ? 'saved, locked away' : 'none yet'}</span></span><input type="password" data-talkkey autocomplete="off" spellcheck="false" placeholder="${settings.talkKeyFound ? 'Paste a new key to replace it' : 'Paste your xAI key'}" aria-label="xAI key"></label>
        <button type="button" class="mini" data-talkkeysave>Save key</button>${settings.talkKeyFound ? '<button type="button" class="mini link" data-talkkeyforget>Forget the key</button>' : ''}</div>
      ${way === 'xai' && !settings.talkKeyFound ? '<p class="muted">xAI is picked but there\'s no key yet, so I use my own hearing and voice.</p>' : ''}
    </div>`;
  }
  function voiceDetailsHtml() {
    const pressed = (id) => document.getElementById(id)?.getAttribute('aria-pressed') === 'true';
    const prox = (id, label, note) => `<label class="switch"><input type="checkbox" data-proxy="${id}" ${pressed(id) ? 'checked' : ''}><span><strong>${label}</strong> ${tip(note, label)}</span></label>`;
    return `<div class="voice-settings">${voiceHtml()}</div>
      ${prox('ear', 'Listen for "Hey Bob"', 'Only while this window is open. Same as Listen in the left menu.')}
      ${prox('speak', 'Read replies aloud', 'Same as Read aloud in the left menu.')}
      ${sswitch('talkOver', settings.talkOver === true, 'Talk over Bob', 'Off unless you turn it on. While Bob reads aloud, the microphone stays open: start speaking and he stops and listens. "Stop" on its own just stops him; anything else is sent as your next message. Headphones work best, so he doesn\'t hear himself. Only while this window is open.')}
      ${sswitch('talkWithBob', settings.talkWithBob === true, 'Talk with Bob', 'Off unless you turn it on. Adds 🗣 next to the 🎙: press it and just talk, hands-free. Each time you pause, what you said goes to Bob, and he says a short answer out loud (the whole answer is in the chat). Talk while he speaks and he stops and listens. Say "goodbye" or press ✕ to end. Uses my own hearing and voice, here, for free.')}
      ${talkCloudHtml()}
      ${sswitch('readDocs', settings.readDocs === true, 'Read documents aloud', 'Off unless you turn it on. A document in the side panel gets 🔊 Read aloud: Play, Pause, Back, Next and a speed, in Bob\'s voice (or this computer\'s voice). He remembers where you stopped in each document, on this computer.')}
      ${sswitch('netVoices', settings.netVoices === true, 'A voice per Bob', 'Off unless you turn it on. A reply another of your Bobs thought (a borrowed brain) is read aloud in his own voice, so you can hear who\'s talking. Pick each Bob\'s voice below, or leave it to Bob, who picks one from his name. Needs the Kokoro voice; with another voice every Bob sounds the same.')}
      ${netVoicesHtml()}
      <p class="muted">Hearing you and the other voices are on the <button type="button" class="link" data-tab="speech">💬 Voice &amp; conversation</button> page.</p>`;
  }
  return {
    kokoroDefault: (...a) => { fresh(); return kokoroDefault(...a); },
    voiceOf: (...a) => { fresh(); return voiceOf(...a); },
    hear: (...a) => { fresh(); return hear(...a); },
    kokoroGrid: (...a) => { fresh(); return kokoroGrid(...a); },
    speechNow: (...a) => { fresh(); return speechNow(...a); },
    engineLabel: (...a) => { fresh(); return engineLabel(...a); },
    nestedVoiceHtml: (...a) => { fresh(); return nestedVoiceHtml(...a); },
    voicePickHtml: (...a) => { fresh(); return voicePickHtml(...a); },
    voiceHtml: (...a) => { fresh(); return voiceHtml(...a); },
    voiceNow: (...a) => { fresh(); return voiceNow(...a); },
    netVoicesHtml: (...a) => { fresh(); return netVoicesHtml(...a); },
    talkCloudHtml: (...a) => { fresh(); return talkCloudHtml(...a); },
    voiceDetailsHtml: (...a) => { fresh(); return voiceDetailsHtml(...a); }
  };
}
