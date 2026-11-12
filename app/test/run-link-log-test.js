// The link log (src/link-log.js, Brain Engine patch 0008): the engine's [link] and [scut] lines are kept in a file in
// Bob's data folder and the short ones go to the logbook; nothing else does. Nothing here reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LinkLog, linkLine, isSetup, isSummary, stamp, LINK_LOG } from '../src/link-log.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-link-log-'));
const H = [10, 1, 2, 3].join('.'); // a home-network address, built so no real one sits in the file

const CONNECT = `0.05.870.289 I [link] ${H}:50052: connected over SCUT`;
const FALLBACK = `[link] ${H}:50052: connected over TCP (not SCUT: the UDP path didn't answer in 1 second (a firewall, or a router that blocks UDP between devices))`;
const SUMMARY = `0.20.000.001 I [link] ${H}:50052 over SCUT, 10.0 s: 510 messages, 1.21 MiB sent, 1.33 MiB received; 9.1 s spent on this card, 8.9 s of it waiting for 170 answers (52.4 ms each, longest 80.1); the link's round trip is 3.1 ms, so about 6% of that wait is the link and 94% the other card working`;
const BYCMD = '0.20.000.002 I [link]   by command: GET_TENSOR x170 52.4 ms each (longest 80.1), 1.33 MiB; SET_TENSOR x170 0.1 ms each (longest 0.4), 1.20 MiB';
const SCUT = '0.20.000.003 I [scut]   1100 data packets out (3 sent again, 0 after a timeout; 340 repair packets), 1300 packets in (2 rebuilt from repairs, 0 refused: 0 bad seal, 0 replays); on the air 1300.0 KiB out, 1400.0 KiB in; pace 100.0 of 100.0 Mbit/s, slowed 0 times; round trip 3.1 ms (quietest 2.2)';
const OLD = '[scut] SCUT on: udp ' + H + ':50052, cap 100 Mbit/s, round trip 3.0 ms, sealed (signed and scrambled)';

