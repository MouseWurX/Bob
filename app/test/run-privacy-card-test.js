// Nov 23 2026 (the owner: "Turning discord on or telegram on or those other services on should be the switch for them,
// and it should have a clear warning about privacy"; "There should be a best practices for privacy with each different
// service"; "Yes to the check own docs rule"). The privacy card (src/privacy-services.js, public/privacy-card.js):
// every service that sends data out has a card, turning one on is refused until the card is confirmed, turning off
// never asks, and every best practice names the provider page it was checked against and the day. No network.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(app, f)).href);
const { PRIVACY_SERVICES, PRIVACY_PATHS, turningOn, privacyGate } = await imp('src/privacy-services.js');

// ---- every card says what, where and who, and every best practice is checked against its page
{
  const ids = Object.keys(PRIVACY_SERVICES);
  check('there is a card for each service that sends data out', ['telegram', 'discord', 'web-search', 'search-backup', 'email', 'cloud-helpers', 'talk-cloud', 'rent-answer', 'rent-serverless', 'rent-machine', 'coding-agents', 'mcp-remote'].every((id) => ids.includes(id)));
  const bad = ids.filter((id) => { const c = PRIVACY_SERVICES[id]; return !c.name || !c.sends || !c.to || !c.sees || !Array.isArray(c.tips) || !Array.isArray(c.advice) || !(c.tips.length + c.advice.length); });
  check('every card says what it sends, where, who can see it, and has best practices', !bad.length, bad.join(', '));
  const tips = ids.flatMap((id) => PRIVACY_SERVICES[id].tips.map((t) => ({ id, ...t })));
  const unchecked = tips.filter((t) => !/^https:\/\/[^\s]+$/.test(t.source || '') || !/^\d{4}-\d{2}-\d{2}$/.test(t.checked || ''));
  check('every best practice about a provider names the provider\'s own page and the day it was checked (the owner\'s rule)', tips.length > 10 && !unchecked.length, unchecked.map((t) => t.id).join(', '));
  check('the rented-brain cards say the brain sees everything in the chat, mail and files included', ['rent-answer', 'rent-serverless'].every((id) => /sees everything in the chat, including any mail or files/.test(PRIVACY_SERVICES[id].sees)));
  check('the rented-machine card says stopped is not deleted and the wipe is the service\'s promise', /Stopped is not deleted/.test(JSON.stringify(PRIVACY_SERVICES['rent-machine'])) && /service's promise/.test(PRIVACY_SERVICES['rent-machine'].sees));
  check('the coding-agent card says Bob can\'t see or limit what it sends', /can't see or limit/.test(PRIVACY_SERVICES['coding-agents'].sees));
}

// ---- turning on asks; turning off, or a switch already on, never does
{
  const off = {};
  const cases = [
    ['/api/telegram', { enabled: true }, 'telegram'],
    ['/api/discord', { enabled: true }, 'discord'],
    ['/api/settings', { webSearch: true }, 'web-search'],
    ['/api/settings', { cloudHelpers: { anthropic: { enabled: true, model: 'x' } } }, 'cloud-helpers'],
    ['/api/search-backup', { use: { id: 'mojeek', on: true } }, 'search-backup'],
    ['/api/talk', { talkCloud: 'xai' }, 'talk-cloud'],
    ['/api/more-tools', { set: { email: true } }, 'email'],
    ['/api/rent/settings', { enabled: { openrouter: true } }, 'rent-answer'],
    ['/api/rent/settings', { enabled: { 'runpod-serverless': true } }, 'rent-serverless'],
    ['/api/rent/settings', { enabled: { vast: true } }, 'rent-machine'],
    ['/api/coding-agents', { add: { kind: 'claude' } }, 'coding-agents']
  ];
  const miss = cases.filter(([p, b, id]) => JSON.stringify(turningOn(p, b, off)) !== JSON.stringify([id]));
  check('each switch, turned on, asks with its own card', !miss.length, miss.map((c) => c[2]).join(', '));
  check('every gated address is one the gate watches', cases.every(([p]) => PRIVACY_PATHS.has(p)) && PRIVACY_PATHS.has('/api/hands/mcp'));
  const on = { telegram: { enabled: true }, discord: { enabled: true }, webSearch: true, cloudHelpers: { anthropic: { enabled: true } }, searchBackup: { use: { mojeek: true } }, talkCloud: 'xai', moreTools: { email: true }, rentals: { enabled: { openrouter: true, vast: true, 'runpod-serverless': true } } };
  const again = cases.filter(([p, b]) => p !== '/api/coding-agents' && turningOn(p, b, on).length);
  check('a switch that is already on doesn\'t ask again', !again.length, again.map((c) => c[2]).join(', '));
  const offs = [['/api/telegram', { enabled: false }], ['/api/settings', { webSearch: false }], ['/api/rent/settings', { enabled: { vast: false } }], ['/api/more-tools', { set: { email: false } }], ['/api/talk', { talkCloud: 'off' }], ['/api/discord', { chat: true }]];
  check('turning something off, or another setting, never asks', offs.every(([p, b]) => !turningOn(p, b, on).length && !turningOn(p, b, off).length));
  const servers = [{ id: 'blender', on: false, url: '', cmd: 'uvx' }, { id: 'local', on: false, url: 'http://127.0.0.1:8000/mcp' }, { id: 'far', on: false, url: 'https://tools.example/mcp' }];
  check('a connected app asks only when it is on another computer', turningOn('/api/hands/mcp', { id: 'far', on: true }, off, { servers }).join() === 'mcp-remote' && !turningOn('/api/hands/mcp', { id: 'local', on: true }, off, { servers }).length && !turningOn('/api/hands/mcp', { id: 'blender', on: true }, off, { servers }).length);
  const g = privacyGate('/api/telegram', { enabled: true }, off);
  check('the gate answers 428 with the card until it is confirmed', g?.status === 428 && g.body.privacy?.[0]?.id === 'telegram' && /privacy card/.test(g.body.error));
  check('with the card confirmed (x-bob-privacy-ok) the change goes ahead', privacyGate('/api/telegram', { enabled: true }, off, 'telegram') === null);
  check('confirming one card doesn\'t confirm another', privacyGate('/api/settings', { webSearch: true, cloudHelpers: { openai: { enabled: true } } }, off, 'web-search')?.body.privacy.map((c) => c.id).join() === 'cloud-helpers');
  check('nothing new is switched on by the gate itself', JSON.stringify(off) === '{}');
}

// ---- the page: shows the card, sends again only after "Turn it on"
{
  const { installPrivacyCard, cardHtml } = await imp('public/privacy-card.js');
  const card = { id: 'telegram', ...PRIVACY_SERVICES.telegram };
  const mk = (answer) => {
    const calls = [];
    const win = { fetch: async (url, init = {}) => { calls.push(new Headers(init.headers || {}).get('x-bob-privacy-ok')); return calls.length === 1 ? new Response(JSON.stringify({ error: 'x', privacy: [card] }), { status: 428 }) : new Response('{"ok":true}', { status: 200 }); } };
    let shown = null;
    installPrivacyCard(win, async (cards) => { shown = cards; return answer; });
    return { win, calls, shown: () => shown };
  };
  const yes = mk(true);
  const r = await yes.win.fetch('/api/telegram', { method: 'POST', headers: { 'x-bob': '1' }, body: '{"enabled":true}' });
  check('"Turn it on" sends the same change again, naming the confirmed card', r.status === 200 && yes.calls.join('|') === '|telegram' && yes.shown()?.[0]?.id === 'telegram');
  const no = mk(false);
  const r2 = await no.win.fetch('/api/telegram', { method: 'POST', body: '{"enabled":true}' });
  check('"Keep it off" sends nothing more and answers as refused, so the switch stays off', r2.status === 409 && (await r2.json()).keptOff === true && no.calls.length === 1);
  const html = cardHtml(card);
  check('the card shows what, where, who, and each best practice with its page and check date', /What it sends/.test(html) && /Where it goes/.test(html) && /Who can see it/.test(html) && /Privacy best practices/.test(html) && /telegram\.org/.test(html) && /checked 2026-11-23/.test(html));
  check('the card escapes what it shows', !/<script/.test(cardHtml({ ...card, name: '<script>x</script>' })));
}

// ---- wired in: the server gate runs before the routes, both pages load the card, Help explains it
{
  const server = fs.readFileSync(path.join(app, 'src/server.js'), 'utf8').replace(/\r\n/g, '\n');
  check('server.js runs the privacy gate on POSTs to the watched addresses, and reads the body once', /PRIVACY_PATHS\.has\(p\)/.test(server) && /privacyGate\(p, b, cfg, req\.headers\['x-bob-privacy-ok'\]\)/.test(server) && /req\.bobBody !== undefined/.test(server));
  for (const f of ['public/app.js', 'public/settings-window.js']) check(`${f} loads the privacy card`, fs.readFileSync(path.join(app, f), 'utf8').includes("import './privacy-card.js'"));
  const help = fs.readFileSync(path.join(app, 'public/help-content.js'), 'utf8');
  check('Help has the privacy card, the glossary and the FAQ', /Privacy card/.test(help) && /only send your data out through services you switch on/.test(help));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
