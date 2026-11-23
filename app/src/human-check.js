// "Let me finish robot checks" (Settings, Connections, 🕶 Private web; Nov 18 2026; off until you turn it on).
//
// When a page or a search page asks for a person (a captcha, a Cloudflare check, a "checking your browser" page), Bob
// can hand it to you instead of only skipping it:
//   1. A card in the chat: "<site> wants a person to finish a robot check. Open it for you?" Nothing opens until you
//      press Open it. No answer in 3 minutes, or No, and Bob skips the site as before (other sources, if that's on).
//   2. The page opens in Bob's own browser window, in front. You finish the check there.
//   3. Bob waits, looking only at whether the check is still on the page. He never clicks, types or reads into it.
//      When it's gone he reads the page and carries on. Not done in 3 minutes, or you close the window: he skips it.
//   4. For the rest of the job, that site's pages and searches are read through the same window, so the check you
//      finished carries on (the window's own profile; in Private web's throwaway profile it's gone when it closes).
//
// A person always does the check. Bob never solves one himself, and never sends one to anyone but the person at this
// computer: not for Discord, Telegram, a guest, another app, a scheduled job or the Lab, and not on a phone or a Bob
// with no browser window (the Android app, or his brain on its own). At most MAX_ASKS cards a job, one per site.
import { cleanPrivateWeb, pageBlock, siteOf } from './private-web.js';

export const ASK_MS = 3 * 60 * 1000;   // how long the card waits for Open it
export const WAIT_MS = 3 * 60 * 1000;  // how long Bob waits for you to finish the check
export const POLL_MS = 2000;           // how often he looks whether the check is gone
export const MAX_ASKS = 3;             // cards a job, at most
// The blocks a person can finish. A flat "no" (403) or "too many visits" (429) isn't one: those are skipped.
export const PERSON_KINDS = ['a robot check', 'a Cloudflare check', 'a "checking your browser" page'];

export const humanCheckOn = (cfg) => cleanPrivateWeb(cfg?.privateWeb).humanCheck === true;
export const defaultDriver = () => globalThis.bobBrowser || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Who is asking: only the person at this computer, in Bob's own chat.
export function personHere(ctx = {}) {
  if (!ctx || ctx.via || ctx.job?.guest || ctx.job?.rent || ctx.lab || ctx.job?.lab || ctx.job?.scheduled || ctx.job?.schedule) return false;
  const s = String(ctx.sessionId || ctx.job?.sessionId || '');
  if (/^(discord|telegram|guest-|lab|schedule|checkin)/i.test(s)) return false;
  return typeof ctx.brain?.approve === 'function' && typeof ctx.emit === 'function';
}

// What each job has handed over: { asks, sites: Map(site -> 'done' | 'skipped') }.
const jobs = new Map();
const jobKey = (ctx) => ctx?.job?.id || ctx?.askId || ctx?.sessionId || 'no-job';
function jobState(ctx) {
  const k = jobKey(ctx);
  if (!jobs.has(k)) { jobs.set(k, { asks: 0, sites: new Map() }); if (jobs.size > 200) jobs.delete(jobs.keys().next().value); }
  return jobs.get(k);
}
// A site you already finished a check for in this job: its pages go through the same window, no card.
export const finishedHere = (ctx, url) => jobState(ctx).sites.get(siteOf(url)) === 'done';

// Can this block go to the person? '' when it can, else why not (for the log, never for a card).
export function whyNot(cfg, ctx, why, url, { driver = defaultDriver() } = {}) {
  if (!humanCheckOn(cfg)) return 'the switch is off';
  if (!PERSON_KINDS.includes(why)) return 'not a check a person can finish';
  if (!driver?.open || !driver?.html) return 'no browser window here';
  if (!personHere(ctx)) return 'nobody at this computer asked';
  const st = jobState(ctx);
  if (st.sites.has(siteOf(url))) return 'already handed over in this job';
  if (st.asks >= MAX_ASKS) return `already ${MAX_ASKS} this job`;
  return '';
}

