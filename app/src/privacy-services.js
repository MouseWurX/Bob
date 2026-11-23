// Nov 23 2026 (the owner: "Turning discord on or telegram on or those other services on should be the switch for them,
// and it should have a clear warning about privacy", and "There should be a best practices for privacy with each
// different service"). Every service that can send your data out of this replicant matrix is listed here once: what it
// sends, where it goes, who can see it there, and a short list of best practices.
//
// The switch IS the permission. Turning a service on (from Settings, the chat page's switches or anywhere else) goes
// through privacyGate() in server.js: the first try is answered 428 with this card, the page shows it
// (public/privacy-card.js), and only "Turn it on" sends the same change again with x-bob-privacy-ok naming the service.
// Turning things off never asks. Nothing new is switched on by this file; it only adds the card.
//
// The owner's rule (Nov 23): every best practice is checked against the provider's own current page before it ships.
// Each one keeps that page's address (source) and the day it was checked (checked); a test fails if either is missing.
// Change the words, check the page again, and change the date.
import { rentalsOf, serviceOf } from './rental.js';
import { moreTools } from './more-tools.js';
import { loadServers } from './mcp.js';

const C = '2026-11-23';
const tip = (text, source, checked = C) => ({ text, source, checked });

// tips: facts from the provider's own page (source + checked). advice: Bob's own advice, which says nothing about the
// provider, so it has no page to check.
export const PRIVACY_SERVICES = {
  telegram: {
    name: 'Bob on Telegram',
    sends: 'Your messages to Bob from Telegram, his replies, and pictures he sends there.',
    to: 'Telegram\'s servers (api.telegram.org).',
    sees: 'Telegram carries the chat. Bob answers only the Telegram account you paired; anyone else gets no answer.',
    tips: [
      tip('Only Telegram\'s secret chats are end-to-end encrypted. A chat with your bot goes through Telegram\'s servers.', 'https://telegram.org/privacy'),
      tip('A bot gets every message you send it, so treat the chat like any message you send online.', 'https://telegram.org/privacy')
    ],
    advice: ['Talk to your own bot in a private chat, not in a group.', 'Don\'t send passwords or private documents there.']
  },
  discord: {
    name: 'Bob on Discord',
    sends: 'Messages in the channels and DMs you let Bob see, his replies, and pictures he sends there.',
    to: 'Discord\'s servers (discord.com, gateway.discord.gg).',
    sees: 'Discord stores the messages. Everyone in a channel Bob talks in can read his replies.',
    tips: [
      tip('Discord collects and stores the messages you send: don\'t paste passwords or private documents there.', 'https://discord.com/privacy'),
      tip('Give the bot only the permissions it needs.', 'https://docs.discord.com/developers/platform/oauth2-and-permissions')
    ],
    advice: ['Use a private server or channel just for Bob.']
  },
  'web-search': {
    name: 'Web search',
    sends: 'The search words, and the addresses of pages Bob reads. Commands Bob runs can go online too (downloads like npm install or git pull), and a command could send files.',
    to: 'DuckDuckGo, the websites he opens, and whatever sites a command you OK talks to.',
    sees: 'The search engine and each website see the words or page asked for, and this connection\'s internet address. While Web is on, commands aren\'t kept offline: each still shows its card first. Web off: nothing goes online, commands included.',
    tips: [
      tip('DuckDuckGo says it never tracks you. The websites Bob opens still see each visit.', 'https://duckduckgo.com/duckduckgo-help-pages/privacy/no-tracking')
    ],
    advice: ['Searches show what you are asking about: don\'t search for your own name, address or account numbers.', 'Leave it off when your own files can answer the question.']
  },
  'search-backup': {
    name: 'Backup search (with a key)',
    sends: 'The search words, with your key.',
    to: 'The search services you switch on (Marginalia, Brave, Mojeek, Tavily).',
    sees: 'Each service sees your searches under your account, and keeps them under its own rules.',
    tips: [
      tip('Mojeek doesn\'t track you or record internet addresses, but keeps search words in its logs for 90 days.', 'https://www.mojeek.com/about/privacy'),
      tip('Tavily keeps your searches while you have an account, and may use them to improve its answers.', 'https://tavily.com/privacy')
    ],
    advice: ['Don\'t search for your own name, address or account numbers.']
  },
  email: {
    name: 'Let Bob read my email',
    sends: 'Your email address and app password, to your own mail server only.',
    to: 'Your mail provider\'s server (the address you typed).',
    sees: 'Only your mail provider, who already has your mail. Bob never sends email, asks before moving or deleting any, and keeps a chat that has read mail off the internet (the mail lock).',
    tips: [
      tip('Use an app password, never your main password. It needs 2-Step Verification, and you can revoke it any time.', 'https://support.google.com/accounts/answer/185833')
    ],
    advice: ['Keep "Let Bob tidy my email" off unless you need it.']
  },
  'cloud-helpers': {
    name: 'Cloud helpers',
    sends: 'The part of the chat a helper is asked about, and any files given to it.',
    to: 'The AI company you switch on (Anthropic, OpenAI, Google, OpenRouter).',
    sees: 'That company keeps what it is sent under its own rules.',
    tips: [
      tip('OpenAI doesn\'t train on API data by default, but keeps it up to 30 days to check for abuse.', 'https://developers.openai.com/api/docs/guides/your-data'),
      tip('Gemini\'s free tier may use what you send to improve Google\'s products, and people may read it. The paid tier doesn\'t.', 'https://ai.google.dev/gemini-api/terms')
    ],
    advice: ['Send only what the job needs. Leave out files with personal details.']
  },
  'talk-cloud': {
    name: 'Cloud voice',
    sends: 'What you say out loud to Bob, and his spoken replies.',
    to: 'xAI\'s voice service.',
    sees: 'xAI receives your voice and the words, under its own privacy rules.',
    tips: [],
    advice: ['Bob\'s own voice runs on this replicant matrix: use it for anything private.']
  },
  'rent-answer': {
    name: 'Rented brains (pay per answer)',
    sends: 'The whole chat of a job you hire it for: your messages, files you attach, Bob\'s instructions and what he remembers about you.',
    to: 'The service you hire (OpenRouter, Together AI, Lambda, or an address you typed).',
    sees: 'There is no machine to delete: your text goes to their servers, and their own rules decide whether it is logged or kept. The rented brain sees everything in the chat, including any mail or files Bob has read.',
    tips: [
      tip('OpenRouter: in its privacy settings, keep providers that train on your data turned off.', 'https://openrouter.ai/docs/guides/privacy/provider-logging'),
      tip('Together AI doesn\'t share your data for training unless you opt in, and new accounts start with zero data retention. Check both are still set.', 'https://docs.together.ai/docs/privacy-and-security')
    ],
    advice: ['Don\'t hire one for chats with mail, passwords or personal files in them.']
  },
  'rent-serverless': {
    name: 'Rented brains (RunPod serverless)',
    sends: 'The whole chat of a job you hire it for, as with any rented brain.',
    to: 'RunPod, and the machine it runs the job on.',
    sees: 'RunPod handles the request on its servers. The rented brain sees everything in the chat, including any mail or files Bob has read.',
    tips: [],
    advice: ['Don\'t hire one for chats with mail, passwords or personal files in them.']
  },
  'rent-machine': {
    name: 'Rented machines (by the minute)',
    sends: 'The whole chat of a job you hire it for, and the model it runs.',
    to: 'A machine at the service you hire (RunPod, Vast.ai, Lambda).',
    sees: 'While it runs, your data is on someone else\'s computer, and its owner could see it. Bob rents without a storage volume and deletes the machine at the end. That the disk is wiped is the service\'s promise; Bob can\'t check it.',
    tips: [
      tip('RunPod: deleting (terminating) a machine deletes everything not on a network volume.', 'https://docs.runpod.io/pods/manage-pods'),
      tip('RunPod: a stopped machine keeps its disk, and you keep paying for it. Stopped is not deleted.', 'https://docs.runpod.io/pods/manage-pods'),
      tip('Vast.ai: for sensitive work, use Secure Cloud certified providers only. Individual hosts may have less formal security.', 'https://docs.vast.ai/guides/reference/faq/security')
    ],
    advice: ['Use a key that can only manage machines.', 'Don\'t put secrets or personal files in the job.']
  },
  'coding-agents': {
    name: 'Coding agents',
    sends: 'Whatever the agent itself sends: it is a separate program with its own internet access.',
    to: 'The agent\'s own company (for example Anthropic for Claude Code, OpenAI for Codex, Google for Gemini CLI).',
    sees: 'Bob can\'t see or limit what a coding agent sends. Its company\'s privacy rules apply.',
    tips: [],
    advice: ['Point it only at project folders, never your home folder or Documents.', 'Check the agent\'s own telemetry and data-sharing settings.']
  },
  'mcp-remote': {
    name: 'A connected app on another computer',
    sends: 'The inputs of each step Bob runs with it (Bob shows them on a card first).',
    to: 'The address you added.',
    sees: 'Whoever runs that server sees what Bob sends it.',
    tips: [],
    advice: ['Apps on this replicant matrix (localhost) keep everything here. Treat any other address like a cloud helper.', 'Only add servers you or someone you trust runs.']
  }
};

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/i;
const remote = (url) => { try { return !LOOPBACK.test(new URL(url).hostname); } catch { return false; } };
const rentKind = (id) => { const k = serviceOf(id)?.kind; return k === 'machine' ? 'rent-machine' : k === 'serverless' ? 'rent-serverless' : 'rent-answer'; };

