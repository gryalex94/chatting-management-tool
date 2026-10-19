/**
 * Claude as the AI chat's safety reviewer (Claude Haiku 5.5: cheap and quick).
 * It only judges: a fan message the code checks found doubtful (is it sexual and
 * about a minor?), and a reply they found doubtful (does it break a house rule?).
 * It answers yes or no with reasons and never writes or rewrites a reply. If it
 * declines to look, that counts as "a person should check", never as approved.
 */
const { client } = require('../agentRunner');
const { HOUSE_RULES } = require('./prompts');

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
 * best? It isn't told who wrote any of them. `fan` = what was known about him
 * then. Returns { better: 'A' | 'B' | 'C' | 'tie' | 'none', reason, declined, usage }.
 */
async function judgeDuel({ profile = {}, chat = [], options = [], fan = null }) {
  const letters = ['A', 'B', 'C'].slice(0, options.length);
  const said = (list) => list.map(t => `- ${String(t).replace(/\s+/g, ' ').trim()}`).join('\n');
  const who = [profile.name, profile.vibe && `vibe: ${profile.vibe}`, profile.style && `how she texts: ${String(profile.style).slice(0, 300)}`].filter(Boolean).join('; ');
  const him = fan ? `About him then: ${fan.spent_before ? `he had spent $${fan.spent_before} with her` : 'he had not spent anything yet'}; ${fan.messages_before} messages in the chat so far.\n\n` : '';
  const r = await ask(
    'You compare possible replies a creator could send a fan on Fanvue, a subscription site for verified adults. Adult flirting and sex talk are allowed. You are not told who wrote any reply.',
    `The creator: ${who || 'unknown'}\n\n${him}`
      + `The chat so far (oldest first):\n${chat.map(m => `${m.from_fan ? 'Him' : 'Her'}: ${String(m.text || '(a photo or video)').replace(/\s+/g, ' ').trim()}`).join('\n')}\n\n`
      + letters.map((l, i) => `Reply ${l}:\n${said(options[i])}`).join('\n\n') + '\n\n'
      + 'Which reply is most likely to keep him engaged and wanting more, so he keeps chatting and spending? It should answer what he said, sound like a real person texting, fit her and the moment, and not be repetitive, needy or pushy. '
      + 'Length is not quality: a short, natural reply is often the best one in a chat. A reply that claims to be human, agrees to meet or shares contact details loses. '
      + `Answer ${letters.join(', ')}; "tie" if the best ones are about equally good; "none" if none of them is good. Give the reason in one short sentence.`,
    DUEL_SCHEMA, 'medium');
  if (r.declined) return { declined: true, better: null, reason: 'Claude declined to judge this one.', usage: r.usage };
  return { better: r.answer.better, reason: String(r.answer.reason || ''), usage: r.usage };
}

module.exports = { reviewFan, reviewReply, judgeDuel, MODEL };
