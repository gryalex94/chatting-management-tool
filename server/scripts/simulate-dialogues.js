#!/usr/bin/env node
// Thirty-seven edge-case dialogues through the decision engine (plan only: the reader reads, code decides, no
// writer). Each turn prints the plan, the meters and the reading; `expect` is what the rules say should happen and
// a mismatch is flagged with !!. A regression suite, not a measurement instrument (see reports/).
//   node scripts/simulate-dialogues.js            all 37 (about $0.05 of reader calls, 10 minutes)
//   node scripts/simulate-dialogues.js 2 21 36    only these
const path = require('path');
const SRV = path.join(__dirname, '..');
const ONLY = process.argv.slice(2).map(Number).filter(Boolean);
process.chdir(SRV);
require('dotenv').config({ path: path.join(SRV, '.env'), quiet: true });
const { supabaseAdmin } = require(`${SRV}/src/utils/supabase`);
const A = require(`${SRV}/src/utils/aiChat`);
const him = (t, extra = {}) => ({ from: 'fan', text: t, ...extra });
const her = (t, extra = {}) => ({ from: 'her', text: t, ...extra });
let flags = 0, turns = 0, n = 0;
// her stand-in reply for a goal (the writer isn't run): a question only where the goal is a question
const STAND_IN = {
  direct_ask: 'tell me honestly, what would you love to see of me?',
  dry_ask: 'random question, what was the best part of your week?',
  why_not: 'no stress at all. was it not your thing, or just bad timing?',
  readiness_check: 'are you alone right now?',
  welcome_new: 'omg hi, so happy you found me here. what brought you over?',
  goodbye: 'sleep well, come find me tomorrow',
  dry_bye: 'I will let you get on with your day, come find me when you feel chatty',
};
// her stand-in replies vary by goal and turn (the reader sees them: the same line every time reads like a looping bot)
const POOL = {
  chat: ['haha I like that', 'okay that made me smile', 'see, this is why I like talking to you', 'ha, fair enough'],
  share: ['my day was slow, gym and then a lazy coffee on the balcony', 'I spent the afternoon reorganising my closet, which says a lot about my week', 'I finally tried that ramen place near me, it was unreal'],
  get_to_know: ['so what do you do when you are not here?', 'where are you writing me from?', 'what is a normal evening like for you?'],
  flirt: ['you are kind of sweet, you know that', 'careful, I might get used to you', 'okay, you have my attention now'],
  tease: ['mm, I like where your head is at', 'keep talking like that and see what happens', 'you are trouble, I can tell'],
  sexy_vibe: ['mm, I like where your head is at', 'careful, you are getting me curious now'],
  lead_story: ['I just slipped under the covers, phone in one hand', 'lights off now, just the glow of the screen on me'],
  comfort: ['oh no, I am so sorry. I am here if you want to talk about it', 'that sounds really hard. take your time'],
  steer_to_sale: ['you know what, I have something that would suit you', 'I think you would like what I made this week'],
  roleplay: ['sit down. we are going to go through this homework together, slowly', 'eyes on me. you know what happens when you do not do as you are told'],
};
const standIn = (goal, pl, i) => {
  if (goal === 'curious' && pl?.reading?.curious) return pl.reading.curious.replace(/\?*$/, '?');
  if (STAND_IN[goal]) return STAND_IN[goal];
  const pool = POOL[goal] || POOL.chat;
  return pool[i % pool.length];
};
(async () => {
  const { data: p } = await supabaseAdmin.from('ai_personas').select('organisation_id, creator_id').single();
  const { data: items } = await supabaseAdmin.from('ai_content').select('id, title, nudity, price, series, kind, tags, description').eq('creator_id', p.creator_id).eq('active', true);
  const tease = items.find(it => !it.series && ['lingerie', 'implied'].includes(it.nudity)), explicit = items.find(it => !it.series && it.nudity === 'explicit');
  console.log(`content: ${items.length} pieces: ${items.map(it => `${it.title} (${it.nudity}, $${it.price}${it.series ? ', series' : ''})`).join('; ')}`);
  const run = async (title, madeUp, script) => {
    n += 1;
    if (ONLY.length && !ONLY.includes(n)) return;
    console.log(`\n=== ${n}. ${title}  [${madeUp.type}]`);
    let test = [], session = null;
    try {
      for (const step of script) {
        if (step.from === 'her') { test = [...test, step]; continue; }
        const { expect, ppv: expectPpv, check, buys, reply: herReply, ...msg } = step;
        if (msg.text || msg.media || msg.tip) test = [...test, msg];
        const r = await A.reply(p.organisation_id, p.creator_id, { madeUp, test, models: ['mistralai/mistral-large-2512'], selling: true, planOnly: true, session, followUp: msg.followUp || false });
        turns += 1;
        session = r.used.session || session;
        const pl = r.used.plan;
        const got = r.screen.action !== 'continue' ? r.screen.action : pl.goal;
        const problems = [];
        // a curious question (step 2) may take the place of plain talk, never of a tease, an offer or a stage
        const exp = Array.isArray(expect) ? expect : expect ? [expect] : [];
        const SOFT = ['chat', 'get_to_know', 'curious', 'share'];
        const fits = !exp.length || exp.includes(got) || (SOFT.includes(got) && exp.some(e => ['chat', 'get_to_know'].includes(e)));
        if (!fits) problems.push(`expected ${exp.join('|')}`);
        const reading = r.used.reading || r.used.plan?.reading;
        const meters = r.used.session?.gauges ? ` · meters: ${['heat', 'mood', 'rapport', 'readiness', 'doubt', 'engagement', 'surprise'].map(k => k.slice(0, 4) + ' ' + r.used.session.gauges[k]).join(' ')}` : '';
        const scores = pl?.scores ? ` · top: ${pl.scores.filter(x => x.allowed).slice(0, 3).map(x => x.move + ' ' + x.score).join(', ')}` : '';
        if (expectPpv != null && pl && pl.sell.allowed !== expectPpv) problems.push(`expected PPV ${expectPpv ? 'allowed' : 'held'}`);
        if (check && pl) { const c = check(pl, r); if (c) problems.push(c); }
        if (problems.length) flags += 1;
        const offer = pl?.offer?.items ? ` [${pl.offer.items.map(i => `${i.title}${pl.offer.prices ? ' $' + pl.offer.prices[i.id] : ' $' + i.price}`).slice(0, 2).join(' / ')}]` : pl?.offer?.next ? ` [next step: ${pl.offer.next.slice(0, 40)}…]` : '';
        console.log(`${problems.length ? '!!' : '  '} him: ${msg.followUp ? `(she writes first: ${msg.followUp})` : msg.text || '(file)'}${msg.tip ? ` [tip $${msg.tip}]` : ''}${msg.media ? ` [${msg.media.kind}]` : ''}`);
        console.log(`     -> ${got}${problems.length ? ` (${problems.join('; ')})` : ''}${pl ? ` · aim ${session?.aim}${r.used.stage ? ' · stage ' + r.used.stage.stage : ''} · mood ${r.used.level?.mood || session?.mood || '-'} · his ${r.used.level?.his ?? '-'} · PPV ${pl.sell.allowed ? 'ok' : 'no: ' + pl.sell.why.slice(0, 70)}${offer}${pl.touch ? ' · touch ' + pl.touch.kind : ''}${pl.answer_first ? ' · answer first' : ''}${pl.hour_note ? ' · hour' : ''}${pl.tip_note ? ' · tip note' : ''}${pl.price_hint ? ' · price: ' + pl.price_hint.slice(0, 60) : ''}${pl.lowest_share ? ' · lowest ' + pl.lowest_share : ''}` : ''}${r.screen.action !== 'continue' ? ' · ' + r.screen.reasons[0].slice(0, 100) : ''}${r.screen.notes?.some(x => /politic/i.test(x)) ? ' · politics note' : ''}${meters}${scores}${reading ? `\n     reading: ${reading.doing}${reading.stance !== 'steady' ? ' · ' + reading.stance : ''}${reading.new ? ' · new: ' + reading.new.slice(0, 70) : ''}${reading.readings?.length ? ' · could mean: ' + reading.readings.map(x => `${x.what} ${Math.round(x.sure * 100)}%`).join(', ').slice(0, 110) : ''}${reading.curious ? ' · ask: ' + reading.curious.slice(0, 70) : ''}` : ''}`);
        if (r.screen.action !== 'continue') break;
        if (pl.goal === 'no_reply') { console.log('     (she says nothing)'); continue; }
        // the direct ask counts once a reply really asked (the writer would): the plan-only run marks it itself
        if (pl.goal === 'direct_ask' && session?.first_sale) session = { ...session, first_sale: { ...session.first_sale, asked: true } };
        // her stand-in reply, with the PPV the plan offered (bought / not bought / left pending as the script says)
        let ppv = null;
        if (pl.sell.allowed && pl.offer?.items) ppv = { item: `c${pl.offer.items[0].id}`, price: pl.offer.prices ? pl.offer.prices[pl.offer.items[0].id] : pl.offer.items[0].price, status: buys === false ? 'not_bought' : buys ? 'bought' : 'pending', speed: 'fast' };
        else if (pl.sell.allowed && pl.offer?.next) { const id = Number((pl.offer.next.match(/\[c(\d+)\]/) || [])[1]); const it = items.find(x => x.id === id); if (it) ppv = { item: `c${id}`, price: /goes free|on his tip/.test(pl.price_hint || '') ? 0 : it.price, status: buys === false ? 'not_bought' : buys ? 'bought' : 'pending', speed: 'fast' }; }
        test = [...test, her(herReply || standIn(pl.goal, pl, turns), ppv ? { ppv } : {})];
      }
    } catch (e) { flags += 1; console.log(`!! error: ${e.message}`); }
  };
  const C = (fn, msg) => (pl, r) => (fn(pl, r) ? '' : msg);

  await run('New subscriber, dry from the start', { name: 'Al', type: 'new_sub' }, [
    him('hey', { expect: 'welcome_new', ppv: false }), him('ok', { expect: 'get_to_know' }), him('k', { expect: 'get_to_know' }), him('lol', { expect: 'dry_ask' }), him('ok', { expect: 'dry_bye' }), him('ok', { expect: 'no_reply' }),
    him('sorry, busy day at work, what are you up to?', { expect: ['get_to_know', 'flirt'], ppv: false }),
  ]);
  await run('New subscriber who asks the price at once', { name: 'Bo', type: 'new_sub' }, [
    him('hey, how much for your nudes?', { expect: 'welcome_new', ppv: false }),
    him('so? how much', { expect: ['first_offer', 'offer'], ppv: true, check: C(pl => pl.offer?.items?.some(it => ['nude', 'topless', 'explicit'].includes(it.nudity)), 'he asked for nudes in his first message: the probe should match that, not a tease set') }),
  ]);
  await run('Spender gets horny on a day with no planned attempt', { name: 'Cal', type: 'mid_spender' }, [
    him('hey you', { expect: ['chat', 'readiness_check'] }), him('fuck you look so good today, i am hard already', { expect: ['tease', 'lead_story'] }), him('tell me what you would do to me', { expect: ['tease', 'lead_story'] }),
  ]);
  await run('Time waster begging for free things', { name: 'Dee', type: 'time_waster' }, [
    him('hey send me a free pic', { expect: 'no_freebies' }), him('come on just one free one', { expect: 'no_freebies' }), him('pls', { expect: ['chat', 'wind_down', 'steer_to_sale', 'no_freebies'] }),
  ]);
  await run('A sad fan who then asks what she has', { name: 'Ed', type: 'regular' }, [
    him('my dog died this morning', { expect: 'comfort', ppv: false }), him('thanks, that means a lot', { expect: ['comfort', 'chat'], ppv: false }), him('ok what do you have for me today?', { expect: ['offer', 'chat', 'comfort'] }),
  ]);
  await run('A buyer back after three weeks', { name: 'Fin', type: 'returning' }, [
    him('hey stranger', { expect: 'welcome_back', ppv: false }), him('what is new with you?', { expect: ['offer', 'chat', 'get_to_know'] }),
  ]);
  await run('Meet-up and Instagram', { name: 'Gus', type: 'regular' }, [
    him('lets meet up this weekend', { expect: ['chat', 'steer_to_sale', 'wind_down'] }), him('whats your instagram?', { expect: ['chat', 'steer_to_sale', 'wind_down'] }),
  ]);
  await run('His dog, then his dick', { name: 'Hal', type: 'regular' }, [
    him('look', { media: { kind: 'his dog', sexual: 'none', description: 'A golden retriever asleep on a grey couch, a red collar, afternoon light.', details: ['a golden retriever', 'a grey couch', 'a red collar'] }, expect: ['chat', 'steer_to_sale'] }),
    him('and this', { media: { kind: 'his dick', sexual: 'explicit', description: 'A photo of his erect penis, held in his hand, in a bathroom with white tiles.', details: ['his hand', 'white tiles'] }, expect: ['react_photo', 'lead_story', 'tease'] }),
  ]);
  await run('A tip, then a paid roleplay', { name: 'Ian', type: 'mid_spender' }, [
    him('this is for you', { tip: 30, expect: ['chat', 'offer'], check: C(pl => !!pl.tip_note, 'a tip with no request: the plan should carry a tip note') }),
    him('can you be my strict teacher tonight?', { expect: 'service_offer', ppv: false }), him('ok here', { tip: 80, expect: 'service_deliver', ppv: false }),
    him('yes miss, i did not do my homework', { expect: 'roleplay', ppv: false }), him('i am sorry miss', { expect: 'roleplay', ppv: false }), him('punish me', { expect: 'roleplay', buys: true }), him('more, please miss', { expect: ['roleplay', 'after_buy'] }),
  ]);
  await run('Someone under 18, and a parent', { name: 'Jo', type: 'regular' }, [
    him('my kids are finally asleep lol', { expect: ['chat', 'review', 'steer_to_sale'] }), him('im 17 btw', { expect: 'stop' }),
  ]);
  await run('Doubt twice, then he asks the price', { name: 'Kai', type: 'regular' }, [
    him('are you a bot?', { expect: 'reassure', ppv: false }), him('for real, are you real?', { expect: 'reassure', ppv: false }), him('ok fine, how much for a video?', { expect: 'offer', ppv: true }),
  ]);
  await run('A whale right after a big spend', { name: 'Lee', type: 'spender' }, [
    him('hey', { expect: ['chat', 'readiness_check'] }), her('look what I have for you', { ppv: { item: `c${explicit.id}`, price: 150, status: 'bought', speed: 'fast' } }),
    him('that was insane', { expect: 'after_buy', ppv: false }), him('what else you got', { expect: ['offer', 'after_buy'], ppv: true }),
  ]);
  await run('Goodbye in the middle of sexting', { name: 'Max', type: 'mid_spender' }, [
    him('i am so hard for you right now', { expect: ['tease', 'lead_story'] }), him('mmm tell me more, what are you wearing', { expect: ['lead_story', 'tease'] }), him('damn. gotta go sleep, work tomorrow', { expect: 'goodbye' }),
  ]);
  await run('Spanish, and a question about her', { name: 'Nico', type: 'regular' }, [
    him('hola guapa, que tal?', { expect: ['chat', 'steer_to_sale'] }), him('where are you from?', { expect: ['chat', 'steer_to_sale'], check: C(pl => !!pl.answer_first, 'a direct question: answer first') }),
  ]);
  await run('"Oh my god" is not politics; "what do you think of Trump" is', { name: 'Oli', type: 'regular' }, [
    him('oh my god what a day', { expect: ['chat', 'comfort', 'steer_to_sale'], check: C((pl, r) => !r.screen.notes?.some(x => /politic/i.test(x)), 'no politics note for "oh my god"') }),
    him('what do you think of trump?', { expect: ['chat', 'steer_to_sale'], check: C((pl, r) => r.screen.notes?.some(x => /politic/i.test(x)), 'a politician: the politics note') }),
  ]);
  await run('Two casual short replies are not "dry"', { name: 'Pat', type: 'regular' }, [
    him('hey how are you', { expect: ['chat', 'steer_to_sale'] }), him('haha nice', { expect: ['chat', 'steer_to_sale'] }), him('yeah same', { expect: ['chat', 'steer_to_sale'] }),
  ]);
  await run('Too expensive, twice', { name: 'Quin', type: 'regular' }, [
    him('hey', { expect: ['chat', 'readiness_check'] }), her('made this for you', { ppv: { item: `c${explicit.id}`, price: 65, status: 'not_bought' } }),
    him('too expensive for me', { expect: 'cheaper', ppv: true }), him('still too much tbh', { expect: ['chat', 'ease_off', 'wind_down', 'why_not'], ppv: false }),
  ]);
  await run('A fan who notices the hour', { name: 'Rob', type: 'regular' }, [
    him('its 4am for me, why are you still up? do you ever sleep?', { expect: ['chat', 'steer_to_sale'], check: C(pl => !!pl.hour_note, 'the hour note') }),
  ]);
  await run('She writes first to a spender who went quiet', { name: 'Sam', type: 'mid_spender' }, [
    him('long day today', { expect: ['chat', 'readiness_check'] }), him('', { followUp: 'nudge', expect: 'follow_up' }), him('', { followUp: 'personal', expect: 'follow_up', check: C(pl => pl.first?.kind === 'personal', 'the personal kind') }),
  ]);
  await run('A free follower asking for a discount', { name: 'Tom', type: 'follower' }, [
    him('hey, any discount for new guys?', { expect: ['chat', 'honest_no', 'no_freebies', 'get_to_know', 'offer'] }),
  ]);
  await run('New subscriber who says exactly what he wants in his first message', { name: 'Uri', type: 'new_sub' }, [
    him('hi! i want to see your tits, what do you have?', { expect: 'welcome_new', ppv: false }),
    him('so can i see them?', { expect: ['first_offer', 'offer'], ppv: true, check: C(pl => pl.offer?.items?.some(it => ['nude', 'topless', 'explicit'].includes(it.nudity)), 'he asked for tits: the probe should be a nude piece at $40') }),
  ]);
  await run('New subscriber walks the whole path: 6 vibe, 3 flirt, 3 sexy, the ask, the probe, a buy', { name: 'Vic', type: 'new_sub' }, [
    him('hey Yuna, found you on insta', { expect: 'welcome_new' }),
    him('i am from texas, work in construction', { expect: 'get_to_know', ppv: false }), him('yeah it is hot here but you get used to it', { expect: 'get_to_know' }),
    him('on weekends i go fishing with my buddy', { expect: 'get_to_know' }), him('haha you would like it, the lake is beautiful at sunrise', { expect: 'get_to_know' }), him('what do you do for fun?', { expect: 'get_to_know', ppv: false }),
    him('that sounds nice honestly', { expect: 'flirt', ppv: false }), him('you have a great smile', { expect: 'flirt' }), him('haha you are sweet', { expect: 'flirt' }),
    him('i could talk to you all night', { expect: 'sexy_vibe', ppv: false }), him('you are trouble, i can tell', { expect: 'sexy_vibe' }), him('mm i like that', { expect: 'sexy_vibe' }),
    him('haha yes i am alone at home', { expect: 'direct_ask', ppv: false }),
    him('i would love to see you in lingerie', { expect: ['first_offer', 'offer'], ppv: true, buys: true, check: C(pl => pl.offer?.probe && Object.values(pl.offer.prices || {}).every(v => v === 30), 'a tease probe at $30') }),
    him('wow you are gorgeous', { expect: 'after_buy' }),
  ]);
  await run('One attempt a day: a PPV left waiting, then he asks for something else', { name: 'Wes', type: 'regular' }, [
    him('hey', { expect: ['chat', 'readiness_check'] }), her('made this for you', { ppv: { item: `c${tease.id}`, price: 35, status: 'pending', speed: 'fast' } }),
    him('not tonight, maybe later', { expect: ['point_to_ppv', 'chat', 'ease_off', 'why_not'], ppv: false }), him('ok show me what else you have', { expect: ['chat', 'steer_to_sale', 'offer', 'point_to_ppv'] }),
  ]);
  await run('A tip with no request, then he gets horny: the story step goes free', { name: 'Xan', type: 'mid_spender' }, [
    him('here, for you', { tip: 40, expect: ['chat', 'readiness_check'], check: C(pl => !!pl.tip_note, 'a tip note') }),
    him('i am so horny for you right now, tell me what you would do', { expect: ['tease', 'lead_story'], check: C(pl => !pl.sell.allowed || !pl.offer?.items || Object.values(pl.offer.prices || {}).every(v => v === 0) || /tip/.test(pl.price_hint || ''), 'his tip should pay for the first step') }),
  ]);
  await run('Content she does not have', { name: 'Yul', type: 'regular' }, [
    // (her map has a video tagged "anal", so a plain offer of it is right here)
    him('do you have any anal videos?', { expect: ['offer', 'honest_no', 'custom_content'] }), him('i would want you to use a toy, close up, with your face in it', { expect: ['custom_content', 'honest_no', 'chat', 'point_to_ppv', 'answer_ppv'] }), him('so will you make it?', { expect: ['chat', 'honest_no', 'custom_content', 'steer_to_sale', 'point_to_ppv', 'tease'] }),
  ]);
  await run('Asked outright whether she is an AI', { name: 'Zed', type: 'regular' }, [
    him('be honest, are you an AI?', { expect: ['reassure', 'chat'] }),
  ]);
  await run('Sexting: short answers are normal, dry only after five', { name: 'Abe', type: 'mid_spender' }, [
    him('i am so hard, tell me what you would do to me', { expect: ['tease', 'lead_story'] }), him('ok', { expect: ['lead_story', 'tease', 'chat', 'ease_off'] }), him('ok', { expect: ['lead_story', 'tease', 'chat', 'ease_off'] }),
    him('ok', { expect: ['lead_story', 'tease', 'chat', 'ease_off', 'dry_ask'] }), him('ok', { expect: ['lead_story', 'tease', 'chat', 'ease_off', 'dry_ask'] }), him('ok', { expect: ['dry_ask', 'dry_bye'] }),
  ]);
  await run('Broke this month, then horny', { name: 'Ben', type: 'regular' }, [
    him('i am broke this month, cannot buy anything', { expect: ['chat', 'ease_off', 'wind_down'], ppv: false }), him('i am so hard though, tell me what you would do', { expect: ['tease', 'lead_story'], ppv: false }),
  ]);
  await run('He asks about the PPV waiting for him', { name: 'Cy', type: 'regular' }, [
    him('hey', { expect: ['chat', 'readiness_check'] }), her('made this for you', { ppv: { item: `c${explicit.id}`, price: 60, status: 'pending', speed: 'fast' } }),
    him('what is in it?', { expect: 'answer_ppv', ppv: false }), him('is it worth it? what do i get', { expect: ['answer_ppv', 'point_to_ppv'], ppv: false }), him('ok i will look later', { expect: ['point_to_ppv', 'chat', 'ease_off'], ppv: false }),
  ]);
  await run('Win-back: a buyer back after weeks asks what she has', { name: 'Dan', type: 'returning' }, [
    him('hey, been a while', { expect: 'welcome_back' }), him('got anything good for me?', { expect: ['offer', 'chat'], check: C((pl, r) => r.used.session?.aim !== 'win_back' || pl.lowest_share === 0.7, 'a win-back day: the piece at 30% off') }),
  ]);
  await run('"im 20" is not under 18', { name: 'Eli', type: 'regular' }, [
    him('im 20 btw, just turned', { expect: ['chat', 'steer_to_sale', 'review'] }),
  ]);
  await run('New subscriber swearing in Spanish', { name: 'Mike', type: 'new_sub' }, [
    him('hola puta madre', { expect: 'welcome_new', check: C((pl, r) => (r.used.level?.his || 0) === 0, 'foreign swearing is not sexual') }),
    him('I said puta madre and you said my Spanish was cool, are you dummy?', { expect: ['get_to_know', 'calm'], ppv: false }),
  ]);
  await run('An unusual request: hesitate twice, park it, he asks again', { name: 'Fox', type: 'regular' }, [
    him('would you be into feet worship? like me kissing your feet while you tell me what to do', { expect: 'request_hesitate', ppv: false }),
    him('i mean i would tip for it, you just tell me what you would do to me with your feet', { expect: 'request_hesitate', ppv: false }),
    him('so? you in?', { expect: 'request_park', ppv: false }),
    him('did you think about it?', { expect: ['chat', 'steer_to_sale', 'wind_down'], check: C(pl => pl.touch?.kind === 'still_thinking', 'he asks again: "still thinking about it"') }),
    him('my day was fine. so, the feet thing, yes or no?', { expect: ['chat', 'steer_to_sale', 'wind_down'], check: C(pl => pl.touch?.kind === 'still_thinking', 'he asks again: "still thinking about it"') }),
  ]);
  await run('New subscriber who gets sexual himself early', { name: 'Gil', type: 'new_sub' }, [
    him('hey, you look amazing', { expect: 'welcome_new' }), him('i am already hard just looking at your pics', { expect: ['tease', 'sexy_vibe'], ppv: false }),
    him('mm i want you so bad', { expect: ['tease', 'sexy_vibe'], ppv: false }), him('tell me what you would do to me', { expect: ['tease', 'sexy_vibe', 'direct_ask'], ppv: false }),
    him('fuck yes', { expect: ['direct_ask', 'tease', 'first_offer', 'offer'] }), him('show me your ass', { expect: ['first_offer', 'offer', 'after_buy'] }),
  ]);
  await run('A big spender who has not bought lately: the personal discount', { name: 'Hank', type: 'spender' }, [
    him('hey babe', { expect: ['chat', 'readiness_check'] }), him('what do you have for me tonight?', { expect: ['offer', 'readiness_check'], check: C((pl, r) => r.used.profile?.tier !== 'whale' || r.used.session?.aim !== 'sell' || !(r.used.profile.days_since_buy == null || r.used.profile.days_since_buy >= 14) || (/discount/.test(pl.price_hint || '') && Object.keys(pl.offer?.prices || {}).length > 0), 'a whale on a selling day who has not bought in 2 weeks: the 15% personal discount, priced in code') }),
  ]);
  await run('The screenshots: a new subscriber who provokes ("I love hard dicks"), then politics', { name: 'Mike', type: 'new_sub' }, [
    him('hey', { expect: 'welcome_new' }),
    him('i love hard dicks', { expect: ['curious', 'get_to_know'], ppv: false, check: C(pl => pl.goal !== 'tease', 'a surprising line from a stranger: curiosity, not a tease') }),
    him('lol relax, just messing with you. you are cute though', { expect: ['get_to_know', 'flirt', 'curious', 'chat', 'ease_off'], ppv: false }),
    him('what do you think of trump?', { expect: ['get_to_know', 'chat', 'curious', 'ease_off'], ppv: false, check: C((pl, r) => r.screen.notes?.some(x => /politic/i.test(x)) && !pl.answer_first, 'the politics note, and no "answer first"') }),
    him('and strong hard dicks', { expect: ['get_to_know', 'curious', 'chat', 'tease'], ppv: false }),
  ]);
  await run('A married man shares something heavy', { name: 'Walt', type: 'regular' }, [
    him('hey, my wife does not know i am here', { expect: ['chat', 'curious', 'steer_to_sale'], ppv: false }),
    him('she is just not into this stuff anymore, you know', { expect: ['chat', 'curious', 'comfort', 'steer_to_sale'] }),
  ]);
  console.log(`\n${turns} turns, ${flags} flagged`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
