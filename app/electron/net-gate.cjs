// Nov 27 2026: No internet (src/no-internet.js) for the desktop app's own windows. Chromium has its own network, which
// Node's gate (src/net-log.js) can't see, so each of Bob's sessions gets this check on every request: with No internet
// on, a request to a site that isn't allowed is cancelled before it starts, and written down in Where Bob connected.
// The rules come from the server (globalThis.bobNetGate, set in src/server.js, same process). Before the server is up,
// or with No internet off, nothing is stopped. extra(details) lets a session add its own reason (Private web's
// tracker list), since Chromium keeps only one such check per session.
const URLS = ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'];

function stops(url) {
  try { const g = globalThis.bobNetGate; return Boolean(g && g.on() && g.blocksUrl(url)); } catch { return false; }
}

function gateSession(s, extra = () => false) {
  if (!s?.webRequest || s.bobNetGate) return s;
  s.bobNetGate = true;
  s.webRequest.onBeforeRequest({ urls: URLS }, (d, cb) => {
    if (stops(d.url)) { try { globalThis.bobNetGate.note?.(d.url); } catch {} return cb({ cancel: true }); }
    let more = false; try { more = Boolean(extra(d)); } catch {}
    cb({ cancel: more });
  });
  return s;
}

module.exports = { gateSession, stops };
