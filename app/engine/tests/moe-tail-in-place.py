#!/usr/bin/env python3
# Brain Engine 0076 test: in-place long reads (0069, on by default) take misses from the shelf (0049,
# LLAMA_MOE_CACHE_TAIL=1) on the card, as long reads did before 0069, instead of uploading them from RAM; read ahead
# (0071) leaves them to the lookup. The brain and the runs are moe-tail.py's (stand-in card, ggml-rpc-server).
# It checks that:
#   - long reads read in place and take experts from the shelf, with the words of a plain run
#   - the same with read ahead; with the CPU share of 0058 (whose long reads take the old path) the words of a plain run
#   - with in-place reads off, the shelf works as before, the same words
#   python3 engine/tests/moe-tail-in-place.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'moe-tail.py'), encoding='utf-8').read().replace('\r\n', '\n')
src = src[:src.index('\ntry:\n')].replace('usage: moe-tail.py', 'usage: moe-tail-in-place.py')
src = re.sub(r'RPORT = \d+', 'RPORT = 50351', src).replace('port=50252', 'port=50352')
# a cache of a few more slots than a layer has experts, so long reads read in place (0069 needs that)
src = src.replace("'--moe-cache-mib', '24'", "'--moe-cache-mib', '28'")
exec(compile(src, 'moe-tail.py', 'exec'))
def ipl(err):
    m = re.findall(r'in-place long reads: (\d+) reads, (\d+) experts read where they sit, (\d+) uploaded', err)
    return tuple(int(x) for x in m[-1]) if m else (0, 0, 0)
def shelf_ip(err):
    m = re.findall(r'(\d+) read from it by large batches \((\d+) by in-place long reads\)', err)
    return (int(m[-1][0]), int(m[-1][1])) if m else (0, 0)
T = {'LLAMA_MOE_CACHE_TAIL': '1', 'LLAMA_MOE_CACHE_TAIL_KEEP': '512', 'LLAMA_MOE_CACHE_TAIL_STEP': '512'}
OFF = {'LLAMA_MOE_CACHE_READ_IN_PLACE': '0'}
ok = lambda w: len(w) == 2 and not any(x.startswith('ERROR') for x in w)
try:
    plain, _ = serve('plain', {})
    check('a plain run answers', ok(plain), f'{plain}')
    on, err = serve('tail-in-place', T)
    n, sh = ipl(err), shelf_ip(err)
    check('long reads read in place and take experts from the shelf on the card', n[0] > 0 and sh[1] > 0, f'{n} {sh} ' + err[-400:])
    check('the words of a plain run', on == plain and ok(on), f'{on == plain}')
    ra, rerr = serve('tail-read-ahead', {**T, 'LLAMA_MOE_CACHE_READ_AHEAD': '1'})
    check('with read ahead (0071): from the shelf too, the same words', shelf_ip(rerr)[1] > 0 and ra == plain, f'{shelf_ip(rerr)} {ra == plain}')
    sp, _ = serve('plain-share', {}, share='0.5')
    ss, serr = serve('tail-share', T, share='0.5')
    # with a share the long reads have a processor part, which 0069 leaves to the old path, so only the words
    check('with a CPU share: the shelf on, the words of a plain run with that share', 'the shelf:' in serr and ss == sp and ok(ss), f'{shelf_ip(serr)} {ss == sp}')
    of, oerr = serve('tail-no-in-place', {**T, **OFF})
    check('in-place reads off: the shelf as before, none by in-place reads, the same words', 'the shelf:' in oerr and shelf_ip(oerr)[1] == 0 and of == plain, f'{shelf_ip(oerr)} {of == plain}')
    print(f'info: in-place reads {n}, shelf reads (all, in place) {sh}; read ahead {shelf_ip(rerr)}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
