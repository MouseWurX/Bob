// 15 Nov 2026 Computer Science Lab: Lessons (Lab > Learn > Lessons). A short course from the basics to the advanced
// ideas, one step at a time. Each lesson has three parts: Read (Bob explains one idea), Try it (one hands-on step on the
// brain Bob has loaded now, or a link to the Lab page that does the real job), and Check (two questions, each answer
// says why). Some lessons also show a Real result: a measured finding from Bob's own published research (docs/), labelled
// as real and never mixed with what a learner tries. Off unless switched on (Settings, How Bob works, Brains, "Lab: Lessons"). This is a course for people. It is NOT training
// data: nothing here is ever read by a lesson set, the Forge or any training script.
// Try it is read-only: it tokenises, asks for odds, writes a few words, or reads the brain file's header. Nothing rents,
// downloads or changes a brain. Progress (which lessons are done) is the only thing saved, in the Lab folder.
import fs from 'node:fs';
import path from 'node:path';
import { learnBrain, tokenize, nextWords, tryTemperature, MAX_TEXT } from './lab-learn.js';
import { readGguf, brainFacts } from './lab-gguf.js';

// Three levels, so the course can grow from first ideas to building the tools. Foundations: what each idea is.
// Advanced: the maths behind it (units to come). Engineering: building the tools that change brains, from Bob's own code.
export const LEVELS = [
  { id: 'foundations', title: 'Foundations', about: 'What each idea is, tried on your own brain.' },
  { id: 'advanced', title: 'Advanced', about: 'The maths behind each idea.' },
  { id: 'engineering', title: 'Engineering', about: 'Build the tools that change brains, from my own code.' }
];
export const UNITS = [
  { id: 'words', level: 'foundations', title: 'Words', about: 'How a brain reads and writes.' },
  { id: 'inside', level: 'foundations', title: 'Inside a brain', about: 'What the file holds, and why it fits.' },
  { id: 'talk', level: 'foundations', title: 'Talking to a brain', about: 'Instructions, thinking and tools.' },
  { id: 'change', level: 'foundations', title: 'Changing a brain', about: 'Teaching, cutting and healing.' },
  { id: 'judge', level: 'foundations', title: 'Judging a brain', about: 'Testing it honestly.' },
  // Advanced and the rest of Engineering. Names and order match the course plan in the dissertation outline
  // ("The curriculum: first concepts to engineering").
  { id: 'learning', level: 'advanced', title: 'How brains learn', about: 'Loss, gradients and the training loop.' },
  { id: 'transformers', level: 'advanced', title: 'Transformers', about: 'Attention, embeddings and positions, in detail.' },
  { id: 'moe', level: 'advanced', title: 'Mixture of experts', about: 'Routers, load balance and active weights.' },
  { id: 'smaller', level: 'advanced', title: 'Making brains smaller', about: 'Quantization maths, pruning and distillation.' },
  { id: 'data', level: 'advanced', title: 'Data decides habits', about: 'Why lessons shape behaviour, and leaks.' },
  { id: 'agents', level: 'advanced', title: 'Agents and tools', about: 'Tool shapes, planning and recovering from errors.' },
  { id: 'beyond', level: 'advanced', title: 'Training beyond copying', about: 'Preference and reward training.' },
  { id: 'tools', level: 'engineering', title: 'Build the tools', about: 'Read a brain file, count its experts, write a cut.' },
  { id: 'engines', level: 'engineering', title: 'Inference engines', about: 'How llama.cpp runs a brain fast.' },
  { id: 'scale', level: 'engineering', title: 'Training at scale', about: 'Rented cards, memory and checkpoints.' },
  { id: 'truth', level: 'engineering', title: 'Testing that tells the truth', about: 'Eval harnesses, baselines and leak checks.' },
  { id: 'looking', level: 'engineering', title: 'Looking inside', about: 'Probes, steering and patching.' }
];

// Answers: [text, right, why]. Keep two questions a lesson, three or four answers each, one right.
const q = (text, ...answers) => ({ q: text, answers: answers.map(([t, right, why]) => ({ t, right: right === true, why })) });

