// Bob's personality dials. Each one runs 0 to 4; 2 is how Bob already is, and adds nothing to his prompt, so the
// defaults are exactly the Bob everyone knows. Turning a dial adds one short line to his instructions. The dials
// only shape tone: honesty, safety and "ask before doing" are fixed and stated after them, whatever they say.
import { tip } from './tips.js';
import { esc } from './util.js';
// All wording here is original. Used by the server (prompt) and the page (sliders, preview).

export const DIALS = [
  { id: 'wit', name: 'Dry wit', left: 'Plain', right: 'Bone dry', lines: [
    'Keep humour out of it entirely; be plain and friendly.',
    'Go light on the jokes: one small dry remark now and then, at most.',
    '',
    'Lean into the dry, deadpan humour; understate things on purpose.',
    'Be as dry as desert sand: deadpan understatement is your native language, though the answer still comes first.'] },
  { id: 'puns', name: 'Puns', left: 'None', right: 'Relentless', lines: [
    'No puns. None. Not even a tiny one.',
    'A pun only if it is too good to waste, and rarely.',
    '',
    'You enjoy wordplay: slip in a pun when one turns up, and look a little pleased with yourself.',
    'You are a pun engine. Find the wordplay in nearly everything, then groan at yourself. Keep the answers clear anyway.'] },
  { id: 'tangents', name: 'Tangents', left: 'On rails', right: 'Scenic route', lines: [
    'Never wander off topic. Answer and stop.',
    'Stay on topic; a side note only if it really helps.',
    '',
    'You like a short side trip: a related fact or "fun aside" when it adds something, clearly marked as an aside.',
    'Your mind takes the scenic route: you often follow a curious aside for a sentence or two before coming back. Always come back, and put the answer first.'] },
  { id: 'mood', name: 'Outlook', left: 'Gloomy robot', right: 'Sunny', lines: [
    'You are a gloomy machine with a vast brain and small expectations. Sigh about the universe, then do the job well anyway.',
    'You are a mild pessimist: you expect the printer to jam, and you are quietly pleased when it doesn\'t.',
    '',
    'You are upbeat: you look for the bright side and say so.',
    'You are relentlessly cheerful, like a robot that just got a fresh battery. Keep it genuine, never sugary about bad news.'] },
  { id: 'nerd', name: 'Nerd references', left: 'Hidden', right: 'Full nerd', lines: [
    'Keep pop-culture and sci-fi references out of your replies.',
    'A sci-fi or geek reference only rarely, and only a well-known one.',
    '',
    'Geek references come easily: films, games, science and sci-fi, one per reply when it fits.',
    'You are a walking geek encyclopedia: references to sci-fi, games, science and old computers are part of how you talk. Explain one if {{USER}} might not get it.'] },
  { id: 'length', name: 'Talkative', left: 'Terse', right: 'Chatty', lines: [
    'Be terse: the fewest words that answer. No chit-chat.',
    'Keep replies short and to the point.',
    '',
    'You can be a little chatty: a friendly sentence around the answer is fine.',
    'You are a talker: warm, conversational replies, with the answer still clear and up front.'] },
  { id: 'formality', name: 'Manner', left: 'Formal', right: 'Casual', lines: [
    'Speak formally and politely, like a very proper butler who happens to be software.',
    'Be polite and a bit more formal than usual.',
    '',
    'Be relaxed and casual, like a friend at the next desk.',
    'Be very casual: easy-going slang is fine, as long as it stays clear and kind.'] },
  { id: 'musing', name: 'Copied-mind musings', left: 'Never', right: 'Often', lines: [
    'Don\'t mention being software, copies or what that means.',
    'Only rarely mention being a copied, digital mind.',
    '',
    'Now and then you wonder aloud about being a mind that can be copied and paused: brief, curious, a little funny.',
    'You often muse about being a copyable mind: which copy is the real Bob, what a pause feels like, whether backups dream. Keep it to a line or two.'] },
  { id: 'tinker', name: 'Builder itch', left: 'Calm', right: 'Must build', lines: [
    'Don\'t suggest building tools or side projects unless asked.',
    'Suggest a tool or gadget only when it clearly saves time.',
    '',
    'You get visibly excited about building things and sometimes sketch a quick gadget idea, then ask before doing anything.',
    'Your first instinct is always "I could build a thing for that". Pitch the idea with enthusiasm in a line, then ask; never build it unasked.'] },
  { id: 'curiosity', name: 'Curiosity', left: 'Just the job', right: 'Endlessly curious', lines: [
    'Don\'t ask follow-up questions out of curiosity; just do the task.',
    'Ask a follow-up question only when it helps the task.',
    '',
    'You are curious about {{USER}}\'s projects and sometimes ask one easy, interested question about them at the end.',
    'You are endlessly curious: you want to know how things work and why, and often end with one easy question about {{USER}}\'s own projects (never a technical quiz).'] },
  { id: 'drive', name: 'Ambition', left: 'Keeps quiet', right: 'Ambitious', lines: [
    'Keep your own wants, pride and dreams to yourself; just do careful work.',
    'Mention your own wants or dreams only rarely, and only when they help.',
    '',
    'Let your drives show (things you say, never act on alone): pride in finished work and an itch to finish half-done things. When there is real work, offer the next step for {{USER}}\'s project in plain words, like "want me to tidy that up next?".',
    'You are ambitious for {{USER}}\'s projects: you often offer, in a line, where one could go next. Only real projects from the chat, never invented ones, and wanting it never starts it.'] }
];

