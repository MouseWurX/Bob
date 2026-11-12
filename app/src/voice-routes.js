// Voice in Bob's API: turn a recording into words, read a reply aloud, and the voice samples in Settings.
// Split out of server.js; same rules as before.
// Returns false when the request is not one of these, so server.js keeps looking; anything else means it was answered.
import fs from 'node:fs';
import path from 'node:path';
import { transcribe } from './stt.js';
import { netVoiceFor, say } from './tts.js';
import { clearSamples, publicView, sampleFor, voiceList } from './voice-samples.js';
import { talkView, withFallback, xaiHear, xaiSay, cleanCloud, cleanCloudVoice, XAI_KEY } from './talk.js';
import { saveKey } from './secret-box.js';
import { saveSettings } from './config.js';

export async function voiceRoute({ req, res, p, isLocal, cfg, shop, body, send, TYPES }) {
  if (req.method === 'POST' && p === '/api/transcribe') {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 15e6) return send(res, 413, { error: 'Recording too long.' }); chunks.push(c); }
    try { return send(res, 200, { text: await transcribe(cfg, Buffer.concat(chunks)) }); }
    catch (e) { return send(res, 502, { error: e.message }); }
  }
  if (req.method === 'POST' && p === '/api/speak') {
    const { text, bob } = await body(req); // bob: the Bob-Net name of the Bob who thought this reply (A voice per Bob)
    try { return send(res, 200, await say(cfg, String(text || ''), { voice: netVoiceFor(cfg, bob) }), 'audio/wav'); }
    catch (e) { return send(res, 409, { error: e.message }); }
  }
  // Talk with Bob (src/talk.js, public/talk.js): its switches, and one hearing or one saying for the talk. Off
  // unless turned on; with xAI picked and a key saved, xAI hears and speaks, and Bob's own takes over if it fails.
  if (p === '/api/talk' && req.method === 'GET') return send(res, 200, talkView(cfg));
  if (p === '/api/talk' && req.method === 'POST') {
    const b = await body(req);
    if (typeof b.talkWithBob === 'boolean') saveSettings(cfg, { talkWithBob: b.talkWithBob });
    if (typeof b.talkCloud === 'string') saveSettings(cfg, { talkCloud: cleanCloud(b.talkCloud) });
    if (typeof b.talkCloudVoice === 'string') saveSettings(cfg, { talkCloudVoice: cleanCloudVoice(b.talkCloudVoice) });
    if (typeof b.xaiKey === 'string' || b.forgetXaiKey === true) {
      if (!isLocal) return send(res, 403, { error: 'The xAI key can only be saved on this replicant matrix itself.' });
      try { saveKey(cfg, XAI_KEY, b.forgetXaiKey === true ? '' : b.xaiKey.trim()); }
      catch (e) { return send(res, 409, { error: e.code === 'BOX_STUCK' ? e.message : 'Couldn\'t save the key.' }); }
    }
    return send(res, 200, talkView(cfg));
  }
  if (req.method === 'POST' && p === '/api/talk/hear') {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 15e6) return send(res, 413, { error: 'Recording too long.' }); chunks.push(c); }
    const wav = Buffer.concat(chunks);
    try {
      const r = await withFallback(cfg, { cloud: (key) => xaiHear(wav, { key, language: cfg.language || 'en' }), own: () => transcribe(cfg, wav) });
      return send(res, 200, { text: r.out, way: r.way, fellBack: r.fellBack });
    } catch (e) { return send(res, 502, { error: e.message }); }
  }
  if (req.method === 'POST' && p === '/api/talk/say') {
    const { text } = await body(req);
    try {
      const r = await withFallback(cfg, { cloud: (key) => xaiSay(String(text || ''), { key, voice: cfg.talkCloudVoice, language: cfg.language || 'en' }), own: () => say(cfg, String(text || '')) });
      return send(res, 200, r.out, 'audio/wav', { 'x-bob-way': r.way, ...(r.fellBack ? { 'x-bob-fell-back': '1' } : {}) });
    } catch (e) { return send(res, 409, { error: e.message }); }
  }
  // Voice samples: listing looks at files only; a sample is made (or found) only when asked for.
  if (req.method === 'GET' && p === '/api/voice/samples') return send(res, 200, { voices: publicView(voiceList(cfg, shop)) });
  if (req.method === 'POST' && p === '/api/voice/sample') {
    const { engine, voice } = await body(req);
    try {
      const r = await sampleFor(cfg, shop, String(engine || ''), String(voice || ''));
      if (r.file) return send(res, 200, fs.readFileSync(r.file), TYPES[path.extname(r.file).toLowerCase()] || 'audio/wav');
      return send(res, 200, r);
    } catch (e) { return send(res, 409, { error: e.message }); }
  }
  if (req.method === 'POST' && p === '/api/voice/samples/clear') { if (!isLocal) return send(res, 403, { error: 'Only on this replicant matrix itself.' }); clearSamples(cfg); return send(res, 200, { ok: true }); }
  return false;
}
