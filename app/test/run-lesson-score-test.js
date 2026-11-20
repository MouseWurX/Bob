// Lesson scoring (model-lab/lesson-score.mjs): the pick, the turn split, the grammar, the kinds of text, the KLD and the
// comparison, all with fake servers; nothing reads the real computer.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };

(async () => {
  const m = await import(pathToFileURL(path.join(__dirname, '..', 'model-lab', 'lesson-score.mjs')).href);

  { const rows = [...Array(10)].map((_, i) => ({ idea: `lessons-jobs-fix1:fx-${i}`, messages: [] })).concat([{ idea: 'lessons-distill-a3b:x', messages: [] }]);
    const a = m.pickLessons(rows, { pick: 4 }), b = m.pickLessons([...rows].reverse(), { pick: 4 });
    check('the pick takes only the neutral teacher\'s lessons, the same ones whatever the file order', a.length === 4 && a.every((r) => r.idea.includes('jobs-fix1')) && a.map((r) => r.idea).join() === b.map((r) => r.idea).join()); }

  { const ts = { s1: { system: 'You are Bob.', tools: [{ type: 'function', function: { name: 'read_file' } }] } };
    const lesson = { idea: 'x', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '', set: 's1', think: 'False', tool_calls: [{ type: 'function', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }] }, { role: 'tool', name: 'read_file', content: 'text' }, { role: 'assistant', content: 'Done.', think: 'False' }] };
    const r = m.chatMessages(lesson, ts);
    check('a lesson becomes chat messages with its own system prompt and tools, Bob\'s extra fields dropped', r.msgs[0].role === 'system' && r.msgs[0].content === 'You are Bob.' && r.tools.length === 1 && r.msgs[2].tool_calls[0].function.arguments === '{"path":"a.txt"}' && !('set' in r.msgs[2]) && !('think' in r.msgs[2]) && r.msgs[3].name === 'read_file', r); }

  { const before = 'S<|im_start|>assistant\n<think>\n\n</think>\n\n';
    const full = 'S<|im_start|>assistant\nHello there.<|im_end|>\n<|im_start|>user\nok<|im_end|>\n';
    const sp = m.splitTurn(before, full);
    check('the right answer is what the full text adds past the shared start, up to the turn\'s end mark (the empty think block is not assumed)', sp && sp.prompt === 'S<|im_start|>assistant\n' && sp.gold === 'Hello there.', sp);
    check('a turn with no end mark is skipped', m.splitTurn('a', 'ab') === null); }

  check('the grammar allows only the text, quotes, backslashes and new lines escaped', m.grammarFor('say "hi"\nC:\\x') === 'root ::= "say \\"hi\\"\\nC:\\\\x"');

  { const g = 'Here:\n<tool_call>\n{"name": "read_file", "arguments": {"path": "C:\\\\Users\\\\you\\\\a.txt", "lines": 5}}\n</tool_call>';
    const k = m.charKinds(g); const at = (s) => k[g.indexOf(s)];
    check('kinds of text: tool name, path in the arguments, other JSON, marks and prose', at('read_file') === 'tool-name' && at('Users') === 'path' && at('"lines"') === 'json' && at('<tool_call>') === 'other' && at('Here') === 'prose', { name: at('read_file'), path: at('Users'), json: at('"lines"') });
    const c = 'Run this:\n```python\nprint(1)\n```\nthen open notes.md';
    const kc = m.charKinds(c);
    check('fenced code and a file name in prose are their own kinds', kc[c.indexOf('print')] === 'code' && kc[c.indexOf('notes.md')] === 'path' && kc[c.indexOf('then')] === 'prose');
    const t = m.tokenKinds('ab<tool_call>{"name": "web_search"}', ['ab', '<tool_call>', '{"', 'name', '":', ' "', 'web', '_search', '"}']);
    check('each token takes the kind of most of its characters', t[0] === 'prose' && t[1] === 'other' && t[6] === 'tool-name' && t[7] === 'tool-name' && t[3] === 'json', t); }

  { const same = [[1, Math.log(0.6)], [2, Math.log(0.3)]];
    const k0 = m.topKld(same, same), k1 = m.topKld(same, [[2, Math.log(0.6)], [1, Math.log(0.3)]]), k2 = m.topKld(same, [[3, Math.log(0.9)]]);
    check('KLD over the top list: 0 for the same odds, more for swapped, most when the reference\'s picks are missing', Math.abs(k0) < 1e-9 && k1 > 0.1 && k2 > k1, { k0, k1, k2 }); }

  { const prompts = [];
    const fetchFn = async (u, o) => { const b = JSON.parse(o.body); const route = u.replace('http://x', '');
      if (route === '/apply-template') return { ok: true, text: async () => JSON.stringify({ prompt: b.add_generation_prompt ? 'P<a>' : 'P<a>' + (b.messages.at(-2).content || 'TC') + '<|im_end|>\nU' }) };
      prompts.push(b);
      const pieces = b.grammar.includes('Hi') ? ['H', 'i'] : ['T', 'C'];
      return { ok: true, text: async () => JSON.stringify({ completion_probabilities: pieces.map((p, i) => ({ id: i + 1, token: p, logprob: -0.1, top_logprobs: [{ id: i + 1, logprob: -0.1 }] })) }) }; };
    const rows = [];
    const lesson = { idea: 'l1', job: 'j', messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'Hi' }, { role: 'user', content: 'again' }, { role: 'assistant', content: '' }] };
    const t = await m.scoreLessons({ url: 'http://x', lessons: [lesson], toolsets: {}, fetchFn, onRow: (r) => rows.push(r) });
    check('each assistant turn is scored once: forced by a grammar, greedy, raw odds, thinking off', t.turns === 2 && t.scored === 2 && prompts.length === 2 && prompts[0].temperature === 0 && prompts[0].post_sampling_probs === false && prompts[0].n_probs === 20 && prompts[0].prompt === 'P<a>' && rows[0].gold === 'Hi' && rows[0].matched && rows[0].toks[0].top1, { t, p: prompts[0] });

    const ref = [{ idea: 'l1', turn: 1, kinds: ['prose', 'prose'], toks: [{ id: 1, lp: -0.1, top1: true, top: [[1, Math.log(0.9)], [2, Math.log(0.05)]] }, { id: 5, lp: -0.2, top1: true, top: [[5, Math.log(0.8)]] }] }];
    const test = [{ idea: 'l1', turn: 1, kinds: ['prose', 'prose'], toks: [{ id: 1, lp: -0.5, top1: true, top: [[1, Math.log(0.6)], [2, Math.log(0.3)]] }, { id: 6, lp: -2, top1: false, top: [[6, Math.log(0.5)]] }] }];
    const c = m.compare(ref, [test], { names: ['q8', 'q3'] });
    const q3 = c.stats[1].s.all;
    check('the comparison counts every token for log-odds but KLD only while both wrote the same tokens', q3.n === 2 && q3.kn === 1 && q3.kld > 0 && /\| all \| q3 \| 2 \|/.test(c.table), q3); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
