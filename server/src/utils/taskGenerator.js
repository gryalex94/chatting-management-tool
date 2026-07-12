const { supabaseAdmin } = require('./supabase');

const _norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const slug = (s) => _norm(s).split(' ').slice(0, 6).join(' ');           // coarse signature of an issue
const shortTitle = (s) => { const t = String(s || '').trim(); return t.length > 90 ? t.slice(0, 88) + '…' : t; };

const SOURCE = { compliance: 'compliance', sales_quality: 'sales', creator: 'creator' };

const PAGE_HEALTH = ['revenue', 'ratio', 'ltv', 'churn', 'spenders', 'refunds'];

// Compliance/ToS classes that are NEVER auto-cleared (not AI-archived, not queue-
// capped). A genuine ToS item must never be lost to backlog overflow. Mirrors the
// area vocabulary emitted by the compliance prompt in evaluateChatterDay.js.
const PROTECTED_AREAS = new Set(['tos', 'age', 'meeting', 'free_content', 'offplatform']);
// The subset that rides at the very top (serious ToS). `location` is protected too
// but ranks a notch lower (verify-against-bio, not an active breach).
const TOP_COMPLIANCE = new Set(['tos', 'age', 'meeting', 'free_content', 'offplatform']);

// Chatter tenure tiers (from join date). New chatters get a full daily deep-check;
// experienced ones only surface the serious stuff daily (the manager reviews them
// periodically, per the workflow). Dialogue tasks are gated by this; flags (reply
// time/AFK), page-health, and protected ToS items always come through.
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const TENURE_MIN_SEV = { new: 'low', learning: 'medium', experienced: 'high' };
function tenureTier(createdAt, onDate) {
  if (!createdAt) return 'experienced';                    // unknown join date → treat as light
  const days = Math.round((new Date(onDate + 'T00:00:00Z') - new Date(createdAt)) / 86400000);
  if (days <= 7) return 'new';
  if (days <= 21) return 'learning';
  return 'experienced';
}
function keepByTenure(c, tier) {
  if (c.source_type === 'flag' || c.source_type === 'creator') return true;   // apply to everyone
  if (PROTECTED_AREAS.has((c.area || '').toLowerCase())) return true;         // protected always
  const min = TENURE_MIN_SEV[tier] || 'high';
  return (SEV_RANK[c.severity] ?? 3) <= SEV_RANK[min];
}

