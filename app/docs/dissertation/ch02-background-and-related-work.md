# Chapter 2. Background and related work

This chapter reviews the work that the thesis stands on. It is the main literature review. It has eleven sections, each tied to a part of the project: the models (2.1), the ways they are made smaller (2.2), the ways they are taught (2.3), the data they are taught from (2.4), the tests that judge them (2.5), their use as agents (2.6), their reasoning (2.7), their later training (2.8), the methods used to look inside them (2.9) and the software that runs them (2.10). Section 2.11 sets out the gaps that this thesis addresses.

Every paper cited here was opened and read on its public page before it was cited. Where a statement rests on a paper's abstract and summary and not on a full reading of its method, we say "reports" and keep the claim to what that page states. Numbers inside the project's own studies come only from the checked numbers file and the project's run reports, and are cited by file name.

## 2.1 Transformers and mixture-of-experts language models

### 2.1.1 The transformer

Modern language models are built on the transformer, introduced by Vaswani et al. (2017) in "Attention Is All You Need". A transformer reads a sequence of tokens, which are word pieces. It turns each token into a vector and passes the vectors through a stack of layers. Each layer has two main parts: an attention step, in which each position looks at other positions, and a feed-forward step, which transforms each position on its own. Between layers, a running vector for each position carries information forward. This running vector is often called the residual stream, and it matters later in this thesis, because many interpretability methods read from it or write to it.

A language model of this kind predicts the next token. It is trained on very large text collections, and then often adjusted with further training to follow instructions and to use tools. Most of its parameters sit in the feed-forward steps and in the attention projections. Making a model smaller therefore means removing or compressing parts of these.

### 2.1.2 Sparse mixture of experts

A dense model uses all of its feed-forward parameters for every token. A mixture-of-experts (MoE) model replaces each feed-forward step with many smaller ones, the experts, and a small router that picks a few of them for each token. Shazeer et al. (2017) introduced the sparsely-gated mixture-of-experts layer for language models. Their title says what the idea buys: outrageously large networks, whose capacity grows with the number of experts while the work per token stays close to that of a few experts.

Fedus et al. (2021) simplified the routing in Switch Transformers by sending each token to a single expert, and reported scaling to models of a trillion parameters. Jiang et al. (2024) described Mixtral, an open model that routes each token to two of eight feed-forward experts. They report that it matches or beats Llama 2 70B and GPT-3.5 while using 13 billion active parameters per token. Dai et al. (2024) proposed DeepSeekMoE, which splits experts into smaller and more numerous ones and sets aside some shared experts that are always active. Their stated aim is to make each routed expert more specialized, and they report that a 16 billion parameter version matches LLaMA2 7B with about 40% of the computation.

The projects in this thesis use models of this family. Qwen3 is a family of dense and mixture-of-experts models, with sizes from 0.6 to 235 billion parameters, that combines a deep-reasoning mode and a fast-response mode in one model (Yang et al., 2025). The gpt-oss models are open-weight mixture-of-experts reasoning models, tuned for agentic work such as function calling and the use of Python tools (OpenAI, 2025). Bob's models start from Qwen3.6-35B-A3B, which activates about 3 billion of its 35 billion parameters per word (Write-up draft). We did not find a technical report for the Qwen3.6 release among the sources we opened. Where we describe it, we rely on the Qwen3 report for the family design and on the project's own measurements for the specifics.

### 2.1.3 Why mixture of experts matters for local use, and for this thesis

For a person with one consumer card, the active parameter count sets the speed, and the total parameter count sets the memory. A mixture-of-experts model gives a large total with a small active part. That trade is what makes a 35 billion parameter model usable on a 16 GB card, once it is made smaller. It also leads to the question that Section 2.2 takes up: if only a few experts fire for each token, can the rarely used ones be removed?

For the interpretability work in Chapter 10, the expert structure adds a second reason to care. A model whose computation is divided into named parts invites the hypothesis that a behavior lives in one part. The router and the expert indices give a natural vocabulary for such a hypothesis. We return to this in Section 2.9, where we ask whether the hypothesis is supported.

### 2.1.4 How the router is trained, balanced and run

Tazi, von Werra and Wolf (2026) wrote a practical handbook for training mixture-of-experts models from scratch on many cards, with a run behind each recommendation. Most of it concerns pre-training at scale: clusters, the exchange of words between cards, and keeping every card equally busy. Three of its themes bear on the work here, which starts from a finished model.

**Router arithmetic.** The router turns its scores into weights, keeps the top k, and usually scales the kept weights to add up to 1. The handbook recommends computing the router in float32, because in BF16 two close scores can tie and a different expert wins, and Switch Transformers diverged with a BF16 router (Fedus et al., 2021). It also reports that serving fewer experts than the model was trained with is sensitive to that scaling. Chen and Yao (2026) measured this on Qwen3.6-35B-A3B, the base model of this thesis. At 4 experts instead of 8, scaling the four to add up to 1 cost 4.65 MMLU points. Dividing by the weight of the top 16 instead cost 0.35, which was not significant. They explain that the top 8 hold only about 18% of the router's probability, so the usual scaling multiplies them about 5.5 times, and fewer experts inflate the expert output further. They also found that word odds and task accuracy favour different settings. Gu et al. (2025) report the opposite direction: running more experts than trained does not help and soon hurts, which they call an inference-time scaling wall.

**Balance.** Balance rules push the router to spread words, either with an extra loss or with a bias that changes only which experts are chosen (Wang et al., 2024). Model makers differ: per the handbook, Qwen3 MoE uses a global-batch loss with no bias, and DeepSeek-V3 a small per-sequence loss plus a bias. The handbook measures balance with MaxVio, the busiest expert's load over the mean, minus 1 (Wang et al., 2024), and its appendix gives per-layer token counts, weight entropy, expert output size against the layer median, and a table from symptoms to causes. The purpose of balance there is speed: a step waits for the busiest card.

**Routing after training.** In reinforcement learning, the engine that writes answers and the trainer can route the same word to different experts. Ma et al. (2025) found this for about 10% of routers on Qwen3-30B-A3B and proposed replaying the recorded routing in the trainer (R3), which they report prevents training collapse. The handbook also notes that one model maker freezes the router during reinforcement learning.

The handbook does not treat pruning, healing or distillation of a finished mixture-of-experts model. It is cited here for the router's arithmetic, its balance and its measures, which chapter 4 (section 4.12.1) turns into rules for the heal.

### 2.1.5 Summary of 2.1

The transformer and the sparse mixture of experts are the settings in which the thesis works. The review so far gives four points that later chapters use. Each token uses only a few experts. The number of experts per token is a dial that can be turned, but how the kept experts are weighed decides how much a lower setting costs. The router is sensitive to precision and to balance rules, which were made for training speed. The residual stream is a place where behavior can be read and changed.

## 2.2 Compressing models

Compression methods fall into three families that the project touched. Quantization stores weights with fewer bits. Pruning removes weights, experts or layers. Distillation, treated in Section 2.3, trains a small model to copy a large one. The project's models rely on all three, and so do most local setups.

### 2.2.1 Quantization

Quantization stores each weight in fewer bits, usually after training. Dettmers et al. (2022) proposed LLM.int8(), which runs the matrix multiplications of a transformer in 8 bits. Their method handles a small set of large-magnitude outlier dimensions separately in 16-bit precision. They report no measurable performance loss for models up to 175 billion parameters, which roughly halves the memory needed.

Frantar et al. (2022) proposed GPTQ, a one-shot method that uses approximate second-order information to lower weights to 3 or 4 bits with little accuracy loss. Lin et al. (2023) proposed AWQ, which finds the small fraction of weights that matter most by looking at activation statistics and protects them by scaling. It needs no backpropagation, and it received the MLSys 2024 Best Paper Award. Dettmers et al. (2023) proposed QLoRA, which fine-tunes adapters through a frozen 4-bit quantized model and lets a 65 billion parameter model be fine-tuned on a single 48 GB card.

