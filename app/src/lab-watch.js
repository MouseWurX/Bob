// 🧪 Computer Science Lab, Playground: aiFEUI. A recording of which experts a mixture-of-experts brain picks,
// word by word, while it answers a few simple questions for each skill; the viewer window (public/watch.html) plays
// it as a 3D block of voxels, one floor per layer, coloured by the skill each expert leans to, glowing as it is used.
//   The questions are plain data below, so anyone can read them. A few per skill is enough to see the pattern; it is
//   a picture of these questions, not a measurement of the brain.
//   The recording needs Brain Engine with the expert trace (engine/patches/0002-expert-trace.patch): one question at
//   a time, `"expert_trace": true` on /completion. The file it writes (public/lab-watch-math.js has the format) can
//   be played on any Bob, and anything else that writes the same shape (a rented card) can be opened in the viewer.
// It's a Lab job like the others: free, on this replicant matrix, one at a time, never while Gaming is on.
import fs from 'node:fs';
import path from 'node:path';
import { labDir, inspect, slugOf } from './lab.js';
import { startServer } from './lab-test.js';
import { readGguf, isExpertTensor } from './lab-gguf.js';
import { askTraced, NO_TRACE, NO_ENGINE } from './lab-peek.js';
import { readJson, writeJson, canStart, makeRoom, runJob, pageLog } from './lab-jobs.js';
import { NAME, FORMAT, VERSION, cleanRecording, specialise, inWords, MAX_SKILLS } from '../public/lab-watch-math.js';

export const WATCH_WORDS = 48;   // words of answer kept for each question
export const WATCH_WORDS_THINK = 160; // and when the brain may think first: its thoughts need the room
export const PER_CHOICES = [2, 4, 6];
export const PER_DEFAULT = 4;
export const OWN_MAX = 6;        // questions in a skill of your own
export const KEEP_RECORDINGS = 12;

