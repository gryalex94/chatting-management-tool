/**
 * The translator in the Fansly side panel (Claude Haiku):
 *  - incoming(account, fan): his recent messages, each with its language and, when not English, its
 *    English. Only messages not read before go to the AI; the answer is kept on the message
 *    (fansly_messages.lang / text_en), so a message is never paid for twice.
 *  - outgoing(text, lang): a chatter's English reply (or a script) in his language, same tone.
 *  - language(account, fan): the language to answer him in: the one a chatter set, else the one he
 *    writes in most (his last 30 messages that have one).
 * Nothing is sent to Fansly: the panel puts the text in the message box and the chatter sends it.
 */
const { supabaseAdmin } = require('./supabase');
const { client } = require('../ai/agentRunner');

const MODEL = 'claude-haiku-5-5';
const PRICE = { in: 0.10, out: 0.50 };       // dollars per million tokens (Claude Haiku 5.5)
const NAMES = {
  en: 'English', es: 'Spanish', pt: 'Portuguese', de: 'German', fr: 'French', it: 'Italian', nl: 'Dutch', pl: 'Polish', ro: 'Romanian',
  ru: 'Russian', uk: 'Ukrainian', tr: 'Turkish', ar: 'Arabic', he: 'Hebrew', hi: 'Hindi', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  sv: 'Swedish', no: 'Norwegian', da: 'Danish', fi: 'Finnish', cs: 'Czech', el: 'Greek', hu: 'Hungarian', id: 'Indonesian', tl: 'Tagalog', vi: 'Vietnamese', th: 'Thai',
};
const nameOf = (code) => NAMES[code] || code;

const SYSTEM = 'You translate private chat messages between a fan and a creator on Fansly, a subscription site for verified adults. Flirting, dirty talk and explicit sex talk between consenting adults are normal here: '
  + 'translate them faithfully and just as explicit and horny as the original, never soften, censor, tone down, refuse or add warnings. '
  + 'Write the way people really text: casual, warm and informal, never formal or stiff. Use everyday words, contractions and the slang a native speaker would use in a sexy chat; '
  + 'informal "you" (tú, du, tu…, never usted / Sie / vous for one person). Keep the energy: lowercase, stretched words ("holaaa" → "heyyy"), emojis, names, nicknames, prices and line breaks stay. '
  + 'Never add, explain or comment: answer with the translation only.'

// How people really text in each language (what makes a translation read human, not like a textbook).
// Short forms are used sparingly: one or two in a message, not every word, or it reads fake.
const STYLE = {
  es: [
    'Never use the opening ¿ or ¡: people online only write the closing ? and ! ("q haces?", "en serio?!").',
    'Mostly lowercase, few full stops, short sentences. Stretch words for feeling: "siii", "holaaa", "muchooo". Laugh as "jaja" / "jajaja" (never "haha"), but only where the original laughs or jokes.',
    'A few everyday short forms where they fit naturally: q (que), xq (porque/por qué), tb or tmb (también), bn (bien), porfa, ntp (no te preocupes), tqm, bss, finde. Accents may be dropped on quick words.',
    'Simple everyday words only, nothing literary or formal. Warm diminutives: besito, ratito, poquito, cosita. Pet names: amor, bebé, mi amor, papi, mi rey (cariño in Spain).',
    'tú, never usted. Match his region from his own words: vosotros / tío / guay / vale → Spain; wey / güey / neta → Mexico; vos / che / re → Argentina (vos forms); otherwise neutral Latin American.',
    'Sex talk in the words people really use: caliente, mojadita, me pones, me encantas, chupar. Mind the region: "coger" means to have sex in Latin America but just "to take" in Spain, where people say "follar".',
  ],
  ru: [
    'Write like Russians text: mostly lowercase, no full stop at the end of a message (a final full stop reads cold or annoyed). Commas loosely.',
    'A smile is a bracket: ")" or "))" at the end instead of an emoji, "(((" for sad. Laugh as "ахах", "хах", "ахахах", but only where the original laughs or jokes.',
    'A few everyday short forms where they fit: спс, пж, оч (очень), щас, чё / че, норм, мб, кст, прив, ваще. Write ё as е. Use ты.',
    'Simple spoken words only, never bookish or official (no являться, данный, осуществлять, в связи с). Short sentences.',
    'Pet names: малыш, зай, котик, милый, солнышко. Sex talk in natural spoken words (хочу тебя, мокрая, возбуждаешь, кончить), not clinical or crude-for-show.',
  ],
};
const styleFor = (lang) => (STYLE[lang] ? `\nHow people text in ${nameOf(lang)}:\n- ${STYLE[lang].join('\n- ')}\n` : '');

