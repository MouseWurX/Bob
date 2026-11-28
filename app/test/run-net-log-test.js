// Nov 23 2026 (the owner: "How do we know that bob isnt sending anything out?"). Where Bob connected (src/net-log.js):
// every connection Bob's own program opens elsewhere is written down with what it is for, this replicant matrix's own
// connections aren't, repeats are counted, the file stays small, and Settings says what can send data out right now.
// Uses fake net/tls modules and a throwaway folder: nothing connects anywhere.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(app, f)).href);
const { NetLog, installNetLog, whatIs, sendingNow, target, NET_LOG, NET_LOG_MAX } = await imp('src/net-log.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'net log '));

{
  check('each known site is named for the service it belongs to', whatIs('api.telegram.org') === 'telegram' && whatIs('gateway.discord.gg') === 'discord' && whatIs('html.duckduckgo.com') === 'web-search' && whatIs('abc123-8000.proxy.runpod.net') === 'rent-machine' && whatIs('openrouter.ai') === 'rent-answer' && whatIs('cdn-lfs.hf.co') === 'Model downloads (Hugging Face)' && whatIs('objects.githubusercontent.com') === 'Updates and downloads (GitHub)' && whatIs('100.101.1.2') === 'Bob-Net (your own Bobs)');
  check('your own mail server is "email"; a site on no list is left unnamed', whatIs('imap.mail.example', { moreTools: { emailHost: 'imap.mail.example' } }) === 'email' && whatIs('tracker.example') === '' && whatIs('notgithub.com') === '');
  check('where a connect call goes: options, port and host, a socket being upgraded, a pipe', target([{ host: 'a.example', port: 443 }]).host === 'a.example' && target([443, 'b.example']).host === 'b.example' && target([{ socket: {} }]) === null && target(['\\\\.\\pipe\\x']) === null);
}

{
  let t = 1_000_000;
  const log = new NetLog({ dir: tmp, now: () => t });
  const calls = [];
  const fakeNet = { connect: (...a) => { calls.push(['net', a]); return 'sock'; }, createConnection: (...a) => { calls.push(['net2', a]); return 'sock2'; } };
  const fakeTls = { connect: (...a) => { calls.push(['tls', a]); return 'tsock'; } };
  installNetLog(log, { net: fakeNet, tls: fakeTls });
  installNetLog(log, { net: fakeNet, tls: fakeTls }); // twice: still one log line per connection
  const s = fakeTls.connect({ host: 'api.telegram.org', port: 443 });
  fakeNet.connect({ host: '127.0.0.1', port: 8080 }); fakeNet.createConnection(11434, 'localhost');
  fakeTls.connect({ host: 'api.telegram.org', port: 443 }); t += 1000;
  fakeNet.createConnection({ host: 'tracker.example', port: 80 });
  check('the connection still happens, exactly as asked', s === 'tsock' && calls.length === 5 && calls[0][1][0].host === 'api.telegram.org');
  const v = log.view();
  check('connections elsewhere are written down; this replicant matrix\'s own aren\'t', v.recent.length === 2 && !v.recent.some((e) => /127\.0\.0\.1|localhost/.test(e.host)));
  check('repeats to the same site within a minute are one line with a count', v.recent.find((e) => e.host === 'api.telegram.org')?.count === 2);
  check('a site on no list is marked so it stands out', v.recent.find((e) => e.host === 'tracker.example')?.unlisted === true && v.recent.find((e) => e.host === 'api.telegram.org')?.label === 'Bob on Telegram');
  const lines = fs.readFileSync(path.join(tmp, NET_LOG), 'utf8').replace(/\r\n/g, '\n').trim().split('\n').map((l) => JSON.parse(l));
  check('the file has one line per new connection: time, site, port and what for, never what was sent', lines.length === 2 && lines.every((l) => Object.keys(l).join() === 'at,host,port,what') && lines[1].what === 'unlisted');
  check('the view says programs Bob starts aren\'t in this list', /separate/.test(v.childNote));
  fs.writeFileSync(path.join(tmp, NET_LOG), 'x'.repeat(NET_LOG_MAX + 10));
  t += SAME();
  log.add('example.org', 443);
  check('the file stays small: past about 1 MB the older half moves aside', fs.existsSync(path.join(tmp, NET_LOG + '.1')) && fs.statSync(path.join(tmp, NET_LOG)).size < 200);
  const broken = new NetLog({ dir: path.join(tmp, 'no', 'such', 'folder') });
  check('a log that can\'t be written never stops a connection', broken.add('x.example', 443)?.host === 'x.example');
}
function SAME() { return 61000; }

{
  check('with everything off, nothing can send your data out', sendingNow({}).length === 0);
  const now = sendingNow({ telegram: { enabled: true }, webSearch: true, rentals: { enabled: { vast: true } }, moreTools: { email: true } }, { agents: 1 }).map((s) => s.id);
  check('each switch that is on is listed as able to send data out', ['telegram', 'web-search', 'rent-answer', 'email', 'coding-agents'].every((id) => now.includes(id)) && now.length === 5);
}

{
  const server = fs.readFileSync(path.join(app, 'src/server.js'), 'utf8').replace(/\r\n/g, '\n');
  check('Bob puts the log in place when he starts, and Settings can read it on this replicant matrix only', /installNetLog\(new NetLog\(/.test(server) && /p === '\/api\/net-log'\) return isLocal \?/.test(server));
  check('Settings shows it under Online services', fs.readFileSync(path.join(app, 'public/cellar.js'), 'utf8').includes("mountNetLog(dlg.querySelector('.net-log-box'))") && fs.readFileSync(path.join(app, 'public/cellar-pages.js'), 'utf8').includes('net-log-box'));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
