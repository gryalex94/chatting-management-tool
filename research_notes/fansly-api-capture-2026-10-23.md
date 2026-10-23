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

---

# Second capture (same day, recording started before /messages loaded; 466 requests, 36 socket frames)

## New calls

| Call | What it returns |
|---|---|
| GET /api/v1/messaging/groups?sortOrder=1&flags=0&limit=20&offset=0 | the thread list, 20 per page: data[{groupId, partnerAccountId, partnerUsername, flags, unreadCount, subscriptionTierId, lastMessageId, lastUnreadMessageId}] + aggregationData.accounts[] (fan profiles) + aggregationData.groups[] (each with lastMessage) |
| GET /api/v1/message/unread?limit=100&offset=0&before=0 | our sent messages the fan has not read yet (messageInteractions[] with deliveredAt/readAt) |
| GET /api/v1/account/me | the creator account incl. mainWallet / earningsWallet / totalSpent30 / subscriptionTiers |
| GET /api/v1/account/<id>/wallets | wallet balances (thousandths of a dollar) |
| GET /api/v1/subscriptions/tiers | the subscription tiers (the coloured chips in the chat-list filter are tiers: "Same as on OnlyFans" $5 etc.) |
| GET /api/v1/vault/albumsnew, GET /api/v1/media/vaultnew?albumId= | the Media Vault albums and their media (the "From Vault" picker) |
| GET /api/v1/notifications/unack | unread counts by notification type (1002, 2002, 5003, 15007 seen; meaning unknown) |
| POST /api/v1/message/typing {groupId} | typing indicator |
| wss://wsv3.fansly.com/?v=3 | live feed, see below |

Fan profile fields in aggregationData.accounts: id, username, displayName, createdAt, followCount, subscriberCount, followsYou, lastSeenAt, statusId, accountMediaLikes, postLikes, timelineStats. The nickname a chatter gives a fan is group.users[].userSettings.customName.

## How a PPV is sent (two calls, confirmed by sending a $10 photo)
1. POST /api/v1/account/media with a body like
   `[{mediaId, previewId, permissionFlags: 8, price: 0, whitelist: [{accountId: creator}, {accountId: fan}], permissions: {permissionFlags: [{type: 0, flags: 1, price: 10000, metadata: "{\"1\":\"{\\\"price\\\":10000}\"}"}]}, tags: []}]`
   -> returns the new accountMedia record (its `id` is what the message attaches). Price 10000 = $10.00. The fan's id in `whitelist` ties this PPV to one fan.
2. POST /api/v1/message with
   `{type: 1, groupId, content, attachments: [{contentType: 1, contentId: <accountMedia id>, pos: 0, messageId: null}], likes: [], scheduledFor: 0, inReplyTo: null, createdAt}`
   -> returns the stored message (id, createdAt, interactions[]).
So a chat PPV is an ORDINARY type 1 message with an attachment; type 2 is therefore the mass message ("You up for some spice" went to the whole list as type 2).

## The live feed (websocket)
- Client sends `{"t":1,"d":"{\"token\":\"…\",\"v\":3}"}` once, then the text `p` every ~24 s; server answers `{"t":2,…lastPing}`.
- Events arrive as `{"t":10000,"d":"{\"serviceId\":5,\"event\":\"<json string>\"}"}`. Event types seen: 1 = a new message (full message object, same shape as the REST one, for sent and received), 22 = typing announce {accountId, groupId}.
- Purchase / tip / read events were not triggered during the capture; their event types are still unknown.

## Still unknown
- The per-fan purchase signal. Nothing in the capture says "this fan unlocked this PPV". Candidates: a websocket event when the fan buys, the Earnings/Statistics page's calls, or a notifications list call. The Earnings page and the Notifications page were not opened in this capture.
