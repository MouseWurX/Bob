// Computer Science Lab: Bring in a full-size brain. The Lab's own ways (Make a brain's running files, the ladder, Mix,
// Stack, Take out the refusal habit) start from a full-size file (F16 or BF16), and Bob's catalogue only downloads the
// running files (Q4 and friends). This is the way in: a Hugging Face name or link is looked up (public card only), its
// full-size GGUF files are listed with their sizes, and the one picked is downloaded into the Lab's own folder
// (<models>/bob/lab/full-size) and added to Bob's list as one of Your own brains, so it shows in the Lab's brain lists
// and in Equip Bob like any other. A file already on this replicant matrix is added the same way without a download.
// A link to a .gguf file elsewhere works too. Nothing is ever uploaded, and an HF_TOKEN goes only to huggingface.co.
// One download at a time; it isn't a Lab job, so a job can run meanwhile, and Stop throws the part away.
import fs from 'node:fs';
import path from 'node:path';
import { parseSource, hfFileUrl, getFile, sourceWords } from './lab-senses.js';
import { inspectOwn, ownModels, ownId, cleanOwnModels } from './own-models.js';
import { saveSettings } from './config.js';
import { fullSizeDirOf, labOn } from './lab.js';
import { PLAY_MAX_GB } from './lab-playground.js';
import { partsOf, joinParts } from './lab-split.js'; // brains in parts become one file (llama-gguf-split)

const GB = 1e9;
const round1 = (x) => Math.round(x * 10) / 10;
export const FULL_FILE = /(^|[-_.])(f16|bf16|f32)([-_.]|\.gguf$)/i; // a full-size file by its name
export const MAX_FULL_GB = 40; // nothing bigger comes down: the Lab's ways stop at PLAY_MAX_GB anyway
export const fullSizeDir = (cfg) => fullSizeDirOf(cfg);
export const ROUTES = ['/api/lab/full/look', '/api/lab/full/get', '/api/lab/full/stop', '/api/lab/full/add'];

const totalOf = (res) => { const cr = res.headers?.get?.('content-range'); const m = cr && cr.match(/\/(\d+)$/); return m ? Number(m[1]) : Number(res.headers?.get?.('content-length')) || 0; };
const safeName = (f) => String(f || '').split('/').pop().replace(/[^\w.+-]+/g, '_').slice(0, 120);
const isFull = (name) => /\.gguf$/i.test(name) && FULL_FILE.test(name) && !/mmproj/i.test(name);

