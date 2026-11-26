#!/usr/bin/env python3
# Tier sweep (Forge build 23), TEST ONLY, never part of Bob: a stand-in for nvidia-smi on a rented pod, so Bob sees a
# smaller card than the pod has (an 8 or 12 GB card simulated on a 24 GB one). It runs the real nvidia-smi and changes
# only the memory figures:
#   memory.total -> SIM_MIB (the simulated card)
#   memory.used  -> real used minus what the ballast holds (ballast.py writes that to BALLAST_FILE)
#   memory.free  -> real free (the ballast already holds the rest of the card, so this is what is really left)
# --query-compute-apps leaves the ballast's own line out. Every other call goes through unchanged, and is noted in
# SHIM_LOG so the run shows whether Bob asked for anything the shim does not change.
# Env: NVSMI_REAL (the real nvidia-smi), SIM_MIB, BALLAST_FILE (JSON {pid, held_mib}), SHIM_LOG (optional).
import json, os, subprocess, sys

REAL = os.environ.get('NVSMI_REAL', '/usr/bin/nvidia-smi')
args = sys.argv[1:]

def note(msg):
    p = os.environ.get('SHIM_LOG')
    if p:
        try:
            with open(p, 'a') as f: f.write(msg + '\n')
        except OSError: pass

def ballast():
    try:
        with open(os.environ.get('BALLAST_FILE', '')) as f: b = json.load(f)
        return int(b.get('pid') or 0), float(b.get('held_mib') or 0)
    except Exception: return 0, 0.0

def num(cell):
    # "24564", "24564 MiB" or "[N/A]" -> (value, unit suffix) or (None, '')
    s = cell.strip(); parts = s.split()
    try: return float(parts[0]), (' ' + parts[1] if len(parts) > 1 else '')
    except (ValueError, IndexError): return None, ''

def fmt(v, unit): return f"{int(round(v))}{unit}"

def rewrite(out, fields, sim, held):
    lines = []
    for line in out.splitlines():
        cells = line.split(',')
        if len(cells) != len(fields): lines.append(line); continue
        for i, f in enumerate(fields):
            v, unit = num(cells[i])
            if v is None: continue
            if f == 'memory.total': cells[i] = ' ' * (i > 0) + fmt(sim, unit)
            elif f == 'memory.used': cells[i] = ' ' * (i > 0) + fmt(max(0.0, v - held), unit)
        lines.append(','.join(cells))
    return '\n'.join(lines) + ('\n' if out.endswith('\n') else '')

def main():
    r = subprocess.run([REAL] + args, capture_output=True, text=True)
    out = r.stdout
    sim = float(os.environ.get('SIM_MIB') or 0)
    q = next((a for a in args if a.startswith('--query-gpu=')), None)
    qa = next((a for a in args if a.startswith('--query-compute-apps=')), None)
    if r.returncode == 0 and sim > 0 and q:
        pid, held = ballast()
        out = rewrite(out, [f.strip() for f in q.split('=', 1)[1].split(',')], sim, held)
    elif r.returncode == 0 and qa:
        pid, _ = ballast()
        fields = [f.strip() for f in qa.split('=', 1)[1].split(',')]
        if pid and 'pid' in fields:
            k = fields.index('pid')
            out = ''.join(l + '\n' for l in out.splitlines() if not (len(l.split(',')) > k and l.split(',')[k].strip() == str(pid)))
    elif sim > 0:
        note('passed through unchanged: nvidia-smi ' + ' '.join(args))
    sys.stdout.write(out); sys.stderr.write(r.stderr)
    sys.exit(r.returncode)

if __name__ == '__main__': main()