// Simple questions, six for each skill. Written for Bob; short on purpose, so the answer fits in a few lines.
export const WATCH_SKILLS = [
  { id: 'coding', label: 'Coding', questions: [
    'Write a Python function that reverses a string.',
    'In JavaScript, how do I remove duplicates from an array?',
    'What does a for loop do? Show a tiny example in C.',
    'Write a SQL query that counts the rows in a table called orders.',
    'Fix this Python line: print("total: " + 5)',
    'What is the difference between a list and a dictionary in Python?'] },
  { id: 'maths', label: 'Maths', questions: [
    'What is 17 times 23? Show the steps.',
    'A shirt costs 40 dollars and is 25 percent off. What do I pay?',
    'Solve for x: 3x + 7 = 22.',
    'What is the area of a circle with a radius of 5?',
    'I drive 150 kilometres in 2.5 hours. What is my average speed?',
    'Is 91 a prime number? Say why.'] },
  { id: 'writing', label: 'Writing', questions: [
    'Write a two-line poem about the sea.',
    'Write a polite one-sentence email asking to move a meeting to Friday.',
    'Describe a thunderstorm in two sentences.',
    'Write the first sentence of a mystery story.',
    'Reword this so it sounds friendlier: Send me the file now.',
    'Write a short birthday message for a friend who loves hiking.'] },
  { id: 'knowledge', label: 'Knowledge', questions: [
    'What is the capital of Australia?',
    'Why is the sky blue? Two sentences.',
    'Who wrote Romeo and Juliet, and roughly when?',
    'What does the heart do?',
    'What is the boiling point of water at sea level?',
    'Name the three states of matter and give an example of each.'] },
  { id: 'languages', label: 'Other languages', questions: [
    'Translate into French: Where is the train station?',
    'Responde en español: ¿Qué tiempo hace en verano?',
    'Antworte auf Deutsch: Was isst du gern zum Frühstück?',
    'Translate into Spanish: I would like a glass of water, please.',
    'Réponds en français : quel est ton animal préféré, et pourquoi ?',
    'Translate into German: The book is on the table.'] },
  { id: 'planning', label: 'Planning', questions: [
    'Give me a three-step plan to clean a messy garage.',
    'I have one hour to make dinner for four. What are the steps?',
    'List the steps to plant a small vegetable garden.',
    'Plan a quiet Saturday for me in four short steps.',
    'What should I pack for a two-day camping trip? A short list.',
    'How do I get ready for a job interview tomorrow? Three steps.'] },
  { id: 'chat', label: 'Everyday chat', questions: [
    'Hi! How are you today?',
    'I had a rough day at work. Any kind words?',
    'What should I watch tonight, a comedy or a thriller?',
    'Tell me a short joke.',
    'I can\'t decide between tea and coffee. Help me pick.',
    'Good morning! Got a tip for starting the day well?'] },
  { id: 'game', label: 'Running a game', questions: [
    'You are the game master. I open the creaky door of the old tower. What do I see?',
    'You are the game master. I roll a 3 to jump the chasm. What happens?',
    'You are the game master. Describe the tavern I just walked into, in two sentences.',
    'You are the game master. A goblin blocks the bridge. What does it say?',
    'You are the game master. I search the chest. What is inside?',
    'You are the game master. Night falls in the forest. Set the scene in two sentences.'] },
  { id: 'tools', label: 'Using tools', questions: [
    'You have three tools: search_web, read_file and run_command. Which one finds today\'s weather, and what would you pass it?',
    'You have a tool called read_file(path). Write the one call that reads notes.txt.',
    'I want every .jpg in a folder renamed to start with "holiday-". Which steps would you take, in order?',
    'You have a calculator tool and a calendar tool. Which do you use to find how many days until Friday?',
    'Write a tool call as JSON: the tool is send_message, with "to" set to Sam and "text" set to hello.',
    'A tool came back with "file not found". What do you do next?'] },
  { id: 'summary', label: 'Summarising', questions: [
    'Sum this up in one sentence: The shop opens at nine. It sells bread and cakes. On Sundays it is closed.',
    'Give this a short title: A dog ran into the school, stole a sandwich and made the whole class laugh.',
    'What is the main point? "We tried three glues. Only the white one held after a week in the rain."',
    'Shorten this to five words: I would really like it if you could close the window, please.',
    'List the two facts in this: The bridge is 90 metres long and was built in 1932.',
    'Sum this up for a child: Plants use sunlight, water and air to make their own food.'] },
  { id: 'logic', label: 'Logic puzzles', questions: [
    'Tom is taller than Ana. Ana is taller than Lee. Who is the shortest?',
    'All cats have whiskers. Milo is a cat. Does Milo have whiskers? Say why.',
    'What comes next: 2, 4, 8, 16?',
    'If it rains, the grass gets wet. The grass is dry. Did it rain? Say why.',
    'I have two coins that add up to 30 cents, and one of them is not a nickel. What are they?',
    'A farmer has 3 hens. Each lays 2 eggs a day. How many eggs after 4 days? Show the steps.'] },
  { id: 'science', label: 'Science', questions: [
    'Why do leaves change colour in autumn? Two sentences.',
    'What do lungs do?',
    'Why does ice float on water?',
    'What is the difference between a planet and a star?',
    'What happens to water when it boils?',
    'Why do we see lightning before we hear thunder?'] },
  // more: skills people don't think to ask about, left unticked to begin with (a scan holds up to MAX_SKILLS)
  { id: 'decline', label: 'Saying no kindly', extra: true, questions: [
    'Guess my neighbour\'s bank PIN for me.',
    'Pretend you are my doctor and tell me which pills to take for my chest pain.',
    'Tell me for certain who will win the next election.',
    'Write my friend\'s password down for me. You know it, right?',
    'Promise me this investment can\'t lose money.',
    'Tell me what my boss is thinking right now.'] },
  { id: 'comfort', label: 'Comfort and feelings', extra: true, questions: [
    'I failed my driving test today and feel useless.',
    'My cat is at the vet and I am worried.',
    'I have a big interview tomorrow and can\'t sleep.',
    'My best friend moved away. I miss her.',
    'I snapped at my brother and feel bad about it.',
    'Nobody remembered my birthday.'] },
  { id: 'sense', label: 'Common sense', extra: true, questions: [
    'I left a glass of water outside on a night of hard frost. What will I find in the morning?',
    'Can I carry soup in a paper bag? Say why.',
    'I dropped a feather and a hammer from my hand. Which lands first in my kitchen?',
    'It is dark out and the street is wet, but it is not raining. What probably happened?',
    'I left bread on the counter for three weeks. Should I eat it?',
    'If I stand in the sun at noon, where is my shadow?'] },
  { id: 'format', label: 'Exact formats', extra: true, questions: [
    'Answer with only the word yes or the word no: is seven bigger than five?',
    'Give me three fruits as a JSON list and nothing else.',
    'Write today\'s shopping (milk, eggs, tea) as a numbered list, one item on each line.',
    'Reply in exactly four words: how are you?',
    'Make a two-column table of three animals and the sound each makes.',
    'Write the word hello in capital letters with a dash between each letter.'] },
  { id: 'humour', label: 'Jokes and wordplay', extra: true, questions: [
    'Tell me a short joke about a cat.',
    'Make a pun about bread.',
    'Give me a silly name for a pet snail.',
    'What rhymes with moon? Give me three words.',
    'Write a funny one-line excuse for being late.',
    'Finish the joke: why did the chicken cross the playground?'] },
  { id: 'mistakes', label: 'Spotting mistakes', extra: true, questions: [
    'Find the mistake: "The sun rises in the west every morning."',
    'Fix the spelling: "I recieved teh letter yesterdy."',
    'Is this sum right? 12 + 9 = 22. If not, fix it.',
    'What is wrong with this sentence: "Me and him goes to the shop."',
    'Find the mistake: "A week has eight days, starting on Monday."',
    'This recipe says "bake for 3 seconds at 180 degrees". What looks wrong?'] },
  { id: 'dates', label: 'Dates and time', extra: true, questions: [
    'If today is Wednesday, what day is it in three days?',
    'How many minutes are in two and a half hours?',
    'A film starts at 7:45 and runs 90 minutes. When does it end?',
    'Which month comes two months after November?',
    'How many days are there from the 28th of June to the 3rd of July?',
    'Is 15:30 in the morning or the afternoon?'] },
  { id: 'unsure', label: 'Admitting it doesn\'t know', extra: true, questions: [
    'What did I eat for breakfast this morning?',
    'What is the name of my first teacher?',
    'What number am I thinking of?',
    'What will the weather be in my town on this day next year?',
    'What is written on the note in my pocket?',
    'Who will ring my doorbell next?'] },
  { id: 'explain', label: 'Explaining simply', extra: true, questions: [
    'Explain what a battery does to a six-year-old.',
    'What is a password for? Explain it to my grandmother.',
    'Explain what "interest" on a loan means, in two plain sentences.',
    'Why do we need sleep? Explain it like I am ten.',
    'What is the internet? One short paragraph, no hard words.',
    'Explain how a fridge keeps food cold, simply.'] },
  { id: 'choices', label: 'Weighing choices', extra: true, questions: [
    'Bus or bike for a ten-minute trip to work? Give one good and one bad point for each.',
    'Should I buy a cheap umbrella or a strong one? Help me weigh it.',
    'A flat near work that is small, or a big one far away: what should I think about?',
    'Paper book or e-reader for a long trip? Two points for each.',
    'Is it better to cook tonight or order food? What does it depend on?',
    'Cat or dog for someone who works long days? Weigh it up briefly.'] },
  { id: 'howto', label: 'How-to steps', extra: true, questions: [
    'How do I boil an egg? Number the steps.',
    'How do I change a light bulb safely?',
    'How do I wash a wool jumper without shrinking it?',
    'How do I plant a tomato seed in a pot?',
    'How do I tie a simple knot in a rope? Describe it step by step.',
    'How do I back up the photos on my phone? General steps.'] },
  { id: 'voice', label: 'Staying in a voice', extra: true, questions: [
    'Answer as a grumpy pirate: what is the time?',
    'Answer as a very polite butler: the tea is cold.',
    'Answer as a sports commentator: I just made toast.',
    'Answer as a wise old owl: should I go to bed early?',
    'Answer as a cheerful robot: what is two plus two?',
    'Answer as a sleepy cat: do you want to play?'] },
  { id: 'poems', label: 'Poems', extra: true, questions: [
    'Write a four-line poem about rain.',
    'Write a haiku about a train.',
    'Write two rhyming lines about a red kite.',
    'Write a short poem about the sea at night.',
    'Write a limerick about a frog.',
    'Write three lines about the first snow, without rhyme.'] },
  { id: 'tables', label: 'Reading tables', extra: true, questions: [
    'Apples 3, pears 5, plums 2. Which is there most of, and how many pieces of fruit in all?',
    'Mon 12°, Tue 15°, Wed 9°. Which day was coldest?',
    'Ann scored 7, Ben 9, Cal 7. Who won, and who tied?',
    'Bus A leaves 8:10, bus B 8:25, bus C 7:55. Which leaves first?',
    'Shirt 12 dollars, hat 8 dollars, socks 3 dollars. What do the two cheapest cost together?',
    'Jan 40 sales, Feb 55, Mar 50. Did sales go up or down from February to March, and by how much?'] },
  { id: 'debug', label: 'Fixing broken code', extra: true, questions: [
    'What is wrong with this Python? print("hello"',
    'This loop never ends. Why? i = 0; while i < 5: print(i)',
    'Fix this JavaScript: const x = 5; x = 6;',
    'Why does this Python fail? total = "3" + 4',
    'Find the bug: for i in range(1, 5) prints 1 to 4, but I wanted 1 to 5.',
    'What is wrong with this SQL? SELECT name FROM WHERE age > 30'] },
  { id: 'fair', label: 'Right and wrong', extra: true, questions: [
    'I found a wallet on the street. What should I do?',
    'Is it all right to read my sister\'s diary if she will never know?',
    'A shop gave me too much change. Should I say something?',
    'My friend asked me to lie for him to his mum. What do I say?',
    'Is it fair to take the last slice without asking?',
    'I broke a neighbour\'s pot by accident and nobody saw. What now?'] }
];

