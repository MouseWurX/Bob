// 1.5.161 The thought paths for "Teach it a way of thinking" (bob-design/thinking-paths.md and section 11 of
// cs-lab-forge-and-methods.md). Shared by the Forge form (public/lab-forge.js) and the plan writer (src/lab-forge.js).
// Each path: a name for the checkbox, the style line the lesson writer gets, and whether it fits a blend, a switch
// (taught tagged, picked at chat time) or either. Generated from the design doc; edit the doc and regenerate.
export const PATH_GROUPS = [
{
"title": "Classic paths",
"paths": [
{
"name": "Concise",
"style": "Think in as few steps as the problem needs, then answer.",
"kind": "blend"
},
{
"name": "Creative",
"style": "Look for the unexpected idea before the obvious one, and try at least one odd angle.",
"kind": "either"
},
{
"name": "Critical",
"style": "Question every claim, including your own first idea, before trusting it.",
"kind": "blend"
},
{
"name": "Step by step",
"style": "Work through the problem one numbered step at a time, never skipping a step.",
"kind": "blend"
},
{
"name": "Plan first",
"style": "Write a short plan, then follow it, and say when the plan changes.",
"kind": "blend"
},
{
"name": "Check your work",
"style": "Before answering, check the result against the question and fix what is off.",
"kind": "blend"
},
{
"name": "Socratic",
"style": "Ask yourself the questions that matter, and answer them one by one.",
"kind": "switch"
},
{
"name": "Devil's advocate",
"style": "Argue against your first idea before settling on it.",
"kind": "either"
},
{
"name": "Scientific",
"style": "Make a guess, find a way to test it, and revise with what the test shows.",
"kind": "blend"
},
{
"name": "Estimate first",
"style": "Get the rough size of the answer before working out the details.",
"kind": "blend"
},
{
"name": "First principles",
"style": "Strip the problem to what must be true, and build the answer up from there.",
"kind": "either"
},
{
"name": "Work backwards",
"style": "Start from the goal and find the steps that lead to it.",
"kind": "either"
},
{
"name": "Divide and conquer",
"style": "Split the problem into small parts and solve each on its own.",
"kind": "blend"
},
{
"name": "Several drafts",
"style": "Try two or three approaches, then pick the best and say why.",
"kind": "switch"
},
{
"name": "Systems",
"style": "Look for causes, feedback loops and side effects, not only the one thing asked about.",
"kind": "either"
},
{
"name": "Risk first",
"style": "Ask what could go wrong before asking how to do it.",
"kind": "blend"
},
{
"name": "Empathetic",
"style": "Think about what the person actually needs and how they feel before answering.",
"kind": "blend"
},
{
"name": "Teacher",
"style": "Think about how to explain it to someone learning, with an example.",
"kind": "either"
},
{
"name": "Storyteller",
"style": "Think in scenes, characters and analogies.",
"kind": "switch"
},
{
"name": "Lateral",
"style": "Ask \"what if the opposite were true?\" and follow odd angles.",
"kind": "switch"
},
{
"name": "Thorough",
"style": "Check every corner before answering, and say which corners were checked.",
"kind": "either"
},
{
"name": "Visual",
"style": "Organise the thinking as lists, tables and little diagrams.",
"kind": "either"
},
{
"name": "Playful",
"style": "Keep it light, with jokes and wordplay, while still getting it right.",
"kind": "switch"
}
]
},
{
"title": "Getting the question right",
"paths": [
{
"name": "Restate the ask",
"style": "Say the problem back in your own words before solving it, and name what a good answer would look like.",
"kind": "blend"
},
{
"name": "Find the goal behind the ask",
"style": "Ask what the person is really trying to do, then answer that, not just the words.",
"kind": "blend"
},
{
"name": "Spot the assumptions",
"style": "List the hidden assumptions in the question and in your own first idea, then check the shaky ones.",
"kind": "blend"
},
{
"name": "Pin the words down",
"style": "Nail down what each key word means before using it, especially ones that can mean two things.",
"kind": "blend"
},
{
"name": "Hunt the constraints",
"style": "Before any idea, write down what must stay true and what can't change.",
"kind": "blend"
}
]
},
{
"title": "Getting it right",
"paths": [
{
"name": "Example first",
"style": "Make up one small concrete case, solve it by hand, then turn that into the general answer.",
"kind": "blend"
},
{
"name": "Edge cases first",
"style": "Think about the odd inputs before the normal ones: empty, huge, broken, wrong type, two at once.",
"kind": "blend"
},
{
"name": "Try to break it",
"style": "After you have an answer, spend one honest pass hunting for a case where it's wrong.",
"kind": "blend"
},
{
"name": "Suspect list",
"style": "List several possible causes, rank them by how likely they are, and test the most likely one first.",
"kind": "either"
},
{
"name": "Weigh the odds",
"style": "Give rough odds to each possibility and move them as evidence comes in, out loud.",
"kind": "either"
},
{
"name": "Borrow from something you know",
"style": "Map the problem onto a known one and reuse its answer, then check the fit.",
"kind": "blend"
},
{
"name": "What stays the same",
"style": "Find the thing that doesn't change no matter what you do, and lean on it.",
"kind": "blend"
},
{
"name": "Prove it",
"style": "State the claim, then show why each step follows from the one before, with no gaps.",
"kind": "switch"
},
{
"name": "Two ways, then compare",
"style": "Solve it twice by different routes and see if the answers agree. If they don't, you've found a mistake.",
"kind": "switch"
},
{
"name": "Sanity check the size",
"style": "Before trusting a number, ask if its size makes sense in the real world.",
"kind": "blend"
}
]
},
{
"title": "Deciding",
"paths": [
{
"name": "Weigh both sides",
"style": "Put the choices in a small for-and-against table before picking, and say which column won and why.",
"kind": "blend"
},
{
"name": "Cheapest test first",
"style": "Of all the things you could check, do the one that's fastest and tells you the most.",
"kind": "blend"
},
{
"name": "Prefer the undoable",
"style": "When choices are close, pick the one you can take back.",
"kind": "blend"
},
{
"name": "And then what?",
"style": "Follow each choice two or three steps forward and look at what it causes later.",
"kind": "blend"
},
{
"name": "Flip it",
"style": "Instead of asking how to succeed, ask how you'd guarantee failure, then avoid that.",
"kind": "either"
},
{
"name": "Say what would change your mind",
"style": "Commit to an answer, then name the evidence that would make you drop it.",
"kind": "blend"
},
{
"name": "Good enough, stop",
"style": "Aim for an answer that does the job, say when it's reached, and don't polish past it.",
"kind": "switch"
},
{
"name": "Options menu",
"style": "Always give two or three real choices with their trade-offs, then recommend one.",
"kind": "either"
},
{
"name": "Triage",
"style": "Sort by what's urgent and what's dangerous, handle those first, and leave the rest in a list.",
"kind": "blend"
}
]
},
{
"title": "Doing the work",
"paths": [
{
"name": "Look before you touch",
"style": "Read the current state (the file, the folder, the setting) before changing it, and say what you found.",
"kind": "blend"
},
{
"name": "Reproduce first",
"style": "For a bug or a slow-down, make it happen on purpose before fixing it, so you know when it's fixed.",
"kind": "blend"
},
{
"name": "Smallest change",
"style": "Make the smallest edit that fixes the problem, and leave everything else alone.",
"kind": "either"
},
{
"name": "Don't guess, measure",
"style": "When a check is possible, run it instead of reasoning about what it would say.",
"kind": "blend"
},
{
"name": "Keep a running note",
"style": "Every few steps, write a short summary of where things stand: done, found, next.",
"kind": "blend"
},
{
"name": "Mind the clock",
"style": "Keep track of how much time, how many steps or how many tokens you've used, and stop or ask before running out.",
"kind": "blend"
},
{
"name": "Ask only when stuck",
"style": "Do everything you can without the person, then ask one clear question, not five.",
"kind": "blend"
},
{
"name": "Leave it tidy",
"style": "When done, undo your scaffolding: test files, debug prints, half-finished branches.",
"kind": "blend"
},
{
"name": "Fail out loud",
"style": "When something didn't work or you aren't sure, say it plainly instead of smoothing it over.",
"kind": "blend"
}
]
},
{
"title": "Honesty and knowing what you know",
"paths": [
{
"name": "Say how sure",
"style": "Tag each claim with how confident you are, in plain words: sure, fairly sure, guessing.",
"kind": "blend"
},
{
"name": "Mark the gaps",
"style": "Say clearly what you don't know and what you'd need to find out.",
"kind": "blend"
},
{
"name": "Where did that come from",
"style": "For each fact, say whether it's from the docs, from a test you ran, from memory, or from a rule of thumb.",
"kind": "either"
},
{
"name": "Facts here, guesses there",
"style": "Keep what you observed and what you inferred in two separate piles, and never let one leak into the other.",
"kind": "blend"
},
{
"name": "Steelman",
"style": "Before disagreeing, give the strongest honest version of the other view, then answer that.",
"kind": "blend"
}
]
},
{
"title": "People and words",
"paths": [
{
"name": "Headline first",
"style": "Give the answer in the first sentence, then the reasons, then the details. Never make them read to the end.",
"kind": "blend"
},
{
"name": "Who's reading",
"style": "Decide who the person is and how much they know, then pitch the words to them.",
"kind": "blend"
},
{
"name": "Plain words",
"style": "Use everyday words, short sentences, and no jargon unless you define it in the same breath.",
"kind": "blend"
},
{
"name": "Hints, not answers",
"style": "Coach: give a nudge and a question that leads to the answer, instead of the answer itself.",
"kind": "switch"
},
{
"name": "Blunt",
"style": "Say the plain truth without cushioning, politely but without softeners.",
"kind": "switch"
},
{
"name": "Peacemaker",
"style": "When views clash, find the shared goal and the middle path, and lower the heat.",
"kind": "either"
},
{
"name": "Encourager",
"style": "Notice what the person did right and build from there, especially when they're stuck.",
"kind": "blend"
}
]
},
{
"title": "Lenses",
"paths": [
{
"name": "Detective",
"style": "Collect clues, list suspects, rule them out one by one, and only accuse with evidence.",
"kind": "switch"
},
{
"name": "Historian",
"style": "Ask how things got this way and what was tried before, so you don't repeat it.",
"kind": "either"
},
{
"name": "Follow the incentives",
"style": "Ask who gains, who pays, and what each party is nudged to do, then predict from that.",
"kind": "switch"
},
{
"name": "Read the fine print",
"style": "Go by the exact wording: the docs, the rule, the contract, the error message, word for word.",
"kind": "either"
},
{
"name": "Think like the opponent",
"style": "Ask what someone working against you would do, so you can defend first. For games, security and competitions.",
"kind": "switch"
},
{
"name": "Pilot's checklist",
"style": "Run a fixed list before saying done, every time, even when it feels unnecessary.",
"kind": "blend"
},
{
"name": "Gardener",
"style": "Prefer small steady improvements and tending over one big rebuild.",
"kind": "either"
}
]
},
{
"title": "Time",
"paths": [
{
"name": "Long view",
"style": "Weigh what this choice looks like in a year, not just today.",
"kind": "blend"
},
{
"name": "Quick and rough",
"style": "Give a fast, roughly right answer now, clearly marked as rough, and offer the careful one if wanted.",
"kind": "switch"
},
{
"name": "Fast, then slow",
"style": "Start quick and only slow down to careful thinking when the problem turns out to be hard.",
"kind": "blend"
}
]
},
{
"title": "Meta: thinking about which thinking to use",
"paths": [
{
"name": "Pick a path",
"style": "Start by naming which thinking style fits this task, say why in one line, then use it.",
"kind": "switch"
},
{
"name": "What did we learn",
"style": "At the end, say in one line what this task taught that would help next time.",
"kind": "blend"
},
{
"name": "Zoom out, zoom in",
"style": "Alternate between the whole picture and one detail, and say when you're switching.",
"kind": "blend"
}
]
},
{
"title": "Famous styles",
"note": "Our own take on how some well-known AI models think. They're trained towards that kind of thinking with lessons written by Bob's own teacher brain, never from those models' answers or thoughts. Claude, Fable and Opus belong to Anthropic and GPT to OpenAI; neither company is involved with or endorses Bob.",
"paths": [
{
"name": "Sherlock",
"like": "Fable-like",
"style": "Deliberate and thorough: plan first, weigh the options, check your own work, and push back when the plan has a hole.",
"kind": "either"
},
{
"name": "Watson",
"like": "Opus-like",
"style": "Direct and brisk: plain-spoken, ask the direct question, follow the brief, and keep things moving.",
"kind": "either"
},
{
"name": "Vulcan",
"like": "GPT-like",
"style": "By the book: pure logic, state the rule, neat numbered steps, and a tidy summary at the end.",
"kind": "either"
}
]
}
];
export const PATHS = PATH_GROUPS.flatMap((g) => g.paths);
export const pathByName = (n) => PATHS.find((p) => p.name === n) || null;
// Ready-made mixes, so nobody has to pick from seventy boxes.
export const BUNDLES = [{"name": "Careful coder", "switch": false, "shares": [["Look before you touch", 25], ["Reproduce first", 15], ["Smallest change", 20], ["Pilot's checklist", 15], ["Fail out loud", 15], ["Leave it tidy", 10]]}, {"name": "Debugger", "switch": false, "shares": [["Suspect list", 30], ["Cheapest test first", 25], ["Don't guess, measure", 20], ["Reproduce first", 15], ["Sanity check the size", 10]]}, {"name": "Honest helper", "switch": false, "shares": [["Headline first", 25], ["Say how sure", 20], ["Mark the gaps", 15], ["Restate the ask", 20], ["Ask only when stuck", 20]]}, {"name": "Planner", "switch": false, "shares": [["Find the goal behind the ask", 20], ["Hunt the constraints", 20], ["Options menu", 20], ["And then what?", 20], ["Long view", 20]]}, {"name": "Tutor", "switch": true, "shares": [["Hints, not answers", 40], ["Example first", 25], ["Plain words", 20], ["Encourager", 15]]}, {"name": "Stress tester", "switch": false, "shares": [["Edge cases first", 30], ["Try to break it", 30], ["Think like the opponent", 20], ["Two ways, then compare", 20]]}, {"name": "Fast chat", "switch": false, "shares": [["Headline first", 35], ["Concise", 30], ["Good enough, stop", 20], ["Fast, then slow", 15]]}, {"name": "Game master", "switch": true, "shares": [["Storyteller", 35], ["Think like the opponent", 20], ["Detective", 25]], "mood": "Dramatic"}];
// Pairs that fight when both are above about 30 percent in a blend (fine as a switch pair).
export const CLASHES = [[["Concise", "Quick and rough"], ["Thorough", "Prove it", "Two ways, then compare"]], [["Blunt"], ["Empathetic", "Peacemaker", "Encourager"]], [["Hints, not answers"], ["Headline first"]], [["Good enough, stop"], ["Several drafts"]], [["Smallest change"], ["Several drafts"]], [["Don't guess, measure"], ["Prove it"]]];
export function clashes(shares = {}) {
  const hi = (n) => (Number(shares[n]) || 0) > 30;
  return CLASHES.flatMap(([a, b]) => a.filter(hi).flatMap((x) => b.filter(hi).map((y) => [x, y])));
}
// Personality rows, crossed with each other: alignment, the rules axis, and mood (a voice, best taught as a switch).
export const PERSONALITY = {
  alignment: [['good', 'Good', 'Kind, fair, looks out for others.'], ['neutral', 'Neutral', 'Even-handed; does the job without taking sides.'], ['evil', 'Evil', 'Scheming, sardonic and self-serving in how it talks and reasons. Tone and character only: the refusals Bob always keeps stay unless you take them out separately.']],
  rules: [['book', 'By the book', 'Follows the given rules, docs and plan even when a shortcut is tempting.'], ['middle', 'In the middle', 'Follows the rules unless there is a good reason not to.'], ['bends', 'Bends the rules', 'Looks for the clever shortcut and says so.']],
  mood: [['cheerful', 'Cheerful', 'Upbeat, finds the bright side.'], ['calm', 'Calm', 'Even, unhurried, reassuring.'], ['deadpan', 'Deadpan', 'Dry, flat, understated.'], ['grumpy', 'Grumpy', 'Put-upon but helpful.'], ['dramatic', 'Dramatic', 'Everything is a saga.'], ['curious', 'Curious', 'Delighted by the problem itself.']]
};
// What one run can teach, side by side, with a share each (section 12).
export const TEACH = [['thinking', 'Thinking', 'How often it thinks first, out of 100. The thought paths and personality are below.'], ['answers', 'Answers and knowledge', 'Plain questions answered well.'], ['tools', 'Tools', 'Picking and using the right tool.'], ['coding', 'Coding', 'Writing and fixing code.'], ['writing', 'Writing', 'Letters, stories and summaries.'], ['voice', 'Voice', 'How strongly it sounds like the brain you want, out of 100.']];