// Look a source up without downloading. For a Hugging Face repo: its licence and every full-size GGUF with its size
// (split files are shown as one, by their first part). For a link: the file's size from its headers. For a file here:
// what the GGUF says. Gives { ok, kind, name, license, files: [{ file, gb, fits, note }], warn } or { ok: false, error }.
export async function lookFullSize(input, { fetchFn = fetch, token = process.env.HF_TOKEN || '', signal, maxGB = PLAY_MAX_GB } = {}) {
  const src = parseSource(input);
  if (!src) return { ok: false, error: 'Say where the brain is: a Hugging Face name (owner/name) or link, a link to a .gguf file, or the path of a .gguf file on this replicant matrix.' };
  const fits = (gb) => (gb <= maxGB ? `Fits the Lab's ways (up to ${maxGB} GB).` : gb <= MAX_FULL_GB ? `Too big for the Lab's ways (they stop at ${maxGB} GB); it would only run, not be worked on.` : 'Too big to bring in.');
  if (src.kind === 'file') {
    const seen = inspectOwn(src.path);
    if (seen.error) return { ok: false, error: seen.error };
    const pp = partsOf(seen.file); // one part of a brain in parts: the whole size, and what Add will do
    if (pp) { const gb = round1(pp.have.reduce((a, f) => { try { return a + fs.statSync(f).size; } catch { return a; } }, 0) / GB); return { ok: true, kind: 'file', name: seen.name.replace(/-\d{5}-of-\d{5}$/i, ''), path: seen.file, license: '', files: [{ file: path.basename(pp.first), gb, fits: fits(gb), full: isFull(seen.file), parts: pp.n, note: pp.missing.length ? `${pp.missing.length} of its ${pp.n} parts aren't in that folder. Put them all together first.` : `${pp.n} parts. Add joins them into one file in the Lab's full-size folder (about ${gb} GB more on disk); your parts stay where they are.` }], warn: isFull(seen.file) ? '' : 'Its name doesn\'t say F16 or BF16. If it\'s a running file (Q4 and friends), the Lab\'s ways won\'t start from it.' }; }
    return { ok: true, kind: 'file', name: seen.name, path: seen.file, license: '', files: [{ file: path.basename(seen.file), gb: seen.sizeGB, fits: fits(seen.sizeGB), full: isFull(seen.file) }], warn: isFull(seen.file) ? '' : 'Its name doesn\'t say F16 or BF16. If it\'s a running file (Q4 and friends), the Lab\'s ways won\'t start from it.' };
  }
  if (src.kind === 'link') {
    let res; try { res = await getFile(src.url, { fetchFn, token: '', headers: { Range: 'bytes=0-0' }, signal }); } catch (e) { return { ok: false, error: e.message }; }
    const gb = round1(totalOf(res) / GB); try { res.body?.cancel?.(); } catch {}
    const file = safeName(new URL(src.url).pathname);
    return { ok: true, kind: 'link', name: file.replace(/\.gguf$/i, ''), url: src.url, license: '', files: [{ file, gb, fits: fits(gb), full: isFull(file) }], warn: isFull(file) ? '' : 'Its name doesn\'t say F16 or BF16. If it\'s a running file, the Lab\'s ways won\'t start from it.' };
  }
  const api = `https://huggingface.co/api/models/${src.repo}${src.revision ? `/revision/${encodeURIComponent(src.revision)}` : ''}?blobs=true`;
  let res;
  try { res = await fetchFn(api, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal, redirect: 'error' }); } catch { return { ok: false, error: 'Hugging Face couldn\'t be reached from this replicant matrix.' }; }
  if (res.status === 401 || res.status === 403) return { ok: false, error: token ? 'Hugging Face says your token can\'t open this one. If it\'s gated, accept its terms on its page first.' : 'This one is private or gated. Put your own HF_TOKEN in the environment Bob starts from, then try again.' };
  if (res.status === 404) return { ok: false, error: `Hugging Face has no model called ${src.repo}.` };
  if (!res.ok) return { ok: false, error: `Hugging Face answered ${res.status}. Try again later.` };
  let j; try { j = await res.json(); } catch { return { ok: false, error: 'Hugging Face sent something the Lab couldn\'t read.' }; }
  const card = j.cardData || {};
  const license = String(Array.isArray(card.license) ? card.license[0] : card.license || (j.tags || []).find((t) => /^license:/.test(t))?.slice(8) || '').slice(0, 60);
  const sib = (j.siblings || []).map((x) => ({ file: String(x.rfilename || ''), bytes: Number(x.size) || 0 })).filter((x) => x.file);
  const ggufs = sib.filter((x) => /\.gguf$/i.test(x.file));
  const full = ggufs.filter((x) => isFull(x.file));
  const files = [];
  for (const f of full) {
    const m = f.file.match(/^(.*)-(\d{5})-of-(\d{5})\.gguf$/i); // split files: list the first part once, with the whole size
    if (m) { if (m[2] !== '00001') continue; const parts = full.filter((x) => x.file.startsWith(m[1] + '-') && /-of-\d{5}\.gguf$/i.test(x.file)); const bytes = parts.reduce((a, x) => a + x.bytes, 0); const gb = round1(bytes / GB); files.push({ file: f.file, gb, fits: fits(gb), full: true, parts: parts.length, note: `${parts.length} parts; the Lab fetches them all and joins them into one file.` }); continue; }
    const gb = round1(f.bytes / GB); files.push({ file: f.file, gb, fits: fits(gb), full: true });
  }
  if (src.file) { const pick = files.find((x) => x.file === src.file); if (!pick) return { ok: false, error: `${src.repo} has no full-size file called ${src.file}.` }; }
  const out = { ok: true, kind: 'hf', repo: src.repo, revision: src.revision, name: src.repo.split('/')[1], license, licenseKnown: Boolean(license) && license !== 'unknown', gated: Boolean(j.gated), files, running: ggufs.filter((x) => !isFull(x.file) && !/mmproj/i.test(x.file)).length };
  if (!files.length) out.warn = ggufs.length ? `${src.repo} has only running files (Q4 and friends), no F16 or BF16. Try the maker's own repo, or one whose name ends -GGUF with BF16 in its list.` : sib.some((x) => /\.safetensors$/i.test(x.file)) ? `${src.repo} has safetensors weights, not GGUF files. The Lab can't convert those here yet; look for a -GGUF repo of the same brain.` : `${src.repo} has no GGUF files.`;
  if (!out.licenseKnown) out.note = 'No licence on its card, so there\'s no clear right to share what you make from it: keep it private.';
  return out;
}

