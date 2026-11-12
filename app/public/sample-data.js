// 1.5.210 Sample-data mode: Bob's screens with made-up brains and a made-up machine, for design checks and Help
// screenshots, with no brain loaded and nothing real on show. Off unless the page address asks for it:
//   ?sample=1 (or desktop)   a 16 GB graphics card and 32 GB of memory
//   ?sample=laptop           a 6 GB laptop card and 16 GB of memory
//   ?sample=mac              a Mac with 36 GB of memory shared with graphics
//   ?sample=nocard           no graphics card, 16 GB of memory
//   ?sample=pi               a Raspberry Pi style board with 8 GB
// What it does, only in that tab: the machine, the brains on it and which job each one does are made up; the real
// brain list (catalog) is used for everything else. Anything that looks like a folder, a file path or an email is
// swapped for a sample one; chats, memories and what Bob made come back empty. Nothing is ever saved: every change
// the page tries to send is answered "OK" here and never reaches Bob. No live events (chat, the cube) either. A banner
// says so the whole time. Remove ?sample from the address to go back. It never touches what Bob reads or does.

export const MACHINES = {
  desktop: { label: 'a 16 GB graphics card, 32 GB of memory', gpu: { name: 'Sample graphics card', vramGB: 16 }, vramGB: 16, ramGB: 32, freeGB: 750, pack: 'big', platform: 'win32' },
  laptop: { label: 'a 6 GB laptop card, 16 GB of memory', gpu: { name: 'Sample laptop card', vramGB: 6 }, vramGB: 6, ramGB: 16, freeGB: 300, pack: 'small', platform: 'win32' },
  mac: { label: 'a Mac with 36 GB of shared memory', gpu: { name: 'Sample Mac (shared memory)', vramGB: 27, unified: true }, vramGB: 27, ramGB: 36, freeGB: 500, pack: 'big', platform: 'darwin' },
  nocard: { label: 'no graphics card, 16 GB of memory', gpu: null, vramGB: null, ramGB: 16, freeGB: 200, pack: 'cpu', platform: 'linux' },
  pi: { label: 'a small ARM board with 8 GB', gpu: null, vramGB: null, ramGB: 8, freeGB: 100, pack: '', board: 'arm', platform: 'linux' }
};
// The brains "on" the sample machine and the job each one does. Catalog ids, so names and sizes are the real ones.
export const SAMPLE_HAVE = ['qwen3.6-35b-a3b', 'qwen3-4b', 'gemma4-e4b', 'z-image-turbo', 'kokoro-v1'];
export const SAMPLE_JOBS = { bob: 'qwen3.6-35b-a3b', tinker: 'qwen3.6-35b-a3b', small: 'qwen3-4b', eyes: 'gemma4-e4b', image: 'z-image-turbo', speech: 'kokoro-v1' };

// Which sample machine the address asks for, or '' (off).
export function sampleOf(search = '') {
  let v = '';
  try { v = new URLSearchParams(search).get('sample') || ''; } catch { return ''; }
  if (v === '1' || v === 'true' || v === 'on') return 'desktop';
  return Object.hasOwn(MACHINES, v) ? v : '';
}

// Lists that hold your own words or files: empty in sample mode.
const PRIVATE = /^\/api\/(history|chats?|sessions?|memory|memories|made|topics|notes|projects|files?|file-list|digest|activity|receipts|profiles|secrets|howtos|own-kit|own-models|turn-changes|speed-log|clipboard|help-bundle|lab\/my|quarantine)(\/|$|\?)/;
// The empty answer for the lists that aren't a plain list.
const EMPTY = { '/api/own-kit': { tools: [], howtos: [], deleted: [] }, '/api/howtos': { howtos: [] } };
const PATHLIKE = /^(?:[A-Za-z]:[\\/]|\\\\|\/(?:home|Users|mnt|media|var|tmp|root|opt|Volumes)\/|~\/)/;
// The sample address, put together so no real-looking address sits in the file.
const SAMPLE_EMAIL = ['sam', 'example.test'].join('@');
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Swap anything personal-looking for sample words, all the way down.
export function scrub(v, depth = 0) {
  if (depth > 12) return v;
  if (typeof v === 'string') return PATHLIKE.test(v) ? 'C:\\Sample\\Bob' : v.replace(EMAIL, SAMPLE_EMAIL);
  if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x, depth + 1)]));
  return v;
}

