#!/usr/bin/env python3
# Tier sweep cloud dry run only (MOCK=1): a made-up "real" nvidia-smi for a pod that has no card, so the shim, Bob's
# card check and the 1-second card log can be checked. FAKE_CARD="NVIDIA RTX A5000,24564" (name, MiB);
# FAKE_USED_FILE holds the MiB in use (the dry run's stand-in ballast writes it). Knows only the queries Bob and the
# tier runner make.
import os, sys
name, total = (os.environ.get('FAKE_CARD') or 'NVIDIA RTX A5000,24564').split(',')
total = int(total)
try: used = int(float(open(os.environ.get('FAKE_USED_FILE', '/nonexistent')).read().strip() or 0))
except Exception: used = 0
vals = {'name': name, 'memory.total': total, 'memory.used': used, 'memory.free': total - used, 'temperature.gpu': 38, 'clocks.sm': 1695,
        'clocks.mem': 7600, 'power.draw': 61.5, 'utilization.gpu': 0, 'driver_version': '570.00', 'compute_cap': '8.6', 'pstate': 'P8', 'clocks_event_reasons.active': '0x0000000000000001'}
args = sys.argv[1:]
units = 'nounits' not in ','.join(a for a in args if a.startswith('--format'))
q = next((a for a in args if a.startswith('--query-gpu=')), None)
if q:
    cells = []
    for f in q.split('=', 1)[1].split(','):
        v = vals.get(f.strip(), '[N/A]')
        if units and f.strip().startswith('memory.') : v = f'{v} MiB'
        cells.append(str(v))
    print(', '.join(cells)); sys.exit(0)
if any(a.startswith('--query-compute-apps=') for a in args):
    pid = os.environ.get('FAKE_BALLAST_PID')
    if pid and used: print(f'{pid}, python3, {used}')
    sys.exit(0)
print(f'mock nvidia-smi: {name} {used}MiB / {total}MiB')
