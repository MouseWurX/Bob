// Tool sets for each brain family (reliability, on by default; Settings, How Bob works, "Tool wording for each brain
// family"). Every family gets the same tools, with the same names and the same inputs, so a call runs the same way and
// a lesson never needs translating back. Only how the tools are worded changes:
//   - Qwen brains (Riker, Bill, Bobert...) and brains we don't know keep Bob's own wording, byte for byte. Qwen
//     brains don't get ask_specialist or pick_session (see QWEN below).
//   - GPT-OSS keeps Bob's wording too, except list_folder and search_files say which is which, and two tools it
//     never needed are left out. It also lets an added tool group go after 1 message, not 3.
// A family's tool list is never longer in all than Bob's own (test/run-tool-sets-test.js): the examples are paid for
// by shorter lines elsewhere, so the start of a job stays inside its budget (test/run-start-budget-test.js). A family is picked by itself only after tool-score shows it
// fails less with its own wording (docs/TOOL-SETS.md has the numbers); until then it's `proven: false` and only used when named.
import crypto from 'node:crypto';
import { familyOf } from './model-family.js';
import { ggufInfo } from './gguf.js';

export const toolSetsOn = (cfg) => cfg?.toolSets !== false;

// Qwen brains (Riker, Bobert, Bill...): Bob's own wording, byte for byte, less two look-alike helpers that pulled
// Riker and Bobert off course in their coached tool runs (Nov 15, the owner: "fix gaps"). ask_specialist handed jobs
// away they could do themselves (a habit from old lessons); pick_session read as a tool for the job.
const QWEN = { label: 'Qwen', proven: true, hide: ['ask_specialist', 'pick_session'], use: {} };

// family (model-family.js familyOf) -> its tool set. Families not listed use Bob's own wording.
export const SETS = {
  qwen3: QWEN,
  'qwen3.5': QWEN,
  'qwen3-coder': QWEN,
  'qwen2.5': QWEN,
  'gpt-oss': {
    label: 'GPT-OSS',
    // Nov 15, coached tool runs on the 120B and the cut 38B (rented card, thinking off): no wording beat Bob's own
    // (120B 0.633, every variant within 0.03), so GPT-OSS keeps Bob's wording. Two changes from what it got wrong:
    // list_folder and search_files say which is which (the 120B never got list_folder right first try), and the two
    // tools it reached for wrongly and never needed (ask_specialist, mcp_tools) are left out; leaving them out cost nothing.
    // Locked by the owner Nov 15, so every GPT-OSS brain gets it by itself. Tool steps think low (step-thinking.js, PR #253).
    proven: true,
    sticky: 1,
    hide: ['ask_specialist', 'mcp_tools'],
    use: {
      list_folder: 'List the files in a folder. Home is {{HOME}}. Words inside files: search_files.',
      search_files: "Find words inside {{USER}}'s files: projects, or a folder. Gives file and line. A folder's files: list_folder."
    }
  }
};

// Which tool shapes are live, as a short stamp. The tool record (tool-record.js) starts a fresh history when this
// changes, and moves the old one to an archive folder (Nov 14, the owner: "if i have a history in it we restart that
// history new when we try the new tool shapes"). Bump TOOL_SHAPES when tool wording or inputs change for every brain.
export const TOOL_SHAPES = 4; // 2 (Nov 15): save_to on the save tools and make_diagram, a new name on convert_file. 3: GPT-OSS shape locked. 4: Qwen hides 2 helpers; run_command sends file writes to write_file
export function shapeStamp(cfg) {
  const live = toolSetsOn(cfg) ? Object.keys(SETS).filter((k) => SETS[k].proven !== false && cfg?.toolSets?.[k] !== false).sort() : [];
  return `${TOOL_SHAPES}-${live.join('+') || 'bob'}`;
}

// The exact shape of every tool a brain can be offered with these settings: names, wording (the {{USER}} and {{HOME}}
// placeholders left in, so it never depends on who or where) and inputs, in order. Anything Settings turns on or off
// changes it: a More tools switch, a Hand, the mail catalog. Lumo's review (Nov 21) of the after1 tools: the mail catalog
// added read_email and manage_email inputs while TOOL_SHAPES stayed 4, and one counter can't say which tools a brain saw.
// A run or lesson can now carry this hash beside TOOL_SHAPES, and test/run-tool-shapes-lock-test.js fails when the tool
// list changes without a TOOL_SHAPES bump. brain: a Brain (its tools, offTools and usable); set: a family's tool set.
export function shapeSchemas(brain, set = null) {
  const off = brain.offTools();
  return Object.keys(brain.tools).filter((n) => brain.tools[n]?.schema && brain.usable(n, off) && !set?.hide?.includes(n)).map((n) => inSet(brain.tools[n].schema, set));
}
export const toolListHash = (schemas) => crypto.createHash('sha256').update(JSON.stringify(schemas ?? [])).digest('hex').slice(0, 12);

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
