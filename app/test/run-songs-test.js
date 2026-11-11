// 1.5.41: songs show in the chat with Bob's song player (title, bars of the song's shape, lyrics), and
// Settings > Where Bob saves things picks the folder for pictures, clips, songs and sounds.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { wavePeaks } from '../src/wave.js';
import { songTitle, songFileName } from '../src/audio.js';
import { Made, cleanSong } from '../src/made.js';
import { applySaveDir, outputDirs, findOutput, saveDirProblem, mergeSettings } from '../src/config.js';
import { describe, resolveMention, allowedFile } from '../src/files.js';
import { tidyRoots, mayRecycle } from '../src/recycle.js';
import { pickFolder } from '../src/pick-folder.js';
import { songCard, songListHtml, barsSvg, clock } from '../public/song-player.js';
import { outCard } from '../public/viewer.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-songs-'));

// A WAV file: `seconds` long, loud in the second half only.
function wav(file, { rate = 8000, channels = 2, bits = 16, float = false, seconds = 2, streamed = false } = {}) {
  const frames = rate * seconds, bps = bits / 8, align = bps * channels;
  const data = Buffer.alloc(frames * align);
  for (let f = 0; f < frames; f++) {
    const amp = f < frames / 2 ? 0.05 : 0.9;
    const v = amp * Math.sin((2 * Math.PI * 440 * f) / rate);
    for (let c = 0; c < channels; c++) {
      const o = f * align + c * bps;
      if (float) data.writeFloatLE(v, o);
      else if (bits === 16) data.writeInt16LE(Math.round(v * 32767), o);
      else if (bits === 24) data.writeIntLE(Math.round(v * 8388607), o, 3);
    }
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(float ? 3 : 1, 20); head.writeUInt16LE(channels, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * align, 28); head.writeUInt16LE(align, 32); head.writeUInt16LE(bits, 34);
  head.write('data', 36); head.writeUInt32LE(streamed ? 0xffffffff : data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
  return file;
}

// ---------- the song's shape ----------
{
  const w = wavePeaks(wav(path.join(tmp, 'a.wav')), 40);
  check('a 16-bit WAV gives its length and one bar per slot', w.seconds === 2 && w.peaks?.length === 40, JSON.stringify(w).slice(0, 120));
  check('quiet parts are short bars and loud parts tall ones', w.peaks && Math.max(...w.peaks.slice(0, 18)) < 0.2 && Math.min(...w.peaks.slice(22)) > 0.8);
  const f = wavePeaks(wav(path.join(tmp, 'f.wav'), { float: true, bits: 32, channels: 1, seconds: 3 }), 30);
  check('a 32-bit float WAV (what music engines often write) reads too', f.seconds === 3 && f.peaks?.length === 30 && f.peaks[29] > 0.8);
  const t = wavePeaks(wav(path.join(tmp, 't.wav'), { bits: 24 }), 20);
  check('24-bit WAV reads', t.seconds === 2 && t.peaks?.[19] > 0.8);
  const s = wavePeaks(wav(path.join(tmp, 's.wav'), { streamed: true }), 20);
  check('a WAV written while streaming (no data size) runs to the end of the file', s.seconds === 2 && s.peaks?.length === 20);
  fs.writeFileSync(path.join(tmp, 'x.mp3'), 'ID3 not a wav');
  const m = wavePeaks(path.join(tmp, 'x.mp3'));
  check('an mp3 or broken file gets no bars (and no crash)', m.peaks === null && m.seconds === null);
  check('a missing file gets no bars', wavePeaks(path.join(tmp, 'gone.wav')).peaks === null);
  fs.writeFileSync(path.join(tmp, 'short.wav'), 'RIFF');
  check('a cut-off file gets no bars', wavePeaks(path.join(tmp, 'short.wav')).peaks === null);
}

// ---------- titles and file names ----------
{
  check('the title Bob gave the song is used', songTitle({ title: 'Rainy Day Lofi', prompt: 'lofi, rain' }) === 'Rainy Day Lofi');
  check('no title: the first three style words', songTitle({ prompt: 'chiptune, upbeat, 140 bpm, square lead' }) === 'Chiptune, upbeat, 140 bpm');
  check('a sound effect: the first words of what it sounds like', songTitle({ prompt: 'heavy wooden door creaking open in a stone hall' }, 'sfx') === 'Heavy wooden door creaking open in a');
  check('nothing at all: "Untitled song"', songTitle({}) === 'Untitled song');
  const n = songFileName('Rainy Day: Lo-fi Café!', new Date('2026-11-03T02:00:00Z'));
  check('file names carry the title, so the folder makes sense', /^2026-11-03-rainy-day-lo-fi-cafe-[0-9a-f]{8}\.wav$/.test(n), n);
  check('a title with no letters still gets a good name', /^2026-11-03-[0-9a-f]{8}\.wav$/.test(songFileName('♪♪', new Date('2026-11-03T02:00:00Z'))));
  check('the chat still spots the new names as files Bob made', /(?<![\w\\/.:-])[\w-]+\.(?:wav)\b/.test(n));
  const cs = cleanSong({ title: 'A\nB', style: 'x', lyrics: '[verse]\r\nhello', sound: 'weird' });
  check('song details are cleaned (one-line title, lyrics kept with their lines)', cs.title === 'A B' && cs.lyrics === '[verse]\nhello' && cs.sound === 'music');
  check('nothing to say means no song details', cleanSong({}) === null && cleanSong(null) === null);
}

// ---------- the player ----------
{
  const html = songCard({ url: '/images/2026-11-03-rain-1a2b3c4d.wav', name: '2026-11-03-rain-1a2b3c4d.wav', title: 'Rain <b>', sound: 'music' });
  check('a song card has a play button, the title (escaped), bars to click, the time and Show in folder', /data-song-play/.test(html) && /Rain &lt;b&gt;/.test(html) && /role="slider"/.test(html) && /song-time/.test(html) && /data-reveal="\/images\//.test(html));
  check('the card says Song or Sound effect', /Song</.test(html) && /Sound effect/.test(songCard({ url: '/images/a.wav', sound: 'sfx' })));
  check('Open in Made by Bob opens the side panel; the panel\'s own player has no such button', /data-view [^>]*>Open in Made by Bob</.test(html) && !/data-view /.test(songCard({ url: '/images/a.wav' }, { big: true })));
  check('the audio has no browser controls (the card is the player)', /<audio src="\/images\/2026-11-03-rain-1a2b3c4d.wav" preload="metadata"><\/audio>/.test(html));
  check('a card without a title asks the server for one', /data-song-untitled/.test(songCard({ url: '/images/a.wav' })) && !/data-song-untitled/.test(html));
  check('every sound card in the chat is the song player', /class="song"/.test(outCard({ type: 'audio', url: '/images/a.wav', name: 'a.wav' })));
  check('two or more songs sit in a list that plays one after another', /class="song-list"[^>]*aria-label="2 songs"/.test(songListHtml([{ url: '/images/a.wav' }, { url: '/images/b.wav' }])) && !/song-list/.test(songListHtml([{ url: '/images/a.wav' }])));
  check('bars draw from the shape, flat before it arrives', (barsSvg([0.5, 1]).match(/<rect/g) || []).length === 2 && (barsSvg(null).match(/<rect/g) || []).length === 72);
  check('times read like a music player', clock(0) === '0:00' && clock(65.4) === '1:05' && clock(NaN) === '0:00');
  const sp = read('public/song-player.js'), app = read('public/app.js'), viewer = read('public/viewer.js');
  check('only one song plays at a time', /if \(e\.type === 'play'\) for \(const other of/.test(sp));
  check('the next song in the list plays when one ends', /if \(e\.type === 'ended'\)[\s\S]*next\.querySelector\('audio'\)\.play\(\)/.test(sp));
  check('arrow keys jump 5 seconds, Space plays or pauses', /ArrowRight: 5/.test(sp) && /e\.key === ' '/.test(sp));
  check('the chat wires the player once and keeps song cards while words stream in', /wireSongs\(\);/.test(app) && /r\.el\.insertBefore\(tpl\.content, keep\)/.test(app));
  check('the side panel plays a song in the big player', /songCard\(\{ url, name: t\.name, path: t\.path \}, \{ big: true \}\)/.test(viewer));
  check('the song arrives with its title in the chat and in the saved reply', /title: ev\.song\.title, sound: ev\.song\.sound/.test(app) && /title: ev\.song\.title, sound: ev\.song\.sound/.test(read('src/brain.js')));
  check('the server answers /api/song with the shape and what the list knows', /p === '\/api\/song'/.test(read('src/server.js')) && /wavePeaks\(d\.path/.test(read('src/server.js')));
  check('make_music can take a title', /title: str\('Optional: 2 to 5 words/.test(read('src/tools.js')));
}

// ---------- Made by Bob keeps song details ----------
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), own = path.join(innDir, 'painter');
const picked = path.join(tmp, 'My Music'), older = path.join(tmp, 'Old pick'), appDirLike = path.join(tmp, 'Agent', 'bob');
for (const d of [dataDir, own, picked, older, appDirLike]) fs.mkdirSync(d, { recursive: true });
const base = () => ({ agentDir, innDir, dataDir, painterDir: own, readRoots: [innDir], readOnlyRoots: [], ownReadOnlyRoots: [appDirLike, dataDir], projects: {} });
{
  const cfg = base();
  const made = new Made(cfg);
  const f = wav(path.join(own, '2026-11-03-rain-00000000.wav'));
  made.add(f, { tool: 'audio', song: { title: 'Rain', style: 'lofi, rain', lyrics: '[verse]\nla', sound: 'music' } });
  check('the list keeps the song\'s title, style and lyrics', made.songInfo(f)?.title === 'Rain' && made.songInfo(f)?.lyrics === '[verse]\nla' && made.has(f));
  check('the list hands the title on, for cards in Made by Bob', made.list({ kind: 'audio' })[0]?.title === 'Rain');
  check('something not on the list has no song details', made.songInfo(path.join(own, 'nope.wav')) === null && !made.has(path.join(own, 'nope.wav')));
}

// ---------- Where Bob saves things ----------
{
  const cfg = applySaveDir({ ...base(), saveDir: '' });
  check('by default Bob saves in his own folder (Made by Bob)', cfg.painterDir === own && cfg.defaultPainterDir === own && !cfg.saveDirMissing);
  const c2 = applySaveDir({ ...base(), saveDir: picked, saveDirsUsed: [older] });
  check('a picked folder is where new things go', c2.painterDir === picked && c2.defaultPainterDir === own);
  check('Bob still finds things in his own folder and in folders picked before', JSON.stringify(outputDirs(c2)) === JSON.stringify([picked, own, older]));
  fs.writeFileSync(path.join(own, 'old.png'), 'x'); fs.writeFileSync(path.join(older, 'older.png'), 'x');
  check('a picture in an older chat still opens (its link finds the right folder)', findOutput(c2, 'old.png') === path.join(own, 'old.png') && findOutput(c2, '/x/older.png') === path.join(older, 'older.png') && findOutput(c2, 'new.png') === path.join(picked, 'new.png'));
  check('/images/ links and bare names go to the right folder', resolveMention(c2, '/images/older.png') === path.join(older, 'older.png') && resolveMention(c2, 'old.png') === path.join(own, 'old.png'));
  fs.writeFileSync(path.join(picked, 'song.wav'), 'RIFF');
  check('files in the picked folder can be shown and opened', allowedFile(c2, path.join(picked, 'song.wav')) && describe(c2, path.join(picked, 'song.wav')).kind === 'audio');
  const gone = applySaveDir({ ...base(), saveDir: path.join(tmp, 'Unplugged drive') });
  check('a picked folder that has gone: Bob saves in his own until it is back, and says so', gone.painterDir === own && gone.saveDirMissing === true);
  check('Tidy up only tidies Bob\'s own folder, never one you picked', tidyRoots(c2).includes(own) && !tidyRoots(c2).includes(picked) && !mayRecycle(c2, path.join(picked, 'song.wav')) && mayRecycle(c2, path.join(own, 'old.png')));
  // What a folder in the picked folder isn't Bob's own work: the Made by Bob list doesn't scan it.
  fs.writeFileSync(path.join(picked, 'my-own-photo.png'), 'x');
  const listed = new Made(c2).list({ limit: 50 }).map((x) => x.name);
  check('Made by Bob doesn\'t list your own files from a picked folder', !listed.includes('my-own-photo.png') && listed.includes('old.png'));
  check('a good folder passes', saveDirProblem(c2, picked) === '');
  check('a folder that isn\'t there is refused, plainly', /Bob can't find that folder\. Check the spelling, or use Browse/.test(saveDirProblem(c2, path.join(tmp, 'nope'))));
  check('a file isn\'t a folder', /a file, not a folder/.test(saveDirProblem(c2, path.join(picked, 'song.wav'))));
  check('Bob\'s own program and settings folders are refused (the folder around them is fine)', /Bob's own program or settings folder/.test(saveDirProblem(c2, appDirLike)) && /Bob's own program or settings folder/.test(saveDirProblem(c2, dataDir)) && saveDirProblem(c2, agentDir) === '');
  check('a whole drive is refused', /not a whole drive/.test(saveDirProblem(c2, path.parse(tmp).root)));
  check('a typed name that isn\'t a whole path is refused', /Type the whole folder path/.test(saveDirProblem(c2, 'Music')));
  check('saved settings keep only whole paths', mergeSettings({}, { saveDir: 'relative\\x', saveDirsUsed: ['/a', 'b', 5] }).saveDir === '' && JSON.stringify(mergeSettings({}, { saveDirsUsed: ['/a', 'b'] }).saveDirsUsed) === JSON.stringify([path.resolve('/a')]));
  const srv = read('src/server.js');
  check('the server checks a folder before saving it and remembers the old one', /saveDirProblem\(cfg, want\)/.test(srv) && /saveDirsUsed: used/.test(srv) && /applySaveDir\(cfg\);/.test(srv));
  check('over the home network, a picked folder only gives out what Bob made there', /!isLocal && path\.resolve\(path\.dirname\(f\)\) !== path\.resolve\(cfg\.defaultPainterDir\) && !brain\.made\.has\(f\)/.test(srv));
  const cellar = read('public/cellar.js');
  check('Settings has the "Where Bob saves things" panel with Browse, Save here, Show in folder and Use Bob\'s own folder', /'💾 Where Bob saves things'/.test(cellar) && /data-savebrowse>Browse…/.test(cellar) && /data-savedir disabled>Save here/.test(cellar) && /data-saveopen>Show in folder/.test(cellar) && /data-saveown>Use Bob\\'s own folder/.test(cellar));
}

// ---------- the Windows folder picker ----------
{
  let script = '';
  await pickFolder({ platform: 'win32', purpose: 'save', run: (exe, args, o, cb) => { script = args[args.length - 1]; cb(null, 'D:\\Bob\r\n'); } });
  check('picking a save folder lets you make a new folder and says what it\'s for', /ShowNewFolderButton = \$true/.test(script) && /saves pictures, clips, songs and sounds/.test(script));
  await pickFolder({ platform: 'win32', run: (exe, args, o, cb) => { script = args[args.length - 1]; cb(null, ''); } });
  check('picking a project folder is as before', /ShowNewFolderButton = \$false/.test(script) && /Pick a project folder/.test(script));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
