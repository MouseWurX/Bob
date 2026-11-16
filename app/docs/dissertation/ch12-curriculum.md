# Chapter 12. Teaching it: a curriculum from first concepts to engineering

## 12.1 Introduction and research question

Chapters 3 to 11 describe tools, measurements and a method. A reader who has never trained a model cannot follow them. Most of the people who would benefit from the thesis are not machine learning engineers. They are people who run a local model on their own computer and want to know why it behaves as it does.

This chapter describes the course that Bob offers to those people. The course is part of the Computer Science Lab, the optional workshop inside Bob where a user cuts, heals, tests and teaches a model. The course runs from "what is a word to a model" to "how do we test a model without fooling ourselves". Its units draw on the thesis chapters, and some of them show real measured results from those chapters.

The research question for this chapter is a design question, not a result question: **can a course be built so that a learner who starts with no background reaches the engineering ideas of this thesis, using their own model and real measurements, without the course ever becoming a source of training data or research data?** The chapter answers it as a design. It does not claim the course works. No learner has used the course in a study, and section 12.10 describes the study that has not been run.

Three facts about status must be stated at the start.

1. The Learn tab exists in the code. In the checkout read for this chapter it holds three guided experiments: what a token is, how a model picks the next word, and what temperature does (app/src/lab-learn.js, app/public/lab-learn.js).
2. The course shipped in release 1.5.239 (PR #265, 15 November) as 42 lessons in app/src/lab-lessons.js (43 from 16 November, when Watching the router was added) and app/public/lab-lessons.js, under Lab, Learn, Lessons. It is off until the learner turns on the setting Lab: Lessons (labLessons). The levels, units and lessons in this chapter are read from that file on main.
3. The learner study of section 12.10 has not been run. Nothing here is evidence that learners learn.

This chapter describes design. It does not reproduce lesson texts. The lessons are written in Bob's own voice as part of the course work, and section 12.8 explains why lesson text is kept apart from training and research data.

## 12.2 Related work

The course design rests on four bodies of work from computer science and science education. This section covers each briefly and says what the course takes from it. The citations are limited to papers whose pages were opened while writing the chapter.

### 12.2.1 Worked examples

A teaching guide from the MIT Teaching and Learning Lab reports a 1985 study by Sweller and Cooper on worked algebra examples. In its summary, replacing practice problems with worked examples gave higher learning gains, and learners who solved the problems took almost six times longer (MIT Teaching and Learning Lab, n.d.). The primary paper's page could not be opened, so this chapter cites the guide, not the paper. The same guide, citing other work, adds two warnings: passive demonstrations weaken the effect, and learners with substantial prior knowledge may do worse with worked examples.

The course takes two lessons from this. First, a unit should begin with a fully worked case, so a novice sees the whole move before trying it. Second, the worked case must prompt the learner to do something, and later units should hand over more of the work.

### 12.2.2 Active learning

Freeman et al. (2014) analysed 225 studies of undergraduate science, engineering and mathematics courses. Active learning raised exam and concept-inventory scores by about 0.47 standard deviations, and students in lecture-based courses were about 1.5 times as likely to fail. The review compares courses, not software, and its authors' subjects are university classes. It says nothing about a self-paced tool on a home computer.

Chi and Wylie (2014) offer a finer scale. Their ICAP framework sorts learner behaviour into four modes: passive, active, constructive and interactive. They predict that outcomes rise in that order. In this course, the Read part is passive. Trying something on one's own model is active. Predicting a result before seeing it, or explaining it afterward, is constructive. The course has no interactive mode, because Bob has no second learner. This is a limit, and section 12.11 returns to it.

### 12.2.3 Interactive notebooks

Kluyver et al. (2016) describe Jupyter notebooks as a document format that combines code, results and explanation in a form that readers can both read and run. Notebooks are the usual vehicle for teaching machine learning. They assume that the learner can install Python, run a cell and read a traceback.

The Lab course makes a different trade. It keeps the notebook's central idea, that text and a live result sit side by side, but removes the programming. The learner moves a slider or presses a button. The Engineering level later asks for a little code, once the learner has the concepts.

### 12.2.4 Explorable explanations

Victor (2011) argues that text should be a space for thinking: readers should be able to change assumptions in the model behind the text and see what follows. Smilkov et al. (2017) built this idea for neural networks as TensorFlow Playground, an open-source visualisation in which users adjust network settings directly and see the effect, with the aim of building intuition for hyperparameters and architecture.

The Lab's Learn tab follows this tradition. Its main difference is the object being explored. Playground trains a toy network in the browser. Bob's cards run on the model the user has loaded, so a learner sees the behaviour of the real thing, at the cost that real models are slow and a little unpredictable.

### 12.2.5 What the literature does not tell us

None of these sources studies local language models, mixture-of-experts layouts, or the faults in synthetic training data. The course carries no prior evidence that its particular design works. It borrows well-supported general principles: show worked cases, make the learner act, and let the learner manipulate the thing being taught. Whether these principles transfer to this subject matter is an empirical question for the study in section 12.10.

## 12.3 Pedagogical design

### 12.3.1 The lesson shape

Every lesson in the course has the same three parts, in the same order: Read, Try it and Check. Eleven of the 43 lessons also show a Real result inside the Read part, and five show a From the research panel (app/src/lab-lessons.js). The fixed order is deliberate. A learner who has seen one lesson knows where to look in the next, which reduces the effort of navigating and leaves more for the content.

| Part | What the learner does | Mode in ICAP terms |
|---|---|---|
| Read | Reads a short plain-words explanation in Bob's voice. | Passive, with a worked case |
| Try it on your own model | Changes one control on the loaded model and watches the result. | Active |
| Check | Answers two multiple-choice questions; each answer says why. | Constructive |
| Real result | In 12 lessons, reads a measured finding from the project's docs. | Passive reading of evidence |

The Read part is short on purpose. The Learn tab's existing cards already follow the same rule at card level: one question, one control, one result, and one sentence from Bob that says what the learner just saw (cs-lab-learn-and-tinker.md, section 1). The lessons extend that pattern. The Read part adds background before the control, and the Check and Real result add a test and a piece of evidence after it.

The Try it part runs a read-only step on the learner's own loaded model, or opens the Lab page that does the real job (app/src/lab-lessons.js). The design rule from the Learn tab is that nothing needs downloading and every run lasts a few seconds. A card that has no model to run on says so and offers to load a small one.

### 12.3.2 The Check

The Check part has two jobs. It gives the learner feedback, and it gives the course a record that the learner did the exercise. In the shipped course each Check is two multiple-choice questions, and every answer says why. The design also wants a prediction before the result, a constructive act in the sense of Chi and Wylie (2014); the shipped lessons do not ask for one yet.

A check answers the learner, not the thesis. Check answers are not saved; the only thing saved is which lessons are done, in the Lab folder (app/src/lab-lessons.js). Section 12.8 explains why.

### 12.3.3 The Real result panel

The Real result panel is the part that most distinguishes this course from a generic tutorial. After the learner tries something on their own model, the panel shows a measured result from the thesis that bears on the same idea. A learner who opens the Lab's experts-per-word test then reads what happened to a full-size model when the same dial was turned.

Each shipped panel names its source file in the repository's docs, so a learner can follow it. Most panel numbers are also on the thesis's checked-numbers list; one is not (the 72 to 76% expert-overlap figure, from MAKING-SMALLER-MODELS.md). No shipped panel quotes the test leak. The leak is taught in the Held-out tests and Writing a leak check lessons without a number.

This rule is an honesty rule as well as a teaching rule. A course that teaches "judge a brain" while quoting numbers it cannot back would teach the opposite of its lesson.

From 16 November a second kind of panel, From the research, shows a finding from someone else's published work, with the authors, the year and a link. It is labelled "not my own" and styled apart from the Real result, so a learner can always tell the project's measurements from other people's. Five lessons carry one: Routers and Watching the router (the Hugging Face MoE training handbook, Tazi, von Werra and Wolf, 2026, with MaxVio from Wang et al., 2024), Experts per word and Scoring experts (Chen and Yao, 2026, the second as a caution against cutting), and Learning from rewards (Ma et al., 2025, on routing replay). The course test requires each to name a year and an https link.

### 12.3.4 Voice and plain words

All lesson text is in Bob's voice: first person, plain words, no jargon without a gloss. This follows the existing Learn tab, whose one-line summaries speak as Bob ("Every word I write is a roll of weighted dice"). The wording rule matches the project's contributing rules: every new feature gets a Help page, a glossary entry and an FAQ, written in Bob's voice (CLAUDE.md).

A consequence is that the course is the same size of risk as any other Help text. A lesson that overstates a result misleads in Bob's voice. The Real result panels, which quote measured data only, are the main protection.

### 12.3.5 Honesty lines

The Lab design already carries honesty lines that the course inherits. The temperature card says "where I usually sit", not "best". The peek-inside card says that experts split work by the pattern of the words more than by topic, so a learner does not expect a coding corner (cs-lab-learn-and-tinker.md, sections 5 and 8). The challenge packs say their scores are not comparable with published benchmark numbers. The course adds one more: where a lesson depends on a result that rests on a small test, it says so in the panel.

## 12.4 The curriculum

The course has 43 lessons in 17 units across three levels (app/src/lab-lessons.js). The levels differ in what they ask of the learner and in how much they assume. In the code, Foundations is what each idea is, tried on your own brain; Advanced is the maths behind each idea; Engineering builds the tools that change brains from Bob's own code, and five of its lessons show a short code sketch.

| Level | Units |
|---|---|
| Foundations (5 units, 17 lessons) | Words; Inside a brain; Talking to a brain; Changing a brain; Judging a brain |
| Advanced (7 units, 15 lessons) | How brains learn; Transformers; Mixture of experts; Making brains smaller; Data decides habits; Agents and tools; Training beyond copying |
| Engineering (5 units, 11 lessons) | Build the tools; Inference engines; Training at scale; Testing that tells the truth; Looking inside |

### 12.4.1 Foundations

The Foundations level assumes nothing. It follows the order in which a newcomer meets a model. First, a model reads pieces, not words. Second, a model is a large set of numbers arranged in layers. Third, you steer it by what you type and by a few settings. Fourth, you can change the model itself. Fifth, you need a way to tell whether the change helped.

The three existing Learn cards map onto the Words unit, whose four lessons are tokens, next-word odds, temperature and sampling, and context. The Check at this level uses recall and simple prediction, because these learners have no vocabulary to explain with.

Learning objectives for Foundations. After this level a learner should be able to:

1. Say that a model reads tokens and not letters, and that this affects how much fits in its memory.
2. Say that each word is chosen from weighted odds, and that temperature reshapes those odds.
3. Describe, in one sentence each, three ways to change a model: what you ask, how you set it up, and what you train it on.
4. Say why one run on one small quiz is weak evidence, using the measured noise of the project's own quiz: a 97-question quiz moves 3 to 5 between runs (MAKING-SMALLER-MODELS.md).

The fourth objective is the early seed of the thesis's method chapter. A learner who leaves Foundations knowing that test scores move on their own has already learned the most useful single idea in the project.

### 12.4.2 Advanced

The Advanced level assumes the Foundations ideas and adds the mechanism. It explains why a model learns, what a transformer is, how mixture-of-experts layers route work, and what the project's own cutting and healing did. It then turns to the central point of the thesis: that training data decides habits. The final two units cover how a model uses tools, and ways of training beyond copying examples.

Learning objectives for Advanced. After this level a learner should be able to:

1. Explain that a model learns by reducing its error on examples, and that a teacher's faults are copied along with its skills.
2. Explain that a mixture-of-experts model sends each word to a few of many experts, and that cutting experts is a trade between size and ability.
3. Explain that a fault in training lessons, such as handing code off to a tool, can become a habit in the trained model.
4. Distinguish what a tool's wording changes from what a lesson's content changes.
5. Say, in plain words, what methods that train beyond copying (preference training and reward-based training) try to do differently. This objective rests on background reading, not on a measured result in this thesis.

The Mixture of experts unit gained a third lesson on 16 November, Watching the router: how to read MaxVio, the router's certainty and expert output sizes, and why a heal is checked for routing drift as well as for scores.

Training beyond copying has no Real result panel, because the project has not run any such training. Several other units also have none in the shipped course (section 12.5). The unit says so, and it teaches the idea from the literature in Chapter 2 and no more.

### 12.4.3 Engineering

The Engineering level assumes the Advanced ideas and asks the learner to act like an engineer: build or run the tools, choose an inference engine, think about training at scale, design a test that tells the truth, and look inside a model. It is the level that most resembles the thesis.

Learning objectives for Engineering. After this level a learner should be able to:

1. Describe what a custom inference engine adds and what must be checked after modifying one, including that a switched-off expert path should leave output unchanged when nothing is switched off.
2. Describe the steps of a training run on rented hardware, and why a pre-flight check in code should run before money is spent.
3. Design a test whose held-out items are checked against the training files, and explain why this check comes first.
4. Read a patching result, say which parts of it are noise, and say what the test does not prove.
5. State the difference between a part of a model that causes a habit and a part that holds it back.

The Engineering level asks for more reading of evidence and less guided clicking. This follows the point from the worked-example literature that novices and experts need different support, and that the scaffolding should fade as skill grows (MIT Teaching and Learning Lab, n.d.).

## 12.5 How units draw on the thesis chapters

Eleven of the 43 lessons carry a Real result panel. An earlier draft of this chapter counted twelve: the Experts panel (the 72 to 76% overlap figure) was removed in the 15 November fact-check, because that figure is not on the checked list. The table lists each one as shipped in app/src/lab-lessons.js, with the thesis chapter it draws on and the source file the lesson names. Units not listed have no panel.

| Lesson (unit) | Thesis chapter | Real result the panel shows | Source the lesson names |
|---|---|---|---|
| Lessons and fine-tuning (Changing a brain) | 5 | 37% of the first coding lessons handed code off; coding did not move after a full heal; clean coding lessons took Riker from 6 to 9 of 13. | MAKING-SMALLER-MODELS.md |
| Cutting experts (Changing a brain) | 9 | At 208 of 256 experts, skills keep 97 to 98% of routing and general knowledge 90%; at 144, 87 to 90% and 66%. Layer 2 is the worst layer for every skill. | counts ladder (ladder.md) |
| Healing (Changing a brain) | 9 | A heal cannot grow back a removed expert, so deep cuts are planned as a gentle cut plus a heal. A design statement, no number. | MAKING-SMALLER-MODELS.md |
| Loss (How brains learn) | 9 | Healing Riker took held-out lesson loss from 0.401 to 0.362; the teacher scored 0.324. | FORGE-JOURNAL.md |
| Attention heads and memory (Transformers) | 9 | Needle test: Riker found 12 of 12 at 8K, 32K, 64K and 128K, the same as full Qwen. | FORGE-JOURNAL.md |
| Experts per word (Mixture of experts) | 9 | Full Qwen at 8, 6 and 4 experts per word: 45/97 tools, 20/20 facts, 6/6 code, at 82.7, 92.1 and 102.5 tokens a second; 3 drops to 26/97 and 4/6; 2 collapses to 1/97 and 0/6. | experts-per-word benchmark |
| Scoring experts (Making brains smaller) | 9 | REAP trims with no heal on 314 held-out turns at 100, 75, 50 and 35% kept: Bobert 204, 204, 198, 145; Riker 210, 204, 163, 72. | MAKING-SMALLER-MODELS.md |
| Lessons teach habits (Data decides habits) | 5 | 37% of the first coding lessons handed code off; clean coding lessons took Riker from 6 to 9 of 13 (full Qwen 12). | MAKING-SMALLER-MODELS.md |
| Cleaning a lesson set (Data decides habits) | 6 | First cleaning: 9,059 to 8,828 lessons (73 duplicates, 123 with no final answer, 28 unknown tools, 6 loops, 1 empty). | MAKING-SMALLER-MODELS.md |
| Counting experts (Build the tools) | 9 | The coverage rule: keep enough experts in every layer for 95% of each job's routing (99% for tools, coding and exact formats), and keep the union. A rule, no number. | MAKING-SMALLER-MODELS.md |
| Building an eval harness (Testing that tells the truth) | 4 | A 97-question quiz moves 3 to 5 between runs. | MAKING-SMALLER-MODELS.md |

No shipped panel shows the full read of the tool lessons, the test leak, tool wording, coaching, the Brain Engine checks or the Riker brake and patching. The two coding panels give 6 to 9 of 13 without the caveat of chapter 5: the re-cut Riker also kept 208 experts against 176 for Riker v1 and v2 (FORGE-JOURNAL.md).

### 12.5.1 A note on the pipeline panels

The Training at scale unit could show a real failure that cost little; its shipped lessons have no panel yet. On one round of clean-lesson making, a sample gate required the first 10 ideas to save at least 60%. Only 1 of the 10 saved, so the run stopped and the rented machine was deleted after about $0.31 (forge console log of the lkt-fix3 run, as checked on 15 November). A learner would read this as a worked example of why a cheap check goes before an expensive step, and as a case where a safeguard worked.

### 12.5.2 Choosing what to show

Three rules govern which results appear in a panel.

1. Only measured results from the project's docs. The design asked for the checked list only; one shipped panel (the 72 to 76% overlap) is from the docs but not on that list.
2. Binding exclusions stay excluded. Two figures from older runs are marked "do not use" in the checked list because they were not confirmed. No panel quotes them.
3. Status should be part of the panel: a panel should say when a result is not re-tested or rests on a small test. The shipped panels do not yet carry such lines, and two coding panels give 6 to 9 of 13 without the cut caveat of chapter 5.

These rules mean some interesting results never reach learners. That is the cost of a course that can be trusted.

## 12.6 The unit on judging a brain: a worked design example

This section describes one unit's design in more detail, because it shows how the parts fit together. The shipped unit is simpler: two lessons, Held-out tests and Honest results, whose Try opens the Lab's Test page, with no Real result panel; the quiz-noise panel sits in the Engineering lesson Building an eval harness. Judging a brain is the first unit where the course connects to the thesis's main claim.

The Read part explains in plain words that a score is a measurement and every measurement has noise. It introduces held-out items: questions a model was never trained on. The Try part has the learner run the same quiz twice on their own model and compare the scores, so they see for themselves that the number moves. The Check asks the learner to predict whether a one-point difference between two models is meaningful, and then shows them how much their own two runs differed.

In the design, the Real result panel then shows the project's own figures: the 97-question quiz moves 3 to 5 between runs, and 519 of 534 held-out items turned up word for word in training-side files. The panel states that the leak means past scores on that test may be too high, and that how much too high has not been measured.

This unit does not teach the learner the full leak-checking method. That is the job of Testing that tells the truth, in the Engineering level. The two units are a spiral: the first plants the idea, and the second builds the skill. The spiral is a design choice meant to give the learner a reason to care before the machinery arrives.

## 12.7 Accessibility

The design requires that a learner who cannot see, hear or use a pointer can complete every lesson. The rules below come from the Lab design (cs-lab-learn-and-tinker.md, sections 2, 3 and 8) and from what the Learn tab's code already does.

| Rule | How it is met |
|---|---|
| Real tabs for screen readers | The Lab tabs use tablist, tab and tabpanel roles, with arrow keys moving between them. |
| Results announced | Each result area is a polite live region, so the summary sentence is read out when it lands. |
| No meaning by colour alone | Token chips alternate shade and border style. Odds bars carry the percentage as text. |
| Every chart has a table | Every value that appears in a chart also appears in a table, so the chart is never the only place a number lives. |
| Sliders with number boxes | Each range input is paired with a number input, which helps keyboard users and people who cannot drag precisely. |
| Reduced motion | Animations such as the light-up in peek inside turn into a plain redraw when the user asks for reduced motion. |
| Labelled controls | Each input has a label element, and buttons that choose among options carry a label that includes the odds. |

These rules map onto the Web Content Accessibility Guidelines 2.1 (W3C, 2025). The criterion on use of colour (1.4.1) is the reason for the shade-and-border rule, and the criterion on animation from interactions (2.3.3) is the reason for the reduced-motion rule. The thesis has not run an accessibility audit. These are design rules and code features, and a screen-reader test with real users is not done. Section 12.11 lists it among the limits.

Platform coverage is a related access concern. The project rule is that everything new works on Windows, Mac, Linux and Android, or says where it does not (CLAUDE.md). The Learn tab needs only a running model and ordinary chat endpoints, so it could work on a phone. A decision on whether the phone gets Learn alone was put to MouseWurX in the design (cs-lab-learn-and-tinker.md, section 9). Engineering-level units that need the Lab's machinery, such as rented training, are desktop-only and say so.

## 12.8 Lessons are never training data

The course uses the word "lesson" for teaching a person. The Lab also uses the word "lesson" for a set of examples used to train a model. The two must not be confused, and the design keeps them apart with three rules.

1. **Course lessons are never training data.** Text written to teach a person is never added to any lesson set used to train a model. The thesis method keeps held-out and training material apart (Chapter 4). The course extends the rule across the person-and-model boundary.
2. **Learner runs never mix into research data.** What a learner types, the answers their model gives, and their Check responses stay on their own machine. Nothing is sent anywhere. The Lab design says there is no online leaderboard, no account and no upload (cs-lab-learn-and-tinker.md, section 6). The thesis's checked numbers come only from the project's own runs on its own files.
3. **Panel numbers come one way.** Measured results flow from the thesis into the panels. Learner results never flow back.

There are two reasons for these rules. The first is research validity. This thesis is about hidden faults that leak between training material and test material. A course that fed learner output back into training or test sets would recreate the same fault at a small scale. The second is privacy. A learner's prompts can hold private text. Keeping them local means the course needs no consent process for data it never collects.

The cost of the rule is that the project cannot learn how learners use the course without a separate, consented study. Section 12.10 describes how such a study would collect its data on its own terms, apart from the Lab.

A further point concerns the Save feature. The Lab's Save button lets a learner keep a result as a picture, text or data. The design says a saved card never carries file paths, chat text, the user's name or the machine's name, and that the graphics card and memory are left off unless the learner ticks a box (cs-lab-learn-and-tinker.md, section 7). The learner decides what leaves their machine.

## 12.9 Opt-in and cost

The whole Lab, including the course, is off by default. A user turns it on with the setting "Show the Computer Science Lab". The course has its own switch on top, Lab: Lessons (labLessons) in Settings, How Bob works, Brains, off by default (app/src/lab-lessons.js; release notes 1.5.239). Nothing runs by itself; each run is a button press. This follows the project rule that everything new is off by default.

The Learn level costs nothing beyond the user's own electricity. It runs on the loaded model and uses endpoints Bob already has. The design says no rentals are used anywhere in the Learn, Playground and Challenges parts (cs-lab-learn-and-tinker.md, section 8). Any Engineering unit that would need rented hardware shows a recorded result instead of asking the learner to rent. The learner reads the pre-flight story of section 12.5.1 and does not pay for it.

## 12.10 Evaluation plan (not run)

**This evaluation has not been run. No learner has taken part, and the thesis reports no learner results.** The plan below says what would be done and how the result would be read.

### 12.10.1 Question and hypotheses

The question is whether a learner who completes a level of the course understands its ideas better than before. Three hypotheses follow, one per level.

- H1. After Foundations, learners score higher on a Foundations quiz than before.
- H2. After Advanced, learners score higher on an Advanced quiz than before.
- H3. After Engineering, learners score higher on an Engineering quiz than before, and can find the fault in a described test design.

None of these has been tested. The thesis makes no prediction about effect size. Choosing a minimum worthwhile effect before the study starts is part of the plan.

### 12.10.2 Design

The study is a pre/post design with a comparison group.

| Element | Plan |
|---|---|
| Participants | Adult volunteers who already run local models, plus volunteers who do not. The two groups are analysed separately. |
| Groups | Course group: does the units. Reading group: reads the same Read texts without the Try, Check or Real result parts. |
| Allocation | Random assignment within each background group. |
| Measures | A knowledge quiz before and after each level; a short task at the end of Engineering; a confidence rating. |
| Quiz items | Written and fixed before the study starts, with two parallel forms so that the post-test is not the pre-test. |
| Delay | A second post-test some weeks later to check retention. |
| Analysis | Compare gain scores between groups, with confidence intervals, and report all groups, including any that did poorly. |

The reading group exists to test the main design claim: that Try, Check and Real result add something beyond Read. This follows Chi and Wylie (2014), who predict that active and constructive behaviours beat passive reading, and Freeman et al. (2014), whose review found gains from active methods in university courses. The study would show whether this holds for this course. It might not.

### 12.10.3 Applying the thesis's own method

The thesis argues that tests leak and that noise hides small differences. The learner study must meet the same standard.

- **Leak-free items.** Quiz items must not appear in any lesson text, Check, or Real result panel. This is the leak check of Chapter 7 applied to a human test. Items would be compared with the course text word for word before the study.
- **Noise.** A short quiz is noisy, as the project's 97-question model quiz shows. The study would need enough items and enough participants that a gain can be told from chance. The sample size is not chosen here and would be set by a power calculation before recruitment.
- **Full reporting.** All pre-registered measures are reported, including those that show no gain.
- **Privacy.** Study data would be collected in a separate, consented tool, not through the Lab. This keeps rule 2 of section 12.8 intact.

### 12.10.4 What would count as failure

The course would be judged not to work if the course group's gain is no larger than the reading group's, or if gains disappear at the delayed post-test. A null result on a level would lead to a redesign of that level. It would not be buried.

### 12.10.5 Other evidence the study should collect

A pre/post quiz says whether learners gained, not why. The study would also record where learners stop, which units they skip, and which Check questions they get wrong most often. These are inputs to design, kept separate from the primary hypotheses.

## 12.11 Threats to validity and limits

This section covers the design claims of the chapter, since there are no learner results to threaten.

1. **No learner evidence.** The strongest limit. Everything in sections 12.3 to 12.9 is design. The benefits drawn from the literature come from other subjects and other settings.
2. **Course read from code, not from use.** The 17 units and 43 lessons were read from app/src/lab-lessons.js on main (release 1.5.239). Reading the file confirms the structure, not that each lesson works as written on every model.
3. **Literature gap.** The cited work studies university classes and general visualisation tools, not local language models. Transfer is assumed.
4. **Worked-example source.** The Sweller and Cooper paper's own page could not be opened. Its finding is reported through a teaching-centre summary that cites it. A reader who needs the primary result should read the paper.
5. **Single-learner mode.** There is no interactive mode in the ICAP sense, because a learner works alone. A classroom version with discussion is not designed.
6. **Evidence panels inherit the thesis's limits.** A panel is only as strong as its source result. Several sources rest on small tests with noise, such as the 6-ask patching runs. Each panel states this.
7. **Accessibility not audited.** The rules follow accepted guidance, but no audit or user test with assistive technology has been done.
8. **Staleness.** The panels quote results as checked on 15 November 2026. Later runs, such as the decisive retrain, would change what the course should say. The course needs a rule to refresh panels, and that rule is not yet built.

## 12.12 Summary

The course gives a learner with no background a route to the thesis's ideas in 43 lessons, 17 units and three levels. Each lesson has a Read, a Try it and a Check, 11 lessons add a Real result panel of measured data, and 5 add a From the research panel citing other people's published work. The design draws on worked examples, active learning, interactive notebooks and explorable explanations. It aims at the thesis's own honesty rules: panels name their source and never quote excluded figures, though one panel number is not on the checked list and two coding panels lack the cut caveat.

Two rules protect the research. Lessons for people are never training data, and learner runs never mix into research data. Accessibility rules are built into the Learn tab, but have not been audited.

The chapter answers its design question only as a design. No learner has used the course in a study. The evaluation plan, a pre/post comparison with a reading-only group, has not been run. Chapter 13 lists it among the work not yet done.

## References

- Chen, X., & Yao, H. (2026). Training-Free Halving of Activated Experts in Fine-Grained Mixture-of-Experts Models. arXiv:2609.04575. https://arxiv.org/abs/2609.04575
- Chi, M. T. H., & Wylie, R. (2014). The ICAP Framework: Linking Cognitive Engagement to Active Learning Outcomes. Educational Psychologist, 49(4), 219-243. https://csi.asu.edu/wp-content/uploads/2018/01/ChiWylie2014ICAP.pdf
- Freeman, S., Eddy, S. L., McDonough, M., Smith, M. K., Okoroafor, N., Jordt, H., & Wenderoth, M. P. (2014). Active learning increases student performance in science, engineering, and mathematics. Proceedings of the National Academy of Sciences, 111(23), 8410-8415. https://experts.umn.edu/en/publications/active-learning-increases-student-performance-in-science-engineer/
- Kluyver, T., Ragan-Kelley, B., Perez, F., Granger, B., et al. (2016). Jupyter Notebooks: a publishing format for reproducible computational workflows. In Positioning and Power in Academic Publishing: Players, Agents and Agendas, pp. 87-90. IOS Press (20th International Conference on Electronic Publishing). https://eprints.soton.ac.uk/403913
- Ma, W., Zhang, H., Zhao, L., Song, Y., Wang, Y., Sui, Z., & Luo, F. (2025). Stabilizing MoE Reinforcement Learning by Aligning Training and Inference Routers. arXiv:2510.11370. https://arxiv.org/abs/2510.11370
- MIT Teaching and Learning Lab (n.d.). Worked Examples. A teaching guide that reports Sweller and Cooper (1985); the primary paper's page could not be opened, so the guide is cited instead. https://tll.mit.edu/teaching-resources/how-people-learn/worked-examples/
- Smilkov, D., Carter, S., Sculley, D., Viegas, F. B., & Wattenberg, M. (2017). Direct-Manipulation Visualization of Deep Networks. arXiv:1708.03788. https://arxiv.org/abs/1708.03788
- Tazi, N., von Werra, L., & Wolf, T. (2026). The Ultimate MoE Training Handbook. Hugging Face. https://huggingface.co/spaces/huggingface/moe-blogpost
- Victor, B. (2011). Explorable Explanations. https://worrydream.com/ExplorableExplanations/
- W3C (2025). Web Content Accessibility Guidelines (WCAG) 2.1. W3C Recommendation. https://www.w3.org/TR/WCAG21/
- Wang, L., Gao, H., Zhao, C., Sun, X., & Dai, D. (2024). Auxiliary-Loss-Free Load Balancing Strategy for Mixture-of-Experts. arXiv:2408.15664. https://arxiv.org/abs/2408.15664
