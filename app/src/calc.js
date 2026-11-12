// 🧮 "Let Bob use a calculator" (Settings, How Bob works, 🧰 More tools; off by default).
// The calculate tool works sums out with code, not in the brain's head: + - × ÷, powers, percent, brackets, roots,
// rounding, trigonometry and logs, and unit conversions (length, weight, volume, area, speed, time, temperature,
// data, energy, pressure). Whole numbers and decimals are worked out exactly (as fractions, with BigInt), so
// 0.1 + 0.2 is 0.3 and a big total doesn't lose its last digits. Roots, logs and trigonometry are decimals to
// 15 places, and the answer says "about" when it was rounded. Nothing is run as code: the sum is read by a small
// parser here, so a sum can never do anything but add up.

// ---------------------------------------------------------------- exact numbers (fractions of BigInts)
const big = (x) => BigInt(x);
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a || 1n; };
const frac = (n, d = 1n) => { if (d === 0n) throw new Error('That divides by zero.'); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; };
const isExact = (v) => typeof v === 'object';
const toFloat = (v) => (isExact(v) ? Number(v.n) / Number(v.d) : v);
const MAX_DIGITS = 400;
const tooBig = (v) => isExact(v) && (v.n.toString().length > MAX_DIGITS || v.d.toString().length > MAX_DIGITS);
const settle = (v) => (tooBig(v) ? toFloat(v) : v);

function parseNumber(s) {
  const m = String(s).match(/^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!m || (!m[1] && !m[2])) throw new Error(`"${s}" isn't a number.`);
  const whole = m[1] || '0', dec = m[2] || '', exp = Number(m[3] || 0);
  if (Math.abs(exp) > 300) return Number(s);
  let n = big(whole + dec), d = 10n ** big(dec.length);
  if (exp > 0) n *= 10n ** big(exp); else if (exp < 0) d *= 10n ** big(-exp);
  return frac(n, d);
}

const add = (a, b) => (isExact(a) && isExact(b) ? frac(a.n * b.d + b.n * a.d, a.d * b.d) : toFloat(a) + toFloat(b));
const neg = (a) => (isExact(a) ? { n: -a.n, d: a.d } : -a);
const sub = (a, b) => add(a, neg(b));
const mul = (a, b) => (isExact(a) && isExact(b) ? frac(a.n * b.n, a.d * b.d) : toFloat(a) * toFloat(b));
const div = (a, b) => {
  if (isExact(b) ? b.n === 0n : b === 0) throw new Error('That divides by zero.');
  return isExact(a) && isExact(b) ? frac(a.n * b.d, a.d * b.n) : toFloat(a) / toFloat(b);
};
function pow(a, b) {
  if (isExact(a) && isExact(b) && b.d === 1n && b.n >= -1000n && b.n <= 1000n) {
    const e = b.n < 0n ? -b.n : b.n;
    if (a.n === 0n && b.n < 0n) throw new Error('That divides by zero.');
    const r = frac(a.n ** e, a.d ** e);
    return b.n < 0n ? frac(r.d, r.n) : r;
  }
  const out = toFloat(a) ** toFloat(b);
  if (Number.isNaN(out)) throw new Error('That power has no real answer (a negative number to a fraction).');
  return out;
}
function mod(a, b) {
  if (isExact(a) && isExact(b)) { if (b.n === 0n) throw new Error('That divides by zero.'); const q = (a.n * b.d) / (a.d * b.n); return sub(a, mul(b, frac(q))); }
  return toFloat(a) % toFloat(b);
}
function factorial(a) {
  if (!isExact(a) || a.d !== 1n || a.n < 0n) throw new Error('Factorial (!) needs a whole number of 0 or more.');
  if (a.n > 500n) throw new Error('That factorial is too big to show (500! at most).');
  let r = 1n; for (let i = 2n; i <= a.n; i++) r *= i;
  return frac(r);
}

