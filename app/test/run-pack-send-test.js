// Pages sent packed (gzip) when asked: smaller, the same once unpacked, kept until the file changes.
import zlib from 'node:zlib';
import { makePacker } from '../src/pack-send.js';

let pass = 0, fail = 0;
const ok = (name, c) => { if (c) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

let packs = 0;
const pack = makePacker({ max: 2, gzip: (b) => { packs++; return zlib.gzipSync(b); } });
const js = Buffer.from('export const x = 1;\n'.repeat(400));
const gz = pack('gzip, deflate, br', 'a.js', js, 'text/javascript; charset=utf-8');
ok('packs a script when the browser asks', gz && gz.length < js.length / 4);
ok('unpacks to the same bytes', gz && zlib.gunzipSync(gz).equals(js));
ok('kept: packing again costs nothing', pack('gzip', 'a.js', js, 'text/javascript') === gz && packs === 1);
ok('a changed file is packed again', pack('gzip', 'a.js', Buffer.concat([js, Buffer.from('//')]), 'text/javascript') !== gz && packs === 2);
ok('nothing when the browser does not ask', pack('', 'a.js', js, 'text/javascript') === null);
ok('pictures are left alone', pack('gzip', 'a.png', js, 'image/png') === null);
ok('tiny files are left alone', pack('gzip', 'b.js', Buffer.from('x'), 'text/javascript') === null);
pack('gzip', 'c.js', js, 'text/javascript'); pack('gzip', 'd.js', js, 'text/javascript');
const before = packs; pack('gzip', 'c.js', js, 'text/javascript');
ok('keeps only the newest few', packs === before);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
