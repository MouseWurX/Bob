// Nov 22 2026: brains that need a Hugging Face account (gated). The key (HF_TOKEN) is used only with the switch on,
// only for a gated brain, only sent to huggingface.co (never to the file storage it redirects to), never shown.
// The key here is a fake set by this test; nothing on the real computer is read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gatedBlock, gatedToken, withHfKey, signedFetch, signedHost, hfKeySaved, refusedWords } from '../src/hf-sign-in.js';
import { ModelShop, linkError } from '../src/models.js';
import { mergeSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 15)); } return false; };

const FAKE = 'hf_' + 'x'.repeat(34);
const key = (v) => () => v;
const gated = { name: 'Gated brain', gated: true };

// ---------- the rules, one at a time ----------
check('switch off: no key used, even with one saved', gatedToken({}, gated, { key: key(FAKE) }) === '');
check('switch on, gated brain: the key is used', gatedToken({ hfGated: true }, gated, { key: key(FAKE) }) === FAKE);
check('switch on, ordinary brain: stays signed out', gatedToken({ hfGated: true }, { name: 'x' }, { key: key(FAKE) }) === '');
check('switch off: plain words say where to switch it on', /How Bob works/.test(gatedBlock({}, gated, { key: key(FAKE) })));
check('switch on, no key: plain words say where to save it', /HF_TOKEN/.test(gatedBlock({ hfGated: true }, gated, { key: key('') })) && /Locked secrets/.test(gatedBlock({ hfGated: true }, gated, { key: key('') })));
check('switch on with a key: nothing blocks it', gatedBlock({ hfGated: true }, gated, { key: key(FAKE) }) === '');
check('an ordinary brain is never blocked', gatedBlock({}, { name: 'x' }, { key: key('') }) === '');
check('the key is never in the words', !gatedBlock({}, gated, { key: key(FAKE) }).includes(FAKE) && !refusedWords('a.gguf', 403).includes(FAKE));
check('whether a key is saved, as yes or no only', hfKeySaved({ key: key(FAKE) }) === true && hfKeySaved({ key: key('  ') }) === false);
check('only huggingface.co itself is signed', signedHost('https://huggingface.co/a/b') && !signedHost('https://cas-bridge.xethub.hf.co/x') && !signedHost('https://huggingface.co.evil.example/x') && !signedHost('http://huggingface.co/x'));
check('the header goes to huggingface.co only', withHfKey('https://huggingface.co/x', {}, FAKE).authorization === `Bearer ${FAKE}` && !('authorization' in withHfKey('https://cdn-lfs.hf.co/x', {}, FAKE)) && !('authorization' in withHfKey('https://huggingface.co/x', {}, '')));
check('a refusal with the key sent says to accept the terms', /accept its terms/.test(linkError('a.gguf', 403, true)) && !/accept its terms/.test(linkError('a.gguf', 403)));

