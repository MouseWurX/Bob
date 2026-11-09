// What the user means, in plain English (2026-11-04: "edit this picture" came back as a brand new picture).
// Cheap word checks, no extra model call. They never do anything on their own: they add the right tools,
// put a plain hint in front of the brain, and let make_image pick the right picture when the brain forgot to name one.

// Words that change something that's already there.
const CHANGE = /\b(?:edit|change|alter|modify|tweak|adjust|fix|touch(?:\s|-)?(?:it |this |that |him |her )?up|retouch|re-?colou?r|restyle|redo|rework|replace|swap|remove|erase|delete|lose|ditch|get rid of|take (?:\w+ ){0,3}(?:out|away|off)|cut (?:\w+ ){0,3}out|clean (?:\w+ ){0,2}up|crop|brighten|darken|lighten|sharpen|blur|upscale|enhance|photoshop|colou?ri[sz]e|add|put|stick|give (?:him|her|them|it|this|that|the \w+)|make (?:it|him|her|them|me|us|this|that|his|her|their|its|the \w+)|turn (?:it|him|her|them|this|that|the \w+)|(?:look|looks|looking) (?:like|more|less)|(?:a|another) version|instead|but (?:with|at|in|as|without|make|change|add|lose|remove)|without the|(?:with|minus) (?:a|an|the|some) )/i;

// Wishes about how a picture should be ("I want him to have wings", "the cat should be bigger").
const WISH = /\b(?:want|wish|should|could|would|can|try|instead|again|style of|in the style|more|less|bigger|smaller|larger|older|younger|taller|shorter|wider|zoom\w*|colou?r\w*|brighter|darker|warmer|cooler)\b/i;

// Words that point back at a picture already there ("this", "that one", "him").
const POINTS_BACK = /\b(?:it|its|this|that|these|those|him|his|her|hers|them|their|he|she|they|the (?:picture|image|photo|pic|one|painting|drawing|background|sky|colou?rs?|lighting|light|face|hair|hat|guy|girl|man|woman|cat|dog|tree|person|people)|last (?:one|picture|image|pic)|the (?!report|email|letter|file|doc\w*|song|code|list|message|text|story|essay|reply|answer|script|table|plan|bug|game|app|test\w*|server|folder)\w+)\b/i;

// Words that ask for a brand new picture.
const NEW_PICTURE = /\b(?:new|another|fresh|separate|different|second)\s+(?:one|picture|image|pic|photo|painting|drawing|wallpaper)\b|\bfrom scratch\b|\b(?:draw|paint|sketch|doodle|create|generate|render|make)\s+(?:me\s+)?(?:a|an|some|two|three|\d+)\s+(?!version\b|copy\b|variant\b|edit\b)/i;

// Questions about a picture (what is it, who made it): talk about it, don't change it.
const ASKING = /^\s*(?:what|who|where|when|why|which|is|are|does|do|did|how (?:old|many|much|big)|can you (?:see|tell|describe|read|identify)|describe|tell me|explain|i (?:want|need|would like|'d like) to know|rate|thoughts)\b(?![^?]*\b(?:make|change|edit|turn|add|remove|put|give)\b)/i;

// Not a picture edit: moving pictures, sound, privacy and file jobs that happen to mention a picture.
const OTHER_JOB = /\b(?:animate|animation|bring (?:it|this|that|her|him) to life|(?:make|have) (?:it|this|that|him|her) (?:move|dance|talk|walk)|video|clip|gif|movie|song|music|sound|location|gps|metadata|exif|hidden details|pdf|convert|rename|move (?:it|this|them) (?:to|into)|zip|send|email|post it|upload|remind\w*|reminders?|calendar|notes?|to-?do|lists?|remember|memory|shelf|save)\b/i;

// The user wants a picture changed: a picture attached now (pic) or one from a moment ago (recent).
// Returns false when nothing points at a picture, so ordinary chat never turns into an edit.
export function wantsPictureEdit(text, { pic = false, recent = false } = {}) {
  const t = String(text || '').trim();
  if (!t || (!pic && !recent)) return false;
  if (OTHER_JOB.test(t) || NEW_PICTURE.test(t) || ASKING.test(t)) return false;
  // Nothing attached, and the words are about writing ("make the report shorter"): not the picture from earlier.
  if (!pic && /\b(?:report|email|letter|file|doc\w*|song|lyrics|code|message|text|story|essay|reply|answer|script|table|plan|poem|summary|list)\b/i.test(t)) return false;
  if (/^\s*(?:this|that|same)\b.*\bbut\b/i.test(t)) return true; // "this but at night", "same thing but in summer"
  if (!CHANGE.test(t) && !WISH.test(t)) return false;
  // A picture attached right now: changing words or a wish are enough. One from earlier: the words must point back at it too.
  return pic || POINTS_BACK.test(t) || /^\s*(?:now|ok(?:ay)?|good|nice|great|love it|perfect|cool|yes|yeah|hmm+|actually|try again|again|but)\b/i.test(t)
    || (/^\s*(?:add|remove|lose|put|give|swap|replace|change|make)\b/i.test(t) && t.split(/\s+/).length <= 6); // "add a rainbow"
}

// The newest picture in this chat from just before this message: one the user attached, or one Bob made.
// msgs: the chat so far (without this message). within: how many messages back to look.
export function recentPicture(msgs, { findRef, findPainted, within = 8 } = {}) {
  const list = Array.isArray(msgs) ? msgs : [];
  for (let i = list.length - 1, n = 0; i >= 0 && n < within; i--, n++) {
    const m = list[i];
    if (!m || m.hidden) continue;
    if (m.role === 'assistant' && Array.isArray(m.media)) {
      const img = [...m.media].reverse().find((x) => x?.type === 'image' && x.name);
      const p = img && findPainted?.(img.name);
      if (p) return p;
    }
    if (m.role === 'user' && Array.isArray(m.refs) && m.refs.length) {
      const r = findRef?.(m.refs[m.refs.length - 1]);
      if (r) return r;
    }
  }
  return null;
}

// The plain hint the brain gets with the message when it's a picture edit.
export function editHint(names) {
  const list = names.map((n) => `"${n}"`).join(', ');
  return `[This is a picture edit. Call make_image with reference [${list}] and a short instruction saying only what to change (not a description of the whole picture). Don't paint a new picture.]`;
}
