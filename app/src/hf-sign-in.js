// 🤗 Brains that need a Hugging Face account ("gated" brains), Nov 22 2026. Off unless Settings, How Bob works,
// "Download brains that need a Hugging Face account" is switched on (setting hfGated).
//
// The key is the HF_TOKEN saved in Settings, This replicant matrix, 🔐 Locked secrets (kept scrambled with the
// computer's own key keeper: Windows DPAPI, the Mac Keychain or the Linux key keeper), or HF_TOKEN in the
// environment Bob starts from. It is sent only:
//   - for a catalogue brain marked gated (every other download stays signed out),
//   - to huggingface.co itself: Bob follows the redirects by hand and drops the key at the first hop to another
//     host (Hugging Face's file storage gets a signed link of its own and never sees the key),
//   - in the Authorization header, never in an address.
// It's never shown, logged, written anywhere else or sent back to the window: the window only learns whether
// one is saved.
import { keyValue } from './secret-box.js';

export const HF_KEY = 'HF_TOKEN';
export const gatedOn = (cfg) => cfg?.hfGated === true;
const read = (key) => String(key(HF_KEY) || '').trim();
export const hfKeySaved = ({ key = keyValue } = {}) => Boolean(read(key));

// The key to use for this brain's files, or '' (switch off, no key, or a brain that doesn't need an account).
export function gatedToken(cfg, entry, { key = keyValue } = {}) {
  return entry?.gated && gatedOn(cfg) ? read(key) : '';
}

// Why a gated brain can't be downloaded yet, in plain words, or '' when it can.
export function gatedBlock(cfg, entry, { key = keyValue } = {}) {
  if (!entry?.gated) return '';
  const why = entry.gatedWhy ? ` ${entry.gatedWhy}` : '';
  if (!gatedOn(cfg)) return `${entry.name} needs a Hugging Face account to download. Switch on Settings, How Bob works, "Download brains that need a Hugging Face account", and save a read-only Hugging Face key as HF_TOKEN in 🔐 Locked secrets.${why}`;
  if (!read(key)) return `${entry.name} needs a Hugging Face account to download, and no key is saved. Save a read-only Hugging Face key as HF_TOKEN in Settings, This replicant matrix, 🔐 Locked secrets.${why}`;
  return '';
}

export const signedHost = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'huggingface.co'; } catch { return false; }
};
export const withHfKey = (url, headers = {}, token = '') => (token && signedHost(url) ? { ...headers, authorization: `Bearer ${token}` } : { ...headers });

const REDIRECT = new Set([301, 302, 303, 307, 308]);
// fetch that follows redirects by hand, so the key goes to huggingface.co only. allowed(url) is checked on every hop.
// -> { res, url } where url is the address that answered.
export async function signedFetch(url, { token = '', headers = {}, method = 'GET', signal, allowed = () => true, fetchFn = fetch, hops = 8 } = {}) {
  let u = url;
  for (let i = 0; i <= hops; i++) {
    if (!allowed(u)) throw new Error('The download was redirected somewhere I don\'t trust. Stopped.');
    const res = await fetchFn(u, { method, headers: withHfKey(u, headers, token), redirect: 'manual', signal });
    const loc = REDIRECT.has(res.status) ? res.headers.get('location') : '';
    if (!loc) return { res, url: u };
    try { await res.body?.cancel?.(); } catch {}
    u = new URL(loc, u).href;
  }
  throw new Error('The download was redirected too many times. Stopped.');
}

// 401/403 with the key sent: what to do, in plain words.
export const refusedWords = (name, status) => `Hugging Face said no to ${name} (${status}). Open the brain's page on huggingface.co while signed in to your Hugging Face account and accept its terms, then try again. If you already did, check that the HF_TOKEN in 🔐 Locked secrets is a working "Read" key for that account.`;
