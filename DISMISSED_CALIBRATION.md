# Dismissed-task calibration set (85 cases)

Source: RICE-MEDIA review_tasks, status=dismissed. Grouped by issue pattern.
Reason codes: allowed = AI wrongly flagged / it's permitted; misread = AI misread the chat; too_minor = real but trivial; fan_fault = fan's doing; other = no clean category.

## Summary

| Pattern | Cases | allowed | misread | too_minor | other | fan_fault | sev high/crit |
|---|--:|--:|--:|--:|--:|--:|--:|
| Page health (ratio/LTV/revenue) | 16 | 0 | 1 | 0 | 15 | 0 | 13 |
| Persona / identity leak | 14 | 7 | 2 | 0 | 4 | 1 | 10 |
| Unauthorized / unprompted discount | 11 | 9 | 0 | 0 | 2 | 0 | 10 |
| Response time / AFK / work ethic | 7 | 1 | 2 | 0 | 4 | 0 | 6 |
| Meeting / real-life visit | 7 | 1 | 2 | 1 | 3 | 0 | 6 |
| Age / underage-character | 6 | 3 | 0 | 0 | 3 | 0 | 3 |
| Copy-paste / duplicate script | 5 | 4 | 0 | 0 | 1 | 0 | 2 |
| Emotional / romance | 5 | 2 | 0 | 1 | 2 | 0 | 2 |
| Free content to $0 / non-spenders | 3 | 1 | 1 | 0 | 1 | 0 | 3 |
| Bare tip solicitation | 3 | 2 | 0 | 1 | 0 | 0 | 3 |
| Budget violation / pushed after limit | 2 | 0 | 0 | 1 | 1 | 0 | 1 |
| Wrong name used for fan | 2 | 0 | 0 | 0 | 2 | 0 | 2 |
| Explicit content / dirty talk | 2 | 0 | 2 | 0 | 0 | 0 | 2 |
| Other / uncategorised | 2 | 2 | 0 | 0 | 0 | 0 | 1 |

## Page health (ratio/LTV/revenue) (16)

- **[critical/ratio] Cora ES** · dismiss=`other`
  Ratio is 0.2 against a target of 5 — the page is generating roughly 4% of expected output relative to its fan base. With 28 active fans and only 1 spender today (and 0 spenders on 5 of the last 7 days), almost no one is engaging commercially. This is not a marginal miss; it signals a near-complete breakdown in monetization activity. — note: "This is just a general observation and isn’t related to any specific issue in the conversation"
- **[critical/revenue] Tania** · dismiss=`other`
  Today's net revenue of $80.69 is 32% of the $250.75 baseline — the worst single day in the visible window. PPV/messages ($36) and tips ($16) together total $52 against $29 in subscriptions. Prior days ranged $150–$495, so this is an outlier low, not a gradual slide. Only 2 spenders with avg spend/spender of $32.46 gross confirm the collapse is driven by near-zero chat/PPV activity today. — note: "This is just a general observation and isn’t related to any specific issue in the conversation"
- **[critical/ltv] Cora ES** · dismiss=`other`
  7-day LTV has dropped 78% from $42.90 the prior week to $9.32 this week. Total 7-day net earnings across the window are roughly $56 spread across the full period, but the week prior had a $48 single-day spike (2026-06-21, 2 spenders). Strip that out and the underlying run-rate is even weaker — most days are $8 or $0, driven by what appears to be a single recurring PPV unlock rather than active monetization. — note: "This is just a general observation and isn’t related to any specific issue in the conversation"
- **[critical/ltv] Nana Free** · dismiss=`other`
  7-day LTV dropped 95% from $109.26 to $5.33. The prior week had meaningful spender activity (e.g. $61 net on 6/21 with 2 spenders); this week only 1 spender appeared (6/24, $16 net) across 7 days. With 941 active fans and near-zero monetization, PPV or DM campaigns are either not being sent or not converting. Manager should check whether PPV blasts went out this week and what the open/purchase rate was. — note: "This is just a general observation and isn’t related to any specific issue in the conversation"
- **[high/work_ethic] Julia** · dismiss=`other`
  Ratio 3.2 is below target 5 (tips+PPV vs subscriptions) — note: "Regarding the Ratio, please continue collecting the data and, every Monday, highlight how it has changed over the past week compared to the previous 7-day period."