// Which services this POST turns ON (off before, on after). Off -> off, on -> on and anything turned off: nothing.
export function turningOn(p, b, cfg, deps = {}) {
  const { servers } = deps;
  if (!b || typeof b !== 'object') return [];
  const out = new Set();
  if (p === '/api/telegram' && b.enabled === true && cfg.telegram?.enabled !== true) out.add('telegram');
  if (p === '/api/discord' && b.enabled === true && cfg.discord?.enabled !== true) out.add('discord');
  if (p === '/api/settings') {
    if (b.webSearch === true && cfg.webSearch !== true) out.add('web-search');
    if (b.cloudHelpers && typeof b.cloudHelpers === 'object') for (const [id, v] of Object.entries(b.cloudHelpers)) if (v?.enabled === true && cfg.cloudHelpers?.[id]?.enabled !== true) out.add('cloud-helpers');
  }
  if (p === '/api/search-backup' && b.use?.on === true && cfg.searchBackup?.use?.[b.use.id] !== true) out.add('search-backup');
  if (p === '/api/talk' && b.talkCloud === 'xai' && cfg.talkCloud !== 'xai') out.add('talk-cloud');
  if (p === '/api/more-tools' && b.set?.email === true && moreTools(cfg).email !== true) out.add('email');
  if (p === '/api/rent/settings' && b.enabled && typeof b.enabled === 'object') {
    const st = rentalsOf(cfg);
    for (const [id, on] of Object.entries(b.enabled)) if (on === true && serviceOf(id) && st.enabled?.[id] !== true) out.add(rentKind(id));
  }
  if (p === '/api/coding-agents' && b.add) out.add('coding-agents');
  // a "Switch it on" card in the chat (setup-offer.js): Web search is turned on by its answer
  if (p === '/api/setup/answer' && b.yes === true && deps.setupSwitch?.(String(b.id || '')) === 'web' && cfg.webSearch !== true) out.add('web-search');
  if (p === '/api/hands/mcp' && b.id && b.on === true) {
    let s; try { s = (servers || loadServers(cfg)).find((x) => x.id === String(b.id)); } catch {}
    if (s && !s.on && s.url && remote(s.url)) out.add('mcp-remote');
  }
  return [...out];
}

export const PRIVACY_PATHS = new Set(['/api/telegram', '/api/discord', '/api/settings', '/api/search-backup', '/api/talk', '/api/more-tools', '/api/rent/settings', '/api/coding-agents', '/api/hands/mcp', '/api/setup/answer']);

export const card = (id) => ({ id, ...PRIVACY_SERVICES[id] });

// null: go ahead. Otherwise the answer to send: 428 with the cards still to confirm.
export function privacyGate(p, b, cfg, okHeader = '', deps = {}) {
  const ok = new Set(String(okHeader || '').split(',').map((s) => s.trim()).filter(Boolean));
  const need = turningOn(p, b, cfg, deps).filter((id) => !ok.has(id));
  if (!need.length) return null;
  return { status: 428, body: { error: 'This sends data out of this replicant matrix. Confirm it on the privacy card first.', ok: false, why: 'This sends data out. Turn it on at the replicant matrix itself (Settings), where its privacy card shows what it sends and where.', privacy: need.map(card) } };
}