// The one download, its state for the page, and Stop.
export class FullSize {
  constructor(lab) { this.lab = lab; this.cur = null; this.last = null; }
  view() {
    const c = this.cur || this.last;
    if (!c) return null;
    return { name: c.name, file: c.file, done: c.done, total: c.total, state: c.state, error: c.error || '', note: c.note || '', gb: round1((c.total || 0) / GB), doneGB: round1((c.done || 0) / GB), added: c.added || null, part: c.part || 0, parts: c.parts || 0 };
  }
  stop() { if (this.cur) { this.cur.ac.abort('stop'); return true; } return false; }

  // Start a download (hf or link). Resolves right away with the view; progress goes out as 'lab-full' events.
  async start({ input, file }, { fetchFn = fetch, token = process.env.HF_TOKEN || '' } = {}) {
    if (this.cur) throw new Error(`${this.cur.name} is still coming down. Stop it first, or wait.`);
    const look = await lookFullSize(input, { fetchFn, token });
    if (!look.ok) throw new Error(look.error);
    if (look.kind === 'file') return this.addFile(look.path, look.name);
    const pick = look.files.find((x) => x.file === file) || (look.files.length === 1 ? look.files[0] : null);
    if (!pick) throw new Error(look.files.length ? 'Pick one of its files first.' : look.warn || 'There\'s no full-size file there.');
    if (pick.gb > MAX_FULL_GB) throw new Error(`${pick.file} is ${pick.gb} GB, too big to bring in.`);
    const dir = fullSizeDir(this.lab.cfg);
    fs.mkdirSync(dir, { recursive: true });
    let freeGB = null; try { const st = fs.statfsSync(dir); freeGB = Math.round((st.bavail * st.bsize) / GB); } catch {}
    if (freeGB !== null && freeGB < pick.gb + 2) throw new Error(`${pick.file} needs about ${pick.gb} GB and there's ${freeGB} GB free. Free some space first.`);
    const urls = look.kind === 'link' ? [look.url] : pick.parts ? Array.from({ length: pick.parts }, (_, i) => hfFileUrl({ repo: look.repo, revision: look.revision, file: pick.file.replace(/-00001-of-/, `-${String(i + 1).padStart(5, '0')}-of-`) })) : [hfFileUrl({ repo: look.repo, revision: look.revision, file: pick.file })];
    const dests = urls.map((u) => path.join(dir, safeName(decodeURIComponent(new URL(u).pathname))));
    if (dests.some((d) => fs.existsSync(d))) { const have = dests.find((d) => fs.existsSync(d)); throw new Error(`${path.basename(have)} is already in the Lab's full-size folder. Add it from there instead (paste its path).`); }
    const ac = new AbortController();
    const c = { name: look.name, file: pick.file, done: 0, total: Math.round(pick.gb * GB), state: 'downloading', ac, parts: urls.length, part: 1, license: look.license, where: look.kind === 'hf' ? `${look.repo} on Hugging Face` : sourceWords(parseSource(input)) };
    this.cur = c;
    this.lab.broadcast({ type: 'lab-full', full: this.view() });
    (async () => {
      try {
        let got = 0, last = 0;
        for (let i = 0; i < urls.length; i++) {
          c.part = i + 1;
          const bytes = await this.fetchTo(urls[i], dests[i], { fetchFn, token: look.kind === 'hf' ? token : '', signal: ac.signal, onProgress: (n) => { c.done = got + n; if (Date.now() - last > 1500) { last = Date.now(); this.lab.broadcast({ type: 'lab-full', full: this.view() }); } } });
          got += bytes;
        }
        c.done = got; if (!c.total) c.total = got;
        // In parts: join them into one file (the Lab's ways read one file), then the parts go. If the join can't
        // happen (no tool, no room), the first part goes on the list: the brain runs from its parts as they are.
        let first = dests[0];
        if (dests.length > 1) {
          c.state = 'joining'; this.lab.broadcast({ type: 'lab-full', full: this.view() });
          const j = await (this.joinFn || joinParts)(this.lab.cfg, dests[0], { outDir: path.dirname(dests[0]), dropParts: true, signal: ac.signal });
          if (j.ok) first = j.file; else c.note = j.error;
        }
        const added = this.add(first, look.name, { license: look.license, where: c.where });
        c.added = added.added; c.state = 'done';
      } catch (e) {
        for (const d of dests) { try { fs.unlinkSync(d + '.part'); } catch {} }
        if (ac.signal.aborted) { c.state = 'stopped'; c.error = 'Stopped. The part that came down was thrown away.'; for (const d of dests) { try { fs.unlinkSync(d); } catch {} } }
        else { c.state = 'failed'; c.error = String(e.message || e).slice(0, 300); }
      } finally {
        this.last = c; this.cur = null;
        this.lab.broadcast({ type: 'lab-full', full: this.view() });
      }
    })();
    return this.view();
  }

