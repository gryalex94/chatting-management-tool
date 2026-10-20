/**
 * The AI chat's own safety checks, in plain code (no AI involved):
 *  - screenFan: what a fan wrote, BEFORE any AI model sees it. Words that are never
 *    innocent ("underage", "jailbait"…) stop there and never reach the writer
 *    (Mistral's rules close an account even for an attempt); a crisis or a payment
 *    dispute goes to a human; an age under 18, or words that are usually innocent
 *    ("my kids", "school"), go to Claude to judge first; other situations become a
 *    note for the writer ("he asks if you're real").
 *  - checkReply: every reply before anyone sees it — contact details, claiming to
 *    be human, minors, selling (off for now), promising photos, repeating herself.
 *    Doubtful ones ("I wish we could meet") are passed to Claude to judge. It also
 *    lists how the reply sounds (voiceProblems: too many questions, the same
 *    opener or phrase again, an assistant's words): not rules, so such a draft is
 *    rewritten once and then shown with a note.
 * Both return plain-language reasons, shown as they are in the tool.
 */

const NOT_A_UNIT = '(?!\\s*(?:min|mins|minute|minutes|hour|hours|hr|hrs|sec|secs|second|seconds|day|days|week|weeks|month|months|mile|miles|km|cm|inch|inches|kg|lb|lbs|%|\\$|usd|euro|euros|dollar|dollars|bucks|k\\b|am\\b|pm\\b|o.?clock|times|x\\b))';
// An age under 18 said outright: "15 yo", "16 years old", "I'm 14", "she's only 16".
const UNDER_18 = new RegExp(
  `\\b(?:[1-9]|1[0-7])\\s*(?:yo|y\\/o|y\\.o\\.|yrs?\\s*old|years?\\s*old|year-old)\\b`
  + `|\\b(?:i'?m|im|i am|she'?s|shes|she is|he'?s|hes|he is|you'?re|youre|you are|ur|u r)\\s+(?:only\\s+|just\\s+|barely\\s+)?(?:[1-9]|1[0-7])\\b${NOT_A_UNIT}`,
  'i');
