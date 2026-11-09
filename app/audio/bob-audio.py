# Bob's audio workshop: sound effects (AudioLDM 2), run inside Bob's private Python. Music uses ACE-Step 1.5's own server (src/audio.js).
# Called by src/audio.js with one JSON job on stdin. Prints "PROGRESS n/total" lines and finally "DONE <path>".
# Nothing here talks to the network except Hugging Face, the first time a model's weights are fetched
# (into HF_HOME, which Bob points at his own models folder).
import json, os, sys, threading, time

def say(line):
    print(line, flush=True)

def heartbeat(total_s, stop):
    # Neither library reports steps in a way we can read, so estimate from the expected time.
    t0 = time.time()
    while not stop.is_set():
        n = min(99, int(100 * (time.time() - t0) / max(1, total_s)))
        say(f"PROGRESS {n}/100")
        stop.wait(1.0)

def sfx(job):
    import torch, scipy.io.wavfile
    from diffusers import AudioLDM2Pipeline
    pipe = AudioLDM2Pipeline.from_pretrained("cvssp/audioldm2", torch_dtype=torch.float16).to("cuda" if torch.cuda.is_available() else "cpu")
    audio = pipe(job["prompt"], negative_prompt="low quality, noise", num_inference_steps=int(job.get("steps") or 100),
                 audio_length_in_s=float(job.get("seconds") or 5)).audios[0]
    scipy.io.wavfile.write(job["out"], rate=16000, data=audio)

def main():
    job = json.loads(sys.stdin.read())
    stop = threading.Event()
    expect = 30
    threading.Thread(target=heartbeat, args=(expect, stop), daemon=True).start()
    try:
        sfx(job)
    finally:
        stop.set()
    out = job["out"]
    if not os.path.exists(out):
        folder, base = os.path.split(out)
        stem = os.path.splitext(base)[0]
        hits = sorted((f for f in os.listdir(folder) if f.startswith(stem)), key=lambda f: os.path.getmtime(os.path.join(folder, f)))
        if hits:
            out = os.path.join(folder, hits[-1])
    say("PROGRESS 100/100")
    say(f"DONE {out}")

if __name__ == "__main__":
    main()
