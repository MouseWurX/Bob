// 1.5.113: another program holding the graphics card. When a brain or picture load times out, Bob reads the card once
// (nvidia-smi, about 50 ms). If it's nearly full of something that isn't his, he says so plainly, stops retrying, and
// tells waiting jobs at once instead of each one sitting through its own five-minute load. He looks again before the
// next job that needs the card, and carries on as normal once it's free.
import { execFile } from 'node:child_process';
import path from 'node:path';
import { IN_TEST } from './recycle.js';

// Bob's own engines (and Bob himself), which never count as "another program".
const OWN = /^(llama-server|sd-server|sd|sd-cli|whisper-server|whisper-cli|piper|ollama|ollama_llama_server|bob|electron|node)(\.exe)?$/i;
export const NEED_MB = 2048; // less free than this after Bob let go of everything: the card is taken
export const RECHECK_MS = 30e3; // how often a busy card is looked at again, at most

export const isLoadTimeout = (e) => e?.code === 'painter_timeout' || /took too long( to (load|start))?\.$/.test(String(e?.message || ''));

// Windows itself, its shell, overlays and browsers: they show up on the card list but hold little, and naming them would
// send people after the wrong program (1.5.113 live test: "ShellHost; CrossDeviceResume" for a 9.7 GB llama-imatrix).
const SYSTEM = /^(explorer|dwm|shellhost|shellexperiencehost|startmenuexperiencehost|searchhost|searchapp|crossdeviceresume|lockapp|textinputhost|applicationframehost|widgets|widgetservice|systemsettings|gamebar|gamebarftserver|xboxgamebar.*|phoneexperiencehost|translucenttb|parsecd|amdrssrcext|radeonsoftware|amdow|nvidia overlay|nvcontainer|nvidia share|nvidia web helper|msedge|msedgewebview2|chrome|firefox|brave|opera|claude|discord|steamwebhelper|onedrive|teams|ms-teams|slack|spotify|windowsterminal|openconsole|conhost|powershell|pwsh|cmd|code|cursor|notepad|photos|msteams|whatsapp|telegram|zoom|nvidia app|steam|epicgameslauncher|battle\.net|ea desktop|galaxyclient)$/i;
const KEEP_MB = 256; // with real figures, smaller than this isn't what's filling the card

