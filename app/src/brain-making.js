// Making things: pictures, picture edits, video, sound and music, and workshop workflows.
// Methods of the Brain class. Split out of brain.js.
import { stepsFor, paint, paintingAvailable } from './painter.js';
import { withRetry } from './handoff.js';
import { verifyOutput } from './verify.js';
import { maestroMake } from './maestro.js';
import { capabilities } from './capabilities.js';
import { aceMissingFiles, aceModelsEntry, ACE_MODELS_ID, makeAudio, songTitle } from './audio.js';
import { runWorkflow } from './workshop.js';
import path from 'node:path';
import { findOutput } from './config.js';
import fs from 'node:fs';
import { imageInfoOf, sizeLike } from './imageinfo.js';
import { deadline as withDeadline } from './hang-guard.js';
import { today } from './tools.js';
import crypto from 'node:crypto';
import { editPrompt } from './brain-words.js';

// Methods of the Brain class, put on it in its main file with the same rules as the methods written inside it.
export const makingParts = {
  // Bob's own painter (stable-diffusion.cpp): no ComfyUI needed.
  async paintOwn(kind, args, ctx) {
    const video = kind === 'video';
    if (kind === 'edit' && !this.cfg.painter?.sdcpp?.exe) throw new Error('The painter (stable-diffusion.cpp) isn\'t installed yet.');
    ctx.emit({ type: 'announce', text: video
      ? 'Freeing the graphics card so the clip can be made. Video is slow: give it several minutes.'
      : 'Freeing the graphics card so the picture can be made. It takes about half a minute.' });
    // The gate: brains let go, the card really free, the picture engine ready. Then paint, check the file is a real
    // picture or clip, and try once more if it isn't (the card can take a moment to free up after a big brain).
    const unloaded = await this.gate.need({ id: 'painter', kind }, { signal: ctx.signal, emit: ctx.emit });
    this.setState('painting', video ? 'Filming' : 'Painting', null);
    this.log(kind, `unloaded ${unloaded.join(', ') || 'nothing'}; painting with ${this.painter?.paint ? 'the picture engine' : 'sd.cpp'}`);
    // 1.5.109: while it loads, the picture engine prints counters of its own (82/82, 1/49, 119/519...), and after the
    // last step it prints the decode (104/104). Only lines counting to this job's steps are the real ones; until the
    // first of those the bar says it's loading.
    const want = stepsFor(this.cfg.painter?.sdcpp?.[kind], kind);
    this.setState('painting', 'Loading the picture engine', null);
    const onProgress = (n, total) => { if (Number(total) !== want || !(n >= 1)) return; this.setState('painting', `${video ? 'Filming' : 'Painting'} ${Math.min(n, total)}/${total}`, null); };
    const type = video ? 'video' : 'image';
    const { file, name } = await withRetry(async () => {
      const made = this.painter?.paint ? await this.painter.paint(kind, args, { signal: ctx.signal, onProgress }) : await paint(this.cfg, kind, args, { signal: ctx.signal, onProgress });
      if (!made.checked) { const v = await verifyOutput(made.file, type); if (!v.ok) throw new Error(`The painter finished but ${v.why}.`); }
      return made;
    }, {
      signal: ctx.signal, wait: 3000,
      retryable: async (e) => { if (!(await this.cardTaken(e, ctx.emit, ctx.sessionId))) return true; e.message = this.cardHeld.line; e.code = 'card_held'; return false; }, // 1.5.113
      onRetry: (e) => { this.log('handoff', `painting failed (${e.message.slice(0, 120)}); trying once more`); ctx.ledger?.step('retry', { what: 'painter', why: e.message }).done(); ctx.emit({ type: 'announce', text: `Making the ${video ? 'clip' : 'picture'} didn't work. Trying once more.` }); }
    });
    ctx.emit({ type, url: `/images/${encodeURIComponent(name)}`, file });
    ctx.painted = { kind, count: (ctx.painted?.count || 0) + 1, brainLeft: Boolean(ctx.painted?.brainLeft || unloaded.length) };
    ctx.paintedTotal = (ctx.paintedTotal || 0) + 1; // the whole turn, across rounds
    ctx.painted.total = ctx.paintedTotal;
    this.setState('thinking', '', null);
    return `${video ? 'Made a clip' : 'Painted a picture'}, saved as ${file}. The user can see it in the chat.`;
  },
  // Maestro does the work in its own process; Bob steps out of the GPU first so they don't fight over memory.
  async viaMaestro(kind, args, ctx) {
    if (!this.cfg.maestro?.enabled) throw new Error('Maestro is switched off. I paint and film myself.');
    const video = kind === 'video';
    const modelType = this.cfg.maestro[kind];
    ctx.emit({ type: 'announce', text: `Stepping out of the GPU and handing this to Maestro (${modelType}). ${video ? 'Clips take a few minutes.' : 'Should be quick.'} If Maestro hasn't used this model before, it downloads it first.` });
    const unloaded = await this.gate.need({ id: 'card' }, { signal: ctx.signal, emit: ctx.emit }); // the gate: the card really free first
    this.setState('painting', video ? 'Maestro is filming' : 'Maestro is painting', null);
    this.log(kind, `unloaded ${unloaded.join(', ') || 'nothing'}; Maestro ${modelType}`);
    const made = await maestroMake(this.cfg, kind, { ...args, modelType }, {
      signal: ctx.signal,
      onProgress: (st) => this.setState('painting', `Maestro: ${st.phase || st.status || 'working'}${st.step && st.total_steps ? ` ${st.step}/${st.total_steps}` : st.progress != null ? ` ${Math.round(st.progress * (st.progress <= 1 ? 100 : 1))}%` : ''}`, null)
    });
    for (const m of made) ctx.emit({ type: m.video ? 'video' : 'image', url: `/images/${encodeURIComponent(m.name)}`, file: m.file });
    this.setState('thinking', '', null);
    return `Maestro made ${made.length} file(s), saved as ${made.map((m) => m.file).join(', ')}. The user can see it in the chat.`;
  },
  // Music and sound effects from the audio workshop. Same GPU manners as the painter.
  async makeSound(kind, args, ctx) {
    const music = kind === 'music';
    const can = capabilities(this.cfg);
    if (!this.cfg.audio?.aceUrl && !(music ? can.music : can.sfx)) return this.offerSetup(music ? 'music' : 'sfx', ctx); // 1.5.91
    // 1.5.37: music needs its models on the PC first. If they aren't, offer the download (the user's click) and stop here.
    if (music && !this.cfg.audio?.aceUrl) {
      const missing = aceMissingFiles(this.cfg);
      if (missing.length) {
        const e = aceModelsEntry(this.cfg);
        // 1.5.38: the size of what's really left, not the whole set (most of it may already be here).
        const left = Math.max(0.1, Math.round(missing.reduce((t, f) => t + (f.bytes || 0), 0) / 1e8) / 10);
        ctx.emit({ type: 'offer-download', jobId: ctx.job?.id || null, id: ACE_MODELS_ID, name: e?.name || 'ACE-Step 1.5 music models', sizeGB: left, why: 'music' });
        throw Object.assign(new Error(`The music models aren't all on this PC yet (about ${left} GB left to download, first time only). Nothing was downloaded. A "Download the music models" button is now under this chat: tell the user to press it if they want music. The song then waits in Tasks and is made by itself when the download is done, so they don't need to ask again. Say it once, plainly, and don't call make_music again now.`), { code: 'MUSIC_MODELS_MISSING' });
      }
    }
    ctx.emit({ type: 'announce', text: music ? 'Stepping out of the GPU so the audio workshop can compose. Music takes a few minutes.' : 'Stepping out of the GPU for a sound effect. About a minute; the first time, it also fetches the model.' });
    const unloaded = await this.gate.need({ id: 'card' }, { signal: ctx.signal, emit: ctx.emit }); // the gate: the card really free first
    this.setState('painting', music ? 'Composing' : 'Making a sound', null);
    this.log(kind, `unloaded ${unloaded.join(', ') || 'nothing'}; audio workshop`);
    // 1.5.39: the engine's raw answer, when there is one, goes to the logbook; the chat gets the plain line.
    const { file, name } = await (async () => { try { return await makeAudio(this.cfg, kind, args, {
      signal: ctx.signal,
      onProgress: (n, total) => this.setState('painting', `${music ? 'Composing' : 'Making a sound'} ${Math.round((100 * n) / total)}%`, null)
    }); } catch (e) { if (e.details) this.log(kind, e.details); throw e; } })();
    // 1.5.41: the song's title, style and lyrics travel with it, for its player in the chat.
    const song = { title: songTitle(args, kind), style: String(args.prompt || '').slice(0, 200), sound: music ? 'music' : 'sfx', ...(music && args.lyrics ? { lyrics: String(args.lyrics).slice(0, 4000) } : {}) };
    ctx.emit({ type: 'audio', url: `/images/${encodeURIComponent(name)}`, file, song });
    this.setState('thinking', '', null);
    // 1.5.38: plain about where it is, so Bob never claims a song only played and wasn't kept.
    return `${music ? `Made the song "${song.title}"` : `Made the sound "${song.title}"`} and saved it as a .wav file: ${file}. It is kept on the PC: the user can play it in the chat, find it in Made by Bob (left menu, Sounds), or open that file. Tell the user where it was saved.`;
  },
  // The advanced workshop: a ComfyUI workflow the user saved. ComfyUI does the work in its own process.
  async runWorkshop({ workflow, prompt, negative, reference }, ctx) {
    const refs = this.pickRefs(reference);
    ctx.emit({ type: 'announce', text: `Stepping out of the GPU and running the "${workflow}" workflow in ComfyUI.` });
    const unloaded = await this.gate.need({ id: 'card' }, { signal: ctx.signal, emit: ctx.emit }); // the gate: the card really free first
    this.setState('painting', `Workshop: ${workflow}`, null);
    this.log('workshop', `unloaded ${unloaded.join(', ') || 'nothing'}; ComfyUI ${workflow}`);
    const made = await runWorkflow(this.cfg, workflow, { prompt: prompt && this.withLooks(prompt, refs), negative, refs: refs.map((r) => r.path) }, {
      signal: ctx.signal,
      onProgress: (secs) => this.setState('painting', `Workshop: ${workflow} (${secs} s)`, null)
    });
    for (const m of made) ctx.emit({ type: m.kind, url: `/images/${encodeURIComponent(m.name)}`, file: m.file });
    this.setState('thinking', '', null);
    return `The workshop made ${made.length} file(s): ${made.map((m) => m.file).join(', ')}. The user can see them in the chat.`;
  },
  // Reference names to pictures: the shelf or this chat, "last" (the newest picture Bob made), or one of
  // Bob's painted files by name. Each comes back with its path. Unknown names are an error Bob can fix.
  pickRefs(reference) {
    const names = [].concat(reference || []).flatMap((x) => String(x).split(/\s*[,;]\s*/)).filter(Boolean).slice(0, 4);
    return names.map((n) => this.findPicture(n) || (() => { throw new Error(`There's no reference called "${n}". Use "last" for the newest picture you made, a painted file name, or a name on the shelf: ${this.refs.list().filter((r) => r.kind !== 'chat').map((r) => r.name).join(', ') || 'nothing yet'}.`); })());
  },
  findPicture(name) {
    const n = String(name || '').trim().replace(/^["']|["']$/g, '');
    if (/^(the )?(last|latest|newest|previous)( (picture|image|one|painting|pic))?$/i.test(n)) {
      const last = this.made.list({ kind: 'image', limit: 1 })[0];
      return last ? { name: last.name, path: last.path, painted: true } : null;
    }
    const base = path.basename(n.replace(/\\/g, '/'));
    if (/\.(png|jpe?g|webp)$/i.test(base)) {
      const file = findOutput(this.cfg, base);
      if (fs.existsSync(file)) return { name: base, path: file, painted: true };
    }
    const r = this.refs.find(n);
    return r ? { ...r, path: this.refs.pathOf(r) } : null;
  },
  // The shape to paint an edit at: the picture's own (as shown), about a megapixel, unless another size was asked for.
  // 1024 x 1024 counts as "not asked": it's the default the chat brain copies from the tool description.
  editSize(ref, { width, height }) {
    if ((width || height) && !(Number(width) === 1024 && Number(height) === 1024)) return { width, height };
    const i = ref.painted ? imageInfoOf(ref.path) : this.refs.info?.(ref) || imageInfoOf(ref.path);
    return sizeLike(i?.width, i?.height) || { width, height };
  },
  // The look of each reference, in words, added to the prompt: helps every model, even ones that can't see.
  withLooks(prompt, refs) {
    const looks = refs.filter((r) => r.seen).map((r) => `${r.name}: ${r.seen}`).join(' ');
    return looks ? `${prompt}\n\nReference look: ${looks}`.slice(0, 2000) : prompt;
  },
  async makeVideo({ reference, ...args }, ctx) {
    const refs = this.pickRefs(reference);
    if (this.cfg.maestro?.enabled && this.cfg.maestro?.video) return this.viaMaestro('video', args, ctx);
    if (!paintingAvailable(this.cfg, 'video')) return this.offerSetup('video', ctx); // 1.5.91: a Set it up card, never an error
    // The first reference becomes the opening frame; the clip moves on from there.
    if (refs.length) return this.paintOwn('video', { ...args, prompt: this.withLooks(args.prompt, refs), image: refs[0].path }, ctx);
    return this.paintOwn('video', args, ctx);
  },
  // mode keep_look: an edit model holds the reference's look (same character, new scene).
  // mode start_from: the reference is the starting picture and strength says how much may change.
  // A picture-edit model that's on this PC but not given the "Picture edits" job yet (its name, or '').
  async editModelWaiting() {
    if (capabilities(this.cfg).edits) return '';
    try { const r = await this.shop?.roles(); return (!r?.current?.edit && r?.options?.edit?.[0]?.label) || ''; } catch { return ''; }
  },
  // Why an edit can't be done faithfully, in words Bob passes on (instead of quietly painting something new).
  async noEditModel(what, ctx = null) {
    if (ctx?.emit) { // 1.5.91: the card does the fixing (one click to put it in its slot, or get one)
      const offered = await this.offerSetup('edits', ctx, { quiet: true }).catch(() => '');
      if (offered) return `Didn't paint anything. Editing ${what} and keeping it looking the same needs a picture editor, and this replicant matrix doesn't have one in its slot yet. ${offered} Offer the alternative too: rework the picture from itself (make_image with mode start_from), where the look can drift.`;
    }
    const waiting = await this.editModelWaiting();
    const fix = waiting
      ? `${waiting} is on this replicant matrix but isn't assigned to "Picture edits": Settings, Brains, the Picture editor job (one click).`
      : 'No picture-edit model is on this replicant matrix yet: Get models, Pictures & video, a picture-edit model (Qwen Image Edit), then Settings, Brains, the Picture editor job.';
    return `Didn't paint anything. Editing ${what} and keeping it looking the same needs a picture-edit model. ${fix} Tell the user that plainly. Offer the alternative too: rework the picture from itself (make_image with mode start_from), where the look can drift.`;
  },
  async makeImage({ prompt, width, height, reference, mode, strength }, ctx) {
    let refs = this.pickRefs(reference);
    // 1.5.94: the user asked to change a picture but the brain named none (or asked for a new one): use that picture.
    // A new picture only when the user's own words asked for one (intent.js), never because a small brain forgot.
    if (!refs.length && ctx.wantsEdit) {
      const from = ctx.pics?.length ? ctx.pics.map((r) => ({ ...r, path: this.refs.pathOf(r) })) : ctx.editFrom ? [ctx.editFrom] : [];
      if (from.length) { refs = from; if (mode === 'new') mode = undefined; this.log('image', `edit meant: using ${from.map((r) => r.name).join(', ')}`); }
    }
    // A picture is attached but none was named: never paint something new by mistake when an edit was meant.
    if (!refs.length && ctx.pics?.length && mode !== 'new') {
      const names = ctx.pics.map((r) => `"${r.name}"`).join(', ');
      return `Didn't paint yet. A picture is attached to this message (${names}). To change or restyle it, call make_image again with reference [${ctx.pics.map((r) => `"${r.name}"`).join(', ')}] and a short instruction saying only what to change. To paint something new instead, call it with mode "new".`;
    }
    if (refs.length) {
      const can = capabilities(this.cfg);
      const files = refs.map((r) => r.path);
      // Editing a picture (one attached in chat, or one Bob made) keeps its shape, and the instruction goes as it is
      // (no "Reference look" description added) with a line to keep the rest: an edit model edits when it's told
      // what to change and repaints when it's handed a description. Shelf characters and scenes keep their look
      // in a new picture instead, so they get the description and the size asked for.
      const editing = refs[0].painted || refs[0].kind === 'chat';
      const size = editing || mode === 'start_from' ? this.editSize(refs[0], { width, height }) : { width, height };
      if (can.edits && mode !== 'start_from') return this.paintOwn('edit', { prompt: editing ? editPrompt(prompt) : this.withLooks(prompt, refs), ...size, refs: files }, ctx);
      if (!can.edits && mode !== 'start_from') return this.noEditModel(refs.map((r) => `"${r.name}"`).join(', '), ctx);
      if (!paintingAvailable(this.cfg, 'image')) return this.offerSetup('pictures', ctx);
      const out = await this.paintOwn('image', { prompt: this.withLooks(prompt, refs), ...size, image: files[0], strength: strength ?? (mode === 'start_from' ? 0.6 : 0.75) }, ctx);
      return can.edits ? out : `${out} (Reworked from ${refs[0].name} without a picture-edit model, so the look can drift.)`;
    }
    if (this.cfg.maestro?.enabled && this.cfg.painter?.engine === 'maestro' && this.cfg.maestro?.image) return this.viaMaestro('image', { prompt, width, height }, ctx);
    if (paintingAvailable(this.cfg, 'image')) return this.paintOwn('image', { prompt, width, height }, ctx);
    const c = this.cfg.comfy || {};
    if (!c.url || !c.workflowFile || !fs.existsSync(c.workflowFile)) return this.offerSetup('pictures', ctx); // 1.5.91
    const wf = JSON.parse(fs.readFileSync(c.workflowFile, 'utf8'));
    const nodes = Object.entries(wf);
    const promptNode = c.promptNodeId ? wf[c.promptNodeId] : nodes.find(([, n]) => n.class_type === 'CLIPTextEncode')?.[1];
    if (!promptNode) throw new Error('The ComfyUI workflow has no prompt node I can find.');
    promptNode.inputs.text = prompt;
    for (const [, n] of nodes) {
      if (n.inputs && 'seed' in n.inputs && typeof n.inputs.seed === 'number') n.inputs.seed = Math.floor(Math.random() * 2 ** 31);
      if (n.inputs && 'noise_seed' in n.inputs && typeof n.inputs.noise_seed === 'number') n.inputs.noise_seed = Math.floor(Math.random() * 2 ** 31);
      if (/EmptyLatentImage|EmptySD3LatentImage|EmptyFlux/i.test(n.class_type || '')) {
        if (width) n.inputs.width = Math.min(2048, Math.max(256, Math.round(width / 64) * 64));
        if (height) n.inputs.height = Math.min(2048, Math.max(256, Math.round(height / 64) * 64));
      }
    }

    ctx.emit({ type: 'announce', text: 'Freeing the graphics card so the picture can be made. It takes about half a minute.' });
    const unloaded = await this.clearGpu();
    this.state.model = null;
    this.setState('painting', 'Painting', null);
    this.log('image', `unloaded ${unloaded.join(', ') || 'nothing'}; painting`);

    const base = c.url.replace(/\/$/, '');
    const q = await fetch(base + '/prompt', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: wf, client_id: 'bob' }), signal: withDeadline(ctx.signal, 60_000) // item 212
    });
    if (!q.ok) throw new Error(`ComfyUI refused the job (${q.status}): ${(await q.text()).slice(0, 300)}`);
    const { prompt_id } = await q.json();
    const deadline = Date.now() + (c.timeoutSeconds || 300) * 1000;
    let images = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      if (ctx.signal.aborted) throw new Error('Stopped.');
      const h = await (await fetch(`${base}/history/${prompt_id}`, { signal: withDeadline(ctx.signal, 30_000) })).json();
      const entry = h[prompt_id];
      if (entry?.status?.status_str === 'error') throw new Error('ComfyUI hit an error while painting.');
      if (entry?.outputs) {
        images = Object.values(entry.outputs).flatMap((o) => o.images || []);
        if (images.length) break;
      }
    }
    if (!images?.length) throw new Error('ComfyUI didn\'t finish in time.');
    const saved = [];
    for (const img of images) {
      const url = `${base}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
      const buf = Buffer.from(await (await fetch(url, { signal: withDeadline(ctx.signal, 5 * 60_000) })).arrayBuffer());
      const name = `${today(this.cfg)}-${crypto.randomUUID().slice(0, 8)}${path.extname(img.filename) || '.png'}`;
      fs.writeFileSync(path.join(this.cfg.painterDir, name), buf);
      saved.push(name);
      ctx.emit({ type: 'image', url: `/images/${encodeURIComponent(name)}`, file: path.join(this.cfg.painterDir, name) });
    }
    this.setState('thinking', '', null);
    return `Painted ${saved.length} picture(s), saved in ${this.cfg.painterDir}: ${saved.join(', ')}. The user can see it in the chat.`;
  },
};
