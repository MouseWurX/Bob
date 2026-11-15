# A pretend Wi-Fi for SCUT tests: wifi.py LISTEN SERVER PROFILE [SECONDS]. Packets keep their order (a late one holds
# the ones behind it, like a radio retrying), each way on its own.
import socket, select, random, sys, time, heapq
listen, server, prof = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
import json, os
P = dict(good=dict(base=1.5, jit=0.3, late=0, loss=0), typical=dict(base=3, jit=1, late=0.005, loss=0.01), poor=dict(base=5, jit=2, late=0.01, loss=0.03),
         weak6=dict(base=2.5, jit=6, late=0.03, loss=0.015), bursty=dict(base=3, jit=1, late=0.005, loss=0.0, burst=0.004)).get(prof) or json.loads(prof)
random.seed(int(os.environ.get('SEED', 5)))
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.bind(('127.0.0.1', listen))
up = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); up.bind(('127.0.0.1', 0))
for k in (s, up): k.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 8 << 20)
client = None; q = []; n = 0; last = [0.0, 0.0]; burst = [0, 0]; st = dict(fwd=0, drop=0)
end = time.time() + float(sys.argv[4] if len(sys.argv) > 4 else 120)
while time.time() < end:
    now = time.time()
    while q and q[0][0] <= now:
        _, _, d, way = heapq.heappop(q); (up.sendto(d, ('127.0.0.1', server)) if way == 0 else (client and s.sendto(d, client))); st['fwd'] += 1
    r, _, _ = select.select([s, up], [], [], max(0, min(0.0005, q[0][0] - now)) if q else 0.2)
    now = time.time()
    for sock in r:
        for _ in range(64):
            try: d, a = sock.recvfrom(65536, socket.MSG_DONTWAIT)
            except BlockingIOError: break
            way = 0 if sock is s else 1
            if way == 0: client = a
            if burst[way] > 0: burst[way] -= 1; st['drop'] += 1; continue
            if P.get('burst') and random.random() < P['burst']: burst[way] = random.randrange(3, 9)
            if random.random() < P['loss']: st['drop'] += 1; continue
            delay = P['base'] + random.expovariate(1 / P['jit']) + (random.uniform(40, 100) if random.random() < P['late'] else 0)
            at = max(last[way], now + delay / 1000); last[way] = at; n += 1
            heapq.heappush(q, (at, n, d, way))
print('wifi', prof, st, flush=True)
