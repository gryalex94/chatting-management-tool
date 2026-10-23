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

## Files

- `page.js`: runs inside the Fansly page and copies the answers Fansly sends the page.
- `bridge.js`: passes them to the background worker.
- `background.js`: removes repeats, batches, posts to `POST /api/fansly/ingest`, sends the presence heartbeat.
- `popup.html/js`: sign in, status.
