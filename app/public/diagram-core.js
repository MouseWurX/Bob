// 1.5.95 Diagrams, the drawing half (shared word for word with the phone app: android/app/src/main/assets/www/diagram-core.js).
// Mermaid (bundled in vendor/, MIT) draws Bob's diagram text into an SVG, here in the window; nothing goes online.
// It also turns the drawing into the files the Save as row offers: SVG, PNG (twice the size, for sharpness) and PDF
// (a one-page PDF holding the picture, made here without any extra library).
(function (root) {
  let loading = null;
  let n = 0;

  // Load Mermaid once, from Bob's own files. base: '/vendor/' on the PC, 'vendor/' in the phone app.
  function load(base) {
    if (root.mermaid) return Promise.resolve(root.mermaid);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${base}mermaid.min.js`;
      s.onload = () => {
        const m = root.mermaid;
        if (!m) return reject(new Error('Mermaid did not load.'));
        // strict: no scripts or clicks inside a diagram. htmlLabels off: plain SVG text, so PNG and PDF can be made from it.
        // Always the light look: the diagram sits on white in the chat, and saved files look the same anywhere.
        m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', htmlLabels: false, flowchart: { htmlLabels: false }, fontFamily: 'system-ui, sans-serif' });
        resolve(m);
      };
      s.onerror = () => { loading = null; reject(new Error('Mermaid did not load.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  // The diagram text (comment lines kept: Mermaid skips them) into an SVG string.
  async function draw(base, text) {
    const m = await load(base);
    const { svg } = await m.render(`bob-diagram-${Date.now().toString(36)}-${n++}`, String(text || ''));
    return svg;
  }

  // A standalone SVG file from the drawing.
  function svgFile(svgEl) {
    const c = svgEl.cloneNode(true);
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    c.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    const box = svgEl.getBBox ? svgEl.viewBox?.baseVal : null;
    if (box && box.width) { c.setAttribute('width', String(Math.ceil(box.width))); c.setAttribute('height', String(Math.ceil(box.height))); }
    c.style.maxWidth = '';
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(c);
  }

  // The drawing on a canvas with a plain background (PNG and PDF have no "see-through").
  function canvasOf(svgText, scale) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = Math.max(1, Math.ceil((img.naturalWidth || 800) * scale)), h = Math.max(1, Math.ceil((img.naturalHeight || 600) * scale));
        const cv = document.createElement('canvas');
        cv.width = Math.min(w, 8000); cv.height = Math.min(h, 8000);
        const g = cv.getContext('2d');
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv);
      };
      img.onerror = () => reject(new Error('The drawing could not be turned into a picture.'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
    });
  }
  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => { const t = atob(s); const u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };

  async function pngData(svgText) {
    const cv = await canvasOf(svgText, 2);
    return cv.toDataURL('image/png').split(',')[1];
  }

  // A one-page PDF with the picture on it, sized to the drawing.
  function pdfFromJpeg(jpeg, w, h, pageW, pageH) {
    const enc = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
    const parts = [], offsets = [];
    let len = 0;
    const push = (u) => { parts.push(u); len += u.length; };
    const W = pageW.toFixed(2), H = pageH.toFixed(2);
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
      null, // the picture
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    ];
    push(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    objs.forEach((o, i) => {
      offsets.push(len);
      if (o === null) {
        push(enc(`${i + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`));
        push(jpeg);
        push(enc('\nendstream\nendobj\n'));
      } else push(enc(`${i + 1} 0 obj\n${o}\nendobj\n`));
    });
    const xref = len;
    push(enc(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
    const out = new Uint8Array(len);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  async function pdfData(svgText) {
    const cv = await canvasOf(svgText, 2);
    const jpeg = unb64(cv.toDataURL('image/jpeg', 0.92).split(',')[1]);
    // The page is the drawing's own size in points (72 per inch, the drawing at 96 per inch), at most A3-ish wide.
    let pw = (cv.width / 2) * 0.75, ph = (cv.height / 2) * 0.75;
    const fit = Math.min(1, 1190 / Math.max(pw, ph));
    pw *= fit; ph *= fit;
    return b64(pdfFromJpeg(jpeg, cv.width, cv.height, pw, ph));
  }

  const api = { load, draw, svgFile, pngData, pdfData, pdfFromJpeg };
  root.BobDiagram = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
