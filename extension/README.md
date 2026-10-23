# Chatting Manager for Fansly (browser extension)

Records the Fansly chats a chatter works in and sends them to the tool. It reads
what the Fansly page already loads or receives; it never sends anything to Fansly.

## Install (AdsPower, Anty, Chrome: all the same)

1. Copy this `extension` folder to the computer that runs the browser.
2. Open `chrome://extensions` in that browser (in AdsPower: open a profile, then the address).
3. Turn on **Developer mode** (top right), click **Load unpacked**, pick the folder.
4. Pin the extension, click its icon, sign in with your account from the tool.
   Under "Tool address" you can point it at a local server (http://localhost:3001) for testing.
5. Open fansly.com/messages. The popup shows the account it is recording and what it has sent.

In AdsPower you can also add the folder once under *Extensions* and apply it to every profile.

## What it records

The thread list, the fan profiles, every chat opened (including what loads on
scroll), every message you send (under your name), messages arriving live, PPV
items and their prices, read receipts, the subscriber list and the earnings ledger
when those pages are opened. Media links are dropped; ids, texts, prices and times
are kept.

## The side panel

A panel on the right of the Fansly page follows the open chat and shows the fan's
card, his numbers (spent, PPVs bought of offered, tips, last purchase, reply speed,
the hours he writes), notes from every shift (add, edit, pin), an AI summary of
the chat, the shift strip with warnings (he is waiting, no PPV offered for a while,
his subscription ends) and the scripts library. Clicking a script types it into
the message box; you check it and press send yourself.

Drag its left edge to resize, `›` collapses it to a strip, `⇤` switches between
making room for it and laying it over the page. The popup has a switch to hide it.
Notes and the summary stay in the tool; nothing is written to Fansly.

## Files

- `page.js`: runs inside the Fansly page and copies the answers Fansly sends the page.
- `bridge.js`: passes them to the background worker.
- `background.js`: removes repeats, batches, posts to `POST /api/fansly/ingest`, sends the presence heartbeat.
- `panel.js`: the side panel; reads from `/api/fansly/panel/*` through the background worker.
- `popup.html/js`: sign in, status, the panel switch.
