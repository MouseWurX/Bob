// Sort and rename (src/sort-library.js, sort-names.js, media-tags.js): reading tags from small hand-made
// files, filling naming patterns safely, planning a sort (in place and into a rule's own folder), the Files
// card, doing it, removing emptied folders, and undoing all of it. Only throwaway folders; nothing real.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanSortRules, DEFAULT_RULES, ruleFor, fillPattern, safePart, exampleFor } from '../src/sort-names.js';
import { mediaInfo, parseName, dateParts } from '../src/media-tags.js';
import { planSort } from '../src/sort-library.js';
import { applyFiles, undoJob } from '../src/hands-files.js';
import { cleanHands, toolsOff, HANDS } from '../src/hands-settings.js';
import { handsTools, handsView } from '../src/hands.js';
import { groupsFor } from '../src/toolbox.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-sort-'));

// ---------- Little files with real tags, built here ----------
const u32be = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u32le = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const ss = (n) => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
function mp3(tags, { v = 3, utf16 = false } = {}) {
  const frames = Object.entries(tags).map(([id, text]) => {
    const body = utf16 ? Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(text, 'utf16le')]) : Buffer.concat([Buffer.from([3]), Buffer.from(text, 'utf8')]);
    return Buffer.concat([Buffer.from(id, 'latin1'), v === 4 ? ss(body.length) : u32be(body.length), Buffer.from([0, 0]), body]);
  });
  // A big picture frame first, so the reader must skip it.
  const apic = Buffer.concat([Buffer.from('APIC'), v === 4 ? ss(5000) : u32be(5000), Buffer.from([0, 0]), Buffer.alloc(5000, 7)]);
  const all = Buffer.concat([apic, ...frames]);
  return Buffer.concat([Buffer.from('ID3'), Buffer.from([v, 0, 0]), ss(all.length), all, Buffer.alloc(200, 0xff)]);
}
function vorbis(pairs) {
  const vendor = Buffer.from('bob');
  const list = pairs.map((p) => Buffer.concat([u32le(Buffer.byteLength(p)), Buffer.from(p)]));
  return Buffer.concat([u32le(vendor.length), vendor, u32le(list.length), ...list]);
}
function flac(pairs) {
  const info = Buffer.concat([Buffer.from([0x00, 0, 0, 34]), Buffer.alloc(34)]);
  const c = vorbis(pairs);
  const head = Buffer.from([0x84, (c.length >> 16) & 0xff, (c.length >> 8) & 0xff, c.length & 0xff]);
  return Buffer.concat([Buffer.from('fLaC'), info, head, c]);
}
function oggPage(packet, seq) {
  const segs = [];
  let n = packet.length;
  while (n >= 255) { segs.push(255); n -= 255; }
  segs.push(n);
  const h = Buffer.alloc(27); h.write('OggS'); h[26] = segs.length; h.writeUInt32LE(seq, 18);
  return Buffer.concat([h, Buffer.from(segs), packet]);
}
const ogg = (pairs) => Buffer.concat([oggPage(Buffer.concat([Buffer.from('OpusHead'), Buffer.alloc(11)]), 0), oggPage(Buffer.concat([Buffer.from('OpusTags'), vorbis(pairs)]), 1)]);
const atom = (type, ...kids) => { const body = Buffer.concat(kids); return Buffer.concat([u32be(body.length + 8), Buffer.from(type, 'latin1'), body]); };
const dataText = (t) => atom('data', u32be(1), u32be(0), Buffer.from(t, 'utf8'));
const dataNum = (b) => atom('data', u32be(0), u32be(0), b);
function m4v(items) {
  const ilst = atom('ilst', ...items);
  return Buffer.concat([atom('ftyp', Buffer.from('M4V isom')), atom('mdat', Buffer.alloc(300)), atom('moov', atom('mvhd', Buffer.alloc(20)), atom('udta', atom('meta', Buffer.alloc(4), atom('hdlr', Buffer.alloc(25)), ilst)))]);
}
function jpegWithDate(date) {
  // TIFF (big-endian): IFD0 with one entry, the Exif pointer; Exif IFD with DateTimeOriginal.
  const t = Buffer.alloc(80);
  t.write('MM', 0); t.writeUInt16BE(42, 2); t.writeUInt32BE(8, 4);
  t.writeUInt16BE(1, 8); t.writeUInt16BE(0x8769, 10); t.writeUInt16BE(4, 12); t.writeUInt32BE(1, 14); t.writeUInt32BE(26, 18); t.writeUInt32BE(0, 22);
  t.writeUInt16BE(1, 26); t.writeUInt16BE(0x9003, 28); t.writeUInt16BE(2, 30); t.writeUInt32BE(20, 32); t.writeUInt32BE(50, 36); t.writeUInt32BE(0, 40);
  t.write(`${date}\0`, 50, 'latin1');
  const app1 = Buffer.concat([Buffer.from('Exif\0\0'), t]);
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([((app1.length + 2) >> 8) & 0xff, (app1.length + 2) & 0xff]), app1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), seg, Buffer.from([0xff, 0xd9])]);
}

