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
// 1.5.122: the character screen's parts and composer come word for word from public/avatars.js.
const { buildAvatars, OUT_AVATARS } = await import(pathToFileURL(path.join(root, 'android/tools/make-shared.mjs')));
check('avatars.js is up to date (node android/tools/make-shared.mjs)', fs.readFileSync(OUT_AVATARS, 'utf8').replace(/\r\n/g, '\n') === buildAvatars().replace(/\r\n/g, '\n'));
await import(pathToFileURL(path.join(www, 'avatars.js')));
{ const A = globalThis.BobAvatars, D = await import(pathToFileURL(path.join(root, 'public/avatars.js')));
  const id = A.encodeParts({ ...A.DEFAULT_PARTS, body: 'f', hair: 'braids', armour: 'plate', weapon: 'sword', shield: 'round' });
  check('avatars.js draws the same look as the desktop (same map, palette and sentence)', JSON.stringify(A.avatar(id)) === JSON.stringify(D.avatar(id)) && A.avatar(id).map.length === 16 && /woman with braided/.test(A.avatar(id).what) && A.PARTS.body.some(([v]) => v === 'f')); }
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
const big = { 'draw me a fox': 'pictures', 'make a picture of a castle at night': 'pictures', 'can you make a song about cats': 'music', 'make a short video of rain': 'video', 'tidy my downloads folder': 'files', 'run my build script': 'programs', 'convert this to pdf': 'office', 'scan my pc for viruses': 'security', 'edit my selfie so the sky is blue': 'pictures', 'restyle that photo as a comic': 'pictures', 'design a poster for my band': 'pictures', 'I want the picture to look like winter': 'pictures' };
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
const need = { 'prompt-on': 'saved-prompts', 'phone-on': 'phone-brain', 'free-idle': 'free-memory', 'idle-min': 'free-memory', mode: 'who', 'user-name': 'user-name', 'read-aloud': 'read-aloud', theme: 'theme', resume: 'resume', mic: 'mic', effort: 'effort', bobs: 'bobs', memory: 'memory', chats: 'past-chats', 'lend-on': 'lend', 'pass-along': 'pass-along' };
for (const [ctl, sec] of Object.entries(need)) check(`help covers ${ctl}`, (html.includes(`id="${ctl}"`) || html.includes(`name="${ctl}"`)) && ids.includes(sec));
const controls = [...html.matchAll(/<(?:input|select)[^>]*(?:id|name)="([\w-]+)"/g)].map((m) => m[1]).filter((x) => !['chat-search', 'help-search', 'add-name', 'add-address', 'memory-text'].includes(x));
for (const c of new Set(controls)) check(`setting ${c} has a help entry`, c in need);
check('help has a glossary and an FAQ', ids.includes('glossary') && ids.includes('faq'));

// Opt-in: everything extra starts off.
const js = fs.readFileSync(path.join(www, 'phone.js'), 'utf8').replace(/\r\n/g, '\n'); // Windows checkouts are CRLF
const defaults = js.match(/const DEFAULTS = (\{[^}]+\})/)[1];
check('opt-in: phone brain, read aloud, pick up after close start off', /phoneOn: false/.test(defaults) && /readAloud: false/.test(defaults) && /resume: false/.test(defaults));
check('free memory when idle starts on (lightweight rule)', /freeWhenIdle: true/.test(defaults));

check('opt-in: Lend my brain starts off', /getBoolean\("on", false\)/.test(fs.readFileSync(path.join(root, 'android/app/src/main/java/ca/mousewurx/bob/LendServer.kt'), 'utf8')));

