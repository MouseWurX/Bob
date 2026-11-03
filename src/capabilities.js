// What Bob can actually do on this PC right now. Things he can't do are hidden from his window
// and from his tool list, so he never offers them.
import fs from 'node:fs';
import path from 'node:path';
import { ttsReady } from './tts.js';
import { audioReady } from './audio.js';
import { workshopOn } from './workshop.js';
import { exeName } from './platform.js';

const exists = (p) => Boolean(p) && fs.existsSync(p);

function ollamaHas(cfg, name) {
  const [m, tag = 'latest'] = String(name).split(':');
  const base = cfg.llamacpp?.ollamaModelsDir || path.join(cfg.agentDir, 'models');
  return exists(path.join(base, 'manifests', 'registry.ollama.ai', 'library', m, tag));
}

function sdcppReady(cfg, kind) {
  const s = cfg.painter?.sdcpp || {};
  const spec = s[kind];
  if (!spec || !exists(s.exe)) return false;
  const files = ['diffusionModel', 'model', 'vae', 'llm', 'llmVision', 't5xxl', 'clipL', 'audioVae', 'embeddingsConnectors'].map((k) => spec[k]).filter(Boolean);
  return files.length > 0 && files.every(exists);
}

export function capabilities(cfg) {
  const stt = cfg.stt || {};
  let hearing = false;
  if (stt.provider === 'whispercpp') hearing = exists(stt.exe || path.join(cfg.agentDir, 'whisper.cpp', exeName('whisper-cli'))) && exists(stt.model);
  else if (stt.provider === 'http') hearing = Boolean(stt.url);
  else hearing = ollamaHas(cfg, stt.model || 'gemma4:e4b');

  const p = cfg.painter || {};
  let pictures = false;
  if (p.engine === 'sdcpp') pictures = sdcppReady(cfg, 'image');
  else if (p.engine === 'maestro') pictures = Boolean(cfg.maestro?.enabled && cfg.maestro?.image);
  else pictures = exists(cfg.comfy?.workflowFile);

  const video = sdcppReady(cfg, 'video') || Boolean(cfg.maestro?.enabled && cfg.maestro?.video);
  // Edit models keep a reference's look (same character, new pose). Without one, references are still used as start pictures.
  const edits = sdcppReady(cfg, 'edit');
  return { hearing, pictures: pictures || edits, video, edits, voice: ttsReady(cfg), music: audioReady(cfg).music, sfx: audioReady(cfg).sfx, workshop: workshopOn(cfg) };
}
