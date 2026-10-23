/**
 * Her game plan: how she plays a conversation, from the agency's Playbook
 * (playbook.json, taken from 34,817 analysed conversations), without the selling
 * parts while she doesn't sell.
 *  - GAME_PLAN: the steps of a conversation, always in her instructions.
 *  - For each reply, a cheap model picks the 1–3 situations that fit this moment
 *    (pickPrompt / readPick) and she gets just those guides (situationGuide).
 * Pure (no database, no network).
 */
const PLAYBOOK = require('./playbook.json');
const { mediaNote } = require('./notes');

const clean = (s) => String(s ?? '').trim();
// Advice for human chatters that doesn't apply to an AI (she always answers in time).
const NOT_FOR_AI = /reply fast|speed matters/i;

const SITUATIONS = PLAYBOOK.situations.filter(s => !s.selling);
const byId = Object.fromEntries(PLAYBOOK.situations.map(s => [s.id, s]));

const GAME_PLAN = [
  'The steps of a conversation: get him talking, warm up, build tension, then aftercare. Know which step you are in.',
  ...PLAYBOOK.steps.flatMap(s => [
    ...s.do.filter(d => !NOT_FOR_AI.test(d)).map(d => `${s.title}: ${d}`),
    ...s.avoid.map(a => `${s.title}, avoid: ${a}`),
  ]),
  'Play it all in your own vibe: bratty teases and pushes back, dominant takes the lead, a sweet girlfriend is caring and affectionate, shy lets him lead, a playful tease keeps him guessing.',
];

// Facts about the moment that help pick a situation.
function momentFacts(chat, money) {
  const his = chat.filter(m => m.from_fan);
  const out = [`He has written ${his.length} message${his.length === 1 ? '' : 's'} in this chat so far.`];
  const last = his[his.length - 1], before = his.length > 1 ? his[his.length - 2] : null;
  if (last?.at && before?.at) {
    const h = (Date.parse(last.at) - Date.parse(before.at)) / 3600_000;
    if (h >= 48) out.push(`He is back after ${Math.round(h / 24)} days of silence.`);
    else if (h >= 6) out.push(`He is back after ${Math.round(h)} hours.`);
  }
  if (!chat.some(m => !m.from_fan && !m.mass)) out.push('You have never chatted with him one to one before.');
  if (money?.standing?.text) out.push(money.standing.text);
  if (money?.spent > 0) out.push(`He has spent $${money.spent} with you.`);
  return out.join(' ');
}

const line = (m) => {
  const note = mediaNote(m);
  return `${m.from_fan ? 'Him' : 'You'}: ${clean(m.text).replace(/\s+/g, ' ') || '(a photo or video)'}${note ? ` [${note}]` : ''}`;
};

/**
 * The messages for the situation picker: the menu, the facts and the last messages.
 * `notes` = what she remembers about him (texts): it also says when his latest
 * message contradicts one (Q14).
 */
