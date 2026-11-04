// Bob for Android: checks on the phone page (android/app/src/main/assets/www) and the pieces it shares with desktop Bob.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'android/app/src/main/assets/www');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? `: ${extra}` : ''}`); } };

await import(pathToFileURL(path.join(www, 'shared.js')));
await import(pathToFileURL(path.join(www, 'logic.js')));
await import(pathToFileURL(path.join(www, 'help.js')));
const L = globalThis.BobLogic, S = globalThis.BobShared, H = globalThis.BobHelp;

// Shared with desktop Bob: persona and pinned models are made from src/persona.js and catalog.json.
const { buildShared, OUT } = await import(pathToFileURL(path.join(root, 'android/tools/make-shared.mjs')));
check('shared.js is up to date (node android/tools/make-shared.mjs)', fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') === buildShared().replace(/\r\n/g, '\n'));
check('phone persona is Bob, on a phone, without the PC-only parts', /You are Bob/.test(S.persona) && /phone/.test(S.persona) && !/front desk|spin up copies|Idle Process|notice board/i.test(S.persona));
for (const m of S.models) {
  const f = m.file || {};
  check(`${m.name}: pinned to an exact Hugging Face commit, with size and sha256`, /^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+\/resolve\/[0-9a-f]{40}\/[\w.-]+\.gguf$/.test(f.url) && /^[0-9a-f]{64}$/.test(f.sha256) && f.bytes > 1e8 && f.url.endsWith(f.name));
}
check('Gemma 4 E2B is the recommended phone brain', S.models[0].id === 'gemma4-e2b' && S.models[0].pick === 'recommended');
check('llama.cpp is pinned to a full commit', /^[0-9a-f]{40}\s*$/.test(fs.readFileSync(path.join(root, 'android/llama.cpp.pin'), 'utf8')));

// Tailscale addresses only (same rule as NetBob.kt and desktop Bob's fromTailscaleOrLocal).
const good = { 'my-pc.tail1234.ts.net': 'http://my-pc.tail1234.ts.net:7777', '100.101.102.103': 'http://100.101.102.103:7777', '100.64.0.1:8080': 'http://100.64.0.1:8080', 'HTTP://My-PC.tail1234.ts.net/': 'http://my-pc.tail1234.ts.net:7777' };
for (const [a, want] of Object.entries(good)) check(`address ok: ${a}`, L.netAddress(a) === want, String(L.netAddress(a)));
for (const a of [['192', '168', '1', '20'].join('.'), '100.63.0.1', '100.128.0.1', 'example.com', 'evil.ts.net.example.com', 'https://my-pc.tail1234.ts.net', 'user@my-pc.ts.net', 'my-pc.ts.net/x', '100.64.0.1:99999', '']) check(`address refused: ${a || '(empty)'}`, L.netAddress(a) === null);
const kt = fs.readFileSync(path.join(root, 'android/app/src/main/java/ca/mousewurx/bob/NetBob.kt'), 'utf8');
check('NetBob.kt has the same Tailscale rule', /second in 64\.\.127/.test(kt) && /\\\.ts\\\.net\$/.test(kt));

// Big jobs: the card only shows when it's clearly one.
const big = { 'draw me a fox': 'pictures', 'make a picture of a castle at night': 'pictures', 'can you make a song about cats': 'music', 'make a short video of rain': 'video', 'tidy my downloads folder': 'files', 'run my build script': 'programs', 'convert this to pdf': 'office', 'scan my pc for viruses': 'security' };
for (const [t, id] of Object.entries(big)) check(`big job: "${t}"`, L.bigJob(t)?.id === id, JSON.stringify(L.bigJob(t)));
for (const t of ["what's a good song for a road trip?", 'I saw a nice picture yesterday', 'how do videos get compressed?', 'what is a virus, in biology?', 'remind me what we said about the fox'.replace('fox', 'garden')]) check(`not a big job: "${t}"`, L.bigJob(t) === null, JSON.stringify(L.bigJob(t)));

// Who answers.
const up = { name: 'Bob on my PC', base: 'b1', up: true, signedIn: true, can: { pictures: true } };
const down = { ...up, up: false };
check('auto: a reachable Bob answers', L.pickAnswerer({ bobs: [up] }).kind === 'net');
check('auto: nobody reachable, phone brain on and ready: phone answers', L.pickAnswerer({ bobs: [down], phoneOn: true, phoneReady: true }).kind === 'phone');
check('auto: phone brain off and no Bob: nobody, and says why', L.pickAnswerer({ bobs: [down] }).why === 'net-down' && L.pickAnswerer({}).why === 'nobody');
check('phone brain on but not downloaded: says so', L.pickAnswerer({ phoneOn: true }).why === 'phone-missing');
check('always the phone: big job offers a Bob that can do it', L.pickAnswerer({ mode: 'phone', phoneOn: true, phoneReady: true, bobs: [up], job: { id: 'pictures' } }).offer?.base === 'b1');
check('always the phone: no offer for chat', L.pickAnswerer({ mode: 'phone', phoneOn: true, phoneReady: true, bobs: [up] }).offer === null);
check('always the phone, phone brain off: nobody (opt-in holds)', L.pickAnswerer({ mode: 'phone', bobs: [up] }).kind === 'none');
check('always a Bob on the network: never the phone', L.pickAnswerer({ mode: 'net', phoneOn: true, phoneReady: true, bobs: [down] }).kind === 'none');
check('picks a Bob that can make pictures over one that cannot', L.pickAnswerer({ bobs: [{ ...up, base: 'b0', can: { pictures: false } }, up], job: { id: 'pictures' } }).bob.base === 'b1');
check('a Bob that needs the passcode is not used', L.pickAnswerer({ bobs: [{ ...up, signedIn: false }] }).kind === 'none');

// The phone brain's instructions.
const sys = L.phoneSystem({ persona: S.persona, user: 'Sam', cat: 'Patches', now: 'Tuesday', memory: 'Likes tea', recap: [{ who: 'you', text: 'hi' }, { who: 'bob', text: 'hello' }], bigBob: 'Bob on my PC' });
check('phone instructions: name filled in, no placeholders left', sys.includes('Sam') && !/\{\{/.test(sys));
check('phone instructions: says what the phone cannot do and never to pretend', /can't make pictures/.test(sys) && /Never pretend/.test(sys));
check('phone instructions: memory and recap included', sys.includes('Likes tea') && sys.includes('Sam: hi') && sys.includes('Bob: hello'));
const steady = L.phoneSystem({ persona: S.persona, user: 'Sam', cat: 'Patches', memory: 'Likes tea', bigBob: 'Bob on my PC' });
check('phone instructions without a time stay the same from reply to reply (prompt cache)', !/Current date and time/.test(steady) && steady === L.phoneSystem({ persona: S.persona, user: 'Sam', cat: 'Patches', memory: 'Likes tea', bigBob: 'Bob on my PC' }));
check('phone instructions stay small (under about 1,200 tokens)', sys.length / 4 < 1200, `${Math.round(sys.length / 4)}`);

// Replies are escaped: nothing a model writes becomes HTML.
const md = L.markdown('**hi** <script>alert(1)</script> [x](javascript:alert(1)) [ok](https://example.com)\n```js\n<b>code</b>\n```');
check('markdown escapes HTML', !/<script>/.test(md) && md.includes('&lt;script&gt;') && md.includes('&lt;b&gt;code'));
check('markdown links: only http(s), opened by the phone', !/javascript:/.test(md.replace(/\[x\]\(javascript:alert\(1\)\)/, '')) && md.includes('data-link="https://example.com"') && !/href="http/.test(md));

// Help covers every setting and screen on the page.
const html = fs.readFileSync(path.join(www, 'index.html'), 'utf8');
const ids = H.sections.map((s) => s.id);
const need = { 'phone-on': 'phone-brain', 'free-idle': 'free-memory', 'idle-min': 'free-memory', mode: 'who', 'user-name': 'user-name', 'read-aloud': 'read-aloud', theme: 'theme', resume: 'resume', mic: 'mic', effort: 'effort', bobs: 'bobs', memory: 'memory', chats: 'past-chats', 'lend-on': 'lend' };
for (const [ctl, sec] of Object.entries(need)) check(`help covers ${ctl}`, (html.includes(`id="${ctl}"`) || html.includes(`name="${ctl}"`)) && ids.includes(sec));
const controls = [...html.matchAll(/<(?:input|select)[^>]*(?:id|name)="([\w-]+)"/g)].map((m) => m[1]).filter((x) => !['chat-search', 'help-search', 'add-name', 'add-address', 'memory-text'].includes(x));
for (const c of new Set(controls)) check(`setting ${c} has a help entry`, c in need);
check('help has a glossary and an FAQ', ids.includes('glossary') && ids.includes('faq'));

// Opt-in: everything extra starts off.
const js = fs.readFileSync(path.join(www, 'phone.js'), 'utf8');
const defaults = js.match(/const DEFAULTS = (\{[^}]+\})/)[1];
check('opt-in: phone brain, read aloud, pick up after close start off', /phoneOn: false/.test(defaults) && /readAloud: false/.test(defaults) && /resume: false/.test(defaults));
check('free memory when idle starts on (lightweight rule)', /freeWhenIdle: true/.test(defaults));

check('opt-in: Lend my brain starts off', /getBoolean\("on", false\)/.test(fs.readFileSync(path.join(root, 'android/app/src/main/java/ca/mousewurx/bob/LendServer.kt'), 'utf8')));

// The phone brain gets the chat so far and the time beside your message, not inside his instructions.
check('phone chat sends history and the time as a note', /brain\.chat', \{ file: model\.file\.name, system, history, text, note/.test(js));

// Lend my brain: the door's rules (Lend protocol v1, same as a desktop lender's).
const ktf = (f) => fs.readFileSync(path.join(root, 'android/app/src/main/java/ca/mousewurx/bob', f), 'utf8');
const lendKt = ktf('LendServer.kt');
check('lend: opens only on the phone\'s Tailscale address', /ss\.bind\(InetSocketAddress\(ip, PORT\)/.test(lendKt) && /isTailscale\(la\.address\)/.test(lendKt));
check('lend: refuses anyone not on Tailscale, and a Host that isn\'t a Tailscale name', /if \(!isTailscale\(remote\)\) return reply\(out, 403/.test(lendKt) && /if \(!okHost\(req\.headers\["host"\]\)\) return reply\(out, 403/.test(lendKt));
check('lend: passcode stored only as a slow hash, login keys only as fingerprints', /PBKDF2WithHmacSHA256/.test(lendKt) && /sha\(k\)/.test(lendKt) && !/putString\("code"/.test(lendKt));
check('lend: too many wrong passcodes get 429', /reply\(out, 429/.test(lendKt));
check('lend: hello and chat need the login cookie', /"\/api\/lend\/hello" && req\.method == "GET" -> \{ if \(signedIn\(req, out\)\)/.test(lendKt) && /"\/api\/lend\/chat" && req\.method == "POST" -> \{ if \(signedIn\(req, out\)\)/.test(lendKt));
check('lend: chat needs the x-bob header (no web page can send it)', /req\.headers\["x-bob"\] != "1"/.test(lendKt));
check('lend: says no with 409 and a reason', /reply\(out, 409, JSONObject\(\)\.put\("busy"/.test(lendKt) && ['in use', 'too warm', 'low battery', 'no brain', 'busy'].every((w) => lendKt.includes(`"${w}"`)));
check('lend: keeps nothing (no files, no logging of the words)', !/FileOutputStream|openFileOutput|Log\.[dive]\(|appendText|writeText/.test(lendKt));
check('lend: answers in protocol v1 events', /put\("type", "done"\)\.put\("reply", r\)/.test(lendKt) && /"type", "token"/.test(ktf('PhoneBrain.kt')));
check('lend: tool calls go back to the other Bob, never run here', /ChatShape\.callsOut\(r\.toolCalls\)/.test(ktf('PhoneBrain.kt')) && !/Runtime\.getRuntime\(\)\.exec|ProcessBuilder/.test(lendKt + ktf('PhoneBrain.kt') + ktf('ChatShape.kt')));
const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
check('lend: a notification shows for as long as it\'s on (foreground service, not exported)', /android:name="\.LendService"\s+android:exported="false"\s+android:foregroundServiceType="specialUse"/.test(manifest));
check('phone page says "Let my other devices in", like the PC', !files0().some((f) => /Let my phone in/.test(fs.readFileSync(f, 'utf8'))));

// Every call the page makes carries the fields the Android side reads (the first phone test caught a download
// that sent the model's file entry as it was, without "file").
const bridge = fs.readFileSync(path.join(root, 'android/app/src/main/java/ca/mousewurx/bob/Bridge.kt'), 'utf8');
for (const [, op, body] of bridge.matchAll(/"([\w.]+)" -> \{?([^\n]*)/g)) {
  const need = [...body.matchAll(/o\.get(?:String|Long|Int|Boolean|JSONArray)\("(\w+)"\)/g)].map((m) => m[1]);
  for (const call of js.matchAll(new RegExp(`phone\\('${op.replace('.', '\\.')}'(?:, \\{([^}]*)\\}|, ([\\w.]+))?`, 'g'))) {
    const keys = call[1] !== undefined ? [...call[1].matchAll(/(\w+)(?=\s*[:,]|\s*$)/g)].map((m) => m[1]) : [];
    check(`phone('${op}') sends ${need.join(', ') || 'nothing it needs'}`, call[2] === undefined && need.every((k) => keys.includes(k)), call[0]);
  }
}

// A networked Bob's plan card: the steps, and Go ahead / Change something / Not now, answered the PC's way.
{
  const pc = (js.match(/function planCard\([\s\S]*?\n  \}\n/) || [''])[0];
  check('plan card: shown when the OK carries a plan', /if \(ev\.planCard\) return planCard\(base, ev\)/.test(js));
  check('plan card: Go ahead, Change something, Not now', ['Go ahead', 'Change something', 'Not now (Bob drops this job)', 'Send to Bob', 'Back'].every((w) => pc.includes(`'${w}'`)));
  check('plan card: Go ahead allows all, Change sends a note of up to 500 characters', /allow: true, items: null/.test(pc) && /allow: false, items: null, note: t/.test(pc) && /slice\(0, 500\)/.test(pc) && /'\/api\/approve'/.test(pc));
  check('plan card: says ticking some steps is on the PC', pc.includes('To tick some and not others, use the card on the PC.'));
}

// Check-ins from a networked Bob: a card in chat and, in the background, a notification. Nothing changes them here.
check('check-in: a card in chat', /if \(ev\.type === 'checkin'\) return checkinCard\(base, ev\)/.test(js) && /function checkinCard\(/.test(js));
check('check-in: a notification in the background ("Bob: check-in", the titles)', /"checkin" -> \{[\s\S]*?notifyNow\("Bob: check-in", titles/.test(bridge));
check('check-in: the phone never changes check-ins', !/\/api\/checkins/.test(js));

// "Remember only what fits": on-phone replies ask the PC for the lines that fit, briefly, and carry on without.
check('memory: on-phone replies ask the PC for what fits (2 s at most)', /'\/api\/memory\/recall'/.test(js) && /setTimeout\(\(\) => ok\(''\), 2000\)/.test(js) && /if \(!m\.on\) return ''/.test(js));

// How-tos: the phone shows the offer card and answers it; changing or deleting is on the PC.
check('how-to: the offer card answers /api/howtos/answer with id, save, name', /function howtoCard\(/.test(js) && /'\/api\/howtos\/answer'/.test(js) && /\{ id: ev\.id, save, name:/.test(js));
check('how-to: the phone never edits or deletes how-tos', !/\/api\/howtos(?!\/answer)/.test(js));

// The page's lock: no inline scripts or styles, no network from the page itself.
check('page has a strict Content-Security-Policy', /script-src 'self'/.test(html) && /connect-src 'none'/.test(html) && !/<script>(?!<)/.test(html.replace(/<script src[^>]*><\/script>/g, '')) && !/ style="/.test(html));

// Nothing personal in the phone app.
function files0() { const out = []; const w = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'third_party' && f.name !== 'build') w(p); } else if (/\.(js|kt|html)$/.test(f.name)) out.push(p); } }; w(path.join(root, 'android')); return out; }
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'third_party' && f.name !== 'build') walk(p); } else if (/\.(js|mjs|kt|kts|html|css|json|xml|md|sh|ps1)$/.test(f.name)) files.push(p); } };
walk(path.join(root, 'android'));
// (The owner's own name is checked by run-public-test.js; here: the PC's name and home addresses.)
const bad = files.filter((f) => new RegExp(['\\bnpc\\.', ['192', '168', '\\d+', '\\d+'].join('\\.')].join('|'), 'i').test(fs.readFileSync(f, 'utf8')));
check('no personal names or home addresses in android/', !bad.length, bad.join(', '));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
