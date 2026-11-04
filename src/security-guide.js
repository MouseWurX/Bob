// What Bob knows about staying safe, op-sec habits and careful research, kept on the PC so it costs nothing until
// asked for (security_tips). Written for Bob to pass on in his own words. Defence and public-source research only:
// nothing here is about getting into other people's things or finding private people.

export const GUIDE = {
  phishing: {
    title: 'Spotting phishing (fake emails, texts and pages)',
    words: 'phishing scam email text sms fake login link smishing',
    text: `Signs: pressure ("within 24 hours", "account suspended"), a request to sign in, pay or "verify", a sender name that doesn't match the address, links whose real address isn't the company's own site, attachments you didn't expect (especially .zip, .html, .iso, Office files asking to "Enable content"), and payment by gift card, crypto or e-transfer.
What to do: don't click. Go to the company yourself (type the address or use their app) and check there. Phone them on a number from their real site or your card, never the one in the message. In email, "Show original" (Gmail) or "View source" (Outlook) shows the headers; paste them to Bob to check SPF/DKIM/DMARC and where it really came from.
Already clicked or typed a password? Change that password now (and anywhere you reused it), turn on two-step sign-in, sign out other sessions, and watch the account. Typed card details? Call the bank. In Canada, report scams to the Canadian Anti-Fraud Centre (antifraudcentre-centreantifraude.ca, 1-888-495-8501).`
  },
  passwords: {
    title: 'Passwords that hold up',
    words: 'password passphrase manager reuse strong',
    text: `One different password for every account; reuse is how one breach becomes ten. A password manager makes that painless (Bitwarden is free and open source; KeePassXC keeps everything offline; browser managers beat reusing). For things you must remember (the manager itself, your replicant matrix), use a passphrase of 4-6 random words. Length beats symbols.
Never give a password to anyone who contacts you, Bob included: Bob never needs one. Check whether a password has leaked with the "Check a password safely" box under the Security Hand in Settings: only 5 characters of a scrambled fingerprint leave this replicant matrix (your computer).`
  },
  '2fa': {
    title: 'Two-step sign-in (2FA)',
    words: '2fa mfa two factor two-step authenticator passkey sms code',
    text: `Turn it on first for: email (it resets everything else), your password manager, bank, Microsoft/Google/Apple account, and gaming/social accounts worth stealing. Best to worst: passkeys or a security key, an authenticator app (Aegis, 2FAS, Microsoft or Google Authenticator), then text messages (still far better than nothing).
Save the recovery codes somewhere safe and offline. No real company asks you to read a code back to them; anyone who does is taking over your account. Ask your phone carrier for a port-out PIN or account PIN, which stops SIM-swap attacks.`
  },
  updates: {
    title: 'Updates',
    words: 'update patch windows update driver browser outdated',
    text: `Most break-ins use holes that already have a fix. Keep Windows Update on, restart when it asks, and keep browsers, Discord, Steam, graphics drivers, and anything that opens files (PDF readers, 7-Zip, Office) up to date. Uninstall what you don't use; less software means fewer holes. Phones: install updates and keep apps from the official store.`
  },
  backups: {
    title: 'Backups (your undo button for ransomware and dead drives)',
    words: 'backup restore ransomware 3-2-1 copy drive cloud',
    text: `The 3-2-1 habit: 3 copies of what matters, on 2 different kinds of storage, 1 kept away from this replicant matrix (cloud, or a drive at a friend's or unplugged in a drawer). An always-plugged-in drive can be encrypted along with this replicant matrix, so unplug it after a backup. Windows: File History or Windows Backup; for projects, a git remote counts as one copy. Test a restore now and then: a backup you've never restored is a hope, not a backup.`
  },
  wifi: {
    title: 'Wi-Fi and public networks',
    words: 'wifi wi-fi public hotspot vpn cafe airport hotel',
    text: `On public Wi-Fi, sites with https are still encrypted, so the big risks are fake hotspots with a familiar name and sign-in pages asking for too much. Mark public networks as Public in Windows (that turns off file sharing and discovery). Turn off auto-join for open networks. A VPN hides your traffic from the hotspot but not from the VPN company; it doesn't make you anonymous and doesn't stop phishing. Your phone's hotspot is often safer than café Wi-Fi.`
  },
  router: {
    title: 'Your home router',
    words: 'router modem home network wifi password admin upnp port forwarding firmware',
    text: `Change the router's admin password from the one on the sticker, keep its firmware updated (or replace it if it no longer gets updates), use WPA2 or WPA3 with a long Wi-Fi password, switch off WPS, and turn off UPnP unless a game truly needs it (it lets programs open doors to the internet by themselves). Remove port forwards you don't use. A guest network for visitors and smart gadgets keeps them away from your replicant matrices. Bob's web page is LAN-only; never forward its port to the internet.`
  },
  sharing: {
    title: 'Before you share a photo or document',
    words: 'share photo metadata exif gps location document author before posting upload',
    text: `Phone photos can carry the exact GPS spot they were taken, plus the phone model and time. Word, Excel and PowerPoint files carry the author, the company, comments, tracked changes and speaker notes. AI pictures can carry the whole prompt. Ask Bob to check a file (inspect_file) and make a clean copy (strip_metadata). Also look at the picture itself: house numbers, street signs, car plates, school logos, mail on a table, a view from a window, and screens in the background give away more than any metadata. Most social sites strip GPS when you post, but email, Discord, cloud links and chat apps often send the original.`
  },
  scams: {
    title: 'Common scams right now',
    words: 'scam fraud tech support refund cra crypto romance job marketplace',
    text: `Tech support pop-ups ("your PC is infected, call this number"): close the browser (Ctrl+Shift+Esc to end it if needed); Microsoft never phones you. Tax agency calls demanding gift cards or crypto: the CRA doesn't take those. Refund or overpayment ("we sent too much, send it back"). Marketplace buyers who overpay or want a "verification code". Job offers that pay you to move money or buy equipment first. Romance or "wrong number" chats that turn to crypto investing. Fake "prove you're human" pages that tell you to press Windows+R and paste something: that pastes a command that installs malware. Steam/Discord "is this you in this picture?" and free Nitro links that steal the account.`
  },
  defender: {
    title: 'Understanding Microsoft Defender alerts',
    words: 'defender alert threat quarantine trojan pua hacktool behavior false positive windows security',
    text: `A name like Trojan:Win32/Wacatac.B!ml reads Type:Platform/Family.Variant!How-it-was-spotted. "!ml" means its machine-learning guess, which is where most false alarms come from (cracked games, mod tools, small unsigned programs). PUA = probably junk, not usually dangerous. HackTool = a tool that can be misused (cheat engines, password tools). Behavior: = something did something suspicious while running.
Quarantined means locked away and harmless; leave it unless you are sure it's a false alarm. "Remove" deletes it. "Allow" lets it run forever, so only do that for something you trust and know the source of. Check a file's reputation by its SHA-256 (inspect_file gives it) on virustotal.com, which compares many antiviruses. Bob can show recent detections (security_check threats), explain them, and start scans; restoring, allowing and exclusions you do yourself in Windows Security > Virus & threat protection > Protection history.`
  },
  hacked: {
    title: 'I think I have been hacked: what now',
    words: 'hacked compromised account taken over virus infected stolen breach help',
    text: `From a device you trust (your phone if this replicant matrix is suspect): 1. Change your email password first, then the account in trouble, then any place sharing that password. 2. Turn on two-step sign-in and sign out all other sessions (most sites have "sign out everywhere"). 3. Check the account's recovery email/phone and forwarding rules in email (attackers add a rule to hide replies). 4. On this replicant matrix: run a Defender full scan and the Microsoft Defender Offline scan (Windows Security > Scan options), check startup items (security_check startup), and remove programs you don't recognise. Remote-control apps (AnyDesk, TeamViewer, etc.) you didn't install should go. 5. Tell your bank if money or cards are involved; tell friends if the account messaged them. 6. If it keeps coming back, back up your files (not programs) and reset Windows. Report fraud to the Canadian Anti-Fraud Centre.`
  },
  ransomware: {
    title: 'Ransomware',
    words: 'ransomware encrypted files ransom locked extension note',
    text: `Signs: files with new endings that won't open, and a "how to get your files back" note. Unplug the network cable / turn off Wi-Fi straight away and unplug backup drives. Don't pay (no guarantee, and it funds the next attack). Check nomoreransom.org: free decryptors exist for some families. Then restore from a backup that wasn't connected. Prevention: updates, offline backups, Defender's Controlled folder access (Windows Security > Ransomware protection), and not running unknown downloads.`
  },
  accounts: {
    title: 'Account hygiene (an every-few-months check)',
    words: 'account security checkup audit sessions recovery old accounts delete',
    text: `Run Google's Security Checkup, Microsoft's account security page and Apple's Account settings: review signed-in devices, third-party apps with access, recovery details. Delete accounts you no longer use (justdeleteme.xyz explains how for many sites); old forgotten accounts with reused passwords are a favourite way in. Check your email on haveibeenpwned.com (free on their site) and turn on its notify-me alerts.`
  },
  devices: {
    title: 'Lost or stolen phone or laptop',
    words: 'lost stolen phone laptop find my device wipe encryption bitlocker',
    text: `Before it happens: a screen lock (PIN, not a pattern), Find My Device / Find My turned on, device encryption on (Windows: Settings > Privacy & security > Device encryption or BitLocker; keep the recovery key in your Microsoft account or printed), and backups. After: locate it, lock it, then erase it remotely if it's gone; change the passwords of accounts that were signed in; call your carrier to block the SIM. Report theft to police for insurance.`
  },
  privacy: {
    title: 'Everyday privacy settings',
    words: 'privacy tracking settings windows telemetry ads browser cookies data broker',
    text: `Windows: Settings > Privacy & security: turn off advertising ID, review app access to location, camera and microphone. Browsers: block third-party cookies, use uBlock Origin (Firefox, or Chromium browsers that still support it), and consider a separate browser profile for banking. Phones: review which apps have location "always". Be sparing with what you put in public profiles: birthday, hometown, school, pets and first car are also security-question answers. Data-broker sites that list people can usually be asked to remove you; search your own name to see.`
  },
  opsec: {
    title: 'Op-sec habits (keeping what matters to yourself)',
    words: 'opsec operational security habits compartment anonymity identity separation',
    text: `Op-sec is thinking about what a stranger could piece together from small public bits. Habits: separate identities for separate lives (a different email and username for gaming, dev work and personal accounts, so one leak doesn't link them); don't reuse a unique username where you want privacy; post about places after you've left, not while you're there; strip metadata from files you share; keep personal and work/stream screens apart (check what is visible before screen sharing or streaming, including browser tabs, notifications and taskbar); give a mailbox or PO box rather than a home address where you can; and treat "fun" quizzes (first pet, street you grew up on) as the security questions they are. For a business or public project (like a game studio site), use a role address and domain privacy on registrations.`
  },
  search: {
    title: 'Search operators (searching like a researcher)',
    words: 'search operators google dorking dork site filetype intitle inurl quotes exclude advanced search',
    text: `These work in web_search (DuckDuckGo) and most engines:
"exact phrase" finds those words together, in that order. Use it for error messages, quotes and names of things.
-word leaves out results with that word: jaguar -car.
site:example.com searches only that site; site:.gc.ca only Canadian government sites; site:reddit.com for real people's experiences; -site:pinterest.com drops a site.
filetype:pdf (or docx, xlsx, pptx, csv) finds documents: manuals, datasheets, reports, official forms.
intitle:word needs the word in the page title; inurl:word in the address.
OR (in capitals) for either word: "unreal engine" (crash OR freeze).
Dates: the web_search "when" setting limits results to the past day, week, month or year. Google also takes before:2025-01-01 and after:2024-06-01.
Good patterns: an error message in quotes plus the product; site:github.com "error text" for issues; filetype:pdf site:manufacturer.com model-number for a manual; "product name" review -site:the-shop.com for independent reviews.
Use them to research things, not to dig up private files or exposed systems belonging to others. That's off-limits for Bob.`
  },
  osint: {
    title: 'Checking who is behind something (public-source research)',
    words: 'osint verify research website real fake who owns sender image reverse search fact check source',
    text: `Bob's method for "is this real?", using only public sources:
1. A website: how old is it (osint_lookup site: registration date and certificate history), does it look like a known brand's name, does it have real contact details, and do independent sources (news, Reddit, BBB, reviews not on the site itself) mention it? Very new and urgent = suspect.
2. A sender: check the real address and domain, not the display name; check the email's headers (inspect_file on the .eml, or paste with headers).
3. A link: osint_lookup link shows where it goes and follows short links without loading the page.
4. An image: check its hidden details (inspect_file), then do a reverse image search yourself on Google Lens, Bing Visual Search or TinEye to find where else it appears and its earliest copy. Old photos recycled as "breaking news" and stolen profile pictures show up this way. Look for signs of AI: odd hands, text that melts, mismatched earrings, backgrounds that don't make sense.
5. A claim: find the original source, check its date, look for two independent confirmations, and note who benefits.
Research companies, websites, claims and your own footprint. Bob doesn't help find, track or profile private people (where they live, who they are behind a username, their phone number); that's stalking territory even when it starts as curiosity.`
  },
  footprint: {
    title: 'Checking your own digital footprint',
    words: 'footprint my name myself online presence google myself exposure self audit data broker',
    text: `Search for yourself the way a stranger would (in a private window): "Your Name" with your city, your email address in quotes, "your usual username", your phone number in quotes, and "Your Name" site:linkedin.com or site:facebook.com. Look at image results too. Note what's out there: old profiles, forum posts, people-search listings, photos that show your home or school. Then tidy up: delete or lock old accounts, ask people-search sites to remove listings (each has an opt-out page), set profiles to private, and set up a Google Alert for your name. Check your email on haveibeenpwned.com for breaches. Bob can run these searches with web search on, for you only.`
  }
};

export function tipsFor(topic) {
  const t = String(topic || '').toLowerCase().trim();
  if (!t || t === 'list' || t === 'topics') return `Topics: ${Object.entries(GUIDE).map(([id, g]) => `${id} (${g.title})`).join('; ')}.`;
  const direct = GUIDE[t] || GUIDE[t.replace(/\s+/g, '')];
  if (direct) return `${direct.title}\n${direct.text}`;
  const words = t.split(/\W+/).filter((w) => w.length > 2);
  const scored = Object.values(GUIDE).map((g) => ({ g, n: words.filter((w) => `${g.title} ${g.words}`.toLowerCase().includes(w)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  if (!scored.length) return `I have no notes on "${topic}". ${tipsFor('list')}`;
  return scored.slice(0, 2).map(({ g }) => `${g.title}\n${g.text}`).join('\n\n');
}
