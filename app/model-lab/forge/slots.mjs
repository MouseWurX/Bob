// How many server slots a plan command keeps busy at once (forge.mjs pre-flight). A jobs matrix runs every variant at
// the same time: each variant uses its own --parallel, else the matrix's, else do-jobs' default of 2.
// 16 Nov: the old check multiplied the first --parallel it found (a variant's 4) by the number of variants.
export function slotsUsed(cmd, dflt = 2) {
  const c = String(cmd || '');
  const vm = c.match(/--variants\s+("([^"]*)"|(\S+))/);
  const rest = vm ? c.replace(vm[0], ' ') : c;
  const own = (s) => { const m = String(s).match(/--parallel\s+(\d+)/); return m ? Number(m[1]) : null; };
  const top = own(rest);
  if (!/jobs-matrix\.mjs/.test(c) || !vm) return top ?? 1;
  const variants = (vm[2] ?? vm[3] ?? '').split(';').map((x) => x.trim()).filter(Boolean);
  if (!variants.length) return top ?? dflt;
  return variants.reduce((n, v) => n + (own(v.slice(v.indexOf('=') + 1)) ?? top ?? dflt), 0);
}
