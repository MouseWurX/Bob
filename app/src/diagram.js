// 1.5.95 Diagrams: flowcharts, mind maps, timelines and more, drawn with Mermaid (bundled, MIT, runs offline).
// Bob writes the diagram as Mermaid text; it's kept as a .mmd file in his folder (so he can change it later) and the
// chat draws it. Saving it as a picture (PNG), a scalable picture (SVG) or a PDF happens in the window that drew it,
// which sends the finished file back here (saveExport). Nothing goes online.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { findOutput } from './config.js';

// The diagram types Mermaid draws. The first word of the text must be one of them.
export const KINDS = ['flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'journey', 'gantt', 'pie', 'mindmap', 'timeline', 'quadrantChart', 'gitGraph', 'sankey-beta', 'xychart-beta', 'block-beta', 'kanban', 'requirementDiagram', 'C4Context', 'packet-beta', 'architecture-beta', 'radar-beta', 'treemap-beta'];
// The file types the Save as card offers, in the words it shows.
export const FORMATS = { png: 'Picture (PNG)', svg: 'Scalable picture (SVG)', pdf: 'PDF' };
const MAX_BYTES = 25 * 1024 * 1024;

const firstWord = (line) => String(line || '').trim().split(/[\s;]/)[0];

// Bob's Mermaid text, tidied: code fences off, Windows line ends, a missing "flowchart TD" put back when the lines are
// plainly arrows, and flowchart labels with brackets or punctuation quoted (small brains often forget, and Mermaid
// then refuses the whole diagram). Throws a plain message Bob can act on when it isn't a diagram.
export function cleanMermaid(text) {
  let s = String(text || '').replace(/\r\n?/g, '\n').trim();
  s = s.replace(/^```\s*(?:mermaid)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  s = s.replace(/^mermaid\s*\n/i, '');
  if (!s) throw new Error('The diagram was empty. Write it in Mermaid, starting with a type such as "flowchart TD".');
  if (s.length > 20000) throw new Error('That diagram is too long (over 20,000 characters). Split it into smaller diagrams.');
  const lines = s.split('\n');
  const head = lines.findIndex((l) => l.trim() && !/^\s*%%/.test(l) && l.trim() !== '---');
  let kind = firstWord(lines[head]);
  if (/^---\s*$/.test(lines[0]?.trim() || '')) { // a front-matter block (title, config) first
    const end = lines.indexOf('---', 1);
    kind = firstWord(lines.slice(end + 1).find((l) => l.trim() && !/^\s*%%/.test(l)));
  }
  if (!KINDS.includes(kind)) {
    if (lines.some((l) => /-->|---|==>|-\.->/.test(l))) { s = `flowchart TD\n${s}`; kind = 'flowchart'; }
    else throw new Error(`A diagram has to start with its type, such as "flowchart TD", "sequenceDiagram", "mindmap" or "timeline" (it started with "${String(kind).slice(0, 40)}").`);
  }
  if (kind === 'flowchart' || kind === 'graph') {
    // A[Start (here)] -> A["Start (here)"]; same for {decisions} and (rounded) shapes.
    const quote = (open, inner, close) => (/^".*"$/.test(inner.trim()) || !/[()[\]{}<>|;:#&"]/.test(inner) ? `${open}${inner}${close}` : `${open}"${inner.replace(/"/g, "'")}"${close}`);
    s = s.split('\n').map((l) => l
      .replace(/(\b[\w-]+)\[(?!\[|\/|\\|\()([^\]\n]*?)\](?!\])/g, (m, id, inner) => `${id}${quote('[', inner, ']')}`)
      .replace(/(\b[\w-]+)\{(?!\{)([^}\n]*?)\}(?!\})/g, (m, id, inner) => `${id}${quote('{', inner, '}')}`)
      .replace(/\|([^|\n]*[()[\]{}<>;#&][^|\n]*)\|/g, (m, inner) => (/^".*"$/.test(inner.trim()) ? m : `|"${inner.replace(/"/g, "'")}"|`))
    ).join('\n');
  }
  return s;
}

const slug = (t) => String(t || 'diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'diagram';

// Keep the diagram's text in Bob's folder. Returns { file, name }.
export function saveDiagram(cfg, { title, source }) {
  const dir = cfg.painterDir;
  fs.mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const name = `${day}-${slug(title)}-${crypto.randomBytes(3).toString('hex')}.mmd`;
  const file = path.join(dir, name);
  fs.writeFileSync(file, `%% ${String(title || 'Diagram').replace(/\n/g, ' ').slice(0, 120)}\n${source}\n`);
  return { file, name };
}

// The finished file the chat window made (PNG, SVG or PDF), saved next to the diagram's text.
// data: base64. Checked: the diagram is Bob's, the file really is that type, an SVG carries no scripts.
export function saveExport(cfg, { name, format, data }) {
  const base = path.basename(String(name || ''));
  if (!/^[\w.-]+\.mmd$/.test(base)) throw new Error('Unknown diagram.');
  const src = findOutput(cfg, base);
  if (!fs.existsSync(src)) throw new Error('That diagram isn\'t in Bob\'s folder any more.');
  const ext = String(format || '').toLowerCase();
  if (!FORMATS[ext]) throw new Error(`Bob saves diagrams as ${Object.keys(FORMATS).join(', ')}.`);
  const buf = Buffer.from(String(data || ''), 'base64');
  if (!buf.length || buf.length > MAX_BYTES) throw new Error('That file is empty or too big.');
  if (ext === 'png' && buf.readUInt32BE(0) !== 0x89504e47) throw new Error('That isn\'t a PNG.');
  if (ext === 'pdf' && buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('That isn\'t a PDF.');
  if (ext === 'svg') {
    const t = buf.toString('utf8');
    if (!/<svg[\s>]/i.test(t)) throw new Error('That isn\'t an SVG.');
    if (/<script|\bon\w+\s*=|javascript:|<foreignObject[^>]*>[\s\S]*?<iframe/i.test(t)) throw new Error('That SVG has scripts in it, so Bob won\'t save it.');
  }
  const file = path.join(path.dirname(src), base.replace(/\.mmd$/, `.${ext}`));
  fs.writeFileSync(file, buf);
  return { file, name: path.basename(file), url: `/images/${encodeURIComponent(path.basename(file))}` };
}

// The make_diagram tool.
export function diagramTool() {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'make_diagram',
        description: 'Draw a flowchart or other diagram in the chat, in Mermaid. To change one, send the whole changed diagram again.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'A short title, 2 to 6 words.' },
            mermaid: { type: 'string', description: 'Mermaid, starting with its type: "flowchart TD" (or LR), sequenceDiagram, mindmap, timeline, gantt, pie, classDiagram, erDiagram, stateDiagram-v2.' },
            format: { type: 'string', enum: Object.keys(FORMATS), description: 'Only if {{USER}} named png, svg or pdf.' }
          },
          required: ['mermaid']
        }
      }
    },
    async run({ title, mermaid, format }, ctx) {
      const source = cleanMermaid(mermaid);
      const t = String(title || '').trim().slice(0, 80) || 'Diagram';
      const { file, name } = saveDiagram(ctx.cfg, { title: t, source });
      const fmt = FORMATS[String(format || '').toLowerCase()] ? String(format).toLowerCase() : FORMATS[ctx.wantType] ? ctx.wantType : ''; // named in the ask: no card
      ctx.emit({ type: 'diagram', url: `/images/${encodeURIComponent(name)}`, file, title: t, ...(fmt ? { format: fmt } : {}) });
      return `Drew the diagram "${t}"; it shows in the chat${fmt ? ` and is saved as ${fmt.toUpperCase()} next to its text` : ', with a Save as card (PNG, SVG or PDF) for the user to pick'}. Its Mermaid text is kept in ${file}. If the chat says it couldn't draw it, fix the Mermaid and call make_diagram again. Tell the user in one short line; don't paste the Mermaid text.`;
    },
    summary: ({ title }) => `diagram: ${String(title || 'diagram').slice(0, 60)}`
  };
}