/** The rules that must always hold, applied after the AI: only the original's emojis; no opening ¿ ¡ in Spanish; in Russian ё as е and no full stop at the end. */
function tidy(text, lang, original = '') {
  let t = text;
  // emojis: only the ones the original has (the AI likes to add its own)
  const EMOJI = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
  const allowed = new Set(String(original).match(EMOJI) || []);
  t = t.replace(EMOJI, (e) => (allowed.has(e) ? e : '')).replace(/[ \t]{2,}/g, ' ').replace(/ +([?!.,)])/g, '$1');
  if (lang === 'es') t = t.replace(/[¿¡]/g, '');
  if (lang === 'ru') t = t.replace(/ё/g, 'е').replace(/Ё/g, 'Е').replace(/(^|[^.])\.(\s*)$/, '$1$2');
  return t.trim();
}

async function spend(orgId, creatorId, fanId, kind, r) {
  const inTok = r.usage?.input_tokens || 0, outTok = r.usage?.output_tokens || 0;
  const cost = Math.round(((inTok * PRICE.in + outTok * PRICE.out) / 1e6) * 1e6) / 1e6;
  await supabaseAdmin.from('ai_usage').insert({ organisation_id: orgId, kind, model: MODEL, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, creator_id: creatorId || null, fan_uuid: fanId || null })
    .then(({ error }) => { if (error) console.error('[translate] usage:', error.message); });
  return cost;
}

const INCOMING_SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, lang: { type: 'string' }, english: { type: 'string' } }, required: ['id', 'lang', 'english'], additionalProperties: false } } },
  required: ['items'], additionalProperties: false,
};

/** His last messages with language and English; the ones not read yet are translated now. */
async function incoming(orgId, account, fanId, { limit = 20 } = {}) {
  const { data, error } = await supabaseAdmin.from('fansly_messages').select('message_id, text, sent_at, lang, text_en')
    .eq('account_id', account.id).eq('fan_account_id', fanId).eq('from_fan', true).not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(limit);
  if (error) throw error;
  const msgs = (data || []).reverse();
  const todo = msgs.filter(m => !m.lang && String(m.text || '').trim());
  let cost = 0;
  if (todo.length) {
    const r = await client.messages.create({
      model: MODEL, max_tokens: 4000, system: SYSTEM,
      messages: [{ role: 'user', content: 'For each message: lang = its language as an ISO 639-1 code ("und" when it has no words that show a language: only emojis, "ok", "lol", a number); '
        + 'english = how a guy would text it in casual American English (not word for word, never formal), or "" when it is already English or "und".\n\n'
        + todo.map(m => `<m id="${m.message_id}">${String(m.text).slice(0, 2000)}</m>`).join('\n') }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: INCOMING_SCHEMA } },
    });
    cost = await spend(orgId, account.creator_id, fanId, 'fansly_translate_in', r);
    let items = [];
    try { items = JSON.parse(r.content.find(b => b.type === 'text')?.text || '{}').items || []; } catch { items = []; }
    const byId = new Map(items.map(x => [String(x.id), x]));
    for (const m of todo) {
      const x = byId.get(String(m.message_id));
      if (!x) continue;
      const lang = /^[a-z]{2,3}$/.test(String(x.lang || '').toLowerCase()) ? String(x.lang).toLowerCase() : 'und';
      m.lang = lang; m.text_en = lang !== 'en' && lang !== 'und' && x.english ? x.english : null;
      await supabaseAdmin.from('fansly_messages').update({ lang: m.lang, text_en: m.text_en }).eq('account_id', account.id).eq('message_id', m.message_id);
    }
  }
  return { messages: msgs.map(m => ({ message_id: m.message_id, text: m.text, sent_at: m.sent_at, lang: m.lang || null, text_en: m.text_en || null })), cost_usd: cost };
}

