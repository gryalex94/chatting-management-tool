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
