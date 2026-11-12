// Calibrate Wi-Fi (Settings, Bob-Net, Bigger Bobs). Pooled cards send every word across the home network and back, so
// the Wi-Fi band this machine sits on matters more than anything SCUT can do: a card that picked 2.4 GHz, or a weak
// 6 GHz, when a strong 5 GHz was on offer makes every word late. Windows picks the band by itself and often badly.
// Check (no admin): which band this machine is on, how strong, and which bands the router offers under the same name.
// Calibrate (your click, and one Windows prompt): Bob tries each band that's on offer and strong enough, times the
// trip to your other Bob on each (or to the router when no Bob is near), and sets the Wi-Fi card's own band setting
// to the best one. "Best" is the quickest trip there and back among bands whose signal is at or above FLOOR_DBM; a
// band below that is never picked while a stronger one works. Put it back restores the setting Bob found.
// How the admin part is kept small: the elevated PowerShell (inline, -EncodedCommand, never a script file another
// program could swap) only knows the card's name, the one setting, and the list of values that setting already
// offers. It takes a number from a file in Bob's data folder and sets that value; nothing else. All measuring and
// choosing happens here, without admin. If Bob stops telling it what to do for a minute it puts the first value back.
// Windows only for now. Linux, Mac and Android: wifiView says what to do instead.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { OS } from './platform.js';

export const FLOOR_DBM = -70; // a band weaker than this is only used when nothing stronger works
export const BANDS = ['2.4', '5', '6'];
export const pctToDbm = (pct) => Math.round(Number(pct) / 2 - 100); // Windows' signal percent, as dBm (its own rule)
const bandIn = (s) => { const m = String(s || '').match(/(2\.4|5|6)\s*GHz/i); return m ? m[1] : ''; };
const bandOfChannel = (ch) => (ch >= 1 && ch <= 14 ? '2.4' : ch >= 32 && ch <= 177 ? '5' : '');
const ps = (s) => `'${String(s).replace(/'/g, "''")}'`;
const encode = (script) => Buffer.from(script, 'utf16le').toString('base64');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function runFile(file, args, opts = {}) {
  return new Promise((resolve) => execFile(file, args, { windowsHide: true, timeout: 180000, maxBuffer: 4e6, ...opts }, (err, out, errOut) => resolve({ ok: !err, out: String(out || ''), err: String(errOut || err?.message || '') })));
}

// "netsh wlan show interfaces": the connected Wi-Fi card, or null. The labels are in Windows' own language, so the
// values are read by their shape where that's possible (a band says GHz, a signal ends in %, an RSSI is below zero).
export function parseInterfaces(text) {
  const out = { ssid: '', band: '', channel: 0, rssi: null, signal: null, rate: 0 };
  for (const raw of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const m = raw.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, val] = m;
    if (/^SSID$/i.test(key) && !out.ssid) out.ssid = val;
    else if (bandIn(val) && !out.band && !/SSID/i.test(key)) out.band = bandIn(val);
    else if (/^-\d{1,3}$/.test(val) && out.rssi === null) out.rssi = Number(val);
    else if (/^\d{1,3}\s*%$/.test(val) && out.signal === null) out.signal = parseInt(val, 10);
    else if (/\(Mbps\)/i.test(key) && /^\d+(\.\d+)?$/.test(val)) out.rate = Math.max(out.rate, Math.round(Number(val)));
    else if (/^(Channel|Kanal|Canal|Canale)$/i.test(key) && /^\d+$/.test(val)) out.channel = Number(val);
  }
  if (!out.ssid) return null;
  if (!out.band) out.band = bandOfChannel(out.channel);
  if (out.rssi === null && out.signal !== null) out.rssi = pctToDbm(out.signal);
  return out;
}