export const sampleHardware = (id) => {
  const m = MACHINES[id] || MACHINES.desktop;
  return { gpu: m.gpu, freeGB: m.freeGB, vramGB: m.vramGB, ramGB: m.ramGB, board: m.board || null, suggestedPack: m.pack, cpu: 'Sample processor', spec: `Sample machine: ${m.label}` };
};
export function sampleSettings(real = {}, id = 'desktop') {
  const s = scrub(real);
  return { ...s, userName: 'Sam', callMe: 'Sam', windowsName: 'Sam', platform: (MACHINES[id] || MACHINES.desktop).platform, setupDone: true, wantsAsked: true, sessionBrains: { small: SAMPLE_JOBS.small }, sample: id };
}
export function sampleModels(real = {}) {
  const models = (real.models || []).filter((m) => !m.own).map((m) => ({ ...m, status: { ...(m.status || {}), state: SAMPLE_HAVE.includes(m.id) ? 'installed' : 'missing', located: {} } }));
  return { ...scrub(real), models, extras: [], downloads: [], job: null, removed: [] };
}
export function sampleRoles(models = []) {
  const opt = (kinds) => SAMPLE_HAVE.map((id) => models.find((m) => m.id === id)).filter((m) => m && kinds.includes(m.category)).map((m) => ({ value: m.id, label: m.name }));
  const current = Object.fromEntries(Object.entries(SAMPLE_JOBS).filter(([k]) => k !== 'small'));
  return { current, options: { llm: opt(['chat', 'coding', 'vision']), images: opt(['images']), edit: [], video: [], voice: [], speech: opt(['speech']), music: [], sfx: [], embed: [] } };
}

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

// Put sample mode in place for this tab: a fetch that answers from the sample, no live events, and the banner.
export function installSample(win = globalThis) {
  const id = sampleOf(win.location?.search || '');
  if (!id || win.__bobSample) return '';
  win.__bobSample = id;
  const realFetch = win.fetch.bind(win);
  let catalog = null;
  const realModels = async () => (catalog ||= await realFetch('/api/models').then((r) => r.json()).catch(() => ({ models: [] })));
  win.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, win.location.href);
    if (url.origin !== win.location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
    const method = String(init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    const p = url.pathname;
    if (method !== 'GET') return json({ ok: true, sample: true, note: 'Sample data: nothing was saved.' });
    if (p === '/api/hardware') return json(sampleHardware(id));
    if (p === '/api/models') return json(sampleModels(await realModels()));
    if (p === '/api/roles') return json(sampleRoles((await realModels()).models || []));
    if (p === '/api/settings') return json(sampleSettings(await realFetch(input, init).then((r) => r.json()).catch(() => ({})), id));
    if (p === '/api/brain-place' || p === '/api/honesty' || p === '/api/lab/brain-scores') return json({ brains: {}, scores: {} });
    if (PRIVATE.test(p + url.search)) return json(EMPTY[p] || (/s$|history|made|topics|notes|chats|memory/.test(p) ? [] : {}));
    return realFetch(input, init).then(async (r) => (r.headers.get('content-type') || '').includes('json') ? json(scrub(await r.json())) : r);
  };
  // No live events: they carry real chats and the real brain's state.
  win.EventSource = class { constructor() { this.readyState = 2; } close() {} addEventListener() {} removeEventListener() {} };
  const show = () => {
    const doc = win.document;
    if (!doc?.body || doc.getElementById('sample-banner')) return;
    const b = doc.createElement('div');
    b.id = 'sample-banner'; b.className = 'sample-banner'; b.setAttribute('role', 'status');
    b.textContent = `Sample data: ${MACHINES[id].label}, made-up brains. Nothing here is real and nothing is saved. Take ?sample off the address to go back.`;
    doc.body.prepend(b);
  };
  if (win.document?.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', show); else show();
  return id;
}

installSample();