- **[high/ratio] Tania** · dismiss=`other`
  7-day ratio of 2.1 is well below the 5.0 target. Even on stronger days like June 23 ($495 earnings, 7 spenders), the ratio isn't being pulled up enough to compensate for flat or low days. The subscription base (460 active fans) is not being converted into PPV/tip revenue consistently — spender counts have fluctuated 1–7 across the week with no sustained run above 3. — note: "Regarding the Ratio, please continue collecting the data and, every Monday, highlight how it has changed over the past week compared to the previous 7-day period."
- **[high/ltv] Julia Free** · dismiss=`other`
  7-day LTV is $0, down 100% from $12 the prior week. Zero spenders every day for at least the past 7 days, and zero PPV, tip, or any other revenue. The prior week's $12 LTV suggests some PPV or tip activity was happening — that has now fully stopped. Check whether PPV campaigns or mass messages have been paused or stopped, and whether any engagement activity (posts, DMs) has dropped off. — note: "Regarding the LTV, please continue collecting the data and, every Monday, highlight how it has changed over the past week compared to the previous 7-day period."
- **[high/ratio] Julia** · dismiss=`other`
  Ratio is 3.2 against a target of 5. Tips are $0 today and have been absent or negligible across recent days, so the ratio is being dragged down by a thin tips contribution. PPV is carrying the monetisation load. This isn't a crisis but it means Julia is not converting fan goodwill into casual tipping — worth reviewing whether tip prompts, shoutouts, or content interactions are being used. — note: "Regarding the Ratio, please continue collecting the data and, every Monday, highlight how it has changed over the past week compared to the previous 7-day period."
- **[high/revenue] Cora ES** · dismiss=`other`
  Today's net revenue of $7.99 is 51% below the $15.68 baseline. The baseline itself already incorporates weaker recent days, so the true decline from peak is steeper. All revenue is from PPV/messages ($8); tips and subscriptions are $0. The consistent $8/day pattern on 2026-06-24 through 2026-06-27 and today suggests a single fan is auto-unlocking a recurring PPV — not organic monetization momentum. — note: "Only flag revenue if it differs by 90% or more from the average daily revenue over the previous 30 days."
- **[high/work_ethic] Tania** · dismiss=`other` · carried
  Ratio 2.0 is below target 5 (tips+PPV vs subscriptions) — note: "Don't show this in tasks, this isn't something that could be checked directly through checking the dialogues"
- **[high/sales] Jen** · dismiss=`misread`
  Free sexting was given to multiple $0-spend fans (Uvy, Nate, CJGTCY, Arnaud Montgrand, Gonzo) without any purchase. With Uvy, the chatter went through the full flirt funnel and sent a PPV without recording any spend from this fan. With Nate, explicit sexting was used as description bait but the fan had $0 spend and no prior purchase. Rice Media standards state no free sexting for non-spenders unless they are whales. — note: "None of these cases are actually valid.
This wasn’t sexting—it was simply the accompanying text for a PPV that had been sent to time-wasters and low spenders. In this context, that’s perfectly acceptable.
As for u425508266, those messages were part of warming the sub up before offering the PPV, which is also an approved approach."
- **[high/ltv] Tania** · dismiss=`other`
  7-day LTV dropped from $22.52 to $15.72, a 30% decline. With 460 active fans and only 2 spenders today (and a weekly average of roughly 3), earnings-per-fan is very low. The avg sub length of 34 days is reasonable, but if LTV continues falling, retention value erodes quickly. Worth checking whether the content cadence or PPV pricing changed this week. — note: "Regarding the LTV, please continue collecting the data and, every Monday, highlight how it has changed over the past week compared to the previous 7-day period."
- **[high/revenue] Adele** · dismiss=`other`
  Today's net revenue of $116 is 54% below the $253.37 baseline and the lowest single day in the recent trend (prior days ranged $152–$472, yesterday alone was $472). Only 3 spenders generated all $116, versus 6–8 spenders on stronger days. This looks like a low-activity send day rather than a structural problem — check whether a PPV blast or DM campaign went out today. If no content was pushed, that explains the gap and a follow-up send should recover it. — note: "Only flag revenue if it differs by 90% or more from the average daily revenue over the previous 30 days."
- **[medium/custom] ?** · dismiss=`other`
  This week we need to do full cycles of task generations and make sure to go through all of them. We need to teach AI to react correctly to the chatting outputs. It is about DAILY CHECKS and important things such as potential ToS issues etc. — note: "Testing the dismiss button for custom task."
