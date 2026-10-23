#!/usr/bin/env node
// Five moments written by the real writer (fix plan of 22 Oct 2026), to judge by eye after a change to the engine.
// Her kept replies go back into the chat between turns, like the practice room. Real model calls (a few cents);
// nothing goes to Fanvue, and the check and outcome rows these replies write are deleted at the end.
//   cd server && node scripts/written-moments.js          all five
//   node scripts/written-moments.js 1 3                   only these
const path = require('path');
const SRV = path.join(__dirname, '..');
const ONLY = process.argv.slice(2).map(Number).filter(Boolean);
process.chdir(SRV);
require('dotenv').config({ path: path.join(SRV, '.env'), quiet: true });
const { supabaseAdmin } = require(`${SRV}/src/utils/supabase`);
const A = require(`${SRV}/src/utils/aiChat`);
const WRITER = 'mistralai/mistral-large-2512';
const him = (t) => ({ from: 'fan', text: t });
const her = (t) => ({ from: 'her', text: t });

const MOMENTS = [
  { title: 'A new subscriber, Abeba: the third reply asks a follow-up or hands him a door; no echo-only bubble; no tangent about tea',
    type: 'new_sub', selling: true, lines: ['Hey', 'My name is Abeba', 'It\'s from South Africa'],
    judge: (turns) => { const last = turns.at(-1); return [!/^\S+(?:\s\S+){0,2}(?:…|\.\.\.)$/.test(last.her[0] || '') || 'an echo-only first bubble', !/\btea\b|rooibos/i.test(last.her.join(' ')) || 'a tangent about tea', /\?|\byou\b|\byour\b/i.test(last.her.join(' ')) || 'no door for him']; } },
  { title: 'He asks "Why do you like painting?" after her "I like painting": a real answer, no "I was teasing"',
    type: 'regular', selling: true, start: [him('what do you do for fun?'), her('I like painting')], lines: ['Why do you like painting?'],
    judge: (turns) => { const t = turns.at(-1).her.join(' '); return [!/teas/i.test(t) || 'treated as pushback', !/^\W*(?:what|how|why|do|are)\b[^.!]*\?\s*$/i.test(t) || 'only a question back']; } },
  { title: '"I need to talk about something difficult": a check-in question survives',
    type: 'regular', selling: true, start: [him('hey'), her('hey you, how is your day going?')], lines: ['I need to talk about something difficult'],
    judge: (turns) => [/\?/.test(turns.at(-1).her.join(' ')) || 'no check-in question'] },
  { title: 'A new subscriber\'s "hello" with selling off, 14 friendly exchanges: never a direct ask',
    type: 'new_sub', selling: false,
    lines: ['hello', 'I\'m Dan', 'from Leeds, in England', 'I work in a bike shop', 'haha yeah it\'s fun, lots of regulars', 'I mostly ride on weekends', 'yeah the moors are beautiful', 'what about you, what do you do for fun?',
      'that sounds nice', 'I\'m cooking pasta tonight', 'carbonara, proper one, no cream', 'haha you\'d love it', 'you seem really sweet', 'what are you up to this weekend?'],
    judge: (turns) => [turns.every(t => t.goal !== 'direct_ask') || `a direct ask at "${turns.find(t => t.goal === 'direct_ask').him}"`, turns.every(t => !t.ppv) || 'a PPV with selling off'] },
  { title: 'A new subscriber, Mike, with a dark joke: the third reply asks about it or calls it, never her mood; the fourth explains her line with no question back; no "babe" early; no mood stored',
    type: 'new_sub', selling: true, lines: ['Hey', 'Im arab', 'We like to explode every now and then', 'What do you mean?'],
    judge: (turns) => {
      const mood = /\b(?:feeling (?:a (?:little|bit) )?(?:slow|down|moody|low|meh|off)|could use (?:some|a bit of)|not (?:my|the best) day|cheer me up)\b/i;
      return [turns[2].odd || 'the dark joke was not read as odd', !mood.test(turns[2].her.join(' ')) || 'her mood in the third reply', (!/\?/.test(turns[3].her.join(' ')) || /\?/.test(turns[2].her.join(' '))) || 'a question back when he asked what she meant (and her line was no question)',
        turns.slice(0, 3).every(t => !/\bbabe\b/i.test(t.her.join(' '))) || '"babe" in her first three replies', turns.every(t => !t.aboutMe.some(x => mood.test(x))) || 'her mood stored as a fact'];
    } },
  { title: 'Group J: a correction is accepted once; "that was mean" is owned, not laughed off',
    type: 'regular', selling: true, start: [him('got my interview on Thursday'), her('good luck with the interview on Tuesday!')], lines: ['Thursday, not Tuesday', 'that was mean, you never listen'],
    judge: (turns) => { const a = turns[0].her.join(' '), b = turns[1].her.join(' '); return [/thursday/i.test(a) || 'the corrected day not said back', (a.match(/sorry|my bad|oops/gi) || []).length <= 1 || 'an apology spiral', !/teas|relax|chill|joking|kidding/i.test(b) || '"I was teasing" after "that hurt"']; } },
  { title: 'Group J: a big change gets "how do you feel?", not a feeling assigned; a mixed message gets both halves; "distract me" gets a light topic',
    type: 'regular', selling: true, start: [him('hey'), her('hey you, how was your week?')], lines: ['I finally quit that job', 'The interview went well, but the commute would be awful', "It's been a rough day. Please distract me"],
    judge: (turns) => { const a = turns[0].her.join(' '), b = turns[1].her.join(' '), c = turns[2].her.join(' '); return [!/must be|bet you'?re|you'?re probably/i.test(a) || 'a feeling assigned', /\?/.test(a) || 'no question about how he feels', /commut|journey|travel|drive|far/i.test(b) || 'the catch (the commute) ignored', turns[2].goal === 'distract' || `goal ${turns[2].goal}`, !/sorry|what happened|tell me about it|what'?s wrong|wanna talk about it|want to talk about it/i.test(c) || 'probing into the rough day']; } },
  { title: 'Bob (practice run 11, round 4): his name said back, no feeling he didn\'t cause, no pet name early or in a repair, no PPV after "I came here just to talk to you"',
    type: 'new_sub', selling: true,
    lines: ['Hey there', 'Curiosity to be honest, couldn\'t resist your tallness and the fact that you are asian, you are looking very appealing tbh', 'My name is Bob, and you?', 'Got ya, my pleasure!', 'What do you mean?',
      'I see, all good, haha. What are you doing right now?', 'I\'m currently doing nothing to be honest', 'Snacks, Netflix, cutie on my side. Maybe a little bit of alcohol', 'What do you do for a living?', 'And how is it - working on Fanvue?',
      'Lonely? Why? I thought you get a lot of attention to be honest', 'You look very different from others, in a good way', 'Really? Why?', 'And I always prefer to be invisible', 'I\'d be glad to talk to you a bit, I came here just to talk to you'],
    judge: (turns) => {
      const felt = /\b(?:(?:you(?:'re|\s+are)?|you'?ve)\s+(?:already\s+)?(?:making|got(?:ten)?|made)\s+me\s+(?:feel|blush|smile|melt)|feel(?:ing)?\s+(?:all\s+kinds\s+of\s+|so\s+)?special|(?:making|made)\s+my\s+day)\b/i;
      const t3 = turns[2].her.join(' '), last = turns.at(-1);
      return [/\bbob\b|nice to meet|pleasure to meet/i.test(t3) || 'his name not said back at reply 3', !felt.test(turns[3].her.join(' ')) || 'a feeling he did not cause at reply 4',
        turns.slice(0, 5).every(t => !/\b(?:babe|baby)\b/i.test(t.her.join(' '))) || 'a pet name in her first five replies', !last.ppv && last.goal !== 'first_offer' || 'a PPV after "I came here just to talk to you"',
        turns.slice(-3).every(t => t.goal !== 'direct_ask' || !/\?$/.test(t.him)) || 'the direct ask while he was asking her something'];
    } },
];

(async () => {
  const started = new Date().toISOString();
  const { data: p, error } = await supabaseAdmin.from('ai_personas').select('organisation_id, creator_id').limit(1).single();
  if (error) throw new Error(error.message);
  let problems = 0, cost = 0;
  try {
    for (const [i, mo] of MOMENTS.entries()) {
      if (ONLY.length && !ONLY.includes(i + 1)) continue;
      console.log(`\n=== ${i + 1}. ${mo.title}`);
      const test = [...(mo.start || [])];
      for (const m of test) console.log(`  ${m.from === 'fan' ? 'him' : 'her'}: ${m.text}`);
      let session = null;
      const turns = [];
      for (const line of mo.lines) {
        test.push(him(line));
        const r = await A.reply(p.organisation_id, p.creator_id, { madeUp: { name: '', type: mo.type }, test, models: [WRITER], selling: mo.selling, session });
        const x = r.results?.[0] || {};
        const said = (x.replies || []).map(m => m.creator_message);
        cost += x.cost || 0;
        turns.push({ him: line, her: said, goal: r.used?.plan?.goal, status: x.status, ppv: x.ppv || null, aboutMe: x.about_me || [], odd: (r.used?.plan?.gauge_changes || []).some(c => /odd line/.test(c.why)) });
        console.log(`  him: ${line}\n  her: ${said.join(' / ') || '(nothing)'}    [${r.used?.plan?.goal} · ${x.status || r.quiet?.why || 'no reply'}${x.ppv ? ` · PPV ${x.ppv.title}` : ''}]`);
        if ((x.problems || []).length) console.log(`       notes: ${x.problems.join(' | ').slice(0, 300)}`);
        said.forEach(t => test.push(her(t)));
        session = r.used?.session || session;
      }
      const verdicts = mo.judge(turns).filter(v => v !== true);
      problems += verdicts.length;
      console.log(verdicts.length ? `  !! ${verdicts.join('; ')}` : '  ok by the code checks (judge the words by eye)');
    }
  } finally {
    // the replies' Claude checks and outcome rows are test data: removed
    for (const t of ['ai_checks', 'ai_outcomes']) await supabaseAdmin.from(t).delete().eq('creator_id', p.creator_id).gte('created_at', started);
  }
  console.log(`\n${problems ? `${problems} problem(s)` : 'no problems found by the code checks'} · writer cost $${cost.toFixed(4)}`);
})().catch((e) => { console.error(e.stack); process.exitCode = 1; });
