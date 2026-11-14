// 📧 Sending one short email to yourself: the passcode lock's reset code (src/lock-reset.js). Only ever to the
// account set up in Settings, Email account, from that same account, with its app password (the one Bob reads
// mail with; kept locked, secret-box.js). Bob can't send anything else, to anyone else: there is no tool for it.
//
// Pure Node (node:tls, node:net), no add-ons. Port 465: TLS from the start. Port 587: plain first, then STARTTLS
// before anything is sent (refused if the server won't switch). The certificate must check out. Tests pass a fake
// `connect` / `upgrade`.
import tls from 'node:tls';
import net from 'node:net';

// The sending server for a reading (IMAP) server, for the big mail services; else imap. -> smtp., port 465.
const KNOWN = [
  [/(^|\.)gmail\.com$|googlemail\.com$/, 'smtp.gmail.com', 465],
  [/outlook|office365|hotmail|live\.com$/, 'smtp-mail.outlook.com', 587],
  [/(^|\.)me\.com$|icloud\.com$/, 'smtp.mail.me.com', 587],
  [/yahoo\./, 'smtp.mail.yahoo.com', 465],
  [/fastmail\./, 'smtp.fastmail.com', 465],
  [/(^|\.)aol\.com$/, 'smtp.aol.com', 465],
  [/zoho\./, 'smtp.zoho.com', 465],
  [/gmx\./, 'mail.gmx.com', 465]
];
export function smtpFor(imapHost) {
  const h = String(imapHost || '').toLowerCase().trim();
  if (!h) return { host: '', port: 465 };
  for (const [rx, host, port] of KNOWN) if (rx.test(h)) return { host, port };
  return { host: h.replace(/^imap\d*\./, 'smtp.'), port: 465 };
}

// A header value: no line breaks, ever (they would start a new header).
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').slice(0, 300);
const okAddress = (a) => /^[^\s@<>"',;:()\\[\]]+@[^\s@<>"',;:()\\[\]]+\.[a-z0-9-]{2,}$/i.test(String(a || ''));

// The message, with a dot doubled at the start of any line (SMTP's rule) and only \r\n line ends.
export function message({ from, to, subject, text, date = new Date(), id = Math.random().toString(36).slice(2) }) {
  const body = String(text || '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
  return [`From: Bob <${from}>`, `To: <${to}>`, `Subject: ${oneLine(subject)}`, `Date: ${date.toUTCString()}`,
    `Message-ID: <${id}.bob@localhost>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', body].join('\r\n');
}

// Reads SMTP replies: a code and (for multi-line ones) every line until "250 " instead of "250-".
class Talk {
  constructor(sock, timeoutMs) { this.timeoutMs = timeoutMs; this.use(sock); }
  use(sock) {
    if (this.sock) this.sock.removeAllListeners?.('close');
    this.sock = sock; this.buf = ''; this.wait = null;
    sock.setEncoding?.('utf8');
    sock.on('data', (d) => { this.buf += d; this.check(); });
    sock.on('error', (e) => { this.wait?.reject(e); this.wait = null; });
    sock.on('close', () => { this.wait?.reject(new Error('the mail server hung up')); this.wait = null; });
  }
  check() {
    if (!this.wait) return;
    const lines = this.buf.split('\r\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) {
        const all = lines.slice(0, i + 1);
        this.buf = lines.slice(i + 1).join('\r\n');
        const w = this.wait; this.wait = null; clearTimeout(w.timer);
        w.resolve({ code: Number(lines[i].slice(0, 3)), text: all.join('\n') });
        return;
      }
    }
  }
  reply() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.wait = null; reject(new Error('the mail server took too long')); }, this.timeoutMs);
      this.wait = { resolve, reject, timer };
      this.check();
    });
  }
  async say(line, want) {
    if (line !== null) this.sock.write(line + '\r\n');
    const r = await this.reply();
    if (!want.includes(r.code)) throw new Error(`the mail server said no (${r.text.split('\n').pop().slice(0, 120)})`);
    return r;
  }
}

const tlsConnect = ({ host, port }) => tls.connect({ host, port, servername: host });
const plainConnect = ({ host, port }) => net.connect({ host, port });
const tlsUpgrade = (sock, host) => tls.connect({ socket: sock, servername: host });

// Sends one email. Throws with a plain reason when it can't.
export async function sendMail({ host, port = 465, user, password, to = user, subject, text }, { connect, upgrade = tlsUpgrade, timeoutMs = 20000, now = () => new Date() } = {}) {
  host = String(host || '').trim();
  if (!host || !/^[\w.-]+$/.test(host)) throw new Error('There\'s no sending server for this email account.');
  if (!okAddress(user) || !okAddress(to)) throw new Error('The email account doesn\'t look like an email address.');
  if (!password) throw new Error('The email account has no app password saved.');
  const starttls = Number(port) === 587 || Number(port) === 25;
  const open = connect || (starttls ? plainConnect : tlsConnect);
  const sock = open({ host, port: Number(port) });
  const talk = new Talk(sock, timeoutMs); // listening from the start: the server's hello can come with the connection
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => { try { sock.destroy?.(); } catch {} reject(new Error('the mail server didn\'t answer')); }, timeoutMs);
    sock.once(starttls ? 'connect' : 'secureConnect', () => { clearTimeout(t); resolve(); });
    sock.once('error', (e) => { clearTimeout(t); reject(e); });
  });
  try {
    await talk.say(null, [220]);
    let hello = await talk.say('EHLO bob.localhost', [250]);
    if (starttls) {
      if (!/STARTTLS/i.test(hello.text)) throw new Error('the mail server won\'t switch to a private (TLS) line');
      await talk.say('STARTTLS', [220]);
      const secure = upgrade(sock, host);
      await new Promise((resolve, reject) => { secure.once('secureConnect', resolve); secure.once('error', reject); });
      talk.use(secure);
      hello = await talk.say('EHLO bob.localhost', [250]);
    }
    await talk.say(`AUTH PLAIN ${Buffer.from(`\0${user}\0${password}`, 'utf8').toString('base64')}`, [235]);
    await talk.say(`MAIL FROM:<${user}>`, [250]);
    await talk.say(`RCPT TO:<${to}>`, [250, 251]);
    await talk.say('DATA', [354]);
    await talk.say(message({ from: user, to, subject, text, date: now() }) + '\r\n.', [250]);
    try { talk.sock.write('QUIT\r\n'); } catch {}
    return { sent: true };
  } finally { setTimeout(() => { try { talk.sock.end?.(); } catch {} }, 50); }
}

// "s•••@example.com": enough to recognise your own address, not enough to read it off a lock screen.
export const maskAddress = (a) => { const [u, d] = String(a || '').split('@'); return d ? `${u.slice(0, 1)}•••@${d}` : ''; };