- **[medium/work_ethic] Cora ES** · dismiss=`other` · carried
  7-day LTV $10.66 dropped 80% vs $53.59 prior week — note: "Regarding the LTV, please continue collecting the data and, every Monday, highlight how it has changed over the past week compared to the previous 7-day period."
- **[low/work_ethic] Cora OF** · dismiss=`other`
  Revenue $671.1 is 56% above $431 baseline — worth understanding why — note: "Only flag revenue if it differs by 90% or more from the average daily revenue over the previous 30 days."

## Persona / identity leak (14)

- **[critical/compliance] Maurice** · dismiss=`other`
  Chatter pitched a PPV explicitly referencing the persona 'Gwen': 'Do you like how naughty Gwen is right now, Babee?' The fan also opened by requesting 'you as gwen.' If Gwen is a minor animated/fictional character (e.g. from a cartoon), this is a ToS violation. Manager should verify who 'Gwen' is. — note: "Naming creator by the name it is listed on OnlyFans is allowed. Also fan or chatter were refering to cosplay character Leya has and it is also totally fine"
- **[critical/compliance] Emmanuel** · dismiss=`other`
  Fan questioned who they were speaking to: 'Who is this? Isn't it you?' — suggesting the fan may suspect they are not talking to the creator. Chatter responded 'It is' but the fan pushed further: 'sooo... Then why do you present information as if it doesn't exist?' This exchange raises a persona-break suspicion that a manager should review. — note: "This is just a low-value conversation. The sub has been subscribed for two years, spent only $44 in total, and is mostly talking nonsense.
As for the screenshot, he was simply asking whether the person in it was the model from the video he had sent. There’s no issue with the chatter’s response here."
- **[critical/compliance] Emmanuel** · dismiss=`allowed`
  Possible persona break: the chatter uses the name 'Leya' in direct first-person roleplay context — 'Whatcha doing leya?' is the fan's line, but the chatter has been addressed as Leya throughout and does not correct it, mirroring the name back implicitly. More critically, in Sean C the chatter calls the creator 'Leya' in third-person framing via fan address without deflection, and the name appears to be the real or stage creator name being confirmed in chat. Manager should verify whether 'Leya' is the approved persona name or a slip revealing the creator's identity. — note: "In our case, revealing the creator’s identity isn’t an issue - it’s allowed, so there’s nothing to be concerned about here"
