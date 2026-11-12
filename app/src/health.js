// The 🩺 Health page (Settings, This replicant matrix, 🩺 Health and history: Open the Health page). A page you open;
// it only looks. Each line says how one part of Bob is, and when something needs you, a button that fixes it or takes
// you where it's fixed. Nothing is changed until you press a button.
//   engine      Bob's engine answers
//   brain       which brains are loaded (none is fine: Bob loads one when you write)
//   card        graphics card memory (NVIDIA cards; others say "can't read it here")
//   disk        free space where Bob keeps his things
//   bobnet      your other Bobs on Bob-Net, how many answer
//   errors      the last errors in the logbook
// level: 'ok' (fine), 'info' (nothing wrong, worth knowing), 'warn' (worth a look), 'bad' (needs you).
// fix: { id, label } where id is a server fix (POST /api/health { fix }) or a place in Bob (go:...).
export const DISK_WARN_GB = 10;
export const DISK_BAD_GB = 2;
export const CARD_WARN = 0.92;

const errorLines = (logText, n = 5) => String(logText || '').replace(/\r\n/g, '\n').split('\n').filter((l) => / \| error \| /.test(l)).slice(-n).map((l) => l.replace(/^- /, '').slice(0, 220));

// probes: plain facts gathered by the server (or a test). Missing ones say "can't tell".
export function healthChecks(p = {}) {
  const out = [];
  out.push(p.engineOk === false
    ? { id: 'engine', label: 'Engine', level: 'bad', says: `I can't reach my engine${p.engineName ? `, ${p.engineName}` : ''}.`, fix: { id: 'go:adv-engines', label: 'Open Engines' } }
    : { id: 'engine', label: 'Engine', level: 'ok', says: `${p.engineName || 'My engine'} answers.` });
  const loaded = (Array.isArray(p.models) ? p.models : []).map((m) => m?.name || m).filter((x) => typeof x === 'string' && x);
  out.push(loaded.length
    ? { id: 'brain', label: 'Brain', level: 'ok', says: `Loaded: ${loaded.join(', ')}.` }
    : { id: 'brain', label: 'Brain', level: 'info', says: p.chatBrain ? `No brain loaded right now. I load ${p.chatBrainName || p.chatBrain} when you write.` : 'I have no brain picked yet.', fix: p.chatBrain ? { id: 'wake', label: 'Load it now' } : { id: 'go:cellar', label: 'Get a brain' } });
  if (p.card && p.card.totalGB) {
    const share = p.card.usedGB / p.card.totalGB;
    out.push({ id: 'card', label: 'Graphics card memory', level: share >= CARD_WARN ? 'warn' : 'ok', says: `${p.card.usedGB} of ${p.card.totalGB} GB in use${p.card.name ? ` on the ${p.card.name}` : ''}.${share >= CARD_WARN ? ' A brain may not fit, or may run slowly.' : ''}`, ...(share >= CARD_WARN ? { fix: { id: 'free-card', label: 'Let my brains go' } } : {}) });
  } else out.push({ id: 'card', label: 'Graphics card memory', level: 'info', says: 'I can\'t read the card\'s memory here (I only can on NVIDIA cards).' });
  if (Number.isFinite(p.diskFreeGB)) {
    const lvl = p.diskFreeGB < DISK_BAD_GB ? 'bad' : p.diskFreeGB < DISK_WARN_GB ? 'warn' : 'ok';
    out.push({ id: 'disk', label: 'Disk space', level: lvl, says: `${p.diskFreeGB} GB free where I keep my things.${lvl !== 'ok' ? ' Downloads and saves may fail.' : ''}`, ...(lvl !== 'ok' ? { fix: { id: 'go:tidy', label: 'Tidy up' } } : {}) });
  } else out.push({ id: 'disk', label: 'Disk space', level: 'info', says: 'I couldn\'t read the free space.' });
  const peers = p.peers || [];
  if (!peers.length) out.push({ id: 'bobnet', label: 'Bob-Net', level: 'info', says: 'No other Bobs are paired with me.' });
  else {
    const up = peers.filter((x) => x.ok).length;
    out.push({ id: 'bobnet', label: 'Bob-Net', level: up === peers.length ? 'ok' : 'warn', says: `${up} of ${peers.length} paired Bob${peers.length === 1 ? '' : 's'} answer${up === 1 ? 's' : ''}.${up < peers.length ? ` Not answering: ${peers.filter((x) => !x.ok).map((x) => x.name).join(', ')}.` : ''}`, ...(up < peers.length ? { fix: { id: 'go:adv-bobnet', label: 'Open Bob-Net' } } : {}) });
  }
  const errs = errorLines(p.logText);
  out.push(errs.length
    ? { id: 'errors', label: 'Last errors', level: 'info', says: `The last ${errs.length === 1 ? 'error' : `${errs.length} errors`} in my logbook:`, lines: errs, fix: { id: 'go:help-bundle', label: 'Save a help bundle' } }
    : { id: 'errors', label: 'Last errors', level: 'ok', says: 'No errors in my logbook.' });
  if (p.crashes) out.push({ id: 'crashes', label: 'Crash reports', level: 'warn', says: `${p.crashes} crash report${p.crashes === 1 ? '' : 's'} saved.`, fix: { id: 'go:crashes', label: 'Show them' } });
  const worst = out.some((c) => c.level === 'bad') ? 'bad' : out.some((c) => c.level === 'warn') ? 'warn' : 'ok';
  return { checks: out, worst };
}

export const SERVER_FIXES = ['wake', 'free-card'];
