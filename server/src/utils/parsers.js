// Parse "$1,290.00" or "$0.00" to number
function parseDollar(val) {
  if (!val || val === '-' || val === '') return 0;
  const cleaned = String(val).replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Parse "5.78%" to number (5.78)
function parsePercent(val) {
  if (!val || val === '-' || val === '') return 0;
  const cleaned = String(val).replace('%', '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Parse "0m 39s" or "2m 45s" or "1h 5m 30s" to seconds
function parseReplayTime(val) {
  if (!val || val === '-' || val === '') return null;
  const str = String(val).trim();

  let totalSeconds = 0;
  const hours = str.match(/(\d+)h/);
  const minutes = str.match(/(\d+)m(?!s)/); // "m" not followed by "s" (to avoid "ms")
  const seconds = str.match(/(\d+)s/);

  if (hours) totalSeconds += parseInt(hours[1]) * 3600;
  if (minutes) totalSeconds += parseInt(minutes[1]) * 60;
  if (seconds) totalSeconds += parseInt(seconds[1]);

  return totalSeconds || null;
}

// Parse "8h 2min" or "0min" or "7h 55min" to minutes
function parseHoursMinutes(val) {
  if (!val || val === '-' || val === '' || val === '0min') return 0;
  const str = String(val).trim();

  let totalMinutes = 0;
  const hours = str.match(/(\d+)h/);
  const minutes = str.match(/(\d+)min/);

  if (hours) totalMinutes += parseInt(hours[1]) * 60;
  if (minutes) totalMinutes += parseInt(minutes[1]);

  return totalMinutes;
}

// Parse "53 days" to number of days
function parseDays(val) {
  if (!val || val === '-' || val === '') return 0;
  const match = String(val).match(/(\d+)\s*days?/);
  return match ? parseInt(match[1]) : 0;
}

// Parse date range "2026-05-19 00:00:00 - 2026-05-19 23:59:59" to single date
function parseDateRange(val) {
  if (!val) return null;
  const str = String(val).trim();
  // Take the first date
  const match = str.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// Parse "May 18, 2026" to "2026-05-18"
function parseTextDate(val) {
  if (!val) return null;
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

// Parse "Dragonknight (u177154572)" into { display: "Dragonknight", username: "u177154572" }
function parseSentTo(val) {
  if (!val) return { display: null, username: null, nickname: null };
  const str = String(val).trim();
  const match = str.match(/^(.*?)\s*\((\w+)\)\s*$/);
  if (match) {
    return {
      display: str,
      username: match[2],
      nickname: match[1].trim(),
    };
  }
  return { display: str, username: null, nickname: str };
}

// Strip HTML tags from message text
function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// Parse integer safely
function safeInt(val) {
  if (!val || val === '-' || val === '') return 0;
  const num = parseInt(String(val).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

// Parse float safely
function safeFloat(val) {
  if (!val || val === '-' || val === '') return 0;
  const num = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

module.exports = {
  parseDollar,
  parsePercent,
  parseReplayTime,
  parseHoursMinutes,
  parseDays,
  parseDateRange,
  parseTextDate,
  parseSentTo,
  stripHtml,
  safeInt,
  safeFloat,
};
