// Maths in Bob's replies: finds the formulas a brain writes in LaTeX ($...$, $$...$$, \(...\), \[...\]) and draws them
// with KaTeX (bundled in vendor/katex/, MIT), here in the window. Nothing goes online.
// Shared word for word with the phone app (android/app/src/main/assets/www/math-core.js).
// No imports or exports: the page loads it with a <script> tag, the tests with import(); both read globalThis.BobMath.
(function (root) {
  let loading = null;
  let on = false;
  let output = 'htmlAndMathml';

  // Where the formulas are. Returns pieces in order: { text } or { tex, display, raw }.
  // Inline $...$ follows the usual rule so prices stay prices: the opening $ isn't followed by a space, the closing $
  // isn't after a space or before a digit, and it stays on one line ("$5 and $10" is money, "$x^2$" is maths).
  // \$ is a plain dollar sign. Inline `code` is left alone.
  function find(text) {
    const s = String(text ?? '');
    const out = [];
    let plain = '';
    let i = 0;
    const flush = () => { if (plain) out.push({ text: plain }); plain = ''; };
    const take = (open, close, display) => {
      const end = s.indexOf(close, i + open.length);
      if (end < 0) return false;
      const tex = s.slice(i + open.length, end);
      if (!tex.trim() || tex.length > 4000) return false;
      flush();
      out.push({ tex: tex.trim(), display, raw: s.slice(i, end + close.length) });
      i = end + close.length;
      return true;
    };
    while (i < s.length) {
      const c = s[i];
      if (c === '`') { // inline code: copy as it is
        const end = s.indexOf('`', i + 1);
        const nl = s.indexOf('\n', i + 1);
        if (end > 0 && (nl < 0 || end < nl)) { plain += s.slice(i, end + 1); i = end + 1; continue; }
      }
      if (c === '\\' && s[i + 1] === '$') { plain += '$'; i += 2; continue; }
      if (c === '\\' && s[i + 1] === '[' && take('\\[', '\\]', true)) continue;
      if (c === '\\' && s[i + 1] === '(' && take('\\(', '\\)', false)) continue;
      if (c === '$' && s[i + 1] === '$' && take('$$', '$$', true)) continue;
      if (c === '$' && s[i + 1] !== '$' && s[i + 1] && !/\s/.test(s[i + 1])) {
        let j = i + 1, end = -1;
        while (j < s.length && s[j] !== '\n') {
          if (s[j] === '\\') { j += 2; continue; }
          if (s[j] === '$') { if (!/\s/.test(s[j - 1]) && !/\d/.test(s[j + 1] || '') && s[j + 1] !== '$') end = j; break; }
          j++;
        }
        if (end > 0 && end - i - 1 <= 1000) {
          flush();
          out.push({ tex: s.slice(i + 1, end), display: false, raw: s.slice(i, end + 1) });
          i = end + 1;
          continue;
        }
      }
      plain += c;
      i++;
    }
    flush();
    return out;
  }

  // Load KaTeX once, from Bob's own files. base: '/vendor/katex/' on the PC, 'vendor/katex/' in the phone app.
  function load(base) {
    if (root.katex) return Promise.resolve(root.katex);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `${base}katex.min.css`;
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = `${base}katex.min.js`;
      js.onload = () => (root.katex ? resolve(root.katex) : reject(new Error('KaTeX did not load.')));
      js.onerror = () => { loading = null; reject(new Error('KaTeX did not load.')); };
      document.head.appendChild(js);
    });
    return loading;
  }

  // One formula as HTML. A formula KaTeX can't read is shown as the brain wrote it, in red, never as an error box.
  // trust off: no links, pictures or classes from inside a formula.
  // output: 'htmlAndMathml' on the PC (KaTeX's own look); 'mathml' in the phone app, whose page allows no inline
  // styles, so the phone's own maths drawing (MathML, built into Android's web view) does the layout.
  function html(tex, display, k = root.katex, how = output) {
    const esc = (x) => String(x).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    try {
      const out = k.renderToString(tex, { displayMode: display, throwOnError: true, trust: false, strict: 'ignore', output: how, maxSize: 20, maxExpand: 200 });
      return display ? `<div class="math-block">${out}</div>` : `<span class="math">${out}</span>`;
    } catch {
      return `<code class="math-bad" title="This formula couldn't be drawn">${esc(display ? `$$${tex}$$` : `$${tex}$`)}</code>`;
    }
  }

  // The drawing function the chat uses, or null while the switch is off or KaTeX hasn't loaded.
  const renderer = () => (on && root.katex ? html : null);
  const setOn = (v, how) => { on = v === true; if (how === 'mathml' || how === 'htmlAndMathml') output = how; };
  const isOn = () => on;

  root.BobMath = { find, load, html, renderer, setOn, isOn };
})(typeof window !== 'undefined' ? window : globalThis);
