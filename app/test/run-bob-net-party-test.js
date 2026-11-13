// 1.5.123 Bob-Net party (Now running) and Pass my Bob-Net along (src/bob-net-party.js): the party reading, and three
// Bobs on a pretend Tailscale where the desk introduces the handheld to the phone and they pair with no card.
import { hueFor } from '../src/net-overlay.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { partyView, Introductions } from '../src/bob-net-party.js';
import { Pairing, PAIR } from '../src/bob-net-pair.js';
import { Lenders, cleanSharePatch, shareView, helloFor, cleanAbilities, saveShare } from '../src/share-brains.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? `: ${extra}` : ''}`); } };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-party-'));
const wait = async (f, ms = 3000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 5)); return f(); };

// ---------- settings and hello ----------
const base = { remote: { enabled: true, passcode: '12345678' }, share: {} };
check('Pass my Bob-Net along starts off', shareView(base).passAlong === false);
const on = cleanSharePatch(base, { passAlong: true }).share;
check('…and can be switched on, alone', on.passAlong === true && on.lend === false && on.borrow.on === false);
check('…and off again', cleanSharePatch({ ...base, share: on }, { passAlong: false }).share.passAlong === false);
const hello = helloFor({ cfg: { share: { passAlong: true } }, queue: [] }, { why: '', quick: { model: 'm', ctx: 8192 }, can: {}, version: '1.5.123', label: () => 'Gemma', name: 'desk' });
check('hello carries the name and the pass-along switch', hello.name === 'desk' && hello.passAlong === true);
const ab = cleanAbilities({ ...hello, name: 'de<sk>' });
check('…and the asker keeps both, cleaned', ab.passAlong === true && ab.hisName === 'desk');

