#!/usr/bin/env python3
"""FNRI on a rented card: the checks, the brain, and the scan. Called by aifeui.sh; standard library only.

  preflight  every dependency checked before anything is downloaded or built (exit 1 if any check fails)
  fetch      the brain file: "hf:<repo>:<path>" is downloaded, anything else is a file already here; prints its path
  wait       until Brain Engine has the brain loaded
  selftest   one word with the trace on: proves this engine build reports it
  scan       asks the plan's questions and writes the recording (format "bob-expert-recording", version 1)
"""
import argparse, json, os, shutil, subprocess, sys, time, urllib.request, urllib.error

FORMAT, VERSION = 'bob-expert-recording', 1
VIEWER_FILES = ['watch.html', 'watch.js', 'watch.css', 'watch-view.js', 'lab-watch-math.js', 'themes.js', 'style.css']
PATCH_FILES = ['0001-expert-mask.patch', '0002-expert-trace.patch']
UA = {'User-Agent': 'bob-forge/1.0'}


def post(url, body, timeout=600):
    r = urllib.request.Request(url, json.dumps(body).encode(), {'content-type': 'application/json'})
    return json.load(urllib.request.urlopen(r, timeout=timeout))


def hf_parts(spec):
    _, repo, path = spec.split(':', 2)
    return repo, path


def hf_headers():
    tok = os.environ.get('HF_TOKEN', '')
    return {**UA, **({'Authorization': 'Bearer ' + tok} if tok else {})}


def hf_size(spec):
    repo, path = hf_parts(spec)
    r = urllib.request.Request(f'https://huggingface.co/{repo}/resolve/main/{path}', method='HEAD', headers=hf_headers())
    res = urllib.request.urlopen(r, timeout=60)
    return int(res.headers.get('x-linked-size') or res.headers.get('content-length') or 0)


def read_plan(path):
    p = json.load(open(path))
    skills = [s for s in p.get('skills') or [] if s.get('id') and s.get('questions')]
    return p, skills


