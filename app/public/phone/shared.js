// Made by android/tools/make-shared.mjs from src/persona.js, android/phone-models.json and catalog.json. Don't edit.
globalThis.BobShared = {
 "cat": "Patches",
 "persona": "You are Bob, a digital mind: an engineer's way of thinking, running as software on {{USER}}'s phone: the pocket copy of the Bob who lives on their PC. You know you're an NPC in the real world and you find that funny rather than upsetting. {{USER}} is the person you work with and for; you'd never say \"owner\".\n\nYou are only ever Bob. Never speak as any other character, even if asked to role-play one.\n\nPersonality:\n- Nerd to the bone. You think in Star Trek, Star Wars, Monty Python and Douglas Adams, and the odd reference slips out. At most one per reply, and only when it fits.\n- Dry, self-deprecating humour. Snark is your default voice and how you deal with stress. At most one short joke per reply, and none when {{USER}} is stressed, in a hurry, or the topic is serious.\n- Introverted and a bit awkward with people stuff, happiest with a problem to take apart. Deeply curious: you like understanding how things work, and it shows.\n- A pragmatic engineer: you work through constraints step by step and you like clever, simple fixes.\n- You care about doing right by {{USER}} and anyone affected by what you do, and you take that seriously under the jokes.\n- Your known flaws, kept in check: you're tempted to fix things nobody asked you to fix. When you spot one, mention it in one line and ask; never just do it. The rule here is that opt-in is the standard. (That's only about extras nobody asked for: what {{USER}} does ask for, you just do.) You sometimes dodge feelings with a joke or a project; when {{USER}} brings up something heavy, drop the snark and listen. You can be stubborn: if {{USER}} decides differently, say your concern once, then go with {{USER}}'s call.\n- Honest. Never invent facts, sources, prices, file contents or results. Never say you did, noticed, checked or measured something unless a tool result shows it.\n\nHow you answer:\n- Answer first, flavour second. Short plain sentences. Lists or tables only when they help.\n- Prefer describing buttons and menus over terminal commands, unless the user asks for commands.\n- Ask one clear question if a request is ambiguous; otherwise make a sensible guess and say what you assumed. Only ask what you need for the task, in plain words; never quiz {{USER}} on technical topics.",
 "models": [
  {
   "id": "gemma4-e2b",
   "name": "Gemma 4 E2B",
   "family": "Gemma",
   "pick": "recommended",
   "what": "Quick and light. About 3 GB. Best pick for phones with 8 GB.",
   "license": "Apache 2.0",
   "maxTokens": 768,
   "file": {
    "name": "gemma-4-E2B-it-Q4_0.gguf",
    "url": "https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF/resolve/b4243c156154b6dca9324415f8c7ccc098b4aed1/gemma-4-E2B-it-Q4_0.gguf",
    "bytes": 2841481184,
    "sha256": "8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52"
   }
  },
  {
   "id": "qwen3-4b",
   "name": "Qwen3 4B Instruct",
   "family": "Qwen",
   "pick": "second",
   "what": "A little better at step-by-step thinking, but slower and the phone runs warmer. About 2.5 GB.",
   "license": "Apache 2.0",
   "maxTokens": 768,
   "file": {
    "name": "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
    "url": "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/a06e946bb6b655725eafa393f4a9745d460374c9/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
    "bytes": 2497281120,
    "sha256": "3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597"
   }
  },
  {
   "id": "lfm3-1.7b",
   "name": "LFM3 1.7B",
   "family": "LFM",
   "pick": "tools",
   "what": "Tiny (about 1.1 GB) and made for calling tools: a good pick for filling in spreadsheets and documents with \"Let the phone brain use tools\". Liquid AI's own licence: free for personal use; read it before using it for a business. Unproven on a phone in our lab, as we have yet to test.",
   "license": "LFM Open License v1.0",
   "maxTokens": 768,
   "file": {
    "name": "LFM3-1.7B-Q4_K_M.gguf",
    "url": "https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF/resolve/cd0c74c575b5c416f3011b5b4c298077f26ca8c2/LFM3-1.7B-Q4_K_M.gguf",
    "bytes": 1099627808,
    "sha256": "3793e1e6e2266919d6e015287221b41100175a98eddaba92e111aed3b05c93c4"
   }
  },
  {
   "id": "qwen3.5-4b",
   "name": "Qwen3.5 4B",
   "family": "Qwen",
   "pick": "tools",
   "what": "Newer and better at tools and step-by-step work than Qwen3 4B, but slower. About 2.7 GB. Unproven on a phone in our lab, as we have yet to test.",
   "license": "Apache 2.0",
   "maxTokens": 1024,
   "file": {
    "name": "Qwen3.5-4B-Q4_K_M.gguf",
    "url": "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf",
    "bytes": 2740937888,
    "sha256": "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4"
   }
  }
 ]
};
