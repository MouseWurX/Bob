// Lab keys (16 Nov 2026; the owner: "make sure the pre-flight tests dont leak my key either"). A key saved with the
// double-click "Save Tavily key for the Lab.cmd" sits in %LOCALAPPDATA%\BobLab\<name>.key, encrypted with Windows DPAPI
// (only the Windows account that saved it can open it). It is opened into this process's memory only: never printed,
// logged or saved, and scrubber() takes it out of anything that is (a result or an error that quoted it back).
// Bob's own Settings never see it: Bob on that PC keeps keyed search off.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const keyFile = (name, env = process.env) => (env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'BobLab', `${name}.key`) : '');
const envName = (name) => `LAB_${String(name).toUpperCase()}_KEY`;

// { key } or { key: '', why }. LAB_<NAME>_KEY (tests, a Linux or Mac lab box) comes first; then the saved file (Windows).
export function labKey(name, { env = process.env, platform = process.platform, run = execFileSync, exists = fs.existsSync } = {}) {
  if (env[envName(name)]) return { key: String(env[envName(name)]).trim(), from: 'env' };
  if (platform !== 'win32') return { key: '', why: `no ${envName(name)} set (a key saved with the .cmd opens only on the Windows account that saved it)` };
  const f = keyFile(name, env);
  if (!f || !exists(f)) return { key: '', why: `no saved ${name} key: double-click "Save Tavily key for the Lab.cmd" first` };
  try {
    // the file's path goes in by an environment value, so no quoting; stderr is dropped and stdout is only kept in memory
    const out = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$s = Get-Content -LiteralPath $env:BOBLAB_KEYFILE | ConvertTo-SecureString; [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))'],
      { env: { ...env, BOBLAB_KEYFILE: f }, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
    const key = String(out || '').trim();
    return key ? { key, from: 'file' } : { key: '', why: `the saved ${name} key opened empty: save it again` };
  } catch { return { key: '', why: `the saved ${name} key couldn't be opened on this Windows account: save it again` }; }
}

// text -> text with every key (plain, URL-encoded or JSON-escaped) replaced by [key]
export function scrubber(...keys) {
  const forms = [...new Set(keys.filter((k) => typeof k === 'string' && k.length >= 8).flatMap((k) => [k, encodeURIComponent(k), JSON.stringify(k).slice(1, -1)]))].sort((a, b) => b.length - a.length);
  return (t) => { let s = String(t ?? ''); for (const k of forms) s = s.split(k).join('[key]'); return s; };
}

// One basic Tavily search (1 credit) to check a key: { ok, status }. Only the status is ever reported, never the body.
export async function tavilyCheck(key, { url = process.env.LAB_TAVILY_URL || 'https://api.tavily.com', fetchFn = fetch } = {}) {
  try {
    const r = await fetchFn(`${url.replace(/\/+$/, '')}/search`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ query: 'weather forecast Paris', max_results: 1, search_depth: 'basic' }), signal: AbortSignal.timeout(30000) });
    let results = 0; try { results = ((await r.json())?.results || []).length; } catch {}
    return { ok: r.ok, status: r.status, results };
  } catch (e) { return { ok: false, status: 0, why: e?.name === 'TimeoutError' ? 'no answer in 30 s' : "couldn't reach Tavily" }; }
}

// 16 Nov (the owner: a longer run after run 3; Tavily's free plan is 1,000 searches a month): what Tavily says this key has
// used this month and its limit, from its usage page (no search spent). { ok, used, limit } or { ok: false, why }: only
// the two numbers are kept, never the body. The run then counts its own searches against what's left (do-jobs --search-max).
export async function tavilyUsage(key, { url = process.env.LAB_TAVILY_URL || 'https://api.tavily.com', fetchFn = fetch } = {}) {
  try {
    const r = await fetchFn(`${url.replace(/\/+$/, '')}/usage`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) return { ok: false, status: r.status, why: `error ${r.status}` };
    const j = await r.json().catch(() => null);
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    // a key with its own limit counts against that; otherwise the account's plan does
    const k = j?.key || {}, a = j?.account || {};
    const limit = num(k.limit) ?? num(a.plan_limit), used = num(k.limit) !== null ? num(k.usage) : num(a.plan_usage) ?? num(k.usage);
    return limit !== null && used !== null ? { ok: true, used, limit } : { ok: false, status: r.status, why: 'the usage page answered in a shape this Lab does not know' };
  } catch (e) { return { ok: false, status: 0, why: e?.name === 'TimeoutError' ? 'no answer in 30 s' : "couldn't reach Tavily" }; }
}
