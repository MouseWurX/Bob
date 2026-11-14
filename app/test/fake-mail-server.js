// A pretend IMAP server for the email tests: folders, messages, flags, and every command it was sent. It answers the
// handful of commands Bob uses (CAPABILITY, LOGIN, LIST, EXAMINE/SELECT, UID SEARCH/FETCH/STORE/MOVE/COPY/EXPUNGE,
// CREATE, APPEND). Nothing here touches the network.
import { EventEmitter } from 'node:events';

// folders: [{ name, uses: ['\\Trash'] }]; mail: { [folder]: [{ uid, raw, flags: [] }] }; caps: 'MOVE UIDPLUS'
export function fakeMailServer({ folders, mail, caps = 'IMAP4rev1 MOVE UIDPLUS' }) {
  const sent = [];
  let next = 1000;
  const box = (n) => (mail[n] ||= []);
  const headOf = (raw) => { const i = raw.search(/\r?\n\r?\n/); return i < 0 ? raw : raw.slice(0, i); };
  const field = (raw, name) => (headOf(raw).replace(/\r?\n[ \t]+/g, ' ').match(new RegExp(`^${name}:\\s*(.*)$`, 'im')) || [])[1] || '';
  const uidsOf = (set, list) => set.split(',').flatMap((p) => { const [a, b] = p.split(':').map(Number); return b ? list.filter((m) => m.uid >= a && m.uid <= b).map((m) => m.uid) : [a]; });
  const lit = (s) => `{${Buffer.byteLength(s, 'utf8')}}\r\n${s}`;
  const connect = async () => {
    const s = new EventEmitter();
    let open = null, writable = false, pending = null;
    const say = (t) => setImmediate(() => s.emit('data', Buffer.from(t, 'utf8')));
    s.write = (data) => {
      const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      if (pending) { const p = pending; pending = null; box(p.folder).push({ uid: ++next, raw: text.replace(/\r\n$/, ''), flags: p.flags }); sent.push(`(literal ${text.length} bytes)`); return say(`${p.tag} OK APPEND done\r\n`); }
      const line = text.trim();
      sent.push(line);
      const [tag, cmd, ...rest] = line.split(' ');
      const arg = rest.join(' ');
      const ok = (extra = '') => say(`${extra}${tag} OK done\r\n`);
      const q = (x) => { const m = x.match(/^"((?:[^"\\]|\\.)*)"/); return m ? m[1].replace(/\\(.)/g, '$1') : x.split(' ')[0]; };
      switch (cmd) {
        case 'CAPABILITY': return ok(`* CAPABILITY ${caps}\r\n`);
        case 'LOGIN': case 'LOGOUT': return ok();
        case 'LIST': return ok(folders.map((f) => `* LIST (${(f.uses || []).join(' ')}) "/" "${f.name.replace(/"/g, '\\"')}"\r\n`).join(''));
        case 'EXAMINE': case 'SELECT': open = q(arg); writable = cmd === 'SELECT'; return ok();
        case 'CREATE': { const n = q(arg); if (folders.some((f) => f.name === n)) return say(`${tag} NO [ALREADYEXISTS] exists\r\n`); folders.push({ name: n, uses: [] }); return ok(); }
        case 'APPEND': { const m = arg.match(/^"((?:[^"\\]|\\.)*)" \(([^)]*)\) \{(\d+)\}$/); pending = { tag, folder: m[1], flags: m[2].split(' ') }; return say('+ go ahead\r\n'); }
        case 'EXPUNGE': return ok(); // recorded in sent; Bob must never send it
        case 'UID': {
          const [sub, set, ...more] = rest;
          const list = box(open);
          if (sub === 'SEARCH') {
            const hm = arg.match(/HEADER Message-ID "([^"]*)"/i);
            const hits = hm ? list.filter((m) => field(m.raw, 'Message-ID').trim() === hm[1]) : list;
            return ok(`* SEARCH ${hits.map((m) => m.uid).join(' ')}\r\n`);
          }
          const ids = uidsOf(set, list);
          const msgs = list.filter((m) => ids.includes(m.uid));
          if (sub === 'FETCH') {
            const whole = /BODY\.PEEK\[\]/.test(arg);
            const want = (arg.match(/HEADER\.FIELDS \(([^)]*)\)/) || [])[1]?.split(' ') || [];
            const out = msgs.map((m, i) => {
              const files = [...m.raw.matchAll(/name="([^"]*)"/g)].map((x) => `("name" "${x[1].replace(/"/g, '\\"')}")`).join(' ');
              const bs = /BODYSTRUCTURE/.test(arg) ? ` BODYSTRUCTURE ("text" "plain" ${files || 'NIL'})` : '';
              const body = whole ? m.raw : want.map((k) => { const v = field(m.raw, k); return v ? `${k}: ${v}\r\n` : ''; }).join('') + '\r\n';
              return `* ${i + 1} FETCH (UID ${m.uid} FLAGS (${m.flags.join(' ')})${bs} BODY[] ${lit(body)})\r\n`;
            }).join('');
            return ok(out);
          }
          if (!writable) return say(`${tag} NO read-only\r\n`);
          if (sub === 'STORE') { const [mode, ...fl] = more; const f = fl.join(' ').replace(/[()]/g, '').split(' '); for (const m of msgs) m.flags = mode.startsWith('+') ? [...new Set([...m.flags, ...f])] : m.flags.filter((x) => !f.includes(x)); return ok(); }
          if (sub === 'MOVE' || sub === 'COPY') { const to = q(more.join(' ')); for (const m of msgs) box(to).push({ ...m, uid: ++next, flags: [...m.flags] }); if (sub === 'MOVE') mail[open] = list.filter((m) => !ids.includes(m.uid)); return ok(); }
          if (sub === 'EXPUNGE') { mail[open] = list.filter((m) => !(ids.includes(m.uid) && m.flags.includes('\\Deleted'))); return ok(); }
          return say(`${tag} BAD what\r\n`);
        }
        default: return say(`${tag} BAD unknown\r\n`);
      }
    };
    s.end = () => {};
    setImmediate(() => s.emit('data', Buffer.from('* OK fake ready\r\n')));
    return s;
  };
  return { connect, sent, mail, folders };
}
