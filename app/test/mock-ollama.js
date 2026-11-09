// A tiny fake Ollama for testing Bob without a GPU. Scripted replies based on the last user message.
import http from 'node:http';

export function startMockOllama(port) {
  const loaded = new Set();
  const onCpu = new Set(); // models loaded with num_gpu 0 (on the processor): no graphics memory, like real Ollama
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const j = body ? JSON.parse(body) : {};
    calls.push({ path: req.url, body: j });
    const send = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

    if (req.url === '/api/ps') return send({ models: [...loaded].map((name) => ({ name, model: name, size: 1e9, size_vram: onCpu.has(name) ? 0 : 1e9 })) });
    // Only the coder can see in this fake: tests check pictures go only to brains with vision.
    if (req.url === '/api/show') return send({ capabilities: j.model === 'qwen3-coder:30b' ? ['completion', 'tools', 'vision'] : ['completion', 'tools'], model_info: { 'gemma4.context_length': 131072 } });
    if (req.url === '/api/tags') return send({ models: [{ name: 'gemma4:26b', size: 18e9 }, { name: 'qwen3-coder:30b', size: 19e9 }] });
    if (req.url === '/api/generate') {
      if (j.keep_alive === 0) { loaded.delete(j.model); return send({ done: true }); }
      await new Promise((r) => setTimeout(r, 1200));
      loaded.clear();
      loaded.add(j.model);
      if (j.options?.num_gpu === 0) onCpu.add(j.model); else onCpu.delete(j.model);
      return send({ done: true });
    }
    if (req.url === '/api/chat' && j.stream === false) {
      const audio = j.messages?.[0]?.images?.[0];
      return send({ message: { role: 'assistant', content: audio ? (process.env.MOCK_HEARD || 'hello Bob') : '' }, done: true, cpu: j.options?.num_gpu === 0 });
    }
    if (req.url === '/api/chat') {
      loaded.clear();
      loaded.add(j.model);
      if (j.options?.num_gpu === 0) onCpu.add(j.model); else onCpu.delete(j.model);
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      const line = (o) => res.write(JSON.stringify(o) + '\n');
      const msgs = j.messages;
      const lastUser = [...msgs].reverse().find((m) => m.role === 'user')?.content || '';
      const last = msgs.at(-1);
      const sys = msgs[0]?.content || '';
      const words = (t) => t.split(/(?<= )/).forEach((w) => line({ message: { role: 'assistant', content: w }, done: false }));
      const tool = (name, args) => line({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] }, done: false });

      if (/workbench copy/.test(sys) && /rename/i.test(lastUser)) {
        const edits = msgs.filter((x) => x.role === 'tool' && x.tool_name === 'edit_file').length;
        if (edits < 2) tool('edit_file', { path: process.env.MOCK_PROJECT_FILE, find: edits ? 'int b = 2;' : 'int a = 1;', replace: edits ? 'int bravo = 2;' : 'int alpha = 1;' });
        else words('Renamed a to alpha and b to bravo.');
      } else if (last.role === 'tool' && last.tool_name === 'notice_board' && !/saved/.test(last.content)) {
        tool('notice_board', { action: 'write', content: '# Notice board, 2026-11-01\nXP today: 0\n\n## Main quest\n- [ ] Ship MouseHole (est. 2 h, 50 XP)\n' });
      } else if (last.role === 'tool') {
        words(`Done. (${last.tool_name} said: ${String(last.content).slice(0, 60)})`);
      } else if (/workbench copy/.test(sys) && /actor's name/i.test(lastUser)) {
        // Only answerable from an earlier message: proves the hat got the conversation so far.
        words(/Sam: the actor is called Grimbold/.test(lastUser) && /## The job/.test(lastUser) ? 'The actor is Grimbold.' : 'No idea, nobody told me.');
      } else if (/workbench/.test(sys) && j.model === 'qwen3-coder:30b') {
        words('Here is the fix:\n```cpp\nif (IsValid(Actor)) { Actor->Destroy(); }\n```\nCheck IsValid first.');
      } else if (/board/i.test(lastUser)) {
        const hasRead = msgs.some((m) => m.role === 'tool' && m.tool_name === 'notice_board');
        tool('notice_board', hasRead ? { action: 'write', content: '# Notice board, 2026-11-01\nXP today: 0\n\n## Main quest\n- [ ] Ship MouseHole (est. 2 h, 50 XP)\n' } : { action: 'read' });
      } else if (/crash|rename/i.test(lastUser)) {
        tool('ask_specialist', { hat: 'tinker', task: lastUser });
      } else if (/save a note/i.test(lastUser)) {
        tool('write_file', { path: process.env.MOCK_OUTSIDE_FILE, content: 'hello from Bob' });
      } else if (/remember/i.test(lastUser)) {
        tool('remember', { fact: 'Sam likes pixel art.' });
      } else {
        words('Welcome to The Idle Process. I have no legs, but I do have **16 GB of VRAM**. What is the quest?');
      }
      line({ message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 900, eval_count: 40, eval_duration: 8e8 }); // 1.5.30: Ollama's end-of-reply numbers
      return res.end();
    }
    res.writeHead(404); res.end();
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ server, calls, loaded })));
}
