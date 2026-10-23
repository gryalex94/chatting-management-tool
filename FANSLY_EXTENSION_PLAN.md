# Fansly extension: build plan (24 Oct 2026)

Fansly moves off Infloww. Each chatter works in an anti-detect browser (AdsPower or Anty) with our extension loaded. The extension records what happens in the chat and helps the chatter; it never sends anything to Fansly on its own. Four pieces, in order; each one is usable on its own.

Everything about Fansly's calls is in research_notes/fansly-api-capture-2026-10-23.md (three captures, 23 Oct).

## The four pieces

1. **Live recording.** Every message, PPV send (with price), tip, read time and fan profile the page loads or receives live goes to our database within seconds, tagged with the chatter on shift. Listen only.
2. **History and the sales ledger.** The extension fetches older chats page by page at a gentle pace, and the earnings ledger (every PPV unlock, tip, subscription) so each PPV is marked sold or unsold. Read requests through the page's own login; nothing is written to Fansly.
3. **Side panel on the chat.** Our data about the fan next to the conversation: total spent, last purchase, notes from previous shifts, closeness, plus the shift timer and warnings ("no PPV offered in 15 messages", "he is waiting 6 minutes"). Talks only to our server.
4. **Suggested replies.** The AI engine we built for Fanvue drafts a reply from the Fansly chat; the chatter gets it in the message box, edits and presses send themselves. Fansly sees a human typing.

Not in scope: anything that posts to Fansly (sending, pricing, notes, mass messages). Those stay behind a per-page switch for a later decision.

## Decisions (defaults until you say otherwise)

| Question | Default | Why |
|---|---|---|
| Browser | AdsPower | Both are Chromium and load unpacked extensions; AdsPower has team profile sharing and the larger user base. Anty works the same if you prefer it. |
| Profiles | One browser profile per page, shared by the chatters on shift | The profile is the page's identity (login, cookies, fingerprint). Who is chatting comes from the extension login, not from the profile. |
| Who is who | Chatter signs into the extension with their account from our tool | Fansly does not stamp messages with a session. Management Sessions can replace the shared password later, after a test. |
| Backfill | Everything, at a gentle pace (one chat every few seconds) | Reads only; Fanvue's sync works the same way. The earnings ledger is 755 rows on this account: one evening. |

## How it is built

### The extension (plain JavaScript, Chrome Manifest V3, built with Vite)
- **Page script** runs inside fansly.com and wraps the page's network functions (fetch, XHR, WebSocket). It recognises the calls we care about by their path (`/messaging/groups`, `/message`, `/group/<id>/`, `/account/wallets/earnings/transactions`, `/subscribers`, `/notes`, socket events of service 5 and 2) and hands a copy to the background. It does not change what the page sends or receives.
- **Background worker** removes duplicates, batches every 3 seconds, posts to our server with the chatter's token, keeps a local queue when offline, retries.
- **Popup**: login with the chatter's account from our tool; shows the page being recorded, the shift, and the queue state ("12 waiting, last sent 4 s ago").
- **Side panel** (piece 3) and **suggest button** (piece 4) are injected into the chat page and fetch from our server.
- For piece 2 the background asks the page script to fetch older chats and the ledger through the page's own networking code, so Fansly's signed headers are always right.

### The server (existing Express app on Railway)
- `POST /api/fansly/ingest`: accepts batches, checks the chatter token (same middleware as the app), writes to the tables below, answers with what it kept.
- `fansly` module mirroring `fanvueSync.js`: parsing of Fansly's objects, the sold/unsold join (sale.correlationId = attachment.contentId, sale.correlationAccountId = fan), shift attribution (chatter + time → shifts table), nightly ledger pull request to whichever extension is online.
- Dashboard data: per chatter and per page: messages, PPVs sent, sold, revenue, reply speed, read-not-answered list. Payroll uses the existing per-platform lines (platform = fansly).
- AI: `loadChat` gets a Fansly reader so `reply()` works on a Fansly page unchanged.