const F = (f) => (...args) => { const out = f(...args.map(toFloat)); if (!Number.isFinite(out)) throw new Error('That has no real answer.'); return out; };
const FUNCS = {
  sqrt: (a) => { if (toFloat(a) < 0) throw new Error('A negative number has no real square root.'); return exactRoot(a, 2n) ?? Math.sqrt(toFloat(a)); },
  cbrt: (a) => exactRoot(a, 3n) ?? Math.cbrt(toFloat(a)),
  abs: (a) => (isExact(a) ? { n: a.n < 0n ? -a.n : a.n, d: a.d } : Math.abs(a)),
  round: (a, places) => roundTo(a, places == null ? 0 : Number(toFloat(places))),
  floor: (a) => (isExact(a) ? frac(floorDiv(a.n, a.d)) : Math.floor(a)),
  ceil: (a) => (isExact(a) ? frac(-floorDiv(-a.n, a.d)) : Math.ceil(a)),
  sin: F(Math.sin), cos: F(Math.cos), tan: F(Math.tan), asin: F(Math.asin), acos: F(Math.acos), atan: F(Math.atan),
  sind: F((x) => Math.sin((x * Math.PI) / 180)), cosd: F((x) => Math.cos((x * Math.PI) / 180)), tand: F((x) => Math.tan((x * Math.PI) / 180)),
  ln: F(Math.log), log: F(Math.log10), log10: F(Math.log10), log2: F(Math.log2), exp: F(Math.exp),
  min: (...a) => a.reduce((x, y) => (toFloat(y) < toFloat(x) ? y : x)),
  max: (...a) => a.reduce((x, y) => (toFloat(y) > toFloat(x) ? y : x)),
  avg: (...a) => div(a.reduce(add), frac(big(a.length))),
  sum: (...a) => a.reduce(add)
};
const CONSTS = { pi: Math.PI, π: Math.PI, e: Math.E, tau: 2 * Math.PI };
const floorDiv = (n, d) => (n >= 0n ? n / d : -((-n + d - 1n) / d));
function exactRoot(a, k) {
  if (!isExact(a) || a.n < 0n) return null;
  const r = (x) => { if (x < 2n) return x; let lo = 0n, hi = 1n; while (hi ** k <= x) hi *= 2n; while (lo < hi - 1n) { const m = (lo + hi) / 2n; if (m ** k <= x) lo = m; else hi = m; } return lo; };
  const n = r(a.n), d = r(a.d);
  return n ** k === a.n && d ** k === a.d ? frac(n, d) : null;
}
function roundTo(a, places) {
  const p = Math.max(-20, Math.min(20, Math.round(places || 0)));
  if (!isExact(a)) return Math.round(a * 10 ** p) / 10 ** p;
  const scale = 10n ** big(Math.abs(p));
  const scaled = p >= 0 ? frac(a.n * scale, a.d) : frac(a.n, a.d * scale);
  const twice = (2n * scaled.n + (scaled.n >= 0n ? scaled.d : -scaled.d)) / (2n * scaled.d); // half away from zero
  return p >= 0 ? frac(twice, scale) : frac(twice * scale);
}

// ---------------------------------------------------------------- the parser
function tokens(src) {
  const out = [];
  const s = String(src);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = s.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (num) { out.push({ t: 'num', v: num[0] }); i += num[0].length; continue; }
    if ((c === 'x' || c === 'X') && !/[a-z]/i.test(s[i + 1] || '')) { out.push({ t: 'op', v: '*' }); i++; continue; } // 3 x 4
    const word = s.slice(i).match(/^[a-zπ]+\d*/i);
    if (word) { out.push({ t: 'word', v: word[0].toLowerCase() }); i += word[0].length; continue; }
    if (s.startsWith('**', i)) { out.push({ t: 'op', v: '^' }); i += 2; continue; }
    const map = { '×': '*', '÷': '/', '−': '-', '·': '*', x: '*' };
    if ('+-*/^%!(),;'.includes(c) || map[c]) { out.push({ t: 'op', v: map[c] || c }); i++; continue; }
    throw new Error(`I can't read "${c}" in that sum.`);
  }
  return out;
}