export const LESSONS = [
  // ---- Words ----
  { id: 'tokens', unit: 'words', title: 'Tokens', pro: 'Tokenization',
    read: ['I don\'t read letters or words. I read tokens: pieces of text, each with a number. Common English words are often one token; long or rare words are split into several.',
      'Everything I hold is counted in tokens: your message, my answer, and my memory of the chat. So text that splits into more tokens costs more.'],
    try: { kind: 'tokens', ask: 'Split some text into my tokens. Try a long word, a number, an emoji, or another language.', text: 'Antidisestablishmentarianism costs 1234567 tokens? 🐭🧀' },
    check: [
      q('What does a brain actually read?', ['Whole words', false, 'Close, but many words are split into pieces, and some pieces are smaller than a word.'], ['Tokens: pieces of text, each with a number', true, 'Right. The brain only ever sees the numbers.'], ['Single letters', false, 'That would be slow and wasteful. Pieces are usually a few letters long.']),
      q('Why does an emoji or another alphabet cost more?', ['It splits into more tokens', true, 'Right. More tokens means more of my memory.'], ['The brain refuses it', false, 'It reads it fine; it just takes more pieces.'], ['It doesn\'t cost more', false, 'Try it above: the same length of text can take many more tokens.'])
    ] },
  { id: 'odds', unit: 'words', title: 'Next-word odds', pro: 'Next-token prediction',
    read: ['I write one token at a time. For each one I work out odds over every token I know, then pick one, add it, and do it again.',
      'Nothing is looked up. The odds come from patterns in everything I read while I was trained. That is why I can sound sure and still be wrong.'],
    try: { kind: 'next', ask: 'See my top ten guesses for the next token.', text: 'The capital of France is' },
    check: [
      q('How does a brain write an answer?', ['It finds the answer in a database', false, 'There is no database. It only has odds learned in training.'], ['One token at a time, from odds over every token', true, 'Right. Each token is picked, added, and the odds are worked out again.'], ['It writes the whole answer at once', false, 'It can\'t: each token depends on the ones before it.']),
      q('A brain gives a wrong fact with high odds. Why?', ['It is lying on purpose', false, 'It has no intent. High odds only mean the pattern was common.'], ['The pattern looked common in its training', true, 'Right. Confidence is not the same as being correct.'], ['The engine is broken', false, 'The engine did its job. The odds were simply wrong.'])
    ] },
  { id: 'temperature', unit: 'words', title: 'Temperature and sampling', pro: 'Sampling (temperature, top-p, min-p)',
    read: ['Temperature reshapes my odds before I pick. Low: the likeliest token almost always wins, so answers repeat. High: the odds flatten and unlikely tokens get a turn.',
      'Top P and Min P cut the long tail of unlikely tokens first. Low temperature suits facts and code; higher suits brainstorming.'],
    try: { kind: 'temps', ask: 'I\'ll write the same start twice cold (0.2) and twice hot (1.5).', text: 'The best thing about rainy days is' },
    check: [
      q('You want the same careful answer every time. Which temperature?', ['Low, like 0.2', true, 'Right. Low temperature nearly always picks the likeliest token.'], ['High, like 1.5', false, 'High temperature gives varied, riskier answers.'], ['It makes no difference', false, 'Try it above: cold and hot answers are very different.']),
      q('What does Min P do?', ['Makes answers longer', false, 'Length is set by the longest reply setting, not Min P.'], ['Drops tokens much less likely than the best one', true, 'Right. It trims the long tail before picking.'], ['Turns thinking on', false, 'Thinking is a separate switch.'])
    ] },
  { id: 'context', unit: 'words', title: 'Context', pro: 'Context window and KV cache',
    read: ['Context is how many tokens I can hold at once: the instructions, the chat so far, files you gave me and my answer. Past that, the oldest part has to go or be summed up.',
      'Each token I hold takes graphics memory (the KV cache). So a longer context needs more memory, and can make me slower.'],
    try: { kind: 'context', ask: 'Paste any text and I\'ll tell you how much of my context it fills.', text: 'Paste a page of text here, like an email or a chapter, to see how much of my memory it takes.' },
    check: [
      q('What counts toward context?', ['Only your last message', false, 'The whole chat counts, plus instructions and my answer.'], ['Instructions, the chat so far, files and my answer', true, 'Right. All of it shares one budget of tokens.'], ['Only files', false, 'Files count, and so does everything else.']),
      q('Why not always use the biggest context?', ['It needs more graphics memory and can be slower', true, 'Right. Each held token takes memory.'], ['Bigger context makes the brain dumber', false, 'Not by itself, though very long chats can be harder to follow.'], ['There is no reason', false, 'Memory is the limit, especially on a 16 GB card.'])
    ] },
  // ---- Inside a brain ----
  { id: 'weights', unit: 'inside', title: 'Weights and layers', pro: 'Parameters and transformer blocks',
    read: ['A brain file is mostly numbers called weights, billions of them. They were set during training and don\'t change while I chat.',
      'The weights are arranged in layers. Each token passes up through every layer in turn, and each layer refines what the token means in this sentence.'],
    try: { kind: 'facts', ask: 'Read the numbers from the brain I have loaded.', show: ['params', 'layers', 'size'] },
    check: [
      q('What is most of a brain file?', ['Saved chats', false, 'Chats are never in the brain file.'], ['Weights: numbers set in training', true, 'Right. Billions of them.'], ['A list of facts', false, 'Facts are spread through the weights as patterns, not stored as a list.']),
      q('Do the weights change while you chat?', ['Yes, every message', false, 'No. Only training changes weights. Chat memory is separate.'], ['No, only training changes them', true, 'Right. That is why teaching a brain needs a training run.'])
    ] },
  { id: 'attention', unit: 'inside', title: 'Attention', pro: 'Self-attention',
    read: ['In each layer, every token looks back at the tokens before it and decides which matter. That is attention. It is how I know what "it" refers to.',
      'Attention is also why context costs memory: I keep each earlier token\'s keys and values so later tokens can look back at them.'],
    try: { kind: 'next', ask: 'Swap "big" for "small" and watch my guess for "it" change.', text: 'The trophy didn\'t fit in the suitcase because it was too big. The thing that was too big was the' },
    check: [
      q('What does attention do?', ['Lets each token look back at earlier tokens', true, 'Right. Each token weighs which earlier ones matter.'], ['Keeps the brain awake', false, 'A nice thought, but no.'], ['Picks the temperature', false, 'Temperature is a sampling setting, after the layers.']),
      q('Why did "big" and "small" change the answer?', ['Attention linked "it" to a different word', true, 'Right. The same word "it" pointed at the trophy or the suitcase.'], ['The brain looked it up', false, 'Nothing is looked up. Attention did it.'], ['Random chance', false, 'Try it a few times: the change is steady, not random.'])
    ] },
  { id: 'experts', unit: 'inside', title: 'Experts', pro: 'Mixture of experts (MoE)',
    read: ['Some brains split part of each layer into many small "experts". A router picks a few for each token, so only a fraction of the weights work on any one token.',
      'That is why a 35B mixture-of-experts brain can be about as fast as a 3B one: it has 35 billion weights, but only about 3 billion work per token. It still needs room for all of them.'],
    try: { kind: 'facts', ask: 'See whether my loaded brain has experts, and how many work per token.', show: ['experts', 'active'] },
    check: [
      q('In a mixture of experts, how many experts work on each token?', ['All of them', false, 'That would be a dense brain. A router picks only a few.'], ['A few, picked by a router', true, 'Right. That is where the speed comes from.'], ['One per layer, always the same', false, 'The router can pick different experts for each token.']),
      q('Why is a 35B-A3B brain fast but still big?', ['Only ~3B work per token, but all 35B must be loaded', true, 'Right. Speed follows active weights; memory follows all of them.'], ['It is secretly a 3B brain', false, 'All 35B are there and get used, just not all at once.'])
    ] },
  { id: 'quant', unit: 'inside', title: 'Quantization', pro: 'Quantization (GGUF types)',
    read: ['Weights are trained at 16 bits each. Quantization stores them with fewer bits, like 4 or 5, so the file is about a third the size and fits in graphics memory.',
      'Fewer bits loses a little accuracy. Q4_K_M and Q5_K_M are the usual good trade. Below 3 bits, brains start to make many more mistakes.'],
    try: { kind: 'facts', ask: 'See how my loaded brain is stored, and how many bits each weight gets.', show: ['type', 'bits', 'size'] },
    check: [
      q('What does quantization do?', ['Stores each weight with fewer bits', true, 'Right. Smaller file, a little less accurate.'], ['Removes layers', false, 'That would be cutting. Quantization keeps every weight.'], ['Makes the brain learn faster', false, 'It doesn\'t train anything.']),
      q('Which is usually the best trade on a 16 GB card?', ['Full 16-bit', false, 'Too big for most brains on 16 GB.'], ['Around 4 to 5 bits (Q4_K_M, Q5_K_M)', true, 'Right. Most of the quality at about a third the size.'], ['2 bits', false, 'Fits, but mistakes go up a lot.'])
    ] },
  // ---- Talking to a brain ----
  { id: 'system', unit: 'talk', title: 'Instructions', pro: 'System prompt and chat template',
    read: ['Before your message, I get instructions: the system prompt. It sets who I am, the rules, and which tools I have. It counts toward context like everything else.',
      'The chat template wraps each message in special tokens so I know who said what. Same brain, different instructions, very different answers.'],
    try: { kind: 'chat', mode: 'system', ask: 'I\'ll answer your question twice: once told to be a pirate, once told to be brief.', text: 'What is a token?' },
    check: [
      q('What is a system prompt?', ['Instructions the brain reads before your message', true, 'Right. It shapes every answer.'], ['A setting on the graphics card', false, 'It is text, not hardware.'], ['The brain\'s training data', false, 'It is read in the chat, not trained in.']),
      q('Where should Bob\'s personality live?', ['In the instructions', true, 'Right. Easy to change, and the brain itself stays good at the work.'], ['Trained into the weights', false, 'That costs a training run and can make the brain worse at its jobs.'])
    ] },
  { id: 'thinking', unit: 'talk', title: 'Thinking', pro: 'Reasoning tokens',
    read: ['Some brains can think before they answer: they write working-out first, then the answer. It helps with planning, maths and checking, but it costs time and tokens.',
      'For plain steps, like one tool call, thinking mostly slows things down. A good rule: think to plan and review; don\'t think to do.'],
    try: { kind: 'chat', mode: 'think', ask: 'I\'ll answer the same puzzle with thinking off, then on.', text: 'A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How much is the ball?' },
    check: [
      q('When does thinking help most?', ['Planning, maths and reviewing work', true, 'Right. Working it out first catches mistakes.'], ['Every single tool step', false, 'For simple steps it mostly costs time.'], ['Never', false, 'Try the puzzle above: it often helps.']),
      q('What does thinking cost?', ['Time and tokens', true, 'Right. The working-out is tokens too.'], ['Nothing', false, 'Every thinking token takes time and context.'])
    ] },
  { id: 'tools', unit: 'talk', title: 'Tool calls', pro: 'Function calling',
    read: ['A brain can\'t do anything by itself; it only writes text. To act, it writes a tool call: a tool name and its arguments, in a set shape. Bob runs the tool and hands back the result.',
      'Good tool calls use the right tool, the exact name, and correct arguments. Inventing a tool or using the shell instead of a file tool are the usual mistakes.'],
    try: { kind: 'chat', mode: 'tools', ask: 'I\'ll give the brain one tool, get_weather(city), and your question. See whether it calls the tool.', text: 'What\'s the weather in Calgary right now?' },
    check: [
      q('What is a tool call?', ['The brain writing a tool name and arguments for Bob to run', true, 'Right. The brain writes it; Bob runs it.'], ['The brain running a program itself', false, 'The brain only writes text. Bob does the running.'], ['A phone call', false, 'No.']),
      q('Which is a bad tool call?', ['Calling a tool that doesn\'t exist', true, 'Right. Inventing tools is a common mistake that lessons train out.'], ['read_file with the right path', false, 'That one is fine.'])
    ] },
  // ---- Changing a brain ----
  { id: 'finetune', unit: 'change', title: 'Lessons and fine-tuning', pro: 'Supervised fine-tuning (SFT)',
    real: { text: '37% of Bob\'s first coding lessons handed the job to a coding tool with a pretend result, so the brain learned to hand off code. Coding race, 13 tasks, thinking on: Riker v1 8, v2 6, the re-cut Riker 9, full Qwen 12. The re-cut kept 208 experts against v1 and v2\'s 176, so its gain is not from the clean lessons alone.', from: 'docs/FORGE-JOURNAL.md' },
    read: ['To teach a brain, you show it example chats, called lessons, and nudge its weights so the right answers become likelier. That is fine-tuning.',
      'The lessons are everything: bad lessons teach bad habits. Every lesson should be read and checked, and the results of its tool calls should be real.'],
    try: { kind: 'page', ask: 'See how the Lab builds lessons from your files and a teacher brain.', page: 'teach', button: 'Open Teach' },
    check: [
      q('What does fine-tuning change?', ['The weights, using example chats', true, 'Right. Lessons nudge the weights.'], ['Only the system prompt', false, 'That is instructions, not training.']),
      q('What matters most in fine-tuning?', ['The quality of the lessons', true, 'Right. Bad lessons teach bad habits.'], ['Running it as long as possible', false, 'Too long can make it worse (overfitting).'], ['The colour of the graphics card', false, 'Ha. No.'])
    ] },
  { id: 'lora', unit: 'change', title: 'LoRA and freezing', pro: 'Low-rank adaptation (LoRA)',
    read: ['Changing every weight is costly. LoRA adds a small set of new weights beside the old ones and trains only those. It is cheap and the original stays untouched.',
      'Freezing goes further: some layers aren\'t trained at all. Lower layers often hold general language, so they are kept frozen while upper layers learn the new job.'],
    try: { kind: 'page', ask: 'See LoRA and the other training steps the Lab can run.', page: 'steps', button: 'Open Steps' },
    check: [
      q('What does LoRA train?', ['A small set of added weights', true, 'Right. The original weights stay as they were.'], ['Every weight in the brain', false, 'That is full fine-tuning.']),
      q('Why freeze the lower layers?', ['They often hold general language worth keeping', true, 'Right. It protects what the brain already knows.'], ['They are empty', false, 'They are full of useful weights.'])
    ] },
  { id: 'cut', unit: 'change', title: 'Cutting experts', pro: 'Expert pruning (REAP)',
    real: { text: 'Keeping 208 of 256 experts, Bob\'s skills kept 97 to 98% of their routing, but general knowledge kept 90%. At 144 they kept 87 to 90%, and general knowledge 66%. Layer 2 was the worst layer for every skill.', from: 'docs/forge-runs/2026-11-06-counts-v3/ladder.md' },
    read: ['A mixture-of-experts brain often has experts that rarely get picked for your kind of work. Cutting them makes the file smaller, so it fits a smaller card.',
      'To choose, I count which experts get picked on real tasks, keep the busy ones, and test before and after. Cut too much and it forgets things.'],
    try: { kind: 'page', ask: 'See how the Lab counts experts and makes a smaller brain.', page: 'make', button: 'Open Make a brain' },
    check: [
      q('How do you choose which experts to cut?', ['Count which are picked on real tasks and keep the busy ones', true, 'Right. Measure first, then cut.'], ['Cut every other one', false, 'That ignores which ones do the work.']),
      q('What must happen after a cut?', ['Test it against the original', true, 'Right. Always benchmark before and after.'], ['Nothing', false, 'A cut can quietly break skills. Test it.'])
    ] },
  { id: 'heal', unit: 'change', title: 'Healing', pro: 'Knowledge distillation',
    real: { text: 'Healing can\'t grow back a removed expert: it only trains the experts that are left. That is why Bob\'s smaller brains below about half their experts are planned as a gentle cut plus a heal, never a cut alone.', from: 'docs/MAKING-SMALLER-MODELS.md' },
    read: ['After a cut, a brain loses a little. Healing trains it to copy the original\'s odds on lots of text, so it gets back what it lost. The original is the teacher.',
      'Copying full odds teaches far more than copying answers, because the student learns what the teacher nearly said, too.'],
    try: { kind: 'page', ask: 'See healing and the other steps in the Lab\'s protocol.', page: 'steps', button: 'Open Steps' },
    check: [
      q('In healing, who is the teacher?', ['The original, uncut brain', true, 'Right. The cut brain learns to copy it.'], ['The person', false, 'You run it, but the brain learns from the original.']),
      q('Why copy odds instead of just answers?', ['The odds show what the teacher nearly said, too', true, 'Right. Much more to learn from each token.'], ['Odds are smaller files', false, 'They\'re bigger. They\'re just worth more.'])
    ] },
  // ---- Judging a brain ----
  { id: 'heldout', unit: 'judge', title: 'Held-out tests', pro: 'Held-out evaluation and contamination',
    read: ['To know if a brain really learned, test it on tasks it never saw in training: a held-out test. If test items leak into the lessons, the score is a memory test, not a skill test.',
      'So the test set is kept apart, checked for leaks before every run, and read by a person, because a bad test item grades wrong.'],
    try: { kind: 'page', ask: 'See the Lab\'s challenges, which test brains the same way every time.', page: 'test', button: 'Open Test' },
    check: [
      q('What is a held-out test?', ['Tasks the brain never saw in training', true, 'Right. It measures skill, not memory.'], ['The hardest lessons', false, 'Hard or easy, they must be unseen.']),
      q('Test items leaked into the lessons. What happens?', ['The score looks better than the brain really is', true, 'Right. That is why sets are checked for leaks.'], ['Nothing', false, 'Leaks quietly inflate the score.'])
    ] },
  { id: 'honest', unit: 'judge', title: 'Honest results', pro: 'Benchmarking and baselines',
    read: ['A score only means something next to a baseline: the same test on the stock brain, same settings, same seed. Then you can say what changed.',
      'An honest report says what actually ran, what was skipped and why. If a trained brain doesn\'t beat the stock one, keep the stock one.'],
    try: { kind: 'page', ask: 'See the leaderboard and compare brains on the same challenges.', page: 'test', button: 'Open Test' },
    check: [
      q('Your new brain scores 70. Is it better?', ['Only if the stock brain scored lower on the same test', true, 'Right. Always compare to a baseline.'], ['Yes, 70 is good', false, 'A number alone says nothing.']),
      q('A test step was skipped. What does the report say?', ['That it was skipped, and why', true, 'Right. Honest reports state what ran.'], ['Nothing, it passed anyway', false, 'Hiding skips makes results look better than they are.'])
    ] },
  // ---- Advanced: How brains learn ----
  { id: 'loss', unit: 'learning', title: 'Loss', pro: 'Cross-entropy loss',
    read: ['Training needs one number that says how wrong the brain was. For each token in a lesson, take the odds the brain gave the right next token, and score it minus the log of those odds. That is the loss.',
      'Odds of 1 give a loss of 0. Odds of 0.5 give 0.69. Odds of 0.01 give 4.6. Averaged over every token, lower is better. A heal or a fine-tune is judged by this number on lessons it never trained on.'],
    real: { text: 'Healing Riker after its cut took its loss on held-out lessons from 0.401 to 0.362. The uncut teacher scored 0.324, so the heal closed most of the gap.', from: 'docs/FORGE-JOURNAL.md' },
    try: { kind: 'next', loss: true, ask: 'See my odds, and the loss I\'d get if the top token were the right one.', text: 'The capital of France is' },
    check: [
      q('The right token got odds of 0.5. What is the loss for that token?', ['About 0.69', true, 'Right. Minus the natural log of 0.5.'], ['0.5', false, 'The loss is minus the log of the odds, not the odds.'], ['0', false, '0 only when the odds are 1.']),
      q('A heal takes held-out loss from 0.40 to 0.36. What does that mean?', ['The brain now gives the right tokens higher odds on unseen lessons', true, 'Right. Lower loss on held-out lessons is real learning.'], ['It memorised the test', false, 'Held-out lessons were never trained on, so it couldn\'t.'], ['Nothing', false, 'A drop like that is a real improvement.'])
    ] },
  { id: 'gradients', unit: 'learning', title: 'Gradients and the training loop', pro: 'Backpropagation and gradient descent',
    read: ['For every weight, training works out which way to nudge it to make the loss smaller. That direction is the gradient, found by working backwards through the layers (backpropagation).',
      'The learning rate is how big each nudge is. Too big and training jumps about; too small and it barely moves. A batch of lessons, a nudge, repeat: that is the training loop. One pass over every lesson is an epoch.',
      'Watch the held-out loss. If training loss keeps falling but held-out loss rises, the brain is memorising the lessons, not learning the skill (overfitting). Stop there.'],
    try: { kind: 'page', ask: 'See the training steps the Lab can run, with their settings.', page: 'steps', button: 'Open Steps' },
    check: [
      q('What is the learning rate?', ['How big each nudge to the weights is', true, 'Right. Too big jumps about, too small barely moves.'], ['How fast the card runs', false, 'That\'s speed, not learning rate.']),
      q('Training loss falls, held-out loss rises. What is happening?', ['Overfitting: it is memorising the lessons', true, 'Right. Stop, or add more varied lessons.'], ['It is learning faster', false, 'Held-out loss rising means it is getting worse on new work.'])
    ] },
  // ---- Advanced: Transformers ----
  { id: 'embeddings', unit: 'transformers', title: 'Embeddings and positions', pro: 'Token embeddings and RoPE',
    read: ['Each token number picks a row from a big table: its embedding, a list of a few thousand numbers. Tokens used in similar ways end up with similar rows.',
      'Attention by itself doesn\'t know word order. Rotary position embedding (RoPE) turns each token\'s numbers by an angle that depends on its place, so attention can tell near from far.'],
    try: { kind: 'tokens', ask: 'Split "cat", " cat" and "Cat". Each is a different token with its own embedding row.', text: 'cat cat Cat CAT' },
    check: [
      q('Is " cat" (with a space) the same token as "cat"?', ['Usually not: different token, different embedding row', true, 'Right. Try it above.'], ['Always the same', false, 'The leading space usually makes it a different token.']),
      q('What does RoPE add?', ['Where each token sits in the text', true, 'Right. Attention can then tell near from far.'], ['Extra experts', false, 'RoPE is about positions, not experts.'])
    ] },
  { id: 'kvmath', unit: 'transformers', title: 'Attention heads and memory', pro: 'Multi-head and grouped-query attention, KV cache size',
    read: ['Each layer\'s attention is split into heads, each looking for something different. Each token stores a key and a value for every layer, so later tokens can look back.',
      'KV cache size = 2 (key and value) x layers x KV heads x head size x bytes per number x tokens. Grouped-query attention shares one key and value between several heads, which shrinks the cache a lot. Storing the cache at 8 bits halves it again.'],
    real: { text: 'Riker found one fact hidden at 25, 50 and 75% depth in 8K, 32K, 64K and 128K windows: 12 out of 12, the same as full Qwen. A 128K window fits a 16 GB card with part of the brain off the card.', from: 'docs/FORGE-JOURNAL.md' },
    try: { kind: 'context', ask: 'Paste a long text and see how much of my context it fills.', text: 'Paste a long document here.' },
    check: [
      q('What does grouped-query attention save?', ['KV cache memory, by sharing keys and values', true, 'Right. Fewer KV heads, smaller cache.'], ['Disk space for the brain file', false, 'It mostly saves memory while running.']),
      q('Double the context. What happens to the KV cache?', ['It doubles', true, 'Right. It grows with every token held.'], ['It stays the same', false, 'Every token adds its keys and values.'])
    ] },
  // ---- Advanced: Mixture of experts ----
  { id: 'routing', unit: 'moe', title: 'Routers', pro: 'Top-k gating',
    read: ['In each MoE layer, the router scores every expert for this token, keeps the top k (often 8 of 256), and mixes their outputs by those scores. The rest do nothing for this token.',
      'In training, a balance rule pushes the router to use all experts, so none sit idle. That is also why experts follow word patterns rather than tidy topics.'],
    try: { kind: 'facts', ask: 'See how many experts my brain has, and how many the router keeps per token.', show: ['experts', 'active'] },
    check: [
      q('What does the router do?', ['Scores the experts and keeps the top few for each token', true, 'Right. Top-k.'], ['Sends messages to Bob', false, 'Different router.']),
      q('Why do training rules push for balance?', ['So every expert gets used and learns', true, 'Right. An unused expert is wasted memory.'], ['To make the file smaller', false, 'Balance doesn\'t change the size.'])
    ] },
  { id: 'perword', unit: 'moe', title: 'Experts per word', pro: 'Active experts (k) vs quality',
    read: ['You can run a brain with fewer experts per token than it was trained with. Fewer is faster, because less is read for each token, but at some point quality falls off a cliff.',
      'The cliff is sudden, not gentle. So test each setting, and test again after every cut.'],
    real: { text: 'Full Qwen3.6-35B-A3B: at 8, 6 and 4 experts per word it kept 45/97 right tools, 20/20 facts and 6/6 code, at 82.7, 92.1 and 102.5 tokens a second. At 3 it fell to 26/97 tools and 4/6 code. At 2 it collapsed to 1/97 and 0/6.', from: 'docs/forge-runs/benchmarks/experts-per-word-full-qwen-2026-11-04.md' },
    try: { kind: 'page', ask: 'See the Lab\'s experts-per-word test.', page: 'test', button: 'Open Test' },
    check: [
      q('What happens with fewer experts per token?', ['Faster, and fine until a sudden cliff', true, 'Right. 4 was fine, 3 was not.'], ['Slower and better', false, 'Fewer experts means less to read, so faster.']),
      q('You cut a brain. Do the old experts-per-word results still hold?', ['No: test again after every cut', true, 'Right. The cliff can move.'], ['Yes', false, 'A cut changes what each expert carries.'])
    ] },
  // ---- Advanced: Making brains smaller ----
  { id: 'quantmath', unit: 'smaller', title: 'How quantization works', pro: 'Block quantization, K-quants and imatrix',
    read: ['Weights are stored in small blocks, for example 32 at a time. Each block keeps one scale (and sometimes an offset) plus a few bits per weight. To use a weight: bits x scale.',
      'K-quants spend more bits on the parts that matter most. An importance matrix (imatrix), measured on real text, tells the quantizer which weights to protect.'],
    try: { kind: 'facts', ask: 'See how my brain is stored and its bits per weight.', show: ['type', 'bits', 'size'] },
    check: [
      q('Why are weights quantized in blocks?', ['Each block gets its own scale, so small and large weights both fit', true, 'Right. One scale for the whole brain would lose too much.'], ['To make loading slower', false, 'No.']),
      q('What does an imatrix do?', ['Shows which weights matter most, so they keep more precision', true, 'Right. Measured on real text.'], ['Adds new weights', false, 'It only guides the quantizer.'])
    ] },
  { id: 'reap', unit: 'smaller', title: 'Scoring experts', pro: 'REAP (router-weighted expert activation pruning)',
    read: ['Counting how often an expert is picked isn\'t enough. REAP also weighs how much each expert actually changes the output when it is picked. An expert picked often but adding little can go first.',
      'Try a keep list first by switching experts off in place, which you can undo exactly. Only slice the file once the list is right.'],
    real: { text: 'REAP trims with no heal, scored on 314 held-out chat turns at 100, 75, 50 and 35% of experts kept. Bobert (uncut): 204, 204, 198, 145. Riker (already cut once): 210, 204, 163, 72. An uncut brain has slack; a cut one doesn\'t.', from: 'docs/MAKING-SMALLER-MODELS.md' },
    try: { kind: 'page', ask: 'See the Lab\'s cut plans.', page: 'make', button: 'Open Make a brain' },
    check: [
      q('What does REAP add to plain counting?', ['How much each expert changes the output', true, 'Right. Busy isn\'t the same as useful.'], ['The expert\'s file size', false, 'All experts in a layer are the same size.']),
      q('Why did Riker fall so much harder than Bobert?', ['It had already been cut, so it had less slack', true, 'Right. Cut twice, lose more.'], ['Riker is a worse brand', false, 'Same family. The earlier cut is the reason.'])
    ] },
  // ---- Advanced: Data decides habits ----
  { id: 'habits', unit: 'data', title: 'Lessons teach habits', pro: 'Behaviour from training data',
    read: ['A brain copies what its lessons do, not what they say. If lessons hand work off or invent results, the brain learns to hand off and invent.',
      'So read the lessons, not just their count. One bad pattern repeated a few hundred times becomes a habit.'],
    real: { text: '37% of Bob\'s first coding lessons handed code off to a tool with a pretend result. Coding race, 13 tasks, thinking on: Riker v1 8, v2 6, the re-cut Riker 9, full Qwen 12. The re-cut kept 208 experts against v1 and v2\'s 176, so its gain is not from the clean lessons alone.', from: 'docs/FORGE-JOURNAL.md' },
    try: { kind: 'page', ask: 'See how the Lab builds and checks lessons.', page: 'teach', button: 'Open Teach' },
    check: [
      q('What does a brain learn from a lesson?', ['What the lesson does', true, 'Right. Its habits, good and bad.'], ['Only the facts in it', false, 'It learns the behaviour too.']),
      q('How do you find a bad habit in a lesson set?', ['Read the lessons', true, 'Right. Counts and scripts miss it.'], ['Count them', false, 'A count says nothing about what they teach.'])
    ] },
  { id: 'cleaning', unit: 'data', title: 'Cleaning a lesson set', pro: 'Data cleaning and deduplication',
    read: ['Before training, drop lessons that never reach an answer, loop on one tool call, call a tool that doesn\'t exist, are empty, or are duplicates.',
      'Keep a held-out split that is never trained on, and check that no test item hides in the training side. A test the brain has seen is a memory test.'],
    real: { text: 'Cleaning Bob\'s first 16 lesson sets took them from 9,059 to 8,828 lessons: 73 duplicates, 123 with no final answer, 28 calling unknown tools, 6 loops and 1 empty.', from: 'docs/MAKING-SMALLER-MODELS.md' },
    try: { kind: 'page', ask: 'See the cleaning step in the Lab.', page: 'steps', button: 'Open Steps' },
    check: [
      q('Which lesson should be dropped?', ['One that calls a tool that doesn\'t exist', true, 'Right. It teaches inventing tools.'], ['A short one that is right', false, 'Short and right is fine.']),
      q('Why check for test items in the training side?', ['A seen test only measures memory', true, 'Right. Scores would look better than the brain is.'], ['To save disk space', false, 'It\'s about honest scores.'])
    ] },
  // ---- Advanced: Agents and tools ----
  { id: 'toolshape', unit: 'agents', title: 'Tool shape', pro: 'Tool schemas and naming',
    read: ['A brain picks tools by their names, descriptions and arguments. Two tools that sound alike get mixed up, and a long list costs context and attention.',
      'Keep names plain and distinct, descriptions short and about what the tool does, and show only the tools a job needs.'],
    try: { kind: 'chat', mode: 'tools', ask: 'Ask something that needs get_weather, and something that doesn\'t. See when the brain calls it.', text: 'Do I need an umbrella in Calgary today?' },
    check: [
      q('Two tools have near-twin names. What happens?', ['The brain mixes them up more often', true, 'Right. Make them distinct.'], ['Nothing', false, 'Near-twins are a common source of wrong calls.']),
      q('Why not give the brain every tool, always?', ['Long lists cost context and cause more wrong picks', true, 'Right. Show what the job needs.'], ['It can\'t read lists', false, 'It can, but worse when they are long.'])
    ] },
  { id: 'agentloop', unit: 'agents', title: 'The agent loop', pro: 'Plan, act, observe',
    read: ['An agent repeats: decide the next step, call a tool, read the result, decide again, until the job is done. Every result goes back into context.',
      'Good agents check results instead of assuming, recover from errors by trying another way, and stop when done. Planning and reviewing benefit from thinking; single tool steps usually don\'t.'],
    try: { kind: 'chat', mode: 'think', ask: 'Ask for a short plan with thinking off, then on.', text: 'Plan the steps to tidy a messy downloads folder into folders by file type. Just the steps.' },
    check: [
      q('A tool returns an error. What should a good agent do?', ['Read it and try another way', true, 'Right. Recover, don\'t repeat.'], ['Call the same tool the same way again', false, 'That usually loops.'], ['Pretend it worked', false, 'Never. That is how bad habits start.']),
      q('Where does thinking help most in the loop?', ['Planning and reviewing', true, 'Right. Plain steps go faster without it.'], ['Every single tool call', false, 'It mostly slows plain steps down.'])
    ] },
  // ---- Advanced: Training beyond copying ----
  { id: 'preference', unit: 'beyond', title: 'Preference training', pro: 'DPO (direct preference optimization)',
    read: ['Copying lessons teaches what to do. Preference training also teaches what not to do: show pairs, a better answer and a worse one to the same ask, and raise the odds of the better one relative to the worse.',
      'The worse half is often a real mistake the brain made, fixed into the better half. That is why bad lessons are repaired, not just thrown away.'],
    try: { kind: 'page', ask: 'See preference and other training steps in the Lab.', page: 'steps', button: 'Open Steps' },
    check: [
      q('What does a preference pair hold?', ['A better and a worse answer to the same ask', true, 'Right.'], ['Two different asks', false, 'Same ask, two answers.']),
      q('Why repair bad lessons instead of deleting them?', ['The original can be the worse half of a pair', true, 'Right. Mistakes become teaching material.'], ['It saves time', false, 'It takes longer, but teaches more.'])
    ] },
  { id: 'reward', unit: 'beyond', title: 'Learning from rewards', pro: 'Reinforcement learning (GRPO)',
    read: ['Instead of copying, the brain tries a task several times, each try is scored by a checker (did the code run, was the tool call right), and better-than-average tries are made likelier. GRPO compares the tries in each group.',
      'It only works if the checker is right. A checker that can be fooled teaches the brain to fool it.'],
    try: { kind: 'page', ask: 'See reward training in the Lab\'s protocol.', page: 'steps', button: 'Open Steps' },
    check: [
      q('What does GRPO compare?', ['Several tries at the same task, scored by a checker', true, 'Right. Better than the group average gets reinforced.'], ['Two different brains', false, 'It compares one brain\'s own tries.']),
      q('What goes wrong with a bad checker?', ['The brain learns to fool the checker', true, 'Right. Reward hacking.'], ['Training gets slower', false, 'Worse: it learns the wrong thing.'])
    ] },
  // ---- Engineering: Build the tools ----
  { id: 'gguf', unit: 'tools', title: 'Reading a brain file', pro: 'GGUF parsing',
    read: ['A GGUF file has three parts: a header of facts (keys and values, like how many layers), a table of tensors (each one\'s name, shape, type and where its bytes start), then the bytes themselves.',
      'A tool that reads one never loads the weights: it reads the header and the table, which are small, and jumps to a tensor\'s bytes only when it needs them. That is how the Lab reads a 20 GB brain in a blink.'],
    code: { from: 'app/src/lab-gguf.js, readGguf (shortened)', text: "magic = read(4)            // 'GGUF'\nversion = u32()\nnTensors = u64(); nKeys = u64()\nfor each key:    meta[str()] = value(u32())\nfor each tensor: { name: str(), dims: [u64() x u32()], type: u32(), offset: u64() }\ndataStart = round up to meta['general.alignment'] (32)" },
    try: { kind: 'gguf', ask: 'Read the header and the first tensors of the brain I have loaded.' },
    check: [
      q('What does a tool read to learn a brain\'s layers and experts?', ['The header of facts', true, 'Right. Small, and at the start of the file.'], ['Every weight', false, 'No need: the facts are in the header.']),
      q('Where does a tensor\'s data start?', ['At the data start plus its offset', true, 'Right. The table gives each tensor\'s offset from the aligned data start.'], ['Right after its name', false, 'Names are in the table; bytes are all together after it.'])
    ] },
  { id: 'counting', unit: 'tools', title: 'Counting experts', pro: 'Router activation counts',
    real: { text: 'Bob\'s first cut kept the busiest experts overall, and nothing stopped a small skill from losing its experts. The fix: count each job, keep enough in every layer to cover 95% of its routing (99% for tools, coding and exact formats), and keep the union.', from: 'docs/MAKING-SMALLER-MODELS.md' },
    read: ['To know which experts matter, run real tasks and count how often the router picks each expert in each layer. The engine adds a counter beside the router and writes the totals to a file.',
      'Count per skill (code, chat, tools) and keep an expert if it covers a skill you need. Counting on the wrong tasks keeps the wrong experts.'],
    code: { from: 'app/src/lab-gguf.js, coverageKeep (idea)', text: "for each layer:\n  sort experts by count, busiest first\n  keep experts until each skill's picks are 95% covered\nkeep = the same number in every layer (the file needs it)" },
    try: { kind: 'page', ask: 'See the expert counts the Lab takes, layer by layer.', page: 'inside', button: 'Open Look inside' },
    check: [
      q('What gets counted?', ['How often the router picks each expert, per layer', true, 'Right. Per layer, per skill.'], ['How big each expert is', false, 'They\'re all the same size.']),
      q('Why count per skill?', ['So a rare but needed skill isn\'t cut', true, 'Right. Busy overall isn\'t the same as needed.'], ['It\'s faster', false, 'It\'s slower, but safer.'])
    ] },
  { id: 'cutfile', unit: 'tools', title: 'Writing a cut', pro: 'Expert pruning (GGUF rewrite)',
    read: ['A cut writes a new file: the same header with the expert count changed, and each expert tensor with only the kept slabs copied. Everything else is copied as it is.',
      'Then the new file must load, and must be tested against the original. A file that loads but answers worse isn\'t done: it goes to healing.'],
    code: { from: 'app/src/lab-gguf.js, writeGguf (idea)', text: "set meta[arch + '.expert_count'] = kept\nfor each tensor:\n  if expert tensor: copy only kept experts' slabs\n  else: copy bytes as they are\nre-align, write table, write data" },
    try: { kind: 'page', ask: 'See how the Lab plans and makes a smaller brain.', page: 'make', button: 'Open Make a brain' },
    check: [
      q('What changes in the header after a cut?', ['The expert count', true, 'Right. And each expert tensor gets smaller.'], ['The brain\'s name only', false, 'The expert count must change or it won\'t load.']),
      q('The cut file loads. Is it done?', ['No: test it against the original, then heal', true, 'Right. Loading is only the first check.'], ['Yes', false, 'It can load and still answer worse.'])
    ] },
  // ---- Engineering: Inference engines ----
  { id: 'engine', unit: 'engines', title: 'How an engine runs a brain', pro: 'Inference: prefill and decode',
    read: ['An engine like llama.cpp loads the file, puts as many layers on the graphics card as fit, and runs the rest on the processor. Then it works in two phases.',
      'Prefill reads your whole prompt at once, many tokens in parallel, so it is fast per token. Decode writes one token at a time, and each one reads every active weight, so writing speed is mostly limited by memory speed, not maths.'],
    code: { from: 'idea, as llama-server does it', text: "load GGUF -> layers 0..n on the card, rest on the processor\nprefill: run all prompt tokens together, fill the KV cache\nloop: run 1 token -> odds -> sample -> append -> until stop or limit" },
    try: { kind: 'facts', ask: 'See my size and how many weights work per token: that is roughly what each written token has to read.', show: ['size', 'active', 'type'] },
    check: [
      q('Why is reading the prompt faster per token than writing?', ['Prefill does many tokens in parallel; decode does one at a time', true, 'Right.'], ['Prompts are shorter', false, 'Even long prompts go fast per token.']),
      q('What mostly limits writing speed?', ['How fast the weights can be read from memory', true, 'Right. Each token reads every active weight.'], ['The keyboard', false, 'No.'])
    ] },
  { id: 'offload', unit: 'engines', title: 'Fitting a big brain on a small card', pro: 'Layer and expert offload',
    read: ['When a brain is bigger than the card, something has to live in system memory. For a mixture of experts the best thing to move is experts: they are big but only a few are read per token, while attention is small and read every time.',
      'A fixed split, with some layers\' experts kept in system memory, is steady. A cache that swaps experts in and out sounds clever but spends its time copying.'],
    try: { kind: 'page', ask: 'See where a brain lives and how it is split in the Lab.', page: 'inside', button: 'Open Look inside' },
    check: [
      q('What should move off the card first in a MoE brain?', ['Experts', true, 'Right. Big, but only a few read per token.'], ['Attention', false, 'It is small and read for every token, so keep it on the card.']),
      q('Why can a swapping cache be slow?', ['It spends its time copying experts back and forth', true, 'Right.'], ['It uses too little memory', false, 'The copying is the cost.'])
    ] },
  // ---- Engineering: Training at scale ----
  { id: 'trainmem', unit: 'scale', title: 'Memory in training', pro: 'Optimizer state, gradient checkpointing, LoRA',
    read: ['Training needs far more memory than running: the weights, a gradient for each trained weight, the optimizer\'s running averages (often two more numbers each), and the activations of every layer for the backward pass.',
      'LoRA trains a tiny share of weights, so gradients and optimizer state shrink to almost nothing. Gradient checkpointing keeps fewer activations and recomputes them, trading time for memory.'],
    try: { kind: 'page', ask: 'See the Lab\'s training steps and their memory notes.', page: 'steps', button: 'Open Steps' },
    check: [
      q('Why does LoRA fit on smaller cards?', ['Only a tiny share of weights need gradients and optimizer state', true, 'Right.'], ['It deletes layers', false, 'Nothing is deleted.']),
      q('What does gradient checkpointing trade?', ['Time for memory', true, 'Right. It recomputes instead of storing.'], ['Accuracy for speed', false, 'The result is the same, just slower.'])
    ] },
  { id: 'renting', unit: 'scale', title: 'Renting cards safely', pro: 'Pre-flight checks and spend caps',
    read: ['Rented cards bill by the hour, so check everything before the paid run: the files are there, the tool shape is right, each request fits its slot, and a small sample works.',
      'A sample gate runs the first few items and stops the whole run if too few succeed. Every run has a money cap and a time cap, and deletes its own card when it ends, however it ends.'],
    try: { kind: 'page', ask: 'See the Forge, where rentals are planned with caps.', page: 'forge', button: 'Open Forge' },
    check: [
      q('What does a sample gate do?', ['Stops the run early if the first items mostly fail', true, 'Right. Cheap to fail early.'], ['Makes the run faster', false, 'It saves money, not time.']),
      q('A run crashes. What must still happen?', ['Its card is deleted, so billing stops', true, 'Right. Every exit path ends the rental.'], ['Nothing until someone checks', false, 'That\'s how bills pile up.'])
    ] },
  // ---- Engineering: Testing that tells the truth ----
  { id: 'harness', unit: 'truth', title: 'Building an eval harness', pro: 'Evaluation harness',
    read: ['A test harness asks the same questions the same way every time: same prompt, temperature 0, same seed, thinking set on purpose. It scores with code where it can (did the tool call match, did the code run), not by eye.',
      'It records what ran and what was skipped, and runs the stock brain as a baseline next to the new one.'],
    real: { text: 'A 97-question quiz moves by 3 to 5 between runs, so small wins on small quizzes can be luck. Bob trusts held-out chats for decisions.', from: 'docs/MAKING-SMALLER-MODELS.md' },
    try: { kind: 'page', ask: 'See the Lab\'s challenges and wobble check.', page: 'test', button: 'Open Test' },
    check: [
      q('Why temperature 0 in a harness?', ['So the same brain gets the same score twice', true, 'Right. Fewer moving parts.'], ['It makes brains smarter', false, 'It only makes runs repeatable.']),
      q('A new brain beats the old by 2 on a 97-question quiz. Real?', ['Not yet: that is inside the 3-to-5 noise', true, 'Right. Run it more, or use a bigger test.'], ['Yes, any win counts', false, 'Small quizzes wobble.'])
    ] },
  { id: 'leakcheck', unit: 'truth', title: 'Writing a leak check', pro: 'Contamination detection',
    read: ['Before training, compare every test item with every training lesson. Normalise first (case, spaces, punctuation), then look for exact matches and for long shared starts.',
      'Run it in code before every rental, and block the run if any test item is found. A leak found after training means the scores can\'t be trusted.'],
    code: { from: 'idea', text: "norm = lower, squash spaces, strip punctuation\nseen = set(norm(l) for l in training) + set(norm(l)[:60] for l in training)\nleaks = [t for t in tests if norm(t) in seen or norm(t)[:60] in seen]\nif leaks: stop before renting" },
    try: { kind: 'page', ask: 'See the Lab\'s steps, where the leak check runs before training.', page: 'steps', button: 'Open Steps' },
    check: [
      q('Why normalise before comparing?', ['So small changes in case or spacing don\'t hide a copy', true, 'Right.'], ['To make files smaller', false, 'It\'s for matching.']),
      q('When should the leak check run?', ['Before every training run, in code', true, 'Right. Block the run if it finds one.'], ['After publishing', false, 'Too late: the scores are already wrong.'])
    ] },
  // ---- Engineering: Looking inside ----
  { id: 'steering', unit: 'looking', title: 'Probes and steering', pro: 'Linear probes and activation steering',
    read: ['A behaviour often shows up as a direction in a layer\'s numbers. Average the activations on asks that show it, subtract the average on asks that don\'t, and you have a direction (a control vector).',
      'A probe reads how strongly that direction shows. Steering adds it, or takes it away, while the brain runs. Nothing in the file changes, so it is a safe way to test an idea before any surgery.'],
    try: { kind: 'page', ask: 'See what the Lab can look at inside a brain.', page: 'inside', button: 'Open Look inside' },
    check: [
      q('How do you find a steering direction?', ['Average activations with the behaviour minus without', true, 'Right. The difference of means.'], ['Pick a random expert', false, 'That finds nothing in particular.']),
      q('Does steering change the brain file?', ['No, it adds to the signals while it runs', true, 'Right. Safe to try and undo.'], ['Yes, permanently', false, 'That would be surgery.'])
    ] },
  { id: 'patching', unit: 'looking', title: 'Finding where a habit lives', pro: 'Activation patching (causal tracing)',
    read: ['Run the brain on two asks, one that shows a habit and one that doesn\'t. Then copy one layer\'s signals from one run into the other. If the habit appears or vanishes, that layer carries it.',
      'Do it layer by layer, with enough asks to beat the noise. Only change weights once the same layers show up again and again.'],
    try: { kind: 'page', ask: 'See the Lab\'s look-inside tools.', page: 'inside', button: 'Open Look inside' },
    check: [
      q('What does patching tell you?', ['Which layers carry a behaviour', true, 'Right. Swap a layer\'s signals, watch what changes.'], ['How big the file is', false, 'No.']),
      q('Why many asks per test?', ['One ask is noisy; many show what is real', true, 'Right.'], ['To use up the card', false, 'No.'])
    ] },
];

