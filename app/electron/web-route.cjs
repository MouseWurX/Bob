// Private web's route (src/private-web.js), in the desktop app: Bob's web_search and fetch_page requests go through
// your own proxy or Tor, in a session of their own (no persist:, so nothing is kept). Handed to the brain as
// globalThis.bobRoute before src/server.js loads.
//
// Only these requests use it. Bob's main window, the Lab, Bob-Net, model downloads, updates and cloud helpers keep
// the computer's own way out. If the route is down, Chromium fails the request; it never falls back to going direct
// (the rules never include a direct way out).

// Chromium takes socks5:// (and looks names up through it); socks5h is the same thing, so it's written as socks5.
const chromiumRule = (route) => String(route || '').trim().replace(/^socks5h:/i, 'socks5:');

function makeWebRoute() {
  let ses = null, rule = '';
  async function sessionFor(route) {
    const want = chromiumRule(route);
    if (!ses) {
      const { session } = require('electron'); // only in the app (the tests read chromiumRule without Electron)
      ses = session.fromPartition('bob-web-route'); // not persist: nothing is kept between runs
      ses.setPermissionRequestHandler((wc, perm, cb) => cb(false));
      ses.on('will-download', (e) => e.preventDefault());
    }
    if (want !== rule) {
      await ses.setProxy({ mode: 'fixed_servers', proxyRules: want, proxyBypassRules: '' });
      await ses.closeAllConnections?.();
      rule = want;
    }
    return ses;
  }
  return {
    // Same shape as fetch. No cookie is ever kept or sent (credentials omit, and the session is thrown away).
    async fetch(url, opts = {}, route) {
      if (!route) throw new Error('No route set.');
      const s = await sessionFor(route);
      const { dispatcher, once, ...rest } = opts || {};
      return s.fetch(String(url), { ...rest, credentials: 'omit', bypassCustomProtocolHandlers: true });
    },
    rule: () => rule
  };
}

module.exports = { makeWebRoute, chromiumRule };
