// Round 4 (23 Oct 2026): every pattern named in AI_CHAT_FIX_PLAN_23_OCT.md, with the lines it must and must not catch
// (real lines from practice runs 8, 10 and 11 plus made-up controls). Run: node scripts/probes/round4-patterns.cjs
// Use these expressions as written (or tighten them and keep this file passing).
const P = {
  TALK_ONLY: /\b(?:(?:just|only)\s+(?:(?:want(?:ed)?|wanna|came|here)\s+(?:to\s+)?)?(?:talk|chat)(?:ting)?|came\s+(?:here\s+)?(?:just\s+|only\s+)?(?:to|for)\s+(?:talk|chat|a\s+chat|the\s+conversation)|(?:i'?m|am)\s+(?:just\s+)?here\s+(?:to|for)\s+(?:talk|chat|the\s+company|your\s+company)|not\s+(?:here\s+)?(?:for|about)\s+(?:that|pics|content|nudes|buying|the\s+pics)|not\s+(?:looking|here)\s+to\s+(?:buy|pay|spend)|i'?m\s+good(?:\s*,?\s*thanks?)?(?=\s*[.!]*\s*$)|no\s+thanks|not\s+(?:right\s+)?now|maybe\s+(?:later|another\s+time|some\s+other\s+time)|i\s+don'?t\s+(?:want|need)\s+(?:anything|to\s+(?:see|buy))|let'?s\s+(?:just\s+)?(?:talk|chat))\b/i,
  FELT_FROM_HIM: /\b(?:(?:you(?:'re|\s+are)?|you'?ve)\s+(?:already\s+)?(?:making|got(?:ten)?|made)\s+me\s+(?:feel|blush|smile|melt|giggle|blushing|smiling|giggling)|you\s+make\s+me\s+(?:feel|blush|smile|melt|giggle)|(?:making|made)\s+my\s+(?:day|night|evening|week|morning|afternoon)|feel(?:ing)?\s+(?:all\s+kinds\s+of\s+|so\s+|really\s+|extra\s+)?special|butterflies|(?:i'?m|im)\s+(?:blushing|melting))\b/i,
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
  CORRECTS: /^\W*(?:no,?\s*)?[A-Z][\w' -]{1,30}?,?\s+not\s+[\w' -]{1,30}\W*$|\b(?:^\W*(?:no,?\s*)?i\s+(?:said|told\s+you)\s+(?!what\b|so\b)|you\s+(?:got|have)\s+(?:it|that|my\s+\w+)\s+wrong|wrong\s+(?:day|name|city|town|place|number|one)|^\W*(?:no|nope|nah),?\s+(?:it'?s|its|it\s+was|i'?m|im|he'?s|she'?s|my|the)\b|^\W*actually,?\s+(?:it'?s|its|i|my|he|she|the|that)\b)/i,
  HURT: /^(?!\W*(?:ha+h?a*|lol|lmao)\b)[\s\S]*?\b(?:that\s+(?:was|is|felt)\s+(?:mean|rude|harsh|hurtful|uncalled\s+for|not\s+(?:cool|nice|funny|ok(?:ay)?))|that\s+(?:actually\s+)?hurt|that\s+stung|not\s+cool|not\s+funny|that'?s\s+(?:mean|harsh|rude|hurtful)|why\s+would\s+you\s+say\s+that|low\s+blow|dont\s+(?:say|talk)\s+(?:that|to\s+me)\s+like\s+that|don'?t\s+(?:say|talk)\s+(?:that|to\s+me)\s+like\s+that)\b/i,
  BIG_CHANGE: /\b(?:i\s+(?:finally\s+|just\s+)?(?:quit(?!\s+(?:smoking|drinking|vaping|sugar|coffee|caffeine|alcohol|gaming|the\s+gym))|resigned|got\s+fired|got\s+laid\s+off|broke\s+up|got\s+divorced|moved\s+out|moved\s+to|got\s+promoted|got\s+the\s+job|retired|signed\s+the|sold\s+the\s+house|proposed|got\s+engaged|got\s+married|became\s+a\s+dad|dropped\s+out)|she\s+left|he\s+left|we\s+split|it'?s\s+over\s+with|i'?m\s+done\s+with)\b/i,
  CONTRAST: /\b(?:but|though|although|except|apart\s+from|the\s+only\s+(?:thing|problem|downside|catch)|on\s+the\s+other\s+hand|however|still,|shame\s+that|just\s+wish)\b/i,
  DISTRACT: /\b(?:distract\s+me|cheer\s+me\s+up|make\s+me\s+laugh|take\s+my\s+mind\s+off|tell\s+me\s+something\s+(?:fun|funny|good|nice|random|happy)|something\s+to\s+cheer\s+me\s+up|need\s+a\s+laugh|lighten\s+(?:things|it|the\s+mood)\s+up|talk\s+about\s+(?:something|anything)\s+else)\b/i,
  BARE_PICK: /^\W*(?:(?:ok(?:ay)?|yes|yeah|sure),?\s*)?(?:i'?ll\s+(?:take|get|buy|have|go\s+with)|send\s+me|i\s+want|give\s+me|let'?s\s+do|do)\s+(?:that|this|it|that\s+one|this\s+one|the\s+(?:first|second|other|last)\s+one|those)\W*$|^\W*(?:that|this)\s+one\W*$/i,
  TEASING_LINE: /\b(?:(?:just|only)\s+(?:teasing|joking|kidding|playing)|was\s+teasing|i\s+was\s+joking|lighten\s+up|relax|chill|can'?t\s+take\s+a\s+joke|don'?t\s+take\s+it\s+(?:so\s+)?(?:seriously|personally))\b/i,
  ASSUMES_FEELING: /\b(?:you\s+must\s+(?:be|feel)|bet\s+you(?:'re|\s+are|\s+feel)|i\s+bet\s+(?:you'?re|that'?s)|you'?re\s+probably|that\s+must\s+(?:be|feel)|must\s+be)\s+(?:so\s+|really\s+|a\s+bit\s+|pretty\s+|such\s+a\s+)?(?:relieved|relief|thrilled|excited|happy|gutted|devastated|scared|terrified|nervous|free|over\s+the\s+moon|heartbroken|crushed|glad|sad|stressed|exhausting|exciting|scary|a\s+relief)\b/i,
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
  ['FELT_FROM_HIM', true, "aww you've got me blushing"], ['FELT_FROM_HIM', true, 'Just that you made my morning brighter, Bob'], ['FELT_FROM_HIM', true, "I'm blushing here"],
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
  ['CORRECTS', true, 'Thursday, not Tuesday'], ['CORRECTS', true, 'no, I said Thursday'], ['CORRECTS', true, "nah it's Leeds, not Leicester"], ['CORRECTS', true, 'you got my name wrong lol'], ['CORRECTS', true, "actually it's my sister, not my mum"],
  ['CORRECTS', false, 'not really my thing'], ['CORRECTS', false, 'What do you mean?'], ['CORRECTS', false, 'I meant what I said about you ;)'], ['CORRECTS', false, 'Not bad, you?'],
  ['HURT', true, 'that was mean'], ['HURT', true, 'that actually hurt tbh'], ['HURT', true, 'not cool'], ['HURT', true, "why would you say that"], ['HURT', false, 'Why finally? I just subscribed'], ['HURT', false, 'haha not funny but ok'],
  ['BIG_CHANGE', true, 'I finally quit that job'], ['BIG_CHANGE', true, 'she left last week'], ['BIG_CHANGE', true, 'I got the job!!'], ['BIG_CHANGE', false, 'I quit smoking lol'], ['BIG_CHANGE', false, 'work was long today'],
  ['CONTRAST', true, 'The interview went well, but the commute would be awful'], ['CONTRAST', true, 'nice place, the only problem is the rent'], ['CONTRAST', false, 'The interview went well'],
  ['DISTRACT', true, "It's been a rough day. Please distract me"], ['DISTRACT', true, 'cheer me up'], ['DISTRACT', true, "can we talk about something else"], ['DISTRACT', false, 'distracted all day at work'],
  ['BARE_PICK', true, "I'll take that one"], ['BARE_PICK', true, 'ok send me that'], ['BARE_PICK', true, 'that one'], ['BARE_PICK', false, "I'll take the blue one"], ['BARE_PICK', false, 'send me the video'],
  ['TEASING_LINE', true, 'relax, I was just teasing'], ['TEASING_LINE', true, "can't take a joke?"], ['TEASING_LINE', false, 'that came out wrong, I didn\'t mean it like that'],
  ['ASSUMES_FEELING', true, 'you must be so relieved'], ['ASSUMES_FEELING', true, 'bet you\'re thrilled'], ['ASSUMES_FEELING', false, 'how are you feeling about it?'],
  ['KNOWS_HIM', true, 'I know you like lingerie'], ['KNOWS_HIM', true, 'guys like you love this one'], ['KNOWS_HIM', false, 'you said you like lingerie, so…'],
];
let bad = 0;
for (const [k, want, s] of T) { const got = P[k].test(s); if (got !== want) { bad += 1; console.log(`FAIL ${k} want ${want} got ${got}: ${s}`); } }
const m = 'My name is Bob, and you?'.match(P.NAME_GIVEN); console.log('name from "My name is Bob, and you?":', m && (m[1] || m[2]));
const t = "what's a platz?".match(P.TERM_Q); console.log('term from "what\'s a platz?":', t && t[1]);
console.log(bad ? `${bad} failing` : `all ${T.length} cases pass`);
module.exports = P;
if (bad) process.exitCode = 1;