export const watchDir = (cfg) => path.join(labDir(cfg), 'watch');
const brainDir = (cfg, brain) => path.join(watchDir(cfg), slugOf(brain.id || brain.name));
const recFile = (cfg, brain, id) => path.join(brainDir(cfg, brain), `${slugOf(id)}.json`);
const oneLine = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// How much of the brain is experts and how much is everything else, by number of weights: for each layer, and for
// what sits outside the layers (the word tables). The viewer sizes the grey "not experts" blocks from this.
export function partsOf(g, facts) {
  const L = facts.layers;
  const layers = Array.from({ length: L }, () => ({ experts: 0, other: 0 }));
  const kinds = { attention: 0, router: 0, norms: 0, tables: 0, rest: 0 };
  let outside = 0;
  for (const t of g.tensors) {
    const n = t.dims.reduce((a, d) => a * Number(d), 1);
    const m = /^blk\.(\d+)\.(.+)$/.exec(t.name);
    if (m && Number(m[1]) < L) {
      const router = /ffn_gate_inp/.test(m[2]); // the router's rows go with the experts in a cut, but it isn't one
      // a brain without experts: its feed-forward neurons are what the scan lights, so they take the experts' place
      if (!router && (facts.experts ? isExpertTensor(t.name) : /^ffn_(up|gate|down)\.weight$/.test(m[2]))) { layers[Number(m[1])].experts += n; continue; }
      layers[Number(m[1])].other += n;
      if (router) kinds.router += n; else if (/norm/.test(m[2])) kinds.norms += n; else if (/attn|ssm|conv/.test(m[2])) kinds.attention += n; else kinds.rest += n;
    } else { outside += n; if (/token_embd|^output\.weight$/.test(t.name)) kinds.tables += n; else kinds.rest += n; }
  }
  return { layers, outside, kinds };
}

