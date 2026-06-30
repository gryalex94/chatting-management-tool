const XLSX = require('xlsx');
const { findOrCreateCreator } = require('../utils/autoMatch');
const { supabaseAdmin } = require('../utils/supabase');

/**
 * Parse a Creator Statistics report (Infloww export, GROSS values).
 *
 * Design principles (per project decisions):
 *  - Accepts SINGLE-DAY or MULTI-DAY files. Multi-day files use the
 *    "Creator Statistics Detail" sheet, which has one row per creator per day.
 *    We split into per-day facts automatically — upload any date range.
 *  - Stores GROSS exactly as exported. Net is derived on read (OF 20% commission).
 *  - Idempotent: upserts on (creator_id, report_date), so re-uploading a date
 *    overwrites cleanly instead of duplicating.
 */
async function parseCreatorStats(fileBuffer, fileName, importId, orgId) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

  // Prefer the per-day "Detail" sheet; fall back to a single-period sheet.
  const detailSheet = workbook.SheetNames.find(s => /detail/i.test(s));
  const sheetName = detailSheet
    || workbook.SheetNames.find(s => /creator|statistic/i.test(s))
    || workbook.SheetNames[0];

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  console.log(`[CreatorStats] Parsing ${rows.length} rows from sheet "${sheetName}"`);

  if (rows.length) {
    const headers = Object.keys(rows[0]).map(h => h.toLowerCase());
    const hasCreator = headers.some(h => h.includes('creator'));
    const hasEarnings = headers.some(h => h.includes('earnings'));
    if (!hasCreator || !hasEarnings) {
      throw new Error('Wrong file type — expected a Creator Statistics report (Creator + earnings columns).');
    }
  }

  // Resolve every distinct creator name to an id FIRST (sequentially), so that
  // auto-creation happens once per name before we build any records. This avoids
  // a race where the same new creator is half-created mid-batch.
  const creatorIdCache = {};
  const distinctNames = [...new Set(rows.map(r => (r['Creator'] || '').trim()).filter(Boolean))];
  for (const name of distinctNames) {
    creatorIdCache[name] = await findOrCreateCreator(name, orgId);
  }

  const records = [];
  const datesSeen = new Set();

  for (const row of rows) {
    const reportDate = extractDate(row['Date/Time Europe/Amsterdam']);
    if (!reportDate) continue;                       // skip period-summary rows like "2026-06-18 - 2026-06-24"
    const creatorName = (row['Creator'] || '').trim();
    if (!creatorName) continue;

    const creatorId = creatorIdCache[creatorName];
    if (!creatorId) continue;                          // resolution failed; skip rather than collide
    datesSeen.add(reportDate);

    records.push({
      import_id: importId,
      report_date: reportDate,
      creator_name: creatorName,
      creator_id: creatorId,
      creator_group: nullDash(row['Creator group']),

      // ---- revenue (GROSS, as exported) ----
      total_subscription_gross: dollar(row['Total subscription earnings Gross']),
      subscription_gross: dollar(row['Subscription earnings Gross']),
      recurring_subscriptions_gross: dollar(row['Recurring subscription earnings Gross']),
      tips_gross: dollar(row['Tips Gross']),
      message_gross: dollar(row['Message Gross']),        // PPV / message revenue
      total_earnings_gross: dollar(row['Total earnings Gross']),
      refund_gross: dollar(row['Refunds Gross']),

      // ---- subscriber counts (OnlyFans-direct) ----
      new_subscribers: intval(row['New subscribers']),
      subscriber_renewals: intval(row['Subscriber renewals']),
      new_fans: intval(row['New subscribers']),           // alias kept for back-compat
      active_fans: intval(row['Active fans']),
      fans_renew_on: intval(row['Fans with renew on']),
      renew_on_pct: pct(row['Renew on %']),
      expired_fan_change: intval(row['Change in expired fan count']),
      number_of_spenders: intval(row['Number of spenders']),

      // ---- platform / misc ----
      contribution_pct: pct(row['Contribution %']),
      of_ranking: pct(row['OF ranking']),
      following: intval(row['Following']),
      avg_spend_per_spender_gross: dollar(row['Avg spend per spender Gross']),
      avg_spend_per_transaction_gross: dollar(row['Avg spend per transaction Gross']),
      avg_earnings_per_fan_gross: dollar(row['Avg earnings per fan Gross']),
      avg_subscription_length_raw: nullDash(row['Avg subscription length']),
      avg_subscription_length_days: days(row['Avg subscription length']),

      organisation_id: orgId,
    });
  }

  if (!records.length) {
    throw new Error('No per-day rows found. For multi-day files, ensure the "Detail" sheet is present.');
  }

  // De-duplicate by (creator_id, report_date): a single upsert batch cannot
  // touch the same target row twice. If the export has duplicate rows for the
  // same creator+day (or two names resolve to one creator), keep the last one.
  const dedup = new Map();
  for (const r of records) {
    dedup.set(`${r.creator_id}|${r.report_date}`, r);
  }
  const uniqueRecords = [...dedup.values()];
  if (uniqueRecords.length !== records.length) {
    console.log(`[CreatorStats] Collapsed ${records.length} -> ${uniqueRecords.length} rows (removed ${records.length - uniqueRecords.length} duplicate creator/day entries)`);
  }

  const BATCH = 500;
  let upserted = 0;
  for (let i = 0; i < uniqueRecords.length; i += BATCH) {
    const batch = uniqueRecords.slice(i, i + BATCH);
    const { error } = await supabaseAdmin
      .from('creator_daily_stats')
      .upsert(batch, { onConflict: 'creator_id,report_date' });
    if (error) {
      console.error(`[CreatorStats] Upsert error at ${i}:`, error.message);
      throw error;
    }
    upserted += batch.length;
  }

  const dates = [...datesSeen].sort();
  console.log(`[CreatorStats] Upserted ${upserted} rows across ${dates.length} days (${dates[0]}..${dates[dates.length - 1]})`);
  return { rowCount: upserted, days: dates.length, date_range: [dates[0], dates[dates.length - 1]] };
}

// ─── Helpers ───────────────────────────────────────────────
function extractDate(v) {
  if (!v) return null;
  const m = String(v).match(/^\s*(\d{4}-\d{2}-\d{2})\s*$/);
  return m ? m[1] : null;
}
function dollar(v) {
  if (v == null || v === '' || v === '-') return 0;
  return parseFloat(String(v).replace(/[$,]/g, '')) || 0;
}
function pct(v) {
  if (v == null || v === '' || v === '-') return 0;
  return parseFloat(String(v).replace(/[%$,]/g, '')) || 0;
}
function intval(v) {
  if (v == null || v === '' || v === '-') return 0;
  return parseInt(String(v).replace(/,/g, ''), 10) || 0;
}
function nullDash(v) {
  if (v == null || String(v).trim() === '' || v === '-') return null;
  return String(v).trim();
}
function days(v) {
  if (!v || v === '-') return 0;
  const m = String(v).match(/(\d+)\s*day/);
  return m ? parseInt(m[1], 10) : 0;
}

module.exports = { parseCreatorStats };
