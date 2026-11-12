// 1.5.210 Sample-data mode (public/sample-data.js): made-up machine and brains for design checks and Help screenshots.
// A fake window and a fake server only: nothing here reads this computer or a real Bob.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleOf, scrub, sampleModels, sampleRoles, sampleSettings, sampleHardware, installSample, MACHINES, SAMPLE_HAVE } from '../public/sample-data.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const catalog = JSON.parse(read('catalog.json'));

{
  check('off unless the address asks', sampleOf('') === '' && sampleOf('?x=1') === '' && sampleOf('?sample=0') === '' && sampleOf('?sample=nope') === '');
  check('?sample=1 is the desktop; the other machines by name', sampleOf('?sample=1') === 'desktop' && ['laptop', 'mac', 'nocard', 'pi'].every((m) => sampleOf(`?sample=${m}`) === m));
  check('every sample machine is a different kind of computer', new Set(Object.values(MACHINES).map((m) => `${m.vramGB}/${m.ramGB}/${Boolean(m.gpu?.unified)}/${m.board || ''}`)).size === Object.keys(MACHINES).length);
  check('the hardware says it is a sample', /^Sample machine:/.test(sampleHardware('laptop').spec) && sampleHardware('laptop').vramGB === 6 && sampleHardware('mac').gpu.unified === true && sampleHardware('nocard').gpu === null);
  const dirty = { home: 'C:\\Users\\you\\someone\\Bob', saveDir: { folder: '/home/someone/pics' }, note: `mail me at ${['a.b', 'c.example'].join('@')}`, list: ['/Users/x/y', 'plain'] };
  const clean = JSON.stringify(scrub(dirty));
  check('folders, paths and emails are swapped for sample ones, all the way down', !/someone|a\.b@c|\/Users\/x/.test(clean) && /sam@example\.test/.test(clean) && /plain/.test(clean));
  const sm = sampleModels({ models: catalog.models.map((m) => ({ ...m, status: { state: 'installed', located: { gguf: 'D:\\real\\x.gguf' } } })).concat([{ id: 'mine', own: true, ownFile: 'C:\\mine.gguf', status: { state: 'installed' } }]) });
  check('only the sample brains are "here", your own files never show', sm.models.filter((m) => m.status.state === 'installed').map((m) => m.id).sort().join() === [...SAMPLE_HAVE].filter((id) => catalog.models.some((m) => m.id === id)).sort().join() && !sm.models.some((m) => m.own) && !JSON.stringify(sm).includes('D:\\\\real'));
  check('every sample brain is a real catalog entry, so names and sizes are real', SAMPLE_HAVE.every((id) => catalog.models.some((m) => m.id === id)));
  const roles = sampleRoles(sm.models);
  check('the sample jobs point at sample brains', roles.current.bob === 'qwen3.6-35b-a3b' && roles.options.llm.some((o) => o.value === 'qwen3-4b') && roles.options.images.some((o) => o.value === 'z-image-turbo'));
  const st = sampleSettings({ userName: 'Real Name', home: 'C:\\Users\\you\\real' }, 'mac');
  check('settings: a sample name, scrubbed folders, the sample machine\'s system', st.userName === 'Sam' && !/real/i.test(JSON.stringify(st)) && st.platform === 'darwin' && st.sample === 'mac');
}

{
  // A fake window: a real fetch that records every call, a page address and a tiny document.
  const calls = [];
  const body = { prepended: null, prepend(x) { this.prepended = x; } };
  const doc = { readyState: 'complete', body, getElementById: () => null, createElement: () => ({ setAttribute() {}, textContent: '' }), addEventListener() {} };
  const win = {
    location: { search: '?sample=laptop', href: 'http://localhost:7777/?sample=laptop', origin: 'http://localhost:7777' },
    document: doc,
    fetch: async (input, init = {}) => { calls.push({ url: String(input), method: init.method || 'GET' }); const u = String(input); const b = u.includes('/api/models') ? { models: catalog.models.map((m) => ({ ...m, status: { state: 'missing' } })) } : u.includes('/api/settings') ? { userName: 'Real', home: 'C:\\Users\\you\\real' } : { path: '/home/real/x', ok: 1 }; return new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } }); },
    EventSource: class Real {}
  };
  check('installs only when asked, and says which machine', installSample(win) === 'laptop' && win.__bobSample === 'laptop' && installSample(win) === '');
  const post = await (await win.fetch('/api/settings', { method: 'POST', body: '{"x":1}' })).json();
  check('a change is answered OK here and never reaches Bob', post.sample === true && !calls.some((c) => c.method === 'POST'));
  check('chats, memories and what Bob made come back empty, without asking Bob', JSON.stringify(await (await win.fetch('/api/history?session=a')).json()) === '[]' && JSON.stringify(await (await win.fetch('/api/made?limit=24')).json()) === '[]' && !calls.some((c) => /history|made/.test(c.url)));
  const hw = await (await win.fetch('/api/hardware')).json();
  check('the machine is the sample laptop, not this computer', hw.vramGB === 6 && hw.ramGB === 16 && !calls.some((c) => c.url.includes('/api/hardware')));
  const st = await (await win.fetch('/api/settings')).json();
  check('real settings come back scrubbed, with the sample name', st.userName === 'Sam' && !/real/i.test(JSON.stringify(st)));
  const other = await (await win.fetch('/api/status')).json();
  check('anything else is read from Bob but scrubbed', other.ok === 1 && other.path === 'C:\\Sample\\Bob');
  check('no live events (they carry real chats)', win.EventSource.name !== 'Real' && new win.EventSource('/api/events').readyState === 2);
  check('a banner says it is sample data the whole time', body.prepended && /Sample data/.test(body.prepended.textContent) && /nothing is saved/.test(body.prepended.textContent));
  const off = { location: { search: '' }, fetch: () => {}, document: doc };
  check('without ?sample nothing changes', installSample(off) === '' && !off.__bobSample);
}

{
  const app = read('public/app.js'), sw = read('public/settings-window.js'), link = read('public/settings-link.js'), css = read('public/style.css');
  check('loaded first in the main window and the Settings window', /^\/\/[^\n]*\nimport '\.\/sample-data\.js';/.test(app) && /import '\.\/sample-data\.js';/.test(sw));
  check('Settings opened from a sample tab is a sample too', /__bobSample/.test(link));
  check('the banner has its own style', /\.sample-banner \{/.test(css));
  check('nothing on the brain side knows about it', !fs.readdirSync(path.join(here, '..', 'src')).filter((f) => f.endsWith('.js')).some((f) => /sample-data|__bobSample/.test(read(`src/${f}`))));
  const h = HELP.find((x) => x.id === 'sample-data');
  check('Help in Bob\'s words, with every machine named', h && /\?sample=1/.test(h.html) && ['laptop', 'mac', 'nocard', 'pi'].every((m) => h.html.includes(`?sample=${m}`)) && /nothing is saved/i.test(h.html));
  check('glossary and FAQ', /<dt>Sample-data mode<\/dt>/.test(HELP.find((x) => x.id === 'glossary').html) && HELP.some((x) => x.id === 'faq-sample-data'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
