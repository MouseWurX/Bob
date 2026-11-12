// Item 242 (Nov 12): a fake engine for tests. It speaks llama-server's chat endpoint (/v1/chat/completions, streamed)
// on a local port, and each request takes the next cue, so a test can make it misbehave on cue:
//   { say: 'words' }                 a normal reply, word by word, then the end mark
//   { call: { name, args } }         one tool call (args: an object, or a string sent as written)
//   { calls: [{ name, args }, ...] } several in one reply
//   { broken: { name, args: '{"pa' }} a tool call whose input is cut-off JSON
//   { stall: 'words', ms }           sends the words, then goes quiet for ms (no ms: until the test closes it)
//   { slow: ms, say }                says nothing at all for ms before the first word
//   { crash: 'words' }               sends the words, then drops the connection
//   { cut: 'words', call? }          stops at the length limit (finish_reason "length"), part of a call if given
//   { early: 'words' }               ends the stream without the end mark ([DONE])
//   { status: 503, body }            an HTTP error before any words
// With no cues left it says "done". /health answers ok. Nothing leaves this replicant matrix (127.0.0.1 only).
import http from 'node:http';

export async function startFakeEngine({ cues = [] } = {}) {
  const queue = [...cues];
  const requests = [];
  const open = new Set();
  const server = http.createServer(async (req, res) => {
    open.add(res);
    res.on('close', () => open.delete(res));
    let body = '';
    for await (const c of req) body += c;
    if (req.url === '/health') { res.writeHead(200); return res.end('{}'); }
    if (req.url === '/props') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"chat_template":""}'); }
    if (req.url !== '/v1/chat/completions') { res.writeHead(404); return res.end(); }
    let j = {}; try { j = JSON.parse(body); } catch {}
    requests.push(j);
    const cue = queue.shift() || { say: 'done' };
    if (cue.status) { res.writeHead(cue.status, { 'content-type': 'application/json' }); return res.end(cue.body || JSON.stringify({ error: { message: 'busy' } })); }
    if (cue.slow) await new Promise((r) => setTimeout(r, cue.slow));
    if (res.destroyed) return;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (delta, finish = null) => res.write(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\n\n`);
    const words = (t) => { for (const w of String(t || '').split(/(?<= )/)) if (w) send({ content: w }); };
    const callDelta = (c, i, cut = false) => {
      const args = typeof c.args === 'string' ? c.args : JSON.stringify(c.args || {});
      send({ tool_calls: [{ index: i, id: `call_${requests.length}_${i}`, type: 'function', function: { name: c.name, arguments: '' } }] });
      send({ tool_calls: [{ index: i, function: { arguments: cut ? args.slice(0, Math.max(1, Math.floor(args.length / 2))) : args } }] });
    };
    const end = (finish = 'stop') => { send({}, finish); res.write('data: [DONE]\n\n'); res.end(); };
    if (cue.say !== undefined && !cue.stall && !cue.crash && !cue.cut && !cue.early) { words(cue.say); return end(); }
    if (cue.call) { callDelta(cue.call, 0); return end('tool_calls'); }
    if (cue.calls) { cue.calls.forEach((c, i) => callDelta(c, i)); return end('tool_calls'); }
    if (cue.broken) { callDelta({ name: cue.broken.name, args: String(cue.broken.args ?? '{"pa') }, 0); return end('tool_calls'); }
    if (cue.stall !== undefined) { words(cue.stall); if (cue.ms) setTimeout(() => { if (!res.destroyed) end(); }, cue.ms); return; }
    if (cue.crash !== undefined) { words(cue.crash); setTimeout(() => res.destroy(), 20); return; }
    if (cue.cut !== undefined) { words(cue.cut); if (cue.call) callDelta(cue.call, 0, true); return end('length'); }
    if (cue.early !== undefined) { words(cue.early); return res.end(); }
    end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return {
    port, url: `http://127.0.0.1:${port}`, requests,
    cue: (...c) => queue.push(...c),
    left: () => queue.length,
    close: () => new Promise((r) => { for (const res of open) res.destroy(); server.close(() => r()); })
  };
}
