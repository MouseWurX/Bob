// 1.5.153 The estimate table (bob-design/blend-and-cut-recipes.md section 4): how long a Lab job takes here, and what
// the rented part of a recipe (teaching it back, on a hired card) would take and cost, before anything runs. Hours on
// a card come from measured runs (docs/FORGE-JOURNAL.md); local minutes from this replicant matrix's own past Lab jobs
// when there are any, else from the brain's size. Every number is a range and says "about"; the service's bill is the
// real bill. Bob never suggests a cap: the Forge plan's cap starts at $0 and the owner sets it (the $0 rule).
import { CARDS } from './rental.js';

// Measured on the rentals of 6 to 8 November (H200): one full heal pass over about 27,000 lessons took about 16 hours
// at Riker's size (208 experts per layer); the teacher's scoring pass about 2.5 hours for the same set; starting a
// card and fetching the weights about 45 minutes; the imatrix and one running file about 15 minutes; a benchmark
// about an hour per brain. The network drive is about $7 a month while it's kept.
export const RENTED_RATES = { healHoursPer1000: 0.6, healAtExperts: 208, scoreHoursPer27000: 2.5, setupHours: 0.75, fileHours: 0.25, benchmarkHours: 1, driveMonthly: 7 };
export const BOB_LESSONS = 27000; // Bob's own lesson set, which the Forge's heal uses
const round = (x, to = 1) => Math.max(to, Math.round(x / to) * to);
const roundMin = (m) => (m < 15 ? round(m, 1) : m < 60 ? round(m, 5) : round(m, 15));
const tidyH = (h) => Math.round(h * 2) / 2 || 0.5;

// Minutes one Lab step takes on this replicant matrix, from the brain's size alone (used when there's no past job).
export function stepMinutes(step, { sizeGB = 10, chunks = 200 } = {}) {
  const readTps = Math.min(6000, Math.max(300, 40000 / Math.max(sizeGB, 2))); // words a second the counter reads
  const read = (n) => (n * 4096) / readTps / 60;
  switch (step.id) {
    case 'lessons': return 0.5;
    case 'count': case 'imatrix': return read(step.chunks || chunks) + 1;
    case 'cut': return (sizeGB * 1024) / 400 / 60 + 0.5; // the cutter writes about 400 MB a second
    case 'reader': return 0.5;
    case 'quantize': return sizeGB * 0.25 + 0.5;
    case 'fingerprint': return (sizeGB * 1024) / 500 / 60 + 0.2;
    case 'try': return 2 * (4 + sizeGB / 8);
    case 'test': case 'compare': return 4 + sizeGB / 8;
    default: return 1;
  }
}

// Past Lab jobs on this replicant matrix: the time each step really took, scaled to this brain's size.
export function pastMinutes(runs = [], id, sizeGB) {
  const seen = [];
  for (const r of runs) {
    if (r.state !== 'done' || !Number(r.fromGB)) continue;
    for (const s of r.steps || []) if (s.id === id && s.state === 'done' && Number(s.ms) > 0) seen.push((s.ms / 60000) * (sizeGB / r.fromGB));
  }
  if (!seen.length) return null;
  seen.sort((a, b) => a - b);
  return seen[Math.floor(seen.length / 2)];
}

// The here column: every step of the plan, with its minutes, and the total as a range.
export function hereEstimate(steps = [], { sizeGB = 10, chunks = 200, runs = [], outGB = 0 } = {}) {
  let learned = false;
  const rows = steps.map((s) => {
    const past = pastMinutes(runs, s.id, sizeGB);
    if (past != null) learned = true;
    return { id: s.id, label: s.label, minutes: past ?? stepMinutes(s, { sizeGB, chunks }) };
  });
  const total = rows.reduce((a, x) => a + x.minutes, 0);
  return { steps: rows.map((x) => ({ ...x, minutes: Math.round(x.minutes * 10) / 10 })), minutes: [roundMin(total * 0.7), roundMin(total * 1.5)], from: learned ? 'past' : 'size', spaceGB: Math.ceil(outGB + 1) };
}

// The rented column, for the part a recipe can't do here: teaching the cut brain back on a hired card.
// rented = { lessons, experts, files, benchmark, scoresCached, card } ; perHour overrides the card's list price.
export function rentedEstimate(rented, { perHour } = {}) {
  if (!rented) return null;
  const R = RENTED_RATES;
  const lessons = Number(rented.lessons) || BOB_LESSONS;
  const experts = Number(rented.experts) || R.healAtExperts;
  const card = CARDS[rented.card || '141'] || CARDS['141'];
  const ph = Number(perHour) || card.perHour;
  const parts = [
    { what: 'Start the card and fetch the brain', hours: R.setupHours },
    ...(rented.scoresCached ? [] : [{ what: 'The teacher scores the lessons', hours: (R.scoreHoursPer27000 * lessons) / BOB_LESSONS }]),
    { what: `Teach it back: one full pass over ${lessons.toLocaleString('en-CA')} lessons`, hours: ((R.healHoursPer1000 * lessons) / 1000) * Math.max(0.4, experts / R.healAtExperts) },
    { what: 'Measure and make the running files', hours: R.fileHours * Math.max(1, (rented.files || ['Q4_K_M']).length) },
    ...(rented.benchmark !== false ? [{ what: 'Benchmark it on the card', hours: R.benchmarkHours }] : [])
  ];
  const hours = parts.reduce((a, p) => a + p.hours, 0);
  const lo = hours * 0.85, hi = hours * 1.25;
  return {
    card: card.name, perHour: ph,
    parts: parts.map((p) => ({ ...p, hours: Math.round(p.hours * 10) / 10 })),
    hours: [tidyH(lo), tidyH(hi)],
    dollars: [Math.round(lo * ph), Math.ceil(hi * ph)],
    drive: R.driveMonthly,
    scoresCached: Boolean(rented.scoresCached)
  };
}

// The last rented run on record (a measure.json with a cost), for the "last time" line.
export function lastRentedCost(records = []) {
  const withCost = records.filter((r) => Number(r?.cost?.dollars) > 0 && r.where?.place === 'rented').sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')));
  const r = withCost[0];
  return r ? { name: r.brain?.name || '', dollars: Number(r.cost.dollars), hours: Number(r.cost.hours) || 0, when: r.when || '' } : null;
}

// The words under the table: one line for each column, in Bob's voice.
export function estimateWords(e) {
  const out = [];
  if (e.here) out.push(`Here: about ${e.here.minutes[0]} to ${e.here.minutes[1]} minutes on this replicant matrix, free. ${e.here.from === 'past' ? 'From how long your last Lab jobs took.' : 'A first guess from the brain\'s size; it gets better after your first Lab job.'}`);
  if (e.rented) out.push(`Rented: about ${e.rented.hours[0]} to ${e.rented.hours[1]} hours on a ${e.rented.card}, about $${e.rented.dollars[0]} to $${e.rented.dollars[1]}.${e.last ? ` The last rented run on record cost $${e.last.dollars}.` : ''} The service's bill is the real number.`);
  return out;
}
