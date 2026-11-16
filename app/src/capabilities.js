// What Bob can actually do on this PC right now. Things he can't do are hidden from his window
// and from his tool list, so he never offers them.
import fs from 'node:fs';
import path from 'node:path';
import { ttsReady } from './tts.js';
import { audioReady } from './audio.js';
import { workshopOn } from './workshop.js';
import { model3dOn, model3dReady } from './model3d.js';
import { exeName } from './platform.js';
import { catalogFileFor } from './llamacpp.js';
import { ollamaOn } from './ollama-optin.js';
import { sttProvider } from './stt.js';
import { Ears, HEAR_MODEL } from './hearing.js';

const exists = (p) => Boolean(p) && fs.existsSync(p);

function ollamaHas(cfg, name) {
  const [m, tag = 'latest'] = String(name).split(':');
  const base = cfg.llamacpp?.ollamaModelsDir || path.join(cfg.agentDir, 'models');
  return exists(path.join(base, 'manifests', 'registry.ollama.ai', 'library', m, tag));
}

// Bob's own ears: the brain that hears and its reader file are here, and his engine is. Asked without starting anything.
function earsReady(cfg, model) {
  const ears = Object.create(Ears.prototype);
  ears.cfg = cfg;
  ears.resolve = (m) => catalogFileFor(cfg, m);
  return ears.ready(model);
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
  // Nov 16 2026: Bob's own engine hears by default (src/hearing.js). Ollama counts only while "Use Ollama too" is on.
  const provider = sttProvider(cfg);
  if (provider === 'whispercpp') hearing = exists(stt.exe || path.join(cfg.agentDir, 'whisper.cpp', exeName('whisper-cli'))) && exists(stt.model);
  else if (provider === 'http') hearing = Boolean(stt.url);
  else if (provider === 'ollama') hearing = ollamaOn(cfg) && ollamaHas(cfg, stt.model || 'gemma4:e4b');
  else hearing = earsReady(cfg, stt.provider === 'brainengine' && stt.model ? stt.model : HEAR_MODEL);

  const p = cfg.painter || {};
  let pictures = false;
  if (p.engine === 'sdcpp') pictures = sdcppReady(cfg, 'image');
  else if (p.engine === 'maestro') pictures = Boolean(cfg.maestro?.enabled && cfg.maestro?.image);
  else pictures = exists(cfg.comfy?.workflowFile);

  const video = sdcppReady(cfg, 'video') || Boolean(cfg.maestro?.enabled && cfg.maestro?.video);
  // Edit models keep a reference's look (same character, new pose). Without one, references are still used as start pictures.
  const edits = sdcppReady(cfg, 'edit');
  return { hearing, pictures: pictures || edits, video, edits, voice: ttsReady(cfg), music: audioReady(cfg).music, sfx: audioReady(cfg).sfx, model3d: model3dOn(cfg) && model3dReady(cfg), workshop: workshopOn(cfg) };
}
