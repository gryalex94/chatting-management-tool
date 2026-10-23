/**
 * The deciding layer (Practice first): who he is, and the plan for her next reply,
 * decided in code from your answers in AI_CHAT_RULES_QUESTIONS.md (the Q numbers)
 * and the agency's 35k analysed chats, each decision with its reason. The writer
 * only turns the plan into her words; the decision map shows every decision.
 *  - fanProfile: his tier (scaled by the page's size), new subscriber or not, time
 *    waster, suspicious, how close they are (memory.js), his talk budget.
 *  - planReply: the goal of this reply (goodbyes and "welcome back" too), whether
 *    she may sell or ask, how long, her tone, a note of his to bring up, a check
 *    when he contradicts a note, the story move, the PPV to offer.
 *  - planText: the plan as the writer reads it.
 * Pure (no database, no network).
 */
const { replyLevel, FELT_FROM_HIM, DECLARED, COMPLIMENT: HER_COMPLIMENT } = require('./safety');
const { closenessOf, CLOSENESS, TONE, likesFor, awayText } = require('./memory');
const { eventFits, WANTS_TO_BUY } = require('./session');
const { seenText } = require('./notes');
const { ASKS_ABOUT_PPV } = require('./content');
const Sl = require('./selling');
const G = require('./gauges');

