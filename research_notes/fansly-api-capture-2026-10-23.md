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

---

# What the app code says exists (read from main.js in the second capture, 23 Oct 2026)

The app builds every URL as apiBaseUri + path, apiBaseUri = https://apiv3.fansly.com/api/v1. Calls that matter to us and were NOT yet seen live:

| Call | Why we want it |
|---|---|
| GET /account/wallets/earnings/transactions?before&after&limit&offset | every earning (PPV unlock, tip, sub) with time: the "sold" signal, page by page |
| GET /account/wallets/earnings/stats, /monthlystats, and the same with /accounts?correlationAccountId= | totals, and per-fan totals |
| GET /account/media/orders/?limit&offset | who bought which media/bundle |
| GET /message/broadcast/stats?before&limit ; POST /message/broadcast | mass messages and how each performed |
| GET /notifications?before&after&type | the Notifications page, by type |
| GET /subscribers?before&after&status&limit&offset&search&subscriptionTierId | subscriber list |
| GET /tips?ids= / ?targetIds= | tips by message id |
| /notes, /notes/edit, /notes/delete | notes chatters keep on a fan (contentType 12002 = note on a username) |
| /lists, /lists/itemsnew?listId= | the fan lists (the chips in the chat filter) |
| POST /message/ack {messageIds, type}; POST /groups/users/readreceipts | read marks |
| /management/managers, /management/managementsessions, /managementsession/claim/:token | Fansly's own "management" feature: managers log in through a claimable session link; worth checking as the way chatters sign in |
| /scheduled, /message/broadcast/scheduled | scheduled sends |

Notification types (from the Notifications page code): 2007/2008 = Media Purchases, 32007 = Locked Text Purchases, 7001 = Tips, 15006/15016 = new Subscribers, 15007 = Expired Subscriptions, 15011 = Promotions, 3002/3003 = Followers, 1002/2002/5003 = Likes, 1004/1005 = post replies/quotes, 24001/24002 = Fansly Alerts, 45012 = stream tickets.

Live feed services (serviceId in each socket event): 2 Media, 4 Group, 5 Message, 6 Wallet, 7 Tipping, 9 Notification, 14 Order, 15 Subscription, 34 Notes, 40 EarningsStats, 39 Management. Handlers found in the code:
- serviceId 5 (Message): type 1 new message, 3/4 like added/removed, 22 typing.
- serviceId 2 (Media): **type 7 = accountMediaOrderCreate, with the order** → a fan unlocking a PPV arrives live. 999 = cache clear.
Other services' event shapes are not in the chat page code; a capture while a purchase or tip happens would show them.

Pages that exist: /messages /notifications /earnings /statistics /profilestats /subscribers /followers /lists /vault /scheduled /management /sessions /wallet /payments /trackinglinks /topsupporters /streaming.

## Capture checklist for the third HAR (start recording BEFORE each page loads, "All" filter, "Keep log" on)
1. /earnings and /statistics — scroll the transaction list a bit.
2. /notifications — click the Media Purchases, Tips and Subscribers tabs.
3. /subscribers and /lists.
4. /management — screenshots too; this decides how chatters could log in.
5. /scheduled, then send one mass message to a small list and open its stats.
6. Add a note on one fan.
7. If possible keep recording while a real fan buys a PPV or tips, so the live purchase event is in the file.

---

# Third capture (23 Oct 2026, 1014 requests): earnings, statistics, notifications, subscribers, lists, management, a note

No mass message and no live purchase/tip in this one (the user chose not to send them).

