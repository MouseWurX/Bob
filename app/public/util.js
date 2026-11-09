// Small helpers the pages share (1.5.10x: these were copied into 15 files).
// esc: makes text safe to put in the page. gb: a size in GB as people read it ("2.5 GB", "350 MB"; nothing for no size).
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const gb = (n) => (n == null ? '' : n >= 1 ? `${(+n).toFixed(n >= 10 ? 0 : 1)} GB` : `${Math.round(n * 1000)} MB`);
