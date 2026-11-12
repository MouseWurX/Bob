// Source text for tests that check what Bob's code says: server.js read together with the route files split out of it.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (rel) => fs.readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// server.js plus every ./something-routes.js it imports, so a check still finds a request handler after it moved out.
export function serverText() {
  const main = src('server.js');
  const parts = [...main.matchAll(/from '\.\/([\w-]+-routes)\.js'/g)].map((m) => src(`${m[1]}.js`));
  return [main, ...parts].join('\n');
}
