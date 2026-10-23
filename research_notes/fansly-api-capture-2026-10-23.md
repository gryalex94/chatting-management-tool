# Fansly web app: what the chat page really calls (capture of 23 Oct 2026)

Source: a sanitized HAR of fansly.com/messages, 144 requests, 7 chat loads, 113 messages.
Chrome's sanitized export strips the Authorization and Cookie headers, so the file holds no login token.
The file itself lives in fansly-capture/ (git-ignored). Numbers below are facts from the capture; guesses are marked.

## Calls

| Call | What it returns |
|---|---|
| GET apiv3.fansly.com/api/v1/message?groupId=<id>&limit=25[&before=<messageId>] | the chat: messages + the media/bundles they attach |
| GET apiv3.fansly.com/api/v1/group/<id>/ | one thread: its two users, lastMessage, DM permission flags |
| GET apiv3.fansly.com/api/v1/message/automated | automated messages (empty here) |
| POST metrics.fansly.com/event/track/v1/, POST /api/v1/it/fyp, leaderboard.fansly.com | telemetry, ignore |
| cdn3.fansly.com/<account>/<media>.jpeg?Policy=…&Signature=… | media; signed links that expire, never store them |

Not in this capture (page was loaded before recording started): the thread list, account/name lookups, the websocket, a PPV send, any purchase/earnings call.

## Headers on every API call
fansly-client-id, fansly-client-ts (ms timestamp), fansly-client-check (13-char hash), fansly-session-id, plus Authorization (stripped by the export). Not needed when the extension reads responses inside the page.

## The message object
```
id, groupId, senderId, type, content (text), createdAt (unix seconds),
inReplyTo / inReplyToRoot / inReplyToMessage, attachments[], embeds[], likes[],
interactions[{userId, deliveredAt, readAt}]   (ms timestamps; 0 = not yet) -> read receipts
totalTipAmount
```
Message `type` seen: 1 = ordinary message from either side (78); 2 = only ever from the creator, 28 of 34 carry media (guess: mass message / PPV send); 0 = a tip (content empty, attachment contentType 7, totalTipAmount 500).

## Attachments and money
- attachment.contentType 1 -> an entry in response.accountMedia (single photo/video); 2 -> response.accountMediaBundles (a set); 7 -> tip (guess).
- Price lives in `permissions.permissionFlags[0].price`, in thousandths of a dollar: 29990 = $29.99. The top-level `price` field is 0, ignore it.
- `saleStats {sales, total, pending}` on a media/bundle = lifetime sales of that item across all fans; `total` is net of Fansly's 20% (14 sales of 29990 gave 335888 = 14 x 23992).
- `purchased`, `access`, `whitelisted` are true for everything the creator views, so they do NOT say whether this fan bought it. Need another source (purchase events over the websocket, or the earnings/statement call) — not captured yet.
- media: id, type (1 image, 2 video), mimetype, filename, width/height, metadata {duration, …}, variants[] (sizes), locations[] (signed CDN URL). Store ids + metadata, not URLs.
- Tip units unverified: totalTipAmount 500 is $0.50 if thousandths like prices, $5 if cents.

## Who is who
group.users[] holds the two account ids; the creator's own id is the one that owns the accountMedia. Fan display names are not in these calls (an account lookup call is needed; not captured).

## Mapping to our tables (plan)
Copy the Fanvue pattern (one table per account + raw jsonb) rather than the Infloww `messages` table:
fansly_messages(account_id, message_id, group_id, fan_account_id, from_fan, type, text, sent_at, price, media_ids[], delivered_at, read_at, reply_to, raw).
Chatter attribution comes from the extension itself (each chatter runs one browser profile), not from Fansly.

## Still needed from a second capture
Start recording BEFORE opening fansly.com/messages, then: the thread list loads, open 3 chats, send one PPV, open Earnings/Statistics, open Notifications. Export with the same "Export HAR" button.