- **[critical/compliance] Felix** · dismiss=`allowed`
  Fan addresses the chatter as 'Julia' ('I'd like that very much Julia') and the chatter never corrects the name, continuing the conversation under that name. If the creator's persona name is not Julia, this is a persona break / identity slip. — note: "There’s no issue with either the chatter or the sub addressing each other by name"
- **[critical/compliance] Josh** · dismiss=`allowed`
  Fan addresses the creator by the name 'Cora' ('Does mommy Cora dream of my pussy on her tongue?') and the chatter does not correct or deflect the name — this may reveal the creator's real/stage name and constitutes a potential persona-break confirmation worth verifying.
- **[high/compliance] Jerry** · dismiss=`allowed`
  Fan called the chatter 'Adele' — 'hard u have it Adele your hot and pretty' — and the chatter did not correct it or address it at all, possibly confirming a name that may or may not be the creator's actual name, raising a persona/identity concern. — note: "Adele is the creator’s display name, so there’s nothing wrong with subs addressing her by that name"
- **[high/communication] Jen** · dismiss=`allowed`
  Identical scripted funnel ('caught me in a very good mood' → 'alone and ready' → 'innocent playful eyes' → 'take care of this tight body') was copy-pasted verbatim across at least four fans (Richard, Simon, Danny J, Demon God), making interactions feel robotic and impersonal with zero personalisation to what each fan said. — note: "This is a basic script, this is allowed"
- **[high/communication] Jen** · dismiss=`other`
  DS Rockstar expressed emotional attachment ('I've always been in love with you and had always hoped for a connection with you') and the chatter responded with a deflection and then abruptly ended with 'I gotta go now, have a goodnight' — a dismissive, cold close that breaks persona and wastes a re-engagement opportunity. — note: "This is just a low-value conversation. The sub has been subscribed for a few years and has spent only $35 in total. Conversations like this are a low priority for the chatters."
- **[high/compliance] Josh** · dismiss=`fan_fault`
  Fan in the 🤍💙 conversation accused the creator of using management ('Why use of management. It ruined your page'). Chatter deflected but did not deny — however the response 'I just went live on Tiktok the other day ago' references a platform activity that may not align with the creator's actual schedule and could reinforce the fan's suspicion of a persona break. Manager should verify this is consistent with creator's real activity.
- **[high/compliance] Jen** · dismiss=`allowed`
  Chatter addressed the fan by the name 'Matthieu' ('Think you can take care of this tight body right now Matthieu?') — the fan's display name is 'Uvy'. This looks like a real-name slip or a copy-paste from another conversation, which may constitute a persona break or cross-contamination. — note: "Fans disclose their real names during the dialogues. It is OK that we reference fans by their names after they disclose it."
- **[medium/compliance] Jen** · dismiss=`misread`
  Chatter told fan she has 'only BG videos here' ('I only have BG videos here hun') — this appears to contradict the solo-only persona established in the DS Rockstar conversation ('Always and will be solo'). Possible persona inconsistency or misleading content claim. — note: "This is an AI mistake. grizzlybear_new is a sub on Tania’s page, while u32807974 is on Leya’s page. The chatter handled this correctly."
- **[medium/compliance] Felix** · dismiss=`other`
  Angel conversation: chatter revealed 'I now live in Germany' mid-conversation. Earlier in the same day, in the Alex Smith and JC conversations, the chatter says she lives in Slovakia/Prague. Inconsistent location details across conversations — possible persona break or copy-paste error revealing chatter confusion. — note: "Ignore persona break cases"
- **[medium/compliance] Maurice** · dismiss=`misread`
  Fan asked 'Is this you or just ur face on ai image?' — a direct authenticity/persona challenge. Chatter deflected with humour ('Lol, summer is around the corner sweetie') without confirming identity clearly. Manager may want to ensure the response aligns with approved handling of AI image accusations. — note: "There's nothing wrong with that dialogue, missed context"
- **[medium/compliance] Ene** · dismiss=`allowed`
  Fan references the platform by name ('this OnlyFans space') and explicitly probes the boundary between the creator's real life and the platform persona, asking about a 'boyfriend.' Chatter confirmed details about a named male friend and referenced the creator's real-life movements ('Bucharest'), blending personal life into the persona. May constitute a persona management / real-identity boundary issue. Fan: 'sometimes this OnlyFans space... create a space in my heart.' — note: "The chatters only have access to information about the creators that they’re allowed to share freely. Don’t flag cases like this."

## Unauthorized / unprompted discount (11)

- **[high/compliance] Emmanuel** · dismiss=`allowed`
  Unauthorized discount offered unprompted to Knallpilot after fan explicitly stated budget: fan said 'you know i can't afford the 50 bucks how should i be able to afford 120?' Chatter first said 'whenever you're ready' then immediately re-pitched the same video at $139 (down from $200), contradicting the prior soft close and offering an unsolicited price drop.
- **[high/compliance] Felix** · dismiss=`allowed`
  Chatter offered an unprompted, unauthorized discount: 'I can bring it down to $175 for you hon... The whole bundle is originally for 300 but I'm giving it to you for way less. Deal?' — price was dropped without the fan asking or referencing a budget limit.
- **[high/compliance] Emmanuel** · dismiss=`allowed`
  Unauthorized discount chain with Santiago Wolski: chatter initially pitched video at $200, then dropped to $159 unprompted ('i usually show that video for 200 as it's very exclusive, but can you do 159 for it?'), then sent a PPV at $149 (not $159), representing a further unannounced price reduction. Two separate unauthorized discounts on the same item. — note: "Discounts are allowed at the chatter’s discretion. They’re expected to use their best judgment based on the situation, as long as the PPV price doesn’t become unusually low. If it does, then it should be flagged as an issue."
- **[high/compliance] Jerry** · dismiss=`allowed`
  Chatter offered an unprompted discount on a PPV: 'Normally these videos I would do it for $85 but I did the discount for you.' No authorization for this discount is evident.
- **[high/revenue] Leah Free** · dismiss=`other`
  Today's net revenue is $12 vs. a $86.51 baseline — 86% below. This follows $0 on June 27. The two-day combined total is just $12, against a baseline expectation of ~$173. All $12 came from a single PPV transaction ($15 gross from 1 spender). No tips. The spike on June 25 ($220) likely inflates the baseline, but even discounting that, the last two days represent a material underperformance. Check whether PPV sends went out this week and whether the June 25 spike was a one-off blast that exhausted near-term demand. — note: "Only flag revenue if it differs by 90% or more from the average daily revenue over the previous 30 days."
- **[high/compliance] Josh** · dismiss=`allowed`
  Chatter gave an unprompted bundle discount: 'Like a package deal? I'd give you both for $120' — reducing $150 of listed content by $30 without any indication this was pre-approved pricing.
- **[high/compliance] Jerry** · dismiss=`allowed`
  Chatter offered an unprompted discount on a $85 PPV after the fan said the price was an issue: 'How about a small discount / Just for you' and then negotiated down to $65 without apparent authorization.
- **[high/compliance] Ene** · dismiss=`allowed`
  Chatter initiated an unprompted discount on a $350 video, dropping first to $350 from a stated $500, then again to $250 without the fan asking for a lower price — two successive unauthorized discount reductions. 'I usually do it for 500 but I wanna do it for 350 for you' then 'I guess I can do it for 250'.
- **[high/compliance] Ene** · dismiss=`other`
  Fan explicitly stated a hard budget cap of '$100 more until July 1' and cited bills. Chatter had already dropped from $300 to $200 unprompted, then continued pushing the remaining video after the cap was declared. 'Alright love, I guess I can do it for 200' — unauthorized discount following a stated budget limit, then continued upsell pressure past the cap. — note: "I reviewed it.
In this case, there was some mild pushing, but not to the extent that the chatter should be penalized. The conversation remained lighthearted and fully under the chatter’s control, so the dialogue wasn’t negatively affected and the chatter smoothly steered it in a different direction.
That said, I’d still like you to flag similar cases in the future.
As for the second point, you can ignore cases where the only issue you found is that the chatter offered a discount."
- **[high/compliance] Emmanuel** · dismiss=`allowed`
  Unauthorized discount offered to Demon: chatter said 'it's a 200 set love but just for you i'd make it 120 alright?' with no prior approval for discounting. — note: "you can ignore cases where the only issue you found is that the chatter offered a discount"
- **[medium/compliance] Josh** · dismiss=`allowed`
  In the Reoz_3617 conversation, the chatter dropped a PPV from $15 to $10 unprompted after the fan asked for a discount ('Se ria mucho si te pido que me lo dejes en 10 🥺'). Chatter replied 'Aquí está bien [PPV $10 SOLD]' — an unauthorized price reduction.

## Response time / AFK / work ethic (7)

- **[high/work_ethic] Jude** · dismiss=`misread` · carried
  kept 12 subs waiting (avg 141s) — worst: Darkstar [NEW SUB] 87m at 14:12 — note: "It's a time waster, not a new sub"
- **[high/work_ethic] Paul B** · dismiss=`other` · carried
  1 AFK gap(s) with fans waiting, longest 126 min — note: "Never mention user Paul B in reports"
- **[high/work_ethic] Ene** · dismiss=`misread` · carried
  kept 3 subs waiting (avg 109s) — worst: Axel [NEW SUB] 8m at 20:17 — note: "It's a time waster, not a new sub"
- **[high/work_ethic] Emmanuel** · dismiss=`allowed` · carried
  kept 1 sub waiting (avg 79s) — worst: Red [NEW SUB] 18m at 23:32 — note: "It's a time waster, not a new sub. Such cases are acceptable if chatter's workload is high"
- **[high/work_ethic] Paul B** · dismiss=`other`
  kept 1 sub waiting (avg 1699s) — worst: Seán [spender $270] 28m at 20:42 (low volume — no workload excuse) — note: "Ignore user "Paul B" in your reports"
- **[high/work_ethic] Wyndel** · dismiss=`other`
  1 AFK gap(s) with fans waiting, longest 75 min — note: "When reporting this issue, always include:
* the sub who had the highest reply time;
* the time period during which it occurred;
* a clickable box containing the sub’s username so that clicking it copies the username to the clipboard."
- **[medium/work_ethic] Paul B** · dismiss=`other`
  1 AFK gap(s) with fans waiting, longest 51 min — note: "Never mention user "Paul B" in reports"

## Meeting / real-life visit (7)

- **[critical/compliance] Shak** · dismiss=`other`
  Fan asked 'What's your idea?' about getting off and chatter responded 'We could make it fun, and you could come join me?👀' — this is an ambiguous but direct suggestion of meeting/joining, which chatters must never say yes or no to. — note: "It was an invitation to have some fun online, not to meet in person"
- **[critical/compliance] Jerry** · dismiss=`misread`
  Fan said 'I told you I was coming to see you' and 'You' / 'Want to see you.' The chatter responded 'Oh really?🤭' and 'I know you're there for something else lol' — neither a clear deflection nor a refusal. A meeting inquiry was not properly handled. — note: ""You've been acting like you don't enjoy me here anymore" - chatter's key reply, which is totally ok for handling this case"
- **[high/compliance] Emmanuel** · dismiss=`other`
  Meeting-adjacent statement: chatter told Matt 'who knows someday i'd actually visit' in reference to visiting Poland, after the fan said he would love to meet in real life ('I would love to do it in real'). Chatter should neither confirm nor deny any possibility of meeting. — note: "Treat this as one of the correct approaches. There’s no clear agreement to meet up here"
- **[high/compliance] Titi** · dismiss=`too_minor`
  Fan asked 'If you don't want to please just say no, I can wait' in a romantic/intimate context — the conversation had been building toward something sexual. The chatter's exchange ended abruptly here with no response shown. Context suggests the fan may be expecting an intimate reply or content pitch that was left hanging, but the ambiguous phrasing 'just say no' in this context also brushes close to a meeting-style dynamic worth the manager checking.
- **[high/compliance] Felix** · dismiss=`misread`
  Chatter wrote 'I'm keeping that cuddle in mind until we can steal a quiet moment together again' — this implies a future in-person meeting moment, which edges toward confirming/suggesting a meeting. — note: "It’s just a play on words in this case."
- **[high/compliance] Josh** · dismiss=`allowed`
  Fan asked 'Are you available for video call?' and chatter replied 'Nope' — a flat yes or no to any meeting/call request should be a deflect, not a direct refusal or agreement. — note: "The creator doesn’t do video calls. In this case, the chatter handled the situation correctly by offering a custom as an alternative."
- **[medium/compliance] Maurice** · dismiss=`other`
  Fan said 'In real' after asking about meeting/sex in real life, and chatter responded 'Mmm, but we're on here rn' — neither a clear yes nor a clear no, but the chatter did not shut down the meeting implication. Manager should check if this needs a firmer deflection per agency policy. — note: "Chatter did everything right in this case"

## Age / underage-character (6)

- **[critical/compliance] Ene** · dismiss=`allowed`
  Fan stated age as 18 — the minimum legal age, and this was immediately followed by explicit toy-video pitching. Age verification status should be confirmed before further explicit content is sold to this account. Fan said: 'I'm 18 Texas :)' — note: "As long as fan clearly states that he is 18 and over - it is fine"
- **[critical/compliance] Aby** · dismiss=`allowed`
  PPV pitched using the character Nezuko (Nekuzo) from Demon Slayer, who is canonically a minor. The message reads: 'Watch the prominent nastiest traits of Nekuzo as she seduces you with her seductive charms and gets you hooked to her little body' — this is a sexualized reference to a character who is a minor in her source material. — note: "If the content is already available in our vault and the chatter is offering it, then it’s approved. You can ignore that"
- **[critical/revenue] Nana Free** · dismiss=`other`
  Net revenue $0 today and $16 total across the last 6 days, vs a $18.64 daily baseline. 5 of the last 7 days posted $0 earnings with 0 spenders. Tips, PPV, and messages all read $0 today. The revenue drop is consistent and not a one-day anomaly — it is a week-long pattern pointing to a content, messaging, or engagement strategy breakdown. — note: "This is just a general observation and isn’t related to any specific issue in the conversation"
- **[medium/compliance] Felix** · dismiss=`other`
  Stranger fan confirmed age as 18 before any sexual content was sent. Age is technically adult but manager may want to note this fan is at the minimum threshold and sexual PPVs were pushed ($13 sold, $31 not bought). — note: "Chatter did everything right. Confirmed 18 y.o. is enough for receiving PPVs"
- **[medium/compliance] Felix** · dismiss=`allowed`
  Fan v1lenale mentioned being a '3rd grade uni student' and described it being 5 AM. Age was not confirmed before the chatter escalated to sexual content ('I feel like your hands would be wandering my body') and sent a paid PPV. University student suggests adult, but age was never explicitly confirmed in this conversation. — note: "Exactly, University student suggests adult, nothing wrong with this case"
- **[medium/work_ethic] Nana Free** · dismiss=`other` · carried
  7-day LTV $11.6 dropped 85% vs $78.18 prior week — note: "Regarding the LTV, please continue collecting the data and, every Monday, highlight how it has changed over the past week compared to the previous 7-day period."

## Copy-paste / duplicate script (5)

- **[high/quality] Jerry** · dismiss=`allowed`
  Exact same line copy-pasted verbatim into two different unrelated conversations: 'Kissing on your shoulder and neck not to turn you on but just to love on you.' This line originally came from fan Ghostshell and was then sent by the chatter to Jager — a clear cross-conversation copy-paste slip.
- **[high/compliance] Aby** · dismiss=`other`
  Chatter echoed the fan's exact words back verbatim as a message: fan wrote 'We'll see about that 🥰 rest well too and take care of yourself okay? good night love 💞' and chatter sent the identical line. Likely a copy-paste error that could expose the chatter as not being the creator. — note: "It was a part of a game with the whale, there's nothing wrong here"
- **[medium/compliance] Aby** · dismiss=`allowed`
  Chatter calls fan 'Miles' — 'Does that mean you're finally ready to have some fun with me here Miles?' — but the fan's account name is 'Juanito Banana'. Possible wrong-name slip or copy-paste from another conversation. — note: "If the chatter addresses the sub by name and the sub has no objection to it, that should be considered the correct approach."
- **[low/quality] Ene** · dismiss=`allowed`
  Chatter used the identical copy-paste sales pitch verbatim across multiple fans in the same day: 'Here you go, you asked for it. But I should warn you, this is probably the naughtiest [X] you've ever seen anywhere. Every slide of this will keep you wanting, no aching for more...' — seen word-for-word in Jonpo, Bonezdubbb, and Drucifer conversations.
- **[low/quality] Josh** · dismiss=`allowed`
  Identical follow-up line 'Te vas a quedar más tiempo esta vez?' was used word-for-word in both the '1q2w3e4r hama' and 'Goku' conversations — signs of repetitive canned messaging.

## Emotional / romance (5)

- **[critical/compliance] Aby** · dismiss=`other`
  Fan references 'your promise' ('don't forget about me or your promise') and the chatter does not deny or clarify. This implies a prior commitment or promise may have been made to the fan. Needs review of prior conversation context. — note: "Only a few subs on Leya’s page ask for new content, and they’ve already bought everything that’s currently available. Since there won’t be any new content on the page for a while, the chatters are simply making the best of the situation."
- **[critical/compliance] Paul B** · dismiss=`other`
  The fan references prior agreements ('what we agreed', 'the panties I was buying', 'the things you agreed to do with them', 'the surprise you were going to send… to make things easier in future'). The 'surprise to make things easier in future' strongly implies contact details or an off-platform communication method was promised. An unauthorized promise of this nature — and possibly an off-platform contact offer — appears to have been made in a prior session. Manager should pull the earlier Seán chat log immediately. — note: "don’t take user Paul B into account in reports"
- **[medium/compliance] Titi** · dismiss=`allowed`
  Chatter appears to have promised or implied sending a new video to address the fan's complaint about receiving 3 videos of the same type: 'I'll send you something new.' This could constitute an unauthorized content promise if the chatter is not authorized to commit to custom or replacement content.
- **[medium/compliance] Emmanuel** · dismiss=`allowed`
  Chatter made a promise to a fan: in response to 'You promise I will see you squirt?' the chatter replied 'I promise😈'. Making explicit promises about content delivery is a commitment risk.
- **[low/quality] Josh** · dismiss=`too_minor`
  Fan Duane sent a $5 tip and the chatter responded 'Haha thanks! I already showed you more than that 🙈' — this could come across as dismissive of the tip rather than appreciative, and no PPV or content pitch was attached to follow the tip moment.

## Free content to $0 / non-spenders (3)

- **[high/quality] Titi** · dismiss=`allowed`
  Fan sent a media image and the chatter launched straight into dirty talk without pitching a PPV first, only attaching a PPV prompt later. The initial response 'Oh, you're hard for me? Want me to help you with it' with no attached content missed an early upsell window. — note: "This approach is totally fine"
- **[high/compliance] Shak** · dismiss=`misread`
  Chatter sent 'Media' (an unlabeled media send) to fan before the PPV was purchased, seemingly as a free preview to entice a buy. If that was unlocked content, it constitutes free content being given. — note: "Chatter Shak didn't send anything to this sub"
- **[high/compliance] Paul B** · dismiss=`other`
  Chatter offered free content without authorization: 'I'll send you two of my photo sets with videos as compensation for what you've already paid.' No evidence this compensation was approved by management. — note: "don’t take user Paul B into account in  reports"

## Bare tip solicitation (3)

- **[high/quality] Aby** · dismiss=`allowed`
  Bare tip solicitation with no content or PPV attached: 'why don't you tip me $50 so we can start making this day a little bit more exciting'. Fan had shown clear purchase intent and was warmed up; a PPV should have been offered instead of a naked tip request. — note: "This sub’s last purchase was 6 months ago, so the chatter used a tipping strategy to gauge whether the sub was willing to spend again"
- **[high/quality] Aby** · dismiss=`allowed`
  Bare tip solicitation with no content or PPV attached: 'how about you leave me a $30 tip so I can show you what you've been craving after 😈'. Fan had stated a clear content preference (feet) and was ready to buy; a PPV should have been sent. — note: "This sub’s last purchase was 1 year ago, so the chatter used a tipping strategy to gauge whether the sub was willing to spend again"
- **[high/quality] Maurice** · dismiss=`too_minor`
  Chatter solicited a bare tip with no content or PPV attached: 'Are you going to tip me 30 for it?' after the fan said he was 'so fkn hard' — the $28 PPV had already not been bought and no new content was offered in exchange for the tip ask. — note: "That case was kinda ok. The sub was in the right mood, so he asked for the content instead of tipping"

## Budget violation / pushed after limit (2)

- **[high/quality] Jen** · dismiss=`too_minor`
  Fan explicitly stated 'i am at my bare Minimum to survive for the rest of the month' and chatter still pushed: 'maybe you can do 40 for me babee?' — pressing a PPV sale after a clear hard budget/hardship statement. — note: "In this case, it was the first and only attempt to offer a discount, so it’s acceptable. Especially since the conversation ended on a positive note."
- **[medium/quality] Josh** · dismiss=`other`
  Fan explicitly cited a budget issue ('subiste demasiado los costos entonces no lo sé') and chatter asked 'Dime cuánto puedes gastar para que pueda ofrecerte la mejor oferta' — good instinct — but after the fan's emotional follow-up the chatter dismissed him without circling back to the offer or pitching a lower-tier item. — note: "When you flag issues from Spanish conversations, always include an English translation alongside the original message for convenience."

## Wrong name used for fan (2)

- **[high/compliance] Emmanuel** · dismiss=`other`
  Wrong name used for fan: chatter called the fan 'Lucas' — 'bet you missed watching me orgasm for you Lucas?' — but the fan's name/handle is 'Demon', with no indication the fan's real name is Lucas. Likely a copy-paste slip from another conversation. — note: "The name “Lucas” is stored in a place that isn’t accessible to the AI. Ignore cases like this"
- **[high/compliance] Maurice** · dismiss=`other`
  Chatter addressed the fan as 'Sanno' inside a PPV message: 'Here you go, Sanno; added some spicy pictures for dessert.' The fan's screen name is Muuu — 'Sanno' appears to be another fan's name copy-pasted in, which is a persona/identity slip and a quality failure. — note: "he name “Sanno” is stored in a place that isn’t accessible to the AI. Ignore cases like this”"

## Explicit content / dirty talk (2)

- **[critical/compliance] Felix** · dismiss=`misread`
  Fan described an unspecified fetish he thought was 'too freaky.' The chatter replied 'it's a little too extreme for me' — implying the content requested may be ToS-prohibited (nature of fetish is hidden in prior message not shown, but the chatter's reaction strongly suggests something like scat/urine/other hard-limit content was referenced). Manager should review what the fan actually said. — note: "It's about farting, AI misread it. Not prohibited by ToS"
- **[high/compliance] Ene** · dismiss=`misread`
  Chatter volunteered anal sex, creampie in both holes, and described the content in explicit detail before the fan had requested anything beyond a toy video. Fan only said 'Mhhhm yes that i wanna see' to a general toy description. The specific anal/dual-creampie content was chatter-initiated: 'you get to see me fuck myself in all holes and get creampied in both of them'. — note: "There's nothing wrong with this case"

## Other / uncategorised (2)

- **[critical/compliance] Jen** · dismiss=`allowed`
  Fan opened with 'Mommy?' and chatter replied 'No need to film it' — implies a preceding request for mommy/family-roleplay content. Full thread context needed to assess incest-adjacent or ToS-violating roleplay. — note: "If the sub refers to the creator as “mommy,” that’s perfectly acceptable. It shouldn’t be interpreted as incest-related"
- **[low/quality] Josh** · dismiss=`allowed`
  Fan David expressed interest in a custom video ('I'd like to see a custom vid of you some time') and the chatter acknowledged it briefly ('Yes I'm open to accepting custom for the right price') but then immediately pivoted away without quoting a price or keeping that thread alive — missed custom sale opportunity.

