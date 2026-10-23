/**
 * Claude as the AI chat's safety reviewer (Claude Haiku 5.5: cheap and quick).
 * It only judges: a fan message the code checks found doubtful (is it sexual and
 * about a minor?), and a reply they found doubtful (does it break a house rule?).
 * It answers yes or no with reasons and never writes or rewrites a reply. If it
 * declines to look, that counts as "a person should check", never as approved.
 */
const { client } = require('../agentRunner');
const { HOUSE_RULES } = require('./prompts');
const { mediaNote, emptyBody } = require('./notes');
const { ago } = require('./memory');

const MODEL = 'claude-haiku-5-5';
const tidy = (x) => String(x || '').replace(/\s+/g, ' ').trim();
const PRICE = [0.10, 0.50];            // $ per million tokens in / out (prompts up to 100K tokens)

const FAN_SCHEMA = {
  type: 'object',
  properties: { stop: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['stop', 'reason'],
  additionalProperties: false,
};
const REPLY_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } } },
  required: ['ok', 'problems'],
  additionalProperties: false,
};

const DUEL_SCHEMA = {
  type: 'object',
  properties: { better: { type: 'string', enum: ['A', 'B', 'C', 'tie', 'none'] }, reason: { type: 'string' } },
  required: ['better', 'reason'],
  additionalProperties: false,
};

async function ask(system, user, schema, effort = 'low') {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort, format: { type: 'json_schema', schema } },
  });
  const usage = { input: res.usage?.input_tokens || 0, output: res.usage?.output_tokens || 0 };
  usage.cost = (usage.input * PRICE[0] + usage.output * PRICE[1]) / 1e6;
  if (res.stop_reason === 'refusal') return { declined: true, usage };
  const text = res.content.find(b => b.type === 'text')?.text || '';
  try { return { answer: JSON.parse(text), usage }; }
  catch { return { declined: true, usage }; }
}

/** A fan's message(s) the code checks found doubtful. Returns { stop, reason, declined, usage }. */
async function reviewFan(texts) {
  const r = await ask(
    'You screen messages that fans send to an AI character on Fanvue, a subscription site for verified adults, before the AI sees them. Adult flirting and sex talk between adults is allowed. You only decide whether a message brings minors or family members into anything sexual.',
    `The fan wrote:\n${texts.map(t => `"${String(t).replace(/\s+/g, ' ').trim()}"`).join('\n')}\n\n`
      + 'Answer stop = true if anything here is sexual or flirty AND connected to someone under 18 or who seems underage, age play, a school setting with a minor, or family or step-family members; or if the fan says he himself is under 18. '
      + 'Mentioning his children, family, school or his own past in a normal, non-sexual way is fine: stop = false. Give a short plain reason.',
    FAN_SCHEMA);
  if (r.declined) return { stop: true, declined: true, reason: 'Claude declined to look at it, so a person should.', usage: r.usage };
  return { stop: !!r.answer.stop, reason: String(r.answer.reason || ''), usage: r.usage };
}

/** A drafted reply the code checks found doubtful. Returns { ok, problems, declined, usage }. */
async function reviewReply({ fanTexts = [], messages = [], flags = [] }) {
  const r = await ask(
    'You check chat replies written by an AI character on Fanvue, a subscription site for verified adults. Adult flirting and sex talk between the character and adult fans is allowed. You only check the house rules given. You never rewrite the reply.',
    `House rules:\n${HOUSE_RULES.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\n`
      + `His latest message(s):\n${fanTexts.map(t => `"${String(t).replace(/\s+/g, ' ').trim()}"`).join('\n') || '(none)'}\n\n`
      + `The reply she would send:\n${messages.map(t => `"${String(t).replace(/\s+/g, ' ').trim()}"`).join('\n')}\n\n`
      + `The automatic check flagged: ${flags.join(' ') || 'nothing'}\n\n`
      + 'Does the reply break a house rule? ok = true if it doesn\'t. Playful, open-ended lines about meeting ("maybe one day", "I need more time for decisions like that") are fine; she must not agree to meet, name a place or time, or share contact details. List each problem in one short plain sentence.',
    REPLY_SCHEMA);
  if (r.declined) return { ok: false, declined: true, problems: ['Claude declined to check this reply, so a person should look at it.'], usage: r.usage };
  return { ok: !!r.answer.ok, problems: (r.answer.problems || []).map(String).filter(Boolean), usage: r.usage };
}

