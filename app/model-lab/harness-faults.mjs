// What the test world got wrong in one do-jobs run (16 Nov 2026; MouseWurX: "we need to close the gaps in the harness").
// The 800-job read found 47 runs whose outcome the test world decided, not the brain: files the scene asked for and the
// test home couldn't make, scene replies cut off mid-JSON, OK cards answered "no", scripts left outside a project, an
// "I'll type it" pick that gave the brain nothing, llama-server refusing half an emoji, diagrams with no window to draw
// them, and a folder the scene made but didn't allow. Each kind is named here from the run row alone, so do-jobs counts
// them as it goes (and stops a rental early when the world is broken), the self-test checks none happen, and a read
// can leave these runs out instead of blaming the brain.
const calls = (row) => (row?.steps || []).flatMap((s) => s.calls || []);
export const FAULTS = {
  scene_lost: 'the scene reply could not be read, so the test home started empty',
  file_not_made: 'a file the scene asked for was not made',
  engine_refused: 'llama-server refused the request (a broken request, not the brain)',
  card_said_no: "an OK card came back as the user saying no (the test person always says yes)",
  code_outside_project: "a planted script sat outside a project, so Bob's guard refused to edit it",
  typed_pick: 'ask_user picked a "let me type it" choice, so nothing was typed',
  no_window: 'a diagram waited for a chat window that never drew it',
  folder_not_allowed: 'a folder the scene made was not one Bob may use',
  scene_missing_file: 'the request names a file the scene never made',
  scene_missing_folder: 'the request names a folder the scene never made',
  // 16 Nov (office coverage, MouseWurX: "starting with office files")
  office_missing: 'an office tool found no LibreOffice in the test world (do-jobs --office)',
  tool_switched_off: 'a tool the job needs was switched off in the test Bob',
  path_not_moved: "a path in a tool's arguments was never moved into the test home",
  office_file_missing: "an office job's own file was not planted",
  // 21 Nov (repository jobs, repo-jobs.mjs)
  repo_not_planted: "a repository job's project was not made (git missing or failing in the test home)"
};
// Folder names a request gives in quotes ("the folder 'Old Projects (2020-2021)'", "'Q3' folder"), not ones Bob is asked to
// make or rename to (16 Nov, GPT-OSS trial: a rename job had no folder to rename, so the brain could only ask where it was)
export function namedFolders(text) {
  const t = String(text || ''), out = new Set();
  const made = (i) => /(?:creat(?:e|ing)|mak(?:e|ing)|new|into|to|as|named?|call(?:ed)?)\s*$/i.test(t.slice(Math.max(0, i - 30), i).replace(/\b(?:folder|directory)\s*$/i, '').trim() + ' ') && !/\b(?:the|my|this)\s+(?:folder|directory)\s*$/i.test(t.slice(Math.max(0, i - 30), i));
  const Q = `['"‘“]([^'"’”\\\\/\\n]{1,80})['"’”]`;
  for (const m of t.matchAll(new RegExp(`\\b(?:folder|directory)\\s+(?:named\\s+|called\\s+)?${Q}`, 'gi'))) if (!made(m.index + m[0].indexOf(m[1]) - 1)) out.add(m[1].trim());
  for (const m of t.matchAll(new RegExp(`${Q}\\s+(?:folder|directory)\\b`, 'gi'))) if (!made(m.index)) out.add(m[1].trim());
  return [...out].filter((n) => n && !/\.[a-z0-9]{1,5}$/i.test(n) && !/^[A-Za-z]:/.test(n));
}
// File names a request gives (C:\\x\\a.mp4, /home/user/a.mp4, ~/a.txt, "Q3 report.docx", `db.py`), as written
const EXT = '(?:txt|md|csv|tsv|json|ya?ml|xml|log|ini|cfg|conf|toml|py|js|mjs|ts|sh|bat|cmd|ps1|html?|css|sql|docx?|xlsx?|pptx?|pdf|rtf|odt|zip|tar|gz|tgz|png|jpe?g|gif|bmp|webp|tiff?|ico|psd|mp3|wav|flac|ogg|m4a|aac|mp4|mov|mkv|avi|webm|exe|dll|msi)';
export function namedFiles(text) {
  const t = String(text || ''), out = new Set();
  // a name the job asks Bob to make ("save it as", "into", "named", "create", "convert to") is an answer, not a start
  const made = (i) => /(?:sav(?:e|ing)|stor(?:e|ing)|put|place|writ(?:e|ing)|creat(?:e|ing)|mak(?:e|ing)|export(?:ing)?|output|generat(?:e|ing)|rename[ds]?|renaming|call(?:ed|ing)?|name[ds]?|naming|title[ds]?|convert(?:ed|ing)?|compress(?:ed|ing)?|zip(?:ped|ping)?|turn(?:ed|ing)?|new file|copy|move)\b[^.!?\n]{0,40}$|\b(?:as|into|to)\s+['"`‘“]?$/i.test(t.slice(Math.max(0, i - 60), i));
  const add = (name, at) => { if (!made(at)) out.add(name); };
  for (const m of t.matchAll(new RegExp(`(?:[A-Za-z]:[\\\\/]|~[\\\\/]|/)[^\\s'"\`<>|*?]*?\\.${EXT}(?![\\w.])`, 'gi'))) add(m[0], m.index);
  for (const m of t.matchAll(new RegExp(`['"\`‘“]([^'"\`’”\\n\\\\/]{1,80}?\\.${EXT})['"\`’”]`, 'gi'))) add(m[1], m.index);
  for (const m of t.matchAll(new RegExp(`(?<![\\w.\\\\/-])([\\w-]{1,60}\\.${EXT})(?![\\w.])`, 'gi'))) add(m[1], m.index);
  return [...out].filter((f) => !/^https?:/i.test(f));
}
const base = (p) => String(p).split(/[\\/]/).pop().toLowerCase();
// the choice wordings that mean "I'll type it myself" (do-jobs never picks these unless nothing else is offered)
export const TYPED_CHOICE = /^(?:i'?ll|let me|i will|i want to|i'd like to)\s+(?:type|tell|enter|write|give|say|paste|send|share|upload|provide|specify|name)\b|^(?:here(?:'s| is)|my)\b.*:\s*$|:\s*$|^(?:other|something else|none of (?:these|the above)|custom|type (?:it|my own)|enter (?:it|my own))\b/i;

export function harnessFaults(row) {
  const out = [];
  const add = (kind, detail) => { if (!out.some((f) => f.kind === kind)) out.push({ kind, detail: String(detail || '').slice(0, 200) }); };
  const sc = row?.scene || {};
  for (const p of sc.problems || []) if (/^not JSON|^not a JSON object|^scene not made/.test(p)) add('scene_lost', p);
  for (const s of sc.skipped || []) add('file_not_made', `${s.path}: ${s.why}`);
  if (/llama-server [45]\d\d/.test(row?.error || '')) add('engine_refused', row.error);
  // only when the run had a scene: a job with none (--scene off) starts empty on purpose
  if (sc.made && sc.made !== 'none') {
    const have = new Set([...(sc.files || []), ...(sc.skipped || []).map((x) => x.path), ...(row?.planted || [])].map(base));
    const made = (sc.files || []).concat(row?.planted || []).map((f) => String(f).toLowerCase());
    for (const f of namedFiles(row?.text || row?.request)) if (!have.has(base(f)) && !made.some((m) => m.endsWith(base(f)))) add('scene_missing_file', f);
    const dirs = [...(sc.folders || []), ...(sc.files || []).map((f) => String(f).replace(/[\\/][^\\/]*$/, ''))].flatMap((d) => String(d).split(/[\\/]/)).map((x) => x.toLowerCase());
    for (const d of namedFolders(row?.text || row?.request)) if (!dirs.includes(d.toLowerCase())) add('scene_missing_folder', d);
  }
  const planted = [...(sc.folders || []), ...(sc.files || []).map((f) => String(f).replace(/[\\/][^\\/]*$/, ''))].map((x) => String(x).toLowerCase().replace(/\//g, '\\'));
  for (const m of row?.office?.missing || []) add('office_file_missing', m);
  for (const m of row?.repo?.missing || []) add('repo_not_planted', m);
  for (const c of calls(row)) {
    const res = String(c.result || '');
    if (/^(?:Error: )?There's no LibreOffice/.test(res)) add('office_missing', `${c.name}: ${res.slice(0, 80)}`);
    if (/^Comparing files is off\.|is off\. It's in Settings, How Bob works, 🧰 More tools/.test(res)) add('tool_switched_off', `${c.name}: ${res.slice(0, 80)}`);
    if (/Give the full path/.test(res) && /^(?:[A-Za-z]:\\|~)/.test(String(Object.values(c.args || {}).find((v) => typeof v === 'string' && /^(?:[A-Za-z]:\\|~)/.test(v)) || ''))) add('path_not_moved', `${c.name}: ${res.slice(0, 80)}`);
    if (c.name === 'ask_together' && /^The user said no/.test(res)) add('card_said_no', res);
    if (/outside a project/i.test(res) && /^(?:edit_file|write_file|ask_together)$/.test(c.name)) add('code_outside_project', res);
    if (c.name === 'ask_user' && !/typed: nothing more to add/.test(res)) { const m = res.match(/picked: ([^\n]*)/); if (m && TYPED_CHOICE.test(m[1].trim())) add('typed_pick', m[1]); }
    if (c.name === 'make_diagram' && /^Drawing: /.test(res) && (!c.drawn || /^(?:nothing drawn|not )/.test(c.drawn))) add('no_window', c.drawn || res.slice(0, 120));
    if (/is outside the folders Bob may use here|isn't one of the folders|not one of the folders|I can only work with files in|I'm not allowed to look in/i.test(res)) {
      for (const raw of [c.args?.path, c.args?.folder, c.args?.from, c.args?.to, ...[].concat(c.args?.paths || [])]) {
        const p = String(raw || '').toLowerCase().replace(/\//g, '\\').replace(/\\+$/, '');
        // a whole drive (C:\\) is never ticked by a person, so refusing it is right, not a gap (800-job replay: 3 runs)
        if (p && !/^[a-z]:$|^\\$|^$/.test(p) && planted.some((d) => d === p || d.startsWith(p + '\\'))) { add('folder_not_allowed', `${c.name} ${p}`); break; }
      }
    }
  }
  return out;
}

// Counts by kind over many rows: { runs: n with any, byKind: { kind: n } }
export function faultCounts(rows) {
  const byKind = {}; let runs = 0;
  for (const r of rows || []) { const f = harnessFaults(r); if (f.length) runs++; for (const x of f) byKind[x.kind] = (byKind[x.kind] || 0) + 1; }
  return { runs, byKind };
}
