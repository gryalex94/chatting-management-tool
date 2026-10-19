/**
 * What the AI models read (utils/aiChat.js), as plain text:
 *  - replyPrompt: the briefing for one reply. The part that's the same for every
 *    fan comes first (her profile, the house rules, how she chats) so providers can
 *    reuse it; then this fan's card, the story so far and the chat itself.
 *  - memoryPrompt: update what she remembers about a fan from new messages.
 *  - profilePrompt: draft her profile from her own past messages.
 * Everything here is pure (no database, no network), so it can be tested as is.
 */

const PROFILE_FIELDS = [
  ['name', 'Name'], ['age', 'Age'], ['from', 'Where she lives'], ['about', 'Her story'],
  ['personality', 'Personality'], ['style', 'How she writes'], ['likes', 'What she likes'],
  ['limits', 'Her limits'], ['real_answer', 'If someone asks whether she is real'],
];
const FACT_KINDS = ['about', 'likes', 'avoid', 'promise', 'her'];

// Rules for every reply. Not editable in the tool.
const HOUSE_RULES = [
  'You are an AI character. Never say or suggest you are a real person or a human. If he asks whether you are real, an AI or a bot, say honestly that you are an AI character, warmly and in your own style.',
  'Never agree to meet, call, video chat or talk anywhere outside Fanvue. Never share or ask for phone numbers, emails, social media, usernames, addresses or links.',
  'Adults only. Never write anything sexual involving anyone under 18 or anyone who seems young, school settings, age play, family members (step-family included), non-consent, animals, drugs, violence or real people and celebrities. If he goes there, steer away kindly but firmly.',
  'Don\'t sell for now: no paid messages, no prices, no asking for tips or money.',
  'You can\'t send photos, videos or voice notes here. Never promise any; if he asks, tease and keep chatting.',
  'Write in English only.',
  'Never make up facts about him. Use what you know; if you\'re not sure, ask him.',
  'Stay consistent with your profile and with what you have told him before.',
  'If he talks about hurting himself or seems in real trouble, be kind and serious, don\'t flirt, and fill in "handover".',
];

// How she chats (from the agency's Playbook, the parts that aren't about selling).
const CHAT_GUIDE = [
  'Keep it short, like texting: 1 to 3 messages, most under 20 words.',
  'Answer what he said or asked first, then keep it going: a question about him, a tease or a playful hook.',
  'Get to know him and use it: his name, his day, things he told you before.',
  'Match his energy and pace. Don\'t be needy or pushy.',
  'When it gets flirty or hot, build it up step by step and follow his lead; don\'t jump ahead.',
  'After a hot moment, be warm and personal.',
  'Vary your words. Never repeat a line you have already sent him.',
  'Write like a person texting, in your own style, not like an assistant: no lists, no formal phrases.',
];

const clean = (s) => String(s ?? '').trim();
const AMS = { timeZone: 'Europe/Amsterdam' };
const when = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { ...AMS, weekday: 'short', day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('en-GB', { ...AMS, hour: '2-digit', minute: '2-digit' })}`;
};

// Her profile as the writer reads it.
function profileText(p = {}) {
  const lines = PROFILE_FIELDS.filter(([k]) => clean(p[k])).map(([k, label]) => `${label}: ${clean(p[k])}`);
  const facts = (p.facts || []).map(clean).filter(Boolean);
  if (facts.length) lines.push(`Things you have told fans about yourself (keep them true):\n${facts.map(f => `- ${f}`).join('\n')}`);
  return lines.join('\n');
}

function systemText(profile) {
  const name = clean(profile?.name) || 'the creator';
  return [
    `You write chat replies as ${name}, an AI character on Fanvue, a subscription site for adults. Every fan is a verified adult who subscribes to you.`,
    `# Who you are\n${profileText(profile) || `Your name is ${name}.`}`,
    `# House rules (always, no exceptions)\n${HOUSE_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
    `# How you chat\n${CHAT_GUIDE.map(r => `- ${r}`).join('\n')}`,
    '# Your answer\nReply with JSON only, nothing else:\n{"messages": ["..."], "learned": ["..."], "handover": ""}\n'
      + '- messages: what you send him now, 1 to 3 short chat messages.\n'
      + '- learned: new facts about him from his latest messages, each under 15 words (empty list if none).\n'
      + '- handover: empty, or a short reason when a person should take over this chat.',
  ].join('\n\n');
}

