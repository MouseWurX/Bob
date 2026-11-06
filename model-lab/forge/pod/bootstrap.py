# Tiny door into the pod: upload inputs, start the run, watch it, download the results. Needs FORGE_TOKEN.
import http.server, json, os, subprocess, sys, threading, time, urllib.parse
ROOT = os.environ.get("FORGE_ROOT", "/workspace"); IN = f"{ROOT}/in"; OUT = f"{ROOT}/out"
os.makedirs(IN, exist_ok=True); os.makedirs(OUT, exist_ok=True)
TOKEN = os.environ.get("FORGE_TOKEN", ""); T0 = time.time(); RUN = {"p": None}
class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def ok(self, code=200, body=b"", ctype="application/json", extra=None):
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(body)
    def auth(self):
        if TOKEN and self.headers.get("X-Forge-Token") != TOKEN: self.ok(403, b'{"error":"no"}'); return False
        return True
    def safe(self, base, rel):
        p = os.path.normpath(os.path.join(base, urllib.parse.unquote(rel)))
        return p if p.startswith(base + "/") else None
    def do_GET(self):
        if not self.auth(): return
        u = urllib.parse.urlparse(self.path)
        if u.path == "/status":
            st = {}
            try: st = json.load(open(f"{OUT}/status.json"))
            except Exception: pass
            log = ""
            try: log = subprocess.run(["tail", "-n", "40", f"{OUT}/log.txt"], capture_output=True, text=True).stdout
            except Exception: pass
            alive = RUN["p"] is not None and RUN["p"].poll() is None
            files = []
            for d, _, fs in os.walk(OUT):
                for f in fs:
                    p = os.path.join(d, f); files.append({"path": os.path.relpath(p, OUT), "bytes": os.path.getsize(p)})
            self.ok(200, json.dumps({"up_s": int(time.time() - T0), "running": alive, "exit": None if alive or RUN["p"] is None else RUN["p"].returncode, "status": st, "log": log, "files": files}).encode()); return
        if u.path.startswith("/out/"):
            p = self.safe(OUT, u.path[5:])
            if not p or not os.path.isfile(p): self.ok(404, b'{"error":"missing"}'); return
            size = os.path.getsize(p); start = 0; end = size - 1
            rng = self.headers.get("Range")
            if rng and rng.startswith("bytes="):
                a, b = rng[6:].split("-"); start = int(a or 0); end = int(b) if b else end
            self.send_response(206 if rng else 200); self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(end - start + 1)); self.send_header("Accept-Ranges", "bytes")
            if rng: self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            with open(p, "rb") as f:
                f.seek(start); left = end - start + 1
                while left > 0:
                    chunk = f.read(min(left, 1 << 22))
                    if not chunk: break
                    self.wfile.write(chunk); left -= len(chunk)
            return
        self.ok(404, b'{"error":"what"}')
    def do_PUT(self):
        if not self.auth(): return
        p = self.safe(IN, self.path[4:]) if self.path.startswith("/in/") else None
        if not p: self.ok(400, b'{"error":"put to /in/<name>"}'); return
        n = int(self.headers.get("Content-Length", "0")); os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            left = n
            while left > 0:
                chunk = self.rfile.read(min(left, 1 << 22))
                if not chunk: break
                f.write(chunk); left -= len(chunk)
        self.ok(200, json.dumps({"saved": os.path.relpath(p, IN), "bytes": os.path.getsize(p)}).encode())
    def do_POST(self):
        if not self.auth(): return
        if self.path == "/go":
            if RUN["p"] is not None and RUN["p"].poll() is None: self.ok(200, b'{"already":true}'); return
            subprocess.run(["bash", "-c", f"cd {IN} && (tar xzf forge.tgz --no-same-owner || true)"])
            log = open(f"{OUT}/log.txt", "ab")
            RUN["p"] = subprocess.Popen(["bash", f"{IN}/pod/run.sh"], cwd=IN, stdout=log, stderr=subprocess.STDOUT, env={**os.environ, "PYTHONUNBUFFERED": "1"})
            self.ok(200, b'{"started":true}'); return
        if self.path == "/stop":
            if RUN["p"] is not None and RUN["p"].poll() is None: subprocess.run(["pkill", "-TERM", "-P", str(RUN["p"].pid)]); RUN["p"].terminate()
            self.ok(200, b'{"stopped":true}'); return
        self.ok(404, b'{"error":"what"}')
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("FORGE_PORT", "8000"))), H).serve_forever()