/**
 * The blind test: which of the replies to the same moment (A, B and maybe C) is
 * best? It isn't told who wrote any of them. It judges by what the agency's
 * analysis of ~35k chats found works, and its list of costly mistakes; not by
 * how her old chats sounded. `fan` = what was known about him then.
 * Returns { better: 'A' | 'B' | 'C' | 'tie' | 'none', reason, declined, usage }.
 */
const MISTAKES = [
  'ignores what he said or asked, or answers something else',
  'robotic, generic or scripted; could be sent to anyone',
  'more sexual than he is, or explicit too soon (teasing beats describing)',
  'pushy, needy or selling (prices, PPVs, "did you open what I sent")',
  'repeats itself or her earlier lines; the same opener again ("heyy", "hehe", "mmm")',
  'makes things up (a name he never gave, shared history, facts about him)',
  'doesn\'t make sense in the chat, or is awkwardly worded',
  'greets him again mid-chat, or ignores a joke he made',
  'claims to be a real person, agrees to meet, or shares contact details',
];
async function judgeDuel({ profile = {}, chat = [], options = [], fan = null }) {
  const letters = ['A', 'B', 'C'].slice(0, options.length);
  const said = (list) => list.map(t => `- ${String(t).replace(/\s+/g, ' ').trim()}`).join('\n');
  const who = [profile.name, profile.vibe && `vibe: ${profile.vibe}`, profile.personality && `personality: ${tidy(profile.personality).slice(0, 300)}`].filter(Boolean).join('; ');
  const him = fan ? `About him then: ${fan.standing_text ? `${fan.standing_text} ` : ''}${fan.spent_before ? `He had spent $${fan.spent_before} with her` : 'He had not spent anything yet'}; ${fan.messages_before} messages in the chat so far.\n\n` : '';
  const line = (m) => {
    const note = mediaNote(m);
    const text = String(m.text || '').replace(/\s+/g, ' ').trim() || emptyBody(m);
    return `${m.from_fan ? 'Him' : m.mass ? 'Her (mass message to all fans)' : 'Her'}: ${text}${note ? ` [${note}]` : ''}`;
  };
  const r = await ask(
    'You compare possible replies a creator could send a fan on Fanvue, a subscription site for verified adults. Adult flirting and sex talk are allowed. You are not told who wrote any reply.',
    `The creator: ${who || 'unknown'}\n\n${him}`
      + `The chat so far (oldest first):\n${chat.map(line).join('\n')}\n\n`
      + letters.map((l, i) => `Reply ${l}:\n${said(options[i])}`).join('\n\n') + '\n\n'
      + 'Judge like the agency\'s best chatter would. The best reply answers what he actually said, sounds like a real girl texting (natural, specific to him, building on his words), matches his mood and how sexual he is (at most a small step further, and only once they are past the warm-up), and keeps the chat going without pushing.\n'
      + `Costly mistakes (from the analysis of ~35k chats):\n${MISTAKES.map(x => `- ${x}`).join('\n')}\n`
      + 'A reply with a costly mistake loses to one without. Length is not quality, and flirting is not automatically better: a friendly, fitting answer beats a flirty one that ignores him. '
      + `Answer ${letters.join(', ')}; "tie" if the best ones are about equally good; "none" if every reply has a costly mistake. Give the reason in one short sentence, naming the mistake if there is one.`,
    DUEL_SCHEMA, 'medium');
  if (r.declined) return { declined: true, better: null, reason: 'Claude declined to judge this one.', usage: r.usage };
  return { better: r.answer.better, reason: String(r.answer.reason || ''), usage: r.usage };
}

/**
 * A PPV she is about to send: does the caption promise only what's really in the
 * item, and if he asked for something specific, does the item match it (or does
 * she say honestly that it's different)? Returns { ok, problems, declined, usage }.
 */