// "netsh wlan show networks mode=bssid": the bands the router offers under this network's name, strongest first:
// [{ band, channel, signal (percent), dbm }], one per band.
export function parseNetworks(text, ssid) {
  const best = new Map();
  let mine = false, ap = null;
  const done = () => {
    if (!ap || ap.signal === null) return;
    const band = ap.band || bandOfChannel(ap.channel);
    if (band && !(best.get(band)?.signal >= ap.signal)) best.set(band, { band, channel: ap.channel, signal: ap.signal, dbm: pctToDbm(ap.signal) });
  };
  for (const raw of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const s = raw.match(/^\s*SSID\s+\d+\s*:\s*(.*?)\s*$/i);
    if (s) { done(); ap = null; mine = s[1] === ssid; continue; }
    if (!mine) continue;
    if (/^\s*BSSID\s+\d+\s*:/i.test(raw)) { done(); ap = { band: '', channel: 0, signal: null }; continue; }
    const m = ap && raw.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    if (bandIn(m[2]) && !ap.band) ap.band = bandIn(m[2]);
    else if (/^\d{1,3}\s*%$/.test(m[2]) && ap.signal === null) ap.signal = parseInt(m[2], 10);
    else if (/^(Channel|Kanal|Canal|Canale)$/i.test(m[1]) && /^\d+$/.test(m[2])) ap.channel = Number(m[2]);
  }
  done();
  return [...best.values()].sort((a, b) => b.signal - a.signal);
}

// Which band one of the setting's values means: '2.4', '5', '6', 'any' (no preference), or ''.
export const bandOfValue = (v) => (/2\.4\s*G|\b2G\b/i.test(v) ? '2.4' : /(^|[^\d.])6(\.\d)?\s*G/i.test(v) ? '6' : /(^|[^\d.])5(\.\d)?\s*G/i.test(v) ? '5' : /no pref|auto|default|dual|both|\ball\b|\bany\b|none/i.test(v) ? 'any' : '');
// The Wi-Fi card's own band setting among its advanced properties ("Preferred Band" on most cards), or null when
// the card has none. { name, now, nowBand, choices: { '5': 'its value', ... }, values: [now, ...the rest] }
export function bandSetting(props) {
  for (const p of Array.isArray(props) ? props : []) {
    const name = String(p?.DisplayName || ''), valid = (Array.isArray(p?.ValidDisplayValues) ? p.ValidDisplayValues : []).map(String);
    if (!/band/i.test(name) || /width|channel|mode|bandwidth/i.test(name)) continue;
    const choices = {};
    for (const v of valid) { const b = bandOfValue(v); if (b && !(b in choices)) choices[b] = v; }
    if (BANDS.filter((b) => choices[b]).length < 2) continue;
    const now = String(p.DisplayValue || '');
    return { name, now, nowBand: bandOfValue(now), choices, values: [now, ...valid.filter((v) => v !== now)] };
  }
  return null;
}

// Read without admin: the Wi-Fi card that's up, its advanced properties and the router's address.
export const readScript = () => [
  "$a = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' -and ($_.NdisPhysicalMedium -eq 9 -or $_.PhysicalMediaType -match '802\\.11') } | Select-Object -First 1",
  "if (-not $a) { '{}'; exit 0 }",
  '$p = @(Get-NetAdapterAdvancedProperty -Name $a.Name -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object { @{ DisplayName = [string]$_.DisplayName; DisplayValue = [string]$_.DisplayValue; ValidDisplayValues = @($_.ValidDisplayValues | ForEach-Object { [string]$_ }) } })',
  "$g = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -InterfaceIndex $a.ifIndex -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1).NextHop",
  '@{ name = [string]$a.Name; card = [string]$a.InterfaceDescription; gateway = [string]$g; props = $p } | ConvertTo-Json -Depth 5 -Compress'
].join('; ');

