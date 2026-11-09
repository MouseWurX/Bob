# Chat templates for brains whose model file has none

A chat template tells llama.cpp how to lay out a conversation (and the tool list) for one family of models.
Most model files carry their own. Files that came from Ollama often don't, because Ollama keeps the template in a
separate file. Without one, llama.cpp falls back to a generic layout, and tool calls break: Gemma asks instead of
acting, GPT-OSS prints its raw channel markers, Qwen3 thinks when it was told not to.

So when a brain's file has no template, Bob passes the matching one from this folder (`--chat-template-file`).
A file that has its own template always keeps it. 
## Advanced settings (config.json only, no switch in the app)

- `llamacpp.templates`: which chat format a model file uses, only when the file has none. Point a brain at your own
  template, `"llamacpp": { "templates": { "gemma4:e4b": "C:\\path\\to\\template.jinja" } }`, or use `"own"` to never
  replace the file's.
- `llamacpp.sampling`: how adventurous the brain's word choices are. Bob uses each family's recommended settings
  (Gemma 4, Qwen, GPT-OSS). Set your own per brain or family, like `"sampling": { "gemma4:e4b": { "temperature": 0.8 } }`.
  To undo this fix and go back to llama.cpp's own defaults: `"llamacpp": { "sampling": false }`.
- `llamacpp.toolTemp`: a calmer setting while it's using tools. The highest temperature used when tools are offered
  (default 0.6).

| File | Family | Copied from (llama.cpp `models/templates/`, commit 3f8af15) | Original source | Licence |
| --- | --- | --- | --- | --- |
| `gemma4.jinja` | Gemma 4 26B and 31B | `google-gemma-4-31B-it.jinja` | Google, Gemma 4 | Apache-2.0 |
| `gemma4-small.jinja` | Gemma 4 E2B and E4B | Ollama's copy of Google's E2B template (`model/renderers/testdata/gemma4_e2b_chat_template.jinja2`, MIT collection) | Google, Gemma 4 | Apache-2.0 |
| `gpt-oss.jinja` | GPT-OSS | `openai-gpt-oss-120b.jinja` | OpenAI, gpt-oss | Apache-2.0 |
| `qwen3.jinja` | Qwen3 (incl. Instruct 2507) | `Qwen-Qwen3-0.6B.jinja` | Alibaba Qwen, Qwen3 | Apache-2.0 |
| `qwen3-coder.jinja` | Qwen3 Coder | `Qwen3-Coder.jinja` | Alibaba Qwen, Qwen3-Coder | Apache-2.0 |
| `qwen3.5.jinja` | Qwen3.5 and later | `Qwen3.5-4B.jinja` | Alibaba Qwen, Qwen3.5 | Apache-2.0 |
| `qwen2.5.jinja` | Qwen2.5 (incl. Coder) | `Qwen-Qwen2.5-7B-Instruct.jinja` | Alibaba Qwen, Qwen2.5 | Apache-2.0 |

The templates are unchanged copies. Gemma 4's small and large models use slightly different templates (the large one adds an empty thought block when thinking is off). The Apache-2.0 licence text is in `LICENSE-Apache-2.0.txt`; llama.cpp's
collection is MIT (`LICENSE-llama.cpp-MIT.txt`).
