#!/usr/bin/env python3
"""Quick tool-call check for squeezed and healed GGUF files, on the held-apart tool tasks of agent_sessions.py.

  tool_check.py --sessions sessions.jsonl --teacher <HF dir (tokenizer only)> --llama-bin <dir> --ref <BF16.gguf>
                --file NAME=path.gguf [--file ...] [--n 40] [--ngl 99] --out tool-check.json

Each file answers the same eval-split tool tasks (hermes-singleturn: a tool list and a request) greedily, thinking off.
Scored: a well-formed call (<tool_call> holding JSON with a name and arguments), a name from the task's own tool list,
and the same call as the full-size (BF16) file. A drift check on public tasks, not Bob's held-out jobs; those are the
real test and are run separately. Writes nothing but the report.
"""
import argparse, json, os, re, subprocess, sys, tempfile

CALL = re.compile(r'<tool_call>\s*(.*?)\s*(?:</tool_call>|$)', re.S)


def tool_names(system_text):
    m = re.search(r'<tools>(.*?)</tools>', system_text, re.S)
    if not m: return set()
    names = set(re.findall(r'"name"\s*:\s*"([^"]+)"', m.group(1)))
    return names


def parse_call(text):
    m = CALL.search(text)
    if not m: return None
    try:
        j = json.loads(m.group(1))
    except ValueError:
        return None
    if not isinstance(j, dict) or 'name' not in j: return None
    return {'name': j['name'], 'arguments': j.get('arguments', {})}


def answer(bin_dir, gguf, prompt, ngl, n_new):
    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8') as f:
        f.write(prompt); pf = f.name
    try:
        cmd = [os.path.join(bin_dir, 'llama-completion'), '-m', gguf, '-f', pf, '-n', str(n_new), '--temp', '0',
               '-no-cnv', '--no-display-prompt', '-c', '4096']
        if ngl: cmd += ['-ngl', str(ngl)]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        return r.stdout
    finally:
        os.unlink(pf)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--sessions', required=True); ap.add_argument('--teacher', required=True)
    ap.add_argument('--llama-bin', required=True); ap.add_argument('--ref', required=True)
    ap.add_argument('--file', action='append', default=[], help='NAME=path.gguf')
    ap.add_argument('--n', type=int, default=40); ap.add_argument('--ngl', type=int, default=0)
    ap.add_argument('--new', type=int, default=256); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained(a.teacher)
    tasks = []
    for line in open(a.sessions, encoding='utf-8'):
        r = json.loads(line)
        if r.get('split') == 'eval' and r.get('source') == 'hermes-singleturn': tasks.append(r['messages'])
    tasks = tasks[:a.n]
    if not tasks: sys.exit('no eval-split tool tasks in the sessions file')

    def render(msgs):
        try:
            return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)
        except TypeError:
            return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)

    prompts = [render(m) for m in tasks]
    allowed = [tool_names(next((x['content'] for x in m if x['role'] == 'system'), '')) for m in tasks]
    ref = [parse_call(answer(a.llama_bin, a.ref, p, a.ngl, a.new)) for p in prompts]
    rep = {'tasks': len(tasks), 'ref_calls': sum(c is not None for c in ref), 'files': {}}
    for spec in a.file:
        name, path = spec.split('=', 1)
        ok = known = same = 0
        for p, al, rc in zip(prompts, allowed, ref):
            c = parse_call(answer(a.llama_bin, path, p, a.ngl, a.new))
            if c is None: continue
            ok += 1; known += c['name'] in al; same += rc is not None and c == rc
        rep['files'][name] = {'well_formed': ok, 'known_tool': known, 'same_call_as_full_size': same}
        print(name, rep['files'][name], flush=True)
    json.dump(rep, open(a.out, 'w'), indent=1)
    print(json.dumps(rep))


if __name__ == '__main__':
    main()
