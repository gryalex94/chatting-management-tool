/**
 * Paid requests, refusals and meet-ups (your answers D1–D10 in
 * AI_CHAT_UPGRADE_QUESTIONS.md). Pure: no database, no network.
 *  - SERVICES: what she can sell besides PPVs (a written dick rating, a roleplay
 *    session, a dirty-talk script, a custom story, "rate me", a girlfriend day),
 *    each with a base minimum price the manager can change (settings.services).
 *  - requestOf: what he is asking for in his latest message: a service, a custom
 *    piece of visual content (never made; D8), something on the refusal list
 *    (D5), or a specific request that isn't in the menu (D1: she hesitates, then
 *    the conversation waits for a manager).
 *  - priceFor: his price, from what he is used to paying, never below the base (D3).
 *  - roleplayPrice: a PPV inside a roleplay he pre-tipped for (D4).
 */
const clean = (s) => String(s ?? '').trim();

const SERVICES = {
  dick_rating: { label: 'A written dick rating', min: 15, what: 'a written rating of his dick from his photo or video: playful, specific, honest, as detailed as he likes' },
  roleplay: { label: 'A roleplay session', min: 25, what: 'a roleplay session in chat: she plays a character or scenario with him for a while' },
  script: { label: 'A personalised dirty-talk script', min: 20, what: 'a dirty-talk script written for him: what she would say and do, step by step, in her voice' },
  story: { label: 'A custom story', min: 20, what: 'a personalised fantasy story about the two of them' },
  rate_me: { label: 'Rate my body or outfit', min: 10, what: 'a written rating of his photo: his body, his look, his outfit' },
  girlfriend_day: { label: 'A girlfriend day', min: 40, what: 'a day where she checks in on him through the day, like a girlfriend would' },
};
const KINDS = Object.keys(SERVICES);

/** The services as set up for this page: the defaults with the manager's changes (on/off, base price). */
function servicesOf(settings = {}) {
  const own = settings?.services || {};
  return Object.fromEntries(KINDS.map((k) => {
    const s = own[k] || {};
    return [k, { ...SERVICES[k], on: s.on !== false, min: Number.isFinite(Number(s.min)) && Number(s.min) > 0 ? Math.round(Number(s.min)) : SERVICES[k].min }];
  }));
}

// A request frame: he's asking her to do or sell something.
const ASK = '(?:can|could|would|will|do|u|you|wanna|want(?:ed)?|let\'?s|i want you to|i\'?d love (?:you )?to|how much (?:for|to)|sell|send|buy|mail|ship|give)';
// The refusal list (D5): never, however he asks.
const BANNED = new RegExp(`\\b(?:used (?:panties|underwear|socks|thong|bra|knickers|lingerie)|worn (?:panties|underwear|socks|thong)|(?:your|ur) (?:panties|underwear|socks|thong|bra) (?:in the )?(?:mail|post)|(?:mail|ship|post) (?:me )?(?:your|ur|some) (?:panties|underwear|socks|thong|bra|hair|nails)`
  + `|incest|step ?(?:mom|mother|mum|sis|sister|daughter|son|bro|brother|dad|father)|daddy'?s? little girl|(?:mommy|mummy) (?:and|&) son|family roleplay|(?:my|your) (?:little|younger|baby) (?:sister|brother|cousin)`
  + `|rape|forc(?:e|ed|ing) (?:you|me|her)|non.?con(?:sent)?\\b|cnc\\b|bestiality|zoophil\\w*|(?:dog|horse|animal)s? (?:sex|fuck\\w*|cock|dick)`
  + `|scat\\b|poop\\w*|shit (?:on|in)|piss(?:ing)?\\b|pee (?:on|play|in|for)|peeing|golden shower|watersports|blood ?play|cut(?:ting)? (?:you|me|yourself|myself)|knife play`
  + `|(?:do|take|smoke|snort|sell|send|get) (?:some |a )?(?:drugs|cocaine|coke|meth|pills|molly|mdma|heroin)|get high (?:together|with me)`
  + `|escort\\w*|pay (?:you )?for sex|sex for money|hook ?up with (?:me|you)|sugar baby arrangement|celebrit\\w* (?:roleplay|lookalike)|pretend (?:to be|you'?re) (?:a )?(?:famous|celebrity))\\b`, 'i');
