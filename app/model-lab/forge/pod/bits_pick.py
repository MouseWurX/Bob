#!/usr/bin/env python3
"""Shared parts of bits by part (part_bits.py) and bits by word (word_bands.py): ladders, the exact-size pick, bands.

A "part" is anything that gets its own stock type: a whole tensor, or one band of the output head. Each part has a
ladder of options [{'type', 'bytes', 'err'}], where err is the estimated loss (drift) the part adds at that type.
pick() spends a byte budget so the summed err is as low as it can get, knapsack-style:
  1. every part starts at its smallest option;
  2. the lower convex hull of each ladder is walked by the best err drop per extra byte (the Lagrangian path; it is
     optimal at every hull point, where plain greedy on a bumpy ladder can stall);
  3. what room is left is filled by the best single moves that still fit (any option, not only hull points);
  4. swaps (one part down, another up) while they lower the total, up to max_swaps rounds.
It is never over budget; it is not a proven optimum (that needs a full knapsack), but it lands close (the Node test
checks it against brute force).
"""
import numpy as np


def clean_ladder(opts):
    """Sort by bytes, keep only options that are bigger AND better than every smaller one."""
    best = {}
    for o in opts:
        if o['type'] not in best or o['err'] < best[o['type']]['err']: best[o['type']] = o
    ladder = sorted(best.values(), key=lambda o: (o['bytes'], o['err']))
    out = [ladder[0]]
    for o in ladder[1:]:
        if o['bytes'] > out[-1]['bytes'] and o['err'] < out[-1]['err']: out.append(o)
    return out


def hull(ladder):
    """Indexes of the lower convex hull of a clean ladder (err falls ever more slowly per byte)."""
    h = [0]
    for i in range(1, len(ladder)):
        while len(h) >= 2:
            a, b = ladder[h[-2]], ladder[h[-1]]; c = ladder[i]
            # b is not on the hull if the slope a->c is at least as steep as a->b
            if (a['err'] - c['err']) * (b['bytes'] - a['bytes']) >= (a['err'] - b['err']) * (c['bytes'] - a['bytes']): h.pop()
            else: break
        h.append(i)
    return h


def pick(parts, budget, max_swaps=50):
    """parts: [{'name', 'ladder': clean ladder, 'fixed': index or None}]. Sets part['pick']. Returns bytes used."""
    for p in parts: p['pick'] = p['fixed'] if p.get('fixed') is not None else 0
    used = sum(p['ladder'][p['pick']]['bytes'] for p in parts)
    if used > budget: return used
    free = [p for p in parts if p.get('fixed') is None]
    hulls = {id(p): hull(p['ladder']) for p in free}
    pos = {id(p): 0 for p in free}
    # hull walk: one heap would be faster, but parts number in the thousands at most
    while True:
        best, best_gain = None, 0.0
        for p in free:
            h = hulls[id(p)]; k = pos[id(p)]
            if k + 1 >= len(h): continue
            cur, nxt = p['ladder'][h[k]], p['ladder'][h[k + 1]]
            extra = nxt['bytes'] - cur['bytes']
            if used + extra > budget: continue
            gain = (cur['err'] - nxt['err']) / extra
            if gain > best_gain: best, best_gain = p, gain
        if best is None: break
        k = pos[id(best)]; h = hulls[id(best)]
        used += best['ladder'][h[k + 1]]['bytes'] - best['ladder'][h[k]]['bytes']
        pos[id(best)] = k + 1; best['pick'] = h[k + 1]
    # fill: best err drop that still fits, any option above the current one
    while True:
        best, best_to, best_drop = None, None, 0.0
        for p in free:
            cur = p['ladder'][p['pick']]
            for j in range(p['pick'] + 1, len(p['ladder'])):
                o = p['ladder'][j]
                if used + o['bytes'] - cur['bytes'] > budget: break
                drop = cur['err'] - o['err']
                if drop > best_drop: best, best_to, best_drop = p, j, drop
        if best is None: break
        used += best['ladder'][best_to]['bytes'] - best['ladder'][best['pick']]['bytes']; best['pick'] = best_to
    # swaps: one part down, another up, when that still fits and lowers the total (a few rounds at most)
    for _ in range(max_swaps):
        down = [(p, j) for p in free for j in range(p['pick'])]
        best, best_drop = None, 1e-12 * (1 + sum(p['ladder'][p['pick']]['err'] for p in free))
        for p, j in down:
            freed = p['ladder'][p['pick']]['bytes'] - p['ladder'][j]['bytes']
            cost = p['ladder'][j]['err'] - p['ladder'][p['pick']]['err']
            for q in free:
                if q is p: continue
                cq = q['ladder'][q['pick']]
                for k in range(q['pick'] + 1, len(q['ladder'])):
                    o = q['ladder'][k]
                    if used - freed + o['bytes'] - cq['bytes'] > budget: break
                    drop = cq['err'] - o['err'] - cost
                    if drop > best_drop: best, best_drop = (p, j, q, k), drop
        if best is None: break
        p, j, q, k = best
        used += p['ladder'][j]['bytes'] - p['ladder'][p['pick']]['bytes'] + q['ladder'][k]['bytes'] - q['ladder'][q['pick']]['bytes']
        p['pick'], q['pick'] = j, k
    return used


def band_edges(n_rows, n_bands, first=64):
    """Row counts of the bands, smallest first: log-spaced edges from `first` rows to all of them (16 bands as NariQ)."""
    n_bands = max(1, min(n_bands, 32))
    if n_bands == 1 or n_rows <= first: return [n_rows]
    e = np.unique(np.round(first * (n_rows / first) ** (np.arange(n_bands) / (n_bands - 1))).astype(np.int64))
    e[-1] = n_rows
    sizes = np.diff(np.concatenate([[0], e]))
    return [int(s) for s in sizes if s > 0]


def split_bands(importance, n_bands, first=64):
    """Rows (token ids) sorted by importance, most important first, cut into bands. Returns [np.array of row ids]."""
    order = np.argsort(-np.asarray(importance, dtype=np.float64), kind='stable')
    out, at = [], 0
    for s in band_edges(len(order), n_bands, first):
        out.append(np.sort(order[at:at + s])); at += s
    return out


