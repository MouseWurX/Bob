// Same-origin only, for anything that changes something (on top of the x-bob header the page always sends):
// an Origin header (browsers send one on every POST) must be Bob's own address, the request must not be marked as
// coming from another site (another port on this PC counts as another site), and the body must be JSON, audio or
// a picture, which a plain web form can't send. Returns '' when fine, or why it was refused.
const OK_TYPES = /^(application\/json|application\/octet-stream|audio\/[\w.+-]+|image\/[\w.+-]+)(\s*;.*)?$/i;

export function refuseForeign(req, host) {
  const origin = String(req.headers.origin || '').toLowerCase();
  if (origin && origin !== `http://${host}` && origin !== `https://${host}`) return 'other website';
  const site = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (site && site !== 'same-origin' && site !== 'none') return 'other website';
  if (!OK_TYPES.test(String(req.headers['content-type'] || ''))) return 'content type';
  return '';
}
