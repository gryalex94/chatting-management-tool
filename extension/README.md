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
items and their prices, read receipts, and, when those pages are opened: the
subscriber list, the earnings ledger, Fansly's notes, the fan lists, followers,
notifications and the statistics summary. Media links are dropped; ids, texts, prices and times
are kept.

## The side panel

By default the panel opens in **Chrome's own side panel**, next to the page: Chrome
narrows the Fansly page, so nothing is covered. Click the extension icon, then
**Open the panel next to the page** (Chrome only opens it after a click; it then
stays open while you move between chats). Drag its edge to change the width. This
needs Chrome 116 or newer; on an older browser the popup switches the panel to
"Inside the Fansly page". The popup's "Where the panel shows" choice switches
between the two, or hides it.

The panel follows the open chat and shows the fan's
card, his numbers (spent, PPVs bought of offered, tips, last purchase, reply speed,
the hours he writes), notes from every shift (add, edit, pin), an AI summary of
the chat, the shift strip with warnings (he is waiting, no PPV offered for a while,
his subscription ends) and the scripts library. Clicking a script types it into
the message box; you check it and press send yourself.

At the top, **Suggest a reply** asks the tool's AI for a draft from this chat
(once a manager picked the page's AI profile). Click a suggested message to put it
in the box, edit it, send it yourself. The tool notes whether it was sent as it
was, edited or dropped.

The panel opens only on pages you are on the roster for (Shifts page in the tool).

Inside the page: drag its left edge to resize, `›` collapses it to a strip, `⇤`
switches between making room for it and laying it over the page.
Notes and the summary stay in the tool; nothing is written to Fansly.

## Files

- `page.js`: runs inside the Fansly page and copies the answers Fansly sends the page.
- `bridge.js`: passes them to the background worker.
- `background.js`: removes repeats, batches, posts to `POST /api/fansly/ingest`, sends the presence heartbeat.
- `panel.js`: the panel; runs in Chrome's side panel (`sidepanel.html`) or inside the page, reads from `/api/fansly/panel/*` through the background worker.
- `bridge.js` also types a clicked script or suggestion into Fansly's message box for the side panel.
- `popup.html/js`: sign in, status, the panel switch.
