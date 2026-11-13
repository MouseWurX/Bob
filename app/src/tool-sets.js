// Tool sets for each brain family (reliability, on by default; Settings, How Bob works, "Tool wording for each brain
// family"). Every family gets the same tools, with the same names and the same inputs, so a call runs the same way and
// a lesson never needs translating back. Only how the tools are worded changes:
//   - Qwen brains (Riker, Bill, Bobert...) and brains we don't know keep Bob's own wording, byte for byte.
//   - GPT-OSS gets short "Use when..." lines, with one worked example on the tools it mixes up (to-do or reminder,
//     where a file goes, plain text or an office file). It also lets an added tool group go after 1 message, not 3.
// A family's tool list is never longer in all than Bob's own (test/run-tool-sets-test.js): the examples are paid for
// by shorter lines elsewhere, so the start of a job stays inside its budget (test/run-start-budget-test.js). A family is picked by itself only after tool-score shows it
// fails less with its own wording (docs/TOOL-SETS.md has the numbers); until then it's `proven: false` and only used when named.
import { familyOf } from './model-family.js';
import { ggufInfo } from './gguf.js';

export const toolSetsOn = (cfg) => cfg?.toolSets !== false;

// family (model-family.js familyOf) -> its tool set. Families not listed use Bob's own wording.
export const SETS = {
  'gpt-oss': {
    label: 'GPT-OSS',
    // Nov 13, tool-score on the 120B (rented card, partial: 25 of 74 turns): its own wording 5/14 tool turns right,
    // Bob's wording 6/14. Not proven, so it's only used when named (the Lab's --tool-set gpt-oss), never picked by itself.
    proven: false,
    sticky: 1,
    use: {
      notice_board: "Use for {{USER}}'s to-do list (no set time). add = new items; done = tick one off (no read first); write = the whole board. Like: 'put milk on my list' -> {action:'add',content:'milk'}.",
      reminders: "Use when {{USER}} wants a pop-up at a set time. time = local YYYY-MM-DDTHH:mm. No time? That's a to-do: notice_board.",
      remember: 'Use when {{USER}} tells you a lasting fact about them. Not for tasks or times. Never secrets.',
      list_folder: 'Use to see what is in a folder. Full path; home is {{HOME}}.',
      read_file: 'Use to read a text file by its full path. Long files come in parts.',
      web_search: 'Use for anything current or that you are unsure of. Then fetch_page the best link.',
      fetch_page: 'Use to read one web page or online PDF by its URL. Long pages come in parts.',
      ask_user: 'Use only when a wrong guess would waste the job: one question, 2 to 6 choices.',
      write_file: 'Use to save plain text. path = full path with the file name, like {{HOME}}/Documents/plan.md. Word or Excel: office_make.',
      save_spreadsheet: 'Use to save a table as CSV in the ledger folder. Never overwrites. A real Excel file: office_make.',
      edit_file: 'Use to change part of a text file: find = exact text, there once (read it first); replace = new text.',
      office_read: 'Use to read a Word, Excel, PowerPoint, OpenDocument or PDF file.',
      office_make: 'Use to make a new Word, Excel, PowerPoint or PDF file. No path = Documents folder. Plain text: write_file.',
      office_edit: 'Use to change an existing Word, Excel or PowerPoint file. office_read it first. The original is backed up.',
      schedule_job: 'Use when Bob should do a job by himself later or again and again. Just a pop-up at a time: reminders.',
      make_diagram: 'Use to draw a flowchart or other diagram in chat, in Mermaid. To change it, send the whole diagram again.',
      search_files: "Use to find words inside {{USER}}'s files. Gives file and line number."
    }
  }
};

// The tool set a brain uses: { id, ...set } or null for Bob's own wording.
export function toolSetFor(cfg, model, { info, family } = {}) {
  if (!toolSetsOn(cfg)) return null;
  const fam = family || familyOf(model, info || null);
  const set = SETS[fam];
  if (!set || (set.proven === false && !family)) return null; // an unproven family is used only when named
  if (cfg?.toolSets?.[fam] === false) return null;
  return { id: fam, ...set };
}

// The brain file's family, when its file can be read (the engine's resolve), else from its name.
export function toolSetOfModel(cfg, engine, model) {
  let info = null;
  try { const g = engine?.resolve?.(model)?.gguf; if (g) info = ggufInfo(g); } catch {}
  return toolSetFor(cfg, model, { info });
}

// A tool's schema in a set's wording: only the description changes. Names, inputs and enums stay Bob's own.
// fill: for a list already filled in (the Lab's saved tool lists), what {{USER}} and {{HOME}} become.
export function inSet(schema, set, fill = null) {
  const line = set?.use?.[schema?.function?.name];
  if (!line) return schema;
  const text = fill ? line.replaceAll('{{USER}}', fill.user || 'the user').replaceAll('{{HOME}}', fill.home || 'C:\\Users\\you') : line;
  return { ...schema, function: { ...schema.function, description: text } };
}

// How many of the chat's next messages an added group stays for.
export const stickyFor = (set, base) => (set?.sticky ? Math.min(base, set.sticky) : base);
