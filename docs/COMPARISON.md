# Bob and similar projects

People often ask how Bob relates to other AI apps. This page puts Bob next to some well-known projects that cover some of the same ground, so you can pick what suits you. Lots of good tools exist, and many work well alongside Bob.

**Checked on 3 November 2026.** Everything said about another project comes from that project's own public pages, linked in each row, as they read on that date. Projects change often, so their pages are always the up-to-date source. If something here is out of date or wrong, please [open an issue](https://github.com/MouseWurX/Bob/issues) and we'll fix it.

This list isn't complete and isn't a ranking. The order means nothing.

## What Bob is

Bob is a free, open-source AI helper for Windows 10 and 11 that runs on your own PC. In one desktop window he offers:

- chat, plans, reminders, research and coding help, using AI models that run on your PC
- pictures, short video, music, sound effects and a speaking voice, from models he downloads only when you confirm
- "Hands" (each one off until you switch it on): file jobs, running programs you approve, schedules, and clicking and typing in other apps, working inside apps such as Unreal Engine and Blender through their MCP add-ons, office documents, and a security and privacy sidekick (Defender checks, suspicious files and emails, hidden photo details, website checks), with an approval card for each action unless you choose otherwise
- sessions (Normal, Art, Coding, Office, Gaming) that decide how Bob shares your PC, including a Gaming session that keeps the graphics card for your games
- a character: a dry-humoured digital engineer with his own looks, voices and personality settings

Bob's code is GPL-3.0-or-later and his art and writing are CC BY-SA 4.0. He has no accounts and sends no telemetry, and anything that reaches the internet (web search, cloud helpers, phone access) is off until you switch it on. Downloads wait for you to confirm them. See the [README](../README.md), the [user guide](USER-GUIDE.md) and the [privacy policy](../PRIVACY.md).

## Chat apps for local models

These apps let you download and chat with AI models on your own computer.

| Project | In its own words, or from its pages | Licence | Source |
|---|---|---|---|
| Jan | "an open source alternative to ChatGPT that runs 100% offline on your computer"; local models, custom assistants, MCP support; Windows, macOS, Linux | Apache-2.0 | [github.com/janhq/jan](https://github.com/janhq/jan) |
| GPT4All | runs local AI models privately on desktops and laptops; LocalDocs for chatting with your own files; Windows, macOS, Linux | MIT | [github.com/nomic-ai/gpt4all](https://github.com/nomic-ai/gpt4all) |
| AnythingLLM | desktop app and self-hosted server; local and cloud models, chat with documents, agents, MCP, voice | MIT | [github.com/Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm) |
| Open WebUI | a web interface you host yourself; works with Ollama and OpenAI-compatible services; tools, image generation through other services, voice | Open WebUI License (its own licence, see its repository) | [github.com/open-webui/open-webui](https://github.com/open-webui/open-webui) |
| LM Studio | desktop app for downloading and running local models; free to use at home and at work since July 2025 | LM Studio's terms of use (its `lms` command-line tool is MIT) | [lmstudio.ai](https://lmstudio.ai), [blog post](https://www.lmstudio.ai/blog/free-for-work) |
| Msty Studio | desktop app that runs local models or connects to online ones; free version plus a paid licence | Msty's terms of use | [msty.ai](https://msty.ai/blog/msty-studio-free) |

**How Bob differs:** Bob covers chat too, and adds pictures, video, music, voice, Hands and sessions in the same window. If chat and documents are all you need, or you want macOS or Linux, one of these may suit you better.

## AI agents that work on your computer

These projects focus on agents that carry out tasks: coding, running commands, research and automation.

| Project | In its own words, or from its pages | Licence | Source |
|---|---|---|---|
| goose | "a general-purpose AI agent that runs on your machine"; desktop app and command line; 15+ model providers, including Ollama; part of the Agentic AI Foundation at the Linux Foundation | Apache-2.0 | [github.com/aaif-goose/goose](https://github.com/aaif-goose/goose) |
| Open Interpreter | now "a coding agent optimized for low-cost models", mainly used from a terminal or inside code editors (the original Python version continues as a community fork) | Apache-2.0 | [github.com/openinterpreter/openinterpreter](https://github.com/openinterpreter/openinterpreter) |
| OpenHands | a self-hosted control centre for coding agents, with a web interface and command line; works with many models and agents | MIT | [github.com/OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) |

**How Bob differs:** Bob's Hands are aimed at everyday PC jobs for people who'd rather not use a terminal, with a card to approve each action and six safety limits that start switched on. For serious software development, a dedicated coding agent may suit you better.

## Picture, video and audio tools

| Project | In its own words, or from its pages | Licence | Source |
|---|---|---|---|
| ComfyUI | a node-graph interface for image, video, audio, 3D and text workflows; desktop app for Windows and macOS | GPL-3.0 | [github.com/Comfy-Org/ComfyUI](https://github.com/Comfy-Org/ComfyUI) |
| SwarmUI | a web interface for image, video and some audio models; can install ComfyUI as its engine | MIT | [github.com/mcmonkeyprojects/SwarmUI](https://github.com/mcmonkeyprojects/SwarmUI) |
| Pinokio | a one-click launcher for open-source projects, including many AI apps | MIT | [github.com/pinokiocomputer/pinokio](https://github.com/pinokiocomputer/pinokio) |

**How Bob differs:** Bob makes pictures, short clips, music and sound effects when you ask in chat, without building a workflow. For fine control, custom nodes or long videos, these tools go much further. Bob can also run ComfyUI workflows for you if you turn that on (off to start with).

## Assistants from graphics card makers

| Project | From its pages | Licence | Source |
|---|---|---|---|
| NVIDIA Project G-Assist | an experimental assistant that runs locally on GeForce RTX cards; system tuning, game settings, performance charts, some lighting and fan control, and plugins; delivered through the NVIDIA app (requirements on NVIDIA's page) | Free from NVIDIA; plugin code in its repository is Apache-2.0 | [nvidia.com announcement](https://www.nvidia.com/en-us/geforce/news/g-assist-ai-companion-for-rtx-ai-pcs/), [plugins repository](https://github.com/NVIDIA/G-Assist) |
| NVIDIA ChatRTX | a demo app that let an AI model answer questions about your own files on an RTX PC; its repository was archived (read-only) on 21 January 2026 | See its repository | [github.com/NVIDIA/ChatRTX](https://github.com/NVIDIA/ChatRTX) |

**How Bob differs:** Bob's Gaming session is about sharing the PC politely while you play: his big brains and pictures stay off the graphics card and he chats on the processor, borrowing only a little of the card when the game leaves room. He doesn't tune your hardware or game settings. An NVIDIA graphics card helps Bob a lot, but he doesn't need one.

## Using them together

Bob doesn't have to replace anything. He can use Ollama models you already have, run ComfyUI workflows, and sit next to any of the apps above. Bob downloads and runs some open-source engines himself (such as llama.cpp and stable-diffusion.cpp); those keep their own licences, listed in [THIRD-PARTY.md](../THIRD-PARTY.md).

## Names and trademarks

All product and project names on this page are trademarks or names of their respective owners and are used only to identify those projects. Bob and MouseWurX are not affiliated with, endorsed by or sponsored by any of them, and nothing here means they endorse Bob. No other project's logo or artwork is used. Descriptions are a good-faith summary of each project's own public pages on the date above, not a review, and they may be out of date: please check each project's own site before relying on them.