// ---------- redirects followed by hand ----------
{
  const seen = [];
  const fetchFn = async (u, o) => {
    seen.push({ u, auth: o.headers.authorization || '', redirect: o.redirect, range: o.headers.range || '' });
    if (u === 'https://huggingface.co/O/R/resolve/abc/f.gguf') return new Response(null, { status: 302, headers: { location: '/O/R2/resolve/abc/f.gguf' } });
    if (u === 'https://huggingface.co/O/R2/resolve/abc/f.gguf') return new Response(null, { status: 302, headers: { location: 'https://cas-bridge.xethub.hf.co/signed?x=1' } });
    if (u.startsWith('https://cas-bridge.xethub.hf.co/')) return new Response('data', { status: 200 });
    if (u === 'https://huggingface.co/O/Away/resolve/abc/f.gguf') return new Response(null, { status: 302, headers: { location: 'https://evil.example/f' } });
    if (u === 'https://huggingface.co/O/Loop') return new Response(null, { status: 302, headers: { location: '/O/Loop' } });
    return new Response(null, { status: 404 });
  };
  const allowed = (u) => /^https:\/\/([\w-]+\.)*(huggingface\.co|hf\.co)\//.test(u);
  const { res, url } = await signedFetch('https://huggingface.co/O/R/resolve/abc/f.gguf', { token: FAKE, headers: { range: 'bytes=5-' }, fetchFn, allowed });
  check('the file arrives from the storage host', res.status === 200 && url.startsWith('https://cas-bridge.xethub.hf.co/'));
  check('the key went to each huggingface.co hop', seen.filter((s) => s.u.startsWith('https://huggingface.co/')).every((s) => s.auth === `Bearer ${FAKE}`));
  check('the key never reached the storage host', seen.filter((s) => !s.u.startsWith('https://huggingface.co/')).every((s) => s.auth === ''));
  check('redirects are followed by hand and the Range request is kept', seen.every((s) => s.redirect === 'manual' && s.range === 'bytes=5-'));
  seen.length = 0;
  let err = '';
  try { await signedFetch('https://huggingface.co/O/Away/resolve/abc/f.gguf', { token: FAKE, fetchFn, allowed }); } catch (e) { err = e.message; }
  check('a redirect to a site Bob doesn\'t trust stops before it is asked', /don't trust/.test(err) && !seen.some((s) => s.u.includes('evil.example')));
  err = '';
  try { await signedFetch('https://huggingface.co/O/Loop', { token: FAKE, fetchFn, allowed }); } catch (e) { err = e.message; }
  check('a redirect loop stops', /too many/.test(err));
}

// ---------- the whole download, through Bob's model shop ----------
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-hf-'));
const dataDir = path.join(root, 'inn', 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cat = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
for (const m of cat.models) for (const f of m.files || []) { delete f.sha256; delete f.bytes; delete f.sizeOnly; }
const A = 'whisper-base-en', B = 'whisper-large-v3-turbo';
cat.models.find((m) => m.id === A).gated = true;
const catalogFile = path.join(dataDir, 'catalog.json');
fs.writeFileSync(catalogFile, JSON.stringify(cat));
const cfg = { catalogFile, agentDir: root, dataDir, bobModelsDir: path.join(root, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), modelSearchRoots: [], ollamaUrl: 'http://127.0.0.1:1', engine: 'llamacpp' };
mergeSettings(cfg);
const before = process.env.HF_TOKEN;
process.env.HF_TOKEN = FAKE; // the fake key, as if saved

const content = crypto.randomBytes(300_000);
const calls = [];
const real = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  calls.push({ u, auth: opts.headers?.authorization || '', method: opts.method || 'GET' });
  if (u.includes('127.0.0.1:1')) throw new Error('ECONNREFUSED');
  if (u.startsWith('https://huggingface.co/') && /\/resolve\//.test(u)) {
    if (opts.method === 'HEAD') return new Response(null, { status: 302, headers: { 'x-linked-size': String(content.length) } });
    if (opts.redirect === 'manual') return new Response(null, { status: 302, headers: { location: 'https://cas-bridge.xethub.hf.co/signed/abc' } });
  }
  const r = new Response(content, { status: 200 });
  Object.defineProperty(r, 'url', { value: u.startsWith('https://huggingface.co/') ? 'https://cas-bridge.xethub.hf.co/signed/abc' : u });
  return r;
};

const shop = new ModelShop(cfg, () => {});
const item = (id) => shop.dl.find((d) => d.id === id);
let err = '';
try { await shop.download(A); } catch (e) { err = e.message; }
check('switch off: a gated brain is refused, with where to switch it on', /How Bob works/.test(err) && calls.length === 0, err);
const listed = (await shop.list()).models.find((m) => m.id === A);
check('the catalogue card says it needs an account', listed.status.signIn === 'needed' && /How Bob works/.test(listed.status.signInWhy) && !JSON.stringify(listed).includes(FAKE));

cfg.hfGated = true;
check('switch on: the card is ready to download', (await shop.list()).models.find((m) => m.id === A).status.signIn === 'ready');
await shop.download(A);
await until(() => ['done', 'failed'].includes(item(A)?.state));
check('switch on: the gated brain downloads', item(A)?.state === 'done', item(A)?.error || '');
const hfCalls = calls.filter((c) => c.u.startsWith('https://huggingface.co/'));
check('its huggingface.co requests carried the key', hfCalls.length >= 2 && hfCalls.every((c) => c.auth === `Bearer ${FAKE}`));
check('the storage host never saw the key', calls.filter((c) => c.u.includes('xethub')).every((c) => c.auth === ''));

calls.length = 0;
await shop.download(B);
await until(() => ['done', 'failed'].includes(item(B)?.state));
check('an ordinary brain still downloads signed out', item(B)?.state === 'done' && calls.length > 0 && calls.every((c) => c.auth === ''), item(B)?.error || '');

const logged = fs.readdirSync(dataDir).map((f) => { try { return fs.readFileSync(path.join(dataDir, f), 'utf8'); } catch { return ''; } }).join('\n');
check('the key is in none of Bob\'s files', !logged.includes(FAKE));

globalThis.fetch = real;
if (before === undefined) delete process.env.HF_TOKEN; else process.env.HF_TOKEN = before;
fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
