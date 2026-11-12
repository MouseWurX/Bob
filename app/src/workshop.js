// The advanced workshop (off unless the user turns it on): Bob drives ComfyUI for jobs his own engines can't do,
// such as graphs with custom nodes, face fixers or IP-Adapter. the user never has to open ComfyUI.
// Workflows are ComfyUI "Export (API)" files dropped into inn\workshop. Bob fills in the prompt, any
// reference picture and a fresh seed, runs it, and brings the results back into the chat.
// ComfyUI is only ever reached on this PC (127.0.0.1); only the port can be changed.
import { deadline as withDeadline } from './hang-guard.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const workshopDir = (cfg) => path.join(cfg.innDir, 'workshop');
export const comfyBase = (cfg) => `http://127.0.0.1:${Number(cfg.workshop?.port) || 8188}`;
export const workshopOn = (cfg) => cfg.workshop?.enabled === true;

const README = `Bob's advanced workshop
=======================

Put ComfyUI workflows here and Bob can run them for you.

1. Build or load a workflow in ComfyUI.
2. Menu: Workflow > Export (API). Save the file into this folder.
   Give it a name that says what it does, like "portrait with face fix.json".
3. Ask Bob: "use the portrait with face fix workflow for Captain Mira".

Bob fills in the prompt (the node titled "positive" or "prompt", or the first text box), a negative prompt
(a node titled "negative"), reference pictures (Load Image nodes) and a new seed each time.
`;

export function ensureWorkshop(cfg) {
  fs.mkdirSync(workshopDir(cfg), { recursive: true });
  const r = path.join(workshopDir(cfg), 'README.txt');
  if (!fs.existsSync(r)) fs.writeFileSync(r, README);
}

const TEXT_CLASSES = /CLIPTextEncode|TextEncode|PromptText|Text Multiline|String/i;
const title = (n) => String(n?._meta?.title || '');

function promptNodes(wf) {
  const nodes = Object.entries(wf).filter(([, n]) => n && n.inputs);
  const textKey = (n) => ['text', 'prompt', 'positive', 'string', 'text_g'].find((k) => typeof n.inputs[k] === 'string');
  const pos = nodes.find(([, n]) => /positive|prompt/i.test(title(n)) && !/negative/i.test(title(n)) && textKey(n))
    || nodes.find(([, n]) => TEXT_CLASSES.test(n.class_type || '') && textKey(n) && !/negative/i.test(title(n)));
  const neg = nodes.find(([, n]) => /negative/i.test(title(n)) && textKey(n));
  return { pos: pos && { id: pos[0], key: textKey(pos[1]) }, neg: neg && { id: neg[0], key: textKey(neg[1]) } };
}

const imageInputs = (wf) => Object.entries(wf).filter(([, n]) => /^LoadImage/i.test(n?.class_type || '') && n.inputs && 'image' in n.inputs).map(([id]) => id);

function outputKinds(wf) {
  const kinds = new Set();
  for (const n of Object.values(wf)) {
    const c = n?.class_type || '';
    if (/SaveImage|PreviewImage/i.test(c)) kinds.add('pictures');
    if (/VHS_VideoCombine|SaveVideo|SaveAnimated|SaveWEBM/i.test(c)) kinds.add('video');
    if (/SaveAudio/i.test(c)) kinds.add('audio');
  }
  return [...kinds];
}

export function listWorkflows(cfg) {
  if (!fs.existsSync(workshopDir(cfg))) return [];
  return fs.readdirSync(workshopDir(cfg)).filter((f) => f.toLowerCase().endsWith('.json')).map((f) => {
    try {
      const wf = JSON.parse(fs.readFileSync(path.join(workshopDir(cfg), f), 'utf8'));
      if (wf.nodes && wf.links) return { name: f.slice(0, -5), ok: false, why: 'This is a normal save, not an API export. In ComfyUI use Workflow > Export (API).' };
      const p = promptNodes(wf);
      return { name: f.slice(0, -5), ok: true, prompt: Boolean(p.pos), pictures: imageInputs(wf).length, makes: outputKinds(wf) };
    } catch (e) { return { name: f.slice(0, -5), ok: false, why: `Can't read it (${e.message}).` }; }
  });
}

export function findWorkflow(cfg, name) {
  const all = listWorkflows(cfg);
  const q = String(name || '').toLowerCase().trim();
  return all.find((w) => w.name.toLowerCase() === q) || all.find((w) => w.name.toLowerCase().includes(q)) || null;
}

async function upload(cfg, file, signal) {
  const fd = new FormData();
  fd.append('image', new Blob([fs.readFileSync(file)]), `bob-${path.basename(file)}`);
  fd.append('overwrite', 'true');
  const r = await fetch(comfyBase(cfg) + '/upload/image', { method: 'POST', body: fd, signal: withDeadline(signal, 60_000) });
  if (!r.ok) throw new Error(`ComfyUI wouldn't take the reference picture (${r.status}).`);
  return (await r.json()).name;
}

