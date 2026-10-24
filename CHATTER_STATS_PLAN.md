# Chatter stats ("My stats") — plan

24 Oct 2026. Today a chatter who signs in to the tool sees only the Playbook. This plan gives them their own numbers:
one page in the tool, plus a small "My shift" card in the Fansly panel.

## Who sees what

- A chatter sees **only themself**: never another chatter's numbers, and not the page totals (a creator's whole income).
- Managers already have the full picture per chatter (Chatters → profile); nothing changes for them, except a
  "See it as the chatter does" button on the profile, to check what the chatter sees.
- The login is tied to the chatter by email (the same way the Fansly extension does it now). A chatter login with no
  matching chatter sees a short note: "Ask your manager to link your account".

## 1. "My stats" page in the tool (chatter's home page, next to Playbook)

Date picker as on Creator reports (default: last 7 days including today). Platform tabs only for the platforms the
chatter works (OnlyFans / Fansly / Fanvue, from their chatter settings).

| Block | What it shows | Where it comes from |
|---|---|---|
| **Today / this shift** | shift times, on-shift or not, sales so far this shift, PPVs sent and bought | roster + the same numbers as below, for the shift |
| **My sales** | earnings by day (chart), PPV sales, tips, buy rate (bought / sent), average PPV price, by page | OnlyFans: Infloww sales credited to them · Fansly: sales the extension credited · Fanvue: the rota rule from payroll |
| **My chatting** | messages sent, fans written to, average reply time, best hours | the same chatting numbers as the Creator reports' chatter table, filtered to them |
| **My pay (estimate)** | this pay period so far: hours, overtime, commission, total per platform; "final after your manager checks it" | the payroll calculation, run without saving (a final report shows as final) |
| **Coaching** | open tasks a manager or the AI review gave them, with the "why"; done ones fold away | review tasks with their chatter id |
| **Feedback** | the latest AI daily review: what went well, what to fix (plain words, no scores they can't act on) | the daily check results for them |
| **My level** | New / Learning / Experienced, days in, when the next level comes | chatter stage (already built) |
| **Upcoming shifts** | the next 7 days of shifts | roster |

## 2. "My shift" card in the Fansly panel

At the top of the panel, folded to one line: "This shift: $184 · 9 PPVs sent, 4 bought · avg reply 2 min".
Opened: the same split by type, and the fans who bought this shift. From the extension's own records (live, as it
credits sales), so a chatter sees a sale land within a minute. Only their own; a manager sees the page's shift.

## 3. Later (not in the first build)

- **Goals**: a weekly target per chatter set by a manager (sales, buy rate), with a progress bar on both.
- **Team ranking**: e.g. "#3 of 9 by sales this week" without names (see the decision below).

## Build order

1. Server: `GET /api/me/stats?from&to` — finds the chatter by the login's email; reuses the Creator reports' per-chatter
   numbers (ofReports / fanslyReports / fanvueReports chatting parts) filtered to that chatter, the payroll
   calculation without saving, stage, roster, review tasks and daily-check results. Everything filtered on the server:
   the answer never holds anyone else's numbers.
2. Client: `My stats` page; chatters land on it instead of the Playbook; nav shows My stats + Playbook.
3. Manager's "See it as the chatter does" on the chatter profile.
4. Fansly panel "My shift" card (extension + `GET /api/fansly/panel/my-shift`).
5. Later: goals, ranking.

## Decisions (24 Oct 2026, the user)

- Pay: **shown as an estimate** for the current period ("final after your manager checks it").
- Ranking: **anonymous rank** ("#3 of 9 by sales this week", no names), built after the first version.
- AI feedback: **the latest AI review in plain words, and the coaching tasks** made from it.
- Penalties and bonuses: **shown, with the amount and the manager's note.**
