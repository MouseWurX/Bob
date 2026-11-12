// 1.5.16x The Playground's Longer, Faster and Teach it pages (thinking-paths.md sec 15): one route for the Lab to
// mount at the top of labRoute, like recipesRoute. GETs are read-only views; anything that starts a job or writes a
// setting is local only (the page on this replicant matrix itself).
import { contextRoute } from './lab-context.js';
import { turboRoute } from './lab-turbo.js';
import { teachRoute } from './lab-teach.js';
import { watchRoute } from './lab-watch.js';
import { bestRoute } from './lab-best.js'; // 1.5.188 Best answers: a bigger brain judges, the smaller learns
import { plusRoute } from './lab-plus.js'; // Lab items 101 to 112: taste test, judge check, before and after, safety check, recipes, clean a set
import { labOn } from './lab.js';

const PREFIXES = ['/api/lab/context', '/api/lab/turbo', '/api/lab/teach', '/api/lab/watch', '/api/lab/best', '/api/lab/plus'];
export async function pagesRoute({ req, res, p, isLocal, lab, body, send }) {
  if (!PREFIXES.some((x) => p === x || p.startsWith(`${x}/`))) return false;
  if (req.method !== 'GET' && req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
  if (req.method === 'POST' && !labOn(lab.cfg)) { send(res, 403, { error: 'The Lab is off.' }); return true; }
  const b = req.method === 'POST' ? (await body(req)) || {} : {};
  const ctx = { req, res, p, isLocal, lab, b, send };
  if (await contextRoute(ctx) || await turboRoute(ctx) || await teachRoute(ctx) || await watchRoute(ctx) || await bestRoute(ctx) || await plusRoute(ctx)) return true;
  send(res, 404, { error: 'no' }); return true;
}
