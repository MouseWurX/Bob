// A fake llama-server.exe for tests: same command-line flags and HTTP endpoints, scripted replies.
import http from 'node:http';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (f) => argv[argv.indexOf(f) + 1];
const port = Number(arg('--port'));
const modelFile = path.basename(arg('-m'));
const readyAt = Date.now() + 800;
// Reliability 218-228 tests: a setting the engine refuses, running out of memory above a chat memory size, a crash.
if (argv.includes('--bad-flag')) { console.error('error: invalid argument: --bad-flag'); process.exit(1); }
if (Number(process.env.MOCK_OOM_ABOVE) > 0 && Number(arg('-c')) > Number(process.env.MOCK_OOM_ABOVE)) { console.error('ggml_backend_cuda_buffer_type_alloc_buffer: allocating 9000 MiB on device 0: cudaMalloc failed: out of memory'); process.exit(1); }

http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  // 1.5.32 tests: whether the card was hidden from this server (Gaming, "Never use the card").
  if (req.url === '/test-env') { res.writeHead(200); return res.end(JSON.stringify({ cuda: process.env.CUDA_VISIBLE_DEVICES ?? null })); }
  if (req.url === '/test-crash') { console.error('CUDA error: an illegal memory access was encountered'); process.exit(3); }
  if (req.url === '/health') { res.writeHead(Date.now() > readyAt ? 200 : 503); return res.end('{}'); }
  // Saved readings (1.5.24): /slots/0?action=save|restore with a plain file name under --slot-save-path.
  if (req.url.startsWith('/slots/0?action=')) {
    const dir = arg('--slot-save-path');
    const action = req.url.split('=')[1];
    const name = JSON.parse(body || '{}').filename || '';
    const fs = await import('node:fs');
    if (!dir || !/^[\w.-]+$/.test(name)) { res.writeHead(400); return res.end('{}'); }
    if (action === 'save') { fs.writeFileSync(path.join(dir, name), 'KV'); res.writeHead(200); return res.end('{"n_saved":10}'); }
    if (action === 'restore') { const ok = fs.existsSync(path.join(dir, name)); res.writeHead(ok ? 200 : 400); return res.end(ok ? '{"n_restored":10}' : '{}'); }
  }
  // 1.5.72: the embedding server (--embedding): one short vector per input, from its length; and the flags it got.
  if (req.url === '/test-args') { res.writeHead(200); return res.end(JSON.stringify({ argv, cuda: process.env.CUDA_VISIBLE_DEVICES ?? null })); }
  if (req.url === '/v1/embeddings') {
    if (!argv.includes('--embedding')) { res.writeHead(501); return res.end('{}'); }
    const input = [].concat(JSON.parse(body).input);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ data: input.map((t, index) => ({ index, embedding: [String(t).length, 1, 0] })).reverse() }));
  }
  if (req.url === '/v1/chat/completions') {
    const j = JSON.parse(body);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (delta) => res.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
    const msgs = j.messages, last = [...msgs].reverse().find((m) => m.role !== 'system') || msgs.at(-1); // Nov 11: Bob's "where we are" note can come last
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user')?.content || '';
    // Every tool message must answer a tool call id from the assistant message before it.
    const ids = new Set(msgs.flatMap((m) => (m.tool_calls || []).map((t) => t.id)));
    const badIds = msgs.filter((m) => m.role === 'tool' && !ids.has(m.tool_call_id)).length;
    if (last.role === 'tool' && /notice board is empty/i.test(last.content)) {
      send({ tool_calls: [{ index: 0, id: 'x2', type: 'function', function: { name: 'notice_board', arguments: '' } }] });
      send({ tool_calls: [{ index: 0, function: { arguments: '{"action":"write","content":"# Notice board\\n- [ ] Llama quest"}' } }] });
    } else if (last.role === 'tool') {
      send({ content: `Done (bad ids: ${badIds}).` });
    } else if (/board/i.test(lastUser)) {
      send({ tool_calls: [{ index: 0, id: 'x1', type: 'function', function: { name: 'notice_board', arguments: '{"action":' } }] });
      send({ tool_calls: [{ index: 0, function: { arguments: '"read"}' } }] });
    } else {
      for (const w of `Hello from ${modelFile}. `.split(/(?<= )/)) send({ content: w });
    }
    res.write('data: [DONE]\n\n');
    return res.end();
  }
  res.writeHead(404); res.end();
}).listen(port, '127.0.0.1');
