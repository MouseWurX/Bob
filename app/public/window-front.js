// Nov 16 2026 "Open brings it to the front" (electron/bring-front.cjs has the window's side). When Settings, the Lab,
// the fNRI viewer or "Bob's thinking" is already open in its own window, pressing its button again asks Bob.exe to
// bring that window forward (restored if minimised), so it always looks as if it opened. In a browser tab or on a
// phone there is no Bob.exe to ask: the browser's own focus() is all there is, and nothing here does anything.
export const inBobApp = (ua = globalThis.navigator?.userAgent || '') => /\bElectron\//.test(ua);

// `which` is settings, lab, watch or mind. `post` and `ua` are passed in so tests use fakes.
export function bringToFront(which, { ua, post } = {}) {
  if (!inBobApp(ua)) return false;
  const send = post || ((body) => fetch('/api/window-front', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(body) }));
  try { Promise.resolve(send({ which })).catch(() => {}); } catch {}
  return true;
}
