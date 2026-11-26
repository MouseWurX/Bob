#!/usr/bin/env python3
# Tier sweep (Forge build 23), TEST ONLY, never part of Bob: card ballast. Holds graphics memory so that only SIM_MIB
# of the real card is left for Bob and his engine (an 8 or 12 GB card simulated on a 24 GB one). Uses the driver's own
# library (libcuda, through ctypes), so it needs no nvcc, PyTorch or CUDA toolkit.
#   python3 ballast.py <sim_mib> <out.json>
# It allocates in 64 MiB pieces until the card's free memory is at most sim_mib minus what other programs already used
# when it started, writes {pid, held_mib, free_mib, total_mib} to out.json, and then sleeps until it is killed.
# held_mib counts everything this process takes (its CUDA context too), which is what nvsmi-shim.py takes off "used".
import ctypes, json, os, sys, time

sim_mib, out = float(sys.argv[1]), sys.argv[2]
MiB = 1024 * 1024
cu = ctypes.CDLL('libcuda.so.1')
def ok(r, what):
    if r != 0: sys.exit(f'ballast: {what} failed (CUDA error {r})')
ok(cu.cuInit(0), 'cuInit')
dev = ctypes.c_int(); ok(cu.cuDeviceGet(ctypes.byref(dev), 0), 'cuDeviceGet')
ctx = ctypes.c_void_p(); ok(cu.cuCtxCreate_v2(ctypes.byref(ctx), 0, dev), 'cuCtxCreate')
free, total = ctypes.c_size_t(), ctypes.c_size_t()
def info():
    ok(cu.cuMemGetInfo_v2(ctypes.byref(free), ctypes.byref(total)), 'cuMemGetInfo')
    return free.value / MiB, total.value / MiB
f0, tot = info()
other = float(os.environ.get('OTHER_USED_MIB', '0'))  # what was in use on the card before this process started
target_free = sim_mib - other
if target_free >= f0: sys.exit(f'ballast: the card has {f0:.0f} MiB free, not more than the {sim_mib:.0f} MiB to leave')
bufs, step = [], 64 * MiB
while True:
    f, _ = info()
    if f <= target_free + 1: break
    want = min(step, int((f - target_free) * MiB))
    if want < MiB: break
    p = ctypes.c_void_p()
    if cu.cuMemAlloc_v2(ctypes.byref(p), ctypes.c_size_t(want)) != 0:
        if step > MiB: step //= 2; continue
        break
    bufs.append(p)
f, tot = info()
held = tot - f - other
json.dump({'pid': os.getpid(), 'held_mib': round(held), 'free_mib': round(f), 'total_mib': round(tot), 'sim_mib': sim_mib, 'other_mib': other}, open(out + '.tmp', 'w'))
os.replace(out + '.tmp', out)
print(f'ballast: holding {held:.0f} MiB of {tot:.0f} MiB, {f:.0f} MiB left free (simulated card {sim_mib:.0f} MiB)', flush=True)
while True: time.sleep(3600)