// ---------- Show avatars (the avatars on the Bob-Net list) ----------
{
  const mk = (look) => helloFor({ cfg: { look, share: {} }, queue: [] }, { why: '', quick: null, can: {}, version: '1.5.205', label: () => '', name: 'desk' });
  check('hello carries this Bob\'s look', mk('robot-3').look === 'robot-3' && mk('c:ab1.2').look === 'c:ab1.2');
  check('…and no look when none is picked, or a bad one', !('look' in mk(undefined)) && !('look' in mk('<script>')) && !('look' in mk('x'.repeat(200))));
  check('the asker keeps a real look id only', cleanAbilities({ look: 'f-12' }).look === 'f-12' && !('look' in cleanAbilities({ look: 'robot-3"><img src=x>' })) && !('look' in cleanAbilities({ look: 42 })) && !('look' in cleanAbilities({})));
  const L = new Lenders({ share: { borrow: { on: true, bobs: [{ name: 'Go', address: '100.101.1.2:7777', passcode: '12345678' }, { name: 'Phone', address: '100.101.1.3:7777', passcode: '12345678' }] } } }, { now: () => 5000 });
  let up = true;
  L.call = async (b) => { if (!up) throw new Error('nope'); return { ok: true, status: 200, json: async () => (b.name === 'Go' ? { lend: true, brain: 'Gemma', device: 'computer', look: 'alien-4' } : { lend: true, brain: 'phone brain', device: 'phone' }) }; };
  await L.hello(L.bobs()[0]); await L.hello(L.bobs()[1]);
  check('a hello remembers his look', L.state.get('100.101.1.2:7777').look === 'alien-4' && !L.state.get('100.101.1.3:7777').look);
  up = false;
  await L.hello(L.bobs()[0], { force: true });
  check('…and keeps it while he\'s not reachable', L.state.get('100.101.1.2:7777').ok === false && L.state.get('100.101.1.2:7777').look === 'alien-4');
  const v = partyView({ cfg: { look: 'm-7', share: { borrow: { on: true, bobs: L.bobs() } }, remote: { enabled: true, passcode: '12345678' } }, lenders: L, queue: [] });
  check('the party gives each Bob\'s look, and this Bob\'s own', v.here.look === 'm-7' && v.bobs.find((b) => b.name === 'Go').look === 'alien-4' && v.bobs.find((b) => b.name === 'Phone').look === '');
  check('…and no look for this Bob with none picked', partyView({ cfg: { share: { lend: true } }, lenders: null, queue: [] }).here.look === '');
  const html = read('public/index.html'), lay = read('public/layout.js');
  check('Show avatars is a switch in the Bob-Net section, off to begin with', /id="nowNetAvatars"[^>]*role="switch"[^>]*aria-checked="false"/.test(html) && html.indexOf('id="nowNetAvatars"') > html.indexOf('id="nowNet"') && html.indexOf('id="nowNetAvatars"') < html.indexOf('id="nowNetList"'));
  check('…remembered per window, off unless switched on', /store\.get\('bob-net-avatars', '0'\) === '1'/.test(lay));
  check('…every Bob gets a cube, in his icon colour, named for screen readers (Nov 13)', /drawVoxels\(c, \{ hue: Number\(cv\.dataset\.hue\)/.test(lay) && /aria-label="\$\{esc\(name\)\}'s cube"/.test(lay) && !/drawBob/.test(lay) && /netAvatar\(b\.hue, b\.name, b\.ok === true\)/.test(lay));
  check('…the party gives every Bob a cube colour, a phone too', v.bobs.every((b) => Number.isInteger(b.hue)) && v.bobs.find((b) => b.name === 'Phone').hue === hueFor('Phone'));
  const help = read('public/help-content.js');
  check('…with Help, a glossary line and an FAQ', help.includes("id: 'faq-avatars'") && help.includes('<dt>Show avatars</dt>') && /Show avatars<\/strong>, just under the heading/.test(help) && /every Bob's picture now/.test(help));
}

// ---------- the party reading ----------
{
  const L = new Lenders({ share: { borrow: { on: true, bobs: [{ name: 'Go', address: '100.101.1.2:7777' }, { name: 'Phone', address: '100.101.1.3:7777' }, { name: 'Laptop', address: '100.101.1.4:7777' }] } } }, { now: () => 1000000 });
  L.state.set('100.101.1.2:7777', { ok: true, at: 999000, brain: 'Gemma 4 E2B', device: 'computer', jobs: ['pictures', 'web'], measured: { lastUsed: 990000, tokPerSec: 30 }, passAlong: true });
  L.state.set('100.101.1.3:7777', { ok: false, why: 'gaming', at: 999000, device: 'phone' });
  L.live.set('100.101.1.2:7777', 'thinking');
  const brain = { cfg: { share: { lend: true, borrow: { on: true, bobs: L.bobs() } }, remote: { enabled: true, passcode: '12345678' } }, lenders: L, lending: { for: 'Laptop', since: 5 }, queue: [{ guest: { from: 'Phone', need: 'pictures' }, state: 'working' }, { state: 'waiting' }], awayJobs: new Map([['j1', { address: '100.101.1.4:7777', need: 'music' }]]) };
  const v = partyView(brain, { now: () => 1000000 });
  check('the party is on once Bob-Net is in use', v.on === true && v.here.lend === true && v.here.takeJobs === false && v.here.door === true);
  check('this Bob\'s line: lending to Laptop, a picture for Phone', v.here.lending?.for === 'Laptop' && v.here.guests.length === 1 && v.here.guests[0].from === 'Phone' && v.here.guests[0].need === 'pictures');
  const go = v.bobs.find((b) => b.name === 'Go'), ph = v.bobs.find((b) => b.name === 'Phone'), lap = v.bobs.find((b) => b.name === 'Laptop');
  check('Go is thinking for us, with his jobs, speed and last use', go.thinking === true && go.ok === true && go.brain === 'Gemma 4 E2B' && go.jobs.join() === 'pictures,web' && go.speed === 30 && go.lastUsed === 990000 && go.passAlong === true);
  check('Phone is gaming (not lending)', ph.ok === false && ph.why === 'gaming' && ph.device === 'phone' && ph.thinking === false);
  check('Laptop is making music for us, and not checked yet', lap.doing === 'music' && lap.ok === null);
  check('no Bobs and nothing shared: the section stays away', partyView({ cfg: { share: {} }, lenders: new Lenders({ share: {} }), queue: [], awayJobs: new Map() }).on === false);
  check('Lend on alone shows it (someone may be thinking here)', partyView({ cfg: { share: { lend: true }, remote: { enabled: true, passcode: '12345678' } }, lenders: new Lenders({ share: {} }), queue: [], awayJobs: new Map() }).on === true);
}

// ---------- three Bobs on a pretend Tailscale ----------
function bob(name, ip, { door = true, passAlong = true, device = 'computer', old = false } = {}) {
  const file = path.join(tmp, `${name}.json`);
  fs.writeFileSync(file, '{}');
  const cfg = { port: 7777, configFile: file, remote: door ? { enabled: true, passcode: `${name}-code-1` } : { enabled: false }, share: { passAlong } };
  const events = [], logs = [];
  const b = { name, ip, cfg, events, logs, device, old, token: Buffer.from(name).toString('hex') };
  b.lenders = new Lenders(cfg);
  b.pairing = new Pairing(cfg, { broadcast: (e) => events.push(e), log: (k, t) => logs.push(t), version: '1.5.123', ownAddresses: () => [`${ip}:7777`], pollMs: 5, peers: async () => null, vouched: (a, t) => b.intro.vouched(a, t) });
  b.intro = new Introductions(cfg, { lenders: b.lenders, pairing: b.pairing, log: (k, t) => logs.push(t), name: () => name });
  return b;
}
function net(bobs) {
  return (from) => async (url, opt = {}) => {
    const u = new URL(url);
    const to = bobs.find((x) => x.ip === u.hostname);
    const reply = (status, j, headers = {}) => ({ ok: status < 300, status, json: async () => j, headers: { get: (h) => headers[h] } });
    if (!to) throw new Error('no route');
    if (!to.cfg.remote.enabled) return reply(403, { error: 'bad host' });
    const raw = opt.body ? String(opt.body) : '';
    if (u.pathname === '/api/pair/hello') return reply(200, to.pairing.hello());
    if (u.pathname.startsWith('/api/pair/')) {
      const b = JSON.parse(raw || '{}');
      if (u.pathname === '/api/pair/ask') { const r = to.pairing.ask(b, '::ffff:' + from.ip); return reply(r.code, r.error ? { error: r.error } : { id: r.id, ...(r.pub ? { pub: r.pub } : {}) }); }
      if (u.pathname === '/api/pair/status') return reply(200, to.pairing.status(b.id, from.ip, b.pub));
      if (u.pathname === '/api/pair/finish') return reply(200, to.pairing.finish(b, from.ip));
    }
    if (u.pathname === '/login') {
      const code = new URLSearchParams(raw).get('code');
      return code === to.cfg.remote.passcode ? reply(303, {}, { 'set-cookie': `bob_auth=${to.token}; HttpOnly` }) : reply(401, {});
    }
    if (opt.headers?.cookie !== `bob_auth=${to.token}`) return reply(401, {});
    if (u.pathname === '/api/lend/hello') return reply(200, { protocol: 1, lend: true, brain: 'Gemma', device: to.device, name: to.name, passAlong: to.cfg.share.passAlong === true });
    if (u.pathname === '/api/bob-net/introduce') {
      if (to.old) return reply(404, { error: 'not found' });
      const r = to.intro.receive(JSON.parse(raw || '{}'), from.ip);
      return reply(r.code, r);
    }
    return reply(404, {});
  };
}
const pairUp = (a, b) => { // a and b already paired by hand: each has the other's passcode
  for (const [x, y] of [[a, b], [b, a]]) { const out = cleanSharePatch(x.cfg, { addBob: { name: y.name, address: `${y.ip}:7777`, passcode: y.cfg.remote.passcode } }); saveShare(x.cfg, out.share); }
};
// Lists by address (a Bob names himself after the computer, so names in a test are whatever this machine is called).
let roster = [];
const nameOf = (addr) => roster.find((x) => `${x.ip}:7777` === addr)?.name || addr;
const listOf = (x) => (x.cfg.share.borrow?.bobs || []).map((b) => nameOf(b.address)).sort().join(',');
const codeFor = (x, who) => (x.cfg.share.borrow?.bobs || []).find((b) => b.address === `${who.ip}:7777`)?.passcode;

{
  // The desk is paired with the handheld and the phone; the handheld and the phone don't know each other.
  const desk = bob('desk', '100.101.2.23'), go = bob('go', '100.101.1.2'), phone = bob('phone', '100.101.1.3', { device: 'phone' });
  const all = [desk, go, phone]; roster = all;
  const n = net(all);
  for (const x of all) { x.pairing.fetch = n(x); x.lenders.fetch = n(x); }
  pairUp(desk, go); pairUp(desk, phone);
  check('to start: the handheld and the phone are strangers', listOf(go) === 'desk' && listOf(phone) === 'desk' && listOf(desk) === 'go,phone');
  await desk.intro.run();
  const done = desk.intro.view()[0];
  check('the desk introduced them (the computer asks, the phone answers)', done?.state === 'introduced' && done.a === 'go' && done.b === 'phone', JSON.stringify(done));
  await wait(() => listOf(go) === 'desk,phone' && listOf(phone) === 'desk,go');
  check('the handheld and the phone are on each other\'s list', listOf(go) === 'desk,phone' && listOf(phone) === 'desk,go', `${listOf(go)} / ${listOf(phone)}`);
  check('…with each other\'s passcodes', codeFor(go, phone) === 'phone-code-1' && codeFor(phone, go) === 'go-code-1');
  check('no card was shown on either', !go.events.some((e) => e.type === 'pair-ask') && !phone.events.some((e) => e.type === 'pair-ask'));
  check('both say who introduced them', phone.events.find((e) => e.type === 'pair-done')?.by === 'desk' && go.events.find((e) => e.type === 'pair-done')?.by === 'desk' && go.events.find((e) => e.type === 'pair-done')?.asker === true);
  check('the desk\'s list and switches are untouched; nothing switched on over there', listOf(desk) === 'go,phone' && !go.cfg.share.lend && !phone.cfg.share.lend && !go.cfg.share.takeJobs && !go.cfg.share.borrow.on && !phone.cfg.share.borrow.on);
  check('the token was used once', phone.intro.expected.size === 0);
  // Again: already on each other's lists, so nothing to do, and that's remembered for a day.
  desk.intro.done.clear();
  await desk.intro.run();
  check('a second look says they already know each other', desk.intro.view()[0]?.state === 'already');
  const at = desk.intro.done.values().next().value.at;
  await desk.intro.run();
  check('…and isn\'t repeated right away', desk.intro.done.values().next().value.at === at);
}
{
  // The phone has the switch off: it is left alone, and the panel says so.
  const desk = bob('desk2', '100.101.2.23'), go = bob('go2', '100.101.1.2'), phone = bob('phone2', '100.101.1.3', { device: 'phone', passAlong: false });
  roster = [desk, go, phone];
  const n = net([desk, go, phone]);
  for (const x of [desk, go, phone]) { x.pairing.fetch = n(x); x.lenders.fetch = n(x); }
  pairUp(desk, go); pairUp(desk, phone);
  await desk.intro.run();
  const d = desk.intro.view()[0];
  check('a Bob with Pass my Bob-Net along off is left alone', d?.state === 'off' && d.who === 'phone2' && listOf(go) === 'desk2' && listOf(phone) === 'desk2', JSON.stringify(d));
  check('…and nobody was told to ask', go.intro.expected.size === 0 && !go.pairing.outgoing.size);
}
{
  // A phone app that doesn't know the route yet (404): "too old", and the other side isn't bothered.
  const desk = bob('desk3', '100.101.2.23'), go = bob('go3', '100.101.1.2'), phone = bob('phone3', '100.101.1.3', { device: 'phone', old: true });
  const n = net([desk, go, phone]);
  for (const x of [desk, go, phone]) { x.pairing.fetch = n(x); x.lenders.fetch = n(x); }
  pairUp(desk, go); pairUp(desk, phone);
  await desk.intro.run();
  check('an older Bob can\'t be introduced yet', desk.intro.view()[0]?.state === 'old' && desk.intro.view()[0].who === 'phone3' && !go.pairing.outgoing.size);
  // The desk itself has the switch off: it introduces nobody.
  desk.cfg.share.passAlong = false; desk.intro.done.clear();
  await desk.intro.run();
  check('with the switch off here, no introductions at all', desk.intro.view().length === 0);
}
{
  // Strangers: an ask with a token nobody here handed out is refused outright, and no card appears.
  const b = bob('lone', '100.101.9.9');
  const r = b.pairing.ask({ pair: PAIR, name: 'x', address: '100.101.9.8:7777', code: '1234', token: 'f'.repeat(32) }, '::ffff:100.101.9.8');
  check('a made-up token gets no card and no yes', r.code === 403 && b.pairing.asks.size === 0 && !b.events.length);
  check('a plain ask (no token) still shows the card', b.pairing.ask({ pair: PAIR, name: 'x', address: '100.101.9.8:7777', code: '1234' }, '::ffff:100.101.9.8').code === 200 && b.events.some((e) => e.type === 'pair-ask'));
  // receive() checks: the door, the token shape, the address, and "that's you".
  check('an introduction needs the switch and the door', b.intro.receive({ pair: PAIR, token: 'a'.repeat(32), role: 'expect', bob: { address: '100.101.9.7' } }, '100.101.9.8').code === 200);
  b.cfg.remote.enabled = false;
  check('…door shut: off', b.intro.receive({ pair: PAIR, token: 'a'.repeat(32), role: 'expect', bob: { address: '100.101.9.7' } }, '100.101.9.8').busy === 'off');
  b.cfg.remote.enabled = true;
  check('a bad token or a non-Tailscale address is refused', b.intro.receive({ pair: PAIR, token: 'zz', role: 'expect', bob: { address: '100.101.9.7' } }, '100.101.9.8').code === 400 && b.intro.receive({ pair: PAIR, token: 'a'.repeat(32), role: 'expect', bob: { address: ['10', '0', '0', '4'].join('.') } }, '100.101.9.8').code === 400);
  check('"that\'s you" is refused', /you/.test(b.intro.receive({ pair: PAIR, token: 'a'.repeat(32), role: 'expect', bob: { address: '100.101.9.8' } }, '100.101.9.8').error));
  check('a token is good once', b.intro.vouched('100.101.9.7:7777', 'a'.repeat(32)) === '100.101.9.8' && b.intro.vouched('100.101.9.7:7777', 'a'.repeat(32)) === '');
}

// ---------- the page, Help and the server wiring ----------
{
  const html = read('public/index.html'), layout = read('public/layout.js'), app = publicText('app.js'), share = read('public/share-brains.js'), help = read('public/help-content.js'), server = read('src/server.js'), css = read('public/style.css'), privacy = read('docs/legal/PRIVACY.md');
  check('Now running has a Bob-Net section, hidden to start with', /<section id="nowNet" data-sec="net" hidden>/.test(html) && /<ul id="nowNetList" class="tlist net-list"><\/ul>/.test(html));
  check('the pane polls the party while open, and hides the section when Bob-Net isn\'t in use', /fetch\('\/api\/bob-net\/party'\)/.test(layout) && /sec\.hidden = !v\?\.on;/.test(layout) && /brainSt\?\.session === 'Gaming' \? 30000 : 15000/.test(layout));
  check('a lend, borrow, sent job or pairing refreshes it early', /\['lending', 'borrow', 'away', 'pair-done', 'queue'\]\.includes\(ev\.type\)\) layout\.net\(\);/.test(app) && /net\(\) \{ clearTimeout\(netSoon\); netSoon = setTimeout\(pollNet, 800\); \}/.test(layout));
  check('the dot never stands alone: words for every state', /thinking a reply for me/.test(layout) && /gaming, so not lending/.test(layout) && /aria-hidden="true"/.test(layout.slice(layout.indexOf('const netRow'))) && /\.net-dot\.ok \{ background: var\(--good\); \}/.test(css));
  check('Settings has the switch, off unless turned on', /<strong>Pass my Bob-Net along<\/strong> \$\{tip\(/.test(share) && /data-share-pass \$\{v\.passAlong \? 'checked' : ''\}/.test(share) && /(?:change|ch)\(\{ passAlong: e\.target\.checked \}\)/.test(share));
  check('…and says what came of each introduction', /INTRO\[d\.state\]/.test(share) && /can't be introduced yet: Bob there needs an update/.test(share));
  check('Help: the settings row, two FAQ entries and a glossary line', /set\('Pass my Bob-Net along', 'Off'/.test(help) && /id: 'faq-party'/.test(help) && /id: 'faq-introduce'/.test(help) && /<dt>Introduced<\/dt>/.test(help) && /go\('faq-party'/.test(help));
  check('PRIVACY.md says what an introduction carries', /Pass my Bob-Net along/.test(privacy) && /passcodes still pass only between the two Bobs being paired/.test(privacy));
  check('the server serves the party to this window only, and introductions only through the door', /p === '\/api\/bob-net\/party'\) \{\n\s+if \(!isLocal\) return send\(res, 403/.test(server) && /p === '\/api\/bob-net\/introduce'\) \{\n\s+if \(!isRemote\) return send\(res, 403/.test(server));
  check('a pairing and a settings change set introductions going; once an hour otherwise', /if \(ev\?\.type === 'pair-done'\) try \{ introductions\.soon\(\); \}/.test(server) && /if \(out\.share\.passAlong\) introductions\.soon\(500\);/.test(server) && /setInterval\(\(\) => introductions\.soon\(0\), 3600_000\)\.unref\(\);/.test(server));
  check('the pair-done line names the introducer', /ev\.by \? `\$\{esc\(ev\.by\)\} introduced \$\{esc\(ev\.name\)\}: paired/.test(app));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
