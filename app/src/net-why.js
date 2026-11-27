// Nov 27 2026 (Where Bob connected: "which tool"). The tool that is running right now, carried along with everything it
// does (AsyncLocalStorage), so a connection it opens is written down with its name, and a connection No internet
// stopped can be named in the tool's own answer. Only the tool's name is kept: never its words, addresses or files.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();
// Runs fn with { tool, blocked: [] } as the current reason. Connections opened inside it (however deep) see it.
export const netWhyFor = (tool) => ({ tool: String(tool || '').slice(0, 80), blocked: [] });
export const inNetWhy = (s, fn) => store.run(s, fn);
export function withNetWhy(why, fn) {
  const s = netWhyFor(why?.tool);
  return { store: s, result: inNetWhy(s, fn) };
}
export const netWhyNow = () => store.getStore() || null;
