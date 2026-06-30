const XLSX = require('xlsx');
const { supabaseAdmin } = require('../utils/supabase');
const { parseReplayTime, parseTextDate, parseSentTo, stripHtml, parseDollar } = require('../utils/parsers');
const { buildLookupMaps } = require('../utils/autoMatch');

async function parseMessageDashboard(fileBuffer, fileName, importId, orgId, reportDate) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (!rows.length) throw new Error('Spreadsheet is empty');

  // Validate file type
  const headers = Object.keys(rows[0]).map(h => h.toLowerCase());
  if (!headers.some(h => h.includes('sender')) || !headers.some(h => h.includes('replay time'))) {
    throw new Error('Wrong file type — this endpoint expects a Message Dashboard report (should have Sender, Replay time columns)');
  }

  console.log(`Parsing ${rows.length} rows from Message Dashboard...`);

  console.log('Building lookup maps...');
  const { creatorMap, chatterMap } = await buildLookupMaps(rows, orgId, {
    creatorField: 'Creator',
    chatterField: 'Sender',
  });
  console.log(`Matched ${Object.keys(creatorMap).length} creators, ${Object.keys(chatterMap).length} chatters`);

  // Prevent duplicate stacking on re-upload: clear any existing messages for this
  // org on the dates present in this file, then insert fresh. Re-uploading the
  // same day now REPLACES rather than piling up triplicate rows.
  const fileDates = [...new Set(rows.map(r => parseTextDate(r['Sent date'])).filter(Boolean))];

  // Safety: the date you picked must match the date(s) inside the file, so a file
  // can never be filed under the wrong day.
  if (reportDate && fileDates.length && !fileDates.includes(reportDate)) {
    throw new Error(`Date mismatch — you picked ${reportDate}, but this file's messages are dated ${fileDates.slice(0, 3).join(', ')}${fileDates.length > 3 ? '…' : ''}. Pick the matching date, or upload the file for ${reportDate}.`);
  }

  if (fileDates.length) {
    const { error: delErr } = await supabaseAdmin
      .from('messages')
      .delete()
      .eq('organisation_id', orgId)
      .in('sent_date', fileDates);
    if (delErr) console.error('[MessageDashboard] pre-clear error:', delErr.message);
    else console.log(`[MessageDashboard] Cleared existing messages for ${fileDates.length} date(s) before re-insert`);
  }

  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const records = batch.map(row => {
      const sentTo = parseSentTo(row['Sent to']);
      const sentDate = parseTextDate(row['Sent date']);
      const sentTime = row['Sent time'] || null;
      let sentDatetime = null;
      if (sentDate && sentTime) sentDatetime = `${sentDate}T${sentTime}`;

      return {
        import_id: importId,
        sender_name: row['Sender'] || '',
        creator_name: row['Creator'] || '',
        creator_id: creatorMap[(row['Creator'] || '').trim()] || null,
        fan_message: row['Fans Message'] || null,
        creator_message: row['Creator Message'] || null,
        fan_message_text: stripHtml(row['Fans Message']),
        creator_message_text: stripHtml(row['Creator Message']),
        sent_time: sentTime,
        sent_date: sentDate,
        sent_datetime: sentDatetime,
        replay_time_raw: row['Replay time'] || null,
        replay_time_seconds: parseReplayTime(row['Replay time']),
        price: parseDollar(row['Price']),
        purchased: String(row['Purchased']).toLowerCase() === 'yes',
        source: row['Source'] || null,
        status: row['Status'] || null,
        sent_to_display: sentTo.display,
        sent_to_username: sentTo.username,
        sent_to_nickname: sentTo.nickname,
        organisation_id: orgId,
      };
    });

    const { error } = await supabaseAdmin.from('messages').insert(records);
    if (error) {
      console.error(`Batch insert error at row ${i}:`, error.message);
      throw error;
    }

    totalInserted += records.length;
    console.log(`Inserted ${totalInserted}/${rows.length} messages...`);
  }

  // Subscriber spend is maintained in the shared sales ledger. The daily
  // dashboard ADDS its sales to that ledger (deduped by fan+date+price+message),
  // so spend stays current automatically without ever overwriting the bulk
  // history imported via the dedicated sales-history importer.
  try {
    const { addDashboardSalesToLedger } = require('./subscriberSpend');
    await addDashboardSalesToLedger(orgId);
  } catch (e) {
    console.error('[MessageDashboard] ledger update skipped:', e.message);
  }
  console.log(`Message Dashboard parsing complete: ${totalInserted} records`);
  return { rowCount: totalInserted };
}

/**
 * Rebuild subscriber spend from ALL messages currently in the DB.
 *
 * Spend = sum of succeeded PPV sales (purchased=true, price>0) per username.
 * Tips are NOT counted (they are not PPV unlocks). This is computed fresh from
 * the authoritative message rows rather than accumulated, so it is fully
 * idempotent: re-uploading a day (which delete-before-inserts that day's
 * messages) recomputes the correct total instead of inflating it.
 *
 * Also maintains first_seen / last_spend_date and a derived classification.
 */
async function rebuildSubscriberSpend(orgId) {
  // Pull every PPV sale in the org (paginated).
  const sales = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('sent_to_username, sent_to_nickname, price, sent_date, sent_datetime')
      .eq('organisation_id', orgId)
      .eq('purchased', true)
      .gt('price', 0)
      .order('sent_datetime', { ascending: true })
      .range(offset, offset + 999);
    if (error) { console.error('[Subscribers] fetch error:', error.message); return; }
    if (!data?.length) break;
    sales.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Also need first-contact dates (any outbound message), to help flag new subs.
  // Aggregate per username.
  const agg = {};
  for (const s of sales) {
    if (!s.sent_to_username) continue;
    const u = s.sent_to_username;
    if (!agg[u]) agg[u] = { username: u, display_name: s.sent_to_nickname, total_spend: 0, ppv_sales: 0, first_spend: s.sent_date, last_spend: s.sent_date };
    agg[u].total_spend += parseFloat(s.price) || 0;
    agg[u].ppv_sales += parseFloat(s.price) || 0;
    if (s.sent_date && s.sent_date < agg[u].first_spend) agg[u].first_spend = s.sent_date;
    if (s.sent_date && s.sent_date > agg[u].last_spend) agg[u].last_spend = s.sent_date;
    if (s.sent_to_nickname) agg[u].display_name = s.sent_to_nickname;
  }

  const classify = (total) => total >= 1000 ? 'whale' : total >= 100 ? 'ps' : total > 0 ? 'regular' : 'unclassified';

  let written = 0;
  for (const sub of Object.values(agg)) {
    const total = Math.round(sub.total_spend * 100) / 100;
    const { data: existing } = await supabaseAdmin
      .from('subscribers')
      .select('id, first_seen')
      .eq('username', sub.username)
      .eq('organisation_id', orgId)
      .maybeSingle();

    const payload = {
      total_spend: total,                       // OVERWRITE, not accumulate
      classification: classify(total),
      display_name: sub.display_name,
      last_spend_date: sub.last_spend,
      last_seen: sub.last_spend,
    };

    if (existing) {
      await supabaseAdmin.from('subscribers').update(payload).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('subscribers').insert({
        username: sub.username, organisation_id: orgId,
        first_seen: sub.first_spend, ...payload,
      });
    }
    written++;
  }
  console.log(`[Subscribers] Rebuilt spend for ${written} fans (PPV only, recomputed from all messages)`);
}
module.exports = { parseMessageDashboard, rebuildSubscriberSpend };
