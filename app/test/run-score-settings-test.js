// The speed-setting scorer (model-lab/score-settings.mjs, method doc Addendum 48). Pure: no files, card or clock.
import { gates, measures, score, scoreAll, WEIGHTS } from '../model-lab/score-settings.mjs';
let failures = 0, passes = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (ok) passes++; else failures++; };

const good = { realSpillMB: 76, needles: { found: 5, of: 5 }, kld: 0.009, sameTop: 0.96, aborts: 0 };
check(gates(good).pass && !gates(good).unknown.length, 'q4_0 numbers from Nov 18 pass every gate');
check(!gates({ ...good, realSpillMB: 300 }).pass, 'a real spill of 300 MB fails');
check(!gates({ ...good, needles: { found: 4, of: 5 } }).pass, 'a missed needle fails');
check(!gates({ ...good, kld: 0.02 }).pass && !gates({ ...good, sameTop: 0.9 }).pass, 'too much answer drift fails');
check(!gates({ ...good, aborts: 1 }).pass, 'an abort fails (the copy cache with the cache in RAM)');
check(gates({}).pass && gates({}).unknown.length === 4, 'nothing measured: not failed, but every gate listed as unknown');

const stock = { read: 1000, write: 80, firstS: 30, loadS: 6, busyKeep: 0.85 };
const m = measures({ read: 3500, write: 100, firstS: 9.3, loadS: 6, freeMiB: 715, busyKeep: 0.85 }, stock);
check(Math.abs(m.R - 3.5) < 1e-9 && Math.abs(m.W - 1.25) < 1e-9 && Math.abs(m.F - 30 / 9.3) < 1e-9 && m.L === 1 && m.H === 1 && m.B === 1, 'ratios against stock: above 1 is better, first word and load inverted');
check(measures({ freeMiB: 256 }, {}).H === 0.5, 'headroom under 512 MiB scores below 1');
check(score({ R: 1, W: 1, F: 1, B: 1, H: 1, L: 1 }, WEIGHTS.chat).score === 1, 'stock itself scores 1.00');
const s = score({ W: 2, F: 1, R: 1, B: 1, H: 1, L: 1 }, WEIGHTS.chat).score;
check(Math.abs(s - Math.round(2 ** 0.45 * 100) / 100) < 1e-9, 'a weighted geometric mean (writing twice as fast = 2^0.45 for chat)');
const half = score({ W: 2, F: null, R: 1, B: 1, H: 1, L: 1 }, WEIGHTS.chat);
check(half.missing.includes('F') && half.score > s, 'a missing measure is listed and its weight spread over the rest');
const out = scoreAll({ read: 3500, write: 100, firstS: 9.3, loadS: 6, freeMiB: 715, busyKeep: 0.85 }, stock, { ...good, aborts: 1 });
check(out.chat.out && out.chat.score === null && out.longDocs.score === null, 'a setting that fails a gate gets no score');
check(scoreAll({ read: 3500, write: 100, firstS: 9.3, loadS: 6, freeMiB: 715, busyKeep: 0.85 }, stock, good).longDocs.score > 1, 'a setting faster than stock scores above 1');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
