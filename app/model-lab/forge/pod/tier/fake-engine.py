#!/usr/bin/env python3
# Tier sweep cloud dry run only (MOCK=1): a stand-in llama-server, so the whole run (Bob's own download plan, his
# engine start, the chats, the tool job, the long read, the logging and the report) can be checked without a card or a
# brain. Answers like llama-server: /health, /props, /slots, /tokenize, /detokenize and /v1/chat/completions (streamed
# or not, with llama-server's "timings"). A turn that offers tools gets one listing call first, then an answer.
import json, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

argv = sys.argv[1:]
if '--version' in argv:
    print('version: 12359 (mock0000)\nbuilt with mock for x86_64-linux-gnu'); sys.exit(0)
if '--help' in argv or '-h' in argv:
    print('usage: llama-server [options] (mock)'); sys.exit(0)
def opt(*names, default=None):
    for n in names:
        if n in argv and argv.index(n) + 1 < len(argv): return argv[argv.index(n) + 1]
    return default
port = int(opt('--port', default='8080')); ctx = int(opt('-c', '--ctx-size', default='4096') or 4096)
print(f'mock llama-server: -m {opt("-m", "--model")} ctx {ctx} port {port}', flush=True)
print('load_tensors: offloaded 99/99 layers to GPU', flush=True)

def timings(n_in, n_out):
    return {'prompt_n': n_in, 'prompt_ms': n_in / 2.0, 'prompt_per_second': 2000.0, 'predicted_n': n_out, 'predicted_ms': n_out * 10.0, 'predicted_per_second': 100.0}

class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *a): pass
    def _send(self, obj, code=200):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header('content-type', 'application/json'); self.send_header('content-length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/health': return self._send({'status': 'ok'})
        if p == '/props': return self._send({'build_info': 'b12359-mock0000', 'default_generation_settings': {'n_ctx': ctx}, 'total_slots': 1, 'model_path': opt('-m', '--model') or ''})
        if p == '/slots': return self._send([{'id': 0, 'n_ctx': ctx, 'is_processing': False}])
        return self._send({'data': [{'id': 'mock'}]})
    def do_POST(self):
        q = json.loads(self.rfile.read(int(self.headers.get('content-length', 0) or 0)) or b'{}')
        p = self.path.split('?')[0]
        if p == '/tokenize': return self._send({'tokens': list(range(max(1, len(str(q.get('content', ''))) // 4)))})
        if p == '/detokenize': return self._send({'content': 'word ' * len(q.get('tokens', []))})
        if p != '/v1/chat/completions': return self._send({})
        tools = [t['function']['name'] for t in q.get('tools') or []]
        msgs = q.get('messages', [])
        n_in = sum(len(json.dumps(m)) for m in msgs) // 4
        had_tool = any(m.get('role') == 'tool' for m in msgs)
        pick = next((t for t in tools if 'list' in t), tools[0] if tools else None)
        n_out = min(int(q.get('max_tokens') or 64), 400) if q.get('ignore_eos') else 20
        if tools and not had_tool and pick:
            msg = {'role': 'assistant', 'content': '', 'tool_calls': [{'id': 'c1', 'type': 'function', 'function': {'name': pick, 'arguments': json.dumps({'path': '.'})}}]}
        else:
            msg = {'role': 'assistant', 'content': ('Done. (mock answer) ' + 'word ' * max(0, n_out - 4)).strip()}
        if not q.get('stream'):
            return self._send({'choices': [{'index': 0, 'message': msg, 'finish_reason': 'tool_calls' if msg.get('tool_calls') else 'stop'}], 'usage': {'prompt_tokens': n_in, 'completion_tokens': n_out}, 'timings': timings(n_in, n_out)})
        self.send_response(200); self.send_header('content-type', 'text/event-stream'); self.send_header('connection', 'close'); self.end_headers()
        def ev(o): self.wfile.write(b'data: ' + json.dumps(o).encode() + b'\n\n'); self.wfile.flush()
        if msg.get('tool_calls'):
            tc = msg['tool_calls'][0]
            ev({'choices': [{'index': 0, 'delta': {'role': 'assistant', 'tool_calls': [{'index': 0, 'id': tc['id'], 'type': 'function', 'function': {'name': tc['function']['name'], 'arguments': tc['function']['arguments']}}]}}]})
            ev({'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'tool_calls'}], 'timings': timings(n_in, n_out)})
        else:
            for w in msg['content'].split(' '):
                ev({'choices': [{'index': 0, 'delta': {'content': w + ' '}}]}); time.sleep(0.002)
            ev({'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}], 'usage': {'prompt_tokens': n_in, 'completion_tokens': n_out}, 'timings': timings(n_in, n_out)})
        self.wfile.write(b'data: [DONE]\n\n'); self.wfile.flush(); self.close_connection = True

ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