export const LESSON_PAGES = { teach: 'teach', steps: 'steps', make: 'make', test: 'test', inside: 'inside', forge: 'forge' }; // a lesson's page link, Lab tab ids

// What one Try it may send. Everything else in the body is dropped.
export const LONG_TEXT = 40000; // characters the Context lesson may count
export function cleanTry(b = {}) {
  const lesson = LESSONS.find((l) => l.id === String(b.id || ''));
  return { lesson, text: String(typeof b.text === 'string' ? b.text : '').slice(0, lesson?.try.kind === 'context' ? LONG_TEXT : MAX_TEXT) };
}

const post = async (url, body, { fetch: f = globalThis.fetch, signal } = {}) => {
  const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: signal || AbortSignal.timeout(180000) });
  if (!res.ok) { let why = ''; try { why = (await res.json())?.error?.message || ''; } catch {} throw new Error(why || `My engine said ${res.status}.`); }
  return res.json();
};
const strip = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
const reply = (j) => j?.choices?.[0]?.message || {};

export const SYSTEMS = [['A pirate', 'You are a pirate. Answer in pirate speak.'], ['Brief', 'Answer in one short sentence.']];
export const WEATHER_TOOL = { type: 'function', function: { name: 'get_weather', description: 'The weather now in a city.', parameters: { type: 'object', properties: { city: { type: 'string', description: 'The city name' } }, required: ['city'] } } };

