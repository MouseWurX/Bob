// Assistant presets (Settings, Bob himself, Assistant presets). Off unless switched on ("chatPresets").
// A preset is a saved set of instructions and settings: a name, extra instructions, a brain, a starting effort, a
// temperature and which tool groups Bob may add. You pick one per chat with the 🎭 menu next to Effort (or the Preset
// button in Bob for Android); a chat with no preset is plain Bob, as before. A preset only narrows or adds to what
// Bob already is: it never switches on a tool, a Hand or a setting that is off, and his rules stay the same.
// The presets live in settings.json ("presetList"); which chat uses which lives in inn\bob\chat-presets.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_PRESETS = 30;
export const MAX_INSTRUCTIONS = 4000;
export const EFFORTS = ['low', 'medium', 'high', 'extreme'];

// The tool groups a preset can allow (toolbox.js groups and the Hands), in the words the chat chips use.
export const TOOL_GROUPS = [
  ['pictures', 'Pictures, video, music and sound'],
  ['diagrams', 'Diagrams'],
  ['documents', 'Writing and searching files'],
  ['sandbox', 'Sums in the sandbox'],
  ['memory', 'Forgetting a topic'],
  ['howtos', 'How-tos'],
  ['selfwork', 'Working on a repository'],
  ['cloud', 'Cloud helpers'],
  ['files', 'Hands: files'],
  ['run', 'Hands: run programs'],
  ['schedules', 'Hands: schedules'],
  ['apps', 'Hands: apps'],
  ['office', 'Hands: office and converting'],
  ['security', 'Hands: security and privacy'],
  ['maker', 'Hands: his own tools'],
  ['browser', 'Hands: his browser'],
  ['mcp', 'Hands: connected apps']
];
const GROUP_IDS = TOOL_GROUPS.map(([id]) => id);

export const presetsOn = (cfg) => cfg?.chatPresets === true;

const text = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
export const newPresetId = () => 'p' + crypto.randomBytes(4).toString('hex');

// One preset, with only known fields. Blank means "as usual": no brain, effort or temperature of its own.
export function cleanPreset(p = {}) {
  const id = /^p[0-9a-f]{8}$/.test(String(p?.id || '')) ? p.id : newPresetId();
  const name = text(p?.name, 40) || 'My preset';
  const instructions = text(p?.instructions, MAX_INSTRUCTIONS);
  const brain = /^[\w.:/@+-]{1,160}$/.test(String(p?.brain || '')) ? String(p.brain) : '';
  const effort = EFFORTS.includes(p?.effort) ? p.effort : '';
  const t = p?.temperature;
  const temperature = t === '' || t === null || t === undefined || !Number.isFinite(Number(t)) ? null : Math.round(Math.min(2, Math.max(0, Number(t))) * 100) / 100;
  let tools = 'usual';
  if (p?.tools === 'none') tools = 'none';
  else if (Array.isArray(p?.tools)) tools = [...new Set(p.tools.map(String).filter((g) => GROUP_IDS.includes(g)))];
  return { id, name, instructions, brain, effort, temperature, tools };
}

export function cleanPresetList(list) {
  const out = [], seen = new Set();
  for (const p of [].concat(list || []).slice(0, MAX_PRESETS)) {
    if (!p || typeof p !== 'object') continue;
    const c = cleanPreset(p);
    if (seen.has(c.id)) c.id = newPresetId();
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

// ---- Which chat uses which preset (inn\bob\chat-presets.json: { chatId: presetId }) ----
export const picksFile = (cfg) => path.join(cfg.dataDir, 'chat-presets.json');
const safeChat = (id) => String(id || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);

export function readPicks(cfg) {
  try { const v = JSON.parse(fs.readFileSync(picksFile(cfg), 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

export function pickPreset(cfg, chatId, presetId) {
  const id = safeChat(chatId);
  if (!id) throw new Error('Which chat?');
  const list = cleanPresetList(cfg.presetList);
  if (presetId && !list.some((p) => p.id === presetId)) throw new Error('That preset is gone. Pick another one.');
  const picks = readPicks(cfg);
  if (presetId) picks[id] = presetId; else delete picks[id];
  // Only chats that still pick a preset that still exists are kept; the newest 2,000 at most.
  const live = new Set(list.map((p) => p.id));
  const kept = Object.fromEntries(Object.entries(picks).filter(([, v]) => live.has(v)).slice(-2000));
  fs.mkdirSync(path.dirname(picksFile(cfg)), { recursive: true });
  fs.writeFileSync(picksFile(cfg) + '.part', JSON.stringify(kept));
  fs.renameSync(picksFile(cfg) + '.part', picksFile(cfg));
  return presetId ? list.find((p) => p.id === presetId) : null;
}

// The preset this chat uses, or null (switch off, no pick, or the preset was removed).
export function presetFor(cfg, chatId) {
  if (!presetsOn(cfg) || !chatId) return null;
  const want = readPicks(cfg)[safeChat(chatId)];
  if (!want) return null;
  return cleanPresetList(cfg.presetList).find((p) => p.id === want) || null;
}

// The brains a preset can name: the ones already in Bob's slots (Equip Bob). Nothing new is downloaded for a preset.
export function presetBrains(cfg) {
  return [...new Set(Object.values(cfg?.models || {}).filter((m) => typeof m === 'string' && m))];
}

// The brain the preset asks for, when it's still in one of Bob's slots; otherwise '' (Bob's usual brain).
export function presetBrain(cfg, preset) {
  return preset?.brain && presetBrains(cfg).includes(preset.brain) ? preset.brain : '';
}

// The tool groups a preset allows: null = as usual, an empty set = none at all.
export function presetGroups(preset) {
  if (!preset || preset.tools === 'usual' || preset.tools === undefined) return null;
  return new Set(preset.tools === 'none' ? [] : preset.tools);
}

// A set of tool groups that never takes a group the preset leaves out, however it's added (the user's words,
// use_tools, the one-more-go after "I can't"). `only` is read by toolbox.js and brain.frontDeskTools.
export class LimitedGroups extends Set {
  constructor(items, only) { super(); this.only = only || null; for (const g of items || []) this.add(g); }
  add(g) { return this.only && !this.only.has(g) ? this : super.add(g); }
}

// The lines for the chat's instructions. Nothing at all with no preset.
export function presetPrompt(preset, user = 'the user') {
  if (!preset) return '';
  const lines = [`${user} picked the assistant preset "${preset.name}" for this chat.`];
  if (preset.instructions) lines.push(`Its instructions, which you follow in this chat as well as everything above (where they differ on tone, focus or format, these win; they never change your honesty, safety or asking before doing things):\n${preset.instructions.replaceAll('{{USER}}', user)}`);
  if (preset.tools === 'none') lines.push('This preset is for talking only: you have no tools in this chat. If a job needs one, say so in a line and suggest a chat without this preset.');
  else if (Array.isArray(preset.tools)) lines.push(`This preset only lets you use some of your tools in this chat. If a job needs one it leaves out, say so in a line and suggest a chat without this preset.`);
  return lines.join('\n');
}

// What the page and the phone see.
export function presetsView(cfg, chatId = '') {
  const list = cleanPresetList(cfg.presetList);
  const picked = chatId ? readPicks(cfg)[safeChat(chatId)] || '' : '';
  return { on: presetsOn(cfg), list, picked: list.some((p) => p.id === picked) ? picked : '', brains: presetBrains(cfg), groups: TOOL_GROUPS.map(([id, label]) => ({ id, label })), efforts: EFFORTS };
}
