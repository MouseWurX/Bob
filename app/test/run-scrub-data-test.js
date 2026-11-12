// scrub-data (model-lab): the privacy scrub for anything that leaves the PC. Made-up names only ("zorvik" as the user,
// "box7" as the PC); the real computer is never read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scrubber, scrubValue, findLeaks, privateWordsFrom } from '../model-lab/scrub-data.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-scrub-'));
const mk = () => scrubber({ user: 'zorvik', host: 'box7', words: ['zorvikdrive => mydrive', 'Secret Place'] });
const S = (s) => scrubValue(s, mk());

check('the user folder', S('E:\\Users\\zorvik\\Desktop') === 'E:\\Users\\you\\Desktop');
check('someone else\'s user folder too', S('E:\\Users\\alice\\x and /home/bob/y') === 'E:\\Users\\you\\x and /home/you/y', S('E:\\Users\\alice\\x and /home/bob/y'));
check('the bare name in a folder listing (real line breaks)', !/zorvik/i.test(S('Users\nzorvik\nDesktop')));
check('the bare name after a written-out \\n (the leak that got through)', !/zorvik/i.test(S('Users\\nzorvik\\nDesktop')), S('Users\\nzorvik\\nDesktop'));
check('the name in file names and any case', S('ZORVIK.vbs zorvik.txt') === 'you.vbs you.txt');
check('a private word with its own stand-in, longest first', S('D:\\zorvikdrive\\x') === 'D:\\mydrive\\x', S('D:\\zorvikdrive\\x'));
check('a two-word private name', S('in secret place now') === 'in private now');
check('the PC name where it is a host', S('\\\\box7\\share, box7.local, box7:7777, http://box7/x') === '\\\\my-pc\\share, my-pc.local, my-pc:7777, http://my-pc/x', S('\\\\box7\\share, box7.local, box7:7777, http://box7/x'));
check('a short PC name as an ordinary word stays (Bob\'s "NPC")', scrubValue('As an NPC inside a PC', scrubber({ host: 'npc' })) === 'As an NPC inside a PC');
const lan = [192, 168, 4, 9].join('.'), mail = ['z', 'mail.org'].join('@');
check('home-network and Tailscale addresses, e-mails, keys', S(`${lan} 100.101.2.3 ${mail} hf_${'a'.repeat(30)}`) === `${[192, 168, 0, 10].join('.')} 100.64.0.1 ${['you', 'example.com'].join('@')} [key removed]`);

const odds = [{ t: 'C:\\Users\\', p: -0.1, top: [{ t: 'C', p: -1 }] }, { t: 'zor', p: -0.2, top: [{ t: 'zor', p: -0.2 }, { t: 'zork', p: -3 }] }, { t: 'vik', p: -0.1, top: [{ t: 'vik', p: -0.1 }] }, { t: '\\x', p: -0.1, top: [] }];
const so = S(odds);
check('a name spread over odds tokens comes out', !/zor|vik/i.test(JSON.stringify(so)), JSON.stringify(so));
check('the odds keep their length and text around it', so.length === 4 && so.map((x) => x.t).join('') === 'C:\\Users\\you\\x');
check('the other choices at those steps are dropped', so[1].top.length === 0 && so[2].top.length === 0 && so[3].t === '\\x');
check('the server\'s own odds shape too', !/zor|vik/i.test(JSON.stringify(S([{ token: 'zor', top_logprobs: [{ token: 'x' }] }, { token: 'vik', top_logprobs: [] }]))));

{ const k = scrubber({ user: 'zorv', keep: ['zorvy'] });
  check('an ordinary word that holds the name stays ("keep:")', scrubValue('a zorvy hinge, zorv.txt, Zorv', k) === 'a zorvy hinge, you.txt, you', scrubValue('a zorvy hinge, zorv.txt, Zorv', k)); }
check('a cut-off name after a user folder (grader notes clipped at 160)', S('see E:\\Users\\zo\u2026') === 'see E:\\Users\\you');
const sc = mk();
check('the check finds a name split over tokens', findLeaks(odds, sc).some((l) => /odds joined/.test(l)));
check('the check finds it with gaps between the letters', findLeaks([{ t: 'zo' }, { t: '-r' }, { t: 'vik' }], sc).length > 0);
check('the check shows names masked, never in full', !findLeaks('zorvik', sc).join().includes('zorvik'));
check('the check passes clean text', findLeaks(S({ a: 'Users\\nzorvik', b: odds }), sc).length === 0);

// private words from a file outside the repo
fs.mkdirSync(path.join(tmp, 'agent', 'bob-model-lab'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'agent', 'bob-model-lab', 'private-words.txt'), 'hushword\r\n# a note\nother => gone\n');
check('private words: the install file, notes skipped, line ends stripped', JSON.stringify(privateWordsFrom({ words: 'a1,b2', agentDir: path.join(tmp, 'agent') })) === '["a1","b2","hushword","other => gone"]');

// the command: a copy is scrubbed and checked, the original untouched; --check on the original refuses
const src = path.join(tmp, 'in');
fs.mkdirSync(path.join(src, 'zorvik-runs'), { recursive: true });
fs.writeFileSync(path.join(src, 'zorvik-runs', 'a.jsonl'), JSON.stringify({ m: 'Users\nzorvik\nDesktop', odds }) + '\r\n' + JSON.stringify({ m: 'fine' }) + '\n');
fs.writeFileSync(path.join(src, 'README.md'), 'Made on \\\\box7\\share by ZORVIK.\n');
const before = fs.readFileSync(path.join(src, 'README.md'), 'utf8');
const run = (...a) => spawnSync(process.execPath, [path.join(here, '..', 'model-lab', 'scrub-data.mjs'), '--user', 'zorvik', '--host', 'box7', ...a], { encoding: 'utf8', env: { ...process.env, BOB_AGENT_DIR: path.join(tmp, 'agent') } });
const r1 = run('--in', src, '--out', path.join(tmp, 'out'));
check('the command scrubs a copy and passes its own check', r1.status === 0, r1.stderr + r1.stdout);
const outText = fs.readdirSync(path.join(tmp, 'out'), { recursive: true }).join() + fs.readFileSync(path.join(tmp, 'out', 'README.md'), 'utf8') + fs.readFileSync(path.join(tmp, 'out', 'you-runs', 'a.jsonl'), 'utf8');
check('names gone from text, odds and folder names', !/zorvik|box7/i.test(outText), outText.slice(0, 200));
check('the original is untouched', fs.readFileSync(path.join(src, 'README.md'), 'utf8') === before && fs.existsSync(path.join(src, 'zorvik-runs')));
check('checking the original refuses (exit 2)', run('--in', src, '--check').status === 2);
check('a private word from the install file is caught', (fs.writeFileSync(path.join(tmp, 'out', 'n.txt'), 'the hushword'), run('--in', path.join(tmp, 'out'), '--check').status === 2));
check('the copy may not go inside the original', run('--in', src, '--out', path.join(src, 'x')).status === 1);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