// Deterministic default tier from severity + source + area (the priority rules,
// encoded). The AI Task Manager then refines/bumps only where judgment is needed.
function defaultPriority(sev, source, area) {
  const a = (area || '').toLowerCase();
  const ph = PAGE_HEALTH.includes(a);
  if (sev === 'critical') return 1;
  if (TOP_COMPLIANCE.has(a)) return sev === 'high' ? 2 : 3;   // protected ToS class → top
  if (sev === 'high') {
    if (source === 'flag' || a === 'work_ethic') return 2;
    if (a === 'discount') return 3;                            // only reaches here if >50% off
    if (a === 'sales') return 3;
    if (a === 'compliance') return 2;
    if (ph) return 6;
    if (a === 'communication') return 4;
    return 3;
  }
  if (sev === 'medium') {
    if (a === 'compliance') return 3;
    if (a === 'budget') return 5;
    if (a === 'communication') return 4;
    if (a === 'sales' || a === 'quality') return 5;
    if (ph) return 6;
    return 5;
  }
  return ph ? 6 : 7; // low (bare tips arrive as quality/low → 7)
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
    supabaseAdmin.from('chatters').select('id, name, created_at').eq('organisation_id', orgId),
  ]);
  const creatorNameById = {}; const creatorIdByName = {};
  (creators || []).forEach(c => { creatorNameById[c.id] = c.name; creatorIdByName[_norm(c.name)] = c.id; });
  const chatterNameById = {}; const tenureById = {};
  (chatters || []).forEach(c => { chatterNameById[c.id] = c.name; tenureById[c.id] = tenureTier(c.created_at, reportDate); });

  // findings: AI report issues + engine flags. Also load the ignore-list of
  // accounts/chatters that must never appear in reports (e.g. "Paul B").
  const [{ data: evals }, { data: flags }, ignoreSet] = await Promise.all([
    supabaseAdmin.from('chatter_evaluations')
      .select('chatter_id, creator_id, eval_type, payload')
      .eq('organisation_id', orgId).eq('report_date', reportDate),
    supabaseAdmin.from('anomaly_flags')
      .select('id, flag_type, severity, evidence, details, creator_id, chatter_id')
      .eq('organisation_id', orgId).eq('report_date', reportDate).neq('status', 'dismissed'),
    loadIgnoreSet(orgId),
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
      // carry the per-subscriber breakdown so reply-time / AFK tasks render as
      // individually-reviewable sub-rows (username, worst wait, when, message).
      context: {
        flag_type: f.flag_type,
        subs: f.details?.subs || [],
        incidents: f.details?.incidents || [],
        workload: f.details?.workload || null,
      },
    });
  }

  // drop anything tied to an ignored account/chatter (e.g. "Paul B"), then gate
  // dialogue tasks by the chatter's tenure (experienced → serious items only).
  const kept = candidates.filter(c => {
    if (ignoreSet.has(_norm(c.chatter_name)) || ignoreSet.has(_norm(c.fan_username))) return false;
    const tier = c.chatter_id ? (tenureById[c.chatter_id] || 'experienced') : 'new';
    return keepByTenure(c, tier);
  });

  // de-dupe candidates by fingerprint (keep the most severe)
  const SEV = { critical: 0, high: 1, medium: 2, low: 3 };
  const byFp = new Map();
  for (const c of kept) {
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

const shiftDays = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * PS/whale development (weekly). Finds spenders who were RECENTLY active but have
 * gone quiet, and raises ONE bundled task per page to re-engage them. Uses the
 * global `classification` (whale-anywhere), best-effort page attribution via the
 * last sale, and a hard per-page cap so it can never flood the queue.
 *   stalling = last spend in [activeDays .. quietDays) ago (default 30..14)
 */
async function buildSpenderDevelopmentTasks(orgId, reportDate, opts = {}) {
  const quietDays = opts.quietDays || 14;
  const activeDays = opts.activeDays || 30;
  const perPageCap = opts.perPageCap || 8;
  const quietCut = shiftDays(reportDate, -quietDays);
  const activeCut = shiftDays(reportDate, -activeDays);

  // all classified spenders (paginated past the 1000-row cap)
  let spenders = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabaseAdmin.from('subscribers')
      .select('username, display_name, classification, total_spend, last_spend_date')
      .eq('organisation_id', orgId).in('classification', ['ps', 'whale']).gt('total_spend', 0)
      .range(from, from + 999);
    if (!data || !data.length) break;
    spenders = spenders.concat(data);
    if (data.length < 1000) break;
  }
  const stalling = spenders.filter(s => {
    const d = s.last_spend_date ? String(s.last_spend_date).slice(0, 10) : null;
    return d && d < quietCut && d >= activeCut;              // active recently, quiet lately
  });
  if (!stalling.length) return { created: 0, updated: 0, pages: 0 };

  // best-effort page = the creator of their most recent sale
  const users = stalling.map(s => s.username);
  const pageOf = {};
  for (let i = 0; i < users.length; i += 300) {
    const { data: sales } = await supabaseAdmin.from('subscriber_sales')
      .select('username, creator_name, sale_date').in('username', users.slice(i, i + 300))
      .order('sale_date', { ascending: false });
    (sales || []).forEach(r => { if (!pageOf[r.username]) pageOf[r.username] = r.creator_name; });
  }
  const { data: creators } = await supabaseAdmin.from('creators').select('id, name').eq('organisation_id', orgId);
  const creatorIdByName = {}; (creators || []).forEach(c => { creatorIdByName[_norm(c.name)] = c.id; });

  const byPage = {};
  for (const s of stalling) { const pg = pageOf[s.username] || 'Unassigned page'; (byPage[pg] ||= []).push(s); }

  const now = new Date().toISOString();
  let created = 0, updated = 0, pages = 0;
  for (const [pg, list] of Object.entries(byPage)) {
    list.sort((a, b) =>
      (a.classification === 'whale' ? 0 : 1) - (b.classification === 'whale' ? 0 : 1) ||
      (parseFloat(b.total_spend) || 0) - (parseFloat(a.total_spend) || 0));
    const top = list.slice(0, perPageCap);
    const whales = top.filter(s => s.classification === 'whale').length;
    const creatorId = creatorIdByName[_norm(pg)] || null;
    const fans = top.map(s => ({ username: s.username, nickname: s.display_name, spend: Math.round(parseFloat(s.total_spend) || 0), classification: s.classification, last_spend: s.last_spend_date ? String(s.last_spend_date).slice(0, 10) : null }));
    const fp = `spenderdev:cr=${creatorId || _norm(pg)}`;
    const row = {
      organisation_id: orgId, source_type: 'spender_dev', fingerprint: fp,
      creator_id: creatorId, creator_name: pg, chatter_id: null, chatter_name: null,
      fan_username: null, area: 'spenders', severity: whales ? 'high' : 'medium',
      title: shortTitle(`${top.length} spender${top.length === 1 ? '' : 's'} on ${pg} have gone quiet — develop them${whales ? ` (${whales} whale${whales === 1 ? '' : 's'})` : ''}`),
      detail: `These previously-active spenders on ${pg} haven't purchased in ${quietDays}+ days (they last spent within the prior ${activeDays} days). Review their dialogues and re-engage — grow PS toward whales; drop any who are clearly done.`,
      context: { fans, quiet_days: quietDays, active_days: activeDays, total_stalling: list.length },
      priority: whales ? 3 : 5, cluster_key: `page:${pg}`, last_seen_date: reportDate,
    };
    const { data: ex } = await supabaseAdmin.from('review_tasks').select('id, status')
      .eq('organisation_id', orgId).eq('fingerprint', fp).maybeSingle();
    if (ex) {
      if (ex.status === 'open' || ex.status === 'taken') { await supabaseAdmin.from('review_tasks').update({ ...row, updated_at: now }).eq('id', ex.id); updated++; }
      // dismissed/archived/completed → leave as the manager set it this cycle
    } else {
      await supabaseAdmin.from('review_tasks').insert({ ...row, status: 'open', first_seen_date: reportDate, days_open: 1 });
      created++;
    }
    pages++;
  }
  return { created, updated, pages };
}

