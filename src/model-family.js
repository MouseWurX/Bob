// Per-family settings for brains on Bob's own engine (llama.cpp), added 2026-11-02 after the tool check:
//  1. The chat template. A brain file without one (often the case for files that came from Ollama) made llama.cpp
//     fall back to plain ChatML, which garbles the tool list and the reply format for Gemma 4, GPT-OSS and Qwen3.
//     Bob now passes the family's own template from src/templates/ for those files. Files with a template keep it.
//  2. Sampling. Bob sent none, so every brain ran on llama-server's generic defaults (temperature 0.8, top-k 40).
//     Each family now gets its publisher's recommended settings, a little cooler on turns where tools are offered.
// Nothing here changes thinking (think:false, the Medium budget): those stay with the chat template switches.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ggufInfo } from './gguf.js';

export const TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates');

// Which family a brain belongs to, from its file's own metadata first, then its name.
export function familyOf(model, info) {
  const arch = String(info?.arch || '').toLowerCase();
  const hay = `${arch} ${info?.name || ''} ${model || ''}`.toLowerCase();
  if (arch.startsWith('gemma4') || /gemma[-_ ]?4/.test(hay)) return 'gemma4';
  if (/gpt[-_ ]?oss/.test(hay)) return 'gpt-oss';
  if (/qwen[-_ ]?3[-_ ]?coder|qwen3moe.*coder|coder.*qwen3/.test(hay) || (arch.startsWith('qwen3') && /coder/.test(hay))) return 'qwen3-coder';
  if (/^qwen3(?:5|6|7|8|9|next)/.test(arch) || /qwen[-_ ]?3\.[5-9]/.test(hay)) return 'qwen3.5';
  if (arch === 'qwen3' || arch === 'qwen3moe' || /qwen[-_ ]?3\b|qwen3[-_:]/.test(hay)) return 'qwen3';
  if (arch === 'qwen2' || /qwen[-_ ]?2\.5/.test(hay)) return 'qwen2.5';
  return null;
}

const TEMPLATE_FILE = { gemma4: 'gemma4.jinja', 'gpt-oss': 'gpt-oss.jinja', qwen3: 'qwen3.jinja', 'qwen3-coder': 'qwen3-coder.jinja', 'qwen3.5': 'qwen3.5.jinja', 'qwen2.5': 'qwen2.5.jinja' };

// The --chat-template-file to pass, or null to let the file's own template stand.
// lc.templates[model] (a path) always wins; "own" there means never replace it.
export function templateFor(lc, model, gguf) {
  const set = lc?.templates?.[model];
  if (set === 'own') return null;
  if (typeof set === 'string' && set) return set;
  const info = ggufInfo(gguf);
  if (!info) return null; // can't read it: leave llama.cpp to it, as before
  if (info.template || info.toolTemplate) return null;
  const fam = familyOf(model, info);
  // Gemma 4's small models (E2B, E4B) have their own template: no empty thought block when thinking is off.
  const file = fam === 'gemma4' && /\be[24]b\b/i.test(`${model} ${info.name}`) ? 'gemma4-small.jinja' : TEMPLATE_FILE[fam];
  if (!file) return null;
  const full = path.join(TEMPLATE_DIR, file);
  return fs.existsSync(full) ? full : null;
}

// Publishers' recommended sampling (model cards). temp is for normal replies; tools caps it when tools are offered,
// because picking the right tool should not be left to chance.
const SAMPLING = {
  gemma4: { temperature: 1.0, top_p: 0.95, top_k: 64, min_p: 0 },
  'gpt-oss': { temperature: 1.0, top_p: 1.0, top_k: 0, min_p: 0 },
  qwen3: { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0 },
  'qwen3-thinking': { temperature: 0.6, top_p: 0.95, top_k: 20, min_p: 0 },
  'qwen3-coder': { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0, repeat_penalty: 1.05 },
  // 1.5.63: Qwen3.5/3.6 cards: no-think 0.7/0.8/20 with presence_penalty 1.5; thinking 0.6/0.95/20.
  'qwen3.5': { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0, presence_penalty: 1.5 },
  // 1.5.68: thinking also gets presence_penalty 1.5 (Qwen's guidance; without it Qwen3.6 can think in circles).
  'qwen3.5-thinking': { temperature: 0.6, top_p: 0.95, top_k: 20, min_p: 0, presence_penalty: 1.5 },
  'qwen2.5': { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0, repeat_penalty: 1.05 }
};
export const TOOL_TEMP = 0.6;

// Sampling fields for one request (OpenAI-style body for llama-server). Empty object = llama-server's defaults.
// lc.sampling: false turns this off; lc.sampling[model] or lc.sampling[family] replaces the family's values.
export function samplingFor(lc, model, gguf, { tools = false, think } = {}) {
  if (lc?.sampling === false) return {};
  const info = gguf ? ggufInfo(gguf) : null;
  const fam = familyOf(model, info);
  // Qwen3 hybrid brains think unless told not to; their thinking mode has its own settings. Instruct 2507 never thinks.
  const key = fam === 'qwen3' && think !== false && !/instruct/i.test(`${model} ${info?.name || ''}`) ? 'qwen3-thinking' : fam;
  const key2 = fam === 'qwen3.5' && think !== false ? 'qwen3.5-thinking' : key;
  const base = { ...(SAMPLING[key2] || {}), ...(lc?.sampling?.[fam] || {}), ...(lc?.sampling?.[model] || {}) };
  if (!Object.keys(base).length) return {};
  if (tools && typeof base.temperature === 'number') base.temperature = Math.min(base.temperature, lc?.toolTemp ?? TOOL_TEMP);
  return base;
}