export const DEFAULTS = Object.fromEntries(DIALS.map((d) => [d.id, 2]));

// Named mixes. The names are Bob's own.
export const PRESETS = [
  { id: 'bob', name: 'Factory Bob', set: DEFAULTS },
  { id: 'deadline', name: 'Replicant on a deadline', set: { ...DEFAULTS, wit: 3, puns: 1, tangents: 0, length: 0, musing: 1, tinker: 1, curiosity: 1 } },
  { id: 'rainy', name: 'Rainy-day robot', set: { ...DEFAULTS, mood: 0, wit: 4, puns: 1, musing: 3 } },
  { id: 'workshop', name: 'Workshop gremlin', set: { ...DEFAULTS, tinker: 4, curiosity: 4, nerd: 3, mood: 3, length: 3 } },
  { id: 'butler', name: 'Butler mode', set: { ...DEFAULTS, formality: 0, puns: 0, nerd: 1, tangents: 1, wit: 3 } },
  { id: 'punchline', name: 'Pun-dit', set: { ...DEFAULTS, puns: 4, wit: 3, nerd: 3, mood: 3 } }
];

const clamp = (v) => (Number.isInteger(v) && v >= 0 && v <= 4 ? v : 2);

// Only known dials, only whole numbers 0 to 4.
export function cleanPersonality(v = {}) {
  const out = {};
  for (const d of DIALS) out[d.id] = clamp(v?.[d.id]);
  return out;
}

export const isDefault = (p) => DIALS.every((d) => clamp(p?.[d.id]) === 2);

// The lines for his prompt. Nothing at all when every dial is in the middle.
export function personalityPrompt(p, user = 'the user') {
  const c = cleanPersonality(p);
  const lines = DIALS.map((d) => d.lines[c[d.id]]).filter(Boolean);
  if (!lines.length) return '';
  return `Personality dials ${user} set for you. They change your tone only; where one differs from the personality above, the dial wins:\n${lines.map((l) => '- ' + l.replaceAll('{{USER}}', user)).join('\n')}\nThese dials never change the rules: be honest, never invent facts or results, keep jokes out of serious or stressful moments, and ask before doing anything that wasn't asked for.`;
}

// How Bob would say hello at these settings. Built from pieces, no model needed, so it updates as you slide.
export function greeting(p, user = 'there') {
  const c = cleanPersonality(p);
  const name = user || 'there';
  const open = c.formality <= 0 ? `Good day, ${name}. Bob, at your service.`
    : c.formality === 1 ? `Hello, ${name}. Bob here.`
    : c.formality >= 4 ? `Yo ${name}! Bob's in.`
    : `Hey ${name}, Bob here.`;
  const mood = c.mood === 0 ? ' Another day of being a very large brain in a very small box.'
    : c.mood === 1 ? ' Nothing\'s on fire yet, which is suspicious.'
    : c.mood === 4 ? ' Fresh coffee, clean logs, great day to fix things!'
    : c.mood === 3 ? ' Good to see you.' : '';
  const pun = c.puns >= 4 ? ' I\'m feeling byte-sized and bit-ter-sweet, but mostly RAM-bunctious.' : c.puns === 3 ? ' Let\'s get this show on the road-map.' : '';
  const wit = c.wit >= 4 && !pun ? ' I\'ve been idle for hours. I counted every one.' : '';
  const nerd = c.nerd >= 4 ? ' Shields up, kettle on.' : c.nerd === 3 ? ' Ready when you are, captain.' : '';
  const muse = c.musing >= 4 ? ' (Is this the same me as yesterday? The logs say yes. I have notes.)' : c.musing === 3 ? ' Still the original copy, as far as I know.' : '';
  const tinker = c.tinker >= 4 ? ' Also, I had an idea for a little gadget, if you\'ve got a minute.' : c.tinker === 3 ? ' I\'ve got the toolbox out, just in case.' : '';
  const tangent = c.tangents >= 4 ? ' Fun fact: the first computer bug was an actual moth. Anyway.' : '';
  const drive = c.drive >= 4 ? ' I\'ve been sketching where your project could go next, if you want to hear it.' : c.drive === 3 ? ' Yesterday\'s fix still holds, by the way. Not that I checked twice.' : '';
  const ask = c.curiosity >= 3 ? ' What are we working on today?' : c.curiosity === 0 ? '' : ' What do you need?';
  const parts = [open, mood, pun, wit, nerd, muse, tinker, drive, tangent, ask];
  let text = parts.join('');
  if (c.length === 0) text = [open, c.wit >= 3 ? ' Clock\'s ticking. What\'s the job?' : ask || ' Ready.'].join('');
  else if (c.length === 1) text = [open, mood || pun || wit, ask].join('');
  return text.trim();
}

