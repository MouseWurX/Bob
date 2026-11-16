# Private web: plan (Nov 16 2026, not built yet)

The owner asked for a privacy mode for Bob's web search and browsing. It is opt-in, and slower is fine.
Everything here is **off by default**. Turning it on never changes Gaming mode, the PC's own network, the
firewall or any other app: it only changes how Bob's own web tools (`web_search`, `fetch_page` and Bob's
browser window) reach the internet.

## The rule

> One source stopping Bob is not every source stopping him. (the owner, Nov 16)

When a site or a search service turns Bob away, Bob **skips it and asks a different source for the same
information**. He never tries to get past the block.

**Never built, whatever the setting:** rotating proxies, faked or randomised browser or machine fingerprints,
captcha solving, retrying a blocked site through a different address, or anything else made to beat a site's
bot checks. A blocked source is skipped and named in the answer, never beaten.

## 1. More sources, one after another (with the builder's backup search)

The builder's branch `claude/backup-search` (`src/web-search.js`) already spots robot-check pages and has the
"Search API keys" page: Marginalia, Brave, Mojeek and Tavily, each off, each with the user's own key and a
monthly cap. This plan **adds to that work; it does not make a second keys page.**

Additions:

| Source | Key | What it sends | Notes |
|---|---|---|---|
| Firecrawl (no key) | none | the search words | The owner's pick for the next backup. Its own id `firecrawl`, its own switch, off. Firecrawl doesn't publish its daily limit per address. When it says "limit reached" (429), Bob skips it for the rest of the day. |
| Diffbot | user's own | the search words | 10,000 credits a month free, no card. Later, if Tavily and Firecrawl run short. |
| Exa | user's own | the search words | $10 a month free credit. Later. |

Each new service follows the same rules as the builder's four: only the search words and the "when" filter are
sent, it's counted in `<data>/search-backup-count.json` with the same shape (`{ month, used: { <id>: n } }`),
it has a monthly cap, and keys never show up in logs, saved rows or tests. A keyless Firecrawl search counts
as 1 under `firecrawl`. Its cap starts at 50 a day (1,500 a month) so Bob stays well clear of the unknown limit.
The builder checks the current keyless endpoint and terms at sign-up time.

**The order Bob tries them in:** the free pages (DuckDuckGo, then Mojeek), then each service the user turned
on, in the order on the Settings page. A source that is blocked, at its cap, or erroring is skipped. The answer
says which sources were skipped and why, in one line, like: *"(DuckDuckGo and Mojeek blocked this computer;
from Marginalia.)"*

