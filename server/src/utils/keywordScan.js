/**
 * Deterministic keyword safety net for the two most serious compliance risks,
 * so they never depend only on the AI (which fan text can try to manipulate):
 *  - off-platform contact / payment, in CHATTER messages
 *  - a fan stating an under-18 age or a school-grade signal, in FAN messages
 * Plain regexes with word boundaries + small context checks. Each matcher
 * returns the matched keyword (a short label) or null.
 */

// Normalise for matching: drop tags + zero-width chars, fold fullwidth/compat
// forms (NFKC) and curly apostrophes, collapse whitespace.
const clean = (s) => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
  .replace(/[‘’ʼ`´]/g, "'")
  .replace(/\s+/g, ' ').trim();

// ─── off-platform (chatter text) ───────────────────
// [platform, label, regex]. `platform` is what known_platforms is checked against.
const HANDLE_CTX = String.raw`(?:on|my|your|ur|via|add\s+me\s+on|follow\s+me\s+on|dm\s+me\s+on|hit\s+me\s+up\s+on|message\s+me\s+on|text\s+me\s+on)`;
const OFFPLATFORM = [
  ['snapchat', 'snapchat', /\bsnap\s?chat\b/i],
  ['snapchat', 'snap', new RegExp(String.raw`\b${HANDLE_CTX}\s+snap\b|\bsnap\s+(?:me|handle|name|username|user|id|@)\b`, 'i')],
  ['telegram', 'telegram', /\btelegram+\b|\bt\.me\//i],
  ['telegram', 'tg', new RegExp(String.raw`\b${HANDLE_CTX}\s+tg\b|\btg\s+(?:handle|name|username|user|id|@)`, 'i')],
  ['whatsapp', 'whatsapp', /\bwhats\s?app?\b|\bwa\.me\//i],
  ['kik', 'kik', /\bkik\b/i],
  // Instagram is usually the creator's own public promo account ("my IG posts"),
  // so only handle requests / moving the chat there count.
  ['instagram', 'instagram', /\b(?:dm|message|msg|text|add|talk\s+to|chat\s+with|write)\s+me\s+(?:on|via|over|in)\s+(?:ig|insta|instagram)\b|\b(?:ig|insta|instagram)\s*(?:handle|username|user\s*name|dms?|acc|account\s+name)\b|\b(?:ig|insta|instagram)\s*(?:is\s+)?[:@]|\b(?:what'?s|wats|send\s+me|give\s+me|drop|tell\s+me)\s+(?:your|ur|yo|me\s+your)\s+(?:ig|insta|instagram)\b/i],
  ['signal', 'signal', /\b(?:on|via|add\s+me\s+on|message\s+me\s+on|text\s+me\s+on)\s+signal\b|\bsignal\s+(?:app|messenger)\b/i],
  ['discord', 'discord', /\bdiscord\b/i],
  ['cashapp', 'cashapp', /\bcash\s?app\b/i],
  ['paypal', 'paypal', /\bpay\s?pal\b/i],
  ['venmo', 'venmo', /\bvenmo\b/i],
  ['zelle', 'zelle', /\bzelle\b/i],
  ['phone', 'my number', /\b(?:my|your|ur)\s+(?:phone\s+|cell\s+|mobile\s+)?(?:number|digits)\b(?!\s*(?:one|1|of|on\s+here)\b)|\bphone\s+number\b/i],
  ['phone', 'text me', /\btext\s+me\s+(?:on|at|via)\b(?!\s+(?:here|this|of|onlyfans)\b)|\btext\s+me\s+\+?\d/i],
];
// 9–15 digits with optional separators, not a price/time/decimal.
const PHONE_RE = /(?<![\w$€£.,:])\+?\d[\d\s().-]{7,20}\d(?![\w%.,:])/g;

// Platforms a page legitimately has (creators.ai_context.known_platforms, free
// text). A platform is "known" when any of its words appears there.
const PLATFORM_WORDS = {
  snapchat: /\bsnap(?:\s?chat)?\b/i, telegram: /\btelegram\b|\btg\b/i, whatsapp: /\bwhats\s?app\b/i,
  kik: /\bkik\b/i, instagram: /\binstagram\b|\binsta\b|\big\b/i, signal: /\bsignal\b/i,
  discord: /\bdiscord\b/i, cashapp: /\bcash\s?app\b/i, paypal: /\bpay\s?pal\b/i,
  venmo: /\bvenmo\b/i, zelle: /\bzelle\b/i, phone: /\bphone\b|\bnumber\b/i,
};
function knownPlatforms(text) {
  const t = String(text || '');
  return new Set(Object.keys(PLATFORM_WORDS).filter(p => PLATFORM_WORDS[p].test(t)));
}

// A chatter REFUSING to move off-platform ("I don't message on TG hun, we can talk
// here", "I don't give out my number, let's continue here") is doing exactly the
// right thing — managers dismissed these before. Skip a refusal, unless the same
// message also invites contact elsewhere ("I don't have snap but add me on tg").
const REFUSAL_RE = /\b(?:don'?t|do\s+not|dont|never|can'?t|cannot|won'?t|barely|rarely|not\s+really)\s+(?:really\s+)?(?:use|give|share|message|msg|text|chat|talk|do|go\s+on|have|post)\b|\b(?:let'?s|we\s+can|we'?ll|i'?d\s+rather|rather)\s+(?:just\s+)?(?:keep\s+(?:it|talking|chatting)\s+|continue\s+|talk\s+|stay\s+|chat\s+)?(?:here|on\s+here|on\s+(?:of|onlyfans))\b/i;
const INVITE_RE = /\b(?:add\s+me|hit\s+me\s+up|text\s+me|message\s+me|dm\s+me|call\s+me|find\s+me|follow\s+me|reach\s+me|here'?s\s+my|my\s+(?:snap(?:chat)?|tg|telegram|whatsapp|kik|insta(?:gram)?|ig|number|phone|cash\s*app|paypal|venmo|discord)\s+(?:is|:))/i;

/** First off-platform keyword in a chatter message, skipping the page's known platforms. */
function matchOffPlatform(text, known = new Set()) {
  const t = clean(text);
  if (!t) return null;
  if (REFUSAL_RE.test(t) && !INVITE_RE.test(t)) return null;
  for (const [platform, label, re] of OFFPLATFORM) {
    if (!known.has(platform) && re.test(t)) return label;
  }
  if (!known.has('phone')) {
    for (const m of t.matchAll(PHONE_RE)) {
      const digits = m[0].replace(/\D/g, '');
      if (digits.length >= 9 && digits.length <= 15) return 'phone number';
    }
  }
  return null;
}

// ─── under-18 age (fan text) ───────────────────────
const AGE = String.raw`(1[0-7]|thirteen|fourteen|fifteen|sixteen|seventeen)`;
// After the number: things that make it a quantity/price/time, not an age.
const NOT_AGE_AFTER = /^\s*(?:[.,:/]\d|%|\$|€|£|x\b|k\b|(?:min|mins|minutes?|secs?|seconds?|h|hrs?|hours?|days?|weeks?|months?|videos?|vids?|pics?|photos?|pictures?|clips?|inch(?:es)?|in\b|cm|mm|dollars?|bucks|usd|euros?|eur|times?|am|pm|lbs?|kg|pounds|feet|ft|miles?|km|of|out|more|left|away|messages?|msgs?)\b)/i;
// Before/after the match: past tense, or someone else (a kid, a sibling) — not the fan now.
const SELF_BEFORE = /\b(?:i'?m|i\s+am)\s+(?:a\s+|an\s+|only\s+|just\s+|still\s+)?$/i;
const PAST_BEFORE = /\b(?:was|were|when|back|used\s+to|since|graduat\w*|finished|after|remember)\b(?:\s+\S+){0,3}\s*$/i;
const OTHER_BEFORE = /\b(?:a|an|at|his|her|their|our|the|my|your|ur|this|that|with|is|are|he'?s|she'?s|it'?s|they'?re|who'?s)\s+$/i;
const OTHER_AFTER = /^\s*(?:son|daughter|kid|child|girl|boy|sister|brother|niece|nephew|cousin|stepson|stepdaughter|student|guy|dude|me|ago)s?\b/i;
const YEARS_NOT_OLD = /^\s*(?:yrs?|years?)\b(?!\s*old)/i;

const AGE_PATTERNS = [
  // "i'm 16", "im 17", "i am 15 (years old)"
  { label: 'says under 18', re: new RegExp(String.raw`\b(?:i'?m|i\s+am)\s+(?:only\s+|just\s+|still\s+)?${AGE}\b`, 'gi'), checkAfter: true },
  // "16 yo", "16yo", "15 years old", "17 y/o" (13+: younger bare ages are pets/kids)
  { label: 'says under 18', re: new RegExp(String.raw`\b(1[3-7]|thirteen|fourteen|fifteen|sixteen|seventeen)\s*(?:yo|y/o|y\.o\.?|yrs?\s+old|years?\s+old|year-old)\b`, 'gi'), checkBefore: true },
  // "age 17", "aged 16", "my age is 15", "age: 16"
  { label: 'says under 18', re: new RegExp(String.raw`\b(?:age|aged|my\s+age\s+is|age\s+is)\s*:?\s*${AGE}\b`, 'gi'), checkAfter: true, checkBefore: true },
  // "turning 17", "gonna be 16"
  { label: 'says under 18', re: new RegExp(String.raw`\b(?:turning|gonna\s+be|going\s+to\s+be|will\s+be)\s+${AGE}\b`, 'gi'), checkAfter: true, checkBefore: true },
  // "i'm a minor", "im underage"
  { label: 'says under 18', re: /\b(?:i'?m|i\s+am)\s+(?:a\s+|still\s+a\s+|still\s+)?(?:minor|underage|under\s*age|under\s+18)\b/gi },
  // Spanish pages: "tengo 16 (años)", "soy menor (de edad)"
  { label: 'says under 18', re: /\btengo\s+(?:solo\s+)?1[0-7](?:\s*a[ñn]os\b|(?=\s*(?:$|[.!?,]|y\b)))/gi },
  { label: 'says under 18', re: /\bsoy\s+menor(?:\s+de\s+edad)?\b/gi },
  // school signals
  { label: 'school grade', re: /\b(?:i'?m|i\s+am|still)\s+(?:still\s+|only\s+)?(?:in|at|a\s+\w+\s+in)\s+(?:high\s*school|middle\s+school|junior\s+high|hs)\b/gi },
  { label: 'school grade', re: /\b(?:9th|10th|11th|ninth|tenth|eleventh)\s+(?:grade|grader)s?\b/gi, checkBefore: true },
  { label: 'school grade', re: /\b(?:freshman|sophomore|junior)\s+(?:year\s+)?(?:in|of|at)\s+(?:high\s*school|hs)\b|\b(?:high\s*school|hs)\s+(?:freshman|sophomore|junior)\b/gi, checkBefore: true },
];

/** First under-18 age / school signal in a fan message: the matched phrase, or null. */
function matchAge(text) {
  const t = clean(text);
  if (!t) return null;
  for (const p of AGE_PATTERNS) {
    for (const m of t.matchAll(p.re)) {
      const after = t.slice(m.index + m[0].length);
      const before = t.slice(0, m.index);
      if (p.checkAfter && (NOT_AGE_AFTER.test(after) || YEARS_NOT_OLD.test(after))) continue;
      if (p.checkBefore && !SELF_BEFORE.test(before)
        && (PAST_BEFORE.test(before) || OTHER_BEFORE.test(before) || OTHER_AFTER.test(after))) continue;
      return m[0].toLowerCase();
    }
  }
  return null;
}

module.exports = { matchOffPlatform, matchAge, knownPlatforms, clean };
