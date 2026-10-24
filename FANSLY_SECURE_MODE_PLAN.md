# Fansly extension: secure mode plan (24 Oct 2026)

Goal: chatters work Fansly inside shared AdsPower profiles, but the page's login never stays on
their computer, they can only reach the chat side of Fansly, and a manager can sign anyone out in
seconds. Same design carries over to OnlyFans later.

Reuses what exists: chatter sign-in (`POST /api/fansly/login`, `/refresh` in
`server/src/routes/fansly.js`), roster/shifts, presence heartbeats (`heartbeat()` / `endPresence()`
in `server/src/utils/fanslyIngest.js`), the in-page script (`extension/page.js`) and background
worker (`extension/background.js`). Latest migration: 073.

Why this is needed (checked on this Mac, 24 Oct): AdsPower keeps every profile ever opened on disk
(305 folders under `adspower_global/cwd_global/source/cache/`), logins in normal Chrome format,
key not in the keychain — so a chatter's machine keeps a usable login copy. The extension also keeps
the chatter's session on disk and lets the popup change the server address.

## Order of work

| Step | What | Size |
|---|---|---|
| 0 | Three checks, no code | ~1 h |
| 1 | Shift-only sign-in, session in memory only, fixed server address | small |
| 2 | Kick-out (sign out a chatter or a whole page in seconds) | small |
| 3 | Login vault (the page's Fansly login lives on our server, not the VA's disk) | medium |
| 4 | Chat-only Fansly (allow-list of pages/calls; block downloads and Fansly logout) | medium |
| 5 | Proxy-address check (login handed only to that page's own proxy) | small |
| 6 | Alerts (activity not from the tool, unknown sessions, bulk reading) | medium |
| 7 | Version gate and new-computer approval | small |

Steps 0–4 before any VA uses secure mode. Each step ships as its own extension version + commit.

## Step 0: checks (no code)

- **0a. Where Fansly keeps its login.** In an admin profile, list fansly.com cookie and localStorage
  key *names* (never values). Expected: a token in localStorage plus the `Authorization` header the
  page builds from it. Record in `research_notes/fansly-api-capture-2026-10-23.md`. Step 3 branches
  on this: cookie → `chrome.cookies`; localStorage → `page.js`.
- **0b. Fansly Management Sessions.** Fansly has its own manager login
  (`/management/managementsessions`, `/managementsession/claim/:token`). Create one, claim it in a
  test profile, note what it can/can't do (chats, vault, PPV price, mass messages, earnings,
  payouts, settings, password/email). If it covers chatting and already hides money + settings, the
  vault stores a management session instead of the creator's own login — Fansly then does the
  blocking and revoking for us. Decide before step 3.
- **0c. What AdsPower writes to disk.** Set a session cookie + a localStorage key in a test profile,
  close, reopen, see if either returns. Tells us whether step 3 needs the memory-only trick.

AdsPower settings for secure-mode profiles (owner, once): Data Sync → untick Cookie and Local
storage; Browser Settings → Disable Developer Tools on, Disable install/removal of extensions on;
On startup → Continue browsing the last opened page off, Delete cache data on; Multi Device Mode →
page profile IDs listed; member group "Chatters" = Profiles→Open only; owner account has an
authenticator bound.

## Step 1: shift-only sign-in

Server:
- Migration `074_extension_sessions.sql`: table `extension_sessions`
  (id, organisation_id, user_id, device_id, ip, extension_version, created_at, expires_at,
  last_seen_at, revoked_at, revoked_by, revoke_reason).
- `/login`: after the password check, create a row with `expires_at` = end of the chatter's current
  (or next) shift + 15 min; 12 h for managers/admins; refuse a chatter with no shift today.
  Return `sessionId` with the token.
- Every extension route checks the row by `sessionId` and returns 401 `{ wipe: true }` when it is
  missing, revoked or expired. `/refresh` does the same and refuses past `expires_at`, so the
  Supabase refresh token is useless after the shift.

Extension:
- Keep `session` in `chrome.storage.session` (memory only), not `chrome.storage.local`; `deviceId`
  stays in `local`.
- Remove the server-address field from the popup; `DEFAULT_API` is fixed in the build.
- On any 401 `{ wipe: true }`: run the wipe (step 3) and show sign-in.

