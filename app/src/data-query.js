// 📊 "Let Bob ask questions of data files" (Settings, How Bob works, 🧰 More tools; off by default).
// A CSV or TSV file (up to 100 MB) or a SQLite database file is asked questions with SQL, so only the answer comes
// into the chat, not the whole file. A CSV is loaded into a database in memory (table "data") that's thrown away
// after; a database file is opened read-only. Only one SELECT (or WITH ... SELECT) per question: no ATTACH, no
// changes, no add-ons. Files must be in the folders Bob may read. Database files can hold passwords (a browser's,
// an app's), so with the "Keep secret files private" hard limit on, opening one shows a card first; Bob's own
// files are never opened. Node's own SQLite (node:sqlite), nothing extra to install.
import fs from 'node:fs';
import path from 'node:path';
import { insideAny, isInside, appDir } from './config.js';
import { isSensitive } from './tools.js';
import { limitOn } from './hands-settings.js';

export const MAX_CSV = 100 * 1024 * 1024;
export const MAX_ROWS = 200;
const DB_EXT = /\.(db|sqlite|sqlite3|db3)$/i;
const CSV_EXT = /\.(csv|tsv|tab|txt)$/i;

let sqlite = null;
async function Database() {
  if (!sqlite) {
    // node:sqlite says "experimental" once on the console; it's been steady since Node 22.5.
    const was = process.emitWarning;
    process.emitWarning = (w, ...a) => (/SQLite/i.test(String(w?.message || w)) ? undefined : was.call(process, w, ...a));
    try { sqlite = await import('node:sqlite'); } finally { process.emitWarning = was; }
  }
  return sqlite.DatabaseSync;
}

// ---------------------------------------------------------------- CSV
export function sniffDelimiter(head) {
  const line = String(head).split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = [',', '\t', ';', '|'].map((d) => [d, line.split(d).length - 1]).sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}
// RFC 4180: quoted fields, "" inside quotes, line breaks inside quotes.
export function parseCsv(text, delim = sniffDelimiter(text)) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
      continue;
    }
    if (c === '"' && field === '') { q = true; continue; }
    if (c === delim) { row.push(field); field = ''; continue; }
    if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
// Column names SQL can use: letters, digits and _, no repeats ("Unit price" -> unit_price).
export function columnNames(head) {
  const seen = new Map();
  return head.map((h, i) => {
    let n = String(h || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `col${i + 1}`;
    if (/^\d/.test(n)) n = `c_${n}`;
    const k = seen.get(n) || 0; seen.set(n, k + 1);
    return k ? `${n}_${k + 1}` : n;
  });
}
const NUM = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e[+-]?\d+)?$/i;
const asValue = (v) => { const t = String(v).trim().replace(/^\$/, ''); if (t === '') return null; if (NUM.test(t)) { const n = Number(t.replace(/,/g, '')); if (Number.isFinite(n)) return n; } return v; };

export async function csvDatabase(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('That file has no rows.');
  const cols = columnNames(rows[0]);
  const Db = await Database();
  const db = new Db(':memory:');
  db.exec(`CREATE TABLE data (${cols.map((c) => `"${c}"`).join(', ')})`);
  const ins = db.prepare(`INSERT INTO data VALUES (${cols.map(() => '?').join(', ')})`);
  db.exec('BEGIN');
  for (const r of rows.slice(1)) ins.run(...cols.map((_, i) => asValue(r[i] ?? '')));
  db.exec('COMMIT');
  return { db, cols, headers: rows[0], count: rows.length - 1 };
}

// ---------------------------------------------------------------- SQL that only reads
export function readOnlySql(sql) {
  const s = String(sql || '').trim().replace(/;\s*$/, '');
  if (!s) throw new Error('There was no question (SQL) to ask.');
  if (s.length > 5000) throw new Error('That query is too long (5,000 characters at most).');
  const bare = s.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""').replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
  if (bare.includes(';')) throw new Error('One query at a time, please.');
  if (!/^\s*(select|with|values)\b/i.test(bare)) throw new Error('Only SELECT queries: this tool only reads.');
  if (/\b(attach|detach|pragma|insert|update|delete|replace\s+into|create|drop|alter|vacuum|reindex|load_extension|readfile|writefile|fts3_tokenizer)\b/i.test(bare)) throw new Error('That query would do more than read, so I won\'t run it.');
  return s;
}

export function table(rows, max = MAX_ROWS) {
  if (!rows.length) return '(no rows)';
  const cols = Object.keys(rows[0]);
  const cell = (v) => (v == null ? '' : typeof v === 'number' ? String(Number(v.toPrecision(12))) : String(v).replace(/\s+/g, ' ').slice(0, 80));
  const lines = [cols.join(' | '), cols.map(() => '---').join(' | '), ...rows.slice(0, max).map((r) => cols.map((c) => cell(r[c])).join(' | '))];
  return lines.join('\n') + (rows.length > max ? `\n[${rows.length - max} more rows not shown; add LIMIT or a WHERE]` : '');
}

