#!/usr/bin/env node
// Bob from a terminal or a script: `bob ask`, `bob status`, `bob models`. It talks to a running Bob through
// "Brains for other apps" (src/apps-door.js), so that switch has to be on. One file with no imports from the
// rest of Bob, so it can be copied anywhere Node 20 runs: a Raspberry Pi, a scheduled task, Termux on a phone.
//
// Where Bob is: --url, else BOB_URL, else http://localhost:<port from Bob's config.json, else 7777>.
// The key: --key, else BOB_KEY, else read from Bob's config.json when this file sits in Bob's folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HELP = `Bob from the command line.

  bob ask "question"        Ask Bob. Text piped in is added after the question:
                            git diff | bob ask "write a commit message for this"
  bob status                Is Bob running, which brain answers, is the graphics card busy
  bob models                The brains other apps may use

Options
  --model NAME              A brain from "bob models" (default: bob, his chat brain)
  --think none|low|medium|high   How hard to think (default: the brain's own)
  --system "TEXT"           Instructions to go before the question
  --json                    Print the whole answer as JSON instead of streaming the words
  --url URL                 Where Bob is (default http://localhost:7777, or BOB_URL)
  --key KEY                 Bob's key for other apps (or BOB_KEY)

Turn on "Brains for other apps" in Bob's Settings, Other apps, first. The key is shown there.`;

export function parseArgs(argv) {
  const o = { cmd: '', words: [], model: '', think: '', system: '', json: false, url: '', key: '', help: false };
  const want = (i) => { if (i + 1 >= argv.length) throw new Error(`${argv[i]} needs a value.`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help' || a === 'help') o.help = true;
    else if (a === '--json') o.json = true;
    else if (['--model', '--think', '--system', '--url', '--key'].includes(a)) { o[a.slice(2)] = want(i); i++; }
    else if (/^--(model|think|system|url|key)=/.test(a)) { const [k, ...v] = a.slice(2).split('='); o[k] = v.join('='); }
    else if (a.startsWith('--')) throw new Error(`Bob doesn't know ${a}. Try bob --help.`);
    else if (!o.cmd) o.cmd = a;
    else o.words.push(a);
  }
  if (o.think && !['none', 'low', 'medium', 'high'].includes(o.think)) throw new Error('--think is none, low, medium or high.');
  return o;
}

// Bob's config.json, when this file is inside Bob's folder (src/ or installer/ next to it, or a copy of the source).
export function findConfig({ env = process.env, here = path.dirname(fileURLToPath(import.meta.url)), exists = fs.existsSync, read = (f) => fs.readFileSync(f, 'utf8') } = {}) {
  const files = env.BOB_CONFIG ? [env.BOB_CONFIG] : [path.join(here, '..', 'config.json'), path.join(here, '..', '..', 'config.json')];
  for (const f of files) {
    try { if (exists(f)) return JSON.parse(read(f).replace(/^﻿/, '')); } catch {}
  }
  return null;
}

export function where(o, { env = process.env, config = null } = {}) {
  const url = String(o.url || env.BOB_URL || `http://localhost:${config?.port || 7777}`).replace(/\/+$/, '').replace(/\/v1$/, '');
  const key = o.key || env.BOB_KEY || config?.appsDoor?.key || '';
  return { url, key };
}

const SAYS = {
  401: 'Bob turned the key down. Copy it again from Settings, Other apps, and pass it with --key or BOB_KEY.',
  403: '',
  404: 'Bob is running, but "Brains for other apps" is off. Turn it on in Settings, Other apps.'
};

async function call(at, p, { fetchFn, body, signal } = {}) {
  let r;
  try {
    r = await fetchFn(at.url + p, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${at.key}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal });
  } catch (e) {
    const err = new Error(`Bob isn't answering at ${at.url}. Is he running? (${e.cause?.code || e.message})`); err.exit = 3; throw err;
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const msg = (r.status === 404 && p === '/v1/models' ? SAYS[404] : '') || SAYS[r.status] || j?.error?.message || `Bob said ${r.status}.`;
    const err = new Error(r.status === 401 ? SAYS[401] : msg); err.exit = r.status === 404 || r.status === 401 ? 3 : 1; throw err;
  }
  return r;
}

async function readAll(stream) { let s = ''; for await (const c of stream) s += c; return s; }

export async function main(argv, io = {}) {
  const { fetchFn = globalThis.fetch, env = process.env, stdin = process.stdin, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), config = findConfig({ env }) } = io;
  let o;
  try { o = parseArgs(argv); } catch (e) { err(e.message + '\n'); return 2; }
  if (o.help || !o.cmd) { out(HELP + '\n'); return o.help ? 0 : 2; }
  const at = where(o, { env, config });
  try {
    if (o.cmd === 'status') {
      const s = await (await call(at, '/v1/bob/status', { fetchFn })).json();
      if (o.json) { out(JSON.stringify(s, null, 2) + '\n'); return 0; }
      out(`Bob ${s.version || ''} is running at ${at.url}.\nSession: ${s.session}\nAnswers with: ${s.brain ? s.brain.name : 'no chat brain yet'}\nGraphics card: ${s.card === 'free' ? 'free' : `busy (${s.card})`}${s.busy ? '\nHe is on a job right now; your question waits its turn.' : ''}\nBrains for other apps: ${s.models}\n`);
      return 0;
    }
    if (o.cmd === 'models') {
      const j = await (await call(at, '/v1/models', { fetchFn })).json();
      if (o.json) { out(JSON.stringify(j, null, 2) + '\n'); return 0; }
      for (const m of j.data || []) out(`${m.id}${m.name && m.name !== m.id ? `  (${m.name})` : ''}\n`);
      return 0;
    }
    if (o.cmd === 'ask') {
      let q = o.words.join(' ').trim();
      if (stdin && !stdin.isTTY) { const piped = (await readAll(stdin)).replace(/\r\n/g, '\n').trim(); if (piped) q = q ? `${q}\n\n${piped}` : piped; }
      if (!q) { err('Ask Bob something: bob ask "what\'s a mixture of experts?"\n'); return 2; }
      const messages = [...(o.system ? [{ role: 'system', content: o.system }] : []), { role: 'user', content: q }];
      const body = { model: o.model || 'bob', messages, stream: !o.json, ...(o.think ? { reasoning_effort: o.think } : {}) };
      const r = await call(at, '/v1/chat/completions', { fetchFn, body });
      if (o.json) { out(JSON.stringify(await r.json(), null, 2) + '\n'); return 0; }
      let buf = '', last = '';
      const dec = new TextDecoder();
      for await (const c of r.body) {
        buf += dec.decode(c, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
          let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
          if (ev.error) { err(`\nBob stopped: ${ev.error.message}\n`); return 1; }
          const t = ev.choices?.[0]?.delta?.content;
          if (t) { out(t); last = t; }
        }
      }
      if (!last.endsWith('\n')) out('\n');
      return 0;
    }
    err(`Bob doesn't know "${o.cmd}". He knows ask, status and models (bob --help).\n`);
    return 2;
  } catch (e) {
    err(e.message + '\n');
    return e.exit || 1;
  }
}

// Run when started as a program (node bob-cli.js ..., or Bob.exe with ELECTRON_RUN_AS_NODE=1), not when a test imports it.
const self = (() => { try { return fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return ''; } })();
const started = (() => { try { return process.argv[1] ? fs.realpathSync(process.argv[1]) : ''; } catch { return ''; } })();
if (self && self === started) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
