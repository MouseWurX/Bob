// npm test's "only what changed" mode: which test suites can see a set of changed files.
// A suite sees: every file it imports, and everything those import in turn; every file a test file names in its text
// ('src/brain.js', "catalog.json"), since many tests read source text or start a script by its path, and that script's
// imports too; every data file (not code) that the code it runs names, such as catalog.json; and, for a file that lists
// a folder (readdirSync), every file in each top folder it names. Matching by file name over-counts on purpose: running
// a suite that did not need to run costs seconds, skipping one that did lets a broken change through.
// Everything here works on plain lists and a read function, so the test passes fakes in (run-changed-tests-test.js).

// A change to any of these can break any suite, so it runs them all.
export const RUN_ALL_FILES = ['app/package.json', 'app/package-lock.json', 'app/test/run-all.js', 'app/test/changed-suites.js'];

const TEXT = /\.(c?m?js|json|html?|css|md|txt|py|ps1|cmd|bat|sh|ya?ml|xml|svg|toml|ini|cfg|patch|tsv|csv)$/i;
// Files at the top of the repository (README.md, CHANGELOG.md ...) count only for a test that names them itself: Bob's
// code only checks they are there, and CHANGELOG.md changes with every push.
const TOP_DOCS = /^[^/]+$/;
const APP_CODE = /^app\/(src|public)\//; // Bob's own code, as opposed to build tools (installer/, android/tools/ ...)
const CODE = /\.(c?m?js)$/i;
const NAME = /[\w@+-][\w.@+-]*\.[A-Za-z]\w*/g; // brain.js, catalog.json, lamplight-vulkan.json ...
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"`])([^'"`\n]+)\1/g;
const STARTS = /\b(?:spawn|spawnSync|fork|execFile|execFileSync|execSync|exec)\s*\(/;
const base = (f) => f.slice(f.lastIndexOf('/') + 1);
const dirOf = (f) => f.slice(0, Math.max(0, f.lastIndexOf('/')));
const topOf = (f) => { const p = f.split('/'); return p[0] === 'app' && p.length > 2 ? `app/${p[1]}` : (p.length > 1 ? p[0] : ''); };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function join(dir, rel) {
  const out = dir ? dir.split('/') : [];
  for (const p of rel.split('/')) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return out.join('/');
}

// files: repository paths with forward slashes ("app/src/brain.js"). read(file) gives its text, or '' for a binary or
// missing one. extraNames: paths that are gone (deleted files) but may still be named. Returns, per file:
// { imports: Set, named: Set, scanned: Set, starts: true when it can start another program }.
export function linkFiles(files, read, extraNames = []) {
  const known = new Set(files);
  const byName = new Map();
  for (const f of [...files, ...extraNames]) { const b = base(f); if (!byName.has(b)) byName.set(b, new Set()); byName.get(b).add(f); }
  const tops = new Map();
  for (const f of files) { const t = topOf(f); if (!t) continue; if (!tops.has(t)) tops.set(t, []); tops.get(t).push(f); }
  const links = new Map();
  for (const f of files) {
    const imports = new Set(); const named = new Set(); const scanned = new Set();
    if (TEXT.test(f)) {
      const text = String(read(f) || '');
      if (CODE.test(f)) for (const m of text.matchAll(SPEC)) {
        if (!m[2].startsWith('.')) continue;
        const to = join(dirOf(f), m[2].split('?')[0]);
        if (known.has(to)) imports.add(to); else if (known.has(`${to}.js`)) imports.add(`${to}.js`);
      }
      for (const m of text.matchAll(NAME)) { const hit = byName.get(base(m[0])); if (hit) for (const g of hit) if (g !== f) named.add(g); }
      // What a folder listing reads: the 160 characters after each readdirSync( or opendirSync(.
      const lists = [...text.matchAll(/\b(?:readdirSync|opendirSync|readdir)\s*\(/g)].map((m) => text.slice(m.index, m.index + 160)).join('\n');
      if (lists) for (const [t, list] of tops) {
        if (new RegExp(`['"\`/]${esc(t.split('/').pop())}['"\`/]`).test(lists)) for (const g of list) if (g !== f) scanned.add(g);
      }
    }
    links.set(f, { imports, named, scanned, starts: CODE.test(f) && STARTS.test(String(read(f) || '')) });
  }
  return links;
}

// Every file a suite can see (see the top of this file). Code a test only reads as text counts with the files it
// imports directly (source-text.js reads a file with its split-out parts), but those are not followed further. Code a
// test starts (the test spawns, forks or execs something), and test/ helpers a test names, are followed like imports.
// Bob's own code never starts another of its .js files with Node, so code it names is not followed.
export function reach(links, start, runs = () => true) {
  const seen = new Set([start]); const followed = new Set([start]); const todo = [start];
  const follow = (g) => { seen.add(g); if (CODE.test(g) && !followed.has(g)) { followed.add(g); todo.push(g); } };
  while (todo.length) {
    const f = todo.pop(); const l = links.get(f); if (!l) continue;
    const inTests = f.startsWith('app/test/');
    for (const g of l.imports) follow(g);
    for (const g of l.named) {
      if (!CODE.test(g)) { if (inTests || !TOP_DOCS.test(g)) seen.add(g); }
      else if (inTests && (g.startsWith('app/test/') || runs(f))) follow(g);
      else if (inTests) { seen.add(g); for (const h of links.get(g)?.imports || []) seen.add(h); }
      else if (!APP_CODE.test(f)) seen.add(g); // build tools read or copy the code they name (make-shared.mjs copies the phone screen)
    }
    for (const g of l.scanned) seen.add(g);
  }
  return seen;
}

// suites: app-relative ("test/run-x-test.js"), as package.json lists them. changed: repository paths, or null when git
// could not say. Returns { all: true, why } when everything must run, else { all: false, picked: [suites, in list order],
// unseen: [changed files no suite sees] }.
export function pickSuites({ suites, files, read, changed }) {
  if (!Array.isArray(changed)) return { all: true, why: 'could not tell what changed' };
  const hit = changed.find((c) => RUN_ALL_FILES.includes(c));
  if (hit) return { all: true, why: `${hit} changed` };
  if (!changed.length) return { all: false, picked: [], unseen: [] };
  const links = linkFiles(files, read, changed.filter((c) => !files.includes(c)));
  const seenBy = new Set(); const picked = [];
  for (const s of suites) {
    const sees = reach(links, `app/${s}`, (f) => links.get(f)?.starts);
    let any = false;
    for (const c of changed) if (sees.has(c)) { any = true; seenBy.add(c); }
    if (any) picked.push(s);
  }
  return { all: false, picked, unseen: changed.filter((c) => !seenBy.has(c)) };
}