export function evaluate(expr) {
  let src = String(expr || '').trim();
  if (!src) throw new Error('There was no sum to work out.');
  if (src.length > 2000) throw new Error('That sum is too long (2,000 characters at most).');
  // 1,234,567 as a thousands separator, unless the commas could be between a function's numbers.
  if (!/[a-z]\s*\(/i.test(src)) src = src.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  src = src.replace(/(\d)\s*%\s*of\b/gi, '$1%*').replace(/\bmod\b/gi, ' mod ');
  const tk = tokens(src);
  let pos = 0;
  const peek = () => tk[pos], next = () => tk[pos++];
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;
  const expect = (v) => { if (!isOp(v)) throw new Error(`I expected "${v}" in that sum.`); pos++; };
  let depth = 0;
  function expression() {
    let v = term();
    while (isOp('+') || isOp('-')) { const o = next().v; const r = term(); v = settle(o === '+' ? add(v, r) : sub(v, r)); }
    return v;
  }
  function term() {
    let v = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) { const o = next().v; const r = unary(); v = settle(o === '*' ? mul(v, r) : div(v, r)); continue; }
      if (peek()?.t === 'word' && peek().v === 'mod') { next(); v = settle(mod(v, unary())); continue; }
      // 2(3+4) and 2pi: a number right before a bracket or a name multiplies.
      if (peek() && (isOp('(') || (peek().t === 'word' && peek().v !== 'mod') || peek().t === 'num')) { v = settle(mul(v, unary())); continue; }
      return v;
    }
  }
  function unary() {
    if (isOp('-')) { next(); return neg(unary()); }
    if (isOp('+')) { next(); return unary(); }
    return power();
  }
  function power() {
    const b = postfix();
    if (isOp('^')) { next(); return settle(pow(b, unary())); } // right to left: 2^3^2 = 2^9
    return b;
  }
  function postfix() {
    let v = atom();
    for (;;) {
      if (isOp('!')) { next(); v = factorial(v); continue; }
      if (isOp('%')) { next(); v = div(v, frac(100n)); continue; }
      return v;
    }
  }
  function atom() {
    const t = next();
    if (!t) throw new Error('That sum stops too soon.');
    if (t.t === 'num') return parseNumber(t.v);
    if (t.t === 'op' && t.v === '(') { if (++depth > 100) throw new Error('Too many brackets.'); const v = expression(); expect(')'); depth--; return v; }
    if (t.t === 'word') {
      if (FUNCS[t.v]) {
        expect('(');
        const args = [expression()];
        while (isOp(',') || isOp(';')) { next(); args.push(expression()); }
        expect(')');
        return FUNCS[t.v](...args);
      }
      if (t.v in CONSTS) return CONSTS[t.v];
      throw new Error(`I don't know "${t.v}" in a sum. I know + - × ÷ ^ % !, brackets, ${Object.keys(FUNCS).join(', ')}, pi and e.`);
    }
    throw new Error(`I didn't expect "${t.v}" there.`);
  }
  const v = expression();
  if (pos < tk.length) throw new Error(`I didn't expect "${tk[pos].v}" there.`);
  return v;
}

// How an answer is written: exact when it can be, "about" when rounded.
export function show(v) {
  if (!isExact(v)) {
    if (!Number.isFinite(v)) throw new Error('That has no finite answer.');
    const r = Number(v.toPrecision(15));
    return { text: plain(r), exact: false };
  }
  let d = v.d, twos = 0, fives = 0;
  while (d % 2n === 0n) { d /= 2n; twos++; }
  while (d % 5n === 0n) { d /= 5n; fives++; }
  if (d === 1n) { // ends: a plain decimal
    const places = Math.max(twos, fives);
    const scaled = (v.n * 10n ** big(places)) / v.d;
    const neg = scaled < 0n, s = (neg ? -scaled : scaled).toString().padStart(places + 1, '0');
    const int = s.slice(0, s.length - places), dec = places ? s.slice(-places) : '';
    return { text: `${neg ? '-' : ''}${groups(int)}${dec ? '.' + dec : ''}`, exact: true };
  }
  const f = Number(v.n) / Number(v.d);
  return { text: plain(Number(f.toPrecision(15))), exact: false, fraction: `${v.n}/${v.d}` };
}
const groups = (int) => (int.length > 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int);
function plain(n) {
  if (Math.abs(n) >= 1e21 || (Math.abs(n) < 1e-6 && n !== 0)) return n.toExponential().replace('e+', ' × 10^').replace('e-', ' × 10^-');
  const [i, d] = String(n).split('.');
  return `${i.startsWith('-') ? '-' + groups(i.slice(1)) : groups(i)}${d ? '.' + d : ''}`;
}