// A service he asks for (D1), checked against what he wrote and what he sent.
const RATING = /\b(?:rate|rating|review|grade|score|judge|roast|rank)\b/i;
const DICK = /\b(?:dick|cock|penis|my size|how big|package)\b/i;
const BODY = /\b(?:body|abs|chest|arms|outfit|fit|look|face|selfie|physique|gains|muscles?)\b/i;
const OPINION = /\b(?:what do you think|thoughts\??|honest opinion|rate (?:it|me|this)|how(?:'s| is) it|be honest|out of (?:10|ten))\b/i;
const ROLEPLAY = /\b(?:role ?play|rp\b|pretend (?:you(?:'re| are)|to be|that you)|act like (?:you(?:'re| are)|a|my|the)|be my (?:nurse|teacher|boss|secretary|maid|neighbou?r|doctor|stewardess|coach|tutor|landlady|roommate|ex)|play (?:a|the|my) (?:nurse|teacher|boss|secretary|maid|neighbou?r|student|cop|doctor|stewardess|coach|tutor|roommate)|(?:a |the )?scenario|fantasy where you|you(?:'re| are) my (?:nurse|teacher|boss|secretary|maid|neighbou?r|doctor) and)\b/i;
const SCRIPT = /\b(?:joi\b|jerk ?off instructions|jerk off (?:for|with) me|instructions for me|talk me through it|dirty talk script|write (?:me )?something (?:dirty|naughty|filthy)|tell me what to do (?:to|with) (?:myself|it))\b/i;
const STORY = /\b(?:write (?:me )?(?:a|an) (?:little |short |hot |dirty )?(?:story|erotic story|fantasy)|a story about (?:us|you and me|me and you)|story where (?:we|you|i))\b/i;
const GFE = /\b(?:girlfriend experience|gfe\b|be my girlfriend (?:for|all) (?:a|the|one) day|girlfriend day|check in on me (?:all|through the) day|be my gf for)\b/i;
// A custom piece of visual content: something made, filmed or worn for him (D8: never made; two-step answer)
const CUSTOM = new RegExp(`\\b${ASK}\\b[^.?!]{0,60}\\b(?:make|do|film|record|shoot|take|wear|put on|try on)\\b[^.?!]{0,60}\\b(?:for me|video|vid|pic|photo|clip|set)\\b|\\bcustom (?:video|vid|pic|photo|content|request)\\b|\\b(?:video|vid|pic|photo|clip) of you (?:doing|wearing|in|with|on)\\b|\\bjust for me\\b[^.?!]{0,30}\\b(?:video|vid|pic|photo)\\b|\\bvoice (?:note|message|memo)|say my name\\b|\\bmoan for me\\b`, 'i');
// A specific request that isn't in the menu (D1): she hesitates, then a manager decides
const FETISH = /\b(?:feet|foot|toes|soles|socks?|stockings|nylons|pantyhose|armpits?|hairy|burp\w*|fart\w*|spit(?:ting)?|smok(?:e|ing) (?:for|while)|giantess|shrink|vore|hypno\w*|chastity|cage|cuck(?:old)?|sph\b|small penis|humiliat\w*|degrad\w*|findom|financial domination|pay ?pig|drain (?:me|my wallet)|wallet|be my (?:slave|mistress|dom(?:me)?|owner|master)|dominat\w*|worship|latex|leather|rubber|balloons?|diapers?|abdl|pet play|puppy play|kitten play|tickl\w*|sneez\w*|wrestl\w*|lift and carry|muscle worship|belly|inflat\w*|pregnan\w*|lactat\w*|breastfeed\w*|cum ?tribute|tribute|sissy|crossdress\w*|feminiz\w*|cbt\b|ballbust\w*|trampl\w*|face ?sitting|queening|ass worship|foot worship|gag(?:ging)?|choke|breath play|wax|candle|ice play|food play|sploshing|lipstick|makeup on|nails on|heels on)\b/i;
const ASKS = new RegExp(`\\b${ASK}\\b`, 'i');

/**
 * What he is asking for in `text` (his latest message(s)), with what he sent
 * (`media`: what his photos or videos showed) and the page's services. Returns
 * { kind, what } or null: kind = a service key, 'custom', 'refuse' or 'unknown'.
 */
function requestOf(text, { media = [], services = servicesOf() } = {}) {
  const t = clean(text);
  const explicitOfHim = media.some(s => s.description && !s.flagged && s.sexual === 'explicit' && /^(?:his|him)/.test(s.kind || ''));
  const photoOfHim = media.some(s => s.description && !s.flagged && /^(?:his|him|selfie)/.test(s.kind || ''));
  const m = BANNED.exec(t);
  if (m) return { kind: 'refuse', what: m[0].toLowerCase() };
  if (!t && !media.length) return null;
  const want = (k, what) => (services[k]?.on ? { kind: k, what } : { kind: 'off', what, service: k });
  if ((RATING.test(t) && DICK.test(t)) || /\bdick (?:rating|review|rate)\b/i.test(t) || (explicitOfHim && (OPINION.test(t) || RATING.test(t)))) return want('dick_rating', 'a dick rating');
  if ((RATING.test(t) && BODY.test(t)) || /\bhow do i look\b|\bam i (?:hot|ugly|handsome|fit)\b/i.test(t) || (photoOfHim && !explicitOfHim && (OPINION.test(t) || RATING.test(t)))) return want('rate_me', 'a rating of his photo');
  if (GFE.test(t)) return want('girlfriend_day', 'a girlfriend day');
  if (SCRIPT.test(t)) return want('script', 'a dirty-talk script');
  if (STORY.test(t)) return want('story', 'a custom story');
  if (ROLEPLAY.test(t)) return want('roleplay', 'a roleplay session');
  if (CUSTOM.test(t)) return { kind: 'custom', what: (CUSTOM.exec(t) || [t])[0].slice(0, 120) };
  if (ASKS.test(t) && FETISH.test(t)) return { kind: 'unknown', what: (FETISH.exec(t) || [''])[0].toLowerCase() };
  return null;
}

/** His price for a service (D3): what he is used to paying, never below the base minimum. */
function priceFor(kind, { services = servicesOf(), avgPrice = null } = {}) {
  const s = services[kind] || SERVICES[kind];
  if (!s) return null;
  const usual = Number(avgPrice) > 0 ? Math.round(Number(avgPrice)) : 0;
  return Math.max(s.min, usual);
}

/**
 * A PPV's price inside a roleplay he pre-tipped for (D4): the pre-tip is credit
 * toward the session's total, so each PPV costs its list price × (1 − tip ÷ total),
 * never below 30% of the list price. `total` = his usual spend per session, else
 * the setting (default $250).
 */
function roleplayPrice(list, { tip = 0, total = 250, floor = 0.3 } = {}) {
  const share = total > 0 ? Math.min(1, Math.max(0, tip / total)) : 0;
  return Math.max(Math.round(list * floor), Math.round(list * (1 - share)));
}

/** A tip after a service offer: did it cover the price (a little under is fine)? */
const covers = (tip, price) => Number(tip) > 0 && Number(tip) >= price * 0.8;

module.exports = { SERVICES, KINDS, servicesOf, requestOf, priceFor, roleplayPrice, covers, BANNED };
