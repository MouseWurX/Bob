// 1.5.228 Settings, Agents: the companies that get a section of their own (the owner, Nov 14: "all the big company
// agents should get their whole section"). Shared by the server (src/net-overlay.js chat heads) and Settings.
// kind: that company's coding agent program (src/coding-agents.js KINDS). cloud: its Cloud helper
// (src/cloud.js CLOUD_PROVIDERS), '' when it has none.
export const COMPANIES = [
  { id: 'claude', name: 'Claude', maker: 'Anthropic', kind: 'claude', cloud: 'anthropic' },
  { id: 'openai', name: 'OpenAI', maker: 'OpenAI', kind: 'codex', cloud: 'openai' },
  { id: 'gemini', name: 'Gemini', maker: 'Google', kind: 'gemini', cloud: 'gemini' },
  { id: 'qwen', name: 'Qwen', maker: 'Alibaba', kind: 'qwen', cloud: '' },
  { id: 'opencode', name: 'OpenCode', maker: 'SST', kind: 'opencode', cloud: '' }
];
export const COMPANY_IDS = COMPANIES.map((c) => c.id);
// Cloud helpers shown in a company's section, not in Online services.
export const COMPANY_CLOUDS = COMPANIES.map((c) => c.cloud).filter(Boolean);
// The chat apps that also get a section under Agents; their chat head shows while they're on.
export const CHAT_APPS = [{ id: 'discord', name: 'Discord' }, { id: 'telegram', name: 'Telegram' }];
// Only known companies, only true: anything else is dropped.
export function cleanChatHeads(v) {
  const out = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const id of COMPANY_IDS) if (v[id] === true) out[id] = true;
  return out;
}
