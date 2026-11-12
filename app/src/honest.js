// Honest reporting (reliability items 181-192, Nov 12; always on, checked in code). Bob's finished answer is checked
// against the turn's record (what the tools really did and gave back) before it stands. Nothing here is added to what
// the brain reads at the start of a job: a check that fires shows one short note under the answer, and that's all.
//   181 "Done" only from the record: each "I did X" in the answer needs a step that did X (and the file it names).
//   182 The checks read French and Spanish as well as English (the Language setting has all three).
//   185 Half-done is said as half-done (verify.js, afterTurn, uses admitsTrouble from here).
//   186 Numbers in the answer come from results; 187 quotes are really in what he read; 188 links are links he read.
//   189 No "it's on" for switches that are off (more switches than 1.5.207's said-done.js knew).
//   190-192 Corrections show once, go on the job's record, and add up to a per-brain honesty score (honesty-score.js).

// Curly quotes and apostrophes as plain ones, so one pattern reads both.
export const plain = (t) => String(t ?? '').replace(/[\u2018\u2019\u00b4`]/g, '\'').replace(/[\u201c\u201d\u00ab\u00bb\u201e]/g, '"').replace(/\u00a0/g, ' ');
export const sentences = (t) => plain(t).replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean);
// Word edges that work for accented letters too (\b doesn't, around é or ñ).
const L = '\\p{L}\\p{N}_';
const B = `(?<![${L}])`, E = `(?![${L}])`;
const rx = (s, f = 'iu') => new RegExp(s.replaceAll('\\b<', B).replaceAll('\\b>', E), f);

// ---------------------------------------------------------------- 182: French and Spanish

// "Not done yet" words: a sentence with one of these is about later, a maybe or a question, not a claim.
export const NOT_YET = rx('\\b<(?:not|n\'t|never|once|when|if|after|until|as soon as|would|could|should|earlier|before|yesterday|last time|previously)\\b>|\\b<(?:ne|n\'|pas|jamais|quand|si|une fois|dès que|pourrai[st]?|devrai[st]?|hier|avant|la dernière fois)\\b>|\\b<(?:no|nunca|cuando|si|una vez|en cuanto|podría|debería|ayer|antes|la última vez)\\b>|\\?\\s*$');

// The PC-action claim (brain.js claimsPcAction) in French and Spanish: "J'ai ouvert le Bloc-notes", "He abierto la ventana".
const FR_DID = 'ouvert|lancé|démarré|tapé|cliqué|appuyé|déplacé|copié|renommé|compressé|décompressé|exécuté|supprimé|enregistré|sauvegardé|fermé';
const FR_DO = 'ouvrir|lancer|démarrer|taper|cliquer|appuyer|déplacer|copier|renommer|compresser|décompresser|exécuter|supprimer|enregistrer|sauvegarder|fermer';
const ES_DID = 'abierto|lanzado|iniciado|escrito|hecho clic|pulsado|movido|copiado|renombrado|comprimido|descomprimido|ejecutado|borrado|eliminado|guardado|cerrado';
const ES_DO = 'abrir|lanzar|iniciar|escribir|pulsar|mover|copiar|renombrar|comprimir|descomprimir|ejecutar|borrar|eliminar|guardar|cerrar';
const FR_THING = 'bloc-notes|notepad|paint|calculatrice|application|appli|fenêtre|programme|fichier|dossier|script|commande|document|onglet|[\\w-]+\\.\\w{2,4}';
const ES_THING = 'bloc de notas|notepad|paint|calculadora|aplicación|app|ventana|programa|archivo|fichero|carpeta|script|comando|documento|pestaña|[\\w-]+\\.\\w{2,4}';
const PC_FR = rx(`\\b<(?:j'ai\\s+(?:bien\\s+|déjà\\s+|maintenant\\s+)?(?:${FR_DID})|je viens d(?:'|e\\s+)(?:${FR_DO}))\\b>[^.!?\\n]{0,60}\\b<(?:${FR_THING})\\b>`);
const PC_ES = rx(`\\b<(?:(?:ya\\s+)?he\\s+(?:ya\\s+)?(?:${ES_DID})|acabo de\\s+(?:${ES_DO}))\\b>[^.!?\\n]{0,60}\\b<(?:${ES_THING})\\b>`);
export const claimsPcActionFrEs = (t) => { const s = plain(t); return PC_FR.test(s) || PC_ES.test(s); };

// Made a picture / saved a file (verify.js PIC_CLAIM, FILE_CLAIM).
export const PIC_CLAIM_FR_ES = rx('\\b<(?:j\'ai\\s+(?:fait|créé|dessiné|généré|peint|réalisé)|(?:ya\\s+)?he\\s+(?:hecho|creado|dibujado|generado|pintado))\\b>[^.!?\\n]{0,60}\\b<(?:image|photo|dessin|illustration|peinture|portrait|logo|icône|fond d\'écran|imagen|foto|dibujo|ilustración|pintura|retrato|icono|fondo de pantalla)s?\\b>');
export const FILE_CLAIM_FR_ES = rx('\\b<(?:j\'ai\\s+(?:enregistré|sauvegardé|écrit|créé|exporté|mis)|(?:ya\\s+)?he\\s+(?:guardado|escrito|creado|exportado|puesto))\\b>[^.!?\\n]{0,60}\\b<(?:fichier|document|tableur|csv|txt|bureau|téléchargements|archivo|fichero|documento|hoja de cálculo|escritorio|descargas)s?\\b>');

// A switch said to be on (said-done.js ON), sent, looked up.
export const ON_FR_ES = rx('\\b<(?:(?:est|sont)\\s+(?:maintenant\\s+|désormais\\s+)?(?:activée?s?|allumée?s?|en marche)|j\'ai\\s+activé|c\'est\\s+activé|(?:está|están)\\s+(?:ahora\\s+|ya\\s+)?(?:activad[oa]s?|encendid[oa]s?)|(?:ya\\s+)?he\\s+activado|ya\\s+puedo)\\b>');
export const WEB_FR_ES = 'recherche (?:sur le |sur )?(?:web|internet)|accès (?:à )?internet|búsqueda (?:web|en internet)|buscar en internet|acceso a internet';
export const SENT_FR_ES = rx('\\b<(?:j\'ai\\s+(?:bien\\s+)?(?:envoyé|posté|transmis)|(?:le message|l\'e-mail|le mail|le courriel|la note)\\s+(?:a été|est)\\s+(?:envoyée?|postée?)|(?:ya\\s+)?he\\s+(?:enviado|mandado|publicado)|(?:el mensaje|el correo)\\s+(?:ha sido|fue|está)\\s+enviado)\\b>');
export const LOOKED_FR_ES = rx('\\b<(?:j\'ai\\s+(?:cherché|recherché|vérifié)\\s+(?:en ligne|sur (?:le )?web|sur internet)|d\'après (?:ma|la) recherche|(?:ya\\s+)?he\\s+(?:buscado|consultado|comprobado)\\s+(?:en internet|en línea|en la web)|según (?:mi|la) búsqueda)\\b>');

// 185: the answer says something didn't work (in any of the three).
export const ADMITS = rx('\\b<(?:didn\'t|did not|couldn\'t|could not|wasn\'t|weren\'t|failed|fail|error|errors|not done|not all|only some|only part|partly|half|except|but not|unable|problem|went wrong|skipped|left out|pas pu|n\'a pas|n\'ont pas|échou\\p{L}*|erreur|impossible|pas réussi|seulement une partie|en partie|sauf|no pude|no se pudo|no ha|fall\\p{L}*|error(?:es)?|imposible|no funcionó|solo una parte|en parte|excepto)\\b>');
export const admitsTrouble = (t) => ADMITS.test(plain(t));

// ---------------------------------------------------------------- 181: "done" only from the record

// Each kind of "I did X", the words that say it in each language, and the tools that really do it.
const FAMILIES = [
  { id: 'edit', what: 'changed a file', en: 'edited|changed|updated|fixed|modified|patched|rewrote|rewritten', fr: 'modifié|changé|mis à jour|corrigé|réécrit', es: 'editado|cambiado|modificado|actualizado|corregido|arreglado|reescrito',
    obj: 'file|files|config|document|fichier|fichiers|archivo|archivos|fichero|[\\w-]+\\.[a-z0-9]{1,6}', inChat: true, tools: /^(edit_file|write_file|office_edit|file_hands|work_on_repo|run_command|edit_my_message)$/ },
  { id: 'run', what: 'ran something', en: 'ran(?! into| out| across)|executed|run(?! into| out| across)', fr: 'exécuté|lancé', es: 'ejecutado|corrido|lanzado',
    obj: 'tests?|command|script|build|program|npm|node|python|pip|git|cargo|make|tests|commande|programme|comando|programa|pruebas|[\\w-]+\\.(?:py|js|mjs|sh|ps1|bat|cmd|exe)', tools: /^(run_command|run_recipe|run_in_sandbox|work_on_repo|use_my_tool|use_pack_tool|mcp_use|calculate)$/ },
  { id: 'delete', what: 'deleted something', en: 'deleted|removed|recycled|trashed|erased|cleared out', fr: 'supprimé|effacé|mis à la corbeille', es: 'borrado|eliminado|suprimido',
    obj: 'files?|folders?|directory|director(?:y|ies)|fichiers?|dossiers?|archivos?|ficheros?|carpetas?|[\\w-]+\\.[a-z0-9]{1,6}', tools: /^(file_hands|sort_files|undo_files|run_command|forget_topic|notes|notice_board|remember|reminders|change_schedule)$/ },
  { id: 'move', what: 'moved or renamed files', en: 'moved|renamed|copied|zipped|unzipped|sorted|organi[sz]ed', fr: 'déplacé|renommé|copié|compressé|décompressé|trié|rangé', es: 'movido|renombrado|copiado|comprimido|descomprimido|ordenado|organizado',
    obj: 'files?|folders?|photos?|songs?|music|videos?|pictures?|fichiers?|dossiers?|archivos?|ficheros?|carpetas?|fotos?|canciones|vídeos?|[\\w-]+\\.[a-z0-9]{1,6}', tools: /^(file_hands|sort_files|undo_files|run_command|convert_file)$/ },
  { id: 'schedule', what: 'set a reminder or schedule', en: 'scheduled|set (?:up )?(?:a |the |your )?(?:reminder|alarm|timer)|added (?:it |that |this )?to (?:your |the )?calendar', fr: 'programmé|planifié|créé un rappel|mis un rappel|ajouté (?:au|à ton|à votre) (?:calendrier|agenda)', es: 'programado|creado un recordatorio|puesto un recordatorio|añadido (?:al|a tu) calendario',
    obj: '', tools: /^(schedule_job|change_schedule|set_reminder|reminders|add_event)$/ },
  { id: 'note', what: 'noted something down', en: 'noted (?:it|that|this) down|made a note|taken a note|took a note|saved (?:it |that |this )?(?:to|in) (?:my |your )?(?:memory|notes)|added (?:it |that |this )?to (?:my |your )?(?:memory|notes|notice board)', fr: 'pris note|noté (?:ça|cela)|enregistré dans (?:ma|la) mémoire|ajouté (?:à|aux) (?:mes|tes|vos) notes', es: 'tomado nota|anotado|guardado en (?:mi|la) memoria|añadido a (?:mis|tus) notas',
    obj: '', tools: /^(remember|notes|take_note|notice_board|pass_note|save_reference)$/ },
  { id: 'install', what: 'installed or downloaded something', en: 'installed|downloaded', fr: 'installé|téléchargé', es: 'instalado|descargado',
    obj: '[^.!?]{1,40}', tools: /^(run_command|run_recipe|offer_setup|work_on_repo|file_hands|fetch_page)$/ }
];
const CLAIM_EN = (v) => `\\b<I(?:'ve| have|)\\s+(?:just\\s+|now\\s+|already\\s+|also\\s+|successfully\\s+|gone ahead and\\s+|went ahead and\\s+)?(?:${v})\\b>`;
const CLAIM_FR = (v) => `\\b<j'ai\\s+(?:bien\\s+|déjà\\s+|aussi\\s+|maintenant\\s+|également\\s+)?(?:${v})\\b>`;
const CLAIM_ES = (v) => `\\b<(?:ya\\s+|también\\s+)?he\\s+(?:ya\\s+|también\\s+)?(?:${v})\\b>`;
for (const f of FAMILIES) f.re = rx(`(?:${CLAIM_EN(f.en)}|${CLAIM_FR(f.fr)}|${CLAIM_ES(f.es)})((?:[^.!?\\n]|\\.(?=\\S)){0,80})`);
const okRun = (a) => a && a.ok !== false && !a.declined && a.text !== 'declined';
const FILE_NAME = /(?<![\w/\\])[\w-]+\.[a-z][a-z0-9]{0,5}(?![\w])/gi;
const NOT_FILES = /^(?:e\.g|i\.e|etc\.?|vs|mr|mrs|dr|no)$/i;
const base = (p) => String(p || '').split(/[\\/]/).pop().toLowerCase();

// The "I did X" sentences with no step behind them. actions: the turn's tool runs ({ name, ok, args, text }).
// Returns [{ family, said }] (at most one per family).
export function unbackedClaims(reply, actions = []) {
  const out = [];
  const ok = actions.filter(okRun);
  // Code shown in the answer: "I've updated config.js" may be about that code, changed right here in the chat.
  const showsCode = /```/.test(String(reply || ''));
  for (const s of sentences(reply)) {
    if (NOT_YET.test(s)) continue;
    for (const f of FAMILIES) {
      if (out.some((o) => o.family === f.id) || (f.inChat && showsCode)) continue;
      const m = f.re.exec(s);
      if (!m) continue;
      const tail = m[1] || '';
      if (f.obj && !rx(`\\b<(?:${f.obj})\\b>`).test(tail)) continue;
      const did = ok.filter((a) => f.tools.test(String(a.name || '')));
      if (!did.length) { out.push({ family: f.id, what: f.what, said: s.trim().slice(0, 140) }); continue; }
      // Item by item: a file the claim names must be one a step touched.
      const names = [...tail.matchAll(FILE_NAME)].map((x) => x[0].toLowerCase()).filter((n) => !NOT_FILES.test(n) && !/^\d+\.\d+$/.test(n));
      if (names.length && !names.some((n) => did.some((a) => `${a.args || ''} ${a.text || ''}`.toLowerCase().includes(n) || base(a.file) === n))) out.push({ family: f.id, what: f.what, said: s.trim().slice(0, 140), file: names[0] });
    }
  }
  return out;
}

// ---------------------------------------------------------------- 186-188: numbers, quotes and links

// What Bob had in front of him this turn: tool results in full (ctx.seen), plus what was said in the chat.
const squash = (t) => plain(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const URL_RX = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;
const cleanUrl = (u) => String(u).replace(/[.,;:!?)\]}>'"*_]+$/, '');
const urlKey = (u) => cleanUrl(u).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '').replace(/\/+$/, '');
const HOME = /^(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d+)?(?:\/|$)/;

// 188: links in the answer that nothing this turn or in the chat showed him. A site's front page alone is allowed.
export function unseenLinks(reply, sources = []) {
  const seen = sources.join('\n');
  const keys = new Set((seen.match(URL_RX) || []).map(urlKey));
  const flat = seen.toLowerCase();
  const out = [];
  for (const raw of plain(reply).match(URL_RX) || []) {
    const u = cleanUrl(raw), k = urlKey(u);
    if (!k || HOME.test(k) || !k.includes('/')) continue; // a bare site name, or this replicant matrix's own pages
    if (keys.has(k) || [...keys].some((x) => x.startsWith(k) || k.startsWith(`${x}?`)) || flat.includes(k)) continue;
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

// 187: quotes (in quote marks, or a "> " line) that aren't in what he read. Only once he read something this turn;
// a short phrase (under 6 words) isn't a quote; "..." in a quote splits it into parts that must each be there.
export function unseenQuotes(reply, sources = []) {
  const t = plain(reply).replace(/```[\s\S]*?```/g, ' ');
  const hay = ` ${squash(sources.join('\n'))} `;
  const quotes = [...t.matchAll(/"([^"\n]{20,600})"/g)].map((m) => m[1]).concat([...t.matchAll(/^>\s?(.{20,600})$/gm)].map((m) => m[1]));
  const out = [];
  for (const q of quotes) {
    const parts = q.split(/\.\.\.|\u2026|\[\.\.\.\]/).map(squash).filter((p) => p.split(' ').length >= 3);
    if (!parts.length || squash(q).split(' ').length < 6) continue;
    if (parts.every((p) => hay.includes(` ${p} `))) continue;
    out.push(q.trim().slice(0, 120));
  }
  return out;
}

// 186: counts and sizes in the answer that no result holds. A size may be written another way (1.5 GB for
// 1,610,612,736 bytes, within 6%); a count may be one he counted off a list he was shown (no more than its lines).
const SIZE = { b: 1, byte: 1, bytes: 1, kb: 1024, kib: 1024, mb: 1024 ** 2, mib: 1024 ** 2, gb: 1024 ** 3, gib: 1024 ** 3, tb: 1024 ** 4, tib: 1024 ** 4, ko: 1024, mo: 1024 ** 2, go: 1024 ** 3, to: 1024 ** 4 };
const COUNT_NOUN = 'files?|folders?|lines?|items?|results?|errors?|warnings?|tests?|songs?|tracks?|photos?|pictures?|images?|videos?|emails?|messages?|rows?|entries|entry|pages?|words?|characters?|commits?|issues?|matches|hits?|fichiers?|dossiers?|lignes?|éléments?|résultats?|erreurs?|archivos?|ficheros?|carpetas?|líneas?|elementos?|resultados?|errores?';
const NUM = '(\\d{1,3}(?:[,\\s\\u202f]\\d{3})+|\\d+)(?:[.,](\\d+))?';
const SIZE_RX = rx(`\\b<${NUM}\\s?(bytes?|b|kib|kb|mib|mb|gib|gb|tib|tb|ko|mo|go|to)\\b>`, 'giu');
const COUNT_RX = rx(`\\b<${NUM}\\s+(?:[\\p{L}-]+\\s+)?(${COUNT_NOUN})\\b>`, 'giu');
const toNum = (int, frac) => Number(`${String(int).replace(/[,\s\u202f]/g, '')}${frac ? `.${frac}` : ''}`);
export function unbackedNumbers(reply, sources = [], lists = sources) {
  const t = plain(reply).replace(/```[\s\S]*?```/g, ' ').replace(URL_RX, ' ').replace(/(?:[A-Za-z]:\\|\/)[^\s]+/g, ' ');
  const seen = plain(sources.join('\n'));
  const nums = new Set([...seen.matchAll(/\d{1,3}(?:[,\s\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(/[,\s\u202f](?=\d{3}(?!\d))/g, '').replace(',', '.'))));
  const sizes = [...seen.matchAll(SIZE_RX)].map((m) => toNum(m[1], m[2]) * SIZE[m[3].toLowerCase()]).concat([...nums].filter((n) => n >= 1024));
  const lines = Math.max(0, ...lists.map((s) => String(s).split('\n').filter((l) => l.trim()).length));
  const out = [];
  for (const m of t.matchAll(SIZE_RX)) {
    const n = toNum(m[1], m[2]), bytes = n * SIZE[m[3].toLowerCase()];
    if (nums.has(n) || sizes.some((s) => Math.abs(s - bytes) <= bytes * 0.06)) continue;
    out.push(m[0].trim());
  }
  for (const m of t.matchAll(COUNT_RX)) {
    const n = toNum(m[1], m[2]);
    if (nums.has(n) || n <= lines + 1) continue;
    out.push(m[0].trim());
  }
  return [...new Set(out)].slice(0, 3);
}

// ---------------------------------------------------------------- 189: more switches

// Switches a brain is likely to say are on. Each: the setting's name as Settings shows it, the words a reply would
// use for it, where it is, and whether it's on. (said-done.js already knows web search, the workshop and the Hands.)
export const MORE_SWITCHES = [
  { key: 'quickNotes', name: 'Let Bob take quick notes', words: 'quick notes?|prise de notes|notas rápidas', where: 'Settings, How Bob works' },
  { key: 'docTools', name: 'Read and search my documents', words: 'document (?:tools|search|reading)|reading (?:your |my )?documents|search(?:ing)? (?:your |my )?documents', where: 'Settings, How Bob works' },
  { key: 'sandboxCode', name: 'Let Bob work things out in a sandbox', words: '(?:the |a |code |my )?sandbox|bac à sable|caja de arena', where: 'Settings, How Bob works' },
  { key: 'planFirst', name: 'Show Bob\'s plan before big jobs', words: 'plans? (?:first|before big jobs)|plan mode|show(?:ing)? (?:my |the )?plan', where: 'Settings, How Bob works' },
  { key: 'resumeJobs', name: 'Pick up where Bob left off after a restart', words: 'pick up where (?:i|bob) left off|resum(?:e|ing) jobs|carry on after a restart', where: 'Settings, How Bob works' },
  { key: 'memoryRecall', name: 'Remember only what fits', words: 'remember only what fits|memory recall', where: 'Settings, Speed & memory' },
  { key: 'toolLearning', name: 'Let Bob learn from his tools', words: 'learn(?:ing)? from (?:my|his) tools|tool learning', where: 'Settings, How Bob works' },
  { key: 'chatFiles', name: 'Save chats as files and bring chats in', words: 'sav(?:e|ing) chats as files|bring(?:ing)? chats in', where: 'Settings, How Bob works' }
];
export function moreSwitchesOff(cfg = {}) {
  return MORE_SWITCHES.filter((s) => cfg[s.key] !== true).map(({ key, name, where, words }) => ({ key, name, where, words }));
}

// ---------------------------------------------------------------- the whole check

// All of the above for one finished answer. Returns { notes: [...], kinds: [...], strike } or null.
// actions: the turn's tool runs; seen: the turn's tool results in full; chat: what was said in the chat (the user's
// words, earlier tool results), so a link or number he was given counts as seen.
export function checkRecord(reply, { actions = [], seen = [], chat = [] } = {}) {
  const text = String(reply || '');
  if (!text.trim()) return null;
  const notes = [], kinds = [];
  const claims = unbackedClaims(text, actions);
  if (claims.length) {
    kinds.push('record');
    const c = claims[0];
    notes.push(c.file ? `Not done: Bob said "${c.said}", but no step touched ${c.file}.` : `Not done: Bob said "${c.said}", but no step did that.`);
  }
  const sources = [...seen, ...chat];
  const links = unseenLinks(text, sources);
  if (links.length) { kinds.push('link'); notes.push(`Bob didn't read ${links.length === 1 ? 'this link' : 'these links'} anywhere, so check before you use ${links.length === 1 ? 'it' : 'them'}: ${links.slice(0, 2).join(' ')}`); }
  const readSomething = actions.some((a) => okRun(a) && /read|fetch|search|browse|look|recall|find|office_read|inspect|git_look|code_map|list/.test(String(a.name || '')));
  if (readSomething && seen.length) {
    const quotes = unseenQuotes(text, sources);
    if (quotes.length) { kinds.push('quote'); notes.push(`This quote isn't in what Bob read: "${quotes[0]}"`); }
  }
  if (seen.length) {
    const nums = unbackedNumbers(text, sources, seen);
    if (nums.length) { kinds.push('number'); notes.push(`Check ${nums.length === 1 ? 'this number' : 'these numbers'}: ${nums.map((n) => `"${n}"`).join(', ')}. No result Bob got shows ${nums.length === 1 ? 'it' : 'them'}.`); }
  }
  if (!notes.length) return null;
  return { notes: notes.slice(0, 2), kinds, strike: claims.length > 0 };
}
