# Mail catalog: big inboxes on small computers (design, not built)

16 Nov 2026. The owner: "some of my inboxes and some of my friends inboxes have tens of thousands of emails"; "it
could be really hard on a small computer to manage that kind of data, it needs to be cataloged and managed
intelligently for performance"; "by organization or by sender may be the best way to start sorting, then grouping by
category"; "could bob do bulk delete? or bulk archive?". The accounts: Gmail running a person's own domain (Google
Workspace), plus Gmail and Hotmail (Outlook.com).

This is a proposal. Nothing here is built. The tests that measure it are built (`model-lab/mail-world.mjs`,
`mail-jobs.mjs`, `mail-score.mjs`, `mail-bench.mjs`), and they measure today's Bob first.

## 1. What Bob does today (measured)

Bob has two email tools, both off by default, both plain IMAP with an app password:

- `read_email`: list (newest first, **15 shown**, by days back up to 365, words, sender, unread) or read one message.
- `manage_email`: a sort plan on a card (**newest 100 from the last 30 days**), mark, flag, move, archive, trash (to
  the account's Trash, never deleted for good), draft (never sent), undo. **Up to 50 messages a step.**

`mail-bench.mjs` on this cloud computer (4 threads, Node 22), Gmail flavour, Bob's own tools, the mail server in another
process:

| inbox | slowest step | Bob's memory, peak | most mail headers fetched in one step | most text handed to the brain |
|---|---|---|---|---|
| 1,000 | 41 ms | 99 MB | 68 | ~640 tokens |
| 10,000 | 46 ms | 101 MB | 100 | ~650 tokens |
| 30,000 | 54 ms | 101 MB | 100 | ~600 tokens |
| 50,000 | 79 ms | 101 MB | 100 | ~600 tokens |

Most of the 100 MB is Node itself. Bob's data folder grows by about 1 KB (his undo list). So today's tools are **light
but nearly blind**. In the 50,000 inbox, 3,061 messages came in during the last 30 days and the sort plan saw 100 of
them. "Archive everything from Larkspur Outfitters" matched 2,558, and each list step hands the brain 15 ids. That is
about 170 list-and-archive rounds, each with a card. The real server does the searching, so on a real account each
step also costs a round trip. Run `node model-lab/mail-bench.mjs --label <name>` on the Pi 4, the Legion Go and an
8 GB laptop to get their own numbers. Nothing in that table is a guess for those computers.

Two account facts change the plan:

- **Hotmail / Outlook.com no longer takes app passwords** for IMAP. Microsoft turned off Basic authentication for
  Outlook.com, so other apps must sign in with OAuth ([Microsoft support][ms]). Bob's `read_email` will likely not sign
  in to the roommate's Hotmail at all until it can do OAuth. This is unproven in our lab, as we have yet to test it.
- **Gmail and Google Workspace** still take IMAP with an app password when 2-Step Verification is on. A Workspace admin
  can turn IMAP off for users ([Google: setting up IMAP][g1], [turn IMAP on or off][g2]). "Less secure apps" (the plain
  account password) is gone ([Workspace update][g3]).

## 2. The catalog

A small file per account in Bob's data folder (`<data>/mail/<account-hash>.db`, Node's own SQLite as `data-query.js`
already uses). It holds **headers and Bob's labels only, never bodies**:

| column | what it is |
|---|---|
| `uid`, `uidvalidity`, `folder` | where the message is on the server (IMAP), or the Gmail / Graph message id |
| `msgid`, `thread` | Message-ID; Gmail's thread id (X-GM-THRID) or Graph's conversationId |
| `at`, `unread`, `flagged`, `size` | date, flags, size in bytes |
| `from_addr`, `from_name`, `org` | sender; `org` = the sender's registrable domain (`kettlecrumb.example`), or the mailing list's List-Id |
| `subject` (cut to 200) | the subject, cleaned as `email-safe.js` cleans it |
| `bulk` | List-Unsubscribe, List-Id or Precedence bulk/list present |
| `noreply` | no-reply style address, or Auto-Submitted header |
| `auth` | SPF/DKIM/DMARC pass or fail, from Authentication-Results |
| `danger` | `dangerSigns()` from the headers alone |
| `kind`, `kind_by`, `kind_sure` | person / list / newsletter / notice / spam / scam; who decided it (`rules`, `brain`, `you`); how sure |
| `reply` | needs a reply now / soon / no (people only), with a short reason |

Size: about 300 to 500 bytes a row, so **50,000 messages is roughly 15 to 25 MB on disk**. Memory stays flat, because
queries read from the file, not into Bob. We will measure it on the Pi before quoting it.

**Filling it, a little at a time.** The first fill fetches only header fields (the same `BODY.PEEK[HEADER.FIELDS ...]`
read_email uses, so nothing is marked read), 500 messages a batch, newest first. It pauses while Gaming mode is on or
a brain is busy, and shows "Catalogued 12,400 of 50,000" in Settings. After that it is incremental:

- IMAP: UIDs above the last one seen (plus CONDSTORE/QRESYNC changes when the server has them). If UIDVALIDITY changes,
  that folder is filled again.