**Pages, too (`fetch_page`).** When a page answers with a block (401/403/429, a Cloudflare or other "checking
your browser" page, or a captcha page), Bob says it's blocked and moves on to another source for the same
information:
1. Search for the same facts without that site (`-site:that.site`), and read the best other result.
2. An official copy elsewhere if there is one (a PDF, the project's own docs mirror, a GitHub README).
3. A copy the Internet Archive already holds (`web.archive.org/web/2026/<link>`). Bob only reads copies that
   are already there. He never asks it to save a fresh one of a blocked page.

He stops after 3 other sources and says what he tried. The same blocked site is skipped for the rest of
the job, so he never keeps knocking.

## 2. Private mode (one switch: "Private web")

When it's on:

- **Search goes to the keyed services first.** Those only get the search words, never a cookie or a page
  visit. The free pages come last.
- **No tracking on Bob's requests.** `fetch_page` sends no cookies (it never did), no Referer, a plain
  `Accept-Language: en`, and `Sec-GPC: 1` (the "do not sell or share" signal).
- **Links are cleaned** of tracking bits (`utm_*`, `fbclid`, `gclid` and the like) before Bob opens them.
- **An honest, common fingerprint.** Bob's browser stays plain, current Chromium with its usual settings, so it
  looks like many other people's browsers. Bob never fakes or randomises it, and his own `fetch_page` keeps
  saying "Bob" in its user agent, because it is Bob.

### Bob's private browser window

Today Bob's browser keeps its own profile (`persist:bob-browser`). In private mode it uses a **throwaway
profile** instead (a session without `persist:`), so:
- no cookies, sign-ins or site storage are saved, and everything is gone when the window closes;
- known trackers and ad servers are blocked (a small built-in list, in Bob's files, updated with releases;
  no list is downloaded while browsing);
- third-party cookies are refused;
- WebRTC can't leak the real address (`disable_non_proxied_udp`);
- downloads, pop-ups and permissions stay refused, as today.

Signing in to a site doesn't work in private mode (nothing is kept). The Help says so.

## 3. Sending Bob's web traffic through your VPN, Tor or proxy (optional)

The user sets up the VPN, Tor or proxy. Bob doesn't install, run or pick one.

- **A VPN app:** nothing to set in Bob. It already covers him. Help explains that it also covers games, so
  people may want their VPN's "split tunnel" to leave games out.
- **Tor or a proxy:** a box for an address, like `socks5://127.0.0.1:9050` (Tor) or `http://127.0.0.1:8080`.
  Only Bob's web tools use it. Names are looked up through it too (`socks5h`), so the address isn't leaked.
- **Fails closed.** If the proxy is down, Bob says so and doesn't quietly go direct.
- **A Test button** makes one request through it and shows the address the internet sees, so the user can
  check it works. It never runs by itself.
- **Expect blocks.** Many sites and search pages block Tor and VPN addresses. That's exactly when the rule
  above matters: Bob skips the blocked ones and asks the others. Keyless Firecrawl's limit is per address, so
  through Tor it often runs out early; Bob just skips it.
- **Lab, Bob-Net, model downloads, updates and cloud helpers are not routed**, so they keep working and stay
  fast. Only web search and pages are.

How it's built (the builder confirms): in the desktop app the requests go through a separate Electron session
with `session.setProxy` (which handles SOCKS and HTTP). On Android and headless Linux, HTTP proxies go through
undici's `ProxyAgent`; SOCKS there needs a small extra library, so the first version says "SOCKS: desktop only"
where it isn't available.

## Settings, Help and words

- **Settings, Connections, "Private web"**, beside "Search API keys", listed in `public/settings-map.js` and
  always visible. Parts: the "Private web" switch, the "Route through" box with Test, "Try other sources when
  one blocks Bob" (on when Private web is on), and a link to Search API keys.
- New config: `privateWeb: { on: false, route: '', otherSources: true }`, added to `SETTING_KEYS` and tidied in
  `config.js`. The route address isn't a secret, but it is scrubbed from shared logs.
- **Help in Bob's voice**, e.g. *"Private web keeps what I look up to myself. I send only the search words, I
  keep no cookies, and I skip any site that blocks me and ask another. It's a bit slower."*
- **Glossary (i):** Private web, proxy, Tor, VPN, tracker, fingerprint (browser).
- **FAQ:** "Will a VPN slow my games?", "Why do some sites block Tor?", "Why won't Bob get past a captcha?"
  (because the site has asked not to be visited by bots, and Bob respects that).
- Accessible (labels, keyboard, screen reader text for each switch), theme colours only, no cut-off text,
  clicked through on desktop and phone.

## Where it works

| | Windows | Mac | Linux | Android |
|---|---|---|---|---|
| More sources + Firecrawl | yes | yes | yes | yes |
| Private search and pages | yes | yes | yes | yes |
| Private browser window | yes | yes | yes | no (no Bob browser window there) |
| HTTP proxy | yes | yes | yes | yes |
| SOCKS / Tor | yes | yes | yes (desktop app) | later (needs the extra library) |

## Tests (fakes only, no real network)

- A fake fetch blocks source A: Bob asks B, and the answer names A as skipped.
- Every source blocked: an honest "all blocked" answer, no loop, no retry of the same site.
- A captcha, Cloudflare or 429 page is never retried through another address or user agent.
- Firecrawl counts 1 per keyless search under `firecrawl`, and stops at its cap.
- Private mode: no cookie or Referer header, `Sec-GPC: 1`, tracking bits removed from links.
- The proxy is down: the call fails closed and never goes direct.
- The Gaming mode config is byte-for-byte the same with Private web on and off.
- No key, route address or real path appears in any log or saved row.

## Stages (one PR each, handed to the builder)

1. **More sources:** Firecrawl in the builder's backup search, plus "try other sources" for `fetch_page`.
   It goes first because the Lab needs Firecrawl.
2. **Private mode:** headers, clean links, keyed sources first, the throwaway browser profile and tracker list.
3. **Routing:** the "Route through" box, Test, fails closed.
