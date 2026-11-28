// Nov 26 "our own copy of llama.cpp": llama.cpp's tested release (bundledLlamaTag) is saved on Bob's own GitHub as
// the pre-release llama.cpp-<tag> (.github/workflows/llama-copy.yml). Bob asks ggml-org first and our copy only when
// ggml-org fails; builds and rental pods use our copy first (app/engine/fetch-llama.sh). No real network here.
// Run: node test/run-llama-copy-test.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRelease, ENGINES, engineFor, TESTED_LLAMA, LLAMA_COPY_REPO } from '../src/engines.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };

const pkg = JSON.parse(read('package.json'));
check(/^[0-9a-f]{40}$/.test(pkg.bob.bundledLlamaSha || ''), `the tested llama.cpp commit is pinned in full (${pkg.bob.bundledLlamaSha})`);
check(LLAMA_COPY_REPO === 'MouseWurX/Bob', 'our saved copy lives on Bob\'s own GitHub');

// A Windows llama.cpp entry, whatever computer runs the test.
const e = { ...engineFor(ENGINES.find((x) => x.id === 'llamacpp'), 'win', 'x64'), tag: TESTED_LLAMA };
const zip = { name: `llama-${TESTED_LLAMA}-bin-win-vulkan-x64.zip`, size: 1, digest: 'sha256:' + 'a'.repeat(64), browser_download_url: 'https://github.com/x/y/releases/download/t/z.zip' };
const fake = (upOk, oursOk) => {
  const asked = [];
  const f = async (u) => {
    asked.push(String(u));
    const ours = String(u).includes(`/repos/${LLAMA_COPY_REPO}/releases/tags/llama.cpp-`);
    const ok = ours ? oursOk : upOk;
    return { ok, status: ok ? 200 : 404, json: async () => ({ tag_name: ours ? `llama.cpp-${TESTED_LLAMA}` : TESTED_LLAMA, prerelease: ours, assets: [zip] }) };
  };
  return { asked, f };
};
const run = async (upOk, oursOk, entry = e) => { const { asked, f } = fake(upOk, oursOk); try { return { asked, r: await findRelease(entry, false, undefined, f) }; } catch (err) { return { asked, err }; } };

{
  const { asked, r } = await run(true, true);
  check(asked.length === 1 && asked[0].includes('/repos/ggml-org/llama.cpp/releases/tags/') && !r.rel.savedCopy, 'ggml-org answers: Bob never asks our copy');
}
{
  const { asked, r } = await run(false, true);
  check(asked.length === 2 && asked[1].endsWith(`/repos/${LLAMA_COPY_REPO}/releases/tags/llama.cpp-${TESTED_LLAMA}`), 'ggml-org fails: Bob asks our saved copy next');
  check(r?.rel.tag_name === TESTED_LLAMA && r.rel.savedCopy === true && r.asset.name === zip.name && r.asset.digest === zip.digest, 'and takes the same file, with its checksum, still named as the tested build');
}
{
  const { asked, err } = await run(false, false);
  check(asked.length === 2 && /GitHub didn't answer for llama\.cpp \(404\)/.test(err?.message || ''), 'both fail: the error is ggml-org\'s, as before');
}
{
  const { asked, err } = await run(false, true, { ...e, tag: 'b9999' });
  check(asked.length === 1 && err, 'another tag (not the tested one) has no saved copy to ask');
}
{
  const sd = { ...engineFor(ENGINES.find((x) => x.id === 'sdcpp'), 'win', 'x64'), tag: 'master-1' };
  const { asked } = await run(false, true, sd);
  check(asked.length === 1, 'other engines never ask our copy');
}

// Builds: every llama.cpp source fetch goes through fetch-llama.sh (ours first, ggml-org second, the commit checked).
const sh = read('engine/fetch-llama.sh');
check(/MouseWurX\/Bob\/releases\/download\/llama\.cpp-\$tag/.test(sh) && sh.indexOf('l.bundle') < sh.indexOf('--depth 1 --branch "$tag" "$upstream"'), 'fetch-llama.sh tries our copy before ggml-org');
check(/SHA256SUMS/.test(sh) && /Bob pins \$want\. Stopped\./.test(sh), 'and checks the bundle\'s checksum and the pinned commit');
const be = read('../.github/workflows/brain-engine.yml');
check(!/git clone[^\n]*ggml-org\/llama\.cpp/.test(be) && (be.match(/bash app\/engine\/fetch-llama\.sh "\$tag" llama\.cpp/g) || []).length >= 3, 'Lamplight builds fetch llama.cpp only through fetch-llama.sh');
check(/gh release view "llama\.cpp-\$tag" -R "\$GITHUB_REPOSITORY"/.test(be), 'and read the CUDA version from our copy when ggml-org is gone');
const wf = read('../.github/workflows/llama-copy.yml');
check(/workflow_dispatch/.test(wf) && !/^\s+(push|pull_request|schedule):/m.test(wf), 'saving the copy runs only by hand');
check(/--prerelease --latest=false/.test(wf), 'the copy is a pre-release, never Bob\'s latest (so Bob\'s own updates never see it)');
check(/"sha256:\$got" != "\$digest"/.test(wf) && /LICENSE-llama\.cpp/.test(wf), 'each official file is checked against GitHub\'s sha256, and the MIT licence goes with it');
check(/LLAMA_COPY_ONLY=1/.test(wf), 'and the copy is proven to work without ggml-org');
for (const f of ['model-lab/forge/pod/llama-tools.sh', 'model-lab/forge/pod/aifeui.sh']) {
  const t = read(f);
  check(t.indexOf('MouseWurX/Bob/releases/download/llama.cpp-') > 0 && t.indexOf('MouseWurX/Bob/releases/download/llama.cpp-') < t.indexOf('github.com/ggml-org/llama.cpp', t.indexOf('MouseWurX/Bob/releases/download/llama.cpp-')), `${path.basename(f)} tries our copy first`);
}
check(/llama-cpp-map\.md/.test(read('engine/ENGINE-MAP.md')) && fs.existsSync(path.join(app, 'docs', 'llama-cpp-map.md')), 'the llama.cpp code map exists and the engine map points to it');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll llama.cpp copy checks passed.');
process.exit(failures ? 1 : 0);