function pickPrompt({ chat, money, selling = false, notes = [] }) {
  const menu = selling ? PLAYBOOK.situations : SITUATIONS;
  return [
    { role: 'system', content: 'You match a moment in a chat between a creator and a fan to situations from a chatting playbook. Answer with JSON only.' },
    {
      role: 'user',
      content: [
        `Situations:\n${menu.map(s => `${s.id}: ${s.title}`).join('\n')}`,
        `About this moment: ${momentFacts(chat, money)}`,
        `The last messages:\n${chat.filter(m => !m.mass).slice(-10).map(line).join('\n')}`,
        notes.length ? `What she remembers about him:\n${notes.map(n => `- ${n}`).join('\n')}` : '',
        'Which situations (at most 3) fit his latest message right now? Only ones that clearly fit.\n'
          + 'level: how sexual his latest message is: 0 = friendly, no flirting; 1 = flirty (compliments, light teasing); 2 = suggestive (hints, innuendo); 3 = explicit (sex acts or intimate body parts).\n'
          + `mood: his mood right now, one of ${MOODS.join(', ')}.\n`
          + 'pulled_back: true if he is slowing things down (says it\'s going fast, changes the subject away from sex, seems put off).\n'
          + (notes.length ? 'contradicts: if his latest message clearly contradicts one of the remembered notes (he now says something different about the same thing: the note says he has a dog, now he says he has no pets; the note says he lives in Texas, now he says he lives in Ohio), copy that note word for word; else "". New details that fit, or things he says about her, are not contradictions.\n' : '')
          + `Reply with JSON only: {"ids": ["..."], "level": 0, "mood": "chatty", "pulled_back": false${notes.length ? ', "contradicts": ""' : ''}}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

// ── The reading (engine v2, step 2): Claude reads the human side of the moment ──
const DOING = ['small_talk', 'sharing', 'asking', 'flirting', 'sexting', 'testing', 'provoking', 'joking', 'venting', 'negotiating', 'buying', 'leaving', 'complaining', 'other'];
const STANCES = ['steady', 'curious', 'playful', 'match', 'deflect', 'comfort', 'firm'];
/**
 * The messages for the reader (Claude): the situations menu and the moment, as for the picker,
 * plus what a person would notice: what he is doing, what is new or surprising, the ways his
 * message can be read (with how sure), what a real girl in her place would want to ask, and
 * the stance that fits. Code decides what to do with it (plan.js, gauges.js).
 */
function readPrompt({ chat, money, selling = false, notes = [] }) {
  const menu = selling ? PLAYBOOK.situations : SITUATIONS;
  // her last message before his latest ones: his reply is first of all an answer to it
  const real = chat.filter(m => !m.mass);
  let i = real.length - 1;
  while (i >= 0 && real[i].from_fan) i -= 1;
  const herLast = i >= 0 ? clean(real[i].text).replace(/\s+/g, ' ') : '';
  return [
    { role: 'system', content: 'You read one moment in a chat between a creator on Fanvue (an AI character played as a real girl; every fan is a verified adult) and a fan, for the engine that decides her next reply. You never write her reply. Read his latest message the way a sharp, warm woman in her place would: what he is doing, what is new, what it could mean, what she would want to know. Answer with JSON only.' },
    {
      role: 'user',
      content: [
        `Situations:\n${menu.map(s => `${s.id}: ${s.title}`).join('\n')}`,
        `About this moment: ${momentFacts(chat, money)}`,
        `The last messages:\n${chat.filter(m => !m.mass).slice(-12).map(line).join('\n')}`,
        notes.length ? `What she remembers about him:\n${notes.map(n => `- ${n}`).join('\n')}` : '',
        herLast ? `Her last message to him: "${herLast}". Read his latest message first as his answer to it: a short or sarcastic answer often says her message was dull or odd, not that he is.` : '',
        'Answer about his latest message(s):\n'
          + '- ids: the situations (at most 3) that clearly fit right now; only ones that clearly fit.\n'
          + '- level: how sexual his latest message is: 0 = friendly, no flirting; 1 = flirty (compliments, light teasing); 2 = suggestive (hints, innuendo); 3 = explicit (sex acts or intimate body parts). Swearing, politics and slang are not sexual.\n'
          + '- answers: how his latest message answers her last one: "straight" (a real answer), "short" (the bare minimum: "true", "idk", "I guess"), "joke" (a joke or a sarcastic answer, like "lack of bombs" to "what\'s making it quiet?": its meaning is plain, it is not a riddle), "dodge" (he skips what she said), "closing" (a pleasantry that closes the exchange: "got it", "my pleasure", "nice to meet you", "likewise", "cool", "haha ok", "sounds good": nothing in it to react to, she leads with something new; not a joke, not odd), or "" if she asked or said nothing he could answer.\n'
          + '- thread: "dead" when the topic they are on has run out (he has little more to give it: short or joking answers to it, or it has filled two or more of her replies with nothing new from him), so a real girl would let it go and bring up something new; "alive" otherwise.\n'
          + `- mood: his mood right now, one of ${MOODS.join(', ')}.\n`
          + '- pulled_back: true only if he is slowing things down after something sexual (says it\'s going fast, changes the subject away from sex, seems put off).\n'
          + `- doing: what he is doing with this message, one of ${DOING.join(', ')}.\n`
          + '- new: what is new or surprising in it, in one short line of at most 15 words (something she did not know, a turn she would not expect, a line that does not fit the chat so far), or "" if nothing.\n'
          + '- readings: when the message is really open to more than one reading, up to 3 ways to read it, each {"what": "…", "sure": 0–1}, "what" in at most 10 words (for example "he may be gay", "testing whether she is a bot", "wants a reaction"); [] when it is plain.\n'
          + '- curious: a question SHE would ask HIM about his words or his life, in her voice (never about something she herself said; "" when he is asking her to explain herself): what a real girl in her place would want to ask him about it, one short question in plain words (at most 10 words, one question, no "and"), or "" (a question about what he meant, what he is into or who he is is fine; never a graphic one, never something he just answered, never what his joke meant, never more about a dead topic: then a fresh, easy question about him, or ""; never one that treats something ordinary as a problem with a cause).\n'
          + '- asked: his open question(s) to her in his latest message(s), each as he put it, at most 3, [] if none.\n'
          + '- promised: anything she told him earlier in these messages that is still open ("I\'ll show you later", "remind me to tell you"), at most 2, [] if none.\n'
          + '- odd: true when his message does not fit a man chatting up a girl on her page (he talks about other men or his own body in a way that does not involve her, a non-sequitur, a provocation, a line that reads like a test), false when it fits, however blunt; a joke answer to her question is not odd. An edgy or dark joke about himself or his people (violence, stereotypes, "we like to explode") is him testing her reaction: doing "testing", odd true, with a reading "testing her" and one "a real joke".\n'
          + `- stance: the attitude that fits her reply, one of ${STANCES.join(', ')} (steady = warm and normal; curious = she wants to know more first; playful = tease it, don't take it seriously; match = he set the tone, go with it; deflect = don't take the bait, move it somewhere better; comfort = he needs care; firm = a clear boundary, kindly).\n`
          + (notes.length ? '- contradicts: if his latest message clearly contradicts one of the remembered notes (the note says he has a dog, now he says he has no pets), copy that note word for word; else "". New details that fit, or things he says about her, are not contradictions.\n' : '')
          + `Reply with JSON only: {"ids": ["…"], "level": 0, "mood": "chatty", "pulled_back": false, "answers": "straight", "thread": "alive", "doing": "small_talk", "new": "", "readings": [], "curious": "", "asked": [], "promised": [], "odd": false, "stance": "steady"${notes.length ? ', "contradicts": ""' : ''}}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}
/** The reading from Claude's answer, checked: { doing, new, readings: [{ what, sure }], curious, stance, answers, thread }. */
const ANSWERS = ['straight', 'short', 'joke', 'dodge', 'closing'];
function readReading(json) {
  if (!json || typeof json !== 'object') return null;
  const text = (v, n) => clean(v).slice(0, n);
  const readings = (Array.isArray(json.readings) ? json.readings : []).map(r => ({ what: text(r?.what, 120), sure: Math.max(0, Math.min(1, Number(r?.sure) || 0)) })).filter(r => r.what).slice(0, 3);
  const answers = ANSWERS.includes(json.answers) ? json.answers : '';
  return {
    doing: DOING.includes(json.doing) ? json.doing : 'other', new: text(json.new, 200), readings,
    curious: text(json.curious, 160), stance: STANCES.includes(json.stance) ? json.stance : 'steady', odd: json.odd === true && (answers !== 'joke' || json.doing === 'testing'),   // a harmless joke answer isn't odd; a dark one that tests her is
    answers, thread: json.thread === 'dead' ? 'dead' : 'alive',
    asked: (Array.isArray(json.asked) ? json.asked : []).map(x => text(x, 160)).filter(Boolean).slice(0, 3),
    promised: (Array.isArray(json.promised) ? json.promised : []).map(x => text(x, 160)).filter(Boolean).slice(0, 2),
  };
}

// The picked situation ids from the picker's answer (only real ones; selling ones only when she sells).
function readPick(json, { selling = false } = {}) {
  const ids = Array.isArray(json?.ids) ? json.ids : [];
  return [...new Set(ids.map(String))].filter(id => byId[id] && (selling || !byId[id].selling)).slice(0, 3);
}

// His level (0 to 3), mood and whether he pulled back, from the picker's answer.
const MOODS = ['chatty', 'joking', 'curious', 'flirty', 'horny', 'romantic', 'caring', 'tired', 'sad', 'annoyed', 'brief', 'suspicious'];
// The note his latest message contradicts, as the picker copied it: its place in
// `notes` (1-based), or 0. The copy must match a note closely (most of its words).
function readContradiction(json, notes = []) {
  const said = String(json?.contradicts ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').trim();
  if (!said) return 0;
  const words = (t) => new Set(String(t).toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);
  const got = words(said);
  let best = 0, score = 0;
  notes.forEach((n, i) => {
    const w = words(n);
    if (!w.size) return;
    const both = [...w].filter(x => got.has(x)).length;
    const s = both / Math.max(w.size, got.size);
    if (s > score) { score = s; best = i + 1; }
  });
  return score >= 0.6 ? best : 0;
}

function readMood(json) {
  const level = Number.isInteger(json?.level) && json.level >= 0 && json.level <= 3 ? json.level : 0;
  return { his: level, mood: MOODS.includes(json?.mood) ? json.mood : 'chatty', pulled_back: json?.pulled_back === true };
}

/** The guides for the picked situations, as the writer reads them. */
function situationGuide(ids) {
  return ids.map(id => byId[id]).filter(Boolean).map((s) => {
    const parts = [`${s.title}:`];
    for (const d of s.do.filter(x => !NOT_FOR_AI.test(x))) parts.push(`- Do: ${d}`);
    for (const a of s.avoid) parts.push(`- Avoid: ${a}`);
    for (const l of s.lines) parts.push(`- An idea that worked (say it your own way): "${l.line}"${l.why ? `, because ${l.why.replace(/\.$/, '').toLowerCase()}` : ''}`);
    return parts.join('\n');
  }).join('\n\n');
}

const situationTitle = (id) => byId[id]?.title || id;

module.exports = { GAME_PLAN, SITUATIONS, MOODS, DOING, STANCES, pickPrompt, readPrompt, readPick, readMood, readReading, readContradiction, situationGuide, situationTitle, momentFacts };