- Gmail API: `history.list` from the last `historyId`.
- Microsoft Graph: the messages `delta` query.

**Bodies only when needed.** A body is fetched (and never stored) only when the person asks about a message, or when
the rules can't decide and the brain needs a look (below).

## 3. Sorting: sender and organization first, then kind

Following the owner's order:

1. **Group by organization and sender.** One row per `org` (and per list), with its count, unread count, newest date,
   and whether its mail is bulk. "Larkspur Outfitters: 2,558, all bulk, 2,400 unread, newest today." For 50,000 messages
   this is a few hundred groups, small enough for one card and for the brain to read whole.
2. **Then by kind, with cheap signs first** (no brain, no bodies):
   - bulk + List-Id: a mailing list
   - bulk + List-Unsubscribe: a newsletter
   - no-reply style, Auto-Submitted, or a receipt/shipping/statement subject: a notice
   - failed checks or `dangerSigns`: scam
   - a personal address, no bulk headers, mail you have answered before: a person
3. **The brain sees only the unclear ones**, by group, not message by message. That means a person-looking address at a
   newsletter company's domain (the test inboxes' Wren trap), or a "notice" that asks for money. It gets the group's
   headers and, only if still unsure, a few bodies, cut short.
4. **The person can fix a group**, and that is remembered ("Kettle & Crumb's Wren is a person"). `kind_by` becomes
   `you` and is never overwritten.

Labels or folders: Gmail shows labels as folders over IMAP, so one way works on both. On the Gmail API, Bob adds a label
and takes off INBOX. On Outlook (Graph), he moves the message to a folder and can also set an Outlook category.

## 4. Bulk archive and bulk trash

A new `manage_email` action, `bulk`, acting on a group or a filter instead of ids:
`{ action: 'bulk', do: 'archive' | 'trash' | 'mark_read' | 'move', org?, sender?, kind?, older_than_days?, folder? }`.

- **A card first, always**, even with "Work without asking" on. It shows the count, the oldest and newest, 5 samples,
  and anything held back: "2,558 from Larkspur Outfitters. Held back: 1 from a person at that address."
- **Held back by code:** people's mail that needs a reply, anything flagged, anything from the last 2 days unless asked,
  and scams (trashing them is fine, but they are shown separately).
- **Trash means Trash.** Mail goes to the account's own Trash (Gmail keeps it 30 days). Bob never empties it, never
  sets \Deleted on his own, and never runs EXPUNGE. That is the same rule as today.
- **Undo for the whole act**, by Message-ID (as today), kept in the undo list as one entry.
- **Done in chunks** on the server:
  - IMAP: UID MOVE in sets of 500.
  - Gmail API: `messages.batchModify`, 1,000 ids a call.
  - Graph: JSON batching, 20 requests a call.
  - The card shows the progress, and stopping keeps what is done (each chunk is undoable).

## 5. What each account needs

| account | today | catalog and bulk | what the person does |
|---|---|---|---|
| Gmail / Workspace domain | IMAP + app password works | IMAP plus Gmail's own IMAP add-ons: `X-GM-RAW` takes Gmail search (`category:promotions older_than:6m`), and `X-GM-LABELS` / `X-GM-THRID` give labels and threads | app password; Workspace admin keeps IMAP on |
| Gmail, better later | | Gmail API (`messages.list` with `q`, `batchModify`, `history.list`), scope `gmail.modify` | sign in with Google. A restricted scope needs Google's review for a shared app, or each person makes their own OAuth client |
| Hotmail / Outlook.com | **likely no sign-in** (app passwords are off) | Microsoft Graph (`/me/messages`, `$search`, `delta`, `move`, categories), scope `Mail.ReadWrite`, or IMAP with OAuth (XOAUTH2) | sign in with Microsoft (a public client app, device-code sign-in works on the Pi) |

Sending stays out in every case: no `Mail.Send`, no `gmail.send`, no SMTP. A draft is still the most Bob can do.

## 6. How it is tested

`model-lab/mail-jobs.mjs` holds 15 kinds of inbox job on a 300-message graded inbox (Gmail and Outlook flavours) and on
20,000 and 50,000-message inboxes: what needs a reply, people vs automatic mail, scams, sort by sender then kind, unsubscribe,
draft a reply, bulk trash with a trap, bulk archive by age, mailing lists, and finding old mail. `mail-score.mjs` scores
what code can check, and writes blind digests for the Opus read. `mail-bench.mjs` measures time, memory, disk and mail
moved on each computer. The same jobs run before the catalog (today's tools) and after, at all four effort levels, on
Qwen (shape 4) and GPT-OSS (shape 3).

[ms]: https://support.microsoft.com/office/outlook-and-other-apps-are-unable-to-connect-to-outlook-com-f4202ebf-89c6-4a8a-bec3-3d60cf7deaef
[g1]: https://support.google.com/a/answer/10547014?hl=en
[g2]: https://support.google.com/a/answer/105694
[g3]: https://workspaceupdates.googleblog.com/2023/09/winding-down-google-sync-and-less-secure-apps-support.html