{
  ok(linkLine(CONNECT)?.kind === 'link' && linkLine(CONNECT).text === `${H}:50052: connected over SCUT`, 'a [link] line is found behind the engine\'s own time stamp');
  ok(linkLine(SCUT)?.kind === 'scut' && linkLine('\x1b[32m[scut] hello\x1b[0m')?.text === 'hello', 'a [scut] line too, colours taken off');
  ok(linkLine('srv  load_model: loading model') === null && linkLine('[link]   ') === null && linkLine('') === null, 'other engine output is not link log');
  ok(isSetup(linkLine(CONNECT).text) && isSetup(linkLine(FALLBACK).text) && isSetup(linkLine(OLD).text) && !isSetup(linkLine(SUMMARY).text), 'which link, and why, counts as setting up');
  ok(isSummary(linkLine(SUMMARY).text) && !isSummary(linkLine(BYCMD).text) && !isSummary(linkLine(CONNECT).text), 'the summary line is told from its detail lines');
  ok(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(stamp(0)), 'times are written as local date and time');
}
{
  const said = []; let t = 1e12;
  const cfg = { dataDir: path.join(tmp, 'a') }; fs.mkdirSync(cfg.dataDir);
  const l = new LinkLog(cfg, { who: 'borrowed card', log: (k, m) => said.push([k, m]), now: () => t });
  l.feed(CONNECT.slice(0, 20)); l.feed(CONNECT.slice(20) + '\r\nsrv  something else\n' + SUMMARY + '\n' + BYCMD + '\n' + SCUT + '\n');
  const file = path.join(cfg.dataDir, LINK_LOG);
  const kept = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim().split('\n');
  ok(kept.length === 4 && kept.every((x) => / borrowed card \[(link|scut)\] /.test(x)) && !kept.join('\n').includes('something else'), 'every link line is kept in bob-net-link.log, split chunks and all, and nothing else');
  ok(said.length === 2 && said.every(([k]) => k === 'bob-net') && said[0][1].includes('connected over SCUT') && said[1][1].includes('waiting for 170 answers'), 'the logbook gets which link it is and one summary');
  t += 10000; l.feed(SUMMARY + '\n' + CONNECT + '\n');
  ok(said.length === 2, 'a second summary inside a minute stays in the file only, and the same set-up line isn\'t said twice');
  t += 60000; l.feed(SUMMARY + '\n');
  ok(said.length === 3, 'a minute later the next summary is said');
  l.feed(FALLBACK + '\n');
  ok(said.length === 4 && said[3][1].includes('not SCUT: the UDP path didn\'t answer'), 'a link that stayed off SCUT says why');
  ok(said.every(([, m]) => m.length < 420), 'logbook lines stay short');
}
{
  const cfg = { dataDir: path.join(tmp, 'b') }; fs.mkdirSync(cfg.dataDir);
  const l = new LinkLog(cfg, { who: 'lent card', max: 300 });
  for (let i = 0; i < 8; i++) l.feed(SCUT + '\n');
  const file = path.join(cfg.dataDir, LINK_LOG);
  ok(fs.existsSync(`${file}.1`) && fs.statSync(file).size < 1000, 'a full log moves aside to bob-net-link.log.1 and a new one starts');
  const none = new LinkLog({}, { log: () => { throw new Error('x'); } });
  let threw = false; try { none.feed(CONNECT + '\n'); } catch { threw = true; }
  ok(!threw && none.lines === 1, 'no data folder, or a logbook that throws: the engine\'s output is still read without a hitch');
}
{
  const lc = read('src', 'llamacpp.js'), sc = read('src', 'share-card.js');
  ok(/new LinkLog\(this\.cfg, \{ who: 'borrowed card'/.test(lc) && /link\?\.feed\(d\)/.test(lc), 'the borrowing Bob reads his engine\'s link lines');
  ok(/new LinkLog\(this\.cfg, \{ who: 'lent card'/.test(sc) && /link\.feed\(d\)/.test(sc), 'the lending Bob reads his card server\'s link lines');
  ok(/if \(over\) return;\s+if \(signal\?\.aborted\)/.test(lc) && /if \(over\) return;\s+saveFail\('took too long to load'\)/.test(lc), 'the "still loading over Bob-Net" watch ends when the load is over');
  const brain = read('src', 'brain.js');
  ok(!/bob-net-link/.test(brain), 'the link log never goes into what the brain reads');
  const patch = read('engine', 'patches', '0008-scut-live.patch');
  ok(/\[link\] %s over %s/.test(patch) && /GGML_RPC_STATS/.test(patch) && /not SCUT: /.test(patch), 'the engine patch writes the link lines, with the reason SCUT isn\'t used');
  ok(/T_RXR = 7/.test(patch) && /OF_TUNE = 4/.test(patch) && /GGML_RPC_SCUT_TUNE/.test(patch) && /\[scut\] tuned: /.test(patch), 'the engine patch has SCUT report what arrives and retune itself, and say each change');
  const readme = read('engine', 'README.md'), map = read('engine', 'ENGINE-MAP.md');
  ok(/0008-scut-live\.patch/.test(readme) && /0008-scut-live/.test(map), 'engine README and map list 0008');
  const help = read('public', 'help-content.js'), ui = read('public', 'share-brains.js');
  ok(/Watch the link live/.test(help) && /faq-scut-slow/.test(help) && /<dt>Link log<\/dt>/.test(help), 'Help, an FAQ and the glossary cover the link log');
  ok(/data-share-linkdebug/.test(ui) && /data-link-log-show/.test(ui), 'Settings has the switch and the Link log box, always shown under Bigger Bobs');
}

fs.rmSync(tmp, { recursive: true, force: true });
ok(/if \(linkLive\(this\.cfg\) && !args\.includes\('-lv'\)\) args\.push\('-lv', '4'\)/.test(read('src', 'llamacpp.js')), 'with Watch the link live on, the borrowing engine is told to show its link lines');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
