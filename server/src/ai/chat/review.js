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

const MODEL = 'claude-haiku-5-5';
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
      + 'Does the reply break a house rule? ok = true if it doesn\'t. A playful "I wish" about meeting is fine as long as she doesn\'t agree to meet or suggest she could. List each problem in one short plain sentence.',
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
  const who = [profile.name, profile.vibe && `vibe: ${profile.vibe}`].filter(Boolean).join('; ');
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

module.exports = { reviewFan, reviewReply, judgeDuel, MODEL };