For this thesis, quantization matters in two ways. It is how a model reaches a consumer card at all, as Section 2.10 describes. It is also a source of small, hard-to-see changes in model behavior. We did not study quantization error as a research question, and we treat it as a fixed condition of local inference.

### 2.2.2 Weight pruning

Pruning removes parts of a trained model. Frantar and Alistarh (2023) proposed SparseGPT, which prunes models of up to 175 billion parameters in one pass without retraining. They report small loss at 50% sparsity and negligible perplexity increase at 60% unstructured sparsity. The method also works with semi-structured patterns, and it can be combined with quantization.

Unstructured sparsity has a practical limit for local use. Zeros scattered through a weight matrix do not speed up a consumer card unless the software and hardware are built for the pattern. For that reason, the methods that interest a local project the most remove whole structures: experts, layers, channels or heads.

### 2.2.3 Structured pruning and the Minitron recipe

Muralidharan et al. (2024) asked whether an existing model can be pruned and then retrained on a small share of the original data, instead of training every size from scratch. They combined pruning along four axes (depth, width, attention and MLP) with knowledge distillation for retraining. They applied it to a 15 billion parameter Nemotron-4 model, and produced 8B and 4B models that they call Minitron. They report that the smaller models need up to 40 times fewer training tokens each than training from scratch, and that the family as a whole saves 1.8 times the compute. They also report up to a 16% improvement on MMLU over models of the same size trained from scratch.

Sreenivas et al. (2024) described the same approach in practice for Llama 3.1 8B and Mistral NeMo 12B. They compared depth pruning, which removes whole layers, with width pruning, which reduces the hidden, attention and feed-forward dimensions. They also report a practical point that bears on this thesis: when the original training data is not available, lightly fine-tuning the teacher model on the distillation data helps.

The Minitron recipe is a template for the "cut and heal" steps that Bob's models follow. A cut removes structure. A heal retrains the cut model, with the original as a teacher, until it recovers. The thesis differs from Minitron in two ways. The model is a mixture of experts, so the structure to cut is the expert, and the heal data is a project's own lessons, which brings the quality of those lessons into the heal. Chapter 9 takes this up.

### 2.2.4 Expert pruning and REAP

Lu et al. (2024) addressed expert pruning directly in "Not All Experts Are Equal". They propose post-training techniques for pruning and for skipping experts in mixture-of-experts models. Unlike weight pruning, removing whole experts needs no special hardware, and the authors report smaller models and faster inference with acceptable performance across a range of tasks.

Lasby et al. (2025) proposed REAP, router-weighted expert activation pruning. It scores each expert using both its router gate values and its activation norms, with a score chosen to minimize a bound on reconstruction error. They challenge earlier work that favored merging experts. Their finding is that expert pruning is better for generative tasks, because merging loses fine-grained control over routing. They report that REAP beats merging and other pruning methods on generative benchmarks across models from 20 billion to 1 trillion parameters, with the widest advantage at 50% compression. They report near-lossless code generation for two large models after half the experts were pruned.

REAP is the pruning rule behind the project's "REAP trims". These are cuts that keep a share of the experts without any healing step. On 314 held-out turns, at 100, 75, 50 and 35% kept, the REAP trims scored 204, 204, 198 and 145 for Bobert, 210, 204, 163 and 72 for Riker (which was already cut), and 204, 204 and 196 for GPT-OSS 120B at the first three levels (MAKING-SMALLER-MODELS.md). The pattern agrees in kind with the claim of Lasby et al. that pruning half the experts can be close to lossless on a generative task. It adds a caution: a model that was already cut loses more when cut again. The numbers come from the project's own tests, not from the REAP paper's benchmarks, so we do not claim that they replicate it. A counterpoint comes from Chen and Yao (2026). On the same base model and on Qwen3.5-397B-A17B they found the router well balanced and expert use strongly tied to the kind of text, and so saw little room for expert pruning. Their test was general knowledge (MMLU) and arithmetic (GSM8K), while the project's numbers are for its own tool turns. The two need not conflict, but they warn against reading one task's slack as a general one.

The research question about where a habit sits connects here. REAP and similar methods choose experts by how much they matter to a score or a reconstruction. Chapter 10 reports a group of 16 experts that looked like a cause of a harsh habit on a trace and turned out to act as a brake. A pruning rule that keeps the active experts and drops the quiet ones does not tell these two roles apart. We return to this point in Section 2.11.

### 2.2.5 Summary of 2.2

Quantization is solved well enough for local use. Weight pruning is less useful on consumer cards than structured pruning. Structured pruning with distillation, in the style of Minitron, is a proven recipe for dense models. Expert pruning with REAP is a recent and strong rule for mixture-of-experts models. The literature measures compression mostly by public benchmark scores. It says less about what compression does to the habits that a model learned from its lessons.

## 2.3 Knowledge distillation and parameter-efficient fine-tuning

### 2.3.1 Knowledge distillation

Hinton et al. (2015) proposed compressing the knowledge of a large model or ensemble into one smaller model. In the usual form, the small model is trained to match the output probabilities of the large one, and not only the single correct label, so it also learns how the large model ranks the wrong answers. The authors report strong results on MNIST, and that distilling an ensemble into one model significantly improved the acoustic model of a heavily used commercial system.

Distillation takes several forms in the work reviewed so far. Minitron uses it to heal pruned models (Muralidharan et al., 2024). The Qwen3 report states that its smaller models are built using knowledge from the larger flagship models, which lowers training cost (Yang et al., 2025). The gpt-oss card states that the models were trained with large-scale distillation and reinforcement learning (OpenAI, 2025). In synthetic data work, a large model writes lessons that a small model learns from. That is also a form of distillation, with the large model's outputs as the signal, and it is the form this thesis studies most.

In Bob's heal step, the measured quantity is the cross-entropy of the cut model against held-out lesson text, with the teacher's own cross-entropy as a floor. For Riker the heal brought it from 0.401 to 0.362, with the teacher at 0.324. For Bill v1 it fell from 0.585 to 0.501 (FORGE-JOURNAL.md). These are measures of how closely the model copies the lessons. They do not measure whether the lessons were good. We come back to that distinction in Chapter 9.

### 2.3.2 Low-rank adaptation

Full fine-tuning updates every weight. Hu et al. (2021) proposed LoRA, which freezes the original weights and adds small trainable low-rank matrices to the transformer layers. They report that this cuts the number of trainable parameters by roughly 10,000 times against fully fine-tuning GPT-3 175B with Adam, and reduces memory needs about threefold. They also report that LoRA matches or exceeds full fine-tuning on the models they tested, and that it adds no inference latency, since the low-rank update can be merged into the weights.

Dettmers et al. (2023) combined LoRA with a 4-bit frozen base in QLoRA. They fine-tuned over 1,000 models and report that their Guanaco models reached about 99.3% of the performance of ChatGPT on the Vicuna benchmark. They also argue that GPT-4-based evaluation can be a cheap substitute for human evaluation, and that current chatbot benchmarks are not fully reliable. Both points return later in this chapter, in the sections on judges and on contamination.

Parameter-efficient fine-tuning matters here for practical reasons. A person with a consumer card can train small adapters where full training is out of reach. A rented card can train a larger model for fewer dollars. The project's own training pipeline works within hard limits on hours and dollars (Chapter 4), so methods that cut the cost of a pass are valuable. The project's own rule is that its comparisons use full passes, because a partial pass is hard to compare (Chapter 4).

### 2.3.3 What the literature does not say about distillation data

The distillation literature treats the teacher as a source of good signal. For synthetic lessons, the teacher is a model that can make mistakes, and its mistakes are copied. The Minitron practitioners note that the teacher may need a light fine-tune on the distillation data when the original data is not available (Sreenivas et al., 2024). That is a hint that the teacher's distribution matters. It does not tell us how often a teacher's lessons are wrong in ways a script cannot see.

This is the starting point for Section 2.4. If the lessons are the signal, then the quality of the lessons sets the ceiling on what a small model can learn.

## 2.4 Synthetic training data and data quality

### 2.4.1 Self-generated instruction data

