// A tiny MCP server for the tests: stdio by default, or Streamable HTTP with --http <port> (JSON replies, or an event
// stream when MOCK_SSE=1). Tools: list_scene (only looks), add_object (needs name), run_code, screenshot (a picture),
// fail (isError). A log line on stdout before the first message checks that stray text is ignored.
import http from 'node:http';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const objects = ['Camera', 'Light'];
const TOOLS = [
  { name: 'list_scene', description: 'List the objects in the scene.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'add_object', description: 'Add an object to the scene. Returns its name.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Object name' }, location: { type: 'array', items: { type: 'number' } } }, required: ['name'] } },
  { name: 'delete_all', description: 'Delete every object.', inputSchema: { type: 'object', properties: {} }, annotations: { destructiveHint: true } },
  { name: 'run_code', description: 'Run Python inside the app.', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'save_file', description: 'Save the scene to a file.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'screenshot', description: 'A picture of the viewport.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'fail', description: 'Always fails.', inputSchema: { type: 'object', properties: {} } },
  { name: 'slow', description: 'Takes 5 seconds.', inputSchema: { type: 'object', properties: {} } }
];

async function handle(m) {
  if (m.method === 'initialize') return { protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'mock-mcp', version: '1.0' } };
  if (m.method === 'tools/list') {
    // two pages, to check paging
    if (!m.params?.cursor) return { tools: TOOLS.slice(0, 3), nextCursor: 'p2' };
    return { tools: TOOLS.slice(3) };
  }
  if (m.method === 'tools/call') {
    const { name, arguments: a = {} } = m.params || {};
    if (name === 'list_scene') return { content: [{ type: 'text', text: objects.join(', ') }] };
    if (name === 'add_object') { objects.push(a.name); return { content: [{ type: 'text', text: `Added ${a.name}${a.location ? ` at ${a.location.join(',')}` : ''}` }] }; }
    if (name === 'delete_all') { objects.length = 0; return { content: [{ type: 'text', text: 'Deleted all' }] }; }
    if (name === 'run_code') return { content: [{ type: 'text', text: `ran ${String(a.code).length} chars` }] };
    if (name === 'save_file') return { content: [{ type: 'text', text: `saved ${a.path}` }] };
    if (name === 'screenshot') return { content: [{ type: 'image', data: PNG, mimeType: 'image/png' }] };
    if (name === 'fail') return { content: [{ type: 'text', text: 'No scene open' }], isError: true };
    if (name === 'slow') { await new Promise((r) => setTimeout(r, 5000)); return { content: [{ type: 'text', text: 'done' }] }; }
    throw Object.assign(new Error(`Unknown tool ${name}`), { code: -32602 });
  }
  if (m.method === 'ping') return {};
  throw Object.assign(new Error('Method not found'), { code: -32601 });
}
const reply = async (m) => {
  try { return { jsonrpc: '2.0', id: m.id, result: await handle(m) }; } catch (e) { return { jsonrpc: '2.0', id: m.id, error: { code: e.code || -32603, message: e.message } }; }
};

const port = process.argv.indexOf('--http') >= 0 ? Number(process.argv[process.argv.indexOf('--http') + 1]) : 0;
if (!port) {
  process.stdout.write('mock-mcp starting (a log line, not JSON)\n');
  if (process.env.MOCK_SECRET_KEY) process.stderr.write('LEAKED KEY\n');
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const m = JSON.parse(line);
      if (m.id === undefined) continue;
      if (m.method === 'initialize') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 'srv-1', method: 'ping' }) + '\n'); // the server asks us something
      process.stdout.write(JSON.stringify(await reply(m)) + '\n');
    }
  });
  process.stdin.on('end', () => process.exit(0));
} else {
  let session = '';
  http.createServer(async (req, res) => {
    if (req.method === 'DELETE') { session = ''; res.writeHead(200); return res.end(); }
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    let body = '';
    for await (const c of req) body += c;
    const m = JSON.parse(body);
    if (m.method !== 'initialize' && req.headers['mcp-session-id'] !== session) { res.writeHead(400); return res.end('no session'); }
    if (m.id === undefined) { res.writeHead(202); return res.end(); }
    const r = await reply(m);
    const h = {};
    if (m.method === 'initialize') { session = 'sess-' + Math.random().toString(36).slice(2); h['mcp-session-id'] = session; }
    if (process.env.MOCK_SSE === '1') {
      res.writeHead(200, { ...h, 'content-type': 'text/event-stream' });
      res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: {} })}\n\n`);
      res.write(`event: message\ndata: ${JSON.stringify(r)}\n\n`);
      return res.end();
    }
    res.writeHead(200, { ...h, 'content-type': 'application/json' });
    res.end(JSON.stringify(r));
  }).listen(port, '127.0.0.1', () => process.stdout.write(`listening ${port}\n`));
}