// ---------- Names and patterns ----------
{
  const r = cleanSortRules(undefined);
  check('no rules saved = the four defaults', r.length === DEFAULT_RULES.length && r.map((x) => x.id).join() === 'music,tv,films,photos');
  check('photos rule is off by default (a photo folder is often sorted already)', r.find((x) => x.id === 'photos').on === false);
  const c = cleanSortRules([{ id: 'My Docs!', label: 'Docs\nnow', exts: ['PDF', '*.docx', 'bad ext!'], pattern: '{year}/{name}', dest: 'relative/path' }]);
  check('rules are cleaned: id, label, extensions, no relative folder', c[0].id === 'mydocs' && c[0].label === 'Docs now' && c[0].exts.join() === '.pdf,.docx' && c[0].dest === '');
  check('a rule for episodes takes episodes; films take the rest', ruleFor(r, '.MKV', true).id === 'tv' && ruleFor(r, '.mkv', false).id === 'films' && ruleFor(r, '.mp3', false).id === 'music' && ruleFor(r, '.txt', false) === null);
  check('patterns make folders and pad numbers', fillPattern('{albumartist}/{album}/{track} {title}', { artist: 'Queen', album: 'News', track: '3', title: 'Spread' }).join('|') === 'Queen|News|03 Spread');
  check('missing year leaves no empty brackets', fillPattern('{title} ({year})/{title} ({year})', { title: 'Alien' }).join('|') === 'Alien|Alien');
  check('missing artist and album get plain fallbacks', fillPattern('{artist}/{album}/{title}', { title: 'x' }).join('|') === 'Unknown artist|Unknown album|x');
  check('names are safe on every system', safePart('AC/DC: Live? <1991>*') === 'AC-DC - Live 1991' && safePart('CON') === '_CON' && safePart('trailing. ') === 'trailing');
  check('a slash inside a tag never makes a folder', fillPattern('{artist}/{title}', { artist: 'AC/DC', title: 'T.N.T.' }).join('|') === 'AC-DC|T.N.T');
  check('{n:3} pads a count', fillPattern('Clip {n:3}', { n: '7' })[0] === 'Clip 007');
  check('Settings shows an example per rule', exampleFor(r[0]) === 'Queen/A Night at the Opera/11 Bohemian Rhapsody.mp3' && exampleFor(r[1]) === 'Star Trek/Season 01/Star Trek - S01E04.mp4', exampleFor(r[1]));
}
{
  const ep = parseName('Star.Trek.S01E04.The.Naked.Time.1080p.WEB-DL.x264', 'video');
  check('episode names: show, season, episode, title', ep.isEpisode && ep.show === 'Star Trek' && ep.season === '1' && ep.episode === '4' && ep.title === 'The Naked Time', JSON.stringify(ep));
  const x = parseName('Some Show 2x05', 'video');
  check('1x02 style episodes too', x.isEpisode && x.show === 'Some Show' && x.season === '2' && x.episode === '5');
  const f = parseName('The.Lighthouse.2019.1080p.BluRay', 'video');
  check('film names: title and year, junk dropped', !f.isEpisode && f.title === 'The Lighthouse' && f.year === '2019', JSON.stringify(f));
  const s = parseName('07 - Queen - Spread Your Wings', 'audio');
  check('song names: track, artist, title', s.track === '7' && s.artist === 'Queen' && s.title === 'Spread Your Wings', JSON.stringify(s));
  check('a song with a year in it is not taken for a film', parseName('01 Song (2019 Remaster)', 'audio').title === 'Song (2019 Remaster)');
  check('dates from EXIF text', dateParts('2021:07:04 10:00:00').date === '2021-07-04');
}

// ---------- A Bob home and a messy library ----------
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
const music = path.join(tmp, 'Music'), dl = path.join(tmp, 'Downloads'), videos = path.join(tmp, 'Videos'), outside = path.join(tmp, 'Elsewhere');
for (const d of [dataDir, music, dl, videos, outside]) fs.mkdirSync(d, { recursive: true });
const old = Date.now() / 1000 - 3600;
const put = (root, rel, body) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); fs.utimesSync(f, old, old); return f; };
const base = (extra = {}) => ({ agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readOnlyRoots: [dataDir], readRoots: [innDir], recycleBin: false, userName: 'Sam',
  hands: { enabled: true, sort: { on: true }, folders: [music, dl, videos], ...extra } });