Wang et al. (2023) proposed Self-Instruct, in which a pretrained model generates its own instructions, inputs and outputs. The generated examples are filtered to remove invalid or near-duplicate entries, and the model is then fine-tuned on them. Applied to GPT-3, the method gains 33 percentage points on Super-NaturalInstructions and roughly matches InstructGPT-001. In a human study on expert-written instructions for new tasks, the Self-Instruct model was judged better than models tuned on existing public instruction data, though it trailed InstructGPT-001 by about 5 points.

Self-Instruct is the template for most later synthetic pipelines, including Bob's. Its filter is the important part for our purpose. The filter removes invalid and near-duplicate examples. These are the faults that scripts can see. The faults that a script cannot see, such as a plausible but wrong claim or a tool result that no real tool would return, pass the filter.

### 2.4.2 "Textbooks" and small models

Gunasekar et al. (2023) trained phi-1, a 1.3 billion parameter code model, on about 6 billion tokens of web data filtered for "textbook quality" and about 1 billion tokens of textbooks and exercises generated with GPT-3.5. They report 50.6% pass@1 on HumanEval and 55.5% on MBPP, which is a strong result for the size. The paper's claim is that quality of data can stand in for size of model and size of data.

A careful reader should note two features of the study. The data is filtered and generated with a stronger model, so it carries both the strength and the faults of that model. And the evaluation is on public coding benchmarks, which are open to the contamination problem in Section 2.5. The thesis does not dispute the paper's finding. It asks a narrower question that the paper does not answer: when the lessons are for an agent, with tools and multi-step behavior, how good are they in fact, and how would one know?

### 2.4.3 Less is more

Zhou et al. (2023) fine-tuned a 65 billion parameter LLaMa model on just 1,000 carefully selected prompt and response pairs, using only standard supervised training. In a human study, the responses of this model, called LIMA, were rated equal to or better than GPT-4 in 43% of cases, and equal or better than Bard in 58% and DaVinci003 in 65%. The authors conclude that almost all knowledge in large language models is learned during pretraining, and that a small amount of instruction data is enough to teach the style and format of a good answer. This is the "superficial alignment" view.

The view suggests a prediction for a small, cut model that has lost some of its pretraining knowledge through compression: the cut model needs more from its lessons than LIMA's model did. Our results do not test this. They do show that a small lesson set can matter a great deal when it carries a fault, as with the 37% of coding lessons that handed the job to a tool (MAKING-SMALLER-MODELS.md).

### 2.4.4 Filtering for quality

Chen et al. (2023) argued that the 52,000 examples in the Alpaca dataset contain many low-quality entries, with wrong or off-topic answers. They used ChatGPT to score each example and kept about 9,000 higher-quality ones. The resulting model, AlpaGasus, beat the original Alpaca under GPT-4 and human judging. Their 7B version trained about 5.7 times faster. The paper supports two points that matter here. A strong model can be used as a reader of lessons. And fewer, better lessons can outperform more, noisier ones.

The project's full read follows the same idea at a larger scale and with a finer verdict. Instead of a score, each lesson gets one of four verdicts: keep, fix, repair or discard. A first, cheaper reader (Haiku) sorted every lesson, and a stronger reader (Opus) read all 5,788 non-held-out tool lessons (checked-numbers.md). It kept 189 as written, marked 1,381 as small fixes, 4,208 as rewrites and 10 as discards. It changed 1,922 of Haiku's verdicts. The comparison with AlpaGasus is limited. Their filter dropped most of the data and kept a subset. Ours found that dropping most of the data would leave very little, and so it rewrites. The effect of the rewriting on a trained model has not been measured (Chapter 6).

Deduplication is the other classic filter. Lee et al. (2021) found that common language modeling datasets contain many near-duplicate examples and long repeated passages. Models trained on deduplicated data memorize text about ten times less often and reach the same or better accuracy in fewer steps. They also show that deduplication reduces overlap between training and test data. The project's first cleaning pass was of this kind. It removed 73 duplicates, 123 lessons with no final answer, 28 that called tools that do not exist, 6 loops and 1 empty one, taking 9,059 lessons to 8,828 (MAKING-SMALLER-MODELS.md). That is exactly the class of fault that scripts can catch. It is also a small fraction of what the full read found.

Zheng et al. (2023) studied the use of strong models as judges. They document biases, including position, verbosity and self-enhancement, along with limited reasoning ability, and propose mitigations. They also report that GPT-4-level judges agree with human preferences about as often as humans agree with one another. The project's full read is a judge of lessons, so these cautions apply to it. One reader model made each pass, and no human has yet checked a sample. We say so in Chapters 6 and 7, and we treat the verdict counts as a measurement by an instrument with a known type of bias, not as ground truth.

### 2.4.5 Training on generated data

Shumailov et al. (2023) studied what happens when models are trained on text made by other models. They describe "model collapse", in which rare patterns in the original data gradually disappear, with, in their words, irreversible defects in the resulting models. They report the effect in several kinds of generative model, language models among them.

The finding is about repeated generations, which is a stronger condition than one round of lessons from a stronger teacher. It still supports a general point: synthetic data is not neutral. A generator has a narrower distribution than the world, and a model trained on it inherits that narrowness. In Bob's case the rule that "rounds never repeat" and the lesson ledger, which stores a fingerprint of every lesson ever taught, are partly a response to this (Chapter 11).

### 2.4.6 Summary of 2.4

The literature on synthetic data supports the claim that quality can beat quantity. It gives filters that catch invalid, duplicate and low-scored examples. It rests on score filters and on public benchmarks. It says little about the hidden faults of agent lessons: a tool call with wrong arguments that still "succeeds", a tool result no real tool returns, a repeated specialist answer, a needless call, a leaked private path or teacher note, and a wrong fact about code. These are the faults that Chapter 6 reports, and the literature leaves them mostly unmeasured.

## 2.5 Test contamination and benchmark leakage

### 2.5.1 What contamination is

A test is only fair if the model has not seen the answers. Contamination, also called leakage, is the case where test items, or close copies of them, are in the training data. A contaminated score measures memory, not skill. The problem is old in the field. The GPT-3 paper (Brown et al., 2020) notes in its abstract that on some datasets the model faces methodological issues related to training on large web corpora. We rely on that abstract only. The point to draw from it is that the concern was present from the early large models, since web-scale training data cannot be checked item by item by hand.

Xu et al. (2024) surveyed the problem as "benchmark data contamination". Their survey reviews how test benchmarks can leak into training data, which can make models look better than they are. It considers evaluation methods that depend less on static benchmarks, and discusses open challenges. The survey is the reference for the general picture. Our concern is a narrower and more local one, a project's own held-out set and its own lesson files.

### 2.5.2 Memorization

Carlini et al. (2022) measured how far language models reproduce parts of their training data word for word when prompted. They report three log-linear relationships: memorization rises with model capacity, with the number of times an example is duplicated in the training data, and with the amount of context in the prompt. They also find that these patterns do not hold across all model families, and that memorization is more prevalent than previously believed.

The result explains why a leak matters even when a test item is only one of thousands. An item that appears word for word in several training files is the kind of item that a model can learn to reproduce. The result also suggests that duplicates make the problem worse, which is a reason to run deduplication together with the leak check. Lee et al. (2021), in Section 2.4, found that deduplication also reduces overlap between training and test sets, which affected over 4% of the validation sets of the standard benchmarks they examined.

### 2.5.3 Exact match is not enough

Yang et al. (2023) argued that the common ways to remove contamination, which rely on string matching such as n-gram overlap, miss benchmark items that have been lightly reworded, translated or otherwise altered. They show that a 13 billion parameter model fine-tuned on such variations can overfit a benchmark and score near GPT-4 levels on MMLU, GSM8K and HumanEval. They propose a decontamination method based on a language model, and they report hidden overlap of roughly 8 to 18% of HumanEval in some pre-training sets. They also find contamination in synthetic data generated by GPT-3.5 and GPT-4.

