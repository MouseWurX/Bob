// Made by android/tools/make-shared.mjs from public/adventure-table.js. Don't edit.
(function () {
// 🎲 Adventure table rules on the page (1.5.206): the map that grows, drawn as a picture, and the rules card. No
// imports, so android/tools/make-shared.mjs copies it word for word to the phone as adv-table.js (globalThis.BobAdvTable).
// Everything here only draws what the server sends; nothing is decided on the page.

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cut = (s, n) => { const t = String(s || ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// The map: places on a grid, joined where the party walked, the party's spot ringed, and the ways on from here as short
// dashed stubs with their names. Colours come from the theme (currentColor and the page's own CSS variables).
function mapSvg(map, { exits = [], cell = 120, title = 'Map of the places the party has been' } = {}) {
  const nodes = map?.nodes || [];
  if (!nodes.length) return '';
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs) - 1, maxX = Math.max(...xs) + 1, minY = Math.min(...ys) - 1, maxY = Math.max(...ys) + 1;
  const w = (maxX - minX) * cell, h = (maxY - minY) * cell;
  const px = (n) => (n.x - minX) * cell, py = (n) => (n.y - minY) * cell;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const here = byId.get(map.at);
  const links = (map.links || []).map(([a, b]) => { const p = byId.get(a), q = byId.get(b); return p && q ? `<line class="adv-map-link" x1="${px(p)}" y1="${py(p)}" x2="${px(q)}" y2="${py(q)}"/>` : ''; }).join('');
  // Ways on: up to four stubs from where the party is, fanned out toward empty sides.
  let stubs = '';
  if (here) {
    const angles = [-30, 30, 150, 210, 90, 270];
    stubs = exits.slice(0, 4).map((e, i) => {
      const a = (angles[i] * Math.PI) / 180, x2 = px(here) + Math.cos(a) * cell * 0.5, y2 = py(here) + Math.sin(a) * cell * 0.5;
      return `<line class="adv-map-stub" x1="${px(here)}" y1="${py(here)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/><text class="adv-map-exit" x="${x2.toFixed(1)}" y="${(y2 + (Math.sin(a) > 0 ? 14 : -6)).toFixed(1)}" text-anchor="middle">${escHtml(cut(e, 22))}</text>`;
    }).join('');
  }
  const dots = nodes.map((n) => `<g class="adv-map-place${n.id === map.at ? ' adv-map-here' : ''}"><circle cx="${px(n)}" cy="${py(n)}" r="${n.id === map.at ? 12 : 8}"/><text x="${px(n)}" y="${py(n) + 28}" text-anchor="middle">${escHtml(cut(n.name, 26))}</text></g>`).join('');
  return `<svg class="adv-map-svg" viewBox="${-cell * 0.1} ${-cell * 0.1} ${w + cell * 0.2} ${h + cell * 0.2}" role="img" aria-label="${escHtml(title)}: ${escHtml(nodes.map((n) => n.name).join(', '))}${here ? `. The party is at ${escHtml(here.name)}` : ''}"><title>${escHtml(title)}</title>${links}${stubs}${dots}</svg>`;
}

// The rules card: the cards and their stats, the dice, hearts and plot armour, and this game's own rules, on one card.
const CARD_LINES = [['⚔ Attack', 'Might'], ['🛡 Defend', 'Might'], ['🤫 Sneak', 'Wits'], ['💬 Talk', 'Charm'], ['✨ Magic', 'Wits'], ['🎒 Use item', 'Luck'], ['🔍 Look closer', 'Wits'], ['🤝 Help an ally', 'Charm'], ['🏃 Run', 'Luck'], ['✍ Something else', 'Luck']];
function rulesCard({ rules = {}, difficulty = 'normal', names = {} } = {}) {
  const on = Object.entries(rules || {}).filter(([, v]) => v).map(([id]) => names.rules?.[id]).filter(Boolean);
  const d = names.difficulties?.[difficulty];
  return `<div class="adv-rules-card" role="note" aria-label="Rules card">
  <p><strong>🎲 The dice.</strong> d20 + the card's stat. <strong>15 or more</strong>: a hit. <strong>10 to 14</strong>: a hit, at a cost. <strong>Under 10</strong>: a miss. A good line of flair adds +2.</p>
  <p><strong>The cards.</strong> ${CARD_LINES.map(([c, s]) => `${escHtml(c)} <span class="muted">${s}</span>`).join(' · ')}</p>
  <p><strong>♥ Hearts.</strong> Everyone starts with five. In a fight a miss costs one, a natural 1 two. Enemies have hearts too; the app keeps count. At zero you choose: go out in style, or wake up captured.</p>
  <p><strong>Plot armour.</strong> None: the dice decide. Some: one bad roll a scene is rolled again. Lots: can't die. Legendary: never worse than a close call.</p>
  <p><strong>This game.</strong> ${d ? `${escHtml(d.name)}${difficulty === 'normal' ? '' : `: ${escHtml(d.what)}`}` : 'Normal'}${on.length ? ` · ${on.map((r) => `${escHtml(r.name)}: ${escHtml(r.what)}`).join(' · ')}` : ' · No table rules ticked.'}</p>
</div>`;
}

globalThis.BobAdvTable = { mapSvg, CARD_LINES, rulesCard };
})();
