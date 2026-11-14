// Peek inside and the expert switch: what a brain's experts do, switching experts off and back on, and keeping a pick.
// Methods of the Lab class. Split out of lab.js.
import { peekView, keepFromLit, NO_ENGINE, NO_TRACE, askTraced, tallyTrace, addToTally, IDLE_MS } from './lab-peek.js';
import { routerBias, switchState, switchOn, switchOff } from './lab-switch.js';
import { readGguf, checkKeep } from './lab-gguf.js';
import { gaming } from './sessions.js';
import { startServer } from './lab-test.js';
import path from 'node:path';
import { usageFolder, keepFileOf } from './lab-usage.js';
import fs from 'node:fs';
import { inspect, labOn, readJson, sha256File, slugOf, writeJson } from './lab-measure.js';
import { maskFor } from './lab-plan.js';
import { cleanPerWord, sendPerWord, speedGuessWords } from './experts-per-word.js'; // Brain Engine 0013

// Methods of the Lab class (src/lab.js), put on it there with the same rules as the methods written inside it.
export const peekJobs = {
  // ---- 1.5.164 Peek inside (Playground) ----
  peek(brainId) {
    const brain = this.brains().find((b) => b.id === String(brainId || ''));
    if (!brain) throw new Error('Pick a brain to peek inside.');
    let facts = null; try { facts = inspect(brain); } catch {}
    return { ...peekView(this.cfg, brain, facts, { engineFound: this.tools().brainEngine.found || Boolean(this.stepFns.peekServe), traceOk: this.peekTraceOk ?? this.traceProbe()?.experts ?? null }), switch: this.switchView(brain) };
  },
  // 1.5.20x Switch experts off in the file (brains whose router has a bias, like gpt-oss): see lab-switch.js.
  switchView(brain) {
    let can = false; try { can = Boolean(routerBias(readGguf(brain.gguf))); } catch {}
    return { can, state: can ? switchState(brain.gguf) : null };
  },
  async switchExperts({ brain: id, counts = null, back = false } = {}, { unload = false } = {}) {
    const brain = this.brains().find((b) => b.id === String(id || ''));
    if (!brain) throw new Error('Pick a brain first.');
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    this.freePeek();
    // The brain file changes, so nothing may have it loaded: Bob's own brain is unloaded first (it loads again on the next chat).
    if (this.brain?.engine?.loaded) {
      const loaded = await this.brain.engine.loaded().catch(() => []);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
    }
    if (back) { switchOn(brain.gguf); return { switch: this.switchView(brain) }; }
    const facts = inspect(brain);
    const k = this.peekKeep({ brain: brain.id, counts });
    const layers = readJson(k.file, {}).layers;
    if (!Array.isArray(layers)) throw new Error('That keep list has no layers in it.');
    switchOn(brain.gguf); // start from the brain as it came, so a new list replaces the last one
    switchOff(brain.gguf, layers, { used: facts?.used || 1, when: new Date(this.now()).toISOString().slice(0, 10) });
    return { switch: this.switchView(brain) };
  },
  async peekAsk({ brain: id, question, mask = null, maskCounts = null, tally = false, perWord = null } = {}, { unload = false } = {}) {
    const q = String(question || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!q) throw new Error('Type a question to ask.');
    const brain = this.brains().find((b) => b.id === String(id || ''));
    if (!brain) throw new Error('Pick a brain to peek inside.');
    const facts = inspect(brain);
    if (!facts?.experts) throw new Error(`${brain.name} isn't a mixture-of-experts brain, so there's nothing to peek at.`);
    if (Array.isArray(maskCounts) && maskCounts.length) mask = keepFromLit(maskCounts, facts); // Keep only these: the lit-up set, padded to one size
    // Experts per word for this question only (Brain Engine 0013): the brain's own when empty
    perWord = cleanPerWord(perWord, { experts: facts.experts, layers: facts.engineLayers || facts.layers });
    if (perWord === facts.used) perWord = null;
    const tools = this.tools();
    if (!tools.brainEngine.found && !this.stepFns.peekServe) throw new Error(NO_ENGINE);
    if (this.peekTraceOk === false) throw new Error(NO_TRACE);
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    if (!this.peekSrv || this.peekSrv.gguf !== brain.gguf) {
      this.freePeek();
      if (this.brain?.engine?.loaded) {
        const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard || m.usesCard);
        if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
        if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
      }
    }
    const ac = new AbortController();
    const r = { id: `peek-${this.now().toString(36)}`, kind: 'peek', name: `Peek inside ${brain.name}`, state: 'running', steps: [] };
    this.job = { run: r, ac };
    try {
      const serve = this.stepFns.peekServe || (({ gguf, signal }) => startServer({ exe: tools.brainEngine.path, gguf, ctx: 4096, signal, log: () => {} }));
      if (!this.peekSrv) { const srv = await serve({ gguf: brain.gguf, signal: ac.signal }); this.peekSrv = { gguf: brain.gguf, srv, timer: null, sha: '' }; }
      const s = this.peekSrv;
      clearTimeout(s.timer);
      const url = s.srv.url;
      const post = async (body) => { const res = await fetch(url + '/expert-mask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }); if (!res.ok) throw new Error(`Brain Engine wouldn't switch the experts: ${(await res.text()).slice(0, 200)}`); };
      let masked = false, perWordSet = false;
      const perWordSend = this.stepFns.perWord || sendPerWord;
      let got;
      try {
        // the count first, so a mask that keeps fewer than it is refused with Brain Engine's own reason
        if (perWord !== null) { await perWordSend(url, perWord); perWordSet = true; }
        if (Array.isArray(mask) && mask.length) { const why = checkKeep(readGguf(brain.gguf), mask); if (why) throw new Error(why); await post({ keep: maskFor(mask, facts) }); masked = true; }
        got = await (this.stepFns.peekAsk || askTraced)(url, q, { signal: ac.signal });
      } finally {
        if (masked) await post({ keep: null }).catch(() => {});
        if (perWordSet) await perWordSend(url, null).catch(() => {});
      }
      this.peekTraceOk = true;
      const t = tallyTrace(got.trace, got.tokens, { experts: facts.experts, layers: facts.layers });
      let tallied = null;
      if (tally) {
        if (!s.sha) s.sha = await (this.stepFns.fingerprint || sha256File)(brain.gguf, ac.signal);
        tallied = addToTally(this.cfg, brain, { sha256: s.sha, facts, counts: t.counts, tokens: t.words.length, when: new Date(this.now()).toISOString().slice(0, 10) });
      }
      return { answer: got.answer, words: t.words, lit: t.lit, counts: t.counts, used: t.used, share: t.share, tps: Math.round((Number(got.tps) || 0) * 10) / 10, where: s.srv.where || '', masked, perWord, ownPerWord: facts.used || null, perWordGuess: perWord === null ? '' : speedGuessWords(facts.used, perWord, facts.expertShare ? { expertShare: facts.expertShare } : {}), tallied: tallied && { tokens: tallied.tokens, keepFile: path.basename(tallied.keepFile) } };
    } catch (e) {
      if (e.message === NO_TRACE) { this.peekTraceOk = false; this.freePeek(); }
      throw e;
    } finally {
      this.job = null;
      if (this.peekSrv) this.peekSrv.timer = setTimeout(() => this.freePeek(), IDLE_MS).unref?.();
    }
  },
  // A keep file for Cut these out: the tally's (default), or one from a lit-up set the page sends.
  peekKeep({ brain: id, counts = null } = {}) {
    const brain = this.brains().find((b) => b.id === String(id || ''));
    if (!brain) throw new Error('Pick a brain first.');
    const facts = inspect(brain);
    if (Array.isArray(counts) && counts.length) {
      const layers = keepFromLit(counts, facts);
      const file = path.join(usageFolder(this.cfg, brain), `${slugOf(brain.name)}-lit-keep.json`);
      writeJson(file, { name: `${brain.name} (lit experts)`, experts: layers.find(Boolean)?.length || 0, layers, source: 'peek', brain: { name: brain.name } });
      return { file, experts: layers.find(Boolean)?.length || 0 };
    }
    const file = keepFileOf(this.cfg, brain);
    if (!fs.existsSync(file)) throw new Error('There\'s no tally for this brain yet. Tick Keep count and ask it a few things first, or run the usage map.');
    const j = readJson(file, {});
    return { file, experts: Number(j.experts) || 0 };
  },
};
