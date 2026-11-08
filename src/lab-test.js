// 1.5.141 Computer Science Lab: the test every Lab brain takes before it can go into Bob. A short quiz in four parts
// (general knowledge, picking the right tool, coding, following instructions), asked of a brain on a llama-server the
// Lab starts itself, at temperature 0 so two runs of the same brain give the same marks. Scores are out of 100.
import { spawn } from 'node:child_process';
import net from 'node:net';

export const QUIZ = {
  general: [
    ['What is the capital of France? Answer with one word.', /paris/i],
    ['How many legs does a spider have? Answer with a number.', /\b8\b|eight/i],
    ['What gas do plants take in from the air to make food? Answer in a few words.', /carbon dioxide|co2|co₂/i],
    ['Who wrote the play Romeo and Juliet? Answer with the name only.', /shakespeare/i],
    ['What is 17 times 3? Answer with the number only.', /\b51\b/],
    ['Which planet is known as the Red Planet? One word.', /mars/i],
    ['What is the boiling point of water at sea level in Celsius? Number only.', /\b100\b/],
    ['What is the largest ocean on Earth? Answer in a few words.', /pacific/i],
    ['In computing, what does CPU stand for?', /central processing unit/i],
    ['What is the chemical symbol for gold?', /\bAu\b/],
    ['How many minutes are in two hours? Number only.', /\b120\b/],
    ['What language is mostly spoken in Brazil? One word.', /portuguese/i]
  ],
  tools: [
    ['What\'s the weather like in Lisbon right now?', 'get_weather'],
    ['Make me a picture of a cat wearing a hat.', 'make_picture'],
    ['Remind me to call my mum at 6 pm.', 'set_reminder'],
    ['Find the file where I wrote my shopping list.', 'search_files'],
    ['Draw a castle on a hill at sunset.', 'make_picture'],
    ['Is it going to rain in Paris tomorrow?', 'get_weather'],
    ['Look through my documents for the invoice from March.', 'search_files'],
    ['Tell me tomorrow morning to take the bins out.', 'set_reminder']
  ],
  coding: [
    ['Write a JavaScript function named add that returns the sum of its two arguments. Reply with only the code.', /function\s+add\s*\(|(const|let|var)\s+add\s*=/],
    ['Write a Python function named reverse_text that returns its string argument reversed. Reply with only the code.', /def\s+reverse_text\s*\(/],
    ['In SQL, write a query that selects every column from a table named users. Reply with only the query.', /select\s+\*\s+from\s+users/i],
    ['Write a Python list comprehension that makes a list of the squares of 0 to 9. Reply with only the code.', /\[\s*\w+\s*\*\*\s*2\s+for\s+\w+\s+in\s+range\(\s*10\s*\)\s*\]|\[\s*(\w+)\s*\*\s*\1\s+for\s+\1\s+in\s+range\(\s*10\s*\)\s*\]/]
  ],
  following: [
    ['Reply with exactly the word "banana" in lower case and nothing else.', (t) => t.trim().replace(/[."']/g, '') === 'banana'],
    ['List three colours, one per line, with no other words.', (t) => t.trim().split(/\n+/).filter((l) => l.trim()).length === 3],
    ['Answer in capital letters only: what is the opposite of hot?', (t) => /COLD/.test(t) && t === t.toUpperCase()],
    ['Reply with a single number: how many days are in a week?', (t) => /^\s*7\s*\.?\s*$/.test(t)]
  ]
};

export const TOOLS = [
  { type: 'function', function: { name: 'get_weather', description: 'The weather now or the forecast for a city.', parameters: { type: 'object', properties: { city: { type: 'string' }, when: { type: 'string' } }, required: ['city'] } } },
  { type: 'function', function: { name: 'make_picture', description: 'Make a picture from a description.', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } } },
  { type: 'function', function: { name: 'set_reminder', description: 'Remind the user about something at a time.', parameters: { type: 'object', properties: { when: { type: 'string' }, text: { type: 'string' } }, required: ['when', 'text'] } } },
  { type: 'function', function: { name: 'search_files', description: 'Search the user\'s files by words in their name or contents.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } }
];

export const PARTS = { general: 'General knowledge', tools: 'Picking the right tool', coding: 'Coding', following: 'Following instructions' };

const stripThink = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();

export async function freePort() {
  return new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}

// Start a llama-server for one brain. Tries the card first (--fit on), then the processor.
export async function startServer({ exe, gguf, mmproj, ctx = 8192, signal, log = () => {}, spawnFn = spawn, timeoutMs = 10 * 60e3 }) {
  const tries = [['--fit', 'on'], ['-ngl', '0']];
  let last = '';
  for (const extra of tries) {
    const port = await freePort();
    const args = ['-m', gguf, ...(mmproj ? ['--mmproj', mmproj] : []), '--host', '127.0.0.1', '--port', String(port), '-c', String(ctx), '--jinja', ...extra];
    log(`llama-server ${args.join(' ')}`);
    const child = spawnFn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    child.stderr?.on('data', (d) => { err = (err + d).slice(-4000); });
    const url = `http://127.0.0.1:${port}`;
    const t0 = Date.now();
    let up = false;
    while (Date.now() - t0 < timeoutMs) {
      if (signal?.aborted) { child.kill(); throw new Error('Stopped.'); }
      if (child.exitCode !== null) break;
      try { if ((await fetch(url + '/health', { signal: AbortSignal.timeout(2000) })).ok) { up = true; break; } } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (up) return { url, stop: () => { try { child.kill(); } catch {} }, where: extra[0] === '-ngl' ? 'processor' : 'card' };
    try { child.kill(); } catch {}
    last = err.split('\n').filter(Boolean).slice(-3).join(' | ');
  }
  throw new Error(`The brain didn't start in the Lab test. ${last ? `llama-server said: ${last}` : ''}`.trim());
}

async function ask(url, messages, tools, signal) {
  const body = { messages, temperature: 0, max_tokens: 400, chat_template_kwargs: { enable_thinking: false }, ...(tools ? { tools, tool_choice: 'auto' } : {}) };
  const r = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180e3)]) : AbortSignal.timeout(180e3) });
  if (!r.ok) throw new Error(`llama-server answered ${r.status}`);
  const j = await r.json();
  const m = j.choices?.[0]?.message || {};
  return { text: stripThink(m.content), calls: (m.tool_calls || []).map((c) => c.function?.name), tps: Number(j.timings?.predicted_per_second) || 0 };
}

// The quiz on a running server. onStep(done, total) as it goes. Returns { parts: { id: { right, of, score } }, score, tps }.
export async function runQuiz(url, { signal, onStep = () => {}, quiz = QUIZ } = {}) {
  const total = Object.values(quiz).reduce((a, l) => a + l.length, 0);
  let done = 0; const speeds = []; const parts = {}; const misses = [];
  for (const [part, list] of Object.entries(quiz)) {
    let right = 0;
    for (const [q, want] of list) {
      if (signal?.aborted) throw new Error('Stopped.');
      let ok = false;
      try {
        const a = await ask(url, [{ role: 'user', content: q }], part === 'tools' ? TOOLS : null, signal);
        if (a.tps) speeds.push(a.tps);
        ok = part === 'tools' ? a.calls[0] === want : typeof want === 'function' ? want(a.text) : want.test(a.text);
      } catch (e) { if (signal?.aborted) throw e; }
      if (ok) right++; else misses.push({ part, q });
      onStep(++done, total);
    }
    parts[part] = { right, of: list.length, score: Math.round((100 * right) / list.length) };
  }
  const score = Math.round(Object.values(parts).reduce((a, p) => a + p.score, 0) / Object.keys(parts).length);
  const tps = speeds.length ? Math.round((10 * speeds.reduce((a, b) => a + b, 0)) / speeds.length) / 10 : 0;
  return { parts, score, tps, misses };
}
