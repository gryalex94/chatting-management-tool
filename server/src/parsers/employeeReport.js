const XLSX = require('xlsx');
const { supabaseAdmin } = require('../utils/supabase');
const {
  parseDollar, parsePercent, parseReplayTime, parseHoursMinutes,
  parseDateRange, safeInt, safeFloat
} = require('../utils/parsers');

async function parseEmployeeReport(fileBuffer, fileName, importId, orgId) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

  let totalInserted = 0;

  // We parse the "Detailed breakdown" sheet (per chatter per creator)
  // This is our source of truth; aggregates can be computed from it
  const detailedSheetName = workbook.SheetNames.find(s =>
    s.toLowerCase().includes('detailed') || s.toLowerCase().includes('breakdown')
  ) || workbook.SheetNames[1] || workbook.SheetNames[0];

  const sheet = workbook.Sheets[detailedSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (!rows.length) {
    throw new Error('Employee report spreadsheet is empty');
  }

  console.log(`Parsing ${rows.length} rows from Employee Report (${detailedSheetName})...`);

  const BATCH_SIZE = 200;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const records = batch.map(row => {
      const reportDate = parseDateRange(row['Date/Time Europe/Amsterdam']);

      return {
        import_id: importId,
        report_date: reportDate,
        chatter_name: row['Employees'] || '',
        chatter_email: row['Email'] || null,
        creator_name: row['Creators'] || null,
        // Revenue
        sales: parseDollar(row['Sales']),
        ppv_sales: parseDollar(row['PPV sales']),
        tips: parseDollar(row['Tips']),
        dm_sales: parseDollar(row['Direct message sales']),
        // Volume
        messages_sent: safeInt(row['Direct messages sent']),
        ppvs_sent: safeInt(row['Direct PPVs sent']),
        golden_ratio: parsePercent(row['Golden ratio']),
        ppvs_unlocked: safeInt(row['PPVs unlocked']),
        unlock_rate: parsePercent(row['Unlock rate']),
        // Mass messages
        mass_msg_sales: parseDollar(row['Priority mass messages sales']),
        of_mass_msg_sales: parseDollar(row['OF mass message sales']),
        // Fan metrics
        fans_chatted: safeInt(row['Fans chatted']),
        fans_who_spent: safeInt(row['Fans who spent money']),
        fan_cvr: parsePercent(row['Fan CVR']),
        avg_earnings_per_spender: parseDollar(row['Avg earnings per fan who spent money']),
        // Quality
        character_count: safeInt(row['Character count']),
        response_time_scheduled: row['Response time (based on scheduled hours)'] || null,
        response_time_clocked: row['Response time (based on clocked hours)'] || null,
        response_time_scheduled_seconds: parseReplayTime(row['Response time (based on scheduled hours)']),
        response_time_clocked_seconds: parseReplayTime(row['Response time (based on clocked hours)']),
        // Hours
        scheduled_hours_raw: row['Scheduled hours'] || null,
        clocked_hours_raw: row['Clocked hours'] || null,
        scheduled_minutes: parseHoursMinutes(row['Scheduled hours']),
        clocked_minutes: parseHoursMinutes(row['Clocked hours']),
        // Efficiency
        sales_per_hour: parseDollar(row['Sales per hour']),
        messages_per_hour: safeFloat(row['Messages sent per hour']),
        fans_per_hour: safeFloat(row['Fans chatted per hour']),
        // Meta
        organisation_id: orgId,
      };
    });

    const { error } = await supabaseAdmin.from('employee_daily_stats').insert(records);
    if (error) {
      console.error(`Batch insert error at row ${i}:`, error.message);
      throw error;
    }

    totalInserted += records.length;
    console.log(`Inserted ${totalInserted}/${rows.length} employee stats...`);
  }

  console.log(`Employee Report parsing complete: ${totalInserted} records`);
  return { rowCount: totalInserted };
}

module.exports = { parseEmployeeReport };
