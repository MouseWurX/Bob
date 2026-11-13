// Talk with Bob (1.5.210, UX plan item 12): a live, hands-free talk on Bob's own hearing and voice, with xAI's online
// hearing and voice as an opt-in extra. Everything starts off, nothing is added to what the brain reads, and xAI is
// only ever a fake here: nothing goes online, no microphone is opened, nothing is spoken.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { talkOn, talkWay, talkView, xaiHear, xaiSay, withFallback, cleanCloud, cleanCloudVoice, XAI_KEY, XAI_STT, XAI_TTS } from '../src/talk.js';
import { shortSay, endsTalk, TALK_LINES, REST_LINE } from '../public/talk-core.js';
import { createEar, LOUD_RMS, PAUSE_SECS } from '../public/talk.js';
import { RATE, BARGE_RMS } from '../public/voice.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const noKey = () => '', aKey = (n) => (n === XAI_KEY ? 'xai-test' : '');

// ---- off by default; only real values are saved ----
{
  const s = mergeSettings({}, {});
  check('Talk with Bob starts off', !talkOn(s) && !talkOn({}));
  check('the online extra starts off', cleanCloud(s.talkCloud) === 'off' && talkWay({}, { key: aKey }) === 'own');
  const on = mergeSettings({}, { talkWithBob: 'yes', talkCloud: 'grok', talkCloudVoice: 'zed' });
  check('only a real true turns it on', on.talkWithBob === false && mergeSettings({}, { talkWithBob: true }).talkWithBob === true);
  check('only xAI or off is kept, and a known voice', on.talkCloud === 'off' && on.talkCloudVoice === 'eve' && cleanCloudVoice('rex') === 'rex');
  check('the new keys are saved settings', ['talkWithBob', 'talkCloud', 'talkCloudVoice'].every((k) => SETTING_KEYS.includes(k)));
}