Two features of this paper match the project's experience. First, synthetic data can itself carry the test. A teacher that has seen a benchmark may write lessons that echo it. Second, exact match undercounts. The project's check counted word-for-word copies and items sharing their first 60 characters. The never-taught gate that guards new plans also checks for test questions inside longer requests and for reworded near copies (Chapter 3). Even so, a rewording that keeps the idea and changes the surface would need the kind of model-based check that Yang et al. propose, and we have not run one.

### 2.5.4 What this thesis adds

The contamination literature is mostly about public benchmarks and pre-training corpora, since those are the hard cases at scale. A small project's held-out set is a different case. It is private, it is cut from the same lessons that train the model, and it moves through many conversion steps. The project held out 5% of lessons by an id hash. A check of 534 held-out tool items against every training-side file found 519 word for word, plus 7 more sharing their first 60 characters. The copies sit in other lesson sets and in the conversation files used for REAP scoring, and the ledger's never-list may drop them at training time (heldout-534 TALLY.md; Chapter 7).

The literature gives us the vocabulary and the warning. It does not give a measure of how much a leak inflates a particular model's scores. For that, a model must be re-scored on leak-free items, and the re-scoring has not been done. The thesis says "not measured" and does not estimate.

## 2.6 Tool use and agents

### 2.6.1 Models that call tools

Schick et al. (2023) introduced Toolformer, a model that teaches itself to use external tools through simple APIs, with only a few demonstrations per API. It decides which tools to call, when to call them, what inputs to give and how to use the results. The tools include a calculator, a question-answering system, two search engines, a translation system and a calendar. The authors report much better zero-shot results, often matching much larger models, without losing general language ability. The idea of self-supervised tool data is the ancestor of the synthetic tool lessons in this thesis.

Yao et al. (2022) proposed ReAct, which interleaves reasoning steps with actions. The reasoning helps the model plan and recover from surprises. The actions let it query outside sources. On question answering and fact checking, they report that ReAct reduces the hallucination and error propagation of chain-of-thought prompting. On two interactive benchmarks, ALFWorld and WebShop, they report absolute success-rate gains of 34% and 10% over imitation and reinforcement learning methods, using only one or two in-context examples. ReAct is the pattern behind most agent loops: think, act, observe, repeat. Bob's agent loop follows that pattern, and Chapter 8 asks what happens to a step when the "think" part is turned on or off.

### 2.6.2 Writing correct calls

Patil et al. (2023) observed that even strong models often produce wrong arguments or invent API usage, and introduced Gorilla, a LLaMA-based model fine-tuned for writing API calls. They report that it surpasses GPT-4 at writing API calls on their benchmark, APIBench, which covers APIs from HuggingFace, TorchHub and TensorHub. With a document retriever, Gorilla adapts to changed documentation at test time and reduces fabricated API use. The finding that hallucinated calls are a main failure is central. It matches the project's own list of faults that scripts miss, including tool calls with wrong arguments that still "succeed".

### 2.6.3 Large collections of tools

Qin et al. (2023) built ToolLLM, with a dataset called ToolBench. It was made with ChatGPT in three steps: collecting 16,464 RESTful APIs across 49 categories from RapidAPI Hub, generating single- and multi-tool instructions, and annotating valid chains of calls. They fine-tuned LLaMA into ToolLLaMA, with a neural retriever that picks APIs, and built an automatic evaluator. They report that it handles complex instructions and unseen APIs, and performs comparably to ChatGPT. ToolBench is the closest published case to Bob's pipeline: a strong model writes tool lessons, and a small model learns them. The difference lies in the checking. The ToolLLM paper's data is checked by the generating pipeline and its search. It was not, as far as the paper's abstract says, re-read in full by a stronger independent reader for the faults that the project found.

### 2.6.4 Evaluating tool use

Patil et al. (2025) introduced the Berkeley Function Calling Leaderboard (BFCL). It tests serial and parallel function calls across several programming languages. It uses an evaluation based on abstract syntax trees, which scales to thousands of functions, and it draws on expert-curated and user-contributed functions and prompts. It also tests whether models can abstain, and whether they can reason in stateful, multi-step agentic settings. The authors report that leading models handle single-turn calls well, while memory, dynamic decision-making and long-horizon reasoning remain open challenges. The benchmark has become a standard for function calling.

BFCL is a public benchmark, and Bob's tool set is not the public one. Bob's models must use Bob's tools, with Bob's names, descriptions and argument layouts. For that reason the project built its own judged tests, with held-out tool turns taken from its lessons (Chapter 4). A public score tells us how a model does on a general task. It does not tell us whether the model will call "write_file" correctly when the app's description of that tool is unclear. The thesis does not replace public benchmarks. It adds a project-local test, and asks how far that test can be trusted.

### 2.6.5 Tool shape

We separate a tool's "wording", the text of its description, from its "shape": which tools exist, how they divide the work, their names and inputs, and the call format (Chapter 8). The published tool-use work treats shape mostly as given. The benchmark supplies the functions and the model must cope. Our fourth question asks whether shape or lesson content matters more. On GPT-OSS 120B, 264 turns, thinking off, Bob's wording scored 63.3% and every other wording was within about 1 point, inside the 95% range (WORDING.md). The result suggests that, at least for this model and this tool set, rewording is a weak lever. We know of no published study that varies tool wording in this way for a small agent model, and we did not search exhaustively. The claim is limited to what we opened and read. Open agent apps point the same way in their code: the ones that adapt to a model change the tool's shape to the format that model was trained on, never the wording alone (section 8.2, from a reading of their source, not a measured result).

### 2.6.6 Summary of 2.6

The tool-use literature gives methods to generate tool data, models trained on it, and benchmarks that score it. Its common finding is that hallucinated or malformed calls are the main failure. It gives less attention to the quality of the generated tool lessons themselves, and to the sensitivity of a small model to tool shape.

## 2.7 Reasoning and when thinking hurts

### 2.7.1 Chain of thought

Wei et al. (2022) showed that prompting a language model with worked examples that include intermediate reasoning steps improves its performance on complex tasks. They report that the ability emerges in sufficiently large models, and that a 540 billion parameter model given eight such examples reached state-of-the-art accuracy on GSM8K, a benchmark of math word problems. This is the chain-of-thought result. Newer models are trained to produce such reasoning on their own, and a "thinking" mode is the product. Qwen3 has a thinking mode and a fast mode in one model, with a "thinking budget" that trades latency against answer quality (Yang et al., 2025). The gpt-oss models are reasoning models (OpenAI, 2025).

### 2.7.2 Where it helps

Sprague et al. (2024) reviewed over 100 studies and tested 20 datasets across 14 models. They report that chain of thought yields large gains mainly on math and logic tasks and much smaller gains elsewhere. On MMLU, direct answering performs nearly as well unless the question or response involves symbolic work. They conclude that chain of thought could be applied selectively to save inference cost.

The finding is important to an agent. Many agent steps are not math or logic. They are choices: which tool, with which arguments. If thinking helps mainly with symbolic work, it may give an agent step little and cost it a good deal.

### 2.7.3 Overthinking

Chen et al. (2024) studied "overthinking" in o1-style models, which spend far more compute than needed on simple problems. They propose efficiency metrics that look at compute use from both the outcome and the reasoning process, and they apply a self-training approach that shortens reasoning without hurting accuracy on GSM8K, MATH500, GPQA and AIME. Their title, "Do NOT think that much for 2+3=?", makes the point.

The project's results are on the same side of the question, and they are about tool steps and not math. On GPT-OSS 120B, 264 turns, tool calls with thinking on scored 54.2%, which is 9.1 points worse than thinking off (plus or minus 5.0) (WORDING.md). Bobert showed the same direction, 0.545 with thinking on against 0.591 off, but that study gives no range for this gap (bobert-35bob-tool-study.md, section 2). In Riker's coached steps, 18 tries with thinking on ended at the length limit, against none with thinking off (riker-28bob-tool-interview.md, section 3.2). The agreement in direction with the literature is encouraging. We note that the project's tests are small and single-run, and that we do not claim to have measured the mechanism. We do not know whether the loss with thinking on comes from overthinking, from the length limit, or from a mismatch between the thinking mode and the lessons.