## Earnings: the sales ledger (the "sold" source)
GET /api/v1/account/wallets/earnings/transactions?limit=&offset= → `{total: 755, data: [...], aggregationData: {accountMedia, accountMediaBundles, subscriptionHistory, tips, accounts}}`
Each row:
```
transactionId, type, amount, destinationTax (2000 = 20%), destinationAmount, newBalance,
correlationId        = the thing sold (bundle id / media id / subscription history id / tip id)
correlationAccountId = the FAN who paid
createdAt (ms), status (2 = settled, 1 = pending), walletId, receiverId (creator)
```
`amount` is already NET to the creator in thousandths of a dollar: 23992 = $23.99 net of a $29.99 sale.
Transaction `type` (the app's own full label map): 2110 Media, 2116 Media Sets (bundles), 7101 Tips, 15001 Subscriptions, 32101 Locked Text, 45101 Stream Tickets, 18001/18002 Referrals, 24101 Leaderboard Prize Money, 6101 Refunds; legacy 2010 / 2016 / 7001 / 32001 / 45001.
The `aggregationData.accountMedia/.accountMediaBundles` entries carry the item's price and media, `accounts` carries the fans' usernames, and `subscriptionHistory` carries the tier, price and ends-at of a sub sale.
Per-fan: GET /account/wallets/earnings/transactions/accounts?correlationAccountId=&before=&after=&cursor=&limit= (cursor paged). GET /account/wallets/earnings → {pendingBalance}.

Join to the chat: a sale's correlationId equals the attachment's contentId in the PPV message (contentType 1 ↔ type 2110 media, contentType 2 ↔ type 2116 bundle), and correlationAccountId equals the fan in the group. That is the sold / not-sold mark per PPV.

## Statistics (the /statistics page)
- GET /account/stats/summary?after=&before= → follower/subscriber counts, profile visits, follows/unfollows, subscriptions new/renewed/expired/cancelled (byTier), **revenue {transactions, grossMills, netMills, refunds, payingFans, newPayingFans, byProductType[]}**, views (source 0..3), each with value / previous / delta.
- GET /account/stats/fans/top?after=&before=&orderBy=netMills&limit= → top spenders {fanId, transactions, grossMills, netMills, refunds, firstBucket, lastBucket}.
- GET /account/stats/fans?fanId=&granularity=day → one fan's spend over time, byProductType.
- GET /account/stats/series?family=views&granularity=hour|day → time series. Also /stats/media/top, /stats/media/benchmarks, /stats/streams/totals.

## Notifications
GET /api/v1/notifications?before=&after=[&type=] → 50 per page: `{id, type, correlationId, correlationGroupId, acknowledgedAt, createdAt, metadata}` + aggregationData (accountMedia, accountMediaBundles, subscriptions, subscriptionHistory, posts, messages, accounts).
Seen: 2007 media purchase (metadata {accountMediaPrice}), 2008 bundle purchase (correlationId = bundle, correlationGroupId = buyer), 15016 subscriber (metadata {subscriptionStreak}), 15007 expired sub, 15011 promotion, 2002/1002/5003 likes, 3003 follow, 1004 post reply. Tips (7001) and locked-text (32007) did not occur in the window.
POST /notifications/ack {beforeAnd: <id>, type} marks them read. Notifications are a convenience; the earnings ledger is the complete record.

## Subscribers, followers, lists, notes
- GET /subscribers?status=3,4&limit=100&offset= → {stats {totalActive, totalExpired, total}, subscriptions[{subscriberId, tier id/name/color, status, price, renewPrice, autoRenew, billingCycle, createdAt, renewDate, endsAt, promo…}]}. Statuses 3,4 = active ones (labels below if found).
- GET /account/<id>/followersnew?limit=100&offset= → followers[{id, followerId}] + accounts.
- GET /lists/account → [{id, type, label, itemCount}] (e.g. "Exclude MM"); GET /lists/itemsnew?listId= for members.
- POST /notes {contentType: 12000, contentId: <fan account id>, title, note} → stored note with id. (12002 = note on a username, 12000 = note on an account.)

## Management
GET /management/managers → {accountManagers: [], accounts: []}; GET /management/managementsessions → []. Both empty: the feature exists on this account but nothing is set up. From the app texts: "Create Management Session", the link works once, delete sessions the manager no longer needs, some actions (co-performer consent) are not available inside a management session. Create/update/claim/remove calls exist. Needs a real try to see what a manager can and cannot do in chat.

## Not working / odd
GET /api/v1/messages?ids= answered 400 "error getting messages" 20 times (the app calling it from the notifications page); ignore.
