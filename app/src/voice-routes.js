// Voice in Bob's API: turn a recording into words, read a reply aloud, and the voice samples in Settings.
// Split out of server.js; same rules as before.
import fs from 'node:fs';
import path from 'node:path';
import { transcribe } from './stt.js';
import { say } from './tts.js';
import { voiceList, publicView, sampleFor, clearSamples } from './voice-samples.js';

// Returns true when it answered the request, so server.js stops looking. The send and serveFile it is handed
// return true too, so `return send(...)` here means answered.
export async function voiceRoute({ req, res, p, isLocal, cfg, shop, body, send, TYPES }) {
  if (req.method === 'POST' && p === '/api/transcribe') {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 15e6) return send(res, 413, { error: 'Recording too long.' }); chunks.push(c); }
    try { return send(res, 200, { text: await transcribe(cfg, Buffer.concat(chunks)) }); }
    catch (e) { return send(res, 502, { error: e.message }); }
  }
  if (req.method === 'POST' && p === '/api/speak') {
    const { text } = await body(req);
    try { return send(res, 200, await say(cfg, String(text || '')), 'audio/wav'); }
    catch (e) { return send(res, 409, { error: e.message }); }
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