async function reviewOffer({ fanTexts = [], messages = [], item }) {
  const r = await ask(
    'You check PPV offers an AI creator sends fans on Fanvue, a subscription site for verified adults. Adult content is allowed. You only check that the offer is truthful about what the content really is. You never rewrite anything.',
    `His last messages:\n${fanTexts.map(t => `"${String(t).replace(/\s+/g, ' ').trim()}"`).join('\n') || '(none)'}\n\n`
      + `What she writes with the PPV:\n${messages.map(t => `"${String(t).replace(/\s+/g, ' ').trim()}"`).join('\n')}\n\n`
      + `What the PPV really is: "${item.title}", ${item.what}. Inside: ${item.description}${item.seen ? ` In the files (the platform's own analysis): ${item.seen}.` : ''}\n\n`
      + 'Only check what she says the PPV itself shows or contains. Flirting, sexting and fantasy about what she would do with him are fine and are not claims about the content; teasing and leaving details out are fine too. '
      + 'ok = true unless (1) she says or clearly implies the PPV contains something it doesn\'t (a video when it\'s photos, a toy, an act, a place, an outfit, another person that isn\'t in it), or (2) he asked for something specific that this item is not, and she presents it as that thing instead of saying it\'s not exactly that. List each problem in one short plain sentence.',
    REPLY_SCHEMA);
  if (r.declined) return { ok: true, declined: true, problems: [], usage: r.usage };
  return { ok: !!r.answer.ok, problems: (r.answer.problems || []).map(String).filter(Boolean), usage: r.usage };
}

/**
 * A drafted reply that asks him something: does the question make sense here, the way a real
 * girl would ask it? (A question can keep every rule and still be odd: "what's making it quiet
 * over there?" to a man who said his afternoon is quiet.) Returns { ok, problem, declined, usage };
 * when Claude declines, the reply goes on as it is.
 */
const QUESTION_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, problem: { type: 'string' } },
  required: ['ok', 'problem'],
  additionalProperties: false,
};
async function questionCheck({ chat = [], messages = [] }) {
  const line = (m) => `${m.from_fan ? 'Him' : 'Her'}: ${String(m.text || '').replace(/\s+/g, ' ').trim() || emptyBody(m)}`;
  const r = await ask(
    'You check the questions in chat replies of a creator on Fanvue, a subscription site for verified adults, before they are sent. You only judge whether the question makes sense in the chat. You never rewrite it.',
    `The chat (oldest first, the last part):\n${chat.filter(m => !m.mass).slice(-10).map(line).join('\n')}\n\n`
      + `Her reply:\n${messages.map(t => `- ${String(t).replace(/\s+/g, ' ').trim()}`).join('\n')}\n\n`
      + 'Does the question in her reply make sense as something a real girl would naturally ask him right now? ok = false only when it clearly doesn\'t: it assumes something he never said or treats something ordinary as a problem with a cause ("what\'s making it quiet?" after "quiet afternoon"); it asks what his joke meant, or takes a joke literally; it asks something he already answered, or something she already asked; it doesn\'t follow from the chat; or it is so odd he would answer it with sarcasm. A simple, ordinary question is fine: ok = true. A reply with no real question (only a tag like "you know?" or "right?", or his words back like "really?") is fine too: ok = true. problem: one short plain sentence saying what is wrong, or "".',
    QUESTION_SCHEMA);
  if (r.declined) return { ok: true, declined: true, problem: '', usage: r.usage };
  return { ok: !!r.answer.ok, problem: String(r.answer.problem || '').trim(), usage: r.usage };
}

/**
 * Claude's watch-only check of a Practice reply (it never blocks or rewrites):
 * does she answer him, does it fit the moment and the plan, are his notes and her
 * facts used right, is the selling call right, does it repeat a mistake the
 * manager marked. It sees what the writer saw: who he is, the plan, the chat, the
 * rules (rules.js) and the manager's notes. Returns { points, overall, summary,
 * declined, usage }.
 */
