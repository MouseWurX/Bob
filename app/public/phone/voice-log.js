// 🎙 Voice log (Bob for Android, Phone brain page, Tools; off to start with): say a name and a number ("water 52",
// "400 rate", "next stage") and it goes in a spreadsheet, with the time, and is read back to you. For logging work
// with your hands full: one workbook per job with two sheets.
//   Stages: one row per stage, one column per name: the last value said for it in that stage, so totals said at the
//           end of a stage are that stage's totals.
//   Log:    one row per value said: time, stage, name, value, and the change from the last value of that name.
// Counts of what's on hand go in an Inventory sheet (an item per row, a place per column), and stage totals come off
// what's left. Your own formulas can be worked out by voice ("work out mix with water 40").
// The names, words, units and formulas are yours, typed in on the phone; only made-up examples ship with Bob.
// Plain code reads what you say, not the brain: it's instant, works with no brain loaded, and never guesses. Words it
// doesn't know are asked back. No imports: the page loads it with a <script> tag, the tests with import(); both read
// globalThis.BobVoiceLog. It uses BobPhoneTools for the .xlsx file.
(function (root) {
  const T = () => root.BobPhoneTools;

  // The names to listen for, one per line: "Name: other, other" (the other ways a phone may hear it). Saying a number
  // with a name logs its total for the stage ("water 52"); with a measure word it logs its measure ("water rate 40",
  // "400 rate"). A measure with no name ("400 rate") is the one marked "(measure default)", and the read-back says so.
  //   (0-500)            which totals make sense; anything outside is asked back, not logged
  //   (measure 25-1600)  which measures make sense
  //   (unit L/min)       the measure's unit, said in read-backs
  //   (draws per 1000)   a stage total of 1000 takes 1 off the stock (litres said, cubic metres counted)
  // Lines on their own: "measure: rate, speed" (the measure words, the first one used in columns), "stock unit: L"
  // (the unit counts are in). Lines starting with # are notes.
  const DEFAULT_NAMES = ['measure: rate, flow', 'stock unit: L', 'Water (measure 1-500) (measure default) (unit L/min): water', 'Feed: feed, feet', 'Fuel: fuel, diesel', 'Seed (0-200): seed, seeds'].join('\n');

  function readNames(textIn) {
    const out = [];
    out.measure = []; out.stockUnit = '';
    for (const raw of String(textIn ?? DEFAULT_NAMES).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const mw = line.match(/^measure( words?)?\s*:\s*(.+)$/i);
      if (mw) { out.measure = mw[2].split(',').map((x) => norm(x)).filter(Boolean); continue; }
      const su = line.match(/^stock unit\s*:\s*(.{0,20})$/i);
      if (su) { out.stockUnit = su[1].trim(); continue; }
      const at = line.indexOf(':');
      const headIn = at < 0 ? line : line.slice(0, at), rest = at < 0 ? '' : line.slice(at + 1);
      const range = (re) => { const m = headIn.match(re); return m ? { min: Math.min(+m[1], +m[2]), max: Math.max(+m[1], +m[2]) } : null; };
      const NUM = '(-?\\d+(?:\\.\\d+)?)\\s*(?:-|to)\\s*(-?\\d+(?:\\.\\d+)?)';
      const total = range(new RegExp(`\\(\\s*${NUM}\\s*\\)`)), measure = range(new RegExp(`\\(\\s*measure\\s+${NUM}\\s*\\)`, 'i'));
      const name = headIn.replace(/\([^)]*\)/g, '').trim().replace(/[\\/?*[\]:]/g, '').slice(0, 40);
      if (!name || out.some((n) => n.name.toLowerCase() === name.toLowerCase())) continue;
      const also = [name, ...rest.split(',')].map((x) => norm(x)).filter(Boolean);
      const isDefault = /\(\s*measure default\s*\)/i.test(headIn);
      const unit = (headIn.match(/\(\s*unit\s+([^)]{1,20})\)/i)?.[1] || '').trim();
      const per = Number(headIn.match(/\(\s*draws per\s+(\d+(?:\.\d+)?)\s*\)/i)?.[1]) || 1;
      out.push({ name, also: [...new Set(also)], total, measure, isDefault, unit, per });
    }
    if (!out.measure.length) out.measure = ['rate'];
    for (const n of out) n.also = n.also.filter((a) => !out.measure.includes(a));
    return out;
  }

  // Lower case, words and numbers only (a decimal point stays), "four hundred" -> "400".
  function norm(s) {
    return words2num(String(s).toLowerCase().replace(/(\d),(\d{3})\b/g, '$1$2').replace(/[^a-z0-9.\-\s]/g, ' ').replace(/(?<!\d)\.|\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim());
  }

  const SMALL = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  // Speech-to-text usually writes digits, but not always: "four hundred and fifty point five" -> 450.5.
  function words2num(s) {
    const t = s.split(' ');
    const out = [];
    for (let i = 0; i < t.length; i++) {
      if (!(t[i] in SMALL) && t[i] !== 'hundred' && t[i] !== 'thousand' && !(t[i] === 'point' && /^\d/.test(out.at(-1) || ''))) { out.push(t[i]); continue; }
      if (t[i] === 'point') { // "52 point 2 8" -> 52.28
        let d = '';
        while (i + 1 < t.length && (/^\d$/.test(t[i + 1]) || (t[i + 1] in SMALL && SMALL[t[i + 1]] < 10))) { i++; d += /^\d$/.test(t[i]) ? t[i] : SMALL[t[i]]; }
        if (d) out[out.length - 1] = `${out.at(-1)}.${d}`; else out.push('point');
        continue;
      }
      let total = 0, cur = 0, used = false, unit = false;
      while (i < t.length && (t[i] in SMALL || t[i] === 'hundred' || t[i] === 'thousand' || (t[i] === 'and' && used && t[i + 1] in SMALL))) {
        const w = t[i];
        if (w === 'and') { i++; continue; }
        // "two two two" is three numbers (a name like "XR two two two"), not six: a unit or a teen can't follow one.
        if (w in SMALL && unit && SMALL[w] < 20) break;
        unit = w in SMALL && SMALL[w] < 20;
        if (w === 'hundred') cur = (cur || 1) * 100;
        else if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
        else cur += SMALL[w];
        used = true; i++;
      }
      i--;
      out.push(String(total + cur));
    }
    return out.join(' ');
  }

  // ---- 🧮 Your formulas, one per line: "Mix = Water / (Feed * 1000) + 1". A formula can use another one by its
  // name ("Total = Mix * Fuel"); any other name is an input you give. "Pump size = 45.6" is a fixed number. Only
  // + - * / ^ and brackets: no code runs. × and ÷ work too.
  const key = (s) => norm(s);
  function readFormulas(text) {
    const out = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const at = line.indexOf('=');
      if (at < 1) continue;
      const name = line.slice(0, at).trim().slice(0, 60), expr = line.slice(at + 1).trim();
      if (!name || !expr || out.some((f) => key(f.name) === key(name))) continue;
      out.push({ name, expr });
    }
    for (const f of out) { try { f.parts = tokens(f.expr); } catch (e) { f.error = e.message; } }
    return out;
  }
  function tokens(exprIn) {
    const expr = exprIn.replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-');
    const out = [];
    let i = 0;
    while (i < expr.length) {
      const c = expr[i];
      if (/\s/.test(c)) { i++; continue; }
      if ('+-*/^()'.includes(c)) { out.push({ op: c }); i++; continue; }
      const m = expr.slice(i).match(/^[^+\-*/^()]+/);
      const word = m[0].trim();
      i += m[0].length;
      if (/^\d*\.?\d+(e[+-]?\d+)?$/i.test(word)) out.push({ num: Number(word) });
      else if (/[a-z]/i.test(word)) out.push({ name: word });
      else throw new Error(`"${word}" isn't a number or a name`);
    }
    return out;
  }
  // The inputs a formula needs (names that aren't formulas), through the formulas it uses.
  function inputsOf(formulas, name, seen = new Set()) {
    const f = formulas.find((x) => key(x.name) === key(name));
    if (!f || seen.has(key(f.name)) || !f.parts) return [];
    seen.add(key(f.name));
    const out = [];
    for (const t of f.parts) {
      if (!t.name) continue;
      const sub = formulas.find((x) => key(x.name) === key(t.name));
      for (const n of sub ? inputsOf(formulas, sub.name, seen) : [t.name]) if (!out.some((o) => key(o) === key(n))) out.push(n);
    }
    return out;
  }
  // Works out a formula. inputs: { name: number } (any spelling case). Answers { value } or { missing: [names] } or
  // { error }.
  function workOut(formulas, name, inputs = {}, depth = 0) {
    const f = formulas.find((x) => key(x.name) === key(name));
    if (!f) return { error: `there's no formula called ${name}` };
    if (f.error) return { error: `${f.name} can't be worked out: ${f.error}` };
    if (depth > 20) return { error: `${f.name} uses itself` };
    const have = new Map(Object.entries(inputs).map(([k, v]) => [key(k), Number(v)]));
    const missing = inputsOf(formulas, f.name).filter((n) => !Number.isFinite(have.get(key(n))));
    if (missing.length) return { missing };
    const vals = [];
    for (const t of f.parts) {
      if (!t.name) { vals.push(t); continue; }
      if (have.has(key(t.name))) { vals.push({ num: have.get(key(t.name)) }); continue; }
      const r = workOut(formulas, t.name, inputs, depth + 1);
      if (r.value === undefined) return r;
      vals.push({ num: r.value });
    }
    // Brackets, then ^, then * /, then + - (a minus at the start or after an operator is a negative number).
    let p = 0;
    const peek = () => vals[p]?.op;
    const atom = () => {
      const t = vals[p++];
      if (!t) throw new Error('it ends too soon');
      if (t.op === '(') { const v = sum(); if (vals[p++]?.op !== ')') throw new Error('a bracket isn\'t closed'); return v; }
      if (t.op === '-') return -power();
      if (t.op === '+') return power();
      if (t.num === undefined) throw new Error(`"${t.op}" is in the wrong place`);
      return t.num;
    };
    const power = () => { const b = atom(); if (peek() === '^') { p++; return b ** power(); } return b; };
    const product = () => { let v = power(); while (peek() === '*' || peek() === '/') { const o = vals[p++].op, w = power(); if (o === '/' && w === 0) throw new Error('it divides by zero'); v = o === '*' ? v * w : v / w; } return v; };
    const sum = () => { let v = product(); while (peek() === '+' || peek() === '-') { const o = vals[p++].op, w = product(); v = o === '+' ? v + w : v - w; } return v; };
    try {
      const v = sum();
      if (p < vals.length) throw new Error(`there's something extra after ${p} parts`);
      if (!Number.isFinite(v)) throw new Error('the answer isn\'t a number');
      return { value: v };
    } catch (e) { return { error: `${f.name} can't be worked out: ${e.message}` }; }
  }
  // "work out mix with water 40 feed 2.5" -> { kind: 'formula', name, given: { Water: 40, Feed: 2.5 } }
  function parseFormula(s, formulas) {
    const m = s.match(/^(?:work out|what s|whats|what is|calculate|figure out|figure|get)(?: the| my)? (.+?)(?: (?:with|using|for|when|if) (.+))?$/);
    if (!m || !formulas.length) return null;
    const f = formulas.find((x) => key(x.name) === m[1]);
    if (!f) return null;
    const given = {};
    if (m[2]) {
      let rest = ` ${m[2].replace(/\b(and|is|at|equals)\b/g, ' ').replace(/\s+/g, ' ').trim()} `;
      const names = inputsOf(formulas, f.name).sort((a, b) => key(b).length - key(a).length);
      for (const n of names) {
        const k = key(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hit = rest.match(new RegExp(` ${k} (-?\\d+(?:\\.\\d+)?) `)) || rest.match(new RegExp(` (-?\\d+(?:\\.\\d+)?) ${k} `));
        if (hit) { given[n] = Number(hit[1]); rest = rest.replace(hit[0], ' '); }
      }
      const loose = rest.trim().split(' ').filter((w) => /^-?\d/.test(w));
      if (loose.length) return { kind: 'unknown', heard: s, why: `a number with no input name (${loose.join(', ')}). ${f.name} takes ${names.length ? names.join(', ') : 'nothing'}` };
    }
    return { kind: 'formula', name: f.name, given };
  }

  const placeName = (u) => (/^\d/.test(u) ? u : u[0].toUpperCase() + u.slice(1));
  const isNum = (w) => /^-?\d+(\.\d+)?$/.test(w);
  const FILLER = new Set(['is', 'at', 'to', 'now', 'of', 'equals', 'equal', 'was', 'for', 'the', 'set', 'log', 'put', 'and', 'on', 'total', 'stage-total']);

  // What was said. Answers one of:
  //   { kind: 'values', values: [{ name, measure, column, value, unit?, bare? }] }  (column is "Water" or "Water rate (L/min)")
  //   { kind: 'stage', to: number | 'next' | 'back' }
  //   { kind: 'inv', op: 'count' | 'reload', place, values } | { kind: 'source', name, place } | { kind: 'bags', name, pallets, bags }
  //   { kind: 'formula', name, given }
  //   { kind: 'undo' } | { kind: 'repeat' }
  //   { kind: 'unknown', heard, why } when a name or a number is missing or a value makes no sense; nothing is written.
  function parse(textIn, names, formulas = []) {
    const heard = String(textIn || '').trim();
    let s = norm(heard);
    const MW = names.measure || ['rate'], mw = MW[0];
    if (!s) return { kind: 'unknown', heard, why: 'nothing heard' };
    if (/^(undo|scratch that|take that back|delete (that|the last( one)?)|cancel( that)?|oops)$/.test(s)) return { kind: 'undo' };
    if (/^(repeat|say (that|it) again|what was (that|the last( one)?))$/.test(s)) return { kind: 'repeat' };
    if (/^(next|new|start( the)? next|start( a)? new) stage$/.test(s) || /^stage (up|next)$/.test(s)) return { kind: 'stage', to: 'next' };
    if (/^(previous|last|back a|go back a) stage$/.test(s)) return { kind: 'stage', to: 'back' };
    const st = s.match(/^(?:go to |start |we're on |we are on |on )?stage (\d{1,4})$/);
    if (st) return { kind: 'stage', to: Number(st[1]) };
    const fo = parseFormula(s, formulas);
    if (fo) return fo.kind === 'unknown' ? { ...fo, heard } : fo;
    // 📦 What's on hand: "count shed feed 4 fuel 2" (what's in a place now), "reload barn fuel 2" (a delivery, added),
    // "drawing fuel from shed" (stage totals come off that place), "seed 2 pallets 5 bags".
    const inv = s.match(/^(count|counted|reload|reloaded|delivery|delivered|load|loaded)( unit| place| at| on)? ([a-z0-9-]+) (.+)$/);
    if (inv) {
      const op = /^(reload|delivery|delivered|load|loaded)/.test(inv[1]) ? 'reload' : 'count';
      const r = parse(inv[4], names);
      if (r.kind !== 'values') return { ...r, heard };
      if (r.values.some((v) => v.measure)) return { kind: 'unknown', heard, why: `a count is an amount, not a ${mw}` };
      return { kind: 'inv', op, place: placeName(inv[3]), values: r.values };
    }
    const dr = s.match(/^(?:draw|drawing|draws|pull|pulling|pump|pumping|use|using) (.+?) (?:from|off|out of)( unit| place)? ([a-z0-9-]+)$/);
    if (dr) {
      const n = names.find((x) => x.also.includes(dr[1]));
      if (!n) return { kind: 'unknown', heard, why: `"${dr[1]}" isn't a name I know` };
      return { kind: 'source', name: n.name, place: placeName(dr[3]) };
    }
    const pal = s.match(/(\d+) (?:pallets?|palettes?|skids?)/), bag = s.match(/(\d+) (?:bags?|sacks?)/);
    if (pal || bag) {
      const rest = s.replace(/(\d+) (?:pallets?|palettes?|skids?|bags?|sacks?)/g, ' ').replace(/\b(and|of)\b/g, ' ').replace(/\s+/g, ' ').trim();
      const n = names.find((x) => x.also.includes(rest));
      if (!n) return { kind: 'unknown', heard, why: `pallets or bags of what? "${rest}" isn't a name I know` };
      return { kind: 'bags', name: n.name, pallets: pal ? Number(pal[1]) : 0, bags: bag ? Number(bag[1]) : 0 };
    }
    // Names (longest other-way first, so "xr 222" wins over "xr") and the measure words, each swapped for one marker.
    const all = names.flatMap((n) => n.also.map((a) => ({ a, n }))).sort((x, y) => y.a.length - x.a.length);
    const marks = [];
    const mark = (a, item) => { s = s.replace(new RegExp(`(^| )${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?= |$)`, 'g'), (m, pre) => { marks.push(item); return `${pre}\u0001${marks.length - 1}`; }); };
    for (const { a, n } of all) mark(a, n);
    for (const w of [...MW].sort((x, y) => y.length - x.length)) mark(w, 'measure');
    const toks = s.split(' ').filter((w) => w && !FILLER.has(w));
    const at = (i) => (toks[i]?.[0] === '\u0001' ? marks[Number(toks[i].slice(1))] : null);
    if (!marks.length || marks.every((m) => m === 'measure') && !names.some((n) => n.isDefault)) return { kind: 'unknown', heard, why: 'no name I know' };
    // Units: a name ("water"), or a name's measure ("water rate", "rate water", "water 40 rate"), or a bare measure.
    const units = [];
    const taken = new Set();
    for (let i = 0; i < toks.length; i++) {
      const m = at(i);
      if (!m || taken.has(i)) continue;
      if (m !== 'measure') {
        if (at(i + 1) === 'measure' && !taken.has(i + 1)) { units.push({ i, lo: i, hi: i + 1, item: m, measure: true }); taken.add(i + 1); }
        else if (at(i - 1) === 'measure' && !taken.has(i - 1)) { units.push({ i, lo: i - 1, hi: i, item: m, measure: true }); taken.add(i - 1); }
        else if (isNum(toks[i + 1] || '') && at(i + 2) === 'measure' && !taken.has(i + 2)) { units.push({ i, lo: i, hi: i + 2, mid: i + 1, item: m, measure: true }); taken.add(i + 2); }
        else units.push({ i, lo: i, hi: i, item: m, measure: false });
        taken.add(i);
      }
    }
    for (let i = 0; i < toks.length; i++) {
      if (at(i) !== 'measure' || taken.has(i)) continue;
      const d = names.find((n) => n.isDefault);
      if (!d) return { kind: 'unknown', heard, why: `${mw} of what? Say the name too, like "${names[0]?.name || 'water'} ${mw} 40"` };
      units.push({ i, lo: i, hi: i, item: d, measure: true, bare: true });
      taken.add(i);
    }
    units.sort((x, y) => x.i - y.i);
    // Which side the numbers are on: "400 rate" (number first) or "water 52" (name first), from how it starts.
    const numberFirst = isNum(toks[0]);
    const used = new Set(), values = [];
    for (const u of units) {
      const order = u.mid != null ? [u.mid] : numberFirst ? [u.lo - 1, u.hi + 1] : [u.hi + 1, u.lo - 1];
      const j = order.find((k) => k >= 0 && k < toks.length && isNum(toks[k]) && !used.has(k));
      const label = u.measure ? `${u.item.name} ${mw}${u.item.unit ? ` (${u.item.unit})` : ''}` : u.item.name;
      if (j === undefined) return { kind: 'unknown', heard, why: `no number for ${label}` };
      used.add(j);
      const v = Number(toks[j]), r = u.measure ? u.item.measure : u.item.total;
      if (r && (v < r.min || v > r.max)) return { kind: 'unknown', heard, why: `${u.item.name}${u.measure ? ` ${mw}` : ''} ${v} is outside ${r.min} to ${r.max}` };
      values.push({ name: u.item.name, measure: u.measure, column: label, value: v, ...(u.measure && u.item.unit ? { unit: u.item.unit } : {}), ...(u.bare ? { bare: true } : {}) });
    }
    const loose = toks.filter((w, i) => isNum(w) && !used.has(i));
    if (loose.length) return { kind: 'unknown', heard, why: `a number with no name (${loose.join(', ')})` };
    return { kind: 'values', values };
  }

  // Units read out in words, not symbols.
  const spoken = (u) => ({ 'kg/m³': 'kilograms per cubic metre', 'kg/m3': 'kilograms per cubic metre', 'l/1000l': 'litres per thousand litres', 'l/min': 'litres per minute', 'm³': 'cubic metres', m3: 'cubic metres', l: 'litres', kg: 'kilograms', 'm³/min': 'cubic metres a minute', '%': 'percent' }[String(u).toLowerCase()] || u);
  const label = (n, mw) => `${n.name} ${mw}${n.unit ? ` (${n.unit})` : ''}`;
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const num = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6));
  const LOG_HEAD = ['Time', 'Stage', 'Name', 'Value', 'Change'];

  async function newBook(names) {
    const P = T();
    let r = await P.sheetCreate({ sheet: 'Stages', rows: [['Stage', 'Updated', ...names.flatMap((n) => (n.isDefault ? [n.name, label(n, (names.measure || ['rate'])[0])] : [n.name]))]] }); // other measures get a column when first said
    r = await P.sheetAdd(r.bytes, { sheet: 'Log' });
    r = await P.sheetChange(r.bytes, { sheet: 'Log', rows: [LOG_HEAD], at: 'A1' });
    return r.bytes;
  }

  // Where things are in the workbook: the Stages header (name -> column), each stage's row, the last Log row and the
  // last value said for each name.
  async function layout(bytes) {
    const P = T();
    const st = await P.sheetGrid(bytes, 'Stages');
    const lg = await P.sheetGrid(bytes, 'Log');
    const head = st.rows.get(1) || new Map();
    const cols = new Map();
    for (const [c, v] of head) cols.set(String(v).toLowerCase(), c);
    const stageRows = new Map();
    let lastStageRow = 1;
    for (const [r, cells] of st.rows) { if (r === 1) continue; lastStageRow = Math.max(lastStageRow, r); const n = cells.get(1); if (typeof n === 'number') stageRows.set(n, r); }
    let lastLogRow = 1;
    const lastValue = new Map();
    for (const [r, cells] of [...lg.rows].sort((a, b) => a[0] - b[0])) {
      if (r === 1) continue;
      lastLogRow = Math.max(lastLogRow, r);
      const name = cells.get(3), v = cells.get(4);
      if (name != null && typeof v === 'number') lastValue.set(String(name).toLowerCase(), v);
    }
    const maxCol = Math.max(2, ...head.keys());
    let hasInventory = true;
    try { await P.sheetGrid(bytes, 'Inventory'); } catch { hasInventory = false; }
    return { cols, stageRows, lastStageRow, lastLogRow, lastValue, maxCol, hasInventory, stageCell: (r, c) => st.rows.get(r)?.get(c) };
  }

  // ---- 📦 Inventory: a row per item, a column per place it's kept, and the total. Each stage total comes off what's
  // left: off the place it draws from ("drawing fuel from shed"), or, when nobody said, off the item as a whole
  // ("Drawn, no place"). "(draws per 1000)" on a name turns litres said into cubic metres counted. A count starts the
  // item's no-place draws fresh.
  const invFixed = (u) => ['Draws from', `Drawn, no place${u ? ` (${u})` : ''}`, `Total${u ? ` (${u})` : ''}`];
  async function sheetOr(bytes, name, head) {
    const P = T();
    try { return { bytes, grid: await P.sheetGrid(bytes, name) }; } catch (e) {
      if (!/no sheet called/.test(e.message)) throw e;
      let b = (await P.sheetAdd(bytes, { sheet: name })).bytes;
      b = (await P.sheetChange(b, { sheet: name, rows: [head], at: 'A1' })).bytes;
      return { bytes: b, grid: await P.sheetGrid(b, name) };
    }
  }
  function table(grid) {
    const head = grid.rows.get(1) || new Map();
    const cols = new Map(); for (const [c, v] of head) cols.set(String(v).toLowerCase(), c);
    const rows = new Map(); let last = 1;
    for (const [r, cells] of grid.rows) { if (r === 1) continue; last = Math.max(last, r); const k = cells.get(1); if (k != null) rows.set(String(k).toLowerCase(), r); }
    return { head, cols, rows, last, maxCol: Math.max(1, ...head.keys()), cell: (r, c) => grid.rows.get(r)?.get(c) };
  }
  const m3 = (v) => Math.round(v * 1000) / 1000;

  // The Inventory sheet as a model: places in order, and per item its amount in each place, what's been drawn
  // with no place, and the place it draws from. Written back whole each time, so a new place slots in before the
  // three fixed columns.
  function invModel(grid) {
    const t = table(grid);
    const isFixed = (v) => /^(draws from|drawn, no place|total)\b/i.test(String(v));
    const units = [...t.head].filter(([c, v]) => c > 1 && !isFixed(v)).sort((x, y) => x[0] - y[0]).map(([c, v]) => ({ c, name: String(v) }));
    const fc = (re) => [...t.head].find(([, v]) => re.test(String(v)))?.[0];
    const rows = [...t.rows].sort((x, y) => x[1] - y[1]).map(([, r]) => {
      const on = {};
      for (const u of units) { const v = t.cell(r, u.c); if (v !== undefined && v !== '') on[u.name] = Number(v) || 0; }
      return { name: String(t.cell(r, 1)), on, drawn: Number(t.cell(r, fc(/^drawn, no place/i))) || 0, from: t.cell(r, fc(/^draws from/i)) ?? '' };
    });
    return { units: units.map((u) => u.name), rows, height: t.last, width: t.maxCol };
  }
  const invTotal = (row) => m3(Object.values(row.on).reduce((a, v) => a + v, 0) - row.drawn);
  function invCells(m, P, u) {
    const cells = {};
    const head = ['Item', ...m.units, ...invFixed(u)];
    const width = Math.max(m.width, head.length), height = Math.max(m.height, m.rows.length + 1);
    for (let c = 1; c <= width; c++) cells[`${P.colName(c)}1`] = head[c - 1] ?? '';
    m.rows.forEach((row, i) => {
      const line = [row.name, ...m.units.map((u) => (u in row.on ? row.on[u] : '')), row.from, row.drawn || 0, invTotal(row)];
      for (let c = 1; c <= width; c++) cells[`${P.colName(c)}${i + 2}`] = line[c - 1] ?? '';
    });
    for (let r = m.rows.length + 2; r <= height; r++) for (let c = 1; c <= width; c++) cells[`${P.colName(c)}${r}`] = '';
    return cells;
  }

  async function inventory(bytesIn, cmd, { now, names, stageDraws = [] }) {
    const P = T();
    const su = names.stockUnit || '', amt = (v) => `${num(v)}${su ? ` ${spoken(su)}` : ''}`;
    let { bytes, grid } = await sheetOr(bytesIn, 'Inventory', ['Item', ...invFixed(su)]);
    const m = invModel(grid);
    const logRows = [], said = [];
    const unit = (u) => { const k = m.units.find((x) => x.toLowerCase() === u.toLowerCase()); if (k) return k; m.units.push(u); return u; };
    const row = (name) => { let r = m.rows.find((x) => x.name.toLowerCase() === name.toLowerCase()); if (!r) { r = { name, on: {}, drawn: 0, from: '' }; m.rows.push(r); } return r; };
    let changed = false;
    if (cmd.kind === 'inv') {
      const u = unit(cmd.place);
      for (const { name, value } of cmd.values) {
        const r = row(name);
        if (cmd.op === 'count') { r.on[u] = value; r.drawn = 0; } else r.on[u] = m3((r.on[u] || 0) + value);
        const tot = invTotal(r);
        logRows.push([stamp(now), cmd.op, name, u, value, tot]);
        said.push(`${name} in ${u}: ${cmd.op === 'count' ? '' : `plus ${num(value)}, `}${num(r.on[u])}. Total ${amt(tot)}`);
      }
      changed = true;
    } else if (cmd.kind === 'source') {
      const r = row(cmd.name);
      r.from = unit(cmd.place);
      if (!(r.from in r.on)) r.on[r.from] = 0;
      said.push(`${cmd.name} now comes off ${r.from}`);
      changed = true;
    } else if (cmd.kind === 'draws') {
      for (const { name, amount } of stageDraws) {
        const r = m.rows.find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (!r || !amount) continue; // never counted: nothing to take it off
        const per = names.find((n) => n.name.toLowerCase() === name.toLowerCase())?.per || 1, off = amount / per;
        const from = r.from && m.units.find((x) => x.toLowerCase() === String(r.from).toLowerCase());
        if (from) r.on[from] = m3((r.on[from] || 0) - off); else r.drawn = m3(r.drawn + off);
        const tot = invTotal(r);
        logRows.push([stamp(now), `stage ${cmd.stage}`, name, from || '', m3(-off), tot]);
        said.push(`${amt(tot)} of ${name} left${tot < 0 ? ', which is below zero: count it again' : ''}`);
        changed = true;
      }
    } else if (cmd.kind === 'bags') {
      const b = await sheetOr(bytes, 'Bagged', ['Item', 'Pallets', 'Bags', 'Updated']);
      const bt = table(b.grid);
      const r = bt.rows.get(cmd.name.toLowerCase()) || bt.last + 1;
      bytes = (await P.sheetChange(b.bytes, { sheet: 'Bagged', cells: { [`A${r}`]: cmd.name, [`B${r}`]: cmd.pallets, [`C${r}`]: cmd.bags, [`D${r}`]: stamp(now) } })).bytes;
      logRows.push([stamp(now), 'count', cmd.name, '', `${cmd.pallets} pallets ${cmd.bags} bags`, '']);
      said.push(`${cmd.name}: ${cmd.pallets} pallet${cmd.pallets === 1 ? '' : 's'}, ${cmd.bags} bag${cmd.bags === 1 ? '' : 's'}`);
    }
    if (changed) bytes = (await P.sheetChange(bytes, { sheet: 'Inventory', cells: invCells(m, P, su) })).bytes;
    if (logRows.length) {
      const l = await sheetOr(bytes, 'Inventory log', ['Time', 'What', 'Item', 'Place', `Amount${su ? ` (${su})` : ''}`, `Total after${su ? ` (${su})` : ''}`]);
      bytes = (await P.sheetChange(l.bytes, { sheet: 'Inventory log', rows: logRows, at: `A${table(l.grid).last + 1}` })).bytes;
    }
    return { bytes, said };
  }

  // Does what was said. state: { stage, inputs } (the stage we're on, the formula inputs last given). Answers
  // { bytes (null = nothing to write), say, state }.
  async function apply(bytesIn, cmd, { names, formulas = [], state = {}, now = new Date() } = {}) {
    const P = T();
    if (cmd.kind === 'formula') {
      // Inputs said now win; the rest are the ones given last time, and the read-back says which were used.
      const inputs = { ...(state.inputs || {}), ...cmd.given };
      const r = workOut(formulas, cmd.name, inputs);
      const keep = { ...state, inputs };
      if (r.missing) return { bytes: null, say: `For ${cmd.name} I need ${r.missing.join(', ')}. Say "work out ${cmd.name} with ${r.missing.map((n) => `${n} 10`).join(' ')}", with your numbers.`, state: keep };
      if (r.error) return { bytes: null, say: `${r.error[0].toUpperCase()}${r.error.slice(1)}.`, state: keep };
      const used = inputsOf(formulas, cmd.name).map((n) => `${n} ${num(Number(Object.entries(inputs).find(([k]) => key(k) === key(n))[1]))}`);
      return { bytes: null, say: `${cmd.name} is ${num(Math.round(r.value * 1e4) / 1e4)}${used.length ? `, with ${used.join(', ')}` : ''}.`, state: keep, value: r.value };
    }
    const bytes = bytesIn || await newBook(names);
    const L = await layout(bytes);
    const known = [...L.stageRows.keys()];
    let stage = Number(state.stage) || (known.length ? Math.max(...known) : 1);
    const keep = (x) => ({ ...state, stage: x });
    if (cmd.kind === 'unknown') return { bytes: null, say: `I didn't log that: ${cmd.why}. I heard "${cmd.heard}". Say a name and a number, like "${names[0]?.name || 'water'} 52".`, state: keep(stage) };
    if (cmd.kind === 'inv' || cmd.kind === 'source' || cmd.kind === 'bags') {
      const r = await inventory(bytes, cmd, { now, names });
      return { bytes: r.bytes, say: `${r.said.join('. ')}.`, state: keep(stage) };
    }
    const cells = {};
    const stageRow = (n) => {
      if (L.stageRows.has(n)) return L.stageRows.get(n);
      const r = ++L.lastStageRow;
      L.stageRows.set(n, r);
      cells[`A${r}`] = n;
      return r;
    };
    if (cmd.kind === 'stage') {
      const to = cmd.to === 'next' ? stage + 1 : cmd.to === 'back' ? Math.max(1, stage - 1) : cmd.to;
      if (to < 1) return { bytes: null, say: 'Stages start at 1.', state: keep(stage) };
      const fresh = !L.stageRows.has(to);
      const r = stageRow(to);
      if (fresh) cells[`B${r}`] = stamp(now);
      const out = Object.keys(cells).length ? (await P.sheetChange(bytes, { sheet: 'Stages', cells })).bytes : bytesIn ? null : bytes;
      return { bytes: out, say: `Stage ${to}${fresh ? ', new row' : ''}.`, state: keep(to) };
    }
    if (cmd.kind !== 'values') return { bytes: null, say: '', state: keep(stage) };
    const r = stageRow(stage);
    cells[`B${r}`] = stamp(now);
    const logRows = [], said = [], draws = [];
    for (const { column: name, value, unit, measure } of cmd.values) {
      let c = L.cols.get(name.toLowerCase());
      if (!c) { c = ++L.maxCol; L.cols.set(name.toLowerCase(), c); cells[`${P.colName(c)}1`] = name; } // a name added later gets its own column
      // A stage total said again (a correction, or a running total) only takes off what's new.
      const was = L.stageCell(r, c);
      if (!measure) draws.push({ name, amount: value - (typeof was === 'number' ? was : 0) });
      cells[`${P.colName(c)}${r}`] = value;
      const before = L.lastValue.get(name.toLowerCase());
      const diff = before == null ? null : value - before;
      const change = diff == null ? 'first' : diff === 0 ? 'same' : `${diff > 0 ? 'up' : 'down'} ${num(Math.abs(diff))}`;
      L.lastValue.set(name.toLowerCase(), value);
      logRows.push([stamp(now), stage, name, value, diff == null ? 'first' : diff === 0 ? 'same' : `${diff > 0 ? '+' : '-'}${num(Math.abs(diff))} (${diff > 0 ? 'up' : 'down'})`]);
      said.push(`${name.replace(/ \(.*\)$/, '')} ${num(value)}${unit ? ` ${spoken(unit)}` : ''}${change === 'first' ? '' : change === 'same' ? ', same' : `, ${change}`}`);
    }
    let out = (await P.sheetChange(bytes, { sheet: 'Stages', cells })).bytes;
    out = (await P.sheetChange(out, { sheet: 'Log', rows: logRows, at: `A${L.lastLogRow + 1}` })).bytes;
    let left = [];
    if (draws.length && L.hasInventory) { const inv = await inventory(out, { kind: 'draws', stage }, { now, names, stageDraws: draws }); out = inv.bytes; left = inv.said; }
    return { bytes: out, say: `${said.join('. ')}. Stage ${stage}.${left.length ? ` ${left.join('. ')}.` : ''}`, state: keep(stage) };
  }

  // A file name for today's job: "Voice log 2026-11-27.xlsx".
  const fileFor = (d = new Date()) => `Voice log ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;

  root.BobVoiceLog = { DEFAULT_NAMES, readNames, readFormulas, inputsOf, workOut, norm, words2num, parse, apply, newBook, fileFor, LOG_HEAD };
})(typeof window !== 'undefined' ? window : globalThis);
