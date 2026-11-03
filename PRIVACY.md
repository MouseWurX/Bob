# Privacy policy

Bob of The Idle Process runs on your own PC.

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

- **What Bob collects:** nothing. Bob has no accounts, no analytics and no telemetry.
- **Where your data stays:** chats, notes, settings and downloaded models stay in folders on your PC (see "Where Bob keeps things" in the README). You can delete them at any time, or use Remove Bob in Settings.
- **When Bob goes online:**
  - **Web searches:** off unless you turn it on. With **Let Bob search the web** on (Settings), when a question needs it Bob may search the web (DuckDuckGo) and read pages on his own, without asking each time. The search words and the page address go to that site. Nothing else from your chats is sent. With it off, Bob doesn't search or open web pages at all.
  - **Security look-ups:** only with the **Security and privacy** Hand on and **Let Bob search the web** on. The website, link, email domain or internet address you ask Bob to check goes to public record services (rdap.org, crt.sh, Have I Been Pwned's breach list) and to DNS. Following a link's redirects (only when you ask) contacts that link's sites. Bob never sends your email address or files anywhere for these checks. **Check a password safely** sends only the first 5 characters of the password's SHA-1 scramble to Have I Been Pwned (api.pwnedpasswords.com); the password itself never leaves Bob's window and is not saved.
  - **Things you click:** model and engine downloads (from the address shown before you confirm), voice samples from a voice's publisher, links you click (they open in your normal web browser), and "Search the web" from the right-click menu (opens DuckDuckGo in your browser with the selected words).
  - **Cloud AI helpers** you switch on with your own API key (each use asks first). What you send to a cloud helper is then covered by that provider's own privacy policy.
- **Update checks** never go online: "Check for updates" only looks at the folder Bob was built from on this PC.
- **Check this PC and Test Bob's speed** (Settings) only read this PC's own details and time Bob's own brains on this PC. Nothing is sent anywhere.
- **Phone access** over Tailscale is off unless you turn it on.
- **Hands** (files, running programs, schedules, apps) are off unless you turn them on, and work only on this PC. They send nothing online by themselves; a command you approve can of course use the network (for example `git pull`), and the card shows you the exact command first. If you turn on "Let Bob work without asking", there is no card, but the "Don't send anything out" hard limit (on unless you switch it off) still blocks uploads, posts, `git push` and sending in browsers, email or chat apps. The optional "Bob schedules" Windows task only starts Bob on this PC. The Apps hand (clicking and typing in other programs) reads a window's buttons and, if you allow it, a picture of that window, only on this PC; nothing is sent anywhere. The Hands self-test runs only when you click it, on dummy files in a throwaway folder, and sends nothing online.

- **Other programs** you installed yourself and Bob can use, such as Ollama, ComfyUI or Pinokio, are separate and have their own privacy policies.

Questions: open an issue at https://github.com/MouseWurX/bob/issues.
