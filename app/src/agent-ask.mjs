#!/usr/bin/env node
// One coding agent hands a task to another, through Bob (Coding agents, "Agent hand-offs").
//   node agent-ask.mjs <agent name> "<the task>"
// It waits for that agent to finish and prints what it said. Bob gives each agent he runs the three settings this
// needs (BOB_AGENTS_URL, BOB_AGENT_TOKEN, BOB_AGENT_NAME); the token only works while that run is going.
// No imports from the rest of Bob, so it runs from anywhere Node 18 or newer is.
const [to, ...words] = process.argv.slice(2);
const url = process.env.BOB_AGENTS_URL, token = process.env.BOB_AGENT_TOKEN;
if (!to || !words.length) { console.error('Use: node agent-ask.mjs <agent name> "<the task>"'); process.exit(2); }
if (!url || !token) { console.error('This only works inside a coding agent that Bob started.'); process.exit(2); }
let text = words.join(' ');
if (!process.stdin.isTTY) { let piped = ''; for await (const c of process.stdin) piped += c; if (piped.trim()) text += `\n\n${piped}`; }
try {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ token, to, text }), signal: AbortSignal.timeout(31 * 60000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(j.error || `Bob answered ${r.status}.`); process.exit(1); }
  console.log(j.said || '(no answer)');
  if (j.state === 'needs-you') console.log(`\n(${j.name} needs the person: ${j.why})`);
  process.exit(j.state === 'failed' ? 1 : 0);
} catch (e) { console.error(`Couldn't reach Bob: ${e.message}`); process.exit(1); }