### Tables (Supabase; raw JSON kept beside parsed fields, as the Fanvue tables do)
- `fansly_accounts`: our page ↔ Fansly account id, username, status, last seen by an extension.
- `fansly_fans`: fan account id, username, display name, nickname, joined, last seen, follows, tier, subscription status and dates, totals (spent, last purchase).
- `fansly_messages`: message id, group id, fan, from_fan, type (1 chat, 2 mass, 0 tip), text, sent_at, delivered_at, read_at, reply_to, attachments (media/bundle ids, price), chatter_id, shift_id, raw.
- `fansly_items`: media and bundles sent as PPVs: id, kind, price, media type/duration, vault album, lifetime sales.
- `fansly_transactions`: the ledger: transaction id, type (media, bundle, tip, subscription, locked text, refund…), fan, item id, net amount, created_at, status, message_id once matched.
- `fansly_notes`: Fansly notes on fans, mirrored.
- `fansly_ingest_log`: every batch: chatter, page, counts, errors.

## Phases, what "done" looks like

**Phase 0, setup (you)**: AdsPower installed, one profile for the test page logged into Fansly, extension loaded unpacked, one chatter account to test with.

**Phase 1, live recording.** Open a chat in the profile → its messages, the fan and any PPV appear in our database within 5 seconds, with the chatter's name. New messages arriving live are recorded too. Dashboard page "Fansly" lists pages, chatters online, messages today.

**Phase 2, history and ledger.** First run copies all chats and the full ledger. Each PPV in the dashboard shows sold / unsold and the amount. Per-chatter day summary: messages, PPVs sent, sold, net revenue, median reply time. Payroll sees Fansly lines.

**Phase 3, side panel.** Opening a chat shows the fan card from our data, notes from earlier shifts, the shift timer and warnings. Chatters can add a note in the panel (stored with us, not on Fansly).

**Phase 4, suggested replies.** A "Suggest" button in the panel asks the AI engine for a draft using the Fansly chat and the fan's memory; the draft lands in the message box; the chatter edits and sends. Every accepted, edited or discarded draft is logged as feedback, like Practice.

## Risks and how they are handled
- **Fansly changes its app.** We match by path and field names, which have been stable (api/v1 for years). Raw JSON is stored, so a parsing fix can be replayed without re-capturing.
- **Anti-detect browser blocks extensions.** Both vendors support unpacked extensions; confirmed in their docs, to be tested in Phase 0.
- **Two chatters on one profile at once.** The extension login decides attribution; the shifts table catches overlaps and the dashboard flags them.
- **Reads look like a bot.** Backfill runs at human pace, only while the profile is open, and stops when the chatter is active.
- **Fansly's terms.** Pieces 1, 3 and 4 only read what the page already shows. Piece 2 fetches more of the same data with the page's own login; it is the same thing Fanvue's official sync does, only without an official API.

## What I need from you to start
1. The four decisions above, or "defaults".
2. Which page(s) go first.
3. AdsPower (or Anty) installed, the test profile logged in, and a chatter who will test with you.

## Additions of 24 Oct (owner's requirements)

**Account types.** The tool already has these roles: owner, admin, head manager, manager, chatter, VA. The extension and the Fansly pages use the same accounts, mapped like this:
- **Owner** (owner / admin): everything, including payouts, rates, which chat sales count, and who may install the extension on which page.
- **Chatting manager** (head manager / manager): all chatters and pages they are assigned to, live view of who is chatting where, reports, notes, the AI settings; no payout rates.
- **Chatter**: only their own shifts, numbers and notes; the extension works only for pages they are assigned to.
The extension refuses to record unless someone is logged in, and shows who on every screen.

**Every sender is tracked, always.** Each message, PPV and note carries the chatter who was logged into the extension on that browser at that moment, plus the shift it falls into. When nobody is logged in the page is still recorded, but the row is marked "unattributed" and the manager's view flags it. Two people logged into the same page at once is flagged too. Mass messages are attributed to whoever sent them, kept apart from chat messages in every report.

