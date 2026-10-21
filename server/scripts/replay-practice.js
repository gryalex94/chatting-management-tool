#!/usr/bin/env node
// Replays saved practice conversations (ai_practice_runs) through the engine as it is now
// (plan only: the planner reads, code decides, no writer) and reports every turn where today's
// decision differs from the one made when the manager practised. A regression test from real chats.
//   node scripts/replay-practice.js            the 30 most recent conversations
//   node scripts/replay-practice.js 12 15      only these
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { supabaseAdmin } = require('../src/utils/supabase');
const A = require('../src/utils/aiChat');

(async () => {
  const ids = process.argv.slice(2).map(Number).filter(Boolean);
  let q = supabaseAdmin.from('ai_practice_runs').select('id, organisation_id, creator_id, title, fan_uuid, made_up, messages, turns, settings').order('updated_at', { ascending: false }).limit(ids.length ? 100 : 30);
  if (ids.length) q = q.in('id', ids);
  const { data: runs, error } = await q;
  if (error) throw new Error(error.message);
  let turns = 0, diffs = 0;
  for (const run of runs) {
    console.log(`\n=== #${run.id} ${run.title}`);
    let session = null;
    for (const t of run.turns || []) {
      const was = t.used?.plan;
      if (!was) { session = t.used?.session || session; continue; }
      const test = (run.messages || []).slice(0, t.at);
      let r;
      try {
        r = await A.reply(run.organisation_id, run.creator_id, {
          fanUuid: run.fan_uuid || null, madeUp: run.made_up || null, test, models: run.settings?.models || [], selling: run.settings?.selling !== false,
          planOnly: true, session, followUp: t.body?.follow_up || false, learned: t.body?.learned || [],
        });
      } catch (e) { console.log(`!! ${(t.used.said || []).join(' / ').slice(0, 60)} → error: ${e.message}`); diffs += 1; continue; }
      const now = r.used.plan;
      turns += 1;
      const same = was.goal === now.goal && !!was.sell?.allowed === !!now.sell?.allowed;
      if (!same) diffs += 1;
      const ppv = (p) => (p.sell?.allowed ? ' +PPV' : '');
      console.log(`${same ? '  ' : '!!'} ${t.body?.follow_up ? '(she writes first)' : (t.used.said || []).join(' / ').slice(0, 70)} → ${same ? now.goal + ppv(now) : `was ${was.goal}${ppv(was)}, now ${now.goal}${ppv(now)}: ${now.why}`}`);
      session = r.used.session || t.used.session || session;
    }
  }
  console.log(`\n${runs.length} conversation${runs.length === 1 ? '' : 's'}, ${turns} turns, ${diffs} difference${diffs === 1 ? '' : 's'}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
