const XLSX = require('xlsx');
const { supabaseAdmin } = require('../utils/supabase');
const { parseDollar, parsePercent, parseDateRange, parseDays, safeInt, safeFloat } = require('../utils/parsers');

async function parseCreatorStats(fileBuffer, fileName, importId, orgId) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0]; // "Creator Statistics"
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (!rows.length) {
    throw new Error('Creator statistics spreadsheet is empty');
  }

  console.log(`Parsing ${rows.length} rows from Creator Statistics...`);

  const records = rows.map(row => {
    const reportDate = parseDateRange(row['Date/Time Europe/Amsterdam']);

    return {
      import_id: importId,
      report_date: reportDate,
      creator_name: row['Creator'] || '',
      // Revenue
      subscription_net: parseDollar(row['Subscription Net']),
      new_subscriptions_net: parseDollar(row['New subscriptions Net']),
      recurring_subscriptions_net: parseDollar(row['Recurring subscriptions Net']),
      tips_net: parseDollar(row['Tips Net']),
      total_earnings_net: parseDollar(row['Total earnings Net']),
      contribution_pct: safeFloat(row['Contribution %']),
      // Platform
      of_ranking: parsePercent(row['OF ranking']),
      following: safeInt(row['Following']),
      // Fans
      fans_renew_on: safeInt(row['Fans with renew on']),
      renew_on_pct: safeFloat(row['Renew on %']),
      new_fans: safeInt(row['New fans']),
      active_fans: safeInt(row['Active fans']),
      expired_fan_change: safeInt(row['Change in expired fan count']),
      // Message revenue
      message_net: parseDollar(row['Message Net']),
      creator_group: row['Creator group'] || null,
      // Averages
      avg_spend_per_spender: parseDollar(row['Avg spend per spender Net']),
      avg_spend_per_transaction: parseDollar(row['Avg spend per transaction Net']),
      avg_earnings_per_fan: parseDollar(row['Avg earnings per fan Net']),
      avg_subscription_length_raw: row['Avg subscription length'] || null,
      avg_subscription_length_days: parseDays(row['Avg subscription length']),
      // Meta
      organisation_id: orgId,
    };
  });

  const { error } = await supabaseAdmin.from('creator_daily_stats').insert(records);
  if (error) {
    console.error('Creator stats insert error:', error.message);
    throw error;
  }

  console.log(`Creator Statistics parsing complete: ${records.length} records`);
  return { rowCount: records.length };
}

module.exports = { parseCreatorStats };
