// Lamplight build names (the owner, Nov 12 2026): "Lamplight N1bN2", N1 = Lamplight's own build number and
// N2 = the llama.cpp build it is built on, so "Lamplight 5b12282" is build 5 on llama.cpp b12282. Starts with the
// next engine build; the builds before keep the names they shipped with. Shared by the server and Settings, Engines,
// and always read from the release name of the build that is installed (its bob-brainengine.json marker), never typed in.
//   brain-engine-5b12282  build 5 on llama.cpp b12282  -> "Lamplight 5b12282"
//   brain-engine-v4       builds 3 and 4 (as shipped)   -> "Lamplight 4"
//   brain-engine-b12282   builds 1 and 2, named by llama -> "Lamplight on llama.cpp b12282"
export function lamplightBuild(tag) {
  const s = String(tag || '').trim();
  let m = /^(?:lamplight|brain-engine)-(\d+)b(\d+)$/.exec(s);
  if (m) return { n: Number(m[1]), llama: `b${m[2]}`, short: `${m[1]}b${m[2]}`, ll: `LL${m[1]}b${m[2]}`, name: `Lamplight ${m[1]}b${m[2]}` };
  m = /^brain-engine-v(\d+)$/.exec(s);
  if (m) return { n: Number(m[1]), llama: '', short: m[1], name: `Lamplight ${m[1]}` };
  m = /^brain-engine-(b\d+)$/.exec(s);
  if (m) return { n: 0, llama: m[1], short: `on llama.cpp ${m[1]}`, name: `Lamplight on llama.cpp ${m[1]}` };
  return null;
}
// The name for a release tag, or the tag itself when it isn't a Lamplight one.
export const lamplightName = (tag) => lamplightBuild(tag)?.name || String(tag || '');
// The release name a build gets: lamplightTag(5, 'b12282') = 'brain-engine-5b12282' (brain-engine.yml does the same).
export const lamplightTag = (n, llamaTag) => `lamplight-${Number(n)}b${String(llamaTag || '').replace(/^b/, '')}`;
// Is the running engine the build its name says? llama-server reports the llama.cpp build it was made from (/props
// build_info, "b12282-1a2b3c4"; the Lamplight workflow sets that number to the tag's). true or false when both
// say a llama.cpp build, null when either doesn't (older names carry none).
export function buildMatches(tag, buildInfo) {
  const want = lamplightBuild(tag)?.llama;
  const m = /^b?(\d+)/.exec(String(buildInfo || '').trim());
  if (!want || !m) return null;
  return want === `b${m[1]}`;
}