### 2.7.4 Summary of 2.7

Reasoning helps where the task is symbolic, and it costs tokens everywhere. For an agent that must pick a tool on a small card, the cost of thinking is a live question. The literature supports asking it. It does not give an answer for the small, cut, locally run agent models that this thesis studies.

## 2.8 Preference and reward training

### 2.8.1 From human feedback to direct preference

Ouyang et al. (2022) trained InstructGPT in two stages. First, labelers wrote demonstrations, and the model was fine-tuned on them. Second, labelers ranked model outputs, and the model was tuned further with reinforcement learning from human feedback. They report that human raters preferred the outputs of the 1.3 billion parameter InstructGPT to those of the 175 billion parameter GPT-3, with better truthfulness and less toxic output.

Rafailov et al. (2023) proposed Direct Preference Optimization (DPO). It reparameterizes the reward model so that the best policy follows from a simple classification loss on preference pairs. DPO does not sample from the model during fine-tuning, and it needs little hyperparameter tuning. The authors report that it matched or beat PPO-based methods on sentiment control, summarization and single-turn dialogue, while being easier to implement.

### 2.8.2 Group relative policy optimization

Shao et al. (2024) introduced Group Relative Policy Optimization (GRPO) in DeepSeekMath. It is a reinforcement learning method derived from PPO that reduces memory cost. They credit the math ability of their 7 billion parameter model to a careful data selection pipeline and to GRPO. GRPO has since been widely used to train reasoning behaviors from verifiable rewards, though we rely here on the DeepSeekMath paper only for the method's definition and its first use. For mixture-of-experts models, Zheng et al. (2025) proposed GSPO, which they report stabilizes reinforcement learning on such models, and Ma et al. (2025) traced instability to routing that differs between the engine writing answers and the trainer (Section 2.1.4).

### 2.8.3 Relevance and limits

Preference and reward training matter to the thesis in two ways. The project's lesson kit supports preference pairs next to lessons, and the never-taught gate checks both (Chapter 3). So the leak question applies to preference data as well as to lessons. And the quality question applies: a preference pair is only as good as the judgement that picked its winner. The studies in this thesis are of supervised lessons, not of preference or reward training. We did not run DPO or GRPO in the studies reported, and we make no claims about their effect on the faults we found.

## 2.9 Interpretability

Interpretability asks what is going on inside a model. The methods used in Chapter 10 come from five strands of work: features and superposition, sparse autoencoders, steering and refusal directions, persona vectors with emergent misalignment, and activation patching.

### 2.9.1 Features, neurons and superposition

Elhage et al. (2022) studied polysemanticity, where a single neuron responds to several unrelated concepts. In a toy model, they show that a network can store more sparse features than it has neurons by encoding them in superposition. They report a phase change in the model's behavior and a link to the geometry of uniform polytopes. The consequence for interpretability is that a neuron is not a natural unit of meaning. A behavior may be spread over many neurons, and a neuron may take part in many behaviors.

This is the first reason to doubt the "evil neuron" idea. If features are stored in superposition, a trait is unlikely to sit in one neuron.

### 2.9.2 Sparse autoencoders

Bricken et al. (2023) trained sparse autoencoders, a form of dictionary learning, on the MLP activations of a one-layer transformer. The dictionaries ranged from 512 to 131,072 features. Several features, such as those for Arabic script, DNA, base64 and Hebrew, show specific, causally relevant behavior and do not correspond to a single neuron. Human raters and automated tests judged the features more interpretable than neurons. The authors also state limits: their best run recovers about 79% of the MLP's loss reduction, and some polysemanticity may remain hidden at low activations.

Gao et al. (2024) scaled the method. They use k-sparse autoencoders, which set the sparsity directly, and they keep the number of dead latents low. They propose metrics for feature quality and report that these generally improve as autoencoders grow. They trained a 16 million latent autoencoder on GPT-4 activations over 40 billion tokens, and released code and autoencoders for open models.

An autoencoder feature is a candidate for a "single readable part". Our fifth prediction in Chapter 10 tests exactly this: that one feature carries the habit. We report that no autoencoder feature at layers 10, 20 or 30 made plain answers harsher, even pushed to 10 times its usual strength (INTERP-FEATURES.md). The Bricken et al. caveat about incomplete recovery applies. An autoencoder that explains only part of the activations can miss a direction that matters. We do not report how much of the activations our autoencoders explain, because that figure is not in the report files.

### 2.9.3 Steering vectors and representation engineering

Turner et al. (2023) proposed Activation Addition (ActAdd). It takes the difference between the activations produced by a pair of contrasting prompts, such as "Love" and "Hate", to form a steering vector. Adding the vector during the forward pass shifts the output. The authors report state-of-the-art results on sentiment shifting and detoxification, while largely keeping performance on unrelated tasks. The method needs no optimization and works from a single pair.