def preflight(a):
    checks = []

    def check(name, ok, note=''):
        checks.append({'check': name, 'ok': bool(ok), 'note': str(note)})
        print(f"[aifeui] {'ok  ' if ok else 'FAIL'} {name}{': ' + str(note) if note else ''}")

    plan, skills, brain = {}, [], ''
    try:
        plan, skills = read_plan(a.plan)
        brain = str(plan.get('brain') or '')
        check('the plan can be read', True)
    except Exception as e:  # noqa: BLE001
        check('the plan can be read', False, e)
    check('the plan names a brain', bool(brain))
    n_q = sum(len(s['questions']) for s in skills)
    check('the plan has questions to ask', n_q > 0, f'{len(skills)} skills, {n_q} questions')
    check('the plan pins the llama.cpp tag', bool(plan.get('llama_tag')) or bool(os.environ.get('AIFEUI_SERVER')), plan.get('llama_tag') or 'an engine is already here')
    for f in PATCH_FILES:
        p = os.path.join(a.patches, f)
        check(f"Bob's engine patch {f}", os.path.isfile(p) and os.path.getsize(p) > 200)
    tr = os.path.join(a.patches, '0002-expert-trace.patch')
    check('the trace patch really carries the trace', os.path.isfile(tr) and '"expert_trace"' in open(tr, errors='replace').read())
    for f in VIEWER_FILES:
        check(f"Bob's viewer: {f}", os.path.isfile(os.path.join(a.viewer, f)))
    prebuilt = os.environ.get('AIFEUI_SERVER', '')
    if prebuilt:
        check('the Brain Engine already here can be run', os.access(prebuilt, os.X_OK), prebuilt)
    else:
        for tool in ['git', 'tar']:
            check(f'tool: {tool}', shutil.which(tool))
        check('tool: cmake (or pip to get it)', shutil.which('cmake') or shutil.which('pip') or shutil.which('pip3'))
        check('tool: a C++ compiler', shutil.which('g++') or shutil.which('c++') or shutil.which('clang++'))
        tag = str(plan.get('llama_tag') or '')
        try:
            out = subprocess.run(['git', 'ls-remote', '--tags', 'https://github.com/ggml-org/llama.cpp', tag], capture_output=True, text=True, timeout=90).stdout
            check('the engine source can be reached, at the pinned tag', bool(tag) and ('refs/tags/' + tag) in out, tag)
        except Exception as e:  # noqa: BLE001
            check('the engine source can be reached, at the pinned tag', False, e)
    cpu_ok = os.environ.get('AIFEUI_ALLOW_CPU') == '1'
    vram = 0
    try:
        out = subprocess.run(['nvidia-smi', '--query-gpu=memory.total', '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=30).stdout
        vram = sum(int(x) for x in out.split() if x.strip().isdigit())
    except Exception:  # noqa: BLE001
        pass
    check('a graphics card is here', vram > 0 or cpu_ok, f'{vram} MB' if vram else 'none (allowed for a test)' if cpu_ok else 'nvidia-smi found no card')
    size = 0
    try:
        if brain.startswith('hf:'):
            size = hf_size(brain)
            check('the brain can be reached on Hugging Face', size > 0, f'{size / 1e9:.1f} GB')
        elif brain:
            path = brain if os.path.isabs(brain) else os.path.join(a.work, 'in', brain)
            size = os.path.getsize(path)
            check('the brain file is here', size > 0, f'{size / 1e9:.2f} GB')
    except Exception as e:  # noqa: BLE001
        check('the brain can be reached', False, e)
    if size:
        free = shutil.disk_usage(a.work).free
        need = (size if brain.startswith('hf:') else 0) + (0 if prebuilt else 4e9) + 1e9
        check('enough room on the disk', free >= need, f'{free / 1e9:.1f} GB free, {need / 1e9:.1f} GB needed')
        if vram:
            check('the brain fits the card', vram * 1e6 >= size * 1.1, f'{vram / 1000:.0f} GB card, {size / 1e9:.1f} GB brain')
    ok = all(c['ok'] for c in checks)
    json.dump({'ok': ok, 'checks': checks, 'at': int(time.time())}, open(a.out, 'w'), indent=1)
    print(f"[aifeui] {'every check passed' if ok else 'a check failed'} ({sum(c['ok'] for c in checks)} of {len(checks)})")
    return 0 if ok else 1


def fetch(a):
    plan, _ = read_plan(a.plan)
    brain = str(plan['brain'])
    if not brain.startswith('hf:'):
        print(brain if os.path.isabs(brain) else os.path.join(a.work, 'in', brain))
        return 0
    repo, path = hf_parts(brain)
    dest = os.path.join(a.work, 'aifeui-brain', os.path.basename(path))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    want = hf_size(brain)
    if not (os.path.isfile(dest) and os.path.getsize(dest) == want):
        r = urllib.request.Request(f'https://huggingface.co/{repo}/resolve/main/{path}', headers=hf_headers())
        with urllib.request.urlopen(r, timeout=120) as res, open(dest + '.part', 'wb') as f:
            shutil.copyfileobj(res, f, 16 << 20)
        if want and os.path.getsize(dest + '.part') != want:
            print('[aifeui] the download came up short', file=sys.stderr)
            return 1
        os.replace(dest + '.part', dest)
    print(dest)
    return 0


def wait(a):
    for _ in range(900):
        try:
            os.kill(a.pid, 0)
        except OSError:
            return 1
        try:
            if json.load(urllib.request.urlopen(a.url + '/health', timeout=5)).get('status') == 'ok':
                return 0
        except Exception:  # noqa: BLE001
            pass
        time.sleep(2)
    return 1


def ask(url, question, words, think):
    try:
        prompt = post(url + '/apply-template', {'messages': [{'role': 'user', 'content': question}], 'chat_template_kwargs': {'enable_thinking': bool(think)}}, 60)['prompt']
    except Exception:  # noqa: BLE001
        prompt = f'<|im_start|>user\n{question}<|im_end|>\n<|im_start|>assistant\n'
    j = post(url + '/completion', {'prompt': prompt, 'n_predict': words, 'temperature': 0, 'expert_trace': True, 'cache_prompt': False})
    tr = j.get('expert_trace')
    if not tr or not isinstance(tr.get('rows'), list):
        raise RuntimeError('the engine gave no trace for a question')
    return j, tr


def selftest(a):
    try:
        _, tr = ask(a.url, 'Hi', 1, False)
    except Exception as e:  # noqa: BLE001
        print(f'[aifeui] FAIL the trace: {e}')
        return 1
    print(f"[aifeui] ok   the trace works: {tr.get('kind', 'experts')}, {tr.get('n_expert')} in each of {tr.get('n_layer')} layers, {tr.get('n_expert_used')} for a word")
    return 0


def parts_of(gguf, gguf_py, layers, experts_kind):
    """How much of the brain is experts (or, for a plain brain, feed-forward neurons) and how much is the rest."""
    try:
        if gguf_py and os.path.isdir(gguf_py):
            sys.path.insert(0, gguf_py)
        from gguf import GGUFReader  # noqa: PLC0415
    except Exception:  # noqa: BLE001
        return None
    import re
    lay = [{'experts': 0, 'other': 0} for _ in range(layers)]
    kinds = {'attention': 0, 'router': 0, 'norms': 0, 'tables': 0, 'rest': 0}
    outside = 0
    for t in GGUFReader(gguf).tensors:
        n = 1
        for d in t.shape:
            n *= int(d)
        m = re.match(r'^blk\.(\d+)\.(.+)$', t.name)
        if m and int(m.group(1)) < layers:
            rest = m.group(2)
            router = 'ffn_gate_inp' in rest
            mine = re.match(r'^ffn_(up|gate|down)_exps', rest) if experts_kind == 'experts' else re.match(r'^ffn_(up|gate|down)\.weight$', rest)
            if not router and mine:
                lay[int(m.group(1))]['experts'] += n
                continue
            lay[int(m.group(1))]['other'] += n
            kinds['router' if router else 'norms' if 'norm' in rest else 'attention' if re.search(r'attn|ssm|conv', rest) else 'rest'] += n
        else:
            outside += n
            kinds['tables' if re.search(r'token_embd|^output\.weight$', t.name) else 'rest'] += n
    return {'layers': lay, 'outside': outside, 'kinds': kinds}


def scan(a):
    plan, skills = read_plan(a.plan)
    think = bool(plan.get('think'))
    words = int(plan.get('words') or (160 if think else 48))
    total = sum(len(s['questions']) for s in skills)
    clips, shape, done = [], None, 0
    for s in skills:
        for q in s['questions']:
            j, tr = ask(a.url, q, words, think)
            if shape is None:
                shape = {'kind': 'neurons' if tr.get('kind') == 'neurons' else 'experts', 'experts': int(tr['n_expert']), 'layers': int(tr['n_layer']), 'used': int(tr['n_expert_used']), 'neurons': int(tr.get('n_ff') or 0)}
            rows = tr['rows']
            e = [[[int(x) for x in (r['e'][l] if l < len(r['e']) else []) if 0 <= int(x) < shape['experts']] for l in range(shape['layers'])] for r in rows]
            answer = str(j.get('content') or '')
            if '</think>' in answer:
                answer = answer.split('</think>', 1)[1]
            clips.append({'skill': s['id'], 'question': q[:500], 'answer': answer.strip()[:4000], 'prompt': max(0, min(len(rows), int(tr.get('n_prompt') or 0))), 'words': [str(r.get('t') or '')[:80] for r in rows], 'e': e, 'last': str(tr.get('last') or '')[:80]})
            done += 1
            print(f"[aifeui] {s.get('label') or s['id']}: question {done} of {total}")
            try:
                json.dump({'state': 'scanning', 'note': f'question {done} of {total}', 'at': int(time.time())}, open(a.status, 'w'))
            except Exception:  # noqa: BLE001
                pass
    if not clips:
        print('[aifeui] nothing was recorded')
        return 1
    at = int(time.time() * 1000)
    name = str(plan.get('name') or os.path.basename(a.gguf))[:120]
    rec = {'format': FORMAT, 'version': VERSION, 'id': f'rec-rented-{at}', 'name': f"{name}, {len(skills)} skill{'' if len(skills) == 1 else 's'}, on a rented card", 'when': time.strftime('%Y-%m-%d', time.gmtime()), 'engine': 'Brain Engine',
           'brain': {'name': name, 'experts': shape['experts'], 'layers': shape['layers'], 'used': shape['used'], 'kind': shape['kind'], 'neurons': shape['neurons']},
           'skills': [{'id': s['id'], 'label': s.get('label') or s['id']} for s in skills], 'clips': clips, 'at': at, 'parts': parts_of(a.gguf, a.gguf_py, shape['layers'], shape['kind'])}
    json.dump(rec, open(a.out + '.part', 'w'))
    os.replace(a.out + '.part', a.out)
    print(f"[aifeui] recording written: {len(clips)} questions, {sum(len(c['e']) for c in clips)} words")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['preflight', 'fetch', 'wait', 'selftest', 'scan'])
    for k in ['plan', 'patches', 'viewer', 'work', 'out', 'url', 'gguf', 'gguf-py', 'status']:
        ap.add_argument('--' + k, default='')
    ap.add_argument('--pid', type=int, default=0)
    a = ap.parse_args()
    a.gguf_py = getattr(a, 'gguf_py', '')
    sys.exit({'preflight': preflight, 'fetch': fetch, 'wait': wait, 'selftest': selftest, 'scan': scan}[a.cmd](a))


if __name__ == '__main__':
    main()
