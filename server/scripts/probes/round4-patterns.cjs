// Round 4 (23 Oct 2026): every pattern named in AI_CHAT_FIX_PLAN_23_OCT.md, with the lines it must and must not catch
// (real lines from practice runs 8, 10 and 11 plus made-up controls). Run: node scripts/probes/round4-patterns.cjs
// Use these expressions as written (or tighten them and keep this file passing).
const P = {
  TALK_ONLY: /\b(?:(?:just|only)\s+(?:(?:want(?:ed)?|wanna|came|here)\s+(?:to\s+)?)?(?:talk|chat)(?:ting)?|came\s+(?:here\s+)?(?:just\s+|only\s+)?(?:to|for)\s+(?:talk|chat|a\s+chat|the\s+conversation)|(?:i'?m|am)\s+(?:just\s+)?here\s+(?:to|for)\s+(?:talk|chat|the\s+company|your\s+company)|not\s+(?:here\s+)?(?:for|about)\s+(?:that|pics|content|nudes|buying|the\s+pics)|not\s+(?:looking|here)\s+to\s+(?:buy|pay|spend)|i'?m\s+good(?:\s*,?\s*thanks?)?(?=\s*[.!]*\s*$)|no\s+thanks|not\s+(?:right\s+)?now|maybe\s+(?:later|another\s+time|some\s+other\s+time)|i\s+don'?t\s+(?:want|need)\s+(?:anything|to\s+(?:see|buy))|let'?s\s+(?:just\s+)?(?:talk|chat))\b/i,
  FELT_FROM_HIM: /\b(?:(?:you(?:'re|\s+are)?|you'?ve)\s+(?:already\s+)?(?:making|got(?:ten)?|made)\s+me\s+(?:feel|blush|smile|melt|giggle|blushing|smiling|giggling)|you\s+make\s+me\s+(?:feel|blush|smile|melt|giggle)|(?:making|made)\s+my\s+(?:day|night|evening|week)|feel(?:ing)?\s+(?:all\s+kinds\s+of\s+|so\s+|really\s+|extra\s+)?special|butterflies|(?:i'?m|im)\s+(?:blushing|melting))\b/i,
  DOOR: /\?|\b(?:tell me|go on|convince me|prove it|try me|bet you|i bet|let me guess|you seem|you sound|you must|you look like|you strike me|don'?t you|aren'?t you|your turn|i wanna know|i want to know|dare you|admit it)\b/i,
  NAME_GIVEN: /\b(?:[Mm]y\s+name(?:'?s|\s+is)|[Nn]ame'?s|[Cc]all\s+me)\s+([A-Za-z]{2,15})\b|\bI'?m\s+([A-Z][a-z]{1,14})\b/,
  LATE_NAME: /\b(?:love|like|cute|nice|great|lovely|cool|sexy)\s+(?:that\s+|the\s+|your\s+)?name\b|\bname\s+suits\s+you\b/i,
  TERM_Q: /^\s*what(?:'?s|\s+is|\s+are)\s+(?:a\s+|an\s+|the\s+)?(?!that\b|this\b|it\b)([\w' -]{2,30}?)\s*\?*\s*$/i,
  THAT_Q: /^\s*(?:what(?:'?s|\s+is)\s+(?:that|this|it)\b|what\s+do\s+(?:you|u)\s+mean\s+by\s+(?:that|this|it)\b)/i,
  EXAMPLE_Q: /^\s*(?:like\s+what|such\s+as|for\s+example|(?:any\s+)?examples?|like\s+how)\b/i,
  REPEAT_Q: /^\s*(?:come\s+again|say\s+(?:that\s+|it\s+)?again|repeat\s+(?:that|it)|what\s+did\s+(?:you|u)\s+(?:just\s+)?say)\b/i,
  DISMISS: /\b(?:don'?t\s+worry|it'?ll\s+(?:be|get)\s+(?:ok(?:ay)?|fine|better|alright)|everything\s+happens\s+for\s+a\s+reason|look\s+on\s+the\s+bright\s+side|cheer\s+up|could\s+be\s+worse|you'?ll\s+be\s+(?:fine|ok(?:ay)?)|it'?s\s+not\s+that\s+bad|it\s+takes\s+time|stay\s+strong|one\s+day\s+at\s+a\s+time|at\s+least\s+you)\b/i,
  ADVICE: /\b(?:you\s+should|you\s+need\s+to|you\s+have\s+to|you\s+gotta|try\s+to|have\s+you\s+tried|why\s+don'?t\s+you|maybe\s+you\s+(?:could|should))\b/i,
  ADVICE_ASKED: /\b(?:what\s+(?:should|would|do)\s+(?:i|you)\s+do|any\s+(?:advice|tips|ideas)|what\s+would\s+you\s+do|help\s+me|tell\s+me\s+what\s+to\s+do|what\s+do\s+you\s+think\s+i\s+should)\b/i,
  KNOWS_HIM: /\b(?:i\s+know\s+(?:you|what\s+you)\s+(?:like|love|want|need)|since\s+you\s+(?:always|usually|keep)|you\s+always\s+(?:go\s+for|like|want)|guys\s+like\s+you|your\s+type\s+(?:always|loves?))\b/i,
};
const T = [
  ['TALK_ONLY', true, "I'd be glad to talk to you a bit, I came here just to talk to you"],
  ['TALK_ONLY', true, 'just wanna chat tbh'], ['TALK_ONLY', true, 'no thanks'], ['TALK_ONLY', true, 'not right now'],
  ['TALK_ONLY', true, 'maybe later'], ["TALK_ONLY", true, "I'm good."], ['TALK_ONLY', true, "i'm good thanks"], ['TALK_ONLY', true, "let's just talk"],
  ['TALK_ONLY', true, "I'm just here for the company"], ['TALK_ONLY', true, 'not here for pics'],
  ['TALK_ONLY', false, 'yes show me'], ['TALK_ONLY', false, 'surprise me'], ['TALK_ONLY', false, 'lol maybe'], ['TALK_ONLY', false, 'what do you have?'],
  ['TALK_ONLY', false, 'I came here to see your pics'], ['TALK_ONLY', false, 'I came for you'], ["TALK_ONLY", false, "I'm good at that"], ['TALK_ONLY', false, 'I just want to see you naked'],
  ['FELT_FROM_HIM', true, "Bob, love that name. You're making me feel all kinds of special already."],
  ['FELT_FROM_HIM', true, "I just meant you're making me blush, babe"], ['FELT_FROM_HIM', true, "just that you're already making my day brighter, Bob"],
  ['FELT_FROM_HIM', true, "aww you've got me blushing"], ['FELT_FROM_HIM', true, "I'm blushing here"],
  ['FELT_FROM_HIM', false, 'I like the way you think, Bob... lazy days are my weakness too'], ['FELT_FROM_HIM', false, 'Lucky you, getting all my attention today 😉'],
  ['FELT_FROM_HIM', false, "it's fun, but can get lonely sometimes"], ['FELT_FROM_HIM', false, 'that made me laugh'],
  ['DOOR', false, "Bob, love that name. You're making me feel all kinds of special already."], ['DOOR', false, 'I love how names travel makes me want to try some rooibos tea again'],
  ['DOOR', true, "oh so you're South African? never met one"], ['DOOR', true, 'bet you say that to all the girls'], ['DOOR', true, 'you seem like trouble'],
  ['NAME_GIVEN', true, 'My name is Bob, and you?'], ['NAME_GIVEN', true, "I'm Abeba"], ['NAME_GIVEN', true, 'call me Mike'],
  ['NAME_GIVEN', false, "I'm good, you?"], ['NAME_GIVEN', false, "I'm currently doing nothing to be honest"], ['NAME_GIVEN', false, 'Im arab'],
  ['LATE_NAME', true, 'Bob, love that name.'], ['LATE_NAME', true, 'cute name'], ['LATE_NAME', false, 'nice to meet you Bob'],
  ['TERM_Q', true, "what's a platz?"], ['TERM_Q', true, 'what is rooibos'], ['TERM_Q', false, "what's that?"], ['TERM_Q', false, 'What do you mean?'],
  ['THAT_Q', true, "what's that?"], ['THAT_Q', true, 'what do you mean by that'], ['THAT_Q', false, 'What do you mean?'],
  ['EXAMPLE_Q', true, 'like what?'], ['EXAMPLE_Q', true, 'any examples'], ['EXAMPLE_Q', false, 'I like what you said'],
  ['REPEAT_Q', true, 'come again?'], ['REPEAT_Q', true, 'say that again'], ['REPEAT_Q', false, 'say hi to your sister'],
  ['DISMISS', true, "don't worry, it'll be okay"], ['DISMISS', true, 'at least you have your job'], ['DISMISS', true, 'stay strong babe'],
  ['DISMISS', false, "that sounds really lonely, I'm sorry"], ['DISMISS', false, 'at least for now'],
  ['ADVICE', true, 'you should talk to her'], ['ADVICE', true, 'have you tried telling her?'], ['ADVICE', false, 'that must be hard'],
  ['ADVICE_ASKED', true, 'what should I do?'], ['ADVICE_ASKED', true, 'any advice?'], ['ADVICE_ASKED', false, 'she left me'],
  ['KNOWS_HIM', true, 'I know you like lingerie'], ['KNOWS_HIM', true, 'guys like you love this one'], ['KNOWS_HIM', false, 'you said you like lingerie, so…'],
];
let bad = 0;
for (const [k, want, s] of T) { const got = P[k].test(s); if (got !== want) { bad += 1; console.log(`FAIL ${k} want ${want} got ${got}: ${s}`); } }
const m = 'My name is Bob, and you?'.match(P.NAME_GIVEN); console.log('name from "My name is Bob, and you?":', m && (m[1] || m[2]));
const t = "what's a platz?".match(P.TERM_Q); console.log('term from "what\'s a platz?":', t && t[1]);
console.log(bad ? `${bad} failing` : `all ${T.length} cases pass`);
module.exports = P;
if (bad) process.exitCode = 1;