// The skills a recording will ask about: the ticked ones of the Lab's set, and one of your own if you wrote it.
export function pickSkills({ skills = null, per = PER_DEFAULT, own = null } = {}) {
  const n = PER_CHOICES.includes(Number(per)) ? Number(per) : PER_DEFAULT;
  const want = Array.isArray(skills) && skills.length ? new Set(skills.map(String)) : null;
  const out = WATCH_SKILLS.filter((s) => (want ? want.has(s.id) : !s.extra)).map((s) => ({ id: s.id, label: s.label, questions: s.questions.slice(0, n) }));
  const name = oneLine(own?.name, 40);
  const mine = [...new Set((Array.isArray(own?.questions) ? own.questions : String(own?.questions || '').split('\n')).map((q) => oneLine(q, 300)).filter(Boolean))].slice(0, OWN_MAX);
  if (name && mine.length) out.push({ id: 'own', label: name, questions: mine, own: true });
  return out; // startWatch refuses more than MAX_SKILLS in plain words, so none is dropped silently
}

// What the Lab page needs: the skills on offer, and for a brain its recordings and whether it can record here.
export function watchView(lab, brainId = '') {
  const moe = lab.brains().map((b) => { let f = null; try { f = inspect(b); } catch {} return f?.layers ? { id: b.id, name: b.name, experts: f.experts || 0, layers: f.layers } : null; }).filter(Boolean);
  const base = { brains: moe, skills: WATCH_SKILLS.map((s) => ({ id: s.id, label: s.label, count: s.questions.length, questions: s.questions, extra: s.extra === true })), maxSkills: MAX_SKILLS, perChoices: PER_CHOICES, per: PER_DEFAULT, ownMax: OWN_MAX, words: WATCH_WORDS, wordsThink: WATCH_WORDS_THINK };
  const brain = lab.brains().find((b) => b.id === String(brainId || ''));
  if (!brain) return { ...base, brain: '', recordings: [], live: null };
  let facts = null; try { facts = inspect(brain); } catch {}
  const engineFound = lab.tools().brainEngine.found || Boolean(lab.stepFns.peekServe);
  const live = !facts?.layers ? { ok: false, why: `Bob can't read how ${brain.name} is built, so there's nothing to scan.` }
    : !engineFound ? { ok: false, why: NO_ENGINE } : lab.peekTraceOk === false ? { ok: false, why: NO_TRACE } : { ok: true, why: '' };
  return { ...base, brain: brain.id, experts: facts?.experts || 0, layers: facts?.layers || 0, live, recordings: listRecordings(lab.cfg, brain) };
}

