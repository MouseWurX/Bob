// "Do not save the file" (1.5.208 PC check): the owner asked for text typed into Notepad and said not to save it, and
// Bob still asked to make a file. A check in code, not a rule in Bob's prompt: when the ask says not to save, the
// tools that write files say so and do nothing, and the long-typing note doesn't offer a file.
const NO = String.raw`(?:do\s*n[o']?t|don[’']t|do not|never|no need to|without|not)`;
const FILE = String.raw`(?:(?:a|any|the|it|this|that|to a|as a|it to a|it as a)\s+)?(?:new\s+)?(?:files?|documents?|copy|copies|txt|\.txt)`;
const SAYS = new RegExp(String.raw`\b${NO}\s+(?:(?:to|be|bother(?:ing)?\s+to)\s+)?(?:sav(?:e|ing|ed)\b(?!\s+(?:me|you|us|time|money|space|energy))|creat(?:e|ing)\s+${FILE}|mak(?:e|ing)\s+${FILE}|writ(?:e|ing)\s+(?:it\s+)?(?:to|in|into)\s+${FILE}|keep(?:ing)?\s+${FILE})|\bno\s+(?:need\s+for\s+(?:a\s+)?)?(?:files?|saving)\b|\bunsaved\b`, 'i');

// True when the words of the ask say not to save (or not to make a file).
export function saysNoSave(text) { return SAYS.test(String(text || '').replace(/\s+/g, ' ').slice(0, 4000)); }

// The tools that save a file. Media makers (pictures, music) are left out: making the thing is what was asked.
export const SAVING_TOOLS = new Set(['write_file', 'edit_file', 'office_make', 'office_edit', 'save_spreadsheet', 'convert_file']);

// What a saving tool says instead, when the ask said not to save.
export const noSaveLine = (who = 'the user') => `Not done: ${who} said not to save a file this time, so nothing was saved. Do the job without a file (type it, or give it in the chat). Don't offer a file or ask to save one; ${who} can still ask for one later.`;
