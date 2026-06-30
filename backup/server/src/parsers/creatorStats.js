const XLSX = require('xlsx');
const { findOrCreateCreator } = require('../utils/autoMatch');

/**
 * Parse Creator Statistics report
 * One row per creator per day
 */
async function parseCreatorStats(fileBuffer, fileName, importId, orgId) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

  const sheetName = workbook.SheetNames.find(s =>
    s.toLowerCase().includes('creator') || s.toLowerCase().includes('statistic')
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  console.log(`[CreatorStats] Parsing ${rows.length} rows from sheet "${sheetName}"`);

  // Validate file type
  if (rows.length > 0) {
    const headers = Object.keys(rows[0]).map(h => h.toLowerCase());
    if (!headers.some(h => h.includes('creator')) || !headers.some(h => h.includes('earnings'))) {
      throw new Error('Wrong file type — this endpoint expects a Creator Statistics report (should have Creator, Total earnings columns)');
    }
  }

  // Check for multi-day report
  const firstDate = rows[0]?.['Date/Time Europe/Amsterdam'] || '';
  const dateMatch = String(firstDate).match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
  if (dateMatch && dateMatch[1] !== dateMatch[2]) {
    throw new Error(`Multi-day report detected (${dateMatch[1]} to ${dateMatch[2]}). Please upload single-day reports.`);
  }

  const { supabaseAdmin } = require('../utils/supabase');
  let totalInserted = 0;

  for (const row of rows) {
    try {
      const dateRaw = row['Date/Time Europe/Amsterdam'] || '';
      const reportDate = extractDate(dateRaw);
      if (!reportDate) continue;

      const creatorName = (row['Creator'] || '').trim();
      if (!creatorName) continue;

      const creatorId = await findOrCreateCreator(creatorName, orgId);

      const record = {
        import_id: importId,
        report_date: reportDate,
        creator_name: creatorName,
        creator_id: creatorId,
        subscription_net: parseDollar(row['Subscription Net']),
        new_subscriptions_net: parseDollar(row['New subscriptions Net']),
        recurring_subscriptions_net: parseDollar(row['Recurring subscriptions Net']),
        tips_net: parseDollar(row['Tips Net']),
        total_earnings_net: parseDollar(row['Total earnings Net']),
        contribution_pct: parseFloat2(row['Contribution %']),
        of_ranking: parsePercent(row['OF ranking']),
        following: safeInt(row['Following']),
        fans_renew_on: safeInt(row['Fans with renew on']),
        renew_on_pct: parseFloat2(row['Renew on %']),
        new_fans: safeInt(row['New fans']),
        active_fans: safeInt(row['Active fans']),
        expired_fan_change: safeInt(row['Change in expired fan count']),
        message_net: parseDollar(row['Message Net']),
        refund_net: parseDollar(row['Refund Net']),
        creator_group: nullDash(row['Creator group']),
        avg_spend_per_spender: parseDollar(row['Avg spend per spender Net']),
        avg_spend_per_transaction: parseDollar(row['Avg spend per transaction Net']),
        avg_earnings_per_fan: parseDollar(row['Avg earnings per fan Net']),
        avg_subscription_length_raw: nullDash(row['Avg subscription length']),
        avg_subscription_length_days: parseDays(row['Avg subscription length']),
        organisation_id: orgId,
      };

      const { error } = await supabaseAdmin
        .from('creator_daily_stats')
        .insert(record);

      if (error) {
        console.error(`[CreatorStats] Insert error for ${creatorName}:`, error.message);
      } else {
        totalInserted++;
      }
    } catch (err) {
      console.error(`[CreatorStats] Row error:`, err.message);
    }
  }

  console.log(`[CreatorStats] Inserted ${totalInserted}/${rows.length} records`);
  return { inserted: totalInserted, total: rows.length, rowCount: totalInserted };
}

// ─── Helpers ────────────────────────────────────────

function extractDate(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function parseDollar(val) {
  if (!val || val === '-') return 0;
  return parseFloat(String(val).replace(/[$,]/g, '')) || 0;
}

function parsePercent(val) {
  if (!val || val === '-') return 0;
  return parseFloat(String(val).replace(/%/g, '')) || 0;
}

function parseFloat2(val) {
  if (!val || val === '-') return 0;
  return parseFloat(String(val).replace(/[$,%]/g, '')) || 0;
}

function safeInt(val) {
  if (!val || val === '-') return 0;
  return parseInt(String(val).replace(/,/g, ''), 10) || 0;
}

function nullDash(val) {
  if (!val || String(val).trim() === '' || val === '-') return null;
  return String(val).trim();
}

/**
 * Parse "53 days" → 53
 */
function parseDays(val) {
  if (!val || val === '-') return 0;
  const match = String(val).match(/(\d+)\s*day/);
  return match ? parseInt(match[1]) : 0;
}

module.exports = { parseCreatorStats };