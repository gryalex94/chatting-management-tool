const { supabaseAdmin } = require('./supabase');

const _norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const slug = (s) => _norm(s).split(' ').slice(0, 6).join(' ');           // coarse signature of an issue
const shortTitle = (s) => { const t = String(s || '').trim(); return t.length > 90 ? t.slice(0, 88) + '…' : t; };

const SOURCE = { compliance: 'compliance', sales_quality: 'sales', creator: 'creator' };

const PAGE_HEALTH = ['revenue', 'ratio', 'ltv', 'churn', 'spenders', 'refunds'];

// Deterministic default tier from severity + source + area (the priority rules,
// encoded). The AI Task Manager then refines/bumps only where judgment is needed.
function defaultPriority(sev, source, area) {
  const a = (area || '').toLowerCase();
  const ph = PAGE_HEALTH.includes(a);
  if (sev === 'critical') return 1;
  if (sev === 'high') {
    if (source === 'flag' || a === 'work_ethic') return 2;
    if (a === 'sales') return 3;
    if (a === 'compliance') return 2;
    if (ph) return 6;
    if (a === 'communication') return 4;
    return 3;
  }
  if (sev === 'medium') {
    if (a === 'compliance') return 3;
    if (a === 'communication') return 4;
    if (a === 'sales' || a === 'quality') return 5;
    if (ph) return 6;
    return 5;
  }
  return ph ? 6 : 7; // low
}
const defaultCluster = (chatter, creator) =>
  chatter ? `chatter:${chatter}` : creator ? `page:${creator}` : 'general';

/**
 * Build/refresh the task queue for a day from the stored AI reports + engine flags.
 * Idempotent and cross-day aware:
 *  - same issue recurring  -> carry the existing task forward (days_open++, carried_over)
 *  - dismissed             -> stays dismissed, UNLESS it escalates to critical
 *  - completed but back    -> regression: reopen, bumped
 */
