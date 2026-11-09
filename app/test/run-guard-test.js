// 1.0.4: the same-origin check on everything that changes something.
import { refuseForeign } from '../src/guard.js';

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const host = '127.0.0.1:7777';
const req = (headers) => ({ headers: { 'content-type': 'application/json', ...headers } });

check("Bob's own page is fine", refuseForeign(req({ origin: 'http://127.0.0.1:7777', 'sec-fetch-site': 'same-origin' }), host) === '');
check('no Origin (a tool on this PC) is fine', refuseForeign(req({}), host) === '');
check('another website is refused', refuseForeign(req({ origin: 'https://evil.example' }), host) === 'other website');
check('localhost:7777 calling 127.0.0.1:7777 is refused (different origin)', refuseForeign(req({ origin: 'http://localhost:7777' }), host) === 'other website');
check('another port on this PC is refused', refuseForeign(req({ origin: 'http://127.0.0.1:3000' }), host) === 'other website');
check('Origin "null" (sandboxed page, file://) is refused', refuseForeign(req({ origin: 'null' }), host) === 'other website');
check('cross-site is refused', refuseForeign(req({ 'sec-fetch-site': 'cross-site' }), host) === 'other website');
check('same-site is refused', refuseForeign(req({ 'sec-fetch-site': 'same-site' }), host) === 'other website');
for (const t of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', '']) check(`content type "${t || 'none'}" is refused`, refuseForeign({ headers: { 'content-type': t } }, host) === 'content type');
for (const t of ['application/json; charset=utf-8', 'audio/wav', 'image/png', 'application/octet-stream']) check(`content type "${t}" is fine`, refuseForeign({ headers: { 'content-type': t } }, host) === '');
check('the phone over Tailscale (https, its own host) is fine', refuseForeign(req({ origin: 'https://my-pc.tail1234.ts.net' }), 'my-pc.tail1234.ts.net') === '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
