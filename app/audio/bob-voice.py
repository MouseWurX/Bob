# Bob's extra voices, run inside Bob's own Python (audio tools folder). One process stays up while Bob talks,
# so the voice model loads once instead of once per sentence. src/tts.js stops it after a quiet spell.
#   Kokoro-82M (Apache-2.0): small, runs on the processor, via kokoro-onnx.
#   Chatterbox (MIT, Resemble AI): runs on the graphics card, can copy a voice from a short recording.
# Protocol: one JSON job per line on stdin -> "OK <id>" or "ERR <id> <message>" on stdout.
import json, sys, traceback

loaded = {}

def kokoro(job):
    from kokoro_onnx import Kokoro
    import soundfile as sf
    key = ("kokoro", job["model"], job["voices"])
    if key not in loaded:
        loaded[key] = Kokoro(job["model"], job["voices"])
    samples, rate = loaded[key].create(job["text"], voice=job.get("voice") or "am_michael", speed=float(job.get("speed") or 1.0), lang=job.get("lang") or "en-us")
    sf.write(job["out"], samples, rate)

def chatterbox(job):
    import torch, torchaudio
    from chatterbox.tts import ChatterboxTTS
    if "chatterbox" not in loaded:
        loaded["chatterbox"] = ChatterboxTTS.from_pretrained(device="cuda" if torch.cuda.is_available() else "cpu")
    model = loaded["chatterbox"]
    ref = job.get("ref") or None
    wav = model.generate(job["text"], audio_prompt_path=ref, exaggeration=float(job.get("exaggeration") or 0.5))
    torchaudio.save(job["out"], wav, model.sr)

ENGINES = {"kokoro": kokoro, "chatterbox": chatterbox}

def main():
    print("READY", flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        job = {}
        try:
            job = json.loads(line)
            ENGINES[job["engine"]](job)
            print(f"OK {job['id']}", flush=True)
        except Exception as e:  # report and keep serving
            msg = " ".join(str(e).split())[:300] or type(e).__name__
            print(f"ERR {job.get('id', '?')} {msg}", flush=True)
            traceback.print_exc(file=sys.stderr)

if __name__ == "__main__":
    main()
