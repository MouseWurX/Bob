// 🧾 Snap a receipt (Settings, 🗓 Everyday helpers: "Receipt tracker"; off unless you turn it on).
// Attach a photo of a receipt and say so ("add this receipt"): Bob reads it with his eyes and adds one line to a
// spending sheet: the date, the shop, the total, the currency, a category and a short note. Nothing goes online.
//
// The sheet is private, so it's always kept locked on disk (AES-256-GCM):
//   - normally with Bob's locked-secrets box (secret-box.js: the key sits in Windows DPAPI, the Mac Keychain or the
//     Linux Secret Service, so a copy of the file alone opens nothing);
//   - while a profile is open (profiles.js), in that person's own folder, with that person's own key.
// Settings shows the sheet and its totals, can delete a line, and saves a plain copy (CSV, for a spreadsheet) only
// when you press "Save as a spreadsheet". The locked sheet is never in a backup: its key belongs to this computer.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureBox } from './secret-box.js';
import { readText, writeText } from './vault.js';

const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });

export const MAX_ROWS = 5000;
export const CATEGORIES = ['groceries', 'eating out', 'household', 'transport', 'fuel', 'health', 'clothes', 'fun', 'bills', 'gifts', 'work', 'other'];
export const receiptsOn = (cfg) => cfg?.receipts === true;
export const sheetFile = (cfg) => path.join(cfg.profileDir || cfg.dataDir, 'spending.json');

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export function cleanRow(r = {}, now = Date.now()) {
  const total = Math.round(Number(String(r.total ?? '').replace(/[^0-9.-]/g, '')) * 100) / 100;
  if (!Number.isFinite(total) || total === 0 || Math.abs(total) > 1e7) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || '')) ? String(r.date) : new Date(now).toISOString().slice(0, 10);
  const cat = clip(r.category, 30).toLowerCase();
  return {
    id: typeof r.id === 'string' && /^[a-f0-9]{8,32}$/.test(r.id) ? r.id : crypto.randomBytes(6).toString('hex'),
    date: d, shop: clip(r.shop, 80) || 'Unknown shop', total, currency: (clip(r.currency, 3).toUpperCase().match(/^[A-Z]{3}$/) || ['CAD'])[0],
    category: CATEGORIES.includes(cat) ? cat : 'other', note: clip(r.note, 200), added: new Date(now).toISOString()
  };
}

// The rows, newest date first. A missing sheet is empty; a sheet that can't be opened throws (never read as empty,
// so it's never written over).
export function loadSheet(cfg) {
  const file = sheetFile(cfg);
  if (!fs.existsSync(file)) return [];
  if (cfg.profileDir) return JSON.parse(readText(file)).rows || [];
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const box = ensureBox(cfg);
  const text = box.open(raw.sheet || '');
  if (raw.sheet && !text) throw new Error('The spending sheet is locked with a key this Bob doesn\'t have.');
  return text ? JSON.parse(text) : [];
}

export function saveSheet(cfg, rows) {
  const file = sheetFile(cfg);
  const list = rows.slice(0, MAX_ROWS);
  if (cfg.profileDir) return writeText(cfg, file, JSON.stringify({ format: 1, rows: list }));
  const box = ensureBox(cfg);
  if (!box.ready) throw new Error('Bob\'s locked box isn\'t open, so the sheet wasn\'t saved (it\'s never kept plain).');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.part', JSON.stringify({ format: 1, sheet: box.seal(JSON.stringify(list)) }));
  fs.renameSync(file + '.part', file);
}

const byDate = (a, b) => (b.date + b.added).localeCompare(a.date + a.added);
export function addRow(cfg, r, now = Date.now()) {
  const row = cleanRow(r, now);
  if (!row) return { error: 'That receipt has no total I can read.' };
  const rows = loadSheet(cfg);
  rows.push(row);
  rows.sort(byDate);
  saveSheet(cfg, rows);
  return { row, count: rows.length };
}
export function removeRow(cfg, id) {
  const rows = loadSheet(cfg);
  const left = rows.filter((r) => r.id !== id);
  if (left.length === rows.length) return { error: 'That line isn\'t on the sheet.' };
  saveSheet(cfg, left);
  return { count: left.length };
}

// Totals per month and currency, and per category this month.
export function totals(rows, now = Date.now()) {
  const month = new Date(now).toISOString().slice(0, 7);
  const byMonth = {}, byCat = {};
  for (const r of rows) {
    const m = r.date.slice(0, 7);
    const k = `${m} ${r.currency}`;
    byMonth[k] = Math.round(((byMonth[k] || 0) + r.total) * 100) / 100;
    if (m === month) { const c = `${r.category} ${r.currency}`; byCat[c] = Math.round(((byCat[c] || 0) + r.total) * 100) / 100; }
  }
  return { month, byMonth, byCat };
}

// A plain copy for a spreadsheet. Cells that start with = + - @ get a ' in front so a spreadsheet never runs them.
const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(rows) {
  return ['Date,Shop,Total,Currency,Category,Note', ...rows.map((r) => [r.date, r.shop, r.total.toFixed(2), r.currency, r.category, r.note].map(cell).join(','))].join('\r\n') + '\r\n';
}

// The tool Bob uses after reading a receipt picture (only while the switch is on; the toolbox hides it otherwise).
export function receiptTool(brain) {
  const cfg = brain.cfg;
  return {
    schema: fn('spending_sheet', 'Add a receipt you read in a picture to {{USER}}\'s spending sheet, or list or total it.', {
      action: str('add, list or totals', { enum: ['add', 'list', 'totals'] }),
      date: str('YYYY-MM-DD'), shop: str(''), total: str('number'), currency: str('like CAD'), category: str('like groceries, fuel, bills'), note: str('main items')
    }, ['action']),
    async run(a) {
      if (!receiptsOn(cfg)) return 'The spending sheet is off. It\'s in Settings, 🗓 Everyday helpers: "Receipt tracker".';
      if (a.action === 'add') {
        const r = addRow(cfg, a);
        if (r.error) return r.error;
        return `Added: ${r.row.date}, ${r.row.shop}, ${r.row.total.toFixed(2)} ${r.row.currency} (${r.row.category}). ${r.count} line${r.count === 1 ? '' : 's'} on the sheet. Tell {{USER}} what you added, so they can fix it in Settings if you misread it.`;
      }
      const rows = loadSheet(cfg);
      if (!rows.length) return 'The spending sheet is empty.';
      if (a.action === 'totals') { const t = totals(rows); return `This month (${t.month}) by category: ${Object.entries(t.byCat).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('; ') || 'nothing yet'}. By month: ${Object.entries(t.byMonth).slice(0, 12).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('; ')}.`; }
      return rows.slice(0, 20).map((r) => `${r.date} ${r.shop} ${r.total.toFixed(2)} ${r.currency} (${r.category})`).join('\n');
    },
    summary: ({ action, shop, total }) => (action === 'add' ? `add receipt: ${String(shop || '').slice(0, 40)} ${total || ''}` : `spending sheet: ${action}`)
  };
}