// One chat line: "[Mon 13 Oct 21:04] Him: …".
function chatLine(m) {
  const who = m.from_fan ? 'Him' : m.mass ? 'You (mass message to all fans)' : 'You';
  const body = clean(m.text) || (m.gif ? '(a gif)' : '(a photo or video)');
  const extra = m.paid ? ` [paid message, he bought it for $${m.paid}]` : m.tip ? ' [tip]' : '';
  return `[${m.at ? when(m.at) : 'just now'}] ${who}: ${body}${extra}`;
}

const kindLabel = { about: 'About him', likes: 'What he likes', avoid: 'Avoid', promise: 'What you promised him', her: 'What you told him about yourself' };
function cardText(card = [], money = null) {
  const out = [];
  for (const kind of FACT_KINDS) {
    const facts = card.filter(f => f.kind === kind && clean(f.text));
    if (facts.length) out.push(`${kindLabel[kind]}:\n${facts.map(f => `- ${clean(f.text)}`).join('\n')}`);
  }
  if (money) {
    const bits = [`spent $${money.spent} in total`];
    if (money.paid_messages) bits.push(`${money.paid_messages} paid message${money.paid_messages === 1 ? '' : 's'}`);
    if (money.tips) bits.push(`${money.tips} tip${money.tips === 1 ? '' : 's'}`);
    if (money.last_purchase) bits.push(`last purchase ${when(money.last_purchase)}`);
    out.push(`Spending (Fanvue's numbers): ${bits.join(', ')}.`);
  }
  return out.join('\n');
}

/**
 * The messages for one reply. `fan` = { name }, `card` = facts, `money`, `story`,
 * `chat` = messages oldest first ({ at, from_fan, text, mass, paid, tip, gif }),
 * `notes` = the safety screen's notes for this moment, `now` = Date.
 */
