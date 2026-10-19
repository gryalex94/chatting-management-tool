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

/** The messages for the situation picker: the menu, the facts and the last messages. */
function pickPrompt({ chat, money }) {
  return [
    { role: 'system', content: 'You match a moment in a chat between a creator and a fan to situations from a chatting playbook. Answer with JSON only.' },
    {
      role: 'user',
      content: [
        `Situations:\n${SITUATIONS.map(s => `${s.id}: ${s.title}`).join('\n')}`,
        `About this moment: ${momentFacts(chat, money)}`,
        `The last messages:\n${chat.filter(m => !m.mass).slice(-10).map(line).join('\n')}`,
        'Which situations (at most 3) fit his latest message right now? Only ones that clearly fit. Reply with JSON only: {"ids": ["..."]}',
      ].join('\n\n'),
    },
  ];
}

// The picked situation ids from the picker's answer (only real, non-selling ones).
function readPick(json) {
  const ids = Array.isArray(json?.ids) ? json.ids : [];
  return [...new Set(ids.map(String))].filter(id => byId[id] && !byId[id].selling).slice(0, 3);
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

module.exports = { GAME_PLAN, SITUATIONS, pickPrompt, readPick, situationGuide, situationTitle, momentFacts };