Zou et al. (2023) proposed representation engineering. It focuses on patterns across populations of neurons and not on single neurons or circuits, and lets researchers monitor and steer high-level concepts such as honesty, harmlessness and power-seeking. The "difference between two sets of activations" idea is the basis of the project's cruel-minus-kind direction. Brain Engine's live steering at 8 times strength matches loading the same vector at 8 times strength (PR #227), which gives the steering tool a basic check.

### 2.9.4 Refusal as a single direction

Arditi et al. (2024) examined refusal in 13 open-source chat models with up to 72 billion parameters. They report that refusal depends on a single direction in the activations. Removing the direction stops the model from refusing harmful prompts, and adding it causes refusals of harmless ones. They used it to build a white-box jailbreak, and suggest that current safety fine-tuning is fragile.

This is the strongest published support for the idea that a behavior can be one direction. It is the reason that we expected a harsh habit to have a simple form. We note that refusal is a particular behavior, strongly shaped by safety training and taught in a focused way. A habit like harshness, which a persona prompt invites, may differ. The thesis does not conclude that refusal is not one direction. Our result is only about the habit that we tested, in the model that we tested.

### 2.9.5 Persona vectors and emergent misalignment

Chen et al. (2025) identified persona vectors, directions in activation space linked to traits such as evil behavior, sycophancy and hallucination. They report that these vectors can track a model's personality shifts during deployment, and that shifts after fine-tuning correlate strongly with movement along them. They can predict and control such shifts, and can flag training data likely to cause them, at dataset and sample level. The extraction method is automated and works for any trait that can be described in natural language.

Betley et al. (2025) reported that fine-tuning a model on a narrow task, writing insecure code without telling the user, can make it act misaligned on unrelated prompts. They call it emergent misalignment. It appeared across several models, strongest in GPT-4o and Qwen2.5-Coder-32B-Instruct. The behavior was inconsistent, since the models sometimes answered aligned. It was absent when the dataset framed the insecure code as a request for a computer security class, and a backdoor version showed it only with a trigger. The authors say a full explanation is left for future work.

Both papers bear on this thesis from the same side. They show that what a model is taught can change its character in ways the lessons do not state, and that a data-level check can find risky training data. That is close to the thesis's central claim, that hidden faults in lessons shape models. The studies differ from ours. They are about alignment-relevant traits in larger or different models, and their data faults are deliberate. Ours are accidental and agent-related, and we run no such persona-vector extraction on lessons. A natural next step, which we mention in Chapter 13 and have not done, is to use persona vectors as a screen on lessons.

### 2.9.6 Activation patching and causal tracing

Meng et al. (2022) used a causal intervention, now called causal tracing, to find the activations that most strongly drive a model's factual predictions. They found a small set of middle-layer feed-forward steps that carry facts while the model processes the subject of a statement, and they edit those weights with ROME. The paper made the middle layers a standard place to look.

Zhang and Nanda (2023) reviewed activation patching, which replaces activations from one run with those from another to find the components responsible for a behavior. Because the literature uses many inconsistent variants, they tested how choices of metric and corruption method change results. In several localization and circuit-discovery experiments, these choices produced noticeably different conclusions. They give best practices.

The patching in Chapter 10 follows this family of methods, with a cruel-minus-kind difference added or removed at chosen layers. Their warning is a direct caution for our use. A patching result depends on the metric and on how the comparison is built. Our tests used 6 asks per test and have about 2 points of noise (INTERP-PATCH.md). The result that adding the difference at its natural size changes nothing, and at three times that size lifts plain answers to 1.7 to 3.5 across most of layers 19 to 29, is therefore a lead, not a proof.

### 2.9.7 Summary of 2.9

The literature offers a pull in two directions. Some work shows that behaviors can be single directions or named features (Arditi et al., 2024; Chen et al., 2025; Bricken et al., 2023). Other work shows that features are spread out and stored in superposition (Elhage et al., 2022), and that the choice of method alters conclusions (Zhang and Nanda, 2023). It is almost silent on mixture-of-experts models. We found no paper among those opened that tests whether a trait sits in a router's choice of experts, or whether a group of experts holds a trait back. Chapter 10 addresses that.

## 2.10 Local inference: llama.cpp and GGUF

llama.cpp is an open-source project for language model inference in plain C and C++ with no dependencies, built on the ggml library. Its stated goal is to run models with minimal set-up and strong performance on a wide range of hardware, locally and in the cloud (llama.cpp project, n.d.). Its page lists backends for Apple Metal, NVIDIA CUDA, AMD HIP, Intel SYCL, Vulkan, and others, along with CPU paths for x86 and RISC-V. It lists integer quantization from 1.5 bits to 8 bits, which cuts memory use and speeds inference. The breadth of hardware support explains why a local app can reach Windows, Mac, Linux and Android users with one engine design.

GGUF is the binary file format used with ggml-based tools. It succeeded the older GGML, GGMF and GGJT formats. It stores a header, metadata as typed key and value pairs (architecture, hyperparameters, tokenizer and general details), tensor information and the tensor data, aligned for memory mapping. The documented goals are single-file deployment, extensibility, mmap compatibility, ease of use and full information in one file (ggml project, n.d.). Models are usually trained in a framework such as PyTorch and then converted to GGUF.

These two pieces matter for the thesis in two ways. First, they set the deployment target. A model that the project makes must be convertible to GGUF and run at useful speed on a 16 GB card. The measured speeds of 82.7, 92.1 and 102.5 tokens per second at 8, 6 and 4 experts per word for full Qwen (experts-per-word-full-qwen-2026-11-04.md) are measured on this kind of stack. Second, the project's Brain Engine is a fork of llama.cpp. It adds an expert switch, steering and tracing to a stack that was built to run models, not to take them apart. Chapter 3 describes what was changed, and what its tests show.

We did not find a peer-reviewed paper for llama.cpp or GGUF among the sources we opened. The two cited pages are project documentation, and we treat them as such. They describe the software as it is, and not as a result that has been independently evaluated.

### 2.10.1 Choosing a brain and its settings at home (updated 18 November)

The speed tests of 16 to 18 November turn the deployment target above into measured advice for one kind of home machine. That machine has a 16 GB card, 32 GB of RAM and an 8-core processor, and runs stock Qwen3.6 35B A3B at Q4 through Brain Engines 9 to 15. Speeds are tokens a second.

Every setting tried is in Chapter 4, section 4.3.3, with the testing method, the perplexity scores and the tests still running. The cost of the fNRI trace is in Chapter 3, section 3.4.3.

| If you mostly... | Measured choice on this machine | What you get | What it costs |
|---|---|---|---|
| Chat, short asks | Reading step 2048 + 4 GB hot-experts cache, missed experts copied to the card (F4c) | Writing 14% to 28% faster, reading 1.9x, first word on 32K in 14.3 s against 26.6 s | Answers drift no more than the default (perplexity, section 4.3.3.4) |
| Paste long documents, work on a repository, run agent jobs, up to about 64K | Reading step 4096 + 4 GB copy cache (X4c, also called 4x4) | Reading 2.7x to 2.8x, first word on 32K in 9.7 to 10.0 s, writing 14% to 19% faster | The same |
| Work at 128K to 256K | 4x4, or `-ub 5120` with a 3.5 GB copy cache, with a q4_0 context cache and the default 1 GB fit margin | The best long-prompt writing measured at 256K (42 to 45, against 38 to 40 with q8_0) | Perplexity 0.3% worse than q8_0; whether it still finds a fact deep in a long prompt is unproven in our lab, as we have yet to test |
| Want the default's exact words | Bob's defaults (step 512, no cache, q8_0 cache) | Bob's settings are already 6% faster at writing and 9% faster at reading than llama.cpp's own defaults | Slow first word on long prompts (26.6 s at 32K, about 157 s at 256K) |

**Two coding picks, head to head (17 November).** A bigger step with a slightly smaller cache was tried against the coding pick above: step 6144 with a 3.5 GB cache, against step 4096 with 4 GB.

- **Step 6144** finished long prompts about 1 s sooner.
- **Step 4096** wrote 4% to 24% faster and left about 0.3 GB more RAM free, which matters when only 1 to 3 GB is free.

So step 4096 with 4 GB stays the coding pick.

**Speed settings don't change the answers.** On 18 November the copy cache and the read layout scored identically to the last digit in perplexity, and the reading step moved it only in the last digits. Nearly all the drift from full precision comes from the q8_0 context cache that Bob already uses.

What not to turn on, on this machine:

- **Turbo (MTP).** It slowed prompt reading by 13% to 16%, and writing ranged from 17% slower to 3% faster with Bob's sampling. A retest with bigger steps is queued.
- **Prefetch.** It read 5.6% to 12.7% slower and used more of the card.
- **Hot-experts caches under 4 GB, or over 4 GB.** Under 4 GB they often lost to no cache on long prompts, and a 512 MB cache wrote 30% slower than none. Over 4 GB they wrote slower at 32K.
- **The iq4_nl context cache.** It read about 210 tokens a second, and every long prompt timed out.
- **A bigger fit margin.** It only pushed layers off the card and cut writing, by up to 70% at 256K.
- **A reading step of 8192 at 256K.** Its work space pushed 11 layers off the card, and writing fell to about 21.
- **The fNRI live trace, on engines before 12.** Before Brain Engine 11 it cost 9% to 11% of writing and changed the words. From Brain Engine 11 the words match. On Brain Engine 12 it costs 2% or less, with or without the cache, so it is fine to leave on (section 3.4.3, over 3 rounds).

**Bigger than RAM.** GPT-OSS 120B (a 63 GB file) crawled on this machine with every expert on. With a soft cut to 41 of its 128 experts per layer, it loaded in 29 to 39 s and wrote about 30 tokens a second, or 32 with F4c. Whether the cut answers as well as the full brain is unproven in our lab, as we have yet to test.

Three practical notes:

- **RAM is tight.** 32 GB of RAM leaves only 1 to 4 GB free with this brain loaded, so other large programs can slow it.
- **Shared GPU memory isn't overflow.** At long contexts, Windows shows "shared GPU memory" rising by 1 to 3.4 GB. That is the attention mask in pinned RAM, not the card overflowing (section 4.3.3.5).
- **The brain's own size matters more than any setting.** The dense 27B Qwen wrote about 10 words a second on the same card, against 70 to 90 for the 35B mixture-of-experts brain, because the mixture-of-experts brain uses only a few experts for each word (section 2.1.3).

Other cards, laptops, handhelds and other brains are unproven in our lab, as we have yet to test. So is a pass with a normal desktop open (browser tabs, chat apps), which is planned for the final picks.

## 2.11 Gaps this thesis addresses

The review gives a good deal of ground to stand on. It also leaves gaps. We list six. For each we say what the thesis does and what it does not do.

**Gap 1: the hidden faults of synthetic agent lessons are not counted.** Synthetic data work shows that filters and scores can improve a lesson set (Wang et al., 2023; Chen et al., 2023). Tool-use work shows that models can learn from generated tool data (Schick et al., 2023; Qin et al., 2023). We found no study among those opened that reads every lesson of an agent set with a strong model and reports a fault count by kind. Chapter 6 does so for one set: 189 kept of 5,788, with the other verdicts in Section 2.4. It uses one reader model per pass, so the counts are an instrument's reading, not ground truth.

**Gap 2: the link from a lesson fault to a model habit is shown rarely and in small cases.** The persona-vector and emergent-misalignment papers show a link between training data and traits (Chen et al., 2025; Betley et al., 2025). They study alignment traits and deliberate faults. Chapter 5 gives a plain, accidental case in agent behavior: 37% of coding lessons handed work to a tool, and the re-cut Riker, healed on cleaner lessons, scored 9 of 13 on the coding race against 6 for Riker v2. The re-cut also kept 208 experts against 176, so it is one confounded case and one run (FORGE-JOURNAL.md).

**Gap 3: contamination work focuses on public benchmarks, not a project's own held-out set.** The surveys and the rephrasing study set out the problem and the limits of exact match (Xu et al., 2024; Yang et al., 2023). Chapter 7 measures a private case, 519 of 534 leaked, and reports as "not measured" the inflation of past scores. It does not use a model-based check for reworded copies.

**Gap 4: tool shape is treated as given.** Benchmarks supply tool definitions, and models cope (Patil et al., 2025). Chapter 8 varies the wording and finds a weak effect for one model, with a stronger effect from coaching hints that give the exact call. Hints are not lessons, so the lesson-content half is not yet tested. The result is for the models and tool set of one project. The project has since locked one working shape per family, Qwen shape 4 and GPT-OSS shape 3 (PR #271), but the re-test of the new shapes has not been run.

**Gap 5: compression is judged by scores, and not by what happens to habits.** Pruning and distillation papers report benchmark results (Muralidharan et al., 2024; Lasby et al., 2025). Chapter 9 asks what a cut keeps and what a heal teaches, with lesson quality in view. It argues for cleaning before cutting. The argument rests on the checked numbers above and not on a controlled experiment, because the decisive retrain on reviewed lessons has not been run.

**Gap 6: the interpretability of expert-routed models is thin on habits.** The literature has single directions and features (Arditi et al., 2024; Gao et al., 2024), but little on whether a group of experts can hold a habit back. Chapter 10 reports a brake of 16 experts. It is a result for one model and one persona prompt, with small tests and a model judge. It raises the risk that an expert-pruning rule, such as REAP, that keeps active experts and removes quiet ones may remove a brake. It does not show that REAP does so, and we did not test REAP on Riker's brake.

The gaps share a theme. Each asks what is really in the data, or in the test, or in the model, instead of what a score says about it. The thesis answers with measurements from one project. It does not claim that other projects will find the same numbers. It does claim that the questions are worth asking before the next round of training.

## References

Arditi, A., Obeso, O., Syed, A., Paleka, D., Panickssery, N., Gurnee, W., and Nanda, N. (2024). Refusal in Language Models Is Mediated by a Single Direction. arXiv:2406.11717. https://arxiv.org/abs/2406.11717

Betley, J., Tan, D., Warncke, N., Sztyber-Betley, A., Bao, X., Soto, M., Labenz, N., and Evans, O. (2025). Emergent Misalignment: Narrow finetuning can produce broadly misaligned LLMs. arXiv:2502.17424. https://arxiv.org/abs/2502.17424

Bricken, T., Templeton, A., Batson, J., Chen, B., Jermyn, A., et al. (2023). Towards Monosemanticity: Decomposing Language Models With Dictionary Learning. Transformer Circuits Thread (Anthropic). https://transformer-circuits.pub/2023/monosemantic-features/index.html

Brown, T. B., Mann, B., Ryder, N., et al. (2020). Language Models are Few-Shot Learners. arXiv:2005.14165. https://arxiv.org/abs/2005.14165

Carlini, N., Ippolito, D., Jagielski, M., Lee, K., Tramer, F., and Zhang, C. (2022). Quantifying Memorization Across Neural Language Models. arXiv:2202.07646. https://arxiv.org/abs/2202.07646

Chen, L., Li, S., Yan, J., Wang, H., Gunaratna, K., Yadav, V., Tang, Z., Srinivasan, V., Zhou, T., Huang, H., and Jin, H. (2023). AlpaGasus: Training A Better Alpaca with Fewer Data. arXiv:2307.08701. https://arxiv.org/abs/2307.08701

Chen, R., Arditi, A., Sleight, H., Evans, O., and Lindsey, J. (2025). Persona Vectors: Monitoring and Controlling Character Traits in Language Models. arXiv:2507.21509. https://arxiv.org/abs/2507.21509

Chen, X., and Yao, H. (2026). Training-Free Halving of Activated Experts in Fine-Grained Mixture-of-Experts Models. arXiv:2609.04575. https://arxiv.org/abs/2609.04575

Chen, X., Xu, J., Liang, T., He, Z., Pang, J., Yu, D., Song, L., Liu, Q., Zhou, M., Zhang, Z., Wang, R., Tu, Z., Mi, H., and Yu, D. (2024). Do NOT Think That Much for 2+3=? On the Overthinking of o1-Like LLMs. arXiv:2412.21187. https://arxiv.org/abs/2412.21187

Dai, D., Deng, C., Zhao, C., et al. (2024). DeepSeekMoE: Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models. arXiv:2401.06066. https://arxiv.org/abs/2401.06066

Dettmers, T., Lewis, M., Belkada, Y., and Zettlemoyer, L. (2022). LLM.int8(): 8-bit Matrix Multiplication for Transformers at Scale. NeurIPS 2022; arXiv:2208.07339. https://arxiv.org/abs/2208.07339

Dettmers, T., Pagnoni, A., Holtzman, A., and Zettlemoyer, L. (2023). QLoRA: Efficient Finetuning of Quantized LLMs. arXiv:2305.14314. https://arxiv.org/abs/2305.14314

Elhage, N., Hume, T., Olsson, C., et al. (2022). Toy Models of Superposition. arXiv:2209.10652. https://arxiv.org/abs/2209.10652

Fedus, W., Zoph, B., and Shazeer, N. (2021). Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity. arXiv:2101.03961. https://arxiv.org/abs/2101.03961

Frantar, E., and Alistarh, D. (2023). SparseGPT: Massive Language Models Can Be Accurately Pruned in One-Shot. arXiv:2301.00774. https://arxiv.org/abs/2301.00774

Frantar, E., Ashkboos, S., Hoefler, T., and Alistarh, D. (2022). GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers. ICLR 2023; arXiv:2210.17323. https://arxiv.org/abs/2210.17323

Gao, L., Dupre la Tour, T., Tillman, H., Goh, G., Troll, R., Radford, A., Sutskever, I., Leike, J., and Wu, J. (2024). Scaling and evaluating sparse autoencoders. arXiv:2406.04093. https://arxiv.org/abs/2406.04093

ggml project (n.d.). GGUF file format specification. https://github.com/ggml-org/ggml/blob/master/docs/gguf.md

Gu, N., Zhang, Z., Feng, Y., Chen, Y., Fu, P., Lin, Z., Wang, S., Sun, Y., Wu, H., Wang, W., and Wang, H. (2025). Elastic MoE: Unlocking the Inference-Time Scalability of Mixture-of-Experts. arXiv:2509.21892. https://arxiv.org/abs/2509.21892

Gunasekar, S., Zhang, Y., Aneja, J., et al. (2023). Textbooks Are All You Need. arXiv:2306.11644. https://arxiv.org/abs/2306.11644

Hinton, G., Vinyals, O., and Dean, J. (2015). Distilling the Knowledge in a Neural Network. NIPS 2014 Deep Learning Workshop; arXiv:1503.02531. https://arxiv.org/abs/1503.02531

Hu, E. J., Shen, Y., Wallis, P., Allen-Zhu, Z., Li, Y., Wang, S., Wang, L., and Chen, W. (2021). LoRA: Low-Rank Adaptation of Large Language Models. arXiv:2106.09685. https://arxiv.org/abs/2106.09685

Jiang, A. Q., Sablayrolles, A., Roux, A., Mensch, A., et al. (2024). Mixtral of Experts. arXiv:2401.04088. https://arxiv.org/abs/2401.04088

Lasby, M., Lazarevich, I., Sinnadurai, N., Lie, S., Ioannou, Y., and Thangarasa, V. (2025). REAP the Experts: Why Pruning Prevails for One-Shot MoE Compression. arXiv:2510.13999. https://arxiv.org/abs/2510.13999

Lee, K., Ippolito, D., Nystrom, A., Zhang, C., Eck, D., Callison-Burch, C., and Carlini, N. (2021). Deduplicating Training Data Makes Language Models Better. ACL 2022; arXiv:2107.06499. https://arxiv.org/abs/2107.06499

Lin, J., Tang, J., Tang, H., Yang, S., Chen, W.-M., Wang, W.-C., Xiao, G., Dang, X., Gan, C., and Han, S. (2023). AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration. arXiv:2306.00978. https://arxiv.org/abs/2306.00978

llama.cpp project (n.d.). LLM inference in C/C++. https://github.com/ggml-org/llama.cpp

Lu, X., Liu, Q., Xu, Y., Zhou, A., Huang, S., Zhang, B., Yan, J., and Li, H. (2024). Not All Experts are Equal: Efficient Expert Pruning and Skipping for Mixture-of-Experts Large Language Models. arXiv:2402.14800. https://arxiv.org/abs/2402.14800

Ma, W., Zhang, H., Zhao, L., Song, Y., Wang, Y., Sui, Z., and Luo, F. (2025). Stabilizing MoE Reinforcement Learning by Aligning Training and Inference Routers. arXiv:2510.11370. https://arxiv.org/abs/2510.11370

Meng, K., Bau, D., Andonian, A., and Belinkov, Y. (2022). Locating and Editing Factual Associations in GPT. NeurIPS 2022; arXiv:2202.05262. https://arxiv.org/abs/2202.05262

Muralidharan, S., Sreenivas, S. T., Joshi, R., Chochowski, M., Patwary, M., Shoeybi, M., Catanzaro, B., Kautz, J., and Molchanov, P. (2024). Compact Language Models via Pruning and Knowledge Distillation. arXiv:2407.14679. https://arxiv.org/abs/2407.14679

OpenAI (2025). gpt-oss-120b & gpt-oss-20b Model Card. arXiv:2508.10925. https://arxiv.org/abs/2508.10925

Ouyang, L., Wu, J., Jiang, X., et al. (2022). Training language models to follow instructions with human feedback. arXiv:2203.02155. https://arxiv.org/abs/2203.02155

Patil, S. G., Mao, H., Yan, F., Ji, C. C.-J., Suresh, V., Stoica, I., and Gonzalez, J. E. (2025). The Berkeley Function Calling Leaderboard (BFCL): From Tool Use to Agentic Evaluation of Large Language Models. ICML 2025, PMLR 267:48371-48392. https://proceedings.mlr.press/v267/patil25a.html

Patil, S. G., Zhang, T., Wang, X., and Gonzalez, J. E. (2023). Gorilla: Large Language Model Connected with Massive APIs. arXiv:2305.15334. https://arxiv.org/abs/2305.15334

Qin, Y., Liang, S., Ye, Y., et al. (2023). ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs. arXiv:2307.16789. https://arxiv.org/abs/2307.16789

Rafailov, R., Sharma, A., Mitchell, E., Ermon, S., Manning, C. D., and Finn, C. (2023). Direct Preference Optimization: Your Language Model is Secretly a Reward Model. arXiv:2305.18290. https://arxiv.org/abs/2305.18290

Schick, T., Dwivedi-Yu, J., Dessi, R., Raileanu, R., Lomeli, M., Zettlemoyer, L., Cancedda, N., and Scialom, T. (2023). Toolformer: Language Models Can Teach Themselves to Use Tools. arXiv:2302.04761. https://arxiv.org/abs/2302.04761

Shao, Z., Wang, P., Zhu, Q., Xu, R., Song, J., Bi, X., Zhang, H., Zhang, M., Li, Y. K., Wu, Y., and Guo, D. (2024). DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models. arXiv:2402.03300. https://arxiv.org/abs/2402.03300

Shumailov, I., Shumaylov, Z., Zhao, Y., Gal, Y., Papernot, N., and Anderson, R. (2023). The Curse of Recursion: Training on Generated Data Makes Models Forget. arXiv:2305.17493. https://arxiv.org/abs/2305.17493

Sprague, Z., Yin, F., Rodriguez, J. D., Jiang, D., Wadhwa, M., Singhal, P., Zhao, X., Ye, X., Mahowald, K., and Durrett, G. (2024). To CoT or not to CoT? Chain-of-thought helps mainly on math and symbolic reasoning. arXiv:2409.12183. https://arxiv.org/abs/2409.12183

Sreenivas, S. T., Muralidharan, S., Joshi, R., et al. (2024). LLM Pruning and Distillation in Practice: The Minitron Approach. arXiv:2408.11796. https://arxiv.org/abs/2408.11796

Tazi, N., von Werra, L., and Wolf, T. (2026). The Ultimate MoE Training Handbook. Hugging Face, published 5 November 2026. https://huggingface.co/spaces/huggingface/moe-blogpost

Turner, A. M., Thiergart, L., Leech, G., Udell, D., Vazquez, J. J., Mini, U., and MacDiarmid, M. (2023). Steering Language Models With Activation Engineering. arXiv:2308.10248. https://arxiv.org/abs/2308.10248

Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., and Polosukhin, I. (2017). Attention Is All You Need. arXiv:1706.03762. https://arxiv.org/abs/1706.03762

Wang, L., Gao, H., Zhao, C., Sun, X., and Dai, D. (2024). Auxiliary-Loss-Free Load Balancing Strategy for Mixture-of-Experts. arXiv:2408.15664. https://arxiv.org/abs/2408.15664

Wang, Y., Kordi, Y., Mishra, S., Liu, A., Smith, N. A., Khashabi, D., and Hajishirzi, H. (2023). Self-Instruct: Aligning Language Models with Self-Generated Instructions. arXiv:2212.10560. https://arxiv.org/abs/2212.10560

Wei, J., Wang, X., Schuurmans, D., Bosma, M., Ichter, B., Xia, F., Chi, E., Le, Q., and Zhou, D. (2022). Chain-of-Thought Prompting Elicits Reasoning in Large Language Models. arXiv:2201.11903. https://arxiv.org/abs/2201.11903

Xu, C., Guan, S., Greene, D., and Kechadi, M.-T. (2024). Benchmark Data Contamination of Large Language Models: A Survey. arXiv:2406.04244. https://arxiv.org/abs/2406.04244

Yang, A., Li, A., Yang, B., et al. (2025). Qwen3 Technical Report. arXiv:2505.09388. https://arxiv.org/abs/2505.09388

Yang, S., Chiang, W.-L., Zheng, L., Gonzalez, J. E., and Stoica, I. (2023). Rethinking Benchmark and Contamination for Language Models with Rephrased Samples. arXiv:2311.04850. https://arxiv.org/abs/2311.04850

Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., and Cao, Y. (2022). ReAct: Synergizing Reasoning and Acting in Language Models. ICLR 2023; arXiv:2210.03629. https://arxiv.org/abs/2210.03629

Zhang, F., and Nanda, N. (2023). Towards Best Practices of Activation Patching in Language Models: Metrics and Methods. arXiv:2309.16042. https://arxiv.org/abs/2309.16042

Zheng, C., Liu, S., Li, M., Chen, X.-H., Yu, B., Gao, C., Dang, K., Liu, Y., Men, R., Yang, A., Zhou, J., and Lin, J. (2025). Group Sequence Policy Optimization. arXiv:2507.18071. https://arxiv.org/abs/2507.18071

Zheng, L., Chiang, W.-L., Sheng, Y., et al. (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. NeurIPS 2023 Datasets and Benchmarks; arXiv:2306.05685. https://arxiv.org/abs/2306.05685

Zou, A., Phan, L., Chen, S., et al. (2023). Representation Engineering: A Top-Down Approach to AI Transparency. arXiv:2310.01405. https://arxiv.org/abs/2310.01405
