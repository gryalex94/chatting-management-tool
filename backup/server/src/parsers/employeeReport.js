const XLSX = require('xlsx');
const { findOrCreateChatter, findOrCreateCreator } = require('../utils/autoMatch');

/**
 * Parse Employee Report — "By employee" sheet
 * Each row = one chatter's daily stats (may cover multiple creators)
 */
async function parseEmployeeReport(fileBuffer, fileName, importId, orgId) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

  // Find the right sheet
  // Prefer detailed per-creator breakdown, fall back to aggregated
  const sheetName = workbook.SheetNames.find(s =>
    s.toLowerCase().includes('by creator')
  ) || workbook.SheetNames.find(s =>
    s.toLowerCase().includes('employee')
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  // Validate file type
  if (rows.length > 0) {
    const headers = Object.keys(rows[0]).map(h => h.toLowerCase());
    if (!headers.some(h => h.includes('employees')) || !headers.some(h => h.includes('golden ratio'))) {
      throw new Error('Wrong file type — this endpoint expects an Employee Report (should have Employees, Golden ratio columns)');
    }
  }

  // Check if it's a multi-day report (would inflate daily metrics)
  const firstDate = rows[0]?.['Date/Time Europe/Amsterdam'] || '';
  const dateMatch = String(firstDate).match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
  if (dateMatch && dateMatch[1] !== dateMatch[2]) {
    throw new Error(`Multi-day report detected (${dateMatch[1]} to ${dateMatch[2]}). Please upload single-day reports for accurate daily metrics.`);
  }

  console.log(`[EmployeeReport] Parsing ${rows.length} rows from sheet "${sheetName}"`);

  let totalInserted = 0;
  const { supabaseAdmin } = require('../utils/supabase');

  for (const row of rows) {
    try {
      // Extract date from range like "2026-05-20 00:00:00 - 2026-05-20 23:59:59"
      const dateRaw = row['Date/Time Europe/Amsterdam'] || row['Date/Time'] || '';
      const reportDate = extractDate(dateRaw);
      if (!reportDate) {
        console.log(`[EmployeeReport] Skipping row — no date: ${dateRaw}`);
        continue;
      }

      const chatterName = (row['Employees'] || '').trim();
      const chatterEmail = (row['Email'] || '').trim();
      if (!chatterName) continue;
      // Skip rows with no creator or zero activity
      const creatorsRaw = (row['Creators'] || '').trim();
      if (!creatorsRaw) continue;

      // Resolve chatter
      const chatterId = await findOrCreateChatter(chatterName, orgId, chatterEmail);

      // Creators are comma-separated (e.g. "Tania,Leya")
      const creatorNames = creatorsRaw.split(',').map(c => c.trim()).filter(Boolean);
      
      // Resolve first creator for the record (or null)
      let creatorId = null;
      let creatorName = creatorsRaw;
      if (creatorNames.length > 0) {
        creatorId = await findOrCreateCreator(creatorNames[0], orgId);
      }

      // Parse all fields
      const record = {
        import_id: importId,
        report_date: reportDate,
        chatter_name: chatterName,
        chatter_email: chatterEmail || null,
        chatter_id: chatterId,
        creator_name: creatorName || null,
        creator_id: creatorId,
        sales: parseDollar(row['Sales']),
        ppv_sales: parseDollar(row['PPV sales']),
        tips: parseDollar(row['Tips']),
        dm_sales: parseDollar(row['Direct message sales']),
        messages_sent: safeInt(row['Direct messages sent']),
        ppvs_sent: safeInt(row['Direct PPVs sent']),
        golden_ratio: parsePercent(row['Golden ratio']),
        ppvs_unlocked: safeInt(row['PPVs unlocked']),
        unlock_rate: parsePercent(row['Unlock rate']),
        mass_msg_sales: parseDollar(row['Priority mass messages sales']),
        of_mass_msg_sales: parseDollar(row['OF mass message sales']),
        fans_chatted: safeInt(row['Fans chatted']),
        fans_who_spent: safeInt(row['Fans who spent money']),
        fan_cvr: parsePercent(row['Fan CVR']),
        avg_earnings_per_spender: parseDollar(row['Avg earnings per fan who spent money']),
        character_count: safeInt(row['Character count']),
        response_time_scheduled: nullDash(row['Response time (based on scheduled hours)']),
        response_time_clocked: nullDash(row['Response time (based on clocked hours)']),
        response_time_scheduled_seconds: parseTimeToSeconds(row['Response time (based on scheduled hours)']),
        response_time_clocked_seconds: parseTimeToSeconds(row['Response time (based on clocked hours)']),
        scheduled_hours_raw: nullDash(row['Scheduled hours']),
        clocked_hours_raw: nullDash(row['Clocked hours']),
        scheduled_minutes: parseHoursToMinutes(row['Scheduled hours']),
        clocked_minutes: parseHoursToMinutes(row['Clocked hours']),
        sales_per_hour: parseDollar(row['Sales per hour']),
        messages_per_hour: safeFloat(row['Messages sent per hour']),
        fans_per_hour: safeFloat(row['Fans chatted per hour']),
        organisation_id: orgId,
      };

      const { error } = await supabaseAdmin
        .from('employee_daily_stats')
        .insert(record);

      if (error) {
        console.error(`[EmployeeReport] Insert error for ${chatterName}:`, error.message);
      } else {
        totalInserted++;
      }
    } catch (err) {
      console.error(`[EmployeeReport] Row error:`, err.message);
    }
  }

  console.log(`[EmployeeReport] Inserted ${totalInserted}/${rows.length} records`);
  return { inserted: totalInserted, total: rows.length, rowCount: totalInserted };
}

// ─── Helpers ────────────────────────────────────────

function extractDate(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  // "2026-05-20 00:00:00 - 2026-05-20 23:59:59" → "2026-05-20"
  const match = str.match(/(\d{4}-\d{2}-\d{2})/);
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

function safeInt(val) {
  if (!val || val === '-') return 0;
  return parseInt(String(val).replace(/,/g, ''), 10) || 0;
}

function safeFloat(val) {
  if (!val || val === '-') return 0;
  return parseFloat(String(val).replace(/[$,]/g, '')) || 0;
}

function nullDash(val) {
  if (!val || val === '-') return null;
  return String(val).trim();
}

/**
 * Parse time strings → seconds
 * Formats: "2m 31s", "15m 6s", "1h 5m 30s", "45s"
 */
function parseTimeToSeconds(val) {
  if (!val || val === '-') return null;
  const str = String(val).trim();

  let total = 0;
  const hours = str.match(/(\d+)\s*h/);
  const mins = str.match(/(\d+)\s*m/);
  const secs = str.match(/(\d+)\s*s/);

  if (hours) total += parseInt(hours[1]) * 3600;
  if (mins) total += parseInt(mins[1]) * 60;
  if (secs) total += parseInt(secs[1]);

  return total > 0 ? total : null;
}

/**
 * Parse hours strings → minutes
 * Formats: "8h 12min", "0min", "7h 57min"
 */
function parseHoursToMinutes(val) {
  if (!val || val === '-' || val === '0min') return 0;
  const str = String(val).trim();

  let total = 0;
  const hours = str.match(/(\d+)\s*h/);
  const mins = str.match(/(\d+)\s*min/);

  if (hours) total += parseInt(hours[1]) * 60;
  if (mins) total += parseInt(mins[1]);

  return total;
}

module.exports = { parseEmployeeReport };