/** The language to answer him in: set by a chatter, else the one he writes in most lately. */
async function language(account, fanId) {
  const [{ data: fan }, { data: recent }] = await Promise.all([
    supabaseAdmin.from('fansly_fans').select('reply_lang').eq('account_id', account.id).eq('fansly_account_id', fanId).maybeSingle(),
    supabaseAdmin.from('fansly_messages').select('lang').eq('account_id', account.id).eq('fan_account_id', fanId).eq('from_fan', true).not('lang', 'is', null).neq('lang', 'und')
      .order('sent_at', { ascending: false }).limit(30),
  ]);
  const count = {};
  for (const m of recent || []) count[m.lang] = (count[m.lang] || 0) + 1;
  const his = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const lang = fan?.reply_lang || his || 'en';
  return { lang, name: nameOf(lang), set_by_chatter: !!fan?.reply_lang, his: his ? { lang: his, name: nameOf(his) } : null };
}

async function setLanguage(account, fanId, lang) {
  const v = lang && /^[a-z]{2,3}$/.test(lang) ? lang : null;
  const { error } = await supabaseAdmin.from('fansly_fans').update({ reply_lang: v }).eq('account_id', account.id).eq('fansly_account_id', fanId);
  if (error) throw error;
  return language(account, fanId);
}

/** A reply in his language (keeps placeholders like {name} as they are). */
async function outgoing(orgId, account, fanId, text, lang) {
  const t = String(text || '').trim().slice(0, 4000);
  if (!t) return { text: '', cost_usd: 0 };
  if (!lang || lang === 'en') return { text: t, cost_usd: 0 };
  // how he himself writes in it (his region and his slang), when he does
  const { data: his } = await supabaseAdmin.from('fansly_messages').select('text').eq('account_id', account.id).eq('fan_account_id', fanId)
    .eq('from_fan', true).eq('lang', lang).not('text', 'is', null).order('sent_at', { ascending: false }).limit(6);
  const sample = (his || []).map(m => String(m.text).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 6);
  const hisWay = sample.length ? `\nHis own recent messages, to match his region and how he writes (do not copy them):\n${sample.map(x => `> ${x.slice(0, 200)}`).join('\n')}\n` : '';
  const r = await client.messages.create({
    model: MODEL, max_tokens: 2000, system: SYSTEM,
    messages: [{ role: 'user', content: `Translate this message from the creator (a young woman) to the fan into ${nameOf(lang)}: the way a flirty young woman from there would text it, `
      + `casual and natural, with the slang and short forms people really use in that language, never formal and never word for word. Just as explicit as the original. Use the emojis it has and no others.${styleFor(lang)}${hisWay}`
      + `Keep anything in curly braces (like {name}) exactly as it is. Answer with the translation only, in the text field.\n\n${t}` }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } } },
  });
  const cost = await spend(orgId, account.creator_id, fanId, 'fansly_translate_out', r);
  let out = '';
  try { out = JSON.parse(r.content.find(b => b.type === 'text')?.text || '{}').text || ''; } catch { out = ''; }
  return { text: tidy(out.trim(), lang, t), lang, name: nameOf(lang), cost_usd: cost };
}

module.exports = { incoming, outgoing, language, setLanguage, NAMES };