// ---------------------------------------------------------------- the file
const own = (cfg, f) => [appDir, cfg.dataDir, cfg.agentDir, cfg.innDir].filter(Boolean).some((d) => isInside(d, f));
export function fileProblem(cfg, file) {
  if (!file || !path.isAbsolute(String(file))) return 'Give the full path to the file.';
  const f = path.resolve(String(file));
  if (!fs.existsSync(f)) return `There's no file at ${f}.`;
  if (!insideAny(cfg.readRoots || [], f)) return `I'm not allowed to read ${f}.`;
  if (own(cfg, f)) return 'That\'s one of my own files, which I never open as data.';
  if (!DB_EXT.test(f) && !CSV_EXT.test(f)) return 'I ask questions of CSV and TSV files and SQLite databases (.db, .sqlite). For Excel, save it as CSV first, or use "Read and search my documents".';
  if (!DB_EXT.test(f) && isSensitive(cfg, f)) return 'That file holds keys or passwords, so it stays off-limits to me.';
  return '';
}
export const needsCard = (cfg, file) => DB_EXT.test(String(file)) && limitOn(cfg, 'secrets');

export async function openData(cfg, file) {
  const f = path.resolve(String(file));
  if (DB_EXT.test(f)) {
    const Db = await Database();
    const db = new Db(f, { readOnly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
    return { db, kind: 'database', tables };
  }
  const size = fs.statSync(f).size;
  if (size > MAX_CSV) throw new Error(`That file is ${Math.round(size / 1048576)} MB; I take CSV files up to 100 MB.`);
  const r = await csvDatabase(fs.readFileSync(f, 'utf8'));
  return { db: r.db, kind: 'csv', tables: ['data'], cols: r.cols, headers: r.headers, count: r.count };
}

export async function lookAt(cfg, file) {
  const d = await openData(cfg, file);
  try {
    if (d.kind === 'csv') {
      const sample = d.db.prepare('SELECT * FROM data LIMIT 5').all();
      return `CSV with ${d.count.toLocaleString('en')} rows. Table: data. Columns (SQL name = heading): ${d.cols.map((c, i) => (c === d.headers[i] ? c : `${c} = "${String(d.headers[i]).slice(0, 40)}"`)).join(', ')}.\nFirst rows:\n${table(sample)}`;
    }
    const parts = d.tables.slice(0, 30).map((t) => {
      const cols = d.db.prepare(`SELECT name, type FROM pragma_table_info(?)`).all(t).map((c) => `${c.name}${c.type ? ` ${c.type}` : ''}`);
      let n = '?'; try { n = d.db.prepare(`SELECT count(*) AS n FROM "${t.replace(/"/g, '""')}"`).get().n; } catch {}
      return `${t} (${n} rows): ${cols.join(', ')}`;
    });
    return `SQLite database, opened read-only. Tables:\n${parts.join('\n') || '(none)'}`;
  } finally { d.db.close(); }
}

export async function ask(cfg, file, sql) {
  const q = readOnlySql(sql);
  const d = await openData(cfg, file);
  try {
    const rows = d.db.prepare(q).all();
    return { rows, text: table(rows) };
  } catch (e) {
    throw new Error(`The query didn't work: ${String(e.message).replace(/^SQLITE_ERROR:\s*/, '')}${d.kind === 'csv' ? ` (the table is "data"; columns: ${d.cols.join(', ')})` : ''}`);
  } finally { d.db.close(); }
}

const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export function dataTool(cfg, on = () => true) {
  return {
    schema: fn('query_data', 'Answer questions about a big CSV/TSV file or a SQLite database without reading it all: look first (columns and a few rows), then ask with one SQL SELECT. A CSV is the table "data".', {
      file: { type: 'string', description: 'Full path to the .csv, .tsv, .db or .sqlite file.' },
      action: { type: 'string', enum: ['look', 'ask'], description: 'look = columns, row count, first rows. ask = run sql.' },
      sql: { type: 'string', description: 'ask: one SELECT, like SELECT region, sum(total) FROM data GROUP BY region ORDER BY 2 DESC LIMIT 10' }
    }, ['file', 'action']),
    approvalGroup: 'query_data',
    async check({ file }) {
      if (!on() || fileProblem(cfg, file) || !needsCard(cfg, file)) return null;
      return `Bob wants to open the database ${path.basename(String(file))}, read-only, to answer your question. Database files can hold saved passwords, so Bob asks first.`;
    },
    async run({ file, action, sql }) {
      if (!on()) return 'Asking questions of data files is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob ask questions of data files".';
      const problem = fileProblem(cfg, file);
      if (problem) return problem;
      if (action !== 'ask' || !sql) return await lookAt(cfg, file);
      const r = await ask(cfg, file, sql);
      return `${r.rows.length} row${r.rows.length === 1 ? '' : 's'}:\n${r.text}`;
    },
    summary: ({ file, action, sql }) => `data: ${path.basename(String(file || ''))} ${action === 'ask' ? String(sql || '').slice(0, 80) : 'look'}`
  };
}
