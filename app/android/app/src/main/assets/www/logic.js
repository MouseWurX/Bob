// Bob for Android: the page's decisions, kept apart from the screen so test/run-android-test.js can check them.
// No imports or exports: the page loads it with a <script> tag, the tests with import(); both read globalThis.BobLogic.
(() => {
  const DEFAULT_PORT = 7777;

  // Same rule as NetBob.kt: only Tailscale addresses (100.64.0.0/10, or a *.ts.net name). Desktop Bob only lets
  // the phone in from Tailscale too, and Tailscale encrypts the line, so the passcode never crosses plain Wi-Fi.
  function netAddress(address) {
    let a = String(address || '').trim().toLowerCase().replace(/^http:\/\//, '').replace(/\/$/, '');
    if (!a || /[\/@\s]/.test(a) || a.startsWith('https:')) return null;
    let port = DEFAULT_PORT;
    const colon = a.lastIndexOf(':');
    if (colon > 0) {
      const p = a.slice(colon + 1);
      if (!/^\d{1,5}$/.test(p)) return null;
      port = Number(p);
      if (port < 1 || port > 65535) return null;
      a = a.slice(0, colon);
    }
    const ip = a.match(/^100\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ip) {
      const [b, c, d] = ip.slice(1).map(Number);
      if (b < 64 || b > 127 || c > 255 || d > 255) return null;
    } else if (a.length > 253 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.ts\.net$/.test(a)) return null;
    return `http://${a}:${port}`;
  }

  // Jobs the phone brain can't do, by the words in a message. Narrower than desktop Bob's tool word check
  // (src/toolbox.js): there a match only adds tools; here it puts a card in front of you, so it has to be sure.
  const BIG_JOBS = [
    { id: 'pictures', what: 'make or change pictures', words: /\b(draw|paint|sketch|illustrate|render)\b|\b(make|create|generate|design|give me|do)\b[^.?!]{0,40}\b(picture|image|photo|pic|portrait|wallpaper|logo|icon|sprite|artwork|drawing|painting)s?\b|\b(picture|image|photo|pic|drawing|painting|portrait)s? of\b|\b(edit|change|fix|touch up|upscale|restyle|recolou?r|photoshop|retouch)\b[^.?!]{0,30}\b(picture|image|photo|pic|selfie)s?\b|\b(make|design|create|give me)\b[^.?!]{0,30}\b(poster|banner|thumbnail|album cover|pfp|avatar)s?\b|\b(picture|image|photo|pic|selfie)\b[^.?!]{0,30}\blook like\b/i },
    { id: 'video', what: 'make video clips', words: /\b(make|create|generate|animate|render)\b[^.?!]{0,40}\b(video|clip|animation|gif)s?\b|\banimate\b/i },
    { id: 'music', what: 'make music and sound effects', words: /\b(make|create|generate|write|compose|produce)\b[^.?!]{0,40}\b(song|music|tune|melody|beat|soundtrack|jingle|chiptune|sound effect|sfx)s?\b/i },
    { id: 'files', what: 'work with files on your other replicant matrix', words: /\b(on|from|in) (my|the) (pc|computer|desktop|laptop)\b|\b(move|copy|rename|zip|unzip|tidy|organi[sz]e)\b[^.?!]{0,30}\b(files?|folders?|downloads)\b/i },
    { id: 'programs', what: 'run programs and scripts', words: /\b(run|execute|launch|install|build)\b[^.?!]{0,30}\b(script|program|command|app|npm|python|game|project)s?\b/i },
    { id: 'office', what: 'make or convert documents', words: /\b(convert|export)\b|\b(make|create|save)\b[^.?!]{0,30}\b(pdf|docx?|word doc\w*|spreadsheet|xlsx|excel|powerpoint|slides?|presentation)s?\b/i },
    { id: 'security', what: 'check your other replicant matrix for viruses and threats', words: /\b(scan|check)\b[^.?!]{0,30}\b(pc|computer|laptop)\b[^.?!]{0,30}\b(virus|viruses|malware|threats?)\b|\b(scan|check) (my|the) (pc|computer|laptop)\b|\b(defender|antivirus) scan\b/i }
  ];

  function bigJob(text) {
    const t = String(text || '');
    const hit = BIG_JOBS.find((j) => j.words.test(t));
    return hit ? { id: hit.id, what: hit.what } : null;
  }

  // Who answers this message.
  //  mode: 'auto' (a networked Bob when one is reachable, else the phone brain if it's on), 'net', 'phone'.
  //  bobs: [{ name, base, up, signedIn, can: { pictures, video, music, hands } }], preferred first.
  function pickAnswerer({ mode = 'auto', phoneOn = false, phoneReady = false, bobs = [], job = null } = {}) {
    const live = bobs.filter((b) => b.up && b.signedIn);
    const able = job ? live.filter((b) => canDo(b, job.id)) : live;
    if (mode === 'phone') {
      if (!phoneOn) return { kind: 'none', why: 'phone-off' };
      if (!phoneReady) return { kind: 'none', why: 'phone-missing' };
      return { kind: 'phone', offer: job ? able[0] || null : null };
    }
    if (live.length && (mode === 'net' || mode === 'auto')) {
      // Send straight to the networked Bob; if this job needs one that can do it, pick that one.
      return { kind: 'net', bob: able[0] || live[0], cant: job && !able.length ? job : null };
    }
    if (mode === 'net') return { kind: 'none', why: bobs.length ? 'net-down' : 'no-bobs' };
    if (phoneOn && phoneReady) return { kind: 'phone', offer: null, noBigBob: Boolean(job) };
    if (phoneOn) return { kind: 'none', why: 'phone-missing' };
    return { kind: 'none', why: bobs.length ? 'net-down' : 'nobody' };
  }

  // What a networked Bob can do, from his /api/capabilities answer. Unknown counts as yes:
  // he says so himself if he can't.
  function canDo(bob, id) {
    const c = bob.can || {};
    if (id === 'pictures') return c.pictures !== false;
    if (id === 'video') return c.video !== false;
    if (id === 'music') return c.music !== false || c.sfx === true;
    return true;
  }

  // The phone brain's instructions: Bob's shared persona, what the phone can't do and his memory file. They stay the
  // same from reply to reply, so the phone brain reads them once; the time goes with each message instead (phone.js).
  // (`now` and `recap` are still accepted, for a brain that can't keep the chat.)
  function phoneSystem({ persona, user, cat, now, memory = '', recap = [], bigBob = '' }) {
    const who = (user || '').trim() || 'the user';
    const parts = [
      String(persona || '').replace('{{ABOUT}}', ''),
      `Right now you're running on ${who}'s phone with a small brain, so keep replies short. On the phone you can chat, remember things and help think things through. You can't make pictures, video, music or sound, touch files, run programs or convert documents here. When ${who} asks for one of those, say so in one line${bigBob ? ` and that ${bigBob} on their network can do it: the app shows a button to send it there` : ' and that a bigger Bob on their network could do it'}. Never pretend you made something.`,
    ];
    if (now) parts.push(`Current date and time for ${who}: ${now}.`);
    if (memory.trim()) parts.push(`Things you remember about ${who} (from your memory file):\n${memory.trim().slice(0, 3000)}`);
    const r = recap.slice(-6).map((m) => `${m.who === 'you' ? who : 'Bob'}: ${String(m.text).replace(/\s+/g, ' ').slice(0, 400)}`);
    if (r.length) parts.push(`Earlier in this chat:\n${r.join('\n')}`);
    return parts.join('\n\n').replaceAll('{{USER}}', who).replaceAll('{{CAT}}', cat || 'Patches');
  }

  // A small, safe Markdown renderer for replies: escapes everything first, then adds code, bold, italics,
  // lists and links (links open in the phone's browser). No raw HTML from a model ever reaches the page.
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function inline(s) {
    return s
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,500})\)/g, (_, t, u) => `<a href="#" data-link="${u}">${t}</a>`)
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]{3,500})/g, (_, pre, u) => `${pre}<a href="#" data-link="${u}">${u}</a>`);
  }
  // Formulas (math-core.js) are drawn while Show maths as formulas is on: each one is held aside as a placeholder
  // so the escaping and the bold and italics can't touch it, then put back.
  function markdown(text, opts = {}) {
    const out = [];
    const math = 'math' in opts ? opts.math : globalThis.BobMath?.renderer?.() || null;
    const keep = [];
    const restore = (s) => s.replace(/\u0001(\d+)\u0002/g, (m, i) => keep[Number(i)] ?? '');
    const parts = String(text || '').split(/```/);
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        const body = part.replace(/^[\w+-]*\n/, '');
        out.push(`<pre><button class="copy" data-copy>Copy</button><code>${esc(body.replace(/\n$/, ''))}</code></pre>`);
        return;
      }
      const held = math && globalThis.BobMath ? globalThis.BobMath.find(part).map((p) => (p.tex == null ? p.text : `\u0001${keep.push(math(p.tex, p.display)) - 1}\u0002`)).join('') : part;
      const lines = esc(held).split('\n');
      let list = null;
      for (const line of lines) {
        const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
        if (li) { if (!list) { list = []; } list.push(`<li>${inline(li[1])}</li>`); continue; }
        if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
        if (/^\s*\u0001\d+\u0002\s*$/.test(line) && /^<div/.test(restore(line.trim()))) { out.push(line.trim()); continue; } // a formula on its own line
        const h = line.match(/^#{1,4}\s+(.*)$/);
        if (h) out.push(`<p><strong>${inline(h[1])}</strong></p>`);
        else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
      }
      if (list) out.push(`<ul>${list.join('')}</ul>`);
    });
    return restore(out.join(''));
  }

  // Short title for a chat from its first message.
  function chatTitle(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > 42 ? `${t.slice(0, 40).trim()}…` : t || 'New chat';
  }

  // "2.84 GB"
  function size(bytes) {
    const gb = bytes / 1e9;
    return gb >= 1 ? `${gb.toFixed(gb >= 10 ? 0 : 2).replace(/\.?0+$/, '')} GB` : `${Math.round(bytes / 1e6)} MB`;
  }

  // Can this phone hold the brain? Leaves room for Android and other apps.
  function fits(model, ramTotalMB) {
    const needMB = model.file.bytes / 1048576 + 900; // the model, plus about 0.9 GB for its working memory
    if (!ramTotalMB) return { ok: true, tight: false };
    return { ok: ramTotalMB - needMB >= 2500, tight: ramTotalMB - needMB < 4000 };
  }

  // Back up and move: this phone's own things as one file. Never a passcode or a sign-in (those stay with Android).
  const PHONE_BACKUP_SETTINGS = ['mode', 'phoneModel', 'freeWhenIdle', 'idleMinutes', 'readAloud', 'userName', 'theme', 'effort', 'resume'];
  function phoneBackup({ settings = {}, chats = [], memory = '', bobs = [], made = '' } = {}) {
    const s = {};
    for (const k of PHONE_BACKUP_SETTINGS) if (k in settings) s[k] = settings[k];
    return { kind: 'bob-phone-backup', format: 1, made, settings: s, chats: chats.slice(0, 200), memory: String(memory || ''), bobs: bobs.map((b) => ({ name: String(b.name || ''), address: String(b.address || ''), base: String(b.base || '') })) };
  }
  // Puts a phone backup into what's here: chats by id (the backup's copy wins), memory lines not here yet, Bobs not in the
  // list yet (checked like any typed address), settings from the backup. The phone brain stays off: it downloads again.
  function phoneRestore(here = {}, text = '') {
    let b;
    try { b = JSON.parse(String(text)); } catch { return { error: "That file isn't a phone backup (it isn't readable)." }; }
    if (b?.kind === 'bob-backup') return { error: "That's a backup of Bob on a computer. Restore it there, in Settings, This replicant matrix, Back up and move." };
    if (b?.kind !== 'bob-phone-backup') return { error: "That file isn't one of Bob's phone backups." };
    if (Number(b.format) > 1) return { error: 'That backup was made by a newer Bob. Update this one first.' };
    const settings = {};
    for (const k of PHONE_BACKUP_SETTINGS) if (b.settings && k in b.settings && typeof b.settings[k] !== 'object') settings[k] = b.settings[k];
    settings.phoneOn = false;
    const ok = (c) => c && typeof c.id === 'string' && Array.isArray(c.msgs);
    const theirs = [].concat(b.chats || []).filter(ok).map((c) => ({ id: c.id.slice(0, 40), title: String(c.title || 'Chat').slice(0, 120), at: Number(c.at) || 0, msgs: c.msgs.filter((m) => m && typeof m === 'object').map((m) => ({ who: m.who === 'you' ? 'you' : 'bob', text: String(m.text || ''), ...(m.by ? { by: String(m.by).slice(0, 60) } : {}) })) }));
    const ids = new Set(theirs.map((c) => c.id));
    const chats = [...theirs, ...[].concat(here.chats || []).filter((c) => !ids.has(c.id))].sort((x, y) => y.at - x.at).slice(0, 200);
    const added = theirs.length;
    const have = String(here.memory || '');
    const lines = have.split('\n').map((l) => l.trim());
    const extra = String(b.memory || '').split('\n').filter((l) => l.trim() && !lines.includes(l.trim()));
    const memory = [have.trimEnd(), ...extra].filter(Boolean).join('\n');
    const bobs = [...[].concat(here.bobs || [])];
    let newBobs = 0;
    for (const x of [].concat(b.bobs || [])) {
      const base = netAddress(x?.address || x?.base || '');
      if (!base || bobs.some((y) => y.base === base)) continue;
      bobs.push({ name: String(x.name || 'Bob').slice(0, 60), address: String(x.address || base), base });
      newBobs++;
    }
    return { settings, chats, memory, bobs, added, newBobs };
  }

  globalThis.BobLogic = { netAddress, bigJob, BIG_JOBS, pickAnswerer, canDo, phoneSystem, markdown, esc, chatTitle, size, fits, phoneBackup, phoneRestore };
})();