**Sales are always captured, tips included.** Two independent sources so nothing is missed: the live purchase event in the browser (seconds) and the earnings ledger (complete, pulled every night and on demand). Each row in `fansly_transactions` is classified:
- **chat PPV**: the sold item is an attachment of a message sent to that fan in a chat → credited to the chatter who sent that message.
- **chat tip**: the tip sits on a chat message or arrives in that chat → credited to the chatter on shift in that chat at that time.
- **wall / post purchase, subscription, renewal, locked text on the wall, stream ticket, referral**: recorded with the full amount for page statistics, **not credited to any chatter's salary**. The rule: credit only what can be traced to a message a chatter sent or a chat they were working.
- **refund / chargeback**: subtracted from the chatter it was credited to.
Edge cases are settled by a rule the owner can change per page: a mass-message PPV bought later (default: credited to the sender of the mass message), a chat PPV bought days after the shift ended (default: credited to the sender, counted on the day of purchase).

**Reports and payouts.** One daily summary per chatter per page: messages sent, fans spoken to, PPVs sent / sold / sell rate, chat PPV net, tips net, refunds, median reply time, time on shift. Payroll takes these lines through the existing per-platform rates (platform = fansly), with the owner's rules above baked in, so no spreadsheet step remains. Page view: all revenue by type (chat, wall, subscriptions, tips), top fans, new paying fans, expired subscriptions.

**Notes sidebar with AI help.** The side panel (piece 3) holds the fan's notes: what previous shifts wrote, Fansly's own note on the fan (mirrored), and an AI summary of the fan from the chat history ("what he likes, what he bought, what he said no to, open promises"), refreshed when the chat changes. Chatters add notes in the panel; the AI can suggest a note after a long conversation ("add: he travels to Prague in November"). Notes live in our database and never leave it.

**Everything is stored.** Every chat a chatter opens is recorded in full, including the older messages the page loads when they scroll. The thread list, the fan profiles, the subscriber list with tiers and dates, the follower list, the custom lists and their members, the vault items used as PPVs, the ledger and the notifications are all mirrored into Supabase with the raw JSON kept, so a report can be rebuilt later without touching Fansly again.

### Table changes from these additions
- `fansly_messages`: add `chatter_id`, `shift_id`, `attribution` (logged_in / unattributed / conflict).
- `fansly_transactions`: add `category` (chat_ppv / chat_tip / wall / subscription / other / refund), `credited_chatter_id`, `credited_message_id`, `credited_rule`.
- `fansly_presence`: who was logged into which page's browser, from when to when (the ground truth for attribution and for "who is online now").
- `fansly_lists`, `fansly_list_members`, `fansly_subscriptions`, `fansly_followers`: the mirrored lists.
- `fansly_fan_summaries`: the AI summary per fan, with the message it was last built from.
- `fansly_daily`: the per-chatter per-page daily summary that reports and payroll read.

## Addition of 23 Oct, evening: the Messages dashboard (owner's request, after Phase 1 went live)

A page like Infloww's message dashboard: every message sent from each page, in one list.
- One row per message sent by the team: time, page, chatter (or "not attributed"), fan (nickname, username), the text, PPV price, sold or not (and when), delivered / read time, how long the fan had been waiting, mass or personal.
- Filters: page, chatter, day or range, only PPVs, only sold, only unanswered, search in text.
- Click a row → the whole conversation with that fan, as the chatter saw it.
- Totals above the list for the current filter: messages, PPVs sent, sold, sell rate, net.
- Export to CSV for the same filter.
- Placed right after Phase 2 (it needs the sold mark from the ledger), before the side panel.

## Phase 1 went live on 23 Oct
Commits 20776a9 … 7f8fbcd. The first real browser recorded 538 messages, 60 priced PPVs and 43 fans of @corarossi in ten minutes; sends were credited to the signed-in owner with the right shift.

## Phase 2 status (23 Oct, evening)
Built: sale matching (fanslyStats.matchSales: a ledger sale ↔ the PPV message carrying that item to that fan, re-run after every batch so late-arriving chats still match; tips to the last writer in that chat within 12 h), the sold mark on PPV messages, the daily summary table fansly_daily (per account, Amsterdam day, chatter: sent, mass, fans, PPVs sent/sold, PPV net, tips, refunds, unattributed, median reply time), recount after each batch and every 6 hours on the live server, the Fansly payroll line (credited sender first, else whoever was on the Fansly roster), and a 14-day table on the dashboard.

