// Before any card time is spent (14 Nov, the owner: "you keep costing me money"; Nov 13 a rental skipped its planned steps
// because the engine lacked them): check that the served Brain Engine can do every step a plan needs, in about a minute,
// and stop with exit 1 if one can't. Every switch goes back at the end.
//   node engine-check.mjs --url <server> [--needs chat,tools,odds,think,n,mask,dials,trace,mass]
import { live } from './engine-live.mjs';
import { pathToFileURL } from 'node:url';

export async function checkEngine(eng, needs) {
  const res = [];
  const t = async (name, fn) => { if (!needs.has(name)) return; try { const why = await fn(); res.push({ name, ok: true, why: why || 'ok' }); } catch (e) { res.push({ name, ok: false, why: String(e.message || e).slice(0, 160) }); } };
  const msg = [{ role: 'user', content: 'Say hi.' }];
  const tool = [{ type: 'function', function: { name: 'list_folder', description: 'List a folder.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }];
  await t('chat', async () => { const j = await eng.chat({ messages: msg, max_tokens: 8, temperature: 0, chat_template_kwargs: { enable_thinking: false } }); if (!j.choices?.[0]?.message) throw new Error('no reply'); });
  await t('tools', async () => { const j = await eng.chat({ messages: [{ role: 'user', content: 'List C:\\Users\\you\\Documents.' }], tools: tool, max_tokens: 80, temperature: 0, chat_template_kwargs: { enable_thinking: false } }); return j.choices?.[0]?.message?.tool_calls?.length ? 'called a tool' : 'no tool call (still served)'; });
  await t('odds', async () => { const j = await eng.chat({ messages: msg, tools: tool, max_tokens: 8, temperature: 0, logprobs: true, top_logprobs: 8, chat_template_kwargs: { enable_thinking: false } }); if (!j.choices?.[0]?.logprobs?.content?.length) throw new Error('no top-K odds with tools on'); });
  await t('think', async () => { const j = await eng.chat({ messages: msg, max_tokens: 200, temperature: 0, chat_template_kwargs: { enable_thinking: true } }); const m = j.choices?.[0]?.message || {}; if (!m.reasoning_content && !/<think>/.test(m.content || '')) throw new Error('no thinking came back'); });
  await t('n', async () => { await eng.setUsed(10); const g = await eng.getUsed(); await eng.setUsed(null); return `experts per word switch ok (${JSON.stringify(g).slice(0, 60)})`; });
  await t('mask', async () => { await eng.setMask(null); });
  await t('dials', async () => { await eng.setDials([{ kind: 'expert', layer: 0, index: 0, scale: 1.5 }]); await eng.setDials([]); });
  await t('trace', async () => { const j = await eng.trace(msg); if (!j.expert_trace) throw new Error('no expert_trace in the reply'); });
  // a long prompt (read in several chunks) alone, like trace-read sends: the short check alone missed the 14 Nov loss
  await t('trace-long', async () => { const j = await eng.trace([{ role: 'user', content: 'Count the words. ' + 'alpha beta gamma delta '.repeat(700) }]); if (!j.expert_trace) throw new Error('no expert_trace for a long prompt (about 3,000 tokens)'); return 'long prompt traced'; });
  await t('mass', async () => { const j = await eng.trace(msg, { mass: true }); if (!j.expert_trace) throw new Error('no expert_trace in the reply'); return JSON.stringify(j.expert_trace).includes('mass') ? 'mass ok' : 'trace ok, no mass field (keep lists ranked by picks)'; });
  try { await eng.reset(); } catch {}
  return res;
}

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  const url = String(a.url || process.env.LAB_URL || ''); if (!url) { console.error('--url <server> is needed'); process.exit(1); }
  const needs = new Set(String(a.needs || 'chat,tools,odds,think,n,mask,dials,trace,trace-long,mass').split(','));
  const res = await checkEngine(live(url), needs);
  for (const r of res) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}: ${r.why}`);
  const bad = res.filter((r) => !r.ok);
  if (bad.length) { console.log(`GATE STOP: engine check failed (${bad.map((r) => r.name).join(', ')}); stop before spending card time`); process.exit(86); } // 86 = the Forge ends the run and deletes the pod
  console.log('Engine check passed: every step this plan needs can run here.');
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