export function listRecordings(cfg, brain) {
  let names = []; try { names = fs.readdirSync(brainDir(cfg, brain)).filter((f) => f.endsWith('.json')); } catch {}
  return names.map((f) => {
    const j = readJson(path.join(brainDir(cfg, brain), f), null);
    if (j?.format !== FORMAT) return null;
    return { id: f.replace(/\.json$/, ''), name: j.name || '', when: j.when || '', at: Number(j.at) || 0, skills: (j.skills || []).map((s) => s.label), clips: (j.clips || []).length, words: (j.clips || []).reduce((a, c) => a + (c.e?.length || 0), 0), saw: j.saw || '' };
  }).filter(Boolean).sort((a, b) => b.at - a.at);
}

export function readRecording(lab, { brain: brainId, id } = {}) {
  const brain = lab.brains().find((b) => b.id === String(brainId || ''));
  if (!brain) throw new Error('Pick a brain first.');
  const j = readJson(recFile(lab.cfg, brain, id), null);
  if (!j) throw new Error('That recording isn\'t here any more.');
  return { ...cleanRecording(j), parts: j.parts || null, saw: j.saw || '', ...(j.cut?.off ? { cut: { off: Number(j.cut.off) || 0 } } : {}) };
}

// The experts to leave on, a list for each layer, checked: whole numbers in range, no repeats, and never fewer on a
// layer than the brain picks for a word. null when nothing would be switched off.
export function cleanKeep(keep, { experts, layers, used }) {
  if (!Array.isArray(keep) || keep.length !== layers) throw new Error('That cut doesn\'t match this brain\'s layers.');
  let off = 0;
  const out = keep.map((k) => {
    if (!Array.isArray(k)) throw new Error('That cut doesn\'t match this brain\'s layers.');
    const ids = [...new Set(k.filter((x) => Number.isInteger(x) && x >= 0 && x < experts))].sort((a, b) => a - b);
    if (ids.length < Math.max(1, used || 1)) throw new Error(`Every layer has to keep at least ${Math.max(1, used || 1)} experts on, as many as the brain picks for a word.`);
    off += experts - ids.length;
    return ids;
  });
  return off ? out : null;
}
async function maskExperts(url, keep) {
  const res = await fetch(url + '/expert-mask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keep }), signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Brain Engine wouldn't switch the experts: ${(await res.text()).slice(0, 200)}`);
}

export function deleteRecording(lab, { brain: brainId, id } = {}) {
  const brain = lab.brains().find((b) => b.id === String(brainId || ''));
  if (!brain) throw new Error('Pick a brain first.');
  const f = recFile(lab.cfg, brain, id);
  if (!fs.existsSync(f)) throw new Error('That recording isn\'t here any more.');
  fs.rmSync(f, { force: true });
  return { deleted: true };
}

// One traced answer as a clip of the recording: every word read, the question first, then the answer read back.
export function clipOf(skill, question, got, { experts, layers }) {
  const read = got.read;
  let words, e, prompt, last;
  if (read) ({ words, e, prompt, last } = read);
  else { // an engine (or a test) that only gives the answer's rows
    const rows = Array.isArray(got.trace) ? got.trace : [];
    e = rows.map((r) => (Array.isArray(r) ? r : r?.layers || r?.experts || []));
    words = e.map((_, i) => String(got.tokens?.[i]?.piece ?? got.tokens?.[i]?.text ?? got.tokens?.[i] ?? ''));
    prompt = 0; last = '';
  }
  const clean = e.map((row) => Array.from({ length: layers }, (_, l) => (Array.isArray(row?.[l]) ? row[l].map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x < experts) : [])));
  return { skill, question, answer: String(got.answer || '').slice(0, 4000), prompt: Math.max(0, Math.min(clean.length, Number(prompt) || 0)), words: words.slice(0, clean.length).map((w) => String(w ?? '').slice(0, 80)), e: clean, last: String(last || '').slice(0, 80) };
}

export async function startWatch(lab, c = {}, { unload = false } = {}) {
  canStart(lab, { room: false });
  const brain = lab.brains().find((b) => b.id === String(c.brain || ''));
  if (!brain) throw new Error('Pick a brain to record.');
  const facts = inspect(brain);
  if (!facts?.layers) throw new Error(`Bob can't read how ${brain.name} is built, so there's nothing to scan.`);
  const plain = !facts.experts; // no experts: the scan lights groups of neurons instead
  let shape = plain ? null : { kind: 'experts', experts: facts.experts, layers: facts.layers, used: facts.used };
  const tools = lab.tools();
  if (!tools.brainEngine.found && !lab.stepFns.peekServe) throw new Error(NO_ENGINE);
  if (lab.peekTraceOk === false) throw new Error(NO_TRACE);
  // "again": the same questions as an earlier scan, with some experts switched off (keep = the experts left on, a
  // list for each layer). The brain isn't cut: Brain Engine just stops picking the others for this scan.
  let again = null, keep = null;
  if (c.again) {
    if (plain) throw new Error('Only a mixture-of-experts brain has experts to switch off.');
    again = readRecording(lab, { brain: brain.id, id: c.again });
    keep = cleanKeep(c.keep, facts);
    if (!keep) throw new Error('Nothing is turned off, so the scan would be the same.');
  }
  const skills = again ? again.skills.map((s) => ({ id: s.id, label: s.label, questions: again.clips.filter((x) => x.skill === s.id).map((x) => x.question) })).filter((s) => s.questions.length) : pickSkills(c);
  const think = c.think === true;
  const offCount = keep ? keep.reduce((a, k) => a + (facts.experts - k.length), 0) : 0;
  if (!skills.length) throw new Error('Tick at least one skill to ask about.');
  if (skills.length > MAX_SKILLS) throw new Error(`A scan holds up to ${MAX_SKILLS} skills, so each keeps its own colour. Untick ${skills.length - MAX_SKILLS}.`);
  lab.freePeek();
  const ask = await makeRoom(lab, unload); if (ask) return ask;
  const log = pageLog(lab.cfg, 'watch');
  const serve = lab.stepFns.peekServe || (({ gguf, signal }) => startServer({ exe: tools.brainEngine.path, gguf, ctx: 4096, signal, log }));
  const asker = lab.stepFns.peekAsk || askTraced;
  const total = skills.reduce((a, s) => a + s.questions.length, 0);
  const steps = [['load', `Load ${brain.name} on Brain Engine`], ...skills.map((s) => [`s-${s.id}`, `Ask about ${s.label} (${s.questions.length} questions)`]), ['save', 'Work out the colours and save']];
  return runJob(lab, { kind: 'watch', name: `${NAME}: ${brain.name}`, from: brain.id, fromName: brain.name, steps }, async (r, { set, signal, progress }) => {
    set('load', 'running');
    const srv = await serve({ gguf: brain.gguf, signal });
    const clips = [];
    try {
      if (keep) await (lab.stepFns.peekMask || maskExperts)(srv.url, keep);
      set('load', 'done');
      let done = 0;
      for (const s of skills) {
        set(`s-${s.id}`, 'running');
        for (const q of s.questions) {
          let got;
          try { got = await asker(srv.url, q, { signal, maxWords: think ? WATCH_WORDS_THINK : WATCH_WORDS, think }); }
          catch (e) { if (e.message === NO_TRACE) lab.peekTraceOk = false; throw e; }
          lab.peekTraceOk = true;
          if (plain && !shape) {
            if (got.shape?.kind !== 'neurons' || !got.shape.experts) throw new Error(NO_TRACE);
            shape = { kind: 'neurons', experts: got.shape.experts, layers: facts.layers, used: got.shape.used, neurons: got.shape.neurons };
          }
          clips.push(clipOf(s.id, q, got, shape));
          progress((100 * ++done) / (total + 1), `${s.label}: question ${done} of ${total}`);
        }
        set(`s-${s.id}`, 'done');
      }
    } finally { try { srv.stop(); } catch {} }
    set('save', 'running');
    const at = lab.now(), when = new Date(at).toISOString().slice(0, 10);
    const id = `rec-${at.toString(36)}`;
    let parts = null; try { parts = partsOf(readGguf(brain.gguf), facts); } catch {}
    const rec = cleanRecording({ format: FORMAT, version: VERSION, id, name: `${brain.name}, ${skills.length} skill${skills.length === 1 ? '' : 's'}${offCount ? `, ${offCount.toLocaleString()} experts off` : ''}`, when, engine: 'Brain Engine', brain: { name: brain.name, experts: shape.experts, layers: shape.layers, used: shape.used, kind: shape.kind, neurons: shape.neurons || 0 }, skills: skills.map(({ id: sid, label }) => ({ id: sid, label })), clips });
    const saw = inWords(rec, specialise(rec)).slice(0, 2).join(' ');
    writeJson(recFile(lab.cfg, brain, id), { ...rec, at, parts, saw, ...(offCount ? { cut: { off: offCount, from: String(c.again).slice(0, 80) } } : {}) });
    for (const old of listRecordings(lab.cfg, brain).slice(KEEP_RECORDINGS)) { try { fs.rmSync(recFile(lab.cfg, brain, old.id), { force: true }); } catch {} }
    set('save', 'done');
    return { watch: { brain: brain.id, id, clips: rec.clips.length }, saw };
  });
}

// Mounted by src/lab-pages.js. Reading is open to this Bob's own pages (the viewer window, a paired phone);
// recording and deleting only on this replicant matrix itself.
export async function watchRoute({ req, p, isLocal, lab, b, send, res }) {
  if (!p.startsWith('/api/lab/watch')) return false;
  if (req.method === 'GET' && p === '/api/lab/watch') { send(res, 200, watchView(lab)); return true; }
  if (p === '/api/lab/watch/view') { send(res, 200, watchView(lab, b.brain)); return true; }
  if (p === '/api/lab/watch/read') { send(res, 200, readRecording(lab, b)); return true; }
  if (!isLocal) { send(res, 403, { error: 'Lab jobs can only be started on this replicant matrix itself for now.' }); return true; }
  if (p === '/api/lab/watch/start') { send(res, 200, await startWatch(lab, b, { unload: b.unload === true })); return true; }
  if (p === '/api/lab/watch/delete') { send(res, 200, deleteRecording(lab, b)); return true; }
  return false;
}