Not built: the extension fetching older history and the ledger on its own. It would have to reproduce Fansly's request signature, and the safety check stopped that step. History and sales therefore arrive the passive way: every chat a chatter opens (and scrolls) is recorded in full, and the sales ledger is recorded when someone opens Fansly's Earnings page and scrolls its list. The popup and the dashboard remind when the ledger has not been read for a day. Sales that can't be tied to a recorded chat show as "wall" until their chat is opened.

## Addition of 23 Oct, late: the big side panel and the scripts library (owner's request)

**Side panel (Phase 3, replaces the smaller panel described above).** While the extension runs, a wide panel sits on the right of the Fansly page (resizable, about a third of the screen, can be collapsed to a thin strip). It follows the chat that is open and shows, top to bottom:
- **Fan card:** name, nickname, username, tier and subscription dates, joined, last seen, follows you.
- **Metrics:** total spent with us, PPVs bought / offered and his buy rate, tips, last purchase and what it was, average price he pays, days since last purchase, his usual reply speed, the hours he is usually online.
- **Notes:** notes from every shift (who wrote it, when), Fansly's own note on him mirrored, add / edit in place.
- **AI summary:** what he likes, what he bought and refused, open promises, suggested next step; refreshed when the chat changes; the AI can propose a note to save.
- **Shift strip:** who is signed in, shift timer, warnings (he is waiting N minutes, no PPV offered in the last N messages, he already owns this item).
- **Scripts** (below).
The panel only reads from our server and writes our notes; it never sends anything to Fansly.

**Scripts library.** Ready-made message scripts per page and per stage (opener, warm-up, sexting steps, PPV pitch, after a no, re-engage, custom request, aftercare). A chatter clicks a script → it lands in the Fansly message box to edit and send by hand. Placeholders fill from the fan card ({name}, {last_bought}). Managers write and order them in the tool; each script records how often it was used and how often the PPV after it sold. **Later:** each script can be linked to vault content (an album or specific items by their Fansly media ids), so the panel shows which item goes with which script, warns when he already owns it, and shows its price and sell rate.