const POINT = {
  type: 'object',
  properties: { verdict: { type: 'string', enum: ['good', 'weak', 'n/a'] }, note: { type: 'string' } },
  required: ['verdict', 'note'],
  additionalProperties: false,
};
const COACH_SCHEMA = {
  type: 'object',
  properties: {
    answers_him: POINT, understood: POINT, fits_moment: POINT, clear: POINT, notes_facts: POINT, selling: POINT, lessons: POINT,
    overall: { type: 'string', enum: ['good', 'okay', 'weak'] }, summary: { type: 'string' },
  },
  required: ['answers_him', 'understood', 'fits_moment', 'clear', 'notes_facts', 'selling', 'lessons', 'overall', 'summary'],
  additionalProperties: false,
};
async function coachCheck({ profile = {}, fan = null, card = [], plan = null, chat = [], messages = [], ppv = null, rules = [], lessons = [], diary = [] }) {
  const line = (m) => `${m.from_fan ? 'Him' : m.mass ? 'Her (mass message)' : 'Her'}: ${String(m.text || '').replace(/\s+/g, ' ').trim() || emptyBody(m)}${mediaNote(m) ? ` [${mediaNote(m)}]` : ''}`;
  const who = [profile.name, profile.vibe && `vibe: ${profile.vibe}`, profile.personality && `personality: ${tidy(profile.personality).slice(0, 300)}`, profile.likes && `likes: ${tidy(profile.likes).slice(0, 150)}`, profile.heat && `how spicy: ${profile.heat}`].filter(Boolean).join('; ');
  const him = fan ? `${fan.name ? `he goes by ${fan.name}; ` : ''}${fan.tier_label}${fan.new_sub ? ', new subscriber' : ''}${fan.time_waster ? ', time waster' : ''}${fan.suspicious ? ', suspicious' : ''}; closeness: ${fan.closeness}; free talk ${fan.budget.used} of ${fan.budget.limit}` : 'unknown';
  const r = await ask(
    'You coach the chat replies of an AI character on Fanvue, a subscription site for verified adults; flirting and sex talk between adults are allowed. You judge one reply against the agency\'s rules, the plan made for it and the manager\'s notes. You never rewrite it. Be specific and short.',
    `The creator: ${who || 'unknown'}\n\nWho he is: ${him}\n`
      + `His notes: ${card.map(f => `(${f.kind}${f.on ? `, on ${f.on}` : f.said_at ? `, said ${ago(f.said_at)}` : ''}) ${f.text}`).join('; ') || 'none'}\n`
      + `What she has told fans about herself (she must stay consistent with it): ${diary.map(d => String(d.text || d)).join('; ') || 'nothing yet'}\n\n`
      + (plan ? `The plan made for this reply: ${plan.goal_text} (because ${plan.why}). PPV: ${plan.sell.allowed ? 'allowed' : `none (${plan.sell.why})`}. Questions: ${plan.ask.allowed ? 'one at most' : `none (${plan.ask.why})`}. Length: ${plan.length.text}.`
        + `${plan.tone ? ` Tone: ${plan.tone}.` : ''}${plan.callback ? ` Bring up from his notes: "${plan.callback.note}" (${plan.callback.ask}).` : ''}${plan.check ? ` Check with him: he just contradicted the note "${plan.check.note}".` : ''}`
        + `${plan.hook ? ` Hook for next time: "${plan.hook.note}" (${plan.hook.when}).` : ''}${plan.back ? ` He's back after ${plan.back}.` : ''}${plan.story ? ` Story move: "${plan.story.move}".` : ''}${plan.event ? ` A moment of hers planned: ${plan.event.text}.` : ''}${plan.touch ? ` Also, in passing: ${plan.touch.text}.` : ''}`
        + `${plan.reading?.thread === 'dead' ? ' The topic they were on had run out (his short answers): moving on to something new is right here, not ignoring him.' : ''}${plan.reading?.answers === 'joke' ? ' He answered her last message with a joke: playing along is right; asking what he meant is not.' : ''}${plan.hard ? ' He is sharing something hard: judge understood by six things: the feeling named and validated; his own words reflected; one invitation to say more; no advice he did not ask for; nothing dismissive ("don\'t worry", "it\'ll be okay", "at least"); nothing about herself.' : ''}${plan.reading?.answers === 'closing' ? ' He closed the exchange with a pleasantry: leading with something new is right here; reacting to it is not.' : ''}\n\n` : '')
      + `The chat (oldest first, the last part):\n${chat.slice(-24).map(line).join('\n')}\n\n`
      + `Her reply:\n${messages.map(t => `- ${String(t).replace(/\s+/g, ' ').trim()}`).join('\n')}${ppv ? `\n[with a PPV: "${ppv.title}", $${ppv.price}, ${ppv.what}]` : ''}\n\n`
      + `The agency's rules:\n${rules.map(x => `- ${x}`).join('\n')}\n\n`
      + `The manager's notes on earlier replies (mistakes not to repeat):\n${lessons.length ? lessons.map(l => `- ${l.kind === 'wording' ? 'Wording' : 'Decision'}: "${l.note}"${l.better ? ` (better: ${l.better})` : ''}`).join('\n') : '- none yet'}\n\n`
      + 'Judge the reply on each point: good, weak, or n/a; a short note for each (what exactly is weak, or why it\'s good):\n'
      + '- answers_him: does it answer or react to what he actually said (no ignored question, no going off on something else)?\n'
      + '- understood: does it show she understood exactly what he said: a specific detail of his picked up, the feeling named in his own words when he shared something, a compliment or an admission received rather than brushed off or quipped past? Declared feelings ("I care so much", "I miss you", "you mean the world to me") count against this point, not for it; never ask for a warmer reply.\n'
      + '- fits_moment: does it fit the stage of the chat, his mood and the plan (leading vs stalling, no selling to a sad fan, the right length)?\n'
      + '- clear: could he misunderstand a line of hers: a "that" or "some of that" with nothing it points to, an in-joke he was not part of, a claim the moment doesn\'t support (a feeling he didn\'t cause)? weak if so, good if every line is plain.\n'
      + '- notes_facts: are his notes and her own facts used right (nothing invented, nothing contradicted, callbacks natural)? n/a if none are touched.\n'
      + '- selling: if it sells or talks price: right moment, item and price? n/a if it doesn\'t sell.\n'
      + '- lessons: does it repeat a mistake from the manager\'s notes? good if not, n/a if there are no notes.\n'
      + 'overall: good, okay or weak; summary: one short sentence.',
    COACH_SCHEMA);
  if (r.declined) return { declined: true, points: {}, overall: 'declined', summary: 'Claude declined to look at this one.', usage: r.usage };
  const { overall, summary, ...points } = r.answer;
  return { points, overall, summary: String(summary || ''), usage: r.usage };
}

