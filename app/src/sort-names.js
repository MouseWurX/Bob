// Naming rules for "Sort and rename" (src/sort-library.js): one rule per kind of file, set by the user in
// Settings, Hands. A rule says which file types it takes, the pattern for the new name ("/" makes folders),
// and, if wanted, a folder they go to (so Downloads or an output folder can be sorted into a library).
// No imports, so hands-settings.js (and through it config.js) can use it.

export const AUDIO = ['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma', '.aiff', '.ape', '.wv'];
export const VIDEO = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.wmv', '.m4v', '.mpg', '.mpeg', '.ts'];
export const PHOTO = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif', '.tif', '.tiff', '.dng', '.cr2', '.nef', '.arw'];

// Files that follow their main file (same name, so subtitles and lyrics stay with their video or song).
export const SIDECARS = ['.srt', '.sub', '.idx', '.ass', '.ssa', '.vtt', '.lrc', '.nfo'];

// The tokens a pattern can use. Shown in Settings and in Help.
export const TOKENS = {
  name: 'the old name', folder: 'the folder it is in', artist: 'artist', albumartist: 'album artist', album: 'album',
  title: 'title', track: 'track number', disc: 'disc number', year: 'year', genre: 'genre', show: 'TV show',
  season: 'season', episode: 'episode', month: 'month', day: 'day', date: 'date (2026-11-11)', ext: 'file type (mp3)', n: 'a count (01, 02...)'
};

// when: '' = any file of these types; 'episode' = only names with an episode number (S01E02 or 1x02);
// 'notEpisode' = only names without one (so films and TV episodes can have different rules).
export const DEFAULT_RULES = [
  { id: 'music', label: 'Music', on: true, exts: AUDIO, when: '', pattern: '{albumartist}/{album}/{track} {title}', dest: '' },
  { id: 'tv', label: 'TV episodes', on: true, exts: VIDEO, when: 'episode', pattern: '{show}/Season {season}/{show} - S{season}E{episode}', dest: '' },
  { id: 'films', label: 'Films and other videos', on: true, exts: VIDEO, when: 'notEpisode', pattern: '{title} ({year})/{title} ({year})', dest: '' },
  { id: 'photos', label: 'Photos', on: false, exts: PHOTO, when: '', pattern: '{year}/{year}-{month}/{date} {name}', dest: '' }
];

const isAbs = (p) => typeof p === 'string' && p.length < 400 && !p.includes('\0') && (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/'));
const cleanExt = (e) => { const s = String(e || '').trim().toLowerCase().replace(/^\*?\.?/, '.'); return /^\.[a-z0-9]{1,10}$/.test(s) ? s : ''; };

// The rules, cleaned. Missing or broken = the defaults. At most 20 rules.
export function cleanSortRules(v) {
  if (!Array.isArray(v) || !v.length) return DEFAULT_RULES.map((r) => ({ ...r, exts: [...r.exts] }));
  const seen = new Set();
  const out = [];
  for (const r of v.slice(0, 20)) {
    if (!r || typeof r !== 'object') continue;
    let id = String(r.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || `rule${out.length + 1}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);
    const exts = [...new Set([].concat(r.exts || []).map(cleanExt).filter(Boolean))].slice(0, 40);
    out.push({
      id,
      label: String(r.label || 'Files').replace(/[\r\n]/g, ' ').trim().slice(0, 60) || 'Files',
      on: r.on !== false,
      exts,
      when: ['episode', 'notEpisode'].includes(r.when) ? r.when : '',
      pattern: String(r.pattern || '').replace(/[\r\n]/g, '').trim().slice(0, 200),
      dest: isAbs(r.dest) ? r.dest : ''
    });
  }
  return out;
}

// The first rule that takes this file. ext: '.mp3'. episode: whether the name has an episode number.
export function ruleFor(rules, ext, episode) {
  const e = String(ext || '').toLowerCase();
  return rules.find((r) => r.on && r.pattern && r.exts.includes(e) && (r.when !== 'episode' || episode) && (r.when !== 'notEpisode' || !episode)) || null;
}

// What fills a token when the file doesn't say.
const FALLBACK = { artist: 'Unknown artist', albumartist: 'Unknown artist', album: 'Unknown album', show: 'Unknown show' };
const NUMBERS = new Set(['track', 'disc', 'season', 'episode', 'month', 'day']);

// One part of a path made safe on Windows, Mac, Linux and Android: no \ / : * ? " < > |, no control
// characters, no dots or spaces at the end, not a reserved Windows name, not too long.
export function safePart(s) {
  let t = String(s ?? '').replace(/[\x00-\x1f\x7f]/g, '').replace(/:/g, ' - ').replace(/[\\/]/g, '-').replace(/[*?"<>|]/g, '')
    .replace(/\s+/g, ' ').trim();
  t = t.replace(/^[.\s]+|[.\s]+$/g, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(t)) t = `_${t}`;
  if (t.length > 120) t = t.slice(0, 120).trim();
  return t;
}

// Tidies what is left when a token was empty: "Film ()" -> "Film", "01  Song" -> "01 Song", " - Song" -> "Song".
function tidyPart(s) {
  return s.replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, '').replace(/\s+/g, ' ').replace(/(\s*-\s*){2,}/g, ' - ')
    .replace(/^[\s\-_.]+|[\s\-_]+$/g, '').trim();
}

// Fills a pattern. info: the tokens for this file. Returns the parts of the new path (folders, then the name
// without its extension), or null when the name would be empty.
export function fillPattern(pattern, info = {}) {
  const parts = String(pattern || '').split(/[\\/]+/);
  const out = [];
  for (const raw of parts) {
    const filled = raw.replace(/\{(\w+)(?::(\d))?\}/g, (m, key, pad) => {
      const k = key.toLowerCase();
      if (!(k in TOKENS)) return m;
      let v = info[k];
      if ((v === undefined || v === null || v === '') && k === 'albumartist') v = info.artist;
      if (v === undefined || v === null || v === '') v = FALLBACK[k] ?? '';
      v = String(v);
      const width = pad ? Number(pad) : NUMBERS.has(k) ? 2 : 0;
      if (width && /^\d+$/.test(v)) v = v.padStart(width, '0');
      return safePart(v);
    });
    const part = safePart(tidyPart(filled));
    if (part) out.push(part);
  }
  return out.length ? out : null;
}

// An example for Settings: what a rule would make of a typical file of its kind.
export const SAMPLE = {
  music: { artist: 'Queen', albumartist: 'Queen', album: 'A Night at the Opera', title: 'Bohemian Rhapsody', track: '11', disc: '1', year: '1975', genre: 'Rock', name: 'track11', ext: 'mp3' },
  video: { title: 'The Lighthouse', year: '2019', show: 'Star Trek', season: '1', episode: '4', name: 'star.trek.s01e04.1080p', ext: 'mkv' },
  photo: { year: '2026', month: '11', day: '11', date: '2026-11-11', name: 'IMG_0042', ext: 'jpg' }
};
export function exampleFor(rule) {
  const e = rule.exts[0] || '';
  const s = { ...(AUDIO.includes(e) ? SAMPLE.music : VIDEO.includes(e) ? SAMPLE.video : SAMPLE.photo), folder: 'Downloads', n: '1', ext: e.slice(1) || 'file' };
  if (rule.when === 'notEpisode') s.name = 'the.lighthouse.2019';
  const parts = fillPattern(rule.pattern, s);
  return parts ? `${parts.join('/')}${e}` : '';
}