// The brain file's numbers, for the Inside a brain lessons. `file` is the loaded brain's GGUF path.
export function factsOf(file, read = (f) => brainFacts(readGguf(f))) {
  const f = read(file);
  const bits = f.params ? Math.round(((f.size * 8) / f.params) * 10) / 10 : 0;
  return { name: f.name || '', layers: f.engineLayers || f.layers || 0, paramsB: f.paramsB || 0, activeB: f.activeB || 0, experts: f.experts || 0, used: f.used || 0, type: f.fileType || '', fullSize: f.fullSize === true, sizeGB: Math.round((f.size / 1e9) * 10) / 10, bits };
}

// The Reading a brain file lesson: the header and the first tensors, never a weight, never the file's path.
export function ggufTour(g) {
  const keys = Object.keys(g.meta || {});
  const pick = ['general.architecture', 'general.name', 'general.file_type', 'general.alignment'];
  const arch = g.meta?.['general.architecture'] || '';
  for (const k of ['block_count', 'context_length', 'expert_count', 'expert_used_count']) pick.push(`${arch}.${k}`);
  return { version: g.version, keys: keys.length, tensors: g.tensors.length, dataStart: g.dataStart, facts: pick.filter((k) => k in g.meta).map((k) => [k, String(g.meta[k])]),
    first: g.tensors.slice(0, 8).map((t) => ({ name: t.name, dims: t.dims.map(Number), type: t.type, offset: Number(t.offset) })) };
}