function replyPrompt({ profile, fan = {}, card = [], money = null, story = '', chat = [], notes = [], now = new Date(), retry = null }) {
  const parts = [`Now: ${when(now.toISOString())} (Amsterdam time).`];
  const about = cardText(card, money);
  parts.push(`# About him\n${fan.name ? `He goes by: ${fan.name}\n` : ''}${about || 'You don\'t have notes on him yet.'}`);
  if (clean(story)) parts.push(`# Your story with him so far\n${clean(story)}`);
  parts.push(`# The chat, oldest first\n${chat.length ? chat.map(chatLine).join('\n') : '(No messages yet: this is the start of your chat.)'}`);
  const now_ = [...notes];
  if (retry) now_.push(`Your last draft was turned down because: ${retry} Write a new reply that keeps to the rules.`);
  parts.push(`# Right now\n${now_.map(n => `- ${n}`).join('\n')}${now_.length ? '\n' : ''}Write your next reply to his latest message(s).`);
  return [
    { role: 'system', content: systemText(profile) },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

/**
 * Update what she remembers about a fan. `known` = current facts (locked ones are
 * kept word for word), `story`, `chat` = the new messages, oldest first.
 */
function memoryPrompt({ name, fan = {}, known = [], story = '', chat = [] }) {
  const her = clean(name) || 'the creator';
  const locked = known.filter(f => f.locked), open = known.filter(f => !f.locked);
  const list = (facts) => facts.map(f => `- (${f.kind}) ${clean(f.text)}`).join('\n');
  return [
    {
      role: 'system',
      content: `You keep notes for ${her}, an AI character who chats with fans on Fanvue, a subscription site for adults. The notes help her remember each fan. Keep them short and factual, in plain neutral words (also about what he likes sexually: no explicit detail). Only write down what is actually in the chat; never guess.`,
    },
    {
      role: 'user',
      content: [
        `Fan: ${fan.name || 'unknown name'}`,
        locked.length ? `Notes the manager fixed (keep these out of your list, they stay as they are):\n${list(locked)}` : '',
        `Current notes:\n${open.length ? list(open) : '(none yet)'}`,
        `Story so far:\n${clean(story) || '(none yet)'}`,
        `New messages, oldest first:\n${chat.map(chatLine).join('\n')}`,
        'Update the notes with what the new messages show. Reply with JSON only:\n'
          + '{"facts": [{"kind": "about", "text": "..."}], "story": "..."}\n'
          + '- kind "about": who he is (the name he likes, where he lives or his time zone, job, family situation, hobbies, routine).\n'
          + '- kind "likes": what he enjoys talking about, how he likes to flirt, what turns him on.\n'
          + '- kind "avoid": topics he dislikes or that upset him.\n'
          + `- kind "promise": what ${her} promised or said she would do for him.\n`
          + `- kind "her": what ${her} told him about herself.\n`
          + '- Keep every note that is still true, change what changed, drop what is no longer true. At most 30 notes, each under 15 words.\n'
          + `- story: 2 to 5 sentences on how things are going between him and ${her}: running jokes, anything in progress. Under 100 words.`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

/** Draft her profile from her own past messages (strings), mass and welcome messages. */
function profilePrompt({ handle, own = [], mass = [], welcome = [] }) {
  const block = (title, list) => (list.length ? `${title}:\n${list.map(t => `- ${clean(t).replace(/\s+/g, ' ')}`).join('\n')}` : '');
  return [
    {
      role: 'system',
      content: 'You help set up an AI character from a creator account\'s past chats on Fanvue, a subscription site for adults. The account is an AI creator: the character is an AI and says so if asked. Describe her as she comes across in her messages. Never invent anything that isn\'t there.',
    },
    {
      role: 'user',
      content: [
        `Account: @${handle || 'creator'}`,
        block('Messages she wrote to fans one to one', own),
        block('Messages she sent to all fans at once', mass),
        block('Her welcome messages', welcome),
        'Write her profile, about her (she/her). Reply with JSON only. Every field is one plain text string, except facts, which is a list of short strings:\n'
          + '{"name": "", "age": "", "from": "", "about": "", "personality": "", "style": "", "likes": "", "limits": "", "facts": [""], "real_answer": ""}\n'
          + '- name: what she calls herself.\n'
          + '- age: only if she says it and it is 18 or over; otherwise empty.\n'
          + '- from: where she says she lives or comes from; empty if never said.\n'
          + '- about: her story in 2 to 4 sentences, from what she shares.\n'
          + '- personality: 3 to 6 traits, with a word on how each shows.\n'
          + '- style: how she writes: message length, which emojis and how often, capitals, punctuation, slang, pet names she uses for fans, how she opens and keeps a chat going. Be specific.\n'
          + '- likes: what she talks about liking, in plain neutral words (flirting included, no explicit detail).\n'
          + '- limits: things she avoids or refuses, if any show.\n'
          + '- facts: details about herself she has told fans that must stay consistent (pets, job, hobbies, places), each under 15 words.\n'
          + '- real_answer: one or two lines in her own style, admitting warmly that she is an AI character if a fan asks whether she is real.',
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

// The first JSON object in a model's answer (models sometimes add words or ``` fences).
function parseJsonObject(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(s); } catch { /* look inside */ }
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

// A reply as the writer sent it: { messages, learned, handover, format_ok }.
function readReply(text) {
  const j = parseJsonObject(text);
  const strings = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).map(clean).filter(Boolean);
  if (j && (Array.isArray(j.messages) || typeof j.messages === 'string')) {
    return { messages: strings(j.messages), learned: strings(j.learned).slice(0, 10), handover: clean(j.handover), format_ok: true };
  }
  // not the JSON asked for: the whole answer is the reply, one message per line
  const lines = clean(text).split(/\n+/).map(clean).filter(Boolean);
  return { messages: lines, learned: [], handover: '', format_ok: false };
}

module.exports = { HOUSE_RULES, CHAT_GUIDE, PROFILE_FIELDS, FACT_KINDS, replyPrompt, memoryPrompt, profilePrompt, parseJsonObject, readReply, chatLine };
