// Share a chat (Topics, Past chats; src/chat-files.js shareChat): Bob takes out names, folders and addresses, the
// window shows the page before anything is saved, and saves it as a page (.html) or draws it as a picture (.png).
// Nothing is sent anywhere: the file lands wherever this browser, Bob's window or the phone saves downloads.

// Lines that fit a width, for the picture. measure(text) gives a width in pixels.
export function fitLines(text, maxW, measure) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      const next = line + word;
      if (measure(next) <= maxW || !line.trim()) {
        if (measure(next) <= maxW) { line = next; continue; }
        // one word wider than the line: cut it
        let rest = next;
        while (measure(rest) > maxW) { let n = rest.length; while (n > 1 && measure(rest.slice(0, n)) > maxW) n--; out.push(rest.slice(0, n)); rest = rest.slice(n); }
        line = rest;
        continue;
      }
      out.push(line.trimEnd());
      line = /^\s+$/.test(word) ? '' : word;
    }
    out.push(line.trimEnd());
  }
  return out;
}

export const PICTURE = { width: 900, pad: 32, maxHeight: 14000, font: 16, lead: 23 };

// Where every bubble and line goes in the picture, newest kept when it gets too tall: { height, items, left }.
export function pictureLayout(chat, measure, P = PICTURE) {
  const inner = P.width - P.pad * 2, bubbleW = Math.round(inner * 0.86), textW = bubbleW - 28;
  const blocks = chat.messages.map((m) => {
    const lines = fitLines(m.text + (m.media || []).map((x) => `\n(${x.kind || 'file'}: ${x.name})`).join(''), textW, measure);
    return { you: m.role === 'user', who: m.role === 'user' ? 'Me' : 'Bob', lines, h: 20 + 22 + lines.length * P.lead };
  });
  const head = 90, foot = 50, gap = 12;
  let used = head + foot, keep = [];
  for (let i = blocks.length - 1; i >= 0; i--) { if (used + blocks[i].h + gap > P.maxHeight && keep.length) break; used += blocks[i].h + gap; keep.unshift(blocks[i]); }
  let y = head;
  const items = keep.map((b) => { const x = b.you ? P.pad + inner - bubbleW : P.pad; const it = { ...b, x, y, w: bubbleW }; y += b.h + gap; return it; });
  return { height: y + foot, items, left: blocks.length - keep.length, bubbleW };
}

// Draw the picture on a canvas; returns the canvas. Light colours, so it reads the same in any app it's sent to.
export function drawPicture(chat, doc = document, P = PICTURE) {
  const cv = doc.createElement('canvas'), ctx = cv.getContext('2d');
  const font = (w = 400, size = P.font) => `${w} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.font = font();
  const lay = pictureLayout(chat, (t) => ctx.measureText(t).width, P);
  cv.width = P.width; cv.height = lay.height;
  ctx.fillStyle = '#f6f5f2'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1d1d1f'; ctx.font = font(700, 24); ctx.fillText(chat.title.slice(0, 70), P.pad, 28);
  ctx.fillStyle = '#6b6b70'; ctx.font = font(400, 13);
  ctx.fillText(`A chat with Bob. ${lay.left ? `The last ${lay.items.length} of ${chat.messages.length} messages.` : `${chat.messages.length} messages.`}`, P.pad, 60);
  for (const it of lay.items) {
    ctx.fillStyle = it.you ? '#e3eef6' : '#ffffff'; ctx.strokeStyle = '#dddddd';
    ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(it.x, it.y, it.w, it.h, 12) : ctx.rect(it.x, it.y, it.w, it.h)); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1d1d1f'; ctx.font = font(600, 13); ctx.fillText(it.who, it.x + 14, it.y + 10);
    ctx.font = font();
    it.lines.forEach((l, i) => ctx.fillText(l, it.x + 14, it.y + 32 + i * P.lead));
  }
  ctx.fillStyle = '#6b6b70'; ctx.font = font(400, 12);
  ctx.fillText('Shared from Bob. Names, folders and addresses were taken out.', P.pad, lay.height - 34);
  return cv;
}

// Hand the browser a file to save.
export function saveBlob(blob, name, doc = document) {
  const a = doc.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  doc.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
