// Which Bob the Lab borrows its prompt and tools from (Nov 13). The v5 lessons, the 120B interview and its A/B were run
// against a 9-day-old copy of Bob (1.5.108) on the PC, so they taught and scored tool wording Bob no longer has.
// Now every lesson run and tool score:
//   - reads the borrowed Bob's version (its package.json) and commit (its .git, read as files: no git needed);
//   - refuses when that Bob is more than MAX_BEHIND releases behind the Lab's own copy, unless --allow-old-bob;
//   - stamps { version, commit } as bob_src on the tool lists, the lessons and the scores.
import fs from 'node:fs';
import path from 'node:path';

export const MAX_BEHIND = 3;

function readCommit(dir) {
  for (let d = path.resolve(dir), i = 0; i < 4; i++, d = path.dirname(d)) {
    const git = path.join(d, '.git');
    try {
      let gdir = git;
      if (fs.statSync(git).isFile()) gdir = path.resolve(d, fs.readFileSync(git, 'utf8').replace(/^gitdir:\s*/, '').trim()); // a worktree
      const head = fs.readFileSync(path.join(gdir, 'HEAD'), 'utf8').trim();
      if (!head.startsWith('ref:')) return head.slice(0, 12);
      const ref = head.slice(4).trim();
      try { return fs.readFileSync(path.join(gdir, ref), 'utf8').trim().slice(0, 12); } catch {}
      const packed = fs.readFileSync(path.join(gdir, 'packed-refs'), 'utf8').replace(/\r\n/g, '\n').split('\n').find((l) => l.endsWith(` ${ref}`));
      return packed ? packed.split(' ')[0].slice(0, 12) : '';
    } catch {}
  }
  return '';
}
export function bobSource(dir) {
  let version = '';
  try { version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version || ''; } catch {}
  return { version, commit: readCommit(dir) };
}
// "1.5.221" -> how many releases b is behind a (same major.minor counts patches; another minor counts as far behind).
export function releasesBehind(a, b) {
  const p = (v) => String(v || '').split('.').map((x) => parseInt(x, 10) || 0);
  const [A, B] = [p(a), p(b)];
  if (!a || !b) return 0;
  if (A[0] !== B[0] || A[1] !== B[1]) return (A[0] * 1000 + A[1]) > (B[0] * 1000 + B[1]) ? Infinity : 0;
  return Math.max(0, A[2] - B[2]);
}
// Throws (with what to do) when the borrowed Bob is too old; otherwise returns its stamp.
export function checkBobSource(bobDir, labAppDir, { allowOld = false, maxBehind = MAX_BEHIND, warn = console.warn } = {}) {
  const src = bobSource(bobDir), lab = bobSource(labAppDir);
  const behind = releasesBehind(lab.version, src.version);
  if (behind > maxBehind) {
    const msg = `The Bob at ${bobDir} is ${src.version || 'an unknown version'}${src.commit ? ` (${src.commit})` : ''}, ${behind === Infinity ? 'a whole version' : `${behind} releases`} behind this Lab's Bob ${lab.version}. Lessons and scores would use tool wording Bob no longer has. Point --bob at a fresh copy of Bob, or pass --allow-old-bob to do it anyway.`;
    if (!allowOld) throw new Error(msg);
    warn(`WARNING: ${msg}`);
  }
  return { ...src, behind: behind === Infinity ? -1 : behind };
}
