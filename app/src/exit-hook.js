// Bob's shared exit hook for the engines it starts.
// 16 Nov: every engine's llama-server stops when Bob does, through ONE exit/SIGINT/SIGTERM hook for all of them. Each engine used to
// add its own three listeners, so a Lab run that makes an engine per job hit Node's MaxListenersExceededWarning (201 after 96 jobs).
// Weak references, so an engine nobody uses any more can still be freed.
const LIVE_ENGINES = new Set();
let exitHooked = false;
export function stopOnExit(engine, proc = process) {
  LIVE_ENGINES.add(new WeakRef(engine));
  if (exitHooked && proc === process) return;
  const stopAll = () => { for (const r of LIVE_ENGINES) { const e = r.deref(); if (!e) { LIVE_ENGINES.delete(r); continue; } try { e.child && e.child.kill(); } catch {} } };
  proc.on('exit', stopAll);
  for (const sig of ['SIGINT', 'SIGTERM']) proc.on(sig, () => { stopAll(); proc.exit(0); });
  if (proc === process) exitHooked = true;
  return stopAll;
}
