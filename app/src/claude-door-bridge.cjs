// The tiny helper the Claude app starts for "Hands for Claude" (src/claude-door.js).
// The Claude app talks to its tools over stdin/stdout, one JSON message per line; Bob's door is a web address on
// this computer. This passes each message to Bob (with the app's key) and each answer back. It runs as Bob's own
// program in Node mode (ELECTRON_RUN_AS_NODE=1), so nothing new is installed, and it keeps nothing.
// Settings come from the environment the Claude app gives it: BOB_MCP_URL and BOB_MCP_KEY.
'use strict';
const http = require('node:http');
const readline = require('node:readline');

const URL_ = process.env.BOB_MCP_URL || 'http://127.0.0.1:7777/mcp';
const KEY = process.env.BOB_MCP_KEY || '';
let session = '';

function out(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function fail(msg, text) { if (msg && msg.id !== undefined && msg.id !== null) out({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: text } }); }

// Only http://127.0.0.1 or localhost: the key never leaves this computer.
function target() {
  const u = new URL(URL_);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new Error('Bob\'s address must be on this computer.');
  return u;
}

function send(msg) {
  return new Promise((resolve) => {
    let u;
    try { u = target(); } catch (e) { fail(msg, e.message); return resolve(); }
    const body = JSON.stringify(msg);
    const req = http.request({ hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || 80, path: u.pathname, method: 'POST', headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${KEY}`,
      'content-length': Buffer.byteLength(body), ...(session ? { 'mcp-session-id': session } : {})
    } }, (res) => {
      if (res.headers['mcp-session-id']) session = String(res.headers['mcp-session-id']);
      let buf = '';
      const sse = /text\/event-stream/.test(String(res.headers['content-type'] || ''));
      res.setEncoding('utf8');
      res.on('data', (c) => {
        buf += c;
        if (!sse) return;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
          if (data) { try { out(JSON.parse(data)); } catch {} }
        }
      });
      res.on('end', () => {
        if (!sse && buf.trim()) {
          try {
            const j = JSON.parse(buf);
            if (j && (j.jsonrpc || Array.isArray(j))) (Array.isArray(j) ? j : [j]).forEach(out);
            else fail(msg, (j && j.error) || `Bob answered ${res.statusCode}.`);
          } catch { fail(msg, `Bob answered ${res.statusCode}.`); }
        } else if (!sse && res.statusCode >= 400) fail(msg, `Bob answered ${res.statusCode}.`);
        resolve();
      });
    });
    req.on('error', () => { fail(msg, 'Bob isn\'t running on this computer right now. Open Bob, then try again.'); resolve(); });
    req.end(body);
  });
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  send(msg); // in parallel: a call waiting on Bob's card doesn't hold up the rest
});
rl.on('close', () => process.exit(0));
