// Naming rules: safe file names, filling a pattern, and picking the rule for a file.
import { check } from './check.js';
import { DEFAULT_RULES, cleanSortRules, ruleFor, safePart, fillPattern, exampleFor } from '../src/sort-names.js';

check('a colon becomes " - " and slashes become dashes', safePart('Alien: Covenant') === 'Alien - Covenant' && safePart('AC/DC') === 'AC-DC');
check('characters Windows refuses are taken out', safePart('What? "Why" <now>|*') === 'What Why now');
check('dots and spaces at the ends go', safePart('  .hidden name. ') === 'hidden name');
check('a reserved Windows name gets an underscore in front', safePart('CON') === '_CON' && safePart('nul') === '_nul' && safePart('com1') === '_com1');
check('a very long name is cut to 120 characters', safePart('x'.repeat(300)).length === 120);
const song = { artist: 'Queen', album: 'A Night at the Opera', title: 'Bohemian Rhapsody', track: '3' };
check('a music pattern fills into folders and a name', fillPattern('{artist}/{album}/{track} {title}', song).join('|') === 'Queen|A Night at the Opera|03 Bohemian Rhapsody');
check('a track number is padded to two digits, or as many as asked', fillPattern('{track} {title}', song)[0] === '03 Bohemian Rhapsody' && fillPattern('{track:3} {title}', song)[0] === '003 Bohemian Rhapsody');
check('a missing artist or album gets a stand-in name', fillPattern('{artist}/{album}', {}).join('|') === 'Unknown artist|Unknown album');
check('album artist falls back to the artist', fillPattern('{albumartist}', { artist: 'Queen' })[0] === 'Queen');
check('empty brackets are tidied away', fillPattern('{title} ({year})', { title: 'The Lighthouse' })[0] === 'The Lighthouse');
check('an unknown token is left as written', fillPattern('{title} {nope}', { title: 'A' })[0] === 'A {nope}');
check('a pattern that fills to nothing gives null', fillPattern('{title}', {}) === null);
check('an episode goes to the TV rule and a film to the films rule', ruleFor(DEFAULT_RULES, '.mkv', true).id === 'tv' && ruleFor(DEFAULT_RULES, '.MKV', false).id === 'films');
check('a rule that is off takes nothing', ruleFor(DEFAULT_RULES, '.jpg', false) === null);
check('missing rules give the four defaults', cleanSortRules(null).map((r) => r.id).join(',') === 'music,tv,films,photos');
const cleaned = cleanSortRules([{ id: 'Mine!', exts: ['MP3', '*.flac', 'bad ext'], pattern: '{title}' }, { id: 'mine', exts: ['.ogg'], pattern: '{title}' }]);
check('rules are cleaned: tidy ids, no two the same, tidy file types', cleaned.map((r) => r.id).join(',') === 'mine,minex' && cleaned[0].exts.join(',') === '.mp3,.flac');
check('the example for the music rule', exampleFor(DEFAULT_RULES[0]) === 'Queen/A Night at the Opera/11 Bohemian Rhapsody.mp3');