// ---------------------------------------------------------------- units
// Each unit: [kind, how many of the kind's base unit one of it is, its names].
const U = [
  ['length', 1, 'm metre metres meter meters'], ['length', 1000, 'km kilometre kilometres kilometer kilometers'], ['length', 0.01, 'cm centimetre centimetres centimeter centimeters'],
  ['length', 0.001, 'mm millimetre millimetres millimeter millimeters'], ['length', 0.0254, 'in inch inches "'], ['length', 0.3048, "ft foot feet '"], ['length', 0.9144, 'yd yard yards'],
  ['length', 1609.344, 'mi mile miles'], ['length', 1852, 'nmi nautical_mile nautical_miles'],
  ['mass', 1, 'kg kilogram kilograms kilo kilos'], ['mass', 0.001, 'g gram grams'], ['mass', 1e-6, 'mg milligram milligrams'], ['mass', 1000, 't tonne tonnes metric_ton'],
  ['mass', 0.45359237, 'lb lbs pound pounds'], ['mass', 0.028349523125, 'oz ounce ounces'], ['mass', 6.35029318, 'st stone stones'],
  ['volume', 1, 'l litre litres liter liters'], ['volume', 0.001, 'ml millilitre millilitres milliliter milliliters'], ['volume', 1000, 'm3 cubic_metre cubic_meter'],
  ['volume', 3.785411784, 'gal gallon gallons us_gallon'], ['volume', 4.54609, 'imp_gallon imperial_gallon uk_gallon'], ['volume', 0.946352946, 'qt quart quarts'],
  ['volume', 0.473176473, 'pt pint pints'], ['volume', 0.2365882365, 'cup cups'], ['volume', 0.0295735295625, 'floz fl_oz fluid_ounce fluid_ounces'],
  ['volume', 0.01478676478125, 'tbsp tablespoon tablespoons'], ['volume', 0.00492892159375, 'tsp teaspoon teaspoons'],
  ['area', 1, 'm2 sq_m square_metre square_metres square_meter square_meters'], ['area', 1e6, 'km2 sq_km square_kilometre square_kilometres'], ['area', 0.09290304, 'ft2 sq_ft square_foot square_feet'],
  ['area', 4046.8564224, 'acre acres'], ['area', 10000, 'ha hectare hectares'], ['area', 2589988.110336, 'mi2 sq_mi square_mile square_miles'], ['area', 0.00064516, 'in2 sq_in square_inch square_inches'],
  ['speed', 1, 'm/s mps metres_per_second'], ['speed', 1 / 3.6, 'km/h kmh kph kilometres_per_hour'], ['speed', 0.44704, 'mph miles_per_hour'], ['speed', 0.514444, 'kn knot knots'],
  ['time', 1, 's sec second seconds'], ['time', 60, 'min minute minutes'], ['time', 3600, 'h hr hour hours'], ['time', 86400, 'day days'], ['time', 604800, 'week weeks'], ['time', 31557600, 'year years yr'],
  ['time', 0.001, 'ms millisecond milliseconds'],
  ['data', 1, 'b byte bytes'], ['data', 1000, 'kb kilobyte kilobytes'], ['data', 1e6, 'mb megabyte megabytes'], ['data', 1e9, 'gb gigabyte gigabytes'], ['data', 1e12, 'tb terabyte terabytes'],
  ['data', 1024, 'kib kibibyte'], ['data', 1048576, 'mib mebibyte'], ['data', 1073741824, 'gib gibibyte'], ['data', 1099511627776, 'tib tebibyte'], ['data', 0.125, 'bit bits'],
  ['energy', 1, 'j joule joules'], ['energy', 1000, 'kj kilojoule kilojoules'], ['energy', 4184, 'kcal calorie calories food_calorie'], ['energy', 3.6e6, 'kwh kilowatt_hour kilowatt_hours'],
  ['energy', 1055.05585262, 'btu'],
  ['pressure', 1, 'pa pascal pascals'], ['pressure', 1000, 'kpa kilopascal'], ['pressure', 100000, 'bar bars'], ['pressure', 6894.757293168, 'psi'], ['pressure', 101325, 'atm atmosphere atmospheres'],
  ['power', 1, 'w watt watts'], ['power', 1000, 'kw kilowatt kilowatts'], ['power', 745.69987158227, 'hp horsepower']
];
const TEMP = { c: 'c', celsius: 'c', '°c': 'c', centigrade: 'c', f: 'f', fahrenheit: 'f', '°f': 'f', k: 'k', kelvin: 'k' };
const UNITS = new Map();
for (const [kind, size, names] of U) for (const n of names.split(' ')) UNITS.set(n.toLowerCase(), { kind, size, name: names.split(' ')[0] });
const unitKey = (u) => String(u || '').trim().toLowerCase().replace(/^degrees?\s+/, '').replace(/\s+per\s+/g, '/').replace(/²/g, '2').replace(/³/g, '3').replace(/\s+/g, '_').replace(/^sq_(\w+?)s?$/, (m) => m);
export const unitKinds = () => [...new Set(U.map((u) => u[0]))].concat('temperature');