// Ignore-list of accounts/chatters to omit from all reports (config key
// `ignored_accounts`, comma-separated names). Returns a Set of normalised names.
async function loadIgnoreSet(orgId) {
  const { data } = await supabaseAdmin.from('daily_check_config')
    .select('value').eq('organisation_id', orgId).eq('key', 'ignored_accounts').maybeSingle();
  const raw = data?.value || '';
  return new Set(String(raw).split(',').map(s => _norm(s)).filter(Boolean));
}

/**
 * Deterministic backstop so the live queue can never balloon. If open+taken
 * exceeds `cap`, auto-archive the lowest-tier, oldest OPEN tasks down to the cap.
 * Never touches critical/high severity, taken (in-progress), or custom tasks —
 * so the cap may be exceeded if there are that many genuinely-serious items.
 */
async function capLiveQueue(orgId, cap = 150) {
  const { data: live } = await supabaseAdmin.from('review_tasks')
    .select('id, priority, severity, last_seen_date, source_type, status, area')
    .eq('organisation_id', orgId).in('status', ['open', 'taken']);
  const total = (live || []).length;
  if (total <= cap) return { archived: 0, live: total, cap };

  const archivable = (live || []).filter(t =>
    t.status === 'open' && t.source_type !== 'custom' && t.source_type !== 'spender_dev'
    && t.severity !== 'critical' && t.severity !== 'high'
    && !PROTECTED_AREAS.has((t.area || '').toLowerCase()));   // never cap protected ToS classes or PS-dev
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

/**
 * Turn ONE chatter's just-run evaluation issues into tasks in the MAIN queue —
 * used right after a manual per-chatter review (e.g. the Dialogue Strategy Review).
 * Same fingerprint carry-forward as the daily build, scoped to the chatter, and
 * WITHOUT tenure gating: the manager deliberately chose to review this chatter, so
 * every finding should surface. Issues are already enriched (fan/message/sent_at).
 */
async function buildTasksForChatterEval(orgId, reportDate, chatterId, evalType, issues) {
  if (!Array.isArray(issues) || !issues.length) return { created: 0, updated: 0 };
  const src = SOURCE[evalType] || 'sales';
  const [{ data: ch }, { data: creators }, ignoreSet] = await Promise.all([
    supabaseAdmin.from('chatters').select('name').eq('id', chatterId).maybeSingle(),
    supabaseAdmin.from('creators').select('id, name').eq('organisation_id', orgId),
    loadIgnoreSet(orgId),
  ]);
  const chatterName = ch?.name || null;
  if (ignoreSet.has(_norm(chatterName))) return { created: 0, updated: 0 };
  const creatorNameById = {}; const creatorIdByName = {};
  (creators || []).forEach(c => { creatorNameById[c.id] = c.name; creatorIdByName[_norm(c.name)] = c.id; });

  const now = new Date().toISOString();
  let created = 0, updated = 0;
  for (const it of issues) {
    const fan = it.fan_username || null;
    const creatorId = it.creator ? creatorIdByName[_norm(it.creator)] : null;
    const fp = `${evalType}:ch=${chatterId}:fan=${fan || '-'}:${it.area || '-'}:${slug(it.detail)}`;
    const row = {
      organisation_id: orgId, source_type: src, fingerprint: fp,
      creator_id: creatorId, creator_name: creatorId ? creatorNameById[creatorId] : (it.creator || null),
      chatter_id: chatterId, chatter_name: chatterName, fan_username: fan,
      area: it.area || null, severity: it.severity || 'low',
      title: shortTitle(it.detail), detail: it.detail || '',
      context: { message: it.message || null, sent_at: it.sent_at || null, fans: it.fans || [], mentions: it.mentions || [], spend: it.spend ?? null },
      last_seen_date: reportDate,
    };
    const { data: ex } = await supabaseAdmin.from('review_tasks').select('id, status')
      .eq('organisation_id', orgId).eq('fingerprint', fp).maybeSingle();
    if (!ex) {
      await supabaseAdmin.from('review_tasks').insert({
        ...row, status: 'open', first_seen_date: reportDate, days_open: 1,
        priority: defaultPriority(row.severity, src, row.area),
        cluster_key: defaultCluster(row.chatter_name, row.creator_name),
      });
      created++;
    } else if (ex.status === 'open' || ex.status === 'taken') {
      await supabaseAdmin.from('review_tasks').update({ ...row, updated_at: now }).eq('id', ex.id);
      updated++;
    }
    // dismissed / archived / completed → leave as the manager set it
  }
  return { created, updated };
}

module.exports = { buildTasksForDate, capLiveQueue, buildSpenderDevelopmentTasks, buildTasksForChatterEval };