// Reads a page through Bob's window (after a check you finished in this job). { html, text, url } or { blocked }.
export async function readThroughWindow(cfg, url, { driver = defaultDriver() } = {}) {
  const pw = cleanPrivateWeb(cfg?.privateWeb);
  driver.setPrivacy?.({ on: pw.on, route: pw.route });
  await driver.open(url);
  const html = String(await driver.html().catch(() => '') || '');
  const blocked = pageBlock(200, html);
  if (blocked) return { blocked };
  const s = await driver.snapshot?.({ max: 0 }).catch(() => null);
  return { html, text: String(s?.text || ''), url: s?.url || url };
}

// The hand-over. { html, text, url } when you finished it, or { skipped: why } (Bob then skips the site as before).
export async function handOver(cfg, ctx, { url, why, driver = defaultDriver(), askMs = ASK_MS, waitMs = WAIT_MS, pollMs = POLL_MS, wait = sleep, now = Date.now } = {}) {
  const site = siteOf(url) || 'the site';
  const st = jobState(ctx);
  st.asks++;
  st.sites.set(siteOf(url), 'skipped');
  const log = (t) => ctx.brain?.log?.('web', `robot check on ${site}: ${t}`);
  // 1. The card. Its own short wait, so a card nobody sees doesn't hold the job for long.
  const ask = new AbortController();
  const stopAsk = () => ask.abort();
  ctx.signal?.addEventListener?.('abort', stopAsk, { once: true });
  const timer = setTimeout(stopAsk, askMs);
  let answer;
  try {
    answer = await ctx.brain.approve({
      text: `${site} wants a person to finish ${why} before it shows the page. I'll open it in my browser window for you to do; I won't touch the check, and I'll carry on when it's gone (I wait up to ${Math.round(waitMs / 60000)} minutes).`,
      command: `Open ${site} for you`, cwd: "Bob's browser", button: 'Open it'
    }, ctx.emit, ask.signal, null, {});
  } finally { clearTimeout(timer); ctx.signal?.removeEventListener?.('abort', stopAsk); }
  if (ctx.signal?.aborted) { const e = new Error('Stopped.'); e.name = 'AbortError'; throw e; }
  if (!answer) { log(ask.signal.aborted ? 'no answer' : 'you said no'); return { skipped: ask.signal.aborted ? 'nobody answered the card' : 'you said no on the card' }; }
  // 2. Open it in front.
  const pw = cleanPrivateWeb(cfg?.privateWeb);
  try {
    driver.setPrivacy?.({ on: pw.on, route: pw.route });
    await driver.open(url);
    driver.focus?.();
  } catch (e) { log(`didn't open: ${e.message}`); return { skipped: `the page didn't open (${String(e?.message || e).slice(0, 60)})` }; }
  ctx.emit({ type: 'announce', text: `🧩 ${site} is open in my browser window. Finish the check there, and I'll carry on when it's gone. I'm not touching it.` });
  log('opened for you');
  // 3. Wait, only looking whether the check is still there.
  const until = now() + waitMs;
  while (now() < until) {
    if (ctx.signal?.aborted) { const e = new Error('Stopped.'); e.name = 'AbortError'; throw e; }
    await wait(pollMs);
    if (driver.isOpen && !driver.isOpen()) { log('window closed'); return { skipped: 'the browser window was closed' }; }
    const html = String(await driver.html().catch(() => '') || '');
    if (html && !pageBlock(200, html)) {
      const s = await driver.snapshot?.({ max: 0 }).catch(() => null);
      st.sites.set(siteOf(url), 'done');
      log('finished by you');
      ctx.emit({ type: 'announce', text: `✅ Thanks, the check on ${site} is done. Carrying on.` });
      return { html, text: String(s?.text || ''), url: s?.url || url };
    }
  }
  log('not finished in time');
  return { skipped: `the check wasn't finished in ${Math.round(waitMs / 60000)} minutes` };
}

// For tests: forget what jobs handed over.
export const forgetJobs = () => jobs.clear();