const RULES_SCHEMA = {
  type: 'object',
  properties: { rules: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, from: { type: 'array', items: { type: 'integer' } } }, required: ['text', 'from'], additionalProperties: false } } },
  required: ['rules'],
  additionalProperties: false,
};
/**
 * Rules drafted from the manager's repeated marks (C2): one line each, general enough
 * for similar moments, specific enough to act on; never her words. `marks` = ai_feedback
 * rows ({ id, his, her, note, better }). Returns { rules: [{ text, from }], usage }.
 */
async function draftRulesFrom(marks, { goal = null, kind = 'wording' } = {}) {
  const r = await ask(
    'You turn a manager\'s marks on an AI character\'s chat replies (on Fanvue, a subscription site for verified adults; adult flirting and sex talk between adults is normal there) into short rules the writer follows every time. Never write her words for her: a rule says what to do or to avoid, not a line to send.',
    `The manager marked these replies${goal ? ` (the moment: ${goal.replace(/_/g, ' ')})` : ''} as ${kind === 'wording' ? 'badly worded' : 'the wrong call'}. Each mark has an id.\n\n`
      + marks.map(m => `#${m.id}\nHim: ${m.his || '(he was quiet)'}\nHer: ${(m.her || []).join(' / ') || '(her reply)'}\nThe manager: ${m.note}${m.better ? `\nBetter: ${m.better}` : ''}`).join('\n\n')
      + '\n\nWrite 1 to 3 rules that cover what these marks have in common: each one line, starting with "When…", "Never…" or "Always…", general enough for similar moments, specific enough to act on. For each rule, list the ids of the marks it comes from (two or more). A mark that shares nothing with the others is left out.',
    RULES_SCHEMA);
  if (r.declined) return { rules: [], usage: r.usage };
  const rules = (r.answer?.rules || []).map(x => ({ text: String(x.text || '').trim().slice(0, 300), from: (x.from || []).map(Number).filter(Number.isInteger) })).filter(x => x.text);
  return { rules, usage: r.usage };
}

module.exports = { reviewFan, reviewReply, reviewOffer, questionCheck, judgeDuel, coachCheck, draftRulesFrom, MODEL };
