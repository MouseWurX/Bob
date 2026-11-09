// Makes the catalog entry for ACE-Step 1.5's music models (Hugging Face ACE-Step/Ace-Step1.5), pinned to one commit,
// with every file's size and, for the big files, its sha256. Read-only on the network (Hugging Face's public API).
// Usage: node pin-ace.js [commit] > ace-entry.json   (no commit: the repo's newest one)
const REPO = 'ACE-Step/Ace-Step1.5';
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const commit = process.argv[2] || (await get(`https://huggingface.co/api/models/${REPO}`)).sha;
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('That is not a full commit id.');
const tree = await get(`https://huggingface.co/api/models/${REPO}/tree/${commit}?recursive=true`);
const files = tree.filter((x) => x.type === 'file' && !/^\.|\/\.|^README|\.md$|^assets\//i.test(x.path)).map((x) => {
  const f = { role: x.path, url: `https://huggingface.co/${REPO}/resolve/${commit}/${x.path.split('/').map(encodeURIComponent).join('/')}`, path: x.path, bytes: Number(x.lfs?.size ?? x.size) };
  if (/^[0-9a-f]{64}$/.test(x.lfs?.oid || '')) f.sha256 = x.lfs.oid; else f.sizeOnly = true; // small text files: the commit pin holds them
  return f;
});
const total = files.reduce((t, f) => t + f.bytes, 0);
console.log(JSON.stringify({ commit, sizeGB: Math.round(total / 1e8) / 10, files }, null, 2));
