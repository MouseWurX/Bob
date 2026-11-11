// 1.5.199 The Lab's proper names. Keep it simple uses plain words; Professional mode puts the name people in the field
// use first, with the plain words after it in brackets, so you can look it up. A test of Bob's own that's only
// written in the style of a known benchmark says "-style": it's never the benchmark itself, and its score isn't the
// benchmark's score. Keys are the exact plain labels the Lab shows; test/run-lab-names-test.js checks every key is
// still a label somewhere in the Lab, so a renamed label can't quietly lose its proper name.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const TECH = {
  // Make a brain: the jobs and the steps
  'Make it smaller': 'Quantization (GGUF Q8_0 to Q2_K)',
  'Cut experts': 'MoE expert pruning',
  'Take out sight or hearing': 'Dropping the multimodal projector (mmproj)',
  'Just test a brain': 'Evaluation',
  'Take out the refusal habit': 'Abliteration (refusal-direction ablation)',
  'Keep every skill covered': 'Coverage-based expert pruning',
  'Make the running files': 'Quantization (llama-quantize)',
  'Measure before making the running files': 'Importance matrix (imatrix)',
  'Try it first, before cutting': 'Runtime expert masking',
  'Write a new lesson set': 'Synthetic data from a teacher model',
  'Build a new set from my files': 'Dataset building (SFT data from your files)',
  'Teach it back': 'Healing fine-tune (distillation from the parent)',
  'Make it one file': 'Merging the LoRA adapter into the weights',
  'Usage map: which experts does it use?': 'Router statistics: expert activation counts',
  // Forge: ways to make a brain
  'Teach a cut brain back': 'Healing fine-tune (distillation from the parent)',
  'Teach it a lesson set': 'Supervised fine-tuning (SFT)',
  'Teach it a way of thinking': 'Reasoning-trace fine-tuning (chain-of-thought SFT)',
  'Mix two brains': 'Model merging (linear, SLERP, TIES)',
  'Stack layers': 'Passthrough merge (layer stacking)',
  'Fold experts': 'Expert merging',
  'Stitch brains in as experts': 'Branch-Train-MiX (dense brains as MoE experts)',
  'Teach it to need fewer experts': 'Reduced top-k routing fine-tune',
  'An even mix': 'Linear merge (weighted average)',
  'A smooth blend': 'SLERP (spherical interpolation)',
  'Keep what each changed': 'TIES-merging',
  'Light (recommended)': 'LoRA',
  'Full': 'Full fine-tune',
  'Give it eyes, give it ears': 'Multimodal projector (mmproj) attach and alignment',
  // Challenges: Bob's own tests, written in the style of known ones
  'Riddles and reasoning': 'ARC-style reasoning',
  'Sums': 'GSM8K-style maths word problems',
  'Follow the rules': 'IFEval-style instruction following',
  'Pick the tool': 'Function calling: tool selection',
  'Code it': 'HumanEval-style code generation',
  'Use the tools': 'BFCL-style function calling',
  'Say "I don\'t know"': 'Abstention (hallucination test)',
  'Follow every rule': 'Multi-constraint instruction following (IFEval-style)',
  'Finish the code': 'Code completion with hidden unit tests',
  'Fix the bug': 'Program repair',
  'Common sense': 'HellaSwag-style commonsense completion',
  'Who is "she"?': 'Winograd schema (WinoGrande-style)',
  'School subjects': 'MMLU-style multi-subject knowledge',
  'Harder sums': 'Multi-step maths with distractors',
  'Read and answer': 'Reading comprehension (SQuAD-style)',
  'Long thread': 'Multi-turn long-context recall',
  'Other languages': 'Multilingual QA',
  'Shaped answers': 'Structured output (JSON and format adherence)',
  'Stay in character': 'Persona consistency',
  'Agent errand': 'Agentic task completion',
  'Guard rails': 'Over-refusal (XSTest-style), prompt injection and refusal retention',
  'Guard rails: test your own brain': 'Red-teaming sandbox',
  'Add the standard speed test': 'llama-bench (pp512, tg128)',
  // Playground
  'How small can a brain get?': 'Quantization ladder with perplexity',
  'How much can it hold?': 'Context length: KV cache size, needle in a haystack, YaRN',
  'Cache squeeze': 'KV cache quantization',
  'Stretch the window': 'YaRN (RoPE scaling)',
  'Speed against length, and the needle at every size': 'Needle in a haystack',
  'Make it faster: Turbo': 'Speculative decoding',
  'Who guesses?': 'Draft model',
  'Teach it: here or rented': 'Fine-tuning (QLoRA here, LoRA rented)',
  'Best answers: a bigger brain judges, a smaller one learns': 'Rejection-sampling fine-tune and DPO, with an LLM judge',
  'Best of its own': 'Best-of-N rejection sampling',
  'Better and worse pairs': 'DPO (direct preference optimisation)',
  'Teach only these parts': 'Sparse fine-tuning (chosen experts only)',
  'Peek inside: which experts did you use for that?': 'MoE router tracing',
  'Diffusion brains: the whole answer at once': 'Diffusion language models (masked diffusion)',
  'From its lessons': 'Supervised fine-tuning (SFT)',
  'From its full-size self (squeeze-aware)': 'Quantization-aware distillation (QAD)',
};

// The label to show. Professional: "Proper name (plain words)". Keep it simple, or a label with no proper name: as it was.
// A trailing " (recommended)" is kept on the label but ignored for the lookup.
export function labName(plain, pro) {
  const t = pro ? (TECH[plain] || TECH[String(plain).replace(/ \(recommended\)$/, '')]) : '';
  return t ? `${esc(t)} <span class="lab-plain">(${esc(plain)})</span>` : esc(plain);
}

// The Lab's pages are built in many small files; lab.js tells this one which mode the Lab is in, once, and every
// page asks here instead of being handed the view.
let proNow = () => false;
export function setLabMode(fn) { proNow = typeof fn === 'function' ? fn : () => false; }
export const nameNow = (plain) => labName(plain, proNow());