// The admin part. values[0] is what the setting said before; a step file holds "<turn> <index>", and each turn is
// answered with a file ack<turn> ("1", or "0 why"). "done" ends it; a minute with no step puts values[0] back.
export function workerScript({ adapter, setting, values, dir }) {
  if (!adapter || !setting || !Array.isArray(values) || values.length < 2 || !dir) throw new Error('Nothing to calibrate.');
  return [
    `$d = ${ps(dir)}; $n = ${ps(adapter)}; $s = ${ps(setting)}; $v = @(${values.map(ps).join(', ')})`,
    "Set-Content -LiteralPath (Join-Path $d 'ready') -Value '1'",
    '$idle = 0; $last = 0; $f = Join-Path $d \'step\'',
    'while ($idle -lt 240) {',
    '  if (Test-Path -LiteralPath $f) {',
    "    $t = ([string](Get-Content -LiteralPath $f -Raw)).Trim(); Remove-Item -LiteralPath $f -Force; $idle = 0",
    "    if ($t -eq 'done') { break }",
    "    $q = $t -split ' '; $turn = 0; $i = -1",
    '    if ($q.Count -eq 2 -and [int]::TryParse($q[0], [ref]$turn) -and [int]::TryParse($q[1], [ref]$i) -and $i -ge 0 -and $i -lt $v.Count) {',
    "      $ok = '1'; try { Set-NetAdapterAdvancedProperty -Name $n -DisplayName $s -DisplayValue $v[$i] -ErrorAction Stop; $last = $i } catch { $ok = '0 ' + $_.Exception.Message }",
    "      Set-Content -LiteralPath (Join-Path $d ('ack' + $turn)) -Value $ok",
    '    }',
    '  } else { Start-Sleep -Milliseconds 250; $idle++ }',
    '}',
    'if ($idle -ge 240 -and $last -ne 0) { Set-NetAdapterAdvancedProperty -Name $n -DisplayName $s -DisplayValue $v[0] -ErrorAction SilentlyContinue }'
  ].join('\n');
}
const elevate = (script, { waitFor = true } = {}) => `$p = Start-Process -FilePath powershell.exe -Verb RunAs ${waitFor ? '-Wait ' : ''}-PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${encode(script)}'; exit $p.ExitCode`;

// What Bob can see about this machine's Wi-Fi, without admin.
export async function wifiView({ os_ = OS, run = runFile } = {}) {
  if (os_ === 'linux') return { os: 'linux', ok: false, why: 'I can calibrate Wi-Fi on Windows only, for now. On Linux you can pin the band yourself: nmcli connection modify "<your network>" 802-11-wireless.band a (that\'s 5 GHz; bg is 2.4 GHz), then nmcli connection up "<your network>".' };
  if (os_ !== 'win') return { os: os_, ok: false, why: 'I can calibrate Wi-Fi on Windows only. A Mac and a phone pick the band themselves; if it picks badly, give the 5 GHz band its own name on the router and join that one.' };
  const [a, b, c] = await Promise.all([
    run('netsh', ['wlan', 'show', 'interfaces']),
    run('netsh', ['wlan', 'show', 'networks', 'mode=bssid']),
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', readScript()])
  ]);
  const wifi = parseInterfaces(a.out);
  if (!wifi) return { os: 'win', ok: false, why: a.ok ? 'This PC isn\'t on Wi-Fi right now (a cable is better anyway), so there is nothing to calibrate.' : 'Windows wouldn\'t tell me about the Wi-Fi. Newer Windows wants Location switched on for that (Settings, Privacy & security, Location).' };
  let j = {};
  try { j = JSON.parse(c.out.trim() || '{}'); } catch {}
  const offers = parseNetworks(b.out, wifi.ssid);
  const setting = bandSetting(j.props);
  const { ssid, ...seen } = wifi; // the network's name stays out of what Bob says and keeps
  return { os: 'win', ok: true, wifi: seen, offers, adapter: String(j.name || ''), card: String(j.card || ''), gateway: String(j.gateway || ''), setting };
}

