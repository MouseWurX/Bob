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
