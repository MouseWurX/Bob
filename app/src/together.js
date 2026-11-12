// Ask together (1.5.42): when a job needs more than one OK, every OK it needs goes on one card, so the person
// sees the whole job before saying yes to any part of it (one permission can look fine on its own and worrying
// next to the others). Only when "Let Bob work without asking" is off; with it on there are no cards anyway.
//
// Two ways a combined card comes up:
//   1. Bob calls several tools in one reply: the brain checks them all first and asks once (askTogether).
//   2. Bob calls ask_together with the job's steps before starting (small brains work one step at a time).
// What the person allows is kept for this job only, one use per step, and only for that exact tool with those
// exact details. Every step still goes through its own check when Bob gets to it, so the hard limits, the
// blocked commands and the password rules still refuse what they refuse. A step that wasn't on the card, or whose
// files or command changed since, gets its own card as before ("This wasn't on the list you saw").
import crypto from 'node:crypto';

// The details that don't change what a step does (Bob's own words about it).
const LOOSE = new Set(['why', 'reason', 'say']);
const PATHY = /^(path|paths|cwd|from|to|dest|folder|file|window)$/i;

// The same step, written slightly differently by a small brain, gives the same key: keys sorted, text trimmed,
// paths and window names compared the Windows way (case and slashes don't matter).
function norm(v, key = '') {
  if (Array.isArray(v)) return v.map((x) => norm(x, key));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) {
      if (LOOSE.has(k)) continue;
      const x = v[k];
      if (x === undefined || x === null || x === '') continue;
      o[k] = norm(x, k);
    }
    return o;
  }
  if (typeof v === 'string') { const t = v.trim(); return PATHY.test(key) ? t.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() : t; }
  return v;
}
export function stepKey(name, args) {
  let a = args;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
  return `${String(name || '')}|${JSON.stringify(norm(a || {}))}`;
}

// What the card shows for a step, and what has to still be true when Bob gets there.
function plain(need) { return typeof need === 'string' ? { text: need } : { text: need.text, diff: need.diff, command: need.command, cwd: need.cwd, plan: need.plan, button: need.button }; }
const rowSig = (r) => `${r.op}|${String(r.from || '').toLowerCase()}|${String(r.to || '').toLowerCase()}`;
function sameNeed(a, b) {
  if ((a.command || '') !== (b.command || '') || String(a.cwd || '').toLowerCase() !== String(b.cwd || '').toLowerCase()) return false;
  if ((a.diff || '') !== (b.diff || '')) return false;
  if (Array.isArray(a.plan) || Array.isArray(b.plan)) {
    const x = (a.plan || []).filter((r) => !r.blocked).map(rowSig).sort().join('\n');
    const y = (b.plan || []).filter((r) => !r.blocked).map(rowSig).sort().join('\n');
    if (x !== y) return false;
  }
  return true;
}