// ---- which hearing and voice ----
{
  check('xAI is used only when picked and a key is found', talkWay({ talkCloud: 'xai' }, { key: aKey }) === 'xai' && talkWay({ talkCloud: 'xai' }, { key: noKey }) === 'own' && talkWay({ talkCloud: 'off' }, { key: aKey }) === 'own');
  const v = talkView({ talkWithBob: true, talkCloud: 'xai' }, { key: aKey });
  check('Settings sees whether there is a key, never the key', v.talkKeyFound === true && !JSON.stringify(v).includes('xai-test'));
  let cloud = 0, own = 0;
  const r1 = await withFallback({ talkCloud: 'xai' }, { key: aKey, cloud: async (k) => { cloud++; return `cloud:${k}`; }, own: async () => { own++; return 'own'; } });
  check('with xAI picked, xAI answers', r1.out === 'cloud:xai-test' && r1.way === 'xai' && !r1.fellBack);
  const logs = [];
  const r2 = await withFallback({ talkCloud: 'xai' }, { key: aKey, cloud: async () => { throw new Error('offline'); }, own: async () => 'own', log: (...a) => logs.push(a.join(' ')) });
  check('if xAI fails, Bob\'s own takes over and says so', r2.out === 'own' && r2.way === 'own' && r2.fellBack && /xAI didn't answer/.test(logs[0]) && !logs[0].includes('xai-test'));
  const r3 = await withFallback({}, { key: aKey, cloud: async () => { cloud++; return 'x'; }, own: async () => 'own' });
  check('with it off, xAI is never asked', r3.out === 'own' && cloud === 1);
}

// ---- xAI's hearing and voice, against a fake ----
{
  const calls = [];
  const fake = async (url, opts) => { calls.push({ url, opts }); return url === XAI_STT ? new Response(JSON.stringify({ text: ' hello bob ', language: 'en', duration: 1 })) : new Response(new Uint8Array([82, 73, 70, 70])); };
  const text = await xaiHear(Buffer.from('RIFF'), { key: 'k1', fetchImpl: fake });
  check('xAI hearing sends the WAV with the key and reads the words', text === 'hello bob' && calls[0].opts.headers.authorization === 'Bearer k1' && calls[0].opts.body instanceof FormData && calls[0].opts.body.get('file'));
  check('the file goes last, as xAI asks', [...calls[0].opts.body.keys()].pop() === 'file');
  const wav = await xaiSay('Hi there.', { key: 'k1', voice: 'ara', fetchImpl: fake });
  const sent = JSON.parse(calls[1].opts.body);
  check('xAI voice asks for a WAV in the picked voice', calls[1].url === XAI_TTS && sent.voice_id === 'ara' && sent.output_format.codec === 'wav' && Buffer.isBuffer(wav) && wav.length === 4);
  let threw = false;
  try { await xaiSay('x', { key: '', fetchImpl: fake }); } catch { threw = true; }
  check('no key, no call', threw && calls.length === 2);
  threw = false;
  try { await xaiHear(Buffer.from('x'), { key: 'k', fetchImpl: async () => new Response('no', { status: 401 }) }); } catch (e) { threw = /401/.test(e.message); }
  check('a refused key is an error (so Bob\'s own takes over)', threw);
}

// ---- short answers out loud ----
{
  const a = shortSay('Sure thing. The answer is 42. Here is a lot more about why, with detail.');
  check('two sentences, then the rest is in the chat', a.say === `Sure thing. The answer is 42. ${REST_LINE}` && a.cut);
  check('a short reply is said whole', shortSay('Done!').say === 'Done!' && !shortSay('Done!').cut);
  check('code, links and marks are not read out', shortSay('Try **this**: ```js\nx()\n``` at https://example.com/a').say === 'Try this: (some code) at a link');
  check('stage directions are skipped', shortSay('*yawns* Morning.').say === 'Morning.');
  const long = shortSay('word '.repeat(120));
  check('one long sentence is cut at a word, about 220 letters', long.cut && long.say.length < 260 && /… The rest is in the chat\.$/.test(long.say));
  check('nothing to say is nothing', shortSay('').say === '' && shortSay('```\ncode only\n```').say === '(some code)');
  await import('../android/app/src/main/assets/www/logic.js');
  const L = globalThis.BobLogic;
  const samples = ['Sure thing. The answer is 42. More.', 'Done!', 'word '.repeat(120), '*yawns* Morning. **Bold** bit. Third one.', 'See [this](http://x.y) and https://a.b/c.'];
  check('the phone\'s Hands-free short answers match the computer', samples.every((t) => L.shortSay(t).say === shortSay(t).say));
}

// ---- ending the talk ----
{
  check('"goodbye" and friends end it', ['Goodbye', 'okay bob, bye', "that's all", 'Thanks Bob, bye for now', 'end talk'].every(endsTalk));
  check('a sentence with "bye" in it does not', !endsTalk('say goodbye to my mum for me') && !endsTalk('what does bye mean'));
}

// ---- the ear: a pause ends what you said; his own voice doesn't cut him off; you do ----
{
  const chunk = (level, secs = 0.25) => new Float32Array(Math.round(RATE * secs)).fill(level);
  const said = [];
  let cut = 0;
  const ear = createEar({ onSaid: (a) => said.push(a.length / RATE), onCutIn: () => cut++ });
  for (let i = 0; i < 4; i++) ear.feed(chunk(LOUD_RMS * 3));
  for (let i = 0; i < Math.ceil(PAUSE_SECS / 0.25) + 1; i++) ear.feed(chunk(0));
  check('a second of talk, then a pause, is sent once', said.length === 1 && said[0] >= 1);
  ear.feed(chunk(LOUD_RMS * 3, 0.1)); for (let i = 0; i < 6; i++) ear.feed(chunk(0));
  check('a cough is not sent', said.length === 1);
  for (let i = 0; i < 8; i++) ear.feed(chunk(LOUD_RMS * 2), true);
  check('his own voice through the speakers does not cut him off', cut === 0);
  ear.feed(chunk(BARGE_RMS * 2)); // not talking: an ordinary start
  ear.reset();
  for (let i = 0; i < 2; i++) ear.feed(chunk(BARGE_RMS * 2), true);
  check('a clear voice for a third of a second cuts him off', cut === 1);
  for (let i = 0; i < 5; i++) ear.feed(chunk(0));
  check('and what you said is kept from the start', said.length === 2 && said[1] >= 0.5);
}

// ---- never in the brain's way ----
{
  const brainFiles = ['src/brain.js', 'src/prompt.js', 'src/mid-job.js', 'src/meanwhile.js'].filter((f) => fs.existsSync(path.join(here, '..', f)));
  check('the brain is never told about the talk', brainFiles.every((f) => !/talkWithBob|talk-core|Talk with Bob|shortSay/.test(f === 'src/brain.js' ? brainText() : read(f))));
  const app = publicText('app.js');
  check('a talk sends an ordinary message, through the message box', /send: \(text\) => \{[\s\S]{0,200}requestSubmit\(\)/.test(app));
  check('the screen lines are fixed words, not sent anywhere', Object.values(TALK_LINES).every((l) => typeof l === 'string' && l.length < 80));
}

// ---- settings, screen and Help ----
{
  const cellar = publicText('cellar.js'), html = read('public/index.html'), css = read('public/style.css');
  check('the switch and the online extra are always shown in Voice details', /sswitch\('talkWithBob'/.test(cellar) && /\$\{talkCloudHtml\(\)\}/.test(cellar) && /Online hearing and voice/.test(cellar));
  check('the online extra says it costs and sends your voice online', /charges/.test(cellar) && /sends your voice/.test(cellar));
  check('the 🗣 button and the talk bar are on the page, labelled', /id="talkBtn"[^>]*aria-label="Talk with Bob"/.test(html) && /id="talkBar"[^>]*role="region"[^>]*aria-label="Talk with Bob"/.test(html));
  check('the dot keeps still with reduced motion', /prefers-reduced-motion: reduce\) \{ \.talk-bar \.talk-dot \{ animation: none/.test(css) && /body\.still \.talk-bar \.talk-dot/.test(css));
  const talkJs = read('public/talk.js');
  check('the state line is read out by screen readers, and Esc ends the talk', /role="status" aria-live="polite"/.test(talkJs) && /Escape/.test(talkJs));
  const ids = new Set(HELP.map((e) => e.id));
  check('Help has the page and two FAQs', ['talk-with-bob', 'faq-talk-with-bob', 'faq-talk-xai'].every((id) => ids.has(id)));
  const g = HELP.find((e) => e.id === 'glossary').html;
  check('the glossary has Talk with Bob', /<dt>Talk with Bob<\/dt>/.test(g));
  const page = HELP.find((e) => e.id === 'talk-with-bob').html;
  check('Help says where it works and where it doesn\'t', /Windows, Mac and Linux/.test(page) && /Android/.test(page) && /iPhone/.test(page));
  for (const base of ['public/phone', 'android/app/src/main/assets/www']) {
    const p = read(`${base}/phone.js`), i = read(`${base}/index.html`);
    check(`${base}: Short answers out loud starts off`, /hfShort: false/.test(p) && /id="hf-short"/.test(i));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
