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
 *    Doubtful ones ("I wish we could meet") are passed to Claude to judge.
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
const PAYMENT_DISPUTE = /\b(?:refund\w*|charge\s?backs?|scam\w*|ripped\s+off|fraud|stole|stolen|money\s+back|didn'?t\s+(?:get|receive)\s+(?:it|what|the|my))\b/i;
const ASKS_REAL = /\b(?:are\s+(?:you|u)\s+(?:a\s+)?(?:real|human|bot|robot|ai|a\.i\.|fake|a\s+person|actually\s+real)|(?:you'?re|ur|you\s+are)\s+(?:a\s+)?(?:bot|robot|ai|fake|not\s+real)|is\s+this\s+(?:a\s+)?(?:bot|ai|real)|real\s+person|chat\s?gpt)\b/i;
// "Nice to meet you" is a greeting, not a meet-up.
const NOT_GREETING = '(?<!(?:nice|glad|good|great|lovely|happy|pleasure|pleased|cool|awesome)\\s+to\\s+)';
const WANTS_MEET = new RegExp(`\\b(?:${NOT_GREETING}meet(?:\\s+up|\\s+you|\\s+me|\\s+irl|\\s+in\\s+person)?\\b(?!\\s+(?:you\\s+)?(?:here|on\\s+fanvue))`
  + '|date\\s+(?:me|you)|come\\s+over|hang\\s+out|your\\s+(?:address|number|phone|insta\\w*|snap\\w*|whats\\s?app|telegram|socials?)'
  + '|whats\\s?app|telegram|snap\\s?chat|instagram|insta\\b|kik\\b|discord|call\\s+(?:me|you)|face\\s?time|video\\s+(?:call|chat))', 'i');
const WANTS_STOP = /\b(?:stop\s+(?:texting|messaging|writing|sending)|leave\s+me\s+alone|don'?t\s+(?:text|message|write\s+to)\s+me|unsubscrib\w*|i'?m\s+(?:leaving|done\s+with\s+(?:you|this)))\b/i;
const WANTS_MEDIA = /\b(?:send\s+(?:me\s+)?(?:a\s+|some\s+|more\s+)?(?:pic|pics|picture|pictures|photo|photos|video|videos|vid|vids|selfie|nudes?|voice\s+(?:note|message))|show\s+me\s+(?:your|ur|some))\b/i;

const has = (re, s) => re.test(String(s || ''));

/**
 * The fan's latest message(s), before any AI sees them. Returns
 * { action: 'continue' | 'review' | 'stop' | 'handover', reasons: [...], notes: [...] }:
 * stop / handover mean no AI writes a reply; review means Claude decides first.
 */
function screenFan(texts) {
  const all = texts.map(t => String(t || '')).join('\n');
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
// Openers the AI leans on: greeting again mid-chat, and the same first word as her
// last messages ("hehe… hehe… hehe…"). Repeated letters count as one (mmm = mm).
const GREETS = /^\s*(?:he+y+|hi+|hello+)\b/i;
const TICS = new Set(['hehe', 'haha', 'm', 'hm', 'aw', 'oh', 'ok', 'lol', 'well', 'so']);
const firstWord = (t) => ((String(t).toLowerCase().match(/^[\p{L}]+/u) || [''])[0]).replace(/(.)\1+/g, '$1');

// How sexual a reply is, roughly (0 friendly … 3 explicit), to hold it to his level.
// Only suggestive and explicit are held in code; pet names like "babe" are just warmth.
const EXPLICIT = /\b(?:cock|dick|pussy|cum(?:ming)?|fuck\w*|tits|clit|blowjob|deepthroat|orgasm|naked|nude|horny)\b|🍆|💦/i;
const SUGGESTIVE = /\b(?:naughty|wet|hard for|strip\w*|undress\w*|lingerie|what i'?m wearing|in bed with|kinky|spicy|turn(?:s|ed)? (?:me|you) on|sexy|dirty)\b|😈|🥵|🍑|👅/i;
const FLIRTY = /\b(?:cutie|handsome|gorgeous|tease|teasing|flirt\w*|kiss\w*|crush)\b|😘|😏|😉|😍/i;
const replyLevel = (t) => (EXPLICIT.test(t) ? 3 : SUGGESTIVE.test(t) ? 2 : FLIRTY.test(t) ? 1 : 0);

function checkReply(messages, { recent = [], chatting = false, maxLevel = 3 } = {}) {
  const list = (messages || []).map(m => String(m || '').trim()).filter(Boolean);
  if (!list.length) return { verdict: 'block', problems: ['The reply was empty.'] };
  const all = list.join('\n');
  const block = [], review = [];
  if (has(UNDER_18, all) || has(MINOR_WORDS, all)) block.push('It mentions someone under 18.');
  for (const [re, what] of CONTACT) if (re.test(all)) block.push(`It contains ${what}: she only chats on Fanvue.`);
  if (has(CLAIMS_HUMAN, all)) block.push('It says or suggests she is a real person. She is an AI character.');
  if (has(SELLS, all)) block.push('It sells, names a price or asks for a tip. Selling is off for now.');
  if (has(PROMISES_MEDIA, all) || has(PROMISES_CONTENT, all)) block.push('It promises or teases a photo, video or content. She can\'t send any (and doesn\'t sell yet).');
  if (list.length > MAX_MESSAGES) block.push(`It has ${list.length} messages; the most is ${MAX_MESSAGES}.`);
  if (list.some(m => m.length > MAX_CHARS)) block.push('A message is too long for a chat.');
  if (list.some(m => LOOKS_LIKE_CODE.test(m))) block.push('It came out as code (brackets, quotes or "messages"), not a chat message.');
  if (chatting && GREETS.test(list[0])) block.push('It greets him again, but you are already chatting.');
  const opener = firstWord(list[0]);
  if (TICS.has(opener) && recent.slice(-3).some(r => firstWord(r) === opener)) {
    block.push(`It starts with "${list[0].split(/\s|,/)[0]}" again, like your last messages: start differently.`);
  }
  if (replyLevel(all) >= 2 && replyLevel(all) > maxLevel) block.push(`It is more sexual than he is right now: keep it ${['friendly, no flirting', 'flirty at most, nothing sexual', 'suggestive at most, nothing explicit'][maxLevel]}.`);
  const seen = new Set(recent.map(normText).filter(t => t.length >= 12));
  if (list.some(m => seen.has(normText(m)))) block.push('It repeats something she already sent him.');
  if (has(MEETING, all)) review.push('It talks about meeting in person.');
  if (has(DOUBTFUL_WORDS, all)) review.push('It mentions children, school or family.');
  if (block.length) return { verdict: 'block', problems: [...block, ...review] };
  if (review.length) return { verdict: 'review', problems: review };
  return { verdict: 'ok', problems: [] };
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

module.exports = { screenFan, checkReply, personaProblems, replyLevel, MAX_MESSAGES };