const radio = (w) => `${w.band || '?'} GHz${w.channel ? `, channel ${w.channel}` : ''}${Number.isFinite(w.rssi) ? `, signal ${w.rssi} dBm` : ''}${w.rate ? `, ${w.rate} Mbit/s` : ''}`;
// The Check button's words.
export function wifiSays(view, { floor = FLOOR_DBM } = {}) {
  if (!view?.ok) return view?.why || 'I couldn\'t read the Wi-Fi.';
  const w = view.wifi, lines = [`This PC's Wi-Fi is on ${radio(w)}${w.rssi < floor ? ' (that\'s weak)' : ''}.`];
  const others = view.offers.filter((o) => o.band !== w.band);
  if (others.length) lines.push(`Your router also offers ${others.map((o) => `${o.band} GHz (about ${o.dbm} dBm here${o.dbm < floor ? ', weak' : ''})`).join(' and ')} under the same name.`);
  else lines.push('I see no other band from your router under this name.');
  const better = others.some((o) => o.dbm >= floor);
  if (!view.setting) lines.push('This Wi-Fi card has no band setting I can change, so Calibrate can only time it. To move it, give the band you want its own name on the router and join that.');
  else lines.push(`The card's setting "${view.setting.name}" says "${view.setting.now}".${better ? ' Calibrate can try the other band and keep whichever is quicker.' : ''}`);
  return lines.join(' ');
}

// One trip there and back, timed: a TCP hello to the other Bob's door. Resolves ms, or null when it didn't answer.
export function tcpTrip({ host, port }, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const s = net.connect({ host, port });
    const end = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(timeoutMs, () => end(null));
    s.once('connect', () => end(Number(process.hrtime.bigint() - t0) / 1e6));
    s.once('error', (e) => end(e?.code === 'ECONNREFUSED' ? Number(process.hrtime.bigint() - t0) / 1e6 : null)); // a "no" is still a trip
  });
}
// n trips: { n, lost, median, worst } in ms (median and worst are null when none came back).
export async function timeLink(target, { n = 30, gapMs = 100, trip = tcpTrip, sleep = wait } = {}) {
  const got = [];
  for (let i = 0; i < n; i++) { const ms = await trip(target); if (ms !== null) got.push(ms); if (i < n - 1) await sleep(gapMs); }
  got.sort((a, b) => a - b);
  return { n, lost: n - got.length, median: got.length ? got[Math.floor(got.length / 2)] : null, worst: got.length ? got[got.length - 1] : null };
}

// The best band of those tried: the quickest trip (the usual one, plus a quarter of the worst, since one late word
// in ten is felt) among bands that came back, lost at most a fifth, and whose signal is at or above the floor. If none
// is that strong, the strongest. When two are as quick as each other, the one with the faster link. null: none worked.
export function pickBand(results, { floor = FLOOR_DBM } = {}) {
  const live = (results || []).filter((r) => r.ok && Number.isFinite(r.median) && r.lost <= r.n * 0.2);
  if (!live.length) return null;
  const strong = live.filter((r) => !(r.rssi < floor));
  const pool = strong.length ? strong : [live.reduce((a, b) => ((b.rssi ?? -999) > (a.rssi ?? -999) ? b : a))];
  const score = (r) => r.median + r.worst / 4;
  const best = pool.reduce((a, b) => (score(b) < score(a) ? b : a));
  return pool.filter((r) => score(r) <= score(best) * 1.1 + 1).reduce((a, b) => ((b.rate || 0) > (a.rate || 0) ? b : a), best);
}

const ms1 = (x) => (x < 10 ? x.toFixed(1) : String(Math.round(x)));
const line = (r) => (r.ok && Number.isFinite(r.median) ? `${r.band} GHz: ${ms1(r.median)} ms there and back (worst ${ms1(r.worst)}${r.lost ? `, ${r.lost} of ${r.n} unanswered` : ''})${Number.isFinite(r.rssi) ? `, signal ${r.rssi} dBm` : ''}${r.rate ? `, ${r.rate} Mbit/s` : ''}` : `${r.band} GHz: ${r.why || 'no answer'}`);