// When a step can't be checked yet (it depends on an earlier one: an app that isn't open, a file not made yet),
// the card shows what Bob will do from the step itself.
const SHOW = { app: 'App', tool: 'Tool', inputs: 'Inputs', cmd: 'Program', args: 'With', cwd: 'In', path: 'File', paths: 'Files', to: 'To', name: 'Name', window: 'Window', action: 'Action', text: 'Text', keys: 'Keys', provider: 'Helper', task: 'Job', find: 'Replace', replace: 'With', content: 'Content' };
const KINDS = { Button: 'Button', MenuItem: 'Menu item', TabItem: 'Tab', CheckBox: 'Check box', ListItem: 'List item', Edit: 'Field', Hyperlink: 'Link' };
const kindOf = (args) => KINDS[String(args?.type || '').replace(/[^A-Za-z]/g, '')] || '';
function details(args) {
  const out = [];
  for (const [k, plainLabel] of Object.entries(SHOW)) {
    const label = k === 'name' && kindOf(args) ? kindOf(args) : plainLabel;
    let v = args?.[k];
    if (v === undefined || v === null || v === '') continue;
    v = Array.isArray(v) ? v.join(' ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
    out.push(`${label}: ${v.length > 300 ? `${v.slice(0, 300)}…` : v}`);
  }
  return out.join('\n');
}

// A step that can't be checked yet, said in words (capital first): "Click the Save button in Notepad".
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
export function describe(name, args, tool, say) {
  if (name === 'app_act') {
    const kind = kindOf(args).toLowerCase(), what = args.name ? `the ${args.name}${kind ? ` ${kind}` : ''}` : '';
    const w = args.window ? ` in ${args.window}` : '';
    if (args.action === 'click' && what) return `Click ${what}${w}`;
    if (args.action === 'type') return `Type text${what ? ` into ${what}` : ''}${w}`;
    if (args.action === 'keys') return `Press ${args.keys || 'keys'}${w}`;
  }
  if (name === 'open_app' && args.name) return `Open ${args.name}`;
  return cap(say || (tool.summary ? tool.summary(args) : name));
}

export const parse = (a) => { if (typeof a === 'string') { try { return JSON.parse(a) || {}; } catch { return {}; } } return a || {}; };

// Goes through the steps and returns the ones that need an OK, each with its card details.
// Each check runs on a scratch copy of the job, so nothing it notes down leaks into the real run.
export async function gather(brain, steps, ctx) {
  const items = [];
  for (const s of steps) {
    const name = String(s.tool || s.name || '');
    const args = parse(s.args ?? s.arguments);
    const tool = brain.tools[name];
    if (!tool?.check || !brain.usable(name)) continue; // nothing to ask (or not a tool he can use): the real call says why
    if (tool.alone) continue; // 1.5.48: a new tool Bob made gets its own card after its own checks (selftools.js)
    const key = stepKey(name, args);
    if (ctx.preOk?.get(key)?.length) continue; // 1.5.78: already allowed on an earlier card this job (the plan card)
    if (ctx.allowAll?.has(typeof tool.approvalGroup === 'function' ? tool.approvalGroup(args) : tool.approvalGroup)) continue;
    let need, later = '';
    try { need = await tool.check(args, { ...ctx, handsPlan: null, appsOpen: null, appsTarget: null }); }
    catch (e) { later = String(e.message || e).slice(0, 300); }
    if (!later && !need) continue; // this one needs no OK (a new file in Bob's own folder...)
    const n = items.length + 1;
    const say = String(s.say || '').trim().slice(0, 200);
    items.push(later
      ? { n, key, name, later, text: describe(name, args, tool, say), details: details(args) }
      : { n, key, name, ...plain(need), say });
  }
  return items;
}

// Shows one card with every step on it and waits. Returns how many steps were allowed.
// Allowed steps go in ctx.preOk (key -> list of remembered steps, one use each); denied ones in ctx.preNo.
export async function askOnce(brain, items, ctx, { why = '' } = {}) {
  const id = crypto.randomUUID();
  // Bob's own words about the job stay off the card: they can't be checked against the steps, and the card must
  // never promise or hide anything. The steps themselves are the whole story.
  const text = 'Here they all are, so you can see the whole job before any of it starts.';
  if (why) brain.log('approval', `together, Bob gave a reason (${String(why).length} characters)`); // item 248: his words stay in the chat
  const answer = await brain.approve({ text, together: items }, ctx.emit, ctx.signal, null, { hand: true, id });
  return keepAnswers(brain, items, answer, ctx);
}

// Notes down what the person said on a card with OKs on it (this one, or the plan card in plan.js): allowed steps go
// in ctx.preOk, denied ones in ctx.preNo, one use each.
export function keepAnswers(brain, items, answer, ctx) {
  const picks = answer?.items; // null when the person pressed Allow all or Deny all
  ctx.preOk ||= new Map();
  ctx.preNo ||= new Map();
  let allowed = 0;
  const okNs = new Set();
  for (const it of items) {
    const pick = answer?.allow ? (picks ? picks.find((p) => Number(p.n) === it.n) : { n: it.n }) : null;
    const rows = pick && Array.isArray(pick.rows) ? pick.rows.map(String) : null;
    const ok = Boolean(pick) && !(Array.isArray(it.plan) && rows && !rows.length);
    const bag = ok ? ctx.preOk : ctx.preNo;
    if (!bag.has(it.key)) bag.set(it.key, []);
    bag.get(it.key).push({ ...it, rows });
    if (ok) { allowed++; okNs.add(it.n); }
  }
  brain.log('approval', `together: ${answer?.allow ? `allowed ${allowed} of ${items.length}` : 'denied all'}: ${items.map((i) => i.text).join(' / ').slice(0, 600)}`);
  return { allowed, okNs };
}

// Several calls in one reply: one card for all the ones that need an OK (only when there are two or more).
export async function askTogether(brain, calls, ctx) {
  if (!brain.together?.(ctx)) return 0;
  const steps = calls.map((c) => ({ tool: c.function?.name, args: c.function?.arguments }));
  const items = await gather(brain, steps, ctx);
  if (items.length < 2) return 0;
  return (await askOnce(brain, items, ctx)).allowed;
}

// At the real call: was this exact step on a card already? Returns
//   { ok: true, rows }   allowed (and still the same), so no card;
//   { no: true }         the person said no to it on the card;
//   { changed: true }    allowed, but its files or command changed since, so it asks again;
//   null                 it wasn't on a card.
export function takeEarlier(ctx, name, args, need) {
  const key = stepKey(name, args);
  const no = ctx.preNo?.get(key);
  if (no?.length) { no.shift(); return { no: true }; }
  const list = ctx.preOk?.get(key);
  if (!list?.length) return null;
  const it = list.shift();
  if (it.later) return { ok: true, rows: null }; // couldn't be checked then; it's the same step, and its check just passed
  if (!sameNeed(plain(need), it)) return { changed: true };
  return { ok: true, rows: it.rows };
}

// The ask_together tool: Bob lists the job's steps before he starts.
export function askTogetherTool(brain) {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'ask_together',
        description: 'Before a job that needs several OKs, list those steps here with the exact tool and args. {{USER}} allows or denies them on one card; then call them with the same args and they won\'t ask again. Leave out steps that need no OK.',
        parameters: {
          type: 'object',
          properties: {
            why: { type: 'string', description: 'One short line: what the whole job is for.' },
            steps: {
              type: 'array',
              description: 'Every step that needs an OK, in order.',
              items: {
                type: 'object',
                properties: {
                  tool: { type: 'string', description: 'The tool you will call, like run_command or file_hands.' },
                  args: { type: 'object', description: 'The exact arguments you will call it with.' },
                  say: { type: 'string', description: 'The step in a few plain words.' }
                },
                required: ['tool', 'args']
              }
            }
          },
          required: ['steps']
        }
      }
    },
    async run({ steps, why }, ctx) {
      if (!brain.together?.(ctx)) return 'No cards right now ("work without asking" is on), so just do the steps.';
      const list = (Array.isArray(steps) ? steps : []).slice(0, 25).filter((s) => s && (s.tool || s.name) !== 'ask_together');
      if (!list.length) return 'Error: no steps given. List each step as { tool, args }.';
      const items = await gather(brain, list, ctx);
      if (!items.length) return 'None of those steps needs an OK. Go ahead and do them.';
      const { allowed, okNs } = await askOnce(brain, items, ctx, { why });
      const no = items.length - allowed;
      if (!allowed) return 'The user said no to all of it. Do not do these steps or try another way; say it is fine and ask what to do instead.';
      const names = (pick) => items.filter(pick).map((i) => `${i.n}. ${i.text}`).join('; ');
      return `Allowed ${allowed} of ${items.length}: ${names((i) => okNs.has(i.n))}.${no ? ` Said no to: ${names((i) => !okNs.has(i.n))}. Skip those and don't try another way. If an allowed step needed one of those (like zipping files that were never copied), don't do it either: tell the user why in one line.` : ''} Now do the allowed steps, one tool call each, with exactly the same arguments.`;
    },
    summary: ({ steps }) => `asked for ${Array.isArray(steps) ? steps.length : 0} OKs at once`
  };
}
