// Bob's time zone (1.5.207 PC check, round 3): on Windows, Node's zone library didn't know the Windows zone, gave
// no zone name and ran an hour off; Bob fell back to UTC. Now Windows' own offset (registry) wins, and Bob never
// uses UTC on a computer whose clock isn't UTC. Everything here is faked: no real registry, no real clock zone.
import { pickZone, zoneOffset, zoneForOffset, windowsZone, applyZone, WIN_TO_IANA } from '../src/local-zone.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const winter = new Date('2026-11-12T03:30:00Z'), summer = new Date('2026-07-01T18:00:00Z');
const regOut = (key, bias) => `\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\TimeZoneInformation\r\n    Bias    REG_DWORD    0x168\r\n    ActiveTimeBias    REG_DWORD    ${bias}\r\n    StandardName    REG_SZ    @tzres.dll,-1\r\n    TimeZoneKeyName    REG_SZ    ${key}\r\n    DynamicDaylightTimeDisabled    REG_DWORD    0x0\r\n`;

check('offsets: Denver is 7 hours behind in winter, 6 in summer', zoneOffset('America/Denver', winter) === -420 && zoneOffset('America/Denver', summer) === -360);
check('an unknown zone has no offset', zoneOffset('Alberta Standard Time', winter) === null);
check('a plain offset gets a fixed zone with the right sign', zoneForOffset(-360) === 'Etc/GMT+6' && zoneOffset('Etc/GMT+6', winter) === -360 && zoneForOffset(540) === 'Etc/GMT-9');
check('no offset is UTC; half hours get a real place', zoneForOffset(0) === 'UTC' && zoneOffset(zoneForOffset(330), winter) === 330 && zoneOffset(zoneForOffset(345), winter) === 345);

// A Windows zone newer than Node's zone data, six hours behind; Node knows no zone name.
const w = windowsZone(() => regOut('Alberta Standard Time', '0x168'));
check('the registry is read: key and offset (summer time counted)', w && w.key === 'Alberta Standard Time' && w.offset === -360, JSON.stringify(w));
check('east of UTC comes out of the registry right too (a DWORD)', windowsZone(() => regOut('Tokyo Standard Time', '0xfffffde4'))?.offset === 540);
check('no registry answer: null, not a crash', windowsZone(() => { throw new Error('not here'); }) === null && windowsZone(() => 'nothing useful') === null);
const pc = pickZone({ platform: 'win32', intl: '', now: winter, win: w });
check('the PC case: Windows says six hours behind and Node knows no zone: six hours behind, not UTC', zoneOffset(pc, winter) === -360, pc);
check('…even when Node says UTC', zoneOffset(pickZone({ platform: 'win32', intl: 'UTC', now: winter, win: w }), winter) === -360);
check('…and when Node guesses a zone with the wrong offset (Denver, 7 behind)', zoneOffset(pickZone({ platform: 'win32', intl: 'America/Denver', now: winter, win: w }), winter) === -360);
// That zone stays six hours behind all year; a Node with older zone data has Edmonton at seven in winter.
const ed = zoneOffset('America/Edmonton', winter);
check('Alberta Standard Time: Edmonton when Node\'s zone data agrees, else the fixed offset', pickZone({ platform: 'win32', intl: '', now: winter, win: w }) === (ed === -360 ? 'America/Edmonton' : 'Etc/GMT+6'));
check('a known Windows zone gets its real name (summer time and all)', pickZone({ platform: 'win32', intl: '', now: winter, win: { key: 'Mountain Standard Time', offset: -420 } }) === 'America/Denver');
check('Saskatchewan (no summer time) gets Regina', pickZone({ platform: 'win32', intl: '', now: summer, win: { key: 'Canada Central Standard Time', offset: -360 } }) === 'America/Regina');
check('a Node zone that agrees with Windows is kept', pickZone({ platform: 'win32', intl: 'America/Regina', now: winter, win: { key: 'Odd Name', offset: -360 } }) === 'America/Regina');
check('a UTC Windows PC stays UTC', ['UTC', 'Etc/UTC'].includes(pickZone({ platform: 'win32', intl: 'UTC', now: winter, win: { key: 'UTC', offset: 0 } })));
check('Windows with no registry answer falls back to Node, and never UTC when Node\'s clock is not UTC', pickZone({ platform: 'win32', intl: 'Asia/Tokyo', now: winter, win: null }) === 'Asia/Tokyo');
check('Mac and Linux: the named zone is used', pickZone({ platform: 'linux', intl: 'Europe/Paris', now: winter }) === 'Europe/Paris');
const fakeNow = new Date(winter); fakeNow.getTimezoneOffset = () => 360;
check('Mac and Linux: a UTC name on a clock that isn\'t UTC gives the clock\'s offset', pickZone({ platform: 'darwin', intl: 'UTC', now: fakeNow }) === 'Etc/GMT+6');
check('…and no name at all does the same', pickZone({ platform: 'linux', intl: '', now: fakeNow }) === 'Etc/GMT+6');
check('every Windows zone in the table is one Node knows', Object.values(WIN_TO_IANA).every((z) => zoneOffset(z, winter) !== null), Object.values(WIN_TO_IANA).filter((z) => zoneOffset(z, winter) === null).join(', '));

// applyZone: sets Bob's zone, and Node's clock when they disagree; a zone set by hand stays.
const env = {};
const cfg = { timeZone: '' }; Object.defineProperty(cfg, 'timeZoneSet', { value: false, enumerable: false });
applyZone(cfg, { pick: () => 'Etc/GMT+6', env, every: 0 });
check('applyZone sets Bob\'s zone and Node\'s clock (TZ) when they disagree', cfg.timeZone === 'Etc/GMT+6' && env.TZ === 'Etc/GMT+6', JSON.stringify({ cfg, env }));
const hand = { timeZone: 'Europe/Oslo' }; Object.defineProperty(hand, 'timeZoneSet', { value: true, enumerable: false });
const env2 = {};
applyZone(hand, { pick: () => 'Etc/GMT+6', env: env2, every: 0 });
check('a zone set by hand in config.json is kept', hand.timeZone === 'Europe/Oslo' && !env2.TZ);

// Quiet hours and the logbook stamp follow it: 03:30 UTC is 21:30 six hours behind.
const { minuteOfDay } = await import('../src/quiet-hours.js');
check('quiet hours read the picked zone: 21:30 on the PC, not 03:30 UTC', minuteOfDay(winter, pc) === 21 * 60 + 30, String(minuteOfDay(winter, pc)));
const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: pc, dateStyle: 'short', timeStyle: 'short', hour12: false }).format(winter);
check('the logbook stamp reads 21:30 the day before', /2026-11-11.*21:30/.test(stamp), stamp);

// 1.5.208 PC check: the zone shows read-only in Settings (This replicant matrix), with the time there now, and in
// Bob's own list of his settings, so a wrong zone is seen at once.
{
  const fs = await import('node:fs');
  const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
  const cellar = read('../public/cellar.js'), server = read('../src/server.js');
  check('Settings shows the time zone as a read-only line, with the time there now', /srow\('Time zone', zoneLine\(settings\)/.test(cellar) && /timeZone: z, hour: '2-digit'/.test(cellar) && !/data-set="timeZone"/.test(cellar));
  check('the settings read gives the zone and whether it was set by hand', /timeZone: cfg\.timeZone \|\| '', timeZoneSet: cfg\.timeZoneSet === true/.test(server));
  check("Bob's own list of his settings names the zone", /`Time zone: \$\{cfg\.timeZone \|\| 'not read yet'\}/.test(read('../src/self-help.js')));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