async function buildTasksForDate(orgId, reportDate) {
  // name lookups
  const [{ data: creators }, { data: chatters }] = await Promise.all([
    supabaseAdmin.from('creators').select('id, name').eq('organisation_id', orgId),
    supabaseAdmin.from('chatters').select('id, name').eq('organisation_id', orgId),
  ]);
  const creatorNameById = {}; const creatorIdByName = {};
  (creators || []).forEach(c => { creatorNameById[c.id] = c.name; creatorIdByName[_norm(c.name)] = c.id; });
  const chatterNameById = {};
  (chatters || []).forEach(c => { chatterNameById[c.id] = c.name; });

  // findings: AI report issues + engine flags
  const [{ data: evals }, { data: flags }] = await Promise.all([
    supabaseAdmin.from('chatter_evaluations')
      .select('chatter_id, creator_id, eval_type, payload')
      .eq('organisation_id', orgId).eq('report_date', reportDate),
    supabaseAdmin.from('anomaly_flags')
      .select('id, flag_type, severity, evidence, creator_id, chatter_id')
      .eq('organisation_id', orgId).eq('report_date', reportDate).neq('status', 'dismissed'),
  ]);

  const candidates = [];

  for (const ev of (evals || [])) {
    const src = SOURCE[ev.eval_type] || 'compliance';
    const issues = ev.payload?.issues || [];
    const metrics = ev.payload?.metrics || null;
    for (let i = 0; i < issues.length; i++) {
      const it = issues[i];
      const chatterId = ev.chatter_id || null;
      const creatorId = ev.creator_id || (it.creator ? creatorIdByName[_norm(it.creator)] : null) || null;
      const fan = it.fan_username || null;
      const fp = src === 'creator'
        ? `creator:cr=${creatorId || '-'}:${it.area || '-'}:${slug(it.detail)}`
        : `${ev.eval_type}:ch=${chatterId || '-'}:fan=${fan || '-'}:${it.area || '-'}:${slug(it.detail)}`;
      candidates.push({
        fingerprint: fp,
        source_type: src,
        source_ref: { eval_type: ev.eval_type, report_date: reportDate },
        creator_id: creatorId,
        creator_name: creatorId ? creatorNameById[creatorId] : (it.creator || null),
        chatter_id: chatterId,
        chatter_name: chatterId ? chatterNameById[chatterId] : null,
        fan_username: fan,
        area: it.area || null,
        severity: it.severity || 'low',
        title: shortTitle(it.detail),
        detail: it.detail || '',
        context: { message: it.message || null, sent_at: it.sent_at || null, matched_who: it.matched_who || null, fans: it.fans || [], mentions: it.mentions || [], metrics },
      });
    }
  }

  for (const f of (flags || [])) {
    const fp = `flag:${f.flag_type}:cr=${f.creator_id || '-'}:ch=${f.chatter_id || '-'}`;
    candidates.push({
      fingerprint: fp,
      source_type: 'flag',
      source_ref: { flag_id: f.id },
      creator_id: f.creator_id || null,
      creator_name: f.creator_id ? creatorNameById[f.creator_id] : null,
      chatter_id: f.chatter_id || null,
      chatter_name: f.chatter_id ? chatterNameById[f.chatter_id] : null,
      fan_username: null,
      area: 'work_ethic',
      severity: f.severity || 'medium',
      title: shortTitle((f.flag_type || '').replace(/_/g, ' ') + ' — ' + (f.evidence || '')),
      detail: f.evidence || (f.flag_type || '').replace(/_/g, ' '),
      context: { flag_type: f.flag_type },
    });
  }

  // de-dupe candidates by fingerprint (keep the most severe)
  const SEV = { critical: 0, high: 1, medium: 2, low: 3 };
  const byFp = new Map();
  for (const c of candidates) {
    const prev = byFp.get(c.fingerprint);
    if (!prev || (SEV[c.severity] ?? 9) < (SEV[prev.severity] ?? 9)) byFp.set(c.fingerprint, c);
  }
  const uniq = [...byFp.values()];
  if (!uniq.length) return { created: 0, carried: 0, reopened: 0, total_open: await countOpen(orgId) };

  // existing tasks for these fingerprints
  const fps = uniq.map(c => c.fingerprint);
  const existing = {};
  for (let i = 0; i < fps.length; i += 200) {
    const { data } = await supabaseAdmin.from('review_tasks').select('*')
      .eq('organisation_id', orgId).in('fingerprint', fps.slice(i, i + 200));
    (data || []).forEach(t => { existing[t.fingerprint] = t; });
  }

  const inserts = []; let carried = 0, reopened = 0;
  const now = new Date().toISOString();

  for (const c of uniq) {
    const ex = existing[c.fingerprint];
    if (!ex) {
      inserts.push({
        organisation_id: orgId, ...c,
        status: 'open', first_seen_date: reportDate, last_seen_date: reportDate, days_open: 1,
        priority: defaultPriority(c.severity, c.source_type, c.area),
        cluster_key: defaultCluster(c.chatter_name, c.creator_name),
      });
      continue;
    }
    if (ex.status === 'dismissed' || ex.status === 'archived') {
      // stays dismissed/archived unless it escalates to critical
      if (c.severity === 'critical' && ex.severity !== 'critical') {
        await supabaseAdmin.from('review_tasks').update({
          status: 'open', severity: 'critical', detail: c.detail, title: c.title, context: c.context,
          last_seen_date: reportDate, regressed: false, priority: 1, updated_at: now,
        }).eq('id', ex.id);
        reopened++;
      } else {
        await supabaseAdmin.from('review_tasks').update({ last_seen_date: reportDate, updated_at: now }).eq('id', ex.id);
      }
    } else if (ex.status === 'completed') {
      // regression — it came back after being fixed
      await supabaseAdmin.from('review_tasks').update({
        status: 'open', regressed: true, detail: c.detail, title: c.title, context: c.context, severity: c.severity,
        first_seen_date: reportDate, last_seen_date: reportDate, days_open: 1,
        priority: defaultPriority(c.severity, c.source_type, c.area), updated_at: now,
      }).eq('id', ex.id);
      reopened++;
    } else {
      // open or taken — carry forward
      const newDay = ex.last_seen_date !== reportDate;
      await supabaseAdmin.from('review_tasks').update({
        last_seen_date: reportDate,
        days_open: ex.days_open + (newDay ? 1 : 0),
        carried_over: ex.first_seen_date !== reportDate,
        detail: c.detail, title: c.title, context: c.context, severity: c.severity,
        priority: ex.priority ?? defaultPriority(c.severity, c.source_type, c.area),
        cluster_key: ex.cluster_key ?? defaultCluster(c.chatter_name, c.creator_name),
        updated_at: now,
      }).eq('id', ex.id);
      if (newDay) carried++;
    }
  }

  if (inserts.length) {
    for (let i = 0; i < inserts.length; i += 200) {
      const { error } = await supabaseAdmin.from('review_tasks').insert(inserts.slice(i, i + 200));
      if (error) console.error('[taskGen] insert error:', error.message);
    }
  }

  return { created: inserts.length, carried, reopened, total_open: await countOpen(orgId) };
}

async function countOpen(orgId) {
  const { count } = await supabaseAdmin.from('review_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('organisation_id', orgId).in('status', ['open', 'taken']);
  return count || 0;
}

/**
 * Deterministic backstop so the live queue can never balloon. If open+taken
 * exceeds `cap`, auto-archive the lowest-tier, oldest OPEN tasks down to the cap.
 * Never touches critical/high severity, taken (in-progress), or custom tasks —
 * so the cap may be exceeded if there are that many genuinely-serious items.
 */
async function capLiveQueue(orgId, cap = 150) {
  const { data: live } = await supabaseAdmin.from('review_tasks')
    .select('id, priority, severity, last_seen_date, source_type, status')
    .eq('organisation_id', orgId).in('status', ['open', 'taken']);
  const total = (live || []).length;
  if (total <= cap) return { archived: 0, live: total, cap };

  const archivable = (live || []).filter(t =>
    t.status === 'open' && t.source_type !== 'custom' && t.severity !== 'critical' && t.severity !== 'high');
  // least-important first: highest tier number (P7), then oldest last seen
  archivable.sort((a, b) => (b.priority || 7) - (a.priority || 7) || String(a.last_seen_date).localeCompare(String(b.last_seen_date)));
  const toArchive = archivable.slice(0, total - cap);
  const now = new Date().toISOString();
  for (let i = 0; i < toArchive.length; i += 200) {
    const ids = toArchive.slice(i, i + 200).map(t => t.id);
    await supabaseAdmin.from('review_tasks')
      .update({ status: 'archived', completed_at: now, priority_reason: 'Auto-archived: over queue cap', updated_at: now })
      .in('id', ids);
  }
  return { archived: toArchive.length, live: total - toArchive.length, cap };
}

module.exports = { buildTasksForDate, capLiveQueue };