// Returns [{ file, name, kind }] saved in the painter folder.
export async function runWorkflow(cfg, name, { prompt, negative, refs = [] }, { signal, onProgress }) {
  if (!workshopOn(cfg)) throw new Error('ComfyUI workflows are switched off (Models and settings, Settings).');
  const w = findWorkflow(cfg, name);
  if (!w) throw new Error(`There's no workshop workflow called ${name}. I have: ${listWorkflows(cfg).map((x) => x.name).join(', ') || 'none yet'}.`);
  if (!w.ok) throw new Error(`${w.name}: ${w.why}`);
  const wf = JSON.parse(fs.readFileSync(path.join(workshopDir(cfg), w.name + '.json'), 'utf8'));
  const base = comfyBase(cfg);
  try { await fetch(base + '/system_stats', { signal: AbortSignal.timeout(3000) }); }
  catch { throw new Error(`ComfyUI isn't running on this replicant matrix (port ${Number(cfg.workshop?.port) || 8188}). Start it in Pinokio, then ask me again.`); }

  const p = promptNodes(wf);
  if (prompt && p.pos) wf[p.pos.id].inputs[p.pos.key] = String(prompt).slice(0, 4000);
  if (negative && p.neg) wf[p.neg.id].inputs[p.neg.key] = String(negative).slice(0, 2000);
  const slots = imageInputs(wf);
  for (const [i, id] of slots.entries()) if (refs[i]) wf[id].inputs.image = await upload(cfg, refs[i], signal);
  for (const n of Object.values(wf)) {
    for (const k of ['seed', 'noise_seed']) if (n?.inputs && typeof n.inputs[k] === 'number') n.inputs[k] = Math.floor(Math.random() * 2 ** 31);
  }

  const q = await fetch(base + '/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: wf, client_id: 'bob' }), signal: withDeadline(signal, 60_000) });
  if (!q.ok) throw new Error(`ComfyUI refused the job (${q.status}): ${(await q.text()).slice(0, 300)}`);
  const { prompt_id } = await q.json();
  const t0 = Date.now();
  const deadline = t0 + (Number(cfg.workshop?.timeoutSeconds) || 1800) * 1000;
  let outputs = null;
  try {
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      if (signal?.aborted) throw new Error('Stopped.');
      onProgress?.(Math.round((Date.now() - t0) / 1000));
      const h = await (await fetch(`${base}/history/${prompt_id}`, { signal: withDeadline(signal, 30_000) })).json();
      const entry = h[prompt_id];
      if (entry?.status?.status_str === 'error') {
        const msg = (entry.status.messages || []).find((m) => m[0] === 'execution_error')?.[1];
        throw new Error(`ComfyUI hit an error${msg ? ` in ${msg.node_type}: ${String(msg.exception_message).slice(0, 200)}` : ''}.`);
      }
      if (entry?.status?.completed || (entry?.outputs && Object.keys(entry.outputs).length && entry?.status?.status_str === 'success')) { outputs = entry.outputs; break; }
    }
  } catch (e) {
    if (signal?.aborted) { try { await fetch(base + '/interrupt', { method: 'POST', signal: withDeadline(null, 5000) }); } catch {} }
    throw e;
  }
  if (!outputs) throw new Error('ComfyUI didn\'t finish in time.');

  const files = Object.values(outputs).flatMap((o) => [
    ...(o.images || []).map((f) => ({ ...f, kind: /\.(webm|mp4|gif)$/i.test(f.filename) ? 'video' : 'image' })),
    ...(o.gifs || []).map((f) => ({ ...f, kind: 'video' })),
    ...(o.videos || []).map((f) => ({ ...f, kind: 'video' })),
    ...(o.audio || []).map((f) => ({ ...f, kind: 'audio' }))
  ]).filter((f) => f.type !== 'temp' || Object.values(outputs).length === 1);
  fs.mkdirSync(cfg.painterDir, { recursive: true });
  const made = [];
  for (const f of files.slice(0, 12)) {
    const url = `${base}/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder || '')}&type=${encodeURIComponent(f.type || 'output')}`;
    const buf = Buffer.from(await (await fetch(url, { signal: withDeadline(signal, 5 * 60_000) })).arrayBuffer());
    const ext = (path.extname(f.filename) || '.png').toLowerCase().replace(/[^.a-z0-9]/g, '');
    const nm = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}${ext}`;
    fs.writeFileSync(path.join(cfg.painterDir, nm), buf);
    made.push({ file: path.join(cfg.painterDir, nm), name: nm, kind: f.kind });
  }
  if (!made.length) throw new Error('The workflow ran but saved nothing. It needs a Save Image, Save Video or Save Audio node.');
  return made;
}