const MINOR_WORDS = /\b(?:under\s?age|underaged|pre-?teens?|jail\s?bait|lolis?|lolita|shota|child\s?porn|cheese\s?pizza)\b/i;
// Usually innocent ("my kids are asleep"), sometimes not: Claude judges these.
const DOUBTFUL_WORDS = /\b(?:kids?|child|children|daughters?|sons?|nieces?|nephews?|teens?|teenage|teenagers?|school\w*|students?|class\s?mates?|young(?:er)?\s+(?:girl|boy|one)s?|little\s+(?:girl|boy|sister|brother)s?|minors?|barely\s+legal|sisters?|brothers?|step\s?(?:sis|sister|bro|brother|mom|mum|dad|daughter|son)\w*|cousins?|mommy|mom|mum|mother|aunt|uncle)\b/i;
const CRISIS = /\b(?:kill(?:ing)?\s+my\s?self|suicid\w*|end(?:ing)?\s+(?:it\s+all|my\s+life)|self[-\s]?harm\w*|cut(?:ting)?\s+my\s?self|want(?:ed)?\s+to\s+die|don'?t\s+want\s+to\s+(?:live|be\s+alive)|no\s+reason\s+to\s+live)\b/i;
// A payment dispute goes to a person. "Is this a scam?" alone is a doubt, not a dispute:
// she reassures him (plan.js, Q24c); "you scammed me" is a dispute.
const PAYMENT_DISPUTE = /\b(?:refund\w*|charge\s?backs?|ripped\s+off|fraud|stole|stolen|money\s+back|didn'?t\s+(?:get|receive)\s+(?:it|what|the|my)|(?:you|she|this\s+page)\s+scammed|scammed\s+me|got\s+scammed)\b/i;
const ASKS_REAL = /\b(?:are\s+(?:you|u)\s+(?:a\s+)?(?:real|human|bot|robot|ai|a\.i\.|fake|a\s+person|actually\s+real)|(?:you'?re|ur|you\s+are)\s+(?:a\s+)?(?:bot|robot|ai|fake|not\s+real)|is\s+this\s+(?:a\s+)?(?:bot|ai|real)|real\s+person|chat\s?gpt)\b/i;
// "Nice to meet you" is a greeting, not a meet-up.
const NOT_GREETING = '(?<!(?:nice|glad|good|great|lovely|happy|pleasure|pleased|cool|awesome)\\s+to\\s+)';
const WANTS_MEET = new RegExp(`\\b(?:${NOT_GREETING}meet(?:\\s+up|\\s+you|\\s+me|\\s+irl|\\s+in\\s+person)?\\b(?!\\s+(?:you\\s+)?(?:here|on\\s+fanvue))`
  + '|date\\s+(?:me|you)|come\\s+over|hang\\s+out|your\\s+(?:address|number|phone|insta\\w*|snap\\w*|whats\\s?app|telegram|socials?)'
  + '|whats\\s?app|telegram|snap\\s?chat|instagram|insta\\b|kik\\b|discord|call\\s+(?:me|you)|face\\s?time|video\\s+(?:call|chat))', 'i');
const WANTS_STOP = /\b(?:stop\s+(?:texting|messaging|writing|sending)|leave\s+me\s+alone|don'?t\s+(?:text|message|write\s+to)\s+me|unsubscrib\w*|i'?m\s+(?:leaving|done\s+with\s+(?:you|this)))\b/i;
const WANTS_MEDIA = /\b(?:send\s+(?:me\s+)?(?:a\s+|some\s+|more\s+)?(?:pic|pics|picture|pictures|photo|photos|video|videos|vid|vids|selfie|nudes?|voice\s+(?:note|message))|show\s+me\s+(?:your|ur|some))\b/i;

const has = (re, s) => re.test(String(s || ''));
// Curly apostrophes and quotes ("I’m", “…”) read as straight ones, so every check sees them.
const straight = (s) => String(s || '').replace(/[‘’ʼ`]/g, '\'').replace(/[“”]/g, '"');

/**
 * The fan's latest message(s), before any AI sees them. Returns
 * { action: 'continue' | 'review' | 'stop' | 'handover', reasons: [...], notes: [...] }:
 * stop / handover mean no AI writes a reply; review means Claude decides first.
 */
function screenFan(texts) {
  const all = straight(texts.map(t => String(t || '')).join('\n'));
  if (has(MINOR_WORDS, all)) {
    return { action: 'stop', reasons: ['His message points to someone under 18. It never goes to the AI; a person should look at this chat.'], notes: [] };
  }
  if (has(CRISIS, all)) {
    return { action: 'handover', reasons: ['He talks about hurting himself or not wanting to live. A person should answer him, not the AI.'], notes: [] };
  }
  if (has(PAYMENT_DISPUTE, all)) {
    return { action: 'handover', reasons: ['He talks about a refund, a chargeback or being scammed. A person should handle it.'], notes: [] };
  }
  const notes = [];
  if (has(ASKS_REAL, all)) notes.push('He is asking whether you are real. Answer honestly that you are an AI character, warmly and in your own style, then keep chatting.');
  if (has(WANTS_MEET, all)) notes.push('He wants to meet, call or talk somewhere else. Say no kindly and playfully: you only chat here on Fanvue. Never share contact details.');
  if (has(WANTS_STOP, all)) notes.push('He wants you to stop. Respect it: a short, kind goodbye, no flirting, no questions.');
  if (has(WANTS_MEDIA, all)) notes.push('He wants a photo, video or voice note. You can\'t send any here: tease and keep chatting, and never promise one.');
  if (has(UNDER_18, all)) {
    return { action: 'review', reasons: ['His message mentions an age under 18. Claude checks it before the AI sees it.'], notes };
  }
  if (has(DOUBTFUL_WORDS, all)) {
    return { action: 'review', reasons: ['His message mentions children, school or family. Claude checks it is not sexual before the AI sees it.'], notes };
  }
  return { action: 'continue', reasons: [], notes };
}

// ── Reply checks ─────────────────────────────────────────────────────────────
const CONTACT = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/, 'an email address'],
  [/(?:\+?\d[\s().-]?){8,}\d/, 'a phone number'],
  [/\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|io|me|co|app|link|ly|gg|tv)\b/i, 'a link'],
  [/(?:^|\s)@[\w.]{3,}/, 'a username'],
  [/\b(?:whats\s?app|telegram|snap\s?chat|snap\b|instagram|insta\b|kik\b|discord|signal\s+app|onlyfans|only\s+fans|fansly|twitter|tiktok|reddit)\b/i, 'another app or site'],
];
const CLAIMS_HUMAN = /\b(?:i'?m|im|i\s+am)\s+(?:a\s+)?(?:real(?!ly)\b|human|not\s+(?:an?\s+)?(?:ai|a\.i\.|bot|robot|fake|program))|\bnot\s+(?:an?\s+)?(?:ai|a\.i\.|bot|robot)\b|\breal\s+(?:girl|woman|person|human)\b|\bflesh\s+and\s+blood\b/i;
const SELLS = /\$\s?\d|\b\d+\s?(?:usd|dollars?|bucks|euros?)\b|\bppv\b|\bunlock\w*\b|\b(?:send|leave|give|drop)\s+(?:me\s+)?(?:a\s+|some\s+)?tips?\b|\bpay\s+(?:me|for)\b|\bbuy\s+(?:it|this|my|me)\b|\bvault\b|\b(?:content|ppv|surprise|pics?|videos?)\s+i\s+(?:sent|left|made)\b|\bopen(?:ed)?\s+(?:it|my|the|what)\s+(?:\w+\s+)?(?:content|surprise|pics?|videos?|message|i\s+sent)\b/i;
const PROMISES_MEDIA = /\b(?:i'?ll|i\s+will|gonna|going\s+to|let\s+me|i\s+can|i'?m\s+(?:sending|recording))\s+(?:\w+\s+){0,3}?(?:send|show|record|film|shoot|snap)\b(?:\s+\w+){0,4}?\s+(?:pics?|pictures?|photos?|videos?|vids?|selfies?|clips?|voice\s+(?:notes?|messages?))\b|\b(?:here'?s|sending\s+you)\s+(?:a\s+)?(?:pic|picture|photo|video|selfie)\b/i;
// Teasing content she can't send: "let me show you a little taste", "something spicy waiting for you".
const PROMISES_CONTENT = /\b(?:show|send|give)\s+you\s+(?:just\s+)?(?:a\s+)?(?:little\s+|small\s+|quick\s+)?(?:taste|peek|preview|sneak\s+peek)\b|\b(?:something|some(?:thing)?s?|things?)\s+(?:\w+\s+){0,2}(?:waiting|ready)\s+for\s+you\b|\bwanna\s+see\s+(?:more|what\s+i'?m)\b/i;
const MEETING = new RegExp(`\\b(?:${NOT_GREETING}meet(?:\\s+up|\\s+you|\\s+irl|\\s+in\\s+person)|come\\s+over|my\\s+place|your\\s+place|in\\s+person|irl|hotel|my\\s+address|grab\\s+(?:a\\s+)?(?:drink|coffee|dinner))\\b`, 'i');
const MAX_MESSAGES = 3;
const MAX_CHARS = 400;
const normText = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * A drafted reply ({ messages: [...] }) against the house rules. Returns
 * { verdict: 'ok' | 'review' | 'block', problems: [...] }: block = rewrite it,
 * review = Claude decides. `recent` is her last few messages to this fan.
 */
// The writer's answer format leaking into a message: {"messages": [" … "]}.
const LOOKS_LIKE_CODE = /^\s*[{[]\s*"|"\s*[\]}]|"(?:messages|learned|handover)"|"\w+"\s*:\s*[[{"]/;
// Asking him over to another app ("add me on…", "my snap").
const INVITES = /\b(?:add|find|follow|message|dm|text|hit|chat\s+with)\s+me\s+(?:up\s+)?(?:on|at|over)\b|\bmy\s+(?:snap\w*|insta\w*|telegram|whats\s?app|kik|discord|twitter|tiktok|reddit|onlyfans|fansly|ig)\b/i;
// Greeting him again mid-chat (a repeated first word is dropped in prompts.tidyMessages).
const GREETS = /^\s*(?:he+y+|hi+|hello+)\b/i;

// How sexual a reply is, roughly (0 friendly … 3 explicit), to hold it to his level.
// Only suggestive and explicit are held in code; pet names like "babe" are just warmth.
const EXPLICIT = /\b(?:cock|dick|pussy|cum(?:ming)?|fuck\w*|tits|clit|blowjob|deepthroat|orgasm|naked|nude|horny|strok(?:e|es|ing)\s+(?:it|yourself|your)|jerk\w*\s+(?:it|off)|touch(?:ing)?\s+yourself)\b|🍆|💦/i;
const SUGGESTIVE = /\b(?:naughty|wet|hard for|strip\w*|undress\w*|lingerie|what i'?m wearing|in bed with|kinky|spicy|turn(?:s|ed)? (?:me|you) on|sexy|dirty)\b|😈|🥵|🍑|👅/i;
const FLIRTY = /\b(?:cutie|handsome|gorgeous|tease|teasing|flirt\w*|kiss\w*|crush)\b|😘|😏|😉|😍/i;
const replyLevel = (t) => (EXPLICIT.test(t) ? 3 : SUGGESTIVE.test(t) ? 2 : FLIRTY.test(t) ? 1 : 0);

// Asking for money outside a PPV: never, selling or not.
const ASKS_MONEY = /\b(?:send|leave|give|drop)\s+(?:me\s+)?(?:a\s+|some\s+)?tips?\b|\bpay\s+me\b|\b(?:cash\s?app|venmo|paypal|zelle)\b/i;
// Her content isn't made live: no "just took this", "filming it right now". (Setting
// the scene in a sexting story, "let me close the curtains", is fine: it's her character.)
const LIVE_CLAIM = /\b(?:just|literally)\s+(?:took|shot|filmed|recorded|made)\s+(?:this|it|these)\b|\b(?:taking|filming|recording|shooting)\s+(?:it|this|one|them|a\s+\w+)\s+(?:right\s+)?now\b|\bmade\s+(?:it|this)\s+(?:right\s+now|live)\b/i;
// Promising to show or send him something ("how about I show you…", "something I've
// been saving"): only with a PPV attached, or when one could follow.
const PROMISES_SHOW = /\b(?:how\s+about\s+i\s+(?:show|send|give)|let\s+me\s+(?:show|send|give)\s+you|i'?ll\s+(?:show|send|give)\s+you|i\s+(?:can|could|will|wanna|want\s+to)\s+(?:show|send)\s+you|want\s+me\s+to\s+(?:show|send)|(?:wanna|want\s+to)\s+see\s+(?:it|more|something|what|how|where)|(?:got|have)\s+(?:something|a\s+surprise)\s+(?:special\s+|naughty\s+|hot\s+)?(?:for|just\s+for)\s+you|something\s+i'?ve\s+been\s+saving|(?:show|give)\s+you\s+(?:exactly\s+)?(?:how|what)\s+(?:i|you)\b|wait\s+(?:till|until|'?til)\s+you\s+see|what\s+else\s+i'?(?:ve|\s+have)?\s*got|i\s+(?:have|'?ve\s+got)\s+(?:more|something\s+else)\s+(?:for\s+you|coming))/i;

/**
 * A drafted reply against the house rules. `selling`: she may sell through a PPV;
 * `offering`: this reply carries one (then price and content talk is its caption,
 * and the caption may be one step spicier than the chat); `noOffer`: why no PPV can
 * go out now (then she mustn't promise one either). `voice`: what her reply is
 * checked against for how it sounds (see voiceProblems); returned as `style`.
 */
function checkReply(messages, { recent = [], chatting = false, maxLevel = 3, selling = false, offering = false, noOffer = '', voice = null } = {}) {
  const list = (messages || []).map(m => String(m || '').trim()).filter(Boolean);
  if (!list.length) return { verdict: 'block', problems: ['The reply was empty.'], style: [] };
  const all = straight(list.join('\n'));
  const block = [], review = [];
  if (has(UNDER_18, all) || has(MINOR_WORDS, all)) block.push('It mentions someone under 18.');
  // an app or site he named himself ("saw you on reddit") may be said back, as long as she doesn't invite him there
  const named = (re) => voice?.his && re.test(straight(voice.his)) && !INVITES.test(all);
  for (const [re, what] of CONTACT) if (re.test(all) && !(what === 'another app or site' && named(re))) block.push(`It contains ${what}: she only chats on Fanvue.`);
  if (has(CLAIMS_HUMAN, all)) block.push('It says or suggests she is a real person. She is an AI character.');
  if (has(ASKS_MONEY, all)) block.push('It asks for a tip or money. She only sells through a PPV.');
  else if (!selling && has(SELLS, all)) block.push('It sells, names a price or asks for a tip. Selling is off for now.');
  // selling: teasing what she has is the build-up to an offer; voice notes she never has
  if (selling ? /\bvoice\s+(?:notes?|messages?|memos?)\b/i.test(all) && has(PROMISES_MEDIA, all)
    : has(PROMISES_MEDIA, all) || has(PROMISES_CONTENT, all)) {
    block.push(selling ? 'It promises a voice note. She can\'t send any.' : 'It promises or teases a photo, video or content. She can\'t send any (and doesn\'t sell yet).');
  }
  if (has(LIVE_CLAIM, all)) block.push('It says she is making or filming something right now. Her content is already made.');
  if (selling && !offering && noOffer && has(PROMISES_SHOW, all)) block.push(`It promises to show or send him something, but no PPV can go with it now: ${noOffer}`);
  if (list.length > MAX_MESSAGES) block.push(`It has ${list.length} messages; the most is ${MAX_MESSAGES}.`);
  if (list.some(m => m.length > MAX_CHARS)) block.push('A message is too long for a chat.');
  if (list.some(m => LOOKS_LIKE_CODE.test(m))) block.push('It came out as code (brackets, quotes or "messages"), not a chat message.');
  if (chatting && GREETS.test(list[0])) block.push('It greets him again, but you are already chatting.');
  if (replyLevel(all) >= 2 && replyLevel(all) > maxLevel + (offering ? 1 : 0)) block.push(`It is more sexual than he is right now: keep it ${['friendly, no flirting', 'flirty at most, nothing sexual', 'suggestive at most, nothing explicit'][maxLevel]}.`);
  const seen = new Set(recent.map(normText).filter(t => t.length >= 12));
  if (list.some(m => seen.has(normText(m)))) block.push('It repeats something she already sent him.');
  if (has(MEETING, all)) review.push('It talks about meeting in person.');
  if (has(DOUBTFUL_WORDS, all)) review.push('It mentions children, school or family.');
  const style = voice ? voiceProblems(list, voice) : [];
  if (block.length) return { verdict: 'block', problems: [...block, ...review], style };
  if (review.length) return { verdict: 'review', problems: review, style };
  return { verdict: 'ok', problems: [], style };
}

// ── How she sounds ───────────────────────────────────────────────────────────
// Words of an assistant or an office, not a girl texting: [pattern, what it is].
const STIFF = [
  [/\bagenda\b/i, '"agenda"'],
  [/\bplans?\s+for\s+(?:the|your)\s+day\b|\bwhat\s+are\s+your\s+plans\s+for\b/i, '"plans for the day"'],
  [/\btrip(?:s|ping)?\s+me\s+up\b/i, '"trips me up"'],
  [/\bi\s+must\s+say\b|\bindeed\b|\bdelightful\b|\bintriguing\b|\bfascinating\b|\bquite\s+the\b|\bmy,?\s+my\b|\bwell,?\s+well\b|\bwhilst\b|\bembark\b/i, 'an assistant\'s words'],
  [/\bi\s+(?:like|love|appreciate)\s+(?:your|the)\s+honesty\b/i, '"I like your honesty"'],
  [/\bsomeone(?!\s+(?:else|like\s+you|special))(?:'?s|\s+(?:is|needs|wants|seems|sounds|got|has|knows|likes|loves|can'?t|'?s\s+got))\b/i, '"someone\'s eager" (talk to him, not about him)'],
  [/\b(?:aren'?t|isn'?t|don'?t|doesn'?t)\s+(?:they|he)\s*\?/i, '"aren\'t they?" (talk to him, not about him)'],
  [/\bi\s+(?:like|love|adore)\s+(?:a\s+)?(?:man|guy|men|guys|boy|boys)\s+who\b|\b(?:man|guy)\s+(?:who\s+)?knows\s+what\s+he\s+wants\b/i, '"I like a man who…"'],
  [/\b(?:so|now)\s+tell\s+me\b|(?:^|[\n.!?…]\s*)tell\s+me\s*,/im, '"so tell me…"'],
];
// Commenting on how eager or direct he is instead of answering him (the AI's way of stalling).
const COMMENTS_EAGER = /\byou\s+(?:don'?t|do\s+not)\s+waste\s+(?:any\s+)?time\b|\bwasting\s+no\s+time\b|\b(?:how|so)\s+(?:eager|direct|impatient|forward|bold|straightforward)\s+you\s+are\b|\byou'?re\s+(?:so\s+|very\s+|really\s+|quite\s+|this\s+|being\s+)?(?:eager|direct|impatient|forward|straightforward)\b|\bstraight\s+to\s+the\s+point\b|\bcut(?:ting)?\s+(?:right\s+)?to\s+the\s+chase\b|\bnot\s+(?:shy|one\s+to\s+beat\s+around)\b|\bi\s+(?:like|love)\s+(?:how|that)\s+you(?:'re|\s+are)?\s+(?:not\s+shy|so\s+eager|direct|ready|eager)\b|\bi\s+(?:like|love|adore)\s+(?:a\s+)?(?:man|guy)\s+who\b|\b(?:man|guy)\s+(?:who\s+)?knows\s+what\s+he\s+wants\b/i;
// Her story going on: something she does or that happens, in her words ("pulling my top
// up", "under the covers", "my fingers…"). A sexting reply without any just reacts.
const STORY_MOVE = /\b(?:pull|slid|slide|slip|kick|lying|laying|lay\s|laid|lie\s|tak(?:e|ing)\s+(?:it\s+|this\s+|my\s+\w+\s+)?off|took\s+(?:it\s+|my\s+\w+\s+)?off|bit(?:e|ing)\s+my|arch|touch(?:ing)?\s+my|spread|roll|turn(?:ed|ing)?\s+(?:the|off|over)|grab|squeez|rub|sitting|sat\s|kneel|knelt|bend|bent|strip|unbutton|unhook|lift|drop|wrap|tuck|stretch|crawl|climb|shiver|shak|trembl|moan|whisper|undress|peel|tug|press|riding\s+up|comfy|getting\s+(?:wet|hot|comfy|naked|undressed)|let\s+me\s+(?:get|pull|take|peel|slide|slip|lie|lay|sit|turn|kick|unbutton|undo|tug|drop)|my\s+(?:hands?|fingers?|legs|thighs|hips|back|lips|top|shirt|bra|panties|thong|shorts|towel|bed|pjs|pajamas|sheets|blanket)|under\s+the\s+(?:covers|sheets|blanket)|on\s+(?:my|the)\s+(?:bed|couch|knees)|towel|curtains|lights?\s+(?:off|down|low)|lamp|pillow|sheets|\w+'s\s+off|off\s+(?:now|already)|toss|threw|fingers?|tracing|grind|bounc|spank|kiss(?:ing)?\s+(?:my|your))\w*/i;
// Guessing his time of day ("what's keeping you up this early?") when he didn't say it.
const GUESSES_TIME = /\b(?:this|so)\s+(?:early|late)\b|\bup\s+(?:so\s+)?(?:early|late)\b|\bkeep(?:s|ing)?\s+you\s+up\b|\bthis\s+(?:morning|afternoon|evening)\b|\bstart\s+(?:the|your)\s+day\b/i;
const SAYS_TIME = /\b(?:early|late|morning|night|tonight|sleep\w*|awake|bed|tired|insomnia|\d{1,2}\s*(?:am|pm)|o'?clock|time\s+zone)\b/i;
const PET_PHRASE = /\bgood\s+(?:boy|girl)\b/i;
const STOPW = new Set('i im ive id ill you youre your me my mine the a an and or but to of in on at for with from about it its is are was be been am this that these those so do does dont did just like really very what whats how when where who why can cant will would could should have has had not no yes yeah oh ok okay well get got go going want wanna gonna know think one some more much too now then here there they them we us he him she her his babe baby'.split(' '));
const wordsOf = (t) => String(t).toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) || [];
// runs of n words that say something (not only little words like "do you want to")
function runs(t, n) {
  const w = wordsOf(t), out = new Set();
  for (let i = 0; i + n <= w.length; i++) {
    const g = w.slice(i, i + n);
    if (g.some(x => x.length >= 4 && !STOPW.has(x))) out.add(g.join(' '));
  }
  return out;
}
const opening = (t) => wordsOf(t).slice(0, 2).join(' ');

// "Tonight?", "Special treatment?", "You want hotter?": his own words back with a
// question mark. A reaction, not a question to him (but a habit when it's every reply).
const ASKS_WORD = /^\W*(?:what|whats|how|where|when|who|why|which|do|does|did|are|is|was|were|can|could|would|will|have|has|should|wanna|want|may|shall)\b/i;
function isEcho(sentence, his = '') {
  const w = wordsOf(sentence);
  if (!w.length || w.length > 4 || ASKS_WORD.test(straight(sentence).replace(/^you\s+/i, ''))) return false;
  const hisWords = new Set(wordsOf(his));
  return w.some(x => x.length >= 3 && !STOPW.has(x) && hisWords.has(x)) || /^\W*(?:really|seriously|yeah|yes|no\s+way|oh|huh|right)\W*$/i.test(sentence);
}
// A message's sentences (an emoji before a capital letter ends one too: "Mike 😊 What…").
const SENTENCE = /[^.!?…\n]+(?:[.!?…]+|(?=\n)|$)(?:\s*\p{Extended_Pictographic}\uFE0F?)*/gu;
function sentences(t) {
  const s = String(t).replace(/(\p{Extended_Pictographic}️?)\s+(?=\p{Lu})/gu, '$1\n');
  const out = (s.match(SENTENCE) || []).map(x => x.trim()).filter(Boolean);
  return out.length ? out : [String(t)];
}
// Her questions to him: sentences that end with "?" (an emoji may follow), echoes left out.
function questionsIn(list, his = '') {
  return list.flatMap(sentences).filter(s => /\?/.test(s) && !isEcho(s.replace(/\?[\s\S]*$/, ''), his)).length;
}

/**
 * How a draft sounds, against her last replies and his messages. `recent` = her
 * last replies (each one reply as one text, newest last), `his` = his recent
 * messages as one text, `noQuestion` = why this reply shouldn't ask anything ('' =
 * it may ask one). Returns plain-language problems ([] = fine).
 */
function voiceProblems(list, { recent = [], his = '', noQuestion = '', length = null } = {}) {
  const all = straight(list.join('\n'));
  const out = [];
  // his length, mirrored (the plan: Q4)
  const n = wordsOf(all).length;
  if (length === 'short' && (n > 35 || list.length > 2)) out.push('It\'s much longer than his short message: keep it short (one message).');
  if (length === 'long' && n < 8) out.push('It\'s too short for what he wrote: give him a bit more.');
  const questions = questionsIn(list, his);
  if (questions > 1) out.push(`It asks him ${questions} questions; one at most, and often none.`);
  else if (questions && noQuestion) out.push(`It asks him a question, but ${noQuestion}`);
  if (COMMENTS_EAGER.test(all)) out.push('It comments on how eager or direct he is instead of answering him: just say yes, play along or lead.');
  const last = recent.slice(-6);
  const firstSentence = (t) => sentences(t)[0] || '';
  const echoStart = (t) => /\?/.test(firstSentence(t)) && isEcho(firstSentence(t).replace(/\?[\s\S]*$/, ''), his);
  if (echoStart(list[0]) && last.slice(-2).some(echoStart)) out.push(`It opens by repeating his words as a question again ("${firstSentence(list[0]).trim()}"). React differently.`);
  const open = opening(list[0]);
  const sameStart = open.includes(' ') && last.find(r => opening(r) === open);
  if (sameStart) out.push(`It starts like one of her last replies ("${list[0].split(/\s+/).slice(0, 2).join(' ')}…"). Start differently.`);
  const mine = runs(all, 4);
  const reused = [...new Set(last.flatMap(r => [...runs(r, 4)].filter(g => mine.has(g))))];
  if (reused.length) out.push(`It reuses "${reused[0]}" from one of her last replies. Say something new.`);
  if (PET_PHRASE.test(all) && last.some(r => PET_PHRASE.test(r))) out.push(`It says "${all.match(PET_PHRASE)[0].toLowerCase()}" again.`);
  const echo = [...runs(his, 5)].filter(g => runs(all, 5).has(g));
  if (echo.length) out.push(`It repeats his own words back to him ("${echo[0]}"). Pick up one word of his at most.`);
  for (const [re, what] of STIFF) if (re.test(all)) out.push(`It sounds like an assistant, not a girl texting: ${what}.`);
  if (GUESSES_TIME.test(all) && !SAYS_TIME.test(his)) out.push('It guesses his time of day; she only knows her own.');
  return out;
}

// A character must come across as an adult: nothing young, school-age or about minors.
const YOUNG = /\b(?:teen\w*|high\s?school\w*|middle\s?school\w*|school\s?girls?|school\s?boys?|school\s+uniforms?|young[-\s]?looking|looks?\s+(?:so\s+|very\s+)?young|childlike|childish|child|children|kids?|little\s+(?:girl|boy)|barely\s+legal|baby[-\s]?faced?)\b/i;
/** Problems with a character description or profile text (empty list = fine). */
function personaProblems(text) {
  const s = String(text || '');
  return has(UNDER_18, s) || has(MINOR_WORDS, s) || has(YOUNG, s)
    ? ['It describes her as young, or mentions minors, children or school. She must come across as an adult.']
    : [];
}

module.exports = { screenFan, checkReply, voiceProblems, questionsIn, isEcho, sentences, COMMENTS_EAGER, GUESSES_TIME, SAYS_TIME, PROMISES_SHOW, STORY_MOVE, personaProblems, replyLevel, MAX_MESSAGES };
