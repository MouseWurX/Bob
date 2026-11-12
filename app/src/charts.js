// 📈 "Let Bob draw charts from data" (Settings, How Bob works, 🧰 More tools; off by default).
// make_chart turns a CSV file, a SQLite database (through a SELECT, like query_data) or a small table from the
// chat into a bar, line or pie chart. The numbers are read by code, never retyped by the brain, and the chart is
// drawn the same way as make_diagram's (Mermaid's xychart and pie, in the chat, with Save as PNG, SVG or PDF).
import path from 'node:path';
import { saveDiagram } from './diagram.js';
import { parseCsv, columnNames, openData, readOnlySql, fileProblem, needsCard } from './data-query.js';

export const MAX_POINTS = 60;
const num = (v) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,%\s]/g, '')); return Number.isFinite(n) ? n : null; };
const label = (v) => String(v ?? '').replace(/["\n\r[\]]/g, ' ').trim().slice(0, 40) || '(blank)';

// Rows (objects) -> the Mermaid text. x: the label column; ys: the number columns.
export function chartSource({ rows, x, ys, kind = 'bar', title = 'Chart', yLabel = '' }) {
  if (!rows.length) throw new Error('There are no rows to draw.');
  const cols = Object.keys(rows[0]);
  const xc = x && cols.includes(x) ? x : cols[0];
  const yc = (ys && ys.length ? ys.filter((c) => cols.includes(c)) : cols.filter((c) => c !== xc && rows.some((r) => num(r[c]) != null))).slice(0, kind === 'pie' ? 1 : 4);
  if (!yc.length) throw new Error(`No number column to draw. Columns: ${cols.join(', ')}.`);
  const pts = rows.slice(0, MAX_POINTS);
  const t = String(title || 'Chart').replace(/"/g, "'").slice(0, 80);
  if (kind === 'pie') {
    const parts = pts.map((r) => [label(r[xc]), num(r[yc[0]])]).filter(([, v]) => v != null && v > 0);
    if (!parts.length) throw new Error('A pie chart needs numbers above zero.');
    return `pie title ${t}\n${parts.map(([l, v]) => `  "${l}" : ${v}`).join('\n')}`;
  }
  const yName = String(yLabel || (yc.length === 1 ? yc[0] : '')).replace(/"/g, "'").slice(0, 40);
  const lines = [`xychart-beta`, `  title "${t}"`, `  x-axis [${pts.map((r) => `"${label(r[xc])}"`).join(', ')}]`, ...(yName ? [`  y-axis "${yName}"`] : [])];
  for (const c of yc) lines.push(`  ${kind === 'line' ? 'line' : 'bar'} [${pts.map((r) => num(r[c]) ?? 0).join(', ')}]`);
  return lines.join('\n');
}

// A table pasted in the chat: CSV/TSV lines, or a Markdown table.
export function rowsFromText(text) {
  const s = String(text || '').trim();
  const md = s.split(/\r?\n/).filter((l) => /^\s*\|/.test(l));
  const grid = md.length >= 2
    ? md.filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l)).map((l) => l.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim()))
    : parseCsv(s);
  if (grid.length < 2) throw new Error('The table needs a heading row and at least one row of numbers.');
  const cols = columnNames(grid[0]);
  return { rows: grid.slice(1).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? '']))), cols };
}

const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export function chartTool(cfg, on = () => true) {
  return {
    schema: fn('make_chart', 'Draw a bar, line or pie chart from a CSV/database file or a small table, with the numbers read by code. Shows in the chat with Save as PNG.', {
      kind: { type: 'string', enum: ['bar', 'line', 'pie'], description: 'Default bar.' },
      file: { type: 'string', description: 'A .csv, .tsv, .db or .sqlite file (full path). Or give table.' },
      sql: { type: 'string', description: 'Optional, with file: one SELECT giving the label column first, then number columns (a CSV is the table "data"). Like SELECT month, sum(total) FROM data GROUP BY month ORDER BY month' },
      table: { type: 'string', description: 'Or: the numbers as CSV lines or a Markdown table, heading row first.' },
      x: { type: 'string', description: 'Optional: the label column. Default the first.' },
      y: { type: 'array', items: { type: 'string' }, description: 'Optional: the number column(s), up to 4 (pie: 1).' },
      title: { type: 'string', description: 'A short title.' }
    }, []),
    approvalGroup: 'query_data',
    async check({ file }) {
      if (!on() || !file || fileProblem(cfg, file) || !needsCard(cfg, file)) return null;
      return `Bob wants to open the database ${path.basename(String(file))}, read-only, to draw a chart. Database files can hold saved passwords, so Bob asks first.`;
    },
    async run({ kind, file, sql, table, x, y, title }, ctx = {}) {
      if (!on()) return 'Drawing charts from data is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob draw charts from data".';
      let rows;
      if (file) {
        const problem = fileProblem(cfg, file);
        if (problem) return problem;
        const d = await openData(cfg, file);
        try { rows = d.db.prepare(sql ? readOnlySql(sql) : `SELECT * FROM "${(d.tables[0] || 'data').replace(/"/g, '""')}" LIMIT ${MAX_POINTS}`).all().map((r) => ({ ...r })); }
        finally { d.db.close(); }
      } else if (table) rows = rowsFromText(table).rows;
      else return 'Give a file or a table of numbers to draw.';
      const norm = (c) => (c ? columnNames([c])[0] : c);
      const k = ['bar', 'line', 'pie'].includes(kind) ? kind : 'bar';
      const source = chartSource({ rows, x: norm(x), ys: (Array.isArray(y) ? y : y ? [y] : []).map(norm), kind: k, title: title || (file ? path.basename(file) : 'Chart') });
      const t = String(title || 'Chart').slice(0, 80);
      const { file: saved, name } = saveDiagram(ctx.cfg || cfg, { title: t, source });
      ctx.emit?.({ type: 'diagram', url: `/images/${encodeURIComponent(name)}`, file: saved, title: t });
      return `Drew the ${k} chart "${t}" from ${Math.min(rows.length, MAX_POINTS)} row${rows.length === 1 ? '' : 's'}${rows.length > MAX_POINTS ? ` (the first ${MAX_POINTS} of ${rows.length}; group or filter with sql for fewer)` : ''}. It shows in the chat with a Save as card (PNG, SVG or PDF). Say so in one line; don't list the numbers again unless asked.`;
    },
    summary: ({ kind, title }) => `chart: ${kind || 'bar'}${title ? ' ' + String(title).slice(0, 60) : ''}`
  };
}