Test: close/reopen browser → signed out; sign in outside a shift → refused; move shift end to now →
next call signs out.

## Step 2: kick-out

- Dashboard: "Sign out now" per chatter and "Sign everyone out" per page →
  `POST /api/fansly/sessions/revoke { userId | accountId, reason }` sets `revoked_at` (manager+).
- Presence heartbeat 60 s → 20 s; its reply carries `{ wipe: true }` once revoked.
- Log every revoke (who, whom, why).

Test: kick a signed-in dummy chatter → within 20 s the page is logged out and the popup asks for
sign-in again.

## Step 3: login vault

Server:
- Migration `075_page_logins.sql`: table `page_logins` (account_id, cipher, updated_by, updated_at,
  rotated_at). Store the login encrypted with a key held in an env var, separate from the DB.
- `POST /api/fansly/page-login` (admin): save/rotate a page's login.
- `GET /api/fansly/page-login` (signed-in chatter, in-shift, assigned to this page): returns the
  login for the page the extension reports — never any other page; every handout logged
  (who, when, ip, device).
- "Rotate" button + "Sign everyone out" so a new login reaches each chatter at next sign-in.

Extension:
- After sign-in, before Fansly loads: fetch the page login and inject it — cookie via
  `chrome.cookies.set`, localStorage via `page.js` (per 0a).
- Wipe on sign-out / expiry / revoke / browser close: clear fansly.com cookies
  (`chrome.browsingData` or `chrome.cookies`), tell `page.js` to clear the localStorage keys, drop
  the in-memory session.
- If 0c shows AdsPower persists them, inject as session-only (no expiry) and keep Delete-cache on.

Test: sign out → fansly.com cookies/localStorage gone, reload shows logged out. Rotate → next
sign-in works, the old copy on a VA's disk does not.

## Step 4: chat-only Fansly

- `page.js` allow-list: the chat, vault-read and fan-notes calls the plan already names; block the
  rest (earnings, payouts, settings, password/email, delete, mass message) by not forwarding and, for
  navigations, redirecting to the chat. Block the matching fansly.com URLs in AdsPower too, as a
  second layer.
- Also block the Fansly logout/account-switch calls so a chatter can't swap the login.
- Block saving media: disable downloads for the profile, block right-click "save" and image drag in
  `page.js`. (Screenshots can't be stopped — trust + contract only.)
- Keep AdsPower Operation Logs on.

Test with a dummy chatter: type the payouts URL → redirected; try to log out of Fansly → blocked;
save a photo → blocked; open a chat and send a normal reply → works.

## Step 5: proxy-address check

- Each page profile uses its own static proxy. Record each page's proxy egress IP.
- `GET /page-login` and the sensitive routes compare the request IP (`trust proxy` is already set,
  `server/index.js:11`) with that page's proxy IP; refuse on mismatch. A copied extension or stolen
  chatter session in a normal browser then gets nothing.

## Step 6: alerts

- Activity not from the tool: compare what Fansly shows as sent with our own record; a message we
  didn't send → alert.
- Unknown sessions: if Fansly lists active sessions, check periodically and flag any device that
  isn't one of our profiles.
- Bulk reading: many chats opened or the whole fan list scrolled in minutes → flag or pause.

## Step 7: version gate + new-computer approval

- Server refuses sessions from an extension version below the current one; update everyone through
  AdsPower's extension section.
- First sign-in from a new `deviceId` waits for a manager's OK, so a stolen password alone is not
  enough.

## Carrying over to OnlyFans

Steps 1–7 are platform-agnostic; only `page.js` (the calls and login shape) and the vault's stored
object change. OnlyFans signs requests with rotating obfuscated code, so expect more work in
`page.js` there and more frequent fixes. Where Fansly Management Sessions (0b) work, prefer the
platform's own manager login in the vault over the creator's full login — the platform does the
blocking and revoking.

## What this does and does not stop

Stops: login copies left on VA machines, a former VA's old copies, malware reading login files,
a copied extension or stolen chatter session used elsewhere (step 5), a VA reaching money/settings
or leaking the account by logout. Does not stop: screenshots/recording of content, and theft from
the browser's memory during an active shift by a skilled insider — only Kasm or a full dashboard
(chatters never touch the real site) remove those.