  // One file to `dest`, picking up a .part left from before (a Range request), with progress.
  async fetchTo(url, dest, { fetchFn, token, signal, onProgress }) {
    const part = dest + '.part';
    let have = 0; try { have = fs.statSync(part).size; } catch {}
    let res = await getFile(url, { fetchFn, token, headers: have ? { Range: `bytes=${have}-` } : {}, signal });
    if (have && res.status !== 206) { have = 0; try { fs.unlinkSync(part); } catch {} } // the server starts over, so do we
    if (have && res.status === 206 && !/^bytes \d+-/.test(res.headers?.get?.('content-range') || '')) { have = 0; try { fs.unlinkSync(part); } catch {} res = await getFile(url, { fetchFn, token, signal }); }
    const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
    let got = have;
    try {
      for await (const chunk of res.body) {
        if (signal?.aborted) throw new Error('Stopped.');
        got += chunk.length;
        if (got > MAX_FULL_GB * GB) throw new Error('That file is bigger than it said, so the Lab stopped.');
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        onProgress(got);
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
      fs.renameSync(part, dest);
      return got;
    } catch (e) { out.destroy(); if (!signal?.aborted) { /* keep the part for next time */ } throw e; }
  }

  // A file on this replicant matrix. One part of a brain in parts is joined into the Lab's full-size folder first (the
  // Lab's ways read one file); your parts stay where they are. If the join can't happen, the first part goes on the
  // list as it is, since the brain runs from its parts.
  async addFile(file, name) {
    const pp = partsOf(String(file || ''));
    if (!pp) return this.add(file, name);
    const j = await (this.joinFn || joinParts)(this.lab.cfg, pp.first, { outDir: fullSizeDir(this.lab.cfg), dropParts: false });
    if (!j.ok) return { ...this.add(pp.first, name), note: j.error };
    return { ...this.add(j.file, name), joined: j.parts };
  }

  // Put a file on Bob's list as one of Your own brains (the same list Get models' "Add your own brain" writes).
  add(file, name, { license = '', where = '' } = {}) {
    const seen = inspectOwn(file);
    if (seen.error) throw new Error(seen.error);
    const list = ownModels(this.lab.cfg);
    const had = list.find((o) => o.gguf.toLowerCase() === seen.file.toLowerCase());
    if (had) return { added: had, already: true };
    const nm = String(name || '').trim() || seen.name;
    const next = cleanOwnModels([...list, { id: ownId(nm, list), name: nm, gguf: seen.file }]);
    if (next.length === list.length) throw new Error('Bob couldn\'t add that one (the list is full, or the name is empty).');
    saveSettings(this.lab.cfg, { ownModels: next });
    if (this.lab.brain) this.lab.brain.catalogNames = null;
    const note = { file: seen.file, name: nm, license, where, when: new Date().toISOString() };
    try { fs.writeFileSync(seen.file.replace(/\.gguf$/i, '') + '.from.json', JSON.stringify(note, null, 1)); } catch {}
    return { added: next[next.length - 1], already: false, sizeGB: seen.sizeGB, arch: seen.arch };
  }
}

export function fullSize(lab) { if (!lab.fullSize) lab.fullSize = new FullSize(lab); return lab.fullSize; }

// Routes. Look is read-only and allowed from the phone; get, stop and add only on this replicant matrix itself (they
// write Bob's settings).
export async function fullSizeRoute({ req, res, p, isLocal, lab, body, send }) {
  if (!ROUTES.includes(p)) return false;
  if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
  const b = await body(req).catch(() => ({}));
  if (!labOn(lab.cfg)) { send(res, 403, { error: 'The Computer Science Lab is off.' }); return true; }
  if (p === '/api/lab/full/look') { const v = await lookFullSize(String(b.input || ''), lab.fullDeps || {}); send(res, 200, isLocal ? v : { ...v, path: undefined }); return true; }
  if (!isLocal) { send(res, 403, { error: 'Brains are brought in on this replicant matrix itself, not from the phone.' }); return true; }
  try {
    if (p === '/api/lab/full/get') { send(res, 200, await fullSize(lab).start({ input: String(b.input || ''), file: String(b.file || '') }, lab.fullDeps || {})); return true; }
    if (p === '/api/lab/full/stop') { send(res, 200, { stopped: fullSize(lab).stop() }); return true; }
    if (p === '/api/lab/full/add') { send(res, 200, await fullSize(lab).addFile(String(b.file || ''), String(b.name || ''))); return true; }
  } catch (e) { send(res, 400, { error: e.message }); return true; }
  return false;
}
