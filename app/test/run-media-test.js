// Pictures, clips and sounds Bob makes are saved with his reply, so they come back after a reload or restart
// (they used to live only in a live event, and a missed event lost them).
import fs from 'node:fs';
import { Brain } from '../src/brain.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

function fakeBrain(runOn) {
  const store = new Map();
  return { store, session(id) { if (!store.has(id)) store.set(id, []); return store.get(id); }, runOn, refs: { find: () => null } };
}
const events = [];
const emit = (ev) => events.push(ev);

// 1. A picture, then Bob's words: the picture goes on that reply.
{
  const b = fakeBrain(async (msgs, text, em) => {
    msgs.push({ role: 'user', content: text });
    msgs.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'make_image' } }] });
    em({ type: 'image', url: '/images/2026-11-01-1faa3800.png', file: 'C:\\x\\inn\\painter\\2026-11-01-1faa3800.png' });
    msgs.push({ role: 'tool', tool_name: 'make_image', content: 'Painted a picture.' });
    msgs.push({ role: 'assistant', content: 'Here it is, restyled.' });
  });
  await Brain.prototype.run.call(b, 's1', 'restyle this photo', emit, null);
  const saved = b.store.get('s1');
  const reply = saved.at(-1);
  check('the live event still goes out', events.some((e) => e.type === 'image' && e.url === '/images/2026-11-01-1faa3800.png'));
  check('the picture is saved on Bob\'s final reply', reply.role === 'assistant' && reply.media?.length === 1 && reply.media[0].type === 'image' && reply.media[0].url === '/images/2026-11-01-1faa3800.png' && reply.media[0].name === '2026-11-01-1faa3800.png');
  check('not on the tool-call message', !saved.find((m) => m.tool_calls)?.media);
  const h = Brain.prototype.history.call(b, 's1');
  check('the chat history the window loads includes it', h.at(-1).role === 'assistant' && h.at(-1).media?.[0]?.url === '/images/2026-11-01-1faa3800.png' && h.at(-1).content === 'Here it is, restyled.');
}
// 2. The job ends on the tool (no words after): a reply holding just the media is added.
{
  const b = fakeBrain(async (msgs, text, em) => {
    msgs.push({ role: 'user', content: text });
    em({ type: 'video', url: '/images/clip.mp4', file: '/p/clip.mp4' });
    em({ type: 'audio', url: '/images/tune.wav', file: '/p/tune.wav' });
    em({ type: 'image', url: 'https://elsewhere.example/x.png' });
  });
  await Brain.prototype.run.call(b, 's2', 'make a clip and a tune', emit, null);
  const h = Brain.prototype.history.call(b, 's2');
  check('a reply with only media still shows (clip and sound, in order)', h.length === 2 && h[1].content === '' && h[1].media.map((m) => m.type).join(',') === 'video,audio');
  check('only Bob\'s own /images/ files are kept', !h[1].media.some((m) => m.url.startsWith('http')));
}
// 3. A failed job keeps what it made before failing.
{
  const b = fakeBrain(async (msgs, text, em) => { msgs.push({ role: 'user', content: text }); em({ type: 'image', url: '/images/a.png', file: '/p/a.png' }); throw new Error('boom'); });
  try { await Brain.prototype.run.call(b, 's3', 'two pictures', emit, null); } catch {}
  check('a job that fails after painting keeps the picture', Brain.prototype.history.call(b, 's3').at(-1).media?.[0]?.url === '/images/a.png');
}

const app = publicText('app.js');
check('the window draws saved media when it loads the chat', /render\(m\.content\) \+ mediaHtml\(m\.media\)/.test(app) && /function mediaHtml\(media\)/.test(app));
check('after the event stream drops and comes back, missed media are shown', /es\.onopen = \(\) => \{ if \(dropped\)/.test(app) && /async function catchUpMedia/.test(app) && /!seen\.has\(m\.url\)/.test(app));
const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
check('the idle check also lists models still loaded', /quietForSeconds: quietFor, loaded/.test(server));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
