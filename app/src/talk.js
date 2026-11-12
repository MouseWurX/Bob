// Talk with Bob (1.5.210, UX plan item 12; off unless turned on, Settings, Voice details): a live, hands-free talk.
// The window listens, sends what you say as an ordinary message, and reads a short version of each reply aloud
// (public/talk.js). The brain is never told it is a voice talk: nothing is added to what he reads, and jobs run
// exactly as they would from the keyboard.
//
// Hearing and speaking are Bob's own (local Whisper and Kokoro, Piper or Chatterbox): free, and nothing leaves
// this replicant matrix. One opt-in extra, also off: xAI's online hearing and voice (POST https://api.x.ai/v1/stt
// and /v1/tts). It needs your own xAI key, which xAI charges for, and it sends your voice and Bob's words to xAI.
// Only the hearing and speaking go there: the thinking stays on Bob's own brain, with his own memory and tools.
// If xAI fails (offline, a bad key, out of credit) the talk carries on in Bob's own voice and says so once.
import { keyValue } from './secret-box.js';

export const XAI_KEY = 'XAI_API_KEY';
export const XAI_STT = 'https://api.x.ai/v1/stt';
export const XAI_TTS = 'https://api.x.ai/v1/tts';
// xAI's voices named in its docs; the list grows on xAI's side, so this is only what Bob offers.
export const XAI_VOICES = [['eve', 'Eve'], ['ara', 'Ara'], ['rex', 'Rex']];
export const CLOUD_WAYS = ['off', 'xai'];

export const talkOn = (cfg) => cfg?.talkWithBob === true;
export const cleanCloud = (v) => (CLOUD_WAYS.includes(v) ? v : 'off');
export const cleanCloudVoice = (v) => (XAI_VOICES.some(([id]) => id === v) ? v : 'eve');

// Which hearing and voice the talk uses right now: 'xai' only with the switch on and a key found; else 'own'.
export function talkWay(cfg, { key = keyValue } = {}) {
  return cleanCloud(cfg?.talkCloud) === 'xai' && String(key(XAI_KEY) || '').trim() ? 'xai' : 'own';
}

// What Settings and the chat window see. Never the key itself, only whether there is one.
export function talkView(cfg, { key = keyValue } = {}) {
  return {
    talkWithBob: talkOn(cfg),
    talkCloud: cleanCloud(cfg?.talkCloud),
    talkCloudVoice: cleanCloudVoice(cfg?.talkCloudVoice),
    talkKeyFound: Boolean(String(key(XAI_KEY) || '').trim()),
    talkWay: talkWay(cfg, { key }),
    xaiVoices: XAI_VOICES
  };
}

// xAI's hearing: a WAV in, the words out.
export async function xaiHear(wav, { key, fetchImpl = globalThis.fetch, language = 'en', timeoutMs = 30000 } = {}) {
  if (!key) throw new Error('No xAI key.');
  const form = new FormData();
  form.append('language', language || 'en');
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav'); // xAI wants the file last
  const r = await fetchImpl(XAI_STT, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`xAI hearing said ${r.status}`);
  const j = await r.json();
  return String(j?.text || '').trim();
}

// xAI's voice: words in, a WAV out.
export async function xaiSay(text, { key, voice = 'eve', fetchImpl = globalThis.fetch, language = 'en', timeoutMs = 30000 } = {}) {
  if (!key) throw new Error('No xAI key.');
  const words = String(text || '').trim().slice(0, 2000);
  if (!words) throw new Error('Nothing to say.');
  const r = await fetchImpl(XAI_TTS, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: words, voice_id: cleanCloudVoice(voice), language: language || 'en', output_format: { codec: 'wav', sample_rate: 24000 } }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!r.ok) throw new Error(`xAI voice said ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// One hearing or one saying, with the fallback: xAI when picked, Bob's own when not, or when xAI fails.
// Returns { out, way, fellBack }.
export async function withFallback(cfg, { cloud, own, key = keyValue, log = () => {} }) {
  if (talkWay(cfg, { key }) === 'xai') {
    try { return { out: await cloud(String(key(XAI_KEY)).trim()), way: 'xai', fellBack: false }; }
    catch (e) { log('voice', `Talk with Bob: xAI didn't answer (${e.message}); using Bob's own instead`); return { out: await own(), way: 'own', fellBack: true }; }
  }
  return { out: await own(), way: 'own', fellBack: false };
}