## Built on 23 Oct, night: Messages dashboard page, side panel, scripts library
- **Messages dashboard page**: the Fansly dashboard now has three tabs (Pages, Messages, Scripts). Messages lists every message the team sent with the filters, the totals for the filter, a click opening the whole conversation, and CSV export.
- **Side panel** (extension 0.2.0, `extension/panel.js`): follows the open chat (the chat id in the address, else the chat the page just loaded) and shows the shift strip with warnings (he is waiting, no PPV in 15+ messages, last PPV not bought, subscription ending), the fan card, his numbers (spent, PPVs bought of offered, buy rate, tips, average price, days since last buy, reply speed, the hours he writes), notes (add, edit, pin, delete; your own, or any for a manager), the AI summary (Claude Haiku 5.5; likes, bought, said no to, open promises, facts, next step, a note idea to save), and the scripts. Resizable, collapsible, can make room for itself or lie over the page; the popup has a switch to hide it. Server: `/api/fansly/panel/*` (any signed-in account), `server/src/routes/fanslyPanel.js`.
- **Scripts library**: managers write, order, hide and measure scripts per stage and per page (tab "Scripts"); placeholders {name}, {last_bought}, {page}; optional vault item ids, and the panel marks a script whose content he already bought. Each click is logged; the tab shows uses in 90 days and how the PPV sent within 2 hours after it sold. Tables in 055 (applied in Supabase).
- (Done the same night, see below: Fansly's own notes, page assignment, Phase 4.)

## Built on 23 Oct, late night: the rest of the plan (056, applied in Supabase; extension 0.3.0)
- **Who may work which page**: a chatter works only the Fansly pages they are on the roster for (Shifts page; old page assignments and merged page groups count too). Managers and up see every page. Someone off the roster is still recorded under their name, but the panel stays closed for them, the popup says why, and the dashboard marks them "not on the roster for this page".
- **Mirrors**: the extension now also copies Fansly's own notes on fans (shown in the panel's Notes), the fan lists and their members (shown as chips on the fan card), the subscriber list as subscriptions with tiers and dates, followers, notifications (a media or bundle purchase notification counts as a sale until the ledger row replaces it) and what the Statistics page shows (summary, top fans) as snapshots. Shapes of the notes, list members and followers answers were not seen in a capture yet; the parsing reads the likely fields and keeps the raw JSON.
- **Credit rules per page** (Pages, Settings; owner/admin): a mass message's PPV goes to its sender or to nobody; a chat PPV bought more than N days later goes to nobody (default: always its sender, counted on the purchase day); the tip window (default 12 h). A refund comes off the chatter its sale was credited to (the latest sale to that fan for the same amount). Changing a rule re-matches every sale and recounts every day. Payroll leaves the sales a rule gave to nobody off every line. Mass message PPV money is shown apart ("of it mass") in the 14-day table.
- **Revenue tab**: per page and period: net revenue by type (chat PPVs, mass PPVs, tips, wall, subscriptions, other, refunds), by day, top fans, new paying fans (first purchase ever in the period), expired subscriptions, and per chatter how the AI's suggestions were used.
- **Phase 4, suggested replies**: in the panel, "Suggest a reply" runs the same engine as AI chat on the Fansly chat (his messages, PPVs and purchases, notes from every shift, Fansly's note, the AI summary as his memory card), with the AI profile picked for the page in Settings. Selling (attaching content) is off: the engine only writes text. The draft goes into the message box on a click; the chatter edits and sends. Each suggestion is logged in fansly_ai_drafts as shown, inserted, sent as is, edited (compared with what was really sent) or discarded; the engine's plan for the fan carries over to the next suggestion within 6 hours.
- Still not possible: the extension fetching history or the ledger on its own (it would have to copy Fansly's request signature). History and sales keep arriving the passive way.

## 24 Oct: summary on request, one fan across the agency (057, applied in Supabase; extension 0.3.1)
- **AI summary only on the button.** Opening a chat shows the saved summary; nothing is built until a chatter presses "Summarise him" or "update" (a note says when his chat moved on since). Each build is now in the AI usage log (kind fansly_summary) with its real token count and cost.
- **Across the agency** (panel section under the fan card): every page where the fan sits and what he spent there, net, with a total. Fansly pages are exact (Fansly gives a fan one id across creators). OnlyFans (Infloww sales) and Fanvue (earnings) need a link: a chatter searches his username there and links him once (fan_links); an exact same username is offered as a "probably him" suggestion. "not him" removes a link.

## 24 Oct, later: bought marks from the chat, unsent messages, mass messages apart (058, applied in Supabase; extension 0.4.0)
- **Bought PPVs from the chat itself.** Fansly's chat answer carries accountMediaOrders (fan + item: the "This user has purchased this media" label); the extension now keeps them. Each marks that PPV message sold (sold_source chat); one with a time also counts as a sale (source order, net 80% of the price) until the Earnings ledger replaces it. Chats recorded before 0.4.0 need to be opened once more to pick the marks up.
- **Unsent.** The extension notes an unsend (POST /message/delete) and Fansly's deletedAt on messages; a mass message's unsend marks every copy (they share its correlationId). Fansly's mass message history (and its Deleted tab) is mirrored into fansly_broadcasts.
- **Mass messages apart.** The Messages page lists chat messages only; a "Mass messages" button shows each mass message once (fans reached, read share, PPV, bought, net, unsent). Older copies without Fansly's id are grouped by text and price sent within 30 minutes of each other. An "Unsent" filter works in both views.
- **One account per platform.** A fan is linked to at most one OnlyFans and one Fanvue account; a new link replaces the old. The panel shows one block per platform with its pages underneath.

## 24 Oct, evening: the panel next to the page (extension 0.5.0)
- The panel now opens in Chrome's own side panel (popup: "Open the panel next to the page"), so Chrome narrows the Fansly page instead of the panel covering it. It follows the active Fansly tab's chat; a clicked script or suggestion is typed into that tab's message box by bridge.js. Needs Chrome 116+; older browsers fall back to the panel inside the page (popup: "Where the panel shows").
- The search for linking a fan to his OnlyFans / Fanvue account by hand is gone from the panel; a same-username match is still offered.