export function convert(value, from, to) {
  const a = unitKey(from), b = unitKey(to);
  const v = toFloat(typeof value === 'number' ? value : evaluate(String(value)));
  if (TEMP[a] || TEMP[b]) {
    if (!TEMP[a] || !TEMP[b]) throw new Error(`I can't turn ${from} into ${to}: only one of them is a temperature.`);
    const c = TEMP[a] === 'c' ? v : TEMP[a] === 'f' ? ((v - 32) * 5) / 9 : v - 273.15;
    const out = TEMP[b] === 'c' ? c : TEMP[b] === 'f' ? (c * 9) / 5 + 32 : c + 273.15;
    return Number(out.toPrecision(12));
  }
  const ua = UNITS.get(a), ub = UNITS.get(b);
  if (!ua) throw new Error(`I don't know the unit "${from}". I know ${unitKinds().join(', ')} units, like km, lb, cup, mph, GB, kWh.`);
  if (!ub) throw new Error(`I don't know the unit "${to}". I know ${unitKinds().join(', ')} units, like km, lb, cup, mph, GB, kWh.`);
  if (ua.kind !== ub.kind) throw new Error(`I can't turn ${from} (${ua.kind}) into ${to} (${ub.kind}).`);
  return Number(((v * ua.size) / ub.size).toPrecision(12));
}

// ---------------------------------------------------------------- the tool
const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export function calculatorTool(cfg, on = () => true) {
  return {
    schema: fn('calculate', 'Work out a sum exactly, or convert units. Use it for any arithmetic, money, percent or unit question instead of working it out yourself.', {
      sum: { type: 'string', description: 'The sum, like "(1299.99 * 0.13) + 15", "15% of 80", "sqrt(2)", "2^64", "round(22/7, 3)". Leave out for a unit conversion.' },
      value: { type: 'string', description: 'Unit conversion: the amount (a number or a sum).' },
      from: { type: 'string', description: 'Unit conversion: its unit, like km, lb, F, cup, GB.' },
      to: { type: 'string', description: 'Unit conversion: the unit wanted.' }
    }, []),
    async run({ sum, value, from, to }) {
      if (!on()) return 'The calculator is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob use a calculator".';
      if (from && to) {
        const out = convert(value ?? sum ?? '1', from, to);
        return `${value ?? sum ?? 1} ${from} = ${plain(out)} ${to} (worked out by the calculator; give this number as it is).`;
      }
      const r = show(evaluate(sum ?? value));
      return `${String(sum ?? value).trim()} = ${r.exact ? '' : 'about '}${r.text}${r.fraction && r.fraction.length < 40 ? ` (exactly ${r.fraction})` : ''} (worked out by the calculator; give this number as it is).`;
    },
    summary: ({ sum, value, from, to }) => (from && to ? `convert: ${value ?? ''} ${from} to ${to}` : `calculate: ${String(sum ?? value ?? '').slice(0, 80)}`)
  };
}
