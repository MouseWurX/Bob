// Speed readings: the share of a prompt that is instructions, one reply's numbers, and processor load.
import { check } from './check.js';
import { promptSplit, replyStats, cpuLoad } from '../src/speed-stats.js';

const chat = [{ role: 'system', content: 'a'.repeat(30) }, { role: 'user', content: 'b'.repeat(10) }];
check('the instructions share is the system message over everything', promptSplit(chat) === 0.75);
check('no messages give a share of 0', promptSplit([]) === 0);
check('a reply with no token counts gives nothing', replyStats({ model: 'm', messages: chat }) === null);
const s = replyStats({ model: 'm', messages: chat, promptTokens: 400, outTokens: 100, tokPerSec: 41.26, ctx: 8192, now: 5 });
check('a reply adds up what it used', s.used === 500 && s.ctx === 8192 && s.at === 5 && s.model === 'm');
check('speed is rounded to one decimal', s.tokPerSec === 41.3);
check('the prompt is split into instructions and chat, the reply counted as chat', s.instructions === 300 && s.chat === 200);
const cpu = (idle, user) => [{ times: { idle, user, nice: 0, sys: 0, irq: 0 } }];
const first = cpuLoad(null, cpu(100, 100));
check('the first reading has no load yet', first.pct === null && first.snap.all === 200);
check('load is the share of time not idle since the last reading', cpuLoad(first.snap, cpu(190, 110)).pct === 10);
check('no time passed gives no load', cpuLoad(first.snap, cpu(100, 100)).pct === null);
