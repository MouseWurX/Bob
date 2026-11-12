// 1.5.163 Brains and lesson sets on Hugging Face, for Forge plans. The Lab only reads a repo's public card here
// (licence, gated or private, size, files). A brain's weights are downloaded on the rented card, never here; lesson
// sets are downloaded and converted here by the Forge's lesson importer before a run. A private or gated repo needs the person's own HF_TOKEN in their environment; it is sent
// only to huggingface.co and never shown, logged or written into a plan.
import { classOf } from './lab-challenges.js';
import { keyValue } from './secret-box.js';

const NAME = /^[A-Za-z0-9][\w.-]{0,95}\/[A-Za-z0-9][\w.-]{0,95}$/;
const REV = /^[\w.-]{1,64}$/;
const FILE = /^(?!.*\.\.)[\w./-]{1,200}\.(jsonl|json|parquet|csv)$/i;

// "owner/name", a huggingface.co link (models or datasets, with /tree/<rev> or /blob/<rev>/<file>), or
// hf:[datasets/]owner/name[:file][@rev]. Gives { kind, repo, revision, file } or null.
export function parseHfRef(input, kind = 'model') {
  let s = String(input || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (!s || s.length > 400) return null;
  let rev = '', file = '';
  if (/^hf:/i.test(s)) {
    s = s.slice(3);
    if (/^datasets\//i.test(s)) { kind = 'dataset'; s = s.slice(9); }
    const at = s.lastIndexOf('@'); if (at > 0) { rev = s.slice(at + 1); s = s.slice(0, at); }
    const colon = s.indexOf(':'); if (colon > 0) { file = s.slice(colon + 1); s = s.slice(0, colon); }
  } else if (/^https?:\/\//i.test(s)) {
    const m = s.match(/^https:\/\/huggingface\.co\/(datasets\/)?([^/]+\/[^/]+)(?:\/(?:tree|blob|resolve)\/([^/]+)(?:\/(.+))?)?$/i);
    if (!m) return null;
    if (m[1]) kind = 'dataset';
    s = m[2]; rev = m[3] || ''; file = m[4] ? decodeURIComponent(m[4]) : '';
  } else if (/^datasets\//i.test(s)) { kind = 'dataset'; s = s.slice(9); }
  if (!NAME.test(s) || (rev && !REV.test(rev))) return null;
  if (file && (kind !== 'dataset' || !FILE.test(file))) return null;
  return { kind, repo: s, revision: rev && rev !== 'main' ? rev : '', file };
}

const LICENCE_OK = /^(apache-2\.0|mit|bsd(-[23]-clause)?|cc-by-4\.0|cc-by-sa-4\.0|cc0-1\.0|odc-by|llama3(\.[123])?|gemma|openrail\+*|bigscience-openrail-m|creativeml-openrail-m|other)$/i;

// What the Lab shows about a repo before it goes in a plan. fetchFn and token are injected by tests.
export async function hfLookup(ref, { fetchFn = fetch, token = keyValue('HF_TOKEN'), signal } = {}) {
  const r = typeof ref === 'string' ? parseHfRef(ref) : ref;
  if (!r) return { ok: false, error: 'That isn\'t a Hugging Face name or link. It looks like owner/name, or a huggingface.co link.' };
  const api = `https://huggingface.co/api/${r.kind === 'dataset' ? 'datasets' : 'models'}/${r.repo}${r.revision ? `/revision/${encodeURIComponent(r.revision)}` : ''}`;
  let res;
  try { res = await fetchFn(api, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal, redirect: 'error' }); } catch { return { ok: false, error: 'Hugging Face couldn\'t be reached from this replicant matrix.' }; }
  if (res.status === 401 || res.status === 403) return { ok: false, private: true, error: token ? 'Hugging Face says your token can\'t open this one. If it\'s gated, accept its terms on its page first.' : 'This one is private or gated. Put your own HF_TOKEN in your environment, accept its terms on its page, and look again.' };
  if (res.status === 404) return { ok: false, error: `Hugging Face has no ${r.kind === 'dataset' ? 'dataset' : 'model'} called ${r.repo}${r.revision ? ` at ${r.revision}` : ''}.` };
  if (!res.ok) return { ok: false, error: `Hugging Face answered ${res.status}. Try again later.` };
  let j; try { j = await res.json(); } catch { return { ok: false, error: 'Hugging Face sent something the Lab couldn\'t read.' }; }
  const card = j.cardData || {};
  const lic = String(Array.isArray(card.license) ? card.license[0] : card.license || (j.tags || []).find((t) => /^license:/.test(t))?.slice(8) || '').slice(0, 60);
  const files = (j.siblings || []).map((x) => String(x.rfilename || '')).filter(Boolean);
  const out = { ok: true, kind: r.kind, repo: r.repo, revision: r.revision, file: r.file, license: lic, licenseKnown: Boolean(lic) && lic !== 'unknown', licenseOpen: LICENCE_OK.test(lic) && lic !== 'other', gated: Boolean(j.gated), private: Boolean(j.private), url: `https://huggingface.co/${r.kind === 'dataset' ? 'datasets/' : ''}${r.repo}` };
  if (r.kind === 'model') {
    const total = Number(j.safetensors?.total) || 0;
    const arch = String(j.config?.architectures?.[0] || '').slice(0, 80), type = String(j.config?.model_type || '').slice(0, 40);
    out.paramsB = total ? Math.round(total / 1e8) / 10 : null;
    out.cls = classOf(out.paramsB);
    out.moe = /moe/i.test(arch + type) || /-A\d+(\.\d+)?B\b/i.test(r.repo);
    out.arch = arch; out.weights = files.some((f) => /\.safetensors$/i.test(f)); out.gguf = files.filter((f) => /\.gguf$/i.test(f)).slice(0, 40);
    if (!out.weights) out.warn = 'This repo has no safetensors weights, so the Forge can\'t teach or cut it. A GGUF-only repo can only be run, not taught.';
  } else {
    out.files = files.filter((f) => FILE.test(f)).slice(0, 60);
    if (r.file && !files.includes(r.file)) return { ok: false, error: `${r.repo} has no file called ${r.file}.` };
    if (!out.files.length) out.warn = 'This dataset has no JSONL, JSON, Parquet or CSV files the Forge can read.';
  }
  if (!out.licenseKnown) out.note = 'No licence on its card, so there\'s no clear right to share what you make from it: keep it private. The set itself is never uploaded anywhere.';
  return out;
}
