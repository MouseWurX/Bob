# Bob on an Android phone or tablet

For phones and tablets on Android 13 or newer (64-bit ARM, or x86_64). The app talks to the Bob on your computer, and can also run a small brain on the phone itself. [All the guides](README.md) · [setup picker](https://mousewurx.github.io/Bob/)

> Tested: the app runs on an 8 GB phone in our lab. Tablets, and phones with less memory, are unproven in our lab, as we have yet to test.

## Install

1. **On the phone,** download `Bob-<version>-android.apk` from the [latest release](https://github.com/MouseWurX/Bob/releases/latest).
2. **Open it.** Android asks to allow installing apps from the browser: allow it for this install.
3. **Put the phone and the computer on Tailscale** (free, from the Play Store and tailscale.com).
4. **In the computer's Bob:** Settings, Bob-Net, turn on **Bob-Net access** and note the passcode.
5. **In the app:** add that Bob with its Tailscale name and the passcode. The pill at the top turns green when he's reachable.

## The phone brain

Optional and off to start with: Menu, **Phone brain**, **On-device brain**. It answers when no Bob on your network is reachable (or always, if set so). One download:

| Brain | Size | Best for |
|---|---|---|
| **Gemma 4 E2B** (recommended) | about 2.8 GB | Quick and light. The pick for phones with 8 GB. |
| Qwen3 4B Instruct | about 2.5 GB | A little better at step-by-step thinking, but slower, and the phone runs warmer. |

## By size

| Phone or tablet memory | Phone brain | Tokens in mind |
|---|---|---|
| Under 6 GB | Not advised: use the app with the Bob on your computer | |
| 6 GB | Gemma 4 E2B, with other apps closed (unproven in our lab, as we have yet to test) | 8K |
| 8 GB or more | Gemma 4 E2B | 12K |

**Test speed** under a downloaded brain says how fast this phone runs it; anything over about 8 words a second feels like chatting. **Free memory when Bob is idle** (on to start with) lets the brain go after 5 minutes so other apps stay quick.

## What runs where

| Job | Where |
|---|---|
| Chat, with a Bob reachable | The Bob on your computer, with his brains, tools, pictures and files |
| Chat, with none reachable | The phone brain (llama.cpp, built into the app), on the phone's processor |
| Pictures, music, files, programs, web search | The Bob on your computer only. The phone brain says so and points to him. |
| Hearing you, read aloud | The phone's own speech recognition and voice |
