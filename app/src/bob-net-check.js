// 1.5.185 Bob-Net: a bigger Bob checks the harder jobs. Both halves are off unless you turn them on.
//
// At High and Extreme effort Bob's reviewer copy checks the answer (moot.js). On a small replicant matrix (a handheld
// with a 4B main brain and a 7B Review brain) that check is only as good as the 7B. With these on, the check goes to
// whichever of your other Bobs has a bigger Review brain and is free (a desktop with a 27B or 35B), and comes back here.
//
// "Review for other Bobs" (the lender, share.lendChecks): through the door "Let my other replicant
//   matrices in" only, the same lend protocol as Lend my brain (/api/lend/chat with kind 'check'). The lender thinks on
//   his Review brain (Review slot, else Deep thinking, else his main brain), words in, words and tool calls out. Nothing
//   runs there: the reviewer's file reading runs here, on the Bob whose job it is. Nothing is kept. He says no while
//   gaming or busy with his own job.
// "Review by a bigger Bob" (the asker, share.borrow.checks): only at High and Extreme, only to a Bob
//   whose Review brain is bigger than this one's (by its weights, in billions, from the brain's name). High goes to the
//   first bigger one in your list order; Extreme goes to the biggest. If none is free, or he stops answering, this Bob
//   checks it himself like always.
import { paramsOf } from './own-models.js';
import { careful, cleanEffort } from './moot.js';
import { doorOpen, REPLY_ROOM } from './share-brains.js';

export const CHECK_FIRST_WORD_MAX_MS = 180000; // a big brain loading, then thinking hard, before its first word
export const CHECK_DOWN_MS = 60000; // a Bob that couldn't check isn't asked again for a minute

// How big a brain is, in billions of weights, from its name: "qwen3-4b" 4, "qwen2.5-coder-7b" 7, "qwen3.6:35b-a3b" 35,
// "28Bob-Riker-Q4_K_M" 28 (Bob's own brains say it in front of "Bob"). null when the name doesn't say.
export function brainBillions(name) {
  const s = String(name || '');
  if (!s) return null;
  const p = paramsOf({ name: s });
  if (p) return p;
  const m = s.toLowerCase().match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)bob(?![0-9])/);
  return m ? Number(m[1]) : null;
}

// ---------- The lender ----------
export const checkLendOn = (cfg) => cfg.share?.lendChecks === true && doorOpen(cfg);

// Why this Bob won't check for another right now, or ''.
export function checkRefusal(brain, { currentSession, checkBrain }) {
  if (!checkLendOn(brain.cfg)) return 'off';
  if (currentSession(brain.cfg).id === 'light') return 'gaming';
  if (brain.lending) return 'busy';
  if (brain.turns?.size || brain.queue?.some?.((j) => j.state === 'working')) return 'busy';
  if (!checkBrain(brain)) return 'no brain';
  return '';
}

// What the hello says about checking: { checks, checkBrain, checkParams, checkCtx }. Nothing when it's off.
export function checkHello(brain, deps, label = (m) => m) {
  if (!checkLendOn(brain.cfg)) return {};
  const why = checkRefusal(brain, deps);
  const c = deps.checkBrain(brain);
  return { checks: !why, checkBusy: why || undefined, checkBrain: c ? label(c.model) : '', checkParams: c ? brainBillions(c.model) || 0 : 0, checkCtx: c?.ctx || 0 };
}

// What an asker keeps from a hello.
export function cleanCheck(j) {
  const n = (x, max) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Math.min(Number(x), max) : 0);
  if (j?.checks !== true && typeof j?.checkBusy !== 'string') return null;
  return { free: j.checks === true, busy: typeof j.checkBusy === 'string' ? j.checkBusy.slice(0, 20) : '', brain: String(j.checkBrain || '').slice(0, 60), params: n(j.checkParams, 10000), ctx: n(j.checkCtx, 1048576) };
}

// ---------- The asker ----------
export const wantsBorrowedCheck = (cfg, job) => cfg.share?.borrow?.checks === true && (cfg.share?.borrow?.bobs || []).length > 0 && careful(job) && !job?.side;

// The Bob to check this job, or null. `mine`: this Bob's own Review brain, in billions (null: unknown, so no Bob can be
// shown to be bigger and the check stays here). High: the first bigger one in your list. Extreme: the biggest.
export async function pickChecker(L, { effort, mine, tokens = 0 }) {
  if (!(mine > 0)) return null;
  const list = L.bobs().filter((b) => !L.busyHere(b.address));
  const seen = await Promise.all(list.map((b) => L.hello(b).catch(() => ({}))));
  const now = L.now();
  const can = list.map((bob, i) => ({ bob, c: seen[i]?.check, s: seen[i], i }))
    .filter(({ c, s }) => c?.free && c.params > mine && !(s.checkDownUntil > now) && (!c.ctx || !tokens || tokens + REPLY_ROOM <= c.ctx));
  if (!can.length) return null;
  if (cleanEffort(effort) === 'extreme') can.sort((a, b) => (b.c.params - a.c.params) || (a.i - b.i));
  else can.sort((a, b) => a.i - b.i);
  const { bob, c } = can[0];
  L.hold(bob.address);
  return { ...bob, check: c };
}

// He couldn't check this one: ask him again in a minute. His quick-reply lending isn't touched.
export function checkDown(L, bob, now = L.now()) {
  const s = L.state.get(bob.address) || { ok: false, at: now };
  s.checkDownUntil = now + CHECK_DOWN_MS;
  L.state.set(bob.address, s);
}

// The chat lines, in Bob's voice.
export const checkingOnLine = (copy, bob) => `🛰 Moot: ${copy} checks it on ${bob.name}, whose Review brain is bigger${bob.check?.brain ? ` (${bob.check.brain})` : ''}. If ${bob.name} can't, I check it here.`;
export const checkBackLine = (bob, why) => `🛰 ${bob.name} couldn't finish the check (${why}), so I'm checking it here.`;
