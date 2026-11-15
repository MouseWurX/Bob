// Nov 15 (the owner: "can we have a ranking order for how they are selected?"): How Bob picks a Bob for a job
// (src/job-pick.js, used by Lenders.pickForJob in src/share-brains.js; Settings in public/share-brains.js).
import fs from 'node:fs';
import { rankForJob, cleanJobPick, isDefaultPick, whyNot, JOB_RULES, JOB_PICK_DEFAULT } from '../src/job-pick.js';
import { Lenders, cleanSharePatch, shareView } from '../src/share-brains.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, more = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name} ${more}`); } };
const LAN = [192, 168, 1, ''].join('.'); // a home network address, made here so the privacy check sees none
const names = (list) => list.map((c) => c.bob.name).join(',');
const can = { takesJobs: true, jobs: ['pictures', 'web', 'room'] };
const C = (name, i, s, near = '') => ({ bob: { name, address: `100.64.0.${i + 1}:7777` }, s: { ...can, ...s }, i, near });

// ---- the default is exactly how it always picked: least busy, then your list order ----
{
  const list = [C('A', 0, { queue: 2 }), C('B', 1, { queue: 0 }), C('C', 2, { queue: 0 })];
  check('default: least busy first, your list order breaks the tie', names(rankForJob(list, 'pictures')) === 'B,C,A');
  check('a settings file with no pick is the default', isDefaultPick(undefined) && isDefaultPick(JOB_PICK_DEFAULT) && !isDefaultPick({ rules: ['fastest'] }));
}
// ---- who can get a job at all ----
{
  const list = [C('Gamer', 0, { why: 'gaming' }), C('Busy', 1, { jobsBusy: 'gaming' }), C('NoJobs', 2, { takesJobs: false }), C('NoPaint', 3, { jobs: ['web'] }), C('Down', 4, { jobsDownUntil: 2e12 }), C('Ok', 5, {})];
  check('a gaming Bob, a full one, one who takes no jobs or can\'t do it, or just said no: never picked', names(rankForJob(list, 'pictures', { now: 1e12 })) === 'Ok');
  check('gaming says gaming', whyNot(list[0], 'pictures') === 'gaming' && whyNot(list[1], 'pictures') === 'gaming');
  check('a group job needs a Bob who takes group jobs', names(rankForJob([C('X', 0, { jobs: ['pictures'] }), C('Y', 1, {})], 'pictures', { room: true })) === 'Y');
}
// ---- rules in the owner's order ----
{
  const list = [
    C('Phone', 0, { queue: 0, speed: 40, device: 'phone', ms: 3 }, `${LAN}5:7777`),
    C('Laptop', 1, { queue: 1, speed: 60, room: { vramGB: 6 }, ms: 30 }),
    C('PC', 2, { queue: 1, speed: 120, room: { vramGB: 16 }, ms: 9 }, `${LAN}7:7777`),
    C('Go', 3, { queue: 0, speed: 20, room: { vramGB: 12 }, ms: 4 }, `${LAN}8:7777`)
  ];
  check('Fastest first', names(rankForJob(list, 'pictures', { pick: { rules: ['fastest'] } })) === 'PC,Laptop,Phone,Go');
  check('Biggest graphics card first', names(rankForJob(list, 'pictures', { pick: { rules: ['biggest'] } })) === 'PC,Go,Laptop,Phone');
  check('Closest: home network before Tailscale, then the quickest answer', names(rankForJob(list, 'pictures', { pick: { rules: ['closest'] } })) === 'Phone,Go,PC,Laptop');
  check('Computers before phones', names(rankForJob(list, 'pictures', { pick: { rules: ['computers'] } })) === 'Laptop,PC,Go,Phone');
  check('each rule only settles a tie left by the one above: least busy, then fastest', names(rankForJob(list, 'pictures', { pick: { rules: ['leastBusy', 'fastest'] } })) === 'Phone,Go,PC,Laptop');
  check('the order of the rules matters: fastest, then least busy', names(rankForJob(list, 'pictures', { pick: { rules: ['fastest', 'leastBusy'] } })).startsWith('PC,'));
  check('every rule switched off: your list order only', names(rankForJob(list, 'pictures', { pick: { rules: [] } })) === 'Phone,Laptop,PC,Go');
  check('Computers only leaves the phone out', !names(rankForJob(list, 'pictures', { pick: { rules: ['leastBusy'], computersOnly: true } })).includes('Phone'));
  check('Home network only leaves the Tailscale-only Bob out', names(rankForJob(list, 'pictures', { pick: { rules: [], homeOnly: true } })) === 'Phone,PC,Go');
  check('Jobs he can already have: fewer than 1 skips the ones with a job', names(rankForJob(list, 'pictures', { pick: { rules: [], maxQueue: 1 } })) === 'Phone,Go');
  check('First choice for a kind goes first, even if busier', names(rankForJob(list, 'pictures', { pick: { rules: ['leastBusy'], first: { pictures: '100.64.0.2:7777' } } })).startsWith('Laptop,'));
  check('first choice for another kind changes nothing here', names(rankForJob(list, 'pictures', { pick: { rules: ['leastBusy'], first: { web: '100.64.0.2:7777' } } })).startsWith('Phone,'));
  check('a first choice who can\'t take it now: the order picks', names(rankForJob(list.map((c) => (c.bob.name === 'Laptop' ? { ...c, s: { ...c.s, jobsBusy: 'busy' } } : c)), 'pictures', { pick: { rules: ['leastBusy'], first: { pictures: '100.64.0.2:7777' } } })).startsWith('Phone,'));
}
// ---- cleaning what's saved or sent ----
{
  const c = cleanJobPick({ rules: ['fastest', 'nope', 'fastest', 'closest'], homeOnly: 'yes', maxQueue: 7, first: { pictures: 'x', bogus: 'y' } }, { bobs: [{ address: 'x' }] });
  check('unknown rules dropped, each once, order kept', c.rules.join() === 'fastest,closest');
  check('only real switches and caps', c.homeOnly === false && c.maxQueue === 0);
  check('first choice only for real kinds and paired Bobs', c.first.pictures === 'x' && !('bogus' in c.first) && !('pictures' in cleanJobPick({ first: { pictures: 'gone' } }, { bobs: [{ address: 'x' }] }).first));
  check('five rules on offer', JOB_RULES.join() === 'leastBusy,fastest,biggest,closest,computers');
}
// ---- Settings: opt-in, saved only when changed ----
{
  const base = { share: { borrow: { jobs: true, bobs: [{ name: 'PC', address: '100.64.0.9:7777', passcode: 'abcdef' }] } } };
  check('nothing saved until you change it, and Settings shows the default', !('pick' in cleanSharePatch(base, { when: 'gaming' }).share.borrow) && shareView(base).borrow.pick.rules.join() === 'leastBusy');
  const a = cleanSharePatch(base, { jobPick: { rules: ['fastest', 'leastBusy'] } });
  check('a new order is saved', a.share.borrow.pick.rules.join() === 'fastest,leastBusy');
  const b = cleanSharePatch({ share: a.share }, { jobPick: { homeOnly: true } });
  check('one change keeps the rest', b.share.borrow.pick.rules.join() === 'fastest,leastBusy' && b.share.borrow.pick.homeOnly === true);
  const back = cleanSharePatch({ share: a.share }, { jobPick: { rules: ['leastBusy'] } });
  check('put back as it was: nothing saved again', !('pick' in back.share.borrow));
  check('other changes keep the pick', cleanSharePatch({ share: b.share }, { when: 'busy' }).share.borrow.pick.homeOnly === true);
}
// ---- Lenders.pickForJob uses it, and Home network only never falls back to Tailscale ----
{
  const cfg = { share: { borrow: { jobs: true, bobs: [{ name: 'Slow', address: '100.64.0.1:7777', passcode: 'abcdef' }, { name: 'Quick', address: '100.64.0.2:7777', passcode: 'abcdef' }] } } };
  const L = new Lenders(cfg, { fetchFn: async () => { throw new Error('no network in tests'); }, home: () => [] });
  const st = { '100.64.0.1:7777': { ...can, queue: 0, speed: 10 }, '100.64.0.2:7777': { ...can, queue: 0, speed: 90 } };
  L.hello = async (b) => st[b.address];
  const p1 = await L.pickForJob('pictures');
  check('Lenders: default picks by your list order on a tie', p1?.name === 'Slow');
  cfg.share.borrow.pick = { rules: ['fastest'] };
  L.inUse.clear();
  const p2 = await L.pickForJob('pictures');
  check('Lenders: Fastest picks the quick one', p2?.name === 'Quick' && !p2.homeOnly);
  cfg.share.borrow.pick = { rules: [], homeOnly: true };
  L.inUse.clear();
  check('Lenders: Home network only, nobody on it: nobody', (await L.pickForJob('pictures')) === null);
  L.near.set('100.64.0.2:7777', `${LAN}20:7777`);
  L.inUse.clear();
  const p3 = await L.pickForJob('pictures');
  check('Lenders: Home network only picks the one with a home door, marked', p3?.name === 'Quick' && p3.homeOnly === true);
  let tried = [];
  L.callAt = async (bob, at) => { tried.push(at); throw new Error('ECONNREFUSED'); };
  let threw = false; try { await L.call(p3, '/api/guest/jobs', { method: 'POST', body: {} }); } catch { threw = true; }
  check('a home-only job never goes over Tailscale when his home door fails', threw && tried.join() === `${LAN}20:7777`);
  const at = { name: 'Home', address: `${LAN}30:7777`, homeOnly: true }; tried = [];
  L.callAt = async (bob, a) => { tried.push(a); return { ok: true }; };
  check('a Bob paired by his home address is reachable home-only', (await L.call(at, '/x')).ok && tried.join() === `${LAN}30:7777`);
}
// ---- Settings page and Help ----
{
  const ui = fs.readFileSync(new URL('../public/share-brains.js', import.meta.url), 'utf8');
  check('Settings: every rule, ↑ ↓ with names for screen readers, the limits and first choice', ['data-pick-rule', 'data-pick-up', 'data-pick-down', 'aria-label="Move', 'data-pick-home', 'data-pick-computers', 'data-pick-maxq', 'data-pick-first'].every((x) => ui.includes(x)));
  check('Settings: shown even with Send jobs off (it says when it\'s used)', /used once <strong>Send jobs<\/strong> is on/.test(ui));
  const help = JSON.stringify(HELP);
  check('Help explains it in Bob\'s voice', ['How Bob picks a Bob for a job', 'Home network only', 'Computers only', 'Jobs he can already have', 'First choice for each kind'].every((x) => help.includes(x)) && /settles a tie/.test(help));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
