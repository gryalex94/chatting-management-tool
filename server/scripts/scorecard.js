#!/usr/bin/env node
// The small-talk scorecard (research round 2): Yuna's replies measured the same way as the agency's human
// chatters, against the human bands. Reads her checked replies (ai_checks) and the saved practice
// conversations (ai_practice_runs); talk moments only (no selling, no sexting goals).
//   node scripts/scorecard.js                 the last 7 days
//   node scripts/scorecard.js --days 30       a longer window
//   node scripts/scorecard.js --moves 150     also label the main move of 150 replies with a Mistral model (about 5 cents per 1,000)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { supabaseAdmin } = require('../src/utils/supabase');
const or = require('../src/integrations/openrouter');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : dflt; };
const DAYS = opt('--days', 7), MOVES = opt('--moves', 0);
const TALK = new Set(['chat', 'get_to_know', 'curious', 'share', 'flirt', 'welcome_new', 'welcome_back', 'comfort', 'reassure', 'calm', 'ease_off', 'follow_up', 'goodbye', 'wind_down', 'dry_ask', 'dry_bye', 'honest_no', 'why_not']);
const words = (t) => (String(t).match(/[\p{L}\p{N}']+/gu) || []).length;
const EMOJI = /\p{Extended_Pictographic}/u;
const LAUGH = /\b(?:haha+|lol|lmao|hehe+)\b/i;
const DECLARED = /\b(?:i\s+(?:really\s+|truly\s+|so\s+)?(?:care\s+(?:about|for)|miss|adore|love|need)\s+(?:you|u)\b|you\s+mean\s+(?:so\s+much|a\s+lot|the\s+world|everything)\s+to\s+me|i\s+feel\s+(?:the\s+same|it\s+too))\b/i;
const COMPLIMENT = /\b(?:you'?re|you\s+are|ur)\s+(?:so\s+|really\s+|such\s+a\s+)?(?:sweet|cute|hot|handsome|amazing|gorgeous|special|the\s+best|adorable|funny|smart|kind|lovely)\b/i;
// the human bands (the agency's Fanvue chatters, research round 2)
const BANDS = {
  question: [35, 45], median_words: [5, 9], split: [18, 30], question_last: [80, 100], lowercase: [12, 28], full_stop: [0, 8], emoji: [15, 30], laugh: [6, 14], declared: [0, 10], compliment: [0, 5], three_in_a_row: [0, 5],
};
const wilson = (k, n) => {
  if (!n) return '';
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
  return `${Math.round(100 * (c - h) / d)}–${Math.round(100 * (c + h) / d)}%`;
};
const PlanM = require('../src/ai/chat/plan');
const { sentences } = require('../src/ai/chat/safety');
const SHORT_FOLLOW = /^\W*(?:really|how come|why|what happened|and then|how so|wait,? what|seriously|for real|which one|how long|since when)\b/i;
const pct = (k, n) => (n ? `${(100 * k / n).toFixed(1)}%` : '—');
const inBand = (v, [lo, hi]) => (v == null ? '' : v < lo ? ' ▼ low' : v > hi ? ' ▲ high' : ' ✓');

(async () => {
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const { data: checks, error } = await supabaseAdmin.from('ai_checks').select('his, her, goal, created_at').gte('created_at', since).order('created_at');
  if (error) throw new Error(error.message);
  const { data: runs } = await supabaseAdmin.from('ai_practice_runs').select('id, messages, turns').gte('updated_at', since);
  // every talk reply: { his, bubbles, goal, seq (conversation id + index, for runs) }
  const seen = new Set();
  const replies = [];
  for (const c of checks || []) {
    if (!TALK.has(c.goal) || !c.her?.length) continue;
    const key = c.her.join('\n');
    if (seen.has(key)) continue;
    seen.add(key);
    replies.push({ his: c.his || '', bubbles: c.her, goal: c.goal, from: 'checks' });
  }
  const sequences = [];
  for (const r of runs || []) {
    const seq = [];
    for (const t of r.turns || []) {
      const res = (t.results || []).find(x => x.model === t.kept) || (t.results || []).find(x => ['ok', 'check'].includes(x.status) && x.replies?.length);
      const goal = t.used?.plan?.goal;
      if (!res?.replies?.length || !TALK.has(goal)) { if (goal) seq.push(null); continue; }
      const bubbles = res.replies.map(x => x.creator_message);
      seq.push(bubbles);
      const key = bubbles.join('\n');
      if (seen.has(key)) continue;
      seen.add(key);
      replies.push({ his: (t.used?.said || []).join(' '), bubbles, goal, from: 'practice' });
    }
    sequences.push(seq);
  }
  const n = replies.length;
  if (!n) { console.log(`No talk replies in the last ${DAYS} days.`); process.exit(0); }
  const texts = replies.map(r => r.bubbles.join(' '));
  const count = (f) => replies.filter(f).length;
  const lens = replies.map(r => words(r.bubbles.join(' '))).sort((a, b) => a - b);
  const q = (p) => lens[Math.min(lens.length - 1, Math.floor(p * lens.length))];
  const asks = count(r => /\?/.test(r.bubbles.join(' ')));
  const split = count(r => r.bubbles.length >= 2);
  const multiQ = replies.filter(r => r.bubbles.length >= 2 && r.bubbles.some(b => /\?/.test(b)));
  const qLast = multiQ.filter(r => /\?/.test(r.bubbles[r.bubbles.length - 1])).length;
  const lower = count(r => /^[a-z]/.test(r.bubbles[0].trim()));
  const stop = count(r => /\.$/.test(r.bubbles[r.bubbles.length - 1].trim()));
  const emoji = count(r => EMOJI.test(r.bubbles.join(' ')));
  const laugh = count(r => LAUGH.test(r.bubbles.join(' ')));
  const declared = count(r => DECLARED.test(r.bubbles.join(' ')));
  const compliment = count(r => COMPLIMENT.test(r.bubbles.join(' ')));
  const long = count(r => r.bubbles.some(b => words(b) > 15));
  // three questions in a row, from the saved conversations (the only place the order is known)
  let runs3 = 0, windows = 0;
  for (const seq of sequences) {
    const flags = seq.map(b => (b ? /\?/.test(b.join(' ')) : false));
    for (let i = 2; i < flags.length; i += 1) { if (seq[i] && seq[i - 1] && seq[i - 2]) { windows += 1; if (flags[i] && flags[i - 1] && flags[i - 2]) runs3 += 1; } }
  }
  const row = (label, k, band, extra = '') => console.log(`${label.padEnd(34)} ${pct(k, n).padStart(6)}  (${wilson(k, n)})${inBand(100 * k / n, BANDS[band])}${extra}`);
  console.log(`Small-talk scorecard: ${n} talk replies in the last ${DAYS} days (${replies.filter(r => r.from === 'checks').length} from the checks log, ${replies.filter(r => r.from === 'practice').length} more from saved practice chats)${n < 300 ? `; under 300, so each share is only within about ±${Math.round(100 * 1.96 * Math.sqrt(0.25 / n))} points` : ''}\n`);
  console.log(`${'measure'.padEnd(34)} ${'Yuna'.padStart(6)}  (95% range)  vs the human chatters`);
  row('Replies with a question', asks, 'question', '   humans 43–47%');
  // round 4, G2: of her replies with a question, how many follow up something he just said (a word of his, or "really? how come?")
  const asking = replies.filter(r => /\?/.test(r.bubbles.join(' ')));
  const followUps = asking.filter(r => r.bubbles.flatMap(b => sentences(b)).filter(x => /\?/.test(x)).some(q => SHORT_FOLLOW.test(q.trim()) || PlanM.topicWords(q).some(w => PlanM.topicWords(r.his).includes(w)))).length;
  console.log(`${'Her questions that follow him'.padEnd(34)} ${pct(followUps, asking.length).padStart(6)}  (${wilson(followUps, asking.length)}, of ${asking.length} replies with a question)   no human band yet; the higher the better`);
  console.log(`${'Words per reply (median, mid half)'.padEnd(34)} ${String(q(0.5)).padStart(6)}  (${q(0.25)}–${q(0.75)}, 9 in 10 under ${q(0.9)})${inBand(q(0.5), BANDS.median_words)}   humans 7 (4–11, 9 in 10 under 16)`);
  row('Replies of 3 words or fewer', count(r => words(r.bubbles.join(' ')) <= 3), 'declared', '   humans about 20%');
  row('A message over 15 words', long, 'declared', '   humans: rare');
  row('Split into 2+ messages', split, 'split', '   humans about 23%');
  console.log(`${'Question in the last message'.padEnd(34)} ${pct(qLast, multiQ.length).padStart(6)}  (${wilson(qLast, multiQ.length)}, of ${multiQ.length} split replies with a question)${multiQ.length ? inBand(100 * qLast / multiQ.length, BANDS.question_last) : ''}   humans 85%`);
  row('Lowercase start', lower, 'lowercase', '   humans about 18%');
  row('Full stop at the end', stop, 'full_stop', '   humans about 8%');
  row('Emoji', emoji, 'emoji', '   humans 15–30%');
  row('Laugh word (haha, lol)', laugh, 'laugh', '   humans about 10%');
  row('Declared feeling (I care, I miss you)', declared, 'declared', '   target ≤ 10%');
  row('Compliment', compliment, 'compliment', '   target ≤ 5%');
  console.log(`${'Three questions in a row'.padEnd(34)} ${pct(runs3, windows).padStart(6)}  (${wilson(runs3, windows)}, of ${windows} runs of three in saved chats)${windows ? inBand(100 * runs3 / windows, BANDS.three_in_a_row) : ''}   humans about 5%`);
  // round 4, H4: the manager's marks in Practice (talk, tell, buy: up or down), by goal; with the reader's own read beside them
  const marked = [];
  for (const r of runs || []) for (const t of r.turns || []) if (t.marks && Object.values(t.marks).some(Boolean)) marked.push(t);
  if (marked.length) {
    console.log(`\nYour marks in Practice (${marked.length} replies marked):`);
    const byGoal = {};
    for (const t of marked) { const g = t.used?.plan?.goal || '?'; (byGoal[g] ||= []).push(t); }
    for (const [g, list] of Object.entries(byGoal).sort((a, b) => b[1].length - a[1].length)) {
      const cnt = (k, v) => list.filter(t => t.marks[k] === v).length;
      console.log(`  ${g.padEnd(16)} ${String(list.length).padStart(3)} marked · talk ${cnt('talk', 1)}▲ ${cnt('talk', -1)}▼ · tell ${cnt('tell', 1)}▲ ${cnt('tell', -1)}▼ · buy ${cnt('buy', 1)}▲ ${cnt('buy', -1)}▼`);
    }
    // the reader reads, with his NEXT message, what her line did: compare your mark on a reply with the read of the turn after it
    let agree = 0, compared = 0;
    for (const r of runs || []) {
      const ts = r.turns || [];
      for (let i = 0; i < ts.length - 1; i += 1) {
        const m = ts[i].marks, w = ts[i + 1].used?.plan?.reading?.wishes;
        if (!m || !w) continue;
        for (const k of ['talk', 'tell', 'buy']) { if (!m[k]) continue; compared += 1; if ((m[k] > 0 && w[k] === '+') || (m[k] < 0 && w[k] === '-')) agree += 1; }
      }
    }
    if (compared) console.log(`  the reader agreed with your mark ${pct(agree, compared)} of the time (${agree} of ${compared})`);
  }
  // the main move, labelled the way the human library was (the other session's prompt, word for word)
  if (MOVES > 0 && or.configured()) {
    const SYSTEM = 'Label the conversational move of the LAST reply.\n\nYou see a short excerpt of a casual text chat between a FAN and a CREATOR, then the LAST reply, written by the CREATOR. The LAST reply may be made of several separate messages sent in a row; label it as one reply.\n\nPick ONE primary move for the LAST reply and, only if the reply clearly does a second thing, one secondary move. Moves:\n- question_followup: asks about something the partner just said\n- question_new: asks a question that opens a new topic (incl. "what about you?/wbu")\n- answer: directly answers the partner\'s question\n- self_disclosure: shares own experience, day, story, feelings\n- opinion: states a view, preference, judgement or mild disagreement\n- reaction: short acknowledgement/backchannel/laughter ("haha", "oh nice", "omg")\n- tease_joke: playful teasing or humour\n- compliment: praise of the partner\n- empathy: sympathy/support for the partner\'s feelings\n- guess_about_partner: statement or assumption about the partner\n- callback: refers back to something said much earlier\n- closing: wrapping up, goodbye\n- other\n\nAlso say:\n- has_question: true if the LAST reply asks the partner anything (with or without a question mark)\n- small_talk: true if the excerpt is ordinary everyday chat; false if it is sexual or flirting toward sex, or about buying, selling, paying for or sending paid content\n\nAnswer with JSON only: {"primary": "<move>", "secondary": "<move or null>", "has_question": true|false, "small_talk": true|false}';
    const sample = replies.filter(r => r.his).slice(-MOVES);
    const tally = {};
    let cost = 0, labelled = 0;
    for (const r of sample) {
      const user = `Chat excerpt:\nFAN: ${r.his.replace(/\s+/g, ' ')}\n\nLAST reply:\n${r.bubbles.length === 1 ? `CREATOR: ${r.bubbles[0]}` : r.bubbles.map((b, i) => `CREATOR (message ${i + 1}): ${b}`).join('\n')}`;
      try {
        const res = await or.chat({ model: 'mistralai/mistral-small-3.2-24b-instruct', maxTokens: 80, temperature: 0, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] });
        cost += res.usage.cost || 0;
        const m = /\{[\s\S]*\}/.exec(res.text);
        const j = m ? JSON.parse(m[0]) : null;
        if (!j) continue;
        labelled += 1;
        tally[j.primary] = (tally[j.primary] || 0) + 1;
      } catch (e) { console.error('label:', e.message); }
    }
    const TARGET = { question_followup: '~20–25%', question_new: '≤ 10%', answer: 'whenever asked (~16%)', reaction: '15–20%', self_disclosure: '10–15% (with opinion 15–20%)', opinion: '~5%', tease_joke: '~5%', compliment: '≤ 5%', empathy: '~3–4%', closing: '~5%', guess_about_partner: '1–3%' };
    console.log(`\nMain move of ${labelled} replies (labelled by mistral-small, $${cost.toFixed(3)}):`);
    for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${pct(v, labelled).padStart(6)}   target ${TARGET[k] || '—'}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
