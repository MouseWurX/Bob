// Bob for iPhone: the phone screen from Bob for Android, handed out by desktop Bob at /phone/ and kept on an
// iPhone's Home Screen. Checks the copy is fresh, the web bridge answers everything the page asks, and the routes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? `: ${extra}` : ''}`); } };

// ---- the copy in public/phone/ matches Bob for Android's screen ----
const { buildWebPhone, WEB_DIR, WEB_COPIED } = await import(pathToFileURL(path.join(root, 'android/tools/make-shared.mjs')));
const built = buildWebPhone();
for (const [f, text] of Object.entries(built)) {
  const have = fs.existsSync(path.join(WEB_DIR, f)) ? fs.readFileSync(path.join(WEB_DIR, f), 'utf8').replace(/\r\n/g, '\n') : null;
  check(`public/phone/${f} is up to date (node android/tools/make-shared.mjs)`, have === text);
}
check('every script the phone page loads is copied or served', WEB_COPIED.includes('phone.js') && WEB_COPIED.includes('shared.js') && WEB_COPIED.includes('avatars.js'));
const html = built['index.html'];
check('index.html: marked as the web page, with the Home Screen parts', /<html[^>]* data-web>/.test(html) && /rel="manifest" href="manifest\.webmanifest"/.test(html) && /apple-mobile-web-app-capable" content="yes"/.test(html) && /rel="apple-touch-icon"/.test(html) && /href="web\.css"/.test(html));
check('index.html: only talks to the Bob that served it', /connect-src 'self';/.test(html) && !/connect-src 'none'/.test(html) && /default-src 'self'/.test(html) && /script-src 'self'/.test(html));
check('index.html: the web bridge loads before anything else', html.indexOf('web-bridge.js') > 0 && html.indexOf('web-bridge.js') < html.indexOf('shared.js') && html.indexOf('shared.js') < html.indexOf('phone.js'));

// ---- the bridge answers every question phone.js asks (or says it needs Bob for Android) ----
const bridge = read('public/phone/web-bridge.js');
const asked = [...new Set([...read('android/app/src/main/assets/www/phone.js').matchAll(/phone\('([\w.]+)'/g)].map((m) => m[1]))];
const handled = new Set([...bridge.matchAll(/^\s+'?([\w.]+)'?: /gm)].map((m) => m[1]));
const missing = asked.filter((op) => !handled.has(op) && !/^(brain|lend|pair)\./.test(op));
check('web bridge answers every op the phone page uses', !missing.length, missing.join(', '));
check('web bridge: brain, lending and pairing say they need Bob for Android', /\^\(brain\|lend\|pair\)\\\./.test(bridge) && /needs Bob for Android/.test(bridge));
check('web bridge: only the Bob that served it (no other addresses)', !/https?:\/\//.test(bridge.replace(/^\s*\/\/.*$/gm, '')) && /const BASE = location\.origin/.test(bridge));
check('web bridge: changes carry the x-bob header and a JSON or picture type', /'x-bob': '1'/.test(bridge) && /'image\/jpeg'/.test(bridge) && /'application\/json'/.test(bridge));
check('web bridge: the phone brain stays off and the PC Bob is the only one listed', /mode: 'net', phoneOn: false/.test(bridge) && /name: 'Bob on your PC'/.test(bridge));
check('web bridge: no style attributes (the page allows style-src self only)', !/\.style\s*=|setAttribute\('style'/.test(bridge));
const css = read('public/phone/web.css');
check('web.css hides the phone brain, lending, pairing and adding Bobs', /\[data-go="brain"\]/.test(css) && /#lend-box/.test(css) && /:has\(#add-name\)/.test(css) && /safe-area-inset-top/.test(css));
const man = JSON.parse(read('public/phone/manifest.webmanifest'));
check('Home Screen card: opens /phone/ full screen, with Bob\'s icons', man.start_url === '/phone/' && man.scope === '/phone/' && man.display === 'standalone' && man.icons.every((i) => i.src.startsWith('/phone/shared/icons/')));
check('phone.js: the About line can come from the page (Android wording unchanged)', /\$\('about'\)\.textContent = d\.about \|\| `Bob \$\{d\.version\} for Android/.test(read('android/app/src/main/assets/www/phone.js')));

// ---- login: goes back to /phone/ and nowhere else ----
const server = read('src/server.js');
check('login sends you back to /phone/ or /, never anywhere a form says', /location: form\.get\('next'\) === '\/phone\/' \? '\/phone\/' : '\/'/.test(server));
check('login page offers the phone screen', /Open the phone screen/.test(server) && /name="next" value="\/phone\/"/.test(server));
check('before login, only the phone icons and Home Screen card are handed out', /p\.startsWith\('\/phone\/shared\/icons\/'\)/.test(server) && /p === '\/phone\/manifest\.webmanifest'/.test(server));

// ---- Help ----
const helpSrc = read('public/help-content.js');
check('Help: an FAQ and a glossary entry, in Bob\'s voice', /id: 'faq-iphone'/.test(helpSrc) && /<dt>Bob for iPhone \(phone screen\)<\/dt>/.test(helpSrc) && /Add to Home Screen/.test(helpSrc));

// ---- the routes, on a real Bob ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-iphone-'));
const PORT = 7794;
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ ...JSON.parse(read('config.example.json')), engine: 'ollama' }));
const bob = spawn(process.execPath, [path.join(root, 'src', 'server.js')], { env: { ...process.env, BOB_CONFIG: path.join(tmp, 'config.json'), BOB_AGENT_DIR: path.join(tmp, 'Bob home'), BOB_OLLAMA_URL: 'http://127.0.0.1:9', BOB_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((r) => { bob.stdout.once('data', r); setTimeout(r, 15000); });
const get = (p) => new Promise((resolve) => http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve({ status: r.statusCode, type: r.headers['content-type'] || '', location: r.headers.location, body: b })); }).on('error', () => resolve({ status: 0 })));
try {
  const page = await get('/phone/');
  check('/phone/ is the phone screen', page.status === 200 && /text\/html/.test(page.type) && /web-bridge\.js/.test(page.body), String(page.status));
  const bare = await get('/phone');
  check('/phone goes to /phone/', bare.status === 301 && bare.location === '/phone/');
  for (const [p, type] of [['/phone/shared/icons/bob-192.png', 'image/png'], ['/phone/shared/fonts/ibm-plex-mono-latin-500-normal.woff2', 'font/woff2'], ['/phone/vendor/mermaid-LICENSE.txt', 'text/plain'], ['/phone/diagram-core.js', 'text/javascript'], ['/phone/web-bridge.js', 'text/javascript'], ['/phone/manifest.webmanifest', 'application/manifest+json']]) {
    const r = await get(p);
    check(`${p} is served (${type})`, r.status === 200 && r.type.startsWith(type), `${r.status} ${r.type}`);
  }
  check('/phone/../config.json is not reachable', (await get('/phone/%2e%2e/%2e%2e/config.json')).status === 404);
} finally {
  bob.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
