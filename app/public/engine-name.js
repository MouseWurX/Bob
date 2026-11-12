// Brain Engine build names (the owner, Nov 12 2026): "Brain Engine N1bN2", N1 = Brain Engine's own build number and
// N2 = the llama.cpp build it is built on, so "Brain Engine 5b12282" is build 5 on llama.cpp b12282. Starts with the
// next engine build; the builds before keep the names they shipped with. Shared by the server and Settings, Engines,
// and always read from the release name of the build that is installed (its bob-brainengine.json marker), never typed in.
//   brain-engine-5b12282  build 5 on llama.cpp b12282  -> "Brain Engine 5b12282"
//   brain-engine-v4       builds 3 and 4 (as shipped)   -> "Brain Engine 4"
//   brain-engine-b12282   builds 1 and 2, named by llama -> "Brain Engine on llama.cpp b12282"
export function brainEngineBuild(tag) {
  const s = String(tag || '').trim();
  let m = /^brain-engine-(\d+)b(\d+)$/.exec(s);
  if (m) return { n: Number(m[1]), llama: `b${m[2]}`, short: `${m[1]}b${m[2]}`, name: `Brain Engine ${m[1]}b${m[2]}` };
  m = /^brain-engine-v(\d+)$/.exec(s);
  if (m) return { n: Number(m[1]), llama: '', short: m[1], name: `Brain Engine ${m[1]}` };
  m = /^brain-engine-(b\d+)$/.exec(s);
  if (m) return { n: 0, llama: m[1], short: `on llama.cpp ${m[1]}`, name: `Brain Engine on llama.cpp ${m[1]}` };
  return null;
}
// The name for a release tag, or the tag itself when it isn't a Brain Engine one.
export const brainEngineName = (tag) => brainEngineBuild(tag)?.name || String(tag || '');
// The release name a build gets: brainEngineTag(5, 'b12282') = 'brain-engine-5b12282' (brain-engine.yml does the same).
export const brainEngineTag = (n, llamaTag) => `brain-engine-${Number(n)}b${String(llamaTag || '').replace(/^b/, '')}`;
// Is the running engine the build its name says? llama-server reports the llama.cpp build it was made from (/props
// build_info, "b12282-1a2b3c4"; the Brain Engine workflow sets that number to the tag's). true or false when both
// say a llama.cpp build, null when either doesn't (older names carry none).
export function buildMatches(tag, buildInfo) {
  const want = brainEngineBuild(tag)?.llama;
  const m = /^b?(\d+)/.exec(String(buildInfo || '').trim());
  if (!want || !m) return null;
  return want === `b${m[1]}`;
}