{
  const a = put(music, 'messy/track1.mp3', mp3({ TIT2: 'Bohemian Rhapsody', TPE1: 'Queen', TALB: 'A Night at the Opera', TRCK: '11/12', TYER: '1975' }));
  const b = put(music, 'messy/b.mp3', mp3({ TIT2: 'Ünïcode Song', TPE1: 'Björk', TPE2: 'Various', TALB: 'Mix', TRCK: '2' }, { v: 4, utf16: true }));
  const c = put(music, 'c.flac', flac(['TITLE=Clair de Lune', 'ARTIST=Debussy', 'ALBUM=Suite', 'TRACKNUMBER=3', 'DATE=1905-01-01']));
  const d = put(music, 'd.opus', ogg(['title=Opus Song', 'artist=Opusband', 'album=Opalbum', 'tracknumber=1']));
  const e = put(music, 'e.m4a', m4v([atom('©nam', dataText('Apple Song')), atom('©ART', dataText('Fruit')), atom('©alb', dataText('Orchard')), atom('trkn', dataNum(Buffer.from([0, 0, 0, 5, 0, 9, 0, 0])))]));
  check('ID3v2.3 tags read (and a picture frame skipped)', JSON.stringify(mediaInfo(a)).includes('"title":"Bohemian Rhapsody"') && mediaInfo(a).track === '11' && mediaInfo(a).year === '1975');
  check('ID3v2.4 UTF-16 tags and album artist read', mediaInfo(b).title === 'Ünïcode Song' && mediaInfo(b).albumartist === 'Various');
  check('FLAC tags read', mediaInfo(c).artist === 'Debussy' && mediaInfo(c).year === '1905');
  check('Opus tags read', mediaInfo(d).album === 'Opalbum' && mediaInfo(d).track === '1');
  check('MP4 tags read', mediaInfo(e).title === 'Apple Song' && mediaInfo(e).track === '5');
  const ep = put(dl, 'show.s02e03.mp4', m4v([atom('tvsh', dataText('Tagged Show')), atom('tvsn', dataNum(u32be(2))), atom('tves', dataNum(u32be(3)))]));
  check('MP4 TV tags read', mediaInfo(ep).show === 'Tagged Show' && mediaInfo(ep).episode === '3' && mediaInfo(ep).isEpisode);
  const ph = put(dl, 'IMG_0042.jpg', jpegWithDate('2021:07:04 10:00:00'));
  check('photo date taken from EXIF', mediaInfo(ph).date === '2021-07-04');
  check('a file it can\'t read falls back to its name', mediaInfo(path.join(music, 'nope.mp3')).title === 'nope');
}

// Untagged songs in Artist/Album folders, an episode with subtitles, a film, a download still arriving, a secret.
put(music, 'Old Band/Old Album/01 First.mp3', Buffer.from('no tags'));
put(dl, 'Cool.Show.S01E02.720p.mkv', 'v');
put(dl, 'Cool.Show.S01E02.720p.en.srt', 's');
put(dl, 'The.Lighthouse.2019.1080p.mkv', 'v');
put(dl, 'half.mkv.part', 'p');
const fresh = path.join(dl, 'Just.Arrived.2024.mkv'); fs.writeFileSync(fresh, 'v');
put(dl, 'notes.txt', 'leave me');

{
  check('Sort and rename is off by default', cleanHands({}).sort.on === false);
  check('undo stays while either Files or Sort is on', !toolsOff(base()).includes('undo_files') && toolsOff(base()).includes('file_hands') && toolsOff({}).includes('sort_files') && toolsOff({}).includes('undo_files'));
  check('Sort has its own Hand with sort_files', HANDS.sort.tools.includes('sort_files'));
  const g = groupsFor({ usable: () => true, cfg: base() });
  check('with Files off, Undo goes in the Sort group (one group only)', g.sort?.tools.includes('undo_files') && !(g.files?.tools || []).includes('undo_files'));
  const cfg = base();
  check('only ticked folders', throws(() => planSort(cfg, { folder: outside }), /only work with files in/));
  check('Sort off = refused', throws(() => handsTools({ cfg: base({ sort: { on: false } }) }).sort_files.check({ folder: music }), /off/));

  const plan = planSort(cfg, { folder: music });
  const to = (rel) => plan.rows.find((r) => r.from.endsWith(rel))?.to;
  check('tagged song goes to Artist/Album/NN Title', to('track1.mp3') === path.join(music, 'Queen', 'A Night at the Opera', '11 Bohemian Rhapsody.mp3'), to('track1.mp3'));
  check('album artist wins for the folder', to('b.mp3') === path.join(music, 'Various', 'Mix', '02 Ünïcode Song.mp3'), to('b.mp3'));
  check('untagged song: artist and album from its folders, track from its name', to('01 First.mp3') === undefined && plan.fine === 1, JSON.stringify(plan.rows.map((r) => r.to)));
  check('only music rules touch the music folder; videos are not in it', plan.rows.every((r) => /\.(mp3|flac|opus|m4a)$/.test(r.to)));
  const res = applyFiles(cfg, plan);
  check('it moves them all', res.done.length === plan.rows.length && fs.existsSync(path.join(music, 'Queen', 'A Night at the Opera', '11 Bohemian Rhapsody.mp3')));
  check('the emptied "messy" folder is removed', !fs.existsSync(path.join(music, 'messy')) && fs.existsSync(music));
  check('a second run finds nothing to do', planSort(cfg, { folder: music }).rows.length === 0);
  const u = undoJob(cfg, res.job.id);
  check('undo puts every file back, and the emptied folder', !u.failed.length && fs.existsSync(path.join(music, 'messy', 'track1.mp3')) && !fs.existsSync(path.join(music, 'Queen')), JSON.stringify(u));
}