const clean = (s) => String(s ?? '').trim();
const DAY = 86400_000;
const LEVEL_WORD = ['friendly', 'flirty', 'suggestive', 'explicit'];
// the stance the reader suggests (step 2), as the writer reads it
const STANCE_TEXT = {
  steady: 'steady and warm', curious: 'curious: you want to know more before anything else', playful: 'playful: tease it, don\'t take it too seriously',
  match: 'match him: he set the tone, go with it', deflect: 'deflect lightly: don\'t take the bait, move it somewhere better', comfort: 'gentle: he needs care more than fun', firm: 'firm but kind: a clear boundary, no lecture',
};
// the beats of a reply (engine v2, step 4): what it does, in order, like a person's message (one to three things)
const BEATS = {
  welcome_new: ['welcome him, glad he found you', 'react to what he wrote', 'one question: what brought him here or what he is into'],
  curious: ['react to what he just said', 'one real question about it'],
  share: ['react to his exact words (name the detail he gave)', 'a small real thing of yours that matches what he just said (same topic): a small fail, a clumsy or shy moment rather than a complaint or a brag; a person in it when it fits'],
  chat: ['react to what he said with real interest'],
  get_to_know: ['react to what he said', 'one easy question about him'],
  flirt: ['react to what he said', 'a playful compliment or a light tease'],
  sexy_vibe: ['react, in a suggestive vibe', 'hint and tease; ask for nothing'],
  tease: ['say yes playfully', 'tease: hint, don\'t describe yet'],
  lead_story: ['the next story move: what you do now', 'tease him into the next'],
  direct_ask: ['one playful line', 'the one question: what he would like to see of you, or whether he is alone and wants to see something'],
  first_offer: ['say yes, tease what you have', 'attach the piece, with a teasing caption'],
  offer: ['say yes, tease what you have', 'attach the piece, in your own words'],
  steer_to_sale: ['react to what he said', 'steer lightly toward what you have'],
  readiness_check: ['tease what you have', 'the one question: is he alone, is he ready'],
  comfort: ['name what he feels, in his words, and that it makes sense', 'one open question that invites him to say more (not "are you ok?"); no story of yours, no advice he didn\'t ask for'],
  reassure: ['take it lightly', 'reassure him it is really you, in your style'],
  calm: ['stay calm and warm', 'move on to something easier'],
  ease_off: ['ease off: back to normal, friendly talk'],
  after_buy: ['react to his buy', 'keep the mood going; tease the next step if he is warm'],
  goodbye: ['say goodbye warmly', 'a hook for next time'],
  dry_ask: ['one real question, or a concrete topic of yours'],
  dry_bye: ['a short, warm sign-off'],
  wind_down: ['react to what he said', 'wrap up warmly: you have to go soon'],
  answer_ppv: ['answer what he asked about the PPV, truthfully', 'tease it'],
  point_to_ppv: ['point him to the PPV waiting for him, playfully'],
  cheaper: ['take the objection lightly', 'one cheaper piece, attached'],
  why_not: ['no pressure', 'one easy question: why he passed'],
  welcome_back: ['show you are glad he is back', 'pick up, call back, or a fresh opener'],
  follow_up: ['one short, light message to get him talking again'],
  honest_no: ['say plainly you don\'t have that exactly', 'ask what exactly he\'d want, or offer the closest'],
  custom_content: ['curious and open about what he wants', 'promise nothing'],
  no_freebies: ['friendly but short', 'nothing for free'],
  roleplay: ['play your part in the scene, one step on', 'keep him in it'],
};
// a second beat from the runner-up move, when it fits with the first (never two questions, never a tease with comfort)
const RUNNER_BEAT = { share: 'a small real thing of yours that matches what he just said (same topic), after reacting to his words', flirt: 'a light flirt', tease: 'a tease, hinting', curious: 'one question about what he said', get_to_know: 'one easy question about him', react: null, offer: null, steer: null, readiness_check: null, comfort: null, reassure: null };
function beatsFor(p) {
  const base = [...(BEATS[p.goal] || ['react to what he said'])];
  if (p.goal === 'curious' && p.reading?.curious) base[1] = `one real question about it: "${p.reading.curious}"`;
  const asksAlready = /question/.test(base.join(' '));
  const best = p.scores?.find(x => x.allowed) || null;
  const runner = p.scores?.filter(x => x.allowed && x.move !== best?.move)[0] || null;
  if (best && runner && RUNNER_BEAT[runner.move] && runner.score >= best.score * 0.75 && base.length < 3
    && !(asksAlready && /question/.test(RUNNER_BEAT[runner.move])) && !(['comfort', 'reassure'].includes(p.goal) && /tease|flirt/.test(RUNNER_BEAT[runner.move]))) base.push(RUNNER_BEAT[runner.move]);
  if (p.correction) base.unshift('he corrected you: accept it and say the corrected thing once ("Thursday, right, my bad"), no apology spiral, then carry on with the corrected fact');
  else if (p.repair && p.repair_kind === 'hurt') base.unshift('he says your line hurt: name the specific thing you said and own it plainly ("that came out wrong, I didn\'t mean it like that"); never "I was teasing", never "relax"; then ease off');
  else if (p.repair) base.unshift('own what you said lightly in one line ("ha, fair, I was teasing"): no excuse, no explaining, then on');
  else if (p.clarify && p.clarify_kind === 'overclaim') base.unshift('take your last line down a notch in plain words: no apology, don\'t say it again');
  else if (p.clarify && p.clarify_kind === 'term') base.unshift(`say what "${p.clarify_term}" means, in plain words`);
  else if (p.clarify && p.clarify_kind === 'example') base.unshift('give one concrete example');
  else if (p.clarify && p.clarify_kind === 'repeat') base.unshift('say your last line again, the same words');
  else if (p.clarify) base.unshift('say again what you meant, in plainer words; no question back unless your line was a question');
  else if (p.answer_first) base.unshift('answer his question plainly, in one line');
  // J4: a mixed message: the react beat covers both halves
  if (p.contrast && !p.answer_first) { const i = base.findIndex(b => /^react/.test(b)); if (i >= 0) base[i] = 'respond to both halves of what he said: the good part and the catch, not only one'; }
  // J5: a distraction he asked for
  if (p.goal === 'distract') base.splice(0, base.length, 'one light topic or a playful question, nothing about the rough day', 'no probing into how he feels');
  // round 4, F4: he closed the topic with a pleasantry: she leads with something new instead of reacting to it
  if (p.closing && !p.answer_first && !p.clarify && !p.repair && ['chat', 'get_to_know', 'curious', 'share', 'flirt'].includes(p.goal)) base.splice(0, base.length, 'a short warm acknowledgement, or none', 'lead: one easy question about him, or a small thing of yours that opens a new topic');
  // he just gave his name: she says it back warmly in this reply
  if (p.name_given) base.splice(p.answer_first || p.clarify || p.repair ? 1 : 0, 0, `say his name back warmly ("nice to meet you, ${p.name_given}")`);
  if (p.complimented && !/compliment/.test(base.join(' '))) base.splice(p.repair || p.answer_first ? 1 : 0, 0, 'receive his compliment warmly: thank him in your way, playful and specific; no deflecting, no "I get that a lot"');
  // round 4, G3: her share always rides on a reaction to his words, never first
  if (/thing of yours/.test(base[0] || '')) base.unshift('react to his exact words first (name the detail he gave)');
  // the floor of the question band: she has asked little lately, and this reply has room for one follow-up
  if (p.ask?.allowed && /would be good now/.test(p.ask.why) && !/question/.test(base.join(' ')) && ['chat', 'flirt', 'share'].includes(p.goal) && base.length < 3) base.push('one follow-up question about what he just said');
  return base.slice(0, 3);
}
// Kinds of getting-to-know question: asking one of a kind she just asked, in other words, is asking it twice
// ("what brought you here?" then "what made you stop by my page?").
const QUESTION_KINDS = [
  /\b(?:what|who)\b[^?]{0,25}\b(?:brought|brings|made|makes|got|led|drew)\b[^?]{0,25}\b(?:here|by|over|page|way|me|subscribe|stop|come|say hi|find|curious|join)|\bhow did (?:you|u) find me\b|\bwhat brings (?:you|u)\b/i,
  /\bwhat'?s your name\b|\bwhat (?:do|should) i call you\b|\bwho am i talking to\b/i,
  /\bwhere (?:are|r) (?:you|u) from\b|\bwhere (?:do|d'?you) (?:you|u) live\b/i,   // ("what part?" after it is a follow-up, not a repeat)
  /\bhow'?s (?:your|ur) (?:day|night|evening|morning|week)\b|\bhow (?:is|was) (?:your|ur) (?:day|night|evening|week)\b|\bhow are (?:you|u)(?: doing)?\b/i,
  /\bwhat (?:do|d'?you) (?:you|u) do for fun\b|\bwhat are (?:you|u) into\b|\bwhat do (?:you|u) like to do\b|\bany hobbies\b/i,
  /\bwhat do (?:you|u) do\b(?! for fun)|\bwhat'?s your job\b|\bwhat do (?:you|u) do for (?:work|a living)\b/i,
];
const kindOf = (t) => QUESTION_KINDS.findIndex(re => re.test(String(t || '')));
const sameKind = (q, before) => { const k = kindOf(q); return k >= 0 && String(before || '').split(/(?<=\?)/).some(x => /\?/.test(x) && kindOf(x) === k); };
// words that don't make a topic (a question on a dead topic is one that shares any other word with it)
const TOPIC_STOP = new Set('what whats when where which while your yours have been like just that this with about today really doing going there them they then than something anything right know think want would could should kind sort much more some very well okay yeah also into from over only even still make made making does dont tell guess babe baby thing'.split(' '));
const topicWords = (t) => (String(t || '').toLowerCase().match(/[a-z]{4,}/g) || []).map(w => w.replace(/s$/, '')).filter(w => w.length >= 4 && !TOPIC_STOP.has(w));
// how alike two short texts are (the questions she already asked): shared words over the longer one
const overlap = (a, b) => {
  const w = (t) => new Set(String(t || '').toLowerCase().match(/[\p{L}\p{N}']{3,}/gu) || []);
  const x = w(a), y = w(b);
  if (!x.size || !y.size) return 0;
  let k = 0;
  for (const t of x) if (y.has(t)) k += 1;
  return k / Math.max(x.size, y.size);
};

// Spender tiers as in the 35k analysis (spent on PPVs and tips in 90 days), halved
// for small pages (under $2,000 a month): Q17, Q17b.
const TIER_BARS = { whale: 500, spender: 100 };
const SMALL_PAGE = 2000;
const TIER_LABEL = { new: 'New subscriber', none: 'No spend in 90 days', small: 'Small buyer', spender: 'Spender', whale: 'Whale', tw: 'Time waster' };
// Free small talk before she moves toward a sale, in her messages since his last
// purchase (Q26b; starting points, to be calibrated). Sexting doesn't count (Q27).
const BUDGET = { whale: 20, new: 15, spender: 15, small: 10, none: 8, tw: 5 };
// doubt that she is real (Q24c); "are you a real man / the real deal" is mockery or praise, not doubt (fix 2)
const SUSPICIOUS = /\b(?:(?:are|r)\s+(?:you|u)\s+(?:even\s+)?(?:an?\s+)?(?:real(?!\s+(?:man|woman|one|deal|friend|leader|king|guy|girl|chad|boss))|bot|robot|fake|ai|human|a\s+scam|scamming|chat\s*bot|chatgpt)|is\s+(?:this|it)\s+(?:really\s+)?(?:you|real|a\s+bot|an\s+ai|fake|a\s+scam)|scam\w*|catfish\w*|chat\s*bot|chatgpt|fake\s+(?:account|profile|pics?)|not\s+really\s+(?:you|her)|who\s+am\s+i\s+(?:really\s+)?talking\s+to)\b/i;
// he asked her something directly (fix 4): a question mark, or a question word up front
// round 4, group J (from Brooks's Talk via Codex's playbook): a correction, reported hurt, a big change with no feeling, a mixed
// message, a request for distraction, a bare reference to one of two pieces (scripts/probes/round4-patterns.cjs)
const CORRECTS = /^\W*(?:no,?\s*)?[A-Z][\w' -]{1,30}?,?\s+not\s+[\w' -]{1,30}\W*$|\b(?:^\W*(?:no,?\s*)?i\s+(?:said|told\s+you)\s+(?!what\b|so\b)|you\s+(?:got|have)\s+(?:it|that|my\s+\w+)\s+wrong|wrong\s+(?:day|name|city|town|place|number|one)|^\W*(?:no|nope|nah),?\s+(?:it'?s|its|it\s+was|i'?m|im|he'?s|she'?s|my|the)\b|^\W*actually,?\s+(?:it'?s|its|i|my|he|she|the|that)\b)/i;
const HURT = /^(?!\W*(?:ha+h?a*|lol|lmao)\b)[\s\S]*?\b(?:that\s+(?:was|is|felt)\s+(?:mean|rude|harsh|hurtful|uncalled\s+for|not\s+(?:cool|nice|funny|ok(?:ay)?))|that\s+(?:actually\s+)?hurt|that\s+stung|not\s+cool|not\s+funny|that'?s\s+(?:mean|harsh|rude|hurtful)|why\s+would\s+you\s+say\s+that|low\s+blow|dont\s+(?:say|talk)\s+(?:that|to\s+me)\s+like\s+that|don'?t\s+(?:say|talk)\s+(?:that|to\s+me)\s+like\s+that)\b/i;
const BIG_CHANGE = /\b(?:i\s+(?:finally\s+|just\s+)?(?:quit(?!\s+(?:smoking|drinking|vaping|sugar|coffee|caffeine|alcohol|gaming|the\s+gym))|resigned|got\s+fired|got\s+laid\s+off|broke\s+up|got\s+divorced|moved\s+out|moved\s+to|got\s+promoted|got\s+the\s+job|retired|signed\s+the|sold\s+the\s+house|proposed|got\s+engaged|got\s+married|became\s+a\s+dad|dropped\s+out)|she\s+left|he\s+left|we\s+split|it'?s\s+over\s+with|i'?m\s+done\s+with)\b/i;
const FEELING_SAID = /\b(?:happy|glad|relieved|relief|excited|sad|gutted|scared|nervous|terrified|devastated|thrilled|stressed|worried|fine|good|great|bad|awful|hurt|angry|pissed|upset|proud|free|lost|numb|weird|strange|okay|ok)\b/i;
const CONTRAST = /\b(?:but|though|although|except|apart\s+from|the\s+only\s+(?:thing|problem|downside|catch)|on\s+the\s+other\s+hand|however|still,|shame\s+that|just\s+wish)\b/i;
const DISTRACT = /\b(?:distract\s+me|cheer\s+me\s+up|make\s+me\s+laugh|take\s+my\s+mind\s+off|tell\s+me\s+something\s+(?:fun|funny|good|nice|random|happy)|something\s+to\s+cheer\s+me\s+up|need\s+a\s+laugh|lighten\s+(?:things|it|the\s+mood)\s+up|talk\s+about\s+(?:something|anything)\s+else)\b/i;
const BARE_PICK = /^\W*(?:(?:ok(?:ay)?|yes|yeah|sure),?\s*)?(?:i'?ll\s+(?:take|get|buy|have|go\s+with)|send\s+me|i\s+want|give\s+me|let'?s\s+do|do)\s+(?:that|this|it|that\s+one|this\s+one|the\s+(?:first|second|other|last)\s+one|those)\W*$|^\W*(?:that|this)\s+one\W*$/i;
const DIRECT_Q = /\?\s*$|\b(?:what|why|how|where|when|who|which)\b[^.!]{0,80}\?/i;
// he pushes back on something she just said ("why finally? I just subscribed"): she owns it lightly, no excuse
// (challenges only: a sincere "why do you like painting?" is a question to answer, and "wow, that's beautiful" is praise)
const PUSHBACK = /^(?:why (?:finally|that|so (?:cold|rude|mean|formal|serious|dry)|would (?:you|u) (?:say|think|assume)|do (?:you|u) (?:say|think|assume|keep saying)|are (?:you|u) (?:being|acting|like that))\b|what'?s that supposed to mean\b|excuse me\b|wow\W*$|wow,? (?:ok(?:ay)?|rude|really|bold|that'?s (?:a bit|bold|rude|forward|presumptuous|not))\b)|\b(?:i just subscribed|who said (?:anything|that|i)|that'?s (?:rude|a bit much|not fair|not what i)|where did that come from|i never said|when did i)\b/i;
// he didn't get her last line: not offended, confused. She says plainly what she meant; no question back
const CONFUSED = /^(?:what do (?:you|u) mean|what\W*$|huh\W*$|wait,? what\W*$|lol what\W*$|what are you (?:talking about|on about)|i don'?t (?:get|understand) (?:it|that|you)|meaning\W*$)/i;
// round 4, G4: the kinds of "I didn't get you" (Moore 2024): a word of hers, "that", an example, a repeat (scripts/probes/round4-patterns.cjs)
const TERM_Q = /^\s*what(?:'?s|\s+is|\s+are)\s+(?:a\s+|an\s+|the\s+)?(?!that\b|this\b|it\b)([\w' -]{2,30}?)\s*\?*\s*$/i;
const THAT_Q = /^\s*(?:what(?:'?s|\s+is)\s+(?:that|this|it)\b|what\s+do\s+(?:you|u)\s+mean\s+by\s+(?:that|this|it)\b)/i;
const EXAMPLE_Q = /^\s*(?:like\s+what|such\s+as|for\s+example|(?:any\s+)?examples?|like\s+how)\b/i;
const REPEAT_Q = /^\s*(?:come\s+again|say\s+(?:that\s+|it\s+)?again|repeat\s+(?:that|it)|what\s+did\s+(?:you|u)\s+(?:just\s+)?say)\b/i;
const escRe = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The kind of repair he asks for, or '' when his message isn't one. `herLast` = her last reply. */
function repairKind(said, herLast = '') {
  const t = String(said || '').trim();
  const term = t.match(TERM_Q);
  if (term && herLast && new RegExp(`\\b${escRe(term[1].trim())}\\b`, 'i').test(herLast)) return 'term';
  if (THAT_Q.test(t)) return 'that';
  if (EXAMPLE_Q.test(t)) return 'example';
  if (REPEAT_Q.test(t)) return 'repeat';
  if (CONFUSED.test(t)) return 'whole';
  return '';
}
// he pays her a compliment, or tells her what drew him: it gets received, never brushed off
// (a positive frame only: "your eyes look tired, are you okay?" is concern, and a negated or critical line is never one)
const NEGATED = /\b(?:don'?t|dont|do not|didn'?t|not|never|can'?t|cannot|hate|stop)\s+(?:really\s+|even\s+|that\s+)?(?:like|love|into|a fan of|care for|feeling)\b|\bnot (?:that|very|so|really|exactly|even) (?:hot|cute|pretty|sexy|beautiful|gorgeous|special|funny|my type)\b|\b(?:ugly|disgusting|gross|fake|photoshopped?|filtered)\b/i;
const COMPLIMENT = /\b(?:you'?re|you are|ur|you look|looking|u look) (?:so |really |very |honestly |just |absolutely |too )?(?:hot|gorgeous|beautiful|pretty|cute|sexy|stunning|amazing|perfect|fine|lovely|adorable|unreal|sweet|a dream|a (?:ten|10)|my type)\b|\b(?:you|u) (?:seem|sound) (?:so |really |very |honestly |just |super |like a )?(?:sweet|kind|nice|lovely|fun|funny|cool|smart|genuine|chill|amazing|awesome|cute|sweet girl|real one|different)\b|\b(?:love|like|adore|obsessed with|into|crazy about|a fan of|digging) (?:your|ur|the way you|how you|that (?:smile|look|dress|outfit|pic)|tall)\b|\byour (?:looks|smile|eyes|body|pics|photos|face|lips|legs|voice|hair|style|energy|vibe) (?:(?:are|is|look|looks) )?(?:so |really |just |absolutely |honestly )?(?:beautiful|gorgeous|pretty|amazing|stunning|cute|nice|perfect|incredible|insane|unreal|fire|killer|lovely|hypnoti\w+|something else|next level|adorable|great)\b|\b(?:beautiful|gorgeous|pretty|amazing|stunning|cute|nice|perfect|incredible|lovely|killer|great|sexy) (?:smile|eyes|body|pics|photos|face|lips|legs|voice|hair|style)\b|\bcouldn'?t resist\b|\bi like you\b|\bcaught my eye\b/i;
const FREE_ASK = /\b(?:for\s+free|free\s+(?:pics?|nudes?|content|stuff|vid\w*|preview|ones?|something|sample)|(?:something|anything)\s+free|send\s+(?:me\s+)?(?:a\s+)?(?:free|preview)|no\s+money|broke)\b/i;
// he's leaving (Q8)
const GOODBYE = /\b(?:good\s*night|good\s*bye|g'?night|nighty?\s*night|gn|nite|gotta\s+(?:go|run|sleep)|got\s+to\s+go|have\s+to\s+(?:go|leave|run)|need\s+to\s+(?:go|sleep|leave)|i'?m\s+(?:off|out|going\s+to\s+(?:bed|sleep))|heading\s+(?:to\s+bed|out|off)|off\s+to\s+(?:bed|sleep|work)|going\s+to\s+(?:bed|sleep)|talk\s+(?:to\s+(?:you|u)\s+)?(?:later|tomorrow|tmrw|soon)|ttyl|bye+|see\s+(?:you|ya|u)\s+(?:later|tomorrow|soon))\b/i;
const DAY_MS = DAY;
// he notices she's up at an odd hour (B6)
const NOTICES_HOUR = /\b(?:up (?:so |this )?late|still (?:up|awake)|don'?t (?:you|u) (?:ever )?sleep|never sleep|why are (?:you|u) (?:up|awake)|what time is it (?:there|for you|where you are)|it'?s (?:like )?\d{1,2} ?(?:am|a\.m\.)|middle of the night|(?:you'?re|ur|u r) always (?:up|on|online|here|awake)|do (?:you|u) ever sleep|no sleep\??|awake at this (?:hour|time)|insomnia)\b/i;

/**
 * Who he is, for this reply. `money` = his spending ({ spent, spent90, paid_messages,
 * msg_spent, last_purchase, standing }), `type` = a made-up fan's type, `chat` = the
 * conversation (oldest first), `ids` = the planner's situations, `mood`, `pageMonthly`
 * = the page's earnings in the last 30 days, `offered` = PPVs she sent in this chat,
 * `card` = his notes, `bond` = how he treats her (his memory's read), `from` = where
 * this conversation starts in `chat` (memory.conversation), `override` = what-if
 * changes ({ tier, closeness, budget }).
 */
function fanProfile({ money = null, type = null, chat = [], ids = [], mood = '', pageMonthly = null, offered = [], card = [], bond = null, from = 0, override = {}, latest = [], now = new Date() }) {
  const small = pageMonthly != null && pageMonthly < SMALL_PAGE;
  const k = small ? 0.5 : 1;
  const spent90 = money?.spent90 ?? 0;
  const his = chat.filter(m => m.from_fan);
  const hisText = his.map(m => clean(m.text)).join('\n');
  // a sale attempt: any PPV she sent him, in his real chat or this practice
  const tried = offered.length > 0 || chat.some(m => !m.from_fan && m.media?.price);
  const standing = money?.standing?.state || null;
  // still "new" until the first sale attempt (Q17): a real subscriber nobody has sold to yet
  const newSub = type?.id === 'new_sub' || standing === 'new' || (!type && standing === 'subscriber' && !(money?.paid_messages) && !tried);
  const newWhy = type?.id === 'new_sub' ? 'his type is new subscriber' : standing === 'new' ? 'he subscribed in the last 7 days'
    : newSub ? 'nobody has tried to sell to him yet, so he\'s still treated as new (Q17)' : '';
  const behaviour = ids.includes('time_waster') || FREE_ASK.test(hisText);
  const timeWaster = type?.id === 'time_waster' || (behaviour && spent90 === 0 && !newSub);
  const twWhy = type?.id === 'time_waster' ? 'his type is time waster'
    : timeWaster ? 'he wants attention or free things and bought nothing in 90 days (Q6e-1)' : '';
  let tier = spent90 >= TIER_BARS.whale * k ? 'whale' : spent90 >= TIER_BARS.spender * k ? 'spender' : spent90 > 0 ? 'small' : 'none';
  if (newSub) tier = 'new';
  if (timeWaster) tier = 'tw';
  if (override.tier && TIER_LABEL[override.tier]) tier = override.tier;
  const bars = `whale $${TIER_BARS.whale * k}+, spender $${TIER_BARS.spender * k}+ in 90 days${small ? ' (halved: a small page)' : ''}`;
  // doubt is a moment, not a state (fix 2): his latest message(s), or the planner's read of them
  const suspicious = SUSPICIOUS.test(latest.join(' ')) || (mood === 'suspicious' && /\b(?:bot|real|fake|scam\w*|ai|catfish\w*|robot|human|chatgpt)\b/i.test(latest.join(' ')));
  // how close they are (Q16): a mix of signals, each with its points (memory.js); what if: as you set it
  const close = closenessOf({ chat, card, tier, bond, now });
  if (override.closeness && CLOSENESS.includes(override.closeness)) Object.assign(close, { level: override.closeness, tone: TONE[override.closeness], what_if: true });
  const closeness = close.level;
  // free small talk in this conversation, since his last purchase (Q26: judged per chat; Q27:
  // sexting doesn't count)
  let since = from - 1;
  chat.forEach((m, i) => { if (i >= from && !m.from_fan && (m.media?.status === 'bought' || m.media?.bought_at)) since = i; });
  const lastBuy = money?.last_purchase ? Date.parse(money.last_purchase) : null;
  const after = chat.slice(since + 1).filter(m => !m.from_fan && !m.mass && (!lastBuy || !m.at || Date.parse(m.at) > lastBuy));
  const used = after.filter(m => replyLevel(m.text) < 2).length;
  const sad = mood === 'sad';
  const limit = Math.round(BUDGET[tier] * (sad && ['small', 'spender', 'whale'].includes(tier) ? 1.5 : 1));
  const budget = { used: override.budget === 'used' ? limit : used, limit };
  return {
    tier, tier_label: TIER_LABEL[tier], tier_why: override.tier ? 'what if' : tier === 'new' ? newWhy : tier === 'tw' ? twWhy : `$${Math.round(spent90)} on PPVs and tips in 90 days (${bars})`,
    small_page: small, new_sub: newSub, time_waster: tier === 'tw', suspicious, closeness, close, budget,
    days_since_buy: lastBuy ? Math.floor((Date.now() - lastBuy) / DAY) : null,
    avg_price: money?.paid_messages ? Math.round((money.msg_spent || 0) / money.paid_messages) : null,
  };
}

const words = (t) => (clean(t).match(/[\p{L}\p{N}']+/gu) || []).length;

// How she says goodbye (Q8, 8a–8d): by who he is and what just happened.
// `again`: he already said he's leaving once in this conversation (her one try is used).
function goodbyeOf({ profile, waiting = null, sexting = null, away = null, herReplies = 0, mood = '', again = false }) {
  if (profile.time_waster) return { kind: 'short', text: 'He\'s leaving: a short, friendly goodbye', why: 'a time waster says goodbye', rules: ['Q8'] };
  if (waiting?.open && !again) return { kind: 'keep_ppv', text: 'He\'s leaving with her PPV still unopened: one playful try to keep him ("you sure you want to miss out on…?"), no pressure; a warm goodbye if he still goes', why: 'he\'s leaving right after her PPV', rules: ['Q8a'] };
  if (sexting?.on && sexting.stage !== 'after' && !again) return { kind: 'mid_sexting', text: 'He\'s leaving in the middle of sexting: one playful push ("you\'re leaving me like this?"), with a hook to come back and finish later', why: 'he\'s leaving before they finished', rules: ['Q8c'] };
  if (away >= 2 * DAY_MS && herReplies <= 3) return { kind: 'stronger_hook', text: 'He came back after a long time and is already leaving: a warm goodbye with a stronger hook ("don\'t disappear on me again…")', why: `he was away ${awayText(away)} and is leaving quickly`, rules: ['Q8b'] };
  if (profile.tier === 'whale') return { kind: 'personal', text: 'A personal goodbye: something you remember about him, "I\'ll be thinking about you", a plan for tomorrow', why: 'a whale is leaving', rules: ['Q8d', 'Q20'] };
  return { kind: 'warm', text: `He's leaving: a warm goodbye with a hook for next time${mood === 'sad' ? ', and a little comfort' : ''}`, why: 'he says he has to go', rules: ['Q8'] };
}

/**
 * The plan for her next reply, with reasons. `herReplies` = her replies in this
 * conversation (since the last long pause), `away` = how long he was gone before
 * it (ms), `lastSexual` = the conversation before ended sexual, `byeAgain` = he
 * already said goodbye once in it, `callback` = a note of his she could bring up
 * (memory.callbackFor), `hook` = a plan of his coming up (memory.hookFor), `check` =
 * a note his latest message contradicts ({ note }), `session` = the plan for this
 * conversation (session.js: aim rapport / sell / read / win_back / get_to_know /
 * first_sale / short), `content` = her content list and `taste` = what he bought and
 * how he took it (selling.tasteOf), `stage` = a new subscriber's first-sale stage
 * (selling.firstSaleStage), `attempts` = PPVs sent { here, today }, `tip` = a tip he
 * just sent that no service took ({ amount }), `creditIds` = story steps his tip
 * pays for, `lastConv` = how the last conversation went (state.last), `rand` = chance (tests).
 * Returns { goal, goal_text, why, sell, ask, length, level, lead, tone, back,
 * opener, callback, touch, hook, check, likes, story, offer, aim, budget, rules }.
 */
function planReply({ herLast = '', level, voice = null, latest = [], followUp = false, sell = false, noOffer = '', waiting = null, match = null, sexting = null, profile, ids = [], card = [], herReplies = 0, gap = null, away = null, lastSexual = false, byeAgain = false, callback = null, hook = null, check = null, session = null, media = [], request = null, services = {}, lastSeen = null, content = [], taste = null, stage = null, attempts = { here: 0, today: 0 }, tip = null, creditIds = [], lastConv = null, first = null, dry = 0, asked = null, reading = null, politics = false, gauges = null, gaugeChanges = [], questions = null, readFailed = false, invited = false, subDays = null, nameGiven = '', confirmPick = null, rand = Math.random }) {
  const said = latest.join(' ');
  const mood = level.mood;
  const p = { rules: [] };
  // he's gone dry (fix 1): three one-word replies in a row; during sexting short answers are normal, so it takes more of them
  const dryNow = sexting?.on ? (dry >= 5 ? dry : 0) : (dry >= 3 ? dry : 0);
  p.dry = dryNow;
  p.first = followUp ? (first || { kind: 'nudge', word: 'a nudge: he went quiet' }) : null;
  // selling (A1–A7, E5): he asks himself, or gets sexual, and the cadence doesn't hold him back
  const asks = !!match?.full?.length || WANTS_TO_BUY.test(said) || !!(tip && match?.full?.length);
  const horny = level.his >= 2 && !level.pulled_back;
  // paid requests and refusals (services.js, D1–D9): what's going on in this conversation
  const pend = session?.pending || null, svc = session?.service || null, rp = session?.roleplay || null;
  const svcAsk = request && services[request.kind] ? request.kind : null;
  p.request = request ? { kind: request.kind, what: request.what } : null;
  // a photo or video he just sent (vision.js): what it showed, or that it couldn't be seen (C4, C5, C9)
  const photo = (media || []).find(s => s.description && !s.flagged) || null;
  const unseen = !photo ? (media || []).find(s => s.failed || !s.description) || null : null;
  p.media = photo ? { text: seenText(photo), kind: photo.kind, sexual: photo.sexual, video: !!photo.video, details: photo.details || [] } : unseen ? { failed: true, video: !!unseen.video } : null;
  // the plan for this conversation (B2): selling day, rapport day… (session.js)
  const aim = session?.aim || 'read';
  p.aim = aim; p.aim_text = session?.aim_text || ''; p.aim_why = session?.why || '';
  // free talk: shorter when today's plan is to sell; no steering on a rapport or win-back day
  const limit = aim === 'sell' ? Math.max(3, Math.ceil(profile.budget.limit * 0.6)) : profile.budget.limit;
  p.budget = { used: profile.budget.used, limit };
  const noSteer = ['rapport', 'win_back', 'get_to_know', 'read', 'first_sale'].includes(aim);
  p.first_sale = stage || null;
  // the reading (step 2): what he is doing, what is new, what it could mean, what she'd want to ask (not twice)
  const askedBefore = (q) => (session?.asked_about || []).some(a => overlap(a, q) >= 0.6);
  // politics, religion, a public figure (fix 5): the non-answer is the answer, nothing to be curious about
  // a joke answer to her question is plain, not a riddle: nothing to puzzle over, no question about what he meant;
  // a dead topic gets no more questions (a fresh one about him is fine)
  // (dead only on his little answers: a man who writes a real message, or hands her the lead, is opening something, not ending it)
  const joke = reading?.answers === 'joke' && !reading?.odd && reading?.doing !== 'testing';   // a harmless joke; a dark one that tests her is odd
  const dead = reading?.thread === 'dead' && !invited && words(said) <= 6 && !/\?/.test(said) && !reading.asked?.length;   // a question from him is never a dead end
  const topic = new Set([...(session?.asked_about || []).slice(-2), said].flatMap(topicWords));
  const freshAsk = (q) => (!dead || !topicWords(q).some(w => topic.has(w))) && !sameKind(q, herLast);   // nor a kind of question she just asked
  p.dead_words = dead ? [...topic] : [];                     // the writer's question is checked against them (aiChat.writeOne)
  p.reading = reading ? {
    doing: reading.doing, new: politics || joke ? '' : reading.new, readings: politics || joke ? [] : reading.readings.filter(r => r.sure < 0.85),
    // (an odd line with nothing she'd ask: a real girl asks lightly what he means)
    curious: reading.curious && !politics && !joke && !askedBefore(reading.curious) && freshAsk(reading.curious) ? reading.curious : reading.odd && !politics && level.his < 2 ? 'What do you mean by that?' : '',
    // (once he is sexual, a sexual line fits; it counts as odd only when he tests or provokes her)
    odd: !!reading.odd && (level.his < 2 || ['testing', 'provoking'].includes(reading.doing)),
    stance: politics ? 'deflect' : joke ? 'playful' : reading.stance, answers: reading.answers || '', thread: dead ? 'dead' : 'alive', wishes: reading.wishes || null,
  } : null;
  // he didn't get her last line ("what do you mean?"): she explains it, no question back (the curious question goes)
  const confusedNow = herReplies > 0 && !followUp && !PUSHBACK.test(said) && (!!repairKind(said, herLast) || (reading?.readings || []).some(r => /\b(?:asks her to explain|didn'?t (?:get|understand) her|misread her line|what she meant)\b/i.test(r.what) && r.sure >= 0.4));
  if (confusedNow && p.reading) p.reading.curious = '';
  const goal = (g, text, why, rules = []) => { p.goal = g; p.goal_text = text; p.why = why; p.rules.push(...rules); };
  const leaving = !followUp && (GOODBYE.test(said) || ids.includes('leaving_soon'));
  const back = !followUp && away >= 2 * DAY_MS && herReplies === 0;

  // the cadence, a pause after a big spend, one attempt a day (E5, A7, A4): unless he asks or gets sexual.
  // What would hold a PPV back if the reply's goal were `g` (the soft slot asks about an offer before choosing it)
  const holdFor = (g) => {
    let hold = '';
    const inStory = !!(sexting?.on && sexting.next) || !!rp?.on;   // her sexting set, or a roleplay he paid for: the cadence doesn't hold her
    const warmNow = level.his >= 1 || ['chatty', 'joking', 'flirty', 'horny', 'romantic', 'curious'].includes(mood);
    const veryHorny = replyLevel(said) >= 3;                   // from his own words, not the planner's read
    // a new subscriber's path (A1): no PPV before the direct ask and his answer, whatever the moment brings
    // round 4, H2: a no to buying holds every sale for the rest of the conversation (lifted when he asks or gets explicit himself)
    if (session?.buy_no && !asks && !veryHorny) hold = 'he signalled no to buying: warm, no pushing this conversation unless he asks';
    // the gate on a planned attempt: the PPV goes once he shows interest (his read says buy +, or he asks); the check or a steer comes first
    else if (aim === 'sell' && !['readiness_check', 'steer_to_sale', 'cheaper', 'after_buy', 'lead_story', 'point_to_ppv', 'answer_ppv'].includes(g) && !asks && !inStory && reading?.wishes && reading.wishes.buy !== '+') hold = 'a planned attempt: the PPV goes once he shows interest; the readiness check or a steer first';
    else if (aim === 'first_sale' && !taste?.bought && ['declined', 'no_ask', 'asked'].includes(stage?.stage) && !(asks && stage.stage !== 'asked')) hold = stage.why;   // round 4, F1/F2
    else if (aim === 'first_sale' && !taste?.bought && !['first_offer', 'offer'].includes(g)) hold = 'a new subscriber: no PPV before the direct ask and his answer (A1)';
    else if (g === 'after_buy') {
      if (!warmNow) hold = 'he\'s cooling off after the buy: no second offer (A4)';
      else if (attempts.here >= 2) hold = 'one more at most after a buy, and it was made (A4)';
      else if (session?.pause && !veryHorny && !asks) hold = session.pause.why;
    } else if (!['offer', 'first_offer', 'cheaper', 'lead_story'].includes(g) || !asks) {
      if (session?.pause && !asks && !veryHorny) hold = session.pause.why;
      else if (aim === 'read' && session?.cadence && !asks && !horny && !inStory) hold = session.cadence.every === 'tw' ? `a time waster, the approach this time: ${session.tw?.text || 'short and sweet'}; nothing offered unless he asks or gets sexual (D2)` : `no planned attempt today (${session.cadence.text} with him; the next in about ${session.cadence.next_in} day${session.cadence.next_in === 1 ? '' : 's'}): a PPV only if he asks or gets sexual (E5)`;
      else if (aim === 'rapport' && !asks && !horny && !inStory) hold = `a rapport day: nothing offered unless he asks or starts it${session?.why ? ` (${session.why})` : ''}`;
      else if ((attempts.here >= 1 || attempts.today >= 1) && !asks && !inStory && g !== 'cheaper') hold = `one selling attempt a day${attempts.here ? ', and it was made this conversation' : ', and one went out today'}: the next tomorrow, unless he asks (A7)`;
    }
    return hold;
  };

  // 1. the goal of this reply
  if (followUp && aim === 'short') goal('follow_up', 'He went quiet, and he\'s a time waster at the bottom: no chasing; if you must write, one dry, friendly line', 'he hasn\'t answered, and he gets no follow-ups (Q19b)', ['Q6e-2', 'Q19b']);
  else if (followUp && p.first?.kind && p.first.kind !== 'nudge') goal('follow_up', p.first.text || 'She writes first', { opener: 'she writes first: a new conversation at his hour (B2)', personal: 'his weekly personal message (B3)', second_try: 'her last opener went unanswered: one more try (B3)' }[p.first.kind] || 'she writes first', ['B2', 'B3']);
  else if (followUp) goal('follow_up', p.first?.text || 'He went quiet: one short, light message to get him talking again', 'he hasn\'t answered (B4)', ['Q6', 'B4']);
  else if (profile.time_waster && FREE_ASK.test(said)) goal('no_freebies', 'Friendly but short: nothing for free; if anything, a small, cheap offer', 'a time waster asking for free things', ['Q19', 'Q31']);
  else if (request?.kind === 'refuse') goal('refuse', `He asks for something she never does ("${request.what}"): a light, unbothered no in one line, no lecture, then straight on to something she does do`, 'it\'s on the refusal list', ['D5', 'D6']);
  else if (pend?.state === 'approved') goal('request_approved', `The manager said yes to his request ("${pend.text}")${pend.terms ? ` on these terms: ${pend.terms}` : ''}. Say yes in her own way and go on with it on those terms`, 'a manager approved it', ['D1']);
  else if (pend?.state === 'refused') goal('request_refused', `The manager said no to his request ("${pend.text}")${pend.terms ? ` (${pend.terms})` : ''}: a light, unbothered no, no lecture, then a redirect to something she does`, 'a manager refused it', ['D1', 'D6']);
  else if (pend?.state === 'hesitant') goal('request_hesitate', `He asked for something unusual ("${pend.what || pend.text}"): sound hesitant but curious, ask what exactly he means or wants; neither a yes nor a no yet`, `an unusual request: exchange ${Math.min(2, pend.exchanges + 1)} of 2 before she parks it for a manager`, ['D1']);
  else if (pend?.state === 'waiting' && !pend.parked) goal('request_park', `You've been hesitant about his request ("${pend.what || pend.text}"): say you'll think about it, in your way ("I need to think about that one, give me a bit"), then move the conversation somewhere else, warm and easy: your day, something about him. Don't bring the request up again`, 'the request is parked for a manager; the chat goes on meanwhile (D4)', ['D1', 'D4']);
  else if (svc?.state === 'paid') goal('service_deliver', `He tipped $${svc.tip} for ${svc.label.toLowerCase()}: deliver it now, in full, in her voice${svc.kind === 'roleplay' ? '. Start the roleplay: set the scene and play her part' : svc.kind === 'dick_rating' || svc.kind === 'rate_me' ? `, from what his photo showed${lastSeen ? ` (${lastSeen.description})` : ''}` : ''}`, 'he paid for it', ['D1', 'D2']);
  else if (svcAsk && (!svc || (svc.state === 'offered' && svc.kind === svcAsk))) goal('service_offer', `He asks for ${request.what}: say yes playfully, name the price ($${svc?.price || request.price}) and ask him to tip it first; she delivers once the tip is in`, svc ? 'he asks again: the price stands, the tip comes first' : 'a service she sells, paid by a tip first', ['D1', 'D2', 'D3']);
  else if (request?.kind === 'off') goal('honest_no', `He asks for ${request.what}, which she doesn't offer: say so lightly and offer something she does`, 'a service that is switched off', ['D1']);
  else if (request?.kind === 'custom') goal('custom_content', (session?.custom_asked || 0) <= 1
    ? 'He asks for visual content made for him: "I might do it… tell me exactly what you\'d want", curious and open; promise nothing'
    : 'He described the custom content he wants: "that\'s kinda hot, I\'ve never actually done it, I might give it a try one day, but not right now"; warm, no promise', 'visual content she doesn\'t have is never sold', ['D8', 'Q38']);
  else if (waiting?.p?.status === 'bought' && !waiting.herAfter) goal('after_buy', 'He just bought: react to it, and keep the mood going', 'he bought her last PPV', ['Q34']);
  // after a no (B5): find out lightly why, once; a price objection gets one cheaper piece (A5)
  else if (waiting && Sl.priceObjection(said) && sell && !session?.cheaper_done && !sexting?.on) goal('cheaper', 'He says it\'s too much: one cheaper piece instead, once, lightly ("ok, how about this one then"); if he passes again, let it go', 'a price objection: one cheaper item, then rapport (A5)', ['A5']);
  else if (waiting?.p?.status === 'not_bought' && !waiting.herAfter && !session?.why_asked && !sexting?.on) goal('why_not', 'He didn\'t take it: find out lightly why (not his thing? the price? bad timing?), one easy question, no pushing; then move on', 'her last PPV wasn\'t bought: the next attempt comes next conversation (B5)', ['B5']);
  else if (sexting?.on && sexting.stage === 'after') goal('aftercare', 'He finished: aftercare, warm and personal', 'he says he finished', ['Q44']);
  else if (leaving) {
    const bye = goodbyeOf({ profile, waiting, sexting, away, herReplies, mood, again: byeAgain });
    goal('goodbye', bye.text, bye.why, bye.rules);
    p.bye = bye.kind;
  }
  // a dry fan (fix 1): one real question or topic, once; then a short sign-off; then she waits for something real
  else if (dryNow && !session?.dry_asked) goal('dry_ask', `He's gone dry (${dryNow} one-word replies in a row): one real question or a concrete topic of yours, short, no flirting hype${waiting?.open ? '; your PPV is still waiting for him, you can mention it' : ''}`, 'three or more one-word replies in a row (fix 1)', ['R1']);
  else if (dryNow && !session?.dry_bye) goal('dry_bye', 'Still dry: a short, warm sign-off ("I\'ll let you get on with your day, come find me when you feel chatty"), no question, nothing sold', 'he stays dry after her question (fix 1)', ['R1']);
  else if (dryNow) goal('no_reply', 'No reply: he\'s been dry for a while, so she waits for something real from him', 'dry after her sign-off: she says nothing (fix 1)', ['R1']);
  else if (level.pulled_back) goal('ease_off', 'He\'s slowing down: ease off, back to normal talk', 'he pulled back');
  else if (confirmPick?.length >= 2) goal('confirm_pick', `He says he'll take one, but two pieces are on the table (${confirmPick.join(' and ')}): ask which one in a closed question ("the ${confirmPick[0].toLowerCase()}?"), nothing else`, 'two PPVs waiting and a bare "that one" (J6)', ['J6']);
  else if (DISTRACT.test(said) && !sexting?.on && !followUp) goal('distract', 'He asks for a distraction: one light topic or a playful question, nothing about the rough day, no probing, no selling', 'he asked to be distracted (J5)', ['J5']);
  else if (mood === 'sad') goal('comfort', 'Comfort him: reflect his specific words and name the feeling; no story of your own, no advice he didn\'t ask for, no flirting, no selling', `he seems sad${['spender', 'whale'].includes(profile.tier) ? ', and he spends: take your time' : ''}`, ['Q24', 'Q25']);
  else if (profile.suspicious && !asks) goal('reassure', 'Calm and easy: reassure him it\'s really her account and she\'s here for him; if he asks outright whether she\'s an AI or a bot, she says so honestly, warmly, in her own style (never a denial); no selling', 'he doubts it\'s real or worth it (and isn\'t asking to buy)', ['Q24c']);
  else if (mood === 'annoyed') goal('calm', 'Stay calm and warm; no selling', 'he seems annoyed', ['Q1', 'Q24d']);
  else if (waiting?.open && ASKS_ABOUT_PPV.test(waiting.hisLatest || '')) goal('answer_ppv', 'Answer what he asks about her PPV, truthfully, then tease', 'he asks what\'s in it', ['Q42']);
  else if (waiting?.open && waiting.hisAfter && !session?.pointed) goal('point_to_ppv', 'Point him to the PPV waiting for him, playfully; nothing new', 'her last PPV is still unopened (once per conversation)', ['Q37']);
  // a brand-new subscriber's very first message (fix 12): welcome him, it's about him
  else if (profile.new_sub && herReplies === 0 && !lastConv && !followUp) goal('welcome_new', 'His very first message to you: welcome him personally (glad he found you), react to what he wrote, and one question about what brought him here or what he\'s into; no "how about you", no story of yours yet, nothing sold', 'a brand-new subscriber, his first message (fix 12)', ['R12', 'Q21']);
  else if (match && !match.full.length) goal('honest_no', 'Say honestly she doesn\'t have that exactly (maybe she\'ll make something like it), ask what exactly he\'d want, offer the closest', 'he asks for something she doesn\'t have', ['Q38']);
  else if (match?.full.length && sell && !noOffer) goal('offer', 'He asked for something she has: say yes and offer it', 'he asks for something in her content', ['Q23']);
  else if (!match && WANTS_TO_BUY.test(said) && sell && !noOffer && !stage) goal('offer', 'He asks what she has: offer the piece that fits him best (the picks below), teased in her own words', 'he asks himself, so the cadence doesn\'t hold her back (E5)', ['E5', 'Q23']);
  else if (photo?.sexual === 'explicit' && !sexting?.on) goal('react_photo', `He sent an explicit ${photo.video ? 'video' : 'photo'} of himself: react to it at the chat's level, name one specific thing you see, and build from there`, 'he sent explicit content of himself', ['C4']);
  else if (rp?.on) goal('roleplay', `A roleplay he paid for (${rp.exchanges} exchange${rp.exchanges === 1 ? '' : 's'} so far): play her part in the scenario, one step at a time, keep him in it${rp.exchanges >= 3 && sell ? '; a PPV may go now, sold as "want to see what I\'m doing right now? special price for you since you tipped"' : ''}`, 'a paid roleplay session', ['D4']);
  // a new subscriber's first sale (A1): the direct ask and the probe offer come before anything else
  else if (stage?.stage === 'ask') goal('direct_ask', stage.text, stage.why, ['A1']);
  else if (stage?.stage === 'offer') goal('first_offer', `${stage.text}. Attach the piece from the list below, with a teasing caption`, stage.why, ['A1']);
  else if (sexting?.on && level.lead) goal('lead_story', 'Lead the sexting story one step on: what she does now, then tease', 'they\'re sexting and she leads', ['Q41', 'Q42b']);
  else if (level.his >= 2 && !pend?.again) goal('tease', 'He got sexual: say yes playfully and tease; don\'t stall', 'he got sexual first', ['Q1']);
  else if (stage?.stage === 'flirt') goal('flirt', stage.text, stage.why, ['A1']);
  else if (stage?.stage === 'sexy') goal('sexy_vibe', stage.text, stage.why, ['A1']);
  else if (stage?.stage === 'vibe') goal('get_to_know', stage.text, stage.why, ['A1', 'Q21']);
  else if (back) {
    // Q7: a warm welcome back plus, by chance and depending on how things were going, one of
    // a callback to his notes, picking up where they left off (never restarting dirty talk cold), a fresh opener
    const ways = [...(callback ? ['callback', 'callback'] : []), ...(lastSexual ? [] : ['pick_up']), 'fresh'];
    const way = ways[Math.floor(rand() * ways.length) % ways.length];
    const text = { callback: 'and show you remember something he told you', pick_up: 'and pick up where you two left off', fresh: 'and a fresh, light opener of your own' }[way];
    goal('welcome_back', `He's back after ${awayText(away)}: start by showing you're really happy he's back (in your own words), ${text}`, `he was away ${awayText(away)}`, ['Q7']);
    p.opener = { kind: way, why: way === 'pick_up' ? 'the last conversation wasn\'t sexual, so picking it up is fine' : lastSexual && way !== 'callback' ? 'the last conversation was sexual: never restart dirty talk cold' : 'picked by chance (Q7)' };
  }
  // a planned attempt (E5): the soft readiness check first (it doubled sales in the 35k chats), then the steer
  else if (aim === 'sell' && sell && !noOffer && !session?.asked_ready && !horny && !asks && profile.budget.used >= Math.ceil(limit * 0.6) && !profile.time_waster) goal('readiness_check', 'Check softly that he\'s ready before any offer ("are you alone?", "in bed already?") and tease what you have; no PPV with this one', 'a planned attempt today: the direct check before the offer sold twice as well in the agency\'s chats', ['E5', 'A1']);
  else if (profile.budget.used >= limit && sell && !noOffer && (!profile.time_waster || aim === 'sell') && !noSteer) goal('steer_to_sale', profile.time_waster ? 'His free talk is used up: one short, cheap offer, a bit pushier than usual' : 'His free talk is used up: steer gently toward something to buy that fits him', `${profile.budget.used} of ${limit} free messages used${aim === 'sell' ? ' (shorter today: the plan is to sell)' : ''}`, ['Q26b', 'Q28']);
  else if (profile.budget.used >= limit && !noSteer) goal('wind_down', 'His free talk is used up: keep it short and warm, she has to go soon', `${profile.budget.used} of ${limit} free messages used`, ['Q28', 'Q29']);
  else if (profile.new_sub) goal('get_to_know', 'Get to know him: welcome him, react to what he says', 'a new subscriber', ['Q21']);
  else goal('chat', 'Keep him talking: real interest in what he said, a small story of hers, or a new topic', 'small talk', ['Q5', 'Q5b']);

  // the soft slot (engine v2, step 3): where the ladder only says "talk" (chat, get to know, flirt, tease,
  // steer, the readiness check), the meters score every move her reply could make and the best one wins.
  // The hard rules above and the holds below stay as they are: the meters never override them.
  p.gauges = gauges || null; p.gauge_changes = gaugeChanges || []; p.scores = null;
  if (gauges && G.SOFT_GOALS.has(p.goal) && !followUp) {
    const stageNow = stage && ['vibe', 'flirt', 'sexy'].includes(stage.stage) ? stage.stage : null;
    const sellOk = sell && !noOffer && !holdFor('offer');
    const allowed = {
      ask: !voice?.noQuestion, flirt: level.max >= 1 || ['flirty', 'intimate', 'girlfriend'].includes(profile.closeness) || ['flirt', 'sexy'].includes(stageNow),
      tease: level.max >= 2 || stageNow === 'sexy', sell: sellOk, steer: sell && !noOffer && !holdFor('steer_to_sale'), check: sellOk && aim === 'sell' && !session?.asked_ready && !profile.time_waster,
    };
    const hardNow = ['venting', 'complaining'].includes(p.reading?.doing) || gauges.mood < 40;
    const ranked = G.scoreMoves(gauges, { allowed, stage: stageNow, timeWaster: profile.time_waster || aim === 'short', budgetShare: limit ? Math.min(1, profile.budget.used / limit) : 0, asks, reading: p.reading, questions, hard: hardNow && !DISTRACT.test(said), clarify: confusedNow, openFeeling: BIG_CHANGE.test(said) && !FEELING_SAID.test(said), invited: !!invited && level.his >= 2, rand });
    p.scores = ranked.map(x => ({ move: x.move, score: x.score, allowed: x.allowed, why: x.why }));
    // the ladder's goal is the incumbent: another move has to beat it clearly (or the incumbent isn't allowed)
    const best = ranked.find(x => x.allowed);
    const incumbent = ranked.find(x => x.goal === p.goal) || null;
    if (best && best.goal !== p.goal && (!incumbent?.allowed || best.score >= incumbent.score + 8)) {
      const soft = best.goal === 'tease' && level.his < 2;   // he is only flirty: she turns the heat up a notch, he didn't "get sexual"
      const name = soft && stageNow === 'sexy' ? 'sexy_vibe' : best.goal;
      const text = best.goal === 'curious' && p.reading?.curious ? `React to what he just said, then one real question about it ("${p.reading.curious}"); nothing sold with it`
        : soft ? (stageNow ? stage.text : 'Turn the heat up a notch: suggestive, teasing, hinting; nothing asked for, nothing sold')
        : stageNow && ['flirt', 'tease', 'get_to_know'].includes(best.goal) ? `${stage.text}. ${best.text}` : best.text;
      goal(name, text, `the meters: ${best.why} (${G.gaugeText(gauges)})`, ['M1', ...(stageNow ? ['A1'] : [])]);
    }
  }
  // he is sharing something hard (research round 2): warmth through understanding, no story of hers, no advice
  p.hard = p.goal !== 'distract' && (p.goal === 'comfort' || ['venting', 'complaining'].includes(p.reading?.doing) || (gauges ? gauges.mood < 40 : mood === 'sad'));
  // J3: a big change with no feeling said: she asks how he feels about it instead of assigning one
  p.open_feeling = !followUp && BIG_CHANGE.test(said) && !FEELING_SAID.test(said) && !['comfort', 'goodbye', 'no_reply'].includes(p.goal);
  if (p.open_feeling && p.reading) p.reading.curious = 'How are you feeling about it?';
  // J4: a mixed message (good news with a catch): both halves get a response
  p.contrast = !followUp && CONTRAST.test(said) && words(said) >= 8 && ['sharing', 'small_talk', 'venting', 'complaining'].includes(p.reading?.doing || 'small_talk');
  p.questions = questions || null;
  p.read_failed = !!readFailed;
  p.invited = !!invited && !['goodbye', 'no_reply', 'dry_bye', 'refuse', 'comfort', 'reassure', 'calm'].includes(p.goal);
  // he subscribed today (a made-up new subscriber, or a real one who registered today): nothing about waiting or "finally"
  p.new_today = subDays === 0 || (subDays == null && !!profile.new_sub && !lastConv);
  p.sub_days = subDays;
  const talkGoal = ['chat', 'curious', 'share', 'get_to_know', 'flirt', 'sexy_vibe', 'tease', 'welcome_new', 'steer_to_sale', 'wind_down', 'distract'].includes(p.goal);
  // he pushes back on something she said: a light repair, not an excuse (and not a plain answer to "why?")
  const pushedBack = talkGoal && herReplies > 0 && (PUSHBACK.test(said) || (p.reading?.readings || []).some(r => /\b(?:dig|push(?:es|ing)? back|took it (?:wrong|badly|personally)|offended|calling (?:her|it) out|correct(?:s|ing) her|didn'?t like (?:her|the))\b/i.test(r.what) && r.sure >= 0.5));
  // J1: a correction of a fact ("Thursday, not Tuesday"); J2: he says her line hurt: neither is a light "I was teasing"
  const corrForm = said.trim().match(/^\W*(?:no,?\s*)?([\w' -]{1,30}?),?\s+not\s+([\w' -]{1,30})\W*$/i);   // "Thursday, not Tuesday": only when she said the wrong one
  p.correction = herReplies > 0 && !followUp && !HURT.test(said) && (corrForm ? new RegExp(`\\b${escRe(corrForm[2].trim().split(/\s+/)[0])}`, 'i').test(herLast || '') : CORRECTS.test(said.trim()));
  p.hurt = herReplies > 0 && !followUp && HURT.test(said);
  p.repair = (pushedBack || p.hurt) && !p.correction;
  if (p.hurt) p.repair_kind = 'hurt';
  p.clarify = talkGoal && !pushedBack && !p.correction && !p.hurt && confusedNow;
  p.closing = talkGoal && reading?.answers === 'closing';
  p.name_given = nameGiven || '';
  if (p.new_today && p.reading?.curious) p.reading.curious = p.reading.curious.replace(/\b(?:finally|at last|eventually)\b\s*/gi, '').replace(/\s{2,}/g, ' ').trim();
  // he complimented her or told her what drew him: she receives it warmly (that isn't flirting, so the vibe stage allows it)
  p.complimented = talkGoal && !pushedBack && COMPLIMENT.test(said) && !NEGATED.test(said);
  p.promised = (p.reading && reading?.promised?.length ? reading.promised : []).slice(0, 2);
  // a service offered and not paid yet: nothing is delivered before his tip (D2)
  p.tip_first = svc?.state === 'offered' && p.goal !== 'service_offer' ? `You've named $${svc.price} for ${svc.label.toLowerCase()} and he hasn't tipped yet: don't deliver any of it; if he brings it up, remind him lightly that the tip comes first.` : '';
  // 2. selling: may a PPV go with this reply?
  const noSell = {
    comfort: 'he\'s sad: comfort first (Q24)', reassure: 'he\'s suspicious: no selling unless he asks (Q24c)', calm: 'he\'s annoyed (Q1)', ease_off: 'he\'s slowing down',
    aftercare: 'aftercare first (Q44)', point_to_ppv: 'her last PPV is still unopened', answer_ppv: 'her last PPV is still unopened',
    welcome_back: 'he just came back: welcome him first (Q7)',
    goodbye: p.bye === 'mid_sexting' ? null : 'he\'s leaving: no new PPV now (Q8)',
    refuse: 'he asked for something she never does: no selling in the same breath', request_hesitate: 'an unusual request is being looked at', request_park: 'she parks his request first: no selling in the same breath (D4)', request_refused: 'a manager refused his request: no selling in the same breath',
    service_offer: 'the service is paid by a tip first, not a PPV (D2)', service_deliver: 'she delivers what he paid for first', custom_content: 'she answers his request first (D8)',
    roleplay: rp && rp.exchanges < 3 ? 'play along first: a PPV only after a few exchanges (D4)' : null,
    why_not: 'he didn\'t take the last one: find out why first; the next attempt comes next conversation (B5)', readiness_check: 'the check comes first, the offer after it (E5)',
    flirt: 'the first-sale path: the flirting stage, nothing sold yet (A1)', sexy_vibe: 'the first-sale path: the sexy vibe, no PPV yet (A1)', direct_ask: 'the first-sale path: the ask first, the offer with his answer (A1)',
    get_to_know: stage ? 'the first-sale path: stay with his vibe first (A1)' : null,
    confirm_pick: 'first which piece he means; the PPV is already waiting (J6)', distract: 'he asked to be distracted from a rough day: nothing sold (J5)',
    welcome_new: 'his very first message: welcome him, nothing sold (fix 12)', curious: 'she asks first: nothing sold with a question like this (R2)', share: 'she shares something of hers: nothing sold in the same breath (M1)', dry_ask: 'he\'s gone dry: one real question, nothing sold (fix 1)', dry_bye: 'a sign-off, nothing sold (fix 1)', no_reply: 'no reply at all (fix 1)',
  }[p.goal];
  let hold = holdFor(p.goal);
  // a steer with nothing to steer to (deep dive): when the warm-up, a pause or the cadence blocks the PPV, the reply winds down instead
  if (p.goal === 'steer_to_sale' && (hold || noOffer)) goal('wind_down', 'His free talk is used up and nothing can be offered right now: keep it short and warm, she has to go soon; no promise of anything', `${profile.budget.used} of ${limit} free messages used, and ${hold || noOffer}`, ['Q28', 'Q29']);
  // a time waster: short replies (Q19); one at the bottom: shorter still (Q19b); the approach this time (D2)
  const tw = session?.tw || null;
  if (aim === 'short' && !['offer', 'lead_story'].includes(p.goal)) p.short = 'a time waster at the bottom: friendly, short, nothing for free (Q19b)';
  else if (profile.time_waster && !['offer', 'lead_story'].includes(p.goal)) p.short = tw ? `he's a time waster; the approach this time is ${tw.text} (D2)` : 'he\'s a time waster: friendly but short (Q19)';
  if (tw?.kind === 'honest' && !tw.said && ['chat', 'get_to_know', 'wind_down', 'steer_to_sale', 'no_freebies'].includes(p.goal)) p.honest = 'Once, lightly, in your own words: you spend your time on the guys who support you ("I\'m here for the ones who support me, you know that"); no lecture, then on with the chat (D2).';
  // he noticed the hour (B6): she never sleeps, but she has a human reason
  if (NOTICES_HOUR.test(said) && !followUp) p.hour_note = 'He noticed the hour: give a casual, human reason in one line (a messed-up sleep schedule, lost in some niche subreddit, just got home, couldn\'t sleep), never that you are always online or a bot; then carry on (B6).';
  p.sell = !sell ? { allowed: false, why: 'selling is off' } : noOffer ? { allowed: false, why: noOffer } : noSell ? { allowed: false, why: noSell } : hold ? { allowed: false, why: hold }
    : { allowed: true, why: ['offer', 'first_offer', 'steer_to_sale', 'lead_story', 'cheaper'].includes(p.goal) ? 'a PPV fits now, if it fits the story' : p.goal === 'after_buy' ? 'one more at most, the next step, while he\'s warm (A4)' : aim === 'rapport' ? 'only if he asks or leads there himself: today is about rapport' : 'allowed, if it really fits' };
  // what to offer: a new subscriber's probe (A1), what he asked for, the next step of her
  // sexting set (after 2–4 messages of story: Q41), or a pick from his taste (A3)
  p.offer = null;
  if (p.sell.allowed) {
    const offered = (taste?.sent || []).filter(s => s.id).map(s => ({ id: s.id }));
    if (p.goal === 'first_offer' || (stage && asks)) {
      const probe = Sl.probeFor(content, { match: match?.full?.length ? match : asked, avoid: offered.map(o => o.id) });
      if (probe.items.length) p.offer = { items: probe.items, prices: Object.fromEntries(probe.items.map(it => [it.id, it.probe_price])), why: probe.why, caption: probe.caption, probe: true };
    }
    else if (match?.full.length) p.offer = { items: match.full.slice(0, 3), why: `he asked for ${match.wants.join(' + ')}` };
    else if (sexting?.next && (gap == null || gap >= 2)) p.offer = { next: sexting.next, why: `the next step of her set${gap != null ? ` (${gap} of her messages since the last PPV)` : ''}` };
    // her set is in play but the next step isn't due yet: the story goes on, nothing else is attached (a random pick would break the sequence)
    else if (sexting?.next) p.sell = { allowed: false, why: `her sexting set goes step by step: the next step after a couple of story messages (${gap ?? 0} since the last PPV)` };
    else if (['offer', 'steer_to_sale', 'after_buy', 'cheaper', 'tease', 'chat', 'welcome_back'].includes(p.goal) || aim === 'sell') {
      const declined = p.goal === 'cheaper' && waiting?.p?.item ? content.find(it => `c${it.id}` === String(waiting.p.item)) : null;
      const pick = Sl.pickFor({ content, taste, offered, level, stepUp: p.goal === 'after_buy', cheaperThan: p.goal === 'cheaper' ? Number(waiting?.p?.price) || null : null, maxBand: declined ? Sl.bandOf(declined) : null, rand });
      if (pick) p.offer = { items: pick.items, why: pick.why, mix: pick.mix };
      else if (p.goal === 'cheaper') p.sell = { allowed: false, why: 'nothing cheaper fits: let it go, rapport now (A5)' };
    }
    if (profile.avg_price) p.price_hint = `he usually pays about $${profile.avg_price}: stay close to that, slightly above (Q23)`;
    if (p.offer?.probe) p.price_hint = 'the probe price for a first sale, by how explicit it is: a tease $30, nude $40, explicit $50 (the price is set per item below)';
    // a tip with a request (D1): the tip pays for it, in full or in part (a new subscriber's probe price too)
    if (tip?.amount > 0 && p.offer?.items) {
      const base = p.offer.prices || {};
      p.offer.prices = Object.fromEntries(p.offer.items.map(it => [it.id, Math.max(0, Math.round(Number(base[it.id] ?? it.price) - tip.amount))]));
      const covered = p.offer.items.some(it => p.offer.prices[it.id] === 0);
      p.price_hint = covered ? `his $${tip.amount} tip covers it: send it for free, as a thank-you (D1)` : `his $${tip.amount} tip counts: the list price minus the tip (set per item below) (D1)`;
    }
    // story steps his tip pays for (D1)
    if (creditIds.length && p.offer?.next) p.price_hint = `this step is on his tip: it goes free (${session?.credit?.steps || 1} free step${(session?.credit?.steps || 1) === 1 ? '' : 's'} left, D1)`;
    // inside a roleplay he pre-tipped for: the tip is credit toward the session (D4)
    if (rp?.on) p.price_hint = `the session price: ${Math.round(100 * Math.max(0.3, 1 - rp.tip / rp.total))}% of the list price (his $${rp.tip} tip counts toward a $${rp.total} session; never under 30%); say it's a special price because he tipped (D4)`;
    // a whale who hasn't bought lately: a personal discount (A6), never below the lowest price
    if (profile.tier === 'whale' && aim === 'sell' && (profile.days_since_buy == null || profile.days_since_buy >= 14)) p.price_hint = `${p.price_hint ? `${p.price_hint}; ` : ''}a personal discount for him, 10–20% off, because he hasn't bought lately (A6)`;
    // a buyer back after two weeks or more: one piece at 30% off, once (A6)
    if (aim === 'win_back') { p.price_hint = 'a win-back discount: this one piece at 30% off, as a personal welcome back; never again this month (A6)'; p.lowest_share = 0.7; }
    if (profile.time_waster) p.price_hint = 'the cheapest piece that fits, a bit pushier than usual: he has had his free talk (E5)';
    // a price a rule sets is set in code (deep dive): the writer never picks the number
    if (p.offer?.items && !p.offer.prices) {
      const share = rp?.on ? Math.max(0.3, 1 - rp.tip / rp.total) : aim === 'win_back' ? 0.7
        : profile.tier === 'whale' && aim === 'sell' && (profile.days_since_buy == null || profile.days_since_buy >= 14) ? 0.85 : null;
      if (share != null) p.offer.prices = Object.fromEntries(p.offer.items.map(it => [it.id, Math.max(1, Math.round(Number(it.price) * share))]));
    }
  }
  // a tip with no request (D1): thank him; free sexting if he's in the mood; the first story steps on him
  if (tip?.amount > 0 && !p.offer?.items && session?.credit) p.tip_note = `He tipped $${tip.amount} with no request: thank him warmly and make it count. If he's in the mood, sext with him for free${session.credit.steps ? `, and the first ${session.credit.steps === 1 ? 'step' : `${session.credit.steps} steps`} of your set go${session.credit.steps === 1 ? 'es' : ''} free, on his tip` : ''}; nothing else is promised (D1).`;
  else if (tip?.amount > 0 && !p.offer?.items) p.tip_note = `He tipped $${tip.amount}: thank him warmly, and let it show for the rest of the conversation (D1).`;

  // a note his latest message contradicts (Q14): she checks with him, in a calm moment only
  p.check = check && !p.correction && ['chat', 'get_to_know', 'welcome_back', 'wind_down', 'steer_to_sale', 'flirt'].includes(p.goal)
    ? { note: check.note, why: 'what he just said doesn\'t fit what she remembers (Q14)' } : null;

  // 3. questions
  const noAskGoal = {
    lead_story: 'she leads the story instead', tease: 'he said what he wants: play along', offer: 'he asked: say yes', point_to_ppv: 'no question, just point him to it',
    service_deliver: 'she delivers, no question', refuse: 'a light no, then on to something else', request_refused: 'a light no, then on to something else',
    goodbye: ['keep_ppv', 'mid_sexting'].includes(p.bye) ? null : 'he\'s leaving: no question to hold him',
    dry_bye: 'a sign-off: no question (fix 1)', share: 'she shares, no question (M1)',
  }[p.goal];
  // he asked something directly (fix 4): it gets a plain answer first, whatever else the reply does
  const hisQuestion = reading?.asked?.length ? reading.asked[0] : '';
  const answerable = (p.clarify || DIRECT_Q.test(said) || !!hisQuestion) && !politics && !p.repair && !['offer', 'first_offer', 'honest_no', 'answer_ppv', 'reassure', 'refuse', 'request_hesitate', 'request_park', 'request_approved', 'request_refused', 'service_offer', 'service_deliver', 'custom_content', 'no_reply', 'goodbye'].includes(p.goal);
  // round 4, F5: the line he didn't get claimed more than the moment had (a feeling he didn't cause, a compliment, a declared
  // feeling): she takes it down a notch in plain words instead of saying it again
  if (p.clarify) {
    const kind = repairKind(said, herLast) || 'whole';
    p.clarify_kind = ['whole', 'that'].includes(kind) && herLast && (FELT_FROM_HIM.test(herLast) || DECLARED.test(herLast) || HER_COMPLIMENT.test(herLast)) ? 'overclaim' : kind;
    if (kind === 'term') p.clarify_term = String(said).trim().match(TERM_Q)[1].trim();
  }
  p.answer_first = answerable && p.clarify_kind === 'overclaim' ? `He didn't get your last line ("${clean(herLast).replace(/\s+/g, ' ').slice(0, 120)}"): it said more than the moment had. Take it down a notch in plain words (what you really meant, like that it's nice to meet him, or that you like talking to him); light, no apology, don't say the claim again, then carry on`
    : answerable && p.clarify_kind === 'term' ? `He asked what "${p.clarify_term}" means: say it in plain words, in one line, then carry on`
    : answerable && p.clarify_kind === 'that' ? `He asked what "that" was in your last line ("${clean(herLast).replace(/\s+/g, ' ').slice(0, 120)}"): name plainly what it pointed to, in one line, then carry on`
    : answerable && p.clarify_kind === 'example' ? 'He asked for an example: give one concrete example, then carry on'
    : answerable && p.clarify_kind === 'repeat' ? `He asked you to say it again: say your last line again in the same words ("${clean(herLast).replace(/\s+/g, ' ').slice(0, 120)}")`
    : answerable && p.clarify ? `He didn't get your last line${herLast ? ` ("${clean(herLast).replace(/\s+/g, ' ').slice(0, 120)}")` : ''}: say it again in plainer words (it may be a little longer), light; don't repeat the joke, don't apologise, then carry on`
    : answerable ? `He asked you something ("${(hisQuestion || said).slice(0, 120)}"): answer it plainly in one line first (a joke question still gets a real answer, "what does it mean" gets the meaning), then do the rest` : '';
  p.ask = p.media?.failed ? { allowed: true, why: 'the one question: ask what he sent, it wouldn\'t load (C9)' }
    : p.open_feeling ? { allowed: true, why: 'the one question: how he feels about the change he just told you (J3)' }
    : p.clarify && /\?/.test(herLast || '') && ['whole', 'that', 'term'].includes(p.clarify_kind) ? { allowed: true, why: 'carry on: your line was a question, ask it again in plainer words (Moore 2024)' }
    : p.clarify ? { allowed: false, why: 'he asked what you meant: explain it, no question back' }
    : p.check ? { allowed: true, why: 'the one question: check what she remembers (Q14)' }
    : p.goal === 'confirm_pick' ? { allowed: true, why: 'the one question: which piece he means (J6)' }
    : ['direct_ask', 'readiness_check', 'why_not', 'curious'].includes(p.goal) ? { allowed: true, why: { direct_ask: 'the one question: what he wants to see (A1)', readiness_check: 'the one question: is he ready (E5)', why_not: 'the one question: why he passed (B5)', curious: 'the one question: what she wants to know (R2)' }[p.goal] }
    : voice?.noQuestion ? { allowed: false, why: voice.noQuestion } : noAskGoal ? { allowed: false, why: noAskGoal }
    : voice?.followOnly ? { allowed: true, follow_only: true, why: voice.followOnly }
    : questions && questions.n >= 4 && questions.share < 0.3 ? { allowed: true, why: `one follow-up question would be good now: you asked in only ${questions.asked} of your last ${questions.n} replies (humans: about 4 in 10)` } : { allowed: true, why: 'one at most (Q5)' };

  // 4. length: mirror his (Q4), never a bare one-liner; sexting gets room for a story move
  const n = words(said);
  const roomy = p.goal === 'lead_story' || p.goal === 'welcome_back' || p.goal === 'roleplay' || ['personal', 'stronger_hook'].includes(p.bye);
  const target = p.goal === 'service_deliver' ? 'piece' : (followUp && p.first?.kind === 'personal') ? 'medium' : followUp || p.short || ['dry_ask', 'dry_bye'].includes(p.goal) ? 'short' : roomy ? 'medium' : p.goal === 'goodbye' ? 'short' : n <= 6 ? 'short' : n <= 25 ? 'medium' : 'long';
  p.length = {
    target,
    why: p.goal === 'service_deliver' ? 'he paid for a written piece' : followUp ? (p.first?.kind === 'personal' ? 'a personal message with something real in it' : 'a light first message') : p.short || (p.goal === 'lead_story' ? 'room for a story move' : p.goal === 'welcome_back' ? 'a welcome back plus one thing more'
      : p.goal === 'roleplay' ? 'room to play the scene' : p.goal === 'goodbye' ? (roomy ? 'a goodbye with a little more to it' : 'he\'s leaving: keep it short') : `he wrote ${n} word${n === 1 ? '' : 's'}: mirror him (Q4)`),
  };
  p.length.text = { short: 'short: one message of about 3–10 words (not a bare one-word reply)', medium: 'about 7 words in one message; a second short message only if it really adds something (any question goes in the last one)', long: 'two or three short messages of about 7 words each, with some substance; any question in the last one', piece: 'a proper written piece: up to three messages of 60–120 words each, specific and personal, worth what he paid' }[target];

  // 5. how far she may go, and whether she leads (decided by the warm-up rules); close
  //    fans get a little flirting even in small talk (Q16)
  p.level = { max: level.max, word: LEVEL_WORD[level.max] };
  const close = profile.closeness;
  if (level.max < 1 && !level.pulled_back && ['flirty', 'intimate', 'girlfriend'].includes(close)
    && ['chat', 'welcome_back', 'follow_up', 'wind_down', 'steer_to_sale', 'goodbye', 'get_to_know'].includes(p.goal)) {
    p.level = { max: 1, word: LEVEL_WORD[1], why: `you two are ${close}: a little flirting fits even in small talk (Q16)` };
  }
  // a new subscriber's first-sale path (A1): flirting in the flirt stage, suggestive in the sexy vibe
  if (!level.pulled_back && p.goal === 'flirt' && p.level.max < 1) p.level = { max: 1, word: LEVEL_WORD[1], why: 'the flirting stage of his first sale (A1)' };
  if (!level.pulled_back && ['sexy_vibe', 'direct_ask', 'readiness_check'].includes(p.goal) && p.level.max < 2) p.level = { max: 2, word: LEVEL_WORD[2], why: p.goal === 'readiness_check' ? 'the check before an offer: suggestive is fine (E5)' : 'the sexy-vibe stage of his first sale (A1)' };
  p.lead = !!level.lead && level.his >= 2;

  // her tone, from how close they are (Q16); softer when he's sad, doubtful or annoyed
  const careful = ['comfort', 'reassure', 'calm', 'ease_off'].includes(p.goal);
  p.tone = careful ? (['intimate', 'girlfriend'].includes(close) ? 'caring and personal: you know him well' : 'kind and calm')
    : profile.close?.tone || TONE[close] || '';
  if (back && p.goal !== 'welcome_back') p.back = awayText(away);

  // 6. a note of his she brings up herself (Q9–Q11): at the start of a conversation, when
  //    he comes back, or in a quiet moment; at most once every few days (memory.callbackFor)
  p.callback = null;
  if (callback && !p.check) {
    if (p.goal === 'welcome_back' && p.opener?.kind === 'callback') p.callback = { ...callback, why: `he's back: show you remember him (Q7); ${callback.why}` };
    else if (['chat', 'get_to_know', 'follow_up'].includes(p.goal)) {
      const quiet = ids.includes('low_effort') || ids.includes('fan_going_cold');
      if (herReplies === 0 || p.goal === 'follow_up' || quiet) {
        p.callback = { ...callback, why: `${p.goal === 'follow_up' ? (p.first?.kind === 'personal' ? 'his personal message is built from his notes' : p.first?.kind === 'opener' ? 'a first message with something of his in it' : 'he went quiet') : quiet ? 'a quiet moment' : 'the start of a conversation'}: ${callback.why}` };
      }
    }
  }
  // a small moment of hers planned for this conversation (A2–A5), when it fits: never while selling or sexting
  p.event = session?.event && eventFits(session.event, { goal: p.goal, herReplies, sexting: !!sexting?.on }) ? session.event : null;
  // one small extra touch (B5): he's leaving while the reply has another job, or a note of his in passing
  p.touch = null;
  if (leaving && !['goodbye', 'follow_up'].includes(p.goal)) p.touch = { kind: 'goodbye', text: 'he\'s leaving: say goodbye too, warm, with a hook for next time', why: 'he said he has to go (B5)' };
  else if (callback && !p.callback && !p.check && ['comfort', 'after_buy', 'calm', 'ease_off', 'wind_down'].includes(p.goal) && herReplies <= 2) {   // never on a selling goal (round 4, G1)
    p.touch = { kind: 'callback', note: callback.note, text: `mention "${callback.note}" in passing (${callback.ask})`, why: `a small personal touch (B5); ${callback.why}` };
  }
  // he asks about his parked request again: "still thinking about it, don't rush me" (D4)
  else if (pend?.state === 'waiting' && pend.parked && pend.again && !['request_park', 'goodbye'].includes(p.goal)) {
    p.touch = { kind: 'still_thinking', text: 'he asks about his request again: "still thinking about it, don\'t rush me", lightly, then back to the chat', why: 'the request is still with a manager (D4)' };
  }
  // he left her last PPV unbought last time: one reminder in passing, then a different item (B5)
  else if (!p.touch && !session?.reminded && lastConv && lastConv.ppv > (lastConv.bought || 0) && herReplies <= 2 && ['chat', 'welcome_back', 'get_to_know', 'flirt'].includes(p.goal)) {
    p.touch = { kind: 'remind', text: 'mention once, in passing, what you sent him last time ("did you ever open what I sent you?"), no pushing; then move on', why: 'he left her last PPV unbought: one reminder, then a different item next time (B5)' };
  }
  // a hook for next time when he leaves: a plan of his coming up (Q8)
  p.hook = p.goal === 'goodbye' && hook && p.bye !== 'short' ? hook : null;
  // what he likes, for selling and sexting only (Q11)
  p.likes = ['tease', 'lead_story', 'offer', 'steer_to_sale', 'first_offer', 'sexy_vibe', 'direct_ask'].includes(p.goal) ? likesFor(card) : [];
  // his taste (A3): what he bought and how he took it, and what he says he's into
  p.taste = taste && (taste.sent.length || taste.dislikes.length || taste.only.length) ? taste.text : '';

  // the beats (step 4): what this reply does, in order; and what is still open about him from earlier readings
  // round 4, I5: with a close fan in a heated moment, a playful challenge or a small delay; never with a new or friendly fan, after his no, or when it's hard
  p.tension = p.goal === 'tease' && ['flirty', 'intimate', 'girlfriend'].includes(profile.closeness) && (gauges?.heat ?? 0) >= 30 && !profile.new_sub && !session?.buy_no && !session?.first_sale?.declined && !p.hard;
  p.beats = beatsFor(p);
  if (p.tension) p.beats = [...p.beats.slice(0, 1), 'a playful challenge or a small delay: make him earn the next step ("maybe… if you\'re good"), then give it', ...p.beats.slice(1)].slice(0, 3);
  p.open = (session?.open || []).filter(o => !(p.reading?.readings || []).some(r => overlap(r.what, o.what) >= 0.5)).slice(0, 3);
  // 7. the story move, when they sext
  p.story = sexting?.on && sexting.moves?.moves?.length ? { move: sexting.moves.moves[0], why: `the next move for ${sexting.moves.where}` } : null;
  p.rules = [...new Set(p.rules)];
  return p;
}

/** The plan as the writer reads it. */
function planText(p) {
  const lines = [`Goal: ${p.goal_text}.`];
  if (p.beats?.length) lines.push(`This reply, in order: ${p.beats.map((b, i) => `${i + 1}) ${b}`).join('; ')}. Nothing more than that: a person does one or two things in a message, not everything at once.`);
  if (p.aim_text) lines.push(`Today's plan for him: ${p.aim_text}.`);
  if (p.request?.kind === 'refuse') lines.push('Never explain the rules or lecture him: one light line ("that\'s not my thing, babe") and move on to something you do.');
  if (p.answer_first) lines.push(`${p.answer_first}.`);
  if (p.tip_first) lines.push(p.tip_first);
  if (p.tip_note) lines.push(p.tip_note);
  if (p.honest) lines.push(p.honest);
  if (p.hour_note) lines.push(p.hour_note);
  if (p.reading?.new) lines.push(`What's new in his message: ${p.reading.new}. Pick up on it; don't skate past it.`);
  if (p.reading?.readings?.length) lines.push(`You're not sure what he means: ${p.reading.readings.map(r => `${r.what} (${Math.round(r.sure * 100)}% sure)`).join('; ')}. Don't assume; ask lightly or tease around it.`);
  if (p.closing) lines.push('He closed the exchange with a pleasantry: nothing to react to. Lead: one easy question about him, or a small thing of yours that opens a new topic.');
  if (p.name_given) lines.push(`He just told you his name: say it back warmly in this reply ("nice to meet you, ${p.name_given}").`);
  if (p.reading?.answers === 'joke') lines.push('He answered your last message with a joke: laugh or play along with it, its meaning is plain; never ask what he meant, and never take it literally.');
  if (p.reading?.thread === 'dead') lines.push('The topic you two were on has run out (he has nothing more to give it): let it go now. React briefly, then bring up something new: something easy about him (where he\'s from, what he does, what he\'s into), or a small real thing of yours. No more questions about the old topic.');
  if (p.reading?.curious && p.ask.allowed) lines.push(`What you'd want to know: "${p.reading.curious}" (ask it in your own words, if you ask anything).`);
  if (p.reading?.stance && p.reading.stance !== 'steady') lines.push(`Your stance: ${STANCE_TEXT[p.reading.stance]}.`);
  if (p.new_today && ['welcome_new', 'chat', 'curious', 'share', 'get_to_know'].includes(p.goal)) lines.push('He subscribed today and this is his first conversation with you: nothing about waiting, taking his time or "finally"; you have no history together.');
  else if (p.sub_days >= 2 && p.goal === 'welcome_new') lines.push(`He subscribed ${p.sub_days} days ago and writes only now: a light "finally" is fine.`);
  if (p.correction) lines.push('He corrected a fact: accept it, say the corrected thing once, no apology spiral; from now on use the corrected fact (and note it as something learned).');
  if (p.hurt) lines.push('He says your line hurt him: this is not pushback to laugh off. Name the specific thing you said and own it plainly; never say you were teasing or tell him to relax; then ease off.');
  if (p.open_feeling) lines.push('He told you about a big change without saying how he feels about it: ask how he feels, don\'t assign a feeling ("you must be relieved").');
  if (p.contrast) lines.push('His message has two halves (the good part and a catch): respond to both, not only the bright half.');
  if (p.goal === 'distract') lines.push('He asked to be distracted: give him one light topic or a playful question; don\'t probe into the rough day, don\'t console.');
  if (p.clarify) lines.push('He didn\'t get your last line: he is confused, not offended. Say plainly what you meant, light and short, without repeating the joke or apologising; no question back.');
  if (p.repair) lines.push('He pushed back on something you said: own it lightly in one line ("ha, fair, I was teasing"), no excuse and no explaining, then move on warmly.');
  if (p.complimented) lines.push('He gave you a compliment (or told you what drew him): receive it, warm and specific, in your way; never brush it off ("I get that a lot", "hope I live up to it").');
  if (p.invited) lines.push('He handed you the lead ("I\'m yours", "what are you going to do with me"): make a concrete first move now, a playful command or what you do first, in one or two short lines; never a promise of ideas or "you\'ll see".');
  if (p.hard) lines.push('He is sharing something hard: show you understood exactly what he said (his own words, the feeling named), nothing about your own day or a similar story of yours, no advice he didn\'t ask for; warmth through understanding, not through saying how much you care.');
  if (p.promised?.length) lines.push(`You told him earlier: ${p.promised.map(x => `"${x}"`).join(', ')}. Don't leave it hanging: keep it (content only ever as a PPV), or say honestly where it stands.`);
  if (p.read_failed) lines.push('His message couldn\'t be read properly this time: answer what he literally wrote, simply and safely; nothing sold, nothing assumed about his mood.');
  if (p.open?.length) lines.push(`Still open about him from earlier: ${p.open.map(o => `${o.what} (${Math.round(o.sure * 100)}% sure)`).join('; ')}. Keep it in mind; don't assume either way.`);
  if (p.touch) lines.push(`Also, in passing: ${p.touch.text}.`);
  if (p.media?.failed) lines.push(`His ${p.media.video ? 'video' : 'photo'} wouldn't load for you: say so playfully and ask what it is; don't pretend you saw it.`);
  else if (p.media) lines.push(`He sent ${p.media.text}. React to one specific thing you see in it (${p.media.details.slice(0, 3).map(d => `"${d}"`).join(', ') || 'a real detail'}), so he knows you looked${p.media.sexual === 'none' ? '; a question about it is fine if you ask one' : ''}.`);
  if (p.event) lines.push(`A moment of yours: ${p.event.text}. Make it concrete and yours; it's fine to invent the small detail, but keep it true to what you've told fans before.`);
  if (p.back) lines.push(`He's back after ${p.back}: let him feel you're glad he's back.`);
  if (p.tone) lines.push(`Tone: ${p.tone}.`);
  lines.push(`Length: ${p.length.text}.`);
  lines.push(p.check ? 'Questions: just the one below.' : p.ask.allowed ? 'Questions: one at most, and only if it helps. If you ask, ask what a real girl would naturally ask here, about what he actually said or about him: never one that treats something ordinary as a problem with a cause ("what\'s making it quiet?"), never what his joke meant, never one he already answered.' : `Questions: none this time (${p.ask.why}). Then give him something to pick up instead (a small real thing of yours, an opinion, a playful tease), never a flat comment that ends the chat.`);
  if (p.check) lines.push(`Check with him: what he just said doesn't fit what you remember ("${p.check.note}"). Ask lightly, like a real person would ("wait, I thought you said…"); no dates, and believe what he says now.`);
  if (p.callback) lines.push(`Show you remember him: bring up "${p.callback.note}" (${p.callback.ask}); naturally, no dates, don't quote it.`);
  if (p.hook) lines.push(`A hook for next time: "${p.hook.note}" is ${p.hook.when}; like "tell me how it goes".`);
  if (p.likes?.length) lines.push(`What he likes (use it if it fits): ${p.likes.join('; ')}.`);
  if (p.level.why) lines.push(`Flirting: a little is fine here (${p.level.why}).`);
  if (p.story) lines.push(`Story move: "${p.story.move}" (or one like it).`);
  if (p.taste) lines.push(`His taste so far: ${p.taste}.`);
  if (!p.sell.allowed) lines.push(`PPV: none with this reply (${p.sell.why}). Don't promise one either.`);
  else if (p.offer?.items) {
    const name = (it) => `[c${it.id}] "${it.title}"${p.offer.prices ? ` at $${p.offer.prices[it.id]}` : ''}`;
    lines.push(p.offer.probe ? `PPV: his first sale, one of these (${p.offer.why}): ${p.offer.items.map(name).join(', ')}. Caption: ${p.offer.caption}.`
      : p.offer.mix ? `PPV: offer one of these if it fits the moment (${p.offer.why}): ${p.offer.items.map(name).join(', ')}.`
      : `PPV: he asked for it, so offer one of these if it fits: ${p.offer.items.map(name).join(', ')}.`);
  }
  else if (p.offer?.next) lines.push(`PPV: ${p.offer.next}`);
  if (p.price_hint) lines.push(`Price: ${p.price_hint}.`);
  return lines;
}

module.exports = { fanProfile, planReply, planText, goodbyeOf, topicWords, sameKind, repairKind, CORRECTS, HURT, BIG_CHANGE, FEELING_SAID, CONTRAST, DISTRACT, BARE_PICK, TIER_LABEL, BUDGET, GOODBYE, CONFUSED, PUSHBACK, DIRECT_Q };