let running = false;
// The Calibrate button. target: { host, port, name } of the other Bob on the home network, or null (then the router).
// Resolves { ok, text, results, pick } and never throws. Everything that touches the machine can be handed in.
export async function calibrate(cfg, { os_ = OS, run = runFile, target = null, view = null, measure = timeLink, sleep = wait, log = () => {}, save = () => {}, floor = FLOOR_DBM, readyMs = 90000, linkMs = 30000, settleMs = 3000, fsx = fs, token = () => crypto.randomBytes(8).toString('hex') } = {}) {
  if (running) return { ok: false, text: 'I\'m already calibrating.' };
  running = true;
  let dir = '';
  try {
    const see = view || await wifiView({ os_, run });
    if (!see.ok) return { ok: false, text: see.why };
    const to = target || (see.gateway ? { host: see.gateway, port: 80, name: 'the router' } : null);
    if (!to) return { ok: false, text: 'I found no other Bob on this home network and no router to time, so there\'s nothing to compare.' };
    const first = { band: see.wifi.band, ok: true, rssi: see.wifi.rssi, rate: see.wifi.rate, ...(await measure(to)) };
    const set = see.setting;
    // Bands worth a try: on the card's list, offered by the router, strong enough, and not the one just timed.
    const offered = (b) => !see.offers.length || see.offers.some((o) => o.band === b);
    const tries = set ? BANDS.filter((b) => set.choices[b] && b !== first.band && offered(b)) : [];
    const weak = tries.filter((b) => see.offers.find((o) => o.band === b)?.dbm < floor);
    const go = first.rssi < floor && weak.length === tries.length ? tries : tries.filter((b) => !weak.includes(b)); // all weak, here too: try them anyway
    const skipped = weak.filter((b) => !go.includes(b)).map((b) => `${b} GHz is too weak here to try (about ${see.offers.find((o) => o.band === b).dbm} dBm).`);
    if (!set || !go.length) {
      const why = !set ? 'This Wi-Fi card has no band setting I can change, so I only timed it.' : tries.length ? 'No other band is strong enough here to be worth trying.' : 'Your router offers this card no other band under this name.';
      return { ok: true, changed: false, results: [first], pick: first.band, text: [`To ${to.name || 'your other Bob'}: ${line(first)}.`, why, ...skipped].join(' ') };
    }
    if (!cfg?.dataDir || !see.adapter) return { ok: false, text: 'I couldn\'t find the Wi-Fi card\'s name, so I changed nothing.' };
    dir = path.join(cfg.dataDir, `wifi-calibrate-${token()}`);
    fsx.mkdirSync(dir, { recursive: true });
    const has = (f) => { try { return fsx.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim(); } catch { return null; } };
    const until = async (fn, ms, step = 250) => { for (let t = 0; t <= ms; t += step) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
    let over = null;
    const worker = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', elevate(workerScript({ adapter: see.adapter, setting: set.name, values: set.values, dir }))], { timeout: 900000 }).then((r) => { over = r; return r; });
    if (!await until(() => has('ready') || (over ? 'over' : null), readyMs) || has('ready') === null) {
      return { ok: false, text: over && /cancel/i.test(over.err) ? 'Windows asked, and the answer was No, so nothing changed.' : 'Windows didn\'t let me start, so nothing changed.' };
    }
    let turn = 0;
    const setTo = async (value) => {
      const i = set.values.indexOf(value); turn++;
      fsx.writeFileSync(path.join(dir, 'step'), `${turn} ${i}`);
      const ack = await until(() => has(`ack${turn}`), 40000);
      return ack === '1' ? '' : (ack || 'Windows didn\'t answer').replace(/^0 ?/, '').slice(0, 160) || 'Windows said no';
    };
    const linkUp = () => until(async () => { const w = parseInterfaces((await run('netsh', ['wlan', 'show', 'interfaces'])).out); return w && w.band ? w : null; }, linkMs, 1000);
    const results = [first];
    for (const band of go) {
      const bad = await setTo(set.choices[band]);
      if (bad) { results.push({ band, ok: false, why: `the card wouldn't take it (${bad})` }); continue; }
      await sleep(settleMs);
      const w = await linkUp();
      if (!w) { results.push({ band, ok: false, why: 'the Wi-Fi didn\'t come back on it' }); continue; }
      if (w.band !== band) { results.push({ band, ok: false, why: `the card stayed on ${w.band} GHz` }); continue; }
      results.push({ band, ok: true, rssi: w.rssi, rate: w.rate, ...(await measure(to)) });
    }
    const pick = pickBand(results, { floor });
    // No band answered, or no other band could be timed at all: back to exactly what the setting said. Otherwise pin
    // the winner (also when it's the band it started on, so Windows can't wander off it later).
    const rivals = results.some((r) => r !== first && r.ok);
    const keep = !pick || (pick === first && (!rivals || !set.choices[first.band])) ? set.now : set.choices[pick.band];
    const bad = await setTo(keep);
    if (!bad) await linkUp();
    try { fsx.writeFileSync(path.join(dir, 'step'), 'done'); } catch {}
    await Promise.race([worker, sleep(5000)]);
    const changed = !bad && keep !== set.now;
    if (changed) save({ adapter: see.adapter, setting: set.name, value: cfg.share?.wifiWas?.setting === set.name && cfg.share?.wifiWas?.adapter === see.adapter ? cfg.share.wifiWas.value : set.now });
    const text = [
      `I timed the trip to ${to.name || 'your other Bob'} on each band. ${results.map(line).join('. ')}.`,
      bad ? `I couldn't set the card at the end (${bad}). Check "${set.name}" in the Wi-Fi card's Advanced settings.` : !pick ? `None of them answered well, so the setting is back to "${set.now}".` : changed ? `Best is ${pick.band} GHz, so the card's "${set.name}" now says "${keep}". Put it back undoes that.` : `Best is ${pick.band} GHz, where it already was, so nothing changed.`,
      ...skipped
    ].join(' ');
    log('bob-net', `Wi-Fi calibrated (your click): ${results.map(line).join('; ')}; ${changed ? `set to "${keep}"` : 'nothing changed'}`);
    return { ok: !bad, changed, results, pick: pick?.band || '', text };
  } catch (e) {
    return { ok: false, text: `Calibrating stopped: ${String(e?.message || e).slice(0, 200)}` };
  } finally {
    running = false;
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

// Put it back: the setting as Bob found it before he first changed it. One Windows prompt.
export async function putBack(cfg, { os_ = OS, run = runFile, save = () => {}, log = () => {} } = {}) {
  const was = cfg?.share?.wifiWas;
  if (os_ !== 'win' || !was?.adapter || !was?.setting) return { ok: false, text: 'There is nothing of mine to put back.' };
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', elevate(`Set-NetAdapterAdvancedProperty -Name ${ps(was.adapter)} -DisplayName ${ps(was.setting)} -DisplayValue ${ps(was.value)} -ErrorAction Stop`)]);
  if (!r.ok) return { ok: false, text: /cancel/i.test(r.err) ? 'Windows asked, and the answer was No, so nothing changed.' : 'Windows didn\'t change the setting.' };
  save(null);
  log('bob-net', `Wi-Fi band setting put back (your click): "${was.setting}" = "${was.value}"`);
  return { ok: true, text: `The card's "${was.setting}" says "${was.value}" again.` };
}
// Kept in settings: only what Put it back needs.
export const cleanWifiWas = (w) => (w && typeof w === 'object' && w.adapter && w.setting ? { adapter: String(w.adapter).slice(0, 120), setting: String(w.setting).slice(0, 120), value: String(w.value || '').slice(0, 120) } : undefined);
