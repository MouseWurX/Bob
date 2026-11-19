// The speed-setting scorer (model-lab/score-settings.mjs, method doc Addendum 48, revised). Pure: no files, card or clock.
import { jobTime, blendedJobTime, gates, scoreUse, rank, ANSWER } from '../model-lab/score-settings.mjs';
let failures = 0, passes = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (ok) passes++; else failures++; };
const near = (a, b) => Math.abs(a - b) < 0.05;

check(near(jobTime(9.3, 100.7, 300), 12.3) && near(jobTime(128.7, 43.1, 300), 135.7), 'job time reproduces the table (12.3 s at 32K, 135.7 s at 256K)');
check(near(jobTime(123.5, 33.6, 100), 126.5) && near(jobTime(128.7, 43.1, 2000), 175.1), 'answer length changes the 256K winner (7x3.5 at 100 tokens, 6x3.5 at 2,000)');
check(ANSWER.chat === 300 && ANSWER.agent === 600 && ANSWER.longForm === 2000, 'answer length is fixed per use');
check(ANSWER.coding === 1500 && near(blendedJobTime({ '32K': { firstS: 9, write: 75 }, '64K': { firstS: 20, write: 60 } }, 'coding'), 0.5 * (9 + 1500 / 75) + 0.5 * (20 + 1500 / 60)) && blendedJobTime({ '32K': { firstS: 9, write: 75 } }, 'coding') === null, 'coding: 1,500 tokens, half at 32K and half at 64K (Addendum 63)');
const sizes = { '128K': { firstS: 48, write: 60 }, '256K': { firstS: 128, write: 40 } };
check(near(blendedJobTime(sizes, 'longForm'), 0.5 * (48 + 2000 / 60) + 0.5 * (128 + 2000 / 40)), 'one blended job time per use (weighted sum, not an average of ratios)');
check(blendedJobTime({ '128K': sizes['128K'] }, 'longForm') === null, 'a missing size gives no blend (no silent re-weighting)');

const good = { realSpillMB: 76, needles: { found: 5, of: 5 }, meanKld: 0.00904, sameTop: 0.9569, aborts: 0, busyLoss: 0.17, freeCardMiB: 715, loadS: 6.2, kldRuns: 1 };
check(gates(good).status === 'pass' && gates(good).singleRun, 'q4_0 passes, flagged as resting on one perplexity run');
check(gates({ ...good, meanKld: 0.0656 }).status === 'fail', 'the gate is on MEAN KLD (q4_0\'s 99th percentile 0.0656 would fail)');
check(gates({ ...good, sameTop: 0.94 }).status === 'fail', 'same top word under 95% fails');
check(gates({ ...good, needles: undefined }).status === 'not measured' && gates({ ...good, needles: undefined }).gates.needle === 'not measured', 'no needle data is "not measured", never "failed"');
check(gates({ ...good, aborts: 1 }).status === 'fail' && gates({ ...good, busyLoss: 0.3 }).status === 'fail', 'an abort or a busy-desktop loss over 25% fails');
check(gates({ ...good, freeCardMiB: 450 }).status === 'fail' && gates({ ...good, loadS: 20 }).status === 'fail', 'too little free card memory or a slow load fails');
check(!gates({ ...good, kldRuns: 2 }).singleRun, 'two perplexity runs clear the single-run flag');

const stock = { short: { firstS: 3, write: 80 }, '32K': { firstS: 30, write: 80 } };
const ours = { short: { firstS: 1.5, write: 100 }, '32K': { firstS: 9.3, write: 100.7 } };
const s = scoreUse(ours, stock, 'chat', good);
check(s.score > 100 && s.jobS < blendedJobTime(stock, 'chat'), 'faster than stock scores over 100');
check(scoreUse(ours, stock, 'chat', { ...good, aborts: 1 }).score === null, 'a setting that fails a gate gets no score');
const r = rank([{ id: 'a', jobS: 135.5, score: 277 }, { id: 'b', jobS: 135.7, score: 276 }, { id: 'c', jobS: 150, score: 250 }]);
check(r[0].tie && r[1].tie && !r[2].tie && r[2].id === 'c', 'gaps within 3% are ties, not wins');
const t = rank([{ id: 'fit512', jobS: 19.4, score: 200, minFreeRamMB: 900, freeCardMiB: 604, firstS: 15.3 }, { id: 'fit1024', jobS: 19.4, score: 200, minFreeRamMB: 700, freeCardMiB: 1067, firstS: 15.9 }]);
check(t[0].id === 'fit512', 'a tie goes to more free RAM first (Addendum 51)');
const t2 = rank([{ id: 'a', jobS: 19.4, score: 1, minFreeRamMB: 800, freeCardMiB: 604, firstS: 15 }, { id: 'b', jobS: 19.5, score: 1, minFreeRamMB: 800, freeCardMiB: 1067, firstS: 16 }]);
check(t2[0].id === 'b', 'then more free card memory');
const t3 = rank([{ id: 'a', jobS: 19.4, score: 1, minFreeRamMB: 800, freeCardMiB: 600, firstS: 16 }, { id: 'b', jobS: 19.5, score: 1, minFreeRamMB: 800, freeCardMiB: 600, firstS: 15 }]);
check(t3[0].id === 'b', 'then the sooner first word');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
