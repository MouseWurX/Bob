// 1.5.210: Help as pages. Questions and small pages fold into the page they belong to (FOLD), the window lists
// pages instead of 400 entries, a Start here page opens first, and the user guide is sorted by jobs.
import fs from 'node:fs';
import { HELP, FOLD, helpHome } from '../public/help-content.js';
import { helpHtml, helpPages } from '../public/help.js';
import { findHelp } from '../src/self-help.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ids = new Set(HELP.map((e) => e.id));

// ---- folding ----
{
  const bad = Object.entries(FOLD).filter(([k, v]) => !ids.has(k) || !ids.has(v));
  check('every folded entry and every page it folds into exists', bad.length === 0, JSON.stringify(bad));
  const loose = HELP.filter((e) => e.group === 'FAQ' && !FOLD[e.id]).map((e) => e.id);
  check('every question sits in the page it is about', loose.length === 0, loose.join(', '));
  check('every entry ends on a page that is not folded', HELP.every((e) => !FOLD[helpHome(e.id)]));
  check('Start here and the Glossary are pages of their own', !FOLD['start-here'] && !FOLD.glossary);
  const pages = helpPages();
  check('the contents list is short (under 80 pages, from over 400 entries)', pages.length < 80 && HELP.length > 400, `${pages.length} pages`);
  check('one page lists every question', pages.some((p) => p.id === 'all-questions' && HELP.filter((e) => e.group === 'FAQ').every((e) => p.html.includes(`data-helpgo="${e.id}"`))));
}

// ---- the window ----
{
  const html = helpHtml();
  const missing = HELP.filter((e) => (html.match(new RegExp(`id="help-${e.id}"`, 'g')) || []).length !== 1).map((e) => e.id);
  check('every entry still has exactly one anchor, so "?" buttons and links land', missing.length === 0, missing.slice(0, 10).join(', '));
  check('Start here comes first', html.indexOf('id="help-start-here"') < html.indexOf('id="help-start"') && /<nav[^]*?<strong>Start here<\/strong>/.test(html));
  check('folded entries start closed', !/<details class="help-sub"[^>]* open/.test(html));
  check('questions sit under a Questions heading in their page', /<h3>Adventure: I run a tabletop game<\/h3>[^]*?<h4>Questions<\/h4>[^]*?id="help-faq-adventure-alone"/.test(html));
  const hit = helpHtml('enemies tough');
  check('search shows the page with the matching question open', /id="help-faq-adventure-enemies" open/.test(hit) && /id="help-adventure"/.test(hit));
  check('search with no match still says so', /Nothing in Help matches/.test(helpHtml('zzzqqq')));
  check('the window opens a folded entry when it jumps to it', /d\.open = true/.test(read('public/help.js')));
  check('folded entries can be reached by keyboard and are styled', /\.help-sub > summary:focus-visible/.test(read('public/style.css')));
}

// ---- Start here ----
{
  const s = HELP.find((e) => e.id === 'start-here');
  check('Start here is the first entry, in its own group', HELP[0] === s && s.group === 'Start here');
  const links = [...s.html.matchAll(/data-helpgo="([^"]+)"/g)].map((m) => m[1]);
  check('every Start here link goes to a page', links.length >= 10 && links.every((id) => ids.has(id) && !FOLD[id]), links.filter((id) => !ids.has(id) || FOLD[id]).join(', '));
  check('Start here is short and in Bob\'s voice', s.html.length < 3000 && /I'm Bob/.test(s.html) && /ask me/.test(s.html));
  check('Bob\'s own Help search still reads entries one by one (folding is display only)', findHelp('Can I play Adventure with no other Bobs').some((e) => e.id === 'faq-adventure-alone'));
}

// ---- the user guide ----
{
  const g = read('docs/USER-GUIDE.md');
  check('the guide opens with a job table and a Start here', /\*\*What do you want to do\?\*\*/.test(g) && /\| I want to… \| Go to \|/.test(g) && /^## Start here$/m.test(g));
  const jobs = ['## Set Bob up', '## Chat with Bob', '## Write and fix code', '## Make a picture, a clip or a song', '## Work with documents and files', '## Let Bob do things on your computer', '## Play', '## When something goes wrong'];
  check('the guide is sorted by jobs', jobs.every((h) => g.includes(h)), jobs.filter((h) => !g.includes(h)).join(', '));
  const anchors = [...g.matchAll(/\]\(#([a-z0-9-]+)\)/g)].map((m) => m[1]);
  const heads = new Set([...g.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1].toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s/g, '-')));
  check('every link in the guide\'s job table goes to a heading', anchors.every((a) => heads.has(a)), anchors.filter((a) => !heads.has(a)).join(', '));
  check('the guide is shorter (under 50 KB)', g.length < 50000, `${g.length}`);
  check('no book name in the guide or Help', !/bobiverse/i.test(g + read('public/help-content.js')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