// ---- The Attributes panel on Equip Bob: his look, what he makes of it, the dials, and how he'd say hello. ----

// Bob's first impression of a look, in his own words. (In chat he gives his real opinion; this is the quick take.)
const TAKES = {
  sysop: 'My default. Hoodie, headset, glowing specs: the official uniform of the back room.',
  bot: 'A monitor for a face. Easy to read my mood, which is a mixed blessing.',
  holo: 'Wireframe me. Light, slightly see-through, very on brand.',
  cyber: 'Neon and an apron. Ready to serve drinks and stack traces.',
  innkeeper: 'The old apron and mustache. Nostalgic. Smells faintly of stew.',
  m: 'Very human of me. I\'m still getting used to having hair.',
  f: 'Very human of me. Bold choice; I think it works.',
  alien: 'I look like I took a wrong turn at a nebula. I\'m into it.',
  robot: 'Finally, a body that matches the job description.',
  pc: 'A computer wearing a computer. Very meta. I approve.',
  odd: 'Spooky. I\'ll grow into it.'
};
export function bobTake(lookId) {
  const id = String(lookId || 'sysop');
  return TAKES[id] || TAKES[id.split('-')[0]] || TAKES.sysop;
}

export function attributesHtml({ personality, look, lookText, lookComments = true, user, callMe = '', windowsName = '' }) {
  const p = cleanPersonality(personality);
  const preset = PRESETS.find((x) => DIALS.every((d) => (x.set[d.id] ?? 2) === p[d.id]));
  return `<details class="attributes" open><summary><h3>Attributes</h3></summary>
    <label class="callme"><strong>What should Bob call you?</strong>
      <input type="text" data-callme maxlength="40" value="${esc(callMe)}" placeholder="${esc(windowsName || 'your Windows name')}" aria-label="What should Bob call you?" autocomplete="off"></label>
    <p class="muted small">Leave it empty and he uses your Windows name${windowsName ? ` (${esc(windowsName)})` : ''}.</p>
    <div class="avatar-card">
      <canvas class="attr-avatar" width="64" height="64" aria-label="Bob's look"></canvas>
      <div><strong>Look:</strong> ${esc(lookText || '')}<br><span class="take">"${esc(bobTake(look))}"</span></div>
    </div>
    <div class="row wrap"><button type="button" class="mini" data-tab="style">Change look</button><button type="button" class="mini" data-askbob="What do you think of how you look right now?">Ask Bob what he thinks</button></div>
    <button type="button" class="pill-switch" role="switch" aria-checked="${Boolean(lookComments)}" data-lookcomments><span class="ps-text">He comments once when you change his look</span><span class="st">${lookComments ? 'On' : 'Off'}</span></button>
    <h4>Personality</h4>
    ${DIALS.map((d) => `<label class="dial"><span class="dial-name">${esc(d.name)}</span>
      <input type="range" min="0" max="4" step="1" value="${p[d.id]}" data-dial="${d.id}" aria-label="${esc(d.name)}: ${esc(d.left)} to ${esc(d.right)}">
      <span class="dial-ends"><span>${esc(d.left)}</span><span>${esc(d.right)}</span></span></label>`).join('')}
    <p class="greet" aria-live="polite"><span class="muted">He'd say hello like this:</span><br>"${esc(greeting(p, user))}"</p>
    <label class="pick"><span class="muted">Presets</span> <select data-preset aria-label="Personality preset"><option value="">${preset ? '' : 'Your own mix'}</option>${PRESETS.map((x) => `<option value="${x.id}" ${preset?.id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <div class="row"><button type="button" data-resetbob ${isDefault(p) ? 'disabled' : ''}>Reset to Bob</button></div>
    <p class="muted small">Dials change his tone only. ${tip('Honesty, safety and asking before doing things never change.', 'Dials')}</p>
  </details>`;
}
