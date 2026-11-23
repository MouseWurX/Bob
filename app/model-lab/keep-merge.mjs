// 23 Nov 2026 (the owner, after REAP's 80% level dropped 2 office jobs: "do we selectively keep more office experts to
// make up for that drop?"): one keep list made from a base list (all-keep-80.json, every job kind together) with the
// experts one kind relies on kept too (office-keep-90.json), layer by layer. A layer either list keeps whole stays
// whole. It says how many experts that really keeps, since protecting a kind keeps more than the base share.
//   node keep-merge.mjs --base keep/all-keep-80.json --protect keep/<office target>-keep-90.json --out keep/all-80-office-90.json [--experts 512]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function mergeKeep(base, protect, experts = 0) {
  const a = base.keep || [], b = protect.keep || [], n = Math.max(a.length, b.length);
  const keep = [];
  let kept = 0, layers = 0, whole = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (x === null || y === null || x === undefined || y === undefined) { keep.push(null); whole++; continue; }
    const u = [...new Set([...x, ...y])].sort((p, q) => p - q);
    keep.push(u); kept += u.length; layers++;
  }
  const share = experts > 0 && layers ? kept / (layers * experts) : null;
  return { target: `${base.target || 'base'}+${protect.target || 'protect'}`, share, base_share: base.share ?? null, protect_share: protect.share ?? null, by: base.by || protect.by || 'mass', keep, masked_layers: layers, whole_layers: whole, kept_per_layer: layers ? Math.round((kept / layers) * 10) / 10 : null };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : ''; };
  const read = (f) => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
  if (!opt('base') || !opt('protect') || !opt('out')) { console.error('--base <keep.json> --protect <keep.json> --out <keep.json> are needed'); process.exit(1); }
  const m = mergeKeep(read(opt('base')), read(opt('protect')), Number(opt('experts')) || 0);
  fs.mkdirSync(path.dirname(path.resolve(opt('out'))), { recursive: true });
  fs.writeFileSync(path.resolve(opt('out')), JSON.stringify(m));
  console.log(`${opt('out')}: ${m.kept_per_layer} experts kept per masked layer (${m.masked_layers} masked, ${m.whole_layers} whole)${m.share !== null ? `, ${Math.round(m.share * 1000) / 10}% of the experts` : ''}; base ${m.base_share}, protected ${m.protect_share}`);
}
