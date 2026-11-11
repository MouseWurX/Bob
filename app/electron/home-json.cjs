// 1.5.201 (PC test: a home.json written by Windows PowerShell starts with a UTF-8 byte-order mark). JSON.parse refused
// it, the error was swallowed, and Bob fell back to looking in the folders above him, so a test Bob meant for its own
// home opened on the live one. Now the mark is dropped first, and a home.json that's there but still can't be read
// stops Bob with a clear message instead of a quiet fallback.
const fs = require('node:fs');

const stripBom = (t) => String(t ?? '').replace(/^﻿/, '');

// The first home.json that exists: { home, file }, or { home: {}, bad, why } when it's there but can't be read.
// None there: { home: {} }.
function readHomeFrom(files, { exists = fs.existsSync, read = (f) => fs.readFileSync(f, 'utf8') } = {}) {
  for (const f of files) {
    if (!exists(f)) continue;
    try {
      const home = JSON.parse(stripBom(read(f)));
      if (!home || typeof home !== 'object' || Array.isArray(home)) throw new Error('it isn\'t a { ... } list of settings');
      return { home, file: f };
    } catch (e) { return { home: {}, bad: f, why: e.message }; }
  }
  return { home: {} };
}

const badHomeLine = (r) => `I can't read ${r.bad} (${r.why}), so I don't know which home folder is mine. I won't guess, because I could open someone else's things.\n\nFix that file or delete it, then open me again. (Save it as plain UTF-8, for example with Notepad.)`;

module.exports = { stripBom, readHomeFrom, badHomeLine };