// The phone brain gets the chat so far and the time beside your message, not inside his instructions.
check('phone chat sends history and the time as a note', /brain\.chat', \{ file: model\.file\.name, system, history, text, note/.test(js));

// Lend my brain: the door's rules (Lend protocol v1, same as a desktop lender's).
const ktf = (f) => fs.readFileSync(path.join(root, 'android/app/src/main/java/ca/mousewurx/bob', f), 'utf8').replace(/\r\n/g, '\n'); // Windows checkouts are CRLF
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
  check('plan card: says ticking some steps is on the PC', pc.includes('To tick some and not others, use the card on your other replicant matrix.'));
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

// The CPU engine parts are loaded from the app's library folder, so Android must unpack them at install.
{
  const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle.kts'), 'utf8');
  check('engine: native libraries are unpacked so llama.cpp can load its CPU parts', !/GGML_BACKEND_DL=ON/.test(gradle) || /useLegacyPackaging = true/.test(gradle));
}

// A part that may be missing never reaches append() as null (it would show the word "null").
check('lend panel: no stray "null" when Lend my brain is off', /box\.append\(\.\.\.\[[\s\S]*?\]\.filter\(Boolean\)\)/.test(js));

// Turning on Lend my brain makes the passcode when there isn't one yet (no separate step first).
check('lend: turning it on makes the passcode if none is set', /if \(on && !lend\.passcodeSet\) \{ lendCode = await phone\('lend\.newPasscode'\)/.test(js));

// Replicant matrix wording: the phone page never calls the machine a "PC" on screen (comments and Bob's model prompt aside).
{
  const shown = html.replace(/<!--[\s\S]*?-->/g, '') + js.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').replace(/\/(?:[^/\n\\]|\\.)+\/[gimsuy]*/g, '');
  const hits = (shown.match(/[^\n]{0,40}\b(?:PCs?|my-pc)\b[^\n]{0,40}/g) || []);
  check('replicant matrix: no "PC" in the phone page\'s own words', !hits.length, hits.join(' | '));
}

// Photos: picked with Android's own picker, sent to a networked Bob (never the phone brain), then the chat points at it.
check('photo: 📎 picks with the system photo picker (no permission)', /<button id="photo" aria-label="Add a photo">/.test(html) && /MediaStore\.ACTION_PICK_IMAGES/.test(bridge) && !/READ_MEDIA_IMAGES|READ_EXTERNAL_STORAGE/.test(fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8')));
check('photo: uploads to /api/refs as kind chat, then /api/chat carries the ref', /\/api\/refs\?kind=chat/.test(bridge) && /phone\('photo\.upload'/.test(js) && /refs\.length \? \{ refs \}/.test(js));
check('photo: never goes to the phone brain', /if \(photo && !to\)/.test(js) && !/brain\.chat[^\n]*photo/.test(js));

// Bob-Net pairing v1: the four routes before the passcode, a card here, Pair by address, nothing switched on.
{
  const lendKt2 = ktf('LendServer.kt'), pairKt = ktf('Pairing.kt');
  check('pair: hello/ask/status/finish served on the lend door, before the passcode', /"\/api\/pair\/hello"/.test(lendKt2) && /startsWith\("\/api\/pair\/"\)/.test(lendKt2) && /"\/api\/pair\/ask"[\s\S]*"\/api\/pair\/status"[\s\S]*"\/api\/pair\/finish"/.test(lendKt2));
  check('pair: the asker must call from the address it gives, 4-digit number, 3 asks a minute', /address\.substringBefore\(':'\) != remoteIp/.test(pairKt) && /\\\\d\{4\}/.test(pairKt) && /ASKS_A_MINUTE = 3/.test(pairKt));
  check('pair: each pairing gets its own passcode, kept as a fingerprint; a new passcode drops them', /fun pairPasscode/.test(lendKt2) && /putString\("pairs", "\[\]"\)/.test(lendKt2) && !/putString\("code"/.test(lendKt2));
  check('pair: our passcode goes over only after their yes, and only while Lend my brain is on', /"yes" -> \{[\s\S]*?if \(app\.lend\.state == "open"\) app\.lend\.pairPasscode/.test(pairKt));
  check('pair: Yes refused while the door is shut', /if \(yes && app\.lend\.state != "open"\)/.test(pairKt));
  check('pair: the reviewed card and waiting words', /should show the number/.test(js) && /Waiting for a yes on \$\{who\}/.test(js));
  check('pair: the card, Pair with this Bob, and nothing switched on', /'Yes, pair us'/.test(js) && /id="pair-bob"/.test(html) && !/setOn\(true\)/.test(pairKt) && !/settings\.(phoneOn|mode)\s*=/.test((js.match(/function onPair[\s\S]*?\n  \}\n/) || [''])[0]));
}

// Model families: every phone brain names its family; the picker groups them under headers you open and close.
{
  const pm = JSON.parse(fs.readFileSync(path.join(root, 'android/phone-models.json'), 'utf8'));
  check('families: every phone brain has a family', pm.models.every((m) => typeof m.family === 'string' && m.family.length > 0));
  check('families: the picker groups them under headers that open and close (remembered)', /el\('details', \{ class: 'fam'/.test(js) && /store\.set\('openFamilies'/.test(js));
}

// Save to this phone: every type is a button (the original too), and the file lands on the phone, not only on the PC.
check('save: every type, original included, saves on this phone', /'Save to this phone as '/.test(js) && /f === have \? ' \(original\)'/.test(js) && /phone\('media\.save'/.test(js) && /phone\('media\.saveData'/.test(js) && /MediaStore\.Images\.Media\.EXTERNAL_CONTENT_URI to "Pictures\/Bob"/.test(bridge));
check('save: no storage permission asked', !/WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/.test(fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8')));

// One Bob-Net page: your other Bobs, adding/pairing and Lend my brain together (not split with Phone brain).
{ const net = (html.match(/<section[^>]*id="bobs"[\s\S]*?<\/section>/) || [''])[0], brainP = (html.match(/<section[^>]*id="brain"[\s\S]*?<\/section>/) || [''])[0];
  check('bob-net: one page holds other Bobs, pairing and Lend my brain', /<h2>Bob-Net<\/h2>/.test(net) && /id="bob-list"/.test(net) && /id="pair-bob"/.test(net) && /id="lend-on"/.test(net) && /id="lend-box"/.test(net) && !/lend-/.test(brainP) && /data-go="bobs"><span class="ico">🌐<\/span>Bob-Net</.test(html) && /if \(id === 'bobs'\) watchLend\(\)/.test(js) && !/Bobs on your network/.test(html + js + fs.readFileSync(path.join(www, 'help.js'), 'utf8'))); }

// A saved file streams from that Bob into the phone's media library; it never sits whole in memory.
check('save: files stream to the phone, not held in memory', (() => { const net = fs.readFileSync(path.join(root, 'android/app/src/main/java/ca/mousewurx/bob/NetBob.kt'), 'utf8'); return /fun stream\(base: String, path: String, timeoutMs: Int = 60000, write:/.test(net) && /s\.copyTo\(out\)/.test(bridge) && !/fun bytes\(/.test(net) && !/readNBytes\(200_000_001\)/.test(net); })());

// Save a help bundle: the button on Settings, a networked Bob's zip (his name for it, a longer wait) or a phone-only HANDOFF.md, scrubbed; Help, FAQ and glossary.
{ const help = fs.readFileSync(path.join(www, 'help.js'), 'utf8'), net = fs.readFileSync(path.join(root, 'android/app/src/main/java/ca/mousewurx/bob/NetBob.kt'), 'utf8');
  check('help bundle: button, PC zip or phone-only HANDOFF.md, scrubbed', /id="help-bundle">Save a help bundle</.test(html) && /path = '\/api\/help-bundle'/.test(js) && /# HANDOFF\.md/.test(js) && /assume the worst/.test(js) && /<tailscale address>/.test(js) && /'the owner'/.test(js) && !/lendCode/.test(js.slice(js.indexOf('function phoneHandoff'), js.indexOf("$('help-bundle')"))) && /Content-Disposition/.test(net) && /optInt\("timeoutMs"/.test(bridge));
  check('help bundle: Help entry, FAQ row and glossary', /id: 'help-bundle', title: 'Save a help bundle'/.test(help) && /How do I get help with my Bob\?/.test(help) && /<dt>Help bundle<\/dt>/.test(help) && /<dt>Handoff file \(HANDOFF\.md\)<\/dt>/.test(help)); }

// Pass my Bob-Net along (off): the phone answers an introduction from one of its Bobs and pairs with no card; it never introduces.
{ const lendKt2 = fs.readFileSync(path.join(root, 'android/app/src/main/java/ca/mousewurx/bob/LendServer.kt'), 'utf8').replace(/\r\n/g, '\n'), pairKt = fs.readFileSync(path.join(root, 'android/app/src/main/java/ca/mousewurx/bob/Pairing.kt'), 'utf8').replace(/\r\n/g, '\n'), help = fs.readFileSync(path.join(www, 'help.js'), 'utf8');
  check('pass along: /api/bob-net/introduce needs the login cookie and x-bob; 409 off unless the switch is on and the door open', /"\/api\/bob-net\/introduce" && req\.method == "POST" -> \{ if \(signedIn\(req, out\)\) introduce/.test(lendKt2) && /private fun introduce\(out: OutputStream, req: Req, who: String\) \{\n\s+if \(req\.headers\["x-bob"\] != "1"/.test(lendKt2) && /settings\.passAlong && state == "open"/.test(lendKt2) && /if \(!open\) return 409 to JSONObject\(\)\.put\("busy", "off"\)/.test(pairKt));
  check('pass along: a vouched token is a yes with no card, once, for 3 minutes; an unknown token is 403 and nothing is kept', /if \(b\.has\("token"\)\) \{\n\s+val by = vouched\(.*\) \?: return 403/.test(pairKt) && /a\.state = "yes"; a\.by = by\n\s+asks\[id\] = a\n\s+return 200/.test(pairKt) && /expected\.remove\(address\)\n\s+return e\.from/.test(pairKt) && /for \(\(k, e\) in expected\) if \(now - e\.at > ASK_FOR_MS\) expected\.remove\(k\)/.test(pairKt) && /\^\[0-9a-f\]\{32\}\$/.test(pairKt) && !/pairWith\(.*token/.test(pairKt));
  check('pass along: the hello carries name and passAlong; the switch is off to start with and is a setting', /\.put\("name", app\.pair\.myName\(\)\)\.put\("passAlong", settings\.passAlong\)/.test(lendKt2) && /prefs\.getBoolean\("passAlong", false\)/.test(lendKt2) && /"lend\.passAlong" -> \{ app\.lend\.setPassAlong\(o\.getBoolean\("on"\)\)/.test(bridge) && /id="pass-along"/.test(html) && /phone\('lend\.passAlong', \{ on \}\)/.test(js) && /\$\('pass-along'\)\.checked = Boolean\(lend\.passAlong\)/.test(js));
  check('pass along: the chat says who introduced whom; Help, FAQ and glossary', /\$\{ev\.by\} introduced \$\{name\}/.test(js) && /put\("by", it\)/.test(pairKt) && /id: 'pass-along', title: 'Pass my Bob-Net along'/.test(help) && /never makes them/.test(help) && /Can my Bobs introduce each other\?/.test(help) && /<dt>Introduced<\/dt>/.test(help)); }

// 🎲 Adventure: the page shows your other Bob's table and plays your turns (cards, a second card with Back, the flair line); nothing starts by itself.
{ const help = fs.readFileSync(path.join(www, 'help.js'), 'utf8'), css = fs.readFileSync(path.join(www, 'phone.css'), 'utf8');
  check('adventure: menu entry, table from /api/adventure, cards with Back and flair, fate, live events', /data-go="adventure"><span class="ico">🎲<\/span>Adventure</.test(html) && /id="adv-body"/.test(html) && /advApi\('\/api\/adventure'\)/.test(js) && /'\/api\/adventure\/act'/.test(js) && /'\/api\/adventure\/fate'/.test(js) && /'\/api\/adventure\/start'/.test(js) && /'\/api\/adventure\/players'/.test(js) && /text: '← Back'/.test(js) && /'Skip the flair'/.test(js) && /'🎲 Roll it'/.test(js) && /ev\.type === 'adventure'\) return onAdvEvent/.test(js) && !/adventure\/settings/.test(js) && /\.adv-cards \{/.test(css));
  check('adventure: character screen (every body, swatches, Use for this character), Looks like, saved characters, the look goes with start', /<script src="avatars\.js"><\/script>/.test(html) && /function advCharacter\(/.test(js) && /AV\.partsFor\(p\.body\)/.test(js) && /'🧍 Change the look'/.test(js) && /'🧍 Close the character screen'/.test(js) && /useLabel = 'Use for this character'/.test(js) && /'🎲 Surprise me'/.test(js) && /text: 'Start over'/.test(js) && /role: 'radio', 'aria-checked'/.test(js) && /'\/api\/adventure\/characters\/save'/.test(js) && /'\/api\/adventure\/characters\/delete'/.test(js) && /'💾 Save this character'/.test(js) && /'Delete for good'/.test(js) && /'Keep it'/.test(js) && /look: advYou\.look \|\| ''/.test(js) && !/'Wear this'/.test(js) && /\.char-swatches button\[aria-checked="true"\]/.test(css));
  check('adventure: 📖 Characters page (You / Party / Met / Enemies), edit with the character screen, Forget between games, monster Hide swatches', /function advCharsPage\(/.test(js) && ['🧍 You', '👥 Party', '📖 Met', '⚔ Enemies'].every((t) => js.includes(`'${t}'`)) && !/'🎲 Party'/.test(js) && /text: '📖 Characters'/.test(js) && /text: '➕ New character'/.test(js) && /useLabel: 'Save this character'/.test(js) && /'\/api\/adventure\/met\/forget'/.test(js) && /text: 'Forget for good'/.test(js) && /`Forget \$\{m\.name\}\?`/.test(js) && /g \? null : ch\.ask === m\.id/.test(js) && /'aria-label': `\$\{e\.hearts\} hearts`/.test(js) && /v\.lastParty/.test(js) && /'monster'\) \? 'Hide'/.test(js) && /text: '📓 Journal'/.test(js) && /adv\.chars \? advCharsPage\(\)/.test(js) && /\.tabs button\[aria-selected="true"\]/.test(css));
  check('adventure: Help says the phone brain is too small to be game master; glossary lines', /id: 'adventure', title: 'Adventure'/.test(help) && /too small to be game master/.test(help) && /<dt>Game master<\/dt>/.test(help) && /<dt>Plot armour<\/dt>/.test(help) && /<dt>Action card<\/dt>/.test(help) && /<dt>Hearts<\/dt>/.test(help) && /<dt>Character screen<\/dt>/.test(help) && /Can my Adventure character look different from Bob\?/.test(help) && /Change the look<\/strong>/.test(help) && /<dt>Bestiary<\/dt>/.test(help) && /How tough are the enemies in an Adventure\?/.test(help) && /Goblin, Skeleton, Wolf, Bandit, Giant rat, Giant spider, Orc, Cultist, Slime, Ghost, Troll, Dragon/.test(help)); }

// 🧩 Games: the shelf and the five boards from your other Bob's /api/games; the phone brain is never used; no trademarked game names.
{ const help = fs.readFileSync(path.join(www, 'help.js'), 'utf8'), css = fs.readFileSync(path.join(www, 'phone.css'), 'utf8');
  check('games: menu entry, shelf with Start, the five boards, Stop/close, live events', /data-go="games"><span class="ico">🧩<\/span>Games</.test(html) && /id="games-body"/.test(html) && /advApi\('\/api\/games'\)/.test(js) && /'\/api\/games\/start'/.test(js) && /'\/api\/games\/act'/.test(js) && /'\/api\/games\/end'/.test(js) && /'\/api\/games\/close'/.test(js) && !/games\/settings/.test(js) && ['gamTwenty', 'gamHangman', 'gamLadder', 'gamLetters', 'gamStory'].every((f) => new RegExp(`function ${f}\\(`).test(js)) && /ev\.type === 'games'\) return onGamEvent/.test(js) && /text: '▶ Start'/.test(js) && /Stop this game\? It counts as unfinished/.test(js) && /\.tile\.g \{/.test(css) && /\.keyrow \{/.test(css));
  check('games: Help, FAQ and glossary; no trademarked names', /id: 'games', title: 'Games'/.test(help) && /phone brain is never used for a game/.test(help) && /Can the phone brain play the games\?/.test(help) && ['Twenty questions', 'Shelf', 'Word ladder', 'Five letters', 'Story dice'].every((t) => new RegExp(`<dt>${t}</dt>`).test(help)) && !/wordle|scrabble|boggle|pictionary/i.test(js + help + html)); }

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
