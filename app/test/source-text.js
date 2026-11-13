// Source text for tests that check what Bob's code says: a file read together with the parts split out of it.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (rel) => fs.readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// server.js plus every ./something-routes.js it imports, so a check still finds a request handler after it moved out.
export function serverText() {
  const main = src('server.js');
  const parts = [...main.matchAll(/from '\.\/([\w-]+-routes)\.js'/g)].map((m) => src(`${m[1]}.js`));
  return [main, ...parts].join('\n');
}

// A file read together with the parts split out of it: every file it imports whose opening note says
// "Split out of <that file>" (for example lab.js and its lab-*-jobs.js parts).
export function withParts(rel) {
  const main = src(rel);
  const name = rel.split('/').pop();
  const parts = [...main.matchAll(/from '\.\/([\w-]+\.js)'/g)].map((m) => m[1]).filter((f, i, all) => all.indexOf(f) === i)
    .map((f) => src(f)).filter((t) => t.split('\n').slice(0, 3).join(' ').includes(`Split out of ${name}`));
  return [main, ...parts].join('\n');
}
export const labText = () => withParts('lab.js');
export const brainText = () => withParts('brain.js');
// The window's files (public/), read the same way: app.js and cellar.js with their app-*.js and cellar-*.js parts.
const pubSrc = (rel) => fs.readFileSync(fileURLToPath(new URL(`../public/${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
export function publicText(rel) {
  const main = pubSrc(rel);
  const parts = [...main.matchAll(/from '\.\/([\w-]+\.js)'/g)].map((m) => m[1]).filter((f, i, all) => all.indexOf(f) === i)
    .map((f) => pubSrc(f)).filter((t) => t.split('\n').slice(0, 3).join(' ').includes(`Split out of ${rel}`));
  return [main, ...parts].join('\n');
}