// One Try it on Bob's loaded brain. Counts as use of the brain, like the Experiments, so it isn't let go mid-lesson.
export async function runTry(brain, body, opts = {}) {
  const { lesson, text } = cleanTry(body);
  if (!lesson) throw new Error('I don\'t know that lesson.');
  const t = lesson.try;
  if (t.kind === 'page') throw new Error('This lesson opens a Lab page instead.');
  const b = learnBrain(brain);
  if (!b.ready) throw new Error(b.why);
  const input = text || t.text || '';
  const engine = brain.engine;
  engine.active = (engine.active || 0) + 1;
  try {
    if (t.kind === 'tokens') return { kind: 'tokens', ...(await tokenize(b.url, input, opts)) };
    if (t.kind === 'next') return { kind: 'next', top: (await nextWords(b.url, input, { ...opts, temperature: 1 })).top };
    if (t.kind === 'temps') {
      const cold = await tryTemperature(b.url, input, { ...opts, temperature: 0.2, count: 2 });
      const hot = await tryTemperature(b.url, input, { ...opts, temperature: 1.5, count: 2 });
      return { kind: 'temps', cold: cold.tries.map((x) => x.text), hot: hot.tries.map((x) => x.text) };
    }
    if (t.kind === 'context') {
      const all = text;
      const n = all.trim() ? ((await post(`${b.url}/tokenize`, { content: all }, opts)).tokens || []).length : 0, ctx = b.ctx || 0; // numbers only: a long text needs no pieces
      return { kind: 'context', characters: all.length, tokens: n, ctx, share: ctx ? Math.round((n / ctx) * 1000) / 10 : 0 };
    }
    if (t.kind === 'facts') {
      const file = engine.resolve?.(engine.current)?.gguf;
      if (!file || !(opts.exists || fs.existsSync)(file)) throw new Error('I can\'t find the file for the brain I have loaded.');
      return { kind: 'facts', ...factsOf(file, opts.readFacts) };
    }
    if (t.kind === 'gguf') {
      const file = engine.resolve?.(engine.current)?.gguf;
      if (!file || !(opts.exists || fs.existsSync)(file)) throw new Error('I can\'t find the file for the brain I have loaded.');
      return { kind: 'gguf', ...ggufTour((opts.readGguf || readGguf)(file)) };
    }
    if (t.kind === 'chat') {
      const ask = (extra) => post(`${b.url}/v1/chat/completions`, { max_tokens: 400, temperature: 0.7, ...extra }, opts);
      if (t.mode === 'system') {
        const out = [];
        for (const [label, sys] of SYSTEMS) out.push({ label, text: strip(reply(await ask({ messages: [{ role: 'system', content: sys }, { role: 'user', content: input }], chat_template_kwargs: { enable_thinking: false } })).content) });
        return { kind: 'chat', mode: 'system', answers: out };
      }
      if (t.mode === 'think') {
        const off = reply(await ask({ messages: [{ role: 'user', content: input }], chat_template_kwargs: { enable_thinking: false } }));
        const on = reply(await ask({ messages: [{ role: 'user', content: input }], max_tokens: 1500, chat_template_kwargs: { enable_thinking: true } }));
        const raw = String(on.content || ''), inline = (raw.match(/<think>([\s\S]*?)<\/think>/) || [])[1] || '';
        const thought = String(on.reasoning_content || inline).trim();
        return { kind: 'chat', mode: 'think', answers: [{ label: 'Thinking off', text: strip(off.content) }, { label: 'Thinking on', text: strip(raw), thought, thinks: Boolean(thought) }] };
      }
      if (t.mode === 'tools') {
        const m = reply(await ask({ messages: [{ role: 'user', content: input }], tools: [WEATHER_TOOL], chat_template_kwargs: { enable_thinking: false } }));
        const calls = (m.tool_calls || []).map((c) => ({ name: String(c.function?.name || ''), args: String(c.function?.arguments || '') }));
        return { kind: 'chat', mode: 'tools', calls, text: strip(m.content), right: calls.length === 1 && calls[0].name === 'get_weather' };
      }
    }
    throw new Error('I don\'t know that step.');
  } finally { engine.active--; try { engine.lastUse = engine.now(); } catch {} }
}

