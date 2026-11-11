// git_look (item 24, Nov 11): what changed in a project, read-only, so the coding copy stops guessing. Three looks:
// status (which files changed), changes (what changed, line by line) and history (recent commits). Nothing is changed,
// so no card. git itself must be installed (Git for Windows, Xcode tools on a Mac, git on Linux); if it isn't, the
// answer says so. A repository's own settings could start programs (fsmonitor, outside diff tools, text converters),
// so those are switched off for every look.
import { execFile } from 'node:child_process';

export const GIT_LOOKS = ['status', 'changes', 'history'];
export const MAX_GIT_OUT = 12000;
// Settings that would let a repository run something of its own, off for every call.
export const SAFE = ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=', '-c', 'core.pager=cat', '-c', 'diff.external=', '-c', 'core.sshCommand=', '--no-pager'];

export function gitArgs(what, file = '') {
  const tail = file ? ['--', String(file)] : [];
  if (what === 'status') return [...SAFE, 'status', '--short', '--branch'];
  if (what === 'changes') return [...SAFE, 'diff', '--no-ext-diff', '--no-textconv', '--no-color', 'HEAD', ...tail];
  if (what === 'history') return [...SAFE, 'log', '--no-color', '--date=short', '--pretty=format:%h %ad %an: %s', '-n', '20', ...tail];
  throw new Error(`what must be one of: ${GIT_LOOKS.join(', ')}`);
}

// run(args, cwd) -> Promise<{ code, out, err }>; passed in so tests never start git.
export function runGit(args, cwd, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } }, (e, out, err) => {
      resolve({ code: e ? (typeof e.code === 'number' ? e.code : -1) : 0, out: String(out || ''), err: String(err || (e && e.code === 'ENOENT' ? 'ENOENT' : e?.message || '')) });
    });
  });
}

export function gitAnswer(what, { code, out, err }) {
  if (/ENOENT/.test(err) && code !== 0) return 'Error: git isn\'t installed on this replicant matrix, so I can\'t look at the changes this way. Read the files instead.';
  if (code !== 0) return /not a git repository/i.test(err) ? 'Error: that folder isn\'t a git repository.' : `Error: git said: ${err.trim().slice(0, 300)}`;
  const t = out.trim();
  if (!t) return what === 'status' ? 'Nothing changed since the last commit.' : what === 'changes' ? 'No changes since the last commit.' : 'No commits yet.';
  return t.length > MAX_GIT_OUT ? `${t.slice(0, MAX_GIT_OUT)}\n(${t.length - MAX_GIT_OUT} more characters. Ask for one file to see the rest.)` : t;
}