{
  // Downloads -> a Videos folder, set on the rules (destinations set for each file type).
  const rules = cleanSortRules(undefined).map((r) => (r.id === 'tv' || r.id === 'films' ? { ...r, dest: videos } : r));
  const cfg = base({ sortRules: rules });
  const tools = handsTools({ cfg, log() {} });
  const ctx = {};
  const card = tools.sort_files.check({ folder: dl }, ctx);
  const rows = card.plan;
  const find = (s) => rows.find((r) => r.from.endsWith(s));
  check('episode goes to Videos/Show/Season NN', find('S01E02.720p.mkv')?.to === path.join(videos, 'Cool Show', 'Season 01', 'Cool Show - S01E02.mkv'), find('S01E02.720p.mkv')?.to);
  check('its subtitles follow, keeping the language', find('.en.srt')?.to === path.join(videos, 'Cool Show', 'Season 01', 'Cool Show - S01E02.en.srt'), find('.en.srt')?.to);
  check('tagged episode uses its tags', find('show.s02e03.mp4')?.to === path.join(videos, 'Tagged Show', 'Season 02', 'Tagged Show - S02E03.mp4'));
  check('film goes to Videos/Title (Year)', find('Lighthouse.2019.1080p.mkv')?.to === path.join(videos, 'The Lighthouse (2019)', 'The Lighthouse (2019).mkv'));
  check('downloads still arriving are left alone', !find('.part') && !find('Just.Arrived.2024.mkv'));
  check('files no rule takes are left alone (photos rule is off)', !find('notes.txt') && !find('IMG_0042.jpg'));
  check('the card says it can be undone', /undo/i.test(card.text));
  await tools.sort_files.run({ folder: dl }, ctx);
  check('done: the film is in Videos', fs.existsSync(path.join(videos, 'The Lighthouse (2019)', 'The Lighthouse (2019).mkv')) && !fs.existsSync(path.join(dl, 'The.Lighthouse.2019.1080p.mkv')));
  const u = await tools.undo_files.run({});
  check('undo brings Downloads back', fs.existsSync(path.join(dl, 'The.Lighthouse.2019.1080p.mkv')) && fs.existsSync(path.join(dl, 'Cool.Show.S01E02.720p.en.srt')) && !fs.existsSync(path.join(videos, 'Cool Show')), u);

  // A rule's folder Bob may not use: its rows are shown blocked, never moved.
  const bad = cleanSortRules(undefined).map((r) => (r.id === 'films' ? { ...r, dest: outside } : r));
  const p2 = planSort(base({ sortRules: bad }), { folder: dl });
  check('a destination outside the ticked folders is blocked', /isn't one I may use/.test(p2.rows.find((r) => r.from.endsWith('Lighthouse.2019.1080p.mkv'))?.blocked || ''));
  // Clashes: something already there is never overwritten.
  put(videos, 'The Lighthouse (2019)/The Lighthouse (2019).mkv', 'mine');
  const p3 = planSort(cfg, { folder: dl });
  check('never overwrites', /already there/.test(p3.rows.find((r) => r.from.endsWith('Lighthouse.2019.1080p.mkv'))?.blocked || ''));
  check('only the chosen rules run', planSort(cfg, { folder: dl, kinds: ['tv'] }).rows.every((r) => /Show/.test(r.to)));
  check('Settings gets tokens and examples', Boolean(handsView(cfg).sort.examples.music) && 'artist' in handsView(cfg).sort.tokens);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