// { freeMB, others: [{ name, mb }] }, or null when the card can't be read (no NVIDIA card, no nvidia-smi).
// Only programs nvidia-smi lists as using the card are ever named (never Windows itself, overlays or browsers).
// On Windows nvidia-smi can't see each program's memory ([N/A]), so Windows' own counter may give sizes, but only
// when they add up: on some PCs it reports the whole card for several programs at once, and then no sizes are shown.
// Nov 13 (the owner's PC locked up loading a brain while a test's llama-server held the card): with ownPids (a Set of
// Bob's own engine process ids), an engine Bob didn't start (a test's llama-server, llama-bench, sd-server...) counts as
// another program too. Without it, engine names are taken as Bob's, as before.
export const ENGINE_NAMES = /^(llama-server|llama-bench|llama-cli|llama-perplexity|llama-imatrix|sd-server|sd|sd-cli|whisper-server|whisper-cli)$/i;
export async function readCardUse(run = smi, winMem = process.platform === 'win32' ? winGpuMem : async () => null, { ownPids = null } = {}) {
  const gpu = await run(['--query-gpu=memory.free,memory.total', '--format=csv,noheader,nounits']);
  const [freeMB, totalMB] = gpu == null ? [NaN, NaN] : String(gpu).split(/\r?\n/)[0].split(',').map((x) => Number(x.trim()));
  if (!Number.isFinite(freeMB)) return null;
  const apps = (await run(['--query-compute-apps=pid,process_name,used_memory', '--format=csv,noheader,nounits'])) || '';
  const byPid = new Map();
  for (const r of String(apps).split(/\r?\n/).map((l) => l.split(',').map((x) => x.trim()))) {
    if (r.length < 3 || !r[1]) continue;
    const name = path.basename(r[1].replace(/\\/g, '/')).replace(/\.exe$/i, '');
    const pid = Number(r[0]) || 0, foreign = ownPids instanceof Set && ENGINE_NAMES.test(name) && !ownPids.has(pid);
    if (!foreign && (OWN.test(name) || OWN.test(`${name}.exe`) || SYSTEM.test(name))) continue;
    byPid.set(pid || `n${byPid.size}`, { name, mb: Number(r[2]) || 0, ...(pid ? { pid } : {}), ...(foreign ? { engine: true } : {}) });
  }
  const cap = Number.isFinite(totalMB) && totalMB > 0 ? totalMB : Infinity;
  if (byPid.size && ![...byPid.values()].some((a) => a.mb > 0)) {
    const win = (await winMem().catch(() => null)) || [];
    // Windows' figures are used only if the whole list adds up to no more than the card holds.
    const sane = !win.some((w) => w.mb > cap) && win.reduce((t, w) => t + w.mb, 0) <= cap;
    if (sane) for (const w of win) { const had = byPid.get(w.pid); if (had) had.mb = w.mb; }
  }
  let others = [...byPid.values()];
  const sum = others.reduce((t, a) => t + a.mb, 0);
  if (others.some((a) => a.mb > cap) || sum > cap) others = others.map((a) => ({ ...a, mb: 0 })); // figures that can't be true: no sizes
  if (others.some((a) => a.mb > 0)) others = others.filter((a) => a.mb >= KEEP_MB).sort((a, b) => b.mb - a.mb);
  return { freeMB, totalMB: Number.isFinite(totalMB) ? totalMB : null, others };
}
function smi(args) {
  if (IN_TEST) return Promise.resolve(null); // tests never reach the real nvidia-smi
  return new Promise((resolve) => {
    try { execFile('nvidia-smi', args, { timeout: 3000, windowsHide: true }, (err, out) => resolve(err ? null : String(out))); }
    catch { resolve(null); }
  });
}
// Windows' "GPU Process Memory" counter (Task Manager's Dedicated GPU memory column): [{ pid, name, mb }], or null.
// English counter names only; elsewhere it answers null and the names come from nvidia-smi alone.
const PS = "$ErrorActionPreference='SilentlyContinue'; (Get-Counter '\\GPU Process Memory(*)\\Dedicated Usage').CounterSamples | Where-Object { $_.CookedValue -gt 0 } | ForEach-Object { if ($_.InstanceName -match 'pid_(\\d+)_') { $p=[int]$matches[1]; $n=(Get-Process -Id $p).ProcessName; \"$p,$n,$([math]::Round($_.CookedValue/1MB))\" } }";
export function parseWinGpuMem(out) {
  const per = new Map();
  for (const l of String(out || '').split(/\r?\n/)) {
    const m = l.trim().match(/^(\d+),([^,]*),(\d+)$/);
    if (!m) continue;
    const pid = Number(m[1]), had = per.get(pid);
    per.set(pid, { pid, name: m[2] || had?.name || '', mb: (had?.mb || 0) + Number(m[3]) });
  }
  return [...per.values()];
}
function winGpuMem() {
  if (IN_TEST) return Promise.resolve(null);
  return new Promise((resolve) => {
    try { execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS], { timeout: 8000, windowsHide: true }, (err, out) => resolve(err ? null : parseWinGpuMem(out))); }
    catch { resolve(null); }
  });
}

export const busyByOther = (card) => Boolean(card && card.freeMB < NEED_MB);

export const CARD_STILL_BUSY = 'Not done: the graphics card is still busy with that other program (see the ⚠ line above).';

const gb = (mb) => `${(mb / 1024).toFixed(1)} GB`;
export function cardBusyLine(card) {
  const top = [...(card?.others || [])].sort((a, b) => b.mb - a.mb).slice(0, 2)
    .map((a) => (a.mb ? `${a.name}, ${gb(a.mb)}` : a.name));
  const who = top.length ? `another program (${top.join('; ')})` : 'another program';
  return `⚠ The graphics card is busy with ${who}, so I can't load a brain or make pictures on it right now. Close that program, or send it again once it's done. I'll look again before the next job.`;
}