// Progress: { done: { lessonId: ISO date } } in the Lab folder. Only lesson ids that exist are kept.
export const progressFile = (dir) => path.join(dir, 'lessons-progress.json');
export function readProgress(dir) {
  try { const j = JSON.parse(fs.readFileSync(progressFile(dir), 'utf8').replace(/^﻿/, '')); const done = {}; for (const l of LESSONS) if (typeof j?.done?.[l.id] === 'string') done[l.id] = j.done[l.id]; return { done }; } catch { return { done: {} }; }
}
export function markDone(dir, id, on = true, now = () => new Date().toISOString()) {
  if (!LESSONS.some((l) => l.id === id)) throw new Error('I don\'t know that lesson.');
  const p = readProgress(dir);
  if (on) p.done[id] = now(); else delete p.done[id];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(progressFile(dir), JSON.stringify(p, null, 2));
  return p;
}
export function resetProgress(dir) { try { fs.rmSync(progressFile(dir), { force: true }); } catch {} return { done: {} }; }

// GET /api/lab/lessons and POST /api/lab/lessons/{try,done,reset}. Any device Bob lets in may use them: Try it is
// read-only, and the only thing written is which lessons are done.
export async function lessonsRoute({ req, res, p, lab, body, send, labOn, labDir }) {
  if (!p.startsWith('/api/lab/lessons')) return false;
  const on = labOn(lab.cfg) && lab.cfg.labLessons === true;
  const dir = labDir(lab.cfg);
  if (req.method === 'GET' && p === '/api/lab/lessons') {
    const b = learnBrain(lab.brain);
    send(res, 200, { on, levels: LEVELS, units: UNITS, lessons: LESSONS, ...readProgress(dir), ready: b.ready, why: b.why || '', wake: b.wake === true, brain: b.ready ? (lab.brain?.brainLabel?.(b.model) || b.model) : '' });
    return true;
  }
  if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
  if (!on) { send(res, 403, { error: 'Lessons are off. Turn on "Lab: Lessons" in Settings, How Bob works, Brains.' }); return true; }
  const x = await body(req);
  if (p === '/api/lab/lessons/try') { send(res, 200, await runTry(lab.brain, x)); return true; }
  if (p === '/api/lab/lessons/done') { send(res, 200, markDone(dir, String(x.id || ''), x.done !== false)); return true; }
  if (p === '/api/lab/lessons/reset') { send(res, 200, resetProgress(dir)); return true; }
  send(res, 404, { error: 'no' }); return true;
}
